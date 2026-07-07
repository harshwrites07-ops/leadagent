// One-time backfill for the extractEmail() image-filename bug (see TODO.md and
// innertubeService.js's extractEmail rejection rules). Finds rows whose stored
// `email` value is actually a corrupted asset-filename match (retina markers
// like "logo@2x.png", emoji sprite filenames like "hash.png@1f.png", or other
// image/asset "TLDs") and neutralizes them WITHOUT deleting any row.
//
// - leads / quality_leads / archived_leads: email is set to NULL and
//   email_corrupt=1 is set as a belt-and-braces flag.
// - master_leads is NOT nulled: database.js runs
//   `DELETE FROM master_leads WHERE email IS NULL OR email = ''` on every
//   server boot, so nulling here would get the row silently deleted on the
//   next restart. Instead master_leads rows only get email_corrupt=1 set,
//   leaving the (garbage) email value in place — every query that surfaces a
//   sendable email from master_leads has been updated to exclude
//   email_corrupt=1 rows (see AUDIT_REPORT.md-style grep in the PR/commit).
//
// Usage:
//   node backend/src/scripts/purgeCorruptEmails.js --dry   (report only, no writes)
//   node backend/src/scripts/purgeCorruptEmails.js         (apply)
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env'), override: false });

const { initializeDatabase, getDb } = require('../models/database');
const { isImageBugCorruptedEmail } = require('../services/innertubeService');

const DRY_RUN = process.argv.includes('--dry');

// isImageBugCorruptedEmail (exported from innertubeService.js, the same file
// extractEmail lives in) checks specifically for the image-extraction bug's
// three signatures — asset-extension TLD, retina-density marker, trailing
// second extension — not "is this a valid-looking email for any reason",
// so pre-existing unrelated garbage (single-char local parts, punctuation-only
// local parts, etc.) is correctly left untouched by this script.
const isCorruptStoredEmail = isImageBugCorruptedEmail;

const TABLES = [
  { name: 'leads', idCol: 'id', nullEmail: true },
  { name: 'master_leads', idCol: 'id', nullEmail: false },
  { name: 'quality_leads', idCol: 'id', nullEmail: true },
  { name: 'archived_leads', idCol: 'id', nullEmail: true },
];

async function findCorruptIds(db, table) {
  const rows = await db.all(`SELECT ${table.idCol} as id, email FROM ${table.name} WHERE email IS NOT NULL AND email != ''`);
  const corruptIds = rows.filter(r => isCorruptStoredEmail(r.email)).map(r => r.id);
  return { totalWithEmail: rows.length, corruptIds };
}

async function purgeTable(db, table) {
  const before = await findCorruptIds(db, table);

  console.log(`\n[${table.name}]`);
  console.log(`  rows with non-empty email: ${before.totalWithEmail}`);
  console.log(`  corrupt (image/asset filename) matches: ${before.corruptIds.length}`);

  if (!before.corruptIds.length) {
    return { table: table.name, before: before.totalWithEmail, corrupt: 0, after: before.totalWithEmail };
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] would ${table.nullEmail ? 'NULL email + set' : 'set'} email_corrupt=1 on ${before.corruptIds.length} row(s)`);
    return { table: table.name, before: before.totalWithEmail, corrupt: before.corruptIds.length, after: before.totalWithEmail, dryRun: true };
  }

  const placeholders = before.corruptIds.map(() => '?').join(',');
  if (table.nullEmail) {
    await db.run(`UPDATE ${table.name} SET email = NULL, email_corrupt = 1 WHERE ${table.idCol} IN (${placeholders})`, before.corruptIds);
  } else {
    await db.run(`UPDATE ${table.name} SET email_corrupt = 1 WHERE ${table.idCol} IN (${placeholders})`, before.corruptIds);
  }

  const afterWithEmail = (await db.get(`SELECT COUNT(*) as c FROM ${table.name} WHERE email IS NOT NULL AND email != ''`)).c;
  const flaggedCount = (await db.get(`SELECT COUNT(*) as c FROM ${table.name} WHERE email_corrupt = 1`)).c;
  console.log(`  after: rows with non-empty email: ${afterWithEmail}, email_corrupt=1 rows: ${flaggedCount}`);

  return { table: table.name, before: before.totalWithEmail, corrupt: before.corruptIds.length, after: afterWithEmail };
}

(async () => {
  await initializeDatabase();
  const db = getDb();

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`purgeCorruptEmails — ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLYING CHANGES'}`);
  console.log('═══════════════════════════════════════════════════════════');

  const results = [];
  for (const table of TABLES) {
    results.push(await purgeTable(db, table));
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('SUMMARY');
  console.log('───────────────────────────────────────────────────────────');
  let totalCorrupt = 0;
  for (const r of results) {
    console.log(`  ${r.table.padEnd(16)} corrupt=${String(r.corrupt).padStart(4)}  ${DRY_RUN ? '(dry-run, no changes made)' : 'fixed'}`);
    totalCorrupt += r.corrupt;
  }
  console.log(`  TOTAL corrupt rows found: ${totalCorrupt}`);
  console.log('───────────────────────────────────────────────────────────\n');
})()
  .catch(err => { console.error('[FATAL]', err.message); process.exit(1); })
  .finally(() => process.exit(0));
