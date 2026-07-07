const express = require('express');
const router = express.Router();
const { getDb } = require('../models/database');
const { requireAdmin } = require('../middleware/requireAuth');
const { calibrate, scoreAndPopulate, scoreNewMasterLeads, getStats, getDistribution } = require('../services/qualityLeadsService');
const { scanSubreddits } = require('../services/redditSignalService');
const { startLoop, stopLoop, getLoopStatus, runOneCycle } = require('../services/scraperLoopService');
const { scanUpworkJobs, getUpworkStats } = require('../services/upworkService');
const { runAdvancedScan } = require('../services/youtubeAdvancedService');
const { runConfirmedSignalScan, getConfirmedSignalStats, deepScanDescriptions } = require('../services/confirmedSignalService');

// Maps a "Confirmed HOT Signal Sources" card to the platform_signals rows it represents
const SIGNAL_SOURCES = {
  description: { platform: 'youtube_description', signal_type: 'confirmed_hiring', label: 'Description Says "Hiring"' },
  email:       { platform: 'email_analysis',       signal_type: null,              label: 'Business Email' },
  upwork:      { platform: 'upwork',                signal_type: null,              label: 'Upwork Job Post' },
  twitter:     { platform: 'twitter',               signal_type: null,              label: 'Twitter Hiring Post' },
  community:   { platform: 'youtube_community',     signal_type: null,              label: 'Community Post' },
  google:      { platform: 'google_search',         signal_type: null,              label: 'Google Found' },
};

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

