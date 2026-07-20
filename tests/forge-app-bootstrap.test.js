const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createClassList() {
  const classes = new Set();
  return {
    add(...tokens) {
      tokens.forEach((token) => classes.add(String(token)));
    },
    remove(...tokens) {
      tokens.forEach((token) => classes.delete(String(token)));
    },
    toggle(token, force) {
      const normalized = String(token);
      if (force === true) {
        classes.add(normalized);
        return true;
      }
      if (force === false) {
        classes.delete(normalized);
        return false;
      }
      if (classes.has(normalized)) {
        classes.delete(normalized);
        return false;
      }
      classes.add(normalized);
      return true;
    },
    contains(token) {
      return classes.has(String(token));
    }
  };
}

function createElement(name = 'div') {
  const listeners = new Map();
  const element = {
    nodeName: name.toUpperCase(),
    hidden: false,
    disabled: false,
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    attributes: {},
    classList: createClassList(),
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    },
    removeAttribute(key) {
      delete this.attributes[key];
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      if (!event.target) {
        event.target = this;
      }
      event.currentTarget = this;
      if (event.type === 'click' && typeof this.onclick === 'function') {
        this.onclick.call(this, event);
      }
      const handlers = listeners.get(event.type) || [];
      handlers.forEach((handler) => handler.call(this, event));
      return true;
    },
    click() {
      this.dispatchEvent({
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    },
    focus() {},
    matches() {
      return false;
    }
  };
  return element;
}

class MockMouseEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

function createQueryEnvironment() {
  const selectorMap = new Map();
  const querySelectorAllMap = new Map();

  function registerSelector(selector, element) {
    selectorMap.set(selector, element);
    return element;
  }

  function registerSelectorAll(selector, elements) {
    querySelectorAllMap.set(selector, elements);
    return elements;
  }

  function querySelector(selector) {
    if (selectorMap.has(selector)) {
      return selectorMap.get(selector);
    }
    const fallback = createElement();
    selectorMap.set(selector, fallback);
    return fallback;
  }

  function querySelectorAll(selector) {
    return querySelectorAllMap.get(selector) || [];
  }

  return {
    selectorMap,
    querySelectorAllMap,
    registerSelector,
    registerSelectorAll,
    querySelector,
    querySelectorAll
  };
}

function createDispatchTarget({ action = '', orderUuid = '', trayNumber = '' } = {}) {
  const actionElement = action ? { dataset: { action } } : null;
  const orderElement = orderUuid ? { dataset: { orderUuid } } : null;
  const trayElement = trayNumber ? { dataset: { trayNumber: String(trayNumber) } } : null;

  return {
    closest(selector) {
      if (selector === '[data-action]') {
        return actionElement;
      }
      if (selector === '[data-order-uuid]') {
        return orderElement;
      }
      if (selector === '[data-tray-number]') {
        return trayElement;
      }
      return null;
    }
  };
}

function loadForgeAppWithoutStaffModules() {
  const env = createQueryEnvironment();
  const startButton = createElement('button');
  const staffButton = createElement('button');
  const staffPanel = createElement('div');
  staffPanel.hidden = true;
  const staffDefaultActions = createElement('div');
  const staffConfirmActions = createElement('div');
  const treeForm = createElement('form');
  const appShell = createElement('div');
  const welcomeScreen = createElement('section');
  welcomeScreen.dataset.screen = 'welcome';
  const categoriesScreen = createElement('section');
  categoriesScreen.dataset.screen = 'categories';
  const allScreens = [welcomeScreen, categoriesScreen];
  const appBody = createElement('body');

  env.registerSelector('[data-action="start"]', startButton);
  env.registerSelector('[data-action="staff"]', staffButton);
  env.registerSelector('[data-staff-panel]', staffPanel);
  env.registerSelector('[data-staff-actions="default"]', staffDefaultActions);
  env.registerSelector('[data-staff-actions="confirm"]', staffConfirmActions);
  env.registerSelector('[data-form="tree-ornament"]', treeForm);
  env.registerSelector('.app-shell', appShell);

  env.registerSelectorAll('[data-screen]', allScreens);
  env.registerSelectorAll('[data-category]', []);
  env.registerSelectorAll('[data-action="back-categories"]', []);
  env.registerSelectorAll('[data-action="back-ornaments"]', []);
  env.registerSelectorAll('[data-action="view-current-order-utility"]', []);
  env.registerSelectorAll('[data-discard-panel]', []);
  env.registerSelectorAll('[data-debug-order-tools]', []);
  env.registerSelectorAll('[data-contact-choice]', []);
  env.registerSelectorAll('[data-fulfillment-choice]', []);
  env.registerSelectorAll('[data-staff-source-status], [data-ready-source-status]', []);
  env.registerSelectorAll('[data-staff-logout-button]', []);
  env.registerSelectorAll('[data-product]', []);

  appBody.insertAdjacentHTML = (_position, html) => {
    if (html.includes('data-staff-order-detail-backdrop')) {
      env.registerSelector('[data-staff-order-detail-backdrop]', createElement('div'));
      env.registerSelector('[data-staff-order-detail-dialog]', createElement('div'));
    }
    if (html.includes('data-staff-tray-assignment-backdrop')) {
      env.registerSelector('[data-staff-tray-assignment-backdrop]', createElement('div'));
      env.registerSelector('[data-staff-tray-assignment-dialog]', createElement('div'));
    }
    if (html.includes('data-staff-batch-backdrop')) {
      env.registerSelector('[data-staff-batch-backdrop]', createElement('div'));
      env.registerSelector('[data-staff-batch-dialog]', createElement('div'));
    }
    if (html.includes('data-staff-packing-backdrop')) {
      env.registerSelector('[data-staff-packing-backdrop]', createElement('div'));
      env.registerSelector('[data-staff-packing-dialog]', createElement('div'));
    }
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    AbortController,
    structuredClone,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          application: 'Forge',
          api_version: '1',
          status: 'ok',
          data: { authenticated: false }
        };
      }
    }),
    crypto: {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      getRandomValues(array) {
        return array;
      }
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    navigator: {
      clipboard: { writeText: async () => {} },
      serviceWorker: { register: async () => ({}) }
    },
    location: { protocol: 'http:', hostname: 'localhost', search: '', href: 'http://localhost:3016/' },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    Event: function Event(type) { this.type = type; },
    HTMLElement: function HTMLElement() {},
    HTMLInputElement: function HTMLInputElement() {},
    HTMLTextAreaElement: function HTMLTextAreaElement() {},
    HTMLButtonElement: function HTMLButtonElement() {},
    HTMLSelectElement: function HTMLSelectElement() {},
    Node: function Node() {},
    alert() {},
    window: null,
    globalThis: null
  };

  context.document = {
    body: appBody,
    documentElement: createElement('html'),
    activeElement: null,
    querySelector: env.querySelector,
    querySelectorAll: env.querySelectorAll,
    getElementById(id) {
      return env.querySelector(`#${id}`);
    },
    createElement(tag) {
      return createElement(tag);
    },
    addEventListener() {},
    removeEventListener() {}
  };

  context.window = context;
  context.globalThis = context;
  context.window.document = context.document;
  context.window.navigator = context.navigator;
  context.window.location = context.location;
  context.window.history = { pushState() {}, replaceState() {} };
  context.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  context.window.addEventListener = () => {};
  context.window.removeEventListener = () => {};
  context.window.dispatchEvent = () => true;
  context.window.scrollTo = () => {};

  vm.createContext(context);

  const files = [
    'public/js/forge-product-catalog.js',
    'public/js/forge-order-payload-builder.js',
    'public/js/forge-order-payload-preview.js',
    'public/js/forge-api-client.js',
    'public/js/forge-order-store.js',
    'public/js/forge-order-server-sync.js',
    'public/js/forge-order-submission.js',
    'public/js/forge-local-orders-queue.js',
    'public/js/app.js'
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  return {
    startButton,
    staffButton,
    staffPanel,
    categoriesScreen
  };
}

