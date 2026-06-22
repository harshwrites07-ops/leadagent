const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const { getAuthUrl, verifyState, exchangeCodeForTokens, getAccountsForUser, getGmailLimit, GMAIL_DAILY_LIMIT } = require('../services/gmailService');
const { getDb } = require('../models/database');

// Public ping to verify routes are loaded
router.get('/ping', (req, res) => res.json({ ok: true, routes: 'gmail' }));

// GET /api/gmail/auth-url — returns the OAuth URL for connecting Gmail
router.get('/auth-url', requireAuth, asyncHandler(async (req, res) => {
  if (!process.env.GMAIL_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ success: false, error: 'Gmail OAuth not configured on this server' });
  }
  const limit = getGmailLimit(req.user.plan);
  const accounts = await getAccountsForUser(req.user.id);
  if (accounts.length >= limit) {
    return res.status(403).json({ success: false, error: `Your plan allows ${limit} Gmail account(s). Upgrade to connect more.` });
  }
  res.json({ success: true, url: getAuthUrl(req.user.id) });
}));

// GET /api/gmail/callback — OAuth callback from Google
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`/settings?gmail_error=${encodeURIComponent(error)}`);
  if (!code || !state) return res.redirect('/settings?gmail_error=missing_code');

  const userId = verifyState(state);
  if (!userId) return res.redirect('/settings?gmail_error=invalid_state');

  try {
    const tokens = await exchangeCodeForTokens(code);
    const db = getDb();

    await db.run(`
      INSERT INTO gmail_accounts (user_id, email, access_token, refresh_token, token_expiry, status)
      VALUES (?, ?, ?, ?, ?, 'active')
      ON CONFLICT(user_id, email) DO UPDATE SET
        access_token=EXCLUDED.access_token,
        refresh_token=COALESCE(EXCLUDED.refresh_token, gmail_accounts.refresh_token),
        token_expiry=EXCLUDED.token_expiry,
        status='active'
    `, [userId, tokens.email, tokens.access_token, tokens.refresh_token || null, tokens.token_expiry || null]);

    res.redirect('/settings?gmail_connected=1');
  } catch (e) {
    console.error('[Gmail] OAuth callback error:', e.message);
    res.redirect(`/settings?gmail_error=${encodeURIComponent(e.message)}`);
  }
}));

// GET /api/gmail/accounts — list connected accounts for current user
router.get('/accounts', requireAuth, asyncHandler(async (req, res) => {
  const rawAccounts = await getAccountsForUser(req.user.id);
  const accounts = rawAccounts.map(a => ({
    id: a.id,
    email: a.email,
    status: a.status,
    emails_sent_today: a.emails_sent_today,
    daily_limit: a.daily_limit || GMAIL_DAILY_LIMIT,
    connected_at: a.connected_at,
  }));
  const limit = getGmailLimit(req.user.plan);
  res.json({ success: true, accounts, limit });
}));

// DELETE /api/gmail/accounts/:id — disconnect an account
router.delete('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await getDb().run('DELETE FROM gmail_accounts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (result.changes === 0) return res.status(404).json({ success: false, error: 'Account not found' });
  res.json({ success: true });
}));

// POST /api/gmail/accounts/:id/reconnect — re-trigger OAuth for a specific account
router.post('/accounts/:id/reconnect', requireAuth, (req, res) => {
  if (!process.env.GMAIL_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) {
    return res.status(501).json({ success: false, error: 'Gmail OAuth not configured' });
  }
  res.json({ success: true, url: getAuthUrl(req.user.id) });
});

module.exports = router;
