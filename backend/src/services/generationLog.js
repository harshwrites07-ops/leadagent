// Marcus V4 P1-2 — structured per-stage verdicts, replacing console.log as
// the record of what happened at each stage of the pipeline. Best-effort:
// a logging failure must never break generation itself.
const { getDb } = require('../models/database');

const STAGES = new Set(['intake', 'sanitize', 'gate', 'send']);

async function logGenerationStage(userId, leadId, stage, passed, detail) {
  if (!STAGES.has(stage)) throw new Error(`Unknown generation_log stage: ${stage}`);
  try {
    await getDb().run(
      `INSERT INTO generation_log (user_id, lead_id, stage, passed, detail) VALUES (?, ?, ?, ?, ?)`,
      [userId || null, leadId || null, stage, passed ? 1 : 0, detail || null]
    );
  } catch (err) {
    console.error('[GenerationLog] Failed to log stage:', stage, err.message);
  }
}

module.exports = { logGenerationStage };
