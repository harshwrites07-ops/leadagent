// Job-board ingestion (Session 2.2) — the highest-intent source that
// exists: a creator explicitly posting a hiring listing. Pluggable board
// drivers, all RSS-based (same shape as the existing, working Upwork
// scraper in upworkService.js). Boards are opt-in via the job_board_feed_urls
// admin setting — empty by default, nothing is scraped until a real, public,
// robots.txt-compliant feed URL is configured. No login-walled content, no
// hardcoded scrape targets baked into the code.
const https = require('https');
const { getDb, getSetting } = require('../models/database');
const { extractChannelUrl } = require('./redditSignalService');

const ROLE_KEYWORDS = {
  editor: ['video editor', 'editor needed', 'editing'],
  thumbnail: ['thumbnail designer', 'thumbnail artist', 'thumbnails'],
  scriptwriter: ['scriptwriter', 'script writer', 'youtube scriptwriter'],
  manager: ['channel manager', 'community manager', 'youtube manager'],
};

function detectRoleType(text) {
  const lower = text.toLowerCase();
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return role;
  }
  return null;
}

function fetchFeed(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Quelro job-board reader)' }, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

// Generic RSS item parser — works for any standard RSS 2.0 feed, which is
// what public job boards typically expose.
function parseRSSFeed(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const item of itemMatches) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/))?.[1] || '';
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';
    if (!title || !link) continue;
    items.push({ title: title.trim(), description: description.replace(/<[^>]*>/g, ' ').trim(), link, postedAt: pubDate });
  }
  return items;
}

// Resolves a listing to a real channel_id — via a direct YouTube link in the
// title/description when present (confident), else an innertube name search
// with the same confidence check used by graphCrawler.js (never guesses).
async function resolveChannel(db, item) {
  const fullText = `${item.title} ${item.description}`;
  const url = extractChannelUrl(fullText);
  if (url) {
    const directId = url.match(/\/channel\/([\w-]+)/)?.[1];
    if (directId) return directId;
    const handle = url.match(/\/@([\w-]+)/)?.[1] || url.match(/\/c\/([\w-]+)/)?.[1];
    if (handle) {
      const row = await db.get('SELECT channel_id FROM master_leads WHERE channel_handle = ? OR channel_handle = ?', [handle, `@${handle}`]);
      if (row?.channel_id) return row.channel_id;
      return `@${handle}`; // resolvable ref, just not in master_leads yet — pushed to discovery_queue
    }
  }

  // No direct link — try a name-based search with a confidence check.
  const nameMatch = fullText.match(/(?:for|channel|creator)[:\s]+([A-Z][\w. ]{2,40})/);
  if (!nameMatch) return null;
  try {
    const { searchChannels } = require('./innertubeService');
    const candidateName = nameMatch[1].trim();
    const results = await searchChannels(candidateName, 5);
    const match = results.find(r => r.channelId && (r.name || '').toLowerCase().includes(candidateName.toLowerCase()));
    return match?.channelId || null;
  } catch {
    return null;
  }
}

async function scanBoard(db, boardName, feedUrl) {
  let attempted = 0, succeeded = 0, failed = 0;
  const xml = await fetchFeed(feedUrl);
  if (!xml) {
    try { const { recordScraperHealth } = require('./scraperHealth'); await recordScraperHealth(`jobboard_${boardName}`, { attempted: 1, succeeded: 0, failed: 1, sampleError: 'empty response' }); } catch {}
    return { board: boardName, found: 0, resolved: 0 };
  }

  const items = parseRSSFeed(xml);
  let resolvedCount = 0;
  for (const item of items) {
    attempted++;
    const roleType = detectRoleType(`${item.title} ${item.description}`);
    if (!roleType) continue; // not a creator-hiring listing we recognize — skip, don't guess

    const existing = await db.get('SELECT id FROM job_board_listings WHERE listing_url = ?', [item.link]);
    if (existing) continue; // dedupe by listing URL

    let resolvedChannelId = null;
    try {
      resolvedChannelId = await resolveChannel(db, item);
      succeeded++;
    } catch (e) {
      failed++;
    }

    await db.run(
      `INSERT INTO job_board_listings (board, listing_url, title, role_type, channel_ref, resolved_channel_id, posted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [boardName, item.link, item.title, roleType, resolvedChannelId, resolvedChannelId, item.postedAt]
    );

    if (resolvedChannelId && resolvedChannelId.startsWith('UC')) {
      resolvedCount++;
      const inMasterLeads = await db.get('SELECT id FROM master_leads WHERE channel_id = ?', [resolvedChannelId]);
      if (inMasterLeads) {
        await db.run(
          `INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'job_board', 'confirmed_hiring', ?, ?, 0.95)`,
          [resolvedChannelId, `${boardName}: "${item.title}"`, item.link]
        );
      } else {
        // Not in the pool yet — push to discovery_queue with high priority
        // so the graph-crawler enrichment worker (Session 2.1) picks it up.
        const { queueDiscovery } = require('./graphCrawler');
        await queueDiscovery(db, { channelRef: resolvedChannelId, resolvedChannelId, seedChannelId: 'job_board', discoveryMethod: `jobboard_${boardName}` });
        await db.run(`UPDATE discovery_queue SET priority = 10 WHERE resolved_channel_id = ? AND seed_channel_id = 'job_board'`, [resolvedChannelId]);
      }
    }
    // Unresolved listings (resolvedChannelId null or a bare handle ref) are
    // still stored in job_board_listings — never fabricate a channel match,
    // just leave it for manual/later resolution.
  }

  try { const { recordScraperHealth } = require('./scraperHealth'); await recordScraperHealth(`jobboard_${boardName}`, { attempted, succeeded, failed }); } catch {}
  return { board: boardName, found: items.length, resolved: resolvedCount };
}

async function scanJobBoards() {
  const db = getDb();
  let feedUrls = {};
  try { feedUrls = JSON.parse(getSetting('job_board_feed_urls') || '{}'); } catch { feedUrls = {}; }

  const boardNames = Object.keys(feedUrls);
  if (!boardNames.length) return { skipped: true, reason: 'no job_board_feed_urls configured' };

  const results = [];
  for (const [board, url] of Object.entries(feedUrls)) {
    try { results.push(await scanBoard(db, board, url)); }
    catch (e) { console.error(`[JobBoard] Scan failed for ${board}:`, e.message); }
    await new Promise(r => setTimeout(r, 1000));
  }
  return { boards: results };
}

module.exports = { scanJobBoards, scanBoard, resolveChannel, detectRoleType, parseRSSFeed };
