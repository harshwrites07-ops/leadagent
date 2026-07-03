// Unit tests for codeGate.js — Marcus V2, Part 4.
// Run: node backend/src/scripts/testCodeGate.js
// No test framework — plain assert, one passing + one failing example per check.

const assert = require('assert');
const { runCodeGate, personalizationCheck, describeViolation, wordCount } = require('../services/codeGate');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); fail++; }
}

const PACK = {
  subscribers: 169000,
  hook_data: {
    most_recent_video_title: 'Beloved Musicians Who Were Horrible People',
    most_recent_video_views: 889000,
    best_video_title: 'Beloved Musicians Who Were Horrible People',
    best_video_views: 889000,
    recent_avg_views: 100000,
    channel_avg_views: 250000,
  },
  last_upload_days_ago: 58,
};

console.log('\n═══ codeGate unit tests ═══\n');

console.log('banned phrases:');
t('flags "I hope this email finds you well"', () => {
  const r = runCodeGate({ subject: 'quick chat', body: 'I hope this email finds you well, wanted to connect.' }, PACK);
  assert(r.violations.some(v => v.type === 'banned_phrase'));
});
t('passes clean phrasing', () => {
  const r = runCodeGate({ subject: 'the 58 day gap', body: '"Beloved Musicians" hit 889K. Your last three averaged 100K. That gap tells a story. Worth a conversation?' }, PACK);
  assert(!r.violations.some(v => v.type === 'banned_phrase'));
});

