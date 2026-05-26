# ContentCrafterzz Outreach OS

A full-stack, AI-powered outreach system for video editing agencies. Finds YouTube & Reddit leads automatically, studies each one deeply with Claude AI, writes hyper-personalized cold emails, and manages your entire outreach pipeline from one dashboard.

---

## What It Does

- **Lead Finder** — Scrapes YouTube (via Data API v3) and Reddit for creators who need video editing
- **AI Deep Study** — Claude AI analyzes every channel: pain points, desires, what offer would land
- **Pitch Generator** — Writes cold emails so specific they feel handcrafted (under 180 words, scored 8+/10 before sending)
- **Email Sender** — Sends emails one by one with random delays, tracks opens via pixel, detects replies via IMAP
- **CRM Kanban** — Full pipeline from New Lead → Studying → Pitch Ready → Emailed → Replied → Closed Won
- **Analytics** — Outreach metrics, pipeline value, best niches, best send times
- **Auto Follow-ups** — Claude writes each follow-up with a different angle

---

## Setup

### Prerequisites
- Node.js 18+ and npm
- API keys (see Step 2)

### Step 1 — Install dependencies

```bash
cd contentcrafterzz-outreach-os
npm run install:all
```

### Step 2 — Configure API keys

Open `.env` in the root folder and fill in:

```env
YOUTUBE_API_KEY=        # Google Cloud Console → YouTube Data API v3
REDDIT_CLIENT_ID=       # reddit.com/prefs/apps → create "script" app
REDDIT_CLIENT_SECRET=
GEMINI_API_KEY_1=       # aistudio.google.com → Get API key (add up to 5 for rotation)

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password   # Gmail: use App Password, not main password
SMTP_FROM_NAME=Your Name | ContentCrafterzz
```

**Getting each key:**

| Key | Where to get it |
|-----|----------------|
| YouTube API | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → YouTube Data API v3 → Create Credentials |
| Reddit API | [reddit.com/prefs/apps](https://reddit.com/prefs/apps) → Create App → Choose "script" → use Client ID + Secret |
| Gemini API | [aistudio.google.com](https://aistudio.google.com) → Get API key (add up to 5 keys for rotation) |
| Gmail App Password | Google Account → Security → 2FA must be on → App Passwords → create one |

### Step 3 — Start the app

```bash
npm run dev
```

This starts both servers:
- **Backend API**: http://localhost:3001
- **Frontend UI**: http://localhost:5173

Open http://localhost:5173 in your browser.

### Step 4 — First-time config in the UI

1. Go to **Settings** → paste all API keys → test each one
2. Fill in your agency profile (name, portfolio, case studies) — this is what Claude uses for pitch writing
3. Set your pitch preferences (tone, offer type, risk reversal)

---

## Usage Guide

### Finding Leads

1. Go to **Lead Finder** → YouTube tab
2. Enter a niche keyword (e.g. "fitness", "real estate", "cooking")
3. Set subscriber range (default 5K–200K)
4. Click **Find Leads** — leads appear with scores, pain points, temperature

### Generating Pitches

1. Click **Generate Pitch** on any lead (or go to Pitch Generator page)
2. Claude runs 5 steps automatically:
   - Deep study of the channel
   - Custom offer creation
   - Cold email (scored, auto-rewritten if < 8/10)
   - Reddit DM (for Reddit leads)
   - 3 subject line A/B variants
3. Edit any part → copy → send

### Sending Emails

1. From any lead: click **Add to Queue**
2. Go to **Email Sender** — configure SMTP first
3. Emails send automatically with 45–120s random delay between each
4. Open/click/reply tracking is automatic

### CRM

- Drag cards between columns as leads progress
- Click any card for full detail panel (pitch, email history, notes, timeline)
- Use filters and search to find specific leads

---

## Architecture

```
contentcrafterzz-outreach-os/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── src/
│   │   ├── models/database.js # SQLite (better-sqlite3) — all tables, migrations
│   │   ├── routes/            # REST API routes (leads, pitches, emails, crm, analytics, settings, scraper)
│   │   ├── services/          # YouTube, Reddit, Claude, Email, Scheduler
│   │   ├── middleware/        # Rate limiter, error handler
│   │   └── utils/             # Lead scoring, pain point detection
│   └── data/outreach.db       # SQLite database (auto-created on first run)
├── frontend/
│   └── src/
│       ├── pages/             # Dashboard, LeadFinder, PitchGenerator, EmailSender, CRM, Analytics, Settings
│       ├── components/        # Layout, UI components
│       ├── context/           # AppContext (global state)
│       └── utils/api.js       # Axios instance + helpers
├── .env                       # Your API keys (never commit this)
└── .env.example               # Template
```

**Database**: SQLite stored at `backend/data/outreach.db` — survives restarts, no external DB needed.

---

## Key Features

| Feature | How it works |
|---------|-------------|
| Lead scoring | 0–100 score based on engagement rate, upload consistency, views-to-subscriber ratio, email found |
| Pain point detection | Automatic analysis: inconsistent uploader, low retention, declining views, inactive channel |
| Pitch quality scoring | Claude scores the email 1–10, auto-rewrites if < 8 before showing it |
| Email open tracking | 1×1 pixel served from the backend — updates `emails.status` to `opened` |
| Reply detection | IMAP polling every 15 min — matches reply email address to leads |
| Viral detector | Finds channels whose latest video got 5x+ their normal views — flags as urgent leads |
| Competitor spy | Searches for channels in the same niche as a competitor agency |
| Lead resurrection | Flags "Closed Lost" leads every 30 days for re-review |
| Follow-up system | Claude writes each follow-up with a different angle (value, case study, final touch) |

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 |
| `REDDIT_CLIENT_ID` | Yes | Reddit app client ID |
| `REDDIT_CLIENT_SECRET` | Yes | Reddit app client secret |
| `GEMINI_API_KEY_1` | Yes | Gemini AI (add up to GEMINI_API_KEY_5 for rotation) |
| `SMTP_HOST` | For sending | Your SMTP server |
| `SMTP_PORT` | For sending | Usually 587 |
| `SMTP_USER` | For sending | Your email address |
| `SMTP_PASS` | For sending | Email password or app password |
| `IMAP_HOST` | For reply detection | Usually `imap.gmail.com` |
| `PORT` | No | Backend port (default 3001) |
| `FRONTEND_URL` | No | Frontend URL (default http://localhost:5173) |

---

## Troubleshooting

**"YouTube API key not configured"** → Add `YOUTUBE_API_KEY` to `.env` and restart backend

**Emails going to spam** → Use a warmed-up email domain, check your domain's SPF/DKIM records, keep emails under 150/day

**Reddit 401 error** → Make sure you created a "script" type app at reddit.com/prefs/apps, not "web app"

**Gmail SMTP refused** → Use an App Password (not your main password). Enable 2FA first, then generate App Password under Google Account → Security

**Database not persisting** → The `.db` file is at `backend/data/outreach.db` — don't delete it

---

## Notes

- All data is stored locally in SQLite — nothing is sent to any third-party service except the APIs you configure
- API keys are stored in `.env` and never exposed to the frontend
- The email queue processor runs every 30 seconds in the background — it respects your daily limit and pause state
