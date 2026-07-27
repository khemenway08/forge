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

test('new orders receive default server-upload fields and DATABASE_VERSION remains 4', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'server-upload-defaults-order',
    payload: {
      forge_order_uuid: 'server-upload-defaults-order',
      customer: { full_name: 'Upload Defaults' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const order = await store.getOrder('server-upload-defaults-order');

  assert.equal(orderStoreModule.DATABASE_VERSION, 4);
  assert.equal(order.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.pending);
  assert.equal(order.server_upload_attempt_count, 0);
  assert.equal(order.last_server_upload_attempt_at, null);
  assert.equal(order.last_server_upload_error, null);
  assert.equal(order.server_received_at, null);
  assert.equal(order.server_payload_sha256, null);
  assert.equal(order.server_created, null);
});

test('cancelOrder preserves the stored order, clears the tray, closes assignment history, and retains private staff data', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-21T15:00:00.000Z'),
    initialOrders: [
      createRecord({
        forge_order_uuid: 'live-order-1',
        forge_order_number: 1042,
        production_status: orderStoreModule.PRODUCTION_STATUSES.trayAssigned,
        current_tray_number: 7,
        internal_note: 'Customer confirmed spelling.\nPaid cash at show.',
        payload: {
          forge_order_uuid: 'live-order-1',
          customer: { full_name: 'Live Customer' },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event'
          },
          items: [{ line_id: 'line-1', quantity: 1, completed_quantity: 1, production_status: 'complete' }],
          pricing: { estimated_total_cents: 4200 }
        }
      })
    ],
    initialTrays: [createAssignedTrayRecord({ tray_number: 7, current_order_uuid: 'live-order-1' })],
    initialTrayAssignmentHistory: [createActiveAssignmentHistoryRecord({
      tray_assignment_id: 'assignment-live-order-1',
      tray_number: 7,
      forge_order_uuid: 'live-order-1'
    })]
  });

  const result = await store.cancelOrder('live-order-1');
  const storedOrder = await store.getOrder('live-order-1');
  const tray = await store.getTray(7);
  const history = await store.listTrayAssignmentHistory();

  assert.equal(result.order.production_status, orderStoreModule.PRODUCTION_STATUSES.cancelled);
  assert.equal(result.order.current_tray_number, null);
  assert.match(String(result.order.cancelled_at || ''), /^2026-07-21T15:00:00/);
  assert.equal(storedOrder.internal_note, 'Customer confirmed spelling.\nPaid cash at show.');
  assert.equal(storedOrder.payload.customer.full_name, 'Live Customer');
  assert.equal(storedOrder.payload.event.event_name, 'Austin Market');
  assert.equal(result.tray.tray_number, 7);
  assert.equal(tray.tray_status, orderStoreModule.TRAY_STATUSES.available);
  assert.equal(tray.current_order_uuid, null);
  assert.equal(history[0].released_at, '2026-07-21T15:00:00.000Z');
  assert.equal(history[0].release_reason, 'cancelled');
});

test('deleteTestOrder removes the saved test order, creates a tombstone, releases the tray, and blocks stale UUID re-save', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-21T16:00:00.000Z'),
    initialOrders: [
      createRecord({
        forge_order_uuid: 'test-order-1',
        forge_order_number: 1007,
        production_status: orderStoreModule.PRODUCTION_STATUSES.trayAssigned,
        current_tray_number: 8,
        payload: {
          forge_order_uuid: 'test-order-1',
          customer: { full_name: 'Test Customer' },
          event: {
            event_id: 'event-test-1',
            event_name: 'Checkout Test Session',
            event_type: 'test_session'
          },
          items: [{ line_id: 'line-1', quantity: 1, completed_quantity: 0, production_status: 'pending' }],
          pricing: { estimated_total_cents: 0 }
        }
      })
    ],
    initialTrays: [createAssignedTrayRecord({ tray_number: 8, current_order_uuid: 'test-order-1' })],
    initialTrayAssignmentHistory: [createActiveAssignmentHistoryRecord({
      tray_assignment_id: 'assignment-test-order-1',
      tray_number: 8,
      forge_order_uuid: 'test-order-1'
    })]
  });

  const result = await store.deleteTestOrder('test-order-1', 'DELETE TEST ORDER');
  const deletedOrder = await store.getOrder('test-order-1');
  const tray = await store.getTray(8);
  const hasTombstone = await store.hasCleanupTombstone('test-order-1');

  assert.equal(result.deletedOrderUuid, 'test-order-1');
  assert.equal(result.deletedOrderNumber, 1007);
  assert.equal(result.releasedTrayNumber, 8);
  assert.equal(deletedOrder, null);
  assert.equal(hasTombstone, true);
  assert.equal(tray.tray_status, orderStoreModule.TRAY_STATUSES.available);
  assert.equal(tray.current_order_uuid, null);
  await assert.rejects(
    () => store.saveNewOrder(createRecord({
      forge_order_uuid: 'test-order-1',
      payload: {
        forge_order_uuid: 'test-order-1',
        customer: { full_name: 'Resubmitted Test Customer' },
        items: [{ quantity: 1 }],
        pricing: { estimated_total_cents: 0 }
      }
    })),
    /previously deleted and cannot be saved again/i
  );
});

test('existing records without server-upload fields read as pending defaults without rewriting the stored source record', async () => {
  const indexedDB = new FakeIndexedDBFactory();
  indexedDB.seedDatabase('forge-server-upload-legacy', 3, {
    orders: {
      keyPath: 'forge_order_uuid',
      records: [
        {
          record_type: 'forge_local_order',
          record_version: '1.0',
          forge_order_uuid: 'legacy-server-upload-order',
          status: 'submitted',
          sync_status: 'pending',
          submitted_at: '2026-07-16T10:00:00.000Z',
          local_saved_at: '2026-07-16T10:00:01.000Z',
          payload: {
            forge_order_uuid: 'legacy-server-upload-order',
            customer: { full_name: 'Legacy Upload' },
            items: [{ quantity: 1 }],
            pricing: { estimated_total_cents: 2600 }
          }
        }
      ]
    }
  });

  const store = orderStoreModule.createOrderStore({
    indexedDB,
    databaseName: 'forge-server-upload-legacy'
  });

  const order = await store.getOrder('legacy-server-upload-order');
  const rawStoredRecord = indexedDB.getDatabaseState('forge-server-upload-legacy').stores.get('orders').data.get('legacy-server-upload-order');

  assert.equal(order.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.pending);
  assert.equal(order.server_upload_attempt_count, 0);
  assert.equal(order.last_server_upload_attempt_at, null);
  assert.equal(order.last_server_upload_error, null);
  assert.equal(order.server_received_at, null);
  assert.equal(order.server_payload_sha256, null);
  assert.equal(order.server_created, null);
  assert.equal(Object.prototype.hasOwnProperty.call(rawStoredRecord, 'server_upload_status'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rawStoredRecord, 'server_upload_attempt_count'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rawStoredRecord, 'last_server_upload_error'), false);
});

