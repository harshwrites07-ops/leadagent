const https = require('https');
const { getDb } = require('../models/database');

const CONFIRMED_HIRING = [
  'looking for a video editor','looking for an editor','need a video editor','need an editor',
  'hiring video editor','hiring editor','editor wanted','video editor wanted','seeking video editor','seeking editor',
  'looking for thumbnail designer','need thumbnail designer','hiring thumbnail designer','thumbnail designer wanted','looking for a designer',
  'looking for scriptwriter','need a scriptwriter','hiring scriptwriter','looking for a writer','need a writer for youtube',
  'join my team','joining my team','looking for team members','hiring for my channel','looking to hire','want to hire',
];

// Generic phrases that also show up in unrelated contexts (sponsorship disclaimers,
// "not compensated for this video", casual collab mentions) — only count these as a
// hiring signal when a role noun appears nearby and the phrase isn't negated.
const CONFIRMED_HIRING_AMBIGUOUS = ['paid collab', 'paid collaboration', 'paid opportunity', 'paid position', 'compensated'];
const ROLE_NOUN_NEAR = ['editor', 'designer', 'writer', 'scriptwriter', 'videographer', 'team member', 'assistant', 'manager', 'thumbnail'];
const NEGATION_NEAR = ['not', "n't", 'no longer', 'never', 'without'];

function findConfirmedHiringMatch(text) {
  const explicit = CONFIRMED_HIRING.find(kw => text.includes(kw));
  if (explicit) return explicit;
  for (const kw of CONFIRMED_HIRING_AMBIGUOUS) {
    const idx = text.indexOf(kw);
    if (idx === -1) continue;
    const before = text.slice(Math.max(0, idx - 40), idx);
    const around = text.slice(Math.max(0, idx - 40), idx + kw.length + 40);
    const negated = NEGATION_NEAR.some(neg => before.includes(neg));
    const hasRoleNoun = ROLE_NOUN_NEAR.some(rn => around.includes(rn));
    if (!negated && hasRoleNoun) return kw;
  }
  return null;
}

const BEHAVIORAL_SIGNALS = [
  'doing everything myself','solo creator','one man channel','one person team','running this alone','by myself',
  'business inquiries','business@','collab@','editor@','team@','hire@',
  'need help with','overwhelmed','posting less',"can't keep up",'struggling to',
];

async function deepScanDescriptions() {
  const db = getDb();
  const leads = await db.all(`
    SELECT ml.channel_id, ml.channel_name, ml.channel_description, ml.email, ml.subscriber_count, ml.niche
    FROM master_leads ml
    LEFT JOIN platform_signals ps ON (ps.creator_id = ml.channel_id AND ps.platform = 'youtube_description')
    WHERE ps.id IS NULL AND ml.channel_description IS NOT NULL AND length(ml.channel_description) > 50
    ORDER BY ml.subscriber_count DESC LIMIT 1000
  `);
  console.log(`[ConfirmedSignal] Deep scanning ${leads.length} descriptions...`);
  let confirmedCount = 0, behavioralCount = 0;
  for (const lead of leads) {
    const text = (lead.channel_description || '').toLowerCase();
    const confirmedMatch = findConfirmedHiringMatch(text);
    const behavioralMatch = BEHAVIORAL_SIGNALS.find(kw => text.includes(kw));
    if (confirmedMatch) {
      try {
        await db.run(`INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'youtube_description', 'confirmed_hiring', ?, ?, 0.85)`,
          [lead.channel_id, `Description says: "${confirmedMatch}"`, `https://youtube.com/channel/${lead.channel_id}`]);
        confirmedCount++;
        await db.run(`UPDATE quality_leads SET intent_score = MAX(intent_score, 0.82), intent_tier = 'HOT', source = 'confirmed_description' WHERE creator_id = ?`, [lead.channel_id]);
        const exists = await db.get('SELECT 1 FROM quality_leads WHERE creator_id = ?', [lead.channel_id]);
        if (!exists) {
          await db.run(`INSERT OR IGNORE INTO quality_leads (creator_id, channel_name, niche, email, subscriber_count, intent_score, intent_tier, source) VALUES (?, ?, ?, ?, ?, 0.82, 'HOT', 'confirmed_description')`,
            [lead.channel_id, lead.channel_name, lead.niche, lead.email, lead.subscriber_count]);
        }
      } catch {}
    } else if (behavioralMatch) {
      try {
        await db.run(`INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'youtube_description', 'behavioral', ?, ?, 0.65)`,
          [lead.channel_id, `Behavioral signal: "${behavioralMatch}"`, `https://youtube.com/channel/${lead.channel_id}`]);
        behavioralCount++;
      } catch {}
    }
  }
  console.log(`[ConfirmedSignal] Found ${confirmedCount} confirmed + ${behavioralCount} behavioral`);
  return { confirmed: confirmedCount, behavioral: behavioralCount, scanned: leads.length };
}

