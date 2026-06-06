const { getDb } = require('../models/database');
const crypto = require('crypto');

// ── OTP ───────────────────────────────────────────────────────────────────────

function generateOtp(userId, type) {
  const db = getDb();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  db.prepare(`DELETE FROM otp_codes WHERE user_id=? AND type=? AND used=0`).run(userId, type);
  db.prepare(`INSERT INTO otp_codes (user_id,code,type,expires_at) VALUES (?,?,?,?)`).run(userId, code, type, expiresAt);
  return code;
}

function verifyOtp(userId, code, type) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM otp_codes
    WHERE user_id=? AND type=? AND used=0 AND expires_at > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(userId, type);

  if (!row) return { ok: false, error: 'OTP expired or not found' };

  db.prepare(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=?`).run(row.id);
  const updated = db.prepare(`SELECT attempts FROM otp_codes WHERE id=?`).get(row.id);
  if (updated.attempts > 3) {
    db.prepare(`UPDATE otp_codes SET used=1 WHERE id=?`).run(row.id);
    return { ok: false, error: 'Too many attempts — request a new code' };
  }

  const stored = Buffer.from(String(row.code));
  const provided = Buffer.from(String(code));
  if (stored.length !== provided.length || !crypto.timingSafeEqual(stored, provided)) return { ok: false, error: 'Incorrect code' };
  db.prepare(`UPDATE otp_codes SET used=1 WHERE id=?`).run(row.id);
  return { ok: true };
}

// ── SMS OTP ───────────────────────────────────────────────────────────────────

async function sendSmsOtp(phoneNumber, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.log(`[AUTH] SMS OTP for ${phoneNumber}: ${code} (Twilio not configured)`);
    return { ok: true, dev: true };
  }

  try {
    const twilio = require('twilio')(sid, token);
    await twilio.messages.create({
      body: `Your ContentCrafterzz verification code: ${code}. Expires in 10 minutes.`,
      from,
      to: phoneNumber,
    });
    return { ok: true };
  } catch (e) {
    console.error('[AUTH] Twilio error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Internal email helper ─────────────────────────────────────────────────────
// Priority: 1) RESEND_API_KEY  2) SMTP_USER+SMTP_PASS env vars  3) first DB inbox

async function _sendSystemEmail({ to, subject, html }) {
  const nodemailer = require('nodemailer');
  const errs = [];

  // 1. Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const https = require('https');
      const fromAddr = process.env.RESEND_FROM_EMAIL || 'noreply@quelro.com';
      const payload = JSON.stringify({ from: `ContentCrafterzz <${fromAddr}>`, to, subject, html });
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.resend.com', path: '/emails', method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        }, res => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve();
            else reject(new Error(`Resend ${res.statusCode}: ${body}`));
          });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
      return; // sent via Resend
    } catch (e) {
      errs.push(`Resend: ${e.message}`);
      console.warn('[AUTH] Resend failed, trying SMTP fallback:', e.message);
    }
  }

  // 2. SMTP env vars
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    try {
      const fromName = process.env.SMTP_FROM_NAME || 'ContentCrafterzz';
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: parseInt(process.env.SMTP_PORT) === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
      });
      await t.sendMail({ from: `"${fromName}" <${process.env.SMTP_FROM || smtpUser}>`, to, subject, html });
      return; // sent via SMTP
    } catch (e) {
      errs.push(`SMTP: ${e.message}`);
      console.warn('[AUTH] SMTP failed, trying inbox fallback:', e.message);
    }
  }

  // 3. First configured inbox in DB
  try {
    const { getInboxes } = require('./emailService');
    const inboxes = getInboxes();
    if (inboxes.length) {
      const inbox = inboxes[0];
      const t = nodemailer.createTransport({
        host: inbox.host || 'smtp.gmail.com', port: inbox.port || 587,
        secure: inbox.port === 465,
        auth: { user: inbox.email, pass: inbox.pass },
        tls: { rejectUnauthorized: false },
      });
      await t.sendMail({ from: `"ContentCrafterzz" <${inbox.email}>`, to, subject, html });
      return; // sent via inbox
    }
  } catch (e) {
    errs.push(`Inbox: ${e.message}`);
  }

  throw new Error(`All email methods failed: ${errs.join(' | ')}`);
}

// ── Email verification / reset ─────────────────────────────────────────────

async function sendVerificationEmail(user) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`DELETE FROM password_reset_tokens WHERE user_id=? AND used=0`).run(user.id);
  db.prepare(`INSERT INTO password_reset_tokens (user_id,token,expires_at) VALUES (?,?,?)`).run(user.id, token, expiresAt);

  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;

  try {
    await _sendSystemEmail({
      to: user.email,
      subject: 'Verify your ContentCrafterzz account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:12px">
          <h2 style="color:#FF4500;margin:0 0 16px">ContentCrafterzz</h2>
          <p style="font-size:16px;margin:0 0 24px">Hi ${user.full_name || 'there'}, verify your email to activate your account.</p>
          <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF4500,#FF6B35);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">Verify Email</a>
          <p style="color:#666;font-size:12px;margin-top:24px">Link expires in 24 hours. If you didn't sign up, ignore this.</p>
        </div>
      `,
    });
    return { ok: true };
  } catch (e) {
    console.error('[AUTH] Verification email error:', e.message);
    console.log(`[AUTH] Verification link (no SMTP configured): ${verifyUrl}`);
    return { ok: true, dev: true, verifyUrl };
  }
}

