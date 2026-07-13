// Marcus V4 Session 2 — Send Guard, Stage 5.
// The single choke point for every email_queue insert in the app. No other
// module may `INSERT INTO email_queue` — grep -rn "INSERT INTO email_queue"
// backend/src/ must return only the two INSERTs inside queueEmail() below.
// The score/completeness check here is belt; the DB trigger/CHECK constraint
// added in database.js and postgres.js (Session 2) is suspenders — even a
// future insert path that skips this file entirely still gets blocked at
// the database layer.
const { getDb, USE_PG } = require('../models/database');
const { buildSnapshot } = require('./signalSnapshot');
const { checkUsageLimit, incrementUsage } = require('./authService');

class QueueBlockedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QueueBlockedError';
    this.code = code;
  }
}

// Derives the Send Guard verdict from a stored pitch row. A pitch generated
// before the V4 gate existed (or scored by the legacy generateFullPitch path)
// has no quality_breakdown array — that must block the send, not silently
// pass, so this returns checksComplete=false rather than guessing.
function deriveGateFromPitch(pitch) {
  if (!pitch) return { score: null, checksComplete: false, breakdown: null };
  let breakdown = null;
  try { breakdown = JSON.parse(pitch.quality_breakdown || 'null'); } catch { breakdown = null; }
  const checksComplete = Array.isArray(breakdown) && breakdown.length === 7 &&
    breakdown.every(c => c && typeof c.points_awarded === 'number' && typeof c.points_possible === 'number');
  return {
    score: pitch.quality_score != null ? Number(pitch.quality_score) : null,
    checksComplete,
    breakdown,
    attempts: pitch.generation_attempts || null,
    model: pitch.generation_model || null,
  };
}

// user: full user row (needed by checkUsageLimit's plan/limit fields).
// lead: full lead row.
// gate: { score, checksComplete, breakdown, attempts?, model? } — from
//   deriveGateFromPitch() or a fresh evaluateEmailQualityV2() result.
async function queueEmail({ user, lead, subject, body, gate, scheduledAt = null, priority = 0, skipThrottle = false }) {
  if (!user) throw new QueueBlockedError('USER_REQUIRED', 'user is required');
  if (!lead) throw new QueueBlockedError('LEAD_REQUIRED', 'lead is required');
  if (!subject || !body) throw new QueueBlockedError('EMAIL_REQUIRED', 'subject and body are required to queue an email');

  // Send Guard — the whole reason this file exists. No override parameter,
  // by design: a bypassable constraint is not a constraint.
  if (!gate || gate.score == null || !gate.checksComplete) {
    throw new QueueBlockedError('QUALITY_GATE_INCOMPLETE', 'Email has not been scored by a complete Marcus quality gate run — cannot queue');
  }
  if (gate.score < 70) {
    throw new QueueBlockedError('QUALITY_GATE_FAILED', `Quality gate score ${gate.score}/100 is below the 70 send threshold`);
  }

  const usageCheck = await checkUsageLimit(user, 'emails');
  if (!usageCheck.allowed) {
    throw new QueueBlockedError('USAGE_LIMIT', `Monthly email limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan to send more emails.`);
  }

  const isFirstTouch = !lead.last_contacted_date;
  if (!skipThrottle && isFirstTouch && lead.channel_id) {
    const { checkContactThrottle } = require('./allocationEngine');
    const throttle = await checkContactThrottle(lead.channel_id);
    if (!throttle.allowed) {
      throw new QueueBlockedError('CREATOR_THROTTLED', 'This creator was recently contacted through Quelro. Protecting reply rates for everyone.');
    }
  }

  const db = getDb();
  const snapshot = await buildSnapshot(lead);
  const result = await db.run(
    `INSERT INTO email_queue
       (user_id, lead_id, subject, body, status, scheduled_at, priority, signal_snapshot,
        gate_score, gate_checks_complete, gate_breakdown, generation_attempts, generation_model)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?) ${USE_PG ? 'RETURNING id' : ''}`,
    [user.id, lead.id, subject, body, scheduledAt, priority, snapshot,
     gate.score, USE_PG ? gate.checksComplete : (gate.checksComplete ? 1 : 0),
     JSON.stringify(gate.breakdown || []), gate.attempts ?? null, gate.model ?? null]
  );

  await incrementUsage(user.id, 'emails', 1);
  if (lead.channel_id) {
    const { recordContact } = require('./allocationEngine');
    await recordContact(lead.channel_id, user.id, isFirstTouch);
  }

  return db.get('SELECT * FROM email_queue WHERE id = ?', [result.lastID]);
}

module.exports = { queueEmail, deriveGateFromPitch, QueueBlockedError };
