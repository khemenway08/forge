const screens = [...document.querySelectorAll('[data-screen]')];
const appShell = document.querySelector('.app-shell');
const treeForm = document.querySelector('[data-form="tree-ornament"]');
const treeStatus = document.querySelector('[data-form-status]');
const entryList = document.querySelector('[data-entry-list]');
const capacityMessage = document.querySelector('[data-capacity-message]');
const addPersonButton = document.querySelector('[data-action="add-person"]');
const addPetButton = document.querySelector('[data-action="add-pet"]');
const treeSubmitButton = document.querySelector('[data-tree-submit-button]');
const treeCustomizationImage = document.querySelector('[data-tree-customization-image]');
const customizationEyebrow = document.querySelector('[data-customization-eyebrow]');
const customizationTitle = document.querySelector('[data-customization-title]');
const customizationCopy = document.querySelector('[data-customization-copy]');
const reviewEyebrow = document.querySelector('[data-review-eyebrow]');
const reviewTitle = document.querySelector('[data-review-title]');
const reviewCopy = document.querySelector('[data-review-copy]');
const sizeGroup = document.querySelector('[data-product-field-group="size"]');
const treeColorGroup = document.querySelector('[data-product-field-group="treeColor"]');
const bowColorGroup = document.querySelector('[data-product-field-group="bowColor"]');
const personalizationModeGroup = document.querySelector('[data-product-field-group="personalizationMode"]');
const edgeTextGroup = document.querySelector('[data-product-field-group="edgeText"]');
const familyNameGroup = document.querySelector('[data-product-field-group="familyName"]');
const entriesGroup = document.querySelector('[data-product-field-group="entries"]');
const yearGroup = document.querySelector('[data-product-field-group="year"]');
const familyNameLabel = document.querySelector('[data-field-label="familyName"]');
const familyNameInput = document.querySelector('[name="familyName"]');
const yearLabel = document.querySelector('label[for="ornament-year"]');
const bowColorLabel = document.getElementById('bow-color-label');
const treeReviewCard = document.querySelector('[data-tree-review-card]');
const currentOrderItems = document.querySelector('[data-current-order-items]');
const currentOrderSummary = document.querySelector('[data-current-order-summary]');
const customerForm = document.querySelector('[data-form="customer-information"]');
const finalReviewItems = document.querySelector('[data-final-review-items]');
const finalReviewSummary = document.querySelector('[data-final-review-summary]');
const finalReviewCustomer = document.querySelector('[data-final-review-customer]');
const finalReviewDelivery = document.querySelector('[data-final-review-delivery]');
const finalReviewStatus = document.querySelector('[data-final-review-status]');
const thankYouCopy = document.querySelector('[data-thank-you-copy]');
const thankYouReference = document.querySelector('[data-thank-you-reference]');
const staffOrdersSummary = document.querySelector('[data-staff-orders-summary]');
const staffOrdersSearchInput = document.querySelector('[data-staff-orders-search]');
const staffOrdersFilters = document.querySelector('[data-staff-orders-filters]');
const staffBatchGroups = document.querySelector('[data-staff-batch-groups]');
const staffOrdersList = document.querySelector('[data-staff-orders-list]');
const staffOrdersStatus = document.querySelector('[data-staff-orders-status]');
const readyToPackCount = document.querySelector('[data-ready-to-pack-count]');
const readyToPackList = document.querySelector('[data-ready-to-pack-list]');
const addConfirmationBackdrop = document.querySelector('[data-add-confirmation-backdrop]');
const addConfirmationDialog = document.querySelector('[data-add-confirmation-dialog]');
const addConfirmationItem = document.querySelector('[data-add-confirmation-item]');
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
const debugOrderToolContainers = [...document.querySelectorAll('[data-debug-order-tools]')];
const forgeProductCatalog = globalThis.ForgeProductCatalog;
const forgeOrderPayloadPreview = globalThis.ForgeOrderPayloadPreview;
const forgeOrderStore = globalThis.ForgeOrderStore;
const forgeOrderSubmission = globalThis.ForgeOrderSubmission;
const forgeLocalOrdersQueue = globalThis.ForgeLocalOrdersQueue;
const storageKey = 'forge-tree-ornament-draft';
const orderItemsStorageKey = 'forge-order-items';
const appStateStorageKey = 'forge-app-state';
const customerDraftStorageKey = 'forge-customer-draft';
const savedOrderInspectorState = {
  open: false,
  records: [],
  error: '',
  loading: false
};
const staffOrdersState = {
  enabled: false,
  loading: false,
  records: [],
  searchTerm: '',
  filters: {},
  error: '',
  notice: '',
  noticeTone: 'success',
  detailOpen: false,
  detailOrderUuid: '',
  detailRecord: null,
  detailPackingVerification: null,
  detailLoading: false,
  detailError: '',
  detailSavingLineId: '',
  trayDialogOpen: false,
  trayDialogOrderUuid: '',
  trayDialogRecord: null,
  trayDialogLoading: false,
  trayDialogSaving: false,
  trayDialogError: '',
  trayDialogSelectedTrayNumber: null,
  trayDialogAvailableTrays: [],
  packingDialogOpen: false,
  packingDialogOrderUuid: '',
  packingDialogRecord: null,
  packingDialogPackingVerification: null,
  packingDialogLoading: false,
  packingDialogSaving: false,
  packingDialogError: '',
  packingDialogNote: '',
  packingDialogCheckedLineIds: []
};

if (!forgeProductCatalog) {
  throw new Error('Forge product catalog failed to load before app.js.');
}

if (!forgeOrderPayloadPreview) {
  throw new Error('Forge order payload preview helpers failed to load before app.js.');
}

if (!forgeOrderStore) {
  throw new Error('Forge order store helpers failed to load before app.js.');
}

if (!forgeOrderSubmission) {
  throw new Error('Forge order submission helpers failed to load before app.js.');
}

if (!forgeLocalOrdersQueue) {
  throw new Error('Forge local orders queue helpers failed to load before app.js.');
}

const ornamentProductConfigs = {
  tree_ornament: {
    displayName: 'Tree Ornament',
    galleryProductKey: 'tree',
    requiresSize: true,
    sizeLimits: { Small: 5, Large: 12 },
    preSizeLimit: 12,
    requiresTreeColor: true,
    requiresBowColor: true,
    requiresEntries: true,
    minimumEntryCount: 1,
    customizationCopy: 'Choose colors and personalization details before continuing.',
    updateNote: 'Tree Ornament updated.'
  },
  antler_ornament: {
    displayName: 'Antler Ornament',
    galleryProductKey: 'antler',
    requiresSize: true,
    sizeLimits: { Small: 5, Large: 10 },
    preSizeLimit: 10,
    requiresTreeColor: false,
    requiresBowColor: false,
    requiresEntries: false,
    minimumEntryCount: 0,
    customizationCopy: 'Choose personalization details before continuing.',
    updateNote: 'Antler Ornament updated.'
  },
  present_stack: {
    displayName: 'Present Stack Ornament',
    galleryProductKey: 'present-stack',
    requiresSize: false,
    sizeLimits: {},
    preSizeLimit: 10,
    requiresTreeColor: false,
    requiresBowColor: true,
    requiresEntries: true,
    minimumEntryCount: 1,
    customizationCopy: 'Choose personalization details before continuing.',
    updateNote: 'Present Stack Ornament updated.'
  },
  grinch_tree: {
    displayName: 'Grinch Tree Ornament',
    galleryProductKey: 'grinch',
    requiresSize: false,
    sizeLimits: {},
    preSizeLimit: 10,
    requiresTreeColor: false,
    requiresBowColor: false,
    requiresEntries: true,
    minimumEntryCount: 1,
    customizationCopy: 'Choose personalization details before continuing.',
    updateNote: 'Grinch Tree Ornament updated.'
  },
  babys_first_christmas: {
    displayName: "Baby's First Christmas",
    galleryProductKey: 'baby',
    requiresSize: false,
    sizeLimits: {},
    preSizeLimit: 0,
    requiresTreeColor: false,
    requiresBowColor: true,
    requiresEntries: false,
    minimumEntryCount: 0,
    allowedBowColors: ['Pink', 'Blue', 'Red'],
    customizationCopy: "Choose the bow and stocking color, baby name, and year before continuing.",
    familyFieldLabel: 'Baby Name',
    familyFieldPlaceholder: 'Enter baby name',
    bowColorFieldLabel: 'Bow and Stocking Color',
    updateNote: "Baby's First Christmas updated."
  },
  mr_and_mrs_first_christmas: {
    displayName: 'Mr. & Mrs. Ornament',
    galleryProductKey: 'mr-and-mrs',
    requiresSize: false,
    sizeLimits: {},
    preSizeLimit: 0,
    requiresTreeColor: false,
    requiresBowColor: false,
    requiresEntries: false,
    minimumEntryCount: 0,
    familyFieldLabel: 'Last Name',
    familyFieldPlaceholder: 'Enter last name',
    familyFieldRequiredMessage: 'Please enter the last name.',
    yearFieldRequiredMessage: 'Please enter the year.',
    yearDefaultMode: 'current',
    customizationCopy: 'Choose the last name and year before continuing.',
    updateNote: 'Mr. & Mrs. Ornament updated.'
  },
  reindeer: {
    displayName: 'Reindeer Ornament',
    galleryProductKey: 'reindeer',
    requiresSize: false,
    sizeLimits: {},
    preSizeLimit: 0,
    requiresTreeColor: false,
    requiresBowColor: false,
    requiresEntries: false,
    minimumEntryCount: 0,
    customizationCopy: 'Choose the reindeer name and year before continuing.',
    familyFieldLabel: 'Reindeer Name',
    familyFieldPlaceholder: 'Enter reindeer name',
    updateNote: 'Reindeer Ornament updated.'
  },
  veteran_flag: {
    displayName: 'Veteran Flag Ornament',
    galleryProductKey: 'veteran',
    requiresSize: false,
    sizeLimits: {},
    preSizeLimit: 0,
    requiresTreeColor: false,
    requiresBowColor: false,
    requiresEntries: false,
    minimumEntryCount: 0,
    requiresFamilyName: false,
    requiresYear: false,
    requiresPersonalizationMode: true,
    customizationCopy: 'Choose whether to keep the design as shown or personalize the edge text.',
    updateNote: 'Veteran Flag Ornament updated.'
  }
};

const galleryProductDefinitionMap = {
  tree: 'tree_ornament',
  antler: 'antler_ornament',
  'present-stack': 'present_stack',
  grinch: 'grinch_tree',
  baby: 'babys_first_christmas',
  'mr-and-mrs': 'mr_and_mrs_first_christmas',
  reindeer: 'reindeer',
  veteran: 'veteran_flag'
};

const treeFields = {
  size: document.querySelector('[name="size"]'),
  treeColor: document.querySelector('[name="treeColor"]'),
  bowColor: document.querySelector('[name="bowColor"]'),
  familyName: document.querySelector('[name="familyName"]'),
  personalizationMode: document.querySelector('[name="personalizationMode"]'),
  edgeText: document.querySelector('[name="edgeText"]'),
  year: document.querySelector('[name="year"]')
};

const optionChoiceButtons = [...document.querySelectorAll('[data-choice-field]')];

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
  personalizationMode: ['As Shown', 'Change Edge Text'],
  petIcon: ['Paw', 'Fish', 'No Icon', 'Custom Icon'],
  preferredContact: ['Text', 'Email'],
  fulfillmentMethod: ['Shipping', 'Local Pickup']
};

const productReviewConfig = {
  tree_ornament: {
    galleryImage: {
      src: '/assets/products/family-tree-ornament-small.jpeg',
      alt: 'Tree Ornament — Small',
      width: 1536,
      height: 2048
    },
    imageBySize: {
      Small: {
        src: '/assets/products/family-tree-ornament-small.jpeg',
        alt: 'Tree Ornament — Small',
        width: 1536,
        height: 2048
      },
      Large: {
        src: '/assets/products/family-tree-ornament-large.jpeg',
        alt: 'Tree Ornament — Large',
        width: 1536,
        height: 2048
      }
    },
    fieldLabels: {
      size: 'Size',
      treeColor: 'Tree Color',
      bowColor: 'Bow Color',
      familyName: 'Engraved Text',
      year: 'Year'
    }
  },
  antler_ornament: {
    galleryImage: {
      src: '/assets/products/antler-family-ornament-small.jpeg',
      alt: 'Antler Ornament — Small',
      width: 1536,
      height: 2048
    },
    imageBySize: {
      Small: {
        src: '/assets/products/antler-family-ornament-small.jpeg',
        alt: 'Antler Ornament — Small',
        width: 1536,
        height: 2048
      },
      Large: {
        src: '/assets/products/antler-family-ornament-large.jpeg',
        alt: 'Antler Ornament — Large',
        width: 1516,
        height: 2048
      }
    },
    fieldLabels: {
      size: 'Size',
      familyName: 'Engraved Text',
      year: 'Year'
    }
  },
  present_stack: {
    galleryImage: {
      src: '/assets/products/present-stack-ornament.jpeg',
      alt: 'Present Stack Ornament',
      width: 1536,
      height: 2048
    },
    image: '/assets/products/present-stack-ornament.jpeg',
    imageAlt: 'Present Stack Ornament',
    imageWidth: 1536,
    imageHeight: 2048,
    fieldLabels: {
      bowColor: 'Bow Color',
      familyName: 'Engraved Text',
      year: 'Year'
    }
  },
  grinch_tree: {
    galleryImage: {
      src: '/assets/products/grinch-family-tree.jpg',
      alt: 'Grinch Tree Ornament',
      width: 1536,
      height: 2048
    },
    image: '/assets/products/grinch-family-tree.jpg',
    imageAlt: 'Grinch Tree Ornament',
    imageWidth: 1536,
    imageHeight: 2048,
    fieldLabels: {
      familyName: 'Engraved Text',
      year: 'Year'
    }
  },
  babys_first_christmas: {
    galleryImage: {
      src: '/assets/products/babys-first-christmas-pink.jpeg',
      alt: "Baby's First Christmas ornament",
      width: 1536,
      height: 2048
    },
    image: '/assets/products/babys-first-christmas-pink.jpeg',
    imageAlt: "Baby's First Christmas ornament",
    imageWidth: 1536,
    imageHeight: 2048,
    fieldLabels: {
      bowColor: 'Bow and Stocking Color',
      familyName: 'Baby Name',
      year: 'Year'
    }
  },
  mr_and_mrs_first_christmas: {
    galleryImage: {
      src: '/assets/products/mr-and-mrs-first-christmas.jpeg',
      alt: 'Mr. & Mrs. Ornament',
      width: 1536,
      height: 2048
    },
    image: '/assets/products/mr-and-mrs-first-christmas.jpeg',
    imageAlt: 'Mr. & Mrs. Ornament',
    imageWidth: 1536,
    imageHeight: 2048,
    fieldLabels: {
      familyName: 'Last Name',
      year: 'Year'
    }
  },
  reindeer: {
    galleryImage: {
      src: '/assets/products/reindeer-initial-ornament.jpeg',
      alt: 'Reindeer Ornament',
      width: 2048,
      height: 1536
    },
    image: '/assets/products/reindeer-initial-ornament.jpeg',
    imageAlt: 'Reindeer Ornament',
    imageWidth: 2048,
    imageHeight: 1536,
    fieldLabels: {
      familyName: 'Reindeer Name',
      year: 'Year'
    }
  },
  veteran_flag: {
    galleryImage: {
      src: '/assets/products/veteran-flag-ornament.jpg',
      alt: 'Veteran Flag Ornament',
      width: 1536,
      height: 2048
    },
    image: '/assets/products/veteran-flag-ornament.jpg',
    imageAlt: 'Veteran Flag Ornament',
    imageWidth: 1536,
    imageHeight: 2048,
    fieldLabels: {
      personalizationMode: 'Personalization',
      edgeText: 'Edge Text'
    }
  },
  mr_and_mrs_christmas: {
    image: '/assets/products/mr-and-mrs-first-christmas.jpeg',
    imageAlt: 'Mr. & Mrs. Christmas ornament',
    imageWidth: 1536,
    imageHeight: 2048
  },
  little_reindeer_letter: {
    image: '/assets/products/reindeer-initial-ornament.jpeg',
    imageAlt: 'Little Reindeer Letter Ornament',
    imageWidth: 2048,
    imageHeight: 1536
  }
};

const draft = {
  productDefinitionId: 'tree_ornament',
  size: '',
  treeColor: '',
  bowColor: '',
  familyName: '',
  personalizationMode: '',
  edgeText: '',
  year: '2026',
  entries: []
};

function getCurrentCalendarYear() {
  return String(new Date().getFullYear());
}

function getDefaultYearValue(productDefinitionId = draft.productDefinitionId) {
  const config = getProductConfig(productDefinitionId);
  if (config.requiresYear === false) {
    return '';
  }
  if (config.yearDefaultMode === 'current') {
    return getCurrentCalendarYear();
  }
  return '2026';
}

function isDefaultYearValue(value, productDefinitionId = draft.productDefinitionId) {
  return String(value || '') === getDefaultYearValue(productDefinitionId);
}

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
  activeOrderSessionId: '',
  lastSubmittedOrderUuid: ''
};

const reviewState = {
  saving: false,
  lastAddedItemId: '',
  error: ''
};

const addConfirmationState = {
  open: false,
  itemId: '',
  title: 'Added to Your Order',
  message: 'This ornament has been saved to the current order.'
};

const finalReviewState = {
  message: '',
  tone: '',
  savingOrder: false
};
const payloadPreviewState = {
  enabled: forgeOrderPayloadPreview.isPayloadPreviewEnabled(window.location.search),
  open: false,
  title: 'Normalized Order Payload',
  copy: 'Inspect the current Forge order state as formatted JSON without submitting anything.',
  json: '',
  error: '',
  copyStatus: '',
  copyTone: '',
  payload: null
};
staffOrdersState.enabled = forgeLocalOrdersQueue.isLocalOrdersQueueEnabled(window.location.search);
staffOrdersState.filters = forgeLocalOrdersQueue.createEmptyOrderFilters();

const orderUiState = {
  removeConfirmItemId: '',
  note: '',
  discardContext: ''
};

let orderUiNoteTimer = 0;
let lastStaffFocusTarget = null;
let lastConfirmationFocusTarget = null;
let lastPayloadPreviewFocusTarget = null;
let payloadPreviewBackdrop = null;
let payloadPreviewDialog = null;
let payloadPreviewOutput = null;
let payloadPreviewStatus = null;
let payloadPreviewTriggerButton = null;
let payloadPreviewTitleNode = null;
let payloadPreviewCopyNode = null;
let savedOrdersBackdrop = null;
let savedOrdersDialog = null;
let savedOrdersList = null;
let savedOrdersStatus = null;
let staffOrderDetailBackdrop = null;
let staffOrderDetailDialog = null;
let lastStaffOrderDetailFocusTarget = null;
let staffTrayAssignmentBackdrop = null;
let staffTrayAssignmentDialog = null;
let lastStaffTrayAssignmentFocusTarget = null;
let staffPackingBackdrop = null;
let staffPackingDialog = null;
let lastStaffPackingFocusTarget = null;
const payloadPreviewContextStore = forgeOrderPayloadPreview.createPayloadPreviewContextStore();
const orderStore = forgeOrderStore.createOrderStore();
const submissionContextManager = forgeOrderSubmission.createSubmissionContextManager({
  storage: localStorage
});
const completionReceiptManager = forgeOrderSubmission.createCompletionReceiptManager({
  storage: localStorage
});
const orderSubmissionService = forgeOrderSubmission.createOrderSubmissionService({
  orderStore,
  contextManager: submissionContextManager
});

function getProductConfig(productDefinitionId = draft.productDefinitionId) {
  const resolvedProductDefinitionId = resolveConfiguredProductDefinitionId(productDefinitionId);
  return ornamentProductConfigs[resolvedProductDefinitionId] || ornamentProductConfigs.tree_ornament;
}

function getActiveProductDefinitionId() {
  return resolveConfiguredProductDefinitionId(draft.productDefinitionId);
}

function resolveConfiguredProductDefinitionId(productDefinitionId) {
  const uiProductDefinitionId = forgeProductCatalog.getUiProductDefinitionId(productDefinitionId || '');
  return uiProductDefinitionId && ornamentProductConfigs[uiProductDefinitionId]
    ? uiProductDefinitionId
    : 'tree_ornament';
}

function isColorFieldRequired(fieldName) {
  const config = getProductConfig();
  if (fieldName === 'treeColor') {
    return config.requiresTreeColor;
  }
  if (fieldName === 'bowColor') {
    return config.requiresBowColor;
  }
  return true;
}

function showScreen(name) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === name);
  });
  const isStaffScreen = name === 'staff-orders' || name === 'ready-to-pack';
  document.body.classList.toggle('is-staff-screen', isStaffScreen);
  appShell?.classList.toggle('is-staff-screen', isStaffScreen);
  appState.currentScreen = name;
  saveAppState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCustomizationScreenContent() {
  const config = getProductConfig();
  const showSize = config.requiresSize;
  const showTreeColor = config.requiresTreeColor;
  const showBowColor = config.requiresBowColor;
  const showPersonalizationMode = Boolean(config.requiresPersonalizationMode);
  const currentPersonalizationMode = treeFields.personalizationMode?.value || draft.personalizationMode;
  const showEdgeText = showPersonalizationMode && currentPersonalizationMode === 'Change Edge Text';
  const showFamilyName = config.requiresFamilyName !== false;
  const showEntries = Boolean(config.requiresEntries || config.minimumEntryCount > 0 || config.preSizeLimit > 0);
  const showYear = config.requiresYear !== false;

  if (customizationEyebrow) {
    customizationEyebrow.textContent = config.displayName;
  }
  if (customizationTitle) {
    customizationTitle.textContent = 'Customize your ornament';
  }
  if (customizationCopy) {
    customizationCopy.textContent = config.customizationCopy;
  }
  if (reviewEyebrow) {
    reviewEyebrow.textContent = config.displayName;
  }
  if (reviewTitle) {
    reviewTitle.textContent = 'Review this item';
  }
  if (reviewCopy) {
    reviewCopy.textContent = 'Double-check the ornament details before adding it to the order.';
  }

  if (sizeGroup) {
    sizeGroup.hidden = !showSize;
  }
  if (treeColorGroup) {
    treeColorGroup.hidden = !showTreeColor;
  }
  if (bowColorGroup) {
    bowColorGroup.hidden = !showBowColor;
  }
  if (bowColorLabel) {
    bowColorLabel.textContent = config.bowColorFieldLabel || 'Bow Color';
  }
  if (personalizationModeGroup) {
    personalizationModeGroup.hidden = !showPersonalizationMode;
  }
  if (edgeTextGroup) {
    edgeTextGroup.hidden = !showEdgeText;
  }
  if (familyNameGroup) {
    familyNameGroup.hidden = !showFamilyName;
  }
  if (familyNameLabel) {
    familyNameLabel.textContent = config.familyFieldLabel || 'Family Name or Message';
  }
  if (familyNameInput) {
    familyNameInput.placeholder = config.familyFieldPlaceholder || 'Enter family name or message';
  }
  if (yearLabel) {
    yearLabel.textContent = config.yearFieldLabel || 'Year';
  }
  const allowedBowColors = getAllowedBowColors();
  optionChoiceButtons
    .filter((button) => button.dataset.choiceField === 'bowColor')
    .forEach((button) => {
      button.hidden = !allowedBowColors.includes(button.dataset.choiceValue || '');
    });
  if (entriesGroup) {
    entriesGroup.hidden = !showEntries;
  }
  if (yearGroup) {
    yearGroup.hidden = !showYear;
  }
}

