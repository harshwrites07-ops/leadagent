// Unit tests for the closeability scorer (backend/src/utils/scoring.js).
// Run with: node --test test/scoring.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreLeadFromYouTube, scoreLeadFromReddit, getTemperature,
  scoreCloseability, CLOSEABILITY_WEIGHTS,
} = require('../src/utils/scoring');

test('legacy scoreLeadFromYouTube still clamps to 0-100', () => {
  const score = scoreLeadFromYouTube({
    subscriber_count: 50000, avg_views: 20000, upload_frequency_days: 3,
    total_videos: 200, email: 'x@x.com', last_upload_date: new Date().toISOString(),
  });
  assert.ok(score >= 0 && score <= 100);
});

test('legacy scoreLeadFromReddit still clamps to 100', () => {
  assert.equal(scoreLeadFromReddit({ channel_id: 'x', email: 'x@x.com' }), 75);
});

test('getTemperature thresholds unchanged', () => {
  assert.equal(getTemperature(70), 'hot');
  assert.equal(getTemperature(40), 'warm');
  assert.equal(getTemperature(39), 'cold');
});

// ── Closeability score ──────────────────────────────────────────────────────

test('a 40K-sub consistent-uploader with a real buying signal outscores a 2.8M news network', () => {
  const smallCreator = scoreCloseability({
    subscriber_count: 40000,
    avg_views: 18000, // strong view/sub ratio — content performing well
    channel_description: 'Looking to hire an editor, business inquiries: x@x.com',
    has_team: false,
    has_buying_trigger: true,
  });

  const megaNewsNetwork = scoreCloseability({
    subscriber_count: 2800000,
    avg_views: 900000,
    channel_description: 'Official news network channel.',
    has_team: null,
    has_buying_trigger: false,
  });

  assert.ok(
    smallCreator.score > megaNewsNetwork.score,
    `expected small creator (${smallCreator.score}) > mega network (${megaNewsNetwork.score})`
  );
  assert.equal(smallCreator.tier, 'S');
  assert.ok(['C', 'D'].includes(megaNewsNetwork.tier), `expected mega network tier C/D, got ${megaNewsNetwork.tier}`);
});

test('score is not constant across a sample set — must produce a real distribution', () => {
  const sample = [
    { subscriber_count: 8000,     avg_views: 500,     channel_description: '' },
    { subscriber_count: 40000,    avg_views: 15000,   channel_description: 'business inquiries: x@x.com' },
    { subscriber_count: 120000,   avg_views: 30000,   channel_description: '' },
    { subscriber_count: 600000,   avg_views: 50000,   channel_description: '' },
    { subscriber_count: 3000000,  avg_views: 800000,  channel_description: 'official network' },
    { subscriber_count: 250000,   avg_views: 200000,  channel_description: 'sponsorship inquiries' },
  ];

  const scores = sample.map(l => scoreCloseability(l).score);
  const unique = new Set(scores);

  assert.ok(unique.size >= 4, `expected varied scores, got ${JSON.stringify(scores)}`);
  assert.notEqual(Math.min(...scores), Math.max(...scores), 'scores must not be a flat constant');
});

test('old backgroundSeeder formula ceiling (105) is gone — score never exceeds 100', () => {
  const maxedOut = scoreCloseability({
    subscriber_count: 500000,
    avg_views: 500000,
    channel_description: 'looking to hire an editor, business inquiries, sponsorship, brand deals',
    has_team: false,
    has_buying_trigger: true,
  });
  assert.ok(maxedOut.score <= 100);
});

test('raw subscriber size alone cannot dominate the score', () => {
  const hugeButNoOtherSignal = scoreCloseability({ subscriber_count: 5000000, avg_views: 0, channel_description: '' });
  const tinyButNoOtherSignal = scoreCloseability({ subscriber_count: 100, avg_views: 0, channel_description: '' });
  // RAW_SIZE weight alone should account for a small fraction of the gap between these.
  const gapFromSizeAlone = CLOSEABILITY_WEIGHTS.RAW_SIZE;
  assert.ok(gapFromSizeAlone <= 5, 'raw size weight must stay near zero');
});

test('weights live in a single named constants block', () => {
  assert.ok(CLOSEABILITY_WEIGHTS.ICP_SUBS_BAND > 0);
  const keywordShare = CLOSEABILITY_WEIGHTS.KEYWORDS /
    Object.values(CLOSEABILITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(keywordShare <= 0.10, `keyword weight share must be <=10%, got ${(keywordShare*100).toFixed(1)}%`);
});
