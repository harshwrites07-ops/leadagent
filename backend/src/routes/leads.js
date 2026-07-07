const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb, logActivity, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter } = require('../middleware/rateLimiter');
const { searchChannelsMulti: ytSearchMulti } = require('../services/youtubeService');
const { searchChannelsMulti: itSearchMulti } = require('../services/innertubeService');
const { searchPosts } = require('../services/redditService');
const { checkUsageLimit, incrementUsage } = require('../services/authService');

const NOW = USE_PG ? 'NOW()' : 'CURRENT_TIMESTAMP';

const ENV_PATH = path.join(__dirname, '../../../.env');

async function smartKeyword(rawKeyword) {
  const { generateWithGemini } = require('../services/geminiService');
  try {
    const result = await generateWithGemini(
      `I run a video editing agency targeting YouTube creators. Given the niche keyword "${rawKeyword}", write ONE optimised YouTube search query (4-8 words) that finds solo YouTubers in this niche who clearly need professional video editing. Return only the search query, no quotes, no explanation.`
    );
    if (!result) return rawKeyword;
    return result.trim().replace(/^["']|["']$/g, '');
  } catch { return rawKeyword; }
}

const KEYWORD_EXPANSIONS = {
  'business coach':  ['business coaching','entrepreneur coach','startup coach','business mentor','CEO vlog'],
  'fitness':         ['fitness coach','personal trainer','gym motivation','weight loss coach','nutrition coach'],
  'finance':         ['personal finance','investing for beginners','stock market tips','financial freedom','passive income'],
  'real estate':     ['real estate investing','real estate agent','property investor','house flipping','realtor'],
  'health':          ['health coach','wellness coach','doctor youtube','nutritionist channel','therapist youtube'],
  'education':       ['online course creator','digital educator','teach online','eLearning channel','skills trainer'],
  'saas':            ['SaaS founder','software startup','tech founder','B2B marketing','product demo'],
  'marketing':       ['digital marketing','social media marketing','email marketing tips','marketing agency','SEO youtube'],
  'wealth':          ['wealth building','financial coach','money coach','investing wealth','financial advisor'],
  'crypto':          ['crypto investing','bitcoin channel','crypto education','altcoin channel','DeFi youtube'],
  'coaching':        ['life coach youtube','mindset coach','productivity coach','self improvement','motivation speaker'],
  'ecommerce':       ['dropshipping youtube','Amazon FBA','shopify youtube','online store','ecommerce tips'],
  'law':             ['lawyer youtube','attorney tips','legal education','law firm channel','immigration lawyer'],
  'podcast':         ['podcast youtube','video podcast','interview show','talk show youtube','business podcast'],
};

const _kwCache = new Map();

async function expandKeywords(keyword) {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const lower = keyword.toLowerCase().trim();
  if (_kwCache.has(lower)) return _kwCache.get(lower);
  for (const [key, variants] of Object.entries(KEYWORD_EXPANSIONS)) {
    if (lower === key || lower.includes(key) || key.includes(lower)) {
      const result = [keyword, ...variants.slice(0, 4)];
      _kwCache.set(lower, result);
      return result;
    }
  }
  const keys = [];
  for (let i = 1; i <= 10; i++) { const k = process.env[`GEMINI_API_KEY_${i}`]; if (k && k !== 'placeholder') keys.push(k); }
  if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY)) keys.push(process.env.GEMINI_API_KEY);
  for (const geminiKey of keys) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_FAST_MODEL || 'gemini-2.0-flash' });
      const result = await model.generateContent(`Give me 4 YouTube search keywords related to "${keyword}" for finding creators who need video editing. Return only keywords, one per line, no numbering.`);
      const lines = result.response.text().trim().split('\n').map(l => l.replace(/^[\d\-\*\•\.]+\s*/, '').trim()).filter(l => l.length > 2 && l.length < 60).slice(0, 4);
      if (lines.length > 0) { const expanded = [keyword, ...lines]; _kwCache.set(lower, expanded); return expanded; }
    } catch (e) {
      if (/429|quota|resource_exhausted|limit/i.test(e.message)) continue;
      break;
    }
  }
  _kwCache.set(lower, [keyword]);
  return [keyword];
}

