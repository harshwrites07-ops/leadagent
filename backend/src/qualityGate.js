// Quality Gate V2 — Marcus v2 email-engine rebuild spec, section 5.
// 9-row point table, mostly deterministic (codeGate.js does word count, raw-
// stat-dump, ban-list, personalization, burstiness, CTA shape, reading grade,
// P.S. presence for free and instantly). The AI is only asked to judge the one
// thing code can't: tone (conversational vs. informative), plus a fact-check
// pass against the lead's verified data to kill hallucinated personalization.

const { completeSmart } = require('./services/claudeService');
const { buildCreatorIntelligencePack } = require('./services/channelAnalyzer');
const { runCodeGate, describeViolation, wordCount } = require('./services/codeGate');

// ═══════════════════════════════════════════════════════════════════════════
// AI GATE V2 — deterministic 95 pts (codeGate) + AI-judged tone (5 pts) + fact-check
// ═══════════════════════════════════════════════════════════════════════════

function buildLeadFactsCompact(intelligencePack) {
  const p = intelligencePack || {};
  const hook = p.hook_data || {};
  const facts = [];
  if (p.subscribers) facts.push(`subscribers: ${p.subscribers}`);
  if (hook.best_video_title) facts.push(`best video: "${hook.best_video_title}" (${hook.best_video_views || '?'} views)`);
  if (hook.most_recent_video_title) facts.push(`most recent video: "${hook.most_recent_video_title}" (${hook.most_recent_video_views || '?'} views)`);
  if (hook.recent_avg_views) facts.push(`recent avg views: ${hook.recent_avg_views}`);
  if (hook.channel_avg_views) facts.push(`channel avg views: ${hook.channel_avg_views}`);
  if (p.last_upload_days_ago != null) facts.push(`days since last upload: ${p.last_upload_days_ago}`);
  return facts.join('\n') || 'No verified facts available for this lead.';
}

// Deterministic 95-point subscore from codeGate's violation list. Mirrors the
// spec's table exactly: word count 15, personalization 20, no-raw-stat 15,
// ban-list 15, burstiness 10, CTA shape 10, reading grade 5, P.S. present 5.
function scoreDeterministic(gate, body) {
  const types = new Set(gate.violations.map(v => v.type));
  const has = (...t) => t.some(x => types.has(x));

  const wc = wordCount(body);
  const wordCountPts = (wc >= 70 && wc <= 120) ? 15 : has('tooLong', 'tooShort') ? 0 : 8;
  const personalizationPts = has('no_verifiable_personalization') ? 0 : 20;
  const rawStatPts = has('rawNumberDump') ? 0 : 15;
  const banListPts = has('banned_phrase', 'ruleOfThree', 'ingSentenceOpener', 'tooManyEmDashes', 'mentionsPricing') ? 0 : 15;
  const burstinessPts = has('noBurstiness') ? 0 : 10;
  const ctaPts = has('noQuestionCTA', 'tooManyQuestions') ? 0 : 10;
  const readingGradePts = has('readingGradeOff') ? 0 : 5;
  const psPts = has('psAbsent') ? 0 : 5;

  return {
    total: wordCountPts + personalizationPts + rawStatPts + banListPts + burstinessPts + ctaPts + readingGradePts + psPts,
    breakdown: {
      word_count:       { points: wordCountPts, max: 15, feedback: wordCountPts < 15 ? `${wc} words — target is 70-120` : '' },
      personalization:  { points: personalizationPts, max: 20, feedback: personalizationPts === 0 ? 'No real video title or stat from this lead\'s data appears in the body' : '' },
      no_raw_stat_dump: { points: rawStatPts, max: 15, feedback: rawStatPts === 0 ? 'Contains a raw 4+ digit number — convert to a formatted stat or story-form comparison' : '' },
      ban_list_clean:   { points: banListPts, max: 15, feedback: banListPts === 0 ? 'Hit a banned phrase, tricolon, -ing opener, pricing mention, or 2+ em-dashes' : '' },
      burstiness:       { points: burstinessPts, max: 10, feedback: burstinessPts === 0 ? 'Needs one sentence under 5 words and one over 20 words' : '' },
      cta_shape:        { points: ctaPts, max: 10, feedback: ctaPts === 0 ? 'CTA must end in exactly one question' : '' },
      reading_grade:    { points: readingGradePts, max: 5, feedback: readingGradePts === 0 ? 'Reading level drifted outside grade 3-5' : '' },
      ps_present:       { points: psPts, max: 5, feedback: psPts === 0 ? 'Missing a P.S. with a genuine specific detail' : '' },
    },
  };
}