// Maps a user's free-text service_type onboarding field to one of the four
// service_fit keys (Session 2.4) via keyword matching. Returns null for
// anything unrecognized — callers must fall back to default ordering rather
// than guessing a fit that isn't there.
const SERVICE_TYPE_KEYWORDS = {
  editor: ['edit', 'editing', 'editor'],
  thumbnail: ['thumbnail', 'thumbnails'],
  shorts: ['shorts', 'short-form', 'short form'],
  scriptwriter: ['script', 'scriptwriting', 'scriptwriter', 'writing'],
};
function matchServiceFitKey(serviceType) {
  if (!serviceType) return null;
  const lower = serviceType.toLowerCase();
  for (const [key, keywords] of Object.entries(SERVICE_TYPE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return key;
  }
  return null;
}

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
  // Attaches claim-status (Session 3.2) to a page of leads — "reserved for
  // you" when the requesting user holds an active claim, "reserved" (no
  // other user identified, per privacy) when someone else does.
  async function attachClaimStatus(leads) {
    if (!leads.length) return leads;
    const creatorIds = leads.map(l => l.creator_id);
    const placeholders = creatorIds.map(() => '?').join(',');
    const claims = await db.all(
      `SELECT creator_id, user_id, expires_at FROM lead_claims WHERE creator_id IN (${placeholders}) AND status != 'expired' AND expires_at > CURRENT_TIMESTAMP`,
      creatorIds
    );
    const byCreator = {};
    for (const c of claims) { (byCreator[c.creator_id] = byCreator[c.creator_id] || []).push(c); }
    return leads.map(l => {
      const claimsForLead = byCreator[l.creator_id] || [];
      const mine = claimsForLead.find(c => c.user_id === req.user.id);
      return {
        ...l,
        reserved_for_me: !!mine,
        reserved_expires_at: mine?.expires_at || null,
        reserved_by_others: !mine && claimsForLead.length > 0,
      };
    });
  }

  // Attaches a predicted reply rate (Session 3.3) — gated to only render
  // when the lead's (tier, lead_type) cell has >=50 real sends (the
  // non-negotiable gate in getPredictedReplyRate); cached per unique
  // (tier, lead_type) pair on the page rather than once per lead, since the
  // prediction only depends on that pair, not the individual lead.
  async function attachPredictedReply(leads) {
    if (!leads.length) return leads;
    const { getPredictedReplyRate } = require('../services/outcomeLearning');
    const cache = {};
    for (const l of leads) {
      const key = `${l.tier || 'unknown'}|${l.lead_type || 'unknown'}`;
      if (!(key in cache)) cache[key] = await getPredictedReplyRate(l.tier, l.lead_type);
    }
    return leads.map(l => {
      const key = `${l.tier || 'unknown'}|${l.lead_type || 'unknown'}`;
      const prediction = cache[key];
      return prediction
        ? { ...l, predicted_reply_rate: prediction.predicted_reply_rate, predicted_reply_sample_size: prediction.sample_size }
        : { ...l, predicted_reply_rate: null, predicted_reply_sample_size: null };
    });
  }

  try {
    const totalRow = await db.get(`SELECT COUNT(*) as n FROM quality_leads ${where}`, params);
    const total = totalRow.n;

    // Service-fit reordering (Session 2.4): only applies when the user has a
    // recognized service_type AND we're not already paginating past what a
    // single-page re-sort could correctly order — pull a bounded working set,
    // re-sort by service_fit, then paginate in memory. Users with no
    // recognized service fall back to the plain DB-level ordering untouched.
    const fitKey = matchServiceFitKey(req.user?.service_type);
    if (fitKey && parseInt(page) === 1) {
      const workingSetSize = Math.max(parseInt(limit) * 4, 200);
      const candidates = await db.all(`SELECT * FROM quality_leads ${where} ORDER BY intent_score DESC, subscriber_count DESC LIMIT ?`, [...params, workingSetSize]);
      candidates.sort((a, b) => {
        let fitA = 0, fitB = 0;
        try { fitA = JSON.parse(a.service_fit || '{}')[fitKey] || 0; } catch {}
        try { fitB = JSON.parse(b.service_fit || '{}')[fitKey] || 0; } catch {}
        if (fitA !== fitB) return fitB - fitA;
        return (b.intent_score || 0) - (a.intent_score || 0);
      });
      const leads = await attachPredictedReply(await attachClaimStatus(candidates.slice(0, parseInt(limit))));
      return res.json({ leads, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), ordered_by_service_fit: fitKey });
    }

    const rawLeads = await db.all(`SELECT * FROM quality_leads ${where} ORDER BY intent_score DESC, subscriber_count DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
    const leads = await attachPredictedReply(await attachClaimStatus(rawLeads));
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

// Drill-down: the exact leads behind one "Confirmed HOT Signal Sources" card.
// Admin-only — these are the highest-intent leads, meant for personal outreach
// before they enter the general automated pool.
router.get('/confirmed/leads', requireAdmin, async (req, res) => {
  const { source, page = 1, limit = 100 } = req.query;
  const cfg = SIGNAL_SOURCES[source];
  if (!cfg) return res.status(400).json({ success: false, error: `Invalid source. Valid: ${Object.keys(SIGNAL_SOURCES).join(', ')}` });
  const db = getDb();
  const conditions = ['ps.platform = ?'];
  const params = [cfg.platform];
  if (cfg.signal_type) { conditions.push('ps.signal_type = ?'); params.push(cfg.signal_type); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const totalRow = await db.get(`SELECT COUNT(*) as n FROM platform_signals ps ${where}`, params);
    const leads = await db.all(`
      SELECT
        ps.id as signal_id, ps.creator_id, ps.signal_text, ps.signal_url, ps.confidence, ps.found_at,
        COALESCE(ql.channel_name, ml.channel_name) as channel_name,
        COALESCE(ql.subscriber_count, ml.subscriber_count, 0) as subscriber_count,
        COALESCE(ql.email, ml.email) as email,
        COALESCE(ql.niche, ml.niche) as niche,
        CASE
          WHEN ml.channel_handle IS NOT NULL AND ml.channel_handle != ''
            THEN 'https://youtube.com/' || (CASE WHEN ml.channel_handle LIKE '@%' THEN ml.channel_handle ELSE '@' || ml.channel_handle END)
          ELSE 'https://youtube.com/channel/' || ps.creator_id
        END as channel_url,
        ql.intent_score, ql.intent_tier, ql.outreached
      FROM platform_signals ps
      LEFT JOIN quality_leads ql ON ql.creator_id = ps.creator_id
      LEFT JOIN master_leads ml ON ml.channel_id = ps.creator_id
      ${where}
      ORDER BY ql.intent_score DESC, ps.confidence DESC, ps.found_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, leads, total: totalRow.n, page: parseInt(page), source, label: cfg.label });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