const GOOGLE_QUERIES = [
  '"looking for video editor" youtube','"need a video editor" youtube channel','"hiring video editor" youtube',
  '"looking for thumbnail designer" youtube','"need thumbnail designer" youtube','"looking for scriptwriter" youtube',
  '"hiring editor" youtube channel','site:twitter.com "looking for video editor" youtube',
  'site:reddit.com "looking for video editor" youtube','site:twitter.com "need video editor" youtube',
];

async function scrapeGoogleResults(query) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.google.com',
      path: `/search?q=${encodeURIComponent(query)}&num=10&hl=en`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 8000,
    };
    https.get(options, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data)); }).on('error', () => resolve('')).on('timeout', () => resolve(''));
  });
}

function extractFromGoogleHTML(html, query) {
  const results = [];
  const urlMatches = html.match(/href="(https?:\/\/[^"]+)"/g) || [];
  for (const urlMatch of urlMatches) {
    const url = urlMatch.replace('href="', '').replace('"', '');
    if (url.includes('google.') || url.includes('googleapis') || url.includes('youtube.com/watch')) continue;
    const channelId = url.includes('youtube.com/channel/') ? url.match(/channel\/(UC[a-zA-Z0-9_-]{22})/)?.[1] : null;
    if (url.includes('twitter.com') || url.includes('x.com')) results.push({ type: 'twitter', url, query, confidence: 0.88 });
    else if (url.includes('reddit.com')) results.push({ type: 'reddit', url, query, confidence: 0.85 });
    else if (channelId) results.push({ type: 'youtube', channelId, url, query, confidence: 0.90 });
  }
  return results;
}

async function scanGoogleSignals() {
  const db = getDb();
  let totalNew = 0, queryErrors = 0, lastError = null;
  console.log('[ConfirmedSignal] Scanning Google for hiring posts...');
  for (const query of GOOGLE_QUERIES) {
    try {
      const html = await scrapeGoogleResults(query);
      if (!html) { queryErrors++; lastError = `empty response for "${query}"`; continue; }
      for (const result of extractFromGoogleHTML(html, query)) {
        try {
          if (result.type === 'youtube' && result.channelId) {
            await db.run(`INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'google_search', 'confirmed_hiring', ?, ?, ?)`,
              [result.channelId, `Google found: "${query}"`, result.url, result.confidence]);
            await db.run(`UPDATE quality_leads SET intent_score = MAX(intent_score, 0.85), intent_tier = 'HOT', source = 'google_confirmed' WHERE creator_id = ?`, [result.channelId]);
            totalNew++;
          } else {
            await db.run(`INSERT OR IGNORE INTO buying_signals (source, post_id, subreddit, keywords_matched, intent_classification) VALUES (?, ?, ?, ?, 'CONFIRMED_HIRING')`,
              [result.type, result.url, result.type, query.substring(0, 200)]);
            totalNew++;
          }
        } catch {}
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`[Google] Error for query "${query}":`, e.message);
      queryErrors++; lastError = e.message;
    }
  }
  console.log(`[ConfirmedSignal] Google scan: ${totalNew} new signals`);
  try {
    const { recordScraperHealth } = require('./scraperHealth');
    await recordScraperHealth('serp_signals', {
      attempted: GOOGLE_QUERIES.length, succeeded: GOOGLE_QUERIES.length - queryErrors,
      failed: queryErrors, sampleError: lastError,
    });
  } catch {}
  return { new_signals: totalNew };
}

