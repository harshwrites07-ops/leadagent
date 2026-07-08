# ContentCrafterzz Lead Generation System — Production Audit

**Scope:** Full lead pipeline, backend only (`backend/src`), Postgres-on-Railway production target.
**Method:** Every file below was read in full (not skimmed). Every claim is cited with file path + line number + verbatim code. Severity: **CRITICAL** (data loss / wrong data shown to paying users / silent failure) · **HIGH** (accuracy loss / quota waste) · **MEDIUM** (perf/maintainability) · **LOW** (cleanup).

---

## 0. Read this first — the "6 signals" in your brief don't exist under those names

You asked me to audit six named signals: `upload_gap`, `video_drop`, `ratio_gap`, `viral_gap`, `frequency_slow`, `confirmed_hiring`. I grepped the entire backend for these exact strings before writing anything. **They exist, but not in the lead-scoring engine.**

They live in `backend/src/services/claudeService.js:426-581`, inside `getServiceIntelligence()` — a function that picks which **pitch-email opening line/angle** to use when generating outreach copy. They feed `scorePitchQuality()` (a 0–100 email-quality heuristic), not a lead's `intent_score`. This is a separate subsystem from lead qualification.

The signals that actually produce `intent_score` / HOT-WARM-COLD (the thing "Quality Leads" and PowerMode are built on) are two **different** systems, both in `backend/src/services/intentService.js`:

1. **`calculateIntentScore()`** (used for the per-user `leads` table, when full video history is available): `upload_frequency`, `view_growth`, `title_keywords`, `description_keywords`, `engagement_rate`, `upload_consistency` — weighted 20/20/25/20/10/5.
2. **`scoreMasterLead()`** (used for `master_leads → quality_leads`, i.e. **the actual production pipeline behind Quality Leads and PowerMode**, since `master_leads` lacks video history): `niche_score`, `subs_score`, `views_score`, `desc_score` — weighted 40/40/15/5 — plus a separate `confirmed_hiring` cross-platform boost layer.

Section 2 below audits both real systems in full, plus the six signals as they actually exist in `claudeService.js`, since your naming clearly refers to that function. **The single most consequential finding of this whole audit is in the `scoreMasterLead`/`confirmed_hiring` boost chain — read §2.3.**

---

## 1. Scraping Layer

### 1.1 Entry points and flow

| Entry point | File | Live YouTube API call? | Writes to |
|---|---|---|---|
| 24/7 background DB builder | `backgroundSeeder.js` `startBackgroundSeeder()` | Yes — `search.list` + `channels.list`, official key rotation; falls back to InnerTube (unofficial) if all keys exhausted | `master_leads` |
| Quality/signal loop | `scraperLoopService.js` `startLoop()`, every 2h | No new discovery — re-scores existing `master_leads` and runs Reddit/Upwork/Twitter/confirmed-signal scans | `quality_leads`/`archived_leads`/`platform_signals` |
| **"PowerMode" #1** (the one wired to the actual UI button) | `routes/scraper.js` `/api/scraper/powermode/start` | **No** — it's a filtered copy from the already-seeded `master_leads` pool into the user's `leads` table | user's `leads` |
| **"PowerMode" #2** (only reachable via AI-assistant chat) | `routes/assistant.js` `trigger_powermode` | **Yes** — live `search.list` via a separate hardcoded 15-keyword list | user's `leads` |
| Manual Lead Finder / niche hunt | `routes/scraper.js` `/hunt` | Yes — `search.list` (type=channel) → `channels.list` → `playlistItems`/`videos` for scoring | user's `leads` |

**Finding (MEDIUM) — two incompatible things are both named "PowerMode."** `routes/scraper.js:114-194` (instant DB-copy) and `routes/assistant.js:533-548` (live API, different keyword list) diverge in behavior depending on which UI surface triggers them. A future change to filtering/thresholds in one silently doesn't apply to the other.
**Fix:** make the assistant's `trigger_powermode` tool call the same `/api/scraper/powermode/start` handler instead of re-implementing scraping.

### 1.2 The 500+ keyword engine is dead code

`backend/src/services/masterKeywords.js` defines 544 keywords across 16 niches, with a header comment: *"Used by PowerMode to rotate fresh keywords every run."* **This is false.** Confirmed by repo-wide grep — `masterKeywords` has zero importers anywhere in the codebase.

```
$ grep -rn "masterKeywords" backend/   →  no files found (outside the file itself)
```

The actual 24/7 seeder (`backgroundSeeder.js`) uses its own separate, inline `KEYWORD_NICHE_MAP` (512 entries), which it fully shuffles and processes every cycle (`backgroundSeeder.js:608`) — so coverage there is fine. But `masterKeywords.js`'s own `getRandomKeywords()` (line 181-187) does `[...keywords].sort(() => Math.random() - 0.5)` — a **fresh random shuffle with no persisted cursor** — which is not true rotation and would repeat/skip keywords with no coverage guarantee, if anything ever called it.

**Finding (HIGH) — no dead-keyword deprioritization anywhere.** `seeder_keyword_tokens` (the pagination-cursor table) tracks only `next_page_token`/`pages_done` per keyword+key, never a result count. A keyword that has returned 0 qualifying leads for months keeps consuming the exact same `search.list` quota share as a high-yield one, forever.
**Fix:**
```sql
ALTER TABLE seeder_keyword_tokens ADD COLUMN zero_result_streak INTEGER DEFAULT 0;
```
Increment on a cycle that saves 0 leads for that keyword; skip/deprioritize once the streak exceeds a threshold (e.g. 10).

**Finding (MEDIUM) — delete or wire in `masterKeywords.js`.** As-is it's 544 keywords of dead code with a misleading docstring that will mislead the next engineer who edits it expecting an effect.

### 1.3 API key pool

- Keys are loaded as `YOUTUBE_API_KEY_1` through `_50` plus a legacy `YOUTUBE_API_KEY` (`youtubeService.js:16-23`, `backgroundSeeder.js:419-429`) — the pool isn't hardcoded to 8; it scales to however many env vars are set. (Locally only 7 were configured — worth reconciling against actual Railway env count via `GET /api/admin/seeder-status`.)
- **Quota tracking is in-memory only, on two separate, never-synced trackers**: `youtubeService.js:10`'s module-level `exhaustedKeys` Set (reset every 24h by a `setTimeout`), and `backgroundSeeder.js`'s per-cycle local `exhausted` boolean (reset every ~10-second cycle). A key marked dead in one has zero effect on the other.
- **What counts as "exhausted" is inconsistent between the two paths.** `youtubeService.js:ytGet` (lines 61-63) correctly checks the actual error `reason` field (`quotaExceeded`/`dailyLimitExceeded`/`rateLimitExceeded`). `backgroundSeeder.js:540` treats **any** HTTP 403 as quota exhaustion:
  ```js
  if (e.response?.status === 403 || e.response?.status === 429) {
    exhausted = true;
    console.log(`[Seeder] Key exhausted: ${apiKey.slice(-6)}`);
  }
  ```
  A misconfigured (but not quota-dead) key — API not enabled, referrer restriction — gets misreported as "exhausted" with no reason logged, masking a fixable root cause. Low impact since it resets every cycle, but it hides signal from whoever's debugging.
  **Fix:**
  ```js
  const reason = e.response?.data?.error?.errors?.[0]?.reason;
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded' || e.response?.status === 429) {
    exhausted = true;
    console.log(`[Seeder] Key exhausted (${reason || e.response?.status}): ${apiKey.slice(-6)}`);
  } else {
    console.log(`[Seeder] Key error (not quota, reason=${reason}, status=${e.response?.status}): ${apiKey.slice(-6)}`);
  }
  ```

