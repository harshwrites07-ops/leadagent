const { getDb, USE_PG } = require('../models/database');
const { scoreMasterLead, calculateIntentScoreWithWeights, calibrateWeights, DEFAULT_WEIGHTS } = require('./intentService');

const BATCH_SIZE = 500;
const STALE_REFRESH_LIMIT = 200; // bounded quota spend per weekly run
const STALE_AFTER_DAYS = 60;

async function calibrate() {
  const db = getDb();
  const leads = await db.all('SELECT * FROM leads LIMIT 500');
  if (leads.length < 5) {
    return { error: 'Need at least 5 leads in your leads table to calibrate', leads_count: leads.length };
  }
  return calibrateWeights(leads);
}

// A lead just BECAME S-tier — insert one hot_alerts row and fan out
// hot_alert_notifications to every user whose target_niches overlaps this
// lead's niche (or who set no niche preference at all — an honest default,
// not a fabricated match). Session 1.4.
async function createHotAlert(db, ml) {
  const alert = await db.run(
    `INSERT INTO hot_alerts (creator_id, channel_name, matched_niche, matched_service) VALUES (?, ?, ?, ?)`,
    [ml.channel_id, ml.channel_name, ml.niche || null, null]
  );
  const alertId = alert.lastID;
  if (!alertId) return;

  const users = await db.all(`SELECT id, target_niches, hot_alert_digest_enabled FROM users WHERE hot_alert_digest_enabled = 1`);
  for (const u of users) {
    let niches = [];
    try { niches = JSON.parse(u.target_niches || '[]'); } catch { niches = []; }
    const matches = niches.length === 0 || (ml.niche && niches.some(n => (n || '').toLowerCase() === (ml.niche || '').toLowerCase()));
    if (!matches) continue;
    try {
      await db.run(`INSERT INTO hot_alert_notifications (hot_alert_id, user_id) VALUES (?, ?)`, [alertId, u.id]);
    } catch {}
  }
}

async function scoreBatch(batch, weights) {
  const db = getDb();
  let hot = 0, warm = 0, cold = 0, errors = 0;

  for (const ml of batch) {
    try {
      const { intent_score, temperature, signals, meta_channel, lead_type, schedule_break, break_severity, tier } = await scoreMasterLead(ml);
      const handle = (ml.channel_handle || '').replace(/^@+/, '');
      const channelUrl = handle
        ? `https://youtube.com/@${handle}`
        : `https://youtube.com/channel/${ml.channel_id}`;

      const wasSTier = ml.tier === 'S';
      await db.run('UPDATE master_leads SET meta_channel=?, lead_type=?, schedule_break=?, break_severity=?, tier=?, last_refreshed_at=CURRENT_TIMESTAMP WHERE channel_id=?',
        [meta_channel ? 1 : 0, lead_type, schedule_break ? 1 : 0, break_severity, tier, ml.channel_id]);

      if (tier === 'S' && !wasSTier) {
        try { await createHotAlert(db, ml); } catch (e) { console.error(`[HotAlert] Failed for ${ml.channel_id}:`, e.message); }
      }

      // meta_channel rows (editing-tutorial/coaching channels) never get
      // promoted to quality_leads regardless of score — they teach/sell the
      // service, they don't buy it. See classifyMetaChannel() (Session 0.4).
      if (intent_score >= 0.50 && !meta_channel) {
        const qualTier = intent_score >= 0.75 ? 'HOT' : 'WARM';
        await db.run(`
          INSERT OR REPLACE INTO quality_leads
            (creator_id, channel_url, channel_name, channel_handle, subscriber_count, niche, email,
             intent_score, intent_tier, meta_channel, lead_type, schedule_break, break_severity, tier, last_refreshed_at,
             sig_upload_frequency, sig_view_growth, sig_title_keywords,
             sig_description_keywords, sig_engagement, sig_consistency,
             source, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,'master_pool',CURRENT_TIMESTAMP)
        `, [
          ml.channel_id, channelUrl, ml.channel_name, ml.channel_handle,
          ml.subscriber_count, ml.niche, ml.email, intent_score, qualTier,
          lead_type, schedule_break ? 1 : 0, break_severity, tier,
          signals?.niche_score || 0,
          signals?.views_score || 0,
          0,
          signals?.desc_score || signals?.description_keywords || 0,
          signals?.subs_score || 0,
          0,
        ]);
        await db.run('DELETE FROM archived_leads WHERE creator_id=?', [ml.channel_id]);
        if (qualTier === 'HOT') hot++; else warm++;
      } else {
        await db.run(`
          INSERT OR REPLACE INTO archived_leads
            (creator_id, channel_name, subscriber_count, niche, email,
             intent_score, intent_tier, archived_reason, archived_at)
          VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `, [ml.channel_id, ml.channel_name, ml.subscriber_count, ml.niche, ml.email, intent_score, 'COLD', meta_channel ? 'meta_channel' : 'below_threshold']);
        await db.run('DELETE FROM quality_leads WHERE creator_id=?', [ml.channel_id]);
        cold++;
      }
    } catch { errors++; }
  }

  return { hot, warm, cold, errors };
}

