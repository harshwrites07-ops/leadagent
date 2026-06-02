/**
 * Background seeder — runs 24/7 inside Railway
 * Fills master_leads with email-verified YouTube leads continuously.
 * Respects API quota — sleeps until midnight when all keys exhausted.
 */

const axios = require('axios');
const { getDb } = require('../models/database');

const MIN_SUBS = 1000;
const MAX_SUBS = 5000000;
const CONCURRENCY = 4;
const SKIP_DOMAINS = new Set(['youtube.com','google.com','googlemail.com','googleapis.com','gstatic.com','example.com']);

const KEYWORDS = [
  'business coach','entrepreneur channel','startup founder','agency owner','CEO vlog',
  'digital marketing','passive income','dropshipping','ecommerce tips','amazon fba',
  'freelancing tips','consulting business','B2B sales','lead generation','growth hacking',
  'stock trading','investing beginners','crypto educator','personal finance','financial advisor',
  'dividend investing','real estate investing','options trading','forex trading','day trading',
  'fitness coach','personal trainer','nutrition coach','wellness coach','yoga instructor',
  'cooking channel','chef youtube','food blogger','recipe channel','baking youtube',
  'tech reviewer','software tutorial','coding tutorial','web development','app development',
  'travel vlogger','travel channel','budget travel','solo travel','adventure travel',
  'beauty guru','makeup tutorial','skincare routine','fashion channel','style tips',
  'education channel','online courses','tutoring channel','homeschool','learning channel',
  'saas founder','software startup','product review tech','unboxing channel','gadget review',
  'real estate agent','property investor','house flipping','rental property','real estate tips',
  'parenting channel','mom vlog','dad vlog','family channel','kids education',
  'mental health','life coach','mindset channel','motivation channel','self improvement',
  'photography tutorial','videography tips','video editing tutorial','filmmaking',
  'music channel','musician youtube','guitar lessons','piano tutorial','singing lessons',
  'gaming channel','game review','lets play','game streaming','esports',
  'law channel','lawyer youtube','legal tips','attorney channel',
  'medical channel','doctor youtube','health tips','dentist channel','therapy channel',
  'accounting channel','tax tips','bookkeeping','financial planning','wealth management',
  'marketing agency','social media tips','content creator tips','youtube growth','tiktok tips',
  'construction channel','home improvement','DIY channel','woodworking','interior design',
  'automotive channel','car review','mechanic tips','car restoration',
  'farming channel','gardening tips','homesteading','agriculture channel',
  'pet channel','dog training','cat channel','animal channel','veterinarian',
  'sports channel','athlete vlog','training channel','crossfit','marathon running',
];

function extractEmail(text) {
  if (!text) return null;
  const matches = [...text.matchAll(/[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0].toLowerCase());
  for (const email of matches) {
    const domain = email.split('@')[1];
    if (domain && !SKIP_DOMAINS.has(domain)) return email;
  }
  return null;
}

async function scrapeEmail(handle, channelId) {
  const urls = [];
  if (handle) urls.push(`https://www.youtube.com/${handle}/about`);
  if (channelId) urls.push(`https://www.youtube.com/channel/${channelId}/about`);
  for (const url of urls) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 7000,
      });
      const email = extractEmail(data);
      if (email) return email;
    } catch {}
  }
  return null;
}

function getApiKeys() {
  const keys = [];
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`YOUTUBE_API_KEY_${i}`];
    if (k && k !== 'placeholder') keys.push(k);
  }
  if (process.env.YOUTUBE_API_KEY && !keys.includes(process.env.YOUTUBE_API_KEY)) {
    keys.push(process.env.YOUTUBE_API_KEY);
  }
  return keys;
}

function msUntilMidnightPacific() {
  const now = new Date();
  const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const midnight = new Date(pacific);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 5, 0, 0); // 12:05am — keys reset by then
  return midnight - pacific;
}

async function runSeedCycle() {
  const db = getDb();
  const API_KEYS = getApiKeys();
  if (!API_KEYS.length) {
    console.log('[Seeder] No YouTube API keys found — skipping cycle');
    return;
  }

  const exhausted = new Set();
  let keyIndex = 0;
  const getKey = () => {
    const active = API_KEYS.filter(k => !exhausted.has(k));
    if (!active.length) return null;
    return active[keyIndex % active.length];
  };

  const INSERT = db.prepare(`
    INSERT OR IGNORE INTO master_leads
      (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
       email, website, channel_description, lead_score, temperature, country, niche)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const shuffled = [...KEYWORDS].sort(() => Math.random() - 0.5);
  let totalSaved = 0;

  for (const keyword of shuffled) {
    if (exhausted.size >= API_KEYS.length) break;

    const key = getKey();
    if (!key) break;

    try {
      const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: { part: 'snippet', q: keyword, type: 'channel', maxResults: 50, key },
        timeout: 12000,
      });
      const channelIds = (searchRes.data.items || [])
        .map(i => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
      if (!channelIds.length) continue;

      const detailRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'snippet,statistics,brandingSettings', id: channelIds.join(','), key },
        timeout: 12000,
      });

      for (const ch of (detailRes.data.items || [])) {
        const subs = parseInt(ch.statistics?.subscriberCount || 0);
        if (subs < MIN_SUBS || subs > MAX_SUBS) continue;

        const desc = ch.snippet?.description || '';
        let email = extractEmail(desc) || extractEmail(ch.brandingSettings?.channel?.description);
        if (!email) email = await scrapeEmail(ch.snippet?.customUrl, ch.id);
        if (!email) continue; // email-only

        const views = parseInt(ch.statistics?.viewCount || 0);
        const videos = Math.max(1, parseInt(ch.statistics?.videoCount || 1));
        let score = 50;
        if (subs > 10000) score += 10; if (subs > 50000) score += 10; if (subs > 100000) score += 10;
        if (views > 100000) score += 5; if (views > 1000000) score += 5;

        INSERT.run(
          ch.id, ch.snippet?.title || 'Unknown', ch.snippet?.customUrl || null,
          subs, Math.round(views / videos), email,
          ch.brandingSettings?.channel?.unsubscribedTrailer || null,
          desc.substring(0, 400) || null, score,
          subs > 100000 ? 'warm' : 'cold',
          ch.snippet?.country || null,
          keyword.split(' ')[0].toLowerCase()
        );
        totalSaved++;
      }
      keyIndex++;
    } catch (e) {
      if (e.response?.status === 403 || e.response?.status === 429) {
        exhausted.add(key);
        console.log(`[Seeder] Key exhausted (${exhausted.size}/${API_KEYS.length})`);
      }
    }
  }

  const total = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
  const withEmail = db.prepare("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''").get().c;
  console.log(`[Seeder] Cycle done — +${totalSaved} new | Total: ${total} | With email: ${withEmail}`);
  return exhausted.size >= API_KEYS.length; // true = all exhausted
}

async function startBackgroundSeeder() {
  if (!process.env.YOUTUBE_API_KEY_1 && !process.env.YOUTUBE_API_KEY) {
    console.log('[Seeder] No YouTube keys — background seeder disabled');
    return;
  }

  console.log('[Seeder] Background seeder started — email-only mode, 24/7');

  while (true) {
    try {
      const allExhausted = await runSeedCycle();
      if (allExhausted) {
        const wait = msUntilMidnightPacific();
        console.log(`[Seeder] All keys exhausted — sleeping ${Math.round(wait / 60000)} min until midnight Pacific`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        // Small pause between cycles to avoid hammering
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (e) {
      console.error('[Seeder] Cycle error:', e.message);
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

module.exports = { startBackgroundSeeder };
