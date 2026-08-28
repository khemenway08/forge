const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BUILD_VERSION = '20260828-53';
const CACHE_NAME = 'forge-starter-v53';

function normalizeRequestUrl(input) {
  if (typeof input === 'string') {
    return new URL(input, 'https://forge.thehilltopshop.com/').href;
  }
  return new URL(input.url, 'https://forge.thehilltopshop.com/').href;
}

function createCacheStorage(initialEntries = {}) {
  const stores = new Map();

  Object.entries(initialEntries).forEach(([cacheName, entries]) => {
    const cacheEntries = new Map();
    Object.entries(entries).forEach(([requestUrl, body]) => {
      cacheEntries.set(normalizeRequestUrl(requestUrl), new Response(body, { status: 200 }));
    });
    stores.set(cacheName, cacheEntries);
  });

  return {
    async open(cacheName) {
      if (!stores.has(cacheName)) {
        stores.set(cacheName, new Map());
      }
      const cacheEntries = stores.get(cacheName);
      return {
        async put(request, response) {
          cacheEntries.set(normalizeRequestUrl(request), response.clone());
        },
        async match(request) {
          const matched = cacheEntries.get(normalizeRequestUrl(request));
          return matched ? matched.clone() : undefined;
        }
      };
    },
    async match(request) {
      const requestUrl = normalizeRequestUrl(request);
      for (const cacheEntries of stores.values()) {
        if (cacheEntries.has(requestUrl)) {
          return cacheEntries.get(requestUrl).clone();
        }
      }
      return undefined;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(cacheName) {
      return stores.delete(cacheName);
    },
    snapshot() {
      return new Map(stores);
    }
  };
}

function createServiceWorkerEnvironment({ caches, fetchImpl }) {
  const listeners = new Map();
  let skipWaitingCalled = 0;
  let clientsClaimCalled = 0;

  const self = {
    location: new URL('https://forge.thehilltopshop.com/'),
    clients: {
      claim() {
        clientsClaimCalled += 1;
        return Promise.resolve();
      }
    },
    skipWaiting() {
      skipWaitingCalled += 1;
      return Promise.resolve();
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    }
  };

  const context = {
    self,
    caches,
    fetch: fetchImpl,
    Request,
    Response,
    URL,
    console
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(process.cwd(), 'public/service-worker.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'public/service-worker.js' });

  return {
    listeners,
    getSkipWaitingCalled() {
      return skipWaitingCalled;
    },
    getClientsClaimCalled() {
      return clientsClaimCalled;
    }
  };
}

async function dispatchInstall(listener) {
  let installPromise = Promise.resolve();
  listener({
    waitUntil(promise) {
      installPromise = promise;
    }
  });
  await installPromise;
}

async function dispatchActivate(listener) {
  let activatePromise = Promise.resolve();
  listener({
    waitUntil(promise) {
      activatePromise = promise;
    }
  });
  await activatePromise;
}

async function dispatchFetch(listener, request) {
  let responsePromise = null;
  listener({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    }
  });
  if (!responsePromise) {
    throw new Error('respondWith was not called');
  }
  return responsePromise;
}

test('service worker install fetches current precache assets with cache reload and activation removes older Forge caches', async () => {
  const caches = createCacheStorage({
    'forge-starter-v12': {
      '/js/app.js': 'old app bundle'
    },
    'forge-starter-v13': {
      '/js/app.js?v=20260720-15': 'older app bundle'
    },
    'forge-starter-v15': {
      '/js/app.js?v=20260720-15': 'previous app bundle'
    },
    'forge-starter-v16': {
      '/js/app.js?v=20260721-16': 'stale prior payment-gate build'
    },
    'forge-starter-v18': {
      '/js/app.js?v=20260721-18': 'stale prior category build'
    },
    'forge-starter-v19': {
      '/js/app.js?v=20260722-19': 'stale prior dashboard build'
    },
    'forge-starter-v20': {
      '/js/app.js?v=20260722-20': 'stale prior dashboard cleanup build'
    },
    'forge-starter-v21': {
      '/js/app.js?v=20260722-21': 'stale prior catalog shell build'
    },
    'forge-starter-v22': {
      '/js/app.js?v=20260722-22': 'stale prior hat library build'
    },
    'forge-starter-v41': {
      '/js/app.js?v=20260729-41': 'stale prior staff orders build'
    },
    'forge-starter-v42': {
      '/js/app.js?v=20260730-42': 'stale prior completed order build'
    },
    'unrelated-cache': {
      '/misc.txt': 'keep me'
    }
  });
  const fetchCalls = [];
  const environment = createServiceWorkerEnvironment({
    caches,
    fetchImpl: async (request) => {
      fetchCalls.push(request);
      return new Response(`fresh:${new URL(request.url).pathname}`, { status: 200 });
    }
  });

  await dispatchInstall(environment.listeners.get('install'));
  await dispatchActivate(environment.listeners.get('activate'));

  assert.equal(environment.getSkipWaitingCalled(), 1);
  assert.equal(environment.getClientsClaimCalled(), 1);
  assert.ok(fetchCalls.length > 0);
  assert.ok(fetchCalls.every((request) => request.cache === 'reload'));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/app.js?v=${BUILD_VERSION}`)));

  const cacheKeys = await caches.keys();
  assert.ok(cacheKeys.includes(CACHE_NAME));
  assert.ok(!cacheKeys.includes('forge-starter-v12'));
  assert.ok(!cacheKeys.includes('forge-starter-v13'));
  assert.ok(!cacheKeys.includes('forge-starter-v15'));
  assert.ok(!cacheKeys.includes('forge-starter-v16'));
  assert.ok(!cacheKeys.includes('forge-starter-v18'));
  assert.ok(!cacheKeys.includes('forge-starter-v19'));
  assert.ok(!cacheKeys.includes('forge-starter-v20'));
  assert.ok(!cacheKeys.includes('forge-starter-v21'));
  assert.ok(!cacheKeys.includes('forge-starter-v22'));
  assert.ok(!cacheKeys.includes('forge-starter-v41'));
  assert.ok(!cacheKeys.includes('forge-starter-v42'));
  assert.ok(cacheKeys.includes('unrelated-cache'));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-design-catalog-api.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-catalog-ordering.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-catalog-image-viewer.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-sync-status.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-design-catalog.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-hat-catalog-api.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-inventory-api.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-hat-catalog.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-material-catalog-api.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-material-catalog.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-finished-hat-catalog-api.js?v=${BUILD_VERSION}`)));
  assert.ok(fetchCalls.some((request) => request.url.endsWith(`/js/forge-staff-finished-hat-catalog.js?v=${BUILD_VERSION}`)));
});

