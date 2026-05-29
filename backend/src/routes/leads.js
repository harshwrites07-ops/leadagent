const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter } = require('../middleware/rateLimiter');
const { searchChannelsMulti: ytSearchMulti } = require('../services/youtubeService');
const { searchChannelsMulti: itSearchMulti } = require('../services/innertubeService');
const { searchPosts } = require('../services/redditService');
const { checkUsageLimit, incrementUsage } = require('../services/authService');

const ENV_PATH = path.join(__dirname, '../../../.env');

// Use Gemini to rewrite the keyword into one optimised for finding video editing clients
async function smartKeyword(rawKeyword) {
  const { generateWithGemini } = require('../services/geminiService');
  try {
    const result = await generateWithGemini(
      `I run a video editing agency targeting YouTube creators. Given the niche keyword "${rawKeyword}", write ONE optimised YouTube search query (4-8 words) that finds solo YouTubers in this niche who clearly need professional video editing. Return only the search query, no quotes, no explanation.`
    );
    if (!result) return rawKeyword;
    const cleaned = result.trim().replace(/^["']|["']$/g, '');
    console.log(`[Smart keyword] "${rawKeyword}" → "${cleaned}"`);
    return cleaned;
  } catch (e) {
    console.log(`[Smart keyword] Gemini unavailable, using raw keyword: ${e.message}`);
    return rawKeyword;
  }
}

// ─── Keyword expansion presets ────────────────────────────────────────────────
const KEYWORD_EXPANSIONS = {
  'business coach':    ['business coaching', 'entrepreneur coach', 'startup coach', 'business mentor', 'CEO vlog'],
  'fitness':           ['fitness coach', 'personal trainer', 'gym motivation', 'weight loss coach', 'nutrition coach'],
  'finance':           ['personal finance', 'investing for beginners', 'stock market tips', 'financial freedom', 'passive income'],
  'real estate':       ['real estate investing', 'real estate agent', 'property investor', 'house flipping', 'realtor'],
  'health':            ['health coach', 'wellness coach', 'doctor youtube', 'nutritionist channel', 'therapist youtube'],
  'education':         ['online course creator', 'digital educator', 'teach online', 'eLearning channel', 'skills trainer'],
  'saas':              ['SaaS founder', 'software startup', 'tech founder', 'B2B marketing', 'product demo'],
  'marketing':         ['digital marketing', 'social media marketing', 'email marketing tips', 'marketing agency', 'SEO youtube'],
  'wealth':            ['wealth building', 'financial coach', 'money coach', 'investing wealth', 'financial advisor'],
  'crypto':            ['crypto investing', 'bitcoin channel', 'crypto education', 'altcoin channel', 'DeFi youtube'],
  'coaching':          ['life coach youtube', 'mindset coach', 'productivity coach', 'self improvement', 'motivation speaker'],
  'ecommerce':         ['dropshipping youtube', 'Amazon FBA', 'shopify youtube', 'online store', 'ecommerce tips'],
  'law':               ['lawyer youtube', 'attorney tips', 'legal education', 'law firm channel', 'immigration lawyer'],
  'podcast':           ['podcast youtube', 'video podcast', 'interview show', 'talk show youtube', 'business podcast'],
};

async function expandKeywords(keyword) {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const lower = keyword.toLowerCase().trim();

  // Preset map check
  for (const [key, variants] of Object.entries(KEYWORD_EXPANSIONS)) {
    if (lower === key || lower.includes(key) || key.includes(lower)) {
      return [keyword, ...variants.slice(0, 4)];
    }
  }

  // Gemini — fastest
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'placeholder') {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(
        `Give me 4 YouTube search keywords related to "${keyword}" for finding content creators who might need video editing help. Return only the keywords, one per line, no numbering.`
      );
      const lines = result.response.text().trim().split('\n')
        .map(l => l.replace(/^[\d\-\*\•\.]+\s*/, '').trim())
        .filter(l => l.length > 2 && l.length < 60)
        .slice(0, 4);
      if (lines.length > 0) return [keyword, ...lines];
    } catch (e) {
      console.log(`[expandKeywords] Gemini failed: ${e.message}`);
    }
  }

  return [keyword];
}

const JSON_FIELDS = ['pain_points', 'channel_tags', 'recent_videos', 'most_viewed_video', 'social_links'];

function parseLead(lead) {
  if (!lead) return lead;
  const out = { ...lead };
  for (const f of JSON_FIELDS) {
    if (typeof out[f] === 'string') {
      try { out[f] = JSON.parse(out[f]); } catch { out[f] = []; }
    }
  }
  return out;
}

