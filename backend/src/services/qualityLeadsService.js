const { getDb } = require('../models/database');
const { scoreMasterLead, calculateIntentScoreWithWeights, calibrateWeights, DEFAULT_WEIGHTS } = require('./intentService');

const BATCH_SIZE = 500;

async function calibrate() {
  const db = getDb();
  const leads = await db.all('SELECT * FROM leads LIMIT 500');
  if (leads.length < 5) {
    return { error: 'Need at least 5 leads in your leads table to calibrate', leads_count: leads.length };
  }
  return calibrateWeights(leads);
}

async function scoreBatch(batch, weights) {
  const db = getDb();
  let hot = 0, warm = 0, cold = 0, errors = 0;

  for (const ml of batch) {
    try {
      const { intent_score, temperature, signals } = scoreMasterLead(ml);
      const channelUrl = ml.channel_handle
        ? `https://youtube.com/@${ml.channel_handle}`
        : `https://youtube.com/channel/${ml.channel_id}`;

      if (intent_score >= 0.50) {
        const qualTier = intent_score >= 0.75 ? 'HOT' : 'WARM';
        await db.run(`
          INSERT OR REPLACE INTO quality_leads
            (creator_id, channel_url, channel_name, channel_handle, subscriber_count, niche, email,
             intent_score, intent_tier,
             sig_upload_frequency, sig_view_growth, sig_title_keywords,
             sig_description_keywords, sig_engagement, sig_consistency,
             source, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'master_pool',CURRENT_TIMESTAMP)
        `, [
          ml.channel_id, channelUrl, ml.channel_name, ml.channel_handle,
          ml.subscriber_count, ml.niche, ml.email, intent_score, qualTier,
          signals?.niche_score || 0,
          signals?.views_score || 0,
          0,
          signals?.desc_score || signals?.description_keywords || 0,
          signals?.subs_score || 0,
          0,
        ]);
        if (qualTier === 'HOT') hot++; else warm++;
      } else {
        await db.run(`
          INSERT OR REPLACE INTO archived_leads
            (creator_id, channel_name, subscriber_count, niche, email,
             intent_score, intent_tier, archived_reason, archived_at)
          VALUES (?,?,?,?,?,?,?,'below_threshold',CURRENT_TIMESTAMP)
        `, [ml.channel_id, ml.channel_name, ml.subscriber_count, ml.niche, ml.email, intent_score, 'COLD']);
        cold++;
      }
    } catch { errors++; }
  }

  return { hot, warm, cold, errors };
}

async function scoreAndPopulate(weights = DEFAULT_WEIGHTS, dryRun = false) {
  const db = getDb();
  const runId = Math.random().toString(36).slice(2, 10);

  let logId;
  if (!dryRun) {
    const r = await db.run(`INSERT INTO scraper_logs (run_id, scraper_type, status) VALUES (?, 'quality_population', 'running')`, [runId]);
    logId = r.lastID;
  }

  const totalRow = await db.get('SELECT COUNT(*) as n FROM master_leads');
  const total = totalRow.n;
  let hot = 0, warm = 0, cold = 0, errors = 0;

  let offset = 0;
  while (offset < total) {
    const batch = await db.all('SELECT * FROM master_leads LIMIT ? OFFSET ?', [BATCH_SIZE, offset]);
    if (!batch.length) break;

    if (dryRun) {
      for (const ml of batch) {
        const { intent_score, temperature } = scoreMasterLead(ml);
        if (intent_score >= 0.75) hot++;
        else if (intent_score >= 0.50) warm++;
        else cold++;
      }
    } else {
      const result = await scoreBatch(batch, weights);
      hot += result.hot; warm += result.warm; cold += result.cold; errors += result.errors;
    }

    offset += BATCH_SIZE;
    await new Promise(r => setImmediate(r));
  }

  if (!dryRun && logId) {
    await db.run(`
      UPDATE scraper_logs SET
        status='completed', channels_found=?, channels_scored=?,
        hot_added=?, warm_archived=?, cold_discarded=?, errors=?,
        completed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `, [total, total - errors, hot, warm, cold, errors, logId]);
  }

  return { run_id: runId, total, hot, warm, cold, errors, hot_pct: total > 0 ? Math.round((hot / total) * 100) : 0, dry_run: dryRun };
}

