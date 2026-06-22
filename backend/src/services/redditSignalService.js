const https = require('https');
const { getDb } = require('../models/database');

const SUBREDDITS = ['YouTubers', 'YoutubeContent', 'CreatorEconomy', 'NewTubers', 'Filmmakers'];

const ACTIVE_KEYWORDS = [
  'looking for editor', 'need an editor', 'need editor', 'hiring editor',
  'looking for thumbnail', 'need thumbnail', 'hiring designer',
  'looking for video editor', 'looking for a thumbnail designer',
  'want to hire', 'looking to hire', 'need someone to edit',
  'need help with editing', 'editor wanted', 'thumbnail designer wanted',
  'dm me if you edit', 'seeking editor', 'searching for an editor',
  'need a scriptwriter', 'hire a scriptwriter', 'need video production',
  'outsourcing editing', 'looking to outsource',
];

const CURIOUS_KEYWORDS = [
  'should i hire', 'worth hiring', 'do you hire', 'outsource editing',
  'thoughts on hiring', 'considering hiring', 'thinking about hiring',
  'is it worth getting an editor', 'should i get an editor',
  'how do you find editors', 'where do you find editors',
];

const BUDGET_PATTERNS = [
  /\$[\d,]+(?:[\-–][\d,]+)?(?:\s*\/?\s*(?:month|mo|video|week|vide?o))?/gi,
  /[\d,]+\s*(?:dollars?|usd)(?:\s*\/?\s*(?:month|mo|video|week))?/gi,
  /(?:budget(?:ing)?|paying?|spend(?:ing)?)\s+(?:around\s+)?\$?[\d,]+/gi,
];

function fetchRedditJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'ContentCrafterzz:signal-bot:1.0',
        'Accept': 'application/json',
      },
    }, (res) => {
      if (res.statusCode === 429) {
        return reject(new Error('Reddit rate limited (429)'));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Reddit')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Reddit request timeout')); });
  });
}

function extractChannelUrl(text) {
  const ytHandle = text.match(/youtube\.com\/@([\w-]+)/i);
  if (ytHandle) return `https://www.youtube.com/@${ytHandle[1]}`;

  const ytChannel = text.match(/youtube\.com\/channel\/([\w-]+)/i);
  if (ytChannel) return `https://www.youtube.com/channel/${ytChannel[1]}`;

  const ytC = text.match(/youtube\.com\/c\/([\w-]+)/i);
  if (ytC) return `https://www.youtube.com/c/${ytC[1]}`;

  return null;
}

function classifyIntent(text) {
  const lower = text.toLowerCase();
  const activeMatched = ACTIVE_KEYWORDS.filter(kw => lower.includes(kw));
  if (activeMatched.length > 0) return { classification: 'ACTIVE_SEEKING', matched: activeMatched };

  const curiousMatched = CURIOUS_KEYWORDS.filter(kw => lower.includes(kw));
  if (curiousMatched.length > 0) return { classification: 'CURIOUS', matched: curiousMatched };

  return null;
}

function extractBudget(text) {
  for (const pattern of BUDGET_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].slice(0, 50);
  }
  return null;
}

async function scanSubreddits() {
  const db = getDb();
  const results = { scanned: 0, found: 0, saved: 0, errors: [] };

  for (const subreddit of SUBREDDITS) {
    try {
      const data = await fetchRedditJSON(
        `https://www.reddit.com/r/${subreddit}/new.json?limit=100&sort=new`
      );

      const posts = data?.data?.children || [];
      results.scanned += posts.length;

      for (const { data: post } of posts) {
        if (!post?.id) continue;

        const fullText = `${post.title || ''} ${post.selftext || ''}`;
        const intent = classifyIntent(fullText);
        if (!intent) continue;

        results.found++;

        const existing = await db.get('SELECT id FROM buying_signals WHERE post_id=?', [post.id]);
        if (existing) continue;

        const channelUrl = extractChannelUrl(fullText);
        const budget = extractBudget(fullText);

        await db.run(`
          INSERT OR IGNORE INTO buying_signals
            (source, post_id, subreddit, post_title, post_body, post_url,
             channel_url, budget_mentioned, intent_classification, keywords_matched)
          VALUES ('reddit', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          post.id, subreddit,
          post.title?.slice(0, 300) || '',
          (post.selftext || '').slice(0, 2000),
          `https://reddit.com${post.permalink}`,
          channelUrl, budget, intent.classification, JSON.stringify(intent.matched),
        ]);

        results.saved++;
      }
    } catch (e) {
      results.errors.push(`r/${subreddit}: ${e.message}`);
    }

    // Brief pause between subreddits to avoid rate limits
    await new Promise(r => setTimeout(r, 1500));
  }

  return results;
}

module.exports = { scanSubreddits, classifyIntent, extractBudget, extractChannelUrl };
