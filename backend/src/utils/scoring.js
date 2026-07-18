const HIGH_VALUE_NICHES = [
  'business', 'finance', 'fitness', 'education', 'coaching', 'real estate',
  'saas', 'tech', 'marketing', 'investing', 'crypto', 'wealth', 'health',
  'law', 'insurance', 'accounting', 'consulting', 'trading', 'ecommerce',
];

// ── Closeability score (0-100) — how likely THIS lead is to close for a
// freelance creator-services seller, not how big/popular the channel is.
// Replaces the old backgroundSeeder.js inline formula, which had no
// subscriber ceiling and an unconditional +15 bonus that let any large,
// established channel (business email + >1M views + >100K subs) cap out
// at exactly 105 with zero further differentiation.
//
// All tunable weights live here so the balance can be adjusted without
// hunting through the signal functions below.
// BASE + ICP_SUBS_BAND alone (a lead's easiest path to a high score) must
// land below the A tier threshold — being merely inside the sweet-spot sub
// band is necessary but not sufficient; a lead still needs a real
// differentiating signal (no team, buying trigger, or performing content)
// to climb into A/S.
const CLOSEABILITY_WEIGHTS = {
  BASE:            35,  // neutral starting point
  ICP_SUBS_BAND:   25,  // sub count inside/outside the ICP band — strong signal
  NO_TEAM:         15,  // no in-house team/agency detected — strong positive
  BUYING_TRIGGER:  20,  // active hiring/job-post/upload-break signal — heaviest positive
  QUALITY_GAP:     12,  // performing content, proxy for weak packaging — moderate positive
  RAW_SIZE:         3,  // sheer subscriber count — must NOT dominate
  KEYWORDS:         8,  // buying-intent keywords in description — capped at <=10% of total
};

const ICP_SUBS_MIN = 10000;
const ICP_SUBS_MAX = 500000;

// Genuine buying-intent phrases (not "editor"/"design"/"thumbnail" — a
// channel's own content mentioning those teaches or does the service, it
// doesn't buy it). Kept deliberately small since KEYWORDS is capped low.
const BUYING_INTENT_KEYWORDS = [
  'looking for an editor', 'looking to hire', 'hiring an editor', 'need an editor',
  'business inquiries', 'business inquiry', 'sponsorship', 'brand deals',
];

// Sub count relative to the ICP band → signal in [-1, 1].
// Inside band: full credit. Just outside: mild penalty. Deep past 1M: heavy penalty.
function icpSubsSignal(subs) {
  if (subs >= ICP_SUBS_MIN && subs <= ICP_SUBS_MAX) return 1.0;
  if (subs > ICP_SUBS_MAX && subs <= 1000000) return -0.3;   // scaling past the sweet spot
  if (subs > 1000000) return -1.0;                            // heavy negative — has a team
  if (subs >= 2000 && subs < ICP_SUBS_MIN) return 0.3;         // small but plausible
  return -0.5;                                                 // under 2K — likely too small/inactive
}

// Maps a has_team confidence (0.0-1.0, or null/undefined = genuinely unknown)
// from detectTeamSignal() to the NO_TEAM signal in [-1, 1].
//   >= HIGH: full negative weight — confirmed team/agency.
//   MED..HIGH: half negative weight — plausible but not certain.
//   < MED: treated as "no team detected" — positive.
//   null: neutral. Missing data is never scored as if it were confirmed solo.
const TEAM_CONFIDENCE_THRESHOLDS = {
  HIGH: 0.6,
  MED:  0.3,
};

// A creator actively hiring for a specific role has, by definition, no
// current incumbent for THAT role — a stated-intent source (YT Jobs, a
// community "looking for an editor" post) should override any detected
// has_team signal down to near-zero for scoring purposes, regardless of what
// channel-branding/size-driven suspicion would otherwise suggest. Near-zero
// rather than exactly 0 — "actively hiring" is strong evidence, not
// absolute proof there's no OTHER team member handling other roles.
const JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE = 0.05;

function noTeamSignal(hasTeamConfidence) {
  if (hasTeamConfidence === null || hasTeamConfidence === undefined) return 0; // unknown
  if (hasTeamConfidence >= TEAM_CONFIDENCE_THRESHOLDS.HIGH) return -1.0;
  if (hasTeamConfidence >= TEAM_CONFIDENCE_THRESHOLDS.MED) return -0.5;
  return 1.0;
}

