const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDb, getUserById, getUserByEmail, USE_PG } = require('../models/database');
const { requireAuth, requireAdmin, isTrialExpired } = require('../middleware/requireAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  generateOtp, verifyOtp, sendSmsOtp,
  sendVerificationEmail, sendPasswordResetEmail, sendOtpEmail,
  checkUsageLimit, PLAN_LIMITS,
} = require('../services/authService');

const NOW = USE_PG ? 'NOW()' : 'CURRENT_TIMESTAMP';
const EXPIRED_CHECK = USE_PG ? 'expires_at > NOW()' : "expires_at > datetime('now')";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
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
  service_type: u.service_type, one_liner: u.one_liner,
  experience_years: u.experience_years, best_result: u.best_result, case_study: u.case_study,
  pricing_range: u.pricing_range, personality_traits: u.personality_traits,
  outreach_goal: u.outreach_goal, origin_story: u.origin_story,
  unique_difference: u.unique_difference, profile_completed: u.profile_completed,
  voice_dna: u.voice_dna,
  voice_sample_1: u.voice_sample_1 || null,
  voice_sample_2: u.voice_sample_2 || null,
  voice_sample_3: u.voice_sample_3 || null,
} : null;

router.get('/me', requireAuth, (req, res) => {
  const isUnlimited = req.user.is_admin || req.user.plan === 'agency';
  const limits = isUnlimited
    ? { leads: -1, emails: -1, gmail_accounts: -1, ai_pitches: -1, team_seats: -1 }
    : (PLAN_LIMITS[req.user.plan] || PLAN_LIMITS.free);
  const trialExpired = isTrialExpired(req.user);
  const trialDaysLeft = req.user.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(req.user.trial_ends_at) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  res.json({ success: true, user: safeUser(req.user), limits, trialExpired, trialDaysLeft });
});

