/**
 * Background seeder — runs 24/7 inside Railway
 * Fills master_leads with email-verified YouTube leads continuously.
 * All API keys run in parallel. Sleeps until midnight when quota exhausted.
 */

const axios = require('axios');
const { getDb } = require('../models/database');

const MIN_SUBS = 1000;
const MAX_SUBS = 5000000;
const CONCURRENCY = 20;
// Only skip truly junk/internal domains — NOT gmail/yahoo/outlook.
// Many real creators use gmail as their business inquiry email.
const SKIP_DOMAINS = new Set(['youtube.com','google.com','googlemail.com','googleapis.com','gstatic.com','ggpht.com','ytimg.com','example.com','sentry.io']);
const PERSONAL_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','me.com','live.com','aol.com','protonmail.com']);

// Seeder status — readable by admin panel
const seederStatus = {
  running: false,
  lastCycleAt: null,
  lastCycleSaved: 0,
  totalCycles: 0,
  currentKeyword: null,
  keysActive: 0,
  keysTotal: 0,
};

// Each entry: [keyword, niche_id]
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
  // ── Pets ──────────────────────────────────────────────────────────────────
  ['dog training youtube', 'pets'], ['cat youtube channel', 'pets'],
  ['pet care tips youtube', 'pets'], ['dog vlog channel', 'pets'],
  ['reptile keeper youtube', 'pets'], ['aquarium youtube channel', 'pets'],
  ['bird keeper youtube', 'pets'], ['exotic pets channel', 'pets'],
  // ── Sports ────────────────────────────────────────────────────────────────
  ['sports analysis youtube', 'sports'], ['basketball training channel', 'sports'],
  ['soccer tips youtube', 'sports'], ['football analysis channel', 'sports'],
  ['tennis coach youtube', 'sports'], ['golf tips channel', 'sports'],
  ['boxing training youtube', 'sports'], ['MMA training channel', 'sports'],
  ['cycling youtube channel', 'sports'], ['swimming coach youtube', 'sports'],
  // ── Law / Legal ───────────────────────────────────────────────────────────
  ['lawyer youtube channel', 'law'], ['attorney tips youtube', 'law'],
  ['legal advice channel', 'law'], ['immigration lawyer youtube', 'law'],
  ['business law youtube', 'law'], ['criminal defense youtube', 'law'],
  ['contract law channel', 'law'], ['tax attorney youtube', 'law'],
  ['intellectual property youtube', 'law'], ['estate planning channel', 'law'],
  ['employment law youtube', 'law'], ['personal injury lawyer youtube', 'law'],
  // ── Podcast / Interviews ──────────────────────────────────────────────────
  ['podcast youtube channel', 'podcast'], ['interview show youtube', 'podcast'],
  ['talk show youtube channel', 'podcast'], ['business podcast video', 'podcast'],
  ['true crime podcast youtube', 'podcast'], ['comedy podcast youtube', 'podcast'],
  ['sports podcast channel', 'podcast'], ['news commentary youtube', 'podcast'],
  ['political commentary channel', 'podcast'], ['deep dive podcast youtube', 'podcast'],
  // ── Spirituality / Mindfulness ────────────────────────────────────────────
  ['meditation channel youtube', 'spiritual'], ['spirituality youtube channel', 'spiritual'],
  ['manifestation youtube', 'spiritual'], ['law of attraction channel', 'spiritual'],
  ['astrology youtube channel', 'spiritual'], ['tarot reading youtube', 'spiritual'],
  ['yoga spiritual youtube', 'spiritual'], ['mindfulness meditation channel', 'spiritual'],
  ['chakra healing youtube', 'spiritual'], ['breathwork youtube channel', 'spiritual'],
  // ── Kids / Animation ──────────────────────────────────────────────────────
  ['kids youtube channel', 'kids'], ['children education youtube', 'kids'],
  ['animation youtube channel', 'kids'], ['cartoon channel youtube', 'kids'],
  ['learning for kids youtube', 'kids'], ['storytime youtube channel', 'kids'],
  ['science for kids youtube', 'kids'], ['art for kids channel', 'kids'],
  // ── Language Learning ─────────────────────────────────────────────────────
  ['english learning youtube', 'language'], ['spanish learning channel', 'language'],
  ['french learning youtube', 'language'], ['japanese learning channel', 'language'],
  ['mandarin learning youtube', 'language'], ['german learning channel', 'language'],
  ['language learning tips youtube', 'language'], ['polyglot youtube channel', 'language'],
  ['ESL teaching youtube', 'language'], ['pronunciation tips channel', 'language'],
  // ── Interior Design / Architecture ────────────────────────────────────────
  ['interior design youtube', 'design'], ['home decor channel youtube', 'design'],
  ['architecture youtube channel', 'design'], ['home tour youtube channel', 'design'],
  ['minimalist living youtube', 'design'], ['scandinavian design channel', 'design'],
  ['apartment tour youtube', 'design'], ['room makeover channel', 'design'],
  ['luxury home youtube', 'design'], ['budget interior design youtube', 'design'],
  // ── Finance Specific ──────────────────────────────────────────────────────
  ['options trading youtube channel', 'finance'], ['swing trading youtube', 'finance'],
  ['penny stocks youtube', 'finance'], ['angel investing youtube', 'finance'],
  ['venture capital youtube', 'finance'], ['private equity channel', 'finance'],
  ['real estate flipping youtube', 'finance'], ['wholesaling real estate channel', 'finance'],
  ['airbnb investing youtube', 'finance'], ['FIRE movement youtube', 'finance'],
  ['frugal millionaire channel', 'finance'], ['stock analysis youtube', 'finance'],
  // ── Mental Health ─────────────────────────────────────────────────────────
  ['mental health channel youtube', 'health'], ['anxiety tips youtube', 'health'],
  ['depression recovery channel', 'health'], ['ADHD youtube channel', 'health'],
  ['trauma healing youtube', 'health'], ['therapy explained youtube', 'health'],
  ['narcissism recovery channel', 'health'], ['bipolar disorder youtube', 'health'],
  ['OCD tips youtube channel', 'health'], ['relationship psychology youtube', 'health'],
  // ── Relationship / Dating ─────────────────────────────────────────────────
  ['dating advice youtube', 'relationships'], ['relationship coach channel', 'relationships'],
  ['marriage tips youtube', 'relationships'], ['breakup recovery youtube', 'relationships'],
  ['dating coach men youtube', 'relationships'], ['dating coach women youtube', 'relationships'],
  ['attachment style youtube', 'relationships'], ['communication skills channel', 'relationships'],
  // ── Productivity / Study ──────────────────────────────────────────────────
  ['study with me youtube', 'edu'], ['productivity system channel', 'edu'],
  ['second brain youtube', 'edu'], ['PKM youtube channel', 'edu'],
  ['time management channel', 'edu'], ['deep work youtube', 'edu'],
  ['note taking youtube channel', 'edu'], ['pomodoro technique youtube', 'edu'],
  ['student life youtube channel', 'edu'], ['exam prep strategy youtube', 'edu'],
  // ── Art / Drawing / Painting ──────────────────────────────────────────────
  ['drawing tutorial youtube', 'art'], ['painting channel youtube', 'art'],
  ['digital art youtube channel', 'art'], ['watercolor tutorial youtube', 'art'],
  ['oil painting youtube', 'art'], ['charcoal drawing channel', 'art'],
  ['procreate tutorial youtube', 'art'], ['art vlog channel youtube', 'art'],
  ['concept art youtube', 'art'], ['figure drawing youtube', 'art'],
  ['comic drawing channel', 'art'], ['artist lifestyle vlog', 'art'],
  // ── Crafts / DIY Handmade ────────────────────────────────────────────────
  ['knitting youtube channel', 'crafts'], ['crochet tutorial youtube', 'crafts'],
  ['sewing channel youtube', 'crafts'], ['embroidery youtube channel', 'crafts'],
  ['candle making youtube', 'crafts'], ['soap making channel', 'crafts'],
  ['jewelry making youtube', 'crafts'], ['pottery youtube channel', 'crafts'],
  ['resin art youtube', 'crafts'], ['origami youtube channel', 'crafts'],
  ['scrapbooking youtube', 'crafts'], ['macrame youtube channel', 'crafts'],
  // ── Science / Education ───────────────────────────────────────────────────
  ['science youtube channel', 'science'], ['physics explained youtube', 'science'],
  ['chemistry youtube channel', 'science'], ['biology explained youtube', 'science'],
  ['space science youtube', 'science'], ['engineering explained channel', 'science'],
  ['math tutorial youtube', 'science'], ['statistics youtube channel', 'science'],
  ['history channel youtube', 'history'], ['ancient history youtube', 'history'],
  ['world war history channel', 'history'], ['mythology youtube channel', 'history'],
  // ── Vlogging / Lifestyle ──────────────────────────────────────────────────
  ['daily vlog youtube', 'lifestyle'], ['lifestyle channel youtube', 'lifestyle'],
  ['morning routine youtube', 'lifestyle'], ['night routine channel', 'lifestyle'],
  ['minimalism youtube channel', 'lifestyle'], ['sustainable living youtube', 'lifestyle'],
  ['zero waste channel youtube', 'lifestyle'], ['slow living youtube', 'lifestyle'],
  ['college student vlog', 'lifestyle'], ['moving abroad youtube vlog', 'lifestyle'],
  // ── Business Specific Long-tail ───────────────────────────────────────────
  ['print on demand youtube', 'business'], ['etsy seller youtube', 'business'],
  ['virtual assistant youtube', 'business'], ['social media manager channel', 'business'],
  ['copywriting youtube channel', 'business'], ['funnel builder youtube', 'business'],
  ['email marketing youtube', 'business'], ['affiliate marketing channel', 'business'],
  ['youtube automation channel', 'business'], ['faceless youtube channel tips', 'business'],
  ['content creator tips youtube', 'business'], ['youtube growth tips channel', 'business'],
  ['tiktok growth youtube', 'business'], ['instagram growth channel', 'business'],
  ['brand deals youtube', 'business'], ['sponsorship tips channel', 'business'],
  // ── Food Specific ────────────────────────────────────────────────────────
  ['mukbang youtube channel', 'cooking'], ['food asmr channel', 'cooking'],
  ['cooking channel indian', 'cooking'], ['mexican cooking youtube', 'cooking'],
  ['japanese cooking channel', 'cooking'], ['french cuisine youtube', 'cooking'],
  ['middle eastern food channel', 'cooking'], ['mediterranean diet youtube', 'cooking'],
  ['gluten free cooking channel', 'cooking'], ['dairy free recipes youtube', 'cooking'],
  ['protein recipes youtube', 'cooking'], ['bulk cooking channel', 'cooking'],
  // ── Tech Specific ────────────────────────────────────────────────────────
  ['linux youtube channel', 'tech'], ['mac tips youtube', 'tech'],
  ['windows tips channel', 'tech'], ['homelab youtube', 'tech'],
  ['self hosted apps youtube', 'tech'], ['open source software youtube', 'tech'],
  ['raspberry pi channel', 'tech'], ['arduino tutorial youtube', 'tech'],
  ['3d printing youtube channel', 'tech'], ['VR gaming youtube', 'tech'],
  ['AI art youtube channel', 'tech'], ['ChatGPT tips youtube', 'tech'],
  ['prompt engineering youtube', 'tech'], ['LLM youtube channel', 'tech'],
];

