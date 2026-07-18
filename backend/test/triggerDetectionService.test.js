// Unit tests for community-post + schedule-break buying triggers
// (backend/src/services/triggerDetectionService.js).
// Run with: node --test test/triggerDetectionService.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { initializeDatabase, getDb } = require('../src/models/database');
const {
  detectCommunityBuyingTrigger, detectScheduleBreakForChannel, rescoreLeadWithTriggers,
  TRIGGER_CONFIDENCE,
} = require('../src/services/triggerDetectionService');
const { scoreCloseability } = require('../src/utils/scoring');

test.before(async () => {
  await initializeDatabase();
});

// initializeDatabase() arms a real 24-hour setInterval (password_reset_tokens
// cleanup, pre-existing/unrelated to this change — see quotaTracker.test.js's
// note on the same issue) that keeps `node --test` alive indefinitely rather
// than exiting once every test here has finished. Unlike the pure-function
// tests elsewhere in this suite, the tests below genuinely need a real DB
// (they assert real INSERT/UPDATE effects on master_leads), so skipping
// initializeDatabase() entirely isn't an option here. Each test file already
// runs as its own process under `node --test`, so an explicit exit after
// this file's suite completes only affects this file, not sibling test files.
test.after(() => { setImmediate(() => process.exit(0)); });

// Lightweight require-cache monkey-patching (no mocking library needed —
// consistent with the rest of this codebase's "no new dependency" pattern).
function mockModule(modulePath, overrides) {
  const mod = require(modulePath);
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = mod[key];
    mod[key] = overrides[key];
  }
  return () => { for (const key of Object.keys(overrides)) mod[key] = originals[key]; };
}

// ── A) Community-post intent scan ───────────────────────────────────────────

test('a stated "looking for an editor" community post fires the strong trigger with evidence', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => [
      { postId: '1', text: 'Hey everyone, looking for an editor to help with the backlog!', url: 'https://youtube.com/post/1', publishedText: '2 days ago' },
    ],
  });
  t.after(restore);

  const result = await detectCommunityBuyingTrigger('UCtest1');
  assert.equal(result.confidence, TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].type, 'community_hiring_post');
  assert.ok(result.evidence[0].text.includes('looking for an editor'));
  assert.equal(result.evidence[0].posted, '2 days ago');
});

test('a "burnt out" / strain post fires the weaker implied-pain trigger', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => [
      { postId: '2', text: 'sorry for the delay everyone, honestly feeling pretty burnt out lately', url: 'https://youtube.com/post/2', publishedText: '5 days ago' },
    ],
  });
  t.after(restore);

  const result = await detectCommunityBuyingTrigger('UCtest2');
  assert.equal(result.confidence, TRIGGER_CONFIDENCE.COMMUNITY_STRAIN_POST);
  assert.equal(result.evidence[0].type, 'community_strain_post');
});

test('a hiring match on one post outranks a strain match on another — max, not sum', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => [
      { postId: '1', text: 'been a while since I posted, sorry', url: 'x', publishedText: '1 week ago' },
      { postId: '2', text: 'looking for an editor, DM me', url: 'y', publishedText: '2 days ago' },
    ],
  });
  t.after(restore);

  const result = await detectCommunityBuyingTrigger('UCtest3');
  assert.equal(result.confidence, TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST);
  assert.equal(result.evidence.length, 2); // both matches recorded as evidence...
  // ...but confidence reflects the strongest single match, not a sum.
  assert.ok(result.confidence <= 1);
});

test('no matching posts yields zero confidence and empty evidence', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => [{ postId: '1', text: 'just uploaded a new video, check it out!', url: 'x', publishedText: '1 day ago' }],
  });
  t.after(restore);

  const result = await detectCommunityBuyingTrigger('UCtest4');
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.evidence, []);
});

test('a fetch failure degrades to zero confidence, never throws', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => { throw new Error('network error'); },
  });
  t.after(restore);

  const result = await detectCommunityBuyingTrigger('UCtest5');
  assert.equal(result.confidence, 0);
});

// ── B) Schedule-break detection (per-channel baseline) ───────────────────────

function videosWithGap(gapDays, count, silentDays) {
  const now = Date.now();
  const videos = [{ date: new Date(now - silentDays * 86400000).toISOString() }];
  for (let i = 1; i < count; i++) {
    videos.push({ date: new Date(now - (silentDays + i * gapDays) * 86400000).toISOString() });
  }
  return videos;
}

test('a weekly uploader gone quiet for 25 days trips the schedule-break trigger', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    getChannelVideos: async () => videosWithGap(7, 10, 25),
  });
  t.after(restore);

  const result = await detectScheduleBreakForChannel('UCweekly');
  assert.equal(result.confidence, TRIGGER_CONFIDENCE.SCHEDULE_BREAK);
  assert.equal(result.breakInfo.schedule_break, true);
  assert.equal(result.evidence[0].type, 'schedule_break');
});

test('a monthly uploader with the SAME 25-day gap does NOT trip — baseline is per-channel, not global', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    getChannelVideos: async () => videosWithGap(30, 10, 25),
  });
  t.after(restore);

  const result = await detectScheduleBreakForChannel('UCmonthly');
  assert.equal(result.confidence, 0);
  assert.equal(result.breakInfo.schedule_break, false);
});

