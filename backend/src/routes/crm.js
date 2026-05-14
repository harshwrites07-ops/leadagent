const express = require('express');
const router = express.Router();
const { getDb, logActivity, getSetting } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');

const CRM_STAGES = ['new_lead', 'studying', 'pitch_ready', 'emailed', 'opened', 'replied', 'call_booked', 'closed_won', 'closed_lost'];

// GET /api/crm — all leads as flat array (frontend groups by crm_stage)
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { search, temperature, platform } = req.query;

  let where = ['1=1'];
  const params = [];

  if (search) { where.push('(l.channel_name LIKE ? OR l.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (temperature) { where.push('l.temperature = ?'); params.push(temperature); }
  if (platform) { where.push('l.platform = ?'); params.push(platform); }

  const leads = db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM emails e WHERE e.lead_id = l.id) as email_count,
      (SELECT MAX(sent_at) FROM emails e WHERE e.lead_id = l.id) as last_email_date
    FROM leads l
    WHERE ${where.join(' AND ')}
    ORDER BY l.lead_score DESC
  `).all(...params);

  res.json({ success: true, leads });
}));

// GET /api/crm/pipeline-value — MUST be before /:leadId
router.get('/pipeline-value', asyncHandler(async (req, res) => {
  const db = getDb();
  const avgDeal = parseInt(getSetting('average_deal_value') || '1000');

  const callBooked = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'call_booked'`).get();
  const closedWon = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won'`).get();
  const replied = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'replied'`).get();

  res.json({
    success: true,
    pipeline: {
      call_booked: callBooked.count,
      closed_won: closedWon.count,
      replied: replied.count,
      pipeline_value: callBooked.count * avgDeal,
      closed_value: closedWon.count * avgDeal,
      avg_deal: avgDeal,
    },
  });
}));

// PUT /api/crm/:leadId/stage
router.put('/:leadId/stage', asyncHandler(async (req, res) => {
  const { stage } = req.body;
  if (!CRM_STAGES.includes(stage)) {
    return res.status(400).json({ success: false, error: `Invalid stage. Valid: ${CRM_STAGES.join(', ')}` });
  }

  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.leadId);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  db.prepare(`UPDATE leads SET crm_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stage, lead.id);
  logActivity('stage_changed', `${lead.channel_name} moved to ${stage.replace(/_/g, ' ')}`, lead.id, { from: lead.crm_stage, to: stage });

  if (stage === 'call_booked') logActivity('call_booked', `Call booked with ${lead.channel_name}`, lead.id);
  if (stage === 'closed_won') logActivity('closed_won', `${lead.channel_name} closed as WON`, lead.id);

  res.json({ success: true, stage });
}));

// POST /api/crm/:leadId/note
router.post('/:leadId/note', asyncHandler(async (req, res) => {
  const content = req.body.content || req.body.note;
  if (!content) return res.status(400).json({ success: false, error: 'content required' });

  const db = getDb();
  const result = db.prepare('INSERT INTO notes (lead_id, content) VALUES (?, ?)').run(req.params.leadId, content);
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
  logActivity('note_added', `Note added`, req.params.leadId);
  res.status(201).json({ success: true, note });
}));

// DELETE /api/crm/:leadId/note/:noteId
router.delete('/:leadId/note/:noteId', asyncHandler(async (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM notes WHERE id = ? AND lead_id = ?').run(req.params.noteId, req.params.leadId);
  res.json({ success: true });
}));

// GET /api/crm/:leadId/history
router.get('/:leadId/history', asyncHandler(async (req, res) => {
  const db = getDb();

  const activities = db.prepare(`
    SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.params.leadId);

  const emails = db.prepare(`
    SELECT * FROM emails WHERE lead_id = ? ORDER BY created_at DESC
  `).all(req.params.leadId);

  const notes = db.prepare(`
    SELECT * FROM notes WHERE lead_id = ? ORDER BY created_at DESC
  `).all(req.params.leadId);

  res.json({ success: true, activities, timeline: activities, emails, notes });
}));

// DELETE /api/crm/bulk — bulk delete leads
router.delete('/bulk', asyncHandler(async (req, res) => {
  const ids = req.body.lead_ids || req.body.ids;
  if (!ids?.length) return res.status(400).json({ success: false, error: 'lead_ids required' });

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids);
  res.json({ success: true, deleted: ids.length });
}));

module.exports = router;
