const axios = require('axios');
const { scoreLeadFromReddit, getTemperature } = require('../utils/scoring');

const TARGET_SUBREDDITS = [
  'NewTubers', 'youtubers', 'SmallYoutubers', 'videography',
  'podcast', 'entrepreneur', 'ContentCreators', 'marketing',
  'videoproduction', 'filmmakers',
];

const PAIN_KEYWORDS = [
  'my channel', 'not growing', "can't grow", 'views dropped', 'low views',
  'struggling', 'editing takes', 'need editor', 'looking for editor',
  'rate my channel', 'channel feedback', 'why is my', 'help me grow',
  'video quality', 'no views', 'inconsistent', 'burnout', 'too much time',
];

let tokenCache = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (tokenCache && Date.now() < tokenExpiry) return tokenCache;

  const { getSetting } = require('../models/database');
  const dbClientId = getSetting('reddit_client_id');
  const dbClientSecret = getSetting('reddit_client_secret');
  const REDDIT_CLIENT_ID = (dbClientId && dbClientId !== 'placeholder') ? dbClientId : process.env.REDDIT_CLIENT_ID;
  const REDDIT_CLIENT_SECRET = (dbClientSecret && dbClientSecret !== 'placeholder') ? dbClientSecret : process.env.REDDIT_CLIENT_SECRET;
  const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'ContentCrafterzz/1.0';
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || REDDIT_CLIENT_ID === 'placeholder') throw new Error('Reddit credentials not configured');

  const res = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      auth: { username: REDDIT_CLIENT_ID, password: REDDIT_CLIENT_SECRET },
      headers: { 'User-Agent': REDDIT_USER_AGENT || 'ContentCrafterzz/1.0' },
    }
  );

  tokenCache = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return tokenCache;
}

async function searchPosts(keyword, subreddits = TARGET_SUBREDDITS, limit = 50) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': process.env.REDDIT_USER_AGENT || 'ContentCrafterzz/1.0',
  };

  const leads = [];
  const seen = new Set();

  for (const sub of subreddits) {
    try {
      const res = await axios.get(`https://oauth.reddit.com/r/${sub}/search`, {
        headers,
        params: { q: keyword, sort: 'new', limit: 25, restrict_sr: true, t: 'month' },
      });

      for (const post of res.data.data.children) {
        const d = post.data;
        if (seen.has(d.author)) continue;

        const isPainPost = PAIN_KEYWORDS.some(kw =>
          d.title.toLowerCase().includes(kw) || d.selftext?.toLowerCase().includes(kw)
        );
        if (!isPainPost) continue;

        seen.add(d.author);

        const ytLink = extractYouTubeLink(d.selftext + ' ' + d.url);
        const channelId = ytLink ? extractChannelId(ytLink) : null;

        const lead = {
          platform: 'reddit',
          channel_name: d.author,
          reddit_username: d.author,
          reddit_post_title: d.title.substring(0, 500),
          reddit_post_content: d.selftext?.substring(0, 2000) || '',
          reddit_subreddit: sub,
          channel_id: channelId,
          email: null,
          website: ytLink,
          pain_points: JSON.stringify([{ id: 'self_reported', label: 'Self-reported growth struggle', severity: 'high' }]),
        };

        lead.lead_score = scoreLeadFromReddit(lead);
        lead.temperature = getTemperature(lead.lead_score);

        leads.push(lead);
        if (leads.length >= limit) return leads;
      }
    } catch (e) {
      console.warn(`Reddit search failed for r/${sub}:`, e.message);
    }
  }

  return leads;
}

function extractYouTubeLink(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|c\/|user\/|@)[^\s)"'>]+/);
  return match ? match[0] : null;
}

function extractChannelId(url) {
  const match = url.match(/\/channel\/(UC[\w-]{22})/);
  return match ? match[1] : null;
}

async function testCredentials() {
  try {
    const token = await getAccessToken();
    return { ok: !!token };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { searchPosts, testCredentials, TARGET_SUBREDDITS };