test('service worker fetches app.js from the network when online and updates the current cache', async () => {
  const caches = createCacheStorage({
    [CACHE_NAME]: {
      [`/js/app.js?v=${BUILD_VERSION}`]: 'stale cached bundle'
    }
  });
  let fetchCount = 0;
  const environment = createServiceWorkerEnvironment({
    caches,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('fresh network bundle', { status: 200 });
    }
  });

  const request = new Request(`https://forge.thehilltopshop.com/js/app.js?v=${BUILD_VERSION}`);
  const response = await dispatchFetch(environment.listeners.get('fetch'), request);

  assert.equal(fetchCount, 1);
  assert.equal(await response.text(), 'fresh network bundle');

  const currentCache = await caches.open(CACHE_NAME);
  const cachedResponse = await currentCache.match(request);
  assert.equal(await cachedResponse.text(), 'fresh network bundle');
});

test('service worker uses cached app.js only as an offline fallback', async () => {
  const caches = createCacheStorage({
    [CACHE_NAME]: {
      [`/js/app.js?v=${BUILD_VERSION}`]: 'offline cached bundle'
    }
  });
  const environment = createServiceWorkerEnvironment({
    caches,
    fetchImpl: async () => {
      throw new Error('network unavailable');
    }
  });

  const request = new Request(`https://forge.thehilltopshop.com/js/app.js?v=${BUILD_VERSION}`);
  const response = await dispatchFetch(environment.listeners.get('fetch'), request);

  assert.equal(await response.text(), 'offline cached bundle');
});

