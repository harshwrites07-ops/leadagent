const express = require('express');
const router = express.Router();
const { getDb, getSetting, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/requireAuth');
const { sendEmail, sendReply, testSmtp, resetTransporter, checkSpamFolders, getInboxes, checkReplies, checkDeliverability, isValidEmailFormat, ensureClean, hasMxRecord } = require('../services/emailService');
const { checkUsageLimit, incrementUsage } = require('../services/authService');

// GET /api/emails — list all emails
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { lead_id, status, page = 1, limit = 50 } = req.query;

  let where = ['e.user_id = ?'];
  const params = [req.user.id];

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

// GET /api/emails/inboxes — ONLY the user's own connected Gmail accounts (no admin SMTP fallback)
router.get('/inboxes', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const gmailAccounts = db.prepare(
    `SELECT email FROM gmail_accounts WHERE user_id = ? AND status = 'active'`
  ).all(uid);

  const result = gmailAccounts.map(inbox => {
    const sentRow   = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND user_id=? AND DATE(sent_at)>=DATE('now','-30 days')`).get(inbox.email, uid);
    const bounceRow = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND user_id=? AND status='bounced' AND DATE(sent_at)>=DATE('now','-30 days')`).get(inbox.email, uid);
    const openRow   = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND user_id=? AND (status='opened' OR opened_at IS NOT NULL)`).get(inbox.email, uid);
    const sentCount    = sentRow?.c   || 0;
    const bouncedCount = bounceRow?.c || 0;
    const openedCount  = openRow?.c   || 0;
    const bounceRate = sentCount > 0 ? parseFloat(((bouncedCount / sentCount) * 100).toFixed(1)) : 0;
    const openRate   = sentCount > 0 ? parseFloat(((openedCount  / sentCount) * 100).toFixed(1)) : 0;
    return { email: inbox.email, sentCount, bouncedCount, openedCount, bounceRate, openRate };
  });

  res.json({ success: true, inboxes: result });
}));

// GET /api/emails/stats — MUST be before any /:param routes
router.get('/stats', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const today = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE DATE(sent_at) = DATE('now') AND status='sent' AND user_id=?`).get(uid);
  const month = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE strftime('%Y-%m', sent_at) = strftime('%Y-%m','now') AND status='sent' AND user_id=?`).get(uid);
  const opens = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE (status='opened' OR opened_at IS NOT NULL) AND user_id=?`).get(uid);
  const replies = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE (status='replied' OR replied_at IS NOT NULL) AND user_id=?`).get(uid);
  const bounces = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE status='bounced' AND user_id=?`).get(uid);
  const totalSent = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE (status='sent' OR sent_at IS NOT NULL) AND user_id=?`).get(uid);
  const firstSent = db.prepare(`SELECT MIN(sent_at) as first_date FROM emails WHERE sent_at IS NOT NULL AND user_id=?`).get(uid);
  const dailyLimit = parseInt(getSetting('daily_send_limit') || '150');

  res.json({
    success: true,
    sent_today: today.count,
    sent_month: month.count,
    daily_limit: dailyLimit,
    daily_remaining: Math.max(0, dailyLimit - today.count),
    total_sent: totalSent.count,
    first_sent_date: firstSent?.first_date || null,
    opened_count: opens.count,
    replied_count: replies.count,
    bounced_count: bounces.count,
    open_rate: totalSent.count > 0 ? parseFloat(((opens.count / totalSent.count) * 100).toFixed(1)) : 0,
    reply_rate: totalSent.count > 0 ? parseFloat(((replies.count / totalSent.count) * 100).toFixed(1)) : 0,
  });
}));

// POST /api/emails/test-send — send a test email to diagnose sending issues (admin only)
router.post('/test-send', requireAdmin, asyncHandler(async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ success: false, error: 'to is required' });

  const inboxes = getInboxes();
  const { pickAccountForUser } = require('../services/gmailService');
  const gmailAccount = pickAccountForUser(req.user.id);

  const diagnostics = {
    smtpInboxes: inboxes.map(i => ({ email: i.email, host: i.host, port: i.port })),
    gmailAccount: gmailAccount ? { email: gmailAccount.email, status: gmailAccount.status, sentToday: gmailAccount.emails_sent_today } : null,
    method: null,
    error: null,
    success: false,
  };

  try {
    const result = await sendEmail({
      to,
      subject: 'ContentCrafterzz — Test Email',
      body: `This is a test email sent at ${new Date().toISOString()}.\n\nIf you received this, email sending is working correctly.`,
      leadId: null,
      userId: req.user.id,
    });
    diagnostics.success = true;
    diagnostics.method = result.fromEmail?.includes('gmail') && gmailAccount?.email === result.fromEmail ? 'Gmail OAuth' : 'SMTP';
    diagnostics.fromEmail = result.fromEmail;
    diagnostics.messageId = result.messageId;
    res.json({ success: true, ...diagnostics });
  } catch (e) {
    console.error('[Test Send] Failed:', e.message);
    diagnostics.error = e.message;
    res.status(500).json({ success: false, ...diagnostics });
  }
}));

// GET /api/emails/queue
router.get('/queue', asyncHandler(async (req, res) => {
  const db = getDb();
  const queue = db.prepare(`
    SELECT eq.*, l.channel_name as lead_name, l.email as lead_email, l.thumbnail_url as thumbnail
    FROM email_queue eq
    JOIN leads l ON l.id = eq.lead_id
    WHERE eq.status IN ('pending', 'sending') AND eq.user_id = ?
    ORDER BY eq.priority DESC, eq.created_at ASC
  `).all(req.user.id);

  const paused = getSetting('queue_paused') === '1';
  res.json({ success: true, queue, paused });
}));

// POST /api/emails/queue — add to queue with lead_id in body (no URL param)
router.post('/queue', asyncHandler(async (req, res) => {
  const db = getDb();
  const { lead_id, subject, body, scheduled_at, priority = 0 } = req.body;
  if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id required' });

  const usageCheck = checkUsageLimit(req.user, 'emails');
  if (!usageCheck.allowed) {
    return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly email limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan to send more emails.` });
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(lead_id, req.user.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  let finalSubject = subject, finalBody = body;
  if (!finalSubject || !finalBody) {
    const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(lead.id);
    if (!pitch) return res.status(400).json({ success: false, error: 'No pitch found. Generate a pitch first.' });
    finalSubject = finalSubject || pitch.email_subject;
    finalBody = finalBody || pitch.cold_email;
  }

  const result = db.prepare(`
    INSERT INTO email_queue (user_id, lead_id, subject, body, status, scheduled_at, priority)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(req.user.id, lead.id, finalSubject, finalBody, scheduled_at || null, priority);

  incrementUsage(req.user.id, 'emails', 1);
  logActivity('queued', `Email queued for ${lead.channel_name}`, lead.id, {}, req.user.id);
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

  const usageCheck = checkUsageLimit(req.user, 'emails');
  if (!usageCheck.allowed) {
    return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly email limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan to send more emails.` });
  }

  const db = getDb();
  let added = 0, skipped = 0;

  for (const id of lead_ids) {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!lead) { skipped++; continue; }

    const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(id);
    if (!pitch) { skipped++; continue; }

    const existing = db.prepare(`SELECT id FROM email_queue WHERE lead_id = ? AND status = 'pending'`).get(id);
    if (existing) { skipped++; continue; }

    db.prepare(`
      INSERT INTO email_queue (user_id, lead_id, subject, body, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.user.id, id, pitch.email_subject, pitch.cold_email);
    added++;
  }

  if (added > 0) incrementUsage(req.user.id, 'emails', added);
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
  const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(req.params.leadId, req.user.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  const usageCheck = checkUsageLimit(req.user, 'emails');
  if (!usageCheck.allowed) {
    return res.status(429).json({ success: false, upgradeRequired: true, error: `Monthly email limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade your plan to send more emails.` });
  }

  const { subject, body, scheduled_at, priority = 0 } = req.body;

  let finalSubject = subject, finalBody = body;
  if (!finalSubject || !finalBody) {
    const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(lead.id);
    if (!pitch) return res.status(400).json({ success: false, error: 'No pitch found. Generate pitch first.' });
    finalSubject = finalSubject || pitch.email_subject;
    finalBody = finalBody || pitch.cold_email;
  }

  const result = db.prepare(`
    INSERT INTO email_queue (user_id, lead_id, subject, body, status, scheduled_at, priority)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(req.user.id, lead.id, finalSubject, finalBody, scheduled_at || null, priority);

  incrementUsage(req.user.id, 'emails', 1);
  logActivity('queued', `Email queued for ${lead.channel_name}`, lead.id, {}, req.user.id);
  const item = db.prepare('SELECT * FROM email_queue WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, item });
}));