test('markOrderServerUploadAttempt increments once, records an ISO timestamp, clears prior error, and preserves payload and sync_status', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();
  const sourceRecord = createRecord({
    forge_order_uuid: 'attempt-order',
    server_upload_attempt_count: 2,
    last_server_upload_error: {
      code: 'network_error',
      message: 'The Forge server could not be reached.'
    },
    payload: {
      forge_order_uuid: 'attempt-order',
      customer: { full_name: 'Attempt Customer' },
      items: [{ quantity: 2 }],
      pricing: { estimated_total_cents: 5200 }
    }
  });

  await store.saveNewOrder(sourceRecord);
  const before = await store.getOrder('attempt-order');
  const payloadBefore = JSON.parse(JSON.stringify(before.payload));

  const updated = await store.markOrderServerUploadAttempt('attempt-order', '2026-07-17T08:15:00.000Z');

  assert.equal(updated.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.uploading);
  assert.equal(updated.server_upload_attempt_count, 3);
  assert.equal(updated.last_server_upload_attempt_at, '2026-07-17T08:15:00.000Z');
  assert.equal(updated.last_server_upload_error, null);
  assert.equal(updated.sync_status, 'pending');
  assert.deepEqual(updated.payload, payloadBefore);
});

test('markOrderServerUploadAttempt fails safely for a missing order', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await assert.rejects(
    () => store.markOrderServerUploadAttempt('missing-order'),
    /could not be found/i
  );
});

