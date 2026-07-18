// Two more STATED/IMPLIED buying-intent detectors feeding
// scoreCloseability()'s has_buying_trigger input (see utils/scoring.js),
// alongside the YT Jobs source (commit — YT Jobs ingestion).
//
// A) COMMUNITY-POST INTENT SCAN — reuses innertubeService.fetchCommunityPosts()
//    and confirmedSignalService.js's EXISTING phrase lists
//    (findConfirmedHiringMatch/CONFIRMED_HIRING/APOLOGY_PATTERNS — see
//    confirmedSignalService.js's own scanCommunityPosts(), which already
//    matches these against a channel's community posts and writes
//    platform_signals rows, but was never wired into scoreCloseability's
//    has_buying_trigger). Not duplicated here — same lesson as the Part 1
//    email-skip-list consolidation: one source of truth per phrase list.
//
// B) SCHEDULE-BREAK DETECTION — reuses intentService.js's EXISTING
//    detectScheduleBreak(videos), which already computes a PER-CHANNEL
//    baseline (the channel's own historical median gap, not a global
//    constant) and a severity value. It was already wired for quality_leads/
//    leads rows with video history, but master_leads rows (where
//    scoreCloseability actually runs) have no recent_videos stored —
//    detectScheduleBreakForChannel() below fetches video timestamps via
//    innertubeService.getChannelVideos() to make it usable there too.
//
// INTEGRATION: both detectors' confidence feed the SAME has_buying_trigger
// input. Per the "strongest wins, not summed" decision (see
// TRIGGER_CONFIDENCE below and scoreCloseability's buyingTriggerSignal()),
// multiple firing triggers never stack — a stated community hiring post
// (0.95) and a schedule break (0.4) firing together still score as 0.95,
// not 1.35. This avoids rewarding a lead purely for having MORE weak
// signals rather than one strong one, and keeps the score interpretable
// (you can always point to the single strongest reason a lead ranked high).

const { getDb } = require('../models/database');
const { scoreCloseability, getTemperature } = require('../utils/scoring');

// ── Named, tunable weights ──────────────────────────────────────────────────
const TRIGGER_CONFIDENCE = {
  COMMUNITY_HIRING_POST: 0.95, // stated intent — softer only than an actual job posting (1.0)
  COMMUNITY_STRAIN_POST: 0.5,  // implied pain, a real ask, moderate-strong
  SCHEDULE_BREAK: 0.4,         // implied pain inferred from behavior alone — the softest trigger
  MULTI_TRIGGER_CAP: 1.0,      // ceiling regardless of how many triggers fire (belt-and-braces; the
                                // max()-based combine below can't exceed this on its own since every
                                // individual confidence is already <=1, but kept explicit and named
                                // per the "cap, don't naively sum" requirement)
};

// ── A) Community-post intent scan ───────────────────────────────────────────

async function detectCommunityBuyingTrigger(channelId) {
  const { fetchCommunityPosts } = require('./innertubeService');
  const { findConfirmedHiringMatch, APOLOGY_PATTERNS } = require('./confirmedSignalService');

  let posts = [];
  try {
    posts = await fetchCommunityPosts(channelId, 10);
  } catch (e) {
    console.warn(`[TriggerDetection] Community post fetch failed for ${channelId}: ${e.message}`);
    return { confidence: 0, evidence: [] };
  }

  let confidence = 0;
  const evidence = [];

  for (const post of posts) {
    const text = (post.text || '').toLowerCase();

    const hiringMatch = findConfirmedHiringMatch(text);
    if (hiringMatch) {
      confidence = Math.max(confidence, TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST);
      evidence.push({
        type: 'community_hiring_post', matched_phrase: hiringMatch,
        text: (post.text || '').slice(0, 300), url: post.url, posted: post.publishedText || null,
      });
      continue; // a hiring match on this post already outranks a strain match on the same post
    }

    const strainMatch = APOLOGY_PATTERNS.find(p => text.includes(p));
    if (strainMatch) {
      confidence = Math.max(confidence, TRIGGER_CONFIDENCE.COMMUNITY_STRAIN_POST);
      evidence.push({
        type: 'community_strain_post', matched_phrase: strainMatch,
        text: (post.text || '').slice(0, 300), url: post.url, posted: post.publishedText || null,
      });
    }
  }

  return { confidence, evidence };
}

// ── B) Schedule-break detection ─────────────────────────────────────────────

