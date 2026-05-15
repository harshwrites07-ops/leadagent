const express = require('express');
const router = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter, aiLimiter } = require('../middleware/rateLimiter');
const { detectViralChannels, searchChannels, searchChannelsMulti } = require('../services/youtubeService');

// ─── Niche keyword maps ────────────────────────────────────────────────────────
const NICHE_KEYWORDS = {
  'Business': ['business coach YouTube','entrepreneur channel','startup founder vlog','agency owner YouTube','consultant YouTube','online business tips','CEO vlog','business automation'],
  'Finance': ['stock trader YouTube','investing channel','crypto educator','personal finance channel','financial advisor YouTube','trading tips','wealth building YouTube','passive income ideas'],
  'Real Estate': ['real estate agent YouTube','property investor channel','real estate investing','realtor YouTube','real estate educator','house flipping channel'],
  'Fitness': ['online fitness coach','personal trainer YouTube','gym owner channel','nutrition coach','fitness business','online coaching YouTube','workout channel'],
  'SaaS & Tech': ['SaaS founder YouTube','software demo channel','startup YouTube','tech founder vlog','product launch channel','B2B marketing YouTube'],
  'Law': ['immigration lawyer YouTube','personal injury attorney','law firm YouTube','legal education channel','lawyer tips','attorney channel'],
  'Health': ['doctor YouTube channel','therapist YouTube','nutritionist channel','health educator','wellness coach YouTube','mental health channel'],
  'Education': ['course creator YouTube','online educator channel','digital course','teaching channel','eLearning YouTube','skills trainer channel'],
  'Podcasters': ['podcast video channel','video podcast YouTube','podcaster YouTube','interview show channel','talk show YouTube'],
};

// In-memory hunt state
const huntState = { running: false, niche: null, found: 0, saved: 0, startedAt: null, keywords: [], error: null };

// PowerMode state
const powermodeState = {
  running: false, startedAt: null, total: 0, saved: 0,
  keywordsTotal: 0, keywordsDone: 0, currentKeywords: [],
  recentLeads: [], stats: { hot: 0, warm: 0, cold: 0, withEmail: 0 },
  stopped: false, error: null,
};

const POWERMODE_KEYWORDS = [
  // Business & Entrepreneurship
  'business coach YouTube', 'entrepreneur channel', 'agency owner YouTube', 'online business tips', 'startup founder vlog',
  // Finance & Investing
  'personal finance channel', 'stock market investing', 'passive income ideas', 'financial freedom YouTube', 'investing for beginners',
  // Real Estate
  'real estate investing', 'real estate agent YouTube', 'property investor channel', 'house flipping channel', 'realtor YouTube',
  // Fitness & Health
  'online fitness coach', 'personal trainer YouTube', 'nutrition coach YouTube', 'weight loss channel', 'gym owner channel',
  // Coaching & Self-Help
  'life coach YouTube', 'mindset coach channel', 'productivity YouTube', 'self improvement channel', 'motivation speaker YouTube',
  // SaaS & Tech
  'SaaS founder YouTube', 'tech founder vlog', 'software demo channel', 'B2B marketing YouTube', 'digital marketing agency',
  // Education & Courses
  'course creator YouTube', 'online educator channel', 'skills trainer YouTube', 'eLearning channel', 'teach online YouTube',
  // Law & Professional
  'lawyer YouTube channel', 'attorney tips YouTube', 'law firm channel', 'legal education YouTube',
  // Health & Wellness
  'doctor YouTube channel', 'therapist channel', 'wellness coach YouTube', 'mental health YouTube',
  // Podcasts & Media
  'podcast YouTube channel', 'video podcast channel', 'interview show YouTube',
];

const LEAD_INSERT_SQL = `
  INSERT OR IGNORE INTO leads
    (platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
     avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
     last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
     country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, niche, crm_stage)
  VALUES
    (@platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
     @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
     @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
     @country, @email, @website, @social_links, @thumbnail_url, @pain_points, @lead_score, @temperature, @niche, 'new_lead')
`;

