const nodemailer = require('nodemailer');
const { getDb, getSetting, logActivity } = require('../models/database');
const { v4: uuidv4 } = require('uuid');

const transporters = new Map();
let roundRobinIdx = 0;

function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim();
  const atIdx = e.indexOf('@');
  if (atIdx < 1) return false;
  const domain = e.substring(atIdx + 1);
  if (!domain.includes('.')) return false;
  const tld = domain.split('.').pop();
  if (tld.length < 2) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e);
}

// MX record validation cache — prevents sending to domains with no mail server
const mxCache = new Map();
const MX_CACHE_TTL_VALID = 24 * 60 * 60 * 1000;
const MX_CACHE_TTL_FAIL  =  1 * 60 * 60 * 1000;

async function hasMxRecord(domain) {
  const now = Date.now();
  const cached = mxCache.get(domain);
  if (cached) {
    const ttl = cached.valid ? MX_CACHE_TTL_VALID : MX_CACHE_TTL_FAIL;
    if (now - cached.checkedAt < ttl) return cached.valid;
  }
  const dns = require('dns').promises;
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 5000))]);
  try {
    const records = await withTimeout(dns.resolveMx(domain));
    const valid = Array.isArray(records) && records.length > 0;
    mxCache.set(domain, { valid, checkedAt: now });
    return valid;
  } catch (mxErr) {
    const code = mxErr.code || '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      mxCache.set(domain, { valid: false, checkedAt: now });
      return false;
    }
    // resolveMx() fails on Windows with ECONNREFUSED — fall back to A-record existence check
    try {
      await withTimeout(dns.lookup(domain));
      mxCache.set(domain, { valid: true, checkedAt: now });
      return true;
    } catch (lookupErr) {
      if ((lookupErr.code || '') === 'ENOTFOUND') {
        mxCache.set(domain, { valid: false, checkedAt: now });
        return false;
      }
      return true; // Can't determine — allow send rather than block
    }
  }
}

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

