const test = require('node:test');
const assert = require('node:assert/strict');

const staffOrdersRuntime = require('../public/js/forge-staff-orders-runtime.js');
const queueHelpers = require('../public/js/forge-local-orders-queue.js');

test('hosted staff entry checks session before revealing order data', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async checkSession() {
        calls.push('checkSession');
        return { ok: true, authenticated: true };
      },
      async listOrders() {
        calls.push('listOrders');
        return { ok: true, authenticated: true, orders: [] };
      }
    }
  });

  const access = await runtime.checkAccess();

  assert.deepEqual(access, {
    ok: true,
    authenticated: true,
    requiresAuthentication: true,
    nextScreen: 'staff-orders',
    dataSource: 'server',
    readOnly: true
  });
  assert.deepEqual(calls, ['checkSession']);
});

test('unauthenticated hosted session resolves to the staff PIN screen', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async checkSession() {
        return { ok: false, authenticated: false, unauthenticated: true };
      }
    }
  });

  const access = await runtime.checkAccess();

  assert.deepEqual(access, {
    ok: true,
    authenticated: false,
    requiresAuthentication: true,
    nextScreen: 'staff-access',
    dataSource: 'server',
    readOnly: true
  });
});

test('valid PIN opens the hosted staff queue safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async checkSession() {
        return { ok: true, authenticated: false };
      },
      async login(pin) {
        assert.equal(pin, '2468');
        return { ok: true, authenticated: true };
      }
    }
  });

  const result = await runtime.login('2468');

  assert.deepEqual(result, {
    ok: true,
    authenticated: true,
    requiresAuthentication: true,
    nextScreen: 'staff-orders',
    dataSource: 'server',
    readOnly: true
  });
});

test('invalid PIN stays on the staff PIN screen with a safe error', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async checkSession() {
        return { ok: true, authenticated: false };
      },
      async login() {
        return { ok: false, authenticated: false, unauthenticated: true };
      }
    }
  });

  const result = await runtime.login('1357');

  assert.equal(result.ok, false);
  assert.equal(result.authenticated, false);
  assert.equal(result.nextScreen, 'staff-access');
  assert.equal(result.errorMessage, 'Incorrect PIN.');
  assert.doesNotMatch(result.errorMessage, /1357/);
});

test('localhost uses the local IndexedDB queue without calling hosted auth endpoints', async () => {
  const calls = [];
  const localRecords = [{ forge_order_uuid: 'local-1' }];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    localOrderStore: {
      async listOrders() {
        calls.push('listOrders');
        return localRecords;
      }
    },
    staffApiClient: {
      async checkSession() {
        calls.push('checkSession');
        return { ok: true, authenticated: true };
      }
    }
  });

  const access = await runtime.checkAccess();
  const load = await runtime.loadOrders();

  assert.equal(access.dataSource, 'local');
  assert.equal(access.authenticated, true);
  assert.equal(load.dataSource, 'local');
  assert.equal(load.readOnly, false);
  assert.deepEqual(load.records, localRecords);
  assert.deepEqual(calls, ['listOrders']);
});

