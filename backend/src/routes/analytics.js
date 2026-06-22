const express = require('express');
const router = express.Router();
const { getDb, getSetting, USE_PG } = require('../models/database');
const { asyncHandler } = require('../middleware/errorHandler');

function rangeClause(range) {
  const map = { '7d': '-7 days', '30d': '-30 days', '90d': '-90 days' };
  if (!range || range === 'all') return null;
  return map[range] || '-30 days';
}

function dateSince(offset) {
  return USE_PG ? `NOW() + INTERVAL '${offset}'` : `datetime('now', '${offset}')`;
}

function dateCol(col) {
  return USE_PG ? `${col}::date` : `DATE(${col})`;
}

function dateNow() {
  return USE_PG ? 'CURRENT_DATE' : "DATE('now')";
}

function strftimeMonth(col) {
  return USE_PG
    ? `TO_CHAR(${col}, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`
    : `strftime('%Y-%m', ${col}) = strftime('%Y-%m','now')`;
}

function avgDaysExpr(from, to) {
  return USE_PG
    ? `AVG(EXTRACT(EPOCH FROM (${to}::timestamp - ${from}::timestamp)) / 86400)`
    : `AVG(julianday(${to}) - julianday(${from}))`;
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const totalLeads   = await db.get('SELECT COUNT(*) as count FROM leads WHERE user_id=?', [uid]);
  const leadsToday   = await db.get(`SELECT COUNT(*) as count FROM leads WHERE ${dateCol('created_at')} = ${dateNow()} AND user_id=?`, [uid]);
  const emailsToday  = await db.get(`SELECT COUNT(*) as count FROM emails WHERE ${dateCol('sent_at')} = ${dateNow()} AND user_id=?`, [uid]);
  const monthCheck   = strftimeMonth('sent_at');
  const emailsMonth  = await db.get(`SELECT COUNT(*) as count FROM emails WHERE ${monthCheck} AND user_id=?`, [uid]);
  const totalSent    = await db.get(`SELECT COUNT(*) as count FROM emails WHERE sent_at IS NOT NULL AND user_id=?`, [uid]);
  const totalOpens   = await db.get(`SELECT COUNT(*) as count FROM emails WHERE opened_at IS NOT NULL AND user_id=?`, [uid]);
  const totalReplies = await db.get(`SELECT COUNT(*) as count FROM emails WHERE replied_at IS NOT NULL AND user_id=?`, [uid]);
  const totalClosed  = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won' AND user_id=?`, [uid]);
  const callBooked   = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'call_booked' AND user_id=?`, [uid]);
  const avgDeal = parseInt(getSetting('average_deal_value') || '1000');

  const since14 = dateSince('-14 days');
  const weeklyLeads = await db.all(`
    SELECT ${dateCol('created_at')} as day, COUNT(*) as count
    FROM leads WHERE created_at >= ${since14} AND user_id=?
    GROUP BY ${dateCol('created_at')} ORDER BY day ASC
  `, [uid]);
  const weeklyEmails = await db.all(`
    SELECT ${dateCol('sent_at')} as day, COUNT(*) as count
    FROM emails WHERE sent_at >= ${since14} AND user_id=?
    GROUP BY ${dateCol('sent_at')} ORDER BY day ASC
  `, [uid]);
  const weeklyReplies = await db.all(`
    SELECT ${dateCol('replied_at')} as day, COUNT(*) as count
    FROM emails WHERE replied_at >= ${since14} AND user_id=?
    GROUP BY ${dateCol('replied_at')} ORDER BY day ASC
  `, [uid]);

  const stageRows = await db.all(`SELECT crm_stage, COUNT(*) as count FROM leads WHERE user_id=? GROUP BY crm_stage`, [uid]);
  const stageDistribution = {};
  stageRows.forEach(r => { stageDistribution[r.crm_stage] = r.count; });

  res.json({
    success: true,
    stats: {
      total_leads: totalLeads.count, leads_today: leadsToday.count,
      emails_today: emailsToday.count, emails_month: emailsMonth.count,
      reply_rate:      totalSent.count > 0 ? parseFloat(((totalReplies.count / totalSent.count) * 100).toFixed(1)) : 0,
      open_rate:       totalSent.count > 0 ? parseFloat(((totalOpens.count   / totalSent.count) * 100).toFixed(1)) : 0,
      conversion_rate: totalSent.count > 0 ? parseFloat(((totalClosed.count  / totalSent.count) * 100).toFixed(1)) : 0,
      pipeline_value: callBooked.count * avgDeal, call_booked: callBooked.count,
    },
    charts: { weekly_leads: weeklyLeads, weekly_emails: weeklyEmails, weekly_replies: weeklyReplies },
    stage_distribution: stageDistribution,
  });
}));

router.get('/email', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const since = rangeClause(req.query.range);
  const emailDateFilter = since ? `AND sent_at >= ${dateSince(since)}` : '';
  const hourExpr = USE_PG ? `EXTRACT(HOUR FROM sent_at)::text` : `strftime('%H', sent_at)`;

  const dailySends = await db.all(`
    SELECT ${dateCol('sent_at')} as date, COUNT(*) as sent,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied
    FROM emails WHERE sent_at IS NOT NULL ${emailDateFilter} AND user_id=?
    GROUP BY ${dateCol('sent_at')} ORDER BY date ASC
  `, [uid]);

  const rateTrend = dailySends.map(d => ({
    date: d.date,
    open_rate:  d.sent > 0 ? parseFloat((d.opened  / d.sent * 100).toFixed(1)) : 0,
    reply_rate: d.sent > 0 ? parseFloat((d.replied / d.sent * 100).toFixed(1)) : 0,
  }));

  const bestSubjects = await db.all(`
    SELECT subject, COUNT(*) as sent,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      ROUND(SUM(CASE WHEN opened_at IS NOT NULL THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as open_rate
    FROM emails WHERE sent_at IS NOT NULL ${emailDateFilter} AND user_id=?
    GROUP BY subject HAVING COUNT(*) >= 3 ORDER BY open_rate DESC LIMIT 10
  `, [uid]);

  const bestTimes = await db.all(`
    SELECT ${hourExpr} as hour, COUNT(*) as sent,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replies,
      ROUND(SUM(CASE WHEN opened_at IS NOT NULL THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as open_rate
    FROM emails WHERE sent_at IS NOT NULL ${emailDateFilter} AND user_id=?
    GROUP BY ${hourExpr} ORDER BY open_rate DESC
  `, [uid]);

  res.json({ success: true, daily_sends: dailySends, rate_trend: rateTrend, best_subjects: bestSubjects, best_times: bestTimes });
}));

router.get('/pipeline', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const avgDeal = parseInt(getSetting('average_deal_value') || '1000');
  const since = rangeClause(req.query.range);
  const leadDateFilter = since ? `AND created_at >= ${dateSince(since)}` : '';
  const monthCheck = strftimeMonth('updated_at');

  const funnelData      = await db.all(`SELECT crm_stage as stage, COUNT(*) as count FROM leads WHERE user_id=? ${leadDateFilter} GROUP BY crm_stage ORDER BY count DESC`, [uid]);
  const callBooked      = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'call_booked' AND user_id=?`, [uid]);
  const closedWon       = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won' AND user_id=?`, [uid]);
  const closedWonMonth  = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage = 'closed_won' AND ${monthCheck} AND user_id=?`, [uid]);
  const avgDaysRow      = await db.get(`SELECT ${avgDaysExpr('created_at', 'updated_at')} as avg_days FROM leads WHERE crm_stage = 'closed_won' AND user_id=?`, [uid]);
  const totalContacted  = await db.get(`SELECT COUNT(*) as count FROM leads WHERE crm_stage NOT IN ('new_lead', 'studying', 'pitch_ready') AND user_id=?`, [uid]);
  const platformStats   = await db.all(`SELECT platform, COUNT(*) as total, SUM(CASE WHEN crm_stage = 'replied' OR crm_stage IN ('call_booked','closed_won') THEN 1 ELSE 0 END) as responded, SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) as closed FROM leads WHERE user_id=? GROUP BY platform`, [uid]);
  const nicheStats      = await db.all(`SELECT niche, COUNT(*) as total, SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) as converted, AVG(lead_score) as avg_score FROM leads WHERE niche IS NOT NULL AND user_id=? GROUP BY niche ORDER BY converted DESC LIMIT 10`, [uid]);

  res.json({
    success: true,
    funnel: funnelData, pipeline_value: callBooked.count * avgDeal,
    stats: {
      revenue_closed_month: closedWonMonth.count * avgDeal,
      avg_days_to_close: Math.round(avgDaysRow.avg_days || 0),
      win_rate: totalContacted.count > 0 ? parseFloat((closedWon.count / totalContacted.count).toFixed(3)) : 0,
    },
    revenue: { closed_this_month: closedWonMonth.count * avgDeal, avg_days_to_close: Math.round(avgDaysRow.avg_days || 0) },
    platform_stats: platformStats, niche_stats: nicheStats,
  });
}));

router.get('/platforms', asyncHandler(async (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const since = rangeClause(req.query.range);
  const leadDateFilter = since ? `AND created_at >= ${dateSince(since)}` : '';
  const castFloat = USE_PG ? '::float' : '';
  const roundExpr = (expr, digits) => USE_PG ? `ROUND((${expr})::numeric, ${digits})` : `ROUND(${expr}, ${digits})`;

  const platformData = await db.all(`
    SELECT platform, COUNT(*) as total,
      SUM(CASE WHEN crm_stage NOT IN ('new_lead','studying','pitch_ready') THEN 1 ELSE 0 END) as contacted,
      SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) as responded,
      SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) as closed
    FROM leads WHERE user_id=? ${leadDateFilter} GROUP BY platform
  `, [uid]);
  const emailsByPlatform = await db.all(`
    SELECT l.platform, COUNT(*) as sent FROM emails e JOIN leads l ON l.id = e.lead_id
    WHERE e.sent_at IS NOT NULL AND e.user_id=? GROUP BY l.platform
  `, [uid]);

  const ytData   = platformData.find(p => p.platform === 'youtube') || {};
  const rdData   = platformData.find(p => p.platform === 'reddit')  || {};
  const ytEmails = emailsByPlatform.find(p => p.platform === 'youtube')?.sent || 0;
  const rdEmails = emailsByPlatform.find(p => p.platform === 'reddit')?.sent  || 0;
  const makeStats = (p, emailsSent) => ({
    total_leads: p.total || 0, emails_sent: emailsSent, responses: p.responded || 0, closed: p.closed || 0,
    close_rate: p.total > 0 ? parseFloat(((p.closed || 0) / p.total).toFixed(3)) : 0,
  });

  const niches = await db.all(`
    SELECT niche, COUNT(*) as total,
      SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) as closed_count,
      ${roundExpr(`CAST(SUM(CASE WHEN crm_stage = 'closed_won' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100`, 1)} as close_rate
    FROM leads WHERE niche IS NOT NULL AND user_id=? GROUP BY niche ORDER BY close_rate DESC LIMIT 10
  `, [uid]);
  const subreddits = await db.all(`
    SELECT reddit_subreddit as subreddit, COUNT(*) as total_leads,
      SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) as replies,
      ${roundExpr(`CAST(SUM(CASE WHEN crm_stage IN ('replied','call_booked','closed_won') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*)`, 3)} as reply_rate
    FROM leads WHERE platform = 'reddit' AND reddit_subreddit IS NOT NULL AND user_id=?
    GROUP BY subreddit ORDER BY replies DESC LIMIT 10
  `, [uid]);

  res.json({ success: true, youtube: makeStats(ytData, ytEmails), reddit: makeStats(rdData, rdEmails), niche_stats: niches, subreddit_stats: subreddits });
}));

module.exports = router;
