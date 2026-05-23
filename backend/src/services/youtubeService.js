const axios = require('axios');
const path = require('path');
const { scoreLeadFromYouTube, getTemperature } = require('../utils/scoring');
const { detectPainPoints } = require('../utils/painPoints');

const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const ENV_PATH = path.join(__dirname, '../../../.env');

// ─── Key rotation pool ─────────────────────────────────────────────────────────
const exhaustedKeys = new Set();
let resetTimer = null;

function getAllKeys() {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`YOUTUBE_API_KEY_${i}`];
    if (k && k !== 'placeholder') keys.push(k);
  }
  const legacy = process.env.YOUTUBE_API_KEY;
  if (legacy && legacy !== 'placeholder' && !keys.includes(legacy)) keys.push(legacy);
  return keys;
}

function getKey() {
  const keys = getAllKeys();
  if (!keys.length) throw new Error('YouTube API key not configured. Add your key in Settings.');
  const active = keys.find(k => !exhaustedKeys.has(k));
  if (!active) {
    const err = new Error('All YouTube API keys have exceeded today\'s quota. Resets at midnight Pacific Time.');
    err.response = { status: 429, data: { error: err.message } };
    throw err;
  }
  return active;
}

function markExhausted(key) {
  exhaustedKeys.add(key);
  if (!resetTimer) {
    resetTimer = setTimeout(() => {
      exhaustedKeys.clear();
      resetTimer = null;
      console.log('[YouTube] Quota reset — all keys re-enabled');
    }, 24 * 60 * 60 * 1000);
  }
  const remaining = getAllKeys().filter(k => !exhaustedKeys.has(k)).length;
  console.log(`[YouTube] Key ${key.substring(0, 12)}... exhausted. ${remaining} key(s) remaining.`);
}

async function ytGet(endpoint, params) {
  const keys = getAllKeys().filter(k => !exhaustedKeys.has(k));
  if (!keys.length) {
    const err = new Error('All YouTube API keys have exceeded today\'s quota. Resets at midnight Pacific Time.');
    err.response = { status: 429, data: { error: err.message } };
    throw err;
  }
  for (const key of keys) {
    try {
      return await axios.get(`${YT_BASE}${endpoint}`, { params: { ...params, key } });
    } catch (e) {
      const reason = e.response?.data?.error?.errors?.[0]?.reason;
      const isQuotaError = reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded';
      if (isQuotaError) { markExhausted(key); continue; }
      throw e;
    }
  }
  const err = new Error('All YouTube API keys have exceeded today\'s quota. Resets at midnight Pacific Time.');
  err.response = { status: 429, data: { error: err.message } };
  throw err;
}

// ─── Search ────────────────────────────────────────────────────────────────────

async function searchChannels({ keyword, minSubs = 5000, maxSubs = 500000, country, maxResults = 50, emailOnly = true }) {
  maxResults = Math.min(maxResults, 200);
  console.log(`[YouTube] searchChannels — "${keyword}" subs:${minSubs}-${maxSubs} max:${maxResults}`);

  let searchRes;
  try {
    searchRes = await ytGet('/search', {
      part: 'snippet',
      type: 'channel',
      q: keyword,
      maxResults: 50,
      regionCode: country || undefined,
    });
  } catch (e) {
    console.error(`[YouTube] search error: ${e.message}`);
    throw e;
  }

  const channelIds = (searchRes.data.items || []).map(i => i.id.channelId || i.snippet.channelId).filter(Boolean);
  if (!channelIds.length) return [];
  return enrichChannels(channelIds, minSubs, maxSubs, maxResults, emailOnly);
}

// Searches multiple keywords in parallel — returns combined deduplicated leads
async function searchChannelsMulti(keywords, options = {}) {
  const { minSubs = 5000, maxSubs = 500000, maxResults = 50, emailOnly = true } = options;
  const seen = new Set();

  const results = await Promise.allSettled(
    keywords.map(kw => searchChannels({ keyword: kw, minSubs, maxSubs, maxResults, emailOnly }))
  );

  const all = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const lead of r.value) {
      if (!seen.has(lead.channel_id)) {
        seen.add(lead.channel_id);
        all.push(lead);
      }
    }
  }
  return all;
}

// ─── Enrich channels — EMAIL-FIRST + PARALLEL ─────────────────────────────────

