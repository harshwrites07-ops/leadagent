/**
 * YouTube Advanced Signal Service
 * Scans community posts + comments for hiring signals
 * Uses existing YouTube API keys (no extra cost)
 */

const { getDb } = require('../models/database');
const { getNextKey, markExhausted } = require('./youtubeService');

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

const COMMUNITY_HIRING_KEYWORDS = [
  'looking for', 'hiring', 'need a', 'need an', 'searching for',
  'join my team', 'editor wanted', 'designer wanted', 'help wanted',
  'paid position', 'job opportunity', 'collab', 'work with me',
  'dm me', 'apply', 'send your portfolio'
];

const COMMENT_SIGNAL_KEYWORDS = [
  'need a better editor', 'editing has gotten worse', 'production quality dropped',
  'need better thumbnails', 'hire an editor', 'get an editor',
  'you need help', 'editing is bad', 'thumbnails are bad',
  'quality has dropped', 'consistency dropped', 'post more often'
];

async function fetchWithKey(url) {
  const key = getNextKey();
  const response = await fetch(`${url}&key=${key}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason;
    const err = new Error(`HTTP ${response.status} (${reason || 'unknown'})`);
    err.quotaReason = reason;
    err.status = response.status;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded' || response.status === 429 || response.status === 403) {
      markExhausted(key);
    }
    throw err;
  }
  return response.json();
}

async function scanCommunityPosts(channelIds) {
  const db = getDb();
  let signalsFound = 0;

  for (const channelId of channelIds) {
    try {
      const data = await fetchWithKey(
        `${YT_BASE}/activities?part=snippet&channelId=${channelId}&maxResults=10`
      );

      const posts = data.items || [];

      for (const post of posts) {
        const text = (
          post.snippet?.description ||
          post.snippet?.title || ''
        ).toLowerCase();

        const hasHiringKeyword = COMMUNITY_HIRING_KEYWORDS.some(
          kw => text.includes(kw)
        );

        if (hasHiringKeyword) {
          try {
            const result = await db.run(
              `INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'youtube_community', 'confirmed_hiring', ?, ?, 0.85)`,
              [channelId, text.substring(0, 500), `https://youtube.com/channel/${channelId}/community`]
            );
            if (result.changes > 0) { signalsFound++; console.log(`[YT Community] Hiring signal found for ${channelId}`); }
          } catch (e) { console.warn(`[YT Advanced] Failed to save community signal for ${channelId}: ${e.message}`); }
        }
      }

      await new Promise(r => setTimeout(r, 200));

    } catch (e) {
      console.error(`[YT Advanced] Community scan failed for ${channelId}: ${e.message}`);
      if (e.quotaReason === 'quotaExceeded' || e.quotaReason === 'dailyLimitExceeded' || e.status === 403 || e.status === 429) {
        console.error('[YT Advanced] Quota exhausted — aborting remaining community scans for this run');
        break;
      }
    }
  }

  return signalsFound;
}

async function scanComments(channelId, videoIds) {
  const db = getDb();
  let signalsFound = 0;

  for (const videoId of videoIds.slice(0, 3)) {
    try {
      const data = await fetchWithKey(
        `${YT_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance`
      );

      const comments = data.items || [];
      let negativeSignals = 0;

      for (const comment of comments) {
        const text = comment.snippet?.topLevelComment?.snippet?.textDisplay?.toLowerCase() || '';

        const hasNegativeSignal = COMMENT_SIGNAL_KEYWORDS.some(
          kw => text.includes(kw)
        );

        if (hasNegativeSignal) negativeSignals++;
      }

      if (negativeSignals >= 3) {
        try {
          await db.run(
            `INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'youtube_comments', 'behavioral', ?, ?, 0.65)`,
            [channelId, `${negativeSignals} comments mentioning quality issues`, `https://youtube.com/watch?v=${videoId}`]
          );
          signalsFound++;
        } catch {}
      }

      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.error(`[YT Advanced] Comment scan failed for video ${videoId}: ${e.message}`);
      if (e.quotaReason === 'quotaExceeded' || e.quotaReason === 'dailyLimitExceeded' || e.status === 403 || e.status === 429) {
        console.error('[YT Advanced] Quota exhausted — aborting remaining comment scans for this run');
        break;
      }
    }
  }

  return signalsFound;
}

async function runAdvancedScan(limit = 50) {
  const db = getDb();

  const leads = await db.all(`SELECT creator_id, channel_name FROM quality_leads WHERE intent_tier = 'HOT' ORDER BY intent_score DESC LIMIT ?`, [limit]);

  if (leads.length === 0) {
    console.log('[YT Advanced] No HOT leads to scan');
    return { scanned: 0, signals: 0 };
  }

  const channelIds = leads.map(l => l.creator_id);

  console.log(`[YT Advanced] Scanning ${channelIds.length} channels...`);

  const communitySignals = await scanCommunityPosts(channelIds);

  console.log(`[YT Advanced] Found ${communitySignals} community signals`);

  return {
    scanned: channelIds.length,
    community_signals: communitySignals,
  };
}

module.exports = { runAdvancedScan, scanCommunityPosts, scanComments };
