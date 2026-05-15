const express = require('express');
const router = express.Router();
const { getDb, getSetting, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendEmail, testSmtp, resetTransporter, checkSpamFolders, getInboxes } = require('../services/emailService');

// GET /api/emails — list all emails
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { lead_id, status, page = 1, limit = 50 } = req.query;

  let where = ['1=1'];
  const params = [];

  if (lead_id) { where.push('e.lead_id = ?'); params.push(lead_id); }
  if (status) { where.push('e.status = ?'); params.push(status); }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const emails = db.prepare(`
    SELECT e.*, l.channel_name as lead_name, l.email as lead_email
    FROM emails e
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM emails e WHERE ${where.join(' AND ')}`).get(...params);
  res.json({ success: true, emails, total: total.count });
}));

// GET /api/emails/stats — MUST be before any /:param routes
router.get('/stats', asyncHandler(async (req, res) => {
  const db = getDb();
  const today = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE DATE(sent_at) = DATE('now') AND status='sent'`).get();
  const month = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE strftime('%Y-%m', sent_at) = strftime('%Y-%m','now') AND status='sent'`).get();
  const opens = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE status='opened' OR opened_at IS NOT NULL`).get();
  const replies = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE status='replied' OR replied_at IS NOT NULL`).get();
  const totalSent = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE status='sent' OR sent_at IS NOT NULL`).get();
  const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');

  res.json({
    success: true,
    sent_today: today.count,
    sent_month: month.count,
    daily_limit: dailyLimit,
    daily_remaining: Math.max(0, dailyLimit - today.count),
    total_sent: totalSent.count,
    open_rate: totalSent.count > 0 ? parseFloat(((opens.count / totalSent.count) * 100).toFixed(1)) : 0,
    reply_rate: totalSent.count > 0 ? parseFloat(((replies.count / totalSent.count) * 100).toFixed(1)) : 0,
  });
}));

// GET /api/emails/queue
router.get('/queue', asyncHandler(async (req, res) => {
  const db = getDb();
  const queue = db.prepare(`
    SELECT eq.*, l.channel_name as lead_name, l.email as lead_email, l.thumbnail_url as thumbnail
    FROM email_queue eq
    JOIN leads l ON l.id = eq.lead_id
    WHERE eq.status IN ('pending', 'sending')
    ORDER BY eq.priority DESC, eq.created_at ASC
  `).all();

  const paused = getSetting('queue_paused') === '1';
  res.json({ success: true, queue, paused });
}));

// POST /api/emails/queue — add to queue with lead_id in body (no URL param)
router.post('/queue', asyncHandler(async (req, res) => {
  const db = getDb();
  const { lead_id, subject, body, scheduled_at, priority = 0 } = req.body;
  if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id required' });

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  let finalSubject = subject, finalBody = body;
  if (!finalSubject || !finalBody) {
    const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(lead.id);
    if (!pitch) return res.status(400).json({ success: false, error: 'No pitch found. Generate a pitch first.' });
    finalSubject = finalSubject || pitch.email_subject;
    finalBody = finalBody || pitch.cold_email;
  }

  const result = db.prepare(`
    INSERT INTO email_queue (lead_id, subject, body, status, scheduled_at, priority)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(lead.id, finalSubject, finalBody, scheduled_at || null, priority);

  logActivity('queued', `Email queued for ${lead.channel_name}`, lead.id);
  const item = db.prepare('SELECT * FROM email_queue WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, item });
}));

// POST /api/emails/queue/pause — MUST be before /queue/:leadId
router.post('/queue/pause', asyncHandler(async (req, res) => {
  const { setSetting } = require('../models/database');
  setSetting('queue_paused', '1');
  res.json({ success: true, paused: true });
}));

// POST /api/emails/queue/resume — MUST be before /queue/:leadId
router.post('/queue/resume', asyncHandler(async (req, res) => {
  const { setSetting } = require('../models/database');
  setSetting('queue_paused', '0');
  res.json({ success: true, paused: false });
}));

// POST /api/emails/queue/bulk — add multiple leads to queue
router.post('/queue/bulk', asyncHandler(async (req, res) => {
  const { lead_ids } = req.body;
  if (!lead_ids?.length) return res.status(400).json({ success: false, error: 'lead_ids required' });

  const db = getDb();
  let added = 0, skipped = 0;

  for (const id of lead_ids) {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!lead) { skipped++; continue; }

    const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(id);
    if (!pitch) { skipped++; continue; }

    const existing = db.prepare(`SELECT id FROM email_queue WHERE lead_id = ? AND status = 'pending'`).get(id);
    if (existing) { skipped++; continue; }

    db.prepare(`
      INSERT INTO email_queue (lead_id, subject, body, status)
      VALUES (?, ?, ?, 'pending')
    `).run(id, pitch.email_subject, pitch.cold_email);
    added++;
  }

  res.json({ success: true, added, skipped });
}));

// POST /api/emails/queue/reorder — MUST be before /queue/:leadId
router.post('/queue/reorder', asyncHandler(async (req, res) => {
  const ids = req.body.order || req.body.orderedIds;
  if (!ids?.length) return res.status(400).json({ success: false, error: 'order required' });
  const db = getDb();
  for (let i = 0; i < ids.length; i++) {
    db.prepare('UPDATE email_queue SET priority = ? WHERE id = ?').run(ids.length - i, ids[i]);
  }
  res.json({ success: true });
}));

