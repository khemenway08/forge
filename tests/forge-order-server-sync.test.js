const test = require('node:test');
const assert = require('node:assert/strict');

const orderStoreModule = require('../public/js/forge-order-store.js');
const syncModule = require('../public/js/forge-order-server-sync.js');

function createPayload(overrides = {}) {
  return {
    forge_order_uuid: 'sync-order-1',
    customer: {
      full_name: 'Test Customer',
      email: 'test@example.invalid'
    },
    items: [
      {
        line_id: 'sync-order-1-line-1',
        quantity: 1
      }
    ],
    pricing: {
      estimated_total_cents: 2600
    },
    ...overrides
  };
}

function createRecord(overrides = {}) {
  return {
    record_type: 'forge_local_order',
    record_version: '1.0',
    forge_order_uuid: 'sync-order-1',
    status: 'submitted',
    sync_status: 'pending',
    submitted_at: '2026-07-17T10:00:00.000Z',
    local_saved_at: '2026-07-17T10:00:01.000Z',
    sync_attempt_count: 0,
    last_sync_attempt_at: null,
    last_sync_error: null,
    payload: createPayload(),
    ...overrides
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      const listener = listeners.get(type);
      if (typeof listener === 'function') {
        listener();
      }
    }
  };
}

function createSuccessResult(overrides = {}) {
  return {
    ok: true,
    forgeOrderUuid: 'sync-order-1',
    forgeOrderNumber: 1001,
    created: true,
    receivedAt: '2026-07-17T10:05:00.000Z',
    payloadSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ...overrides
  };
}

test('loading the sync module and creating the service make no request', () => {
  let requestCount = 0;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => null,
      markOrderServerUploadAttempt: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });

  assert.equal(typeof syncModule.createOrderServerSyncService, 'function');
  assert.equal(typeof service.syncOrderByUuid, 'function');
  assert.equal(requestCount, 0);
});

test('syncOrderByUuid returns not_found without requesting when the local order is missing', async () => {
  let requestCount = 0;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => null,
      markOrderServerUploadAttempt: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });

  const result = await service.syncOrderByUuid('missing-order');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'not_found');
  assert.equal(result.forgeOrderUuid, 'missing-order');
  assert.equal(requestCount, 0);
});

test('invalid payload and payload UUID mismatch make no request', async () => {
  let requestCount = 0;
  const invalidPayloadService = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => ({ forge_order_uuid: 'sync-order-1', payload: null }),
      markOrderServerUploadAttempt: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });
  const mismatchedPayloadService = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => ({ forge_order_uuid: 'sync-order-1', payload: createPayload({ forge_order_uuid: 'other-order' }) }),
      markOrderServerUploadAttempt: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });

  const invalidPayloadResult = await invalidPayloadService.syncOrderByUuid('sync-order-1');
  const mismatchedPayloadResult = await mismatchedPayloadService.syncOrderByUuid('sync-order-1');

  assert.equal(invalidPayloadResult.code, 'invalid_record');
  assert.equal(mismatchedPayloadResult.code, 'invalid_record');
  assert.equal(requestCount, 0);
});

test('attempt state is saved before the request and the complete payload is submitted unchanged', async () => {
  const payload = createPayload();
  const storeCalls = [];
  let submittedPayload = null;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => {
        storeCalls.push('getOrder');
        return createRecord({ payload });
      },
      markOrderServerUploadAttempt: async () => {
        storeCalls.push('markAttempt');
        return createRecord({
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.uploading,
          server_upload_attempt_count: 1
        });
      },
      markOrderServerUploadSuccess: async (_uuid, result) => {
        storeCalls.push('markSuccess');
        return createRecord({
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.stored,
          server_upload_attempt_count: 1,
          server_received_at: result.receivedAt,
          server_payload_sha256: result.payloadSha256,
          server_created: result.created
        });
      },
      markOrderServerUploadFailure: async () => {
        storeCalls.push('markFailure');
      }
    },
    apiClient: {
      submitOrder: async (nextPayload) => {
        storeCalls.push('submitOrder');
        submittedPayload = nextPayload;
        return createSuccessResult();
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, true);
  assert.deepEqual(storeCalls, ['getOrder', 'markAttempt', 'submitOrder', 'markSuccess']);
  assert.deepEqual(submittedPayload, payload);
});

