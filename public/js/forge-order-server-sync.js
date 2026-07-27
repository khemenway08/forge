(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeOrderServerSync = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SAFE_MESSAGE_MAX_LENGTH = 160;
  const NON_RETRYABLE_ERROR_CODES = new Set([
    'invalid_order',
    'invalid_json',
    'request_too_large',
    'unsupported_media_type',
    'method_not_allowed',
    'invalid_request',
    'invalid_record'
  ]);
  const SAFE_ERROR_MESSAGES = {
    invalid_request: 'A valid Forge order UUID is required.',
    not_found: 'That saved order could not be found.',
    invalid_record: 'This saved Forge order could not be uploaded.',
    local_storage_error: 'The order could not be updated safely on this device.',
    uuid_conflict: 'A different Forge order is already stored on the server for this UUID.',
    invalid_order: 'The Forge order payload was rejected by the server.',
    invalid_json: 'The Forge server could not read the order payload.',
    request_too_large: 'The Forge order payload was too large for the server to accept.',
    unsupported_media_type: 'The Forge server rejected the upload format.',
    storage_unavailable: 'Forge server storage is currently unavailable.',
    method_not_allowed: 'The Forge server rejected this upload method.',
    timeout: 'The Forge server did not respond in time.',
    network_error: 'The Forge server could not be reached.',
    invalid_response: 'The Forge server returned an unexpected response.',
    unavailable: 'The Forge server is currently unavailable.',
    server_error: 'The Forge server reported an internal error.',
    server_upload_failed: 'Unable to store this order on the Forge server.'
  };

  function createOrderServerSyncService(options = {}) {
    const orderStore = options.orderStore;
    const apiClient = options.apiClient;
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const activeSyncs = new Map();

    if (!orderStore || typeof orderStore.getOrder !== 'function') {
      throw new Error('Forge order server sync requires an orderStore with getOrder().');
    }
    if (typeof orderStore.markOrderServerUploadAttempt !== 'function') {
      throw new Error('Forge order server sync requires markOrderServerUploadAttempt().');
    }
    if (typeof orderStore.markOrderServerUploadSuccess !== 'function') {
      throw new Error('Forge order server sync requires markOrderServerUploadSuccess().');
    }
    if (typeof orderStore.markOrderServerUploadFailure !== 'function') {
      throw new Error('Forge order server sync requires markOrderServerUploadFailure().');
    }
    if (!apiClient || typeof apiClient.submitOrder !== 'function') {
      throw new Error('Forge order server sync requires an apiClient with submitOrder().');
    }

    async function syncOrderByUuid(forgeOrderUuid) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        return createFailureResult('invalid_request', 'A valid Forge order UUID is required.', '');
      }

      if (activeSyncs.has(orderUuid)) {
        return activeSyncs.get(orderUuid);
      }

      const syncPromise = performSync(orderUuid).finally(() => {
        activeSyncs.delete(orderUuid);
      });
      activeSyncs.set(orderUuid, syncPromise);
      return syncPromise;
    }

    async function performSync(orderUuid) {
      const record = await loadOrder(orderUuid);
      if (!record) {
        return createFailureResult('not_found', 'That saved order could not be found.', orderUuid);
      }

      const payload = record.payload;
      if (!isPlainObject(payload)) {
        return createFailureResult('invalid_record', 'This saved Forge order could not be uploaded.', orderUuid);
      }
      if (asTrimmedString(payload.forge_order_uuid) !== orderUuid) {
        return createFailureResult('invalid_record', 'This saved Forge order could not be uploaded.', orderUuid);
      }

      if (isStoredRecordComplete(record)) {
        return {
          ok: true,
          alreadyStored: true,
          created: record.server_created,
          forgeOrderUuid: orderUuid,
          record
        };
      }

      const attemptTimestamp = normalizeDateValue(getNow()).toISOString();
      try {
        await orderStore.markOrderServerUploadAttempt(orderUuid, attemptTimestamp);
      } catch {
        return createFailureResult(
          'local_storage_error',
          'The order could not be prepared for Forge server upload on this device.',
          orderUuid
        );
      }

      let serverResult;
      try {
        serverResult = await apiClient.submitOrder(payload);
      } catch (error) {
        const safeFailure = sanitizeError(error, orderUuid);
        try {
          await orderStore.markOrderServerUploadFailure(orderUuid, safeFailure, normalizeDateValue(getNow()).toISOString());
        } catch {
          return safeFailure;
        }
        return safeFailure;
      }

      try {
        const updatedRecord = await orderStore.markOrderServerUploadSuccess(
          orderUuid,
          serverResult,
          normalizeDateValue(getNow()).toISOString()
        );
        return {
          ok: true,
          alreadyStored: false,
          created: serverResult.created,
          forgeOrderUuid: orderUuid,
          record: updatedRecord,
          serverResult
        };
      } catch {
        return createFailureResult(
          'local_storage_error',
          'The order was stored on the Forge server, but the local confirmation could not be saved.',
          orderUuid
        );
      }
    }

    async function loadOrder(orderUuid) {
      try {
        return await orderStore.getOrder(orderUuid);
      } catch {
        return null;
      }
    }

    return {
      syncOrderByUuid
    };
  }

  function createAutomaticOrderSyncCoordinator(options = {}) {
    const orderStore = options.orderStore;
    const syncService = options.syncService;
    const eventTarget = options.eventTarget || null;
    const location = options.location || (typeof globalThis !== 'undefined' ? globalThis.location : null);
    const enabled = options.enabled === undefined
      ? isAutomaticOrderSyncAllowed(location)
      : Boolean(options.enabled);
    let started = false;
    let activeRun = null;
    let rerunRequested = false;
    let fullScanRequested = false;
    const pendingOrderUuids = new Set();
    const activeOrderUuids = new Set();
    const subscribers = new Set();
    let lastRunCompletedAt = null;
    let lastRunResults = [];
    let lastProcessedCount = 0;
    const boundOnlineHandler = () => {
      requestPendingSync();
    };

    if (!orderStore || typeof orderStore.listOrders !== 'function') {
      throw new Error('Forge automatic order sync requires an orderStore with listOrders().');
    }
    if (!syncService || typeof syncService.syncOrderByUuid !== 'function') {
      throw new Error('Forge automatic order sync requires a syncService with syncOrderByUuid().');
    }

    function start() {
      if (started) {
        return enabled ? requestPendingSync() : Promise.resolve(createSkippedResult('disabled'));
      }
      started = true;
      if (!enabled) {
        return Promise.resolve(createSkippedResult('disabled'));
      }
      if (eventTarget && typeof eventTarget.addEventListener === 'function') {
        eventTarget.addEventListener('online', boundOnlineHandler);
      }
      notify();
      return requestPendingSync();
    }

    function requestSyncForOrder(forgeOrderUuid) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!enabled) {
        return Promise.resolve(createSkippedResult('disabled'));
      }
      if (!orderUuid) {
        return Promise.resolve(createSkippedResult('invalid_request'));
      }
      pendingOrderUuids.add(orderUuid);
      return scheduleRun();
    }

    function requestPendingSync() {
      if (!enabled) {
        return Promise.resolve(createSkippedResult('disabled'));
      }
      fullScanRequested = true;
      return scheduleRun();
    }

    function scheduleRun() {
      if (activeRun) {
        rerunRequested = true;
        return activeRun;
      }

      notify();
      activeRun = runSyncLoop().finally(() => {
        activeRun = null;
        notify();
      });
      return activeRun;
    }

    async function runSyncLoop() {
      let lastResult = createSkippedResult('empty');

      do {
        rerunRequested = false;
        const orderUuids = await collectRequestedOrderUuids();
        if (orderUuids.length === 0) {
          lastResult = createSkippedResult('empty');
          continue;
        }

        const results = [];
        for (const orderUuid of orderUuids) {
          activeOrderUuids.add(orderUuid);
          notify();
          try {
            results.push(await syncService.syncOrderByUuid(orderUuid));
          } finally {
            activeOrderUuids.delete(orderUuid);
            notify();
          }
        }
        lastRunResults = results.slice();
        lastProcessedCount = results.length;
        lastRunCompletedAt = new Date().toISOString();
        lastResult = {
          ok: results.every((result) => result && result.ok !== false),
          processedCount: results.length,
          results
        };
        notify();
      } while (rerunRequested || fullScanRequested || pendingOrderUuids.size > 0);

      return lastResult;
    }

    async function collectRequestedOrderUuids() {
      const explicitOrderUuids = [...pendingOrderUuids];
      pendingOrderUuids.clear();

      const orderUuids = new Set(explicitOrderUuids);
      if (fullScanRequested) {
        fullScanRequested = false;
        let records = [];
        try {
          records = await orderStore.listOrders();
        } catch {
          records = [];
        }
        records
          .filter((record) => isOrderEligibleForAutomaticSync(record))
          .forEach((record) => {
            const orderUuid = asTrimmedString(record?.forge_order_uuid);
            if (orderUuid) {
              orderUuids.add(orderUuid);
            }
          });
      }

      return [...orderUuids];
    }

    function getState() {
      return {
        enabled,
        started,
        isRunning: Boolean(activeRun),
        activeOrderCount: activeOrderUuids.size,
        pendingRequestCount: pendingOrderUuids.size + (fullScanRequested ? 1 : 0),
        lastRunCompletedAt,
        lastProcessedCount,
        lastResults: lastRunResults.slice()
      };
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      subscribers.add(listener);
      listener(getState());
      return () => {
        subscribers.delete(listener);
      };
    }

    function notify() {
      const state = getState();
      subscribers.forEach((listener) => {
        listener(state);
      });
    }

    return {
      getState,
      start,
      requestPendingSync,
      requestSyncForOrder,
      subscribe
    };
  }

  function isStoredRecordComplete(record) {
    return asTrimmedString(record?.server_upload_status) === 'stored'
      && typeof record?.server_created === 'boolean'
      && isIsoDate(record?.server_received_at)
      && /^[0-9a-f]{64}$/.test(asTrimmedString(record?.server_payload_sha256));
  }

  function sanitizeError(error, forgeOrderUuid) {
    const code = asTrimmedString(error?.code) || 'server_upload_failed';
    const message = SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.server_upload_failed;
    return createFailureResult(code, message, forgeOrderUuid);
  }

  function createFailureResult(code, message, forgeOrderUuid) {
    return {
      ok: false,
      code: asTrimmedString(code) || 'server_upload_failed',
      message: (SAFE_ERROR_MESSAGES[asTrimmedString(code)] || asTrimmedString(message) || SAFE_ERROR_MESSAGES.server_upload_failed)
        .slice(0, SAFE_MESSAGE_MAX_LENGTH),
      forgeOrderUuid: asTrimmedString(forgeOrderUuid)
    };
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isIsoDate(value) {
    const normalized = asTrimmedString(value);
    return Boolean(normalized) && !Number.isNaN(Date.parse(normalized));
  }

  function normalizeDateValue(value) {
    const candidate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(candidate.getTime())) {
      throw new Error('Forge order server sync requires valid date values.');
    }
    return candidate;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function isAutomaticOrderSyncAllowed(location) {
    const protocol = asTrimmedString(location?.protocol).toLowerCase();
    const hostname = normalizeHostname(location?.hostname);

    if (protocol !== 'https:') {
      return false;
    }

    if (!hostname) {
      return false;
    }

    return !isLocalDevelopmentHostname(hostname);
  }

  function isOrderEligibleForAutomaticSync(record) {
    const serverUploadStatus = asTrimmedString(record?.server_upload_status).toLowerCase() || 'pending';
    if (serverUploadStatus === 'stored' || serverUploadStatus === 'conflict') {
      return false;
    }

    if (serverUploadStatus === 'failed') {
      return isRetryableServerUploadErrorCode(asTrimmedString(record?.last_server_upload_error?.code).toLowerCase());
    }

    return serverUploadStatus === 'pending' || serverUploadStatus === 'uploading';
  }

  function isRetryableServerUploadErrorCode(code) {
    const normalizedCode = asTrimmedString(code).toLowerCase();
    if (!normalizedCode) {
      return true;
    }
    return !NON_RETRYABLE_ERROR_CODES.has(normalizedCode) && normalizedCode !== 'uuid_conflict';
  }

  function normalizeHostname(hostname) {
    return asTrimmedString(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  }

  function isLocalDevelopmentHostname(hostname) {
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.local');
  }

  function createSkippedResult(reason) {
    return {
      ok: true,
      skipped: true,
      reason: asTrimmedString(reason) || 'skipped'
    };
  }

  return {
    createAutomaticOrderSyncCoordinator,
    createOrderServerSyncService,
    isAutomaticOrderSyncAllowed,
    isOrderEligibleForAutomaticSync
  };
}));
