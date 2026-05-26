const express = require('express');
const router = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter, aiLimiter } = require('../middleware/rateLimiter');
const { detectViralChannels, searchChannels, searchChannelsMulti, getKeyPoolStatus, isQuotaExhausted } = require('../services/youtubeService');

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

// Per-user hunt and powermode state (keyed by userId)
const huntStates = new Map();
const powermodeStates = new Map();

// Purge completed entries older than 10 minutes, cap maps at 100 entries
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of huntStates) {
    if (!v.running && v.completedAt && v.completedAt < cutoff) huntStates.delete(k);
  }
  for (const [k, v] of powermodeStates) {
    if (!v.running && v.completedAt && v.completedAt < cutoff) powermodeStates.delete(k);
  }
  if (huntStates.size > 100) {
    const oldest = [...huntStates.keys()].slice(0, huntStates.size - 100);
    oldest.forEach(k => huntStates.delete(k));
  }
  if (powermodeStates.size > 100) {
    const oldest = [...powermodeStates.keys()].slice(0, powermodeStates.size - 100);
    oldest.forEach(k => powermodeStates.delete(k));
  }
}, 30 * 60 * 1000);

function getHuntState(userId) {
  if (!huntStates.has(userId)) {
    huntStates.set(userId, { running: false, niche: null, found: 0, saved: 0, startedAt: null, keywords: [], error: null });
  }
  return huntStates.get(userId);
}

function getPowermodeState(userId) {
  if (!powermodeStates.has(userId)) {
    powermodeStates.set(userId, {
      running: false, startedAt: null, total: 0, saved: 0,
      keywordsTotal: 0, keywordsDone: 0, currentKeywords: [],
      recentLeads: [], stats: { hot: 0, warm: 0, cold: 0, withEmail: 0 },
      stopped: false, error: null,
    });
  }
  return powermodeStates.get(userId);
}

const POWERMODE_KEYWORDS = [
  // Business & Entrepreneurship
  'business coach YouTube', 'entrepreneur channel', 'agency owner YouTube', 'online business tips', 'startup founder vlog',
  'dropshipping YouTube', 'ecommerce YouTube', 'Amazon FBA channel', 'freelancer YouTube', 'side hustle channel',
  'make money online YouTube', 'digital marketing YouTube', 'email marketing YouTube', 'SEO YouTube channel',
  // Finance & Investing
  'personal finance channel', 'stock market investing', 'passive income ideas', 'financial freedom YouTube', 'investing for beginners',
  'dividend investing YouTube', 'options trading YouTube', 'budgeting YouTube', 'credit repair YouTube', 'forex trading channel',
  // Real Estate
  'real estate investing', 'real estate agent YouTube', 'property investor channel', 'house flipping channel', 'realtor YouTube',
  'Airbnb investing YouTube', 'wholesaling real estate YouTube', 'commercial real estate YouTube',
  // Fitness & Health
  'online fitness coach', 'personal trainer YouTube', 'nutrition coach YouTube', 'weight loss channel', 'gym owner channel',
  'yoga YouTube channel', 'CrossFit YouTube', 'bodybuilding channel', 'home workout YouTube', 'running coach YouTube',
  // Coaching & Self-Help
  'life coach YouTube', 'mindset coach channel', 'productivity YouTube', 'self improvement channel', 'motivation speaker YouTube',
  'dating coach YouTube', 'relationship advice YouTube', 'confidence coach YouTube', 'career coach YouTube',
  // SaaS & Tech
  'SaaS founder YouTube', 'tech founder vlog', 'software demo channel', 'B2B marketing YouTube', 'digital marketing agency',
  'AI tools YouTube', 'no code YouTube', 'automation YouTube channel', 'web design YouTube',
  // Education & Courses
  'course creator YouTube', 'online educator channel', 'skills trainer YouTube', 'eLearning channel', 'teach online YouTube',
  'Udemy instructor YouTube', 'tutoring YouTube channel', 'exam prep YouTube', 'coding bootcamp YouTube',
  // Law & Professional
  'lawyer YouTube channel', 'attorney tips YouTube', 'law firm channel', 'legal education YouTube',
  'immigration lawyer YouTube', 'estate planning YouTube', 'business law YouTube',
  // Health & Wellness
  'doctor YouTube channel', 'therapist channel', 'wellness coach YouTube', 'mental health YouTube',
  'naturopath YouTube', 'chiropractor YouTube', 'dietitian channel', 'holistic health YouTube',
  // Podcasts & Media
  'podcast YouTube channel', 'video podcast channel', 'interview show YouTube',
  'talk show YouTube', 'business podcast YouTube', 'finance podcast YouTube',
];