test('successful sync records stored state and keeps sync_status pending', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();
  await store.saveNewOrder(createRecord());

  const service = syncModule.createOrderServerSyncService({
    orderStore: store,
    apiClient: {
      submitOrder: async () => createSuccessResult({
        created: false,
        payloadSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      })
    },
    now: () => new Date('2026-07-17T10:05:30.000Z')
  });

  const result = await service.syncOrderByUuid('sync-order-1');
  const storedRecord = await store.getOrder('sync-order-1');

  assert.equal(result.ok, true);
  assert.equal(result.alreadyStored, false);
  assert.equal(result.created, false);
  assert.equal(result.record.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.stored);
  assert.equal(result.record.sync_status, 'pending');
  assert.equal(storedRecord.sync_status, 'pending');
  assert.equal(storedRecord.forge_order_number, 1001);
  assert.equal(storedRecord.payload.forge_order_number, 1001);
  assert.equal(storedRecord.server_created, false);
  assert.equal(storedRecord.server_payload_sha256, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
});

test('already-stored local records return success without another request', async () => {
  let requestCount = 0;
  let attemptCount = 0;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => createRecord({
        server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.stored,
        server_received_at: '2026-07-17T10:06:00.000Z',
        server_payload_sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        server_created: true
      }),
      markOrderServerUploadAttempt: async () => {
        attemptCount += 1;
      },
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, true);
  assert.equal(result.alreadyStored, true);
  assert.equal(requestCount, 0);
  assert.equal(attemptCount, 0);
});

test('uuid_conflict records conflict and returns a distinguishable safe failure', async () => {
  let storedFailure = null;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => createRecord(),
      markOrderServerUploadAttempt: async () => createRecord({
        server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.uploading,
        server_upload_attempt_count: 1
      }),
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async (_uuid, error) => {
        storedFailure = error;
        return createRecord({
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.conflict,
          last_server_upload_error: {
            code: error.code,
            message: error.message
          }
        });
      }
    },
    apiClient: {
      submitOrder: async () => {
        const error = new Error('conflict');
        error.code = 'uuid_conflict';
        error.message = 'Do not store raw customer data';
        throw error;
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'uuid_conflict');
  assert.equal(storedFailure.code, 'uuid_conflict');
  assert.equal(storedFailure.message, 'A different Forge order is already stored on the server for this UUID.');
});

test('network, timeout, and storage_unavailable failures return safe retryable upload failures', async () => {
  for (const code of ['network_error', 'timeout', 'storage_unavailable', 'server_error']) {
    let requestCount = 0;
    let failureCount = 0;
    const service = syncModule.createOrderServerSyncService({
      orderStore: {
        getOrder: async () => createRecord(),
        markOrderServerUploadAttempt: async () => createRecord({
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.uploading,
          server_upload_attempt_count: 1
        }),
        markOrderServerUploadSuccess: async () => {
          throw new Error('should not run');
        },
        markOrderServerUploadFailure: async () => {
          failureCount += 1;
          return createRecord({
            server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed
          });
        }
      },
      apiClient: {
        submitOrder: async () => {
          requestCount += 1;
          const error = new Error(code);
          error.code = code;
          throw error;
        }
      }
    });

    const result = await service.syncOrderByUuid('sync-order-1');

    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(requestCount, 1);
    assert.equal(failureCount, 1);
  }
});

