const express = require('express');
const router = express.Router();
const { getDb, logActivity, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter } = require('../middleware/rateLimiter');
const { detectViralChannels, searchChannels, searchChannelsMulti, getKeyPoolStatus, isQuotaExhausted } = require('../services/youtubeService');
const { checkUsageLimit, incrementUsage } = require('../services/authService');

const PLAN_RUN_LIMITS = { trial: 50, free: 100, starter: 500, pro: 2500, growth: 2500, agency: 10000 };

function getRunLimit(user) {
  if (user.plan === 'agency' && user.plan_status === 'active') return 10000;
  const effectivePlan = (user.plan_status === 'cancelled' || user.plan_status === 'past_due') ? 'trial' : (user.plan || 'free');
  return PLAN_RUN_LIMITS[effectivePlan] || PLAN_RUN_LIMITS.free;
}

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

const huntStates = new Map();
const powermodeStates = new Map();

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of huntStates)     { if (!v.running && v.completedAt && v.completedAt < cutoff) huntStates.delete(k); }
  for (const [k, v] of powermodeStates) { if (!v.running && v.completedAt && v.completedAt < cutoff) powermodeStates.delete(k); }
  if (huntStates.size > 100)     { [...huntStates.keys()].slice(0, huntStates.size - 100).forEach(k => huntStates.delete(k)); }
  if (powermodeStates.size > 100) { [...powermodeStates.keys()].slice(0, powermodeStates.size - 100).forEach(k => powermodeStates.delete(k)); }
}, 30 * 60 * 1000);

function getHuntState(userId) {
  if (!huntStates.has(userId)) huntStates.set(userId, { running: false, niche: null, found: 0, saved: 0, startedAt: null, keywords: [], error: null });
  return huntStates.get(userId);
}

function getPowermodeState(userId) {
  if (!powermodeStates.has(userId)) powermodeStates.set(userId, { running: false, startedAt: null, total: 0, saved: 0, keywordsTotal: 0, keywordsDone: 0, currentKeywords: [], recentLeads: [], stats: { hot: 0, warm: 0, cold: 0, withEmail: 0 }, stopped: false, error: null, quotaExhausted: false, targetCount: null, targetReached: false });
  return powermodeStates.get(userId);
}

const POWERMODE_DEFAULT_NICHES = ['business','finance','fitness','education','tech','health','motivation','marketing'];

const LEAD_INSERT_SQL = USE_PG
  ? `INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,total_videos,avg_views,avg_likes,avg_comments,engagement_rate,upload_frequency_days,last_upload_date,channel_description,channel_tags,recent_videos,most_viewed_video,country,email,website,social_links,thumbnail_url,pain_points,lead_score,temperature,niche,crm_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new_lead') ON CONFLICT DO NOTHING`
  : `INSERT OR IGNORE INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,total_videos,avg_views,avg_likes,avg_comments,engagement_rate,upload_frequency_days,last_upload_date,channel_description,channel_tags,recent_videos,most_viewed_video,country,email,website,social_links,thumbnail_url,pain_points,lead_score,temperature,niche,crm_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new_lead')`;

function leadParams(lead, userId) {
  return [
    userId, lead.platform || 'youtube', lead.channel_id || null, lead.channel_name, lead.channel_handle || null,
    lead.subscriber_count || 0, lead.total_videos || 0, lead.avg_views || 0, lead.avg_likes || 0,
    lead.avg_comments || 0, lead.engagement_rate || 0, lead.upload_frequency_days || 0,
    lead.last_upload_date || null, lead.channel_description || null,
    lead.channel_tags || '[]', lead.recent_videos || '[]', lead.most_viewed_video || '{}',
    lead.country || null, lead.email || null, lead.website || null, lead.social_links || '{}',
    lead.thumbnail_url || null, lead.pain_points || '[]', lead.lead_score || 50,
    lead.temperature || 'warm', lead.niche || null,
  ];
}

