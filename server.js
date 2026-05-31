// ─────────────────────────────────────────────────────────────
//  TrendRider Alert Server
//  Receives Telegram webhook → forwards as push notifications
// ─────────────────────────────────────────────────────────────
const express   = require('express');
const webpush   = require('web-push');
const path      = require('path');

const app  = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── VAPID keys (generate once: node -e "require('web-push').generateVAPIDKeys().then(k=>console.log(JSON.stringify(k)))")
// Paste your generated keys into the Render env vars:
//   VAPID_PUBLIC_KEY   = your public key
//   VAPID_PRIVATE_KEY  = your private key
//   VAPID_EMAIL        = mailto:you@yourdomain.com
//   TELEGRAM_SECRET    = any random string (add to your EA's webhook URL as ?secret=xxx)
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL   || 'mailto:admin@example.com';
const TG_SECRET     = process.env.TELEGRAM_SECRET || '';

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('ERROR: Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render env vars.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// ── In-memory subscription store (persists as long as server is up)
//    On restart, phones re-subscribe automatically on next open.
const subscriptions = new Map();   // key = endpoint, value = subscription object

// ── Keep-alive ping endpoint (UptimeRobot hits this every 5 min)
app.get('/ping', (_req, res) => res.send('ok'));

// ── Expose VAPID public key to the PWA
app.get('/vapid-public-key', (_req, res) => res.json({ key: VAPID_PUBLIC }));

// ── Phone subscribes here when the PWA is opened
app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'invalid subscription' });
  subscriptions.set(sub.endpoint, sub);
  console.log(`[sub] +1 subscriber (total: ${subscriptions.size})`);
  res.json({ ok: true });
});

// ── Telegram webhook — called by Telegram when your bot gets a message
//    Register with:  https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_RENDER_URL/telegram?secret=YOUR_SECRET
app.post('/telegram', async (req, res) => {
  // Basic secret check
  const secret = req.query.secret || '';
  if (TG_SECRET && secret !== TG_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  res.json({ ok: true }); // respond to Telegram immediately

  const update = req.body;
  if (!update || !update.message) return;

  const rawText = update.message.text || '';
  if (!rawText) return;

  // ── Parse alert level and symbol from the EA message
  const level  = parseLevel(rawText);
  const symbol = parseSymbol(rawText);
  const dir    = parseDirection(rawText);

  const title = level === 'SIGNAL'  ? `🔴 SIGNAL — ${dir}` :
                level === 'READY'   ? `⚡ READY — ${dir}`  :
                level === 'WATCH'   ? `👁 WATCH — ${dir}`  :
                                      '📡 TrendRider Alert';

  const body  = symbol || rawText.slice(0, 100);

  // ── Push to all subscribers
  const payload = JSON.stringify({ title, body, level, timestamp: Date.now() });
  const dead    = [];

  for (const [endpoint, sub] of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        dead.push(endpoint); // subscription expired
      } else {
        console.error('[push error]', err.message);
      }
    }
  }

  dead.forEach(ep => subscriptions.delete(ep));
  if (dead.length) console.log(`[sub] removed ${dead.length} stale subscriptions`);
  console.log(`[push] sent to ${subscriptions.size - dead.length} devices — ${level} ${symbol}`);
});

// ── Helpers
function parseLevel(text) {
  if (text.includes('[SIGNAL]') || text.includes('SIGNAL')) return 'SIGNAL';
  if (text.includes('[READY]')  || text.includes('READY'))  return 'READY';
  if (text.includes('[WATCH]')  || text.includes('WATCH'))  return 'WATCH';
  return 'ALERT';
}

function parseSymbol(text) {
  // EA sends "Volatility XX Index" on its own line
  const m = text.match(/Volatility[\w\s()]+Index/i);
  return m ? m[0].trim() : '';
}

function parseDirection(text) {
  if (/BUY/i.test(text))  return 'BUY ↑';
  if (/SELL/i.test(text)) return 'SELL ↓';
  return '';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TrendRider alert server running on port ${PORT}`));
