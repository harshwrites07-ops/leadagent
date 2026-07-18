// Unit tests for the degraded-discovery alert (backend/src/services/scraperHealth.js).
// Run with: node --test test/scraperHealth.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  recordSeedCycleOutcome, getScraperDegradedStatus, _resetDegradedStateForTests,
  DEGRADED_THRESHOLDS,
} = require('../src/services/scraperHealth');

test.beforeEach(() => _resetDegradedStateForTests());

test('does not trip before the threshold is reached', async () => {
  for (let i = 0; i < DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES - 1; i++) {
    const status = await recordSeedCycleOutcome(0);
    assert.equal(status.degraded, false);
  }
});

test('trips exactly at the threshold — N consecutive 0-lead cycles', async () => {
  let status;
  for (let i = 0; i < DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES; i++) {
    status = await recordSeedCycleOutcome(0);
  }
  assert.equal(status.degraded, true);
  assert.equal(status.consecutiveZeroLeadCycles, DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES);
});

test('a single successful cycle resets the counter and clears degraded', async () => {
  for (let i = 0; i < DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES; i++) {
    await recordSeedCycleOutcome(0);
  }
  assert.equal(getScraperDegradedStatus().degraded, true);

  const recovered = await recordSeedCycleOutcome(3);
  assert.equal(recovered.degraded, false);
  assert.equal(recovered.consecutiveZeroLeadCycles, 0);
});

test('does not spam an alert every cycle once tripped (no reminder before the cadence)', async () => {
  // Trip it, then run several more zero-lead cycles without reaching the
  // reminder cadence — capture console.error calls to assert only ONE
  // [SCRAPER ALERT] line fired (the transition), not one per cycle.
  const originalError = console.error;
  const alerts = [];
  console.error = (...args) => { alerts.push(args.join(' ')); };
  try {
    // One cycle short of the reminder cadence: trip fires at cycle N=threshold,
    // and the reminder fires once (cyclesSinceLastReminder >= REMINDER_EVERY),
    // which happens at N = threshold + REMINDER_EVERY - 1. Stop one short of
    // that so only the trip alert should have fired.
    const cyclesToRun = DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES
      + DEGRADED_THRESHOLDS.ALERT_REMINDER_EVERY_N_CYCLES - 2;
    for (let i = 0; i < cyclesToRun; i++) {
      await recordSeedCycleOutcome(0);
    }
  } finally {
    console.error = originalError;
  }
  const scraperAlerts = alerts.filter(a => a.includes('[SCRAPER ALERT]'));
  assert.equal(scraperAlerts.length, 1, `expected exactly 1 alert line, got ${scraperAlerts.length}: ${JSON.stringify(scraperAlerts)}`);
});

test('fires a reminder once the reminder cadence is reached while still degraded', async () => {
  const originalError = console.error;
  const alerts = [];
  console.error = (...args) => { alerts.push(args.join(' ')); };
  try {
    const cyclesToRun = DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES
      + DEGRADED_THRESHOLDS.ALERT_REMINDER_EVERY_N_CYCLES;
    for (let i = 0; i < cyclesToRun; i++) {
      await recordSeedCycleOutcome(0);
    }
  } finally {
    console.error = originalError;
  }
  const scraperAlerts = alerts.filter(a => a.includes('[SCRAPER ALERT]'));
  assert.equal(scraperAlerts.length, 2, `expected trip + 1 reminder = 2 alerts, got ${scraperAlerts.length}`);
});

test('threshold lives in a named constants block, not a magic number', () => {
  assert.equal(typeof DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES, 'number');
  assert.equal(typeof DEGRADED_THRESHOLDS.ALERT_REMINDER_EVERY_N_CYCLES, 'number');
});