// DELETE /api/emails/queue/:id
router.delete('/queue/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE email_queue SET status = 'cancelled' WHERE id = ? AND status = 'pending' AND user_id = ?`).run(req.params.id, req.user.id);
  res.json({ success: true });
}));

// POST /api/emails/send-now/:queueId
router.post('/send-now/:queueId', asyncHandler(async (req, res) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT eq.*, l.email, l.channel_name
    FROM email_queue eq JOIN leads l ON l.id = eq.lead_id
    WHERE eq.id = ? AND eq.status = 'pending' AND eq.user_id = ?
  `).get(req.params.queueId, req.user.id);

  if (!item) return res.status(404).json({ success: false, error: 'Queue item not found or already sent' });
  if (!item.email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

  db.prepare(`UPDATE email_queue SET status = 'sending' WHERE id = ?`).run(item.id);

  try {
    const result = await sendEmail({ to: item.email, subject: item.subject, body: item.body, leadId: item.lead_id, userId: req.user.id });
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

// GET /api/emails/deliverability — DNS check for SPF/DKIM/DMARC on all sending domains
router.get('/deliverability', asyncHandler(async (req, res) => {
  const results = await checkDeliverability();
  const allGood = results.every(r => r.issues.length === 0);
  res.json({ success: true, results, allGood });
}));

// POST /api/emails/process-bounces — scan IMAP for bounce notifications, auto-mark leads
router.post('/process-bounces', asyncHandler(async (req, res) => {
  const db = getDb();
  const imapResults = await checkSpamFolders();
  const totalBounces = imapResults.reduce((s, r) => s + r.bounceEmails.length, 0);
  const newlyMarked = imapResults.reduce((s, r) => s + (r.newlyMarked || 0), 0);
  const marked = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();

  // Debug: show extraction results for unmatched bounce emails
  const unmatched = imapResults.flatMap(r =>
    r.bounceEmails.filter(b => !b.matched).map(b => ({
      inbox: r.email,
      subject: b.subject,
      extractedEmail: b.extractedEmail,
    }))
  );

  res.json({
    success: true,
    bounceEmailsFound: totalBounces,
    newlyMarked,
    totalInvalidLeads: marked.c,
    unmatchedBounces: unmatched,
    perInbox: imapResults,
  });
}));

// GET /api/emails/invalid-leads — leads with bad email addresses
router.get('/invalid-leads', asyncHandler(async (req, res) => {
  const db = getDb();
  const leads = db.prepare(`
    SELECT id, channel_name, email, bounce_reason, crm_stage
    FROM leads WHERE user_id = ? AND (email_invalid=1 OR (email IS NOT NULL AND (
      email NOT LIKE '%@%.%' OR LENGTH(TRIM(SUBSTR(email,1,INSTR(email,'@')-1))) < 2
    )))
    ORDER BY updated_at DESC LIMIT 200
  `).all(req.user.id);
  res.json({ success: true, leads, count: leads.length });
}));

// POST /api/emails/validate-leads-mx — DNS MX check all valid leads, mark bad domains invalid
router.post('/validate-leads-mx', asyncHandler(async (req, res) => {
  const db = getDb();
  const leads = db.prepare(`
    SELECT id, email FROM leads
    WHERE user_id = ? AND email IS NOT NULL AND email != ''
    AND (email_invalid IS NULL OR email_invalid = 0)
  `).all(req.user.id);

  let checked = 0, invalidated = 0;
  const domainResults = {};

  for (const lead of leads) {
    const domain = lead.email.split('@')[1]?.toLowerCase();
    if (!domain) continue;
    if (!(domain in domainResults)) {
      domainResults[domain] = await hasMxRecord(domain);
    }
    if (!domainResults[domain]) {
      db.prepare(`UPDATE leads SET email_invalid=1, bounce_reason='no_mx_record', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      invalidated++;
    }
    checked++;
  }

  const domainsChecked = Object.keys(domainResults).length;
  const badDomains = Object.entries(domainResults).filter(([, v]) => !v).map(([d]) => d);
  res.json({ success: true, checked, invalidated, domainsChecked, badDomains });
}));

