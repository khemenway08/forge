const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hatCatalogModule = require('../public/js/forge-staff-hat-catalog.js');

const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');
const catalogCssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');

test('hat record normalization preserves nullable fields, cost, and Not Counted inventory', () => {
  const normalized = hatCatalogModule.normalizeHatRecord({
    id: ' hat-1 ',
    hat_name: ' Richardson 112 Navy White ',
    photo_path: ' /uploads/hat-photos/hat-1.png ',
    manufacturer: ' Richardson ',
    model: ' 112 ',
    color: ' Navy / White ',
    vendor: ' Hilltop Vendor ',
    base_cost: ' 12.50 ',
    inventory: { counted: false, on_hand_quantity: null, version: 0 },
    status: ' active ',
    notes: ' Best seller '
  });

  assert.equal(normalized.hat_name, 'Richardson 112 Navy White');
  assert.equal(normalized.photo_path, '/uploads/hat-photos/hat-1.png');
  assert.equal(normalized.base_cost, '12.50');
  assert.equal(hatCatalogModule.formatHatBaseCost(normalized.base_cost), '$12.50');
  assert.equal(hatCatalogModule.formatHatOnHand(normalized.inventory), 'Not Counted');
});

test('hat inventory formatting preserves a confirmed zero separately from Not Counted', () => {
  const countedZero = hatCatalogModule.normalizeInventorySummary({ counted: true, on_hand_quantity: 0, version: 1 });
  assert.equal(countedZero.counted, true);
  assert.equal(hatCatalogModule.formatHatOnHand(countedZero), '0');
});

test('inventory movement timestamps render as local staff-facing date and time without SQL microseconds', () => {
  const formatted = hatCatalogModule.formatInventoryMovementTimestamp('2026-08-21 17:03:26.000000');
  assert.match(formatted, /Aug 21, 2026 · \d{1,2}:\d{2}\s(?:AM|PM)/);
  assert.doesNotMatch(formatted, /\.000000|2026-08-21/);
});

test('hat filters cover search plus manufacturer model and status', () => {
  const records = [
    hatCatalogModule.normalizeHatRecord({
      id: '1',
      hat_name: 'Richardson 112 Navy White',
      manufacturer: 'Richardson',
      model: '112',
      color: 'Navy / White',
      vendor: 'Hilltop Vendor',
      status: 'active',
      notes: 'Mesh back'
    }),
    hatCatalogModule.normalizeHatRecord({
      id: '2',
      hat_name: 'Blackhawk Zapped Headwear 5 Panel',
      manufacturer: 'Blackhawk',
      model: '5 Panel',
      color: 'Patriotic',
      vendor: 'Zapped',
      status: 'review',
      notes: 'Side photo'
    })
  ];

  const results = hatCatalogModule.filterHatRecords(records, {
    search: 'zapped',
    manufacturer: 'blackhawk',
    model: '5 panel',
    status: 'review'
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, '2');
});

test('hat edit photo preview uses the shared contain-based preview frame instead of the old wide-strip crop', () => {
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview\s*\{[\s\S]*min-height:\s*240px;[\s\S]*max-height:\s*320px;[\s\S]*aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center;/);
  assert.doesNotMatch(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*cover;/);
});

test('hat cards and dialog actions use the shared top-aligned catalog pattern', () => {
  const moduleSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-hat-catalog.js'), 'utf8');
  assert.match(moduleSource, /staff-catalog-designs-filter staff-catalog-designs-filter--search/);
  assert.match(moduleSource, /staff-design-card-action-row/);
  assert.doesNotMatch(moduleSource, /aria-hidden="true">Edit<\/span>/);
  assert.match(moduleSource, /staff-catalog-dialog-header-actions staff-design-dialog-header-actions/);
  assert.doesNotMatch(moduleSource, /staff-design-dialog-actions/);
});

test('hat catalog wires shared sort and reorder controls while keeping card editing behavior', () => {
  const moduleSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-hat-catalog.js'), 'utf8');
  assert.match(moduleSource, /sortKey:\s*'custom'/);
  assert.match(moduleSource, /catalog-sort-hats/);
  assert.match(moduleSource, /catalog-hat-reorder-handle/);
  assert.match(moduleSource, /reorderHats\(orderedIds\)/);
  assert.match(moduleSource, /catalog-hat-inventory-save/);
  assert.match(moduleSource, /Initial count confirmed/);
  assert.match(moduleSource, /Cost Each/);
  assert.match(moduleSource, /Physical Count/);
  assert.match(moduleSource, /Save Initial Count/);
  assert.match(moduleSource, /Adjust Quantity/);
  assert.match(moduleSource, /Inventory History/);
  assert.match(moduleSource, /staff-hat-editor-photo-inventory/);
  assert.match(catalogCssSource, /\.staff-hat-editor-photo-inventory\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.3fr\)\s+minmax\(320px,\s*\.7fr\);/);
  assert.match(catalogCssSource, /container-type:\s*inline-size;/);
  assert.match(catalogCssSource, /@container\s*\(max-width:\s*410px\)/);
  assert.doesNotMatch(moduleSource, /catalog-hat-inventory-reason/);
});

test('initial unauthenticated hat render does not request protected records and authenticated render loads hats', async () => {
  const calls = [];
  let canLoad = false;
  const module = hatCatalogModule.createStaffHatCatalogModule({
    apiClient: {
      async listHats() {
        calls.push('listHats');
        return {
          ok: true,
          authenticated: true,
          hats: [
            { id: '1', hat_name: 'Richardson 112 Navy White', status: 'active' }
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
  assert.match(container.innerHTML, /Richardson 112 Navy White/);
  assert.match(container.innerHTML, /Add Hat/);
});

test('app integration activates hats through the shared protected catalog shell', () => {
  assert.match(appSource, /ForgeStaffHatCatalogApi/);
  assert.match(appSource, /createOptionalStaffHatCatalogApiClient/);
  assert.match(appSource, /createOptionalStaffHatCatalogModule/);
  assert.match(appSource, /activeSection === 'hats'/);
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
