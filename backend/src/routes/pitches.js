const express = require('express');
const router = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { aiLimiter } = require('../middleware/rateLimiter');
const claude = require('../services/claudeService');

function parsePitch(pitch) {
  if (!pitch) return null;
  return {
    ...pitch,
    subject_variants: (() => {
      try { return JSON.parse(pitch.subject_variants || '[]'); } catch { return []; }
    })(),
  };
}

// Upsert a pitch record
function savePitch(db, leadId, { email_subject, email_body, deep_study, custom_offer, subject_variants, pitch_score, pitch_feedback, reddit_dm }) {
  const existing = db.prepare('SELECT id FROM pitches WHERE lead_id = ?').get(leadId);
  if (existing) {
    db.prepare(`
      UPDATE pitches SET deep_study=COALESCE(?,deep_study), custom_offer=COALESCE(?,custom_offer),
        cold_email=?, email_subject=?, reddit_dm=COALESCE(?,reddit_dm),
        subject_variants=?, pitch_score=COALESCE(?,pitch_score), pitch_feedback=COALESCE(?,pitch_feedback),
        updated_at=CURRENT_TIMESTAMP
      WHERE lead_id=?
    `).run(deep_study || null, custom_offer || null, email_body, email_subject,
           reddit_dm || null, JSON.stringify(subject_variants || []),
           pitch_score || null, pitch_feedback || null, leadId);
  } else {
    db.prepare(`
      INSERT INTO pitches (lead_id,deep_study,custom_offer,cold_email,email_subject,reddit_dm,subject_variants,pitch_score,pitch_feedback)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(leadId, deep_study || null, custom_offer || null, email_body, email_subject,
           reddit_dm || null, JSON.stringify(subject_variants || []),
           pitch_score || null, pitch_feedback || null);
  }
}

// ─── Single pitch (fast path) ─────────────────────────────────────────────────
router.post('/generate/:leadId', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.leadId);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
  logActivity('pitch_generating', `Generating pitch for ${lead.channel_name}`, lead.id);

  // ONE AI call instead of 4-6
  const result = await claude.generateFullPitch(lead);

  // Optional: generate Reddit DM for reddit leads
  let redditDm = null;
  if (lead.platform === 'reddit' || lead.reddit_username) {
    try {
      const study = result.key_insight;
      redditDm = await claude.generateRedditDM(lead, study);
    } catch {}
  }

  savePitch(db, lead.id, {
    email_subject: result.email_subject,
    email_body: result.email_body,
    deep_study: result.key_insight,
    custom_offer: result.custom_offer,
    subject_variants: result.subject_variants,
    reddit_dm: redditDm,
  });

  db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
  logActivity('pitch_generated', `Pitch generated for ${lead.channel_name}`, lead.id);

  const pitch = parsePitch(db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(lead.id));
  res.json({ success: true, pitch });
}));

// ─── By-lead lookup ───────────────────────────────────────────────────────────
router.get('/by-lead/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const pitch = parsePitch(db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(req.params.leadId));
  if (!pitch) return res.status(404).json({ success: false, error: 'No pitch found for this lead' });
  res.json({ success: true, pitch });
}));

// ─── Bulk generate — parallel, 5 concurrent ───────────────────────────────────
router.post('/bulk-generate', aiLimiter, asyncHandler(async (req, res) => {
  const leadIds = req.body.lead_ids || req.body.leadIds;
  if (!leadIds?.length) return res.status(400).json({ success: false, error: 'lead_ids required' });

  const db = getDb();
  const ids = leadIds.slice(0, 20);
  const results = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async id => {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
        if (!lead) return { id, success: false, error: 'Not found' };
        db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
        const result = await claude.generateFullPitch(lead);
        savePitch(db, id, {
          email_subject: result.email_subject,
          email_body: result.email_body,
          deep_study: result.key_insight,
          custom_offer: result.custom_offer,
          subject_variants: result.subject_variants,
        });
        db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
        return { id, success: true };
      })
    );
    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : { id: batch[batchResults.indexOf(r)], success: false, error: r.reason?.message });
    }
  }

  res.json({ success: true, results });
}));

// ─── Generate + Send all in one shot — parallel, 5 concurrent ────────────────
router.post('/generate-and-send', aiLimiter, asyncHandler(async (req, res) => {
  const leadIds = req.body.lead_ids || req.body.leadIds;
  if (!leadIds?.length) return res.status(400).json({ success: false, error: 'lead_ids required' });

  const db = getDb();
  const { sendEmail } = require('../services/emailService');
  const ids = leadIds.slice(0, 20);
  const results = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async id => {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
        if (!lead) return { id, success: false, error: 'Not found' };
        if (!lead.email) return { id, success: false, error: 'No email', channel_name: lead.channel_name };

        db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);

        const result = await claude.generateFullPitch(lead);
        savePitch(db, id, {
          email_subject: result.email_subject,
          email_body: result.email_body,
          deep_study: result.key_insight,
          custom_offer: result.custom_offer,
          subject_variants: result.subject_variants,
        });

        const qr = db.prepare(`INSERT INTO email_queue (lead_id,subject,body,status) VALUES (?,?,?,'pending')`).run(id, result.email_subject, result.email_body);
        db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);

        const sent = await sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: id });
        db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`).run(sent.emailId || null, qr.lastInsertRowid);
        db.prepare(`UPDATE leads SET crm_stage='emailed', last_contacted_date=date('now'), follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
        logActivity('email_sent', `Email sent to ${lead.channel_name}`, id);
        return { id, success: true, channel_name: lead.channel_name, email: lead.email };
      })
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        const id = batch[batchResults.indexOf(r)];
        results.push({ id, success: false, error: r.reason?.message });
        try { db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id); } catch {}
      }
    }
  }

  const sent = results.filter(r => r.success).length;
  res.json({ success: true, results, sent, total: results.length });
}));

// ─── Power Send — SSE streaming bulk generate + send ─────────────────────────
// Auto-picks HOT leads (or uses lead_ids) and streams progress via SSE
router.post('/power-send', aiLimiter, async (req, res) => {
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

  // Heartbeat every 20s — keeps Cloudflare from killing the SSE connection (524 timeout)
  const heartbeat = setInterval(() => {
    if (!closed) { try { res.write(': heartbeat\n\n'); } catch {} }
  }, 20000);

  try {
    const db = getDb();
    const { sendEmail } = require('../services/emailService');
    const { lead_ids, max_leads = 100 } = req.body;

    let leads;
    if (lead_ids && lead_ids.length > 0) {
      leads = lead_ids.slice(0, max_leads)
        .map(id => db.prepare('SELECT * FROM leads WHERE id = ?').get(id))
        .filter(Boolean)
        .filter(l => l.email);
    } else {
      leads = db.prepare(`
        SELECT l.* FROM leads l
        WHERE l.email IS NOT NULL AND l.email != ''
          AND l.temperature = 'hot'
          AND l.crm_stage NOT IN ('emailed','opened','replied','call_booked','closed_won','closed_lost')
        ORDER BY l.subscriber_count DESC
        LIMIT ?
      `).all(max_leads);

      if (leads.length < max_leads) {
        const needed = max_leads - leads.length;
        const hotIds = leads.map(l => l.id);
        const warm = db.prepare(`
          SELECT l.* FROM leads l
          WHERE l.email IS NOT NULL AND l.email != ''
            AND l.temperature = 'warm'
            AND l.crm_stage NOT IN ('emailed','opened','replied','call_booked','closed_won','closed_lost')
            ${hotIds.length ? `AND l.id NOT IN (${hotIds.map(() => '?').join(',')})` : ''}
          ORDER BY l.subscriber_count DESC
          LIMIT ?
        `).all(...hotIds, needed);
        leads.push(...warm);
      }
    }

    emit('start', { total: leads.length });

    const stats = { studied: 0, generated: 0, sent: 0, failed: 0 };
    const CONCURRENCY = 3;

    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      if (closed) break;
      const batch = leads.slice(i, i + CONCURRENCY);

      await Promise.allSettled(batch.map(async lead => {
        if (closed) return;
        try {
          emit('progress', { type: 'studying', channel: lead.channel_name, id: lead.id, stats: { ...stats } });
          db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);

          const result = await claude.generateFullPitch(lead);
          stats.studied++;
          stats.generated++;
          emit('progress', { type: 'generated', channel: lead.channel_name, id: lead.id, stats: { ...stats } });

          savePitch(db, lead.id, {
            email_subject: result.email_subject,
            email_body: result.email_body,
            deep_study: result.key_insight,
            custom_offer: result.custom_offer,
            subject_variants: result.subject_variants,
          });

          const sent = await sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: lead.id });
          db.prepare(`UPDATE leads SET crm_stage='emailed', last_contacted_date=date('now'), follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
          logActivity('email_sent', `Email sent to ${lead.channel_name}`, lead.id);
          stats.sent++;
          emit('progress', { type: 'sent', channel: lead.channel_name, email: lead.email, id: lead.id, stats: { ...stats } });
        } catch (err) {
          stats.failed++;
          emit('progress', { type: 'failed', channel: lead.channel_name, error: err.message?.substring(0, 100), id: lead.id, stats: { ...stats } });
          try { db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id); } catch {}
        }
      }));
    }

    emit('done', { ...stats, total: leads.length });
  } catch (err) {
    emit('error', { message: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ─── Get pitch ────────────────────────────────────────────────────────────────
router.get('/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const pitch = parsePitch(db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(req.params.leadId));
  if (!pitch) return res.status(404).json({ success: false, error: 'No pitch found' });
  res.json({ success: true, pitch });
}));

// ─── Update pitch ─────────────────────────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const { cold_email, email_subject, reddit_dm, custom_offer } = req.body;
  db.prepare(`
    UPDATE pitches SET cold_email=COALESCE(?,cold_email), email_subject=COALESCE(?,email_subject),
    reddit_dm=COALESCE(?,reddit_dm), custom_offer=COALESCE(?,custom_offer), updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(cold_email || null, email_subject || null, reddit_dm || null, custom_offer || null, req.params.id);
  const pitch = parsePitch(db.prepare('SELECT * FROM pitches WHERE id = ?').get(req.params.id));
  res.json({ success: true, pitch });
}));

// ─── Rescore ──────────────────────────────────────────────────────────────────
router.post('/:id/rescore', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const pitch = db.prepare('SELECT * FROM pitches WHERE id = ?').get(req.params.id);
  if (!pitch) return res.status(404).json({ success: false, error: 'Pitch not found' });
  const emailBody = req.body.body || pitch.cold_email;
  const scoreResult = await claude.scorePitch(emailBody);
  db.prepare(`UPDATE pitches SET pitch_score=?,pitch_feedback=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(scoreResult.score, scoreResult.feedback, pitch.id);
  res.json({ success: true, pitch_score: scoreResult.score, pitch_feedback: scoreResult.feedback });
}));

// ─── Suggest reply ────────────────────────────────────────────────────────────
router.post('/suggest-reply/:leadId', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const { replyText } = req.body;
  if (!replyText) return res.status(400).json({ success: false, error: 'replyText required' });
  const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(req.params.leadId);
  const suggestion = await claude.suggestReplyResponse(pitch?.cold_email || '', replyText);
  res.json({ success: true, suggestion });
}));

module.exports = router;