function resetDraftState(productDefinitionId = 'tree_ornament') {
  draft.productDefinitionId = resolveConfiguredProductDefinitionId(productDefinitionId);
  draft.size = '';
  draft.treeColor = '';
  draft.bowColor = '';
  draft.familyName = '';
  draft.personalizationMode = '';
  draft.edgeText = '';
  draft.year = getDefaultYearValue(draft.productDefinitionId);
  draft.entries = [];
  appState.editingItemId = '';
  appState.reviewedItemId = '';
  reviewState.saving = false;
  reviewState.lastAddedItemId = '';
  reviewState.error = '';
  addConfirmationState.open = false;
  addConfirmationState.itemId = '';
  addConfirmationState.title = 'Added to Your Order';
  addConfirmationState.message = 'This ornament has been saved to the current order.';
  clearOrderUiNote();
  clearDiscardPrompt();
  clearTreeFormErrors();
}

function resetDraftForProduct(productDefinitionId) {
  resetDraftState(productDefinitionId);

  hydrateFormFromDraft();
  renderEntries();
  renderTreeReview();
  renderTreeSubmitButton();
  saveDraft();
}

document.querySelector('[data-action="start"]').addEventListener('click', () => {
  showScreen('categories');
});

document.querySelector('[data-action="start-next-order"]')?.addEventListener('click', () => {
  completionReceiptManager.clearReceipt();
  resetActiveOrderSession();
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
    const productDefinitionId = galleryProductDefinitionMap[button.dataset.product || ''];
    if (productDefinitionId) {
      appState.editingItemId = '';
      appState.reviewedItemId = '';
      saveAppState();
      closeAddConfirmation(false);
      clearOrderUiNote();
      clearDiscardPrompt();
      clearTreeFormErrors();
      resetDraftForProduct(productDefinitionId);
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

function renderOptionChoiceButtons() {
  ['size', 'treeColor', 'bowColor', 'personalizationMode'].forEach((fieldName) => {
    const selectedValue = treeFields[fieldName]?.value || '';
    const buttons = optionChoiceButtons.filter((button) => button.dataset.choiceField === fieldName);
    const activeButton = buttons.find((button) => button.dataset.choiceValue === selectedValue);

    buttons.forEach((button, index) => {
      const isSelected = button.dataset.choiceValue === selectedValue;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      button.tabIndex = isSelected || (!activeButton && index === 0) ? 0 : -1;
    });
  });
}

function setOptionChoiceValue(fieldName, value, focusButton = false) {
  const field = treeFields[fieldName];
  if (!field) {
    return;
  }

  field.value = value;
  setFieldError(fieldName, '');
  if (fieldName === 'size') {
    setFieldError('entries', '');
  } else if (fieldName === 'personalizationMode') {
    setFieldError('edgeText', '');
    if (value !== 'Change Edge Text') {
      treeFields.edgeText.value = '';
      draft.edgeText = '';
    }
  }
  treeStatus.textContent = '';
  saveDraft();
  renderOptionChoiceButtons();
  if (fieldName === 'size') {
    renderCapacityMessage();
    renderTreeCustomizationImage();
  }
  if (fieldName === 'personalizationMode') {
    renderCustomizationScreenContent();
  }

  if (focusButton) {
    const selectedButton = optionChoiceButtons.find((button) => button.dataset.choiceField === fieldName && button.dataset.choiceValue === value);
    selectedButton?.focus();
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
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
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
  const config = getProductConfig();
  if (!config.requiresSize) {
    return config.preSizeLimit;
  }
  if (!size) {
    return config.preSizeLimit;
  }
  return config.sizeLimits[size] || config.preSizeLimit;
}

function getCapacityDetails() {
  const config = getProductConfig();
  const size = config.requiresSize ? treeFields.size.value : '';
  const limit = getMaxEntries(size);
  const count = draft.entries.length;
  const reachedLimit = count >= limit;
  const overLimit = count > limit;

  return { size, limit, count, reachedLimit, overLimit };
}

function syncDraftFromFields() {
  const config = getProductConfig();
  draft.productDefinitionId = getActiveProductDefinitionId();
  draft.size = config.requiresSize ? treeFields.size.value : '';
  draft.treeColor = config.requiresTreeColor ? treeFields.treeColor.value : '';
  draft.bowColor = config.requiresBowColor ? treeFields.bowColor.value : '';
  draft.familyName = config.requiresFamilyName === false ? '' : treeFields.familyName.value;
  draft.personalizationMode = config.requiresPersonalizationMode ? treeFields.personalizationMode.value : '';
  draft.edgeText = config.requiresPersonalizationMode && draft.personalizationMode === 'Change Edge Text'
    ? treeFields.edgeText.value
    : '';
  draft.year = config.requiresYear === false ? '' : treeFields.year.value.trim();
}

function hydrateFormFromDraft() {
  renderCustomizationScreenContent();
  treeFields.size.value = draft.size;
  treeFields.treeColor.value = draft.treeColor;
  treeFields.bowColor.value = draft.bowColor;
  treeFields.familyName.value = draft.familyName;
  treeFields.personalizationMode.value = draft.personalizationMode;
  treeFields.edgeText.value = draft.edgeText;
  treeFields.year.value = draft.year || getDefaultYearValue();
  renderOptionChoiceButtons();
  renderCustomizationScreenContent();
  renderTreeCustomizationImage();
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
    if (typeof parsed.lastSubmittedOrderUuid === 'string') {
      appState.lastSubmittedOrderUuid = parsed.lastSubmittedOrderUuid;
    }
  } catch {}
}

function hasRestorableFinalReviewState() {
  return hasOrderItems() && customerDraft.orderSessionId === appState.activeOrderSessionId;
}

function normalizeRestoredScreenState() {
  const completionReceipt = completionReceiptManager.getReceipt();
  const normalizedScreen = forgeOrderSubmission.resolveRestoredScreen({
    currentScreen: appState.currentScreen,
    hasUsableActiveOrder: hasRestorableFinalReviewState(),
    hasCompletedReceipt: Boolean(completionReceipt)
  });
  let stateChanged = false;

  if (normalizedScreen !== appState.currentScreen) {
    appState.currentScreen = normalizedScreen;
    stateChanged = true;
  }

  if (completionReceipt && appState.lastSubmittedOrderUuid !== completionReceipt.forgeOrderUuid) {
    appState.lastSubmittedOrderUuid = completionReceipt.forgeOrderUuid;
    stateChanged = true;
  }

  if (!completionReceipt && !hasRestorableFinalReviewState() && appState.lastSubmittedOrderUuid) {
    appState.lastSubmittedOrderUuid = '';
    stateChanged = true;
  }

  if (stateChanged) {
    saveAppState();
  }

  return completionReceipt;
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      hydrateFormFromDraft();
      return;
    }

    const parsed = JSON.parse(raw);
    draft.productDefinitionId = resolveConfiguredProductDefinitionId(parsed.productDefinitionId);
    draft.size = allowedValues.size.includes(parsed.size) ? parsed.size : '';
    draft.treeColor = allowedValues.treeColor.includes(parsed.treeColor) ? parsed.treeColor : '';
    draft.bowColor = getAllowedBowColors(draft.productDefinitionId).includes(parsed.bowColor) ? parsed.bowColor : '';
    draft.familyName = typeof parsed.familyName === 'string' ? parsed.familyName : '';
    draft.personalizationMode = allowedValues.personalizationMode.includes(parsed.personalizationMode) ? parsed.personalizationMode : '';
    draft.edgeText = typeof parsed.edgeText === 'string' ? parsed.edgeText : '';
    draft.year = typeof parsed.year === 'string' && parsed.year ? parsed.year : getDefaultYearValue(draft.productDefinitionId);
    draft.entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry).filter(Boolean) : [];
  } catch {
    draft.productDefinitionId = 'tree_ornament';
    draft.personalizationMode = '';
    draft.edgeText = '';
    draft.year = getDefaultYearValue('tree_ornament');
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
      : staffPanel.querySelector('[data-action="staff-open-orders"]') || staffPanel.querySelector('[data-action="staff-reset-kiosk"]');
    window.setTimeout(() => focusTarget?.focus(), 0);
  }
}

function closeStaffPanel() {
  setStaffPanelState(false, false);
  if (lastStaffFocusTarget instanceof HTMLElement) {
    lastStaffFocusTarget.focus();
  }
}

function openStaffOrdersScreen() {
  staffOrdersState.enabled = true;
  ensureStaffOrderDetailUi();
  ensureStaffTrayAssignmentUi();
  renderStaffOrdersQueue();
  renderReadyToPackQueue();
  loadStaffOrdersQueue();
  closeStaffPanel();
  showScreen('staff-orders');
}

function openReadyToPackScreen() {
  staffOrdersState.enabled = true;
  ensureStaffOrderDetailUi();
  ensureStaffTrayAssignmentUi();
  renderStaffOrdersQueue();
  renderReadyToPackQueue();
  loadStaffOrdersQueue();
  closeStaffPanel();
  showScreen('ready-to-pack');
}

function resetActiveOrderSession({ clearCart = true, goToWelcome = true } = {}) {
  const previousOrderSessionId = appState.activeOrderSessionId;
  if (clearCart) {
    saveOrderItems([]);
  }

  draft.productDefinitionId = 'tree_ornament';
  draft.size = '';
  draft.treeColor = '';
  draft.bowColor = '';
  draft.familyName = '';
  draft.personalizationMode = '';
  draft.edgeText = '';
  draft.year = getDefaultYearValue('tree_ornament');
  draft.entries = [];
  localStorage.removeItem(storageKey);

  localStorage.removeItem(customerDraftStorageKey);
  localStorage.removeItem(orderItemsStorageKey);

  clearOrderUiNote();
  clearDiscardPrompt();
  orderUiState.removeConfirmItemId = '';
  closeAddConfirmation(false);
  closePayloadPreview(false);
  closeSavedOrdersInspector();
  completionReceiptManager.clearReceipt();

  appState.editingItemId = '';
  appState.reviewedItemId = '';
  appState.lastSubmittedOrderUuid = '';
  appState.activeOrderSessionId = createSessionId();
  saveAppState();
  submissionContextManager.clearContext(previousOrderSessionId);

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
  renderDebugOrderTools();
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

  if (!hasOrderItems()) {
    if (customerStatus) {
      customerStatus.textContent = 'Add at least one item before continuing.';
    }
    return false;
  }

  const issues = getCustomerValidationIssues();

  if (issues.length > 0) {
    const firstIssue = issues[0];
    issues.forEach((issue) => setCustomerFieldError(issue.field, issue.message));
    if (customerStatus) {
      customerStatus.textContent = 'Please complete the required customer information.';
    }
    const target = getCustomerFieldTarget(firstIssue.field);
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
  const config = getProductConfig();
  const { size, limit, count, reachedLimit, overLimit } = getCapacityDetails();

  if (!config.requiresSize) {
    if (overLimit) {
      capacityMessage.textContent = `${config.displayName} supports up to ${limit} combined people and pets. Remove ${count - limit} entr${count - limit === 1 ? 'y' : 'ies'} before continuing.`;
    } else if (reachedLimit) {
      capacityMessage.textContent = `${config.displayName} is full at ${limit} combined people and pets. Remove one to add another.`;
    } else {
      capacityMessage.textContent = `${config.displayName} allows up to ${limit} combined people and pets. ${limit - count} slot${limit - count === 1 ? '' : 's'} remaining.`;
    }
  } else if (!size) {
    capacityMessage.textContent = `Choose a size to lock the limit. Up to ${config.preSizeLimit} combined people and pets can be drafted before size is selected.`;
  } else if (overLimit) {
    capacityMessage.textContent = `${size} supports up to ${limit} combined people and pets. Remove ${count - limit} entr${count - limit === 1 ? 'y' : 'ies'} before continuing.`;
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
    entryList.innerHTML = `
      <li class="entry-empty-state">
        <strong>No people or pets added yet.</strong>
        <span>Use Add Person or Add Pet below. Names will appear in engraving order.</span>
      </li>
    `;
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

function capitalizeWords(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatFieldLabel(key, item) {
  const productConfig = productReviewConfig[item.productDefinitionId] || {};
  const productLabels = productConfig.fieldLabels || {};
  const sharedLabels = {
    familyName: 'Engraved Text',
    lastName: 'Last Name',
    babyName: 'Baby Name',
    year: 'Year',
    weddingYear: 'Wedding Year',
    establishedYear: 'Established Year',
    treeColor: 'Tree Color',
    bowColor: 'Bow Color',
    edgeText: 'Edge Text',
    personalizationMode: 'Personalization',
    neededBy: 'Needed By',
    icon: 'Icon',
    letter: 'Letter',
    name: 'Name'
  };

  return productLabels[key] || sharedLabels[key] || capitalizeWords(key);
}

function getFamilyFieldLabel(productDefinitionId = getActiveProductDefinitionId()) {
  const config = getProductConfig(productDefinitionId);
  if (config.familyFieldLabel) {
    return config.familyFieldLabel;
  }
  const reviewConfig = productReviewConfig[productDefinitionId] || {};
  if (reviewConfig.fieldLabels?.familyName) {
    return reviewConfig.fieldLabels.familyName;
  }
  return 'Engraved Text';
}

function getFamilyFieldRequiredMessage(productDefinitionId = getActiveProductDefinitionId()) {
  const config = getProductConfig(productDefinitionId);
  if (config.familyFieldRequiredMessage) {
    return config.familyFieldRequiredMessage;
  }
  return `Please enter ${getFamilyFieldLabel(productDefinitionId).toLowerCase()}.`;
}

function getYearFieldRequiredMessage(productDefinitionId = getActiveProductDefinitionId()) {
  const config = getProductConfig(productDefinitionId);
  if (config.yearFieldRequiredMessage) {
    return config.yearFieldRequiredMessage;
  }
  return 'Enter a valid 4-digit year.';
}

function getAllowedBowColors(productDefinitionId = getActiveProductDefinitionId()) {
  const config = getProductConfig(productDefinitionId);
  return Array.isArray(config.allowedBowColors) && config.allowedBowColors.length > 0
    ? config.allowedBowColors
    : allowedValues.bowColor;
}

function formatDisplayValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function formatCustomerPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return sanitizeText(String(value || ''));
}

function formatReadableDate(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(parsed);
}

function formatReadableDateTime(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed);
}

function getColorSwatchTone(value) {
  const normalized = sanitizeText(String(value || '')).toLowerCase();
  if (normalized === 'pink') {
    return 'pink';
  }
  if (normalized === 'blue') {
    return 'blue';
  }
  if (normalized === 'green') {
    return 'green';
  }
  if (normalized === 'brown') {
    return 'brown';
  }
  if (normalized === 'red') {
    return 'red';
  }
  if (normalized === 'white') {
    return 'white';
  }
  return '';
}

function getColorSwatchInlineStyle(value) {
  const tone = getColorSwatchTone(value);
  if (tone === 'pink') {
    return 'background:#d98ca3;';
  }
  if (tone === 'blue') {
    return 'background:#4a74a8;';
  }
  return '';
}

function getColorDisplayMarkup(value) {
  const label = formatDisplayValue(value);
  const tone = getColorSwatchTone(label);
  const swatchStyle = getColorSwatchInlineStyle(label);
  return `
    <span class="color-display">
      ${tone ? `<span class="color-swatch color-swatch--${tone}" aria-hidden="true"${swatchStyle ? ` style="${swatchStyle}"` : ''}></span>` : ''}
      <span>${escapeHtml(label || 'Not selected')}</span>
    </span>
  `;
}

function getCompactColorDisplayMarkup(value, noun) {
  const label = formatDisplayValue(value);
  const tone = getColorSwatchTone(label);
  const swatchStyle = getColorSwatchInlineStyle(label);
  return `
    <span class="color-display">
      ${tone ? `<span class="color-swatch color-swatch--${tone}" aria-hidden="true"${swatchStyle ? ` style="${swatchStyle}"` : ''}></span>` : ''}
      <span>${escapeHtml(label || 'Not selected')} ${escapeHtml(noun)}</span>
    </span>
  `;
}

function isNonEmptyDisplayValue(value) {
  return typeof value === 'string' ? Boolean(sanitizeText(value)) : value !== null && value !== undefined && value !== '';
}

function getProductReviewConfig(itemOrProductDefinitionId) {
  const productDefinitionId = typeof itemOrProductDefinitionId === 'string'
    ? itemOrProductDefinitionId
    : itemOrProductDefinitionId?.productDefinitionId;

  if (productDefinitionId && productReviewConfig[productDefinitionId]) {
    return productReviewConfig[productDefinitionId];
  }
  return null;
}

function getProductImageSize(configuration) {
  if (!configuration || typeof configuration !== 'object') {
    return '';
  }

  if (typeof configuration.size === 'string' && allowedValues.size.includes(configuration.size)) {
    return configuration.size;
  }

  if (configuration.configurationSnapshot && typeof configuration.configurationSnapshot === 'object') {
    const nestedSize = configuration.configurationSnapshot.size;
    if (typeof nestedSize === 'string' && allowedValues.size.includes(nestedSize)) {
      return nestedSize;
    }
  }

  return '';
}

function getResolvedProductImage(productDefinitionId, configuration = {}, context = 'default') {
  const config = getProductReviewConfig(productDefinitionId);
  if (!config) {
    return null;
  }

  const size = getProductImageSize(configuration);
  const galleryImage = config.galleryImage || config.imageBySize?.Small || null;
  const sizeImage = size && config.imageBySize ? config.imageBySize[size] || null : null;
  const image = (
    (context === 'gallery' && galleryImage)
    || sizeImage
    || config.imageBySize?.Small
    || (config.image ? {
      src: config.image,
      alt: config.imageAlt,
      width: config.imageWidth,
      height: config.imageHeight
    } : null)
  );

  if (!image?.src) {
    return null;
  }

  return {
    src: image.src,
    alt: image.alt || `${sanitizeText(configuration?.displayName || '') || 'Custom item'} product photo`,
    width: image.width || 360,
    height: image.height || 480
  };
}

function applyDynamicOrderPricing(items) {
  const normalizedItems = Array.isArray(items)
    ? items.map(normalizeOrderItemRecord).filter(Boolean)
    : [];
  return forgeProductCatalog.applyCatalogPricingToItems(normalizedItems);
}

function getProductUnitPrice(productDefinitionId = getActiveProductDefinitionId(), size = draft.size, options = {}) {
  const orderItems = Array.isArray(options.orderItems) ? options.orderItems : getOrderItems();
  return forgeProductCatalog.getFinalUnitPriceDollars(productDefinitionId, {
    size,
    orderItems,
    includeCurrentDraft: Boolean(options.includeCurrentDraft),
    currentDraftQuantity: options.currentDraftQuantity,
    editingItemId: options.editingItemId
  });
}

function getResolvedItemImageData(item) {
  const config = getProductReviewConfig(item);
  const fallbackResolvedImage = getResolvedProductImage(item?.productDefinitionId || '', item || {}, 'default');
  const snapshotPath = typeof item?.imagePath === 'string' && sanitizeText(item.imagePath)
    ? sanitizeText(item.imagePath)
    : (typeof item?.image === 'string' && sanitizeText(item.image)
      ? sanitizeText(item.image)
      : '');
  const resolvedImage = snapshotPath
    ? {
        src: snapshotPath,
        alt: fallbackResolvedImage?.alt || config?.imageAlt || `${sanitizeText(item?.displayName) || 'Custom item'} product photo`,
        width: fallbackResolvedImage?.width || config?.imageWidth || 360,
        height: fallbackResolvedImage?.height || config?.imageHeight || 480
      }
    : fallbackResolvedImage;

  if (!resolvedImage?.src) {
    return null;
  }

  return resolvedImage;
}

function renderTreeCustomizationImage() {
  if (!treeCustomizationImage) {
    return;
  }

  const productDefinitionId = getActiveProductDefinitionId();
  const imageData = getResolvedProductImage(productDefinitionId, { size: treeFields.size.value || draft.size }, 'default')
    || getResolvedProductImage(productDefinitionId, {}, 'gallery');

  if (!imageData) {
    return;
  }

  treeCustomizationImage.src = imageData.src;
  treeCustomizationImage.alt = imageData.alt;
  treeCustomizationImage.width = imageData.width;
  treeCustomizationImage.height = imageData.height;
}

function getItemImageMarkup(item, imageClass = 'current-order-photo', options = {}) {
  const imageData = getResolvedItemImageData(item);
  const className = imageClass ? ` class="${escapeAttribute(imageClass)}"` : '';
  const loading = options.loading ? ` loading="${escapeAttribute(options.loading)}"` : '';
  const decoding = options.decoding === 'sync' ? 'sync' : 'async';

  if (imageData) {
    return `<img${className} src="${escapeAttribute(imageData.src)}" alt="${escapeAttribute(imageData.alt)}" width="${imageData.width}" height="${imageData.height}" decoding="${decoding}"${loading}>`;
  }

  return `
    <div class="review-image-fallback" role="img" aria-label="${escapeAttribute(`${item.displayName || 'Custom Item'} product photo unavailable`)}">
      <span>${escapeHtml(item.displayName || 'Custom Item')}</span>
      <span>Product photo unavailable</span>
    </div>
  `;
}

function getScalarItemFields(item) {
  const fields = [];
  const snapshot = item.configurationSnapshot && typeof item.configurationSnapshot === 'object'
    ? item.configurationSnapshot
    : {};
  const excludedKeys = new Set(['entries', 'orderedEntries', 'itemId', 'displayName', 'productDefinitionId', 'category', 'quantity', 'unitPrice', 'peopleCount', 'petCount', 'hasCustomIcon']);

  Object.entries(snapshot).forEach(([key, value]) => {
    if (excludedKeys.has(key)) {
      return;
    }
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      return;
    }
    const displayValue = formatDisplayValue(value);
    if (!isNonEmptyDisplayValue(displayValue)) {
      return;
    }
    fields.push({
      key,
      label: formatFieldLabel(key, item),
      value: displayValue
    });
  });

  return fields;
}

function getFieldPriority(key) {
  if (key === 'size') {
    return 0;
  }
  if (/color/i.test(key)) {
    return 1;
  }
  if (['familyName', 'lastName', 'babyName', 'name', 'letter', 'edgeText', 'personalizationMode'].includes(key)) {
    return 2;
  }
  if (/year/i.test(key)) {
    return 3;
  }
  return 4;
}

function getOrderedItemFields(item) {
  return getScalarItemFields(item)
    .map((field, index) => ({ ...field, index }))
    .sort((left, right) => {
      const priorityDiff = getFieldPriority(left.key) - getFieldPriority(right.key);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.index - right.index;
    });
}

function getReviewOrderedEntriesMarkup(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '';
  }

  return `
    <div class="review-list-card">
      <h4>Engraving Order</h4>
      <p class="review-list-subtitle">People &amp; Pets</p>
      <ol class="review-entry-list">
        ${entries.map((entry, index) => {
          const detailParts = [];
          if (entry.kind === 'pet' && entry.petType) {
            detailParts.push(escapeHtml(formatDisplayValue(entry.petType)));
          }
          if (entry.kind === 'pet' && entry.icon) {
            detailParts.push(escapeHtml(formatDisplayValue(entry.icon)));
          }
          if (entry.customIconDescription) {
            detailParts.push(`Custom icon: ${escapeHtml(formatDisplayValue(entry.customIconDescription))}`);
          }

          return `
            <li class="review-entry-item">
              <span class="review-entry-position">${index + 1}.</span>
              <div class="review-entry-body">
                <div class="review-entry-primary">
                  <span class="review-entry-name">${escapeHtml(formatDisplayValue(entry.name) || 'Unnamed')}</span>
                  <span class="review-entry-badge">${entry.kind === 'pet' ? 'Pet' : 'Person'}</span>
                </div>
                ${detailParts.length > 0 ? `<div class="review-entry-detail">${detailParts.join(' • ')}</div>` : ''}
              </div>
            </li>
          `;
        }).join('')}
      </ol>
    </div>
  `;
}

