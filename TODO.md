# TODO

## Scraper email-extraction bug — image filenames misidentified as emails

**Found:** 2026-07-04, during a Marcus email-system audit (see conversation/commit history around this date).

**What's wrong:** `extractEmail()` in [backend/src/services/innertubeService.js:76-90](backend/src/services/innertubeService.js#L76-L90) uses this regex to pull an email out of scraped channel/video description HTML:

```js
/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
```

It matches retina-density image asset references (`flags@2x.png`, `downloads_logomark_color_on_white@2x.png`) and what look like emoji/flag sprite filenames keyed by Unicode codepoint (`esalwdsesw41lx13.png@1f.png` — `1f` = the `1F` Unicode prefix used by flag emoji) because the regex allows digits in the domain part and treats any 2+ letter suffix (`png`, `jpg`, `jpeg`) as a plausible TLD.

**Scale, confirmed against production Postgres (`app.quelro.com`) on 2026-07-04:**

| table | rows w/ email | `.png`/`.jpg`/`.jpeg` pattern matches |
|---|---|---|
| `leads` | 100 | 2 |
| `master_leads` | 21,884 | **327** |
| `quality_leads` | 11,683 | **250** |
| `archived_leads` | 10,201 | **77** |

One instance of this (`c940bebcaaa0c7852895b8ac7e8bf7fa.png@1f.png`, lead `Cara Nicole`, id 73) is what surfaced the bug — it wasn't a one-off, it's systemic.

**Not fixed yet** — deliberately out of scope for the Marcus generation-pipeline fixes done around this date. This is an ingest/scraper-pipeline task, not a prompt/quality-gate task.

**Suggested fix direction:** tighten `extractEmail()` to reject matches where the "TLD" is a known image extension (`png|jpg|jpeg|gif|svg|webp`), and/or reject matches preceded by `@[0-9]x` (the retina-density marker) or followed immediately by another `.png`/`.jpg` (the `hash.ext@1f.png` shape). Then run a one-time backfill to null out existing corrupted rows across `leads`, `master_leads`, `quality_leads`, `archived_leads`.

**FIXED — Session 0.1 (2026-07-07):** `extractEmail()` now rejects image/asset-extension TLDs (`png|jpg|jpeg|gif|svg|webp|ico|css|js`), retina-density-marker domains (`@1x`/`@2x`/`@3x`), and matches immediately followed by another `.ext` token. See `backend/src/scripts/testEmailExtract.js` (18/18 passing) and the exported `isImageBugCorruptedEmail()` predicate in `innertubeService.js`, which is the single source of truth for detecting *this specific* corruption (deliberately narrower than "any reason extractEmail() rejects a string" — see below).

One-time backfill ran via `backend/src/scripts/purgeCorruptEmails.js` (dual-DB, `--dry` mode supported). Result on local dev DB: 160 rows fixed (2 `leads`, 79 `master_leads`, 58 `quality_leads`, 21 `archived_leads`). `leads`/`quality_leads`/`archived_leads` had `email` set to `NULL` + `email_corrupt=1`; `master_leads` only got `email_corrupt=1` (its `email` value is deliberately left in place — `database.js` runs `DELETE FROM master_leads WHERE email IS NULL OR email = ''` on every boot, so nulling it there would silently delete the row on next restart). Every `master_leads`-sourced query that surfaces a sendable email now excludes `email_corrupt=1`.

**Separate task, NOT part of 0.1 — pre-existing unrelated garbage emails:** while validating the purge detector, we found rows with garbage emails that are **not** the image-filename bug (e.g. `----@moomoo.com`, single-character local parts like `n@l.thomas`, `n@4.the.creator`). These were briefly, incorrectly touched by an early over-broad version of the detector and have since been restored from `master_leads`. They need their own separate detector + dry-run review in a future session — deliberately out of scope here.

**4 `leads` rows are permanently `NULL` with an unrecoverable original value** (pre-purge orphans — their `channel_id` has no matching `master_leads` row, so the recovery join couldn't restore them after an earlier mistaken write). IDs: **3, 21, 46, 73**. ID 73 is the "Cara Nicole" example cited above and is confirmed genuine image-bug corruption either way. IDs 3, 21, 46 are unknown/unverifiable — accepted as a small, permanent data loss rather than blocking on it.

**Standing rule going forward:** any script that writes/nulls/flags/deletes data MUST be run in `--dry` mode first, with output reviewed and explicitly approved by the user, before a live run. No exceptions. (See CLAUDE.md / project conventions §11.)
