const express = require('express');
const router = express.Router();
const { getDb, logActivity, getSetting, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');

const CRM_STAGES = ['new_lead', 'studying', 'pitch_ready', 'emailed', 'opened', 'replied', 'call_booked', 'closed_won', 'closed_lost'];

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { search, temperature, platform, page = 1, limit = 50 } = req.query;
  const pageNum  = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  let where = ['l.user_id = ?'];
  const params = [req.user.id];
  if (search)      { where.push('(l.channel_name LIKE ? OR l.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (temperature) { where.push('l.temperature = ?'); params.push(temperature); }
  if (platform)    { where.push('l.platform = ?'); params.push(platform); }

  const totalRow = await db.get(`SELECT COUNT(*) as n FROM leads l WHERE ${where.join(' AND ')}`, params);
  const total = totalRow.n;

  const leads = await db.all(`
    SELECT l.*,
      (SELECT COUNT(*) FROM emails e WHERE e.lead_id = l.id) as email_count,
      (SELECT MAX(sent_at) FROM emails e WHERE e.lead_id = l.id) as last_email_date
    FROM leads l
    WHERE ${where.join(' AND ')}
    ORDER BY l.lead_score DESC
    LIMIT ? OFFSET ?
  `, [...params, limitNum, offset]);

  res.json({ success: true, leads, total, page: pageNum, limit: limitNum, hasMore: offset + leads.length < total });
}));

router.get('/pipeline-value', asyncHandler(async (req, res) => {
  const db = getDb();
  const avgDeal  = parseInt(getSetting('average_deal_value') || '1000');
  const uid = req.user.id;
  const callBooked = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'call_booked' AND user_id = ?`, [uid]);
  const closedWon  = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won' AND user_id = ?`, [uid]);
  const replied    = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'replied' AND user_id = ?`, [uid]);
  res.json({
    success: true,
    pipeline: {
      call_booked: callBooked.count, closed_won: closedWon.count, replied: replied.count,
      pipeline_value: callBooked.count * avgDeal, closed_value: closedWon.count * avgDeal, avg_deal: avgDeal,
    },
  });
}));

router.put('/:leadId/stage', asyncHandler(async (req, res) => {
  const { stage } = req.body;
  if (!CRM_STAGES.includes(stage)) return res.status(400).json({ success: false, error: `Invalid stage. Valid: ${CRM_STAGES.join(', ')}` });
  const db = getDb();
  const lead = await db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  await db.run(`UPDATE leads SET crm_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [stage, lead.id]);
  logActivity('stage_changed', `${lead.channel_name} moved to ${stage.replace(/_/g, ' ')}`, lead.id, { from: lead.crm_stage, to: stage }, req.user.id);
  if (stage === 'call_booked') logActivity('call_booked', `Call booked with ${lead.channel_name}`, lead.id, {}, req.user.id);
  if (stage === 'closed_won')  logActivity('closed_won',  `${lead.channel_name} closed as WON`,    lead.id, {}, req.user.id);
  res.json({ success: true, stage });
}));

router.post('/:leadId/note', asyncHandler(async (req, res) => {
  const content = req.body.content || req.body.note;
  if (!content) return res.status(400).json({ success: false, error: 'content required' });
  const db = getDb();
  const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const r = await db.run(`INSERT INTO notes (lead_id, content) VALUES (?, ?) ${USE_PG ? 'RETURNING id' : ''}`, [req.params.leadId, content]);
  const note = await db.get('SELECT * FROM notes WHERE id = ?', [r.lastID]);
  logActivity('note_added', `Note added`, req.params.leadId, {}, req.user.id);
  res.status(201).json({ success: true, note });
}));

router.delete('/:leadId/note/:noteId', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  await db.run('DELETE FROM notes WHERE id = ? AND lead_id = ?', [req.params.noteId, req.params.leadId]);
  res.json({ success: true });
}));

router.get('/:leadId/history', asyncHandler(async (req, res) => {
  const db = getDb();
  const lead = await db.get('SELECT id FROM leads WHERE id = ? AND user_id = ?', [req.params.leadId, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const activities = await db.all(`SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 50`, [req.params.leadId]);
  const emails = await db.all(`SELECT * FROM emails WHERE lead_id = ? ORDER BY created_at DESC`, [req.params.leadId]);
  const notes  = await db.all(`SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC`, [req.params.leadId]);
  res.json({ success: true, activities, timeline: activities, emails, notes });
}));

router.delete('/bulk', asyncHandler(async (req, res) => {
  const ids = req.body.lead_ids || req.body.ids;
  if (!ids?.length) return res.status(400).json({ success: false, error: 'lead_ids required' });
  const placeholders = ids.map(() => '?').join(',');
  await getDb().run(`DELETE FROM leads WHERE id IN (${placeholders}) AND user_id = ?`, [...ids, req.user.id]);
  res.json({ success: true, deleted: ids.length });
}));

module.exports = router;