function loadForgeHostedStaffAppForTrayDetail() {
  const env = createQueryEnvironment();
  const startButton = createElement('button');
  const staffButton = createElement('button');
  const staffPanel = createElement('div');
  staffPanel.hidden = true;
  const staffDefaultActions = createElement('div');
  const staffConfirmActions = createElement('div');
  const treeForm = createElement('form');
  const appShell = createElement('div');
  const welcomeScreen = createElement('section');
  const staffAccessScreen = createElement('section');
  const staffOrdersScreen = createElement('section');
  const readyToPackScreen = createElement('section');
  const staffOrdersSummary = createElement('div');
  const staffOrdersSearchInput = createElement('input');
  const staffOrdersFilters = createElement('div');
  const staffBatchGroups = createElement('div');
  const staffOrdersList = createElement('div');
  const staffOrdersStatus = createElement('p');
  const staffOrdersLead = createElement('p');
  const readyToPackLead = createElement('p');
  const readyToPackCount = createElement('p');
  const readyToPackList = createElement('div');
  const staffAuthForm = createElement('form');
  const staffAuthPinInput = createElement('input');
  const staffAuthStatus = createElement('p');
  const staffAuthDescription = createElement('p');
  const staffSourceStatus = createElement('span');
  const readySourceStatus = createElement('span');
  const staffLogoutButton = createElement('button');
  const appBody = createElement('body');
  const detailBackdrop = createElement('div');
  const detailDialog = createElement('div');
  const trayBackdrop = createElement('div');
  const trayDialog = createElement('div');
  const batchBackdrop = createElement('div');
  const batchDialog = createElement('div');
  const packingBackdrop = createElement('div');
  const packingDialog = createElement('div');
  let detailDialogHtml = '';
  let assignTrayButton = null;

  welcomeScreen.dataset.screen = 'welcome';
  staffAccessScreen.dataset.screen = 'staff-access';
  staffOrdersScreen.dataset.screen = 'staff-orders';
  readyToPackScreen.dataset.screen = 'ready-to-pack';
  const allScreens = [welcomeScreen, staffAccessScreen, staffOrdersScreen, readyToPackScreen];

  env.registerSelector('[data-action="start"]', startButton);
  env.registerSelector('[data-action="staff"]', staffButton);
  env.registerSelector('[data-staff-panel]', staffPanel);
  env.registerSelector('[data-staff-actions="default"]', staffDefaultActions);
  env.registerSelector('[data-staff-actions="confirm"]', staffConfirmActions);
  env.registerSelector('[data-form="tree-ornament"]', treeForm);
  env.registerSelector('.app-shell', appShell);
  env.registerSelector('[data-staff-orders-summary]', staffOrdersSummary);
  env.registerSelector('[data-staff-orders-search]', staffOrdersSearchInput);
  env.registerSelector('[data-staff-orders-filters]', staffOrdersFilters);
  env.registerSelector('[data-staff-batch-groups]', staffBatchGroups);
  env.registerSelector('[data-staff-orders-list]', staffOrdersList);
  env.registerSelector('[data-staff-orders-status]', staffOrdersStatus);
  env.registerSelector('[data-staff-orders-lead]', staffOrdersLead);
  env.registerSelector('[data-ready-to-pack-lead]', readyToPackLead);
  env.registerSelector('[data-ready-to-pack-count]', readyToPackCount);
  env.registerSelector('[data-ready-to-pack-list]', readyToPackList);
  env.registerSelector('[data-staff-auth-form]', staffAuthForm);
  env.registerSelector('[data-staff-pin-input]', staffAuthPinInput);
  env.registerSelector('[data-staff-auth-status]', staffAuthStatus);
  env.registerSelector('[data-staff-auth-description]', staffAuthDescription);
  env.registerSelector('[data-screen="staff-access"]', staffAccessScreen);
  env.registerSelector('[data-screen="staff-orders"]', staffOrdersScreen);
  env.registerSelector('[data-screen="ready-to-pack"]', readyToPackScreen);

  env.registerSelectorAll('[data-screen]', allScreens);
  env.registerSelectorAll('[data-category]', []);
  env.registerSelectorAll('[data-action="back-categories"]', []);
  env.registerSelectorAll('[data-action="back-ornaments"]', []);
  env.registerSelectorAll('[data-action="view-current-order-utility"]', []);
  env.registerSelectorAll('[data-discard-panel]', []);
  env.registerSelectorAll('[data-debug-order-tools]', []);
  env.registerSelectorAll('[data-contact-choice]', []);
  env.registerSelectorAll('[data-fulfillment-choice]', []);
  env.registerSelectorAll('[data-product]', []);
  env.registerSelectorAll('[data-staff-source-status], [data-ready-source-status]', [staffSourceStatus, readySourceStatus]);
  env.registerSelectorAll('[data-staff-logout-button]', [staffLogoutButton]);

  appBody.insertAdjacentHTML = (_position, html) => {
    if (html.includes('data-staff-order-detail-backdrop')) {
      env.registerSelector('[data-staff-order-detail-backdrop]', detailBackdrop);
      env.registerSelector('[data-staff-order-detail-dialog]', detailDialog);
    }
    if (html.includes('data-staff-tray-assignment-backdrop')) {
      env.registerSelector('[data-staff-tray-assignment-backdrop]', trayBackdrop);
      env.registerSelector('[data-staff-tray-assignment-dialog]', trayDialog);
    }
    if (html.includes('data-staff-batch-backdrop')) {
      env.registerSelector('[data-staff-batch-backdrop]', batchBackdrop);
      env.registerSelector('[data-staff-batch-dialog]', batchDialog);
    }
    if (html.includes('data-staff-packing-backdrop')) {
      env.registerSelector('[data-staff-packing-backdrop]', packingBackdrop);
      env.registerSelector('[data-staff-packing-dialog]', packingDialog);
    }
  };

  Object.defineProperty(detailDialog, 'innerHTML', {
    get() {
      return detailDialogHtml;
    },
    set(value) {
      detailDialogHtml = String(value);
      if (detailDialogHtml.includes('data-action="staff-open-tray-assignment"')) {
        assignTrayButton = createElement('button');
        assignTrayButton.dataset.action = 'staff-open-tray-assignment';
        assignTrayButton.dataset.orderUuid = 'shared-order-1';
        assignTrayButton.closest = (selector) => {
          if (selector === '[data-action]') {
            return assignTrayButton;
          }
          if (selector === '[data-order-uuid]') {
            return assignTrayButton;
          }
          return null;
        };
      } else {
        assignTrayButton = null;
      }
    }
  });

  detailDialog.querySelector = (selector) => {
    if (selector === '[data-action="staff-open-tray-assignment"]') {
      return assignTrayButton;
    }
    return null;
  };

  let trayLoadCount = 0;
  const sharedRecord = {
    forge_order_uuid: 'shared-order-1',
    payload: {
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: []
    },
    submitted_at: '2026-07-20T12:00:00Z',
    local_saved_at: '2026-07-20T12:01:00Z',
    received_at: '2026-07-20T12:01:00Z',
    sync_status: 'synced',
    production_status: 'submitted',
    current_tray_number: null,
    total_item_count: 0,
    completed_item_count: 0,
    staff_data_source: 'server',
    staff_read_only: true,
    staff_can_assign_tray: true
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    AbortController,
    structuredClone,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          application: 'Forge',
          api_version: '1',
          status: 'ok',
          data: { authenticated: true }
        };
      }
    }),
    crypto: {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      getRandomValues(array) {
        return array;
      }
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    navigator: {
      clipboard: { writeText: async () => {} },
      serviceWorker: { register: async () => ({}) }
    },
    location: { protocol: 'https:', hostname: 'forge.thehilltopshop.com', search: '', href: 'https://forge.thehilltopshop.com/' },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    Event: function Event(type) { this.type = type; },
    HTMLElement: function HTMLElement() {},
    HTMLInputElement: function HTMLInputElement() {},
    HTMLTextAreaElement: function HTMLTextAreaElement() {},
    HTMLButtonElement: function HTMLButtonElement() {},
    HTMLSelectElement: function HTMLSelectElement() {},
    Node: function Node() {},
    alert() {},
    window: null,
    globalThis: null
  };

  context.ForgeStaffApiClient = {
    createForgeStaffApiClient() {
      return {};
    }
  };
  context.ForgeStaffOrdersRuntime = {
    createStaffOrdersRuntime() {
      return {
        environment: {
          protocol: 'https:',
          hostname: 'forge.thehilltopshop.com',
          usesHostedServer: true,
          requiresAuthentication: true,
          dataSource: 'server'
        },
        async checkAccess() {
          return {
            ok: true,
            authenticated: true,
            requiresAuthentication: true,
            nextScreen: 'staff-orders',
            dataSource: 'server',
            readOnly: true
          };
        },
        async login() {
          return {
            ok: true,
            authenticated: true,
            requiresAuthentication: true,
            nextScreen: 'staff-orders',
            dataSource: 'server',
            readOnly: true
          };
        },
        async logout() {
          return {
            ok: true,
            authenticated: false,
            nextScreen: 'staff-access',
            dataSource: 'server',
            readOnly: true
          };
        },
        async loadOrders() {
          return {
            ok: true,
            authenticated: true,
            dataSource: 'server',
            readOnly: true,
            records: [structuredClone(sharedRecord)]
          };
        },
        async loadTrays() {
          trayLoadCount += 1;
          return {
            ok: true,
            authenticated: true,
            dataSource: 'server',
            readOnly: true,
            trays: [
              { tray_number: 1, tray_status: 'available', current_order_uuid: null, assigned_at: null, updated_at: '2026-07-20T12:05:00Z' }
            ]
          };
        },
        async assignTrayToOrder() {
          throw new Error('assignTrayToOrder should not be called in this click-path test');
        }
      };
    }
  };

  context.document = {
    body: appBody,
    documentElement: createElement('html'),
    activeElement: null,
    querySelector: env.querySelector,
    querySelectorAll: env.querySelectorAll,
    getElementById(id) {
      return env.querySelector(`#${id}`);
    },
    createElement(tag) {
      return createElement(tag);
    },
    addEventListener() {},
    removeEventListener() {}
  };

  context.window = context;
  context.globalThis = context;
  context.window.document = context.document;
  context.window.navigator = context.navigator;
  context.window.location = context.location;
  context.window.history = { pushState() {}, replaceState() {} };
  context.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  context.window.addEventListener = () => {};
  context.window.removeEventListener = () => {};
  context.window.dispatchEvent = () => true;
  context.window.scrollTo = () => {};

  vm.createContext(context);

  const files = [
    'public/js/forge-product-catalog.js',
    'public/js/forge-order-payload-builder.js',
    'public/js/forge-order-payload-preview.js',
    'public/js/forge-api-client.js',
    'public/js/forge-order-store.js',
    'public/js/forge-order-server-sync.js',
    'public/js/forge-order-submission.js',
    'public/js/forge-local-orders-queue.js',
    'public/js/app.js'
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  return {
    context,
    detailDialog,
    trayDialog,
    getAssignTrayButton() {
      return assignTrayButton;
    },
    getTrayLoadCount() {
      return trayLoadCount;
    }
  };
}

