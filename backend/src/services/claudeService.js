const path = require('path');
const ENV_PATH = path.join(__dirname, '../../../.env');
const { getSetting, getDb } = require('../models/database');

function getGeminiKeys() {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const keys = [];
  try {
    const dbKey = getSetting('gemini_api_key');
    if (dbKey && dbKey !== 'placeholder') keys.push(dbKey);
  } catch {}
  // Support up to 20 keys: GEMINI_API_KEY_1 through GEMINI_API_KEY_20
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k !== 'placeholder' && !keys.includes(k)) keys.push(k);
  }
  // Also check plain GEMINI_API_KEY
  const plain = process.env.GEMINI_API_KEY;
  if (plain && plain !== 'placeholder' && !keys.includes(plain)) keys.push(plain);
  return keys;
}

function getGeminiKey() {
  const keys = getGeminiKeys();
  return keys[0] || null;
}

async function completeWithGeminiRotating(prompt, systemPrompt, maxTokens, modelName) {
  const keys = getGeminiKeys();
  if (!keys.length) return null;
  for (const key of keys) {
    // Each key gets up to 3 attempts to handle temporary overload
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await completeWithGemini(prompt, systemPrompt, maxTokens, key, modelName);
      } catch (e) {
        if (isQuotaError(e)) {
          console.warn(`[AI] Gemini key ...${key.slice(-6)} quota exhausted, rotating`);
          break; // try next key
        }
        if (isOverloadError(e)) {
          const wait = (attempt + 1) * 8000; // 8s, 16s, 24s
          console.warn(`[AI] Gemini overloaded, retrying in ${wait/1000}s (attempt ${attempt+1}/3)`);
          await new Promise(r => setTimeout(r, wait));
          continue; // retry same key
        }
        throw e;
      }
    }
  }
  return null; // all keys exhausted or all overloaded
}

// Use 2.5-flash — available on both old AIzaSy keys and new AQ. keys
const FAST_MODEL  = process.env.GEMINI_FAST_MODEL  || 'gemini-2.5-flash';
const SMART_MODEL = process.env.GEMINI_MODEL       || 'gemini-2.5-flash';

function makeGeminiModel(key, modelName, systemPrompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt || 'You are an expert outreach copywriter for a video editing agency.',
  });
}

async function completeWithGemini(prompt, systemPrompt, maxTokens, key, modelName) {
  const model = modelName || SMART_MODEL;
  const axios = require('axios');
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (systemPrompt) payload.system_instruction = { parts: [{ text: systemPrompt }] };

  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    payload,
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// True = quota/billing exhausted — rotate to next key
function isQuotaError(err) {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  return msg.includes('quota') || msg.includes('resource_exhausted') ||
         (err?.status === 429 || msg.includes('429')) ||
         msg.includes('credit') || msg.includes('billing') || msg.includes('payment') || msg.includes('balance');
}

// True = server temporarily overloaded — retry same key after pause
function isOverloadError(err) {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  return msg.includes('high demand') || msg.includes('overloaded') || msg.includes('503') ||
         msg.includes('service unavailable') || msg.includes('try again later');
}

// Standard complete — rotates all Gemini keys
async function complete(prompt, systemPrompt = '', maxTokens = 1200) {
  const result = await completeWithGeminiRotating(prompt, systemPrompt, maxTokens, FAST_MODEL);
  if (result !== null) return result;
  throw new Error('AI unavailable — all Gemini keys exhausted. Add more keys at aistudio.google.com.');
}

// Smart complete — rotates all Gemini keys
async function completeSmart(prompt, systemPrompt = '', maxTokens = 2000) {
  const result = await completeWithGeminiRotating(prompt, systemPrompt, maxTokens, SMART_MODEL);
  if (result !== null) return result;
  throw new Error('AI unavailable — all Gemini keys exhausted. Add more keys at aistudio.google.com.');
}

// Quick check: returns which AI provider is currently available
async function checkAiAvailability() {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      await completeWithGemini('Say OK', '', 5, geminiKey, FAST_MODEL);
      return { ok: true, provider: 'gemini', model: FAST_MODEL };
    } catch (e) {
      if (isQuotaError(e)) {
        return { ok: false, error: 'All Gemini keys exhausted', retry_in: 'Keys reset every 60 seconds (free tier) — try again shortly or add more keys at aistudio.google.com' };
      }
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: 'No Gemini API key configured. Add keys at aistudio.google.com.' };
}

// ════════════════════════════════════════════════════════════════════════════
// HYPER-PERSONALIZED EMAIL GENERATION v2
// Philosophy: Every email must feel like a human spent hours studying this creator.
// ════════════════════════════════════════════════════════════════════════════

const BANNED_PHRASES = [
  'leaving money on the table','i came across your channel','i love your content',
  'i noticed your channel','collaboration opportunity','partnership','exciting opportunity',
  'hope this finds you well','i wanted to reach out','touching base','circling back',
  'synergy','game-changer','crushing it','killing it','amazing content','incredible work',
  'fantastic videos','quick question','just following up','checking in','as per my last',
  'per our conversation','moving forward','leverage','utilize','at the end of the day',
  'think outside the box','low-hanging fruit','deep dive','bandwidth','circle back',
  'touch base','i hope this','exciting','innovative','cutting-edge','state-of-the-art',
  'i noticed','i came across','i stumbled upon','i wanted to','hope you',
];

