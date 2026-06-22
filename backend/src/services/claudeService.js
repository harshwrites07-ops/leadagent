const { getSetting, getDb } = require('../models/database');

function getGeminiKeys() {
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

// gemini-2.0-flash: current default, 1500 req/day free tier
const FAST_MODEL  = process.env.GEMINI_FAST_MODEL  || 'gemini-2.0-flash';
const SMART_MODEL = process.env.GEMINI_MODEL       || 'gemini-2.0-flash';

// Claude models (used when ANTHROPIC_API_KEY is set)
const CLAUDE_FAST  = 'claude-haiku-4-5-20251001';
const CLAUDE_SMART = 'claude-sonnet-4-6';

async function completeWithClaude(prompt, systemPrompt, maxTokens, model) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const axios = require('axios');
  const body = {
    model: model || CLAUDE_FAST,
    max_tokens: maxTokens || 1200,
    messages: [{ role: 'user', content: prompt }],
  };
  if (systemPrompt) body.system = systemPrompt;
  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    body,
    {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    }
  );
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Claude');
  return text;
}

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

// Standard complete — Claude first, Gemini fallback
async function complete(prompt, systemPrompt = '', maxTokens = 1200) {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await completeWithClaude(prompt, systemPrompt, maxTokens, CLAUDE_FAST); } catch (e) {
      console.warn('[AI] Claude failed, falling back to Gemini:', e.message);
    }
  }
  const result = await completeWithGeminiRotating(prompt, systemPrompt, maxTokens, FAST_MODEL);
  if (result !== null) return result;
  throw new Error('AI unavailable — all keys exhausted.');
}

// Smart complete — Claude Sonnet first, Gemini fallback
async function completeSmart(prompt, systemPrompt = '', maxTokens = 2000) {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await completeWithClaude(prompt, systemPrompt, maxTokens, CLAUDE_SMART); } catch (e) {
      console.warn('[AI] Claude failed, falling back to Gemini:', e.message);
    }
  }
  const result = await completeWithGeminiRotating(prompt, systemPrompt, maxTokens, SMART_MODEL);
  if (result !== null) return result;
  throw new Error('AI unavailable — all keys exhausted.');
}

// Quick check: returns which AI provider is currently available
async function checkAiAvailability() {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      await completeWithClaude('Say OK', '', 5, CLAUDE_FAST);
      return { ok: true, provider: 'claude', model: CLAUDE_FAST };
    } catch (e) {
      console.warn('[AI] Claude availability check failed:', e.message);
    }
  }
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      await completeWithGemini('Say OK', '', 5, geminiKey, FAST_MODEL);
      return { ok: true, provider: 'gemini', model: FAST_MODEL };
    } catch (e) {
      if (isQuotaError(e)) {
        return { ok: false, error: 'All Gemini keys exhausted', retry_in: 'Try again shortly or add more keys at aistudio.google.com' };
      }
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: 'No AI key configured.' };
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL GENERATION v3 — human-first pitches that sound written, not generated
// ════════════════════════════════════════════════════════════════════════════

