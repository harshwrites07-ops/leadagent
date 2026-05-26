const express = require('express');
const router = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateFollowUp } = require('../services/claudeService');
const { sendEmail } = require('../services/emailService');

// GET /api/followups/pending — count leads due for follow-up
router.get('/pending', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const due = db.prepare(`
    SELECT COUNT(*) as count FROM leads
    WHERE user_id = ?
      AND crm_stage = 'emailed'
      AND follow_up_status = 'active'
      AND follow_up_count < 5
      AND last_contacted_date IS NOT NULL
      AND email IS NOT NULL AND email != ''
      AND julianday('now') - julianday(last_contacted_date) >= 3
  `).get(uid);

  const breakdown = db.prepare(`
    SELECT follow_up_count, COUNT(*) as n FROM leads
    WHERE user_id = ?
      AND crm_stage = 'emailed'
      AND follow_up_status = 'active'
      AND follow_up_count < 5
      AND last_contacted_date IS NOT NULL
      AND email IS NOT NULL AND email != ''
    GROUP BY follow_up_count
  `).all(uid);

  res.json({ success: true, due: due.count, breakdown });
}));

// POST /api/followups/send-all — SSE streaming send all due follow-ups
router.post('/send-all', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  const emit = (event, data) => {
    if (!closed) {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
    }
  };

  try {
    const db = getDb();
    const { max_leads = 50 } = req.body || {};

    const leads = db.prepare(`
      SELECT l.*, p.cold_email as original_email
      FROM leads l
      LEFT JOIN pitches p ON p.lead_id = l.id
      WHERE l.user_id = ?
        AND l.crm_stage = 'emailed'
        AND l.follow_up_status = 'active'
        AND l.follow_up_count < 5
        AND l.last_contacted_date IS NOT NULL
        AND l.email IS NOT NULL AND l.email != ''
        AND julianday('now') - julianday(l.last_contacted_date) >= 3
      ORDER BY l.lead_score DESC
      LIMIT ?
    `).all(req.user.id, max_leads);

    emit('start', { total: leads.length });

    if (!leads.length) {
      emit('done', { sent: 0, failed: 0, total: 0, message: 'No follow-ups due right now' });
      res.end();
      return;
    }

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

          const followUpRaw = await generateFollowUp(lead, lead.original_email || '', nextStep);
          const subjectMatch = followUpRaw.match(/SUBJECT:\s*(.+)/i);
          const bodyMatch = followUpRaw.match(/---\s*([\s\S]+)/);
          const subject = subjectMatch?.[1]?.trim() || `Following up — ${lead.channel_name}`;
          const body = bodyMatch?.[1]?.trim() || followUpRaw;

          const qr = db.prepare(`INSERT INTO email_queue (user_id,lead_id,subject,body,status,priority) VALUES (?,?,?,?,'pending',?)`).run(req.user.id, lead.id, subject, body, nextStep);
          db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);

          await sendEmail({ to: lead.email, subject, body, leadId: lead.id, userId: req.user.id });

          db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(qr.lastInsertRowid);
          db.prepare(`UPDATE leads SET follow_up_count=?, last_contacted_date=date('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nextStep, lead.id);

          if (nextStep >= 5) {
            db.prepare(`UPDATE leads SET follow_up_status='complete', crm_stage='no_response', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
          }

          logActivity('followup_sent', `Follow-up #${nextStep}/5 sent to ${lead.channel_name}`, lead.id, {}, req.user.id);
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

// POST /api/followups/pause/:leadId — stop follow-ups for a lead
router.post('/pause/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE leads SET follow_up_status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(req.params.leadId, req.user.id);
  res.json({ success: true });
}));

// POST /api/followups/resume/:leadId — resume follow-ups for a lead
router.post('/resume/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE leads SET follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(req.params.leadId, req.user.id);
  res.json({ success: true });
}));

module.exports = router;
