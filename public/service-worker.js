const CACHE_NAME = 'forge-starter-v3';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './manifest.webmanifest',
  './assets/brand/hilltop-logo.png',
  './assets/brand/forge-mark.png',
  './assets/products/tree-ornament.jpg',
  './assets/products/tree-gallery.jpg',
  './assets/products/present-stack.jpg',
  './assets/products/grinch-tree.jpg',
  './assets/products/veteran-flag.jpg',
  './assets/products/baby-first-christmas.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
