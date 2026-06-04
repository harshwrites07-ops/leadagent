// 50 god-level email examples — training data for the email generation system.
// Each example is tagged so the selector picks the 4 most relevant for each lead.

const EXAMPLE_BANK = [
  {
    id: 1, niches: ['finance'], situations: ['view_drop','hook_problem'],
    subject: 'your January drop',
    body: `Your December videos averaged 420K views.
January hit 67K. That's not the algorithm —
that's the 8-second hook you changed on Jan 3rd.

Worked with a finance creator in this exact spot. Fixed the hook structure and went from 71K back to 380K average in 4 videos.

Can I show you the before and after?`,
  },
  {
    id: 2, niches: ['fitness'], situations: ['upload_gap'],
    subject: 'your upload pattern',
    body: `You uploaded 14 times in October.
Twice in November. Once in December.

YouTube buried your channel after week 3 of silence. Your subscribers didn't leave — the algorithm just stopped showing you to them.

Helped a fitness creator rebuild from this exact pattern. Views recovered in 6 weeks.

Worth 5 minutes to talk about how?`,
  },
  {
    id: 3, niches: ['business'], situations: ['thumbnail','low_ctr'],
    subject: 'your thumbnails vs your content',
    body: `Your content is genuinely better than channels with 10x your subscribers.

But your thumbnails are losing you 70% of potential clicks before anyone even reads your title.

Redesigned thumbnails for a business creator at 45K subs — CTR went from 2.8% to 11.2%. Channel hit 200K within 4 months.

Want to see what I'd do with yours?`,
  },
  {
    id: 4, niches: ['tech'], situations: ['viral_gap','inconsistent'],
    subject: 'your 2.3M video',
    body: `That video on AI tools hit 2.3M views eight months ago.

You've uploaded 31 times since. Average views: 12K.

The gap isn't your content — it's that you never studied WHY that video worked and built a system around it.

Helped a tech creator decode their viral pattern. Next 6 videos all crossed 500K.

Open to a breakdown of what made it work?`,
  },
  {
    id: 5, niches: ['education','edu'], situations: ['watch_time_drop'],
    subject: 'people are leaving at 4 minutes',
    body: `Your videos average 11 minutes.
Your audience drops off at 4 minutes 2 seconds.

That means 7 minutes of every video you make is being watched by almost nobody.

Rewrote the structure for an education creator with the same problem. Watch time went from 4.1 to 9.3 minutes in 3 videos.

Want me to show you exactly where they're leaving?`,
  },
  {
    id: 6, niches: ['cooking'], situations: ['watch_time_drop','engagement'],
    subject: 'your watch time is lying to you',
    body: `Your mushroom pasta video has 847 comments.
Your watch time is 3.1 minutes on a 14-minute video.

People love your recipes but something in the editing is making them leave before you get to the best part.

Fixed this exact problem for a food creator — watch time doubled in 4 videos without changing a single recipe.

Worth a quick look?`,
  },
  {
    id: 7, niches: ['motivation'], situations: ['upload_gap','systems'],
    subject: 'what happened in March',
    body: `January you were uploading 3 times a week.
February twice. March once. April nothing.

I've seen this pattern with 6 motivation creators. It's not burnout — it's a systems problem not a passion problem.

Got a creator back from this exact spot to 2x per week consistently. Channel grew 140% in 90 days after.

Can I share what changed for them?`,
  },
  {
    id: 8, niches: ['realestate'], situations: ['content_pattern','stale'],
    subject: 'your last 20 videos',
    body: `Every single one of your last 20 videos follows the same format. Same intro. Same structure. Same outro.

Your audience has figured out exactly what's coming next — which means they have no reason to stay.

Helped a real estate creator break this pattern. Engagement rate went from 1.2% to 4.8% in 5 videos.

Want to see what we changed?`,
  },
  {
    id: 9, niches: ['gaming'], situations: ['plateau','subscriber_stall'],
    subject: 'you\'ve been stuck at 180K for 8 months',
    body: `You hit 180K subscribers in March. Today you're at 184K.

8 months of uploading 3x per week and barely moving. That plateau has a specific cause — and it's not your content.

Helped a gaming creator break through a 6-month plateau. Hit 400K in 3 months after one structural change.

Worth knowing what it was?`,
  },
  {
    id: 10, niches: ['lifestyle'], situations: ['wrong_audience','sponsorship'],
    subject: 'your audience isn\'t your buyer',
    body: `Your videos get solid views but your sponsorship rates are 60% below creators with half your subscribers.

Your audience demographic is misaligned with what brands pay for. That's fixable — but it requires changing who you attract, not how many.

Fixed this for a lifestyle creator — doubled their sponsorship revenue without gaining a single subscriber.

Open to a 10-minute conversation?`,
  },
  {
    id: 11, niches: ['finance'], situations: ['video_length','retention'],
    subject: 'nobody is finishing your videos',
    body: `Your average video is 24 minutes.
Your audience retention drops to 15% by minute 8.

That means 16 minutes of every video you make is essentially invisible.

Helped a finance creator cut average length to 11 minutes without losing a single key point. Views went up 340%.

Can I show you the framework?`,
  },
  {
    id: 12, niches: ['business'], situations: ['sub_conversion','subscribe_rate'],
    subject: 'you\'re losing subscribers daily',
    body: `You're getting 50K-80K views per video but converting less than 0.3% to subscribers.

Most channels your size convert 2-4%. That gap is costing you 800-2,400 subscribers per video you upload.

Fixed this for a business creator — subscription rate hit 3.1% and channel gained 40K subscribers in 60 days.

Worth fixing?`,
  },
  {
    id: 13, niches: ['health'], situations: ['thumbnail','wrong_emotion'],
    subject: 'your thumbnails are sending wrong signals',
    body: `Every thumbnail on your channel uses the same serious expression.

Health content converts 3x better with thumbnails that show transformation or hope, not authority. Your competitors know this.

Redesigned for a health creator — CTR went from 3.4% to 10.2% in 2 weeks.

Want to see the difference side by side?`,
  },
  {
    id: 14, niches: ['travel'], situations: ['seasonal','content_mix'],
    subject: 'why summer is hurting you',
    body: `90% of your content is summer destinations.
Your views drop 70% every October.

You're building an audience that disappears with the season instead of one that follows you year-round.

Helped a travel creator fix this content balance. Views stayed consistent through winter for the first time in 3 years.

Open to talking about how?`,
  },
  {
    id: 15, niches: ['beauty'], situations: ['content_mix','tutorial_fatigue'],
    subject: 'your tutorial views vs your story views',
    body: `Your tutorials average 45K views.
The two videos where you told personal stories averaged 380K.

Your audience is telling you exactly what they want and you're not listening.

Helped a beauty creator shift their content mix. Average views tripled in 6 weeks without changing production.

Worth a conversation?`,
  },
  {
    id: 16, niches: ['marketing','business'], situations: ['competitor_gap'],
    subject: 'why a competitor is passing you',
    body: `You and a similar channel started at the same time. You have 89K subscribers. They have 340K.

The content quality difference is minimal. The packaging difference is massive.

Studied both channels for 2 hours this morning. The gap comes down to 3 specific things.

Want me to show you what they are?`,
  },
  {
    id: 17, niches: ['podcast'], situations: ['wrong_format','length'],
    subject: 'your longest videos get fewest views',
    body: `Your 2-hour episodes average 8K views.
Your 18-minute highlight clips average 340K.

YouTube is telling you exactly what format your audience wants here.

Helped a podcast creator restructure their upload strategy. Monthly views went from 180K to 1.4M in 90 days.

Worth knowing the exact change?`,
  },
  {
    id: 18, niches: ['finance'], situations: ['missed_topic','comments'],
    subject: 'your comment section is a goldmine',
    body: `Went through 200 comments on your last 10 videos this morning.

47 people asked about the same topic you've never made a video about. That's a guaranteed 500K+ video sitting in your comment section right now.

Found this pattern for a finance creator — their video on that topic became their biggest of the year.

Want me to tell you what the topic is?`,
  },
  {
    id: 19, niches: ['fitness'], situations: ['hook_problem','first_seconds'],
    subject: 'you\'re losing them in 8 seconds',
    body: `Every video you start with "Hey guys welcome back to the channel."

Your audience skips the first 12 seconds on 94% of your videos.

That's 12 seconds of every video where you could be hooking them instead.

Rewrote hooks for a fitness creator — average view duration went from 4.2 to 8.7 minutes in one month.

Open to seeing the difference?`,
  },
  {
    id: 20, niches: ['education','edu'], situations: ['platform_strategy','cross_platform'],
    subject: 'YouTube is your smallest opportunity',
    body: `You have 234K YouTube subscribers.
4.2K Instagram followers. 800 Twitter followers.

Your audience wants to follow you everywhere but you're only showing up in one place.

Helped an education creator build cross-platform presence — YouTube growth accelerated 3x because of it.

Worth 10 minutes to explain how?`,
  },
  {
    id: 21, niches: ['tech'], situations: ['thumbnail','outdated'],
    subject: 'your 2022 thumbnail style',
    body: `Your thumbnail design hasn't changed since 2022. The platform has.

Viewers in 2026 respond to completely different visual triggers than 3 years ago. Your competitors updated. You haven't.

Redesigned for a tech creator stuck in the same spot — CTR doubled in the first week.

Want to see what changed?`,
  },
  {
    id: 22, niches: ['business'], situations: ['monetization','sponsorship'],
    subject: 'your 89K subscribers should be worth more',
    body: `At 89K subscribers in the business niche you should be generating $8K-15K monthly from sponsorships alone.

Based on your last 10 videos you're nowhere near that. The gap isn't your audience size — it's your pitch deck.

Helped a business creator fix their sponsorship approach. Revenue went from $1,200 to $11,000 per month in 60 days.

Worth a conversation?`,
  },
  {
    id: 23, niches: ['cooking'], situations: ['discovery','seo','traffic'],
    subject: 'nobody is finding your videos',
    body: `95% of your traffic comes from your existing subscribers.

That means almost nobody new is discovering you through search or browse. Your channel is slowly shrinking its potential reach every month.

Fixed this for a cooking creator — new viewer traffic went from 8% to 61% in 90 days.

Open to knowing how?`,
  },
  {
    id: 24, niches: ['motivation'], situations: ['title_formula','ctr'],
    subject: 'your titles are costing you clicks',
    body: `Went through your last 30 video titles.
Every single one starts with "How to" or "Why you should."

Your audience has seen that formula 10,000 times. It doesn't create curiosity anymore.

Rewrote title strategy for a motivation creator — average CTR went from 3.2% to 8.9% without changing a single video.

Want me to show you the new formula?`,
  },
  {
    id: 25, niches: ['realestate'], situations: ['wrong_audience','targeting'],
    subject: 'you\'re targeting the wrong audience',
    body: `Your content is written for local buyers but 73% of your audience is from states you don't operate in.

That mismatch is killing your conversion rate and confusing YouTube's algorithm about who to show your videos to.

Fixed this for a real estate creator — lead generation from YouTube went up 4x.

Worth 10 minutes to explain the fix?`,
  },
  {
    id: 26, niches: ['gaming'], situations: ['wrong_content_focus','niche_mismatch'],
    subject: 'your Minecraft videos vs everything else',
    body: `Your Minecraft videos average 340K views.
Every other game you cover averages 12K.

You've uploaded 47 non-Minecraft videos in the last 6 months. That's 47 videos fighting against what your audience actually came for.

Helped a gaming creator make this strategic pivot. Channel grew 280% in 4 months.

Want to see the content plan?`,
  },
  {
    id: 27, niches: ['lifestyle'], situations: ['sponsorship_mismatch','trust'],
    subject: 'your sponsors are hurting your channel',
    body: `Three of your last five sponsored videos have comment sections full of "this doesn't feel like you."

When your audience says that it means your trust score is dropping — which means future sponsor videos will perform even worse.

Helped a lifestyle creator fix their sponsorship selection. Engagement on sponsored content went up 340%.

Worth a conversation about how?`,
  },
  {
    id: 28, niches: ['finance'], situations: ['shorts_strategy','format_split'],
    subject: 'your Shorts are cannibalizing you',
    body: `You started posting Shorts in February.
Your long-form views dropped 40% in the same period.

This isn't coincidence — YouTube is splitting your audience between formats and your long-form is losing.

Helped a finance creator restructure their Shorts strategy. Long-form views recovered and Shorts added 60K subs.

Want to know the exact change?`,
  },
  {
    id: 29, niches: ['health'], situations: ['trust','conversion'],
    subject: 'your audience doesn\'t trust you yet',
    body: `Your content is excellent but your conversion rate on product recommendations is 0.2%.

Channels with half your quality and half your subscribers convert at 3-4%. The gap is trust architecture, not content. Your audience likes you but doesn't believe you enough to act yet.

Fixed this for a health creator — conversion rate went from 0.3% to 4.1%.

Open to understanding why?`,
  },
  {
    id: 30, niches: ['travel'], situations: ['production_quality','audio'],
    subject: 'one thing separating you from 1M subscribers',
    body: `Watched your last 8 videos back to back.
The content and storytelling are genuinely at 1M subscriber level.

The audio is at 10K subscriber level.

That single gap is what's holding your growth back. Everything else is there.

Fixed audio production for a travel creator — subscriber growth rate doubled in 30 days.

Want to know exactly what changed?`,
  },
  {
    id: 31, niches: ['business'], situations: ['posting_time','schedule'],
    subject: 'you\'re posting when nobody\'s watching',
    body: `Every single one of your videos posts at 2pm on Wednesdays.

Your audience analytics show peak engagement is Sunday at 8pm and Tuesday at 7am.

You're missing your own prime time every single week.

Optimized posting schedule for a business creator — views went up 67% without changing a single video.

Worth knowing more?`,
  },
  {
    id: 32, niches: ['education','edu'], situations: ['competitor_gap','structural'],
    subject: 'three channels are eating your lunch',
    body: `Three channels in your exact niche started after you and now have 2-3x your subscribers.

Spent this morning studying what they're doing differently. It comes down to one structural difference in how they format their content.

Helped an education creator make this shift — went from 45K to 210K subscribers in 5 months.

Want me to tell you what it is?`,
  },
  {
    id: 33, niches: ['tech'], situations: ['seo','description'],
    subject: 'YouTube can\'t figure out your channel',
    body: `Your video descriptions average 12 words each.

YouTube uses descriptions to understand what your content is about and who to show it to. With 12 words it's essentially guessing — and guessing wrong.

Fixed description strategy for a tech creator — organic discovery went up 340% in 60 days.

Want to see the exact template?`,
  },
  {
    id: 34, niches: ['fitness'], situations: ['demographic','wrong_audience'],
    subject: 'your audience is 12 years younger than your buyer',
    body: `Your audience is 78% male aged 18-24.

Every brand that pays premium rates in the fitness space targets males 28-40.

You're building the wrong audience for the revenue you want — and it's fixable before it gets harder to change.

Helped a fitness creator shift their demographic targeting. Sponsorship revenue tripled in 4 months.

Worth 10 minutes to explain how?`,
  },
  {
    id: 35, niches: ['cooking'], situations: ['viral_idea_wasted','thumbnail'],
    subject: 'your most viral idea performed worst',
    body: `Your "cooking with $5" video concept is genuinely viral-level creative.

It got 4K views because the thumbnail made it look like every other budget cooking video on the platform.

Redesigned the packaging for a cooking creator with the same problem — identical concept went from 3K to 890K views.

Want to see what changed?`,
  },
  {
    id: 36, niches: ['motivation'], situations: ['retention_cliff','script_structure'],
    subject: 'you lose 40% of viewers at exactly 2:17',
    body: `Analyzed your last 15 videos.
Every single one loses a significant chunk of viewers at the 2-minute mark.

That's a script structure pattern, not a content problem — something in your storytelling flow breaks at the same point every time.

Fixed this exact pattern for a motivation creator. Retention went from 34% to 61%.

Want me to show you where the break is?`,
  },
  {
    id: 37, niches: ['realestate'], situations: ['missed_topic','trend'],
    subject: 'the topic your audience keeps asking for',
    body: `In the last 90 days 340 people have asked you about interest rate strategy in your comment sections.

You haven't made a single video about it.

That's a 500K-view video sitting unanswered in your comments right now — and your competitors are about to find it.

Want to know the exact angle that would make it hit?`,
  },
  {
    id: 38, niches: ['gaming'], situations: ['collab','growth_shortcut'],
    subject: 'the collab that would double your channel',
    body: `You and a similar creator have almost identical audiences but never collaborated.

A single collab between channels your size in your niche typically moves 15-25K subscribers in both directions.

You've been growing at 800 subs/month. One collab could do 4 months of growth in a single video.

Want to know how to approach it?`,
  },
  {
    id: 39, niches: ['finance'], situations: ['content_pillars','structure'],
    subject: 'your channel has no structure',
    body: `Watched 20 of your videos.
Your content covers 14 different financial topics with no pattern.

Your audience can't predict what you'll cover next — which means they have no reason to subscribe and wait for your next video.

Built content pillar system for a finance creator in this spot — subscriber retention went up 340%.

Worth understanding how?`,
  },
  {
    id: 40, niches: ['lifestyle'], situations: ['video_length','format'],
    subject: 'your 22-minute videos are too long',
    body: `Your audience retention data says they want 8-11 minute videos.

You're making 18-24 minute videos because you think more value means longer content.

It doesn't — and it's costing you 2-3x the views you could be getting.

Helped a lifestyle creator make this shift. Views doubled within 30 days.

Want to see the exact framework?`,
  },
  {
    id: 41, niches: ['tech'], situations: ['community','engagement'],
    subject: '340K subscribers and no community',
    body: `You have 340K subscribers and you've posted 3 community tab updates in the last year.

Your competitors with 80K subscribers post 4-5 times per week and have engagement rates 8x higher than yours.

Built community strategy for a tech creator — channel revenue went up $4,200/month from community alone.

Worth 10 minutes?`,
  },
  {
    id: 42, niches: ['education','edu'], situations: ['language_level','audience_mismatch'],
    subject: 'you\'re talking above your audience',
    body: `Your content is brilliant but your language complexity is calibrated for someone with a PhD.

Your YouTube analytics show your audience average age is 19-24. They're leaving not because they don't care — because they can't follow.

Simplified content approach for an education creator — watch time went from 3.8 to 9.2 minutes average.

Open to a conversation?`,
  },
  {
    id: 43, niches: ['business'], situations: ['email_list','platform_risk'],
    subject: 'you\'re building on rented land',
    body: `340K YouTube subscribers.
Zero mention of an email list anywhere.

YouTube can change the algorithm tomorrow and your entire audience disappears.

Helped a business creator build this safety net — 34K email subscribers in 90 days from existing YouTube content.

Want to know the exact method?`,
  },
  {
    id: 44, niches: ['fitness'], situations: ['social_proof','transformation'],
    subject: 'nobody believes your results yet',
    body: `Your workout content is solid but you haven't shown a single transformation result in 8 months of uploading.

In the fitness space transformations are the only social proof that converts.

Helped a fitness creator implement a transformation showcase strategy — channel went from 12K to 89K in 4 months.

Worth knowing how they did it?`,
  },
  {
    id: 45, niches: ['cooking'], situations: ['seasonal','timing'],
    subject: 'you\'re one month behind every trend',
    body: `Your holiday content consistently posts 3-4 weeks after peak search volume.

Thanksgiving content that peaks Nov 15th shouldn't post November 28th.

You're creating perfect content and missing the window every single time.

Fixed content calendar for a cooking creator — seasonal video views went up 4x in the first quarter.

Want the exact calendar framework?`,
  },
  {
    id: 46, niches: ['motivation'], situations: ['cta','subscribe'],
    subject: 'you\'re asking for too much',
    body: `Every video ends with "smash that subscribe button and turn on notifications."

In 2026 that CTA converts at 0.1%.

You're burning your best opportunity to grow with the most overused 4 seconds on YouTube.

Changed end screen strategy for a motivation creator — subscribe conversion went from 0.08% to 2.3%.

Worth knowing what replaced it?`,
  },
  {
    id: 47, niches: ['realestate'], situations: ['shorts','vertical_video'],
    subject: 'you have zero Shorts presence',
    body: `Your competitors in real estate are getting 2-3M Shorts views per month from content they make in 20 minutes.

You've uploaded zero Shorts in 18 months of being on the platform.

Built Shorts strategy for a real estate creator — added 28K subscribers in 60 days from zero short-form presence.

Want to see the exact content approach?`,
  },
  {
    id: 48, niches: ['gaming'], situations: ['monetization','revenue'],
    subject: 'you\'re leaving $3K-8K per month untouched',
    body: `At 234K subscribers in gaming you should be generating significant membership and merchandise revenue.

You have neither set up.

Helped a gaming creator launch both in the same week — added $4,800/month in recurring revenue without a single extra video.

Worth 10 minutes to understand how?`,
  },
  {
    id: 49, niches: ['finance'], situations: ['interview_format','collaboration'],
    subject: 'the format change that would 3x your views',
    body: `Every video you make is solo.

The top 5 finance channels at your subscriber count all do interview or collaboration content at least once per month.

Those videos average 4x more views than solo content in your niche.

Helped a finance creator launch an interview series — channel grew 180% in 3 months.

Want to see the exact launch approach?`,
  },
  {
    id: 50, niches: ['lifestyle'], situations: ['personal_brand','trust'],
    subject: 'nobody knows who you are yet',
    body: `Watched 15 of your videos.
You're a great presenter but after 15 videos I still don't know anything real about you.

In lifestyle content personal brand is the product. Your audience needs to know you to trust you to buy from you.

Helped a lifestyle creator build their personal brand into content — sponsorship rates went from $800 to $4,200 per video in 4 months.

Worth a conversation?`,
  },
];

