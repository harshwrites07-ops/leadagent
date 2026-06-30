// Section E — Quality Gate Scoring (9-Dimension, 100-point scale)
// Uses completeSmart from claudeService for Claude-first with Gemini fallback.

const { completeSmart } = require('./services/claudeService');
const { buildCreatorIntelligencePack } = require('./services/channelAnalyzer');

// ── Scoring prompt (Section E.1) ───────────────────────────────────────────────

function buildScoringPrompt(subject, body, intelligencePack, voiceDNA, serviceType) {
  return `You are Quelro's email quality scoring engine. Score this cold outreach email on 9 dimensions.
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

DIMENSION 2: PERSONALIZATION (20 points)
Does the email reference specific, verifiable facts?
20: Specific video titles, exact view counts, upload patterns, creator-specific language
10-19: General facts (sub count, niche) but not specific content
0-9: No real personalization

DIMENSION 3: HOOK STRENGTH (15 points)
Does line 1 immediately prove research AND create a reason to keep reading?
15: Specific observation/diagnosis/data about THIS creator. Not a compliment. Creates open loop. Does NOT start with "I"
8-14: Specific but doesn't create strong curiosity
0-7: Compliment, generic statement, or starts with "I"

DIMENSION 4: SPECIFICITY (10 points)
Real numbers, real video titles, real data?
10: 2+ specific numbers or named videos/results
5-9: 1 specific number or reference
0-4: All vague

DIMENSION 5: VALUE PROPOSITION (10 points)
Is the service positioned as solution to THIS creator's specific pain?
10: One clear benefit tied directly to the pain in the hook. No feature list. No price.
5-9: Value connected but not tight
0-4: Generic or feature list

DIMENSION 6: CTA QUALITY (10 points)
One low-friction question easy to say yes to?
10: Single question, low commitment, natural language, ends with "?"
5-9: Single ask but slightly high commitment
0-4: Multiple asks, "book a call", no CTA, or doesn't end in "?"

DIMENSION 7: TONE MATCHING (5 points)
Does it sound human, like a real person — not AI?
5: Clear variation in sentence length, contractions present, no AI tells
2-4: Partial — some natural elements
0-1: Sounds like AI, generic, corporate

DIMENSION 8: AI DETECTION (3 points)
Does it contain AI tell-tale phrases?
3: Zero AI tells. Natural language. Contractions. No banned phrases.
1-2: 1-2 minor tells
0: Multiple tells or banned phrases present

BANNED PHRASES (any of these = 0 for dimension 8):
"I hope this email finds you well", "I came across your channel", "love your content",
"collaboration opportunity", "leaving money on the table", "I'd love to connect",
"exciting opportunity", "I wanted to reach out", "hope to hear from you",
"Best regards", "Kind regards", "leverage", "synergy", "cutting-edge", "innovative",
"in today's landscape", "Moreover", "Furthermore", "Additionally"

DIMENSION 9: SPAM SIGNALS (2 points)
Clean from spam triggers?
2: No banned words, no excessive punctuation, no all-caps
0-1: Minor concerns or spam triggers present

AUTOMATIC FAIL CONDITIONS (total_score = 0 regardless):
- Body starts with "I" as first word
- Contains: "I hope this email finds you well", "I came across your channel", "love your content",
  "collaboration opportunity", "leaving money on the table", "I'd love to connect"
- Subject line over 7 words
- Body over 120 words
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
    "replaceability":    { "score": <0-25>, "feedback": "<specific issue or strength>" },
    "personalization":   { "score": <0-20>, "feedback": "<specific issue or strength>" },
    "hook_strength":     { "score": <0-15>, "feedback": "<specific issue or strength>" },
    "specificity":       { "score": <0-10>, "feedback": "<specific issue or strength>" },
    "value_proposition": { "score": <0-10>, "feedback": "<specific issue or strength>" },
    "cta_quality":       { "score": <0-10>, "feedback": "<specific issue or strength>" },
    "tone_matching":     { "score": <0-5>,  "feedback": "<specific issue or strength>" },
    "ai_detection":      { "score": <0-3>,  "feedback": "<specific issue or strength>" },
    "spam_signals":      { "score": <0-2>,  "feedback": "<specific issue or strength>" }
  },
  "automatic_fail_triggered": <true|false>,
  "fail_reason": "<which condition was violated, or null>",
  "regeneration_instruction": "<if auto_regen: specific instruction for what must change>",
  "top_strength": "<the single best thing about this email>",
  "critical_fix": "<the single most important thing that must change>"
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
  // Parse subject + body if we have a combined text
  let subject = '';
  let body = emailText;
  const subjectMatch = emailText.match(/^Subject:\s*(.+)\n/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    body = emailText.replace(subjectMatch[0], '').trim();
  }

  // Use full intelligence pack if provided, else build minimal pack for compat
  const pack = intelligencePack || {
    channel_name: 'Unknown',
    subscribers: 0,
    niche: 'Unknown',
    pain_signals: {},
    hook_data: {},
  };

  try {
    const prompt = buildScoringPrompt(subject, body, pack, voiceDNA || {}, serviceType || 'video editing');
    const text = await completeSmart(prompt, '', 1200);
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Normalize to backward-compat shape for existing routes
    return {
      score:    parsed.total_score,
      passed:   parsed.pass,
      auto_regen: parsed.auto_regen,
      hard_block: parsed.hard_block,
      dimensions: parsed.dimensions,
      automatic_fail_triggered: parsed.automatic_fail_triggered,
      fail_reason: parsed.fail_reason,
      regeneration_instruction: parsed.regeneration_instruction,
      top_strength: parsed.top_strength,
      critical_fix: parsed.critical_fix,
      overall_feedback: `${parsed.top_strength} | Fix: ${parsed.critical_fix}`,
      // Backward-compat breakdown shape
      breakdown: {
        personalization: { points: parsed.dimensions?.personalization?.score ?? 0, feedback: parsed.dimensions?.personalization?.feedback ?? '' },
        hook:            { points: parsed.dimensions?.hook_strength?.score     ?? 0, feedback: parsed.dimensions?.hook_strength?.feedback     ?? '' },
        specificity:     { points: parsed.dimensions?.specificity?.score       ?? 0, feedback: parsed.dimensions?.specificity?.feedback       ?? '' },
        value_prop:      { points: parsed.dimensions?.value_proposition?.score ?? 0, feedback: parsed.dimensions?.value_proposition?.feedback ?? '' },
        cta:             { points: parsed.dimensions?.cta_quality?.score       ?? 0, feedback: parsed.dimensions?.cta_quality?.feedback       ?? '' },
        tone:            { points: parsed.dimensions?.tone_matching?.score     ?? 0, feedback: parsed.dimensions?.tone_matching?.feedback     ?? '' },
        spam_flag:       { points: parsed.dimensions?.spam_signals?.score      ?? 0, feedback: parsed.dimensions?.spam_signals?.feedback      ?? '' },
      },
    };
  } catch (err) {
    console.error('[QualityGate] Evaluation error:', err.message);
    return { score: 0, passed: false, error: true, overall_feedback: 'Evaluation failed', breakdown: {} };
  }
}

// ── Regeneration prompt builder ────────────────────────────────────────────────

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
- Personalization (${dims.personalization?.score ?? '?'}/20): ${dims.personalization?.feedback || ''}

The previous email's opening was: "${(last.email || '').split('\\n')[0].substring(0, 100)}"
DO NOT use this opening or any similar structure.
Use a COMPLETELY DIFFERENT hook — new data point, new angle, new structure.
`.trim();
}

