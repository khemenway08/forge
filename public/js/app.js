const screens = [...document.querySelectorAll('[data-screen]')];
const treeForm = document.querySelector('[data-form="tree-ornament"]');
const treeStatus = document.querySelector('[data-form-status]');
const entryList = document.querySelector('[data-entry-list]');
const capacityMessage = document.querySelector('[data-capacity-message]');
const addPersonButton = document.querySelector('[data-action="add-person"]');
const addPetButton = document.querySelector('[data-action="add-pet"]');
const treeReviewCard = document.querySelector('[data-tree-review-card]');
const currentOrderItems = document.querySelector('[data-current-order-items]');
const currentOrderSummary = document.querySelector('[data-current-order-summary]');
const customerForm = document.querySelector('[data-form="customer-information"]');
const staffButton = document.querySelector('[data-action="staff"]');
const staffPanel = document.querySelector('[data-staff-panel]');
const staffDefaultActions = document.querySelector('[data-staff-actions="default"]');
const staffConfirmActions = document.querySelector('[data-staff-actions="confirm"]');
const customerOrderContext = document.querySelector('[data-customer-order-context]');
const customerStatus = document.querySelector('[data-customer-form-status]');
const contactChoiceButtons = [...document.querySelectorAll('[data-contact-choice]')];
const fulfillmentChoiceButtons = [...document.querySelectorAll('[data-fulfillment-choice]')];
const shippingFieldsContainer = document.querySelector('[data-shipping-fields]');
const utilityOrderButtons = [...document.querySelectorAll('[data-action="view-current-order-utility"]')];
const discardPanels = [...document.querySelectorAll('[data-discard-panel]')];
const storageKey = 'forge-tree-ornament-draft';
const orderItemsStorageKey = 'forge-order-items';
const appStateStorageKey = 'forge-app-state';
const customerDraftStorageKey = 'forge-customer-draft';
const reviewPriceBySize = {
  Small: 26,
  Large: 30
};

const treeFields = {
  size: document.querySelector('[name="size"]'),
  treeColor: document.querySelector('[name="treeColor"]'),
  bowColor: document.querySelector('[name="bowColor"]'),
  familyName: document.querySelector('[name="familyName"]'),
  year: document.querySelector('[name="year"]')
};

const customerFields = {
  fullName: document.querySelector('[data-customer-field="fullName"]'),
  email: document.querySelector('[data-customer-field="email"]'),
  phone: document.querySelector('[data-customer-field="phone"]'),
  addressLine1: document.querySelector('[data-customer-field="addressLine1"]'),
  addressLine2: document.querySelector('[data-customer-field="addressLine2"]'),
  city: document.querySelector('[data-customer-field="city"]'),
  state: document.querySelector('[data-customer-field="state"]'),
  postalCode: document.querySelector('[data-customer-field="postalCode"]'),
  country: document.querySelector('[data-customer-field="country"]'),
  neededBy: document.querySelector('[data-customer-field="neededBy"]')
};

const allowedValues = {
  size: ['Small', 'Large'],
  treeColor: ['Green', 'Brown'],
  bowColor: ['Red', 'White'],
  petIcon: ['Paw', 'Fish', 'No Icon', 'Custom Icon'],
  preferredContact: ['Text', 'Email'],
  fulfillmentMethod: ['Shipping', 'Local Pickup']
};

const draft = {
  size: '',
  treeColor: '',
  bowColor: '',
  familyName: '',
  year: '2026',
  entries: []
};

const customerDraft = {
  orderSessionId: '',
  fullName: '',
  email: '',
  phone: '',
  preferredContact: '',
  fulfillmentMethod: 'Shipping',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'United States',
  neededBy: ''
};

const appState = {
  currentScreen: 'welcome',
  editingItemId: '',
  reviewedItemId: '',
  activeOrderSessionId: ''
};

const reviewState = {
  saving: false,
  lastAddedItemId: '',
  error: ''
};

const orderUiState = {
  removeConfirmItemId: '',
  note: '',
  discardContext: ''
};

let orderUiNoteTimer = 0;
let lastStaffFocusTarget = null;

function showScreen(name) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === name);
  });
  appState.currentScreen = name;
  saveAppState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelector('[data-action="start"]').addEventListener('click', () => {
  showScreen('categories');
});

document.querySelectorAll('[data-category]').forEach((button) => {
  button.addEventListener('click', () => {
    const category = button.dataset.category;
    if (category === 'ornaments') {
      showScreen('ornaments');
      return;
    }
    alert('This category is scheduled after the ornament ordering flow is complete.');
  });
});

document.querySelectorAll('[data-action="back-categories"]').forEach((button) => {
  button.addEventListener('click', () => showScreen('categories'));
});

document.querySelectorAll('[data-action="back-ornaments"]').forEach((button) => {
  button.addEventListener('click', () => {
    clearTreeFormErrors();
    showScreen('ornaments');
  });
});

document.querySelectorAll('[data-action="back-tree-customization"]').forEach((button) => {
  button.addEventListener('click', () => {
    showScreen('tree-customization');
  });
});

document.querySelectorAll('[data-action="back-tree-review"]').forEach((button) => {
  button.addEventListener('click', () => {
    showScreen('tree-review');
  });
});

document.querySelectorAll('[data-product]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.product === 'tree') {
      clearTreeFormErrors();
      hydrateFormFromDraft();
      renderEntries();
      showScreen('tree-customization');
      return;
    }
    const name = button.querySelector('h3')?.textContent ?? 'Product';
    alert(`${name} customization is the next development step.`);
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

function setFieldError(name, message) {
  const error = document.querySelector(`[data-error-for="${name}"]`);
  if (error) {
    error.textContent = message;
  }
}

function setCustomerFieldError(name, message) {
  const error = document.querySelector(`[data-customer-error-for="${name}"]`);
  if (error) {
    error.textContent = message;
  }
}

function getSavedOrderItemCount() {
  return getOrderItems().length;
}

function clearTreeFormErrors() {
  Object.keys(treeFields).forEach((name) => setFieldError(name, ''));
  setFieldError('entries', '');
  treeStatus.textContent = '';
  if (entryList) {
    entryList.querySelectorAll('.entry-row').forEach((row) => row.classList.remove('is-invalid'));
    entryList.querySelectorAll('[data-entry-error]').forEach((node) => {
      node.textContent = '';
    });
  }
}

function clearCustomerFormErrors() {
  Object.keys(customerFields).forEach((name) => setCustomerFieldError(name, ''));
  setCustomerFieldError('preferredContact', '');
  setCustomerFieldError('fulfillmentMethod', '');
  if (customerStatus) {
    customerStatus.textContent = '';
  }
}

function sanitizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function createId() {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSessionId() {
  return `order-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resetCustomerDraftState() {
  customerDraft.orderSessionId = appState.activeOrderSessionId || '';
  customerDraft.fullName = '';
  customerDraft.email = '';
  customerDraft.phone = '';
  customerDraft.preferredContact = '';
  customerDraft.fulfillmentMethod = 'Shipping';
  customerDraft.addressLine1 = '';
  customerDraft.addressLine2 = '';
  customerDraft.city = '';
  customerDraft.state = '';
  customerDraft.postalCode = '';
  customerDraft.country = 'United States';
  customerDraft.neededBy = '';
}

function ensureActiveOrderSession() {
  if (!appState.activeOrderSessionId) {
    appState.activeOrderSessionId = createSessionId();
    saveAppState();
  }
}

function getMaxEntries(size) {
  if (size === 'Small') {
    return 5;
  }
  return 12;
}

function getCapacityDetails() {
  const size = treeFields.size.value;
  const limit = getMaxEntries(size);
  const count = draft.entries.length;
  const reachedLimit = count >= limit;
  const overLimit = size === 'Small' && count > limit;

  return { size, limit, count, reachedLimit, overLimit };
}

function syncDraftFromFields() {
  draft.size = treeFields.size.value;
  draft.treeColor = treeFields.treeColor.value;
  draft.bowColor = treeFields.bowColor.value;
  draft.familyName = sanitizeText(treeFields.familyName.value);
  draft.year = treeFields.year.value.trim();
}

function hydrateFormFromDraft() {
  treeFields.size.value = draft.size;
  treeFields.treeColor.value = draft.treeColor;
  treeFields.bowColor.value = draft.bowColor;
  treeFields.familyName.value = draft.familyName;
  treeFields.year.value = draft.year || '2026';
}

function saveDraft() {
  syncDraftFromFields();
  localStorage.setItem(storageKey, JSON.stringify(draft));
}

function saveAppState() {
  localStorage.setItem(appStateStorageKey, JSON.stringify(appState));
}

function loadAppState() {
  try {
    const raw = localStorage.getItem(appStateStorageKey);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed.currentScreen === 'string') {
      appState.currentScreen = parsed.currentScreen;
    }
    if (typeof parsed.editingItemId === 'string') {
      appState.editingItemId = parsed.editingItemId;
    }
    if (typeof parsed.reviewedItemId === 'string') {
      appState.reviewedItemId = parsed.reviewedItemId;
    }
    if (typeof parsed.activeOrderSessionId === 'string') {
      appState.activeOrderSessionId = parsed.activeOrderSessionId;
    }
  } catch {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      hydrateFormFromDraft();
      return;
    }

    const parsed = JSON.parse(raw);
    draft.size = allowedValues.size.includes(parsed.size) ? parsed.size : '';
    draft.treeColor = allowedValues.treeColor.includes(parsed.treeColor) ? parsed.treeColor : '';
    draft.bowColor = allowedValues.bowColor.includes(parsed.bowColor) ? parsed.bowColor : '';
    draft.familyName = typeof parsed.familyName === 'string' ? sanitizeText(parsed.familyName) : '';
    draft.year = typeof parsed.year === 'string' && parsed.year ? parsed.year : '2026';
    draft.entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry).filter(Boolean) : [];
  } catch {
    draft.entries = [];
  }

  hydrateFormFromDraft();
}

function getTodayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeEmail(value) {
  return value.trim();
}

function sanitizePhone(value) {
  return value.replace(/[^\d+()\-.\s]/g, '').replace(/\s{2,}/g, ' ').trim();
}

function sanitizePostalCode(value) {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function isUnitedStatesCountry(value) {
  const normalized = sanitizeText(value).toLowerCase().replace(/\./g, '');
  return normalized === 'united states' || normalized === 'us';
}

function syncCustomerDraftFromFields() {
  customerDraft.orderSessionId = appState.activeOrderSessionId;
  customerDraft.fullName = sanitizeText(customerFields.fullName?.value || '');
  customerDraft.email = sanitizeEmail(customerFields.email?.value || '');
  customerDraft.phone = sanitizePhone(customerFields.phone?.value || '');
  customerDraft.addressLine1 = sanitizeText(customerFields.addressLine1?.value || '');
  customerDraft.addressLine2 = sanitizeText(customerFields.addressLine2?.value || '');
  customerDraft.city = sanitizeText(customerFields.city?.value || '');
  customerDraft.state = sanitizeText(customerFields.state?.value || '');
  customerDraft.postalCode = sanitizePostalCode(customerFields.postalCode?.value || '');
  customerDraft.country = sanitizeText(customerFields.country?.value || '') || 'United States';
  customerDraft.neededBy = customerFields.neededBy?.value || '';
}

function saveCustomerDraft() {
  ensureActiveOrderSession();
  syncCustomerDraftFromFields();
  localStorage.setItem(customerDraftStorageKey, JSON.stringify(customerDraft));
}

function renderCustomerChoiceStates() {
  contactChoiceButtons.forEach((button) => {
    const selected = button.dataset.contactChoice === customerDraft.preferredContact;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });

  fulfillmentChoiceButtons.forEach((button) => {
    const selected = button.dataset.fulfillmentChoice === customerDraft.fulfillmentMethod;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function renderShippingFieldsState() {
  if (!shippingFieldsContainer) {
    return;
  }

  const isShipping = customerDraft.fulfillmentMethod === 'Shipping';
  shippingFieldsContainer.hidden = !isShipping;

  ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'].forEach((name) => {
    const field = customerFields[name];
    if (field) {
      field.disabled = !isShipping;
    }
  });
}

function hydrateCustomerFormFromDraft() {
  if (!customerForm) {
    return;
  }

  customerFields.fullName.value = customerDraft.fullName;
  customerFields.email.value = customerDraft.email;
  customerFields.phone.value = customerDraft.phone;
  customerFields.addressLine1.value = customerDraft.addressLine1;
  customerFields.addressLine2.value = customerDraft.addressLine2;
  customerFields.city.value = customerDraft.city;
  customerFields.state.value = customerDraft.state;
  customerFields.postalCode.value = customerDraft.postalCode;
  customerFields.country.value = customerDraft.country || 'United States';
  customerFields.neededBy.value = customerDraft.neededBy;
  customerFields.neededBy.min = getTodayIsoDate();
  renderCustomerChoiceStates();
  renderShippingFieldsState();
}

function loadCustomerDraft() {
  try {
    const raw = localStorage.getItem(customerDraftStorageKey);
    if (!raw) {
      resetCustomerDraftState();
      hydrateCustomerFormFromDraft();
      return;
    }

    const parsed = JSON.parse(raw);
    const draftOrderSessionId = typeof parsed.orderSessionId === 'string' ? parsed.orderSessionId : parsed.sessionId;
    if (!parsed || draftOrderSessionId !== appState.activeOrderSessionId) {
      resetCustomerDraftState();
      localStorage.removeItem(customerDraftStorageKey);
      hydrateCustomerFormFromDraft();
      return;
    }

    customerDraft.orderSessionId = draftOrderSessionId;
    customerDraft.fullName = typeof parsed.fullName === 'string' ? sanitizeText(parsed.fullName) : '';
    customerDraft.email = typeof parsed.email === 'string' ? sanitizeEmail(parsed.email) : '';
    customerDraft.phone = typeof parsed.phone === 'string' ? sanitizePhone(parsed.phone) : '';
    customerDraft.preferredContact = allowedValues.preferredContact.includes(parsed.preferredContact) ? parsed.preferredContact : '';
    customerDraft.fulfillmentMethod = allowedValues.fulfillmentMethod.includes(parsed.fulfillmentMethod) ? parsed.fulfillmentMethod : 'Shipping';
    customerDraft.addressLine1 = typeof parsed.addressLine1 === 'string' ? sanitizeText(parsed.addressLine1) : '';
    customerDraft.addressLine2 = typeof parsed.addressLine2 === 'string' ? sanitizeText(parsed.addressLine2) : '';
    customerDraft.city = typeof parsed.city === 'string' ? sanitizeText(parsed.city) : '';
    customerDraft.state = typeof parsed.state === 'string' ? sanitizeText(parsed.state) : '';
    customerDraft.postalCode = typeof parsed.postalCode === 'string' ? sanitizePostalCode(parsed.postalCode) : '';
    customerDraft.country = typeof parsed.country === 'string' && sanitizeText(parsed.country) ? sanitizeText(parsed.country) : 'United States';
    customerDraft.neededBy = typeof parsed.neededBy === 'string' ? parsed.neededBy : '';
  } catch {
    resetCustomerDraftState();
    localStorage.removeItem(customerDraftStorageKey);
  }

  hydrateCustomerFormFromDraft();
}

function clearCustomerDraftForNextOrder() {
  appState.activeOrderSessionId = createSessionId();
  saveAppState();
  resetCustomerDraftState();
  localStorage.removeItem(customerDraftStorageKey);
  clearDisplayedCustomerFields();
  hydrateCustomerFormFromDraft();
  clearCustomerFormErrors();
}

function clearDisplayedCustomerFields() {
  Object.values(customerFields).forEach((field) => {
    if (field) {
      field.value = '';
    }
  });
  if (customerFields.country) {
    customerFields.country.value = 'United States';
  }
}

function setStaffPanelState(isOpen, needsConfirmation = false) {
  if (!staffPanel || !staffButton || !staffDefaultActions || !staffConfirmActions) {
    return;
  }

  staffPanel.hidden = !isOpen;
  staffButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  staffDefaultActions.hidden = needsConfirmation;
  staffConfirmActions.hidden = !needsConfirmation;

  if (isOpen) {
    const focusTarget = needsConfirmation
      ? staffPanel.querySelector('[data-action="cancel-staff-reset"]')
      : staffPanel.querySelector('[data-action="staff-reset-kiosk"]');
    window.setTimeout(() => focusTarget?.focus(), 0);
  }
}

function closeStaffPanel() {
  setStaffPanelState(false, false);
  if (lastStaffFocusTarget instanceof HTMLElement) {
    lastStaffFocusTarget.focus();
  }
}

function resetActiveOrderSession({ clearCart = true, goToWelcome = true } = {}) {
  if (clearCart) {
    saveOrderItems([]);
  }

  draft.size = '';
  draft.treeColor = '';
  draft.bowColor = '';
  draft.familyName = '';
  draft.year = '2026';
  draft.entries = [];
  localStorage.removeItem(storageKey);

  localStorage.removeItem(customerDraftStorageKey);
  localStorage.removeItem(orderItemsStorageKey);

  clearOrderUiNote();
  clearDiscardPrompt();
  orderUiState.removeConfirmItemId = '';

  appState.editingItemId = '';
  appState.reviewedItemId = '';
  appState.activeOrderSessionId = createSessionId();
  saveAppState();

  resetCustomerDraftState();
  clearDisplayedCustomerFields();
  hydrateFormFromDraft();
  hydrateCustomerFormFromDraft();
  clearTreeFormErrors();
  clearCustomerFormErrors();
  renderEntries();
  renderTreeReview();
  renderCurrentOrder();
  renderCustomerOrderContext();
  renderCurrentOrderUtilityButtons();
  closeStaffPanel();

  if (goToWelcome) {
    showScreen('welcome');
  }
}

function renderCustomerOrderContext() {
  if (!customerOrderContext) {
    return;
  }

  const { itemCount, subtotal } = getCurrentOrderStats(getOrderItems());
  customerOrderContext.innerHTML = `
    <div class="stat-row">
      <span>Current Items</span>
      <strong>${itemCount}</strong>
    </div>
    <div class="stat-row">
      <span>Item Subtotal</span>
      <strong>${formatPrice(subtotal)}</strong>
    </div>
    <p class="customer-context-note">Shipping and tax will be reviewed later.</p>
  `;
}

function hasOrderItems() {
  return getSavedOrderItemCount() > 0;
}

function openCustomerInformation() {
  renderCurrentOrder();
  if (!hasOrderItems()) {
    setOrderUiNote('Add at least one item before entering customer information.');
    renderCurrentOrder();
    showScreen('current-order');
    return;
  }

  clearCustomerFormErrors();
  renderCustomerOrderContext();
  hydrateCustomerFormFromDraft();
  showScreen('customer-information');
}

function setPreferredContact(value) {
  if (!allowedValues.preferredContact.includes(value)) {
    return;
  }

  customerDraft.preferredContact = value;
  renderCustomerChoiceStates();
  setCustomerFieldError('preferredContact', '');
  if (customerStatus) {
    customerStatus.textContent = '';
  }
  saveCustomerDraft();
}

function setFulfillmentMethod(value) {
  if (!allowedValues.fulfillmentMethod.includes(value)) {
    return;
  }

  customerDraft.fulfillmentMethod = value;
  renderCustomerChoiceStates();
  renderShippingFieldsState();
  setCustomerFieldError('fulfillmentMethod', '');
  ['addressLine1', 'city', 'state', 'postalCode', 'country'].forEach((name) => setCustomerFieldError(name, ''));
  if (customerStatus) {
    customerStatus.textContent = '';
  }
  saveCustomerDraft();
}

function getCustomerFieldTarget(name) {
  if (name === 'preferredContact') {
    return contactChoiceButtons[0] || customerFields.fullName;
  }
  if (name === 'fulfillmentMethod') {
    return fulfillmentChoiceButtons[0] || customerFields.fullName;
  }
  return customerFields[name] || customerFields.fullName;
}

function validateCustomerForm() {
  clearCustomerFormErrors();
  syncCustomerDraftFromFields();
  renderShippingFieldsState();

  let isValid = true;
  let firstInvalidField = '';
  const setInvalid = (name, message) => {
    if (!firstInvalidField) {
      firstInvalidField = name;
    }
    setCustomerFieldError(name, message);
    isValid = false;
  };

  if (!hasOrderItems()) {
    if (customerStatus) {
      customerStatus.textContent = 'Add at least one item before continuing.';
    }
    return false;
  }

  if (!customerDraft.fullName) {
    setInvalid('fullName', 'Please enter your full name.');
  }

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerDraft.email);
  if (!customerDraft.email) {
    setInvalid('email', 'Please enter an email address.');
  } else if (!emailLooksValid) {
    setInvalid('email', 'Enter a valid email address.');
  }

  const phoneDigits = customerDraft.phone.replace(/\D/g, '');
  if (!customerDraft.phone) {
    setInvalid('phone', 'Please enter a phone number.');
  } else if (phoneDigits.length < 10) {
    setInvalid('phone', 'Enter a valid phone number.');
  }

  if (!allowedValues.preferredContact.includes(customerDraft.preferredContact)) {
    setInvalid('preferredContact', 'Choose how you would like us to contact you.');
  }

  if (!allowedValues.fulfillmentMethod.includes(customerDraft.fulfillmentMethod)) {
    setInvalid('fulfillmentMethod', 'Choose shipping or local pickup.');
  }

  if (customerDraft.fulfillmentMethod === 'Shipping') {
    if (!customerDraft.addressLine1) {
      setInvalid('addressLine1', 'Please enter address line 1.');
    }
    if (!customerDraft.city) {
      setInvalid('city', 'Please enter a city.');
    }
    if (!customerDraft.state) {
      setInvalid('state', 'Please enter a state.');
    }
    if (!customerDraft.postalCode) {
      setInvalid('postalCode', 'Please enter a postal code.');
    } else if (isUnitedStatesCountry(customerDraft.country) && !/^\d{5}(-\d{4})?$/.test(customerDraft.postalCode)) {
      setInvalid('postalCode', 'Enter a 5-digit ZIP code or ZIP+4.');
    }
    if (!customerDraft.country) {
      setInvalid('country', 'Please enter a country.');
    }
  }

  if (customerDraft.neededBy) {
    const today = getTodayIsoDate();
    if (customerDraft.neededBy < today) {
      setInvalid('neededBy', 'Needed-by date cannot be earlier than today.');
    }
  }

  if (!isValid) {
    if (customerStatus) {
      customerStatus.textContent = 'Please complete the required customer information.';
    }
    const target = getCustomerFieldTarget(firstInvalidField);
    target?.focus();
    return false;
  }

  if (customerStatus) {
    customerStatus.textContent = 'Your information is saved. Final order review is the next step.';
  }

  saveCustomerDraft();
  return true;
}

function normalizeEntry(entry) {
  if (!entry || (entry.kind !== 'person' && entry.kind !== 'pet')) {
    return null;
  }

  if (entry.kind === 'person') {
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
      kind: 'person',
      name: typeof entry.name === 'string' ? entry.name : ''
    };
  }

  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
    kind: 'pet',
    name: typeof entry.name === 'string' ? entry.name : '',
    icon: allowedValues.petIcon.includes(entry.icon) ? entry.icon : '',
    iconOther: typeof entry.iconOther === 'string' ? entry.iconOther : ''
  };
}

function renderCapacityMessage() {
  const { size, limit, count, reachedLimit, overLimit } = getCapacityDetails();

  if (!size) {
    capacityMessage.textContent = `Choose a size to lock the limit. Up to 12 combined people and pets can be drafted before size is selected.`;
  } else if (overLimit) {
    capacityMessage.textContent = `Small supports up to 5 combined people and pets. Remove ${count - limit} entr${count - limit === 1 ? 'y' : 'ies'} before continuing.`;
  } else if (reachedLimit) {
    capacityMessage.textContent = `${size} is full at ${limit} combined people and pets. Remove one to add another.`;
  } else {
    capacityMessage.textContent = `${size} allows up to ${limit} combined people and pets. ${limit - count} slot${limit - count === 1 ? '' : 's'} remaining.`;
  }

  addPersonButton.disabled = reachedLimit;
  addPetButton.disabled = reachedLimit;
}

function renderEntries(focusId) {
  if (!entryList) {
    return;
  }

  const { count } = getCapacityDetails();

  if (draft.entries.length === 0) {
    entryList.innerHTML = '<li class="entry-empty">Add a person or pet to start the ornament list.</li>';
    renderCapacityMessage();
    renderCurrentOrderUtilityButtons();
    renderDiscardPanels();
    return;
  }

  entryList.innerHTML = draft.entries.map((entry, index) => {
    const isPet = entry.kind === 'pet';
    const showCustomIcon = isPet && entry.icon === 'Custom Icon';
    const rowClass = isPet
      ? `entry-row entry-row--pet${showCustomIcon ? ' entry-row--pet-custom' : ''}`
      : 'entry-row entry-row--person';

    return `
      <li class="${rowClass}" data-entry-id="${entry.id}">
        <div class="entry-line entry-line-top">
          <span class="entry-order">${index + 1}.</span>
          <span class="entry-kind">${entry.kind === 'person' ? 'Person' : 'Pet'}</span>

          <div class="entry-row-actions">
            <button class="icon-button" type="button" data-entry-action="move-up" aria-label="Move row up" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-button" type="button" data-entry-action="move-down" aria-label="Move row down" title="Move down" ${index === count - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon-button" type="button" data-entry-action="remove" aria-label="Remove row" title="Remove">×</button>
          </div>
        </div>

        <div class="entry-line entry-line-bottom${isPet ? ' entry-line-bottom-pet' : ''}">
          <div class="form-group entry-name">
            <input
              id="${entry.id}-name"
              data-entry-field="name"
              type="text"
              value="${escapeAttribute(entry.name)}"
              maxlength="32"
              placeholder="${isPet ? 'Enter pet name' : 'Enter person name'}"
              aria-label="Name"
              spellcheck="false"
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
            >
          </div>

          ${isPet ? `
            <div class="form-group entry-icon">
              <select id="${entry.id}-icon" data-entry-field="icon" aria-label="Icon">
                <option value="">Select an icon</option>
                ${allowedValues.petIcon.map((option) => `<option value="${option}" ${entry.icon === option ? 'selected' : ''}>${option}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>

        ${showCustomIcon ? `
          <div class="form-group entry-custom-icon">
            <input
              id="${entry.id}-icon-other"
              data-entry-field="iconOther"
              type="text"
              value="${escapeAttribute(entry.iconOther)}"
              maxlength="24"
              placeholder="Describe the custom icon"
              aria-label="Describe custom icon"
            >
          </div>
        ` : ''}

        <p class="field-error" data-entry-error aria-live="polite"></p>
      </li>
    `;
  }).join('');

  renderCapacityMessage();

  if (focusId) {
    const focusRow = entryList.querySelector(`[data-entry-id="${focusId}"]`);
    const focusTarget = document.getElementById(`${focusId}-name`);
    if (focusRow) {
      focusRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (focusTarget) {
      window.setTimeout(() => {
        focusTarget.focus();
        focusTarget.select();
      }, 120);
    }
  }

  renderCurrentOrderUtilityButtons();
  renderDiscardPanels();
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return escapeAttribute(value);
}

function formatPrice(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function getTreeUnitPrice(size) {
  return reviewPriceBySize[size] ?? 0;
}

function getPetIconText(entry) {
  if (entry.icon === 'No Icon') {
    return 'No Icon';
  }
  return entry.icon || 'Not selected';
}

function getEntryCounts(entries) {
  return entries.reduce((counts, entry) => {
    if (entry.kind === 'pet') {
      counts.petCount += 1;
    } else {
      counts.peopleCount += 1;
    }
    return counts;
  }, { peopleCount: 0, petCount: 0 });
}

function getReviewEntriesMarkup(entries) {
  return entries.map((entry, index) => {
    const details = [];
    if (entry.kind === 'pet') {
      details.push(`Icon: ${escapeHtml(entry.icon || 'Not selected')}`);
      if (entry.icon === 'Custom Icon' && sanitizeText(entry.iconOther || '')) {
        details.push(`Custom icon: ${escapeHtml(sanitizeText(entry.iconOther))}`);
      }
    }

    return `
      <li class="review-entry-item">
        <span class="review-entry-position">${index + 1}.</span>
        <div class="review-entry-body">
          <div class="review-entry-primary">
            <span class="review-entry-name">${escapeHtml(sanitizeText(entry.name) || 'Unnamed')}</span>
            <span class="review-entry-badge">${entry.kind === 'pet' ? 'Pet' : 'Person'}</span>
          </div>
          ${details.length > 0 ? `<div class="review-entry-detail">${details.join(' • ')}</div>` : ''}
        </div>
      </li>
    `;
  }).join('');
}

function createTreeReviewMarkup() {
  const unitPrice = getTreeUnitPrice(draft.size);
  const actionLabel = appState.editingItemId ? 'Save Changes' : 'Add to Order';
  const statusMessage = reviewState.error || '';
  const statusClass = reviewState.error ? 'inline-confirmation is-error' : 'inline-confirmation';

  return `
    <div class="review-card-layout">
      <div>
        <img class="review-product-photo" src="assets/products/tree-ornament.jpg" alt="Tree Ornament">
      </div>
      <div class="review-copy">
        <div class="review-header">
          <div>
            <h3>Tree Ornament</h3>
            <p class="review-subtitle">Item-level review before adding this ornament to the order.</p>
          </div>
          <div class="review-price">${formatPrice(unitPrice)}</div>
        </div>

        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Size</span>
            <div class="summary-value">${escapeHtml(draft.size)}</div>
          </div>
          <div class="summary-item">
            <span class="summary-label">Tree Color</span>
            <div class="summary-value">${escapeHtml(draft.treeColor)}</div>
          </div>
          <div class="summary-item">
            <span class="summary-label">Bow Color</span>
            <div class="summary-value">${escapeHtml(draft.bowColor)}</div>
          </div>
          <div class="summary-item">
            <span class="summary-label">Year</span>
            <div class="summary-value">${escapeHtml(draft.year)}</div>
          </div>
          <div class="summary-item">
            <span class="summary-label">Family Name</span>
            <div class="summary-value">${escapeHtml(draft.familyName)}</div>
          </div>
          <div class="summary-item">
            <span class="summary-label">Quantity</span>
            <div class="summary-value">1</div>
          </div>
        </div>

        <div class="review-list-card">
          <h4>People &amp; Pets</h4>
          <ol class="review-entry-list">
            ${getReviewEntriesMarkup(draft.entries)}
          </ol>
        </div>

        <p class="${statusClass}" data-review-confirmation aria-live="polite">${statusMessage}</p>

        <div class="review-actions">
          <button class="secondary-button" type="button" data-action="edit-tree-review">Edit Ornament</button>
          <button class="primary-button" type="button" data-action="add-tree-to-order" ${reviewState.saving ? 'disabled' : ''}>
            ${reviewState.saving ? 'Saving...' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  `;
}

function normalizeTreeOrderItem() {
  const entries = draft.entries.map((entry, index) => ({
    position: index + 1,
    kind: entry.kind,
    name: sanitizeText(entry.name),
    icon: entry.kind === 'pet' ? entry.icon : null,
    customIconDescription: entry.kind === 'pet' && entry.icon === 'Custom Icon'
      ? sanitizeText(entry.iconOther || '')
      : ''
  }));

  const { peopleCount, petCount } = getEntryCounts(entries);
  const unitPrice = getTreeUnitPrice(draft.size);
  const configurationSnapshot = {
    size: draft.size,
    treeColor: draft.treeColor,
    bowColor: draft.bowColor,
    familyName: draft.familyName,
    year: draft.year,
    entries
  };

  return {
    itemId: appState.editingItemId || `tree-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productDefinitionId: 'tree_ornament',
    displayName: 'Tree Ornament',
    category: 'ornament',
    quantity: 1,
    unitPrice,
    size: draft.size,
    treeColor: draft.treeColor,
    bowColor: draft.bowColor,
    familyName: draft.familyName,
    year: draft.year,
    orderedEntries: entries,
    peopleCount,
    petCount,
    hasCustomIcon: entries.some((entry) => entry.customIconDescription),
    configurationSnapshot
  };
}

function normalizeOrderItemRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const itemId = typeof record.itemId === 'string' && record.itemId ? record.itemId : '';
  const displayName = typeof record.displayName === 'string' ? record.displayName : '';
  const category = typeof record.category === 'string' ? record.category : '';
  const quantity = Number.isFinite(record.quantity) ? record.quantity : 1;
  const unitPrice = Number.isFinite(record.unitPrice) ? record.unitPrice : 0;
  const orderedEntries = Array.isArray(record.orderedEntries)
    ? record.orderedEntries.map((entry, index) => {
        if (!entry || (entry.kind !== 'person' && entry.kind !== 'pet')) {
          return null;
        }
        return {
          position: Number.isFinite(entry.position) ? entry.position : index + 1,
          kind: entry.kind,
          name: typeof entry.name === 'string' ? sanitizeText(entry.name) : '',
          icon: typeof entry.icon === 'string' ? entry.icon : '',
          customIconDescription: typeof entry.customIconDescription === 'string'
            ? sanitizeText(entry.customIconDescription)
            : ''
        };
      }).filter(Boolean)
    : [];

  if (!itemId || !displayName || quantity < 1) {
    return null;
  }

  return {
    itemId,
    productDefinitionId: typeof record.productDefinitionId === 'string' ? record.productDefinitionId : '',
    displayName,
    category,
    quantity,
    unitPrice,
    size: typeof record.size === 'string' ? record.size : '',
    treeColor: typeof record.treeColor === 'string' ? record.treeColor : '',
    bowColor: typeof record.bowColor === 'string' ? record.bowColor : '',
    familyName: typeof record.familyName === 'string' ? sanitizeText(record.familyName) : '',
    year: typeof record.year === 'string' ? record.year : '',
    orderedEntries,
    peopleCount: Number.isFinite(record.peopleCount) ? record.peopleCount : orderedEntries.filter((entry) => entry.kind === 'person').length,
    petCount: Number.isFinite(record.petCount) ? record.petCount : orderedEntries.filter((entry) => entry.kind === 'pet').length,
    hasCustomIcon: Boolean(record.hasCustomIcon),
    configurationSnapshot: record.configurationSnapshot && typeof record.configurationSnapshot === 'object'
      ? record.configurationSnapshot
      : null
  };
}

function getOrderItems() {
  try {
    const raw = localStorage.getItem(orderItemsStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeOrderItemRecord).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveOrderItems(items) {
  localStorage.setItem(orderItemsStorageKey, JSON.stringify(items));
}

function isTreeDraftBlank() {
  return !draft.size
    && !draft.treeColor
    && !draft.bowColor
    && !sanitizeText(draft.familyName)
    && draft.entries.length === 0
    && (!draft.year || draft.year === '2026');
}

function shouldShowCurrentOrderUtility(context) {
  if (context === 'tree-customization' || context === 'tree-review') {
    return Boolean(appState.editingItemId) || getSavedOrderItemCount() > 0;
  }
  return getSavedOrderItemCount() > 0;
}

function getCurrentOrderUtilityLabel(context) {
  if ((context === 'tree-customization' || context === 'tree-review') && appState.editingItemId) {
    return 'Cancel Edit';
  }
  return `View Current Order (${getSavedOrderItemCount()})`;
}

function renderCurrentOrderUtilityButtons() {
  utilityOrderButtons.forEach((button) => {
    const context = button.dataset.utilityContext || '';
    const visible = shouldShowCurrentOrderUtility(context);
    button.hidden = !visible;
    if (visible) {
      button.textContent = getCurrentOrderUtilityLabel(context);
      button.setAttribute('aria-label', button.textContent);
    }
  });
}

function createDiscardPanelMarkup() {
  return `
    <p>Discard this unfinished ornament and return to your current order?</p>
    <div class="inline-discard-actions">
      <button class="secondary-button" type="button" data-action="keep-editing-discard">Keep Editing</button>
      <button class="primary-button" type="button" data-action="discard-and-view-order">Discard and View Order</button>
    </div>
  `;
}

function renderDiscardPanels() {
  discardPanels.forEach((panel) => {
    const active = panel.dataset.discardPanel === orderUiState.discardContext;
    panel.hidden = !active;
    panel.innerHTML = active ? createDiscardPanelMarkup() : '';
  });
}

function clearDiscardPrompt() {
  orderUiState.discardContext = '';
  renderDiscardPanels();
}

function openCurrentOrderUtilityFromContext(context) {
  clearOrderUiNote();

  if ((context === 'tree-customization' || context === 'tree-review') && appState.editingItemId) {
    appState.editingItemId = '';
    appState.reviewedItemId = '';
    saveAppState();
    clearDiscardPrompt();
    openCurrentOrder();
    return;
  }

  if (context === 'tree-customization') {
    if (isTreeDraftBlank()) {
      resetTreeDraftForNewItem();
      clearDiscardPrompt();
      openCurrentOrder();
      return;
    }
    orderUiState.discardContext = 'tree-customization';
    renderDiscardPanels();
    return;
  }

  if (context === 'tree-review') {
    orderUiState.discardContext = 'tree-review';
    renderDiscardPanels();
    return;
  }

  clearDiscardPrompt();
  openCurrentOrder();
}

function clearOrderUiNote() {
  if (orderUiNoteTimer) {
    window.clearTimeout(orderUiNoteTimer);
    orderUiNoteTimer = 0;
  }
  orderUiState.note = '';
}

function setOrderUiNote(message, autoDismissMs = 5000) {
  clearOrderUiNote();
  orderUiState.note = message;
  if (autoDismissMs > 0) {
    orderUiNoteTimer = window.setTimeout(() => {
      orderUiState.note = '';
      orderUiNoteTimer = 0;
      if (appState.currentScreen === 'current-order') {
        renderCurrentOrder();
      }
    }, autoDismissMs);
  }
}

function buildDraftFromOrderItem(item) {
  return {
    size: item.size,
    treeColor: item.treeColor,
    bowColor: item.bowColor,
    familyName: item.familyName,
    year: item.year,
    entries: item.orderedEntries.map((entry) => ({
      id: createId(),
      kind: entry.kind,
      name: entry.name,
      icon: entry.kind === 'pet' ? entry.icon : '',
      iconOther: entry.customIconDescription || ''
    }))
  };
}

function renderTreeReview() {
  if (!treeReviewCard) {
    return;
  }

  treeReviewCard.innerHTML = createTreeReviewMarkup();
  renderCurrentOrderUtilityButtons();
  renderDiscardPanels();
}

function getCurrentOrderStats(items) {
  return items.reduce((stats, item) => {
    stats.itemCount += item.quantity;
    stats.subtotal += item.quantity * item.unitPrice;
    return stats;
  }, { itemCount: 0, subtotal: 0 });
}

function createCurrentOrderItemMarkup(item) {
  const entriesMarkup = item.orderedEntries.map((entry) => `
    <li class="review-entry-item">
      <span class="review-entry-position">${entry.position}.</span>
      <div class="review-entry-body">
        <div class="review-entry-primary">
          <span class="review-entry-name">${escapeHtml(entry.name || 'Unnamed')}</span>
          <span class="review-entry-badge">${entry.kind === 'pet' ? 'Pet' : 'Person'}</span>
        </div>
        ${entry.kind === 'pet' ? `
          <div class="review-entry-detail">
            Icon: ${escapeHtml(getPetIconText(entry))}
            ${entry.customIconDescription ? ` • Custom icon: ${escapeHtml(entry.customIconDescription)}` : ''}
          </div>
        ` : ''}
      </div>
    </li>
  `).join('');

  const removeMarkup = orderUiState.removeConfirmItemId === item.itemId
    ? `
      <div class="inline-remove-actions">
        <button class="secondary-button" type="button" data-action="confirm-remove-item" data-item-id="${item.itemId}">Confirm Remove</button>
        <button class="text-button" type="button" data-action="cancel-remove-item">Cancel</button>
      </div>
    `
    : `
      <button class="text-button" type="button" data-action="request-remove-item" data-item-id="${item.itemId}">Remove Item</button>
    `;

  return `
    <article class="current-order-item" data-item-id="${item.itemId}">
      <div class="current-order-item-layout">
        <div>
          <img class="current-order-photo" src="assets/products/tree-ornament.jpg" alt="Tree Ornament order item">
        </div>
        <div class="current-order-copy">
          <div class="current-order-header">
            <div>
              <h3>${escapeHtml(item.displayName)}</h3>
            </div>
            <div class="current-order-price">
              <strong>${formatPrice(item.unitPrice * item.quantity)}</strong>
              <span>${item.quantity} × ${formatPrice(item.unitPrice)}</span>
            </div>
          </div>

          <div class="current-order-meta">
            <div class="summary-item">
              <span class="summary-label">Quantity</span>
              <div class="summary-value">${item.quantity}</div>
            </div>
            <div class="summary-item">
              <span class="summary-label">Size</span>
              <div class="summary-value">${escapeHtml(item.size)}</div>
            </div>
            <div class="summary-item">
              <span class="summary-label">Tree Color</span>
              <div class="summary-value">${escapeHtml(item.treeColor)}</div>
            </div>
            <div class="summary-item">
              <span class="summary-label">Bow Color</span>
              <div class="summary-value">${escapeHtml(item.bowColor)}</div>
            </div>
            <div class="summary-item">
              <span class="summary-label">Family Name</span>
              <div class="summary-value">${escapeHtml(item.familyName)}</div>
            </div>
            <div class="summary-item">
              <span class="summary-label">Year</span>
              <div class="summary-value">${escapeHtml(item.year)}</div>
            </div>
          </div>

          <div class="current-order-list-card">
            <h4>People &amp; Pets</h4>
            <ol class="review-entry-list">
              ${entriesMarkup}
            </ol>
          </div>

          <div class="current-order-actions">
            <button class="secondary-button" type="button" data-action="edit-order-item" data-item-id="${item.itemId}">Edit Item</button>
            ${removeMarkup}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderCurrentOrder() {
  const items = getOrderItems();
  const { itemCount, subtotal } = getCurrentOrderStats(items);
  const hasItems = items.length > 0;

  if (currentOrderItems) {
    currentOrderItems.innerHTML = items.length === 0
      ? `
        <div class="empty-order-card">
          <h3>Your order is empty</h3>
          <p>Add an ornament to begin building this order.</p>
          <button class="primary-button" type="button" data-action="add-another-ornament">Add Another Ornament</button>
        </div>
      `
      : items.map(createCurrentOrderItemMarkup).join('');
  }

  if (currentOrderSummary) {
    currentOrderSummary.innerHTML = `
      <h3>Order Summary</h3>
      <div class="current-order-stats" aria-live="polite">
        <div class="stat-row">
          <span>Total Items</span>
          <strong>${itemCount}</strong>
        </div>
        <div class="stat-row">
          <span>Item Subtotal</span>
          <strong>${formatPrice(subtotal)}</strong>
        </div>
      </div>
      <p class="current-order-note" data-current-order-note aria-live="polite">${escapeHtml(orderUiState.note)}</p>
      <button class="secondary-button current-order-secondary" type="button" data-action="add-another-ornament">Add Another Ornament</button>
      <button class="primary-button current-order-primary" type="button" data-action="continue-customer-info" ${hasItems ? '' : 'disabled'}>Continue to Customer Information</button>
    `;
  }

  renderCustomerOrderContext();
  renderCurrentOrderUtilityButtons();
}

function resetTreeDraftForNewItem() {
  draft.size = '';
  draft.treeColor = '';
  draft.bowColor = '';
  draft.familyName = '';
  draft.year = '2026';
  draft.entries = [];
  appState.editingItemId = '';
  appState.reviewedItemId = '';
  reviewState.saving = false;
  reviewState.lastAddedItemId = '';
  reviewState.error = '';
  clearOrderUiNote();
  clearDiscardPrompt();
  saveDraft();
  saveAppState();
  renderEntries();
  renderTreeReview();
}

function loadCartItemIntoDraft(itemId) {
  const item = getOrderItems().find((cartItem) => cartItem.itemId === itemId);
  if (!item) {
    return;
  }

  const draftSource = buildDraftFromOrderItem(item);
  draft.size = draftSource.size;
  draft.treeColor = draftSource.treeColor;
  draft.bowColor = draftSource.bowColor;
  draft.familyName = draftSource.familyName;
  draft.year = draftSource.year;
  draft.entries = draftSource.entries;
  appState.editingItemId = item.itemId;
  appState.reviewedItemId = item.itemId;
  clearOrderUiNote();
  reviewState.saving = false;
  reviewState.lastAddedItemId = '';
  reviewState.error = '';
  clearDiscardPrompt();
  saveDraft();
  saveAppState();
  renderEntries();
  renderTreeReview();
  showScreen('tree-customization');
}

function removeOrderItem(itemId) {
  const items = getOrderItems().filter((item) => item.itemId !== itemId);
  saveOrderItems(items);
  if (appState.editingItemId === itemId) {
    appState.editingItemId = '';
  }
  if (appState.reviewedItemId === itemId) {
    appState.reviewedItemId = '';
  }
  saveAppState();
  orderUiState.removeConfirmItemId = '';
  clearOrderUiNote();
  clearDiscardPrompt();
  if (items.length === 0) {
    resetActiveOrderSession();
    return;
  }
  renderCurrentOrder();
}

function openCurrentOrder() {
  clearDiscardPrompt();
  renderCurrentOrder();
  showScreen('current-order');
}

function openTreeReview() {
  reviewState.saving = false;
  reviewState.lastAddedItemId = '';
  reviewState.error = '';
  appState.reviewedItemId = appState.editingItemId || '';
  clearDiscardPrompt();
  renderTreeReview();
  showScreen('tree-review');
}

function addTreeItemToOrder() {
  if (reviewState.saving) {
    return;
  }

  const wasEditing = Boolean(appState.editingItemId);
  reviewState.saving = true;
  reviewState.error = '';
  renderTreeReview();

  try {
    const item = normalizeTreeOrderItem();
    const items = getOrderItems();
    const existingIndex = items.findIndex((existingItem) => existingItem.itemId === item.itemId);
    if (existingIndex >= 0) {
      items.splice(existingIndex, 1, item);
    } else {
      items.push(item);
    }
    saveOrderItems(items);

    const persistedItems = getOrderItems();
    const savedItem = persistedItems.find((persistedItem) => persistedItem.itemId === item.itemId);
    if (!savedItem) {
      throw new Error('save_failed');
    }

    reviewState.saving = false;
    reviewState.lastAddedItemId = item.itemId;
    reviewState.error = '';
    appState.reviewedItemId = item.itemId;
    appState.editingItemId = '';
    saveAppState();
    setOrderUiNote(wasEditing ? 'Tree Ornament updated.' : 'Tree Ornament added to your order.');
    openCurrentOrder();
  } catch {
    reviewState.saving = false;
    reviewState.error = 'We could not save this item. Please try again.';
    renderTreeReview();
  }
}

function addEntry(kind) {
  const { reachedLimit } = getCapacityDetails();
  if (reachedLimit) {
    renderCapacityMessage();
    return;
  }

  const entry = kind === 'person'
    ? { id: createId(), kind: 'person', name: '' }
    : { id: createId(), kind: 'pet', name: '', icon: '', iconOther: '' };

  draft.entries.push(entry);
  saveDraft();
  renderEntries(entry.id);
}

function findEntry(entryId) {
  return draft.entries.find((entry) => entry.id === entryId);
}

function moveEntry(entryId, direction) {
  const index = draft.entries.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    return;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= draft.entries.length) {
    return;
  }

  const [entry] = draft.entries.splice(index, 1);
  draft.entries.splice(targetIndex, 0, entry);
  saveDraft();
  renderEntries();
}

function removeEntry(entryId) {
  draft.entries = draft.entries.filter((entry) => entry.id !== entryId);
  saveDraft();
  renderEntries();
}

function updateEntryField(entryId, field, value) {
  const entry = findEntry(entryId);
  if (!entry) {
    return;
  }

  const normalizedValue = field.includes('name') || field.includes('Other') ? value.replace(/\s{2,}/g, ' ') : value;
  entry[field] = normalizedValue;

  if (field === 'icon' && value !== 'Custom Icon') {
    entry.iconOther = '';
  }

  saveDraft();

  if (field === 'icon') {
    renderEntries();
  }
}

function validateTreeForm() {
  clearTreeFormErrors();

  const values = {
    size: treeFields.size.value,
    treeColor: treeFields.treeColor.value,
    bowColor: treeFields.bowColor.value,
    familyName: sanitizeText(treeFields.familyName.value),
    year: treeFields.year.value.trim()
  };

  let isValid = true;

  Object.entries(allowedValues).forEach(([name, options]) => {
    if (!(name in values)) {
      return;
    }
    if (!options.includes(values[name])) {
      setFieldError(name, 'Please choose an option.');
      isValid = false;
    }
  });

  if (!values.familyName) {
    setFieldError('familyName', 'Please enter a family name.');
    isValid = false;
  }

  const yearNumber = Number.parseInt(values.year, 10);
  const yearLooksValid = /^\d{4}$/.test(values.year) && yearNumber >= 1900 && yearNumber <= 2100;
  if (!yearLooksValid) {
    setFieldError('year', 'Enter a valid 4-digit year.');
    isValid = false;
  }

  if (draft.entries.length === 0) {
    setFieldError('entries', 'Add at least one person or pet.');
    isValid = false;
  }

  const { size, limit, count } = getCapacityDetails();
  if (size === 'Small' && count > limit) {
    setFieldError('entries', 'Small ornaments can include up to 5 combined people and pets.');
    isValid = false;
  }

  entryList.querySelectorAll('.entry-row').forEach((row) => row.classList.remove('is-invalid'));
  entryList.querySelectorAll('[data-entry-error]').forEach((node) => {
    node.textContent = '';
  });

  draft.entries.forEach((entry) => {
    const row = entryList.querySelector(`[data-entry-id="${entry.id}"]`);
    const errorNode = row?.querySelector('[data-entry-error]');
    const messages = [];

    if (!sanitizeText(entry.name)) {
      messages.push(`${entry.kind === 'person' ? 'Person' : 'Pet'} name is required.`);
    }

    if (entry.kind === 'pet') {
      if (!allowedValues.petIcon.includes(entry.icon)) {
        messages.push('Choose an icon.');
      }
      if (entry.icon === 'Custom Icon' && !sanitizeText(entry.iconOther || '')) {
        messages.push('Describe the custom icon.');
      }
    }

    if (messages.length > 0) {
      isValid = false;
      if (row) {
        row.classList.add('is-invalid');
      }
      if (errorNode) {
        errorNode.textContent = messages.join(' ');
      }
    }
  });

  if (!isValid) {
    treeStatus.textContent = 'Please complete the required fields before continuing.';
  }

  return isValid;
}

if (treeForm) {
  loadAppState();
  ensureActiveOrderSession();
  loadDraft();
  loadCustomerDraft();
  renderEntries();
  renderTreeReview();
  renderCurrentOrder();
  renderCustomerOrderContext();
  renderCurrentOrderUtilityButtons();
  renderDiscardPanels();

  if (appState.currentScreen === 'tree-customization') {
    showScreen('tree-customization');
  } else if (appState.currentScreen === 'tree-review' && draft.entries.length > 0) {
    showScreen('tree-review');
  } else if (appState.currentScreen === 'customer-information' && hasOrderItems()) {
    showScreen('customer-information');
  } else if (appState.currentScreen === 'current-order') {
    showScreen('current-order');
  }

  staffButton?.addEventListener('click', () => {
    lastStaffFocusTarget = staffButton;
    const isOpen = !staffPanel?.hidden;
    setStaffPanelState(isOpen ? false : true, false);
  });

  staffPanel?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    if (action === 'staff-reset-kiosk') {
      setStaffPanelState(true, true);
      return;
    }

    if (action === 'close-staff-panel') {
      closeStaffPanel();
      return;
    }

    if (action === 'cancel-staff-reset') {
      setStaffPanelState(true, false);
      return;
    }

    if (action === 'confirm-staff-reset') {
      resetActiveOrderSession();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (staffPanel?.hidden) {
      return;
    }
    const insideStaffControls = target.closest('.staff-controls');
    if (!insideStaffControls) {
      closeStaffPanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || staffPanel?.hidden) {
      return;
    }
    event.preventDefault();
    closeStaffPanel();
  });

  addPersonButton.addEventListener('click', () => addEntry('person'));
  addPetButton.addEventListener('click', () => addEntry('pet'));

  utilityOrderButtons.forEach((button) => {
    button.addEventListener('click', () => {
      openCurrentOrderUtilityFromContext(button.dataset.utilityContext || '');
    });
  });

  treeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    syncDraftFromFields();
    saveDraft();

    if (!validateTreeForm()) {
      return;
    }

    treeStatus.textContent = '';
    openTreeReview();
  });

  Object.entries(treeFields).forEach(([name, field]) => {
    field.addEventListener('input', () => {
      if (name === 'familyName') {
        field.value = field.value.replace(/\s{2,}/g, ' ');
      }
      setFieldError(name, '');
      if (name === 'size') {
        setFieldError('entries', '');
      }
      treeStatus.textContent = '';
      saveDraft();
      if (name === 'size') {
        renderCapacityMessage();
      }
    });

    field.addEventListener('change', () => {
      setFieldError(name, '');
      if (name === 'familyName') {
        field.value = sanitizeText(field.value);
      }
      treeStatus.textContent = '';
      saveDraft();
      if (name === 'size') {
        setFieldError('entries', '');
        renderCapacityMessage();
      }
    });
  });

  entryList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-entry-action]');
    if (!button) {
      return;
    }

    const row = event.target.closest('[data-entry-id]');
    if (!row) {
      return;
    }

    const entryId = row.dataset.entryId;
    const action = button.dataset.entryAction;

    setFieldError('entries', '');
    treeStatus.textContent = '';

    if (action === 'move-up') {
      moveEntry(entryId, 'up');
    } else if (action === 'move-down') {
      moveEntry(entryId, 'down');
    } else if (action === 'remove') {
      removeEntry(entryId);
    }
  });

  entryList.addEventListener('input', (event) => {
    const row = event.target.closest('[data-entry-id]');
    const field = event.target.dataset.entryField;
    if (!row || !field) {
      return;
    }

    updateEntryField(row.dataset.entryId, field, event.target.value);
    row.classList.remove('is-invalid');
    const errorNode = row.querySelector('[data-entry-error]');
    if (errorNode) {
      errorNode.textContent = '';
    }
    setFieldError('entries', '');
    treeStatus.textContent = '';
  });

  entryList.addEventListener('change', (event) => {
    const row = event.target.closest('[data-entry-id]');
    const field = event.target.dataset.entryField;
    if (!row || !field) {
      return;
    }

    if (event.target.tagName === 'INPUT') {
      event.target.value = sanitizeText(event.target.value);
      updateEntryField(row.dataset.entryId, field, event.target.value);
    }

    row.classList.remove('is-invalid');
    const errorNode = row.querySelector('[data-entry-error]');
    if (errorNode) {
      errorNode.textContent = '';
    }
    setFieldError('entries', '');
    treeStatus.textContent = '';
  });

  treeReviewCard?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    if (action === 'edit-tree-review') {
      showScreen('tree-customization');
      return;
    }

    if (action === 'add-tree-to-order') {
      addTreeItemToOrder();
    }
  });

  currentOrderItems?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) {
      return;
    }

    const { action, itemId } = target.dataset;
    clearOrderUiNote();

    if (action === 'edit-order-item' && itemId) {
      loadCartItemIntoDraft(itemId);
      return;
    }

    if (action === 'request-remove-item' && itemId) {
      orderUiState.removeConfirmItemId = itemId;
      renderCurrentOrder();
      return;
    }

    if (action === 'cancel-remove-item') {
      orderUiState.removeConfirmItemId = '';
      renderCurrentOrder();
      return;
    }

    if (action === 'confirm-remove-item' && itemId) {
      removeOrderItem(itemId);
      return;
    }

    if (action === 'add-another-ornament') {
      resetTreeDraftForNewItem();
      showScreen('ornaments');
    }
  });

  currentOrderSummary?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    clearOrderUiNote();

    if (action === 'add-another-ornament') {
      resetTreeDraftForNewItem();
      showScreen('ornaments');
      return;
    }

    if (action === 'continue-customer-info') {
      openCustomerInformation();
    }
  });

  document.querySelectorAll('[data-action="back-current-order"], [data-action="back-current-order-form"]').forEach((button) => {
    button.addEventListener('click', () => {
      clearCustomerFormErrors();
      renderCurrentOrder();
      showScreen('current-order');
    });
  });

  contactChoiceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setPreferredContact(button.dataset.contactChoice || '');
    });
  });

  fulfillmentChoiceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setFulfillmentMethod(button.dataset.fulfillmentChoice || '');
    });
  });

  Object.entries(customerFields).forEach(([name, field]) => {
    field?.addEventListener('input', () => {
      if (name === 'phone') {
        field.value = sanitizePhone(field.value);
      } else if (name === 'email') {
        field.value = sanitizeEmail(field.value);
      } else if (name === 'postalCode') {
        field.value = sanitizePostalCode(field.value);
      } else if (name !== 'neededBy') {
        field.value = field.value.replace(/\s{2,}/g, ' ');
      }

      setCustomerFieldError(name, '');
      if (name === 'country') {
        setCustomerFieldError('postalCode', '');
      }
      if (customerStatus) {
        customerStatus.textContent = '';
      }
      saveCustomerDraft();
    });

    field?.addEventListener('change', () => {
      if (name === 'phone') {
        field.value = sanitizePhone(field.value);
      } else if (name === 'email') {
        field.value = sanitizeEmail(field.value);
      } else if (name === 'postalCode') {
        field.value = sanitizePostalCode(field.value);
      } else if (name !== 'neededBy') {
        field.value = sanitizeText(field.value);
      }

      setCustomerFieldError(name, '');
      if (name === 'country') {
        setCustomerFieldError('postalCode', '');
      }
      if (customerStatus) {
        customerStatus.textContent = '';
      }
      saveCustomerDraft();
    });
  });

  customerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveCustomerDraft();
    validateCustomerForm();
  });

  discardPanels.forEach((panel) => {
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }

      if (action === 'keep-editing-discard') {
        clearDiscardPrompt();
        return;
      }

      if (action === 'discard-and-view-order') {
        resetTreeDraftForNewItem();
        openCurrentOrder();
      }
    });
  });
}
