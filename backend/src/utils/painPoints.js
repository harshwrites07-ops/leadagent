function detectPainPoints(data) {
  const points = [];

  const { upload_frequency_days, avg_views, subscriber_count, recent_videos, last_upload_date } = data;

  // Inconsistent uploader
  if (upload_frequency_days > 14) {
    points.push({ id: 'inconsistent_uploader', label: 'Inconsistent uploader', severity: 'high' });
  }

  // Low retention
  if (subscriber_count > 0 && avg_views < subscriber_count * 0.1) {
    points.push({ id: 'low_retention', label: 'Low view retention', severity: 'high' });
  }

  // Very low retention (< 3%)
  if (subscriber_count > 0 && avg_views < subscriber_count * 0.03) {
    points.push({ id: 'very_low_retention', label: 'Critical view retention issue', severity: 'critical' });
  }

  // Declining channel - check if recent videos have fewer views than the channel average
  if (recent_videos && recent_videos.length >= 4) {
    const recentAvg = recent_videos.slice(0, 3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    const olderAvg = recent_videos.slice(-3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    if (olderAvg > 0 && recentAvg < olderAvg * 0.6) {
      points.push({ id: 'declining', label: 'Declining view count', severity: 'high' });
    }
  }

  // Posting frequently but low engagement
  if (upload_frequency_days < 5 && data.engagement_rate < 1) {
    points.push({ id: 'high_post_low_engagement', label: 'Frequent posts, low engagement', severity: 'medium' });
  }

  // Hasn't uploaded recently
  if (last_upload_date) {
    const daysSince = Math.floor((Date.now() - new Date(last_upload_date)) / (1000 * 60 * 60 * 24));
    if (daysSince > 30) {
      points.push({ id: 'inactive', label: `Hasn't uploaded in ${daysSince} days`, severity: 'medium' });
    }
  }

  return points;
}

module.exports = { detectPainPoints };
