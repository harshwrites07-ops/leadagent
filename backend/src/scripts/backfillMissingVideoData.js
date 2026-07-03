// One-off runner for videoBackfillService.js — run with:
//   node backend/src/scripts/backfillMissingVideoData.js
// or against production via:
//   railway run node backend/src/scripts/backfillMissingVideoData.js
// Safe to Ctrl+C and re-run later — it always re-queries for leads still
// missing video data (skipping 'channel_gone') rather than resuming a list.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env'), override: false });

const { initializeDatabase } = require('../models/database');
const { runVideoBackfill } = require('../services/videoBackfillService');

(async () => {
  await initializeDatabase();
  const result = await runVideoBackfill({});
  console.log('\n[VideoBackfill] Final:', JSON.stringify(result, null, 2));
})()
  .catch(err => { console.error('[FATAL]', err.message); process.exit(1); })
  .finally(() => process.exit(0));
