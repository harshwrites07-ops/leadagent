# ContentCrafterzz Outreach OS — Design Audit

**Prepared for external design partner**  
**Date:** 2026-05-27  
**Codebase:** `frontend/src/` (React 18.3.1 · Vite 5.3.4 · Tailwind 3.4.6)

---

## 1. Design System Foundations

### Color Palette

All tokens live in `frontend/src/index.css` as CSS custom properties on `:root`.

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#080808` | Page root background |
| `--bg-surface` | `#0F0F0F` | Sidebar, drawer panels |
| `--bg-card` | `#111111` | Primary card backgrounds |
| `--bg-elevated` | `#1A1A1A` | Input fields, table headers, nested cards |
| `--bg-card-hover` | `#161616` | Table row / card hover state |
| `--border-subtle` | `#1E1E1E` | Default card borders, dividers |
| `--border-default` | `#2A2A2A` | Input borders, secondary dividers |
| `--border-strong` | `#3A3A3A` | Modal borders, confirm dialogs |
| `--text-primary` | `#F5F5F5` | Headlines, primary labels |
| `--text-secondary` | `#A0A0A0` | Body text, descriptions |
| `--text-muted` | `#555555` | Placeholders, timestamps, meta |
| `--accent-primary` | `#FF4500` | Brand orange — CTAs, active states, accents |
| `--accent-hover` | `#FF5A1F` | Hover on primary accent |
| `--gradient-orange` | `linear-gradient(135deg, #FF4500, #FF6B00)` | Primary buttons, Power buttons |

**Semantic accent palette** (used directly as hex in components, not as tokens):

| Name | Value | Role |
|---|---|---|
| Green / Success | `#00E5A0` | Sent emails, active status, positive badges |
| Purple | `#7B61FF` | AI-related features, Pitch step, Reddit DM |
| Amber | `#F5A623` | Warm leads, warnings, best send times |
| Cyan | `#00B8D4` | Cold leads, Studying CRM stage |
| Blue | `#4A9EFF` / `#4285F4` | Starter plan, Gmail OAuth |
| Red error | `#FF4444` | Danger, failed state, delete |
| Red soft | `rgba(255,68,68,0.12)` | Error boxes background |

> **Gap:** `#4A9EFF` (plan badge) and `#4285F4` (Gmail card) are two slightly different blues used for similar "connected account" concepts — not unified into a token.

### Typography

Three fonts imported via `@import` in `index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Inter:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
```

| Token | Font | Weight | Usage |
|---|---|---|---|
| `--font-heading` | Syne | 700–800 | Page titles (`h1`), logo text, POWERMODE label |
| `--font-body` | Inter | 300–800 | All body text, inputs, descriptions |
| `--font-mono` | DM Mono | 400–500 | Stats numbers, labels, badges, timestamps, technical metadata |

**Base:** `html { font-size: 14px }` — all `rem` values are 14px-based.

**Type scale in use (px, approximate):**

- 9px mono — micro labels, badge text, section headers (ALL CAPS, `letterSpacing: '0.14–0.18em'`)
- 10–11px — secondary meta, timestamps, table sub-labels
- 12px — body text in tables, cards, notes
- 13px — primary body, input text, button text
- 14–15px — sub-headings, list item primary text
- 16px — section titles in modals
- 18–20px — page subtitle / modal heading
- 22–24px — `<h1>` page titles (desktop)
- 36px mono — stat numbers in Dashboard StatCards

### Spacing

No spacing tokens — spacing is applied as inline style `px` or Tailwind classes. Common values observed:

- Card padding: `20px 24px` (desktop) / `14px` (mobile)
- Section gap: `16px`, `20px`, `24px`
- Button padding: `8px 16px` (standard), `9px 20px` (primary CTA)
- Topbar height: `56px` (desktop), `48px` (mobile)
- Sidebar width: `220px` (expanded), `56px` (collapsed)
- Border radius: `6px` (inputs, small elements), `8px` (cards, columns), `10–14px` (overlays, modals)

### Gradients

```css
--gradient-orange: linear-gradient(135deg, #FF4500, #FF6B00);   /* primary buttons */
--gradient-blue:   linear-gradient(135deg, #4A9EFF, #0066FF);   /* secondary accent */
--gradient-green:  linear-gradient(135deg, #00E5A0, #00B8D4);   /* success states */
--gradient-purple: linear-gradient(135deg, #7B61FF, #9C41FF);   /* AI / purple accent */
```

PowerMode button uses a three-stop gradient: `linear-gradient(135deg, #FF4500 0%, #FF6B00 50%, #FF8C00 100%)`.

