// Section B — Creator Intelligence Pack
// Builds a rich, structured profile of a creator from existing lead data.

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

function getRecentVideos(lead, n = 10) {
  try {
    const vids = JSON.parse(lead.recent_videos || '[]');
    if (Array.isArray(vids) && vids.length) return vids.slice(0, n);
  } catch { /* fall through to the flat-column fallback below */ }
  // recent_videos JSON is empty/missing for a lot of leads — recent_video_title
  // is a separate flat column (see models/database.js migration + the
  // backfillVideoTitles.js script) that's populated even when the JSON isn't.
  // Without this fallback, buildCreatorIntelligencePack() reports zero watched
  // signals for leads that actually have a real title on file, which trips
  // the "needs research" gate incorrectly.
  if (lead.recent_video_title) {
    // views is intentionally null, not 0 — we don't know this video's view
    // count, and a fake "0" would leak into ratio math as if it were a real
    // verified stat (e.g. a fabricated "0% of subscribers watched").
    return [{ title: lead.recent_video_title, views: null }];
  }
  return [];
}

function calculateRecentAvg(lead, count = 5) {
  const vids = getRecentVideos(lead, count).filter(v => v.views != null);
  if (!vids.length) return lead.avg_views || 0;
  return vids.reduce((s, v) => s + (v.views || 0), 0) / vids.length;
}

function isViewsDeclining(lead) {
  const vids = getRecentVideos(lead, 6);
  if (vids.length < 4) return false;
  const recentAvg = vids.slice(0, 3).reduce((s, v) => s + (v.views || 0), 0) / 3;
  const olderAvg  = vids.slice(-3).reduce((s, v) => s + (v.views || 0), 0) / 3;
  return olderAvg > 0 && recentAvg < olderAvg * 0.65;
}

function isFrequencyDropped(lead) {
  const days = daysSince(lead.last_upload_date);
  if (!days) return false;
  const avgFreq = lead.upload_frequency_days || 7;
  return days > avgFreq * 2;
}

function isGrowthPlateaued(lead) {
  const vids = getRecentVideos(lead, 6);
  if (vids.length < 4) return false;
  const channelAvg = lead.avg_views || 0;
  if (!channelAvg) return false;
  const closeCount = vids.filter(v => {
    const diff = Math.abs((v.views || 0) - channelAvg) / channelAvg;
    return diff < 0.15;
  }).length;
  return closeCount >= 3;
}

function hasRecentViral(lead) {
  const vids = getRecentVideos(lead, 5);
  const avg = lead.avg_views || 0;
  if (!avg) return false;
  return vids.some(v => (v.views || 0) > avg * 3);
}

function calculateUploadTrend(lead) {
  const days = daysSince(lead.last_upload_date);
  const avgFreq = lead.upload_frequency_days;
  if (!days || !avgFreq) return 'consistent';
  if (days > avgFreq * 2.5) return 'stalled';
  if (days > avgFreq * 1.5) return 'slowing';
  if (days < avgFreq * 0.7) return 'accelerating';
  return 'consistent';
}

function detectArchetype(lead) {
  const vids = getRecentVideos(lead, 10);
  const uploadsLast30 = vids.length; // approximation
  const subs = lead.subscriber_count || 0;
  const days = daysSince(lead.last_upload_date);
  const declining = isViewsDeclining(lead);
  const viral = hasRecentViral(lead);
  const viewTrend = declining ? 'declining' : viral ? 'growing' : 'stable';

  if (uploadsLast30 >= 6 && viewTrend === 'declining') return 'grinder';
  if (uploadsLast30 <= 2 && (days || 0) > 10 && viewTrend !== 'declining') return 'perfectionist';
  if (uploadsLast30 >= 3 && viewTrend === 'stable' && subs > 10000) return 'growth_chaser';
  if (subs < 50000 && viewTrend === 'growing') return 'breakout';
  return 'growth_chaser';
}

function detectSubNiche(lead) {
  const niche = (lead.niche || '').toLowerCase();
  const desc = (lead.channel_description || '').toLowerCase();
  if (niche.includes('finance') || desc.includes('invest')) {
    if (desc.includes('crypto') || desc.includes('bitcoin')) return 'finance > crypto';
    if (desc.includes('stock') || desc.includes('invest')) return 'finance > investing';
    return 'finance > personal finance';
  }
  if (niche.includes('tech') || desc.includes('technology')) {
    if (desc.includes('review') || desc.includes('unbox')) return 'tech > reviews';
    if (desc.includes('code') || desc.includes('program')) return 'tech > programming';
    return 'tech > general';
  }
  if (niche.includes('fitness') || desc.includes('workout')) {
    if (desc.includes('bodybuilding') || desc.includes('gym')) return 'fitness > bodybuilding';
    return 'fitness > general';
  }
  return niche || 'general';
}

function detectBestFormat(lead) {
  const vids = getRecentVideos(lead, 10);
  if (!vids.length) return 'mixed';
  const titles = vids.map(v => (v.title || '').toLowerCase());
  const counts = {
    tutorials: titles.filter(t => /tutorial|how to|guide/.test(t)).length,
    reviews:   titles.filter(t => /review|vs|comparison/.test(t)).length,
    vlogs:     titles.filter(t => /vlog|day in|my day/.test(t)).length,
    reactions: titles.filter(t => /reaction|react/.test(t)).length,
  };
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top[1] >= 3 ? top[0] : 'mixed';
}

