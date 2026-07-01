// Quality Gate — 8-Dimension, 100-point scoring + smart surgical regeneration

const { completeSmart } = require('./services/claudeService');
const { buildCreatorIntelligencePack } = require('./services/channelAnalyzer');

// ── Dimension max points (for sorting weakest dims) ────────────────────────────
const DIM_MAX = {
  replaceability:        25,
  personalization:       18,
  hook_strength:         15,
  sentence_architecture: 12,
  cta_quality:           10,
  value_proposition:     10,
  specificity:            5,
  tone_matching:          5,
};

// ── Scoring prompt (8 dimensions, 100 pts total) ───────────────────────────────

function buildScoringPrompt(subject, body, intelligencePack, voiceDNA, serviceType) {
  return `You are Quelro's email quality scoring engine. Score this cold outreach email on 8 dimensions.
Be RUTHLESS. Generous scoring helps nobody.

THE EMAIL TO SCORE:
Subject: ${subject}

Body:
${body}

THE CREATOR:
Channel: ${intelligencePack.channel_name}
Subscribers: ${intelligencePack.subscribers?.toLocaleString()}
Niche: ${intelligencePack.niche}
Recent video: ${intelligencePack.hook_data?.most_recent_video_title || 'N/A'}
Days since upload: ${intelligencePack.hook_data?.days_since_upload || 'N/A'}
Recent avg views: ${intelligencePack.hook_data?.recent_avg_views?.toLocaleString() || 'N/A'}
Pain signals: ${JSON.stringify(intelligencePack.pain_signals || {})}

SERVICE TYPE: ${serviceType || 'video editing'}

SCORING DIMENSIONS:

DIMENSION 1: REPLACEABILITY (25 points) — MOST IMPORTANT
Could this email (name swapped) be sent to ANY other creator in this niche?
25: 3+ facts unique to THIS creator that cannot apply to any other
15-24: 2 creator-specific facts — opening somewhat specific
5-14: Only 1 creator-specific fact
0-4: Generic — name swap works identically for any creator

DIMENSION 2: PERSONALIZATION (18 points)
Does the email reference specific, verifiable facts?
18: Specific video titles, exact view counts, upload patterns, creator-specific language
9-17: General facts (sub count, niche) but not specific content — ratio alone is NOT enough
0-8: No real personalization

DIMENSION 3: HOOK STRENGTH (15 points)
Does line 1 immediately prove research AND create a reason to keep reading?
15: Specific observation/diagnosis/data about THIS creator. Not a compliment. Does NOT start with "I"
8-14: Specific but doesn't create strong curiosity
0-7: Compliment, generic statement, or starts with "I"

DIMENSION 4: SENTENCE ARCHITECTURE (12 points)
Does this email avoid the 7 forbidden AI sentence patterns? Check every sentence:
1. Concessive contrast: "X is fine/solid, but Y is the problem" — the AI fairness tell
2. Setup-then-reveal: "that gap usually means one thing:" / "here's what's happening:"
3. Clean binary reframe: "It's not a X problem. It's a Y problem."
4. Stacked em-dashes: Two or more em-dashes in a single sentence
5. Rule of three: Any list or rhythm of exactly 3 parallel items
6. Abstract verbs used as the main verb: leverage, optimize, streamline, empower, elevate, unlock, transform, maximize
7. Uniform rhythm: 3+ consecutive sentences all within 5 words of each other in length

12: Zero forbidden patterns. Sentence lengths vary noticeably (at least one under 8 words, one over 15). Reads like a quick typed message.
8-11: 1 minor pattern instance, otherwise varied and natural
4-7: 2-3 pattern instances, or noticeably uniform rhythm throughout
0-3: 4+ pattern instances. Sounds like marketing copy or LinkedIn ghostwriter prose.

DIMENSION 5: CTA QUALITY (10 points)
One low-friction question easy to say yes to?
10: Single question, low commitment, natural language, ends with "?"
5-9: Single ask but slightly high commitment
0-4: Multiple asks, "book a call", no CTA, or doesn't end in "?"

DIMENSION 6: VALUE PROPOSITION (10 points)
Is the service positioned as solution to THIS creator's specific pain?
10: One clear benefit tied directly to the pain in the hook. No feature list. No price.
5-9: Value connected but not tight
0-4: Generic or feature list

DIMENSION 7: SPECIFICITY (5 points)
Real numbers, real video titles, real data?
5: 2+ specific numbers or named videos/results
3-4: 1 specific number or reference
0-2: All vague — stat ratios alone without named video/format do NOT count

DIMENSION 8: TONE MATCHING (5 points)
Does it sound human — like a real typed message?
5: Contractions present, varied sentence rhythm, reads like someone typed it quickly
2-4: Partial — some natural elements, some polished
0-1: Sounds composed/corporate/AI-written

AUTOMATIC FAIL CONDITIONS (total_score = 0 regardless):
- Body starts with "I" as first word
- Contains: "I hope this email finds you well", "I came across your channel", "love your content",
  "collaboration opportunity", "leaving money on the table", "I'd love to connect"
- Subject line over 7 words
- Body over 130 words
- Multiple CTAs (more than one question mark)
- Mentions pricing

AUTO-REGEN TRIGGER: If Dimension 1 scores below 15 → flag auto_regen = true

Return ONLY this JSON. No explanation. No preamble.

{
  "total_score": <0-100>,
  "pass": <true if total >= 85>,
  "auto_regen": <true if Dimension 1 < 15 OR any automatic fail met>,
  "hard_block": <true if total < 70>,
  "dimensions": {
    "replaceability":        { "score": <0-25>, "feedback": "<specific issue or strength>" },
    "personalization":       { "score": <0-18>, "feedback": "<specific issue or strength>" },
    "hook_strength":         { "score": <0-15>, "feedback": "<specific issue or strength>" },
    "sentence_architecture": { "score": <0-12>, "feedback": "<which patterns found or none>" },
    "cta_quality":           { "score": <0-10>, "feedback": "<specific issue or strength>" },
    "value_proposition":     { "score": <0-10>, "feedback": "<specific issue or strength>" },
    "specificity":           { "score": <0-5>,  "feedback": "<specific issue or strength>" },
    "tone_matching":         { "score": <0-5>,  "feedback": "<specific issue or strength>" }
  },
  "automatic_fail_triggered": <true|false>,
  "fail_reason": "<which condition was violated, or null>",
  "regeneration_instruction": "<if auto_regen: specific instruction for what must change>",
  "top_strength": "<the single best thing about this email>",
  "critical_fix": "<the single most important thing that must change>",
  "flagged_sentences": [
    {
      "sentence": "<exact sentence from draft>",
      "problem_type": "<concessive_contrast|setup_reveal|binary_reframe|em_dash_stack|rule_of_three|abstract_verb|uniform_rhythm|weak_personalization>",
      "specific_issue": "<what exactly is wrong with it>",
      "fix_direction": "<what the blunt, direct version should say instead>"
    }
  ]
}`;
}