// ── Team/agency detection ───────────────────────────────────────────────────
// Feeds the has_team input above. Combines several weak signals already
// present on a lead record into one confidence score rather than a naive
// boolean, because any single signal can misfire alone (a channel merely
// mentioning "design" in its bio isn't proof of a hired designer). Returns
// matched evidence so a human can see WHY a lead was flagged. All weights
// tunable here, in one place.
const TEAM_DETECTION_WEIGHTS = {
  CREDIT_PHRASE:       0.40, // "edited by", "editor:", "thumbnail by" etc. — per distinct match
  AGENCY_LINK:         0.35, // link/text pointing at a team/careers/agency page
  ORG_BRANDING:        0.25, // channel name reads like a media org/institution
  MULTI_CREDIT_VIDEOS: 0.50, // 2+ distinct credited names across recent video text — strongest signal
  SUBS_PRIOR_MAX:      0.15, // weak corroborating prior from subscriber count alone — never decisive by itself
};

// Minimum description length before "no credit phrases found" counts as real
// negative evidence (a genuine "we looked and found nothing") rather than
// just not having enough text to look at.
const TEAM_DETECTION_MIN_TEXT_LEN = 15;

const CREDIT_PHRASE_PATTERNS = [
  /edited by\s*[:@]?\s*[\w.@ ]{2,30}/i,
  /editor\s*[:@]\s*[\w.@ ]{2,30}/i,
  /thumbnails?\s*by\s*[:@]?\s*[\w.@ ]{2,30}/i,
  /produced by\s*[:@]?\s*[\w.@ ]{2,30}/i,
  /designe?d?\s*by\s*[:@]?\s*[\w.@ ]{2,30}/i,
  /graphics by\s*[:@]?\s*[\w.@ ]{2,30}/i,
];

// Deliberately specific — a bare "career" (as in "starting your career",
// extremely common in solo creator bios) is NOT evidence of a team/agency
// page and was a real false-positive source during testing. Every pattern
// here requires actual team/hiring context, not just the word alone.
const AGENCY_LINK_PATTERNS = [
  /work with us/i, /careers? page/i, /join (?:our|the) team/i, /we'?re hiring/i,
  /now hiring/i, /open positions?/i, /\bour agency\b/i, /\bour team\b/i,
  /meet the team/i, /production company/i, /media group/i,
];

// Org/institution naming — overlaps with the big-channel case by design
// (per spec: fine to reinforce, not the primary signal on its own).
const ORG_BRANDING_KEYWORDS = [
  'news', 'network', 'media', 'official', 'broadcast', 'studios', 'productions',
  'entertainment group', 'inc.', ' llc', ' ltd', 'corporation', 'agency',
];

const CREDIT_PHRASE_PREFIX_RE = /^(edited by|editor|thumbnails?\s*by|produced by|designe?d?\s*by|graphics by)\s*[:@]?\s*/i;
const SELF_CREDIT_NAMES = new Set(['me', 'myself', 'self', 'i']);

// A creator crediting themselves ("edited by me") is proof of the OPPOSITE
// of a team — it must never count as team evidence.
function creditedNameFrom(matchText) {
  const name = matchText.replace(CREDIT_PHRASE_PREFIX_RE, '').trim().toLowerCase();
  return name && !SELF_CREDIT_NAMES.has(name) ? name : null;
}

function matchCreditPhrases(text) {
  const matches = [];
  for (const pattern of CREDIT_PHRASE_PATTERNS) {
    const m = text.match(pattern);
    if (m && creditedNameFrom(m[0]) !== null) matches.push(m[0].trim());
  }
  return matches;
}

function matchAgencyLinks(textParts) {
  const matches = [];
  const combined = textParts.filter(Boolean).join(' ');
  for (const pattern of AGENCY_LINK_PATTERNS) {
    const m = combined.match(pattern);
    if (m) matches.push(m[0].trim());
  }
  return matches;
}

function matchOrgBranding(name) {
  const lower = (name || '').toLowerCase();
  return ORG_BRANDING_KEYWORDS.find(kw => lower.includes(kw)) || null;
}

// Extracts the de-duplicated set of names/handles following a credit phrase
// — used to detect MULTIPLE distinct people credited across recent videos.
// A solo creator crediting themselves ("edited by me") doesn't count.
function extractCreditedNames(text) {
  const names = new Set();
  for (const pattern of CREDIT_PHRASE_PATTERNS) {
    const re = new RegExp(pattern.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = creditedNameFrom(m[0]);
      if (name) names.add(name);
    }
  }
  return names;
}

// Sub count as a WEAK corroborating prior only — never enough on its own to
// cross the MED confidence threshold, per spec ("credits/links are the
// primary signal, size is secondary").
function subsPrior(subs) {
  if (subs > 1000000) return TEAM_DETECTION_WEIGHTS.SUBS_PRIOR_MAX;
  if (subs > 300000) return TEAM_DETECTION_WEIGHTS.SUBS_PRIOR_MAX * 0.5;
  return 0;
}

