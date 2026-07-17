const { getDb, USE_PG } = require('../models/database');

const VALID_SCRAPERS = new Set(['innertube', 'innertube_community', 'serp_signals', 'reddit', 'twitter', 'upwork', 'ytapi']);

// ── Degraded-discovery thresholds ───────────────────────────────────────────
// InnerTube functions degrade to empty results on parse failure BY DESIGN
// (reasonable for an undocumented API) — so if YouTube changes their
// internal format, nothing throws; the seeder just logs "+0 new" every
// cycle forever with no error and no operator visibility. These constants
// define exactly when that silent state counts as "degraded."
const DEGRADED_THRESHOLDS = {
  // Primary trigger: N consecutive seed cycles producing 0 new leads.
  // scraper_health has no "leads produced" column (only attempted/
  // succeeded/failed per scraper run — see the read-only ingestion audit),
  // so this is tracked separately, in-process, by recordSeedCycleOutcome().
  ZERO_LEAD_CONSECUTIVE_CYCLES: 3,
  // Once tripped, remind at most this often (in cycles) — never one log
  // line per cycle forever.
  ALERT_REMINDER_EVERY_N_CYCLES: 10,
  // Secondary/corroborating trigger, reusing the existing scraper_health
  // rows directly: a scraper's rolling success rate over this window.
  SUCCESS_RATE_ROLLING_HOURS: 24,
  SUCCESS_RATE_MIN_ATTEMPTS: 20,   // don't flag on a tiny, noisy sample
  SUCCESS_RATE_FLOOR_PCT: 80,
};

// One row per scraper run — makes silent failures loud instead of a scraper
// quietly returning 0 forever with no operator visibility (see
// AUDIT_REPORT.md §1.3 / roadmap Session 0.5).
async function recordScraperHealth(scraper, { attempted = 0, succeeded = 0, failed = 0, sampleError = null } = {}) {
  if (!VALID_SCRAPERS.has(scraper)) {
    console.warn(`[ScraperHealth] Unknown scraper tag "${scraper}" — recording anyway`);
  }
  try {
    const db = getDb();
    await db.run(
      `INSERT INTO scraper_health (scraper, run_at, attempted, succeeded, failed, sample_error) VALUES (?, ${USE_PG ? 'NOW()' : "datetime('now')"}, ?, ?, ?, ?)`,
      [scraper, attempted, succeeded, failed, sampleError ? String(sampleError).slice(0, 500) : null]
    );
  } catch (e) {
    console.error(`[ScraperHealth] Failed to record health row for "${scraper}":`, e.message);
  }
}

async function getScraperHealthSummary(hoursBack = 24) {
  const db = getDb();
  const sinceSql = USE_PG ? `NOW() - INTERVAL '${hoursBack} hours'` : `datetime('now', '-${hoursBack} hours')`;
  const rows = await db.all(
    `SELECT scraper, SUM(attempted) as attempted, SUM(succeeded) as succeeded, SUM(failed) as failed,
            MAX(run_at) as last_run_at
     FROM scraper_health WHERE run_at >= ${sinceSql} GROUP BY scraper`
  );
  return rows.map(r => {
    const attempted = r.attempted || 0;
    const succeeded = r.succeeded || 0;
    const successRate = attempted > 0 ? Math.round((succeeded / attempted) * 1000) / 10 : null;
    return {
      scraper: r.scraper,
      attempted, succeeded, failed: r.failed || 0,
      success_rate: successRate,
      last_run_at: r.last_run_at,
      degraded: attempted > DEGRADED_THRESHOLDS.SUCCESS_RATE_MIN_ATTEMPTS
        && successRate !== null && successRate < DEGRADED_THRESHOLDS.SUCCESS_RATE_FLOOR_PCT,
    };
  });
}

// ── Consecutive zero-lead-cycle alerting ────────────────────────────────────
// In-process state (not DB-persisted — a restart is a legitimate "start
// fresh" moment for this counter; the underlying scraper_health rows that
// back getScraperHealthSummary()'s secondary check remain DB-persisted
// regardless). Call once per seed cycle with how many NEW leads it produced.
let _consecutiveZeroLeadCycles = 0;
let _degradedActive = false;
let _cyclesSinceLastReminder = 0;
let _lastAlertAt = null;

// No existing generic system-notifier (webhook, Slack/Discord hook, or a
// "send to admin" email path) exists in this codebase — emailService.js /
// emailQueueService.js are wired to per-user Gmail OAuth for lead outreach,
// not an ops alert channel, so routing through them here would silently
// no-op for any admin without a connected OAuth account rather than
// reliably alerting anyone. Left as a documented, no-op extension point;
// wire a real notifier in here when one exists (see report for the
// recommended follow-up).
async function _routeThroughExistingNotifier(_message) {}

async function recordSeedCycleOutcome(newLeadsSaved) {
  if (newLeadsSaved > 0) {
    if (_degradedActive) {
      console.log(`[SCRAPER ALERT] Lead discovery recovered — +${newLeadsSaved} new leads after ${_consecutiveZeroLeadCycles} zero-lead cycle(s).`);
    }
    _consecutiveZeroLeadCycles = 0;
    _degradedActive = false;
    _cyclesSinceLastReminder = 0;
    return getScraperDegradedStatus();
  }

  _consecutiveZeroLeadCycles++;
  const tripped = _consecutiveZeroLeadCycles >= DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES;
  if (!tripped) return getScraperDegradedStatus();

  const justTripped = !_degradedActive;
  _cyclesSinceLastReminder++;
  const dueForReminder = !justTripped && _cyclesSinceLastReminder >= DEGRADED_THRESHOLDS.ALERT_REMINDER_EVERY_N_CYCLES;

  if (justTripped || dueForReminder) {
    const message = `Lead discovery degraded — 0 new leads for ${_consecutiveZeroLeadCycles} consecutive cycles. InnerTube format may have changed. Investigate.`;
    console.error(`[SCRAPER ALERT] ${message}`);
    _lastAlertAt = new Date().toISOString();
    if (dueForReminder) _cyclesSinceLastReminder = 0;
    await _routeThroughExistingNotifier(message);
  }
  _degradedActive = true;

  return getScraperDegradedStatus();
}

function getScraperDegradedStatus() {
  return {
    degraded: _degradedActive,
    consecutiveZeroLeadCycles: _consecutiveZeroLeadCycles,
    threshold: DEGRADED_THRESHOLDS.ZERO_LEAD_CONSECUTIVE_CYCLES,
    lastAlertAt: _lastAlertAt,
  };
}

// Test-only: reset in-process alert state between test cases.
function _resetDegradedStateForTests() {
  _consecutiveZeroLeadCycles = 0;
  _degradedActive = false;
  _cyclesSinceLastReminder = 0;
  _lastAlertAt = null;
}

module.exports = {
  recordScraperHealth, getScraperHealthSummary, VALID_SCRAPERS, DEGRADED_THRESHOLDS,
  recordSeedCycleOutcome, getScraperDegradedStatus, _resetDegradedStateForTests,
};