// ── Legacy helpers (kept for backward compat) ──────────────────────────────────

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

// ── Evaluator ──────────────────────────────────────────────────────────────────

async function evaluateEmailQuality(emailText, intelligencePack, voiceDNA, serviceType) {
  let subject = '';
  let body = emailText;
  const subjectMatch = emailText.match(/^Subject:\s*(.+)\n/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    body = emailText.replace(subjectMatch[0], '').trim();
  }

  const pack = intelligencePack || {
    channel_name: 'Unknown', subscribers: 0, niche: 'Unknown', pain_signals: {}, hook_data: {},
  };

  try {
    const prompt = buildScoringPrompt(subject, body, pack, voiceDNA || {}, serviceType || 'video editing');
    const text = await completeSmart(prompt, '', 1400);
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const dims = parsed.dimensions || {};
    return {
      score:    parsed.total_score,
      passed:   parsed.pass,
      auto_regen: parsed.auto_regen,
      hard_block: parsed.hard_block,
      dimensions: dims,
      flagged_sentences: parsed.flagged_sentences || [],
      automatic_fail_triggered: parsed.automatic_fail_triggered,
      fail_reason: parsed.fail_reason,
      regeneration_instruction: parsed.regeneration_instruction,
      top_strength: parsed.top_strength,
      critical_fix: parsed.critical_fix,
      overall_feedback: `${parsed.top_strength} | Fix: ${parsed.critical_fix}`,
      breakdown: {
        personalization:       { points: dims?.personalization?.score       ?? 0, feedback: dims?.personalization?.feedback       ?? '' },
        hook:                  { points: dims?.hook_strength?.score         ?? 0, feedback: dims?.hook_strength?.feedback         ?? '' },
        sentence_architecture: { points: dims?.sentence_architecture?.score ?? 0, feedback: dims?.sentence_architecture?.feedback ?? '' },
        specificity:           { points: dims?.specificity?.score           ?? 0, feedback: dims?.specificity?.feedback           ?? '' },
        value_prop:            { points: dims?.value_proposition?.score     ?? 0, feedback: dims?.value_proposition?.feedback     ?? '' },
        cta:                   { points: dims?.cta_quality?.score           ?? 0, feedback: dims?.cta_quality?.feedback           ?? '' },
        tone:                  { points: dims?.tone_matching?.score         ?? 0, feedback: dims?.tone_matching?.feedback         ?? '' },
      },
    };
  } catch (err) {
    console.error('[QualityGate] Evaluation error:', err.message);
    return { score: 0, passed: false, error: true, overall_feedback: 'Evaluation failed', breakdown: {}, flagged_sentences: [] };
  }
}

