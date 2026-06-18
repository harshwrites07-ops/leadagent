const express = require('express');
const router  = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler }       = require('../middleware/errorHandler');
const { calculateIntentScore, scoreAndRankLeads, classifyLeads, assessAlgorithmAccuracy } = require('../services/intentService');
const { analyzePsychology, generateEmailAngles, scoreEmail } = require('../services/psychologyService');

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJSON(val, fallback) {
  try { return JSON.parse(val || (typeof fallback === 'string' ? fallback : JSON.stringify(fallback))); }
  catch { return fallback; }
}

function campaignWithStats(c) {
  const replyRate = c.emails_sent > 0 ? Math.round((c.emails_replied / c.emails_sent) * 100) : 0;
  const openRate  = c.emails_sent > 0 ? Math.round((c.emails_opened / c.emails_sent) * 100) : 0;
  return { ...c, reply_rate: replyRate, open_rate: openRate };
}

// ── GET /api/campaigns — list all campaigns for user ─────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaigns = db.prepare(
    `SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC`
  ).all(req.user.id);
  res.json({ success: true, campaigns: campaigns.map(campaignWithStats) });
}));

// ── POST /api/campaigns — create campaign ─────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const { name, niche, service_type, credentials, ab_test_enabled, ab_variant_a, ab_variant_b } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO campaigns (user_id, name, niche, service_type, credentials, ab_test_enabled, ab_variant_a, ab_variant_b, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(
    req.user.id, name.trim(),
    niche || null, service_type || null, credentials || null,
    ab_test_enabled ? 1 : 0,
    ab_variant_a || 'Problem Angle',
    ab_variant_b || 'Story Angle',
  );

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid);
  logActivity('campaign_created', `Campaign "${name}" created`, null, {}, req.user.id);
  res.json({ success: true, campaign: campaignWithStats(campaign) });
}));

