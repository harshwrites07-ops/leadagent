# ContentCrafterzz · Outreach OS — Design System Spec v2

**Purpose:** Migration brief for Claude Code. Read this top-to-bottom, then refactor the existing codebase to match. Do not invent new patterns — every visual decision lives here.

**Changelog — visual transformation pass (2026-07-02):** The v3.0 duotone system in `frontend/src/index.css` and the marketing site in `landing-page/` were already in place, so this pass focused on the gaps: (1) removed several fabricated UI stats that showed fake numbers regardless of real data — PitchGen's per-variant scores and "Spam risk/Open rate" tiles, Analytics's `Math.random()`-generated heatmap and hardcoded 98.6%/"$24 industry median" fallbacks — replaced with real derived values or honest empty states; (2) Dashboard restructured from 4 equal stat tiles to one hero pipeline-value metric + 3 secondary tiles; (3) CRM kanban got real native drag-and-drop (reusing the existing stage-update call) plus shared-layout reflow animation; (4) Replies Inbox now surfaces AI suggestions as a dismissible suggestion card instead of silently filling the textarea, and sorts hot replies (interested/question) above low-signal ones; (5) added a global `:focus-visible` ring and `.btn:disabled`/`:active` states, which the system was missing entirely; (6) swapped a few ad-hoc hex colors (`#f59e0b`, `#f5a623`) for the `--warn` token where they meant the same "warm/medium" semantic. Full app screens (Dashboard/CRM/PitchGen/etc.) weren't visually verified live in-browser since the backend has no `.env`/credentials in this environment — verify with a normal dev-server pass before shipping.

**Source of truth:** This document. If anything in code contradicts this doc, code is wrong.

**Visual reference:** A working HTML prototype of the entire product lives at the design partner's URL. Reference it for spacing, padding, and layout intuition — but tokens come from this doc.

---

## 1. The North Star

> **One sentence:** Premium, restrained, agent-native — the operating system for creator outreach.

**Three loops** the product is organized around:

- **Discover** — Lead Finder + Channel Analyzer
- **Convert** — Pitch Gen + Email Sender + CRM
- **Optimize** — Analytics + Agent

**Three principles** that win every visual debate:

1. **Calm over hype.** Users live in this dashboard for 6+ hours/day.
2. **Trust over delight.** This product moves money. It must feel safe.
3. **Density on demand.** Whitespace when scanning, dense when acting.

---

## 2. Color System

### 2.1 The duotone rule (most important)

We use **two semantic accents**, never more. Every other "accent" color is demoted to neutral or status.

| Accent | Hex | Means | Used for |
|---|---|---|---|
| **Lime** | `#c8f654` | The MACHINE is doing something | Primary CTAs, "live"/"running" badges, agent-action events, predicted open rates, sent volume, scraping/sending status, AI-generated tags |
| **Coral** | `#ff8a73` | A HUMAN is involved | Replied/positive badges, unread inbox indicators, reply rate metrics, meetings booked, "respond to this" CTAs, hot leads in CRM |
| **Cream** | `#f4e9b2` | Editorial moments only | Hero numbers in serif, page-title accents, pipeline-value display |

**Rules:**
- Never use both lime and coral on the same element.
- Status colors (success/warning/error) are separate from accent colors and never reach for lime/coral.
- If you need a third semantic color, use **cream** for editorial. If you need a fourth, you're wrong — reduce.

### 2.2 Full token list

Add all of these to `frontend/src/index.css` `:root`. **Delete the old orange-primary system and any duplicated hex values.**