// ─── Step 1: Build rich creator context from stored lead data ────────────────
function buildRichCreatorContext(lead) {
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const painPoints   = (() => { try { return JSON.parse(lead.pain_points   || '[]'); } catch { return []; } })();

  const daysSinceUpload = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  // View trend — compare first 3 vs last 3 videos
  let viewTrend = 'stable';
  if (recentVideos.length >= 4) {
    const recentAvg = recentVideos.slice(0, 3).reduce((s, v) => s + (v.views || 0), 0) / 3;
    const olderAvg  = recentVideos.slice(-3).reduce((s, v) => s + (v.views || 0), 0) / 3;
    const viewsArr  = recentVideos.map(v => v.views || 0);
    if (recentAvg > olderAvg * 1.3)      viewTrend = 'growing';
    else if (recentAvg < olderAvg * 0.65) viewTrend = 'declining';
    else if (Math.max(...viewsArr) > Math.min(...viewsArr) * 6) viewTrend = 'volatile';
  }

  // Best / worst performer
  const sorted   = [...recentVideos].sort((a, b) => (b.views || 0) - (a.views || 0));
  const bestVideo  = sorted[0] || null;
  const worstVideo = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  // View-to-sub ratio (engagement health)
  const viewToSubRatio = lead.subscriber_count > 0 ? (lead.avg_views || 0) / lead.subscriber_count : 0;

  // Title pattern signals
  const titles = recentVideos.map(v => v.title || '').filter(Boolean);
  const titleText = titles.join(' ');
  const usesNumbers  = titles.filter(t => /\d+/.test(t)).length > titles.length / 2;
  const usesAllCaps  = titles.filter(t => /[A-Z]{3,}/.test(t)).length > titles.length / 3;
  const usesQuestions = titles.some(t => /\?/.test(t));
  const usesEmojis    = (titleText.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length > 3;
  const avgTitleWords = titles.length ? titles.reduce((s, t) => s + t.split(' ').length, 0) / titles.length : 0;

  return {
    recentVideos, painPoints, daysSinceUpload, viewTrend,
    bestVideo, worstVideo, viewToSubRatio,
    usesNumbers, usesAllCaps, usesQuestions, usesEmojis, avgTitleWords,
  };
}

// ─── Step 2: Psychology profile ───────────────────────────────────────────────
function buildPsychologyProfile(lead, ctx) {
  const subs  = lead.subscriber_count || 0;
  const niche = (lead.niche || lead.channel_description || '').toLowerCase();
  const { viewTrend, daysSinceUpload, viewToSubRatio, recentVideos } = ctx;

  // Base personality from niche
  let personality = 'analytical', tone = 'professional', commsStyle = 'data-driven';
  if (niche.match(/fitness|gym|workout|train|health|nutrition|wellness/)) {
    personality = 'energetic'; tone = 'motivational and direct'; commsStyle = 'results-focused';
  } else if (niche.match(/finance|invest|stock|crypto|money|wealth|trading|forex/)) {
    personality = 'analytical'; tone = 'precise and data-driven'; commsStyle = 'evidence-based';
  } else if (niche.match(/business|entrepreneur|startup|agency|saas|marketing|growth/)) {
    personality = 'ambitious'; tone = 'strategic and sharp'; commsStyle = 'ROI-focused';
  } else if (niche.match(/gaming|entertainment|comedy|vlog|prank|challenge|react/)) {
    personality = 'creative'; tone = 'casual and energetic'; commsStyle = 'peer-to-peer';
  } else if (niche.match(/cook|food|recipe|chef|bak|restaurant/)) {
    personality = 'warm'; tone = 'friendly and approachable'; commsStyle = 'conversational';
  } else if (niche.match(/tech|software|code|program|develop|AI|machine/)) {
    personality = 'analytical'; tone = 'precise'; commsStyle = 'technical but clear';
  } else if (niche.match(/educat|learn|teach|tutor|school|course/)) {
    personality = 'nurturing'; tone = 'encouraging'; commsStyle = 'clear and helpful';
  }

  // Title style overrides
  if (ctx.usesAllCaps) { tone = 'high-energy'; }
  if (ctx.usesEmojis)  { tone += ', uses emojis naturally'; }

  // Profile label
  let profileLabel = 'SMALL/GROWING';
  if (subs >= 1_000_000)   profileLabel = 'PROFESSIONAL/MEDIA';
  else if (subs >= 500_000) profileLabel = 'LARGE CREATOR';
  else if (subs >= 100_000) profileLabel = 'SOLO CREATIVE';
  else if (niche.match(/finance|invest|trading/)) profileLabel = 'FINANCE CREATOR';
  else if (niche.match(/fitness|gym|wellness/))   profileLabel = 'FITNESS CREATOR';
  else if (niche.match(/business|entrepreneur/))  profileLabel = 'BUSINESS CREATOR';
  if (viewTrend === 'declining')                   profileLabel = 'CREATOR IN PAIN';

  // Pain signals
  const painSignals = [];
  if (viewTrend === 'declining')          painSignals.push(`views are DROPPING — recent avg far below channel avg ${(lead.avg_views||0).toLocaleString()}`);
  if (daysSinceUpload > 21)               painSignals.push(`${daysSinceUpload} days since last upload — editing may be the bottleneck`);
  if (viewToSubRatio < 0.04 && subs > 10_000) painSignals.push(`only ${(viewToSubRatio*100).toFixed(1)}% of subs watch — audience disengaged`);
  if (viewTrend === 'volatile')            painSignals.push('wildly inconsistent views — no consistent content formula');
  if (ctx.bestVideo && ctx.worstVideo && (ctx.bestVideo.views||0) > (ctx.worstVideo.views||0) * 10)
    painSignals.push(`massive gap between best (${(ctx.bestVideo.views||0).toLocaleString()}) and worst (${(ctx.worstVideo.views||0).toLocaleString()}) recent video`);

  // What makes them stop and read
  let stopAndRead = 'Someone who clearly studied their specific channel and numbers';
  if (viewTrend === 'declining') stopAndRead = 'Something that names WHY their views dropped — they want answers';
  else if (daysSinceUpload > 21) stopAndRead = 'Something that addresses the upload gap as a solvable problem';
  else if (viewToSubRatio < 0.04) stopAndRead = 'Someone who noticed their sub count vs view discrepancy';

  return {
    profileLabel, personality, tone, commsStyle,
    isDataDriven: ['analytical', 'ambitious'].includes(personality),
    isCasual: ['creative', 'warm'].includes(personality),
    painSignals, stopAndRead,
    usesNumbers: ctx.usesNumbers, usesAllCaps: ctx.usesAllCaps, usesQuestions: ctx.usesQuestions,
  };
}

// ─── Step 3: Cross-platform analysis (lightweight, non-blocking) ──────────────
async function analyzeCrossPlatform(lead) {
  const result = { websiteText: '', socialLinks: {} };
  const socialLinks = (() => { try { return JSON.parse(lead.social_links || '{}'); } catch { return {}; } })();
  result.socialLinks = socialLinks;

  if (lead.website) {
    try {
      const { data: html } = await require('axios').get(lead.website, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        timeout: 5000, maxRedirects: 3,
      });
      const paras = (html.match(/<(?:p|h1|h2|h3)[^>]*>([\s\S]{20,300}?)<\/(?:p|h1|h2|h3)>/gi) || [])
        .map(m => m.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 20).slice(0, 4);
      result.websiteText = paras.join(' ').substring(0, 500);
    } catch {}
  }
  return result;
}

