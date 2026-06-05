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

// Each entry: [keyword, niche_id] — niche_id must match frontend NICHES ids exactly
const KEYWORD_NICHE_MAP = [
  // ── Business ──────────────────────────────────────────────────────────────
  ['business coach youtube', 'business'], ['entrepreneur channel', 'business'],
  ['startup founder vlog', 'business'], ['agency owner youtube', 'business'],
  ['CEO vlog', 'business'], ['digital entrepreneur', 'business'],
  ['online business tips', 'business'], ['B2B sales channel', 'business'],
  ['consulting business youtube', 'business'], ['dropshipping channel', 'business'],
  ['ecommerce tips youtube', 'business'], ['amazon fba youtube', 'business'],
  ['freelancing tips channel', 'business'], ['passive income ideas', 'business'],
  ['solopreneur youtube', 'business'], ['business automation channel', 'business'],
  ['scaling business youtube', 'business'], ['personal brand channel', 'business'],
  ['side hustle youtube channel', 'business'], ['small business owner youtube', 'business'],
  ['marketing agency youtube', 'business'], ['cold outreach channel', 'business'],
  ['lead generation youtube', 'business'], ['sales training channel', 'business'],
  ['business growth hacks youtube', 'business'], ['entrepreneurship vlog', 'business'],
  ['productized service youtube', 'business'], ['agency growth channel', 'business'],
  // ── Finance ───────────────────────────────────────────────────────────────
  ['personal finance channel', 'finance'], ['investing tips youtube', 'finance'],
  ['stock market channel', 'finance'], ['crypto educator youtube', 'finance'],
  ['financial advisor youtube', 'finance'], ['day trading channel', 'finance'],
  ['dividend investing youtube', 'finance'], ['forex trading channel', 'finance'],
  ['options trading youtube', 'finance'], ['wealth building channel', 'finance'],
  ['financial freedom youtube', 'finance'], ['budgeting tips channel', 'finance'],
  ['debt free journey youtube', 'finance'], ['financial independence channel', 'finance'],
  ['money mindset youtube', 'finance'], ['tax tips channel', 'finance'],
  ['index fund investing youtube', 'finance'], ['retirement planning channel', 'finance'],
  ['credit score tips youtube', 'finance'], ['frugal living channel', 'finance'],
  ['compound interest youtube', 'finance'], ['net worth journey vlog', 'finance'],
  ['real estate investing finance', 'finance'], ['financial planning youtube', 'finance'],
  // ── Fitness ───────────────────────────────────────────────────────────────
  ['fitness coach youtube', 'fitness'], ['personal trainer channel', 'fitness'],
  ['workout routine youtube', 'fitness'], ['nutrition coach channel', 'fitness'],
  ['gym motivation youtube', 'fitness'], ['weight loss channel', 'fitness'],
  ['bodybuilding youtube', 'fitness'], ['yoga instructor channel', 'fitness'],
  ['calisthenics youtube', 'fitness'], ['online fitness coaching', 'fitness'],
  ['HIIT workout channel', 'fitness'], ['running coach youtube', 'fitness'],
  ['strength training channel', 'fitness'], ['wellness coach youtube', 'fitness'],
  ['crossfit youtube channel', 'fitness'], ['marathon training vlog', 'fitness'],
  ['powerlifting youtube', 'fitness'], ['home workout channel', 'fitness'],
  ['sports performance youtube', 'fitness'], ['meal prep fitness youtube', 'fitness'],
  ['fat loss coach channel', 'fitness'], ['athlete training vlog', 'fitness'],
  ['pilates youtube channel', 'fitness'], ['physique transformation youtube', 'fitness'],
  // ── Cooking / Food ────────────────────────────────────────────────────────
  ['cooking channel youtube', 'cooking'], ['chef youtube channel', 'cooking'],
  ['food blogger youtube', 'cooking'], ['recipe channel', 'cooking'],
  ['baking youtube channel', 'cooking'], ['meal prep channel', 'cooking'],
  ['vegan cooking youtube', 'cooking'], ['bbq youtube channel', 'cooking'],
  ['restaurant owner youtube', 'cooking'], ['food review channel', 'cooking'],
  ['street food youtube', 'cooking'], ['healthy eating channel', 'cooking'],
  ['budget meals youtube', 'cooking'], ['asian cooking channel', 'cooking'],
  ['italian cooking youtube', 'cooking'], ['plant based diet channel', 'cooking'],
  ['keto recipes youtube', 'cooking'], ['dessert tutorial channel', 'cooking'],
  ['food photography youtube', 'cooking'], ['fermentation channel youtube', 'cooking'],
  // ── Tech ──────────────────────────────────────────────────────────────────
  ['tech review channel', 'tech'], ['software tutorial youtube', 'tech'],
  ['coding tutorial channel', 'tech'], ['web development youtube', 'tech'],
  ['app development channel', 'tech'], ['AI tools youtube', 'tech'],
  ['gadget review channel', 'tech'], ['programming tips youtube', 'tech'],
  ['cybersecurity channel', 'tech'], ['data science youtube', 'tech'],
  ['machine learning channel', 'tech'], ['developer vlog youtube', 'tech'],
  ['no code youtube channel', 'tech'], ['automation tools youtube', 'tech'],
  ['python tutorial channel', 'tech'], ['javascript youtube channel', 'tech'],
  ['cloud computing youtube', 'tech'], ['tech startup vlog', 'tech'],
  ['blockchain developer youtube', 'tech'], ['product management youtube', 'tech'],
  ['devops youtube channel', 'tech'], ['react js tutorial channel', 'tech'],
  // ── Travel ────────────────────────────────────────────────────────────────
  ['travel vlogger channel', 'travel'], ['travel tips youtube', 'travel'],
  ['budget travel channel', 'travel'], ['solo travel youtube', 'travel'],
  ['digital nomad vlog', 'travel'], ['adventure travel channel', 'travel'],
  ['backpacking youtube', 'travel'], ['luxury travel vlog', 'travel'],
  ['expat youtube channel', 'travel'], ['van life youtube', 'travel'],
  ['world travel vlog', 'travel'], ['travel couple channel', 'travel'],
  ['family travel vlog youtube', 'travel'], ['off road travel channel', 'travel'],
  ['sailing vlog youtube', 'travel'], ['motorcycle travel youtube', 'travel'],
  ['travel photography channel', 'travel'], ['campervan life youtube', 'travel'],
  ['travel hacks channel', 'travel'], ['country specific vlog', 'travel'],
  // ── Beauty / Fashion ──────────────────────────────────────────────────────
  ['beauty youtube channel', 'beauty'], ['makeup tutorial youtube', 'beauty'],
  ['skincare routine channel', 'beauty'], ['fashion channel youtube', 'beauty'],
  ['style tips youtube', 'beauty'], ['hair tutorial channel', 'beauty'],
  ['beauty influencer youtube', 'beauty'], ['nail art channel', 'beauty'],
  ['mens fashion youtube', 'beauty'], ['natural beauty channel', 'beauty'],
  ['thrift haul youtube', 'beauty'], ['skincare for men youtube', 'beauty'],
  ['ootd youtube channel', 'beauty'], ['beauty product reviews youtube', 'beauty'],
  ['drugstore makeup youtube', 'beauty'], ['luxury fashion channel', 'beauty'],
  // ── Education ─────────────────────────────────────────────────────────────
  ['education channel youtube', 'edu'], ['online course creator youtube', 'edu'],
  ['tutoring channel youtube', 'edu'], ['skill development youtube', 'edu'],
  ['self improvement channel', 'edu'], ['language learning youtube', 'edu'],
  ['career advice channel', 'edu'], ['study tips youtube', 'edu'],
  ['teacher youtube channel', 'edu'], ['how to channel youtube', 'edu'],
  ['exam prep youtube channel', 'edu'], ['mindset coach youtube', 'edu'],
  ['productivity tips channel', 'edu'], ['reading channel youtube', 'edu'],
  ['journaling youtube', 'edu'], ['morning routine channel', 'edu'],
  ['book summary channel', 'edu'], ['life skills youtube', 'edu'],
  // ── Gaming ────────────────────────────────────────────────────────────────
  ['gaming channel youtube', 'gaming'], ['game review channel', 'gaming'],
  ['lets play youtube', 'gaming'], ['esports youtube channel', 'gaming'],
  ['streaming tips youtube', 'gaming'], ['game developer youtube', 'gaming'],
  ['minecraft youtube channel', 'gaming'], ['fortnite youtube channel', 'gaming'],
  ['fps gaming channel', 'gaming'], ['rpg gaming youtube', 'gaming'],
  ['twitch highlights youtube', 'gaming'], ['gaming setup channel', 'gaming'],
  ['game lore youtube', 'gaming'], ['retro gaming channel', 'gaming'],
  ['speedrunning youtube', 'gaming'], ['gaming news channel', 'gaming'],
  // ── Design ────────────────────────────────────────────────────────────────
  ['graphic design youtube', 'design'], ['UI UX design channel', 'design'],
  ['logo design youtube', 'design'], ['Figma tutorial channel', 'design'],
  ['motion graphics youtube', 'design'], ['freelance design channel', 'design'],
  ['brand identity design youtube', 'design'], ['web design channel', 'design'],
  ['illustrator tutorial youtube', 'design'], ['photoshop tutorial channel', 'design'],
  ['3d design youtube channel', 'design'], ['product design vlog', 'design'],
  ['typography youtube channel', 'design'], ['design portfolio channel', 'design'],
  // ── SaaS ──────────────────────────────────────────────────────────────────
  ['saas founder youtube', 'saas'], ['software startup channel', 'saas'],
  ['product led growth youtube', 'saas'], ['indie hacker youtube', 'saas'],
  ['build in public channel', 'saas'], ['SaaS marketing youtube', 'saas'],
  ['micro saas youtube', 'saas'], ['B2B software youtube', 'saas'],
  ['bootstrapped startup vlog', 'saas'], ['MRR growth channel', 'saas'],
  ['product hunt youtube', 'saas'], ['SaaS growth hacks youtube', 'saas'],
  // ── Real Estate ───────────────────────────────────────────────────────────
  ['real estate agent youtube', 'realestate'], ['property investor channel', 'realestate'],
  ['house flipping youtube', 'realestate'], ['rental property tips youtube', 'realestate'],
  ['real estate investing channel', 'realestate'], ['realtor youtube channel', 'realestate'],
  ['real estate coach youtube', 'realestate'], ['airbnb hosting channel', 'realestate'],
  ['commercial real estate youtube', 'realestate'], ['property management youtube', 'realestate'],
  ['real estate wholesaling', 'realestate'], ['multifamily investing youtube', 'realestate'],
  ['first time home buyer youtube', 'realestate'], ['real estate marketing channel', 'realestate'],
  ['short term rental youtube', 'realestate'], ['real estate syndication channel', 'realestate'],
  // ── Health / Medical ──────────────────────────────────────────────────────
  ['doctor youtube channel', 'health'], ['nurse youtube channel', 'health'],
  ['mental health youtube', 'health'], ['therapy advice channel', 'health'],
  ['holistic health youtube', 'health'], ['functional medicine channel', 'health'],
  ['naturopath youtube', 'health'], ['dentist youtube channel', 'health'],
  ['chiropractor youtube', 'health'], ['health coach channel', 'health'],
  ['gut health youtube', 'health'], ['immune system channel', 'health'],
  ['sleep improvement youtube', 'health'], ['stress management channel', 'health'],
  // ── Motivation / Personal Dev ─────────────────────────────────────────────
  ['motivational speaker youtube', 'motivation'], ['life coach channel youtube', 'motivation'],
  ['personal development vlog', 'motivation'], ['discipline mindset youtube', 'motivation'],
  ['stoicism youtube channel', 'motivation'], ['success habits channel', 'motivation'],
  ['confidence building youtube', 'motivation'], ['masculinity channel youtube', 'motivation'],
  ['goal setting channel', 'motivation'], ['mindfulness youtube channel', 'motivation'],
  // ── Family / Parenting ────────────────────────────────────────────────────
  ['family vlog youtube', 'family'], ['parenting tips channel', 'family'],
  ['dad vlog youtube', 'family'], ['mom youtube channel', 'family'],
  ['homeschool youtube channel', 'family'], ['kids educational channel', 'family'],
  ['pregnancy vlog youtube', 'family'], ['toddler activities channel', 'family'],
  // ── Music ─────────────────────────────────────────────────────────────────
  ['musician youtube channel', 'music'], ['music production channel', 'music'],
  ['guitar tutorial youtube', 'music'], ['piano tutorial channel', 'music'],
  ['singing coach youtube', 'music'], ['beat maker youtube', 'music'],
  ['music theory channel', 'music'], ['vocalist youtube channel', 'music'],
  ['music mixing tutorials', 'music'], ['bedroom producer youtube', 'music'],
  // ── Automotive / Cars ─────────────────────────────────────────────────────
  ['car review channel youtube', 'automotive'], ['mechanic youtube channel', 'automotive'],
  ['car restoration vlog', 'automotive'], ['electric vehicle youtube', 'automotive'],
  ['detailing youtube channel', 'automotive'], ['car buying tips youtube', 'automotive'],
  ['motorcyclist youtube vlog', 'automotive'], ['supercar youtube channel', 'automotive'],
  // ── Outdoors / Homesteading ───────────────────────────────────────────────
  ['homesteading youtube channel', 'homesteading'], ['off grid living youtube', 'homesteading'],
  ['farming vlog channel', 'farming'], ['gardening youtube channel', 'gardening'],
  ['permaculture youtube', 'farming'], ['beekeeping channel youtube', 'homesteading'],
  ['self sufficiency youtube', 'homesteading'], ['tiny house youtube', 'homesteading'],
  // ── DIY / Woodworking ─────────────────────────────────────────────────────
  ['DIY youtube channel', 'diy'], ['woodworking youtube channel', 'woodworking'],
  ['home renovation vlog', 'diy'], ['carpentry tutorial youtube', 'woodworking'],
  ['furniture making youtube', 'woodworking'], ['workshop channel youtube', 'diy'],
  ['power tools youtube channel', 'diy'], ['building projects youtube', 'diy'],
  // ── Photography / Filmmaking ──────────────────────────────────────────────
  ['photographer youtube channel', 'photography'], ['camera review channel', 'photography'],
  ['video editing tutorial youtube', 'filmmaking'], ['cinematography youtube', 'filmmaking'],
  ['filmmaking channel youtube', 'filmmaking'], ['lightroom tutorial channel', 'photography'],
  ['wedding photography youtube', 'photography'], ['drone footage channel', 'filmmaking'],
  ['short film youtube channel', 'filmmaking'], ['documentary youtube channel', 'filmmaking'],
];

