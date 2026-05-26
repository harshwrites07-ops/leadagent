const HIGH_VALUE_NICHES = [
  'business', 'finance', 'fitness', 'education', 'coaching', 'real estate',
  'saas', 'tech', 'marketing', 'investing', 'crypto', 'wealth', 'health',
  'law', 'insurance', 'accounting', 'consulting', 'trading', 'ecommerce',
];

function scoreLeadFromYouTube(data) {
  let score = 0;
  const subs = data.subscriber_count || 1;
  const avgViews = data.avg_views || 0;
  const uploadFreq = data.upload_frequency_days || 0;
  const totalVideos = data.total_videos || 0;

  // +20: uploaded in last 14 days (active creator — worth reaching out to)
  if (data.last_upload_date) {
    const daysSince = Math.floor((Date.now() - new Date(data.last_upload_date)) / 86400000);
    if (daysSince <= 14) score += 20;
    else if (daysSince <= 30) score += 10;
    else if (daysSince <= 60) score += 4;
  }

  // +15: subscriber count 10K-200K (sweet spot — has audience, no in-house team yet)
  if (subs >= 10000 && subs <= 200000) score += 15;
  else if (subs >= 5000 && subs <= 500000) score += 8;
  else if (subs >= 1000) score += 3;

  // +15: view/subscriber ratio below 0.3 (low views vs subs = content quality problem)
  const viewSubRatio = avgViews / subs;
  if (viewSubRatio < 0.1) score += 15;
  else if (viewSubRatio < 0.2) score += 12;
  else if (viewSubRatio < 0.3) score += 8;
  else if (viewSubRatio < 0.5) score += 3;

  // +10: has business email (direct outreach is possible)
  if (data.email) score += 10;
  else if (data.website) score += 3;

  // +10: irregular upload schedule (inconsistency = needs editing help)
  if (uploadFreq > 21) score += 10;
  else if (uploadFreq > 10) score += 6;
  else if (uploadFreq > 5) score += 2;

  // +10: established creator (50+ videos = knows the value, more likely has budget)
  if (totalVideos >= 100) score += 10;
  else if (totalVideos >= 50) score += 7;
  else if (totalVideos >= 20) score += 4;
  else if (totalVideos >= 5) score += 1;

  // +10: high-value niche (business/finance/fitness = higher CPM = more ad revenue = budget for editing)
  const textToCheck = [data.niche || '', data.channel_description || ''].join(' ').toLowerCase();
  if (HIGH_VALUE_NICHES.some(n => textToCheck.includes(n))) score += 10;

  // +10: no recent viral video (consistent but not breaking out = motivated to improve)
  const recentVideos = (() => {
    if (Array.isArray(data.recent_videos)) return data.recent_videos;
    try { return JSON.parse(data.recent_videos || '[]'); } catch { return []; }
  })();
  if (recentVideos.length >= 3) {
    const maxViews = Math.max(...recentVideos.map(v => v.views || 0));
    const avgRecent = recentVideos.reduce((a, v) => a + (v.views || 0), 0) / recentVideos.length;
    if (avgRecent > 0 && maxViews < avgRecent * 5) score += 10;
  } else {
    score += 5; // insufficient data — partial credit
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function scoreLeadFromReddit(data) {
  let score = 40;
  if (data.channel_id) score += 15;
  if (data.email) score += 20;
  return Math.min(score, 100);
}

function getTemperature(score) {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

module.exports = { scoreLeadFromYouTube, scoreLeadFromReddit, getTemperature };
