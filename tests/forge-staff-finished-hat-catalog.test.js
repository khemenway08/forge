const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const finishedHatCatalogModule = require('../public/js/forge-staff-finished-hat-catalog.js');

const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');
const catalogCssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');

test('finished hat record normalization preserves links dimensions and nullable price', () => {
  const normalized = finishedHatCatalogModule.normalizeFinishedHatRecord({
    id: ' fin-1 ',
    finished_hat_name: ' Texas Hill Country Camo Leatherette Patch Hat ',
    photo_path: ' /uploads/finished-hat-photos/finished-hat-a1b2c3.jpg ',
    image_width: '1536',
    image_height: '2048',
    design_name: ' Texas Hill Country ',
    hat_manufacturer: ' Richardson ',
    hat_model: ' 112 ',
    hat_color: ' Navy / Charcoal ',
    material_name: ' Rawhide Black Durra Bull Premium Leatherette Sheets ',
    material_type: ' Leatherette ',
    material_color: ' Rawhide / Black ',
    placement_status: ' sample ',
    retail_price: ' 38.00 ',
    status: ' active ',
    needs_linking: 0
  });

  assert.equal(normalized.finished_hat_name, 'Texas Hill Country Camo Leatherette Patch Hat');
  assert.equal(normalized.photo_path, '/uploads/finished-hat-photos/finished-hat-a1b2c3.jpg');
  assert.equal(normalized.image_width, 1536);
  assert.equal(normalized.image_height, 2048);
  assert.equal(normalized.placement_status, 'sample');
  assert.equal(normalized.retail_price, '38.00');
  assert.equal(normalized.needs_linking, false);
});

