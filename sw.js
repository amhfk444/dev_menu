// DEV MENU — Service Worker للبيجر: يستقبل إشعار "طلبك جاهز" حتى لو الصفحة مسكّرة أو الجوال مقفول
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data && event.data.text() }; }
  const title = d.title || '🔔 طلبك جاهز!';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'تفضّل استلمه من الكاشير',
    tag: d.tag || 'pager',
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500, 200, 800],
    icon: d.icon || '/images/logo-web.jpg',
    badge: '/images/logo-web.jpg',
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.includes('/pager'));
    if (open) return open.focus();
    return self.clients.openWindow(url);
  })());
});
