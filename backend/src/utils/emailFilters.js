// Single source of truth for "is this scraped string actually a usable
// contact email" — previously duplicated (and drifting) across
// youtubeService.js, innertubeService.js, and backgroundSeeder.js.
// backgroundSeeder.js's copy was the weakest (no image-bug guard at all),
// which is the likely source of the ~650 historical rows with an image
// filename stored as an email — see purgeCorruptEmails.js.

// ── Internal / infra domains that are never a real contact address ─────────
const INFRA_DOMAINS = [
  'youtube.com', 'google.com', 'googlemail.com', 'googleapis.com',
  'gstatic.com', 'ggpht.com', 'ytimg.com', 'sentry.io', 'example.com',
];

// Disposable/temp-mail domains — these often have valid MX records, so an MX
// check alone wouldn't catch them; a real send would just bounce or vanish.
const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'getnada.com', 'fakeinbox.com', 'sharklasers.com', 'dispostable.com',
  'maildrop.cc', 'mintemail.com', 'mailnesia.com',
];

// Link-shortener / bio-link domains. These commonly have real MX records
// (so an MX check won't catch them) but are redirect services, not mailboxes
// — "available@bit.ly" is not a contact address for anyone. Known bug: this
// exact case reached a real pitch because no gate (ingestion, intakeGate,
// send-time, MX) checked for it.
const LINK_SHORTENER_DOMAINS = [
  'bit.ly', 'linktr.ee', 'beacons.ai', 'amzn.to', 't.co', 'tinyurl.com',
  'rebrand.ly', 'cutt.ly', 'lnk.bio', 'bl.ink', 'buff.ly', 'ow.ly',
  'is.gd', 's.id', 'shorturl.at', 'rb.gy', 'v.gd', 'tiny.cc', 'snip.ly',
  'soo.gd', 'clck.ru', 'adf.ly', 'goo.gl', 'qr.ae',
];

const SKIP_EMAIL_DOMAINS = new Set([
  ...INFRA_DOMAINS, ...DISPOSABLE_EMAIL_DOMAINS, ...LINK_SHORTENER_DOMAINS,
]);

function isSkippedEmailDomain(domain) {
  return !!domain && SKIP_EMAIL_DOMAINS.has(domain.toLowerCase());
}

function isLinkShortenerDomain(domain) {
  return !!domain && LINK_SHORTENER_DOMAINS.includes(domain.toLowerCase());
}

// ── Image/asset-filename false-positive guard ───────────────────────────────
// e.g. "logo@2x.png" (a retina image filename) parses as user=logo,
// domain=2x, tld=png under a naive email regex.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'pdf', 'css', 'js', 'mp4', 'mov', 'avi', 'woff', 'woff2', 'ttf']);

// True if `domainFull` (the part after "@", e.g. "2x.png") is itself a
// retina-density marker like "2x"/"3x" — the "@" here is a CSS/HTML asset
// separator, not an email separator, regardless of what extension follows.
function isRetinaMarkerDomain(domainFull) {
  const firstLabel = (domainFull || '').split('.')[0];
  return /^\d+x$/i.test(firstLabel);
}

// True if the text immediately after the matched email is another ".ext"
// token with no separating whitespace/punctuation — the "hash.png@1f.png"
// shape (an emoji/flag sprite filename keyed by Unicode codepoint) matches
// the email regex once, but leaves a second extension dangling right after,
// which a real email address never would.
function isFollowedByAnotherExtension(remainder) {
  return /^\.[a-zA-Z]{2,6}(?![a-zA-Z0-9])/.test(remainder || '');
}

// True if this specific match is an image/asset-filename artifact rather
// than a real email — checked against the *domain* half of an
// already-locally-sane candidate match.
function isImageBugArtifact(domainFull, afterMatch) {
  const tld = (domainFull || '').split('.').pop()?.toLowerCase();
  if (tld && IMAGE_EXTENSIONS.has(tld)) return true;
  if (isRetinaMarkerDomain(domainFull)) return true;
  if (isFollowedByAnotherExtension(afterMatch)) return true;
  return false;
}

// ── Obfuscation normalization + extraction ──────────────────────────────────
function normalizeObfuscatedEmailText(text) {
  return String(text || '')
    .replace(/\[at\]/gi, '@').replace(/\(at\)/gi, '@').replace(/\{at\}/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\[dot\]/gi, '.').replace(/\(dot\)/gi, '.').replace(/\{dot\}/gi, '.')
    .replace(/\s+dot\s+/gi, '.');
}

const EMAIL_MATCH_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const LOCAL_PART_SANITY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Canonical extractor — normalizes obfuscation, rejects image/asset-filename
// artifacts, rejects link-shortener/infra/disposable domains, returns the
// first plausible real contact email or null.
function extractEmail(text) {
  if (!text) return null;
  const normalized = normalizeObfuscatedEmailText(text);
  const matches = [...normalized.matchAll(EMAIL_MATCH_RE)];

  for (const m of matches) {
    const raw = m[0];
    let e = raw;
    e = e.replace(/^[^a-zA-Z0-9]+/, '').replace(/^[A-Z]{2,}-/i, '');
    if (/^[a-z][A-Z]/.test(e)) e = e.slice(1);
    if (!LOCAL_PART_SANITY_RE.test(e)) continue;

    const domainFull = e.split('@')[1];
    const afterMatch = normalized.slice(m.index + raw.length);
    if (isImageBugArtifact(domainFull, afterMatch)) continue;
    if (isSkippedEmailDomain(domainFull)) continue;

    return e.toLowerCase();
  }
  return null;
}

// For the one-time purge script (purgeCorruptEmails.js): true if
// `storedValue` (an existing DB email column, treated as scraped text)
// contains at least one otherwise-plausible email-shaped match that is
// rejected *specifically* because of the image-extraction bug (asset-
// extension TLD, retina-density marker, or a trailing second extension) —
// as opposed to being invalid for any other, unrelated reason. This is what
// lets the purge script fix exactly the rows this bug corrupted, nothing else.
function isImageBugCorruptedEmail(storedValue) {
  if (!storedValue) return false;
  const normalized = normalizeObfuscatedEmailText(storedValue);
  const matches = [...normalized.matchAll(EMAIL_MATCH_RE)];

  for (const m of matches) {
    const raw = m[0];
    let e = raw;
    e = e.replace(/^[^a-zA-Z0-9]+/, '').replace(/^[A-Z]{2,}-/i, '');
    if (/^[a-z][A-Z]/.test(e)) e = e.slice(1);
    if (!LOCAL_PART_SANITY_RE.test(e)) continue; // not plausible even under the old rules — not this bug

    const domainFull = e.split('@')[1];
    const afterMatch = normalized.slice(m.index + raw.length);
    if (isImageBugArtifact(domainFull, afterMatch)) return true;
  }
  return false;
}

module.exports = {
  SKIP_EMAIL_DOMAINS, LINK_SHORTENER_DOMAINS, DISPOSABLE_EMAIL_DOMAINS, INFRA_DOMAINS,
  isSkippedEmailDomain, isLinkShortenerDomain,
  IMAGE_EXTENSIONS, isImageBugArtifact, isRetinaMarkerDomain, isFollowedByAnotherExtension,
  normalizeObfuscatedEmailText, extractEmail, isImageBugCorruptedEmail,
};