test('authenticated hosted session loads adapted server orders', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async checkSession() {
        return { ok: true, authenticated: true };
      },
      async listOrders() {
        return {
          ok: true,
          authenticated: true,
          totalCount: 2,
          limit: 50,
          offset: 0,
          orders: [
            {
              forge_order_uuid: 'order-2',
              submitted_at: '2026-07-18T13:00:00Z',
              received_at: '2026-07-18T13:05:00Z',
              updated_at: '2026-07-18T13:05:00Z',
              payload_sha256: 'abc123',
              payload: { customer: { full_name: 'Meagan' }, items: [] }
            },
            {
              forge_order_uuid: 'order-3',
              forge_order_number: 1001,
              submitted_at: '2026-07-18T14:00:00Z',
              received_at: '2026-07-18T14:05:00Z',
              updated_at: '2026-07-18T14:05:00Z',
              payload_sha256: 'def456',
              production_status: 'tray_assigned',
              current_tray_number: 12,
              payload: { customer: { full_name: 'Kyle' }, items: [] }
            }
          ]
        };
      }
    }
  });

  const result = await runtime.loadOrders();

  assert.equal(result.ok, true);
  assert.equal(result.dataSource, 'server');
  assert.equal(result.readOnly, true);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].forge_order_uuid, 'order-3');
  assert.equal(result.records[0].forge_order_number, 1001);
  assert.equal(result.records[0].payload.forge_order_number, 1001);
  assert.equal(result.records[0].sync_status, 'synced');
  assert.equal(result.records[0].staff_read_only, true);
  assert.equal(result.records[0].production_status, 'tray_assigned');
  assert.equal(result.records[0].current_tray_number, 12);
  assert.equal(result.records[0].staff_can_assign_tray, false);
  assert.equal(result.records[1].forge_order_uuid, 'order-2');
  assert.equal(result.records[1].production_status, 'submitted');
  assert.equal(result.records[1].current_tray_number, null);
  assert.equal(result.records[1].staff_can_assign_tray, true);
  assert.deepEqual(result.records[1].payload, { customer: { full_name: 'Meagan' }, items: [] });
});