const JSON_FIELDS = ['pain_points','channel_tags','recent_videos','most_viewed_video','social_links'];
function parseLead(lead) {
  if (!lead) return lead;
  const out = { ...lead };
  for (const f of JSON_FIELDS) {
    if (typeof out[f] === 'string') { try { out[f] = JSON.parse(out[f]); } catch { out[f] = []; } }
  }
  return out;
}

// GET /api/leads
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { platform, temperature, crm_stage, niche, search, sort = 'created_at', order = 'desc', page = 1, limit = 50 } = req.query;
  let where = ['user_id = ?'];
  const params = [req.user.id];
  if (platform)    { where.push('platform = ?');  params.push(platform); }
  if (temperature) { where.push('temperature = ?'); params.push(temperature); }
  if (crm_stage)   { where.push('crm_stage = ?');  params.push(crm_stage); }
  if (niche)       { where.push('niche LIKE ?');    params.push(`%${niche}%`); }
  if (search)      { where.push('(channel_name LIKE ? OR email LIKE ? OR reddit_username LIKE ?)'); params.push(`%${search}%`,`%${search}%`,`%${search}%`); }

  const safeSort  = ['created_at','lead_score','subscriber_count','engagement_rate','updated_at'].includes(sort) ? sort : 'created_at';
  const safeOrder = order === 'asc' ? 'ASC' : 'DESC';
  const offset    = (parseInt(page) - 1) * parseInt(limit);

  const total = await db.get(`SELECT COUNT(*) as count FROM leads WHERE ${where.join(' AND ')}`, params);
  const leads = await db.all(
    `SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );
  res.json({ success: true, leads: leads.map(parseLead), total: total.count, page: parseInt(page), limit: parseInt(limit) });
}));

router.get('/export/count', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const newCount   = await db.get('SELECT COUNT(*) as c FROM leads WHERE user_id = ? AND exported_at IS NULL', [uid]);
  const totalCount = await db.get('SELECT COUNT(*) as c FROM leads WHERE user_id = ?', [uid]);
  res.json({ success: true, new: newCount.c, total: totalCount.c });
}));

router.get('/export/csv', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { filter = 'new' } = req.query;
  const leads = filter === 'new'
    ? await db.all('SELECT * FROM leads WHERE user_id = ? AND exported_at IS NULL ORDER BY created_at DESC', [uid])
    : await db.all('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC', [uid]);

  const esc = v => { if (v === null || v === undefined) return ''; const s = String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s; };
  const header = ['Channel Name','Subscribers','Email','Niche','Platform','Stage','Score','Upload Frequency (days)','Last Contacted','Created At'];
  const rows = leads.map(l => [l.channel_name,l.subscriber_count,l.email,l.niche,l.platform,l.crm_stage,l.lead_score,l.upload_frequency_days,l.last_contacted_date,l.created_at].map(esc).join(','));
  const csv = [header.join(','), ...rows].join('\r\n');

  if (leads.length > 0) {
    const placeholders = leads.map(() => '?').join(',');
    await db.run(`UPDATE leads SET exported_at = ${NOW} WHERE id IN (${placeholders}) AND user_id = ?`, [...leads.map(l => l.id), uid]);
  }

  const date = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-export-${date}.csv"`);
  res.setHeader('X-Export-Count', String(leads.length));
  res.setHeader('Access-Control-Expose-Headers', 'X-Export-Count');
  res.send(csv);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = parseLead(await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]));
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const pitch  = await db.get('SELECT * FROM pitches WHERE lead_id = ?', [lead.id]);
  const emails = await db.all('SELECT * FROM emails WHERE lead_id = ? ORDER BY created_at DESC', [lead.id]);
  const notes  = await db.all('SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC', [lead.id]);
  res.json({ success: true, lead, pitch, emails, notes });
}));

