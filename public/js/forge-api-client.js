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
  const ORDERS_ENDPOINT = 'orders.php';
  const EVENT_STATUS_ENDPOINT = 'event-status.php';
  const HEX_64_PATTERN = /^[0-9a-f]{64}$/;

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
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${HEALTH_ENDPOINT}`, timeoutMs, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new ForgeApiError('http_error', 'The Forge server returned an unexpected response.', {
            status: Number.isInteger(response.status) ? response.status : undefined
          });
        }

        const payload = await parseJsonResponse(response);
        return normalizeHealthPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function submitOrder(orderPayload) {
      assertPlainOrderPayload(orderPayload);

      let requestBody = '';
      try {
        requestBody = JSON.stringify(orderPayload);
      } catch (error) {
        throw new ForgeApiError('invalid_request', 'The Forge order could not be prepared for upload.', { cause: error });
      }

      if (typeof requestBody !== 'string') {
        throw new ForgeApiError('invalid_request', 'The Forge order could not be prepared for upload.');
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${ORDERS_ENDPOINT}`, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: requestBody
        });
        const payload = await parseJsonResponse(response);

        if (response.ok) {
          return normalizeSubmitOrderSuccess(payload, orderPayload, response.status);
        }

        throw buildServerOrderError(response.status, payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function getOrderingState(options = {}) {
      const requestUrl = buildOrderingStateRequestUrl(baseUrl, options.eventToken);
      try {
        const response = await performJsonRequest(fetchImpl, requestUrl, timeoutMs, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);

        if (!response.ok) {
          throw buildServerOrderError(response.status, payload);
        }

        return normalizeOrderingStatePayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    return {
      checkHealth,
      getOrderingState,
      submitOrder
    };
  }

  async function performJsonRequest(fetchImpl, url, timeoutMs, requestOptions) {
    const controller = createAbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    const resolvedOptions = { ...requestOptions };
    if (controller) {
      resolvedOptions.signal = controller.signal;
    }

    try {
      const response = await fetchImpl(url, resolvedOptions);
      if (!response || typeof response.ok !== 'boolean') {
        throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
      }
      return response;
    } catch (error) {
      if (isAbortError(error)) {
        throw new ForgeApiError('timeout', 'The Forge server did not respond in time.', { cause: error });
      }
      if (error instanceof ForgeApiError) {
        throw error;
      }
      throw new ForgeApiError('network_error', 'The Forge server could not be reached.', { cause: error });
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function parseJsonResponse(response) {
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

  function normalizeSubmitOrderSuccess(payload, orderPayload, statusCode) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const forgeOrderUuid = asTrimmedString(data && data.forge_order_uuid);
    const created = data && typeof data === 'object' ? data.created : undefined;
    const forgeOrderNumber = normalizeNullableOrderNumber(data && data.forge_order_number);
    const receivedAt = asTrimmedString(data && data.received_at);
    const payloadSha256 = asTrimmedString(data && data.payload_sha256);
    const submittedForgeOrderUuid = asTrimmedString(orderPayload && orderPayload.forge_order_uuid);

    if (
      ![200, 201].includes(statusCode)
      || !Number.isInteger(statusCode)
      || application !== 'Forge'
      || apiVersion !== '1'
      || status !== 'ok'
      || !forgeOrderUuid
      || typeof created !== 'boolean'
      || !isValidIsoDate(receivedAt)
      || !HEX_64_PATTERN.test(payloadSha256)
      || (data && Object.prototype.hasOwnProperty.call(data, 'forge_order_number') && data.forge_order_number !== null && forgeOrderNumber === null)
      || !submittedForgeOrderUuid
      || forgeOrderUuid !== submittedForgeOrderUuid
    ) {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
    }

    return {
      ok: true,
      forgeOrderUuid,
      forgeOrderNumber,
      created,
      receivedAt,
      payloadSha256
    };
  }

  function normalizeOrderingStatePayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const orderingOpen = data && typeof data === 'object' ? data.ordering_open : undefined;
    const event = data && typeof data === 'object' ? data.event : null;
    const resolutionScope = asTrimmedString(data && data.resolution_scope);
    const requestedPublicOrderToken = asTrimmedString(data && data.requested_public_order_token);
    const availability = asTrimmedString(data && data.availability);

    if (
      application !== 'Forge'
      || apiVersion !== '1'
      || status !== 'ok'
      || typeof orderingOpen !== 'boolean'
      || !['active_event', 'event_token'].includes(resolutionScope)
      || availability === ''
    ) {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
    }

    return {
      ok: true,
      orderingOpen,
      event: event && typeof event === 'object' ? event : null,
      resolutionScope,
      requestedPublicOrderToken: requestedPublicOrderToken || null,
      availability
    };
  }

  function buildOrderingStateRequestUrl(baseUrl, eventToken) {
    const normalizedToken = asTrimmedString(eventToken);
    if (!normalizedToken) {
      return `${baseUrl}/${EVENT_STATUS_ENDPOINT}`;
    }

    return `${baseUrl}/${EVENT_STATUS_ENDPOINT}?event=${encodeURIComponent(normalizedToken)}`;
  }

  function buildServerOrderError(httpStatus, payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const errorEnvelope = payload && typeof payload === 'object' ? payload.error : null;
    const code = asTrimmedString(errorEnvelope && errorEnvelope.code);
    const message = asTrimmedString(errorEnvelope && errorEnvelope.message);

    if (
      application !== 'Forge'
      || apiVersion !== '1'
      || status !== 'error'
      || !code
      || !message
    ) {
      throw new ForgeApiError('invalid_response', 'The Forge server returned an unexpected response.');
    }

    return new ForgeApiError(code, message, {
      status: Number.isInteger(httpStatus) ? httpStatus : undefined
    });
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

  function normalizeNullableOrderNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (Number.isInteger(value)) {
      return value > 0 ? value : null;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number.parseInt(value.trim(), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
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

  function assertPlainOrderPayload(orderPayload) {
    if (!orderPayload || !isPlainObject(orderPayload)) {
      throw new ForgeApiError('invalid_request', 'A complete Forge order payload is required.');
    }
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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
