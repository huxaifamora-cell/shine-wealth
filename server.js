// ─────────────────────────────────────────────────────────────
//  Shine Wealth Monitor — Alert Server
//  Receives direct HTTP POST from MT5 EA → push notifications
// ─────────────────────────────────────────────────────────────
const express = require('express');
const webpush = require('web-push');
const path    = require('path');

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

// ── Push to all subscribed devices
async function pushToAll(payloadStr) {
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
}

// ── UptimeRobot keep-alive ping
app.get('/ping', (_req, res) => res.send('ok'));

// ── Expose VAPID public key to the PWA
app.get('/vapid-public-key', (_req, res) => res.json({ key: VAPID_PUBLIC }));

// ── Phone subscribes here when PWA is opened
app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'invalid subscription' });
  subscriptions.set(sub.endpoint, sub);
  console.log(`[sub] +1 subscriber (total: ${subscriptions.size})`);
  res.json({ ok: true });
});

// ── Shine Wealth Monitor — main endpoint
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
    const h4  = data.h4_trend   || '';
    const d1  = data.d1_trend   || '';

    const emoji = dir === 'BUY' ? '🟢' : '🔴';
    const title = `${emoji} ${dir} — ${sym}`;
    const body  = `${tf} | H4: ${h4} | D1: ${d1}`;

    await pushToAll(JSON.stringify({ title, body, level: dir, timestamp: Date.now() }));
    console.log(`[signal] ${sym} ${tf} ${dir}`);
  }

  if (data.type === 'remove_signal') {
    const sym = data.symbol    || '';
    const tf  = data.timeframe || '';

    await pushToAll(JSON.stringify({
      title: `⚪ Signal ended — ${sym}`,
      body:  `${tf} conditions no longer met`,
      level: 'REMOVED',
      timestamp: Date.now()
    }));
    console.log(`[removed] ${sym} ${tf}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shine Wealth alert server running on port ${PORT}`));
