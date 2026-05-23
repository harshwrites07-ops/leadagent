const db = require('./src/models/database').getDb();
const { getSetting } = require('./src/models/database');

console.log('=== QUEUE STATUS ===');
db.prepare(`SELECT status, COUNT(*) as c FROM email_queue GROUP BY status`).all().forEach(s => console.log(s.status, s.c));

console.log('\n=== QUEUE PAUSED SETTING ===');
console.log('queue_paused =', getSetting('queue_paused'));

console.log('\n=== TODAYS ACTUAL SENDS (status=sent sent today) ===');
const todaySent = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') AND status='sent'`).get();
console.log('Actually sent today:', todaySent.c);

console.log('\n=== TODAYS BOUNCES (status=bounced, sent today) ===');
const todayBounced = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') AND status='bounced'`).get();
console.log('Bounced today:', todayBounced.c);

console.log('\n=== EMAILS CREATED TODAY (any status) ===');
const todayAll = db.prepare(`SELECT status, COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') GROUP BY status`).all();
todayAll.forEach(r => console.log(r.status, r.c));

console.log('\n=== FOLLOW-UP STATUS ===');
const fuLeads = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE follow_up_status='active' AND crm_stage='emailed'`).get();
console.log('Active follow-up leads:', fuLeads.c);

console.log('\n=== TOTAL INVALID LEADS ===');
const invalid = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();
console.log(invalid.c);
