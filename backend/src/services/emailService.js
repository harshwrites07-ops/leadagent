const nodemailer = require('nodemailer');
const { getDb, getSetting, logActivity } = require('../models/database');
const { v4: uuidv4 } = require('uuid');

const transporters = new Map();
let roundRobinIdx = 0;

// Returns all configured inboxes — env vars take priority over DB
function getInboxes() {
  const inboxes = [];
  for (let i = 1; i <= 4; i++) {
    const user = process.env[`SMTP_USER_${i}`];
    const pass = process.env[`SMTP_PASS_${i}`];
    if (user && pass) {
      inboxes.push({ idx: i, email: user, pass, host: 'smtp.gmail.com', port: 587, from_name: 'ContentCrafterzz' });
    }
  }
  if (inboxes.length > 0) return inboxes;

  // DB-based fallback (Settings page inboxes)
  const raw = getSetting('smtp_inboxes');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((inbox, i) => ({
          idx: i + 1,
          host: 'smtp.gmail.com',
          port: 587,
          from_name: 'ContentCrafterzz',
          ...inbox,
          pass: process.env[`SMTP_PASS_${i + 1}`] || process.env.SMTP_PASS,
        })).filter(inbox => inbox.email && inbox.pass);
      }
    } catch {}
  }

  // Legacy single-inbox fallback
  const user = getSetting('smtp_user') || process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && pass) {
    return [{
      idx: 1, email: user, pass,
      host: getSetting('smtp_host') || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(getSetting('smtp_port') || process.env.SMTP_PORT || '587'),
      from_name: getSetting('smtp_from_name') || process.env.SMTP_FROM_NAME || 'ContentCrafterzz',
    }];
  }
  return [];
}

function buildTransporter(inbox) {
  return nodemailer.createTransport({
    pool: true,
    maxConnections: 4,
    maxMessages: 200,
    rateLimit: 14,
    host: inbox.host || 'smtp.gmail.com',
    port: parseInt(inbox.port || '587'),
    secure: parseInt(inbox.port || '587') === 465,
    auth: { user: inbox.email, pass: inbox.pass },
    tls: { rejectUnauthorized: false },
  });
}

function getTransporterForInbox(inbox) {
  if (!transporters.has(inbox.email)) {
    transporters.set(inbox.email, buildTransporter(inbox));
  }
  return transporters.get(inbox.email);
}

function resetTransporter() {
  for (const t of transporters.values()) {
    try { t.close(); } catch {}
  }
  transporters.clear();
}

// Round-robin selection, skips inboxes over daily limit
async function selectInbox(db) {
  const inboxes = getInboxes();
  if (inboxes.length === 0) throw new Error('SMTP not configured — add SMTP_USER_1/SMTP_PASS_1 to .env or configure in Settings');

  const perInboxLimit = parseInt(getSetting('daily_send_limit') || '150');

  const counts = db.prepare(`
    SELECT from_email, COUNT(*) as count
    FROM emails
    WHERE DATE(sent_at) = DATE('now') AND status = 'sent' AND from_email IS NOT NULL
    GROUP BY from_email
  `).all();

  const countMap = {};
  for (const row of counts) countMap[row.from_email] = row.count;

  for (let attempt = 0; attempt < inboxes.length; attempt++) {
    const idx = (roundRobinIdx + attempt) % inboxes.length;
    const inbox = inboxes[idx];
    const sent = countMap[inbox.email] || 0;
    if (sent < perInboxLimit) {
      roundRobinIdx = (idx + 1) % inboxes.length;
      return inbox;
    }
  }

  throw new Error(`All ${inboxes.length} inbox(es) hit daily limit (${perInboxLimit}/inbox)`);
}

