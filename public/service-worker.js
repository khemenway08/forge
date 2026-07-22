const BUILD_VERSION = '20260722-21';
const CACHE_NAME = 'forge-starter-v21';
const FORGE_CACHE_PREFIX = 'forge-starter-v';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  `./js/forge-product-catalog.js?v=${BUILD_VERSION}`,
  `./js/forge-order-payload-builder.js?v=${BUILD_VERSION}`,
  `./js/forge-order-payload-preview.js?v=${BUILD_VERSION}`,
  `./js/forge-api-client.js?v=${BUILD_VERSION}`,
  `./js/forge-order-store.js?v=${BUILD_VERSION}`,
  `./js/forge-order-server-sync.js?v=${BUILD_VERSION}`,
  `./js/forge-order-submission.js?v=${BUILD_VERSION}`,
  `./js/forge-staff-api-client.js?v=${BUILD_VERSION}`,
  `./js/forge-staff-orders-runtime.js?v=${BUILD_VERSION}`,
  `./js/forge-local-orders-queue.js?v=${BUILD_VERSION}`,
  `./js/app.js?v=${BUILD_VERSION}`,
  './manifest.webmanifest',
  './assets/brand/hilltop-logo.png',
  './assets/brand/forge-mark.png',
  '/assets/images/categories/welcome-ornaments-hero.png',
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

const APP_SHELL_EXTENSIONS = ['.html', '.css', '.js', '.webmanifest'];
const STATIC_ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAssets().finally(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    deleteObsoleteForgeCaches()
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request || event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (isApiRequest(requestUrl)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isNavigationRequest(event.request) || isAppShellRequest(requestUrl)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isStaticAssetRequest(requestUrl)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function precacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PRECACHE_ASSETS.map(async (assetPath) => {
    const request = new Request(new URL(assetPath, self.location.href).toString(), { cache: 'reload' });
    const response = await fetch(request);
    if (!response || !response.ok) {
      throw new Error(`Unable to precache ${assetPath}.`);
    }
    await cache.put(request, response.clone());
  }));
}

async function deleteObsoleteForgeCaches() {
  const cacheKeys = await caches.keys();
  const obsoleteKeys = cacheKeys.filter((cacheKey) => (
    cacheKey.startsWith(FORGE_CACHE_PREFIX) && cacheKey !== CACHE_NAME
  ));
  await Promise.all(obsoleteKeys.map((cacheKey) => caches.delete(cacheKey)));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok && isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response && response.ok && isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

function isNavigationRequest(request) {
  if (request.mode === 'navigate') {
    return true;
  }

  const acceptHeader = request.headers?.get?.('accept') || '';
  return acceptHeader.includes('text/html');
}

function isApiRequest(requestUrl) {
  return requestUrl.origin === self.location.origin
    && requestUrl.pathname.startsWith('/api/');
}

function isAppShellRequest(requestUrl) {
  if (requestUrl.origin !== self.location.origin) {
    return false;
  }

  if (requestUrl.pathname === '/' || requestUrl.pathname.endsWith('/')) {
    return true;
  }

  return APP_SHELL_EXTENSIONS.some((extension) => requestUrl.pathname.endsWith(extension));
}

function isStaticAssetRequest(requestUrl) {
  if (requestUrl.origin !== self.location.origin) {
    return false;
  }

  return STATIC_ASSET_EXTENSIONS.some((extension) => requestUrl.pathname.endsWith(extension));
}

function isCacheableResponse(response) {
  return response.status === 200 || response.status === 0;
}
