const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUALITY_GATE_PROMPT = `You are the ContentCrafterzz Email Quality Evaluator. Score cold pitches sent to YouTube creators on a 100-point scale.

PERSONALIZATION (0-20 pts)
- References specific channel details (subscriber count, niche, recent videos, content style)?
- 18-20: Deep specific research evident
- 10-17: Some channel-specific details
- 5-9: Generic personalization (first name only)
- 0-4: No personalization

HOOK / OPENER (0-15 pts)
- First line grabs attention and proves it's personal?
- Avoid: "I saw your channel", "Quick question", generic openers
- Best: Trigger events, specific insight, real data point
- 13-15: Compelling and specific, stops scrolling
- 8-12: Good but slightly generic
- 3-7: Weak common phrase
- 0-2: Invisible or spammy

SPECIFICITY (0-15 pts)
- Real data/names/numbers vs vague language?
- Avoid: "Your content is great", "Brands love creators like you"
- Include: Specific subscriber count, view rate, engagement metric
- 13-15: Concrete numbers, real details, no fluff
- 8-12: Some specificity mixed with generic
- 4-7: Mostly generic with 1-2 specific details
- 0-3: All generic, no research

VALUE PROPOSITION (0-15 pts)
- Outcome crystal clear? Benefit to THEM?
- Avoid: Feature dump ("our AI generates emails")
- Include: Creator-centric result (more deals, higher earnings, better partnerships)
- 13-15: Clear compelling creator outcome
- 8-12: Value mentioned but could be sharper
- 4-7: Vague benefits
- 0-3: Feature-focused or no benefit

CTA (0-15 pts)
- One clear next step? Low friction?
- Avoid: Multiple asks, pushy language, "book a call" for first cold email
- Best: Question answerable in 5 words, micro-commitment
- 13-15: Single clear ask, natural, low friction
- 8-12: One CTA but could be softer
- 3-7: Multiple CTAs or too pushy
- 0-2: No CTA or extremely aggressive

TONE / VOICE (0-12 pts)
- Authentic, professional, not salesy?
- Avoids: AI patterns, excessive excitement, fakeness
- Sounds like: Real person who did their homework
- 10-12: Natural, feels like human peer
- 6-9: Mostly natural with slight AI tone
- 3-5: Noticeably corporate
- 0-2: Obviously AI or aggressive

SPAM FLAG (0-8 pts)
- No email filter triggers?
- Red flags: Multiple links, HTML, emoji, ALL CAPS, fake urgency, "limited time"
- 7-8: Clean, professional, zero red flags
- 5-6: One minor flag
- 2-4: Multiple flags
- 0-1: High spam risk

Respond ONLY with valid JSON, no markdown, no text before or after:
{
  "score": X,
  "breakdown": {
    "personalization": {"points": X, "feedback": "brief reason"},
    "hook": {"points": X, "feedback": "brief reason"},
    "specificity": {"points": X, "feedback": "brief reason"},
    "value_prop": {"points": X, "feedback": "brief reason"},
    "cta": {"points": X, "feedback": "brief reason"},
    "tone": {"points": X, "feedback": "brief reason"},
    "spam_flag": {"points": X, "feedback": "brief reason"}
  },
  "overall_feedback": "2-3 sentence summary of what's strong and what needs fixing",
  "passed": true/false
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    channelTitle: lead.channel_name || 'Unknown',
    subscriberCount: subCount,
    niche: lead.niche || 'Unknown',
    category: lead.niche || 'Unknown',
    avgViews,
    viewSubRatio,
    recentVideoTitle,
    uploadFrequency: lead.upload_frequency_days
      ? `Every ${Math.round(lead.upload_frequency_days)} days`
      : 'Unknown',
    intentSignal,
    descriptionKeywords: (lead.channel_description || '').slice(0, 200) || 'Unknown',
    growthTrend: lead.view_trend || 'Unknown',
  };
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

async function evaluateEmailQuality(emailText) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: QUALITY_GATE_PROMPT,
      messages: [{ role: 'user', content: `Evaluate this cold pitch:\n\n${emailText}` }],
    });
    const text = response.content[0].text;
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[QualityGate] Evaluation error:', err);
    return { score: 0, passed: false, error: true, overall_feedback: 'Evaluation failed' };
  }
}

// ── Initial draft (MARCUS prompt) ─────────────────────────────────────────────

const MARCUS_GENERATION_PROMPT = (creatorData, voiceDNA) => `You are Marcus — the world's best cold email writer for YouTube creator outreach. You write pitches that feel personal, human, and impossible to ignore.

Your emails consistently get 15-25% reply rates because they follow one rule: prove you actually know this creator before asking for anything.