function getDetailedItemMarkup(item, options = {}) {
  const orderedFields = getOrderedItemFields(item);
  const sizeField = orderedFields.find((field) => field.key === 'size');
  const colorFields = orderedFields.filter((field) => /color/i.test(field.key));
  const primaryFields = orderedFields.filter((field) => ['familyName', 'lastName', 'babyName', 'name', 'letter', 'edgeText', 'personalizationMode'].includes(field.key));
  const yearFields = orderedFields.filter((field) => /year/i.test(field.key));
  const secondaryFields = orderedFields.filter((field) => (
    field !== sizeField
    && !colorFields.includes(field)
    && !primaryFields.includes(field)
    && !yearFields.includes(field)
  ));
  const subtitleMarkup = options.subtitle
    ? `<p class="review-subtitle">${escapeHtml(options.subtitle)}</p>`
    : '';
  const actionsMarkup = options.actionsMarkup || '';
  const statusMarkup = options.statusMarkup || '';
  const wrapperClass = options.wrapperClass || '';
  const wrapperClassAttribute = wrapperClass ? ` class="${escapeAttribute(wrapperClass)}"` : '';
  const imageMarkup = options.imageMarkup || getItemImageMarkup(item, 'review-product-photo');
  const primaryContent = [
    ...primaryFields.map((field) => `
      <div class="${field.key === 'familyName' ? 'review-highlight' : 'summary-item'}">
        <span class="summary-label">${escapeHtml(field.label)}</span>
        <div class="summary-value">${escapeHtml(field.value)}</div>
      </div>
    `),
    ...yearFields.map((field) => `
      <div class="summary-item">
        <span class="summary-label">${escapeHtml(field.label)}</span>
        <div class="summary-value">${escapeHtml(field.value)}</div>
      </div>
    `)
  ].join('');
  const selectionRows = [
    ...(sizeField ? [`
      <div class="review-selection-row">
        <span class="summary-label">${escapeHtml(sizeField.label)}</span>
        <div class="summary-value">${escapeHtml(sizeField.value)}</div>
      </div>
    `] : []),
    ...colorFields.map((field) => `
      <div class="review-selection-row">
        <span class="summary-label">${escapeHtml(field.label)}</span>
        <div class="summary-value">${getColorDisplayMarkup(field.value)}</div>
      </div>
    `),
    ...secondaryFields.map((field) => `
      <div class="review-selection-row">
        <span class="summary-label">${escapeHtml(field.label)}</span>
        <div class="summary-value">${escapeHtml(field.value)}</div>
      </div>
    `)
  ].join('');

  return `
    <article${wrapperClassAttribute}>
      <div class="review-card-layout">
        <div class="review-media">
          ${imageMarkup}
        </div>
        <div class="review-copy">
          <div class="review-header">
            <div>
              <h3>${escapeHtml(item.displayName)}</h3>
              ${subtitleMarkup}
            </div>
            <div class="review-price">
              <strong>${formatPrice(item.unitPrice * item.quantity)}</strong>
              <span>${item.quantity} × ${formatPrice(item.unitPrice)}</span>
            </div>
          </div>

          <div class="review-detail-group">
            ${primaryContent ? `
              <div class="review-primary-card">
                <h4>Primary Personalization</h4>
                <div class="review-primary-grid">
                  ${primaryContent}
                </div>
              </div>
            ` : ''}

            ${selectionRows ? `
              <div class="review-selections-card">
                <h4>Product Selections</h4>
                ${selectionRows}
              </div>
            ` : ''}

            ${getReviewOrderedEntriesMarkup(item.orderedEntries)}
          </div>

          ${statusMarkup}
          ${actionsMarkup}
        </div>
      </div>
    </article>
  `;
}

function createFinalReviewItemMarkup(item) {
  return getDetailedItemMarkup(item, {
    wrapperClass: 'order-summary-card final-review-item-card'
  });
}

function getCustomerValidationIssues() {
  const issues = [];

  if (!customerDraft.fullName) {
    issues.push({ field: 'fullName', message: 'Please enter your full name.' });
  }

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerDraft.email);
  if (!customerDraft.email) {
    issues.push({ field: 'email', message: 'Please enter an email address.' });
  } else if (!emailLooksValid) {
    issues.push({ field: 'email', message: 'Enter a valid email address.' });
  }

  const phoneDigits = customerDraft.phone.replace(/\D/g, '');
  if (!customerDraft.phone) {
    issues.push({ field: 'phone', message: 'Please enter a phone number.' });
  } else if (phoneDigits.length < 10) {
    issues.push({ field: 'phone', message: 'Enter a valid phone number.' });
  }

  if (!allowedValues.preferredContact.includes(customerDraft.preferredContact)) {
    issues.push({ field: 'preferredContact', message: 'Choose how you would like us to contact you.' });
  }

  if (!allowedValues.fulfillmentMethod.includes(customerDraft.fulfillmentMethod)) {
    issues.push({ field: 'fulfillmentMethod', message: 'Choose shipping or local pickup.' });
  }

  if (customerDraft.fulfillmentMethod === 'Shipping') {
    if (!customerDraft.addressLine1) {
      issues.push({ field: 'addressLine1', message: 'Please enter address line 1.' });
    }
    if (!customerDraft.city) {
      issues.push({ field: 'city', message: 'Please enter a city.' });
    }
    if (!customerDraft.state) {
      issues.push({ field: 'state', message: 'Please enter a state.' });
    }
    if (!customerDraft.postalCode) {
      issues.push({ field: 'postalCode', message: 'Please enter a postal code.' });
    } else if (isUnitedStatesCountry(customerDraft.country) && !/^\d{5}(-\d{4})?$/.test(customerDraft.postalCode)) {
      issues.push({ field: 'postalCode', message: 'Enter a 5-digit ZIP code or ZIP+4.' });
    }
    if (!customerDraft.country) {
      issues.push({ field: 'country', message: 'Please enter a country.' });
    }
  }

  if (customerDraft.neededBy) {
    const today = getTodayIsoDate();
    if (customerDraft.neededBy < today) {
      issues.push({ field: 'neededBy', message: 'Needed-by date cannot be earlier than today.' });
    }
  }

  return issues;
}

function getOrnamentOrderItemValidationIssues(item) {
  const issues = [];
  const config = getProductConfig(item.productDefinitionId);
  const size = item.size;
  const limit = config.requiresSize ? (config.sizeLimits[size] || 0) : config.preSizeLimit;
  const entries = Array.isArray(item.orderedEntries) ? item.orderedEntries : [];
  const minimumEntryCount = Number.isFinite(config.minimumEntryCount) ? config.minimumEntryCount : (config.requiresEntries ? 1 : 0);
  const expectedUnitPrice = getProductUnitPrice(item.productDefinitionId, size);

  if (config.requiresSize && !allowedValues.size.includes(size)) {
    issues.push('Choose a valid size.');
  }
  if (config.requiresTreeColor && !allowedValues.treeColor.includes(item.treeColor)) {
    issues.push('Choose a valid tree color.');
  }
  if (config.requiresBowColor && !getAllowedBowColors(item.productDefinitionId).includes(item.bowColor)) {
    issues.push('Choose a valid bow color.');
  }
  if (config.requiresPersonalizationMode && !allowedValues.personalizationMode.includes(item.personalizationMode)) {
    issues.push('Choose a personalization option.');
  }
  if (config.requiresFamilyName !== false && !sanitizeText(item.familyName || '')) {
    issues.push(item.productDefinitionId === 'mr_and_mrs_first_christmas'
      ? 'Enter the last name.'
      : `Enter the ${getFamilyFieldLabel(item.productDefinitionId).toLowerCase()}.`);
  }
  if (config.requiresPersonalizationMode && item.personalizationMode === 'Change Edge Text' && !sanitizeText(item.edgeText || '')) {
    issues.push('Enter the edge text.');
  }
  if (config.requiresYear !== false && !sanitizeText(item.year || '')) {
    issues.push(item.productDefinitionId === 'mr_and_mrs_first_christmas'
      ? 'Enter the year.'
      : 'Enter a valid year.');
  } else if (config.requiresYear !== false && !/^\d{4}$/.test(item.year || '')) {
    issues.push('Enter a valid year.');
  }
  if (minimumEntryCount > 0 && entries.length < minimumEntryCount) {
    issues.push('Add at least one person or pet.');
  }
  if (Number.isFinite(expectedUnitPrice) && expectedUnitPrice > 0 && item.unitPrice !== expectedUnitPrice) {
    issues.push('This item has invalid pricing.');
  }
  if (limit && entries.length > limit) {
    issues.push(config.requiresSize
      ? `${size} ornaments support up to ${limit} combined people and pets.`
      : `This ornament supports up to ${limit} combined people and pets.`);
  }

  entries.forEach((entry) => {
    if (!entry || (entry.kind !== 'person' && entry.kind !== 'pet')) {
      issues.push('Each ornament entry must be a person or pet.');
      return;
    }
    if (!sanitizeText(entry.name || '')) {
      issues.push(`${entry.kind === 'pet' ? 'Pet' : 'Person'} names are required.`);
    }
    if (entry.kind === 'pet') {
      if (!allowedValues.petIcon.includes(entry.icon)) {
        issues.push('Each pet needs an icon choice.');
      }
      if (entry.icon === 'Custom Icon' && !sanitizeText(entry.customIconDescription || '')) {
        issues.push('Each custom icon needs a description.');
      }
    }
  });

  return issues;
}

function getOrderItemValidationIssues(item) {
  const issues = [];
  const hasKnownDefinition = Boolean(item.productDefinitionId);
  const hasValidSnapshot = Boolean(item.configurationSnapshot && typeof item.configurationSnapshot === 'object');

  if (!hasKnownDefinition && !hasValidSnapshot) {
    issues.push('This item is missing its saved configuration.');
  }
  if (!item.displayName) {
    issues.push('This item is missing its product name.');
  }
  if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
    issues.push('This item has invalid pricing.');
  }
  if (!Number.isFinite(item.quantity) || item.quantity < 1) {
    issues.push('This item has an invalid quantity.');
  }

  if (ornamentProductConfigs[item.productDefinitionId]) {
    issues.push(...getOrnamentOrderItemValidationIssues(item));
  }

  return issues;
}

function validateFinalReviewDraft() {
  const items = getOrderItems();
  const issues = [];

  if (!appState.activeOrderSessionId) {
    issues.push('Start a new order before continuing.');
  }
  if (items.length === 0) {
    issues.push('Your order is empty. Use Edit Items to add an item before placing your order.');
  }

  items.forEach((item) => {
    getOrderItemValidationIssues(item).forEach((message) => {
      issues.push(`Review "${item.displayName || 'this item'}": ${message}`);
    });
  });

  getCustomerValidationIssues().forEach((issue) => {
    issues.push(`Use Edit Customer Information: ${issue.message}`);
  });

  return {
    isValid: issues.length === 0,
    issues
  };
}

function formatPrice(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
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
  const productDefinitionId = getActiveProductDefinitionId();
  const config = getProductConfig(productDefinitionId);
  const unitPrice = getProductUnitPrice(productDefinitionId, draft.size, {
    orderItems: getOrderItems(),
    includeCurrentDraft: true,
    editingItemId: appState.editingItemId
  });
  const item = {
    displayName: config.displayName,
    productDefinitionId,
    quantity: 1,
    unitPrice,
    configurationSnapshot: {
      ...(config.requiresSize ? { size: draft.size } : {}),
      ...(config.requiresFamilyName === false ? {} : { familyName: draft.familyName }),
      ...(config.requiresPersonalizationMode ? { personalizationMode: draft.personalizationMode } : {}),
      ...(config.requiresPersonalizationMode && draft.personalizationMode === 'Change Edge Text' && draft.edgeText ? { edgeText: draft.edgeText } : {}),
      ...(config.requiresYear === false ? {} : { year: draft.year }),
      ...(config.requiresTreeColor ? { treeColor: draft.treeColor } : {}),
      ...(config.requiresBowColor ? { bowColor: draft.bowColor } : {})
    },
    orderedEntries: draft.entries.map((entry) => ({
      position: 0,
      kind: entry.kind,
      name: entry.name,
      icon: entry.kind === 'pet' ? entry.icon : '',
      customIconDescription: entry.kind === 'pet' ? entry.iconOther || '' : ''
    }))
  };
  const statusMessage = reviewState.error || '';
  const statusClass = reviewState.error ? 'inline-confirmation is-error' : 'inline-confirmation';
  const actionLabel = 'Add to Order';

  return getDetailedItemMarkup(item, {
    subtitle: 'Item-level review before adding this ornament to the order.',
    imageMarkup: getItemImageMarkup(item, 'review-product-photo'),
    statusMarkup: `<p class="${statusClass}" data-review-confirmation aria-live="polite">${statusMessage}</p>`,
    actionsMarkup: `
      <div class="review-actions">
        <button class="secondary-button" type="button" data-action="edit-tree-review">Back to Edit</button>
        <button class="primary-button" type="button" data-action="add-tree-to-order" ${reviewState.saving ? 'disabled' : ''}>
          ${reviewState.saving ? 'Saving...' : actionLabel}
        </button>
      </div>
    `
  });
}

