const test = require('node:test');
const assert = require('node:assert/strict');

const syncStatusModule = require('../public/js/forge-sync-status.js');

function createRecord(overrides = {}) {
  return {
    forge_order_uuid: 'order-1',
    sync_status: 'pending',
    server_upload_status: 'pending',
    server_upload_attempt_count: 0,
    last_server_upload_error: null,
    server_received_at: null,
    payload: {
      customer: {
        full_name: 'Test Customer'
      }
    },
    ...overrides
  };
}

test('checking state stays neutral while current facts are still being determined', () => {
  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: true,
    serverState: syncStatusModule.SERVER_STATES.checking,
    isChecking: true,
    pendingUploadCount: 0,
    activeUploadCount: 0,
    uploadProblemCount: 0,
    lastSuccessfulSyncAt: null
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.checking);
  assert.equal(snapshot.label, 'Checking');
});

test('browser offline with zero pending orders reports server unavailable', () => {
  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: false,
    serverState: syncStatusModule.SERVER_STATES.unavailable,
    isChecking: false,
    pendingUploadCount: 0,
    activeUploadCount: 0,
    uploadProblemCount: 0,
    lastSuccessfulSyncAt: null
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.serverUnavailable);
  assert.equal(snapshot.label, 'Server Unavailable');
});

test('browser offline with pending orders reports that the saved orders are waiting to retry', () => {
  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: false,
    serverState: syncStatusModule.SERVER_STATES.unavailable,
    isChecking: false,
    pendingUploadCount: 2,
    activeUploadCount: 0,
    uploadProblemCount: 0,
    lastSuccessfulSyncAt: null
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.waitingToRetry);
  assert.equal(snapshot.label, 'Waiting to Retry');
  assert.match(snapshot.supportingText, /2 orders are saved on this iPad and waiting/i);
});

test('online with unreachable Forge server and no pending orders reports server unavailable', () => {
  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: true,
    serverState: syncStatusModule.SERVER_STATES.unavailable,
    isChecking: false,
    pendingUploadCount: 0,
    activeUploadCount: 0,
    uploadProblemCount: 0,
    lastSuccessfulSyncAt: null
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.serverUnavailable);
});

test('reachable Forge server with zero pending orders reports synced', () => {
  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: true,
    serverState: syncStatusModule.SERVER_STATES.connected,
    isChecking: false,
    pendingUploadCount: 0,
    activeUploadCount: 0,
    uploadProblemCount: 0,
    lastSuccessfulSyncAt: '2026-07-27T18:00:00.000Z'
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.synced);
  assert.equal(snapshot.label, 'Synced');
});

test('active uploads report syncing', () => {
  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: true,
    serverState: syncStatusModule.SERVER_STATES.connected,
    isChecking: false,
    pendingUploadCount: 3,
    activeUploadCount: 2,
    uploadProblemCount: 0,
    lastSuccessfulSyncAt: null
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.syncing);
  assert.equal(snapshot.label, 'Syncing');
});

test('non-retryable failures report needs attention', () => {
  const summary = syncStatusModule.summarizeOrderSyncRecords([
    createRecord({
      forge_order_uuid: 'bad-order',
      server_upload_status: 'failed',
      server_upload_attempt_count: 4,
      last_server_upload_error: {
        code: 'invalid_order',
        message: 'The Forge order payload was rejected by the server.'
      }
    })
  ]);

  const snapshot = syncStatusModule.deriveSyncStatusSnapshot({
    browserOnline: true,
    serverState: syncStatusModule.SERVER_STATES.connected,
    isChecking: false,
    pendingUploadCount: summary.pendingUploadCount,
    activeUploadCount: summary.activeUploadCount,
    uploadProblemCount: summary.uploadProblemCount,
    lastSuccessfulSyncAt: summary.lastSuccessfulSyncAt
  });

  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.needsAttention);
  assert.equal(snapshot.label, 'Needs Attention');
});

