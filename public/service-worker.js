const CACHE_NAME = 'forge-starter-v12';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/forge-api-client.js',
  './js/forge-order-server-sync.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/brand/hilltop-logo.png',
  './assets/brand/forge-mark.png',
  '/assets/images/categories/welcome-category-ornaments.png',
  '/assets/images/categories/welcome-category-signs.png',
  '/assets/images/categories/welcome-category-custom.png',
  '/assets/products/family-tree-ornament-small.jpeg',
  '/assets/products/family-tree-ornament-large.jpeg',
  '/assets/products/antler-family-ornament-small.jpeg',
  '/assets/products/antler-family-ornament-large.jpeg',
  '/assets/products/babys-first-christmas-pink.jpeg',
  '/assets/products/mr-and-mrs-first-christmas.jpeg',
  '/assets/products/reindeer-initial-ornament.jpeg',
  '/assets/products/present-stack-ornament.jpeg',
  '/assets/products/grinch-family-tree.jpg',
  '/assets/products/veteran-flag-ornament.jpg'
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
