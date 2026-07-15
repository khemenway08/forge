const test = require('node:test');
const assert = require('node:assert/strict');

const queueHelpers = require('../public/js/forge-local-orders-queue.js');

function createRecord(overrides = {}) {
  const source = {
    record_type: 'forge_local_order',
    record_version: '1.0',
    forge_order_uuid: 'order-tree-1',
    status: 'submitted',
    sync_status: 'pending',
    submitted_at: '2026-07-16T10:00:00.000Z',
    local_saved_at: '2026-07-16T10:00:01.000Z',
    sync_attempt_count: 0,
    last_sync_attempt_at: null,
    last_sync_error: null,
    event_id: null,
    device_id: null,
    has_open_flags: false,
    payload: {
      forge_order_uuid: 'order-tree-1',
      customer: {
        full_name: 'Kyle Hemenway',
        email: 'kmhemenway22@gmail.com',
        phone: '(303) 507-1567',
        preferred_contact: 'Text'
      },
      fulfillment: {
        method: 'shipping',
        needed_by: '2026-12-01',
        shipping_address: {
          address_1: '123 Main Street',
          address_2: '',
          city: 'Denver',
          state: 'CO',
          postal_code: '80202',
          country: 'United States'
        }
      },
      pricing: {
        estimated_total_cents: 5600
      },
      open_flags: [],
      has_open_flags: false,
      items: [
        {
          line_id: 'tree-line',
          quantity: 2,
          product_definition_id: 'tree_ornament',
          product_display_name: 'Tree Ornament',
          pricing: {
            final_unit_price_cents: 2600,
            line_total_cents: 5200,
            requires_quote: false
          },
          configuration_snapshot: {
            size: 'Small',
            treeColor: 'Green',
            bowColor: 'Red',
            familyName: 'Hemenway',
            year: '2026'
          },
          personalization_order: [
            { position: 1, type: 'person', name: 'Kyle' },
            { position: 2, type: 'pet', name: 'Scout', icon: 'paw', custom_icon_description: null }
          ],
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            family_name: 'Hemenway',
            year: 2026,
            pet_count: 1,
            people_count: 1,
            production_status: 'not_started',
            fulfillment_method: 'shipping',
            has_open_flags: false
          },
          open_flags: [],
          customer_note: 'Front side'
        }
      ]
    }
  };

  return {
    ...source,
    ...overrides,
    payload: {
      ...source.payload,
      ...(overrides.payload || {})
    }
  };
}

