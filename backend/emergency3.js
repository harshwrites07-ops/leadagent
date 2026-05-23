const db = require('./src/models/database').getDb();
const { setSetting } = require('./src/models/database');

// 1. Clear remaining stuck items
const stuck = db.prepare(`UPDATE email_queue SET status='failed' WHERE status='sending'`).run();
console.log('Cleared stuck:', stuck.changes);

// 2. DISABLE auto follow-up — it keeps firing at 2507 leads every hour
setSetting('auto_followup', 'false');
console.log('auto_followup disabled');

// 3. Stop ALL active follow-ups globally — nothing should fire until we re-enable
const stopAll = db.prepare(`UPDATE leads SET follow_up_status='paused' WHERE follow_up_status='active'`).run();
console.log('Follow-ups paused for', stopAll.changes, 'leads');

// 4. Final check
const q = db.prepare(`SELECT status, COUNT(*) as c FROM email_queue GROUP BY status`).all();
console.log('\nQueue:', q.map(r => r.status+':'+r.c).join(' | '));
console.log('Sending now:', db.prepare(`SELECT COUNT(*) as c FROM email_queue WHERE status='sending'`).get().c);
