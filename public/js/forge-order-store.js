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
  const DATABASE_VERSION = 1;
  const OBJECT_STORE_NAME = 'orders';
  const INDEX_NAMES = {
    submittedAt: 'submitted_at',
    localSavedAt: 'local_saved_at',
    status: 'status',
    syncStatus: 'sync_status',
    eventId: 'event_id',
    hasOpenFlags: 'has_open_flags'
  };

  function createOrderStore(options = {}) {
    const indexedDb = options.indexedDB || (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
    const databaseName = options.databaseName || DATABASE_NAME;
    const databaseVersion = Number.isInteger(options.databaseVersion) ? options.databaseVersion : DATABASE_VERSION;
    const objectStoreName = options.objectStoreName || OBJECT_STORE_NAME;
    let dbPromise = null;

    function openOrderStore() {
      if (dbPromise) {
        return dbPromise;
      }
      if (!indexedDb || typeof indexedDb.open !== 'function') {
        return Promise.reject(new Error('IndexedDB is unavailable for Forge order storage.'));
      }

      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(databaseName, databaseVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          let store = db.objectStoreNames.contains(objectStoreName)
            ? request.transaction.objectStore(objectStoreName)
            : db.createObjectStore(objectStoreName, { keyPath: 'forge_order_uuid' });

          ensureIndex(store, INDEX_NAMES.submittedAt, 'submitted_at');
          ensureIndex(store, INDEX_NAMES.localSavedAt, 'local_saved_at');
          ensureIndex(store, INDEX_NAMES.status, 'status');
          ensureIndex(store, INDEX_NAMES.syncStatus, 'sync_status');
          ensureIndex(store, INDEX_NAMES.eventId, 'event_id');
          ensureIndex(store, INDEX_NAMES.hasOpenFlags, 'has_open_flags');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Unable to open the Forge order database.'));
        request.onblocked = () => reject(new Error('Forge order storage is blocked by another open tab.'));
      });

      return dbPromise;
    }

    async function getOrder(forgeOrderUuid) {
      const orderId = asTrimmedString(forgeOrderUuid);
      if (!orderId) {
        return null;
      }
      const db = await openOrderStore();
      return runRequest(db, 'readonly', objectStoreName, (store) => store.get(orderId));
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
        await runRequest(db, 'readwrite', objectStoreName, (store) => store.add(deepCloneValue(normalizedRecord)));
        return {
          ok: true,
          duplicatePrevented: false,
          wasInserted: true,
          record: deepCloneValue(normalizedRecord)
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
      const records = await runRequest(db, 'readonly', objectStoreName, (store) => {
        if (typeof store.getAll === 'function') {
          return store.getAll();
        }
        return openCursorCollection(store);
      });
      return Array.isArray(records)
        ? records.map((record) => deepCloneValue(record)).sort(compareOrdersNewestFirst)
        : [];
    }

    async function countOrdersBySyncStatus(syncStatus) {
      const status = asTrimmedString(syncStatus);
      const db = await openOrderStore();
      return runRequest(db, 'readonly', objectStoreName, (store) => {
        const index = store.index(INDEX_NAMES.syncStatus);
        return index.count(status);
      });
    }

    return {
      openOrderStore,
      saveNewOrder,
      getOrder,
      listOrders,
      countOrdersBySyncStatus
    };
  }

  function createInMemoryOrderStore() {
    const records = new Map();

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
            record: deepCloneValue(existing)
          };
        }
        records.set(normalizedRecord.forge_order_uuid, deepCloneValue(normalizedRecord));
        return {
          ok: true,
          duplicatePrevented: false,
          wasInserted: true,
          record: deepCloneValue(normalizedRecord)
        };
      },
      async getOrder(forgeOrderUuid) {
        const record = records.get(asTrimmedString(forgeOrderUuid));
        return record ? deepCloneValue(record) : null;
      },
      async listOrders() {
        return [...records.values()].map((record) => deepCloneValue(record)).sort(compareOrdersNewestFirst);
      },
      async countOrdersBySyncStatus(syncStatus) {
        const targetStatus = asTrimmedString(syncStatus);
        return [...records.values()].filter((record) => record.sync_status === targetStatus).length;
      }
    };
  }

  function ensureIndex(store, indexName, keyPath) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, { unique: false });
    }
  }

  function runRequest(db, mode, objectStoreName, createRequest) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(objectStoreName, mode);
      const store = transaction.objectStore(objectStoreName);
      const request = createRequest(store);

      if (request && typeof request.then === 'function') {
        request.then(resolve, reject);
        return;
      }

      transaction.onerror = () => reject(transaction.error || request?.error || new Error('Forge order transaction failed.'));
      transaction.onabort = () => reject(transaction.error || request?.error || new Error('Forge order transaction was aborted.'));
      request.onsuccess = () => resolve(request.result);
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
      request.onerror = () => reject(request.error || new Error('Unable to list saved Forge orders.'));
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

    return deepCloneValue({
      record_type: asTrimmedString(record.record_type) || 'forge_local_order',
      record_version: asTrimmedString(record.record_version) || '1.0',
      forge_order_uuid: forgeOrderUuid,
      status: asTrimmedString(record.status) || 'submitted',
      sync_status: asTrimmedString(record.sync_status) || 'pending',
      submitted_at: asTrimmedString(record.submitted_at),
      local_saved_at: asTrimmedString(record.local_saved_at),
      sync_attempt_count: Number.isInteger(record.sync_attempt_count) ? record.sync_attempt_count : 0,
      last_sync_attempt_at: record.last_sync_attempt_at == null ? null : asTrimmedString(record.last_sync_attempt_at),
      last_sync_error: record.last_sync_error == null ? null : asTrimmedString(record.last_sync_error),
      event_id: record.event_id == null ? null : asTrimmedString(record.event_id),
      device_id: record.device_id == null ? null : asTrimmedString(record.device_id),
      has_open_flags: Boolean(record.has_open_flags),
      payload: deepCloneValue(record.payload || {})
    });
  }

  function compareOrdersNewestFirst(left, right) {
    const leftSubmittedAt = Date.parse(left?.submitted_at || '') || 0;
    const rightSubmittedAt = Date.parse(right?.submitted_at || '') || 0;
    return rightSubmittedAt - leftSubmittedAt;
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

  const defaultOrderStore = createOrderStore();

  return {
    DATABASE_NAME,
    DATABASE_VERSION,
    OBJECT_STORE_NAME,
    INDEX_NAMES,
    createInMemoryOrderStore,
    createOrderStore,
    openOrderStore: (...args) => defaultOrderStore.openOrderStore(...args),
    saveNewOrder: (...args) => defaultOrderStore.saveNewOrder(...args),
    getOrder: (...args) => defaultOrderStore.getOrder(...args),
    listOrders: (...args) => defaultOrderStore.listOrders(...args),
    countOrdersBySyncStatus: (...args) => defaultOrderStore.countOrdersBySyncStatus(...args)
  };
}));
