const db = require('./src/models/database').getDb();

// 1. Clear all stuck "sending" queue items
const stuck = db.prepare(`UPDATE email_queue SET status='failed' WHERE status='sending'`).run();
console.log('Cleared stuck queue items:', stuck.changes);

// 2. Stop follow-ups for all invalid leads — they will never convert and only damage domain
const stopFollowups = db.prepare(`
  UPDATE leads SET follow_up_status='complete', updated_at=CURRENT_TIMESTAMP
  WHERE email_invalid=1 AND follow_up_status='active'
`).run();
console.log('Stopped follow-ups for invalid leads:', stopFollowups.changes);

// 3. Mark any bounced leads from today as invalid (catch any that SMTP bounce detection missed)
const markFromBounce = db.prepare(`
  UPDATE leads SET email_invalid=1, bounce_reason='hard_bounce', updated_at=CURRENT_TIMESTAMP
  WHERE (email_invalid IS NULL OR email_invalid=0)
    AND id IN (SELECT DISTINCT lead_id FROM emails WHERE status='bounced')
`).run();
console.log('Newly marked invalid (from bounce history):', markFromBounce.changes);

// 4. Stop follow-ups for any newly-marked invalid leads
const stopNew = db.prepare(`
  UPDATE leads SET follow_up_status='complete', updated_at=CURRENT_TIMESTAMP
  WHERE email_invalid=1 AND follow_up_status='active'
`).run();
console.log('Stopped follow-ups for newly-invalidated leads:', stopNew.changes);

// 5. Stats
const inv = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();
const valid = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE (email_invalid IS NULL OR email_invalid=0) AND email IS NOT NULL AND email != ''`).get();
const activeFU = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE follow_up_status='active'`).get();
console.log('\nFinal state:');
console.log('  Invalid leads:', inv.c);
console.log('  Valid leads:', valid.c);
console.log('  Active follow-up leads:', activeFU.c);
console.log('\nQueue is paused. Server restart will clean any remaining stuck items.');
