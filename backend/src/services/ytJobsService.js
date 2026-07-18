// Ingests job listings from ytjobs.co — creators/companies hiring YouTube
// editors, thumbnail designers, scriptwriters, etc. A YT Jobs lead is the
// highest-intent source in the pipeline: the creator STATED the need
// themselves, so it feeds scoreCloseability()'s has_buying_trigger with the
// heaviest positive weight (see utils/scoring.js CLOSEABILITY_WEIGHTS).
//
// FETCH LAYER — DEFERRED. Confirmed directly (2026-07-18, live browser
// session): ytjobs.co sits behind Cloudflare's JS bot-challenge. Both a
// plain HTTP fetch and an axios-style request return 403 before any content
// loads — real listings only render after a full browser executes
// Cloudflare's challenge. That's a materially heavier requirement than every
// other scraper in this codebase (innertubeService.js hits YouTube's own
// internal API directly with plain axios — no browser, no challenge).
// fetchJobListingsHTML() below is a stub that returns null and logs a
// warning — the same "degrade to empty, never throw" pattern
// innertubeService.js already uses for ITS OWN parse failures, so this
// fails the same safe way rather than crashing a cycle. Swap it for a real
// Cloudflare-capable fetch (headless browser or a paid scraping API) when
// approved; everything downstream (parsing, scoring, DB write, Marcus
// wiring) is real and tested now.
//
// PARSER — the selectors below are mapped against REAL captured DOM from
// ytjobs.co/job/search/ and an individual /job/:id page (live browser
// session, 2026-07-18), not guessed:
//   - Each listing card: <div data-testid="jobCardElement">...<a href="/job/{id}">
//   - Title:      .card-job-title
//   - Pay/type:   .card-job-type p        e.g. "$90,000 Per Year . Full-time",
//                                              "$30-$50 Per project", "Per project"
//   - Location:   .card-job-location p    e.g. "Remote", "Onsite . Las Vegas, NV, US"
//   - Categories: .styles-categories .category / .style (both optional)
//   - Poster:     .thumbnail-container .name        (creator/company display name)
//                 .thumbnail-container .subscribers  ("15.9M subs", or literally
//                                                      "Company" for agency posters)
//   - Detail page (/job/{id}): h1 .job-title + .company-name (" | Name (subs)"),
//                               "Posted on: <Mon DD YYYY>" text, full description body.
//                               No YouTube channel link was present on any listing
//                               inspected — channel resolution is opportunistic
//                               (see findYoutubeLink), never guessed from a name.

const { getDb } = require('../models/database');
const {
  scoreCloseability, detectTeamSignal, getTemperature, JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE,
} = require('../utils/scoring');

const YTJOBS_BASE = 'https://ytjobs.co';
const YTJOBS_SEARCH_URL = `${YTJOBS_BASE}/job/search/`;

// Role-type keyword map — order matters (checked top to bottom; 'editor' and
// 'thumbnail' checked before broader terms so a "Video Editor" title doesn't
// fall through to 'other'). Tunable without touching detection logic.
const ROLE_TYPE_KEYWORDS = {
  thumbnail: ['thumbnail'],
  editor: ['video editor', 'editor', 'editing', 'clipper'],
  scriptwriter: ['scriptwriter', 'script writer', 'researcher', 'writer'],
  channel_manager: ['channel manager', 'production manager', 'youtube producer', 'youtube strategist'],
  motion_graphics: ['motion graphics', 'animator', 'animation'],
};

function detectRoleType(title) {
  const lower = (title || '').toLowerCase();
  for (const [role, keywords] of Object.entries(ROLE_TYPE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return role;
  }
  return 'other';
}

function parseSubscriberText(text) {
  if (!text || /company/i.test(text)) return null;
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)\s*subs?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] || 1;
  return Math.round(n * mult);
}

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirst(re, text) {
  const m = (text || '').match(re);
  return m ? m[1].trim() : null;
}

// ── Search-results page parsing ─────────────────────────────────────────────

function splitJobCards(html) {
  if (!html) return [];
  // Each card chunk starts at its own data-testid marker; drop the preamble
  // before the first card.
  return html.split('data-testid="jobCardElement"').slice(1);
}

