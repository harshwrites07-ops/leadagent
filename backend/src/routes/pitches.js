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
function savePitch(db, leadId, userId, { email_subject, email_body, deep_study, custom_offer, subject_variants, pitch_score, pitch_feedback, reddit_dm }) {
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
      INSERT INTO pitches (lead_id,user_id,deep_study,custom_offer,cold_email,email_subject,reddit_dm,subject_variants,pitch_score,pitch_feedback)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(leadId, userId, deep_study || null, custom_offer || null, email_body, email_subject,
           reddit_dm || null, JSON.stringify(subject_variants || []),
           pitch_score || null, pitch_feedback || null);
  }
}

// ─── Single pitch (fast path) ─────────────────────────────────────────────────
router.post('/generate/:leadId', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(req.params.leadId, req.user.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
  logActivity('pitch_generating', `Generating pitch for ${lead.channel_name}`, lead.id, {}, req.user.id);

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

  savePitch(db, lead.id, req.user.id, {
    email_subject: result.email_subject,
    email_body: result.email_body,
    deep_study: result.key_insight,
    custom_offer: result.custom_offer,
    subject_variants: result.subject_variants,
    reddit_dm: redditDm,
  });

  db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
  logActivity('pitch_generated', `Pitch generated for ${lead.channel_name}`, lead.id, {}, req.user.id);

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
        const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!lead) return { id, success: false, error: 'Not found' };
        db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
        const result = await claude.generateFullPitch(lead);
        savePitch(db, id, req.user.id, {
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
        const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!lead) return { id, success: false, error: 'Not found' };
        if (!lead.email) return { id, success: false, error: 'No email', channel_name: lead.channel_name };

        db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);

        const result = await claude.generateFullPitch(lead);
        savePitch(db, id, req.user.id, {
          email_subject: result.email_subject,
          email_body: result.email_body,
          deep_study: result.key_insight,
          custom_offer: result.custom_offer,
          subject_variants: result.subject_variants,
        });

        const qr = db.prepare(`INSERT INTO email_queue (user_id,lead_id,subject,body,status) VALUES (?,?,?,?,'pending')`).run(req.user.id, id, result.email_subject, result.email_body);
        db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);

        const sent = await sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: id });
        db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`).run(sent.emailId || null, qr.lastInsertRowid);
        db.prepare(`UPDATE leads SET crm_stage='emailed', last_contacted_date=date('now'), follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
        logActivity('email_sent', `Email sent to ${lead.channel_name}`, id, {}, req.user.id);
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

// ─── Power Send — Background Job System ──────────────────────────────────────
// Jobs run entirely on the server. Browser can be closed — job keeps going.

const activeJobs = new Map(); // jobId → { stopped: false }

function jobLog(db, jobId, type, message) {
  try {
    const row = db.prepare('SELECT log FROM power_send_jobs WHERE id=?').get(jobId);
    if (!row) return;
    const log = JSON.parse(row.log || '[]');
    log.unshift({ type, message, time: new Date().toISOString() });
    if (log.length > 80) log.length = 80;
    db.prepare('UPDATE power_send_jobs SET log=? WHERE id=?').run(JSON.stringify(log), jobId);
  } catch {}
}

function jobUpdate(db, jobId, fields) {
  try {
    const keys = Object.keys(fields);
    const sql = `UPDATE power_send_jobs SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`;
    db.prepare(sql).run({ ...fields, id: jobId });
  } catch {}
}