// data: { channel_name, channel_description, urls (string[], optional),
// recent_videos ([{ title, description }], optional), subscriber_count }.
// All fields optional and degrade gracefully — a lead with none of them
// returns confidence: null (unknown), never a false "no team".
function detectTeamSignal(data) {
  const descText = (data.channel_description || '').trim();
  const nameText = (data.channel_name || '').trim();
  const urls     = Array.isArray(data.urls) ? data.urls : [];
  const videos   = Array.isArray(data.recent_videos) ? data.recent_videos : [];
  const subs     = data.subscriber_count || 0;

  const hasSearchableText = descText.length >= TEAM_DETECTION_MIN_TEXT_LEN
    || urls.length > 0 || videos.length > 0 || nameText.length > 0;
  if (!hasSearchableText) {
    return { confidence: null, evidence: [] };
  }

  const evidence = [];
  let points = 0;

  for (const m of matchCreditPhrases(descText)) {
    points += TEAM_DETECTION_WEIGHTS.CREDIT_PHRASE;
    evidence.push({ type: 'credit_phrase', source: 'description', match: m });
  }

  for (const m of matchAgencyLinks([descText, ...urls])) {
    points += TEAM_DETECTION_WEIGHTS.AGENCY_LINK;
    evidence.push({ type: 'agency_link', source: 'description_or_links', match: m });
  }

  const orgMatch = matchOrgBranding(nameText);
  if (orgMatch) {
    points += TEAM_DETECTION_WEIGHTS.ORG_BRANDING;
    evidence.push({ type: 'org_branding', source: 'channel_name', match: orgMatch });
  }

  const creditedNames = new Set();
  for (const v of videos) {
    const vText = [v?.title, v?.description].filter(Boolean).join(' ');
    for (const n of extractCreditedNames(vText)) creditedNames.add(n);
  }
  if (creditedNames.size >= 2) {
    points += TEAM_DETECTION_WEIGHTS.MULTI_CREDIT_VIDEOS;
    evidence.push({ type: 'multi_credit_videos', source: 'recent_videos', match: [...creditedNames].join(', ') });
  }

  const priorPoints = subsPrior(subs);
  if (priorPoints > 0) {
    points += priorPoints;
    evidence.push({ type: 'subs_prior', source: 'subscriber_count', match: `${subs} subs` });
  }

  const confidence = Math.round(Math.max(0, Math.min(points, 1)) * 100) / 100;
  return { confidence, evidence };
}

// Active buying-trigger stub (Phase 2 — job post / hiring signal / upload
// break). Defaults false until wired to a real detector.
// Accepts either a boolean (true == confirmed/stated trigger like a YT Jobs
// posting -> full weight) or a 0-1 confidence float (implied/weaker triggers
// like a community post or a schedule break, per triggerDetectionService.js
// — when multiple triggers fire for one lead, the caller passes the
// STRONGEST one's confidence rather than summing them, so this function
// never needs to know about capping/multi-trigger logic itself).
function buyingTriggerSignal(hasBuyingTrigger) {
  if (typeof hasBuyingTrigger === 'number') return Math.max(0, Math.min(hasBuyingTrigger, 1));
  return hasBuyingTrigger ? 1.0 : 0;
}

// Quality-gap proxy: content performing relative to audience size, using
// view-to-sub ratio as the best available proxy for "good content, weak
// packaging" without a real thumbnail/CTR signal. Scales continuously
// rather than saturating on the first threshold crossed.
function qualityGapSignal(avgViews, subs) {
  if (!subs || !avgViews) return 0;
  const ratio = avgViews / subs;
  return Math.max(0, Math.min((ratio - 0.05) / 0.45, 1.0));
}

// Raw size — deliberately weak. A big channel and a small channel with the
// same signals elsewhere should NOT differ much because of this alone.
function rawSizeSignal(subs) {
  return Math.max(0, Math.min(subs / 2000000, 1.0));
}

function keywordSignal(text) {
  const lower = (text || '').toLowerCase();
  const count = BUYING_INTENT_KEYWORDS.filter(kw => lower.includes(kw)).length;
  return Math.min(count / 2, 1.0); // 2 matches = full credit
}

const CLOSEABILITY_TIERS = [
  { tier: 'S', min: 80 },
  { tier: 'A', min: 65 },
  { tier: 'B', min: 45 },
  { tier: 'C', min: 25 },
  { tier: 'D', min: -Infinity },
];

function closeabilityTier(score) {
  return CLOSEABILITY_TIERS.find(t => score >= t.min).tier;
}

