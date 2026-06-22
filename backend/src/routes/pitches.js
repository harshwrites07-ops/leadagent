const express = require('express');
const router = express.Router();
const { getDb, logActivity, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { aiLimiter } = require('../middleware/rateLimiter');
const claude = require('../services/claudeService');

function parsePitch(pitch) {
  if (!pitch) return null;
  return {
    ...pitch,
    subject_variants: (() => { try { return JSON.parse(pitch.subject_variants || '[]'); } catch { return []; } })(),
  };
}

async function savePitch(db, leadId, userId, { email_subject, email_body, deep_study, custom_offer, subject_variants, pitch_score, pitch_feedback, reddit_dm }) {
  const existing = await db.get('SELECT id FROM pitches WHERE lead_id = ?', [leadId]);
  if (existing) {
    await db.run(`
      UPDATE pitches SET deep_study=COALESCE(?,deep_study), custom_offer=COALESCE(?,custom_offer),
        cold_email=?, email_subject=?, reddit_dm=COALESCE(?,reddit_dm),
        subject_variants=?, pitch_score=COALESCE(?,pitch_score), pitch_feedback=COALESCE(?,pitch_feedback),
        updated_at=CURRENT_TIMESTAMP
      WHERE lead_id=?
    `, [deep_study || null, custom_offer || null, email_body, email_subject,
        reddit_dm || null, JSON.stringify(subject_variants || []),
        pitch_score || null, pitch_feedback || null, leadId]);
  } else {
    await db.run(`
      INSERT INTO pitches (lead_id,user_id,deep_study,custom_offer,cold_email,email_subject,reddit_dm,subject_variants,pitch_score,pitch_feedback)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [leadId, userId, deep_study || null, custom_offer || null, email_body, email_subject,
        reddit_dm || null, JSON.stringify(subject_variants || []),
        pitch_score || null, pitch_feedback || null]);
  }
}

router.post('/generate/:leadId', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  await db.run(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
  logActivity('pitch_generating', `Generating pitch for ${lead.channel_name}`, lead.id, {}, req.user.id);

  let result;
  try {
    result = await claude.generateFullPitch(lead);
  } catch (e) {
    console.error('[Pitch] AI failed for', lead.channel_name, ':', e.message);
    return res.status(502).json({ success: false, error: `AI unavailable: ${e.message?.substring(0, 100)}` });
  }

  let redditDm = null;
  if (lead.platform === 'reddit' || lead.reddit_username) {
    try { redditDm = await claude.generateRedditDM(lead, result.key_insight); } catch {}
  }

  await savePitch(db, lead.id, req.user.id, {
    email_subject: result.email_subject, email_body: result.email_body,
    deep_study: result.key_insight, custom_offer: result.custom_offer,
    subject_variants: result.subject_variants, reddit_dm: redditDm,
  });

  await db.run(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
  logActivity('pitch_generated', `Pitch generated for ${lead.channel_name}`, lead.id, {}, req.user.id);

  const pitch = parsePitch(await db.get('SELECT * FROM pitches WHERE lead_id = ?', [lead.id]));
  res.json({ success: true, pitch, warning: result.name_warning || null });
}));

router.get('/by-lead/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const pitch = parsePitch(await db.get('SELECT * FROM pitches WHERE lead_id = ?', [req.params.leadId]));
  if (!pitch) return res.status(404).json({ success: false, error: 'No pitch found for this lead' });
  res.json({ success: true, pitch });
}));

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
        const lead = await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!lead) return { id, success: false, error: 'Not found' };
        await db.run(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]);
        const result = await claude.generateFullPitch(lead);
        await savePitch(db, id, req.user.id, { email_subject: result.email_subject, email_body: result.email_body, deep_study: result.key_insight, custom_offer: result.custom_offer, subject_variants: result.subject_variants });
        await db.run(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]);
        return { id, success: true };
      })
    );
    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : { id: batch[batchResults.indexOf(r)], success: false, error: r.reason?.message });
    }
  }
  res.json({ success: true, results });
}));

router.post('/generate-and-send', aiLimiter, asyncHandler(async (req, res) => {
  const leadIds = req.body.lead_ids || req.body.leadIds;
  if (!leadIds?.length) return res.status(400).json({ success: false, error: 'lead_ids required' });
  const db = getDb();
  const { sendEmail } = require('../services/emailService');
  const { incrementUsage } = require('../services/authService');
  const ids = leadIds.slice(0, 20);
  const results = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async id => {
        const lead = await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!lead) return { id, success: false, error: 'Not found' };
        if (!lead.email) return { id, success: false, error: 'No email', channel_name: lead.channel_name };

        await db.run(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]);
        const result = await claude.generateFullPitch(lead);
        await savePitch(db, id, req.user.id, { email_subject: result.email_subject, email_body: result.email_body, deep_study: result.key_insight, custom_offer: result.custom_offer, subject_variants: result.subject_variants });

        const qr = await db.run(`INSERT INTO email_queue (user_id,lead_id,subject,body,status) VALUES (?,?,?,?,'pending') ${USE_PG ? 'RETURNING id' : ''}`, [req.user.id, id, result.email_subject, result.email_body]);
        await db.run(`UPDATE email_queue SET status='sending' WHERE id=?`, [qr.lastID]);

        const sent = await sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: id, userId: req.user.id });
        await db.run(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP,email_id=? WHERE id=?`, [sent.emailId || null, qr.lastID]);
        await db.run(`UPDATE leads SET crm_stage='emailed', last_contacted_date=CURRENT_DATE, follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]);
        await incrementUsage(req.user.id, 'emails', 1);
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
        try { await db.run(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id]); } catch {}
      }
    }
  }
  const sent = results.filter(r => r.success).length;
  res.json({ success: true, results, sent, total: results.length });
}));

// ─── Power Send ───────────────────────────────────────────────────────────────
const activeJobs = new Map();

async function jobLog(db, jobId, type, message) {
  try {
    const row = await db.get('SELECT log FROM power_send_jobs WHERE id=?', [jobId]);
    if (!row) return;
    const log = JSON.parse(row.log || '[]');
    log.unshift({ type, message, time: new Date().toISOString() });
    if (log.length > 80) log.length = 80;
    await db.run('UPDATE power_send_jobs SET log=? WHERE id=?', [JSON.stringify(log), jobId]);
  } catch {}
}

async function jobUpdate(db, jobId, fields) {
  try {
    const keys = Object.keys(fields);
    const sets = keys.map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE power_send_jobs SET ${sets} WHERE id=?`, [...Object.values(fields), jobId]);
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
        if (isNetworkError(e) && i < retries - 1) { await jobLog(db, jobId, 'waiting', `Network error, retrying in 30s...`); await sleep(30000); }
        else throw e;
      }
    }
  };

  const runCounts = {};
  const getSkipInboxes = () => {
    const limitSkips = per_account_limit > 0
      ? Object.entries(runCounts).filter(([, c]) => c >= per_account_limit).map(([e]) => e) : [];
    return [...new Set([...skip_inboxes, ...limitSkips])];
  };

  try {
    let leads;
    if (lead_ids && lead_ids.length > 0) {
      const rows = await Promise.all(lead_ids.slice(0, max_leads).map(id => db.get('SELECT * FROM leads WHERE id=? AND user_id=?', [id, _userId])));
      leads = rows.filter(Boolean).filter(l => l.email);
    } else {
      leads = await db.all(`
        SELECT * FROM leads
        WHERE email IS NOT NULL AND email != ''
          AND (email_invalid IS NULL OR email_invalid = 0)
          AND temperature = 'hot'
          AND crm_stage NOT IN ('emailed','opened','replied','call_booked','closed_won','closed_lost')
          AND user_id=?
        ORDER BY subscriber_count DESC LIMIT ?
      `, [_userId, max_leads]);

      if (leads.length < max_leads) {
        const needed = max_leads - leads.length;
        const hotIds = leads.map(l => l.id);
        const placeholder = hotIds.length ? `AND id NOT IN (${hotIds.map(() => '?').join(',')})` : '';
        const warm = await db.all(`
          SELECT * FROM leads
          WHERE email IS NOT NULL AND email != ''
            AND (email_invalid IS NULL OR email_invalid = 0)
            AND temperature = 'warm'
            AND crm_stage NOT IN ('emailed','opened','replied','call_booked','closed_won','closed_lost')
            ${placeholder}
            AND user_id=?
          ORDER BY subscriber_count DESC LIMIT ?
        `, [...hotIds, _userId, needed]);
        leads.push(...warm);
      }
    }

    if (per_account_limit > 0) {
      const maxTotal = per_account_limit * (getInboxes().length || 1);
      if (leads.length > maxTotal) leads = leads.slice(0, maxTotal);
    }

    await jobUpdate(db, jobId, { total: leads.length });
    await jobLog(db, jobId, 'start', `Job started — ${leads.length} leads queued`);

    const stats = { studied: 0, generated: 0, sent: 0, failed: 0 };
    const CONCURRENCY = gap_seconds > 0 ? 1 : 3;

    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      if (ctx.stopped) break;
      if (per_account_limit > 0 && getSkipInboxes().length >= getInboxes().length) {
        await jobLog(db, jobId, 'info', 'Per-account limit reached — job complete');
        break;
      }
      const batch = leads.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(async lead => {
        if (ctx.stopped) return;
        try {
          await jobLog(db, jobId, 'studying', `Studying ${lead.channel_name}...`);
          await db.run(`UPDATE leads SET crm_stage='studying', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
          const result = await withRetry(() => withTimeout(claude.generateFullPitch(lead), 90000, lead.channel_name), lead.channel_name);
          stats.studied++; stats.generated++;
          await jobUpdate(db, jobId, { studied: stats.studied, generated: stats.generated });
          await jobLog(db, jobId, 'generated', `Pitch ready for ${lead.channel_name}`);
          await savePitch(db, lead.id, _userId, { email_subject: result.email_subject, email_body: result.email_body, deep_study: result.key_insight, custom_offer: result.custom_offer, subject_variants: result.subject_variants });
          const sentResult = await withRetry(() => sendEmail({ to: lead.email, subject: result.email_subject, body: result.email_body, leadId: lead.id, skipInboxes: getSkipInboxes(), userId: _userId }), lead.channel_name);
          if (sentResult.fromEmail) runCounts[sentResult.fromEmail] = (runCounts[sentResult.fromEmail] || 0) + 1;
          await db.run(`UPDATE leads SET crm_stage='emailed', last_contacted_date=CURRENT_DATE, follow_up_count=0, follow_up_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
          logActivity('email_sent', `Email sent to ${lead.channel_name}`, lead.id, {}, _userId);
          stats.sent++;
          await jobUpdate(db, jobId, { sent: stats.sent });
          await jobLog(db, jobId, 'sent', `Sent to ${lead.channel_name} (${lead.email})`);
          if (gap_seconds > 0 && !ctx.stopped) { await jobLog(db, jobId, 'waiting', `Waiting ${gap_seconds}s before next email...`); await sleep(gap_seconds * 1000); }
        } catch (err) {
          stats.failed++;
          await jobUpdate(db, jobId, { failed: stats.failed });
          await jobLog(db, jobId, 'failed', `Failed: ${lead.channel_name} — ${err.message?.substring(0, 100)}`);
          try { await db.run(`UPDATE leads SET crm_stage='pitch_ready', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]); } catch {}
        }
      }));
    }

    const finalStatus = ctx.stopped ? 'stopped' : 'done';
    await jobUpdate(db, jobId, { status: finalStatus, completed_at: new Date().toISOString() });
    await jobLog(db, jobId, 'done', `Complete! ${stats.sent} sent, ${stats.failed} failed out of ${leads.length}.`);
    logActivity('powermode', `Power Send done: ${stats.sent} emails sent`, null, {}, _userId);
  } catch (err) {
    await jobUpdate(db, jobId, { status: 'error', completed_at: new Date().toISOString() });
    await jobLog(db, jobId, 'failed', `Job crashed: ${err.message}`);
  } finally {
    activeJobs.delete(jobId);
  }
}

router.post('/power-send', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const existing = await db.get(`SELECT id FROM power_send_jobs WHERE status='running' AND user_id=? LIMIT 1`, [req.user.id]);
  if (existing) return res.json({ success: true, job_id: existing.id, status: 'already_running' });

  const settings = { ...req.body, _userId: req.user.id };
  const r = await db.run(`INSERT INTO power_send_jobs (user_id, status, settings) VALUES (?, 'running', ?) ${USE_PG ? 'RETURNING id' : ''}`, [req.user.id, JSON.stringify(req.body)]);
  const jobId = Number(r.lastID);
  activeJobs.set(jobId, { stopped: false });
  runPowerSendJob(jobId, settings).catch(() => {});
  res.json({ success: true, job_id: jobId, status: 'started' });
}));

router.get('/power-send/active', asyncHandler(async (req, res) => {
  const db = getDb();
  const activeCheck = USE_PG
    ? `(status = 'running' OR (status = 'interrupted' AND started_at > NOW() + INTERVAL '-30 minutes'))`
    : `(status = 'running' OR (status = 'interrupted' AND started_at > datetime('now', '-30 minutes')))`;
  const job = await db.get(`SELECT * FROM power_send_jobs WHERE user_id = ? AND ${activeCheck} ORDER BY id DESC LIMIT 1`, [req.user.id]);
  res.json({ success: true, job: job || null });
}));

router.post('/power-send/:jobId/dismiss', asyncHandler(async (req, res) => {
  const db = getDb();
  await db.run(`UPDATE power_send_jobs SET status='done', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=? AND status='interrupted'`, [req.params.jobId, req.user.id]);
  res.json({ success: true });
}));

router.get('/power-send/:jobId', asyncHandler(async (req, res) => {
  const db = getDb();
  const job = await db.get(`SELECT * FROM power_send_jobs WHERE id=? AND user_id=?`, [req.params.jobId, req.user.id]);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, job });
}));

router.post('/power-send/:jobId/stop', asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.jobId);
  const ctx = activeJobs.get(jobId);
  if (ctx) ctx.stopped = true;
  const db = getDb();
  await db.run(`UPDATE power_send_jobs SET status='stopped', completed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='running'`, [jobId, req.user.id]);
  res.json({ success: true });
}));

router.get('/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const pitch = parsePitch(await db.get('SELECT * FROM pitches WHERE lead_id = ?', [req.params.leadId]));
  if (!pitch) return res.status(404).json({ success: false, error: 'No pitch found' });
  res.json({ success: true, pitch });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const { cold_email, email_subject, reddit_dm, custom_offer } = req.body;
  const existing = await db.get('SELECT p.id FROM pitches p JOIN leads l ON l.id = p.lead_id WHERE p.id = ? AND l.user_id = ?', [req.params.id, req.user.id]);
  if (!existing) return res.status(404).json({ success: false, error: 'Pitch not found' });
  await db.run(`
    UPDATE pitches SET cold_email=COALESCE(?,cold_email), email_subject=COALESCE(?,email_subject),
    reddit_dm=COALESCE(?,reddit_dm), custom_offer=COALESCE(?,custom_offer), updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, [cold_email || null, email_subject || null, reddit_dm || null, custom_offer || null, req.params.id]);
  const pitch = parsePitch(await db.get('SELECT * FROM pitches WHERE id = ?', [req.params.id]));
  res.json({ success: true, pitch });
}));

router.post('/:id/rescore', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const pitch = await db.get('SELECT p.* FROM pitches p JOIN leads l ON l.id = p.lead_id WHERE p.id = ? AND l.user_id = ?', [req.params.id, req.user.id]);
  if (!pitch) return res.status(404).json({ success: false, error: 'Pitch not found' });
  const emailBody = req.body.body || pitch.cold_email;
  const scoreResult = await claude.scorePitch(emailBody);
  await db.run(`UPDATE pitches SET pitch_score=?,pitch_feedback=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [scoreResult.score, scoreResult.feedback, pitch.id]);
  res.json({ success: true, pitch_score: scoreResult.score, pitch_feedback: scoreResult.feedback });
}));

router.post('/suggest-reply/:leadId', aiLimiter, asyncHandler(async (req, res) => {
  const db = getDb();
  const { replyText } = req.body;
  if (!replyText) return res.status(400).json({ success: false, error: 'replyText required' });
  const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const pitch = await db.get('SELECT * FROM pitches WHERE lead_id = ?', [req.params.leadId]);
  const suggestion = await claude.suggestReplyResponse(pitch?.cold_email || '', replyText);
  res.json({ success: true, suggestion });
}));

module.exports = router;
