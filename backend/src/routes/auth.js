const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDb, getUserById, getUserByEmail } = require('../models/database');
const { requireAuth, requireAdmin, isTrialExpired } = require('../middleware/requireAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  generateOtp, verifyOtp, sendSmsOtp,
  sendVerificationEmail, sendPasswordResetEmail, sendOtpEmail,
  checkUsageLimit, PLAN_LIMITS,
} = require('../services/authService');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, error: 'Too many login attempts. Try again in 15 minutes.' }),
});

const safeUser = (u) => u ? {
  id: u.id, email: u.email, full_name: u.full_name, agency_name: u.agency_name,
  role: u.role, plan: u.plan, plan_status: u.plan_status, is_admin: u.is_admin,
  email_verified: u.email_verified, phone_verified: u.phone_verified,
  phone_number: u.phone_number, profile_picture: u.profile_picture,
  onboarding_completed: u.onboarding_completed, created_at: u.created_at,
  leads_used_this_month: u.leads_used_this_month,
  emails_used_this_month: u.emails_used_this_month,
  usage_reset_date: u.usage_reset_date,
  target_niches: u.target_niches, target_platforms: u.target_platforms,
  portfolio_url: u.portfolio_url, daily_email_limit: u.daily_email_limit,
  // Voice DNA profile fields
  service_type: u.service_type, one_liner: u.one_liner,
  experience_years: u.experience_years, best_result: u.best_result,
  pricing_range: u.pricing_range, personality_traits: u.personality_traits,
  outreach_goal: u.outreach_goal, origin_story: u.origin_story,
  unique_difference: u.unique_difference, profile_completed: u.profile_completed,
  voice_dna: u.voice_dna,
} : null;

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const limits = PLAN_LIMITS[req.user.plan] || PLAN_LIMITS.free;
  const trialExpired = isTrialExpired(req.user);
  const trialDaysLeft = req.user.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(req.user.trial_ends_at) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  res.json({ success: true, user: safeUser(req.user), limits, trialExpired, trialDaysLeft });
});

// ── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, full_name, phone_number } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ success: false, error: 'email, password and full_name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ success: false, error: 'Email already registered', code: 'EMAIL_EXISTS' });
  }

  if (phone_number) {
    const existingPhone = db.prepare('SELECT id FROM users WHERE phone_number=?').get(phone_number);
    if (existingPhone) {
      return res.status(409).json({ success: false, error: 'Phone number already registered', code: 'PHONE_EXISTS' });
    }
  }

  const hashed = await bcrypt.hash(password, 12);
  const result = db.prepare(`
    INSERT INTO users (email, password, full_name, phone_number, plan, plan_status)
    VALUES (?, ?, ?, ?, 'trial', 'active')
  `).run(email.toLowerCase().trim(), hashed, full_name.trim(), phone_number || null);

  const user = getUserById(result.lastInsertRowid);

  // Send email verification — await so we can include verifyUrl in response if email fails
  const emailResult = await sendVerificationEmail(user).catch(e => ({ ok: false, error: e.message }));

  // Send phone OTP if phone provided
  if (phone_number) {
    const code = generateOtp(user.id, 'phone');
    sendSmsOtp(phone_number, code).catch(() => {});
  }

  req.session.userId = user.id;
  req.session.save(err => {
    if (err) console.error('[AUTH] Session save error:', err);
    res.status(201).json({
      success: true,
      user: safeUser(user),
      needsVerification: true,
      message: 'Account created! Check your email to verify.',
      // Include link in response when email service isn't configured (dev/staging)
      ...(emailResult.dev && { _devVerifyUrl: emailResult.verifyUrl }),
    });
  });
}));

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password, remember } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const db = getDb();
  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  // Lockout check
  if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
    const mins = Math.ceil((new Date(user.lockout_until) - Date.now()) / 60000);
    return res.status(429).json({ success: false, error: `Too many attempts. Try again in ${mins} minute(s).`, code: 'LOCKED_OUT' });
  }

  if (!user.password) {
    return res.status(401).json({ success: false, error: 'This account uses Google login — use "Continue with Google"', code: 'USE_GOOGLE' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    const attempts = (user.login_attempts || 0) + 1;
    const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    db.prepare(`UPDATE users SET login_attempts=?, lockout_until=? WHERE id=?`).run(attempts, lockout, user.id);
    if (lockout) {
      return res.status(429).json({ success: false, error: 'Too many failed attempts. Locked out for 15 minutes.', code: 'LOCKED_OUT' });
    }
    return res.status(401).json({ success: false, error: 'Invalid email or password', attemptsLeft: 5 - attempts });
  }

  // Reset attempts on success
  db.prepare(`UPDATE users SET login_attempts=0, lockout_until=NULL, last_login=CURRENT_TIMESTAMP WHERE id=?`).run(user.id);

  req.session.userId = user.id;
  if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  req.session.save(err => {
    if (err) console.error('[AUTH] Session save error:', err);
    res.json({ success: true, user: safeUser(user), limits });
  });
}));

// ── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ccz.sid');
    res.json({ success: true });
  });
});

// ── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });

  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token=? AND used=0 AND expires_at > datetime('now')
  `).get(token);

  if (!row) return res.status(400).json({ success: false, error: 'Invalid or expired link' });

  db.prepare(`UPDATE users SET email_verified=1 WHERE id=?`).run(row.user_id);
  db.prepare(`UPDATE password_reset_tokens SET used=1 WHERE id=?`).run(row.id);

  const user = getUserById(row.user_id);
  if (req.session.userId === row.user_id) {
    req.session.save(() => {});
  }

  res.json({ success: true, message: 'Email verified!', user: safeUser(user) });
}));

// ── POST /api/auth/resend-verification ─────────────────────────────────────
router.post('/resend-verification', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.email_verified) {
    return res.json({ success: true, message: 'Email already verified' });
  }
  await sendVerificationEmail(req.user);
  res.json({ success: true, message: 'Verification email sent' });
}));

// ── POST /api/auth/send-phone-otp ───────────────────────────────────────────
router.post('/send-phone-otp', requireAuth, asyncHandler(async (req, res) => {
  const { phone_number } = req.body;
  const phone = phone_number || req.user.phone_number;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number required' });

  const db = getDb();
  if (phone_number && phone_number !== req.user.phone_number) {
    const existing = db.prepare('SELECT id FROM users WHERE phone_number=? AND id != ?').get(phone_number, req.user.id);
    if (existing) return res.status(409).json({ success: false, error: 'Phone already registered' });
    db.prepare(`UPDATE users SET phone_number=? WHERE id=?`).run(phone_number, req.user.id);
  }

  const code = generateOtp(req.user.id, 'phone');
  const result = await sendSmsOtp(phone, code);
  res.json({ success: true, dev: result.dev || false, message: result.dev ? 'OTP in server console (SMS not configured)' : 'OTP sent' });
}));

// ── POST /api/auth/verify-phone-otp ─────────────────────────────────────────
router.post('/verify-phone-otp', requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Code required' });

  const result = verifyOtp(req.user.id, code, 'phone');
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });

  const db = getDb();
  db.prepare(`UPDATE users SET phone_verified=1 WHERE id=?`).run(req.user.id);
  const user = getUserById(req.user.id);
  res.json({ success: true, message: 'Phone verified!', user: safeUser(user) });
}));

// ── POST /api/auth/phone-login ──────────────────────────────────────────────
router.post('/phone-login', loginLimiter, asyncHandler(async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) return res.status(400).json({ success: false, error: 'Phone number required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE phone_number=?').get(phone_number);
  if (!user) return res.status(404).json({ success: false, error: 'No account with this phone number' });

  const code = generateOtp(user.id, 'phone_login');
  const smsResult = await sendSmsOtp(phone_number, code);
  if (smsResult.dev && user.email) {
    await sendOtpEmail(user, code);
    return res.json({ success: true, userId: user.id, message: `OTP sent to ${user.email}`, viaEmail: true });
  }
  res.json({ success: true, userId: user.id, message: smsResult.dev ? 'OTP in server console (Twilio not configured)' : 'OTP sent via SMS' });
}));

router.post('/phone-login/verify', asyncHandler(async (req, res) => {
  const { user_id, phone_number, code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'code required' });

  let resolvedUserId = user_id;
  if (!resolvedUserId && phone_number) {
    const userRow = getDb().prepare('SELECT id FROM users WHERE phone_number=?').get(phone_number);
    if (!userRow) return res.status(404).json({ success: false, error: 'No account with this phone number' });
    resolvedUserId = userRow.id;
  }
  if (!resolvedUserId) return res.status(400).json({ success: false, error: 'user_id or phone_number required' });

  const result = verifyOtp(resolvedUserId, code, 'phone_login');
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });

  const db = getDb();
  db.prepare(`UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?`).run(resolvedUserId);
  const user = getUserById(resolvedUserId);
  req.session.userId = user.id;
  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  req.session.save(err => {
    if (err) console.error('[AUTH] Session save error:', err);
    res.json({ success: true, user: safeUser(user), limits });
  });
}));

// ── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', loginLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });

  const user = getUserByEmail(email);
  if (!user) {
    // Don't reveal whether email exists
    return res.json({ success: true, message: 'If that email is registered, a reset link was sent.' });
  }

  const result = await sendPasswordResetEmail(user);
  res.json({ success: true, message: 'If that email is registered, a reset link was sent.', dev: result.dev, resetUrl: result.resetUrl });
}));

// ── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token=? AND used=0 AND expires_at > datetime('now')
  `).get(token);

  if (!row) return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });

  const hashed = await bcrypt.hash(password, 12);
  db.prepare(`UPDATE users SET password=?, login_attempts=0, lockout_until=NULL WHERE id=?`).run(hashed, row.user_id);
  db.prepare(`UPDATE password_reset_tokens SET used=1 WHERE id=?`).run(row.id);

  res.json({ success: true, message: 'Password updated! You can now log in.' });
}));

