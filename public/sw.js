// Service worker: ให้เว็บติดตั้งเป็นแอปได้ และเปิดหน้าที่เคยเข้าชมได้แม้ไม่มีอินเทอร์เน็ต
// ใช้ "เครือข่ายก่อน" เสมอ — ออนไลน์อยู่จะได้ข้อมูลล่าสุดทุกครั้ง แคชใช้เฉพาะตอนออฟไลน์
const VERSION = 'v1';
const CORE = `core-${VERSION}`, PAGES = `pages-${VERSION}`, ASSETS = `assets-${VERSION}`;
const CORE_FILES = ['/offline.html', '/theme.css', '/css/site.css', '/js/site.js', '/img/icon-192.png', '/img/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, max) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy)).then(() => trim(cacheName, max));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('/offline.html');
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/') || url.pathname.endsWith('.ics')) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, PAGES, 40));
  if (/\.(css|js|png|jpe?g|webp|gif|svg|woff2?)$/i.test(url.pathname)) e.respondWith(networkFirst(req, ASSETS, 120));
});
