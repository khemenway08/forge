const test = require('node:test');
const assert = require('node:assert/strict');

const staffOrdersRuntime = require('../public/js/forge-staff-orders-runtime.js');

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
        return { ok: true, authenticated: true, orders: [] };
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
