# Shine Wealth Monitor — Alert App Deploy Guide
# ===============================================

## STEP 1 — Generate VAPID keys (once only, on any machine with Node)

    npx web-push generate-vapid-keys

Save both keys. You'll paste them into Render in Step 3.

## STEP 2 — Push to GitHub

Upload all files to your repo root like this:

    your-repo/
    ├── package.json
    ├── server.js
    └── public/
        ├── index.html
        ├── sw.js
        ├── manifest.json
        ├── icon-192.png
        └── icon-512.png

## STEP 3 — Deploy on Render

1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - Runtime:      Node
   - Build command: npm install
   - Start command: node server.js
4. Environment tab → add these 3 variables:

   VAPID_PUBLIC_KEY  = (your public key from Step 1)
   VAPID_PRIVATE_KEY = (your private key from Step 1)
   VAPID_EMAIL       = mailto:you@youremail.com

5. Deploy. You get a URL like: https://shine-alerts.onrender.com

## STEP 4 — Point the MT5 EA at your server

In MT5, open the EA inputs and change InpWebSocketUrl from:

    wss://shinex-ao1i.onrender.com

to:

    wss://shine-alerts.onrender.com   ← your Render URL

The EA internally converts wss:// to https:// when posting — no other changes needed.

Also add your Render URL to MT5's allowed URLs:
  Tools → Options → Expert Advisors → Allow WebRequest for listed URL
  Add: https://shine-alerts.onrender.com

## STEP 5 — Install the app on your phone

1. Open https://shine-alerts.onrender.com in Chrome (Android) or Safari (iPhone)
2. Android: tap ⋮ → "Add to Home Screen"
   iPhone:  tap Share → "Add to Home Screen"
3. Open the installed app → tap "Enable Alerts" → allow notifications
4. Done. BUY/SELL signals and removals push to your phone instantly.

## STEP 6 — Keep Render awake for free (UptimeRobot)

1. Go to https://uptimerobot.com → sign up free
2. New Monitor:
   - Type: HTTP(s)
   - URL:  https://shine-alerts.onrender.com/ping
   - Interval: every 5 minutes
3. Save. This prevents Render free tier from sleeping.

## WHAT EACH NOTIFICATION MEANS

  🟢 BUY  — Crash signal confirmed (EMA above BB + SMA, slope up)
  🔴 SELL — Boom signal confirmed  (EMA below BB + SMA, slope down)
  ⚪ Signal ended — conditions no longer met (instant removal)
