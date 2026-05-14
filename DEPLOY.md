# Railway Deployment Guide

## One-time setup

### 1. Create Railway project
1. Go to railway.app → New Project → Deploy from GitHub repo
2. Connect this repo

### 2. Add environment variables in Railway dashboard
Copy everything from your local `.env` file into Railway → Variables:

```
NODE_ENV=production
PORT=3001

# AI Keys
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...

# SMTP (all 4 inboxes)
SMTP_USER_1=elijah@quelro.com
SMTP_PASS_1=...
SMTP_USER_2=damon@quelro.com
SMTP_PASS_2=...
SMTP_USER_3=stefan@quelro.com
SMTP_PASS_3=...
SMTP_USER_4=niklaus@quelro.com
SMTP_PASS_4=...

# YouTube API keys
YOUTUBE_API_KEY=...
YOUTUBE_API_KEY_2=...
YOUTUBE_API_KEY_3=...

# Agency info
AGENCY_NAME=ContentCrafterzz
YOUR_NAME=Prathvi
YOUR_ROLE=Founder

# Self-ping (keep Railway awake)
SELF_PING=true
```

### 3. Add a Volume for SQLite persistence
1. Railway dashboard → your service → Volumes
2. Add Volume → Mount path: `/app/backend/data`
3. This persists `outreach.db` across deploys

### 4. Deploy
Railway auto-deploys on every `git push`. First deploy takes ~3-5 min.

Build command (auto from railway.json):
```
cd frontend && npm install && npm run build && cd ../backend && npm install
```

Start command:
```
node backend/server.js
```

## After deploy

- App URL: shown in Railway dashboard (e.g. `https://contentcrafterzz.up.railway.app`)
- Health check: `GET /api/health` → `{"status":"ok"}`
- The app self-pings every 14 min to stay awake on Railway's free tier

## Database migration

SQLite database lives at `backend/data/outreach.db`. The Volume mount ensures it survives deploys.

To export your local DB to production:
1. Download `outreach.db` from Railway volume in dashboard
2. Or use the Levi `backup_database` tool

## Logs

Railway dashboard → your service → Logs (real-time)

## Custom domain

Railway dashboard → your service → Settings → Domains → Add custom domain