async function testSmtp(config) {
  try {
    const t = nodemailer.createTransport({
      host: config.host || 'smtp.gmail.com',
      port: parseInt(config.port || '587'),
      secure: parseInt(config.port || '587') === 465,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false },
    });
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendEmail({ to, subject, body, leadId, followUpNumber = 0 }) {
  const db = getDb();
  const trackingId = uuidv4();
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const inbox = await selectInbox(db);
  const fromName = inbox.from_name || 'ContentCrafterzz';
  const fromEmail = inbox.email;

  // Use APP_URL (public domain) so recipients can actually hit the tracking endpoint
  const publicUrl = process.env.APP_URL || appUrl.replace('5173', '3001');
  const trackingPixel = `<img src="${publicUrl}/api/track/open/${trackingId}" width="1" height="1" style="display:none" />`;
  const htmlBody = body.replace(/\n/g, '<br>') + trackingPixel;

  const t = getTransporterForInbox(inbox);
  const info = await t.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text: body,
    html: htmlBody,
  });

  const emailRecord = db.prepare(`
    INSERT INTO emails (lead_id, subject, body, status, sent_at, tracking_id, follow_up_number, from_email)
    VALUES (?, ?, ?, 'sent', CURRENT_TIMESTAMP, ?, ?, ?)
  `).run(leadId, subject, body, trackingId, followUpNumber, fromEmail);

  logActivity('email_sent', `Email sent to lead #${leadId} via ${fromEmail}`, leadId, { subject, messageId: info.messageId });

  return { emailId: emailRecord.lastInsertRowid, trackingId, messageId: info.messageId, fromEmail };
}

async function processQueue() {
  const db = getDb();
  const perInboxLimit = parseInt(getSetting('daily_send_limit') || '150');
  const inboxes = getInboxes();
  const totalLimit = perInboxLimit * Math.max(inboxes.length, 1);
  const delayMin = parseInt(getSetting('email_delay_min') || '45') * 1000;
  const delayMax = parseInt(getSetting('email_delay_max') || '90') * 1000;

  const todaySent = db.prepare(`
    SELECT COUNT(*) as count FROM emails
    WHERE DATE(sent_at) = DATE('now') AND status = 'sent'
  `).get();

  if (todaySent.count >= totalLimit) {
    return { processed: 0, reason: `Daily limit reached (${totalLimit} total across ${inboxes.length} inbox(es))` };
  }

  const recentEmails = db.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
    FROM emails WHERE sent_at > datetime('now', '-7 days')
  `).get();

  if (recentEmails.total > 20) {
    const bounceRate = (recentEmails.bounced / recentEmails.total) * 100;
    if (bounceRate > 5) return { processed: 0, reason: `Bounce rate too high (${bounceRate.toFixed(1)}%)` };
  }

  const item = db.prepare(`
    SELECT eq.*, l.email, l.channel_name
    FROM email_queue eq
    JOIN leads l ON l.id = eq.lead_id
    WHERE eq.status = 'pending'
    AND (eq.scheduled_at IS NULL OR eq.scheduled_at <= CURRENT_TIMESTAMP)
    ORDER BY eq.priority DESC, eq.created_at ASC
    LIMIT 1
  `).get();

  if (!item) return { processed: 0, reason: 'Queue empty' };

  if (!item.email) {
    db.prepare(`UPDATE email_queue SET status = 'failed' WHERE id = ?`).run(item.id);
    return { processed: 0, reason: 'Lead has no email address' };
  }

  db.prepare(`UPDATE email_queue SET status = 'sending' WHERE id = ?`).run(item.id);

  try {
    const result = await sendEmail({
      to: item.email,
      subject: item.subject,
      body: item.body,
      leadId: item.lead_id,
    });

    db.prepare(`UPDATE email_queue SET status = 'sent', sent_at = CURRENT_TIMESTAMP, email_id = ? WHERE id = ?`)
      .run(result.emailId, item.id);

    db.prepare(`UPDATE leads SET crm_stage = 'emailed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND crm_stage IN ('new_lead', 'studying', 'pitch_ready')`)
      .run(item.lead_id);

    const delay = delayMin + Math.random() * (delayMax - delayMin);
    return { processed: 1, nextDelayMs: Math.round(delay), result };
  } catch (e) {
    db.prepare(`UPDATE email_queue SET status = 'failed' WHERE id = ?`).run(item.id);
    throw e;
  }
}