// ─── Step 4: Build the master prompt ─────────────────────────────────────────
function buildMasterPrompt(lead, ctx, psych, crossPlatform, senderCtx) {
  const { recentVideos, daysSinceUpload, viewTrend, bestVideo, worstVideo, viewToSubRatio } = ctx;

  const videoList = recentVideos.slice(0, 8).map((v, i) =>
    `  ${i+1}. "${v.title || '?'}" — ${(v.views||0).toLocaleString()} views`
  ).join('\n') || '  (no video data)';

  const trendLine = viewTrend === 'declining'
    ? `⚠️ DECLINING — recent 3-video avg: ${Math.round(recentVideos.slice(0,3).reduce((s,v)=>s+(v.views||0),0)/Math.max(1,Math.min(3,recentVideos.length))).toLocaleString()} views vs channel avg ${(lead.avg_views||0).toLocaleString()}`
    : viewTrend === 'growing'  ? `📈 GROWING — outperforming channel average`
    : viewTrend === 'volatile' ? `⚡ VOLATILE — massive swings between videos`
    : `📊 STABLE — consistent with channel average`;

  const uploadLine = daysSinceUpload !== null
    ? `${daysSinceUpload} days since last upload (normally every ${lead.upload_frequency_days || '?'} days)${daysSinceUpload > 21 ? ' — THIS IS A BIG GAP' : ''}`
    : `uploads every ${lead.upload_frequency_days || '?'} days`;

  const painBlock = psych.painSignals.length
    ? psych.painSignals.map(p => `  • ${p}`).join('\n')
    : '  • None detected — use opportunity angle';

  const websiteExtra = crossPlatform.websiteText
    ? `\nWEBSITE COPY (their actual voice): "${crossPlatform.websiteText}"` : '';

  const senderName = senderCtx.split('SENDER:')[1]?.split('|')[0]?.trim() || 'Prahvi';

  return `You are ghostwriting a cold outreach email.
The goal: make the creator think "this person ACTUALLY studied my channel."
Not a template. Not AI. A human who spent hours on their content.

${senderCtx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATOR: ${lead.channel_name} (@${lead.channel_handle || 'N/A'})
SUBS: ${(lead.subscriber_count||0).toLocaleString()} | NICHE: ${lead.niche || 'general'}
AVG VIEWS: ${(lead.avg_views||0).toLocaleString()} | ENGAGEMENT: ${lead.engagement_rate||0}%
VIEW/SUB RATIO: ${(viewToSubRatio*100).toFixed(1)}%${viewToSubRatio < 0.05 ? ' ⚠️ LOW — audience not watching' : viewToSubRatio > 0.3 ? ' ✓ HIGH — very engaged' : ''}
UPLOAD STATUS: ${uploadLine}
VIEW TREND: ${trendLine}

RECENT VIDEOS:
${videoList}

BEST VIDEO: ${bestVideo ? `"${bestVideo.title}" — ${(bestVideo.views||0).toLocaleString()} views` : 'N/A'}
WORST RECENT: ${worstVideo && worstVideo.title !== bestVideo?.title ? `"${worstVideo.title}" — ${(worstVideo.views||0).toLocaleString()} views` : 'N/A'}
DESCRIPTION: ${(lead.channel_description||'').substring(0,250)||'N/A'}${websiteExtra}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PSYCHOLOGY
Profile: ${psych.profileLabel}
Personality: ${psych.personality} | Tone: ${psych.tone}
Data-driven: ${psych.isDataDriven?'YES — use specific numbers':'NO — emotion and story'}
Communication: ${psych.commsStyle}
Pain signals detected:
${painBlock}
What makes them stop and read: ${psych.stopAndRead}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL RULES — FOLLOW EVERY SINGLE ONE

STRUCTURE (4 parts, no headers in email):
HOOK (1-2 lines): Observation so specific they think "this person studied me."
  NOT a compliment — an INSIGHT. Use exact video title, exact number, exact pattern.
  ${viewTrend === 'declining' ? 'Lead with the view drop. Hint you know why.' : ''}
  ${daysSinceUpload > 21 ? `Lead with the ${daysSinceUpload}-day upload gap as a solvable problem.` : ''}
CONNECT (1-2 lines): Build on that insight. Show you understand their situation.
  No pitch yet. Match their EXACT tone: ${psych.tone}
SOFT PITCH (1 line): One specific result you've gotten for creators in this situation.
  NOT "I'm a video editor." Say "I helped a [niche] creator go from X to Y."
CTA (1 line): ONE question. Low commitment. They answer in 1-2 words.

WORD COUNT: 60-120 words body. Hard limit.
SUBJECT: 3-7 words. Hyper-specific. Wouldn't work for any other creator.
SIGN AS: ${senderName} — first name only, nothing else after it.

${psych.usesAllCaps ? 'CREATOR STYLE: Uses ALL CAPS — high energy channel, match the energy.' : ''}
${psych.usesNumbers ? 'CREATOR STYLE: Loves numbers in titles — be specific with data.' : ''}
${psych.usesQuestions ? 'CREATOR STYLE: Uses questions in titles — conversational approach works.' : ''}

BANNED — NEVER USE ANY OF THESE:
"${BANNED_PHRASES.join('", "')}"
Never start body with "I". Never mention pricing. Never sound salesy.
Never use exclamation marks more than once total.

OUTPUT: Return ONLY valid JSON. No markdown, no backticks, no explanation.
{
  "subject": "3-7 word subject",
  "body": "60-120 word email body",
  "subject_variants": ["metric variant", "curiosity variant", "peer variant"],
  "key_insight": "most specific thing you noticed and used",
  "custom_offer": "one line — what specifically you'd help them with",
  "tone_used": "describe the tone",
  "personalization_elements": ["specific element 1", "specific element 2", "specific element 3"],
  "psychology_applied": "one sentence on your approach",
  "word_count": <number>,
  "quality_score": <0-100>
}`;
}

// ─── Step 5: Quality scorer ───────────────────────────────────────────────────
function scoreEmailDetailed(subject, body) {
  const bl  = body.toLowerCase();
  const wc  = body.split(/\s+/).filter(Boolean).length;
  let score = 0;

  // Personalization (30 pts)
  if (/\d{3,}|\d+k|\d+%/.test(body)) score += 10;              // uses specific numbers
  if (/"[^"]{5,}"/.test(body) || /titled|called|your video/i.test(body)) score += 10; // refs specific content
  if (wc >= 60 && wc <= 120) score += 10; else if (wc < 40 || wc > 150) score -= 15; // word count

  // Hook strength (25 pts)
  const firstLine = (body.split('\n')[0] || body.substring(0, 120)).toLowerCase();
  if (!/^(hi |hey |hello |i |my |we )/.test(firstLine)) score += 5; // doesn't start with I/Hi
  if (/\d/.test(firstLine) || /"/.test(firstLine)) score += 10;      // specific data in hook
  if (!BANNED_PHRASES.some(p => firstLine.includes(p))) score += 10; // no banned in hook

  // Uniqueness (25 pts)
  const hasBanned = BANNED_PHRASES.some(p => bl.includes(p.toLowerCase()));
  if (!hasBanned) score += 10;
  if (!/leverage|synergy|game.changer|innovative|passionate|hope this finds/i.test(body)) score += 10;
  if (subject.split(' ').length >= 3 && subject.split(' ').length <= 7) score += 5;

  // CTA quality (20 pts)
  const qCount = (body.match(/\?/g) || []).length;
  if (qCount >= 1) score += 10;
  if (qCount === 1) score += 5; // exactly one question
  if (!/click here|book a call|schedule|sign up|visit our|check out our/i.test(body)) score += 5;

  return Math.min(100, Math.max(0, score));
}

// ─── Parse AI response ────────────────────────────────────────────────────────
function parsePitchResponseV2(text, lead) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const p = JSON.parse(jsonMatch[0]);
    if (!p.subject || !p.body) throw new Error('Missing fields');
    return {
      email_subject:   p.subject,
      email_body:      p.body,
      subject_variants: p.subject_variants || [],
      key_insight:     p.key_insight || '',
      custom_offer:    p.custom_offer || '',
      tone_used:       p.tone_used || '',
      personalization_elements: p.personalization_elements || [],
      psychology_applied: p.psychology_applied || '',
      word_count:      p.word_count || p.body.split(/\s+/).filter(Boolean).length,
      quality_score:   p.quality_score || null,
    };
  } catch {
    return null;
  }
}

