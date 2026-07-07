// Outcome learning v1 (Session 3.1) — turns signal snapshots (frozen at
// send time, Session 0.3) + reply outcomes into evidence-based scoring
// weights. Never auto-applies: the analysis job proposes a weight set, an
// admin reviews and applies it, and a rollback restores exactly what came
// before. Weights are versioned rows, not hardcoded constants.
const { getDb } = require('../models/database');
const { DEFAULT_WEIGHTS } = require('./intentService');

const MIN_SAMPLE_SIZE = 30; // honesty rule — anything under this is greyed as insufficient data
const CORE_SIGNAL_KEYS = ['upload_frequency', 'view_growth', 'description_keywords', 'engagement_rate', 'upload_consistency'];

// Wilson score interval — a standard, well-behaved binomial CI that doesn't
// break down at small n or extreme proportions the way the naive normal
// approximation does.
function wilsonInterval(successes, n, z = 1.96) {
  if (n === 0) return { low: 0, high: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  };
}

function bucketOf(value) {
  if (value === null || value === undefined) return 'unknown';
  if (value >= 0.67) return 'high';
  if (value >= 0.34) return 'mid';
  return 'low';
}

async function getActiveWeights() {
  const db = getDb();
  const row = await db.get(`SELECT * FROM scoring_weights WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`);
  if (row) {
    try { return { id: row.id, engine_version: row.engine_version, weights: JSON.parse(row.weights_json) }; } catch {}
  }
  // Seed with the current hardcoded defaults on first use.
  const seeded = await db.run(`INSERT INTO scoring_weights (engine_version, weights_json, is_active) VALUES ('v1', ?, 1)`, [JSON.stringify(DEFAULT_WEIGHTS)]);
  return { id: seeded.lastID, engine_version: 'v1', weights: DEFAULT_WEIGHTS };
}

function finalizeGroup(map) {
  const out = {};
  for (const [key, v] of Object.entries(map)) {
    const rate = v.total > 0 ? v.replies / v.total : 0;
    const ci = wilsonInterval(v.replies, v.total);
    out[key] = {
      sample_size: v.total,
      replies: v.replies,
      reply_rate: Math.round(rate * 1000) / 10,
      ci_low: Math.round(ci.low * 1000) / 10,
      ci_high: Math.round(ci.high * 1000) / 10,
      insufficient_data: v.total < MIN_SAMPLE_SIZE,
    };
  }
  return out;
}

// Joins sent emails (with signal_snapshot) to reply outcomes and computes
// reply-rate lift per tier, lead_type, intent-score band, and each of the
// 5 core signal's band — every cell carries sample_size + a Wilson CI so a
// small-n fluke never gets presented as a real finding.
async function runOutcomeAnalysis() {
  const db = getDb();
  const rows = await db.all(`SELECT signal_snapshot, status, replied_at FROM emails WHERE signal_snapshot IS NOT NULL`);

  const byTier = {}, byLeadType = {}, byIntentBand = {}, bySignalBand = {}, byTierAndLeadType = {};
  for (const key of CORE_SIGNAL_KEYS) bySignalBand[key] = {};

  let totalReplies = 0;
  const bump = (map, key) => { if (!map[key]) map[key] = { total: 0, replies: 0 }; return map[key]; };

  for (const row of rows) {
    let snap;
    try { snap = JSON.parse(row.signal_snapshot); } catch { continue; }
    const replied = row.status === 'replied' || !!row.replied_at;
    if (replied) totalReplies++;

    const tierKey = snap.tier || 'unknown';
    const g1 = bump(byTier, tierKey); g1.total++; if (replied) g1.replies++;

    const ltKey = snap.lead_type || 'unknown';
    const g2 = bump(byLeadType, ltKey); g2.total++; if (replied) g2.replies++;

    // (tier, lead_type) cross-tab — what the predicted reply-rate UI
    // (Session 3.3) reads from, keyed to match a lead's own tier/lead_type.
    const cellKey = `${tierKey}|${ltKey}`;
    const g5 = bump(byTierAndLeadType, cellKey); g5.total++; if (replied) g5.replies++;

    const scoreBand = snap.intent_score === null || snap.intent_score === undefined ? 'unknown' : bucketOf(snap.intent_score);
    const g3 = bump(byIntentBand, scoreBand); g3.total++; if (replied) g3.replies++;

    for (const key of CORE_SIGNAL_KEYS) {
      const val = snap.signals?.[key];
      const band = bucketOf(val);
      const g4 = bump(bySignalBand[key], band); g4.total++; if (replied) g4.replies++;
    }
  }

  const totalSampleSize = rows.length;
  const baselineReplyRate = totalSampleSize > 0 ? totalReplies / totalSampleSize : 0;

  const results = {
    baseline_reply_rate: Math.round(baselineReplyRate * 1000) / 10,
    total_sample_size: totalSampleSize,
    by_tier: finalizeGroup(byTier),
    by_lead_type: finalizeGroup(byLeadType),
    by_intent_band: finalizeGroup(byIntentBand),
    by_signal_band: Object.fromEntries(Object.entries(bySignalBand).map(([k, v]) => [k, finalizeGroup(v)])),
    by_tier_and_lead_type: finalizeGroup(byTierAndLeadType),
  };

  // Propose weights: for each of the 5 core signals, lift = high-bucket reply
  // rate minus low-bucket reply rate, only when BOTH buckets clear the
  // minimum sample size — otherwise that signal's lift is treated as 0
  // (no evidence either way), not guessed. Lifts are shifted non-negative
  // and normalized to sum to 1.0.
  let proposedWeights = null;
  if (totalSampleSize >= MIN_SAMPLE_SIZE) {
    const lifts = {};
    for (const key of CORE_SIGNAL_KEYS) {
      const bands = results.by_signal_band[key];
      const high = bands.high, low = bands.low;
      if (high && low && !high.insufficient_data && !low.insufficient_data) {
        lifts[key] = Math.max(0, (high.reply_rate - low.reply_rate) / 100);
      } else {
        lifts[key] = 0;
      }
    }
    const totalLift = Object.values(lifts).reduce((s, v) => s + v, 0);
    if (totalLift > 0) {
      proposedWeights = {};
      for (const key of CORE_SIGNAL_KEYS) proposedWeights[key] = Math.round((lifts[key] / totalLift) * 1000) / 1000;
      proposedWeights.title_keywords = 0; // permanently excluded — poisoned signal (Session 0.4)
      // Renormalize after rounding so the set sums to exactly 1.0.
      const sum = Object.values(proposedWeights).reduce((s, v) => s + v, 0);
      if (sum > 0) for (const key of Object.keys(proposedWeights)) proposedWeights[key] = Math.round((proposedWeights[key] / sum) * 1000) / 1000;
    }
  }

  const run = await db.run(
    `INSERT INTO weight_analysis_runs (sample_size, results_json, proposed_weights_json) VALUES (?, ?, ?)`,
    [totalSampleSize, JSON.stringify(results), proposedWeights ? JSON.stringify(proposedWeights) : null]
  );

  return { run_id: run.lastID, results, proposed_weights: proposedWeights };
}

