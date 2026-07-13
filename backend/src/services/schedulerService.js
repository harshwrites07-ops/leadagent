const cron = require('node-cron');
const { getSetting, getDb, logActivity, USE_PG } = require('../models/database');
const { processQueue, checkReplies, checkSpamFolders, getInboxes } = require('./emailService');
const { generateFollowUp } = require('./claudeService');
const { searchChannelsMulti } = require('./youtubeService');
const { queueEmail } = require('./emailQueueService');
const { evaluateEmailQualityV2 } = require('../qualityGate');

let queueInterval = null;
let isProcessing = false;
let isScraping = false;

const TIER1_KEYWORDS = [
  'business coach YouTube', 'entrepreneur channel', 'startup founder vlog', 'agency owner YouTube',
  'consultant YouTube channel', 'online business tips', 'CEO vlog', 'business automation channel',
  'stock trader YouTube', 'investing channel', 'crypto educator YouTube', 'personal finance channel',
  'financial advisor YouTube', 'trading tips channel', 'wealth building YouTube',
  'real estate agent YouTube', 'property investor channel', 'real estate investing tips',
  'realtor YouTube channel', 'real estate educator',
];

const TIER2_KEYWORDS = [
  'online fitness coach', 'personal trainer YouTube', 'gym owner channel', 'nutrition coach YouTube',
  'fitness business channel', 'online coaching YouTube',
  'SaaS founder YouTube', 'software demo channel', 'startup YouTube channel', 'tech founder vlog',
  'immigration lawyer YouTube', 'personal injury attorney channel', 'law firm YouTube',
  'legal education channel', 'lawyer tips YouTube',
];

const TIER3_KEYWORDS = [
  'doctor YouTube channel', 'therapist YouTube', 'nutritionist channel', 'health educator YouTube',
  'course creator YouTube', 'online educator channel', 'digital course YouTube', 'teaching channel',
  'podcast video channel', 'video podcast YouTube', 'podcaster YouTube channel',
  'motivational speaker YouTube', 'life coach channel', 'mindset coach YouTube',
];

const ALL_KEYWORDS = [...TIER1_KEYWORDS, ...TIER2_KEYWORDS, ...TIER3_KEYWORDS];
let keywordIndex = 0;

const LEAD_INSERT_SQL = USE_PG
  ? `INSERT INTO leads
      (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
       avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
       last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
       country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, crm_stage)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new_lead')
    ON CONFLICT DO NOTHING`
  : `INSERT OR IGNORE INTO leads
      (user_id, platform, channel_id, channel_name, channel_handle, subscriber_count, total_videos,
       avg_views, avg_likes, avg_comments, engagement_rate, upload_frequency_days,
       last_upload_date, channel_description, channel_tags, recent_videos, most_viewed_video,
       country, email, website, social_links, thumbnail_url, pain_points, lead_score, temperature, crm_stage)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new_lead')`;

function leadParams(lead, userId) {
  return [
    userId, lead.platform, lead.channel_id, lead.channel_name, lead.channel_handle,
    lead.subscriber_count, lead.total_videos, lead.avg_views, lead.avg_likes, lead.avg_comments,
    lead.engagement_rate, lead.upload_frequency_days, lead.last_upload_date,
    lead.channel_description, lead.channel_tags, lead.recent_videos, lead.most_viewed_video,
    lead.country, lead.email, lead.website, lead.social_links, lead.thumbnail_url,
    lead.pain_points, lead.lead_score, lead.temperature,
  ];
}

function startQueueProcessor() {
  if (queueInterval) return;
  queueInterval = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try { await processQueue(); }
    catch (e) { console.error('Queue processing error:', e.message); }
    finally { isProcessing = false; }
  }, 30000);
  console.log('[Scheduler] Email queue processor started');
}

function stopQueueProcessor() {
  if (queueInterval) { clearInterval(queueInterval); queueInterval = null; }
}

