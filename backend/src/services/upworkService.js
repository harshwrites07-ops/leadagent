/**
 * Upwork RSS Signal Service
 * Fetches YouTube creator job postings from Upwork RSS feed
 * FREE - no API key required
 */

const https = require('https');
const { getDb, USE_PG } = require('../models/database');

const UPWORK_QUERIES = [
  'youtube+video+editor','youtube+thumbnail+designer','youtube+scriptwriter',
  'youtube+content+creator','youtube+channel+manager','video+editor+youtuber',
  'thumbnail+designer+youtube','youtube+editor+needed',
];

const CREATOR_KEYWORDS = ['youtube','youtuber','channel','subscriber','views','video editor','thumbnail','scriptwriter','content creator','editing','creator','vlogger','streamer'];
const BUDGET_REGEX = /\$(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:\/hr|per hour|hourly|budget|total|fixed)?/gi;

function fetchRSS(query) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'www.upwork.com', path: `/ab/feed/jobs/rss?q=${query}&sort=recency&paging=0%3B20`, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)', 'Accept': 'application/rss+xml, application/xml, text/xml' }, timeout: 10000 };
    https.get(options, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data)); }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

function parseRSSItems(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const item of itemMatches) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/))?.[1] || '';
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';
    const guid = (item.match(/<guid[^>]*>(.*?)<\/guid>/))?.[1] || link;
    if (!title) continue;
    const fullText = (title + ' ' + description).toLowerCase();
    if (!CREATOR_KEYWORDS.some(kw => fullText.includes(kw))) continue;
    const budgetMatch = fullText.match(BUDGET_REGEX);
    const emailMatch = description.match(/[\w.-]+@[\w.-]+\.\w+/);
    const jobId = guid.split('/').pop() || guid;
    items.push({ jobId, title: title.trim(), description: description.replace(/<[^>]*>/g, ' ').trim(), budget: budgetMatch ? budgetMatch[0] : null, email: emailMatch ? emailMatch[0] : null, jobUrl: link, postedAt: pubDate, confidence: calculateJobConfidence(fullText) });
  }
  return items;
}

function calculateJobConfidence(text) {
  let score = 0.5;
  if (text.includes('long term') || text.includes('ongoing')) score += 0.15;
  if (text.includes('monthly') || text.includes('retainer')) score += 0.15;
  if (text.includes('immediately') || text.includes('asap')) score += 0.1;
  if (text.includes('100k') || text.includes('500k') || text.includes('1m')) score += 0.1;
  if (text.match(/\$\d+/)) score += 0.1;
  if (text.includes('urgent') || text.includes('need now')) score += 0.1;
  return Math.min(score, 0.99);
}

async function scanUpworkJobs() {
  const db = getDb();
  let totalFound = 0, totalNew = 0;
  console.log('[Upwork] Starting RSS scan...');

  for (const query of UPWORK_QUERIES) {
    try {
      const xml = await fetchRSS(query);
      const items = parseRSSItems(xml);
      for (const item of items) {
        try {
          const result = await db.run(
            `INSERT OR IGNORE INTO upwork_signals (job_id, title, description, budget, job_url, email, posted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [item.jobId, item.title, item.description, item.budget, item.jobUrl, item.email, item.postedAt]
          );
          if (result.changes > 0) {
            totalNew++;
            await db.run(`INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence, budget_mentioned) VALUES (?, 'upwork', 'confirmed_hiring', ?, ?, ?, ?)`,
              [`upwork_${item.jobId}`, item.title, item.jobUrl, item.confidence, item.budget ? 1 : 0]);
            await db.run(`INSERT OR IGNORE INTO buying_signals (source, post_id, subreddit, keywords_matched, intent_classification) VALUES ('upwork', ?, 'upwork_jobs', ?, 'CONFIRMED_HIRING')`,
              [item.jobId, item.title.substring(0, 200)]);
          }
          totalFound++;
        } catch {}
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) { console.error(`[Upwork] Error fetching query "${query}":`, e.message); }
  }

  console.log(`[Upwork] Scan complete: ${totalFound} found, ${totalNew} new jobs`);
  return { total_found: totalFound, new_jobs: totalNew, queries_scanned: UPWORK_QUERIES.length };
}

async function getUpworkStats() {
  const db = getDb();
  const todaySql = USE_PG
    ? `SELECT COUNT(*) as count FROM upwork_signals WHERE found_at::date = CURRENT_DATE`
    : `SELECT COUNT(*) as count FROM upwork_signals WHERE date(found_at) = date('now')`;
  const total      = await db.get('SELECT COUNT(*) as count FROM upwork_signals');
  const today      = await db.get(todaySql);
  const withBudget = await db.get(`SELECT COUNT(*) as count FROM upwork_signals WHERE budget IS NOT NULL`);
  const recent     = await db.all(`SELECT title, budget, job_url, found_at FROM upwork_signals ORDER BY found_at DESC LIMIT 10`);
  return { total_jobs: total.count, found_today: today.count, with_budget: withBudget.count, recent_jobs: recent };
}

module.exports = { scanUpworkJobs, getUpworkStats };
