// Intent Prediction Algorithm — scores each creator 0-1.0 for likelihood to hire

const { getDb } = require('../models/database');

const SERVICE_KEYWORDS = [
  'editor', 'editing', 'thumbnail', 'thumbnails', 'script', 'scriptwriting',
  'designer', 'design', 'production', 'producer', 'course', 'coaching',
  'training', 'filmmaker', 'cinematography', 'videographer', 'colorist',
  'motion graphics', 'animation', 'video production', 'outsource', 'hire',
  'agency', 'freelance', 'content strategy', 'repurpose',
];

function parseVideos(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

function parseTags(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

// ── Signal 1: Upload frequency (videos/week → 0-1) ────────────────────────────
function signalUploadFrequency(lead) {
  const freqDays = parseFloat(lead.upload_frequency_days) || 0;
  if (freqDays <= 0) return 0;
  const vidsPerWeek = 7 / freqDays;
  return Math.min(vidsPerWeek / 4, 1.0); // 4 vids/week = 1.0
}

// ── Signal 2: View growth trend (newest half vs older half of last 10 videos) ─
function signalViewGrowth(videos) {
  const recent = videos.slice(0, 10).filter(v => v.views != null && v.views >= 0);
  if (recent.length < 4) return 0.5;

  const mid      = Math.floor(recent.length / 2);
  const newHalf  = recent.slice(0, mid);
  const oldHalf  = recent.slice(mid);
  const newAvg   = newHalf.reduce((s, v) => s + (v.views || 0), 0) / newHalf.length;
  const oldAvg   = oldHalf.reduce((s, v) => s + (v.views || 0), 0) / oldHalf.length;

  if (oldAvg === 0) return 0.5;
  const growthPct = ((newAvg - oldAvg) / oldAvg) * 100;
  // -50% → 0,  0% → 0.625,  +30% → 1.0
  return Math.max(0, Math.min((growthPct + 50) / 80, 1.0));
}

// ── Signal 3: Service keywords in last 20 video titles ───────────────────────
function signalTitleKeywords(videos) {
  const text = videos.slice(0, 20).map(v => (v.title || '').toLowerCase()).join(' ');
  const count = SERVICE_KEYWORDS.filter(kw => text.includes(kw)).length;
  return Math.min(count / 5, 1.0);
}

// ── Signal 4: Service keywords in channel description + tags ─────────────────
function signalDescriptionKeywords(lead) {
  const text = [
    (lead.channel_description || '').toLowerCase(),
    parseTags(lead.channel_tags).join(' ').toLowerCase(),
  ].join(' ');
  const count = SERVICE_KEYWORDS.filter(kw => text.includes(kw)).length;
  return Math.min(count / 8, 1.0);
}

// ── Signal 5: Engagement rate (avg % → 0-1) ───────────────────────────────────
function signalEngagement(lead) {
  return Math.min((lead.engagement_rate || 0) / 4, 1.0); // 4%+ = 1.0
}

// ── Signal 6: Upload consistency (coefficient of variation of gaps) ───────────
function signalConsistency(videos) {
  const dates = videos
    .map(v => v.publishedAt ? new Date(v.publishedAt).getTime() : null)
    .filter(Boolean)
    .sort((a, b) => b - a);

  if (dates.length < 4) return 0.5;

  const gaps = [];
  for (let i = 0; i < dates.length - 1; i++) {
    gaps.push((dates[i] - dates[i + 1]) / 86400000);
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg === 0) return 0.5;
  const variance = gaps.reduce((s, g) => s + Math.abs(g - avg), 0) / gaps.length;
  const cv = variance / avg;
  if (cv < 0.4) return 1.0;
  if (cv < 0.8) return 0.7;
  if (cv < 1.3) return 0.4;
  return 0.2;
}

// ── Human-readable reason ─────────────────────────────────────────────────────
function buildReason(lead, s, videos) {
  const parts = [];
  const vidsPerWeek = lead.upload_frequency_days > 0
    ? (7 / lead.upload_frequency_days).toFixed(1) : null;

  if (s.upload_frequency >= 0.75 && vidsPerWeek) parts.push(`${vidsPerWeek} uploads/wk`);
  if (s.view_growth >= 0.75) parts.push('views growing MoM');
  if (s.view_growth < 0.3)   parts.push('views declining');
  if (s.title_keywords >= 0.6) {
    const n = Math.round(s.title_keywords * 5);
    parts.push(`service keywords in ${n} title${n !== 1 ? 's' : ''}`);
  }
  if (s.description_keywords >= 0.5) parts.push('keywords in channel bio');
  if (s.engagement_rate >= 0.75) {
    parts.push(`${(lead.engagement_rate || 0).toFixed(1)}% engagement`);
  }
  if (s.upload_consistency >= 0.9) parts.push('very consistent uploads');
  if (s.upload_consistency <= 0.3) parts.push('irregular upload schedule');
  if (!parts.length) parts.push('low intent signals across all factors');
  return parts.join(' · ');
}

// ── Main export ───────────────────────────────────────────────────────────────
function calculateIntentScore(lead) {
  // Dormant channel
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : 999;
  const zero = (reason) => ({
    intent_score: 0, confidence: 'Low', temperature: 'cold', reason,
    signals: { upload_frequency: 0, view_growth: 0, title_keywords: 0, description_keywords: 0, engagement_rate: 0, upload_consistency: 0 },
  });

  if (daysSince > 180) return zero('Dormant — no uploads in 6+ months');

  const videos = parseVideos(lead.recent_videos);
  if (!videos.length)  return zero('No video data available');

  const s = {
    upload_frequency:     Math.round(signalUploadFrequency(lead)          * 100) / 100,
    view_growth:          Math.round(signalViewGrowth(videos)              * 100) / 100,
    title_keywords:       Math.round(signalTitleKeywords(videos)           * 100) / 100,
    description_keywords: Math.round(signalDescriptionKeywords(lead)       * 100) / 100,
    engagement_rate:      Math.round(signalEngagement(lead)                * 100) / 100,
    upload_consistency:   Math.round(signalConsistency(videos)             * 100) / 100,
  };

  let score = (
    0.20 * s.upload_frequency +
    0.20 * s.view_growth +
    0.25 * s.title_keywords +
    0.20 * s.description_keywords +
    0.10 * s.engagement_rate +
    0.05 * s.upload_consistency
  );

  if ((lead.total_videos || 0) < 100) score *= 0.85; // new channel penalty

  const intent_score  = Math.min(Math.round(score * 100) / 100, 1.0);
  const temperature   = intent_score >= 0.75 ? 'hot' : intent_score >= 0.50 ? 'warm' : 'cold';
  const confidence    = intent_score >= 0.70 ? 'High' : intent_score >= 0.40 ? 'Medium' : 'Low';

  return { intent_score, signals: s, reason: buildReason(lead, s, videos), confidence, temperature };
}

// Score + rank an array of leads, returns them sorted by intent_score desc
function scoreAndRankLeads(leads) {
  const scored = leads.map(lead => ({ ...lead, ...calculateIntentScore(lead) }));
  scored.sort((a, b) => b.intent_score - a.intent_score);
  return scored.map((lead, i) => ({ ...lead, intent_rank: i + 1 }));
}

// Classify into HOT / WARM / COLD buckets
function classifyLeads(rankedLeads) {
  const hot  = rankedLeads.filter(l => l.intent_score >= 0.75);
  const warm = rankedLeads.filter(l => l.intent_score >= 0.50 && l.intent_score < 0.75);
  const cold = rankedLeads.filter(l => l.intent_score < 0.50);
  return { hot, warm, cold };
}

// Algorithm accuracy check: given email tracking data, assess prediction quality
function assessAlgorithmAccuracy(emailsWithIntent) {
  const buckets = {
    hot:  { total: 0, replied: 0, target: 0.60 },
    warm: { total: 0, replied: 0, target: 0.30 },
    cold: { total: 0, replied: 0, target: 0.10 },
  };

  for (const e of emailsWithIntent) {
    const score = e.intent_score || 0;
    const key = score >= 0.75 ? 'hot' : score >= 0.50 ? 'warm' : 'cold';
    buckets[key].total++;
    if (e.replied) buckets[key].replied++;
  }

  const results = {};
  let passing = 0, total = 0;
  for (const [key, b] of Object.entries(buckets)) {
    if (b.total === 0) { results[key] = { total: 0, reply_rate: null, target: b.target, passing: null }; continue; }
    const reply_rate = b.replied / b.total;
    const passing_ = reply_rate >= b.target;
    results[key] = { total: b.total, replied: b.replied, reply_rate: Math.round(reply_rate * 100), target: Math.round(b.target * 100), passing: passing_ };
    if (passing_) passing++;
    total++;
  }

  return {
    buckets: results,
    overall_passing: passing === total,
    recommendation: passing < total
      ? 'Intent algorithm may need weight adjustment — reply rates below target for some buckets'
      : 'Algorithm performing within targets',
  };
}

// ── Default weights (publicly exported for calibration) ───────────────────────
const DEFAULT_WEIGHTS = {
  upload_frequency:     0.20,
  view_growth:          0.20,
  title_keywords:       0.25,
  description_keywords: 0.20,
  engagement_rate:      0.10,
  upload_consistency:   0.05,
};

// Score with custom weights (for calibration testing)
function calculateIntentScoreWithWeights(lead, weights = DEFAULT_WEIGHTS) {
  const videos = parseVideos(lead.recent_videos);

  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : 999;

  const zero = () => ({
    intent_score: 0, confidence: 'Low', temperature: 'cold',
    signals: { upload_frequency: 0, view_growth: 0, title_keywords: 0, description_keywords: 0, engagement_rate: 0, upload_consistency: 0 },
  });

  if (daysSince > 180) return zero();
  if (!videos.length && !lead.upload_frequency_days) return zero();

  const s = {
    upload_frequency:     Math.round(signalUploadFrequency(lead)         * 100) / 100,
    view_growth:          videos.length >= 4 ? Math.round(signalViewGrowth(videos) * 100) / 100 : 0.5,
    title_keywords:       Math.round(signalTitleKeywords(videos)          * 100) / 100,
    description_keywords: Math.round(signalDescriptionKeywords(lead)      * 100) / 100,
    engagement_rate:      Math.round(signalEngagement(lead)               * 100) / 100,
    upload_consistency:   videos.length >= 4 ? Math.round(signalConsistency(videos) * 100) / 100 : 0.5,
  };

  const w = weights;
  let score = (
    w.upload_frequency     * s.upload_frequency +
    w.view_growth          * s.view_growth +
    w.title_keywords       * s.title_keywords +
    w.description_keywords * s.description_keywords +
    w.engagement_rate      * s.engagement_rate +
    w.upload_consistency   * s.upload_consistency
  );

  if ((lead.total_videos || 0) < 100) score *= 0.85;

  const intent_score = Math.min(Math.round(score * 100) / 100, 1.0);
  const temperature  = intent_score >= 0.75 ? 'hot' : intent_score >= 0.50 ? 'warm' : 'cold';
  const confidence   = intent_score >= 0.70 ? 'High' : intent_score >= 0.40 ? 'Medium' : 'Low';

  return { intent_score, signals: s, confidence, temperature };
}

// Niche tiers — Tier 1 = highest buying intent for video services
const NICHE_TIER_SCORES = {
  // Tier 1: Pay well, invest in production, scale content
  finance: 1.0, business: 1.0, saas: 1.0, realestate: 1.0,
  tech: 0.95, edu: 0.92, education: 0.92, law: 0.90,
  motivation: 0.90, podcast: 0.90, filmmaking: 0.92,
  design: 0.85, creative: 0.82, science: 0.80,
  // Tier 2: Growing category, decent budgets
  fitness: 0.80, gaming: 0.78, health: 0.78, photography: 0.78,
  music: 0.75, sports: 0.70, language: 0.72,
  // Tier 3: Lower conversion, smaller budgets
  cooking: 0.58, travel: 0.55, beauty: 0.52, lifestyle: 0.50,
  family: 0.48, diy: 0.52, woodworking: 0.52,
  automotive: 0.52, homesteading: 0.44, farming: 0.44,
  crafts: 0.42, art: 0.55, vlogging: 0.42, pets: 0.38,
};

const EXCLUDED_CHANNEL_KEYWORDS = [
  'news', 'tv', 'media', 'official', 'network',
  'broadcast', 'nbc', 'cbs', 'cnn', 'bbc', 'fox',
  'cnbc', 'times', 'corp', 'inc', 'ltd', 'brand',
  'government', 'police', 'army', 'ministry',
];

// Score a master_leads row using proxy signals (niche + subscriber count + views ratio + description keywords)
// master_leads doesn't have recent_videos, upload_frequency_days, or engagement_rate
function scoreMasterLead(ml) {
  // Hard exclude: media companies, brand channels, and mega-channels (>500K subs)
  const channelNameLower = (ml.channel_name || '').toLowerCase();
  const isExcluded = EXCLUDED_CHANNEL_KEYWORDS.some(kw => channelNameLower.includes(kw));
  if (isExcluded || (ml.subscriber_count || 0) > 500000) {
    return {
      intent_score: 0.10, confidence: 'Low', temperature: 'cold', excluded: true,
      base_score: 0.10, signal_boost: 0, is_confirmed: false, signal_source: null,
      signals: {
        niche_score: 0, subs_score: 0, views_score: 0, desc_score: 0,
        upload_frequency: null, view_growth: null, title_keywords: null,
        description_keywords: 0, engagement_rate: null, upload_consistency: null,
      },
    };
  }

  // Signal 1: Niche tier (40% weight) — Tier 1 creators pay most for production
  const niche = (ml.niche || '').toLowerCase();
  let niche_score = 0.35; // default unknown niche
  for (const [key, val] of Object.entries(NICHE_TIER_SCORES)) {
    if (niche.includes(key)) { niche_score = val; break; }
  }

  // Signal 2: Subscriber sweet spot (40% weight) — 10K-500K needs services most
  const subs = ml.subscriber_count || 0;
  let subs_score;
  if      (subs >= 20000  && subs <= 200000)  subs_score = 1.00; // ideal range
  else if (subs >= 10000  && subs <  20000)   subs_score = 0.90;
  else if (subs > 200000  && subs <= 500000)  subs_score = 0.90; // still needs help scaling
  else if (subs >= 5000   && subs <  10000)   subs_score = 0.70;
  else if (subs > 500000  && subs <= 2000000) subs_score = 0.60; // big, likely has team
  else if (subs >= 2000   && subs <  5000)    subs_score = 0.45;
  else if (subs > 2000000)                    subs_score = 0.30; // massive, definitely has team
  else                                        subs_score = 0.15; // under 2K too small

  // Signal 3: Views-to-subs ratio (15% weight) — proxy for channel activity & engagement
  const avgViews = ml.avg_views || 0;
  let views_score = 0.40; // neutral default when no view data (don't punish missing data)
  if (avgViews > 0 && subs > 0) {
    const ratio = avgViews / subs;
    if      (ratio >= 0.30) views_score = 1.00;
    else if (ratio >= 0.15) views_score = 0.85;
    else if (ratio >= 0.08) views_score = 0.70;
    else if (ratio >= 0.03) views_score = 0.50;
    else                    views_score = 0.20;
  }

  // Signal 4: Description keywords (10% weight) — looser threshold for master_leads
  const descText = [
    (ml.channel_description || '').toLowerCase(),
    (ml.niche || '').toLowerCase(),
  ].join(' ');
  const descKwCount = SERVICE_KEYWORDS.filter(kw => descText.includes(kw)).length;
  const desc_score = Math.min(descKwCount / 2, 1.0); // 2 keywords = perfect

  // Niche + subs are co-equal proxy signals; views as tiebreaker
  const score = (0.40 * niche_score) + (0.40 * subs_score) + (0.15 * views_score) + (0.05 * desc_score);
  const base_score   = Math.min(Math.round(score * 100) / 100, 1.0);
  const intent_score = scoreWithPlatformSignals(ml.channel_id, base_score);
  const temperature  = intent_score >= 0.75 ? 'hot' : intent_score >= 0.50 ? 'warm' : 'cold';

  // Determine if a confirmed hiring signal exists (for downstream enrichment)
  let is_confirmed = false;
  let signal_source = null;
  try {
    const db = getDb();
    if (typeof db.prepare === 'function') {
      const confirmedSignal = db.prepare(`SELECT platform FROM platform_signals WHERE creator_id = ? AND signal_type = 'confirmed_hiring' ORDER BY confidence DESC LIMIT 1`).get(ml.channel_id);
      if (confirmedSignal) { is_confirmed = true; signal_source = confirmedSignal.platform; }
    }
  } catch (e) {}

  return {
    intent_score, confidence: is_confirmed ? 'High' : 'Low', temperature,
    is_confirmed, signal_source, base_score, signal_boost: Math.round((intent_score - base_score) * 100) / 100,
    signals: {
      niche_score, subs_score, views_score, desc_score,
      upload_frequency: null, view_growth: null, title_keywords: null,
      description_keywords: desc_score, engagement_rate: null, upload_consistency: null,
    },
  };
}

/**
 * MULTI-PLATFORM INTENT SCORER
 * Combines YouTube signals with cross-platform signals
 * Makes 0.75+ actually mean something real
 */
function scoreWithPlatformSignals(creatorId, baseScore) {
  const db = getDb();

  if (typeof db.prepare !== 'function') return baseScore;

  const signals = db.prepare(`
    SELECT platform, signal_type, confidence, budget_mentioned
    FROM platform_signals
    WHERE creator_id = ?
    ORDER BY confidence DESC
  `).all(creatorId);

  if (signals.length === 0) return baseScore;

  let platformBoost = 0;
  let hasConfirmedHiring = false;

  for (const signal of signals) {
    if (signal.signal_type === 'confirmed_hiring') {
      hasConfirmedHiring = true;
    }
    switch (signal.platform) {
      case 'upwork':
        platformBoost = Math.max(platformBoost, 0.35);
        hasConfirmedHiring = true;
        if (signal.budget_mentioned) platformBoost = Math.max(platformBoost, 0.38);
        break;

      case 'youtube_description':
        platformBoost = Math.max(platformBoost, 0.30);
        hasConfirmedHiring = true;
        break;

      case 'google_search':
        platformBoost = Math.max(platformBoost, 0.28);
        hasConfirmedHiring = true;
        break;

      case 'linkedin':
        platformBoost = Math.max(platformBoost, 0.25);
        hasConfirmedHiring = true;
        break;

      case 'twitter':
        platformBoost = Math.max(platformBoost, 0.25);
        hasConfirmedHiring = true;
        break;

      case 'youtube_community':
        platformBoost = Math.max(platformBoost, 0.28);
        hasConfirmedHiring = true;
        break;

      case 'reddit':
        platformBoost = Math.max(platformBoost, 0.20);
        hasConfirmedHiring = true;
        break;

      case 'youtube_comments':
        platformBoost = Math.max(platformBoost, 0.08);
        break;

      case 'email_analysis':
        platformBoost = Math.max(platformBoost, 0.08);
        break;
    }
  }

  platformBoost = Math.min(platformBoost, 0.40);

  const finalScore = Math.min(baseScore + platformBoost, 0.99);

  if (hasConfirmedHiring && finalScore < 0.80) {
    return 0.80;
  }

  return finalScore;
}

// Calibrate: test 4 weight options against an array of leads, return distribution for each
function calibrateWeights(leads) {
  const OPTIONS = {
    current: { upload_frequency: 0.20, view_growth: 0.20, title_keywords: 0.25, description_keywords: 0.20, engagement_rate: 0.10, upload_consistency: 0.05 },
    option_a: { upload_frequency: 0.20, view_growth: 0.15, title_keywords: 0.30, description_keywords: 0.25, engagement_rate: 0.05, upload_consistency: 0.05 }, // Keywords heavy
    option_b: { upload_frequency: 0.25, view_growth: 0.25, title_keywords: 0.20, description_keywords: 0.15, engagement_rate: 0.10, upload_consistency: 0.05 }, // Upload-growth heavy
    option_c: { upload_frequency: 0.20, view_growth: 0.20, title_keywords: 0.20, description_keywords: 0.15, engagement_rate: 0.20, upload_consistency: 0.05 }, // Engagement heavy
    option_d: { upload_frequency: 0.22, view_growth: 0.22, title_keywords: 0.22, description_keywords: 0.18, engagement_rate: 0.12, upload_consistency: 0.04 }, // Balanced
  };

  const results = {};
  const n = leads.length;

  for (const [name, weights] of Object.entries(OPTIONS)) {
    let hot = 0, warm = 0, cold = 0;
    for (const lead of leads) {
      const { intent_score } = calculateIntentScoreWithWeights(lead, weights);
      if (intent_score >= 0.75) hot++;
      else if (intent_score >= 0.50) warm++;
      else cold++;
    }
    results[name] = {
      hot, warm, cold,
      hot_pct:  Math.round((hot  / n) * 100),
      warm_pct: Math.round((warm / n) * 100),
      cold_pct: Math.round((cold / n) * 100),
    };
  }

  // Find best option (closest to 40-50% HOT)
  let best = 'current', bestDist = Infinity;
  for (const [name, r] of Object.entries(results)) {
    const dist = Math.abs(r.hot_pct - 45); // target 45%
    if (dist < bestDist) { bestDist = dist; best = name; }
  }

  return { total: n, results, recommended: best, recommended_weights: OPTIONS[best] };
}

module.exports = {
  calculateIntentScore, calculateIntentScoreWithWeights,
  scoreAndRankLeads, classifyLeads, assessAlgorithmAccuracy,
  scoreMasterLead, calibrateWeights, DEFAULT_WEIGHTS, scoreWithPlatformSignals,
};
