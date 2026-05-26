function detectPainPoints(data) {
  const points = [];
  const {
    upload_frequency_days, avg_views, subscriber_count, recent_videos,
    last_upload_date, total_videos, email, engagement_rate,
  } = data;

  const subs = subscriber_count || 0;
  const videos = (() => {
    if (Array.isArray(recent_videos)) return recent_videos;
    try { return JSON.parse(recent_videos || '[]'); } catch { return []; }
  })();

  // ── Recency signals ──────────────────────────────────────────────────────────
  if (last_upload_date) {
    const daysSince = Math.floor((Date.now() - new Date(last_upload_date)) / 86400000);
    if (daysSince <= 7)       points.push({ id: 'very_active',      label: 'Active this week',   severity: 'positive' });
    else if (daysSince <= 14) points.push({ id: 'recently_active',  label: 'Active recently',    severity: 'positive' });
    else if (daysSince > 60)  points.push({ id: 'inactive',         label: `Dark ${daysSince}d`, severity: 'medium' });
    else if (daysSince > 30)  points.push({ id: 'slow',             label: `No upload ${daysSince}d`, severity: 'medium' });
  }

  // ── View retention pain ──────────────────────────────────────────────────────
  if (subs > 0 && avg_views > 0) {
    const ratio = avg_views / subs;
    if (ratio < 0.05)       points.push({ id: 'critical_view_gap', label: 'Critical view gap',  severity: 'critical' });
    else if (ratio < 0.15)  points.push({ id: 'low_retention',     label: 'Low view ratio',     severity: 'high' });
    else if (ratio < 0.3)   points.push({ id: 'below_avg_views',   label: 'Below avg views',    severity: 'medium' });
  }

  // ── Upload inconsistency ─────────────────────────────────────────────────────
  if (upload_frequency_days > 21)      points.push({ id: 'inconsistent', label: 'Irregular uploads', severity: 'high' });
  else if (upload_frequency_days > 10) points.push({ id: 'slow_pace',    label: 'Slow upload pace',  severity: 'medium' });

  // ── Sweet spot size (positive signal) ───────────────────────────────────────
  if (subs >= 10000 && subs <= 200000) points.push({ id: 'sweet_spot',  label: 'Sweet spot size',     severity: 'positive' });

  // ── Established creator (positive signal) ────────────────────────────────────
  if (total_videos >= 50) points.push({ id: 'established', label: 'Established creator', severity: 'positive' });

  // ── Has contact email (positive signal) ──────────────────────────────────────
  if (email) points.push({ id: 'has_email', label: 'Has email', severity: 'positive' });

  // ── Declining views ──────────────────────────────────────────────────────────
  if (videos.length >= 4) {
    const recentAvg = videos.slice(0, 3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    const olderAvg  = videos.slice(-3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    if (olderAvg > 0 && recentAvg < olderAvg * 0.6) {
      points.push({ id: 'declining', label: 'Declining views', severity: 'high' });
    }
  }

  // ── Posts often but low engagement ───────────────────────────────────────────
  if (upload_frequency_days > 0 && upload_frequency_days < 5 && (engagement_rate || 0) < 1) {
    points.push({ id: 'high_post_low_eng', label: 'Posts often, low engagement', severity: 'medium' });
  }

  return points;
}

module.exports = { detectPainPoints };
