# TrendRider Alert App — Deploy Guide
# =====================================
# Everything below is copy-paste ready.

## STEP 1 — Generate VAPID keys (do this once on any machine with Node)

    npx web-push generate-vapid-keys

Save the two keys. You'll paste them into Render in Step 3.

## STEP 2 — Push code to GitHub

1. Create a new GitHub repo (e.g. "trendrider-alerts")
2. Upload all 4 project files maintaining this structure:

    trendrider-alerts/
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
   - Name:         trendrider-alerts (or anything)
   - Runtime:      Node
   - Build command: npm install
   - Start command: node server.js
4. Click "Environment" tab → add these variables:

   VAPID_PUBLIC_KEY   = (your public key from Step 1)
   VAPID_PRIVATE_KEY  = (your private key from Step 1)
   VAPID_EMAIL        = mailto:you@youremail.com
   TELEGRAM_SECRET    = (make up any random string, e.g. "mySecret123")

5. Deploy. Render gives you a URL like: https://trendrider-alerts.onrender.com

## STEP 4 — Register Telegram Webhook

Paste this in your browser (replace TOKEN and YOUR_RENDER_URL and YOUR_SECRET):

    https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://YOUR_RENDER_URL/telegram?secret=YOUR_SECRET

You should see: {"ok":true,"result":true,...}

Your Telegram Bot Token is already in your MT5 EA input:
  InpBotToken = "8742076399:AAH8pVI3j3vGyImMWqzMMYZ85cBDxgkyzy8"

Example full URL:
  https://api.telegram.org/bot8742076399:AAH8pVI3j3vGyImMWqzMMYZ85cBDxgkyzy8/setWebhook?url=https://trendrider-alerts.onrender.com/telegram?secret=mySecret123

## STEP 5 — Install the app on your phone

1. Open https://YOUR_RENDER_URL in Chrome (Android) or Safari (iPhone)
2. Android: tap ⋮ menu → "Add to Home Screen"
   iPhone:  tap Share button → "Add to Home Screen"
3. Open the installed app → tap "Enable Alerts" → allow notifications
4. Done. You'll get push alerts for every WATCH / READY / SIGNAL.

## STEP 6 — Set up UptimeRobot (keeps Render awake — free)

1. Go to https://uptimerobot.com → sign up free
2. Add Monitor:
   - Type: HTTP(s)
   - URL:  https://YOUR_RENDER_URL/ping
   - Interval: every 5 minutes
3. Save. UptimeRobot pings your server every 5 min, preventing Render from sleeping.

## NOTES

- The EA keeps sending to Telegram exactly as before — nothing changes in MT5.
- Telegram now forwards every message to your server via webhook.
- Your server converts it to a push notification that wakes your phone.
- All signal history is stored locally on your phone (no database needed).
- Multiple phones can subscribe — just open the app URL on each device and tap Enable.