// Round-robin selection, skips inboxes over daily limit or in skipInboxes list
async function selectInbox(db, skipInboxes = []) {
  const allInboxes = getInboxes();
  if (allInboxes.length === 0) throw new Error('SMTP not configured — add SMTP_USER_1/SMTP_PASS_1 to .env or configure in Settings');

  const inboxes = skipInboxes.length ? allInboxes.filter(i => !skipInboxes.includes(i.email)) : allInboxes;
  if (inboxes.length === 0) throw new Error('per_account_limit reached for all inboxes in this run');

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

async function sendEmail({ to, subject, body, leadId, followUpNumber = 0, skipInboxes = [], userId = null }) {
  console.log(`[Email] Attempting send to: ${to} | leadId: ${leadId} | userId: ${userId}`);
  const db = getDb();

  if (!isValidEmailFormat(to)) {
    console.warn(`[Email] Invalid format rejected: ${to}`);
    if (leadId) {
      db.prepare(`UPDATE leads SET email_invalid=1, bounce_reason='invalid_format', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
    }
    throw new Error(`Invalid email address skipped: ${to}`);
  }

  // MX record check
  const emailDomain = to.split('@')[1]?.toLowerCase();
  if (emailDomain) {
    const mxOk = await hasMxRecord(emailDomain);
    if (!mxOk) {
      if (leadId) {
        db.prepare(`UPDATE leads SET email_invalid=1, bounce_reason='no_mx_record', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
      }
      throw new Error(`Domain ${emailDomain} has no MX record — email would bounce`);
    }
  }

  const trackingId = uuidv4();
  const publicUrl = process.env.APP_URL || 'http://localhost:3001';
  const trackingPixel = `<img src="${publicUrl}/api/track/open/${trackingId}" width="1" height="1" style="display:none" />`;
  const htmlBody = body.replace(/\n/g, '<br>') + trackingPixel;

  let fromEmail;
  let messageId;

  // Try Gmail OAuth first if user has connected accounts
  if (userId) {
    try {
      const { pickAccountForUser, sendViaGmail } = require('./gmailService');
      const gmailAccount = pickAccountForUser(userId);
      if (gmailAccount) {
        console.log(`[Email] Using Gmail OAuth: ${gmailAccount.email} (sent today: ${gmailAccount.emails_sent_today})`);
        const userRow = db.prepare('SELECT full_name, agency_name FROM users WHERE id=?').get(userId);
        const fromName = userRow?.agency_name || userRow?.full_name || 'ContentCrafterzz';
        await sendViaGmail(gmailAccount, { to, subject, htmlBody, fromName });
        fromEmail = gmailAccount.email;
        messageId = `gmail-${trackingId}`;
        console.log(`[Email] Gmail send success: ${fromEmail} → ${to}`);

        const emailRecord = db.prepare(`
          INSERT INTO emails (lead_id, subject, body, status, sent_at, tracking_id, follow_up_number, from_email, user_id)
          VALUES (?, ?, ?, 'sent', CURRENT_TIMESTAMP, ?, ?, ?, ?)
        `).run(leadId, subject, body, trackingId, followUpNumber, fromEmail, userId);

        logActivity('email_sent', `Email sent to lead #${leadId} via Gmail (${fromEmail})`, leadId, { subject }, userId);
        return { emailId: emailRecord.lastInsertRowid, trackingId, messageId, fromEmail };
      } else {
        console.log(`[Email] No available Gmail account for userId=${userId}, falling back to SMTP`);
      }
    } catch (gmailErr) {
      console.warn(`[Email] Gmail send failed (${gmailErr.message}), falling back to SMTP`);
    }
  } else {
    console.log(`[Email] No userId provided, using SMTP directly`);
  }

  // Fall back to SMTP
  console.log(`[Email] Using SMTP — available inboxes: ${getInboxes().map(i => i.email).join(', ') || 'NONE'}`);
  const inbox = await selectInbox(db, skipInboxes);
  fromEmail = inbox.email;
  const fromName = inbox.from_name || 'ContentCrafterzz';
  console.log(`[Email] SMTP inbox selected: ${fromEmail}`);

  const t = getTransporterForInbox(inbox);
  let info;
  try {
    info = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: body,
      html: htmlBody,
    });
    console.log(`[Email] SMTP send success: ${fromEmail} → ${to} | msgId: ${info.messageId}`);
  } catch (smtpErr) {
    console.error(`[Email] SMTP send error (${fromEmail} → ${to}): ${smtpErr.message}`);
    const code = smtpErr.responseCode || smtpErr.code || 0;
    const msg = (smtpErr.message || '').toLowerCase();
    const isHardBounce = code >= 500 || /user.*not.*found|no.*such.*user|does.*not.*exist|invalid.*address|mailbox.*unavailable|address.*rejected/i.test(msg);
    if (isHardBounce && leadId) {
      db.prepare(`UPDATE leads SET email_invalid=1, bounce_reason='hard_bounce', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
      db.prepare(`INSERT INTO emails (lead_id, subject, body, status, sent_at, tracking_id, follow_up_number, from_email, bounce_reason, user_id) VALUES (?, ?, ?, 'bounced', CURRENT_TIMESTAMP, ?, ?, ?, 'hard_bounce', ?)`).run(leadId, subject, body, trackingId, followUpNumber, fromEmail, userId);
    }
    throw smtpErr;
  }

  const emailRecord = db.prepare(`
    INSERT INTO emails (lead_id, subject, body, status, sent_at, tracking_id, follow_up_number, from_email, user_id)
    VALUES (?, ?, ?, 'sent', CURRENT_TIMESTAMP, ?, ?, ?, ?)
  `).run(leadId, subject, body, trackingId, followUpNumber, fromEmail, userId);

  logActivity('email_sent', `Email sent to lead #${leadId} via ${fromEmail}`, leadId, { subject, messageId: info.messageId }, userId);

  return { emailId: emailRecord.lastInsertRowid, trackingId, messageId: info.messageId, fromEmail };
}

async function processQueue() {
  const db = getDb();
  if (getSetting('queue_paused') === '1') return { processed: 0, reason: 'Queue paused' };
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
    SELECT eq.*, l.email, l.channel_name, l.email_invalid
    FROM email_queue eq
    JOIN leads l ON l.id = eq.lead_id
    WHERE eq.status = 'pending'
    AND (eq.scheduled_at IS NULL OR eq.scheduled_at <= CURRENT_TIMESTAMP)
    AND (l.email_invalid IS NULL OR l.email_invalid = 0)
    ORDER BY eq.priority DESC, eq.created_at ASC
    LIMIT 1
  `).get();

  if (!item) return { processed: 0, reason: 'Queue empty' };

  if (!item.email) {
    db.prepare(`UPDATE email_queue SET status = 'failed' WHERE id = ?`).run(item.id);
    return { processed: 0, reason: 'Lead has no email address' };
  }

  console.log(`[Queue] Processing item ${item.id}: ${item.channel_name} <${item.email}>`);
  db.prepare(`UPDATE email_queue SET status = 'sending' WHERE id = ?`).run(item.id);

  try {
    const result = await sendEmail({
      to: item.email,
      subject: item.subject,
      body: item.body,
      leadId: item.lead_id,
      userId: item.user_id || null,
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

        // Parse MIME body — extract plain text from multipart or raw body
        let replyBody = '';
        if (textPart?.body) {
          replyBody = parseMimeBody(textPart.body);
        }

        const lead = db.prepare(`
          SELECT l.* FROM leads l
          INNER JOIN emails e ON e.lead_id = l.id
          WHERE l.email = ?
          ORDER BY e.sent_at DESC LIMIT 1
        `).get(fromEmail);
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
            logActivity('reply_received', `Reply received from ${lead.channel_name} ⭐`, lead.id, {}, lead.user_id);
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

// ── MIME body parser — extracts readable plain text from raw MIME ─────────────
function decodeQP(str) {
  return str.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function stripQuotes(text) {
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trimStart();
    if (t.startsWith('>')) continue;
    if (/^On .{10,200}(wrote|said):/i.test(t)) break;
    if (/^-{3,}\s*(Original|Forwarded)/i.test(t)) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractPartBody(part) {
  const sep = part.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const sepIdx = part.indexOf(sep);
  if (sepIdx === -1) return null;
  const headers = part.substring(0, sepIdx);
  let body = part.substring(sepIdx + sep.length);
  const encoding = headers.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1]?.toLowerCase();
  if (encoding === 'quoted-printable') body = decodeQP(body);
  else if (encoding === 'base64') { try { body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8'); } catch {} }
  return { headers, body };
}

function parseMimeBody(raw) {
  if (!raw) return '';

  // Try boundary-based splitting first (most reliable)
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const b = boundaryMatch[1].trim();
    const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = raw.split(new RegExp(`--${escaped}(?:--)?\\r?\\n?`));
    let plainText = '', htmlText = '';
    for (const part of parts) {
      if (/Content-Type:\s*text\/plain/i.test(part) && !plainText) {
        const r = extractPartBody(part);
        if (r) plainText = stripQuotes(r.body.trim());
      }
      if (/Content-Type:\s*text\/html/i.test(part) && !htmlText) {
        const r = extractPartBody(part);
        if (r) htmlText = stripQuotes(stripHtml(r.body));
      }
    }
    const result = plainText || htmlText;
    if (result && result.length > 3) return result.substring(0, 3000);
  }

  // Single-part MIME with headers
  if (raw.includes('Content-Type:')) {
    const r = extractPartBody(raw);
    if (r) {
      const isHtml = /Content-Type:\s*text\/html/i.test(r.headers);
      const cleaned = stripQuotes(isHtml ? stripHtml(r.body) : r.body.trim());
      if (cleaned && cleaned.length > 3) return cleaned.substring(0, 3000);
    }
  }

  // Last resort: strip MIME noise and return what's left
  let text = raw;
  text = text.replace(/^--[a-zA-Z0-9_\-]+\r?$/gm, '');
  text = text.replace(/^[A-Za-z-]+:\s*.+\r?$/gm, '');
  text = text.replace(/<img[^>]*>/gi, '');
  text = decodeQP(text);
  if (text.includes('<')) text = stripHtml(text);
  text = stripQuotes(text.replace(/\n{3,}/g, '\n\n').trim());
  return text.substring(0, 3000) || '(empty reply)';
}

// Apply to already-stored bodies that may be raw or partially-parsed MIME
function ensureClean(text) {
  if (!text) return text;

  // Full MIME with boundary declaration — parse properly
  if (/boundary="/i.test(text)) return parseMimeBody(text);

  // Body starts with a MIME boundary line (imap-simple returns raw multipart body)
  // Infer the boundary from line 1 and inject a fake header so parseMimeBody can split it
  const firstLine = text.split(/\r?\n/)[0];
  if (/^--[a-zA-Z0-9_\-\.]{10,}$/.test(firstLine)) {
    const boundary = firstLine.substring(2);
    const fakeMime = `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${text}`;
    return parseMimeBody(fakeMime);
  }

  // Partially-parsed: MIME boundary embedded mid-text — chop at it
  const mimeIdx = text.search(/^--[a-zA-Z0-9]{10,}\s*$/m);
  if (mimeIdx > 0) text = text.substring(0, mimeIdx);

  // Strip quoted original (everything from "On Mon/Tue/..." or "On ... wrote:" onward)
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trimStart();
    if (t.startsWith('>')) continue;
    if (/^On .{10,200}(wrote|said):/i.test(t)) break;
    if (/^On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]/i.test(t)) break;
    if (/^-{3,}\s*(Original|Forwarded)/i.test(t)) break;
    out.push(line);
  }
  text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (text.includes('<')) text = stripHtml(text);

  return text || '(empty reply)';
}

// ── Spam folder & bounce detector ─────────────────────────────────────────────
// Checks each inbox for Mailer-Daemon bounce-backs (delivery failures/spam rejections)
// rawBody = full MIME text body (before parsing) so DSN headers are searchable
function extractBouncedAddress(subject, parsedBody, rawBody) {
  const allText = [(parsedBody || ''), (rawBody || ''), (subject || '')].join('\n');

  // DSN machine-readable format (highest reliability) — present in raw MIME before parsing
  const dsnMatch = allText.match(/(?:Final|Original)-Recipient:\s*[^;]*;\s*([\w.+\-]{2,}@[\w.\-]+\.[a-zA-Z]{2,})/i);
  if (dsnMatch) return dsnMatch[1].toLowerCase();

  // Gmail human-readable: "message to X", "delivered to X", "delivery to X"
  const toMatch = allText.match(/(?:message to|deliver(?:ed|y) to|address:?)\s+([\w.+\-]{2,}@[\w.\-]+\.[a-zA-Z]{2,})/i);
  if (toMatch) return toMatch[1].toLowerCase();

  // Gmail "Delivery to the following recipient failed permanently:\n\n   user@domain.com"
  const recipientBlock = allText.match(/(?:following recipient[^:]*failed|failed permanently)[:\s\n]+([\w.+\-]{2,}@[\w.\-]+\.[a-zA-Z]{2,})/i);
  if (recipientBlock) return recipientBlock[1].toLowerCase();

  // Standalone email on its own line in the parsed body (common in Gmail DSNs)
  const standaloneMatch = (parsedBody || '').match(/^\s*([\w.+\-]{2,}@[\w.\-]+\.[a-zA-Z]{2,})\s*$/m);
  if (standaloneMatch) return standaloneMatch[1].toLowerCase();

  // Subject: "Message not delivered to X" or "Undelivered mail to X"
  if (subject) {
    const subjectMatch = subject.match(/(?:message to|undelivered.*?to|delivery.*?to)\s+([\w.+\-]{2,}@[\w.\-]+\.[a-zA-Z]{2,})/i);
    if (subjectMatch) return subjectMatch[1].toLowerCase();
  }

  // Last resort: any non-own-domain, non-system email in the combined text
  const ownDomain = '@quelro.com';
  const allEmails = [...allText.matchAll(/([\w.+\-]{2,}@[\w.\-]+\.[a-zA-Z]{2,})/g)].map(m => m[1].toLowerCase());
  return allEmails.find(e =>
    !e.includes(ownDomain) &&
    !e.includes('google') &&
    !e.includes('mailer') &&
    !e.includes('noreply') &&
    !e.includes('postmaster') &&
    !e.includes('bounce')
  ) || null;
}

async function checkSpamFolders() {
  const imapSimple = require('imap-simple');
  const inboxes = getInboxes();
  const db = getDb();

  const checkOneInbox = async (inbox) => {
    const report = {
      email: inbox.email,
      bounceEmails: [],
      newlyMarked: 0,
      spamCount: 0,
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
          authTimeout: 15000,
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
        { bodies: ['HEADER', 'TEXT'], markSeen: false }
      );

      for (const msg of bounces) {
        const header = msg.parts.find(p => p.which === 'HEADER')?.body || {};
        const textPart = msg.parts.find(p => p.which === 'TEXT');
        const subject = header.subject?.[0] || '';
        const from = header.from?.[0] || '';
        const date = header.date?.[0] || '';
        const rawBody = textPart?.body || '';
        const parsedBody = rawBody ? parseMimeBody(rawBody) : '';

        const bouncedEmail = extractBouncedAddress(subject, parsedBody, rawBody);

        let matched = false;
        let alreadyInvalid = false;
        if (bouncedEmail && isValidEmailFormat(bouncedEmail)) {
          const bouncedLead = db.prepare(`SELECT id, email_invalid FROM leads WHERE LOWER(email) = LOWER(?)`).get(bouncedEmail);
          if (bouncedLead) {
            matched = true;
            alreadyInvalid = !!bouncedLead.email_invalid;
            if (!alreadyInvalid) {
              const isSoft = /temporary|retry|delayed/i.test(subject + parsedBody);
              const reason = isSoft ? 'soft_bounce' : 'hard_bounce';
              db.prepare(`UPDATE leads SET email_invalid=1, bounce_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason, bouncedLead.id);
              db.prepare(`UPDATE emails SET status='bounced', bounce_reason=? WHERE lead_id=? AND status='sent' ORDER BY sent_at DESC LIMIT 1`).run(reason, bouncedLead.id);
              logActivity('bounce_detected', `Bounce: ${bouncedEmail} (${reason})`, bouncedLead.id);
              report.newlyMarked++;
            }
          }
        }

        report.bounceEmails.push({
          from: from.substring(0, 80),
          subject: subject.substring(0, 120),
          date,
          extractedEmail: bouncedEmail || null,
          matched,
          alreadyInvalid,
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

    return report;
  };

  // Check all inboxes in parallel — total time = slowest inbox, not sum of all
  const settled = await Promise.allSettled(inboxes.map(checkOneInbox));
  return settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { email: inboxes[i].email, bounceEmails: [], newlyMarked: 0, spamCount: 0, error: r.reason?.message || 'Unknown error' }
  );
}

