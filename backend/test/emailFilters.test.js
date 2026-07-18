// Unit tests for the consolidated email extraction/filtering module
// (backend/src/utils/emailFilters.js) — single source of truth previously
// duplicated across youtubeService.js, innertubeService.js, and
// backgroundSeeder.js. Run with: node --test test/emailFilters.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractEmail, isSkippedEmailDomain, isLinkShortenerDomain,
  isImageBugCorruptedEmail, LINK_SHORTENER_DOMAINS,
} = require('../src/utils/emailFilters');

// ── Link-shortener rejection (the "available@bit.ly reached a real pitch" bug) ─

test('a bit.ly "email" is rejected, not extracted', () => {
  assert.equal(extractEmail('Contact us at available@bit.ly for bookings.'), null);
});

test('every domain in LINK_SHORTENER_DOMAINS is rejected as an email domain', () => {
  for (const domain of LINK_SHORTENER_DOMAINS) {
    const result = extractEmail(`reach out: hello@${domain}`);
    assert.equal(result, null, `expected hello@${domain} to be rejected`);
  }
});

test('isSkippedEmailDomain / isLinkShortenerDomain flag bit.ly directly', () => {
  assert.equal(isSkippedEmailDomain('bit.ly'), true);
  assert.equal(isLinkShortenerDomain('bit.ly'), true);
  assert.equal(isLinkShortenerDomain('linktr.ee'), true);
  assert.equal(isLinkShortenerDomain('gmail.com'), false);
});

// ── Real emails must still pass ─────────────────────────────────────────────

test('a real gmail address passes', () => {
  assert.equal(extractEmail('DM or email real@gmail.com for collabs'), 'real@gmail.com');
});

test('a real company domain address passes', () => {
  assert.equal(extractEmail('Business inquiries: contact@realcompany.com'), 'contact@realcompany.com');
});

// ── Image-bug-artifact guard still works after consolidation ───────────────

test('a retina asset filename is still rejected', () => {
  assert.equal(extractEmail('flags@2x.png'), null);
});

test('isImageBugCorruptedEmail still flags emoji-sprite-filename artifacts', () => {
  assert.equal(isImageBugCorruptedEmail('esalwdsesw41lx13.png@1f.png'), true);
});

// ── Internal/disposable domains still rejected ──────────────────────────────

test('internal youtube/google infra domains are rejected', () => {
  assert.equal(extractEmail('noreply@youtube.com'), null);
  assert.equal(extractEmail('x@googleapis.com'), null);
});

test('disposable mail domains are rejected', () => {
  assert.equal(extractEmail('temp@mailinator.com'), null);
});

// ── Obfuscation handling still works ────────────────────────────────────────

test('obfuscated [at]/[dot] format still resolves to a real address', () => {
  assert.equal(extractEmail('contact me: jane[at]studio[dot]co'), 'jane@studio.co');
});
