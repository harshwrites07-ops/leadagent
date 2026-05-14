const express = require('express');
const router = express.Router();
const { getDb, logActivity } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { getChannelByUrl } = require('../services/youtubeService');
const {
  analyzeChannelDeep,
  generateAnalyzerEmail,
  generateAnalyzerDM,
  generateAnalyzerSubjects,
} = require('../services/claudeService');

function parseEmail(raw) {
  if (!raw) return { subject: '', body: '' };
  const sepIdx = raw.indexOf('---');
  if (sepIdx === -1) return { subject: '', body: raw.trim() };
  const subjectLine = raw.substring(0, sepIdx).replace(/^SUBJECT:\s*/i, '').trim();
  const body = raw.substring(sepIdx + 3).trim();
  return { subject: subjectLine, body };
}

// POST /api/analyzer/channel
router.post('/channel', asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url || !url.trim()) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  // ── Step 1: Scrape ──────────────────────────────────────────────────────
  let channelData;
  try {
    channelData = await getChannelByUrl(url.trim());
  } catch (e) {
    const reason = e.response?.data?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') {
      return res.status(429).json({ success: false, error: 'Daily YouTube quota reached — resets at midnight PT. Add a new API key from a fresh Google Cloud project.' });
    }
    return res.status(400).json({ success: false, error: e.message });
  }

  // ── Step 2: AI deep study ───────────────────────────────────────────────
  let deepStudy = '';
  let claudeError = null;
  try {
    deepStudy = await analyzeChannelDeep(channelData);
  } catch (e) {
    claudeError = 'Add Claude API key in Settings to generate personalized emails';
    deepStudy = claudeError;
  }

  // ── Step 3: Email ───────────────────────────────────────────────────────
  let emailSubject = '';
  let emailBody = claudeError || '';
  try {
    if (!claudeError) {
      const raw = await generateAnalyzerEmail(channelData, deepStudy);
      const parsed = parseEmail(raw);
      emailSubject = parsed.subject;
      emailBody = parsed.body;
    }
  } catch (e) {
    emailBody = 'Add Claude API key in Settings to generate personalized emails';
  }

  // ── Step 4: Instagram DM ────────────────────────────────────────────────
  let dm = claudeError || '';
  try {
    if (!claudeError) {
      dm = await generateAnalyzerDM(channelData, deepStudy);
    }
  } catch {}

  // ── Step 5: Subject variants ────────────────────────────────────────────
  let subjectVariants = [emailSubject, emailSubject, emailSubject];
  try {
    if (!claudeError && emailSubject) {
      subjectVariants = await generateAnalyzerSubjects(channelData, emailSubject);
    }
  } catch {}

  // ── Step 6: Save to DB ──────────────────────────────────────────────────
  const db = getDb();
  let leadId = null;
  try {
    const existing = channelData.channel_id
      ? db.prepare('SELECT id FROM leads WHERE channel_id = ?').get(channelData.channel_id)
      : null;

    if (existing) {
      leadId = existing.id;
      db.prepare(`
        UPDATE leads SET channel_name=?, channel_handle=?, subscriber_count=?, total_videos=?,
        avg_views=?, avg_likes=?, avg_comments=?, engagement_rate=?, upload_frequency_days=?,
        last_upload_date=?, channel_description=?, recent_videos=?, pain_points=?,
        lead_score=?, temperature=?, thumbnail_url=?, email=?, website=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(
        channelData.channel_name, channelData.channel_handle, channelData.subscriber_count,
        channelData.total_videos, channelData.avg_views, channelData.avg_likes,
        channelData.avg_comments, channelData.engagement_rate, channelData.upload_frequency_days,
        channelData.last_upload_date, channelData.channel_description, channelData.recent_videos,
        channelData.pain_points, channelData.lead_score, channelData.temperature,
        channelData.thumbnail_url, channelData.email, channelData.website, leadId
      );
    } else {
      const r = db.prepare(`
        INSERT INTO leads (
          platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
          avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
          last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
          country, email, website, social_links, pain_points, lead_score, temperature, thumbnail_url
        ) VALUES (
          @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
          @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
          @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
          @country, @email, @website, @social_links, @pain_points, @lead_score, @temperature, @thumbnail_url
        )
      `).run(channelData);
      leadId = r.lastInsertRowid;
    }

    if (!claudeError) {
      db.prepare(`
        INSERT OR REPLACE INTO pitches
          (lead_id, deep_study, cold_email, email_subject, reddit_dm, subject_variants)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(leadId, deepStudy, emailBody, emailSubject, dm, JSON.stringify(subjectVariants));
    }

    logActivity('pitch_generated', `Channel analyzed: ${channelData.channel_name}`, leadId);
  } catch (e) {
    console.error('[Analyzer] DB save error:', e.message);
  }

  // ── Days since last upload (computed, not stored) ───────────────────────
  const daysSinceUpload = channelData.last_upload_date
    ? Math.floor((Date.now() - new Date(channelData.last_upload_date)) / 86400000)
    : null;

  res.json({
    success: true,
    result: {
      lead_id: leadId,
      channel: { ...channelData, days_since_upload: daysSinceUpload },
      deep_study: deepStudy,
      email: { subject: emailSubject, body: emailBody },
      dm,
      subject_variants: subjectVariants,
    },
  });
}));

// POST /api/analyzer/save-to-crm  — just confirms the lead is in CRM
router.post('/save-to-crm', asyncHandler(async (req, res) => {
  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id required' });

  const db = getDb();
  const lead = db.prepare('SELECT id, channel_name, crm_stage FROM leads WHERE id = ?').get(lead_id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

  if (lead.crm_stage === 'new_lead' || lead.crm_stage === null) {
    db.prepare(`UPDATE leads SET crm_stage='new_lead', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead_id);
  }
  logActivity('stage_changed', `${lead.channel_name} saved to CRM from Analyzer`, lead_id, { to: 'new_lead' });

  res.json({ success: true, message: `${lead.channel_name} is in your CRM` });
}));

module.exports = router;