router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, full_name, phone_number } = req.body;
  if (!email || !password || !full_name)
    return res.status(400).json({ success: false, error: 'email, password and full_name are required' });
  if (password.length < 8)
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

  const db = getDb();
  const existing = await getUserByEmail(email);
  if (existing)
    return res.status(409).json({ success: false, error: 'Email already registered', code: 'EMAIL_EXISTS' });

  if (phone_number) {
    const existingPhone = await db.get('SELECT id FROM users WHERE phone_number=?', [phone_number]);
    if (existingPhone)
      return res.status(409).json({ success: false, error: 'Phone number already registered', code: 'PHONE_EXISTS' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const insertSql = USE_PG
    ? `INSERT INTO users (email, password, full_name, phone_number, plan, plan_status) VALUES (?, ?, ?, ?, 'trial', 'active') RETURNING id`
    : `INSERT INTO users (email, password, full_name, phone_number, plan, plan_status) VALUES (?, ?, ?, ?, 'trial', 'active')`;
  const result = await db.run(insertSql, [email.toLowerCase().trim(), hashed, full_name.trim(), phone_number || null]);

  const user = await getUserById(result.lastID);

  setImmediate(async () => {
    try { if (!USE_PG) { const { syncUsersToTurso } = require('../services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
  });

  const emailResult = await sendVerificationEmail(user).catch(e => ({ ok: false, error: e.message }));

  if (phone_number) {
    const code = await generateOtp(user.id, 'phone');
    sendSmsOtp(phone_number, code).catch(() => {});
  }

  req.session.userId = user.id;
  req.session.save(err => {
    if (err) console.error('[AUTH] Session save error:', err);
    res.status(201).json({
      success: true, user: safeUser(user), needsVerification: true,
      message: 'Account created! Check your email to verify.',
      ...(emailResult.dev && { _devVerifyUrl: emailResult.verifyUrl }),
    });
  });
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password, remember } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, error: 'Email and password are required' });

  const db = getDb();
  const user = await getUserByEmail(email);
  if (!user)
    return res.status(401).json({ success: false, error: 'Invalid email or password' });

  if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
    const mins = Math.ceil((new Date(user.lockout_until) - Date.now()) / 60000);
    return res.status(429).json({ success: false, error: `Too many attempts. Try again in ${mins} minute(s).`, code: 'LOCKED_OUT' });
  }

  if (!user.password)
    return res.status(401).json({ success: false, error: 'This account uses Google login — use "Continue with Google"', code: 'USE_GOOGLE' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    const attempts = (user.login_attempts || 0) + 1;
    const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await db.run(`UPDATE users SET login_attempts=?, lockout_until=? WHERE id=?`, [attempts, lockout, user.id]);
    if (lockout) return res.status(429).json({ success: false, error: 'Too many failed attempts. Locked out for 15 minutes.', code: 'LOCKED_OUT' });
    return res.status(401).json({ success: false, error: 'Invalid email or password', attemptsLeft: 5 - attempts });
  }

  await db.run(`UPDATE users SET login_attempts=0, lockout_until=NULL, last_login=${NOW} WHERE id=?`, [user.id]);

  const freshUser = await db.get('SELECT * FROM users WHERE id=?', [user.id]);
  if (!freshUser.onboarding_completed && freshUser.service_type) {
    await db.run('UPDATE users SET onboarding_completed=1 WHERE id=?', [user.id]);
  }

  req.session.userId = user.id;
  if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

  setImmediate(async () => {
    try { if (!USE_PG) { const { syncUsersToTurso } = require('../services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
  });

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  req.session.save(err => {
    if (err) console.error('[AUTH] Session save error:', err);
    res.json({ success: true, user: safeUser(user), limits });
  });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ccz.sid');
    res.json({ success: true });
  });
});

router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });

  const db = getDb();
  const row = await db.get(`SELECT * FROM password_reset_tokens WHERE token=? AND used=0 AND ${EXPIRED_CHECK}`, [token]);
  if (!row) return res.status(400).json({ success: false, error: 'Invalid or expired link' });

  await db.run(`UPDATE users SET email_verified=1 WHERE id=?`, [row.user_id]);
  await db.run(`UPDATE password_reset_tokens SET used=1 WHERE id=?`, [row.id]);

  const user = await getUserById(row.user_id);
  res.json({ success: true, message: 'Email verified!', user: safeUser(user) });
}));

router.post('/resend-verification', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.email_verified) return res.json({ success: true, message: 'Email already verified' });
  await sendVerificationEmail(req.user);
  res.json({ success: true, message: 'Verification email sent' });
}));

router.post('/send-phone-otp', requireAuth, asyncHandler(async (req, res) => {
  const { phone_number } = req.body;
  const phone = phone_number || req.user.phone_number;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number required' });

  const db = getDb();
  if (phone_number && phone_number !== req.user.phone_number) {
    const existing = await db.get('SELECT id FROM users WHERE phone_number=? AND id != ?', [phone_number, req.user.id]);
    if (existing) return res.status(409).json({ success: false, error: 'Phone already registered' });
    await db.run(`UPDATE users SET phone_number=? WHERE id=?`, [phone_number, req.user.id]);
  }

  const code = await generateOtp(req.user.id, 'phone');
  const result = await sendSmsOtp(phone, code);
  res.json({ success: true, dev: result.dev || false, message: result.dev ? 'OTP in server console (SMS not configured)' : 'OTP sent' });
}));

router.post('/verify-phone-otp', requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Code required' });

  const result = await verifyOtp(req.user.id, code, 'phone');
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });

  const db = getDb();
  await db.run(`UPDATE users SET phone_verified=1 WHERE id=?`, [req.user.id]);
  const user = await getUserById(req.user.id);
  res.json({ success: true, message: 'Phone verified!', user: safeUser(user) });
}));

