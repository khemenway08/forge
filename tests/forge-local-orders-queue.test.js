const test = require('node:test');
const assert = require('node:assert/strict');

const queueHelpers = require('../public/js/forge-local-orders-queue.js');

function createItem(overrides = {}) {
  const source = {
    line_id: 'tree-line',
    quantity: 1,
    completed_quantity: 0,
    production_status: 'pending',
    product_definition_id: 'tree_ornament',
    product_display_name: 'Tree Ornament',
    configuration_snapshot: {
      size: 'Small',
      treeColor: 'Green',
      bowColor: 'Red',
      familyName: 'Hemenway',
      year: '2026'
    },
    structured_attributes: {
      product_definition_id: 'tree_ornament',
      category: 'ornament',
      ornament_type: 'tree_ornament',
      size: 'Small',
      tree_color: 'Green',
      bow_color: 'Red',
      family_name: 'Hemenway',
      year: 2026,
      production_status: 'pending',
      fulfillment_method: 'shipping',
      event_id: 'event-alpha',
      has_open_flags: false
    },
    open_flags: [],
    personalization_order: [
      { position: 1, type: 'person', name: 'Kyle' }
    ]
  };

  return {
    ...source,
    ...overrides,
    configuration_snapshot: {
      ...source.configuration_snapshot,
      ...(overrides.configuration_snapshot || {})
    },
    structured_attributes: {
      ...source.structured_attributes,
      ...(overrides.structured_attributes || {})
    },
    open_flags: Array.isArray(overrides.open_flags) ? overrides.open_flags : source.open_flags,
    personalization_order: Array.isArray(overrides.personalization_order)
      ? overrides.personalization_order
      : source.personalization_order
  };
}

function createRecord(overrides = {}) {
  const source = {
    record_type: 'forge_local_order',
    record_version: '1.0',
    forge_order_uuid: 'order-tree-1',
    status: 'submitted',
    sync_status: 'pending',
    production_status: 'tray_assigned',
    current_tray_number: 2,
    total_item_count: 1,
    completed_item_count: 0,
    ready_to_pack_at: null,
    packed_at: null,
    submitted_at: '2026-07-16T10:00:00.000Z',
    local_saved_at: '2026-07-16T10:00:01.000Z',
    sync_attempt_count: 0,
    last_sync_attempt_at: null,
    last_sync_error: null,
    event_id: 'EVENT-ALPHA',
    device_id: null,
    has_open_flags: false,
    payload: {
      forge_order_uuid: 'order-tree-1',
      event_id: 'EVENT-ALPHA',
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
        estimated_total_cents: 2600
      },
      open_flags: [],
      has_open_flags: false,
      items: [createItem()]
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

function createReadyRecord(overrides = {}) {
  return createRecord({
    forge_order_uuid: 'order-ready-1',
    production_status: 'ready_to_pack',
    current_tray_number: 1,
    total_item_count: 3,
    completed_item_count: 3,
    ready_to_pack_at: '2026-07-16T12:16:00.000Z',
    payload: {
      forge_order_uuid: 'order-ready-1',
      items: [
        createItem({
          line_id: 'tree-line',
          quantity: 1,
          completed_quantity: 1,
          production_status: 'complete',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            production_status: 'complete',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'reindeer-line',
          quantity: 2,
          completed_quantity: 2,
          production_status: 'complete',
          product_definition_id: 'little_reindeer_letter',
          product_display_name: 'Little Reindeer Letter Ornament',
          configuration_snapshot: {
            letter: 'A',
            name: 'Avery'
          },
          structured_attributes: {
            product_definition_id: 'little_reindeer_letter',
            category: 'ornament',
            ornament_type: 'little_reindeer_letter',
            size: null,
            tree_color: null,
            bow_color: null,
            family_name: null,
            year: null,
            production_status: 'complete',
            has_open_flags: false
          }
        })
      ]
    },
    ...overrides,
    payload: {
      ...createRecord().payload,
      ...{
        forge_order_uuid: 'order-ready-1',
        event_id: 'EVENT-ALPHA',
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
          createItem({
            line_id: 'tree-line',
            quantity: 1,
            completed_quantity: 1,
            production_status: 'complete',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              production_status: 'complete',
              has_open_flags: false
            }
          }),
          createItem({
            line_id: 'reindeer-line',
            quantity: 2,
            completed_quantity: 2,
            production_status: 'complete',
            product_definition_id: 'little_reindeer_letter',
            product_display_name: 'Little Reindeer Letter Ornament',
            configuration_snapshot: {
              letter: 'A',
              name: 'Avery'
            },
            structured_attributes: {
              product_definition_id: 'little_reindeer_letter',
              category: 'ornament',
              ornament_type: 'little_reindeer_letter',
              size: null,
              tree_color: null,
              bow_color: null,
              family_name: null,
              year: null,
              production_status: 'complete',
              has_open_flags: false
            }
          })
        ]
      },
      ...(overrides.payload || {})
    }
  });
}