const KEYWORDS = KEYWORD_NICHE_MAP.map(([kw]) => kw);

function extractEmail(text) {
  if (!text) return null;
  const matches = [...text.matchAll(/[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0].toLowerCase());
  for (const email of matches) {
    const domain = email.split('@')[1];
    if (domain && !SKIP_DOMAINS.has(domain)) return email;
  }
  return null;
}

async function scrapeEmailFromWebsite(url) {
  if (!url) return null;
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Outreach/1.0)' },
      timeout: 6000, maxRedirects: 3,
    });
    // Check mailto links first
    const mailto = (html.match(/href="mailto:([^"?]+)/gi) || [])
      .map(m => m.replace(/href="mailto:/i, '').toLowerCase().trim())
      .find(e => e.includes('@') && !SKIP_DOMAINS.has(e.split('@')[1]));
    if (mailto) return mailto;
    // Try contact/about subpages
    const links = (html.match(/href="([^"]*(?:contact|about)[^"]*)"/gi) || [])
      .map(m => m.match(/href="([^"]+)"/)?.[1]).filter(Boolean).slice(0, 3);
    for (const link of links) {
      try {
        const subUrl = link.startsWith('http') ? link : new URL(link, url).href;
        const { data: sub } = await axios.get(subUrl, { timeout: 5000, maxRedirects: 2,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Outreach/1.0)' } });
        const email = extractEmail(sub);
        if (email) return email;
      } catch {}
    }
    return extractEmail(html);
  } catch { return null; }
}

async function scrapeEmail(handle, channelId, websiteUrl) {
  // 1. Try YouTube about page
  const urls = [];
  if (handle) urls.push(`https://www.youtube.com/${handle}/about`);
  if (channelId) urls.push(`https://www.youtube.com/channel/${channelId}/about`);
  for (const url of urls) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 7000,
      });
      // Also extract website link from about page
      const siteMatch = data.match(/"url":"(https?:\/\/(?!www\.youtube\.com)[^"]+)"/);
      const foundSite = siteMatch?.[1];
      const email = extractEmail(data);
      if (email) return { email, website: foundSite || websiteUrl };
      // No email on about page — try their website
      if (foundSite) {
        const webEmail = await scrapeEmailFromWebsite(foundSite);
        if (webEmail) return { email: webEmail, website: foundSite };
      }
    } catch {}
  }
  // 2. Try provided website directly
  if (websiteUrl) {
    const webEmail = await scrapeEmailFromWebsite(websiteUrl);
    if (webEmail) return { email: webEmail, website: websiteUrl };
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

  // Build keyword→niche lookup
  const kwNicheMap = Object.fromEntries(KEYWORD_NICHE_MAP);

  const shuffled = [...KEYWORD_NICHE_MAP].sort(() => Math.random() - 0.5);
  let totalSaved = 0;

  for (const [keyword] of shuffled) {
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

      // Process channels concurrently for speed
      await Promise.allSettled((detailRes.data.items || []).map(async ch => {
        const subs = parseInt(ch.statistics?.subscriberCount || 0);
        if (subs < MIN_SUBS || subs > MAX_SUBS) return;

        const desc = ch.snippet?.description || '';
        const brandDesc = ch.brandingSettings?.channel?.description || '';
        const websiteUrl = ch.brandingSettings?.channel?.unsubscribedTrailer || null;

        // Try description first (instant), then scrape about page + website
        let email = extractEmail(desc) || extractEmail(brandDesc);
        let website = websiteUrl;

        if (!email) {
          const result = await scrapeEmail(ch.snippet?.customUrl, ch.id, websiteUrl);
          if (result) { email = result.email; website = result.website || websiteUrl; }
        }
        if (!email) return; // email-only — skip

        const views = parseInt(ch.statistics?.viewCount || 0);
        const videos = Math.max(1, parseInt(ch.statistics?.videoCount || 1));
        let score = 50;
        if (subs > 10000) score += 10; if (subs > 50000) score += 10; if (subs > 100000) score += 10;
        if (views > 100000) score += 5; if (views > 1000000) score += 5;
        if (email) score += 15; // bonus for having email

        const r = INSERT.run(
          ch.id, ch.snippet?.title || 'Unknown', ch.snippet?.customUrl || null,
          subs, Math.round(views / videos), email, website,
          desc.substring(0, 400) || null, score,
          subs > 100000 ? 'warm' : 'cold',
          ch.snippet?.country || null,
          kwNicheMap[keyword] || keyword.split(' ')[0].toLowerCase()
        );
        if (r.changes > 0) totalSaved++;
      }));
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
