const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const indexSource = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');

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

function attachActionDataset(element, action) {
  element.dataset.action = action;
  element.closest = (selector) => {
    if (selector === '[data-action]') {
      return element;
    }
    return null;
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

function loadForgeAppWithoutStaffModules({
  protocol = 'http:',
  hostname = 'localhost',
  includeHostedStaffModules = false
} = {}) {
  const env = createQueryEnvironment();
  const startButton = attachActionDataset(createElement('button'), 'start');
  const ornamentCategoryButton = attachActionDataset(createElement('button'), 'browse-ornament-designs');
  ornamentCategoryButton.dataset.category = 'ornaments';
  const staffButton = attachActionDataset(createElement('button'), 'staff');
  const placeOrderButton = attachActionDataset(createElement('button'), 'place-order-development');
  const paymentHandoffSubmitButton = attachActionDataset(createElement('button'), 'payment-handoff-submit');
  const paymentHandoffStatus = createElement('p');
  const paymentHandoffPinInput = createElement('input');
  const paymentHandoffCustomerName = createElement('strong');
  const paymentHandoffSummary = createElement('div');
  const paymentHandoffTotal = createElement('strong');
  const paymentHandoffCancelPanel = createElement('div');
  paymentHandoffCancelPanel.hidden = true;
  const finalReviewStatus = createElement('p');
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
  const ornamentsScreen = createElement('section');
  ornamentsScreen.dataset.screen = 'ornaments';
  const finalReviewScreen = createElement('section');
  finalReviewScreen.dataset.screen = 'final-review';
  const paymentHandoffScreen = createElement('section');
  paymentHandoffScreen.dataset.screen = 'payment-handoff';
  const thankYouScreen = createElement('section');
  thankYouScreen.dataset.screen = 'thank-you';
  const staffOrdersScreen = createElement('section');
  staffOrdersScreen.dataset.screen = 'staff-orders';
  const readyToPackScreen = createElement('section');
  readyToPackScreen.dataset.screen = 'ready-to-pack';
  const staffAdminScreen = createElement('section');
  staffAdminScreen.dataset.screen = 'staff-admin';
  const finalReviewItems = createElement('div');
  const finalReviewSummary = createElement('div');
  const finalReviewCustomer = createElement('div');
  const finalReviewDelivery = createElement('div');
  const thankYouCopy = createElement('p');
  const thankYouReference = createElement('div');
  const thankYouDebugTools = createElement('div');
  const staffOrdersSearch = createElement('input');
  const staffOrdersFilters = createElement('div');
  const staffBatchGroups = createElement('div');
  const staffOrdersList = createElement('div');
  const staffOrdersStatus = createElement('p');
  const staffOrdersLead = createElement('p');
  const readyToPackLead = createElement('p');
  const readyToPackCount = createElement('p');
  const readyToPackList = createElement('div');
  const staffAdminLead = createElement('p');
  const staffAdminContent = createElement('div');
  const staffDemoControls = createElement('div');
  staffDemoControls.hidden = true;
  const staffEyebrowNode = createElement('p');
  const paymentMethodButtons = ['card_square', 'cash', 'venmo'].map((paymentMethod) => {
    const button = createElement('button');
    button.dataset.paymentMethod = paymentMethod;
    return button;
  });
  const allScreens = [welcomeScreen, categoriesScreen, ornamentsScreen, finalReviewScreen, paymentHandoffScreen, thankYouScreen, staffOrdersScreen, readyToPackScreen, staffAdminScreen];
  const appBody = createElement('body');
  const localStorageData = new Map();
  const documentListeners = new Map();

  env.registerSelector('[data-action="start"]', startButton);
  env.registerSelector('[data-action="staff"]', staffButton);
  env.registerSelector('[data-action="place-order-development"]', placeOrderButton);
  env.registerSelector('[data-action="payment-handoff-submit"]', paymentHandoffSubmitButton);
  env.registerSelector('[data-staff-panel]', staffPanel);
  env.registerSelector('[data-staff-actions="default"]', staffDefaultActions);
  env.registerSelector('[data-staff-actions="confirm"]', staffConfirmActions);
  env.registerSelector('[data-form="tree-ornament"]', treeForm);
  env.registerSelector('[data-final-review-status]', finalReviewStatus);
  env.registerSelector('[data-final-review-items]', finalReviewItems);
  env.registerSelector('[data-final-review-summary]', finalReviewSummary);
  env.registerSelector('[data-final-review-customer]', finalReviewCustomer);
  env.registerSelector('[data-final-review-delivery]', finalReviewDelivery);
  env.registerSelector('[data-payment-handoff-status]', paymentHandoffStatus);
  env.registerSelector('[data-payment-handoff-pin]', paymentHandoffPinInput);
  env.registerSelector('[data-payment-handoff-customer-name]', paymentHandoffCustomerName);
  env.registerSelector('[data-payment-handoff-summary]', paymentHandoffSummary);
  env.registerSelector('[data-payment-handoff-total]', paymentHandoffTotal);
  env.registerSelector('[data-payment-handoff-cancel-panel]', paymentHandoffCancelPanel);
  env.registerSelector('[data-thank-you-copy]', thankYouCopy);
  env.registerSelector('[data-thank-you-reference]', thankYouReference);
  env.registerSelector('[data-screen="ornaments"]', ornamentsScreen);
  env.registerSelector('[data-screen="final-review"]', finalReviewScreen);
  env.registerSelector('[data-screen="payment-handoff"]', paymentHandoffScreen);
  env.registerSelector('[data-screen="thank-you"]', thankYouScreen);
  env.registerSelector('[data-screen="staff-orders"]', staffOrdersScreen);
  env.registerSelector('[data-screen="ready-to-pack"]', readyToPackScreen);
  env.registerSelector('[data-screen="staff-admin"]', staffAdminScreen);
  env.registerSelector('[data-staff-orders-search]', staffOrdersSearch);
  env.registerSelector('[data-staff-orders-filters]', staffOrdersFilters);
  env.registerSelector('[data-staff-batch-groups]', staffBatchGroups);
  env.registerSelector('[data-staff-orders-list]', staffOrdersList);
  env.registerSelector('[data-staff-orders-status]', staffOrdersStatus);
  env.registerSelector('[data-staff-orders-lead]', staffOrdersLead);
  env.registerSelector('[data-ready-to-pack-lead]', readyToPackLead);
  env.registerSelector('[data-ready-to-pack-count]', readyToPackCount);
  env.registerSelector('[data-ready-to-pack-list]', readyToPackList);
  env.registerSelector('[data-staff-admin-lead]', staffAdminLead);
  env.registerSelector('[data-staff-admin-content]', staffAdminContent);
  env.registerSelector('[data-staff-demo-controls]', staffDemoControls);
  env.registerSelector('.app-shell', appShell);

  env.registerSelectorAll('[data-screen]', allScreens);
  env.registerSelectorAll('[data-payment-method]', paymentMethodButtons);
  env.registerSelectorAll('[data-category]', [ornamentCategoryButton]);
  env.registerSelectorAll('[data-action="back-categories"]', []);
  env.registerSelectorAll('[data-action="back-ornaments"]', []);
  env.registerSelectorAll('[data-action="view-current-order-utility"]', []);
  env.registerSelectorAll('[data-discard-panel]', []);
  env.registerSelectorAll('[data-debug-order-tools]', [thankYouDebugTools]);
  env.registerSelectorAll('[data-contact-choice]', []);
  env.registerSelectorAll('[data-fulfillment-choice]', []);
  env.registerSelectorAll('[data-staff-source-status], [data-ready-source-status]', []);
  env.registerSelectorAll('[data-staff-logout-button]', []);
  env.registerSelectorAll('[data-staff-eyebrow]', [staffEyebrowNode]);
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
    localStorage: {
      getItem(key) {
        return localStorageData.has(key) ? localStorageData.get(key) : null;
      },
      setItem(key, value) {
        localStorageData.set(String(key), String(value));
      },
      removeItem(key) {
        localStorageData.delete(String(key));
      },
      clear() {
        localStorageData.clear();
      }
    },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    navigator: {
      clipboard: { writeText: async () => {} },
      serviceWorker: { register: async () => ({}) }
    },
    location: {
      protocol,
      hostname,
      search: '',
      href: `${protocol}//${hostname}${protocol === 'http:' ? ':3016' : ''}/`
    },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    Event: function Event(type) { this.type = type; },
    Element: function Element() {},
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

  if (includeHostedStaffModules) {
    context.ForgeStaffApiClient = {
      createForgeStaffApiClient() {
        return {};
      }
    };
    context.ForgeStaffOrdersRuntime = {
      createStaffOrdersRuntime() {
        return {
          environment: {
            protocol,
            hostname,
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
              records: []
            };
          },
          async previewShippingExport() {
            return { ok: true, preview: null };
          },
          async buildShippingExportDownload() {
            return { ok: true, url: '/download.csv' };
          },
          async previewLegacyTestCleanup() {
            return { ok: true, preview: null };
          },
          async applyLegacyTestCleanup() {
            return { ok: true, deletedCount: 0 };
          }
        };
      }
    };
  }

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
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) {
        documentListeners.set(type, []);
      }
      documentListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!documentListeners.has(type)) {
        return;
      }
      documentListeners.set(type, documentListeners.get(type).filter((candidate) => candidate !== handler));
    },
    dispatchEvent(event) {
      const handlers = documentListeners.get(event.type) || [];
      handlers.forEach((handler) => handler.call(this, event));
      return true;
    }
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
    'public/js/forge-sync-status.js',
    'public/js/forge-order-submission.js',
    'public/js/forge-event-state.js',
    'public/js/forge-local-orders-queue.js',
    'public/js/app.js'
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  return {
    context,
    startButton,
    ornamentCategoryButton,
    staffButton,
    staffPanel,
    categoriesScreen,
    ornamentsScreen,
    finalReviewScreen,
    paymentHandoffScreen,
    placeOrderButton,
    paymentHandoffSubmitButton,
    paymentHandoffStatus,
    paymentHandoffPinInput,
    paymentHandoffCustomerName,
    paymentHandoffSummary,
    paymentHandoffTotal,
    paymentMethodButtons,
    localStorageData,
    finalReviewItems,
    finalReviewSummary,
    finalReviewCustomer,
    finalReviewDelivery,
    thankYouCopy,
    thankYouReference
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
  let completionButtons = [];
  let internalNoteSaveCallCount = 0;
  let cancelOrderCallCount = 0;
  let deleteTestOrderCallCount = 0;
  let cancelOrderError = null;
  let deleteTestOrderError = null;
  let sharedRecordDeleted = false;

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

      if (detailDialogHtml.includes('data-action="staff-complete-item"')) {
        const matches = [...detailDialogHtml.matchAll(/data-action="staff-complete-item"[\s\S]*?data-order-uuid="([^"]+)"[\s\S]*?data-line-id="([^"]+)"/g)];
        completionButtons = matches.map((match) => {
          const button = createElement('button');
          button.dataset.action = 'staff-complete-item';
          button.dataset.orderUuid = match[1];
          button.dataset.lineId = match[2];
          button.closest = (selector) => {
            if (selector === '[data-action]') {
              return button;
            }
            if (selector === '[data-order-uuid]') {
              return button;
            }
            if (selector === '[data-line-id]') {
              return button;
            }
            return null;
          };
          return button;
        });
      } else {
        completionButtons = [];
      }
    }
  });

  detailDialog.querySelector = (selector) => {
    if (selector === '[data-action="staff-open-tray-assignment"]') {
      return assignTrayButton;
    }
    if (selector === '[data-action="staff-complete-item"]') {
      return completionButtons[0] || null;
    }
    return null;
  };
  detailDialog.querySelectorAll = (selector) => {
    if (selector === '[data-action="staff-complete-item"]') {
      return completionButtons;
    }
    return [];
  };

  let trayLoadCount = 0;
  let completionCallCount = 0;
  const sharedRecord = {
    forge_order_uuid: 'shared-order-1',
    forge_order_number: 1001,
    payload: {
      forge_order_number: 1001,
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: [
        {
          line_id: 'shared-tree-line',
          line_number: 1,
          product_display_name: 'Tree Ornament',
          quantity: 1,
          completed_quantity: 0,
          production_status: 'pending',
          pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
          structured_attributes: { family_name: 'Hemenway', year: '2026' },
          configuration_snapshot: { familyName: 'Hemenway', year: 2026 },
          open_flags: []
        }
      ]
    },
    submitted_at: '2026-07-20T12:00:00Z',
    local_saved_at: '2026-07-20T12:01:00Z',
    received_at: '2026-07-20T12:01:00Z',
    sync_status: 'synced',
    production_status: 'submitted',
    current_tray_number: null,
    total_item_count: 1,
    completed_item_count: 0,
    staff_data_source: 'server',
    staff_read_only: true,
    staff_can_assign_tray: true,
    staff_can_complete_items: false
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
            records: sharedRecordDeleted ? [] : [structuredClone(sharedRecord)]
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
        },
        async completeItemQuantity(orderUuid, lineId) {
          completionCallCount += 1;
          assert.equal(orderUuid, 'shared-order-1');
          assert.equal(lineId, 'shared-tree-line');
          sharedRecord.production_status = 'ready_to_pack';
          sharedRecord.current_tray_number = 3;
          sharedRecord.completed_item_count = 1;
          sharedRecord.staff_can_assign_tray = false;
          sharedRecord.staff_can_complete_items = false;
          sharedRecord.ready_to_pack_at = '2026-07-20T12:10:00Z';
          sharedRecord.payload.items[0].completed_quantity = 1;
          sharedRecord.payload.items[0].production_status = 'complete';
          sharedRecord.payload.items[0].completed_at = '2026-07-20T12:10:00Z';
          return {
            ok: true,
            authenticated: true,
            dataSource: 'server',
            readOnly: true,
            alreadyApplied: false,
            order: structuredClone(sharedRecord),
            item: structuredClone(sharedRecord.payload.items[0])
          };
        },
        async updateInternalNote(orderUuid, internalNote) {
          internalNoteSaveCallCount += 1;
          assert.equal(orderUuid, 'shared-order-1');
          sharedRecord.internal_note = internalNote && String(internalNote).trim() !== '' ? internalNote : null;
          sharedRecord.has_internal_note = sharedRecord.internal_note !== null;
          sharedRecord.updated_at = '2026-07-20T12:12:00Z';
          return {
            ok: true,
            authenticated: true,
            dataSource: 'server',
            readOnly: true,
            internalNote: sharedRecord.internal_note,
            order: structuredClone(sharedRecord)
          };
        },
        async cancelOrder(orderUuid) {
          cancelOrderCallCount += 1;
          assert.equal(orderUuid, 'shared-order-1');
          if (cancelOrderError) {
            throw cancelOrderError;
          }
          sharedRecord.production_status = 'cancelled';
          sharedRecord.current_tray_number = null;
          sharedRecord.cancelled_at = '2026-07-20T12:15:00Z';
          sharedRecord.staff_can_assign_tray = false;
          sharedRecord.staff_can_complete_items = false;
          sharedRecord.ready_to_pack_at = null;
          return {
            ok: true,
            authenticated: true,
            dataSource: 'server',
            readOnly: true,
            order: structuredClone(sharedRecord),
            tray: {
              tray_number: 3,
              tray_status: 'available',
              current_order_uuid: null
            },
            assignmentHistory: {
              tray_assignment_id: 'assignment-shared-order-1',
              tray_number: 3,
              forge_order_uuid: 'shared-order-1',
              released_at: '2026-07-20T12:15:00Z',
              release_reason: 'cancelled'
            }
          };
        },
        async deleteTestOrder(orderUuid, confirmationText) {
          deleteTestOrderCallCount += 1;
          assert.equal(orderUuid, 'shared-order-1');
          assert.equal(confirmationText, 'DELETE TEST ORDER');
          if (deleteTestOrderError) {
            throw deleteTestOrderError;
          }
          sharedRecordDeleted = true;
          return {
            ok: true,
            authenticated: true,
            dataSource: 'server',
            readOnly: true,
            deletedOrderUuid: 'shared-order-1',
            deletedOrderNumber: sharedRecord.forge_order_number,
            releasedTrayNumber: sharedRecord.current_tray_number || null
          };
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
    'public/js/forge-sync-status.js',
    'public/js/forge-order-submission.js',
    'public/js/forge-event-state.js',
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
    getCompletionButton() {
      return completionButtons[0] || null;
    },
    getTrayLoadCount() {
      return trayLoadCount;
    },
    getCompletionCallCount() {
      return completionCallCount;
    },
    getInternalNoteSaveCallCount() {
      return internalNoteSaveCallCount;
    },
    getCancelOrderCallCount() {
      return cancelOrderCallCount;
    },
    getDeleteTestOrderCallCount() {
      return deleteTestOrderCallCount;
    },
    setSharedRecord(overrides) {
      Object.assign(sharedRecord, structuredClone(overrides));
      sharedRecordDeleted = false;
    },
    setCancelOrderError(error) {
      cancelOrderError = error;
    },
    setDeleteTestOrderError(error) {
      deleteTestOrderError = error;
    }
  };
}

