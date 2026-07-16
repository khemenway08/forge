const test = require('node:test');
const assert = require('node:assert/strict');

const orderStoreModule = require('../public/js/forge-order-store.js');

function createRecord(overrides = {}) {
  return {
    record_type: 'forge_local_order',
    record_version: '1.0',
    forge_order_uuid: 'order-1',
    status: 'submitted',
    sync_status: 'pending',
    submitted_at: '2026-07-15T12:00:00.000Z',
    local_saved_at: '2026-07-15T12:00:01.000Z',
    sync_attempt_count: 0,
    last_sync_attempt_at: null,
    last_sync_error: null,
    event_id: null,
    device_id: null,
    has_open_flags: false,
    payload: {
      forge_order_uuid: 'order-1',
      customer: { full_name: 'Kyle Hemenway' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    },
    ...overrides
  };
}

test('saveNewOrder inserts once, duplicate saves return the original immutable record, and pending counts are accurate', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();
  const firstRecord = createRecord();
  const duplicateRecord = createRecord({
    submitted_at: '2026-07-16T09:00:00.000Z',
    payload: {
      forge_order_uuid: 'order-1',
      customer: { full_name: 'Changed Name' },
      items: [{ quantity: 3 }],
      pricing: { estimated_total_cents: 9900 }
    }
  });

  const inserted = await store.saveNewOrder(firstRecord);
  const duplicate = await store.saveNewOrder(duplicateRecord);
  const fetched = await store.getOrder('order-1');
  const pendingCount = await store.countOrdersBySyncStatus('pending');

  assert.equal(inserted.wasInserted, true);
  assert.equal(inserted.duplicatePrevented, false);
  assert.equal(duplicate.wasInserted, false);
  assert.equal(duplicate.duplicatePrevented, true);
  assert.equal(fetched.submitted_at, '2026-07-15T12:00:00.000Z');
  assert.equal(fetched.payload.customer.full_name, 'Kyle Hemenway');
  assert.equal(fetched.payload.pricing.estimated_total_cents, 3000);
  assert.equal(pendingCount, 1);
});

test('listOrders returns newest submitted orders first', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-1',
    submitted_at: '2026-07-15T12:00:00.000Z'
  }));
  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-2',
    submitted_at: '2026-07-16T12:00:00.000Z',
    payload: {
      forge_order_uuid: 'order-2',
      customer: { full_name: 'Meagan Smith' },
      items: [{ quantity: 2 }],
      pricing: { estimated_total_cents: 6000 }
    }
  }));

  const records = await store.listOrders();

  assert.deepEqual(records.map((record) => record.forge_order_uuid), ['order-2', 'order-1']);
});

test('older orders normalize to submitted production status with no assigned tray and the default tray inventory is seeded once', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'legacy-order',
    production_status: undefined,
    current_tray_number: undefined,
    updated_at: undefined
  }));

  const order = await store.getOrder('legacy-order');
  const trays = await store.listTrays();

  assert.equal(order.production_status, orderStoreModule.PRODUCTION_STATUSES.submitted);
  assert.equal(order.current_tray_number, null);
  assert.equal(trays.length, 24);
  assert.deepEqual(trays.slice(0, 3).map((tray) => tray.tray_number), [1, 2, 3]);
  assert.ok(trays.every((tray) => tray.tray_status === orderStoreModule.TRAY_STATUSES.available));
});

test('assignTrayToOrder updates one order and one tray and creates one active assignment history record', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-16T15:00:00.000Z'),
    randomUUID: () => 'assignment-1'
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-a',
    payload: {
      forge_order_uuid: 'order-a',
      customer: { full_name: 'Kyle Hemenway' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const result = await store.assignTrayToOrder('order-a', 1);
  const updatedOrder = await store.getOrder('order-a');
  const tray = await store.getTray(1);
  const history = await store.listTrayAssignmentHistory();

  assert.equal(result.order.production_status, orderStoreModule.PRODUCTION_STATUSES.trayAssigned);
  assert.equal(result.order.current_tray_number, 1);
  assert.equal(updatedOrder.production_status, orderStoreModule.PRODUCTION_STATUSES.trayAssigned);
  assert.equal(updatedOrder.current_tray_number, 1);
  assert.equal(tray.tray_status, orderStoreModule.TRAY_STATUSES.assigned);
  assert.equal(tray.current_order_uuid, 'order-a');
  assert.equal(history.length, 1);
  assert.equal(history[0].tray_assignment_id, 'assignment-1');
  assert.equal(history[0].tray_number, 1);
  assert.equal(history[0].forge_order_uuid, 'order-a');
  assert.equal(history[0].released_at, null);
});

test('assignTrayToOrder accepts numeric tray strings and persists the normalized tray number once', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-16T15:30:00.000Z'),
    randomUUID: () => 'assignment-string-tray'
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-string-tray',
    payload: {
      forge_order_uuid: 'order-string-tray',
      customer: { full_name: 'Meagan Smith' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 2600 }
    }
  }));

  const result = await store.assignTrayToOrder('order-string-tray', '2');
  const updatedOrder = await store.getOrder('order-string-tray');
  const tray = await store.getTray('2');
  const history = await store.listTrayAssignmentHistory();

  assert.equal(result.order.current_tray_number, 2);
  assert.equal(updatedOrder.current_tray_number, 2);
  assert.equal(tray.tray_number, 2);
  assert.equal(tray.current_order_uuid, 'order-string-tray');
  assert.equal(history.length, 1);
  assert.equal(history[0].tray_number, 2);
});

