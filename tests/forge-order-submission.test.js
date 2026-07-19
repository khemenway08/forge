const test = require('node:test');
const assert = require('node:assert/strict');

const { buildForgeOrderPayload } = require('../public/js/forge-order-payload-builder.js');
const orderStoreModule = require('../public/js/forge-order-store.js');
const submissionModule = require('../public/js/forge-order-submission.js');

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function createCustomerDraft(overrides = {}) {
  return {
    orderSessionId: 'order-session-123',
    fullName: 'Kyle Hemenway',
    email: 'kmhemenway22@gmail.com',
    phone: '(303) 507-1567',
    preferredContact: 'Text',
    fulfillmentMethod: 'Shipping',
    addressLine1: '123 Main Street',
    addressLine2: '',
    city: 'Denver',
    state: 'CO',
    postalCode: '80202',
    country: 'United States',
    neededBy: '2026-12-01',
    ...overrides
  };
}

function createAppState(overrides = {}) {
  return {
    currentScreen: 'final-review',
    editingItemId: '',
    reviewedItemId: '',
    activeOrderSessionId: 'order-session-123',
    ...overrides
  };
}

function createItem(overrides = {}) {
  return {
    itemId: 'item-1',
    productDefinitionId: 'tree_ornament',
    imagePath: '/assets/products/family-tree-ornament-large.jpeg',
    displayName: 'Tree Ornament',
    category: 'ornament',
    quantity: 1,
    unitPrice: 30,
    size: 'Large',
    treeColor: 'Green',
    bowColor: 'Red',
    familyName: 'Hemenway',
    personalizationMode: '',
    edgeText: '',
    year: '2026',
    orderedEntries: [
      { position: 1, kind: 'person', name: 'Kyle', icon: '', customIconDescription: '' },
      { position: 2, kind: 'pet', name: 'Scout', icon: 'Paw', customIconDescription: '' }
    ],
    peopleCount: 1,
    petCount: 1,
    hasCustomIcon: false,
    configurationSnapshot: {
      size: 'Large',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Hemenway',
      year: '2026',
      entries: [
        { position: 1, kind: 'person', name: 'Kyle' },
        { position: 2, kind: 'pet', name: 'Scout', icon: 'Paw', customIconDescription: '' }
      ]
    },
    ...overrides
  };
}

function createOrderState(items, overrides = {}) {
  return {
    items,
    customerDraft: createCustomerDraft(overrides.customerDraft || {}),
    appState: createAppState(overrides.appState || {}),
    ...overrides
  };
}

function createService(options = {}) {
  const storage = createStorage();
  const orderStore = options.orderStore || orderStoreModule.createInMemoryOrderStore();
  const nowValues = options.nowValues ? [...options.nowValues] : ['2026-07-15T12:00:00.000Z', '2026-07-15T12:00:01.000Z'];
  const contextManager = submissionModule.createSubmissionContextManager({
    storage,
    now: () => new Date(nowValues.length > 1 ? nowValues.shift() : nowValues[0]),
    randomUUID: options.randomUUID || (() => 'submission-uuid-1')
  });

  const service = submissionModule.createOrderSubmissionService({
    orderStore,
    contextManager,
    buildForgeOrderPayload,
    now: () => new Date(nowValues.length > 1 ? nowValues.shift() : nowValues[0]),
    onRecordSaved: options.onRecordSaved
  });

  return {
    service,
    orderStore,
    storage,
    contextManager
  };
}

function createCompletionReceiptManager(storage = createStorage()) {
  return {
    storage,
    manager: submissionModule.createCompletionReceiptManager({ storage })
  };
}