async function scoreAndPopulate(weights = DEFAULT_WEIGHTS, dryRun = false) {
  const db = getDb();
  const runId = Math.random().toString(36).slice(2, 10);

  let logId;
  if (!dryRun) {
    const r = await db.run(`INSERT INTO scraper_logs (run_id, scraper_type, status) VALUES (?, 'quality_population', 'running')`, [runId]);
    logId = r.lastID;
  }

  const totalRow = await db.get('SELECT COUNT(*) as n FROM master_leads');
  const total = totalRow.n;
  let hot = 0, warm = 0, cold = 0, errors = 0;

  let offset = 0;
  while (offset < total) {
    const batch = await db.all('SELECT * FROM master_leads LIMIT ? OFFSET ?', [BATCH_SIZE, offset]);
    if (!batch.length) break;

    if (dryRun) {
      for (const ml of batch) {
        const { intent_score, meta_channel } = await scoreMasterLead(ml);
        if (meta_channel) cold++; // meta_channel never promotes, regardless of score
        else if (intent_score >= 0.75) hot++;
        else if (intent_score >= 0.50) warm++;
        else cold++;
      }
    } else {
      const result = await scoreBatch(batch, weights);
      hot += result.hot; warm += result.warm; cold += result.cold; errors += result.errors;
    }

    offset += BATCH_SIZE;
    await new Promise(r => setImmediate(r));
  }

  if (!dryRun && logId) {
    await db.run(`
      UPDATE scraper_logs SET
        status='completed', channels_found=?, channels_scored=?,
        hot_added=?, warm_archived=?, cold_discarded=?, errors=?,
        completed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `, [total, total - errors, hot, warm, cold, errors, logId]);
  }

  return { run_id: runId, total, hot, warm, cold, errors, hot_pct: total > 0 ? Math.round((hot / total) * 100) : 0, dry_run: dryRun };
}

async function scoreNewMasterLeads() {
  const db = getDb();
  const unscored = await db.all(`
    SELECT ml.* FROM master_leads ml
    LEFT JOIN quality_leads ql ON ql.creator_id = ml.channel_id
    LEFT JOIN archived_leads al ON al.creator_id = ml.channel_id
    WHERE ql.id IS NULL AND al.id IS NULL
    LIMIT 1000
  `);
  if (!unscored.length) return { hot: 0, warm: 0, cold: 0, errors: 0, total: 0 };
  return { ...(await scoreBatch(unscored)), total: unscored.length };
}

async function getStats() {
  const db = getDb();
  const ql      = await db.get('SELECT COUNT(*) as n, MAX(created_at) as last FROM quality_leads');
  const warm    = await db.get("SELECT COUNT(*) as n FROM archived_leads WHERE intent_tier='WARM'");
  const cold    = await db.get("SELECT COUNT(*) as n FROM archived_leads WHERE intent_tier='COLD'");
  const ml      = await db.get('SELECT COUNT(*) as n FROM master_leads');
  const bs      = await db.get('SELECT COUNT(*) as n FROM buying_signals');
  const lastLog = await db.get('SELECT * FROM scraper_logs ORDER BY started_at DESC LIMIT 1');
  const byNiche = await db.all(`SELECT niche, COUNT(*) as count FROM quality_leads WHERE niche IS NOT NULL GROUP BY niche ORDER BY count DESC LIMIT 10`);
  const dailyGrowth = await db.all(`SELECT DATE(created_at) as date, COUNT(*) as added FROM quality_leads WHERE created_at >= DATE('now', '-7 days') GROUP BY DATE(created_at) ORDER BY date ASC`);
  const bySource    = await db.all(`SELECT source, COUNT(*) as count FROM quality_leads GROUP BY source ORDER BY count DESC`);
  const topLeads    = await db.all(`SELECT creator_id, channel_name, niche, subscriber_count, intent_score, intent_tier FROM quality_leads ORDER BY intent_score DESC LIMIT 10`);
  const total_scored = ql.n + warm.n + cold.n;
  return {
    quality_leads: ql.n, warm_archived: warm.n, cold_archived: cold.n, total_archived: warm.n + cold.n,
    master_leads: ml.n, buying_signals: bs.n, last_quality_lead_at: ql.last,
    coverage_pct: ml.n > 0 ? Math.round((total_scored / ml.n) * 100) : 0,
    hot_pct: total_scored > 0 ? Math.round((ql.n / total_scored) * 100) : 0,
    by_niche: byNiche, by_source: bySource, daily_growth: dailyGrowth, top_leads: topLeads, last_scraper_run: lastLog || null,
  };
}

