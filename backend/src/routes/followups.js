const express = require('express');
const router = express.Router();
const { getDb, logActivity, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateFollowUp2, generateFollowUp3, generateFollowUp4 } = require('../services/followUp');
const { sendEmail } = require('../services/emailService');
const { buildSnapshot } = require('../services/signalSnapshot');

const daysSql = USE_PG
  ? `EXTRACT(EPOCH FROM (NOW() - last_contacted_date::timestamp)) / 86400 >= 3`
  : `julianday('now') - julianday(last_contacted_date) >= 3`;

async function getFollowUpEmail(db, lead, nextStep) {
  const userRow = await db.get('SELECT voice_dna FROM users WHERE id=?', [lead.user_id]);
  const voiceDNA = userRow?.voice_dna ? (() => { try { return JSON.parse(userRow.voice_dna); } catch { return {}; } })() : {};

  const pitchRow = await db.get('SELECT cold_email, email_subject FROM pitches WHERE lead_id=? ORDER BY updated_at DESC LIMIT 1', [lead.id]);
  const email1 = { subject: pitchRow?.email_subject || '', body: pitchRow?.cold_email || '' };

  if (nextStep === 2) {
    return generateFollowUp2(lead, email1, voiceDNA, null);
  } else if (nextStep === 3) {
    const email2 = { subject: `re: ${email1.subject}` };
    return generateFollowUp3(lead, email1, email2, voiceDNA, null);
  } else {
    return generateFollowUp4(lead, email1, voiceDNA, null);
  }
}

router.get('/pending', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const due = await db.get(`SELECT COUNT(*) as count FROM leads WHERE user_id=? AND crm_stage='emailed' AND follow_up_status='active' AND follow_up_count<4 AND last_contacted_date IS NOT NULL AND email IS NOT NULL AND email!='' AND ${daysSql}`, [uid]);
  const breakdown = await db.all(`SELECT follow_up_count, COUNT(*) as n FROM leads WHERE user_id=? AND crm_stage='emailed' AND follow_up_status='active' AND follow_up_count<4 AND last_contacted_date IS NOT NULL AND email IS NOT NULL AND email!='' GROUP BY follow_up_count`, [uid]);
  res.json({ success: true, due: due.count, breakdown });
}));

router.post('/send-all', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  const emit = (event, data) => {
    if (!closed) { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} }
  };

  try {
    const db = getDb();
    const { max_leads = 50 } = req.body || {};
    const daysFull = USE_PG
      ? `EXTRACT(EPOCH FROM (NOW() - l.last_contacted_date::timestamp)) / 86400 >= 3`
      : `julianday('now') - julianday(l.last_contacted_date) >= 3`;

    const leads = await db.all(`
      SELECT l.*, l.user_id
      FROM leads l
      WHERE l.user_id=? AND l.crm_stage='emailed' AND l.follow_up_status='active'
        AND l.follow_up_count<4 AND l.last_contacted_date IS NOT NULL
        AND l.email IS NOT NULL AND l.email!='' AND ${daysFull}
      ORDER BY l.lead_score DESC LIMIT ?
    `, [req.user.id, max_leads]);

    emit('start', { total: leads.length });
    if (!leads.length) { emit('done', { sent: 0, failed: 0, total: 0, message: 'No follow-ups due right now' }); res.end(); return; }

    const stats = { sent: 0, failed: 0 };
    const CONCURRENCY = 3;

    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      if (closed) break;
      const batch = leads.slice(i, i + CONCURRENCY);

      await Promise.allSettled(batch.map(async lead => {
        if (closed) return;
        const nextStep = (lead.follow_up_count || 0) + 1;
        try {
          emit('progress', { type: 'generating', channel: lead.channel_name, step: nextStep, id: lead.id, stats: { ...stats } });

          const followUpEmail = await getFollowUpEmail(db, lead, nextStep);
          const { subject, body } = followUpEmail;

          const snapshot = await buildSnapshot(lead);
          const qrSql = USE_PG
            ? `INSERT INTO email_queue (user_id,lead_id,subject,body,status,priority,signal_snapshot) VALUES (?,?,?,?,'pending',?,?) RETURNING id`
            : `INSERT INTO email_queue (user_id,lead_id,subject,body,status,priority,signal_snapshot) VALUES (?,?,?,?,'pending',?,?)`;
          const qr = await db.run(qrSql, [req.user.id, lead.id, subject, body, nextStep, snapshot]);
          await db.run(`UPDATE email_queue SET status='sending' WHERE id=?`, [qr.lastID]);
          await sendEmail({ to: lead.email, subject, body, leadId: lead.id, userId: req.user.id, followUpNumber: nextStep, signalSnapshot: snapshot });
          await db.run(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`, [qr.lastID]);

          const lcSql = USE_PG
            ? `UPDATE leads SET follow_up_count=?, last_contacted_date=CURRENT_DATE, updated_at=CURRENT_TIMESTAMP WHERE id=?`
            : `UPDATE leads SET follow_up_count=?, last_contacted_date=date('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?`;
          await db.run(lcSql, [nextStep, lead.id]);

          if (nextStep >= 4) {
            await db.run(`UPDATE leads SET follow_up_status='complete', crm_stage='no_response', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
          }

          logActivity('followup_sent', `Follow-up #${nextStep}/4 sent to ${lead.channel_name}`, lead.id, {}, req.user.id);
          stats.sent++;
          emit('progress', { type: 'sent', channel: lead.channel_name, step: nextStep, email: lead.email, id: lead.id, stats: { ...stats } });
        } catch (err) {
          stats.failed++;
          emit('progress', { type: 'failed', channel: lead.channel_name, step: nextStep, error: err.message?.substring(0, 100), id: lead.id, stats: { ...stats } });
        }
      }));
    }

    emit('done', { ...stats, total: leads.length });
  } catch (err) {
    emit('error', { message: err.message });
  } finally {
    res.end();
  }
});

router.post('/pause/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  await db.run(`UPDATE leads SET follow_up_status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`, [req.params.leadId, req.user.id]);
  res.json({ success: true });
}));

router.post('/resume/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  await db.run(`UPDATE leads SET follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`, [req.params.leadId, req.user.id]);
  res.json({ success: true });
}));

module.exports = router;