test('successful submission saves one immutable local record with a normalized payload and pending sync metadata', async () => {
  const { service, orderStore } = createService();
  const orderState = createOrderState([createItem()]);

  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState
  });

  const savedRecord = await orderStore.getOrder('submission-uuid-1');

  assert.equal(result.ok, true);
  assert.equal(result.duplicatePrevented, false);
  assert.equal(savedRecord.status, 'submitted');
  assert.equal(savedRecord.sync_status, 'pending');
  assert.equal(savedRecord.sync_attempt_count, 0);
  assert.equal(savedRecord.payload.forge_order_uuid, 'submission-uuid-1');
  assert.equal(savedRecord.payload.order_status, 'submitted');
  assert.equal(savedRecord.payload.fulfillment.shipping_address.address_1, '123 Main Street');
  assert.deepEqual(savedRecord.payload.items[0].personalization_order.map((entry) => entry.name), ['Kyle', 'Scout']);
});

test('successful local save triggers a background sync request with the saved record uuid', async () => {
  let syncedUuid = '';
  let syncCallCount = 0;
  const { service } = createService({
    onRecordSaved(record) {
      syncCallCount += 1;
      syncedUuid = record && record.forge_order_uuid;
    }
  });

  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([createItem()])
  });

  await Promise.resolve();

  assert.equal(result.ok, true);
  assert.equal(syncCallCount, 1);
  assert.equal(syncedUuid, 'submission-uuid-1');
});

test('submission success is not blocked by a pending background sync request and upload failures do not affect the local save result', async () => {
  let releaseSync;
  let syncCallCount = 0;
  const syncStarted = new Promise((resolve) => {
    releaseSync = resolve;
  });
  const { service, orderStore } = createService({
    onRecordSaved() {
      syncCallCount += 1;
      return syncStarted.then(() => {
        throw new Error('network failure');
      });
    }
  });

  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([createItem()])
  });
  const savedRecord = await orderStore.getOrder('submission-uuid-1');

  assert.equal(result.ok, true);
  assert.equal(syncCallCount, 1);
  assert.equal(savedRecord.forge_order_uuid, 'submission-uuid-1');

  releaseSync();
  await Promise.resolve();
  await Promise.resolve();
});

test('repeated sequential and concurrent submissions reuse the same uuid and do not overwrite the original record', async () => {
  const { service, orderStore } = createService();
  const firstState = createOrderState([createItem()]);
  const changedState = createOrderState([createItem({
    familyName: 'Changed Family',
    configurationSnapshot: {
      size: 'Large',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Changed Family',
      year: '2026'
    }
  })]);

  const [first, concurrentA, concurrentB] = await Promise.all([
    service.submitOrder({ activeOrderSessionId: 'order-session-123', orderState: firstState }),
    service.submitOrder({ activeOrderSessionId: 'order-session-123', orderState: firstState }),
    service.submitOrder({ activeOrderSessionId: 'order-session-123', orderState: firstState })
  ]);
  const second = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: changedState
  });
  const savedRecord = await orderStore.getOrder('submission-uuid-1');

  assert.equal(first.ok, true);
  assert.equal(concurrentA.record.forge_order_uuid, 'submission-uuid-1');
  assert.equal(concurrentB.record.forge_order_uuid, 'submission-uuid-1');
  assert.equal(second.duplicatePrevented, true);
  assert.equal(savedRecord.submitted_at, first.record.submitted_at);
  assert.equal(savedRecord.payload.items[0].structured_attributes.family_name, 'Hemenway');
});