- **All-keys-exhausted scenario for the main seeder: handled correctly, NOT silent.** `backgroundSeeder.js:624-625` explicitly falls back to InnerTube scraping and logs `'[Seeder] All YouTube API keys exhausted — switching to InnerTube fallback'`. This is the one part of the "silent failure" concern that is genuinely fine.

- **CRITICAL — the advanced signal scanner has no fallback and swallows errors with zero logging.** `youtubeAdvancedService.js:68-70` and `:111`:
  ```js
  } catch (e) {
    // Skip channels with errors
  }
  ```
  (verified directly — see excerpt below). Neither `fetchWithKey` nor its callers check for quota/429 the way `youtubeService.js` does, and no `markExhausted()` call happens here, so a dead key isn't even recorded in the shared exhaustion Set. This runs every 3rd cycle of the 2-hour loop; when it fails, the console only ever shows `[Loop] YT Advanced: 0 community signals found` — indistinguishable from a legitimately quiet cycle. **This is the exact "scraper running, producing zero output, no signal to the operator" scenario the brief asked about.**
  ```
  // youtubeAdvancedService.js:76-114 (verified directly)
      } catch {}
      ...
      } catch (e) {
      }
  ```
  **Fix:**
  ```js
  async function fetchWithKey(url) {
    const key = getNextKey();
    const response = await fetch(`${url}&key=${key}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const reason = body?.error?.errors?.[0]?.reason;
      const err = new Error(`HTTP ${response.status} (${reason || 'unknown'})`);
      err.quotaReason = reason; err.status = response.status;
      throw err;
    }
    return response.json();
  }
  // in scanCommunityPosts / scanComments:
  } catch (e) {
    console.error(`[YT Advanced] fetch failed for ${channelId}: ${e.message}`);
    if (e.quotaReason === 'quotaExceeded' || e.status === 403 || e.status === 429) throw e;
  }
  ```

### 1.4 Rate limits / retries

| Call site | Distinguishes 403 vs 429 vs 5xx? | Backoff/retry? |
|---|---|---|
| `youtubeService.js:ytGet` | Yes, via error `reason` | No exponential backoff, but correctly rotates to next key |
| `backgroundSeeder.js:runKeyBatch` | No — any 403/429 = exhausted | None; failed keyword page is skipped for the cycle |
| `innertubeService.js:itPost` | Yes | **Best in the codebase** — real exponential backoff, 3 attempts, `2000*(attempt+1)`ms, logs every attempt |
| `youtubeAdvancedService.js:fetchWithKey` | No | None, and silently discarded (see CRITICAL above) |

**Other bare `catch {}` blocks that discard errors with zero logging** (cited, not all are bugs — most are acceptable best-effort fallbacks): `backgroundSeeder.js:378,413` (acceptable, enrichment fallback), `backgroundSeeder.js:588` and `podcastSeeder.js:189` (swallows a genuine DB insert error with **no** logging — a schema drift here would silently reduce yield; add at minimum `console.warn`), `youtubeAdvancedService.js:62` (same class), `scraperLoopService.js:146` (acceptable — best-effort logging-of-a-logging-failure).

### 1.5 Verdict on stage 1

The core 24/7 builder (`backgroundSeeder.js`) is solid: bounded memory, working InnerTube fallback, real timeouts on every HTTP call, self-healing concurrency. The two real gaps are the dead 544-keyword module (cosmetic, since the live seeder has its own working keyword list) and the completely unmonitored `youtubeAdvancedService.js` signal scanner, which is the actual "silently produces nothing" failure mode you were worried about.

---

## 2. Intent Detection

### 2.1 The six `claudeService.js` signals (pitch-angle picker — NOT lead scoring)

All in `getServiceIntelligence()`, `claudeService.js:426-581`.

| Signal | Line | Does it measure what its name says? | Key issue |
|---|---|---|---|
| `upload_gap` | 452-469 | **Yes.** `daysSinceUpload > 21` off `Date.now() - last_upload_date`, correct units. | Malformed date → `NaN`, `NaN > 21` is false → signal just never fires. Safe by luck. |
| `video_drop` | 471-490 | Mostly yes, but "last 3" = `videos.slice(-3)` (array-order dependent, not verified-chronological) | Divide-by-zero guarded (`best.views > 0 ? ... : 0`). If `recent_videos` isn't stored newest-first upstream, this silently inverts. |
| `ratio_gap` | 492-514 | Yes — views/subs ratio, gated to subs > 30,000 | Divide-by-zero guarded. Hidden-subscriber-count channels ingest as `subscriber_count = 0` (`youtubeService.js:153,209`, `parseInt(...|| '0')`), so ratio = 0 and the signal never fires for them — false negative, not false positive. |
| `viral_gap` | 516-538 | **Partially misleading name** — it's a keyword-match + 1.5x-avg-views heuristic, not real virality detection | When `avg_views = 0` (data-poor channel), `avg_views * 1.5 = 0`, so *any* keyword-matching video with nonzero views is mislabeled "viral." No guard. |
| `frequency_slow` | 540-549 | **Yes**, exactly — 14-60 day upload gap bounds check | Missing data defaults to `upload_frequency_days = 7` (line 432) — a conservative, correct default that can't false-trigger this signal. |
| `confirmed_hiring` (this instance) | 551-563 | Real false-positive risk | Keyword list includes bare `'collab'`, `'need a'`, `'hiring'` — matches "collab with me on this video," "need a break from filming," "Hiring managers HATE this trick" in unrelated contexts. Highest priority (11) of all six, so it wins the pitch-angle selection whenever it fires incorrectly. |

None of these six touch `intent_score`/HOT-WARM-COLD — they only pick which line an AI-generated outreach email opens with.

### 2.2 The real scoring signals — `intentService.js`

**`calculateIntentScore`/`calculateIntentScoreWithWeights`** (lines 22-89, 138-153, 217-257) — used only when full per-video history exists (per-user `leads` table):

```js
let score = (
  0.20 * s.upload_frequency + 0.20 * s.view_growth + 0.25 * s.title_keywords +
  0.20 * s.description_keywords + 0.10 * s.engagement_rate + 0.05 * s.upload_consistency
);
if ((lead.total_videos || 0) < 100) score *= 0.85; // new channel penalty
```
`DEFAULT_WEIGHTS` sums to exactly 1.00. All six per-signal functions have explicit, correct divide-by-zero guards (`freqDays <= 0 → 0`, `oldAvg === 0 → 0.5`, `<4 videos → 0.5` neutral default, etc.) and the consistency signal sorts dates descending before diffing, so negative gaps are structurally impossible. **This part of the codebase is genuinely solid.**

Two real bugs found here:
- **MEDIUM — malformed `last_upload_date` bypasses the dormancy zero-out.** Lines 117-118, 124, 220-221, 228: `new Date(bad_string)` → `NaN`; `NaN > 180` evaluates `false`, so a channel with a corrupted timestamp is scored as if active instead of being zeroed as dormant.
  **Fix:** `if (Number.isNaN(daysSince) || daysSince > 180) return zero(...)`.
- **MEDIUM — `calculateIntentScore` and `calculateIntentScoreWithWeights` disagree on empty-video handling.** Line 127 (`!videos.length` → zero) vs. line 229 (`!videos.length && !lead.upload_frequency_days` → zero). A zero-video lead with a stray nonzero `upload_frequency_days` gets a full score off neutral defaults in one function, zero in the other, for the same lead.
- **LOW — the "new channel penalty" (line 147/250) actually gates on `total_videos < 100`, not channel age.** No channel-creation-date is used anywhere in this file. Rename the comment or wire in real channel age.

### 2.3 `scoreMasterLead` + `scoreWithPlatformSignals` — the system that actually runs in production

This is what `qualityLeadsService.js` calls for every `master_leads` row, and is therefore what actually populates Quality Leads and PowerMode's pool.

```js
// intentService.js:341-343
const score = (0.40 * niche_score) + (0.40 * subs_score) + (0.15 * views_score) + (0.05 * desc_score);
const base_score   = Math.min(Math.round(score * 100) / 100, 1.0);
const intent_score = scoreWithPlatformSignals(ml.channel_id, base_score);
```

`niche_score` is a lookup in a hardcoded 30-entry niche table (finance/business/saas = 1.0 down to pets = 0.38). `subs_score` is a bucket on raw subscriber count (20K-200K = 1.0 "sweet spot"). `views_score` is avg_views/subs ratio. `desc_score` is a service-keyword count. **None of this touches upload recency, view trend, or engagement — it is a firmographic proxy (what niche, how many subs), not a behavioral buying-intent signal**, by the code's own comment: *"master_leads doesn't have recent_videos, upload_frequency_days, or engagement_rate."*

#### CRITICAL — the cross-platform `confirmed_hiring` boost function is dead code in production Postgres

```js
// intentService.js:373-385 (verified directly)
function scoreWithPlatformSignals(creatorId, baseScore) {
  const db = getDb();
  if (typeof db.prepare !== 'function') return baseScore;   // <-- line 376
  const signals = db.prepare(`SELECT platform, signal_type, confidence, budget_mentioned
    FROM platform_signals WHERE creator_id = ? ORDER BY confidence DESC`).all(creatorId);
  ...
```

`getDb()` in Postgres mode (`database.js:34-42`) returns `{ get: pg.get, run: pg.run, all: pg.all, _pool: pg.pool }` — **there is no `.prepare` method on this object in production.** `typeof undefined !== 'function'` is always `true`, so **this function returns `baseScore` unmodified on every single call in the deployed system, before ever reaching the platform-signal query.** The entire elaborate boost table below it — Upwork +0.35, YouTube description +0.30, Google search +0.28, LinkedIn/Twitter +0.25, YouTube community +0.28, Reddit +0.20, plus the "any confirmed hiring signal floors the score to 0.80" rule — **never executes in production.**

(Same file, lines 349-355 in `scoreMasterLead` itself, has an identical `db.prepare(...)` call wrapped in `try {} catch (e) {}` — also always throws-and-swallows under Postgres, so `is_confirmed`/`signal_source` metadata is always `false`/`null` from this code path too.)

There is a second, real bug **inside** that same dead switch statement, worth fixing at the same time since you'll be touching this code anyway: it sets `hasConfirmedHiring = true` keyed on `signal.platform`, not `signal.signal_type` (lines 388-439) — `platform='youtube_description'` covers both genuine `confirmed_hiring` matches (confidence 0.85) and much softer `behavioral` matches like "solo creator" (confidence 0.65), and both would trip the same `≥0.80` floor once the dead-code path is fixed.

**How `confirmed_hiring` actually affects scores today:** entirely through a *different*, independent mechanism — `confirmedSignalService.js`'s `deepScanDescriptions()`/`scanGoogleSignals()`/`analyzeEmailPatterns()`, which issue **direct `UPDATE quality_leads SET intent_score = ...` statements** (via `db.run`, not `db.prepare`, so these do work in Postgres), completely bypassing `scoreMasterLead`:
```js
// confirmedSignalService.js:39 (verified directly)
await db.run(`UPDATE quality_leads SET intent_score = MAX(intent_score, 0.82), intent_tier = 'HOT', source = 'confirmed_description' WHERE creator_id = ?`, [lead.channel_id]);
```
This only covers 3 of the ~9 platform types the dead scoring function was designed to weigh (`youtube_description`, `google_search`, `email_analysis`). And two of the others are separately broken:

- **HIGH — Twitter and Upwork signals can never match a real channel.** `twitterSignalService.js:117` and `upworkService.js:75` store `creator_id = "twitter_<author_id>"` / `"upwork_<job_id>"` — synthetic IDs that never equal any `master_leads.channel_id` (a `UC...` string). Neither service attempts to extract an actual YouTube channel reference from the source text (unlike Reddit's or Google's extraction, which do resolve a real `UC...` ID). These rows sit in `platform_signals` forever, counted in admin stats (`getConfirmedSignalStats()`), giving a false impression of signal coverage, but structurally incapable of ever touching a score.
- Reddit (`redditSignalService.js`) never writes to `platform_signals` at all — it only writes to a separate `buying_signals` table.

- **CRITICAL — overly broad keyword lists directly floor scores with no review gate.** `confirmedSignalService.js:10` includes the bare word `'compensated'` in its "confirmed hiring" list; `youtubeAdvancedService.js:12-17` includes `'collab'`, `'apply'`, `'dm me'`. A channel description saying *"I was not paid or compensated for this video"* matches `'compensated'` and is directly floored to `intent_score ≥ 0.82, tier='HOT'` — no human review, no pass through the weighted scorer at all.
  **Fix:** require keyword proximity to a role noun ("editor"/"designer"/"team"), and route all `confirmed_hiring` writes through one function that recomputes+persists the full signal snapshot, not raw `UPDATE ... intent_score = MAX(...)` calls scattered across three services.

- **Result: three different, uncoordinated write paths touch `quality_leads.intent_score`** — `scoreBatch`'s `INSERT OR REPLACE`, `confirmedSignalService`'s direct floor-`UPDATE`s, and `analyzeEmailPatterns`'s `+0.08` bump. None of the latter two update the `sig_*` breakdown columns, so a lead's displayed signal breakdown can permanently disagree with the score that's actually stored (compounds with the §5 ON CONFLICT bug).

### 2.4 Can garbage data score HOT? — yes, demonstrated

Worked example, using real defaults from the code:
- `subscriber_count=0` (or hidden), `niche=null`, `avg_views=0`: `niche_score=0.35` (unknown-niche default, line 303), `subs_score=0.15` (under-2K bucket, line 318), `views_score=0.40` (neutral no-data default, line 322), `desc_score=0` → `base_score ≈ 0.26` → would be **COLD** on its own.
- If that same `channel_id` has even one soft `behavioral`/`youtube_description` platform_signals row (e.g. a description saying "trying to do this all myself" — matches `BEHAVIORAL_SIGNALS`), `confirmedSignalService.js` doesn't touch it (that path only fires for the `CONFIRMED_HIRING` list, not `BEHAVIORAL_SIGNALS`, so this specific example is actually safe) — **but** a description containing `'compensated'` in any unrelated sense (sponsorship disclosure, common on YouTube) *does* fire the confirmed-hiring path and forces this exact near-empty-data lead to **HOT (≥0.82)** via the direct `UPDATE` in confirmedSignalService.js, completely independent of its abysmal `base_score`.

### 2.5 `calibrateWeights` — not outcome-based

`calibrateWeights()` (lines 453-489) tests 5 **hand-authored** weight sets and picks whichever produces a HOT percentage closest to an arbitrary 45% target (line 484) — it optimizes for *distribution shape*, not reply rate or calls booked. A genuinely outcome-based function exists (`assessAlgorithmAccuracy`, lines 172-204, buckets by real reply rate against 60/30/10% targets) but it is never called by `calibrateWeights` and never feeds back into `DEFAULT_WEIGHTS`. Calibration today cannot make the algorithm more accurate, only more evenly distributed.

### 2.6 Threshold/scale sanity check

Confirmed `intent_score` is genuinely 0–1.0 everywhere it's produced and consumed (`calculateIntentScore`, `scoreMasterLead`/`scoreWithPlatformSignals`, `qualityLeadsService.js`'s `>=0.75`/`>=0.50` split, `routes/qualityLeads.js`). **Separately**, `backend/src/utils/scoring.js` implements an incompatible 0–100 scale (`getTemperature`: ≥70 hot, ≥40 warm) used by `youtubeService.js`/`innertubeService.js`/`redditService.js` for the plain per-user `leads` table (a different feature, Lead Finder, not Quality Leads). No current cross-contamination found, but this is a live footgun for any future code that reads `lead_score` and compares it against the `0.75`/`0.50` thresholds meant for `intent_score`.

### 2.7 Verdict on stage 2

The math for the six *real* per-video signals (`intentService.js`'s `calculateIntentScore` family) is sound and well-guarded. But **that function is not what runs in production** — `scoreMasterLead` is, and it's a coarse niche+subscriber-count proxy whose only real "confirmed intent" boost mechanism (`scoreWithPlatformSignals`) is dead code under Postgres. The signal that actually promotes leads to HOT today is a set of loosely-gated direct SQL writes in `confirmedSignalService.js`, keyed on a keyword list broad enough to match sponsorship disclaimers.

---

## 3. Email Extraction & Verification

### 3.1 Extraction sources and regex

Three independent implementations (`youtubeService.js`, `innertubeService.js`, `seed-leads.js`) pull from `ch.snippet.description` (YouTube "About" text) → fallback: scrape the public `/about` HTML page → fallback: scrape a linked personal website. No third-party enrichment API (Hunter/Apollo/ZeroBounce) is wired in anywhere — confirmed by repo-wide grep, zero hits outside an unused design-reference mockup file.

Core regex (`youtubeService.js:317-330`):
```js
function extractEmail(text) {
  const all = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]);
  for (const raw of all) {
    let email = raw;
    email = email.replace(/^[^a-zA-Z0-9]+/, '');
    email = email.replace(/^[A-Z]{2,}-/i, '');
    if (/^[a-z][A-Z]/.test(email)) email = email.slice(1);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._%+\-]{1,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) continue;
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && SKIP_EMAIL_DOMAINS.has(domain)) continue;
    return email.toLowerCase();
  }
  return null;
}
```

**Verified false-positive/false-negative test matrix:**

| Input | Result | Why |
|---|---|---|
| `logo@2x.png` | **FALSE POSITIVE — extracted as a real email** | `2x.png` satisfies `[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}` (3-letter "TLD"). No image-extension exclusion exists. Runs directly against raw scraped HTML in `scrapeEmailFromPage`/`scrapeEmailFromWebsite`, where `@2x`/`@3x` retina filenames are common. |
| `contact [at] domain [dot] com` | **FALSE NEGATIVE (missed) on the primary/default path** | `youtubeService.js` — used by PowerMode, Channel Analyzer, and the manual Hunt (i.e. every user-facing flow) — has no `[at]`/`[dot]` normalization. `innertubeService.js` (background-seeder-only path) does have this normalization and would catch it. |
| `USA-sales@company.com` (legitimate) | **Silently mutated to `sales@company.com`, unlogged** | `email.replace(/^[A-Z]{2,}-/i, '')` assumes any leading 2+ uppercase token + hyphen is a scraping artifact and strips it unconditionally. |
| `aSmith@company.com` (legitimate) | **Silently mutated to `Smith@company.com`, unlogged** | `if (/^[a-z][A-Z]/.test(email)) email = email.slice(1);` — same class of unconditional, unlogged heuristic stripping. |
| Multiple emails in one description | First regex match wins, no semantic preference | Could pick a personal/fan-mail address over a later "business inquiries" one. |
| `?email=john@example.com&ref=123` (URL query param) | Correctly extracted | `&` isn't in the character class, no corruption. |

### 3.2 CRITICAL — "verified" is a hardcoded UI claim with zero backing verification

This is the single most important finding in this section, traced end-to-end:

1. `youtubeService.js`'s `buildChannelProfile()` sets `channelData.email` purely from the regex extraction above — **no MX check, no verification call of any kind happens in this function.**
2. `routes/analyzer.js` returns this raw `email` field straight to the frontend.
3. **`frontend/src/pages/ChannelAnalyzer.jsx:121`** (verified directly, verbatim):
   ```jsx
   <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Verified via Hunter · Apollo · domain MX check</div>
   ```
   This renders **unconditionally whenever `channel.email` is a non-empty string** (line 114: `{channel.email && (...)}`) — there is no `Hunter`/`Apollo` integration anywhere in this codebase (confirmed by repo-wide grep), and `hasMxRecord()` (the one real MX-check function that does exist, `emailService.js:24-50`) is never called anywhere in this discovery path.
4. Same pattern for PowerMode: `routes/scraper.js:137` counts a lead as "with email" via a bare `email IS NOT NULL AND email != ''` check, and `frontend/src/pages/LeadFinder.jsx:429,433` surfaces this to the user as *"leads with **verified emails**"*.

**A real MX-verification function does exist** (`emailService.js:24-50`, genuine `dns.resolveMx` with caching) but it only runs at actual send time inside `sendEmail()` — after the lead has already been shown to the user with the false "verified" claim. There's also a batch MX-validation endpoint, `POST /api/emails/validate-leads-mx` (`routes/emails.js:265-280`) that is real, correct code — and **is never called by the frontend anywhere** (confirmed by grep of the entire frontend source). It's a dead, unwired feature that could fix this if connected.

**Fix (do this before shipping any more "verified" marketing copy):**
```jsx
// ChannelAnalyzer.jsx — replace the hardcoded claim:
{channel.email && (
  <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>
    Email found on channel page{channel.email_mx_valid ? ' · domain verified' : ' · not yet verified'}
  </div>
)}
```
```js
// buildChannelProfile() in youtubeService.js — actually call the existing function:
const { hasMxRecord } = require('./emailService');
if (channelData.email) {
  channelData.email_mx_valid = await hasMxRecord(channelData.email.split('@')[1]);
}
```
And stop describing PowerMode's output as "verified emails" in `LeadFinder.jsx` until this is wired through and a real `email_verified` boolean exists on the row.

### 3.3 Other findings

- **HIGH — no disposable-domain blocklist anywhere** (mailinator.com, 10minutetemp, etc. — confirmed zero hits by grep). Disposable domains often have valid MX records, so `hasMxRecord()` alone wouldn't catch them even if wired in.
- **MEDIUM — CSV import dedups on `channel_name`, not `channel_id`.** `routes/leads.js:225`: `SELECT id FROM leads WHERE channel_name = ? AND user_id = ?`. Two distinct channels sharing a display name are wrongly treated as duplicates; a genuine duplicate imported under a slightly different name string isn't caught (the real unique indexes key on `channel_id`, which this import path doesn't populate).
- **LOW — three near-duplicate `extractEmail()` implementations drifting apart** (`youtubeService.js`, `innertubeService.js`, `seed-leads.js`) with inconsistent obfuscation-handling and inconsistent `SKIP_EMAIL_DOMAINS` sets. Consolidate into one shared module.

### 3.4 Dedup — this part is solid

`master_leads.channel_id` is `UNIQUE NOT NULL`, and every insert path uses `INSERT OR IGNORE`/`ON CONFLICT DO NOTHING` against it — reliable, since `channel_id` (the canonical `UC...` ID) is always populated by every YouTube-sourced discovery path, regardless of whether the handle string looks like `@handle`, `handle`, or a full URL. The per-user `leads` table carries two **partial unique indexes** — `(channel_id, user_id)` and `(channel_handle, user_id)` — identical across the SQLite and Postgres schemas, no environment drift. Master→per-user copy paths (PowerMode, `/scrape/*`, `GET /master`) correctly use `ON CONFLICT DO NOTHING` and check the affected-row count before counting a lead as newly added — a duplicate assignment is a safe no-op, not a crash or a silent double-count. Two different users legitimately can and are meant to end up with the same `channel_id` in their own `leads` rows — that's the intended shared-pool design, not a bug.

---

## 4. Database Layer (Postgres on Railway)

### 4.1 CRITICAL — pitch regeneration silently fails to save

Six call sites do `INSERT OR REPLACE INTO pitches` (`claudeService.js:1038`, `analyzer.js:62`, `assistant.js:585,604,642,693`). `pitches.lead_id` is `UNIQUE NOT NULL` (`postgres.js:282`). `normalizeSql()`'s special-case rewrite list (`postgres.js:66-77`) covers `sessions`, `settings`, `quality_leads`, `archived_leads`, `user_followup_settings` — **`pitches` is not in that list**, so it falls to the generic branch:
```js
// postgres.js:77-79
} else {
  out = out.trimEnd() + ' ON CONFLICT DO NOTHING';
}
```
With no conflict target specified, Postgres applies `DO NOTHING` to *any* violated constraint — including `lead_id UNIQUE`. **Every time a pitch is regenerated for a lead that already has one** (the "Regenerate" button, re-running Channel Analyzer, a retried generation job), **the new pitch text is silently discarded.** The API still returns the freshly-generated text in the HTTP response (it's a local JS variable, independent of the write), so the UI looks like it worked — but the next `GET` re-reads the **original stale pitch** from the DB. Because `ON CONFLICT DO NOTHING` doesn't throw, the `catch (e) { console.error(...) }` wrapping these calls never fires — there is no error, no log line, nothing. This is undetectable data loss on every regeneration under Postgres.

**Fix:**
```js
// postgres.js normalizeSql() — add a pitches branch:
} else if (/\bpitches\b/i.test(sql)) {
  out = out.trimEnd() + ` ON CONFLICT (lead_id) DO UPDATE SET
    deep_study=EXCLUDED.deep_study, custom_offer=EXCLUDED.custom_offer, cold_email=EXCLUDED.cold_email,
    email_subject=EXCLUDED.email_subject, reddit_dm=EXCLUDED.reddit_dm, subject_variants=EXCLUDED.subject_variants,
    pitch_score=EXCLUDED.pitch_score, signal_type=EXCLUDED.signal_type, updated_at=EXCLUDED.updated_at`;
}
```
(Postgres allows `EXCLUDED.col` to reference columns not present in a given call's `INSERT` column list only if they're in the VALUES list — since the six call sites write different column subsets, the safer fix is to give each call site its own explicit `ON CONFLICT` clause naming only the columns it actually writes.)

### 4.2 HIGH — confirmed: `quality_leads`/`archived_leads` re-scoring freezes stale data (your hypothesis, verified exactly)

Literal SQL that executes for `qualityLeadsService.js:29-46`'s `INSERT OR REPLACE INTO quality_leads` after `normalizeSql`/`convertQuery`:
```sql
INSERT INTO quality_leads (creator_id, channel_url, channel_name, channel_handle, subscriber_count, niche, email,
  intent_score, intent_tier, sig_upload_frequency, sig_view_growth, sig_title_keywords,
  sig_description_keywords, sig_engagement, sig_consistency, source, updated_at)
VALUES ($1,...,$15,'master_pool',CURRENT_TIMESTAMP)
ON CONFLICT (creator_id) DO UPDATE SET
  channel_name = EXCLUDED.channel_name, intent_score = EXCLUDED.intent_score,
  intent_tier  = EXCLUDED.intent_tier,  updated_at   = EXCLUDED.updated_at
```
(`postgres.js:71-72`.) Every other bound column — `channel_url, channel_handle, subscriber_count, niche, email`, and all six `sig_*` breakdown columns — is written on first insert but **frozen forever** on any subsequent conflict. `archived_leads` has the identical pattern (`postgres.js:73-74`, only `intent_score`/`archived_at` survive a re-write).

This matters because `scoreAndPopulate()` (the full re-score sweep, exposed at `POST /api/quality-leads/populate`, used for recalibration) does **not** filter out already-classified rows — a full re-run hits this conflict path for every existing lead and permanently freezes its signal breakdown. Worse: when a re-score moves a lead across the HOT/WARM ↔ COLD boundary, `scoreBatch()` inserts into the new tier's table but **never deletes the stale row from the old one** — the same `creator_id` can end up duplicated across `quality_leads` and `archived_leads` simultaneously, one side showing stale-hot data.

**Fix:**
```sql
-- expand both ON CONFLICT clauses to cover every bound column:
ON CONFLICT (creator_id) DO UPDATE SET
  channel_url=EXCLUDED.channel_url, channel_name=EXCLUDED.channel_name, channel_handle=EXCLUDED.channel_handle,
  subscriber_count=EXCLUDED.subscriber_count, niche=EXCLUDED.niche, email=EXCLUDED.email,
  intent_score=EXCLUDED.intent_score, intent_tier=EXCLUDED.intent_tier,
  sig_upload_frequency=EXCLUDED.sig_upload_frequency, sig_view_growth=EXCLUDED.sig_view_growth,
  sig_title_keywords=EXCLUDED.sig_title_keywords, sig_description_keywords=EXCLUDED.sig_description_keywords,
  sig_engagement=EXCLUDED.sig_engagement, sig_consistency=EXCLUDED.sig_consistency,
  source=EXCLUDED.source, updated_at=EXCLUDED.updated_at
```
And add `DELETE FROM archived_leads WHERE creator_id = ?` / `DELETE FROM quality_leads WHERE creator_id = ?` in `scoreBatch()` when a lead crosses tiers, mirroring what the manual archive route (`qualityLeads.js:72-83`) already does correctly.

### 4.3 HIGH — `emails_sent` is permanently 0, root cause confirmed

`campaigns.emails_sent` has exactly one write path (`campaigns.js:189-201`), which recomputes it via:
```sql
SELECT SUM(CASE WHEN e.status IN ('sent','opened','replied') THEN 1 ELSE 0 END) as emails_sent
FROM campaign_leads cl LEFT JOIN emails e ON e.id = cl.email_id WHERE cl.campaign_id = ?
```
This depends entirely on `campaign_leads.email_id` being populated. **It never is** — verified by grepping the entire backend: the only matches for `campaign_leads.*email_id` are the three read sites in `campaigns.js` and the schema definition. The actual send path (`emailService.js sendEmail()`) inserts into `emails` with no `campaign_id` and never touches `campaign_leads` at all. Campaigns and the real send pipeline are structurally disconnected — the `LEFT JOIN` always misses, `SUM()` always evaluates over zero rows.

**Fix:** when an email is sent for a lead that belongs to a campaign, write `campaign_id` onto the `emails` row and `UPDATE campaign_leads SET email_id = ? WHERE campaign_id = ? AND lead_id = ?` at send time — or simpler, add `campaign_id` directly to `emails` and recompute `emails_sent` from `emails.campaign_id` instead of the currently-dead join.

### 4.4 HIGH — three more `.prepare()` calls that throw-and-swallow under Postgres, causing a real user-facing bug

`intentService.js:352,378` guard correctly (`typeof db.prepare === 'function'` checks) — those are fine. But **`claudeService.js:798, 1264, 1295`** do not:
```js
getDb().prepare('SELECT full_name FROM users WHERE id=?').get(lead.user_id)
```
Under Postgres this throws (`getDb().prepare` is undefined), is caught silently, and falls back to a **hardcoded name** — `'Alex'` in the follow-up sequence generator, `'Prahvi'` in the Gemini-fallback pitch path. **Every follow-up email and every Gemini-fallback pitch is signed with the wrong name for every user in production.** Notably, the exact same bug was already found and fixed once in this file — `claudeService.js:854-858` has a comment documenting the incident and the fix applied to `buildFallback()` (`await getDb().get(...)`, correct) — but the fix wasn't propagated to these three sibling call sites.

**Fix:** replace all three with the already-correct pattern from `buildFallback()`:
```js
const row = await getDb().get('SELECT full_name FROM users WHERE id=?', [lead.user_id]);
const senderFirst = row?.full_name?.split(' ')[0] || 'there';
```

### 4.5 MEDIUM — plan-based lead limits bypassed on one of two copy routes

`GET /api/leads/master` (`leads.js:484-519`, the plain master-pool browse/copy endpoint) copies rows into the user's `leads` table with **no** `checkUsageLimit`/`incrementUsage` call. The `/scrape/*` endpoints do gate correctly (`leads.js:253,325,364`). A user hitting `/api/leads/master` directly can pull leads from the shared pool without it ever counting against `leads_used_this_month`/`custom_leads_limit` (300/1500/4500 plan tiers) — the allocation limit is enforced on only one of the two paths that populate a user's lead list, not universally.
**Fix:** add the same `checkUsageLimit`/`incrementUsage` gating used elsewhere in `leads.js` to this route.

### 4.6 Schema / SQL injection / N+1 — mostly clean

- **No SQL injection found** in `leads.js`, `qualityLeads.js`, `analytics.js`, `campaigns.js` — every dynamic fragment is either a parameterized `?`/`$n` value or an identifier constrained by a hardcoded whitelist (e.g. `leads.js:99`'s `sort` param checked against an explicit array before interpolation).
- **No batch transactions anywhere** (`scoreAndPopulate`, `backgroundSeeder`'s per-channel inserts, `leads.js`'s master→user copy loops) — but every one of these uses `INSERT OR IGNORE`/`ON CONFLICT`, so a mid-batch crash just means fewer rows saved, not corruption. This is a performance issue (thousands of sequential round-trips on a full 22k-row repopulate) rather than a correctness one.
- **LOW** — `leads.js POST /` (manual single-lead add) does a SELECT-before-INSERT check but the actual `INSERT` has no `ON CONFLICT` and no local try/catch — a genuine concurrent-request race surfaces as an uncaught 500 instead of a graceful 409. Narrow, low-traffic path.
- Legacy scripts (`upload_leads.js`, `seed-leads.js`, `emergency*.js`, etc.) open their own local `better-sqlite3` handles directly and are never invoked automatically in production — dead-but-harmless, worth deleting or moving to a `scripts/legacy/` folder to reduce audit noise.

---

## 5. Master DB → User DB Flow

Covered in detail in §4.3–4.5. Summary:
- Copy mechanism (`INSERT ... ON CONFLICT DO NOTHING` keyed on the per-user partial unique index) is correctly implemented and race-safe.
- Two users legitimately sharing a `channel_id` is intended behavior (shared read-only pool), not a bug.
- Plan-based allocation (300/1500/4500) is enforced server-side on `/scrape/*` but **not** on `GET /api/leads/master` — a real, exploitable gap (§4.5).
- Admin panel's "0 emails sent" is explained precisely: `campaign_leads.email_id` is never written by any code path (§4.3) — not a display bug, a genuinely dead counter.

---

## 6. Background Jobs

| Job | Trigger | Lock | Survives crash? | Survives redeploy? |
|---|---|---|---|---|
| `backgroundSeeder.js` | Self-scheduling `while(true)`, started 5s after `server.js` boot | None needed — sole caller of itself | Self-heals (loop just restarts on process restart) | `master_leads` survives via Turso pull-on-boot (`tursoSync.js:656-695`, verified); **`seeder_keyword_tokens` (pagination cursors) is NOT in the Turso sync list** — a redeploy on a non-persistent volume silently resets every keyword back to page 1 (self-healing since the full keyword list gets reshuffled and reprocessed every cycle anyway, but real, silent state loss) |
| `scraperLoopService.js` | `setTimeout` chain, fixed 2h interval | In-memory `status.running` boolean, released in `finally` | Self-heals — flag vanishes with the process, restarts `false` | N/A (no persisted cursor to lose) |
| `schedulerService.js` (6 cron jobs: reply-check, bounce-detect, follow-up gen, auto-scrape, monthly reset, lead resurrection) | Real `node-cron` schedules | Same in-memory-flag pattern, same self-healing property | Self-heals | N/A |
| Video backfill (`videoBackfillService.js`) | **Nothing — no cron, no boot-time start** | `state.running` guard, correctly implemented | N/A | N/A |

**Finding (MEDIUM) — video backfill has no autonomous trigger.** Confirmed via grep: only two call sites exist for `runVideoBackfill` — a manual CLI script and an admin-only route (`POST /api/leads/admin/backfill-video-data`). It is absent from `schedulerService.js` and `server.js`'s boot sequence entirely. The rate-limiting and `channel_gone`/`fetch_failed` distinction inside it are correctly implemented (concurrency=3, 1.5s inter-batch delay, 30-min quota-exhaustion pause with batch retry — matches its own documentation exactly), but the whole mechanism depends on a human remembering to click a button. The 5,119-lead backlog referenced in your recent commit only shrinks when someone manually triggers it; new backlog from failed fetch-at-copy/pre-generation-safety-net attempts accumulates indefinitely otherwise.
**Fix:** add a daily off-peak cron in `schedulerService.js` calling `runVideoBackfill`, guarded by its existing `state.running` check.

**Finding (LOW) — no give-up threshold on repeatedly-failing channels.** The backfill query (`WHERE video_data_status IS NULL OR = 'fetch_failed'`) correctly excludes `'channel_gone'`, but has no retry counter for `'fetch_failed'` — a channel that deterministically errors (e.g. a malformed ID that 400s instead of 404ing) gets re-selected and re-fetched, burning quota, on every single run forever.
**Fix:** add a `video_fetch_attempts` counter; after N consecutive failures, flip to a terminal status excluded from re-selection.

**"Lead Seeder IDLE" / "Last saved: 0 leads" — not automatically bugs, here's why:**
- `seederStatus.running` is `true` only for the duration of one cycle (roughly the scrape time) followed by a 10-second sleep — a single poll showing IDLE proves nothing; it depends entirely on poll timing versus cycle duration.
- "0 saved" is a plausible real outcome: `processChannelBatch` requires both a subscriber count in [1,000, 5,000,000] **and** a successfully-extracted email before writing any row (`if (!email) return 0;`) — most `search.list` results won't have an extractable, non-skip-domain email, so 0 in a given cycle is expected, especially on over-mined/duplicate keywords where `INSERT OR IGNORE` no-ops on already-known channels.
- What *would* indicate a genuine stuck state (not confirmed, needs a live check, not visible from static reading): `seederStatus.totalCycles`/`lastCycleAt` never advancing over a long wall-clock window while the process is confirmedly alive. No unbounded-hang vector was found in the code (every YouTube/web-scrape HTTP call in `backgroundSeeder.js` carries an explicit timeout).

**Memory:** No unbounded in-memory accumulation found anywhere in the 24/7 loops — `backgroundSeeder.js`/`podcastSeeder.js` use running integer counters, not retained arrays; `scraperLoopService.js`'s error log is explicitly capped (`slice(-30)`, then `slice(-5)` for display); `youtubeService.js`'s `exhaustedKeys` Set is bounded by key count and cleared every 24h.

---

## 7. Data Quality (Quality Leads classification + staleness)

### 7.1 Classification — verified with worked examples

Call chain: `scoreAndPopulate`/`scoreNewMasterLeads` → `scoreBatch` → `scoreMasterLead` → `scoreWithPlatformSignals` (dead in prod, §2.3). Thresholds: `≥0.75` HOT, `0.50–0.749` WARM (both land in `quality_leads`), `<0.50` COLD (`archived_leads`, `archived_reason='below_threshold'`).

- Empty/near-empty row (0 subs, no niche, 0 views): `base_score ≈ 0.26` → **COLD**, as expected.
- Normal populated row (50K subs, finance niche, healthy views ratio): `base_score ≈ 0.95` → **HOT**, correctly — whether `scraped_at` is from today or six months ago, since recency is never read.
- Mega-channel/brand-keyword name: hard-excluded to `intent_score = 0.10` regardless of anything else (correct, deliberate business logic — not a bug).

### 7.2 CRITICAL — zero staleness/decay mechanism anywhere in the pipeline

Direct answer: **a signal detected three months ago is scored identically to one detected an hour ago. There is no decay, expiry, or re-check anywhere.**

- Every `master_leads` insert path uses `INSERT OR IGNORE`/`ON CONFLICT DO NOTHING` — confirmed at every site (`backgroundSeeder.js:431,580`, `podcastSeeder.js:151`, `routes/auth.js:495`, `routes/leads.js:424`, `tursoSync.js`). **Once a `channel_id` exists, no code path ever updates its `subscriber_count`, `avg_views`, `niche`, or `last_upload_date`.** The row is frozen forever at first-scrape values.
- `scoreNewMasterLeads()` explicitly excludes already-classified rows (`WHERE ql.id IS NULL AND al.id IS NULL`) — once tiered, a lead is never re-evaluated by the incremental path.
- The closest thing to a "refresh" job, `schedulerService.js`'s "lead resurrection" cron, only resets `crm_stage` on the per-user `leads` table after 30 days — it never touches `master_leads`/`quality_leads` and never re-fetches YouTube data.
- `days_since_upload` (`postgres.js:498`) is defined on `master_leads` but **never populated by any INSERT and never read by `scoreMasterLead`** — a fully dead, always-NULL column that gives a false impression that recency is tracked.

A channel scraped as HOT in April because it was uploading weekly, now dormant by July, is still surfaced as a fresh HOT lead — no re-fetch, no re-score, no flag.

**Fix:** add a low-frequency refresh cron (weekly, in `schedulerService.js`) that re-fetches a sample of `quality_leads`/`master_leads` rows older than N days (`scraped_at < now() - interval`), and either re-scores them or at minimum sets an `is_stale` flag so outreach can deprioritize. Populate `days_since_upload` at insert/refresh time or drop the column.

### 7.3 Video backfill — well-built, correctly documented, just unwired

Covered in §6. The rate-limiting and `channel_gone`/`fetch_failed` state machine inside `videoBackfillService.js` are genuinely correct and match their own code comments exactly — this is one of the better-engineered pieces of the whole system. Its only real problem is having no autonomous trigger.

---

## Pipeline accuracy verdict, by stage

| Stage | Verdict |
|---|---|
| **1. Scraping** | Core builder (`backgroundSeeder.js`) is solid — bounded memory, real timeouts, working degraded-mode fallback. The 544-keyword "engine" is entirely unused dead code. The cross-platform signal scanner (`youtubeAdvancedService.js`) fails silently with zero operator visibility — this is the actual "silent stop" risk you asked about. |
| **2. Intent detection** | The math for the six real per-video signals is correct and well-guarded, but that function isn't what runs in production. The production scorer (`scoreMasterLead`) is a coarse niche+subscriber-count proxy. Its only genuine "confirmed intent" mechanism is dead code under Postgres; what actually promotes leads to HOT today is a set of direct SQL writes gated by keyword lists broad enough to match sponsorship disclaimers. **Not trustworthy as "buying intent" today — it's closer to a firmographic fit score with an occasional, loosely-validated hiring-keyword override.** |
| **3. Email extraction/verification** | Extraction is reasonable but has real false-positive (image filenames) and false-negative (obfuscated emails on the primary path) gaps, plus silent unlogged mutation of some valid addresses. **Verification is a fabrication** — the product tells users emails are "Verified via Hunter · Apollo · domain MX check" when zero verification of any kind runs before that label is shown. Dedup itself is solid. |
| **4. Database layer** | Schema and injection hygiene are good. Two concrete silent-data-loss bugs in production Postgres: pitch regeneration (`ON CONFLICT DO NOTHING` with no target) and quality-lead re-scoring (`ON CONFLICT` dropping most columns). `emails_sent` is a structurally dead counter. Three `.prepare()` calls cause wrong-name signatures on every follow-up/fallback email. |
| **5. Master→user flow** | Copy mechanism itself is race-safe and correct. Plan-based allocation is enforced on the main scrape path but bypassable via one alternate route. |
| **6. Background jobs** | Locking and crash-recovery are sound throughout (in-memory flags that self-heal on restart). The one real gap is `seeder_keyword_tokens` not surviving redeploys (self-healing but silent), and the video backfill job existing but never being triggered automatically. |
| **7. Data quality / staleness** | Classification logic is deterministic and traceable, but **has zero temporal awareness** — a lead's tier is permanently frozen at first-scrape values with no decay, refresh, or expiry mechanism anywhere in the codebase. |

---

## Top 5 fixes, ranked by impact

1. **Fix the "verified emails" claim (§3.2).** This is a direct, provable misrepresentation to paying customers — the UI states MX/Hunter/Apollo verification occurred when none did. Highest reputational/legal exposure of anything found in this audit; also the cheapest fix (change UI copy immediately; wire up the already-built but unused MX endpoint as the real follow-up).
2. **Fix `pitches` `ON CONFLICT DO NOTHING` (§4.1).** Silent, total data loss on every pitch regeneration in production — users regenerate an email, see it succeed, and get the old stale pitch back on next load. Undetectable without this audit; one schema fix resolves it.
3. **Decide what "intent score" is actually supposed to mean, then fix `scoreWithPlatformSignals` (§2.3).** Right now the production scorer is a firmographic proxy with a dead cross-platform boost function and a set of loosely-gated direct-SQL overrides. Either restore the intended weighted boost logic (fix the `db.prepare` guard to use `db.all`/parameterized query) or formally document that "confirmed hiring" today just means "one of three keyword scans found a phrase" — but don't leave the gap between what the code appears to do and what it actually does in production.
4. **Fix `quality_leads`/`archived_leads` `ON CONFLICT` column coverage + wire the emails_sent counter (§4.2, §4.3).** Both are silent correctness bugs that erode trust in the numbers shown on the admin dashboard — one freezes stale signal data on every recalibration, the other makes a core metric permanently and structurally zero.
5. **Add staleness handling to the quality pipeline (§7.2).** Not urgent for launch, but the system's usefulness decays over time as its own pool of "HOT" leads goes stale with zero refresh mechanism — this compounds every month the system runs without a fix.

---

## Can I trust the intent scores this system produces today?

**No — not as a measure of buying intent, though the underlying data is real and the pipeline doesn't crash or corrupt anything.**

The scores are internally consistent (correct 0–1.0 scale, deterministic, no NaN/divide-by-zero leaks I could find in the production-path scorer) and the niche/subscriber-count proxy it uses is a defensible starting heuristic for "which creators are a good fit," not nonsense. But three things break the specific claim of "this predicts who's likely to hire":

1. The one mechanism actually designed to detect real buying intent — cross-platform confirmed-hiring signals — is dead code under Postgres for its primary weighted-blend path (`scoreWithPlatformSignals`), and the side-channel that does work (`confirmedSignalService.js`'s direct SQL floors) is gated by keyword lists broad enough to fire on a sponsorship disclaimer ("not compensated for this video") and forces a near-worthless lead straight to HOT with no review step.
2. Two of the seven signal-collection integrations (Twitter, Upwork) can structurally never affect a score at all — they write to the database under IDs that never match a real channel, so all the scraping effort behind them is currently wasted.
3. Whatever tier a lead lands in is frozen forever at first-scrape time — a channel that goes dark the week after being scored HOT stays HOT indefinitely, with no mechanism anywhere in the codebase to notice or correct it.

Treat `intent_score`/`intent_tier` today as "fit score with an occasional, unreliable hiring-keyword boost," not "predicted likelihood to hire." The fixes above (particularly #3 in the ranked list) are what would close that gap.
