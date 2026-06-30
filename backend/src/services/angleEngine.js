// Section C — Angle Selection Engine
// Selects the best angle for a creator using rule-based logic derived from the
// MARCUS_ANGLES spec. Rule-based approach avoids an extra AI roundtrip while
// following the same decision logic the AI prompt would use.

const MARCUS_ANGLES = {
  diagnosis: {
    id: 'diagnosis',
    name: 'The Diagnosis',
    description: 'Spotted a pattern they haven\'t named yet',
    psychology: ['curiosity', 'feeling_seen'],
  },
  unclaimed_window: {
    id: 'unclaimed_window',
    name: 'The Unclaimed Window',
    description: 'Specific opportunity in their niche nobody has claimed yet',
    psychology: ['loss_aversion', 'scarcity'],
  },
  bottleneck_removal: {
    id: 'bottleneck_removal',
    name: 'The Bottleneck Removal',
    description: 'Their growth ceiling is something you remove',
    psychology: ['relief', 'authority'],
  },
  specific_fit: {
    id: 'specific_fit',
    name: 'The Specific Fit',
    description: 'Service built for exactly their format',
    psychology: ['liking', 'expertise_recognition'],
  },
  risk_reframe: {
    id: 'risk_reframe',
    name: 'The Risk Reframe',
    description: 'Make saying yes cost nothing',
    psychology: ['loss_aversion_reversed', 'commitment_consistency'],
  },
  social_proof_mirror: {
    id: 'social_proof_mirror',
    name: 'The Social Proof Mirror',
    description: 'Result from someone in their exact situation',
    psychology: ['social_proof', 'authority'],
  },
  honest_observation: {
    id: 'honest_observation',
    name: 'The Honest Observation',
    description: 'Something true about their channel most people wouldn\'t say',
    psychology: ['trust', 'differentiation'],
  },
  value_drop: {
    id: 'value_drop',
    name: 'The Value Drop',
    description: 'Pure value — no pitch, no CTA (follow-ups only)',
    follow_up_only: true,
  },
};

function formatNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

