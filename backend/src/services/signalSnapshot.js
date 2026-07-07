const { getDb } = require('../models/database');

const ENGINE_VERSION = 'v1';
const SIGNAL_KEYS = ['upload_frequency', 'view_growth', 'title_keywords', 'description_keywords', 'engagement_rate', 'upload_consistency'];

function parseJSON(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

// Freezes a lead's full signal state at the moment of a send decision, so
// reply outcomes can later be joined back to the signals that produced them
// (see AUDIT_REPORT.md / roadmap — "the moat"). Missing values are null,
// never invented — tier/lead_type/email_verified don't exist as concepts yet
// (later sessions add them) and are honestly null here, not guessed.
async function buildSnapshot(lead) {
  const db = getDb();
  const signalsRaw = parseJSON(lead.intent_signals, {});
  const signals = {};
  for (const key of SIGNAL_KEYS) signals[key] = signalsRaw[key] ?? null;

  let confirmedSignals = [];
  if (lead.channel_id) {
    try {
      const rows = await db.all(
        `SELECT platform, signal_type, confidence, budget_mentioned, found_at FROM platform_signals WHERE creator_id = ? ORDER BY confidence DESC`,
        [lead.channel_id]
      );
      confirmedSignals = rows.map(r => ({
        platform: r.platform,
        signal_type: r.signal_type,
        confidence: r.confidence,
        budget_mentioned: !!r.budget_mentioned,
        found_at: r.found_at,
      }));
    } catch {
      confirmedSignals = [];
    }
  }

  return JSON.stringify({
    tier: null,          // not computed until Session 1.4 (tiered refresh + effective tier)
    lead_type: null,      // not computed until Session 1.1 (STRAINED/SCALING classifier)
    intent_score: lead.intent_score ?? null,
    temperature: lead.temperature ?? null,
    signals,
    confirmed_signals: confirmedSignals,
    email_verified: null, // not computed until Session 1.2 (mailbox verification waterfall)
    freshness_days: null, // per-signal timestamps not tracked until Session 1.4
    snapshot_at: new Date().toISOString(),
    engine_version: ENGINE_VERSION,
  });
}

module.exports = { buildSnapshot, ENGINE_VERSION };