function parseJobCard(chunk) {
  const href = extractFirst(/<a href="(\/job\/\d+)"/, chunk);
  const titleHtml = extractFirst(/<h4[^>]*card-job-title[^>]*>([\s\S]*?)<\/h4>/, chunk);
  if (!href || !titleHtml) return null; // not a real card — skip defensively, never throw

  // card-job-type / card-job-location each contain an <svg> icon followed by
  // a single <p> with the actual text — extracting the <p> directly (rather
  // than the whole containing <div>...</div>) avoids having to balance
  // nested closing tags with regex, which regex can't do reliably.
  const payText = extractFirst(/card-job-type[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/, chunk);
  const locationText = extractFirst(/card-job-location[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/, chunk);
  const posterName = extractFirst(/<div class="name">([\s\S]*?)<\/div>/, chunk);
  const subscriberText = extractFirst(/<div class="subscribers">([\s\S]*?)<\/div>/, chunk);

  // .category/.style divs are matched directly against the whole card chunk
  // rather than first isolating their .styles-categories container — that
  // container can hold TWO+ nested divs of the same tag, which a single
  // non-greedy regex can't balance (it would stop at the first nested close).
  const categories = [...chunk.matchAll(/<div class="(?:category|style)">([\s\S]*?)<\/div>/g)]
    .map(m => stripTags(m[1])).filter(Boolean);

  return {
    jobId: href.split('/').pop(),
    jobUrl: `${YTJOBS_BASE}${href}`,
    title: stripTags(titleHtml),
    payText: stripTags(payText) || null,
    locationText: stripTags(locationText) || null,
    categories,
    posterName: posterName ? stripTags(posterName) : null,
    isCompanyPoster: /company/i.test(subscriberText || ''),
    subscriberCount: parseSubscriberText(subscriberText),
  };
}

function parseJobCardsFromSearchHTML(html) {
  return splitJobCards(html).map(parseJobCard).filter(Boolean);
}

// ── Job detail page parsing ─────────────────────────────────────────────────

function parseJobDetailHTML(html) {
  if (!html) return null;
  const text = stripTags(html);
  const postedText = extractFirst(/Posted on:\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/, text);
  let postedDate = null;
  if (postedText) {
    const d = new Date(postedText);
    if (!Number.isNaN(d.getTime())) postedDate = d.toISOString();
  }
  return {
    postedDate,
    fullText: text.slice(0, 4000), // cap stored size — this feeds job_context, not unbounded
  };
}

// Looks for a youtube.com/youtu.be URL within the given text (title +
// description). Never guesses a channel from a display name alone — two
// different creators can share a display name, and a wrong match would
// silently corrupt a real lead's identity. Returns the raw URL (getChannelByUrl
// resolves + fetches in one call) or null if none is present.
function findYoutubeLink(text) {
  const m = (text || '').match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"')<]+/i);
  return m ? m[0] : null;
}

// ── Fetch layer (deferred — see file header) ────────────────────────────────

async function fetchJobListingsHTML(url) {
  console.warn(`[YTJobs] fetchJobListingsHTML() is a stub for ${url} — ytjobs.co requires a Cloudflare-capable fetch (see file header TODO). Returning no listings this cycle.`);
  return null;
}

// ── Ingestion — routes through the SAME channel enrichment + email
// validation every other lead gets (youtubeService.getChannelByUrl() ->
// buildChannelProfile(), which already runs emailFilters.extractEmail()
// internally — see commit 8bd54c0). No parallel ingestion path. ──────────

const MASTER_INSERT_SQL = `INSERT OR IGNORE INTO master_leads (channel_id, channel_name, channel_handle, subscriber_count, avg_views, email, website, channel_description, lead_score, temperature, country, niche, has_team_confidence, team_evidence, source, job_context, budget_confidence, budget_evidence) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

async function ingestJobListing({ card, detail }) {
  const fullText = [card.title, detail?.fullText].filter(Boolean).join('\n\n');
  const roleType = detectRoleType(card.title);

  const youtubeLink = findYoutubeLink(fullText);
  if (!youtubeLink) {
    console.log(`[YTJobs] Skipped "${card.title}" (${card.posterName || 'unknown poster'}) — no resolvable YouTube channel link, cannot enrich a contact email through the existing pipeline`);
    return { inserted: false, reason: 'no_channel_link' };
  }

  let channelData;
  try {
    const { getChannelByUrl } = require('./youtubeService');
    channelData = await getChannelByUrl(youtubeLink);
  } catch (e) {
    console.log(`[YTJobs] Channel enrichment failed for "${card.title}" (${youtubeLink}): ${e.message}`);
    return { inserted: false, reason: 'enrichment_failed' };
  }

  if (!channelData?.email) {
    return { inserted: false, reason: 'no_email' };
  }

  const jobContext = {
    role_type: roleType,
    budget_text: card.payText || null,
    location_text: card.locationText || null,
    categories: card.categories,
    post_date: detail?.postedDate || null,
    listing_url: card.jobUrl,
    listing_text: fullText.slice(0, 2000),
    poster_name: card.posterName,
    is_company_posting: !!card.isCompanyPoster,
  };

  // Detected general channel signal, kept honest in has_team_confidence —
  // NOT what scoring uses (see below).
  const { confidence: detectedTeamConfidence, evidence: teamEvidence } = detectTeamSignal({
    channel_name: channelData.channel_name,
    channel_description: channelData.channel_description,
    subscriber_count: channelData.subscriber_count,
  });

  // Scoring uses the override: this listing is direct evidence the creator
  // lacks THIS role right now, regardless of what branding/size alone would
  // suggest about a team in general (see JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE).
  const { score, tier, signals, budget_evidence } = scoreCloseability({
    subscriber_count: channelData.subscriber_count,
    avg_views: channelData.avg_views,
    channel_description: channelData.channel_description,
    has_team: JOB_ROLE_TEAM_OVERRIDE_CONFIDENCE,
    has_buying_trigger: true, // stated intent — the whole point of this source
  });

  const db = getDb();
  const r = await db.run(MASTER_INSERT_SQL, [
    channelData.channel_id, channelData.channel_name, channelData.channel_handle,
    channelData.subscriber_count, channelData.avg_views, channelData.email, channelData.website,
    channelData.channel_description, score, getTemperature(score),
    channelData.country || null, roleType,
    detectedTeamConfidence,
    teamEvidence.length ? JSON.stringify(teamEvidence) : null,
    'ytjobs',
    JSON.stringify({ ...jobContext, team_override_applied: true, general_team_confidence: detectedTeamConfidence }),
    signals.budget,
    budget_evidence.length ? JSON.stringify(budget_evidence) : null,
  ]);

  return { inserted: r.changes > 0, channelId: channelData.channel_id, score, tier, roleType };
}

// ── Cycle entrypoint — mirrors innertubeService's defensive patterns:
// try/catch -> skip per-listing, Promise.allSettled batch isolation, never
// let one bad listing kill the batch. ───────────────────────────────────────

async function runYtJobsCycle() {
  let cards = [];
  try {
    const html = await fetchJobListingsHTML(YTJOBS_SEARCH_URL);
    cards = parseJobCardsFromSearchHTML(html);
  } catch (e) {
    console.warn(`[YTJobs] Failed to fetch/parse listing page: ${e.message}`);
  }

  if (!cards.length) {
    try {
      const { recordScraperHealth } = require('./scraperHealth');
      await recordScraperHealth('ytjobs', { attempted: 0, succeeded: 0, failed: 0 });
    } catch {}
    return { attempted: 0, inserted: 0, skipped: 0 };
  }

  console.log(`[YTJobs] Parsed ${cards.length} job card(s) from listing page`);

  const results = await Promise.allSettled(cards.map(async card => {
    let detail = null;
    try {
      const detailHtml = await fetchJobListingsHTML(card.jobUrl);
      detail = parseJobDetailHTML(detailHtml);
    } catch {}
    return ingestJobListing({ card, detail });
  }));

  let inserted = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.inserted) inserted++;
  }
  const skipped = cards.length - inserted;

  try {
    const { recordScraperHealth } = require('./scraperHealth');
    await recordScraperHealth('ytjobs', { attempted: cards.length, succeeded: inserted, failed: skipped });
  } catch {}

  console.log(`[YTJobs] Cycle done — ${inserted}/${cards.length} listings ingested (${skipped} skipped — see per-listing logs above)`);
  return { attempted: cards.length, inserted, skipped };
}

// Job postings don't churn nearly as fast as YouTube uploads — a lighter
// cadence than the ~30min YouTube/InnerTube seeders is appropriate once the
// fetch layer is live. Overridable without a redeploy, same pattern as
// backgroundSeeder.js's SEEDER_CYCLE_PAUSE_MS.
const YTJOBS_CYCLE_PAUSE_MS = parseInt(process.env.YTJOBS_CYCLE_PAUSE_MS || '', 10) || 60 * 60 * 1000;

const ytJobsSeederStatus = { running: false, lastCycleAt: null, lastCycleResult: null, totalCycles: 0 };

async function startYtJobsSeeder() {
  console.log(`[YTJobs] Seeder started — cycle every ~${Math.round(YTJOBS_CYCLE_PAUSE_MS / 60000)}min (fetch layer deferred, see file header)`);
  while (true) {
    ytJobsSeederStatus.running = true;
    try {
      ytJobsSeederStatus.lastCycleResult = await runYtJobsCycle();
      ytJobsSeederStatus.lastCycleAt = new Date().toISOString();
      ytJobsSeederStatus.totalCycles++;
      ytJobsSeederStatus.running = false;
      await new Promise(r => setTimeout(r, YTJOBS_CYCLE_PAUSE_MS));
    } catch (e) {
      console.error('[YTJobs] Cycle error:', e.message);
      ytJobsSeederStatus.running = false;
      await new Promise(r => setTimeout(r, 60000));
    }
  }
}

module.exports = {
  runYtJobsCycle, ingestJobListing, fetchJobListingsHTML,
  parseJobCardsFromSearchHTML, parseJobCard, parseJobDetailHTML,
  detectRoleType, parseSubscriberText, findYoutubeLink,
  ROLE_TYPE_KEYWORDS, startYtJobsSeeder, ytJobsSeederStatus,
};
