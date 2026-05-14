const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb, getSetting, setSetting } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { testApiKey } = require('../services/youtubeService');
const { testCredentials: testReddit } = require('../services/redditService');
const { testKey: testClaude } = require('../services/claudeService');
const { testSmtp, resetTransporter, getInboxes } = require('../services/emailService');

const ENV_PATH = path.join(__dirname, '../../../.env');

function writeToEnv(key, value) {
  let content = '';
  try { content = fs.readFileSync(ENV_PATH, 'utf8'); } catch { content = ''; }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  content = regex.test(content)
    ? content.replace(regex, `${key}=${value}`)
    : content + `\n${key}=${value}\n`;
  fs.writeFileSync(ENV_PATH, content, 'utf8');
  process.env[key] = value;
}

const SETTING_KEYS = [
  'daily_send_limit', 'email_delay_min', 'email_delay_max', 'followup_delay_days', 'max_followups',
  'auto_scrape', 'auto_generate_pitches', 'auto_queue_emails', 'auto_followup',
  'tone_preference', 'offer_type', 'risk_reversal',
  'agency_name', 'your_name', 'your_role', 'portfolio_url', 'pricing_range',
  'target_niches', 'case_studies', 'services_description',
  'blacklist_keywords', 'blacklist_channels', 'average_deal_value',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_name', 'smtp_inboxes',
  // API keys — stored in DB so Settings page changes take effect immediately
  'youtube_api_key', 'anthropic_api_key', 'reddit_client_id', 'reddit_client_secret',
];

// GET /api/settings
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    // Parse JSON fields
    try {
      if (row.value && (row.value.startsWith('[') || row.value.startsWith('{'))) {
        settings[row.key] = JSON.parse(row.value);
      } else {
        settings[row.key] = row.value;
      }
    } catch {
      settings[row.key] = row.value;
    }
  }
  // Never return password
  delete settings.smtp_pass;
  res.json({ success: true, settings });
}));

// PUT /api/settings
router.put('/', asyncHandler(async (req, res) => {
  const updates = req.body;

  for (const [key, value] of Object.entries(updates)) {
    if (!SETTING_KEYS.includes(key)) continue;
    const stored = typeof value === 'object' ? JSON.stringify(value) : String(value);
    setSetting(key, stored);
  }

  // Write API keys to .env so they persist and getKey() picks them up without restart
  if (updates.youtube_api_key)      writeToEnv('YOUTUBE_API_KEY',       updates.youtube_api_key);
  if (updates.anthropic_api_key)    writeToEnv('ANTHROPIC_API_KEY',     updates.anthropic_api_key);
  if (updates.reddit_client_id)     writeToEnv('REDDIT_CLIENT_ID',      updates.reddit_client_id);
  if (updates.reddit_client_secret) writeToEnv('REDDIT_CLIENT_SECRET',  updates.reddit_client_secret);

  // SMTP pass stored in env only (not DB)
  if (updates.smtp_pass) {
    writeToEnv('SMTP_PASS', updates.smtp_pass);
    resetTransporter();
  }

  // Per-inbox passwords: smtp_pass_1 through smtp_pass_4
  for (let i = 1; i <= 4; i++) {
    if (updates[`smtp_pass_${i}`]) {
      writeToEnv(`SMTP_PASS_${i}`, updates[`smtp_pass_${i}`]);
      resetTransporter();
    }
  }

  const keySaved = !!(updates.youtube_api_key || updates.anthropic_api_key);
  res.json({ success: true, message: keySaved ? 'Key saved and active — no restart needed.' : 'Settings saved.' });
}));

// POST /api/settings/test/youtube
router.post('/test/youtube', asyncHandler(async (req, res) => {
  const key = req.body.key || process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ ok: false, error: 'No YouTube API key provided' });
  if (req.body.key) process.env.YOUTUBE_API_KEY = req.body.key;
  const result = await testApiKey(key);
  res.json(result);
}));

// POST /api/settings/test/reddit
router.post('/test/reddit', asyncHandler(async (req, res) => {
  if (req.body.client_id) process.env.REDDIT_CLIENT_ID = req.body.client_id;
  if (req.body.client_secret) process.env.REDDIT_CLIENT_SECRET = req.body.client_secret;
  const result = await testReddit();
  res.json(result);
}));

// POST /api/settings/test/claude
router.post('/test/claude', asyncHandler(async (req, res) => {
  if (req.body.key) process.env.ANTHROPIC_API_KEY = req.body.key;
  const result = await testClaude();
  res.json(result);
}));

// POST /api/settings/test/smtp
router.post('/test/smtp', asyncHandler(async (req, res) => {
  const config = {
    host: req.body.host || getSetting('smtp_host') || 'smtp.gmail.com',
    port: req.body.port || getSetting('smtp_port') || 587,
    user: req.body.user || getSetting('smtp_user'),
    pass: req.body.pass || process.env.SMTP_PASS,
  };
  const result = await testSmtp(config);
  res.json(result);
}));

// GET /api/settings/inboxes — list configured inboxes (no passwords)
router.get('/inboxes', asyncHandler(async (req, res) => {
  const inboxes = getInboxes().map((inbox, i) => ({
    index: i + 1,
    email: inbox.email,
    from_name: inbox.from_name,
    host: inbox.host,
    port: inbox.port,
    configured: true,
  }));
  res.json({ success: true, inboxes, total: inboxes.length, capacity: inboxes.length * 150 });
}));

// POST /api/settings/inboxes — add or update an inbox
router.post('/inboxes', asyncHandler(async (req, res) => {
  const { email, from_name, host = 'smtp.gmail.com', port = 587, pass } = req.body;
  if (!email || !pass) return res.status(400).json({ ok: false, error: 'email and pass required' });

  // Verify it works before saving
  const test = await testSmtp({ host, port, user: email, pass });
  if (!test.ok) return res.status(400).json({ ok: false, error: `SMTP test failed: ${test.error}` });

  // Update smtp_inboxes array
  let inboxes = [];
  const raw = getSetting('smtp_inboxes');
  if (raw) { try { inboxes = JSON.parse(raw); } catch {} }

  const existingIdx = inboxes.findIndex(i => i.email === email);
  const inboxConfig = { email, from_name: from_name || email.split('@')[0], host, port };

  if (existingIdx >= 0) {
    inboxes[existingIdx] = inboxConfig;
  } else {
    inboxes.push(inboxConfig);
  }

  const idx = inboxes.findIndex(i => i.email === email) + 1; // 1-based

  const { setSetting } = require('../models/database');
  setSetting('smtp_inboxes', JSON.stringify(inboxes));
  writeToEnv(`SMTP_PASS_${idx}`, pass);
  // Also keep legacy SMTP_PASS in sync with inbox 1
  if (idx === 1) writeToEnv('SMTP_PASS', pass);
  resetTransporter();

  res.json({ success: true, message: `Inbox ${email} saved (slot ${idx}). ${inboxes.length} inbox(es) configured — ${inboxes.length * 150}/day capacity.` });
}));

// DELETE /api/settings/inboxes/:email — remove an inbox
router.delete('/inboxes/:email', asyncHandler(async (req, res) => {
  const { setSetting } = require('../models/database');
  let inboxes = [];
  const raw = getSetting('smtp_inboxes');
  if (raw) { try { inboxes = JSON.parse(raw); } catch {} }
  inboxes = inboxes.filter(i => i.email !== req.params.email);
  setSetting('smtp_inboxes', JSON.stringify(inboxes));
  resetTransporter();
  res.json({ success: true, message: `Inbox removed. ${inboxes.length} inbox(es) remaining.` });
}));

module.exports = router;
