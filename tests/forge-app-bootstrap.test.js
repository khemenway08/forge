const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const indexSource = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');
const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');
const BUILD_VERSION = '20260730-48';

function extractScreenMarkup(screenId) {
  const match = indexSource.match(new RegExp(`<section class="screen[\\s\\S]*?data-screen="${screenId}"[\\s\\S]*?<\\/section>`));
  return match ? match[0] : '';
}

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
    select() {},
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
  const finalReviewActionsCard = createElement('div');
  const finalReviewCancelPanel = createElement('div');
  finalReviewCancelPanel.hidden = true;
  const finalReviewStatus = createElement('p');
  const entryList = createElement('ol');
  const capacityMessage = createElement('p');
  const addPersonButton = attachActionDataset(createElement('button'), 'add-person');
  const addPetButton = attachActionDataset(createElement('button'), 'add-pet');
  const addPersonInput = createElement('input');
  const addPersonError = createElement('p');
  const pendingPetControls = createElement('div');
  pendingPetControls.hidden = true;
  const pendingPetIconSelect = createElement('select');
  const pendingPetCustomGroup = createElement('div');
  pendingPetCustomGroup.hidden = true;
  const pendingPetCustomInput = createElement('input');
  const pendingPetCustomActions = createElement('div');
  pendingPetCustomActions.hidden = true;
  const cancelPetButton = attachActionDataset(createElement('button'), 'cancel-pet-entry');
  const confirmPetCustomButton = attachActionDataset(createElement('button'), 'confirm-pet-custom');
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
  let staffAdminContentHtml = '';
  let legacyCleanupConfirmationInput = null;
  let legacyCleanupApplyButton = null;
  let legacyCleanupPreviewButton = null;
  let legacyCleanupFeedback = null;
  let staffAdminRenderCount = 0;
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
  env.registerSelector('[data-entry-list]', entryList);
  env.registerSelector('[data-capacity-message]', capacityMessage);
  env.registerSelector('[data-action="add-person"]', addPersonButton);
  env.registerSelector('[data-action="add-pet"]', addPetButton);
  env.registerSelector('[data-add-person-input]', addPersonInput);
  env.registerSelector('[data-entry-add-error]', addPersonError);
  env.registerSelector('[data-pending-pet-controls]', pendingPetControls);
  env.registerSelector('[data-pending-pet-icon]', pendingPetIconSelect);
  env.registerSelector('[data-pending-pet-custom-group]', pendingPetCustomGroup);
  env.registerSelector('[data-pending-pet-custom]', pendingPetCustomInput);
  env.registerSelector('[data-pending-pet-custom-actions]', pendingPetCustomActions);
  env.registerSelector('[data-action="cancel-pet-entry"]', cancelPetButton);
  env.registerSelector('[data-action="confirm-pet-custom"]', confirmPetCustomButton);
  env.registerSelector('[data-final-review-actions-card]', finalReviewActionsCard);
  env.registerSelector('[data-final-review-cancel-panel]', finalReviewCancelPanel);
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

  Object.defineProperty(staffAdminContent, 'innerHTML', {
    configurable: true,
    get() {
      return staffAdminContentHtml;
    },
    set(value) {
      staffAdminRenderCount += 1;
      staffAdminContentHtml = String(value);

      if (staffAdminContentHtml.includes('data-staff-legacy-cleanup-confirmation')) {
        legacyCleanupConfirmationInput = createElement('input');
        Object.setPrototypeOf(legacyCleanupConfirmationInput, context.HTMLInputElement.prototype);
        legacyCleanupConfirmationInput.dataset.staffLegacyCleanupConfirmation = '';
        legacyCleanupConfirmationInput.matches = (selector) => selector === '[data-staff-legacy-cleanup-confirmation]';
        legacyCleanupConfirmationInput.selectionStart = 0;
        legacyCleanupConfirmationInput.selectionEnd = 0;
        legacyCleanupConfirmationInput.focus = () => {
          context.document.activeElement = legacyCleanupConfirmationInput;
        };
        legacyCleanupConfirmationInput.setSelectionRange = (start, end) => {
          legacyCleanupConfirmationInput.selectionStart = start;
          legacyCleanupConfirmationInput.selectionEnd = end;
        };

        legacyCleanupApplyButton = createElement('button');
        legacyCleanupApplyButton.dataset.action = 'staff-apply-legacy-cleanup';
        legacyCleanupApplyButton.disabled = /data-action="staff-apply-legacy-cleanup"[^>]*disabled/.test(staffAdminContentHtml);
        legacyCleanupApplyButton.closest = (selector) => {
          if (selector === '[data-action]') {
            return legacyCleanupApplyButton;
          }
          return null;
        };

        legacyCleanupPreviewButton = createElement('button');
        legacyCleanupPreviewButton.dataset.action = 'staff-preview-legacy-cleanup';
        legacyCleanupPreviewButton.disabled = /data-action="staff-preview-legacy-cleanup"[^>]*disabled/.test(staffAdminContentHtml);
        legacyCleanupPreviewButton.closest = (selector) => {
          if (selector === '[data-action]') {
            return legacyCleanupPreviewButton;
          }
          return null;
        };

        legacyCleanupFeedback = createElement('div');
        legacyCleanupFeedback.dataset.staffLegacyCleanupFeedback = '';
      } else {
        legacyCleanupConfirmationInput = null;
        legacyCleanupApplyButton = null;
        legacyCleanupPreviewButton = null;
        legacyCleanupFeedback = null;
      }
    }
  });

  staffAdminContent.querySelector = (selector) => {
    if (selector === '[data-staff-legacy-cleanup-confirmation]') {
      return legacyCleanupConfirmationInput;
    }
    if (selector === '[data-action="staff-apply-legacy-cleanup"]') {
      return legacyCleanupApplyButton;
    }
    if (selector === '[data-action="staff-preview-legacy-cleanup"]') {
      return legacyCleanupPreviewButton;
    }
    if (selector === '[data-staff-legacy-cleanup-feedback]') {
      return legacyCleanupFeedback;
    }
    return null;
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
  addPersonInput.focus = () => {
    context.document.activeElement = addPersonInput;
  };
  pendingPetIconSelect.focus = () => {
    context.document.activeElement = pendingPetIconSelect;
  };
  pendingPetCustomInput.focus = () => {
    context.document.activeElement = pendingPetCustomInput;
  };

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
    finalReviewStatus,
    finalReviewActionsCard,
    finalReviewCancelPanel,
    staffAdminContent,
    finalReviewItems,
    finalReviewSummary,
    finalReviewCustomer,
    finalReviewDelivery,
    thankYouCopy,
    thankYouReference,
    entryList,
    addPersonInput,
    addPersonButton,
    addPetButton,
    addPersonError,
    pendingPetControls,
    pendingPetIconSelect,
    pendingPetCustomGroup,
    pendingPetCustomInput,
    pendingPetCustomActions,
    cancelPetButton,
    confirmPetCustomButton,
    getStaffAdminRenderCount() {
      return staffAdminRenderCount;
    }
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
  let deleteConfirmationInput = null;
  let deleteConfirmationButton = null;
  let deleteConfirmationKeepButton = null;
  let detailRenderCount = 0;
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
      detailRenderCount += 1;
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

      if (detailDialogHtml.includes('data-staff-destructive-confirmation')) {
        deleteConfirmationInput = createElement('input');
        deleteConfirmationInput.dataset.staffDestructiveConfirmation = '';
        deleteConfirmationInput.matches = (selector) => selector === '[data-staff-destructive-confirmation]';
        deleteConfirmationInput.focus = () => {
          context.document.activeElement = deleteConfirmationInput;
        };
        deleteConfirmationInput.closest = (selector) => {
          if (selector === '[data-staff-destructive-confirmation]') {
            return deleteConfirmationInput;
          }
          return null;
        };

        deleteConfirmationButton = createElement('button');
        deleteConfirmationButton.dataset.action = 'staff-confirm-delete-test-order';
        deleteConfirmationButton.dataset.orderUuid = 'shared-order-1';
        deleteConfirmationButton.disabled = /data-action="staff-confirm-delete-test-order"[^>]*disabled/.test(detailDialogHtml);
        deleteConfirmationButton.closest = (selector) => {
          if (selector === '[data-action]') {
            return deleteConfirmationButton;
          }
          if (selector === '[data-order-uuid]') {
            return deleteConfirmationButton;
          }
          return null;
        };

        deleteConfirmationKeepButton = createElement('button');
        deleteConfirmationKeepButton.dataset.action = 'staff-close-destructive-action';
        deleteConfirmationKeepButton.closest = (selector) => {
          if (selector === '[data-action]') {
            return deleteConfirmationKeepButton;
          }
          return null;
        };
      } else {
        deleteConfirmationInput = null;
        deleteConfirmationButton = null;
        deleteConfirmationKeepButton = null;
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
    if (selector === '[data-staff-destructive-confirmation]') {
      return deleteConfirmationInput;
    }
    if (selector === '[data-action="staff-confirm-delete-test-order"]') {
      return deleteConfirmationButton;
    }
    if (selector === '[data-action="staff-close-destructive-action"]') {
      return deleteConfirmationKeepButton;
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
  let completeItemHandler = null;
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
        async completeItemQuantity(orderUuid, lineId, expectedCompletedQuantity, targetCompletedQuantity) {
          if (typeof completeItemHandler === 'function') {
            return completeItemHandler(orderUuid, lineId, expectedCompletedQuantity, targetCompletedQuantity);
          }
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
    getCompletionButtons() {
      return completionButtons.slice();
    },
    getTrayLoadCount() {
      return trayLoadCount;
    },
    getCompletionCallCount() {
      return completionCallCount;
    },
    setCompleteItemHandler(handler) {
      completeItemHandler = typeof handler === 'function' ? handler : null;
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
    getDetailRenderCount() {
      return detailRenderCount;
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

test('final review keeps the customer on one checkout screen and creates no submission context before submit', () => {
  const {
    context,
    placeOrderButton,
    finalReviewStatus,
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

  vm.runInContext('renderFinalReview();', context);

  assert.equal(placeOrderButton.textContent, 'Payment Received — Submit Order');
  assert.equal(placeOrderButton.disabled, true);
  assert.equal(vm.runInContext('appState.currentScreen', context), 'final-review');
  assert.equal(finalReviewStatus.textContent, '');
  assert.equal(localStorageData.has('forge-order-submission-context'), false);
  assert.equal(localStorageData.has('forge-order-completion-receipt'), false);
});

test('final review submit stays disabled until a payment method is selected', () => {
  const {
    context,
    placeOrderButton,
    paymentMethodButtons
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    validateFinalReviewDraft = () => ({ isValid: true, issues: [] });
    getOrderItems = () => [{ quantity: 1, displayName: 'Tree Ornament' }];
    getCurrentOrderStats = () => ({ itemCount: 1, subtotal: 3000 });
    customerDraft.fullName = 'Kyle Hemenway';
    appState.currentScreen = 'final-review';
    renderFinalReview();
  `, context);

  assert.equal(placeOrderButton.disabled, true);

  const expected = [
    ['card_square', 'Card / Square'],
    ['cash', 'Cash'],
    ['venmo', 'Venmo']
  ];

  expected.forEach(([value, label], index) => {
    paymentMethodButtons[index].dispatchEvent({
      type: 'click',
      target: paymentMethodButtons[index],
      currentTarget: paymentMethodButtons[index],
      preventDefault() {},
      stopPropagation() {}
    });
    assert.equal(vm.runInContext('finalReviewState.selectedMethod', context), value);
    assert.equal(placeOrderButton.disabled, false, `${label} should enable submit`);
  });
});

test('no customer screen renders a staff PIN field', () => {
  assert.doesNotMatch(indexSource, /data-payment-handoff-pin/);
  assert.doesNotMatch(indexSource, /payment-handoff-pin/);
  assert.doesNotMatch(indexSource, /data-screen="payment-handoff"/);
});

test('tree customization shows a shared name field with adjacent Add and Add Pet controls plus pending pet icon controls', () => {
  const treeMarkup = extractScreenMarkup('tree-customization');

  assert.match(treeMarkup, /data-add-person-input/);
  assert.match(treeMarkup, /<label for="entry-person-name">Name<\/label>/);
  assert.match(treeMarkup, /id="entry-person-name"[^>]*autocapitalize="words"/);
  assert.match(treeMarkup, /id="entry-person-name"[^>]*spellcheck="false"/);
  assert.match(treeMarkup, /id="entry-person-name"[^>]*autocorrect="off"/);
  assert.match(treeMarkup, /id="entry-person-name"[^>]*autocomplete="off"/);
  assert.match(treeMarkup, /data-action="add-person">Add<\/button>/);
  assert.match(treeMarkup, /data-action="add-pet">Add Pet<\/button>/);
  assert.match(treeMarkup, /data-pending-pet-icon/);
  assert.match(treeMarkup, /data-action="cancel-pet-entry">Cancel<\/button>/);
  assert.match(treeMarkup, /data-entry-add-error/);
  assert.doesNotMatch(treeMarkup, />Add Person<\/button>/);
  assert.doesNotMatch(treeMarkup, /Enter pet name/);
  assert.doesNotMatch(treeMarkup, /Done Adding Names/);
  assert.doesNotMatch(treeMarkup, />Save<\/button>/);
});

test('persistent shared name entry does not introduce JavaScript capitalization rewriting', () => {
  assert.match(appSource, /const normalizedName = trimText\(addPersonInput\?\.value \|\| ''\);/);
  assert.doesNotMatch(appSource, /capitalizeWords\(addPersonInput\?\.value/);
  assert.doesNotMatch(appSource, /capitalizeWords\(normalizedName\)/);
});

test('persistent name add appends ordered person entries, clears the field, and restores focus without reopening another control', () => {
  const {
    context,
    entryList,
    addPersonInput,
    addPersonButton
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    draft.productDefinitionId = 'tree_ornament';
    draft.size = 'Large';
    draft.entries = [];
    renderEntries();
  `, context);

  addPersonInput.value = 'Kyle';
  addPersonButton.click();

  assert.equal(vm.runInContext('draft.entries.length', context), 1);
  assert.equal(vm.runInContext('draft.entries[0].kind', context), 'person');
  assert.equal(vm.runInContext('draft.entries[0].name', context), 'Kyle');
  assert.equal(addPersonInput.value, '');
  assert.equal(context.document.activeElement, addPersonInput);

  addPersonInput.value = 'Meagan';
  addPersonButton.click();
  addPersonInput.value = 'Scout';
  addPersonButton.click();

  assert.equal(
    JSON.stringify(vm.runInContext('draft.entries.map((entry) => entry.name)', context)),
    JSON.stringify(['Kyle', 'Meagan', 'Scout'])
  );
  assert.doesNotMatch(entryList.innerHTML, /No people or pets added yet\./, 'empty state should be replaced after adding entries');
});

test('persistent name add trims outer whitespace, preserves internal spaces and punctuation, and rejects empty attempts', () => {
  const {
    context,
    addPersonInput,
    addPersonButton,
    addPersonError
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    draft.productDefinitionId = 'tree_ornament';
    draft.size = 'Large';
    draft.entries = [];
    renderEntries();
  `, context);

  addPersonInput.value = '   ';
  addPersonButton.click();
  assert.equal(vm.runInContext('draft.entries.length', context), 0);
  assert.equal(addPersonError.textContent, 'Enter a person name before adding it.');

  addPersonInput.value = "  Mary  Ann O'Neil-Smith  ";
  addPersonButton.click();

  assert.equal(vm.runInContext('draft.entries[0].name', context), "Mary  Ann O'Neil-Smith");
  assert.equal(addPersonError.textContent, '');
  assert.equal(
    vm.runInContext('normalizeTreeOrderItem().orderedEntries[0].name', context),
    "Mary  Ann O'Neil-Smith"
  );
});

test('shared Add Pet reveals icon selection without creating a blank row and uses the shared field name', () => {
  const {
    context,
    addPersonInput,
    addPetButton,
    pendingPetControls,
    pendingPetIconSelect
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    draft.productDefinitionId = 'tree_ornament';
    draft.size = 'Large';
    draft.entries = [];
    appState.currentScreen = 'tree-customization';
    renderEntries();
  `, context);

  addPetButton.click();
  assert.equal(vm.runInContext('draft.entries.length', context), 0);
  assert.equal(pendingPetControls.hidden, true);

  addPersonInput.value = 'Star';
  addPetButton.click();
  assert.equal(vm.runInContext('draft.entries.length', context), 0);
  assert.equal(pendingPetControls.hidden, false);
  assert.equal(addPersonInput.value, 'Star');

  pendingPetIconSelect.value = 'Paw';
  pendingPetIconSelect.dispatchEvent({
    type: 'change',
    target: pendingPetIconSelect,
    currentTarget: pendingPetIconSelect,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(vm.runInContext('draft.entries.length', context), 1);
  assert.equal(vm.runInContext('draft.entries[0].kind', context), 'pet');
  assert.equal(vm.runInContext('draft.entries[0].name', context), 'Star');
  assert.equal(vm.runInContext('draft.entries[0].icon', context), 'Paw Print');
  assert.equal(addPersonInput.value, '');
  assert.equal(pendingPetControls.hidden, true);
});

test('shared Add Pet cancel preserves the typed name and custom icon requires details before appending a pet', () => {
  const {
    context,
    addPersonInput,
    addPetButton,
    pendingPetControls,
    pendingPetIconSelect,
    pendingPetCustomGroup,
    pendingPetCustomInput,
    pendingPetCustomActions,
    cancelPetButton,
    confirmPetCustomButton,
    addPersonError
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    draft.productDefinitionId = 'tree_ornament';
    draft.size = 'Large';
    draft.entries = [];
    renderEntries();
  `, context);

  addPersonInput.value = 'Scout';
  addPetButton.click();
  assert.equal(pendingPetControls.hidden, false);
  cancelPetButton.click();
  assert.equal(vm.runInContext('draft.entries.length', context), 0);
  assert.equal(addPersonInput.value, 'Scout');
  assert.equal(pendingPetControls.hidden, true);

  addPetButton.click();
  pendingPetIconSelect.value = 'Custom Icon';
  pendingPetIconSelect.dispatchEvent({
    type: 'change',
    target: pendingPetIconSelect,
    currentTarget: pendingPetIconSelect,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(pendingPetCustomGroup.hidden, false);
  assert.equal(pendingPetCustomActions.hidden, false);
  confirmPetCustomButton.click();
  assert.equal(vm.runInContext('draft.entries.length', context), 0);
  assert.equal(addPersonError.textContent, 'Describe the custom icon before adding the pet.');

  pendingPetCustomInput.value = 'Tiny baseball';
  pendingPetCustomInput.dispatchEvent({
    type: 'input',
    target: pendingPetCustomInput,
    currentTarget: pendingPetCustomInput,
    preventDefault() {},
    stopPropagation() {}
  });
  confirmPetCustomButton.click();

  assert.equal(vm.runInContext('draft.entries.length', context), 1);
  assert.equal(vm.runInContext('draft.entries[0].icon', context), 'Custom Icon');
  assert.equal(vm.runInContext('draft.entries[0].iconOther', context), 'Tiny baseball');
  assert.equal(pendingPetControls.hidden, true);
});

test('shared field person add cancels pending pet creation and Enter still does not advance the customization flow', () => {
  const {
    context,
    addPersonInput,
    addPetButton,
    addPersonButton,
    pendingPetControls
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    draft.productDefinitionId = 'tree_ornament';
    draft.size = 'Large';
    draft.entries = [];
    appState.currentScreen = 'tree-customization';
    renderEntries();
  `, context);

  let prevented = false;
  addPersonInput.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: addPersonInput,
    currentTarget: addPersonInput,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {}
  });

  assert.equal(prevented, true);
  assert.equal(vm.runInContext('appState.currentScreen', context), 'tree-customization');
  assert.equal(vm.runInContext('draft.entries.length', context), 0);

  addPersonInput.value = 'Jordan';
  addPetButton.click();
  assert.equal(pendingPetControls.hidden, false);
  addPersonButton.click();

  assert.equal(vm.runInContext('draft.entries.length', context), 1);
  assert.equal(vm.runInContext('draft.entries[0].kind', context), 'person');
  assert.equal(pendingPetControls.hidden, true);
});

test('missing removed screens fall back safely instead of blanking the app', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    appState.currentScreen = 'final-review';
    const missingScreenIndex = screens.findIndex((screen) => screen.dataset.screen === 'payment-handoff');
    if (missingScreenIndex >= 0) {
      screens.splice(missingScreenIndex, 1);
    }
    showScreen('payment-handoff');
  `, context);

  assert.equal(vm.runInContext('appState.currentScreen', context), 'final-review');
  assert.equal(context.document.querySelector('[data-screen="final-review"]').classList.contains('active'), true);
});

test('customer submission works without a PIN for kiosk and token event flows from final review only', async () => {
  const scenarios = [
    {
      search: '',
      token: 'no-token'
    },
    {
      search: '?event=test-session-public-token',
      token: 'test-session-public-token'
    }
  ];

  for (const scenario of scenarios) {
    const {
      context,
      placeOrderButton,
      paymentMethodButtons
    } = loadForgeAppWithoutStaffModules();

    vm.runInContext(`
      globalThis.__submitCallCount = 0;
      globalThis.__submittedPaymentMethod = '';
      globalThis.__submittedToken = '';
      validateFinalReviewDraft = () => ({ isValid: true, issues: [] });
      getOrderItems = () => [{ quantity: 1, displayName: 'Tree Ornament' }];
      getCurrentOrderStats = () => ({ itemCount: 1, subtotal: 3000 });
      submitCurrentOrder = async (paymentConfirmation) => {
        globalThis.__submitCallCount += 1;
        globalThis.__submittedPaymentMethod = paymentConfirmation.externalPaymentMethod;
        globalThis.__submittedToken = customerEventState.activeEvent ? customerEventState.activeEvent.public_order_token : '';
        finalReviewState.savingOrder = false;
      };
      window.location.search = ${JSON.stringify(scenario.search)};
      customerDraft.fullName = 'Kyle Hemenway';
      customerEventState.activeEvent = {
        event_id: 'event-test',
        public_order_token: ${JSON.stringify(scenario.token)},
        event_name: 'Summer Market',
        event_type: 'live_event',
        event_status: 'active'
      };
      appState.currentScreen = 'final-review';
      renderFinalReview();
    `, context);

    paymentMethodButtons[1].dispatchEvent({
      type: 'click',
      target: paymentMethodButtons[1],
      currentTarget: paymentMethodButtons[1],
      preventDefault() {},
      stopPropagation() {}
    });

    context.document.querySelector('[data-screen="final-review"]').dispatchEvent({
      type: 'click',
      target: placeOrderButton,
      currentTarget: context.document.querySelector('[data-screen="final-review"]'),
      preventDefault() {},
      stopPropagation() {}
    });

    const verified = vm.runInContext(`JSON.stringify({
      submitCallCount: globalThis.__submitCallCount,
      submittedPaymentMethod: globalThis.__submittedPaymentMethod,
      submittedToken: globalThis.__submittedToken
    })`, context);
    const parsed = JSON.parse(verified);

    assert.equal(parsed.submitCallCount, 1);
    assert.equal(parsed.submittedPaymentMethod, 'cash');
    assert.equal(parsed.submittedToken, scenario.token);
    assert.equal(vm.runInContext('appState.currentScreen', context), 'final-review');
  }
});

test('duplicate customer submit is prevented while a submission is already in progress', () => {
  const {
    context,
    placeOrderButton,
    paymentMethodButtons
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    let submitCallCount = 0;
    validateFinalReviewDraft = () => ({ isValid: true, issues: [] });
    getOrderItems = () => [{ quantity: 1, displayName: 'Tree Ornament' }];
    getCurrentOrderStats = () => ({ itemCount: 1, subtotal: 3000 });
    submitCurrentOrder = async () => {
      submitCallCount += 1;
      finalReviewState.savingOrder = true;
    };
    customerDraft.fullName = 'Kyle Hemenway';
    appState.currentScreen = 'final-review';
    renderFinalReview();
  `, context);

  paymentMethodButtons[2].dispatchEvent({
    type: 'click',
    target: paymentMethodButtons[2],
    currentTarget: paymentMethodButtons[2],
    preventDefault() {},
    stopPropagation() {}
  });

  const finalReviewScreen = context.document.querySelector('[data-screen="final-review"]');
  const clickEvent = {
    type: 'click',
    target: placeOrderButton,
    currentTarget: finalReviewScreen,
    preventDefault() {},
    stopPropagation() {}
  };

  finalReviewScreen.dispatchEvent(clickEvent);
  finalReviewScreen.dispatchEvent(clickEvent);

  assert.equal(vm.runInContext('submitCallCount', context), 1);
});

test('final review cancel flow and edit actions remain available on the same screen', () => {
  const {
    context,
    finalReviewScreen,
    finalReviewCancelPanel
  } = loadForgeAppWithoutStaffModules();

  vm.runInContext(`
    validateFinalReviewDraft = () => ({ isValid: true, issues: [] });
    getOrderItems = () => [{
      itemId: 'item-1',
      quantity: 1,
      unitPrice: 30,
      displayName: 'Tree Ornament',
      orderedEntries: [],
      personalization: {},
      productDefinitionId: 'tree_ornament'
    }];
    getCurrentOrderStats = () => ({ itemCount: 1, subtotal: 3000 });
    customerDraft.fullName = 'Kyle Hemenway';
    appState.currentScreen = 'final-review';
    renderFinalReview();
  `, context);

  finalReviewScreen.dispatchEvent({
    type: 'click',
    target: createDispatchTarget({ action: 'final-review-cancel' }),
    currentTarget: finalReviewScreen,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(finalReviewCancelPanel.hidden, false);

  finalReviewScreen.dispatchEvent({
    type: 'click',
    target: createDispatchTarget({ action: 'final-review-cancel-dismiss' }),
    currentTarget: finalReviewScreen,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(finalReviewCancelPanel.hidden, true);

  finalReviewScreen.dispatchEvent({
    type: 'click',
    target: createDispatchTarget({ action: 'edit-items-from-final' }),
    currentTarget: finalReviewScreen,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(vm.runInContext('appState.currentScreen', context), 'current-order');

  vm.runInContext('showScreen("final-review");', context);
  finalReviewScreen.dispatchEvent({
    type: 'click',
    target: createDispatchTarget({ action: 'edit-customer-from-final' }),
    currentTarget: finalReviewScreen,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(vm.runInContext('appState.currentScreen', context), 'customer-information');
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

test('legacy cleanup typed confirmation behavior remains unchanged', () => {
  const { context } = loadForgeAppWithoutStaffModules({
    protocol: 'https:',
    hostname: 'forge.thehilltopshop.com',
    includeHostedStaffModules: true
  });

  vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    staffOrdersState.authenticated = true;
    staffOrdersState.legacyCleanupPreview = {
      eligibleCount: 2,
      cutoffLocal: 'July 25, 2026 at 12:00 AM America/Chicago',
      confirmationText: 'DELETE 2 ORDERS BEFORE JULY 25',
      eligibleOrders: [],
      protectedOrders: []
    };
    staffOrdersState.legacyCleanupConfirmationText = 'DELETE 2';
    renderStaffAdminTools();
  `, context);

  let controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);
  assert.match(String(controlsHtml), /data-action="staff-apply-legacy-cleanup"[^>]*disabled/);

  vm.runInContext(`
    staffOrdersState.legacyCleanupConfirmationText = 'DELETE 2 ORDERS BEFORE JULY 25';
    renderStaffAdminTools();
  `, context);
  controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);
  assert.doesNotMatch(String(controlsHtml), /data-action="staff-apply-legacy-cleanup"[^>]*disabled/);

  vm.runInContext(`
    staffOrdersState.legacyCleanupConfirmationText = 'DELETE 2 ORDERS BEFORE JULY 2';
    renderStaffAdminTools();
  `, context);
  controlsHtml = vm.runInContext('document.querySelector("[data-staff-admin-content]").innerHTML', context);
  assert.match(String(controlsHtml), /data-action="staff-apply-legacy-cleanup"[^>]*disabled/);
});

test('legacy cleanup confirmation preserves input identity and focus while typing', () => {
  const {
    context,
    staffAdminContent,
    getStaffAdminRenderCount
  } = loadForgeAppWithoutStaffModules({
    protocol: 'https:',
    hostname: 'forge.thehilltopshop.com',
    includeHostedStaffModules: true
  });

  vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    staffOrdersState.authenticated = true;
    staffOrdersState.legacyCleanupPreview = {
      eligibleCount: 9,
      cutoffLocal: 'July 25, 2026 at 12:00 AM America/Chicago',
      confirmationText: 'DELETE 9 ORDERS BEFORE JULY 25',
      eligibleOrders: [],
      protectedOrders: []
    };
    renderStaffAdminTools();
  `, context);

  const input = staffAdminContent.querySelector('[data-staff-legacy-cleanup-confirmation]');
  const adminScreen = context.document.querySelector('[data-screen="staff-admin"]');
  const renderCountBefore = getStaffAdminRenderCount();

  input.focus();
  input.value = 'DELETE 9';
  input.selectionStart = 8;
  input.selectionEnd = 8;
  adminScreen.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: adminScreen,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(staffAdminContent.querySelector('[data-staff-legacy-cleanup-confirmation]'), input);
  assert.equal(context.document.activeElement, input);
  assert.equal(input.selectionStart, 8);
  assert.equal(input.selectionEnd, 8);
  assert.equal(getStaffAdminRenderCount(), renderCountBefore);
  assert.equal(staffAdminContent.querySelector('[data-action="staff-apply-legacy-cleanup"]').disabled, true);

  input.value = 'DELETE 9 ORDERS BEFORE JULY 25';
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  adminScreen.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: adminScreen,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(staffAdminContent.querySelector('[data-staff-legacy-cleanup-confirmation]'), input);
  assert.equal(context.document.activeElement, input);
  assert.equal(getStaffAdminRenderCount(), renderCountBefore);
  assert.equal(staffAdminContent.querySelector('[data-action="staff-apply-legacy-cleanup"]').disabled, false);

  input.value = 'DELETE 9 ORDERS BEFORE JULY 2';
  adminScreen.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: adminScreen,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(staffAdminContent.querySelector('[data-action="staff-apply-legacy-cleanup"]').disabled, true);
});

test('legacy cleanup typing does not rerun preview and cleanup invocation occurs exactly once', async () => {
  const {
    context,
    staffAdminContent
  } = loadForgeAppWithoutStaffModules({
    protocol: 'https:',
    hostname: 'forge.thehilltopshop.com',
    includeHostedStaffModules: true
  });

  const counts = await vm.runInContext(`
    (async () => {
  const counters = { preview: 0, apply: 0 };
      staffOrdersState.dataSource = 'server';
      staffOrdersState.authenticated = true;
      staffOrdersState.legacyCleanupPreview = {
        previewSignature: 'preview-signature',
        eligibleCount: 9,
        cutoffLocal: 'July 25, 2026 at 12:00 AM America/Chicago',
        confirmationText: 'DELETE 9 ORDERS BEFORE JULY 25',
        eligibleOrders: [],
        protectedOrders: []
      };
      staffRuntime.previewLegacyTestCleanup = async () => {
        counters.preview += 1;
        return { ok: true, preview: staffOrdersState.legacyCleanupPreview };
      };
      staffRuntime.applyLegacyTestCleanup = async () => {
        counters.apply += 1;
        return { ok: true, deletedCount: 0, releasedTrayNumbers: [] };
      };
      renderStaffAdminTools();
      globalThis.__legacyCleanupCounters = counters;
      return counters;
    })()
  `, context);
  void counts;

  const input = staffAdminContent.querySelector('[data-staff-legacy-cleanup-confirmation]');
  const adminScreen = context.document.querySelector('[data-screen="staff-admin"]');
  input.value = 'DELETE 9 ORDERS BEFORE JULY 25';
  adminScreen.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: adminScreen,
    preventDefault() {},
    stopPropagation() {}
  });

  const previewCountAfterTyping = vm.runInContext('globalThis.__legacyCleanupCounters.preview', context);
  assert.equal(previewCountAfterTyping, 0);

  await vm.runInContext('applyLegacyTestCleanup()', context);

  const finalCounts = vm.runInContext('globalThis.__legacyCleanupCounters', context);
  assert.equal(JSON.parse(JSON.stringify(finalCounts)).preview, 0);
  assert.equal(JSON.parse(JSON.stringify(finalCounts)).apply, 1);
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

test('runtime staff source configuration applies the approved header descriptions in both hosted and local modes', () => {
  const { context } = loadForgeAppWithoutStaffModules();

  const hostedDescriptions = vm.runInContext(`
    staffOrdersState.dataSource = 'server';
    renderStaffSourceUi();
    ({
      orders: document.querySelector('[data-staff-orders-lead]').textContent,
      ready: document.querySelector('[data-ready-to-pack-lead]').textContent,
      admin: document.querySelector('[data-staff-admin-lead]').textContent
    });
  `, context);

  assert.equal(hostedDescriptions.orders, 'Search, review, and manage all Forge orders.');
  assert.equal(hostedDescriptions.ready, 'Orders with production complete and ready for packing.');
  assert.equal(hostedDescriptions.admin, 'Manage staff-only events, exports, and maintenance tools.');

  const localDescriptions = vm.runInContext(`
    staffOrdersState.dataSource = 'local';
    renderStaffSourceUi();
    ({
      orders: document.querySelector('[data-staff-orders-lead]').textContent,
      ready: document.querySelector('[data-ready-to-pack-lead]').textContent,
      admin: document.querySelector('[data-staff-admin-lead]').textContent
    });
  `, context);

  assert.equal(localDescriptions.orders, hostedDescriptions.orders);
  assert.equal(localDescriptions.ready, hostedDescriptions.ready);
  assert.equal(localDescriptions.admin, hostedDescriptions.admin);
});

test('shared server order detail assign tray button opens the tray picker after re-rendering', async () => {
  const { context, detailDialog, trayDialog, getAssignTrayButton, getTrayLoadCount } = loadForgeHostedStaffAppForTrayDetail();

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  assert.match(String(detailDialog.innerHTML || ''), /Order 1001/);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /System Details/);
  assert.match(String(detailDialog.innerHTML || ''), /Customer Email/);
  assert.match(String(detailDialog.innerHTML || ''), /Order Subtotal/);

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

test('shared server two-item order detail reopens and completes the second hosted ornament without losing staff access', async () => {
  const {
    context,
    detailDialog,
    getCompletionButtons,
    setCompleteItemHandler,
    setSharedRecord
  } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    production_status: 'in_production',
    current_tray_number: 7,
    total_item_count: 2,
    completed_item_count: 1,
    staff_can_assign_tray: false,
    staff_can_complete_items: true,
    payload: {
      forge_order_number: 1001,
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: [
        {
          line_id: 'shared-first-line',
          line_number: 1,
          product_display_name: 'Antler Ornament',
          quantity: 1,
          completed_quantity: 1,
          production_status: 'complete',
          completed_at: '2026-07-20T12:05:00Z',
          pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
          open_flags: []
        },
        {
          line_id: 'shared-second-line',
          line_number: 2,
          product_display_name: 'Antler Ornament',
          quantity: 1,
          completed_quantity: 0,
          production_status: 'pending',
          pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
          open_flags: []
        }
      ]
    }
  });
  let hostedTwoItemCompletionCallCount = 0;
  setCompleteItemHandler((orderUuid, lineId, expectedCompletedQuantity, targetCompletedQuantity) => {
    assert.equal(orderUuid, 'shared-order-1');
    assert.equal(lineId, 'shared-second-line');
    assert.equal(expectedCompletedQuantity, 0);
    assert.equal(targetCompletedQuantity, 1);
    hostedTwoItemCompletionCallCount += 1;

    const completedSharedRecord = {
      production_status: 'ready_to_pack',
      current_tray_number: 7,
      total_item_count: 2,
      completed_item_count: 2,
      staff_can_assign_tray: false,
      staff_can_complete_items: false,
      ready_to_pack_at: '2026-07-20T12:10:00Z',
      payload: {
        forge_order_number: 1001,
        customer: { full_name: 'Kyle Hemenway' },
        fulfillment: { method: 'shipping' },
        items: [
          {
            line_id: 'shared-first-line',
            line_number: 1,
            product_display_name: 'Antler Ornament',
            quantity: 1,
            completed_quantity: 1,
            production_status: 'complete',
            completed_at: '2026-07-20T12:05:00Z',
            pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
            open_flags: []
          },
          {
            line_id: 'shared-second-line',
            line_number: 2,
            product_display_name: 'Antler Ornament',
            quantity: 1,
            completed_quantity: 1,
            production_status: 'complete',
            completed_at: '2026-07-20T12:10:00Z',
            pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
            open_flags: []
          }
        ]
      }
    };
    setSharedRecord(completedSharedRecord);

    return {
      ok: true,
      authenticated: true,
      dataSource: 'server',
      readOnly: true,
      alreadyApplied: false,
      order: structuredClone(completedSharedRecord)
    };
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');
  assert.match(String(detailDialog.innerHTML || ''), /1 of 2 Complete/);

  const initialButtons = getCompletionButtons();
  assert.equal(initialButtons.length, 1);
  assert.equal(initialButtons[0].dataset.lineId, 'shared-second-line');
  initialButtons[0].dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(String(detailDialog.innerHTML || ''), /Saving\.\.\./);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(hostedTwoItemCompletionCallCount, 1);
  assert.match(String(detailDialog.innerHTML || ''), /Item completion saved\./);
  assert.match(String(detailDialog.innerHTML || ''), /2 of 2 Complete/);
  assert.match(String(detailDialog.innerHTML || ''), /Ready to Pack/);

  await context.openStaffOrderDetail('shared-order-1');
  assert.match(String(detailDialog.innerHTML || ''), /2 of 2 Complete/);
  assert.equal(getCompletionButtons().length, 0);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /Unable to open this order/);
});

test('shared server item completion keeps order detail open and shows the safe validation error', async () => {
  const {
    context,
    detailDialog,
    getCompletionButtons,
    setCompleteItemHandler,
    setSharedRecord
  } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    production_status: 'in_production',
    current_tray_number: 7,
    total_item_count: 2,
    completed_item_count: 1,
    staff_can_assign_tray: false,
    staff_can_complete_items: true,
    payload: {
      forge_order_number: 1001,
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: [
        {
          line_id: 'shared-first-line',
          line_number: 1,
          product_display_name: 'Antler Ornament',
          quantity: 1,
          completed_quantity: 1,
          production_status: 'complete',
          completed_at: '2026-07-20T12:05:00Z',
          pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
          open_flags: []
        },
        {
          line_id: 'shared-second-line',
          line_number: 2,
          product_display_name: 'Antler Ornament',
          quantity: 1,
          completed_quantity: 0,
          production_status: 'pending',
          pricing: { final_unit_price_cents: 2600, line_total_cents: 2600 },
          open_flags: []
        }
      ]
    }
  });

  setCompleteItemHandler(() => {
    const error = new Error('A valid current completed quantity is required.');
    error.code = 'invalid_request';
    throw error;
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  const completionButtons = getCompletionButtons();
  assert.equal(completionButtons.length, 1);
  completionButtons[0].dispatchEvent(new MockMouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const detailHtml = String(detailDialog.innerHTML || '');
  assert.match(detailHtml, /Order 1001/i);
  assert.match(detailHtml, /A valid current completed quantity is required\./i);
  assert.doesNotMatch(detailHtml, /Order Unavailable/i);
  assert.doesNotMatch(detailHtml, /Staff authentication could not be prepared\./i);
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
  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; staffOrdersState.detailDestructiveAction = "cancel_order"; renderStaffOrderDetail();', context);

  assert.match(String(detailDialog.innerHTML || ''), /Cancel Order/);
  assert.match(String(detailDialog.innerHTML || ''), /Order 1001/);
  assert.match(String(detailDialog.innerHTML || ''), /Kyle Hemenway/);
  assert.match(String(detailDialog.innerHTML || ''), /Tray 3/);
  assert.match(String(detailDialog.innerHTML || ''), /active production stops/);
});

test('shared server completed order detail shows completed history payment method and released tray summary', async () => {
  const { context, detailDialog, setSharedRecord } = loadForgeHostedStaffAppForTrayDetail();

  setSharedRecord({
    production_status: 'completed',
    current_tray_number: null,
    ready_to_pack_at: '2026-07-20T11:10:00Z',
    completed_at: '2026-07-20T11:15:00Z',
    confirmation_email_status: 'Email Sent',
    confirmation_email_status_key: 'sent',
    confirmation_email_timestamp: '2026-07-20T11:16:00Z',
    completed_tray_release: {
      tray_assignment_id: 'assignment-complete-1',
      tray_number: 7,
      forge_order_uuid: 'shared-order-1',
      assigned_at: '2026-07-20T10:00:00Z',
      released_at: '2026-07-20T11:15:00Z',
      release_reason: 'completed'
    },
    payload: {
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      external_payment_method: 'venmo',
      items: [{ line_id: 'shared-tree-line', quantity: 1, completed_quantity: 1, production_status: 'complete' }],
      event: { event_id: 'event-live-1', event_name: 'Austin Market', event_type: 'live_event' },
      pricing: { estimated_total_cents: 4200 },
      forge_order_number: 1001
    }
  });

  await context.openStaffAccessScreen('staff-orders');
  await context.openStaffOrderDetail('shared-order-1');

  const expectedReadyToPack = vm.runInContext('formatReadableDateTime("2026-07-20T11:10:00Z")', context);
  const expectedCompleted = vm.runInContext('formatReadableDateTime("2026-07-20T11:15:00Z")', context);
  const detailHtml = String(detailDialog.innerHTML || '');

  assert.match(detailHtml, /Ready to Pack/);
  assert.match(detailHtml, /Completed/);
  assert.match(detailHtml, /Payment Method/);
  assert.match(detailHtml, /Venmo/);
  assert.match(detailHtml, /Customer Email/);
  assert.match(detailHtml, /Email Sent/);
  assert.match(detailHtml, /Production Tray/);
  assert.match(detailHtml, /Tray 7 — Released when order was completed on/);
  assert.match(detailHtml, new RegExp(expectedReadyToPack.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(detailHtml, new RegExp(expectedCompleted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(detailHtml, /2026-07-20 11:15:00/);
  assert.doesNotMatch(detailHtml, />UUID</);
  assert.doesNotMatch(detailHtml, /Assign Tray/);
});

test('shared server order detail keeps more order actions collapsed by default and resets on reopen', async () => {
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

  let detailHtml = String(detailDialog.innerHTML || '');
  assert.match(detailHtml, /data-action="staff-toggle-more-order-actions"/);
  assert.match(detailHtml, /aria-expanded="false"/);
  assert.match(detailHtml, /id="staff-order-detail-more-actions-panel" hidden/);

  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; renderStaffOrderDetail();', context);
  detailHtml = String(detailDialog.innerHTML || '');
  assert.match(detailHtml, /aria-expanded="true"/);
  assert.match(detailHtml, /data-action="staff-open-cancel-order"/);

  context.closeStaffOrderDetail();
  await context.openStaffOrderDetail('shared-order-1');

  detailHtml = String(detailDialog.innerHTML || '');
  assert.match(detailHtml, /aria-expanded="false"/);
  assert.match(detailHtml, /id="staff-order-detail-more-actions-panel" hidden/);
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
  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; staffOrdersState.detailDestructiveAction = "delete_test_order"; staffOrdersState.detailDestructiveConfirmationText = "DELETE TEST ORDER"; renderStaffOrderDetail();', context);

  assert.match(String(detailDialog.innerHTML || ''), /Delete Test Order/);
  assert.match(String(detailDialog.innerHTML || ''), /TEST/);
  assert.match(String(detailDialog.innerHTML || ''), /Checkout Test Session/);
  assert.match(String(detailDialog.innerHTML || ''), /DELETE TEST ORDER/);
  assert.doesNotMatch(String(detailDialog.innerHTML || ''), /Confirm Cancel Order/);
});

test('shared server Test Session delete confirmation preserves input identity and focus while typing', async () => {
  const {
    context,
    detailDialog,
    getDetailRenderCount,
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
  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; staffOrdersState.detailDestructiveAction = "delete_test_order"; renderStaffOrderDetail();', context);

  const input = detailDialog.querySelector('[data-staff-destructive-confirmation]');
  const deleteButton = detailDialog.querySelector('[data-action="staff-confirm-delete-test-order"]');
  const renderCountBefore = getDetailRenderCount();

  input.focus();
  input.value = 'DELE';
  detailDialog.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: detailDialog,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(detailDialog.querySelector('[data-staff-destructive-confirmation]'), input);
  assert.equal(context.document.activeElement, input);
  assert.equal(getDetailRenderCount(), renderCountBefore);
  assert.equal(deleteButton.disabled, true);

  input.value = 'DELETE TEST ORDER';
  detailDialog.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: detailDialog,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(detailDialog.querySelector('[data-staff-destructive-confirmation]'), input);
  assert.equal(context.document.activeElement, input);
  assert.equal(deleteButton.disabled, false);

  input.value = 'DELETE TEST ORDE';
  detailDialog.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: detailDialog,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(deleteButton.disabled, true);
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
  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; staffOrdersState.detailDestructiveAction = "delete_test_order"; staffOrdersState.detailDestructiveConfirmationText = "DELETE TEST ORDER";', context);
  await context.submitStaffDeleteTestOrder('shared-order-1');

  assert.equal(getDeleteTestOrderCallCount(), 1);
  assert.equal(detailDialog.hidden, true);

  await context.openStaffOrderDetail('shared-order-1');
  assert.match(String(detailDialog.innerHTML || ''), /could not be found/i);
});

test('shared server Test Session deletion still invokes the runtime once after exact confirmation', async () => {
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
  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; staffOrdersState.detailDestructiveAction = "delete_test_order"; renderStaffOrderDetail();', context);

  const input = detailDialog.querySelector('[data-staff-destructive-confirmation]');
  input.value = 'DELETE TEST ORDER';
  detailDialog.dispatchEvent({
    type: 'input',
    target: input,
    currentTarget: detailDialog,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(detailDialog.querySelector('[data-action="staff-confirm-delete-test-order"]').disabled, false);
  await context.submitStaffDeleteTestOrder('shared-order-1');
  assert.equal(getDeleteTestOrderCallCount(), 1);
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
  vm.runInContext('staffOrdersState.detailMoreActionsExpanded = true; staffOrdersState.detailDestructiveAction = "delete_test_order"; staffOrdersState.detailDestructiveConfirmationText = "DELETE TEST ORDER";', context);
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
    new RegExp(`<script src="js/forge-staff-api-client\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-catalog-ordering\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-catalog-image-viewer\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-design-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-design-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-hat-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-hat-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-material-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-material-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-finished-hat-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-finished-hat-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-orders-runtime\\.js\\?v=${BUILD_VERSION}"></script>`)
  );
  assert.doesNotMatch(indexSource, /data-category="staff-catalog"/);
});

test('staff screens share the approved header structure, order, descriptions, and active states', () => {
  const scenarios = [
    {
      screenId: 'staff-orders',
      description: 'Search, review, and manage all Forge orders.',
      activeAction: 'staff-open-orders',
      statusAttribute: 'data-staff-source-status'
    },
    {
      screenId: 'ready-to-pack',
      description: 'Orders with production complete and ready for packing.',
      activeAction: 'staff-open-ready-to-pack',
      statusAttribute: 'data-ready-source-status'
    },
    {
      screenId: 'staff-admin',
      description: 'Manage staff-only events, exports, and maintenance tools.',
      activeAction: 'staff-open-admin',
      statusAttribute: 'data-staff-source-status'
    },
    {
      screenId: 'staff-catalog',
      description: 'Browse designs, hats, materials, and finished hat combinations.',
      activeAction: 'staff-open-catalog',
      statusAttribute: 'data-staff-source-status'
    }
  ];

  scenarios.forEach(({ screenId, description, activeAction, statusAttribute }) => {
    const screenMarkup = extractScreenMarkup(screenId);
    assert.match(screenMarkup, /<header class="staff-orders-header" data-staff-header>/);
    assert.match(screenMarkup, /<div class="staff-orders-logo-plaque">[\s\S]*?<img class="staff-orders-logo" src="assets\/brand\/forge-logo\.png" alt="Forge" nopin="nopin" data-pin-nopin="true">/);
    assert.match(screenMarkup, /<div class="staff-orders-header-nav" aria-label="Staff workspace navigation">/);
    assert.match(screenMarkup, /staff-orders-header-nav-row staff-orders-header-nav-row--primary/);
    assert.match(screenMarkup, /staff-orders-header-nav-row staff-orders-header-nav-row--utility/);
    assert.match(screenMarkup, /data-action="staff-return-welcome"[\s\S]*?Return to Welcome[\s\S]*?data-action="staff-open-orders"[\s\S]*?Staff Orders[\s\S]*?data-action="staff-open-ready-to-pack"[\s\S]*?Ready to Pack[\s\S]*?data-action="staff-open-catalog"[\s\S]*?Hilltop Design Catalog/);
    assert.match(screenMarkup, new RegExp(`${statusAttribute} aria-live="polite"`));
    assert.match(screenMarkup, /<span class="staff-source-pill"[^>]*><\/span>/);
    assert.doesNotMatch(screenMarkup, /<button class="staff-source-pill"/);
    assert.match(screenMarkup, /data-action="staff-open-admin">Admin Tools<\/button>/);
    assert.match(screenMarkup, /data-action="staff-(refresh-orders|refresh-ready-to-pack|refresh-catalog|refresh-admin)">Refresh<\/button>/);
    assert.match(screenMarkup, /data-staff-logout-button hidden>Logout<\/button>/);
    assert.match(screenMarkup, new RegExp(`data-action="${activeAction}"[^>]*aria-current="page"`));
    assert.match(screenMarkup, new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  assert.match(indexSource, /staff-header-return-button/);
  assert.match(indexSource, /staff-header-return-button__icon/);
  assert.doesNotMatch(indexSource, /data-staff-header[\s\S]*?staff-orders-header-actions/);
});

test('admin tools shell containment and active navigation readability use the scoped header fixes', () => {
  assert.match(
    appSource,
    /const isStaffScreen = \['staff-orders', 'ready-to-pack', 'staff-catalog', 'staff-admin'\]\.includes\(name\);/
  );
  assert.match(
    cssSource,
    /\[data-screen="staff-admin"\]\s+\.staff-orders-shell\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*box-sizing:\s*border-box;/
  );
  assert.match(
    cssSource,
    /\.staff-admin-content\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*box-sizing:\s*border-box;/
  );
  assert.match(
    cssSource,
    /\.staff-orders-header-nav\s+\.secondary-button\[aria-current="page"\]\s*\{[\s\S]*color:\s*var\(--staff-text\);[\s\S]*opacity:\s*1;/
  );
  assert.match(
    cssSource,
    /\.staff-orders-header-nav\s+\.secondary-button\[aria-current="page"\]:disabled\s*\{[\s\S]*color:\s*var\(--staff-text\);[\s\S]*opacity:\s*1;/
  );
  assert.match(
    cssSource,
    /\.staff-header-return-button\s*\{[\s\S]*padding-inline:\s*10px\s*!important;[\s\S]*font-size:\s*13px\s*!important;/
  );
  assert.match(
    cssSource,
    /\.staff-header-catalog-button\s*\{[\s\S]*line-height:\s*1\.15;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*text-align:\s*center;/
  );
});

test('Forge entry point declares exactly one Pinterest nopin meta tag and all static images opt out', () => {
  const metaMatches = indexSource.match(/<meta name="pinterest" content="nopin">/g) || [];
  const imageTags = indexSource.match(/<img\b[^>]*>/g) || [];

  assert.equal(metaMatches.length, 1);
  assert.ok(indexSource.indexOf('<meta name="pinterest" content="nopin">') < indexSource.indexOf('</head>'));
  assert.ok(imageTags.length > 0);
  imageTags.forEach((tag) => {
    assert.match(tag, /\bnopin="nopin"/);
    assert.match(tag, /\bdata-pin-nopin="true"/);
    assert.match(tag, /\balt="/);
  });
});

test('customer runtime adds Pinterest opt-out attributes to dynamic product images without changing image metadata', () => {
  assert.match(appSource, /const PINTEREST_NOPIN_IMAGE_ATTRIBUTES = ' nopin="nopin" data-pin-nopin="true"';/);
  assert.match(appSource, /function getItemImageMarkup\(item, imageClass = 'current-order-photo', options = \{\}\)/);
  assert.match(appSource, /decoding="\$\{decoding\}"\$\{loading\}\$\{PINTEREST_NOPIN_IMAGE_ATTRIBUTES\}>/);
  assert.match(indexSource, /data-tree-customization-image nopin="nopin" data-pin-nopin="true"/);
});

test('static staff and customer logos keep the same sources while adding Pinterest opt-out attributes', () => {
  assert.match(indexSource, /<img class="brand-logo" src="assets\/brand\/hilltop-logo\.png" alt="The Hilltop Shop" nopin="nopin" data-pin-nopin="true">/);
  assert.match(indexSource, /<img class="logo" src="assets\/brand\/hilltop-logo\.png" alt="The Hilltop Shop" nopin="nopin" data-pin-nopin="true">/);
  assert.match(indexSource, /<img class="staff-orders-logo" src="assets\/brand\/forge-logo\.png" alt="Forge" nopin="nopin" data-pin-nopin="true">/);
});