router.post('/phone-login', loginLimiter, asyncHandler(async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) return res.status(400).json({ success: false, error: 'Phone number required' });

  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE phone_number=?', [phone_number]);
  if (!user) return res.status(404).json({ success: false, error: 'No account with this phone number' });

  const code = await generateOtp(user.id, 'phone_login');
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
    const userRow = await getDb().get('SELECT id FROM users WHERE phone_number=?', [phone_number]);
    if (!userRow) return res.status(404).json({ success: false, error: 'No account with this phone number' });
    resolvedUserId = userRow.id;
  }
  if (!resolvedUserId) return res.status(400).json({ success: false, error: 'user_id or phone_number required' });

  const result = await verifyOtp(resolvedUserId, code, 'phone_login');
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });

  await getDb().run(`UPDATE users SET last_login=${NOW} WHERE id=?`, [resolvedUserId]);
  const user = await getUserById(resolvedUserId);
  req.session.userId = user.id;
  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  req.session.save(err => {
    if (err) console.error('[AUTH] Session save error:', err);
    res.json({ success: true, user: safeUser(user), limits });
  });
}));

router.post('/forgot-password', loginLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });

  const user = await getUserByEmail(email);
  if (!user) return res.json({ success: true, message: 'If that email is registered, a reset link was sent.' });

  const result = await sendPasswordResetEmail(user);
  res.json({ success: true, message: 'If that email is registered, a reset link was sent.', dev: result.dev, resetUrl: result.resetUrl });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

  const db = getDb();
  const row = await db.get(`SELECT * FROM password_reset_tokens WHERE token=? AND used=0 AND ${EXPIRED_CHECK}`, [token]);
  if (!row) return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });

  const hashed = await bcrypt.hash(password, 12);
  await db.run(`UPDATE users SET password=?, login_attempts=0, lockout_until=NULL WHERE id=?`, [hashed, row.user_id]);
  await db.run(`UPDATE password_reset_tokens SET used=1 WHERE id=?`, [row.id]);

  res.json({ success: true, message: 'Password updated! You can now log in.' });
}));