function normalizeTreeOrderItem() {
  const productDefinitionId = getActiveProductDefinitionId();
  const config = getProductConfig(productDefinitionId);
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
  const unitPrice = getProductUnitPrice(productDefinitionId, draft.size, {
    orderItems: getOrderItems(),
    includeCurrentDraft: true,
    editingItemId: appState.editingItemId
  });
  const configurationSnapshot = {
    ...(config.requiresSize ? { size: draft.size } : {}),
    ...(config.requiresFamilyName === false ? {} : { familyName: draft.familyName }),
    ...(config.requiresPersonalizationMode ? { personalizationMode: draft.personalizationMode } : {}),
    ...(config.requiresPersonalizationMode && draft.personalizationMode === 'Change Edge Text' && draft.edgeText ? { edgeText: draft.edgeText } : {}),
    ...(config.requiresYear === false ? {} : { year: draft.year }),
    ...(config.requiresEntries || entries.length > 0 ? { entries } : {}),
    ...(config.requiresTreeColor ? { treeColor: draft.treeColor } : {}),
    ...(config.requiresBowColor ? { bowColor: draft.bowColor } : {})
  };

  return {
    itemId: appState.editingItemId || `${productDefinitionId}-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productDefinitionId,
    imagePath: getResolvedProductImage(productDefinitionId, { size: draft.size }, 'default')?.src || '',
    displayName: config.displayName,
    category: 'ornament',
    quantity: 1,
    unitPrice,
    size: config.requiresSize ? draft.size : '',
    treeColor: config.requiresTreeColor ? draft.treeColor : '',
    bowColor: config.requiresBowColor ? draft.bowColor : '',
    familyName: config.requiresFamilyName === false ? '' : draft.familyName,
    personalizationMode: config.requiresPersonalizationMode ? draft.personalizationMode : '',
    edgeText: config.requiresPersonalizationMode && draft.personalizationMode === 'Change Edge Text' ? draft.edgeText : '',
    year: config.requiresYear === false ? '' : draft.year,
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
    imagePath: typeof record.imagePath === 'string'
      ? sanitizeText(record.imagePath)
      : (typeof record.image === 'string' ? sanitizeText(record.image) : ''),
    displayName,
    category,
    quantity,
    unitPrice,
    size: typeof record.size === 'string' ? record.size : '',
    treeColor: typeof record.treeColor === 'string' ? record.treeColor : '',
    bowColor: typeof record.bowColor === 'string' ? record.bowColor : '',
    familyName: typeof record.familyName === 'string' ? record.familyName : '',
    personalizationMode: typeof record.personalizationMode === 'string' ? record.personalizationMode : '',
    edgeText: typeof record.edgeText === 'string' ? record.edgeText : '',
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
    return Array.isArray(parsed) ? applyDynamicOrderPricing(parsed) : [];
  } catch {
    return [];
  }
}

function saveOrderItems(items) {
  localStorage.setItem(orderItemsStorageKey, JSON.stringify(applyDynamicOrderPricing(items)));
}

function isTreeDraftBlank() {
  const config = getProductConfig();
  return (!config.requiresSize || !draft.size)
    && (!config.requiresTreeColor || !draft.treeColor)
    && (!config.requiresBowColor || !draft.bowColor)
    && (config.requiresFamilyName === false || !sanitizeText(draft.familyName))
    && (!config.requiresPersonalizationMode || !sanitizeText(draft.personalizationMode))
    && !sanitizeText(draft.edgeText)
    && draft.entries.length === 0
    && (config.requiresYear === false || !draft.year || isDefaultYearValue(draft.year, draft.productDefinitionId));
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

function renderTreeSubmitButton() {
  if (!treeSubmitButton) {
    return;
  }

  if (reviewState.saving) {
    treeSubmitButton.textContent = 'Saving...';
    treeSubmitButton.disabled = true;
    return;
  }

  treeSubmitButton.disabled = false;
  treeSubmitButton.textContent = appState.editingItemId
    ? 'Save Changes'
    : 'Review This Item';
}

function getConfirmationDialogFocusableElements() {
  if (!addConfirmationDialog) {
    return [];
  }

  return [...addConfirmationDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}

function renderAddConfirmation() {
  if (!addConfirmationBackdrop || !addConfirmationDialog || !addConfirmationItem) {
    return;
  }

  const item = addConfirmationState.itemId
    ? getOrderItems().find((entry) => entry.itemId === addConfirmationState.itemId)
    : null;
  const safeTitle = addConfirmationState.title || 'Added to Your Order';
  const safeMessage = addConfirmationState.message || 'This ornament has been saved to the current order.';
  const titleNode = addConfirmationDialog.querySelector('#add-confirmation-title');
  const copyNode = addConfirmationDialog.querySelector('#add-confirmation-copy');
  const eyebrowNode = addConfirmationDialog.querySelector('.confirmation-dialog-copy .eyebrow');
  const primaryButton = addConfirmationDialog.querySelector('[data-action="confirmation-continue-customer"]');

  if (addConfirmationState.open && !item) {
    addConfirmationState.open = false;
    addConfirmationState.itemId = '';
  }

  addConfirmationBackdrop.hidden = !addConfirmationState.open;
  addConfirmationDialog.hidden = !addConfirmationState.open;

  if (titleNode) {
    titleNode.textContent = safeTitle;
  }
  if (copyNode) {
    copyNode.textContent = safeMessage;
  }
  if (eyebrowNode) {
    eyebrowNode.textContent = addConfirmationState.title === 'Updated in Your Order' ? 'Order Updated' : 'Order Saved';
  }
  if (primaryButton) {
    primaryButton.textContent = 'Continue to Customer Information';
  }

  if (!item) {
    addConfirmationItem.innerHTML = '';
    return;
  }

  const orderedFields = getOrderedItemFields(item);
  const primaryFields = orderedFields.filter((field) => ['familyName', 'lastName', 'babyName', 'name', 'letter', 'edgeText', 'personalizationMode'].includes(field.key));
  const yearFields = orderedFields.filter((field) => /year/i.test(field.key));
  const selectionFields = getOrderedItemFields(item).filter((field) => (
    !['familyName', 'lastName', 'babyName', 'name', 'letter', 'edgeText', 'personalizationMode'].includes(field.key)
    && !/year/i.test(field.key)
  ));

  addConfirmationItem.innerHTML = `
    ${getItemImageMarkup(item, 'confirmation-dialog-photo')}
    <div class="confirmation-dialog-item-copy">
      <div class="confirmation-dialog-item-header">
        <div>
          <h3>${escapeHtml(item.displayName)}</h3>
        </div>
        <div class="confirmation-dialog-item-price">${formatPrice(item.unitPrice * item.quantity)}</div>
      </div>
      <div class="confirmation-dialog-item-meta">
        ${primaryFields.map((field) => `
          <div class="summary-item">
            <span class="summary-label">${escapeHtml(field.label)}</span>
            <div class="summary-value">${escapeHtml(field.value)}</div>
          </div>
        `).join('')}
        ${yearFields.map((field) => `
          <div class="final-review-detail-row">
            <span class="summary-label">${escapeHtml(field.label)}</span>
            <div class="final-review-detail-value">${escapeHtml(field.value)}</div>
          </div>
        `).join('')}
        ${selectionFields.map((field) => `
          <div class="final-review-detail-row">
            <span class="summary-label">${escapeHtml(field.label)}</span>
            <div class="final-review-detail-value">${/color/i.test(field.key) ? getColorDisplayMarkup(field.value) : escapeHtml(field.value)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function openAddConfirmation(itemId, title, message) {
  const item = itemId ? getOrderItems().find((entry) => entry.itemId === itemId) : null;
  if (!item) {
    closeAddConfirmation(false);
    return;
  }

  addConfirmationState.open = true;
  addConfirmationState.itemId = itemId;
  addConfirmationState.title = title;
  addConfirmationState.message = message;
  lastConfirmationFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderAddConfirmation();

  window.setTimeout(() => {
    const focusTarget = getConfirmationDialogFocusableElements()[0] || addConfirmationDialog;
    focusTarget?.focus();
  }, 0);
}

function closeAddConfirmation(restoreFocus = true) {
  addConfirmationState.open = false;
  addConfirmationState.itemId = '';
  renderAddConfirmation();
  if (restoreFocus && lastConfirmationFocusTarget) {
    lastConfirmationFocusTarget.focus();
  }
  lastConfirmationFocusTarget = null;
}

function buildDraftFromOrderItem(item) {
  return {
    productDefinitionId: resolveConfiguredProductDefinitionId(item.productDefinitionId),
    size: item.size,
    treeColor: item.treeColor,
    bowColor: item.bowColor,
    familyName: item.familyName,
    personalizationMode: item.personalizationMode || '',
    edgeText: item.edgeText || '',
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

  treeReviewCard.className = 'review-card order-summary-card';
  treeReviewCard.removeAttribute('style');
  treeReviewCard.innerHTML = createTreeReviewMarkup();
  const reviewMedia = treeReviewCard.querySelector('.review-media');
  if (reviewMedia) {
    reviewMedia.className = 'review-media';
    reviewMedia.removeAttribute('style');
    reviewMedia.style.removeProperty('height');
    reviewMedia.style.removeProperty('min-height');
    reviewMedia.style.removeProperty('max-height');
    reviewMedia.style.removeProperty('grid-row');
    reviewMedia.style.removeProperty('align-self');
    reviewMedia.style.removeProperty('justify-self');
    reviewMedia.style.removeProperty('object-fit');
  }
  const reviewPhoto = treeReviewCard.querySelector('.review-product-photo');
  if (reviewPhoto) {
    reviewPhoto.className = 'review-product-photo';
    reviewPhoto.removeAttribute('style');
    reviewPhoto.style.removeProperty('height');
    reviewPhoto.style.removeProperty('min-height');
    reviewPhoto.style.removeProperty('max-height');
    reviewPhoto.style.removeProperty('grid-row');
    reviewPhoto.style.removeProperty('align-self');
    reviewPhoto.style.removeProperty('justify-self');
    reviewPhoto.style.removeProperty('object-fit');
  }
  renderCurrentOrderUtilityButtons();
  renderDiscardPanels();
  renderTreeSubmitButton();
}

function getCurrentOrderStats(items) {
  return items.reduce((stats, item) => {
    stats.itemCount += item.quantity;
    stats.subtotal += item.quantity * item.unitPrice;
    return stats;
  }, { itemCount: 0, subtotal: 0 });
}

function createCurrentOrderItemMarkup(item) {
  const orderedFields = getOrderedItemFields(item);
  const primaryFields = orderedFields.filter((field) => ['familyName', 'lastName', 'babyName', 'name', 'letter', 'edgeText', 'personalizationMode'].includes(field.key));
  const yearFields = orderedFields.filter((field) => /year/i.test(field.key));
  const engravingEntriesMarkup = item.orderedEntries.length > 0
    ? `
      <ol class="review-entry-list current-order-entry-list">
        ${item.orderedEntries.map((entry, index) => {
          const detailParts = [];
          if (entry.kind === 'pet' && entry.icon) {
            detailParts.push(escapeHtml(getPetIconText(entry)));
          }
          if (entry.customIconDescription) {
            detailParts.push(`Custom icon: ${escapeHtml(entry.customIconDescription)}`);
          }

          return `
            <li class="review-entry-item">
              <span class="review-entry-position">${index + 1}.</span>
              <div class="review-entry-body">
                <div class="review-entry-primary">
                  <span class="review-entry-name">${escapeHtml(entry.name || 'Unnamed')}</span>
                  <span class="review-entry-badge">${entry.kind === 'pet' ? 'Pet' : 'Person'}</span>
                </div>
                ${detailParts.length > 0 ? `<div class="review-entry-detail">${detailParts.join(' • ')}</div>` : ''}
              </div>
            </li>
          `;
        }).join('')}
      </ol>
    `
    : '';
  const selectionFields = orderedFields.filter((field) => field.key === 'size' || /color/i.test(field.key));
  const otherFields = orderedFields.filter((field) => !primaryFields.includes(field) && !/year/i.test(field.key) && !selectionFields.includes(field));
  const selectionRows = [
    ...selectionFields.map((field) => `
      <div class="current-order-selection-row">
        <span class="summary-label">${escapeHtml(field.label)}</span>
        <div class="current-order-selection-value">${/color/i.test(field.key) ? getColorDisplayMarkup(field.value) : escapeHtml(field.value)}</div>
      </div>
    `),
    ...otherFields.map((field) => `
      <div class="current-order-selection-row">
        <span class="summary-label">${escapeHtml(field.label)}</span>
        <div class="current-order-selection-value">${escapeHtml(field.value)}</div>
      </div>
    `)
  ].join('');

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
          ${getItemImageMarkup(item, 'current-order-photo')}
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

          ${(primaryFields.length > 0 || yearFields.length > 0) ? `
            <div class="current-order-body">
              ${primaryFields.map((field, index) => `
                <div class="${index === 0 ? 'current-order-highlight' : 'current-order-selection-row'}">
                  <span class="summary-label">${escapeHtml(field.label)}</span>
                  <div class="${index === 0 ? 'summary-value' : 'current-order-selection-value'}">${escapeHtml(field.value)}</div>
                </div>
              `).join('')}
              ${yearFields.map((field) => `
                <div class="current-order-selection-row">
                  <span class="summary-label">${escapeHtml(field.label)}</span>
                  <div class="current-order-selection-value">${escapeHtml(field.value)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${selectionRows ? `
            <div class="current-order-list-card current-order-selections-card">
              <h4>Product Selections</h4>
              <div class="current-order-selection-list">${selectionRows}</div>
            </div>
          ` : ''}

          ${engravingEntriesMarkup ? `
            <div class="current-order-list-card">
              <h4>Engraving Order</h4>
              ${engravingEntriesMarkup}
            </div>
          ` : ''}

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

function renderFinalReviewStatus() {
  if (!finalReviewStatus) {
    return;
  }

  finalReviewStatus.textContent = finalReviewState.message;
  finalReviewStatus.className = `form-status final-review-status${finalReviewState.tone === 'success' ? ' is-success' : ''}`;
}

function renderPlaceOrderButton() {
  const button = document.querySelector('[data-action="place-order-development"]');
  if (!button) {
    return;
  }

  button.disabled = finalReviewState.savingOrder;
  button.textContent = finalReviewState.savingOrder ? 'Saving Order...' : 'Place My Order';
}

function ensurePayloadPreviewUi() {
  const shouldCreateJsonViewer = forgeOrderPayloadPreview.shouldCreatePayloadPreviewUi(payloadPreviewState.enabled)
    || forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled);
  if (!shouldCreateJsonViewer || payloadPreviewDialog) {
    return;
  }

  if (forgeOrderPayloadPreview.shouldCreatePayloadPreviewUi(payloadPreviewState.enabled)) {
    const finalReviewActionsCard = document.querySelector('.final-review-actions-card');
    if (finalReviewActionsCard && !document.querySelector('[data-action="preview-order-payload"]')) {
      finalReviewActionsCard.insertAdjacentHTML('beforeend', `
        <div class="payload-preview-controls">
          <p class="eyebrow payload-preview-eyebrow">Development Only</p>
          <button class="secondary-button payload-preview-trigger" type="button" data-action="preview-order-payload">Preview Order Payload</button>
        </div>
      `);
    }
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="payload-preview-backdrop" data-payload-preview-backdrop hidden>
      <div class="payload-preview-dialog" data-payload-preview-dialog role="dialog" aria-modal="true" aria-labelledby="payload-preview-title" tabindex="-1" hidden>
        <div class="payload-preview-header">
          <div class="payload-preview-heading">
            <p class="eyebrow payload-preview-eyebrow">Development Only</p>
            <h2 id="payload-preview-title">Normalized Order Payload</h2>
            <p class="payload-preview-copy">Inspect the current Forge order state as formatted JSON without submitting anything.</p>
          </div>
          <button class="text-button" type="button" data-action="close-payload-preview">Close</button>
        </div>
        <p class="form-status payload-preview-status" data-payload-preview-status aria-live="polite"></p>
        <pre class="payload-preview-output" data-payload-preview-output tabindex="0"></pre>
        <div class="payload-preview-actions">
          <button class="secondary-button" type="button" data-action="copy-payload-preview">Copy JSON</button>
          <button class="primary-button" type="button" data-action="close-payload-preview">Close</button>
        </div>
      </div>
    </div>
  `);

  payloadPreviewTriggerButton = document.querySelector('[data-action="preview-order-payload"]');
  payloadPreviewBackdrop = document.querySelector('[data-payload-preview-backdrop]');
  payloadPreviewDialog = document.querySelector('[data-payload-preview-dialog]');
  payloadPreviewOutput = document.querySelector('[data-payload-preview-output]');
  payloadPreviewStatus = document.querySelector('[data-payload-preview-status]');
  payloadPreviewTitleNode = document.querySelector('#payload-preview-title');
  payloadPreviewCopyNode = document.querySelector('.payload-preview-copy');
}

function ensureSavedOrdersUi() {
  if (!forgeOrderPayloadPreview.shouldCreatePayloadPreviewUi(payloadPreviewState.enabled) || savedOrdersDialog) {
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="saved-orders-backdrop" data-saved-orders-backdrop hidden>
      <div class="saved-orders-dialog" data-saved-orders-dialog role="dialog" aria-modal="true" aria-labelledby="saved-orders-title" tabindex="-1" hidden>
        <div class="saved-orders-header">
          <div>
            <p class="eyebrow payload-preview-eyebrow">Development Only</p>
            <h2 id="saved-orders-title">Saved Local Orders</h2>
            <p class="payload-preview-copy">Inspect durable local order records saved on this device.</p>
          </div>
          <button class="text-button" type="button" data-action="close-saved-orders">Close</button>
        </div>
        <p class="form-status saved-orders-status" data-saved-orders-status aria-live="polite"></p>
        <div class="saved-orders-list" data-saved-orders-list></div>
        <div class="payload-preview-actions">
          <button class="primary-button" type="button" data-action="close-saved-orders">Close</button>
        </div>
      </div>
    </div>
  `);

  savedOrdersBackdrop = document.querySelector('[data-saved-orders-backdrop]');
  savedOrdersDialog = document.querySelector('[data-saved-orders-dialog]');
  savedOrdersList = document.querySelector('[data-saved-orders-list]');
  savedOrdersStatus = document.querySelector('[data-saved-orders-status]');
}

function renderDebugOrderTools() {
  const enabled = forgeOrderPayloadPreview.shouldCreatePayloadPreviewUi(payloadPreviewState.enabled);
  debugOrderToolContainers.forEach((container) => {
    container.hidden = !enabled;
    if (!enabled) {
      container.innerHTML = '';
      return;
    }

    const context = container.dataset.debugOrderTools || '';
    if (context === 'thank-you' && appState.lastSubmittedOrderUuid) {
      container.innerHTML = `
        <button class="secondary-button" type="button" data-action="inspect-last-saved-order">Inspect Saved Order</button>
        <button class="secondary-button" type="button" data-action="view-saved-local-orders">View Saved Local Orders</button>
      `;
      return;
    }

    container.innerHTML = `
      <button class="secondary-button" type="button" data-action="view-saved-local-orders">View Saved Local Orders</button>
    `;
  });
}

function renderPayloadPreview() {
  if (!payloadPreviewDialog || !payloadPreviewBackdrop || !payloadPreviewOutput || !payloadPreviewStatus) {
    return;
  }

  payloadPreviewBackdrop.hidden = !payloadPreviewState.open;
  payloadPreviewDialog.hidden = !payloadPreviewState.open;
  if (payloadPreviewTitleNode) {
    payloadPreviewTitleNode.textContent = payloadPreviewState.title;
  }
  if (payloadPreviewCopyNode) {
    payloadPreviewCopyNode.textContent = payloadPreviewState.copy;
  }
  payloadPreviewOutput.textContent = payloadPreviewState.json;
  payloadPreviewStatus.textContent = payloadPreviewState.copyStatus || payloadPreviewState.error;
  payloadPreviewStatus.className = `form-status payload-preview-status${payloadPreviewState.copyTone === 'success' ? ' is-success' : ''}`;
}

function renderSavedOrdersDialog() {
  if (!savedOrdersDialog || !savedOrdersBackdrop || !savedOrdersList || !savedOrdersStatus) {
    return;
  }

  savedOrdersBackdrop.hidden = !savedOrderInspectorState.open;
  savedOrdersDialog.hidden = !savedOrderInspectorState.open;
  savedOrdersStatus.textContent = savedOrderInspectorState.loading
    ? 'Loading saved local orders...'
    : savedOrderInspectorState.error;

  if (savedOrderInspectorState.loading) {
    savedOrdersList.innerHTML = '';
    return;
  }

  if (savedOrderInspectorState.records.length === 0) {
    savedOrdersList.innerHTML = `
      <div class="saved-order-card saved-order-card--empty">
        <h3>No saved orders yet</h3>
        <p>Submit an order in this browser to inspect it here.</p>
      </div>
    `;
    return;
  }

  savedOrdersList.innerHTML = savedOrderInspectorState.records.map((record) => {
    const payload = record.payload || {};
    const customerName = payload.customer?.full_name || 'Unknown customer';
    const itemCount = Array.isArray(payload.items)
      ? payload.items.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 1), 0)
      : 0;
    const estimatedTotalCents = payload.pricing?.estimated_total_cents;
    const estimatedTotal = Number.isInteger(estimatedTotalCents) ? formatPrice(estimatedTotalCents / 100) : 'Quote Required';
    return `
      <article class="saved-order-card">
        <div class="saved-order-card-header">
          <div>
            <h3>${escapeHtml(record.forge_order_uuid)}</h3>
            <p>${escapeHtml(formatReadableDateTime(record.submitted_at))}</p>
          </div>
          <span class="saved-order-badge">${escapeHtml(record.sync_status || 'pending')}</span>
        </div>
        <div class="saved-order-meta">
          <div><span>Customer</span><strong>${escapeHtml(customerName)}</strong></div>
          <div><span>Items</span><strong>${itemCount}</strong></div>
          <div><span>Estimated Total</span><strong>${escapeHtml(estimatedTotal)}</strong></div>
        </div>
        <button class="secondary-button" type="button" data-action="inspect-saved-order-record" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">Inspect Saved JSON</button>
      </article>
    `;
  }).join('');
}

function ensureStaffOrderDetailUi() {
  if (!forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled) || staffOrderDetailDialog) {
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="staff-order-detail-backdrop" data-staff-order-detail-backdrop hidden>
      <div class="staff-order-detail-dialog" data-staff-order-detail-dialog role="dialog" aria-modal="true" aria-labelledby="staff-order-detail-title" tabindex="-1" hidden></div>
    </div>
  `);

  staffOrderDetailBackdrop = document.querySelector('[data-staff-order-detail-backdrop]');
  staffOrderDetailDialog = document.querySelector('[data-staff-order-detail-dialog]');

  staffOrderDetailDialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const orderUuid = event.target.closest('[data-order-uuid]')?.dataset.orderUuid;
    if (!action) {
      return;
    }

    if (action === 'close-staff-order-detail') {
      closeStaffOrderDetail();
      return;
    }

    if (action === 'staff-view-order-json' && orderUuid) {
      closeStaffOrderDetail();
      inspectSavedOrderRecord(orderUuid);
      return;
    }

    if (action === 'staff-open-tray-assignment' && orderUuid) {
      openStaffTrayAssignment(orderUuid);
      return;
    }

    if (action === 'staff-complete-item' && orderUuid && !staffOrdersState.detailSavingLineId) {
      const lineId = event.target.closest('[data-line-id]')?.dataset.lineId;
      if (lineId) {
        submitStaffItemCompletion(orderUuid, lineId);
      }
    }
  });

  staffOrderDetailBackdrop?.addEventListener('click', (event) => {
    if (event.target === staffOrderDetailBackdrop) {
      closeStaffOrderDetail();
    }
  });
}

function ensureStaffTrayAssignmentUi() {
  if (!forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled) || staffTrayAssignmentDialog) {
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="staff-order-detail-backdrop staff-tray-assignment-backdrop" data-staff-tray-assignment-backdrop hidden>
      <div class="staff-order-detail-dialog staff-tray-assignment-dialog" data-staff-tray-assignment-dialog role="dialog" aria-modal="true" aria-labelledby="staff-tray-assignment-title" tabindex="-1" hidden></div>
    </div>
  `);

  staffTrayAssignmentBackdrop = document.querySelector('[data-staff-tray-assignment-backdrop]');
  staffTrayAssignmentDialog = document.querySelector('[data-staff-tray-assignment-dialog]');

  staffTrayAssignmentDialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const trayNumber = Number.parseInt(event.target.closest('[data-tray-number]')?.dataset.trayNumber || '', 10);
    if (!action) {
      return;
    }

    if (action === 'close-staff-tray-assignment') {
      closeStaffTrayAssignment();
      return;
    }

    if (action === 'staff-select-tray' && Number.isInteger(trayNumber) && trayNumber > 0 && !staffOrdersState.trayDialogSaving) {
      staffOrdersState.trayDialogSelectedTrayNumber = trayNumber;
      staffOrdersState.trayDialogError = '';
      renderStaffTrayAssignment();
      return;
    }

    if (action === 'staff-confirm-tray-assignment') {
      submitStaffTrayAssignment();
    }
  });

  staffTrayAssignmentBackdrop?.addEventListener('click', (event) => {
    if (event.target === staffTrayAssignmentBackdrop && !staffOrdersState.trayDialogSaving) {
      closeStaffTrayAssignment();
    }
  });
}

function ensureStaffPackingUi() {
  if (!forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled) || staffPackingDialog) {
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="staff-order-detail-backdrop staff-packing-backdrop" data-staff-packing-backdrop hidden>
      <div class="staff-order-detail-dialog staff-packing-dialog" data-staff-packing-dialog role="dialog" aria-modal="true" aria-labelledby="staff-packing-title" tabindex="-1" hidden></div>
    </div>
  `);

  staffPackingBackdrop = document.querySelector('[data-staff-packing-backdrop]');
  staffPackingDialog = document.querySelector('[data-staff-packing-dialog]');

  staffPackingDialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    if (action === 'close-staff-packing') {
      closeStaffPackingDialog();
      return;
    }

    if (action === 'staff-retry-packing-load') {
      retryStaffPackingDialogLoad();
      return;
    }

    if (action === 'staff-pack-order-confirm') {
      submitStaffPackingVerification();
    }
  });

  staffPackingDialog?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-packing-line-id]');
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== 'checkbox' || staffOrdersState.packingDialogSaving) {
      return;
    }
    const lineId = String(checkbox.dataset.packingLineId || '').trim();
    if (!lineId) {
      return;
    }
    const checkedIds = new Set(staffOrdersState.packingDialogCheckedLineIds);
    if (checkbox.checked) {
      checkedIds.add(lineId);
    } else {
      checkedIds.delete(lineId);
    }
    staffOrdersState.packingDialogCheckedLineIds = [...checkedIds];
    staffOrdersState.packingDialogError = '';
    renderStaffPackingDialog();
  });

  staffPackingDialog?.addEventListener('input', (event) => {
    const noteField = event.target.closest('[data-staff-packing-note]');
    if (!(noteField instanceof HTMLTextAreaElement) || staffOrdersState.packingDialogSaving) {
      return;
    }
    staffOrdersState.packingDialogNote = noteField.value.slice(0, 500);
  });

  staffPackingBackdrop?.addEventListener('click', (event) => {
    if (event.target === staffPackingBackdrop && !staffOrdersState.packingDialogSaving) {
      closeStaffPackingDialog();
    }
  });
}

function getOrderShortReference(record) {
  return forgeLocalOrdersQueue.getShortOrderReference(record) || 'No Ref';
}

function getOrderProductionStatus(record) {
  return sanitizeText(record?.production_status || forgeOrderStore.PRODUCTION_STATUSES?.submitted || 'submitted');
}

function getOrderProductionStatusLabel(record) {
  const status = getOrderProductionStatus(record);
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.trayAssigned) {
    return 'Tray Assigned';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.inProduction) {
    return 'In Production';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.readyToPack) {
    return 'Ready to Pack';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.packed) {
    return 'Packed';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.shipped) {
    return 'Shipped';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.pickedUp) {
    return 'Picked Up';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.cancelled) {
    return 'Cancelled';
  }
  return 'Submitted';
}

function getOrderProductionStatusBadgeClass(record) {
  const status = getOrderProductionStatus(record);
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.trayAssigned) {
    return 'staff-status-badge--production-tray-assigned';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.inProduction) {
    return 'staff-status-badge--production-in-production';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.readyToPack) {
    return 'staff-status-badge--production-ready-to-pack';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.packed) {
    return 'staff-status-badge--production-packed';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.shipped || status === forgeOrderStore.PRODUCTION_STATUSES?.pickedUp) {
    return 'staff-status-badge--production-complete';
  }
  if (status === forgeOrderStore.PRODUCTION_STATUSES?.cancelled) {
    return 'staff-status-badge--production-cancelled';
  }
  return 'staff-status-badge--production-submitted';
}

