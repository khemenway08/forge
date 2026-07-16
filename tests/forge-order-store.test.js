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
