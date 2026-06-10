/**
 * Podcast seeder — completely separate lead source from YouTube.
 * iTunes Search API: free, no auth, 200 results per query.
 * Every Apple Podcasts-listed show must have <itunes:email> in their RSS feed.
 * Email capture rate: ~70-80% (vs ~10% from YouTube descriptions).
 */

const axios = require('axios');
const { getDb } = require('../models/database');

const SKIP_DOMAINS = new Set([
  'apple.com','google.com','example.com','feedburner.com',
  'podbean.com','buzzsprout.com','anchor.fm','spotify.com',
]);
const PERSONAL_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','me.com','mac.com','live.com','aol.com','protonmail.com']);

// 200 keywords across the same niches as the YouTube seeder
const PODCAST_KEYWORDS = [
  // Business
  'business coaching','entrepreneur podcast','startup founder','agency owner',
  'digital marketing podcast','sales training','leadership podcast',
  'small business tips','freelancing','side hustle','ecommerce',
  'amazon fba','dropshipping','passive income','solopreneur',
  'consulting business','B2B sales','cold outreach','lead generation',
  'personal branding','content marketing','email marketing','affiliate marketing',
  // Finance
  'personal finance','investing podcast','stock market','cryptocurrency',
  'financial advisor','day trading','dividend investing','financial independence',
  'budgeting','debt free','wealth building','real estate investing',
  'retirement planning','tax tips','financial planning','FIRE movement',
  // Fitness & Health
  'fitness coaching','nutrition podcast','weight loss','bodybuilding',
  'yoga podcast','running podcast','wellness podcast','mental health podcast',
  'meditation podcast','holistic health','functional medicine','gut health',
  'sleep tips podcast','stress management','therapy podcast','ADHD podcast',
  // Tech
  'tech podcast','software development','coding podcast','web development',
  'AI tools podcast','cybersecurity podcast','data science podcast',
  'machine learning','startup tech','product management','devops',
  'blockchain podcast','SaaS growth','indie hackers','build in public',
  // Education & Self-improvement
  'self improvement podcast','productivity podcast','mindset coaching',
  'life coaching','personal development','stoicism','morning routine',
  'book summary podcast','learning podcast','career advice','study tips',
  'motivation podcast','goal setting','discipline mindset','deep work',
  // Travel & Lifestyle
  'travel podcast','digital nomad','van life','adventure travel',
  'expat podcast','minimalism podcast','sustainable living','slow living',
  'lifestyle podcast','daily vlog podcast','morning routine podcast',
  // Creative
  'photography podcast','filmmaking podcast','music production podcast',
  'graphic design podcast','art podcast','writing podcast','author podcast',
  'creative business','storytelling podcast','content creation',
  // Parenting & Family
  'parenting podcast','mom podcast','dad podcast','family podcast',
  'homeschool podcast','pregnancy podcast','relationship advice podcast',
  'marriage tips podcast','dating advice podcast',
  // Food
  'food podcast','cooking podcast','chef podcast','nutrition podcast',
  'vegan podcast','baking podcast','restaurant business podcast',
  // Real Estate & Law
  'real estate podcast','property investing','house flipping podcast',
  'airbnb hosting','landlord podcast','legal advice podcast',
  'attorney podcast','immigration podcast','business law',
  // Sports & Outdoors
  'sports coaching podcast','basketball training','golf podcast',
  'cycling podcast','running coach','triathlon podcast','hiking podcast',
  'homesteading podcast','farming podcast','gardening podcast',
  // Spiritual & Mindfulness
  'spirituality podcast','manifestation podcast','astrology podcast',
  'mindfulness podcast','law of attraction','yoga spirituality',
  // Kids & Language
  'parenting education podcast','children learning podcast',
  'language learning podcast','ESL podcast','polyglot',
  // Pets & Cars
  'dog training podcast','pet care podcast','automotive podcast',
  'car review podcast','electric vehicle podcast',
  // Gaming & Entertainment
  'gaming podcast','esports podcast','movie review podcast',
  'comedy podcast','true crime podcast','news podcast','history podcast',
  'science podcast','mythology podcast',
  // Niche business
  'print on demand','etsy seller tips','virtual assistant','copywriting',
  'funnel building','youtube growth','instagram growth','tiktok growth',
  'brand deals','sponsorship podcast','influencer marketing',
  'social media manager','community building',
];

