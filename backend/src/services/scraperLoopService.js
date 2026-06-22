/**
 * 24/7 quality-first scraper loop
 * Runs every 2 hours:
 *   1. Scans Reddit for buying signals
 *   2. Scores any new master_leads (incremental)
 */

const { getDb } = require('../models/database');
const { scanSubreddits } = require('./redditSignalService');
const { scoreNewMasterLeads, getDistribution } = require('./qualityLeadsService');
const { scanUpworkJobs } = require('./upworkService');
const { scanTwitterSignals } = require('./twitterSignalService');
const { runAdvancedScan } = require('./youtubeAdvancedService');
const { runConfirmedSignalScan } = require('./confirmedSignalService');
const { syncUsersToTurso, syncQualityLeadsToTurso, pushUserLeadsToTurso } = require('./tursoSync');

const INTERVAL_MS = 2 * 60 * 60 * 1000;

const NICHE_TIERS = {
  1: { niches: ['finance', 'business', 'education', 'tech'], min_subs: 5000, label: 'Finance/Business/Education/Tech' },
  2: { niches: ['fitness', 'gaming'], min_subs: 10000, label: 'Fitness/Gaming' },
  3: { niches: ['vlogging', 'travel', 'cooking', 'lifestyle'], min_subs: 25000, label: 'Vlogging/Travel/Lifestyle' },
};

let loopActive = false;
let loopTimer = null;
let cycleCount = 0;

const status = {
  running: false,
  started_at: null,
  last_cycle_at: null,
  next_cycle_at: null,
  total_cycles: 0,
  hot_added_total: 0,
  reddit_signals_total: 0,
  errors: [],
};

async function runOneCycle() {
  if (status.running) {
    console.log('[QualityLoop] Cycle already running — skipping');
    return;
  }

  status.running = true;
  status.last_cycle_at = new Date().toISOString();
  cycleCount++;

  const db = getDb();
  const runId = `cycle-${cycleCount}-${Date.now()}`;
  let logId;

  try {
    const logRow = await db.run(
      `INSERT INTO scraper_logs (run_id, scraper_type, status) VALUES (?, 'quality_loop', 'running')`,
      [runId]
    );
    logId = logRow.lastID;

    console.log('[QualityLoop] Scanning Reddit...');
    let redditResult = { found: 0, saved: 0, errors: [] };
    try {
      redditResult = await scanSubreddits();
      status.reddit_signals_total += redditResult.saved;
      console.log(`[QualityLoop] Reddit: scanned=${redditResult.scanned} found=${redditResult.found} saved=${redditResult.saved}`);
    } catch (e) {
      console.error('[QualityLoop] Reddit scan failed:', e.message);
      status.errors.push({ time: new Date().toISOString(), step: 'reddit', error: e.message });
    }

    console.log('[Loop] Scanning Upwork jobs...');
    try {
      const upworkResult = await scanUpworkJobs();
      console.log(`[Loop] Upwork: ${upworkResult.new_jobs} new hiring signals found`);
    } catch (e) { console.log(`[Loop] Upwork scan error: ${e.message}`); }

    if (cycleCount % 2 === 0) {
      console.log('[Loop] Scanning Twitter signals...');
      try {
        const twitterResult = await scanTwitterSignals();
        console.log(`[Loop] Twitter: ${twitterResult.new_signals || 0} new signals found`);
      } catch (e) { console.log(`[Loop] Twitter scan error: ${e.message}`); }
    }

    if (cycleCount % 3 === 0) {
      console.log('[Loop] Running YouTube advanced scan...');
      try {
        const ytResult = await runAdvancedScan(30);
        console.log(`[Loop] YT Advanced: ${ytResult.community_signals} community signals found`);
      } catch (e) { console.log(`[Loop] YT advanced scan error: ${e.message}`); }
    }

    console.log('[Loop] Running confirmed signal scan...');
    try {
      const confirmedResult = await runConfirmedSignalScan();
      console.log(`[Loop] Confirmed signals: ${confirmedResult.description_scan?.confirmed || 0} description hits, ${confirmedResult.total_confirmed_signals || 0} total confirmed`);
    } catch (e) { console.log(`[Loop] Confirmed signal scan error: ${e.message}`); }

    if (cycleCount % 6 === 0) {
      console.log('[Loop] Running Turso backup...');
      try {
        await syncUsersToTurso(db);
        await syncQualityLeadsToTurso(db);
        await pushUserLeadsToTurso(db);
        console.log('[Loop] Turso backup complete');
      } catch (e) { console.log(`[Loop] Turso backup error: ${e.message}`); }
    }

    console.log('[QualityLoop] Scoring new master_leads...');
    const scoreResult = await scoreNewMasterLeads();
    status.hot_added_total += scoreResult.hot;
    console.log(`[QualityLoop] Scored: total=${scoreResult.total} hot=${scoreResult.hot} warm=${scoreResult.warm} cold=${scoreResult.cold}`);

    if (scoreResult.hot > 0) {
      syncQualityLeadsToTurso(db).catch(e => console.log(`[Loop] Quality leads Turso push error: ${e.message}`));
    }

    const dist = await getDistribution();
    console.log(`[QualityLoop] DB state: quality_leads=${dist.hot} (${dist.hot_pct}%) warm=${dist.warm} cold=${dist.cold}`);

    if (logId) {
      await db.run(`
        UPDATE scraper_logs SET
          status='completed',
          channels_found=?, channels_scored=?,
          hot_added=?, warm_archived=?, cold_discarded=?,
          errors=?, error_log=?, completed_at=CURRENT_TIMESTAMP
        WHERE id=?
      `, [
        scoreResult.total, scoreResult.total - scoreResult.errors,
        scoreResult.hot, scoreResult.warm, scoreResult.cold,
        redditResult.errors.length, JSON.stringify(redditResult.errors.slice(0, 10)),
        logId,
      ]);
    }

  } catch (e) {
    console.error('[QualityLoop] Cycle error:', e.message);
    status.errors.push({ time: new Date().toISOString(), step: 'cycle', error: e.message });
    status.errors = status.errors.slice(-30);

    if (logId) {
      try {
        await db.run(`UPDATE scraper_logs SET status='error', completed_at=CURRENT_TIMESTAMP WHERE id=?`, [logId]);
      } catch {}
    }
  } finally {
    status.running = false;
    status.total_cycles++;
  }
}

function scheduleNext() {
  status.next_cycle_at = new Date(Date.now() + INTERVAL_MS).toISOString();
  loopTimer = setTimeout(async () => {
    await runOneCycle();
    if (loopActive) scheduleNext();
  }, INTERVAL_MS);
}

function startLoop() {
  if (loopActive) { console.log('[QualityLoop] Already running'); return; }
  loopActive = true;
  status.started_at = new Date().toISOString();
  console.log('[QualityLoop] Starting — first cycle in 60s, then every 2 hours');
  setTimeout(async () => {
    await runOneCycle();
    if (loopActive) scheduleNext();
  }, 60 * 1000);
}

function stopLoop() {
  loopActive = false;
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
  console.log('[QualityLoop] Stopped');
}

function getLoopStatus() {
  return { ...status, loop_active: loopActive, errors: status.errors.slice(-5) };
}

module.exports = { startLoop, stopLoop, getLoopStatus, runOneCycle };