test('assignTrayToOrder prevents one tray from being assigned twice and one order from receiving multiple active trays', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-16T16:00:00.000Z'),
    randomUUID: (() => {
      let count = 0;
      return () => `assignment-${++count}`;
    })()
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-a',
    payload: {
      forge_order_uuid: 'order-a',
      customer: { full_name: 'Kyle Hemenway' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));
  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-b',
    payload: {
      forge_order_uuid: 'order-b',
      customer: { full_name: 'Meagan Smith' },
      items: [{ quantity: 2 }],
      pricing: { estimated_total_cents: 6000 }
    }
  }));

  await store.assignTrayToOrder('order-a', 1);

  await assert.rejects(
    () => store.assignTrayToOrder('order-b', 1),
    /no longer available/i
  );
  await assert.rejects(
    () => store.assignTrayToOrder('order-a', 2),
    /already has an active tray/i
  );

  const history = await store.listTrayAssignmentHistory();
  const trayOne = await store.getTray(1);
  const trayTwo = await store.getTray(2);
  const orderA = await store.getOrder('order-a');
  const orderB = await store.getOrder('order-b');

  assert.equal(history.length, 1);
  assert.equal(trayOne.current_order_uuid, 'order-a');
  assert.equal(trayTwo.tray_status, orderStoreModule.TRAY_STATUSES.available);
  assert.equal(orderA.current_tray_number, 1);
  assert.equal(orderB.current_tray_number, null);
  assert.equal(orderB.production_status, orderStoreModule.PRODUCTION_STATUSES.submitted);
});

test('legacy item production fields normalize on read without rewriting the order', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'legacy-normalization-order',
    payload: {
      forge_order_uuid: 'legacy-normalization-order',
      customer: { full_name: 'Legacy Customer' },
      items: [
        {
          line_number: 1,
          quantity: 2,
          structured_attributes: {
            production_status: 'not_started'
          }
        }
      ],
      pricing: { estimated_total_cents: 5200 }
    }
  }));

  const order = await store.getOrder('legacy-normalization-order');
  const item = order.payload.items[0];

  assert.equal(item.line_id, 'legacy-normalization-order-line-1');
  assert.equal(item.production_status, orderStoreModule.ITEM_PRODUCTION_STATUSES.pending);
  assert.equal(item.completed_quantity, 0);
  assert.equal(item.completed_at, null);
  assert.equal(item.structured_attributes.production_status, orderStoreModule.ITEM_PRODUCTION_STATUSES.pending);
  assert.equal(order.completed_item_count, 0);
  assert.equal(order.total_item_count, 2);
});

test('incrementOrderItemCompletion moves a multi-quantity line from tray assigned to in production to ready to pack', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: (() => {
      const timestamps = [
        new Date('2026-07-16T18:00:00.000Z'),
        new Date('2026-07-16T18:05:00.000Z'),
        new Date('2026-07-16T18:10:00.000Z')
      ];
      let index = 0;
      return () => timestamps[Math.min(index++, timestamps.length - 1)];
    })(),
    randomUUID: () => 'assignment-completion'
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'completion-order',
    payload: {
      forge_order_uuid: 'completion-order',
      customer: { full_name: 'Kyle Hemenway' },
      items: [
        {
          line_number: 1,
          line_id: 'completion-line-1',
          quantity: 2,
          structured_attributes: {}
        }
      ],
      pricing: { estimated_total_cents: 6000 }
    }
  }));

  await store.assignTrayToOrder('completion-order', 1);

  const firstResult = await store.incrementOrderItemCompletion('completion-order', 'completion-line-1');
  assert.equal(firstResult.alreadyComplete, false);
  assert.equal(firstResult.item.completed_quantity, 1);
  assert.equal(firstResult.item.production_status, orderStoreModule.ITEM_PRODUCTION_STATUSES.inProduction);
  assert.equal(firstResult.item.completed_at, null);
  assert.equal(firstResult.order.production_status, orderStoreModule.PRODUCTION_STATUSES.inProduction);
  assert.equal(firstResult.order.completed_item_count, 1);
  assert.equal(firstResult.order.total_item_count, 2);
  assert.equal(firstResult.order.ready_to_pack_at, null);

  const secondResult = await store.incrementOrderItemCompletion('completion-order', 'completion-line-1');
  assert.equal(secondResult.alreadyComplete, false);
  assert.equal(secondResult.item.completed_quantity, 2);
  assert.equal(secondResult.item.production_status, orderStoreModule.ITEM_PRODUCTION_STATUSES.complete);
  assert.equal(secondResult.item.completed_at, '2026-07-16T18:10:00.000Z');
  assert.equal(secondResult.order.production_status, orderStoreModule.PRODUCTION_STATUSES.readyToPack);
  assert.equal(secondResult.order.current_tray_number, 1);
  assert.equal(secondResult.order.completed_item_count, 2);
  assert.equal(secondResult.order.total_item_count, 2);
  assert.equal(secondResult.order.ready_to_pack_at, '2026-07-16T18:10:00.000Z');
});

