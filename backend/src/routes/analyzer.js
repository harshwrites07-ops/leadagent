const express = require('express');
const router = express.Router();
const { getDb, logActivity, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { getChannelByUrl } = require('../services/youtubeService');
const { analyzeChannelDeep, generateAnalyzerEmail, generateAnalyzerDM, generateAnalyzerSubjects } = require('../services/claudeService');

function parseEmail(raw) {
  if (!raw) return { subject: '', body: '' };
  const sepIdx = raw.indexOf('---');
  if (sepIdx === -1) return { subject: '', body: raw.trim() };
  return { subject: raw.substring(0, sepIdx).replace(/^SUBJECT:\s*/i, '').trim(), body: raw.substring(sepIdx + 3).trim() };
}

router.post('/channel', asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url || !url.trim()) return res.status(400).json({ success: false, error: 'url is required' });

  let channelData;
  try { channelData = await getChannelByUrl(url.trim()); }
  catch (e) {
    const reason = e.response?.data?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') return res.status(429).json({ success: false, error: 'Daily YouTube quota reached — resets at midnight PT. Add a new API key from a fresh Google Cloud project.' });
    return res.status(400).json({ success: false, error: e.message });
  }

  let deepStudy = '', claudeError = null;
  try { deepStudy = await analyzeChannelDeep(channelData); }
  catch { claudeError = 'Add Claude API key in Settings to generate personalized emails'; deepStudy = claudeError; }

  let emailSubject = '', emailBody = claudeError || '';
  try { if (!claudeError) { const raw = await generateAnalyzerEmail(channelData, deepStudy); const parsed = parseEmail(raw); emailSubject = parsed.subject; emailBody = parsed.body; } }
  catch { emailBody = 'Add Claude API key in Settings to generate personalized emails'; }

  let dm = claudeError || '';
  try { if (!claudeError) dm = await generateAnalyzerDM(channelData, deepStudy); } catch {}

  let subjectVariants = [emailSubject, emailSubject, emailSubject];
  try { if (!claudeError && emailSubject) subjectVariants = await generateAnalyzerSubjects(channelData, emailSubject); } catch {}

  const db = getDb();
  const userId = req.user.id;
  let leadId = null;
  try {
    const existing = channelData.channel_id
      ? await db.get('SELECT id FROM leads WHERE channel_id = ? AND user_id = ?', [channelData.channel_id, userId])
      : null;

    if (existing) {
      leadId = existing.id;
      await db.run(`UPDATE leads SET channel_name=?, channel_handle=?, subscriber_count=?, total_videos=?, avg_views=?, avg_likes=?, avg_comments=?, engagement_rate=?, upload_frequency_days=?, last_upload_date=?, channel_description=?, recent_videos=?, pain_points=?, lead_score=?, temperature=?, thumbnail_url=?, email=?, website=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`,
        [channelData.channel_name, channelData.channel_handle, channelData.subscriber_count, channelData.total_videos, channelData.avg_views, channelData.avg_likes, channelData.avg_comments, channelData.engagement_rate, channelData.upload_frequency_days, channelData.last_upload_date, channelData.channel_description, channelData.recent_videos, channelData.pain_points, channelData.lead_score, channelData.temperature, channelData.thumbnail_url, channelData.email, channelData.website, leadId, userId]);
    } else {
      const insertSql = USE_PG
        ? `INSERT INTO leads (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos, avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days, last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video, country, email, website, social_links, pain_points, lead_score, temperature, thumbnail_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`
        : `INSERT INTO leads (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos, avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days, last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video, country, email, website, social_links, pain_points, lead_score, temperature, thumbnail_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      const r = await db.run(insertSql, [userId, channelData.platform, channelData.channel_id, channelData.channel_name, channelData.channel_handle, channelData.subscriber_count, channelData.total_videos, channelData.avg_views, channelData.avg_likes, channelData.avg_comments, channelData.engagement_rate, channelData.upload_frequency_days, channelData.last_upload_date, channelData.channel_description, channelData.channel_tags, channelData.recent_videos, channelData.most_viewed_video, channelData.country, channelData.email, channelData.website, channelData.social_links, channelData.pain_points, channelData.lead_score, channelData.temperature, channelData.thumbnail_url]);
      leadId = r.lastID;
    }

    if (!claudeError) {
      await db.run(`INSERT OR REPLACE INTO pitches (lead_id, user_id, deep_study, cold_email, email_subject, reddit_dm, subject_variants) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [leadId, userId, deepStudy, emailBody, emailSubject, dm, JSON.stringify(subjectVariants)]);
    }

    logActivity('pitch_generated', `Channel analyzed: ${channelData.channel_name}`, leadId, {}, userId);
  } catch (e) { console.error('[Analyzer] DB save error:', e.message); }

  const daysSinceUpload = channelData.last_upload_date ? Math.floor((Date.now() - new Date(channelData.last_upload_date)) / 86400000) : null;

  res.json({ success: true, result: { lead_id: leadId, channel: { ...channelData, days_since_upload: daysSinceUpload }, deep_study: deepStudy, email: { subject: emailSubject, body: emailBody }, dm, subject_variants: subjectVariants } });
}));

router.post('/save-to-crm', asyncHandler(async (req, res) => {
  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id required' });
  const db = getDb();
  const lead = await db.get('SELECT id, channel_name, crm_stage FROM leads WHERE id = ? AND user_id = ?', [lead_id, req.user.id]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (lead.crm_stage === 'new_lead' || lead.crm_stage === null) {
    await db.run(`UPDATE leads SET crm_stage='new_lead', updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`, [lead_id, req.user.id]);
  }
  logActivity('stage_changed', `${lead.channel_name} saved to CRM from Analyzer`, lead_id, { to: 'new_lead' }, req.user.id);
  res.json({ success: true, message: `${lead.channel_name} is in your CRM` });
}));

module.exports = router;
