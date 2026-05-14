const cron = require('node-cron');
const { getSetting, getDb, logActivity } = require('../models/database');
const { processQueue, checkReplies } = require('./emailService');
const { generateFollowUp } = require('./claudeService');
const { searchChannelsMulti } = require('./youtubeService');

let queueInterval = null;
let isProcessing = false;
let isScraping = false;

// ── Keyword pools by tier (3 searched in parallel per run) ────────────────────
// Tier 1: Highest ticket, easiest to close
const TIER1_KEYWORDS = [
  'business coach YouTube', 'entrepreneur channel', 'startup founder vlog', 'agency owner YouTube',
  'consultant YouTube channel', 'online business tips', 'CEO vlog', 'business automation channel',
  'stock trader YouTube', 'investing channel', 'crypto educator YouTube', 'personal finance channel',
  'financial advisor YouTube', 'trading tips channel', 'wealth building YouTube',
  'real estate agent YouTube', 'property investor channel', 'real estate investing tips',
  'realtor YouTube channel', 'real estate educator',
];

// Tier 2: Good money, high volume
const TIER2_KEYWORDS = [
  'online fitness coach', 'personal trainer YouTube', 'gym owner channel', 'nutrition coach YouTube',
  'fitness business channel', 'online coaching YouTube',
  'SaaS founder YouTube', 'software demo channel', 'startup YouTube channel', 'tech founder vlog',
  'immigration lawyer YouTube', 'personal injury attorney channel', 'law firm YouTube',
  'legal education channel', 'lawyer tips YouTube',
];

// Tier 3: Good volume, medium ticket
const TIER3_KEYWORDS = [
  'doctor YouTube channel', 'therapist YouTube', 'nutritionist channel', 'health educator YouTube',
  'course creator YouTube', 'online educator channel', 'digital course YouTube', 'teaching channel',
  'podcast video channel', 'video podcast YouTube', 'podcaster YouTube channel',
  'motivational speaker YouTube', 'life coach channel', 'mindset coach YouTube',
];

const ALL_KEYWORDS = [...TIER1_KEYWORDS, ...TIER2_KEYWORDS, ...TIER3_KEYWORDS];
let keywordIndex = 0;

const LEAD_INSERT_SQL = `
  INSERT OR IGNORE INTO leads
    (platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
     avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
     last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
     country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, crm_stage)
  VALUES
    (@platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
     @avg_views, @avg_likes, @avg_comments, @engagement_rate, @upload_frequency_days,
     @last_upload_date, @channel_description, @channel_tags, @recent_videos, @most_viewed_video,
     @country, @email, @website, @social_links, @thumbnail_url, @pain_points, @lead_score, @temperature, 'new_lead')
`;

// ── Email queue processor ──────────────────────────────────────────────────────

function startQueueProcessor() {
  if (queueInterval) return;
  queueInterval = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await processQueue();
    } catch (e) {
      console.error('Queue processing error:', e.message);
    } finally {
      isProcessing = false;
    }
  }, 30000);
  console.log('[Scheduler] Email queue processor started');
}

function stopQueueProcessor() {
  if (queueInterval) { clearInterval(queueInterval); queueInterval = null; }
}

// ── Reply checker — every 15 minutes ─────────────────────────────────────────

cron.schedule('*/15 * * * *', async () => {
  try {
    const result = await checkReplies();
    if (result.repliesFound > 0) {
      console.log(`[Scheduler] Found ${result.repliesFound} replies`);
    }
  } catch (e) {
    console.error('[Scheduler] Reply check error:', e.message);
  }
});

// ── Follow-up generator — every hour (5-step Day 3/6/9/12/15 system) ─────────