test('new customer orders receive a new uuid and preserve pickup, reindeer discount, custom icon flags, and item order', async () => {
  const storage = createStorage();
  const orderStore = orderStoreModule.createInMemoryOrderStore();
  const contextManager = submissionModule.createSubmissionContextManager({
    storage,
    now: () => new Date('2026-07-15T12:00:00.000Z'),
    randomUUID: (() => {
      const ids = ['submission-uuid-1', 'submission-uuid-2'];
      return () => ids.shift();
    })()
  });
  const service = submissionModule.createOrderSubmissionService({
    orderStore,
    contextManager,
    buildForgeOrderPayload,
    now: (() => {
      const values = ['2026-07-15T12:00:01.000Z', '2026-07-15T12:00:02.000Z', '2026-07-15T12:05:01.000Z', '2026-07-15T12:05:02.000Z'];
      return () => new Date(values.length > 1 ? values.shift() : values[0]);
    })()
  });

  const pickupResult = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([
      createItem({
        itemId: 'reindeer-a',
        productDefinitionId: 'reindeer',
        displayName: 'Reindeer Ornament',
        imagePath: '/assets/products/reindeer-initial-ornament.jpeg',
        quantity: 1,
        unitPrice: 13,
        size: '',
        treeColor: '',
        bowColor: '',
        familyName: 'A',
        year: '2026',
        orderedEntries: [],
        peopleCount: 0,
        petCount: 0,
        configurationSnapshot: { letter: 'A', familyName: 'A' }
      }),
      createItem({
        itemId: 'reindeer-b',
        productDefinitionId: 'little_reindeer_letter',
        displayName: 'Reindeer Ornament',
        imagePath: '/assets/products/reindeer-initial-ornament.jpeg',
        quantity: 1,
        unitPrice: 13,
        size: '',
        treeColor: '',
        bowColor: '',
        familyName: 'B',
        year: '2026',
        orderedEntries: [],
        peopleCount: 0,
        petCount: 0,
        configurationSnapshot: { letter: 'B', familyName: 'B' }
      }),
      createItem({
        itemId: 'custom-icon',
        orderedEntries: [
          { position: 1, kind: 'pet', name: 'Scout', icon: 'Custom Icon', customIconDescription: 'Tiny baseball' }
        ],
        hasCustomIcon: true,
        configurationSnapshot: {
          size: 'Large',
          treeColor: 'Green',
          bowColor: 'Red',
          familyName: 'Hemenway',
          year: '2026',
          entries: [
            { position: 1, kind: 'pet', name: 'Scout', icon: 'Custom Icon', customIconDescription: 'Tiny baseball' }
          ]
        }
      })
    ], {
      customerDraft: {
        fulfillmentMethod: 'Local Pickup',
        addressLine1: '123 Main Street',
        city: 'Denver'
      }
    })
  });

  contextManager.clearContext('order-session-123');

  const shippingResult = await service.submitOrder({
    activeOrderSessionId: 'order-session-456',
    orderState: createOrderState([createItem({
      itemId: 'tree-b',
      familyName: 'Second Order',
      configurationSnapshot: {
        size: 'Large',
        treeColor: 'Green',
        bowColor: 'Red',
        familyName: 'Second Order',
        year: '2026'
      }
    })], {
      appState: {
        activeOrderSessionId: 'order-session-456'
      },
      customerDraft: {
        orderSessionId: 'order-session-456',
        fullName: 'Meagan Smith'
      }
    })
  });

  assert.equal(pickupResult.record.payload.fulfillment.shipping_address, null);
  assert.equal(pickupResult.record.payload.items[0].pricing.final_unit_price_cents, 1300);
  assert.equal(pickupResult.record.payload.items[1].pricing.final_unit_price_cents, 1300);
  assert.equal(pickupResult.record.payload.items[2].open_flags[0].code, 'custom_icon');
  assert.deepEqual(pickupResult.record.payload.items.map((item) => item.line_id), ['reindeer-a', 'reindeer-b', 'custom-icon']);
  assert.equal(shippingResult.record.forge_order_uuid, 'submission-uuid-2');
});