async function runPowerSendJob(jobId, { lead_ids, max_leads = 100, per_account_limit = 0, gap_seconds = 0, skip_inboxes = [], _userId }) {
  const db = getDb();
  const { sendEmail, getInboxes } = require('../services/emailService');
  const ctx = activeJobs.get(jobId) || { stopped: false };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${ms / 1000}s for ${label}`)), ms)),
  ]);
  const isNetworkError = e => /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(e?.message || '');
  const withRetry = async (fn, label, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try { return await fn(); }
      catch (e) {
        if (isNetworkError(e) && i < retries - 1) {
          jobLog(db, jobId, 'waiting', `Network error, retrying in 30s... (${i + 1}/${retries - 1})`);
          await sleep(30000);
        } else throw e;
      }
    }
  };

  const runCounts = {};
  const getSkipInboxes = () => {
    const limitSkips = per_account_limit > 0
      ? Object.entries(runCounts).filter(([, c]) => c >= per_account_limit).map(([e]) => e)
      : [];
    return [...new Set([...skip_inboxes, ...limitSkips])];
  };

  try {
    let leads;
    if (lead_ids && lead_ids.length > 0) {
      leads = lead_ids.slice(0, max_leads)
        .map(id => db.prepare('SELECT * FROM leads WHERE id=? AND user_id=?').get(id, _userId))
        .filter(Boolean).filter(l => l.email);
    } else {
      leads = db.prepare(`
        SELECT * FROM leads
        WHERE email IS NOT NULL AND email != ''
          AND (email_invalid IS NULL OR email_invalid = 0)
          AND temperature = 'hot'
          AND crm_stage NOT IN ('emailed','opened','replied','call_booked','closed_won','closed_lost')
          AND user_id=?
        ORDER BY subscriber_count DESC LIMIT ?
      `).all(_userId, max_leads);

      if (leads.length < max_leads) {
        const needed = max_leads - leads.length;
        const hotIds = leads.map(l => l.id);
        const warm = db.prepare(`
          SELECT * FROM leads
          WHERE email IS NOT NULL AND email != ''
            AND (email_invalid IS NULL OR email_invalid = 0)
            AND temperature = 'warm'
            AND crm_stage NOT IN ('emailed','opened','replied','call_booked','closed_won','closed_lost')
            ${hotIds.length ? `AND id NOT IN (${hotIds.map(() => '?').join(',')})` : ''}
            AND user_id=?
          ORDER BY subscriber_count DESC LIMIT ?
        `).all(...hotIds, _userId, needed);
        leads.push(...warm);
      }
    }

    if (per_account_limit > 0) {
      const maxTotal = per_account_limit * (getInboxes().length || 1);
      if (leads.length > maxTotal) leads = leads.slice(0, maxTotal);
    }

    jobUpdate(db, jobId, { total: leads.length });
    jobLog(db, jobId, 'start', `Job started — ${leads.length} leads queued`);

    const stats = { studied: 0, generated: 0, sent: 0, failed: 0 };
    const CONCURRENCY = gap_seconds > 0 ? 1 : 3;

    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      if (ctx.stopped) break;

      if (per_account_limit > 0 && getSkipInboxes().length >= getInboxes().length) {
        jobLog(db, jobId, 'info', 'Per-account limit reached — job complete');
        break;
      }

      const batch = leads.slice(i, i + CONCURRENCY);

      await Promise.allSettled(batch.map(async lead => {
        if (ctx.stopped) return;
        try {
          jobLog(db, jobId, 'studying', `Studying ${lead.channel_name}...`);
          db.prepare(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);

          const result = await withRetry(
            () => withTimeout(claude.generateFullPitch(lead), 90000, lead.channel_name),
            lead.channel_name
          );
          stats.studied++;
          stats.generated++;
          jobUpdate(db, jobId, { studied: stats.studied, generated: stats.generated });
          jobLog(db, jobId, 'generated', `Pitch ready for ${lead.channel_name}`);

          savePitch(db, lead.id, _userId, {
            email_subject: result.email_subject,
            email_body: result.email_body,
            deep_study: result.key_insight,
            custom_offer: result.custom_offer,
            subject_variants: result.subject_variants,
          });

          const sentResult = await withRetry(
            () => sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: lead.id, skipInboxes: getSkipInboxes() }),
            lead.channel_name
          );
          if (sentResult.fromEmail) runCounts[sentResult.fromEmail] = (runCounts[sentResult.fromEmail] || 0) + 1;

          db.prepare(`UPDATE leads SET crm_stage='emailed', last_contacted_date=date('now'), follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
          logActivity('email_sent', `Email sent to ${lead.channel_name}`, lead.id, {}, _userId);
          stats.sent++;
          jobUpdate(db, jobId, { sent: stats.sent });
          jobLog(db, jobId, 'sent', `Sent to ${lead.channel_name} (${lead.email})`);

          if (gap_seconds > 0 && !ctx.stopped) {
            jobLog(db, jobId, 'waiting', `Waiting ${gap_seconds}s before next email...`);
            await sleep(gap_seconds * 1000);
          }
        } catch (err) {
          stats.failed++;
          jobUpdate(db, jobId, { failed: stats.failed });
          jobLog(db, jobId, 'failed', `Failed: ${lead.channel_name} — ${err.message?.substring(0, 100)}`);
          try { db.prepare(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id); } catch {}
        }
      }));
    }

    const finalStatus = ctx.stopped ? 'stopped' : 'done';
    jobUpdate(db, jobId, { status: finalStatus, completed_at: new Date().toISOString() });
    jobLog(db, jobId, 'done', `Complete! ${stats.sent} sent, ${stats.failed} failed out of ${leads.length}.`);
    logActivity('powermode', `Power Send done: ${stats.sent} emails sent`, null, {}, _userId);
  } catch (err) {
    jobUpdate(db, jobId, { status: 'error', completed_at: new Date().toISOString() });
    jobLog(db, jobId, 'failed', `Job crashed: ${err.message}`);
  } finally {
    activeJobs.delete(jobId);
  }
}

