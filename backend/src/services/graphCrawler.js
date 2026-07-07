// Graph-walk niche crawler (Session 2.1) — grows the pool from proven-good
// S/A-tier seeds instead of blind keyword search: featured channels, About
// links, and collab partners mentioned in video titles. Every discovery
// carries provenance (seed_channel_id, discovery_method) so an inherited
// score bump can be traced and never fabricated.
const { getDb, getSetting, USE_PG } = require('../models/database');

async function queueDiscovery(db, { channelRef, resolvedChannelId = null, seedChannelId, discoveryMethod, niche = null }) {
  if (!channelRef) return false;
  try {
    const sql = USE_PG
      ? `INSERT INTO discovery_queue (channel_ref, resolved_channel_id, seed_channel_id, discovery_method, niche) VALUES (?, ?, ?, ?, ?) ON CONFLICT (channel_ref, seed_channel_id, discovery_method) DO NOTHING`
      : `INSERT OR IGNORE INTO discovery_queue (channel_ref, resolved_channel_id, seed_channel_id, discovery_method, niche) VALUES (?, ?, ?, ?, ?)`;
    const r = await db.run(sql, [channelRef, resolvedChannelId, seedChannelId, discoveryMethod, niche]);
    return r.changes > 0;
  } catch {
    return false;
  }
}

// Discovers related channels from one S/A-tier seed and queues them —
// dedup against master_leads happens later, at enrichment time, since a
// channel_ref here might be a handle/name that hasn't been resolved to a
// real channel_id yet.
async function crawlSeed(seed) {
  const db = getDb();
  const { discoverFeaturedChannels, discoverAboutLinks, extractCollabMentions, getChannelVideos } = require('./innertubeService');
  let queued = 0;

  try {
    const featured = await discoverFeaturedChannels(seed.channel_id);
    for (const f of featured) {
      if (await queueDiscovery(db, { channelRef: f.channelId, resolvedChannelId: f.channelId, seedChannelId: seed.channel_id, discoveryMethod: 'featured_channel', niche: seed.niche })) queued++;
    }
  } catch {}

  try {
    const aboutLinks = await discoverAboutLinks(seed.channel_id);
    for (const link of aboutLinks) {
      const resolved = link.ref?.startsWith('UC') ? link.ref : null;
      if (await queueDiscovery(db, { channelRef: link.ref, resolvedChannelId: resolved, seedChannelId: seed.channel_id, discoveryMethod: 'about_link', niche: seed.niche })) queued++;
    }
  } catch {}

  try {
    const videos = await getChannelVideos(seed.channel_id);
    const mentions = extractCollabMentions(videos);
    for (const m of mentions) {
      if (await queueDiscovery(db, { channelRef: m, seedChannelId: seed.channel_id, discoveryMethod: 'collab_mention', niche: seed.niche })) queued++;
    }
  } catch {}

  return queued;
}

// Runs discovery from a bounded batch of S/A-tier seeds. Off by default —
// requires the graph_crawl_enabled admin setting.
async function runGraphCrawl(seedLimit = 20) {
  const db = getDb();
  if (getSetting('graph_crawl_enabled') !== 'true') return { skipped: true, reason: 'graph_crawl_enabled is not true' };

  const seeds = await db.all(`SELECT channel_id, niche FROM master_leads WHERE tier IN ('S', 'A') ORDER BY last_refreshed_at ASC NULLS FIRST LIMIT ?`.replace(' NULLS FIRST', ''), [seedLimit])
    .catch(() => db.all(`SELECT channel_id, niche FROM master_leads WHERE tier IN ('S', 'A') ORDER BY (last_refreshed_at IS NULL) DESC, last_refreshed_at ASC LIMIT ?`, [seedLimit]));

  let totalQueued = 0;
  for (const seed of seeds) {
    // Re-checked every iteration (not just at the top of the function) so
    // flipping the kill switch off actually stops a run already in progress.
    if (getSetting('graph_crawl_enabled') !== 'true') { console.log('[GraphCrawler] Kill switch flipped off mid-run — stopping'); break; }
    try { totalQueued += await crawlSeed(seed); }
    catch (e) { console.warn(`[GraphCrawler] Seed ${seed.channel_id} failed: ${e.message}`); }
  }
  console.log(`[GraphCrawler] Crawled ${seeds.length} seeds, queued ${totalQueued} discoveries`);
  return { seeds: seeds.length, queued: totalQueued };
}

