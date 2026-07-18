const crypto = require('crypto');
const { getDb, getSetting, USE_PG } = require('../models/database');

// ── Single source of truth for per-key daily YouTube API budget ────────────
// Previously THREE independent, non-communicating quota mechanisms existed:
// youtubeService.js's in-memory exhaustedKeys Set (reactive only, marks a
// key dead after a live quotaExceeded response), backgroundSeeder.js's local
// `exhausted` var inside runKeyBatch (reactive only, reset every ~30-min
// cycle — so a key exhausted in cycle 1 got silently retried in cycle 2),
// and this module (the only proactive, DB-persisted one) — but it was never
// wired into the bulk seeder, the highest-volume consumer. This module is
// now the one place daily per-key spend is recorded and checked; both
// backgroundSeeder.js and youtubeService.js read/write through it.
const QUOTA_CONSTANTS = {
  NEAR_EXHAUSTION_THRESHOLD: 0.8,     // proactively stop a key at this fraction of its daily budget
  DEFAULT_BUDGET_PER_KEY: 10000,      // YouTube's real default daily quota per project/key
};

// YouTube Data API v3 documented per-call quota costs (units) — used to
// record spend accurately instead of a flat "1 unit per call" approximation.
const QUOTA_UNIT_COSTS = {
  SEARCH_LIST: 100,   // search.list — by far the most expensive call the seeder makes
  LIST: 1,             // channels.list / videos.list / etc.
};

// ── Error classification — genuine daily exhaustion vs. a short burst limit ─
// A real bug this fixes: rateLimitExceeded (Google's short ~100-second burst
// throttle, easily triggered by a handful of concurrent requests) was being
// treated identically to quotaExceeded/dailyLimitExceeded (the hard daily
// cap) — a single burst could bench a key for the entire rest of the day
// over a transient condition that resolves in under two minutes. Confirmed
// live: one E2E validation run recorded 60,505 "units used" against a
// 10,000 daily budget from 3 rate-limit events alone.
const QUOTA_ERROR_REASONS = {
  DAILY_EXHAUSTION: new Set(['quotaExceeded', 'dailyLimitExceeded']),
  RATE_LIMIT: new Set(['rateLimitExceeded', 'userRateLimitExceeded']),
};

// Classifies a YouTube Data API error response. isDailyExhaustion and
// isRateLimit are mutually exclusive by construction (checked as an
// else-if chain) — a caller should never see both true for one error.
function classifyYoutubeApiError(e) {
  const reason = e?.response?.data?.error?.errors?.[0]?.reason || null;
  const status = e?.response?.status || null;

  if (QUOTA_ERROR_REASONS.RATE_LIMIT.has(reason) || status === 429) {
    return { isRateLimit: true, isDailyExhaustion: false, reason, status };
  }
  if (QUOTA_ERROR_REASONS.DAILY_EXHAUSTION.has(reason) || (status === 403 && !reason)) {
    return { isRateLimit: false, isDailyExhaustion: true, reason, status };
  }
  return { isRateLimit: false, isDailyExhaustion: false, reason, status };
}

function hashKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey || 'no-key').digest('hex').slice(0, 16);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getBudgetPerKey() {
  return parseInt(getSetting('youtube_quota_budget_per_key') || String(QUOTA_CONSTANTS.DEFAULT_BUDGET_PER_KEY), 10);
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

// Returns true once total usage across all configured keys reaches
// NEAR_EXHAUSTION_THRESHOLD of the combined daily budget (pool-level check —
// used by qualityLeadsService/graphCrawler, which record spend against a
// single representative key rather than per-key).
async function isBudgetNearlyExhausted(numKeys) {
  if (!numKeys || numKeys < 1) return false;
  const db = getDb();
  const totalBudget = getBudgetPerKey() * numKeys;
  const row = await db.get(`SELECT SUM(units_used) as total FROM quota_usage WHERE usage_date = ?`, [today()]);
  const used = row?.total || 0;
  return used >= totalBudget * QUOTA_CONSTANTS.NEAR_EXHAUSTION_THRESHOLD;
}

// Per-key proactive check — the piece that was missing for the bulk seeder,
// where each key runs its own independent batch of searches and needs to
// know ITS OWN remaining budget, not the pool's aggregate. Returns true once
// this specific key's recorded spend today reaches NEAR_EXHAUSTION_THRESHOLD
// of its budget.
async function isKeyBudgetNearlyExhausted(apiKey) {
  const db = getDb();
  const row = await db.get(
    `SELECT units_used FROM quota_usage WHERE api_key_hash = ? AND usage_date = ?`,
    [hashKey(apiKey), today()]
  );
  const used = row?.units_used || 0;
  return used >= getBudgetPerKey() * QUOTA_CONSTANTS.NEAR_EXHAUSTION_THRESHOLD;
}

// Called when a key is reactively discovered exhausted (a live 429/
// quotaExceeded response) so that fact is visible to every OTHER path
// reading this tracker, not just the in-memory Set in the code path that
// happened to hit the error. Records the full remaining budget as spent —
// we don't know the exact units left, but we know it's done for the day,
// so this guarantees isKeyBudgetNearlyExhausted() agrees immediately rather
// than waiting for enough proactively-tracked spend to independently cross
// the threshold.
async function recordKeyExhausted(apiKey) {
  await incrementQuotaUsage(apiKey, getBudgetPerKey());
}

module.exports = {
  incrementQuotaUsage, isBudgetNearlyExhausted, isKeyBudgetNearlyExhausted,
  recordKeyExhausted, hashKey, QUOTA_CONSTANTS, QUOTA_UNIT_COSTS,
  classifyYoutubeApiError, QUOTA_ERROR_REASONS,
};