// Rule-based angle selection — returns the same structure the AI prompt returns
function selectAngle(intelligencePack, user) {
  const pain      = intelligencePack.pain_signals || {};
  const hook      = intelligencePack.hook_data    || {};
  const archetype = intelligencePack.archetype    || 'growth_chaser';
  const subs      = intelligencePack.subscribers  || 0;
  const niche     = intelligencePack.niche        || 'general';
  const serviceType = user.service_type || user.service || 'video editing';
  const proofPoint  = user.best_result || user.case_study || null;

  let selectedAngle = 'honest_observation';
  let openingObservation = '';
  let painAddressed = '';
  let angleReasoning = '';
  let ctaDirection = 'interest_check';

  // ── Priority 1: Confirmed job post / hiring signal ──────────────────────────
  if (pain.job_post_detected) {
    selectedAngle      = 'specific_fit';
    openingObservation = `Your channel description mentions you're looking for help — not many people in the ${niche} space with ${formatNum(subs)} subscribers are at that stage`;
    painAddressed      = 'actively searching for a service provider';
    angleReasoning     = 'Creator is explicitly looking — highest purchase intent signal available';
    ctaDirection       = 'sample_offer';
  }

  // ── Priority 2: Long upload gap + solo creator ──────────────────────────────
  else if (pain.upload_gap_over_14_days && pain.no_team_detected && hook.days_since_upload) {
    selectedAngle      = 'bottleneck_removal';
    openingObservation = hook.most_recent_video_title
      ? `"${hook.most_recent_video_title}" was uploaded ${hook.days_since_upload} days ago — nothing since`
      : `Last upload was ${hook.days_since_upload} days ago`;
    painAddressed      = 'editing bottleneck preventing consistent uploads';
    angleReasoning     = 'Solo creator with a significant upload gap — classic editing bottleneck signal';
    ctaDirection       = 'interest_check';
  }

  // ── Priority 3: Views declining ─────────────────────────────────────────────
  else if (pain.views_declining) {
    selectedAngle = 'diagnosis';
    if (hook.views_decline_pct && hook.recent_avg_views && hook.channel_avg_views) {
      openingObservation = `Last 3 videos averaged ${formatNum(hook.recent_avg_views)} views — down ${hook.views_decline_pct}% from the ${formatNum(hook.channel_avg_views)} channel average`;
    } else if (hook.most_recent_video_title) {
      openingObservation = `"${hook.most_recent_video_title}" underperformed your channel average`;
    } else {
      openingObservation = `View decline pattern on your channel — recent uploads averaging below your historical baseline`;
    }
    painAddressed  = 'views declining despite consistent content quality';
    angleReasoning = 'Declining view trend is a clear pain point — diagnosis angle creates curiosity about the cause';
    ctaDirection   = 'interest_check';
  }

  // ── Priority 4: Viral spike with plateau after ──────────────────────────────
  else if (
    hook.best_video_views && hook.recent_avg_views &&
    hook.best_video_views > hook.recent_avg_views * 4 &&
    hook.best_video_title
  ) {
    selectedAngle      = 'diagnosis';
    openingObservation = `"${hook.best_video_title}" hit ${formatNum(hook.best_video_views)} views. The most recent uploads are averaging ${formatNum(hook.recent_avg_views)}`;
    painAddressed      = 'unable to replicate breakout video performance';
    angleReasoning     = 'Major gap between best and recent performance — classic unreplicated viral spike';
    ctaDirection       = 'interest_check';
  }

  // ── Priority 5: Low view-to-sub ratio ──────────────────────────────────────
  else if (pain.low_view_sub_ratio && hook.view_sub_ratio_pct) {
    selectedAngle      = 'diagnosis';
    openingObservation = hook.most_recent_video_title
      ? `"${hook.most_recent_video_title}" — ${hook.view_sub_ratio_pct}% of ${formatNum(subs)} subscribers watched. That gap has a specific cause`
      : `${hook.view_sub_ratio_pct}% of ${formatNum(subs)} subscribers are watching each video`;
    painAddressed      = 'subscriber count far exceeding video views';
    angleReasoning     = 'Low view-to-sub ratio is a concrete, specific signal the creator will recognize';
    ctaDirection       = 'interest_check';
  }

  // ── Priority 6: Upload frequency slowing (not as severe as priority 2) ──────
  else if (pain.upload_frequency_dropped && hook.days_since_upload) {
    selectedAngle      = 'bottleneck_removal';
    openingObservation = `Upload frequency has been slowing — last video was ${hook.days_since_upload} days ago`;
    painAddressed      = 'declining upload consistency';
    angleReasoning     = 'Slowing frequency on a growing channel — bottleneck is likely production time';
    ctaDirection       = 'interest_check';
  }

  // ── Priority 7: Growth plateaued ────────────────────────────────────────────
  else if (pain.growth_plateaued && hook.channel_avg_views) {
    selectedAngle      = 'social_proof_mirror';
    openingObservation = `${formatNum(subs)} subscribers, ${formatNum(hook.channel_avg_views)} average views — holding consistent but not breaking through`;
    painAddressed      = 'channel stuck at the same performance level';
    angleReasoning     = 'Plateau is relatable — social proof mirror shows what breakthrough looks like for similar channels';
    ctaDirection       = 'sample_offer';
  }

  // ── Default: honest observation with most recent video ──────────────────────
  else {
    selectedAngle = 'honest_observation';
    openingObservation = hook.most_recent_video_title
      ? `"${hook.most_recent_video_title}" — ${formatNum(hook.recent_avg_views)} average views on ${formatNum(subs)} subscribers`
      : `${formatNum(subs)} subscribers in the ${niche} space`;
    painAddressed  = 'gap between current performance and channel potential';
    angleReasoning = 'No dominant pain signal — honest observation lets specificity do the work';
    ctaDirection   = 'interest_check';
  }

  return {
    selected_angle:    selectedAngle,
    selection_reasoning: angleReasoning,
    hook_data: {
      opening_observation:  openingObservation,
      pain_being_addressed: painAddressed,
      connection_to_service: `${serviceType} that directly addresses: ${painAddressed}`,
      proof_point:    proofPoint,
      cta_direction:  ctaDirection,
    },
    angle_specific_instructions: '',
  };
}

module.exports = { MARCUS_ANGLES, selectAngle };