router.post('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const data = req.body;
  if (data.channel_id) {
    const existing = await db.get('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?', [data.channel_id, req.user.id]);
    if (existing) return res.status(409).json({ success: false, error: 'Lead already exists', id: existing.id });
  }

  const insertSql = `INSERT INTO leads (
    user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
    avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
    last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
    country, email, website, social_links, pain_points, lead_score, temperature,
    crm_stage, niche, reddit_username, reddit_post_title, reddit_post_content,
    reddit_subreddit, thumbnail_url
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ${USE_PG ? 'RETURNING id' : ''}`;

  const result = await db.run(insertSql, [
    req.user.id, data.platform || 'youtube', data.channel_id || null, data.channel_name,
    data.channel_handle || null, data.subscriber_count || 0, data.total_videos || 0,
    data.avg_views || 0, data.avg_likes || 0, data.avg_comments || 0,
    data.engagement_rate || 0, data.upload_frequency_days || 0,
    data.last_upload_date || null, data.channel_description || null,
    typeof data.channel_tags === 'string' ? data.channel_tags : JSON.stringify(data.channel_tags || []),
    typeof data.recent_videos === 'string' ? data.recent_videos : JSON.stringify(data.recent_videos || []),
    typeof data.most_viewed_video === 'string' ? data.most_viewed_video : JSON.stringify(data.most_viewed_video || {}),
    data.country || null, data.email || null, data.website || null,
    typeof data.social_links === 'string' ? data.social_links : JSON.stringify(data.social_links || {}),
    typeof data.pain_points === 'string' ? data.pain_points : JSON.stringify(data.pain_points || []),
    data.lead_score || 0, data.temperature || 'cold', data.crm_stage || 'new_lead',
    data.niche || null, data.reddit_username || null, data.reddit_post_title || null,
    data.reddit_post_content || null, data.reddit_subreddit || null, data.thumbnail_url || null,
  ]);

  logActivity('lead_added', `New lead added: ${data.channel_name}`, result.lastID, {}, req.user.id);
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', [result.lastID]);
  res.status(201).json({ success: true, lead });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  const allowed = ['channel_name','email','website','niche','crm_stage','temperature','lead_score','channel_description'];
  const updates = [], vals = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); vals.push(req.body[key]); }
  }
  if (!updates.length) return res.json({ success: true, lead });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(req.params.id);
  await db.run(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`, vals);
  const updated = await db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
  res.json({ success: true, lead: parseLead(updated) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await getDb().run('DELETE FROM leads WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ success: true });
}));

router.post('/import', asyncHandler(async (req, res) => {
  const { leads: rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ success: false, error: 'leads array required' });
  const db = getDb();
  let added = 0, skipped = 0;
  for (const row of rows.slice(0, 1000)) {
    const name = (row.channel_name || '').trim();
    if (!name) { skipped++; continue; }
    // Prefer channel_id when we can derive one — two distinct channels can share a
    // display name (false dedup match), and a genuine duplicate imported under a
    // slightly different name string wouldn't be caught by a name-only check.
    let channelId = (row.channel_id || '').trim() || null;
    let handle = row.channel_url || row.channel_handle || null;
    if (handle) {
      try {
        const u = new URL(handle);
        const parts = u.pathname.split('/').filter(Boolean);
        if (!channelId) {
          const channelIdx = parts.indexOf('channel');
          if (channelIdx !== -1 && parts[channelIdx + 1]) channelId = parts[channelIdx + 1];
        }
        handle = parts.find(p => p.startsWith('@')) || parts[parts.length - 1] || handle;
      } catch {}
    }
    const exists = channelId
      ? await db.get('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?', [channelId, req.user.id])
      : await db.get('SELECT id FROM leads WHERE channel_name = ? AND user_id = ?', [name, req.user.id]);
    if (exists) { skipped++; continue; }
    try {
      await db.run(`INSERT INTO leads (user_id, platform, channel_id, channel_name, email, subscriber_count, channel_handle, niche, lead_score, temperature, crm_stage) VALUES (?, 'youtube', ?, ?, ?, ?, ?, ?, 50, 'cold', 'new_lead') ${USE_PG ? 'ON CONFLICT DO NOTHING' : ''}`,
        [req.user.id, channelId, name, row.email || null, parseInt(row.subscriber_count) || 0, handle, row.niche || null]);
      added++;
    } catch { skipped++; }
  }
  res.json({ success: true, added, skipped });
}));

// ── Streaming scrape ──────────────────────────────────────────────────────────

router.post('/scrape/youtube/stream', scrapeLimiter, asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = data => { try { res.write(JSON.stringify(data) + '\n'); } catch {} };

  try {
    const { keyword, minSubs = 1000, maxSubs = 500000, country, maxResults = 50, minViews = 100, emailOnly = false } = req.body;
    if (!keyword) { send({ type: 'error', message: 'keyword is required' }); return res.end(); }

    const usageCheck = await checkUsageLimit(req.user, 'leads');
    if (!usageCheck.allowed) { send({ type: 'error', message: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}).`, upgradeRequired: true }); return res.end(); }

    const db = getDb();
    const conditions = ["email IS NOT NULL AND email != '' AND (email_corrupt IS NULL OR email_corrupt = 0)"]; const mParams = [];
    if (keyword) { conditions.push('(channel_name LIKE ? OR channel_description LIKE ? OR niche LIKE ?)'); mParams.push(`%${keyword}%`,`%${keyword}%`,`%${keyword}%`); }
    if (minSubs) { conditions.push('subscriber_count >= ?'); mParams.push(Number(minSubs)); }
    if (maxSubs) { conditions.push('subscriber_count <= ?'); mParams.push(Number(maxSubs)); }
    if (country) { conditions.push('country = ?'); mParams.push(country); }

    const userChannels = (await db.all(`SELECT channel_id FROM leads WHERE user_id=? AND channel_id IS NOT NULL`, [req.user.id])).map(r => r.channel_id);
    let whereClause = conditions.join(' AND '); const allParams = [...mParams];
    if (userChannels.length > 0) { whereClause += ` AND channel_id NOT IN (${userChannels.map(() => '?').join(',')})`; allParams.push(...userChannels); }

    const masterCount = await db.get(`SELECT COUNT(*) as c FROM master_leads WHERE ${whereClause}`, allParams);

    if (masterCount.c > 0) {
      send({ type: 'progress', stage: 'search', message: `Found ${masterCount.c} matching leads — delivering from database...` });
      const masterLeads = await db.all(`SELECT * FROM master_leads WHERE ${whereClause} ORDER BY lead_score DESC, subscriber_count DESC LIMIT ?`, [...allParams, Number(maxResults)]);
      const uid = req.user.id;
      let saved = 0;
      for (const l of masterLeads) {
        try {
          const r = await db.run(`INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,avg_views,email,website,channel_description,lead_score,temperature,crm_stage,country,niche) VALUES (?,'youtube',?,?,?,?,?,?,?,?,?,?,'new_lead',?,?) ON CONFLICT DO NOTHING`,
            [uid,l.channel_id,l.channel_name,l.channel_handle,l.subscriber_count,l.avg_views,l.email,l.website,l.channel_description,l.lead_score,l.temperature,l.country,l.niche]);
          if (r.changes > 0) saved++;
        } catch {}
      }
      if (masterLeads.length > 0) {
        const userLeads = await db.all(`SELECT * FROM leads WHERE user_id=? AND channel_id IN (${masterLeads.map(() => '?').join(',')}) ORDER BY lead_score DESC`, [uid, ...masterLeads.map(l => l.channel_id)]);
        for (const lead of userLeads) send({ type: 'lead', lead, source: 'database' });
        send({ type: 'done', total: userLeads.length, saved, source: 'database', message: `Delivered ${userLeads.length} leads instantly` });
      }
      if (saved > 0) setImmediate(async () => { try { if (!USE_PG) { const { pushUserLeadsToTurso } = require('../services/tursoSync'); await pushUserLeadsToTurso(db); } } catch {} });
      return res.end();
    }

    // Broadened search
    {
      const bConds = ["email IS NOT NULL AND email != '' AND (email_corrupt IS NULL OR email_corrupt = 0)"]; const bParams = [];
      if (keyword) { bConds.push('(channel_name LIKE ? OR channel_description LIKE ? OR niche LIKE ?)'); bParams.push(`%${keyword}%`,`%${keyword}%`,`%${keyword}%`); }
      const bExclude = (await db.all(`SELECT channel_id FROM leads WHERE user_id=? AND channel_id IS NOT NULL`, [req.user.id])).map(r => r.channel_id);
      let bWhere = bConds.join(' AND '); const bAll = [...bParams];
      if (bExclude.length > 0) { bWhere += ` AND channel_id NOT IN (${bExclude.map(() => '?').join(',')})`; bAll.push(...bExclude); }
      const bCount = await db.get(`SELECT COUNT(*) as c FROM master_leads WHERE ${bWhere}`, bAll);
      if (bCount.c > 0) {
        send({ type: 'progress', stage: 'search', message: `Found ${bCount.c} related leads...` });
        const bLeads = await db.all(`SELECT * FROM master_leads WHERE ${bWhere} ORDER BY lead_score DESC, subscriber_count DESC LIMIT ?`, [...bAll, Number(maxResults)]);
        let s2 = 0;
        for (const l of bLeads) {
          try { const r = await db.run(`INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,avg_views,email,website,channel_description,lead_score,temperature,crm_stage,country,niche) VALUES (?,'youtube',?,?,?,?,?,?,?,?,?,?,'new_lead',?,?) ON CONFLICT DO NOTHING`, [req.user.id,l.channel_id,l.channel_name,l.channel_handle,l.subscriber_count,l.avg_views,l.email,l.website,l.channel_description,l.lead_score,l.temperature,l.country,l.niche]); if (r.changes > 0) s2++; } catch {}
        }
        if (bLeads.length > 0) {
          const ul2 = await db.all(`SELECT * FROM leads WHERE user_id=? AND channel_id IN (${bLeads.map(() => '?').join(',')}) ORDER BY lead_score DESC`, [req.user.id, ...bLeads.map(l => l.channel_id)]);
          for (const lead of ul2) send({ type: 'lead', lead, source: 'database' });
          send({ type: 'done', total: ul2.length, saved: s2, source: 'database', message: `Delivered ${ul2.length} leads instantly` });
        }
        return res.end();
      }
    }

    send({ type: 'complete', leads: [], added: 0, message: `No leads found for "${keyword}" — try a broader keyword` });
    return res.end();
  } catch (e) { send({ type: 'error', message: e.message || 'Scrape failed' }); }
  res.end();
}));

