// Capacity detectors + per-service fit v1 (Session 2.4) — sponsor/revenue
// signals, subscriber-milestone detection, and a per-service relevance score
// so an editor and a thumbnail designer see different HOT lists from the
// same pool.
const { getDb, USE_PG } = require('../models/database');

const SPONSOR_PATTERNS = [
  /sponsored by/i, /thanks to .{0,30} for sponsoring/i, /this video is sponsored/i,
  /use code\s+[\w-]{2,20}/i, /use my code/i, /affiliate link/i, /as an affiliate/i,
];
const SHORTLINK_DOMAINS = [/amzn\.to/i, /bit\.ly/i, /linktr\.ee/i, /shrsl\.com/i, /go\.magik\.ly/i];
const MERCH_PATTERNS = [/merch(?:andise)?\s*:/i, /shop\s+my/i, /my\s+merch/i, /store\.[\w-]+\.com/i];

// Scans video titles/descriptions + channel description for sponsor/
// affiliate/merch markers. Returns a 0-1 has_revenue score — proxy for
// "this channel already monetizes and has some production budget", not a
// certainty (a single mention is weak evidence, multiple across videos is
// stronger).
function detectSponsorship(videos, description) {
  const texts = [(description || ''), ...(videos || []).map(v => `${v.title || ''} ${v.description || ''}`)];
  let matches = 0;
  for (const text of texts) {
    if (SPONSOR_PATTERNS.some(p => p.test(text))) matches++;
    else if (SHORTLINK_DOMAINS.some(p => p.test(text))) matches++;
    else if (MERCH_PATTERNS.some(p => p.test(text))) matches++;
  }
  return Math.min(matches / 3, 1.0); // 3+ videos showing revenue markers = perfect score
}

// Records today's subscriber count for milestone-crossing detection —
// called on every tiered refresh (Session 1.4).
async function recordSubCount(channelId, count) {
  if (!channelId || count == null) return;
  const db = getDb();
  try {
    await db.run(`INSERT INTO sub_count_history (channel_id, count, recorded_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [channelId, count]);
  } catch {}
}

const MILESTONES = [10000, 100000, 1000000];

// Detects whether the channel crossed a 10K/100K/1M milestone within the
// last 60 days by comparing the current count against the oldest recorded
// count in that window. Fires a 'milestone' platform_signal (confidence
// 0.5), deduped per milestone value via signal_url.
async function detectAndRecordMilestone(channelId, currentCount) {
  if (!channelId || currentCount == null) return null;
  const db = getDb();
  const cutoffSql = USE_PG ? `NOW() - INTERVAL '60 days'` : `datetime('now', '-60 days')`;
  const oldest = await db.get(
    `SELECT count FROM sub_count_history WHERE channel_id = ? AND recorded_at >= ${cutoffSql} ORDER BY recorded_at ASC LIMIT 1`,
    [channelId]
  );
  if (!oldest) return null;

  for (const milestone of MILESTONES) {
    if (oldest.count < milestone && currentCount >= milestone) {
      const signalUrl = `milestone://${channelId}/${milestone}`;
      try {
        const result = await db.run(
          `INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'internal', 'milestone', ?, ?, 0.5)`,
          [channelId, `Crossed ${milestone.toLocaleString()} subscribers within 60 days`, signalUrl]
        );
        if (result.changes > 0) return milestone;
      } catch {}
    }
  }
  return null;
}

// Niche percentile of avg_views/subscriber_count ratio (a CTR/engagement
// proxy) across the pool — ignores meta_channel and email_corrupt rows so a
// tutorial channel or a corrupted-data row doesn't skew what "normal" looks
// like for real creators in that niche.
async function getNichePercentile(niche, ratio) {
  if (!niche || ratio == null) return null;
  const db = getDb();
  const rows = await db.all(
    `SELECT avg_views, subscriber_count FROM master_leads
     WHERE niche = ? AND subscriber_count > 0 AND (meta_channel IS NULL OR meta_channel = 0) AND (email_corrupt IS NULL OR email_corrupt = 0)`,
    [niche]
  );
  if (rows.length < 10) return null; // not enough data in this niche to rank against
  const ratios = rows.map(r => (r.avg_views || 0) / r.subscriber_count).sort((a, b) => a - b);
  const below = ratios.filter(r => r <= ratio).length;
  return Math.round((below / ratios.length) * 100) / 100;
}

// v1 per-service fit heuristics — every value is logged into the caller's
// signal_snapshot for future outcome learning (Session 3.1), never presented
// as more precise than "a heuristic proxy".
async function computeServiceFit({ lead, videos, meta_channel, schedule_break, break_severity, hasVacancy }) {
  const fit = { editor: 0, thumbnail: 0, shorts: 0, scriptwriter: 0 };
  if (meta_channel) return fit; // never surfaced anyway, no point scoring

  // Editor: schedule break severity, vacancy(editing), DIY editing, long-form heavy.
  if (schedule_break && break_severity) fit.editor = Math.max(fit.editor, Math.min(break_severity / 4, 1.0));
  if (hasVacancy) fit.editor = Math.max(fit.editor, 0.7);
  const longForm = (videos || []).filter(v => v.durationSeconds != null && v.durationSeconds > 180).length;
  const totalWithDuration = (videos || []).filter(v => v.durationSeconds != null).length;
  if (totalWithDuration >= 3 && longForm / totalWithDuration >= 0.7) fit.editor = Math.max(fit.editor, 0.5);

  // Thumbnail: chronically low views-to-subs ratio vs the channel's niche
  // percentile (CTR proxy) — low percentile = underperforming for its niche.
  const subs = lead.subscriber_count || 0;
  const avgViews = lead.avg_views || 0;
  if (subs > 0) {
    const ratio = avgViews / subs;
    const percentile = await getNichePercentile(lead.niche, ratio);
    if (percentile !== null && percentile < 0.35) fit.thumbnail = Math.max(fit.thumbnail, 1 - percentile);
  }

  // Shorts: has long-form output but no shorts at all (a gap, not a niche
  // judgment we can't honestly make without cross-channel shorts-adoption
  // data this codebase doesn't track).
  const shortsCount = (videos || []).filter(v => v.durationSeconds != null && v.durationSeconds <= 60).length;
  if (totalWithDuration >= 3 && shortsCount === 0) fit.shorts = 0.5;

  // Scriptwriter: long average duration + declining view growth.
  if (totalWithDuration >= 3) {
    const avgDuration = (videos || []).filter(v => v.durationSeconds != null).reduce((s, v) => s + v.durationSeconds, 0) / totalWithDuration;
    if (avgDuration > 600) fit.scriptwriter = 0.4; // 10+ min average — scripted long-form is plausible
  }

  for (const key of Object.keys(fit)) fit[key] = Math.round(fit[key] * 100) / 100;
  return fit;
}

module.exports = { detectSponsorship, recordSubCount, detectAndRecordMilestone, getNichePercentile, computeServiceFit };
