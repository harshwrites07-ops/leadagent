const path = require('path');
const ENV_PATH = path.join(__dirname, '../../../.env');
const { getSetting } = require('../models/database');

function getGeminiKey() {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const dbKey = getSetting('gemini_api_key');
  const key = (dbKey && dbKey !== 'placeholder') ? dbKey : process.env.GEMINI_API_KEY;
  return (key && key !== 'placeholder') ? key : null;
}

function getAnthropicKey() {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const dbKey = getSetting('anthropic_api_key');
  const key = (dbKey && dbKey !== 'placeholder') ? dbKey : process.env.ANTHROPIC_API_KEY;
  return (key && key !== 'placeholder') ? key : null;
}

// Fast model for pitch generation — 2-4x faster than Pro, same writing quality
const FAST_MODEL  = process.env.GEMINI_FAST_MODEL  || 'gemini-2.0-flash';
// Pro model for deep analysis tasks that need reasoning
const SMART_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function makeGeminiModel(key, modelName, systemPrompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt || 'You are an expert outreach copywriter for a video editing agency.',
  });
}

async function completeWithGemini(prompt, systemPrompt, maxTokens, key, modelName) {
  const model = makeGeminiModel(key, modelName || SMART_MODEL, systemPrompt);
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });
  return result.response.text();
}

async function completeWithClaude(prompt, systemPrompt, maxTokens, key) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemPrompt || 'You are an expert outreach copywriter for a video editing agency.',
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

// Returns true if the error is a recoverable quota/rate error (should fall back to Claude)
function isQuotaError(err) {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  return msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429') ||
         msg.includes('rate') || msg.includes('limit') || msg.includes('503') || msg.includes('overloaded');
}

// Standard complete — Gemini first, auto-falls back to Claude on quota/rate errors
async function complete(prompt, systemPrompt = '', maxTokens = 1200) {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      return await completeWithGemini(prompt, systemPrompt, maxTokens, geminiKey, FAST_MODEL);
    } catch (geminiErr) {
      if (isQuotaError(geminiErr)) {
        console.warn('[AI] Gemini quota/rate hit — falling back to Claude:', geminiErr.message?.substring(0, 120));
      } else {
        throw geminiErr;
      }
    }
  }
  const anthropicKey = getAnthropicKey();
  if (anthropicKey) return completeWithClaude(prompt, systemPrompt, maxTokens, anthropicKey);
  throw new Error('AI unavailable — Gemini quota exceeded and no Claude fallback key configured. Add an Anthropic key in Settings.');
}