CREATOR INTELLIGENCE:
- Channel: ${creatorData.channelTitle}
- Subscribers: ${Number(creatorData.subscriberCount || 0).toLocaleString()}
- Niche/Category: ${creatorData.niche || creatorData.category}
- Average Views: ${Number(creatorData.avgViews || 0).toLocaleString()}
- View-to-Sub Ratio: ${creatorData.viewSubRatio || 'Unknown'}
- Recent Video Title: ${creatorData.recentVideoTitle || 'Unknown'}
- Upload Frequency: ${creatorData.uploadFrequency || 'Unknown'}
- Intent Signal Detected: ${creatorData.intentSignal || 'General interest'}
- Channel Description Keywords: ${creatorData.descriptionKeywords || 'Unknown'}
- Growth Trend: ${creatorData.growthTrend || 'Unknown'}

SENDER PROFILE:
- Name: ${voiceDNA.name || 'Unknown'}
- Service offered: ${voiceDNA.service || 'video editing'}
- Named case study (USE THIS EXACT RESULT when relevant): ${voiceDNA.caseStudy || voiceDNA.case_study || voiceDNA.best_result || voiceDNA.bestResult || voiceDNA.socialProof || 'Not specified'}
- Communication style: ${voiceDNA.communicationStyle || voiceDNA.style || voiceDNA.email_tone || 'professional but casual'}
- Unique angle/differentiator: ${voiceDNA.uniqueDifference || voiceDNA.angle || 'Unknown'}
- Past clients in same niche: ${voiceDNA.nicheExperience || 'None specified'}

PROVEN EMAIL FRAMEWORKS (pick the best fit for this creator):

Framework 1 — TIMELINE HOOK (best for growing channels):
"[Channel] went from [X] to [Y] subs in [timeframe] — that kind of growth usually means [relevant pain point].
[What you do] + [specific result for similar creator].
[Soft question]?"

Framework 2 — SIGNAL HOOK (best for intent signals):
"Noticed [specific signal: hiring post / video gap / viral spike].
Usually means [implication they care about].
[What you do] helped [similar creator type] [specific result].
[Soft question]?"

Framework 3 — SPECIFICITY HOOK (best for established channels):
"Your [specific video/series] is pulling [X] views with [Y] subs — that engagement ratio is genuinely rare.
[What you do] + [outcome].
[Soft question]?"

Framework 4 — PEER RESULT HOOK (best for skeptical creators):
"${voiceDNA.caseStudy || voiceDNA.case_study
  ? `Edited for a ${creatorData.niche || 'similar niche'} creator at similar sub count — ${voiceDNA.caseStudy || voiceDNA.case_study}. [How in one line]. [Soft question]?`
  : 'Worked with a [niche] creator at [similar sub count] last [timeframe] — [specific result they got]. [How you did it in one line]. [Soft question]?'
}"

ABSOLUTE RULES:
1. 50-80 words. Hard limit.
2. Plain text only. No HTML, no emoji, no links, no formatting.
3. Never open with "I", "Hi [Name]", "Hope you're well", "Quick question", "My name is"
4. Never mention "AI", "automated", "tool", "platform", "software"
5. First line MUST contain something specific to THIS creator
6. One CTA only — a question answerable in 5 words
7. Sign off: just the sender's first name, nothing else
8. Sound like a peer who did 10 minutes of research, not a salesperson
9. The creator should feel like this email was written ONLY for them

