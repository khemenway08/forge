const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');

const productCatalog = require('../public/js/forge-product-catalog.js');
const { buildForgeOrderPayload } = require('../public/js/forge-order-payload-builder.js');

const appSource = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const builderSource = fs.readFileSync(path.join(__dirname, '../public/js/forge-order-payload-builder.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const BUILD_VERSION = '20260730-47';

function createContext(overrides = {}) {
  return {
    forgeOrderUuid: 'forge-order-123',
    builtAt: '2026-07-15T12:00:00.000Z',
    source: 'customer_kiosk',
    deviceId: 'ipad-1',
    event: {
      event_id: 'event-9',
      event_name: 'Holiday Market',
      event_type: 'live_event',
      event_start_date: '2026-11-10',
      event_end_date: '2026-11-12',
      event_location: 'Denver'
    },
    orderStatus: 'draft',
    ...overrides
  };
}

function createCustomerDraft(overrides = {}) {
  return {
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

function createOrderState(items, overrides = {}) {
  return {
    customerDraft: createCustomerDraft(overrides.customerDraft || {}),
    appState: {
      activeOrderSessionId: 'session-1',
      ...overrides.appState
    },
    items,
    ...overrides
  };
}

function createItem(overrides = {}) {
  return {
    itemId: 'item-1',
    productDefinitionId: 'tree_ornament',
    displayName: 'Tree Ornament',
    category: 'ornament',
    quantity: 1,
    unitPrice: 26,
    size: 'Small',
    treeColor: 'Green',
    bowColor: 'Red',
    familyName: 'Hemenway',
    year: '2026',
    orderedEntries: [],
    configurationSnapshot: {
      size: 'Small',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Hemenway',
      year: '2026'
    },
    ...overrides
  };
}

test('shared runtime source is authoritative for app and builder pricing', () => {
  const reindeerDefinition = productCatalog.getProductDefinition('little_reindeer_letter');
  const treeDefinition = productCatalog.getProductDefinition('tree_ornament');
  const antlerDefinition = productCatalog.getProductDefinition('antler_ornament');

  assert.equal(reindeerDefinition.regularUnitPriceCents, 1500);
  assert.equal(reindeerDefinition.discountedUnitPriceCents, 1300);
  assert.equal(treeDefinition.sizePricesCents.Small, 2600);
  assert.equal(treeDefinition.sizePricesCents.Large, 3000);
  assert.equal(antlerDefinition.sizePricesCents.Small, 2600);
  assert.equal(antlerDefinition.sizePricesCents.Large, 3000);

  assert.doesNotMatch(builderSource, /\bconst PRODUCT_CATALOG\b/);
  assert.match(builderSource, /forge-product-catalog/);
  assert.match(appSource, /forgeProductCatalog/);
  assert.match(appSource, /applyCatalogPricingToItems/);
  assert.match(
    indexSource,
    new RegExp(`<script src="js/forge-product-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-order-payload-builder\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-order-payload-preview\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-api-client\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-order-store\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-order-server-sync\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-sync-status\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-order-submission\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-event-state\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-api-client\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-catalog-ordering\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-catalog-image-viewer\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-design-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-design-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-hat-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-hat-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-material-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-material-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-finished-hat-catalog-api\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-finished-hat-catalog\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-staff-orders-runtime\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/forge-local-orders-queue\\.js\\?v=${BUILD_VERSION}"></script>\\s*<script src="js/app\\.js\\?v=${BUILD_VERSION}"></script>`)
  );
});

test('customer category screen is limited to the working ornament hero for the pilot', () => {
  assert.match(indexSource, /welcome-ornaments-hero\.png/);
  assert.match(indexSource, /Christmas Ornaments/);
  assert.match(indexSource, /Personalized ornaments for families, babies, memorials, veterans, pets, and more\./);
  assert.match(indexSource, /Browse Ornament Designs/);
  assert.doesNotMatch(indexSource, /Ornament Pilot/);
  assert.doesNotMatch(indexSource, /<h3>Custom Ornament<\/h3>/);
  assert.doesNotMatch(indexSource, /<h3>Custom Sign<\/h3>/);
  assert.doesNotMatch(indexSource, /<h3>Custom Request<\/h3>/);
  assert.doesNotMatch(indexSource, /welcome-category-signs\.png/);
  assert.doesNotMatch(indexSource, /welcome-category-custom\.png/);
});

test('ornament-selection screen markup remains unchanged from commit 43b5ef4', () => {
  const committedIndexSource = childProcess.execSync('git show 43b5ef4:public/index.html', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });

  const sectionPattern = /<section class="screen" data-screen="ornaments">[\s\S]*?<\/section>/;
  const currentSection = indexSource.match(sectionPattern)?.[0] || '';
  const committedSection = committedIndexSource.match(sectionPattern)?.[0] || '';

  assert.ok(currentSection);
  assert.ok(committedSection);
  const normalizePinterestOptOut = (markup) => markup
    .replace(/\s+nopin="nopin"/g, '')
    .replace(/\s+data-pin-nopin="true"/g, '');

  assert.equal(normalizePinterestOptOut(currentSection), normalizePinterestOptOut(committedSection));
});

test('submitted payloads preserve approved external payment metadata and reject unsupported values', () => {
  const payload = buildForgeOrderPayload(
    createOrderState([createItem()]),
    createContext({
      orderStatus: 'submitted',
      submittedAt: '2026-07-21T18:50:00.000Z',
      externalPaymentMethod: 'card_square',
      paymentConfirmedAt: '2026-07-21T18:49:30.000Z'
    })
  );

  assert.equal(payload.external_payment_method, 'card_square');
  assert.equal(payload.payment_confirmed_at, '2026-07-21T18:49:30.000Z');

  assert.throws(
    () => buildForgeOrderPayload(
      createOrderState([createItem()]),
      createContext({
        orderStatus: 'submitted',
        submittedAt: '2026-07-21T18:50:00.000Z',
        externalPaymentMethod: 'bitcoin',
        paymentConfirmedAt: '2026-07-21T18:49:30.000Z'
      })
    ),
    /supported externalPaymentMethod/i
  );
});

test('active event snapshots preserve immutable event metadata on the order payload', () => {
  const payload = buildForgeOrderPayload(createOrderState([createItem()]), createContext());

  assert.equal(payload.event.event_id, 'event-9');
  assert.equal(payload.event.event_name, 'Holiday Market');
  assert.equal(payload.event.event_type, 'live_event');
  assert.equal(payload.event.event_start_date, '2026-11-10');
  assert.equal(payload.event.event_end_date, '2026-11-12');
  assert.equal(payload.event.event_location, 'Denver');
});

test('customer order payloads exclude private internal notes even if local item state contains one', () => {
  const payload = buildForgeOrderPayload(
    createOrderState([
      createItem({
        internal_note: 'Paid cash at show.'
      })
    ], {
      customerDraft: {
        internal_note: 'Call before shipping.'
      }
    }),
    createContext({
      internal_note: 'Needs artwork approval.'
    })
  );

  assert.doesNotMatch(JSON.stringify(payload), /internal_note/);
  assert.doesNotMatch(JSON.stringify(payload), /Paid cash at show\./);
  assert.doesNotMatch(JSON.stringify(payload), /Call before shipping\./);
  assert.doesNotMatch(JSON.stringify(payload), /Needs artwork approval\./);
});

test('normalizes a Tree Ornament shipping order with size-based pricing and exact mixed personalization order', () => {
  const item = createItem({
    orderedEntries: [
      { position: 1, kind: 'person', name: 'Kyle' },
      { position: 2, kind: 'pet', name: 'Scout', petType: 'dog', icon: 'Paw', customIconDescription: '' },
      { position: 3, kind: 'person', name: 'Meagan' }
    ],
    configurationSnapshot: {
      size: 'Large',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Hemenway',
      year: '2026'
    },
    size: 'Large',
    unitPrice: 30
  });

  const payload = buildForgeOrderPayload(createOrderState([item]), createContext());
  const line = payload.items[0];

  assert.equal(payload.payload_type, 'forge_order');
  assert.equal(payload.customer.full_name, 'Kyle Hemenway');
  assert.equal(payload.customer.first_name, 'Kyle');
  assert.equal(payload.customer.last_name, 'Hemenway');
  assert.equal(payload.fulfillment.method, 'shipping');
  assert.equal(line.product_definition_id, 'tree_ornament');
  assert.equal(line.pricing.mode, 'size_based');
  assert.equal(line.pricing.regular_unit_price_cents, 3000);
  assert.equal(line.pricing.final_unit_price_cents, 3000);
  assert.equal(line.structured_attributes.size, 'Large');
  assert.equal(line.structured_attributes.tree_color, 'Green');
  assert.equal(line.structured_attributes.bow_color, 'Red');
  assert.equal(line.personalization_order[0].name, 'Kyle');
  assert.equal(line.personalization_order[1].type, 'pet');
  assert.equal(line.personalization_order[1].pet_type, 'dog');
  assert.equal(line.personalization_order[1].icon, 'paw');
  assert.equal(line.personalization_order[2].position, 3);
});

test('creates custom_icon flag and preserves custom icon description', () => {
  const item = createItem({
    orderedEntries: [
      { position: 1, kind: 'pet', name: 'Scout', petType: 'dog', icon: 'Custom Icon', customIconDescription: 'Tiny baseball' }
    ],
    configurationSnapshot: {
      size: 'Small',
      treeColor: 'Brown',
      bowColor: 'White',
      familyName: 'Hemenway',
      year: '2026'
    }
  });

  const payload = buildForgeOrderPayload(createOrderState([item]), createContext());
  const line = payload.items[0];

  assert.equal(line.open_flags.length, 1);
  assert.equal(line.open_flags[0].code, 'custom_icon');
  assert.match(line.open_flags[0].message, /Tiny baseball/);
  assert.equal(line.personalization_order[0].custom_icon_description, 'Tiny baseball');
  assert.equal(payload.has_open_flags, true);
  assert.equal(payload.open_flags.length, 1);
});

test('dog bone survives payload building without creating a custom icon flag and paw remains backward-compatible', () => {
  const item = createItem({
    orderedEntries: [
      { position: 1, kind: 'pet', name: 'Scout', petType: 'dog', icon: 'Dog Bone', customIconDescription: '' },
      { position: 2, kind: 'pet', name: 'Milo', petType: 'dog', icon: 'Paw', customIconDescription: '' }
    ],
    configurationSnapshot: {
      size: 'Small',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Hemenway',
      year: '2026'
    }
  });

  const payload = buildForgeOrderPayload(createOrderState([item]), createContext());
  const line = payload.items[0];

  assert.equal(line.personalization_order[0].icon, 'dog_bone');
  assert.equal(line.personalization_order[0].custom_icon_description, null);
  assert.equal(line.personalization_order[1].icon, 'paw');
  assert.deepEqual(line.open_flags, []);
  assert.deepEqual(payload.open_flags, []);
  assert.equal(payload.has_open_flags, false);
});

test('normalizes antler, present stack, grinch tree, veteran flag, baby, and mr and mrs ornaments with shared fields', () => {
  const items = [
    createItem({
      itemId: 'antler-1',
      productDefinitionId: 'antler_ornament',
      displayName: 'Antler Ornament',
      size: 'Small',
      treeColor: '',
      bowColor: '',
      familyName: 'Smith',
      year: '2026',
      unitPrice: 26,
      configurationSnapshot: { size: 'Small', familyName: 'Smith', year: '2026' }
    }),
    createItem({
      itemId: 'present-1',
      productDefinitionId: 'present_stack',
      displayName: 'Present Stack Ornament',
      size: '',
      treeColor: '',
      bowColor: 'White',
      familyName: 'Smith',
      year: '2026',
      unitPrice: 30,
      orderedEntries: [
        { position: 1, kind: 'person', name: 'Kyle' },
        { position: 2, kind: 'pet', name: 'Scout', icon: 'Fish', customIconDescription: '' }
      ],
      configurationSnapshot: { bowColor: 'White', familyName: 'Smith', year: '2026' }
    }),
    createItem({
      itemId: 'grinch-1',
      productDefinitionId: 'grinch_tree',
      displayName: 'Grinch Tree Ornament',
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'Grinch',
      year: '2026',
      unitPrice: 30,
      orderedEntries: [{ position: 1, kind: 'person', name: 'Cindy Lou' }],
      configurationSnapshot: { familyName: 'Grinch', year: '2026' }
    }),
    createItem({
      itemId: 'veteran-1',
      productDefinitionId: 'veteran_flag',
      displayName: 'Veteran Flag Ornament',
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: '',
      year: '',
      unitPrice: 25,
      orderedEntries: [],
      personalizationMode: 'Change Edge Text',
      edgeText: 'Army Veteran',
      configurationSnapshot: { personalizationMode: 'Change Edge Text', edgeText: 'Army Veteran' }
    }),
    createItem({
      itemId: 'baby-1',
      productDefinitionId: 'babys_first_christmas',
      displayName: "Baby's First Christmas",
      size: '',
      treeColor: '',
      bowColor: 'Pink',
      familyName: 'Mila',
      year: '2026',
      unitPrice: 28,
      configurationSnapshot: { bow_and_stocking_color: 'Pink', familyName: 'Mila', year: '2026' }
    }),
    createItem({
      itemId: 'mrs-1',
      productDefinitionId: 'mr_and_mrs_first_christmas',
      displayName: 'Mr. & Mrs. Ornament',
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: "O'Brien",
      year: '2024',
      unitPrice: 28,
      configurationSnapshot: { last_name: "O'Brien", wedding_year: '2024' }
    })
  ];

  const payload = buildForgeOrderPayload(createOrderState(items), createContext());

  const antler = payload.items[0];
  const present = payload.items[1];
  const grinch = payload.items[2];
  const veteran = payload.items[3];
  const baby = payload.items[4];
  const mrAndMrs = payload.items[5];

  assert.equal(antler.product_definition_id, 'antler_ornament');
  assert.equal(antler.pricing.final_unit_price_cents, 2600);
  assert.equal(present.structured_attributes.bow_color, 'White');
  assert.equal(present.structured_attributes.people_count, 1);
  assert.equal(present.structured_attributes.pet_count, 1);
  assert.equal(grinch.structured_attributes.ornament_type, 'grinch_tree');
  assert.equal(veteran.configuration_snapshot.edgeText, 'Army Veteran');
  assert.equal(baby.structured_attributes.bow_color, 'Pink');
  assert.equal(mrAndMrs.product_definition_id, 'mr_and_mrs_christmas');
  assert.equal(mrAndMrs.structured_attributes.family_name, "O'Brien");
  assert.equal(mrAndMrs.structured_attributes.year, 2024);
});

test('preserves line order across multiple items', () => {
  const items = [
    createItem({ itemId: 'line-a', displayName: 'First Ornament' }),
    createItem({ itemId: 'line-b', displayName: 'Second Ornament' }),
    createItem({ itemId: 'line-c', displayName: 'Third Ornament' })
  ];

  const payload = buildForgeOrderPayload(createOrderState(items), createContext());

  assert.deepEqual(payload.items.map((item) => item.line_id), ['line-a', 'line-b', 'line-c']);
  assert.deepEqual(payload.items.map((item) => item.line_number), [1, 2, 3]);
});

test('applies little reindeer regular and discounted pricing from the shared source using total quantity', () => {
  const oneLineOneQuantity = buildForgeOrderPayload(createOrderState([
    createItem({
      itemId: 'rein-a',
      productDefinitionId: 'reindeer',
      displayName: 'Reindeer Ornament',
      quantity: 1,
      unitPrice: 15,
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'Solo',
      year: '2026',
      configurationSnapshot: { name: 'Solo', year: '2026' }
    })
  ]), createContext());

  assert.equal(oneLineOneQuantity.items[0].product_definition_id, 'little_reindeer_letter');
  assert.equal(oneLineOneQuantity.items[0].pricing.regular_unit_price_cents, productCatalog.getRegularUnitPriceCents('little_reindeer_letter'));
  assert.equal(oneLineOneQuantity.items[0].pricing.final_unit_price_cents, productCatalog.getRegularUnitPriceCents('little_reindeer_letter'));
  assert.equal(oneLineOneQuantity.items[0].pricing.discount_total_cents, 0);

  const oneLineTwoQuantity = buildForgeOrderPayload(createOrderState([
    createItem({
      itemId: 'rein-b',
      productDefinitionId: 'reindeer',
      displayName: 'Reindeer Ornament',
      quantity: 2,
      unitPrice: 13,
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'Pair',
      year: '2026',
      configurationSnapshot: { name: 'Pair', year: '2026' }
    })
  ]), createContext());

  assert.equal(oneLineTwoQuantity.items[0].pricing.regular_unit_price_cents, 1500);
  assert.equal(oneLineTwoQuantity.items[0].pricing.final_unit_price_cents, 1300);
  assert.equal(oneLineTwoQuantity.items[0].pricing.line_subtotal_cents, 3000);
  assert.equal(oneLineTwoQuantity.items[0].pricing.discount_total_cents, 400);
  assert.equal(oneLineTwoQuantity.items[0].pricing.line_total_cents, 2600);
  assert.equal(oneLineTwoQuantity.pricing.discount_total_cents, 400);
  assert.equal(oneLineTwoQuantity.pricing.estimated_total_cents, 2600);

  const twoLinesOneEach = buildForgeOrderPayload(createOrderState([
    createItem({
      itemId: 'rein-c1',
      productDefinitionId: 'reindeer',
      displayName: 'Reindeer Ornament',
      quantity: 1,
      unitPrice: 13,
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'A',
      year: '2026',
      configurationSnapshot: { name: 'A', year: '2026' }
    }),
    createItem({
      itemId: 'rein-c2',
      productDefinitionId: 'reindeer',
      displayName: 'Reindeer Ornament',
      quantity: 1,
      unitPrice: 13,
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'B',
      year: '2026',
      configurationSnapshot: { name: 'B', year: '2026' }
    })
  ]), createContext());

  twoLinesOneEach.items.forEach((line) => {
    assert.equal(line.pricing.final_unit_price_cents, 1300);
    assert.equal(line.pricing.discount_total_cents, 200);
  });
  assert.equal(twoLinesOneEach.pricing.discount_total_cents, 400);

  const mixedQuantities = buildForgeOrderPayload(createOrderState([
    createItem({
      itemId: 'rein-d1',
      productDefinitionId: 'reindeer',
      displayName: 'Reindeer Ornament',
      quantity: 2,
      unitPrice: 13,
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'Two',
      year: '2026',
      configurationSnapshot: { name: 'Two', year: '2026' }
    }),
    createItem({
      itemId: 'rein-d2',
      productDefinitionId: 'reindeer',
      displayName: 'Reindeer Ornament',
      quantity: 1,
      unitPrice: 13,
      size: '',
      treeColor: '',
      bowColor: '',
      familyName: 'Three',
      year: '2026',
      configurationSnapshot: { name: 'Three', year: '2026' }
    })
  ]), createContext());

  assert.equal(mixedQuantities.items[0].pricing.line_total_cents, 2600);
  assert.equal(mixedQuantities.items[0].pricing.discount_total_cents, 400);
  assert.equal(mixedQuantities.items[1].pricing.line_total_cents, 1300);
  assert.equal(mixedQuantities.pricing.discount_total_cents, 600);
  assert.equal(mixedQuantities.pricing.estimated_total_cents, 3900);
});

test('normalizes classic family sign, family cutting board, live edge sign, and custom request with explicit field coverage', () => {
  const items = [
    createItem({
      itemId: 'sign-1',
      productDefinitionId: 'classic_family_sign',
      displayName: 'Classic Family Sign',
      category: 'sign',
      unitPrice: 84.99,
      configurationSnapshot: { family_name: 'Hemenway', established_year: '2020' }
    }),
    createItem({
      itemId: 'board-1',
      productDefinitionId: 'family_cutting_board',
      displayName: 'Family Cutting Board',
      category: 'sign',
      unitPrice: 39.99,
      configurationSnapshot: {
        last_name_initial: 'H',
        his_name: 'Kyle',
        her_name: 'Meagan',
        established_year: '2021'
      }
    }),
    createItem({
      itemId: 'live-1',
      productDefinitionId: 'live_edge_family_sign',
      displayName: 'Live Edge Family Sign',
      category: 'sign',
      unitPrice: 54.99,
      configurationSnapshot: {
        family_name: 'Hemenway',
        established_year: '2018',
        icon: 'Other',
        other_icon_description: 'Cabin'
      }
    }),
    createItem({
      itemId: 'custom-1',
      productDefinitionId: 'custom_request',
      displayName: 'Custom Request',
      category: 'custom',
      unitPrice: 0,
      configurationSnapshot: {
        description: 'Build a custom farmhouse sign',
        reference_upload: 'mock-file.png',
        needed_by: '2026-10-01'
      }
    })
  ];

  const payload = buildForgeOrderPayload(createOrderState(items), createContext());
  const liveEdge = payload.items[2];
  const custom = payload.items[3];

  assert.equal(payload.items[0].pricing.final_unit_price_cents, 8499);
  assert.equal(payload.items[1].structured_attributes.year, 2021);
  assert.equal(liveEdge.structured_attributes.icon, 'Other');
  assert.equal(liveEdge.configuration_snapshot.other_icon_description, 'Cabin');
  assert.equal(custom.pricing.requires_quote, true);
  assert.equal(custom.pricing.final_unit_price_cents, null);
  assert.equal(custom.pricing.line_total_cents, null);
  assert.equal(payload.pricing.contains_quote_required_item, true);
  assert.equal(payload.pricing.total_is_estimated, true);
  assert.deepEqual(
    custom.open_flags.map((flag) => flag.code).sort(),
    ['custom_artwork', 'quote_required']
  );
});

test('pickup strips stale shipping address while shipping preserves submitted address', () => {
  const item = createItem();

  const pickupPayload = buildForgeOrderPayload(
    createOrderState([item], {
      customerDraft: {
        fulfillmentMethod: 'Local Pickup',
        addressLine1: '123 Main Street',
        city: 'Denver'
      }
    }),
    createContext()
  );

  const shippingPayload = buildForgeOrderPayload(createOrderState([item]), createContext());

  assert.equal(pickupPayload.fulfillment.method, 'pickup');
  assert.equal(pickupPayload.fulfillment.shipping_address, null);
  assert.equal(shippingPayload.fulfillment.method, 'shipping');
  assert.equal(shippingPayload.fulfillment.shipping_address.address_1, '123 Main Street');
});

test('sanitizes configuration snapshots without mutating original customer configuration', () => {
  const domLike = { nodeType: 1, nodeName: 'DIV', textContent: 'ignore' };
  const eventTargetLike = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {}
  };
  const blobLike = {
    size: 10,
    type: 'image/png',
    slice() {},
    stream() {},
    arrayBuffer() {}
  };
  const fileLike = {
    name: 'preview.png',
    lastModified: 123,
    size: 10,
    type: 'image/png',
    slice() {}
  };
  const configurationSnapshot = {
    familyName: 'Hemenway',
    validUrl: 'https://example.com/reference',
    blobOnly: 'blob:https://example.com/temp',
    previewUrl: 'blob:https://example.com/preview',
    nested: {
      keep: 'Forever',
      object_url: 'blob:https://example.com/object',
      customIconDescription: 'Tiny hat',
      customerNote: 'https://example.com/not-a-preview'
    },
    helper: () => 'nope',
    dom: domLike,
    eventTarget: eventTargetLike,
    blobLike,
    fileLike,
    finiteNumber: 42,
    infiniteNumber: Number.POSITIVE_INFINITY,
    custom_art_notes: 'Please keep the baseball stitching'
  };
  if (typeof Blob !== 'undefined') {
    configurationSnapshot.runtimeBlob = new Blob(['demo'], { type: 'text/plain' });
  }
  if (typeof File !== 'undefined') {
    configurationSnapshot.runtimeFile = new File(['demo'], 'demo.txt', { type: 'text/plain' });
  }

  const item = createItem({
    productDefinitionId: 'custom_request',
    displayName: 'Custom Request',
    category: 'custom',
    configurationSnapshot
  });
  const originalSnapshot = JSON.stringify(configurationSnapshot, (key, value) => (typeof value === 'function' ? '[function]' : value));

  const payload = buildForgeOrderPayload(createOrderState([item]), createContext());
  const sanitized = payload.items[0].configuration_snapshot;

  assert.equal(JSON.stringify(configurationSnapshot, (key, value) => (typeof value === 'function' ? '[function]' : value)), originalSnapshot);
  assert.equal(sanitized.familyName, 'Hemenway');
  assert.equal(sanitized.validUrl, 'https://example.com/reference');
  assert.equal(sanitized.finiteNumber, 42);
  assert.equal(sanitized.custom_art_notes, 'Please keep the baseball stitching');
  assert.equal(sanitized.blobOnly, undefined);
  assert.equal(sanitized.previewUrl, undefined);
  assert.equal(sanitized.helper, undefined);
  assert.equal(sanitized.dom, undefined);
  assert.equal(sanitized.eventTarget, undefined);
  assert.equal(sanitized.blobLike, undefined);
  assert.equal(sanitized.fileLike, undefined);
  assert.equal(sanitized.runtimeBlob, undefined);
  assert.equal(sanitized.runtimeFile, undefined);
  assert.equal(sanitized.infiniteNumber, undefined);
  assert.deepEqual(sanitized.nested, {
    keep: 'Forever',
    customIconDescription: 'Tiny hat',
    customerNote: 'https://example.com/not-a-preview'
  });
});

test('splits full names conservatively and uses deterministic fallback line ids', () => {
  const item = createItem({ itemId: '', lineId: '', displayName: 'Tree Ornament' });
  const payload = buildForgeOrderPayload(
    createOrderState([item], {
      customerDraft: {
        fullName: 'Madonna'
      }
    }),
    createContext({ forgeOrderUuid: 'forge-abc' })
  );

  assert.equal(payload.customer.first_name, 'Madonna');
  assert.equal(payload.customer.last_name, '');
  assert.equal(payload.items[0].line_id, 'forge-abc-line-1');
});

test('does not mutate input order state or shared product definitions and repeated builds are deeply equal', () => {
  const orderState = createOrderState([createItem()]);
  const context = createContext();
  const orderStateSnapshot = JSON.stringify(orderState);
  const catalogSnapshot = JSON.stringify(productCatalog.PRODUCT_DEFINITIONS);

  const first = buildForgeOrderPayload(orderState, context);
  const second = buildForgeOrderPayload(orderState, context);

  assert.equal(JSON.stringify(orderState), orderStateSnapshot);
  assert.equal(JSON.stringify(productCatalog.PRODUCT_DEFINITIONS), catalogSnapshot);
  assert.deepEqual(first, second);
});

test('throws clear errors for missing forgeOrderUuid, invalid builtAt, and unknown product definition id', () => {
  assert.throws(
    () => buildForgeOrderPayload(createOrderState([createItem()]), createContext({ forgeOrderUuid: '' })),
    /forgeOrderUuid/
  );

  assert.throws(
    () => buildForgeOrderPayload(createOrderState([createItem()]), createContext({ builtAt: 'not-a-date' })),
    /invalid builtAt/
  );

  assert.throws(
    () => buildForgeOrderPayload(createOrderState([createItem({ productDefinitionId: 'unknown_product' })]), createContext()),
    /Unknown product-definition ID/
  );
});

test('monetary values normalize to integer cents and top-level flags are deduplicated without dropping distinct line flags', () => {
  const items = [
    createItem({
      itemId: 'custom-icon-1',
      orderedEntries: [{ position: 1, kind: 'pet', name: 'Scout', icon: 'Custom Icon', customIconDescription: 'Hat' }]
    }),
    createItem({
      itemId: 'custom-icon-2',
      orderedEntries: [{ position: 1, kind: 'pet', name: 'Whiskers', icon: 'Custom Icon', customIconDescription: 'Scarf' }]
    })
  ];

  const payload = buildForgeOrderPayload(createOrderState(items), createContext());

  assert.equal(Number.isInteger(payload.pricing.priced_item_subtotal_cents), true);
  assert.equal(Number.isInteger(payload.items[0].pricing.final_unit_price_cents), true);
  assert.equal(payload.items[0].open_flags.length, 1);
  assert.equal(payload.items[1].open_flags.length, 1);
  assert.equal(payload.open_flags.length, 2);
  assert.deepEqual(payload.open_flags.map((flag) => flag.code), ['custom_icon', 'custom_icon']);
});
