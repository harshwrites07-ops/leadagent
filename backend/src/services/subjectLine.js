// Section F — Subject Line Engine
// Generates 3 subject line options using 5 patterns after the main email body is created.

const { completeSmart } = require('./claudeService');

function buildSubjectLinePrompt(emailBody, intelligencePack, selectedAngle) {
  const hook = intelligencePack.hook_data || {};
  const recentTitle = hook.most_recent_video_title;
  const subs = intelligencePack.subscribers;
  const niche = intelligencePack.niche || 'general';
  const channelName = intelligencePack.channel_name;

  return `You are Quelro's subject line specialist.
Your subject lines have one job: get opened by a YouTube creator who gets multiple cold emails every week.

THE EMAIL BODY:
${emailBody}

THE CREATOR:
Channel: ${channelName}
Recent video: ${recentTitle || 'N/A'}
Subscribers: ${subs?.toLocaleString() || 'Unknown'}
Niche: ${niche}
Angle used: ${selectedAngle || 'honest_observation'}

Generate 3 subject line options using different patterns below.

RULES (non-negotiable):
- 1-5 words MAXIMUM. Hard limit.
- All lowercase (like an internal message, not marketing)
- No salesy words: "free", "offer", "deal", "quick", "important", "urgent"
- No exclamation marks
- No emojis
- Must feel like it came from a specific person, not a mass-mail tool

THE 5 PATTERNS (use one per option):

PATTERN 1 — SPECIFIC OBSERVATION: Reference something specific about their channel
Examples: "your retention vs your uploads" / "29k subs and 100k views" / "the m4 video — noticed something"

PATTERN 2 — DIRECT SERVICE + CONTEXT: Clean, honest, specific
Examples: "editing for your format" / "thumbnail work for finance" / "short-form for your niche"

PATTERN 3 — HONEST TEASER: Conversational, reads like a message from someone they know
Examples: "something about your thumbnails" / "noticed something in your uploads" / "your view pattern"

PATTERN 4 — CONTRAST: Creates tension by juxtaposing two things
Examples: "your content vs your uploads" / "your best video vs recent ones"

PATTERN 5 — FORWARD SIGNAL: Implies an opportunity or window
Examples: "shorts opportunity in your niche" / "your channel + one thing"

Pick the best pattern for each option. Make each option different in style from the others.

Return ONLY this JSON:
{
  "options": [
    {
      "subject": "<option 1, lowercase, max 5 words>",
      "pattern": "<pattern name>",
      "psychology": "<what trigger this uses>",
      "recommended": <true|false>
    },
    {
      "subject": "<option 2>",
      "pattern": "<pattern name>",
      "psychology": "<what trigger this uses>",
      "recommended": <true|false>
    },
    {
      "subject": "<option 3>",
      "pattern": "<pattern name>",
      "psychology": "<what trigger this uses>",
      "recommended": <true|false>
    }
  ],
  "auto_selected": "<the subject line Marcus recommends — same as the recommended:true option>"
}`;
}

async function generateSubjectLines(emailBody, intelligencePack, selectedAngle) {
  try {
    const prompt = buildSubjectLinePrompt(emailBody, intelligencePack, selectedAngle);
    const raw    = await completeSmart(prompt, '', 600);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);

    return {
      options:      parsed.options || [],
      auto_selected: parsed.auto_selected || (parsed.options?.[0]?.subject || ''),
    };
  } catch (err) {
    console.error('[SubjectLine] Generation failed:', err.message);
    // Return sensible fallback subjects
    const hook = intelligencePack.hook_data || {};
    const name = intelligencePack.channel_name || 'your channel';
    return {
      options: [
        { subject: `your last few uploads`, pattern: 'HONEST_TEASER', recommended: true },
        { subject: `${intelligencePack.niche || 'your'} channel + one thing`, pattern: 'FORWARD_SIGNAL', recommended: false },
        { subject: `something about your views`, pattern: 'HONEST_TEASER', recommended: false },
      ],
      auto_selected: `your last few uploads`,
    };
  }
}

module.exports = { generateSubjectLines };