// POST /api/emails/send-reply — send a manual reply from the correct quelro.com inbox
router.post('/send-reply', asyncHandler(async (req, res) => {
  const { to, from_email, subject, body, email_id } = req.body;
  if (!to || !from_email || !subject || !body) {
    return res.status(400).json({ success: false, error: 'to, from_email, subject, body are required' });
  }
  const result = await sendReply({ to, fromEmail: from_email, subject, body, emailId: email_id });
  res.json({ success: true, messageId: result.messageId, fromEmail: result.fromEmail });
}));

// POST /api/emails/test-smtp
router.post('/test-smtp', requireAdmin, asyncHandler(async (req, res) => {
  const result = await testSmtp(req.body);
  if (result.ok) resetTransporter();
  res.json(result);
}));

// GET /api/emails/replies — all replied emails with their reply content
router.get('/replies', asyncHandler(async (req, res) => {
  const db = getDb();
  const replies = db.prepare(`
    SELECT e.id, e.subject, e.body, e.sent_at, e.replied_at, e.from_email,
           e.reply_body, e.reply_subject, e.reply_from,
           e.my_reply_body, e.my_reply_sent_at,
           l.channel_name, l.email as lead_email, l.thumbnail_url, l.subscriber_count, l.niche
    FROM emails e
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE e.status = 'replied' AND e.user_id = ?
    ORDER BY e.replied_at DESC
  `).all(req.user.id).map(r => ({ ...r, reply_body: ensureClean(r.reply_body) }));
  res.json({ success: true, replies, count: replies.length });
}));

