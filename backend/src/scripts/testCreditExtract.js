// Unit-style test for extractCredits() (creditDiffService.js) — no DB
// required. Run: node backend/src/scripts/testCreditExtract.js
// Exits 0 if every assertion passes, 1 otherwise.

const { extractCredits } = require('../services/creditDiffService');

const cases = [
  // ── real-world-shaped positives ───────────────────────────────────────────
  { desc: 'Edited by John Smith\nCheck out my other videos!', expect: { editor: 'john smith' }, label: 'edited by X' },
  { desc: 'Editor: Jane Doe', expect: { editor: 'jane doe' }, label: 'editor: X' },
  { desc: 'Edit by @jsmitheditz', expect: { editor: 'jsmitheditz' }, label: 'edit by @handle' },
  { desc: 'Thumbnail by Alex Designs', expect: { thumbnail: 'alex designs' }, label: 'thumbnail by X' },
  { desc: 'Thumbnails: @thumbmaster', expect: { thumbnail: 'thumbmaster' }, label: 'thumbnails: @handle' },
  { desc: 'Thumbnail designed by Chris', expect: { thumbnail: null }, label: 'thumbnail designed by X (unsupported phrasing, correctly null)' },
  { desc: 'Written by Sam Writer', expect: { scriptwriter: 'sam writer' }, label: 'written by X' },
  { desc: 'Script by Priya K', expect: { scriptwriter: 'priya k' }, label: 'script by X' },
  { desc: 'Script: Morgan T', expect: { scriptwriter: 'morgan t' }, label: 'script: X' },
  { desc: 'Managed by Taylor Media Group', expect: { manager: 'taylor media group' }, label: 'managed by X' },
  { desc: 'Manager: @channelmgmt', expect: { manager: 'channelmgmt' }, label: 'manager: @handle' },
  { desc: 'Edited by: https://instagram.com/realeditorguy', expect: { editor: 'realeditorguy' }, label: 'edited by: instagram URL' },
  {
    desc: 'Edited by Dana Cuts\nThumbnail by Riley Pixels\nScript by Jamie Words',
    expect: { editor: 'dana cuts', thumbnail: 'riley pixels', scriptwriter: 'jamie words' },
    label: 'multiple credits in one description',
  },
  { desc: 'Editor: @editor_handle\nThumbnail: @thumb_handle', expect: { editor: 'editor_handle', thumbnail: 'thumb_handle' }, label: 'two @handle credits' },

  // ── SELF / DIY negatives — a genuinely distinct signal, not "no credit" ──
  { desc: 'Edited by me, as always!', expect: { editor: 'SELF' }, label: 'edited by me -> SELF' },
  { desc: 'Self edited this one, no editor yet', expect: { editor: 'SELF' }, label: 'self edited -> SELF' },
  { desc: 'Editor: myself', expect: { editor: 'SELF' }, label: 'editor: myself -> SELF' },
  { desc: 'Edited by self this week', expect: { editor: 'SELF' }, label: 'edited by self -> SELF' },

  // ── true negatives — no credit language at all ───────────────────────────
  { desc: 'Just a regular vlog, no credits section', expect: { editor: null, thumbnail: null, scriptwriter: null, manager: null }, label: 'no credit language at all' },
  { desc: '', expect: { editor: null, thumbnail: null, scriptwriter: null, manager: null }, label: 'empty description' },
];

let passed = 0, failed = 0;

console.log('═══════════════════════════════════════════════════════════');
console.log('extractCredits() — regression test');
console.log('═══════════════════════════════════════════════════════════\n');

for (const c of cases) {
  const actual = extractCredits(c.desc);
  const keys = Object.keys(c.expect);
  const ok = keys.every(k => actual[k] === c.expect[k]);
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${c.label}`);
  if (!ok) {
    console.log(`   input:    ${JSON.stringify(c.desc)}`);
    console.log(`   expected: ${JSON.stringify(c.expect)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
  if (ok) passed++; else failed++;
}

console.log('\n───────────────────────────────────────────────────────────');
console.log(`${passed}/${cases.length} passed, ${failed} failed`);
console.log('───────────────────────────────────────────────────────────\n');

process.exit(failed === 0 ? 0 : 1);