// data: { subscriber_count, avg_views, channel_description, has_team
// (0.0-1.0 confidence from detectTeamSignal(), or null/undefined = unknown),
// has_buying_trigger (stub, bool) }
function scoreCloseability(data) {
  const subs = data.subscriber_count || 0;
  const avgViews = data.avg_views || 0;
  const w = CLOSEABILITY_WEIGHTS;

  const signals = {
    icp_subs_band:  Math.round(icpSubsSignal(subs) * 100) / 100,
    no_team:        Math.round(noTeamSignal(data.has_team ?? null) * 100) / 100,
    buying_trigger: Math.round(buyingTriggerSignal(data.has_buying_trigger) * 100) / 100,
    quality_gap:    Math.round(qualityGapSignal(avgViews, subs) * 100) / 100,
    raw_size:       Math.round(rawSizeSignal(subs) * 100) / 100,
    keywords:       Math.round(keywordSignal(data.channel_description) * 100) / 100,
  };

  const raw = w.BASE
    + w.ICP_SUBS_BAND  * signals.icp_subs_band
    + w.NO_TEAM        * signals.no_team
    + w.BUYING_TRIGGER * signals.buying_trigger
    + w.QUALITY_GAP    * signals.quality_gap
    + w.RAW_SIZE        * signals.raw_size
    + w.KEYWORDS        * signals.keywords;

  const score = Math.min(Math.max(Math.round(raw), 0), 100);
  return { score, tier: closeabilityTier(score), signals };
}

function scoreLeadFromYouTube(data) {
  let score = 0;
  const subs = data.subscriber_count || 1;
  const avgViews = data.avg_views || 0;
  const uploadFreq = data.upload_frequency_days || 0;
  const totalVideos = data.total_videos || 0;

  // +20: uploaded in last 14 days (active creator — worth reaching out to)
  if (data.last_upload_date) {
    const daysSince = Math.floor((Date.now() - new Date(data.last_upload_date)) / 86400000);
    if (daysSince <= 14) score += 20;
    else if (daysSince <= 30) score += 10;
    else if (daysSince <= 60) score += 4;
  }

  // +15: subscriber count 10K-200K (sweet spot — has audience, no in-house team yet)
  if (subs >= 10000 && subs <= 200000) score += 15;
  else if (subs >= 5000 && subs <= 500000) score += 8;
  else if (subs >= 1000) score += 3;

  // +15: view/subscriber ratio below 0.3 (low views vs subs = content quality problem)
  const viewSubRatio = avgViews / subs;
  if (viewSubRatio < 0.1) score += 15;
  else if (viewSubRatio < 0.2) score += 12;
  else if (viewSubRatio < 0.3) score += 8;
  else if (viewSubRatio < 0.5) score += 3;

  // +10: has business email (direct outreach is possible)
  if (data.email) score += 10;
  else if (data.website) score += 3;

  // +10: irregular upload schedule (inconsistency = needs editing help)
  if (uploadFreq > 21) score += 10;
  else if (uploadFreq > 10) score += 6;
  else if (uploadFreq > 5) score += 2;

  // +10: established creator (50+ videos = knows the value, more likely has budget)
  if (totalVideos >= 100) score += 10;
  else if (totalVideos >= 50) score += 7;
  else if (totalVideos >= 20) score += 4;
  else if (totalVideos >= 5) score += 1;

  // +10: high-value niche (business/finance/fitness = higher CPM = more ad revenue = budget for editing)
  const textToCheck = [data.niche || '', data.channel_description || ''].join(' ').toLowerCase();
  if (HIGH_VALUE_NICHES.some(n => textToCheck.includes(n))) score += 10;

  // +10: no recent viral video (consistent but not breaking out = motivated to improve)
  const recentVideos = (() => {
    if (Array.isArray(data.recent_videos)) return data.recent_videos;
    try { return JSON.parse(data.recent_videos || '[]'); } catch { return []; }
  })();
  if (recentVideos.length >= 3) {
    const maxViews = Math.max(...recentVideos.map(v => v.views || 0));
    const avgRecent = recentVideos.reduce((a, v) => a + (v.views || 0), 0) / recentVideos.length;
    if (avgRecent > 0 && maxViews < avgRecent * 5) score += 10;
  } else {
    score += 5; // insufficient data — partial credit
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function scoreLeadFromReddit(data) {
  let score = 40;
  if (data.channel_id) score += 15;
  if (data.email) score += 20;
  return Math.min(score, 100);
}

function getTemperature(score) {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

module.exports = {
  scoreLeadFromYouTube, scoreLeadFromReddit, getTemperature,
  scoreCloseability, CLOSEABILITY_WEIGHTS, CLOSEABILITY_TIERS, closeabilityTier,
  detectTeamSignal, TEAM_DETECTION_WEIGHTS, TEAM_CONFIDENCE_THRESHOLDS,
  JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE,
};
