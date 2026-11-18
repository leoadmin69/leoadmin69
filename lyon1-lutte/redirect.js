// Ancienne adresse du site → nouvelle adresse (REDIRECT_TO). Ne touche JAMAIS à la base.
// Lancé à la place de server.js sur l'ancien service Render (commande : node redirect.js).
// - les pages et l'API sont redirigées (301) vers la nouvelle adresse, avec le même chemin ;
// - /sw.js est remplacé par un « pont » : les téléphones déjà abonnés gardent leurs notifications
//   (elles continuent d'arriver par l'ancien abonnement) et chaque ouverture mène à la nouvelle adresse.
import http from 'node:http';

const TO = (process.env.REDIRECT_TO || '').replace(/\/$/, '');
if (!/^https:\/\//.test(TO)) { console.error('REDIRECT_TO manquant (https://…)'); process.exit(1); }
const PORT = Number(process.env.PORT) || 3000;

const BRIDGE_SW = `// Pont vers ${TO} : garde les notifications des anciens abonnements
const TO = ${JSON.stringify(TO)};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
  const sub = await self.registration.pushManager.getSubscription();
  for (const c of await self.clients.matchAll({ type: 'window' })) {
    const u = new URL(c.url);
    c.navigate(TO + u.pathname + (u.search ? u.search + '&' : '?') + (sub ? 'oldpush=1' : 'moved=1') + u.hash).catch(() => {});
  }
})()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    const u = new URL(e.request.url);
    return Response.redirect(TO + u.pathname + (u.search ? u.search + '&' : '?') + (sub ? 'oldpush=1' : 'moved=1') + u.hash, 302);
  })());
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'La Doua en lutte', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'La Doua en lutte', {
    body: d.body || '', icon: TO + '/icons/icon-192.png', badge: TO + '/icons/badge-96.png',
    tag: d.tag || 'info', renotify: true, vibrate: [200, 100, 200], data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const u = new URL(e.notification.data?.url || '/', TO);
  e.waitUntil(self.clients.openWindow(TO + u.pathname + u.search + (u.search ? '&' : '?') + 'oldpush=1' + u.hash));
});
`;

http.createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/api/health')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"moved":true}'); }
  if (url.split('?')[0] === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(BRIDGE_SW);
  }
  res.writeHead(301, { Location: TO + url, 'Cache-Control': 'public, max-age=3600' });
  res.end();
}).listen(PORT, () => console.log(`Redirection → ${TO} (port ${PORT})`));
