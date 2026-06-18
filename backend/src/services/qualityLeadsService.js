const { getDb } = require('../models/database');
const { scoreMasterLead, calculateIntentScoreWithWeights, calibrateWeights, DEFAULT_WEIGHTS } = require('./intentService');

const BATCH_SIZE = 500;

// Run calibration against the per-user leads table (has recent_videos = full signal data)
function calibrate() {
  const db = getDb();
  const leads = db.prepare('SELECT * FROM leads LIMIT 500').all();
  if (leads.length < 5) {
    return { error: 'Need at least 5 leads in your leads table to calibrate', leads_count: leads.length };
  }
  return calibrateWeights(leads);
}

// Score a single batch of master_leads rows
function scoreBatch(batch, weights) {
  const db = getDb();

  const insertHot = db.prepare(`
    INSERT OR REPLACE INTO quality_leads
      (creator_id, channel_url, channel_name, channel_handle, subscriber_count, niche, email,
       intent_score, intent_tier,
       sig_upload_frequency, sig_view_growth, sig_title_keywords,
       sig_description_keywords, sig_engagement, sig_consistency,
       source, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'master_pool',datetime('now'))
  `);

  const insertArchive = db.prepare(`
    INSERT OR REPLACE INTO archived_leads
      (creator_id, channel_name, subscriber_count, niche, email,
       intent_score, intent_tier, archived_reason, archived_at)
    VALUES (?,?,?,?,?,?,?,'below_threshold',datetime('now'))
  `);

  let hot = 0, warm = 0, cold = 0, errors = 0;

  for (const ml of batch) {
    try {
      const { intent_score, temperature, signals } = scoreMasterLead(ml);
      const tier = intent_score >= 0.75 ? 'HOT' : temperature === 'warm' ? 'WARM' : 'COLD';
      const channelUrl = ml.channel_handle
        ? `https://youtube.com/@${ml.channel_handle}`
        : `https://youtube.com/channel/${ml.channel_id}`;

      // quality_leads = HOT + WARM (intent_score >= 0.50) — proxy scores are lower than full 6-signal scores
      // archived_leads = COLD (<0.50 proxy score) — too small/wrong niche to pursue
      // Use 0.50 threshold for master_leads (proxy signals score lower than full 6-signal)
      // quality_leads = HOT (>=0.75) + WARM (0.50-0.75) — both worth contacting
      // archived_leads = COLD (<0.50) — too small/wrong niche
      if (intent_score >= 0.50) {
        const qualTier = intent_score >= 0.75 ? 'HOT' : 'WARM';
        insertHot.run(
          ml.channel_id, channelUrl, ml.channel_name, ml.channel_handle,
          ml.subscriber_count, ml.niche, ml.email, intent_score, qualTier,
          signals?.niche_score || 0,
          signals?.views_score || 0,
          0, // title_keywords not available for master_leads
          signals?.desc_score || signals?.description_keywords || 0,
          signals?.subs_score || 0,
          0, // upload_consistency not available for master_leads
        );
        if (qualTier === 'HOT') hot++; else warm++;
      } else {
        insertArchive.run(
          ml.channel_id, ml.channel_name, ml.subscriber_count,
          ml.niche, ml.email, intent_score, 'COLD',
        );
        cold++;
      }
    } catch { errors++; }
  }

  return { hot, warm, cold, errors };
}

// Score all master_leads and populate quality_leads + archived_leads
// dryRun=true returns counts without writing
async function scoreAndPopulate(weights = DEFAULT_WEIGHTS, dryRun = false) {
  const db = getDb();
  const runId = Math.random().toString(36).slice(2, 10);

  let logId;
  if (!dryRun) {
    logId = db.prepare(
      `INSERT INTO scraper_logs (run_id, scraper_type, status) VALUES (?, 'quality_population', 'running')`
    ).run(runId).lastInsertRowid;
  }

  const total = db.prepare('SELECT COUNT(*) as n FROM master_leads').get().n;
  let hot = 0, warm = 0, cold = 0, errors = 0;

  let offset = 0;
  while (offset < total) {
    const batch = db.prepare('SELECT * FROM master_leads LIMIT ? OFFSET ?').all(BATCH_SIZE, offset);
    if (!batch.length) break;

    if (dryRun) {
      for (const ml of batch) {
        const { intent_score, temperature } = scoreMasterLead(ml);
        if (intent_score >= 0.75) hot++;
        else if (intent_score >= 0.50) warm++;
        else cold++;
      }
    } else {
      const result = scoreBatch(batch, weights);
      hot += result.hot; warm += result.warm; cold += result.cold; errors += result.errors;
    }

    offset += BATCH_SIZE;
    // yield to event loop between batches
    await new Promise(r => setImmediate(r));
  }

  if (!dryRun && logId) {
    db.prepare(`
      UPDATE scraper_logs SET
        status='completed', channels_found=?, channels_scored=?,
        hot_added=?, warm_archived=?, cold_discarded=?, errors=?,
        completed_at=datetime('now')
      WHERE id=?
    `).run(total, total - errors, hot, warm, cold, errors, logId);
  }

  return {
    run_id: runId,
    total,
    hot, warm, cold, errors,
    hot_pct: total > 0 ? Math.round((hot / total) * 100) : 0,
    dry_run: dryRun,
  };
}

