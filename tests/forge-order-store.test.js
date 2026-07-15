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