test('a video fetch failure degrades to zero confidence, never throws', async (t) => {
  const restore = mockModule('../src/services/innertubeService', {
    getChannelVideos: async () => { throw new Error('network error'); },
  });
  t.after(restore);

  const result = await detectScheduleBreakForChannel('UCfail');
  assert.equal(result.confidence, 0);
  assert.equal(result.breakInfo, null);
});

// ── Integration: rescoreLeadWithTriggers ─────────────────────────────────────

function freshChannelId() { return `UC_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`; }

test('a community hiring post rescoring a real master_leads row updates its score and stores evidence', async (t) => {
  const db = getDb();
  const channelId = freshChannelId();
  await db.run(
    `INSERT INTO master_leads (channel_id, channel_name, subscriber_count, avg_views, email, channel_description, lead_score, temperature, source)
     VALUES (?, 'Test Channel', 5000, 800, 'test@example.com', '', 0, 'cold', 'legacy')`,
    [channelId]
  );

  const restoreCommunity = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => [{ postId: '1', text: 'looking for an editor asap', url: 'x', publishedText: 'today' }],
    getChannelVideos: async () => [],
  });
  t.after(restoreCommunity);
  t.after(async () => { await db.run('DELETE FROM master_leads WHERE channel_id = ?', [channelId]); });

  const result = await rescoreLeadWithTriggers(channelId);
  assert.equal(result.updated, true);
  assert.equal(result.triggerConfidence, TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST);

  const updated = await db.get('SELECT * FROM master_leads WHERE channel_id = ?', [channelId]);
  assert.equal(updated.lead_score, result.score);
  const jobContext = JSON.parse(updated.job_context);
  assert.equal(jobContext.trigger_type, 'community_hiring_post');
  assert.ok(jobContext.trigger_evidence.length > 0);
});

// Acceptance criterion: "A creator with a genuine 'looking for an editor'
// community post outranks a same-size creator with none."
test('a creator with a stated community hiring post outranks an identical same-size creator with none', async (t) => {
  const db = getDb();
  const withPostId = freshChannelId();
  const withoutPostId = freshChannelId();
  const rowSql = `INSERT INTO master_leads (channel_id, channel_name, subscriber_count, avg_views, email, channel_description, lead_score, temperature, source)
     VALUES (?, ?, 40000, 12000, ?, '', 0, 'cold', 'legacy')`;
  await db.run(rowSql, [withPostId, 'Has Post Channel', 'withpost@example.com']);
  await db.run(rowSql, [withoutPostId, 'No Post Channel', 'nopost@example.com']);

  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async (channelId) => channelId === withPostId
      ? [{ postId: '1', text: 'looking for an editor, please DM', url: 'x', publishedText: 'today' }]
      : [],
    getChannelVideos: async () => [],
  });
  t.after(restore);
  t.after(async () => {
    await db.run('DELETE FROM master_leads WHERE channel_id IN (?, ?)', [withPostId, withoutPostId]);
  });

  const withResult = await rescoreLeadWithTriggers(withPostId);
  const withoutResult = await rescoreLeadWithTriggers(withoutPostId);

  assert.equal(withResult.updated, true);
  assert.equal(withoutResult.updated, false); // no signal at all -- correctly left unchanged

  const withRow = await db.get('SELECT lead_score FROM master_leads WHERE channel_id = ?', [withPostId]);
  const withoutRow = await db.get('SELECT lead_score FROM master_leads WHERE channel_id = ?', [withoutPostId]);
  assert.ok(withRow.lead_score > withoutRow.lead_score, `expected ${withRow.lead_score} > ${withoutRow.lead_score}`);
});

test('a lead with no trigger signals is left unchanged (updated: false)', async (t) => {
  const db = getDb();
  const channelId = freshChannelId();
  await db.run(
    `INSERT INTO master_leads (channel_id, channel_name, subscriber_count, avg_views, email, channel_description, lead_score, temperature, source)
     VALUES (?, 'Quiet Channel', 5000, 800, 'quiet@example.com', '', 40, 'cold', 'legacy')`,
    [channelId]
  );

  const restore = mockModule('../src/services/innertubeService', {
    fetchCommunityPosts: async () => [],
    getChannelVideos: async () => [],
  });
  t.after(restore);
  t.after(async () => { await db.run('DELETE FROM master_leads WHERE channel_id = ?', [channelId]); });

  const result = await rescoreLeadWithTriggers(channelId);
  assert.equal(result.updated, false);
  assert.equal(result.triggerConfidence, 0);
});

// ── Multi-trigger cap: max, not sum ──────────────────────────────────────────

test('scoreCloseability treats a combined (maxed) trigger confidence correctly — never exceeds the individual max', () => {
  const combined = Math.min(Math.max(TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST, TRIGGER_CONFIDENCE.SCHEDULE_BREAK), TRIGGER_CONFIDENCE.MULTI_TRIGGER_CAP);
  assert.equal(combined, TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST); // the stronger of the two, not their sum
  assert.ok(combined <= 1);

  const scored = scoreCloseability({ subscriber_count: 20000, avg_views: 5000, has_buying_trigger: combined });
  assert.equal(scored.signals.buying_trigger, TRIGGER_CONFIDENCE.COMMUNITY_HIRING_POST);
});
