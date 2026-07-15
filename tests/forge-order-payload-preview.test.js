const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const previewHelpers = require('../public/js/forge-order-payload-preview.js');
const { buildForgeOrderPayload } = require('../public/js/forge-order-payload-builder.js');

const appSource = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

function createEntry(position, kind, name, extra = {}) {
  return {
    position,
    kind,
    name,
    ...extra
  };
}

function createItem(overrides = {}) {
  return {
    itemId: 'item-1',
    productDefinitionId: 'tree_ornament',
    displayName: 'Tree Ornament',
    category: 'ornament',
    quantity: 1,
    unitPrice: 30,
    size: 'Large',
    treeColor: 'Green',
    bowColor: 'Red',
    familyName: 'Hemenway',
    year: '2026',
    orderedEntries: [],
    configurationSnapshot: {
      size: 'Large',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Hemenway',
      year: '2026'
    },
    ...overrides
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

test('debug mode is false without forgeDebug=payload and true only with the exact query parameter', () => {
  assert.equal(previewHelpers.isPayloadPreviewEnabled(''), false);
  assert.equal(previewHelpers.isPayloadPreviewEnabled('?foo=bar'), false);
  assert.equal(previewHelpers.isPayloadPreviewEnabled('?forgeDebug=other'), false);
  assert.equal(previewHelpers.isPayloadPreviewEnabled('?forgeDebug=payload'), true);
  assert.equal(previewHelpers.isPayloadPreviewEnabled('?foo=bar&forgeDebug=payload'), true);
});

test('preview context identity and builtAt remain stable across repeated calls and first preferred identity wins', () => {
  const contextStore = previewHelpers.createPayloadPreviewContextStore({
    now: () => new Date('2026-07-15T12:00:00.000Z'),
    randomUUID: () => 'generated-preview-uuid'
  });

  const first = contextStore.getContext({ preferredForgeOrderUuid: 'order-session-123' });
  const second = contextStore.getContext({ preferredForgeOrderUuid: 'different-session' });

  assert.equal(first.forgeOrderUuid, 'order-session-123');
  assert.equal(second.forgeOrderUuid, 'order-session-123');
  assert.equal(first.builtAt, '2026-07-15T12:00:00.000Z');
  assert.equal(second.builtAt, '2026-07-15T12:00:00.000Z');
});

test('preview identity generation occurs outside the payload builder', () => {
  const contextStore = previewHelpers.createPayloadPreviewContextStore({
    now: () => new Date('2026-07-15T12:00:00.000Z'),
    randomUUID: () => 'preview-uuid-generated-outside-builder'
  });
  const orderState = previewHelpers.snapshotCurrentOrderState({
    items: [createItem()],
    customerDraft: createCustomerDraft(),
    appState: createAppState()
  });
  const context = contextStore.getContext();
  const payload = buildForgeOrderPayload(orderState, context);

  assert.equal(context.forgeOrderUuid, 'preview-uuid-generated-outside-builder');
  assert.equal(payload.forge_order_uuid, 'preview-uuid-generated-outside-builder');
});

test('current-order adapter passes the real app-style state shape to the builder without mutation or network access', () => {
  const items = [createItem()];
  const customerDraft = createCustomerDraft();
  const appState = createAppState();
  const snapshot = JSON.stringify({ items, customerDraft, appState });
  let capturedOrderState = null;
  let capturedContext = null;
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  };

  try {
    const preview = previewHelpers.buildCurrentOrderPayloadPreview({
      items,
      customerDraft,
      appState,
      previewContextStore: previewHelpers.createPayloadPreviewContextStore({
        now: () => new Date('2026-07-15T12:00:00.000Z'),
        randomUUID: () => 'preview-adapter-uuid'
      }),
      buildForgeOrderPayload(orderState, context) {
        capturedOrderState = orderState;
        capturedContext = context;
        return {
          payload_type: 'forge_order',
          forge_order_uuid: context.forgeOrderUuid,
          items: orderState.items
        };
      }
    });

    assert.deepEqual(capturedOrderState.items, items);
    assert.deepEqual(capturedOrderState.customerDraft, customerDraft);
    assert.deepEqual(capturedOrderState.appState, appState);
    assert.notEqual(capturedOrderState.items, items);
    assert.equal(capturedContext.forgeOrderUuid, 'preview-adapter-uuid');
    assert.equal(preview.payload.forge_order_uuid, 'preview-adapter-uuid');
    assert.equal(fetchCalled, false);
    assert.equal(JSON.stringify({ items, customerDraft, appState }), snapshot);
  } finally {
    global.fetch = originalFetch;
  }
});

test('shipping and pickup payloads preserve fulfillment behavior, mixed personalization order, and line order', () => {
  const contextStore = previewHelpers.createPayloadPreviewContextStore({
    now: () => new Date('2026-07-15T12:00:00.000Z'),
    randomUUID: () => 'preview-order-1'
  });
  const items = [
    createItem({
      itemId: 'tree-line',
      orderedEntries: [
        createEntry(1, 'person', 'Kyle'),
        createEntry(2, 'pet', 'Scout', { icon: 'Paw', customIconDescription: '' }),
        createEntry(3, 'person', 'Meagan')
      ]
    }),
    createItem({
      itemId: 'antler-line',
      productDefinitionId: 'antler_ornament',
      displayName: 'Antler Ornament',
      size: 'Small',
      treeColor: '',
      bowColor: '',
      familyName: 'Smith',
      unitPrice: 26,
      configurationSnapshot: { size: 'Small', familyName: 'Smith', year: '2026' }
    })
  ];

  const shippingPreview = previewHelpers.buildCurrentOrderPayloadPreview({
    items,
    customerDraft: createCustomerDraft(),
    appState: createAppState(),
    previewContextStore: contextStore,
    buildForgeOrderPayload
  });
  const pickupPreview = previewHelpers.buildCurrentOrderPayloadPreview({
    items,
    customerDraft: createCustomerDraft({
      fulfillmentMethod: 'Local Pickup',
      addressLine1: '123 Main Street',
      city: 'Denver'
    }),
    appState: createAppState(),
    previewContextStore: contextStore,
    buildForgeOrderPayload
  });

  assert.equal(shippingPreview.payload.fulfillment.shipping_address.address_1, '123 Main Street');
  assert.equal(pickupPreview.payload.fulfillment.shipping_address, null);
  assert.deepEqual(shippingPreview.payload.items.map((item) => item.line_id), ['tree-line', 'antler-line']);
  assert.deepEqual(
    shippingPreview.payload.items[0].personalization_order.map((entry) => `${entry.position}:${entry.type}:${entry.name}`),
    ['1:person:Kyle', '2:pet:Scout', '3:person:Meagan']
  );
});

test('reindeer discount, quote-required pricing, and custom icon flags appear correctly in preview payloads', () => {
  const preview = previewHelpers.buildCurrentOrderPayloadPreview({
    items: [
      createItem({
        itemId: 'reindeer-a',
        productDefinitionId: 'reindeer',
        displayName: 'Reindeer Ornament',
        size: '',
        treeColor: '',
        bowColor: '',
        familyName: 'A',
        year: '2026',
        quantity: 1,
        unitPrice: 13,
        configurationSnapshot: { letter: 'A', familyName: 'A' }
      }),
      createItem({
        itemId: 'reindeer-b',
        productDefinitionId: 'little_reindeer_letter',
        displayName: 'Reindeer Ornament',
        size: '',
        treeColor: '',
        bowColor: '',
        familyName: 'B',
        year: '2026',
        quantity: 1,
        unitPrice: 13,
        configurationSnapshot: { letter: 'B', familyName: 'B' }
      }),
      createItem({
        itemId: 'custom-icon',
        orderedEntries: [
          createEntry(1, 'pet', 'Scout', { icon: 'Custom Icon', customIconDescription: 'Tiny baseball' })
        ]
      }),
      createItem({
        itemId: 'custom-request',
        productDefinitionId: 'custom_request',
        displayName: 'Custom Request',
        category: 'custom',
        unitPrice: 0,
        size: '',
        treeColor: '',
        bowColor: '',
        familyName: '',
        year: '',
        orderedEntries: [],
        configurationSnapshot: {
          description: 'Build a custom farmhouse sign'
        }
      })
    ],
    customerDraft: createCustomerDraft(),
    appState: createAppState(),
    previewContextStore: previewHelpers.createPayloadPreviewContextStore({
      now: () => new Date('2026-07-15T12:00:00.000Z'),
      randomUUID: () => 'preview-order-2'
    }),
    buildForgeOrderPayload
  });

  assert.equal(preview.payload.items[0].pricing.final_unit_price_cents, 1300);
  assert.equal(preview.payload.items[1].pricing.final_unit_price_cents, 1300);
  assert.equal(preview.payload.items[2].open_flags[0].code, 'custom_icon');
  assert.equal(preview.payload.items[3].pricing.final_unit_price_cents, null);
});

test('repeated previews with unchanged state are deeply equal and changed state updates payload while keeping preview identity stable', () => {
  const contextStore = previewHelpers.createPayloadPreviewContextStore({
    now: () => new Date('2026-07-15T12:00:00.000Z'),
    randomUUID: () => 'preview-order-3'
  });
  const firstState = {
    items: [createItem()],
    customerDraft: createCustomerDraft(),
    appState: createAppState()
  };

  const first = previewHelpers.buildCurrentOrderPayloadPreview({
    ...firstState,
    previewContextStore: contextStore,
    buildForgeOrderPayload
  });
  const second = previewHelpers.buildCurrentOrderPayloadPreview({
    ...firstState,
    previewContextStore: contextStore,
    buildForgeOrderPayload
  });
  const changed = previewHelpers.buildCurrentOrderPayloadPreview({
    items: [createItem()],
    customerDraft: createCustomerDraft({ fullName: 'Meagan Smith' }),
    appState: createAppState(),
    previewContextStore: contextStore,
    buildForgeOrderPayload
  });

  assert.deepEqual(first.payload, second.payload);
  assert.equal(first.context.forgeOrderUuid, second.context.forgeOrderUuid);
  assert.equal(changed.context.forgeOrderUuid, first.context.forgeOrderUuid);
  assert.equal(changed.payload.customer.full_name, 'Meagan Smith');
});

test('clipboard failure handling is safe and normal mode does not request preview UI creation', async () => {
  const clipboard = {
    async writeText() {
      throw new Error('clipboard denied');
    }
  };

  const result = await previewHelpers.copyPayloadPreviewText('{"ok":true}', { clipboard });

  assert.equal(result.copied, false);
  assert.match(result.message, /copy failed/i);
  assert.equal(previewHelpers.shouldCreatePayloadPreviewUi(false), false);
  assert.equal(previewHelpers.shouldCreatePayloadPreviewUi(true), true);
  assert.match(appSource, /shouldCreatePayloadPreviewUi\(payloadPreviewState\.enabled\)/);
});