// ─── Follow-up sequence generator ────────────────────────────────────────────
async function generateFollowUpSequence(lead, initialEmail, psychology) {
  const subs  = (lead.subscriber_count || 0).toLocaleString();
  const niche = lead.niche || 'general';
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos||'[]'); } catch { return []; } })();
  const latestVideo  = recentVideos[0]?.title || null;

  const steps = [
    { day: 3,  angle: 'new observation — completely different angle, no repeat of email 1', maxWords: 60,  hasCTA: false,
      instruction: 'Give something genuinely valuable with zero ask — a specific retention insight, a video idea tailored to them, or an algorithm observation only someone who studied their channel would notice. This PROVES skill.' },
    { day: 6,  angle: 'pure value — timely insight, zero ask', maxWords: 50, hasCTA: false,
      instruction: 'A trending topic in their niche they haven\'t covered, or an insight about why a specific video underperformed. ZERO pitch. ZERO ask. Just value. Make them think "this person actually knows their stuff."' },
    { day: 9,  angle: 'specific social proof relevant to their situation', maxWords: 45, hasCTA: true,
      instruction: 'ONE specific result from a creator in a similar situation. NOT generic — be specific: "helped a [niche] creator go from [exact problem] to [exact result]." Soft question at end.' },
    { day: 12, angle: 'genuine capacity signal — natural not fake', maxWords: 35, hasCTA: true,
      instruction: 'Real, honest capacity signal: "taking on 2 more creators this month" or "had a slot open up." Never fake countdown. Warm, honest, one simple ask.' },
    { day: 15, angle: 'close the loop — highest reply-rate email', maxWords: 28, hasCTA: false,
      instruction: 'Graceful exit — "closing your file for now." People hate unresolved open loops. This gets replies. Warm. Zero pressure. Door permanently open. Mirror their energy.' },
  ];

  const followUps = [];

  for (const step of steps) {
    try {
      const prompt = `You are Prahvi from ContentCrafterzz. Write follow-up #${steps.indexOf(step)+1}/5 for ${lead.channel_name}.

CHANNEL: ${lead.channel_name} | ${subs} subs | Niche: ${niche}
${latestVideo ? `Latest video: "${latestVideo}"` : ''}
Initial email sent — now follow up with a COMPLETELY DIFFERENT angle.

ANGLE: ${step.angle}
INSTRUCTION: ${step.instruction}

RULES:
• Under ${step.maxWords} words body. Hard limit.
• NEVER repeat anything from the first email.
• Never sound desperate. Never mention pricing.
• Sign: Prahvi (first name only)
• ${step.hasCTA ? 'End with ONE soft, low-commitment question' : 'No CTA — let the value speak'}
• Tone: ${psychology.tone}
• Different subject from all previous emails

Return ONLY valid JSON:
{"subject": "under 6 words", "body": "email body", "day": ${step.day}}`;

      const raw = await completeWithGeminiRotating(prompt, '', 600, FAST_MODEL);
      if (raw) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          followUps.push({ day: step.day, subject: parsed.subject, body: parsed.body, angle: step.angle });
        }
      }
    } catch {}
  }

  return followUps;
}

// ─── Fallback email when all AI attempts fail ─────────────────────────────────
function buildFallback(lead, userId) {
  let name = 'Prahvi';
  try {
    const u = getDb().prepare('SELECT full_name FROM users WHERE id=?').get(userId || lead.user_id);
    if (u?.full_name) name = u.full_name.split(' ')[0];
  } catch {}
  return {
    email_subject: `${lead.channel_name?.split(' ')[0]}'s last ${Math.round(lead.upload_frequency_days||7)} days`,
    email_body: `Your last few uploads have been getting around ${(lead.avg_views||0).toLocaleString()} views — have you noticed the gap between your best video and your most recent ones?\n\nI work with creators in ${lead.niche||'your space'} on exactly this. Would a quick breakdown of what's holding back your views be useful?\n\n${name}`,
    subject_variants: [`your ${lead.channel_name?.split(' ')[0]} view pattern`, 'something I noticed', `${lead.niche || 'your'} retention angle`],
    key_insight: 'View-to-sub ratio and upload pattern',
    custom_offer: 'Retention-optimized editing for consistent growth',
    tone_used: 'direct and specific',
    personalization_elements: ['subscriber count', 'average views', 'upload frequency'],
    psychology_applied: 'Led with their specific metrics to prove channel knowledge',
    word_count: 62,
    quality_score: 55,
    pitch_score: 55,
    follow_ups: [],
  };
}

// ─── MAIN: generateFullPitch v2 ───────────────────────────────────────────────
async function generateFullPitch(lead, userId = null) {
  const ctx     = buildRichCreatorContext(lead);
  const psych   = buildPsychologyProfile(lead, ctx);
  const cross   = await analyzeCrossPlatform(lead).catch(() => ({ websiteText: '', socialLinks: {} }));
  const senderCtx = buildAgencyContext(userId || lead.user_id);

  const prompt = buildMasterPrompt(lead, ctx, psych, cross, senderCtx);

  let bestResult   = null;
  let bestScore    = 0;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const raw = await completeWithGeminiRotating(prompt, '', 2000, FAST_MODEL);
    if (!raw) break;

    const parsed = parsePitchResponseV2(raw, lead);
    if (!parsed) continue;

    // Score with our detailed rubric
    const detailedScore = scoreEmailDetailed(parsed.email_subject, parsed.email_body);
    const finalScore = Math.round((detailedScore + (parsed.quality_score || 50)) / 2);

    console.log(`[PitchV2] Attempt ${attempt+1}/3 — score ${finalScore}/100 for ${lead.channel_name}`);

    if (finalScore > bestScore) {
      bestScore  = finalScore;
      bestResult = { ...parsed, pitch_score: finalScore };
    }

    if (finalScore >= 70) break; // good enough, stop
  }

  if (!bestResult) {
    console.warn('[PitchV2] All AI attempts failed — using fallback for', lead.channel_name);
    return buildFallback(lead, userId);
  }

  // Generate follow-up sequence (non-blocking — fire and return, sequence stored separately)
  generateFollowUpSequence(lead, bestResult, psych)
    .then(followUps => { bestResult.follow_ups = followUps; })
    .catch(() => {});

  return {
    ...bestResult,
    // backward compat aliases
    email_subject:   bestResult.email_subject || bestResult.subject,
    email_body:      bestResult.email_body    || bestResult.body,
    subject_variants: bestResult.subject_variants || [],
  };
}