function formatSubCount(n) {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

const PITCH_SYSTEM_PROMPT = `You are a pitch writer for freelancers targeting YouTube creators.
Write pitches that sound like a HUMAN wrote them. Not a robot. Not a marketing tool.

RULES:
- Max 4 sentences in body (55-80 words total)
- Never use raw numbers like "2,590,000" — format as "2.59M"
- Start with ONE specific observation about their channel (upload drop, view count, pattern)
- Show empathy in line 2 (they're probably doing everything themselves and it's getting overwhelming)
- ONE line of social proof with a specific before/after result
- ONE soft CTA question (5-8 words, answerable with yes/no)
- Never use: "view-to-sub ratio", "conversion rate", "metrics", "analytics", "I noticed", "I came across", "hope this finds you", "collaboration", "exciting opportunity", "game changer", "I'm reaching out", "leaving money on the table"
- Sound like a colleague reaching out, not a salesman pitching
- Never start body with "I"
- Sign with sender first name only, on its own line after a blank line

STRUCTURE:
Line 1: Specific observation (what you noticed — name something real and specific)
Line 2: What this usually means (empathy — not about your service, about their situation)
Line 3: Proof ("Helped a [niche] creator in the same spot → [specific before/after result]")
Line 4: Soft CTA question (not a demand)

[blank line]
[sender first name]

SUBJECT LINE:
- Max 8 words
- Must include ONE specific data point (views, upload frequency, subscriber count, etc.)
- No clickbait, no "quick question", no generic phrases

TONE: Casual, direct, human, confident. NOT: Formal, robotic, salesy, desperate.`;

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

// ─── Step 4: Signal detection + prompt engine ────────────────────────────────

function daysAgoText(dateStr) {
  if (!dateStr) return 'recently';
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return 'recently';
}

function getServiceIntelligence(lead, voiceDNA) {
  const {
    channel_name,
    subscriber_count = 0,
    avg_views = 0,
    recent_videos = [],
    upload_frequency_days = 7,
    last_upload_date,
    niche,
    channel_description = '',
  } = lead;

  const service = (voiceDNA?.service || 'video editing').toLowerCase();
  const isEditor = service.includes('edit');
  const isThumbnail = service.includes('thumbnail');
  const isWriter = service.includes('script') || service.includes('writ');

  let videos = [];
  try {
    videos = typeof recent_videos === 'string'
      ? JSON.parse(recent_videos)
      : (recent_videos || []);
  } catch { videos = []; }

  const signals = [];

  // SIGNAL 1: Upload gap
  const daysSinceUpload = last_upload_date
    ? Math.floor((Date.now() - new Date(last_upload_date)) / 86400000)
    : null;

  if (daysSinceUpload !== null && daysSinceUpload > 21) {
    signals.push({
      priority: 10,
      type: 'upload_gap',
      hook: `${channel_name} hasn't uploaded in ${daysSinceUpload} days`,
      angle: daysSinceUpload > 60
        ? `A ${Math.round(daysSinceUpload / 30)}-month gap usually means one thing — the workload caught up with them. Everything else in their life is fine. Just the channel got too heavy to carry alone.`
        : `3-week gaps are almost always the same story — they're editing their own content and it's eating their entire week.`,
      openingLine: daysSinceUpload > 60
        ? `${daysSinceUpload} days without a video.`
        : `Last upload was ${daysSinceUpload} days ago.`,
    });
  }

  // SIGNAL 2: Specific video performance drop
  if (videos.length >= 4) {
    const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0));
    const best = sorted[0];
    const recent3 = videos.slice(-3);
    const recentAvg = recent3.reduce((s, v) => s + (v.views || 0), 0) / recent3.length;
    const dropPct = best.views > 0
      ? Math.round(((best.views - recentAvg) / best.views) * 100)
      : 0;

    if (dropPct > 30 && best.title) {
      signals.push({
        priority: 9,
        type: 'video_drop',
        hook: `"${best.title.substring(0, 50)}" got ${formatNumber(best.views)} views. Last 3 averaged ${formatNumber(Math.round(recentAvg))}.`,
        angle: `That ${dropPct}% drop between their best video and recent ones isn't about topics or the algorithm. It's almost always pacing and hook structure in the edit.`,
        openingLine: `"${best.title.substring(0, 45)}" hit ${formatNumber(best.views)}.`,
      });
    }
  }

  // SIGNAL 3: Subscriber-to-view gap
  const viewToSubRatio = subscriber_count > 0
    ? ((avg_views / subscriber_count) * 100).toFixed(1)
    : 0;

  if (viewToSubRatio > 0 && viewToSubRatio < 8 && subscriber_count > 30000) {
    const bestVideo = videos.length > 0
      ? videos.reduce((best, v) => (v.views || 0) > (best.views || 0) ? v : best, videos[0])
      : null;
    const bestTitle = bestVideo?.title?.substring(0, 40) || null;

    signals.push({
      priority: 8,
      type: 'ratio_gap',
      hook: bestTitle
        ? `${formatNumber(subscriber_count)} subscribers but "${bestTitle}..." only got ${formatNumber(bestVideo.views)} views.`
        : `${formatNumber(subscriber_count)} subscribers, ${formatNumber(Math.round(avg_views))} average views — ${viewToSubRatio}% view rate.`,
      angle: `That ${viewToSubRatio}% ratio tells me their subscribers want to watch, but something in the first 30 seconds of each video is losing them. Hook structure is almost always the fix.`,
      openingLine: bestTitle
        ? `"${bestTitle}..." underperformed for ${formatNumber(subscriber_count)} subscribers.`
        : `${viewToSubRatio}% of ${formatNumber(subscriber_count)} subscribers are watching.`,
    });
  }

  // SIGNAL 4: Viral gap
  if (videos.length >= 2) {
    const highPotentialKeywords = [
      'million', 'quit', 'fired', 'broke', 'failed', 'honest',
      'truth', 'secret', 'never', 'worst', 'best', 'how i',
      'why i', 'story', 'exposed', 'viral',
    ];
    const viralVideo = videos.find(v =>
      highPotentialKeywords.some(kw => (v.title || '').toLowerCase().includes(kw))
      && (v.views || 0) > avg_views * 1.5
    );
    const normalVideos = videos.filter(v => v !== viralVideo && (v.views || 0) < avg_views);
    if (viralVideo && normalVideos.length >= 2) {
      const normalAvg = normalVideos.reduce((s, v) => s + (v.views || 0), 0) / normalVideos.length;
      signals.push({
        priority: 7,
        type: 'viral_gap',
        hook: `"${viralVideo.title?.substring(0, 45)}" got ${formatNumber(viralVideo.views)}. Regular videos average ${formatNumber(Math.round(normalAvg))}.`,
        angle: `The viral video proves the audience exists and wants their content. The gap between that and regular videos is almost always in how the first 90 seconds is structured.`,
        openingLine: `"${viralVideo.title?.substring(0, 40)}" proved the audience is there.`,
      });
    }
  }

  // SIGNAL 5: Upload frequency slowdown
  if (upload_frequency_days > 14 && upload_frequency_days < 60) {
    signals.push({
      priority: 6,
      type: 'frequency_slow',
      hook: `${channel_name} is averaging 1 video every ${Math.round(upload_frequency_days)} days`,
      angle: `Most creators at this posting frequency aren't choosing to post less. They're editing their own content and it takes their entire week. There's no time left to film.`,
      openingLine: `One video every ${Math.round(upload_frequency_days)} days.`,
    });
  }

  // SIGNAL 6: Hiring keyword in description (HIGHEST PRIORITY)
  const descLower = (channel_description || '').toLowerCase();
  const hiringKeywords = ['looking for', 'hiring', 'need a', 'editor wanted', 'join my team', 'collab'];
  const hiringMatch = hiringKeywords.find(kw => descLower.includes(kw));
  if (hiringMatch) {
    signals.push({
      priority: 11,
      type: 'confirmed_hiring',
      hook: `${channel_name}'s channel description says "${hiringMatch}"`,
      angle: `They're already looking. They just haven't found the right person yet.`,
      openingLine: `Saw that you're looking for help with your channel.`,
    });
  }

  signals.sort((a, b) => b.priority - a.priority);
  const bestSignal = signals[0] || {
    type: 'growth_opportunity',
    hook: `${channel_name} is averaging ${formatNumber(Math.round(avg_views))} views with ${formatNumber(subscriber_count)} subscribers`,
    angle: `There's almost always 20-30% more views sitting in the edit that never get unlocked.`,
    openingLine: `Noticed ${channel_name}'s channel.`,
  };

  return {
    signal: bestSignal,
    videos: videos.slice(0, 5),
    daysSinceUpload,
    viewToSubRatio,
    service,
    isEditor, isThumbnail, isWriter,
  };
}

