require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// Global crash guards — must come first
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason?.message || reason);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler } = require('./src/middleware/errorHandler');
const { getDb, getUserById, getUserByEmail, BetterSQLiteStore } = require('./src/models/database');
const { startQueueProcessor } = require('./src/services/schedulerService');
const { requireAuth, requireActiveSubscription } = require('./src/middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Cloudflare proxy so rate limiter doesn't choke on X-Forwarded-For
app.set('trust proxy', 1);

// Init DB immediately
getDb();

// Middleware
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
const isProd = process.env.NODE_ENV === 'production' || require('fs').existsSync(FRONTEND_DIST + '/index.html');

// Stripe webhook — MUST be before express.json() (needs raw body)
const { router: stripeRouter, webhookRouter: stripeWebhookRouter } = require('./src/routes/stripe');
app.use('/api/stripe/webhook', stripeWebhookRouter);

app.use(compression({
  filter: (req, res) => {
    // Never compress SSE streams — compression buffers them and breaks streaming
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));
app.use(cors({
  origin: isProd ? (process.env.FRONTEND_URL || true) : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session middleware
// Detect HTTPS via RAILWAY_STATIC_URL, FORCE_HTTPS, or APP_URL starting with https://
const isHttps = !!(
  process.env.RAILWAY_STATIC_URL ||
  process.env.FORCE_HTTPS === 'true' ||
  (process.env.APP_URL || '').startsWith('https://')
);
const sessionStore = new BetterSQLiteStore(session);
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'ccz.sid',
  cookie: {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// Passport
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try { done(null, getUserById(id) || false); } catch (e) { done(e); }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  const googleCallbackURL = process.env.GOOGLE_AUTH_CALLBACK_URL || `${appUrl}/api/auth/google/callback`;
  console.log(`[Google OAuth] Strategy initialized — callback: ${googleCallbackURL}`);
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: googleCallbackURL,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log(`[Google OAuth] Callback hit — profile id: ${profile.id}, email: ${profile.emails?.[0]?.value}`);
      const db = getDb();
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email from Google'));

      // 1. Look up by email
      let user = getUserByEmail(email);
      if (user) {
        if (!user.google_id) {
          db.prepare(`UPDATE users SET google_id=?, last_login=CURRENT_TIMESTAMP WHERE id=?`).run(profile.id, user.id);
        } else {
          db.prepare(`UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?`).run(user.id);
        }
        const updatedUser = getUserById(user.id);
        console.log(`[Google OAuth] Existing user found by email: id=${updatedUser.id}`);
        return done(null, updatedUser);
      }

      // 2. Look up by google_id (handles post-merge where email changed)
      const userByGoogleId = db.prepare('SELECT * FROM users WHERE google_id=?').get(profile.id);
      if (userByGoogleId) {
        db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?').run(userByGoogleId.id);
        console.log(`[Google OAuth] Existing user found by google_id: id=${userByGoogleId.id}`);
        return done(null, getUserById(userByGoogleId.id));
      }

      // 3. Link to admin if admin has no google_id yet (single-user SaaS setup)
      const adminUser = db.prepare('SELECT * FROM users WHERE id=1').get();
      if (adminUser && !adminUser.google_id) {
        db.prepare('UPDATE users SET google_id=?, last_login=CURRENT_TIMESTAMP WHERE id=1').run(profile.id);
        const linked = getUserById(1);
        console.log(`[Google OAuth] Linked Google account ${email} → admin user id=1`);
        return done(null, linked);
      }

      // 4. Create new user
      const result = db.prepare(`
        INSERT INTO users (email, google_id, full_name, email_verified, profile_picture, plan)
        VALUES (?, ?, ?, 1, ?, 'trial')
      `).run(email, profile.id, profile.displayName || email.split('@')[0], profile.photos?.[0]?.value || null);
      const newUser = getUserById(result.lastInsertRowid);
      console.log(`[Google OAuth] New user created: id=${newUser.id} email=${email}`);
      done(null, newUser);
    } catch (e) {
      console.error('[Google OAuth] Strategy error:', e.message);
      done(e);
    }
  }));
} else {
  console.warn('[Google OAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google Sign-In disabled');
}

app.use(passport.initialize());
app.use(passport.session());

app.use('/api', apiLimiter);

// Tracking pixel route (public — no auth needed)
const emailsRouter = require('./src/routes/emails');
app.get('/api/track/open/:trackingId', (req, res, next) => {
  req.url = `/track/open/${req.params.trackingId}`;
  emailsRouter(req, res, next);
});

// Public auth routes (no requireAuth)
app.use('/api/auth', require('./src/routes/auth'));

// Google OAuth flow routes
app.get('/api/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('[Google OAuth] /api/auth/google hit but credentials not configured');
    return res.redirect('/login?error=google_not_configured');
  }
  console.log('[Google OAuth] Initiating sign-in redirect to Google');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
app.get('/api/auth/google/callback',
  (req, res, next) => {
    console.log('[Google OAuth] /api/auth/google/callback hit — code:', !!req.query.code, 'error:', req.query.error || 'none');
    if (req.query.error) {
      console.error('[Google OAuth] Google returned error:', req.query.error, req.query.error_description || '');
    }
    passport.authenticate('google', { failureRedirect: '/login?error=google_failed' })(req, res, next);
  },
  (req, res) => {
    console.log(`[Google OAuth] Session created for user ${req.user?.id} — redirecting`);
    req.session.userId = req.user.id;
    req.session.save(err => {
      if (err) console.error('[Google OAuth] Session save error:', err.message);
      const user = req.user;
      if (!user.onboarding_completed) return res.redirect('/onboarding');
      res.redirect('/');
    });
  }
);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Protected API routes
app.use('/api/leads',     requireAuth, requireActiveSubscription, require('./src/routes/leads'));
app.use('/api/pitches',   requireAuth, requireActiveSubscription, require('./src/routes/pitches'));
app.use('/api/emails',    requireAuth, requireActiveSubscription, emailsRouter);
app.use('/api/crm',       requireAuth, require('./src/routes/crm'));
app.use('/api/analytics', requireAuth, require('./src/routes/analytics'));
app.use('/api/settings',  requireAuth, require('./src/routes/settings'));
app.use('/api/gmail',     require('./src/routes/gmail'));
app.use('/api/scraper',   requireAuth, requireActiveSubscription, require('./src/routes/scraper'));
app.use('/api/analyzer',  requireAuth, requireActiveSubscription, require('./src/routes/analyzer'));
app.use('/api/assistant', requireAuth, requireActiveSubscription, require('./src/routes/assistant'));
app.use('/api/followups', requireAuth, requireActiveSubscription, require('./src/routes/followups'));
app.use('/api/stripe',    requireAuth, stripeRouter);

// Serve frontend build (production mode)
if (isProd) {
  app.use(express.static(FRONTEND_DIST, {
    maxAge: '7d',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIp = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
    }
    if (localIp !== 'localhost') break;
  }

  console.log(`\n🚀 ContentCrafterzz Outreach OS running on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIp}:${PORT}`);
  console.log(`\n📱 PHONE ACCESS:`);
  console.log(`   Open on phone: http://${localIp}:${PORT}`);
  console.log(`   (Both devices must be on same WiFi)\n`);

  startQueueProcessor();
  console.log('   Email queue processor started');

  // Mark any jobs that were 'running' before this boot as interrupted
  // (they died when the server restarted — their async runners are gone)
  try {
    const db = getDb();
    const stale = db.prepare(`UPDATE power_send_jobs SET status='interrupted', completed_at=CURRENT_TIMESTAMP WHERE status='running'`).run();
    if (stale.changes > 0) console.log(`   Marked ${stale.changes} interrupted job(s) from previous session`);

    // Clean email_queue items stuck in 'sending' — they'll never complete after a restart
    const stuckQueue = db.prepare(`UPDATE email_queue SET status='failed' WHERE status='sending'`).run();
    if (stuckQueue.changes > 0) console.log(`   Cleared ${stuckQueue.changes} stuck queue item(s) from previous session`);
  } catch {}

  // Self-ping every 14 minutes to prevent Railway sleep
  if (process.env.NODE_ENV === 'production' || process.env.SELF_PING === 'true') {
    const SELF_URL = process.env.RAILWAY_STATIC_URL
      ? `https://${process.env.RAILWAY_STATIC_URL}`
      : (process.env.APP_URL || `http://localhost:${PORT}`);
    setInterval(async () => {
      try {
        const http = require('http');
        const https = require('https');
        const url = new URL(`${SELF_URL}/api/health`);
        const mod = url.protocol === 'https:' ? https : http;
        mod.get(url.href, () => {}).on('error', () => {});
      } catch {}
    }, 14 * 60 * 1000);
    console.log('   Self-ping enabled (every 14 min)');
  }
});

module.exports = app;