function createRecords() {
  return [
    createRecord(),
    createRecord({
      forge_order_uuid: 'order-antler-2',
      sync_status: 'synced',
      submitted_at: '2026-07-15T09:00:00.000Z',
      local_saved_at: '2026-07-15T09:00:01.000Z',
      production_status: 'in_production',
      current_tray_number: 10,
      event_id: 'EVENT-BETA',
      payload: {
        forge_order_uuid: 'order-antler-2',
        event_id: 'EVENT-BETA',
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
          createItem({
            line_id: 'antler-line',
            quantity: 1,
            completed_quantity: 1,
            production_status: 'in_production',
            product_definition_id: 'antler_ornament',
            product_display_name: 'Antler Family Ornament',
            configuration_snapshot: {
              size: 'Large',
              familyName: 'Smith',
              year: 2027
            },
            structured_attributes: {
              product_definition_id: 'antler_ornament',
              category: 'ornament',
              ornament_type: 'antler_ornament',
              size: 'Large',
              tree_color: null,
              bow_color: null,
              family_name: 'Smith',
              year: '2027',
              production_status: 'in_production',
              fulfillment_method: 'pickup',
              event_id: 'EVENT-BETA',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'order-mixed-3',
      sync_status: 'error',
      submitted_at: '2026-07-14T08:00:00.000Z',
      local_saved_at: '2026-07-14T08:00:01.000Z',
      production_status: 'tray_assigned',
      current_tray_number: null,
      has_open_flags: true,
      event_id: 'event-gamma',
      payload: {
        forge_order_uuid: 'order-mixed-3',
        event_id: 'event-gamma',
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
            code: 'waiting_on_material',
            scope: 'order',
            line_id: null,
            message: 'Waiting on material'
          }
        ],
        has_open_flags: true,
        items: [
          createItem({
            line_id: 'reindeer-line',
            quantity: 1,
            product_definition_id: 'little_reindeer_letter',
            product_display_name: 'Little Reindeer Letter Ornament',
            configuration_snapshot: {
              letter: 'A',
              name: 'Abby'
            },
            structured_attributes: {
              product_definition_id: 'little_reindeer_letter',
              category: 'ornament',
              ornament_type: null,
              size: null,
              tree_color: null,
              bow_color: null,
              family_name: null,
              year: null,
              production_status: 'not_started',
              fulfillment_method: 'shipping',
              event_id: 'event-gamma',
              has_open_flags: false
            }
          }),
          createItem({
            line_id: 'present-line',
            quantity: 1,
            product_definition_id: 'present_stack',
            product_display_name: 'Present Stack Ornament',
            configuration_snapshot: {
              bowColor: 'White',
              familyName: 'Anderson',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'present_stack',
              category: 'ornament',
              ornament_type: 'present_stack',
              size: null,
              tree_color: null,
              bow_color: 'White',
              family_name: 'Anderson',
              year: 2026,
              production_status: 'pending',
              fulfillment_method: 'shipping',
              event_id: 'event-gamma',
              has_open_flags: true
            },
            open_flags: [
              {
                code: 'custom_icon',
                scope: 'item',
                line_id: 'present-line',
                message: 'Custom icon requested: Tiny baseball'
              }
            ]
          }),
          createItem({
            line_id: 'tree-brown-line',
            quantity: 1,
            product_definition_id: 'tree_ornament',
            product_display_name: 'Tree Ornament',
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Brown',
              bowColor: 'White',
              familyName: 'Anderson',
              year: 2026
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Brown',
              bow_color: 'White',
              family_name: 'Anderson',
              year: '2026',
              production_status: 'blocked',
              fulfillment_method: 'shipping',
              event_id: 'event-gamma',
              has_open_flags: false
            }
          })
        ]
      }
    })
  ];
}

test('orders sort newest first and short reference is deterministic', () => {
  const records = createRecords();
  const sorted = queueHelpers.sortLocalOrdersNewestFirst(records);

  assert.deepEqual(sorted.map((record) => record.forge_order_uuid), ['order-tree-1', 'order-antler-2', 'order-mixed-3']);
  assert.equal(queueHelpers.getShortOrderReference(records[0]), 'ORDERTRE');
});

test('staff local-orders debug gate remains customer-safe and handles malformed search input', () => {
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled(''), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug=orders'), true);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug=payload'), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug=other'), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?forgeDebug='), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled('?foo=bar'), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled(null), false);
  assert.equal(queueHelpers.isLocalOrdersQueueEnabled(undefined), false);
  assert.equal(queueHelpers.shouldCreateStaffOrdersUi(false), false);
  assert.equal(queueHelpers.shouldCreateStaffOrdersUi(true), true);
});

test('search matches customer, product, tray, year, ornament type, event identifier, and production status labels', () => {
  const records = createRecords();

  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'kyle hemenway').map((record) => record.forge_order_uuid), ['order-tree-1']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'Antler Family Ornament').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'tray 10').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, '2027').map((record) => record.forge_order_uuid), ['order-antler-2']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'little reindeer letter ornament').map((record) => record.forge_order_uuid), ['order-mixed-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'event-gamma').map((record) => record.forge_order_uuid), ['order-mixed-3']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, {}, 'in production').map((record) => record.forge_order_uuid), ['order-antler-2']);
});

test('filter normalization keeps numeric and string years unified, legacy not_started becomes pending, and product labels prefer submitted display names', () => {
  const records = createRecords();
  const options = queueHelpers.getAvailableOrderFilters(records);
  const legacyItem = createRecords()[2].payload.items[0];
  const legacyAttributes = queueHelpers.normalizeProductionItemAttributes(createRecords()[2], legacyItem, 0);

  assert.deepEqual(options.year.map((option) => option.value), ['2026', '2027']);
  assert.equal(legacyAttributes.productionStatus, 'pending');
  assert.equal(options.product.find((option) => option.value === 'antler_ornament').label, 'Antler Family Ornament');
});

