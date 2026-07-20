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
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].forge_order_uuid, 'order-2');
  assert.equal(result.records[0].sync_status, 'synced');
  assert.equal(result.records[0].staff_read_only, true);
  assert.deepEqual(result.records[0].payload, { customer: { full_name: 'Meagan' }, items: [] });
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