function createRecords() {
  return [
    createRecord(),
    createRecord({
      forge_order_uuid: 'order-antler-2',
      sync_status: 'synced',
      submitted_at: '2026-07-15T09:00:00.000Z',
      local_saved_at: '2026-07-15T09:00:01.000Z',
      payload: {
        forge_order_uuid: 'order-antler-2',
        customer: {
          full_name: 'Meagan Smith',
          email: 'meagan@example.com',
          phone: '(214) 555-1010',
          preferred_contact: 'Email'
        },
        fulfillment: {
          method: 'pickup',
          needed_by: null,
          shipping_address: null
        },
        pricing: {
          estimated_total_cents: 3000
        },
        items: [
          {
            line_id: 'antler-line',
            quantity: 1,
            product_definition_id: 'antler_ornament',
            product_display_name: 'Antler Ornament',
            pricing: {
              final_unit_price_cents: 3000,
              line_total_cents: 3000,
              requires_quote: false
            },
            configuration_snapshot: {
              size: 'Large',
              familyName: 'Smith',
              year: '2027'
            },
            personalization_order: [
              { position: 1, type: 'person', name: 'Meagan' }
            ],
            structured_attributes: {
              product_definition_id: 'antler_ornament',
              category: 'ornament',
              size: 'Large',
              tree_color: null,
              bow_color: null,
              family_name: 'Smith',
              year: 2027,
              pet_count: 0,
              people_count: 1,
              production_status: 'not_started',
              fulfillment_method: 'pickup',
              has_open_flags: false
            },
            open_flags: [],
            customer_note: null
          }
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'order-reindeer-3',
      sync_status: 'pending',
      submitted_at: '2026-07-14T08:00:00.000Z',
      local_saved_at: '2026-07-14T08:00:01.000Z',
      has_open_flags: true,
      payload: {
        forge_order_uuid: 'order-reindeer-3',
        customer: {
          full_name: 'Scout Family',
          email: 'family@example.com',
          phone: '(555) 867-5309',
          preferred_contact: 'Text'
        },
        fulfillment: {
          method: 'shipping',
          needed_by: '2026-12-15',
          shipping_address: {
            address_1: '200 Oak Avenue',
            address_2: '',
            city: 'Austin',
            state: 'TX',
            postal_code: '78701',
            country: 'United States'
          }
        },
        pricing: {
          estimated_total_cents: 5600
        },
        open_flags: [
          {
            code: 'custom_icon',
            scope: 'order',
            line_id: null,
            message: 'Custom icon requested: Tiny baseball'
          }
        ],
        has_open_flags: true,
        items: [
          {
            line_id: 'reindeer-line',
            quantity: 1,
            product_definition_id: 'little_reindeer_letter',
            product_display_name: 'Little Reindeer Letter Ornament',
            pricing: {
              final_unit_price_cents: 1300,
              line_total_cents: 1300,
              requires_quote: false
            },
            configuration_snapshot: {
              letter: 'A',
              familyName: 'Anderson'
            },
            personalization_order: [],
            structured_attributes: {
              product_definition_id: 'little_reindeer_letter',
              category: 'ornament',
              size: null,
              tree_color: null,
              bow_color: null,
              family_name: 'Anderson',
              year: null,
              pet_count: 0,
              people_count: 0,
              production_status: 'not_started',
              fulfillment_method: 'shipping',
              has_open_flags: false
            },
            open_flags: [],
            customer_note: null
          },
          {
            line_id: 'present-line',
            quantity: 1,
            product_definition_id: 'present_stack',
            product_display_name: 'Present Stack Ornament',
            pricing: {
              final_unit_price_cents: 3000,
              line_total_cents: 3000,
              requires_quote: false
            },
            configuration_snapshot: {
              bowColor: 'White',
              familyName: 'Anderson',
              year: '2026'
            },
            personalization_order: [
              {
                position: 1,
                type: 'pet',
                name: 'Scout',
                icon: 'custom_icon',
                custom_icon_description: 'Tiny baseball'
              }
            ],
            structured_attributes: {
              product_definition_id: 'present_stack',
              category: 'ornament',
              size: null,
              tree_color: null,
              bow_color: 'White',
              family_name: 'Anderson',
              year: 2026,
              pet_count: 1,
              people_count: 0,
              production_status: 'not_started',
              fulfillment_method: 'shipping',
              has_open_flags: true
            },
            open_flags: [
              {
                code: 'custom_icon',
                scope: 'item',
                line_id: 'present-line',
                message: 'Custom icon requested: Tiny baseball'
              }
            ],
            customer_note: null
          },
          {
            line_id: 'tree-brown-line',
            quantity: 1,
            product_definition_id: 'tree_ornament',
            product_display_name: 'Tree Ornament',
            pricing: {
              final_unit_price_cents: 3000,
              line_total_cents: 3000,
              requires_quote: false
            },
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Brown',
              bowColor: 'Red',
              familyName: 'Anderson',
              year: '2026'
            },
            personalization_order: [
              { position: 1, type: 'person', name: 'Scout' }
            ],
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              size: 'Small',
              tree_color: 'Brown',
              bow_color: 'Red',
              family_name: 'Anderson',
              year: 2026,
              pet_count: 0,
              people_count: 1,
              production_status: 'not_started',
              fulfillment_method: 'shipping',
              has_open_flags: false
            },
            open_flags: [],
            customer_note: null
          }
        ]
      }
    })
  ];
}

test('orders sort newest first and short reference is deterministic', () => {
  const records = createRecords();
  const sorted = queueHelpers.sortLocalOrdersNewestFirst(records);

  assert.deepEqual(sorted.map((record) => record.forge_order_uuid), ['order-tree-1', 'order-antler-2', 'order-reindeer-3']);
  assert.equal(queueHelpers.getShortOrderReference(records[0]), 'ORDERTRE');
});

test('search matches customer name, email, phone, uuid/reference, product name, and family name', () => {
  const records = createRecords();

  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'kyle hemenway').map((record) => record.forge_order_uuid), ['order-tree-1']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'meagan@example.com').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, '867-5309').map((record) => record.forge_order_uuid), ['order-reindeer-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'ORDERTRE').map((record) => record.forge_order_uuid), ['order-tree-1']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'Present Stack Ornament').map((record) => record.forge_order_uuid), ['order-reindeer-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'smith').map((record) => record.forge_order_uuid), ['order-antler-2']);
});

test('product, size, tree-color, bow-color, year, fulfillment, open-flags, and sync-status filters work', () => {
  const records = createRecords();

  assert.deepEqual(queueHelpers.filterLocalOrders(records, { product: 'tree_ornament' }, '').map((record) => record.forge_order_uuid), ['order-tree-1', 'order-reindeer-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { size: 'large' }, '').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { treeColor: 'green' }, '').map((record) => record.forge_order_uuid), ['order-tree-1']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { bowColor: 'white' }, '').map((record) => record.forge_order_uuid), ['order-reindeer-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { year: '2027' }, '').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { fulfillment: 'pickup' }, '').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { openFlags: 'with_flags' }, '').map((record) => record.forge_order_uuid), ['order-reindeer-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { syncStatus: 'synced' }, '').map((record) => record.forge_order_uuid), ['order-antler-2']);
});

