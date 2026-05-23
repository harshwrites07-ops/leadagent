const db = require('./src/models/database').getDb();

// 1. Fix all stuck "sending" items - reset to failed so queue is clean
const stuck = db.prepare(`UPDATE email_queue SET status='failed' WHERE status='sending'`).run();
console.log('Cleared stuck items:', stuck.changes);

// 2. Mark all leads that bounced today as email_invalid so they never get queued again
const markInvalid = db.prepare(`
  UPDATE leads SET email_invalid=1, bounce_reason='hard_bounce', updated_at=CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT DISTINCT lead_id FROM emails WHERE status='bounced'
  ) AND (email_invalid IS NULL OR email_invalid=0)
`).run();
console.log('Newly marked invalid from bounce history:', markInvalid.changes);

// 3. Remove any remaining queued items for now-invalid leads
const removeInvalid = db.prepare(`
  UPDATE email_queue SET status='cancelled'
  WHERE status='pending' AND lead_id IN (SELECT id FROM leads WHERE email_invalid=1)
`).run();
console.log('Cancelled queued emails for invalid leads:', removeInvalid.changes);

// 4. Final stats
const queueStats = db.prepare(`SELECT status, COUNT(*) as c FROM email_queue GROUP BY status`).all();
console.log('\nQueue after cleanup:');
queueStats.forEach(s => console.log(' ', s.status, s.c));

const totalInvalid = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();
const totalValid = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE (email_invalid IS NULL OR email_invalid=0) AND email IS NOT NULL`).get();
console.log('\nLead DB: invalid =', totalInvalid.c, '| valid remaining =', totalValid.c);

console.log('\nDone. Queue is clean and paused.');
