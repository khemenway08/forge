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
