const test = require('node:test');
const assert = require('node:assert/strict');

const apiClientModule = require('../public/js/forge-api-client.js');

function createOrderPayload(overrides = {}) {
  return {
    payload_type: 'forge_order',
    schema_version: '1.0',
    forge_order_uuid: '123e4567-e89b-42d3-a456-426614174000',
    forge_order_number: null,
    order_status: 'submitted',
    source: 'customer_kiosk',
    built_at: '2026-07-17T12:00:00+00:00',
    submitted_at: '2026-07-17T12:00:01+00:00',
    device_id: 'ipad-test-1',
    event: {
      event_id: 'event-demo',
      event_name: 'Demo Market'
    },
    currency: 'USD',
    customer: {
      full_name: 'Test Customer',
      email: 'test@example.invalid'
    },
    fulfillment: {
      method: 'shipping',
      shipping_address: {
        address_1: '123 Demo Street',
        address_2: '',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        country: 'United States'
      }
    },
    items: [
      {
        line_id: '123e4567-e89b-42d3-a456-426614174000-line-1',
        line_number: 1,
        quantity: 1,
        product_definition_id: 'tree_ornament',
        product_display_name: 'Tree Ornament',
        product_category: 'ornament',
        product_definition_version: '1.0',
        pricing: {
          mode: 'fixed',
          final_unit_price_cents: 2600
        },
        configuration_snapshot: {
          familyName: 'Demo',
          year: '2026'
        },
        personalization_order: [
          { position: 1, type: 'person', name: 'Pat' },
          { position: 2, type: 'pet', name: 'Scout', icon: 'paw' }
        ],
        structured_attributes: {
          family_name: 'Demo'
        },
        open_flags: [],
        customer_note: null,
        production_note: null
      }
    ],
    pricing: {
      estimated_total_cents: 2600
    },
    open_flags: [],
    has_open_flags: false,
    ...overrides
  };
}

test('module exports without making an automatic request', () => {
  assert.equal(typeof apiClientModule.createForgeApiClient, 'function');
  assert.equal(typeof apiClientModule.ForgeApiError, 'function');
});

test('submitOrder exists', () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse({
      application: 'Forge',
      api_version: '1',
      status: 'ok',
      server_time: '2026-07-17T12:00:00+00:00'
    })
  });

  assert.equal(typeof client.submitOrder, 'function');
});

test('default client requests /api/v1/health.php', async () => {
  const calls = [];
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse({
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        server_time: '2026-07-17T12:00:00+00:00'
      });
    }
  });

  await client.checkHealth();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/v1/health.php');
});

test('custom baseUrl is normalized correctly', async () => {
  let requestedUrl = '';
  const client = apiClientModule.createForgeApiClient({
    baseUrl: '/custom/api/v1/',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return createJsonResponse({
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        server_time: '2026-07-17T12:00:00+00:00'
      });
    }
  });

  await client.checkHealth();

  assert.equal(requestedUrl, '/custom/api/v1/health.php');
});

test('GET request uses Accept application/json, same-origin credentials, and no-store cache', async () => {
  let requestOptions = null;
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return createJsonResponse({
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        server_time: '2026-07-17T12:00:00+00:00'
      });
    }
  });

  await client.checkHealth();

  assert.equal(requestOptions.method, 'GET');
  assert.equal(requestOptions.headers.Accept, 'application/json');
  assert.equal(requestOptions.credentials, 'same-origin');
  assert.equal(requestOptions.cache, 'no-store');
});

test('a valid 200 health response returns the normalized result', async () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse({
      application: 'Forge',
      api_version: '1',
      status: 'ok',
      server_time: '2026-07-17T12:00:00+00:00'
    })
  });

  const result = await client.checkHealth();

  assert.deepEqual(result, {
    ok: true,
    application: 'Forge',
    apiVersion: '1',
    status: 'ok',
    serverTime: '2026-07-17T12:00:00+00:00'
  });
});

test('a non-success HTTP response produces http_error', async () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ ignored: true })
    })
  });

  await assert.rejects(
    () => client.checkHealth(),
    (error) => {
      assert.equal(error.code, 'http_error');
      assert.equal(error.status, 503);
      assert.equal(error.message, 'The Forge server returned an unexpected response.');
      assert.equal(Object.prototype.hasOwnProperty.call(error, 'body'), false);
      return true;
    }
  );
});

test('invalid JSON produces invalid_response', async () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      }
    })
  });

  await assert.rejects(
    () => client.checkHealth(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.message, 'The Forge server returned an unexpected response.');
      return true;
    }
  );
});

