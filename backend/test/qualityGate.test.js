// Unit tests for the Marcus V4 deterministic Quality Gate (backend/src/qualityGate.js).
// Run with: node --test test/qualityGate.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateEmailQualityV2, CHECKS, runChecks } = require('../src/qualityGate');

// A 100/100 gold sample — used as the base case, then mutated per-check to
// knock out exactly one check at a time.
const GOOD_SUBJECT = 'quick one for you';
const GOOD_BODY = `Hey Sam,

Your Navy Seal Training video hit hard. Respect for grinding through thirty days straight without a single day off.

I edit fitness channels for a living. I could tighten your hook so more people stick around. Want me to send a rough cut of your next intro so you can see the difference?

Sam

P.S. that pull-up set in week two was wild, my arms hurt just watching it.`;
const GOOD_PACK = { subscribers: 84000, hook_data: { most_recent_video_title: 'Navy Seal Training Day One' } };

function checkFor(result, name) {
  const c = result.checks.find(c => c.name === name);
  assert.ok(c, `check "${name}" missing from array`);
  return c;
}

test('gold sample scores 100/100 and passes', async () => {
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, GOOD_BODY, GOOD_PACK);
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
  assert.equal(result.checksComplete, true);
  assert.equal(result.checks.length, 7);
});

test('checks array always has exactly 7 entries with the required shape', async () => {
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, GOOD_BODY, GOOD_PACK);
  assert.equal(result.checks.length, CHECKS.length);
  for (const c of result.checks) {
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.points_awarded, 'number');
    assert.equal(typeof c.points_possible, 'number');
    assert.equal(typeof c.detail, 'string');
    assert.ok(c.points_awarded <= c.points_possible);
  }
});

test('personalization_proof: fails with no real fact from lead data in body', async () => {
  const body = GOOD_BODY.replace('Navy Seal Training video hit hard', 'video hit hard');
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, body, GOOD_PACK);
  const c = checkFor(result, 'personalization_proof');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /no real video title or stat/i);
});

test('ban_list_clean: fails on a banned phrase', async () => {
  const body = GOOD_BODY.replace('Hey Sam,', 'Hey Sam,\n\nI hope this email finds you well.');
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, body, GOOD_PACK);
  const c = checkFor(result, 'ban_list_clean');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /banned_phrase|hope this/i);
});

test('reading_grade: fails when prose reads above grade 7', async () => {
  const denseBody = `Hey Sam,

Your Navy Seal Training video demonstrates an exceptionally sophisticated understanding of progressive periodization methodologies applied consistently across an extraordinarily demanding thirty-day consecutive training regimen without interruption.

I specialize in optimizing post-production workflows for established fitness content creators. Would you be amenable to reviewing a preliminary sample demonstrating substantially improved audience retention characteristics for your upcoming introductory segment?

Sam

P.S. that particular superset configuration during the second week was genuinely remarkable to observe.`;
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, denseBody, GOOD_PACK);
  const c = checkFor(result, 'reading_grade');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /grade/i);
});

test('structure: fails with no CTA question at the end', async () => {
  const body = GOOD_BODY.replace(
    'Want me to send a rough cut of your next intro so you can see the difference?',
    'I can send a rough cut of your next intro so you can see the difference.'
  );
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, body, GOOD_PACK);
  const c = checkFor(result, 'structure');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /CTA question/i);
});

test('structure: fails with fewer than 3 paragraphs', async () => {
  const body = 'Hey Sam, your Navy Seal Training video hit hard, want to jump on a quick chat?';
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, body, GOOD_PACK);
  const c = checkFor(result, 'structure');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /paragraph/i);
});

test('length: fails when body is under 60 words', async () => {
  const shortBody = `Hey Sam,

Your Navy Seal Training video hit hard.

Want to chat?

Sam`;
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, shortBody, GOOD_PACK);
  const c = checkFor(result, 'length');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /60-130/);
});

test('length: fails when body is over 130 words', async () => {
  const longBody = GOOD_BODY + '\n\n' + 'Extra padding sentence to push the word count well past the one hundred thirty word ceiling for this particular test case scenario here today right now. '.repeat(3);
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, longBody, GOOD_PACK);
  const c = checkFor(result, 'length');
  assert.equal(c.points_awarded, 0);
});

test('ps_present: fails when there is no P.S. line', async () => {
  const body = GOOD_BODY.replace(/\n\nP\.S\.[\s\S]*$/, '');
  const result = await evaluateEmailQualityV2(GOOD_SUBJECT, body, GOOD_PACK);
  const c = checkFor(result, 'ps_present');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /Missing a P\.S\./);
});

test('subject_valid: fails when subject is title-cased', async () => {
  const result = await evaluateEmailQualityV2('Quick One For You', GOOD_BODY, GOOD_PACK);
  const c = checkFor(result, 'subject_valid');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /title-cased/);
});

test('subject_valid: fails when subject is outside 2-6 words', async () => {
  const result = await evaluateEmailQualityV2('hey', GOOD_BODY, GOOD_PACK);
  const c = checkFor(result, 'subject_valid');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /target is 2-6/);
});

test('subject_valid: fails when subject contains a banned phrase', async () => {
  const result = await evaluateEmailQualityV2('exciting opportunity here', GOOD_BODY, GOOD_PACK);
  const c = checkFor(result, 'subject_valid');
  assert.equal(c.points_awarded, 0);
  assert.match(c.detail, /banned phrase/);
});

// ── Error path — a check that throws must still return 0 points with the
// error named in `detail`, and the array must remain complete. This is the
// literal "no silent failures" requirement from the V4 spec.
test('error path: a throwing check returns 0 points + error detail, array stays complete', () => {
  const target = CHECKS.find(c => c.name === 'reading_grade');
  const original = target.run;
  target.run = () => { throw new Error('boom: simulated check crash'); };
  try {
    const checks = runChecks(GOOD_SUBJECT, GOOD_BODY, GOOD_PACK);
    assert.equal(checks.length, CHECKS.length);
    const failed = checks.find(c => c.name === 'reading_grade');
    assert.equal(failed.points_awarded, 0);
    assert.equal(failed.points_possible, 15);
    assert.match(failed.detail, /check errored: boom: simulated check crash/);
    // every other check is still present and untouched
    for (const c of checks) {
      assert.equal(typeof c.points_awarded, 'number');
      assert.equal(typeof c.points_possible, 'number');
      assert.equal(typeof c.detail, 'string');
    }
  } finally {
    target.run = original;
  }
});

test('error path: evaluateEmailQualityV2 blocks (passed=false) when a check throws and total drops below 70', async () => {
  const target = CHECKS.find(c => c.name === 'personalization_proof');
  const original = target.run;
  target.run = () => { throw new Error('lead data unavailable'); };
  try {
    const result = await evaluateEmailQualityV2(GOOD_SUBJECT, GOOD_BODY, GOOD_PACK);
    assert.equal(result.checksComplete, true);
    assert.equal(result.checks.length, 7);
    const c = checkFor(result, 'personalization_proof');
    assert.equal(c.points_awarded, 0);
    assert.match(c.detail, /check errored: lead data unavailable/);
    assert.equal(result.score, 70); // 100 - 30 personalization points
    // checksComplete stays true (the error was caught, not dropped) and 70
    // clears the pass threshold — a caught error zeroes its own points but
    // does not corrupt the rest of the array or force a block by itself.
    assert.equal(result.passed, true);
  } finally {
    target.run = original;
  }
});