// ── GET /api/campaigns/:id — campaign detail with leads ───────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const leads = db.prepare(`
    SELECT cl.*, l.channel_name, l.channel_handle, l.subscriber_count, l.avg_views,
           l.engagement_rate, l.email, l.niche, l.thumbnail_url, l.last_upload_date,
           l.upload_frequency_days, l.total_videos, l.channel_description
    FROM campaign_leads cl
    JOIN leads l ON l.id = cl.lead_id
    WHERE cl.campaign_id = ?
    ORDER BY cl.intent_rank ASC NULLS LAST, cl.intent_score DESC
  `).all(req.params.id);

  const enrichedLeads = leads.map(l => ({
    ...l,
    intent_signals:   parseJSON(l.intent_signals, {}),
    psychology_profile: parseJSON(l.psychology_profile, {}),
    angles:           parseJSON(l.angles, []),
  }));

  res.json({ success: true, campaign: campaignWithStats(campaign), leads: enrichedLeads });
}));

// ── DELETE /api/campaigns/:id ─────────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

// ── POST /api/campaigns/:id/add-leads — add existing leads to campaign ────────
// Body: { lead_ids: [1,2,3,...] } OR { niche, limit, min_subs }
router.post('/:id/add-leads', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  let leads = [];

  if (req.body.lead_ids?.length) {
    // Specific lead IDs
    const placeholders = req.body.lead_ids.map(() => '?').join(',');
    leads = db.prepare(`SELECT * FROM leads WHERE id IN (${placeholders}) AND user_id = ?`)
      .all(...req.body.lead_ids, req.user.id);
  } else {
    // Auto-select by niche + filters
    const { niche, limit = 200, min_subs = 5000, max_subs = 5000000, exclude_inactive = true } = req.body;
    let where  = ['user_id = ?', 'subscriber_count >= ?', 'subscriber_count <= ?'];
    const params = [req.user.id, min_subs, max_subs];

    if (niche) {
      where.push(`(niche LIKE ? OR channel_description LIKE ? OR channel_name LIKE ?)`);
      params.push(`%${niche}%`, `%${niche}%`, `%${niche}%`);
    }
    if (exclude_inactive) {
      where.push(`(last_upload_date IS NULL OR last_upload_date > date('now', '-180 days'))`);
    }

    leads = db.prepare(`SELECT * FROM leads WHERE ${where.join(' AND ')} LIMIT ?`).all(...params, limit);
  }

  if (!leads.length) return res.json({ success: true, added: 0, message: 'No leads matched the criteria' });

  // Score intent for all leads
  const ranked = scoreAndRankLeads(leads);
  const { hot, warm, cold } = classifyLeads(ranked);

  // Insert into campaign_leads (ignore duplicates)
  const insert = db.prepare(`
    INSERT OR IGNORE INTO campaign_leads
      (campaign_id, lead_id, intent_score, intent_signals, intent_rank, intent_reason, intent_confidence, temperature, ab_variant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let added = 0;
  db.transaction(() => {
    for (const lead of ranked) {
      // A/B split: alternate between variants
      const abVariant = campaign.ab_test_enabled
        ? (added % 2 === 0 ? campaign.ab_variant_a : campaign.ab_variant_b)
        : null;

      const res_ = insert.run(
        campaign.id, lead.id,
        lead.intent_score,
        JSON.stringify(lead.signals || {}),
        lead.intent_rank,
        lead.reason,
        lead.confidence,
        lead.temperature,
        abVariant,
      );
      if (res_.changes > 0) added++;
    }

    // Update campaign counters
    const avgScore = ranked.length ? ranked.reduce((s, l) => s + l.intent_score, 0) / ranked.length : 0;
    db.prepare(`
      UPDATE campaigns SET
        total_leads = (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = ?),
        hot_leads = ?, warm_leads = ?, cold_leads = ?,
        avg_intent_score = ?, status = 'analyzing', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(campaign.id, hot.length, warm.length, cold.length, Math.round(avgScore * 100) / 100, campaign.id);
  })();

  logActivity('campaign_leads_added', `${added} leads added to "${campaign.name}"`, null, {}, req.user.id);

  const updated = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id);
  res.json({ success: true, added, hot: hot.length, warm: warm.length, cold: cold.length, campaign: campaignWithStats(updated) });
}));

// ── POST /api/campaigns/:id/psychology/:leadId — analyze psychology for a lead ─
router.post('/:id/psychology/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const cl = db.prepare('SELECT * FROM campaign_leads WHERE campaign_id = ? AND lead_id = ?')
    .get(req.params.id, req.params.leadId);
  if (!cl) return res.status(404).json({ success: false, error: 'Lead not in campaign' });

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.leadId);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  const profile = await analyzePsychology(lead);

  db.prepare('UPDATE campaign_leads SET psychology_profile = ? WHERE campaign_id = ? AND lead_id = ?')
    .run(JSON.stringify(profile), req.params.id, req.params.leadId);

  res.json({ success: true, psychology_profile: profile });
}));

// ── POST /api/campaigns/:id/angles/:leadId — generate 3 email angles ──────────
router.post('/:id/angles/:leadId', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const cl = db.prepare('SELECT * FROM campaign_leads WHERE campaign_id = ? AND lead_id = ?')
    .get(req.params.id, req.params.leadId);
  if (!cl) return res.status(404).json({ success: false, error: 'Lead not in campaign' });

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.leadId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const psychProfile = parseJSON(cl.psychology_profile, {});
  const service = campaign.service_type || user?.service_type || 'video editing';
  const credentials = campaign.credentials || user?.best_result || '';

  const angles = await generateEmailAngles(lead, psychProfile, service, credentials);

  // Pick the angle matching the campaign's A/B assignment (or default to Problem Angle)
  const assigned = cl.ab_variant || 'Problem Angle';
  const primary  = angles.find(a => a.angle_name === assigned) || angles[0];
  const quality  = scoreEmail(primary?.subject || '', primary?.full_email || '');

  db.prepare(`
    UPDATE campaign_leads SET
      angles = ?, selected_angle = ?,
      email_subject = ?, email_body = ?, email_quality_score = ?
    WHERE campaign_id = ? AND lead_id = ?
  `).run(
    JSON.stringify(angles), assigned,
    primary?.subject || '', primary?.full_email || '', quality,
    req.params.id, req.params.leadId,
  );

  res.json({ success: true, angles, selected_angle: assigned, email_quality_score: quality });
}));

// ── POST /api/campaigns/:id/select-angle/:leadId — user picks an angle ────────
router.post('/:id/select-angle/:leadId', asyncHandler(async (req, res) => {
  const { angle_name, email_subject, email_body } = req.body;
  if (!angle_name) return res.status(400).json({ success: false, error: 'angle_name required' });

  const db = getDb();
  const quality = scoreEmail(email_subject || '', email_body || '');

  db.prepare(`
    UPDATE campaign_leads SET
      selected_angle = ?,
      email_subject_edited = ?,
      email_body_edited = ?,
      email_quality_score = ?
    WHERE campaign_id = ? AND lead_id = ?
  `).run(angle_name, email_subject || null, email_body || null, quality, req.params.id, req.params.leadId);

  res.json({ success: true, email_quality_score: quality });
}));

// ── POST /api/campaigns/:id/bulk-analyze — psychology + angles for top N leads ─
// Runs psychology + angle generation for the top `limit` leads in the campaign
router.post('/:id/bulk-analyze', asyncHandler(async (req, res) => {
  const { limit = 20 } = req.body;
  const db = getDb();

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const topLeads = db.prepare(`
    SELECT cl.lead_id, l.*
    FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id
    WHERE cl.campaign_id = ?
    ORDER BY cl.intent_score DESC LIMIT ?
  `).all(req.params.id, limit);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const service = campaign.service_type || user?.service_type || 'video editing';
  const creds   = campaign.credentials  || user?.best_result  || '';

  let done = 0;
  for (const lead of topLeads) {
    try {
      const profile = await analyzePsychology(lead);
      const angles  = await generateEmailAngles(lead, profile, service, creds);
      const cl      = db.prepare('SELECT ab_variant FROM campaign_leads WHERE campaign_id = ? AND lead_id = ?')
        .get(req.params.id, lead.lead_id || lead.id);
      const assigned = cl?.ab_variant || 'Problem Angle';
      const primary  = angles.find(a => a.angle_name === assigned) || angles[0];
      const quality  = scoreEmail(primary?.subject || '', primary?.full_email || '');

      db.prepare(`
        UPDATE campaign_leads SET
          psychology_profile = ?, angles = ?, selected_angle = ?,
          email_subject = ?, email_body = ?, email_quality_score = ?
        WHERE campaign_id = ? AND lead_id = ?
      `).run(
        JSON.stringify(profile), JSON.stringify(angles), assigned,
        primary?.subject || '', primary?.full_email || '', quality,
        req.params.id, lead.lead_id || lead.id,
      );
      done++;
    } catch (e) {
      console.warn(`[Campaign] bulk-analyze failed for lead ${lead.id}:`, e.message);
    }
  }

  db.prepare(`UPDATE campaigns SET status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ success: true, analyzed: done, total: topLeads.length });
}));