test('a timeout persists a retry schedule and an idempotent retry stores the original local record', async () => {
  const store = orderStoreModule.createInMemoryOrderStore();
  await store.saveNewOrder(createRecord());
  const submittedPayloads = [];
  const nowValues = [
    '2026-07-17T10:00:00.000Z',
    '2026-07-17T10:00:03.000Z',
    '2026-07-17T10:00:18.000Z',
    '2026-07-17T10:00:19.000Z'
  ];
  const service = syncModule.createOrderServerSyncService({
    orderStore: store,
    apiClient: {
      submitOrder: async (payload) => {
        submittedPayloads.push(payload);
        if (submittedPayloads.length === 1) {
          const error = new Error('timeout');
          error.code = 'timeout';
          throw error;
        }
        return createSuccessResult({ created: false });
      }
    },
    now: () => new Date(nowValues.length > 1 ? nowValues.shift() : nowValues[0])
  });

  const firstResult = await service.syncOrderByUuid('sync-order-1');
  const waitingRecord = await store.getOrder('sync-order-1');
  const secondResult = await service.syncOrderByUuid('sync-order-1');
  const storedRecord = await store.getOrder('sync-order-1');

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.code, 'timeout');
  assert.equal(waitingRecord.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.failed);
  assert.equal(waitingRecord.server_upload_next_retry_at, '2026-07-17T10:00:18.000Z');
  assert.equal(waitingRecord.server_upload_needs_staff_attention, false);
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.created, false);
  assert.equal(storedRecord.server_upload_status, orderStoreModule.SERVER_UPLOAD_STATUSES.stored);
  assert.equal((await store.listOrders()).length, 1);
  assert.equal(submittedPayloads.length, 2);
  assert.equal(submittedPayloads[0].forge_order_uuid, 'sync-order-1');
  assert.equal(submittedPayloads[1].forge_order_uuid, 'sync-order-1');
  assert.deepEqual(submittedPayloads[1], submittedPayloads[0]);
});

test('invalid_order becomes a non-retryable failed upload', async () => {
  let storedFailure = null;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => createRecord(),
      markOrderServerUploadAttempt: async () => createRecord({
        server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.uploading,
        server_upload_attempt_count: 1
      }),
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async (_uuid, error) => {
        storedFailure = error;
        return createRecord({
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
          last_server_upload_error: error
        });
      }
    },
    apiClient: {
      submitOrder: async () => {
        const error = new Error('invalid');
        error.code = 'invalid_order';
        throw error;
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_order');
  assert.equal(storedFailure.code, 'invalid_order');
  assert.equal(storedFailure.message, 'The Forge order payload was rejected by the server.');
});

test('attempt-state storage failure prevents the request', async () => {
  let requestCount = 0;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => createRecord(),
      markOrderServerUploadAttempt: async () => {
        throw new Error('disk full');
      },
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'local_storage_error');
  assert.equal(requestCount, 0);
});

test('success-state storage failure returns local_storage_error without issuing a second request', async () => {
  let requestCount = 0;
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => createRecord(),
      markOrderServerUploadAttempt: async () => createRecord(),
      markOrderServerUploadSuccess: async () => {
        throw new Error('write failed');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async () => {
        requestCount += 1;
        return createSuccessResult();
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'local_storage_error');
  assert.equal(requestCount, 1);
});

test('failure-state storage failure returns the original safe API failure', async () => {
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async () => createRecord(),
      markOrderServerUploadAttempt: async () => createRecord(),
      markOrderServerUploadSuccess: async () => {
        throw new Error('should not run');
      },
      markOrderServerUploadFailure: async () => {
        throw new Error('write failed');
      }
    },
    apiClient: {
      submitOrder: async () => {
        const error = new Error('network');
        error.code = 'network_error';
        throw error;
      }
    }
  });

  const result = await service.syncOrderByUuid('sync-order-1');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'network_error');
  assert.equal(result.message, 'The Forge server could not be reached.');
});

