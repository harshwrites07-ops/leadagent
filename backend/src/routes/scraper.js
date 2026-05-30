const express = require('express');
const router = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter, aiLimiter } = require('../middleware/rateLimiter');
const { detectViralChannels, searchChannels, searchChannelsMulti, getKeyPoolStatus, isQuotaExhausted } = require('../services/youtubeService');
const { getKeywordsForNiches, getRandomKeywords, totalKeywordCount } = require('../services/masterKeywords');
const { checkUsageLimit, incrementUsage, PLAN_LIMITS } = require('../services/authService');

const PLAN_RUN_LIMITS = {
  trial:   50,
  free:    100,
  starter: 500,
  pro:     2500,
  growth:  2500,
  agency:  10000,
};

function getRunLimit(user) {
  if (user.plan === 'agency' && user.plan_status === 'active') return 10000;
  const effectivePlan = (user.plan_status === 'cancelled' || user.plan_status === 'past_due')
    ? 'trial'
    : (user.plan || 'free');
  return PLAN_RUN_LIMITS[effectivePlan] || PLAN_RUN_LIMITS.free;
}

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
      stopped: false, error: null, quotaExhausted: false,
      targetCount: null, targetReached: false,
    });
  }
  return powermodeStates.get(userId);
}

// Fallback keyword pool (used when no niches specified)
const POWERMODE_DEFAULT_NICHES = ['business', 'finance', 'fitness', 'education', 'tech', 'health', 'motivation', 'marketing'];
const KEYWORDS_PER_NICHE = 10;

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
        const leads = await searchChannelsMulti(batch, { minSubs: 1000, maxSubs: 2000000, maxResults: Math.min(remaining, 50), emailOnly: false });
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

  // Plan limit check
  const runLimit = getRunLimit(req.user);
  const usageCheck = checkUsageLimit(req.user, 'leads');
  const remaining = usageCheck.allowed ? (usageCheck.limit - usageCheck.used) : 0;

  // Target count: user-requested, capped at plan run limit and remaining monthly budget
  let targetCount = parseInt(req.body?.targetCount) || 100;
  if (targetCount > runLimit) {
    return res.status(400).json({
      success: false,
      error: `Your ${req.user.plan || 'free'} plan allows up to ${runLimit} leads per run. Upgrade to get more.`,
      runLimit,
      upgradeRequired: targetCount > runLimit,
    });
  }
  if (remaining === 0) {
    return res.status(429).json({
      success: false,
      error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan.`,
      upgradeRequired: true,
    });
  }
  // Cap at remaining monthly budget
  targetCount = Math.min(targetCount, remaining);

  // Pick next country in rotation
  const country = POWERMODE_COUNTRIES[pmCountryIdx % POWERMODE_COUNTRIES.length];
  pmCountryIdx++;

  // Build keyword list from selected niches (or defaults)
  // Use 30 per niche so we have enough to reach higher targets
  const requestedNiches = Array.isArray(req.body?.niches) && req.body.niches.length > 0
    ? req.body.niches
    : POWERMODE_DEFAULT_NICHES;
  const kwObjects = getKeywordsForNiches(requestedNiches, 30);
  const keywords = kwObjects.map(k => k.keyword);
  const kwNicheMap = Object.fromEntries(kwObjects.map(k => [k.keyword, k.niche]));

  console.log(`[PowerMode] Starting — target: ${targetCount} leads with email | niches: ${requestedNiches.join(', ')} | ${keywords.length} keywords | country: ${country || 'Global'}`);

  Object.assign(ps, {
    running: true, startedAt: new Date().toISOString(),
    total: 0, saved: 0,
    keywordsTotal: keywords.length,
    keywordsDone: 0, currentKeywords: [],
    recentLeads: [], stats: { hot: 0, warm: 0, cold: 0, withEmail: 0 },
    stopped: false, error: null, quotaExhausted: false,
    country: country || 'Global', niches: requestedNiches,
    targetCount, targetReached: false,
  });

  res.json({ status: 'started', country: country || 'Global', keywordsTotal: keywords.length, niches: requestedNiches, targetCount });

  ;(async () => {
    const db = getDb();
    const insert = db.prepare(LEAD_INSERT_SQL);
    const BATCH = 8;

    for (let i = 0; i < keywords.length && !ps.stopped; i += BATCH) {
      // Stop early if target reached
      if (ps.stats.withEmail >= ps.targetCount) { ps.targetReached = true; break; }

      const batch = keywords.slice(i, i + BATCH);
      ps.currentKeywords = batch;

      console.log(`[PowerMode] Batch ${Math.floor(i/BATCH)+1} — ${ps.stats.withEmail}/${ps.targetCount} email leads — searching: ${batch.slice(0,3).join(', ')}...`);

      // Promise.allSettled never throws — inspect individual rejections
      const results = await Promise.allSettled(
        batch.map(kw => searchChannels({ keyword: kw, minSubs: 1000, maxSubs: 2000000, maxResults: 50, emailOnly: false, country }))
      );

      ps.keywordsDone += batch.length;

      for (let ri = 0; ri < results.length; ri++) {
        const r = results[ri];
        if (r.status !== 'fulfilled') {
          const msg = (r.reason?.message || r.reason?.response?.data?.error?.message || '').toLowerCase();
          if (msg.includes('quota') || r.reason?.response?.status === 429) ps.quotaExhausted = true;
          continue;
        }
        const kw = batch[ri];
        const niche = kwNicheMap[kw] || 'general';

        for (const lead of (r.value || [])) {
          if (ps.stats.withEmail >= ps.targetCount) { ps.targetReached = true; break; }

          ps.total++;
          const t = lead.temperature;
          if (t === 'hot') ps.stats.hot++;
          else if (t === 'warm') ps.stats.warm++;
          else ps.stats.cold++;

          // Only save leads WITH emails — target mode delivers exactly N email leads
          if (!lead.email) continue;

          ps.stats.withEmail++;
          ps.recentLeads.unshift({
            channel_name: lead.channel_name,
            subscriber_count: lead.subscriber_count,
            temperature: lead.temperature,
            email: lead.email,
            hasEmail: true,
            channel_id: lead.channel_id,
          });
          if (ps.recentLeads.length > 50) ps.recentLeads.pop();

          try {
            const ir = insert.run({ ...lead, niche, user_id: userId });
            if (ir.changes > 0) {
              ps.saved++;
              incrementUsage(userId, 'leads', 1);
            }
          } catch {}
        }
        if (ps.targetReached) break;
      }

      if (ps.targetReached || ps.quotaExhausted) break;
      console.log(`[PowerMode] ${ps.stats.withEmail}/${ps.targetCount} email leads | ${ps.keywordsDone}/${ps.keywordsTotal} kw done`);
    }

    // Final target check
    if (!ps.targetReached && ps.stats.withEmail >= ps.targetCount) ps.targetReached = true;

    ps.running = false;
    ps.completedAt = Date.now();
    if (!ps.stopped) {
      const summary = ps.targetReached
        ? `PowerMode: found all ${ps.targetCount} target leads`
        : ps.quotaExhausted
          ? `PowerMode: found ${ps.stats.withEmail}/${ps.targetCount} leads (quota exhausted)`
          : `PowerMode: ${ps.saved} leads found (${ps.stats.withEmail} with email)`;
      console.log(`[PowerMode] ${summary}`);
      logActivity('powermode', summary, null, {}, userId);
    }
  })().catch(e => {
    ps.running = false; ps.completedAt = Date.now(); ps.error = e.message;
    console.error('[PowerMode] Error:', e.message);
  });
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
        temperature, niche, thumbnail_url, channel_description, crm_stage
      ) VALUES (
        @user_id, 'youtube', @channel_id, @channel_name, @channel_handle, @subscriber_count, @avg_views,
        @engagement_rate, @upload_frequency_days, @recent_videos, @pain_points, @lead_score,
        'hot', @niche, @thumbnail_url, @channel_description, 'new_lead'
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