router.post('/hunt', asyncHandler(async (req, res) => {
  const { niche, target = 100 } = req.body;
  const userId = req.user.id;
  if (!niche) return res.status(400).json({ error: 'niche required' });
  const hs = getHuntState(userId);
  if (hs.running) return res.json({ status: 'already_running', ...hs });
  const keywords = NICHE_KEYWORDS[niche];
  if (!keywords) return res.status(400).json({ error: `Unknown niche. Valid: ${Object.keys(NICHE_KEYWORDS).join(', ')}` });

  hs.running = true; hs.niche = niche; hs.found = 0; hs.saved = 0;
  hs.startedAt = new Date().toISOString(); hs.keywords = keywords; hs.error = null;

  res.json({ status: 'started', niche, target, message: `Hunting ${niche} leads in background.` });

  ;(async () => {
    const db = getDb();
    let remaining = target, kwIdx = 0;
    while (remaining > 0 && kwIdx < keywords.length) {
      const batch = keywords.slice(kwIdx, kwIdx + 3);
      kwIdx += 3;
      try {
        const leads = await searchChannelsMulti(batch, { minSubs: 1000, maxSubs: 2000000, maxResults: Math.min(remaining, 50), emailOnly: false });
        hs.found += leads.length;
        for (const lead of leads) {
          try {
            const r = await db.run(LEAD_INSERT_SQL, leadParams({ ...lead, niche }, userId));
            if (r.changes > 0) { hs.saved++; remaining--; }
          } catch {}
        }
        if (leads.length > 0) logActivity('niche_hunt', `Hunt[${niche}]: +${leads.length} leads saved`, null, {}, userId);
      } catch (e) {
        hs.error = e.message;
        if (e.message.includes('quota')) break;
      }
    }
    hs.running = false; hs.completedAt = Date.now();
    console.log(`[Hunt] ${niche} done: ${hs.saved} saved`);
  })();
}));

router.get('/hunt/status', asyncHandler(async (req, res) => { res.json(getHuntState(req.user.id)); }));

const POWERMODE_COUNTRIES = ['US','GB','CA','AU','IN','SG','AE','ZA',null];
let pmCountryIdx = 0;

