// Psychology Analysis + 3-Angle Email Generation using Claude

const { completeSmart, complete, extractJsonObject } = require('./claudeService');

// ── Step 1: Analyze creator psychology from channel data ──────────────────────
async function analyzePsychology(lead) {
  const videos = (() => { try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; } })();
  const titles  = videos.slice(0, 10).map(v => v.title).filter(Boolean).join('\n');
  const subs    = (lead.subscriber_count || 0).toLocaleString();

  const prompt = `You are a psychology analyst. Analyze this YouTube creator from their channel data and identify their communication style and personality.

CREATOR: ${lead.channel_name}
SUBSCRIBERS: ${subs}
NICHE: ${lead.niche || 'general content'}
BIO: ${(lead.channel_description || '').slice(0, 600) || 'No bio available'}
RECENT VIDEO TITLES:
${titles || 'No titles available'}

Return ONLY valid JSON (no markdown, no backticks, no explanation):
{
  "personality_traits": ["list of 2-4 traits from: analytical, educational, storytelling, direct, casual, energetic, motivational, warm, precise, ambitious"],
  "communication_style": {
    "formality": "casual OR professional OR mixed",
    "humor": true OR false,
    "vulnerability": true OR false,
    "storytelling_focused": true OR false
  },
  "values": ["2-3 values like: authenticity, growth, community, results, education, entertainment"],
  "audience_type": "entrepreneurs OR students OR professionals OR creators OR consumers",
  "pain_points": ["2-3 specific pain points based on their niche and content"],
  "voice_tone": "one sentence describing how they sound — e.g. 'direct and data-driven, uses numbers to prove points'",
  "profile_label": "one of: FINANCE CREATOR | FITNESS CREATOR | BUSINESS CREATOR | EDUCATOR | ENTERTAINER | CREATOR IN GROWTH | CREATOR IN PAIN | SMALL/GROWING | PROFESSIONAL/MEDIA"
}`;

  try {
    const raw = await completeSmart(prompt, 'Expert psychology analyst. You identify creator personality from content patterns with high accuracy.', 700);
    // Balanced-brace extraction, not a lazy /\{[\s\S]*?\}/ regex — this
    // schema has a nested communication_style object, so a lazy match would
    // stop at ITS closing brace and truncate before pain_points/voice_tone.
    const jsonStr = extractJsonObject(raw);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.personality_traits && parsed.pain_points) return parsed;
    }
  } catch {}

  // Fallback — infer basic profile from niche
  const niche = (lead.niche || '').toLowerCase();
  let profile_label = 'SMALL/GROWING';
  const pain_points = ['video quality', 'upload consistency', 'audience growth'];

  if (niche.match(/finance|invest|crypto|money|wealth/))  { profile_label = 'FINANCE CREATOR'; pain_points[0] = 'thumbnail click-through rate'; }
  if (niche.match(/fitness|gym|health|wellness|workout/)) { profile_label = 'FITNESS CREATOR';  pain_points[0] = 'video retention'; }
  if (niche.match(/business|entrepreneur|startup|saas/))  { profile_label = 'BUSINESS CREATOR'; pain_points[0] = 'production quality'; }
  if ((lead.subscriber_count || 0) >= 1000000)            { profile_label = 'PROFESSIONAL/MEDIA'; }

  return {
    personality_traits: ['professional', 'educational'],
    communication_style: { formality: 'mixed', humor: false, vulnerability: false, storytelling_focused: false },
    values: ['growth', 'quality'],
    audience_type: 'creators',
    pain_points,
    voice_tone: 'professional and informative',
    profile_label,
  };
}

