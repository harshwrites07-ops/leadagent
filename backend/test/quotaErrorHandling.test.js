// Tests for the quota double-counting fix (backgroundSeeder.js runKeyBatch +
// quotaTracker.js classifyYoutubeApiError). Found live in a full-path E2E
// validation run: a single burst of rateLimitExceeded events recorded
// 60,505 "units used" against a 10,000 daily budget — the reactive catch
// block called recordKeyExhausted() directly AND (via
// markYoutubeServiceKeyExhausted -> youtubeService.markExhausted())
// indirectly for the same event, and rateLimitExceeded (a short ~100s burst
// throttle) was being treated identically to a genuine daily-quota cap.
// Run with: node --test test/quotaErrorHandling.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { initializeDatabase, getDb } = require('../src/models/database');

let quotaTracker, seeder, youtubeService;

test.before(async () => {
  await initializeDatabase();
  quotaTracker = require('../src/services/quotaTracker');
  seeder = require('../src/services/backgroundSeeder');
  youtubeService = require('../src/services/youtubeService');
});

function freshKey() { return `test-key-${crypto.randomUUID()}`; }

function mockModule(modulePath, overrides) {
  const mod = require(modulePath);
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = mod[key];
    mod[key] = overrides[key];
  }
  return () => { for (const key of Object.keys(overrides)) mod[key] = originals[key]; };
}

function youtubeError({ reason, status }) {
  const e = new Error(`simulated ${reason || status}`);
  e.response = { status, data: reason ? { error: { errors: [{ reason }] } } : {} };
  return e;
}

// ── classifyYoutubeApiError — pure function, the core of the fix ───────────

test('rateLimitExceeded is classified as rate-limit, NOT daily exhaustion', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ reason: 'rateLimitExceeded', status: 403 }));
  assert.equal(c.isRateLimit, true);
  assert.equal(c.isDailyExhaustion, false);
});

test('userRateLimitExceeded is classified as rate-limit', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ reason: 'userRateLimitExceeded', status: 403 }));
  assert.equal(c.isRateLimit, true);
  assert.equal(c.isDailyExhaustion, false);
});

test('bare HTTP 429 with no reason is classified as rate-limit', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ status: 429 }));
  assert.equal(c.isRateLimit, true);
  assert.equal(c.isDailyExhaustion, false);
});

test('quotaExceeded is classified as daily exhaustion, NOT rate-limit', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ reason: 'quotaExceeded', status: 403 }));
  assert.equal(c.isDailyExhaustion, true);
  assert.equal(c.isRateLimit, false);
});

test('dailyLimitExceeded is classified as daily exhaustion', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ reason: 'dailyLimitExceeded', status: 403 }));
  assert.equal(c.isDailyExhaustion, true);
  assert.equal(c.isRateLimit, false);
});

test('bare HTTP 403 with no reason falls back to daily exhaustion', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ status: 403 }));
  assert.equal(c.isDailyExhaustion, true);
  assert.equal(c.isRateLimit, false);
});

test('an unrelated error (e.g. 500) is neither rate-limit nor daily exhaustion', () => {
  const c = quotaTracker.classifyYoutubeApiError(youtubeError({ status: 500 }));
  assert.equal(c.isRateLimit, false);
  assert.equal(c.isDailyExhaustion, false);
});

test('isRateLimit and isDailyExhaustion are always mutually exclusive', () => {
  const cases = [
    { reason: 'rateLimitExceeded', status: 403 }, { reason: 'userRateLimitExceeded', status: 403 },
    { status: 429 }, { reason: 'quotaExceeded', status: 403 }, { reason: 'dailyLimitExceeded', status: 403 },
    { status: 403 }, { status: 500 },
  ];
  for (const c of cases) {
    const result = quotaTracker.classifyYoutubeApiError(youtubeError(c));
    assert.ok(!(result.isRateLimit && result.isDailyExhaustion), `both true for ${JSON.stringify(c)}`);
  }
});