// ── Regeneration context builder (legacy fallback path) ────────────────────────

function buildRegenerationContext(previousAttempts) {
  const last = previousAttempts[previousAttempts.length - 1];
  const dims = last.score?.dimensions || {};
  return `
PREVIOUS ATTEMPT FAILED (Score: ${last.score?.score || 0}/100)

Critical fix needed: ${last.score?.critical_fix || 'Improve specificity and replaceability'}
Regeneration instruction: ${last.score?.regeneration_instruction || 'Use a completely different opening hook'}

Dimension failures:
- Replaceability (${dims.replaceability?.score ?? '?'}/25): ${dims.replaceability?.feedback || ''}
- Hook (${dims.hook_strength?.score ?? '?'}/15): ${dims.hook_strength?.feedback || ''}
- Personalization (${dims.personalization?.score ?? '?'}/18): ${dims.personalization?.feedback || ''}

The previous email's opening was: "${(last.email || '').split('\\n')[0].substring(0, 100)}"
DO NOT use this opening or any similar structure.
Use a COMPLETELY DIFFERENT hook — new data point, new angle, new structure.
`.trim();
}

// ── Smart surgical regeneration prompt (used when intelligence pack available) ──

function buildSmartRegenPrompt(bestDraft, bestScore, attempts, voiceDNA, intelligencePack, angleResult) {
  const lastAttempt = attempts[attempts.length - 1];
  const dims = lastAttempt.score?.dimensions || {};
  const flaggedSentences = lastAttempt.score?.flagged_sentences || [];

  // Sort dimensions by % of max to surface the weakest first
  const dimLines = Object.entries(dims)
    .map(([k, v]) => ({ key: k, score: v.score, max: DIM_MAX[k] || 10, feedback: v.feedback }))
    .sort((a, b) => (a.score / a.max) - (b.score / b.max))
    .slice(0, 4)
    .map(d => `${d.key.replace(/_/g, ' ')} (${d.score}/${d.max}): ${d.feedback}`)
    .join('\n');

  const flaggedStr = flaggedSentences.length > 0
    ? flaggedSentences.map(f =>
        `SENTENCE: "${f.sentence}"\nPROBLEM: ${f.problem_type} — ${f.specific_issue}\nFIX: ${f.fix_direction}`
      ).join('\n\n')
    : `CRITICAL FIX: ${lastAttempt.score?.critical_fix || 'Make the opening hook more specific to this creator'}`;

  const senderName = voiceDNA.name || 'Alex';
  const serviceType = voiceDNA.service || 'video editing';

  return `You are editing a cold outreach email. This is SURGICAL WORK — do NOT rewrite from scratch.

BEST DRAFT SO FAR (Score: ${bestScore}/100):
${bestDraft}

WEAKEST DIMENSIONS:
${dimLines}

SENTENCES THAT MUST BE FIXED:
${flaggedStr}

YOUR ONLY JOB:
Fix the specific flagged sentences above. Leave every other sentence EXACTLY as written.
Do not add sentences. Do not change the angle or structure.
A sentence that isn't flagged scored well — touching it will make things worse.

THE BLUNT-DRAFT METHOD (apply to every fix):
Write the point as plainly and directly as possible. Skip all of the following:
- "X is fine/solid, but Y" → just say the problem directly
- "that usually means one thing:" → just say the thing
- "It's not X, it's Y" → say what it is, skip the negation
- Three em-dashes in one sentence → break into two sentences
- Three parallel items for rhythm → use two or restructure
- leverage / optimize / streamline / empower / elevate / unlock → say the specific action
Also: vary sentence length. Mix a short one (under 8 words) next to a longer one.

SENDER CONTEXT:
Name: ${senderName}
Service: ${serviceType}

Return ONLY this JSON:
{"subject": "<same subject unless it was flagged>", "body": "<edited body>", "word_count": <number>, "angle_used": "${angleResult?.selected_angle || ''}", "personalization_elements": [], "hook_type": "observation", "generation_notes": "surgical edit — attempt ${attempts.length + 1}"}`;
}

