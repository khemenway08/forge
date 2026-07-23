const test = require('node:test');
const assert = require('node:assert/strict');

const designCatalogModule = require('../public/js/forge-staff-design-catalog.js');
const hatCatalogModule = require('../public/js/forge-staff-hat-catalog.js');
const materialCatalogModule = require('../public/js/forge-staff-material-catalog.js');
const finishedHatCatalogModule = require('../public/js/forge-staff-finished-hat-catalog.js');

test('catalog search inputs keep focus caret and reorder state while results update', async () => {
  const scenarios = [
    {
      name: 'Designs',
      searchAction: 'catalog-search',
      handleAction: 'catalog-design-reorder-handle',
      createModule(options) {
        return designCatalogModule.createStaffDesignCatalogModule(options);
      },
      apiClient: {
        async listDesigns() {
          return {
            ok: true,
            authenticated: true,
            designs: [
              { id: 'design-1', design_name: 'Alpha Badge', status: 'active', sort_order: 1000 },
              { id: 'design-2', design_name: 'Beta Badge', status: 'active', sort_order: 2000 }
            ]
          };
        }
      },
      expectedMatch: 'Alpha Badge',
      expectedHidden: 'Beta Badge'
    },
    {
      name: 'Hats',
      searchAction: 'catalog-hat-search',
      handleAction: 'catalog-hat-reorder-handle',
      createModule(options) {
        return hatCatalogModule.createStaffHatCatalogModule(options);
      },
      apiClient: {
        async listHats() {
          return {
            ok: true,
            authenticated: true,
            hats: [
              { id: 'hat-1', hat_name: 'Alpha Rope Hat', status: 'active', sort_order: 1000 },
              { id: 'hat-2', hat_name: 'Beta Trucker Hat', status: 'active', sort_order: 2000 }
            ]
          };
        }
      },
      expectedMatch: 'Alpha Rope Hat',
      expectedHidden: 'Beta Trucker Hat'
    },
    {
      name: 'Materials',
      searchAction: 'catalog-material-search',
      handleAction: 'catalog-material-reorder-handle',
      createModule(options) {
        return materialCatalogModule.createStaffMaterialCatalogModule(options);
      },
      apiClient: {
        async listMaterials() {
          return {
            ok: true,
            authenticated: true,
            materials: [
              { id: 'material-1', material_name: 'Alpha Acrylic', status: 'active', sort_order: 1000 },
              { id: 'material-2', material_name: 'Beta Leatherette', status: 'active', sort_order: 2000 }
            ]
          };
        }
      },
      expectedMatch: 'Alpha Acrylic',
      expectedHidden: 'Beta Leatherette'
    },
    {
      name: 'Finished Hats',
      searchAction: 'catalog-finished-hat-search',
      handleAction: 'catalog-finished-hat-reorder-handle',
      createModule(options) {
        return finishedHatCatalogModule.createStaffFinishedHatCatalogModule(options);
      },
      apiClient: {
        async listFinishedHats() {
          return {
            ok: true,
            authenticated: true,
            finished_hats: [
              { id: 'finished-1', finished_hat_name: 'Alpha Finished Hat', status: 'active', placement_status: 'sample', sort_order: 1000 },
              { id: 'finished-2', finished_hat_name: 'Beta Finished Hat', status: 'active', placement_status: 'sample', sort_order: 2000 }
            ]
          };
        }
      },
      expectedMatch: 'Alpha Finished Hat',
      expectedHidden: 'Beta Finished Hat'
    }
  ];

  for (const scenario of scenarios) {
    await assertCatalogSearchFocusScenario(scenario);
  }
});

