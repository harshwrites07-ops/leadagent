require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: false });

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason?.message || reason);
  process.exit(1);
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
const {
  initializeDatabase, getDb, getUserById, getUserByEmail, BetterSQLiteStore, USE_PG,
} = require('./src/models/database');
const { startQueueProcessor } = require('./src/services/schedulerService');
const { requireAuth, requireActiveSubscription } = require('./src/middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
const isProd = process.env.NODE_ENV === 'production' || require('fs').existsSync(FRONTEND_DIST + '/index.html');

const { router: stripeRouter, webhookRouter: stripeWebhookRouter } = require('./src/routes/stripe');
app.use('/api/stripe/webhook', stripeWebhookRouter);

app.use(compression({
  filter: (req, res) => {
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

const isHttps = !!(
  process.env.RAILWAY_STATIC_URL ||
  process.env.FORCE_HTTPS === 'true' ||
  (process.env.APP_URL || '').startsWith('https://')
);

// ── Async main — waits for DB before binding routes ───────────────────────────
(async () => {
  try {
    console.log(`[DB] Initializing ${USE_PG ? 'PostgreSQL' : 'SQLite'}...`);
    await initializeDatabase();
    console.log('[DB] Ready');
  } catch (err) {
    console.error('[DB] Initialization failed:', err.message);
    process.exit(1);
  }

  // Session store (PgSessionStore or BetterSQLiteStore based on DATABASE_URL)
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
  passport.deserializeUser(async (id, done) => {
    try { done(null, (await getUserById(id)) || false); } catch (e) { done(e); }
  });

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const googleCallbackURL = `${appUrl}/api/auth/google/callback`;
    console.log(`[Google OAuth] Strategy initialized — callback: ${googleCallbackURL}`);
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: googleCallbackURL,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const db = getDb();
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email from Google'));

        let user = await getUserByEmail(email);
        if (user) {
          if (!user.google_id) {
            await db.run(`UPDATE users SET google_id=?, last_login=${USE_PG ? 'NOW()' : 'CURRENT_TIMESTAMP'} WHERE id=?`, [profile.id, user.id]);
          } else {
            await db.run(`UPDATE users SET last_login=${USE_PG ? 'NOW()' : 'CURRENT_TIMESTAMP'} WHERE id=?`, [user.id]);
          }
          const updatedUser = await getUserById(user.id);
          return done(null, updatedUser);
        }

        const userByGoogleId = await db.get('SELECT * FROM users WHERE google_id=?', [profile.id]);
        if (userByGoogleId) {
          await db.run(`UPDATE users SET last_login=${USE_PG ? 'NOW()' : 'CURRENT_TIMESTAMP'} WHERE id=?`, [userByGoogleId.id]);
          return done(null, await getUserById(userByGoogleId.id));
        }

        const ADMIN_EMAIL_ENV = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
        if (ADMIN_EMAIL_ENV && email.toLowerCase() === ADMIN_EMAIL_ENV) {
          const adminUser = await db.get('SELECT * FROM users WHERE email=?', [ADMIN_EMAIL_ENV]);
          if (adminUser && !adminUser.google_id) {
            await db.run('UPDATE users SET google_id=?, last_login=CURRENT_TIMESTAMP WHERE id=?', [profile.id, adminUser.id]);
            return done(null, await getUserById(adminUser.id));
          }
        }

        const insertSql = USE_PG
          ? `INSERT INTO users (email, google_id, full_name, email_verified, profile_picture, plan) VALUES (?, ?, ?, 1, ?, 'trial') RETURNING id`
          : `INSERT INTO users (email, google_id, full_name, email_verified, profile_picture, plan) VALUES (?, ?, ?, 1, ?, 'trial')`;
        const result = await db.run(insertSql, [
          email, profile.id, profile.displayName || email.split('@')[0], profile.photos?.[0]?.value || null,
        ]);
        const newUser = await getUserById(result.lastID);
        console.log(`[Google OAuth] New user created: id=${newUser?.id} email=${email}`);
        setImmediate(async () => {
          try { if (!USE_PG) { const { syncUsersToTurso } = require('./src/services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
        });
        done(null, newUser);
      } catch (e) {
        console.error('[Google OAuth] Strategy error:', e.message);
        done(e);
      }
    }));
  } else {
    console.warn('[Google OAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — disabled');
  }

  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api', apiLimiter);

  const emailsRouter = require('./src/routes/emails');
  app.get('/api/track/open/:trackingId', (req, res, next) => {
    req.url = `/track/open/${req.params.trackingId}`;
    emailsRouter(req, res, next);
  });

  app.use('/api', require('./src/routes/debug'));
  app.use('/api/auth', require('./src/routes/auth'));

  app.get('/api/auth/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect('/login?error=google_not_configured');
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });
  app.get('/api/auth/google/callback',
    (req, res, next) => {
      if (req.query.error) console.error('[Google OAuth] Error:', req.query.error);
      passport.authenticate('google', { failureRedirect: '/login?error=google_failed' })(req, res, next);
    },
    (req, res) => {
      req.session.userId = req.user.id;
      setImmediate(async () => {
        try { if (!USE_PG) { const { syncUsersToTurso } = require('./src/services/tursoSync'); await syncUsersToTurso(getDb()); } } catch {}
      });
      req.session.save(err => {
        if (err) console.error('[Google OAuth] Session save error:', err.message);
        if (!req.user.onboarding_completed) return res.redirect('/onboarding');
        res.redirect('/');
      });
    }
  );

  app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', db: USE_PG ? 'postgres' : 'sqlite' }));
  app.get('/api/debug/oauth', (req, res) => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    res.json({ client_id: process.env.GOOGLE_CLIENT_ID || 'NOT SET', callback_url: `${appUrl}/api/auth/google/callback` });
  });

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
  app.use('/api/campaigns', requireAuth, requireActiveSubscription, require('./src/routes/campaigns'));
  app.use('/api/quality',   requireAuth, require('./src/routes/qualityLeads'));
  app.use('/api/stripe',    requireAuth, stripeRouter);

  const { createProxyMiddleware } = require('http-proxy-middleware');
  const QUELRO_SITE_DIR = path.join(__dirname, '../quelro-website');
  const QUELRO_IMAGES_URL = process.env.QUELRO_SITE_URL || 'https://web-production-58f048.up.railway.app';
  const imagesProxy = createProxyMiddleware({ target: QUELRO_IMAGES_URL, changeOrigin: true, on: { error: (_e, _r, res) => res.status(502).send('Images unavailable') } });
  app.use('/images', imagesProxy);
  const QUELRO_SITE = process.env.QUELRO_SITE_URL || 'https://web-production-58f048.up.railway.app';
  const cdnProxy = createProxyMiddleware({ target: QUELRO_SITE, changeOrigin: true });
  app.use('/wp-content', cdnProxy);
  app.use('/wp-includes', cdnProxy);
  app.use('/fonts', cdnProxy);
  app.use('/video', cdnProxy);

  app.use('/css', express.static(path.join(QUELRO_SITE_DIR, 'css'), { maxAge: '7d' }));
  app.use('/js',  express.static(path.join(QUELRO_SITE_DIR, 'js'),  { maxAge: '7d' }));

  const MARKETING_DIRS = ['pricing','about','features','contact-us','blog','case-studies','webinars','whitepapers','demo','practice-intelligence','practice-management','qai','lp','wp','feature-releases','events','company','privacy-policy','terms-of-service','webinar-2025-intelligent-firm'];
  MARKETING_DIRS.forEach(dir => app.use('/' + dir, express.static(path.join(QUELRO_SITE_DIR, dir), { maxAge: '1h' })));

  app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));

  if (isProd) {
    app.use(express.static(FRONTEND_DIST, {
      maxAge: '1h', etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        if (filePath.match(/\.(js|css)$/)) res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }));
    app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
  }

  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', async () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    let localIp = 'localhost';
    for (const iface of Object.values(nets)) {
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
      }
      if (localIp !== 'localhost') break;
    }
    console.log(`\n🚀 Quelro Outreach OS running on port ${PORT}`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${localIp}:${PORT}`);

    try { startQueueProcessor(); console.log('   Email queue processor started'); }
    catch (err) { console.error('[QueueProcessor] Failed to start:', err.message); }

    try {
      const { startLoop } = require('./src/services/scraperLoopService');
      startLoop();
      console.log('   Quality scraper loop started');
    } catch (err) { console.error('[QualityLoop] Failed to start:', err.message); }

    // Mark stale jobs from previous boot
    try {
      const db = getDb();
      const stale = await db.run(`UPDATE power_send_jobs SET status='interrupted', completed_at=${USE_PG ? 'NOW()' : 'CURRENT_TIMESTAMP'} WHERE status='running'`);
      if (stale.changes > 0) console.log(`   Marked ${stale.changes} interrupted job(s)`);
      const stuckQueue = await db.run(`UPDATE email_queue SET status='failed' WHERE status='sending'`);
      if (stuckQueue.changes > 0) console.log(`   Cleared ${stuckQueue.changes} stuck queue item(s)`);
    } catch {}

    // Rescore quality leads if empty
    setTimeout(async () => {
      try {
        const db = getDb();
        const row = await db.get("SELECT COUNT(*) as c FROM quality_leads WHERE intent_tier='HOT'");
        const hotCount = row?.c || 0;
        if (hotCount === 0) {
          console.log('[Boot] HOT leads = 0 — rescoring...');
          const { scoreAndPopulate } = require('./src/services/qualityLeadsService');
          const result = await scoreAndPopulate();
          console.log(`[Boot] Rescore complete: HOT=${result.hot} WARM=${result.warm} COLD=${result.cold}`);
        } else {
          console.log(`[Boot] HOT leads present (${hotCount}) — skipping rescore`);
        }
      } catch (e) { console.error('[Boot] Rescore error:', e.message); }
    }, 15 * 1000);

    // Initial confirmed signal scan
    setTimeout(async () => {
      try {
        const { runConfirmedSignalScan } = require('./src/services/confirmedSignalService');
        const result = await runConfirmedSignalScan();
        console.log(`[Boot] Signal scan complete — ${result.total_confirmed_signals || 0} signals, ${result.final_hot_leads || 0} HOT leads`);
      } catch (e) { console.error('[Boot] Signal scan error:', e.message); }
    }, 30 * 1000);

    // Restore from Turso + start seeders (SQLite mode only)
    setTimeout(async () => {
      if (!USE_PG) {
        try { const { syncAllOnBoot } = require('./src/services/tursoSync'); await syncAllOnBoot(); }
        catch (e) { console.error('[Turso] Restore failed:', e.message); }
      }
      try { const { startBackgroundSeeder } = require('./src/services/backgroundSeeder'); startBackgroundSeeder(); }
      catch (e) { console.error('[Seeder/YT] Failed to start:', e.message); }
      try { const { startPodcastSeeder } = require('./src/services/podcastSeeder'); startPodcastSeeder(); }
      catch (e) { console.error('[Seeder/Podcast] Failed to start:', e.message); }
    }, 5000);

    // Periodic Turso sync (SQLite mode only)
    if (!USE_PG) {
      setInterval(async () => {
        try { const { syncUsersToTurso } = require('./src/services/tursoSync'); await syncUsersToTurso(getDb()); } catch {}
      }, 10 * 60 * 1000);
    }

    // Self-ping
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
    }
  });
})();

module.exports = app;