test('incrementOrderItemCompletion counts physical quantities across lines and excludes cancelled items from totals', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: (() => {
      let tick = 0;
      return () => new Date(`2026-07-16T19:0${Math.min(tick++, 5)}:00.000Z`);
    })(),
    randomUUID: () => 'assignment-physical-counts'
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'physical-count-order',
    payload: {
      forge_order_uuid: 'physical-count-order',
      customer: { full_name: 'Production Team' },
      items: [
        {
          line_number: 1,
          line_id: 'tree-line',
          quantity: 1,
          structured_attributes: {}
        },
        {
          line_number: 2,
          line_id: 'reindeer-line',
          quantity: 2,
          structured_attributes: {}
        },
        {
          line_number: 3,
          line_id: 'cancelled-line',
          quantity: 4,
          production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.cancelled,
          structured_attributes: {}
        }
      ],
      pricing: { estimated_total_cents: 9000 }
    }
  }));

  await store.assignTrayToOrder('physical-count-order', 2);
  await store.incrementOrderItemCompletion('physical-count-order', 'tree-line');
  await store.incrementOrderItemCompletion('physical-count-order', 'reindeer-line');

  let order = await store.getOrder('physical-count-order');
  assert.equal(order.total_item_count, 3);
  assert.equal(order.completed_item_count, 2);
  assert.equal(order.production_status, orderStoreModule.PRODUCTION_STATUSES.inProduction);

  await store.incrementOrderItemCompletion('physical-count-order', 'reindeer-line');
  order = await store.getOrder('physical-count-order');
  assert.equal(order.total_item_count, 3);
  assert.equal(order.completed_item_count, 3);
  assert.equal(order.production_status, orderStoreModule.PRODUCTION_STATUSES.readyToPack);
});

test('incrementOrderItemCompletion stays in production when open flags remain even after all pieces are complete', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-16T20:00:00.000Z'),
    randomUUID: () => 'assignment-open-flag'
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'open-flag-order',
    has_open_flags: true,
    payload: {
      forge_order_uuid: 'open-flag-order',
      customer: { full_name: 'Flagged Customer' },
      open_flags: [{ code: 'needs_clarification', message: 'Needs clarification' }],
      items: [
        {
          line_number: 1,
          line_id: 'flag-line',
          quantity: 1,
          structured_attributes: {}
        }
      ],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  await store.assignTrayToOrder('open-flag-order', 3);
  const result = await store.incrementOrderItemCompletion('open-flag-order', 'flag-line');

  assert.equal(result.item.production_status, orderStoreModule.ITEM_PRODUCTION_STATUSES.complete);
  assert.equal(result.order.completed_item_count, 1);
  assert.equal(result.order.total_item_count, 1);
  assert.equal(result.order.production_status, orderStoreModule.PRODUCTION_STATUSES.inProduction);
  assert.equal(result.order.ready_to_pack_at, null);
});

test('incrementOrderItemCompletion rejects missing trays and blocked items and does not overcount completed lines', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-16T21:00:00.000Z'),
    randomUUID: () => 'assignment-guard-rails'
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'guard-order',
    payload: {
      forge_order_uuid: 'guard-order',
      customer: { full_name: 'Guard Rails' },
      items: [
        {
          line_number: 1,
          line_id: 'blocked-line',
          quantity: 1,
          production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.blocked,
          structured_attributes: {}
        },
        {
          line_number: 2,
          line_id: 'complete-line',
          quantity: 1,
          completed_quantity: 1,
          production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.complete,
          completed_at: '2026-07-16T20:30:00.000Z',
          structured_attributes: {}
        }
      ],
      pricing: { estimated_total_cents: 6000 }
    }
  }));

  await assert.rejects(
    () => store.incrementOrderItemCompletion('guard-order', 'blocked-line'),
    /assign a production tray/i
  );

  await store.assignTrayToOrder('guard-order', 4);

  await assert.rejects(
    () => store.incrementOrderItemCompletion('guard-order', 'blocked-line'),
    /blocked items cannot be marked complete/i
  );

  const alreadyComplete = await store.incrementOrderItemCompletion('guard-order', 'complete-line');
  assert.equal(alreadyComplete.alreadyComplete, true);
  assert.equal(alreadyComplete.item.completed_quantity, 1);
  assert.equal(alreadyComplete.order.completed_item_count, 1);
});
