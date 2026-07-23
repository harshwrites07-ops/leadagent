// Quality Gate V4 — deterministic pipeline rebuild (Marcus V4 spec, Stage 4).
// Pure code checks, no AI judge. 7 checks, 100 points, every check always
// returns {name, points_awarded, points_possible, detail} — a check that
// throws scores 0 with the error in `detail`, never a missing key. The array
// is always length 7; if it's ever not, the caller must block the email.

const { completeSmart, extractJsonObject } = require('./services/claudeService');
const { runCodeGate, describeViolation, wordCount, fleschKincaidGrade, BANNED_PHRASES } = require('./services/codeGate');

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 4 — deterministic quality gate. 7 checks, 100 points total.
// ═══════════════════════════════════════════════════════════════════════════

function splitBodyParagraphs(body) {
  return (body || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

function stripSignOffLine(text) {
  const noPs = (text || '').replace(/\s*(?:^|\n)\s*P\.?\s?S\.?[:\s][\s\S]*$/i, '');
  const lines = noPs.split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (/^—?\s*[A-Za-z][a-zA-Z']{0,20}$/.test(last)) lines.pop();
  }
  return lines.join('\n').trimEnd();
}

// Each entry: name, points_possible, and a fn(subject, body, intelligencePack)
// that returns { pass, detail } — thrown errors are caught by the runner below.
const CHECKS = [
  {
    name: 'personalization_proof',
    points_possible: 30,
    run: (subject, body, pack) => {
      const { personalizationCheck } = require('./services/codeGate');
      const ok = personalizationCheck(body, pack || {});
      return {
        pass: ok,
        detail: ok
          ? 'Contains a verbatim video title fragment or real stat from this lead\'s data'
          : 'No real video title or stat from this lead\'s data appears in the body — ratio math alone does not count',
      };
    },
  },
  {
    name: 'ban_list_clean',
    points_possible: 20,
    run: (subject, body, pack) => {
      const gate = runCodeGate({ subject, body }, pack || {});
      const banHits = gate.violations.filter(v =>
        v.severity === 'hard' &&
        ['banned_phrase', 'ruleOfThree', 'ingSentenceOpener', 'tooManyEmDashes', 'mentionsPricing', 'unverifiedNumber', 'spamSubject'].includes(v.type));
      const ok = banHits.length === 0;
      return {
        pass: ok,
        detail: ok ? 'Zero banned patterns survived' : banHits.map(describeViolation).join('; '),
      };
    },
  },
  {
    name: 'reading_grade',
    points_possible: 15,
    run: (subject, body) => {
      const grade = fleschKincaidGrade(body);
      const ok = grade != null && grade <= 7;
      return {
        pass: ok,
        detail: grade == null
          ? 'Could not compute reading grade (empty body)'
          : `Flesch-Kincaid grade ${grade.toFixed(1)}${ok ? ' (≤7)' : ' — target is ≤ grade 7'}`,
      };
    },
  },
  {
    name: 'structure',
    points_possible: 15,
    run: (subject, body) => {
      const paragraphs = splitBodyParagraphs(body);
      const hasParagraphs = paragraphs.length >= 3;
      const ctaLine = stripSignOffLine(body);
      const hasQuestionCTA = /\?\s*$/.test(ctaLine);
      const ok = hasParagraphs && hasQuestionCTA;
      const issues = [];
      if (!hasParagraphs) issues.push(`only ${paragraphs.length} paragraph(s) — needs greeting, observation, and proof/offer at minimum`);
      if (!hasQuestionCTA) issues.push('final content paragraph does not end in a single CTA question');
      return { pass: ok, detail: ok ? 'Four-movement skeleton present' : issues.join('; ') };
    },
  },
  {
    name: 'length',
    points_possible: 10,
    run: (subject, body) => {
      const wc = wordCount(body);
      const ok = wc >= 60 && wc <= 130;
      return { pass: ok, detail: `${wc} words${ok ? ' (60-130)' : ' — target is 60-130'}` };
    },
  },
  {
    name: 'ps_present',
    points_possible: 5,
    run: (subject, body) => {
      const ok = /(^|\n)\s*P\.?\s?S\.?[:\s]/i.test(body || '');
      return { pass: ok, detail: ok ? 'P.S. line present' : 'Missing a P.S. line with a genuine specific detail' };
    },
  },
  {
    name: 'subject_valid',
    points_possible: 5,
    run: (subject) => {
      const s = (subject || '').trim();
      const words = s.split(/\s+/).filter(Boolean);
      const wordCountOk = words.length >= 2 && words.length <= 6;
      const notTitleCase = !/\b[A-Z][a-z]+\b.*\b[A-Z][a-z]+\b/.test(s);
      const hasBannedWord = BANNED_PHRASES.some(p => p.test(s));
      const ok = wordCountOk && notTitleCase && !hasBannedWord;
      const issues = [];
      if (!wordCountOk) issues.push(`${words.length} words — target is 2-6`);
      if (!notTitleCase) issues.push('subject is title-cased, not lowercase/casual');
      if (hasBannedWord) issues.push('subject contains a banned phrase');
      return { pass: ok, detail: ok ? 'Subject line valid' : issues.join('; ') };
    },
  },
];

// Runs every check independently — one throwing never drops it from the
// array or corrupts the others. A thrown check scores 0 with the error
// named in `detail`, per the V4 spec's "no silent failures" rule.
function runChecks(subject, body, intelligencePack) {
  return CHECKS.map(({ name, points_possible, run }) => {
    try {
      const { pass, detail } = run(subject, body, intelligencePack);
      return { name, points_awarded: pass ? points_possible : 0, points_possible, detail };
    } catch (err) {
      return { name, points_awarded: 0, points_possible, detail: `check errored: ${err.message}` };
    }
  });
}

async function evaluateEmailQualityV2(subject, body, intelligencePack) {
  const checks = runChecks(subject, body, intelligencePack);
  const checksComplete = checks.length === CHECKS.length;
  const score = checks.reduce((sum, c) => sum + c.points_awarded, 0);
  const failedChecks = checks.filter(c => c.points_awarded < c.points_possible);
  const passed = checksComplete && score >= 70;

  // gate.hardViolations still drives regen/angle-switch triggers below —
  // recomputed here from the same codeGate pass the checks already ran.
  const gate = runCodeGate({ subject, body }, intelligencePack || {});
  const worst = failedChecks[0];

  return {
    score,
    passed,
    hardBlocked: !passed,
    checksComplete,
    checks,
    codeGateViolations: gate.violations,
    fix_direction: worst ? worst.detail : '',
    breakdown: checks,
    overall_feedback: worst ? worst.detail : '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Surgical fix — a targeted retry against the deterministic gate's worst check
// ═══════════════════════════════════════════════════════════════════════════

// Marcus V4 — the trigger is now the deterministic gate's own worst-check
// detail (fixDirection, e.g. "CTA must end in exactly one question"), not an
// AI-judged weakest_sentence. There's no quoted sentence to anchor on
// anymore, so this asks for a targeted fix against a named failing check
// instead of a single-sentence edit — still deliberately narrow ("don't
// rewrite from scratch") to avoid wasting the regen on unrelated changes.
function buildSurgicalFixPrompt(subject, body, fixDirection) {
  return `You are editing a cold outreach email. This is a TARGETED FIX — do NOT rewrite from scratch.

CURRENT EMAIL:
Subject: ${subject}
${body}

WHAT FAILED THE QUALITY GATE:
${fixDirection}

YOUR ONLY JOB: fix that specific problem. Leave everything else exactly as written — it already passed its checks, touching it will make things worse. Keep the same subject unless the subject itself is what failed.

Return ONLY this JSON:
{"subject": "${subject.replace(/"/g, '\\"')}", "body": "<edited body>"}`;
}

async function surgicalFix(subject, body, fixDirection) {
  try {
    const prompt = buildSurgicalFixPrompt(subject, body, fixDirection);
    const raw = await completeSmart(prompt, '', 400);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(extractJsonObject(cleaned));
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

// Marcus V4 P1-1 — regen feedback injection. previousGateResult is the
// evaluateEmailQualityV2() verdict that triggered this regen; its failed
// checks are named explicitly in the new prompt so the redraft fixes the
// specific things that failed instead of guessing blind.
async function angleSwitchRegenerate(lead, user, voiceDNA, intelligencePack, previousAngleResult, previousGateResult) {
  const { selectAngle } = require('./services/angleEngine');
  const { buildMARCUSPrompt } = require('./services/claudeService');

  const newAngleResult = selectAngle(intelligencePack, { ...user, voice_dna: voiceDNA }, {
    excludeAngle: previousAngleResult?.selected_angle,
  });

  const failedChecks = (previousGateResult?.checks || []).filter(c => c.points_awarded < c.points_possible);
  const feedback = failedChecks.length
    ? `Previous attempt failed: ${failedChecks.map(c => c.detail).join('; ')}. Fix these specifically.`
    : null;

  const prompt = buildMARCUSPrompt(lead, user, voiceDNA, intelligencePack, newAngleResult, feedback);
  try {
    const raw = await completeSmart(prompt, '', 1200);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(extractJsonObject(cleaned));
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
    const parsed = JSON.parse(extractJsonObject(cleaned));
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

  // ── 70-84: one surgical retry against the gate's own worst-check detail ──
  if (result.score >= HARD_BLOCK_SCORE && result.score < TARGET_SCORE && result.fix_direction) {
    regenerated = true;
    const fixed = await surgicalFix(subject, body, result.fix_direction);
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
    const regen = await angleSwitchRegenerate(lead, user, voiceDNA, scoringPack, currentAngleResult, result);
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

// ═══════════════════════════════════════════════════════════════════════════
// classifyGateOutcome — turns a runQualityGate() result into the terminal
// state the route layer should surface. Retries already happened inside
// runQualityGate (initial + surgical + angle-switch, server-side, before the
// caller ever sees this) — this only fires for the residual case where the
// best of those attempts still landed under the HARD_BLOCK_SCORE. Never ship
// that draft: either the lead genuinely has no real video title or view stat
// to personalize on (insufficient_data — a clean skip, not a weak email), or
// it does and Marcus just couldn't write a passing draft from it (needs_human,
// the same terminal state generateWithMarcus already uses when all 3 AI
// attempts fail outright).
// ═══════════════════════════════════════════════════════════════════════════
function classifyGateOutcome(gateResult, intelligencePack) {
  if (!gateResult || !gateResult.warning) return { outcome: 'ok' };
  const { hasContrastPair } = require('./services/codeGate');
  if (!hasContrastPair(intelligencePack)) {
    return {
      outcome: 'insufficient_data',
      message: 'Not enough public data for this channel to write a real pitch — no video title or view stat on file. Skip it.',
    };
  }
  const score = gateResult.quality?.score ?? '?';
  return {
    outcome: 'needs_human',
    message: `Marcus generated ${gateResult.attempts} draft${gateResult.attempts === 1 ? '' : 's'} but none cleared the quality bar (best score ${score}/100) — needs a human rewrite.`,
  };
}

module.exports = {
  runQualityGate,
  evaluateEmailQualityV2,
  generateInitialDraft,
  buildCreatorData,
  getQualityStatus,
  classifyGateOutcome,
  CHECKS,
  runChecks,
};
