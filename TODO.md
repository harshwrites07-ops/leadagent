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
