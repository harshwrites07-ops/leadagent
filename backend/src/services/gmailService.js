const { google } = require('googleapis');
const crypto = require('crypto');
const { getDb } = require('../models/database');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const GMAIL_DAILY_LIMIT = 500;

const PLAN_GMAIL_LIMITS = {
  trial:   1,
  free:    1,
  starter: 2,
  pro:     4,
  growth:  4,
  agency:  10,
};

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'https://app.quelro.com'}/api/gmail/callback`
  );
}

function signState(userId) {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const sig = crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 16);
  return `${userId}.${sig}`;
}

function verifyState(state) {
  if (!state) return null;
  const dot = state.lastIndexOf('.');
  if (dot < 0) {
    // Legacy unsigned state — allow only in dev
    if (process.env.NODE_ENV !== 'production') return parseInt(state) || null;
    return null;
  }
  const userId = parseInt(state.slice(0, dot));
  const sig = state.slice(dot + 1);
  if (!userId || !sig) return null;
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const expected = crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 16);
  // Constant-time compare
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return userId;
}

function getAuthUrl(userId) {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: signState(userId),
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  return {
    email: data.email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: tokens.expiry_date,
  };
}

async function getRefreshedAuth(account) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.token_expiry,
  });

  // Refresh if expiring within 5 minutes
  if (account.token_expiry && Date.now() > account.token_expiry - 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      getDb()
        .prepare(`UPDATE gmail_accounts SET access_token=?, token_expiry=? WHERE id=?`)
        .run(credentials.access_token, credentials.expiry_date, account.id);
      oauth2Client.setCredentials(credentials);
    } catch (e) {
      // Mark as revoked if refresh fails
      getDb().prepare(`UPDATE gmail_accounts SET status='revoked' WHERE id=?`).run(account.id);
      throw new Error(`Gmail token revoked for ${account.email} — user must reconnect`);
    }
  }

  return oauth2Client;
}

async function sendViaGmail(account, { to, subject, htmlBody, fromName }) {
  console.log(`[Gmail] Sending via ${account.email} → ${to}`);
  // Reset daily counter if needed
  const today = new Date().toISOString().split('T')[0];
  if (account.last_reset_date !== today) {
    getDb()
      .prepare(`UPDATE gmail_accounts SET emails_sent_today=0, last_reset_date=? WHERE id=?`)
      .run(today, account.id);
    account.emails_sent_today = 0;
  }

  if (account.emails_sent_today >= GMAIL_DAILY_LIMIT) {
    throw new Error(`Daily limit reached for ${account.email}`);
  }

  const auth = await getRefreshedAuth(account);
  console.log(`[Gmail] Token refreshed OK for ${account.email}`);
  const gmail = google.gmail({ version: 'v1', auth });

  const displayName = fromName || 'ContentCrafterzz';
  const boundary = `ccz_${Date.now()}`;

  const mime = [
    `From: "${displayName}" <${account.email}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(htmlBody).toString('base64'),
    ``,
    `--${boundary}--`,
  ].join('\r\n');

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: Buffer.from(mime).toString('base64url') },
    });
  } catch (apiErr) {
    console.error(`[Gmail] API send error for ${account.email}:`, apiErr.message, apiErr.errors || '');
    throw apiErr;
  }

  getDb()
    .prepare(`UPDATE gmail_accounts SET emails_sent_today=emails_sent_today+1 WHERE id=?`)
    .run(account.id);

  console.log(`[Gmail] Send success: ${account.email} → ${to}`);
  return { ok: true, sentFrom: account.email };
}

function getAccountsForUser(userId) {
  return getDb()
    .prepare('SELECT * FROM gmail_accounts WHERE user_id=? ORDER BY connected_at ASC')
    .all(userId);
}

function pickAccountForUser(userId) {
  const today = new Date().toISOString().split('T')[0];
  // Reset stale daily counters first
  getDb()
    .prepare(`UPDATE gmail_accounts SET emails_sent_today=0, last_reset_date=? WHERE user_id=? AND (last_reset_date IS NULL OR last_reset_date != ?)`)
    .run(today, userId, today);

  return getDb()
    .prepare(`SELECT * FROM gmail_accounts WHERE user_id=? AND status='active' AND emails_sent_today < ? ORDER BY emails_sent_today ASC LIMIT 1`)
    .get(userId, GMAIL_DAILY_LIMIT);
}

function getGmailLimit(plan) {
  return PLAN_GMAIL_LIMITS[plan] ?? 0;
}

module.exports = { getAuthUrl, verifyState, exchangeCodeForTokens, sendViaGmail, getAccountsForUser, pickAccountForUser, getGmailLimit, GMAIL_DAILY_LIMIT };
