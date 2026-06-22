// ─────────────────────────────────────────────────────────────
//  ShineX Monitor — Alert Server
//  Receives direct HTTP POST from MT5 EA → push notifications
// ─────────────────────────────────────────────────────────────
const express = require('express');
const webpush = require('web-push');
const path    = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp({
  credential: cert(require('./serviceAccountKey.json'))
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('ERROR: Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render env vars.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Subscription store (in-memory; phones re-subscribe on next open after restart)
const subscriptions = new Map();

// ── Active signals store (in-memory; survives between requests but resets on restart)
//    Key: "SYMBOL_TIMEFRAME", Value: signal object
const activeSignals = new Map();

// ── Push to all subscribed devices
async function pushToAll(payloadStr) {
  // Existing Web Push (browser subscribers)
  const dead = [];
  for (const [endpoint, sub] of subscriptions) {
    try {
      await webpush.sendNotification(sub, payloadStr);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(endpoint);
      else console.error('[push error]', err.message);
    }
  }
  dead.forEach(ep => subscriptions.delete(ep));
  if (dead.length) console.log(`[sub] removed ${dead.length} stale subscriptions`);

  // New: Firebase (native app subscribers)
  let payload;
  try { payload = JSON.parse(payloadStr); } catch { payload = {}; }

  const deadTokens = [];
  for (const [token] of fcmTokens) {
    try {
      await getMessaging().send({
        token,
        notification: {
          title: payload.title || 'ShineX Signal',
          body: payload.body || ''
        },
        data: {
          symbol: String(payload.symbol || ''),
          level: String(payload.level || ''),
          timeframe: String(payload.timeframe || ''),
          timestamp: String(payload.timestamp || '')
        },
        android: {
          priority: 'high',
          notification: { channelId: 'shine_signals', priority: 'high' }
        }
      });
    } catch (err) {
      if (
        err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token'
      ) {
        deadTokens.push(token);
      } else {
        console.error('[fcm error]', err.message);
      }
    }
  }
  deadTokens.forEach(t => fcmTokens.delete(t));
  if (deadTokens.length) console.log(`[fcm] removed ${deadTokens.length} stale tokens`);
}

// ── UptimeRobot keep-alive ping
app.get('/ping', (_req, res) => res.send('ok'));

// ── Expose VAPID public key to the PWA
app.get('/vapid-public-key', (_req, res) => res.json({ key: VAPID_PUBLIC }));

// ── Return all currently active signals (called when PWA first loads)
app.get('/active-signals', (_req, res) => {
  const signals = Array.from(activeSignals.values());
  res.json({ signals });
});

// ── Phone subscribes here when PWA is opened
const fcmTokens = new Map(); // token -> { platform }

app.post('/subscribe', (req, res) => {
  const body = req.body;

  if (body && body.token) {
    // New native app (Firebase) subscription
    fcmTokens.set(body.token, { platform: body.platform || 'unknown' });
    console.log(`[fcm] +1 device token (total: ${fcmTokens.size})`);
    return res.json({ ok: true });
  }

  if (body && body.endpoint) {
    // Existing Web Push subscription (old browser users)
    subscriptions.set(body.endpoint, body);
    console.log(`[sub] +1 subscriber (total: ${subscriptions.size})`);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'invalid subscription' });
});

// ── Shinex Monitor — main endpoint
//    EA posts JSON to root /  (it strips wss:// → https:// internally)
//    Message types: heartbeat | signal | remove_signal
app.post('/', async (req, res) => {
  res.json({ ok: true }); // respond immediately so EA doesn't timeout

  const data = req.body;
  if (!data || !data.type) return;

  if (data.type === 'heartbeat') {
    console.log(`[heartbeat] ${data.active_signals || 0} active signals`);
    return;
  }

  if (data.type === 'signal') {
    const sym = data.symbol     || '';
    const tf  = data.timeframe  || '';
    const dir = (data.trade_type || '').toUpperCase();
    //const h4  = data.h4_trend   || '';
    //const d1  = data.d1_trend   || '';

    const key = `${sym}_${tf}`;
    const emoji = dir === 'BUY' ? '🟢' : '🔴';
    const title = `${emoji} ${dir} — ${sym}`;
    const body  = `${tf}`;
    const timestamp = Date.now();

    // Store as active signal
    activeSignals.set(key, { title, body, level: dir, symbol: sym, timeframe: tf, timestamp });

    await pushToAll(JSON.stringify({ title, body, level: dir, timestamp }));
    console.log(`[signal] ${sym} ${tf} ${dir} (active: ${activeSignals.size})`);
  }

  if (data.type === 'remove_signal') {
    const sym = data.symbol    || '';
    const tf  = data.timeframe || '';
    const key = `${sym}_${tf}`;

    // Remove from active signals store
    activeSignals.delete(key);

    await pushToAll(JSON.stringify({
      title: `⚪ Signal ended — ${sym}`,
      body:  `${tf} conditions no longer met`,
      level: 'REMOVED',
      symbol: sym,
      timeframe: tf,
      timestamp: Date.now()
    }));
    console.log(`[removed] ${sym} ${tf} (active: ${activeSignals.size})`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shine Wealth alert server running on port ${PORT}`));
