const cron = require('node-cron');
const { getSetting, getDb, logActivity } = require('../models/database');
const { processQueue, checkReplies, checkSpamFolders, getInboxes } = require('./emailService');
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
    (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
     avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
     last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
     country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, crm_stage)
  VALUES
    (@user_id, @platform, @channel_id, @channel_name, @channel_handle, @subscriber_count, @total_videos,
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

// ── Bounce detector — every 30 minutes ───────────────────────────────────────

cron.schedule('*/30 * * * *', async () => {
  try {
    const results = await checkSpamFolders();
    const newlyMarked = results.reduce((s, r) => s + (r.newlyMarked || 0), 0);
    if (newlyMarked > 0) {
      console.log(`[Scheduler] Bounce check: marked ${newlyMarked} new invalid leads`);
    }
  } catch (e) {
    console.error('[Scheduler] Bounce check error:', e.message);
  }
});

// ── Follow-up generator — every hour (5-step Day 3/6/9/12/15 system) ─────────

cron.schedule('0 * * * *', async () => {
  const autoFollowup = getSetting('auto_followup');
  if (autoFollowup !== 'true') return;
  if (getSetting('queue_paused') === '1') return;

  const db = getDb();

  // Respect the same daily send limit as processQueue
  const perInboxLimit = parseInt(getSetting('daily_send_limit') || '50');
  const allInboxes = getInboxes();
  const totalDailyLimit = perInboxLimit * Math.max(allInboxes.length, 1);
  const todaySent = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') AND status='sent'`).get();
  if (todaySent.c >= totalDailyLimit) {
    console.log(`[Scheduler] Follow-up skipped: daily limit reached (${todaySent.c}/${totalDailyLimit})`);
    return;
  }

  // Stop if 7-day bounce rate is too high
  const recent = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) as bounced FROM emails WHERE sent_at > datetime('now','-7 days')`).get();
  if (recent.total > 20 && (recent.bounced / recent.total) * 100 > 5) {
    console.log(`[Scheduler] Follow-up skipped: 7-day bounce rate too high`);
    return;
  }

  const { sendEmail } = require('./emailService');

  // Leads that are emailed, have last_contacted_date, follow_up_count < 5, and 3+ days have passed
  // CRITICAL: skip email_invalid leads — they bounce and damage domain reputation
  const leads = db.prepare(`
    SELECT l.*, p.cold_email as original_email
    FROM leads l
    LEFT JOIN pitches p ON p.lead_id = l.id
    WHERE l.crm_stage = 'emailed'
      AND l.follow_up_status = 'active'
      AND l.follow_up_count < 5
      AND l.last_contacted_date IS NOT NULL
      AND l.email IS NOT NULL AND l.email != ''
      AND (l.email_invalid IS NULL OR l.email_invalid = 0)
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

      const qr = db.prepare(`INSERT INTO email_queue (user_id,lead_id,subject,body,status,priority) VALUES (?,?,?,?,'sending',?)`).run(lead.user_id, lead.id, subject, body, nextStep);

      try {
        await sendEmail({ to: lead.email, subject, body, leadId: lead.id, userId: lead.user_id });
        db.prepare(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(qr.lastInsertRowid);
      } catch (sendErr) {
        db.prepare(`UPDATE email_queue SET status='failed' WHERE id=?`).run(qr.lastInsertRowid);
        throw sendErr;
      }

      db.prepare(`UPDATE leads SET follow_up_count=?, last_contacted_date=date('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nextStep, lead.id);

      if (nextStep >= 5) {
        db.prepare(`UPDATE leads SET follow_up_status='complete', crm_stage='no_response', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(lead.id);
      }

      logActivity('followup_sent', `Follow-up #${nextStep}/5 sent to ${lead.channel_name}`, lead.id, {}, lead.user_id);
      sent++;
    } catch (e) {
      console.error(`[Scheduler] Follow-up failed for lead ${lead.id}:`, e.message);
    }
  }

  if (sent > 0) console.log(`[Scheduler] Follow-ups sent: ${sent}`);
});

