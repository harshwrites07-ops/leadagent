// Credit diffing (Session 2.3) — detects team changes by diffing service
// credits ("Edited by X") in video descriptions across refreshes. A credit
// disappearing = vacancy (real buying signal); a credit appearing = proven
// buyer (this channel already pays for the service). This is the moat
// feature: nobody else tracks *changes* in who's credited over time.
const crypto = require('crypto');
const { getDb, USE_PG } = require('../models/database');

// Capture group deliberately excludes only newline/comma/pipe (not "." —
// URLs need it) — normalizeCredit() trims trailing sentence junk afterward.
const ROLE_PATTERNS = {
  editor: [/edit(?:ed)?\s+by\s*:?\s*([^\n,|]{2,40})/i, /editor\s*:\s*([^\n,|]{2,40})/i],
  thumbnail: [/thumbnails?\s+by\s*:?\s*([^\n,|]{2,40})/i, /thumbnails?\s*:\s*([^\n,|]{2,40})/i],
  scriptwriter: [/written\s+by\s*:?\s*([^\n,|]{2,40})/i, /script(?:writer)?\s+by\s*:?\s*([^\n,|]{2,40})/i, /script\s*:\s*([^\n,|]{2,40})/i],
  manager: [/managed\s+by\s*:?\s*([^\n,|]{2,40})/i, /manager\s*:\s*([^\n,|]{2,40})/i],
};

// Standalone "self edited"/"self-edited" phrasing that doesn't fit the
// "edited by X" shape at all (checked against the whole description).
const SELF_EDITED_PHRASE = /\bself[\s-]edited\b/i;

const SELF_WORDS = new Set(['me', 'myself', 'self', 'yours truly', 'the creator']);

// Normalizes a raw captured credit string: extracts a handle from a URL or
// bare @mention when present, otherwise trims/lowercases the plain name.
// "me"/"myself"/"self edited" style phrasing normalizes to the literal
// string 'SELF' — a real, distinct signal (a growing channel that edits its
// own videos is a strong DIY-creator lead), not treated as "no credit found".
function normalizeCredit(raw) {
  if (!raw) return null;
  let v = raw.trim();

  const urlMatch = v.match(/(?:instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com)\/@?([\w.]{2,30})/i);
  if (urlMatch) return urlMatch[1].toLowerCase();

  // Strip common trailing filler words/sentence junk a greedy capture picks up.
  v = v.replace(/\s+(video|videos|channel|team|this week|this time)$/i, '').trim();
  v = v.replace(/[.!?]+$/, '').trim();

  const lower = v.toLowerCase();
  if (SELF_WORDS.has(lower) || /^by\s+me\b/i.test(v) || /^self\b/i.test(v)) return 'SELF';

  const handleMatch = v.match(/@([\w.]{2,30})/);
  if (handleMatch) return handleMatch[1].toLowerCase();

  return v.toLowerCase().trim();
}

// Extracts service credits from a video description. Returns
// { editor, thumbnail, scriptwriter, manager } — each either a normalized
// name/handle string, 'SELF', or null (no credit found for that role).
function extractCredits(description) {
  const text = description || '';
  const result = { editor: null, thumbnail: null, scriptwriter: null, manager: null };
  if (SELF_EDITED_PHRASE.test(text)) result.editor = 'SELF';
  for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
    if (result[role]) continue; // already set by the standalone self-edited check
    for (const pattern of patterns) {
      const m = text.match(pattern);
      if (m) { result[role] = normalizeCredit(m[1]); break; }
    }
  }
  return result;
}

function hashDescription(description) {
  return crypto.createHash('sha256').update(description || '').digest('hex').slice(0, 24);
}

// Captures credits for a channel's latest ~10 videos. Only inserts a new
// snapshot row when the description actually changed since the last capture
// for that video_id — space-conscious (stores the hash + extracted credits,
// never the full description text) and naturally creates a change-log.
async function captureVideoSnapshots(channelId, videos) {
  const db = getDb();
  let captured = 0;
  for (const v of (videos || []).slice(0, 10)) {
    if (!v.id && !v.videoId) continue;
    const videoId = v.id || v.videoId;
    const description = v.description || '';
    const hash = hashDescription(description);

    const last = await db.get(
      `SELECT description_hash FROM video_description_snapshots WHERE channel_id = ? AND video_id = ? ORDER BY captured_at DESC LIMIT 1`,
      [channelId, videoId]
    );
    if (last && last.description_hash === hash) continue; // unchanged — skip

    const credits = extractCredits(description);
    await db.run(
      `INSERT INTO video_description_snapshots (channel_id, video_id, description_hash, credits_json) VALUES (?, ?, ?, ?)`,
      [channelId, videoId, hash, JSON.stringify(credits)]
    );
    captured++;
  }
  return captured;
}