async function sendPasswordResetEmail(user) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(`UPDATE password_reset_tokens SET used=1 WHERE user_id=? AND used=0`).run(user.id);
  db.prepare(`INSERT INTO password_reset_tokens (user_id,token,expires_at) VALUES (?,?,?)`).run(user.id, token, expiresAt);

  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  try {
    await _sendSystemEmail({
      to: user.email,
      subject: 'Reset your ContentCrafterzz password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:12px">
          <h2 style="color:#FF4500;margin:0 0 16px">Password Reset</h2>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF4500,#FF6B35);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">Reset Password</a>
          <p style="color:#666;font-size:12px;margin-top:24px">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    return { ok: true, resetUrl };
  } catch (e) {
    console.log(`[AUTH] Password reset link (no SMTP configured): ${resetUrl}`);
    return { ok: true, dev: true, resetUrl };
  }
}

async function sendOtpEmail(user, code) {
  try {
    await _sendSystemEmail({
      to: user.email,
      subject: 'Your ContentCrafterzz login code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:12px">
          <h2 style="color:#FF4500;margin:0 0 16px">Login Code</h2>
          <p style="margin:0 0 16px">Hi ${user.full_name || 'there'}, here is your one-time login code:</p>
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#FF4500">${code}</div>
          <p style="color:#666;font-size:12px;margin-top:16px">Expires in 10 minutes. If you didn't request this, ignore it.</p>
        </div>
      `,
    });
    return { ok: true };
  } catch (e) {
    console.error('[AUTH] OTP email error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Usage limits ──────────────────────────────────────────────────────────────

const PLAN_LIMITS = {
  trial:   { leads: 300,      emails: 300 },
  free:    { leads: 300,      emails: 300 },
  starter: { leads: 5000,     emails: 2000 },      // $49/mo
  pro:     { leads: 10000,    emails: 10000 },     // $199/mo
  growth:  { leads: 10000,    emails: 10000 },
  agency:  { leads: Infinity, emails: Infinity },  // $599/mo
};

function checkUsageLimit(user, type) {
  const db = getDb();

  // Agency is unlimited
  if (user.plan === 'agency' && user.plan_status === 'active') {
    return { allowed: true, limit: Infinity, used: 0 };
  }

  // Cancelled or past_due — enforce trial-level limits regardless of plan
  const effectivePlan = (user.plan_status === 'cancelled' || user.plan_status === 'past_due')
    ? 'trial'
    : (user.plan || 'free');

  // Reset monthly counter if past reset date
  if (user.usage_reset_date && new Date(user.usage_reset_date) <= new Date()) {
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1, 1);
    db.prepare(`UPDATE users SET leads_used_this_month=0, emails_used_this_month=0, usage_reset_date=? WHERE id=?`)
      .run(nextReset.toISOString().split('T')[0], user.id);
    user.leads_used_this_month = 0;
    user.emails_used_this_month = 0;
  }

  const baseLimits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.free;
  const limits = {
    leads:  user.custom_leads_limit  != null ? user.custom_leads_limit  : baseLimits.leads,
    emails: user.custom_emails_limit != null ? user.custom_emails_limit : baseLimits.emails,
  };
  if (type === 'leads') return { allowed: user.leads_used_this_month < limits.leads, limit: limits.leads, used: user.leads_used_this_month };
  if (type === 'emails') return { allowed: user.emails_used_this_month < limits.emails, limit: limits.emails, used: user.emails_used_this_month };
  return { allowed: true };
}

function incrementUsage(userId, type, amount = 1) {
  const db = getDb();
  if (type === 'leads') db.prepare(`UPDATE users SET leads_used_this_month=leads_used_this_month+? WHERE id=?`).run(amount, userId);
  if (type === 'emails') db.prepare(`UPDATE users SET emails_used_this_month=emails_used_this_month+? WHERE id=?`).run(amount, userId);
}

module.exports = { generateOtp, verifyOtp, sendSmsOtp, sendVerificationEmail, sendPasswordResetEmail, sendOtpEmail, checkUsageLimit, incrementUsage, PLAN_LIMITS };