test('service worker never serves API requests from the static application cache', async () => {
  const caches = createCacheStorage({
    [CACHE_NAME]: {
      '/api/v1/staff/orders.php': 'stale cached api payload'
    }
  });
  let fetchCount = 0;
  const environment = createServiceWorkerEnvironment({
    caches,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('fresh api payload', { status: 200 });
    }
  });

  const request = new Request('https://forge.thehilltopshop.com/api/v1/staff/orders.php');
  const response = await dispatchFetch(environment.listeners.get('fetch'), request);

  assert.equal(fetchCount, 1);
  assert.equal(await response.text(), 'fresh api payload');

  const currentCache = await caches.open(CACHE_NAME);
  const cachedResponse = await currentCache.match(request);
  assert.equal(await cachedResponse.text(), 'stale cached api payload');
});

test('index.html versions every Forge JavaScript bootstrap URL with the same build value', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
  const scriptMatches = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)];
  const scriptSources = scriptMatches.map((match) => match[1]);

  assert.equal(scriptSources.length, 24);
  assert.ok(scriptSources.every((src) => src.includes(`?v=${BUILD_VERSION}`)));
  assert.deepEqual(scriptSources, [
    `js/forge-staff-inventory-api.js?v=${BUILD_VERSION}`,
    `js/forge-product-catalog.js?v=${BUILD_VERSION}`,
    `js/forge-order-payload-builder.js?v=${BUILD_VERSION}`,
    `js/forge-order-payload-preview.js?v=${BUILD_VERSION}`,
    `js/forge-api-client.js?v=${BUILD_VERSION}`,
    `js/forge-order-store.js?v=${BUILD_VERSION}`,
    `js/forge-order-server-sync.js?v=${BUILD_VERSION}`,
    `js/forge-sync-status.js?v=${BUILD_VERSION}`,
    `js/forge-order-submission.js?v=${BUILD_VERSION}`,
    `js/forge-event-state.js?v=${BUILD_VERSION}`,
    `js/forge-staff-api-client.js?v=${BUILD_VERSION}`,
    `js/forge-staff-catalog-ordering.js?v=${BUILD_VERSION}`,
    `js/forge-catalog-image-viewer.js?v=${BUILD_VERSION}`,
    `js/forge-staff-design-catalog-api.js?v=${BUILD_VERSION}`,
    `js/forge-staff-design-catalog.js?v=${BUILD_VERSION}`,
    `js/forge-staff-hat-catalog-api.js?v=${BUILD_VERSION}`,
    `js/forge-staff-hat-catalog.js?v=${BUILD_VERSION}`,
    `js/forge-staff-material-catalog-api.js?v=${BUILD_VERSION}`,
    `js/forge-staff-material-catalog.js?v=${BUILD_VERSION}`,
    `js/forge-staff-finished-hat-catalog-api.js?v=${BUILD_VERSION}`,
    `js/forge-staff-finished-hat-catalog.js?v=${BUILD_VERSION}`,
    `js/forge-staff-orders-runtime.js?v=${BUILD_VERSION}`,
    `js/forge-local-orders-queue.js?v=${BUILD_VERSION}`,
    `js/app.js?v=${BUILD_VERSION}`
  ]);
});

test('app bootstrap exposes the build marker and registers the versioned worker with updateViaCache none', () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');

  assert.match(appSource, new RegExp(`window\\.FORGE_BUILD_VERSION\\s*=\\s*FORGE_BUILD_VERSION`));
  assert.match(appSource, new RegExp(`const FORGE_BUILD_VERSION = '${BUILD_VERSION}'`));
  assert.match(appSource, /serviceWorker\.register\(`\.\/service-worker\.js\?v=\$\{FORGE_BUILD_VERSION\}`, \{ updateViaCache: 'none' \}\)/);
});

test('current staff orders bundle keeps completed-order rendering and does not restore the removed System Details block', () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');

  assert.match(appSource, /record\.completed_at \? `<div><span>Completed<\/span><strong>\$\{escapeHtml\(formatReadableDateTime\(record\.completed_at\)\)\}<\/strong><\/div>` : ''/);
  assert.doesNotMatch(appSource, /System Details/);
});