async function checkReplies() {
  const imapSimple = require('imap-simple');
  const db = getDb();

  const inboxes = getInboxes();
  if (inboxes.length === 0) return { repliesFound: 0, error: 'No inboxes configured' };

  let totalReplies = 0;

  for (const inbox of inboxes) {
    try {
      const config = {
        imap: {
          user: inbox.email,
          password: inbox.pass,
          host: 'imap.gmail.com',
          port: 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          authTimeout: 10000,
        },
      };

      const connection = await imapSimple.connect(config);
      await connection.openBox('INBOX');

      const since = new Date();
      since.setDate(since.getDate() - 7);

      // Search wider window (30 days) to catch any we missed
      const messages = await connection.search([['SINCE', since.toDateString()]], {
        bodies: ['HEADER', 'TEXT'],
        markSeen: false,
      });

      for (const msg of messages) {
        const header = msg.parts.find(p => p.which === 'HEADER')?.body;
        const textPart = msg.parts.find(p => p.which === 'TEXT');
        const from = header?.from?.[0] || '';
        const fromEmail = from.match(/<(.+)>/)?.[1] || from.trim();
        const replySubject = header?.subject?.[0] || '';

        // Extract plain text from body (strip quoted text after first ">" line)
        let replyBody = '';
        if (textPart?.body) {
          replyBody = textPart.body
            .split('\n')
            .filter(line => !line.startsWith('>') && !line.startsWith('On ') && line.trim() !== '--')
            .join('\n')
            .trim()
            .substring(0, 2000);
        }

        const lead = db.prepare(`SELECT * FROM leads WHERE email = ?`).get(fromEmail);
        if (!lead) continue;

        // Update the most recent sent/opened email for this lead
        const emailRow = db.prepare(`
          SELECT id FROM emails WHERE lead_id = ? ORDER BY sent_at DESC LIMIT 1
        `).get(lead.id);

        if (emailRow) {
          const alreadyReplied = db.prepare(`SELECT status FROM emails WHERE id = ?`).get(emailRow.id);
          db.prepare(`
            UPDATE emails SET status='replied', replied_at=COALESCE(replied_at, CURRENT_TIMESTAMP),
              reply_body=?, reply_subject=?, reply_from=?
            WHERE id=?
          `).run(replyBody || null, replySubject || null, fromEmail, emailRow.id);

          if (alreadyReplied?.status !== 'replied') {
            db.prepare(`UPDATE leads SET crm_stage='replied', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
            logActivity('reply_received', `Reply received from ${lead.channel_name} ⭐`, lead.id);
            totalReplies++;
          }
        }
      }

      connection.end();
    } catch (e) {
      console.error(`IMAP check failed for ${inbox.email}:`, e.message);
    }
  }

  return { repliesFound: totalReplies };
}

// ── Spam folder & bounce detector ─────────────────────────────────────────────
// Checks each inbox for Mailer-Daemon bounce-backs (delivery failures/spam rejections)
async function checkSpamFolders() {
  const imapSimple = require('imap-simple');
  const inboxes = getInboxes();
  const results = [];

  for (const inbox of inboxes) {
    const report = {
      email: inbox.email,
      bounceEmails: [],    // Mailer-Daemon failures found in INBOX
      spamCount: 0,        // Emails in [Gmail]/Spam
      error: null,
    };

    try {
      const config = {
        imap: {
          user: inbox.email,
          password: inbox.pass,
          host: 'imap.gmail.com',
          port: 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          authTimeout: 12000,
        },
      };

      const connection = await imapSimple.connect(config);

      // 1. Check INBOX for Mailer-Daemon bounce-backs
      await connection.openBox('INBOX');
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const bounces = await connection.search(
        [['SINCE', since.toDateString()], ['OR',
          ['FROM', 'mailer-daemon'],
          ['FROM', 'postmaster'],
        ]],
        { bodies: ['HEADER'], markSeen: false }
      );

      for (const msg of bounces) {
        const header = msg.parts.find(p => p.which === 'HEADER')?.body || {};
        const subject = header.subject?.[0] || '';
        const from = header.from?.[0] || '';
        const date = header.date?.[0] || '';
        // Extract original recipient from subject line if possible
        const toMatch = subject.match(/(?:delivery|failure|undeliverable|returned).{0,30}?([\w.+-]+@[\w.-]+)/i);
        report.bounceEmails.push({
          from: from.substring(0, 80),
          subject: subject.substring(0, 120),
          date,
          originalRecipient: toMatch?.[1] || null,
        });
      }

      // 2. Count emails in our own Spam folder
      try {
        await connection.openBox('[Gmail]/Spam');
        const spamMsgs = await connection.search(['ALL'], { bodies: [], markSeen: false });
        report.spamCount = spamMsgs.length;
      } catch {}

      connection.end();
    } catch (e) {
      report.error = e.message;
    }

    results.push(report);
  }

  return results;
}

module.exports = { sendEmail, processQueue, testSmtp, resetTransporter, checkReplies, getInboxes, checkSpamFolders };
