// service-worker.js — handles push events in the background
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Shine Wealth', body: event.data.text() }; }

  const level = (data.level || '').toUpperCase();

  const options = {
    body:               data.body || '',
    icon:               '/icon-192.png',
    badge:              '/icon-192.png',
    tag:                'shine-' + level,
    renotify:           true,
    requireInteraction: true,           // stays on screen until dismissed
    vibrate:            [300, 100, 300, 100, 500],
    data:               { url: self.location.origin, level: data.level, timestamp: data.timestamp }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Shine Wealth', options)
      .then(() => playAlertSound())
  );
});

// Play a 5-second alert tone using the Web Audio API inside the SW client
function playAlertSound() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clientList => {
      if (clientList.length > 0) {
        // App is open — tell it to play sound directly
        clientList.forEach(client => client.postMessage({ type: 'PLAY_SOUND' }));
      } else {
        // App is closed — open it briefly to play sound
        // (browsers require a client to use AudioContext)
        self.clients.openWindow(self.location.origin + '?sound=1');
      }
    });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || self.location.origin));
});

// Relay push payload to open app window so feed updates live
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    self.clients.matchAll({ type: 'window' }).then(list => {
      list.forEach(c => c.postMessage({ type: 'NEW_ALERT', payload }));
    });
  } catch {}
}, { capture: true });
