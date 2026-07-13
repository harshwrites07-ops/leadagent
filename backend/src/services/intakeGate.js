// Marcus V4 Session 3 — Stage 1 Intake Gate.
// Runs BEFORE any LLM call. Rejects a lead with a specific, visible reason
// instead of letting garbage data (e.g. an image filename in the email
// field) reach generation. Mirrors qualityGate.js's "always return a
// complete verdict" discipline — every check runs independently and reports
// pass/fail, never throws past this function.

const IMAGE_FILE_EXTENSIONS = /\.(png|jpe?g|svg|webp|gif|bmp|ico)$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_PROVIDERS = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com']);

const FACTS_MAX_AGE_DAYS = 30;
const CONTACT_COOLDOWN_DAYS = 90;

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60 * 24);
}

// email_valid — catches the flags@2x.png class of bug: a syntactically
// plausible string that's actually an image filename left in the email
// field by an upstream scrape/enrichment bug (PowerMode).
function checkEmailValid(lead) {
  const email = (lead.email || '').trim();
  if (!email) return { pass: false, detail: 'Lead has no email on file' };
  if (IMAGE_FILE_EXTENSIONS.test(email)) {
    return { pass: false, detail: 'Lead has no valid email — check PowerMode enrichment' };
  }
  if (!EMAIL_RE.test(email)) {
    return { pass: false, detail: 'Lead has no valid email — check PowerMode enrichment' };
  }
  return { pass: true, detail: `Email format valid (${email.split('@')[1] || ''})` };
}

// has_channel_facts — needs >=2 of: latest video title, view count,
// subscriber count, upload cadence.
function checkHasChannelFacts(lead) {
  let recentVideoTitle = lead.recent_video_title || null;
  if (!recentVideoTitle) {
    try {
      const videos = JSON.parse(lead.recent_videos || '[]');
      recentVideoTitle = videos[0]?.title || null;
    } catch {}
  }
  const facts = [
    !!recentVideoTitle,
    !!(lead.avg_views || lead.recent_avg_views),
    !!lead.subscriber_count,
    lead.upload_frequency_days != null,
  ];
  const count = facts.filter(Boolean).length;
  return {
    pass: count >= 2,
    detail: count >= 2
      ? `${count}/4 channel facts on file`
      : 'Insufficient channel data to personalize — regenerate lead enrichment',
  };
}

// facts_fresh — leads.updated_at is the closest proxy this schema has to
// "channel data last scraped"; there's no separate scrape-timestamp column.
function checkFactsFresh(lead) {
  const age = daysSince(lead.updated_at);
  if (age == null) return { pass: true, detail: 'No update timestamp on file — treated as fresh' };
  const ok = age < FACTS_MAX_AGE_DAYS;
  return {
    pass: ok,
    detail: ok
      ? `Lead data ${Math.round(age)}d old (<${FACTS_MAX_AGE_DAYS}d)`
      : `Lead data stale (${Math.round(age)}d old) — refresh before pitching`,
  };
}

// not_already_contacted — real date comparison against last_contacted_date,
// replacing the old stage-based check (crm_stage !== 'emailed') which
// couldn't tell a 2-day-old contact from a 2-year-old one.
function checkNotAlreadyContacted(lead) {
  const age = daysSince(lead.last_contacted_date);
  if (age == null) return { pass: true, detail: 'No prior contact on file' };
  const ok = age >= CONTACT_COOLDOWN_DAYS;
  return {
    pass: ok,
    detail: ok
      ? `Last contacted ${Math.round(age)}d ago (>=${CONTACT_COOLDOWN_DAYS}d)`
      : `Already contacted ${lead.last_contacted_date} — skipping`,
  };
}

const CHECKS = [
  { name: 'email_valid', run: checkEmailValid },
  { name: 'has_channel_facts', run: checkHasChannelFacts },
  { name: 'facts_fresh', run: checkFactsFresh },
  { name: 'not_already_contacted', run: checkNotAlreadyContacted },
];

// Returns { passed, checks: [{name, pass, detail}], blockedReason }.
// blockedReason is the first failing check's detail — the one message the
// UI/caller surfaces, per the spec's "visible, specific error" requirement.
function runIntakeGate(lead) {
  const checks = CHECKS.map(({ name, run }) => {
    try {
      const { pass, detail } = run(lead);
      return { name, pass, detail };
    } catch (err) {
      return { name, pass: false, detail: `check errored: ${err.message}` };
    }
  });
  const failed = checks.find(c => !c.pass);
  return { passed: !failed, checks, blockedReason: failed ? failed.detail : null };
}

module.exports = { runIntakeGate };