async function enrichChannels(channelIds, minSubs, maxSubs, maxResults, emailOnly = true) {
  const leads = [];

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    let statsRes;
    try {
      statsRes = await ytGet('/channels', {
        part: 'snippet,statistics,brandingSettings,topicDetails,contentDetails',
        id: batch.join(','),
      });
    } catch (e) {
      const reason = e.response?.data?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || e.response?.status === 429) throw e;
      continue;
    }

    const items = statsRes.data.items || [];

    // 1. Subscriber filter (free — data already in hand)
    const subFiltered = items.filter(ch => {
      const subs = parseInt(ch.statistics.subscriberCount || '0');
      return subs >= minSubs && subs <= maxSubs;
    });

    // 2. EMAIL-FIRST: check email before doing expensive video API calls
    //    If emailOnly=true and no email found → skip entirely (saves 2 API calls per channel)
    const emailChecked = [];
    for (const ch of subFiltered) {
      const descEmail = extractEmail(ch.snippet?.description || '');
      if (descEmail) {
        emailChecked.push({ ch, earlyEmail: descEmail });
        continue;
      }
      if (emailOnly) {
        // Quick page scrape — 1 HTTP call, way cheaper than 2 YouTube API calls
        const handle = ch.snippet?.customUrl || null;
        const scraped = await scrapeEmailFromPage(handle, ch.id);
        if (scraped) {
          emailChecked.push({ ch, earlyEmail: scraped });
        }
        // No email found anywhere → skip, no video stats wasted
      } else {
        emailChecked.push({ ch, earlyEmail: null });
      }
    }

    // 3. PARALLEL: build full profiles 5 at a time (video stats + scoring)
    const CONCURRENCY = 5;
    for (let j = 0; j < emailChecked.length; j += CONCURRENCY) {
      if (leads.length >= maxResults) break;
      const concurrent = emailChecked.slice(j, j + CONCURRENCY);
      const settled = await Promise.allSettled(
        concurrent.map(({ ch, earlyEmail }) => buildChannelProfile(ch, earlyEmail))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          leads.push(r.value);
          if (leads.length >= maxResults) return leads;
        }
      }
    }
  }

  console.log(`[YouTube] enrichChannels done — ${leads.length} qualified leads`);
  return leads;
}

// ─── Channel profile builder ──────────────────────────────────────────────────