// GET /api/leads - list leads with filters
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    platform, temperature, crm_stage, niche, search,
    sort = 'created_at', order = 'desc', page = 1, limit = 50
  } = req.query;

  let where = ['user_id = ?'];
  const params = [req.user.id];

  if (platform) { where.push('platform = ?'); params.push(platform); }
  if (temperature) { where.push('temperature = ?'); params.push(temperature); }
  if (crm_stage) { where.push('crm_stage = ?'); params.push(crm_stage); }
  if (niche) { where.push('niche LIKE ?'); params.push(`%${niche}%`); }
  if (search) {
    where.push('(channel_name LIKE ? OR email LIKE ? OR reddit_username LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const safeSort = ['created_at', 'lead_score', 'subscriber_count', 'engagement_rate', 'updated_at'].includes(sort) ? sort : 'created_at';
  const safeOrder = order === 'asc' ? 'ASC' : 'DESC';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE ${where.join(' AND ')}`).get(...params);
  const leads = db.prepare(`
    SELECT * FROM leads WHERE ${where.join(' AND ')}
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ success: true, leads: leads.map(parseLead), total: total.count, page: parseInt(page), limit: parseInt(limit) });
}));

// GET /api/leads/export/count — new vs total unexported counts
router.get('/export/count', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const newCount = db.prepare('SELECT COUNT(*) as c FROM leads WHERE user_id = ? AND exported_at IS NULL').get(uid);
  const totalCount = db.prepare('SELECT COUNT(*) as c FROM leads WHERE user_id = ?').get(uid);
  res.json({ success: true, new: newCount.c, total: totalCount.c });
}));

// GET /api/leads/export/csv?filter=new|all
router.get('/export/csv', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { filter = 'new' } = req.query;

  const leads = filter === 'new'
    ? db.prepare('SELECT * FROM leads WHERE user_id = ? AND exported_at IS NULL ORDER BY created_at DESC').all(uid)
    : db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC').all(uid);

  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['Channel Name', 'Subscribers', 'Email', 'Niche', 'Platform', 'Stage', 'Score', 'Upload Frequency (days)', 'Last Contacted', 'Created At'];
  const rows = leads.map(l => [
    l.channel_name, l.subscriber_count, l.email, l.niche,
    l.platform, l.crm_stage, l.lead_score, l.upload_frequency_days,
    l.last_contacted_date, l.created_at,
  ].map(esc).join(','));

  const csv = [header.join(','), ...rows].join('\r\n');

  if (leads.length > 0) {
    const placeholders = leads.map(() => '?').join(',');
    db.prepare(`UPDATE leads SET exported_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`)
      .run(...leads.map(l => l.id), uid);
  }

  const date = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-export-${date}.csv"`);
  res.setHeader('X-Export-Count', String(leads.length));
  res.setHeader('Access-Control-Expose-Headers', 'X-Export-Count');
  res.send(csv);
}));

// GET /api/leads/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = parseLead(db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id));
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(lead.id);
  const emails = db.prepare('SELECT * FROM emails WHERE lead_id = ? ORDER BY created_at DESC').all(lead.id);
  const notes = db.prepare('SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC').all(lead.id);

  res.json({ success: true, lead, pitch, emails, notes });
}));