test('missing or incorrect required response fields produce invalid_response', async () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse({
      application: 'Forge',
      api_version: '2',
      status: 'ok',
      server_time: 'not-a-date'
    })
  });

  await assert.rejects(
    () => client.checkHealth(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('a rejected fetch produces network_error', async () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => {
      throw new Error('socket closed');
    }
  });

  await assert.rejects(
    () => client.checkHealth(),
    (error) => {
      assert.equal(error.code, 'network_error');
      assert.equal(error.message, 'The Forge server could not be reached.');
      return true;
    }
  );
});

test('an aborted timeout produces timeout', async () => {
  const previousAbortController = globalThis.AbortController;
  const abortSignals = [];

  class MockAbortController {
    constructor() {
      this.signal = { aborted: false };
    }

    abort() {
      this.signal.aborted = true;
      abortSignals.push(this.signal);
    }
  }

  globalThis.AbortController = MockAbortController;

  try {
    const client = apiClientModule.createForgeApiClient({
      timeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((resolve, reject) => {
        setTimeout(() => {
          if (options.signal.aborted) {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
            return;
          }
          resolve(createJsonResponse({
            application: 'Forge',
            api_version: '1',
            status: 'ok',
            server_time: '2026-07-17T12:00:00+00:00'
          }));
        }, 15);
      })
    });

    await assert.rejects(
      () => client.checkHealth(),
      (error) => {
        assert.equal(error.code, 'timeout');
        assert.equal(error.message, 'The Forge server did not respond in time.');
        return true;
      }
    );

    assert.equal(abortSignals.length, 1);
    assert.equal(abortSignals[0].aborted, true);
  } finally {
    globalThis.AbortController = previousAbortController;
  }
});

test('errors do not contain a raw response body', async () => {
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => '<html>fatal</html>',
      json: async () => ({ html: '<html>fatal</html>' })
    })
  });

  await assert.rejects(
    () => client.checkHealth(),
    (error) => {
      assert.equal(String(error).includes('<html>fatal</html>'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(error, 'responseBody'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(error, 'rawBody'), false);
      return true;
    }
  );
});

test('submitOrder POSTs to /api/v1/orders.php', async () => {
  const payload = createOrderPayload();
  const calls = [];
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 201);
    }
  });

  await client.submitOrder(payload);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/v1/orders.php');
});

test('submitOrder custom baseUrl is respected', async () => {
  const payload = createOrderPayload();
  let requestedUrl = '';
  const client = apiClientModule.createForgeApiClient({
    baseUrl: '/custom/api/v1/',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 201);
    }
  });

  await client.submitOrder(payload);

  assert.equal(requestedUrl, '/custom/api/v1/orders.php');
});

test('submitOrder uses Accept application/json, Content-Type application/json, same-origin credentials, and no-store cache', async () => {
  const payload = createOrderPayload();
  let requestOptions = null;
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 201);
    }
  });

  await client.submitOrder(payload);

  assert.equal(requestOptions.method, 'POST');
  assert.equal(requestOptions.headers.Accept, 'application/json');
  assert.equal(requestOptions.headers['Content-Type'], 'application/json');
  assert.equal(requestOptions.credentials, 'same-origin');
  assert.equal(requestOptions.cache, 'no-store');
});

test('submitOrder serializes the complete supplied payload without mutation', async () => {
  const payload = createOrderPayload();
  const before = JSON.stringify(payload);
  let requestBody = '';
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async (_url, options) => {
      requestBody = options.body;
      return createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 201);
    }
  });

  await client.submitOrder(payload);

  assert.equal(requestBody, before);
  assert.equal(JSON.stringify(payload), before);
});

test('valid HTTP 201 response normalizes created true', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 201)
  });

  const result = await client.submitOrder(payload);

  assert.deepEqual(result, {
    ok: true,
    forgeOrderUuid: payload.forge_order_uuid,
    created: true,
    receivedAt: '2026-07-17T12:00:02+00:00',
    payloadSha256: 'a'.repeat(64)
  });
});

test('valid HTTP 200 response normalizes created false', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, false), 200)
  });

  const result = await client.submitOrder(payload);

  assert.equal(result.created, false);
});

test('unexpected success status produces invalid_response', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 202)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('idempotent response preserves received_at', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, false), 200)
  });

  const result = await client.submitOrder(payload);

  assert.equal(result.receivedAt, '2026-07-17T12:00:02+00:00');
});