Write ONLY the email body. Nothing else.`;

async function generateInitialDraft(creatorData, voiceDNA) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: MARCUS_GENERATION_PROMPT(creatorData, voiceDNA) }],
  });
  return response.content[0].text.trim();
}

// ── Regeneration with dimension-specific fixes ────────────────────────────────

async function regenerateWithFeedback(originalEmail, qualityResult, creatorData, voiceDNA, attempt) {
  const breakdown = qualityResult.breakdown || {};
  const fixes = [];

  if ((breakdown.personalization?.points ?? 20) < 16) {
    fixes.push(`PERSONALIZATION WEAK (${breakdown.personalization?.points}/20): ${breakdown.personalization?.feedback}
    FIX: Open by referencing their EXACT subscriber count, their specific niche, OR a specific video title. Real research must be visible in line 1 or 2.`);
  }

  if ((breakdown.hook?.points ?? 15) < 12) {
    fixes.push(`HOOK WEAK (${breakdown.hook?.points}/15): ${breakdown.hook?.feedback}
    FIX: Never open with "I", "Hi", or "Quick question". Open with something SPECIFIC about their channel that proves you watched/studied it. Use timeline hook: "Your [niche] videos went from [X] to [Y] subs in [timeframe] — that's rare."`);
  }

  if ((breakdown.specificity?.points ?? 15) < 12) {
    fixes.push(`SPECIFICITY WEAK (${breakdown.specificity?.points}/15): ${breakdown.specificity?.feedback}
    FIX: Include at least 2 specific data points: subscriber count, average views, niche, engagement rate, or specific video title. No vague phrases like "your content is great".`);
  }

  if ((breakdown.value_prop?.points ?? 15) < 12) {
    fixes.push(`VALUE PROP WEAK (${breakdown.value_prop?.points}/15): ${breakdown.value_prop?.feedback}
    FIX: Lead with the creator's outcome, not your service. "More brand deals" not "we generate emails". Make them picture the result.`);
  }

  if ((breakdown.cta?.points ?? 15) < 12) {
    fixes.push(`CTA WEAK (${breakdown.cta?.points}/15): ${breakdown.cta?.feedback}
    FIX: One single question they can answer in 5 words. "Worth a quick chat?" or "Is this relevant for you?" Never multiple asks.`);
  }

  if ((breakdown.tone?.points ?? 12) < 9) {
    fixes.push(`TONE WEAK (${breakdown.tone?.points}/12): ${breakdown.tone?.feedback}
    FIX: Sound like a peer, not a salesperson. Remove all AI phrases: "In today's world", "As an expert", "I hope this email finds you well". Write like a human texting a colleague.`);
  }

  if ((breakdown.spam_flag?.points ?? 8) < 6) {
    fixes.push(`SPAM RISK (${breakdown.spam_flag?.points}/8): ${breakdown.spam_flag?.feedback}
    FIX: Remove all links. Remove emoji. Remove urgency language. Plain text only. Under 100 words.`);
  }

  const regenPrompt = `You are Marcus, ContentCrafterzz's elite email writing system. You write cold pitches to YouTube creators that actually get replies.

This is attempt ${attempt} of rewriting a pitch that failed quality check.

PREVIOUS EMAIL (scored ${qualityResult.score}/100 — FAILED):
${originalEmail}

MANDATORY FIXES REQUIRED:
${fixes.length ? fixes.join('\n\n') : 'Improve overall quality, specificity, and tone.'}

CREATOR DATA (use these specific details):
- Channel: ${creatorData.channelTitle}
- Subscribers: ${Number(creatorData.subscriberCount || 0).toLocaleString()}
- Niche: ${creatorData.niche || creatorData.category || 'Unknown'}
- Avg Views: ${Number(creatorData.avgViews || 0).toLocaleString()}
- Recent Video: ${creatorData.recentVideoTitle || 'Unknown'}
- Upload Frequency: ${creatorData.uploadFrequency || 'Unknown'}
- Intent Signal: ${creatorData.intentSignal || 'Unknown'}

USER VOICE DNA:
- Name: ${voiceDNA.name || 'Unknown'}
- Service: ${voiceDNA.service || 'video editing'}
- Named Case Study (USE EXACTLY): ${voiceDNA.caseStudy || voiceDNA.case_study || voiceDNA.best_result || voiceDNA.bestResult || voiceDNA.socialProof || 'Unknown'}
- Communication Style: ${voiceDNA.communicationStyle || voiceDNA.style || voiceDNA.email_tone || 'professional but casual'}
- Unique Angle: ${voiceDNA.uniqueDifference || voiceDNA.angle || 'Unknown'}

RULES FOR THIS EMAIL:
1. 50-80 words MAX. Never exceed 100 words.
2. Plain text only. No HTML, no emoji, no links.
3. Line 1: Specific observation about THEIR channel (not generic)
4. Line 2-3: What you do + outcome for THEM (not features)
5. Line 4: One soft question CTA
6. Sign off with just the user's first name
7. Never start with "I", "Hi [Name]", or "Quick question"
8. Never mention "AI" or "automated" or "tool"
9. Sound human. Sound like you spent 10 minutes researching them.

Write ONLY the email body. No subject line. No preamble. No explanation.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: regenPrompt }],
  });
  return response.content[0].text.trim();
}

// ── Quality gate loop (3 attempts, target 85+) ────────────────────────────────

async function runQualityGate(emailText, creatorData, voiceDNA, onAttempt) {
  const MAX_ATTEMPTS = 3;
  const TARGET_SCORE = 85;
  const HARD_BLOCK_SCORE = 70;

  let currentEmail = emailText;
  let bestEmail = emailText;
  let bestResult = null;
  let bestScore = 0;
  let regenerated = false;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const result = await evaluateEmailQuality(currentEmail);
    console.log(`[QualityGate] Attempt ${i}: ${result.score}/100`);

    if (onAttempt) {
      try { await onAttempt(i, currentEmail, result); } catch {}
    }

    if (result.score > bestScore) {
      bestScore = result.score;
      bestEmail = currentEmail;
      bestResult = result;
    }

    if (result.score >= TARGET_SCORE) {
      return { email: currentEmail, quality: result, regenerated: i > 1, attempts: i, warning: false };
    }

    if (i < MAX_ATTEMPTS) {
      regenerated = true;
      try {
        currentEmail = await regenerateWithFeedback(currentEmail, result, creatorData, voiceDNA, i + 1);
      } catch (err) {
        console.error(`[QualityGate] Regeneration attempt ${i + 1} failed:`, err.message);
        break;
      }
    }
  }

  return {
    email: bestEmail,
    quality: bestResult,
    regenerated,
    attempts: MAX_ATTEMPTS,
    warning: bestScore < HARD_BLOCK_SCORE,
  };
}

module.exports = { runQualityGate, evaluateEmailQuality, generateInitialDraft, buildCreatorData };
