const express = require('express');
const router = express.Router();
const fs = require('fs');
const { requireAdmin } = require('../middleware/requireAuth');

// TEMPORARY — one-time diagnostic for the 2026-07-04 live fallback incident
// (buildFallback firing on every generation attempt in production). Isolates
// whether ANTHROPIC_API_KEY / GEMINI_API_KEY_* are valid and reachable from
// Railway's actual production environment, independent of lead data or
// prompt complexity. Remove this route once the incident is resolved.
router.get('/debug/ai-check', requireAdmin, async (req, res) => {
  const { debugAiCheck } = require('../services/claudeService');
  try {
    const result = await debugAiCheck();
    res.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/debug/system', requireAdmin, async (req, res) => {
  const dbPath = '/app/backend/data/outreach.db';
  const dataDir = '/app/backend/data';

  let dbSize = 0;
  let dbExists = false;
  let dirExists = false;
  let dirContents = [];

  try {
    dirExists = fs.existsSync(dataDir);
    if (dirExists) dirContents = fs.readdirSync(dataDir);
  } catch (e) {}

  try {
    dbExists = fs.existsSync(dbPath);
    if (dbExists) dbSize = fs.statSync(dbPath).size;
  } catch (e) {}

  res.json({
    database: {
      path: dbPath,
      exists: dbExists,
      size_bytes: dbSize,
      size_mb: (dbSize / 1024 / 1024).toFixed(2),
    },
    directory: {
      path: dataDir,
      exists: dirExists,
      contents: dirContents,
    },
    turso: {
      url_set: !!process.env.TURSO_DATABASE_URL,
      token_set: !!process.env.TURSO_AUTH_TOKEN,
    },
    volume: {
      mounted: dirExists && dirContents.length > 0,
    },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