// Shared PowerMode implementation — used by both the direct route below and
// the AI-assistant's trigger_powermode tool, so filtering/thresholds/usage
// limits can't silently diverge between the two UI surfaces (see
// AUDIT_REPORT.md §1.1: these used to be two incompatible implementations).
async function runPowerMode(user, opts = {}) {
  const userId = user.id;
  const ps = getPowermodeState(userId);
  if (ps.running) return { httpStatus: 200, body: { status: 'already_running', ...ps } };

  const runLimit = getRunLimit(user);
  const usageCheck = await checkUsageLimit(user, 'leads');
  const remaining = usageCheck.allowed ? (usageCheck.limit < 0 ? Infinity : usageCheck.limit - usageCheck.used) : 0;

  let targetCount = parseInt(opts.targetCount) || 100;
  if (targetCount > runLimit) return { httpStatus: 400, body: { success: false, error: `Your ${user.plan || 'free'} plan allows up to ${runLimit} leads per run. Upgrade to get more.`, runLimit, upgradeRequired: true } };
  if (remaining === 0) return { httpStatus: 429, body: { success: false, error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan.`, upgradeRequired: true } };
  targetCount = Math.min(targetCount, remaining);

  pmCountryIdx++;
  const requestedNiches = Array.isArray(opts.niches) && opts.niches.length > 0 ? opts.niches : POWERMODE_DEFAULT_NICHES;
  const pmMinSubs = parseInt(opts.minSubs) || 0;
  const pmMaxSubs = parseInt(opts.maxSubs) || 0;
  const pmCountry = (opts.country || '').trim().toUpperCase();

  const db = getDb();
  const nicheConditions = requestedNiches.map(() => 'niche LIKE ?').join(' OR ');
  const nicheParams = requestedNiches.map(n => `%${n}%`);
  const emailFilter = "email IS NOT NULL AND email != '' AND (email_corrupt IS NULL OR email_corrupt = 0)";
  let baseWhere = nicheConditions ? `(${nicheConditions}) AND ${emailFilter}` : emailFilter;
  const baseParams = [...nicheParams];

  if (pmMinSubs > 0) { baseWhere += ' AND subscriber_count >= ?'; baseParams.push(pmMinSubs); }
  if (pmMaxSubs > 0) { baseWhere += ' AND subscriber_count <= ?'; baseParams.push(pmMaxSubs); }
  if (pmCountry)     { baseWhere += ' AND country = ?';           baseParams.push(pmCountry); }

  const userChannelRows = await db.all(`SELECT channel_id FROM leads WHERE user_id=? AND channel_id IS NOT NULL`, [userId]);
  const userChannelIds = userChannelRows.map(r => r.channel_id);
  let fullWhere = baseWhere;
  const fullParams = [...baseParams];
  if (userChannelIds.length > 0) {
    fullWhere += ` AND channel_id NOT IN (${userChannelIds.map(() => '?').join(',')})`;
    fullParams.push(...userChannelIds);
  }

  let availRow = await db.get(`SELECT COUNT(*) as c FROM master_leads WHERE ${fullWhere}`, fullParams);
  let available = availRow.c;

  let fallbackNiche = false, activewhere = fullWhere, activeParams = fullParams;
  if (available === 0) {
    let fbWhere = emailFilter;
    const fbParams = [];
    if (pmMinSubs > 0) { fbWhere += ' AND subscriber_count >= ?'; fbParams.push(pmMinSubs); }
    if (pmMaxSubs > 0) { fbWhere += ' AND subscriber_count <= ?'; fbParams.push(pmMaxSubs); }
    if (pmCountry)     { fbWhere += ' AND country = ?';           fbParams.push(pmCountry); }
    if (userChannelIds.length > 0) { fbWhere += ` AND channel_id NOT IN (${userChannelIds.map(() => '?').join(',')})`; fbParams.push(...userChannelIds); }
    const fbRow = await db.get(`SELECT COUNT(*) as c FROM master_leads WHERE ${fbWhere}`, fbParams);
    if (fbRow.c > 0) { fallbackNiche = true; activewhere = fbWhere; activeParams = fbParams; available = fbRow.c; }
  }

  if (available > 0) {
    const serveCount = Math.min(targetCount, available);
    console.log(`[PowerMode] master_leads: ${available} available → serving ${serveCount} to user ${userId}${fallbackNiche ? ' (cross-niche fallback)' : ''}`);
    const masterLeads = await db.all(`SELECT * FROM master_leads WHERE ${activewhere} ORDER BY lead_score DESC, subscriber_count DESC LIMIT ?`, [...activeParams, serveCount]);

    let totalSaved = 0;
    for (const l of masterLeads) {
      try {
        const r = await db.run(LEAD_INSERT_SQL, leadParams({ ...l, platform: 'youtube', channel_tags: '[]', recent_videos: '[]', most_viewed_video: '{}', social_links: '{}', total_videos: 0, avg_likes: 0, avg_comments: 0, engagement_rate: 0, upload_frequency_days: 0, last_upload_date: null, thumbnail_url: null, pain_points: '[]', temperature: l.temperature || 'warm' }, userId));
        if (r.changes > 0) totalSaved++;
      } catch {}
    }
    incrementUsage(userId, 'leads', totalSaved);
    logActivity('leads_imported', `PowerMode served ${totalSaved} leads from master database`, null, {}, userId);

    if (totalSaved > 0) {
      setImmediate(async () => { try { const { pushUserLeadsToTurso } = require('../services/tursoSync'); await pushUserLeadsToTurso(db); } catch {} });
    }

    const targetReached = totalSaved >= targetCount;
    Object.assign(ps, { running: false, total: masterLeads.length, saved: totalSaved, keywordsTotal: 0, keywordsDone: 0, currentKeywords: [], recentLeads: masterLeads.slice(0, 10).map(l => ({ channel_name: l.channel_name, subscriber_count: l.subscriber_count, hasEmail: true, email: l.email })), stats: { hot: 0, warm: totalSaved, cold: 0, withEmail: totalSaved }, stopped: false, error: null, quotaExhausted: false, niches: requestedNiches, targetCount, targetReached, fallbackNiche });
    return { httpStatus: 200, body: { status: 'instant', source: 'master_leads', saved: totalSaved, targetCount, niches: requestedNiches, keywordsTotal: 0, targetReached, fallbackNiche } };
  }

  Object.assign(ps, { running: false, total: 0, saved: 0, keywordsTotal: 0, keywordsDone: 0, stats: { hot: 0, warm: 0, cold: 0, withEmail: 0 }, stopped: false, error: 'No leads in the database yet. The admin is seeding it — check back soon.', quotaExhausted: false, niches: requestedNiches, targetCount, targetReached: false });
  return { httpStatus: 200, body: { status: 'empty', source: 'master_leads', saved: 0, targetCount, message: 'No leads in the database yet — check back soon.' } };
}

router.post('/powermode/start', asyncHandler(async (req, res) => {
  const result = await runPowerMode(req.user, req.body || {});
  res.status(result.httpStatus).json(result.body);
}));

router.post('/powermode/stop', asyncHandler(async (req, res) => {
  const ps = getPowermodeState(req.user.id);
  ps.stopped = true; ps.running = false;
  res.json({ status: 'stopped', saved: ps.saved });
}));

router.get('/powermode/status', asyncHandler(async (req, res) => { res.json(getPowermodeState(req.user.id)); }));

router.post('/viral-detector', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword = 'youtube', niche } = req.body;
  const userId = req.user.id;
  const db = getDb();
  const viralChannels = await detectViralChannels(niche || keyword);
  const results = [];
  for (const ch of viralChannels) {
    const existing = await db.get('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?', [ch.channel_id, userId]);
    if (existing) { results.push({ ...ch, id: existing.id, status: 'existing' }); continue; }
    const viralInsertSql = USE_PG
      ? `INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,avg_views,engagement_rate,upload_frequency_days,recent_videos,pain_points,lead_score,temperature,niche,thumbnail_url,channel_description,crm_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new_lead') RETURNING id`
      : `INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,avg_views,engagement_rate,upload_frequency_days,recent_videos,pain_points,lead_score,temperature,niche,thumbnail_url,channel_description,crm_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new_lead')`;
    const r = await db.run(viralInsertSql, [userId,'youtube',ch.channel_id,ch.channel_name,ch.channel_handle||null,ch.subscriber_count||0,ch.avg_views||0,ch.engagement_rate||0,ch.upload_frequency_days||0,ch.recent_videos||'[]',JSON.stringify([{id:'viral_opportunity',label:`Viral video (${ch.viral_multiplier}x avg views)`,severity:'critical'}]),85,'hot',niche||keyword,ch.thumbnail_url||null,ch.channel_description||null]);
    logActivity('viral_detected', `VIRAL: ${ch.channel_name} got ${ch.viral_multiplier}x normal views`, r.lastID, {}, userId);
    results.push({ ...ch, id: r.lastID, status: 'new' });
  }
  res.json({ success: true, viral_leads: results, count: results.length });
}));