test('markOrderServerUploadSuccess stores server metadata for created and idempotent uploads while preserving payload, sync_status, production, and tray data', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'success-order',
    production_status: orderStoreModule.PRODUCTION_STATUSES.readyToPack,
    current_tray_number: 7,
    server_upload_attempt_count: 1,
    last_server_upload_attempt_at: '2026-07-17T08:00:00.000Z',
    payload: {
      forge_order_uuid: 'success-order',
      customer: { full_name: 'Success Customer' },
      items: [{
        quantity: 1,
        completed_quantity: 1,
        completed_at: '2026-07-17T07:55:00.000Z',
        production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.complete
      }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const createdResult = await store.markOrderServerUploadSuccess('success-order', {
    forgeOrderUuid: 'success-order',
    forgeOrderNumber: 1001,
    created: true,
    receivedAt: '2026-07-17T08:30:00.000Z',
    payloadSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  }, '2026-07-17T08:30:01.000Z');

  assert.equal(createdResult.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.stored);
  assert.equal(createdResult.server_received_at, '2026-07-17T08:30:00.000Z');
  assert.equal(createdResult.server_payload_sha256, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(createdResult.server_created, true);
  assert.equal(createdResult.forge_order_number, 1001);
  assert.equal(createdResult.payload.forge_order_number, 1001);
  assert.equal(createdResult.server_upload_attempt_count, 1);
  assert.equal(createdResult.last_server_upload_error, null);
  assert.equal(createdResult.sync_status, 'pending');
  assert.equal(createdResult.production_status, orderStoreModule.PRODUCTION_STATUSES.readyToPack);
  assert.equal(createdResult.current_tray_number, 7);

  const idempotentResult = await store.markOrderServerUploadSuccess('success-order', {
    forgeOrderUuid: 'success-order',
    forgeOrderNumber: 1001,
    created: false,
    receivedAt: '2026-07-17T08:30:00.000Z',
    payloadSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  }, '2026-07-17T08:31:00.000Z');

  assert.equal(idempotentResult.server_created, false);
  assert.equal(idempotentResult.forge_order_number, 1001);
  assert.equal(idempotentResult.server_payload_sha256, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(idempotentResult.sync_status, 'pending');
  assert.equal(idempotentResult.current_tray_number, 7);
});

test('markOrderServerUploadSuccess rejects a mismatched UUID', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'uuid-match-order',
    payload: {
      forge_order_uuid: 'uuid-match-order',
      customer: { full_name: 'UUID Match' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  await assert.rejects(
    () => store.markOrderServerUploadSuccess('uuid-match-order', {
      forgeOrderUuid: 'different-order',
      created: true,
      receivedAt: '2026-07-17T08:40:00.000Z',
      payloadSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    }),
    /does not match/i
  );
});

test('markOrderServerUploadFailure records conflict or failed status, stores only safe error details, and preserves payload, sync_status, production, and tray data', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'failure-order',
    production_status: orderStoreModule.PRODUCTION_STATUSES.inProduction,
    current_tray_number: 4,
    server_upload_attempt_count: 2,
    last_server_upload_attempt_at: '2026-07-17T09:00:00.000Z',
    payload: {
      forge_order_uuid: 'failure-order',
      customer: { full_name: 'Sensitive Customer' },
      items: [{
        quantity: 2,
        completed_quantity: 1,
        production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.inProduction
      }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const conflictResult = await store.markOrderServerUploadFailure('failure-order', {
    code: 'uuid_conflict',
    message: 'Sensitive Customer should never persist here'
  }, '2026-07-17T09:05:00.000Z');

  assert.equal(conflictResult.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.conflict);
  assert.deepEqual(conflictResult.last_server_upload_error, {
    code: 'uuid_conflict',
    message: 'A different Forge order is already stored on the server for this UUID.'
  });
  assert.equal(conflictResult.sync_status, 'pending');
  assert.equal(conflictResult.production_status, orderStoreModule.PRODUCTION_STATUSES.inProduction);
  assert.equal(conflictResult.current_tray_number, 4);
  assert.equal(conflictResult.payload.customer.full_name, 'Sensitive Customer');

  const failedResult = await store.markOrderServerUploadFailure('failure-order', new Error('kmhemenway22@gmail.com raw server body'), '2026-07-17T09:10:00.000Z');
  assert.equal(failedResult.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.failed);
  assert.deepEqual(failedResult.last_server_upload_error, {
    code: 'server_upload_failed',
    message: 'Unable to store this order on the Forge server.'
  });
  assert.doesNotMatch(JSON.stringify(failedResult.last_server_upload_error), /Sensitive Customer|kmhemenway22@gmail\.com|raw server body/i);
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

test('existing local orders without an internal note remain readable and unchanged until explicitly updated', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-no-note',
    payload: {
      forge_order_uuid: 'order-no-note',
      customer: { full_name: 'Historical Customer' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const record = await store.getOrder('order-no-note');

  assert.equal(record.internal_note, null);
  assert.equal(record.has_internal_note, false);
  assert.equal(record.payload.customer.full_name, 'Historical Customer');
});

test('updateInternalNote changes only the intended local order note and preserves unrelated order fields', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    now: () => new Date('2026-07-27T16:45:00.000Z')
  });

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-note',
    forge_order_number: 1042,
    event_id: 'event-1',
    current_tray_number: 7,
    production_status: orderStoreModule.PRODUCTION_STATUSES.inProduction,
    payload: {
      forge_order_uuid: 'order-note',
      customer: { full_name: 'Kyle Hemenway' },
      fulfillment: { method: 'shipping' },
      items: [{ line_id: 'line-1', quantity: 2, completed_quantity: 1, production_status: 'in_production' }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const result = await store.updateInternalNote('order-note', 'Customer confirmed spelling.\nCall before shipping.');
  const updated = await store.getOrder('order-note');

  assert.equal(result.order.internal_note, 'Customer confirmed spelling.\nCall before shipping.');
  assert.equal(updated.internal_note, 'Customer confirmed spelling.\nCall before shipping.');
  assert.equal(updated.has_internal_note, true);
  assert.equal(updated.forge_order_uuid, 'order-note');
  assert.equal(updated.forge_order_number, 1042);
  assert.equal(updated.event_id, 'event-1');
  assert.equal(updated.current_tray_number, 7);
  assert.equal(updated.production_status, orderStoreModule.PRODUCTION_STATUSES.inProduction);
  assert.equal(updated.completed_item_count, 1);
  assert.equal(updated.payload.customer.full_name, 'Kyle Hemenway');
  assert.equal(updated.payload.fulfillment.method, 'shipping');
});

test('updateInternalNote clears blank local notes intentionally', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'order-clear-note',
    internal_note: 'Paid cash at show.',
    payload: {
      forge_order_uuid: 'order-clear-note',
      customer: { full_name: 'Meagan Smith' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 3000 }
    }
  }));

  const result = await store.updateInternalNote('order-clear-note', '   \n\t  ');

  assert.equal(result.order.internal_note, null);
  assert.equal(result.order.has_internal_note, false);
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

function createReadyToPackRecord(overrides = {}) {
  return createRecord({
    forge_order_uuid: 'ready-order',
    production_status: orderStoreModule.PRODUCTION_STATUSES.readyToPack,
    current_tray_number: 1,
    updated_at: '2026-07-16T22:00:00.000Z',
    total_item_count: 3,
    completed_item_count: 3,
    ready_to_pack_at: '2026-07-16T22:00:00.000Z',
    payload: {
      forge_order_uuid: 'ready-order',
      customer: { full_name: 'Ready Customer' },
      fulfillment: { method: 'shipping' },
      pricing: { estimated_total_cents: 9000 },
      items: [
        {
          line_number: 1,
          line_id: 'tree-line',
          product_display_name: 'Tree Ornament',
          quantity: 1,
          completed_quantity: 1,
          completed_at: '2026-07-16T21:50:00.000Z',
          production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.complete,
          structured_attributes: { family_name: 'Hemenway', year: '2026' },
          configuration_snapshot: { familyName: 'Hemenway', year: 2026 }
        },
        {
          line_number: 2,
          line_id: 'reindeer-line',
          product_display_name: 'Reindeer Ornament',
          quantity: 2,
          completed_quantity: 2,
          completed_at: '2026-07-16T22:00:00.000Z',
          production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.complete,
          structured_attributes: { family_name: 'Scout', year: '2026' },
          configuration_snapshot: { familyName: 'Scout', year: 2026 }
        }
      ]
    },
    ...overrides
  });
}

function createAssignedTrayRecord(overrides = {}) {
  return {
    tray_number: 1,
    tray_status: orderStoreModule.TRAY_STATUSES.assigned,
    current_order_uuid: 'ready-order',
    assigned_at: '2026-07-16T20:00:00.000Z',
    updated_at: '2026-07-16T20:00:00.000Z',
    ...overrides
  };
}

function createActiveAssignmentHistoryRecord(overrides = {}) {
  return {
    tray_assignment_id: 'assignment-ready-order',
    tray_number: 1,
    forge_order_uuid: 'ready-order',
    assigned_at: '2026-07-16T20:00:00.000Z',
    released_at: null,
    release_reason: null,
    ...overrides
  };
}

function createReadyPackingStore(options = {}) {
  return orderStoreModule.createInMemoryOrderStore({
    now: options.now || (() => new Date('2026-07-16T22:30:00.000Z')),
    randomUUID: options.randomUUID || (() => 'packing-verification-1'),
    initialOrders: [createReadyToPackRecord(options.orderOverrides)],
    initialTrays: [createAssignedTrayRecord(options.trayOverrides)],
    initialTrayAssignmentHistory: [createActiveAssignmentHistoryRecord(options.historyOverrides)],
    initialPackingVerifications: options.initialPackingVerifications || []
  });
}

class FakeIndexedDBFactory {
  constructor() {
    this.databases = new Map();
  }

  seedDatabase(name, version, seed) {
    const databaseState = {
      version,
      stores: new Map()
    };
    Object.entries(seed).forEach(([storeName, config]) => {
      const state = {
        keyPath: config.keyPath,
        data: new Map(),
        indexes: new Map()
      };
      (config.indexes || []).forEach((index) => {
        state.indexes.set(index.name, { keyPath: index.keyPath, unique: Boolean(index.unique) });
      });
      (config.records || []).forEach((record) => {
        state.data.set(record[config.keyPath], JSON.parse(JSON.stringify(record)));
      });
      databaseState.stores.set(storeName, state);
    });
    this.databases.set(name, databaseState);
  }

  getDatabaseState(name) {
    return this.databases.get(name);
  }

  open(name, version) {
    const request = {
      result: null,
      error: null,
      transaction: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
      onupgradeneeded: null
    };

    setTimeout(() => {
      let databaseState = this.databases.get(name);
      if (!databaseState) {
        databaseState = { version: 0, stores: new Map() };
        this.databases.set(name, databaseState);
      }

      const targetVersion = Number.isInteger(version) ? version : (databaseState.version || 1);
      const oldVersion = databaseState.version || 0;
      const needsUpgrade = oldVersion < targetVersion;
      const db = new FakeIDBDatabase(name, databaseState);
      request.result = db;

      if (needsUpgrade) {
        databaseState.version = targetVersion;
        const upgradeTransaction = new FakeIDBTransaction(databaseState, [...databaseState.stores.keys()]);
        request.transaction = upgradeTransaction;
        if (typeof request.onupgradeneeded === 'function') {
          request.onupgradeneeded({ oldVersion, newVersion: targetVersion, target: request });
        }
      }

      if (typeof request.onsuccess === 'function') {
        request.onsuccess({ target: request });
      }
    }, 0);

    return request;
  }
}

class BlockThenSucceedIndexedDBFactory {
  constructor(baseFactory) {
    this.baseFactory = baseFactory;
    this.openCount = 0;
  }

  open(name, version) {
    this.openCount += 1;
    if (this.openCount === 1) {
      const request = {
        result: null,
        error: null,
        transaction: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null
      };
      setTimeout(() => {
        if (typeof request.onblocked === 'function') {
          request.onblocked({ target: request });
        }
      }, 0);
      return request;
    }
    return this.baseFactory.open(name, version);
  }
}

class FakeIDBDatabase {
  constructor(name, state) {
    this.name = name;
    this._state = state;
    this.onversionchange = null;
    this.objectStoreNames = {
      contains: (storeName) => this._state.stores.has(storeName)
    };
  }

  createObjectStore(name, options = {}) {
    const storeState = {
      keyPath: options.keyPath,
      data: new Map(),
      indexes: new Map()
    };
    this._state.stores.set(name, storeState);
    return new FakeIDBObjectStore(null, storeState);
  }

  transaction(storeNames, mode) {
    return new FakeIDBTransaction(this._state, Array.isArray(storeNames) ? storeNames : [storeNames], mode);
  }

  close() {}
}

class FakeIDBTransaction {
  constructor(databaseState, storeNames, mode = 'readonly') {
    this._databaseState = databaseState;
    this._storeNames = storeNames;
    this.mode = mode;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this._pending = 0;
    this._aborted = false;
  }

  objectStore(name) {
    const storeState = this._databaseState.stores.get(name);
    if (!storeState) {
      throw new Error(`Unknown object store: ${name}`);
    }
    return new FakeIDBObjectStore(this, storeState);
  }

  _queueRequest(executor) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this._pending += 1;
    setTimeout(() => {
      if (this._aborted) {
        return;
      }
      try {
        request.result = cloneFakeIdbValue(executor());
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request });
        }
      } catch (error) {
        request.error = error;
        if (typeof request.onerror === 'function') {
          request.onerror({ target: request });
        }
      } finally {
        this._pending -= 1;
        this._scheduleComplete();
      }
    }, 0);
    return request;
  }

  _scheduleComplete() {
    setTimeout(() => {
      if (this._aborted || this._pending > 0) {
        return;
      }
      if (typeof this.oncomplete === 'function') {
        this.oncomplete({ target: this });
      }
    }, 0);
  }

  abort() {
    if (this._aborted) {
      return;
    }
    this._aborted = true;
    if (typeof this.onabort === 'function') {
      setTimeout(() => this.onabort({ target: this }), 0);
    }
  }
}

class FakeIDBObjectStore {
  constructor(transaction, state) {
    this.transaction = transaction;
    this._state = state;
    this.keyPath = state.keyPath;
    this.indexNames = {
      contains: (indexName) => this._state.indexes.has(indexName)
    };
  }

  createIndex(name, keyPath, options = {}) {
    this._state.indexes.set(name, { keyPath, unique: Boolean(options.unique) });
    return new FakeIDBIndex(this.transaction, this._state, this._state.indexes.get(name));
  }

  index(name) {
    const config = this._state.indexes.get(name);
    if (!config) {
      throw new Error(`Unknown index: ${name}`);
    }
    return new FakeIDBIndex(this.transaction, this._state, config);
  }

  get(key) {
    return this.transaction._queueRequest(() => this._state.data.get(key));
  }

  getAll() {
    return this.transaction._queueRequest(() => [...this._state.data.values()]);
  }

  add(record) {
    return this.transaction._queueRequest(() => this._write(record, true));
  }

  put(record) {
    return this.transaction._queueRequest(() => this._write(record, false));
  }

  _write(record, failIfExists) {
    const clone = cloneFakeIdbValue(record);
    const key = clone[this.keyPath];
    if (failIfExists && this._state.data.has(key)) {
      const error = new Error('ConstraintError');
      error.name = 'ConstraintError';
      throw error;
    }
    for (const [indexName, config] of this._state.indexes.entries()) {
      if (!config.unique) {
        continue;
      }
      const nextValue = clone[config.keyPath];
      for (const [existingKey, existingRecord] of this._state.data.entries()) {
        if (existingKey !== key && existingRecord[config.keyPath] === nextValue) {
          const error = new Error(`ConstraintError: ${indexName}`);
          error.name = 'ConstraintError';
          throw error;
        }
      }
    }
    this._state.data.set(key, clone);
    return clone;
  }
}

class FakeIDBIndex {
  constructor(transaction, storeState, config) {
    this.transaction = transaction;
    this._storeState = storeState;
    this._config = config;
  }

  get(query) {
    return this.transaction._queueRequest(() => [...this._storeState.data.values()].find((record) => record[this._config.keyPath] === query));
  }

  getAll(query) {
    return this.transaction._queueRequest(() => {
      const records = [...this._storeState.data.values()];
      if (typeof query === 'undefined') {
        return records;
      }
      return records.filter((record) => record[this._config.keyPath] === query);
    });
  }

  count(query) {
    return this.transaction._queueRequest(() => this.getAllSync(query).length);
  }

  getAllSync(query) {
    const records = [...this._storeState.data.values()];
    if (typeof query === 'undefined') {
      return records;
    }
    return records.filter((record) => record[this._config.keyPath] === query);
  }
}

function cloneFakeIdbValue(value) {
  return typeof value === 'undefined' ? undefined : JSON.parse(JSON.stringify(value));
}

test('version-2 database upgrades to version 3 without losing orders, trays, or assignment history and creates packing verification storage', async () => {
  const indexedDB = new FakeIndexedDBFactory();
  indexedDB.seedDatabase('forge-upgrade-test', 2, {
    orders: {
      keyPath: 'forge_order_uuid',
      indexes: [
        { name: 'submitted_at', keyPath: 'submitted_at' },
        { name: 'local_saved_at', keyPath: 'local_saved_at' },
        { name: 'status', keyPath: 'status' },
        { name: 'sync_status', keyPath: 'sync_status' },
        { name: 'event_id', keyPath: 'event_id' },
        { name: 'has_open_flags', keyPath: 'has_open_flags' },
        { name: 'production_status', keyPath: 'production_status' },
        { name: 'current_tray_number', keyPath: 'current_tray_number' }
      ],
      records: [createReadyToPackRecord()]
    },
    production_trays: {
      keyPath: 'tray_number',
      indexes: [
        { name: 'tray_status', keyPath: 'tray_status' },
        { name: 'current_order_uuid', keyPath: 'current_order_uuid' },
        { name: 'updated_at', keyPath: 'updated_at' }
      ],
      records: [createAssignedTrayRecord()]
    },
    tray_assignment_history: {
      keyPath: 'tray_assignment_id',
      indexes: [
        { name: 'forge_order_uuid', keyPath: 'forge_order_uuid' },
        { name: 'tray_number', keyPath: 'tray_number' },
        { name: 'released_at', keyPath: 'released_at' },
        { name: 'assigned_at', keyPath: 'assigned_at' }
      ],
      records: [createActiveAssignmentHistoryRecord()]
    }
  });

  const store = orderStoreModule.createOrderStore({
    indexedDB,
    databaseName: 'forge-upgrade-test'
  });

  await store.openOrderStore();
  const orders = await store.listOrders();
  const trays = await store.listTrays();
  const history = await store.listTrayAssignmentHistory();
  const packingVerifications = await store.listPackingVerifications();
  const databaseState = indexedDB.getDatabaseState('forge-upgrade-test');

  assert.equal(databaseState.version, orderStoreModule.DATABASE_VERSION);
  assert.equal(databaseState.stores.has(orderStoreModule.OBJECT_STORE_NAMES.packingVerifications), true);
  assert.equal(databaseState.stores.get(orderStoreModule.OBJECT_STORE_NAMES.packingVerifications).indexes.has(orderStoreModule.INDEX_NAMES.packingVerifications.forgeOrderUuid), true);
  assert.equal(databaseState.stores.get(orderStoreModule.OBJECT_STORE_NAMES.packingVerifications).indexes.has(orderStoreModule.INDEX_NAMES.packingVerifications.trayNumber), true);
  assert.equal(databaseState.stores.get(orderStoreModule.OBJECT_STORE_NAMES.packingVerifications).indexes.has(orderStoreModule.INDEX_NAMES.packingVerifications.verifiedAt), true);
  assert.equal(orders.length, 1);
  assert.equal(trays.length >= 1, true);
  assert.equal(history.length, 1);
  assert.equal(packingVerifications.length, 0);
  assert.equal(orders[0].forge_order_uuid, 'ready-order');
  assert.equal(trays.find((tray) => tray.tray_number === 1).current_order_uuid, 'ready-order');
  assert.equal(history[0].forge_order_uuid, 'ready-order');
});

test('getPackingVerificationForOrder resolves null when no record exists and the unique index miss does not hang', async () => {
  const store = createReadyPackingStore();
  const verification = await store.getPackingVerificationForOrder('ready-order');

  assert.equal(verification, null);
});

test('database-open failures reject cleanly and blocked opens can be retried after the cached promise resets', async () => {
  const failingIndexedDB = {
    open() {
      const request = {
        result: null,
        error: new Error('Open failed'),
        transaction: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null
      };
      setTimeout(() => {
        if (typeof request.onerror === 'function') {
          request.onerror({ target: request });
        }
      }, 0);
      return request;
    }
  };

  const failingStore = orderStoreModule.createOrderStore({
    indexedDB: failingIndexedDB,
    databaseName: 'forge-open-failure'
  });
  await assert.rejects(() => failingStore.getOrder('ready-order'), /unable to open the forge order database|open failed/i);
  await assert.rejects(() => failingStore.getPackingVerificationForOrder('ready-order'), /unable to open the forge order database|open failed/i);

  const baseIndexedDB = new FakeIndexedDBFactory();
  baseIndexedDB.seedDatabase('forge-block-retry', 3, {
    orders: {
      keyPath: 'forge_order_uuid',
      indexes: [
        { name: 'submitted_at', keyPath: 'submitted_at' },
        { name: 'local_saved_at', keyPath: 'local_saved_at' },
        { name: 'status', keyPath: 'status' },
        { name: 'sync_status', keyPath: 'sync_status' },
        { name: 'event_id', keyPath: 'event_id' },
        { name: 'has_open_flags', keyPath: 'has_open_flags' },
        { name: 'production_status', keyPath: 'production_status' },
        { name: 'current_tray_number', keyPath: 'current_tray_number' }
      ],
      records: [createReadyToPackRecord()]
    },
    production_trays: {
      keyPath: 'tray_number',
      indexes: [
        { name: 'tray_status', keyPath: 'tray_status' },
        { name: 'current_order_uuid', keyPath: 'current_order_uuid' },
        { name: 'updated_at', keyPath: 'updated_at' }
      ],
      records: [createAssignedTrayRecord()]
    },
    tray_assignment_history: {
      keyPath: 'tray_assignment_id',
      indexes: [
        { name: 'forge_order_uuid', keyPath: 'forge_order_uuid' },
        { name: 'tray_number', keyPath: 'tray_number' },
        { name: 'released_at', keyPath: 'released_at' },
        { name: 'assigned_at', keyPath: 'assigned_at' }
      ],
      records: [createActiveAssignmentHistoryRecord()]
    },
    packing_verifications: {
      keyPath: 'packing_verification_id',
      indexes: [
        { name: 'forge_order_uuid', keyPath: 'forge_order_uuid', unique: true },
        { name: 'tray_number', keyPath: 'tray_number' },
        { name: 'verified_at', keyPath: 'verified_at' }
      ],
      records: []
    }
  });

  const blockedIndexedDB = new BlockThenSucceedIndexedDBFactory(baseIndexedDB);
  const retryStore = orderStoreModule.createOrderStore({
    indexedDB: blockedIndexedDB,
    databaseName: 'forge-block-retry'
  });

  await assert.rejects(() => retryStore.getOrder('ready-order'), /blocked by another open tab/i);
  const order = await retryStore.getOrder('ready-order');
  const verification = await retryStore.getPackingVerificationForOrder('ready-order');

  assert.equal(order.forge_order_uuid, 'ready-order');
  assert.equal(verification, null);
});

test('completePackingVerification packs a valid ready order, records packing verification history, and releases the tray for reuse', async () => {
  const timestamps = [
    new Date('2026-07-16T22:30:00.000Z'),
    new Date('2026-07-16T23:00:00.000Z')
  ];
  let nowIndex = 0;
  const store = createReadyPackingStore({
    now: () => timestamps[Math.min(nowIndex++, timestamps.length - 1)],
    randomUUID: (() => {
      let count = 0;
      return () => `packing-verification-${++count}`;
    })()
  });

  const result = await store.completePackingVerification('ready-order', ['tree-line', 'reindeer-line'], '  Packed and sealed.  ');
  const packedOrder = await store.getOrder('ready-order');
  const tray = await store.getTray(1);
  const history = await store.listTrayAssignmentHistory();
  const packingVerification = await store.getPackingVerificationForOrder('ready-order');
  const packingVerifications = await store.listPackingVerifications();

  assert.equal(result.order.production_status, orderStoreModule.PRODUCTION_STATUSES.packed);
  assert.equal(result.order.current_tray_number, null);
  assert.equal(result.order.ready_to_pack_at, '2026-07-16T22:00:00.000Z');
  assert.equal(result.order.packed_at, '2026-07-16T22:30:00.000Z');
  assert.equal(result.packingVerification.verified_at, '2026-07-16T22:30:00.000Z');
  assert.equal(result.packingVerification.packing_note, 'Packed and sealed.');
  assert.deepEqual(result.packingVerification.verified_item_ids, ['tree-line', 'reindeer-line']);
  assert.equal(packedOrder.production_status, orderStoreModule.PRODUCTION_STATUSES.packed);
  assert.equal(packedOrder.current_tray_number, null);
  assert.equal(packedOrder.completed_item_count, 3);
  assert.equal(tray.tray_status, orderStoreModule.TRAY_STATUSES.available);
  assert.equal(tray.current_order_uuid, null);
  assert.equal(tray.assigned_at, null);
  assert.equal(history[0].released_at, '2026-07-16T22:30:00.000Z');
  assert.equal(history[0].release_reason, 'packed');
  assert.equal(packingVerification.tray_number, 1);
  assert.equal(packingVerification.packing_note, 'Packed and sealed.');
  assert.equal(packingVerifications.length, 1);

  await store.saveNewOrder(createRecord({
    forge_order_uuid: 'next-order',
    payload: {
      forge_order_uuid: 'next-order',
      customer: { full_name: 'Next Customer' },
      items: [{ quantity: 1 }],
      pricing: { estimated_total_cents: 2800 }
    }
  }));
  const reassignment = await store.assignTrayToOrder('next-order', 1);
  const updatedHistory = await store.listTrayAssignmentHistory();
  const verificationAfterReuse = await store.getPackingVerificationForOrder('ready-order');

  assert.equal(reassignment.tray.tray_number, 1);
  assert.equal(reassignment.order.current_tray_number, 1);
  assert.equal(updatedHistory.length, 2);
  assert.equal(updatedHistory.find((record) => record.tray_assignment_id === 'assignment-ready-order').release_reason, 'packed');
  assert.deepEqual(verificationAfterReuse.verified_item_ids, ['tree-line', 'reindeer-line']);
});

test('completePackingVerification trims optional notes, stores null for blank notes, and retrieves the verification by order UUID', async () => {
  const store = createReadyPackingStore({
    now: () => new Date('2026-07-16T22:45:00.000Z'),
    randomUUID: () => 'packing-verification-note-test'
  });

  await store.completePackingVerification('ready-order', ['tree-line', 'reindeer-line'], '   ');
  const verification = await store.getPackingVerificationForOrder('ready-order');

  assert.equal(verification.packing_note, null);
  assert.equal(verification.verified_at, '2026-07-16T22:45:00.000Z');
  assert.deepEqual(verification.verified_item_ids, ['tree-line', 'reindeer-line']);
});

test('completePackingVerification rejects non-ready lifecycle states and duplicate packing attempts', async () => {
  const submittedStore = createReadyPackingStore({
    orderOverrides: { production_status: orderStoreModule.PRODUCTION_STATUSES.submitted, current_tray_number: null }
  });
  await assert.rejects(() => submittedStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /only ready-to-pack orders can be packed|no longer has an assigned tray/i);

  const trayAssignedStore = createReadyPackingStore({
    orderOverrides: {
      production_status: orderStoreModule.PRODUCTION_STATUSES.trayAssigned,
      completed_item_count: 0,
      total_item_count: 3,
      payload: {
        ...createReadyToPackRecord().payload,
        items: [
          {
            ...createReadyToPackRecord().payload.items[0],
            completed_quantity: 0,
            completed_at: null,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.pending
          }
        ]
      }
    }
  });
  await assert.rejects(() => trayAssignedStore.completePackingVerification('ready-order', ['tree-line']), /every required item must be complete|only ready-to-pack orders can be packed/i);

  const inProductionStore = createReadyPackingStore({
    orderOverrides: {
      production_status: orderStoreModule.PRODUCTION_STATUSES.inProduction,
      payload: {
        ...createReadyToPackRecord().payload,
        items: [
          {
            ...createReadyToPackRecord().payload.items[0],
            completed_quantity: 0,
            completed_at: null,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.pending
          }
        ]
      }
    }
  });
  await assert.rejects(() => inProductionStore.completePackingVerification('ready-order', ['tree-line']), /every required item must be complete|only ready-to-pack orders can be packed/i);

  const packedStore = createReadyPackingStore({
    orderOverrides: { production_status: orderStoreModule.PRODUCTION_STATUSES.packed, packed_at: '2026-07-16T22:10:00.000Z', current_tray_number: null }
  });
  await assert.rejects(() => packedStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /already been packed/i);

  const shippedStore = createReadyPackingStore({
    orderOverrides: { production_status: orderStoreModule.PRODUCTION_STATUSES.shipped, packed_at: '2026-07-16T22:10:00.000Z', current_tray_number: null }
  });
  await assert.rejects(() => shippedStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /shipped orders cannot be packed again/i);

  const pickedUpStore = createReadyPackingStore({
    orderOverrides: { production_status: orderStoreModule.PRODUCTION_STATUSES.pickedUp, packed_at: '2026-07-16T22:10:00.000Z', current_tray_number: null }
  });
  await assert.rejects(() => pickedUpStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /picked-up orders cannot be packed again/i);

  const cancelledStore = createReadyPackingStore({
    orderOverrides: { production_status: orderStoreModule.PRODUCTION_STATUSES.cancelled, current_tray_number: null }
  });
  await assert.rejects(() => cancelledStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /cancelled orders cannot be packed/i);

  const duplicateStore = createReadyPackingStore({
    initialPackingVerifications: [{
      packing_verification_id: 'existing-packing-verification',
      forge_order_uuid: 'ready-order',
      tray_number: 1,
      verified_item_ids: ['tree-line', 'reindeer-line'],
      verified_at: '2026-07-16T22:15:00.000Z',
      packing_note: null
    }]
  });
  await assert.rejects(() => duplicateStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /already been packed/i);
});

test('completePackingVerification rejects incomplete, flagged, zero-item, missing-tray, tray-mismatch, and missing-history scenarios without mutating state', async () => {
  const incompleteStore = createReadyPackingStore({
    orderOverrides: {
      payload: {
        forge_order_uuid: 'ready-order',
        customer: { full_name: 'Ready Customer' },
        fulfillment: { method: 'shipping' },
        pricing: { estimated_total_cents: 9000 },
        items: [
          {
            line_number: 1,
            line_id: 'tree-line',
            product_display_name: 'Tree Ornament',
            quantity: 1,
            completed_quantity: 0,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.pending,
            structured_attributes: {}
          }
        ]
      }
    }
  });
  await assert.rejects(() => incompleteStore.completePackingVerification('ready-order', ['tree-line']), /only ready-to-pack orders can be packed|every required item must be complete/i);
  assert.equal((await incompleteStore.getOrder('ready-order')).current_tray_number, 1);
  assert.equal((await incompleteStore.getTray(1)).tray_status, orderStoreModule.TRAY_STATUSES.assigned);
  assert.equal((await incompleteStore.listPackingVerifications()).length, 0);

  const flaggedStore = createReadyPackingStore({
    orderOverrides: {
      has_open_flags: true,
      payload: {
        forge_order_uuid: 'ready-order',
        customer: { full_name: 'Ready Customer' },
        fulfillment: { method: 'shipping' },
        open_flags: [{ code: 'needs_check', message: 'Needs check' }],
        pricing: { estimated_total_cents: 9000 },
        items: createReadyToPackRecord().payload.items
      }
    }
  });
  await assert.rejects(() => flaggedStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /resolve open flags/i);

  const noTrayStore = createReadyPackingStore({
    orderOverrides: { current_tray_number: null }
  });
  await assert.rejects(() => noTrayStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /only ready-to-pack orders can be packed|no longer has an assigned tray/i);

  const trayMismatchStore = createReadyPackingStore({
    trayOverrides: { current_order_uuid: 'different-order' }
  });
  await assert.rejects(() => trayMismatchStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /assigned to a different order/i);

  const missingHistoryStore = orderStoreModule.createInMemoryOrderStore({
    initialOrders: [createReadyToPackRecord()],
    initialTrays: [createAssignedTrayRecord()]
  });
  await assert.rejects(() => missingHistoryStore.completePackingVerification('ready-order', ['tree-line', 'reindeer-line']), /active assignment record/i);

  const zeroItemStore = createReadyPackingStore({
    orderOverrides: {
      payload: {
        forge_order_uuid: 'ready-order',
        customer: { full_name: 'Ready Customer' },
        fulfillment: { method: 'shipping' },
        pricing: { estimated_total_cents: 0 },
        items: [
          {
            line_number: 1,
            line_id: 'cancelled-line',
            product_display_name: 'Cancelled Item',
            quantity: 1,
            completed_quantity: 1,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.cancelled,
            structured_attributes: {}
          }
        ]
      }
    }
  });
  await assert.rejects(() => zeroItemStore.completePackingVerification('ready-order', []), /no active items to verify/i);
});

test('completePackingVerification rejects missing, unknown, and duplicate verified line ids and excludes cancelled items from required verification', async () => {
  const store = createReadyPackingStore({
    orderOverrides: {
      payload: {
        ...createReadyToPackRecord().payload,
        items: [
          ...createReadyToPackRecord().payload.items,
          {
            line_number: 3,
            line_id: 'cancelled-line',
            product_display_name: 'Cancelled Ornament',
            quantity: 1,
            completed_quantity: 1,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.cancelled,
            structured_attributes: {}
          }
        ]
      }
    }
  });

  await assert.rejects(() => store.completePackingVerification('ready-order', ['tree-line']), /verify every required item/i);
  await assert.rejects(() => store.completePackingVerification('ready-order', ['tree-line', 'reindeer-line', 'unknown-line']), /only expected tray items can be verified/i);
  await assert.rejects(() => store.completePackingVerification('ready-order', ['tree-line', 'tree-line', 'reindeer-line']), /only be submitted once/i);

  const result = await store.completePackingVerification('ready-order', ['tree-line', 'reindeer-line'], null);
  assert.deepEqual(result.packingVerification.verified_item_ids, ['tree-line', 'reindeer-line']);
});

test('quantity-two lines must be fully complete before packing and checked line ids verify whole physical quantities', async () => {
  const incompleteQuantityStore = createReadyPackingStore({
    orderOverrides: {
      payload: {
        ...createReadyToPackRecord().payload,
        items: [
          {
            line_number: 1,
            line_id: 'reindeer-line',
            product_display_name: 'Reindeer Ornament',
            quantity: 2,
            completed_quantity: 1,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.inProduction,
            structured_attributes: {}
          }
        ]
      },
      total_item_count: 2,
      completed_item_count: 1
    }
  });

  await assert.rejects(() => incompleteQuantityStore.completePackingVerification('ready-order', ['reindeer-line']), /only ready-to-pack orders can be packed|every required item must be complete/i);

  const completeQuantityStore = createReadyPackingStore({
    orderOverrides: {
      payload: {
        forge_order_uuid: 'ready-order',
        customer: { full_name: 'Ready Customer' },
        fulfillment: { method: 'pickup' },
        pricing: { estimated_total_cents: 2600 },
        items: [
          {
            line_number: 1,
            line_id: 'reindeer-line',
            product_display_name: 'Reindeer Ornament',
            quantity: 2,
            completed_quantity: 2,
            production_status: orderStoreModule.ITEM_PRODUCTION_STATUSES.complete,
            completed_at: '2026-07-16T22:00:00.000Z',
            structured_attributes: {}
          }
        ]
      },
      total_item_count: 2,
      completed_item_count: 2
    }
  });

  const result = await completeQuantityStore.completePackingVerification('ready-order', ['reindeer-line'], null);
  assert.deepEqual(result.packingVerification.verified_item_ids, ['reindeer-line']);
  assert.equal(result.order.completed_item_count, 2);
  assert.equal(result.order.total_item_count, 2);
});

test('local shipping export preview filters one event and reports missing address fields without including pickup or test-session rows', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    initialOrders: [
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'ship-1',
        forge_order_number: 1101,
        submitted_at: '2026-07-27T16:00:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        payload: {
          forge_order_uuid: 'ship-1',
          forge_order_number: 1101,
          customer: { full_name: 'Shipping Customer', email: 'ship@example.com', phone: '555-111-2222' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '123 Main Street',
              address_2: '',
              city: 'Austin',
              state: 'TX',
              postal_code: '78701',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event',
            event_start_date: '2026-07-27',
            event_end_date: '2026-07-27',
            event_location: 'Austin'
          },
          items: [{ line_id: 'line-1', quantity: 2, product_display_name: 'Tree Ornament' }]
        }
      }),
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'ship-2',
        forge_order_number: 1102,
        submitted_at: '2026-07-27T16:05:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        payload: {
          forge_order_uuid: 'ship-2',
          forge_order_number: 1102,
          customer: { full_name: 'Missing Postal', email: 'missing@example.com', phone: '555-333-4444' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '500 Pine Street',
              address_2: '',
              city: 'Austin',
              state: 'TX',
              postal_code: '',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event',
            event_start_date: '2026-07-27',
            event_end_date: '2026-07-27',
            event_location: 'Austin'
          },
          items: [{ line_id: 'line-2', quantity: 1, product_display_name: 'Reindeer Ornament' }]
        }
      }),
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'pickup-1',
        forge_order_number: 1103,
        submitted_at: '2026-07-27T16:10:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        payload: {
          forge_order_uuid: 'pickup-1',
          forge_order_number: 1103,
          customer: { full_name: 'Pickup Customer' },
          fulfillment: { method: 'pickup', shipping_address: null },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event'
          },
          items: [{ line_id: 'line-3', quantity: 1, product_display_name: 'Tree Ornament' }]
        }
      }),
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'test-1',
        forge_order_number: 1104,
        submitted_at: '2026-07-27T16:15:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        payload: {
          forge_order_uuid: 'test-1',
          forge_order_number: 1104,
          customer: { full_name: 'Test Session Customer' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '9 Demo Way',
              address_2: '',
              city: 'Austin',
              state: 'TX',
              postal_code: '78702',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'test_session'
          },
          items: [{ line_id: 'line-4', quantity: 1, product_display_name: 'Tree Ornament' }]
        }
      }),
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'cancelled-1',
        forge_order_number: 1105,
        submitted_at: '2026-07-27T16:20:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.cancelled,
        payload: {
          forge_order_uuid: 'cancelled-1',
          forge_order_number: 1105,
          customer: { full_name: 'Cancelled Customer' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '44 Closed Street',
              address_2: '',
              city: 'Austin',
              state: 'TX',
              postal_code: '78703',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event'
          },
          items: [{ line_id: 'line-5', quantity: 1, product_display_name: 'Tree Ornament' }]
        }
      })
    ]
  });

  const preview = await store.previewShippingExport('event-live-1');

  assert.equal(preview.included_count, 1);
  assert.equal(preview.excluded_count, 1);
  assert.equal(preview.shipping_order_count, 2);
  assert.equal(preview.included_orders[0].order_reference, 'Order 1101');
  assert.deepEqual(preview.excluded_orders[0].missing_fields, ['postal_code']);
});

