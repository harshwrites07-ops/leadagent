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
  // Disposable/temp-mail domains — these often have valid MX records, so an MX
  // check alone wouldn't catch them; a real send would just bounce or vanish.
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'getnada.com', 'fakeinbox.com', 'sharklasers.com', 'dispostable.com',
  'maildrop.cc', 'mintemail.com', 'mailnesia.com',
]);

// Asset-filename "TLDs" that the email regex mistakes for a real domain suffix
// — e.g. "logo@2x.png" (a retina image filename) parses as user=logo, domain=2x, tld=png.
const NON_EMAIL_TLDS = new Set(['png','jpg','jpeg','gif','webp','svg','bmp','ico','pdf','css','js','mp4','mov','avi','woff','woff2','ttf']);

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

// Image/asset extensions that the email regex mistakes for a real TLD — e.g.
// "logo@2x.png" (a retina image filename) parses as user=logo, domain=2x, tld=png.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'css', 'js']);

// True if `domainFull` (the part after "@", e.g. "2x.png") is itself a
// retina-density marker like "2x"/"3x" — the "@" here is a CSS/HTML asset
// separator, not an email separator, regardless of what extension follows.
function isRetinaMarkerDomain(domainFull) {
  const firstLabel = domainFull.split('.')[0];
  return /^\d+x$/i.test(firstLabel);
}

// True if the text immediately after the matched email is another ".ext"
// token with no separating whitespace/punctuation — the "hash.png@1f.png"
// shape (an emoji/flag sprite filename keyed by Unicode codepoint) matches
// the email regex once, but leaves a second extension dangling right after,
// which a real email address never would.
function isFollowedByAnotherExtension(remainder) {
  return /^\.[a-zA-Z]{2,6}(?![a-zA-Z0-9])/.test(remainder);
}

// True if this specific match is an image/asset-filename artifact (the bug
// this file's TODO.md entry documents) rather than a real email — checked
// against the *domain* half of an already-locally-sane candidate match.
function isImageBugArtifact(domainFull, afterMatch) {
  const tld = domainFull.split('.').pop()?.toLowerCase();
  if (tld && (IMAGE_EXTENSIONS.has(tld) || NON_EMAIL_TLDS.has(tld))) return true;
  if (isRetinaMarkerDomain(domainFull)) return true;
  if (isFollowedByAnotherExtension(afterMatch)) return true;
  return false;
}

const OBFUSCATION_NORMALIZE = (text) => String(text)
  .replace(/\[at\]/gi, '@').replace(/\(at\)/gi, '@').replace(/\{at\}/gi, '@')
  .replace(/\s+at\s+/gi, '@')
  .replace(/\[dot\]/gi, '.').replace(/\(dot\)/gi, '.').replace(/\{dot\}/gi, '.')
  .replace(/\s+dot\s+/gi, '.');

const EMAIL_MATCH_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const LOCAL_PART_SANITY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function extractEmail(text) {
  if (!text) return null;
  const normalized = OBFUSCATION_NORMALIZE(text);
  const matches = [...normalized.matchAll(EMAIL_MATCH_RE)];
  for (const m of matches) {
    const raw = m[0];
    let e = raw;
    e = e.replace(/^[^a-zA-Z0-9]+/, '').replace(/^[A-Z]{2,}-/i, '');
    if (/^[a-z][A-Z]/.test(e)) e = e.slice(1);
    if (!LOCAL_PART_SANITY_RE.test(e)) continue;

    const domainFull = e.split('@')[1];
    const afterMatch = normalized.slice(m.index + raw.length);
    if (isImageBugArtifact(domainFull, afterMatch)) continue;

    const domain = domainFull.toLowerCase();
    if (SKIP_EMAIL_DOMAINS.has(domain)) continue;
    return e.toLowerCase();
  }
  return null;
}