test('last successful sync timestamp comes from the latest acknowledged order', () => {
  const summary = syncStatusModule.summarizeOrderSyncRecords([
    createRecord({
      forge_order_uuid: 'stored-1',
      server_upload_status: 'stored',
      server_received_at: '2026-07-27T18:00:00.000Z',
      server_payload_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      server_created: true
    }),
    createRecord({
      forge_order_uuid: 'stored-2',
      server_upload_status: 'stored',
      server_received_at: '2026-07-27T18:05:00.000Z',
      server_payload_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      server_created: false
    })
  ]);

  assert.equal(summary.lastSuccessfulSyncAt, '2026-07-27T18:05:00.000Z');
});

test('duplicate idempotent acknowledgements are still treated as synced', () => {
  const recordState = syncStatusModule.deriveRecordSyncState(createRecord({
    server_upload_status: 'stored',
    server_created: false,
    server_received_at: '2026-07-27T18:05:00.000Z',
    server_payload_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  }));

  assert.equal(recordState.key, 'synced');
});

test('deleted or conflicting UUIDs become upload problems and do not look retryable', () => {
  const recordState = syncStatusModule.deriveRecordSyncState(createRecord({
    server_upload_status: 'conflict',
    last_server_upload_error: {
      code: 'uuid_conflict',
      message: 'A different Forge order is already stored on the server for this UUID.'
    }
  }));

  assert.equal(recordState.key, 'problem');
});

test('controller retry action uses the existing queue and updates counts after a successful retry', async () => {
  const records = [
    createRecord({
      forge_order_uuid: 'pending-order',
      server_upload_status: 'pending'
    })
  ];
  let healthCheckCount = 0;
  let syncRequestCount = 0;
  const subscribers = new Set();
  const controller = syncStatusModule.createSyncStatusController({
    orderStore: {
      async listOrders() {
        return records;
      },
      async getOrder(forgeOrderUuid) {
        return records.find((record) => record.forge_order_uuid === forgeOrderUuid) || null;
      }
    },
    apiClient: {
      async checkHealth() {
        healthCheckCount += 1;
        return {
          ok: true,
          application: 'Forge',
          apiVersion: '1',
          status: 'ok',
          serverTime: '2026-07-27T18:06:00.000Z'
        };
      }
    },
    syncCoordinator: {
      subscribe(listener) {
        subscribers.add(listener);
        listener({ activeOrderCount: 0, lastProcessedCount: 0 });
        return () => subscribers.delete(listener);
      },
      async requestPendingSync() {
        syncRequestCount += 1;
        subscribers.forEach((listener) => listener({ activeOrderCount: 1, lastProcessedCount: 0 }));
        records[0] = createRecord({
          forge_order_uuid: 'pending-order',
          server_upload_status: 'stored',
          server_received_at: '2026-07-27T18:07:00.000Z',
          server_payload_sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          server_created: true
        });
        subscribers.forEach((listener) => listener({ activeOrderCount: 0, lastProcessedCount: 1 }));
        return { ok: true };
      }
    },
    eventTarget: { addEventListener() {} },
    documentTarget: { visibilityState: 'visible', addEventListener() {} },
    navigatorLike: { onLine: true },
    setTimeoutFn(handler) {
      return setTimeout(handler, 0);
    },
    clearTimeoutFn(timerId) {
      clearTimeout(timerId);
    }
  });

  await controller.start();
  await controller.retryUploads();
  const snapshot = controller.getSnapshot();

  assert.equal(healthCheckCount >= 1, true);
  assert.equal(syncRequestCount, 1);
  assert.equal(snapshot.statusKey, syncStatusModule.STATUS_KEYS.synced);
});

test('sync status source does not claim WooCommerce synchronization anywhere', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'public/js/forge-sync-status.js'), 'utf8');
  assert.doesNotMatch(source, /WooCommerce synced|WooCommerce synchronized/i);
});
