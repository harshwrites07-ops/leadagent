const crypto = require('crypto');
const { getDb, getSetting, USE_PG } = require('../models/database');

function hashKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey || 'no-key').digest('hex').slice(0, 16);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Tracks approximate daily YouTube API unit spend per key so the tiered
// refresh worker (Session 1.4) can stop before actually hitting quota
// exhaustion, rather than only reacting after a 403 (the existing
// isQuotaExhausted() boolean in youtubeService.js is a reactive backstop —
// this is a proactive budget check on top of it).
async function incrementQuotaUsage(apiKey, units = 1) {
  const db = getDb();
  const keyHash = hashKey(apiKey);
  const date = today();
  try {
    if (USE_PG) {
      await db.run(
        `INSERT INTO quota_usage (api_key_hash, usage_date, units_used) VALUES (?, ?, ?)
         ON CONFLICT (api_key_hash, usage_date) DO UPDATE SET units_used = quota_usage.units_used + EXCLUDED.units_used`,
        [keyHash, date, units]
      );
    } else {
      await db.run(
        `INSERT INTO quota_usage (api_key_hash, usage_date, units_used) VALUES (?, ?, ?)
         ON CONFLICT (api_key_hash, usage_date) DO UPDATE SET units_used = units_used + ?`,
        [keyHash, date, units, units]
      );
    }
  } catch (e) {
    console.error('[QuotaTracker] Failed to record usage:', e.message);
  }
}

// Returns true once total usage across all configured keys reaches 80% of
// the combined daily budget (youtube_quota_budget_per_key admin setting,
// default 10000/key — YouTube's real default daily quota).
async function isBudgetNearlyExhausted(numKeys) {
  if (!numKeys || numKeys < 1) return false;
  const db = getDb();
  const budgetPerKey = parseInt(getSetting('youtube_quota_budget_per_key') || '10000');
  const totalBudget = budgetPerKey * numKeys;
  const row = await db.get(`SELECT SUM(units_used) as total FROM quota_usage WHERE usage_date = ?`, [today()]);
  const used = row?.total || 0;
  return used >= totalBudget * 0.8;
}

module.exports = { incrementQuotaUsage, isBudgetNearlyExhausted, hashKey };