test('two simultaneous calls for one UUID share one in-flight request, while different UUIDs remain independent', async () => {
  let requestCount = 0;
  let resolveFirstRequest;
  const firstRequestPromise = new Promise((resolve) => {
    resolveFirstRequest = resolve;
  });
  const service = syncModule.createOrderServerSyncService({
    orderStore: {
      getOrder: async (uuid) => createRecord({
        forge_order_uuid: uuid,
        payload: createPayload({ forge_order_uuid: uuid })
      }),
      markOrderServerUploadAttempt: async (uuid) => createRecord({
        forge_order_uuid: uuid,
        payload: createPayload({ forge_order_uuid: uuid })
      }),
      markOrderServerUploadSuccess: async (uuid, result) => createRecord({
        forge_order_uuid: uuid,
        payload: createPayload({ forge_order_uuid: uuid }),
        server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.stored,
        server_received_at: result.receivedAt,
        server_payload_sha256: result.payloadSha256,
        server_created: result.created
      }),
      markOrderServerUploadFailure: async () => {
        throw new Error('should not run');
      }
    },
    apiClient: {
      submitOrder: async (payload) => {
        requestCount += 1;
        if (payload.forge_order_uuid === 'sync-order-1') {
          await firstRequestPromise;
        }
        return createSuccessResult({ forgeOrderUuid: payload.forge_order_uuid });
      }
    }
  });

  const firstA = service.syncOrderByUuid('sync-order-1');
  const firstB = service.syncOrderByUuid('sync-order-1');
  const secondUuid = service.syncOrderByUuid('sync-order-2');
  resolveFirstRequest();
  const [resultA, resultB, resultC] = await Promise.all([firstA, firstB, secondUuid]);

  assert.equal(requestCount, 2);
  assert.deepEqual(resultA, resultB);
  assert.equal(resultC.forgeOrderUuid, 'sync-order-2');
});

test('automatic sync is disabled for localhost and enabled for hosted https origins only', () => {
  assert.equal(syncModule.isAutomaticOrderSyncAllowed({ protocol: 'file:', hostname: '' }), false);
  assert.equal(syncModule.isAutomaticOrderSyncAllowed({ protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(syncModule.isAutomaticOrderSyncAllowed({ protocol: 'https:', hostname: '127.0.0.1' }), false);
  assert.equal(syncModule.isAutomaticOrderSyncAllowed({ protocol: 'https:', hostname: 'forge.example.com' }), true);
});

test('automatic sync eligibility skips stored, conflict, and non-retryable failed records', () => {
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.pending
  })), true);
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
    last_server_upload_error: { code: 'network_error' }
  })), true);
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
    last_server_upload_error: { code: 'network_error' },
    server_upload_next_retry_at: '2026-07-17T10:10:00.000Z'
  }), { now: new Date('2026-07-17T10:05:00.000Z') }), false);
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
    last_server_upload_error: { code: 'network_error' },
    server_upload_next_retry_at: '2026-07-17T10:04:00.000Z'
  }), { now: new Date('2026-07-17T10:05:00.000Z') }), true);
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
    last_server_upload_error: { code: 'invalid_order' }
  })), false);
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.conflict,
    last_server_upload_error: { code: 'uuid_conflict' }
  })), false);
  assert.equal(syncModule.isOrderEligibleForAutomaticSync(createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.stored,
    server_received_at: '2026-07-17T10:06:00.000Z',
    server_payload_sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    server_created: true
  })), false);
});

test('automatic retry schedules a due retry without looping and staff retry can force the original UUID once', async () => {
  const retryRecord = createRecord({
    server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
    last_server_upload_error: { code: 'timeout' },
    server_upload_next_retry_at: '2026-07-17T10:00:15.000Z'
  });
  const timers = [];
  const syncedUuids = [];
  let currentTime = '2026-07-17T10:00:00.000Z';
  const coordinator = syncModule.createAutomaticOrderSyncCoordinator({
    enabled: true,
    location: { protocol: 'https:', hostname: 'forge.example.com' },
    orderStore: {
      listOrders: async () => [retryRecord]
    },
    syncService: {
      syncOrderByUuid: async (uuid) => {
        syncedUuids.push(uuid);
        return { ok: true, forgeOrderUuid: uuid };
      }
    },
    now: () => new Date(currentTime),
    setTimeoutFn(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn() {},
    eventTarget: createEventTarget()
  });

  await coordinator.start();
  assert.deepEqual(syncedUuids, []);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 15000);

  currentTime = '2026-07-17T10:00:15.000Z';
  timers[0].callback();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(syncedUuids, ['sync-order-1']);

  currentTime = '2026-07-17T10:00:00.000Z';
  await coordinator.requestPendingSync({ force: true });
  assert.deepEqual(syncedUuids, ['sync-order-1', 'sync-order-1']);
});