// ── De-duplication: one exhaustion event -> exactly one quotaTracker write ──

test('DEDUP: marking a key exhausted via the single call site records the daily-budget penalty exactly once', async () => {
  const key = freshKey();
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), false);

  youtubeService.markExhausted(key); // the SINGLE call site backgroundSeeder.js now uses
  await new Promise((r) => setTimeout(r, 150)); // let the fire-and-forget write land

  const db = getDb();
  const row = await db.get('SELECT units_used FROM quota_usage WHERE api_key_hash = ?', [quotaTracker.hashKey(key)]);
  assert.equal(row.units_used, quotaTracker.QUOTA_CONSTANTS.DEFAULT_BUDGET_PER_KEY, 'expected exactly one budget-penalty write, not two');
});

// ── withRateLimitBackoff ─────────────────────────────────────────────────────

test('withRateLimitBackoff retries on rate-limit and returns the eventual success', async () => {
  let calls = 0;
  const result = await seeder.withRateLimitBackoff(async () => {
    calls++;
    if (calls < 2) throw youtubeError({ reason: 'rateLimitExceeded', status: 403 });
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('withRateLimitBackoff does NOT retry a non-rate-limit error', async () => {
  let calls = 0;
  await assert.rejects(
    seeder.withRateLimitBackoff(async () => {
      calls++;
      throw youtubeError({ reason: 'quotaExceeded', status: 403 });
    })
  );
  assert.equal(calls, 1, 'a genuine daily-exhaustion error must not be retried as if it were transient');
});

test('withRateLimitBackoff gives up after MAX_ATTEMPTS on persistent rate-limiting', async () => {
  let calls = 0;
  await assert.rejects(
    seeder.withRateLimitBackoff(async () => {
      calls++;
      throw youtubeError({ reason: 'rateLimitExceeded', status: 403 });
    })
  );
  assert.equal(calls, seeder.RATE_LIMIT_RETRY.MAX_ATTEMPTS);
});

// ── Full runKeyBatch integration — the exact scenario from the E2E run ──────

test('runKeyBatch: a persistent rateLimitExceeded burst does NOT mark the key daily-exhausted and does NOT jump quota_usage by ~20,000', async (t) => {
  const key = freshKey();
  const db = getDb();

  const restore = mockModule('axios', {
    get: async () => { throw youtubeError({ reason: 'rateLimitExceeded', status: 403 }); },
  });
  t.after(restore);

  const result = await seeder.runKeyBatch(key, ['test keyword rate limit'], db);

  assert.equal(result.exhausted, false, 'a rate-limit burst must not mark the key exhausted for the day');
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), false);

  const row = await db.get('SELECT units_used FROM quota_usage WHERE api_key_hash = ?', [quotaTracker.hashKey(key)]);
  const used = row?.units_used || 0;
  assert.ok(used < 1000, `expected no large quota penalty from a rate-limit burst, got ${used} units`);
});

test('runKeyBatch: a genuine quotaExceeded marks the key exhausted and records the penalty exactly once', async (t) => {
  const key = freshKey();
  const db = getDb();

  const restore = mockModule('axios', {
    get: async () => { throw youtubeError({ reason: 'quotaExceeded', status: 403 }); },
  });
  t.after(restore);

  const result = await seeder.runKeyBatch(key, ['test keyword daily exhaustion'], db);

  assert.equal(result.exhausted, true);
  await new Promise((r) => setTimeout(r, 150)); // fire-and-forget write inside markExhausted()

  const row = await db.get('SELECT units_used FROM quota_usage WHERE api_key_hash = ?', [quotaTracker.hashKey(key)]);
  assert.equal(row.units_used, quotaTracker.QUOTA_CONSTANTS.DEFAULT_BUDGET_PER_KEY, 'expected exactly ONE budget-penalty write (10,000), not two (20,000)');
});

test.after(() => { setImmediate(() => process.exit(0)); }); // see quotaTracker.test.js's note on initializeDatabase()'s 24h interval