AssistantChat bot avatar and fab use `linear-gradient(135deg, #FF4500, #FF8C00)`.

### Shadows

```css
box-shadow: 0 4px 24px rgba(255,69,0,0.4)   /* orange CTA glow */
box-shadow: 0 8px 32px rgba(0,0,0,0.6)       /* Bulk Action Bar */
box-shadow: 0 24px 60px rgba(0,0,0,0.8)      /* AssistantChat window */
box-shadow: 0 0 60px rgba(255,69,0,0.15)     /* PowerSendOverlay */
```

---

## 2. Layout System

### Sidebar (`frontend/src/components/ui/Layout.jsx`)

- **Width:** `220px` expanded / `56px` collapsed; CSS transition `0.2s ease`
- **Background:** `var(--bg-surface)` = `#0F0F0F`
- **Border-right:** `1px solid var(--border-subtle)` = `#1E1E1E`
- **Logo area (top):** 32×32 orange gradient square ("CC") + "ContentCrafterzz" (13px, Syne 700) + "OUTREACH OS" (9px, DM Mono)
- **Nav items (8):** icon (lucide 18px) + label + mono tag badge (9px, ALL CAPS: DASH/FIND/SCAN/PTCH/MAIL/CRM\_/DATA/CONF)
  - Icons: LayoutDashboard, Search, Activity, Zap, Mail, Users, BarChart2, Settings
  - **Active state:** `background: rgba(255,69,0,0.08)`, `border-left: 2px solid #FF4500`, border `rgba(255,69,0,0.2)`
  - **Hover:** `background: rgba(255,255,255,0.04)`
- **Status card (bottom):** "SYSTEM ONLINE" pill with 4 rows: SCRAPER, YT API, GEMINI, SMTP — each with a color dot + label
- **Collapse toggle:** chevron button at bottom; hides labels at `<56px` breakpoint

### Topbar

- **Height:** `56px` desktop / `48px` mobile
- **Background:** `var(--bg-surface)`, `border-bottom: 1px solid var(--border-subtle)`
- **Left:** "OUTREACH_OS ›" (9px mono, muted) + current page name (13px, primary, 600)
- **Center/right:** live clock in DM Mono (`HH:MM:SS`), "LIVE" pill (green dot + 9px "LIVE" green), `<UserMenu />`
- **UserMenu:** dropdown with user avatar (32px circle, initials or photo), name, plan badge color (free `#888`, starter `#4A9EFF`, growth `#00E5A0`, agency `#FF4500`), Profile/Settings links, Logout

### Content Area

- **Left offset:** `220px` (sidebar expanded) / `56px` (collapsed), CSS transition matching sidebar
- **Top offset:** `56px` (topbar height)
- **Padding:** `24px` desktop / `16px` mobile
- **Max width:** varies — `1440px` (LeadFinder), `680px` (Settings), unconstrained (CRM, EmailSender)

### Bottom Nav (mobile)

- **Height:** `60px`, `position: fixed; bottom: 0`
- **Background:** `var(--bg-surface)`, `border-top: 1px solid var(--border-subtle)`
- **8 icon-only items** at `z-index: 50`
- **Active state:** orange icon color

### AssistantChat (floating, global)

- Always rendered in `App.jsx` for all authenticated routes
- **Closed state:** 56×56px orange gradient FAB, `bottom: 24px; right: 24px`, `z-index: 9999`
- **Open state:** 390px wide, 560px tall (or `auto` when minimized), `border-radius: 18px`, dark background `#0d0d0d`, border `1px solid #1e1e1e`
- Draggable via header mousedown; position saved in state (`pos`)
- Green dot on FAB indicates "online"

---

## 3. Component Library

### Buttons

Two styling approaches coexist:

**A. CSS class-based (Tailwind utility classes in `index.css` via `@layer components`):**

| Class | Appearance |
|---|---|
| `.btn` | Base: `inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all` |
| `.btn-primary` | Orange gradient background, white text, `shadow-lg shadow-brand-900/30` |
| `.btn-secondary` | `bg-dark-700 text-slate-200 border border-dark-600 hover:bg-dark-600` |
| `.btn-ghost` | Transparent, `text-slate-400 hover:text-white hover:bg-dark-700` |
| `.btn-danger` | `bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30` |

**B. Inline-style buttons (majority of codebase):**
Most pages (LeadFinder, CRM, Settings, Dashboard) use fully inline-styled `<button>` elements. Common patterns:
- Primary: `{ background: 'var(--gradient-orange)', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px' }`
- Secondary: `{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }`
- Danger: `{ background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', color: '#FF4444' }`

