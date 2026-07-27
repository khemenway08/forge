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
  const VERIFY_PIN_ENDPOINT = 'verify-pin.php';
  const ORDERS_ENDPOINT = 'orders.php';
  const EVENTS_ENDPOINT = 'events.php';
  const ACTIVE_EVENT_ENDPOINT = 'active-event.php';
  const START_EVENT_ENDPOINT = 'start-event.php';
  const END_EVENT_ENDPOINT = 'end-event.php';
  const INTERNAL_NOTE_ENDPOINT = 'internal-note.php';
  const LEGACY_TEST_CLEANUP_ENDPOINT = 'legacy-test-cleanup.php';
  const TRAYS_ENDPOINT = 'trays.php';
  const ASSIGN_TRAY_ENDPOINT = 'assign-tray.php';
  const COMPLETE_ITEM_ENDPOINT = 'complete-item.php';
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
    event_not_found: 'That event could not be found.',
    event_conflict: 'That event could not be updated right now.',
    internal_note_too_long: 'Internal notes are too long.',
    cleanup_conflict: 'Legacy test cleanup changed. Run a new preview before deleting anything.',
    no_trays_configured: 'No production trays are configured.',
    order_not_found: 'That order could not be found.',
    tray_not_found: 'That production tray could not be found.',
    tray_unavailable: 'That tray is no longer available. Choose another tray.',
    order_already_assigned: 'This order already has an assigned tray.',
    item_not_found: 'That saved item could not be found.',
    item_conflict: 'That item was already updated. Refresh the order and try again.',
    item_not_completable: 'That item cannot be marked complete right now.',
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

    async function verifyPin(pin) {
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
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${VERIFY_PIN_ENDPOINT}`, timeoutMs, {
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
            verified: false,
            invalidCredentials: true
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizePinVerificationPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function listOrders(options = {}) {
      const pagination = normalizeListOrdersOptions(options);
      const requestUrl = buildOrdersRequestUrl(baseUrl, pagination);

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

    async function listEvents() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${EVENTS_ENDPOINT}`, timeoutMs, {
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
            events: []
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeEventsPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function createEvent(eventInput) {
      return submitEventMutation(`${baseUrl}/${EVENTS_ENDPOINT}`, eventInput || {});
    }

    async function getActiveEvent() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${ACTIVE_EVENT_ENDPOINT}`, timeoutMs, {
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
            event: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeActiveEventPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function startEvent(eventId) {
      return submitEventMutation(`${baseUrl}/${START_EVENT_ENDPOINT}`, {
        event_id: asTrimmedString(eventId)
      });
    }

    async function endEvent(eventId) {
      return submitEventMutation(`${baseUrl}/${END_EVENT_ENDPOINT}`, {
        event_id: asTrimmedString(eventId)
      });
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

    async function completeItemQuantity(forgeOrderUuid, lineId, expectedCompletedQuantity, targetCompletedQuantity) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      const normalizedLineId = asTrimmedString(lineId);
      const expectedQuantity = normalizeExpectedCompletedQuantity(expectedCompletedQuantity);
      const targetQuantity = normalizeTargetCompletedQuantity(targetCompletedQuantity, expectedQuantity);

      if (!orderUuid) {
        throw new ForgeStaffApiError('invalid_request', 'A saved order is required.');
      }
      if (!normalizedLineId) {
        throw new ForgeStaffApiError('invalid_request', 'A saved item is required.');
      }

      let requestBody = '';
      try {
        requestBody = JSON.stringify({
          forge_order_uuid: orderUuid,
          line_id: normalizedLineId,
          expected_completed_quantity: expectedQuantity,
          target_completed_quantity: targetQuantity
        });
      } catch (error) {
        throw new ForgeStaffApiError('invalid_request', 'Item completion could not be prepared.', { cause: error });
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${COMPLETE_ITEM_ENDPOINT}`, timeoutMs, {
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
        return normalizeCompleteItemPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function updateInternalNote(forgeOrderUuid, internalNote) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new ForgeStaffApiError('invalid_request', 'A saved order is required.');
      }

      const normalizedInternalNote = normalizeInternalNoteValue(internalNote);
      let requestBody = '';
      try {
        requestBody = JSON.stringify({
          forge_order_uuid: orderUuid,
          internal_note: normalizedInternalNote
        });
      } catch (error) {
        throw new ForgeStaffApiError('invalid_request', 'Internal notes could not be prepared.', { cause: error });
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${INTERNAL_NOTE_ENDPOINT}`, timeoutMs, {
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
        return normalizeInternalNotePayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function previewLegacyTestCleanup() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${LEGACY_TEST_CLEANUP_ENDPOINT}`, timeoutMs, {
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
        return normalizeLegacyCleanupPreviewPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function applyLegacyTestCleanup(previewSignature, expectedCount, confirmationText) {
      const normalizedPreviewSignature = asTrimmedString(previewSignature);
      const normalizedExpectedCount = normalizeOptionalNonNegativeInteger(expectedCount, 'A valid cleanup preview count is required.');
      const normalizedConfirmationText = asTrimmedString(confirmationText);

      if (!normalizedPreviewSignature) {
        throw new ForgeStaffApiError('invalid_request', 'A valid cleanup preview signature is required.');
      }
      if (normalizedExpectedCount === undefined) {
        throw new ForgeStaffApiError('invalid_request', 'A valid cleanup preview count is required.');
      }
      if (!normalizedConfirmationText) {
        throw new ForgeStaffApiError('invalid_request', 'The exact cleanup confirmation text is required.');
      }

      let requestBody = '';
      try {
        requestBody = JSON.stringify({
          preview_signature: normalizedPreviewSignature,
          expected_count: normalizedExpectedCount,
          confirmation_text: normalizedConfirmationText
        });
      } catch (error) {
        throw new ForgeStaffApiError('invalid_request', 'Legacy test cleanup could not be prepared.', { cause: error });
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/${LEGACY_TEST_CLEANUP_ENDPOINT}`, timeoutMs, {
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
        return normalizeLegacyCleanupApplyPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function submitEventMutation(url, payload) {
      let requestBody = '';
      try {
        requestBody = JSON.stringify(payload);
      } catch (error) {
        throw new ForgeStaffApiError('invalid_request', 'Staff event management could not be prepared.', { cause: error });
      }

      try {
        const response = await performJsonRequest(fetchImpl, url, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: requestBody
        });
        const responsePayload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            event: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, responsePayload);
        }
        return normalizeSingleEventPayload(responsePayload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    return {
      checkSession,
      login,
      logout,
      verifyPin,
      listEvents,
      createEvent,
      getActiveEvent,
      startEvent,
      endEvent,
      listOrders,
      listTrays,
      assignTray,
      completeItemQuantity,
      updateInternalNote,
      previewLegacyTestCleanup,
      applyLegacyTestCleanup
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

  function normalizePinVerificationPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const verified = data && typeof data === 'object' ? data.verified : undefined;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || verified !== true) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      verified: true
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

  function normalizeListOrdersOptions(options) {
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const limit = normalizeOptionalPositiveInteger(normalizedOptions.limit, 'A valid order-page limit is required.');
    const offset = normalizeOptionalNonNegativeInteger(normalizedOptions.offset, 'A valid order-page offset is required.');

    return {
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset })
    };
  }

  function buildOrdersRequestUrl(baseUrl, pagination) {
    const query = new URLSearchParams();
    if (pagination.limit !== undefined) {
      query.set('limit', String(pagination.limit));
    }
    if (pagination.offset !== undefined) {
      query.set('offset', String(pagination.offset));
    }

    const queryString = query.toString();
    return queryString
      ? `${baseUrl}/${ORDERS_ENDPOINT}?${queryString}`
      : `${baseUrl}/${ORDERS_ENDPOINT}`;
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

  function normalizeCompleteItemPayload(payload) {
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
      alreadyApplied: Boolean(data.already_applied),
      order: data.order && typeof data.order === 'object' ? data.order : null,
      item: data.item && typeof data.item === 'object' ? data.item : null
    };
  }

  function normalizeInternalNotePayload(payload) {
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
      internalNote: normalizeNullableString(data.internal_note),
      order: data.order && typeof data.order === 'object' ? data.order : null
    };
  }

  function normalizeLegacyCleanupPreviewPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const preview = data && typeof data === 'object' ? data.preview : null;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || !preview || typeof preview !== 'object') {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      preview: normalizeLegacyCleanupPreview(preview)
    };
  }

  function normalizeLegacyCleanupApplyPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const deletedCount = data && typeof data === 'object' ? data.deleted_count : undefined;
    const releasedTrayNumbers = data && typeof data === 'object' ? data.released_tray_numbers : null;
    const deletedOrderUuids = data && typeof data === 'object' ? data.deleted_order_uuids : null;

    if (
      application !== 'Forge'
      || apiVersion !== '1'
      || status !== 'ok'
      || !Number.isInteger(deletedCount)
      || !Array.isArray(releasedTrayNumbers)
      || !Array.isArray(deletedOrderUuids)
    ) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      deletedCount,
      releasedTrayNumbers: releasedTrayNumbers.map((value) => normalizeTrayNumber(value)),
      deletedOrderUuids: deletedOrderUuids.map((value) => asTrimmedString(value)).filter(Boolean)
    };
  }

  function normalizeLegacyCleanupPreview(preview) {
    const eligibleCount = preview && Number.isInteger(preview.eligible_count) ? preview.eligible_count : null;
    const confirmationText = asTrimmedString(preview && preview.confirmation_text);
    const previewSignature = asTrimmedString(preview && preview.preview_signature);
    const eligibleOrders = preview && typeof preview === 'object' ? preview.eligible_orders : null;
    const protectedOrders = preview && typeof preview === 'object' ? preview.protected_orders : null;

    if (
      eligibleCount === null
      || !confirmationText
      || !previewSignature
      || !Array.isArray(eligibleOrders)
      || !Array.isArray(protectedOrders)
    ) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      cutoffTimezone: asTrimmedString(preview.cutoff_timezone),
      cutoffLocal: asTrimmedString(preview.cutoff_local),
      cutoffUtc: asTrimmedString(preview.cutoff_utc),
      eligibleCount,
      confirmationText,
      previewSignature,
      eligibleOrders: eligibleOrders.map((record) => normalizeLegacyCleanupPreviewRecord(record)),
      protectedOrders: protectedOrders.map((record) => normalizeLegacyCleanupPreviewRecord(record))
    };
  }

  function normalizeLegacyCleanupPreviewRecord(record) {
    return {
      forge_order_uuid: asTrimmedString(record && record.forge_order_uuid),
      forge_order_number: normalizeOptionalNonNegativeInteger(record && record.forge_order_number, 'A valid cleanup preview order number is required.'),
      order_reference: asTrimmedString(record && record.order_reference),
      customer_name: asTrimmedString(record && record.customer_name),
      submitted_at: asTrimmedString(record && record.submitted_at),
      event_label: normalizeNullableString(record && record.event_label),
      tray_number: record && record.tray_number != null ? normalizeTrayNumber(record.tray_number) : null
    };
  }

  function normalizeEventsPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const events = data && typeof data === 'object' ? data.events : null;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || !Array.isArray(events)) {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      events: events.map((event) => normalizeEventRecord(event))
    };
  }

  function normalizeActiveEventPayload(payload) {
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
      event: data.event && typeof data.event === 'object' ? normalizeEventRecord(data.event) : null
    };
  }

  function normalizeSingleEventPayload(payload) {
    const application = asTrimmedString(payload && payload.application);
    const apiVersion = asTrimmedString(payload && payload.api_version);
    const status = asTrimmedString(payload && payload.status);
    const data = payload && typeof payload === 'object' ? payload.data : null;

    if (application !== 'Forge' || apiVersion !== '1' || status !== 'ok' || !data || typeof data !== 'object' || !data.event || typeof data.event !== 'object') {
      throw new ForgeStaffApiError('invalid_response', 'The Forge staff server returned an unexpected response.');
    }

    return {
      ok: true,
      authenticated: true,
      event: normalizeEventRecord(data.event)
    };
  }

  function normalizeEventRecord(record) {
    return {
      event_id: asTrimmedString(record && record.event_id),
      public_order_token: asTrimmedString(record && record.public_order_token),
      event_name: asTrimmedString(record && record.event_name),
      event_type: asTrimmedString(record && record.event_type),
      start_date: asTrimmedString(record && record.start_date),
      end_date: asTrimmedString(record && record.end_date),
      event_location: normalizeNullableString(record && record.event_location),
      event_status: asTrimmedString(record && record.event_status),
      started_at: normalizeNullableString(record && record.started_at),
      ended_at: normalizeNullableString(record && record.ended_at),
      created_at: normalizeNullableString(record && record.created_at),
      updated_at: normalizeNullableString(record && record.updated_at)
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

  function normalizeInternalNoteValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new ForgeStaffApiError('invalid_request', 'A valid internal note is required.');
    }

    return value;
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

  function normalizeOptionalPositiveInteger(value, errorMessage) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (!Number.isInteger(value) || value <= 0) {
      throw new ForgeStaffApiError('invalid_request', errorMessage);
    }
    return value;
  }

  function normalizeOptionalNonNegativeInteger(value, errorMessage) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new ForgeStaffApiError('invalid_request', errorMessage);
    }
    return value;
  }

  function normalizeExpectedCompletedQuantity(value) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0) {
      throw new ForgeStaffApiError('invalid_request', 'A valid current completed quantity is required.');
    }
    return numericValue;
  }

  function normalizeTargetCompletedQuantity(value, expectedQuantity) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue !== expectedQuantity + 1) {
      throw new ForgeStaffApiError('invalid_request', 'A valid target completed quantity is required.');
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