const kwNicheMap = Object.fromEntries(KEYWORD_NICHE_MAP);

function extractEmail(text) {
  if (!text) return null;
  // Normalize obfuscated formats: "name [at] domain [dot] com", "(at)", "{dot}", etc.
  const normalized = text
    .replace(/\[at\]/gi, '@').replace(/\(at\)/gi, '@').replace(/\{at\}/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\[dot\]/gi, '.').replace(/\(dot\)/gi, '.').replace(/\{dot\}/gi, '.')
    .replace(/\s+dot\s+/gi, '.');
  const matches = [...normalized.matchAll(/[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0].toLowerCase());
  for (const email of matches) {
    const domain = email.split('@')[1];
    if (domain && !SKIP_DOMAINS.has(domain)) return email;
  }
  return null;
}

const SOCIAL_RE = /youtube\.com|youtu\.be|instagram\.com|twitter\.com|x\.com|facebook\.com|tiktok\.com|t\.co|snapchat\.com|pinterest\.com|linkedin\.com/;

// Return ALL non-social URLs from text (not just the first one)
function extractUrlsFromText(text) {
  if (!text) return [];
  const matches = [...text.matchAll(/https?:\/\/[\w.-]+\.[a-zA-Z]{2,}[^\s"')>\]<]*/g)]
    .map(m => m[0].replace(/[.,;!?]+$/, ''))
    .filter(u => !SOCIAL_RE.test(u));
  return [...new Set(matches)].slice(0, 6);
}

// Linktree stores all links in the Next.js SSR payload — extract creator website from it
async function scrapeLinktreeEmail(username) {
  try {
    const { data: html } = await axios.get(`https://linktr.ee/${username}`, {
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    });
    // Extract links from embedded Next.js JSON
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const nd = JSON.parse(m[1]);
        const links = (
          nd?.props?.pageProps?.account?.links ||
          nd?.props?.pageProps?.links ||
          nd?.props?.pageProps?.pageProfile?.links || []
        ).map(l => l.url || l.href || '').filter(u => u && !SOCIAL_RE.test(u) && u.startsWith('http'));
        for (const link of links.slice(0, 5)) {
          const e = await scrapeEmailFromWebsite(link);
          if (e) return e;
        }
      } catch {}
    }
    return extractEmail(html);
  } catch { return null; }
}

async function scrapeEmailFromWebsite(url) {
  if (!url) return null;
  try {
    // Linktree needs special handling — JS-rendered but SSR data is in __NEXT_DATA__
    if (/linktr\.ee\//.test(url)) {
      const username = url.split('linktr.ee/')[1]?.split(/[/?#]/)[0];
      if (username) return scrapeLinktreeEmail(username);
    }
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
      timeout: 5000, maxRedirects: 3,
    });
    // mailto: link is the most reliable signal
    const mailto = (html.match(/href="mailto:([^"?]+)/gi) || [])
      .map(m => m.replace(/href="mailto:/i, '').toLowerCase().trim())
      .find(e => e.includes('@') && !SKIP_DOMAINS.has(e.split('@')[1]));
    if (mailto) return mailto;
    // Try contact/about sub-pages
    const subLinks = (html.match(/href="([^"]*(?:contact|about|hire|work-with)[^"]*)"/gi) || [])
      .map(m => m.match(/href="([^"]+)"/)?.[1]).filter(Boolean).slice(0, 2);
    for (const link of subLinks) {
      try {
        const subUrl = link.startsWith('http') ? link : new URL(link, url).href;
        const { data: sub } = await axios.get(subUrl, {
          timeout: 4000, maxRedirects: 2,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Quelro/1.0)' },
        });
        const email = extractEmail(sub);
        if (email) return email;
      } catch {}
    }
    return extractEmail(html);
  } catch { return null; }
}

function getApiKeys() {
  const keys = [];
  for (let i = 1; i <= 50; i++) {
    const k = process.env[`YOUTUBE_API_KEY_${i}`];
    if (k && k !== 'placeholder') keys.push(k);
  }
  if (process.env.YOUTUBE_API_KEY && !keys.includes(process.env.YOUTUBE_API_KEY)) {
    keys.push(process.env.YOUTUBE_API_KEY);
  }
  return keys;
}

const MASTER_INSERT_SQL = `INSERT OR IGNORE INTO master_leads (channel_id, channel_name, channel_handle, subscriber_count, avg_views, email, website, channel_description, lead_score, temperature, country, niche) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

// Process one batch of channels for a given keyword+key
async function processChannelBatch(db, channels, keyword) {
  const tasks = channels.map(async ch => {
    const subs = parseInt(ch.statistics?.subscriberCount || 0);
    if (subs < MIN_SUBS || subs > MAX_SUBS) return 0;

    const desc = ch.snippet?.description || '';
    const brandDesc = ch.brandingSettings?.channel?.description || '';
    const fullText = desc + ' ' + brandDesc;

    let email = extractEmail(fullText);
    const urls = extractUrlsFromText(fullText);
    const website = urls[0] || null;

    if (!email && urls.length > 0) {
      for (const u of urls) {
        const webEmail = await scrapeEmailFromWebsite(u);
        if (webEmail) { email = webEmail; break; }
      }
    }

    if (!email) return 0;

    const views = parseInt(ch.statistics?.viewCount || 0);
    const videos = Math.max(1, parseInt(ch.statistics?.videoCount || 1));
    const isPersonalEmail = PERSONAL_DOMAINS.has(email.split('@')[1]);

    let score = 50;
    if (subs > 10000) score += 10;
    if (subs > 50000) score += 10;
    if (subs > 100000) score += 10;
    if (views > 100000) score += 5;
    if (views > 1000000) score += 5;
    score += 15;
    if (isPersonalEmail) score -= 15;

    const r = await db.run(MASTER_INSERT_SQL, [
      ch.id, ch.snippet?.title || 'Unknown', ch.snippet?.customUrl || null,
      subs, Math.round(views / videos), email, website,
      desc.substring(0, 400) || null, score,
      subs > 100000 ? 'warm' : 'cold',
      ch.snippet?.country || null,
      kwNicheMap[keyword] || keyword.split(' ')[0].toLowerCase()
    ]);
    return r.changes > 0 ? 1 : 0;
  });

  const results = await Promise.allSettled(tasks);
  return results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
}

// Short hash for API key — used as DB key without storing the actual key
function keyHash(apiKey) {
  let h = 0;
  for (let i = 0; i < apiKey.length; i++) { h = (Math.imul(31, h) + apiKey.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

const UPSERT_TOKEN_SQL = `
  INSERT INTO seeder_keyword_tokens (keyword, api_key_hash, next_page_token, pages_done, last_used)
  VALUES (?,?,?,?,CURRENT_TIMESTAMP)
  ON CONFLICT(keyword, api_key_hash) DO UPDATE SET
    next_page_token=EXCLUDED.next_page_token,
    pages_done=EXCLUDED.pages_done,
    last_used=CURRENT_TIMESTAMP
`;

// A keyword that has returned 0 qualifying leads for this many consecutive
// cycles keeps consuming the same search.list quota share as a high-yield one
// forever — deprioritize it instead of searching it every single cycle.
const ZERO_RESULT_SKIP_THRESHOLD = 10;

// Returns { saved, exhausted }
async function runKeyBatch(apiKey, keywords, db) {
  let saved = 0;
  let exhausted = false;
  const kh = keyHash(apiKey);

  const processKeyword = async (keyword) => {
    if (exhausted) return 0;
    seederStatus.currentKeyword = keyword;

    const stored = await db.get('SELECT next_page_token, pages_done, zero_result_streak FROM seeder_keyword_tokens WHERE keyword=? AND api_key_hash=?', [keyword, kh]);
    const pageToken = stored?.next_page_token || null;
    const pagesDone = stored?.pages_done || 0;
    const zeroStreak = stored?.zero_result_streak || 0;

    if (zeroStreak >= ZERO_RESULT_SKIP_THRESHOLD) return 0;

    try {
      const params = {
        part: 'snippet', q: keyword, type: 'video', order: 'date',
        maxResults: 50, key: apiKey,
      };
      if (pageToken) params.pageToken = pageToken;

      const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', { params, timeout: 10000 });
      const channelIds = [...new Set((searchRes.data.items || []).map(i => i.snippet?.channelId).filter(Boolean))];
      const nextToken = searchRes.data.nextPageToken || null;
      await db.run(UPSERT_TOKEN_SQL, [keyword, kh, nextToken, pagesDone + 1]);

      let kwSaved = 0;
      if (channelIds.length) {
        const detailRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'snippet,statistics,brandingSettings', id: channelIds.join(','), key: apiKey },
          timeout: 10000,
        });

        const channels = detailRes.data.items || [];
        for (let i = 0; i < channels.length; i += CONCURRENCY) {
          kwSaved += await processChannelBatch(db, channels.slice(i, i + CONCURRENCY), keyword);
        }
      }

      await db.run(
        'UPDATE seeder_keyword_tokens SET zero_result_streak = ? WHERE keyword=? AND api_key_hash=?',
        [kwSaved > 0 ? 0 : zeroStreak + 1, keyword, kh]
      );
      return kwSaved;
    } catch (e) {
      const reason = e.response?.data?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded' || e.response?.status === 429) {
        exhausted = true;
        console.log(`[Seeder] Key exhausted (${reason || e.response?.status}): ${apiKey.slice(-6)}`);
      } else {
        console.log(`[Seeder] Key error (not quota, reason=${reason || 'none'}, status=${e.response?.status || 'n/a'}): ${apiKey.slice(-6)} — ${e.message}`);
      }
      return 0;
    }
  };

  const PARALLEL = 4;
  for (let i = 0; i < keywords.length; i += PARALLEL) {
    if (exhausted) break;
    const results = await Promise.allSettled(keywords.slice(i, i + PARALLEL).map(processKeyword));
    saved += results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  }

  return { saved, exhausted };
}

async function runInnerTubeCycle(db, keywords) {
  const { fastSeedSearch } = require('./innertubeService');
  let totalSaved = 0;
  const PARALLEL = 3;
  let attempted = 0, failed = 0, lastError = null;

  for (let i = 0; i < keywords.length; i += PARALLEL) {
    const kwBatch = keywords.slice(i, i + PARALLEL);
    seederStatus.currentKeyword = kwBatch[0];

    try {
      const batchResults = await Promise.allSettled(kwBatch.map(kw => fastSeedSearch(kw, 30)));
      attempted += batchResults.length;

      for (let j = 0; j < kwBatch.length; j++) {
        const r = batchResults[j];
        if (r.status !== 'fulfilled') { failed++; lastError = r.reason?.message || String(r.reason); continue; }
        const niche = kwNicheMap[kwBatch[j]] || kwBatch[j].split(' ')[0].toLowerCase();

        for (const ch of r.value) {
          if (!ch.email) continue;
          const subs = ch.subscriberCount || 0;
          if (subs > 0 && (subs < MIN_SUBS || subs > MAX_SUBS)) continue;
          try {
            const res = await db.run(MASTER_INSERT_SQL, [
              ch.channelId, ch.channelName, ch.handle || null,
              subs, 0, ch.email, null,
              (ch.description || '').substring(0, 400),
              60, subs > 100000 ? 'warm' : 'cold',
              ch.country || null, niche
            ]);
            if (res.changes > 0) totalSaved++;
          } catch (e) { console.warn(`[Seeder] InnerTube insert failed for ${ch.channelId}: ${e.message}`); }
        }
      }
    } catch (e) {
      console.log(`[Seeder/IT] Batch error: ${e.message?.substring(0, 80)}`);
      failed++; lastError = e.message;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  try {
    const { recordScraperHealth } = require('./scraperHealth');
    await recordScraperHealth('innertube', { attempted, succeeded: attempted - failed, failed, sampleError: lastError });
  } catch {}

  return totalSaved;
}

async function runSeedCycle() {
  const db = getDb();
  const API_KEYS = getApiKeys();

  seederStatus.running = true;
  seederStatus.keysTotal = API_KEYS.length;
  seederStatus.keysActive = API_KEYS.length;

  const shuffled = [...KEYWORD_NICHE_MAP].sort(() => Math.random() - 0.5).map(([kw]) => kw);
  let totalSaved = 0;
  let usedInnerTube = false;

  if (API_KEYS.length > 0) {
    console.log(`[Seeder] Cycle start — ${API_KEYS.length} YouTube API keys, ${KEYWORD_NICHE_MAP.length} keywords`);
    const chunkSize = Math.ceil(shuffled.length / API_KEYS.length);
    const chunks = API_KEYS.map((_, i) => shuffled.slice(i * chunkSize, (i + 1) * chunkSize));

    const results = await Promise.allSettled(API_KEYS.map((key, i) => runKeyBatch(key, chunks[i] || [], db)));
    let exhaustedCount = 0, rejectedCount = 0, lastRejectReason = null;
    for (const r of results) {
      if (r.status === 'fulfilled') { totalSaved += r.value.saved; if (r.value.exhausted) exhaustedCount++; }
      else { rejectedCount++; lastRejectReason = r.reason?.message || String(r.reason); }
    }
    seederStatus.keysActive = API_KEYS.length - exhaustedCount;
    try {
      const { recordScraperHealth } = require('./scraperHealth');
      await recordScraperHealth('ytapi', {
        attempted: API_KEYS.length, succeeded: API_KEYS.length - rejectedCount,
        failed: rejectedCount, sampleError: lastRejectReason,
      });
    } catch {}

    if (exhaustedCount >= API_KEYS.length) {
      console.log('[Seeder] All YouTube API keys exhausted — switching to InnerTube fallback');
      usedInnerTube = true;
      totalSaved += await runInnerTubeCycle(db, shuffled);
    }
  } else {
    console.log('[Seeder] No YouTube API keys — running on InnerTube (no quota limits)');
    usedInnerTube = true;
    totalSaved += await runInnerTubeCycle(db, shuffled);
  }

  const totalRow = await db.get('SELECT COUNT(*) as c FROM master_leads');
  const emailRow = await db.get("SELECT COUNT(*) as c FROM master_leads WHERE email IS NOT NULL AND email != ''");
  console.log(`[Seeder] Cycle done — +${totalSaved} new | DB: ${totalRow.c} total | ${emailRow.c} with email${usedInnerTube ? ' [InnerTube]' : ''}`);

  seederStatus.running = false;
  seederStatus.lastCycleAt = new Date().toISOString();
  seederStatus.lastCycleSaved = totalSaved;
  seederStatus.totalCycles++;
  seederStatus.currentKeyword = null;

  if (totalSaved > 0) {
    try {
      const { pushToTurso } = require('./tursoSync');
      const newLeads = await db.all(`SELECT * FROM master_leads WHERE email IS NOT NULL AND (email_corrupt IS NULL OR email_corrupt = 0) ORDER BY id DESC LIMIT ?`, [Math.min(totalSaved * 2, 500)]);
      pushToTurso(newLeads).catch(() => {});
    } catch {}
  }

  return false;
}

// Cost control: this loop previously paused only 10s between full cycles —
// with 512 keywords across up to 8 API keys plus InnerTube fallback, that's
// effectively continuous 24/7 compute/network load, which is the dominant
// driver of Railway usage-based billing. The pool is already substantial
// (~22K master_leads); a 30-minute pause keeps it growing steadily at a
// fraction of the resource cost. Override via SEEDER_CYCLE_PAUSE_MS if
// you want to tune this without a redeploy-requiring code change later.
const SEEDER_CYCLE_PAUSE_MS = parseInt(process.env.SEEDER_CYCLE_PAUSE_MS || '', 10) || 30 * 60 * 1000;

async function startBackgroundSeeder() {
  console.log(`[Seeder] Background seeder started — cycle every ~${Math.round(SEEDER_CYCLE_PAUSE_MS / 60000)}min, InnerTube fallback enabled`);

  while (true) {
    try {
      await runSeedCycle();
      await new Promise(r => setTimeout(r, SEEDER_CYCLE_PAUSE_MS));
    } catch (e) {
      console.error('[Seeder] Cycle error:', e.message);
      seederStatus.running = false;
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

module.exports = { startBackgroundSeeder, runSeedCycle, seederStatus };