**Mobile touch targets:** `minHeight: 44–48px` added explicitly on mobile-branched `isMobile` paths.

### Inputs

```js
// Shared inline style object (repeated across files)
{
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontFamily: 'var(--font-body)',
  outline: 'none',
}
```

Focus state is set via `onFocus`/`onBlur` handlers that directly mutate `e.target.style.borderColor` — **no CSS `:focus` rule is used**. Focus ring: `rgba(255,69,0,0.5)`.

Mobile variant adds `fontSize: 16` (prevents iOS zoom) and `minHeight: 48`.

Textarea: same styles + `resize: none`, `lineHeight: 1.6`.

Select: inherits input styles; no custom arrow — uses browser default.

**`.input` CSS class** (Tailwind-based, used in PitchGenerator, EmailSender):
```css
.input {
  @apply w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2
         text-slate-200 placeholder-slate-500 text-sm
         focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500
         transition-colors;
}
```

### Labels

Two styles in parallel:

```js
// Inline (most pages)
{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
  letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase' }
```
```css
/* CSS class (PitchGenerator) */
.label { @apply text-slate-500 text-xs font-medium uppercase tracking-wider }
```

### Badges

Inline-styled throughout. Common patterns:

```js
// Temperature badge
{ fontSize: 9, padding: '2px 8px', borderRadius: 99,
  fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em',
  background: rgba(255,69,0,0.12), color: '#FF4500', border: 'rgba(255,69,0,0.3)' }

// Platform YT badge
{ fontSize: 9, background: 'rgba(0,184,212,0.12)', color: '#00B8D4', border: 'rgba(0,184,212,0.3)' }

// Platform RD badge
{ fontSize: 9, background: 'rgba(123,97,255,0.12)', color: '#7B61FF', border: 'rgba(123,97,255,0.3)' }
```

**CSS badge classes** (used in PitchGenerator, EmailSender):
```css
.badge        { @apply inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border }
.badge-blue   { @apply bg-blue-400/10 text-blue-400 border-blue-400/30 }
.badge-green  { @apply bg-green-400/10 text-green-400 border-green-400/30 }
.badge-warm   { @apply bg-amber-400/10 text-amber-400 border-amber-400/30 }
.badge-purple { @apply bg-violet-400/10 text-violet-400 border-violet-400/30 }
.badge-hot    { @apply bg-brand-600/20 text-brand-400 border-brand-500/30 }
.badge-cold   { @apply bg-cyan-400/10 text-cyan-400 border-cyan-400/30 }
```

### Cards

Inline-style primary pattern:
```js
{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }
```

CSS class equivalent (used in PitchGenerator, EmailSender, Analytics):
```css
.card { @apply bg-dark-800 border border-dark-700 rounded-xl p-5 }
.card-hover { @apply hover:bg-dark-700/50 transition-colors cursor-pointer }
.stat-card { @apply bg-dark-800 border border-dark-700 rounded-xl p-4 }
```

> **Inconsistency:** `.card` uses Tailwind `dark-800` (which maps to `#1e293b` in Tailwind dark slate), while the inline card style uses `var(--bg-card)` (`#111111`). These produce noticeably different backgrounds — PitchGenerator/Analytics feel lighter/bluer than LeadFinder/CRM/Settings.

### Modals / Overlays

- **ConfirmModal** (`ConfirmModal.jsx`): fixed inset, `rgba(0,0,0,0.75)` scrim, card `maxWidth: 400`, `bg-surface`, `border-strong`, `borderRadius: 12`, `padding: 24px`
- **EmailModal** (EmailSender): `fixed inset-0 bg-black/70`, card `max-w-2xl max-h-[80vh]`, Framer Motion scale animation
- **LeadDetailPanel** (CRM): slides from right, `width: 460px`, spring animation `(damping: 26, stiffness: 300)`, `z-index: 40`
- **PowerSendOverlay**: full-screen fixed, `rgba(0,0,0,0.88)` scrim, card `maxWidth: 580`, orange border glow
- **PowerFollowUpOverlay**: full-screen fixed, `rgba(0,0,0,0.85)` + `backdropFilter: blur(4px)`, card `background: #0f0f1a; border: #2d2d4a` — **uses hardcoded hex values, not design tokens**
- **AssistantChat**: fixed position, draggable, `z-index: 9999`

### Tables

Two patterns:

**A. Inline-styled full tables** (LeadFinder): `<table>` with `border-collapse: collapse`, `th` and `td` using shared style objects (`thStyle`, `tdStyle`)
```js
thStyle = { padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-muted)' }
tdStyle = { padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }
```
**B. Tailwind-based tables** (EmailSender history, Analytics): `<table className="w-full text-sm">` with `thead/tr` using Tailwind utilities