router.put('/onboarding', requireAuth, asyncHandler(async (req, res) => {
  const {
    full_name, agency_name, role, target_niches, target_platforms, portfolio_url,
    daily_email_limit, auto_find_leads,
    service_type, one_liner, experience_years, best_result, case_study, pricing_range,
    personality_traits, outreach_goal, origin_story, unique_difference, profile_completed,
  } = req.body;
  const db = getDb();

  await db.run(`
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
      case_study=COALESCE(?,case_study),
      pricing_range=COALESCE(?,pricing_range),
      personality_traits=COALESCE(?,personality_traits),
      outreach_goal=COALESCE(?,outreach_goal),
      origin_story=COALESCE(?,origin_story),
      unique_difference=COALESCE(?,unique_difference),
      profile_completed=COALESCE(?,profile_completed),
      onboarding_completed=1
    WHERE id=?
  `, [
    full_name || null, agency_name || null, role || null,
    target_niches ? JSON.stringify(target_niches) : null,
    target_platforms ? JSON.stringify(target_platforms) : null,
    portfolio_url || null, daily_email_limit || null,
    auto_find_leads != null ? (auto_find_leads ? 1 : 0) : null,
    service_type || null, one_liner || null, experience_years || null,
    best_result || null, case_study || null, pricing_range || null,
    personality_traits ? JSON.stringify(personality_traits) : null,
    outreach_goal || null, origin_story || null, unique_difference || null,
    profile_completed != null ? profile_completed : null,
    req.user.id,
  ]);

  const { setSetting } = require('../models/database');
  if (full_name) setSetting('your_name', full_name);
  if (agency_name) setSetting('agency_name', agency_name);

  try { const { rebuildVoiceDNA } = require('../services/voiceDNA'); await rebuildVoiceDNA(req.user.id); } catch {}

  setImmediate(async () => {
    try { if (!USE_PG) { const { syncUsersToTurso } = require('../services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
  });

  const user = await getUserById(req.user.id);
  res.json({ success: true, user: safeUser(user) });
}));

router.post('/skip-onboarding', requireAuth, asyncHandler(async (req, res) => {
  await getDb().run(`UPDATE users SET onboarding_completed=1, profile_completed=0 WHERE id=?`, [req.user.id]);
  setImmediate(async () => {
    try { if (!USE_PG) { const { syncUsersToTurso } = require('../services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
  });
  const user = await getUserById(req.user.id);
  res.json({ success: true, user: safeUser(user) });
}));

// Marcus V2, Part 6 — voice sample quality check at save time. A sample that's
// too short or itself reads like AI-written boilerplate can't teach Marcus
// anything; warn the user instead of silently accepting it.
function checkSampleQuality(sampleKey, text) {
  if (!text || !text.trim()) return null;
  const { wordCount, runCodeGate } = require('../services/codeGate');
  const words = wordCount(text);
  if (words < 40) {
    return { field: sampleKey, warning: `This sample is only ${words} words — paste something longer you actually wrote to a client for Marcus to learn from.` };
  }
  const gate = runCodeGate({ subject: '', body: text }, {});
  const bannedHit = gate.violations.find(v => v.type === 'banned_phrase');
  if (bannedHit) {
    return { field: sampleKey, warning: `This sample reads like a template (uses "${bannedHit.found}") — paste something you actually typed to a client.` };
  }
  return null;
}

router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const allowed = ['full_name','service_type','one_liner','experience_years','best_result','case_study',
    'target_niches','pricing_range','personality_traits','outreach_goal','origin_story','unique_difference',
    'voice_sample_1','voice_sample_2','voice_sample_3'];
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
  vals.push(req.user.id);
  await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);

  const sampleWarnings = ['voice_sample_1', 'voice_sample_2', 'voice_sample_3']
    .map(key => req.body[key] !== undefined ? checkSampleQuality(key, req.body[key]) : null)
    .filter(Boolean);

  try {
    const { rebuildVoiceDNA } = require('../services/voiceDNA');
    const dna = await rebuildVoiceDNA(req.user.id);
    setImmediate(async () => {
      try { if (!USE_PG) { const { syncUsersToTurso } = require('../services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
    });
    const user = await getUserById(req.user.id);
    return res.json({ success: true, user: safeUser(user), voice_dna: dna, sample_warnings: sampleWarnings });
  } catch {}

  const user = await getUserById(req.user.id);
  res.json({ success: true, user: safeUser(user), sample_warnings: sampleWarnings });
}));

router.get('/usage', requireAuth, (req, res) => {
  const isUnlimited = req.user.is_admin || req.user.plan === 'agency';
  const limits = isUnlimited
    ? { leads: -1, emails: -1 }
    : (PLAN_LIMITS[req.user.plan] || PLAN_LIMITS.free);
  res.json({ success: true, usage: {
    leads:  { used: req.user.leads_used_this_month,  limit: limits.leads  },
    emails: { used: req.user.emails_used_this_month, limit: limits.emails },
    reset_date: req.user.usage_reset_date, plan: req.user.plan,
  }});
});

// ── Admin routes ──────────────────────────────────────────────────────────────

router.get('/admin/stats', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  const activeWindow = USE_PG ? "last_login >= NOW() - INTERVAL '30 days'" : "last_login >= datetime('now','-30 days')";
  const totalUsers  = await db.get('SELECT COUNT(*) as c FROM users');
  const activeToday = await db.get(`SELECT COUNT(*) as c FROM users WHERE ${activeWindow}`);
  const totalLeads  = await db.get('SELECT COUNT(*) as c FROM leads');
  const totalEmails = await db.get('SELECT COUNT(*) as c FROM emails');
  let masterLeads = 0, masterWithEmail = 0, masterErr = null;
  try {
    masterLeads     = (await db.get('SELECT COUNT(*) as c FROM master_leads')).c;
    masterWithEmail = (await db.get("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''")).c;
  } catch (e) { masterErr = e.message; }

  const users = await db.all(`
    SELECT id, email, full_name, agency_name, plan, plan_status, is_admin,
           leads_used_this_month, emails_used_this_month, created_at, last_login,
           email_verified, phone_verified, custom_emails_limit, custom_leads_limit
    FROM users ORDER BY created_at DESC
  `);

  res.json({ success: true, stats: {
    total_users: totalUsers.c, active_users: activeToday.c,
    total_leads: totalLeads.c, total_emails: totalEmails.c,
    master_leads: masterLeads, master_with_email: masterWithEmail, master_err: masterErr,
  }, users });
}));

router.put('/admin/users/:id/plan', requireAdmin, asyncHandler(async (req, res) => {
  const { plan, plan_status } = req.body;
  const validPlans = ['free','trial','starter','pro','growth','agency'];
  if (plan && !validPlans.includes(plan))
    return res.status(400).json({ success: false, error: 'Invalid plan' });
  await getDb().run(`UPDATE users SET plan=COALESCE(?,plan), plan_status=COALESCE(?,plan_status) WHERE id=?`, [plan || null, plan_status || null, req.params.id]);
  res.json({ success: true });
}));

router.put('/admin/users/:id/limits', requireAdmin, asyncHandler(async (req, res) => {
  const { emails_limit, leads_limit, emails_used, leads_used } = req.body;
  const sets = [], vals = [];
  if (emails_limit !== undefined) { sets.push('custom_emails_limit=?'); vals.push(emails_limit === '' ? null : parseInt(emails_limit)); }
  if (leads_limit  !== undefined) { sets.push('custom_leads_limit=?');  vals.push(leads_limit  === '' ? null : parseInt(leads_limit)); }
  if (emails_used  !== undefined) { sets.push('emails_used_this_month=?'); vals.push(parseInt(emails_used) || 0); }
  if (leads_used   !== undefined) { sets.push('leads_used_this_month=?');  vals.push(parseInt(leads_used)  || 0); }
  if (!sets.length) return res.json({ success: true });
  vals.push(req.params.id);
  await getDb().run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);
  res.json({ success: true });
}));

router.delete('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
  await getDb().run('DELETE FROM users WHERE id=?', [id]);
  res.json({ success: true });
}));