test('hosted runtime loads multiple order pages and a ready-to-pack order beyond the first page reaches the final queue', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders(options) {
        calls.push({ ...options });
        if (options.offset === 0) {
          return {
            ok: true,
            authenticated: true,
            totalCount: 51,
            limit: 50,
            offset: 0,
            orders: Array.from({ length: 50 }, (_, index) => ({
              forge_order_uuid: `order-${index + 1}`,
              submitted_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
              received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:30Z`,
              production_status: 'submitted',
              payload: { customer: { full_name: `Customer ${index + 1}` }, items: [] }
            }))
          };
        }

        return {
          ok: true,
          authenticated: true,
          totalCount: 51,
          limit: 50,
          offset: 50,
          orders: [
            {
              forge_order_uuid: 'order-51',
              submitted_at: '2026-07-20T11:00:00Z',
              received_at: '2026-07-20T11:00:30Z',
              production_status: 'ready_to_pack',
              current_tray_number: 9,
              total_item_count: 1,
              completed_item_count: 1,
              ready_to_pack_at: '2026-07-20T11:00:00Z',
              payload: {
                customer: { full_name: 'Ready Customer' },
                items: [
                  {
                    line_id: 'line-51',
                    quantity: 1,
                    completed_quantity: 1,
                    production_status: 'complete',
                    product_display_name: 'Tree Ornament'
                  }
                ]
              }
            }
          ]
        };
      }
    }
  });

  const result = await runtime.loadOrders();
  const readyRecords = queueHelpers.filterReadyToPackOrders(result.records);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, [
    { limit: 50, offset: 0 },
    { limit: 50, offset: 50 }
  ]);
  assert.equal(result.records.length, 51);
  assert.deepEqual(readyRecords.map((record) => record.forge_order_uuid), ['order-51']);
});

test('hosted runtime does not request a second page when total_count fits within the first page', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders(options) {
        calls.push({ ...options });
        return {
          ok: true,
          authenticated: true,
          totalCount: 2,
          limit: 50,
          offset: 0,
          orders: [
            {
              forge_order_uuid: 'order-a',
              submitted_at: '2026-07-20T09:00:00Z',
              received_at: '2026-07-20T09:00:30Z',
              payload: { items: [] }
            },
            {
              forge_order_uuid: 'order-b',
              submitted_at: '2026-07-20T09:01:00Z',
              received_at: '2026-07-20T09:01:30Z',
              payload: { items: [] }
            }
          ]
        };
      }
    }
  });

  const result = await runtime.loadOrders();

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { limit: 50, offset: 0 });
  assert.equal(result.records.length, 2);
});

test('hosted runtime deduplicates repeated UUIDs while continuing to later new orders', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders(options) {
        calls.push({ ...options });
        if (options.offset === 0) {
          return {
            ok: true,
            authenticated: true,
            totalCount: 75,
            limit: 50,
            offset: 0,
            orders: Array.from({ length: 50 }, (_, index) => ({
              forge_order_uuid: `order-${index + 1}`,
              submitted_at: '2026-07-20T10:00:00Z',
              received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
              payload: { items: [] }
            }))
          };
        }

        return {
          ok: true,
          authenticated: true,
          totalCount: 75,
          limit: 50,
          offset: 50,
          orders: [
            ...Array.from({ length: 25 }, (_, index) => ({
              forge_order_uuid: `order-${index + 1}`,
              submitted_at: '2026-07-20T10:00:00Z',
              received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
              payload: { items: [] }
            })),
            ...Array.from({ length: 25 }, (_, index) => ({
              forge_order_uuid: `order-${index + 51}`,
              submitted_at: '2026-07-20T11:00:00Z',
              received_at: `2026-07-20T11:${String(index).padStart(2, '0')}:00Z`,
              payload: { items: [] }
            }))
          ]
        };
      }
    }
  });

  const result = await runtime.loadOrders();

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(result.records.length, 75);
  assert.deepEqual(result.records.map((record) => record.forge_order_uuid).slice(0, 3), ['order-75', 'order-74', 'order-73']);
});

test('a later hosted order page with only duplicate UUIDs fails safely when total_count has not been reached', async () => {
  let calls = 0;
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders(options) {
        calls += 1;
        if (options.offset === 0) {
          return {
            ok: true,
            authenticated: true,
            totalCount: 120,
            limit: 50,
            offset: 0,
            orders: Array.from({ length: 50 }, (_, index) => ({
              forge_order_uuid: `order-${index + 1}`,
              submitted_at: '2026-07-20T10:00:00Z',
              received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
              payload: { items: [] }
            }))
          };
        }
        return {
          ok: true,
          authenticated: true,
          totalCount: 120,
          limit: 50,
          offset: 50,
          orders: Array.from({ length: 50 }, (_, index) => ({
            forge_order_uuid: `order-${index + 1}`,
            submitted_at: '2026-07-20T10:00:00Z',
            received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
            payload: { items: [] }
          }))
        };
      }
    }
  });

  await assert.rejects(
    () => runtime.loadOrders(),
    new RegExp(staffOrdersRuntime.HOSTED_ORDERS_INCOMPLETE_LOAD_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.equal(calls, 2);
});

test('a later hosted order page failure rejects instead of presenting a partial queue', async () => {
  let calls = 0;
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders(options) {
        calls += 1;
        if (options.offset === 0) {
          return {
            ok: true,
            authenticated: true,
            totalCount: 51,
            limit: 50,
            offset: 0,
            orders: Array.from({ length: 50 }, (_, index) => ({
              forge_order_uuid: `order-${index + 1}`,
              submitted_at: '2026-07-20T10:00:00Z',
              received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
              payload: { items: [] }
            }))
          };
        }
        throw new Error('Second page failed');
      }
    }
  });

  await assert.rejects(() => runtime.loadOrders(), /Second page failed/);
  assert.equal(calls, 2);
});

test('an empty later hosted order page fails safely when total_count has not been reached', async () => {
  let calls = 0;
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders(options) {
        calls += 1;
        if (options.offset === 0) {
          return {
            ok: true,
            authenticated: true,
            totalCount: 60,
            limit: 50,
            offset: 0,
            orders: Array.from({ length: 50 }, (_, index) => ({
              forge_order_uuid: `order-${index + 1}`,
              submitted_at: '2026-07-20T10:00:00Z',
              received_at: `2026-07-20T10:${String(index).padStart(2, '0')}:00Z`,
              payload: { items: [] }
            }))
          };
        }
        return {
          ok: true,
          authenticated: true,
          totalCount: 60,
          limit: 50,
          offset: 50,
          orders: []
        };
      }
    }
  });

  await assert.rejects(
    () => runtime.loadOrders(),
    new RegExp(staffOrdersRuntime.HOSTED_ORDERS_INCOMPLETE_LOAD_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.equal(calls, 2);
});

test('401 while loading hosted orders is handled as a normal unauthenticated state', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders() {
        return { ok: false, authenticated: false, unauthenticated: true, orders: [] };
      }
    }
  });

  const result = await runtime.loadOrders();

  assert.deepEqual(result, {
    ok: false,
    authenticated: false,
    unauthenticated: true,
    dataSource: 'server',
    readOnly: true,
    records: []
  });
});

test('retrying hosted loads re-runs the same server request path', async () => {
  let attempts = 0;
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listOrders() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Temporary network issue');
        }
        return { ok: true, authenticated: true, totalCount: 0, limit: 50, offset: 0, orders: [] };
      }
    }
  });

  await assert.rejects(() => runtime.loadOrders(), /Temporary network issue/);
  const retryResult = await runtime.loadOrders();

  assert.equal(attempts, 2);
  assert.equal(retryResult.ok, true);
  assert.deepEqual(retryResult.records, []);
});

test('server-order adaptation preserves payload order and removes duplicate UUID entries', () => {
  const records = staffOrdersRuntime.adaptServerOrdersForQueue([
    {
      forge_order_uuid: 'order-1',
      submitted_at: '2026-07-18T10:00:00Z',
      received_at: '2026-07-18T10:05:00Z',
      payload: {
        items: [
          { product_display_name: 'Tree Ornament', quantity: 1 },
          { product_display_name: 'Reindeer Ornament', quantity: 1 }
        ]
      }
    },
    {
      forge_order_uuid: 'order-1',
      submitted_at: '2026-07-18T10:00:00Z',
      received_at: '2026-07-18T10:05:00Z',
      payload: {
        items: [
          { product_display_name: 'Duplicate Tree Ornament', quantity: 9 }
        ]
      }
    }
  ]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0].payload.items, [
    { product_display_name: 'Tree Ornament', quantity: 1 },
    { product_display_name: 'Reindeer Ornament', quantity: 1 }
  ]);
});

test('hosted tray loading sorts tray numbers numerically and preserves unavailable states', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async listTrays() {
        return {
          ok: true,
          authenticated: true,
          trays: [
            { tray_number: 12, tray_status: 'assigned', current_order_uuid: 'order-12' },
            { tray_number: 2, tray_status: 'available', current_order_uuid: null },
            { tray_number: 7, tray_status: 'out_of_service', current_order_uuid: null }
          ]
        };
      }
    }
  });

  const result = await runtime.loadTrays();

  assert.equal(result.ok, true);
  assert.deepEqual(result.trays.map((tray) => tray.tray_number), [2, 7, 12]);
  assert.deepEqual(result.trays.map((tray) => tray.tray_status), ['available', 'out_of_service', 'assigned']);
});

test('hosted tray assignment returns the updated server-backed order and tray state', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async assignTray(forgeOrderUuid, trayNumber) {
        assert.equal(forgeOrderUuid, 'order-9');
        assert.equal(trayNumber, 4);
        return {
          ok: true,
          authenticated: true,
          alreadyAssigned: false,
          order: {
            forge_order_uuid: 'order-9',
            submitted_at: '2026-07-20T10:00:00Z',
            received_at: '2026-07-20T10:05:00Z',
            updated_at: '2026-07-20T10:06:00Z',
            production_status: 'tray_assigned',
            current_tray_number: 4,
            payload: { customer: { full_name: 'Meagan' }, items: [] }
          },
          tray: {
            tray_number: 4,
            tray_status: 'assigned',
            current_order_uuid: 'order-9',
            assigned_at: '2026-07-20T10:06:00Z',
            updated_at: '2026-07-20T10:06:00Z'
          },
          assignmentHistory: {
            tray_assignment_id: 'assignment-9',
            tray_number: 4,
            forge_order_uuid: 'order-9',
            assigned_at: '2026-07-20T10:06:00Z',
            released_at: null,
            release_reason: null
          }
        };
      }
    }
  });

  const result = await runtime.assignTrayToOrder('order-9', 4);

  assert.equal(result.ok, true);
  assert.equal(result.order.production_status, 'tray_assigned');
  assert.equal(result.order.current_tray_number, 4);
  assert.equal(result.order.staff_can_assign_tray, false);
  assert.equal(result.tray.tray_number, 4);
  assert.equal(result.assignmentHistory.tray_assignment_id, 'assignment-9');
});

test('hosted item completion returns the updated shared order safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async completeItemQuantity(orderUuid, lineId, expectedCompletedQuantity, targetCompletedQuantity) {
        assert.equal(orderUuid, 'order-10');
        assert.equal(lineId, 'line-1');
        assert.equal(expectedCompletedQuantity, 0);
        assert.equal(targetCompletedQuantity, 1);
        return {
          ok: true,
          authenticated: true,
          alreadyApplied: false,
          order: {
            forge_order_uuid: 'order-10',
            submitted_at: '2026-07-20T10:00:00Z',
            received_at: '2026-07-20T10:05:00Z',
            updated_at: '2026-07-20T10:06:00Z',
            production_status: 'ready_to_pack',
            current_tray_number: 8,
            total_item_count: 1,
            completed_item_count: 1,
            ready_to_pack_at: '2026-07-20T10:06:00Z',
            has_open_flags: false,
            payload: {
              customer: { full_name: 'Kyle' },
              items: [
                {
                  line_id: 'line-1',
                  quantity: 1,
                  completed_quantity: 1,
                  production_status: 'complete'
                }
              ]
            }
          },
          item: {
            line_id: 'line-1',
            quantity: 1,
            completed_quantity: 1,
            production_status: 'complete'
          }
        };
      }
    }
  });

  const result = await runtime.completeItemQuantity('order-10', 'line-1', 0, 1);

  assert.equal(result.ok, true);
  assert.equal(result.order.production_status, 'ready_to_pack');
  assert.equal(result.order.completed_item_count, 1);
  assert.equal(result.order.total_item_count, 1);
  assert.equal(result.order.staff_can_complete_items, false);
  assert.equal(result.item.production_status, 'complete');
});

test('hosted internal note updates return the refreshed shared order safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async updateInternalNote(orderUuid, internalNote) {
        assert.equal(orderUuid, 'order-11');
        assert.equal(internalNote, 'Customer confirmed spelling.\nCall before shipping.');
        return {
          ok: true,
          authenticated: true,
          internalNote: 'Customer confirmed spelling.\nCall before shipping.',
          order: {
            forge_order_uuid: 'order-11',
            submitted_at: '2026-07-20T10:00:00Z',
            received_at: '2026-07-20T10:05:00Z',
            updated_at: '2026-07-20T10:07:00Z',
            internal_note: 'Customer confirmed spelling.\nCall before shipping.',
            has_internal_note: true,
            production_status: 'tray_assigned',
            current_tray_number: 6,
            payload: { customer: { full_name: 'Kyle' }, items: [] }
          }
        };
      }
    }
  });

  const result = await runtime.updateInternalNote('order-11', 'Customer confirmed spelling.\nCall before shipping.');

  assert.equal(result.ok, true);
  assert.equal(result.internalNote, 'Customer confirmed spelling.\nCall before shipping.');
  assert.equal(result.order.internal_note, 'Customer confirmed spelling.\nCall before shipping.');
  assert.equal(result.order.has_internal_note, true);
  assert.equal(result.order.current_tray_number, 6);
});

test('hosted cancellation returns the refreshed shared order and released tray safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async cancelOrder(orderUuid) {
        assert.equal(orderUuid, 'order-12');
        return {
          ok: true,
          authenticated: true,
          order: {
            forge_order_uuid: 'order-12',
            forge_order_number: 1042,
            submitted_at: '2026-07-20T10:00:00Z',
            received_at: '2026-07-20T10:05:00Z',
            updated_at: '2026-07-20T10:09:00Z',
            production_status: 'cancelled',
            current_tray_number: null,
            cancelled_at: '2026-07-20T10:09:00Z',
            internal_note: 'Customer confirmed spelling.',
            has_internal_note: true,
            payload: {
              customer: { full_name: 'Kyle' },
              event: { event_type: 'live_event', event_name: 'Austin Market' },
              items: []
            }
          },
          tray: {
            tray_number: 6,
            tray_status: 'available',
            current_order_uuid: null
          },
          assignmentHistory: {
            tray_assignment_id: 'assignment-12',
            forge_order_uuid: 'order-12',
            tray_number: 6,
            released_at: '2026-07-20T10:09:00Z',
            release_reason: 'cancelled'
          }
        };
      }
    }
  });

  const result = await runtime.cancelOrder('order-12');

  assert.equal(result.ok, true);
  assert.equal(result.order.production_status, 'cancelled');
  assert.equal(result.order.current_tray_number, null);
  assert.equal(result.order.cancelled_at, '2026-07-20T10:09:00Z');
  assert.equal(result.tray.tray_number, 6);
  assert.equal(result.assignmentHistory.release_reason, 'cancelled');
});

test('localhost test-order deletion stays on the local order-store path without hosted requests', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    localOrderStore: {
      async deleteTestOrder(forgeOrderUuid, confirmationText) {
        calls.push(['deleteTestOrder', forgeOrderUuid, confirmationText]);
        return {
          deletedOrderUuid: forgeOrderUuid,
          deletedOrderNumber: 1007,
          releasedTrayNumber: 8
        };
      }
    },
    staffApiClient: {
      async deleteTestOrder() {
        calls.push(['hostedDeleteTestOrder']);
        throw new Error('hosted client should not be called');
      }
    }
  });

  const result = await runtime.deleteTestOrder('order-local-test', 'DELETE TEST ORDER');

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, false);
  assert.equal(result.deletedOrderUuid, 'order-local-test');
  assert.equal(result.deletedOrderNumber, 1007);
  assert.equal(result.releasedTrayNumber, 8);
  assert.deepEqual(calls, [['deleteTestOrder', 'order-local-test', 'DELETE TEST ORDER']]);
});

test('hosted legacy cleanup preview returns the protected and eligible order snapshot safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async previewLegacyTestCleanup() {
        return {
          ok: true,
          authenticated: true,
          preview: {
            cutoffTimezone: 'America/Chicago',
            cutoffLocal: '2026-07-25T00:00:00-05:00',
            cutoffUtc: '2026-07-25T05:00:00+00:00',
            eligibleCount: 2,
            confirmationText: 'DELETE 2 ORDERS BEFORE JULY 25',
            previewSignature: 'preview-signature-1',
            eligibleOrders: [{ forge_order_uuid: 'legacy-order-1', order_reference: 'Order 1001' }],
            protectedOrders: [{ forge_order_uuid: 'live-order-1', order_reference: 'Order 1042' }]
          }
        };
      }
    }
  });

  const result = await runtime.previewLegacyTestCleanup();

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.preview.eligibleCount, 2);
  assert.equal(result.preview.confirmationText, 'DELETE 2 ORDERS BEFORE JULY 25');
  assert.deepEqual(result.preview.protectedOrders, [{ forge_order_uuid: 'live-order-1', order_reference: 'Order 1042' }]);
});

test('hosted legacy cleanup apply returns the deleted count and released tray numbers safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async applyLegacyTestCleanup(previewSignature, expectedCount, confirmationText) {
        assert.equal(previewSignature, 'preview-signature-1');
        assert.equal(expectedCount, 2);
        assert.equal(confirmationText, 'DELETE 2 ORDERS BEFORE JULY 25');
        return {
          ok: true,
          authenticated: true,
          deletedCount: 2,
          releasedTrayNumbers: [4, 8],
          deletedOrderUuids: ['legacy-order-1', 'legacy-order-2']
        };
      }
    }
  });

  const result = await runtime.applyLegacyTestCleanup('preview-signature-1', 2, 'DELETE 2 ORDERS BEFORE JULY 25');

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.deletedCount, 2);
  assert.deepEqual(result.releasedTrayNumbers, [4, 8]);
  assert.deepEqual(result.deletedOrderUuids, ['legacy-order-1', 'legacy-order-2']);
});

test('hosted shipping export preview returns the selected event summary and address review safely', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      async previewShippingExport(eventId) {
        assert.equal(eventId, 'event-live-1');
        return {
          ok: true,
          authenticated: true,
          preview: {
            event: {
              event_id: 'event-live-1',
              event_name: 'Austin Market',
              event_type: 'live_event',
              start_date: '2026-07-27',
              end_date: '2026-07-27',
              event_status: 'active'
            },
            includedCount: 1,
            excludedCount: 1,
            shippingOrderCount: 2,
            hasExportableRows: true,
            csvFilename: 'forge-shipping-export-austin-market-2026-07-27.csv',
            includedOrders: [{ forge_order_uuid: 'ship-1', order_reference: 'Order 1101' }],
            excludedOrders: [{ forge_order_uuid: 'ship-2', missing_fields: ['postal_code'] }]
          }
        };
      }
    }
  });

  const result = await runtime.previewShippingExport('event-live-1');

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.preview.includedCount, 1);
  assert.equal(result.preview.excludedOrders[0].missing_fields[0], 'postal_code');
});

test('hosted shipping export download returns the authenticated CSV endpoint without fetching data into runtime memory', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'https:', hostname: 'forge.example.com' },
    staffApiClient: {
      getShippingExportDownloadUrl(eventId) {
        assert.equal(eventId, 'event-live-1');
        return `/api/v1/staff/shipping-export-download.php?event_id=${eventId}`;
      }
    }
  });

  const result = await runtime.buildShippingExportDownload('event-live-1');

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.downloadUrl, '/api/v1/staff/shipping-export-download.php?event_id=event-live-1');
  assert.equal(result.csvText, null);
});

test('terminal or later production statuses remain preserved and never reopen tray assignment in hosted mode', async () => {
  const records = staffOrdersRuntime.adaptServerOrdersForQueue([
    {
      forge_order_uuid: 'order-packed',
      submitted_at: '2026-07-20T10:00:00Z',
      received_at: '2026-07-20T10:01:00Z',
      production_status: 'packed',
      payload: { items: [] }
    },
    {
      forge_order_uuid: 'order-cancelled',
      submitted_at: '2026-07-20T10:00:00Z',
      received_at: '2026-07-20T10:02:00Z',
      production_status: 'cancelled',
      payload: { items: [] }
    },
    {
      forge_order_uuid: 'order-shipped',
      submitted_at: '2026-07-20T10:00:00Z',
      received_at: '2026-07-20T10:03:00Z',
      production_status: 'shipped',
      payload: { items: [] }
    },
    {
      forge_order_uuid: 'order-picked-up',
      submitted_at: '2026-07-20T10:00:00Z',
      received_at: '2026-07-20T10:04:00Z',
      production_status: 'picked_up',
      payload: { items: [] }
    }
  ]);

  assert.deepEqual(
    records.map((record) => record.production_status),
    ['picked_up', 'shipped', 'cancelled', 'packed']
  );
  assert.deepEqual(
    records.map((record) => record.staff_can_assign_tray),
    [false, false, false, false]
  );
});

test('localhost item completion keeps the existing IndexedDB behavior', async () => {
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    localOrderStore: {
      async incrementOrderItemCompletion(orderUuid, lineId) {
        assert.equal(orderUuid, 'local-order');
        assert.equal(lineId, 'local-line');
        return {
          alreadyComplete: false,
          order: { forge_order_uuid: 'local-order', production_status: 'in_production' },
          item: { line_id: 'local-line', completed_quantity: 1, production_status: 'in_production' }
        };
      }
    }
  });

  const result = await runtime.completeItemQuantity('local-order', 'local-line', 0, 1);

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, false);
  assert.equal(result.order.production_status, 'in_production');
  assert.equal(result.item.completed_quantity, 1);
});

test('localhost tray assignment stays on the local order-store path without hosted requests', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    localOrderStore: {
      async assignTrayToOrder(forgeOrderUuid, trayNumber) {
        calls.push(['assignTrayToOrder', forgeOrderUuid, trayNumber]);
        return {
          already_assigned: false,
          order: { forge_order_uuid: forgeOrderUuid, payload: { customer: { full_name: 'Kyle' } } },
          tray: { tray_number: trayNumber, tray_status: 'assigned' },
          assignment_history: { tray_assignment_id: 'assignment-local' }
        };
      }
    },
    staffApiClient: {
      async assignTray() {
        calls.push(['assignTray']);
        throw new Error('hosted client should not be called');
      }
    }
  });

  const result = await runtime.assignTrayToOrder('order-local', 5);

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, false);
  assert.deepEqual(calls, [['assignTrayToOrder', 'order-local', 5]]);
  assert.equal(result.tray.tray_number, 5);
});

test('localhost internal note updates stay on the local order-store path without hosted requests', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    localOrderStore: {
      async updateInternalNote(forgeOrderUuid, internalNote) {
        calls.push(['updateInternalNote', forgeOrderUuid, internalNote]);
        return {
          order: {
            forge_order_uuid: forgeOrderUuid,
            internal_note: internalNote,
            has_internal_note: true,
            payload: { customer: { full_name: 'Kyle' }, items: [] }
          }
        };
      }
    },
    staffApiClient: {
      async updateInternalNote() {
        calls.push(['hostedUpdateInternalNote']);
        throw new Error('hosted client should not be called');
      }
    }
  });

  const result = await runtime.updateInternalNote('order-local', 'Paid cash at show.');

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, false);
  assert.equal(result.order.internal_note, 'Paid cash at show.');
  assert.deepEqual(calls, [['updateInternalNote', 'order-local', 'Paid cash at show.']]);
});

test('localhost legacy cleanup stays unsupported and never calls the hosted cleanup endpoints', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    staffApiClient: {
      async previewLegacyTestCleanup() {
        calls.push('previewLegacyTestCleanup');
        throw new Error('hosted cleanup preview should not be called');
      },
      async applyLegacyTestCleanup() {
        calls.push('applyLegacyTestCleanup');
        throw new Error('hosted cleanup apply should not be called');
      }
    }
  });

  const previewResult = await runtime.previewLegacyTestCleanup();
  const applyResult = await runtime.applyLegacyTestCleanup('preview-signature-1', 2, 'DELETE 2 ORDERS BEFORE JULY 25');

  assert.deepEqual(previewResult, {
    ok: false,
    authenticated: true,
    unsupported: true,
    dataSource: 'local',
    readOnly: false
  });
  assert.deepEqual(applyResult, {
    ok: false,
    authenticated: true,
    unsupported: true,
    dataSource: 'local',
    readOnly: false
  });
  assert.deepEqual(calls, []);
});

test('localhost shipping export preview and csv stay on the local order-store path without hosted requests', async () => {
  const calls = [];
  const runtime = staffOrdersRuntime.createStaffOrdersRuntime({
    locationLike: { protocol: 'http:', hostname: 'localhost' },
    localOrderStore: {
      async previewShippingExport(eventId) {
        calls.push(['previewShippingExport', eventId]);
        return {
          event: { event_id: eventId, event_name: 'Austin Market' },
          included_count: 1,
          excluded_count: 0,
          shipping_order_count: 1,
          has_exportable_rows: true,
          csv_filename: 'forge-shipping-export-austin-market-2026-07-27.csv',
          included_orders: [{ forge_order_uuid: 'ship-1' }],
          excluded_orders: []
        };
      },
      async generateShippingExportCsv(eventId) {
        calls.push(['generateShippingExportCsv', eventId]);
        return {
          filename: 'forge-shipping-export-austin-market-2026-07-27.csv',
          csv: 'Forge Order Number,Customer Name\r\n1101,Shipping Customer'
        };
      }
    },
    staffApiClient: {
      async previewShippingExport() {
        calls.push(['hostedPreviewShippingExport']);
        throw new Error('hosted client should not be called');
      }
    }
  });

  const preview = await runtime.previewShippingExport('event-live-1');
  const download = await runtime.buildShippingExportDownload('event-live-1');

  assert.equal(preview.ok, true);
  assert.equal(preview.readOnly, false);
  assert.equal(preview.preview.included_count, 1);
  assert.equal(download.ok, true);
  assert.equal(download.readOnly, false);
  assert.match(download.csvText, /Shipping Customer/);
  assert.deepEqual(calls, [
    ['previewShippingExport', 'event-live-1'],
    ['generateShippingExportCsv', 'event-live-1']
  ]);
});