test('missing ornament type and optional structured attributes receive safe backward-compatible fallbacks without throwing', () => {
  const record = createRecord({
    forge_order_uuid: 'legacy-order',
    payload: {
      items: [
        createItem({
          line_id: 'legacy-line',
          product_definition_id: 'little_reindeer_letter',
          product_display_name: 'Little Reindeer Letter Ornament',
          configuration_snapshot: {
            letter: 'B',
            name: 'Beau',
            bowColor: null,
            treeColor: null,
            year: null
          },
          structured_attributes: {
            product_definition_id: 'little_reindeer_letter',
            category: 'ornament',
            ornament_type: null,
            size: null,
            tree_color: null,
            bow_color: null,
            family_name: null,
            year: null,
            production_status: 'not_started',
            has_open_flags: false
          }
        })
      ]
    }
  });

  const attributes = queueHelpers.normalizeProductionItemAttributes(record, record.payload.items[0], 0);

  assert.equal(attributes.ornamentType, 'little_reindeer_letter');
  assert.equal(attributes.ornamentTypeLabel, 'Little Reindeer Letter Ornament');
  assert.equal(attributes.bowColor, '');
  assert.equal(attributes.treeColor, '');
  assert.equal(attributes.conciseIdentifier, 'B • Beau');
});

test('tray values normalize and sort numerically and no-tray-assigned remains a stable filter value', () => {
  const records = [
    createRecord({ forge_order_uuid: 'tray-2', current_tray_number: 2, payload: { items: [createItem()] } }),
    createRecord({ forge_order_uuid: 'tray-10', current_tray_number: 10, payload: { items: [createItem()] } }),
    createRecord({ forge_order_uuid: 'tray-none', current_tray_number: null, payload: { items: [createItem()] } })
  ];
  const options = queueHelpers.getAvailableOrderFilters(records);

  assert.deepEqual(options.tray.map((option) => option.value), ['2', '10', 'unassigned']);
  assert.deepEqual(queueHelpers.filterLocalOrders(records, { tray: 'unassigned' }, '').map((record) => record.forge_order_uuid), ['tray-none']);
});

test('same-item matching requires one item to satisfy all item-level filters', () => {
  const record = createRecord({
    forge_order_uuid: 'same-item-order',
    current_tray_number: 4,
    payload: {
      items: [
        createItem({
          line_id: 'item-a',
          configuration_snapshot: {
            size: 'Small',
            treeColor: 'Green',
            bowColor: 'Red',
            familyName: 'Hemenway',
            year: '2026'
          },
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'pending',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'item-b',
          product_definition_id: 'tree_ornament',
          product_display_name: 'Tree Ornament',
          configuration_snapshot: {
            size: 'Large',
            treeColor: 'Brown',
            bowColor: 'White',
            familyName: 'Hemenway',
            year: '2027'
          },
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Large',
            tree_color: 'Brown',
            bow_color: 'White',
            year: '2027',
            production_status: 'pending',
            has_open_flags: false
          }
        })
      ]
    }
  });

  assert.equal(queueHelpers.filterLocalOrders([record], { size: 'small', bowColor: 'red' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { size: 'large', bowColor: 'white' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { size: 'small', bowColor: 'white' }, '').length, 0);
  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', year: '2026' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', year: '2028' }, '').length, 0);
  assert.equal(queueHelpers.filterLocalOrders([record], { ornamentType: 'tree_ornament', treeColor: 'brown' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { ornamentType: 'tree_ornament', treeColor: 'blue' }, '').length, 0);
});

test('order-level fulfillment, event, tray, and sync-status filters combine correctly with one same-item match', () => {
  const record = createRecord({
    forge_order_uuid: 'order-level-match',
    sync_status: 'error',
    current_tray_number: 8,
    event_id: 'EVENT-OMEGA',
    payload: {
      event_id: 'EVENT-OMEGA',
      fulfillment: {
        method: 'pickup'
      },
      items: [
        createItem({
          line_id: 'pickup-tree',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'pending',
            has_open_flags: false
          }
        })
      ]
    }
  });

  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', fulfillment: 'pickup' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', event: 'event-omega' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', tray: '8' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', syncStatus: 'error' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([record], { product: 'tree_ornament', fulfillment: 'shipping' }, '').length, 0);
});