// Situations that map to lead data signals
function detectSituations(lead) {
  const subs      = lead.subscriber_count || 0;
  const avgViews  = lead.avg_views || 0;
  const situations = [];

  const recentVideos = (() => {
    try { return JSON.parse(lead.recent_videos || '[]'); } catch { return []; }
  })();

  const daysSince = lead.last_upload_date
    ? Math.floor((Date.now() - new Date(lead.last_upload_date)) / 86400000) : null;

  // Upload gap
  if (daysSince !== null && daysSince > 14) situations.push('upload_gap');

  // View/sub ratio
  const ratio = subs > 0 ? avgViews / subs : 0;
  if (ratio < 0.05 && subs > 5000) situations.push('low_ctr');
  if (ratio < 0.03 && subs > 10000) situations.push('wrong_audience');

  // View trend
  if (recentVideos.length >= 4) {
    const rAvg = recentVideos.slice(0, 3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    const oAvg = recentVideos.slice(-3).reduce((a, v) => a + (v.views || 0), 0) / 3;
    if (rAvg < oAvg * 0.65) situations.push('view_drop', 'hook_problem');
    if (rAvg > oAvg * 1.3)  situations.push('growing');
  }

  // Viral gap
  if (recentVideos.length >= 3) {
    const sorted = [...recentVideos].sort((a, b) => (b.views || 0) - (a.views || 0));
    if (sorted[0] && sorted[sorted.length - 1]) {
      const maxV = sorted[0].views || 0;
      const minV = sorted[sorted.length - 1].views || 0;
      if (maxV > minV * 8) situations.push('inconsistent', 'viral_gap');
    }
  }

  // Subscriber plateau (can't detect from current data, but add as general)
  if (subs > 50000 && ratio < 0.04) situations.push('plateau');

  return situations;
}

// Normalize niche string to match example niche tags
function normalizeNiche(niche) {
  const n = (niche || '').toLowerCase();
  if (/finance|invest|stock|crypto|wealth|money|trading/.test(n)) return 'finance';
  if (/fitness|gym|workout|health|wellness|nutrition/.test(n))    return 'fitness';
  if (/business|entrepreneur|startup|agency|marketing/.test(n))   return 'business';
  if (/tech|software|coding|developer|AI/.test(n))                return 'tech';
  if (/cook|food|recipe|chef|baking/.test(n))                     return 'cooking';
  if (/gaming|game|esport/.test(n))                               return 'gaming';
  if (/travel|adventure|nomad/.test(n))                           return 'travel';
  if (/beauty|makeup|skincare|fashion/.test(n))                   return 'beauty';
  if (/education|learn|teach|tutor|course/.test(n))               return 'education';
  if (/lifestyle|vlog|personal/.test(n))                          return 'lifestyle';
  if (/motivation|mindset|self.improvement/.test(n))              return 'motivation';
  if (/real.estate|property|realtor|housing/.test(n))             return 'realestate';
  if (/health|medical|doctor|therapy/.test(n))                    return 'health';
  if (/podcast/.test(n))                                          return 'podcast';
  return n;
}

/**
 * Pick the 4 most relevant examples for a given lead.
 * Scoring: +2 niche match, +1 per situation match
 */
function selectExamples(lead, count = 4) {
  const detectedNiche      = normalizeNiche(lead.niche || '');
  const detectedSituations = detectSituations(lead);

  const scored = EXAMPLE_BANK.map(ex => {
    let score = 0;
    if (ex.niches.includes(detectedNiche))     score += 2;
    for (const s of detectedSituations) {
      if (ex.situations.includes(s)) score += 1;
    }
    return { ...ex, score };
  });

  // Sort: first by score desc, then shuffle ties
  scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);

  // Take top `count`, but always include at least 1 niche match if available
  const nicheMatch   = scored.filter(e => e.niches.includes(detectedNiche)).slice(0, 2);
  const otherBest    = scored.filter(e => !e.niches.includes(detectedNiche)).slice(0, count - nicheMatch.length);
  const selected     = [...nicheMatch, ...otherBest].slice(0, count);

  return selected.map((ex, i) => (
    `EXAMPLE ${i + 1} — ${ex.niches[0]} creator:\nSubject: ${ex.subject}\n${ex.body}`
  )).join('\n\n---\n\n');
}

module.exports = { selectExamples, EXAMPLE_BANK };