test('submitted UUID and returned UUID must match', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createOrderSuccessEnvelope('123e4567-e89b-42d3-a456-426614174999', true), 201)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('invalid hash format produces invalid_response', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse({
      application: 'Forge',
      api_version: '1',
      status: 'ok',
      data: {
        forge_order_uuid: payload.forge_order_uuid,
        created: true,
        received_at: '2026-07-17T12:00:02+00:00',
        payload_sha256: 'not-a-valid-hash'
      }
    }, 201)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('invalid received_at produces invalid_response', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse({
      application: 'Forge',
      api_version: '1',
      status: 'ok',
      data: {
        forge_order_uuid: payload.forge_order_uuid,
        created: true,
        received_at: 'not-a-date',
        payload_sha256: 'b'.repeat(64)
      }
    }, 201)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('missing data object produces invalid_response', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse({
      application: 'Forge',
      api_version: '1',
      status: 'ok'
    }, 201)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('HTTP 409 uuid_conflict preserves the safe error code', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createErrorEnvelope(
      'uuid_conflict',
      'An order with this identifier is already stored with different information.'
    ), 409)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'uuid_conflict');
      assert.equal(error.status, 409);
      return true;
    }
  );
});

test('HTTP 422 invalid_order preserves the safe error code', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createErrorEnvelope(
      'invalid_order',
      'The submitted order is missing required Forge fields.'
    ), 422)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_order');
      assert.equal(error.status, 422);
      return true;
    }
  );
});

test('HTTP 503 storage_unavailable preserves the safe error code', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => createJsonResponse(createErrorEnvelope(
      'storage_unavailable',
      'Forge order storage is currently unavailable.'
    ), 503)
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'storage_unavailable');
      assert.equal(error.status, 503);
      return true;
    }
  );
});

test('malformed server JSON produces invalid_response', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => ({
      ok: true,
      status: 201,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      }
    })
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      return true;
    }
  );
});

test('HTML/non-JSON failure does not expose the response body', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => '<html>fatal</html>'
    })
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(String(error).includes('<html>fatal</html>'), false);
      return true;
    }
  );
});

test('network failure produces network_error', async () => {
  const payload = createOrderPayload();
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => {
      throw new Error('socket closed');
    }
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'network_error');
      return true;
    }
  );
});

test('timeout produces timeout', async () => {
  const payload = createOrderPayload();
  const previousAbortController = globalThis.AbortController;
  const abortSignals = [];

  class MockAbortController {
    constructor() {
      this.signal = { aborted: false };
    }

    abort() {
      this.signal.aborted = true;
      abortSignals.push(this.signal);
    }
  }

  globalThis.AbortController = MockAbortController;

  try {
    const client = apiClientModule.createForgeApiClient({
      timeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((resolve, reject) => {
        setTimeout(() => {
          if (options.signal.aborted) {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
            return;
          }
          resolve(createJsonResponse(createOrderSuccessEnvelope(payload.forge_order_uuid, true), 201));
        }, 15);
      })
    });

    await assert.rejects(
      () => client.submitOrder(payload),
      (error) => {
        assert.equal(error.code, 'timeout');
        return true;
      }
    );

    assert.equal(abortSignals.length, 1);
    assert.equal(abortSignals[0].aborted, true);
  } finally {
    globalThis.AbortController = previousAbortController;
  }
});

test('missing payload is rejected without making a request', async () => {
  let callCount = 0;
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => {
      callCount += 1;
      return createJsonResponse({});
    }
  });

  await assert.rejects(
    () => client.submitOrder(),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      return true;
    }
  );

  assert.equal(callCount, 0);
});

test('non-object payload is rejected without making a request', async () => {
  let callCount = 0;
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => {
      callCount += 1;
      return createJsonResponse({});
    }
  });

  await assert.rejects(
    () => client.submitOrder('not-an-object'),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      return true;
    }
  );

  assert.equal(callCount, 0);
});

test('serialization failure is handled safely', async () => {
  let callCount = 0;
  const payload = {};
  payload.self = payload;
  const client = apiClientModule.createForgeApiClient({
    fetchImpl: async () => {
      callCount += 1;
      return createJsonResponse({});
    }
  });

  await assert.rejects(
    () => client.submitOrder(payload),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      assert.equal(error.message, 'The Forge order could not be prepared for upload.');
      return true;
    }
  );

  assert.equal(callCount, 0);
});

function createOrderSuccessEnvelope(forgeOrderUuid, created) {
  return {
    application: 'Forge',
    api_version: '1',
    status: 'ok',
    data: {
      forge_order_uuid: forgeOrderUuid,
      created,
      received_at: '2026-07-17T12:00:02+00:00',
      payload_sha256: 'a'.repeat(64)
    }
  };
}

function createErrorEnvelope(code, message) {
  return {
    application: 'Forge',
    api_version: '1',
    status: 'error',
    error: {
      code,
      message
    }
  };
}

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