router.post('/competitor-spy', scrapeLimiter, asyncHandler(async (req, res) => {
  const { competitor_name, competitor_keywords } = req.body;
  if (!competitor_name) return res.status(400).json({ success: false, error: 'competitor_name required' });
  const userId = req.user.id;
  const db = getDb();
  const searchTerms = competitor_keywords ? competitor_keywords.split(',').map(k => k.trim()) : [`edited by ${competitor_name}`, `${competitor_name} editing`, competitor_name];
  const allLeads = [];
  for (const term of searchTerms.slice(0, 2)) {
    try { const channels = await searchChannels({ keyword: term, maxResults: 20 }); allLeads.push(...channels); }
    catch (e) { console.warn('Competitor spy search error:', e.message); }
  }
  let added = 0;
  const results = [];
  for (const ch of allLeads) {
    if (!ch.channel_id) continue;
    const existing = await db.get('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?', [ch.channel_id, userId]);
    if (existing) continue;
    const r = await db.run(LEAD_INSERT_SQL, leadParams({ ...ch, niche: `competitor:${competitor_name}` }, userId));
    if (r.changes > 0) {
      ch.id = r.lastID;
      results.push(ch);
      added++;
      logActivity('competitor_spy', `Found competitor lead: ${ch.channel_name}`, r.lastID, { competitor: competitor_name }, userId);
    }
  }
  res.json({ success: true, added, leads: results });
}));

router.get('/quota-status', asyncHandler(async (req, res) => {
  const keys = getKeyPoolStatus();
  const exhausted = isQuotaExhausted();
  const active = keys.filter(k => !k.exhausted).length;
  const now = new Date();
  const ptHour = (now.getUTCHours() - 8 + 24) % 24;
  const ptMin = now.getUTCMinutes();
  const hoursToReset = Math.max(1, Math.ceil(24 - ptHour - ptMin / 60));
  res.json({ success: true, exhausted, active, total: keys.length, hoursToReset, keys });
}));

router.get('/activities', asyncHandler(async (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit || '30');
  const activities = await db.all(`SELECT a.*, l.channel_name, l.thumbnail_url, l.temperature, l.subscriber_count FROM activities a LEFT JOIN leads l ON l.id = a.lead_id WHERE a.lead_id IS NULL OR l.user_id = ? ORDER BY a.created_at DESC LIMIT ?`, [req.user.id, limit]);
  res.json({ success: true, activities });
}));

module.exports = router;
module.exports.runPowerMode = runPowerMode;
