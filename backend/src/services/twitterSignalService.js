/**
 * Twitter/X Signal Service
 * Uses X API v2 free tier to find creator hiring signals
 * Free tier: 500K tweet reads/month
 */

const https = require('https');
const { getDb } = require('../models/database');

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;

const SEARCH_QUERIES = [
  '"looking for video editor" youtube',
  '"need a video editor" youtube',
  '"hiring video editor" youtube',
  '"looking for thumbnail designer" youtube',
  '"need thumbnail designer" youtube',
  '"looking for scriptwriter" youtube',
  '"hiring editor" youtube channel',
  '"video editor needed" youtube',
  '#YouTubeHiring',
  '#CreatorJobs video editor',
  '#LookingForEditor youtube',
];

const HIRING_KEYWORDS = [
  'hiring', 'looking for', 'need a', 'need an', 'searching for',
  'want a', 'editor needed', 'designer needed', 'help wanted',
  'join my team', 'collab', 'work with me', 'paid opportunity'
];

function searchTweets(query) {
  return new Promise((resolve, reject) => {
    if (!BEARER_TOKEN) {
      resolve({ data: [] });
      return;
    }

    const encodedQuery = encodeURIComponent(query + ' -is:retweet lang:en');
    const path = `/2/tweets/search/recent?query=${encodedQuery}&max_results=10&tweet.fields=created_at,author_id,text&expansions=author_id&user.fields=name,username,description,public_metrics`;

    const options = {
      hostname: 'api.twitter.com',
      path,
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ data: [] });
        }
      });
    }).on('error', () => resolve({ data: [] }))
      .on('timeout', () => resolve({ data: [] }));
  });
}

function calculateTwitterConfidence(tweet) {
  const text = tweet.text.toLowerCase();
  let score = 0.7;

  if (text.includes('paid') || text.includes('budget')) score += 0.1;
  if (text.includes('long term') || text.includes('ongoing')) score += 0.1;
  if (text.includes('dm') || text.includes('apply') || text.includes('email')) score += 0.05;
  if (text.includes('immediately') || text.includes('asap')) score += 0.05;

  return Math.min(score, 0.95);
}

async function scanTwitterSignals() {
  const db = getDb();

  if (!BEARER_TOKEN) {
    console.log('[Twitter] No TWITTER_BEARER_TOKEN set, skipping scan');
    return { skipped: true, reason: 'No bearer token' };
  }

  let totalNew = 0;
  let totalFound = 0;

  console.log('[Twitter] Starting signal scan...');

  for (const query of SEARCH_QUERIES) {
    try {
      const response = await searchTweets(query);
      const tweets = response.data || [];
      const users = {};

      if (response.includes?.users) {
        for (const user of response.includes.users) {
          users[user.id] = user;
        }
      }

      for (const tweet of tweets) {
        const user = users[tweet.author_id] || {};
        const text = tweet.text.toLowerCase();

        const hasHiringKeyword = HIRING_KEYWORDS.some(kw => text.includes(kw));
        if (!hasHiringKeyword) continue;

        const tweetUrl = `https://twitter.com/${user.username}/status/${tweet.id}`;
        const confidence = calculateTwitterConfidence(tweet);

        try {
          const result = await db.run(
            `INSERT OR IGNORE INTO platform_signals (creator_id, platform, signal_type, signal_text, signal_url, confidence) VALUES (?, 'twitter', 'confirmed_hiring', ?, ?, ?)`,
            [`twitter_${tweet.author_id}`, tweet.text.substring(0, 500), tweetUrl, confidence]
          );
          if (result.changes > 0) {
            totalNew++;
            await db.run(
              `INSERT OR IGNORE INTO buying_signals (source, post_id, subreddit, keywords_matched, intent_classification) VALUES ('twitter', ?, 'twitter', ?, 'CONFIRMED_HIRING')`,
              [tweet.id, tweet.text.substring(0, 200)]
            );
          }
          totalFound++;
        } catch {}
      }

      // Rate limit protection - X API is strict
      await new Promise(r => setTimeout(r, 3000));

    } catch (e) {
      console.error(`[Twitter] Error for query "${query}":`, e.message);
    }
  }

  console.log(`[Twitter] Scan complete: ${totalFound} found, ${totalNew} new signals`);

  return { total_found: totalFound, new_signals: totalNew };
}

module.exports = { scanTwitterSignals };