// POST /api/emails/queue/:leadId — add to queue by URL param
router.post('/queue/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.leadId);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  const { subject, body, scheduled_at, priority = 0 } = req.body;

  let finalSubject = subject, finalBody = body;
  if (!finalSubject || !finalBody) {
    const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(lead.id);
    if (!pitch) return res.status(400).json({ success: false, error: 'No pitch found. Generate pitch first.' });
    finalSubject = finalSubject || pitch.email_subject;
    finalBody = finalBody || pitch.cold_email;
  }

  const result = db.prepare(`
    INSERT INTO email_queue (lead_id, subject, body, status, scheduled_at, priority)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(lead.id, finalSubject, finalBody, scheduled_at || null, priority);

  logActivity('queued', `Email queued for ${lead.channel_name}`, lead.id);
  const item = db.prepare('SELECT * FROM email_queue WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, item });
}));

// DELETE /api/emails/queue/:id
router.delete('/queue/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE email_queue SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(req.params.id);
  res.json({ success: true });
}));

// POST /api/emails/send-now/:queueId
router.post('/send-now/:queueId', asyncHandler(async (req, res) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT eq.*, l.email, l.channel_name
    FROM email_queue eq JOIN leads l ON l.id = eq.lead_id
    WHERE eq.id = ? AND eq.status = 'pending'
  `).get(req.params.queueId);

  if (!item) return res.status(404).json({ success: false, error: 'Queue item not found or already sent' });
  if (!item.email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

  db.prepare(`UPDATE email_queue SET status = 'sending' WHERE id = ?`).run(item.id);

  try {
    const result = await sendEmail({ to: item.email, subject: item.subject, body: item.body, leadId: item.lead_id });
    db.prepare(`UPDATE email_queue SET status='sent', sent_at=CURRENT_TIMESTAMP, email_id=? WHERE id=?`)
      .run(result.emailId, item.id);
    res.json({ success: true, result });
  } catch (e) {
    db.prepare(`UPDATE email_queue SET status='failed' WHERE id=?`).run(item.id);
    throw e;
  }
}));

// GET /api/emails/track/open/:trackingId — tracking pixel
router.get('/track/open/:trackingId', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE emails SET status='opened', opened_at=COALESCE(opened_at, CURRENT_TIMESTAMP)
    WHERE tracking_id=? AND status='sent'
  `).run(req.params.trackingId);

  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': pixel.length, 'Cache-Control': 'no-cache' });
  res.end(pixel);
}));

// POST /api/emails/test-smtp
router.post('/test-smtp', asyncHandler(async (req, res) => {
  const result = await testSmtp(req.body);
  if (result.ok) resetTransporter();
  res.json(result);
}));

// GET /api/emails/spam-report
// Returns: per-inbox bounce-back detections + DB-level spam risk indicators
router.get('/spam-report', asyncHandler(async (req, res) => {
  const db = getDb();
  const inboxes = getInboxes();

  // DB stats per inbox
  const perInbox = inboxes.map(inbox => {
    const sent = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND DATE(sent_at) >= DATE('now','-30 days')`).get(inbox.email);
    const bounced = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND status='bounced' AND DATE(sent_at) >= DATE('now','-30 days')`).get(inbox.email);
    const opened = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND (status='opened' OR opened_at IS NOT NULL) AND DATE(sent_at) >= DATE('now','-30 days')`).get(inbox.email);
    const sentCount = sent?.c || 0;
    const bouncedCount = bounced?.c || 0;
    const openedCount = opened?.c || 0;
    const bounceRate = sentCount > 0 ? parseFloat(((bouncedCount / sentCount) * 100).toFixed(1)) : 0;
    const openRate = sentCount > 0 ? parseFloat(((openedCount / sentCount) * 100).toFixed(1)) : 0;
    const health = bounceRate > 5 ? 'danger' : bounceRate > 2 ? 'warning' : 'good';
    return { email: inbox.email, sentCount, bouncedCount, openedCount, bounceRate, openRate, health };
  });

  // Emails likely in spam: sent > 5 days ago, never opened, never replied
  const likelySpam = db.prepare(`
    SELECT e.id, e.subject, e.sent_at, e.from_email, l.channel_name, l.email as to_email,
           CAST((julianday('now') - julianday(e.sent_at)) AS INTEGER) as days_since
    FROM emails e
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE e.status = 'sent'
      AND e.opened_at IS NULL
      AND e.sent_at < datetime('now', '-5 days')
    ORDER BY e.sent_at DESC
    LIMIT 50
  `).all();

  // Recent bounces from DB
  const recentBounces = db.prepare(`
    SELECT e.id, e.subject, e.sent_at, e.from_email, l.channel_name, l.email as to_email
    FROM emails e
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE e.status = 'bounced'
    ORDER BY e.sent_at DESC
    LIMIT 20
  `).all();

  // Overall risk score
  const totalSent = perInbox.reduce((s, i) => s + i.sentCount, 0);
  const totalBounced = perInbox.reduce((s, i) => s + i.bouncedCount, 0);
  const overallBounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
  const overallRisk = overallBounceRate > 5 ? 'high' : overallBounceRate > 2 ? 'medium' : likelySpam.length > 20 ? 'medium' : 'low';

  // Run IMAP check in parallel — don't block if it fails
  let imapResults = [];
  try {
    imapResults = await Promise.race([
      checkSpamFolders(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
    ]);
  } catch (e) {
    imapResults = inboxes.map(i => ({ email: i.email, bounceEmails: [], spamCount: 0, error: e.message }));
  }

  res.json({
    success: true,
    overallRisk,
    overallBounceRate: parseFloat(overallBounceRate.toFixed(1)),
    perInbox,
    likelySpam,
    recentBounces,
    imapResults,
    generatedAt: new Date().toISOString(),
  });
}));

module.exports = router;
