const test = require('node:test');
const assert = require('node:assert/strict');

const staffApiClientModule = require('../public/js/forge-staff-api-client.js');

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('checkSession sends same-origin credentials safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          authenticated: false
        }
      });
    }
  });

  const result = await client.checkSession();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/session.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
});

test('login sends POST JSON and same-origin credentials without leaking the pin to the URL', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          authenticated: true
        }
      });
    }
  });

  const result = await client.login('2468');

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/login.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), { pin: '2468' });
  assert.doesNotMatch(requests[0].url, /2468/);
});

test('logout sends POST and same-origin credentials', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          authenticated: false
        }
      });
    }
  });

  const result = await client.logout();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/logout.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('listOrders sends GET and same-origin credentials and returns orders safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          orders: [{ forge_order_uuid: 'order-1' }],
          total_count: 1,
          limit: 50,
          offset: 0
        }
      });
    }
  });

  const result = await client.listOrders();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, true);
  assert.deepEqual(result.orders, [{ forge_order_uuid: 'order-1' }]);
  assert.equal(result.totalCount, 1);
  assert.equal(result.limit, 50);
  assert.equal(result.offset, 0);
  assert.equal(requests[0].url, '/api/v1/staff/orders.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('401 responses are handled safely as unauthenticated results', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url) => {
      if (url.endsWith('/session.php')) {
        return createJsonResponse(401, {
          application: 'Forge',
          api_version: '1',
          status: 'error',
          error: {
            code: 'authentication_required',
            message: 'Staff authentication is required.'
          }
        });
      }
      return createJsonResponse(401, {
        application: 'Forge',
        api_version: '1',
        status: 'error',
        error: {
          code: 'invalid_credentials',
          message: 'Invalid staff credentials.'
        }
      });
    }
  });

  const sessionResult = await client.checkSession();
  const loginResult = await client.login('1234');
  const ordersResult = await client.listOrders();

  assert.deepEqual(sessionResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(loginResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(ordersResult, { ok: false, authenticated: false, unauthenticated: true, orders: [] });
});

test('malformed or non-JSON responses produce a safe generic client error', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError('Unexpected token < in JSON with raw HTML body');
      }
    })
  });

  await assert.rejects(
    () => client.listOrders(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.message, 'The Forge staff server returned an unexpected response.');
      assert.doesNotMatch(error.message, /Unexpected token|raw HTML body/i);
      return true;
    }
  );
});

test('PIN values are not included in safe client errors', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => createJsonResponse(500, {
      application: 'Forge',
      api_version: '1',
      status: 'error',
      error: {
        code: 'server_error',
        message: 'Server problem while checking PIN 2468'
      }
    })
  });

  await assert.rejects(
    () => client.login('2468'),
    (error) => {
      assert.equal(error.code, 'server_error');
      assert.doesNotMatch(error.message, /2468/);
      return true;
    }
  );
});