test('multiple filters combine using AND and clear filters return all records', () => {
  const records = createRecords();
  const filtered = queueHelpers.filterLocalOrders(records, {
    product: 'tree_ornament',
    size: 'small',
    treeColor: 'green',
    bowColor: 'red',
    year: '2026',
    fulfillment: 'shipping',
    openFlags: 'without_flags',
    syncStatus: 'pending'
  }, 'kyle');

  assert.deepEqual(filtered.map((record) => record.forge_order_uuid), ['order-tree-1']);
  assert.deepEqual(
    queueHelpers.filterLocalOrders(records, queueHelpers.createEmptyOrderFilters(), '').map((record) => record.forge_order_uuid),
    ['order-tree-1', 'order-antler-2', 'order-reindeer-3']
  );
});

test('available filter values are generated from records and null or empty values are excluded', () => {
  const records = createRecords();
  const options = queueHelpers.getAvailableOrderFilters(records);

  assert.deepEqual(options.product.map((option) => option.value), ['antler_ornament', 'little_reindeer_letter', 'present_stack', 'tree_ornament']);
  assert.deepEqual(options.size.map((option) => option.value), ['Small', 'Large']);
  assert.deepEqual(options.treeColor.map((option) => option.value), ['Brown', 'Green']);
  assert.deepEqual(options.bowColor.map((option) => option.value), ['Red', 'White']);
  assert.deepEqual(options.year.map((option) => option.value), ['2026', '2027']);
  assert.deepEqual(options.fulfillment.map((option) => option.value), ['pickup', 'shipping']);
  assert.deepEqual(options.syncStatus.map((option) => option.value), ['pending', 'synced']);
});

test('queue summary totals are correct and total item count respects quantity', () => {
  const records = createRecords();
  const summary = queueHelpers.summarizeLocalOrders(records);

  assert.deepEqual(summary, {
    totalOrders: 3,
    pendingFutureSync: 2,
    ordersWithOpenFlags: 1,
    totalItems: 6
  });
});

test('batch groups combine identical production configurations and keep different colors or sizes separate', () => {
  const records = createRecords();
  const batches = queueHelpers.buildProductionBatchGroups(records);

  assert.deepEqual(
    batches.groups.map((group) => `${group.quantity} x ${group.label}`),
    [
      '1 x Antler Ornament / Large',
      '1 x Little Reindeer Letter Ornament',
      '1 x Present Stack Ornament / White Bow',
      '1 x Tree Ornament / Small / Brown / Red Bow',
      '2 x Tree Ornament / Small / Green / Red Bow'
    ]
  );
  assert.equal(batches.customIconRequiredCount, 1);
});

test('filtered records produce filtered batch counts and reindeer groups correctly', () => {
  const records = createRecords();
  const filteredTreeRecords = queueHelpers.filterLocalOrders(records, { product: 'tree_ornament' }, '');
  const treeBatches = queueHelpers.buildProductionBatchGroups(filteredTreeRecords, { product: 'tree_ornament' });
  const reindeerBatches = queueHelpers.buildProductionBatchGroups(
    queueHelpers.filterLocalOrders(records, { product: 'little_reindeer_letter' }, ''),
    { product: 'little_reindeer_letter' }
  );

  assert.deepEqual(
    treeBatches.groups.map((group) => `${group.quantity}:${group.label}`),
    ['1:Tree Ornament / Small / Brown / Red Bow', '2:Tree Ornament / Small / Green / Red Bow']
  );
  assert.deepEqual(reindeerBatches.groups.map((group) => group.label), ['Little Reindeer Letter Ornament']);
});

test('helper operations do not mutate original records', () => {
  const records = createRecords();
  const snapshot = JSON.stringify(records);

  queueHelpers.createOrderSearchDocument(records[0]);
  queueHelpers.getAvailableOrderFilters(records, {
    activeFilters: { product: 'tree_ornament' },
    searchTerm: 'kyle'
  });
  queueHelpers.filterLocalOrders(records, { product: 'tree_ornament' }, 'kyle');
  queueHelpers.summarizeLocalOrders(records, { product: 'tree_ornament' });
  queueHelpers.buildProductionBatchGroups(records, { product: 'tree_ornament' });

  assert.equal(JSON.stringify(records), snapshot);
});

test('standard mode does not request staff UI creation and only forgeDebug=orders enables it', () => {
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled(''), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug=payload'), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug=other'), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug=orders'), true);
  assert.equal(queueHelpers.shouldCreateStaffOrdersUi(false), false);
  assert.equal(queueHelpers.shouldCreateStaffOrdersUi(true), true);
});
