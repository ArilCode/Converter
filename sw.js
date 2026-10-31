/* ACE Converter — Service Worker (mode offline)
   Naikkan angka VERSION setiap kali kamu mengubah file web supaya HP memperbarui cache. */
const VERSION = 'v3';
const APP_CACHE = 'ace-app-' + VERSION;
const LIB_CACHE = 'ace-lib-v1';      // pustaka CDN (versinya sudah dikunci di URL)
const FONT_CACHE = 'ace-font-v1';

const APP_FILES = [
  './', './index.html', './style.css', './main.js', './watermark.js', './site.webmanifest',
  './images/favicon.ico', './images/favicon.svg', './images/favicon-16x16.png', './images/favicon-32x32.png',
  './images/apple-touch-icon.png', './images/icon-192.png', './images/icon-512.png', './images/icon-maskable-512.png',
  './images/watermark.png'
];
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
const LIB_FILES = [
  CDN + 'jspdf/2.5.1/jspdf.umd.min.js',
  CDN + 'jszip/3.10.1/jszip.min.js',
  CDN + 'pdf-lib/1.17.1/pdf-lib.min.js',
  CDN + 'pdf.js/3.11.174/pdf.min.js',
  CDN + 'pdf.js/3.11.174/pdf.worker.min.js'
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_FILES);                       // wajib berhasil
    const lib = await caches.open(LIB_CACHE);          // sisanya "usahakan", tidak menggagalkan instal
    await Promise.all(LIB_FILES.map(u => lib.match(u).then(h => h || lib.add(new Request(u, { mode: 'cors' }))).catch(() => {})));
    const font = await caches.open(FONT_CACHE);
    await font.add(new Request(FONT_CSS, { mode: 'cors' })).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [APP_CACHE, LIB_CACHE, FONT_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// cache dulu, kalau belum ada baru ke internet lalu simpan
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
// tampilkan cache dulu (cepat & offline), sambil memperbarui di belakang layar
async function staleWhileRevalidate(req, cacheName, ignoreSearch) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch });
  const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith((async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch (_) {
          const cache = await caches.open(APP_CACHE);
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
        }
      })());
      return;
    }
    e.respondWith(staleWhileRevalidate(req, APP_CACHE, true));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'staticimgly.com') { e.respondWith(cacheFirst(req, LIB_CACHE)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(cacheFirst(req, LIB_CACHE)); return; }
  if (url.hostname === 'fonts.googleapis.com') { e.respondWith(staleWhileRevalidate(req, FONT_CACHE, false)); return; }
  if (url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req, FONT_CACHE)); return; }
});
