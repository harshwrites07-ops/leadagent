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

const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler } = require('./src/middleware/errorHandler');
const { getDb } = require('./src/models/database');
const { startQueueProcessor } = require('./src/services/schedulerService');

const app = express();
const PORT = process.env.PORT || 3001;

// Init DB immediately
getDb();

// Middleware
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
const isProd = process.env.NODE_ENV === 'production' || require('fs').existsSync(FRONTEND_DIST + '/index.html');

app.use(compression());
app.use(cors({
  origin: isProd ? '*' : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);

// Tracking pixel route (before auth)
const emailsRouter = require('./src/routes/emails');
app.get('/api/track/open/:trackingId', (req, res, next) => {
  req.url = `/track/open/${req.params.trackingId}`;
  emailsRouter(req, res, next);
});

// Routes
app.use('/api/leads', require('./src/routes/leads'));
app.use('/api/pitches', require('./src/routes/pitches'));
app.use('/api/emails', emailsRouter);
app.use('/api/crm', require('./src/routes/crm'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/scraper', require('./src/routes/scraper'));
app.use('/api/analyzer', require('./src/routes/analyzer'));
app.use('/api/assistant', require('./src/routes/assistant'));
app.use('/api/followups', require('./src/routes/followups'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

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

  // Self-ping every 14 minutes to prevent Railway sleep
  if (process.env.NODE_ENV === 'production' || process.env.SELF_PING === 'true') {
    const SELF_URL = process.env.RAILWAY_STATIC_URL
      ? `https://${process.env.RAILWAY_STATIC_URL}`
      : `http://localhost:${PORT}`;
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