// Drains discovery_queue: resolves a handle/name ref to a real channel_id
// when needed, dedupes against master_leads (unique channel_id index) and
// discovery_queue itself, applies the quality floor (subs range, active
// within 90 days, not meta_channel), and inserts qualifying channels into
// master_leads with provenance recorded — never fabricating a signal the
// lead doesn't actually have; the "inherited score" is logged as
// provenance metadata only, not injected into the scoring signals.
async function drainDiscoveryQueue(limit = 100) {
  const db = getDb();
  const { searchChannels, buildChannelProfile } = require('./innertubeService');
  const { classifyMetaChannel } = require('./intentService');
  const { isBudgetNearlyExhausted } = require('./quotaTracker');
  const { getAllKeys } = require('./youtubeService');

  const dailyCap = parseInt(getSetting('graph_crawl_daily_cap') || '200');
  const minSubs = parseInt(getSetting('graph_crawl_min_subs') || '1000');
  const maxSubs = parseInt(getSetting('graph_crawl_max_subs') || '500000');
  let nicheCaps = {};
  try { nicheCaps = JSON.parse(getSetting('graph_crawl_niche_caps') || '{}'); } catch { nicheCaps = {}; }
  const nicheEnrichedToday = {};

  const pending = await db.all(`SELECT * FROM discovery_queue WHERE status = 'pending' ORDER BY discovered_at ASC LIMIT ?`, [Math.min(limit, dailyCap)]);

  let enriched = 0, rejected = 0, duplicate = 0;
  const numKeys = getAllKeys().length;

  for (const item of pending) {
    if (getSetting('graph_crawl_enabled') !== 'true') { console.log('[GraphCrawler] Kill switch flipped off mid-run — stopping drain'); break; }
    if (await isBudgetNearlyExhausted(numKeys)) {
      console.log('[GraphCrawler] 80% of daily quota budget spent — stopping drain');
      break;
    }

    const cap = item.niche ? nicheCaps[item.niche] : null;
    if (cap && (nicheEnrichedToday[item.niche] || 0) >= cap) {
      await db.run(`UPDATE discovery_queue SET status='rejected', reject_reason='niche_cap', enriched_at=CURRENT_TIMESTAMP WHERE id=?`, [item.id]);
      rejected++;
      continue;
    }

    try {
      let channelId = item.resolved_channel_id;
      let basic = null;

      if (!channelId) {
        // channel_ref is a handle/name, not a real channel_id — resolve via
        // search with a confidence check, never just taking the top result.
        // A bare "@handle" mention must match the candidate's handle exactly;
        // a free-text name (collab mention) must appear in the candidate's
        // channel name. Anything else is left unresolved rather than guessed.
        const results = await searchChannels(item.channel_ref, 5);
        const refLower = item.channel_ref.toLowerCase();
        const isHandle = refLower.startsWith('@');
        const match = results.find(r => {
          if (!r.channelId) return false;
          if (isHandle) return (r.handle || '').toLowerCase().includes(refLower.replace(/^@/, ''));
          return (r.name || '').toLowerCase().includes(refLower);
        });
        if (!match) {
          await db.run(`UPDATE discovery_queue SET status='rejected', reject_reason='unresolved', enriched_at=CURRENT_TIMESTAMP WHERE id=?`, [item.id]);
          rejected++;
          continue;
        }
        channelId = match.channelId;
        basic = match;
      }

      const existing = await db.get('SELECT id FROM master_leads WHERE channel_id = ?', [channelId]);
      if (existing) {
        await db.run(`UPDATE discovery_queue SET status='duplicate', resolved_channel_id=?, enriched_at=CURRENT_TIMESTAMP WHERE id=?`, [channelId, item.id]);
        duplicate++;
        continue;
      }

      const profile = await buildChannelProfile(basic || { channelId }, {});
      const subs = profile.subscriberCount || profile.subscriber_count || 0;
      const daysSinceUpload = profile.last_upload_date
        ? Math.floor((Date.now() - new Date(profile.last_upload_date).getTime()) / 86400000)
        : null;
      const isActive = daysSinceUpload === null ? true : daysSinceUpload <= 90;
      const isMeta = classifyMetaChannel({ channel_description: profile.channel_description || profile.description || '' }, []);

      if (subs < minSubs || subs > maxSubs || !isActive || isMeta) {
        const reason = subs < minSubs || subs > maxSubs ? 'subs_out_of_range' : !isActive ? 'inactive' : 'meta_channel';
        await db.run(`UPDATE discovery_queue SET status='rejected', resolved_channel_id=?, reject_reason=?, enriched_at=CURRENT_TIMESTAMP WHERE id=?`, [channelId, reason, item.id]);
        rejected++;
        continue;
      }

      await db.run(`
        INSERT INTO master_leads (channel_id, channel_name, channel_handle, subscriber_count, avg_views, email, website, channel_description, niche)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING
      `, [
        channelId, profile.channel_name || profile.channelName || item.channel_ref, profile.channel_handle || profile.handle || null,
        subs, profile.avg_views || 0, profile.email || null, profile.website || null,
        profile.channel_description || profile.description || null, item.niche,
      ]);

      await db.run(`UPDATE discovery_queue SET status='enriched', resolved_channel_id=?, enriched_at=CURRENT_TIMESTAMP WHERE id=?`, [channelId, item.id]);
      enriched++;
      if (item.niche) nicheEnrichedToday[item.niche] = (nicheEnrichedToday[item.niche] || 0) + 1;
    } catch (e) {
      console.warn(`[GraphCrawler] Enrichment failed for discovery ${item.id}: ${e.message}`);
      try { await db.run(`UPDATE discovery_queue SET status='rejected', reject_reason=?, enriched_at=CURRENT_TIMESTAMP WHERE id=?`, [e.message.slice(0, 200), item.id]); } catch {}
      rejected++;
    }
  }

  console.log(`[GraphCrawler] Drained ${pending.length} discoveries — enriched=${enriched} rejected=${rejected} duplicate=${duplicate}`);
  return { total: pending.length, enriched, rejected, duplicate };
}

async function getGraphCrawlStats(daysBack = 7) {
  const db = getDb();
  const sinceSql = USE_PG ? `NOW() - INTERVAL '${daysBack} days'` : `datetime('now', '-${daysBack} days')`;
  const byStatus = await db.all(`SELECT status, COUNT(*) as count FROM discovery_queue WHERE discovered_at >= ${sinceSql} GROUP BY status`);
  const byDay = await db.all(`
    SELECT ${USE_PG ? "discovered_at::date" : "DATE(discovered_at)"} as day, COUNT(*) as discovered,
      SUM(CASE WHEN status='enriched' THEN 1 ELSE 0 END) as enriched
    FROM discovery_queue WHERE discovered_at >= ${sinceSql}
    GROUP BY day ORDER BY day DESC
  `);
  return { by_status: byStatus, by_day: byDay };
}

module.exports = { crawlSeed, runGraphCrawl, drainDiscoveryQueue, getGraphCrawlStats, queueDiscovery };