function loadForgeStaffDemoApp({
  protocol = 'http:',
  hostname = 'localhost',
  initialOrders = []
} = {}) {
  const env = createQueryEnvironment();
  const appBody = createElement('body');
  const localStorageData = new Map();
  const documentListeners = new Map();
  const screens = [
    createElement('section'),
    createElement('section'),
    createElement('section'),
    createElement('section')
  ];
  screens[0].dataset.screen = 'welcome';
  screens[1].dataset.screen = 'categories';
  screens[2].dataset.screen = 'staff-orders';
  screens[3].dataset.screen = 'ready-to-pack';

  const startButton = attachActionDataset(createElement('button'), 'start');
  const staffButton = attachActionDataset(createElement('button'), 'staff');
  const staffPanel = createElement('div');
  staffPanel.hidden = true;
  const staffDefaultActions = createElement('div');
  const staffConfirmActions = createElement('div');
  const staffOrdersScreen = screens[2];
  const staffOrdersSummary = createElement('div');
  const staffOrdersSearch = createElement('input');
  const staffOrdersFilters = createElement('div');
  const staffBatchGroups = createElement('div');
  const staffOrdersList = createElement('div');
  const staffOrdersStatus = createElement('p');
  const staffOrdersLead = createElement('p');
  const readyLead = createElement('p');
  const readyCount = createElement('p');
  const readyList = createElement('div');
  const sourceStatus = createElement('span');
  const readySourceStatus = createElement('span');
  const demoLoadButton = attachActionDataset(createElement('button'), 'staff-load-demo-orders');
  const demoClearButton = attachActionDataset(createElement('button'), 'staff-clear-demo-orders');
  const demoControls = createElement('div');
  demoControls.hidden = true;
  demoControls.querySelector = (selector) => {
    if (selector === '[data-action="staff-load-demo-orders"]') {
      return demoLoadButton;
    }
    if (selector === '[data-action="staff-clear-demo-orders"]') {
      return demoClearButton;
    }
    return null;
  };
  const detailDialog = createElement('div');
  const detailBackdrop = createElement('div');

  let listOrdersCalls = 0;
  let fetchCalls = 0;
  let currentOrders = structuredClone(initialOrders);

  env.registerSelector('.app-shell', createElement('div'));
  env.registerSelector('[data-form="tree-ornament"]', createElement('form'));
  env.registerSelector('[data-staff-panel]', staffPanel);
  env.registerSelector('[data-staff-actions="default"]', staffDefaultActions);
  env.registerSelector('[data-staff-actions="confirm"]', staffConfirmActions);
  env.registerSelector('[data-screen="staff-orders"]', staffOrdersScreen);
  env.registerSelector('[data-screen="ready-to-pack"]', screens[3]);
  env.registerSelector('[data-staff-orders-summary]', staffOrdersSummary);
  env.registerSelector('[data-staff-orders-search]', staffOrdersSearch);
  env.registerSelector('[data-staff-orders-filters]', staffOrdersFilters);
  env.registerSelector('[data-staff-demo-controls]', demoControls);
  env.registerSelector('[data-staff-batch-groups]', staffBatchGroups);
  env.registerSelector('[data-staff-orders-list]', staffOrdersList);
  env.registerSelector('[data-staff-orders-status]', staffOrdersStatus);
  env.registerSelector('[data-staff-orders-lead]', staffOrdersLead);
  env.registerSelector('[data-ready-to-pack-lead]', readyLead);
  env.registerSelector('[data-ready-to-pack-count]', readyCount);
  env.registerSelector('[data-ready-to-pack-list]', readyList);
  env.registerSelector('[data-action="start"]', startButton);
  env.registerSelector('[data-action="staff"]', staffButton);
  env.registerSelector('[data-action="staff-load-demo-orders"]', demoLoadButton);
  env.registerSelector('[data-action="staff-clear-demo-orders"]', demoClearButton);
  env.registerSelector('[data-staff-order-detail-backdrop]', detailBackdrop);
  env.registerSelector('[data-staff-order-detail-dialog]', detailDialog);

  env.registerSelectorAll('[data-screen]', screens);
  env.registerSelectorAll('[data-payment-method]', []);
  env.registerSelectorAll('[data-contact-choice]', []);
  env.registerSelectorAll('[data-fulfillment-choice]', []);
  env.registerSelectorAll('[data-view-current-order-utility]', []);
  env.registerSelectorAll('[data-discard-panel]', []);
  env.registerSelectorAll('[data-debug-order-tools]', []);
  env.registerSelectorAll('[data-option-choice-field]', []);
  env.registerSelectorAll('[data-choice-field]', []);
  env.registerSelectorAll('[data-product]', []);
  env.registerSelectorAll('[data-staff-source-status], [data-ready-source-status]', [sourceStatus, readySourceStatus]);
  env.registerSelectorAll('[data-staff-logout-button]', []);

  appBody.insertAdjacentHTML = (_position, html) => {
    if (html.includes('data-staff-order-detail-backdrop')) {
      env.registerSelector('[data-staff-order-detail-backdrop]', detailBackdrop);
      env.registerSelector('[data-staff-order-detail-dialog]', detailDialog);
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
    fetch: async () => {
      fetchCalls += 1;
      return {
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
      };
    },
    crypto: {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174111',
      getRandomValues(array) {
        return array;
      }
    },
    localStorage: {
      getItem(key) {
        return localStorageData.has(key) ? localStorageData.get(key) : null;
      },
      setItem(key, value) {
        localStorageData.set(String(key), String(value));
      },
      removeItem(key) {
        localStorageData.delete(String(key));
      },
      clear() {
        localStorageData.clear();
      }
    },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {} },
    navigator: {
      clipboard: { writeText: async () => {} },
      serviceWorker: { register: async () => ({}) }
    },
    location: { protocol, hostname, search: '', href: `${protocol}//${hostname}/` },
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

  if (protocol === 'https:' && hostname === 'forge.thehilltopshop.com') {
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
              records: []
            };
          }
        };
      }
    };
  }

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
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) {
        documentListeners.set(type, []);
      }
      documentListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!documentListeners.has(type)) {
        return;
      }
      documentListeners.set(type, documentListeners.get(type).filter((candidate) => candidate !== handler));
    },
    dispatchEvent(event) {
      const handlers = documentListeners.get(event.type) || [];
      handlers.forEach((handler) => handler.call(this, event));
      return true;
    }
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
    'public/js/forge-sync-status.js',
    'public/js/forge-order-submission.js',
    'public/js/forge-event-state.js',
    'public/js/forge-local-orders-queue.js',
    'public/js/app.js'
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }

  context.__testListOrders = async () => {
    listOrdersCalls += 1;
    return structuredClone(currentOrders);
  };
  vm.runInContext('orderStore.listOrders = globalThis.__testListOrders;', context);

  return {
    context,
    demoControls,
    demoLoadButton,
    demoClearButton,
    staffOrdersList,
    readyList,
    detailDialog,
    getListOrdersCalls() {
      return listOrdersCalls;
    },
    getFetchCalls() {
      return fetchCalls;
    },
    setOrders(nextOrders) {
      currentOrders = structuredClone(nextOrders);
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

test('customer category hero continues into the existing ornaments flow', () => {
  const { context, startButton, ornamentCategoryButton, categoriesScreen, ornamentsScreen } = loadForgeAppWithoutStaffModules();

  startButton.click();
  assert.equal(categoriesScreen.classList.contains('active'), true);
  assert.equal(vm.runInContext('appState.currentScreen', context), 'categories');

  ornamentCategoryButton.click();
  assert.equal(ornamentsScreen.classList.contains('active'), true);
  assert.equal(vm.runInContext('appState.currentScreen', context), 'ornaments');
});

test('Review & Pay relabels the final review action and opening the payment handoff creates no submission context or completion receipt', () => {
  const {
    context,
    placeOrderButton,
    paymentHandoffCustomerName,
    paymentHandoffSummary,
    paymentHandoffTotal,
    localStorageData
  } = loadForgeAppWithoutStaffModules();

  context.__testValidateFinalReviewDraft = () => ({ isValid: true, issues: [] });
  context.__testGetOrderItems = () => [{ quantity: 1, displayName: 'Tree Ornament' }];
  context.__testGetCurrentOrderStats = () => ({ itemCount: 1, subtotal: 30 });
  vm.runInContext(`
    validateFinalReviewDraft = globalThis.__testValidateFinalReviewDraft;
    getOrderItems = globalThis.__testGetOrderItems;
    getCurrentOrderStats = globalThis.__testGetCurrentOrderStats;
    customerDraft.fullName = 'Kyle Hemenway';
    appState.currentScreen = 'final-review';
  `, context);

  context.openPaymentHandoff();

  assert.equal(placeOrderButton.textContent, 'Review & Pay');
  assert.equal(vm.runInContext('appState.currentScreen', context), 'payment-handoff');
  assert.equal(paymentHandoffCustomerName.textContent, 'Kyle Hemenway');
  assert.match(String(paymentHandoffSummary.innerHTML || ''), /Tree Ornament/);
  assert.equal(paymentHandoffTotal.textContent, '$30.00');
  assert.equal(localStorageData.has('forge-order-submission-context'), false);
  assert.equal(localStorageData.has('forge-order-completion-receipt'), false);
});

test('payment handoff requires a payment method before submit and leaves the draft unsaved', () => {
  const {
    context,
    placeOrderButton,
    paymentHandoffSubmitButton,
    paymentHandoffStatus,
    paymentHandoffPinInput,
    localStorageData
  } = loadForgeAppWithoutStaffModules();

  context.__testValidateFinalReviewDraft = () => ({ isValid: true, issues: [] });
  context.__testGetOrderItems = () => [{ quantity: 1, displayName: 'Tree Ornament' }];
  context.__testGetCurrentOrderStats = () => ({ itemCount: 1, subtotal: 3000 });
  context.__testVerifyStaffPaymentHandoff = async () => {
    throw new Error('verify should not be called');
  };
  context.__testSubmitCurrentOrder = async () => {
    throw new Error('submit should not be called');
  };
  vm.runInContext(`
    validateFinalReviewDraft = globalThis.__testValidateFinalReviewDraft;
    getOrderItems = globalThis.__testGetOrderItems;
    getCurrentOrderStats = globalThis.__testGetCurrentOrderStats;
    verifyStaffPaymentHandoff = globalThis.__testVerifyStaffPaymentHandoff;
    submitCurrentOrder = globalThis.__testSubmitCurrentOrder;
    customerDraft.fullName = 'Kyle Hemenway';
    appState.currentScreen = 'final-review';
  `, context);

  context.document.dispatchEvent({
    type: 'click',
    target: placeOrderButton,
    currentTarget: context.document,
    preventDefault() {},
    stopPropagation() {}
  });
  paymentHandoffPinInput.value = '2468';
  context.document.querySelector('[data-screen="payment-handoff"]').dispatchEvent({
    type: 'click',
    target: paymentHandoffSubmitButton,
    currentTarget: context.document.querySelector('[data-screen="payment-handoff"]'),
    preventDefault() {},
    stopPropagation() {}
  });

  assert.match(paymentHandoffStatus.textContent, /Select a payment method before continuing\./);
  assert.equal(localStorageData.has('forge-order-submission-context'), false);
  assert.equal(localStorageData.has('forge-order-completion-receipt'), false);
});

test('payment handoff authorization is tied to one order session and can be consumed only once', () => {
  const {
    context
  } = loadForgeAppWithoutStaffModules();

  context.grantPaymentSubmissionAuthorization('order-session-1', 'venmo', '2026-07-21T18:45:00.000Z');

  const wrongSession = context.consumePaymentSubmissionAuthorization('other-session');
  context.grantPaymentSubmissionAuthorization('order-session-1', 'venmo', '2026-07-21T18:45:00.000Z');
  const firstConsume = context.consumePaymentSubmissionAuthorization('order-session-1');
  const secondConsume = context.consumePaymentSubmissionAuthorization('order-session-1');

  assert.equal(wrongSession, null);
  assert.equal(JSON.stringify(firstConsume), JSON.stringify({
    externalPaymentMethod: 'venmo',
    paymentConfirmedAt: '2026-07-21T18:45:00.000Z'
  }));
  assert.equal(secondConsume, null);
});

test('no-token customer access keeps the Hilltop Shop kiosk copy tied to the current active event', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    window.location.search = '';
    customerEventState.orderingOpen = true;
    customerEventState.unavailable = false;
    customerEventState.availability = 'active';
    customerEventState.activeEvent = {
      event_id: 'event-kiosk',
      public_order_token: 'kiosk-token',
      event_name: 'Hilltop Holiday Market',
      event_type: 'live_event',
      event_start_date: '2026-11-10',
      event_end_date: '2026-11-12',
      event_location: 'Austin',
      event_status: 'active'
    };
  `, context);

  const headline = vm.runInContext('getCurrentOrderingHeadline()', context);

  assert.equal(headline.eyebrow, 'Ordering Open');
  assert.equal(headline.title, 'Hilltop Holiday Market');
  assert.equal(headline.copy, 'Custom ordering is open for the current Forge event.');
  assert.equal(headline.buttonDisabled, false);
});

test('a scheduled event token keeps customer ordering closed for that exact event link', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    window.location.search = '?event=scheduled-phone-token';
    customerEventState.orderingOpen = false;
    customerEventState.unavailable = false;
    customerEventState.availability = 'scheduled';
    customerEventState.activeEvent = {
      event_id: 'event-scheduled',
      public_order_token: 'scheduled-phone-token',
      event_name: 'Tomorrow Market',
      event_type: 'live_event',
      event_start_date: '2026-11-20',
      event_end_date: '2026-11-21',
      event_location: 'Austin',
      event_status: 'scheduled'
    };
  `, context);

  const headline = vm.runInContext('getCurrentOrderingHeadline()', context);

  assert.equal(headline.eyebrow, 'Event Scheduled');
  assert.equal(headline.title, 'Tomorrow Market');
  assert.match(headline.copy, /belongs to a scheduled event/);
  assert.equal(headline.buttonLabel, 'Ordering Closed');
  assert.equal(headline.buttonDisabled, true);
});