// ── PUT /api/auth/onboarding ────────────────────────────────────────────────
router.put('/onboarding', requireAuth, asyncHandler(async (req, res) => {
  const {
    full_name, agency_name, role, target_niches, target_platforms, portfolio_url,
    daily_email_limit, auto_find_leads,
    // Voice DNA profile fields
    service_type, one_liner, experience_years, best_result, pricing_range,
    personality_traits, outreach_goal, origin_story, unique_difference, profile_completed,
  } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE users SET
      full_name=COALESCE(?,full_name),
      agency_name=COALESCE(?,agency_name),
      role=COALESCE(?,role),
      target_niches=COALESCE(?,target_niches),
      target_platforms=COALESCE(?,target_platforms),
      portfolio_url=COALESCE(?,portfolio_url),
      daily_email_limit=COALESCE(?,daily_email_limit),
      auto_find_leads=COALESCE(?,auto_find_leads),
      service_type=COALESCE(?,service_type),
      one_liner=COALESCE(?,one_liner),
      experience_years=COALESCE(?,experience_years),
      best_result=COALESCE(?,best_result),
      pricing_range=COALESCE(?,pricing_range),
      personality_traits=COALESCE(?,personality_traits),
      outreach_goal=COALESCE(?,outreach_goal),
      origin_story=COALESCE(?,origin_story),
      unique_difference=COALESCE(?,unique_difference),
      profile_completed=COALESCE(?,profile_completed),
      voice_dna='{}',
      onboarding_completed=1
    WHERE id=?
  `).run(
    full_name || null, agency_name || null, role || null,
    target_niches ? JSON.stringify(target_niches) : null,
    target_platforms ? JSON.stringify(target_platforms) : null,
    portfolio_url || null, daily_email_limit || null,
    auto_find_leads != null ? (auto_find_leads ? 1 : 0) : null,
    service_type || null, one_liner || null, experience_years || null,
    best_result || null, pricing_range || null,
    personality_traits ? JSON.stringify(personality_traits) : null,
    outreach_goal || null, origin_story || null, unique_difference || null,
    profile_completed != null ? profile_completed : null,
    req.user.id,
  );

  const { setSetting } = require('../models/database');
  if (full_name) setSetting('your_name', full_name);
  if (agency_name) setSetting('agency_name', agency_name);

  // Rebuild voice DNA immediately
  try {
    const { rebuildVoiceDNA } = require('../services/voiceDNA');
    await rebuildVoiceDNA(req.user.id);
  } catch {}

  const user = getUserById(req.user.id);
  res.json({ success: true, user: safeUser(user) });
}));

// ── PUT /api/auth/profile — update voice profile from Settings ───────────────
router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const allowed = ['full_name','service_type','one_liner','experience_years','best_result',
    'target_niches','pricing_range','personality_traits','outreach_goal','origin_story','unique_difference'];
  const db = getDb();
  const sets = [], vals = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key}=?`);
      const v = req.body[key];
      vals.push(Array.isArray(v) ? JSON.stringify(v) : v);
    }
  }
  if (!sets.length) return res.json({ success: true });
  sets.push('voice_dna=?'); vals.push('{}'); // invalidate cached DNA
  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);

  try {
    const { rebuildVoiceDNA } = require('../services/voiceDNA');
    const dna = await rebuildVoiceDNA(req.user.id);
    const user = getUserById(req.user.id);
    return res.json({ success: true, user: safeUser(user), voice_dna: dna });
  } catch {}

  const user = getUserById(req.user.id);
  res.json({ success: true, user: safeUser(user) });
}));