```css
:root {
  /* surfaces — strict 5-level dark stack */
  --bg:           #0a0a0c;   /* page root */
  --bg-2:         #0e0e11;   /* sidebar, sysbar, agent panel */
  --surface:      #131318;   /* cards */
  --surface-2:    #181820;   /* hover, selected row, nested surface */
  --surface-3:    #1f1f28;   /* deepest surface (rare) */
  --hover:        #21212b;

  /* lines */
  --line:         #23232c;   /* default border */
  --line-2:       #2c2c37;   /* secondary border */
  --line-3:       #393945;   /* focused/selected border */

  /* text */
  --text:         #f3f3f5;   /* primary */
  --text-2:       #a8a8b3;   /* secondary */
  --text-3:       #6e6e7a;   /* muted (timestamps, meta) */
  --text-4:       #46464f;   /* deepest muted (placeholders) */

  /* duotone accents */
  --lime:         #c8f654;
  --lime-2:       #d6ff6e;
  --lime-dim:     #8aab3a;
  --lime-soft:    rgba(200, 246, 84, 0.12);
  --lime-border:  rgba(200, 246, 84, 0.32);

  --coral:        #ff8a73;
  --coral-2:      #ffa593;
  --coral-dim:    #b0594a;
  --coral-soft:   rgba(255, 138, 115, 0.13);
  --coral-border: rgba(255, 138, 115, 0.36);

  /* editorial / category — used sparingly, never as primary action */
  --cream:        #f4e9b2;
  --sky:          #8ec5ff;
  --violet:       #c4b5fd;

  /* status — strictly for system health (deliverability, errors) */
  --ok:           #6ee7a8;
  --warn:         #ffd166;
  --bad:          #ff8a73;   /* yes, same hue as coral on purpose */

  /* type */
  --f-sans:  'Geist', ui-sans-serif, -apple-system, system-ui, sans-serif;
  --f-serif: 'Instrument Serif', 'Times New Roman', serif;
  --f-mono:  'Geist Mono', ui-monospace, 'JetBrains Mono', monospace;

  /* radius */
  --r-sm: 6px;
  --r:    8px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-xl: 22px;

  /* layout */
  --sidebar-w: 232px;
  --topbar-h:  56px;
  --sysbar-h:  28px;
  --agent-w:   420px;
}
```

### 2.3 Replace these old hex values

Find-and-replace across the entire codebase:

| Old (delete) | New (use) | Why |
|---|---|---|
| `#FF4500` | `var(--lime)` | Primary action color → lime |
| `linear-gradient(135deg, #FF4500, #FF6B00)` | `var(--lime)` (no gradient) | Premium = restraint, no gradients on buttons |
| `#00E5A0` (success metric) | `var(--coral)` if "human metric", else `var(--ok)` | Decide by meaning, not aesthetic |
| `#7B61FF` (AI purple) | `var(--lime)` if "agent doing work" | Agent = lime, not purple |
| `#F5A623` (warm leads) | `var(--coral)` for "needs attention" | Warmth = coral |
| `#00B8D4` (cold leads / cyan badges) | `var(--text-3)` (de-emphasize cold) | Cold = quiet, not loud |
| `#4A9EFF` / `#4285F4` (blues) | `var(--text-2)` for plan badges; provider logos keep their literal | Unify |
| `#1a1a2e` (toast nav-tint) | `var(--surface-2)` | One dark family |
| `#0f0f1a` (PowerFollowUpOverlay) | `var(--bg-2)` | One dark family |
| `#2d2d4a` (overlay border) | `var(--line)` | Tokens not literals |
| Tailwind `bg-dark-800` | `var(--surface)` | Tailwind dark slate is too blue |
| Tailwind `text-slate-400` | `var(--text-2)` | Match neutral hue |
| Any `linear-gradient(...)` on buttons | Solid lime fill | No gradients on UI elements |

### 2.4 Gradient usage

**Allowed:** Background washes on hero cards (radial), the brand logo split-square, the agent avatar.
**Forbidden:** Buttons, badges, cards, charts. Anywhere else.

---

## 3. Typography

