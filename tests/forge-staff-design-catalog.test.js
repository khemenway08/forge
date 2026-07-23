const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const catalogModule = require('../public/js/forge-staff-design-catalog.js');

const indexSource = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
const catalogApiSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-design-catalog-api.js'), 'utf8');
const catalogModuleSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-design-catalog.js'), 'utf8');
const catalogCssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');

test('catalog scripts load before app.js and only in the protected staff shell', () => {
  assert.match(
    indexSource,
    /<script src="js\/forge-staff-api-client\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-design-catalog-api\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-design-catalog\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-hat-catalog-api\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-hat-catalog\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-material-catalog-api\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-material-catalog\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-staff-orders-runtime\.js\?v=20260723-23"><\/script>\s*<script src="js\/forge-local-orders-queue\.js\?v=20260723-23"><\/script>\s*<script src="js\/app\.js\?v=20260723-23"><\/script>/
  );
  assert.match(indexSource, /data-screen="staff-catalog"/);
  assert.match(indexSource, /data-staff-catalog-content/);
  assert.doesNotMatch(indexSource, /data-screen="categories"[\s\S]*staff-open-catalog/);
});

test('catalog label maps expose readable staff-facing labels', () => {
  assert.equal(catalogModule.getCategoryLabel('patriotic_military'), 'Patriotic / Military');
  assert.equal(catalogModule.getStoreFitLabel('business_corporate'), 'Business / Corporate');
  assert.equal(catalogModule.getStatusLabel('review'), 'In Review');
  assert.equal(catalogModule.getProductionMethodLabel('leatherette_engraving'), 'Leatherette Engraving');
  assert.equal(catalogModule.getMadeOnHatLabel('unknown'), 'Unknown');
});

test('catalog record normalization trims safe strings and preserves nullable fields', () => {
  const normalized = catalogModule.normalizeDesignRecord({
    id: '  design-1  ',
    design_name: '  Hill Country Floral Patch  ',
    thumbnail_path: ' /uploads/design-thumbnails/design-1.png ',
    category: ' boutique_womens ',
    store_fit: ' boutique ',
    status: ' active ',
    production_method: ' uv_print ',
    production_file_location: ' Shared Drive / Floral Patch.ai ',
    made_on_hat: ' yes ',
    notes: '  Keep premium finish  ',
    created_at: ' 2026-07-22 09:00:00.000000 ',
    updated_at: ' 2026-07-22 09:05:00.000000 '
  });

  assert.equal(normalized.design_name, 'Hill Country Floral Patch');
  assert.equal(normalized.thumbnail_path, '/uploads/design-thumbnails/design-1.png');
  assert.equal(normalized.production_file_location, 'Shared Drive / Floral Patch.ai');
  assert.equal(normalized.notes, 'Keep premium finish');
});

