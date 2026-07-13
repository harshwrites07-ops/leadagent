// Unit tests for the Marcus V4 Stage 1 Intake Gate (backend/src/services/intakeGate.js).
// Run with: node --test test/intakeGate.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runIntakeGate } = require('../src/services/intakeGate');

const freshDate = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const GOOD_LEAD = {
  email: 'creator@gmail.com',
  recent_video_title: 'Navy Seal Training Day One',
  avg_views: 12000,
  subscriber_count: 84000,
  upload_frequency_days: 3,
  updated_at: freshDate(),
  last_contacted_date: null,
};

test('a fully valid lead passes all 4 checks', () => {
  const result = runIntakeGate(GOOD_LEAD);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 4);
  assert.equal(result.blockedReason, null);
});

test('email_valid: blocks an image-filename email (the flags@2x.png bug)', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, email: 'flags@2x.png' });
  assert.equal(result.passed, false);
  assert.match(result.blockedReason, /no valid email/);
});

test('email_valid: blocks a missing email', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, email: '' });
  assert.equal(result.passed, false);
  assert.match(result.blockedReason, /no email on file|no valid email/);
});

test('email_valid: blocks a malformed email', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, email: 'not-an-email' });
  assert.equal(result.passed, false);
});

test('email_valid: accepts a normal email', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, email: 'sam@navysealfitness.com' });
  const c = result.checks.find(c => c.name === 'email_valid');
  assert.equal(c.pass, true);
});

test('has_channel_facts: blocks a lead with only a channel name and no video data', () => {
  const result = runIntakeGate({
    ...GOOD_LEAD,
    recent_video_title: null, recent_videos: null,
    avg_views: null, subscriber_count: null, upload_frequency_days: null,
  });
  assert.equal(result.passed, false);
  assert.match(result.blockedReason, /Insufficient channel data/);
});

test('has_channel_facts: passes with exactly 2 of 4 facts', () => {
  const result = runIntakeGate({
    ...GOOD_LEAD,
    recent_video_title: null,
    upload_frequency_days: null,
  });
  const c = result.checks.find(c => c.name === 'has_channel_facts');
  assert.equal(c.pass, true);
  assert.match(c.detail, /2\/4/);
});

test('facts_fresh: blocks data older than 30 days', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, updated_at: daysAgo(45) });
  assert.equal(result.passed, false);
  assert.match(result.blockedReason, /stale/);
});

test('facts_fresh: passes data under 30 days old', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, updated_at: daysAgo(10) });
  const c = result.checks.find(c => c.name === 'facts_fresh');
  assert.equal(c.pass, true);
});

test('not_already_contacted: blocks a lead contacted within 90 days', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, last_contacted_date: daysAgo(30) });
  assert.equal(result.passed, false);
  assert.match(result.blockedReason, /Already contacted/);
});

test('not_already_contacted: passes a lead contacted over 90 days ago', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, last_contacted_date: daysAgo(120) });
  const c = result.checks.find(c => c.name === 'not_already_contacted');
  assert.equal(c.pass, true);
});

test('not_already_contacted: passes a lead with no prior contact', () => {
  const result = runIntakeGate({ ...GOOD_LEAD, last_contacted_date: null });
  const c = result.checks.find(c => c.name === 'not_already_contacted');
  assert.equal(c.pass, true);
});

test('checks array is always complete (4 entries) even on a maximally broken lead', () => {
  const result = runIntakeGate({});
  assert.equal(result.checks.length, 4);
  for (const c of result.checks) {
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.pass, 'boolean');
    assert.equal(typeof c.detail, 'string');
  }
});