// POST /api/pitches/power-send — start background job, returns job_id immediately
router.post('/power-send', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();

  // Only one active job at a time per user
  const existing = db.prepare(`SELECT id FROM power_send_jobs WHERE status='running' AND user_id=? LIMIT 1`).get(req.user.id);
  if (existing) return res.json({ success: true, job_id: existing.id, status: 'already_running' });

  const settings = { ...req.body, _userId: req.user.id };
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO power_send_jobs (user_id, status, settings) VALUES (?, 'running', ?)
  `).run(req.user.id, JSON.stringify(req.body));

  const jobId = Number(lastInsertRowid);
  activeJobs.set(jobId, { stopped: false });

  // Fire and forget — runs completely independently of this HTTP request
  runPowerSendJob(jobId, settings).catch(() => {});

  res.json({ success: true, job_id: jobId, status: 'started' });
}));

// GET /api/pitches/power-send/active — returns running job, or interrupted job from last 30 min
router.get('/power-send/active', asyncHandler(async (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT * FROM power_send_jobs
    WHERE user_id = ?
      AND (status = 'running'
        OR (status = 'interrupted' AND started_at > datetime('now', '-30 minutes')))
    ORDER BY id DESC LIMIT 1
  `).get(req.user.id);
  res.json({ success: true, job: job || null });
}));

// POST /api/pitches/power-send/:jobId/dismiss — clear interrupted job so overlay resets
router.post('/power-send/:jobId/dismiss', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE power_send_jobs SET status='done', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=? AND status='interrupted'`).run(req.params.jobId, req.user.id);
  res.json({ success: true });
}));

// GET /api/pitches/power-send/:jobId — job status + log
router.get('/power-send/:jobId', asyncHandler(async (req, res) => {
  const db = getDb();
  const job = db.prepare(`SELECT * FROM power_send_jobs WHERE id=? AND user_id=?`).get(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, job });
}));

// POST /api/pitches/power-send/:jobId/stop — stop a running job
router.post('/power-send/:jobId/stop', asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.jobId);
  const ctx = activeJobs.get(jobId);
  if (ctx) ctx.stopped = true;
  const db = getDb();
  db.prepare(`UPDATE power_send_jobs SET status='stopped', completed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='running'`).run(jobId, req.user.id);
  res.json({ success: true });
}));

// ─── Get pitch ────────────────────────────────────────────────────────────────
router.get('/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT id FROM leads WHERE id = ? AND user_id = ?').get(req.params.leadId, req.user.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const pitch = parsePitch(db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(req.params.leadId));
  if (!pitch) return res.status(404).json({ success: false, error: 'No pitch found' });
  res.json({ success: true, pitch });
}));

// ─── Update pitch ─────────────────────────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const { cold_email, email_subject, reddit_dm, custom_offer } = req.body;
  const existing = db.prepare('SELECT p.id FROM pitches p JOIN leads l ON l.id = p.lead_id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ success: false, error: 'Pitch not found' });
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
  const pitch = db.prepare('SELECT p.* FROM pitches p JOIN leads l ON l.id = p.lead_id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
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
  const lead = db.prepare('SELECT id FROM leads WHERE id = ? AND user_id = ?').get(req.params.leadId, req.user.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const pitch = db.prepare('SELECT * FROM pitches WHERE lead_id = ?').get(req.params.leadId);
  const suggestion = await claude.suggestReplyResponse(pitch?.cold_email || '', replyText);
  res.json({ success: true, suggestion });
}));

module.exports = router;