test('open-flag filtering respects order-level flags, matching-item flags, unrelated-item flags, and without-flags exclusions', () => {
  const orderFlagRecord = createRecord({
    forge_order_uuid: 'order-flag-record',
    has_open_flags: true,
    payload: {
      open_flags: [{ code: 'waiting_on_material', message: 'Waiting on material' }],
      has_open_flags: true,
      items: [createItem()]
    }
  });
  const matchingItemFlagRecord = createRecord({
    forge_order_uuid: 'matching-item-flag',
    payload: {
      items: [
        createItem({
          line_id: 'flagged-tree',
          open_flags: [{ code: 'custom_icon', message: 'Custom icon requested' }],
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'pending',
            has_open_flags: true
          }
        })
      ]
    }
  });
  const unrelatedItemFlagRecord = createRecord({
    forge_order_uuid: 'unrelated-item-flag',
    payload: {
      items: [
        createItem({
          line_id: 'plain-tree',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'pending',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'flagged-present',
          product_definition_id: 'present_stack',
          product_display_name: 'Present Stack Ornament',
          open_flags: [{ code: 'custom_icon', message: 'Custom icon requested' }],
          configuration_snapshot: {
            bowColor: 'White',
            familyName: 'Anderson',
            year: '2026'
          },
          structured_attributes: {
            product_definition_id: 'present_stack',
            category: 'ornament',
            ornament_type: 'present_stack',
            size: null,
            tree_color: null,
            bow_color: 'White',
            family_name: 'Anderson',
            year: 2026,
            production_status: 'pending',
            has_open_flags: true
          }
        })
      ]
    }
  });

  assert.equal(queueHelpers.filterLocalOrders([orderFlagRecord], { openFlags: 'with_flags' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([matchingItemFlagRecord], { product: 'tree_ornament', openFlags: 'with_flags' }, '').length, 1);
  assert.equal(queueHelpers.filterLocalOrders([unrelatedItemFlagRecord], { product: 'tree_ornament', openFlags: 'with_flags' }, '').length, 0);
  assert.equal(queueHelpers.filterLocalOrders([orderFlagRecord], { openFlags: 'without_flags' }, '').length, 0);
  assert.equal(queueHelpers.filterLocalOrders([matchingItemFlagRecord], { product: 'tree_ornament', openFlags: 'without_flags' }, '').length, 0);
  assert.equal(queueHelpers.filterLocalOrders([unrelatedItemFlagRecord], { product: 'tree_ornament', openFlags: 'without_flags' }, '').length, 1);
});

test('production-status filtering uses item status rather than parent order status', () => {
  const record = createRecord({
    forge_order_uuid: 'status-order',
    production_status: 'submitted',
    current_tray_number: 6,
    payload: {
      items: [
        createItem({
          line_id: 'pending-item',
          production_status: 'pending',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            production_status: 'pending',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'in-prod-item',
          production_status: 'in_production',
          completed_quantity: 1,
          quantity: 2,
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            production_status: 'in_production',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'complete-item',
          production_status: 'complete',
          completed_quantity: 1,
          quantity: 1,
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            production_status: 'complete',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'blocked-item',
          production_status: 'blocked',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            production_status: 'blocked',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'cancelled-item',
          production_status: 'cancelled',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            production_status: 'cancelled',
            has_open_flags: false
          }
        })
      ]
    }
  });

  assert.equal(queueHelpers.filterLocalOrders([record], { productionStatus: 'pending' }, '').length, 1);
  assert.equal(queueHelpers.getMatchingOrderItems(record, { productionStatus: 'pending' }).length, 1);
  assert.equal(queueHelpers.getMatchingOrderItems(record, { productionStatus: 'in_production' }).length, 1);
  assert.equal(queueHelpers.getMatchingOrderItems(record, { productionStatus: 'complete' }).length, 1);
  assert.equal(queueHelpers.getMatchingOrderItems(record, { productionStatus: 'blocked' }).length, 1);
  assert.equal(queueHelpers.getMatchingOrderItems(record, { productionStatus: 'cancelled' }).length, 1);
});

test('order scope filters and available options separate active cancelled and Test Session orders safely', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'active-live-order',
      production_status: 'tray_assigned',
      payload: {
        ...createRecord().payload,
        event: {
          event_id: 'event-live-1',
          event_name: 'Austin Market',
          event_type: 'live_event'
        }
      }
    }),
    createRecord({
      forge_order_uuid: 'cancelled-live-order',
      production_status: 'cancelled',
      current_tray_number: null,
      payload: {
        ...createRecord().payload,
        event: {
          event_id: 'event-live-2',
          event_name: 'Dallas Market',
          event_type: 'live_event'
        }
      }
    }),
    createRecord({
      forge_order_uuid: 'active-test-order',
      production_status: 'submitted',
      current_tray_number: null,
      payload: {
        ...createRecord().payload,
        event: {
          event_id: 'event-test-1',
          event_name: 'Checkout Test Session',
          event_type: 'test_session'
        }
      }
    })
  ];

  const availableFilters = queueHelpers.getAvailableOrderFilters(records, {
    activeFilters: queueHelpers.createEmptyOrderFilters(),
    searchTerm: ''
  });

  assert.deepEqual(availableFilters.orderScope, [
    { value: 'active', label: 'Active', count: 2 },
    { value: 'cancelled', label: 'Cancelled', count: 1 },
    { value: 'test_orders', label: 'Test Orders', count: 1 }
  ]);
  assert.deepEqual(
    queueHelpers.filterLocalOrders(records, { orderScope: 'active' }).map((record) => record.forge_order_uuid),
    ['active-test-order', 'active-live-order']
  );
  assert.deepEqual(
    queueHelpers.filterLocalOrders(records, { orderScope: 'cancelled' }).map((record) => record.forge_order_uuid),
    ['cancelled-live-order']
  );
  assert.deepEqual(
    queueHelpers.filterLocalOrders(records, { orderScope: 'test_orders' }).map((record) => record.forge_order_uuid),
    ['active-test-order']
  );
});

