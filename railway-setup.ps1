# ContentCrafterzz — Railway Variable Setup Script
# Run this once from your project folder: .\railway-setup.ps1
# Requires: railway CLI installed (https://docs.railway.app/develop/cli)
# Install: npm install -g @railway/cli  then  railway login

Write-Host "ContentCrafterzz — Setting Railway environment variables..." -ForegroundColor Cyan

$vars = @{
  # App
  NODE_ENV                  = "production"
  PORT                      = "3001"
  APP_URL                   = "https://app.quelro.com"
  FRONTEND_URL              = "https://app.quelro.com"
  SESSION_SECRET            = "0838c777a7f2480bf7077fd9eca5dee8006eec7c288887f46fd88073a1b55d85"
  SELF_PING                 = "true"

  # Database volume path (must match your Railway volume mount path)
  DB_PATH                   = "/app/backend/data/outreach.db"

  # YouTube API keys (7 keys for quota rotation)
  YOUTUBE_API_KEY_1         = "AIzaSyDIm3FGCyp59kaNI4dIvVHDtaCpdroh5XI"
  YOUTUBE_API_KEY_2         = "AIzaSyDPuQeP29zoTK-ehVKYLC-1x5jkjFptwrY"
  YOUTUBE_API_KEY_3         = "AIzaSyCUD0XbqNJN3VXB-3piqXQFop3G9aH925g"
  YOUTUBE_API_KEY_4         = "AIzaSyAhlLrGNMh1rEvJMU-2R5K1RiDRkwMn-R4"
  YOUTUBE_API_KEY_5         = "AIzaSyCKCFtnKz3DQk28487eSfp-hU4WZiUh6MM"
  YOUTUBE_API_KEY_6         = "AIzaSyCJIlRiKY5c8M8__7KmTlt4QOyGPBBqCvQ"
  YOUTUBE_API_KEY_7         = "AIzaSyAquVbvf8CPF6O4ipWotn-j04m2PYAIQgA"

  # Gemini AI
  GEMINI_API_KEY            = "AIzaSyDq8kalbNIutNx_d3Yk5G0V9wkDuugzGbU"
  GEMINI_API_KEY_1          = "AIzaSyBtMwvXtASJsFOIs7nbDL2NmmrTpODa0AQ"
  GEMINI_API_KEY_2          = "AIzaSyDq8kalbNIutNx_d3Yk5G0V9wkDuugzGbU"

  # Google OAuth (Sign-In + Gmail)
  GOOGLE_CLIENT_ID          = "138205240198-l7a6tinar5r0hbfkb05cd3q572lrt8g5.apps.googleusercontent.com"
  GOOGLE_CLIENT_SECRET      = "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"
  GOOGLE_AUTH_CALLBACK_URL  = "https://app.quelro.com/api/auth/google/callback"
  GMAIL_REDIRECT_URI        = "https://app.quelro.com/api/gmail/callback"

  # Transactional email (Resend)
  RESEND_API_KEY            = "re_5rqt6v3y_3xDy2hGAvbBF9rJWrSmiaUuG"
  RESEND_FROM_EMAIL         = "noreply@quelro.com"

  # SMTP sending inboxes (4 Gmail accounts, round-robin)
  SMTP_HOST                 = "smtp.gmail.com"
  SMTP_PORT                 = "587"
  SMTP_USER                 = "elijah@quelro.com"
  SMTP_PASS                 = "qtkrmjqexfyokmug"
  SMTP_FROM_NAME            = "ContentCrafterzz"
  SMTP_USER_1               = "elijah@quelro.com"
  SMTP_PASS_1               = "qtkrmjqexfyokmug"
  SMTP_USER_2               = "damon@quelro.com"
  SMTP_PASS_2               = "tjzvreegaetrpghm"
  SMTP_USER_3               = "stefan@quelro.com"
  SMTP_PASS_3               = "vinxecdbdjapxtll"
  SMTP_USER_4               = "niklaus@quelro.com"
  SMTP_PASS_4               = "jmjtjneemknnezxr"

  # IMAP reply detection
  IMAP_HOST                 = "imap.gmail.com"
  IMAP_PORT                 = "993"

  # Reddit API
  REDDIT_CLIENT_ID          = "placeholder"
  REDDIT_CLIENT_SECRET      = "placeholder"
  REDDIT_USER_AGENT         = "ContentCrafterzz/1.0"

  # Agency defaults (used by AI for pitch gen)
  AGENCY_NAME               = "ContentCrafterzz"
  YOUR_NAME                 = "Harsh"
  YOUR_ROLE                 = "Founder"
  PRICING_RANGE             = "`$500-`$2000/month"

  # Stripe — ADD THESE AFTER CREATING PRODUCTS IN STRIPE DASHBOARD
  # STRIPE_SECRET_KEY         = "sk_live_..."
  # STRIPE_WEBHOOK_SECRET     = "whsec_..."
  # STRIPE_STARTER_PRICE_ID   = "price_..."
  # STRIPE_PRO_PRICE_ID       = "price_..."
  # STRIPE_AGENCY_PRICE_ID    = "price_..."
  # VITE_STRIPE_PUBLISHABLE_KEY = "pk_live_..."
}

$total = $vars.Count
$done = 0

foreach ($key in $vars.Keys) {
  $value = $vars[$key]
  railway variables set "$key=$value" 2>&1 | Out-Null
  $done++
  Write-Host "  [$done/$total] $key" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! $done variables set." -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "  1. Railway dashboard -> Volumes -> Add Volume -> Mount: /app/backend/data" -ForegroundColor White
Write-Host "  2. Set up Stripe products + add the 6 STRIPE_ vars (see comments above)" -ForegroundColor White
Write-Host "  3. git push  ->  Railway auto-deploys" -ForegroundColor White
Write-Host "  4. Visit https://app.quelro.com to confirm it's live" -ForegroundColor White
