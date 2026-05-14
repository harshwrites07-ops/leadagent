const express = require('express');
const router = express.Router();
const { getDb, getSetting } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/analytics/dashboard
router.get('/dashboard', asyncHandler(async (req, res) => {
  const db = getDb();

  const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  const leadsToday = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE DATE(created_at) = DATE('now')`).get();
  const emailsToday = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE DATE(sent_at) = DATE('now')`).get();
  const emailsMonth = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE strftime('%Y-%m', sent_at) = strftime('%Y-%m','now')`).get();

  const totalSent = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE sent_at IS NOT NULL`).get();
  const totalOpens = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE opened_at IS NOT NULL`).get();
  const totalReplies = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE replied_at IS NOT NULL`).get();
  const totalClosedWon = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won'`).get();
  const callBooked = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'call_booked'`).get();

  const avgDeal = parseInt(getSetting('average_deal_value') || '1000');

  // Weekly chart data (last 14 days)
  const weeklyLeads = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM leads
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `).all();

  const weeklyEmails = db.prepare(`
    SELECT DATE(sent_at) as day, COUNT(*) as count
    FROM emails
    WHERE sent_at >= datetime('now', '-14 days')
    GROUP BY DATE(sent_at)
    ORDER BY day ASC
  `).all();

  const weeklyReplies = db.prepare(`
    SELECT DATE(replied_at) as day, COUNT(*) as count
    FROM emails
    WHERE replied_at >= datetime('now', '-14 days')
    GROUP BY DATE(replied_at)
    ORDER BY day ASC
  `).all();

  // Stage distribution as object {stage: count}
  const stageRows = db.prepare(`SELECT crm_stage, COUNT(*) as count FROM leads GROUP BY crm_stage`).all();
  const stageDistribution = {};
  stageRows.forEach(r => { stageDistribution[r.crm_stage] = r.count; });

  res.json({
    success: true,
    stats: {
      total_leads: totalLeads.count,
      leads_today: leadsToday.count,
      emails_today: emailsToday.count,
      emails_month: emailsMonth.count,
      reply_rate: totalSent.count > 0 ? parseFloat(((totalReplies.count / totalSent.count) * 100).toFixed(1)) : 0,
      open_rate: totalSent.count > 0 ? parseFloat(((totalOpens.count / totalSent.count) * 100).toFixed(1)) : 0,
      conversion_rate: totalSent.count > 0 ? parseFloat(((totalClosedWon.count / totalSent.count) * 100).toFixed(1)) : 0,
      pipeline_value: callBooked.count * avgDeal,
      call_booked: callBooked.count,
    },
    charts: {
      weekly_leads: weeklyLeads,
      weekly_emails: weeklyEmails,
      weekly_replies: weeklyReplies,
    },
    stage_distribution: stageDistribution,
  });
}));

// GET /api/analytics/email
router.get('/email', asyncHandler(async (req, res) => {
  const db = getDb();

  const dailySends = db.prepare(`
    SELECT DATE(sent_at) as date, COUNT(*) as sent,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied
    FROM emails
    WHERE sent_at >= datetime('now', '-30 days')
    GROUP BY DATE(sent_at)
    ORDER BY date ASC
  `).all();

  // Compute rate trend from daily sends
  const rateTrend = dailySends.map(d => ({
    date: d.date,
    open_rate: d.sent > 0 ? parseFloat((d.opened / d.sent * 100).toFixed(1)) : 0,
    reply_rate: d.sent > 0 ? parseFloat((d.replied / d.sent * 100).toFixed(1)) : 0,
  }));

  const bestSubjects = db.prepare(`
    SELECT subject,
      COUNT(*) as sent,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      ROUND(SUM(CASE WHEN opened_at IS NOT NULL THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as open_rate
    FROM emails
    WHERE sent_at IS NOT NULL
    GROUP BY subject
    HAVING sent >= 3
    ORDER BY open_rate DESC
    LIMIT 10
  `).all();

  const bestTimes = db.prepare(`
    SELECT strftime('%H', sent_at) as hour,
      COUNT(*) as sent,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replies,
      ROUND(SUM(CASE WHEN opened_at IS NOT NULL THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as open_rate
    FROM emails
    WHERE sent_at IS NOT NULL
    GROUP BY hour
    ORDER BY open_rate DESC
  `).all();

  res.json({ success: true, daily_sends: dailySends, rate_trend: rateTrend, best_subjects: bestSubjects, best_times: bestTimes });
}));