// POST /api/leads - create lead manually
router.post('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const data = req.body;

  const existing = data.channel_id
    ? db.prepare('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?').get(data.channel_id, req.user.id)
    : null;

  if (existing) {
    return res.status(409).json({ success: false, error: 'Lead already exists', id: existing.id });
  }

  const stmt = db.prepare(`
    INSERT INTO leads (
      user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
      avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
      last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
      country, email, website, social_links, pain_points, lead_score, temperature,
      crm_stage, niche, reddit_username, reddit_post_title, reddit_post_content,
      reddit_subreddit, thumbnail_url
    ) VALUES (
      @user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
      @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
      @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
      @country, @email, @website, @social_links, @pain_points, @lead_score, @temperature,
      @crm_stage, @niche, @reddit_username, @reddit_post_title, @reddit_post_content,
      @reddit_subreddit, @thumbnail_url
    )
  `);

  const result = stmt.run({
    user_id: req.user.id,
    platform: data.platform || 'youtube',
    channel_id: data.channel_id || null,
    channel_name: data.channel_name,
    channel_handle: data.channel_handle || null,
    subscriber_count: data.subscriber_count || 0,
    total_videos: data.total_videos || 0,
    avg_views: data.avg_views || 0,
    avg_likes: data.avg_likes || 0,
    avg_comments: data.avg_comments || 0,
    engagement_rate: data.engagement_rate || 0,
    upload_frequency_days: data.upload_frequency_days || 0,
    last_upload_date: data.last_upload_date || null,
    channel_description: data.channel_description || null,
    channel_tags: typeof data.channel_tags === 'string' ? data.channel_tags : JSON.stringify(data.channel_tags || []),
    recent_videos: typeof data.recent_videos === 'string' ? data.recent_videos : JSON.stringify(data.recent_videos || []),
    most_viewed_video: typeof data.most_viewed_video === 'string' ? data.most_viewed_video : JSON.stringify(data.most_viewed_video || {}),
    country: data.country || null,
    email: data.email || null,
    website: data.website || null,
    social_links: typeof data.social_links === 'string' ? data.social_links : JSON.stringify(data.social_links || {}),
    pain_points: typeof data.pain_points === 'string' ? data.pain_points : JSON.stringify(data.pain_points || []),
    lead_score: data.lead_score || 0,
    temperature: data.temperature || 'cold',
    crm_stage: data.crm_stage || 'new_lead',
    niche: data.niche || null,
    reddit_username: data.reddit_username || null,
    reddit_post_title: data.reddit_post_title || null,
    reddit_post_content: data.reddit_post_content || null,
    reddit_subreddit: data.reddit_subreddit || null,
    thumbnail_url: data.thumbnail_url || null,
  });

  logActivity('lead_added', `New lead added: ${data.channel_name}`, result.lastInsertRowid, {}, req.user.id);
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, lead });
}));

// PUT /api/leads/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  const allowed = ['channel_name', 'email', 'website', 'niche', 'crm_stage', 'temperature', 'lead_score', 'channel_description'];
  const updates = [];
  const vals = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      vals.push(req.body[key]);
    }
  }

  if (!updates.length) return res.json({ success: true, lead });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(req.params.id);
  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  res.json({ success: true, lead: parseLead(updated) });
}));

// DELETE /api/leads/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM leads WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
}));