// POST /api/scraper/hunt — fire-and-forget niche hunt (runs in background)
router.post('/hunt', asyncHandler(async (req, res) => {
  const { niche, target = 100 } = req.body;
  if (!niche) return res.status(400).json({ error: 'niche required' });
  if (huntState.running) return res.json({ status: 'already_running', ...huntState });

  const keywords = NICHE_KEYWORDS[niche];
  if (!keywords) return res.status(400).json({ error: `Unknown niche. Valid: ${Object.keys(NICHE_KEYWORDS).join(', ')}` });

  huntState.running = true;
  huntState.niche = niche;
  huntState.found = 0;
  huntState.saved = 0;
  huntState.startedAt = new Date().toISOString();
  huntState.keywords = keywords;
  huntState.error = null;

  res.json({ status: 'started', niche, target, message: `Hunting ${niche} leads in background. Check /scraper/hunt/status for progress.` });

  // Background execution
  ;(async () => {
    const db = getDb();
    const insert = db.prepare(LEAD_INSERT_SQL);
    let remaining = target;
    let kwIdx = 0;

    while (remaining > 0 && kwIdx < keywords.length) {
      const batch = keywords.slice(kwIdx, kwIdx + 3);
      kwIdx += 3;
      try {
        const leads = await searchChannelsMulti(batch, { minSubs: 5000, maxSubs: 500000, maxResults: Math.min(remaining, 50), emailOnly: true });
        huntState.found += leads.length;
        for (const lead of leads) {
          try {
            const r = insert.run({ ...lead, niche });
            if (r.changes > 0) { huntState.saved++; remaining--; }
          } catch {}
        }
        if (leads.length > 0) logActivity('niche_hunt', `Hunt[${niche}]: +${leads.length} leads saved`, null);
      } catch (e) {
        huntState.error = e.message;
        if (e.message.includes('quota')) break;
      }
    }
    huntState.running = false;
    console.log(`[Hunt] ${niche} done: ${huntState.saved} saved`);
  })();
}));

// GET /api/scraper/hunt/status
router.get('/hunt/status', asyncHandler(async (req, res) => {
  res.json(huntState);
}));

// Rotate through countries so each PowerMode run finds fresh channels
const POWERMODE_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'IN', 'SG', 'AE', 'ZA', null];
let pmCountryIdx = 0;

// POST /api/scraper/powermode/start
router.post('/powermode/start', asyncHandler(async (req, res) => {
  if (powermodeState.running) return res.json({ status: 'already_running', ...powermodeState });

  // Pick next country in rotation
  const country = POWERMODE_COUNTRIES[pmCountryIdx % POWERMODE_COUNTRIES.length];
  pmCountryIdx++;

  Object.assign(powermodeState, {
    running: true, startedAt: new Date().toISOString(),
    total: 0, saved: 0,
    keywordsTotal: POWERMODE_KEYWORDS.length,
    keywordsDone: 0, currentKeywords: [],
    recentLeads: [], stats: { hot: 0, warm: 0, cold: 0, withEmail: 0 },
    stopped: false, error: null, country: country || 'Global',
  });

  res.json({ status: 'started', country: country || 'Global' });

  ;(async () => {
    const db = getDb();
    const insert = db.prepare(LEAD_INSERT_SQL);
    const BATCH = 5;

    for (let i = 0; i < POWERMODE_KEYWORDS.length && !powermodeState.stopped; i += BATCH) {
      const batch = POWERMODE_KEYWORDS.slice(i, i + BATCH);
      powermodeState.currentKeywords = batch;

      const results = await Promise.allSettled(
        batch.map(kw => searchChannels({ keyword: kw, minSubs: 10000, maxSubs: 500000, maxResults: 20, emailOnly: false, country }))
      );

      powermodeState.keywordsDone += batch.length;

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const lead of (r.value || [])) {
          powermodeState.total++;
          const t = lead.temperature;
          if (t === 'hot') powermodeState.stats.hot++;
          else if (t === 'warm') powermodeState.stats.warm++;
          else powermodeState.stats.cold++;
          if (lead.email) powermodeState.stats.withEmail++;

          powermodeState.recentLeads.unshift({
            channel_name: lead.channel_name,
            subscriber_count: lead.subscriber_count,
            temperature: lead.temperature,
            hasEmail: !!lead.email,
            channel_id: lead.channel_id,
          });
          if (powermodeState.recentLeads.length > 30) powermodeState.recentLeads.pop();

          try {
            const r = insert.run({ ...lead, niche: 'powermode' });
            if (r.changes > 0) powermodeState.saved++;
          } catch {}
        }
      }
    }

    powermodeState.running = false;
    if (!powermodeState.stopped) logActivity('powermode', `PowerMode: ${powermodeState.saved} leads found`, null);
  })().catch(e => { powermodeState.running = false; powermodeState.error = e.message; });
}));

// POST /api/scraper/powermode/stop
router.post('/powermode/stop', asyncHandler(async (req, res) => {
  powermodeState.stopped = true;
  powermodeState.running = false;
  res.json({ status: 'stopped', saved: powermodeState.saved });
}));

