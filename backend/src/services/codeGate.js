// codeGate.js — Marcus V2, Part 4 (rebuilt for the "email engine rebuild" spec).
// Deterministic checks that used to be AI instructions. Regex/heuristics only:
// free, instant, 100% consistent. Runs before any AI scoring.
//
// Every check carries a `severity`: 'hard' checks map to the spec's explicit
// ban-list/auto-fail rules plus the word-count hard block — these fail
// runCodeGate() outright. 'soft' checks are the spec's "regen" rows (burstiness,
// CTA shape, reading grade, sign-off, subject style) — they're reported but
// don't block; qualityGate.js turns them into point deductions.

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(text) {
  return (text || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function sentenceWordCounts(text) {
  return splitSentences(text).map(s => s.split(/\s+/).filter(Boolean).length).filter(n => n > 0);
}

// Compact number formatter matching the app's formatNum convention (e.g. 169K)
function formatCompact(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  if (num >= 1000000) return `${Math.round(num / 1000000)}M`;
  if (num >= 1000) return `${Math.round(num / 1000)}K`;
  return String(Math.round(num));
}

// Deterministic last-resort fix for the rawNumberDump hard check: rewrites any
// raw 4+ digit number left in a body (a subscriber/view count the model failed
// to reformat across all attempts) into rounded human form — "59,595" or
// "59595" -> "around 60K". Skips 4-digit numbers that read as a plausible
// calendar year (1900-2099, no comma grouping) — rounding "in 2026" into
// "around 2K" would be actively wrong, not safer.
function roundHumanNumbers(text) {
  return (text || '').replace(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g, (match) => {
    const num = Number(match.replace(/,/g, ''));
    if (!Number.isFinite(num)) return match;
    if (!match.includes(',') && match.length === 4 && num >= 1900 && num <= 2099) return match;
    return `around ${formatCompact(num)}`;
  });
}

// Rough syllable counter — good enough for a Flesch-Kincaid estimate. Not
// linguistically perfect, but consistent, which is all a regen-trigger needs.
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^aeiouy]es|ed|[^aeiouy]e)$/, '');
  const matches = stripped.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// Flesch-Kincaid grade level. Target band per spec: grade 3-5.
function fleschKincaidGrade(text) {
  const sents = splitSentences(text);
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (!sents.length || !words.length) return null;
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  return 0.39 * (words.length / sents.length) + 11.8 * (syllables / words.length) - 15.59;
}

// ═══════════════════════════════════════════════════════════════════════════
// HARD — ban list / auto-fail rules (spec section 3, "Ban list")
// ═══════════════════════════════════════════════════════════════════════════

const BANNED_PHRASES = [
  /i hope this (email )?finds you well/i,
  /i wanted to reach out/i, /i'?m reaching out/i,
  /i came across your channel/i,
  /love your content/i, /amazing content/i, /incredible work/i,
  /collaboration opportunity/i, /exciting opportunity/i,
  /leaving money on the table/i,
  /i'?d love to (connect|chat|help)/i,
  /hope to hear from you soon/i,
  /as per my previous email/i,
  /it'?s worth noting/i, /it'?s important to note/i,
  /\b(leverage|synerg(?:y|ies)|streamline|seamless|cutting-edge|robust|scalable|innovative|navigate|delve|ensure|multifaceted|tapestry|optimize)\b/i,
  /in today'?s .{0,30}landscape/i,
  /best regards|kind regards|sincerely|warm regards/i,
  /\b(moreover|furthermore|additionally|in conclusion)\b/i,
  /at the end of the day|it goes without saying/i,
  /we are a team of|we specialize in/i,
  // First-touch CTA bans — calendar links / "hop on a call" read as a stranger's ask, not a peer's.
  /calendly\.com|cal\.com\/|book(?:ing)? a call|hop on a call|quick 30[- ]?min(?:ute)?s?|schedule a call/i,
];

const HARD_CHECKS = {
  tooLong:  (body) => wordCount(body) > 140,
  tooShort: (body) => wordCount(body) < 60,
  // Any 4+ digit raw number — "623,908" or "12453". Formatted numbers like
  // "623K" / "1.2M" don't match, which is the point: force the model to
  // convert stats into story form instead of dumping the stat the creator
  // already knows.
  rawNumberDump: (body) => /\b\d{4,}\b/.test((body || '').replace(/,/g, '')),
  ruleOfThree: (body) => /\b(\w+),\s*(\w+),\s*and\s+(\w+)\b/.test(body || ''),
  ingSentenceOpener: (body) => /(^|[.!?]\s+)[A-Z][a-z]*ing\b/.test(body || ''),
  // More than one em-dash anywhere in the email — global count, not per-sentence.
  tooManyEmDashes: (body) => ((body || '').match(/—|--/g) || []).length > 1,
  mentionsPricing: (body) => /\$\d|₹\d|\d+ ?(per|\/) ?(month|video|hour)/i.test(body || ''),
};