const podcastSeederStatus = {
  running: false,
  lastCycleAt: null,
  lastCycleSaved: 0,
  totalCycles: 0,
  currentKeyword: null,
};

function extractEmailFromXML(xml) {
  // <itunes:email> is the standard podcast contact email
  const itunesMatch = xml.match(/<itunes:email>\s*([^<\s]+@[^<\s]+)\s*<\/itunes:email>/i);
  if (itunesMatch) {
    const e = itunesMatch[1].toLowerCase().trim();
    const domain = e.split('@')[1];
    if (domain && !SKIP_DOMAINS.has(domain) && e.includes('.')) return e;
  }
  // Fallback: <managingEditor> tag
  const editorMatch = xml.match(/<managingEditor>\s*([^\s<]+@[^\s<]+)/i);
  if (editorMatch) {
    const e = editorMatch[1].replace(/^.*?([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}).*/i, '$1').toLowerCase();
    const domain = e.split('@')[1];
    if (domain && !SKIP_DOMAINS.has(domain)) return e;
  }
  // Fallback: mailto: anywhere in RSS
  const mailtoMatch = xml.match(/mailto:([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
  if (mailtoMatch) {
    const e = mailtoMatch[1].toLowerCase();
    const domain = e.split('@')[1];
    if (domain && !SKIP_DOMAINS.has(domain)) return e;
  }
  return null;
}

function extractWebsiteFromXML(xml) {
  const match = xml.match(/<link>(?!https?:\/\/(?:www\.)?(?:apple|podcast|itunes|feeds|anchor|spotify|buzzsprout|libsyn|podbean|soundcloud|simplecast|transistor|captivate|podcastics|rss\.com))([^<]+)<\/link>/i);
  return match ? match[1].trim() : null;
}

async function getEmailFromFeed(feedUrl) {
  try {
    const { data: xml } = await axios.get(feedUrl, {
      timeout: 6000,
      maxRedirects: 3,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastBot/1.0)' },
      responseType: 'text',
    });
    const email = extractEmailFromXML(xml);
    const website = extractWebsiteFromXML(xml);
    return { email, website };
  } catch { return { email: null, website: null }; }
}

async function searchItunesPodcasts(keyword, limit = 200) {
  try {
    const { data } = await axios.get('https://itunes.apple.com/search', {
      params: { term: keyword, media: 'podcast', entity: 'podcast', limit, country: 'us' },
      timeout: 10000,
    });
    return (data.results || []).filter(p => p.feedUrl && p.collectionId);
  } catch { return []; }
}

async function runPodcastCycle() {
  const db = getDb();
  const INSERT = db.prepare(`
    INSERT OR IGNORE INTO master_leads
      (channel_id, channel_name, channel_handle, subscriber_count, avg_views,
       email, website, channel_description, lead_score, temperature, country, niche)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const shuffled = [...PODCAST_KEYWORDS].sort(() => Math.random() - 0.5);
  let totalSaved = 0;
  podcastSeederStatus.running = true;

  for (const keyword of shuffled) {
    podcastSeederStatus.currentKeyword = keyword;

    const podcasts = await searchItunesPodcasts(keyword, 200);
    if (!podcasts.length) continue;

    // Process 8 podcasts at a time — fetch RSS feeds in parallel
    const CONCURRENCY = 8;
    for (let i = 0; i < podcasts.length; i += CONCURRENCY) {
      const batch = podcasts.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(p => getEmailFromFeed(p.feedUrl))
      );

      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        if (r.status !== 'fulfilled' || !r.result?.email) {
          // also handle fulfilled with no email
          const val = r.status === 'fulfilled' ? r.value : null;
          if (!val?.email) continue;
        }
        const { email, website } = r.value || {};
        if (!email) continue;

        const p = batch[j];
        const niche = guessNiche(keyword);
        const isPersonal = PERSONAL_DOMAINS.has(email.split('@')[1]);
        try {
          const res = INSERT.run(
            `podcast:${p.collectionId}`,
            p.collectionName || p.trackName || 'Unknown Podcast',
            p.artistName || null,
            0, 0,
            email,
            website || p.collectionViewUrl || null,
            (p.description || p.shortDescription || '').substring(0, 400),
            isPersonal ? 50 : 65,
            'cold',
            p.country || null,
            niche
          );
          if (res.changes > 0) totalSaved++;
        } catch {}
      }
    }

    // Short pause between keywords — iTunes rate limit is generous but be polite
    await new Promise(r => setTimeout(r, 300));
  }

  podcastSeederStatus.running = false;
  podcastSeederStatus.lastCycleAt = new Date().toISOString();
  podcastSeederStatus.lastCycleSaved = totalSaved;
  podcastSeederStatus.totalCycles++;

  const total = db.prepare('SELECT COUNT(*) as c FROM master_leads').get().c;
  console.log(`[PodcastSeeder] Cycle done — +${totalSaved} new leads | DB total: ${total}`);

  if (totalSaved > 0) {
    try {
      const { pushToTurso } = require('./tursoSync');
      const newLeads = db.prepare(
        `SELECT * FROM master_leads WHERE channel_id LIKE 'podcast:%' ORDER BY id DESC LIMIT ?`
      ).all(Math.min(totalSaved * 2, 500));
      pushToTurso(newLeads).catch(() => {});
    } catch {}
  }

  return totalSaved;
}

function guessNiche(keyword) {
  const k = keyword.toLowerCase();
  if (/business|entrepreneur|agency|sales|marketing|freelanc|ecommerce|amazon|dropship|passive|solopreneur|consulting|outreach|brand|affiliate|funnel|email market|sponsorship|influencer/.test(k)) return 'business';
  if (/financ|invest|stock|crypto|trading|wealth|budget|debt|retire|tax|fire movement|dividend/.test(k)) return 'finance';
  if (/fitness|workout|nutrition|weight|yoga|running|wellness|bodybuilding|health/.test(k)) return 'fitness';
  if (/mental health|therapy|meditation|mindfulness|anxiety|depression|adhd|spiritual|manifest|astrology/.test(k)) return 'health';
  if (/tech|software|coding|web dev|ai |cyber|data science|machine learning|saas|devops|blockchain|product management/.test(k)) return 'tech';
  if (/travel|nomad|van life|expat|adventure|backpack/.test(k)) return 'travel';
  if (/real estate|property|house flip|airbnb|landlord/.test(k)) return 'realestate';
  if (/law|attorney|legal|immigration/.test(k)) return 'law';
  if (/cooking|food|chef|vegan|baking|restaurant|nutrition/.test(k)) return 'cooking';
  if (/parenting|mom|dad|family|homeschool|pregnancy|marriage|dating|relationship/.test(k)) return 'family';
  if (/photo|film|music|design|art|writing|author|creative|storytell|content creat/.test(k)) return 'creative';
  if (/gaming|esports/.test(k)) return 'gaming';
  if (/sport|basketball|golf|cycling|triathlon|hiking/.test(k)) return 'sports';
  if (/podcast|interview|comedy|true crime|news|history|science|mythology/.test(k)) return 'podcast';
  if (/learning|language|esl|polyglot/.test(k)) return 'language';
  if (/pet|dog|cat/.test(k)) return 'pets';
  if (/car|automotive|electric vehicle/.test(k)) return 'automotive';
  if (/homestead|farming|gardening/.test(k)) return 'homesteading';
  if (/self improv|productivity|mindset|life coach|personal dev|stoic|discipline|goal|deep work|motivation/.test(k)) return 'motivation';
  return 'podcast';
}

async function startPodcastSeeder() {
  console.log('[PodcastSeeder] Started — iTunes API, no quota limits');
  while (true) {
    try {
      await runPodcastCycle();
      await new Promise(r => setTimeout(r, 15000)); // 15s between cycles
    } catch (e) {
      console.error('[PodcastSeeder] Cycle error:', e.message);
      podcastSeederStatus.running = false;
      await new Promise(r => setTimeout(r, 60000));
    }
  }
}

module.exports = { startPodcastSeeder, podcastSeederStatus };