// Reply checker — every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    const result = await checkReplies();
    if (result.repliesFound > 0) console.log(`[Scheduler] Found ${result.repliesFound} replies`);
  } catch (e) { console.error('[Scheduler] Reply check error:', e.message); }
});

// Bounce detector — every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  try {
    const results = await checkSpamFolders();
    const newlyMarked = results.reduce((s, r) => s + (r.newlyMarked || 0), 0);
    if (newlyMarked > 0) console.log(`[Scheduler] Bounce check: marked ${newlyMarked} new invalid leads`);
  } catch (e) { console.error('[Scheduler] Bounce check error:', e.message); }
});

// Follow-up generator — every hour (5-step Day 3/6/9/12/15 system)
cron.schedule('0 * * * *', async () => {
  const autoFollowup = getSetting('auto_followup');
  if (autoFollowup !== 'true') return;
  if (getSetting('queue_paused') === '1') return;

  const db = getDb();

  const perInboxLimit = parseInt(getSetting('daily_send_limit') || '50');
  const allInboxes = getInboxes();
  const totalDailyLimit = perInboxLimit * Math.max(allInboxes.length, 1);

  const todaySql = USE_PG
    ? `SELECT COUNT(*) as c FROM emails WHERE sent_at::date = CURRENT_DATE AND status='sent'`
    : `SELECT COUNT(*) as c FROM emails WHERE DATE(sent_at)=DATE('now') AND status='sent'`;
  const todaySent = await db.get(todaySql);
  if (todaySent.c >= totalDailyLimit) {
    console.log(`[Scheduler] Follow-up skipped: daily limit reached (${todaySent.c}/${totalDailyLimit})`);
    return;
  }

  const recentSql = USE_PG
    ? `SELECT COUNT(*) as total, SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) as bounced FROM emails WHERE sent_at > NOW() + INTERVAL '-7 days'`
    : `SELECT COUNT(*) as total, SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) as bounced FROM emails WHERE sent_at > datetime('now','-7 days')`;
  const recent = await db.get(recentSql);
  if (recent.total > 20 && (recent.bounced / recent.total) * 100 > 5) {
    console.log(`[Scheduler] Follow-up skipped: 7-day bounce rate too high`);
    return;
  }

  const { sendEmail } = require('./emailService');

  const daysSql = USE_PG
    ? `EXTRACT(EPOCH FROM (NOW() - l.last_contacted_date::timestamp)) / 86400 >= 3`
    : `julianday('now') - julianday(l.last_contacted_date) >= 3`;

  const leads = await db.all(`
    SELECT l.*, p.cold_email as original_email, p.generation_method as pitch_generation_method
    FROM leads l
    LEFT JOIN pitches p ON p.lead_id = l.id
    WHERE l.crm_stage = 'emailed'
      AND l.follow_up_status = 'active'
      AND l.follow_up_count < 5
      AND l.last_contacted_date IS NOT NULL
      AND l.email IS NOT NULL AND l.email != ''
      AND (l.email_invalid IS NULL OR l.email_invalid = 0)
      AND ${daysSql}
    ORDER BY l.lead_score DESC
    LIMIT 50
  `);

  if (!leads.length) return;
  console.log(`[Scheduler] Follow-up run: ${leads.length} leads due`);
  let sent = 0;

  for (const lead of leads) {
    try {
      // A needs_human pitch (Marcus generation failed, no fallback template
      // exists per V4) must never be auto-followed-up on by the scheduler —
      // there's nothing real to reference, and it's waiting on a human.
      if (lead.pitch_generation_method === 'needs_human') {
        console.log(`[Scheduler] Skipped needs_human pitch for ${lead.channel_name}`);
        continue;
      }

      const nextStep = (lead.follow_up_count || 0) + 1;

      if (nextStep > 5) {
        await db.run(`UPDATE leads SET crm_stage='no_response', follow_up_status='complete', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
        continue;
      }

      const followUpRaw = await generateFollowUp(lead, lead.original_email || '', nextStep);
      const subjectMatch = followUpRaw.match(/SUBJECT:\s*(.+)/i);
      const bodyMatch = followUpRaw.match(/---\s*([\s\S]+)/);
      if (!subjectMatch || !bodyMatch) { console.warn(`[Scheduler] FU parse failed for lead ${lead.id}`); continue; }
      const subject = subjectMatch[1].trim();
      const body = bodyMatch[1].trim();

      const schedulerUser = await db.get('SELECT * FROM users WHERE id=?', [lead.user_id]);
      if (!schedulerUser) { console.warn(`[Scheduler] Skipped follow-up for lead ${lead.id} — user ${lead.user_id} not found`); continue; }

      // Same Stage 4 gate as every other send path — no scheduler exemption.
      const gateResult = await evaluateEmailQualityV2(subject, body, {});
      const gate = { score: gateResult.score, checksComplete: gateResult.checksComplete, breakdown: gateResult.checks };

      let queued;
      try {
        queued = await queueEmail({ user: schedulerUser, lead, subject, body, gate, priority: nextStep, skipThrottle: true });
      } catch (guardErr) {
        console.log(`[Scheduler] Follow-up blocked for ${lead.channel_name}: ${guardErr.message}`);
        continue;
      }
      await db.run(`UPDATE email_queue SET status='sending' WHERE id=?`, [queued.id]);

      try {
        await sendEmail({ to: lead.email, subject, body, leadId: lead.id, userId: lead.user_id, signalSnapshot: queued.signal_snapshot });
        await db.run(`UPDATE email_queue SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`, [queued.id]);
      } catch (sendErr) {
        await db.run(`UPDATE email_queue SET status='failed' WHERE id=?`, [queued.id]);
        throw sendErr;
      }

      const lastContactedSql = USE_PG
        ? `UPDATE leads SET follow_up_count=?, last_contacted_date=CURRENT_DATE, updated_at=CURRENT_TIMESTAMP WHERE id=?`
        : `UPDATE leads SET follow_up_count=?, last_contacted_date=date('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?`;
      await db.run(lastContactedSql, [nextStep, lead.id]);

      if (nextStep >= 5) {
        await db.run(`UPDATE leads SET follow_up_status='complete', crm_stage='no_response', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [lead.id]);
      }

      logActivity('followup_sent', `Follow-up #${nextStep}/5 sent to ${lead.channel_name}`, lead.id, {}, lead.user_id);
      sent++;
    } catch (e) { console.error(`[Scheduler] Follow-up failed for lead ${lead.id}:`, e.message); }
  }

  if (sent > 0) console.log(`[Scheduler] Follow-ups sent: ${sent}`);
});

// Auto lead scraper — every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  if (isScraping) return;
  isScraping = true;

  try {
    const db = getDb();

    let targetUsers = await db.all(`SELECT id FROM users WHERE auto_find_leads = 1`);

    if (!targetUsers.length) {
      const autoScrape = getSetting('auto_scrape');
      if (autoScrape !== 'true') return;
      targetUsers = [{ id: 1 }];
    }

    const keywords = [0, 1, 2].map(offset => ALL_KEYWORDS[(keywordIndex + offset) % ALL_KEYWORDS.length]);
    keywordIndex = (keywordIndex + 3) % ALL_KEYWORDS.length;

    console.log(`[Scheduler] Auto-scrape for ${targetUsers.length} user(s): ${keywords.map(k => `"${k}"`).join(', ')}`);

    const leads = await searchChannelsMulti(keywords, { minSubs: 5000, maxSubs: 500000, maxResults: 30, emailOnly: false });

    if (!leads.length) { console.log(`[Scheduler] Auto-scrape: 0 leads found for this batch`); return; }

    let totalSaved = 0, totalSkipped = 0;

    for (const targetUser of targetUsers) {
      let saved = 0, skipped = 0;
      for (const lead of leads) {
        try {
          const r = await db.run(LEAD_INSERT_SQL, leadParams(lead, targetUser.id));
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

// Monthly usage reset — 1st of each month at midnight
cron.schedule('0 0 1 * *', async () => {
  try {
    const db = getDb();
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    const nextResetStr = nextReset.toISOString().split('T')[0];
    await db.run(`UPDATE users SET leads_used_this_month=0, emails_used_this_month=0, usage_reset_date=?`, [nextResetStr]);
    console.log(`[Scheduler] Monthly usage reset for all users. Next reset: ${nextResetStr}`);
  } catch (e) { console.error('[Scheduler] Monthly reset error:', e.message); }
});

// Lead resurrection — daily at 9am
cron.schedule('0 9 * * *', async () => {
  try {
    const db = getDb();
    const thirtyDaysAgo = USE_PG ? `NOW() + INTERVAL '-30 days'` : `datetime('now', '-30 days')`;
    const r = await db.run(`
      UPDATE leads
      SET crm_stage='new_lead', follow_up_status='active', follow_up_count=0,
          last_contacted_date=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE crm_stage = 'closed_lost'
        AND updated_at < ${thirtyDaysAgo}
        AND platform = 'youtube'
        AND subscriber_count IS NOT NULL
    `);
    if (r.changes > 0) {
      logActivity('resurrection', `Resurrected ${r.changes} closed leads back to new_lead after 30 days`, null, {}, 1);
      console.log(`[Scheduler] Resurrected ${r.changes} leads`);
    }
  } catch (e) { console.error('[Scheduler] Resurrection error:', e.message); }
});

// Video data backfill — daily at 3am (off-peak), for leads whose recent_videos
// never got fetched. Previously only reachable via a manual admin-route click,
// so the backlog only shrank when a human remembered to trigger it.
cron.schedule('0 3 * * *', async () => {
  try {
    const { runVideoBackfill, getBackfillStatus } = require('./videoBackfillService');
    if (getBackfillStatus().running) return;
    console.log('[Scheduler] Starting nightly video backfill...');
    const result = await runVideoBackfill();
    console.log(`[Scheduler] Video backfill done — ok=${result.ok} fetch_failed=${result.fetchFailed} channel_gone=${result.channelGone} of ${result.total}`);
  } catch (e) { console.error('[Scheduler] Video backfill error:', e.message); }
});

// Quality-lead staleness refresh — weekly, Sunday 4am. quality_leads/master_leads
// never update after first scrape (INSERT OR IGNORE everywhere), so a lead scored
// HOT months ago stays HOT forever even if the channel's gone dormant since. This
// re-fetches a bounded sample of the oldest-scraped rows and re-scores them.
cron.schedule('0 4 * * 0', async () => {
  try {
    const { refreshStaleMasterLeads } = require('./qualityLeadsService');
    console.log('[Scheduler] Starting weekly staleness refresh...');
    const result = await refreshStaleMasterLeads();
    console.log(`[Scheduler] Staleness refresh done — checked=${result.checked} refreshed=${result.refreshed} gone=${result.gone} failed=${result.failed}`);
  } catch (e) { console.error('[Scheduler] Staleness refresh error:', e.message); }
});

// Tiered refresh — hourly (was every 30 min; the tier cadences themselves
// are day-scale (S:24h being the tightest), so halving the poll frequency
// doesn't meaningfully change outcomes but does halve this job's API/DB
// load — a real cost driver on Railway's usage-based billing). Refreshes
// leads on a cadence proportional to tier value (S:24h, A:3d, B:7d, C:14d,
// D:30d) rather than the flat weekly cadence every lead got before
// (Session 1.4). The existing weekly staleness-refresh cron below is kept
// as a broader safety net for rows with no tier computed yet.
cron.schedule('0 * * * *', async () => {
  try {
    const { runTieredRefresh } = require('./qualityLeadsService');
    const result = await runTieredRefresh();
    if (result.refreshed > 0 || result.checked > 0) {
      console.log(`[Scheduler] Tiered refresh — checked=${result.checked} refreshed=${result.refreshed} gone=${result.gone} failed=${result.failed}`);
    }
  } catch (e) { console.error('[Scheduler] Tiered refresh error:', e.message); }
});

// Lead-claim expiry rotation — hourly. A claim past its 48h window frees the
// lead up for the next matched user rather than reserving it forever.
cron.schedule('20 * * * *', async () => {
  try {
    const { expireStaleClaims } = require('./allocationEngine');
    const expired = await expireStaleClaims();
    if (expired > 0) console.log(`[Scheduler] Expired ${expired} stale lead claims`);
  } catch (e) { console.error('[Scheduler] Claim expiry error:', e.message); }
});

// Outcome-learning weekly analysis — Sunday 5am. Proposes weights, never
// applies them — an admin reviews and applies via the analytics routes.
cron.schedule('0 5 * * 0', async () => {
  try {
    const { runOutcomeAnalysis } = require('./outcomeLearning');
    const result = await runOutcomeAnalysis();
    console.log(`[Scheduler] Weight analysis run ${result.run_id} — sample_size=${result.results.total_sample_size}${result.proposed_weights ? ', proposed weights available for review' : ', not enough data for a proposal'}`);
  } catch (e) { console.error('[Scheduler] Weight analysis error:', e.message); }
});

// Graph-walk niche crawler — every 6h (discover) + every 30 min offset
// (drain), both off by default (graph_crawl_enabled admin setting).
cron.schedule('15 */6 * * *', async () => {
  try {
    const { runGraphCrawl } = require('./graphCrawler');
    const result = await runGraphCrawl();
    if (!result.skipped) console.log(`[Scheduler] Graph crawl — ${result.seeds} seeds, ${result.queued} discoveries queued`);
  } catch (e) { console.error('[Scheduler] Graph crawl error:', e.message); }
});

cron.schedule('15,45 * * * *', async () => {
  try {
    const { getSetting } = require('../models/database');
    if (getSetting('graph_crawl_enabled') !== 'true') return;
    const { drainDiscoveryQueue } = require('./graphCrawler');
    const result = await drainDiscoveryQueue();
    if (result.total > 0) console.log(`[Scheduler] Discovery drain — enriched=${result.enriched} rejected=${result.rejected} duplicate=${result.duplicate}`);
  } catch (e) { console.error('[Scheduler] Discovery drain error:', e.message); }
});

// Job-board ingestion — every 2h. Off by default (empty job_board_feed_urls
// setting = nothing scraped, honest no-op) until an admin configures a real,
// public, robots.txt-compliant feed URL.
cron.schedule('0 */2 * * *', async () => {
  try {
    const { scanJobBoards } = require('./jobBoardService');
    const result = await scanJobBoards();
    if (!result.skipped) console.log(`[Scheduler] Job board scan — ${JSON.stringify(result.boards)}`);
  } catch (e) { console.error('[Scheduler] Job board scan error:', e.message); }
});

// Mailbox verification batch — off-peak daily at 2am. Verifies 'unchecked'
// emails in priority order (HOT quality_leads first), budget-capped by the
// admin `daily_verify_limit` setting (default 500/day). No-op cost when no
// MILLIONVERIFIER_API_KEY is set — falls back to the free mx-only driver.
cron.schedule('0 2 * * *', async () => {
  try {
    const { runEmailVerificationBatch } = require('./emailVerifier');
    console.log('[Scheduler] Starting nightly email verification batch...');
    await runEmailVerificationBatch();
  } catch (e) { console.error('[Scheduler] Email verification batch error:', e.message); }
});

// HOT alert digest — daily 9am. At most one email per user per day, only if
// they have >=1 new matched S-tier lead since their last digest (honest
// empty behavior — no email when there's nothing new). Respects
// users.hot_alert_digest_enabled opt-out.
cron.schedule('0 9 * * *', async () => {
  try {
    const db = getDb();
    const { sendEmail } = require('./emailService');

    const pending = await db.all(`
      SELECT han.id as notification_id, han.user_id, u.email as user_email,
             ha.channel_name, ha.matched_niche, ha.creator_id
      FROM hot_alert_notifications han
      JOIN users u ON u.id = han.user_id
      JOIN hot_alerts ha ON ha.id = han.hot_alert_id
      WHERE han.digested_at IS NULL AND u.hot_alert_digest_enabled = 1 AND u.email IS NOT NULL
      ORDER BY han.user_id, han.created_at DESC
    `);
    if (!pending.length) return;

    const byUser = {};
    for (const row of pending) {
      if (!byUser[row.user_id]) byUser[row.user_id] = { email: row.user_email, leads: [] };
      byUser[row.user_id].leads.push(row);
    }

    let sent = 0;
    for (const [userId, data] of Object.entries(byUser)) {
      const lines = data.leads.slice(0, 20).map(l => `- ${l.channel_name}${l.matched_niche ? ` (${l.matched_niche})` : ''}`).join('\n');
      const body = `${data.leads.length} new HOT lead${data.leads.length !== 1 ? 's' : ''} matched your niche since your last update:\n\n${lines}\n\nLog in to Quelro to view and pitch them.`;
      try {
        await sendEmail({ to: data.email, subject: `${data.leads.length} new HOT lead${data.leads.length !== 1 ? 's' : ''} for you`, body, leadId: null, userId: Number(userId) });
        sent++;
      } catch (e) { console.warn(`[Scheduler] HOT digest send failed for user ${userId}:`, e.message); }
      const ids = data.leads.map(l => l.notification_id);
      await db.run(`UPDATE hot_alert_notifications SET digested_at = CURRENT_TIMESTAMP WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
    console.log(`[Scheduler] HOT alert digest sent to ${sent}/${Object.keys(byUser).length} users`);
  } catch (e) { console.error('[Scheduler] HOT alert digest error:', e.message); }
});

// Scraper health check — hourly. Scrapers can silently start returning
// nothing (dead selectors, revoked tokens, IP blocks) with zero operator
// visibility — see AUDIT_REPORT.md §1.3 / roadmap Session 0.5. Alerts once
// per degraded scraper rather than spamming a new row every hour it stays down.
cron.schedule('5 * * * *', async () => {
  try {
    const { getScraperHealthSummary } = require('./scraperHealth');
    const db = getDb();
    const summary = await getScraperHealthSummary(24);
    for (const s of summary) {
      if (!s.degraded) continue;
      const existing = await db.get(
        `SELECT id FROM scraper_health_alerts WHERE scraper=? AND resolved=0 ORDER BY detected_at DESC LIMIT 1`,
        [s.scraper]
      );
      if (existing) continue; // already alerted and not yet resolved
      console.log(`[ScraperHealth] ALERT — ${s.scraper} success rate ${s.success_rate}% over last 24h (${s.attempted} attempted)`);
      await db.run(
        `INSERT INTO scraper_health_alerts (scraper, success_rate, attempted) VALUES (?, ?, ?)`,
        [s.scraper, s.success_rate, s.attempted]
      );
    }
    // Auto-resolve: a scraper that's no longer degraded clears its open alert.
    const degradedNow = new Set(summary.filter(s => s.degraded).map(s => s.scraper));
    const openAlerts = await db.all('SELECT DISTINCT scraper FROM scraper_health_alerts WHERE resolved=0');
    for (const row of openAlerts) {
      if (!degradedNow.has(row.scraper)) {
        await db.run('UPDATE scraper_health_alerts SET resolved=1 WHERE scraper=? AND resolved=0', [row.scraper]);
      }
    }
  } catch (e) { console.error('[Scheduler] Scraper health check error:', e.message); }
});

module.exports = { startQueueProcessor, stopQueueProcessor };
