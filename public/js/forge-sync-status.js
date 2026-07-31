(function (root, factory) {
  const syncModule = typeof module === 'object' && module.exports
    ? require('./forge-order-server-sync.js')
    : root.ForgeOrderServerSync;
  const api = factory(syncModule);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeSyncStatus = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (syncModule) {
  const STATUS_KEYS = {
    checking: 'checking',
    synced: 'synced',
    syncing: 'syncing',
    waitingToRetry: 'waiting_to_retry',
    needsAttention: 'needs_attention',
    serverUnavailable: 'server_unavailable'
  };
  const SERVER_STATES = {
    checking: 'checking',
    connected: 'connected',
    unavailable: 'unavailable'
  };
  const VISIBLE_HEALTH_INTERVAL_MS = 60000;
  const HIDDEN_HEALTH_INTERVAL_MS = 300000;
  const MIN_HEALTH_CHECK_GAP_MS = 5000;
  const SERVER_REACHABILITY_FRESH_MS = 120000;
  const HIDDEN_SERVER_REACHABILITY_FRESH_MS = 360000;

  function summarizeOrderSyncRecords(records, options = {}) {
    const normalizedRecords = Array.isArray(records) ? records : [];
    let pendingUploadCount = 0;
    let activeUploadCount = 0;
    let uploadProblemCount = 0;
    let syncedOrderCount = 0;
    let lastSuccessfulSyncAt = null;
    const problemRecords = [];

    normalizedRecords.forEach((record) => {
      const recordState = deriveRecordSyncState(record);
      if (recordState.key === 'synced') {
        syncedOrderCount += 1;
        lastSuccessfulSyncAt = pickLatestIsoTimestamp(lastSuccessfulSyncAt, asTrimmedString(record?.server_received_at));
        return;
      }
      if (recordState.key === 'syncing') {
        activeUploadCount += 1;
        pendingUploadCount += 1;
        return;
      }
      if (recordState.key === 'problem') {
        uploadProblemCount += 1;
        problemRecords.push({
          forgeOrderUuid: asTrimmedString(record?.forge_order_uuid),
          code: asTrimmedString(record?.last_server_upload_error?.code),
          message: asTrimmedString(record?.last_server_upload_error?.message)
        });
        return;
      }
      pendingUploadCount += 1;
    });

    return {
      totalOrderCount: normalizedRecords.length,
      pendingUploadCount,
      activeUploadCount,
      uploadProblemCount,
      syncedOrderCount,
      lastSuccessfulSyncAt,
      problemRecords
    };
  }

  function deriveRecordSyncState(record, options = {}) {
    const serverUploadStatus = asTrimmedString(record?.server_upload_status).toLowerCase();
    const errorCode = asTrimmedString(record?.last_server_upload_error?.code).toLowerCase();
    const legacySyncStatus = asTrimmedString(record?.sync_status).toLowerCase();
    const needsStaffAttention = record?.server_upload_needs_staff_attention === true;

    if (serverUploadStatus === 'stored') {
      return { key: 'synced', retryable: false };
    }
    if (serverUploadStatus === 'uploading') {
      return { key: 'syncing', retryable: true };
    }
    if (serverUploadStatus === 'conflict') {
      return { key: 'problem', retryable: false };
    }
    if (serverUploadStatus === 'failed') {
      const retryable = isRetryableSyncFailureCode(errorCode);
      if (!retryable || needsStaffAttention) {
        return { key: 'problem', retryable };
      }
      return { key: 'waiting', retryable: true };
    }
    if (legacySyncStatus === 'synced') {
      return { key: 'synced', retryable: false };
    }
    if (legacySyncStatus === 'error') {
      return { key: 'problem', retryable: false };
    }
    return { key: 'waiting', retryable: true };
  }

  function deriveSyncStatusSnapshot(facts = {}) {
    const browserOnline = facts.browserOnline !== false;
    const serverState = normalizeServerState(facts.serverState);
    const isChecking = Boolean(facts.isChecking);
    const isRetryingUploads = Boolean(facts.isRetryingUploads);
    const isRecheckingConnection = Boolean(facts.isRecheckingConnection);
    const pendingUploadCount = normalizeCount(facts.pendingUploadCount);
    const activeUploadCount = normalizeCount(facts.activeUploadCount);
    const uploadProblemCount = normalizeCount(facts.uploadProblemCount);
    const lastSuccessfulSyncAt = asNullableIsoString(facts.lastSuccessfulSyncAt);

    let statusKey = STATUS_KEYS.checking;
    let label = 'Checking';
    let supportingText = 'Checking Forge connection and saved orders.';

    if (uploadProblemCount > 0) {
      statusKey = STATUS_KEYS.needsAttention;
      label = 'Needs Attention';
      supportingText = uploadProblemCount === 1
        ? '1 saved order has not uploaded. Tap to review.'
        : `${uploadProblemCount} saved orders have not uploaded. Tap to review.`;
    } else if (activeUploadCount > 0) {
      statusKey = STATUS_KEYS.syncing;
      label = 'Syncing';
      supportingText = `Uploading ${activeUploadCount} saved order${activeUploadCount === 1 ? '' : 's'}.`;
    } else if (pendingUploadCount > 0) {
      statusKey = STATUS_KEYS.waitingToRetry;
      label = 'Waiting to Retry';
      supportingText = pendingUploadCount === 1
        ? '1 order is saved on this iPad and waiting for the next Forge upload attempt.'
        : `${pendingUploadCount} orders are saved on this iPad and waiting for the next Forge upload attempt.`;
    } else if (serverState === SERVER_STATES.unavailable) {
      statusKey = STATUS_KEYS.serverUnavailable;
      label = 'Server Unavailable';
      supportingText = 'Forge server could not be reached right now.';
    } else if (serverState === SERVER_STATES.connected) {
      statusKey = STATUS_KEYS.synced;
      label = 'Synced';
      supportingText = 'All saved orders are on the Forge server.';
    } else if (!isChecking) {
      statusKey = STATUS_KEYS.serverUnavailable;
      label = 'Server Unavailable';
      supportingText = 'Forge server could not be reached right now.';
    }

    return {
      statusKey,
      label,
      supportingText,
      browserOnline,
      serverState,
      serverLabel: serverState === SERVER_STATES.connected
        ? 'Connected'
        : (serverState === SERVER_STATES.unavailable ? 'Unavailable' : 'Checking'),
      pendingUploadCount,
      activeUploadCount,
      uploadProblemCount,
      lastSuccessfulSyncAt,
      isChecking,
      isRetryingUploads,
      isRecheckingConnection
    };
  }

  function createSyncStatusController(options = {}) {
    const orderStore = options.orderStore;
    const apiClient = options.apiClient;
    const syncCoordinator = options.syncCoordinator || null;
    const eventTarget = options.eventTarget || null;
    const documentTarget = options.documentTarget || null;
    const navigatorLike = options.navigatorLike || null;
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const setTimeoutFn = typeof options.setTimeoutFn === 'function' ? options.setTimeoutFn : setTimeout;
    const clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ? options.clearTimeoutFn : clearTimeout;
    const visibleIntervalMs = normalizePositiveInteger(options.visibleIntervalMs, VISIBLE_HEALTH_INTERVAL_MS);
    const hiddenIntervalMs = normalizePositiveInteger(options.hiddenIntervalMs, HIDDEN_HEALTH_INTERVAL_MS);
    const minHealthCheckGapMs = normalizePositiveInteger(options.minHealthCheckGapMs, MIN_HEALTH_CHECK_GAP_MS);
    const subscribers = new Set();
    let started = false;
    let pollingTimerId = null;
    let refreshPromise = null;
    let healthPromise = null;
    let syncCoordinatorUnsubscribe = null;
    let lastHealthCheckStartedAt = null;
    let lastHealthCheckCompletedAt = null;
    let lastHealthCheckSucceededAt = null;
    let lastHealthCheckFailedAt = null;
    let lastHealthCheckSucceeded = null;
    let coordinatorState = createDefaultCoordinatorState();
    let snapshot = deriveSyncStatusSnapshot({
      browserOnline: getBrowserOnlineState(navigatorLike),
      serverState: SERVER_STATES.checking,
      isChecking: true,
      pendingUploadCount: 0,
      activeUploadCount: 0,
      uploadProblemCount: 0,
      lastSuccessfulSyncAt: null
    });
    let recordsSummary = summarizeOrderSyncRecords([], {});
    let isRefreshing = false;
    let isRetryingUploads = false;
    let isRecheckingConnection = false;

    if (!orderStore || typeof orderStore.listOrders !== 'function') {
      throw new Error('Forge sync status requires an orderStore with listOrders().');
    }
    if (!apiClient || typeof apiClient.checkHealth !== 'function') {
      throw new Error('Forge sync status requires an apiClient with checkHealth().');
    }

    function start() {
      if (started) {
        return refresh({ checkHealth: false });
      }
      started = true;
      if (eventTarget && typeof eventTarget.addEventListener === 'function') {
        eventTarget.addEventListener('online', handleOnline);
        eventTarget.addEventListener('offline', handleOffline);
      }
      if (documentTarget && typeof documentTarget.addEventListener === 'function') {
        documentTarget.addEventListener('visibilitychange', handleVisibilityChange);
      }
      if (syncCoordinator && typeof syncCoordinator.subscribe === 'function') {
        syncCoordinatorUnsubscribe = syncCoordinator.subscribe((nextState) => {
          coordinatorState = normalizeCoordinatorState(nextState);
          refresh({ checkHealth: coordinatorState.lastProcessedCount > 0 }).catch(() => {});
        });
      } else if (syncCoordinator && typeof syncCoordinator.getState === 'function') {
        coordinatorState = normalizeCoordinatorState(syncCoordinator.getState());
      }
      scheduleNextPollingPass();
      return refresh({ checkHealth: true });
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      subscribers.add(listener);
      listener(snapshot);
      return () => {
        subscribers.delete(listener);
      };
    }

    function getSnapshot() {
      return deepCloneValue(snapshot);
    }

    async function refresh(options = {}) {
      if (refreshPromise) {
        return refreshPromise;
      }

      refreshPromise = (async () => {
        isRefreshing = true;
        notify();
        try {
          if (options.checkHealth) {
            await checkHealth({ force: Boolean(options.forceHealthCheck) });
          }
          const records = await loadRecords();
          recordsSummary = summarizeOrderSyncRecords(records, {});
          updateSnapshot();
          return getSnapshot();
        } finally {
          isRefreshing = false;
          updateSnapshot();
          notify();
          refreshPromise = null;
        }
      })();

      return refreshPromise;
    }

    async function retryUploads() {
      if (isRetryingUploads || !syncCoordinator || typeof syncCoordinator.requestPendingSync !== 'function') {
        return getSnapshot();
      }
      isRetryingUploads = true;
      updateSnapshot();
      notify();
      try {
        await refresh({ checkHealth: true, forceHealthCheck: true });
        await syncCoordinator.requestPendingSync({ force: true });
        await refresh({ checkHealth: true, forceHealthCheck: true });
        return getSnapshot();
      } finally {
        isRetryingUploads = false;
        updateSnapshot();
        notify();
      }
    }

    async function recheckConnection() {
      if (isRecheckingConnection) {
        return getSnapshot();
      }
      isRecheckingConnection = true;
      updateSnapshot();
      notify();
      try {
        await refresh({ checkHealth: true, forceHealthCheck: true });
        return getSnapshot();
      } finally {
        isRecheckingConnection = false;
        updateSnapshot();
        notify();
      }
    }

    async function waitForOrderDisplayState(forgeOrderUuid, options = {}) {
      const orderUuid = asTrimmedString(forgeOrderUuid);
      if (!orderUuid || !orderStore || typeof orderStore.getOrder !== 'function') {
        return null;
      }
      const timeoutMs = normalizePositiveInteger(options.timeoutMs, 1500);
      const pollIntervalMs = normalizePositiveInteger(options.pollIntervalMs, 100);
      const startedAt = getNow().getTime();

      while ((getNow().getTime() - startedAt) < timeoutMs) {
        let record = null;
        try {
          record = await orderStore.getOrder(orderUuid);
        } catch {
          record = null;
        }
        if (!record) {
          return null;
        }
        const recordState = deriveRecordSyncState(record);
        if (recordState.key === 'synced' || recordState.key === 'problem') {
          return record;
        }
        await wait(pollIntervalMs);
      }

      try {
        return await orderStore.getOrder(orderUuid);
      } catch {
        return null;
      }
    }

    async function checkHealth(options = {}) {
      const force = Boolean(options.force);
      const now = getNow();
      if (!force && healthPromise) {
        return healthPromise;
      }
      if (!force && lastHealthCheckCompletedAt && (now.getTime() - lastHealthCheckCompletedAt.getTime()) < minHealthCheckGapMs) {
        return lastHealthCheckSucceeded === true;
      }
      if (!getBrowserOnlineState(navigatorLike)) {
        lastHealthCheckStartedAt = now;
        lastHealthCheckCompletedAt = now;
        lastHealthCheckFailedAt = now;
        lastHealthCheckSucceeded = false;
        updateSnapshot();
        notify();
        return false;
      }

      lastHealthCheckStartedAt = now;
      updateSnapshot();
      notify();

      healthPromise = (async () => {
        try {
          await apiClient.checkHealth();
          const completedAt = getNow();
          lastHealthCheckCompletedAt = completedAt;
          lastHealthCheckSucceededAt = completedAt;
          lastHealthCheckSucceeded = true;
          return true;
        } catch {
          const completedAt = getNow();
          lastHealthCheckCompletedAt = completedAt;
          lastHealthCheckFailedAt = completedAt;
          lastHealthCheckSucceeded = false;
          return false;
        } finally {
          healthPromise = null;
          updateSnapshot();
          notify();
        }
      })();

      return healthPromise;
    }

    function getOrderSyncSummary() {
      return deepCloneValue(recordsSummary);
    }

    function handleOnline() {
      refresh({ checkHealth: true, forceHealthCheck: true }).catch(() => {});
      if (syncCoordinator && typeof syncCoordinator.requestPendingSync === 'function') {
        syncCoordinator.requestPendingSync().catch(() => {});
      }
    }

    function handleOffline() {
      updateSnapshot();
      notify();
    }

    function handleVisibilityChange() {
      scheduleNextPollingPass();
      if (getVisibilityState(documentTarget) === 'visible') {
        refresh({ checkHealth: true }).catch(() => {});
        if (syncCoordinator && typeof syncCoordinator.requestPendingSync === 'function') {
          syncCoordinator.requestPendingSync().catch(() => {});
        }
      }
    }

    function scheduleNextPollingPass() {
      if (pollingTimerId !== null) {
        clearTimeoutFn(pollingTimerId);
        pollingTimerId = null;
      }
      const delay = getVisibilityState(documentTarget) === 'hidden'
        ? hiddenIntervalMs
        : visibleIntervalMs;
      pollingTimerId = setTimeoutFn(() => {
        pollingTimerId = null;
        refresh({ checkHealth: true }).catch(() => {});
        scheduleNextPollingPass();
      }, delay);
      if (pollingTimerId && typeof pollingTimerId.unref === 'function') {
        pollingTimerId.unref();
      }
    }

    async function loadRecords() {
      try {
        const records = await orderStore.listOrders();
        return Array.isArray(records) ? records : [];
      } catch {
        return [];
      }
    }

    function updateSnapshot() {
      snapshot = deriveSyncStatusSnapshot({
        browserOnline: getBrowserOnlineState(navigatorLike),
        serverState: getCurrentServerState(),
        isChecking: isRefreshing || Boolean(healthPromise) || lastHealthCheckStartedAt === null,
        pendingUploadCount: recordsSummary.pendingUploadCount,
        activeUploadCount: Math.max(recordsSummary.activeUploadCount, coordinatorState.activeOrderCount),
        uploadProblemCount: recordsSummary.uploadProblemCount,
        lastSuccessfulSyncAt: recordsSummary.lastSuccessfulSyncAt,
        isRetryingUploads,
        isRecheckingConnection
      });
    }

    function getCurrentServerState() {
      if (!getBrowserOnlineState(navigatorLike)) {
        return SERVER_STATES.unavailable;
      }
      const now = getNow().getTime();
      const freshWindow = getVisibilityState(documentTarget) === 'hidden'
        ? HIDDEN_SERVER_REACHABILITY_FRESH_MS
        : SERVER_REACHABILITY_FRESH_MS;

      if (lastHealthCheckSucceededAt && (now - lastHealthCheckSucceededAt.getTime()) <= freshWindow) {
        return SERVER_STATES.connected;
      }
      if (lastHealthCheckSucceeded === false && lastHealthCheckCompletedAt && (now - lastHealthCheckCompletedAt.getTime()) <= freshWindow) {
        return SERVER_STATES.unavailable;
      }
      return SERVER_STATES.checking;
    }

    function notify() {
      subscribers.forEach((listener) => {
        listener(snapshot);
      });
    }

    function wait(delayMs) {
      return new Promise((resolve) => {
        setTimeoutFn(resolve, delayMs);
      });
    }

    return {
      getOrderSyncSummary,
      getSnapshot,
      refresh,
      recheckConnection,
      retryUploads,
      start,
      subscribe,
      waitForOrderDisplayState
    };
  }

  function normalizeCoordinatorState(value) {
    return {
      activeOrderCount: normalizeCount(value?.activeOrderCount),
      lastProcessedCount: normalizeCount(value?.lastProcessedCount)
    };
  }

  function createDefaultCoordinatorState() {
    return {
      activeOrderCount: 0,
      lastProcessedCount: 0
    };
  }

  function normalizeServerState(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === SERVER_STATES.connected || normalized === SERVER_STATES.unavailable) {
      return normalized;
    }
    return SERVER_STATES.checking;
  }

  function getBrowserOnlineState(navigatorLike) {
    return navigatorLike?.onLine !== false;
  }

  function getVisibilityState(documentTarget) {
    return documentTarget?.visibilityState === 'hidden' ? 'hidden' : 'visible';
  }

  function isRetryableSyncFailureCode(code) {
    if (syncModule && typeof syncModule.isOrderEligibleForAutomaticSync === 'function') {
      return syncModule.isOrderEligibleForAutomaticSync({
        server_upload_status: 'failed',
        last_server_upload_error: { code }
      });
    }
    return !['uuid_conflict', 'invalid_order', 'invalid_json', 'request_too_large', 'unsupported_media_type', 'method_not_allowed', 'invalid_request', 'invalid_record'].includes(asTrimmedString(code).toLowerCase());
  }

  function pickLatestIsoTimestamp(currentValue, candidateValue) {
    const currentTime = Date.parse(currentValue || '');
    const candidateTime = Date.parse(candidateValue || '');
    if (!Number.isFinite(candidateTime)) {
      return currentValue || null;
    }
    if (!Number.isFinite(currentTime) || candidateTime > currentTime) {
      return candidateValue;
    }
    return currentValue;
  }

  function asNullableIsoString(value) {
    const normalized = asTrimmedString(value);
    return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function normalizePositiveInteger(value, fallbackValue) {
    return Number.isInteger(value) && value > 0 ? value : fallbackValue;
  }

  function normalizeCount(value) {
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  function deepCloneValue(value) {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  return {
    SERVER_STATES,
    STATUS_KEYS,
    createSyncStatusController,
    deriveRecordSyncState,
    deriveSyncStatusSnapshot,
    summarizeOrderSyncRecords
  };
}));
