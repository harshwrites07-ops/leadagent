const express = require('express');
const router = express.Router();
const fs = require('fs');
const { requireAdmin } = require('../middleware/requireAuth');

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