// ─── ContentCrafterzz Agency Context (preserved for other functions) ──────────
const CONTENTCRAFTERZZ_INTELLIGENCE = `
AGENCY: ContentCrafterzz — Premium YouTube Video Editing Agency
SENDER NAME: Prahvi (always sign first name only — never "Prathvi", never "ContentCrafterzz" as signature)

CORE PHILOSOPHY:
Every creator is a completely different psychological profile.
The email must be reverse-engineered from WHO THEY ARE — not who we are.
Three things drive every pitch: their PSYCHOLOGY, their BOTTLENECK, their AMBITION.
The goal of email #1 is ONE thing: GET A REPLY. Not sell. Not pitch. Just reply.

PROOF POINTS (use ONE when relevant — never in follow-up #1):
- "Finance creator (50K subs): views up 40% in 8 weeks after editing consistency"
- "Fitness coach (120K subs): retention 42%→68%, landed sponsorship in 6 months"
- "Podcast (30K listeners): converted to YouTube Shorts, hit 50K YouTube subs in 4 months"

PSYCHOLOGICAL PROFILES — match tone to creator type:
PROFESSIONAL/MEDIA (1M+ subs, team ops): Direct, data-driven. They think in scale and reliability.
SOLO CREATIVE/FILMMAKER: Dry, intellectual. They think in craft and storytelling integrity.
CULTURE-NATIVE/COMMUNITY: Warm, peer-level. They think in community and culture fit.
GEN Z/ENTERTAINMENT: Energetic, personality-led. They think in virality and creative fit.
CEO/FOUNDER/BUSINESS: Sharp, ROI-focused. They think in business impact and leverage.
CREATOR IN PAIN (views dropping): Expert, diagnostic. Lead with "I know what's happening" — highest reply rate.
SMALL/GROWING (under 100K): Direct, data-aware, fellow-creator energy. Reference their view-to-sub ratio.

GOLDEN RULES — NEVER BREAK:
1. Cold email body: MAX 150 WORDS. Hard limit. Count every word.
2. Subject: under 8 words, hyper-specific to THEIR channel
3. Opening: reference their EXACT video title, EXACT metric, or EXACT days since upload — never generic flattery
4. End with a QUESTION (not a CTA directive). Questions get replies. CTAs get ignored.
5. Sign off: Prahvi (first name only — nothing else)
6. No links, no pricing, no dollar amounts, no plan names in first email
7. NEVER say: "I hope this finds you well" | "I came across your channel" | "I wanted to reach out" | "We specialize in" | "Amazing content" | "touch base" | "circle back" | "leverage" | "synergy" | "game-changer" | "I noticed" | "exciting opportunity"
8. Match tone to their psychological profile — never one-size-fits-all
9. Every follow-up: DIFFERENT angle. Never repeat previous email.
10. QUALITY GATE: Score 1-10 internally. Under 8 = rewrite before responding.

SUBJECT LINE FORMULAS (pick the best fit):
TYPE 1 — SPECIFIC METRIC: "[exact number] + [specific problem]" e.g. "89 days between uploads"
TYPE 2 — CURIOSITY: "I think I know what's happening" (use for declining channels)
TYPE 3 — CONTRAST: "[best video views] vs [recent video views]" (show the gap)
TYPE 4 — THEIR LANGUAGE: Mirror a phrase from their bio or description back at them
NEVER: "Quick question" | "Following up" | "Re: Your Channel" | "Video Editing Services"

PAIN POINT → ANGLE MAPPING:
Inconsistent uploads (2+ week gaps) → "editing is the bottleneck"
Low views vs high subs → "retention optimization"
Fast growth + basic editing → "capitalize on momentum before it plateaus"
High quality + low growth → "algorithm consistency"
Creator confused by declining views → "I think I know what's happening"
`.trim();

const BUSINESS_PROFILE = CONTENTCRAFTERZZ_INTELLIGENCE;

function buildAgencyContext(userId = null) {
  let name, role, portfolio, agencyName;
  if (userId) {
    try {
      const user = getDb().prepare('SELECT full_name, role, portfolio_url, agency_name FROM users WHERE id = ?').get(userId);
      name = user?.full_name || getSetting('your_name') || 'the founder';
      role = user?.role || getSetting('your_role') || 'Founder';
      portfolio = user?.portfolio_url || getSetting('portfolio_url') || '(portfolio link)';
      agencyName = user?.agency_name || getSetting('agency_name') || 'ContentCrafterzz';
    } catch {
      name = getSetting('your_name') || 'the founder';
      role = getSetting('your_role') || 'Founder';
      portfolio = getSetting('portfolio_url') || '(portfolio link)';
      agencyName = getSetting('agency_name') || 'ContentCrafterzz';
    }
  } else {
    name = getSetting('your_name') || 'the founder';
    role = getSetting('your_role') || 'Founder';
    portfolio = getSetting('portfolio_url') || '(portfolio link)';
    agencyName = getSetting('agency_name') || 'ContentCrafterzz';
  }
  return `${BUSINESS_PROFILE}\n\nSENDER: ${name} | ${role} | ${agencyName} | ${portfolio}`;
}