// Applies a run's proposed weights: versions engine_version (increments the
// numeric suffix), deactivates the current active row, inserts the new one
// active. Every future signal_snapshot will carry the new engine_version.
async function applyProposedWeights(runId) {
  const db = getDb();
  const run = await db.get(`SELECT * FROM weight_analysis_runs WHERE id = ?`, [runId]);
  if (!run || !run.proposed_weights_json) return { success: false, error: 'No proposed weights on this run' };

  const current = await getActiveWeights();
  const versionNum = parseInt((current.engine_version || 'v1').replace('v', ''), 10) || 1;
  const nextVersion = `v${versionNum + 1}`;

  await db.run(`UPDATE scoring_weights SET is_active = 0 WHERE is_active = 1`);
  const inserted = await db.run(`INSERT INTO scoring_weights (engine_version, weights_json, is_active) VALUES (?, ?, 1)`, [nextVersion, run.proposed_weights_json]);
  await db.run(`UPDATE weight_analysis_runs SET applied = 1 WHERE id = ?`, [runId]);

  return { success: true, engine_version: nextVersion, weights_id: inserted.lastID };
}

// Rollback = reactivate a previous scoring_weights row exactly as it was —
// no new version bump, since this is undoing a mistake, not learning something new.
async function rollbackToWeights(weightsId) {
  const db = getDb();
  const target = await db.get(`SELECT * FROM scoring_weights WHERE id = ?`, [weightsId]);
  if (!target) return { success: false, error: 'Weights row not found' };
  await db.run(`UPDATE scoring_weights SET is_active = 0 WHERE is_active = 1`);
  await db.run(`UPDATE scoring_weights SET is_active = 1 WHERE id = ?`, [weightsId]);
  return { success: true, engine_version: target.engine_version, weights_id: target.id };
}

// Predicted reply rate (Session 3.3) — the moat made visible. Reads the
// (tier, lead_type) cell from the latest analysis run and shrinks its
// empirical reply rate toward the global baseline by sample size (simple
// Bayesian/Laplace shrinkage: more samples = trust the cell's own rate more;
// few samples = pull toward the population mean). No ML dependencies, no
// invented numbers.
//
// GATE (non-negotiable): returns null unless the cell has >= MIN_PREDICTION_SAMPLE_SIZE
// real sends — a shrunk estimate on a tiny cell still LOOKS precise, which is
// exactly the fabricated-looking-precision problem this gate exists to prevent.
const MIN_PREDICTION_SAMPLE_SIZE = 50;
const SHRINKAGE_STRENGTH = MIN_PREDICTION_SAMPLE_SIZE; // k in (n*p + k*baseline) / (n+k)

async function getPredictedReplyRate(tier, leadType) {
  const db = getDb();
  const run = await db.get(`SELECT * FROM weight_analysis_runs ORDER BY run_at DESC LIMIT 1`);
  if (!run) return null;

  let results;
  try { results = JSON.parse(run.results_json); } catch { return null; }

  const cellKey = `${tier || 'unknown'}|${leadType || 'unknown'}`;
  const cell = results.by_tier_and_lead_type?.[cellKey];
  if (!cell || cell.sample_size < MIN_PREDICTION_SAMPLE_SIZE) return null; // the gate

  const n = cell.sample_size;
  const p = cell.reply_rate / 100;
  const baseline = results.baseline_reply_rate / 100;
  const shrunk = (n * p + SHRINKAGE_STRENGTH * baseline) / (n + SHRINKAGE_STRENGTH);

  return {
    predicted_reply_rate: Math.round(shrunk * 1000) / 10, // e.g. 14.3 (%)
    sample_size: n,
    run_at: run.run_at,
  };
}

module.exports = {
  getActiveWeights, runOutcomeAnalysis, applyProposedWeights, rollbackToWeights, getPredictedReplyRate,
  MIN_SAMPLE_SIZE, MIN_PREDICTION_SAMPLE_SIZE, wilsonInterval,
};
