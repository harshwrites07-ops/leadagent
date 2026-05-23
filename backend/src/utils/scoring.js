function scoreLeadFromYouTube(data) {
  let score = 0;

  // Engagement rate (0-30 pts)
  const engRate = data.engagement_rate || 0;
  if (engRate >= 5) score += 30;
  else if (engRate >= 3) score += 22;
  else if (engRate >= 1.5) score += 15;
  else if (engRate >= 0.5) score += 8;
  else score += 2;

  // Upload inconsistency = pain = better lead (0-20 pts)
  const uploadFreq = data.upload_frequency_days || 0;
  if (uploadFreq > 30) score += 20;
  else if (uploadFreq > 14) score += 15;
  else if (uploadFreq > 7) score += 8;
  else score += 3;

  // Views-to-subscriber ratio (0-20 pts)
  const subs = data.subscriber_count || 1;
  const avgViews = data.avg_views || 0;
  const ratio = (avgViews / subs) * 100;
  if (ratio < 5) score += 20;        // < 5% retention = big pain
  else if (ratio < 10) score += 14;
  else if (ratio < 20) score += 8;
  else score += 2;

  // Email found (0-20 pts)
  if (data.email) score += 20;
  else if (data.website) score += 8;

  // Subscriber range sweet spot 5K-200K (0-10 pts)
  if (subs >= 10000 && subs <= 100000) score += 10;
  else if (subs >= 5000 && subs <= 200000) score += 7;
  else score += 3;

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function scoreLeadFromReddit(data) {
  let score = 40; // base for reddit leads (they self-identified pain)
  if (data.channel_id) score += 15; // linked YouTube = better
  if (data.email) score += 20;
  return Math.min(score, 100);
}

function getTemperature(score) {
  if (score >= 60) return 'hot';
  if (score >= 35) return 'warm';
  return 'cold';
}

module.exports = { scoreLeadFromYouTube, scoreLeadFromReddit, getTemperature };