test('production status counts unique completed orders instead of summed completed item quantities', () => {
  const completedOrders = [
    createRecord({
      forge_order_uuid: 'completed-order-1',
      production_status: 'completed',
      current_tray_number: null,
      total_item_count: 2,
      completed_item_count: 2,
      payload: {
        forge_order_uuid: 'completed-order-1',
        items: [
          createItem({
            line_id: 'completed-order-1-line-1',
            production_status: 'complete',
            quantity: 1,
            completed_quantity: 1,
            structured_attributes: { production_status: 'complete' }
          }),
          createItem({
            line_id: 'completed-order-1-line-2',
            production_status: 'complete',
            quantity: 1,
            completed_quantity: 1,
            structured_attributes: { production_status: 'complete' }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'completed-order-2',
      production_status: 'completed',
      current_tray_number: null,
      total_item_count: 2,
      completed_item_count: 2,
      payload: {
        forge_order_uuid: 'completed-order-2',
        items: [
          createItem({
            line_id: 'completed-order-2-line-1',
            production_status: 'complete',
            quantity: 1,
            completed_quantity: 1,
            structured_attributes: { production_status: 'complete' }
          }),
          createItem({
            line_id: 'completed-order-2-line-2',
            production_status: 'complete',
            quantity: 1,
            completed_quantity: 1,
            structured_attributes: { production_status: 'complete' }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'completed-order-3',
      production_status: 'completed',
      current_tray_number: null,
      total_item_count: 2,
      completed_item_count: 2,
      payload: {
        forge_order_uuid: 'completed-order-3',
        items: [
          createItem({
            line_id: 'completed-order-3-line-1',
            production_status: 'complete',
            quantity: 1,
            completed_quantity: 1,
            structured_attributes: { production_status: 'complete' }
          }),
          createItem({
            line_id: 'completed-order-3-line-2',
            production_status: 'complete',
            quantity: 1,
            completed_quantity: 1,
            structured_attributes: { production_status: 'complete' }
          })
        ]
      }
    })
  ];
  const duplicateCompletedRecord = JSON.parse(JSON.stringify(completedOrders[0]));
  const records = [...completedOrders, duplicateCompletedRecord];

  const productionStatusOptions = queueHelpers.getAvailableOrderFilters(records).productionStatus;
  const completedOption = productionStatusOptions.find((option) => option.value === 'complete');

  assert.equal(completedOption.count, 3);
  assert.equal(completedOrders.reduce((sum, record) => sum + record.completed_item_count, 0), 6);
  const filteredCompletedOrderUuids = queueHelpers
    .filterLocalOrders(records, { productionStatus: 'complete' }, '')
    .map((record) => record.forge_order_uuid);

  assert.equal(filteredCompletedOrderUuids.length, 4);
  assert.equal(filteredCompletedOrderUuids.filter((uuid) => uuid === 'completed-order-1').length, 2);
  assert.deepEqual(new Set(filteredCompletedOrderUuids), new Set(['completed-order-1', 'completed-order-2', 'completed-order-3']));
});

test('queue summary metrics use filtered physical quantity and do not double-count orders', () => {
  const record = createRecord({
    forge_order_uuid: 'metric-order',
    payload: {
      items: [
        createItem({
          line_id: 'tree-a',
          quantity: 2
        }),
        createItem({
          line_id: 'tree-b',
          quantity: 3,
          configuration_snapshot: {
            size: 'Large',
            treeColor: 'Green',
            bowColor: 'Red',
            familyName: 'Hemenway',
            year: '2026'
          },
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Large',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'pending',
            has_open_flags: false
          }
        })
      ]
    }
  });

  const summary = queueHelpers.summarizeLocalOrders([record], { product: 'tree_ornament' });

  assert.deepEqual(summary, {
    totalOrders: 1,
    pendingFutureSync: 1,
    ordersWithOpenFlags: 0,
    totalItems: 5
  });
});

test('ready production groups separate by setup values and derive required, complete, and remaining physical quantities', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'batch-1',
      current_tray_number: 2,
      payload: {
        items: [
          createItem({
            line_id: 'tree-small-green',
            quantity: 3,
            completed_quantity: 1,
            production_status: 'in_production',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              year: 2026,
              production_status: 'in_production',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'batch-2',
      current_tray_number: 3,
      payload: {
        items: [
          createItem({
            line_id: 'tree-small-green-2',
            quantity: 1,
            completed_quantity: 0,
            production_status: 'pending',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              year: '2026',
              production_status: 'pending',
              has_open_flags: false
            }
          }),
          createItem({
            line_id: 'tree-large-green',
            quantity: 1,
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Large',
              tree_color: 'Green',
              bow_color: 'Red',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            },
            configuration_snapshot: {
              size: 'Large',
              treeColor: 'Green',
              bowColor: 'Red',
              familyName: 'Jones',
              year: '2026'
            }
          }),
          createItem({
            line_id: 'tree-small-brown',
            quantity: 1,
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Brown',
              bow_color: 'Red',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            },
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Brown',
              bowColor: 'Red',
              familyName: 'Jones',
              year: '2026'
            }
          }),
          createItem({
            line_id: 'tree-small-green-2027',
            quantity: 1,
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              year: 2027,
              production_status: 'pending',
              has_open_flags: false
            },
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Green',
              bowColor: 'Red',
              familyName: 'Jones',
              year: '2027'
            }
          }),
          createItem({
            line_id: 'present-white',
            quantity: 1,
            product_definition_id: 'present_stack',
            product_display_name: 'Present Stack Ornament',
            configuration_snapshot: {
              bowColor: 'White',
              familyName: 'Jones',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'present_stack',
              category: 'ornament',
              ornament_type: 'present_stack',
              size: null,
              tree_color: null,
              bow_color: 'White',
              family_name: 'Jones',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            }
          })
        ]
      }
    })
  ];

  const batchSummary = queueHelpers.buildProductionBatchGroups(records);
  const labels = batchSummary.readyGroups.map((group) => group.label);
  const mainGroup = batchSummary.readyGroups.find((group) => group.label === 'Tree Ornament / Small / Green / Red Bow / 2026');

  assert.deepEqual(labels, [
    'Present Stack Ornament / White Bow / 2026',
    'Tree Ornament / Large / Green / Red Bow / 2026',
    'Tree Ornament / Small / Brown / Red Bow / 2026',
    'Tree Ornament / Small / Green / Red Bow / 2026',
    'Tree Ornament / Small / Green / Red Bow / 2027'
  ]);
  assert.equal(mainGroup.requiredQuantity, 4);
  assert.equal(mainGroup.completedQuantity, 1);
  assert.equal(mainGroup.remainingQuantity, 3);
  assert.equal(mainGroup.matchingLineCount, 2);
  assert.equal(mainGroup.orderCount, 2);
});

test('complete quantities are clamped, cancelled items are excluded, and ready-to-pack or terminal orders do not create unfinished production groups', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'clamped-order',
      current_tray_number: 5,
      payload: {
        items: [
          createItem({
            line_id: 'clamped-line',
            quantity: 2,
            completed_quantity: 7,
            production_status: 'in_production',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              production_status: 'in_production',
              has_open_flags: false
            }
          }),
          createItem({
            line_id: 'cancelled-line',
            quantity: 4,
            completed_quantity: 4,
            production_status: 'cancelled',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              production_status: 'cancelled',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'packed-order',
      production_status: 'packed',
      current_tray_number: null,
      payload: { items: [createItem()] }
    }),
    createReadyRecord()
  ];

  const itemCounts = queueHelpers.derivePhysicalPieceCounts(records[0].payload.items[0]);
  const batchSummary = queueHelpers.buildProductionBatchGroups(records);

  assert.deepEqual(itemCounts, {
    requiredQuantity: 2,
    completedQuantity: 2,
    remainingQuantity: 0
  });
  assert.equal(batchSummary.readyGroups.length, 0);
  assert.equal(batchSummary.issueGroups.length, 0);
});