function buildToneAndFactCheckPrompt(subject, body, intelligencePack, knownIssues) {
  return `Judge ONE thing about this cold email, plus fact-check it. Everything else (word count, banned phrases, personalization, CTA shape) has already been checked by a separate deterministic pass — do not re-score those.

EMAIL:
Subject: ${subject}
${body}

LEAD FACTS (verify claims against these — any number or title in the email that doesn't match is an automatic fail):
${buildLeadFactsCompact(intelligencePack)}
${knownIssues.length ? `\nKNOWN STRUCTURAL ISSUES (already detected, factor into weakest_sentence/fix_direction if relevant):\n${knownIssues.map(d => `- ${d}`).join('\n')}` : ''}

TONE (0-5): Is this conversational (a person typed it quickly between tasks) or informative (a service talking AT the reader)? 5 = unmistakably conversational — casual rhythm, sounds spoken. 0 = reads like a service description or marketing copy.

FACT CHECK: "fact_violations" must contain ONLY claims that are WRONG or unverifiable against the lead facts above. If every claim checks out, "fact_violations" MUST be an empty array []. Do NOT list confirmations.

Also name the single weakest sentence in the email (for a surgical one-sentence rewrite) and what it should do instead — pull from the known structural issues above if one applies, otherwise judge freely.

Return JSON only:
{"tone": N, "fact_violations": [], "weakest_sentence": "<exact sentence>", "fix_direction": "<one line>"}`;
}