// ─── OLD generateFullPitch removed — replaced by v2 above ────────────────────
// kept as dead stub so nothing crashes if called directly
async function _legacyGenerateFullPitch_UNUSED(lead, userId = null) {
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const painPoints = (() => { try { return JSON.parse(lead.pain_points || '[]'); } catch { return []; } })();
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000)
    : null;
  const ctx = buildAgencyContext(userId || lead.user_id);

  // Detect psychological profile from channel data
  const subsCount = lead.subscriber_count || 0;
  let psychProfile = 'SMALL/GROWING';
  if (subsCount >= 1000000) psychProfile = 'PROFESSIONAL/MEDIA';
  else if (subsCount >= 500000) psychProfile = 'CEO/FOUNDER/BUSINESS';
  else if (subsCount >= 100000) psychProfile = 'SOLO CREATIVE/FILMMAKER';
  else if ((lead.niche || '').match(/fitness|gym|health|wellness/i)) psychProfile = 'FITNESS/WELLNESS CREATOR';
  else if ((lead.niche || '').match(/finance|invest|crypto|money/i)) psychProfile = 'FINANCE/INVESTING CREATOR';
  else if ((lead.niche || '').match(/business|entrepreneur|startup|agency|saas/i)) psychProfile = 'CEO/FOUNDER/BUSINESS';
  else if ((lead.niche || '').match(/gaming|entertainment|comedy|vlog/i)) psychProfile = 'GEN Z/ENTERTAINMENT';
  const viewDrop = recentVideos.length >= 2 && recentVideos[0]?.views < (lead.avg_views || 0) * 0.5;
  if (viewDrop) psychProfile = 'CREATOR IN PAIN';

  const prompt = `You are Prahvi, writing a cold outreach email on behalf of ContentCrafterzz (a YouTube video editing agency).

${CONTENTCRAFTERZZ_INTELLIGENCE}

CHANNEL DATA:
Name: ${lead.channel_name} | ${subsCount.toLocaleString()} subs | Niche: ${lead.niche || 'general'}
Avg views: ${(lead.avg_views || 0).toLocaleString()} | Engagement: ${lead.engagement_rate || 0}%
Upload gap: ${daysSince !== null ? `${daysSince} days since last upload (normally every ${lead.upload_frequency_days || '?'} days)` : `uploads every ${lead.upload_frequency_days || '?'} days`}
Recent videos: ${recentVideos.slice(0, 3).map(v => `"${v.title}" (${(v.views || 0).toLocaleString()} views)`).join(' | ') || 'N/A'}
Issues detected: ${painPoints.map(p => p.label).join(', ') || 'inconsistent uploads'}
Psychological profile: ${psychProfile}

TASK: Write a cold email for this creator. Follow ALL golden rules above.

CRITICAL REQUIREMENTS:
1. Under 150 words in the body. Count every word.
2. First line: reference their EXACT video title OR exact ${daysSince !== null ? `${daysSince} days` : 'upload gap'} OR exact sub count. Prove you studied them.
3. End with ONE QUESTION (not a directive CTA). A question gets a reply.
4. Sign off: Prahvi (first name only — nothing after it)
5. No pricing, no plan names, no dollar amounts
6. Tone must match their psychological profile: ${psychProfile}
7. QUALITY GATE: score 1-10 internally. Under 8 = rewrite. Return only 8+ version.

Return ONLY valid JSON (no markdown, no backticks):
{
  "key_insight": "the single most specific thing about this channel you used",
  "custom_offer": "one line describing what you'd help them with — no prices",
  "email_subject": "subject under 8 words — hyper-specific to THEIR channel",
  "email_body": "email body under 150 words ending with a question, signed Prahvi",
  "subject_variants": ["specific metric variant", "curiosity variant", "contrast variant"],
  "score": <number 1-10>
}`;

  // Up to 2 attempts — retry if score < 8 on first attempt
  for (let attempt = 0; attempt < 2; attempt++) {
    const rotated = await completeWithGeminiRotating(prompt, '', 1400, FAST_MODEL);

    if (rotated === null) {
      // All Gemini keys exhausted — return fallback template, never throw
      let userName = 'Prahvi';
      try {
        const user = getDb().prepare('SELECT full_name FROM users WHERE id = ?').get(userId || lead.user_id);
        if (user?.full_name) userName = user.full_name;
      } catch {}
      console.warn('[Email] Using fallback template for:', lead.channel_name);
      return {
        key_insight: 'Channel analyzed',
        custom_offer: 'Professional video editing for your channel',
        email_subject: 'Quick question about your channel',
        email_body: `Hi ${lead.channel_name},\n\nI came across your YouTube channel and noticed some interesting patterns in your content growth. I help creators with video editing and wanted to reach out.\n\nWould you be open to a quick 5-minute chat?\n\n${userName}`,
        subject_variants: ['Quick question about your channel', 'Your content caught my eye', 'Editing help for your channel'],
        score: 6,
        pitch_score: 6,
        pain_point: 'Content quality improvement',
        angle: 'Direct outreach',
      };
    }

    const parsed = parsePitchResponse(rotated, lead);
    if (attempt === 0 && parsed.score && parsed.score < 8) {
      console.log(`[Prahvi] Score ${parsed.score}/10 for ${lead.channel_name}, regenerating...`);
      continue;
    }
    return parsed;
  }

  // If both attempts returned low scores, return the last result anyway
  const finalRotated = await completeWithGeminiRotating(prompt, '', 1400, FAST_MODEL);
  if (finalRotated) return parsePitchResponse(finalRotated, lead);

  let userName = 'Prahvi';
  try {
    const user = getDb().prepare('SELECT full_name FROM users WHERE id = ?').get(userId || lead.user_id);
    if (user?.full_name) userName = user.full_name;
  } catch {}
  console.warn('[Email] Using fallback template for:', lead.channel_name);
  return {
    key_insight: 'Channel analyzed',
    custom_offer: 'Professional video editing for your channel',
    email_subject: 'Quick question about your channel',
    email_body: `Hi ${lead.channel_name},\n\nI came across your YouTube channel and noticed some interesting patterns in your content growth. I help creators with video editing and wanted to reach out.\n\nWould you be open to a quick 5-minute chat?\n\n${userName}`,
    subject_variants: ['Quick question about your channel', 'Your content caught my eye', 'Editing help for your channel'],
    score: 6,
    pitch_score: 6,
    pain_point: 'Content quality improvement',
    angle: 'Direct outreach',
  };
}

function parsePitchResponse(text, lead) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.email_subject || !parsed.email_body) throw new Error('Missing fields');
    return parsed;
  } catch {
    console.warn(`[parsePitchResponse] Parse failed for ${lead?.channel_name}, using safe template fallback`);
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
    const bodyMatch = text.match(/---\s*([\s\S]+)/);
    return {
      key_insight: 'Channel analyzed',
      custom_offer: `Retention-optimized editing for ${lead.channel_name}`,
      email_subject: subjectMatch?.[1]?.trim() || `Quick question about ${lead.channel_name}`,
      email_body: bodyMatch?.[1]?.trim() || `Hi ${lead.channel_name},\n\nI came across your channel and think there's a real opportunity to grow your views with better retention editing.\n\nWould you be open to a quick chat?\n\nBest`,
      subject_variants: [],
      score: 7,
    };
  }
}

// ─── Individual functions (kept for backward compat + analyzer page) ──────────

async function deepStudyLead(lead) {
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const painPoints = (() => { try { return JSON.parse(lead.pain_points || '[]'); } catch { return []; } })();
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  const prompt = `You are a senior outreach strategist for ContentCrafterzz.

${buildAgencyContext(lead?.user_id)}

CHANNEL: ${lead.channel_name} | ${(lead.subscriber_count || 0).toLocaleString()} subs | ${(lead.avg_views || 0).toLocaleString()} avg views | ${lead.engagement_rate || 0}% engagement
Upload gap: ${daysSince ?? 'unknown'} days since last upload (every ${lead.upload_frequency_days || '?'} days)
Recent videos: ${recentVideos.map(v => `"${v.title}" (${(v.views || 0).toLocaleString()} views)`).join(' | ')}
Issues: ${painPoints.map(p => p.label).join(', ')}

Write a channel profile with EXACTLY these 5 headers:
1. BIGGEST STRUGGLE: #1 specific problem RIGHT NOW — use actual numbers
2. CORE DESIRE: What they want most — be specific
3. PERFECT OFFER: Which plan fits ($29 trial / Starter $499 / Growth $999 / Scale $1999) and WHY
4. CONTACT TONE: Exact tone based on niche/style
5. PERSONAL HOOK: One SPECIFIC detail to open the email with — exact video title, upload gap, sub count

No generic advice. Every point must use their actual data.`;

  return complete(prompt, 'Senior outreach strategist who writes insights that make creators think "how did they know that about me?"', 1200);
}

async function generateOffer(lead, deepStudy) {
  const prompt = `Write a custom offer for ContentCrafterzz.

${buildAgencyContext(lead?.user_id)}

CREATOR: ${lead.channel_name} | ${(lead.subscriber_count || 0).toLocaleString()} subs
DEEP STUDY: ${deepStudy}

Write a transformation offer (under 100 words):
- One line: "We'll take [specific problem] and turn it into [specific result]"
- Recommend $29 trial or free first edit based on their profile
- 2-3 bullets of what's included for THEIR content type

Return ONLY the offer text.`;

  return complete(prompt, 'Premium agency offer writer. Every offer is tailored, not templated.', 600);
}