// Score only master_leads that haven't been scored yet (incremental)
function scoreNewMasterLeads() {
  const db = getDb();

  const unscored = db.prepare(`
    SELECT ml.* FROM master_leads ml
    LEFT JOIN quality_leads ql ON ql.creator_id = ml.channel_id
    LEFT JOIN archived_leads al ON al.creator_id = ml.channel_id
    WHERE ql.id IS NULL AND al.id IS NULL
    LIMIT 1000
  `).all();

  if (!unscored.length) return { hot: 0, warm: 0, cold: 0, errors: 0, total: 0 };
  return { ...scoreBatch(unscored), total: unscored.length };
}

function getStats() {
  const db = getDb();

  const ql = db.prepare('SELECT COUNT(*) as n, MAX(created_at) as last FROM quality_leads').get();
  const warm = db.prepare("SELECT COUNT(*) as n FROM archived_leads WHERE intent_tier='WARM'").get();
  const cold = db.prepare("SELECT COUNT(*) as n FROM archived_leads WHERE intent_tier='COLD'").get();
  const ml = db.prepare('SELECT COUNT(*) as n FROM master_leads').get();
  const bs = db.prepare('SELECT COUNT(*) as n FROM buying_signals').get();
  const lastLog = db.prepare('SELECT * FROM scraper_logs ORDER BY started_at DESC LIMIT 1').get();

  const byNiche = db.prepare(`
    SELECT niche, COUNT(*) as count FROM quality_leads
    WHERE niche IS NOT NULL GROUP BY niche ORDER BY count DESC LIMIT 10
  `).all();

  const dailyGrowth = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as added
    FROM quality_leads WHERE created_at >= date('now', '-7 days')
    GROUP BY date(created_at) ORDER BY date ASC
  `).all();

  const bySource = db.prepare(`
    SELECT source, COUNT(*) as count FROM quality_leads
    GROUP BY source ORDER BY count DESC
  `).all();

  const topLeads = db.prepare(`
    SELECT creator_id, channel_name, niche, subscriber_count, intent_score, intent_tier
    FROM quality_leads ORDER BY intent_score DESC LIMIT 10
  `).all();

  const total_scored = ql.n + warm.n + cold.n;

  return {
    quality_leads: ql.n,
    warm_archived: warm.n,
    cold_archived: cold.n,
    total_archived: warm.n + cold.n,
    master_leads: ml.n,
    buying_signals: bs.n,
    last_quality_lead_at: ql.last,
    coverage_pct: ml.n > 0 ? Math.round((total_scored / ml.n) * 100) : 0,
    hot_pct: total_scored > 0 ? Math.round((ql.n / total_scored) * 100) : 0,
    by_niche: byNiche,
    by_source: bySource,
    daily_growth: dailyGrowth,
    top_leads: topLeads,
    last_scraper_run: lastLog || null,
  };
}

function getDistribution() {
  const db = getDb();
  // quality_leads contains both HOT and WARM (proxy tier >=0.50)
  const hot  = db.prepare("SELECT COUNT(*) as n FROM quality_leads WHERE intent_tier='HOT'").get().n;
  const warm = db.prepare("SELECT COUNT(*) as n FROM quality_leads WHERE intent_tier='WARM'").get().n;
  const cold = db.prepare('SELECT COUNT(*) as n FROM archived_leads').get().n;
  const ml   = db.prepare('SELECT COUNT(*) as n FROM master_leads').get().n;
  const total = hot + warm + cold;

  return {
    total_scored: total,
    total_master: ml,
    unscored: Math.max(0, ml - total),
    hot,   // HOT tier within quality_leads (>=0.75 proxy)
    warm,  // WARM tier within quality_leads (0.50-0.75 proxy)
    cold,  // COLD — archived (< 0.50 proxy)
    quality_total: hot + warm, // all quality leads
    quality_pct:  total > 0 ? Math.round(((hot + warm) / total) * 100) : 0,
    hot_pct:  total > 0 ? Math.round((hot  / total) * 100) : 0,
    warm_pct: total > 0 ? Math.round((warm / total) * 100) : 0,
    cold_pct: total > 0 ? Math.round((cold / total) * 100) : 0,
  };
}

module.exports = { calibrate, scoreAndPopulate, scoreNewMasterLeads, getStats, getDistribution };