// POST /api/emails/replies/fetch — trigger IMAP check and return fresh replies
router.post('/replies/fetch', asyncHandler(async (req, res) => {
  const result = await checkReplies();
  const db = getDb();
  const replies = db.prepare(`
    SELECT e.id, e.subject, e.body, e.sent_at, e.replied_at, e.from_email,
           e.reply_body, e.reply_subject, e.reply_from,
           e.my_reply_body, e.my_reply_sent_at,
           l.channel_name, l.email as lead_email, l.thumbnail_url, l.subscriber_count, l.niche
    FROM emails e
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE e.status = 'replied' AND e.user_id = ?
    ORDER BY e.replied_at DESC
  `).all(req.user.id).map(r => ({ ...r, reply_body: ensureClean(r.reply_body) }));
  res.json({ success: true, newReplies: result.repliesFound, replies, count: replies.length });
}));

// GET /api/emails/spam-report
// Returns: per-inbox bounce-back detections + DB-level spam risk indicators
router.get('/spam-report', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  // Only the user's own connected Gmail accounts — never admin SMTP inboxes
  const gmailAccounts = db.prepare(`SELECT email FROM gmail_accounts WHERE user_id = ? AND status = 'active'`).all(uid);

  // DB stats per inbox — all queries scoped to this user
  const perInbox = gmailAccounts.map(inbox => {
    const sent    = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND user_id=? AND DATE(sent_at) >= DATE('now','-30 days')`).get(inbox.email, uid);
    const bounced = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND user_id=? AND status='bounced' AND DATE(sent_at) >= DATE('now','-30 days')`).get(inbox.email, uid);
    const opened  = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE from_email=? AND user_id=? AND (status='opened' OR opened_at IS NOT NULL) AND DATE(sent_at) >= DATE('now','-30 days')`).get(inbox.email, uid);
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
    WHERE e.user_id = ?
      AND e.status = 'sent'
      AND e.opened_at IS NULL
      AND e.sent_at < datetime('now', '-5 days')
    ORDER BY e.sent_at DESC
    LIMIT 50
  `).all(req.user.id);

  // Recent bounces from DB
  const recentBounces = db.prepare(`
    SELECT e.id, e.subject, e.sent_at, e.from_email, l.channel_name, l.email as to_email
    FROM emails e
    LEFT JOIN leads l ON l.id = e.lead_id
    WHERE e.user_id = ? AND e.status = 'bounced'
    ORDER BY e.sent_at DESC
    LIMIT 20
  `).all(req.user.id);

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
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
    ]);
  } catch (e) {
    imapResults = gmailAccounts.map(i => ({ email: i.email, bounceEmails: [], spamCount: 0, error: e.message }));
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