function buildMasterPrompt(lead, voiceDNA, intelligence) {
  const { signal, videos, daysSinceUpload, service } = intelligence;
  const voice = voiceDNA || {};

  const videoContext = videos.length > 0
    ? videos.map((v, i) =>
        `${i + 1}. "${v.title || 'Untitled'}" — ${formatNumber(v.views || 0)} views`
      ).join('\n')
    : 'No recent video data available';

  const senderName = voice.name || voice.fullName?.split(' ')[0] || 'Alex';
  const senderService = voice.service || 'video editing';
  const senderProof = voice.socialProof || voice.best_result || null;
  const senderStyle = voice.communicationStyle || 'direct and conversational';
  const senderGoal = voice.outreachGoal || 'book_call';

  const ctaOptions = {
    book_call: [
      'Worth a 15-minute call to see if it makes sense?',
      'Want to see what the fix looks like for your channel specifically?',
      'Open to a quick call this week?',
      'Worth exploring?',
    ],
    send_portfolio: [
      'Want me to send over some examples?',
      'Happy to share what this looked like for similar channels.',
      'Want to see the before/after?',
    ],
    get_reply: ['Thoughts?', 'Does this sound familiar?', 'Know what I mean?'],
  };

  const ctaList = ctaOptions[senderGoal] || ctaOptions.book_call;
  const cta = ctaList[Math.floor(Math.random() * ctaList.length)];

  return `You are ${senderName}, a ${senderService} specialist writing a cold email to a YouTube creator.

YOUR WRITING IDENTITY:
- Name: ${senderName}
- Service: ${senderService}
- Communication style: ${senderStyle}
${senderProof ? `- Your best result: "${senderProof}"` : ''}
- Goal of this email: ${senderGoal === 'book_call' ? 'Get them to agree to a 15-minute call' : 'Get a reply'}

CREATOR YOU ARE WRITING TO:
- Channel: ${lead.channel_name}
- Subscribers: ${formatNumber(lead.subscriber_count)}
- Average views: ${formatNumber(Math.round(lead.avg_views || 0))}
- Niche: ${lead.niche || 'general'}
${daysSinceUpload ? `- Days since last upload: ${daysSinceUpload}` : ''}
${lead.channel_description ? `- Channel description: "${(lead.channel_description || '').substring(0, 300)}"` : ''}

THEIR RECENT VIDEOS (use these titles - this is gold):
${videoContext}

THE SPECIFIC SIGNAL YOU FOUND:
${signal.hook}
Why this matters: ${signal.angle}
Start with this opening: "${signal.openingLine}"

PERFECT EMAIL EXAMPLES TO LEARN FROM:
These are real emails that got replies. Study the TONE not the template:

Example 1 (upload gap signal):
Subject: 34 days
Body: Last upload was 34 days ago.
That usually means one thing — you're editing your own content and it's eating every hour you have.
Helped a finance creator cut edit time from 12 hours to 2. They went from 1 upload/month to 5.
Worth a 15-minute call to see if something similar makes sense for you?
[Name]

Example 2 (view drop signal):
Subject: "How I Made $0" got 847K. Last 3 averaged 41K.
Body: "How I Made $0 Dropshipping" hit 847K views.
Your last 3 videos averaged 41K.
The difference is almost always in the first 60 seconds — hook structure and pacing.
Fixed this for a business creator. Next video did 312K.
Want to see what changed?
[Name]

Example 3 (subscriber ratio signal):
Subject: 2.1M subs, 67K average views
Body: 2.1M subscribers watching 67K videos means 96% of your audience is choosing not to click.
That's not a topic problem. It's a thumbnail and hook problem.
Redesigned thumbnails for a creator your size — CTR went from 2.1% to 6.8% in 30 days.
Worth exploring?
[Name]

Example 4 (confirmed hiring signal):
Subject: Saw you're looking for an editor
Body: Noticed you're looking for help with your channel.
I work with ${lead.niche || 'content'} creators specifically — helped one go from 80K to 240K views per video by fixing the edit structure.
Happy to share some examples if you want to see if the style matches what you're looking for.
[Name]

Example 5 (viral gap signal):
Subject: One video proved the audience is there
Body: "Why I Left Google" hit 2.3M views.
Your last 5 averaged 44K.
The viral video proved people want your content. The gap is in how the regular videos are structured in the first 90 seconds.
Worked on this exact problem with a tech creator. Their "normal" videos now average 340K.
Want to see what the fix looked like?
[Name]

STRICT RULES:
1. Maximum 4 sentences in the body (NOT including sign-off)
2. Total word count: 50-80 words in body
3. Never write numbers like "2,590,000" — write "2.59M"
4. Never use these words: "metrics", "analytics", "ratio", "conversion", "leverage", "synergy", "reach out", "touch base", "circle back", "hope this finds you", "I wanted to", "My name is"
5. Subject line: MAX 8 words, must be specific, no clickbait
6. First sentence must be the specific observation — no intro, no "Hi I'm..."
7. Second sentence: what this usually means (show you understand their situation)
8. Third sentence: one specific proof point with a real number
9. Fourth sentence: ONE soft CTA question
10. Sign with just: ${senderName}
11. Never explain what you do in the first sentence
12. Make it feel like you spent 30 minutes studying their specific channel
13. If you have video titles — USE THEM. A specific title in the subject line gets 3x more opens.

WHAT MAKES A REPLY-WORTHY EMAIL:
- Specific (mentions their actual video title or exact number)
- Empathetic (shows you understand their struggle, not just their stats)
- Proof (one specific result you got for someone similar)
- Short (creator reads in 15 seconds)
- Curious (makes them wonder "how do they know this?")

OUTPUT FORMAT — respond with ONLY valid JSON, nothing else:
{
  "subject": "subject line here (max 8 words)",
  "body": "full email body here",
  "pitch_score": 85,
  "word_count": 72,
  "signal_used": "${signal.type}",
  "opening_hook": "${signal.openingLine}"
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

  // Proof alignment penalty (-15 pts) — catches the most common failure mode:
  // hook about editing/retention but proof shows subscriber count growth
  const hookIsViews = /\d[\d,]+\s*(?:views|avg|average)/i.test(body);
  const hookIsRatio = /\d[\d.]+%\s*(?:view|rate|ratio)/i.test(body) || /view[-\s]?(?:through|to[-\s]?sub)/i.test(body);
  const hookIsUploads = /\d+\s*days?\s*(?:ago|since|gap)/i.test(body);
  const proofShowsSubGrowth = /from\s+\d+k?\s+to\s+\d+k?\s+sub/i.test(body) || /\d+k?\s*(?:to|→)\s*\d+k?\s*subs/i.test(body);
  if ((hookIsViews || hookIsRatio) && proofShowsSubGrowth && !hookIsUploads) {
    score -= 15; // proof metric doesn't match hook metric
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Parse AI response ────────────────────────────────────────────────────────
function parsePitchResponseV2(text, lead) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const p = JSON.parse(jsonMatch[0]);
    // Accept both old and new field names
    const subject = p.subject || p.email_subject;
    const body    = p.body    || p.email_body;
    if (!subject || !body) throw new Error('Missing fields');
    return {
      email_subject:    subject,
      email_body:       body,
      subject_variants: p.subject_variants || [],
      key_insight:      p.key_insight      || '',
      custom_offer:     p.custom_offer     || '',
      tone_used:        p.tone_used        || '',
      personalization_elements: p.personalization_elements || [],
      psychology_applied: p.psychology_applied || '',
      word_count:  p.word_count  || body.split(/\s+/).filter(Boolean).length,
      pitch_score: p.pitch_score || p.quality_score || null,
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

  // Resolve sender name from the lead's owner — never hardcode
  let senderFirst = 'Alex';
  try {
    const u = getDb().prepare('SELECT full_name FROM users WHERE id=?').get(lead.user_id);
    if (u?.full_name) senderFirst = u.full_name.split(' ')[0];
  } catch {}

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
      const prompt = `You are ${senderFirst}. Write follow-up #${steps.indexOf(step)+1}/5 for ${lead.channel_name}.

CHANNEL: ${lead.channel_name} | ${subs} subs | Niche: ${niche}
${latestVideo ? `Latest video: "${latestVideo}"` : ''}
Initial email sent — now follow up with a COMPLETELY DIFFERENT angle.

ANGLE: ${step.angle}
INSTRUCTION: ${step.instruction}

RULES:
• Under ${step.maxWords} words body. Hard limit.
• NEVER repeat anything from the first email.
• Never sound desperate. Never mention pricing.
• Sign: ${senderFirst} (first name only)
• ${step.hasCTA ? 'End with ONE soft, low-commitment question' : 'No CTA — let the value speak'}
• Tone: ${psychology.tone}
• Different subject from all previous emails

Return ONLY valid JSON:
{"subject": "under 6 words", "body": "email body", "day": ${step.day}}`;

      const raw = await complete(prompt, '', 600);
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
  let name = 'there', service = 'your space';
  try {
    const u = getDb().prepare('SELECT full_name, service_type FROM users WHERE id=?').get(userId || lead.user_id);
    if (u?.full_name) name = u.full_name.split(' ')[0];
    if (u?.service_type) service = u.service_type.toLowerCase();
  } catch {}
  const uploadAgo = daysAgoText(lead.last_upload_date);
  return {
    email_subject: `your ${lead.niche || 'channel'} views`,
    email_body: `Your last few uploads have been getting around ${(lead.avg_views||0).toLocaleString()} views — there's a gap between your best video and your most recent ones worth looking at.\n\nHelped a ${lead.niche||'similar'} creator fix exactly this. Would a quick breakdown of what's holding back your views be useful?\n\n${name}`,
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

// ─── Validation: check email body for disqualifying patterns ─────────────────
const BANNED_PATTERNS = [
  [/I came across/i,            '"I came across"'],
  [/I noticed/i,                '"I noticed"'],
  [/love your content/i,        '"love your content"'],
  [/hope this finds/i,          '"hope this finds"'],
  [/I wanted to reach out/i,    '"I wanted to reach out"'],
  [/touching base/i,            '"touching base"'],
  [/exciting opportunity/i,     '"exciting opportunity"'],
  [/leaving money on the table/i,'"leaving money on the table"'],
  [/game.changer/i,             '"game changer"'],
  [/amazing content/i,          '"amazing content"'],
  [/incredible work/i,          '"incredible work"'],
  [/I hope/i,                   '"I hope"'],
  [/collaboration/i,             '"collaboration"'],
  [/quick question/i,           '"quick question"'],
  [/just wanted to/i,           '"just wanted to"'],
  [/I'm reaching out/i,         '"I\'m reaching out"'],
  [/most channels your size/i,  '"most channels your size"'],
];

function isStatDumpSubject(subject) {
  if (!subject) return false;
  // Pattern: two numbers separated by comma/space — e.g. "623K views, 4.2M subs" or "2.8M subs, 3.7% view rate"
  const twoNumberPattern = /[\d.,]+[KkMm]?\s+\w+,?\s+[\d.,]+[KkMm%]?\s+\w+/;
  return twoNumberPattern.test(subject);
}

function failsValidation(subject, body) {
  if (!body) return 'empty body';
  const wc = body.split(/\s+/).filter(Boolean).length;
  if (wc > 90) return `too long (${wc} words, max 90)`;
  if (subject && subject.split(/\s+/).length > 8) return `subject too long (${subject.split(/\s+/).length} words, max 8)`;
  if (subject && isStatDumpSubject(subject)) return `subject is a stat dump ("${subject}") — must be an observation, not raw numbers`;
  if (/^I /i.test(body.trim())) return 'body starts with "I"';
  for (const [pattern, label] of BANNED_PATTERNS) {
    if (pattern.test(body)) return `banned phrase ${label}`;
  }
  return null; // passes
}

// ─── MAIN: generateFullPitch v3 — Sonnet + signal detection engine ────────────
async function generateFullPitch(lead, userId = null) {
  const db = getDb();

  // Get user's voice DNA
  let voiceDNA = {};
  let nameWarning = null;
  try {
    const user = db.prepare('SELECT voice_dna, full_name FROM users WHERE id = ?').get(userId);
    voiceDNA = user?.voice_dna ? JSON.parse(user.voice_dna) : {};
    if (!voiceDNA.name && user?.full_name) {
      voiceDNA.name = user.full_name.split(' ')[0];
    }
  } catch (e) {
    console.error('[Pitch] Error loading voice DNA:', e.message);
  }

  if (!voiceDNA.name || !voiceDNA.service) {
    console.warn(`[Pitch] User ${userId} has incomplete voice DNA — pitch quality will be lower`);
    if (!voiceDNA.name) nameWarning = 'Please set your name in Settings → Voice Profile first';
  }

  // Signal detection + prompt build
  const intelligence = getServiceIntelligence(lead, voiceDNA);
  const prompt = buildMasterPrompt(lead, voiceDNA, intelligence);

  console.log(`[Pitch] Signal: ${intelligence.signal.type} for ${lead.channel_name}`);

  // Generate with Sonnet (with Gemini fallback)
  let result = null;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let raw = null;
      if (process.env.ANTHROPIC_API_KEY) {
        raw = await completeWithClaude(prompt, '', 1000, 'claude-sonnet-4-6');
      }
      if (!raw) raw = await completeSmart(prompt, '', 1000);
      if (!raw) throw new Error('No AI response');

      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.subject && parsed.body) {
        result = parsed;
        break;
      }
    } catch (e) {
      console.error(`[Pitch] Attempt ${attempt} failed:`, e.message);
      if (attempt === MAX_ATTEMPTS) {
        try {
          let raw = null;
          const fallbackPrompt = prompt + '\n\nIMPORTANT: Respond with ONLY the JSON object. No other text.';
          if (process.env.ANTHROPIC_API_KEY) {
            raw = await completeWithClaude(fallbackPrompt, '', 800, 'claude-sonnet-4-6');
          }
          if (!raw) raw = await completeSmart(fallbackPrompt, '', 800);
          if (raw) {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) result = JSON.parse(match[0]);
          }
        } catch {}
      }
    }
  }

  if (!result) {
    console.warn('[Pitch] All attempts failed — using fallback for', lead.channel_name);
    return buildFallback(lead, userId);
  }

  // Generate 2 alternative subject lines (A/B testing)
  const altSubjectPrompt = `Generate 2 alternative subject lines for this email.
Channel: ${lead.channel_name}
Current subject: "${result.subject}"
Signal: ${intelligence.signal.hook}

Rules:
- Max 8 words each
- Must be specific (include a number or video title)
- Different angle than current subject
- No clickbait

Respond with ONLY JSON:
{"alt1": "subject here", "alt2": "subject here"}`;

  try {
    let altRaw = null;
    if (process.env.ANTHROPIC_API_KEY) {
      altRaw = await completeWithClaude(altSubjectPrompt, '', 200, 'claude-sonnet-4-6');
    }
    if (!altRaw) altRaw = await complete(altSubjectPrompt, '', 200);
    if (altRaw) {
      const alts = JSON.parse(altRaw.replace(/```json|```/g, '').trim());
      result.alt_subjects = [alts.alt1, alts.alt2].filter(Boolean);
    }
  } catch {
    result.alt_subjects = [];
  }

  // Score quality
  const qualityScore = scorePitchQuality(result, lead, intelligence);
  result.pitch_score = qualityScore;
  result.signal_used = intelligence.signal.type;

  console.log(`[Pitch] Score ${qualityScore}/100 | Signal: ${result.signal_used} | ${lead.channel_name}`);

  // Save to database
  try {
    db.prepare(`
      INSERT OR REPLACE INTO pitches
      (lead_id, user_id, email_subject, cold_email, subject_variants, pitch_score, signal_type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      lead.id,
      userId,
      result.subject,
      result.body,
      JSON.stringify(result.alt_subjects || []),
      result.pitch_score,
      result.signal_used,
    );
  } catch (e) {
    console.error('[Pitch] Error saving pitch:', e.message);
  }

  return {
    subject: result.subject,
    body: result.body,
    pitch_score: result.pitch_score,
    signal_used: result.signal_used,
    alt_subjects: result.alt_subjects || [],
    word_count: result.word_count,
    // Backward compat fields for PitchGenerator.jsx normalizePitch
    email_subject: result.subject,
    cold_email_body: result.body,
    cold_email: result.body,
    subject_variants: result.alt_subjects || [],
    name_warning: nameWarning,
    follow_ups: [],
  };
}

