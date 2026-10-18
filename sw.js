// DEV MENU — Service Worker: إشعار "طلبك جاهز" للبيجر، و"تعليق جديد في قوقل ماب" لصاحب المطعم، حتى لو الصفحة مسكّرة
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
    // نفس الصفحة مفتوحة (البيجر أو لوحة التحكم) ← نرجع لها، وإلا نفتح الرابط
    const path = new URL(url, self.location.origin).pathname;
    const open = all.find(c => new URL(c.url).pathname === path);
    if (open && 'navigate' in open && url.includes('#')) { await open.navigate(url).catch(() => {}); return open.focus(); }
    if (open) return open.focus();
    return self.clients.openWindow(url);
  })());
});
