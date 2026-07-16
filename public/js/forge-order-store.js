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

    return {
      openOrderStore,
      saveNewOrder,
      getOrder,
      listOrders,
      countOrdersBySyncStatus,
      listTrays,
      getTray,
      listTrayAssignmentHistory,
      assignTrayToOrder,
      incrementOrderItemCompletion
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
      has_open_flags: hasOpenFlags,
      production_status: productionStatus,
      current_tray_number: currentTrayNumber,
      total_item_count: derivedCounts.total_item_count,
      completed_item_count: derivedCounts.completed_item_count,
      ready_to_pack_at: readyToPackAt,
      packed_at: record.packed_at == null ? null : asTrimmedString(record.packed_at),
      fulfilled_at: record.fulfilled_at == null ? null : asTrimmedString(record.fulfilled_at),
      payload: normalizedPayload
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
    DEFAULT_TRAY_INVENTORY,
    createDefaultTrayInventoryConfig,
    createInMemoryOrderStore,
    createOrderStore,
    deriveOrderCompletionCounts,
    normalizeLocalOrderRecord,
    normalizeOrderRecordForRead,
    normalizeOrderPayload,
    normalizeOrderItemRecord,
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
    assignTrayToOrder: (...args) => defaultOrderStore.assignTrayToOrder(...args),
    incrementOrderItemCompletion: (...args) => defaultOrderStore.incrementOrderItemCompletion(...args)
  };
}));