test('an ended event token remains closed and is not reopened by later events', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    window.location.search = '?event=ended-phone-token';
    customerEventState.orderingOpen = false;
    customerEventState.unavailable = false;
    customerEventState.availability = 'ended';
    customerEventState.activeEvent = {
      event_id: 'event-ended',
      public_order_token: 'ended-phone-token',
      event_name: 'Last Weekend Market',
      event_type: 'test_session',
      event_start_date: '2026-07-18',
      event_end_date: '2026-07-19',
      event_location: 'Austin',
      event_status: 'ended'
    };
  `, context);

  const headline = vm.runInContext('getCurrentOrderingHeadline()', context);

  assert.equal(headline.eyebrow, 'Test Session Ended');
  assert.equal(headline.title, 'Last Weekend Market');
  assert.match(headline.copy, /will not reopen when a later event starts/);
  assert.equal(headline.buttonDisabled, true);
});

test('an invalid event token never falls back to another active event', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    window.location.search = '?event=unknown-phone-token';
    customerEventState.orderingOpen = false;
    customerEventState.unavailable = false;
    customerEventState.availability = 'invalid_token';
    customerEventState.activeEvent = null;
  `, context);

  const headline = vm.runInContext('getCurrentOrderingHeadline()', context);

  assert.equal(headline.eyebrow, 'Event Not Available');
  assert.equal(headline.title, 'This ordering link is not active.');
  assert.match(headline.status, /will not reactivate this older link/);
  assert.equal(headline.buttonDisabled, true);
});