test('needs-attention groups classify waiting tray, custom icon, blocked, and other flags without double-counting', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'waiting-tray',
      current_tray_number: null,
      payload: { items: [createItem({ line_id: 'wait-line' })] }
    }),
    createRecord({
      forge_order_uuid: 'custom-icon',
      current_tray_number: 3,
      payload: {
        items: [
          createItem({
            line_id: 'custom-line',
            open_flags: [{ code: 'custom_icon', message: 'Custom icon requested: Tiny baseball' }],
            structured_attributes: {
              product_definition_id: 'present_stack',
              category: 'ornament',
              ornament_type: 'present_stack',
              bow_color: 'White',
              year: 2026,
              production_status: 'pending',
              has_open_flags: true
            },
            product_definition_id: 'present_stack',
            product_display_name: 'Present Stack Ornament'
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'blocked-order',
      current_tray_number: 4,
      payload: {
        items: [
          createItem({
            line_id: 'blocked-line',
            production_status: 'blocked',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              production_status: 'blocked',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'other-flag-order',
      current_tray_number: 5,
      has_open_flags: true,
      payload: {
        open_flags: [{ code: 'waiting_on_material', message: 'Waiting on material' }],
        has_open_flags: true,
        items: [createItem({ line_id: 'flag-line' })]
      }
    })
  ];

  const batchSummary = queueHelpers.buildProductionBatchGroups(records);

  assert.deepEqual(batchSummary.issueGroups.map((group) => group.label), [
    'Waiting for Tray',
    'Custom Icon Required',
    'Blocked Items',
    'Other Open Flags'
  ]);
  assert.deepEqual(batchSummary.issueGroups.map((group) => group.remainingQuantity), [1, 1, 1, 1]);
  assert.equal(batchSummary.readyGroups.length, 0);
});

test('batch rows preserve order destination, product identity, quantities, concise identifiers, and sort by tray then order then line order', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'order-b',
      current_tray_number: null,
      payload: {
        customer: { full_name: 'Beta Customer' },
        items: [
          createItem({
            line_id: 'line-2',
            quantity: 1,
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Green',
              bowColor: 'Red',
              familyName: 'Beta',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              family_name: 'Beta',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'order-a',
      current_tray_number: 2,
      payload: {
        customer: { full_name: 'Alpha Customer' },
        items: [
          createItem({
            line_id: 'line-1',
            quantity: 2,
            completed_quantity: 1,
            production_status: 'in_production',
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Green',
              bowColor: 'Red',
              familyName: 'Alpha',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              family_name: 'Alpha',
              year: 2026,
              production_status: 'in_production',
              has_open_flags: false
            }
          }),
          createItem({
            line_id: 'line-1b',
            quantity: 1,
            completed_quantity: 0,
            production_status: 'pending',
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Green',
              bowColor: 'Red',
              familyName: 'Alpha Two',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              family_name: 'Alpha Two',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'order-c',
      current_tray_number: 10,
      payload: {
        customer: { full_name: 'Gamma Customer' },
        items: [
          createItem({
            line_id: 'line-3',
            quantity: 1,
            configuration_snapshot: {
              size: 'Small',
              treeColor: 'Green',
              bowColor: 'Red',
              familyName: 'Gamma',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              family_name: 'Gamma',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            }
          })
        ]
      }
    })
  ];

  const group = queueHelpers.buildProductionBatchGroups(records).readyGroups.find((entry) => entry.label === 'Tree Ornament / Small / Green / Red Bow / 2026');
  const rows = queueHelpers.buildProductionBatchRows(group, records);

  assert.deepEqual(rows.map((row) => row.orderUuid), ['order-a', 'order-a', 'order-c']);
  assert.equal(rows[0].trayNumber, 2);
  assert.equal(rows[2].trayNumber, 10);
  assert.equal(rows[0].customerName, 'Alpha Customer');
  assert.equal(rows[0].productDisplayName, 'Tree Ornament');
  assert.equal(rows[0].requiredQuantity, 2);
  assert.equal(rows[0].completedQuantity, 1);
  assert.equal(rows[0].remainingQuantity, 1);
  assert.equal(rows[0].conciseIdentifier, 'Alpha • 2026');
});

test('dynamic filter options honor other active filters, dedupe values, and keep the selected value available', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'option-order-1',
      current_tray_number: 2,
      payload: {
        items: [
          createItem({
            line_id: 'small-red',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              year: 2026,
              production_status: 'pending',
              has_open_flags: false
            }
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'option-order-2',
      current_tray_number: 10,
      payload: {
        items: [
          createItem({
            line_id: 'large-white',
            configuration_snapshot: {
              size: 'Large',
              treeColor: 'Brown',
              bowColor: 'White',
              familyName: 'Jones',
              year: '2027'
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Large',
              tree_color: 'Brown',
              bow_color: 'White',
              year: '2027',
              production_status: 'pending',
              has_open_flags: false
            }
          })
        ]
      }
    })
  ];

  const options = queueHelpers.getAvailableOrderFilters(records, {
    activeFilters: {
      product: 'tree_ornament',
      size: 'small',
      bowColor: 'red',
      year: '2027'
    }
  });

  assert.deepEqual(options.product.map((option) => option.value), ['tree_ornament']);
  assert.deepEqual(options.size.map((option) => option.value), ['small']);
  assert.deepEqual(options.bowColor.map((option) => option.value), ['red']);
  assert.deepEqual(options.year.map((option) => option.value), ['2026', '2027']);
  assert.deepEqual(options.tray.map((option) => option.value), []);
});

test('matching order items preserve original raw line order for downstream order-card rendering', () => {
  const record = createRecord({
    forge_order_uuid: 'raw-order',
    payload: {
      items: [
        createItem({
          line_id: 'line-a',
          product_definition_id: 'tree_ornament',
          product_display_name: 'Tree Ornament',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'pending',
            has_open_flags: false
          }
        }),
        createItem({
          line_id: 'line-b',
          product_definition_id: 'tree_ornament',
          product_display_name: 'Tree Ornament',
          structured_attributes: {
            product_definition_id: 'tree_ornament',
            category: 'ornament',
            ornament_type: 'tree_ornament',
            size: 'Small',
            tree_color: 'Green',
            bow_color: 'Red',
            year: 2026,
            production_status: 'in_production',
            has_open_flags: false
          }
        })
      ]
    }
  });

  const matches = queueHelpers.getMatchingOrderItems(record, { product: 'tree_ornament', size: 'small', treeColor: 'green' });

  assert.deepEqual(matches.map((item) => item.line_id), ['line-a', 'line-b']);
});

test('queue helpers do not mutate original records while deriving batch, filter, and normalization views', () => {
  const records = [
    createRecord({
      forge_order_uuid: 'mutation-tree',
      current_tray_number: 4,
      sync_status: 'pending',
      event_id: 'EVENT-MUTATION',
      payload: {
        forge_order_uuid: 'mutation-tree',
        event_id: 'EVENT-MUTATION',
        customer: {
          full_name: 'Mutation Tree Customer',
          email: 'tree@example.com',
          phone: '(111) 111-1111',
          preferred_contact: 'Text'
        },
        fulfillment: {
          method: 'shipping',
          needed_by: '2026-12-18',
          shipping_address: {
            address_1: '111 Tree Lane',
            address_2: 'Unit A',
            city: 'Denver',
            state: 'CO',
            postal_code: '80204',
            country: 'United States'
          }
        },
        open_flags: [],
        has_open_flags: false,
        items: [
          createItem({
            line_id: 'tree-red-line',
            quantity: 2,
            completed_quantity: 1,
            production_status: 'in_production',
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Small',
              tree_color: 'Green',
              bow_color: 'Red',
              family_name: 'Hemenway',
              year: 2026,
              production_status: 'in_production',
              fulfillment_method: 'shipping',
              event_id: 'EVENT-MUTATION',
              has_open_flags: false
            },
            open_flags: [],
            personalization_order: [
              { position: 1, type: 'person', name: 'Kyle' },
              { position: 2, type: 'pet', name: 'Scout', icon: 'paw' }
            ]
          }),
          createItem({
            line_id: 'tree-white-line',
            quantity: 1,
            completed_quantity: 0,
            production_status: 'pending',
            configuration_snapshot: {
              size: 'Large',
              treeColor: 'Brown',
              bowColor: 'White',
              familyName: 'Hemenway',
              year: '2027'
            },
            structured_attributes: {
              product_definition_id: 'tree_ornament',
              category: 'ornament',
              ornament_type: 'tree_ornament',
              size: 'Large',
              tree_color: 'Brown',
              bow_color: 'White',
              family_name: 'Hemenway',
              year: '2027',
              production_status: 'pending',
              fulfillment_method: 'shipping',
              event_id: 'EVENT-MUTATION',
              has_open_flags: false
            },
            open_flags: []
          })
        ]
      }
    }),
    createRecord({
      forge_order_uuid: 'mutation-present',
      current_tray_number: null,
      sync_status: 'error',
      has_open_flags: true,
      event_id: 'EVENT-MUTATION',
      payload: {
        forge_order_uuid: 'mutation-present',
        event_id: 'EVENT-MUTATION',
        customer: {
          full_name: 'Mutation Present Customer',
          email: 'present@example.com',
          phone: '(222) 222-2222',
          preferred_contact: 'Email'
        },
        fulfillment: {
          method: 'pickup',
          needed_by: '2026-12-20',
          shipping_address: null
        },
        open_flags: [
          {
            code: 'waiting_on_material',
            scope: 'order',
            line_id: null,
            message: 'Waiting on material'
          }
        ],
        has_open_flags: true,
        items: [
          createItem({
            line_id: 'present-custom-line',
            quantity: 1,
            completed_quantity: 0,
            production_status: 'pending',
            product_definition_id: 'present_stack',
            product_display_name: 'Present Stack Ornament',
            configuration_snapshot: {
              bowColor: 'White',
              familyName: 'Anderson',
              year: '2026'
            },
            structured_attributes: {
              product_definition_id: 'present_stack',
              category: 'ornament',
              ornament_type: 'present_stack',
              size: null,
              tree_color: null,
              bow_color: 'White',
              family_name: 'Anderson',
              year: 2026,
              production_status: 'pending',
              fulfillment_method: 'pickup',
              event_id: 'EVENT-MUTATION',
              has_open_flags: true
            },
            open_flags: [
              {
                code: 'custom_icon',
                scope: 'item',
                line_id: 'present-custom-line',
                message: 'Custom icon requested: Baseball'
              }
            ],
            personalization_order: [
              { position: 1, type: 'pet', name: 'Scout', icon: 'custom_icon', custom_icon_description: 'Baseball' }
            ]
          })
        ]
      }
    })
  ];
  const snapshot = JSON.parse(JSON.stringify(records));
  const filters = {
    product: 'tree_ornament',
    ornamentType: 'tree_ornament',
    size: 'small',
    treeColor: 'green',
    bowColor: 'red',
    year: '2026',
    productionStatus: 'in_production',
    fulfillment: 'shipping',
    event: 'event-mutation',
    openFlags: 'without_flags',
    tray: '4',
    syncStatus: 'pending'
  };
  const matchingItems = queueHelpers.getMatchingOrderItems(records[0], filters);
  const firstAttributes = queueHelpers.normalizeProductionItemAttributes(records[0], records[0].payload.items[0], 0);
  const firstClassification = queueHelpers.classifyProductionItem(records[0], firstAttributes);
  const batchSummary = queueHelpers.buildProductionBatchGroups(records, filters);
  const matchingGroup = batchSummary.readyGroups[0];

  queueHelpers.createOrderSearchDocument(records[0]);
  queueHelpers.getAvailableOrderFilters(records, { activeFilters: filters, searchTerm: 'mutation' });
  queueHelpers.filterLocalOrders(records, filters, 'mutation');
  queueHelpers.summarizeLocalOrders(records, filters);
  matchingItems;
  queueHelpers.derivePhysicalPieceCounts(records[0].payload.items[0]);
  batchSummary;
  if (matchingGroup) {
    queueHelpers.buildProductionBatchRows(matchingGroup, records, filters);
  }
  queueHelpers.sortProductionBatchRows([
    {
      trayNumber: 10,
      orderUuid: 'order-b',
      lineOrder: 1
    },
    {
      trayNumber: 4,
      orderUuid: 'order-a',
      lineOrder: 0
    }
  ]);
  firstClassification;

  assert.deepEqual(records, snapshot);
  assert.deepEqual(records[0].payload.items.map((item) => item.line_id), snapshot[0].payload.items.map((item) => item.line_id));
  assert.deepEqual(records[0].payload.items[0].structured_attributes, snapshot[0].payload.items[0].structured_attributes);
  assert.deepEqual(records[0].payload.items[0].configuration_snapshot, snapshot[0].payload.items[0].configuration_snapshot);
  assert.deepEqual(records[1].payload.items[0].open_flags, snapshot[1].payload.items[0].open_flags);
  assert.equal(records[0].payload.items[0].production_status, snapshot[0].payload.items[0].production_status);
  assert.equal(records[0].payload.items[0].quantity, snapshot[0].payload.items[0].quantity);
  assert.equal(records[0].payload.items[0].completed_quantity, snapshot[0].payload.items[0].completed_quantity);
  assert.equal(records[0].current_tray_number, snapshot[0].current_tray_number);
  assert.equal(records[0].event_id, snapshot[0].event_id);
  assert.equal(records[0].payload.fulfillment.method, snapshot[0].payload.fulfillment.method);
  assert.equal(records[1].sync_status, snapshot[1].sync_status);
});

test('valid ready-to-pack orders remain eligible and concise ready summaries preserve quantity and readable names', () => {
  const record = createReadyRecord();

  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(record), true);
  assert.deepEqual(queueHelpers.filterReadyToPackOrders([record]).map((entry) => entry.forge_order_uuid), ['order-ready-1']);
  assert.deepEqual(queueHelpers.buildReadyToPackItemSummaries(record), [
    '1 × Tree Ornament',
    '2 × Little Reindeer Letter Ornament'
  ]);
});

test('submitted, tray-assigned, in-production, incomplete, flagged, no-tray, packed, shipped, picked-up, and cancelled orders remain excluded from ready-to-pack', () => {
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'submitted-order', production_status: 'submitted', current_tray_number: null })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'tray-order', production_status: 'tray_assigned' })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'production-order', production_status: 'in_production' })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'flag-order', has_open_flags: true, payload: { has_open_flags: true, open_flags: [{ code: 'custom_icon', message: 'Custom icon' }] } })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'packed-order', production_status: 'packed', current_tray_number: null })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'shipped-order', production_status: 'shipped', current_tray_number: null })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'picked-up-order', production_status: 'picked_up', current_tray_number: null })), false);
  assert.equal(queueHelpers.isOrderEligibleForReadyToPack(createReadyRecord({ forge_order_uuid: 'cancelled-order', production_status: 'cancelled', current_tray_number: null })), false);
});