const BUSINESS_EMAIL_PATTERNS = [/business@/i, /collab@/i, /hire@/i, /team@/i, /editor@/i, /creator@/i, /studio@/i, /contact@/i, /work@/i, /management@/i];
const PERSONAL_EMAIL_PATTERNS  = [/@gmail\.com/i, /@yahoo\.com/i, /@hotmail\.com/i, /@outlook\.com/i];
function analyzeEmailQuality(email) {
  if (!email) return 0.5;
  if (BUSINESS_EMAIL_PATTERNS.some(p => p.test(email))) return 0.80;
  if (!PERSONAL_EMAIL_PATTERNS.some(p => p.test(email))) return 0.72;
  return 0.55;
}

async function analyzeEmailPatterns() {
  const db = getDb();
  const leads = await db.all(`
    SELECT channel_id as creator_id, email, channel_name FROM master_leads
    WHERE email IS NOT NULL AND (email LIKE 'business@%' OR email LIKE 'collab@%' OR email LIKE 'hire@%' OR email LIKE 'team@%' OR email LIKE 'editor@%' OR email LIKE 'studio@%' OR (email NOT LIKE '%gmail%' AND email NOT LIKE '%yahoo%' AND email NOT LIKE '%hotmail%' AND email NOT LIKE '%outlook%'))
    LIMIT 2000
  `);
  console.log(`[EmailAnalysis] Analyzing ${leads.length} business emails...`);
  let upgraded = 0;
  for (const lead of leads) {
    const emailScore = analyzeEmailQuality(lead.email);
    if (emailScore >= 0.72) {
      try {
        await db.run(`INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'email_analysis', 'behavioral', ?, ?, ?)`,
          [lead.creator_id, `Business email: ${lead.email}`, `https://youtube.com/channel/${lead.creator_id}`, emailScore]);
        await db.run(`UPDATE quality_leads SET intent_score = MIN(intent_score + 0.08, 0.99) WHERE creator_id = ? AND intent_score > 0`, [lead.creator_id]);
        upgraded++;
      } catch {}
    }
  }
  console.log(`[EmailAnalysis] Upgraded ${upgraded} leads with business emails`);
  return { upgraded };
}

async function runConfirmedSignalScan() {
  console.log('[ConfirmedSignal] Starting full confirmed signal scan...');
  const results = { description_scan: null, google_scan: null, email_analysis: null, timestamp: new Date().toISOString() };
  try { results.description_scan = await deepScanDescriptions(); } catch (e) { console.error('[ConfirmedSignal] Description scan error:', e.message); }
  try { results.email_analysis = await analyzeEmailPatterns(); } catch (e) { console.error('[ConfirmedSignal] Email analysis error:', e.message); }
  try { results.google_scan = await scanGoogleSignals(); } catch (e) { console.error('[ConfirmedSignal] Google scan error:', e.message); }
  const db = getDb();
  const hotCount       = await db.get("SELECT COUNT(*) as count FROM quality_leads WHERE intent_tier = 'HOT'");
  const confirmedCount = await db.get("SELECT COUNT(*) as count FROM platform_signals WHERE signal_type = 'confirmed_hiring'");
  results.final_hot_leads = hotCount.count;
  results.total_confirmed_signals = confirmedCount.count;
  console.log(`[ConfirmedSignal] Complete. HOT leads: ${hotCount.count}, Confirmed signals: ${confirmedCount.count}`);
  return results;
}

async function getConfirmedSignalStats() {
  const db = getDb();
  const byPlatform       = await db.all(`SELECT platform, signal_type, COUNT(*) as count FROM platform_signals GROUP BY platform, signal_type ORDER BY count DESC`);
  const confirmed        = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE signal_type = 'confirmed_hiring'`);
  const descriptionHits  = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE platform = 'youtube_description' AND signal_type = 'confirmed_hiring'`);
  const businessEmails   = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE platform = 'email_analysis'`);
  const upworkJobs       = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE platform = 'upwork'`);
  const twitterSignals   = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE platform = 'twitter'`);
  const communitySignals = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE platform = 'youtube_community'`);
  const googleSignals    = await db.get(`SELECT COUNT(*) as count FROM platform_signals WHERE platform = 'google_search'`);
  return { total_confirmed: confirmed.count, description_hiring_signals: descriptionHits.count, business_emails: businessEmails.count, upwork_jobs: upworkJobs.count, twitter_signals: twitterSignals.count, community_signals: communitySignals.count, google_signals: googleSignals.count, by_platform: byPlatform };
}

module.exports = { runConfirmedSignalScan, getConfirmedSignalStats, deepScanDescriptions };