// Smart complete — uses the configured smart model, same fallback chain
async function completeSmart(prompt, systemPrompt = '', maxTokens = 2000) {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      return await completeWithGemini(prompt, systemPrompt, maxTokens, geminiKey, SMART_MODEL);
    } catch (geminiErr) {
      if (isQuotaError(geminiErr)) {
        console.warn('[AI] Gemini smart quota/rate hit — falling back to Claude:', geminiErr.message?.substring(0, 120));
      } else {
        throw geminiErr;
      }
    }
  }
  const anthropicKey = getAnthropicKey();
  if (anthropicKey) return completeWithClaude(prompt, systemPrompt, maxTokens, anthropicKey);
  throw new Error('AI unavailable — Gemini quota exceeded and no Claude fallback key configured.');
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
        const anthropicKey = getAnthropicKey();
        if (anthropicKey) {
          try {
            await completeWithClaude('Say OK', '', 5, anthropicKey);
            return { ok: true, provider: 'claude_fallback', model: 'claude-haiku', note: 'Gemini quota exceeded — using Claude' };
          } catch {}
        }
        return { ok: false, error: 'Gemini quota exceeded and no Claude fallback', retry_in: 'Try again tomorrow or add Claude key in Settings' };
      }
      return { ok: false, error: e.message };
    }
  }
  const anthropicKey = getAnthropicKey();
  if (anthropicKey) {
    try {
      await completeWithClaude('Say OK', '', 5, anthropicKey);
      return { ok: true, provider: 'claude', model: 'claude-haiku' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: 'No AI API key configured. Add Gemini or Anthropic key in Settings.' };
}

// ─── Business context ─────────────────────────────────────────────────────────
const BUSINESS_PROFILE = `
AGENCY: ContentCrafterzz — Premium YouTube Video Editing Agency
WHAT WE SELL: Retention-optimized video editing. We fix viewer dropout and help creators upload consistently.
PHILOSOPHY: Every frame matters. Every second counts. Retention is the metric that matters most.

PRICING:
- Starter: $499/mo — 4 videos, basic color, 2 revisions
- Growth: $999/mo — 8 videos + 16 reels, unlimited revisions, dedicated editor (MOST POPULAR)
- Scale: $1,999/mo — unlimited, same-day, team of 3 editors, weekly strategy calls
- Trial: $29 one-time first video OR free first edit (zero risk)

TURNAROUND: Standard 5-7d | Growth 48-72h | Scale 24h same-day

IDEAL CLIENT: YouTube creators 10K–500K subs, getting 30-60% retention (we improve to 65%+), uploading inconsistently

PROOF POINTS (use exactly these):
- "Finance creator (50K subs): views up 40% in 8 weeks after editing consistency"
- "Fitness coach (120K subs): retention 42%→68%, landed sponsorship in 6 months"
- "Podcast (30K listeners): converted to YouTube Shorts, hit 50K YouTube subs in 4 months"

EMAIL RULES — ABSOLUTE:
Subject (8 words max): Reference channel name, upload gap, or specific video. No generic subjects.
Opening: MUST reference their exact video title OR exact sub count OR exact days since upload. Prove you studied them.
Pain: Name their exact problem using their real numbers. Make them think "how did they know?"
Proof: ONE case study from the list above.
Offer: $29 trial edit or free first video — zero risk, easy yes.
CTA: ONE ask — "Reply with your best video" OR "Want us to edit one free?"
Length: Under 150 words.
BANNED: "I hope this finds you well" | "I came across" | "I wanted to reach out" | "touch base" | "circle back" | "synergy" | any generic opener
`.trim();

function buildAgencyContext() {
  const name = getSetting('your_name') || 'the founder';
  const role = getSetting('your_role') || 'Founder';
  const portfolio = getSetting('portfolio_url') || '(portfolio link)';
  const agencyName = getSetting('agency_name') || 'ContentCrafterzz';
  return `${BUSINESS_PROFILE}\n\nSENDER: ${name} | ${role} | ${agencyName} | ${portfolio}`;
}

// ─── ONE-SHOT pitch generation — Prahvi persona, 120-word limit, score ≥7 ─────
// Returns { email_subject, email_body, subject_variants, custom_offer, key_insight }
async function generateFullPitch(lead) {
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const painPoints = (() => { try { return JSON.parse(lead.pain_points || '[]'); } catch { return []; } })();
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000)
    : null;
  const ctx = buildAgencyContext();

  const prompt = `You are writing a cold outreach email on behalf of Prathvi, founder of ContentCrafterzz (a YouTube video editing agency). Write like a real human texting — not a marketer, not a salesperson.

CHANNEL DATA:
Name: ${lead.channel_name} | ${(lead.subscriber_count || 0).toLocaleString()} subs
Avg views: ${(lead.avg_views || 0).toLocaleString()} | Engagement: ${lead.engagement_rate || 0}%
Upload gap: ${daysSince !== null ? `${daysSince} days since last upload (normally uploads every ${lead.upload_frequency_days || '?'} days)` : `uploads every ${lead.upload_frequency_days || '?'} days`}
Recent videos: ${recentVideos.slice(0, 3).map(v => `"${v.title}" (${(v.views || 0).toLocaleString()} views)`).join(' | ') || 'N/A'}
Issues: ${painPoints.map(p => p.label).join(', ') || 'inconsistent uploads, retention drop'}
Niche: ${lead.niche || 'general'}

PROOF POINTS (use ONE if relevant):
- "Finance creator (50K subs): views up 40% in 8 weeks"
- "Fitness coach (120K subs): retention 42%→68%, landed sponsorship"
- "Podcast (30K listeners): hit 50K YouTube subs in 4 months"

HARD RULES — ZERO EXCEPTIONS:
1. UNDER 100 WORDS TOTAL in the email body. Count every word. If over 100, rewrite shorter.
2. First line must reference their EXACT video title OR exact days since upload OR exact sub count — no paraphrasing.
3. Name their specific problem with real numbers from the data above.
4. ONE CTA only: "reply if you want me to take a look" OR "want me to send over an example?"
5. ALWAYS sign off as exactly:
   Prathvi
   ContentCrafterzz
6. NEVER mention: pricing, plan names, "free edit", "free trial", "$29", "Starter", "Growth", "Scale", any dollar amount
7. NEVER use: "I hope", "I came across", "I wanted to reach out", "touch base", "circle back", "I noticed", "I was browsing", "leverage", "synergy", "game-changer", "exciting opportunity"
8. NO salesy language. Sound like a person, not a brand.
9. Subject line under 8 words — specific to their channel/video/gap.
10. QUALITY GATE: Score 1-10 internally. Under 7 = rewrite before responding. Return only the 7+ version.

Return ONLY valid JSON (no markdown, no backticks):
{
  "key_insight": "the single most specific thing about this channel you used",
  "custom_offer": "one line describing what you'd help them with — no prices",
  "email_subject": "subject under 8 words",
  "email_body": "email body UNDER 100 WORDS, signed Prathvi\\nContentCrafterzz",
  "subject_variants": ["curiosity variant", "result variant", "personal variant"],
  "score": <number 1-10>
}`;

  const key = getGeminiKey();
  if (!key) {
    // No Gemini — try Claude fallback
    const anthropicKey = getAnthropicKey();
    if (!anthropicKey) throw new Error('No AI API key configured');
    const text = await completeWithClaude(prompt, '', 1400, anthropicKey);
    return parsePitchResponse(text, lead);
  }

  // Up to 2 attempts — retry if score < 7 on first attempt
  for (let attempt = 0; attempt < 2; attempt++) {
    let text;
    try {
      text = await completeWithGemini(prompt, '', 1400, key, FAST_MODEL);
    } catch (geminiErr) {
      if (isQuotaError(geminiErr)) {
        const anthropicKey = getAnthropicKey();
        if (anthropicKey) text = await completeWithClaude(prompt, '', 1400, anthropicKey);
        else throw new Error('Gemini quota exceeded and no Claude fallback key configured');
      } else {
        throw geminiErr;
      }
    }

    const parsed = parsePitchResponse(text, lead);
    if (attempt === 0 && parsed.score && parsed.score < 7) {
      console.log(`[Prahvi] Score ${parsed.score}/10 for ${lead.channel_name}, regenerating...`);
      continue;
    }
    return parsed;
  }

  // Shouldn't reach here, but satisfy linter
  throw new Error('generateFullPitch exhausted retries');
}