test('finished hat filters cover linked search placement status and needs-linking', () => {
  const records = [
    finishedHatCatalogModule.normalizeFinishedHatRecord({
      id: '1',
      finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
      design_name: 'Texas Flag',
      hat_manufacturer: 'Zapped',
      hat_model: 'Blackhawk R+',
      hat_color: 'Black / Red',
      material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
      material_type: 'Acrylic',
      material_color: 'Black / Stainless',
      placement_status: 'sample',
      status: 'active',
      needs_linking: false
    }),
    finishedHatCatalogModule.normalizeFinishedHatRecord({
      id: '2',
      finished_hat_name: 'America 250 Coastal Flag Eagle Leatherette Patch Hat',
      design_name: null,
      hat_manufacturer: 'Richardson',
      hat_model: '112',
      hat_color: 'Navy / Charcoal',
      material_name: null,
      material_type: null,
      material_color: null,
      placement_status: 'unassigned',
      status: 'review',
      needs_linking: true
    })
  ];

  const results = finishedHatCatalogModule.filterFinishedHatRecords(records, {
    search: 'blackhawk',
    design_name: '',
    hat_manufacturer: 'Zapped',
    hat_model: '',
    hat_color: '',
    material_name: '',
    placement_status: 'sample',
    status: 'active',
    needs_linking: 'fully_linked'
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, '1');
});

test('finished hat compact summaries stay concise for linked and incomplete records', () => {
  const completeRecord = finishedHatCatalogModule.normalizeFinishedHatRecord({
    finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
    design_id: 'design-1',
    hat_id: 'hat-1',
    material_id: 'material-1',
    design_name: 'Texas Flag',
    hat_manufacturer: 'Zapped',
    hat_model: 'Blackhawk R+',
    hat_color: 'Black / Red',
    material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
    material_color: 'Black / Stainless'
  });
  const incompleteRecord = finishedHatCatalogModule.normalizeFinishedHatRecord({
    finished_hat_name: 'America 250 Coastal Flag Eagle Leatherette Patch Hat',
    design_id: null,
    hat_id: 'hat-1',
    material_id: null,
    hat_manufacturer: 'Richardson',
    hat_model: '112',
    hat_color: 'Navy / Charcoal'
  });

  assert.equal(
    finishedHatCatalogModule.getFinishedHatCompactSummary(completeRecord),
    'Texas Flag • Zapped — Blackhawk R+ — Black / Red • Brushed Stainless Black Laserable Acrylic Panels — Black / Stainless'
  );
  assert.equal(finishedHatCatalogModule.getFinishedHatMissingLinksSummary(completeRecord), '');
  assert.equal(finishedHatCatalogModule.getFinishedHatMissingLinksSummary(incompleteRecord), 'Needs Design + Material');
});

test('finished hat card photos stay cover-cropped while dialog preview stays shared contain mode', () => {
  assert.match(catalogCssSource, /\.staff-finished-hat-card-thumb-image\s*\{[\s\S]*object-fit:\s*cover;[\s\S]*object-position:\s*center;/);
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-card:hover,\s*\.staff-finished-hat-card:focus-visible/);
  assert.match(catalogCssSource, /\.staff-finished-hat-card-title\s*\{[\s\S]*-webkit-line-clamp:\s*2;/);
});

test('initial unauthenticated finished-hat render does not request protected records and authenticated render loads finished hats', async () => {
  const calls = [];
  let canLoad = false;
  const module = finishedHatCatalogModule.createStaffFinishedHatCatalogModule({
    apiClient: {
      async listFinishedHats() {
        calls.push('listFinishedHats');
        return {
          ok: true,
          authenticated: true,
          finished_hats: [
            {
              id: '1',
              finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
              status: 'active',
              placement_status: 'sample'
            }
          ]
        };
      }
    },
    designApiClient: { async listDesigns() { return { ok: true, authenticated: true, designs: [] }; } },
    hatApiClient: { async listHats() { return { ok: true, authenticated: true, hats: [] }; } },
    materialApiClient: { async listMaterials() { return { ok: true, authenticated: true, materials: [] }; } },
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
  assert.match(container.innerHTML, /Finished Hats/);
  assert.match(container.innerHTML, /Texas Flag Acrylic Patch Hat Black Performance Rope/);
  assert.match(container.innerHTML, /Add Finished Hat/);
});

test('finished hat cards open the read-only detail view by click and keyboard and switch to edit without a visible card edit button', async () => {
  const harness = createFinishedHatCatalogHarness();

  harness.module.render(harness.container);
  await flushMicrotasks();

  assert.match(harness.container.innerHTML, /data-action="catalog-open-finished-hat-detail"/);
  assert.match(harness.container.innerHTML, /aria-label="Open Texas Flag Acrylic Patch Hat Black Performance Rope"/);
  assert.doesNotMatch(harness.container.innerHTML, />Edit<\/button>/);

  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  assert.equal(harness.dialogBackdrop.hidden, false);
  assert.match(harness.formNode.innerHTML, /Texas Flag Acrylic Patch Hat Black Performance Rope/);
  assert.match(harness.headerActionsNode.innerHTML, />Edit<\/button>/);
  assert.match(harness.formNode.innerHTML, /Texas Flag/);
  assert.match(harness.formNode.innerHTML, /Zapped — Blackhawk R\+ — Black \/ Red/);

  const keyboardEvent = createActionEvent('catalog-open-finished-hat-detail', '1');
  keyboardEvent.key = ' ';
  keyboardEvent.preventDefaultCalled = false;
  keyboardEvent.preventDefault = () => {
    keyboardEvent.preventDefaultCalled = true;
  };
  harness.container.dispatch('keydown', keyboardEvent);
  assert.equal(keyboardEvent.preventDefaultCalled, true);
  assert.match(harness.formNode.innerHTML, /Texas Flag Acrylic Patch Hat Black Performance Rope/);

  harness.dialogBackdrop.dispatch('click', {
    target: {
      dataset: { action: 'catalog-edit-finished-hat-detail' }
    }
  });
  await flushMicrotasks();
  assert.match(harness.formNode.innerHTML, /Save Finished Hat/);
  assert.match(harness.formNode.innerHTML, /name="finished_hat_name"/);
});

test('add finished hat still opens the existing create form', async () => {
  const harness = createFinishedHatCatalogHarness();

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-add-finished-hat'));
  await flushMicrotasks();

  assert.equal(harness.dialogBackdrop.hidden, false);
  assert.match(harness.formNode.innerHTML, /Add Finished Hat/);
  assert.match(harness.formNode.innerHTML, /Choose Photo/);
});

test('app integration activates finished hats through the protected catalog shell', () => {
  assert.match(appSource, /ForgeStaffFinishedHatCatalogApi/);
  assert.match(appSource, /createOptionalStaffFinishedHatCatalogApiClient/);
  assert.match(appSource, /createOptionalStaffFinishedHatCatalogModule/);
  assert.match(appSource, /activeSection === 'finished-hats'/);
});

function createCatalogTestContainer() {
  const listeners = new Map();
  return {
    innerHTML: '',
    dataset: {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    dispatch(type, event) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler.call(this, event));
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function createCatalogTestDocument() {
  const dialogBackdrop = createFakeDialogElement();
  const dialogNode = createFakeDialogElement();
  const formNode = createFakeDialogNode('form');
  const statusNode = createFakeDialogNode('status');
  const headerActionsNode = createFakeDialogNode('header-actions');

  dialogBackdrop.querySelector = (selector) => {
    if (selector === '.staff-design-dialog') {
      return dialogNode;
    }
    if (selector === '[data-finished-hat-dialog-form]') {
      return formNode;
    }
    if (selector === '[data-finished-hat-dialog-status]') {
      return statusNode;
    }
    if (selector === '[data-finished-hat-dialog-header-actions]') {
      return headerActionsNode;
    }
    return createFakeDialogNode(selector);
  };

  return {
    activeElement: null,
    body: {
      appendChild(node) {
        this.lastAppended = node;
      }
    },
    createElement() {
      return dialogBackdrop;
    },
    __dialogBackdrop: dialogBackdrop,
    __formNode: formNode,
    __statusNode: statusNode,
    __headerActionsNode: headerActionsNode
  };
}

function createFakeDialogElement() {
  const listeners = new Map();
  return {
    className: '',
    hidden: false,
    innerHTML: '',
    dataset: {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    dispatch(type, event) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler.call(this, event));
    },
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

function createFinishedHatCatalogHarness() {
  const document = createCatalogTestDocument();
  const container = createCatalogTestContainer();
  const module = finishedHatCatalogModule.createStaffFinishedHatCatalogModule({
    apiClient: {
      async listFinishedHats() {
        return {
          ok: true,
          authenticated: true,
          finished_hats: [
            {
              id: '1',
              finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
              design_id: 'design-1',
              hat_id: 'hat-1',
              material_id: 'material-1',
              design_name: 'Texas Flag',
              hat_manufacturer: 'Zapped',
              hat_model: 'Blackhawk R+',
              hat_color: 'Black / Red',
              material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
              material_color: 'Black / Stainless',
              placement_status: 'sample',
              status: 'active'
            }
          ]
        };
      },
      async updateFinishedHat(_id, payload) {
        return {
          ok: true,
          authenticated: true,
          finished_hat: {
            id: '1',
            ...payload,
            design_name: 'Texas Flag',
            hat_manufacturer: 'Zapped',
            hat_model: 'Blackhawk R+',
            hat_color: 'Black / Red',
            material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
            material_color: 'Black / Stainless'
          }
        };
      },
      async createFinishedHat(payload) {
        return {
          ok: true,
          authenticated: true,
          finished_hat: {
            id: 'new-finished-hat',
            ...payload
          }
        };
      },
      async uploadPhoto(id) {
        return {
          ok: true,
          authenticated: true,
          finished_hat: { id }
        };
      }
    },
    designApiClient: {
      async listDesigns() {
        return { ok: true, authenticated: true, designs: [{ id: 'design-1', design_name: 'Texas Flag' }] };
      }
    },
    hatApiClient: {
      async listHats() {
        return { ok: true, authenticated: true, hats: [{ id: 'hat-1', manufacturer: 'Zapped', model: 'Blackhawk R+', color: 'Black / Red', hat_name: 'Blackhawk R+ Black Red' }] };
      }
    },
    materialApiClient: {
      async listMaterials() {
        return { ok: true, authenticated: true, materials: [{ id: 'material-1', material_name: 'Brushed Stainless Black Laserable Acrylic Panels', material_type: 'Acrylic', color: 'Black / Stainless' }] };
      }
    },
    canLoadProtectedRecords() {
      return true;
    },
    document,
    window: { setTimeout(fn) { fn(); } }
  });

  return {
    module,
    container,
    dialogBackdrop: document.__dialogBackdrop,
    formNode: document.__formNode,
    statusNode: document.__statusNode,
    headerActionsNode: document.__headerActionsNode
  };
}

function createActionEvent(action, finishedHatId = '') {
  return {
    key: '',
    target: {
      closest(selector) {
        if (selector === '[data-action]') {
          return { dataset: { action } };
        }
        if (selector === '[data-finished-hat-id]' && finishedHatId) {
          return { dataset: { finishedHatId } };
        }
        return null;
      }
    },
    preventDefault() {},
    stopPropagation() {}
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