// ── Initial draft generator (backward compat, legacy path only) ───────────────

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

// ── Quality status helper ──────────────────────────────────────────────────────

function getQualityStatus(score) {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 85) return 'GOOD';
  if (score >= 70) return 'POLISHING';
  return 'NEEDS_REVIEW';
}

// ── 5-attempt quality gate loop ────────────────────────────────────────────────
// Params 5+6: fullIntelligencePack + angleResult from generateWithMarcus.
// When present: smart surgical regen. Without: legacy fallback.

async function runQualityGate(emailText, creatorData, voiceDNA, onAttempt, fullIntelligencePack, angleResult) {
  const MAX_ATTEMPTS    = 5;
  const TARGET_SCORE    = 85;
  const HARD_BLOCK_SCORE = 70;

  const scoringPack = fullIntelligencePack || {
    channel_name: creatorData.channelTitle || 'Unknown',
    subscribers:  creatorData.subscriberCount || 0,
    niche:        creatorData.niche || creatorData.category || 'general',
    pain_signals: {},
    hook_data: {
      most_recent_video_title: creatorData.recentVideoTitle,
      days_since_upload: null,
      recent_avg_views: creatorData.avgViews || 0,
      channel_avg_views: creatorData.avgViews || 0,
    },
  };

  let currentEmail = emailText;
  let bestEmail    = emailText;
  let bestResult   = null;
  let bestScore    = 0;
  let regenerated  = false;
  const attempts   = [];

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const result = await evaluateEmailQuality(currentEmail, scoringPack, voiceDNA, voiceDNA.service || 'video editing');
    console.log(`[QualityGate] Attempt ${i}: ${result.score}/100 ${result.auto_regen ? '(auto_regen)' : ''}`);

    if (onAttempt) {
      try { await onAttempt(i, currentEmail, result); } catch {}
    }

    attempts.push({ email: currentEmail, score: result, attempt: i });

    if (result.score > bestScore) {
      bestScore  = result.score;
      bestEmail  = currentEmail;
      bestResult = result;
    }

    if (result.score >= TARGET_SCORE && !result.auto_regen) {
      return {
        email: currentEmail, quality: result,
        regenerated: i > 1, attempts: i, warning: false,
        qualityStatus: getQualityStatus(result.score),
      };
    }

    if (i < MAX_ATTEMPTS) {
      regenerated = true;

      // Regression guard: if score dropped from previous attempt, use bestEmail as base
      const prevScore = i >= 2 ? attempts[i - 2].score.score : 0;
      const regressionDetected = i >= 2 && result.score < prevScore;
      const regenBase = regressionDetected ? bestEmail : currentEmail;

      if (regressionDetected) {
        console.log(`[QualityGate] Regression ${result.score} < ${prevScore} — reverting to best (${bestScore})`);
      }

      let regenPrompt;
      if (fullIntelligencePack && angleResult) {
        regenPrompt = buildSmartRegenPrompt(
          regenBase, bestScore, attempts, voiceDNA, fullIntelligencePack, angleResult
        );
      } else {
        const regenContext = buildRegenerationContext(attempts);
        regenPrompt = `${MARCUS_LEGACY_PROMPT(creatorData, voiceDNA)}

${regenContext}

IMPORTANT: Write a completely different email. Use a new hook. Don't repeat the previous approach.
Return ONLY JSON: {"subject": "<subject>", "body": "<body>"}`;
      }

      try {
        const raw = await completeSmart(regenPrompt, '', 1400);
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
        currentEmail = parsed.body || raw;
      } catch (err) {
        console.error(`[QualityGate] Regen attempt ${i + 1} failed:`, err.message);
        currentEmail = bestEmail; // fallback to best on parse failure
      }
    }
  }

  return {
    email:         bestEmail,
    quality:       bestResult,
    regenerated,
    attempts:      MAX_ATTEMPTS,
    warning:       bestScore < HARD_BLOCK_SCORE,
    qualityStatus: getQualityStatus(bestScore),
  };
}

module.exports = {
  runQualityGate,
  evaluateEmailQuality,
  generateInitialDraft,
  buildCreatorData,
  buildScoringPrompt,
  getQualityStatus,
};