// ── POST /api/campaigns/:id/track — log email events ─────────────────────────
router.post('/:id/track', asyncHandler(async (req, res) => {
  const { lead_id, event, call_booked, client_closed, client_value, reply_sentiment } = req.body;
  const db = getDb();

  if (call_booked !== undefined || client_closed !== undefined) {
    const update = [];
    const params = [];
    if (call_booked  !== undefined) { update.push('call_booked = ?');   params.push(call_booked  ? 1 : 0); }
    if (client_closed !== undefined) { update.push('client_closed = ?'); params.push(client_closed ? 1 : 0); }
    if (client_value  !== undefined) { update.push('client_value = ?');  params.push(client_value); }
    if (reply_sentiment) { update.push('reply_sentiment = ?'); params.push(reply_sentiment); }
    if (update.length) {
      // Update on the email linked to this campaign lead
      const emailId = db.prepare('SELECT email_id FROM campaign_leads WHERE campaign_id = ? AND lead_id = ?')
        .get(req.params.id, lead_id)?.email_id;
      if (emailId) {
        db.prepare(`UPDATE emails SET ${update.join(', ')} WHERE id = ?`).run(...params, emailId);
      }
    }
  }

  // Refresh campaign counters
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT cl.lead_id) as total_leads,
      SUM(CASE WHEN e.status IN ('sent','opened','replied') THEN 1 ELSE 0 END) as emails_sent,
      SUM(CASE WHEN e.opened_at IS NOT NULL THEN 1 ELSE 0 END) as emails_opened,
      SUM(CASE WHEN e.replied_at IS NOT NULL THEN 1 ELSE 0 END) as emails_replied,
      SUM(CASE WHEN e.call_booked = 1 THEN 1 ELSE 0 END) as calls_booked,
      SUM(CASE WHEN e.client_closed = 1 THEN 1 ELSE 0 END) as clients_closed
    FROM campaign_leads cl
    LEFT JOIN emails e ON e.id = cl.email_id
    WHERE cl.campaign_id = ?
  `).get(req.params.id);

  if (stats) {
    db.prepare(`
      UPDATE campaigns SET
        emails_sent = ?, emails_opened = ?, emails_replied = ?,
        calls_booked = ?, clients_closed = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      stats.emails_sent || 0, stats.emails_opened || 0, stats.emails_replied || 0,
      stats.calls_booked || 0, stats.clients_closed || 0,
      req.params.id,
    );
  }

  res.json({ success: true });
}));

