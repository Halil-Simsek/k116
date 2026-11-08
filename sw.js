/* =====================================================================
   Pottschatz Kasse – Service Worker V11
   WICHTIG: Bei JEDER Änderung an index.html die VERSION erhöhen,
   sonst bekommt das iPad das Update erst verzögert.
   ===================================================================== */
const VERSION = '11.6.0';
const CACHE = 'pottschatz-kasse-v' + VERSION;
/* Ohne diese Dateien ist die Kasse offline NICHT startfähig → Installation muss scheitern,
   damit die App nicht fälschlich „offline-fähig“ meldet. */
const CORE = ['./', './index.html'];
/* Nice-to-have: fehlen sie, läuft die Kasse trotzdem. */
const OPTIONAL = ['./manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));          // scheitert bei 404
    await Promise.all(OPTIONAL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pottschatz-kasse') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'CACHED', version: VERSION }));
  })());
});

/* Strategie: Cache zuerst (sofortiger Start, auch offline), im Hintergrund aktualisieren. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isNav = req.mode === 'navigate';
    const cached = (await cache.match(req, { ignoreSearch: true })) ||
                   (isNav ? (await cache.match('./index.html')) || (await cache.match('./')) : undefined);

    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(isNav ? './index.html' : req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    return new Response(isNav ? '<h1>Offline</h1><p>Die Kasse wurde noch nicht offline gespeichert.</p>' : '',
      { status: 503, headers: { 'Content-Type': isNav ? 'text/html; charset=utf-8' : 'text/plain' } });
  })());
});