// POST /api/leads/scrape/youtube/stream — NDJSON streaming with real-time progress
router.post('/scrape/youtube/stream', scrapeLimiter, asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = data => { try { res.write(JSON.stringify(data) + '\n'); } catch {} };

  try {
    const { keyword, minSubs = 1000, maxSubs = 500000, country, maxResults = 50, minViews = 100, emailOnly = false } = req.body;
    if (!keyword) { send({ type: 'error', message: 'keyword is required' }); return res.end(); }

    const usageCheck = checkUsageLimit(req.user, 'leads');
    if (!usageCheck.allowed) {
      send({ type: 'error', message: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}).`, upgradeRequired: true });
      return res.end();
    }

    // Step 1 — Expand keywords
    send({ type: 'progress', stage: 'expand', message: `Generating keyword variations for "${keyword}"...` });
    const keywords = await expandKeywords(keyword);
    send({ type: 'progress', stage: 'search', message: `Searching YouTube for: ${keywords.slice(0, 3).join(', ')}${keywords.length > 3 ? ' +more' : ''}`, keywords });

    // Step 2 — Search all variations (YouTube Data API primary, InnerTube fallback)
    const perKw = Math.max(15, Math.ceil((maxResults * 2.5) / keywords.length));
    let allChannels;

    send({ type: 'progress', stage: 'search', message: `Searching YouTube channels...` });
    console.log(`[SCRAPER] Starting YouTube Data API search — keywords: ${keywords.join(', ')} | minSubs=${minSubs} maxSubs=${maxSubs} emailOnly=${emailOnly}`);
    try {
      allChannels = await ytSearchMulti(keywords, { minSubs, maxSubs, country, maxResults: perKw, emailOnly, minViews: 0 });
      console.log(`[SCRAPER] YouTube Data API returned ${allChannels.length} channels`);
    } catch (ytErr) {
      const isQuota = ytErr.response?.status === 429 || (ytErr.message || '').toLowerCase().includes('quota');
      if (isQuota) {
        console.warn('[SCRAPER] YouTube Data API quota exhausted — falling back to InnerTube');
        send({ type: 'progress', stage: 'fallback', message: 'YouTube API quota reached — using InnerTube fallback...' });
        try {
          allChannels = await itSearchMulti(keywords, {
            minSubs, maxSubs, maxResults: perKw, emailOnly, minViews: 0,
            onProgress: msg => send({ type: 'progress', stage: 'enrich', message: msg }),
          });
          console.log(`[SCRAPER] InnerTube fallback returned ${allChannels.length} channels`);
        } catch (itErr) {
          send({ type: 'error', error_code: 'quota_exhausted', message: 'YouTube API quota exhausted. Resets at midnight Pacific Time.' });
          return res.end();
        }
      } else {
        send({ type: 'error', message: ytErr.message || 'YouTube search failed' });
        return res.end();
      }
    }

    send({ type: 'progress', stage: 'qualify', message: `Found ${allChannels.length} unique channels, qualifying leads...`, found: allChannels.length });

    // Step 3 — Filter + save
    const db = getDb();
    const blacklistKeywords = JSON.parse(getSetting('blacklist_keywords') || '[]');
    const blacklistChannels = JSON.parse(getSetting('blacklist_channels') || '[]');

    let added = 0, skipped = 0;
    const results = [];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO leads (
        user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
        avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
        last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
        country, email, website, social_links, pain_points, lead_score, temperature,
        niche, thumbnail_url
      ) VALUES (
        @user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
        @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
        @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
        @country, @email, @website, @social_links, @pain_points, @lead_score, @temperature,
        @niche, @thumbnail_url
      )
    `);

    for (const ch of allChannels) {
      if (minViews > 0 && ch.avg_views < minViews) { skipped++; continue; }
      if (emailOnly && !ch.email) { skipped++; continue; }
      if (blacklistChannels.includes(ch.channel_id)) { skipped++; continue; }
      if (blacklistKeywords.some(kw => ch.channel_name.toLowerCase().includes(kw.toLowerCase()))) { skipped++; continue; }

      const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?').get(ch.channel_id, req.user.id);
      if (existing) { skipped++; continue; }

      const r = stmt.run({ ...ch, niche: keyword, user_id: req.user.id });
      if (r.changes > 0) {
        ch.id = r.lastInsertRowid;
        added++;
        results.push(ch);
        logActivity('lead_found', `Found: ${ch.channel_name} (${(ch.subscriber_count || 0).toLocaleString()} subs)`, ch.id, { platform: 'youtube', niche: keyword }, req.user.id);
      } else { skipped++; }
    }

    if (added > 0) incrementUsage(req.user.id, 'leads', added);
    send({ type: 'complete', added, skipped, total: allChannels.length, leads: results.map(parseLead) });
  } catch (e) {
    send({ type: 'error', message: e.message || 'Scrape failed' });
  }
  res.end();
}));

// POST /api/leads/scrape/youtube
router.post('/scrape/youtube', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword, minSubs = 1000, maxSubs = 500000, country, maxResults = 50, minViews = 100, emailOnly = false } = req.body;
  if (!keyword) return res.status(400).json({ success: false, error: 'keyword is required' });

  const usageCheck = checkUsageLimit(req.user, 'leads');
  if (!usageCheck.allowed) {
    return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan to scrape more leads.` });
  }

  const db = getDb();
  const blacklistKeywords = JSON.parse(getSetting('blacklist_keywords') || '[]');
  const blacklistChannels = JSON.parse(getSetting('blacklist_channels') || '[]');

  const keywords = await expandKeywords(keyword);
  logActivity('scrape_started', `YouTube scrape: "${keyword}" (${keywords.length} variations)`, null, {}, req.user.id);

  let channels;
  const perKw = Math.max(15, Math.ceil((maxResults * 2) / keywords.length));
  try {
    channels = await ytSearchMulti(keywords, { minSubs, maxSubs, country, maxResults: perKw, emailOnly, minViews: 0 });
  } catch (ytErr) {
    const status = ytErr.response?.status;
    const reason = ytErr.response?.data?.error?.errors?.[0]?.reason;
    const isQuota = reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' ||
      status === 429 || (ytErr.message || '').toLowerCase().includes('quota');
    if (isQuota) {
      console.warn('[SCRAPER] YouTube Data API quota exhausted — falling back to InnerTube');
      try {
        channels = await itSearchMulti(keywords, { minSubs, maxSubs, maxResults: perKw, emailOnly, minViews: 0 });
      } catch (itErr) {
        return res.status(429).json({
          success: false,
          error_code: 'quota_exhausted',
          error: 'YouTube API quota exhausted. Daily limit resets at midnight Pacific Time. Try again tomorrow or add more API keys in Settings.',
        });
      }
    } else {
      throw ytErr;
    }
  }

  let added = 0, skipped = 0;
  const results = [];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO leads (
      user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
      avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
      last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
      country, email, website, social_links, pain_points, lead_score, temperature,
      niche, thumbnail_url
    ) VALUES (
      @user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
      @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
      @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
      @country, @email, @website, @social_links, @pain_points, @lead_score, @temperature,
      @niche, @thumbnail_url
    )
  `);

  for (const ch of channels) {
    if (minViews > 0 && ch.avg_views < minViews) { skipped++; continue; }
    if (emailOnly && !ch.email) { skipped++; continue; }
    if (blacklistChannels.includes(ch.channel_id)) { skipped++; continue; }
    if (blacklistKeywords.some(kw => ch.channel_name.toLowerCase().includes(kw.toLowerCase()))) { skipped++; continue; }

    const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?').get(ch.channel_id, req.user.id);
    if (existing) { skipped++; continue; }

    const r = stmt.run({ ...ch, niche: keyword, user_id: req.user.id });
    if (r.changes > 0) {
      ch.id = r.lastInsertRowid;
      results.push(ch);
      added++;
      logActivity('lead_found', `Found: ${ch.channel_name} (${(ch.subscriber_count || 0).toLocaleString()} subs)`, ch.id, { platform: 'youtube', niche: keyword }, req.user.id);
    } else { skipped++; }
  }

  if (added > 0) incrementUsage(req.user.id, 'leads', added);
  res.json({ success: true, added, skipped, total: channels.length, leads: results.map(parseLead) });
}));