// ── Initial draft generator (backward compat, legacy path) ────────────────────
// Used by the old pitches.js flow before generateWithMarcus existed.

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
1. 50-80 words body. Hard limit.
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
    // Return plain text if JSON parse fails
    const text = await completeSmart(MARCUS_LEGACY_PROMPT(creatorData, voiceDNA), '', 500);
    return text.trim();
  }
}

// ── 3-attempt quality gate loop ────────────────────────────────────────────────
// Optional 5th/6th params: fullIntelligencePack + angleResult from generateWithMarcus.
// When present, regen uses buildMARCUSPrompt (full intelligence). Without them, falls
// back to MARCUS_LEGACY_PROMPT (basic fields only — still passes feedback context).

async function runQualityGate(emailText, creatorData, voiceDNA, onAttempt, fullIntelligencePack, angleResult) {
  const MAX_ATTEMPTS    = 3;
  const TARGET_SCORE    = 85;
  const HARD_BLOCK_SCORE = 70;

  // Scoring context: prefer full intelligence pack when available
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
    console.log(`[QualityGate] Attempt ${i}: ${result.score}/100`);

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
      return { email: currentEmail, quality: result, regenerated: i > 1, attempts: i, warning: false };
    }

    if (i < MAX_ATTEMPTS) {
      regenerated = true;
      const regenContext = buildRegenerationContext(attempts);

      let regenPrompt;
      if (fullIntelligencePack && angleResult) {
        // Full MARCUS regen — same intelligence pack, same angle, with failure feedback injected
        const { buildMARCUSPrompt } = require('./services/claudeService');
        regenPrompt = buildMARCUSPrompt(
          // creatorData as a minimal lead proxy for the prompt builder
          {
            channel_name: creatorData.channelTitle, niche: creatorData.niche,
            subscriber_count: creatorData.subscriberCount, avg_views: creatorData.avgViews,
          },
          null,
          voiceDNA,
          fullIntelligencePack,
          angleResult,
          regenContext  // previousFeedback — injected into the MARCUS prompt's regenBlock
        );
      } else {
        // Legacy fallback — basic prompt + feedback context (no intelligence pack)
        regenPrompt = `${MARCUS_LEGACY_PROMPT(creatorData, voiceDNA)}

${regenContext}

IMPORTANT: Write a completely different email. Use a new hook. Don't repeat the previous approach.
Return ONLY JSON: {"subject": "<subject>", "body": "<body>"}`;
      }

      try {
        const raw = await completeSmart(regenPrompt, '', 1200);
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
        currentEmail = parsed.body || raw;
      } catch (err) {
        console.error(`[QualityGate] Regeneration attempt ${i + 1} failed:`, err.message);
        break;
      }
    }
  }

  return {
    email:       bestEmail,
    quality:     bestResult,
    regenerated,
    attempts:    MAX_ATTEMPTS,
    warning:     bestScore < HARD_BLOCK_SCORE,
  };
}

module.exports = {
  runQualityGate,
  evaluateEmailQuality,
  generateInitialDraft,
  buildCreatorData,
  buildScoringPrompt,
};
