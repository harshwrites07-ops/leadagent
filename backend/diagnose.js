const db = require('./src/models/database').getDb();

const bounces = db.prepare(`SELECT l.channel_name, l.email, e.bounce_reason FROM emails e JOIN leads l ON l.id=e.lead_id WHERE e.status='bounced' AND DATE(e.sent_at)=DATE('now') ORDER BY e.id DESC LIMIT 40`).all();
console.log('TODAY BOUNCES:', bounces.length);
bounces.forEach(b => console.log(' ', b.channel_name, '|', b.email));

const inv = db.prepare(`SELECT COUNT(*) as c FROM email_queue eq JOIN leads l ON l.id=eq.lead_id WHERE eq.status='pending' AND l.email_invalid=1`).get();
console.log('\nINVALID LEADS STILL IN QUEUE:', inv.c);

const stats = db.prepare(`SELECT status, COUNT(*) as c FROM email_queue GROUP BY status`).all();
console.log('\nQUEUE COUNTS:');
stats.forEach(s => console.log(' ', s.status, s.c));

const dupes = db.prepare(`SELECT lead_id, COUNT(*) as cnt FROM email_queue WHERE status='pending' GROUP BY lead_id HAVING cnt > 1 LIMIT 10`).all();
console.log('\nDUPLICATE LEADS IN QUEUE:', dupes.length, 'leads have multiple queued emails');
dupes.forEach(d => console.log('  lead_id', d.lead_id, 'x', d.cnt));

const totalInvalid = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();
console.log('\nTOTAL INVALID LEADS IN DB:', totalInvalid.c);
