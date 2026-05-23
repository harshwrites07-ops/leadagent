const db = require('./src/models/database').getDb();
const { getSetting } = require('./src/models/database');

const q = db.prepare(`SELECT status, COUNT(*) as c FROM email_queue GROUP BY status`).all();
console.log('QUEUE:', q.map(r => r.status + ':' + r.c).join(' | '));

console.log('queue_paused:', getSetting('queue_paused'));
console.log('auto_followup:', getSetting('auto_followup'));

const inv = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();
const fu = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE follow_up_status='active' AND (email_invalid IS NULL OR email_invalid=0)`).get();
console.log('Invalid leads:', inv.c, '| Valid active follow-ups:', fu.c);

const todaySent = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') AND status='sent'`).get();
const todayBounced = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') AND status='bounced'`).get();
console.log('Today sent:', todaySent.c, '| Today bounced:', todayBounced.c);

// Total bounce rate
const total30 = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE sent_at >= datetime('now','-30 days')`).get();
const bounce30 = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE sent_at >= datetime('now','-30 days') AND status='bounced'`).get();
console.log('30-day: sent', total30.c, '| bounced', bounce30.c, '| rate', total30.c > 0 ? (bounce30.c/total30.c*100).toFixed(1)+'%' : 'N/A');