function parsePitchResponse(text, lead) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.email_subject || !parsed.email_body) throw new Error('Missing fields');
    return parsed;
  } catch {
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
    const bodyMatch = text.match(/---\s*([\s\S]+)/);
    return {
      key_insight: 'Channel analyzed',
      custom_offer: `Retention-optimized editing for ${lead.channel_name}`,
      email_subject: subjectMatch?.[1]?.trim() || `Quick question about ${lead.channel_name}`,
      email_body: bodyMatch?.[1]?.trim() || text.substring(0, 800),
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

${buildAgencyContext()}

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

${buildAgencyContext()}

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

  const prompt = `Write a ContentCrafterzz cold email. So specific the creator thinks "how did they know that about my channel?"

${buildAgencyContext()}

CREATOR: ${lead.channel_name} (${(lead.subscriber_count || 0).toLocaleString()} subs) | ${(lead.avg_views || 0).toLocaleString()} avg views | ${lead.engagement_rate || 0}% engagement
Upload gap: ${daysSince !== null ? `${daysSince} days since last upload` : `every ${lead.upload_frequency_days || '?'} days`}
Most recent video: "${recentVideos[0]?.title || 'N/A'}" (${(recentVideos[0]?.views || 0).toLocaleString()} views)
Pain points: ${painPoints.map(p => p.label).join(', ')}
Deep study: ${deepStudy}
Custom offer: ${offer}

Return ONLY:
SUBJECT: [subject under 8 words]
---
[email body under 150 words]`;

  return complete(prompt, 'Elite cold email copywriter. Emails get 5%+ reply rates because they are devastatingly specific.', 1000);
}

async function generateRedditDM(lead, deepStudy) {
  const prompt = `Write a Reddit DM for ContentCrafterzz.

${buildAgencyContext()}

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
AGENCY: ${buildAgencyContext()}

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
  const stepConfig = [
    { angle: 'new insight', instruction: `Point out ONE specific thing about their latest video or upload pattern they probably haven't considered. No pitch — just a genuine observation. MAX 45 WORDS.`, maxWords: 45 },
    { angle: 'social proof', instruction: `Drop ONE case study result relevant to their niche. Make it feel like you just remembered it and wanted to share. MAX 40 WORDS.`, maxWords: 40 },
    { angle: 'genuine check-in', instruction: `2 sentences. Just checking if they got the email. Zero selling. Sound human. MAX 30 WORDS.`, maxWords: 30 },
    { angle: 'last try', instruction: `Honest last attempt. Slightly vulnerable. Acknowledge you've reached out a few times. No desperation — just real. MAX 25 WORDS.`, maxWords: 25 },
    { angle: 'close the loop', instruction: `Graceful exit. Leave the door permanently open. No hard feelings, no guilt. MAX 20 WORDS.`, maxWords: 20 },
  ];

  const step = stepConfig[Math.min(followUpNumber - 1, 4)];
  const recentVideos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  const prompt = `Write follow-up #${followUpNumber} for ${lead.channel_name} (${(lead.subscriber_count || 0).toLocaleString()} subs).
Angle: ${step.angle}

Channel data: ${daysSince !== null ? `${daysSince} days since last upload` : `uploads every ${lead.upload_frequency_days || '?'} days`}
Latest video: "${recentVideos[0]?.title || 'N/A'}"
Niche: ${lead.niche || 'general'}

INSTRUCTION: ${step.instruction}

HARD RULES (non-negotiable):
1. UNDER ${step.maxWords} WORDS TOTAL in the body
2. No pricing, no plan names, no "free edit", no dollar amounts
3. No salesy language — sound like a human
4. Sign off EXACTLY as: Prathvi\\nContentCrafterzz
5. ONE CTA max — or no CTA (step ${followUpNumber >= 3 ? 'needs none' : '"reply if you want"'})

Return: SUBJECT: [subject under 6 words]\\n---\\n[body]`;

  return complete(prompt, undefined, 600);
}

