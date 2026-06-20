const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');
const { calibrate, scoreAndPopulate, scoreNewMasterLeads, getStats, getDistribution } = require('../services/qualityLeadsService');
const { scanSubreddits } = require('../services/redditSignalService');
const { startLoop, stopLoop, getLoopStatus, runOneCycle } = require('../services/scraperLoopService');
const { scanUpworkJobs, getUpworkStats } = require('../services/upworkService');
const { runAdvancedScan } = require('../services/youtubeAdvancedService');
const { runConfirmedSignalScan, getConfirmedSignalStats, deepScanDescriptions } = require('../services/confirmedSignalService');

// GET /api/quality/stats
router.get('/stats', (req, res) => {
  try {
    res.json(getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quality/distribution
router.get('/distribution', (req, res) => {
  try {
    res.json(getDistribution());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/calibrate — test 5 weight configurations, pick best
router.post('/calibrate', (req, res) => {
  try {
    const result = calibrate();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/populate — score all master_leads, populate quality/archived tables
router.post('/populate', async (req, res) => {
  const { dry_run = false, weights } = req.body;
  try {
    const result = await scoreAndPopulate(weights || undefined, Boolean(dry_run));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/populate/incremental — score only NEW unscored master_leads
router.post('/populate/incremental', (req, res) => {
  try {
    const result = scoreNewMasterLeads();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quality/leads — paginated HOT leads
router.get('/leads', (req, res) => {
  const { page = 1, limit = 50, niche, min_subs, max_subs, source, outreached } = req.query;
  const db = getDb();

  const { tier = 'all' } = req.query;
  const conditions = tier === 'hot' ? ["intent_tier = 'HOT'"] : tier === 'warm' ? ["intent_tier = 'WARM'"] : ['1=1'];
  const params = [];

  if (niche) { conditions.push('niche = ?'); params.push(niche); }
  if (min_subs) { conditions.push('subscriber_count >= ?'); params.push(parseInt(min_subs)); }
  if (max_subs) { conditions.push('subscriber_count <= ?'); params.push(parseInt(max_subs)); }
  if (source) { conditions.push('source = ?'); params.push(source); }
  if (outreached !== undefined) { conditions.push('outreached = ?'); params.push(outreached === 'true' ? 1 : 0); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = params.length
    ? db.prepare(`SELECT COUNT(*) as n FROM quality_leads ${where}`).get(...params).n
    : db.prepare(`SELECT COUNT(*) as n FROM quality_leads ${where}`).get().n;
  const leads = params.length
    ? db.prepare(`SELECT * FROM quality_leads ${where} ORDER BY intent_score DESC, subscriber_count DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset)
    : db.prepare(`SELECT * FROM quality_leads ${where} ORDER BY intent_score DESC, subscriber_count DESC LIMIT ? OFFSET ?`).all(parseInt(limit), offset);

  res.json({ leads, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// GET /api/quality/leads/niches — niche options for filter dropdown
router.get('/leads/niches', (req, res) => {
  const db = getDb();
  const niches = db.prepare(`
    SELECT niche, COUNT(*) as count FROM quality_leads
    WHERE niche IS NOT NULL GROUP BY niche ORDER BY count DESC
  `).all();
  res.json(niches);
});

// POST /api/quality/leads/:creator_id/archive — manually archive a HOT lead
router.post('/leads/:creator_id/archive', (req, res) => {
  const db = getDb();
  const { creator_id } = req.params;

  const lead = db.prepare('SELECT * FROM quality_leads WHERE creator_id=?').get(creator_id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  db.prepare(`
    INSERT OR REPLACE INTO archived_leads
      (creator_id, channel_name, subscriber_count, niche, email,
       intent_score, intent_tier, archived_reason)
    VALUES (?,?,?,?,?,?,'ARCHIVED','manual')
  `).run(lead.creator_id, lead.channel_name, lead.subscriber_count, lead.niche, lead.email, lead.intent_score);

  db.prepare('DELETE FROM quality_leads WHERE creator_id=?').run(creator_id);
  res.json({ message: 'Lead archived' });
});

// GET /api/quality/buying-signals — list Reddit/Discord buying signals
router.get('/buying-signals', (req, res) => {
  const { page = 1, limit = 50, classification, subreddit } = req.query;
  const db = getDb();

  const conditions = ['1=1'];
  const params = [];
  if (classification) { conditions.push('intent_classification = ?'); params.push(classification); }
  if (subreddit) { conditions.push('subreddit = ?'); params.push(subreddit); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as n FROM buying_signals ${where}`).get(...params).n;
  const signals = db.prepare(`
    SELECT * FROM buying_signals ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ signals, total });
});

// POST /api/quality/reddit/scan — scan Reddit right now
router.post('/reddit/scan', async (req, res) => {
  try {
    const result = await scanSubreddits();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quality/scraper/logs — recent scraper activity
router.get('/scraper/logs', (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM scraper_logs ORDER BY started_at DESC LIMIT 100').all();
  res.json(logs);
});

// GET /api/quality/loop/status
router.get('/loop/status', (req, res) => {
  res.json(getLoopStatus());
});

// POST /api/quality/loop/start
router.post('/loop/start', (req, res) => {
  startLoop();
  res.json({ message: 'Quality scraper loop started', status: getLoopStatus() });
});

// POST /api/quality/loop/stop
router.post('/loop/stop', (req, res) => {
  stopLoop();
  res.json({ message: 'Quality scraper loop stopped' });
});

// POST /api/quality/loop/run-now — trigger one cycle immediately
router.post('/loop/run-now', (req, res) => {
  const currentStatus = getLoopStatus();
  if (currentStatus.running) {
    return res.json({ message: 'Cycle already running', status: currentStatus });
  }
  res.json({ message: 'Cycle triggered' });
  runOneCycle().catch(console.error);
});

// GET /api/quality/validation — compare reply rates to targets
router.get('/validation', (req, res) => {
  const db = getDb();

  // HOT validation: join quality_leads → leads → emails
  const hotData = db.prepare(`
    SELECT COUNT(DISTINCT e.lead_id) as outreached,
           SUM(CASE WHEN e.status='replied' THEN 1 ELSE 0 END) as replied
    FROM quality_leads ql
    JOIN leads l ON l.channel_id = ql.creator_id
    JOIN emails e ON e.lead_id = l.id AND e.follow_up_number = 0
    WHERE ql.intent_tier = 'HOT'
  `).get();

  // WARM validation: join archived_leads → leads → emails
  const warmData = db.prepare(`
    SELECT COUNT(DISTINCT e.lead_id) as outreached,
           SUM(CASE WHEN e.status='replied' THEN 1 ELSE 0 END) as replied
    FROM archived_leads al
    JOIN leads l ON l.channel_id = al.creator_id
    JOIN emails e ON e.lead_id = l.id AND e.follow_up_number = 0
    WHERE al.intent_tier = 'WARM'
  `).get();

  function buildBucket(data, target) {
    const outreached = data?.outreached || 0;
    const replied = data?.replied || 0;
    const reply_rate = outreached > 0 ? Math.round((replied / outreached) * 100) : null;
    return {
      outreached, replied, reply_rate, target,
      status: reply_rate === null ? 'insufficient_data'
             : reply_rate >= target ? 'passing'
             : reply_rate >= target * 0.7 ? 'close'
             : 'failing',
    };
  }

  res.json({
    targets: { hot: 60, warm: 30, cold: 10 },
    hot:  buildBucket(hotData, 60),
    warm: buildBucket(warmData, 30),
    cold: { outreached: 0, replied: 0, reply_rate: null, target: 10, status: 'insufficient_data' },
    note: 'Validation requires leads to be outreached first. Track replies in the Email Sender.',
  });
});

// GET /api/quality/upwork/stats
router.get('/upwork/stats', async (req, res) => {
  try {
    const stats = await getUpworkStats();
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/upwork/scan
router.post('/upwork/scan', async (req, res) => {
  try {
    const result = await scanUpworkJobs();
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quality/platform-signals
router.get('/platform-signals', (req, res) => {
  try {
    const db = getDb();
    const signals = db.prepare(`
      SELECT platform, signal_type, COUNT(*) as count,
             AVG(confidence) as avg_confidence
      FROM platform_signals
      GROUP BY platform, signal_type
      ORDER BY count DESC
    `).all();

    const total = db.prepare('SELECT COUNT(*) as count FROM platform_signals').get();
    const confirmed = db.prepare(`
      SELECT COUNT(*) as count FROM platform_signals
      WHERE signal_type = 'confirmed_hiring'
    `).get();
    const upwork = db.prepare('SELECT COUNT(*) as count FROM upwork_signals').get();

    res.json({
      success: true,
      data: {
        total_signals: total.count,
        confirmed_hiring: confirmed.count,
        upwork_jobs: upwork.count,
        by_platform: signals,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/youtube/advanced-scan
router.post('/youtube/advanced-scan', async (req, res) => {
  try {
    const result = await runAdvancedScan(50);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/confirmed/scan — full confirmed signal scan
router.post('/confirmed/scan', async (req, res) => {
  try {
    console.log('[API] Starting confirmed signal scan...');
    const result = await runConfirmedSignalScan();
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quality/confirmed/stats
router.get('/confirmed/stats', async (req, res) => {
  try {
    const stats = await getConfirmedSignalStats();
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/quality/confirmed/scan-descriptions — fast description-only scan
router.post('/confirmed/scan-descriptions', async (req, res) => {
  try {
    const result = await deepScanDescriptions();
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