cron.schedule('0 * * * *', async () => {
  const autoFollowup = getSetting('auto_followup');
  if (autoFollowup !== 'true') return;

  const db = getDb();
  const { sendEmail } = require('./emailService');

  // Leads that are emailed, have last_contacted_date, follow_up_count < 5, and 3+ days have passed
  const leads = db.prepare(`
    SELECT l.*, p.cold_email as original_email
    FROM leads l
    LEFT JOIN pitches p ON p.lead_id = l.id
    WHERE l.crm_stage = 'emailed'
      AND l.follow_up_status = 'active'
      AND l.follow_up_count < 5
      AND l.last_contacted_date IS NOT NULL
      AND l.email IS NOT NULL AND l.email != ''
      AND julianday('now') - julianday(l.last_contacted_date) >= 3
    ORDER BY l.lead_score DESC
    LIMIT 50
  `).all();

  if (!leads.length) return;

  console.log(`[Scheduler] Follow-up run: ${leads.length} leads due`);
  let sent = 0;

  for (const lead of leads) {
    try {
      const nextStep = (lead.follow_up_count || 0) + 1;

      if (nextStep > 5) {
        db.prepare(`UPDATE leads SET crm_stage='no_response', follow_up_status='complete', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
        continue;
      }

      const followUpRaw = await generateFollowUp(lead, lead.original_email || '', nextStep);
      const subjectMatch = followUpRaw.match(/SUBJECT:\s*(.+)/i);
      const bodyMatch = followUpRaw.match(/---\s*([\s\S]+)/);
      if (!subjectMatch || !bodyMatch) {
        console.warn(`[Scheduler] FU parse failed for lead ${lead.id}`);
        continue;
      }
      const subject = subjectMatch[1].trim();
      const body = bodyMatch[1].trim();

      const qr = db.prepare(`INSERT INTO email_queue (lead_id,subject,body,status,priority) VALUES (?,?,?,'pending',?)`).run(lead.id, subject, body, nextStep);
      db.prepare(`UPDATE email_queue SET status='sending' WHERE id=?`).run(qr.lastInsertRowid);

      await sendEmail({ to: lead.email, subject, body, leadId: lead.id });

      db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(qr.lastInsertRowid);
      db.prepare(`UPDATE leads SET follow_up_count=?, last_contacted_date=date('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nextStep, lead.id);

      if (nextStep >= 5) {
        db.prepare(`UPDATE leads SET follow_up_status='complete', crm_stage='no_response', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      }

      logActivity('followup_sent', `Follow-up #${nextStep}/5 sent to ${lead.channel_name}`, lead.id);
      sent++;
    } catch (e) {
      console.error(`[Scheduler] Follow-up failed for lead ${lead.id}:`, e.message);
    }
  }

  if (sent > 0) console.log(`[Scheduler] Follow-ups sent: ${sent}`);
});

// ── Auto lead scraper — every 15 minutes ──────────────────────────────────────
// Searches 3 keywords IN PARALLEL per run. Target: 500+ leads/day.
// Requires auto_scrape=true in Settings.

cron.schedule('*/15 * * * *', async () => {
  const autoScrape = getSetting('auto_scrape');
  if (autoScrape !== 'true') return;
  if (isScraping) return;
  isScraping = true;

  // Pick 3 consecutive keywords from the pool
  const keywords = [0, 1, 2].map(offset => ALL_KEYWORDS[(keywordIndex + offset) % ALL_KEYWORDS.length]);
  keywordIndex = (keywordIndex + 3) % ALL_KEYWORDS.length;

  try {
    console.log(`[Scheduler] Auto-scrape: ${keywords.map(k => `"${k}"`).join(', ')}`);

    const leads = await searchChannelsMulti(keywords, {
      minSubs: 5000,
      maxSubs: 500000,
      maxResults: 30,
      emailOnly: true,
    });

    if (!leads.length) {
      console.log(`[Scheduler] Auto-scrape: 0 leads found for this batch`);
      return;
    }

    const db = getDb();
    const insert = db.prepare(LEAD_INSERT_SQL);
    let saved = 0;
    let skipped = 0;
    for (const lead of leads) {
      try {
        const r = insert.run(lead);
        if (r.changes > 0) saved++; else skipped++;
      } catch { skipped++; }
    }

    if (saved > 0 || skipped > 0) {
      logActivity('auto_scrape', `Auto-scrape: +${saved} leads, ${skipped} duplicates skipped from [${keywords[0]}, ...]`, null);
      console.log(`[Scheduler] Auto-scrape done: +${saved} leads, ${skipped} duplicates skipped`);
    }
  } catch (e) {
    console.error(`[Scheduler] Auto-scrape error:`, e.message);
  } finally {
    isScraping = false;
  }
});

// ── Lead resurrection — daily at 9am ─────────────────────────────────────────

cron.schedule('0 9 * * *', async () => {
  const db = getDb();
  const oldLeads = db.prepare(`
    SELECT * FROM leads
    WHERE crm_stage = 'closed_lost'
    AND updated_at < datetime('now', '-30 days')
  `).all();

  for (const lead of oldLeads) {
    if (lead.platform === 'youtube' && lead.subscriber_count) {
      logActivity('resurrection_check', `Lead ${lead.channel_name} flagged for re-review (30 days since close)`, lead.id);
    }
  }

  if (oldLeads.length > 0) {
    console.log(`[Scheduler] Resurrection: flagged ${oldLeads.length} closed leads for re-review`);
  }
});

module.exports = { startQueueProcessor, stopQueueProcessor };