console.log('\nstructure checks:');
t('flags body starting with "I"', () => {
  const r = runCodeGate({ subject: 'x', body: 'I noticed your channel has been quiet lately and wanted to check in about editing.' }, PACK);
  assert(r.violations.some(v => v.type === 'startsWithI'));
});
t('passes body not starting with "I"', () => {
  const r = runCodeGate({ subject: 'x', body: 'Your last video pulled 92K. Channel usually does 290K. Worth a look?' }, PACK);
  assert(!r.violations.some(v => v.type === 'startsWithI'));
});
t('flags subject over 5 words', () => {
  const r = runCodeGate({ subject: 'a very long subject line about your channel', body: 'x' }, PACK);
  assert(r.violations.some(v => v.type === 'subjectTooLong'));
});
t('passes subject under 5 words', () => {
  const r = runCodeGate({ subject: 'your yt jobs post', body: 'x' }, PACK);
  assert(!r.violations.some(v => v.type === 'subjectTooLong'));
});
t('flags exclamation marks', () => {
  const r = runCodeGate({ subject: 'x', body: 'This is great! Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'hasExclamation'));
});
t('passes no exclamation marks', () => {
  const r = runCodeGate({ subject: 'x', body: 'This is solid. Worth a look?' }, PACK);
  assert(!r.violations.some(v => v.type === 'hasExclamation'));
});
t('flags more than 3 question marks total', () => {
  const r = runCodeGate({ subject: 'x', body: 'Is this a good time? Are you free? Worth a look? Sound fair?' }, PACK);
  assert(r.violations.some(v => v.type === 'tooManyQuestions'));
});
t('passes 1-3 question marks (spec allows up to 3 total)', () => {
  const r = runCodeGate({ subject: 'x', body: "Editing's the bottleneck, right? Worth a conversation?" }, PACK);
  assert(!r.violations.some(v => v.type === 'tooManyQuestions'));
});
t('flags no question CTA', () => {
  const r = runCodeGate({ subject: 'x', body: 'Let me know what you think.' }, PACK);
  assert(r.violations.some(v => v.type === 'noQuestionCTA'));
});
t('flags pricing mentions', () => {
  const r = runCodeGate({ subject: 'x', body: 'My rate is $500 per video. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'mentionsPricing'));
});
t('passes no pricing', () => {
  const r = runCodeGate({ subject: 'x', body: 'Happy to share samples. Worth a look?' }, PACK);
  assert(!r.violations.some(v => v.type === 'mentionsPricing'));
});

console.log('\nsentence-pattern tells:');
t('flags concessive contrast', () => {
  const r = runCodeGate({ subject: 'x', body: 'The content is great, but the packaging is holding you back. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'concessiveContrast'));
});
t('flags negated-mild-negative concessive contrast ("\'s not bad, but")', () => {
  const r = runCodeGate({ subject: 'x', body: "2M subs, 231K average. That's not bad, but it's also not moving. Worth a look?" }, PACK);
  assert(r.violations.some(v => v.type === 'concessiveContrast'));
});
t('flags negated-mild-negative concessive contrast ("isn\'t terrible, but")', () => {
  const r = runCodeGate({ subject: 'x', body: "The pacing isn't terrible, but it drags in the middle. Worth a look?" }, PACK);
  assert(r.violations.some(v => v.type === 'concessiveContrast'));
});
t('flags general negated-clause-dash-but shape ("not X — but")', () => {
  const r = runCodeGate({ subject: 'x', body: "That's not bad — but it's also not moving. Worth a look?" }, PACK);
  assert(r.violations.some(v => v.type === 'concessiveContrast'));
});
t('passes a sentence with "not" and "but" that is not concessive contrast', () => {
  const r = runCodeGate({ subject: 'x', body: "Same editor every video. No handoffs. Worth a look, or should I just send samples but skip the call?" }, PACK);
  assert(!r.violations.some(v => v.type === 'concessiveContrast'));
});
t('flags binary reframe', () => {
  const r = runCodeGate({ subject: 'x', body: "It's not a content problem. It's an editing problem. Worth a look?" }, PACK);
  assert(r.violations.some(v => v.type === 'binaryReframe'));
});
t('flags setup-then-reveal', () => {
  const r = runCodeGate({ subject: 'x', body: "That gap usually means one thing: burnout. Worth a look?" }, PACK);
  assert(r.violations.some(v => v.type === 'setupReveal'));
});
t('flags stacked em-dashes', () => {
  const r = runCodeGate({ subject: 'x', body: 'The pacing — the cuts — the whole thing feels off. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'emDashStack'));
});
t('flags a two-dash parenthetical as stacked (same shape, 3 segments)', () => {
  const r = runCodeGate({ subject: 'x', body: 'Your channel — genuinely — has something real here. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'emDashStack'));
});
t('passes a single em-dash (one clause, not stacked)', () => {
  const r = runCodeGate({ subject: 'x', body: 'Same editor every video — no handoffs. Worth a look?' }, PACK);
  assert(!r.violations.some(v => v.type === 'emDashStack'));
});
t('flags rule of three', () => {
  const r = runCodeGate({ subject: 'x', body: 'I handle editing, thumbnails, and scripting. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'ruleOfThree'));
});
t('flags uniform sentence rhythm (3+ consecutive 15-25 word sentences)', () => {
  const body = 'Your channel has been putting out consistent content for several months without much of a shift in direction. The upload schedule looks steady and the overall format has not changed all that much either. The engagement numbers appear to be holding at roughly the same level on every single upload. Worth a look?';
  const r = runCodeGate({ subject: 'x', body }, PACK);
  assert(r.violations.some(v => v.type === 'uniformRhythm'));
});
t('passes deliberately varied sentence lengths', () => {
  const body = 'Same editor every video. No handoffs. That consistency is rare at your subscriber count and it usually means the whole thing is running through one person who is quietly maxed out. Worth a look?';
  const r = runCodeGate({ subject: 'x', body }, PACK);
  assert(!r.violations.some(v => v.type === 'uniformRhythm'));
});

console.log('\npersonalization proof:');
t('passes when body references real video title', () => {
  const body = 'Musicians Who Were Horrible People hit big. Worth a conversation?';
  assert(personalizationCheck(body, PACK) === true);
});
t('passes when body references a real stat', () => {
  const body = 'Your last three averaged 100K views. Worth a conversation?';
  assert(personalizationCheck(body, PACK) === true);
});
t('fails on ratio math alone with no real title/stat', () => {
  const body = 'Your subscriber to view ratio looks a little low for the niche. Worth a conversation?';
  assert(personalizationCheck(body, PACK) === false);
});

console.log('\nintegration:');
t('a genuinely clean email has zero HARD violations (ban-list/word-count/personalization)', () => {
  // Softer checks (reading grade, uniform rhythm) are heuristic estimates and
  // are allowed to fire without failing the gate — only hard violations do.
  const email = {
    subject: '58 days — noticed something',
    body: '"Beloved Musicians Who Were Horrible People" hit 889K. Your last three averaged 100K — that\'s a real gap. The 58-day silence since your last upload tells the rest of it, and channels posting every 5 days don\'t usually go dark for two months unless editing\'s eaten the whole week. I handle post-production for music essay channels. Took one from every 3 weeks to weekly. Worth a conversation?\nP.S. the deadpan bit in that video killed me.',
  };
  const r = runCodeGate(email, PACK);
  assert.strictEqual(r.hardViolations.length, 0, `expected 0 hard violations, got: ${JSON.stringify(r.hardViolations)}`);
  assert.strictEqual(r.passed, true);
});
t('flags a raw 4+ digit number', () => {
  const r = runCodeGate({ subject: 'x', body: 'Your last video hit 623908 views. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'rawNumberDump' && v.severity === 'hard'));
});
t('passes a formatted number (not a raw digit dump)', () => {
  const r = runCodeGate({ subject: 'x', body: 'Your last video hit 624K views. Worth a look?' }, PACK);
  assert(!r.violations.some(v => v.type === 'rawNumberDump'));
});
t('flags an -ing sentence opener', () => {
  const r = runCodeGate({ subject: 'x', body: 'Watching your last few uploads, the pacing stood out. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'ingSentenceOpener'));
});
t('flags more than one em-dash in the whole email', () => {
  const r = runCodeGate({ subject: 'x', body: 'The intro — the pacing — both felt off this time. Worth a look?' }, PACK);
  assert(r.violations.some(v => v.type === 'tooManyEmDashes' && v.severity === 'hard'));
});
t('flags a missing P.S. as a soft violation', () => {
  const r = runCodeGate({ subject: 'x', body: 'Your last video hit 624K views. Worth a look?' }, PACK);
  const v = r.violations.find(x => x.type === 'psAbsent');
  assert(v && v.severity === 'soft');
});
t('describeViolation returns a human string for every check type', () => {
  const email = { subject: 'x', body: 'I hope this email finds you well. Worth a look?' };
  const r = runCodeGate(email, PACK);
  for (const v of r.violations) {
    const desc = describeViolation(v);
    assert(typeof desc === 'string' && desc.length > 0);
  }
});

console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
process.exit(fail > 0 ? 1 : 0);
