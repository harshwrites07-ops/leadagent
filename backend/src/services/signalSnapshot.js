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
// never invented. tier/lead_type live on master_leads/quality_leads, not on
// the per-user leads row being sent — looked up by channel_id when
// available, honestly null when there's no match (e.g. a manually-added lead
// with no master_leads counterpart).
async function buildSnapshot(lead) {
  const db = getDb();
  const signalsRaw = parseJSON(lead.intent_signals, {});
  const signals = {};
  for (const key of SIGNAL_KEYS) signals[key] = signalsRaw[key] ?? null;

  let confirmedSignals = [];
  let tier = null, lead_type = null, provenance = null;
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

    try {
      const ml = await db.get('SELECT tier, lead_type FROM master_leads WHERE channel_id = ?', [lead.channel_id]);
      if (ml) { tier = ml.tier ?? null; lead_type = ml.lead_type ?? null; }
    } catch {}

    // Provenance (Session 2.1 graph crawler) — logged as metadata only, never
    // used to inject a fabricated boost into intent_score or the signals
    // above; this is what "never fabricate signals the lead doesn't have"
    // means in practice.
    try {
      const discovery = await db.get(
        `SELECT seed_channel_id, discovery_method FROM discovery_queue WHERE resolved_channel_id = ? AND status = 'enriched' LIMIT 1`,
        [lead.channel_id]
      );
      if (discovery) provenance = { seed_channel_id: discovery.seed_channel_id, discovery_method: discovery.discovery_method };
    } catch {}
  }

  const email_verified = lead.email_status === 'valid' ? true : lead.email_status === 'invalid' ? false : null;

  return JSON.stringify({
    tier, lead_type,
    intent_score: lead.intent_score ?? null,
    temperature: lead.temperature ?? null,
    signals,
    confirmed_signals: confirmedSignals,
    email_verified,
    freshness_days: null, // per-signal timestamps not tracked yet
    provenance,
    snapshot_at: new Date().toISOString(),
    engine_version: ENGINE_VERSION,
  });
}

module.exports = { buildSnapshot, ENGINE_VERSION };