const LEAD_INSERT_SQL = `
  INSERT OR IGNORE INTO leads
    (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
     avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
     last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
     country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, niche, crm_stage)
  VALUES
    (@user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
     @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
     @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
     @country, @email, @website, @social_links, @thumbnail_url, @pain_points, @lead_score, @temperature, @niche, 'new_lead')
`;

// POST /api/scraper/hunt — fire-and-forget niche hunt (runs in background)
router.post('/hunt', asyncHandler(async (req, res) => {
  const { niche, target = 100 } = req.body;
  const userId = req.user.id;
  if (!niche) return res.status(400).json({ error: 'niche required' });
  const hs = getHuntState(userId);
  if (hs.running) return res.json({ status: 'already_running', ...hs });

  const keywords = NICHE_KEYWORDS[niche];
  if (!keywords) return res.status(400).json({ error: `Unknown niche. Valid: ${Object.keys(NICHE_KEYWORDS).join(', ')}` });

  hs.running = true;
  hs.niche = niche;
  hs.found = 0;
  hs.saved = 0;
  hs.startedAt = new Date().toISOString();
  hs.keywords = keywords;
  hs.error = null;

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
        hs.found += leads.length;
        for (const lead of leads) {
          try {
            const r = insert.run({ ...lead, niche, user_id: userId });
            if (r.changes > 0) { hs.saved++; remaining--; }
          } catch {}
        }
        if (leads.length > 0) logActivity('niche_hunt', `Hunt[${niche}]: +${leads.length} leads saved`, null, {}, userId);
      } catch (e) {
        hs.error = e.message;
        if (e.message.includes('quota')) break;
      }
    }
    hs.running = false;
    hs.completedAt = Date.now();
    console.log(`[Hunt] ${niche} done: ${hs.saved} saved`);
  })();
}));

// GET /api/scraper/hunt/status
router.get('/hunt/status', asyncHandler(async (req, res) => {
  res.json(getHuntState(req.user.id));
}));

// Rotate through countries so each PowerMode run finds fresh channels
const POWERMODE_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'IN', 'SG', 'AE', 'ZA', null];
let pmCountryIdx = 0;

// POST /api/scraper/powermode/start
router.post('/powermode/start', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ps = getPowermodeState(userId);
  if (ps.running) return res.json({ status: 'already_running', ...ps });

  // Pick next country in rotation
  const country = POWERMODE_COUNTRIES[pmCountryIdx % POWERMODE_COUNTRIES.length];
  pmCountryIdx++;

  Object.assign(ps, {
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

    for (let i = 0; i < POWERMODE_KEYWORDS.length && !ps.stopped; i += BATCH) {
      const batch = POWERMODE_KEYWORDS.slice(i, i + BATCH);
      ps.currentKeywords = batch;

      const results = await Promise.allSettled(
        batch.map(kw => searchChannels({ keyword: kw, minSubs: 5000, maxSubs: 500000, maxResults: 50, emailOnly: false, country }))
      );

      ps.keywordsDone += batch.length;

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const lead of (r.value || [])) {
          ps.total++;
          const t = lead.temperature;
          if (t === 'hot') ps.stats.hot++;
          else if (t === 'warm') ps.stats.warm++;
          else ps.stats.cold++;
          if (lead.email) ps.stats.withEmail++;

          ps.recentLeads.unshift({
            channel_name: lead.channel_name,
            subscriber_count: lead.subscriber_count,
            temperature: lead.temperature,
            hasEmail: !!lead.email,
            channel_id: lead.channel_id,
          });
          if (ps.recentLeads.length > 30) ps.recentLeads.pop();

          try {
            const ir = insert.run({ ...lead, niche: 'powermode', user_id: userId });
            if (ir.changes > 0) ps.saved++;
          } catch {}
        }
      }
    }

    ps.running = false;
    ps.completedAt = Date.now();
    if (!ps.stopped) logActivity('powermode', `PowerMode: ${ps.saved} leads found`, null, {}, userId);
  })().catch(e => { ps.running = false; ps.completedAt = Date.now(); ps.error = e.message; });
}));

