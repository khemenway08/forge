(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeOrderStore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DATABASE_NAME = 'forge-orders';
  const DATABASE_VERSION = 4;
  const OBJECT_STORE_NAMES = {
    orders: 'orders',
    trays: 'production_trays',
    trayAssignmentHistory: 'tray_assignment_history',
    packingVerifications: 'packing_verifications',
    cleanupTombstones: 'order_cleanup_tombstones'
  };
  const INDEX_NAMES = {
    orders: {
      submittedAt: 'submitted_at',
      localSavedAt: 'local_saved_at',
      status: 'status',
      syncStatus: 'sync_status',
      eventId: 'event_id',
      hasOpenFlags: 'has_open_flags',
      productionStatus: 'production_status',
      currentTrayNumber: 'current_tray_number'
    },
    trays: {
      trayStatus: 'tray_status',
      currentOrderUuid: 'current_order_uuid',
      updatedAt: 'updated_at'
    },
    trayAssignmentHistory: {
      forgeOrderUuid: 'forge_order_uuid',
      trayNumber: 'tray_number',
      releasedAt: 'released_at',
      assignedAt: 'assigned_at'
    },
    packingVerifications: {
      forgeOrderUuid: 'forge_order_uuid',
      trayNumber: 'tray_number',
      verifiedAt: 'verified_at'
    },
    cleanupTombstones: {
      deletedAt: 'deleted_at'
    }
  };
  const PACKING_NOTE_MAX_LENGTH = 500;
  const PRODUCTION_STATUSES = {
    submitted: 'submitted',
    trayAssigned: 'tray_assigned',
    inProduction: 'in_production',
    readyToPack: 'ready_to_pack',
    packed: 'packed',
    shipped: 'shipped',
    pickedUp: 'picked_up',
    cancelled: 'cancelled'
  };
  const ITEM_PRODUCTION_STATUSES = {
    pending: 'pending',
    inProduction: 'in_production',
    complete: 'complete',
    blocked: 'blocked',
    cancelled: 'cancelled'
  };
  const TRAY_STATUSES = {
    available: 'available',
    assigned: 'assigned',
    outOfService: 'out_of_service'
  };
  const SERVER_UPLOAD_STATUSES = {
    pending: 'pending',
    uploading: 'uploading',
    stored: 'stored',
    failed: 'failed',
    conflict: 'conflict'
  };
  const ORDER_DELETE_TEST_CONFIRMATION_TEXT = 'DELETE TEST ORDER';
  const SERVER_UPLOAD_ERROR_MESSAGE_MAX_LENGTH = 160;
  const SERVER_UPLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;
  const SERVER_UPLOAD_ERROR_MESSAGES = {
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
  const DEFAULT_TRAY_INVENTORY = createDefaultTrayInventoryConfig();
  function createOrderStore(options = {}) {
    const indexedDb = options.indexedDB || (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
    const databaseName = options.databaseName || DATABASE_NAME;
    const databaseVersion = Number.isInteger(options.databaseVersion) ? options.databaseVersion : DATABASE_VERSION;
    const objectStoreNames = {
      orders: options.objectStoreName || options.objectStoreNames?.orders || OBJECT_STORE_NAMES.orders,
      trays: options.objectStoreNames?.trays || OBJECT_STORE_NAMES.trays,
      trayAssignmentHistory: options.objectStoreNames?.trayAssignmentHistory || OBJECT_STORE_NAMES.trayAssignmentHistory,
      packingVerifications: options.objectStoreNames?.packingVerifications || OBJECT_STORE_NAMES.packingVerifications,
      cleanupTombstones: options.objectStoreNames?.cleanupTombstones || OBJECT_STORE_NAMES.cleanupTombstones
    };
    const trayInventoryConfig = normalizeTrayInventoryConfig(options.trayInventory || DEFAULT_TRAY_INVENTORY);
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const getRandomUuid = typeof options.randomUUID === 'function' ? options.randomUUID : createStoreUuid;
    let dbPromise = null;

    function openOrderStore() {
      if (dbPromise) {
        return dbPromise;
      }
      if (!indexedDb || typeof indexedDb.open !== 'function') {
        return Promise.reject(new Error('IndexedDB is unavailable for Forge order storage.'));
      }

      const pendingOpenPromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(databaseName, databaseVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          const transaction = request.transaction;
          const orderStore = db.objectStoreNames.contains(objectStoreNames.orders)
            ? transaction.objectStore(objectStoreNames.orders)
            : db.createObjectStore(objectStoreNames.orders, { keyPath: 'forge_order_uuid' });
          const trayStore = db.objectStoreNames.contains(objectStoreNames.trays)
            ? transaction.objectStore(objectStoreNames.trays)
            : db.createObjectStore(objectStoreNames.trays, { keyPath: 'tray_number' });
          const trayAssignmentHistoryStore = db.objectStoreNames.contains(objectStoreNames.trayAssignmentHistory)
            ? transaction.objectStore(objectStoreNames.trayAssignmentHistory)
            : db.createObjectStore(objectStoreNames.trayAssignmentHistory, { keyPath: 'tray_assignment_id' });
          const packingVerificationStore = db.objectStoreNames.contains(objectStoreNames.packingVerifications)
            ? transaction.objectStore(objectStoreNames.packingVerifications)
            : db.createObjectStore(objectStoreNames.packingVerifications, { keyPath: 'packing_verification_id' });
          const cleanupTombstoneStore = db.objectStoreNames.contains(objectStoreNames.cleanupTombstones)
            ? transaction.objectStore(objectStoreNames.cleanupTombstones)
            : db.createObjectStore(objectStoreNames.cleanupTombstones, { keyPath: 'forge_order_uuid' });

          ensureIndex(orderStore, INDEX_NAMES.orders.submittedAt, 'submitted_at');
          ensureIndex(orderStore, INDEX_NAMES.orders.localSavedAt, 'local_saved_at');
          ensureIndex(orderStore, INDEX_NAMES.orders.status, 'status');
          ensureIndex(orderStore, INDEX_NAMES.orders.syncStatus, 'sync_status');
          ensureIndex(orderStore, INDEX_NAMES.orders.eventId, 'event_id');
          ensureIndex(orderStore, INDEX_NAMES.orders.hasOpenFlags, 'has_open_flags');
          ensureIndex(orderStore, INDEX_NAMES.orders.productionStatus, 'production_status');
          ensureIndex(orderStore, INDEX_NAMES.orders.currentTrayNumber, 'current_tray_number');

          ensureIndex(trayStore, INDEX_NAMES.trays.trayStatus, 'tray_status');
          ensureIndex(trayStore, INDEX_NAMES.trays.currentOrderUuid, 'current_order_uuid');
          ensureIndex(trayStore, INDEX_NAMES.trays.updatedAt, 'updated_at');

          ensureIndex(trayAssignmentHistoryStore, INDEX_NAMES.trayAssignmentHistory.forgeOrderUuid, 'forge_order_uuid');
          ensureIndex(trayAssignmentHistoryStore, INDEX_NAMES.trayAssignmentHistory.trayNumber, 'tray_number');
          ensureIndex(trayAssignmentHistoryStore, INDEX_NAMES.trayAssignmentHistory.releasedAt, 'released_at');
          ensureIndex(trayAssignmentHistoryStore, INDEX_NAMES.trayAssignmentHistory.assignedAt, 'assigned_at');

          ensureIndex(packingVerificationStore, INDEX_NAMES.packingVerifications.forgeOrderUuid, 'forge_order_uuid', { unique: true });
          ensureIndex(packingVerificationStore, INDEX_NAMES.packingVerifications.trayNumber, 'tray_number');
          ensureIndex(packingVerificationStore, INDEX_NAMES.packingVerifications.verifiedAt, 'verified_at');
          ensureIndex(cleanupTombstoneStore, INDEX_NAMES.cleanupTombstones.deletedAt, 'deleted_at');
        };
        request.onsuccess = async () => {
          try {
            const db = request.result;
            db.onversionchange = () => db.close();
            await ensureTrayInventory(db, objectStoreNames.trays, trayInventoryConfig);
            resolve(db);
          } catch (error) {
            request.result?.close?.();
            reject(error);
          }
        };
        request.onerror = () => reject(request.error || new Error('Unable to open the Forge order database.'));
        request.onblocked = () => reject(new Error('Forge order storage is blocked by another open tab.'));
      });

      dbPromise = pendingOpenPromise.catch((error) => {
        dbPromise = null;
        throw error;
      });
      return dbPromise;
    }

    async function getOrder(forgeOrderUuid) {
      const orderId = asTrimmedString(forgeOrderUuid);
      if (!orderId) {
        return null;
      }
      const db = await openOrderStore();
      const record = await runRequest(db, 'readonly', objectStoreNames.orders, (store) => store.get(orderId));
      return record ? normalizeOrderRecordForRead(record) : null;
    }

    async function saveNewOrder(record) {
      const normalizedRecord = normalizeLocalOrderRecord(record);
      if (await hasCleanupTombstone(normalizedRecord.forge_order_uuid)) {
        throw new Error('This Forge order UUID was previously deleted and cannot be saved again.');
      }
      const existingRecord = await getOrder(normalizedRecord.forge_order_uuid);
      if (existingRecord) {
        return {
          ok: true,
          duplicatePrevented: true,
          wasInserted: false,
          record: deepCloneValue(existingRecord)
        };
      }

      const db = await openOrderStore();
      try {
        await runRequest(db, 'readwrite', objectStoreNames.orders, (store) => {
          return store.add(deepCloneValue(normalizedRecord));
        });
        return {
          ok: true,
          duplicatePrevented: false,
          wasInserted: true,
          record: normalizeOrderRecordForRead(normalizedRecord)
        };
      } catch (error) {
        if (isConstraintError(error)) {
          const duplicateRecord = await getOrder(normalizedRecord.forge_order_uuid);
          if (duplicateRecord) {
            return {
              ok: true,
              duplicatePrevented: true,
              wasInserted: false,
              record: deepCloneValue(duplicateRecord)
            };
          }
        }
        throw error;
      }
    }

    async function listOrders() {
      const db = await openOrderStore();
      const records = await runRequest(db, 'readonly', objectStoreNames.orders, (store) => {
        if (typeof store.getAll === 'function') {
          return store.getAll();
        }
        return openCursorCollection(store);
      });
      return Array.isArray(records)
        ? records.map((record) => normalizeOrderRecordForRead(record)).sort(compareOrdersNewestFirst)
        : [];
    }

    async function countOrdersBySyncStatus(syncStatus) {
      const status = asTrimmedString(syncStatus);
      const db = await openOrderStore();
      return runRequest(db, 'readonly', objectStoreNames.orders, (store) => {
        const index = store.index(INDEX_NAMES.orders.syncStatus);
        return index.count(status);
      });
    }

    async function markOrderServerUploadAttempt(forgeOrderUuid, attemptedAt = normalizeDateValue(getNow()).toISOString()) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Server upload attempt requires a Forge order UUID.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(objectStoreNames.orders, 'readwrite');
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const timestamp = normalizeDateValue(attemptedAt).toISOString();
        let updatedRecord = null;

        transaction.oncomplete = () => resolve(updatedRecord);
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Server upload attempt could not be saved.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Server upload attempt was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          updatedRecord = normalizeLocalOrderRecord({
            ...deepCloneValue(storedOrder),
            updated_at: timestamp,
            server_upload_status: SERVER_UPLOAD_STATUSES.uploading,
            server_upload_attempt_count: getServerUploadAttemptCount(storedOrder) + 1,
            last_server_upload_attempt_at: timestamp,
            last_server_upload_error: null
          });

          const putRequest = ordersStore.put(deepCloneValue(updatedRecord));
          putRequest.onerror = () => abortTransaction(transaction, putRequest.error || new Error('The server upload attempt could not be saved.'));
        };
      });
    }

    async function markOrderServerUploadSuccess(forgeOrderUuid, result, updatedAt = normalizeDateValue(getNow()).toISOString()) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Server upload success requires a Forge order UUID.');
      }
      validateServerUploadSuccessResult(orderUuid, result);

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(objectStoreNames.orders, 'readwrite');
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const timestamp = normalizeDateValue(updatedAt).toISOString();
        let updatedRecord = null;

        transaction.oncomplete = () => resolve(updatedRecord);
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Server upload success could not be saved.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Server upload success was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          updatedRecord = normalizeLocalOrderRecord({
            ...deepCloneValue(storedOrder),
            updated_at: timestamp,
            server_upload_status: SERVER_UPLOAD_STATUSES.stored,
            server_received_at: result.receivedAt,
            server_payload_sha256: result.payloadSha256,
            server_created: result.created,
            forge_order_number: result.forgeOrderNumber,
            last_server_upload_error: null
          });

          const putRequest = ordersStore.put(deepCloneValue(updatedRecord));
          putRequest.onerror = () => abortTransaction(transaction, putRequest.error || new Error('The server upload success could not be saved.'));
        };
      });
    }

    async function markOrderServerUploadFailure(forgeOrderUuid, error, updatedAt = normalizeDateValue(getNow()).toISOString()) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Server upload failure requires a Forge order UUID.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(objectStoreNames.orders, 'readwrite');
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const timestamp = normalizeDateValue(updatedAt).toISOString();
        let updatedRecord = null;

        transaction.oncomplete = () => resolve(updatedRecord);
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Server upload failure could not be saved.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Server upload failure was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          const safeError = sanitizeServerUploadError(error);
          updatedRecord = normalizeLocalOrderRecord({
            ...deepCloneValue(storedOrder),
            updated_at: timestamp,
            server_upload_status: safeError.code === 'uuid_conflict'
              ? SERVER_UPLOAD_STATUSES.conflict
              : SERVER_UPLOAD_STATUSES.failed,
            last_server_upload_error: safeError
          });

          const putRequest = ordersStore.put(deepCloneValue(updatedRecord));
          putRequest.onerror = () => abortTransaction(transaction, putRequest.error || new Error('The server upload failure could not be saved.'));
        };
      });
    }

    async function listTrays() {
      const db = await openOrderStore();
      const trays = await runRequest(db, 'readonly', objectStoreNames.trays, (store) => {
        if (typeof store.getAll === 'function') {
          return store.getAll();
        }
        return openCursorCollection(store);
      });
      return Array.isArray(trays)
        ? trays.map((tray) => normalizeTrayRecord(tray)).sort(compareTraysByNumber)
        : [];
    }

    async function getTray(trayNumber) {
      const normalizedTrayNumber = normalizeTrayNumber(trayNumber);
      if (!normalizedTrayNumber) {
        return null;
      }
      const db = await openOrderStore();
      const tray = await runRequest(db, 'readonly', objectStoreNames.trays, (store) => store.get(normalizedTrayNumber));
      return tray ? normalizeTrayRecord(tray) : null;
    }

    async function listTrayAssignmentHistory() {
      const db = await openOrderStore();
      const records = await runRequest(db, 'readonly', objectStoreNames.trayAssignmentHistory, (store) => {
        if (typeof store.getAll === 'function') {
          return store.getAll();
        }
        return openCursorCollection(store);
      });
      return Array.isArray(records)
        ? records.map((record) => normalizeTrayAssignmentHistoryRecord(record)).sort(compareTrayAssignmentsNewestFirst)
        : [];
    }

    async function listPackingVerifications() {
      const db = await openOrderStore();
      const records = await runRequest(db, 'readonly', objectStoreNames.packingVerifications, (store) => {
        if (typeof store.getAll === 'function') {
          return store.getAll();
        }
        return openCursorCollection(store);
      });
      return Array.isArray(records)
        ? records.map((record) => normalizePackingVerificationRecord(record)).sort(comparePackingVerificationsNewestFirst)
        : [];
    }

    async function getPackingVerificationForOrder(forgeOrderUuid) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        return null;
      }
      const db = await openOrderStore();
      const record = await runRequest(db, 'readonly', objectStoreNames.packingVerifications, (store) => {
        const index = store.index(INDEX_NAMES.packingVerifications.forgeOrderUuid);
        return index.get(orderUuid);
      });
      return record ? normalizePackingVerificationRecord(record) : null;
    }

    async function hasCleanupTombstone(forgeOrderUuid) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        return false;
      }
      const db = await openOrderStore();
      const record = await runRequest(db, 'readonly', objectStoreNames.cleanupTombstones, (store) => store.get(orderUuid));
      return Boolean(record);
    }

    async function assignTrayToOrder(forgeOrderUuid, trayNumber) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      const normalizedTrayNumber = normalizeTrayNumber(trayNumber);
      if (!orderUuid) {
        throw new Error('Tray assignment requires a Forge order UUID.');
      }
      if (!normalizedTrayNumber) {
        throw new Error('Tray assignment requires a valid tray number.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [objectStoreNames.orders, objectStoreNames.trays, objectStoreNames.trayAssignmentHistory],
          'readwrite'
        );
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const traysStore = transaction.objectStore(objectStoreNames.trays);
        const trayAssignmentHistoryStore = transaction.objectStore(objectStoreNames.trayAssignmentHistory);
        const timestamp = normalizeDateValue(getNow()).toISOString();
        let assignmentResult = null;

        transaction.oncomplete = () => {
          resolve({
            ok: true,
            order: assignmentResult ? deepCloneValue(assignmentResult.order) : null,
            tray: assignmentResult ? deepCloneValue(assignmentResult.tray) : null,
            assignmentHistoryRecord: assignmentResult ? deepCloneValue(assignmentResult.assignmentHistoryRecord) : null
          });
        };
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Tray assignment failed.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Tray assignment was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          const normalizedExistingOrder = normalizeOrderRecordForRead(storedOrder);
          if (hasAssignedTray(normalizedExistingOrder)) {
            abortTransaction(transaction, new Error(`Order ${orderUuid.slice(0, 8).toUpperCase()} already has an active tray.`));
            return;
          }

          const trayRequest = traysStore.get(normalizedTrayNumber);
          trayRequest.onerror = () => abortTransaction(transaction, trayRequest.error || new Error('The selected tray could not be loaded.'));
          trayRequest.onsuccess = () => {
            const storedTray = trayRequest.result;
            if (!storedTray) {
              abortTransaction(transaction, new Error(`Tray ${normalizedTrayNumber} is not configured in this Forge database.`));
              return;
            }

            const normalizedTray = normalizeTrayRecord(storedTray);
            if (normalizedTray.tray_status === TRAY_STATUSES.outOfService) {
              abortTransaction(transaction, new Error(`Tray ${normalizedTrayNumber} is out of service.`));
              return;
            }
            if (normalizedTray.tray_status !== TRAY_STATUSES.available || asTrimmedString(normalizedTray.current_order_uuid)) {
              abortTransaction(transaction, new Error(`Tray ${normalizedTrayNumber} is no longer available.`));
              return;
            }

            const updatedOrder = normalizeLocalOrderRecord({
              ...deepCloneValue(storedOrder),
              updated_at: timestamp,
              production_status: PRODUCTION_STATUSES.trayAssigned,
              current_tray_number: normalizedTrayNumber
            });
            const updatedTray = createTrayRecord({
              ...deepCloneValue(storedTray),
              tray_number: normalizedTrayNumber,
              tray_status: TRAY_STATUSES.assigned,
              current_order_uuid: orderUuid,
              assigned_at: timestamp,
              updated_at: timestamp
            });
            const assignmentHistoryRecord = createTrayAssignmentHistoryRecord({
              tray_assignment_id: getRandomUuid(),
              tray_number: normalizedTrayNumber,
              forge_order_uuid: orderUuid,
              assigned_at: timestamp,
              released_at: null,
              release_reason: null
            });

            const putOrderRequest = ordersStore.put(deepCloneValue(updatedOrder));
            putOrderRequest.onerror = () => abortTransaction(transaction, putOrderRequest.error || new Error('The order could not be updated with its assigned tray.'));

            const putTrayRequest = traysStore.put(deepCloneValue(updatedTray));
            putTrayRequest.onerror = () => abortTransaction(transaction, putTrayRequest.error || new Error('The selected tray could not be assigned.'));

            const addHistoryRequest = trayAssignmentHistoryStore.add(deepCloneValue(assignmentHistoryRecord));
            addHistoryRequest.onerror = () => abortTransaction(transaction, addHistoryRequest.error || new Error('Tray assignment history could not be recorded.'));

            assignmentResult = {
              order: normalizeOrderRecordForRead(updatedOrder),
              tray: normalizeTrayRecord(updatedTray),
              assignmentHistoryRecord
            };
          };
        };
      });
    }

    async function incrementOrderItemCompletion(forgeOrderUuid, lineId) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      const normalizedLineId = asTrimmedString(lineId);
      if (!orderUuid) {
        throw new Error('Item completion requires a Forge order UUID.');
      }
      if (!normalizedLineId) {
        throw new Error('Item completion requires a valid line ID.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(objectStoreNames.orders, 'readwrite');
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const timestamp = normalizeDateValue(getNow()).toISOString();
        let completionResult = null;

        transaction.oncomplete = () => {
          resolve(completionResult);
        };
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Item completion failed.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Item completion was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
          if (!hasAssignedTray(normalizedOrder)) {
            abortTransaction(transaction, new Error('Assign a production tray before marking completed pieces.'));
            return;
          }
          if (isTerminalOrderProductionStatus(normalizedOrder.production_status)) {
            abortTransaction(transaction, new Error('This order can no longer be updated from the production queue.'));
            return;
          }

          const items = getNormalizedOrderItems(normalizedOrder);
          const itemIndex = items.findIndex((item) => item.line_id === normalizedLineId);
          if (itemIndex === -1) {
            abortTransaction(transaction, new Error('That saved item could not be found.'));
            return;
          }

          const item = items[itemIndex];
          if (item.production_status === ITEM_PRODUCTION_STATUSES.blocked) {
            abortTransaction(transaction, new Error('Blocked items cannot be marked complete until the issue is resolved.'));
            return;
          }
          if (item.production_status === ITEM_PRODUCTION_STATUSES.cancelled) {
            abortTransaction(transaction, new Error('Cancelled items cannot be marked complete.'));
            return;
          }

          if (item.completed_quantity >= item.quantity) {
            completionResult = {
              ok: true,
              alreadyComplete: true,
              record: normalizedOrder,
              order: normalizedOrder,
              item: deepCloneValue(item)
            };
            return;
          }

          const nextCompletedQuantity = item.completed_quantity + 1;
          const nextItemStatus = deriveItemProductionStatus({
            explicitStatus: item.production_status,
            completedQuantity: nextCompletedQuantity,
            quantity: item.quantity
          });
          const updatedItem = normalizeOrderItemRecord({
            ...deepCloneValue(item),
            completed_quantity: nextCompletedQuantity,
            completed_at: nextCompletedQuantity === item.quantity ? (item.completed_at || timestamp) : null,
            production_status: nextItemStatus,
            structured_attributes: {
              ...(item.structured_attributes || {}),
              production_status: nextItemStatus
            }
          }, item.line_number - 1, orderUuid);
          const updatedItems = items.slice();
          updatedItems[itemIndex] = updatedItem;
          const updatedOrder = createUpdatedOrderRecord(normalizedOrder, {
            items: updatedItems,
            updatedAt: timestamp
          });

          const putRequest = ordersStore.put(deepCloneValue(updatedOrder));
          putRequest.onerror = () => abortTransaction(transaction, putRequest.error || new Error('The item completion could not be saved.'));

          completionResult = {
            ok: true,
            alreadyComplete: false,
            record: updatedOrder,
            order: updatedOrder,
            item: deepCloneValue(updatedItem)
          };
        };
      });
    }

    async function updateInternalNote(forgeOrderUuid, internalNote) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Internal note updates require a Forge order UUID.');
      }

      const normalizedInternalNote = normalizeInternalNote(internalNote);
      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(objectStoreNames.orders, 'readwrite');
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const timestamp = normalizeDateValue(getNow()).toISOString();
        let updatedOrder = null;

        transaction.oncomplete = () => resolve({
          ok: true,
          order: updatedOrder
        });
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Internal notes could not be saved.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Internal note update was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          updatedOrder = normalizeOrderRecordForRead({
            ...deepCloneValue(storedOrder),
            updated_at: timestamp,
            internal_note: normalizedInternalNote
          });

          const putRequest = ordersStore.put(deepCloneValue(updatedOrder));
          putRequest.onerror = () => abortTransaction(transaction, putRequest.error || new Error('The internal note could not be saved.'));
        };
      });
    }

    async function cancelOrder(forgeOrderUuid) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Order cancellation requires a Forge order UUID.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [objectStoreNames.orders, objectStoreNames.trays, objectStoreNames.trayAssignmentHistory],
          'readwrite'
        );
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const traysStore = transaction.objectStore(objectStoreNames.trays);
        const trayAssignmentHistoryStore = transaction.objectStore(objectStoreNames.trayAssignmentHistory);
        const timestamp = normalizeDateValue(getNow()).toISOString();
        let cancellationResult = null;

        transaction.oncomplete = () => resolve(cancellationResult);
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Order cancellation failed.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Order cancellation was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
          if (getEventTypeForRecord(normalizedOrder) === 'test_session') {
            abortTransaction(transaction, new Error('Test Session orders must be deleted with Delete Test Order.'));
            return;
          }
          if (normalizeProductionStatus(normalizedOrder.production_status) === PRODUCTION_STATUSES.cancelled) {
            abortTransaction(transaction, new Error('This order has already been cancelled.'));
            return;
          }

          const trayNumber = normalizeNullableTrayNumber(normalizedOrder.current_tray_number);
          const updatedOrder = normalizeLocalOrderRecord({
            ...deepCloneValue(normalizedOrder),
            updated_at: timestamp,
            production_status: PRODUCTION_STATUSES.cancelled,
            current_tray_number: null,
            ready_to_pack_at: null,
            cancelled_at: timestamp
          });
          const putOrderRequest = ordersStore.put(deepCloneValue(updatedOrder));
          putOrderRequest.onerror = () => abortTransaction(transaction, putOrderRequest.error || new Error('The order could not be cancelled.'));

          if (trayNumber == null) {
            cancellationResult = {
              ok: true,
              order: normalizeOrderRecordForRead(updatedOrder),
              tray: null,
              assignmentHistoryRecord: null
            };
            return;
          }

          const trayRequest = traysStore.get(trayNumber);
          trayRequest.onerror = () => abortTransaction(transaction, trayRequest.error || new Error('The assigned tray could not be loaded.'));
          trayRequest.onsuccess = () => {
            const storedTray = trayRequest.result;
            const updatedTray = createTrayRecord({
              ...(storedTray ? deepCloneValue(storedTray) : {}),
              tray_number: trayNumber,
              tray_status: TRAY_STATUSES.available,
              current_order_uuid: null,
              assigned_at: null,
              updated_at: timestamp
            });
            const putTrayRequest = traysStore.put(deepCloneValue(updatedTray));
            putTrayRequest.onerror = () => abortTransaction(transaction, putTrayRequest.error || new Error('The assigned tray could not be released.'));

            const historyIndex = trayAssignmentHistoryStore.index(INDEX_NAMES.trayAssignmentHistory.forgeOrderUuid);
            const historyRequest = historyIndex.getAll(orderUuid);
            historyRequest.onerror = () => abortTransaction(transaction, historyRequest.error || new Error('Tray assignment history could not be loaded.'));
            historyRequest.onsuccess = () => {
              const historyRecords = Array.isArray(historyRequest.result) ? historyRequest.result : [];
              const activeHistoryRecord = historyRecords
                .map((record) => normalizeTrayAssignmentHistoryRecord(record))
                .find((record) => record.tray_number === trayNumber && !record.released_at);

              if (activeHistoryRecord) {
                const releasedHistoryRecord = createTrayAssignmentHistoryRecord({
                  ...deepCloneValue(activeHistoryRecord),
                  released_at: timestamp,
                  release_reason: 'cancelled'
                });
                const putHistoryRequest = trayAssignmentHistoryStore.put(deepCloneValue(releasedHistoryRecord));
                putHistoryRequest.onerror = () => abortTransaction(transaction, putHistoryRequest.error || new Error('Tray release history could not be saved.'));
                cancellationResult = {
                  ok: true,
                  order: normalizeOrderRecordForRead(updatedOrder),
                  tray: normalizeTrayRecord(updatedTray),
                  assignmentHistoryRecord: normalizeTrayAssignmentHistoryRecord(releasedHistoryRecord)
                };
                return;
              }

              cancellationResult = {
                ok: true,
                order: normalizeOrderRecordForRead(updatedOrder),
                tray: normalizeTrayRecord(updatedTray),
                assignmentHistoryRecord: null
              };
            };
          };
        };
      });
    }

    async function deleteTestOrder(forgeOrderUuid, confirmationText) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Delete Test Order requires a Forge order UUID.');
      }
      if (asTrimmedString(confirmationText) !== ORDER_DELETE_TEST_CONFIRMATION_TEXT) {
        throw new Error('Enter DELETE TEST ORDER before deleting this order.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [
            objectStoreNames.orders,
            objectStoreNames.trays,
            objectStoreNames.trayAssignmentHistory,
            objectStoreNames.packingVerifications,
            objectStoreNames.cleanupTombstones
          ],
          'readwrite'
        );
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const traysStore = transaction.objectStore(objectStoreNames.trays);
        const trayAssignmentHistoryStore = transaction.objectStore(objectStoreNames.trayAssignmentHistory);
        const packingVerificationsStore = transaction.objectStore(objectStoreNames.packingVerifications);
        const cleanupTombstonesStore = transaction.objectStore(objectStoreNames.cleanupTombstones);
        const timestamp = normalizeDateValue(getNow()).toISOString();
        let deleteResult = null;

        transaction.oncomplete = () => resolve(deleteResult);
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Test order deletion failed.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Test order deletion was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
          if (getEventTypeForRecord(normalizedOrder) !== 'test_session') {
            abortTransaction(transaction, new Error('Only Test Session orders can be permanently deleted.'));
            return;
          }

          const trayNumber = normalizeNullableTrayNumber(normalizedOrder.current_tray_number);

          const finalizeDelete = () => {
            const putTombstoneRequest = cleanupTombstonesStore.put(createCleanupTombstoneRecord({
              forge_order_uuid: orderUuid,
              deleted_at: timestamp
            }));
            putTombstoneRequest.onerror = () => abortTransaction(transaction, putTombstoneRequest.error || new Error('The cleanup tombstone could not be saved.'));

            const deleteOrderRequest = ordersStore.delete(orderUuid);
            deleteOrderRequest.onerror = () => abortTransaction(transaction, deleteOrderRequest.error || new Error('The saved test order could not be deleted.'));

            deleteResult = {
              ok: true,
              deletedOrderUuid: orderUuid,
              deletedOrderNumber: normalizedOrder.forge_order_number || null,
              releasedTrayNumber: trayNumber || null
            };
          };

          const deleteHistoryAndVerification = () => {
            const historyIndex = trayAssignmentHistoryStore.index(INDEX_NAMES.trayAssignmentHistory.forgeOrderUuid);
            const historyRequest = historyIndex.getAll(orderUuid);
            historyRequest.onerror = () => abortTransaction(transaction, historyRequest.error || new Error('Tray assignment history could not be loaded.'));
            historyRequest.onsuccess = () => {
              const historyRecords = Array.isArray(historyRequest.result) ? historyRequest.result : [];
              historyRecords.forEach((record) => {
                const deleteHistoryRequest = trayAssignmentHistoryStore.delete(record.tray_assignment_id);
                deleteHistoryRequest.onerror = () => abortTransaction(transaction, deleteHistoryRequest.error || new Error('Tray assignment history could not be deleted.'));
              });

              const verificationIndex = packingVerificationsStore.index(INDEX_NAMES.packingVerifications.forgeOrderUuid);
              const verificationRequest = verificationIndex.get(orderUuid);
              verificationRequest.onerror = () => abortTransaction(transaction, verificationRequest.error || new Error('Packing verification could not be loaded.'));
              verificationRequest.onsuccess = () => {
                const verificationRecord = verificationRequest.result;
                if (verificationRecord) {
                  const deleteVerificationRequest = packingVerificationsStore.delete(verificationRecord.packing_verification_id);
                  deleteVerificationRequest.onerror = () => abortTransaction(transaction, deleteVerificationRequest.error || new Error('Packing verification could not be deleted.'));
                }
                finalizeDelete();
              };
            };
          };

          if (trayNumber == null) {
            deleteHistoryAndVerification();
            return;
          }

          const trayRequest = traysStore.get(trayNumber);
          trayRequest.onerror = () => abortTransaction(transaction, trayRequest.error || new Error('The assigned tray could not be loaded.'));
          trayRequest.onsuccess = () => {
            const storedTray = trayRequest.result;
            const updatedTray = createTrayRecord({
              ...(storedTray ? deepCloneValue(storedTray) : {}),
              tray_number: trayNumber,
              tray_status: TRAY_STATUSES.available,
              current_order_uuid: null,
              assigned_at: null,
              updated_at: timestamp
            });
            const putTrayRequest = traysStore.put(deepCloneValue(updatedTray));
            putTrayRequest.onerror = () => abortTransaction(transaction, putTrayRequest.error || new Error('The assigned tray could not be released.'));

            const historyIndex = trayAssignmentHistoryStore.index(INDEX_NAMES.trayAssignmentHistory.forgeOrderUuid);
            const historyRequest = historyIndex.getAll(orderUuid);
            historyRequest.onerror = () => abortTransaction(transaction, historyRequest.error || new Error('Tray assignment history could not be loaded.'));
            historyRequest.onsuccess = () => {
              const historyRecords = Array.isArray(historyRequest.result) ? historyRequest.result : [];
              historyRecords
                .map((record) => normalizeTrayAssignmentHistoryRecord(record))
                .filter((record) => !record.released_at)
                .forEach((record) => {
                  const putHistoryRequest = trayAssignmentHistoryStore.put(createTrayAssignmentHistoryRecord({
                    ...deepCloneValue(record),
                    released_at: timestamp,
                    release_reason: 'deleted_test_order'
                  }));
                  putHistoryRequest.onerror = () => abortTransaction(transaction, putHistoryRequest.error || new Error('Tray release history could not be saved.'));
                });
              deleteHistoryAndVerification();
            };
          };
        };
      });
    }

    async function previewShippingExport(eventId) {
      const normalizedEventId = asTrimmedString(eventId);
      if (!normalizedEventId) {
        throw new Error('A valid event is required.');
      }

      const records = await listOrders();
      return buildLocalShippingExportPreview(records, normalizedEventId);
    }

    async function generateShippingExportCsv(eventId) {
      const preview = await previewShippingExport(eventId);
      if (!preview.has_exportable_rows) {
        throw new Error('No shipping orders with complete addresses are available for that event.');
      }

      return {
        filename: preview.csv_filename,
        csv: buildLocalShippingExportCsv(preview.included_orders)
      };
    }

    async function completePackingVerification(forgeOrderUuid, verifiedItemIds, packingNote) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid) {
        throw new Error('Packing verification requires a Forge order UUID.');
      }

      const db = await openOrderStore();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [
            objectStoreNames.orders,
            objectStoreNames.trays,
            objectStoreNames.trayAssignmentHistory,
            objectStoreNames.packingVerifications
          ],
          'readwrite'
        );
        const ordersStore = transaction.objectStore(objectStoreNames.orders);
        const traysStore = transaction.objectStore(objectStoreNames.trays);
        const trayAssignmentHistoryStore = transaction.objectStore(objectStoreNames.trayAssignmentHistory);
        const packingVerificationsStore = transaction.objectStore(objectStoreNames.packingVerifications);
        const timestamp = normalizeDateValue(getNow()).toISOString();
        let packingResult = null;

        transaction.oncomplete = () => resolve(packingResult);
        transaction.onerror = () => reject(transaction.__forgeError || transaction.error || new Error('Packing verification failed.'));
        transaction.onabort = () => reject(transaction.__forgeError || transaction.error || new Error('Packing verification was aborted.'));

        const orderRequest = ordersStore.get(orderUuid);
        orderRequest.onerror = () => abortTransaction(transaction, orderRequest.error || new Error('The selected order could not be loaded.'));
        orderRequest.onsuccess = () => {
          const storedOrder = orderRequest.result;
          if (!storedOrder) {
            abortTransaction(transaction, new Error('That saved order could not be found.'));
            return;
          }

          const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
          const orderValidation = validateOrderPackingEligibility(normalizedOrder);
          if (!orderValidation.ok) {
            abortTransaction(transaction, new Error(orderValidation.error));
            return;
          }

          const trayNumber = orderValidation.trayNumber;
          const trayRequest = traysStore.get(trayNumber);
          trayRequest.onerror = () => abortTransaction(transaction, trayRequest.error || new Error('The assigned tray could not be loaded.'));
          trayRequest.onsuccess = () => {
            const storedTray = trayRequest.result;
            if (!storedTray) {
              abortTransaction(transaction, new Error(`Tray ${trayNumber} could not be found.`));
              return;
            }

            const normalizedTray = normalizeTrayRecord(storedTray);
            if (normalizedTray.tray_status !== TRAY_STATUSES.assigned) {
              abortTransaction(transaction, new Error(`Tray ${trayNumber} is no longer assigned.`));
              return;
            }
            if (asTrimmedString(normalizedTray.current_order_uuid) !== orderUuid) {
              abortTransaction(transaction, new Error(`Tray ${trayNumber} is assigned to a different order.`));
              return;
            }

            const historyIndex = trayAssignmentHistoryStore.index(INDEX_NAMES.trayAssignmentHistory.forgeOrderUuid);
            const historyRequest = historyIndex.getAll(orderUuid);
            historyRequest.onerror = () => abortTransaction(transaction, historyRequest.error || new Error('Tray assignment history could not be loaded.'));
            historyRequest.onsuccess = () => {
              const historyRecords = Array.isArray(historyRequest.result) ? historyRequest.result : [];
              const activeHistoryRecord = historyRecords
                .map((record) => normalizeTrayAssignmentHistoryRecord(record))
                .find((record) => record.tray_number === trayNumber && !record.released_at);

              if (!activeHistoryRecord) {
                abortTransaction(transaction, new Error(`Tray ${trayNumber} does not have an active assignment record for this order.`));
                return;
              }

              const verificationValidation = validatePackingVerificationSubmission(normalizedOrder, verifiedItemIds);
              if (!verificationValidation.ok) {
                abortTransaction(transaction, new Error(verificationValidation.error));
                return;
              }

              const packingVerificationRecord = createPackingVerificationRecord({
                packing_verification_id: getRandomUuid(),
                forge_order_uuid: orderUuid,
                tray_number: trayNumber,
                verified_item_ids: verificationValidation.verifiedItemIds,
                verified_at: timestamp,
                packing_note: packingNote
              });
              const updatedOrder = normalizeLocalOrderRecord({
                ...deepCloneValue(normalizedOrder),
                updated_at: timestamp,
                production_status: PRODUCTION_STATUSES.packed,
                current_tray_number: null,
                packed_at: timestamp,
                ready_to_pack_at: normalizedOrder.ready_to_pack_at
              });
              const updatedTray = createTrayRecord({
                ...deepCloneValue(normalizedTray),
                tray_number: trayNumber,
                tray_status: TRAY_STATUSES.available,
                current_order_uuid: null,
                assigned_at: null,
                updated_at: timestamp
              });
              const releasedHistoryRecord = createTrayAssignmentHistoryRecord({
                ...deepCloneValue(activeHistoryRecord),
                released_at: timestamp,
                release_reason: 'packed'
              });

              const putOrderRequest = ordersStore.put(deepCloneValue(updatedOrder));
              putOrderRequest.onerror = () => abortTransaction(transaction, putOrderRequest.error || new Error('The order could not be marked packed.'));

              const putTrayRequest = traysStore.put(deepCloneValue(updatedTray));
              putTrayRequest.onerror = () => abortTransaction(transaction, putTrayRequest.error || new Error('The assigned tray could not be released.'));

              const putHistoryRequest = trayAssignmentHistoryStore.put(deepCloneValue(releasedHistoryRecord));
              putHistoryRequest.onerror = () => abortTransaction(transaction, putHistoryRequest.error || new Error('Tray release history could not be saved.'));

              const addVerificationRequest = packingVerificationsStore.add(deepCloneValue(packingVerificationRecord));
              addVerificationRequest.onerror = () => abortTransaction(transaction, addVerificationRequest.error || new Error('The packing verification record could not be saved.'));

              packingResult = {
                ok: true,
                order: normalizeOrderRecordForRead(updatedOrder),
                tray: normalizeTrayRecord(updatedTray),
                assignmentHistoryRecord: normalizeTrayAssignmentHistoryRecord(releasedHistoryRecord),
                packingVerification: normalizePackingVerificationRecord(packingVerificationRecord)
              };
            };
          };
        };
      });
    }

    return {
      openOrderStore,
      saveNewOrder,
      getOrder,
      listOrders,
      countOrdersBySyncStatus,
      markOrderServerUploadAttempt,
      markOrderServerUploadSuccess,
      markOrderServerUploadFailure,
      listTrays,
      getTray,
      listTrayAssignmentHistory,
      listPackingVerifications,
      getPackingVerificationForOrder,
      hasCleanupTombstone,
      assignTrayToOrder,
      incrementOrderItemCompletion,
      updateInternalNote,
      cancelOrder,
      deleteTestOrder,
      previewShippingExport,
      generateShippingExportCsv,
      completePackingVerification
    };
  }

  function createInMemoryOrderStore(options = {}) {
    const trayInventoryConfig = normalizeTrayInventoryConfig(options.trayInventory || DEFAULT_TRAY_INVENTORY);
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const getRandomUuid = typeof options.randomUUID === 'function' ? options.randomUUID : createStoreUuid;
    const records = new Map();
    const trays = new Map();
    const trayAssignmentHistory = new Map();
    const packingVerifications = new Map();
    const cleanupTombstones = new Map();

    trayInventoryConfig.initialTrayNumbers.forEach((trayNumber) => {
      trays.set(trayNumber, createTrayRecord({ tray_number: trayNumber }));
    });

    (Array.isArray(options.initialOrders) ? options.initialOrders : []).forEach((record) => {
      const normalizedRecord = normalizeLocalOrderRecord(record);
      records.set(normalizedRecord.forge_order_uuid, deepCloneValue(normalizedRecord));
    });
    (Array.isArray(options.initialTrays) ? options.initialTrays : []).forEach((tray) => {
      const normalizedTray = createTrayRecord(tray);
      trays.set(normalizedTray.tray_number, deepCloneValue(normalizedTray));
    });
    (Array.isArray(options.initialTrayAssignmentHistory) ? options.initialTrayAssignmentHistory : []).forEach((record) => {
      const normalizedRecord = createTrayAssignmentHistoryRecord(record);
      trayAssignmentHistory.set(normalizedRecord.tray_assignment_id, deepCloneValue(normalizedRecord));
    });
    (Array.isArray(options.initialPackingVerifications) ? options.initialPackingVerifications : []).forEach((record) => {
      const normalizedRecord = createPackingVerificationRecord(record);
      packingVerifications.set(normalizedRecord.packing_verification_id, deepCloneValue(normalizedRecord));
    });

    return {
      async openOrderStore() {
        return { databaseName: 'in-memory-forge-orders' };
      },
      async saveNewOrder(record) {
        const normalizedRecord = normalizeLocalOrderRecord(record);
        if (cleanupTombstones.has(normalizedRecord.forge_order_uuid)) {
          throw new Error('This Forge order UUID was previously deleted and cannot be saved again.');
        }
        const existing = records.get(normalizedRecord.forge_order_uuid);
        if (existing) {
          return {
            ok: true,
            duplicatePrevented: true,
            wasInserted: false,
            record: normalizeOrderRecordForRead(existing)
          };
        }
        records.set(normalizedRecord.forge_order_uuid, deepCloneValue(normalizedRecord));
        return {
          ok: true,
          duplicatePrevented: false,
          wasInserted: true,
          record: normalizeOrderRecordForRead(normalizedRecord)
        };
      },
      async getOrder(forgeOrderUuid) {
        const record = records.get(asTrimmedString(forgeOrderUuid));
        return record ? normalizeOrderRecordForRead(record) : null;
      },
      async listOrders() {
        return [...records.values()].map((record) => normalizeOrderRecordForRead(record)).sort(compareOrdersNewestFirst);
      },
      async countOrdersBySyncStatus(syncStatus) {
        const targetStatus = asTrimmedString(syncStatus);
        return [...records.values()].filter((record) => asTrimmedString(record.sync_status) === targetStatus).length;
      },
      async markOrderServerUploadAttempt(forgeOrderUuid, attemptedAt = normalizeDateValue(getNow()).toISOString()) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }

        const timestamp = normalizeDateValue(attemptedAt).toISOString();
        const updatedRecord = normalizeLocalOrderRecord({
          ...deepCloneValue(storedOrder),
          updated_at: timestamp,
          server_upload_status: SERVER_UPLOAD_STATUSES.uploading,
          server_upload_attempt_count: getServerUploadAttemptCount(storedOrder) + 1,
          last_server_upload_attempt_at: timestamp,
          last_server_upload_error: null
        });

        records.set(orderUuid, deepCloneValue(updatedRecord));
        return normalizeOrderRecordForRead(updatedRecord);
      },
      async markOrderServerUploadSuccess(forgeOrderUuid, result, updatedAt = normalizeDateValue(getNow()).toISOString()) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }
        validateServerUploadSuccessResult(orderUuid, result);

        const timestamp = normalizeDateValue(updatedAt).toISOString();
        const updatedRecord = normalizeLocalOrderRecord({
          ...deepCloneValue(storedOrder),
          updated_at: timestamp,
          server_upload_status: SERVER_UPLOAD_STATUSES.stored,
          server_received_at: result.receivedAt,
          server_payload_sha256: result.payloadSha256,
          server_created: result.created,
          forge_order_number: result.forgeOrderNumber,
          last_server_upload_error: null
        });

        records.set(orderUuid, deepCloneValue(updatedRecord));
        return normalizeOrderRecordForRead(updatedRecord);
      },
      async markOrderServerUploadFailure(forgeOrderUuid, error, updatedAt = normalizeDateValue(getNow()).toISOString()) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }

        const timestamp = normalizeDateValue(updatedAt).toISOString();
        const safeError = sanitizeServerUploadError(error);
        const updatedRecord = normalizeLocalOrderRecord({
          ...deepCloneValue(storedOrder),
          updated_at: timestamp,
          server_upload_status: safeError.code === 'uuid_conflict'
            ? SERVER_UPLOAD_STATUSES.conflict
            : SERVER_UPLOAD_STATUSES.failed,
          last_server_upload_error: safeError
        });

        records.set(orderUuid, deepCloneValue(updatedRecord));
        return normalizeOrderRecordForRead(updatedRecord);
      },
      async listTrays() {
        return [...trays.values()].map((tray) => normalizeTrayRecord(tray)).sort(compareTraysByNumber);
      },
      async getTray(trayNumber) {
        const tray = trays.get(normalizeTrayNumber(trayNumber));
        return tray ? normalizeTrayRecord(tray) : null;
      },
      async listTrayAssignmentHistory() {
        return [...trayAssignmentHistory.values()].map((record) => normalizeTrayAssignmentHistoryRecord(record)).sort(compareTrayAssignmentsNewestFirst);
      },
      async listPackingVerifications() {
        return [...packingVerifications.values()].map((record) => normalizePackingVerificationRecord(record)).sort(comparePackingVerificationsNewestFirst);
      },
      async getPackingVerificationForOrder(forgeOrderUuid) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        for (const record of packingVerifications.values()) {
          if (asTrimmedString(record.forge_order_uuid) === orderUuid) {
            return normalizePackingVerificationRecord(record);
          }
        }
        return null;
      },
      async hasCleanupTombstone(forgeOrderUuid) {
        return cleanupTombstones.has(asTrimmedString(forgeOrderUuid));
      },
      async assignTrayToOrder(forgeOrderUuid, trayNumber) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const normalizedTrayNumber = normalizeTrayNumber(trayNumber);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }
        const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
        if (hasAssignedTray(normalizedOrder)) {
          throw new Error(`Order ${orderUuid.slice(0, 8).toUpperCase()} already has an active tray.`);
        }

        const storedTray = trays.get(normalizedTrayNumber);
        if (!storedTray) {
          throw new Error(`Tray ${normalizedTrayNumber} is not configured in this Forge database.`);
        }

        const normalizedTray = normalizeTrayRecord(storedTray);
        if (normalizedTray.tray_status === TRAY_STATUSES.outOfService) {
          throw new Error(`Tray ${normalizedTrayNumber} is out of service.`);
        }
        if (normalizedTray.tray_status !== TRAY_STATUSES.available || asTrimmedString(normalizedTray.current_order_uuid)) {
          throw new Error(`Tray ${normalizedTrayNumber} is no longer available.`);
        }

        const timestamp = normalizeDateValue(getNow()).toISOString();
        const updatedOrder = normalizeLocalOrderRecord({
          ...deepCloneValue(storedOrder),
          updated_at: timestamp,
          production_status: PRODUCTION_STATUSES.trayAssigned,
          current_tray_number: normalizedTrayNumber
        });
        const updatedTray = createTrayRecord({
          ...deepCloneValue(storedTray),
          tray_number: normalizedTrayNumber,
          tray_status: TRAY_STATUSES.assigned,
          current_order_uuid: orderUuid,
          assigned_at: timestamp,
          updated_at: timestamp
        });
        const assignmentHistoryRecord = createTrayAssignmentHistoryRecord({
          tray_assignment_id: getRandomUuid(),
          tray_number: normalizedTrayNumber,
          forge_order_uuid: orderUuid,
          assigned_at: timestamp,
          released_at: null,
          release_reason: null
        });

        records.set(orderUuid, deepCloneValue(updatedOrder));
        trays.set(normalizedTrayNumber, deepCloneValue(updatedTray));
        trayAssignmentHistory.set(assignmentHistoryRecord.tray_assignment_id, deepCloneValue(assignmentHistoryRecord));

        return {
          ok: true,
          order: normalizeOrderRecordForRead(updatedOrder),
          tray: normalizeTrayRecord(updatedTray),
          assignmentHistoryRecord: normalizeTrayAssignmentHistoryRecord(assignmentHistoryRecord)
        };
      },
      async incrementOrderItemCompletion(forgeOrderUuid, lineId) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const normalizedLineId = asTrimmedString(lineId);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }
        if (!normalizedLineId) {
          throw new Error('Item completion requires a valid line ID.');
        }

        const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
        if (!hasAssignedTray(normalizedOrder)) {
          throw new Error('Assign a production tray before marking completed pieces.');
        }
        if (isTerminalOrderProductionStatus(normalizedOrder.production_status)) {
          throw new Error('This order can no longer be updated from the production queue.');
        }

        const items = getNormalizedOrderItems(normalizedOrder);
        const itemIndex = items.findIndex((item) => item.line_id === normalizedLineId);
        if (itemIndex === -1) {
          throw new Error('That saved item could not be found.');
        }

        const item = items[itemIndex];
        if (item.production_status === ITEM_PRODUCTION_STATUSES.blocked) {
          throw new Error('Blocked items cannot be marked complete until the issue is resolved.');
        }
        if (item.production_status === ITEM_PRODUCTION_STATUSES.cancelled) {
          throw new Error('Cancelled items cannot be marked complete.');
        }

        if (item.completed_quantity >= item.quantity) {
          return {
            ok: true,
            alreadyComplete: true,
            record: normalizedOrder,
            order: normalizedOrder,
            item: deepCloneValue(item)
          };
        }

        const timestamp = normalizeDateValue(getNow()).toISOString();
        const nextCompletedQuantity = item.completed_quantity + 1;
        const nextItemStatus = deriveItemProductionStatus({
          explicitStatus: item.production_status,
          completedQuantity: nextCompletedQuantity,
          quantity: item.quantity
        });
        const updatedItem = normalizeOrderItemRecord({
          ...deepCloneValue(item),
          completed_quantity: nextCompletedQuantity,
          completed_at: nextCompletedQuantity === item.quantity ? (item.completed_at || timestamp) : null,
          production_status: nextItemStatus,
          structured_attributes: {
            ...(item.structured_attributes || {}),
            production_status: nextItemStatus
          }
        }, item.line_number - 1, orderUuid);
        const updatedItems = items.slice();
        updatedItems[itemIndex] = updatedItem;
        const updatedOrder = createUpdatedOrderRecord(normalizedOrder, {
          items: updatedItems,
          updatedAt: timestamp
        });

        records.set(orderUuid, deepCloneValue(updatedOrder));

        return {
          ok: true,
          alreadyComplete: false,
          record: updatedOrder,
          order: updatedOrder,
          item: deepCloneValue(updatedItem)
        };
      },
      async updateInternalNote(forgeOrderUuid, internalNote) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }

        const timestamp = normalizeDateValue(getNow()).toISOString();
        const updatedOrder = normalizeOrderRecordForRead({
          ...deepCloneValue(storedOrder),
          updated_at: timestamp,
          internal_note: normalizeInternalNote(internalNote)
        });

        records.set(orderUuid, deepCloneValue(updatedOrder));
        return {
          ok: true,
          order: updatedOrder
        };
      },
      async cancelOrder(forgeOrderUuid) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }

        const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
        if (getEventTypeForRecord(normalizedOrder) === 'test_session') {
          throw new Error('Test Session orders must be deleted with Delete Test Order.');
        }
        if (normalizeProductionStatus(normalizedOrder.production_status) === PRODUCTION_STATUSES.cancelled) {
          throw new Error('This order has already been cancelled.');
        }

        const timestamp = normalizeDateValue(getNow()).toISOString();
        const trayNumber = normalizeNullableTrayNumber(normalizedOrder.current_tray_number);
        const updatedOrder = normalizeLocalOrderRecord({
          ...deepCloneValue(normalizedOrder),
          updated_at: timestamp,
          production_status: PRODUCTION_STATUSES.cancelled,
          current_tray_number: null,
          ready_to_pack_at: null,
          cancelled_at: timestamp
        });
        records.set(orderUuid, deepCloneValue(updatedOrder));

        let tray = null;
        let assignmentHistoryRecord = null;
        if (trayNumber != null) {
          const existingTray = trays.get(trayNumber);
          const updatedTray = createTrayRecord({
            ...(existingTray ? deepCloneValue(existingTray) : {}),
            tray_number: trayNumber,
            tray_status: TRAY_STATUSES.available,
            current_order_uuid: null,
            assigned_at: null,
            updated_at: timestamp
          });
          trays.set(trayNumber, deepCloneValue(updatedTray));
          tray = normalizeTrayRecord(updatedTray);

          for (const [assignmentId, record] of trayAssignmentHistory.entries()) {
            const normalizedRecord = normalizeTrayAssignmentHistoryRecord(record);
            if (normalizedRecord.forge_order_uuid === orderUuid && normalizedRecord.tray_number === trayNumber && !normalizedRecord.released_at) {
              assignmentHistoryRecord = createTrayAssignmentHistoryRecord({
                ...deepCloneValue(normalizedRecord),
                released_at: timestamp,
                release_reason: 'cancelled'
              });
              trayAssignmentHistory.set(assignmentId, deepCloneValue(assignmentHistoryRecord));
            }
          }
        }

        return {
          ok: true,
          order: normalizeOrderRecordForRead(updatedOrder),
          tray,
          assignmentHistoryRecord: assignmentHistoryRecord ? normalizeTrayAssignmentHistoryRecord(assignmentHistoryRecord) : null
        };
      },
      async deleteTestOrder(forgeOrderUuid, confirmationText) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        if (asTrimmedString(confirmationText) !== ORDER_DELETE_TEST_CONFIRMATION_TEXT) {
          throw new Error('Enter DELETE TEST ORDER before deleting this order.');
        }

        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }

        const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
        if (getEventTypeForRecord(normalizedOrder) !== 'test_session') {
          throw new Error('Only Test Session orders can be permanently deleted.');
        }

        const timestamp = normalizeDateValue(getNow()).toISOString();
        const trayNumber = normalizeNullableTrayNumber(normalizedOrder.current_tray_number);
        if (trayNumber != null) {
          const existingTray = trays.get(trayNumber);
          trays.set(trayNumber, createTrayRecord({
            ...(existingTray ? deepCloneValue(existingTray) : {}),
            tray_number: trayNumber,
            tray_status: TRAY_STATUSES.available,
            current_order_uuid: null,
            assigned_at: null,
            updated_at: timestamp
          }));
        }

        for (const [assignmentId, record] of trayAssignmentHistory.entries()) {
          const normalizedRecord = normalizeTrayAssignmentHistoryRecord(record);
          if (normalizedRecord.forge_order_uuid === orderUuid) {
            trayAssignmentHistory.delete(assignmentId);
          }
        }

        for (const [verificationId, record] of packingVerifications.entries()) {
          const normalizedRecord = normalizePackingVerificationRecord(record);
          if (normalizedRecord.forge_order_uuid === orderUuid) {
            packingVerifications.delete(verificationId);
          }
        }

        cleanupTombstones.set(orderUuid, createCleanupTombstoneRecord({
          forge_order_uuid: orderUuid,
          deleted_at: timestamp
        }));
        records.delete(orderUuid);

        return {
          ok: true,
          deletedOrderUuid: orderUuid,
          deletedOrderNumber: normalizedOrder.forge_order_number || null,
          releasedTrayNumber: trayNumber || null
        };
      },
      async previewShippingExport(eventId) {
        return buildLocalShippingExportPreview(
          [...records.values()].map((record) => normalizeOrderRecordForRead(record)).sort(compareOrdersNewestFirst),
          asTrimmedString(eventId)
        );
      },
      async generateShippingExportCsv(eventId) {
        const preview = await this.previewShippingExport(eventId);
        if (!preview.has_exportable_rows) {
          throw new Error('No shipping orders with complete addresses are available for that event.');
        }

        return {
          filename: preview.csv_filename,
          csv: buildLocalShippingExportCsv(preview.included_orders)
        };
      },
      async completePackingVerification(forgeOrderUuid, verifiedItemIds, packingNote) {
        const orderUuid = asTrimmedString(forgeOrderUuid);
        if (!orderUuid) {
          throw new Error('Packing verification requires a Forge order UUID.');
        }

        const storedOrder = records.get(orderUuid);
        if (!storedOrder) {
          throw new Error('That saved order could not be found.');
        }

        const normalizedOrder = normalizeOrderRecordForRead(storedOrder);
        const orderValidation = validateOrderPackingEligibility(normalizedOrder);
        if (!orderValidation.ok) {
          throw new Error(orderValidation.error);
        }

        const trayNumber = orderValidation.trayNumber;
        const storedTray = trays.get(trayNumber);
        if (!storedTray) {
          throw new Error(`Tray ${trayNumber} could not be found.`);
        }

        const normalizedTray = normalizeTrayRecord(storedTray);
        if (normalizedTray.tray_status !== TRAY_STATUSES.assigned) {
          throw new Error(`Tray ${trayNumber} is no longer assigned.`);
        }
        if (asTrimmedString(normalizedTray.current_order_uuid) !== orderUuid) {
          throw new Error(`Tray ${trayNumber} is assigned to a different order.`);
        }

        const activeHistoryRecord = [...trayAssignmentHistory.values()]
          .map((record) => normalizeTrayAssignmentHistoryRecord(record))
          .find((record) => record.forge_order_uuid === orderUuid && record.tray_number === trayNumber && !record.released_at);
        if (!activeHistoryRecord) {
          throw new Error(`Tray ${trayNumber} does not have an active assignment record for this order.`);
        }

        const verificationValidation = validatePackingVerificationSubmission(normalizedOrder, verifiedItemIds);
        if (!verificationValidation.ok) {
          throw new Error(verificationValidation.error);
        }

        const timestamp = normalizeDateValue(getNow()).toISOString();
        const packingVerificationRecord = createPackingVerificationRecord({
          packing_verification_id: getRandomUuid(),
          forge_order_uuid: orderUuid,
          tray_number: trayNumber,
          verified_item_ids: verificationValidation.verifiedItemIds,
          verified_at: timestamp,
          packing_note: packingNote
        });
        if ([...packingVerifications.values()].some((record) => record.forge_order_uuid === orderUuid)) {
          throw new Error('This order has already been packed.');
        }

        const updatedOrder = normalizeLocalOrderRecord({
          ...deepCloneValue(normalizedOrder),
          updated_at: timestamp,
          production_status: PRODUCTION_STATUSES.packed,
          current_tray_number: null,
          packed_at: timestamp,
          ready_to_pack_at: normalizedOrder.ready_to_pack_at
        });
        const updatedTray = createTrayRecord({
          ...deepCloneValue(normalizedTray),
          tray_number: trayNumber,
          tray_status: TRAY_STATUSES.available,
          current_order_uuid: null,
          assigned_at: null,
          updated_at: timestamp
        });
        const releasedHistoryRecord = createTrayAssignmentHistoryRecord({
          ...deepCloneValue(activeHistoryRecord),
          released_at: timestamp,
          release_reason: 'packed'
        });

        records.set(orderUuid, deepCloneValue(updatedOrder));
        trays.set(trayNumber, deepCloneValue(updatedTray));
        trayAssignmentHistory.set(releasedHistoryRecord.tray_assignment_id, deepCloneValue(releasedHistoryRecord));
        packingVerifications.set(packingVerificationRecord.packing_verification_id, deepCloneValue(packingVerificationRecord));

        return {
          ok: true,
          order: normalizeOrderRecordForRead(updatedOrder),
          tray: normalizeTrayRecord(updatedTray),
          assignmentHistoryRecord: normalizeTrayAssignmentHistoryRecord(releasedHistoryRecord),
          packingVerification: normalizePackingVerificationRecord(packingVerificationRecord)
        };
      }
    };
  }

  function ensureIndex(store, indexName, keyPath, options = {}) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, { unique: Boolean(options.unique) });
    }
  }

  function ensureTrayInventory(db, trayStoreName, trayInventoryConfig) {
    if (!db.objectStoreNames.contains(trayStoreName)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(trayStoreName, 'readwrite');
      const store = transaction.objectStore(trayStoreName);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Forge tray inventory could not be verified.'));
      transaction.onabort = () => reject(transaction.error || new Error('Forge tray inventory verification was aborted.'));

      trayInventoryConfig.initialTrayNumbers.forEach((trayNumber) => {
        const request = store.get(trayNumber);
        request.onerror = () => abortTransaction(transaction, request.error || new Error(`Tray ${trayNumber} could not be verified.`));
        request.onsuccess = () => {
          if (!request.result) {
            const addRequest = store.add(createTrayRecord({ tray_number: trayNumber }));
            addRequest.onerror = () => abortTransaction(transaction, addRequest.error || new Error(`Tray ${trayNumber} could not be created.`));
          }
        };
      });
    });
  }

  function runRequest(db, mode, objectStoreName, createRequest, options = {}) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(objectStoreName, mode);
      const store = transaction.objectStore(objectStoreName);
      let requestResult;
      const request = createRequest(store);

      if (request && typeof request.then === 'function') {
        request.then(resolve, reject);
        return;
      }

      transaction.oncomplete = () => resolve(requestResult);
      transaction.onerror = () => reject(transaction.error || request?.error || new Error('Forge order transaction failed.'));
      transaction.onabort = () => reject(transaction.error || request?.error || new Error('Forge order transaction was aborted.'));
      request.onsuccess = () => {
        requestResult = request.result;
      };
      request.onerror = () => reject(request.error || new Error('Forge order request failed.'));
    });
  }

  function openCursorCollection(store) {
    return new Promise((resolve, reject) => {
      const records = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(records);
          return;
        }
        records.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error('Unable to list saved Forge records.'));
    });
  }

  function normalizeOrderPayload(payload, forgeOrderUuid) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const normalizedItems = Array.isArray(source.items)
      ? source.items.map((item, index) => normalizeOrderItemRecord(item, index, forgeOrderUuid))
      : [];

    return deepCloneValue({
      ...source,
      items: normalizedItems,
      open_flags: Array.isArray(source.open_flags) ? deepCloneValue(source.open_flags) : [],
      has_open_flags: Boolean(source.has_open_flags) || normalizedItems.some((item) => itemHasBlockingFlags(item))
    });
  }

  function normalizeOrderItemRecord(item, index, forgeOrderUuid) {
    const source = item && typeof item === 'object' ? item : {};
    const quantity = normalizeQuantity(source.quantity);
    const explicitStatus = firstNonEmptyString([
      source.production_status,
      source.structured_attributes && source.structured_attributes.production_status
    ]);
    const completedQuantity = normalizeCompletedQuantity(source.completed_quantity, quantity, explicitStatus);
    const productionStatus = deriveItemProductionStatus({
      explicitStatus,
      completedQuantity,
      quantity
    });
    const lineNumber = normalizeLineNumber(source.line_number, index + 1);
    const lineId = normalizeLineId(source.line_id, forgeOrderUuid, lineNumber);
    const structuredAttributes = source.structured_attributes && typeof source.structured_attributes === 'object'
      ? deepCloneValue(source.structured_attributes)
      : {};
    structuredAttributes.production_status = productionStatus;
    structuredAttributes.has_open_flags = Boolean(structuredAttributes.has_open_flags) || itemHasBlockingFlags(source);

    return deepCloneValue({
      ...source,
      line_id: lineId,
      line_number: lineNumber,
      quantity,
      production_status: productionStatus,
      completed_quantity: completedQuantity,
      completed_at: completedQuantity === quantity && source.completed_at ? asTrimmedString(source.completed_at) : null,
      structured_attributes: structuredAttributes,
      open_flags: Array.isArray(source.open_flags) ? deepCloneValue(source.open_flags) : [],
      production_note: source.production_note == null ? null : asTrimmedString(source.production_note)
    });
  }

  function getNormalizedOrderItems(record) {
    const payload = record && record.payload && typeof record.payload === 'object' ? record.payload : {};
    return Array.isArray(payload.items)
      ? payload.items.map((item, index) => normalizeOrderItemRecord(item, index, record.forge_order_uuid))
      : [];
  }

  function deriveItemProductionStatus({ explicitStatus, completedQuantity, quantity }) {
    const normalizedExplicitStatus = normalizeItemProductionStatus(explicitStatus);
    if (normalizedExplicitStatus === ITEM_PRODUCTION_STATUSES.blocked || normalizedExplicitStatus === ITEM_PRODUCTION_STATUSES.cancelled) {
      return normalizedExplicitStatus;
    }
    if (completedQuantity >= quantity) {
      return ITEM_PRODUCTION_STATUSES.complete;
    }
    if (completedQuantity > 0) {
      return ITEM_PRODUCTION_STATUSES.inProduction;
    }
    return ITEM_PRODUCTION_STATUSES.pending;
  }

  function deriveOrderCompletionCounts(items) {
    return (Array.isArray(items) ? items : []).reduce((summary, item) => {
      const normalizedItem = item && typeof item === 'object' ? item : {};
      const quantity = normalizeQuantity(normalizedItem.quantity);
      const status = normalizeItemProductionStatus(normalizedItem.production_status);
      if (status === ITEM_PRODUCTION_STATUSES.cancelled) {
        return summary;
      }
      const completedQuantity = Math.min(normalizeCompletedQuantity(normalizedItem.completed_quantity, quantity), quantity);
      summary.total_item_count += quantity;
      summary.completed_item_count += completedQuantity;
      return summary;
    }, {
      total_item_count: 0,
      completed_item_count: 0
    });
  }

  function deriveOrderProductionStatus({ explicitStatus, currentTrayNumber, completedItemCount, totalItemCount, hasBlockingFlags }) {
    const normalizedExplicitStatus = normalizeProductionStatus(explicitStatus);
    if (isTerminalOrderProductionStatus(normalizedExplicitStatus)) {
      return normalizedExplicitStatus;
    }
    if (!normalizeNullableTrayNumber(currentTrayNumber)) {
      return PRODUCTION_STATUSES.submitted;
    }
    if (completedItemCount <= 0) {
      return PRODUCTION_STATUSES.trayAssigned;
    }
    if (totalItemCount > 0 && completedItemCount >= totalItemCount && !hasBlockingFlags) {
      return PRODUCTION_STATUSES.readyToPack;
    }
    return PRODUCTION_STATUSES.inProduction;
  }

  function createUpdatedOrderRecord(record, { items, updatedAt }) {
    const normalizedRecord = normalizeOrderRecordForRead(record);
    const nextItems = Array.isArray(items) ? items.map((item, index) => normalizeOrderItemRecord(item, index, normalizedRecord.forge_order_uuid)) : [];
    const nextPayload = {
      ...(normalizedRecord.payload || {}),
      items: nextItems
    };
    const nextCounts = deriveOrderCompletionCounts(nextItems);
    const nextHasOpenFlags = orderHasBlockingFlags({
      ...normalizedRecord,
      payload: nextPayload,
      has_open_flags: normalizedRecord.has_open_flags
    });
    const nextStatus = deriveOrderProductionStatus({
      explicitStatus: normalizedRecord.production_status,
      currentTrayNumber: normalizedRecord.current_tray_number,
      completedItemCount: nextCounts.completed_item_count,
      totalItemCount: nextCounts.total_item_count,
      hasBlockingFlags: nextHasOpenFlags
    });
    const readyToPackAt = nextStatus === PRODUCTION_STATUSES.readyToPack
      ? (normalizedRecord.ready_to_pack_at || updatedAt)
      : null;

    return normalizeLocalOrderRecord({
      ...deepCloneValue(normalizedRecord),
      updated_at: updatedAt,
      has_open_flags: nextHasOpenFlags,
      production_status: nextStatus,
      total_item_count: nextCounts.total_item_count,
      completed_item_count: nextCounts.completed_item_count,
      ready_to_pack_at: readyToPackAt,
      payload: {
        ...nextPayload,
        has_open_flags: nextHasOpenFlags
      }
    });
  }

  function normalizeLocalOrderRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('Forge local order records must be objects.');
    }

    const forgeOrderUuid = asTrimmedString(record.forge_order_uuid);
    if (!forgeOrderUuid) {
      throw new Error('Forge local order records require forge_order_uuid.');
    }
    const forgeOrderNumber = normalizeNullableOrderNumber(
      record.forge_order_number == null
        ? (record.payload && typeof record.payload === 'object' ? record.payload.forge_order_number : null)
        : record.forge_order_number
    );

    const submittedAt = asTrimmedString(record.submitted_at);
    const localSavedAt = asTrimmedString(record.local_saved_at);
    const updatedAt = asTrimmedString(record.updated_at || localSavedAt || submittedAt);
    const normalizedPayload = normalizeOrderPayload(record.payload || {}, forgeOrderUuid);
    const derivedCounts = deriveOrderCompletionCounts(normalizedPayload.items);
    const productionStatus = deriveOrderProductionStatus({
      explicitStatus: record.production_status,
      currentTrayNumber: record.current_tray_number,
      completedItemCount: derivedCounts.completed_item_count,
      totalItemCount: derivedCounts.total_item_count,
      hasBlockingFlags: orderHasBlockingFlags({
        ...record,
        payload: normalizedPayload,
        has_open_flags: record.has_open_flags
      })
    });
    const currentTrayNumber = normalizeNullableTrayNumber(record.current_tray_number);
    const readyToPackAt = normalizeOrderReadyToPackAt(record.ready_to_pack_at, productionStatus);
    const hasOpenFlags = orderHasBlockingFlags({
      ...record,
      payload: normalizedPayload,
      has_open_flags: record.has_open_flags
    });
    const payloadWithOrderNumber = forgeOrderNumber === null
      ? normalizedPayload
      : {
        ...normalizedPayload,
        forge_order_number: forgeOrderNumber
      };

    return deepCloneValue({
      record_type: asTrimmedString(record.record_type) || 'forge_local_order',
      record_version: asTrimmedString(record.record_version) || '1.0',
      forge_order_uuid: forgeOrderUuid,
      forge_order_number: forgeOrderNumber,
      status: asTrimmedString(record.status) || 'submitted',
      sync_status: asTrimmedString(record.sync_status) || 'pending',
      submitted_at: submittedAt,
      local_saved_at: localSavedAt,
      updated_at: updatedAt,
      sync_attempt_count: Number.isInteger(record.sync_attempt_count) ? record.sync_attempt_count : 0,
      last_sync_attempt_at: record.last_sync_attempt_at == null ? null : asTrimmedString(record.last_sync_attempt_at),
      last_sync_error: record.last_sync_error == null ? null : asTrimmedString(record.last_sync_error),
      server_upload_status: normalizeServerUploadStatus(record.server_upload_status),
      server_upload_attempt_count: getServerUploadAttemptCount(record),
      last_server_upload_attempt_at: asNullableIsoString(record.last_server_upload_attempt_at),
      last_server_upload_error: sanitizeServerUploadError(record.last_server_upload_error),
      server_received_at: asNullableIsoString(record.server_received_at),
      server_payload_sha256: normalizeServerPayloadSha(record.server_payload_sha256),
      server_created: record.server_created === true ? true : (record.server_created === false ? false : null),
      event_id: record.event_id == null ? null : asTrimmedString(record.event_id),
      device_id: record.device_id == null ? null : asTrimmedString(record.device_id),
      internal_note: normalizeInternalNote(record.internal_note),
      has_internal_note: normalizeInternalNote(record.internal_note) !== null,
      has_open_flags: hasOpenFlags,
      production_status: productionStatus,
      current_tray_number: currentTrayNumber,
      total_item_count: derivedCounts.total_item_count,
      completed_item_count: derivedCounts.completed_item_count,
      ready_to_pack_at: readyToPackAt,
      cancelled_at: record.cancelled_at == null ? null : asTrimmedString(record.cancelled_at),
      packed_at: record.packed_at == null ? null : asTrimmedString(record.packed_at),
      fulfilled_at: record.fulfilled_at == null ? null : asTrimmedString(record.fulfilled_at),
      payload: payloadWithOrderNumber
    });
  }

  function normalizeOrderRecordForRead(record) {
    return normalizeLocalOrderRecord(record);
  }

  function normalizeInternalNote(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/\r\n?/g, '\n');
    return normalized.trim() === '' ? null : normalized;
  }

  function createTrayRecord(record = {}) {
    const trayNumber = normalizeTrayNumber(record.tray_number);
    if (!trayNumber) {
      throw new Error('Production tray records require a valid tray_number.');
    }

    const trayStatus = normalizeTrayStatus(record.tray_status);
    const currentOrderUuid = trayStatus === TRAY_STATUSES.assigned ? asTrimmedString(record.current_order_uuid) : '';

    return deepCloneValue({
      tray_number: trayNumber,
      tray_status: trayStatus,
      current_order_uuid: currentOrderUuid || null,
      assigned_at: currentOrderUuid ? asNullableTrimmedString(record.assigned_at) : null,
      updated_at: asTrimmedString(record.updated_at || record.assigned_at || '')
    });
  }

  function normalizeTrayRecord(record) {
    return createTrayRecord(record);
  }

  function createTrayAssignmentHistoryRecord(record = {}) {
    const assignmentId = asTrimmedString(record.tray_assignment_id);
    const forgeOrderUuid = asTrimmedString(record.forge_order_uuid);
    const trayNumber = normalizeTrayNumber(record.tray_number);
    const assignedAt = asTrimmedString(record.assigned_at);

    if (!assignmentId) {
      throw new Error('Tray assignment history requires tray_assignment_id.');
    }
    if (!forgeOrderUuid) {
      throw new Error('Tray assignment history requires forge_order_uuid.');
    }
    if (!trayNumber) {
      throw new Error('Tray assignment history requires a valid tray_number.');
    }
    if (!assignedAt) {
      throw new Error('Tray assignment history requires assigned_at.');
    }

    return deepCloneValue({
      tray_assignment_id: assignmentId,
      tray_number: trayNumber,
      forge_order_uuid: forgeOrderUuid,
      assigned_at: assignedAt,
      released_at: asNullableTrimmedString(record.released_at),
      release_reason: asNullableTrimmedString(record.release_reason)
    });
  }

  function normalizeTrayAssignmentHistoryRecord(record) {
    return createTrayAssignmentHistoryRecord(record);
  }

  function createDefaultTrayInventoryConfig() {
    return {
      initialTrayNumbers: Array.from({ length: 24 }, (_, index) => index + 1)
    };
  }

  function normalizeTrayInventoryConfig(config = {}) {
    const trayNumbers = Array.isArray(config.initialTrayNumbers) ? config.initialTrayNumbers : [];
    const normalizedTrayNumbers = [...new Set(trayNumbers.map((value) => normalizeTrayNumber(value)).filter(Boolean))].sort((left, right) => left - right);

    if (!normalizedTrayNumbers.length) {
      throw new Error('Forge tray inventory configuration requires at least one tray number.');
    }

    return {
      initialTrayNumbers: normalizedTrayNumbers
    };
  }

  function compareOrdersNewestFirst(left, right) {
    const leftSubmittedAt = Date.parse(left?.submitted_at || left?.local_saved_at || '') || 0;
    const rightSubmittedAt = Date.parse(right?.submitted_at || right?.local_saved_at || '') || 0;
    return rightSubmittedAt - leftSubmittedAt;
  }

  function compareTraysByNumber(left, right) {
    return normalizeTrayNumber(left?.tray_number) - normalizeTrayNumber(right?.tray_number);
  }

  function compareTrayAssignmentsNewestFirst(left, right) {
    const leftAssignedAt = Date.parse(left?.assigned_at || '') || 0;
    const rightAssignedAt = Date.parse(right?.assigned_at || '') || 0;
    return rightAssignedAt - leftAssignedAt;
  }

  function comparePackingVerificationsNewestFirst(left, right) {
    const leftVerifiedAt = Date.parse(left?.verified_at || '') || 0;
    const rightVerifiedAt = Date.parse(right?.verified_at || '') || 0;
    return rightVerifiedAt - leftVerifiedAt;
  }

  function normalizeProductionStatus(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === PRODUCTION_STATUSES.readyToPack) {
      return PRODUCTION_STATUSES.readyToPack;
    }
    if (normalized === PRODUCTION_STATUSES.inProduction) {
      return PRODUCTION_STATUSES.inProduction;
    }
    if (normalized === PRODUCTION_STATUSES.packed) {
      return PRODUCTION_STATUSES.packed;
    }
    if (normalized === PRODUCTION_STATUSES.shipped) {
      return PRODUCTION_STATUSES.shipped;
    }
    if (normalized === PRODUCTION_STATUSES.pickedUp) {
      return PRODUCTION_STATUSES.pickedUp;
    }
    if (normalized === PRODUCTION_STATUSES.cancelled) {
      return PRODUCTION_STATUSES.cancelled;
    }
    if (normalized === PRODUCTION_STATUSES.trayAssigned) {
      return PRODUCTION_STATUSES.trayAssigned;
    }
    return PRODUCTION_STATUSES.submitted;
  }

  function normalizeItemProductionStatus(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === 'not_started') {
      return ITEM_PRODUCTION_STATUSES.pending;
    }
    if (normalized === ITEM_PRODUCTION_STATUSES.inProduction) {
      return ITEM_PRODUCTION_STATUSES.inProduction;
    }
    if (normalized === ITEM_PRODUCTION_STATUSES.complete) {
      return ITEM_PRODUCTION_STATUSES.complete;
    }
    if (normalized === ITEM_PRODUCTION_STATUSES.blocked) {
      return ITEM_PRODUCTION_STATUSES.blocked;
    }
    if (normalized === ITEM_PRODUCTION_STATUSES.cancelled) {
      return ITEM_PRODUCTION_STATUSES.cancelled;
    }
    return ITEM_PRODUCTION_STATUSES.pending;
  }

  function normalizeTrayStatus(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === TRAY_STATUSES.assigned) {
      return TRAY_STATUSES.assigned;
    }
    if (normalized === TRAY_STATUSES.outOfService) {
      return TRAY_STATUSES.outOfService;
    }
    return TRAY_STATUSES.available;
  }

  function hasAssignedTray(record) {
    return normalizeNullableTrayNumber(record?.current_tray_number) != null;
  }

  function isTerminalOrderProductionStatus(value) {
    const normalized = normalizeProductionStatus(value);
    return normalized === PRODUCTION_STATUSES.packed
      || normalized === PRODUCTION_STATUSES.shipped
      || normalized === PRODUCTION_STATUSES.pickedUp
      || normalized === PRODUCTION_STATUSES.cancelled;
  }

  function normalizeQuantity(value) {
    const parsed = Number.parseInt(asTrimmedString(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  function normalizeCompletedQuantity(value, quantity, explicitStatus = '') {
    const parsed = Number.parseInt(asTrimmedString(value), 10);
    if (Number.isInteger(parsed)) {
      return Math.max(0, Math.min(parsed, quantity));
    }
    const status = normalizeItemProductionStatus(explicitStatus);
    return status === ITEM_PRODUCTION_STATUSES.complete ? quantity : 0;
  }

  function normalizeLineNumber(value, fallback) {
    const parsed = Number.parseInt(asTrimmedString(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  function normalizeLineId(value, forgeOrderUuid, lineNumber) {
    const normalized = asTrimmedString(value);
    return normalized || `${forgeOrderUuid}-line-${lineNumber}`;
  }

  function normalizeOrderReadyToPackAt(value, productionStatus) {
    if (normalizeProductionStatus(productionStatus) !== PRODUCTION_STATUSES.readyToPack) {
      return value == null ? null : asNullableTrimmedString(value);
    }
    return asNullableTrimmedString(value);
  }

  function getEventTypeForRecord(record) {
    return asTrimmedString(record?.payload?.event?.event_type).toLowerCase();
  }

  function createCleanupTombstoneRecord(record = {}) {
    const forgeOrderUuid = asTrimmedString(record.forge_order_uuid);
    const deletedAt = asTrimmedString(record.deleted_at);
    if (!forgeOrderUuid) {
      throw new Error('Cleanup tombstones require forge_order_uuid.');
    }
    if (!deletedAt) {
      throw new Error('Cleanup tombstones require deleted_at.');
    }

    return deepCloneValue({
      forge_order_uuid: forgeOrderUuid,
      deleted_at: deletedAt
    });
  }

  function createPackingVerificationRecord(record = {}) {
    const packingVerificationId = asTrimmedString(record.packing_verification_id);
    const forgeOrderUuid = asTrimmedString(record.forge_order_uuid);
    const trayNumber = normalizeTrayNumber(record.tray_number);
    const verifiedAt = asTrimmedString(record.verified_at);
    const verifiedItemIds = normalizeVerifiedItemIds(record.verified_item_ids);

    if (!packingVerificationId) {
      throw new Error('Packing verification requires packing_verification_id.');
    }
    if (!forgeOrderUuid) {
      throw new Error('Packing verification requires forge_order_uuid.');
    }
    if (!trayNumber) {
      throw new Error('Packing verification requires a valid tray_number.');
    }
    if (!verifiedAt) {
      throw new Error('Packing verification requires verified_at.');
    }
    if (!verifiedItemIds.length) {
      throw new Error('Packing verification requires verified_item_ids.');
    }

    return deepCloneValue({
      packing_verification_id: packingVerificationId,
      forge_order_uuid: forgeOrderUuid,
      tray_number: trayNumber,
      verified_item_ids: verifiedItemIds,
      verified_at: verifiedAt,
      packing_note: normalizePackingNote(record.packing_note)
    });
  }

  function normalizePackingVerificationRecord(record) {
    return createPackingVerificationRecord(record);
  }

  function normalizeServerUploadStatus(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === SERVER_UPLOAD_STATUSES.uploading) {
      return SERVER_UPLOAD_STATUSES.uploading;
    }
    if (normalized === SERVER_UPLOAD_STATUSES.stored) {
      return SERVER_UPLOAD_STATUSES.stored;
    }
    if (normalized === SERVER_UPLOAD_STATUSES.failed) {
      return SERVER_UPLOAD_STATUSES.failed;
    }
    if (normalized === SERVER_UPLOAD_STATUSES.conflict) {
      return SERVER_UPLOAD_STATUSES.conflict;
    }
    return SERVER_UPLOAD_STATUSES.pending;
  }

  function getServerUploadAttemptCount(record) {
    return Number.isInteger(record?.server_upload_attempt_count) && record.server_upload_attempt_count >= 0
      ? record.server_upload_attempt_count
      : 0;
  }

  function normalizeServerPayloadSha(value) {
    const normalized = asTrimmedString(value);
    return SERVER_UPLOAD_HASH_PATTERN.test(normalized) ? normalized : null;
  }

  function sanitizeServerUploadError(error) {
    if (error == null) {
      return null;
    }
    const code = asTrimmedString(error?.code) || 'server_upload_failed';
    const message = SERVER_UPLOAD_ERROR_MESSAGES[code] || SERVER_UPLOAD_ERROR_MESSAGES.server_upload_failed;

    return {
      code,
      message: message.slice(0, SERVER_UPLOAD_ERROR_MESSAGE_MAX_LENGTH)
    };
  }

  function asNullableIsoString(value) {
    const normalized = asTrimmedString(value);
    return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : null;
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

  function validateServerUploadSuccessResult(orderUuid, result) {
    const source = result && typeof result === 'object' ? result : {};
    if (asTrimmedString(source.forgeOrderUuid) !== orderUuid) {
      throw new Error('The server upload result UUID does not match the saved Forge order.');
    }
    if (!SERVER_UPLOAD_HASH_PATTERN.test(asTrimmedString(source.payloadSha256))) {
      throw new Error('The server upload result requires a valid payload SHA-256 hash.');
    }
    if (!asNullableIsoString(source.receivedAt)) {
      throw new Error('The server upload result requires a valid received-at timestamp.');
    }
    if (typeof source.created !== 'boolean') {
      throw new Error('The server upload result requires a created flag.');
    }
    if (source.forgeOrderNumber !== undefined && source.forgeOrderNumber !== null && normalizeNullableOrderNumber(source.forgeOrderNumber) === null) {
      throw new Error('The server upload result requires a valid forge order number when provided.');
    }
  }

  function normalizePackingNote(value) {
    const normalized = asTrimmedString(value).slice(0, PACKING_NOTE_MAX_LENGTH);
    return normalized || null;
  }

  function normalizeVerifiedItemIds(values) {
    return (Array.isArray(values) ? values : [])
      .map((value) => asTrimmedString(value))
      .filter(Boolean);
  }

  function getActiveOrderItems(record) {
    return getNormalizedOrderItems(record).filter((item) => normalizeItemProductionStatus(item.production_status) !== ITEM_PRODUCTION_STATUSES.cancelled);
  }

  function buildLocalShippingExportPreview(records, eventId) {
    const normalizedRecords = Array.isArray(records) ? records : [];
    const matchingRecords = normalizedRecords.filter((record) => {
      const snapshot = record && record.payload && record.payload.event && typeof record.payload.event === 'object'
        ? record.payload.event
        : null;
      return asTrimmedString(snapshot && snapshot.event_id) === eventId;
    });
    const event = deriveLocalShippingExportEvent(matchingRecords, eventId);
    const includedOrders = [];
    const excludedOrders = [];
    let shippingOrderCount = 0;

    matchingRecords.forEach((record) => {
      const normalized = normalizeLocalShippingExportRecord(record, event);
      if (!normalized) {
        return;
      }
      if (normalized.isShippingOrder) {
        shippingOrderCount += 1;
      }
      if (normalized.included) {
        includedOrders.push(normalized.record);
        return;
      }
      if (normalized.isShippingOrder) {
        excludedOrders.push(normalized.record);
      }
    });

    return {
      event,
      included_count: includedOrders.length,
      excluded_count: excludedOrders.length,
      shipping_order_count: shippingOrderCount,
      has_exportable_rows: includedOrders.length > 0,
      csv_filename: buildLocalShippingExportFilename(event),
      included_orders: includedOrders,
      excluded_orders: excludedOrders
    };
  }

  function normalizeLocalShippingExportRecord(record, event) {
    if (!record || typeof record !== 'object') {
      return null;
    }

    const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
    const eventSnapshot = payload.event && typeof payload.event === 'object' ? payload.event : {};
    const fulfillment = payload.fulfillment && typeof payload.fulfillment === 'object' ? payload.fulfillment : {};
    const shippingAddress = fulfillment.shipping_address && typeof fulfillment.shipping_address === 'object' ? fulfillment.shipping_address : {};
    const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const fulfillmentMethod = asTrimmedString(fulfillment.method).toLowerCase();
    const isCancelled = normalizeProductionStatus(record.production_status) === PRODUCTION_STATUSES.cancelled;
    const eventType = asTrimmedString(eventSnapshot.event_type || event.event_type);
    const isShippingOrder = fulfillmentMethod === 'shipping' && !isCancelled && eventType !== 'test_session';
    const missingFields = determineLocalShippingExportMissingFields(customer, shippingAddress);
    const itemCount = items.reduce((total, item) => total + normalizePositiveQuantity(item && item.quantity), 0);

    const exportRecord = {
      forge_order_uuid: asTrimmedString(record.forge_order_uuid),
      forge_order_number: Number.isInteger(record.forge_order_number) ? record.forge_order_number : null,
      order_reference: getLocalShippingExportOrderReference(record),
      customer_name: asTrimmedString(customer.full_name),
      address_line_1: asTrimmedString(shippingAddress.address_1),
      address_line_2: asTrimmedString(shippingAddress.address_2),
      city: asTrimmedString(shippingAddress.city),
      state: asTrimmedString(shippingAddress.state),
      postal_code: asTrimmedString(shippingAddress.postal_code),
      country: asTrimmedString(shippingAddress.country),
      email: asTrimmedString(customer.email),
      phone: asTrimmedString(customer.phone),
      item_count: itemCount,
      event_name: asTrimmedString(event.event_name),
      submitted_at: asTrimmedString(record.submitted_at || record.local_saved_at),
      missing_fields: missingFields
    };

    return {
      included: isShippingOrder && missingFields.length === 0,
      isShippingOrder,
      record: exportRecord
    };
  }

  function deriveLocalShippingExportEvent(records, eventId) {
    const firstRecord = Array.isArray(records) && records.length > 0 ? records[0] : null;
    const snapshot = firstRecord && firstRecord.payload && firstRecord.payload.event && typeof firstRecord.payload.event === 'object'
      ? firstRecord.payload.event
      : {};

    return {
      event_id: eventId,
      public_order_token: asTrimmedString(snapshot.public_order_token) || null,
      event_name: asTrimmedString(snapshot.event_name) || 'Event',
      event_type: asTrimmedString(snapshot.event_type) || 'live_event',
      start_date: asTrimmedString(snapshot.event_start_date),
      end_date: asTrimmedString(snapshot.event_end_date),
      event_location: asTrimmedString(snapshot.event_location) || null,
      event_status: asTrimmedString(snapshot.event_status) || ''
    };
  }

  function determineLocalShippingExportMissingFields(customer, shippingAddress) {
    const missing = [];
    if (!asTrimmedString(customer && customer.full_name)) {
      missing.push('customer_name');
    }
    ['address_1', 'city', 'state', 'postal_code', 'country'].forEach((field) => {
      if (!asTrimmedString(shippingAddress && shippingAddress[field])) {
        missing.push(field);
      }
    });
    return missing;
  }

  function buildLocalShippingExportCsv(records) {
    const lines = [[
      'Forge Order Number',
      'Customer Name',
      'Address Line 1',
      'Address Line 2',
      'City',
      'State',
      'Postal Code',
      'Country',
      'Email',
      'Phone',
      'Item Count',
      'Event Name',
      'Submitted At'
    ]];

    records.forEach((record) => {
      lines.push([
        Number.isInteger(record.forge_order_number) ? String(record.forge_order_number) : '',
        neutralizeLocalShippingCsvCell(asTrimmedString(record.customer_name)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.address_line_1)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.address_line_2)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.city)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.state)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.postal_code)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.country)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.email)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.phone)),
        String(Number.isInteger(record.item_count) ? record.item_count : 0),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.event_name)),
        neutralizeLocalShippingCsvCell(asTrimmedString(record.submitted_at))
      ]);
    });

    return lines.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
  }

  function buildLocalShippingExportFilename(event) {
    const slugSource = asTrimmedString(event && event.event_name).toLowerCase();
    const slug = (slugSource.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event');
    return `forge-shipping-export-${slug}-${asTrimmedString(event && event.start_date) || 'local'}.csv`;
  }

  function getLocalShippingExportOrderReference(record) {
    if (Number.isInteger(record && record.forge_order_number)) {
      return `Order ${record.forge_order_number}`;
    }
    const orderUuid = asTrimmedString(record && record.forge_order_uuid);
    return `Order ${orderUuid.slice(0, 8).toUpperCase()}`;
  }

  function normalizePositiveQuantity(value) {
    return Number.isInteger(value) && value > 0 ? value : 1;
  }

  function escapeCsvField(value) {
    const stringValue = value == null ? '' : String(value);
    if (!/[",\r\n]/.test(stringValue)) {
      return stringValue;
    }
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  function neutralizeLocalShippingCsvCell(value) {
    const stringValue = value == null ? '' : String(value);
    if (stringValue === '') {
      return '';
    }

    const normalized = stringValue.replace(/\r\n?/g, '\n');
    const trimmedLeadingWhitespace = normalized.replace(/^\s+/, '');
    if (trimmedLeadingWhitespace === '') {
      return normalized;
    }

    const firstCharacter = trimmedLeadingWhitespace.charAt(0);
    if (firstCharacter === '=' || firstCharacter === '+' || firstCharacter === '-' || firstCharacter === '@') {
      return `'${normalized}`;
    }

    return normalized;
  }

  function validateOrderPackingEligibility(record) {
    if (!record) {
      return { ok: false, error: 'That saved order could not be found.' };
    }

    const productionStatus = normalizeProductionStatus(record.production_status);
    if (productionStatus === PRODUCTION_STATUSES.packed) {
      return { ok: false, error: 'This order has already been packed.' };
    }
    if (productionStatus === PRODUCTION_STATUSES.shipped) {
      return { ok: false, error: 'Shipped orders cannot be packed again.' };
    }
    if (productionStatus === PRODUCTION_STATUSES.pickedUp) {
      return { ok: false, error: 'Picked-up orders cannot be packed again.' };
    }
    if (productionStatus === PRODUCTION_STATUSES.cancelled) {
      return { ok: false, error: 'Cancelled orders cannot be packed.' };
    }
    const trayNumber = normalizeNullableTrayNumber(record.current_tray_number);
    if (!trayNumber) {
      return { ok: false, error: 'This order no longer has an assigned tray.' };
    }

    const activeItems = getActiveOrderItems(record);
    if (!activeItems.length) {
      return { ok: false, error: 'This order has no active items to verify.' };
    }
    if (orderHasBlockingFlags(record)) {
      return { ok: false, error: 'Resolve open flags before packing this order.' };
    }

    const incompleteItem = activeItems.find((item) => {
      const quantity = normalizeQuantity(item.quantity);
      const completedQuantity = Math.min(normalizeCompletedQuantity(item.completed_quantity, quantity, item.production_status), quantity);
      return normalizeItemProductionStatus(item.production_status) !== ITEM_PRODUCTION_STATUSES.complete || completedQuantity !== quantity;
    });
    if (incompleteItem) {
      return { ok: false, error: 'Every required item must be complete before packing.' };
    }

    const counts = deriveOrderCompletionCounts(activeItems);
    if (counts.total_item_count <= 0) {
      return { ok: false, error: 'This order has no active items to verify.' };
    }
    if (counts.completed_item_count !== counts.total_item_count) {
      return { ok: false, error: 'Every required item must be complete before packing.' };
    }
    if (productionStatus !== PRODUCTION_STATUSES.readyToPack) {
      return { ok: false, error: 'Only ready-to-pack orders can be packed.' };
    }

    return {
      ok: true,
      trayNumber,
      activeItems,
      totalItemCount: counts.total_item_count
    };
  }

  function validatePackingVerificationSubmission(record, verifiedItemIds) {
    const orderValidation = validateOrderPackingEligibility(record);
    if (!orderValidation.ok) {
      return orderValidation;
    }

    const submittedIds = normalizeVerifiedItemIds(verifiedItemIds);
    const submittedIdSet = new Set(submittedIds);
    if (!submittedIds.length) {
      return { ok: false, error: 'Verify every required item before packing.' };
    }
    if (submittedIdSet.size !== submittedIds.length) {
      return { ok: false, error: 'Each verified item may only be submitted once.' };
    }

    const requiredIds = orderValidation.activeItems.map((item) => item.line_id);
    const requiredIdSet = new Set(requiredIds);
    const unknownId = submittedIds.find((itemId) => !requiredIdSet.has(itemId));
    if (unknownId) {
      return { ok: false, error: 'Only expected tray items can be verified for packing.' };
    }

    const missingId = requiredIds.find((itemId) => !submittedIdSet.has(itemId));
    if (missingId) {
      return { ok: false, error: 'Verify every required item before packing.' };
    }

    return {
      ok: true,
      verifiedItemIds: requiredIds.slice(),
      activeItems: orderValidation.activeItems,
      trayNumber: orderValidation.trayNumber,
      totalItemCount: orderValidation.totalItemCount
    };
  }

  function orderHasBlockingFlags(record) {
    if (!record || typeof record !== 'object') {
      return false;
    }
    if (Boolean(record.has_open_flags)) {
      return true;
    }
    const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
    if (Boolean(payload.has_open_flags)) {
      return true;
    }
    if (Array.isArray(payload.open_flags) && payload.open_flags.length > 0) {
      return true;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.some((item) => itemHasBlockingFlags(item));
  }

  function itemHasBlockingFlags(item) {
    if (!item || typeof item !== 'object') {
      return false;
    }
    if (Array.isArray(item.open_flags) && item.open_flags.length > 0) {
      return true;
    }
    const structuredAttributes = item.structured_attributes && typeof item.structured_attributes === 'object'
      ? item.structured_attributes
      : {};
    return Boolean(structuredAttributes.has_open_flags);
  }

  function firstNonEmptyString(values) {
    const source = Array.isArray(values) ? values : [];
    for (const value of source) {
      const normalized = asTrimmedString(value);
      if (normalized) {
        return normalized;
      }
    }
    return '';
  }

  function normalizeTrayNumber(value) {
    const parsed = Number.parseInt(asTrimmedString(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  function normalizeNullableTrayNumber(value) {
    const trayNumber = normalizeTrayNumber(value);
    return trayNumber || null;
  }

  function normalizeDateValue(value) {
    const candidate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(candidate.getTime())) {
      throw new Error('Forge order storage requires valid date values.');
    }
    return candidate;
  }

  function createStoreUuid() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 12);
    return `forge-${timestamp}-${randomPart}`;
  }

  function abortTransaction(transaction, error) {
    transaction.__forgeError = error instanceof Error ? error : new Error(asTrimmedString(error) || 'Forge transaction failed.');
    try {
      transaction.abort();
    } catch {
      throw transaction.__forgeError;
    }
  }

  function isConstraintError(error) {
    return Boolean(
      error
      && (
        error.name === 'ConstraintError'
        || error.code === 0
        || /constraint/i.test(error.message || '')
      )
    );
  }

  function deepCloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => deepCloneValue(entry));
    }
    if (value && typeof value === 'object') {
      const output = {};
      Object.keys(value).forEach((key) => {
        output[key] = deepCloneValue(value[key]);
      });
      return output;
    }
    return value;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function asNullableTrimmedString(value) {
    const normalized = asTrimmedString(value);
    return normalized || null;
  }

  const defaultOrderStore = createOrderStore();

  return {
    DATABASE_NAME,
    DATABASE_VERSION,
    OBJECT_STORE_NAME: OBJECT_STORE_NAMES.orders,
    OBJECT_STORE_NAMES,
    INDEX_NAMES,
    PRODUCTION_STATUSES,
    ITEM_PRODUCTION_STATUSES,
    TRAY_STATUSES,
    SERVER_UPLOAD_STATUSES,
    DEFAULT_TRAY_INVENTORY,
    createDefaultTrayInventoryConfig,
    createInMemoryOrderStore,
    createOrderStore,
    createCleanupTombstoneRecord,
    deriveOrderCompletionCounts,
    normalizeLocalOrderRecord,
    normalizeOrderRecordForRead,
    normalizeOrderPayload,
    normalizeOrderItemRecord,
    normalizeTrayRecord,
    normalizeTrayAssignmentHistoryRecord,
    normalizePackingVerificationRecord,
    validateOrderPackingEligibility,
    validatePackingVerificationSubmission,
    openOrderStore: (...args) => defaultOrderStore.openOrderStore(...args),
    saveNewOrder: (...args) => defaultOrderStore.saveNewOrder(...args),
    getOrder: (...args) => defaultOrderStore.getOrder(...args),
    listOrders: (...args) => defaultOrderStore.listOrders(...args),
    countOrdersBySyncStatus: (...args) => defaultOrderStore.countOrdersBySyncStatus(...args),
    markOrderServerUploadAttempt: (...args) => defaultOrderStore.markOrderServerUploadAttempt(...args),
    markOrderServerUploadSuccess: (...args) => defaultOrderStore.markOrderServerUploadSuccess(...args),
    markOrderServerUploadFailure: (...args) => defaultOrderStore.markOrderServerUploadFailure(...args),
    listTrays: (...args) => defaultOrderStore.listTrays(...args),
    getTray: (...args) => defaultOrderStore.getTray(...args),
    listTrayAssignmentHistory: (...args) => defaultOrderStore.listTrayAssignmentHistory(...args),
    listPackingVerifications: (...args) => defaultOrderStore.listPackingVerifications(...args),
    getPackingVerificationForOrder: (...args) => defaultOrderStore.getPackingVerificationForOrder(...args),
    hasCleanupTombstone: (...args) => defaultOrderStore.hasCleanupTombstone(...args),
    assignTrayToOrder: (...args) => defaultOrderStore.assignTrayToOrder(...args),
    incrementOrderItemCompletion: (...args) => defaultOrderStore.incrementOrderItemCompletion(...args),
    updateInternalNote: (...args) => defaultOrderStore.updateInternalNote(...args),
    cancelOrder: (...args) => defaultOrderStore.cancelOrder(...args),
    deleteTestOrder: (...args) => defaultOrderStore.deleteTestOrder(...args),
    previewShippingExport: (...args) => defaultOrderStore.previewShippingExport(...args),
    generateShippingExportCsv: (...args) => defaultOrderStore.generateShippingExportCsv(...args),
    completePackingVerification: (...args) => defaultOrderStore.completePackingVerification(...args)
  };
}));