// ── Step 2: Generate 3 email angles from psychology profile ───────────────────
async function generateEmailAngles(lead, psychProfile, userService, userCredentials = '') {
  const subs       = (lead.subscriber_count || 0).toLocaleString();
  const avgViews   = (lead.avg_views || 0).toLocaleString();
  const painPoints = (psychProfile.pain_points || []).join(', ');
  const traits     = (psychProfile.personality_traits || []).join(', ');
  const tone       = psychProfile.voice_tone || 'professional';
  const label      = psychProfile.profile_label || 'CREATOR';

  const toneInstruction = psychProfile.communication_style?.formality === 'casual'
    ? 'Write casually — contractions, direct, peer-to-peer energy'
    : psychProfile.communication_style?.formality === 'professional'
    ? 'Write professionally — precise, no contractions, data-focused'
    : 'Write in a natural, confident tone — not stiff, not overly casual';

  const prompt = `Generate 3 distinct cold email angles for reaching ${lead.channel_name}. Each must be specific to THIS creator, not generic.

CREATOR:
- Name: ${lead.channel_name}
- Subs: ${subs} | Avg views: ${avgViews}
- Niche: ${lead.niche || 'general'}
- Personality: ${traits} (${label})
- Pain points: ${painPoints}
- Voice: ${tone}

SERVICE: ${userService}
PROOF: ${userCredentials || 'Helped multiple creators grow views and save time'}

${toneInstruction}

RULES FOR ALL 3 ANGLES:
• Under 90 words in the body — count every word
• NEVER start body with "I"
• NEVER use: "I came across", "I noticed", "love your content", "hope this finds you", "collaboration", "partnership", "exciting opportunity", "amazing", "incredible"
• First sentence must reference a SPECIFIC metric (subs, views, days since upload, video gap)
• End with ONE soft question, not a directive
• Sign: Prahvi (first name only)

Return ONLY valid JSON:
{
  "angles": [
    {
      "angle_name": "Problem Angle",
      "description": "Opens with their specific pain — diagnoses before prescribing",
      "subject": "3-6 word subject line — reference their specific data",
      "full_email": "complete email body ending with \\n\\nPrahvi"
    },
    {
      "angle_name": "Story Angle",
      "description": "Opens with result from similar creator — social proof first",
      "subject": "3-6 word subject line",
      "full_email": "complete email body ending with \\n\\nPrahvi"
    },
    {
      "angle_name": "Growth Angle",
      "description": "Recognizes their momentum — positions service as the next lever",
      "subject": "3-6 word subject line",
      "full_email": "complete email body ending with \\n\\nPrahvi"
    }
  ]
}`;

  try {
    const raw = await completeSmart(prompt, 'Elite cold email copywriter. 5%+ reply rates. Every email is devastatingly specific, never template-like.', 1800);
    const jsonStr = extractJsonObject(raw);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.angles?.length === 3) return parsed.angles;
    }
  } catch {}

  // Fallback angles
  const opener = `${subs} subscribers, ${avgViews} avg views`;
  return [
    {
      angle_name: 'Problem Angle',
      description: 'Leads with their specific view/upload pattern gap',
      subject: `your ${lead.niche || 'channel'} view gap`,
      full_email: `${opener} — there's a retention gap worth looking at.\n\nHelped a ${lead.niche || 'similar'} creator fix exactly this. Views up 40% in 8 weeks after one editing change.\n\nWant to know what I'd fix first?\n\nPrahvi`,
    },
    {
      angle_name: 'Story Angle',
      description: 'Leads with a creator result, then connects to their situation',
      subject: `what worked for a ${lead.niche || 'creator'} like you`,
      full_email: `A ${lead.niche || 'creator'} with ${subs} subscribers was stuck at the same view count for 3 months.\n\nOne editing change later: views up 35%, upload frequency doubled.\n\nSame situation as yours — would a quick breakdown of what changed be useful?\n\nPrahvi`,
    },
    {
      angle_name: 'Growth Angle',
      description: 'Recognizes what they built, points to the next step',
      subject: `${subs} subs — what's next`,
      full_email: `${subs} subscribers is a real milestone. Most creators at this stage who want to hit the next level do one thing: get editing off their plate.\n\nThat's when upload frequency and view counts both jump.\n\nIs that a bottleneck for you right now?\n\nPrahvi`,
    },
  ];
}

// ── Step 3: Quality score for a generated email ───────────────────────────────
function scoreEmail(subject, body) {
  const bl = body.toLowerCase();
  const wc = body.split(/\s+/).filter(Boolean).length;
  let score = 0;

  const BANNED = ['i came across', 'i noticed', 'love your content', 'hope this finds', 'i wanted to reach', 'collaboration', 'amazing content', 'incredible work', 'exciting', 'touching base'];

  // Word count (30 pts)
  if (wc >= 50 && wc <= 100) score += 30;
  else if (wc >= 30 && wc <= 120) score += 15;
  else score -= 10;

  // No banned phrases (20 pts)
  if (!BANNED.some(p => bl.includes(p))) score += 20;

  // Specific data in first line (25 pts)
  const firstLine = body.split('\n')[0] || '';
  if (/\d{3,}/.test(firstLine)) score += 15; // has numbers
  if (!/^(hi |hey |hello |i )/i.test(firstLine)) score += 10; // doesn't start with greeting

  // Ends with question (15 pts)
  if ((body.match(/\?/g) || []).length >= 1) score += 10;
  if ((body.match(/\?/g) || []).length === 1) score += 5; // exactly one

  // Subject quality (10 pts)
  const subjectWords = subject.trim().split(/\s+/).length;
  if (subjectWords >= 3 && subjectWords <= 6) score += 10;

  return Math.min(100, Math.max(0, score));
}

module.exports = { analyzePsychology, generateEmailAngles, scoreEmail };