// POST /api/leads/scrape/youtube
router.post('/scrape/youtube', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword, minSubs = 1000, maxSubs = 500000, country, maxResults = 50, minViews = 100, emailOnly = false } = req.body;
  if (!keyword) return res.status(400).json({ success: false, error: 'keyword is required' });

  const usageCheck = await checkUsageLimit(req.user, 'leads');
  if (!usageCheck.allowed) return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}).` });

  const db = getDb();
  const blacklistKeywords = JSON.parse(getSetting('blacklist_keywords') || '[]');
  const blacklistChannels = JSON.parse(getSetting('blacklist_channels') || '[]');
  const keywords = await expandKeywords(keyword);
  logActivity('scrape_started', `YouTube scrape: "${keyword}" (${keywords.length} variations)`, null, {}, req.user.id);

  let channels;
  const perKw = Math.max(15, Math.ceil((maxResults * 2) / keywords.length));
  try { channels = await ytSearchMulti(keywords, { minSubs, maxSubs, country, maxResults: perKw, emailOnly, minViews: 0 }); }
  catch (ytErr) {
    const isQuota = ytErr.response?.status === 429 || (ytErr.message || '').toLowerCase().includes('quota');
    if (isQuota) {
      try { channels = await itSearchMulti(keywords, { minSubs, maxSubs, maxResults: perKw, emailOnly, minViews: 0 }); }
      catch { return res.status(429).json({ success: false, error_code: 'quota_exhausted', error: 'YouTube API quota exhausted.' }); }
    } else { throw ytErr; }
  }

  let added = 0, skipped = 0;
  const results = [];

  for (const ch of channels) {
    if (minViews > 0 && ch.avg_views < minViews) { skipped++; continue; }
    if (emailOnly && !ch.email) { skipped++; continue; }
    if (blacklistChannels.includes(ch.channel_id)) { skipped++; continue; }
    if (blacklistKeywords.some(kw => ch.channel_name.toLowerCase().includes(kw.toLowerCase()))) { skipped++; continue; }
    const existing = await db.get('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?', [ch.channel_id, req.user.id]);
    if (existing) { skipped++; continue; }

    const insertSql = `INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,total_videos,avg_views,avg_likes,avg_comments,engagement_rate,upload_frequency_days,last_upload_date,channel_description,channel_tags,recent_videos,most_viewed_video,country,email,website,social_links,pain_points,lead_score,temperature,niche,thumbnail_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ${USE_PG ? 'ON CONFLICT DO NOTHING' : 'OR IGNORE'} ${USE_PG ? 'RETURNING id' : ''}`;
    try {
      const r = await db.run(insertSql, [req.user.id,ch.platform||'youtube',ch.channel_id,ch.channel_name,ch.channel_handle,ch.subscriber_count||0,ch.total_videos||0,ch.avg_views||0,ch.avg_likes||0,ch.avg_comments||0,ch.engagement_rate||0,ch.upload_frequency_days||0,ch.last_upload_date||null,ch.channel_description||null,typeof ch.channel_tags==='string'?ch.channel_tags:JSON.stringify(ch.channel_tags||[]),typeof ch.recent_videos==='string'?ch.recent_videos:JSON.stringify(ch.recent_videos||[]),typeof ch.most_viewed_video==='string'?ch.most_viewed_video:JSON.stringify(ch.most_viewed_video||{}),ch.country||null,ch.email||null,ch.website||null,typeof ch.social_links==='string'?ch.social_links:JSON.stringify(ch.social_links||{}),typeof ch.pain_points==='string'?ch.pain_points:JSON.stringify(ch.pain_points||[]),ch.lead_score||0,ch.temperature||'cold',keyword,ch.thumbnail_url||null]);
      if (r.changes > 0) { ch.id = r.lastID; results.push(ch); added++; logActivity('lead_found', `Found: ${ch.channel_name}`, ch.id, { platform: 'youtube', niche: keyword }, req.user.id); }
      else { skipped++; }
    } catch { skipped++; }
  }

  if (added > 0) await incrementUsage(req.user.id, 'leads', added);
  res.json({ success: true, added, skipped, total: channels.length, leads: results.map(parseLead) });
}));

// POST /api/leads/scrape/reddit
router.post('/scrape/reddit', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword = 'video editing help', subreddits, limit = 30 } = req.body;
  const usageCheck = await checkUsageLimit(req.user, 'leads');
  if (!usageCheck.allowed) return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}).` });

  const db = getDb();
  logActivity('scrape_started', `Reddit scrape started for keyword: ${keyword}`, null, {}, req.user.id);
  const posts = await searchPosts(keyword, subreddits, limit);
  let added = 0, skipped = 0;
  const results = [];

  for (const post of posts) {
    const existing = await db.get('SELECT id FROM leads WHERE reddit_username = ? AND user_id = ?', [post.reddit_username, req.user.id]);
    if (existing) { skipped++; continue; }
    const insertSql = `INSERT INTO leads (user_id,platform,channel_name,reddit_username,reddit_post_title,reddit_post_content,reddit_subreddit,channel_id,email,website,pain_points,lead_score,temperature) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ${USE_PG ? 'RETURNING id' : ''}`;
    const r = await db.run(insertSql, [req.user.id,'reddit',post.channel_name,post.reddit_username,post.reddit_post_title,post.reddit_post_content,post.reddit_subreddit,post.channel_id||null,null,post.website||null,post.pain_points||'[]',post.lead_score||40,post.temperature||'warm']);
    post.id = r.lastID;
    results.push(post);
    added++;
    logActivity('lead_found', `Found Reddit lead: u/${post.reddit_username} in r/${post.reddit_subreddit}`, r.lastID, { platform: 'reddit' }, req.user.id);
  }

  if (added > 0) await incrementUsage(req.user.id, 'leads', added);
  res.json({ success: true, added, skipped, total: posts.length, leads: results });
}));