test('local shipping export csv includes only complete shipping rows for the selected event', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    initialOrders: [
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'ship-1',
        forge_order_number: 1101,
        submitted_at: '2026-07-27T16:00:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        payload: {
          forge_order_uuid: 'ship-1',
          forge_order_number: 1101,
          customer: { full_name: 'Shipping Customer', email: 'ship@example.com' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '123 Main Street',
              address_2: '',
              city: 'Austin',
              state: 'TX',
              postal_code: '78701',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event',
            event_start_date: '2026-07-27'
          },
          items: [{ line_id: 'line-1', quantity: 1, product_display_name: 'Tree Ornament' }]
        }
      })
    ]
  });

  const result = await store.generateShippingExportCsv('event-live-1');

  assert.match(result.filename, /^forge-shipping-export-austin-market-2026-07-27\.csv$/);
  assert.match(result.csv, /Forge Order Number,Customer Name,Address Line 1/);
  assert.match(result.csv, /1101,Shipping Customer,123 Main Street/);
});

test('local shipping export csv neutralizes spreadsheet formulas preserves csv escaping and excludes deleted tombstoned orders', async () => {
  const store = orderStoreModule.createInMemoryOrderStore({
    initialOrders: [
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'ship-safe-1',
        forge_order_number: 1111,
        submitted_at: '2026-07-27T16:00:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        internal_note: 'private note',
        current_tray_number: 3,
        payload: {
          forge_order_uuid: 'ship-safe-1',
          forge_order_number: 1111,
          customer: { full_name: '=Formula Name', email: '+ship@example.com', phone: '@555-111-2222' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '123 Main Street',
              address_2: 'Apt 2B,\nNorth Hall',
              city: 'Austin',
              state: 'TX',
              postal_code: '78701',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'live_event',
            event_start_date: '2026-07-27'
          },
          pricing: { estimated_total_cents: 2600 },
          items: [{
            line_id: 'line-safe-1',
            quantity: 1,
            product_display_name: 'Tree Ornament',
            personalization_order: [{ position: 1, name: 'Kyle' }]
          }]
        }
      }),
      orderStoreModule.normalizeLocalOrderRecord({
        forge_order_uuid: 'ship-safe-2',
        forge_order_number: 1112,
        submitted_at: '2026-07-27T16:05:00.000Z',
        production_status: orderStoreModule.PRODUCTION_STATUSES.submitted,
        payload: {
          forge_order_uuid: 'ship-safe-2',
          forge_order_number: 1112,
          customer: { full_name: 'Deleted Test Customer' },
          fulfillment: {
            method: 'shipping',
            shipping_address: {
              address_1: '500 Pine Street',
              address_2: '',
              city: 'Austin',
              state: 'TX',
              postal_code: '78702',
              country: 'United States'
            }
          },
          event: {
            event_id: 'event-live-1',
            event_name: 'Austin Market',
            event_type: 'test_session'
          },
          items: [{ line_id: 'line-safe-2', quantity: 1, product_display_name: 'Tree Ornament' }]
        }
      })
    ]
  });

  await store.deleteTestOrder('ship-safe-2', 'DELETE TEST ORDER');
  const result = await store.generateShippingExportCsv('event-live-1');

  assert.match(result.csv, /Forge Order Number,Customer Name,Address Line 1,Address Line 2,City,State,Postal Code,Country,Email,Phone,Item Count,Event Name,Submitted At/);
  assert.match(result.csv, /'=Formula Name/);
  assert.match(result.csv, /'\+ship@example\.com/);
  assert.match(result.csv, /'@555-111-2222/);
  assert.match(result.csv, /"Apt 2B,\nNorth Hall"/);
  assert.doesNotMatch(result.csv, /private note/);
  assert.doesNotMatch(result.csv, /2600/);
  assert.doesNotMatch(result.csv, /Kyle/);
  assert.doesNotMatch(result.csv, /Deleted Test Customer/);
});
