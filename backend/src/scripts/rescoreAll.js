// Re-runs intent scoring across all of master_leads in batches of 500,
// applying the Session 0.4 rewrites (poisoned title-keyword signal dropped,
// commerce-signal description scoring, meta_channel exclusion).
//
// Usage:
//   node backend/src/scripts/rescoreAll.js --dry   (report distribution shift, no writes)
//   node backend/src/scripts/rescoreAll.js         (apply — writes quality_leads/archived_leads)
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env'), override: false });

const { initializeDatabase, getDb } = require('../models/database');
const { scoreAndPopulate, getDistribution } = require('../services/qualityLeadsService');

const DRY_RUN = process.argv.includes('--dry');

(async () => {
  await initializeDatabase();
  const db = getDb();

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`rescoreAll — ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLYING CHANGES'}`);
  console.log('═══════════════════════════════════════════════════════════');

  const before = await getDistribution();
  console.log('\nCurrent distribution (before):');
  console.log(`  HOT: ${before.hot}  WARM: ${before.warm}  COLD: ${before.cold}  (${before.hot_pct}% / ${before.warm_pct}% / ${before.cold_pct}%)`);

  const total = (await db.get('SELECT COUNT(*) as n FROM master_leads')).n;
  console.log(`\nRescoring ${total} master_leads rows in batches of 500...`);

  const startedAt = Date.now();
  const result = await scoreAndPopulate(undefined, DRY_RUN);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\nDone in ${elapsedSec}s.`);
  console.log(`  New scoring: HOT=${result.hot}  WARM=${result.warm}  COLD=${result.cold}  errors=${result.errors}`);
  console.log(`  New HOT%: ${result.hot_pct}%`);

  if (DRY_RUN) {
    console.log('\n───────────────────────────────────────────────────────────');
    console.log('DISTRIBUTION SHIFT (old → new, dry-run — nothing written)');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  HOT:  ${before.hot} (${before.hot_pct}%)  →  ${result.hot} (${result.hot_pct}%)`);
    console.log(`  WARM: ${before.warm} (${before.warm_pct}%)  →  ${result.warm}`);
    console.log(`  COLD: ${before.cold} (${before.cold_pct}%)  →  ${result.cold}`);
  } else {
    const after = await getDistribution();
    console.log('\n───────────────────────────────────────────────────────────');
    console.log('DISTRIBUTION SHIFT (old → new, applied)');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  HOT:  ${before.hot} (${before.hot_pct}%)  →  ${after.hot} (${after.hot_pct}%)`);
    console.log(`  WARM: ${before.warm} (${before.warm_pct}%)  →  ${after.warm} (${after.warm_pct}%)`);
    console.log(`  COLD: ${before.cold} (${before.cold_pct}%)  →  ${after.cold} (${after.cold_pct}%)`);
  }
  console.log('───────────────────────────────────────────────────────────\n');
})()
  .catch(err => { console.error('[FATAL]', err.message); process.exit(1); })
  .finally(() => process.exit(0));