// POST /api/leads/scrape/reddit
router.post('/scrape/reddit', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword = 'video editing help', subreddits, limit = 30 } = req.body;

  const usageCheck = checkUsageLimit(req.user, 'leads');
  if (!usageCheck.allowed) {
    return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly lead limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan to scrape more leads.` });
  }

  const db = getDb();

  logActivity('scrape_started', `Reddit scrape started for keyword: ${keyword}`, null, {}, req.user.id);

  const posts = await searchPosts(keyword, subreddits, limit);

  let added = 0, skipped = 0;
  const results = [];

  for (const post of posts) {
    const existing = db.prepare('SELECT id FROM leads WHERE reddit_username = ? AND user_id = ?').get(post.reddit_username, req.user.id);
    if (existing) { skipped++; continue; }

    const stmt = db.prepare(`
      INSERT INTO leads (
        user_id, platform, channel_name, reddit_username, reddit_post_title, reddit_post_content,
        reddit_subreddit, channel_id, email, website, pain_points, lead_score, temperature
      ) VALUES (
        @user_id, @platform, @channel_name, @reddit_username, @reddit_post_title, @reddit_post_content,
        @reddit_subreddit, @channel_id, @email, @website, @pain_points, @lead_score, @temperature
      )
    `);

    const r = stmt.run({
      user_id: req.user.id,
      platform: 'reddit',
      channel_name: post.channel_name,
      reddit_username: post.reddit_username,
      reddit_post_title: post.reddit_post_title,
      reddit_post_content: post.reddit_post_content,
      reddit_subreddit: post.reddit_subreddit,
      channel_id: post.channel_id || null,
      email: null,
      website: post.website || null,
      pain_points: post.pain_points || '[]',
      lead_score: post.lead_score || 40,
      temperature: post.temperature || 'warm',
    });

    post.id = r.lastInsertRowid;
    results.push(post);
    added++;

    logActivity('lead_found', `Found Reddit lead: u/${post.reddit_username} in r/${post.reddit_subreddit}`, r.lastInsertRowid, { platform: 'reddit' }, req.user.id);
  }

  if (added > 0) incrementUsage(req.user.id, 'leads', added);
  res.json({ success: true, added, skipped, total: posts.length, leads: results });
}));

// POST /api/leads/bulk-action
router.post('/bulk-action', asyncHandler(async (req, res) => {
  const { action, ids } = req.body;
  if (!action || !ids?.length) return res.status(400).json({ success: false, error: 'action and ids required' });

  const db = getDb();

  if (action === 'delete') {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM leads WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, req.user.id);
    return res.json({ success: true, affected: ids.length });
  }

  if (action === 'move_stage') {
    const { stage } = req.body;
    if (!stage) return res.status(400).json({ success: false, error: 'stage required for move_stage' });
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE leads SET crm_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND user_id = ?`).run(stage, ...ids, req.user.id);
    return res.json({ success: true, affected: ids.length });
  }

  res.status(400).json({ success: false, error: 'Unknown action' });
}));

function getSetting(key) {
  return require('../models/database').getSetting(key);
}

module.exports = router;
