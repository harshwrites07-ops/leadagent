// Unit tests for the consolidated per-key quota tracker
// (backend/src/services/quotaTracker.js) — now the single source of truth
// for daily per-key YouTube API budget, replacing three independent
// non-communicating mechanisms. Run with: node --test test/quotaTracker.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { initializeDatabase } = require('../src/models/database');

let quotaTracker;

test.before(async () => {
  // initializeDatabase() arms a real 24h setInterval (periodic
  // password_reset_tokens cleanup — pre-existing production behavior,
  // unrelated to this change) that would otherwise keep `node --test`
  // alive for a full day instead of exiting once the suite finishes.
  // Test-only: unref any interval armed during init so it can't hold the
  // process open; doesn't touch the production code path at all.
  const originalSetInterval = global.setInterval;
  global.setInterval = (...args) => originalSetInterval(...args).unref();
  try {
    await initializeDatabase();
  } finally {
    global.setInterval = originalSetInterval;
  }
  quotaTracker = require('../src/services/quotaTracker');
});

// A fresh, never-used fake key per test so tests can't pollute each other's
// usage_date row in the shared local DB.
function freshKey() {
  return `test-key-${crypto.randomUUID()}`;
}

test('a never-used key is not near its budget', async () => {
  const key = freshKey();
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), false);
});

test('incrementQuotaUsage accumulates, and the threshold trips at NEAR_EXHAUSTION_THRESHOLD of budget', async () => {
  const key = freshKey();
  const budget = quotaTracker.QUOTA_CONSTANTS.DEFAULT_BUDGET_PER_KEY;
  const justUnderThreshold = Math.floor(budget * quotaTracker.QUOTA_CONSTANTS.NEAR_EXHAUSTION_THRESHOLD) - 10;

  await quotaTracker.incrementQuotaUsage(key, justUnderThreshold);
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), false);

  await quotaTracker.incrementQuotaUsage(key, 20); // crosses the threshold
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), true);
});

test('per-key tracking is isolated — exhausting one key does not affect another', async () => {
  const keyA = freshKey();
  const keyB = freshKey();

  await quotaTracker.recordKeyExhausted(keyA);
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(keyA), true);
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(keyB), false);
});

test('recordKeyExhausted (reactive discovery) pushes a key over the threshold in one call', async () => {
  const key = freshKey();
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), false);
  await quotaTracker.recordKeyExhausted(key);
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), true);
});

test('the search.list unit cost is realistic (100 units, not a flat "1")', () => {
  assert.equal(quotaTracker.QUOTA_UNIT_COSTS.SEARCH_LIST, 100);
});

test('a single search.list-equivalent spend does not trip the threshold on its own', async () => {
  const key = freshKey();
  await quotaTracker.incrementQuotaUsage(key, quotaTracker.QUOTA_UNIT_COSTS.SEARCH_LIST);
  assert.equal(await quotaTracker.isKeyBudgetNearlyExhausted(key), false);
});

// youtubeService.markExhausted()'s write-through to quotaTracker is verified
// manually (see PR notes), not here: markExhausted() also arms a real
// 24-hour setTimeout (pre-existing production behavior, unrelated to this
// change) that would keep `node --test` alive for a full day rather than
// exiting after the suite finishes — not something to work around by
// changing that production timer just to make an automated test convenient.

test('constants live in named blocks, not magic numbers', () => {
  assert.equal(typeof quotaTracker.QUOTA_CONSTANTS.NEAR_EXHAUSTION_THRESHOLD, 'number');
  assert.equal(typeof quotaTracker.QUOTA_CONSTANTS.DEFAULT_BUDGET_PER_KEY, 'number');
  assert.equal(typeof quotaTracker.QUOTA_UNIT_COSTS.SEARCH_LIST, 'number');
  assert.equal(typeof quotaTracker.QUOTA_UNIT_COSTS.LIST, 'number');
});
