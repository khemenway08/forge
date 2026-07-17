(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeApiClient = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1';
  const DEFAULT_TIMEOUT_MS = 8000;
  const HEALTH_ENDPOINT = 'health.php';

  class ForgeApiError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ForgeApiError';
      this.code = code;
      if (Number.isInteger(options.status)) {
        this.status = options.status;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }

  function createForgeApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const fetchImpl = resolveFetchImplementation(options.fetchImpl);

    async function checkHealth() {
      const controller = createAbortController();
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const response = await performHealthRequest(fetchImpl, baseUrl, controller);
        const payload = await parseHealthResponse(response);
        return normalizeHealthPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }
    }

    return {
      checkHealth
    };
  }

  async function performHealthRequest(fetchImpl, baseUrl, controller) {
    const requestOptions = {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      credentials: 'same-origin',
      cache: 'no-store'
    };

    if (controller) {
      requestOptions.signal = controller.signal;
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}/${HEALTH_ENDPOINT}`, requestOptions);
    } catch (error) {
      if (isAbortError(error)) {
        throw new ForgeApiError('timeout', 'The Forge server did not respond in time.', { cause: error });
      }
      throw new ForgeApiError('network_error', 'The Forge server could not be reached.', { cause: error });
    }

    if (!response || typeof response.ok !== 'boolean') {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
    }

    if (!response.ok) {
      throw new ForgeApiError('http_error', 'The Forge server returned an unexpected response.', {
        status: Number.isInteger(response.status) ? response.status : undefined
      });
    }

    return response;
  }

  async function parseHealthResponse(response) {
    if (typeof response.json !== 'function') {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
    }

    try {
      return await response.json();
    } catch (error) {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.', { cause: error });
    }
  }

  function normalizeHealthPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const serverTime = asTrimmedString(payload && payload.server_time);

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || !isValidIsoDate(serverTime)) {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
    }

    return {
      ok: true,
      application,
      apiVersion,
      status,
      serverTime
    };
  }

  function normalizeClientError(error) {
    if (error instanceof ForgeApiError) {
      return error;
    }

    if (isAbortError(error)) {
      return new ForgeApiError('timeout', 'The Forge server did not respond in time.', { cause: error });
    }

    if (error instanceof SyntaxError) {
      return new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.', { cause: error });
    }

    if (error instanceof Error) {
      return new ForgeApiError('unavailable', 'The Forge server is currently unavailable.', { cause: error });
    }

    return new ForgeApiError('unavailable', 'The Forge server is currently unavailable.');
  }

  function resolveFetchImplementation(fetchImpl) {
    if (typeof fetchImpl === 'function') {
      return fetchImpl;
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      return globalThis.fetch.bind(globalThis);
    }
    throw new ForgeApiError('unavailable', 'The Forge server is currently unavailable.');
  }

  function normalizeBaseUrl(baseUrl) {
    const trimmed = asTrimmedString(baseUrl);
    if (!trimmed) {
      return DEFAULT_BASE_URL;
    }
    return trimmed.replace(/\/+$/, '');
  }

  function normalizeTimeoutMs(timeoutMs) {
    const numericTimeout = Number(timeoutMs);
    if (!Number.isFinite(numericTimeout) || numericTimeout <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.round(numericTimeout);
  }

  function createAbortController() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.AbortController === 'function') {
      return new globalThis.AbortController();
    }
    return null;
  }

  function isAbortError(error) {
    return Boolean(error) && (
      error.name === 'AbortError'
      || error.code === 'ABORT_ERR'
      || error.code === 20
    );
  }

  function isValidIsoDate(value) {
    const normalized = asTrimmedString(value);
    if (!normalized) {
      return false;
    }
    const parsed = new Date(normalized);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === new Date(parsed.getTime()).toISOString();
  }

  function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  return {
    DEFAULT_BASE_URL,
    DEFAULT_TIMEOUT_MS,
    ForgeApiError,
    createForgeApiClient
  };
}));
