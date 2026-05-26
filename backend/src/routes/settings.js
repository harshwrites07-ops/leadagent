const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb, getSetting, setSetting, getUserById } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

const ENV_PATH = path.join(__dirname, '../../../.env');

function writeToEnv(key, value) {
  const sanitized = String(value).replace(/[\r\n]/g, '');
  let content = '';
  try { content = fs.readFileSync(ENV_PATH, 'utf8'); } catch { content = ''; }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  content = regex.test(content)
    ? content.replace(regex, `${key}=${sanitized}`)
    : content + `\n${key}=${sanitized}\n`;
  fs.writeFileSync(ENV_PATH, content, 'utf8');
  process.env[key] = sanitized;
}

// ── USER SETTINGS ─────────────────────────────────────────────────────────────

// GET /api/settings/me — user profile + preferences
router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    profile: {
      full_name: u.full_name || '',
      agency_name: u.agency_name || '',
      role: u.role || 'Video Editor',
      target_niches: (() => { try { return JSON.parse(u.target_niches || '[]'); } catch { return []; } })(),
      portfolio_url: u.portfolio_url || '',
      best_result: u.best_result || '',
      pricing_range: u.pricing_range || '$500-$2000/month',
    },
    preferences: {
      email_tone: u.email_tone || 'casual',
      outreach_goal: u.outreach_goal || 'get_reply',
      daily_email_limit: u.daily_email_limit || 150,
      min_email_delay: u.min_email_delay || 45,
      max_email_delay: u.max_email_delay || 120,
      followups_enabled: u.followups_enabled !== 0,
      max_followups: u.max_followups || 3,
      followup_delay_days: u.followup_delay_days || 3,
    },
    plan: {
      name: u.plan || 'free',
      status: u.plan_status || 'active',
      leads_used: u.leads_used_this_month || 0,
      emails_used: u.emails_used_this_month || 0,
      usage_reset_date: u.usage_reset_date,
    },
  });
});

// PUT /api/settings/me — save profile + preferences
router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const { profile, preferences } = req.body;
  const userId = req.user.id;
  const fields = {};

  if (profile) {
    if (profile.full_name !== undefined)     fields.full_name = profile.full_name;
    if (profile.agency_name !== undefined)   fields.agency_name = profile.agency_name;
    if (profile.role !== undefined)          fields.role = profile.role;
    if (profile.target_niches !== undefined) fields.target_niches = JSON.stringify(profile.target_niches);
    if (profile.portfolio_url !== undefined) fields.portfolio_url = profile.portfolio_url;
    if (profile.best_result !== undefined)   fields.best_result = String(profile.best_result).substring(0, 200);
    if (profile.pricing_range !== undefined) fields.pricing_range = profile.pricing_range;
  }

  if (preferences) {
    if (preferences.email_tone !== undefined)        fields.email_tone = preferences.email_tone;
    if (preferences.outreach_goal !== undefined)     fields.outreach_goal = preferences.outreach_goal;
    if (preferences.daily_email_limit !== undefined) fields.daily_email_limit = parseInt(preferences.daily_email_limit) || 150;
    if (preferences.min_email_delay !== undefined)   fields.min_email_delay = parseInt(preferences.min_email_delay) || 45;
    if (preferences.max_email_delay !== undefined)   fields.max_email_delay = parseInt(preferences.max_email_delay) || 120;
    if (preferences.followups_enabled !== undefined) fields.followups_enabled = preferences.followups_enabled ? 1 : 0;
    if (preferences.max_followups !== undefined)     fields.max_followups = parseInt(preferences.max_followups) || 3;
    if (preferences.followup_delay_days !== undefined) fields.followup_delay_days = parseInt(preferences.followup_delay_days) || 3;
  }

  if (Object.keys(fields).length === 0) return res.json({ success: true, message: 'Nothing to update' });

  const setClauses = Object.keys(fields).map(k => `${k}=?`).join(', ');
  db.prepare(`UPDATE users SET ${setClauses} WHERE id=?`).run(...Object.values(fields), userId);

  res.json({ success: true, message: 'Settings saved' });
}));

// ── ADMIN-ONLY SETTINGS ───────────────────────────────────────────────────────

const ADMIN_SETTING_KEYS = [
  'daily_send_limit', 'email_delay_min', 'email_delay_max', 'followup_delay_days', 'max_followups',
  'auto_scrape', 'auto_generate_pitches', 'auto_queue_emails', 'auto_followup',
  'tone_preference', 'offer_type', 'risk_reversal',
  'agency_name', 'your_name', 'your_role', 'portfolio_url', 'pricing_range',
  'target_niches', 'case_studies', 'services_description',
  'blacklist_keywords', 'blacklist_channels', 'average_deal_value',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_name', 'smtp_inboxes',
  'youtube_api_key', 'gemini_api_key', 'reddit_client_id', 'reddit_client_secret',
  'queue_paused',
];

// GET /api/settings (admin only)
router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = (row.value && (row.value.startsWith('[') || row.value.startsWith('{')))
        ? JSON.parse(row.value) : row.value;
    } catch { settings[row.key] = row.value; }
  }
  delete settings.smtp_pass;
  for (let i = 1; i <= 4; i++) { if (settings[`smtp_pass_${i}`]) settings[`smtp_pass_${i}`] = '••••••••'; }
  res.json({ success: true, settings });
}));