router.post('/admin/users/:id/reset-usage', requireAdmin, asyncHandler(async (req, res) => {
  await getDb().run(`UPDATE users SET leads_used_this_month=0, emails_used_this_month=0 WHERE id=?`, [req.params.id]);
  res.json({ success: true });
}));

router.put('/admin/users/:id/ban', requireAdmin, asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  const lockout = user.lockout_until ? null : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
  await getDb().run(`UPDATE users SET lockout_until=? WHERE id=?`, [lockout, req.params.id]);
  res.json({ success: true, banned: !!lockout });
}));

router.post('/admin/seed-master-leads', requireAdmin, asyncHandler(async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ success: false, error: 'leads array required' });
  const db = getDb();
  let inserted = 0;
  for (const l of leads) {
    if (!l.channel_name) continue;
    try {
      const r = await db.run(`
        INSERT INTO master_leads (channel_id, channel_name, channel_handle, subscriber_count, avg_views, email, website, channel_description, lead_score, temperature, country, niche)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING
      `, [l.channel_id||null,l.channel_name,l.channel_handle||null,l.subscriber_count||0,l.avg_views||0,l.email||null,l.website||null,l.channel_description||null,l.lead_score||50,l.temperature||'warm',l.country||null,l.niche||null]);
      if (r.changes > 0) inserted++;
    } catch {}
  }
  const total     = (await db.get('SELECT COUNT(*) as c FROM master_leads')).c;
  const withEmail = (await db.get("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''")).c;
  res.json({ success: true, inserted, total, withEmail });
}));

router.get('/admin/scraper-health', requireAdmin, asyncHandler(async (req, res) => {
  const { getScraperHealthSummary } = require('../services/scraperHealth');
  const db = getDb();
  const summary = await getScraperHealthSummary(24);
  const openAlerts = await db.all(
    `SELECT scraper, detected_at, success_rate, attempted FROM scraper_health_alerts WHERE resolved=0 ORDER BY detected_at DESC`
  );
  res.json({
    success: true,
    scrapers: summary,
    degraded: summary.filter(s => s.degraded).map(s => s.scraper),
    alerts: openAlerts,
    healthy: openAlerts.length === 0,
  });
}));