// ── Auto lead scraper — every 15 minutes ──────────────────────────────────────
// Searches 3 keywords IN PARALLEL per run. Target: 500+ leads/day.
// Runs for every user with auto_find_leads=1 (or falls back to global setting → admin).

cron.schedule('*/15 * * * *', async () => {
  if (isScraping) return;
  isScraping = true;

  try {
    const db = getDb();

    // Find all users with auto-scrape enabled (per-user flag)
    let targetUsers = db.prepare(`SELECT id FROM users WHERE auto_find_leads = 1`).all();

    // Fallback: global admin setting → assign to admin user (id=1)
    if (!targetUsers.length) {
      const autoScrape = getSetting('auto_scrape');
      if (autoScrape !== 'true') return;
      targetUsers = [{ id: 1 }];
    }

    // Pick 3 consecutive keywords from the pool
    const keywords = [0, 1, 2].map(offset => ALL_KEYWORDS[(keywordIndex + offset) % ALL_KEYWORDS.length]);
    keywordIndex = (keywordIndex + 3) % ALL_KEYWORDS.length;

    console.log(`[Scheduler] Auto-scrape for ${targetUsers.length} user(s): ${keywords.map(k => `"${k}"`).join(', ')}`);

    const leads = await searchChannelsMulti(keywords, {
      minSubs: 5000,
      maxSubs: 500000,
      maxResults: 30,
      emailOnly: false,
    });

    if (!leads.length) {
      console.log(`[Scheduler] Auto-scrape: 0 leads found for this batch`);
      return;
    }

    const insert = db.prepare(LEAD_INSERT_SQL);
    let totalSaved = 0, totalSkipped = 0;

    for (const targetUser of targetUsers) {
      let saved = 0, skipped = 0;
      for (const lead of leads) {
        try {
          const r = insert.run({ ...lead, user_id: targetUser.id });
          if (r.changes > 0) saved++; else skipped++;
        } catch { skipped++; }
      }
      totalSaved += saved;
      totalSkipped += skipped;
      if (saved > 0) {
        logActivity('auto_scrape', `Auto-scrape: +${saved} leads, ${skipped} duplicates skipped from [${keywords[0]}, ...]`, null, {}, targetUser.id);
      }
    }

    if (totalSaved > 0 || totalSkipped > 0) {
      console.log(`[Scheduler] Auto-scrape done: +${totalSaved} leads, ${totalSkipped} duplicates skipped across ${targetUsers.length} user(s)`);
    }
  } catch (e) {
    console.error(`[Scheduler] Auto-scrape error:`, e.message);
  } finally {
    isScraping = false;
  }
});

// ── Monthly usage reset — 1st of each month at midnight ─────────────────────

cron.schedule('0 0 1 * *', () => {
  try {
    const db = getDb();
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    const nextResetStr = nextReset.toISOString().split('T')[0];
    db.prepare(`UPDATE users SET leads_used_this_month=0, emails_used_this_month=0, usage_reset_date=?`).run(nextResetStr);
    console.log(`[Scheduler] Monthly usage reset for all users. Next reset: ${nextResetStr}`);
  } catch (e) {
    console.error('[Scheduler] Monthly reset error:', e.message);
  }
});

// ── Lead resurrection — daily at 9am ─────────────────────────────────────────

cron.schedule('0 9 * * *', () => {
  try {
    const db = getDb();
    const resurrected = db.prepare(`
      UPDATE leads
      SET crm_stage='new_lead', follow_up_status='active', follow_up_count=0,
          last_contacted_date=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE crm_stage = 'closed_lost'
        AND updated_at < datetime('now', '-30 days')
        AND platform = 'youtube'
        AND subscriber_count IS NOT NULL
    `).run();

    if (resurrected.changes > 0) {
      logActivity('resurrection', `Resurrected ${resurrected.changes} closed leads back to new_lead after 30 days`, null, {}, 1);
      console.log(`[Scheduler] Resurrection: moved ${resurrected.changes} closed leads back to new_lead`);
    }
  } catch (e) {
    console.error('[Scheduler] Resurrection error:', e.message);
  }
});

module.exports = { startQueueProcessor, stopQueueProcessor };