async function evaluateEmailQualityV2(subject, body, intelligencePack) {
  const gate = runCodeGate({ subject, body }, intelligencePack || {});
  const deterministic = scoreDeterministic(gate, body);
  const knownIssues = gate.softViolations.map(describeViolation);

  try {
    const prompt = buildToneAndFactCheckPrompt(subject, body, intelligencePack || {}, knownIssues);
    const text = await completeSmart(prompt, '', 400);
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);

    const tonePts = Math.max(0, Math.min(5, Number.isFinite(parsed.tone) ? parsed.tone : 0));
    // Defensive filter: some model responses pad fact_violations with
    // confirmation entries ("X — confirmed, no violation") instead of leaving
    // the array empty. Only count entries that actually describe a mismatch.
    const realViolations = (Array.isArray(parsed.fact_violations) ? parsed.fact_violations : [])
      .filter(v => !/no violation|confirmed|correct|matches|checks out/i.test(String(v)));
    const hasFactViolation = realViolations.length > 0;

    const rawTotal = deterministic.total + tonePts;
    // Hard-block conditions (spec: word count/personalization/raw-stat/ban-list
    // are all "hard block" rows) and fact violations both force the email below
    // the 70 threshold so runQualityGate's existing regen/angle-switch path
    // picks it up, without needing separate control flow here.
    const hardBlocked = gate.hardViolations.length > 0 || hasFactViolation;
    const total = hardBlocked ? Math.min(rawTotal, 40) : rawTotal;

    return {
      score: total,
      passed: total >= 85 && !hardBlocked,
      hardBlocked,
      codeGateViolations: gate.violations,
      dimensions: {
        ...deterministic.breakdown,
        tone: { score: tonePts, max: 5 },
      },
      fact_violations:  realViolations,
      weakest_sentence: parsed.weakest_sentence || '',
      fix_direction:    parsed.fix_direction || (gate.hardViolations[0] ? describeViolation(gate.hardViolations[0]) : ''),
      breakdown: {
        ...deterministic.breakdown,
        tone: { points: tonePts, max: 5, feedback: tonePts < 5 ? 'Reads informative rather than conversational' : '' },
      },
      overall_feedback: parsed.fix_direction || (gate.hardViolations[0] ? describeViolation(gate.hardViolations[0]) : ''),
    };
  } catch (err) {
    console.error('[QualityGate] V2 evaluation error:', err.message);
    // Even if the AI call fails, ship the deterministic part of the score —
    // it's free and already computed, no reason to zero it out.
    const hardBlocked = gate.hardViolations.length > 0;
    return {
      score: hardBlocked ? Math.min(deterministic.total, 40) : deterministic.total,
      passed: false,
      hardBlocked,
      error: true,
      codeGateViolations: gate.violations,
      breakdown: deterministic.breakdown,
      weakest_sentence: '',
      fix_direction: gate.hardViolations[0] ? describeViolation(gate.hardViolations[0]) : '',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Surgical fix — edits ONLY the flagged weakest_sentence, per Part 5
// ═══════════════════════════════════════════════════════════════════════════

function buildSurgicalFixPrompt(subject, body, weakestSentence, fixDirection) {
  return `You are editing a cold outreach email. This is SURGICAL WORK — do NOT rewrite from scratch.

CURRENT EMAIL:
Subject: ${subject}
${body}

THE ONE SENTENCE THAT MUST CHANGE:
"${weakestSentence}"

WHAT IT SHOULD DO INSTEAD:
${fixDirection}

YOUR ONLY JOB: fix that sentence. Leave every other sentence exactly as written — they scored well, touching them will make things worse. Keep the same subject unless it was the flagged text.

Return ONLY this JSON:
{"subject": "${subject.replace(/"/g, '\\"')}", "body": "<edited body>"}`;
}

async function surgicalFix(subject, body, weakestSentence, fixDirection) {
  try {
    const prompt = buildSurgicalFixPrompt(subject, body, weakestSentence, fixDirection);
    const raw = await completeSmart(prompt, '', 400);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
    return { subject: parsed.subject || subject, body: parsed.body || body };
  } catch (err) {
    console.error('[QualityGate] Surgical fix failed:', err.message);
    return { subject, body };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Angle-switch regeneration — full redraft with a different angle, used only
// when 2 consecutive AI-gate attempts score under 70 (Part 5)
// ═══════════════════════════════════════════════════════════════════════════

async function angleSwitchRegenerate(lead, user, voiceDNA, intelligencePack, previousAngleResult) {
  const { selectAngle } = require('./services/angleEngine');
  const { buildMARCUSPrompt } = require('./services/claudeService');

  const newAngleResult = selectAngle(intelligencePack, { ...user, voice_dna: voiceDNA }, {
    excludeAngle: previousAngleResult?.selected_angle,
  });

  const prompt = buildMARCUSPrompt(lead, user, voiceDNA, intelligencePack, newAngleResult, null);
  try {
    const raw = await completeSmart(prompt, '', 1200);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
    if (!parsed.subject || !parsed.body) throw new Error('Missing subject/body');

    // Run the fresh draft through the code gate too — it's a genuinely new
    // generation, not an edit, so it needs the same deterministic checks.
    const gate = runCodeGate(parsed, intelligencePack);
    if (!gate.passed) {
      console.log(`[QualityGate] Angle-switch draft has code-gate violations: ${gate.violations.map(v => v.type).join(', ')} — shipping anyway (last resort)`);
    }
    return { subject: parsed.subject, body: parsed.body, angleResult: newAngleResult };
  } catch (err) {
    console.error('[QualityGate] Angle-switch regeneration failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Legacy helpers — kept for backward compat (buildCreatorData/getQualityStatus
// are still used by every route call site; generateInitialDraft/MARCUS_LEGACY_PROMPT
// preserved per Part 8 instruction not to delete old prompt code).
// ═══════════════════════════════════════════════════════════════════════════

function buildCreatorData(lead) {
  let recentVideoTitle = lead.recent_video_title || null;
  if (!recentVideoTitle) {
    try {
      const videos = JSON.parse(lead.recent_videos || '[]');
      recentVideoTitle = videos[0]?.title || null;
    } catch {}
  }
  const subCount = Number(lead.subscriber_count) || 0;
  const avgViews = Number(lead.avg_views) || 0;
  const viewSubRatio = subCount > 0 ? `${Math.round((avgViews / subCount) * 100)}%` : 'Unknown';
  let intentSignal = 'General interest';
  try {
    const pts = JSON.parse(lead.pain_points || '[]');
    if (pts.length) intentSignal = pts.slice(0, 3).join(', ');
  } catch {}
  return {
    channelTitle:  lead.channel_name || 'Unknown',
    subscriberCount: subCount,
    niche:         lead.niche || 'Unknown',
    category:      lead.niche || 'Unknown',
    avgViews,
    viewSubRatio,
    recentVideoTitle,
    uploadFrequency: lead.upload_frequency_days
      ? `Every ${Math.round(lead.upload_frequency_days)} days` : 'Unknown',
    intentSignal,
    descriptionKeywords: (lead.channel_description || '').slice(0, 200) || 'Unknown',
    growthTrend: lead.view_trend || 'Unknown',
  };
}

const MARCUS_LEGACY_PROMPT = (creatorData, voiceDNA) => `You are Marcus — an elite cold email writer for YouTube creator outreach.
Write cold emails that make a real human being stop, read carefully, and reply within 24 hours.

CREATOR:
- Channel: ${creatorData.channelTitle}
- Subscribers: ${Number(creatorData.subscriberCount || 0).toLocaleString()}
- Niche: ${creatorData.niche || creatorData.category}
- Average Views: ${Number(creatorData.avgViews || 0).toLocaleString()}
- Recent Video: ${creatorData.recentVideoTitle || 'Unknown'}
- Upload Frequency: ${creatorData.uploadFrequency || 'Unknown'}
- Intent Signal: ${creatorData.intentSignal || 'General interest'}

SENDER:
- Name: ${voiceDNA.name || 'Unknown'}
- Service: ${voiceDNA.service || 'video editing'}
- Social proof: ${voiceDNA.socialProof || voiceDNA.best_result || 'Not specified'}
- Style: ${voiceDNA.communicationStyle || 'professional but casual'}

RULES:
1. 60-90 words body. Hard limit.
2. Do NOT start with "I"
3. Line 1: specific observation about THIS creator — not transferable to anyone else
4. Banned: "I hope this finds you well", "I came across", "love your content", "collaboration", "exciting opportunity"
5. One CTA only — a question ending in "?"
6. Sign with first name only
7. Subject: 3-5 words, all lowercase

Return ONLY JSON:
{"subject": "<subject>", "body": "<body>"}`;

async function generateInitialDraft(creatorData, voiceDNA) {
  const prompt = MARCUS_LEGACY_PROMPT(creatorData, voiceDNA);
  try {
    const text = await completeSmart(prompt, '', 600);
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
    return parsed.body || text;
  } catch {
    const text = await completeSmart(MARCUS_LEGACY_PROMPT(creatorData, voiceDNA), '', 500);
    return text.trim();
  }
}

function getQualityStatus(score) {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 85) return 'GOOD';
  if (score >= 70) return 'POLISHING';
  return 'NEEDS_REVIEW';
}

function stripSubjectPrefix(text) {
  return text.replace(/^Subject:\s*.+\n+/i, '').trim();
}

function splitSubjectBody(emailText) {
  let subject = '';
  let body = emailText;
  const m = emailText.match(/^Subject:\s*(.+)\n/i);
  if (m) {
    subject = m[1].trim();
    body = emailText.replace(m[0], '').trim();
  }
  return { subject, body };
}

// ═══════════════════════════════════════════════════════════════════════════
// runQualityGate — Marcus V2 orchestrator (Part 2 + Part 5).
// Signature stays backward compatible with all existing call sites; `lead`
// and `user` are new OPTIONAL trailing params that unlock the angle-switch
// regeneration step. Without them, the gate still runs (code gate already
// happened inside generateWithMarcus) but falls back to surgical-only retries.
//
// Flow: AI-gate score → 85+ ship · 70-84 one surgical retry · <70 twice in a
// row → angle-switch regenerate once → still <70 → NEEDS_REVIEW.
// Max 3 total AI generations (1 initial, already done by the caller, + up to
// 2 more here).
// ═══════════════════════════════════════════════════════════════════════════

async function runQualityGate(emailText, creatorData, voiceDNA, onAttempt, fullIntelligencePack, angleResult, lead = null, user = null) {
  const TARGET_SCORE = 85;
  const HARD_BLOCK_SCORE = 70;
  const gateStart = Date.now();

  const scoringPack = fullIntelligencePack || {
    channel_name: creatorData.channelTitle || 'Unknown',
    subscribers:  creatorData.subscriberCount || 0,
    niche:        creatorData.niche || creatorData.category || 'general',
    pain_signals: {},
    hook_data: {
      most_recent_video_title: creatorData.recentVideoTitle,
      recent_avg_views: creatorData.avgViews || 0,
      channel_avg_views: creatorData.avgViews || 0,
    },
  };

  let { subject, body } = splitSubjectBody(emailText);
  let currentAngleResult = angleResult;
  let bestScore = -1, bestSubject = subject, bestBody = body, bestResult = null;
  let attemptNum = 0;
  let regenerated = false;
  let under70Count = 0;

  async function score(label) {
    attemptNum++;
    const t0 = Date.now();
    const result = await evaluateEmailQualityV2(subject, body, scoringPack);
    console.log(`[QualityGate] ${label} (attempt ${attemptNum}): score=${result.score}/100 eval=${Date.now() - t0}ms`);
    if (onAttempt) { try { await onAttempt(attemptNum, `Subject: ${subject}\n\n${body}`, result); } catch {} }
    if (result.score > bestScore) { bestScore = result.score; bestSubject = subject; bestBody = body; bestResult = result; }
    return result;
  }

  // ── Attempt 1: score the draft as generated ──────────────────────────────
  let result = await score('initial');

  if (result.score >= TARGET_SCORE) {
    console.log(`[QualityGate] PASS — total=${Date.now() - gateStart}ms`);
    return { email: stripSubjectPrefix(`Subject: ${subject}\n\n${body}`), quality: result, regenerated: false, attempts: attemptNum, warning: false, qualityStatus: getQualityStatus(result.score) };
  }

  if (result.score < HARD_BLOCK_SCORE) under70Count++;

  // ── 70-84: one surgical retry on the weakest sentence ────────────────────
  if (result.score >= HARD_BLOCK_SCORE && result.score < TARGET_SCORE && result.weakest_sentence) {
    regenerated = true;
    const fixed = await surgicalFix(subject, body, result.weakest_sentence, result.fix_direction);
    subject = fixed.subject; body = fixed.body;
    result = await score('surgical retry');
    if (result.score >= TARGET_SCORE) {
      console.log(`[QualityGate] PASS after surgical retry — total=${Date.now() - gateStart}ms`);
      return { email: stripSubjectPrefix(`Subject: ${subject}\n\n${body}`), quality: result, regenerated: true, attempts: attemptNum, warning: false, qualityStatus: getQualityStatus(result.score) };
    }
    if (result.score < HARD_BLOCK_SCORE) under70Count++;
  }

  // ── <70 twice (or 70-84 surgical retry still landed <70): angle-switch ──
  if (under70Count >= 2 && lead && user) {
    regenerated = true;
    const regen = await angleSwitchRegenerate(lead, user, voiceDNA, scoringPack, currentAngleResult);
    if (regen) {
      subject = regen.subject; body = regen.body; currentAngleResult = regen.angleResult;
      console.log(`[QualityGate] Angle-switch regen: ${currentAngleResult.selected_angle}`);
      result = await score('angle-switch regen');
      if (result.score >= TARGET_SCORE) {
        console.log(`[QualityGate] PASS after angle-switch — total=${Date.now() - gateStart}ms`);
        return { email: stripSubjectPrefix(`Subject: ${subject}\n\n${body}`), quality: result, regenerated: true, attempts: attemptNum, warning: false, qualityStatus: getQualityStatus(result.score) };
      }
    }
  } else if (under70Count >= 2 && result.score >= HARD_BLOCK_SCORE) {
    // Landed in 70-84 after the surgical retry but no lead/user for angle-switch — ship best.
  }

  console.log(`[QualityGate] DONE: best=${bestScore}/100 attempts=${attemptNum} total=${Date.now() - gateStart}ms status=NEEDS_REVIEW`);
  return {
    email:         stripSubjectPrefix(`Subject: ${bestSubject}\n\n${bestBody}`),
    quality:       bestResult,
    regenerated,
    attempts:      attemptNum,
    warning:       bestScore < HARD_BLOCK_SCORE,
    qualityStatus: getQualityStatus(bestScore),
  };
}

module.exports = {
  runQualityGate,
  evaluateEmailQualityV2,
  buildToneAndFactCheckPrompt,
  generateInitialDraft,
  buildCreatorData,
  getQualityStatus,
};
