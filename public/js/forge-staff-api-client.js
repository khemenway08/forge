(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffApiClient = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1/staff';
  const DEFAULT_TIMEOUT_MS = 8000;
  const SESSION_ENDPOINT = 'session.php';
  const LOGIN_ENDPOINT = 'login.php';
  const LOGOUT_ENDPOINT = 'logout.php';
  const ORDERS_ENDPOINT = 'orders.php';
  const TRAYS_ENDPOINT = 'trays.php';
  const ASSIGN_TRAY_ENDPOINT = 'assign-tray.php';
  const SAFE_ERROR_MESSAGES = {
    invalid_request: 'Staff authentication could not be prepared.',
    invalid_credentials: 'Invalid staff credentials.',
    authentication_required: 'Staff authentication is required.',
    unsupported_media_type: 'The Forge staff server rejected the request format.',
    invalid_response: 'The Forge staff server returned an unexpected response.',
    timeout: 'The Forge staff server did not respond in time.',
    network_error: 'The Forge staff server could not be reached.',
    unavailable: 'The Forge staff server is currently unavailable.',
    storage_unavailable: 'Staff order retrieval is currently unavailable.',
    no_trays_configured: 'No production trays are configured.',
    order_not_found: 'That order could not be found.',
    tray_not_found: 'That production tray could not be found.',
    tray_unavailable: 'That tray is no longer available. Choose another tray.',
    order_already_assigned: 'This order already has an assigned tray.',
    server_error: 'The Forge staff server is currently unavailable.',
    method_not_allowed: 'The Forge staff server rejected this request method.'
  };

  class ForgeStaffApiError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ForgeStaffApiError';
      this.code = code;
      if (Number.isInteger(options.status)) {
        this.status = options.status;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }

  function createForgeStaffApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const fetchImpl = resolveFetchImplementation(options.fetchImpl);

    async function checkSession() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${SESSION_ENDPOINT}`, timeoutMs, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeAuthenticationPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function login(pin) {
      const normalizedPin = asTrimmedString(pin);
      if (!normalizedPin) {
        throw new ForgeStaffApiError('invalid_request', 'A staff PIN is required.');
      }

      let requestBody = '';
      try {
        requestBody = JSON.stringify({ pin: normalizedPin });
      } catch (error) {
        throw new ForgeStaffApiError('invalid_request', 'Staff authentication could not be prepared.', { cause: error });
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${LOGIN_ENDPOINT}`, timeoutMs, {
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
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeAuthenticationPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function logout() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${LOGOUT_ENDPOINT}`, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeAuthenticationPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function listOrders() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${ORDERS_ENDPOINT}`, timeoutMs, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            orders: []
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeOrdersPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function listTrays() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${TRAYS_ENDPOINT}`, timeoutMs, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            trays: []
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeTraysPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function assignTray(forgeOrderUuid, trayNumber) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      const normalizedTrayNumber = normalizeTrayNumber(trayNumber);

      if (!orderUuid) {
        throw new ForgeStaffApiError('invalid_request', 'A saved order is required.');
      }

      let requestBody = '';
      try {
        requestBody = JSON.stringify({
          forge_order_uuid: orderUuid,
          tray_number: normalizedTrayNumber
        });
      } catch (error) {
        throw new ForgeStaffApiError('invalid_request', 'Tray assignment could not be prepared.', { cause: error });
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${ASSIGN_TRAY_ENDPOINT}`, timeoutMs, {
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
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeAssignTrayPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    return {
      checkSession,
      login,
      logout,
      listOrders,
      listTrays,
      assignTray
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
        throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
      }
      return response;
    } catch (error) {
      if (isAbortError(error)) {
        throw new ForgeStaffApiError('timeout', 'The Forge staff server did not respond in time.', { cause: error });
      }
      if (error instanceof ForgeStaffApiError) {
        throw error;
      }
      throw new ForgeStaffApiError('network_error', 'The Forge staff server could not be reached.', { cause: error });
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function parseJsonResponse(response) {
    if (typeof response.json !== 'function') {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    try {
      return await response.json();
    } catch (error) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.', { cause: error });
    }
  }

  function normalizeAuthenticationPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const authenticated = data && typeof data === 'object' ? data.authenticated : undefined;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || typeof authenticated !== 'boolean') {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated
    };
  }

  function normalizeOrdersPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const orders = data && typeof data === 'object' ? data.orders : null;
    const totalCount = data && typeof data === 'object' ? data.total_count : undefined;
    const limit = data && typeof data === 'object' ? data.limit : undefined;
    const offset = data && typeof data === 'object' ? data.offset : undefined;

    if (
      application !== 'Forge'
      || apiVersion !== '1'
      || status !== 'ok'
      || !Array.isArray(orders)
      || !Number.isInteger(totalCount)
      || !Number.isInteger(limit)
      || !Number.isInteger(offset)
    ) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      orders,
      totalCount,
      limit,
      offset
    };
  }

  function normalizeTraysPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const trays = data && typeof data === 'object' ? data.trays : null;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || !Array.isArray(trays)) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      trays: trays.map((tray) => normalizeTrayRecord(tray))
    };
  }

  function normalizeAssignTrayPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || !data || typeof data !== 'object') {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      alreadyAssigned: Boolean(data.already_assigned),
      order: data.order && typeof data.order === 'object' ? data.order : null,
      tray: data.tray && typeof data.tray === 'object' ? normalizeTrayRecord(data.tray) : null,
      assignmentHistory: data.assignment_history && typeof data.assignment_history === 'object'
        ? normalizeAssignmentHistoryRecord(data.assignment_history)
        : null
    };
  }

  function normalizeTrayRecord(record) {
    return {
      tray_number: normalizeTrayNumber(record && record.tray_number),
      tray_status: asTrimmedString(record && record.tray_status),
      current_order_uuid: normalizeNullableString(record && record.current_order_uuid),
      assigned_at: normalizeNullableString(record && record.assigned_at),
      updated_at: normalizeNullableString(record && record.updated_at)
    };
  }

  function normalizeAssignmentHistoryRecord(record) {
    return {
      tray_assignment_id: asTrimmedString(record && record.tray_assignment_id),
      tray_number: normalizeTrayNumber(record && record.tray_number),
      forge_order_uuid: asTrimmedString(record && record.forge_order_uuid),
      assigned_at: normalizeNullableString(record && record.assigned_at),
      released_at: normalizeNullableString(record && record.released_at),
      release_reason: normalizeNullableString(record && record.release_reason)
    };
  }

  function buildServerError(httpStatus, payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const errorEnvelope = payload && typeof payload === 'object' ? payload.error : null;
    const code = asTrimmedString(errorEnvelope && errorEnvelope.code);
    const message = asTrimmedString(errorEnvelope && errorEnvelope.message);

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'error' || !code || !message) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return new ForgeStaffApiError(code, sanitizeServerMessage(code), {
      status: Number.isInteger(httpStatus) ? httpStatus : undefined
    });
  }

  function sanitizeServerMessage(code) {
    const normalizedCode = asTrimmedString(code);
    return SAFE_ERROR_MESSAGES[normalizedCode] || SAFE_ERROR_MESSAGES.invalid_response;
  }

  function normalizeClientError(error) {
    if (error instanceof ForgeStaffApiError) {
      return error;
    }

    if (isAbortError(error)) {
      return new ForgeStaffApiError('timeout', 'The Forge staff server did not respond in time.', { cause: error });
    }

    if (error instanceof SyntaxError) {
      return new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.', { cause: error });
    }

    if (error instanceof Error) {
      return new ForgeStaffApiError('unavailable', 'The Forge staff server is currently unavailable.', { cause: error });
    }

    return new ForgeStaffApiError('unavailable', 'The Forge staff server is currently unavailable.');
  }

  function resolveFetchImplementation(fetchImpl) {
    if (typeof fetchImpl === 'function') {
      return fetchImpl;
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      return globalThis.fetch.bind(globalThis);
    }
    throw new ForgeStaffApiError('unavailable', 'The Forge staff server is currently unavailable.');
  }

  function normalizeBaseUrl(baseUrl) {
    const trimmed = asTrimmedString(baseUrl);
    if (!trimmed) {
      return DEFAULT_BASE_URL;
    }
    return trimmed.replace(/\/+$/, '');
  }

  function normalizeTimeoutMs(timeoutMs) {
    const numericValue = Number(timeoutMs);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.floor(numericValue);
  }

  function normalizeTrayNumber(value) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue <= 0) {
      throw new ForgeStaffApiError('invalid_request', 'A valid production tray is required.');
    }
    return numericValue;
  }

  function normalizeNullableString(value) {
    const normalized = asTrimmedString(value);
    return normalized === '' ? null : normalized;
  }

  function createAbortController() {
    if (typeof AbortController === 'function') {
      return new AbortController();
    }
    return null;
  }

  function isAbortError(error) {
    return Boolean(error && typeof error === 'object' && error.name === 'AbortError');
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  return {
    ForgeStaffApiError,
    createForgeStaffApiClient
  };
}));