async function sendReply({ to, fromEmail, subject, body, emailId }) {
  const inboxes = getInboxes();
  const inbox = inboxes.find(i => i.email === fromEmail);
  if (!inbox) throw new Error(`Inbox not configured for ${fromEmail} — check your SMTP settings`);

  const t = getTransporterForInbox(inbox);
  const fromName = inbox.from_name || 'ContentCrafterzz';

  const info = await t.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br>'),
  });

  if (emailId) {
    const db = getDb();
    db.prepare(`UPDATE emails SET my_reply_body=?, my_reply_sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(body, emailId);
  }

  return { messageId: info.messageId, fromEmail };
}

async function checkDeliverability() {
  const dns = require('dns').promises;
  const inboxes = getInboxes();
  const domains = [...new Set(inboxes.map(i => i.email.split('@')[1]).filter(Boolean))];
  const results = [];

  for (const domain of domains) {
    const r = { domain, spf: null, dmarc: null, issues: [] };

    try {
      const txt = await dns.resolveTxt(domain);
      const spf = txt.map(t => t.join('')).find(t => t.startsWith('v=spf1'));
      if (spf) {
        r.spf = { found: true, record: spf, hasGoogle: spf.includes('_spf.google.com') };
        if (!spf.includes('_spf.google.com')) r.issues.push(`SPF exists but missing Google: add "include:_spf.google.com"`);
      } else {
        r.spf = { found: false };
        r.issues.push(`No SPF record → add TXT on ${domain}: v=spf1 include:_spf.google.com ~all`);
      }
    } catch {
      r.spf = { found: false };
      r.issues.push(`SPF lookup failed for ${domain}`);
    }

    try {
      const txt = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarc = txt.map(t => t.join('')).find(t => t.startsWith('v=DMARC1'));
      if (dmarc) {
        r.dmarc = { found: true, record: dmarc };
      } else {
        r.dmarc = { found: false };
        r.issues.push(`No DMARC record → add TXT on _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:postmaster@${domain}`);
      }
    } catch {
      r.dmarc = { found: false };
      r.issues.push(`No DMARC record → add TXT on _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:postmaster@${domain}`);
    }

    results.push(r);
  }
  return results;
}

module.exports = { sendEmail, sendReply, processQueue, testSmtp, resetTransporter, checkReplies, getInboxes, checkSpamFolders, checkDeliverability, isValidEmailFormat, ensureClean, hasMxRecord };
