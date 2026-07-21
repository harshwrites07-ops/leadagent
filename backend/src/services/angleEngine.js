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
  scale_enabler: {
    id: 'scale_enabler',
    name: 'The Scale Enabler',
    description: 'Free up their time so they can keep scaling what\'s already working',
    psychology: ['ambition', 'opportunity_cost'],
  },
};

function formatNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

// Rule-based angle selection — returns the same structure the AI prompt returns.
// Candidates are evaluated in priority order; each `matches` predicate must be
// true for that candidate to be eligible. Structured as an array (not an
// if/else chain) so `excludeAngle` can skip a candidate and fall through to
// the next-best match — used by the AI gate's angle-switch regeneration
// (Marcus V2, Part 5) when the top angle scores under 70 twice in a row.
function buildAngleCandidates(intelligencePack, user) {
  const pain      = intelligencePack.pain_signals || {};
  const hook      = intelligencePack.hook_data    || {};
  const subs      = intelligencePack.subscribers  || 0;
  const niche     = intelligencePack.niche        || 'general';

  return [
    // ── Priority 1: Confirmed job post / hiring signal ──────────────────────
    {
      matches: () => pain.job_post_detected,
      selectedAngle: 'specific_fit',
      openingObservation: `Your channel description mentions you're looking for help — not many people in the ${niche} space with ${formatNum(subs)} subscribers are at that stage`,
      painAddressed: 'actively searching for a service provider',
      angleReasoning: 'Creator is explicitly looking — highest purchase intent signal available',
      ctaDirection: 'sample_offer',
    },
    // ── Priority 1.5: STRAINED (Session 1.1) — a detected schedule break is a
    // stronger, better-evidenced version of the generic upload-gap heuristic
    // below, so it's checked first. ──────────────────────────────────────────
    {
      matches: () => intelligencePack.lead_type === 'STRAINED' && intelligencePack.schedule_break,
      selectedAngle: 'bottleneck_removal',
      openingObservation: hook.most_recent_video_title
        ? `"${hook.most_recent_video_title}" — ${hook.days_since_upload} days since your last upload, after a much more consistent run before that`
        : `${hook.days_since_upload} days since your last upload, after a much more consistent run before that`,
      painAddressed: 'a consistent upload schedule that recently broke',
      angleReasoning: `Detected schedule break (severity ${intelligencePack.break_severity}x historical gap) — consistency angle addresses the specific, recent disruption`,
      ctaDirection: 'interest_check',
    },
    // ── Priority 2: Long upload gap + solo creator ──────────────────────────
    {
      matches: () => pain.upload_gap_over_14_days && pain.no_team_detected && hook.days_since_upload,
      selectedAngle: 'bottleneck_removal',
      openingObservation: hook.most_recent_video_title
        ? `"${hook.most_recent_video_title}" was uploaded ${hook.days_since_upload} days ago — nothing since`
        : `Last upload was ${hook.days_since_upload} days ago`,
      painAddressed: 'editing bottleneck preventing consistent uploads',
      angleReasoning: 'Solo creator with a significant upload gap — classic editing bottleneck signal',
      ctaDirection: 'interest_check',
    },
    // ── Priority 3: Views declining ──────────────────────────────────────────
    {
      matches: () => pain.views_declining,
      selectedAngle: 'diagnosis',
      openingObservation: hook.views_decline_pct && hook.recent_avg_views && hook.channel_avg_views
        ? `Last 3 videos averaged ${formatNum(hook.recent_avg_views)} views — down ${hook.views_decline_pct}% from the ${formatNum(hook.channel_avg_views)} channel average`
        : hook.most_recent_video_title
          ? `"${hook.most_recent_video_title}" underperformed your channel average`
          : `View decline pattern on your channel — recent uploads averaging below your historical baseline`,
      painAddressed: 'views declining despite consistent content quality',
      angleReasoning: 'Declining view trend is a clear pain point — diagnosis angle creates curiosity about the cause',
      ctaDirection: 'interest_check',
    },
    // ── Priority 4: Viral spike with plateau after ───────────────────────────
    {
      matches: () => hook.best_video_views && hook.recent_avg_views &&
        hook.best_video_views > hook.recent_avg_views * 4 && hook.best_video_title,
      selectedAngle: 'diagnosis',
      openingObservation: `"${hook.best_video_title}" hit ${formatNum(hook.best_video_views)} views. The most recent uploads are averaging ${formatNum(hook.recent_avg_views)}`,
      painAddressed: 'unable to replicate breakout video performance',
      angleReasoning: 'Major gap between best and recent performance — classic unreplicated viral spike',
      ctaDirection: 'interest_check',
    },
    // ── Priority 5: Low view-to-sub ratio ────────────────────────────────────
    {
      matches: () => pain.low_view_sub_ratio && hook.view_sub_ratio_pct,
      selectedAngle: 'diagnosis',
      openingObservation: hook.most_recent_video_title
        ? `"${hook.most_recent_video_title}" — ${hook.view_sub_ratio_pct}% of ${formatNum(subs)} subscribers watched. That gap has a specific cause`
        : `${hook.view_sub_ratio_pct}% of ${formatNum(subs)} subscribers are watching each video`,
      painAddressed: 'subscriber count far exceeding video views',
      angleReasoning: 'Low view-to-sub ratio is a concrete, specific signal the creator will recognize',
      ctaDirection: 'interest_check',
    },
    // ── Priority 6: Upload frequency slowing (not as severe as priority 2) ──
    {
      matches: () => pain.upload_frequency_dropped && hook.days_since_upload,
      selectedAngle: 'bottleneck_removal',
      openingObservation: `Upload frequency has been slowing — last video was ${hook.days_since_upload} days ago`,
      painAddressed: 'declining upload consistency',
      angleReasoning: 'Slowing frequency on a growing channel — bottleneck is likely production time',
      ctaDirection: 'interest_check',
    },
    // ── Priority 7: Growth plateaued ─────────────────────────────────────────
    {
      matches: () => pain.growth_plateaued && hook.channel_avg_views,
      selectedAngle: 'social_proof_mirror',
      openingObservation: `${formatNum(subs)} subscribers, ${formatNum(hook.channel_avg_views)} average views — holding consistent but not breaking through`,
      painAddressed: 'channel stuck at the same performance level',
      angleReasoning: 'Plateau is relatable — social proof mirror shows what breakthrough looks like for similar channels',
      ctaDirection: 'sample_offer',
    },
    // ── Priority 7.5: SCALING (Session 1.1) — growing steadily with real
    // upload volume, no schedule break; needs help keeping up, not rescue. ──
    {
      matches: () => intelligencePack.lead_type === 'SCALING',
      selectedAngle: 'scale_enabler',
      openingObservation: hook.most_recent_video_title
        ? `"${hook.most_recent_video_title}" — ${formatNum(hook.recent_avg_views)} average views on ${formatNum(subs)} subscribers and still climbing`
        : `${formatNum(subs)} subscribers and views still climbing — real momentum`,
      painAddressed: 'time constraints limiting how much of that momentum can be capitalized on',
      angleReasoning: 'Growing steadily with real upload volume, no break — the pitch is freeing up time to scale further, not fixing something broken',
      ctaDirection: 'interest_check',
    },
    // ── Default: honest observation with most recent video ──────────────────
    {
      matches: () => true,
      selectedAngle: 'honest_observation',
      openingObservation: hook.recent_video_fact?.comparison
        ? `"${hook.recent_video_fact.title}" — ${formatNum(hook.recent_video_fact.views)} views, ${hook.recent_video_fact.comparison}`
        : hook.most_recent_video_title
          ? `"${hook.most_recent_video_title}" — ${formatNum(hook.recent_avg_views)} average views on ${formatNum(subs)} subscribers`
          : `${formatNum(subs)} subscribers in the ${niche} space`,
      painAddressed: 'gap between current performance and channel potential',
      angleReasoning: 'No dominant pain signal — honest observation lets specificity do the work',
      ctaDirection: 'interest_check',
    },
  ];
}

function selectAngle(intelligencePack, user, opts = {}) {
  const serviceType = user.service_type || user.service || 'video editing';
  const proofPoint  = user.best_result || user.case_study || null;
  const excludeAngle = opts.excludeAngle || null;

  const candidates = buildAngleCandidates(intelligencePack, user);
  const winner = candidates.find(c => c.matches() && c.selectedAngle !== excludeAngle)
    || candidates[candidates.length - 1]; // default always matches — safety net

  return {
    selected_angle:    winner.selectedAngle,
    selection_reasoning: winner.angleReasoning,
    hook_data: {
      opening_observation:  winner.openingObservation,
      pain_being_addressed: winner.painAddressed,
      connection_to_service: `${serviceType} that directly addresses: ${winner.painAddressed}`,
      proof_point:    proofPoint,
      cta_direction:  winner.ctaDirection,
    },
    angle_specific_instructions: '',
  };
}

module.exports = { MARCUS_ANGLES, selectAngle };