test('admin tools identify test-session links and expose the copy ordering link action while staff orders stays order-focused', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    staffEventState.events = [{
      event_id: 'event-test',
      public_order_token: 'test-session-public-token',
      event_name: 'Checkout Test Session',
      event_type: 'test_session',
      start_date: '2026-07-27',
      end_date: '2026-07-27',
      event_location: 'Austin',
      event_status: 'scheduled'
    }];
    renderStaffOrdersQueue();
    renderStaffAdminTools();
  `, context);

  const ordersHtml = vm.runInContext('document.querySelector("[data-staff-orders-list]").innerHTML', context);
  const controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);

  assert.doesNotMatch(String(ordersHtml), /Event Control|Forge System Status|Event Shipping CSV|Legacy Test Orders Before July 25/);
  assert.match(String(controlsHtml), /Checkout Test Session/);
  assert.match(String(controlsHtml), /TEST/);
  assert.match(String(controlsHtml), /Copy Ordering Link/);
  assert.match(String(controlsHtml), /\?event=test-session-public-token/);
  assert.match(String(controlsHtml), /Ending this event disables this exact link\./);
  assert.match(String(controlsHtml), /staff-panel-surface--admin-primary/);
  assert.match(String(controlsHtml), /staff-order-card-meta--event-card/);
  assert.match(String(controlsHtml), /staff-order-card-actions--event-card/);
});

test('admin tools render the shipping export preview workspace for the selected event', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    staffOrdersState.authenticated = true;
    staffOrdersState.records = [{
      forge_order_uuid: 'ship-1',
      forge_order_number: 1101,
      submitted_at: '2026-07-27T16:00:00Z',
      payload: {
        customer: { full_name: 'Shipping Customer', email: 'ship@example.com' },
        fulfillment: {
          method: 'shipping',
          shipping_address: {
            address_1: '123 Main Street',
            address_2: '',
            city: 'Austin',
            state: 'TX',
            postal_code: '78701',
            country: 'United States'
          }
        },
        event: {
          event_id: 'event-live-1',
          event_name: 'Austin Market',
          event_type: 'live_event',
          event_start_date: '2026-07-27',
          event_end_date: '2026-07-27',
          event_location: 'Austin'
        },
        items: [{ line_id: 'line-1', quantity: 1, product_display_name: 'Tree Ornament' }]
      }
    }];
    staffOrdersState.shippingExportSelectedEventId = 'event-live-1';
    staffOrdersState.shippingExportPreview = {
      event: {
        event_id: 'event-live-1',
        event_name: 'Austin Market',
        event_type: 'live_event',
        start_date: '2026-07-27',
        end_date: '2026-07-27',
        event_status: 'active'
      },
      includedCount: 1,
      excludedCount: 0,
      shippingOrderCount: 1,
      hasExportableRows: true,
      csvFilename: 'forge-shipping-export-austin-market-2026-07-27.csv',
      includedOrders: [{
        forge_order_uuid: 'ship-1',
        order_reference: 'Order 1101',
        customer_name: 'Shipping Customer',
        address_line_1: '123 Main Street',
        address_line_2: '',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        country: 'United States',
        item_count: 1,
        submitted_at: '2026-07-27T16:00:00Z',
        missing_fields: []
      }],
      excludedOrders: []
    };
    renderStaffAdminTools();
  `, context);

  const controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);

  assert.match(String(controlsHtml), /Forge System Status/);
  assert.match(String(controlsHtml), /staff-panel-surface--status/);
  assert.match(String(controlsHtml), /Event Control/);
  assert.match(String(controlsHtml), /staff-admin-tools-grid/);
  assert.match(String(controlsHtml), /Event Shipping CSV/);
  assert.match(String(controlsHtml), /Legacy Test Orders Before July 25/);
  assert.match(String(controlsHtml), /Preview Shipping Export/);
  assert.match(String(controlsHtml), /Download CSV/);
  assert.match(String(controlsHtml), /Order 1101/);
  assert.match(String(controlsHtml), /123 Main Street/);
  assert.match(String(controlsHtml), /data-action="staff-preview-legacy-cleanup"/);
  assert.match(String(controlsHtml), /data-action="staff-preview-shipping-export"/);
});