test('localhost app bootstrap survives missing staff tray modules and keeps Start Order and Staff Tools interactive', () => {
  const { startButton, staffButton, staffPanel, categoriesScreen } = loadForgeAppWithoutStaffModules();

  assert.doesNotThrow(() => startButton.click());
  assert.equal(categoriesScreen.classList.contains('active'), true);

  assert.doesNotThrow(() => staffButton.click());
  assert.equal(staffPanel.hidden, false);
});

test('shared server order detail assign tray button opens the tray picker after re-rendering', async () => {
  const { context, detailDialog, trayDialog, getAssignTrayButton, getTrayLoadCount } = loadForgeHostedStaffAppForTrayDetail();

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  let assignTrayButton = getAssignTrayButton();
  assert.ok(assignTrayButton);
  assert.equal(assignTrayButton.dataset.trayHandlerBound, 'true');
  assert.equal(typeof assignTrayButton.onclick, 'function');
  assignTrayButton.dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(String(detailDialog.innerHTML || ''), /Loading available trays/);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getTrayLoadCount(), 1);
  assert.equal(trayDialog.hidden, false);
  assert.match(trayDialog.innerHTML, /Assign Tray/);

  context.closeStaffTrayAssignment();
  await context.openStaffOrderDetail('shared-order-1');
  assignTrayButton = getAssignTrayButton();
  assert.ok(assignTrayButton);
  assert.equal(assignTrayButton.dataset.trayHandlerBound, 'true');
  assert.equal(typeof assignTrayButton.onclick, 'function');
  assignTrayButton.dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(String(detailDialog.innerHTML || ''), /Loading available trays/);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getTrayLoadCount(), 2);
  assert.equal(trayDialog.hidden, false);
  assert.match(trayDialog.innerHTML, /Assign Tray/);
});