// ── GET /api/campaigns/:id/accuracy — algorithm accuracy check ────────────────
router.get('/:id/accuracy', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const data = db.prepare(`
    SELECT cl.intent_score, e.replied_at IS NOT NULL as replied
    FROM campaign_leads cl
    LEFT JOIN emails e ON e.id = cl.email_id
    WHERE cl.campaign_id = ?
  `).all(req.params.id);

  const accuracy = assessAlgorithmAccuracy(data);
  res.json({ success: true, accuracy, campaign: campaignWithStats(campaign) });
}));

// ── GET /api/campaigns/:id/ab-results — A/B test results ─────────────────────
router.get('/:id/ab-results', asyncHandler(async (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

  if (!campaign.ab_test_enabled) {
    return res.json({ success: true, ab_enabled: false });
  }

  const results = db.prepare(`
    SELECT cl.ab_variant,
      COUNT(*) as total,
      SUM(CASE WHEN e.opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN e.replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied
    FROM campaign_leads cl
    LEFT JOIN emails e ON e.id = cl.email_id
    WHERE cl.campaign_id = ? AND cl.ab_variant IS NOT NULL
    GROUP BY cl.ab_variant
  `).all(req.params.id);

  const formatted = results.map(r => ({
    variant: r.ab_variant,
    total:   r.total,
    opened:  r.opened,
    replied: r.replied,
    open_rate:  r.total > 0 ? Math.round((r.opened / r.total) * 100) : 0,
    reply_rate: r.total > 0 ? Math.round((r.replied / r.total) * 100) : 0,
  }));

  const winner = formatted.length === 2
    ? (formatted[0].reply_rate >= formatted[1].reply_rate ? formatted[0].variant : formatted[1].variant)
    : null;

  res.json({ success: true, ab_enabled: true, results: formatted, winner });
}));

// ── GET /api/campaigns/stats/overview — aggregate stats for dashboard ─────────
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total_campaigns,
      SUM(emails_sent) as total_sent,
      SUM(emails_replied) as total_replied,
      SUM(calls_booked) as total_calls,
      SUM(clients_closed) as total_clients,
      AVG(avg_intent_score) as avg_intent
    FROM campaigns WHERE user_id = ?
  `).get(req.user.id);

  res.json({
    success: true,
    stats: {
      total_campaigns: row.total_campaigns || 0,
      total_sent:      row.total_sent      || 0,
      total_replied:   row.total_replied   || 0,
      total_calls:     row.total_calls     || 0,
      total_clients:   row.total_clients   || 0,
      avg_intent:      row.avg_intent ? Math.round(row.avg_intent * 100) / 100 : 0,
      reply_rate:      row.total_sent > 0 ? Math.round((row.total_replied / row.total_sent) * 100) : 0,
    },
  });
}));

module.exports = router;