async function buildChannelProfile(ch, earlyEmail = null) {
  const subs = parseInt(ch.statistics?.subscriberCount || '0');
  const totalVideos = parseInt(ch.statistics?.videoCount || '0');

  let uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    try {
      const r = await ytGet('/channels', { part: 'contentDetails', id: ch.id });
      uploadsPlaylistId = r.data.items[0]?.contentDetails?.relatedPlaylists?.uploads;
    } catch {}
  }

  // Fetch playlist + email in parallel
  const [plRes, resolvedEmail] = await Promise.all([
    uploadsPlaylistId
      ? ytGet('/playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 5 })
          .catch(() => ({ data: { items: [] } }))
      : Promise.resolve({ data: { items: [] } }),
    // Resolve email: use early result if available, otherwise try description then page scrape
    earlyEmail
      ? Promise.resolve(earlyEmail)
      : (async () => {
          const fromDesc = extractEmail(ch.snippet?.description || '');
          if (fromDesc) return fromDesc;
          return scrapeEmailFromPage(ch.snippet?.customUrl || null, ch.id);
        })(),
  ]);

  const videoIds = plRes.data.items.map(v => v.contentDetails.videoId).filter(Boolean);

  let recentVideos = [];
  let avgViews = 0, avgLikes = 0, avgComments = 0, uploadFreqDays = 0, lastUploadDate = null;

  if (videoIds.length) {
    try {
      const videoStats = await ytGet('/videos', { part: 'statistics,snippet', id: videoIds.join(',') });
      recentVideos = videoStats.data.items.map(v => ({
        id: v.id, title: v.snippet.title,
        views: parseInt(v.statistics.viewCount || '0'),
        likes: parseInt(v.statistics.likeCount || '0'),
        comments: parseInt(v.statistics.commentCount || '0'),
        date: v.snippet.publishedAt,
      }));
      if (recentVideos.length) {
        avgViews    = recentVideos.reduce((a, v) => a + v.views, 0)    / recentVideos.length;
        avgLikes    = recentVideos.reduce((a, v) => a + v.likes, 0)    / recentVideos.length;
        avgComments = recentVideos.reduce((a, v) => a + v.comments, 0) / recentVideos.length;
        lastUploadDate = recentVideos[0]?.date || null;
        if (recentVideos.length >= 2) {
          const span = (new Date(recentVideos[0].date) - new Date(recentVideos[recentVideos.length - 1].date)) / (1000 * 60 * 60 * 24);
          uploadFreqDays = span / (recentVideos.length - 1);
        }
      }
    } catch {}
  }

  const email = resolvedEmail || null;
  const engagementRate = subs > 0 ? ((avgLikes + avgComments) / subs) * 100 : 0;
  const mostViewed = recentVideos.length ? recentVideos.reduce((a, b) => a.views > b.views ? a : b) : {};
  const description = ch.snippet?.description || '';
  const website = extractWebsite(description, ch.brandingSettings?.channel?.unsubscribedTrailer);

  const channelData = {
    platform: 'youtube',
    channel_id: ch.id,
    channel_name: ch.snippet?.title || '',
    channel_handle: ch.snippet?.customUrl || null,
    subscriber_count: subs,
    total_videos: totalVideos,
    avg_views: Math.round(avgViews),
    avg_likes: Math.round(avgLikes),
    avg_comments: Math.round(avgComments),
    engagement_rate: parseFloat(engagementRate.toFixed(2)),
    upload_frequency_days: parseFloat(uploadFreqDays.toFixed(1)),
    last_upload_date: lastUploadDate,
    channel_description: description.substring(0, 1000),
    channel_tags: JSON.stringify(ch.topicDetails?.topicCategories?.map(t => t.split('/').pop()) || []),
    recent_videos: JSON.stringify(recentVideos.slice(0, 10)),
    most_viewed_video: JSON.stringify({ title: mostViewed.title, views: mostViewed.views }),
    country: ch.snippet?.country || null,
    email: email,
    website: website || null,
    social_links: JSON.stringify({}),
    thumbnail_url: ch.snippet?.thumbnails?.medium?.url || null,
  };

  const painPoints = detectPainPoints({ ...channelData, recent_videos: recentVideos });
  channelData.pain_points = JSON.stringify(painPoints);
  const score = scoreLeadFromYouTube(channelData);
  channelData.lead_score = score;
  channelData.temperature = getTemperature(score);

  if (email) console.log(`[YouTube] KEEP ${channelData.channel_name} — ${subs.toLocaleString()} subs — ${email}`);

  return channelData;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function extractEmail(text) {
  // Match all emails in text, then pick the cleanest one
  const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]);
  for (const raw of all) {
    // Strip known garbage prefixes that creep in from surrounding text
    // e.g. "ninfo@..." (letter+lowercase), "CONTACT-foo@...", "-foo@..."
    let email = raw;
    email = email.replace(/^[^a-zA-Z0-9]+/, '');            // strip leading non-alphanumeric
    email = email.replace(/^[A-Z]{2,}-/i, '');              // strip ALL-CAPS- prefix like CONTACT-, EMAIL-
    // If starts with single lowercase letter + capital (scraping artifact: "nFoo@" → "foo@")
    if (/^[a-z][A-Z]/.test(email)) email = email.slice(1);
    // Validate the cleaned result
    if (/^[a-zA-Z0-9][a-zA-Z0-9._%+\-]{1,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return email.toLowerCase();
    }
  }
  return null;
}

const SYSTEM_DOMAINS = ['youtube.com', 'google.com', 'googlemail.com', 'googleapis.com', 'gstatic.com', 'ggpht.com', 'ytimg.com', 'sentry.io'];

async function scrapeEmailFromPage(handle, channelId) {
  const urls = [];
  if (handle) urls.push(`https://www.youtube.com/${handle}/about`);
  if (channelId) urls.push(`https://www.youtube.com/channel/${channelId}/about`);

  for (const url of urls) {
    try {
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 8000,
      });
      const all = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
      const valid = [...new Set(all)].find(e => !SYSTEM_DOMAINS.some(d => e.toLowerCase().endsWith('@' + d)));
      if (valid) return valid;
    } catch {}
  }
  return null;
}