// Diffs the most recent credit snapshot per video against the one before it
// for the SAME video_id (a description edit, not a different video) — that's
// too narrow for the real signal we want, which is team changes reflected
// across the channel's current set of recent videos. So diffing instead
// compares the two most recent DISTINCT capture rounds across the channel's
// last ~10 video_ids: which roles were credited in >=2 videos in the older
// round vs the newer round. The >=2-video rule is the noise guard — one
// video with a typo'd credit doesn't fire a transition.
async function diffChannelCredits(channelId) {
  const db = getDb();
  const rows = await db.all(
    `SELECT video_id, credits_json, captured_at FROM video_description_snapshots WHERE channel_id = ? ORDER BY captured_at DESC`,
    [channelId]
  );
  if (rows.length < 2) return { transitions: [] };

  // Group by video_id, keep only the latest 2 distinct captured_at rounds
  // that have enough videos to judge (>=2 videos each).
  const rounds = [...new Set(rows.map(r => r.captured_at))].sort().reverse();
  if (rounds.length < 2) return { transitions: [] };

  const newestRows = rows.filter(r => r.captured_at === rounds[0]);
  const olderRows = rows.filter(r => r.captured_at === rounds[1]);
  if (newestRows.length < 2 || olderRows.length < 2) return { transitions: [] };

  const parse = (r) => { try { return JSON.parse(r.credits_json); } catch { return {}; } };
  const newest = newestRows.map(parse);
  const older = olderRows.map(parse);

  const transitions = [];
  for (const role of Object.keys(ROLE_PATTERNS)) {
    const oldCreditedCount = older.filter(c => c[role] && c[role] !== 'SELF').length;
    const newCreditedCount = newest.filter(c => c[role] && c[role] !== 'SELF').length;
    const oldSelfCount = older.filter(c => c[role] === 'SELF').length;
    const newSelfCount = newest.filter(c => c[role] === 'SELF').length;

    if (oldCreditedCount >= 2 && newCreditedCount === 0) {
      transitions.push({ role, type: 'vacancy', confidence: 0.7 });
    } else if (oldCreditedCount === 0 && newCreditedCount >= 2) {
      transitions.push({ role, type: 'proven_buyer', confidence: 0.6 });
    } else if (oldSelfCount >= 2 && newSelfCount >= 2) {
      transitions.push({ role, type: 'diy_creator', confidence: 0.5 });
    }
  }
  return { transitions };
}

// Runs the diff and writes any transitions to platform_signals — fires at
// most once per role per rescan (INSERT OR IGNORE style dedup via a
// deterministic signal_url), and never claims more than the data shows: the
// signal_text names the exact role and transition type only.
async function diffAndRecordSignals(channelId) {
  const db = getDb();
  const { transitions } = await diffChannelCredits(channelId);
  let written = 0;
  for (const t of transitions) {
    const signalUrl = `credit-diff://${channelId}/${t.role}/${t.type}`;
    try {
      const result = await db.run(
        `INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'credit_diff', ?, ?, ?, ?)`,
        [channelId, t.type, `${t.role} credit ${t.type === 'vacancy' ? 'stopped appearing' : t.type === 'proven_buyer' ? 'started appearing' : 'stable (self-edited)'}`, signalUrl, t.confidence]
      );
      if (result.changes > 0) written++;
    } catch {}
  }
  return { written, transitions };
}

// Human-readable, fact-only strings for the Creator Intelligence Pack — e.g.
// "editing credit stopped appearing ~3 weeks ago". Never claims more than
// the stored signal shows; used so Marcus can reference it truthfully
// without inventing detail the data doesn't support.
async function getCreditDiffFacts(channelId) {
  if (!channelId) return [];
  const db = getDb();
  try {
    const signals = await db.all(
      `SELECT signal_type, signal_text, found_at FROM platform_signals WHERE creator_id = ? AND platform = 'credit_diff' ORDER BY found_at DESC LIMIT 5`,
      [channelId]
    );
    return signals.map(s => {
      const days = Math.floor((Date.now() - new Date(s.found_at).getTime()) / 86400000);
      const weeks = Math.round(days / 7);
      const when = days < 14 ? `~${days} day${days === 1 ? '' : 's'} ago` : `~${weeks} week${weeks === 1 ? '' : 's'} ago`;
      return `${s.signal_text} (detected ${when})`;
    });
  } catch {
    return [];
  }
}

module.exports = { extractCredits, normalizeCredit, captureVideoSnapshots, diffChannelCredits, diffAndRecordSignals, hashDescription, getCreditDiffFacts };