### 3.1 The fonts

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap');
```

**Remove Syne, Inter, DM Mono entirely.** All three are replaced:
- Syne → **Instrument Serif** (italic) for editorial / **Geist 600** for short bold UI
- Inter → **Geist** (UI workhorse)
- DM Mono → **Geist Mono**

Geist is more refined than Inter and pairs with Instrument Serif as if they were designed together.

### 3.2 Type scale

| Use | Family | Size | Weight | Example |
|---|---|---|---|---|
| Page title | Instrument Serif (italic) | 36px | 400 | "Lead Finder — *the agent does the work.*" |
| Section title | Geist | 13px | 500 | "Connected mailboxes" |
| Hero number | Instrument Serif (italic) | 64–96px | 400 | "$184,200" |
| Stat number | Geist Mono | 22–38px | 400 | "3,184" |
| Body | Geist | 13px | 400 | (most UI) |
| Body small | Geist | 12.5px | 400 | (table cells) |
| Label / eyebrow | Geist Mono | 10.5–11px | 500 (uppercase, .06em tracking) | "PIPELINE" |
| Timestamp / meta | Geist Mono | 10.5–11px | 400 | "2h ago" |
| KBD | Geist Mono | 10px | 400 | `⌘K` |

### 3.3 The serif rule

Use **Instrument Serif italic** *only* for:
1. Page title (one per screen)
2. Hero stat numbers (Pipeline value, Meetings booked, Cost per meeting)
3. The opening line of an empty state ("Your first campaign starts here.")

If you find yourself reaching for it anywhere else, stop.

### 3.4 Mono everywhere there's a number

Every number that represents data — counts, percentages, currency, timestamps, IDs, email addresses — uses Geist Mono. Not Geist sans. Numbers must align in columns.

---

## 4. Layout & Shell

### 4.1 Three-region shell

```
┌────────────┬─────────────────────────────────┬──────────────┐
│            │  TOPBAR (56px)                  │              │
│            ├─────────────────────────────────┤              │
│  SIDEBAR   │                                 │   AGENT      │
│  (232px)   │  CONTENT                        │   (420px,    │
│            │                                 │    optional) │
│            │                                 │              │
├────────────┴─────────────────────────────────┤              │
│  SYSBAR (28px) ──────────────────────────────┤              │
└──────────────────────────────────────────────┴──────────────┘
```

- Sidebar: `232px`, sticky, `var(--bg-2)`, right border `var(--line)`.
- Topbar: `56px`, sticky, breadcrumbs left + search center + actions right.
- Sysbar: `28px`, **fixed at bottom across the full width** (not just sidebar). Shows service status, "X agents working" pulsing lime, app version, and ⌘K shortcut to open agent.
- Agent: `420px` slide-out from right. Pushes content (does not overlay). Toggle via ⌘K from anywhere.

### 4.2 The Agent slide-out (most important new surface)

**Replace the existing AssistantChat floating-bot FAB.** That pattern is wrong — it looks like a SaaS support widget. The agent should feel like a *peer*, not a help bubble.

New behavior:
- **Trigger:** `⌘K` (Mac) or `Ctrl+K` (Windows) opens/closes from any screen.
- **Position:** Slides in from right edge. App content shrinks to make room (CSS Grid: `grid-template-columns: 232px 1fr 420px` when open).
- **Header (56px):** Lime/coral split-square avatar + "Agent" + model name + close button.
- **Body (scrollable):** Conversation history. User messages right-aligned with subtle border. Bot messages left-aligned without bubble (just the avatar + text). Bot can attach **action cards** below its text:
  ```
  [RUNNING tag in lime mono]  Scraping 184 prospects · Finance 50k-500k  [pulsing dot]
  [COMPLETED tag]              Sent 412 emails across 4 mailboxes        [check icon]
  ```
- **Suggested prompts:** Below the conversation, 3–4 pill chips with common asks ("Find 50 Tech creators 100k-300k", "Why did my reply rate drop?").
- **Composer:** Auto-grow textarea inside a bordered surface. Enter sends, Shift+Enter newline. Send button is a small lime square with ↑.
- **Hint bar:** Below composer, mono 10px: `↵ send · ⇧↵ newline · ⌘K toggle`.
- **Model line:** "Online · model gemini-2.5-pro" — be honest about what's running.

The Agent is the soul of the product. **Every other screen should feel like it could be invoked from here.**

### 4.3 Sidebar

- Brand block (top): 26×26 split lime/coral square logo + "ContentCrafterzz" (Geist 600 13.5px) + "OUTREACH·OS" (Geist Mono 10.5px, .08em tracking).
- "Ask the agent" promo block right below brand — same shape as nav items but with the agent avatar. Click opens Agent panel.
- **Nav (8 items, single section "Workspace"):** Dashboard / Lead Finder / Channel Analyzer / Pitch Gen / Email Sender / CRM / Analytics / Settings. Each row: icon (16px) + label + 4-letter mono tag right-aligned (DASH/FIND/SCAN/PTCH/MAIL/CRM_/DATA/CONF). Active state: `var(--surface-2)` background, `var(--line)` border.
- Inbox row gets a **coral pulsing dot** (not orange/red) when unread > 0.
- **Footer:** AI credit meter ("6.4k / 10k" with a lime progress bar) + org switcher block.

### 4.4 Sysbar (new persistent strip)

Bottom 28px, fixed, full-width minus agent. Shows:
- `● SCRAPER  ● YT·API  ● GEMINI  ● SMTP` — each with a lime dot if healthy. Replaces the sidebar status panel.
- `● 2 agents working` — pulsing lime, count of in-flight agent actions.
- (spacer)
- `v2.4.1 · uptime 12d 4h`
- `Ask agent ⌘K` (clickable)

Mono 10.5px throughout, `var(--text-3)` color, `var(--bg-2)` background, `var(--line)` top border.

---

## 5. Component primitives

Create these as **one shared component per primitive**. Delete all inline-style duplicates and Tailwind class-based duplicates. Single source of truth.

Suggested location: `frontend/src/components/ui/`.

### 5.1 `<Button variant size>`

Variants: `primary` (lime fill, dark text) · `secondary` (surface with border) · `ghost` (transparent) · `coral` (coral-soft fill, coral text — for "human" actions like Reply) · `danger`.
Sizes: `sm` (26px) · `md` (32px, default) · `lg` (40px).

```jsx
<Button variant="primary"><Icon name="bolt" />Launch PowerMode</Button>
<Button variant="coral"><Icon name="reply" />Reply to 3</Button>
```

Never use gradients. Never use box-shadow glow. `white-space: nowrap`.

### 5.2 `<Badge kind>`

Kinds: `lime` · `coral` · `ok` · `warn` · `bad` · `ghost` (default).

```jsx
<Badge kind="lime"><span className="dot dot--pulse"/>Live</Badge>
<Badge kind="coral">3 unread</Badge>
```

Pill shape, 1px border, soft-tinted background, accent-color text.

### 5.3 `<Card>` & `<Card.Head>` & `<Card.Body>`

Background `var(--surface)`, border `1px solid var(--line)`, radius `var(--r-md)`.
Head: 14px padding bottom, 1px bottom border, title + actions row.
Body: 16px padding.

```jsx
<Card>
  <Card.Head title="Connected mailboxes" actions={<Button size="sm">Add</Button>}/>
  <Card.Body>...</Card.Body>