test('admin tools status strip keeps metrics and actions in separate containers', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    staffOrdersState.authenticated = true;
    syncStatusState.snapshot = {
      label: 'Synced',
      supportingText: 'Forge is reachable and orders are acknowledged.',
      serverLabel: 'Reachable',
      pendingUploadCount: 2,
      uploadProblemCount: 1,
      lastSuccessfulSyncAt: '2026-07-28T15:30:00Z',
      isRetryingUploads: false,
      isRecheckingConnection: false,
      isChecking: false,
      serverState: forgeSyncStatus.SERVER_STATES.connected
    };
    renderStaffAdminTools();
  `, context);

  const controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);

  assert.match(String(controlsHtml), /staff-admin-status-strip/);
  assert.match(String(controlsHtml), /staff-admin-status-metrics/);
  assert.match(String(controlsHtml), /data-staff-status-actions-row/);
  assert.match(String(controlsHtml), /data-staff-status-actions/);
  assert.match(String(controlsHtml), /Forge Server/);
  assert.match(String(controlsHtml), /Pending Uploads/);
  assert.match(String(controlsHtml), /Upload Problems/);
  assert.match(String(controlsHtml), /Last Successful Sync/);
  const statusHtml = String(controlsHtml);
  const metricsIndex = statusHtml.indexOf('staff-admin-status-metrics');
  const actionsRowIndex = statusHtml.indexOf('data-staff-status-actions-row');
  const actionsIndex = statusHtml.indexOf('data-staff-status-actions>', actionsRowIndex + 1);
  assert.notEqual(metricsIndex, -1);
  assert.notEqual(actionsRowIndex, -1);
  assert.notEqual(actionsIndex, -1);
  assert.ok(actionsRowIndex > metricsIndex);
  assert.ok(actionsIndex > actionsRowIndex);
});

test('admin tools localhost preview keeps hosted admin actions disabled with a compact notice', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    staffOrdersState.dataSource = 'local';
    staffOrdersState.authenticated = false;
    syncStatusState.snapshot = {
      label: 'Server Unavailable',
      supportingText: 'The Forge staff server returned an unexpected response.',
      serverLabel: 'Unavailable',
      pendingUploadCount: 0,
      uploadProblemCount: 0,
      lastSuccessfulSyncAt: null,
      isRetryingUploads: false,
      isRecheckingConnection: false,
      isChecking: false,
      serverState: forgeSyncStatus.SERVER_STATES.unreachable
    };
    staffEventState.events = [{
      event_id: 'event-test',
      public_order_token: 'test-session-public-token',
      event_name: 'Checkout Test Session',
      event_type: 'test_session',
      start_date: '2026-07-27',
      end_date: '2026-07-27',
      event_location: 'Austin',
      event_status: 'scheduled'
    }];
    renderStaffAdminTools();
  `, context);

  const controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);

  assert.match(String(controlsHtml), /Local Preview Only/);
  assert.match(String(controlsHtml), /authenticated live staff workspace/);
  assert.match(String(controlsHtml), /data-action="staff-recheck-connection" disabled/);
  assert.match(String(controlsHtml), /data-action="staff-retry-uploads" disabled/);
  assert.match(String(controlsHtml), /data-action="staff-toggle-event-form" disabled/);
  assert.match(String(controlsHtml), /data-action="staff-preview-shipping-export" disabled/);
  assert.match(String(controlsHtml), /data-action="staff-preview-legacy-cleanup" disabled/);
  assert.match(String(controlsHtml), /data-action="staff-start-event"[^>]*disabled/);
  assert.doesNotMatch(String(controlsHtml), /unexpected response/i);
});