// GET /api/scraper/powermode/status
router.get('/powermode/status', asyncHandler(async (req, res) => {
  res.json(powermodeState);
}));

// POST /api/scraper/viral-detector
router.post('/viral-detector', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword = 'youtube', niche } = req.body;
  const db = getDb();

  const viralChannels = await detectViralChannels(niche || keyword);

  const results = [];
  for (const ch of viralChannels) {
    const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ?').get(ch.channel_id);
    if (existing) { results.push({ ...ch, id: existing.id, status: 'existing' }); continue; }

    const r = db.prepare(`
      INSERT INTO leads (
        platform, channel_id, channel_name, channel_handle, subscriber_count, avg_views,
        engagement_rate, upload_frequency_days, recent_videos, pain_points, lead_score,
        temperature, niche, thumbnail_url, channel_description
      ) VALUES (
        'youtube', @channel_id, @channel_name, @channel_handle, @subscriber_count, @avg_views,
        @engagement_rate, @upload_frequency_days, @recent_videos, @pain_points, @lead_score,
        'hot', @niche, @thumbnail_url, @channel_description
      )
    `).run({
      channel_id: ch.channel_id,
      channel_name: ch.channel_name,
      channel_handle: ch.channel_handle || null,
      subscriber_count: ch.subscriber_count || 0,
      avg_views: ch.avg_views || 0,
      engagement_rate: ch.engagement_rate || 0,
      upload_frequency_days: ch.upload_frequency_days || 0,
      recent_videos: ch.recent_videos || '[]',
      pain_points: JSON.stringify([{ id: 'viral_opportunity', label: `Viral video (${ch.viral_multiplier}x avg views)`, severity: 'critical' }]),
      lead_score: 85,
      niche: niche || keyword,
      thumbnail_url: ch.thumbnail_url || null,
      channel_description: ch.channel_description || null,
    });

    logActivity('viral_detected', `VIRAL: ${ch.channel_name} got ${ch.viral_multiplier}x normal views 🚀`, r.lastInsertRowid);
    results.push({ ...ch, id: r.lastInsertRowid, status: 'new' });
  }

  res.json({ success: true, viral_leads: results, count: results.length });
}));

// POST /api/scraper/competitor-spy
router.post('/competitor-spy', scrapeLimiter, asyncHandler(async (req, res) => {
  const { competitor_name, competitor_keywords } = req.body;
  if (!competitor_name) return res.status(400).json({ success: false, error: 'competitor_name required' });

  const db = getDb();

  // Search for channels related to the competitor
  const searchTerms = competitor_keywords
    ? competitor_keywords.split(',').map(k => k.trim())
    : [`edited by ${competitor_name}`, `${competitor_name} editing`, competitor_name];

  const allLeads = [];
  for (const term of searchTerms.slice(0, 2)) {
    try {
      const channels = await searchChannels({ keyword: term, maxResults: 20 });
      allLeads.push(...channels);
    } catch (e) {
      console.warn('Competitor spy search error:', e.message);
    }
  }

  let added = 0;
  const results = [];
  for (const ch of allLeads) {
    if (!ch.channel_id) continue;
    const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ?').get(ch.channel_id);
    if (existing) continue;

    const r = db.prepare(`
      INSERT INTO leads (
        platform, channel_id, channel_name, channel_handle, subscriber_count, avg_views,
        avg_likes, avg_comments, engagement_rate, upload_frequency_days, last_upload_date,
        channel_description, channel_tags, recent_videos, most_viewed_video,
        country, email, website, pain_points, lead_score, temperature,
        niche, thumbnail_url
      ) VALUES (
        @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @avg_views,
        @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days, @last_upload_date,
        @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
        @country, @email, @website, @pain_points, @lead_score, @temperature,
        @niche, @thumbnail_url
      )
    `).run({ ...ch, niche: `competitor:${competitor_name}` });

    ch.id = r.lastInsertRowid;
    results.push(ch);
    added++;
    logActivity('competitor_spy', `Found competitor lead: ${ch.channel_name}`, r.lastInsertRowid, { competitor: competitor_name });
  }

  res.json({ success: true, added, leads: results });
}));

// GET /api/scraper/activities - recent activity feed
router.get('/activities', asyncHandler(async (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit || '30');

  const activities = db.prepare(`
    SELECT a.*, l.channel_name, l.thumbnail_url, l.temperature, l.subscriber_count
    FROM activities a
    LEFT JOIN leads l ON l.id = a.lead_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);

  res.json({ success: true, activities });
}));

module.exports = router;