// For the one-time purge script (purgeCorruptEmails.js): true if `storedValue`
// (an existing DB email column, treated as scraped text) contains at least
// one otherwise-plausible email-shaped match that is rejected *specifically*
// because of the image-extraction bug (asset-extension TLD, retina-density
// marker, or a trailing second extension) — as opposed to being invalid for
// any other, unrelated reason (e.g. malformed local part). This is what lets
// the purge script fix exactly the rows this bug corrupted, nothing else.
function isImageBugCorruptedEmail(storedValue) {
  if (!storedValue) return false;
  const normalized = OBFUSCATION_NORMALIZE(storedValue);
  const matches = [...normalized.matchAll(EMAIL_MATCH_RE)];
  for (const m of matches) {
    const raw = m[0];
    let e = raw;
    e = e.replace(/^[^a-zA-Z0-9]+/, '').replace(/^[A-Z]{2,}-/i, '');
    if (/^[a-z][A-Z]/.test(e)) e = e.slice(1);
    if (!LOCAL_PART_SANITY_RE.test(e)) continue; // not a plausible match even under the old rules — not this bug

    const domainFull = e.split('@')[1];
    const afterMatch = normalized.slice(m.index + raw.length);
    if (isImageBugArtifact(domainFull, afterMatch)) return true;
  }
  return false;
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

// Community tab post text — for hiring/apology-language scanning (Session
// 1.3). Follows the same resilience pattern as getChannelVideos(): degrades
// to [] on any failure rather than throwing, since InnerTube is an
// unofficial, undocumented API that can change shape without notice.
async function fetchCommunityPosts(channelId, limit = 10) {
  try {
    const data = await itPost('browse', {
      browseId: channelId,
      params: 'Egljb21tdW5pdHnyBgQKAkoA', // community tab
    });

    const posts = [];
    const renderers = walkForType(data, ['backstagePostThreadRenderer', 'postRenderer', 'backstagePostRenderer']);
    for (const r of renderers) {
      const post = r.post || r.backstagePostRenderer || r;
      const postId = post.postId || post.contentId || null;
      const text = (post.contentText?.runs || []).map(run => run.text || '').join('') || post.contentText?.simpleText || '';
      if (!text) continue;
      posts.push({
        postId,
        text,
        url: postId ? `https://www.youtube.com/post/${postId}` : null,
      });
      if (posts.length >= limit) break;
    }
    return posts;
  } catch (e) {
    console.error(`[InnerTube] community posts error ${channelId}: ${e.message}`);
    try {
      const { recordScraperHealth } = require('./scraperHealth');
      await recordScraperHealth('innertube_community', { attempted: 1, succeeded: 0, failed: 1, sampleError: e.message });
    } catch {}
    return [];
  }
}

// Featured/related channels shown on a channel's "Channels" tab (graph-walk
// crawler, Session 2.1). Same resilience pattern as getChannelVideos()/
// fetchCommunityPosts() — an undocumented API param can drift without
// notice, so any parse failure degrades to [] rather than throwing or
// fabricating a match.
async function discoverFeaturedChannels(channelId, limit = 10) {
  try {
    const data = await itPost('browse', {
      browseId: channelId,
      params: 'EgxjaGFubmVsc5oBBQoDggEA', // channels tab
    });
    const found = [];
    const renderers = walkForType(data, ['channelRenderer', 'gridChannelRenderer']);
    for (const r of renderers) {
      const id = r.channelId;
      if (!id) continue;
      const title = r.title?.simpleText || r.title?.runs?.[0]?.text || '';
      found.push({ channelId: id, title });
      if (found.length >= limit) break;
    }
    return found;
  } catch (e) {
    console.error(`[InnerTube] featured channels error ${channelId}: ${e.message}`);
    return [];
  }
}

// Channel links (usually posted in the About tab) — social/collab links can
// reference another creator's channel directly.
async function discoverAboutLinks(channelId) {
  try {
    const data = await itPost('browse', { browseId: channelId });
    const found = [];
    const linkNodes = walkForType(data, ['channelExternalLinkViewModel']);
    for (const node of linkNodes) {
      const url = node.link?.content || node.link?.url || '';
      const channelMatch = url.match(/youtube\.com\/(channel\/UC[\w-]{22}|@[\w.-]+)/);
      if (channelMatch) found.push({ url, ref: channelMatch[1] });
    }
    return found;
  } catch (e) {
    console.error(`[InnerTube] about links error ${channelId}: ${e.message}`);
    return [];
  }
}

// Collab partners mentioned in video titles — "ft. X", "feat. X", "w/ X",
// or a bare "@handle" mention. Pure text parsing, no network call.
function extractCollabMentions(videos) {
  const patterns = [
    /\bft\.?\s+([A-Z][\w. ]{2,30})/i,
    /\bfeat\.?\s+([A-Z][\w. ]{2,30})/i,
    /\bw\/\s+([A-Z][\w. ]{2,30})/i,
  ];
  const mentions = new Set();
  for (const v of (videos || [])) {
    const title = v.title || '';
    for (const p of patterns) {
      const m = title.match(p);
      if (m) mentions.add(m[1].trim().replace(/[.,!?]+$/, ''));
    }
    const handleMatches = title.match(/@[\w.-]{3,30}/g) || [];
    for (const h of handleMatches) mentions.add(h);
  }
  return [...mentions];
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

// ─── Fast seeder search — videos only, 1 browse per channel (no video data) ──
// Searches for VIDEOS (not channels) so results change every call as new videos
// are uploaded. Channel filter EgIQAg%3D%3D always returns the same top channels.
async function fastSeedSearch(keyword, maxChannels = 30) {
  const seen = new Set();
  const channelBasics = [];

  let data;
  try {
    data = await itPost('search', { query: keyword }); // no params = video results
  } catch (e) {
    console.error(`[InnerTube/fast] search error (${keyword}): ${e.message}`);
    return [];
  }

  const videoRenderers = walkForType(data, ['videoRenderer', 'compactVideoRenderer']);
  for (const vr of videoRenderers) {
    // Channel ID lives in different spots depending on YouTube's current renderer version
    const endpoint = vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
      || vr.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
      || vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
    const channelId = endpoint?.browseId;
    const handle = endpoint?.canonicalBaseUrl || null;
    const channelName = vr.shortBylineText?.runs?.[0]?.text
      || vr.longBylineText?.runs?.[0]?.text
      || vr.ownerText?.runs?.[0]?.text || '';

    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);
    channelBasics.push({ channelId, channelName, handle });
    if (channelBasics.length >= maxChannels) break;
  }

  if (!channelBasics.length) return [];

  // Lightweight browse — just description + subs, skip video tab entirely
  const CONCURRENCY = 5;
  const results = [];

  for (let i = 0; i < channelBasics.length; i += CONCURRENCY) {
    const batch = channelBasics.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(async (basic) => {
      try {
        const browseData = await itPost('browse', { browseId: basic.channelId });
        const meta = browseData.metadata?.channelMetadataRenderer || {};
        const description = meta.description || '';
        const country = meta.country || null;

        // Subscriber count — try both header formats
        let subscriberCount = 0;
        const c4 = browseData.header?.c4TabbedHeaderRenderer;
        if (c4) subscriberCount = parseCount(c4.subscriberCountText?.simpleText || '');
        if (!subscriberCount) {
          const ph = browseData.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
          if (ph) {
            const parts = (ph.metadata?.contentMetadataViewModel?.metadataRows || [])
              .flatMap(r => r.metadataParts || [])
              .map(p => p.text?.content || '');
            const subsPart = parts.find(t => t.toLowerCase().includes('subscriber'));
            if (subsPart) subscriberCount = parseCount(subsPart);
          }
        }

        const email = extractEmail(description);
        return { ...basic, description, subscriberCount, country, email };
      } catch { return null; }
    }));

    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    await sleep(200);
  }

  return results;
}

module.exports = {
  searchChannels, searchChannelsMulti, buildChannelProfile, fastSeedSearch, extractEmail, isImageBugCorruptedEmail,
  fetchCommunityPosts, discoverFeaturedChannels, discoverAboutLinks, extractCollabMentions, getChannelVideos, getChannelMeta,
};
