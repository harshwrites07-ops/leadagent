const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');
const { calibrate, scoreAndPopulate, scoreNewMasterLeads, getStats, getDistribution } = require('../services/qualityLeadsService');
const { scanSubreddits } = require('../services/redditSignalService');
const { startLoop, stopLoop, getLoopStatus, runOneCycle } = require('../services/scraperLoopService');
const { scanUpworkJobs, getUpworkStats } = require('../services/upworkService');
const { runAdvancedScan } = require('../services/youtubeAdvancedService');
const { runConfirmedSignalScan, getConfirmedSignalStats, deepScanDescriptions } = require('../services/confirmedSignalService');

router.get('/stats', async (req, res) => {
  try { res.json(await getStats()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/distribution', async (req, res) => {
  try { res.json(await getDistribution()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/calibrate', async (req, res) => {
  try { res.json(await calibrate()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/populate', async (req, res) => {
  const { dry_run = false, weights } = req.body;
  try { res.json(await scoreAndPopulate(weights || undefined, Boolean(dry_run))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/populate/incremental', async (req, res) => {
  try { res.json(await scoreNewMasterLeads()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/leads', async (req, res) => {
  const { page = 1, limit = 50, niche, min_subs, max_subs, source, outreached, tier = 'all' } = req.query;
  const db = getDb();
  const conditions = tier === 'hot' ? ["intent_tier = 'HOT'"] : tier === 'warm' ? ["intent_tier = 'WARM'"] : ['1=1'];
  const params = [];
  if (niche)      { conditions.push('niche = ?');              params.push(niche); }
  if (min_subs)   { conditions.push('subscriber_count >= ?');  params.push(parseInt(min_subs)); }
  if (max_subs)   { conditions.push('subscriber_count <= ?');  params.push(parseInt(max_subs)); }
  if (source)     { conditions.push('source = ?');             params.push(source); }
  if (outreached !== undefined) { conditions.push('outreached = ?'); params.push(outreached === 'true' ? 1 : 0); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const totalRow = await db.get(`SELECT COUNT(*) as n FROM quality_leads ${where}`, params);
    const total = totalRow.n;
    const leads = await db.all(`SELECT * FROM quality_leads ${where} ORDER BY intent_score DESC, subscriber_count DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
    res.json({ leads, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/leads/niches', async (req, res) => {
  try {
    const db = getDb();
    const niches = await db.all(`SELECT niche, COUNT(*) as count FROM quality_leads WHERE niche IS NOT NULL GROUP BY niche ORDER BY count DESC`);
    res.json(niches);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/leads/:creator_id/archive', async (req, res) => {
  const db = getDb();
  const { creator_id } = req.params;
  try {
    const lead = await db.get('SELECT * FROM quality_leads WHERE creator_id=?', [creator_id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await db.run(`INSERT INTO archived_leads (creator_id, channel_name, subscriber_count, niche, email, intent_score, intent_tier, archived_reason) VALUES (?,?,?,?,?,?,'ARCHIVED','manual') ON CONFLICT DO NOTHING`,
      [lead.creator_id, lead.channel_name, lead.subscriber_count, lead.niche, lead.email, lead.intent_score]);
    await db.run('DELETE FROM quality_leads WHERE creator_id=?', [creator_id]);
    res.json({ message: 'Lead archived' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/buying-signals', async (req, res) => {
  const { page = 1, limit = 50, classification, subreddit } = req.query;
  const db = getDb();
  const conditions = ['1=1']; const params = [];
  if (classification) { conditions.push('intent_classification = ?'); params.push(classification); }
  if (subreddit)      { conditions.push('subreddit = ?');              params.push(subreddit); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const totalRow = await db.get(`SELECT COUNT(*) as n FROM buying_signals ${where}`, params);
    const signals  = await db.all(`SELECT * FROM buying_signals ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
    res.json({ signals, total: totalRow.n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/reddit/scan', async (req, res) => {
  try { res.json(await scanSubreddits()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/scraper/logs', async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.all('SELECT * FROM scraper_logs ORDER BY started_at DESC LIMIT 100');
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/loop/status',   (req, res) => { res.json(getLoopStatus()); });
router.post('/loop/start',   (req, res) => { startLoop(); res.json({ message: 'Quality scraper loop started', status: getLoopStatus() }); });
router.post('/loop/stop',    (req, res) => { stopLoop(); res.json({ message: 'Quality scraper loop stopped' }); });
router.post('/loop/run-now', (req, res) => {
  const currentStatus = getLoopStatus();
  if (currentStatus.running) return res.json({ message: 'Cycle already running', status: currentStatus });
  res.json({ message: 'Cycle triggered' });
  runOneCycle().catch(console.error);
});

router.get('/validation', async (req, res) => {
  try {
    const db = getDb();
    const hotData  = await db.get(`SELECT COUNT(DISTINCT e.lead_id) as outreached, SUM(CASE WHEN e.status='replied' THEN 1 ELSE 0 END) as replied FROM quality_leads ql JOIN leads l ON l.channel_id = ql.creator_id JOIN emails e ON e.lead_id = l.id AND e.follow_up_number = 0 WHERE ql.intent_tier = 'HOT'`);
    const warmData = await db.get(`SELECT COUNT(DISTINCT e.lead_id) as outreached, SUM(CASE WHEN e.status='replied' THEN 1 ELSE 0 END) as replied FROM archived_leads al JOIN leads l ON l.channel_id = al.creator_id JOIN emails e ON e.lead_id = l.id AND e.follow_up_number = 0 WHERE al.intent_tier = 'WARM'`);
    function buildBucket(data, target) {
      const outreached = data?.outreached || 0, replied = data?.replied || 0;
      const reply_rate = outreached > 0 ? Math.round((replied / outreached) * 100) : null;
      return { outreached, replied, reply_rate, target, status: reply_rate === null ? 'insufficient_data' : reply_rate >= target ? 'passing' : reply_rate >= target * 0.7 ? 'close' : 'failing' };
    }
    res.json({ targets: { hot: 60, warm: 30, cold: 10 }, hot: buildBucket(hotData, 60), warm: buildBucket(warmData, 30), cold: { outreached: 0, replied: 0, reply_rate: null, target: 10, status: 'insufficient_data' }, note: 'Validation requires leads to be outreached first.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/upwork/stats',  async (req, res) => { try { res.json({ success: true, data: await getUpworkStats() }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/upwork/scan',  async (req, res) => { try { res.json({ success: true, data: await scanUpworkJobs() }); } catch (e) { res.status(500).json({ error: e.message }); } });

router.get('/platform-signals', async (req, res) => {
  try {
    const db = getDb();
    const signals   = await db.all(`SELECT platform, signal_type, COUNT(*) as count, AVG(confidence) as avg_confidence FROM platform_signals GROUP BY platform, signal_type ORDER BY count DESC`);
    const total     = await db.get('SELECT COUNT(*) as count FROM platform_signals');
    const confirmed = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE signal_type = 'confirmed_hiring'`);
    const upwork    = await db.get('SELECT COUNT(*) as count FROM upwork_signals');
    res.json({ success: true, data: { total_signals: total.count, confirmed_hiring: confirmed.count, upwork_jobs: upwork.count, by_platform: signals } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/youtube/advanced-scan',        async (req, res) => { try { res.json({ success: true, data: await runAdvancedScan(50) }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/confirmed/scan',               async (req, res) => { try { console.log('[API] Starting confirmed signal scan...'); res.json({ success: true, data: await runConfirmedSignalScan() }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/confirmed/stats',               async (req, res) => { try { res.json({ success: true, data: await getConfirmedSignalStats() }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/confirmed/scan-descriptions',  async (req, res) => { try { res.json({ success: true, data: await deepScanDescriptions() }); } catch (e) { res.status(500).json({ error: e.message }); } });

module.exports = router;