router.get('/admin/debug-db', requireAdmin, asyncHandler(async (req, res) => {
  const db = getDb();
  const results = {};
  if (USE_PG) {
    try { results.tables = (await db.all("SELECT table_name as name FROM information_schema.tables WHERE table_schema='public'")).map(r => r.name); } catch (e) { results.tables_err = e.message; }
    try { results.master_count = (await db.get('SELECT COUNT(*) as c FROM master_leads')).c; } catch (e) { results.master_count_err = e.message; }
    try { results.master_sample = await db.all('SELECT channel_name, email FROM master_leads WHERE email IS NOT NULL LIMIT 3'); } catch (e) { results.master_sample_err = e.message; }
    results.db_type = 'postgresql';
    results.database_url = process.env.DATABASE_URL ? '[SET]' : '[NOT SET]';
  } else {
    try { results.tables = (await db.all("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name); } catch (e) { results.tables_err = e.message; }
    try { results.master_count = (await db.get('SELECT COUNT(*) as c FROM master_leads')).c; } catch (e) { results.master_count_err = e.message; }
    try { results.master_sample = await db.all('SELECT channel_name, email FROM master_leads WHERE email IS NOT NULL LIMIT 3'); } catch (e) { results.master_sample_err = e.message; }
    try {
      const fs = require('fs');
      const dbPath = process.env.DB_PATH || '/app/backend/data/outreach.db';
      results.db_path = dbPath;
      results.db_exists = fs.existsSync(dbPath);
      results.db_size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    } catch (e) { results.path_err = e.message; }
  }
  res.json(results);
}));

router.get('/admin/seeder-status', requireAdmin, asyncHandler(async (req, res) => {
  let seederStatus = { running: false, lastCycleSaved: 0, lastCycleAt: null, totalCycles: 0 };
  try { seederStatus = require('../services/backgroundSeeder').seederStatus || seederStatus; } catch {}
  let total = 0, withEmail = 0;
  try {
    const db = getDb();
    total     = (await db.get('SELECT COUNT(*) as c FROM master_leads')).c || 0;
    withEmail = (await db.get("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''")).c || 0;
  } catch {}
  let ytKeyCount = 0;
  try {
    const keys = [];
    for (let i = 1; i <= 50; i++) { if (process.env[`YOUTUBE_API_KEY_${i}`]) keys.push(i); }
    if (process.env.YOUTUBE_API_KEY) keys.push(0);
    ytKeyCount = keys.length;
  } catch {}
  // scraperHealth (attempted/succeeded/failed per scraper, last 24h) — reused
  // here rather than a new route, so degraded discovery is visible from the
  // same admin surface that already shows seeder status. See
  // scraperHealth.recordSeedCycleOutcome() for the consecutive-zero-lead-
  // cycle trigger reflected in seederStatus.discoveryHealth above.
  let scraperHealthSummary = [];
  try { scraperHealthSummary = await require('../services/scraperHealth').getScraperHealthSummary(24); } catch {}
  res.json({ success: true, seederStatus, total, withEmail, ytKeyCount, scraperHealthSummary });
}));

let seedNowRunning = false;
router.post('/admin/seed-now', requireAdmin, asyncHandler(async (req, res) => {
  if (seedNowRunning) return res.json({ success: false, error: 'Seeder already running — check back in a few minutes.' });
  const { runSeedCycle } = require('../services/backgroundSeeder');
  seedNowRunning = true;
  runSeedCycle().then(() => { seedNowRunning = false; }).catch(() => { seedNowRunning = false; });
  res.json({ success: true, message: 'Seeder started — check status in 30–60 seconds.' });
}));

module.exports = router;
