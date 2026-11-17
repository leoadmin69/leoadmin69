// Service worker : installation sur l'écran d'accueil, ouverture même sans réseau (dernières infos connues),
// et réception des notifications (bâtiment bloqué, alerte, AG…).
const VERSION = 'v6'; // à changer à chaque mise à jour importante : force les téléphones à recharger l'app
const SHELL = `shell-${VERSION}`;
const DATA = 'data';
const SHELL_FILES = ['/', '/style.css', '/app.js', '/vendor/qrcode.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Direct (SSE), médias, espace modo : jamais de cache
  if (url.pathname === '/api/live' || url.pathname.startsWith('/media/') || url.pathname.startsWith('/api/mod') || url.pathname.startsWith('/api/auth')) return;
  // Dernier état connu : réseau d'abord, sinon la copie (utile sans réseau dans un amphi ou une manif)
  if (url.pathname === '/api/state') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(DATA).then((c) => c.put('/api/state', copy)); return res; }).catch(() => caches.match('/api/state')));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  // Pages : réseau d'abord, sinon la coquille de l'app
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  // Fichiers du site : réponse immédiate depuis le cache, mise à jour en arrière-plan
  e.respondWith(caches.open(SHELL).then(async (c) => {
    const cached = await c.match(req);
    const network = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'La Doua en lutte', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'La Doua en lutte', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'info',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const w of list) if (new URL(w.url).origin === location.origin) { w.navigate(target).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
