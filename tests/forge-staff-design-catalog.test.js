const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const catalogModule = require('../public/js/forge-staff-design-catalog.js');
const catalogApi = require('../public/js/forge-staff-design-catalog-api.js');

const indexSource = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
const catalogApiSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-design-catalog-api.js'), 'utf8');
const catalogModuleSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-design-catalog.js'), 'utf8');
const catalogCssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');

test('catalog scripts load before app.js and only in the protected staff shell', () => {
  assert.match(
    indexSource,
    /<script src="js\/forge-staff-api-client\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-catalog-ordering\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-catalog-image-viewer\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-design-catalog-api\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-design-catalog\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-hat-catalog-api\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-hat-catalog\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-material-catalog-api\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-material-catalog\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-finished-hat-catalog-api\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-finished-hat-catalog\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-staff-orders-runtime\.js\?v=20260729-41"><\/script>\s*<script src="js\/forge-local-orders-queue\.js\?v=20260729-41"><\/script>\s*<script src="js\/app\.js\?v=20260729-41"><\/script>/
  );
  assert.match(indexSource, /data-screen="staff-catalog"/);
  assert.match(indexSource, /data-staff-catalog-content/);
  assert.doesNotMatch(indexSource, /data-screen="categories"[\s\S]*staff-open-catalog/);
});

test('design catalog wires the shared sort and reorder controls without replacing normal card editing', () => {
  assert.match(catalogModuleSource, /sortKey:\s*'custom'/);
  assert.match(catalogModuleSource, /catalog-sort-designs/);
  assert.match(catalogModuleSource, /catalog-design-reorder-handle/);
  assert.match(catalogModuleSource, /reorderDesigns\(orderedIds\)/);
  assert.match(catalogModuleSource, /orderingApi\?\.getReorderAvailability/);
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

test('catalog headers filters and card actions use the shared top-aligned consistency structure', () => {
  assert.match(catalogModuleSource, /staff-catalog-designs-filter staff-catalog-designs-filter--search/);
  assert.match(catalogModuleSource, /staff-design-card-action-row/);
  assert.doesNotMatch(catalogModuleSource, /aria-hidden="true">Edit<\/span>/);
  assert.match(catalogModuleSource, /staff-catalog-dialog-header-actions staff-design-dialog-header-actions/);
  assert.doesNotMatch(catalogModuleSource, /staff-design-dialog-actions/);
  assert.match(catalogCssSource, /\.staff-catalog-designs-toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
  assert.match(catalogCssSource, /\.staff-catalog-designs-filters\s*\{[\s\S]*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\);/);
  assert.match(catalogCssSource, /\.staff-design-card-action-row\s*\{/);
  assert.match(catalogCssSource, /\.staff-catalog-dialog-header-actions,\s*\.staff-design-dialog-header-actions,\s*\.staff-finished-hat-dialog-header-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(catalogCssSource, /\.staff-catalog-dialog-header-actions \.primary-button,\s*\.staff-catalog-dialog-header-actions \.secondary-button\s*\{[\s\S]*width:\s*auto;[\s\S]*white-space:\s*nowrap;/);
  assert.match(catalogCssSource, /@media \(max-width: 767px\) \{[\s\S]*\.staff-catalog-dialog-header-actions\s*\{[\s\S]*flex-wrap:\s*wrap;/);
});

test('catalog client and module do not introduce local browser persistence for catalog records', () => {
  assert.doesNotMatch(catalogApiSource, /localStorage|sessionStorage|indexedDB|createOrderStore|ForgeOrderStore/);
  assert.doesNotMatch(catalogModuleSource, /localStorage|sessionStorage|indexedDB|createOrderStore|ForgeOrderStore/);
});

test('design create dialog prevents duplicate saves and gives clear success feedback', () => {
  assert.match(catalogModuleSource, /if \(state\.dialogSaving\) \{\s*return;\s*\}/);
  assert.match(catalogModuleSource, /saveButton\.textContent = state\.dialogSaving \? 'Saving\.\.\.' : 'Save Design';/);
  assert.match(catalogModuleSource, /node\.disabled = state\.dialogSaving \|\| state\.dialogDeleting;/);
  assert.match(catalogModuleSource, /state\.dialogValues = payload;/);
  assert.match(catalogModuleSource, /const wasCreate = state\.dialogMode === 'create';/);
  assert.match(catalogModuleSource, /state\.notice = 'Design added successfully\.';/);
  assert.match(catalogModuleSource, /state\.pendingFocusDesignId = design\.id;/);
  assert.match(catalogModuleSource, /focusPendingDesignCard\(\);/);
  assert.match(catalogModuleSource, /card\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\);/);
  assert.match(catalogModuleSource, /card\.focus\(\{ preventScroll: true \}\);/);
});

test('design delete action is edit-only names the design and protects linked records in the UI', () => {
  assert.match(catalogModuleSource, /state\.dialogMode !== 'edit'/);
  assert.match(catalogModuleSource, /data-action="catalog-request-delete-design"/);
  assert.match(catalogModuleSource, />Delete Design<\/button>/);
  assert.match(catalogModuleSource, /data-action="catalog-confirm-delete-design"/);
  assert.match(catalogModuleSource, /Delete \$\{escapeHtml\(designName\)\}\?/);
  assert.match(catalogModuleSource, /This cannot be undone\. The Design record will be removed from the shared library\./);
  assert.match(catalogModuleSource, /This Design is linked to \$\{state\.dialogFinishedHatLinkCount\} Finished Hat/);
  assert.match(catalogModuleSource, /Clear those Finished Hat links before deleting it\./);
  assert.match(catalogModuleSource, /state\.notice = 'Design deleted successfully\.';/);
  assert.match(catalogModuleSource, /state\.records = state\.records\.filter\(\(record\) => record\.id !== deletedId\);/);
});

test('design API client sends authenticated delete requests and normalizes blocked deletes safely', async () => {
  const calls = [];
  const client = catalogApi.createForgeStaffDesignCatalogApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          design: {
            id: '123e4567-e89b-42d3-a456-426614174101',
            design_name: 'Test Design',
            finished_hat_link_count: 0
          }
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  const result = await client.deleteDesign('123e4567-e89b-42d3-a456-426614174101');

  assert.equal(result.design.design_name, 'Test Design');
  assert.equal(result.design.finished_hat_link_count, 0);
  assert.equal(calls[0].url, '/api/v1/staff/catalog/design.php?id=123e4567-e89b-42d3-a456-426614174101');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');

  const blockedClient = catalogApi.createForgeStaffDesignCatalogApiClient({
    fetchImpl: async () => new Response(JSON.stringify({
      application: 'Forge',
      api_version: '1',
      status: 'error',
      error: {
        code: 'design_delete_blocked',
        message: 'Clear Finished Hat links before deleting this Design.',
        finished_hat_link_count: 2
      }
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    })
  });

  await assert.rejects(
    blockedClient.deleteDesign('123e4567-e89b-42d3-a456-426614174101'),
    (error) => {
      assert.equal(error.code, 'design_delete_blocked');
      assert.equal(error.message, 'Clear Finished Hat links before deleting this Design.');
      assert.equal(error.status, 409);
      return true;
    }
  );
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
