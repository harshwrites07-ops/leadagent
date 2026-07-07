// Allocation engine (Session 3.2) — prevents every user pitching the same
// hot creators: claim windows, a pool-wide contact throttle, and agency-plan
// priority.
const { getDb, USE_PG } = require('../models/database');
const { PAID_PLANS } = require('../middleware/requireAuth');

const CLAIM_WINDOW_HOURS = 48;
const MAX_SIMULTANEOUS_CLAIMS = 3;
const MAX_FIRST_TOUCH_PER_30_DAYS = 3;
const AGENCY_PRIORITY_HOURS = 12;

// Claims a lead for a user (called on view-and-save or pitch generation).
// S/A-tier leads are surfaced to at most 3 users simultaneously — an
// already-expired claim doesn't count against that cap, and a user who
// already holds an active claim just gets it refreshed (idempotent, not a
// second slot). Diversity: when the cap isn't yet reached, new claims are
// still granted first-come-first-served (round-robin fairness happens at
// the *notification* stage in preferring least-claimed users first — see
// rankUsersForNotification() — not by rejecting a willing claimant here).
async function claimLead(userId, creatorId) {
  const db = getDb();
  await expireStaleClaims(creatorId);

  const existing = await db.get(`SELECT * FROM lead_claims WHERE creator_id = ? AND user_id = ? AND status != 'expired'`, [creatorId, userId]);
  const expiresAt = new Date(Date.now() + CLAIM_WINDOW_HOURS * 3600 * 1000).toISOString();

  if (existing) {
    await db.run(`UPDATE lead_claims SET expires_at = ? WHERE id = ?`, [expiresAt, existing.id]);
    return { success: true, refreshed: true, expires_at: expiresAt };
  }

  const priority = await checkAgencyPriorityWindow(userId, creatorId);
  if (!priority.allowed) return { success: false, ...priority };

  const activeCount = await db.get(
    `SELECT COUNT(*) as c FROM lead_claims WHERE creator_id = ? AND status != 'expired' AND expires_at > CURRENT_TIMESTAMP`,
    [creatorId]
  );
  if (activeCount.c >= MAX_SIMULTANEOUS_CLAIMS) {
    return { success: false, reason: 'lead_reserved_by_others', active_claims: activeCount.c };
  }

  await db.run(`INSERT INTO lead_claims (creator_id, user_id, expires_at, status) VALUES (?, ?, ?, 'claimed')`, [creatorId, userId, expiresAt]);
  return { success: true, refreshed: false, expires_at: expiresAt };
}

async function expireStaleClaims(creatorId = null) {
  const db = getDb();
  if (creatorId) {
    await db.run(`UPDATE lead_claims SET status = 'expired' WHERE creator_id = ? AND status != 'expired' AND expires_at <= CURRENT_TIMESTAMP`, [creatorId]);
  } else {
    const r = await db.run(`UPDATE lead_claims SET status = 'expired' WHERE status != 'expired' AND expires_at <= CURRENT_TIMESTAMP`);
    return r.changes;
  }
}

async function markClaimPitched(userId, creatorId) {
  const db = getDb();
  await db.run(`UPDATE lead_claims SET status = 'pitched' WHERE creator_id = ? AND user_id = ? AND status != 'expired'`, [creatorId, userId]);
}

async function getActiveClaimsForCreator(creatorId) {
  const db = getDb();
  await expireStaleClaims(creatorId);
  return db.all(`SELECT user_id, status, expires_at FROM lead_claims WHERE creator_id = ? AND status != 'expired' AND expires_at > CURRENT_TIMESTAMP`, [creatorId]);
}

// Given a set of matched user ids for a newly-S/A-tier lead, ranks them by
// ascending active-claim count (fewest claims first) so leads spread across
// users with identical niche+service profiles instead of the fastest-
// clicking user hoarding everything — the diversity mechanism, applied at
// the point where notification/claim-eligibility order is decided.
async function rankUsersForNotification(userIds) {
  const db = getDb();
  const counts = await Promise.all(userIds.map(async id => {
    const row = await db.get(`SELECT COUNT(*) as c FROM lead_claims WHERE user_id = ? AND status != 'expired' AND expires_at > CURRENT_TIMESTAMP`, [id]);
    return { user_id: id, active_claims: row.c };
  }));
  counts.sort((a, b) => a.active_claims - b.active_claims);
  return counts.map(c => c.user_id);
}

// Agency-plan priority: within AGENCY_PRIORITY_HOURS of a lead's detected_at
// (from hot_alerts — the only place a "became S-tier" timestamp exists),
// only agency-plan users may claim it. After the window, anyone matched can.
async function checkAgencyPriorityWindow(userId, creatorId) {
  const db = getDb();
  const alert = await db.get(`SELECT detected_at FROM hot_alerts WHERE creator_id = ? ORDER BY detected_at DESC LIMIT 1`, [creatorId]);
  if (!alert) return { allowed: true }; // no tracked S-tier transition — no window to enforce, don't fabricate one

  const ageHours = (Date.now() - new Date(alert.detected_at).getTime()) / 3600000;
  if (ageHours >= AGENCY_PRIORITY_HOURS) return { allowed: true };

  const user = await db.get('SELECT plan FROM users WHERE id = ?', [userId]);
  if (user && PAID_PLANS.includes(user.plan) && user.plan === 'agency') return { allowed: true };
  return { allowed: false, reason: 'agency_priority_window', hours_remaining: Math.round((AGENCY_PRIORITY_HOURS - ageHours) * 10) / 10 };
}

// Contact throttle — max 3 Quelro-originated FIRST-TOUCH emails per creator
// per 30 days, pool-wide across all users. Follow-ups to an existing thread
// are exempt (never counted, never blocked).
async function checkContactThrottle(channelId) {
  const db = getDb();
  const cutoffSql = USE_PG ? `NOW() - INTERVAL '30 days'` : `datetime('now', '-30 days')`;
  const row = await db.get(
    `SELECT COUNT(*) as c FROM creator_contact_log WHERE channel_id = ? AND is_first_touch = 1 AND sent_at >= ${cutoffSql}`,
    [channelId]
  );
  if (row.c >= MAX_FIRST_TOUCH_PER_30_DAYS) {
    return { allowed: false, reason: 'CREATOR_THROTTLED', count: row.c };
  }
  return { allowed: true, count: row.c };
}

async function recordContact(channelId, userId, isFirstTouch = true) {
  const db = getDb();
  try {
    await db.run(`INSERT INTO creator_contact_log (channel_id, user_id, is_first_touch) VALUES (?, ?, ?)`, [channelId, userId, isFirstTouch ? 1 : 0]);
  } catch {}
}

module.exports = {
  claimLead, expireStaleClaims, markClaimPitched, getActiveClaimsForCreator, rankUsersForNotification,
  checkAgencyPriorityWindow, checkContactThrottle, recordContact,
  CLAIM_WINDOW_HOURS, MAX_SIMULTANEOUS_CLAIMS, MAX_FIRST_TOUCH_PER_30_DAYS, AGENCY_PRIORITY_HOURS,
};