router.post('/bulk-action', asyncHandler(async (req, res) => {
  const { action, ids } = req.body;
  if (!action || !ids?.length) return res.status(400).json({ success: false, error: 'action and ids required' });
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  if (action === 'delete') {
    await db.run(`DELETE FROM leads WHERE id IN (${placeholders}) AND user_id = ?`, [...ids, req.user.id]);
    return res.json({ success: true, affected: ids.length });
  }
  if (action === 'move_stage') {
    const { stage } = req.body;
    if (!stage) return res.status(400).json({ success: false, error: 'stage required' });
    await db.run(`UPDATE leads SET crm_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND user_id = ?`, [stage, ...ids, req.user.id]);
    return res.json({ success: true, affected: ids.length });
  }
  res.status(400).json({ success: false, error: 'Unknown action' });
}));

function getSetting(key) { return require('../models/database').getSetting(key); }

const { requireAdmin } = require('../middleware/requireAuth');

router.post('/master/bulk-import', requireAdmin, asyncHandler(async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ success: false, error: 'leads array required' });
  const db = getDb();
  let inserted = 0;
  for (const l of leads) {
    try {
      const r = await db.run(`INSERT INTO master_leads (channel_id,channel_name,channel_handle,subscriber_count,avg_views,email,website,channel_description,lead_score,temperature,country,niche) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
        [l.channel_id,l.channel_name,l.channel_handle||null,l.subscriber_count||0,l.avg_views||0,l.email||null,l.website||null,l.channel_description||null,l.lead_score||50,l.temperature||'warm',l.country||null,l.niche||null]);
      if (r.changes > 0) inserted++;
    } catch {}
  }
  const total = (await db.get('SELECT COUNT(*) as c FROM master_leads')).c;
  res.json({ success: true, inserted, total });
}));

// Kicks off the rate-limited video-data backfill (services/videoBackfillService.js)
// for every existing lead missing recent_videos/recent_video_title. Fire-and-forget —
// runs in this server process, safe to trigger from an admin session with no
// Railway CLI/SSH access needed. Poll the status route for progress.
router.post('/admin/backfill-video-data', requireAdmin, asyncHandler(async (req, res) => {
  const { runVideoBackfill, getBackfillStatus } = require('../services/videoBackfillService');
  const current = getBackfillStatus();
  if (current.running) return res.json({ success: true, message: 'Already running', status: current });
  runVideoBackfill({}).catch(e => console.error('[VideoBackfill] crashed:', e.message));
  res.json({ success: true, message: 'Backfill started', status: getBackfillStatus() });
}));

router.get('/admin/backfill-video-data/status', requireAdmin, asyncHandler(async (req, res) => {
  const { getBackfillStatus } = require('../services/videoBackfillService');
  res.json({ success: true, status: getBackfillStatus() });
}));

router.post('/admin/backfill-video-data/stop', requireAdmin, asyncHandler(async (req, res) => {
  const { stopBackfill, getBackfillStatus } = require('../services/videoBackfillService');
  stopBackfill();
  res.json({ success: true, status: getBackfillStatus() });
}));

// Video data goes stale fast and master_leads is a shared pool (2,000+
// channels) — refreshing it continuously would burn API quota keeping
// channels fresh that nobody has claimed yet. Instead, fetch live the moment
// a user actually copies a lead into their own list, so quota is only spent
// on leads someone wants, and the data is as fresh as the claim itself.
// Runs after the response is sent — never blocks the master-pool request,
// which is exactly the kind of synchronous per-lead API work that caused the
// original 524 timeout bug in pitch generation.
async function enrichNewLeadsInBackground(db, newLeads) {
  const { fetchVideoData, applyVideoDataToLead, isQuotaExhausted } = require('../services/youtubeService');
  const CONCURRENCY = 3;
  for (let i = 0; i < newLeads.length; i += CONCURRENCY) {
    if (isQuotaExhausted()) {
      console.warn(`[MasterCopy] YouTube quota exhausted — leaving ${newLeads.length - i} lead(s) unenriched for a later retry`);
      break;
    }
    const batch = newLeads.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async lead => {
      try {
        const result = await fetchVideoData(lead.channel_id);
        await applyVideoDataToLead(db, lead.id, result);
      } catch (e) {
        console.warn(`[MasterCopy] Enrichment failed for lead ${lead.id} (${lead.channel_name}):`, e.message);
      }
    }));
  }
}

router.get('/master', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { niche, min_subs = 1000, max_subs = 10000000, email_only = false, country, limit = 50, offset = 0 } = req.query;
  const total = await db.get('SELECT COUNT(*) as c FROM master_leads');
  if (!total.c) return res.json({ success: true, leads: [], total: 0, master_total: 0, message: 'Master database is still being built.' });

  const usageCheck = await checkUsageLimit(req.user, 'leads');
  if (!usageCheck.allowed) {
    return res.status(403).json({ success: false, error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}).`, upgradeRequired: true });
  }

  // Never copy a row whose email is flagged as an image/asset-filename artifact
  // (see purgeCorruptEmails.js) — rows with no email at all are still fine to serve.
  const conditions = ['(email_corrupt IS NULL OR email_corrupt = 0)']; const params = [];
  if (niche)     { conditions.push('niche LIKE ?'); params.push(`%${niche}%`); }
  if (min_subs)  { conditions.push('subscriber_count >= ?'); params.push(Number(min_subs)); }
  if (max_subs)  { conditions.push('subscriber_count <= ?'); params.push(Number(max_subs)); }
  if (email_only === 'true') { conditions.push("email IS NOT NULL AND email != ''"); }
  if (country)   { conditions.push('country = ?'); params.push(country); }
  const where = conditions.join(' AND ');

  const masterLeads = await db.all(`SELECT * FROM master_leads WHERE ${where} ORDER BY lead_score DESC, subscriber_count DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
  let copied = 0;
  const newlyAdded = [];
  for (const l of masterLeads) {
    try {
      const r = await db.run(`INSERT INTO leads (user_id,platform,channel_id,channel_name,channel_handle,subscriber_count,avg_views,email,website,channel_description,lead_score,temperature,crm_stage,country,niche) VALUES (?,'youtube',?,?,?,?,?,?,?,?,?,?,'new_lead',?,?) ON CONFLICT DO NOTHING ${USE_PG ? 'RETURNING id' : ''}`,
        [uid,l.channel_id,l.channel_name,l.channel_handle,l.subscriber_count,l.avg_views,l.email,l.website,l.channel_description,l.lead_score,l.temperature,l.country,l.niche]);
      if (r.changes > 0) {
        copied++;
        if (r.lastID) newlyAdded.push({ id: r.lastID, channel_id: l.channel_id, channel_name: l.channel_name });
      }
    } catch {}
  }
  const userLeads = masterLeads.length
    ? await db.all(`SELECT * FROM leads WHERE user_id=? AND channel_id IN (${masterLeads.map(() => '?').join(',')}) ORDER BY lead_score DESC`, [uid, ...masterLeads.map(l => l.channel_id)])
    : [];
  const masterCount = (await db.get(`SELECT COUNT(*) as c FROM master_leads WHERE ${where}`, params)).c;
  res.json({ success: true, leads: userLeads, total: masterCount, master_total: total.c, copied });

  if (copied > 0) incrementUsage(req.user.id, 'leads', copied).catch(() => {});
  if (newlyAdded.length) enrichNewLeadsInBackground(db, newlyAdded).catch(() => {});
}));

router.get('/master/stats', asyncHandler(async (req, res) => {
  const db = getDb();
  const total     = await db.get('SELECT COUNT(*) as c FROM master_leads');
  const withEmail = await db.get("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''");
  const niches    = await db.all(`SELECT niche, COUNT(*) as count FROM master_leads WHERE niche IS NOT NULL GROUP BY niche ORDER BY count DESC LIMIT 12`);
  res.json({ success: true, total: total.c, withEmail: withEmail.c, niches });
}));

module.exports = router;