async function detectScheduleBreakForChannel(channelId) {
  const { getChannelVideos } = require('./innertubeService');
  const { detectScheduleBreak } = require('./intentService');

  let videos = [];
  try {
    videos = await getChannelVideos(channelId);
  } catch (e) {
    console.warn(`[TriggerDetection] Video fetch failed for ${channelId}: ${e.message}`);
    return { confidence: 0, evidence: [], breakInfo: null };
  }

  const breakInfo = detectScheduleBreak(videos); // per-channel baseline — see intentService.js
  if (!breakInfo.schedule_break) return { confidence: 0, evidence: [], breakInfo };

  return {
    confidence: TRIGGER_CONFIDENCE.SCHEDULE_BREAK,
    evidence: [{
      type: 'schedule_break',
      median_gap_days: breakInfo.median_gap,
      current_gap_days: breakInfo.current_gap,
      severity: breakInfo.severity,
    }],
    breakInfo,
  };
}

// ── Combine + rescore ────────────────────────────────────────────────────────

// Reuse the source column from Phase 4 — NOT by overwriting `source` (which
// stays the immutable original-ingestion attribution: 'ytapi'/'innertube'/
// 'ytjobs'), but by tagging trigger origin inside job_context (the same
// mechanism Phase 4 introduced for exactly this kind of "why did this lead
// score what it scored" detail) — so outcome-learning can later query
// job_context->>'trigger_type' to see which trigger type produces closers,
// without destroying which scraper originally found the lead.
async function rescoreLeadWithTriggers(channelId) {
  const db = getDb();
  const ml = await db.get('SELECT * FROM master_leads WHERE channel_id = ?', [channelId]);
  if (!ml) return null;

  const [community, scheduleBreak] = await Promise.all([
    detectCommunityBuyingTrigger(channelId).catch(() => ({ confidence: 0, evidence: [] })),
    detectScheduleBreakForChannel(channelId).catch(() => ({ confidence: 0, evidence: [], breakInfo: null })),
  ]);

  // Strongest trigger wins — see file header + TRIGGER_CONFIDENCE.
  const triggerConfidence = Math.min(
    Math.max(community.confidence, scheduleBreak.confidence),
    TRIGGER_CONFIDENCE.MULTI_TRIGGER_CAP
  );
  const allEvidence = [...community.evidence, ...scheduleBreak.evidence];

  if (triggerConfidence === 0) {
    return { channelId, triggerConfidence: 0, updated: false };
  }

  let existingContext = {};
  try { existingContext = ml.job_context ? JSON.parse(ml.job_context) : {}; } catch {}

  const strongestType = community.confidence >= scheduleBreak.confidence
    ? (community.evidence[0]?.type || null)
    : 'schedule_break';

  const newContext = {
    ...existingContext,
    trigger_type: strongestType,
    trigger_confidence: triggerConfidence,
    trigger_evidence: allEvidence,
    trigger_detected_at: new Date().toISOString(),
  };

  const { score, tier } = scoreCloseability({
    subscriber_count: ml.subscriber_count,
    avg_views: ml.avg_views,
    channel_description: ml.channel_description,
    has_team: ml.has_team_confidence,
    has_buying_trigger: triggerConfidence,
  });

  await db.run(
    `UPDATE master_leads SET lead_score = ?, temperature = ?, job_context = ?, break_severity = ?, schedule_break = ? WHERE channel_id = ?`,
    [
      score, getTemperature(score), JSON.stringify(newContext),
      scheduleBreak.breakInfo?.severity ?? null,
      scheduleBreak.breakInfo?.schedule_break ? 1 : 0,
      channelId,
    ]
  );

  return { channelId, triggerConfidence, score, tier, strongestType, evidence: allEvidence, updated: true };
}

// ── Batch cycle ──────────────────────────────────────────────────────────────

const TRIGGER_SCAN_BATCH_SIZE = 100;

async function runTriggerDetectionCycle(limit = TRIGGER_SCAN_BATCH_SIZE) {
  const db = getDb();
  // Same portable "oldest/never-refreshed first" ordering idiom used
  // elsewhere (qualityLeadsService.js's runTieredRefresh) — NULLS FIRST
  // isn't portable to older SQLite, so sort on the IS NULL check instead.
  const candidates = await db.all(
    `SELECT channel_id FROM master_leads
     WHERE email IS NOT NULL AND email != ''
     ORDER BY (last_refreshed_at IS NULL) DESC, last_refreshed_at ASC
     LIMIT ?`,
    [limit]
  );

  let triggered = 0, checked = 0, failed = 0;
  const results = await Promise.allSettled(candidates.map(c => rescoreLeadWithTriggers(c.channel_id)));
  for (const r of results) {
    checked++;
    if (r.status === 'fulfilled' && r.value?.updated) triggered++;
    else if (r.status === 'rejected') failed++;
  }

  console.log(`[TriggerDetection] Cycle done — ${checked} checked, ${triggered} triggered, ${failed} failed`);
  return { checked, triggered, failed };
}

module.exports = {
  detectCommunityBuyingTrigger, detectScheduleBreakForChannel, rescoreLeadWithTriggers,
  runTriggerDetectionCycle, TRIGGER_CONFIDENCE, TRIGGER_SCAN_BATCH_SIZE,
};