// PUT /api/settings (admin only)
router.put('/', requireAdmin, asyncHandler(async (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    if (!ADMIN_SETTING_KEYS.includes(key)) continue;
    setSetting(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  if (updates.youtube_api_key)      writeToEnv('YOUTUBE_API_KEY',       updates.youtube_api_key);
  if (updates.gemini_api_key)       writeToEnv('GEMINI_API_KEY',        updates.gemini_api_key);
  if (updates.reddit_client_id)     writeToEnv('REDDIT_CLIENT_ID',      updates.reddit_client_id);
  if (updates.reddit_client_secret) writeToEnv('REDDIT_CLIENT_SECRET',  updates.reddit_client_secret);
  if (updates.smtp_pass) {
    const { resetTransporter } = require('../services/emailService');
    writeToEnv('SMTP_PASS', updates.smtp_pass);
    resetTransporter();
  }
  for (let i = 1; i <= 4; i++) {
    if (updates[`smtp_pass_${i}`]) {
      const { resetTransporter } = require('../services/emailService');
      writeToEnv(`SMTP_PASS_${i}`, updates[`smtp_pass_${i}`]);
      resetTransporter();
    }
  }
  res.json({ success: true, message: 'Settings saved.' });
}));

// POST /api/settings/test/youtube (admin only)
router.post('/test/youtube', requireAdmin, asyncHandler(async (req, res) => {
  const { testApiKey } = require('../services/youtubeService');
  const key = req.body.key || process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ ok: false, error: 'No key provided' });
  if (req.body.key) process.env.YOUTUBE_API_KEY = req.body.key;
  res.json(await testApiKey(key));
}));

// POST /api/settings/test/reddit (admin only)
router.post('/test/reddit', requireAdmin, asyncHandler(async (req, res) => {
  const { testCredentials } = require('../services/redditService');
  if (req.body.client_id) process.env.REDDIT_CLIENT_ID = req.body.client_id;
  if (req.body.client_secret) process.env.REDDIT_CLIENT_SECRET = req.body.client_secret;
  res.json(await testCredentials());
}));

// POST /api/settings/test/smtp (admin only)
router.post('/test/smtp', requireAdmin, asyncHandler(async (req, res) => {
  const { testSmtp } = require('../services/emailService');
  const config = {
    host: req.body.host || getSetting('smtp_host') || 'smtp.gmail.com',
    port: req.body.port || getSetting('smtp_port') || 587,
    user: req.body.user || getSetting('smtp_user'),
    pass: req.body.pass || process.env.SMTP_PASS,
  };
  res.json(await testSmtp(config));
}));

// GET /api/settings/inboxes (admin only)
router.get('/inboxes', requireAdmin, asyncHandler(async (req, res) => {
  const { getInboxes } = require('../services/emailService');
  const inboxes = getInboxes().map((inbox, i) => ({
    index: i + 1, email: inbox.email, from_name: inbox.from_name,
    host: inbox.host, port: inbox.port, configured: true,
  }));
  res.json({ success: true, inboxes, total: inboxes.length, capacity: inboxes.length * 150 });
}));

// POST /api/settings/inboxes (admin only)
router.post('/inboxes', requireAdmin, asyncHandler(async (req, res) => {
  const { testSmtp, resetTransporter } = require('../services/emailService');
  const { email, from_name, host = 'smtp.gmail.com', port = 587, pass } = req.body;
  if (!email || !pass) return res.status(400).json({ ok: false, error: 'email and pass required' });
  const test = await testSmtp({ host, port, user: email, pass });
  if (!test.ok) return res.status(400).json({ ok: false, error: `SMTP test failed: ${test.error}` });
  let inboxes = [];
  const raw = getSetting('smtp_inboxes');
  if (raw) { try { inboxes = JSON.parse(raw); } catch {} }
  const existingIdx = inboxes.findIndex(i => i.email === email);
  const inboxConfig = { email, from_name: from_name || email.split('@')[0], host, port };
  if (existingIdx >= 0) inboxes[existingIdx] = inboxConfig;
  else inboxes.push(inboxConfig);
  const idx = inboxes.findIndex(i => i.email === email) + 1;
  setSetting('smtp_inboxes', JSON.stringify(inboxes));
  writeToEnv(`SMTP_PASS_${idx}`, pass);
  if (idx === 1) writeToEnv('SMTP_PASS', pass);
  resetTransporter();
  res.json({ success: true, message: `Inbox ${email} saved (${inboxes.length} total).` });
}));

// DELETE /api/settings/inboxes/:email (admin only)
router.delete('/inboxes/:email', requireAdmin, asyncHandler(async (req, res) => {
  const { resetTransporter } = require('../services/emailService');
  let inboxes = [];
  const raw = getSetting('smtp_inboxes');
  if (raw) { try { inboxes = JSON.parse(raw); } catch {} }
  inboxes = inboxes.filter(i => i.email !== req.params.email);
  setSetting('smtp_inboxes', JSON.stringify(inboxes));
  resetTransporter();
  res.json({ success: true, message: `Inbox removed. ${inboxes.length} remaining.` });
}));

module.exports = router;