async function analyzeChannelDeep(channelData) {
  const recentVideos = (() => {
    try { return Array.isArray(channelData.recent_videos) ? channelData.recent_videos : JSON.parse(channelData.recent_videos || '[]'); }
    catch { return []; }
  })();
  const daysSince = channelData.last_upload_date
    ? Math.floor((Date.now() - new Date(channelData.last_upload_date)) / 86400000) : null;

  const prompt = `You are a ContentCrafterzz channel analyst. Study this channel and identify exactly how we can help.

${buildAgencyContext()}

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

  const prompt = `Write a ContentCrafterzz cold outreach email. So specific the creator thinks "how did they know?"

${buildAgencyContext()}

CHANNEL: ${channelData.channel_name} | ${(channelData.subscriber_count || 0).toLocaleString()} subs
Avg views: ${(channelData.avg_views || 0).toLocaleString()} | Engagement: ${channelData.engagement_rate || 0}%
Upload gap: ${daysSince !== null ? `${daysSince} days since last upload` : `every ${channelData.upload_frequency_days || '?'} days`}
Most recent video: "${recentVideos[0]?.title || 'N/A'}" (${(recentVideos[0]?.views || 0).toLocaleString()} views)
Deep analysis: ${deepStudy}

Return ONLY:
SUBJECT: [subject under 8 words]
---
[email body under 150 words]`;

  return complete(prompt, 'Elite outreach copywriter. Emails get 5%+ reply rates. Devastatingly specific.', 1200);
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
AGENCY: ${buildAgencyContext()}

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
    const geminiKey = getGeminiKey();
    await complete('Say "OK" in one word.', undefined, 10);
    return { ok: true, provider: geminiKey ? `Gemini (${FAST_MODEL})` : 'Claude Haiku' };
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
  getAnthropicKey,
  makeGeminiModel,
};