### Toggles (custom)

```jsx
// settings.jsx — Toggle component
<div style={{ width: 36, height: 20, borderRadius: 10,
  background: checked ? '#FF4500' : 'var(--bg-elevated)',
  border: '1px solid var(--border-default)' }}>
  <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%',
    background: '#fff', left: checked ? 16 : 2 }} />
</div>
```
Same toggle pattern also appears inline in LeadFinder's "Email required" and email filter controls (`background: '#00E5A0'` when on — different active color than Settings toggle).

### TagInput (Settings)

Custom component with pill tags, comma-separated suggestions dropdown, keyboard `Enter` to add. Pills: `rgba(255,69,0,0.08)` background, `rgba(255,69,0,0.2)` border, `#FF4500` text.

---

## 4. Page-by-Page Analysis

### Login (`/login`)

- Full-screen, `bg-base` (#080808), vertically centered
- Card: `maxWidth: 400px`, `bg-surface`, `border-subtle`, `borderRadius: 16`, `padding: 36px 32px`
- Logo: 36×36 orange gradient square + branding text
- Heading: "Welcome back" — 22px Syne 800
- 2 fields (Email, Password) with lucide prefix icons (14px, muted color)
- Password: show/hide toggle button
- Remember Me: HTML `<input type="checkbox">` — **unstyled, system default appearance**
- Forgot password: inline text link, 12px, `#FF4500`
- Primary CTA: full-width, orange gradient, 14px 700
- Divider: "or continue with" — CSS `::before`/`::after` lines
- Google OAuth + Phone Login: both outline style with icon, full-width
- Error: `rgba(255,68,68,0.12)` background, `rgba(255,68,68,0.3)` border

### Signup (`/signup`)

- Mirrors Login card structure
- 4 fields: Full Name, Email, Password, Phone (optional)
- `PasswordStrength` indicator: 4-segment bar, colors `['#FF4444', '#FF8C00', '#FFC107', '#00E5A0']`
- Same error box style as Login
- Google OAuth + Phone buttons

### Onboarding (`/onboarding`)

- Multi-step wizard (not fully read, structure follows same card pattern)

### Dashboard (`/`)

- 6-stat grid: `repeat(auto-fit, minmax(180px, 1fr))`
- StatCards: left `3px` accent border, 36px DM Mono stat number, 9px ALL-CAPS label
  - Colors: Total Leads (orange), Leads Today (green `#00E5A0`), Emails Sent (cyan `#00B8D4`), Reply Rate (amber `#F5A623`), Conversion (purple `#7B61FF`), Pipeline (orange)
- Below stats: 3 Recharts panels in a 2-col + 1-col layout
  - BarChart (leads per day) — fill `#FF4500`
  - AreaChart (emails sent) — stroke `#00E5A0`, fill gradient `rgba(0,229,160,0.2)` → transparent
  - BarChart (reply rate) — fill `#7B61FF`
- Right panel: 300px fixed-width activity feed (`AnimatePresence` stagger, `framer-motion`)
- CRM distribution: 6px segmented bar, each stage color matching STAGES constant
- Empty state: centered card, Activity icon, orange CTA
- Skeleton: shimmer `@keyframes shimmer` animation while loading

### Lead Finder (`/leads`)

- Page max-width: `1440px`
- **PowerMode button:** 72px height, full-width orange gradient button; when running — bordered live feed panel
- **QuickHunt panel:** 9 niche buttons with color-coded sub-target buttons
- **Tab bar:** 4 tabs (YouTube, Reddit, Viral, Competitor) — `width: fit-content`, scrollable on mobile
- Active tab: `rgba(255,69,0,0.1)` bg, `rgba(255,69,0,0.25)` border, accent color text
- **YouTube tab:** 6-col form grid (2fr + 5×1fr), "Email required" custom toggle, stream-based results
- **Result table:** sticky-column-aware table with thumbnail (30px circle), temperature badge, 4px score bar, pain point badges, actions
- **Mobile:** `MobileLeadCard` — accordion with `AnimatePresence` height animation, min 44px touch targets
- Quota error: amber card with "Try Reddit instead" button
- Loading: 48px spinner + animated progress bar

### Channel Analyzer (`/analyzer`)

- Not fully read — structured similarly to LeadFinder with AI analysis output

### Pitch Generator (`/pitch`)

- 30/70 split layout: left panel (lead selector) / right panel (pitch content)
- Left panel: search input, scrollable lead list with `LeadListItem` components
- `LeadListItem`: `bg-brand-600/20` when selected, Tailwind class-based
- Right panel: `StepIndicator` with 5 steps — uses Tailwind classes (green/brand/dark-700 rings)
- `SectionCard`: collapsible, Tailwind `.card` class
- Cold email section: editable subject + body textarea, `PitchScoreBadge` (green ≥8, yellow ≥6, red <6)
- Subject variants: pill buttons, `bg-brand-600/20` when selected
- > **Note:** PitchGenerator is the most Tailwind-heavy page — uses `.btn`, `.btn-primary`, `.btn-secondary`, `.card`, `.input`, `.label`, `.badge` throughout; inconsistent with other pages using inline styles.

### Email Sender (`/email`)

- Mixed Tailwind/inline styling
- Header: 4 power buttons (Follow Up — red gradient; Power Email — orange gradient)
- Stats bar: 4 `MiniStat` cards using `.stat-card` class
- Left panel (Queue): `DndContext` drag-to-reorder, `SortableQueueItem` with grip handle
- Right panel (History): tab bar for All/Opened/Replied/Bounced, Tailwind table
- Bottom strip: SMTP status indicator (green/red/loading)
- Modals: EmailModal for body preview, PowerSendOverlay, PowerFollowUpOverlay

### CRM (`/crm`)

- Full kanban board: 9 columns (STAGES), `@dnd-kit` drag and drop
- Column header: color dot + glowing `box-shadow`, colored top border (2px), count badge
- Column background on drag-over: `${stage.color}08`
- `LeadCard`: thumbnail (32×32 circle), 3 quick-action micro-buttons (Pitch/Email/Note), temperature + platform badges
- **LeadDetailPanel**: slide-in from right (spring animation), 460px wide, 4 tabs (Pitch/Emails/Notes/Timeline)
  - Pitch tab: `<pre>` with DM Mono for email body
  - Notes: textarea + save, note history
  - Timeline: dot timeline with activity items
- **BulkActionBar**: fixed bottom center, `AnimatePresence`, stage move dropdown + action buttons
- **DragOverlay**: floating card ghost during drag, orange border
- Top bar: search, temperature/platform filter pills, refresh, Export New/All CSV buttons, Select All, Power Email

### Analytics (`/analytics`)

- 3 tabs: Outreach / Pipeline / Platforms
- Date range selector: 7d/30d/90d/All — `bg-dark-800` pill group, active `bg-brand-600`
- **Outreach tab:** 2×2 chart grid — BarChart (emails/day), LineChart (open/reply rates), best subjects table, best times BarChart
- **Pipeline tab:** hero pipeline value (`text-5xl text-gradient`), 3 stats, horizontal funnel bars with Framer Motion `width` animation
- **Platforms tab:** comparison table (YouTube vs Reddit), niche conversion BarChart (horizontal), subreddit performance table
- Chart colors: `#FF4500`, `#00E5A0`, `#7B61FF`, `#F5A623`, `#00B8D4`, `#FF4560`
- `DarkTooltip`: custom Recharts tooltip, `var(--bg-elevated)` background

### Settings (`/settings`)

- Max-width: `680px`, centered
- 4 collapsible `Section` components (User / Chevron)
  - My Profile: 2-col grids, TagInput for niches, char counter
  - Connected Email Accounts: GmailCard list + dashed "Connect Gmail" button
  - Outreach Preferences: `ToggleGroup` (3-button pill selector), range slider (`accentColor: '#FF4500'`), Toggle switch
  - Plan & Billing: current plan row (border color matches plan color), usage progress bars, 3-column pricing cards
- Sticky "Save Settings" button: bottom-right fixed, orange gradient when dirty, muted when clean
- Unsaved indicator: amber pill badge in header with pulsing dot

### Admin / AdminSettings (`/admin`, `/admin/settings`)

- Not fully read — admin-only routes

---

## 5. Animation & Motion

### Framer Motion Usage (`framer-motion@10.18.0`)

**Page transitions:**
```jsx
// All animated pages/tabs use this pattern:
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.18 }}
```

**Components using motion:**

| Component | Animation |
|---|---|
| Dashboard StatCards | `initial={{ opacity: 0, y: 20 }}` stagger |
| Activity feed items | `AnimatePresence` + stagger delay |
| BulkActionBar (CRM) | `initial={{ y: 80, opacity: 0 }}` slide up from bottom |
| LeadDetailPanel | `x: '100%'` spring slide-in |
| KanbanColumn drag-over | Background color transition |
| MobileLeadCard expand | `height: 0 → 'auto'` animated |
| PowerMode live feed | `initial={{ opacity: 0, x: -10 }}` stagger items |
| Pipeline funnel bars | `width: 0 → ${pct}%` with 0.6s duration |
| Analytics tab content | `opacity: 0 → 1` with y shift |
| PowerMode button | `whileHover={{ scale: 1.005 }}`, `whileTap={{ scale: 0.997 }}` |
| Zap icon in PowerMode active | `animate={{ rotate: 360 }}`, `repeat: Infinity, duration: 0.8` |
| PowerMode total count | `key={count}` with scale bounce on change |

**AnimatePresence** is used for: tab switching, bulk action bar appear/disappear, mobile card expand, modal transitions, activity feed.

### CSS Animations (in `index.css`)

```css
@keyframes spin            /* 1s linear infinite — loader spinners */
@keyframes pulse           /* 2s ease-in-out — status dots */
@keyframes shimmer         /* 2s linear — skeleton loading */
@keyframes statusPulse     /* 2s ease-in-out — URGENT badge, LIVE badge */
@keyframes borderPulse     /* 2s ease-in-out — PowerMode active container */
@keyframes voiceBar        /* 0.8s alternate stagger — AssistantChat voice wave */
```

Progress bar in LeadFinder uses `Framer Motion` `animate={{ width: ['10%', '85%'] }}` with `easeInOut` over 25 seconds.

---

## 6. Responsive / Mobile Behavior

### Breakpoints

No Tailwind `sm:/md:/lg:` config customization found — default Tailwind breakpoints apply. The codebase uses a custom React hook for mobile detection:

```jsx
// Layout.jsx
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}
```

This hook is imported in LeadFinder, Layout, and PowerMode. Pages using Tailwind classes use `sm:`/`lg:` directly.

### Mobile Adaptations

| Feature | Desktop | Mobile |
|---|---|---|
| Sidebar | 220px expanded, collapsible | Hidden; bottom nav shown |
| Bottom nav | Hidden | 60px fixed, 8 icon-only items |
| LeadFinder results | Full table with 9 cols | `MobileLeadCard` accordion |
| YouTube scrape form | 6-col grid | 1-col grid, 4 visible fields |
| Topbar | 56px, full content | 48px, compressed |
| PowerMode button | 72px with subtext | 64px, condensed text |
| Buttons | Min no specific height | `minHeight: 44–48px` added |
| Input font-size | 13px | 16px (prevents iOS zoom) |
| CRM Kanban | Horizontal scroll | Horizontal scroll (same) |

### Scrollbars

Custom scrollbar globally:
```css
::-webkit-scrollbar { width: 4px; height: 4px }
::-webkit-scrollbar-track { background: transparent }
::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 2px }
::-webkit-scrollbar-thumb:hover { background: #FF4500 }
```

---

## 7. Dark Theme Implementation

### Background Layering System

The design uses a 5-level darkness stack:

1. `#080808` — page root (`--bg-base`)
2. `#0F0F0F` — sidebar, drawer panels (`--bg-surface`)
3. `#111111` — primary cards (`--bg-card`)
4. `#1A1A1A` — inputs, elevated surfaces (`--bg-elevated`)
5. `#2A2A2A` — borders (`--border-default`), scrollbar thumb

> **Anomaly:** `PowerFollowUpOverlay` uses hardcoded `#0f0f1a` and `#1a1a2e` (navy-tinted dark), breaking from the pure-black theme system. Its background feels noticeably different.

### Blur / Glass Effects

Only one place: `PowerFollowUpOverlay` — `backdropFilter: blur(4px)`. No other frosted glass usage.

### Status System (sidebar)

- **Green dot + ONLINE** for "SYSTEM ONLINE" pill
- Service rows: dot colors are green (ok), amber (degraded), red (down)
- Uses `animation: 'statusPulse 2s ease-in-out infinite'` on LIVE/ACTIVE indicators

### Toast Configuration (`main.jsx`)

```jsx
toastOptions: {
  style: { background: '#1a1a2e', color: '#e2e8f0', border: '1px solid #2d2d4a' },
  success: { iconTheme: { primary: '#00E5A0', secondary: '#1a1a2e' } },
  error:   { iconTheme: { primary: '#FF4444', secondary: '#1a1a2e' } },
}
```

> **Inconsistency:** Toast background `#1a1a2e` (navy-tinted) and border `#2d2d4a` don't match the design system's pure-black `--bg-elevated` (`#1A1A1A`) and `--border-default` (`#2A2A2A`).

---

## 8. Icon Usage

**Library:** `lucide-react@0.400.0`

All icons are sized inline via the `size` prop. No icon wrapping component or icon system. Sizes observed:

| Context | Size |
|---|---|
| Nav sidebar | 18px |
| Topbar / page headers | 15–18px |
| Card section icons | 14–16px |
| Table row actions | 10–13px |
| Micro badges / inline text | 10–12px |
| PowerMode Zap (active) | 18–26px |
| AssistantChat FAB | 22px |
| Page `<h1>` decorative | 28px |
| Onboarding / empty state | 28–36px |

**Common icon→color patterns:**
- `Zap` → orange (`#FF4500`, or white on gradient bg)
- `Bot` → white (on gradient avatar)
- `CheckCircle` / `Check` → green (`#00E5A0` or `text-green-400`)
- `AlertCircle` / `XCircle` → red
- `Clock` / `Calendar` → amber
- `BarChart2` → nav icon (muted default, orange active)
- `ShieldAlert` → amber (Spam Monitor)
- `MessageSquare` → purple (`#a78bfa`)

**No custom SVG icons** — 100% lucide-react.

---

## 9. Data Visualization

**Library:** `recharts@2.12.7`

All charts are wrapped in `<ResponsiveContainer width="100%" height={220|240|250}>`.

### Global Chart Theme Constants (Analytics.jsx)

```js
const GRID_COLOR = '#1E1E1E';   // matches --border-subtle
const TICK_COLOR = '#555555';   // matches --text-muted
const C_PRIMARY  = '#FF4500';
const C_SUCCESS  = '#00E5A0';
const C_PURPLE   = '#7B61FF';
const C_AMBER    = '#F5A623';
const C_CYAN     = '#00B8D4';
const C_RED      = '#FF4560';
```

### Custom DarkTooltip Component

Used in both Dashboard.jsx and Analytics.jsx — two slightly different implementations. Analytics version uses `var(--bg-elevated)` and `var(--border-default)`. Dashboard version uses hardcoded `class="bg-dark-700 border border-dark-500"`.

### Chart Inventory

| Page | Chart Type | Data | Fill/Stroke |
|---|---|---|---|
| Dashboard | BarChart | Leads per day | `#FF4500` |
| Dashboard | AreaChart | Emails sent | stroke `#00E5A0`, fill gradient |
| Dashboard | BarChart | Reply rate | `#7B61FF` |
| Dashboard | Segmented bar (custom) | CRM stage distribution | Stage colors |
| Analytics/Outreach | BarChart | Emails per day | `#FF4500` |
| Analytics/Outreach | LineChart | Open + reply rate | `#00E5A0` + `#7B61FF` |
| Analytics/Outreach | BarChart | Best send times | `#F5A623` |
| Analytics/Pipeline | Custom funnel bars (Framer Motion) | Stage counts | Stage-mapped colors |
| Analytics/Platforms | BarChart (horizontal) | Niche close rate | `CHART_COLORS` array w/ `<Cell>` |

### AreaChart Gradient Fill (Dashboard)

```jsx
<defs>
  <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%" stopColor="#00E5A0" stopOpacity={0.2} />
    <stop offset="95%" stopColor="#00E5A0" stopOpacity={0} />
  </linearGradient>
</defs>
<Area fill="url(#emailGradient)" stroke="#00E5A0" />
```

### Axis Styling

```js
// Analytics.jsx shared factory
const axisProps = () => ({
  tick: { fill: '#555555', fontSize: 11 },
  tickLine: false,
  axisLine: false,
})
```

`CartesianGrid` uses `strokeDasharray="3 3" stroke="#1E1E1E"`.

### Missing Charts

The `FunnelChart` and `PieChart` are imported in Analytics.jsx but not visibly rendered in any current tab — they appear to be unused imports.

---

## 10. Design Inconsistencies

### A. Two Parallel Styling Systems

The codebase has a split personality: ~60% of pages use fully **inline JavaScript style objects** against CSS custom property tokens, while ~40% (PitchGenerator, EmailSender, Analytics) use **Tailwind utility classes** and CSS component classes (`.card`, `.btn`, `.input`, `.badge`).

The Tailwind `dark-800` (`#1e293b` slate-dark) card background is visibly lighter and has a blue tint compared to the design system's `#111111` cards. Side-by-side, the Analytics page looks like a different product than the CRM page.

### B. PowerFollowUpOverlay Off-System

`PowerFollowUpOverlay.jsx` uses:
- `background: '#0f0f1a'` — navy tint, not in design system
- `border: '1px solid #2d2d4a'` — purple-gray, not `--border-subtle`
- Stat counters use `#4ade80` (Tailwind green-400) not `#00E5A0` (system green)
- Confirm/Cancel buttons use `#94a3b8` (Tailwind slate-400) not `var(--text-secondary)`
- Feed area `#0a0a0f` background — not in design system

### C. Toast Colors Inconsistent

`main.jsx` toast background `#1a1a2e` uses a navy tint instead of `var(--bg-elevated)` (`#1A1A1A`). Visually jarring against the pure-black cards.

### D. Two DarkTooltip Implementations

`Dashboard.jsx` uses Tailwind classes (`className="bg-dark-700 border border-dark-500"`), while `Analytics.jsx` uses inline styles with CSS vars (`style={{ background: 'var(--bg-elevated)' }}`). Same functional purpose, different implementation.

### E. Checkbox Left Unstyled (Login)

The "Remember me" checkbox on Login uses a plain browser-default `<input type="checkbox">` with no custom styling — inconsistent with the rest of the form (custom toggles elsewhere in Settings).

### F. Toggle Active Color Inconsistency

- Settings `Toggle` component: active = `#FF4500` (brand orange)
- LeadFinder "Email required" toggle: active = `#00E5A0` (green)
- Both serve as on/off switches for boolean preferences — inconsistent semantics (orange suggests "danger/warning" to users)

### G. Platform Color Mismatch

- `GmailCard` in Settings uses `#4285F4` for Google blue
- UserMenu plan badge for `starter` uses `#4A9EFF`
- These are different blues for the same "Google/starter" concept

### H. Section Header Case Mix

Some section labels are ALL CAPS mono (LeadFinder labels, Settings labels), others use sentence case (PitchGenerator `SectionCard` titles). No consistent rule for when to use which.

### I. Mobile CRM Not Adapted

The CRM kanban board on mobile is the same horizontal-scroll implementation as desktop — no stacked card/list view. Very small cards in the 248px columns are hard to use on phones.

### J. AssistantChat vs Design System

The `AssistantChat` window uses direct hex values (`#0d0d0d`, `#141414`, `#1e1e1e`, `#222`) rather than CSS tokens. While visually close to the system, it's not refactor-safe.

### K. Empty `<br />` Spacing in AssistantChat

`renderText()` in AssistantChat returns `<br />` for empty lines — relies on line breaks for spacing rather than CSS margin.

---

## 11. Recommendations

### Quick Wins (1–3 days each)

1. **Unify toast colors** — change `main.jsx` toast background from `#1a1a2e` to `var(--bg-elevated)` and border to `var(--border-default)`. One-line fix, immediate visual cohesion.

2. **Restyle `PowerFollowUpOverlay`** — replace all hardcoded hex values with CSS custom property tokens. Makes it match the rest of the app.

3. **Style the Remember Me checkbox (Login)** — add a CSS rule or replace with a `<div>`-based custom checkbox matching the toggle style used elsewhere.

4. **Unify toggle active color** — decide: orange (Settings) or green (LeadFinder). Green feels more "on/active" semantically. Update one to match the other.

5. **Add `--color-success` token** — `#00E5A0` is used in ~30 places as a literal. Token would make future palette changes safe.

6. **Remove unused Recharts imports** — `FunnelChart`, `PieChart`, `Cell` are imported but unused in Analytics.jsx.

### Medium Priority (3–7 days each)

7. **Migrate one inline-style page to CSS tokens** — pick CRM or LeadFinder as a reference implementation. Removes ~40% of inline style verbosity.

8. **Create a `<Badge>` component** — the temperature/platform/status badge pattern is copy-pasted ~12 times across files. One component with a `variant` prop would consolidate.

9. **Responsive CRM** — add a mobile list view for CRM (collapse columns into a scrollable flat list grouped by stage) using `useIsMobile()` already in the codebase.

10. **Consolidate DarkTooltip** — extract shared `DarkTooltip` Recharts component into `frontend/src/components/ui/DarkTooltip.jsx` and import it in both Dashboard and Analytics.

### Architecture (1–2 weeks)

11. **Design token audit** — formalize the semantic color palette (success, warning, error, info) as CSS variables alongside the existing background/text/accent tokens. This would eliminate the `#FF4444` / `rgba(255,68,68,...)` literals scattered through 10+ files.

12. **Styling strategy decision** — choose inline CSS vars OR Tailwind, not both. The mixed system creates visual divergence (the blue-tinted Tailwind dark cards vs. pure-black inline-styled cards). Recommended path: keep inline CSS custom properties for theming, use Tailwind only for layout utilities (`flex`, `grid`, `gap-*`, `p-*`), not for color.

13. **Component documentation** — the `Toggle`, `TagInput`, `Section`, `ToggleGroup` in Settings and the equivalent patterns in other pages should be extracted and documented as shared primitives to prevent further duplication.

---

*End of design audit — ContentCrafterzz Outreach OS v1.0*
