const test = require('node:test');
const assert = require('node:assert/strict');

const apiClientModule = require('../public/js/forge-api-client.js');

test('module exports without making an automatic request', () => {
  assert.equal(typeof apiClientModule.createForgeApiClient, 'function');
  assert.equal(typeof apiClientModule.ForgeApiError, 'function');
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

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  };
}