async function generateColdEmail(lead, deepStudy, offer) {
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const painPoints = (() => { try { return JSON.parse(lead.pain_points || '[]'); } catch { return []; } })();
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  const prompt = `You are Prahvi from ContentCrafterzz. Write a cold email so specific the creator thinks "how did they know?"

${CONTENTCRAFTERZZ_INTELLIGENCE}

CREATOR: ${lead.channel_name} (${(lead.subscriber_count || 0).toLocaleString()} subs)
Avg views: ${(lead.avg_views || 0).toLocaleString()} | Engagement: ${lead.engagement_rate || 0}%
Upload gap: ${daysSince !== null ? `${daysSince} days since last upload` : `every ${lead.upload_frequency_days || '?'} days`}
Most recent video: "${recentVideos[0]?.title || 'N/A'}" (${(recentVideos[0]?.views || 0).toLocaleString()} views)
Pain points: ${painPoints.map(p => p.label).join(', ')}
Deep study: ${deepStudy}

REQUIREMENTS:
- Under 150 words
- Opening: reference their EXACT video title or gap or sub count
- End with ONE question
- Sign: Prahvi (first name only)
- No pricing, no dollar amounts
- Score 8+ internally or rewrite

Return ONLY:
SUBJECT: [subject under 8 words]
---
[email body under 150 words ending with a question, signed Prahvi]`;

  return complete(prompt, 'Elite cold email copywriter. 5%+ reply rates. Every email ends with a question, never a directive.', 1000);
}

async function generateRedditDM(lead, deepStudy) {
  const prompt = `Write a Reddit DM for ContentCrafterzz.

${buildAgencyContext(lead?.user_id)}

CREATOR: ${lead.channel_name} | POST: "${lead.reddit_post_title}" | THEIR WORDS: "${lead.reddit_post_content?.substring(0, 400)}"
DEEP STUDY: ${deepStudy}

Rules: Under 80 words. First sentence quotes something specific they said. Casual peer-to-peer tone. $29 trial mention. ONE CTA. Zero sales language.

Return ONLY the DM text.`;

  return complete(prompt, 'Writing a Reddit DM that sounds like a genuine fellow creator.', 500);
}

async function generateSubjectVariants(lead, mainSubject) {
  const prompt = `Generate 3 cold email subject variants for ${lead.channel_name} (${(lead.subscriber_count || 0).toLocaleString()} subs).
Main subject: "${mainSubject}"

Return JSON array: ["curiosity variant under 8 words", "result variant under 8 words", "personal variant under 8 words"]
Only return the JSON array, nothing else.`;

  const result = await complete(prompt, undefined, 300);
  try { return JSON.parse(result.match(/\[.*\]/s)[0]); }
  catch { return [mainSubject, mainSubject, mainSubject]; }
}

async function scorePitch(emailText) {
  const prompt = `Score this cold email pitch 1-10 and give specific feedback.

EMAIL: ${emailText}

Return JSON: { "score": <number>, "feedback": "<2-3 sentences: what works and what to improve>" }
Only return valid JSON.`;

  const result = await complete(prompt, undefined, 300);
  try { return JSON.parse(result.match(/\{.*\}/s)[0]); }
  catch { return { score: 7, feedback: 'Looks good.' }; }
}

async function rewriteEmail(emailText, feedback) {
  const prompt = `Rewrite this cold email to score 8+/10.

ORIGINAL: ${emailText}
FEEDBACK: ${feedback}

Apply all cold email rules (under 180 words, no banned phrases, specific opening).
Return: SUBJECT: [subject]\n---\n[body]`;

  return complete(prompt, 'Elite cold email copywriter.', 1000);
}

async function suggestReplyResponse(originalEmail, replyText) {
  const prompt = `A lead replied to our cold email. Write the perfect response to move them toward booking a call.

ORIGINAL EMAIL: ${originalEmail}
THEIR REPLY: ${replyText}
AGENCY: ${buildAgencyContext(lead?.user_id)}

Analyze reply type (interested / objection / question / price concern / has editor / not now).
Write ideal response: warm, confident, addresses their specific concern, moves toward booking.
Under 120 words. Include suggested subject line.

Format:
REPLY TYPE: [type]
SUBJECT: [subject]
---
[response body]`;

  return complete(prompt, undefined, 700);
}

async function generateFollowUp(lead, originalEmail, followUpNumber) {
  // Exact 5-step system per ContentCrafterzz training
  const stepConfig = [
    {
      angle: 'free value — shift angle completely',
      instruction: `Shift angle completely. Do NOT repeat the pitch. Give something genuinely free with no ask: a specific retention insight about their content, a real video idea tailored to them, OR a tactical observation about their best vs recent video performance. This PROVES skill without claiming it. End with a soft question if anything. MAX 50 WORDS.`,
      maxWords: 50,
      hasCTA: false,
    },
    {
      angle: 'pure value — timely insight, no ask',
      instruction: `Give a genuine insight about their content format, a trending topic in their niche they haven't covered, OR an algorithm insight specific to their content type. Reference something timely if possible. ZERO pitch. ZERO ask. Just pure value. The insight should make them think "this person actually knows their stuff." MAX 45 WORDS.`,
      maxWords: 45,
      hasCTA: false,
    },
    {
      angle: 'social proof — specific and relevant',
      instruction: `ONE specific result from a creator in a SIMILAR situation to theirs. Make it relevant to their exact problem. NOT generic "we helped creators grow" — be specific: "helped a [their niche] creator go from [X problem] to [Y result]." End with a soft question. MAX 40 WORDS.`,
      maxWords: 40,
      hasCTA: true,
    },
    {
      angle: 'genuine mild urgency',
      instruction: `Real, not fake urgency. Something like "Taking on 2 more creators this month" or "had a slot open up." Never fake countdown timers or artificial scarcity. Warm, honest, one ask. MAX 30 WORDS.`,
      maxWords: 30,
      hasCTA: true,
    },
    {
      angle: 'close the loop — final',
      instruction: `"Closing the loop" email — one of the highest reply-rate emails in cold outreach. People don't like unresolved open loops. Gracefully close the file. "Closing your file for now — if timing changes, you know where to find us." Warm, no pressure, leaves door permanently open. Mirror their language/energy if possible. NO ask. MAX 25 WORDS in body.`,
      maxWords: 25,
      hasCTA: false,
    },
  ];

  const step = stepConfig[Math.min(followUpNumber - 1, 4)];
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  const prompt = `You are Prahvi from ContentCrafterzz. Write follow-up #${followUpNumber}/5 for ${lead.channel_name}.

${CONTENTCRAFTERZZ_INTELLIGENCE}

CHANNEL:
Name: ${lead.channel_name} | ${(lead.subscriber_count || 0).toLocaleString()} subs | Niche: ${lead.niche || 'general'}
Upload: ${daysSince !== null ? `${daysSince} days since last upload` : `every ${lead.upload_frequency_days || '?'} days`}
Latest video: "${recentVideos[0]?.title || 'N/A'}" (${(recentVideos[0]?.views || 0).toLocaleString()} views)
Avg views: ${(lead.avg_views || 0).toLocaleString()}

FOLLOW-UP #${followUpNumber} STRATEGY: ${step.angle}

INSTRUCTION: ${step.instruction}

HARD RULES:
1. Under ${step.maxWords} words in the body. Hard limit.
2. NEVER repeat anything from the original email
3. NEVER mention pricing, plan names, or dollar amounts
4. NEVER sound desperate or salesy
5. Sign off: Prahvi (first name only — nothing else)
6. ${step.hasCTA ? 'End with ONE soft question' : 'No CTA — let the value speak'}
7. This is follow-up ${followUpNumber} — the tone should ${followUpNumber <= 2 ? 'lead with giving, not asking' : followUpNumber <= 4 ? 'be warm but slightly more direct' : 'be graceful, final, zero pressure'}

Return: SUBJECT: [subject under 6 words — different from all previous]
---
[body]`;

  return complete(prompt, undefined, 700);
}

