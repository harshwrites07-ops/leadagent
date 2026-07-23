const { google } = require('googleapis');
const crypto = require('crypto');
const { getDb } = require('../models/database');
const { SendError } = require('./sendErrors');

// gmail.readonly was previously requested but never used anywhere in this
// codebase (reply/bounce detection goes through IMAP in emailService.js,
// not the Gmail API) — it's a "restricted" scope under Google's OAuth
// verification tiers, requiring a paid annual CASA security assessment on
// top of standard review. Dropping it leaves only gmail.send, a "sensitive"
// (not restricted) scope — standard verification only, no CASA required.
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
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

// Pulls Google's own error text out of whatever shape googleapis throws —
// varies between a plain Error, an axios-style response, and the legacy
// `errors` array — so callers always get the real provider message instead
// of a generic "Request failed with status code 401".
function extractGoogleErrorMessage(apiErr) {
  return apiErr?.response?.data?.error?.message
    || apiErr?.errors?.[0]?.message
    || apiErr?.message
    || 'Unknown Gmail API error';
}

function isAuthError(apiErr) {
  const status = apiErr?.code || apiErr?.response?.status || apiErr?.status;
  return status === 401 || status === '401';
}

async function getRefreshedAuth(account) {
  // P0-3 root cause #1 — Google only issues a refresh_token when the consent
  // URL includes access_type=offline AND prompt=consent (getAuthUrl() does
  // both, but accounts connected before that fix don't have one on file).
  // Without it the stored access_token is a dead end the instant it expires
  // — fail loud and specific instead of letting oauth2Client silently try to
  // refresh with a null token.
  if (!account.refresh_token) {
    await getDb().run(`UPDATE gmail_accounts SET status='revoked' WHERE id=?`, [account.id]);
    throw new SendError('OAUTH_TOKEN_EXPIRED', `No refresh_token on file for ${account.email} — this account was connected before offline access was requested and must be reconnected.`);
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.token_expiry,
  });

  if (account.token_expiry && Date.now() > account.token_expiry - 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await getDb().run(`UPDATE gmail_accounts SET access_token=?, token_expiry=? WHERE id=?`,
        [credentials.access_token, credentials.expiry_date, account.id]);
      oauth2Client.setCredentials(credentials);
    } catch (e) {
      await getDb().run(`UPDATE gmail_accounts SET status='revoked' WHERE id=?`, [account.id]);
      throw new SendError('OAUTH_TOKEN_EXPIRED', `Refresh failed for ${account.email}: ${extractGoogleErrorMessage(e)}`);
    }
  }

  return oauth2Client;
}

// Forces a refresh regardless of the cached expiry_date — used when Gmail
// itself returns 401 mid-send, which happens when a token was revoked
// server-side (user removed app access, password change, etc.) and the
// locally cached expiry_date still looks valid. This is P0-3 root cause #2:
// previously a 401 here just failed the send outright with no retry.
async function forceRefresh(account) {
  if (!account.refresh_token) {
    await getDb().run(`UPDATE gmail_accounts SET status='revoked' WHERE id=?`, [account.id]);
    throw new SendError('OAUTH_TOKEN_EXPIRED', `No refresh_token on file for ${account.email}.`);
  }
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: account.refresh_token });
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await getDb().run(`UPDATE gmail_accounts SET access_token=?, token_expiry=? WHERE id=?`,
      [credentials.access_token, credentials.expiry_date, account.id]);
    oauth2Client.setCredentials(credentials);
    return oauth2Client;
  } catch (e) {
    await getDb().run(`UPDATE gmail_accounts SET status='revoked' WHERE id=?`, [account.id]);
    throw new SendError('OAUTH_TOKEN_EXPIRED', `Forced refresh failed for ${account.email}: ${extractGoogleErrorMessage(e)}`);
  }
}

function buildGmailMime({ account, to, subject, htmlBody, fromName }) {
  const displayName = fromName || 'ContentCrafterzz';
  const boundary = `ccz_${Date.now()}`;
  return [
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
}

async function sendViaGmail(account, { to, subject, htmlBody, fromName }) {
  console.log(`[Gmail] Sending via ${account.email} → ${to}`);
  // Reset daily counter if needed
  const today = new Date().toISOString().split('T')[0];
  if (account.last_reset_date !== today) {
    await getDb().run(`UPDATE gmail_accounts SET emails_sent_today=0, last_reset_date=? WHERE id=?`, [today, account.id]);
    account.emails_sent_today = 0;
  }

  if (account.emails_sent_today >= GMAIL_DAILY_LIMIT) {
    throw new SendError('DAILY_LIMIT_REACHED', `${account.email} has sent ${account.emails_sent_today}/${GMAIL_DAILY_LIMIT} today.`);
  }

  let auth = await getRefreshedAuth(account);
  console.log(`[Gmail] Token refreshed OK for ${account.email}`);

  const mime = buildGmailMime({ account, to, subject, htmlBody, fromName });
  const raw = Buffer.from(mime).toString('base64url');

  const attemptSend = (authClient) => google.gmail({ version: 'v1', auth: authClient })
    .users.messages.send({ userId: 'me', requestBody: { raw } });

  try {
    await attemptSend(auth);
  } catch (apiErr) {
    if (isAuthError(apiErr)) {
      // Cached expiry looked fine but Google says otherwise — force a fresh
      // token and retry exactly once before giving up.
      console.warn(`[Gmail] 401 from Google for ${account.email} despite cached token — forcing refresh and retrying once`);
      try {
        auth = await forceRefresh(account);
        await attemptSend(auth);
      } catch (retryErr) {
        if (retryErr instanceof SendError) throw retryErr;
        console.error(`[Gmail] Retry after forced refresh still failed for ${account.email}:`, retryErr.message, retryErr.errors || '');
        throw new SendError(isAuthError(retryErr) ? 'OAUTH_TOKEN_EXPIRED' : 'GMAIL_API_ERROR', extractGoogleErrorMessage(retryErr));
      }
    } else {
      console.error(`[Gmail] API send error for ${account.email}:`, apiErr.message, apiErr.errors || '');
      throw new SendError('GMAIL_API_ERROR', extractGoogleErrorMessage(apiErr));
    }
  }

  await getDb().run(`UPDATE gmail_accounts SET emails_sent_today=emails_sent_today+1 WHERE id=?`, [account.id]);

  console.log(`[Gmail] Send success: ${account.email} → ${to}`);
  return { ok: true, sentFrom: account.email };
}

async function getAccountsForUser(userId) {
  return getDb().all('SELECT * FROM gmail_accounts WHERE user_id=? ORDER BY connected_at ASC', [userId]);
}

async function pickAccountForUser(userId) {
  const today = new Date().toISOString().split('T')[0];
  await getDb().run(`UPDATE gmail_accounts SET emails_sent_today=0, last_reset_date=? WHERE user_id=? AND (last_reset_date IS NULL OR last_reset_date != ?)`, [today, userId, today]);
  return getDb().get(`SELECT * FROM gmail_accounts WHERE user_id=? AND status='active' AND emails_sent_today < ? ORDER BY emails_sent_today ASC LIMIT 1`, [userId, GMAIL_DAILY_LIMIT]);
}

function getGmailLimit(plan) {
  return PLAN_GMAIL_LIMITS[plan] ?? 0;
}

module.exports = { getAuthUrl, verifyState, exchangeCodeForTokens, sendViaGmail, getAccountsForUser, pickAccountForUser, getGmailLimit, GMAIL_DAILY_LIMIT };
