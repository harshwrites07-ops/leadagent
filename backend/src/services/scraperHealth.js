const { getDb, USE_PG } = require('../models/database');

const VALID_SCRAPERS = new Set(['innertube', 'serp_signals', 'reddit', 'twitter', 'upwork', 'ytapi']);

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
      degraded: attempted > 20 && successRate !== null && successRate < 80,
    };
  });
}

module.exports = { recordScraperHealth, getScraperHealthSummary, VALID_SCRAPERS };