// ═══════════════════════════════════════════════════════════════════════════
// SOFT — "regen" rows from the quality-gate-v2 table + structural nits.
// Reported as violations but do not fail runCodeGate() on their own.
// ═══════════════════════════════════════════════════════════════════════════

const SOFT_CHECKS = {
  startsWithI: (body) => /^i\b/i.test((body || '').trim()),
  hasExclamation: (body, subject) => /!/.test(`${body || ''} ${subject || ''}`),
  // Word count 70-120 is the target; 60-140 is merely the hard-block floor/ceiling.
  offTargetLength: (body) => { const wc = wordCount(body); return wc >= 60 && wc <= 140 && (wc < 70 || wc > 120); },
  // Burstiness: needs at least one sentence under 5 words AND one over 20.
  noBurstiness: (body) => {
    const lens = sentenceWordCounts(body);
    if (lens.length < 2) return true;
    return !(lens.some(n => n < 5) && lens.some(n => n > 20));
  },
  // 3+ consecutive sentences in the 12-26 word "written prose" band — a marketing-cadence tell.
  uniformRhythm: (body) => {
    const lens = sentenceWordCounts(body);
    let streak = 0;
    for (const len of lens) {
      if (len >= 12 && len <= 26) { streak++; if (streak >= 3) return true; }
      else streak = 0;
    }
    return false;
  },
  noQuestionCTA: (body) => !/\?\s*$/.test((body || '').replace(/\s*(P\.?S\.?[\s\S]*)$/i, '').trim()),
  tooManyQuestions: (body) => (body.match(/\?/g) || []).length > 3,
  noContractions: (body) => !/\b\w+'(t|re|ll|ve|d|m)\b/i.test(body || ''),
  psAbsent: (body) => !/(^|\n)\s*p\.?\s?s\.?[:\s]/i.test(body || ''),
  readingGradeOff: (body) => { const g = fleschKincaidGrade(body); return g != null && (g < 2 || g > 6.5); },
  subjectTooLong: (_body, subject) => (subject || '').trim().split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length > 5,
  subjectHasUppercaseWord: (_body, subject) => /\b[A-Z][a-z]+/.test(subject || ''), // allow all-caps acronyms
  subjectHasQuestionMark: (_body, subject) => /\?/.test(subject || ''),
  // Sentence-pattern tells that read as "composed" rather than typed quickly.
  concessiveContrast: (body) => {
    const text = body || '';
    return (
      /\b(is|are|was|were|'s|'re|sounds?|looks?)\s+(fine|solid|great|good|good enough)\b[^.!?]*\bbut\b/i.test(text) ||
      /\b(?:(?:is|are|was|were|'s|'re)\s+not|isn'?t|aren'?t|wasn'?t|weren'?t)\s+(bad|terrible|awful|the worst)\b[^.!?]*\bbut\b/i.test(text) ||
      /\bnot\s+\w+(?:\s+\w+)?\s*[—–-]\s*but\b/i.test(text)
    );
  },
  binaryReframe: (body) => /\b(it'?s|that'?s) not (a |an )?[\w\s]{2,30}?\.\s*(it'?s|that'?s) (a |an )?\w/i.test(body || ''),
  setupReveal: (body) => /(means one thing|here'?s what'?s (actually |really )?happening|the (real |actual )?reason is)[:]/i.test(body || ''),
  emDashStack: (body) => (body || '').split(/[.!?]/).some(s => (s.match(/—|--/g) || []).length >= 2),
};

// Personalization proof: at least one real, verifiable element from the lead's
// actual intelligence must appear in the body — a video title fragment or an
// exact stat. A ratio alone ("169K subs, 15K views") does not count. This is
// the code-level enforcement of the input contract's rule: no watched signal,
// no email — hard-fails runCodeGate() same as the ban list.
function personalizationCheck(body, intelligencePack) {
  const pack = intelligencePack || {};
  const hook = pack.hook_data || {};
  const lowerBody = (body || '').toLowerCase();

  const titles = [hook.most_recent_video_title, hook.best_video_title].filter(Boolean);
  const hasTitleRef = titles.some(title =>
    title.split(/\s+/).filter(w => w.length > 4)
      .some(w => lowerBody.includes(w.toLowerCase()))
  );

  const stats = [pack.subscribers, hook.recent_avg_views, hook.channel_avg_views,
    hook.best_video_views, hook.most_recent_video_views, pack.last_upload_days_ago]
    .filter(v => v != null && v !== 0);
  const hasStatRef = stats.some(s => lowerBody.includes(formatCompact(s).toLowerCase()) || lowerBody.includes(String(s)));

  return hasTitleRef || hasStatRef;
}

// Does the lead have a specific video title at all? Per the input contract
// this is the strongest signal — generateWithMarcus tries a live YouTube
// lookup when this is false before falling back to hasAnySignal below.
function hasWatchedSignal(intelligencePack) {
  const hook = (intelligencePack || {}).hook_data || {};
  return !!(hook.most_recent_video_title || hook.best_video_title);
}