test('localhost hosted-only admin actions do not invoke runtime or api methods', async () => {
  const { context } = loadForgeAppWithoutStaffModules({
    includeHostedStaffModules: true
  });

  const counts = await vm.runInContext(`
    (async () => {
      staffOrdersState.dataSource = 'local';
      staffOrdersState.authenticated = false;
      staffOrdersState.shippingExportSelectedEventId = 'event-live-1';
      staffEventState.events = [{
        event_id: 'event-test',
        public_order_token: 'test-session-public-token',
        event_name: 'Checkout Test Session',
        event_type: 'test_session',
        start_date: '2026-07-27',
        end_date: '2026-07-27',
        event_location: 'Austin',
        event_status: 'scheduled'
      }];
      const counters = {
        recheck: 0,
        retry: 0,
        listEvents: 0,
        createEvent: 0,
        startEvent: 0,
        endEvent: 0,
        previewShipping: 0,
        downloadShipping: 0,
        previewCleanup: 0,
        applyCleanup: 0
      };
      syncStatusController.recheckConnection = async () => { counters.recheck += 1; return {}; };
      syncStatusController.retryUploads = async () => { counters.retry += 1; return {}; };
      staffApiClient.listEvents = async () => { counters.listEvents += 1; return { ok: true, events: [] }; };
      staffApiClient.createEvent = async () => { counters.createEvent += 1; return { ok: true, event: {} }; };
      staffApiClient.startEvent = async () => { counters.startEvent += 1; return { ok: true, event: {} }; };
      staffApiClient.endEvent = async () => { counters.endEvent += 1; return { ok: true, event: {} }; };
      staffRuntime.previewShippingExport = async () => { counters.previewShipping += 1; return { ok: true, preview: null }; };
      staffRuntime.buildShippingExportDownload = async () => { counters.downloadShipping += 1; };
      staffRuntime.previewLegacyTestCleanup = async () => { counters.previewCleanup += 1; return { ok: true, preview: null }; };
      staffRuntime.applyLegacyTestCleanup = async () => { counters.applyCleanup += 1; return { ok: true, deletedCount: 0 }; };
      await recheckStaffAdminConnection();
      await retryStaffAdminUploads();
      await loadStaffEvents();
      await submitStaffEventForm();
      await startStaffEvent('event-test');
      await endStaffEvent('event-test');
      await previewStaffShippingExport();
      await previewLegacyTestCleanup();
      return counters;
    })()
  `, context);

  assert.deepEqual(JSON.parse(JSON.stringify(counts)), {
    recheck: 0,
    retry: 0,
    listEvents: 0,
    createEvent: 0,
    startEvent: 0,
    endEvent: 0,
    previewShipping: 0,
    downloadShipping: 0,
    previewCleanup: 0,
    applyCleanup: 0
  });
});

test('hosted authenticated admin actions remain enabled', () => {
  const { context } = loadForgeAppWithoutStaffModules({
    protocol: 'https:',
    hostname: 'forge.thehilltopshop.com',
    includeHostedStaffModules: true
  });

  vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    staffOrdersState.authenticated = true;
    staffApiClient.listEvents = async () => ({ ok: true, events: [] });
    staffApiClient.createEvent = async () => ({ ok: true, event: {} });
    staffApiClient.startEvent = async () => ({ ok: true, event: {} });
    staffApiClient.endEvent = async () => ({ ok: true, event: {} });
    staffRuntime.previewShippingExport = async () => ({ ok: true, preview: null });
    staffRuntime.buildShippingExportDownload = async () => ({ ok: true, url: '/download.csv' });
    staffRuntime.previewLegacyTestCleanup = async () => ({ ok: true, preview: null });
    staffRuntime.applyLegacyTestCleanup = async () => ({ ok: true, deletedCount: 0 });
    syncStatusState.snapshot = {
      label: 'Synced',
      supportingText: 'Forge is reachable and orders are acknowledged.',
      serverLabel: 'Reachable',
      pendingUploadCount: 2,
      uploadProblemCount: 1,
      lastSuccessfulSyncAt: '2026-07-28T15:30:00Z',
      isRetryingUploads: false,
      isRecheckingConnection: false,
      isChecking: false,
      serverState: forgeSyncStatus.SERVER_STATES.connected
    };
    staffEventState.events = [{
      event_id: 'event-test',
      public_order_token: 'test-session-public-token',
      event_name: 'Checkout Test Session',
      event_type: 'test_session',
      start_date: '2026-07-27',
      end_date: '2026-07-27',
      event_location: 'Austin',
      event_status: 'scheduled'
    }];
    staffOrdersState.shippingExportSelectedEventId = 'event-test';
    renderStaffAdminTools();
  `, context);

  const controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);

  assert.doesNotMatch(String(controlsHtml), /data-action="staff-recheck-connection" disabled/);
  assert.doesNotMatch(String(controlsHtml), /data-action="staff-retry-uploads" disabled/);
  assert.doesNotMatch(String(controlsHtml), /data-action="staff-toggle-event-form" disabled/);
  assert.doesNotMatch(String(controlsHtml), /data-action="staff-start-event"[^>]*disabled/);
  assert.doesNotMatch(String(controlsHtml), /data-action="staff-preview-shipping-export" disabled/);
  assert.doesNotMatch(String(controlsHtml), /data-action="staff-preview-legacy-cleanup" disabled/);
});

test('staff orders shows only the primary filters until More Filters is opened', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    staffOrdersState.enabled = true;
    staffOrdersState.records = [{
      forge_order_uuid: 'order-1',
      submitted_at: '2026-07-27T16:00:00Z',
      payload: {
        customer: { full_name: 'Filter Customer' },
        fulfillment: { method: 'shipping', shipping_address: null },
        event: { event_id: 'event-live-1', event_name: 'Austin Market', event_type: 'live_event' },
        items: [{ line_id: 'line-1', quantity: 1, product_type: 'tree_ornament', product_display_name: 'Tree Ornament' }],
        forge_order_number: 1101
      }
    }];
    staffOrdersState.showMoreFilters = false;
    renderStaffOrdersQueue();
  `, context);

  const compactFiltersHtml = vm.runInContext('document.querySelector("[data-staff-orders-filters]").innerHTML', context);
  const moreFiltersHidden = vm.runInContext(`
    document.querySelector('[data-staff-orders-filters]')
      .innerHTML.includes('class="staff-orders-filters-more" hidden')
  `, context);
  assert.match(String(compactFiltersHtml), /Scope/);
  assert.match(String(compactFiltersHtml), /Event/);
  assert.match(String(compactFiltersHtml), /Production Status/);
  assert.equal(moreFiltersHidden, true);

  vm.runInContext('staffOrdersState.showMoreFilters = true; renderStaffOrdersQueue();', context);
  const expandedFiltersHtml = vm.runInContext('document.querySelector("[data-staff-orders-filters]").innerHTML', context);
  const expandedMoreFiltersHidden = vm.runInContext(`
    document.querySelector('[data-staff-orders-filters]')
      .innerHTML.includes('class="staff-orders-filters-more" hidden')
  `, context);
  assert.match(String(expandedFiltersHtml), /Ornament Type/);
  assert.match(String(expandedFiltersHtml), /Sync Status/);
  assert.equal(expandedMoreFiltersHidden, false);
});

test('staff source eyebrow uses Forge Staff for hosted mode and Development Only for localhost', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  assert.equal(vm.runInContext('staffOrdersState.dataSource = "server"; getStaffEnvironmentEyebrow();', context), 'Forge Staff');
  assert.equal(vm.runInContext('staffOrdersState.dataSource = "local"; getStaffEnvironmentEyebrow();', context), 'Development Only');
});