</Card>
```

### 5.4 `<Avatar name size>`

Sizes: `sm` (22px) · `md` (28px) · `lg` (36px) · `xl` (48px). Always shows initials with a deterministic color from name hash.

### 5.5 `<ChannelChip color>`

Tiny pill with a colored dot + label. Used for niche tags (Finance/Tech/etc).

### 5.6 `<Stat label value delta trend spark mono>`

Standard KPI tile. Uses Instrument Serif italic for value unless `mono` prop set.

### 5.7 `<Sparkline data color>`

SVG path-based mini chart. Gradient fill at 10% opacity.

### 5.8 `<DarkTooltip>` (Recharts)

ONE implementation. Background `var(--bg-2)`, border `var(--line)`, radius `var(--r)`. Used in both Dashboard and Analytics.

### 5.9 `<Toggle on>`

The on-color is **always `var(--lime)`** (never coral, never orange — pick one and stop). 36×20 pill, white knob.

### 5.10 `<Icon name size>`

Continue using `lucide-react`. Single 16px default size. All decorative icons inherit `currentColor`.

---

## 6. Screen-by-screen migration

### 6.1 Dashboard

- Replace 6 KPI cards (orange/green/cyan/yellow/purple bordered) with 4 KPI cards: Emails sent (lime spark), Reply rate (coral spark), Meetings booked (cream serif number), Deliverability (ok green spark).
- "Pipeline $0" giant orange = gone. If pipeline is zero, show an editorial empty-state line in muted text: *"Your first campaign launches in 4 hours."*
- Activity feed lives center. Each row: timestamp (mono 11px, 56px width) · color dot · `TAG` mono uppercase · description. **The row for human-needed events gets a coral background tint + a coral "Reply →" button.**
- Right column: "Today's schedule" (mailbox warmup, send batch, research run, etc) with status badges.
- Below: 5-row active campaigns table with reply % in coral. Inbox-needs-attention card with coral 3-unread badge.

### 6.2 Lead Finder

- 5 tabs: YouTube / Reddit / Viral / Competitor / Upload CSV. Mono sub-labels under each.
- **PowerMode card** is the hero. Lime icon square + title + sub. Below: 4 filter inputs (sub range, geo, cadence, last upload). Below: 9 niche chips (lime when selected). Below: 56px tall lime CTA: "Launch PowerMode · ~30s · 1 niche".
- During scrape, below the CTA: a bordered lime-tinted feed panel with mono timestamps and streaming lines ("✓ 142 enriched · 32 had no email").
- Results table: avatar+name+handle, niche chip, subs, CPM (lime), last upload, email ✓/–, **score chip** (coral if ≥90, lime if ≥80, neutral otherwise).

### 6.3 Channel Analyzer (the screenshot-worthy moment)

Two-column layout: 320px sticky hero left + scrolling body right.

**Hero (left, sticky):**
- 88px circular avatar (serif initial)
- A+ score badge (coral)
- Name + handle + 1-line description
- 6-cell metric grid (Subs/Avg views/CPM/Cadence/Engagement/Audience) in mono
- "Contact" block with email + verified check
- "Verified via Hunter · Apollo · MX check" muted

**Body (right):**
- **What the agent learned** — 6 bulleted insights with green check icons. Plain-English observations ("Talks like an everyman. Avoid finance-speak.")
- **Recommended angles** — 3 ranked variants. Top one gets `coral-soft` background and a "Recommended" badge.
- **Recent uploads** — 5 rows with thumb placeholder, title, views, "best performer" annotation.
- **Sponsor history** — 3-column grid: brand name + count + "Direct competitor risk" / "Adjacent — safe" badge.
- **Audience signal** — keyword chips from comment analysis + summary sentence.

Top action: "Draft pitch with this brief →" (coral btn).

### 6.4 Pitch Gen

Merge the existing 5-step generator with the standalone "Pitch Gen" writer. One surface.

**5-step rail** at top: Brief → Research → Variants → Sequence → Send. Done steps show lime check, current step shows lime number.

**Left column:** Brief summary + Variants picker (3 ranked, score on right).
**Right column:** Subject A/B chips + Mail preview (with `{{token}}` highlights in lime) + Predicted open/reply/spam grid + Followup sequence rows.

Bottom right: `Queue for sending` lime primary CTA.

### 6.5 Email Sender

4 KPI tiles at top: Queued / Sent today / Replied (coral) / Inbox placement (lime).

Tabs: Queue · Sent · Opened · Replied · Bounced. Replied count is coral.

Queue table: drag handle (⋮⋮) · checkbox · recipient · subject · from-mailbox · will-send-at · row actions.

Top actions: `Pause sending` ghost · `Power Follow-up` coral · `Power Send · 412 ready` lime primary.

**Power Send overlay** (replaces existing PowerSendOverlay): centered modal, serif title with the count in lime italic. Per-mailbox plan table (mailbox · count · time-window). Disclaimer about gaps and auto-pause. Cancel + Launch.

**Delete PowerFollowUpOverlay's navy custom palette.** Use the same overlay shell with coral instead of navy.

### 6.6 CRM

9-stage kanban: Discovered · Enriched · Sent · Opened · Replied (coral header) · Qualified · Call booked · Won (ok green) · Lost.

Each column: header with color-coded swatch + label + count badge + total $ value below. Cards inside: avatar + name + handle/subs + niche chip + value (lime mono right-aligned). Hot leads get a coral border + pulsing coral dot.

Click a card → slide-in 440px detail panel from right (zIndex above content, below agent). Tabs: Pitch · Emails · Notes · Timeline. Bottom: Note · Pitch · Reply (coral) row.

Mobile: collapse the kanban into a stacked scrollable list grouped by stage (use `useIsMobile()`).

### 6.7 Analytics

Three tabs: Outreach · Pipeline · Platforms.

**Hero row:** Pipeline value generated ($184,200 in cream italic 96px) + Meetings booked (146 in coral italic 64px) + Cost per meeting ($4.20 in white italic 64px, with lime delta).

**Funnel:** Sent (white) → Delivered (white) → Opened (lime) → **Replied (coral) → Positive (coral) → Meeting (cream)**. Color encodes machine→human progression.

**Best-time heatmap:** 7×24 grid using oklch lightness for intensity. Mono day labels.

**Top-performing copy:** Subject lines with sent/open mono muted + reply % in coral.

### 6.8 Settings

Five tabs: Profile · Mailboxes & sending · Integrations · Team · Plan & billing.

**Mailboxes tab** (absorbs the old separate Mailboxes/Warmup page):
- "Connected mailboxes" card with rows: provider letter (G/M/S) · email · warmth bar · today bar · status badge.
- "Sending rules" card with 6 key:value rows (send window, gap, skip on reply, etc).

**Plan tab:**
- Current plan card with serif headline summarizing limits + 3 usage bars.
- 3-card pricing comparison. Current plan = coral background + Current badge.

**Integrations tab:** Single column list of providers (Google, Microsoft, Smartlead SMTP, YT API, Hunter, Apollo, Slack, Zapier). Each row: provider icon + name + status sub-line + Connected badge / Connect button.

**Team tab:** 4 rows with avatar + online-dot + name + email + role badge (Owner = coral).

### 6.9 Login / Signup / Onboarding

Same card shell. Replace **the orange-gradient submit button** with a flat lime button. Replace the **unstyled "Remember me" checkbox** with a custom 14×14 checkbox: 1px `var(--line)` border, lime fill + dark check when on. PasswordStrength bar uses `bad/warn/lime` (drop the 4-color rainbow).

---

## 7. Animation & motion

Keep Framer Motion. Tighten these defaults:

```js
// Default page/tab transition
{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }
```

Specifics:
- Hover states: pure CSS `transition: background .12s, border-color .12s, color .12s` — no Framer.
- Status pulse: CSS `@keyframes` only, 1.8s loop, lime or coral box-shadow ring.
- Number tickers (agent action count, queue count): scale-bounce on change is fine but cap at 0.25s.
- Avoid: spin-forever icons, glowing borders, pulsing CTAs at rest. Use motion to signal *change*, not presence.

---

## 8. Styling strategy decision

**Pick:** Inline CSS custom properties (current `var(--bg-card)` pattern) **for color, surface, typography, radius**. Use **Tailwind only for layout primitives** (`flex`, `grid`, `gap-*`, `p-*`, `w-*`).

**Migrate these existing patterns:**
- `bg-dark-800`, `bg-dark-700` → inline `style={{ background: 'var(--surface)' }}`
- `text-slate-200/400/500` → inline `style={{ color: 'var(--text)/var(--text-2)/var(--text-3)' }}`
- `border-dark-600/700` → inline `style={{ border: '1px solid var(--line)' }}`
- `.card`, `.btn`, `.input` Tailwind component classes → use the new shared `<Card>`, `<Button>`, `<Input>` primitives.

**Allowed Tailwind classes (keep these):**
- Spacing: `p-*`, `px-*`, `py-*`, `m-*`, `gap-*`
- Layout: `flex`, `grid`, `grid-cols-*`, `items-*`, `justify-*`
- Sizing: `w-*`, `h-*`, `max-w-*`
- Responsive prefixes on the above: `sm:`, `md:`, `lg:`

**Forbidden Tailwind classes (always use tokens):**
- All color utilities: `bg-*`, `text-*` (color), `border-*` (color)
- All typography utilities: `font-*`, `text-xs/sm/base/lg/etc`
- All shadow utilities: `shadow-*`

---

## 9. Migration order

Don't refactor everything at once. Sequence:

1. **Tokens first** — replace `index.css` `:root` block with section 2.2 above. Add Google Fonts import for Geist + Instrument Serif + Geist Mono. Delete Syne/Inter/DM Mono imports. (1 commit, ~30 min, app will look broken — expected)
2. **Sidebar + Topbar + Sysbar + Agent shell** — rebuild the four shell components. Wire ⌘K to toggle agent. (1 day)
3. **Component primitives** — build `<Button>`, `<Badge>`, `<Card>`, `<Avatar>`, `<Stat>`, `<Sparkline>`, `<DarkTooltip>`, `<Toggle>`. Replace all duplicates. (2 days)
4. **Dashboard** — migrate as reference implementation. (1 day)
5. **Lead Finder + Channel Analyzer** (the Discover loop). (2 days)
6. **Pitch Gen + Email Sender + CRM** (the Convert loop). (3 days)
7. **Analytics + Settings**. (1 day)
8. **Onboarding + Login + Signup**. (0.5 day)
9. **Delete PowerFollowUpOverlay's custom palette + dual DarkTooltip + unstyled checkbox + toggle color drift.** (0.5 day cleanup)

**Total: ~11 working days.** Do not skip step 1. Tokens must land first or you'll be migrating against a moving target.

---

## 10. Acceptance criteria

The migration is done when:

- [ ] `index.css` `:root` matches section 2.2 byte-for-byte (tokens only — no scattered hex).
- [ ] `grep -r "#FF4500\|#00E5A0\|#7B61FF\|#F5A623" frontend/src/` returns zero results.
- [ ] `grep -r "Syne\|Inter\|DM Mono" frontend/src/` returns zero results.
- [ ] `grep -r "bg-dark-\|text-slate-\|border-dark-" frontend/src/` returns zero results.
- [ ] Every Recharts tooltip uses the shared `<DarkTooltip>` component.
- [ ] Every badge in the app uses `<Badge>` — no inline-styled badges remain.
- [ ] Every button uses `<Button>` — no inline-styled buttons remain.
- [ ] PowerFollowUpOverlay uses `var(--bg-2)` and `var(--line)` (no navy hex literals).
- [ ] Pressing ⌘K from any screen toggles the agent slide-out.
- [ ] Mobile CRM shows a stacked-list view, not the kanban.
- [ ] The Remember Me checkbox on /login is custom-styled.
- [ ] No gradients on buttons. (Check: `grep "linear-gradient" frontend/src/ | grep -i "button\|btn"` returns zero.)
- [ ] Reply rate, meetings booked, hot leads — all coral. Sent volume, primary CTAs, "live" — all lime. Nothing crosses lanes.

---

## 11. Things to NOT do

- Don't add a 7th nav item. The shape is the shape.
- Don't bring back orange. The old brand is dead.
- Don't make the agent a floating bot. It's a slide-out peer.
- Don't add icons inside body text. Icons are for nav, badges, and action affordances only.
- Don't use serif anywhere except page titles and hero stats.
- Don't use Tailwind for color. Ever.
- Don't add a "rainbow palette" feature for niches/stages/anything else. We have 7 muted hues for category coding and they're enough.
- Don't reach for a third semantic accent. The product is **lime × coral**. That's the brand.

---

*Spec end. If anything is ambiguous, default to: simpler, calmer, more restrained. Premium products err on the side of "boring." Boring beats busy.*
