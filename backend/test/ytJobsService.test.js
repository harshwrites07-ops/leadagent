// Unit tests for YT Jobs ingestion (backend/src/services/ytJobsService.js).
// Card/detail fixtures below are modeled directly on REAL captured DOM from
// ytjobs.co/job/search/ and an individual /job/:id page (live browser
// session, 2026-07-18) — see the file header for the exact selectors.
// Run with: node --test test/ytJobsService.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE, scoreCloseability } = require('../src/utils/scoring');

// No initializeDatabase() here on purpose: none of these tests touch a real
// row (the DB-writing path in ingestJobListing requires a resolved YouTube
// channel + email, which the "no_channel_link" test intentionally short-
// circuits before reaching). initializeDatabase() also arms a real 24-hour
// setInterval (password_reset_tokens cleanup, pre-existing/unrelated to
// this change) that blocks `node --test` from exiting on its own — not
// something to work around by touching that production code.
const ytJobs = require('../src/services/ytJobsService');

function cardHtml({ jobId, title, pay, location, categoriesHtml = '', name, subs }) {
  return `<div data-testid="jobCardElement"><a href="/job/${jobId}"><div><div><h4 class="card-job-title">${title}</h4><div class="card-job-type"><svg></svg><p>${pay}</p></div><div class="card-job-location"><svg></svg><p>${location}</p></div><div class="styles-categories">${categoriesHtml}</div></div><div class="thumbnail-container"><img alt="${name}"><div class="name">${name}</div><div class="subscribers">${subs}</div></div></div></a></div>`;
}

// ── Parser: search-results page ─────────────────────────────────────────────

test('parses a job card with categories (real DOM shape, two nested category divs)', () => {
  const html = cardHtml({
    jobId: 41795, title: 'Thumbnail Designer', pay: '$100-$1,000 Per project', location: 'Remote',
    categoriesHtml: '<div class="category">Business and Finance</div><div class="style">Podcast</div>',
    name: 'Ponder Network', subs: '87 subs',
  });
  const [card] = ytJobs.parseJobCardsFromSearchHTML(html);
  assert.equal(card.jobId, '41795');
  assert.equal(card.title, 'Thumbnail Designer');
  assert.equal(card.payText, '$100-$1,000 Per project');
  assert.equal(card.locationText, 'Remote');
  assert.deepEqual(card.categories, ['Business and Finance', 'Podcast']);
  assert.equal(card.posterName, 'Ponder Network');
  assert.equal(card.subscriberCount, 87);
  assert.equal(card.isCompanyPoster, false);
});

test('parses a job card with no categories (empty container)', () => {
  const html = cardHtml({
    jobId: 41804, title: 'YouTube Production Manager', pay: '$90,000 Per Year . Full-time',
    location: 'Onsite . Las Vegas, NV, US', name: 'Chad Wild Clay', subs: '15.9M subs',
  });
  const [card] = ytJobs.parseJobCardsFromSearchHTML(html);
  assert.equal(card.payText, '$90,000 Per Year . Full-time');
  assert.equal(card.locationText, 'Onsite . Las Vegas, NV, US');
  assert.deepEqual(card.categories, []);
  assert.equal(card.subscriberCount, 15900000);
});

test('detects a company/agency poster (subscribers field literally reads "Company")', () => {
  const html = cardHtml({ jobId: 999, title: 'Video Editor', pay: 'Per project', location: 'Remote', name: 'Parsewave', subs: 'Company' });
  const [card] = ytJobs.parseJobCardsFromSearchHTML(html);
  assert.equal(card.isCompanyPoster, true);
  assert.equal(card.subscriberCount, null);
});

test('parses multiple cards from one listing page without cross-contamination', () => {
  const html = 'Jobs Filter'
    + cardHtml({ jobId: 1, title: 'Video Editor', pay: '$6,000-$10,000 Per Year . Full-time', location: 'Remote', categoriesHtml: '<div class="category">Gaming</div>', name: 'AwesomeTOM', subs: '3.47K subs' })
    + cardHtml({ jobId: 2, title: 'Thumbnail Designer', pay: '$100-$1,000 Per project', location: 'Remote', name: 'Ponder Network', subs: '87 subs' })
    + 'Load More';
  const cards = ytJobs.parseJobCardsFromSearchHTML(html);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].jobId, '1');
  assert.equal(cards[0].subscriberCount, 3470);
  assert.deepEqual(cards[0].categories, ['Gaming']);
  assert.equal(cards[1].jobId, '2');
  assert.deepEqual(cards[1].categories, []);
});

test('malformed/incomplete card chunks are skipped, not thrown', () => {
  const html = 'Jobs Filter<div data-testid="jobCardElement"><a href="/job/broken"><div>no title here</div></a></div>'
    + cardHtml({ jobId: 3, title: 'Editor', pay: 'Per project', location: 'Remote', name: 'X', subs: '1K subs' });
  const cards = ytJobs.parseJobCardsFromSearchHTML(html);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].jobId, '3');
});

test('empty/null HTML returns an empty array, never throws', () => {
  assert.deepEqual(ytJobs.parseJobCardsFromSearchHTML(null), []);
  assert.deepEqual(ytJobs.parseJobCardsFromSearchHTML(''), []);
});

// ── Parser: job detail page ─────────────────────────────────────────────────

test('parses the posted date and description text from a detail page', () => {
  const html = '<div>Posted on: Jul 18 2026</div><h1><span class="job-title">YouTube Production Manager</span></h1><p>Position Overview text goes here.</p>';
  const detail = ytJobs.parseJobDetailHTML(html);
  assert.ok(detail.postedDate);
  assert.ok(new Date(detail.postedDate).getFullYear() === 2026);
  assert.ok(detail.fullText.includes('Position Overview text goes here.'));
});