function getOrderTrayNumber(record) {
  return Number.isInteger(record?.current_tray_number) && record.current_tray_number > 0
    ? record.current_tray_number
    : null;
}

function getOrderTrayLabel(record) {
  const trayNumber = getOrderTrayNumber(record);
  if (trayNumber) {
    return `TRAY ${trayNumber}`;
  }
  if (getOrderProductionStatus(record) === forgeOrderStore.PRODUCTION_STATUSES?.packed && record?.packed_at) {
    return 'TRAY RELEASED';
  }
  return 'NO TRAY ASSIGNED';
}

function getOrderTrayBadgeClass(record) {
  if (getOrderTrayNumber(record)) {
    return 'staff-tray-badge--assigned';
  }
  if (getOrderProductionStatus(record) === forgeOrderStore.PRODUCTION_STATUSES?.packed && record?.packed_at) {
    return 'staff-tray-badge--released';
  }
  return 'staff-tray-badge--unassigned';
}

function canAssignTrayToOrder(record) {
  return !getOrderTrayNumber(record) && getOrderProductionStatus(record) === 'submitted';
}

function getOrderCompletionCounts(record) {
  const totalItemCount = Number.isInteger(record?.total_item_count)
    ? Math.max(record.total_item_count, 0)
    : forgeOrderStore.deriveOrderCompletionCounts(record?.payload?.items || []).total_item_count;
  const completedItemCount = Number.isInteger(record?.completed_item_count)
    ? Math.max(Math.min(record.completed_item_count, totalItemCount), 0)
    : forgeOrderStore.deriveOrderCompletionCounts(record?.payload?.items || []).completed_item_count;

  return {
    totalItemCount,
    completedItemCount
  };
}

function getOrderCompletionSummary(record) {
  const counts = getOrderCompletionCounts(record);
  return `${counts.completedItemCount} of ${counts.totalItemCount} Complete`;
}

function getStaffSyncStatus(record) {
  return sanitizeText(record?.sync_status || 'pending').toLowerCase();
}

function getStaffSyncStatusLabel(record) {
  const syncStatus = getStaffSyncStatus(record);
  if (syncStatus === 'synced') {
    return 'Synced';
  }
  if (syncStatus === 'error') {
    return 'Sync Error';
  }
  return 'Sync Pending';
}

function getStaffSyncStatusBadgeClass(record) {
  const syncStatus = getStaffSyncStatus(record);
  if (syncStatus === 'synced') {
    return 'staff-status-badge--synced';
  }
  if (syncStatus === 'error') {
    return 'staff-status-badge--sync-error';
  }
  return 'staff-status-badge--sync-pending';
}

function getStaffItemProductionStatus(item) {
  return sanitizeText(
    item?.production_status
    || item?.structured_attributes?.production_status
    || forgeOrderStore.ITEM_PRODUCTION_STATUSES?.pending
    || 'pending'
  );
}

function getStaffItemProductionStatusLabel(item) {
  const status = getStaffItemProductionStatus(item);
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.inProduction) {
    return 'In Production';
  }
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.complete) {
    return 'Complete';
  }
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.blocked) {
    return 'Blocked';
  }
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.cancelled) {
    return 'Cancelled';
  }
  return 'Pending';
}

function getStaffItemProductionStatusBadgeClass(item) {
  const status = getStaffItemProductionStatus(item);
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.inProduction) {
    return 'staff-status-badge--production-in-production';
  }
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.complete) {
    return 'staff-status-badge--production-ready-to-pack';
  }
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.blocked) {
    return 'staff-status-badge--production-cancelled';
  }
  if (status === forgeOrderStore.ITEM_PRODUCTION_STATUSES?.cancelled) {
    return 'staff-status-badge--production-cancelled';
  }
  return 'staff-status-badge--production-submitted';
}

function getStaffItemCompletionSummary(item) {
  const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
  const completedQuantity = Number.isInteger(item?.completed_quantity)
    ? Math.max(Math.min(item.completed_quantity, quantity), 0)
    : 0;
  return `${completedQuantity} of ${quantity} Complete`;
}

function canMarkStaffItemComplete(record, item) {
  const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
  const completedQuantity = Number.isInteger(item?.completed_quantity)
    ? Math.max(Math.min(item.completed_quantity, quantity), 0)
    : 0;
  const status = getStaffItemProductionStatus(item);
  return Boolean(getOrderTrayNumber(record))
    && completedQuantity < quantity
    && status !== forgeOrderStore.ITEM_PRODUCTION_STATUSES?.blocked
    && status !== forgeOrderStore.ITEM_PRODUCTION_STATUSES?.cancelled;
}

function getStaffItemCompletionActionLabel(item) {
  const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
  const completedQuantity = Number.isInteger(item?.completed_quantity)
    ? Math.max(Math.min(item.completed_quantity, quantity), 0)
    : 0;
  if (completedQuantity >= quantity) {
    return 'Completed';
  }
  return quantity > 1 ? 'Mark One Complete' : 'Mark Complete';
}

function buildStaffNoticeMarkup(message, tone = 'success') {
  if (!message) {
    return '';
  }

  return `
    <div class="staff-inline-notice staff-inline-notice--${escapeHtml(tone)}" role="status" aria-live="polite">
      ${escapeHtml(message)}
    </div>
  `;
}

function getReadyToPackCountLabel(records) {
  const count = Array.isArray(records) ? records.length : 0;
  return `${count} ${count === 1 ? 'order' : 'orders'} ready`;
}

function getOrderActivePackingItems(record) {
  const items = Array.isArray(record?.payload?.items) ? record.payload.items : [];
  return items.filter((item) => getStaffItemProductionStatus(item) !== forgeOrderStore.ITEM_PRODUCTION_STATUSES?.cancelled);
}

function getOrderVerifiedPieceCounts(record, checkedLineIds = []) {
  const activeItems = getOrderActivePackingItems(record);
  const checkedSet = new Set((Array.isArray(checkedLineIds) ? checkedLineIds : []).map((value) => String(value || '').trim()).filter(Boolean));
  return activeItems.reduce((summary, item) => {
    const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
    summary.totalPieces += quantity;
    if (checkedSet.has(String(item?.line_id || '').trim())) {
      summary.verifiedPieces += quantity;
    }
    return summary;
  }, { verifiedPieces: 0, totalPieces: 0 });
}

function getStaffPackingItemIdentifier(item) {
  const attributes = item?.structured_attributes && typeof item.structured_attributes === 'object'
    ? item.structured_attributes
    : {};
  const configurationSnapshot = item?.configuration_snapshot && typeof item.configuration_snapshot === 'object'
    ? item.configuration_snapshot
    : {};

  const candidates = [
    attributes.family_name,
    configurationSnapshot.familyName,
    configurationSnapshot.family_name,
    configurationSnapshot.babyName,
    configurationSnapshot.baby_name,
    configurationSnapshot.lastName,
    configurationSnapshot.last_name,
    configurationSnapshot.name,
    configurationSnapshot.edgeText,
    configurationSnapshot.edge_text,
    attributes.year,
    configurationSnapshot.year
  ].map((value) => sanitizeText(value)).filter(Boolean);

  return candidates[0] || '';
}

function renderStaffOrdersQueue() {
  if (!forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled) || !staffOrdersSummary || !staffOrdersFilters || !staffBatchGroups || !staffOrdersList || !staffOrdersStatus) {
    return;
  }

  const filteredRecords = forgeLocalOrdersQueue.filterLocalOrders(
    staffOrdersState.records,
    staffOrdersState.filters,
    staffOrdersState.searchTerm
  );
  const summary = forgeLocalOrdersQueue.summarizeLocalOrders(filteredRecords, staffOrdersState.filters);
  const availableFilters = forgeLocalOrdersQueue.getAvailableOrderFilters(staffOrdersState.records, {
    activeFilters: staffOrdersState.filters,
    searchTerm: staffOrdersState.searchTerm
  });
  const batchSummary = forgeLocalOrdersQueue.buildProductionBatchGroups(filteredRecords, staffOrdersState.filters);

  staffOrdersSummary.innerHTML = [
    { label: 'Total Saved Orders', value: summary.totalOrders },
    { label: 'Pending Future Sync', value: summary.pendingFutureSync },
    { label: 'Orders With Open Flags', value: summary.ordersWithOpenFlags },
    { label: 'Total Items', value: summary.totalItems }
  ].map((card) => `
    <article class="staff-summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(String(card.value))}</strong>
    </article>
  `).join('');

  staffOrdersFilters.innerHTML = [
    { key: 'product', label: 'Product', options: availableFilters.product },
    { key: 'size', label: 'Size', options: availableFilters.size },
    { key: 'treeColor', label: 'Tree Color', options: availableFilters.treeColor },
    { key: 'bowColor', label: 'Bow Color', options: availableFilters.bowColor },
    { key: 'year', label: 'Year', options: availableFilters.year },
    { key: 'fulfillment', label: 'Fulfillment', options: availableFilters.fulfillment },
    { key: 'openFlags', label: 'Open Flags', options: availableFilters.openFlags },
    { key: 'syncStatus', label: 'Sync Status', options: availableFilters.syncStatus }
  ].map((field) => `
    <div class="staff-filter-field">
      <label for="staff-filter-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
      <select id="staff-filter-${escapeHtml(field.key)}" data-staff-filter="${escapeHtml(field.key)}">
        <option value="all">All</option>
        ${field.options.map((option) => `
          <option value="${escapeHtml(option.value)}"${staffOrdersState.filters[field.key] === option.value.toLowerCase() ? ' selected' : ''}>
            ${escapeHtml(option.label)} (${escapeHtml(String(option.count))})
          </option>
        `).join('')}
      </select>
    </div>
  `).join('');

  if (staffOrdersSearchInput && staffOrdersSearchInput.value !== staffOrdersState.searchTerm) {
    staffOrdersSearchInput.value = staffOrdersState.searchTerm;
  }

  if (staffOrdersState.loading) {
    staffOrdersStatus.textContent = 'Loading durable local orders...';
    staffOrdersList.innerHTML = '';
    staffBatchGroups.innerHTML = '';
    return;
  }

  staffOrdersStatus.textContent = staffOrdersState.error || `${filteredRecords.length} order${filteredRecords.length === 1 ? '' : 's'} shown`;

  staffBatchGroups.innerHTML = buildStaffBatchMarkup(batchSummary);
  staffOrdersList.innerHTML = `
    ${buildStaffNoticeMarkup(staffOrdersState.notice, staffOrdersState.noticeTone)}
    ${filteredRecords.length
      ? filteredRecords.map((record) => buildStaffOrderCardMarkup(record, staffOrdersState.filters)).join('')
      : `
        <div class="staff-empty-state">
          <h3>No orders match these filters</h3>
          <p>Adjust the search or clear filters to see the saved local orders on this device.</p>
        </div>
      `}
  `;
}

function renderReadyToPackQueue() {
  if (!forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled) || !readyToPackCount || !readyToPackList) {
    return;
  }

  if (staffOrdersState.loading) {
    readyToPackCount.textContent = 'Loading ready orders...';
    readyToPackList.innerHTML = '';
    return;
  }

  if (staffOrdersState.error) {
    readyToPackCount.textContent = 'Ready-to-pack queue unavailable';
    readyToPackList.innerHTML = buildStaffNoticeMarkup(staffOrdersState.error, 'error');
    return;
  }

  const readyRecords = forgeLocalOrdersQueue.filterReadyToPackOrders(staffOrdersState.records);
  readyToPackCount.textContent = getReadyToPackCountLabel(readyRecords);
  readyToPackList.innerHTML = readyRecords.length
    ? `
      ${buildStaffNoticeMarkup(staffOrdersState.notice, staffOrdersState.noticeTone)}
      ${readyRecords.map((record) => buildReadyToPackCardMarkup(record)).join('')}
    `
    : `
      ${buildStaffNoticeMarkup(staffOrdersState.notice, staffOrdersState.noticeTone)}
      <div class="staff-empty-state">
        <h3>No orders are ready to pack</h3>
        <p>Orders will appear here automatically after every required piece is complete and no blocking issue remains.</p>
      </div>
    `;
}

function buildReadyToPackCardMarkup(record) {
  const payload = record.payload || {};
  const itemSummaries = forgeLocalOrdersQueue.buildReadyToPackItemSummaries(record);
  const readyTimestamp = record.ready_to_pack_at
    ? `Ready since ${formatReadableDateTime(record.ready_to_pack_at)}`
    : `Ready since ${formatReadableDateTime(record.submitted_at || record.local_saved_at || '')}`;
  const fulfillmentMethod = payload.fulfillment?.method === 'pickup' ? 'Pickup' : 'Shipping';

  return `
    <article class="staff-order-card staff-ready-card">
      <div class="staff-ready-card-header">
        <div class="staff-ready-card-tray">${escapeHtml(getOrderTrayLabel(record))}</div>
        <span class="staff-status-badge ${escapeHtml(getOrderProductionStatusBadgeClass(record))}">${escapeHtml(getOrderProductionStatusLabel(record))}</span>
      </div>
      <div class="staff-ready-card-body">
        <div class="staff-order-ref">${escapeHtml(getOrderShortReference(record))}</div>
        <p class="staff-ready-card-customer">${escapeHtml(payload.customer?.full_name || 'Unknown customer')}</p>
        <div class="staff-ready-card-meta">
          <strong>${escapeHtml(getOrderCompletionSummary(record))}</strong>
          <span>${escapeHtml(fulfillmentMethod)}</span>
        </div>
      </div>
      <div class="staff-order-products">
        <span>Items</span>
        <ul>${itemSummaries.map((line) => `<li><span>${escapeHtml(line)}</span></li>`).join('')}</ul>
      </div>
      <p class="staff-ready-card-timestamp">${escapeHtml(readyTimestamp)}</p>
      <div class="staff-order-card-actions">
        <button class="secondary-button" type="button" data-action="staff-view-order" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">View Order</button>
        <button class="primary-button" type="button" data-action="staff-pack-order" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">Pack Order</button>
      </div>
    </article>
  `;
}

function buildStaffBatchMarkup(batchSummary) {
  const cards = batchSummary.groups.map((group) => `
    <article class="staff-batch-card">
      <strong>${escapeHtml(group.label)}</strong>
      <span class="staff-batch-card-quantity">${escapeHtml(`${group.quantity} item${group.quantity === 1 ? '' : 's'}`)}</span>
    </article>
  `);

  if (batchSummary.customIconRequiredCount > 0) {
    cards.push(`
      <article class="staff-batch-card">
        <strong>Custom Icon Required</strong>
        <span class="staff-batch-card-quantity">${escapeHtml(`${batchSummary.customIconRequiredCount} item${batchSummary.customIconRequiredCount === 1 ? '' : 's'}`)}</span>
      </article>
    `);
  }

  return cards.length ? cards.join('') : `
    <div class="staff-empty-state">
      <h3>No batch data</h3>
      <p>Saved orders will appear here as soon as a filter matches at least one production line item.</p>
    </div>
  `;
}