async function assertCatalogSearchFocusScenario(scenario) {
  const documentRef = createCatalogFocusDocument();
  const container = createCatalogFocusContainer(documentRef);
  const module = scenario.createModule({
    apiClient: scenario.apiClient,
    canLoadProtectedRecords() {
      return true;
    },
    orderingApi: {
      createCatalogReorderController() {
        return {
          sync() {},
          isDraggingId() { return false; },
          isSaving() { return false; },
          shouldSuppressActivation() { return false; },
          beginPointer() {},
          handleHandleKeydown() {}
        };
      },
      getReorderAvailability(sortKey, filters) {
        const hasActiveFilters = Object.values(filters || {}).some(Boolean);
        return {
          enabled: sortKey === 'custom' && !hasActiveFilters,
          reason: hasActiveFilters ? 'Clear search and filters to rearrange Custom Order.' : ''
        };
      },
      sortCatalogRecords(records) {
        return records.slice().sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
      }
    },
    document: documentRef,
    window: { setTimeout(fn) { fn(); } }
  });

  module.render(container);
  await flushMicrotasks();

  assert.match(container.innerHTML, new RegExp(scenario.expectedMatch));
  assert.match(container.innerHTML, new RegExp(scenario.expectedHidden));
  assert.match(container.innerHTML, new RegExp(`data-action="${scenario.handleAction}"`), `${scenario.name} starts with reorder handles`);

  let searchInput = container.querySelector(`[data-action="${scenario.searchAction}"]`);
  searchInput.focus();
  searchInput.value = 'a';
  searchInput.selectionStart = 1;
  searchInput.selectionEnd = 1;
  container.dispatchInput(searchInput);

  searchInput = documentRef.activeElement;
  assert.equal(searchInput.dataset.action, scenario.searchAction, `${scenario.name} keeps focus after first character`);
  assert.equal(searchInput.value, 'a');
  assert.equal(searchInput.selectionStart, 1);
  assert.equal(searchInput.selectionEnd, 1);
  assert.equal(searchInput.focusOptions.preventScroll, true);
  assert.doesNotMatch(container.innerHTML, new RegExp(`data-action="${scenario.handleAction}"`), `${scenario.name} hides reorder handles while search is active`);

  searchInput.value = 'al';
  searchInput.selectionStart = 2;
  searchInput.selectionEnd = 2;
  container.dispatchInput(searchInput);

  searchInput = documentRef.activeElement;
  assert.equal(searchInput.dataset.action, scenario.searchAction, `${scenario.name} keeps focus after multiple characters`);
  assert.equal(searchInput.value, 'al');
  assert.equal(searchInput.selectionStart, 2);
  assert.equal(searchInput.selectionEnd, 2);
  assert.match(container.innerHTML, new RegExp(scenario.expectedMatch), `${scenario.name} search results update`);
  assert.doesNotMatch(container.innerHTML, new RegExp(scenario.expectedHidden), `${scenario.name} filters non-matching records`);

  searchInput.value = '';
  searchInput.selectionStart = 0;
  searchInput.selectionEnd = 0;
  container.dispatchInput(searchInput);

  assert.equal(documentRef.activeElement.dataset.action, scenario.searchAction, `${scenario.name} keeps focus when search is cleared`);
  assert.match(container.innerHTML, new RegExp(`data-action="${scenario.handleAction}"`), `${scenario.name} restores reorder handles when search is cleared`);
}

function createCatalogFocusDocument() {
  const documentRef = {
    activeElement: null,
    body: {
      appendChild() {}
    },
    createElement() {
      return createFakeDialogElement();
    }
  };
  return documentRef;
}

function createCatalogFocusContainer(documentRef) {
  const listeners = {};
  const container = {
    _html: '',
    _nodes: new Map(),
    dataset: {},
    set innerHTML(value) {
      this._html = String(value || '');
      this._nodes = createActionNodes(this._html, documentRef, this);
    },
    get innerHTML() {
      return this._html;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector(selector) {
      const match = String(selector || '').match(/\[data-action="([^"]+)"\]/);
      return match ? this._nodes.get(match[1]) || null : null;
    },
    querySelectorAll() {
      return [];
    },
    contains(node) {
      return Array.from(this._nodes.values()).includes(node);
    },
    dispatchInput(target) {
      listeners.input?.({ target });
    }
  };
  return container;
}

function createActionNodes(html, documentRef, container) {
  const nodes = new Map();
  const actionPattern = /<(input|select|button|article)\b[^>]*data-action="([^"]+)"[^>]*>/g;
  let match = actionPattern.exec(html);
  while (match) {
    const tagName = match[1];
    const tagHtml = match[0];
    const action = match[2];
    if (!nodes.has(action)) {
      nodes.set(action, createActionNode(tagName, tagHtml, action, documentRef, container));
    }
    match = actionPattern.exec(html);
  }
  return nodes;
}

function createActionNode(tagName, tagHtml, action, documentRef, container) {
  const valueMatch = tagHtml.match(/\bvalue="([^"]*)"/);
  return {
    tagName: tagName.toUpperCase(),
    dataset: { action },
    value: valueMatch ? decodeHtmlAttribute(valueMatch[1]) : '',
    selectionStart: 0,
    selectionEnd: 0,
    focusOptions: null,
    focus(options = {}) {
      this.focusOptions = options;
      documentRef.activeElement = this;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    closest(selector) {
      if (selector === '[role="tabpanel"]') {
        return container;
      }
      if (selector === '[data-action]') {
        return this;
      }
      return null;
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

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
