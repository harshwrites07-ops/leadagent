const { getDb } = require('../models/database');

// ─── Service → Channel Pain Point Intelligence ────────────────────────────────
// Maps what the user sells → which channel problems to look for → how to frame it
function getServiceIntelligence(serviceType, lead) {
  const s = (serviceType || '').toLowerCase();

  const subs     = lead.subscriber_count || 0;
  const avgViews = lead.avg_views        || 0;
  const niche    = lead.niche            || 'general';

  const recentVideos = (() => {
    try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; }
  })();

  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  // View trend (if we have enough videos)
  let viewTrend = 'stable';
  let recentAvg = avgViews, olderAvg = avgViews;
  if (recentVideos.length >= 4) {
    recentAvg = recentVideos.slice(0, 3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    olderAvg  = recentVideos.slice(-3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    if (recentAvg > olderAvg * 1.3)       viewTrend = 'growing';
    else if (recentAvg < olderAvg * 0.65) viewTrend = 'declining';
  }

  const viewSubRatioPct = subs > 0 ? (avgViews / subs * 100) : null;
  const recentTitles    = recentVideos.slice(0, 3).map(v => v.title).filter(Boolean);

  // ─── Classify service ─────────────────────────────────────────────────────
  const isEditor    = /edit|video.produc|post.produc|footage|grade|color.grad/i.test(s);
  const isThumb     = /thumb|ctr|click.through|graphic.design|banner|visual/i.test(s);
  const isScript    = /script|hook|copywrite|copy.writ|content.writ|narrative|story/i.test(s);
  const isSEO       = /seo|keyword|rank|search.optim|discov/i.test(s);
  const isCoach     = /coach|consult|strateg|mentor|audit|youtube.grow|channel.grow/i.test(s);
  const isSponsor   = /sponsor|brand.deal|monetiz|partner|influencer.market/i.test(s);
  const isSocial    = /social.media|instagram|tiktok|shorts|repurpos|multi.platform/i.test(s);

  // ─── Build hook fact: the ONE specific data point to open with ────────────
  let hookFact         = '';
  let whyItMatters     = '';
  let proofAngle       = '';
  let ctaQuestion      = '';
  let serviceCategory  = 'video editing';

  if (isEditor || (!isThumb && !isScript && !isSEO && !isCoach && !isSponsor && !isSocial)) {
    serviceCategory = 'video editing';

    const latestVideo  = recentVideos[0] || null;
    const latestTitle  = latestVideo?.title || null;
    const latestViews  = latestVideo?.views || 0;

    // Best/worst in the recent set
    const sorted      = [...recentVideos].sort((a, b) => (b.views || 0) - (a.views || 0));
    const bestVideo   = sorted[0] || null;
    const worstRecent = sorted[sorted.length - 1] || null;

    if (daysSince !== null && daysSince > 14) {
      // Upload gap — strongest angle, reference last video title
      hookFact = latestTitle
        ? `"${latestTitle}" was uploaded ${daysSince} days ago — nothing since`
        : `Last upload was ${daysSince} days ago`;
      whyItMatters = `Upload gaps compound — every 2 weeks of silence costs around 8-12% of ongoing subscriber engagement. Editing backlog is almost always the real bottleneck`;

    } else if (viewTrend === 'declining' && recentAvg > 0 && olderAvg > 0) {
      // View decline — name the most recent video specifically
      const drop = Math.round((1 - recentAvg / olderAvg) * 100);
      hookFact = latestTitle
        ? `Last 3 videos averaged ${Math.round(recentAvg).toLocaleString()} views — down ${drop}% from the ${Math.round(olderAvg).toLocaleString()} channel average. Most recent: "${latestTitle}"`
        : `Last 3 videos averaged ${Math.round(recentAvg).toLocaleString()} views — down ${drop}% from the ${Math.round(olderAvg).toLocaleString()} channel average`;
      whyItMatters = `That kind of drop without a content change almost always means edit pacing is bleeding watch time in the first 90 seconds`;

    } else if (bestVideo && recentVideos.length >= 3 && (bestVideo.views || 0) > recentAvg * 4 && recentAvg > 0) {
      // Viral spike they never replicated — most compelling angle for large channels
      hookFact = `"${bestVideo.title}" hit ${(bestVideo.views || 0).toLocaleString()} views. The most recent ${recentVideos.length - 1} uploads are averaging ${Math.round(recentAvg).toLocaleString()}`;
      whyItMatters = `There's a specific edit formula in that breakout video they never systematically decoded — which is why every upload after it has underperformed it`;

    } else if (viewSubRatioPct !== null && viewSubRatioPct < 6) {
      // Low view-to-sub ratio — frame as an observation, not a stat dump
      hookFact = latestTitle
        ? `"${latestTitle}" is the most recent video — ${viewSubRatioPct.toFixed(1)}% of ${subs.toLocaleString()} subscribers watched. That ratio has a specific cause`
        : `${viewSubRatioPct.toFixed(1)}% of ${subs.toLocaleString()} subscribers are watching each video — a gap that almost always traces to the first 30 seconds of the edit`;
      whyItMatters = `Sub-to-view ratios under 6% almost always trace to a hook or first-30-seconds pacing problem — the thumbnail gets the click, but the edit loses the watch`;

    } else if (latestTitle && latestViews > 0 && latestViews < avgViews * 0.7) {
      // Most recent video underperformed vs channel average
      hookFact = `"${latestTitle}" pulled ${latestViews.toLocaleString()} views — below the ${Math.round(avgViews).toLocaleString()} channel average`;
      whyItMatters = `When a channel's strongest recent video underperforms its own average, the edit pacing is usually telling the algorithm to push it to fewer people than the content deserves`;

    } else if (bestVideo && worstRecent && (bestVideo.views || 0) > (worstRecent.views || 0) * 5 && recentVideos.length >= 3) {
      // Massive variance between best and worst recent videos
      hookFact = `"${bestVideo.title}" hit ${(bestVideo.views || 0).toLocaleString()} views. "${worstRecent.title}" got ${(worstRecent.views || 0).toLocaleString()}`;
      whyItMatters = `That gap between best and worst isn't random — two completely different edit approaches are fighting each other. One formula is working and they don't know which one`;

    } else {
      // Stable channel — use latest video title to prove we studied them
      hookFact = latestTitle
        ? `"${latestTitle}" — latest upload. ${Math.round(avgViews).toLocaleString()} average views on ${subs.toLocaleString()} subscribers`
        : `${subs.toLocaleString()} subscribers, ${Math.round(avgViews).toLocaleString()} average views per video`;
      whyItMatters = `Solid channel — most creators at this level have 20-30% more views sitting in the edit they never unlock: tighter pacing, sharper hooks, cuts that push watch time up`;
    }

    proofAngle  = 'improved their average views / watch time through better editing';
    ctaQuestion = 'whether a specific edit change would move their numbers';
  }

  else if (isThumb) {
    serviceCategory = 'thumbnail design';
    const latestTitle = recentTitles[0] || null;
    if (viewSubRatioPct !== null && viewSubRatioPct < 8) {
      hookFact = latestTitle
        ? `"${latestTitle}" — ${viewSubRatioPct.toFixed(1)}% of ${subs.toLocaleString()} subscribers watched. Click problem, not content problem`
        : `${viewSubRatioPct.toFixed(1)}% of ${subs.toLocaleString()} subscribers watch each video — almost always a thumbnail click problem, not a content quality issue`;
      whyItMatters = `View-to-sub ratios under 8% almost always point to a thumbnail click problem, not a content quality problem`;
    } else if (recentTitles.length >= 2) {
      hookFact     = `Last ${recentTitles.length} videos — "${recentTitles[0]}", "${recentTitles[1]}" — follow the same thumbnail visual formula`;
      whyItMatters = `Repeated visual patterns plateau CTR — the algorithm stops pushing what audiences already swiped past`;
    } else {
      hookFact     = latestTitle
        ? `"${latestTitle}" is the most recent upload — getting ${Math.round(avgViews).toLocaleString()} average views on ${subs.toLocaleString()} subscribers`
        : `Getting ${Math.round(avgViews).toLocaleString()} average views on ${subs.toLocaleString()} subscribers`;
      whyItMatters = `The gap between good content and its view count is almost always a thumbnail click problem`;
    }
    proofAngle  = 'lifted CTR significantly with redesigned thumbnails';
    ctaQuestion = 'whether a different thumbnail direction could move their click-through';
  }

  else if (isScript) {
    serviceCategory = 'scriptwriting';
    if (viewTrend === 'declining' && recentAvg > 0 && olderAvg > 0) {
      const drop = Math.round((1 - recentAvg / olderAvg) * 100);
      hookFact     = `Their last 3-4 videos dropped ${drop}% below their channel average`;
      whyItMatters = `When content quality stays constant but views drop, the hooks stopped matching what the audience clicks for`;
    } else if (recentVideos.length >= 3) {
      const min = Math.min(...recentVideos.map(v => v.views || 0));
      const max = Math.max(...recentVideos.map(v => v.views || 0));
      if (max > min * 4) {
        hookFact     = `Their recent videos range from ${min.toLocaleString()} to ${max.toLocaleString()} views — a ${Math.round(max/min)}x gap`;
        whyItMatters = `That kind of inconsistency means two different hook formulas are fighting each other`;
      } else {
        hookFact     = `Getting ${Math.round(avgViews).toLocaleString()} average views with good content but not breaking through`;
        whyItMatters = `Plateau at consistent view counts usually means the hooks bring in viewers but don't match their search intent`;
      }
    } else {
      hookFact     = `Getting ${Math.round(avgViews).toLocaleString()} average views on ${subs.toLocaleString()} subscribers`;
      whyItMatters = `The first 30 seconds of a video decide everything — most creators write hooks last, which is why they underperform`;
    }
    proofAngle  = 'pushed videos above the channel\'s previous best by rewriting the hooks';
    ctaQuestion = 'what they\'d change about the hook in a specific recent video';
  }

  else if (isSEO) {
    serviceCategory = 'YouTube SEO';
    hookFact     = `Getting ${Math.round(avgViews).toLocaleString()} average views on ${subs.toLocaleString()} subscribers`;
    whyItMatters = `YouTube search drives 30-40% of views for most channels — most creators leave it completely untouched`;
    proofAngle   = 'doubled search-driven traffic within 60 days through keyword and title optimization';
    ctaQuestion  = 'whether their current titles are optimized for search discovery';
  }

  else if (isCoach) {
    serviceCategory = 'YouTube coaching';
    if (daysSince !== null && daysSince > 21) {
      hookFact     = `Last uploaded ${daysSince} days ago`;
      whyItMatters = `Inconsistency at this stage compounds — algorithm weight drops faster than most creators realize`;
    } else {
      hookFact     = `At ${subs.toLocaleString()} subscribers, averaging ${Math.round(avgViews).toLocaleString()} views — sitting right where most channels plateau`;
      whyItMatters = `Most channels stall here because they're optimizing the wrong things, not because the content is bad`;
    }
    proofAngle  = 'helped a similar channel break past its plateau';
    ctaQuestion = 'what\'s actually holding the channel back right now';
  }

  else if (isSponsor) {
    serviceCategory = 'sponsorship management';
    hookFact     = `${subs.toLocaleString()} subscribers, ${Math.round(avgViews).toLocaleString()} average views — that audience has real brand deal value`;
    whyItMatters = `Most creators at this size undercharge by 50-70% or miss deals entirely because they don't know their market rate`;
    proofAngle   = 'helped a similar creator land their first (or better) brand deal within 30 days';
    ctaQuestion  = 'whether they\'ve looked at what their audience is worth to brands in their niche';
  }

  else if (isSocial) {
    serviceCategory = 'social media / repurposing';
    hookFact     = `They\'re producing ${Math.round(avgViews).toLocaleString()}-view YouTube content that isn\'t reaching the audiences on other platforms`;
    whyItMatters = `The same video properly repurposed to Shorts/Reels/TikTok typically generates 3-5x total reach without extra filming`;
    proofAngle   = 'built a repurposing system that multiplied their reach across platforms';
    ctaQuestion  = 'whether they\'re currently repurposing their content anywhere';
  }

  return {
    hookFact, whyItMatters, proofAngle, ctaQuestion,
    serviceCategory, viewTrend, recentAvg, olderAvg,
    daysSince, viewSubRatioPct, recentTitles,
  };
}

// ─── Service-matched examples ─────────────────────────────────────────────────
function buildServiceExamples(serviceType, senderFirstName) {
  const s = (serviceType || '').toLowerCase();
  const n = senderFirstName || 'Alex';

  if (/edit|video.produc|post.produc|grade|color/i.test(s)) {
    return `STUDY THESE 3 EXAMPLES — match this exact style, length, and structure:

EXAMPLE 1 (upload gap):
Subject: your last 12 days
Your upload pace dropped from twice a week to once every 12 days in April. That gap shows up in subscriber growth before anything else does.
Edited for a business creator in the same spot — consistency fix alone moved their average views from 6K to 18K in 6 weeks.
Worth a look at what changed?
${n}

---
EXAMPLE 2 (view decline):
Subject: your last 4 videos
Your last four videos averaged 40% below your channel average from three months ago. The content held up — the edit pacing didn't.
Fixed this exact pattern for a tech creator. Next three videos all outperformed their previous best.
Want me to show you what I'd change in your latest video?
${n}

---
EXAMPLE 3 (low view-to-sub):
Subject: your view gap
You have 18,000 subscribers but your last 5 videos averaged 800 views. That 4% rate usually traces back to a hook or retention edit problem.
Helped a finance creator fix the same gap — watch time went from 38% to 67% in 8 weeks.
Open to a breakdown of what's happening?
${n}`;
  }

  if (/thumb|ctr|click.through|graphic.design|banner|visual/i.test(s)) {
    return `STUDY THESE 3 EXAMPLES — match this exact style, length, and structure:

EXAMPLE 1 (view/sub gap):
Subject: your 14K subscribers
14,000 subscribers but your last 5 videos averaged 400 views. That gap is almost always a thumbnail click problem, not a content problem.
Redesigned thumbnails for a business creator at the same crossroads — views doubled within the first 2 videos.
Worth seeing what I'd change on your current uploads?
${n}

---
EXAMPLE 2 (same visual formula):
Subject: noticed a pattern on your channel
Your last 6 finance videos all use the same thumbnail formula — dark background, text overlay, no face. That formula has a ceiling, and your view counts show where it is.
Broke this pattern for a finance creator — CTR jumped from 3.1% to 9.4% within 4 videos.
Open to seeing a different direction for your next one?
${n}

---
EXAMPLE 3 (good content, wrong packaging):
Subject: your cooking thumbnails
Your cooking videos are genuinely good but your thumbnails are doing the opposite of what your content deserves.
Redesigned thumbnails for a food creator with your exact setup — CTR went from 2.9% to 8.1% in 3 weeks.
Want me to mock one up for your latest video?
${n}`;
  }

  if (/script|hook|copy.writ|content.writ|narrative/i.test(s)) {
    return `STUDY THESE 3 EXAMPLES — match this exact style, length, and structure:

EXAMPLE 1 (view decline):
Subject: your last 4 videos
Three of your last four finance videos dropped below your 6-month average by 40%. The content is solid — the hooks aren't matching what your audience clicks for.
Rewrote hooks for a creator in the same situation. Next two videos hit their all-time view records.
Open to seeing what I'd change in yours?
${n}

---
EXAMPLE 2 (inconsistent results):
Subject: your view inconsistency
Your last 10 videos range from 800 to 42,000 views. That swing isn't random — it's two different hook formulas fighting each other.
Identified the formula that's working and rebuilt a script system around it for a fitness creator. Their last 8 videos all hit above their average.
Worth a look at the pattern?
${n}

---
EXAMPLE 3 (plateau):
Subject: your channel since February
Your subscriber count barely moved in 3 months despite consistent uploads. Usually means the hooks are bringing in the wrong viewer — high initial click, low retention, algorithm stops pushing.
Fixed this for a business creator — watch time up 55%, subscribers growing again.
Want to see which hooks are causing it?
${n}`;
  }

  // Generic fallback
  return `STUDY THESE 3 EXAMPLES — match this exact style, length, and structure:

EXAMPLE 1:
Subject: your last 12 days
Your upload pace dropped from twice a week to once every 12 days. That gap shows up in subscriber growth before anything else does.
Helped a business creator fix the same pattern — average views went from 6K to 18K in 6 weeks.
Worth a look at what changed?
${n}

---
EXAMPLE 2:
Subject: your view gap
14,000 subscribers but last 5 videos averaged 400 views. That gap almost always points to one fixable problem.
Helped a creator at the same crossroads — their next 4 videos all outperformed their previous best.
Worth seeing what I'd change on yours?
${n}

---
EXAMPLE 3:
Subject: your last 4 videos
Three of your last four videos dropped below your 6-month average by 40%. The content held — something specific in the setup didn't.
Fixed this exact pattern for a creator in your niche. Next two videos hit all-time records.
Open to a specific breakdown?
${n}`;
}

// ─── Voice instruction from personality traits ─────────────────────────────────
function buildVoiceInstruction(traits, style) {
  const t = Array.isArray(traits) ? traits : [];
  const mods = [];
  if (t.includes('Direct and no-nonsense'))       mods.push('Short sentences. No padding. Cut anything that doesn\'t add information.');
  if (t.includes('Analytical and data-driven'))   mods.push('Lead with numbers when possible. Precision over polish.');
  if (t.includes('Warm and friendly'))             mods.push('Warm, not sycophantic. Show genuine interest in their channel as a person.');
  if (t.includes('Bold and confident'))            mods.push('State things as facts, not suggestions. "Your hook is off" not "your hook might be worth looking at".');
  if (t.includes('Funny and casual'))              mods.push('Human and casual. Light wit is fine if it flows naturally.');
  if (t.includes('Professional and polished'))     mods.push('Polished and precise. Every word intentional. Zero filler.');
  if (t.includes('Creative and energetic'))        mods.push('Energetic but controlled. Confidence, not hype.');
  if (t.includes('Laid-back and approachable'))    mods.push('Relaxed and human. Like texting a peer, not pitching a client.');
  if (!mods.length) mods.push('Natural and genuine. No corporate speak. No sales language. Human first.');
  return mods.join(' ');
}

// ─── Build full voice DNA from user record ─────────────────────────────────────
function buildVoiceDNA(user) {
  const traits = (() => { try { return JSON.parse(user.personality_traits || '[]'); } catch { return []; } })();
  const niches = (() => { try { return JSON.parse(user.target_niches    || '[]'); } catch { return []; } })();
  const name   = (user.full_name || 'the sender').split(' ')[0];

  const communicationStyle = (() => {
    if (traits.includes('Direct and no-nonsense'))        return 'direct, concise, no fluff — gets to the point immediately';
    if (traits.includes('Warm and friendly'))              return 'warm, conversational, approachable — like talking to a friend';
    if (traits.includes('Analytical and data-driven'))     return 'data-focused, logical, precise — leads with numbers and evidence';
    if (traits.includes('Funny and casual'))               return 'casual, light, occasionally uses dry humour';
    if (traits.includes('Professional and polished'))      return 'professional, refined, confident — zero fluff';
    if (traits.includes('Bold and confident'))             return 'bold, assertive, commanding — speaks like an expert';
    if (traits.includes('Creative and energetic'))         return 'energetic, vivid, enthusiastic without being over the top';
    if (traits.includes('Laid-back and approachable'))     return 'relaxed, human, peer-to-peer energy';
    return 'natural and genuine';
  })();

  const writingMods = [];
  if (traits.includes('Direct and no-nonsense'))     writingMods.push('No padding. Every sentence earns its place.');
  if (traits.includes('Analytical and data-driven')) writingMods.push('Reference specific numbers and data when available.');
  if (traits.includes('Funny and casual'))           writingMods.push('Light humour is welcome if it flows naturally.');
  if (traits.includes('Warm and friendly'))          writingMods.push('Show genuine interest in the creator as a person.');
  if (traits.includes('Bold and confident'))         writingMods.push('Speak with authority. No hedging.');

  const emailTone = (() => {
    const p = user.pricing_range || '';
    if (/7[,.]?000|7k/i.test(p)) return 'premium and authoritative — delivers serious results';
    if (/3[,.]?500|3\.5k/i.test(p)) return 'professional and capable — proven track record';
    if (/1[,.]?500|1\.5k/i.test(p)) return 'confident and value-focused';
    if (/500/i.test(p))             return 'approachable and eager to prove value';
    return 'conversational and genuine';
  })();

  const serviceLC   = (user.service_type || 'services').toLowerCase();
  const socialProof = user.best_result?.trim() || `helping YouTube creators with ${serviceLC}`;
  const identity    = user.one_liner?.trim()   || `${user.full_name || name} who offers ${serviceLC} to YouTube creators`;

  const ctaStyle = (() => {
    if (user.outreach_goal === 'book_call')  return 'a question that naturally leads toward a discovery call';
    if (user.outreach_goal === 'close_deal') return 'a direct question that moves toward a decision';
    return 'a low-commitment conversational question';
  })();

  return {
    name,
    fullName:           user.full_name  || name,
    service:            serviceLC,
    identity,
    communicationStyle,
    emailTone,
    socialProof,
    traits,
    targetNiches:       niches,
    outreachGoal:       user.outreach_goal    || 'get_reply',
    ctaStyle,
    originStory:        user.origin_story     || null,
    uniqueDifference:   user.unique_difference|| null,
    experienceLevel:    user.experience_years || null,
    pricingTier:        user.pricing_range    || null,
    writingInstructions: [
      `Write exactly like ${user.full_name || name} — their real voice, not a template.`,
      `Communication style: ${communicationStyle}`,
      `Email tone: ${emailTone}`,
      ...writingMods,
      user.outreach_goal === 'book_call'  ? 'End goal is a discovery call — but NEVER ask for it directly in email 1. Plant the seed.' : '',
      user.outreach_goal === 'get_reply'  ? 'Optimise entirely for a reply. ONE question. Nothing else.' : '',
      user.outreach_goal === 'close_deal' ? 'Be direct about value but never mention pricing.' : '',
    ].filter(Boolean).join('\n      '),
    builtAt: new Date().toISOString(),
  };
}

async function getOrBuildVoiceDNA(userId) {
  if (!userId) return null;
  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  try {
    const cached = JSON.parse(user.voice_dna || '{}');
    if (cached.builtAt && user.service_type) {
      const age = Date.now() - new Date(cached.builtAt).getTime();
      if (age < 24 * 60 * 60 * 1000) return cached;
    }
  } catch {}

  const dna = buildVoiceDNA(user);
  try { await db.run('UPDATE users SET voice_dna = ? WHERE id = ?', [JSON.stringify(dna), userId]); } catch {}
  return dna;
}

async function rebuildVoiceDNA(userId) {
  const db = getDb();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const dna = buildVoiceDNA(user);
  await db.run('UPDATE users SET voice_dna = ? WHERE id = ?', [JSON.stringify(dna), userId]);
  return dna;
}

module.exports = {
  buildVoiceDNA,
  getOrBuildVoiceDNA,
  rebuildVoiceDNA,
  getServiceIntelligence,
  buildServiceExamples,
  buildVoiceInstruction,
};