test('shared server order detail assign tray still opens when hosted state is read-only and enabled flag is stale', async () => {
  const { context, detailDialog, trayDialog, getAssignTrayButton, getTrayLoadCount } = loadForgeHostedStaffAppForTrayDetail();

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  vm.runInContext('staffOrdersState.enabled = false;', context);

  let assignTrayButton = getAssignTrayButton();
  assert.ok(assignTrayButton);
  assert.equal(assignTrayButton.dataset.trayHandlerBound, 'true');
  assert.equal(typeof assignTrayButton.onclick, 'function');
  assignTrayButton.dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(String(detailDialog.innerHTML || ''), /Loading available trays/);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getTrayLoadCount(), 1);
  assert.equal(trayDialog.hidden, false);
  assert.match(trayDialog.innerHTML, /Assign Tray/);

  context.closeStaffTrayAssignment();
  await context.openStaffOrderDetail('shared-order-1');
  vm.runInContext('staffOrdersState.enabled = false;', context);
  assignTrayButton = getAssignTrayButton();
  assert.ok(assignTrayButton);
  assert.equal(assignTrayButton.dataset.trayHandlerBound, 'true');
  assert.equal(typeof assignTrayButton.onclick, 'function');
  assignTrayButton.dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(String(detailDialog.innerHTML || ''), /Loading available trays/);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getTrayLoadCount(), 2);
  assert.equal(trayDialog.hidden, false);
  assert.match(trayDialog.innerHTML, /Assign Tray/);
});