// POST /api/scraper/powermode/stop
router.post('/powermode/stop', asyncHandler(async (req, res) => {
  const ps = getPowermodeState(req.user.id);
  ps.stopped = true;
  ps.running = false;
  res.json({ status: 'stopped', saved: ps.saved });
}));

// GET /api/scraper/powermode/status
router.get('/powermode/status', asyncHandler(async (req, res) => {
  res.json(getPowermodeState(req.user.id));
}));

// POST /api/scraper/viral-detector
router.post('/viral-detector', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword = 'youtube', niche } = req.body;
  const userId = req.user.id;
  const db = getDb();

  const viralChannels = await detectViralChannels(niche || keyword);

  const results = [];
  for (const ch of viralChannels) {
    const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?').get(ch.channel_id, userId);
    if (existing) { results.push({ ...ch, id: existing.id, status: 'existing' }); continue; }

    const r = db.prepare(`
      INSERT INTO leads (
        user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, avg_views,
        engagement_rate, upload_frequency_days, recent_videos, pain_points, lead_score,
        temperature, niche, thumbnail_url, channel_description
      ) VALUES (
        @user_id, 'youtube', @channel_id, @channel_name, @channel_handle, @subscriber_count, @avg_views,
        @engagement_rate, @upload_frequency_days, @recent_videos, @pain_points, @lead_score,
        'hot', @niche, @thumbnail_url, @channel_description
      )
    `).run({
      user_id: userId,
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

    logActivity('viral_detected', `VIRAL: ${ch.channel_name} got ${ch.viral_multiplier}x normal views`, r.lastInsertRowid, {}, userId);
    results.push({ ...ch, id: r.lastInsertRowid, status: 'new' });
  }

  res.json({ success: true, viral_leads: results, count: results.length });
}));

// POST /api/scraper/competitor-spy
router.post('/competitor-spy', scrapeLimiter, asyncHandler(async (req, res) => {
  const { competitor_name, competitor_keywords } = req.body;
  if (!competitor_name) return res.status(400).json({ success: false, error: 'competitor_name required' });

  const userId = req.user.id;
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
    const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?').get(ch.channel_id, userId);
    if (existing) continue;

    const r = db.prepare(`
      INSERT INTO leads (
        user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, avg_views,
        avg_likes, avg_comments, engagement_rate, upload_frequency_days, last_upload_date,
        channel_description, channel_tags, recent_videos, most_viewed_video,
        country, email, website, pain_points, lead_score, temperature,
        niche, thumbnail_url
      ) VALUES (
        @user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @avg_views,
        @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days, @last_upload_date,
        @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
        @country, @email, @website, @pain_points, @lead_score, @temperature,
        @niche, @thumbnail_url
      )
    `).run({ ...ch, user_id: userId, niche: `competitor:${competitor_name}` });

    ch.id = r.lastInsertRowid;
    results.push(ch);
    added++;
    logActivity('competitor_spy', `Found competitor lead: ${ch.channel_name}`, r.lastInsertRowid, { competitor: competitor_name }, userId);
  }

  res.json({ success: true, added, leads: results });
}));

// GET /api/scraper/quota-status
router.get('/quota-status', asyncHandler(async (req, res) => {
  const keys = getKeyPoolStatus();
  const exhausted = isQuotaExhausted();
  const active = keys.filter(k => !k.exhausted).length;
  // Hours until midnight PT (roughly UTC-8)
  const now = new Date();
  const ptHour = (now.getUTCHours() - 8 + 24) % 24;
  const ptMin = now.getUTCMinutes();
  const hoursToReset = Math.max(1, Math.ceil(24 - ptHour - ptMin / 60));
  res.json({ success: true, exhausted, active, total: keys.length, hoursToReset, keys });
}));

// GET /api/scraper/activities - recent activity feed
router.get('/activities', asyncHandler(async (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit || '30');

  const activities = db.prepare(`
    SELECT a.*, l.channel_name, l.thumbnail_url, l.temperature, l.subscriber_count
    FROM activities a
    LEFT JOIN leads l ON l.id = a.lead_id
    WHERE a.lead_id IS NULL OR l.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(req.user.id, limit);

  res.json({ success: true, activities });
}));

module.exports = router;