async function getDistribution() {
  const db = getDb();
  const hot  = (await db.get("SELECT COUNT(*) as n FROM quality_leads WHERE intent_tier='HOT'")).n;
  const warm = (await db.get("SELECT COUNT(*) as n FROM quality_leads WHERE intent_tier='WARM'")).n;
  const cold = (await db.get('SELECT COUNT(*) as n FROM archived_leads')).n;
  const ml   = (await db.get('SELECT COUNT(*) as n FROM master_leads')).n;
  const total = hot + warm + cold;
  return {
    total_scored: total, total_master: ml, unscored: Math.max(0, ml - total),
    hot, warm, cold, quality_total: hot + warm,
    quality_pct: total > 0 ? Math.round(((hot + warm) / total) * 100) : 0,
    hot_pct:  total > 0 ? Math.round((hot  / total) * 100) : 0,
    warm_pct: total > 0 ? Math.round((warm / total) * 100) : 0,
    cold_pct: total > 0 ? Math.round((cold / total) * 100) : 0,
  };
}

// A lead's tier is otherwise frozen forever at first-scrape values — a channel
// scored HOT in April because it was uploading weekly stays HOT even if it goes
// dormant by July, since no other code path ever re-fetches or re-scores it.
// This samples the oldest-scraped rows, re-fetches live YouTube stats, and
// re-runs the scorer so tiers can move (including back down to COLD).
async function refreshStaleMasterLeads(limit = STALE_REFRESH_LIMIT) {
  const db = getDb();
  const { fetchVideoData, isQuotaExhausted } = require('./youtubeService');

  const staleCutoff = USE_PG ? `NOW() - INTERVAL '${STALE_AFTER_DAYS} days'` : `datetime('now', '-${STALE_AFTER_DAYS} days')`;
  const stale = await db.all(`SELECT * FROM master_leads WHERE scraped_at < ${staleCutoff} ORDER BY scraped_at ASC LIMIT ?`, [limit]);

  let refreshed = 0, goneChannels = 0, failed = 0;
  for (const ml of stale) {
    if (isQuotaExhausted()) { console.log('[Staleness] Quota exhausted — stopping refresh for this run'); break; }
    try {
      const result = await fetchVideoData(ml.channel_id);
      if (result.status === 'channel_gone') {
        goneChannels++;
        continue;
      }
      if (result.status !== 'ok') { failed++; continue; }

      await db.run(`
        UPDATE master_leads SET
          subscriber_count = ?, avg_views = ?, upload_frequency_days = ?,
          last_upload_date = COALESCE(?, last_upload_date), scraped_at = CURRENT_TIMESTAMP
        WHERE channel_id = ?
      `, [
        result.subscriberCount || ml.subscriber_count,
        Math.round(result.avgViews || 0),
        parseFloat((result.uploadFreqDays || 0).toFixed(1)),
        result.lastUploadDate, ml.channel_id,
      ]);

      const updated = await db.get('SELECT * FROM master_leads WHERE channel_id = ?', [ml.channel_id]);
      await scoreBatch([updated]);
      refreshed++;
    } catch (e) {
      failed++;
      console.warn(`[Staleness] Refresh failed for ${ml.channel_id}: ${e.message}`);
    }
    await new Promise(r => setImmediate(r));
  }

  console.log(`[Staleness] Refreshed ${refreshed}/${stale.length} stale leads (gone=${goneChannels}, failed=${failed})`);
  return { checked: stale.length, refreshed, gone: goneChannels, failed };
}

const { TIER_REFRESH_CADENCE_DAYS } = require('./intentService');
const PER_TIER_LIMIT = { S: 100, A: 100, B: 150, C: 150, D: 100 };