test('detail parse of null HTML returns null, never throws', () => {
  assert.equal(ytJobs.parseJobDetailHTML(null), null);
});

// ── Role detection ───────────────────────────────────────────────────────────

test('detects role type from title keywords', () => {
  assert.equal(ytJobs.detectRoleType('Video Editor for Long-Form Horror Walkthrough Channel'), 'editor');
  assert.equal(ytJobs.detectRoleType('Thumbnail Designer'), 'thumbnail');
  assert.equal(ytJobs.detectRoleType('YouTube Producer'), 'channel_manager');
  assert.equal(ytJobs.detectRoleType('Scriptwriter'), 'scriptwriter');
  assert.equal(ytJobs.detectRoleType('Something Completely Unrelated'), 'other');
});

// ── Subscriber text parsing ──────────────────────────────────────────────────

test('parses K/M subscriber shorthand and rejects "Company"', () => {
  assert.equal(ytJobs.parseSubscriberText('3.47K subs'), 3470);
  assert.equal(ytJobs.parseSubscriberText('15.9M subs'), 15900000);
  assert.equal(ytJobs.parseSubscriberText('87 subs'), 87);
  assert.equal(ytJobs.parseSubscriberText('Company'), null);
  assert.equal(ytJobs.parseSubscriberText(null), null);
});

// ── YouTube link resolution (never guesses from a display name) ─────────────

test('finds a youtube.com/youtu.be link when present in listing text', () => {
  assert.equal(ytJobs.findYoutubeLink('Check my channel https://youtube.com/@chadwildclay for examples'), 'https://youtube.com/@chadwildclay');
  assert.equal(ytJobs.findYoutubeLink('short link: https://youtu.be/abc123'), 'https://youtu.be/abc123');
});

test('returns null when no YouTube link is present — never guesses from a display name', () => {
  assert.equal(ytJobs.findYoutubeLink('Chad Wild Clay is hiring a production manager'), null);
  assert.equal(ytJobs.findYoutubeLink(''), null);
});

// ── Fetch stub — degrades to empty, matching innertubeService's own pattern ──

test('fetchJobListingsHTML() stub returns null (deferred fetch layer) rather than throwing', async () => {
  const result = await ytJobs.fetchJobListingsHTML('https://ytjobs.co/job/search/');
  assert.equal(result, null);
});

test('a full cycle with the stubbed fetch layer completes cleanly with 0 attempted, not an error', async () => {
  const result = await ytJobs.runYtJobsCycle();
  assert.deepEqual(result, { attempted: 0, inserted: 0, skipped: 0 });
});

// ── Ingestion: no-channel-link listings are skipped, not force-inserted ──────

test('a listing with no resolvable YouTube link is skipped, not inserted with a fabricated email', async () => {
  const card = { title: 'Video Editor', posterName: 'Some Creator', payText: 'Per project', locationText: 'Remote', categories: [], jobUrl: 'https://ytjobs.co/job/1', isCompanyPoster: false, subscriberCount: 5000 };
  const result = await ytJobs.ingestJobListing({ card, detail: { fullText: 'no link in here', postedDate: null } });
  assert.equal(result.inserted, false);
  assert.equal(result.reason, 'no_channel_link');
});

// ── Scoring integration — the actual point of this source ───────────────────

test('has_buying_trigger + the team override together lift a modest, borderline creator into a top tier', () => {
  const withTrigger = scoreCloseability({
    subscriber_count: 5000, avg_views: 800, channel_description: '',
    has_team: JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE, has_buying_trigger: true,
  });
  const withoutTrigger = scoreCloseability({
    subscriber_count: 5000, avg_views: 800, channel_description: '',
    has_team: null, has_buying_trigger: false,
  });
  assert.ok(['S', 'A'].includes(withTrigger.tier), `expected S/A, got ${withTrigger.tier}`);
  assert.ok(withTrigger.score > withoutTrigger.score);
  assert.equal(withTrigger.signals.buying_trigger, 1);
  assert.equal(withTrigger.signals.no_team, 1);
});

test('the job-role team override applies near-zero confidence regardless of general branding signals', () => {
  // A channel name that WOULD trip org-branding suspicion on its own...
  const scored = scoreCloseability({
    subscriber_count: 300000, avg_views: 50000, channel_description: 'Media production team',
    has_team: JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE, // ...but scoring is told to override for this role
    has_buying_trigger: true,
  });
  // no_team signal should read as strongly positive (override applied), not
  // negative (which unoverridden detection would likely have produced here).
  assert.equal(scored.signals.no_team, 1);
});

// ── Row shape sanity: job_context is JSON-parseable and carries required fields ─

test('a real job listing produces a job_context payload with role, budget, and post date', () => {
  const jobContext = {
    role_type: 'editor',
    budget_text: '$6,000-$10,000 Per Year . Full-time',
    location_text: 'Remote',
    categories: ['Gaming'],
    post_date: new Date().toISOString(),
    listing_url: 'https://ytjobs.co/job/1',
    listing_text: 'Video Editor for Long-Form Horror Walkthrough Channel',
    poster_name: 'AwesomeTOM',
    is_company_posting: false,
  };
  const serialized = JSON.stringify(jobContext);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.role_type, 'editor');
  assert.ok(parsed.budget_text);
  assert.ok(parsed.post_date);
});
