// Unit-style test for extractEmail() in innertubeService.js — no DB required.
// Run: node backend/src/scripts/testEmailExtract.js
// Exits 0 if every assertion passes, 1 otherwise.

const { extractEmail } = require('../services/innertubeService');

const cases = [
  // ── valid emails must still pass ──────────────────────────────────────────
  { input: 'name@gmail.com', expect: 'name@gmail.com', label: 'plain gmail address' },
  { input: 'biz.inquiries@proton.me', expect: 'biz.inquiries@proton.me', label: 'dotted local part, .me TLD' },
  {
    input: 'For business inquiries, contact me at hello@creatoragency.com or DM on Instagram.',
    expect: 'hello@creatoragency.com',
    label: 'email embedded in surrounding text',
  },
  { input: 'Business email: business@channel.com', expect: 'business@channel.com', label: 'sanity check for the base extractor (control case)' },
  { input: 'contact me: jane[at]studio[dot]co', expect: 'jane@studio.co', label: 'obfuscated [at]/[dot] bracket format still resolves' },
  { input: 'contact me: jane at studio dot co', expect: 'jane@studio.co', label: 'obfuscated bare-word "at"/"dot" format still resolves' },

  // ── corrupt patterns from TODO.md must all fail (return null) ─────────────
  { input: 'flags@2x.png', expect: null, label: 'retina asset filename (flags@2x.png)' },
  { input: 'downloads_logomark_color_on_white@2x.png', expect: null, label: 'retina asset filename, long local part' },
  { input: 'esalwdsesw41lx13.png@1f.png', expect: null, label: 'emoji/flag sprite filename (hash.png@1f.png shape)' },
  { input: 'c940bebcaaa0c7852895b8ac7e8bf7fa.png@1f.png', expect: null, label: 'production example — Cara Nicole lead id 73' },
  { input: 'icon@3x.jpg', expect: null, label: 'retina marker with .jpg extension' },
  { input: 'sprite@1x.gif', expect: null, label: 'retina marker with .gif extension' },
  { input: 'logo@2x.svg', expect: null, label: '.svg image extension' },
  { input: 'button@2x.webp', expect: null, label: '.webp image extension' },
  { input: 'favicon@2x.ico', expect: null, label: '.ico image extension' },
  { input: 'style@2x.css', expect: null, label: '.css asset extension' },
  { input: 'bundle@2x.js', expect: null, label: '.js asset extension' },
  {
    input: 'Background: url(assets/hero@2x.png) no-repeat; see also thumb.png@1f.png in the sprite sheet.',
    expect: null,
    label: 'corrupt patterns embedded in surrounding CSS/HTML text',
  },
];

let passed = 0, failed = 0;

console.log('═══════════════════════════════════════════════════════════');
console.log('extractEmail() — regression test');
console.log('═══════════════════════════════════════════════════════════\n');

for (const c of cases) {
  const actual = extractEmail(c.input);
  const ok = actual === c.expect;
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${c.label}`);
  console.log(`   input:    ${JSON.stringify(c.input)}`);
  console.log(`   expected: ${JSON.stringify(c.expect)}`);
  console.log(`   actual:   ${JSON.stringify(actual)}`);
  if (ok) passed++; else failed++;
}

console.log('\n───────────────────────────────────────────────────────────');
console.log(`${passed}/${cases.length} passed, ${failed} failed`);
console.log('───────────────────────────────────────────────────────────\n');

process.exit(failed === 0 ? 0 : 1);
