const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { scrapeLimiter } = require('../middleware/rateLimiter');
const { searchChannels } = require('../services/youtubeService');
const { searchPosts } = require('../services/redditService');

const ENV_PATH = path.join(__dirname, '../../../.env');

// Use Claude to rewrite the keyword into one optimised for finding video editing clients
async function smartKeyword(rawKeyword) {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'placeholder') return rawKeyword;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `I run a video editing agency targeting YouTube creators. Given the niche keyword "${rawKeyword}", write ONE optimised YouTube search query (4-8 words) that finds solo YouTubers in this niche who clearly need professional video editing. Return only the search query, no quotes, no explanation.`,
      }],
    });
    const result = r.content[0]?.text?.trim().replace(/^["']|["']$/g, '') || rawKeyword;
    console.log(`[Smart keyword] "${rawKeyword}" → "${result}"`);
    return result;
  } catch (e) {
    console.log(`[Smart keyword] Claude unavailable, using raw keyword: ${e.message}`);
    return rawKeyword;
  }
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
    ? db.prepare('SELECT id FROM leads WHERE channel_id = ?').get(data.channel_id)
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

  logActivity('lead_added', `New lead added: ${data.channel_name}`, result.lastInsertRowid);
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

// POST /api/leads/scrape/youtube
router.post('/scrape/youtube', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword, minSubs = 5000, maxSubs = 200000, country, maxResults = 50, minViews = 1000, emailOnly = true } = req.body;
  if (!keyword) return res.status(400).json({ success: false, error: 'keyword is required' });

  const db = getDb();
  const blacklistKeywords = JSON.parse(getSetting('blacklist_keywords') || '[]');
  const blacklistChannels = JSON.parse(getSetting('blacklist_channels') || '[]');

  const optimisedKeyword = await smartKeyword(keyword);
  logActivity('scrape_started', `YouTube scrape: "${keyword}" → "${optimisedKeyword}"`);

  let channels;
  try {
    channels = await searchChannels({ keyword: optimisedKeyword, minSubs, maxSubs, country, maxResults, emailOnly });
  } catch (e) {
    const ytErr = e.response?.data?.error;
    if (ytErr?.errors?.[0]?.reason === 'quotaExceeded') {
      return res.status(429).json({ success: false, error: 'YouTube API quota exceeded for today. Resets at midnight Pacific Time. Try again tomorrow or use a different API key in Settings.' });
    }
    throw e;
  }

  let added = 0, skipped = 0;
  const results = [];

  for (const ch of channels) {
    // Check blacklists
    if (blacklistChannels.includes(ch.channel_id)) { skipped++; continue; }
    if (blacklistKeywords.some(kw => ch.channel_name.toLowerCase().includes(kw.toLowerCase()))) { skipped++; continue; }

    // Check min views
    if (ch.avg_views < minViews) { skipped++; continue; }

    // Deduplication
    const existing = db.prepare('SELECT id FROM leads WHERE channel_id = ?').get(ch.channel_id);
    if (existing) { skipped++; continue; }

    const stmt = db.prepare(`
      INSERT INTO leads (
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

    const r = stmt.run({ ...ch, niche: keyword, user_id: req.user.id });
    ch.id = r.lastInsertRowid;
    results.push(ch);
    added++;

    logActivity('lead_found', `Found new lead: ${ch.channel_name} (${ch.subscriber_count?.toLocaleString()} subs) from YouTube`, ch.id, { platform: 'youtube', niche: keyword });
  }

  res.json({ success: true, added, skipped, total: channels.length, leads: results.map(parseLead) });
}));

// POST /api/leads/scrape/reddit
router.post('/scrape/reddit', scrapeLimiter, asyncHandler(async (req, res) => {
  const { keyword = 'video editing help', subreddits, limit = 30 } = req.body;
  const db = getDb();

  logActivity('scrape_started', `Reddit scrape started for keyword: ${keyword}`);

  const posts = await searchPosts(keyword, subreddits, limit);

  let added = 0, skipped = 0;
  const results = [];

  for (const post of posts) {
    const existing = db.prepare('SELECT id FROM leads WHERE reddit_username = ?').get(post.reddit_username);
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

    logActivity('lead_found', `Found Reddit lead: u/${post.reddit_username} in r/${post.reddit_subreddit}`, r.lastInsertRowid, { platform: 'reddit' });
  }

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

// GET /api/leads/export/csv
router.get('/export/csv', asyncHandler(async (req, res) => {
  const db = getDb();
  const leads = db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

  const headers = ['id', 'channel_name', 'platform', 'subscriber_count', 'avg_views', 'engagement_rate',
    'temperature', 'lead_score', 'email', 'website', 'crm_stage', 'niche', 'country', 'created_at'];

  const csv = [
    headers.join(','),
    ...leads.map(l => headers.map(h => `"${(l[h] || '').toString().replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(csv);
}));

function getSetting(key) {
  return require('../models/database').getSetting(key);
}

module.exports = router;