// ── PUT /api/auth/profile ───────────────────────────────────────────────────
router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const { full_name, agency_name, role, portfolio_url } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE users SET
      full_name=COALESCE(?,full_name),
      agency_name=COALESCE(?,agency_name),
      role=COALESCE(?,role),
      portfolio_url=COALESCE(?,portfolio_url)
    WHERE id=?
  `).run(full_name || null, agency_name || null, role || null, portfolio_url || null, req.user.id);
  const user = getUserById(req.user.id);
  res.json({ success: true, user: safeUser(user) });
}));

// ── GET /api/auth/usage ─────────────────────────────────────────────────────
router.get('/usage', requireAuth, (req, res) => {
  const limits = PLAN_LIMITS[req.user.plan] || PLAN_LIMITS.free;
  res.json({
    success: true,
    usage: {
      leads: { used: req.user.leads_used_this_month, limit: limits.leads },
      emails: { used: req.user.emails_used_this_month, limit: limits.emails },
      reset_date: req.user.usage_reset_date,
      plan: req.user.plan,
    },
  });
});

// ── ADMIN routes ─────────────────────────────────────────────────────────────

router.get('/admin/stats', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const activeToday = db.prepare(`SELECT COUNT(*) as c FROM users WHERE last_login >= datetime('now','-30 days')`).get();
  const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get();
  const totalEmails = db.prepare('SELECT COUNT(*) as c FROM emails').get();
  let masterLeads = 0, masterWithEmail = 0, masterErr = null;
  try {
    masterLeads = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
    masterWithEmail = db.prepare("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''").get().c;
  } catch (e) { masterErr = e.message; }

  const users = db.prepare(`
    SELECT id, email, full_name, agency_name, plan, plan_status, is_admin,
           leads_used_this_month, emails_used_this_month, created_at, last_login,
           email_verified, phone_verified, custom_emails_limit, custom_leads_limit
    FROM users ORDER BY created_at DESC
  `).all();

  res.json({
    success: true,
    stats: {
      total_users: totalUsers.c,
      active_users: activeToday.c,
      total_leads: totalLeads.c,
      total_emails: totalEmails.c,
      master_leads: masterLeads,
      master_with_email: masterWithEmail,
      master_err: masterErr,
    },
    users,
  });
}));

router.put('/admin/users/:id/plan', requireAdmin, asyncHandler(async (req, res) => {
  const { plan, plan_status } = req.body;
  const validPlans = ['free', 'trial', 'starter', 'pro', 'growth', 'agency'];
  if (plan && !validPlans.includes(plan)) {
    return res.status(400).json({ success: false, error: 'Invalid plan' });
  }
  const db = getDb();
  db.prepare(`UPDATE users SET plan=COALESCE(?,plan), plan_status=COALESCE(?,plan_status) WHERE id=?`)
    .run(plan || null, plan_status || null, req.params.id);
  res.json({ success: true });
}));

router.put('/admin/users/:id/limits', requireAdmin, asyncHandler(async (req, res) => {
  const { emails_limit, leads_limit, emails_used, leads_used } = req.body;
  const db = getDb();
  const sets = [], vals = [];
  if (emails_limit !== undefined) { sets.push('custom_emails_limit=?'); vals.push(emails_limit === '' ? null : parseInt(emails_limit)); }
  if (leads_limit !== undefined) { sets.push('custom_leads_limit=?'); vals.push(leads_limit === '' ? null : parseInt(leads_limit)); }
  if (emails_used !== undefined) { sets.push('emails_used_this_month=?'); vals.push(parseInt(emails_used) || 0); }
  if (leads_used !== undefined) { sets.push('leads_used_this_month=?'); vals.push(parseInt(leads_used) || 0); }
  if (!sets.length) return res.json({ success: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ success: true });
}));

router.delete('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.json({ success: true });
}));

router.post('/admin/users/:id/reset-usage', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE users SET leads_used_this_month=0, emails_used_this_month=0 WHERE id=?`).run(req.params.id);
  res.json({ success: true });
}));

