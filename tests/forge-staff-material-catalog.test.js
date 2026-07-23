const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const materialCatalogModule = require('../public/js/forge-staff-material-catalog.js');

const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');
const catalogCssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');

test('material record normalization preserves optional metadata and dimensions', () => {
  const normalized = materialCatalogModule.normalizeMaterialRecord({
    id: ' mat-1 ',
    material_name: ' Brushed Stainless Black Acrylic ',
    swatch_path: ' /uploads/material-swatches/material-1.png ',
    material_type: ' Acrylic ',
    color: ' Brushed Stainless / Black ',
    supplier: ' JDS ',
    production_method: ' Laserable ',
    purchase_cost: ' 12.50 ',
    purchase_quantity: ' 5 ',
    cost_basis: ' per_sheet ',
    status: ' active ',
    notes: ' Premium panel ',
    image_width: '1000',
    image_height: '1000'
  });

  assert.equal(normalized.material_name, 'Brushed Stainless Black Acrylic');
  assert.equal(normalized.swatch_path, '/uploads/material-swatches/material-1.png');
  assert.equal(normalized.image_width, 1000);
  assert.equal(normalized.image_height, 1000);
});

test('material filters cover search plus type production method and status', () => {
  const records = [
    materialCatalogModule.normalizeMaterialRecord({
      id: '1',
      material_name: 'Brushed Stainless Black Acrylic',
      material_type: 'Acrylic',
      color: 'Brushed Stainless / Black',
      production_method: 'Laserable',
      status: 'active'
    }),
    materialCatalogModule.normalizeMaterialRecord({
      id: '2',
      material_name: 'Rawhide Black Durra Bull Premium Leatherette Sheets',
      material_type: 'Leatherette',
      color: 'Rawhide / Black',
      production_method: '',
      status: 'review'
    })
  ];

  const results = materialCatalogModule.filterMaterialRecords(records, {
    search: 'rawhide',
    material_type: 'leatherette',
    production_method: '',
    status: 'review'
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, '2');
});

test('material square-card fit mode uses contain for near-square images and cover for portrait images', () => {
  assert.equal(materialCatalogModule.getMaterialSwatchFitMode({
    material_name: 'Square',
    image_width: 1000,
    image_height: 1000
  }), 'contain');
  assert.equal(materialCatalogModule.getMaterialSwatchFitMode({
    material_name: 'Portrait',
    image_width: 1500,
    image_height: 2000
  }), 'cover');
});

test('material edit preview uses the shared contain-based preview frame and material cards use dedicated contain or cover swatch classes', () => {
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center;/);
  assert.match(catalogCssSource, /\.staff-material-card-thumb-image--contain\s*\{[\s\S]*object-fit:\s*contain;/);
  assert.match(catalogCssSource, /\.staff-material-card-thumb-image--cover\s*\{[\s\S]*object-fit:\s*cover;/);
});

test('material cards and dialog actions use the shared top-aligned catalog pattern', () => {
  const moduleSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-material-catalog.js'), 'utf8');
  assert.match(moduleSource, /staff-catalog-designs-filter staff-catalog-designs-filter--search/);
  assert.match(moduleSource, /staff-design-card-action-row/);
  assert.doesNotMatch(moduleSource, /aria-hidden="true">Edit<\/span>/);
  assert.match(moduleSource, /staff-catalog-dialog-header-actions staff-design-dialog-header-actions/);
  assert.doesNotMatch(moduleSource, /staff-design-dialog-actions/);
});

test('initial unauthenticated material render does not request protected records and authenticated render loads materials', async () => {
  const calls = [];
  let canLoad = false;
  const module = materialCatalogModule.createStaffMaterialCatalogModule({
    apiClient: {
      async listMaterials() {
        calls.push('listMaterials');
        return {
          ok: true,
          authenticated: true,
          materials: [
            { id: '1', material_name: 'Brushed Stainless Black Acrylic', status: 'active', image_width: 1000, image_height: 1000 }
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
  assert.match(container.innerHTML, /Brushed Stainless Black Acrylic/);
  assert.match(container.innerHTML, /Add Material/);
});

test('app integration activates materials through the shared protected catalog shell', () => {
  assert.match(appSource, /ForgeStaffMaterialCatalogApi/);
  assert.match(appSource, /createOptionalStaffMaterialCatalogApiClient/);
  assert.match(appSource, /createOptionalStaffMaterialCatalogModule/);
  assert.match(appSource, /activeSection === 'materials'/);
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