async function analyzeChannelDeep(channelData) {
  const recentVideos = (() => {
    try { return Array.isArray(channelData.recent_videos) ? channelData.recent_videos : JSON.parse(channelData.recent_videos || '[]'); }
    catch { return []; }
  })();
  const daysSince = channelData.last_upload_date
    ? Math.floor((Date.now() - new Date(channelData.last_upload_date)) / 86400000) : null;

  const prompt = `You are a ContentCrafterzz channel analyst. Study this channel and identify exactly how we can help.

${buildAgencyContext(lead?.user_id)}

CHANNEL: ${channelData.channel_name} (@${channelData.channel_handle || 'N/A'})
Subs: ${(channelData.subscriber_count || 0).toLocaleString()} | Videos: ${channelData.total_videos}
Avg views: ${(channelData.avg_views || 0).toLocaleString()} | Engagement: ${channelData.engagement_rate || 0}%
Uploads every: ${channelData.upload_frequency_days || '?'} days | Days since last: ${daysSince ?? 'unknown'}
Description: ${channelData.channel_description?.substring(0, 400) || 'N/A'}
Last 10 videos: ${recentVideos.map(v => `"${v.title}" (${(v.views || 0).toLocaleString()} views)`).join(' | ')}

Return EXACTLY these 5 headers with specific data-driven answers:
1. BIGGEST PROBLEM: #1 problem RIGHT NOW — cite actual numbers
2. CORE DESIRE: What they want most — be specific
3. EDITING IMPROVEMENTS: What ContentCrafterzz would fix for THIS channel specifically
4. CONTENT STYLE: Their niche and production style
5. PERSONAL HOOK: One specific detail to open the email — exact video title, gap, or view count

Every point must use their actual data.`;

  return completeSmart(prompt, 'ContentCrafterzz channel analyst. Your insights make creators think "how did they know that about my channel?"', 1500);
}

async function generateAnalyzerEmail(channelData, deepStudy) {
  const recentVideos = (() => {
    try { return Array.isArray(channelData.recent_videos) ? channelData.recent_videos : JSON.parse(channelData.recent_videos || '[]'); }
    catch { return []; }
  })();
  const daysSince = channelData.last_upload_date
    ? Math.floor((Date.now() - new Date(channelData.last_upload_date)) / 86400000) : null;

  const subs = channelData.subscriber_count || 0;
  let psychProfile = 'SMALL/GROWING';
  if (subs >= 1000000) psychProfile = 'PROFESSIONAL/MEDIA';
  else if (subs >= 500000) psychProfile = 'CEO/FOUNDER/BUSINESS';
  else if (subs >= 100000) psychProfile = 'SOLO CREATIVE/FILMMAKER';
  const viewDrop = recentVideos.length >= 2 && recentVideos[0]?.views < (channelData.avg_views || 0) * 0.5;
  if (viewDrop) psychProfile = 'CREATOR IN PAIN';

  const prompt = `You are Prahvi from ContentCrafterzz. Write a cold outreach email so specific the creator thinks "how did they know?"

${CONTENTCRAFTERZZ_INTELLIGENCE}

CHANNEL: ${channelData.channel_name} | ${subs.toLocaleString()} subs
Avg views: ${(channelData.avg_views || 0).toLocaleString()} | Engagement: ${channelData.engagement_rate || 0}%
Upload gap: ${daysSince !== null ? `${daysSince} days since last upload` : `every ${channelData.upload_frequency_days || '?'} days`}
Recent videos: ${recentVideos.slice(0, 3).map(v => `"${v.title}" (${(v.views || 0).toLocaleString()} views)`).join(' | ') || 'N/A'}
Deep analysis: ${deepStudy}
Psychological profile: ${psychProfile}

REQUIREMENTS:
- Under 150 words in the body
- Opening line: reference EXACT video title or EXACT upload gap or EXACT sub count
- End with ONE question (not a directive)
- Sign: Prahvi (first name only)
- No pricing, no dollar amounts
- Score 8+ internally or rewrite

Return ONLY:
SUBJECT: [subject under 8 words — hyper-specific]
---
[email body under 150 words ending with a question, signed Prahvi]`;

  return complete(prompt, 'Elite outreach copywriter. 5%+ reply rates. Devastatingly specific. Every email ends with a question.', 1200);
}

async function generateAnalyzerDM(channelData, deepStudy) {
  const recentVideos = (() => {
    try { return Array.isArray(channelData.recent_videos) ? channelData.recent_videos : JSON.parse(channelData.recent_videos || '[]'); }
    catch { return []; }
  })();

  const prompt = `Write an Instagram DM for this YouTube creator.

CREATOR: ${channelData.channel_name} (${(channelData.subscriber_count || 0).toLocaleString()} subs)
RECENT VIDEO: "${recentVideos[0]?.title || 'N/A'}"
DEEP STUDY: ${deepStudy}
AGENCY: ${buildAgencyContext(lead?.user_id)}

Rules: Under 80 words. References specific content. Casual peer tone. $29 trial mention. ONE CTA. Zero sales speak.

Return ONLY the DM text.`;

  return complete(prompt, undefined, 400);
}

async function generateAnalyzerSubjects(channelData, mainSubject) {
  const recentVideos = (() => {
    try { return Array.isArray(channelData.recent_videos) ? channelData.recent_videos : JSON.parse(channelData.recent_videos || '[]'); }
    catch { return []; }
  })();

  const prompt = `Generate 3 cold email subject variants for ${channelData.channel_name} (${(channelData.subscriber_count || 0).toLocaleString()} subs).
Latest video: "${recentVideos[0]?.title || 'N/A'}"
Main subject: "${mainSubject}"

Return JSON array: ["curiosity variant", "result variant", "personal variant"]
Only return the JSON array.`;

  const result = await complete(prompt, undefined, 250);
  try { return JSON.parse(result.match(/\[.*\]/s)[0]); }
  catch { return [mainSubject, `Quick question about ${channelData.channel_name}`, `Your ${(channelData.avg_views || 0).toLocaleString()} avg views`]; }
}

async function testKey() {
  try {
    await complete('Say "OK" in one word.', undefined, 10);
    return { ok: true, provider: `Gemini (${FAST_MODEL})` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  complete,
  completeSmart,
  checkAiAvailability,
  generateFullPitch,
  deepStudyLead,
  generateOffer,
  generateColdEmail,
  generateRedditDM,
  generateSubjectVariants,
  scorePitch,
  rewriteEmail,
  suggestReplyResponse,
  generateFollowUp,
  testKey,
  analyzeChannelDeep,
  generateAnalyzerEmail,
  generateAnalyzerDM,
  generateAnalyzerSubjects,
  FAST_MODEL,
  SMART_MODEL,
  getGeminiKey,
  makeGeminiModel,
};
