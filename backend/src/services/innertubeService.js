const axios = require('axios');
const { scoreLeadFromYouTube, getTemperature } = require('../utils/scoring');
const { detectPainPoints } = require('../utils/painPoints');

const BASE = 'https://www.youtube.com/youtubei/v1';

const CTX = {
  client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en', gl: 'US' },
};

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];
let _uaIdx = 0;
const nextUA = () => UAS[_uaIdx++ % UAS.length];

const SKIP_EMAIL_DOMAINS = new Set([
  'youtube.com', 'google.com', 'googlemail.com', 'googleapis.com',
  'gstatic.com', 'ggpht.com', 'ytimg.com', 'sentry.io',
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Core HTTP ────────────────────────────────────────────────────────────────

async function itPost(endpoint, body, retries = 3) {
  const url = `${BASE}/${endpoint}?prettyPrint=false`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await axios.post(
        url,
        { context: CTX, ...body },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': nextUA(),
            'Accept-Language': 'en-US,en;q=0.9',
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': '2.20250101.00.00',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'Accept': '*/*',
          },
          timeout: 15000,
        }
      );
      return data;
    } catch (e) {
      console.error(`[InnerTube] ERROR attempt ${attempt + 1} on ${endpoint}: status=${e.response?.status} msg=${e.message}`);
      if (e.response?.status === 429 && attempt < retries - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCount(text) {
  if (!text) return 0;
  const s = String(text).toLowerCase().replace(/,/g, '')
    .replace(/subscribers?|views?|videos?/g, '').trim();
  const m = s.match(/^([\d.]+)\s*([kmb]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return isNaN(n) ? 0 : Math.round(n * mult);
}

function extractEmail(text) {
  if (!text) return null;
  const matches = [...String(text).matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
  for (const m of matches) {
    let e = m[0];
    e = e.replace(/^[^a-zA-Z0-9]+/, '').replace(/^[A-Z]{2,}-/i, '');
    if (/^[a-z][A-Z]/.test(e)) e = e.slice(1);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e)) continue;
    const domain = e.split('@')[1]?.toLowerCase();
    if (domain && !SKIP_EMAIL_DOMAINS.has(domain)) return e.toLowerCase();
  }
  return null;
}

async function scrapeEmailFromPage(channelId, handle) {
  const urls = [];
  if (handle) {
    const h = handle.startsWith('@') ? handle : '@' + handle;
    urls.push(`https://www.youtube.com/${h}/about`);
  }
  if (channelId) urls.push(`https://www.youtube.com/channel/${channelId}/about`);

  for (const url of urls) {
    try {
      const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': nextUA(), 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 8000,
      });
      const found = extractEmail(html);
      if (found) return found;
    } catch {}
  }
  return null;
}

function parseDaysAgo(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const n = parseInt(t);
  if (isNaN(n)) return null;
  if (t.includes('second') || t.includes('minute') || t.includes('hour') || t.includes('just now')) return 0;
  if (t.includes('day')) return n;
  if (t.includes('week')) return n * 7;
  if (t.includes('month')) return n * 30;
  if (t.includes('year')) return n * 365;
  return null;
}

// Stack-based object walker — finds all nodes with a given type key
function walkForType(root, typeKeys) {
  const found = [];
  const stack = [root];
  let iters = 0;
  while (stack.length && iters++ < 80000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    for (const key of typeKeys) {
      if (node[key]) { found.push(node[key]); break; }
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return found;
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function searchChannels(keyword, maxCandidates = 200) {
  const channels = [];
  const seen = new Set();
  let continuation = null;
  let pages = 0;
  const maxPages = Math.min(8, Math.ceil(maxCandidates / 15) + 1);

  do {
    let data;
    try {
      data = await itPost('search', continuation
        ? { continuation }
        : { query: keyword, params: 'EgIQAg%3D%3D' }); // channel filter
    } catch (e) {
      console.error(`[InnerTube] search error (${keyword}): ${e.message}`);
      break;
    }

    const renderers = walkForType(data, ['channelRenderer']);
    for (const ch of renderers) {
      const id = ch.channelId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // YouTube swapped field names: videoCountText actually holds subscriber count
      const subsText = ch.videoCountText?.simpleText || ch.subscriberCountText?.simpleText || '';
      channels.push({
        channelId: id,
        name: ch.title?.simpleText || ch.title?.runs?.[0]?.text || '',
        subscriberCount: parseCount(subsText),
        thumbnail: ch.thumbnail?.thumbnails?.slice(-1)[0]?.url || null,
        handle: ch.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || null,
        description: ch.descriptionSnippet?.runs?.map(r => r.text).join('') || '',
      });
    }

    // Find continuation token
    const contCmds = walkForType(data, ['continuationCommand']);
    continuation = contCmds.find(c => c.token)?.token || null;
    pages++;
  } while (continuation && channels.length < maxCandidates && pages < maxPages);

  console.log(`[InnerTube] "${keyword}" → ${channels.length} channel candidates`);
  return channels;
}

// ─── Channel enrichment ───────────────────────────────────────────────────────

async function getChannelMeta(channelId) {
  try {
    const data = await itPost('browse', { browseId: channelId });
    const channelMeta = data.metadata?.channelMetadataRenderer || {};

    let subscriberCount = 0, totalVideos = 0;

    // Old format: c4TabbedHeaderRenderer
    const c4 = data.header?.c4TabbedHeaderRenderer;
    if (c4) {
      subscriberCount = parseCount(c4.subscriberCountText?.simpleText || '');
      totalVideos = parseCount(c4.videosCountText?.runs?.[0]?.text || '');
    }

    // New format: pageHeaderRenderer → pageHeaderViewModel → metadataRows
    const ph = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
    if (ph) {
      const parts = (ph.metadata?.contentMetadataViewModel?.metadataRows || [])
        .flatMap(r => r.metadataParts || [])
        .map(p => p.text?.content || '');
      const subsPart = parts.find(t => t.toLowerCase().includes('subscriber'));
      const vidsPart = parts.find(t => t.toLowerCase().includes('video'));
      if (subsPart) subscriberCount = parseCount(subsPart);
      if (vidsPart) totalVideos = parseCount(vidsPart);
    }


    return {
      description: channelMeta.description || '',
      country: channelMeta.country || null,
      subscriberCount,
      totalVideos,
    };
  } catch (e) {
    console.error(`[InnerTube] meta error ${channelId}: ${e.message}`);
    return {};
  }
}

async function getChannelVideos(channelId) {
  try {
    const data = await itPost('browse', {
      browseId: channelId,
      params: 'EgZ2aWRlb3PyBgQKAjoA', // videos tab
    });

    const videos = [];

    // New format: lockupViewModel (2024+)
    const lockups = walkForType(data, ['lockupViewModel']);
    for (const lvm of lockups) {
      if (!lvm.contentId) continue;
      const meta = lvm.metadata?.lockupMetadataViewModel;
      const title = meta?.title?.content || '';
      const parts = (meta?.metadata?.contentMetadataViewModel?.metadataRows || [])
        .flatMap(r => r.metadataParts || [])
        .map(p => p.text?.content || '');
      const viewsPart = parts.find(t => /view/.test(t.toLowerCase()));
      const datePart = parts.find(t => /ago|hour|day|week|month|year/.test(t.toLowerCase()));
      const views = parseCount(viewsPart || '');
      const daysAgo = parseDaysAgo(datePart || '');
      videos.push({
        id: lvm.contentId,
        title,
        views,
        publishedText: datePart || '',
        date: daysAgo !== null ? new Date(Date.now() - daysAgo * 86400000).toISOString() : null,
      });
      if (videos.length >= 10) break;
    }

    // Old format fallback: videoRenderer / gridVideoRenderer
    if (videos.length === 0) {
      const renderers = walkForType(data, ['videoRenderer', 'gridVideoRenderer']);
      for (const vr of renderers) {
        if (!vr.videoId) continue;
        const viewsText = vr.viewCountText?.simpleText
          || vr.viewCountText?.runs?.map(x => x.text).join('') || '0';
        const pubText = vr.publishedTimeText?.simpleText || '';
        const daysAgo = parseDaysAgo(pubText);
        videos.push({
          id: vr.videoId,
          title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || '',
          views: parseCount(viewsText),
          publishedText: pubText,
          date: daysAgo !== null ? new Date(Date.now() - daysAgo * 86400000).toISOString() : null,
        });
        if (videos.length >= 10) break;
      }
    }

    return videos;
  } catch (e) {
    console.error(`[InnerTube] videos error ${channelId}: ${e.message}`);
    return [];
  }
}

async function buildChannelProfile(basic, options = {}) {
  const { emailOnly = false } = options;

  // Fetch metadata + videos in parallel
  const [meta, videos] = await Promise.all([
    getChannelMeta(basic.channelId),
    getChannelVideos(basic.channelId),
  ]);

  await sleep(300); // rate-limit between profile builds

  const description = meta.description || basic.description || '';

  // Email: description first, then page scrape
  let email = extractEmail(description);
  if (!email) email = await scrapeEmailFromPage(basic.channelId, basic.handle);
  if (emailOnly && !email) return null;

  const subs = basic.subscriberCount || meta.subscriberCount || 0;

  let avgViews = 0, uploadFreqDays = 0, lastUploadDate = null;
  if (videos.length > 0) {
    avgViews = videos.reduce((a, v) => a + v.views, 0) / videos.length;
    lastUploadDate = videos[0]?.date || null;

    if (videos.length >= 2) {
      const daysAgos = videos
        .map(v => parseDaysAgo(v.publishedText))
        .filter(d => d !== null);
      if (daysAgos.length >= 2) {
        const span = daysAgos[daysAgos.length - 1] - daysAgos[0];
        uploadFreqDays = Math.abs(span) / (daysAgos.length - 1);
      }
    }
  }

  const mostViewed = videos.length
    ? videos.reduce((a, b) => a.views > b.views ? a : b)
    : {};

  const channelData = {
    platform: 'youtube',
    channel_id: basic.channelId,
    channel_name: basic.name,
    channel_handle: basic.handle,
    subscriber_count: subs,
    total_videos: meta.totalVideos || 0,
    avg_views: Math.round(avgViews),
    avg_likes: 0,
    avg_comments: 0,
    engagement_rate: 0,
    upload_frequency_days: parseFloat(uploadFreqDays.toFixed(1)),
    last_upload_date: lastUploadDate,
    channel_description: description.substring(0, 1000),
    channel_tags: JSON.stringify([]),
    recent_videos: JSON.stringify(videos),
    most_viewed_video: JSON.stringify({ title: mostViewed.title, views: mostViewed.views }),
    country: meta.country || null,
    email,
    website: null,
    social_links: JSON.stringify({}),
    thumbnail_url: basic.thumbnail || null,
  };

  const painPoints = detectPainPoints({ ...channelData, recent_videos: videos });
  channelData.pain_points = JSON.stringify(painPoints);
  const score = scoreLeadFromYouTube(channelData);
  channelData.lead_score = score;
  channelData.temperature = getTemperature(score);

  return channelData;
}

// ─── Multi-keyword search ─────────────────────────────────────────────────────

async function searchChannelsMulti(keywords, options = {}) {
  const { minSubs = 1000, maxSubs = 500000, maxResults = 50, emailOnly = false, minViews = 0, onProgress } = options;
  const seen = new Set();
  const allBasic = [];

  // Search all keywords with concurrency 3
  const SEARCH_CONCURRENCY = 3;
  for (let i = 0; i < keywords.length; i += SEARCH_CONCURRENCY) {
    const batch = keywords.slice(i, i + SEARCH_CONCURRENCY);
    const perKw = Math.max(30, Math.ceil((maxResults * 3) / keywords.length));
    const results = await Promise.allSettled(batch.map(kw => searchChannels(kw, perKw)));

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const ch of r.value) {
        if (seen.has(ch.channelId)) continue;
        seen.add(ch.channelId);
        // Accept: known subs in range, OR zero (hidden subs — check after enrichment)
        if (ch.subscriberCount === 0 || (ch.subscriberCount >= minSubs && ch.subscriberCount <= maxSubs)) {
          allBasic.push(ch);
        }
      }
    }
  }

  if (onProgress) onProgress(`Found ${allBasic.length} channels, building profiles...`);
  console.log(`[InnerTube] ${allBasic.length} candidates across ${keywords.length} keywords`);

  // Enrich profiles with concurrency 5
  const leads = [];
  const ENRICH_CONCURRENCY = 5;

  for (let i = 0; i < allBasic.length; i += ENRICH_CONCURRENCY) {
    if (leads.length >= maxResults) break;

    const batch = allBasic.slice(i, i + ENRICH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(basic => buildChannelProfile(basic, { emailOnly }))
    );

    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const p = r.value;
      // 0 = channel hides subscriber count — let it through rather than wrongly filtering
      if (p.subscriber_count !== 0 && (p.subscriber_count < minSubs || p.subscriber_count > maxSubs)) continue;
      if (minViews > 0 && p.avg_views < minViews) continue;
      leads.push(p);
      if (leads.length >= maxResults) break;
    }
  }

  console.log(`[InnerTube] done — ${leads.length} qualified leads`);
  return leads;
}

module.exports = { searchChannels, searchChannelsMulti, buildChannelProfile };