// GET /api/analytics/pipeline
router.get('/pipeline', asyncHandler(async (req, res) => {
  const db = getDb();
  const avgDeal = parseInt(getSetting('average_deal_value') || '1000');

  // Use 'stage' alias so frontend funnel loop can use stage.stage
  const funnelData = db.prepare(`
    SELECT crm_stage as stage, COUNT(*) as count FROM leads GROUP BY crm_stage ORDER BY count DESC
  `).all();

  const callBooked = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'call_booked'`).get();
  const closedWon = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won'`).get();

  const closedWonMonth = db.prepare(`
    SELECT COUNT(*) as count FROM leads
    WHERE crm_stage = 'closed_won' AND strftime('%Y-%m', updated_at) = strftime('%Y-%m','now')
  `).get();

  const avgDaysToClose = db.prepare(`
    SELECT AVG(julianday(updated_at) - julianday(created_at)) as avg_days
    FROM leads WHERE crm_stage = 'closed_won'
  `).get();

  const totalContacted = db.prepare(`
    SELECT COUNT(*) as count FROM leads WHERE crm_stage NOT IN ('new_lead', 'studying', 'pitch_ready')
  `).get();

  const platformStats = db.prepare(`
    SELECT platform,
      COUNT(*) as total,
      SUM(CASE WHEN crm_stage = 'replied' OR crm_stage IN ('call_booked','closed_won') THEN 1 ELSE 0 END) as responded,
      SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) as closed
    FROM leads
    GROUP BY platform
  `).all();

  const nicheStats = db.prepare(`
    SELECT niche,
      COUNT(*) as total,
      SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) as converted,
      AVG(lead_score) as avg_score
    FROM leads
    WHERE niche IS NOT NULL
    GROUP BY niche
    ORDER BY converted DESC
    LIMIT 10
  `).all();

  res.json({
    success: true,
    funnel: funnelData,
    pipeline_value: callBooked.count * avgDeal,
    stats: {
      revenue_closed_month: closedWonMonth.count * avgDeal,
      avg_days_to_close: Math.round(avgDaysToClose.avg_days || 0),
      win_rate: totalContacted.count > 0 ? parseFloat((closedWon.count / totalContacted.count).toFixed(3)) : 0,
    },
    revenue: {
      closed_this_month: closedWonMonth.count * avgDeal,
      avg_days_to_close: Math.round(avgDaysToClose.avg_days || 0),
    },
    platform_stats: platformStats,
    niche_stats: nicheStats,
  });
}));

// GET /api/analytics/platforms
router.get('/platforms', asyncHandler(async (req, res) => {
  const db = getDb();

  const platformData = db.prepare(`
    SELECT platform,
      COUNT(*) as total,
      SUM(CASE WHEN crm_stage NOT IN ('new_lead','studying','pitch_ready') THEN 1 ELSE 0 END) as contacted,
      SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) as responded,
      SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) as closed
    FROM leads GROUP BY platform
  `).all();

  const emailsByPlatform = db.prepare(`
    SELECT l.platform, COUNT(*) as sent
    FROM emails e JOIN leads l ON l.id = e.lead_id
    WHERE e.sent_at IS NOT NULL
    GROUP BY l.platform
  `).all();

  const ytData = platformData.find(p => p.platform === 'youtube') || {};
  const rdData = platformData.find(p => p.platform === 'reddit') || {};
  const ytEmails = emailsByPlatform.find(p => p.platform === 'youtube')?.sent || 0;
  const rdEmails = emailsByPlatform.find(p => p.platform === 'reddit')?.sent || 0;

  const makeStats = (p, emailsSent) => ({
    total_leads: p.total || 0,
    emails_sent: emailsSent,
    responses: p.responded || 0,
    closed: p.closed || 0,
    close_rate: p.total > 0 ? parseFloat(((p.closed || 0) / p.total).toFixed(3)) : 0,
  });

  const niches = db.prepare(`
    SELECT niche,
      COUNT(*) as total,
      SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) as closed_count,
      ROUND(CAST(SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as close_rate
    FROM leads WHERE niche IS NOT NULL
    GROUP BY niche ORDER BY close_rate DESC LIMIT 10
  `).all();

  const subreddits = db.prepare(`
    SELECT reddit_subreddit as subreddit,
      COUNT(*) as total_leads,
      SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) as replies,
      ROUND(CAST(SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*), 3) as reply_rate
    FROM leads WHERE platform = 'reddit' AND reddit_subreddit IS NOT NULL
    GROUP BY subreddit ORDER BY replies DESC LIMIT 10
  `).all();

  res.json({
    success: true,
    youtube: makeStats(ytData, ytEmails),
    reddit: makeStats(rdData, rdEmails),
    niche_stats: niches,
    subreddit_stats: subreddits,
  });
}));

module.exports = router;