test('save failure returns an error result without mutating customer state, clearing the cart, or performing network requests', async () => {
  const originalState = createOrderState([createItem()]);
  const frozenSnapshot = JSON.stringify(originalState);
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  const failingStore = {
    async getOrder() {
      return null;
    },
    async saveNewOrder() {
      throw new Error('indexeddb failed');
    }
  };

  try {
    const { service } = createService({ orderStore: failingStore });
    const result = await service.submitOrder({
      activeOrderSessionId: 'order-session-123',
      orderState: originalState
    });

    assert.equal(result.ok, false);
    assert.match(result.error.message, /indexeddb failed/i);
    assert.equal(JSON.stringify(originalState), frozenSnapshot);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('successful save can create a minimal confirmation receipt state without duplicating the full payload', async () => {
  const { service, storage } = createService();
  const receiptManager = submissionModule.createCompletionReceiptManager({ storage });
  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([createItem()])
  });

  const receipt = receiptManager.saveReceipt(submissionModule.buildCompletionReceipt({
    record: result.record
  }));
  const storedReceipt = JSON.parse(storage.getItem(submissionModule.COMPLETION_RECEIPT_STORAGE_KEY));

  assert.deepEqual(receipt, {
    forgeOrderUuid: 'submission-uuid-1',
    shortOrderReference: 'SUBMISSI',
    customerName: 'Kyle Hemenway',
    submittedAt: result.record.submitted_at
  });
  assert.deepEqual(storedReceipt, receipt);
  assert.equal('payload' in storedReceipt, false);
});

test('successful save receipt can drive thank-you restoration and debug saved-order access while standard mode keeps the same receipt data', async () => {
  const { service, storage } = createService();
  const receiptManager = submissionModule.createCompletionReceiptManager({ storage });
  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([createItem()])
  });

  receiptManager.saveReceipt({ record: result.record });
  const restoredReceipt = receiptManager.getReceipt();

  assert.equal(restoredReceipt.forgeOrderUuid, 'submission-uuid-1');
  assert.equal(submissionModule.resolveRestoredScreen({
    currentScreen: 'thank-you',
    hasUsableActiveOrder: false,
    hasCompletedReceipt: Boolean(restoredReceipt)
  }), 'thank-you');
  assert.equal(submissionModule.resolveRestoredScreen({
    currentScreen: 'thank-you',
    hasUsableActiveOrder: false,
    hasCompletedReceipt: false
  }), 'welcome');
});

test('start new order can clear only the temporary completion receipt while leaving the saved IndexedDB-backed order available', async () => {
  const { service, orderStore } = createService();
  const { storage, manager } = createCompletionReceiptManager();
  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([createItem()])
  });

  manager.saveReceipt({ record: result.record });
  manager.clearReceipt();

  const storedOrder = await orderStore.getOrder('submission-uuid-1');
  assert.equal(manager.getReceipt(), null);
  assert.equal(storedOrder.forge_order_uuid, 'submission-uuid-1');
});

test('stale final review restores thank-you when a completed receipt exists and welcome when it does not', () => {
  assert.equal(submissionModule.resolveRestoredScreen({
    currentScreen: 'final-review',
    hasUsableActiveOrder: false,
    hasCompletedReceipt: true
  }), 'thank-you');
  assert.equal(submissionModule.resolveRestoredScreen({
    currentScreen: 'final-review',
    hasUsableActiveOrder: false,
    hasCompletedReceipt: false
  }), 'welcome');
});

test('unfinished active drafts still restore their final review screen normally', () => {
  assert.equal(submissionModule.resolveRestoredScreen({
    currentScreen: 'final-review',
    hasUsableActiveOrder: true,
    hasCompletedReceipt: false
  }), 'final-review');
});

test('failed save does not create a completion receipt', async () => {
  const storage = createStorage();
  const receiptManager = submissionModule.createCompletionReceiptManager({ storage });
  const failingStore = {
    async getOrder() {
      return null;
    },
    async saveNewOrder() {
      throw new Error('indexeddb failed');
    }
  };
  const { service } = createService({ orderStore: failingStore });

  const result = await service.submitOrder({
    activeOrderSessionId: 'order-session-123',
    orderState: createOrderState([createItem()])
  });

  assert.equal(result.ok, false);
  assert.equal(receiptManager.getReceipt(), null);
});