function detectTeamSize(lead) {
  const desc = (lead.channel_description || '').toLowerCase();
  const subs = lead.subscriber_count || 0;
  if (desc.includes('our team') || desc.includes('we are a') || subs > 500000) return 'large';
  if (desc.includes('editor') || desc.includes('manager') || subs > 100000) return 'small';
  return 'solo';
}

function hasShortsGap(lead) {
  const vids = getRecentVideos(lead, 10);
  return vids.length >= 5 && (lead.total_videos || 0) > 10;
}

function extractSelfDescription(lead) {
  const desc = lead.channel_description || '';
  if (!desc) return null;
  return desc.split('\n')[0].substring(0, 200) || null;
}

function extractKeywords(desc) {
  if (!desc) return [];
  const stop = new Set(['the','a','an','is','in','on','at','to','for','of','and','or','but','with','from','by','my','our','we','i','you']);
  return desc.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stop.has(w))
    .slice(0, 8);
}

function buildCreatorIntelligencePack(lead) {
  const recentVids = getRecentVideos(lead, 10);
  const days = daysSince(lead.last_upload_date);
  const recentAvg = calculateRecentAvg(lead);
  const channelAvg = lead.avg_views || recentAvg;
  const subs = lead.subscriber_count || 0;
  const viewSubRatioPct = subs > 0 ? parseFloat(((recentAvg / subs) * 100).toFixed(1)) : null;

  const sorted = [...recentVids].sort((a, b) => (b.views || 0) - (a.views || 0));
  const bestVideo = sorted[0] || null;

  const desc = (lead.channel_description || '').toLowerCase();
  const hasJobPost = /looking for|hiring|need a|editor wanted|join my team|need help|accepting applications/i.test(desc);

  const viewsDeclining = isViewsDeclining(lead);
  const freqDropped    = isFrequencyDropped(lead);
  const plateaued      = isGrowthPlateaued(lead);

  // View decline percentage
  let viewsDeclinePct = null;
  if (viewsDeclining && recentVids.length >= 4) {
    const recent3Avg = recentVids.slice(0, 3).reduce((s, v) => s + (v.views || 0), 0) / 3;
    const older3Avg  = recentVids.slice(-3).reduce((s, v) => s + (v.views || 0), 0) / 3;
    if (older3Avg > 0) viewsDeclinePct = Math.round((1 - recent3Avg / older3Avg) * 100);
  }

  return {
    // IDENTITY
    channel_name:  lead.channel_name,
    handle:        lead.channel_handle || null,
    subscribers:   subs,
    niche:         lead.niche || 'general',
    sub_niche:     detectSubNiche(lead),
    country:       lead.country || null,

    // UPLOAD BEHAVIOR
    last_upload_days_ago:  days,
    upload_trend:          calculateUploadTrend(lead),
    avg_upload_gap_days:   Math.round(lead.upload_frequency_days || 7),

    // CONTENT PERFORMANCE
    recent_videos:         recentVids.slice(0, 5),
    best_video:            bestVideo ? { title: bestVideo.title, views: bestVideo.views } : null,
    recent_avg_views:      Math.round(recentAvg),
    channel_avg_views:     Math.round(channelAvg),
    best_performing_format: detectBestFormat(lead),

    // PAIN SIGNALS
    pain_signals: {
      upload_gap_over_14_days:  (days || 0) > 14,
      views_declining:           viewsDeclining,
      upload_frequency_dropped:  freqDropped,
      growth_plateaued:          plateaued,
      no_team_detected:          detectTeamSize(lead) === 'solo',
      job_post_detected:         hasJobPost,
      low_view_sub_ratio:        viewSubRatioPct !== null && viewSubRatioPct < 6,
    },

    // OPPORTUNITY SIGNALS
    opportunity_signals: {
      recent_viral:      hasRecentViral(lead),
      shorts_potential:  hasShortsGap(lead),
    },

    // PLATFORM
    has_website:          !!(lead.website),
    self_description:     extractSelfDescription(lead),
    description_keywords: extractKeywords(lead.channel_description),

    // TEAM & ARCHETYPE
    team_size: detectTeamSize(lead),
    archetype: detectArchetype(lead),

    // HOOK DATA — most specific facts for the email opener
    hook_data: {
      most_recent_video_title:  recentVids[0]?.title || null,
      most_recent_video_views:  recentVids[0]?.views || null,
      best_video_title:         bestVideo?.title || null,
      best_video_views:         bestVideo?.views || null,
      days_since_upload:        days,
      view_sub_ratio_pct:       viewSubRatioPct,
      recent_avg_views:         Math.round(recentAvg),
      channel_avg_views:        Math.round(channelAvg),
      views_decline_pct:        viewsDeclinePct,
    },
  };
}

module.exports = { buildCreatorIntelligencePack, detectArchetype, daysSince };
