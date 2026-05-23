/**
 * Safe Resume Script
 * Run AFTER the server is running: node safe-resume.js
 *
 * What this does:
 *  1. MX-validates all leads — marks no-MX domains as invalid
 *  2. Resets follow_up_status='active' for leads that are genuinely reachable
 *  3. Sets conservative daily limit (20/inbox)
 *  4. Re-enables auto_followup
 *  5. Unpauses the queue
 */

const db = require('./src/models/database').getDb();
const { setSetting } = require('./src/models/database');
const { hasMxRecord, getInboxes } = require('./src/services/emailService');

async function run() {
  console.log('=== Safe Resume ===\n');

  // 1. MX validate all non-invalid leads
  const leads = db.prepare(`
    SELECT id, email FROM leads
    WHERE email IS NOT NULL AND email != ''
    AND (email_invalid IS NULL OR email_invalid = 0)
  `).all();

  console.log(`Checking MX records for ${leads.length} leads...`);
  const domainCache = {};
  let mxInvalidated = 0;

  for (const lead of leads) {
    const domain = lead.email.split('@')[1]?.toLowerCase();
    if (!domain) continue;
    if (!(domain in domainCache)) {
      domainCache[domain] = await hasMxRecord(domain);
    }
    if (!domainCache[domain]) {
      db.prepare(`UPDATE leads SET email_invalid=1, bounce_reason='no_mx_record', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      mxInvalidated++;
    }
  }
  console.log(`  MX invalidated: ${mxInvalidated} leads`);

  // 2. Re-activate follow-ups ONLY for leads that are valid and reachable
  const reactivated = db.prepare(`
    UPDATE leads SET follow_up_status='active', updated_at=CURRENT_TIMESTAMP
    WHERE follow_up_status='paused'
      AND (email_invalid IS NULL OR email_invalid = 0)
      AND email IS NOT NULL AND email != ''
      AND crm_stage = 'emailed'
      AND follow_up_count < 5
      AND id IN (SELECT DISTINCT lead_id FROM emails WHERE status = 'sent')
  `).run();
  console.log(`  Follow-ups reactivated: ${reactivated.changes} leads`);

  // 3. Conservative daily limit: 20 emails per inbox per day
  const inboxCount = getInboxes().length || 1;
  setSetting('daily_send_limit', '20');
  console.log(`  Daily limit set to 20/inbox (${20 * inboxCount} total across ${inboxCount} inboxes)`);

  // 4. Re-enable auto follow-up
  setSetting('auto_followup', 'true');
  console.log('  auto_followup: ENABLED');

  // 5. Unpause queue
  setSetting('queue_paused', '0');
  console.log('  queue: UNPAUSED');

  // Final stats
  const q = db.prepare(`SELECT status, COUNT(*) as c FROM email_queue GROUP BY status`).all();
  const inv = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE email_invalid=1`).get();
  const validFU = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE follow_up_status='active' AND (email_invalid IS NULL OR email_invalid=0)`).get();

  console.log('\n=== System State ===');
  console.log('Queue:', q.map(r => `${r.status}:${r.c}`).join(' | ') || 'empty');
  console.log('Invalid leads:', inv.c);
  console.log('Active follow-ups:', validFU.c);
  console.log('\nReady to send. Daily cap: 20 emails/inbox.');
  console.log('Raise limit in Settings once bounce rate stays under 2%.');
}

run().catch(console.error);
