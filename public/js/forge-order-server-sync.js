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

  return {
    createOrderServerSyncService
  };
}));