// Is there ANYTHING real to personalize on — a title, or failing that, a
// real number (subscriber count, view average, upload gap)? This is
// deliberately more permissive than hasWatchedSignal: a video-title-less
// lead can still get a genuinely personalized email off subscriber count or
// upload cadence (personalizationCheck below accepts either). Only block
// generation entirely — needs-research — when NOTHING verifiable exists at
// all, which should be rare; most of this app's leads carry at least a
// subscriber count from the YouTube scrape.
function hasAnySignal(intelligencePack) {
  const p = intelligencePack || {};
  const hook = p.hook_data || {};
  if (hasWatchedSignal(p)) return true;
  return !!(p.subscribers || hook.recent_avg_views || hook.channel_avg_views || p.last_upload_days_ago != null);
}

/**
 * Runs every deterministic check against a generated email.
 * @param {{subject: string, body: string}} email
 * @param {object} intelligencePack - from buildCreatorIntelligencePack(lead)
 * @returns {{passed: boolean, violations: Array<{type: string, severity: 'hard'|'soft', found?: string, note?: string}>}}
 */
function runCodeGate(email, intelligencePack) {
  const violations = [];
  const subject = email?.subject || '';
  const body = email?.body || '';

  for (const pattern of BANNED_PHRASES) {
    const m = body.match(pattern) || subject.match(pattern);
    if (m) violations.push({ type: 'banned_phrase', severity: 'hard', found: m[0] });
  }

  for (const [name, check] of Object.entries(HARD_CHECKS)) {
    if (check(body, subject)) violations.push({ type: name, severity: 'hard' });
  }

  for (const [name, check] of Object.entries(SOFT_CHECKS)) {
    if (check(body, subject)) violations.push({ type: name, severity: 'soft' });
  }

  if (!personalizationCheck(body, intelligencePack)) {
    violations.push({
      type: 'no_verifiable_personalization',
      severity: 'hard',
      note: 'Body contains no actual video title fragment or real stat from lead data',
    });
  }

  return {
    passed: violations.every(v => v.severity !== 'hard'),
    violations,
    hardViolations: violations.filter(v => v.severity === 'hard'),
    softViolations: violations.filter(v => v.severity === 'soft'),
  };
}

// One-line feedback for the targeted retry — names the FIRST (hard, if any,
// else first soft) violation only, so the model fixes one thing instead of
// receiving a wall of feedback.
function describeViolation(violation) {
  switch (violation.type) {
    case 'banned_phrase': return `used the banned phrase "${violation.found}"`;
    case 'startsWithI': return 'started the body with "I"';
    case 'tooLong': return 'body ran over 140 words (hard limit)';
    case 'tooShort': return 'body was under 60 words (hard limit)';
    case 'offTargetLength': return 'body was inside the 60-140 word floor/ceiling but outside the 70-120 sweet spot';
    case 'rawNumberDump': return 'used a raw 4+ digit number instead of a formatted stat or a story-form comparison';
    case 'ruleOfThree': return 'used a rule-of-three list for rhythm';
    case 'ingSentenceOpener': return 'opened a sentence with an "-ing" word';
    case 'tooManyEmDashes': return 'used more than one em-dash in the email';
    case 'mentionsPricing': return 'mentioned pricing';
    case 'noBurstiness': return 'sentence lengths were too uniform — needs at least one under-5-word sentence and one over-20-word sentence';
    case 'uniformRhythm': return 'had 3+ consecutive sentences of near-identical length';
    case 'noQuestionCTA': return 'CTA did not end in a question';
    case 'tooManyQuestions': return 'asked more than 3 questions total';
    case 'noContractions': return 'used zero contractions — reads composed, not typed';
    case 'psAbsent': return 'missing a P.S. line with a genuine specific detail';
    case 'readingGradeOff': return 'reading level drifted outside the grade 3-5 band';
    case 'subjectTooLong': return 'subject line was over 5 words';
    case 'subjectHasUppercaseWord': return 'subject line was not lowercase';
    case 'subjectHasQuestionMark': return 'subject line had a question mark';
    case 'hasExclamation': return 'used an exclamation mark';
    case 'concessiveContrast': return 'used a concessive-contrast sentence ("X is fine, but Y")';
    case 'binaryReframe': return 'used a binary reframe ("it\'s not X, it\'s Y")';
    case 'setupReveal': return 'used a setup-then-reveal construction ("here\'s what\'s happening:")';
    case 'emDashStack': return 'stacked multiple em-dashes in one sentence';
    case 'no_verifiable_personalization': return 'contained no real video title or stat from this creator\'s actual data — ratio math alone is not personalization';
    default: return violation.type;
  }
}

module.exports = {
  runCodeGate,
  personalizationCheck,
  hasWatchedSignal,
  hasAnySignal,
  describeViolation,
  fleschKincaidGrade,
  wordCount,
  formatCompact,
  roundHumanNumbers,
  BANNED_PHRASES,
  HARD_CHECKS,
  SOFT_CHECKS,
};