function buildStaffOrderCardMarkup(record, filters) {
  const payload = record.payload || {};
  const matchingItems = forgeLocalOrdersQueue.getMatchingOrderItems(record, filters);
  const productSummary = buildStaffProductSummary(matchingItems);
  const estimatedTotalCents = payload.pricing?.estimated_total_cents;
  const fulfillmentMethod = payload.fulfillment?.method === 'pickup' ? 'Pickup' : 'Shipping';
  const itemCount = matchingItems.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 1), 0);
  const hasFlags = Array.isArray(payload.open_flags) && payload.open_flags.length > 0;
  const trayLabel = getOrderTrayLabel(record);
  const productionStatusLabel = getOrderProductionStatusLabel(record);
  const completionSummary = getOrderCompletionSummary(record);
  const syncStatusLabel = getStaffSyncStatusLabel(record);
  const syncStatusBadgeClass = getStaffSyncStatusBadgeClass(record);
  const canPackOrder = forgeLocalOrdersQueue.isOrderEligibleForReadyToPack(record);

  return `
    <article class="staff-order-card">
      <div class="staff-order-card-header">
        <div class="staff-order-card-title">
          <div class="staff-order-ref">${escapeHtml(getOrderShortReference(record))}</div>
          <p>${escapeHtml(formatReadableDateTime(record.submitted_at || record.local_saved_at || ''))}</p>
        </div>
        <div class="staff-order-card-badges">
          <span class="staff-tray-badge ${escapeHtml(getOrderTrayBadgeClass(record))}">${escapeHtml(trayLabel)}</span>
          <span class="staff-status-badge ${escapeHtml(getOrderProductionStatusBadgeClass(record))}">${escapeHtml(productionStatusLabel)}</span>
          <span class="staff-status-badge ${escapeHtml(syncStatusBadgeClass)}">${escapeHtml(syncStatusLabel)}</span>
          ${hasFlags ? '<span class="staff-flag-badge">Open Flags</span>' : ''}
        </div>
      </div>
      <div class="staff-order-card-meta staff-order-card-meta--primary">
        <div><span>Customer</span><strong>${escapeHtml(payload.customer?.full_name || 'Unknown customer')}</strong></div>
        <div><span>Tray</span><strong>${escapeHtml(trayLabel)}</strong></div>
        <div><span>Production</span><strong>${escapeHtml(productionStatusLabel)}</strong></div>
        <div><span>Progress</span><strong>${escapeHtml(completionSummary)}</strong></div>
      </div>
      <div class="staff-order-card-meta staff-order-card-meta--secondary">
        <div><span>Items</span><strong>${escapeHtml(String(itemCount))}</strong></div>
        <div><span>Estimated Total</span><strong>${Number.isInteger(estimatedTotalCents) ? escapeHtml(formatPrice(estimatedTotalCents / 100)) : 'Quote Required'}</strong></div>
        <div><span>Fulfillment</span><strong>${escapeHtml(fulfillmentMethod)}</strong></div>
      </div>
      <div class="staff-order-products">
        <span>Products</span>
        <ul>${productSummary.map((line) => `<li><span>${escapeHtml(line)}</span></li>`).join('')}</ul>
      </div>
      <div class="staff-order-card-actions">
        <button class="secondary-button" type="button" data-action="staff-view-order" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">View Order</button>
        ${canPackOrder ? `<button class="primary-button" type="button" data-action="staff-pack-order" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">Pack Order</button>` : ''}
      </div>
    </article>
  `;
}

function buildStaffProductSummary(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = sanitizeText(item.product_display_name || 'Custom Item');
    grouped.set(key, (grouped.get(key) || 0) + (Number.isInteger(item.quantity) ? item.quantity : 1));
  });
  return [...grouped.entries()].map(([name, quantity]) => `${quantity} × ${name}`);
}

async function loadStaffOrdersQueue() {
  if (!forgeLocalOrdersQueue.shouldCreateStaffOrdersUi(staffOrdersState.enabled)) {
    return;
  }

  staffOrdersState.loading = true;
  staffOrdersState.error = '';
  renderStaffOrdersQueue();

  try {
    const records = await orderStore.listOrders();
    staffOrdersState.records = forgeLocalOrdersQueue.sortLocalOrdersNewestFirst(records);
  } catch (error) {
    console.error('Forge staff local orders queue failed to load', error);
    staffOrdersState.records = [];
    staffOrdersState.error = 'Saved local orders could not be loaded on this device.';
  } finally {
    staffOrdersState.loading = false;
    renderStaffOrdersQueue();
    renderReadyToPackQueue();
  }
}

async function openStaffOrderDetail(forgeOrderUuid) {
  ensureStaffOrderDetailUi();
  ensureStaffTrayAssignmentUi();
  ensureStaffPackingUi();
  if (!staffOrderDetailDialog) {
    return;
  }

  staffOrdersState.detailOpen = true;
  staffOrdersState.detailLoading = true;
  staffOrdersState.detailError = '';
  staffOrdersState.detailSavingLineId = '';
  staffOrdersState.detailOrderUuid = forgeOrderUuid;
  staffOrdersState.detailRecord = null;
  staffOrdersState.detailPackingVerification = null;
  lastStaffOrderDetailFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderStaffOrderDetail();

  try {
    const [record, packingVerification] = await Promise.all([
      orderStore.getOrder(forgeOrderUuid),
      orderStore.getPackingVerificationForOrder(forgeOrderUuid)
    ]);
    if (!record) {
      staffOrdersState.detailError = 'That saved order could not be found.';
    } else {
      staffOrdersState.detailRecord = record;
      staffOrdersState.detailPackingVerification = packingVerification;
    }
  } catch (error) {
    console.error('Forge staff order detail failed to load', error);
    staffOrdersState.detailError = 'Order details could not be loaded on this device.';
  } finally {
    staffOrdersState.detailLoading = false;
    renderStaffOrderDetail();
    window.setTimeout(() => {
      (getStaffOrderDetailFocusableElements()[0] || staffOrderDetailDialog)?.focus();
    }, 0);
  }
}

function closeStaffOrderDetail() {
  if (staffOrdersState.trayDialogOpen) {
    closeStaffTrayAssignment();
  }
  if (staffOrdersState.packingDialogOpen) {
    closeStaffPackingDialog({ restoreFocus: false });
  }
  staffOrdersState.detailOpen = false;
  staffOrdersState.detailLoading = false;
  staffOrdersState.detailOrderUuid = '';
  staffOrdersState.detailRecord = null;
  staffOrdersState.detailPackingVerification = null;
  staffOrdersState.detailError = '';
  staffOrdersState.detailSavingLineId = '';
  renderStaffOrderDetail();
  if (lastStaffOrderDetailFocusTarget) {
    lastStaffOrderDetailFocusTarget.focus();
  }
  lastStaffOrderDetailFocusTarget = null;
}

function renderStaffOrderDetail() {
  ensureStaffOrderDetailUi();
  if (!staffOrderDetailBackdrop || !staffOrderDetailDialog) {
    return;
  }

  staffOrderDetailBackdrop.hidden = !staffOrdersState.detailOpen;
  staffOrderDetailDialog.hidden = !staffOrdersState.detailOpen;

  if (!staffOrdersState.detailOpen) {
    staffOrderDetailDialog.innerHTML = '';
    return;
  }

  if (staffOrdersState.detailLoading) {
    staffOrderDetailDialog.innerHTML = `
      <div class="staff-order-detail-header">
        <div>
          <p class="eyebrow staff-orders-eyebrow">Development Only</p>
          <h2 id="staff-order-detail-title">Loading Order</h2>
        </div>
        <button class="text-button" type="button" data-action="close-staff-order-detail">Close</button>
      </div>
      <p class="staff-orders-status">Loading the durable local order record...</p>
    `;
    return;
  }

  if (staffOrdersState.detailError || !staffOrdersState.detailRecord) {
    staffOrderDetailDialog.innerHTML = `
      <div class="staff-order-detail-header">
        <div>
          <p class="eyebrow staff-orders-eyebrow">Development Only</p>
          <h2 id="staff-order-detail-title">Order Unavailable</h2>
        </div>
        <button class="text-button" type="button" data-action="close-staff-order-detail">Close</button>
      </div>
      <div class="staff-empty-state">
        <h3>Unable to open this order</h3>
        <p>${escapeHtml(staffOrdersState.detailError || 'Saved order details are unavailable.')}</p>
      </div>
    `;
    return;
  }

  const record = staffOrdersState.detailRecord;
  const packingVerification = staffOrdersState.detailPackingVerification;
  const payload = record.payload || {};
  const customer = payload.customer || {};
  const fulfillment = payload.fulfillment || {};
  const openFlags = Array.isArray(payload.open_flags) ? payload.open_flags : [];
  const shippingAddress = fulfillment.shipping_address || null;
  const shortOrderReference = getOrderShortReference(record);
  const productionStatusLabel = getOrderProductionStatusLabel(record);
  const trayLabel = getOrderTrayLabel(record);
  const showAssignTrayAction = canAssignTrayToOrder(record);
  const completionCounts = getOrderCompletionCounts(record);
  const completionSummary = getOrderCompletionSummary(record);
  const showNoTrayMessage = !getOrderTrayNumber(record);
  const isPackedOrder = getOrderProductionStatus(record) === forgeOrderStore.PRODUCTION_STATUSES?.packed;
  const syncStatusLabel = getStaffSyncStatusLabel(record);
  const syncStatusBadgeClass = getStaffSyncStatusBadgeClass(record);
  const showOpenFlagProgressNote = getOrderProductionStatus(record) === forgeOrderStore.PRODUCTION_STATUSES?.inProduction
    && completionCounts.totalItemCount > 0
    && completionCounts.completedItemCount >= completionCounts.totalItemCount
    && openFlags.length > 0;

  staffOrderDetailDialog.innerHTML = `
    <div class="staff-order-detail-header">
      <div class="staff-order-detail-heading">
        <p class="eyebrow staff-orders-eyebrow">Development Only</p>
        <h2 id="staff-order-detail-title">Order ${escapeHtml(shortOrderReference)}</h2>
        <p class="staff-order-detail-customer">${escapeHtml(customer.full_name || 'Unknown customer')}</p>
        <div class="staff-order-detail-badges">
          <span class="staff-tray-badge ${escapeHtml(getOrderTrayBadgeClass(record))}">${escapeHtml(trayLabel)}</span>
          <span class="staff-status-badge ${escapeHtml(getOrderProductionStatusBadgeClass(record))}">${escapeHtml(productionStatusLabel)}</span>
          <span class="staff-status-badge ${escapeHtml(syncStatusBadgeClass)}">${escapeHtml(syncStatusLabel)}</span>
          ${openFlags.length ? '<span class="staff-flag-badge">Open Flags</span>' : ''}
        </div>
        <p class="staff-order-progress-text">${escapeHtml(completionSummary)}</p>
      </div>
      <div class="staff-order-card-actions staff-order-detail-actions">
        ${showAssignTrayAction ? `<button class="primary-button" type="button" data-action="staff-open-tray-assignment" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">Assign Tray</button>` : ''}
        <button class="secondary-button" type="button" data-action="staff-view-order-json" data-order-uuid="${escapeHtml(record.forge_order_uuid)}">View Raw JSON</button>
        <button class="text-button" type="button" data-action="close-staff-order-detail">Close</button>
      </div>
    </div>

    ${buildStaffNoticeMarkup(staffOrdersState.notice, staffOrdersState.noticeTone)}
    ${staffOrdersState.detailError ? buildStaffNoticeMarkup(staffOrdersState.detailError, 'error') : ''}

    <div class="staff-order-detail-meta">
      <div><span>Order Number</span><strong>${escapeHtml(shortOrderReference)}</strong></div>
      <div><span>Fulfillment</span><strong>${escapeHtml(fulfillment.method === 'pickup' ? 'Pickup' : 'Shipping')}</strong></div>
      <div><span>Needed By</span><strong>${escapeHtml(fulfillment.needed_by ? formatReadableDate(fulfillment.needed_by) : 'Not provided')}</strong></div>
      <div><span>UUID</span><strong>${escapeHtml(record.forge_order_uuid)}</strong></div>
      <div><span>Submitted</span><strong>${escapeHtml(formatReadableDateTime(record.submitted_at || ''))}</strong></div>
      <div><span>Local Saved</span><strong>${escapeHtml(formatReadableDateTime(record.local_saved_at || ''))}</strong></div>
      <div><span>Sync Status</span><strong>${escapeHtml(syncStatusLabel)}</strong></div>
    </div>

    <section class="staff-order-detail-section">
      <h3>Order</h3>
      <div class="staff-order-detail-grid">
        <div><span>Tray State</span><strong>${escapeHtml(trayLabel)}</strong></div>
        <div><span>Production Progress</span><strong>${escapeHtml(completionSummary)}</strong></div>
        <div><span>Production Status</span><strong>${escapeHtml(productionStatusLabel)}</strong></div>
        <div><span>Sync Attempts</span><strong>${escapeHtml(String(record.sync_attempt_count ?? 0))}</strong></div>
      </div>
      ${showOpenFlagProgressNote ? '<p class="staff-order-detail-note">All required pieces are complete, but this order still has an open flag and cannot move to Ready to Pack yet.</p>' : ''}
      <div class="staff-order-detail-flags">
        <span>Open Flags</span>
        ${openFlags.length ? `<ul>${openFlags.map((flag) => `<li>${escapeHtml(flag.message || flag.code || 'Open flag')}</li>`).join('')}</ul>` : '<p>No order-level open flags.</p>'}
      </div>
    </section>

    <section class="staff-order-detail-section">
      <h3>Customer</h3>
      <div class="staff-order-detail-grid">
        <div><span>Name</span><strong>${escapeHtml(customer.full_name || 'Not provided')}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(customer.email || 'Not provided')}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(formatCustomerPhone(customer.phone || 'Not provided'))}</strong></div>
        <div><span>Preferred Contact</span><strong>${escapeHtml(customer.preferred_contact || 'Not provided')}</strong></div>
      </div>
    </section>

    <section class="staff-order-detail-section">
      <h3>Fulfillment</h3>
      <div class="staff-order-detail-grid">
        <div><span>Method</span><strong>${escapeHtml(fulfillment.method === 'pickup' ? 'Pickup' : 'Shipping')}</strong></div>
        <div><span>Needed By</span><strong>${escapeHtml(fulfillment.needed_by ? formatReadableDate(fulfillment.needed_by) : 'Not provided')}</strong></div>
      </div>
      ${shippingAddress ? `
        <div class="staff-order-detail-row">
          <span>Shipping Address</span>
          <strong>${escapeHtml([shippingAddress.address_1, shippingAddress.address_2, [shippingAddress.city, shippingAddress.state, shippingAddress.postal_code].filter(Boolean).join(', '), shippingAddress.country].filter(Boolean).join(' • '))}</strong>
        </div>
      ` : '<p>Local pickup order.</p>'}
    </section>

    ${packingVerification ? `
      <section class="staff-order-detail-section">
        <h3>Packing</h3>
        <div class="staff-order-detail-grid">
          <div><span>Status</span><strong>Packed</strong></div>
          <div><span>Packed At</span><strong>${escapeHtml(formatReadableDateTime(packingVerification.verified_at || record.packed_at || ''))}</strong></div>
          <div><span>Tray Used</span><strong>${escapeHtml(`Tray ${packingVerification.tray_number}`)}</strong></div>
          <div><span>Verified Items</span><strong>${escapeHtml(String(Array.isArray(packingVerification.verified_item_ids) ? packingVerification.verified_item_ids.length : 0))}</strong></div>
        </div>
        ${packingVerification.packing_note ? `
          <div class="staff-order-detail-row">
            <span>Packing Note</span>
            <strong>${escapeHtml(packingVerification.packing_note)}</strong>
          </div>
        ` : ''}
      </section>
    ` : ''}

    <section class="staff-order-detail-section staff-order-detail-items">
      <h3>Items</h3>
      ${isPackedOrder
        ? '<p class="staff-order-detail-note">Packing has been verified and the assigned tray has already been released.</p>'
        : (showNoTrayMessage
          ? '<p class="staff-order-detail-note">Assign a tray before marking any finished piece complete.</p>'
          : '<p class="staff-order-detail-note">Mark complete only after the finished piece has been placed in the assigned tray.</p>')}
      ${getStaffOrderItemsMarkup(record, payload.items || [])}
    </section>
  `;
}

async function submitStaffItemCompletion(forgeOrderUuid, lineId) {
  if (!forgeOrderUuid || !lineId || staffOrdersState.detailSavingLineId) {
    return;
  }

  staffOrdersState.detailSavingLineId = lineId;
  staffOrdersState.detailError = '';
  renderStaffOrderDetail();

  try {
    const result = await orderStore.incrementOrderItemCompletion(forgeOrderUuid, lineId);
    const refreshedRecord = await orderStore.getOrder(forgeOrderUuid);
    staffOrdersState.detailRecord = refreshedRecord || result?.order || null;
    staffOrdersState.notice = result?.alreadyComplete
      ? 'That piece was already recorded as complete.'
      : 'Item completion saved.';
    staffOrdersState.noticeTone = 'success';
    await loadStaffOrdersQueue();
    renderStaffOrderDetail();
  } catch (error) {
    console.error('Forge staff item completion failed', error);
    staffOrdersState.notice = '';
    staffOrdersState.noticeTone = 'error';
    staffOrdersState.detailError = error?.message || 'Item completion could not be saved.';
    renderStaffOrderDetail();
  } finally {
    staffOrdersState.detailSavingLineId = '';
    renderStaffOrderDetail();
  }
}

async function openStaffTrayAssignment(forgeOrderUuid) {
  ensureStaffTrayAssignmentUi();
  if (!staffTrayAssignmentDialog) {
    return;
  }

  staffOrdersState.trayDialogOpen = true;
  staffOrdersState.trayDialogLoading = true;
  staffOrdersState.trayDialogSaving = false;
  staffOrdersState.trayDialogError = '';
  staffOrdersState.trayDialogOrderUuid = forgeOrderUuid;
  staffOrdersState.trayDialogRecord = null;
  staffOrdersState.trayDialogSelectedTrayNumber = null;
  staffOrdersState.trayDialogAvailableTrays = [];
  lastStaffTrayAssignmentFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderStaffTrayAssignment();

  try {
    const [record, trays] = await Promise.all([
      orderStore.getOrder(forgeOrderUuid),
      orderStore.listTrays()
    ]);

    if (!record) {
      staffOrdersState.trayDialogError = 'That saved order could not be found.';
    } else if (!canAssignTrayToOrder(record)) {
      staffOrdersState.trayDialogError = 'This order already has an assigned tray.';
    } else {
      staffOrdersState.trayDialogRecord = record;
      staffOrdersState.trayDialogAvailableTrays = trays.filter((tray) => tray.tray_status === 'available');
    }
  } catch (error) {
    console.error('Forge tray assignment options failed to load', error);
    staffOrdersState.trayDialogError = 'Production trays could not be loaded on this device.';
  } finally {
    staffOrdersState.trayDialogLoading = false;
    renderStaffTrayAssignment();
    window.setTimeout(() => {
      (getStaffTrayAssignmentFocusableElements()[0] || staffTrayAssignmentDialog)?.focus();
    }, 0);
  }
}

function closeStaffTrayAssignment(options = {}) {
  const restoreFocus = options.restoreFocus !== false;
  staffOrdersState.trayDialogOpen = false;
  staffOrdersState.trayDialogLoading = false;
  staffOrdersState.trayDialogSaving = false;
  staffOrdersState.trayDialogError = '';
  staffOrdersState.trayDialogOrderUuid = '';
  staffOrdersState.trayDialogRecord = null;
  staffOrdersState.trayDialogSelectedTrayNumber = null;
  staffOrdersState.trayDialogAvailableTrays = [];
  renderStaffTrayAssignment();
  if (restoreFocus && lastStaffTrayAssignmentFocusTarget) {
    lastStaffTrayAssignmentFocusTarget.focus();
  }
  lastStaffTrayAssignmentFocusTarget = null;
}

async function submitStaffTrayAssignment() {
  if (
    staffOrdersState.trayDialogSaving
    || !staffOrdersState.trayDialogRecord
    || !staffOrdersState.trayDialogSelectedTrayNumber
  ) {
    return;
  }

  staffOrdersState.trayDialogSaving = true;
  staffOrdersState.trayDialogError = '';
  renderStaffTrayAssignment();

  try {
    const result = await orderStore.assignTrayToOrder(
      staffOrdersState.trayDialogRecord.forge_order_uuid,
      staffOrdersState.trayDialogSelectedTrayNumber
    );

    staffOrdersState.notice = `Tray ${result.tray.tray_number} assigned to ${result.order.payload?.customer?.full_name || 'this order'}.`;
    staffOrdersState.noticeTone = 'success';
    closeStaffTrayAssignment({ restoreFocus: false });
    await loadStaffOrdersQueue();
    staffOrdersState.detailRecord = await orderStore.getOrder(result.order.forge_order_uuid);
    renderStaffOrderDetail();
  } catch (error) {
    console.error('Forge tray assignment failed', error);
    staffOrdersState.trayDialogError = error?.message || 'Tray assignment could not be saved.';
    staffOrdersState.notice = '';
    staffOrdersState.trayDialogSaving = false;
    renderStaffTrayAssignment();
  }
}

function renderStaffTrayAssignment() {
  ensureStaffTrayAssignmentUi();
  if (!staffTrayAssignmentBackdrop || !staffTrayAssignmentDialog) {
    return;
  }

  staffTrayAssignmentBackdrop.hidden = !staffOrdersState.trayDialogOpen;
  staffTrayAssignmentDialog.hidden = !staffOrdersState.trayDialogOpen;

  if (!staffOrdersState.trayDialogOpen) {
    staffTrayAssignmentDialog.innerHTML = '';
    return;
  }

  if (staffOrdersState.trayDialogLoading) {
    staffTrayAssignmentDialog.innerHTML = `
      <div class="staff-order-detail-header">
        <div>
          <p class="eyebrow staff-orders-eyebrow">Production Tray Assignment</p>
          <h2 id="staff-tray-assignment-title">Loading Trays</h2>
        </div>
        <button class="text-button" type="button" data-action="close-staff-tray-assignment">Cancel</button>
      </div>
      <p class="staff-orders-status">Loading available production trays...</p>
    `;
    return;
  }

  if (staffOrdersState.trayDialogError || !staffOrdersState.trayDialogRecord) {
    staffTrayAssignmentDialog.innerHTML = `
      <div class="staff-order-detail-header">
        <div>
          <p class="eyebrow staff-orders-eyebrow">Production Tray Assignment</p>
          <h2 id="staff-tray-assignment-title">Tray Assignment Unavailable</h2>
        </div>
        <button class="text-button" type="button" data-action="close-staff-tray-assignment">Close</button>
      </div>
      <div class="staff-empty-state">
        <h3>Unable to assign a tray</h3>
        <p>${escapeHtml(staffOrdersState.trayDialogError || 'Tray assignment is unavailable.')}</p>
      </div>
    `;
    return;
  }

  const record = staffOrdersState.trayDialogRecord;
  const customerName = record.payload?.customer?.full_name || 'Unknown customer';
  const availableTrays = [...staffOrdersState.trayDialogAvailableTrays].sort((left, right) => left.tray_number - right.tray_number);
  const hasSelection = Number.isInteger(staffOrdersState.trayDialogSelectedTrayNumber);
  const disableSubmit = !hasSelection || staffOrdersState.trayDialogSaving;

  staffTrayAssignmentDialog.innerHTML = `
    <div class="staff-order-detail-header">
      <div>
        <p class="eyebrow staff-orders-eyebrow">Production Tray Assignment</p>
        <h2 id="staff-tray-assignment-title">Assign Tray</h2>
        <p>${escapeHtml(getOrderShortReference(record))} • ${escapeHtml(customerName)}</p>
      </div>
      <button class="text-button" type="button" data-action="close-staff-tray-assignment"${staffOrdersState.trayDialogSaving ? ' disabled' : ''}>Cancel</button>
    </div>

    ${staffOrdersState.trayDialogError ? buildStaffNoticeMarkup(staffOrdersState.trayDialogError, 'error') : ''}

    <section class="staff-order-detail-section">
      <div class="staff-order-detail-grid">
        <div><span>Order Number</span><strong>${escapeHtml(getOrderShortReference(record))}</strong></div>
        <div><span>Customer</span><strong>${escapeHtml(customerName)}</strong></div>
        <div><span>Current Tray</span><strong>${escapeHtml(getOrderTrayLabel(record))}</strong></div>
        <div><span>Production Status</span><strong>${escapeHtml(getOrderProductionStatusLabel(record))}</strong></div>
      </div>
    </section>

    <section class="staff-order-detail-section">
      <h3>Available Production Trays</h3>
      ${availableTrays.length ? `
        <div class="staff-tray-grid" role="group" aria-label="Available production trays">
          ${availableTrays.map((tray) => `
            <button
              class="secondary-button staff-tray-option${staffOrdersState.trayDialogSelectedTrayNumber === tray.tray_number ? ' is-selected' : ''}"
              type="button"
              data-action="staff-select-tray"
              data-tray-number="${escapeHtml(String(tray.tray_number))}"
              aria-pressed="${staffOrdersState.trayDialogSelectedTrayNumber === tray.tray_number ? 'true' : 'false'}"
              ${staffOrdersState.trayDialogSaving ? 'disabled' : ''}
            >
              Tray ${escapeHtml(String(tray.tray_number))}
            </button>
          `).join('')}
        </div>
      ` : `
        <div class="staff-empty-state">
          <h3>No production trays are currently available.</h3>
          <p>Finish packing or release a tray before assigning another order.</p>
        </div>
      `}
    </section>

    <div class="staff-order-card-actions">
      <button class="primary-button" type="button" data-action="staff-confirm-tray-assignment"${disableSubmit ? ' disabled' : ''}>
        ${staffOrdersState.trayDialogSaving ? 'Assigning Tray...' : 'Assign Tray'}
      </button>
      <button class="secondary-button" type="button" data-action="close-staff-tray-assignment"${staffOrdersState.trayDialogSaving ? ' disabled' : ''}>Cancel</button>
    </div>
  `;
}

async function openStaffPackingDialog(forgeOrderUuid) {
  ensureStaffPackingUi();
  if (!staffPackingDialog) {
    return;
  }

  staffOrdersState.packingDialogOpen = true;
  staffOrdersState.packingDialogOrderUuid = forgeOrderUuid;
  lastStaffPackingFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await retryStaffPackingDialogLoad();
}

function closeStaffPackingDialog(options = {}) {
  const restoreFocus = options.restoreFocus !== false;
  staffOrdersState.packingDialogOpen = false;
  staffOrdersState.packingDialogLoading = false;
  staffOrdersState.packingDialogSaving = false;
  staffOrdersState.packingDialogError = '';
  staffOrdersState.packingDialogOrderUuid = '';
  staffOrdersState.packingDialogRecord = null;
  staffOrdersState.packingDialogPackingVerification = null;
  staffOrdersState.packingDialogCheckedLineIds = [];
  staffOrdersState.packingDialogNote = '';
  renderStaffPackingDialog();
  if (restoreFocus && lastStaffPackingFocusTarget) {
    lastStaffPackingFocusTarget.focus();
  }
  lastStaffPackingFocusTarget = null;
}

async function retryStaffPackingDialogLoad() {
  if (!staffOrdersState.packingDialogOpen || !staffOrdersState.packingDialogOrderUuid) {
    return;
  }

  staffOrdersState.packingDialogLoading = true;
  staffOrdersState.packingDialogSaving = false;
  staffOrdersState.packingDialogError = '';
  staffOrdersState.packingDialogRecord = null;
  staffOrdersState.packingDialogPackingVerification = null;
  staffOrdersState.packingDialogCheckedLineIds = [];
  staffOrdersState.packingDialogNote = '';
  renderStaffPackingDialog();

  try {
    const result = await loadStaffPackingDialogData(staffOrdersState.packingDialogOrderUuid);
    if (!result.record) {
      throw new Error('That saved order could not be found.');
    }
    staffOrdersState.packingDialogRecord = result.record;
    staffOrdersState.packingDialogPackingVerification = result.packingVerification;
  } catch (error) {
    console.error('Forge packing dialog failed to load', error);
    staffOrdersState.packingDialogError = formatStaffPackingLoadError(error);
  } finally {
    staffOrdersState.packingDialogLoading = false;
    renderStaffPackingDialog();
    window.setTimeout(() => {
      (getStaffPackingFocusableElements()[0] || staffPackingDialog)?.focus();
    }, 0);
  }
}

async function loadStaffPackingDialogData(forgeOrderUuid) {
  const orderUuid = sanitizeText(forgeOrderUuid);
  if (!orderUuid) {
    throw new Error('Packing verification requires a saved order.');
  }

  const [record, packingVerification] = await Promise.all([
    orderStore.getOrder(orderUuid),
    orderStore.getPackingVerificationForOrder(orderUuid)
  ]);

  return {
    record,
    packingVerification: packingVerification || null
  };
}

function formatStaffPackingLoadError(error) {
  const message = sanitizeText(error?.message || '');
  if (/blocked by another open tab|open in another tab/i.test(message)) {
    return 'Forge storage is open in another tab. Close other Forge tabs, then select Retry.';
  }
  if (/could not be found/i.test(message)) {
    return 'That saved order could not be found.';
  }
  return 'Packing verification could not be loaded on this device.';
}

function renderStaffPackingDialogErrorState(message) {
  if (!staffPackingDialog) {
    return;
  }

  const errorMessage = escapeHtml(message || 'Packing verification is unavailable.');
  staffPackingDialog.innerHTML = `
    <div class="staff-order-detail-header">
      <div>
        <p class="eyebrow staff-orders-eyebrow">Packing Verification</p>
        <h2 id="staff-packing-title">Packing Unavailable</h2>
      </div>
      <button class="text-button" type="button" data-action="close-staff-packing">Cancel</button>
    </div>
    <div class="staff-empty-state">
      <h3>Unable to open this packing checklist</h3>
      <p>${errorMessage}</p>
      <div class="staff-order-card-actions staff-empty-actions">
        <button class="primary-button" type="button" data-action="staff-retry-packing-load">Retry</button>
        <button class="secondary-button" type="button" data-action="close-staff-packing">Cancel</button>
      </div>
    </div>
  `;
}

function renderStaffPackingDialog() {
  ensureStaffPackingUi();
  if (!staffPackingBackdrop || !staffPackingDialog) {
    return;
  }

  staffPackingBackdrop.hidden = !staffOrdersState.packingDialogOpen;
  staffPackingDialog.hidden = !staffOrdersState.packingDialogOpen;

  if (!staffOrdersState.packingDialogOpen) {
    staffPackingDialog.innerHTML = '';
    return;
  }

  if (staffOrdersState.packingDialogLoading) {
    staffPackingDialog.innerHTML = `
      <div class="staff-order-detail-header">
        <div>
          <p class="eyebrow staff-orders-eyebrow">Packing Verification</p>
          <h2 id="staff-packing-title">Loading Packing Checklist</h2>
        </div>
        <button class="text-button" type="button" data-action="close-staff-packing">Cancel</button>
      </div>
      <p class="staff-orders-status">Loading the assigned tray and expected items...</p>
    `;
    return;
  }

  if (staffOrdersState.packingDialogError || !staffOrdersState.packingDialogRecord) {
    renderStaffPackingDialogErrorState(staffOrdersState.packingDialogError || 'Packing verification is unavailable.');
    return;
  }

  try {
    const record = staffOrdersState.packingDialogRecord;
    const payload = record.payload || {};
    const customerName = payload.customer?.full_name || 'Unknown customer';
    const trayNumber = getOrderTrayNumber(record);
    const activeItems = getOrderActivePackingItems(record);
    const checkedIds = new Set(staffOrdersState.packingDialogCheckedLineIds);
    const verificationCounts = getOrderVerifiedPieceCounts(record, staffOrdersState.packingDialogCheckedLineIds);
    const allVerified = activeItems.length > 0 && activeItems.every((item) => checkedIds.has(String(item.line_id || '').trim()));
    const disableSubmit = !allVerified || staffOrdersState.packingDialogSaving;
    const fulfillmentMethod = payload.fulfillment?.method === 'pickup' ? 'Pickup' : 'Shipping';

    staffPackingDialog.innerHTML = `
      <div class="staff-order-detail-header">
        <div>
          <p class="eyebrow staff-orders-eyebrow">Packing Verification</p>
          <h2 id="staff-packing-title">Pack Order</h2>
          <p>${escapeHtml(getOrderShortReference(record))} • ${escapeHtml(customerName)}</p>
        </div>
        <button class="text-button" type="button" data-action="close-staff-packing"${staffOrdersState.packingDialogSaving ? ' disabled' : ''}>Cancel</button>
      </div>

      ${staffOrdersState.packingDialogError ? buildStaffNoticeMarkup(staffOrdersState.packingDialogError, 'error') : ''}

      <section class="staff-order-detail-section">
        <div class="staff-order-detail-grid">
          <div><span>Order Reference</span><strong>${escapeHtml(getOrderShortReference(record))}</strong></div>
          <div><span>Customer</span><strong>${escapeHtml(customerName)}</strong></div>
          <div><span>Assigned Tray</span><strong>${escapeHtml(`Tray ${trayNumber}`)}</strong></div>
          <div><span>Fulfillment</span><strong>${escapeHtml(fulfillmentMethod)}</strong></div>
          <div><span>Production Progress</span><strong>${escapeHtml(getOrderCompletionSummary(record))}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(getOrderProductionStatusLabel(record))}</strong></div>
        </div>
        <p class="staff-order-detail-note">Verify every item in the assigned tray before packing.</p>
        <p class="staff-order-detail-note">Packing this order will mark it Packed and release Tray ${escapeHtml(String(trayNumber || ''))}.</p>
      </section>

      <section class="staff-order-detail-section staff-packing-section">
        <div class="staff-section-heading">
          <div>
            <p class="eyebrow staff-orders-eyebrow">Tray Checklist</p>
            <h3>Verify Physical Items</h3>
          </div>
          <p class="staff-orders-status">${escapeHtml(`${verificationCounts.verifiedPieces} of ${verificationCounts.totalPieces} pieces verified`)}</p>
        </div>
        <div class="staff-packing-list">
          ${activeItems.map((item, index) => {
            const lineId = String(item.line_id || '').trim();
            const checkboxId = `staff-packing-item-${escapeHtml(lineId)}`;
            const itemIdentifier = getStaffPackingItemIdentifier(item);
            const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
            return `
              <label class="staff-packing-item${checkedIds.has(lineId) ? ' is-checked' : ''}" for="${checkboxId}">
                <input
                  id="${checkboxId}"
                  type="checkbox"
                  data-packing-line-id="${escapeHtml(lineId)}"
                  ${checkedIds.has(lineId) ? 'checked' : ''}
                  ${staffOrdersState.packingDialogSaving ? 'disabled' : ''}
                >
                <span class="staff-packing-item-order">${escapeHtml(String(index + 1))}.</span>
                <span class="staff-packing-item-body">
                  <strong>${escapeHtml(`${quantity} × ${item.product_display_name || item.product_definition_id || 'Custom Item'}`)}</strong>
                  ${itemIdentifier ? `<span>${escapeHtml(itemIdentifier)}</span>` : ''}
                </span>
              </label>
            `;
          }).join('')}
        </div>
      </section>

      <section class="staff-order-detail-section">
        <label class="staff-field-label" for="staff-packing-note">Packing Note (Optional)</label>
        <textarea id="staff-packing-note" class="staff-packing-note" data-staff-packing-note maxlength="500" rows="4" placeholder="Add an optional internal packing note"${staffOrdersState.packingDialogSaving ? ' disabled' : ''}>${escapeHtml(staffOrdersState.packingDialogNote)}</textarea>
      </section>

      <div class="staff-order-card-actions">
        <button class="primary-button" type="button" data-action="staff-pack-order-confirm"${disableSubmit ? ' disabled' : ''}>
          ${staffOrdersState.packingDialogSaving ? 'Packing Order...' : 'Pack Order & Release Tray'}
        </button>
        <button class="secondary-button" type="button" data-action="close-staff-packing"${staffOrdersState.packingDialogSaving ? ' disabled' : ''}>Cancel</button>
      </div>
    `;
  } catch (error) {
    console.error('Forge packing dialog render failed', error);
    staffOrdersState.packingDialogError = 'Packing checklist could not be rendered on this device.';
    renderStaffPackingDialogErrorState(staffOrdersState.packingDialogError);
  }
}

async function submitStaffPackingVerification() {
  if (
    staffOrdersState.packingDialogSaving
    || !staffOrdersState.packingDialogRecord
  ) {
    return;
  }

  staffOrdersState.packingDialogSaving = true;
  staffOrdersState.packingDialogError = '';
  renderStaffPackingDialog();

  try {
    const record = staffOrdersState.packingDialogRecord;
    const result = await orderStore.completePackingVerification(
      record.forge_order_uuid,
      staffOrdersState.packingDialogCheckedLineIds,
      staffOrdersState.packingDialogNote
    );

    staffOrdersState.notice = `Order ${getOrderShortReference(result.order)} packed. Tray ${result.packingVerification.tray_number} is now available.`;
    staffOrdersState.noticeTone = 'success';
    closeStaffPackingDialog({ restoreFocus: false });
    await loadStaffOrdersQueue();

    if (staffOrdersState.detailOpen && staffOrdersState.detailOrderUuid === result.order.forge_order_uuid) {
      staffOrdersState.detailRecord = await orderStore.getOrder(result.order.forge_order_uuid);
      staffOrdersState.detailPackingVerification = await orderStore.getPackingVerificationForOrder(result.order.forge_order_uuid);
      renderStaffOrderDetail();
    }
  } catch (error) {
    console.error('Forge packing verification failed', error);
    staffOrdersState.notice = '';
    staffOrdersState.noticeTone = 'error';
    staffOrdersState.packingDialogError = error?.message || 'Packing verification could not be saved.';
    staffOrdersState.packingDialogSaving = false;
    renderStaffPackingDialog();
  }
}

function getStaffOrderItemsMarkup(record, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="staff-empty-state"><h3>No items</h3><p>No normalized line items were stored for this record.</p></div>';
  }

  return items.map((item) => {
    const flags = Array.isArray(item.open_flags) ? item.open_flags : [];
    const pricing = item.pricing || {};
    const itemDetails = buildStaffItemDetailRows(item);
    const showPersonalizationOrder = usesPeopleAndPetsPersonalization(item);
    const customerNote = sanitizeText(item.customer_note || '');
    const productionNote = sanitizeText(item.production_note || '');
    const itemStatusLabel = getStaffItemProductionStatusLabel(item);
    const itemProgressLabel = getStaffItemCompletionSummary(item);
    const canComplete = canMarkStaffItemComplete(record, item);
    const isSaving = staffOrdersState.detailSavingLineId === item.line_id;
    const completionActionLabel = isSaving ? 'Saving...' : getStaffItemCompletionActionLabel(item);
    return `
      <article>
        <div class="staff-order-card-header">
          <div class="staff-order-item-title">
            <h4>${escapeHtml(item.product_display_name || item.product_definition_id || 'Custom Item')}</h4>
            <p>${escapeHtml(`${Number.isInteger(item.quantity) ? item.quantity : 1} × ${Number.isInteger(pricing.final_unit_price_cents) ? formatPrice(pricing.final_unit_price_cents / 100) : 'Quote Required'}`)}</p>
          </div>
          <div class="staff-order-card-badges">
            <span class="staff-status-badge ${escapeHtml(getStaffItemProductionStatusBadgeClass(item))}">${escapeHtml(itemStatusLabel)}</span>
            ${flags.length ? '<span class="staff-flag-badge">Item Flags</span>' : ''}
          </div>
        </div>
        <div class="staff-item-progress-row">
          <div class="staff-item-progress-copy">
            <span>Item Progress</span>
            <strong>${escapeHtml(itemProgressLabel)}</strong>
            ${item.completed_at ? `<p>Completed ${escapeHtml(formatReadableDateTime(item.completed_at))}</p>` : ''}
          </div>
          <button
            class="primary-button staff-item-complete-button"
            type="button"
            data-action="staff-complete-item"
            data-order-uuid="${escapeHtml(record.forge_order_uuid)}"
            data-line-id="${escapeHtml(item.line_id || '')}"
            ${!canComplete || isSaving ? 'disabled' : ''}
          >${escapeHtml(completionActionLabel)}</button>
        </div>
        <div class="staff-order-detail-grid">
          ${itemDetails.map((detail) => `
            <div>
              <span>${escapeHtml(detail.label)}</span>
              <strong>${escapeHtml(detail.value)}</strong>
            </div>
          `).join('')}
          <div><span>Price</span><strong>${Number.isInteger(pricing.line_total_cents) ? escapeHtml(formatPrice(pricing.line_total_cents / 100)) : 'Quote Required'}</strong></div>
          ${customerNote ? `<div><span>Customer Note</span><strong>${escapeHtml(customerNote)}</strong></div>` : ''}
          ${productionNote ? `<div><span>Production Note</span><strong>${escapeHtml(productionNote)}</strong></div>` : ''}
        </div>
        ${showPersonalizationOrder ? `
          <div class="staff-order-detail-row">
            <span>People & Pets Order</span>
            ${Array.isArray(item.personalization_order) && item.personalization_order.length
              ? buildStaffPersonalizationGridMarkup(item.personalization_order)
              : ''}
          </div>
        ` : ''}
        ${flags.length ? `
        <div class="staff-order-detail-row">
          <span>Item Open Flags</span>
          <ul class="staff-order-detail-list">${flags.map((flag) => `<li>${escapeHtml(flag.message || flag.code || 'Open flag')}</li>`).join('')}</ul>
        </div>` : ''}
      </article>
    `;
  }).join('');
}

function buildStaffPersonalizationGridMarkup(entries) {
  const source = Array.isArray(entries) ? entries : [];
  return `
    <div class="staff-personalization-grid" role="table" aria-label="People and pets order">
      <div class="staff-personalization-grid-header" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Name</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Icon / Request</span>
      </div>
      ${source.map((entry, index) => `
        <div class="staff-personalization-grid-row" role="row">
          <span role="cell">${escapeHtml(String(index + 1))}</span>
          <span role="cell">${escapeHtml(entry?.name || 'Unnamed')}</span>
          <span role="cell">${escapeHtml(entry?.type === 'pet' ? 'Pet' : 'Person')}</span>
          <span role="cell">${escapeHtml(formatStaffPersonalizationRequest(entry))}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function formatStaffPersonalizationRequest(entry) {
  if (entry?.type !== 'pet') {
    return '—';
  }

  if (entry?.custom_icon_description) {
    return `Custom Icon: ${entry.custom_icon_description}`;
  }
  if (entry?.icon) {
    return entry.icon.replace(/_/g, ' ');
  }
  return '—';
}

function buildStaffItemDetailRows(item) {
  const attributes = item?.structured_attributes && typeof item.structured_attributes === 'object'
    ? item.structured_attributes
    : {};
  const configurationSnapshot = item?.configuration_snapshot && typeof item.configuration_snapshot === 'object'
    ? item.configuration_snapshot
    : {};
  const productDefinitionId = resolveConfiguredProductDefinitionId(
    item?.product_definition_id || attributes.product_definition_id || item?.productDefinitionId || ''
  );
  const familyFieldLabel = getFamilyFieldLabel(productDefinitionId);
  const rows = [
    { label: 'Fulfillment', value: formatFulfillmentMethodLabel(attributes.fulfillment_method) },
    { label: 'Size', value: sanitizeText(attributes.size || configurationSnapshot.size || '') },
    { label: 'Tree Color', value: sanitizeText(attributes.tree_color || configurationSnapshot.treeColor || configurationSnapshot.tree_color || '') },
    { label: getBowColorDetailLabel(productDefinitionId), value: sanitizeText(attributes.bow_color || configurationSnapshot.bowColor || configurationSnapshot.bow_color || configurationSnapshot.bow_and_stocking_color || '') },
    { label: familyFieldLabel, value: sanitizeText(attributes.family_name || configurationSnapshot.familyName || configurationSnapshot.family_name || configurationSnapshot.lastName || configurationSnapshot.last_name || '') },
    { label: 'Personalization', value: formatPersonalizationModeLabel(configurationSnapshot.personalizationMode || configurationSnapshot.personalization_mode || '') },
    { label: 'Edge Text', value: sanitizeText(configurationSnapshot.edgeText || configurationSnapshot.edge_text || '') },
    { label: 'Year', value: formatDisplayValue(attributes.year ?? configurationSnapshot.year ?? configurationSnapshot.establishedYear ?? configurationSnapshot.established_year ?? '') }
  ];

  return rows.filter((row) => row.value);
}

function getBowColorDetailLabel(productDefinitionId) {
  return productDefinitionId === 'babys_first_christmas' ? 'Bow and Stocking Color' : 'Bow Color';
}

function formatFulfillmentMethodLabel(value) {
  const normalized = sanitizeText(value || '').toLowerCase();
  if (normalized === 'pickup' || normalized === 'local pickup') {
    return 'Local Pickup';
  }
  if (normalized === 'shipping') {
    return 'Shipping';
  }
  return capitalizeWords(normalized);
}

function formatPersonalizationModeLabel(value) {
  const normalized = sanitizeText(value || '');
  if (!normalized) {
    return '';
  }
  if (normalized === 'As Shown' || normalized === 'Change Edge Text') {
    return normalized;
  }
  return capitalizeWords(normalized);
}

function usesPeopleAndPetsPersonalization(item) {
  const attributes = item?.structured_attributes && typeof item.structured_attributes === 'object'
    ? item.structured_attributes
    : {};
  const personalizationOrder = Array.isArray(item?.personalization_order) ? item.personalization_order : [];
  return personalizationOrder.length > 0 || Number(attributes.people_count || 0) > 0 || Number(attributes.pet_count || 0) > 0;
}

function getPayloadPreviewFocusableElements() {
  if (!payloadPreviewDialog) {
    return [];
  }

  return [...payloadPreviewDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}

function getSavedOrdersFocusableElements() {
  if (!savedOrdersDialog) {
    return [];
  }

  return [...savedOrdersDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}

function getStaffOrderDetailFocusableElements() {
  if (!staffOrderDetailDialog) {
    return [];
  }

  return [...staffOrderDetailDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}

function getStaffTrayAssignmentFocusableElements() {
  if (!staffTrayAssignmentDialog) {
    return [];
  }

  return [...staffTrayAssignmentDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}

function getStaffPackingFocusableElements() {
  if (!staffPackingDialog) {
    return [];
  }

  return [...staffPackingDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('disabled'));
}

function buildCurrentOrderStateSnapshot() {
  return forgeOrderPayloadPreview.snapshotCurrentOrderState({
    items: getOrderItems(),
    customerDraft,
    appState
  });
}

function buildCurrentOrderPayloadPreview() {
  return forgeOrderPayloadPreview.buildCurrentOrderPayloadPreview({
    ...buildCurrentOrderStateSnapshot(),
    previewContextStore: payloadPreviewContextStore,
    preferredForgeOrderUuid: appState.activeOrderSessionId || '',
    contextOverrides: {
      source: 'customer_kiosk',
      orderStatus: 'draft',
      deviceId: null,
      event: null,
      submittedAt: null
    }
  });
}

function openJsonViewer({ title, copy, json, error = '', payload = null }) {
  ensurePayloadPreviewUi();
  if (!payloadPreviewDialog) {
    return;
  }

  payloadPreviewState.title = title;
  payloadPreviewState.copy = copy;
  payloadPreviewState.copyStatus = '';
  payloadPreviewState.copyTone = '';
  payloadPreviewState.error = error;
  payloadPreviewState.payload = payload;
  payloadPreviewState.json = json;
  payloadPreviewState.open = true;
  lastPayloadPreviewFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderPayloadPreview();
  window.setTimeout(() => {
    (getPayloadPreviewFocusableElements()[0] || payloadPreviewDialog)?.focus();
  }, 0);
}

function openPayloadPreview() {
  try {
    const preview = buildCurrentOrderPayloadPreview();
    console.log('Forge payload preview', preview.payload);
    openJsonViewer({
      title: 'Normalized Order Payload',
      copy: 'Inspect the current Forge order state as formatted JSON without submitting anything.',
      json: preview.json,
      payload: preview.payload
    });
  } catch (error) {
    console.error('Forge payload preview failed', error);
    openJsonViewer({
      title: 'Normalized Order Payload',
      copy: 'Inspect the current Forge order state as formatted JSON without submitting anything.',
      json: error && error.stack ? error.stack : String(error),
      error: 'Payload preview failed. See the browser console for details.'
    });
  }
}

function closePayloadPreview(restoreFocus = true) {
  payloadPreviewState.open = false;
  payloadPreviewState.copyStatus = '';
  payloadPreviewState.copyTone = '';
  payloadPreviewState.title = 'Normalized Order Payload';
  payloadPreviewState.copy = 'Inspect the current Forge order state as formatted JSON without submitting anything.';
  renderPayloadPreview();
  if (restoreFocus && lastPayloadPreviewFocusTarget) {
    lastPayloadPreviewFocusTarget.focus();
  }
  lastPayloadPreviewFocusTarget = null;
}

async function copyPayloadPreviewJson() {
  if (!payloadPreviewState.json) {
    return;
  }

  const result = await forgeOrderPayloadPreview.copyPayloadPreviewText(payloadPreviewState.json, {
    clipboard: navigator.clipboard
  });
  payloadPreviewState.copyStatus = result.message;
  payloadPreviewState.copyTone = result.copied ? 'success' : '';
  renderPayloadPreview();
}

async function openSavedOrdersInspector() {
  ensureSavedOrdersUi();
  if (!savedOrdersDialog) {
    return;
  }

  savedOrderInspectorState.open = true;
  savedOrderInspectorState.loading = true;
  savedOrderInspectorState.error = '';
  savedOrderInspectorState.records = [];
  renderSavedOrdersDialog();

  try {
    const [records, pendingCount] = await Promise.all([
      orderStore.listOrders(),
      orderStore.countOrdersBySyncStatus('pending')
    ]);
    savedOrderInspectorState.records = records;
    savedOrderInspectorState.error = pendingCount > 0 ? `${pendingCount} saved order${pendingCount === 1 ? '' : 's'} pending future sync.` : '';
  } catch (error) {
    console.error('Forge saved-order inspector failed', error);
    savedOrderInspectorState.error = 'Saved local orders could not be loaded on this device.';
  } finally {
    savedOrderInspectorState.loading = false;
    renderSavedOrdersDialog();
    window.setTimeout(() => {
      (getSavedOrdersFocusableElements()[0] || savedOrdersDialog)?.focus();
    }, 0);
  }
}

function closeSavedOrdersInspector() {
  savedOrderInspectorState.open = false;
  savedOrderInspectorState.loading = false;
  renderSavedOrdersDialog();
}

async function inspectSavedOrderRecord(forgeOrderUuid) {
  try {
    const record = await orderStore.getOrder(forgeOrderUuid);
    if (!record) {
      return;
    }
    openJsonViewer({
      title: 'Saved Local Order Record',
      copy: 'Inspect the durable local order record exactly as it was saved on this device.',
      json: JSON.stringify(record, null, 2)
    });
  } catch (error) {
    console.error('Forge saved-order record inspection failed', error);
    openJsonViewer({
      title: 'Saved Local Order Record',
      copy: 'Inspect the durable local order record exactly as it was saved on this device.',
      json: error && error.stack ? error.stack : String(error),
      error: 'Saved order inspection failed. See the browser console for details.'
    });
  }
}

async function renderThankYouScreen() {
  if (!thankYouCopy || !thankYouReference) {
    return;
  }

  const completionReceipt = completionReceiptManager.getReceipt();
  if (completionReceipt && completionReceipt.forgeOrderUuid) {
    appState.lastSubmittedOrderUuid = completionReceipt.forgeOrderUuid;
  }

  if (completionReceipt) {
    const customerName = completionReceipt.customerName || 'Your order';
    thankYouCopy.textContent = `${customerName} has been safely saved on this device for the Hilltop Shop team.`;
    thankYouReference.hidden = false;
    thankYouReference.innerHTML = `
      <span class="summary-label">Order Reference</span>
      <strong>${escapeHtml(completionReceipt.shortOrderReference)}</strong>
    `;
    renderDebugOrderTools();
    return;
  }

  if (!appState.lastSubmittedOrderUuid) {
    thankYouCopy.textContent = 'We safely saved your order on this device for the Hilltop Shop team.';
    thankYouReference.hidden = true;
    renderDebugOrderTools();
    return;
  }

  try {
    const record = await orderStore.getOrder(appState.lastSubmittedOrderUuid);
    if (!record) {
      thankYouCopy.textContent = 'Your order was saved earlier on this device.';
      thankYouReference.hidden = true;
      renderDebugOrderTools();
      return;
    }

    const customerName = record.payload?.customer?.full_name || 'your order';
    thankYouCopy.textContent = `${customerName} has been safely saved on this device for the Hilltop Shop team.`;
    thankYouReference.hidden = false;
    thankYouReference.innerHTML = `
      <span class="summary-label">Order Reference</span>
      <strong>${escapeHtml(record.forge_order_uuid.slice(0, 8).toUpperCase())}</strong>
    `;
  } catch (error) {
    console.error('Forge thank-you screen failed to load the saved order', error);
    thankYouCopy.textContent = 'Your order has been saved on this device.';
    thankYouReference.hidden = true;
  }

  renderDebugOrderTools();
}

async function submitCurrentOrder() {
  const validationResult = validateFinalReviewDraft();
  if (!validationResult.isValid) {
    finalReviewState.message = `${validationResult.issues[0]} Use Edit Items or Edit Customer Information to finish your order.`;
    finalReviewState.tone = 'error';
    renderFinalReviewStatus();
    finalReviewStatus?.focus();
    return;
  }

  if (finalReviewState.savingOrder) {
    return;
  }

  finalReviewState.savingOrder = true;
  finalReviewState.message = '';
  finalReviewState.tone = '';
  renderFinalReviewStatus();
  renderPlaceOrderButton();

  const orderStateSnapshot = buildCurrentOrderStateSnapshot();

  try {
    const result = await orderSubmissionService.submitOrder({
      activeOrderSessionId: appState.activeOrderSessionId,
      orderState: orderStateSnapshot,
      deviceId: null,
      event: null
    });

    if (!result.ok) {
      console.error('Forge local order submission failed', result.error);
      finalReviewState.savingOrder = false;
      finalReviewState.message = 'We could not save your order. Please ask a Hilltop Shop team member for help.';
      finalReviewState.tone = 'error';
      renderFinalReviewStatus();
      renderPlaceOrderButton();
      finalReviewStatus?.focus();
      return;
    }

    const completionReceipt = forgeOrderSubmission.buildCompletionReceipt({
      record: result.record,
      customerName: orderStateSnapshot.customerDraft?.fullName || ''
    });
    if (!completionReceipt) {
      throw new Error('Forge local order submission did not produce a valid completion receipt.');
    }

    completionReceiptManager.saveReceipt(completionReceipt);
    appState.lastSubmittedOrderUuid = result.record.forge_order_uuid;
    appState.currentScreen = 'thank-you';
    clearEditableOrderStateAfterSubmit();
    await renderThankYouScreen();
    showScreen('thank-you');
  } catch (error) {
    console.error('Forge local order submission failed', error);
    finalReviewState.savingOrder = false;
    finalReviewState.message = 'We could not save your order. Please ask a Hilltop Shop team member for help.';
    finalReviewState.tone = 'error';
    renderFinalReviewStatus();
    renderPlaceOrderButton();
    finalReviewStatus?.focus();
  }
}

function clearEditableOrderStateAfterSubmit() {
  const previousOrderSessionId = appState.activeOrderSessionId;
  draft.productDefinitionId = 'tree_ornament';
  draft.size = '';
  draft.treeColor = '';
  draft.bowColor = '';
  draft.familyName = '';
  draft.personalizationMode = '';
  draft.edgeText = '';
  draft.year = getDefaultYearValue('tree_ornament');
  draft.entries = [];
  localStorage.removeItem(storageKey);
  localStorage.removeItem(customerDraftStorageKey);
  localStorage.removeItem(orderItemsStorageKey);
  saveOrderItems([]);
  resetCustomerDraftState();
  clearDisplayedCustomerFields();
  clearTreeFormErrors();
  clearCustomerFormErrors();
  clearOrderUiNote();
  clearDiscardPrompt();
  reviewState.saving = false;
  reviewState.error = '';
  finalReviewState.savingOrder = false;
  closeSavedOrdersInspector();
  closePayloadPreview(false);
  appState.editingItemId = '';
  appState.reviewedItemId = '';
  appState.activeOrderSessionId = createSessionId();
  saveAppState();
  submissionContextManager.clearContext(previousOrderSessionId);
  hydrateFormFromDraft();
  hydrateCustomerFormFromDraft();
  renderEntries();
  renderTreeReview();
  renderCurrentOrder();
  renderCustomerOrderContext();
  renderCurrentOrderUtilityButtons();
}

function renderFinalReviewCustomer() {
  if (!finalReviewCustomer) {
    return;
  }

  const customerRows = [
    customerDraft.fullName ? { label: 'Full Name', value: customerDraft.fullName } : null,
    customerDraft.email ? { label: 'Email', value: customerDraft.email } : null,
    customerDraft.phone ? { label: 'Phone', value: formatCustomerPhone(customerDraft.phone) } : null,
    customerDraft.preferredContact ? { label: 'Preferred Contact', value: customerDraft.preferredContact } : null
  ].filter(Boolean);

  finalReviewCustomer.innerHTML = `
    <div class="final-review-card-header">
      <h3>Customer Information</h3>
      <button class="secondary-button" type="button" data-action="edit-customer-from-final">Edit Customer Information</button>
    </div>
    <div class="final-review-details">
      ${customerRows.map((row) => `
        <div class="stat-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>
      `).join('')}
    </div>
  `;
}

function renderFinalReviewDelivery() {
  if (!finalReviewDelivery) {
    return;
  }

  const addressLines = customerDraft.fulfillmentMethod === 'Shipping'
    ? [
        customerDraft.addressLine1,
        customerDraft.addressLine2,
        [customerDraft.city, customerDraft.state, customerDraft.postalCode].filter(Boolean).join(', '),
        customerDraft.country
      ].filter((value) => sanitizeText(value || ''))
    : [];

  finalReviewDelivery.innerHTML = `
    <h3>Delivery</h3>
    <div class="final-review-details">
      <div class="stat-row"><span>Method</span><strong>${escapeHtml(customerDraft.fulfillmentMethod || 'Shipping')}</strong></div>
      ${customerDraft.fulfillmentMethod === 'Shipping' ? `
        <div class="final-review-address">
          <strong>Shipping</strong>
          ${addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
        </div>
      ` : '<p class="final-review-copy">Local Pickup</p>'}
      ${customerDraft.neededBy ? `<div class="stat-row"><span>Needed By</span><strong>${escapeHtml(formatReadableDate(customerDraft.neededBy))}</strong></div>` : ''}
    </div>
  `;
}

function renderFinalReview() {
  const items = getOrderItems();
  const { itemCount, subtotal } = getCurrentOrderStats(items);

  if (finalReviewItems) {
    finalReviewItems.innerHTML = items.length > 0
      ? `
        <section class="final-review-items-shell">
          <div class="final-review-section-header">
            <h3>Order Items</h3>
            <button class="secondary-button" type="button" data-action="edit-items-from-final">Edit Items</button>
          </div>
          <div class="final-review-item-list">
            ${items.map(createFinalReviewItemMarkup).join('')}
          </div>
        </section>
      `
      : `
        <div class="empty-order-card">
          <h3>Your order is empty</h3>
          <p>Use Edit Items to add an item before placing your order.</p>
        </div>
      `;
  }

  if (finalReviewSummary) {
    finalReviewSummary.innerHTML = `
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
    `;
  }

  renderFinalReviewCustomer();
  renderFinalReviewDelivery();
  renderFinalReviewStatus();
  renderPlaceOrderButton();
}

function openFinalReview() {
  finalReviewState.message = '';
  finalReviewState.tone = '';
  ensurePayloadPreviewUi();
  renderFinalReview();
  showScreen('final-review');
}

function resetTreeDraftForNewItem() {
  resetDraftState('tree_ornament');
  renderAddConfirmation();
  saveDraft();
  saveAppState();
  renderEntries();
  renderTreeReview();
  renderTreeSubmitButton();
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
  draft.personalizationMode = draftSource.personalizationMode;
  draft.edgeText = draftSource.edgeText;
  draft.year = draftSource.year;
  draft.entries = draftSource.entries;
  draft.productDefinitionId = resolveConfiguredProductDefinitionId(draftSource.productDefinitionId);
  appState.editingItemId = item.itemId;
  appState.reviewedItemId = item.itemId;
  clearOrderUiNote();
  reviewState.saving = false;
  reviewState.lastAddedItemId = '';
  reviewState.error = '';
  clearDiscardPrompt();
  hydrateFormFromDraft();
  saveDraft();
  saveAppState();
  renderEntries();
  renderTreeReview();
  renderTreeSubmitButton();
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
  closeAddConfirmation(false);
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

  const config = getProductConfig();
  const wasEditing = Boolean(appState.editingItemId);
  reviewState.saving = true;
  reviewState.error = '';
  renderTreeSubmitButton();

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
    renderTreeSubmitButton();
    if (wasEditing) {
      setOrderUiNote(config.updateNote);
      openCurrentOrder();
      return;
    }
    clearOrderUiNote();
    openAddConfirmation(savedItem.itemId, 'Added to Your Order', 'This ornament has been saved to the current order.');
  } catch {
    reviewState.saving = false;
    reviewState.error = 'We could not save this item. Please try again.';
    renderTreeSubmitButton();
    treeStatus.textContent = reviewState.error;
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
  const config = getProductConfig();

  const values = {
    size: treeFields.size.value,
    treeColor: treeFields.treeColor.value,
    bowColor: treeFields.bowColor.value,
    familyName: sanitizeText(treeFields.familyName.value),
    personalizationMode: treeFields.personalizationMode.value,
    edgeText: treeFields.edgeText.value,
    year: treeFields.year.value.trim()
  };

  let isValid = true;

  if (config.requiresSize && !allowedValues.size.includes(values.size)) {
    setFieldError('size', 'Please choose an option.');
    isValid = false;
  }
  if (config.requiresTreeColor && !allowedValues.treeColor.includes(values.treeColor)) {
    setFieldError('treeColor', 'Please choose an option.');
    isValid = false;
  }
  if (config.requiresBowColor && !getAllowedBowColors().includes(values.bowColor)) {
    setFieldError('bowColor', 'Please choose an option.');
    isValid = false;
  }

  if (config.requiresPersonalizationMode && !allowedValues.personalizationMode.includes(values.personalizationMode)) {
    setFieldError('personalizationMode', 'Please choose an option.');
    isValid = false;
  }

  if (config.requiresFamilyName !== false && !values.familyName) {
    setFieldError('familyName', getFamilyFieldRequiredMessage());
    isValid = false;
  }

  if (config.requiresPersonalizationMode && values.personalizationMode === 'Change Edge Text' && !values.edgeText) {
    setFieldError('edgeText', 'Please enter edge text.');
    isValid = false;
  }

  const yearNumber = Number.parseInt(values.year, 10);
  const yearLooksValid = /^\d{4}$/.test(values.year) && yearNumber >= 1900 && yearNumber <= 2100;
  if (config.requiresYear !== false && !values.year) {
    setFieldError('year', getYearFieldRequiredMessage());
    isValid = false;
  } else if (config.requiresYear !== false && !yearLooksValid) {
    setFieldError('year', 'Enter a valid 4-digit year.');
    isValid = false;
  }

  const minimumEntryCount = Number.isFinite(config.minimumEntryCount) ? config.minimumEntryCount : (config.requiresEntries ? 1 : 0);
  if (minimumEntryCount > 0 && draft.entries.length < minimumEntryCount) {
    setFieldError('entries', 'Add at least one person or pet.');
    isValid = false;
  }

  const { size, limit, count } = getCapacityDetails();
  if (size && count > limit) {
    setFieldError('entries', `${size} ornaments can include up to ${limit} combined people and pets.`);
    isValid = false;
  } else if (!config.requiresSize && count > limit) {
    setFieldError('entries', `This ornament can include up to ${limit} combined people and pets.`);
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
  normalizeRestoredScreenState();
  renderEntries();
  renderTreeReview();
  renderCurrentOrder();
  renderFinalReview();
  renderCustomerOrderContext();
  renderCurrentOrderUtilityButtons();
  renderDiscardPanels();
  renderAddConfirmation();
  renderTreeSubmitButton();
  ensurePayloadPreviewUi();
  ensureSavedOrdersUi();
  ensureStaffOrderDetailUi();
  ensureStaffTrayAssignmentUi();
  renderDebugOrderTools();
  renderPlaceOrderButton();
  renderStaffOrdersQueue();
  renderReadyToPackQueue();

  if (staffOrdersState.enabled) {
    loadStaffOrdersQueue();
    showScreen(appState.currentScreen === 'ready-to-pack' ? 'ready-to-pack' : 'staff-orders');
  } else if (appState.currentScreen === 'tree-customization') {
    showScreen('tree-customization');
  } else if (appState.currentScreen === 'tree-review') {
    if (appState.editingItemId || !isTreeDraftBlank()) {
      showScreen('tree-customization');
    } else if (hasOrderItems()) {
      showScreen('current-order');
    }
  } else if (appState.currentScreen === 'customer-information' && hasOrderItems()) {
    showScreen('customer-information');
  } else if (appState.currentScreen === 'final-review') {
    showScreen('final-review');
  } else if (appState.currentScreen === 'thank-you' && appState.lastSubmittedOrderUuid) {
    renderThankYouScreen();
    showScreen('thank-you');
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

    if (action === 'staff-open-orders') {
      openStaffOrdersScreen();
      return;
    }

    if (action === 'staff-open-ready-to-pack') {
      openReadyToPackScreen();
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
    if (staffOrdersState.packingDialogOpen && event.key === 'Tab') {
      const focusable = getStaffPackingFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        staffPackingDialog?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1 || currentIndex === -1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    if (staffOrdersState.packingDialogOpen && event.key === 'Escape') {
      event.preventDefault();
      if (!staffOrdersState.packingDialogSaving) {
        closeStaffPackingDialog();
      }
      return;
    }

    if (staffOrdersState.trayDialogOpen && event.key === 'Tab') {
      const focusable = getStaffTrayAssignmentFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        staffTrayAssignmentDialog?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1 || currentIndex === -1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    if (staffOrdersState.trayDialogOpen && event.key === 'Escape') {
      event.preventDefault();
      closeStaffTrayAssignment();
      return;
    }

    if (staffOrdersState.detailOpen && event.key === 'Tab') {
      const focusable = getStaffOrderDetailFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        staffOrderDetailDialog?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1 || currentIndex === -1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    if (staffOrdersState.detailOpen && event.key === 'Escape') {
      event.preventDefault();
      closeStaffOrderDetail();
      return;
    }

    if (savedOrderInspectorState.open && event.key === 'Tab') {
      const focusable = getSavedOrdersFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        savedOrdersDialog?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1 || currentIndex === -1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    if (savedOrderInspectorState.open && event.key === 'Escape') {
      event.preventDefault();
      closeSavedOrdersInspector();
      return;
    }

    if (payloadPreviewState.open && event.key === 'Tab') {
      const focusable = getPayloadPreviewFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        payloadPreviewDialog?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1 || currentIndex === -1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    if (payloadPreviewState.open && event.key === 'Escape') {
      event.preventDefault();
      closePayloadPreview();
      return;
    }

    if (addConfirmationState.open && event.key === 'Tab') {
      const focusable = getConfirmationDialogFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        addConfirmationDialog?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === focusable.length - 1 || currentIndex === -1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    if (event.key !== 'Escape' || staffPanel?.hidden) {
      return;
    }
    event.preventDefault();
    closeStaffPanel();
  });

  addConfirmationDialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    if (action === 'confirmation-continue-customer') {
      closeAddConfirmation(false);
      openCustomerInformation();
      return;
    }

    if (action === 'confirmation-view-current-order') {
      openCurrentOrder();
      return;
    }

    if (action === 'confirmation-add-another') {
      closeAddConfirmation(false);
      resetTreeDraftForNewItem();
      showScreen('ornaments');
    }
  });

  addPersonButton.addEventListener('click', () => addEntry('person'));
  addPetButton.addEventListener('click', () => addEntry('pet'));

  utilityOrderButtons.forEach((button) => {
    button.addEventListener('click', () => {
      openCurrentOrderUtilityFromContext(button.dataset.utilityContext || '');
    });
  });

  optionChoiceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setOptionChoiceValue(button.dataset.choiceField || '', button.dataset.choiceValue || '', true);
    });

    button.addEventListener('keydown', (event) => {
      const fieldName = button.dataset.choiceField || '';
      const buttons = optionChoiceButtons.filter((candidate) => candidate.dataset.choiceField === fieldName);
      const currentIndex = buttons.indexOf(button);

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setOptionChoiceValue(fieldName, button.dataset.choiceValue || '', true);
        return;
      }

      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
      const nextButton = buttons[nextIndex];
      if (!nextButton) {
        return;
      }
      setOptionChoiceValue(fieldName, nextButton.dataset.choiceValue || '', true);
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
    if (!appState.editingItemId) {
      openTreeReview();
      return;
    }
    addTreeItemToOrder();
  });

  Object.entries(treeFields).forEach(([name, field]) => {
    field.addEventListener('input', () => {
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
      treeStatus.textContent = '';
      saveDraft();
      if (name === 'size') {
        setFieldError('entries', '');
        renderCapacityMessage();
        renderTreeCustomizationImage();
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

  document.querySelectorAll('[data-action="back-ornaments-from-order"]').forEach((button) => {
    button.addEventListener('click', () => {
      clearOrderUiNote();
      showScreen('ornaments');
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
    if (!validateCustomerForm()) {
      return;
    }
    openFinalReview();
  });

  document.querySelector('[data-screen="final-review"]')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    if (action === 'edit-items-from-final') {
      finalReviewState.message = '';
      finalReviewState.tone = '';
      renderFinalReviewStatus();
      openCurrentOrder();
      return;
    }

    if (action === 'edit-customer-from-final') {
      finalReviewState.message = '';
      finalReviewState.tone = '';
      renderFinalReviewStatus();
      showScreen('customer-information');
      return;
    }

    if (action === 'place-order-development') {
      submitCurrentOrder();
      return;
    }

    if (action === 'preview-order-payload') {
      openPayloadPreview();
    }
  });

  payloadPreviewDialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
      return;
    }

    if (action === 'close-payload-preview') {
      closePayloadPreview();
      return;
    }

    if (action === 'copy-payload-preview') {
      copyPayloadPreviewJson();
    }
  });

  payloadPreviewBackdrop?.addEventListener('click', (event) => {
    if (event.target === payloadPreviewBackdrop) {
      closePayloadPreview();
    }
  });

  savedOrdersDialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const orderUuid = event.target.closest('[data-order-uuid]')?.dataset.orderUuid;
    if (!action) {
      return;
    }

    if (action === 'close-saved-orders') {
      closeSavedOrdersInspector();
      return;
    }

    if (action === 'inspect-saved-order-record' && orderUuid) {
      inspectSavedOrderRecord(orderUuid);
    }
  });

  savedOrdersBackdrop?.addEventListener('click', (event) => {
    if (event.target === savedOrdersBackdrop) {
      closeSavedOrdersInspector();
    }
  });

  debugOrderToolContainers.forEach((container) => {
    container.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }

      if (action === 'view-saved-local-orders') {
        openSavedOrdersInspector();
        return;
      }

      if (action === 'inspect-last-saved-order' && appState.lastSubmittedOrderUuid) {
        inspectSavedOrderRecord(appState.lastSubmittedOrderUuid);
      }
    });
  });

  document.querySelector('[data-screen="staff-orders"]')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.matches('[data-staff-orders-search]')) {
      staffOrdersState.searchTerm = target.value;
      renderStaffOrdersQueue();
    }
  });

  document.querySelector('[data-screen="staff-orders"]')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    const filterKey = target.dataset.staffFilter;
    if (!filterKey) {
      return;
    }
    staffOrdersState.filters[filterKey] = String(target.value || 'all').trim().toLowerCase();
    renderStaffOrdersQueue();
  });

  document.querySelector('[data-screen="staff-orders"]')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const orderUuid = event.target.closest('[data-order-uuid]')?.dataset.orderUuid;
    if (!action) {
      return;
    }

    if (action === 'staff-refresh-orders') {
      staffOrdersState.notice = '';
      loadStaffOrdersQueue();
      return;
    }

    if (action === 'staff-open-ready-to-pack') {
      staffOrdersState.notice = '';
      openReadyToPackScreen();
      return;
    }

    if (action === 'staff-return-welcome') {
      staffOrdersState.notice = '';
      closeStaffPackingDialog({ restoreFocus: false });
      closeStaffTrayAssignment();
      closeStaffOrderDetail();
      showScreen('welcome');
      return;
    }

    if (action === 'staff-clear-order-filters') {
      staffOrdersState.notice = '';
      staffOrdersState.searchTerm = '';
      staffOrdersState.filters = forgeLocalOrdersQueue.createEmptyOrderFilters();
      renderStaffOrdersQueue();
      return;
    }

    if (action === 'staff-view-order' && orderUuid) {
      openStaffOrderDetail(orderUuid);
    }

    if (action === 'staff-pack-order' && orderUuid) {
      staffOrdersState.notice = '';
      openStaffPackingDialog(orderUuid);
    }
  });

  document.querySelector('[data-screen="ready-to-pack"]')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const orderUuid = event.target.closest('[data-order-uuid]')?.dataset.orderUuid;
    if (!action) {
      return;
    }

    if (action === 'staff-refresh-ready-to-pack') {
      staffOrdersState.notice = '';
      loadStaffOrdersQueue();
      return;
    }

    if (action === 'staff-open-orders') {
      staffOrdersState.notice = '';
      showScreen('staff-orders');
      return;
    }

    if (action === 'staff-return-welcome') {
      staffOrdersState.notice = '';
      closeStaffPackingDialog({ restoreFocus: false });
      closeStaffTrayAssignment();
      closeStaffOrderDetail();
      showScreen('welcome');
      return;
    }

    if (action === 'staff-view-order' && orderUuid) {
      openStaffOrderDetail(orderUuid);
    }
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