async function scoreNewMasterLeads() {
  const db = getDb();
  const unscored = await db.all(`
    SELECT ml.* FROM master_leads ml
    LEFT JOIN quality_leads ql ON ql.creator_id = ml.channel_id
    LEFT JOIN archived_leads al ON al.creator_id = ml.channel_id
    WHERE ql.id IS NULL AND al.id IS NULL
    LIMIT 1000
  `);
  if (!unscored.length) return { hot: 0, warm: 0, cold: 0, errors: 0, total: 0 };
  return { ...(await scoreBatch(unscored)), total: unscored.length };
}

async function getStats() {
  const db = getDb();
  const ql      = await db.get('SELECT COUNT(*) as n, MAX(created_at) as last FROM quality_leads');
  const warm    = await db.get("SELECT COUNT(*) as n FROM archived_leads WHERE intent_tier='WARM'");
  const cold    = await db.get("SELECT COUNT(*) as n FROM archived_leads WHERE intent_tier='COLD'");
  const ml      = await db.get('SELECT COUNT(*) as n FROM master_leads');
  const bs      = await db.get('SELECT COUNT(*) as n FROM buying_signals');
  const lastLog = await db.get('SELECT * FROM scraper_logs ORDER BY started_at DESC LIMIT 1');
  const byNiche = await db.all(`SELECT niche, COUNT(*) as count FROM quality_leads WHERE niche IS NOT NULL GROUP BY niche ORDER BY count DESC LIMIT 10`);
  const dailyGrowth = await db.all(`SELECT DATE(created_at) as date, COUNT(*) as added FROM quality_leads WHERE created_at >= DATE('now', '-7 days') GROUP BY DATE(created_at) ORDER BY date ASC`);
  const bySource    = await db.all(`SELECT source, COUNT(*) as count FROM quality_leads GROUP BY source ORDER BY count DESC`);
  const topLeads    = await db.all(`SELECT creator_id, channel_name, niche, subscriber_count, intent_score, intent_tier FROM quality_leads ORDER BY intent_score DESC LIMIT 10`);
  const total_scored = ql.n + warm.n + cold.n;
  return {
    quality_leads: ql.n, warm_archived: warm.n, cold_archived: cold.n, total_archived: warm.n + cold.n,
    master_leads: ml.n, buying_signals: bs.n, last_quality_lead_at: ql.last,
    coverage_pct: ml.n > 0 ? Math.round((total_scored / ml.n) * 100) : 0,
    hot_pct: total_scored > 0 ? Math.round((ql.n / total_scored) * 100) : 0,
    by_niche: byNiche, by_source: bySource, daily_growth: dailyGrowth, top_leads: topLeads, last_scraper_run: lastLog || null,
  };
}

async function getDistribution() {
  const db = getDb();
  const hot  = (await db.get("SELECT COUNT(*) as n FROM quality_leads WHERE intent_tier='HOT'")).n;
  const warm = (await db.get("SELECT COUNT(*) as n FROM quality_leads WHERE intent_tier='WARM'")).n;
  const cold = (await db.get('SELECT COUNT(*) as n FROM archived_leads')).n;
  const ml   = (await db.get('SELECT COUNT(*) as n FROM master_leads')).n;
  const total = hot + warm + cold;
  return {
    total_scored: total, total_master: ml, unscored: Math.max(0, ml - total),
    hot, warm, cold, quality_total: hot + warm,
    quality_pct: total > 0 ? Math.round(((hot + warm) / total) * 100) : 0,
    hot_pct:  total > 0 ? Math.round((hot  / total) * 100) : 0,
    warm_pct: total > 0 ? Math.round((warm / total) * 100) : 0,
    cold_pct: total > 0 ? Math.round((cold / total) * 100) : 0,
  };
}

module.exports = { calibrate, scoreAndPopulate, scoreNewMasterLeads, getStats, getDistribution };