test('startup requests synchronization for eligible unsynced orders only', async () => {
  const syncedUuids = [];
  const coordinator = syncModule.createAutomaticOrderSyncCoordinator({
    enabled: true,
    location: { protocol: 'https:', hostname: 'forge.example.com' },
    orderStore: {
      listOrders: async () => [
        createRecord({ forge_order_uuid: 'pending-order', payload: createPayload({ forge_order_uuid: 'pending-order' }) }),
        createRecord({
          forge_order_uuid: 'failed-order',
          payload: createPayload({ forge_order_uuid: 'failed-order' }),
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
          last_server_upload_error: { code: 'network_error' }
        }),
        createRecord({
          forge_order_uuid: 'conflict-order',
          payload: createPayload({ forge_order_uuid: 'conflict-order' }),
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.conflict,
          last_server_upload_error: { code: 'uuid_conflict' }
        }),
        createRecord({
          forge_order_uuid: 'validation-order',
          payload: createPayload({ forge_order_uuid: 'validation-order' }),
          server_upload_status: orderStoreModule.SERVER_UPLOAD_STATUSES.failed,
          last_server_upload_error: { code: 'invalid_order' }
        })
      ]
    },
    syncService: {
      syncOrderByUuid: async (uuid) => {
        syncedUuids.push(uuid);
        return { ok: true, forgeOrderUuid: uuid };
      }
    },
    eventTarget: createEventTarget()
  });

  await coordinator.start();

  assert.deepEqual(syncedUuids, ['pending-order', 'failed-order']);
});

test('online event requests another synchronization pass', async () => {
  const syncedUuids = [];
  const eventTarget = createEventTarget();
  let pendingUuid = 'pending-1';
  const coordinator = syncModule.createAutomaticOrderSyncCoordinator({
    enabled: true,
    location: { protocol: 'https:', hostname: 'forge.example.com' },
    orderStore: {
      listOrders: async () => {
        return [createRecord({
          forge_order_uuid: pendingUuid,
          payload: createPayload({ forge_order_uuid: pendingUuid })
        })];
      }
    },
    syncService: {
      syncOrderByUuid: async (uuid) => {
        syncedUuids.push(uuid);
        return { ok: true, forgeOrderUuid: uuid };
      }
    },
    eventTarget
  });

  await coordinator.start();
  pendingUuid = 'pending-2';
  eventTarget.dispatch('online');
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(syncedUuids, ['pending-1', 'pending-2']);
});

test('concurrent startup, online, and explicit triggers do not create overlapping sync runs', async () => {
  let activeRuns = 0;
  let maxConcurrentRuns = 0;
  let resolveFirstSync;
  const eventTarget = createEventTarget();
  const blockingSync = new Promise((resolve) => {
    resolveFirstSync = resolve;
  });
  let syncCallCount = 0;
  const coordinator = syncModule.createAutomaticOrderSyncCoordinator({
    enabled: true,
    location: { protocol: 'https:', hostname: 'forge.example.com' },
    orderStore: {
      listOrders: async () => [createRecord({
        forge_order_uuid: 'sync-order-1',
        payload: createPayload()
      })]
    },
    syncService: {
      syncOrderByUuid: async (uuid) => {
        syncCallCount += 1;
        activeRuns += 1;
        maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
        if (syncCallCount === 1) {
          await blockingSync;
        }
        activeRuns -= 1;
        return { ok: true, forgeOrderUuid: uuid };
      }
    },
    eventTarget
  });

  const startupPromise = coordinator.start();
  eventTarget.dispatch('online');
  const explicitPromise = coordinator.requestSyncForOrder('sync-order-2');
  resolveFirstSync();
  await Promise.all([startupPromise, explicitPromise]);

  assert.equal(maxConcurrentRuns, 1);
  assert.equal(syncCallCount, 3);
});