function extractWebsite(description, trailer) {
  const text = description + ' ' + (trailer || '');
  const match = text.match(/https?:\/\/(?!www\.youtube\.com|youtu\.be|instagram\.com|twitter\.com|facebook\.com)[^\s)>,"]+/);
  return match ? match[0] : null;
}

// ─── Other public methods ──────────────────────────────────────────────────────

async function resolveChannelUrl(input) {
  const raw = input.trim();
  if (/^UC[\w-]{22}$/.test(raw)) return raw;

  let handle = null;
  try {
    let urlStr;
    if (raw.startsWith('http')) urlStr = raw;
    else if (raw.startsWith('www.')) urlStr = `https://${raw}`;
    else if (raw.startsWith('@') || raw.startsWith('UC')) urlStr = `https://youtube.com/${raw}`;
    else urlStr = `https://youtube.com/${raw}`;
    const url = new URL(urlStr);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel' && parts[1]) return parts[1];
    if (parts[0]?.startsWith('@')) handle = parts[0];
    else if (parts[0] === 'c' && parts[1]) handle = `@${parts[1]}`;
    else if (parts[0] === 'user' && parts[1]) handle = parts[1];
    else if (parts[0]) handle = parts[0].startsWith('@') ? parts[0] : `@${parts[0]}`;
  } catch {
    handle = raw.startsWith('@') ? raw : `@${raw}`;
  }

  if (!handle) throw new Error(`Cannot parse YouTube URL: ${input}`);
  if (!handle.startsWith('@')) handle = `@${handle}`;

  try {
    const r = await ytGet('/channels', { part: 'id', forHandle: handle });
    if (r.data.items?.[0]) return r.data.items[0].id;
  } catch {}
  try {
    const username = handle.replace('@', '');
    const r2 = await ytGet('/channels', { part: 'id', forUsername: username });
    if (r2.data.items?.[0]) return r2.data.items[0].id;
  } catch {}
  try {
    const searchName = raw.startsWith('@') ? raw.slice(1) : raw;
    const sr = await ytGet('/search', { part: 'snippet', type: 'channel', q: searchName, maxResults: 1 });
    const found = sr.data.items?.[0];
    if (found) {
      const foundId = found.id?.channelId || found.snippet?.channelId;
      if (foundId) return foundId;
    }
  } catch {}

  throw new Error(`Channel not found: ${input}`);
}

async function getChannelByUrl(input) {
  const channelId = await resolveChannelUrl(input);
  const res = await ytGet('/channels', {
    part: 'snippet,statistics,brandingSettings,topicDetails,contentDetails',
    id: channelId,
  });
  const ch = res.data.items?.[0];
  if (!ch) throw new Error('Channel data not found');
  return buildChannelProfile(ch);
}

async function detectViralChannels(keyword) {
  const searchRes = await ytGet('/search', {
    part: 'snippet', type: 'video', q: keyword, order: 'viewCount', maxResults: 20,
  });
  const viral = [];
  for (const item of searchRes.data.items) {
    const channelId = item.snippet.channelId;
    const profile = await buildChannelProfile({ id: channelId, snippet: item.snippet, statistics: {}, brandingSettings: {} }).catch(() => null);
    if (!profile) continue;
    const recentVideos = JSON.parse(profile.recent_videos || '[]');
    if (recentVideos.length < 2) continue;
    const latestViews = recentVideos[0]?.views || 0;
    const avgOthers = recentVideos.slice(1).reduce((a, v) => a + v.views, 0) / (recentVideos.length - 1);
    if (avgOthers > 0 && latestViews > avgOthers * 5) {
      viral.push({ ...profile, viral_video: recentVideos[0], viral_multiplier: Math.round(latestViews / avgOthers) });
    }
  }
  return viral;
}

async function testApiKey(key) {
  try {
    await axios.get(`${YT_BASE}/videos`, { params: { part: 'snippet', chart: 'mostPopular', maxResults: 1, key } });
    return { ok: true };
  } catch (e) {
    const apiErr = e.response?.data?.error;
    const reason = apiErr?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') return { ok: false, error: 'Quota exceeded — create a NEW Google Cloud project for fresh quota.' };
    if (reason === 'keyInvalid' || e.response?.status === 400) return { ok: false, error: 'Invalid API key — enable YouTube Data API v3 in Google Cloud Console.' };
    return { ok: false, error: (apiErr?.message || e.message || 'Unknown error').replace(/<[^>]+>/g, '') };
  }
}

function getKeyPoolStatus() {
  const keys = getAllKeys();
  return keys.map((k, i) => ({ index: i + 1, preview: `${k.substring(0, 12)}...`, exhausted: exhaustedKeys.has(k) }));
}

module.exports = { searchChannels, searchChannelsMulti, buildChannelProfile, testApiKey, detectViralChannels, resolveChannelUrl, getChannelByUrl, getAllKeys, getKeyPoolStatus };