router.put('/admin/users/:id/ban', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  const lockout = user.lockout_until ? null : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`UPDATE users SET lockout_until=? WHERE id=?`).run(lockout, req.params.id);
  res.json({ success: true, banned: !!lockout });
}));

// ── Admin: bulk seed master_leads from JSON payload ───────────────────────────
router.post('/admin/seed-master-leads', requireAdmin, asyncHandler(async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ success: false, error: 'leads array required' });
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO master_leads
      (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
       email, website, channel_description, lead_score, temperature, country, niche)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let inserted = 0;
  const doInsert = db.transaction(rows => {
    for (const l of rows) {
      if (!l.channel_name) continue;
      const r = stmt.run(l.channel_id||null, l.channel_name, l.channel_handle||null,
        l.subscriber_count||0, l.avg_views||0, l.email||null, l.website||null,
        l.channel_description||null, l.lead_score||50, l.temperature||'warm', l.country||null, l.niche||null);
      if (r.changes > 0) inserted++;
    }
  });
  doInsert(leads);
  const total = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
  const withEmail = db.prepare("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''").get().c;
  res.json({ success: true, inserted, total, withEmail });
}));

// ── Admin: raw DB debug ──────────────────────────────────────────────────────
router.get('/admin/debug-db', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  const results = {};
  try { results.tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name); } catch (e) { results.tables_err = e.message; }
  try { results.master_count = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c; } catch (e) { results.master_count_err = e.message; }
  try { results.master_sample = db.prepare('SELECT channel_name, email FROM master_leads WHERE email IS NOT NULL LIMIT 3').all(); } catch (e) { results.master_sample_err = e.message; }
  try {
    const fs = require('fs');
    const dbPath = process.env.DB_PATH || '/app/backend/data/outreach.db';
    results.db_path = dbPath;
    results.db_exists = fs.existsSync(dbPath);
    results.db_size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  } catch (e) { results.path_err = e.message; }
  res.json(results);
}));

// ── Admin: seeder status ─────────────────────────────────────────────────────
router.get('/admin/seeder-status', requireAdmin, asyncHandler(async (req, res) => {
  let seederStatus = { running: false, lastCycleSaved: 0, lastCycleAt: null, totalCycles: 0, currentKeyword: null, keysActive: 0, keysTotal: 0 };
  try { seederStatus = require('../services/backgroundSeeder').seederStatus || seederStatus; } catch {}
  let total = 0, withEmail = 0;
  try {
    const db = getDb();
    total = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c || 0;
    withEmail = db.prepare("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''").get().c || 0;
  } catch {}
  // Show how many YouTube API keys are actually loaded
  let ytKeyCount = 0;
  try {
    const keys = [];
    for (let i = 1; i <= 20; i++) { if (process.env[`YOUTUBE_API_KEY_${i}`]) keys.push(i); }
    if (process.env.YOUTUBE_API_KEY) keys.push(0);
    ytKeyCount = keys.length;
  } catch {}
  res.json({ success: true, seederStatus, total, withEmail, ytKeyCount });
}));

// ── Admin: trigger seed cycle now ───────────────────────────────────────────
let seedNowRunning = false;
router.post('/admin/seed-now', requireAdmin, asyncHandler(async (req, res) => {
  if (seedNowRunning) {
    return res.json({ success: false, error: 'Seeder already running — check back in a few minutes.' });
  }
  const { runSeedCycle, seederStatus } = require('../services/backgroundSeeder');
  seedNowRunning = true;
  // Run async — respond immediately, let it run in background
  runSeedCycle().then(() => { seedNowRunning = false; }).catch(() => { seedNowRunning = false; });
  res.json({ success: true, message: 'Seeder started — check status in 30–60 seconds.' });
}));

// ── Google OAuth ─────────────────────────────────────────────────────────────
// These routes are registered directly in server.js via passport

module.exports = router;