test('shared server order detail assign tray button opens the tray picker after re-rendering', async () => {
  const { context, detailDialog, trayDialog, getAssignTrayButton, getTrayLoadCount } = loadForgeHostedStaffAppForTrayDetail();

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  assert.match(String(detailDialog.innerHTML || ''), /Order 1001/);
  assert.match(String(detailDialog.innerHTML || ''), /System Details/);
  assert.match(String(detailDialog.innerHTML || ''), /shared-order-1/);

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

test('shared server order detail completion button binds to the rendered button and saves one hosted piece exactly once', async () => {
  const {
    context,
    detailDialog,
    getCompletionButton,
    getCompletionCallCount,
    setSharedRecord
  } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    production_status: 'tray_assigned',
    current_tray_number: 3,
    staff_can_assign_tray: false,
    staff_can_complete_items: true
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  let completionButton = getCompletionButton();
  assert.ok(completionButton);
  assert.equal(completionButton.dataset.completionHandlerBound, 'true');
  assert.equal(typeof completionButton.onclick, 'function');
  completionButton.dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(String(detailDialog.innerHTML || ''), /Saving\.\.\./);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getCompletionCallCount(), 1);
  assert.match(String(detailDialog.innerHTML || ''), /Item completion saved\./);
  assert.match(String(detailDialog.innerHTML || ''), /1 of 1 Complete/);

  await context.openStaffOrderDetail('shared-order-1');
  completionButton = getCompletionButton();
  assert.equal(completionButton, null);
});

test('shared server order detail renders the internal notes section and note badge when a note exists', async () => {
  const { context, detailDialog, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    internal_note: 'Customer confirmed spelling.\nPaid cash at show.',
    has_internal_note: true
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  assert.match(String(detailDialog.innerHTML || ''), /Internal Notes/);
  assert.match(String(detailDialog.innerHTML || ''), /Customer confirmed spelling\./);
  assert.match(String(detailDialog.innerHTML || ''), /Paid cash at show\./);
  assert.match(String(detailDialog.innerHTML || ''), />NOTE</);
});

test('shared server shipping orders show the copy shipping address action in order detail', async () => {
  const { context, detailDialog, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    payload: {
      customer: { full_name: 'Kyle Hemenway', email: 'kyle@example.com', phone: '555-111-2222' },
      fulfillment: {
        method: 'shipping',
        shipping_address: {
          address_1: '123 Main Street',
          address_2: '',
          city: 'Austin',
          state: 'TX',
          postal_code: '78701',
          country: 'United States'
        }
      },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-live-1', event_name: 'Austin Market', event_type: 'live_event' },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  assert.match(String(detailDialog.innerHTML || ''), /Copy Shipping Address/);
  assert.match(String(detailDialog.innerHTML || ''), /123 Main Street/);
});

test('shared server pickup orders do not show the copy shipping address action in order detail', async () => {
  const { context, detailDialog, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    payload: {
      customer: { full_name: 'Pickup Customer', email: 'pickup@example.com', phone: '555-111-2222' },
      fulfillment: { method: 'pickup', shipping_address: null },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-live-1', event_name: 'Austin Market', event_type: 'live_event' },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /Copy Shipping Address/);
});

test('shared server order detail renders cancel-order confirmation with the stored order context', async () => {
  const { context, detailDialog, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    production_status: 'tray_assigned',
    current_tray_number: 3,
    payload: {
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-live-1', event_name: 'Austin Market', event_type: 'live_event' },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  vm.runInContext('staffOrdersState.detailDestructiveAction = "cancel_order"; renderStaffOrderDetail();', context);

  assert.match(String(detailDialog.innerHTML || ''), /Cancel Order/);
  assert.match(String(detailDialog.innerHTML || ''), /Order 1001/);
  assert.match(String(detailDialog.innerHTML || ''), /Kyle Hemenway/);
  assert.match(String(detailDialog.innerHTML || ''), /Tray 3/);
  assert.match(String(detailDialog.innerHTML || ''), /active production stops/);
});

test('shared server cancellation updates the detail view with a CANCELLED badge and disables active-production controls', async () => {
  const {
    context,
    detailDialog,
    getCancelOrderCallCount,
    setSharedRecord
  } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    production_status: 'tray_assigned',
    current_tray_number: 3,
    staff_can_assign_tray: false,
    staff_can_complete_items: true,
    payload: {
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-live-1', event_name: 'Austin Market', event_type: 'live_event' },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  await context.submitStaffOrderCancellation('shared-order-1');

  assert.equal(getCancelOrderCallCount(), 1);
  assert.match(String(detailDialog.innerHTML || ''), /Cancelled/);
  assert.match(String(detailDialog.innerHTML || ''), /Tray assignment, item completion, packing, and Ready-to-Pack progression are disabled/);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /Assign Tray/);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /staff-complete-item/);
});

test('shared server cancellation failures stay in the dialog and never claim success', async () => {
  const { context, detailDialog, setCancelOrderError } = loadForgeHostedStaffAppForTrayDetail();

  setCancelOrderError(new Error('Order cancellation is currently unavailable.'));

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  await context.submitStaffOrderCancellation('shared-order-1');

  assert.match(String(detailDialog.innerHTML || ''), /Order cancellation is currently unavailable\./);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /cancelled\./i);
});

test('shared server Test Session orders render typed delete confirmation and hide cancel-order controls', async () => {
  const { context, detailDialog, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    current_tray_number: 8,
    payload: {
      customer: { full_name: 'Test Customer' },
      fulfillment: { method: 'shipping' },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-test-1', event_name: 'Checkout Test Session', event_type: 'test_session' },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  vm.runInContext('staffOrdersState.detailDestructiveAction = "delete_test_order"; staffOrdersState.detailDestructiveConfirmationText = "DELETE TEST ORDER"; renderStaffOrderDetail();', context);

  assert.match(String(detailDialog.innerHTML || ''), /Delete Test Order/);
  assert.match(String(detailDialog.innerHTML || ''), /TEST/);
  assert.match(String(detailDialog.innerHTML || ''), /Checkout Test Session/);
  assert.match(String(detailDialog.innerHTML || ''), /DELETE TEST ORDER/);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /Confirm Cancel Order/);
});

test('shared server Test Session deletion closes the detail dialog and refreshes the queue', async () => {
  const {
    context,
    detailDialog,
    getDeleteTestOrderCallCount,
    setSharedRecord
  } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    current_tray_number: 8,
    payload: {
      customer: { full_name: 'Test Customer' },
      fulfillment: { method: 'shipping' },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-test-1', event_name: 'Checkout Test Session', event_type: 'test_session' },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  vm.runInContext('staffOrdersState.detailDestructiveAction = "delete_test_order"; staffOrdersState.detailDestructiveConfirmationText = "DELETE TEST ORDER";', context);
  await context.submitStaffDeleteTestOrder('shared-order-1');

  assert.equal(getDeleteTestOrderCallCount(), 1);
  assert.equal(detailDialog.hidden, true);

  await context.openStaffOrderDetail('shared-order-1');
  assert.match(String(detailDialog.innerHTML || ''), /could not be found/i);
});

test('shared server Test Session deletion failures stay in the dialog and never claim success', async () => {
  const { context, detailDialog, setSharedRecord, setDeleteTestOrderError } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    current_tray_number: 8,
    payload: {
      customer: { full_name: 'Test Customer' },
      fulfillment: { method: 'shipping' },
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
      event: { event_id: 'event-test-1', event_name: 'Checkout Test Session', event_type: 'test_session' },
      forge_order_number: 1001
    }
  });
  setDeleteTestOrderError(new Error('Test order deletion is currently unavailable.'));

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  vm.runInContext('staffOrdersState.detailDestructiveAction = "delete_test_order"; staffOrdersState.detailDestructiveConfirmationText = "DELETE TEST ORDER";', context);
  await context.submitStaffDeleteTestOrder('shared-order-1');

  assert.match(String(detailDialog.innerHTML || ''), /Test order deletion is currently unavailable\./);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /deleted from this Test Session/i);
});

test('shared server internal note save updates the note without leaving the order detail', async () => {
  const { context, detailDialog, getInternalNoteSaveCallCount, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    internal_note: null,
    has_internal_note: false
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  vm.runInContext(`
    staffOrdersState.detailInternalNoteDraft = 'Customer confirmed spelling.\\nCall before shipping.';
  `, context);
  await context.submitStaffInternalNote('shared-order-1');

  assert.equal(getInternalNoteSaveCallCount(), 1);
  assert.match(String(detailDialog.innerHTML || ''), /Internal note saved\./);
  assert.match(String(detailDialog.innerHTML || ''), /Customer confirmed spelling\./);
  assert.match(String(detailDialog.innerHTML || ''), /Call before shipping\./);
  assert.match(String(detailDialog.innerHTML || ''), /Close/);
});

test('customer final review and thank-you screens never render private internal notes', async () => {
  const {
    context,
    finalReviewItems,
    finalReviewCustomer,
    finalReviewDelivery,
    thankYouCopy,
    thankYouReference
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    customerDraft.fullName = 'Kyle Hemenway';
    customerDraft.email = 'kyle@example.com';
    customerDraft.phone = '(303) 507-1567';
    customerDraft.preferredContact = 'Text';
    customerDraft.fulfillmentMethod = 'Shipping';
    customerDraft.addressLine1 = '123 Main Street';
    customerDraft.city = 'Denver';
    customerDraft.state = 'CO';
    customerDraft.postalCode = '80202';
    customerDraft.country = 'United States';
    customerDraft.neededBy = '2026-12-01';
    saveOrderItems([{
      itemId: 'item-1',
      line_id: 'line-1',
      displayName: 'Tree Ornament',
      quantity: 1,
      unitPrice: 30,
      internal_note: 'Paid cash at show.',
      configurationSnapshot: {
        size: 'Large',
        treeColor: 'Green',
        bowColor: 'Red',
        familyName: 'Hemenway',
        year: '2026'
      },
      orderedEntries: []
    }]);
    renderFinalReview();
    appState.lastSubmittedOrderUuid = '123e4567-e89b-42d3-a456-426614174099';
    orderStore.getOrder = async () => ({
      forge_order_uuid: '123e4567-e89b-42d3-a456-426614174099',
      forge_order_number: 1042,
      server_upload_status: 'stored',
      server_received_at: '2026-07-27T18:05:00.000Z',
      server_payload_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      server_created: true,
      internal_note: 'Paid cash at show.',
      payload: {
        customer: {
          full_name: 'Kyle Hemenway'
        }
      }
    });
  `, context);

  assert.doesNotMatch(String(finalReviewItems.innerHTML || ''), /Paid cash at show\./);
  assert.doesNotMatch(String(finalReviewCustomer.innerHTML || ''), /Paid cash at show\./);
  assert.doesNotMatch(String(finalReviewDelivery.innerHTML || ''), /Paid cash at show\./);

  await context.renderThankYouScreen();

  assert.equal(thankYouCopy.textContent, 'Kyle Hemenway was saved and synced with Forge.');
  assert.match(String(thankYouReference.innerHTML || ''), /Order Reference/);
  assert.doesNotMatch(String(thankYouCopy.textContent || ''), /Paid cash at show\./);
  assert.doesNotMatch(String(thankYouReference.innerHTML || ''), /Paid cash at show\./);
});

test('thank-you screen explains offline local save without claiming a server upload', async () => {
  const { context, thankYouCopy } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    appState.lastSubmittedOrderUuid = 'offline-order-1';
    orderStore.getOrder = async () => ({
      forge_order_uuid: 'offline-order-1',
      payload: {
        customer: {
          full_name: 'Meagan'
        }
      }
    });
  `, context);

  await context.renderThankYouScreen();

  assert.equal(thankYouCopy.textContent, 'Meagan was safely saved on this iPad and will upload when Forge reconnects.');
});

test('thank-you screen explains upload problems without exposing technical details', async () => {
  const { context, thankYouCopy } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    appState.lastSubmittedOrderUuid = 'problem-order-1';
    orderStore.getOrder = async () => ({
      forge_order_uuid: 'problem-order-1',
      server_upload_status: 'failed',
      server_upload_attempt_count: 4,
      last_server_upload_error: {
        code: 'invalid_order',
        message: 'The Forge order payload was rejected by the server.'
      },
      payload: {
        customer: {
          full_name: 'Meagan'
        }
      }
    });
  `, context);

  await context.renderThankYouScreen();

  assert.equal(thankYouCopy.textContent, 'Meagan was saved, but it needs staff attention before Forge can finish the upload.');
  assert.doesNotMatch(String(thankYouCopy.textContent || ''), /invalid_order|stack|sql|WooCommerce/i);
});

test('localhost staff demo controls are available and hosted https keeps them unavailable', async () => {
  const localHarness = loadForgeStaffDemoApp({ hostname: 'localhost' });
  await localHarness.context.openStaffAccessScreen('staff-orders');

  assert.equal(localHarness.demoControls.hidden, false);
  assert.equal(localHarness.demoLoadButton.disabled, false);
  assert.equal(localHarness.demoClearButton.disabled, true);

  const hostedHarness = loadForgeStaffDemoApp({
    protocol: 'https:',
    hostname: 'forge.thehilltopshop.com'
  });
  await hostedHarness.context.openStaffAccessScreen('staff-orders');

  assert.equal(hostedHarness.demoControls.hidden, true);
  assert.equal(await hostedHarness.context.loadStaffDemoOrdersForVisualQa(), false);
});

test('loading localhost demo orders performs no IndexedDB reads or API calls and clearing restores the normal local queue', async () => {
  const harness = loadForgeStaffDemoApp({ hostname: 'localhost', initialOrders: [] });
  await harness.context.openStaffAccessScreen('staff-orders');

  assert.equal(harness.getListOrdersCalls(), 1);
  assert.equal(harness.getFetchCalls(), 0);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /No orders match these filters/);

  assert.equal(harness.context.loadStaffDemoOrdersForVisualQa(), true);
  assert.equal(harness.getListOrdersCalls(), 1);
  assert.equal(harness.getFetchCalls(), 0);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /Sarah Williams/);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /NO TRAY ASSIGNED/);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /Ready to Pack/);
  assert.equal(harness.demoLoadButton.disabled, true);
  assert.equal(harness.demoClearButton.disabled, false);

  await harness.context.clearStaffDemoOrdersForVisualQa();
  assert.equal(harness.getListOrdersCalls(), 2);
  assert.equal(harness.getFetchCalls(), 0);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /No orders match these filters/);
  assert.equal(harness.demoLoadButton.disabled, false);
  assert.equal(harness.demoClearButton.disabled, true);
});

test('localhost demo orders use the normal queue and detail rendering path', async () => {
  const harness = loadForgeStaffDemoApp({ hostname: '127.0.0.1', initialOrders: [] });
  await harness.context.openStaffAccessScreen('staff-orders');

  harness.context.loadStaffDemoOrdersForVisualQa();

  assert.match(String(harness.staffOrdersList.innerHTML || ''), /Michael Thompson/);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /TRAY 5/);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /Blocked/);
  assert.match(String(harness.staffOrdersList.innerHTML || ''), /Open Flags/);
  assert.match(String(harness.readyList.innerHTML || ''), /David Anderson/);

  await harness.context.openStaffOrderDetail('demo-order-jessica-005');
  assert.match(String(harness.detailDialog.innerHTML || ''), /Jessica Martinez/);
  assert.match(String(harness.detailDialog.innerHTML || ''), /Missing personalization/);

  await harness.context.openStaffOrderDetail('demo-order-sarah-001');
  assert.match(String(harness.detailDialog.innerHTML || ''), /Sarah Williams/);
  assert.match(String(harness.detailDialog.innerHTML || ''), /Family Tree Ornament/);
  assert.match(String(harness.detailDialog.innerHTML || ''), /0 of 3 Complete/);
  assert.match(String(harness.detailDialog.innerHTML || ''), /Shipping/);
});

test('staff orders remains the default protected destination and the catalog shell is staff-only', () => {
  const removedDashboardScreenToken = 'staff-' + 'dashboard';
  const removedDashboardActionToken = 'staff-open-' + 'dashboard';
  assert.equal(indexSource.includes(`data-screen="${removedDashboardScreenToken}"`), false);
  assert.equal(indexSource.includes(`data-action="${removedDashboardActionToken}"`), false);
  assert.match(indexSource, /data-screen="staff-admin"/);
  assert.match(indexSource, /data-screen="staff-catalog"/);
  assert.match(indexSource, /Hilltop Design Catalog/);
  assert.match(indexSource, /Admin Tools/);
  assert.match(indexSource, /data-screen="staff-orders"[\s\S]*?data-action="staff-open-catalog">Hilltop Design Catalog<\/button>/);
  assert.match(indexSource, /data-screen="staff-orders"[\s\S]*?data-action="staff-open-admin">Admin Tools<\/button>/);
  assert.match(indexSource, /data-screen="staff-catalog"[\s\S]*?data-action="staff-open-orders">Staff Orders<\/button>/);
  assert.match(indexSource, /data-screen="staff-admin"[\s\S]*?data-action="staff-open-orders">Staff Orders<\/button>/);
  assert.match(indexSource, /data-action="staff-toggle-more-filters"[^>]*>More Filters<\/button>/);
  assert.match(indexSource, />Designs<\/button>/);
  assert.match(indexSource, />Hats<\/button>/);
  assert.match(indexSource, />Materials<\/button>/);
  assert.match(indexSource, />Finished Hats<\/button>/);
  assert.match(indexSource, />Shortlist<\/button>/);
  assert.match(
    indexSource,
    /<script src="js\/forge-staff-api-client\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-catalog-ordering\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-catalog-image-viewer\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-design-catalog-api\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-design-catalog\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-hat-catalog-api\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-hat-catalog\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-material-catalog-api\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-material-catalog\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-finished-hat-catalog-api\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-finished-hat-catalog\.js\?v=20260727-36"><\/script>\s*<script src="js\/forge-staff-orders-runtime\.js\?v=20260727-36"><\/script>/
  );
  assert.doesNotMatch(indexSource, /data-category="staff-catalog"/);
});
