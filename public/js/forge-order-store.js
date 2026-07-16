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
  const DATABASE_VERSION = 2;
  const OBJECT_STORE_NAMES = {
    orders: 'orders',
    trays: 'production_trays',
    trayAssignmentHistory: 'tray_assignment_history'
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
    }
  };
  const PRODUCTION_STATUSES = {
    submitted: 'submitted',
    trayAssigned: 'tray_assigned'
  };
  const TRAY_STATUSES = {
    available: 'available',
    assigned: 'assigned',
    outOfService: 'out_of_service'
  };
  const DEFAULT_TRAY_INVENTORY = createDefaultTrayInventoryConfig();
  function createOrderStore(options = {}) {
    const indexedDb = options.indexedDB || (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
    const databaseName = options.databaseName || DATABASE_NAME;
    const databaseVersion = Number.isInteger(options.databaseVersion) ? options.databaseVersion : DATABASE_VERSION;
    const objectStoreNames = {
      orders: options.objectStoreName || options.objectStoreNames?.orders || OBJECT_STORE_NAMES.orders,
      trays: options.objectStoreNames?.trays || OBJECT_STORE_NAMES.trays,
      trayAssignmentHistory: options.objectStoreNames?.trayAssignmentHistory || OBJECT_STORE_NAMES.trayAssignmentHistory
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

    return {
      openOrderStore,
      saveNewOrder,
      getOrder,
      listOrders,
      countOrdersBySyncStatus,
      listTrays,
      getTray,
      listTrayAssignmentHistory,
      assignTrayToOrder
    };
  }

  function createInMemoryOrderStore(options = {}) {
    const trayInventoryConfig = normalizeTrayInventoryConfig(options.trayInventory || DEFAULT_TRAY_INVENTORY);
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const getRandomUuid = typeof options.randomUUID === 'function' ? options.randomUUID : createStoreUuid;
    const records = new Map();
    const trays = new Map();
    const trayAssignmentHistory = new Map();

    trayInventoryConfig.initialTrayNumbers.forEach((trayNumber) => {
      trays.set(trayNumber, createTrayRecord({ tray_number: trayNumber }));
    });

    return {
      async openOrderStore() {
        return { databaseName: 'in-memory-forge-orders' };
      },
      async saveNewOrder(record) {
        const normalizedRecord = normalizeLocalOrderRecord(record);
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
      }
    };
  }

  function ensureIndex(store, indexName, keyPath) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, { unique: false });
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

  function normalizeLocalOrderRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('Forge local order records must be objects.');
    }

    const forgeOrderUuid = asTrimmedString(record.forge_order_uuid);
    if (!forgeOrderUuid) {
      throw new Error('Forge local order records require forge_order_uuid.');
    }

    const submittedAt = asTrimmedString(record.submitted_at);
    const localSavedAt = asTrimmedString(record.local_saved_at);
    const updatedAt = asTrimmedString(record.updated_at || localSavedAt || submittedAt);
    const productionStatus = normalizeProductionStatus(record.production_status);
    const currentTrayNumber = normalizeNullableTrayNumber(record.current_tray_number);

    return deepCloneValue({
      record_type: asTrimmedString(record.record_type) || 'forge_local_order',
      record_version: asTrimmedString(record.record_version) || '1.0',
      forge_order_uuid: forgeOrderUuid,
      status: asTrimmedString(record.status) || 'submitted',
      sync_status: asTrimmedString(record.sync_status) || 'pending',
      submitted_at: submittedAt,
      local_saved_at: localSavedAt,
      updated_at: updatedAt,
      sync_attempt_count: Number.isInteger(record.sync_attempt_count) ? record.sync_attempt_count : 0,
      last_sync_attempt_at: record.last_sync_attempt_at == null ? null : asTrimmedString(record.last_sync_attempt_at),
      last_sync_error: record.last_sync_error == null ? null : asTrimmedString(record.last_sync_error),
      event_id: record.event_id == null ? null : asTrimmedString(record.event_id),
      device_id: record.device_id == null ? null : asTrimmedString(record.device_id),
      has_open_flags: Boolean(record.has_open_flags),
      production_status: productionStatus,
      current_tray_number: currentTrayNumber,
      payload: deepCloneValue(record.payload || {})
    });
  }

  function normalizeOrderRecordForRead(record) {
    return normalizeLocalOrderRecord(record);
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

  function normalizeProductionStatus(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === PRODUCTION_STATUSES.trayAssigned) {
      return PRODUCTION_STATUSES.trayAssigned;
    }
    return PRODUCTION_STATUSES.submitted;
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
    TRAY_STATUSES,
    DEFAULT_TRAY_INVENTORY,
    createDefaultTrayInventoryConfig,
    createInMemoryOrderStore,
    createOrderStore,
    normalizeLocalOrderRecord,
    normalizeOrderRecordForRead,
    normalizeTrayRecord,
    normalizeTrayAssignmentHistoryRecord,
    openOrderStore: (...args) => defaultOrderStore.openOrderStore(...args),
    saveNewOrder: (...args) => defaultOrderStore.saveNewOrder(...args),
    getOrder: (...args) => defaultOrderStore.getOrder(...args),
    listOrders: (...args) => defaultOrderStore.listOrders(...args),
    countOrdersBySyncStatus: (...args) => defaultOrderStore.countOrdersBySyncStatus(...args),
    listTrays: (...args) => defaultOrderStore.listTrays(...args),
    getTray: (...args) => defaultOrderStore.getTray(...args),
    listTrayAssignmentHistory: (...args) => defaultOrderStore.listTrayAssignmentHistory(...args),
    assignTrayToOrder: (...args) => defaultOrderStore.assignTrayToOrder(...args)
  };
}));
