/**
 * Quelro — Bulk Lead Seeder
 * Seeds the production DB with leads by hammering all YouTube API keys
 * across hundreds of niche keywords.
 *
 * Run: node seed-leads.js
 * Run with target: node seed-leads.js --target=50000
 * Run for specific user: node seed-leads.js --user=1
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: false });
const Database = require('better-sqlite3');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const TARGET = parseInt(process.argv.find(a => a.startsWith('--target='))?.split('=')[1] || '50000');
const USER_ID = parseInt(process.argv.find(a => a.startsWith('--user='))?.split('=')[1] || '1');
const CONCURRENCY = 5; // parallel keyword searches
const MIN_SUBS = 1000;
const MAX_SUBS = 2000000;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/outreach.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found at', DB_PATH);
  process.exit(1);
}

// ── Keyword bank — 300+ keywords across all niches ────────────────────────────
const KEYWORDS = [
  // Business & Entrepreneurship
  'business coach YouTube','entrepreneur vlog','startup founder YouTube','agency owner channel',
  'CEO vlog','business automation YouTube','online business tips','passive income YouTube',
  'dropshipping YouTube','ecommerce YouTube','amazon fba YouTube','print on demand YouTube',
  'freelancing tips YouTube','consulting YouTube','B2B sales YouTube','lead generation YouTube',
  'digital marketing agency','marketing consultant YouTube','growth hacking YouTube',
  'business strategy YouTube','productivity for entrepreneurs','solopreneur YouTube',

  // Finance & Investing
  'stock trading YouTube','investing for beginners YouTube','crypto educator YouTube',
  'personal finance YouTube','financial advisor YouTube','dividend investing YouTube',
  'real estate investing YouTube','options trading YouTube','forex trading YouTube',
  'day trading YouTube','value investing YouTube','financial independence YouTube',
  'FIRE movement YouTube','wealth building YouTube','money management YouTube',
  'budget tips YouTube','debt free journey YouTube','index fund investing YouTube',

  // Real Estate
  'real estate agent YouTube','property investor YouTube','real estate educator YouTube',
  'realtor YouTube','house flipping YouTube','rental property YouTube',
  'real estate wholesaling YouTube','commercial real estate YouTube','airbnb investing YouTube',
  'real estate syndication YouTube','mortgage broker YouTube','property management YouTube',

  // Health & Fitness
  'online fitness coach','personal trainer YouTube','gym owner YouTube',
  'nutrition coach YouTube','weight loss YouTube','muscle building YouTube',
  'CrossFit YouTube','yoga instructor YouTube','running coach YouTube',
  'health educator YouTube','wellness coach YouTube','sports performance YouTube',
  'physical therapist YouTube','chiropractor YouTube','naturopath YouTube',

  // Legal & Professional
  'immigration lawyer YouTube','personal injury attorney YouTube','law firm YouTube',
  'legal education YouTube','lawyer tips YouTube','business attorney YouTube',
  'intellectual property lawyer YouTube','tax attorney YouTube','estate planning YouTube',
  'divorce lawyer YouTube','criminal defense YouTube','contract lawyer YouTube',

  // Tech & SaaS
  'SaaS founder YouTube','software demo YouTube','tech startup YouTube',
  'developer YouTube','coding tutorial YouTube','AI tools YouTube',
  'no code YouTube','web developer YouTube','cybersecurity YouTube',
  'data science YouTube','machine learning YouTube','product manager YouTube',

  // Education & Courses
  'course creator YouTube','online educator YouTube','digital course YouTube',
  'teaching online YouTube','eLearning YouTube','education entrepreneur YouTube',
  'tutoring YouTube','test prep YouTube','language learning YouTube',
  'skills training YouTube','certification prep YouTube','bootcamp YouTube',

  // Health Professionals
  'doctor YouTube channel','therapist YouTube','nutritionist YouTube',
  'dietitian YouTube','mental health YouTube','psychologist YouTube',
  'life coach YouTube','mindset coach YouTube','relationship coach YouTube',
  'career coach YouTube','executive coach YouTube','wellness educator YouTube',

  // Podcasters & Media
  'podcast video channel','video podcast YouTube','podcaster YouTube',
  'interview show YouTube','talk show YouTube','documentary YouTube',
  'journalism YouTube','news commentary YouTube','opinion YouTube',

  // Creators & Entertainment
  'motivational speaker YouTube','public speaker YouTube','author YouTube',
  'book review YouTube','writer YouTube','content creator tips YouTube',
  'YouTube growth YouTube','social media educator YouTube','branding YouTube',

  // Niche Business
  'photography business YouTube','videography YouTube','graphic design YouTube',
  'interior design YouTube','architecture YouTube','fashion YouTube',
  'beauty entrepreneur YouTube','salon owner YouTube','spa YouTube',
  'restaurant owner YouTube','food entrepreneur YouTube','chef YouTube',
  'event planner YouTube','wedding industry YouTube','travel agent YouTube',

  // E-commerce Specific
  'Shopify YouTube','WooCommerce YouTube','etsy seller YouTube',
  'product sourcing YouTube','supplier YouTube','wholesale YouTube',
  'private label YouTube','brand building YouTube','consumer brand YouTube',

  // Agency & Marketing
  'social media agency YouTube','SEO agency YouTube','PPC agency YouTube',
  'content marketing YouTube','email marketing YouTube','influencer marketing YouTube',
  'affiliate marketing YouTube','media buying YouTube','copywriting YouTube',
  'sales funnel YouTube','conversion optimization YouTube','advertising YouTube',

  // Personal Development
  'self improvement YouTube','personal development YouTube','habit building YouTube',
  'goal setting YouTube','time management YouTube','journaling YouTube',
  'stoicism YouTube','philosophy YouTube','minimalism YouTube',

  // Specific Niches
  'pet business YouTube','veterinarian YouTube','dog training YouTube',
  'music production YouTube','musician YouTube','music educator YouTube',
  'art business YouTube','artist YouTube','NFT creator YouTube',
  'gaming YouTube','esports YouTube','game developer YouTube',
  'sports coaching YouTube','athlete YouTube','sports nutrition YouTube',
  'parenting YouTube','mom entrepreneur YouTube','dad entrepreneur YouTube',
  'senior care YouTube','disability advocacy YouTube','nonprofit YouTube',
  'sustainability YouTube','eco business YouTube','green energy YouTube',
  'agriculture YouTube','farming YouTube','food production YouTube',
  'construction business YouTube','contractor YouTube','home improvement YouTube',
  'auto industry YouTube','car dealership YouTube','mechanic YouTube',
  'trucking business YouTube','logistics YouTube','supply chain YouTube',
  'HR consulting YouTube','recruitment YouTube','staffing agency YouTube',
  'insurance agent YouTube','financial planner YouTube','tax consultant YouTube',
  'accounting YouTube','bookkeeping YouTube','CFO YouTube',
];

// ── YouTube API helpers ───────────────────────────────────────────────────────
const API_KEYS = [];
for (let i = 1; i <= 10; i++) {
  const k = process.env[`YOUTUBE_API_KEY_${i}`];
  if (k && k !== 'placeholder') API_KEYS.push(k);
}
if (process.env.YOUTUBE_API_KEY && !API_KEYS.includes(process.env.YOUTUBE_API_KEY)) {
  API_KEYS.push(process.env.YOUTUBE_API_KEY);
}

if (!API_KEYS.length) { console.error('No YouTube API keys found in .env'); process.exit(1); }

const exhausted = new Set();
let keyIndex = 0;

function getKey() {
  const active = API_KEYS.filter(k => !exhausted.has(k));
  if (!active.length) return null;
  const key = active[keyIndex % active.length];
  keyIndex++;
  return key;
}

async function searchKeyword(keyword, pageToken = null) {
  const key = getKey();
  if (!key) return [];
  try {
    const params = {
      part: 'snippet', q: keyword, type: 'channel',
      maxResults: 50, key,
      ...(pageToken ? { pageToken } : {}),
    };
    const res = await axios.get('https://www.googleapis.com/youtube/v3/search', { params, timeout: 15000 });
    return res.data.items || [];
  } catch (e) {
    if (e.response?.status === 403 || e.response?.status === 429) {
      exhausted.add(key);
      console.log(`  Key exhausted (${exhausted.size}/${API_KEYS.length} exhausted)`);
      return searchKeyword(keyword, pageToken); // retry with next key
    }
    return [];
  }
}

async function getChannelDetails(channelIds) {
  const key = getKey();
  if (!key || !channelIds.length) return [];
  try {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'snippet,statistics,contentDetails,brandingSettings',
        id: channelIds.join(','),
        key,
      },
      timeout: 15000,
    });
    return res.data.items || [];
  } catch (e) {
    if (e.response?.status === 403 || e.response?.status === 429) {
      exhausted.add(key);
      return getChannelDetails(channelIds);
    }
    return [];
  }
}

function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

function scoreChannel(stats) {
  const subs = parseInt(stats.subscriberCount || 0);
  const views = parseInt(stats.viewCount || 0);
  const videos = parseInt(stats.videoCount || 0);
  let score = 50;
  if (subs > 10000) score += 10;
  if (subs > 50000) score += 10;
  if (subs > 100000) score += 10;
  if (videos > 20) score += 5;
  if (views > 100000) score += 5;
  if (views > 1000000) score += 5;
  return Math.min(score, 95);
}

// ── DB setup ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ensure master_leads table exists (same as in database.js)
db.exec(`
  CREATE TABLE IF NOT EXISTS master_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT UNIQUE NOT NULL,
    channel_name TEXT NOT NULL,
    channel_handle TEXT,
    subscriber_count INTEGER DEFAULT 0,
    avg_views REAL DEFAULT 0,
    engagement_rate REAL DEFAULT 0,
    upload_frequency_days REAL DEFAULT 0,
    last_upload_date TEXT,
    country TEXT,
    email TEXT,
    website TEXT,
    niche TEXT,
    channel_description TEXT,
    cpm REAL DEFAULT 0,
    days_since_upload INTEGER,
    lead_score INTEGER DEFAULT 0,
    temperature TEXT DEFAULT 'warm',
    scraped_at DATETIME DEFAULT (datetime('now'))
  )
`);

const INSERT = db.prepare(`
  INSERT OR IGNORE INTO master_leads
    (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
     email, website, channel_description, lead_score, temperature, country, niche)
  VALUES
    (@channel_id, @channel_name, @channel_handle, @subscriber_count, @avg_views,
     @email, @website, @channel_description, @lead_score, @temperature, @country, @niche)
`);

// ── Main ──────────────────────────────────────────────────────────────────────
async function processKeyword(keyword, nicheTag) {
  const items = await searchKeyword(keyword);
  if (!items.length) return 0;

  const channelIds = items.map(i => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
  if (!channelIds.length) return 0;

  const details = await getChannelDetails(channelIds);
  let saved = 0;

  for (const ch of details) {
    const subs = parseInt(ch.statistics?.subscriberCount || 0);
    if (subs < MIN_SUBS || subs > MAX_SUBS) continue;

    const desc = ch.snippet?.description || '';
    const email = extractEmail(desc) || extractEmail(ch.brandingSettings?.channel?.description);
    const score = scoreChannel(ch.statistics);
    const temperature = subs > 100000 ? 'warm' : subs > 10000 ? 'cold' : 'cold';

    const r = INSERT.run({
      channel_id: ch.id,
      channel_name: ch.snippet?.title || 'Unknown',
      channel_handle: ch.snippet?.customUrl || null,
      subscriber_count: subs,
      avg_views: Math.round(parseInt(ch.statistics?.viewCount || 0) / Math.max(1, parseInt(ch.statistics?.videoCount || 1))),
      email: email || null,
      website: ch.brandingSettings?.channel?.unsubscribedTrailer || null,
      channel_description: desc.substring(0, 500) || null,
      lead_score: score,
      temperature,
      country: ch.snippet?.country || null,
      niche: nicheTag || keyword.split(' ')[0].toLowerCase(),
    });

    if (r.changes > 0) saved++;
  }

  return saved;
}

async function main() {
  const startCount = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
  console.log(`\nQuelro Master Lead Seeder`);
  console.log(`API keys available: ${API_KEYS.length}`);
  console.log(`Target: ${TARGET.toLocaleString()} leads`);
  console.log(`Starting master_leads count: ${startCount.toLocaleString()}`);
  console.log(`\nStarting...\n`);

  let totalSaved = 0;
  let keywordIndex = 0;
  const shuffled = [...KEYWORDS].sort(() => Math.random() - 0.5);

  while (totalSaved < TARGET && exhausted.size < API_KEYS.length) {
    if (keywordIndex >= shuffled.length) {
      keywordIndex = 0;
      shuffled.sort(() => Math.random() - 0.5); // re-shuffle for next pass
    }

    const batch = shuffled.slice(keywordIndex, keywordIndex + CONCURRENCY);
    keywordIndex += CONCURRENCY;

    const results = await Promise.allSettled(batch.map(kw => processKeyword(kw, kw.split(' ')[0].toLowerCase())));
    const batchSaved = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
    totalSaved += batchSaved;

    const currentTotal = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
    const pct = Math.min(100, Math.round((totalSaved / TARGET) * 100));
    process.stdout.write(`\r  Saved: ${totalSaved.toLocaleString()} | DB total: ${currentTotal.toLocaleString()} | Progress: ${pct}% | Keys left: ${API_KEYS.length - exhausted.size}/${API_KEYS.length}   `);

    if (exhausted.size === API_KEYS.length) {
      console.log('\n\nAll API keys exhausted for today. Run again tomorrow.');
      break;
    }

    await new Promise(r => setTimeout(r, 200)); // small delay to avoid hammering
  }

  const finalCount = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
  const withEmail = db.prepare("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''").get().c;

  console.log(`\n\nDone!`);
  console.log(`  New leads added this run: ${totalSaved.toLocaleString()}`);
  console.log(`  Total in master_leads: ${finalCount.toLocaleString()}`);
  console.log(`  With email: ${withEmail.toLocaleString()} (${finalCount > 0 ? Math.round(withEmail/finalCount*100) : 0}%)`);
}

main().catch(console.error);
