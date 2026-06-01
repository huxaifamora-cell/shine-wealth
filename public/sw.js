// service-worker.js — handles push events in the background
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'TrendRider', body: event.data.text() }; }

  const level = (data.level || '').toUpperCase();
  const icon  = level === 'SIGNAL' ? '/icon-signal.png' :
                level === 'READY'  ? '/icon-ready.png'  : '/icon-192.png';

  const options = {
    body:              data.body || '',
    icon:              '/icon-192.png',
    badge:             '/icon-192.png',
    tag:               'trendrider-' + level,        // replaces previous same-level notif
    renotify:          true,
    requireInteraction: level === 'SIGNAL',          // SIGNAL stays until dismissed
    vibrate:           level === 'SIGNAL' ? [200, 100, 200, 100, 400] : [200, 100, 200],
    data:              { url: self.location.origin, level: data.level, timestamp: data.timestamp }
  };

  event.waitUntil(self.registration.showNotification(data.title || 'TrendRider', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || self.location.origin));
});

// Relay push payload to any open app window so the feed updates live
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    self.clients.matchAll({ type: 'window' }).then(list => {
      list.forEach(c => c.postMessage({ type: 'NEW_ALERT', payload }));
    });
  } catch {}
}, { capture: true });