test('catalog filters combine with AND logic and search only by design name', () => {
  const records = [
    catalogModule.normalizeDesignRecord({
      id: '1',
      design_name: 'Hill Country Floral Patch',
      category: 'boutique_womens',
      production_method: 'uv_print',
      status: 'active'
    }),
    catalogModule.normalizeDesignRecord({
      id: '2',
      design_name: 'Patriot Badge Shield',
      category: 'patriotic_military',
      production_method: 'acrylic',
      status: 'approved'
    }),
    catalogModule.normalizeDesignRecord({
      id: '3',
      design_name: 'Holiday Market Sketch',
      category: 'seasonal',
      production_method: 'tbd',
      status: 'idea'
    })
  ];

  const results = catalogModule.filterDesignRecords(records, {
    search: 'hill',
    category: 'boutique_womens',
    productionMethod: 'uv_print',
    status: 'active'
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, '1');
});

test('catalog thumbnail helper renders a restrained placeholder when no thumbnail exists', () => {
  const display = catalogModule.getDesignThumbnailDisplay({
    id: 'missing-thumb',
    design_name: 'Holiday Market Sketch',
    thumbnail_path: null
  });

  assert.equal(display.type, 'placeholder');
  assert.match(display.html, /No thumbnail yet/);
});

test('design edit preview uses the shared contain-based preview frame instead of the old wide-strip crop', () => {
  assert.match(catalogModuleSource, /staff-design-thumbnail-preview/);
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview\s*\{[\s\S]*min-height:\s*240px;[\s\S]*max-height:\s*320px;[\s\S]*aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center;/);
  assert.doesNotMatch(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*cover;/);
});

test('catalog client and module do not introduce local browser persistence for catalog records', () => {
  assert.doesNotMatch(catalogApiSource, /localStorage|sessionStorage|indexedDB|createOrderStore|ForgeOrderStore/);
  assert.doesNotMatch(catalogModuleSource, /localStorage|sessionStorage|indexedDB|createOrderStore|ForgeOrderStore/);
});

test('initial unauthenticated catalog render does not request protected design records', async () => {
  const calls = [];
  let canLoad = false;
  const module = catalogModule.createStaffDesignCatalogModule({
    apiClient: {
      async listDesigns() {
        calls.push('listDesigns');
        return {
          ok: true,
          authenticated: true,
          designs: []
        };
      }
    },
    canLoadProtectedRecords() {
      return canLoad;
    },
    document: createCatalogTestDocument(),
    window: { setTimeout(fn) { fn(); } }
  });
  const container = createCatalogTestContainer();

  module.render(container);
  await flushMicrotasks();

  assert.equal(calls.length, 0);
});

test('successful staff authentication automatically loads designs without retry', async () => {
  const calls = [];
  let canLoad = false;
  const module = catalogModule.createStaffDesignCatalogModule({
    apiClient: {
      async listDesigns() {
        calls.push('listDesigns');
        return {
          ok: true,
          authenticated: true,
          designs: [
            { id: '1', design_name: 'Hill Country Floral Patch', status: 'active' }
          ]
        };
      }
    },
    canLoadProtectedRecords() {
      return canLoad;
    },
    document: createCatalogTestDocument(),
    window: { setTimeout(fn) { fn(); } }
  });
  const container = createCatalogTestContainer();

  module.render(container);
  await flushMicrotasks();
  assert.equal(calls.length, 0);

  canLoad = true;
  module.render(container);
  await flushMicrotasks();

  assert.equal(calls.length, 1);
  assert.match(container.innerHTML, /Hill Country Floral Patch/);
});

test('authenticated catalog render loads protected design records immediately', async () => {
  const calls = [];
  const module = catalogModule.createStaffDesignCatalogModule({
    apiClient: {
      async listDesigns() {
        calls.push('listDesigns');
        return {
          ok: true,
          authenticated: true,
          designs: [
            { id: '1', design_name: 'Patriot Badge Shield', status: 'approved' }
          ]
        };
      }
    },
    canLoadProtectedRecords() {
      return true;
    },
    document: createCatalogTestDocument(),
    window: { setTimeout(fn) { fn(); } }
  });
  const container = createCatalogTestContainer();

  module.render(container);
  await flushMicrotasks();

  assert.equal(calls.length, 1);
  assert.match(container.innerHTML, /Patriot Badge Shield/);
  assert.match(container.innerHTML, /Add Design/);
});

test('failed catalog authentication keeps a safe authentication-required state until access is granted', async () => {
  const calls = [];
  let canLoad = true;
  let authenticated = false;
  const module = catalogModule.createStaffDesignCatalogModule({
    apiClient: {
      async listDesigns() {
        calls.push(authenticated ? 'authenticated' : 'unauthenticated');
        if (!authenticated) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            designs: []
          };
        }
        return {
          ok: true,
          authenticated: true,
          designs: [
            { id: '1', design_name: 'Holiday Market Sketch', status: 'idea' }
          ]
        };
      }
    },
    canLoadProtectedRecords() {
      return canLoad;
    },
    document: createCatalogTestDocument(),
    window: { setTimeout(fn) { fn(); } }
  });
  const container = createCatalogTestContainer();

  module.render(container);
  await flushMicrotasks();

  assert.deepEqual(calls, ['unauthenticated']);
  assert.match(container.innerHTML, /Staff authentication is required\./);

  authenticated = true;
  module.render(container);
  await flushMicrotasks();

  assert.deepEqual(calls, ['unauthenticated', 'authenticated']);
  assert.match(container.innerHTML, /Holiday Market Sketch/);
});

test('catalog api and network failures remain safe and retryable', async () => {
  const module = catalogModule.createStaffDesignCatalogModule({
    apiClient: {
      async listDesigns() {
        throw new Error('Design catalog could not be reached.');
      }
    },
    canLoadProtectedRecords() {
      return true;
    },
    document: createCatalogTestDocument(),
    window: { setTimeout(fn) { fn(); } }
  });
  const container = createCatalogTestContainer();

  module.render(container);
  await flushMicrotasks();

  assert.match(container.innerHTML, /Design catalog could not be reached\./);
  assert.match(container.innerHTML, /data-action="catalog-retry-load"/);
});

test('materials and hats are activated through the shared protected catalog shell while shortlist remains a placeholder', () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');
  assert.match(appSource, /The shared hat library is currently unavailable on this device\./);
  assert.match(appSource, /The shared material library is currently unavailable on this device\./);
  assert.match(appSource, /ForgeStaffMaterialCatalogApi/);
  assert.match(appSource, /createOptionalStaffMaterialCatalogApiClient/);
  assert.match(appSource, /createOptionalStaffMaterialCatalogModule/);
  assert.match(appSource, /Saved design and hat combinations will appear here later\./);
});

function createCatalogTestContainer() {
  return {
    innerHTML: '',
    dataset: {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function createCatalogTestDocument() {
  return {
    activeElement: null,
    body: {
      appendChild() {}
    },
    createElement() {
      return createFakeDialogElement();
    }
  };
}

function createFakeDialogElement() {
  return {
    className: '',
    hidden: false,
    innerHTML: '',
    dataset: {},
    addEventListener() {},
    appendChild() {},
    focus() {},
    querySelector(selector) {
      return createFakeDialogNode(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createFakeDialogNode(selector) {
  return {
    selector,
    hidden: false,
    disabled: false,
    dataset: {},
    textContent: '',
    value: '',
    innerHTML: '',
    addEventListener() {},
    appendChild() {},
    focus() {},
    setAttribute() {},
    querySelector() { return createFakeDialogNode('nested'); },
    querySelectorAll() { return []; }
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