// ─── Pitch quality scorer ──────────────────────────────────────────────────────
function scorePitchQuality(pitch, lead, intelligence) {
  let score = 50;

  const { subject, body } = pitch;
  const bodyWords = body?.split(' ').length || 0;
  const subjectWords = subject?.split(' ').length || 0;

  if (body?.includes(lead.channel_name)) score += 5;

  const videos = intelligence.videos || [];
  const titleMentioned = videos.some(v =>
    v.title && body?.toLowerCase().includes(v.title.toLowerCase().substring(0, 20))
  );
  if (titleMentioned) score += 15;

  const hasNumbers = /\d+K|\d+M|\d+%|\d+ days/.test(body || '');
  if (hasNumbers) score += 10;

  if (bodyWords >= 45 && bodyWords <= 90) score += 10;
  else if (bodyWords > 90) score -= 10;
  else if (bodyWords < 40) score -= 15;

  if (subjectWords >= 3 && subjectWords <= 8) score += 5;
  else score -= 5;

  const badPhrases = [
    'hope this finds you', 'my name is', 'i wanted to reach out',
    'touch base', 'circle back', 'leverage', 'synergy', 'analytics', 'metrics',
  ];
  const badCount = badPhrases.filter(p => body?.toLowerCase().includes(p)).length;
  score -= badCount * 8;

  if (intelligence.signal.type === 'confirmed_hiring') score += 20;
  if (intelligence.signal.type === 'video_drop') score += 10;
  if (intelligence.signal.type === 'viral_gap') score += 10;
  if (intelligence.signal.type === 'upload_gap') score += 8;
  if (intelligence.signal.type === 'growth_opportunity') score -= 10;

  if (body?.trim().endsWith('?')) score += 8;

  const hasProof = /\d+[KM]?\s*(views|subs|subscribers|upload|video)/i.test(body || '');
  if (hasProof) score += 8;

  return Math.min(Math.max(score, 0), 100);
}

// ─── Bulk pitch quality filter ────────────────────────────────────────────────
async function generateAndValidatePitch(lead, userId, minScore = 60) {
  let pitch = await generateFullPitch(lead, userId);

  if (pitch.pitch_score < minScore) {
    console.log(`[Pitch] Score ${pitch.pitch_score} below ${minScore} threshold, regenerating...`);
    const retry = await generateFullPitch(lead, userId);
    if (retry.pitch_score > pitch.pitch_score) pitch = retry;
  }

  return pitch;
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
  generateAndValidatePitch,
  scorePitchQuality,
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
  getGeminiKeys,
  makeGeminiModel,
};