// Refreshes leads on a cadence proportional to their tier's value — S-tier
// (live hiring signal) gets checked daily, D-tier monthly — rather than
// every lead getting the same weekly treatment regardless of how much it
// actually matters (Session 1.4, replaces the flat refreshStaleMasterLeads
// cadence going forward; that function is kept for the existing weekly cron
// as a broader safety net over rows with no tier yet).
async function runTieredRefresh() {
  const db = getDb();
  const { fetchVideoData, isQuotaExhausted, getAllKeys } = require('./youtubeService');
  const { incrementQuotaUsage, isBudgetNearlyExhausted } = require('./quotaTracker');
  const { scanCommunityPosts } = require('./confirmedSignalService');

  const numKeys = getAllKeys().length;
  let refreshed = 0, goneChannels = 0, failed = 0, skippedBudget = 0, checked = 0;

  for (const [tier, cadenceDays] of Object.entries(TIER_REFRESH_CADENCE_DAYS)) {
    const cutoff = USE_PG ? `NOW() - INTERVAL '${cadenceDays} days'` : `datetime('now', '-${cadenceDays} days')`;
    // (last_refreshed_at IS NULL) evaluates to 0/1 in both SQLite and
    // Postgres, so ordering by it DESC portably puts never-refreshed rows first.
    const due = await db.all(
      `SELECT * FROM master_leads WHERE tier = ? AND (last_refreshed_at IS NULL OR last_refreshed_at < ${cutoff}) ORDER BY (last_refreshed_at IS NULL) DESC, last_refreshed_at ASC LIMIT ?`,
      [tier, PER_TIER_LIMIT[tier] || 100]
    );

    checked += due.length;
    for (const ml of due) {
      if (isQuotaExhausted()) { console.log(`[TieredRefresh] Quota exhausted — stopping (tier ${tier})`); return { checked, refreshed, gone: goneChannels, failed, skippedBudget }; }
      if (await isBudgetNearlyExhausted(numKeys)) {
        console.log(`[TieredRefresh] 80% of daily quota budget spent — stopping (tier ${tier})`);
        skippedBudget += due.length;
        return { checked, refreshed, gone: goneChannels, failed, skippedBudget };
      }
      try {
        const result = await fetchVideoData(ml.channel_id);
        await incrementQuotaUsage(getAllKeys()[0], 3); // approximate: channels.list + videos.list ≈ 3 units
        if (result.status === 'channel_gone') { goneChannels++; continue; }
        if (result.status !== 'ok') { failed++; continue; }

        await db.run(`
          UPDATE master_leads SET
            subscriber_count = ?, avg_views = ?, upload_frequency_days = ?,
            last_upload_date = COALESCE(?, last_upload_date), scraped_at = CURRENT_TIMESTAMP
          WHERE channel_id = ?
        `, [
          result.subscriberCount || ml.subscriber_count,
          Math.round(result.avgViews || 0),
          parseFloat((result.uploadFreqDays || 0).toFixed(1)),
          result.lastUploadDate, ml.channel_id,
        ]);

        // Community scan piggybacks on refresh (Session 1.3 point 3) — only
        // for S/A tier, where the extra InnerTube call is worth the cost.
        if (tier === 'S' || tier === 'A') {
          try { await scanCommunityPosts(ml); } catch {}
        }

        // Credit diffing (Session 2.3) — capture this refresh's video
        // descriptions and diff against the last capture round for every tier,
        // not just S/A: a vacancy/proven_buyer signal is itself what promotes
        // a D/C-tier lead upward, so gating it to S/A would make it unable to
        // ever discover a new opportunity outside the leads already flagged.
        try {
          const { captureVideoSnapshots, diffAndRecordSignals } = require('./creditDiffService');
          await captureVideoSnapshots(ml.channel_id, result.recentVideos || []);
          await diffAndRecordSignals(ml.channel_id);
        } catch {}

        const updated = await db.get('SELECT * FROM master_leads WHERE channel_id = ?', [ml.channel_id]);
        await scoreBatch([updated]);
        refreshed++;
      } catch (e) {
        failed++;
        console.warn(`[TieredRefresh] Refresh failed for ${ml.channel_id} (tier ${tier}): ${e.message}`);
      }
      await new Promise(r => setImmediate(r));
    }
  }

  console.log(`[TieredRefresh] Refreshed ${refreshed}/${checked} due leads (gone=${goneChannels}, failed=${failed}, skipped_budget=${skippedBudget})`);
  return { checked, refreshed, gone: goneChannels, failed, skippedBudget };
}

module.exports = { calibrate, scoreAndPopulate, scoreNewMasterLeads, getStats, getDistribution, refreshStaleMasterLeads, runTieredRefresh };
