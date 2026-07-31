(function (root, factory) {
  const payloadBuilder = typeof module === 'object' && module.exports
    ? require('./forge-order-payload-builder.js')
    : root.ForgeOrderPayloadBuilder;
  const orderStoreModule = typeof module === 'object' && module.exports
    ? require('./forge-order-store.js')
    : root.ForgeOrderStore;
  const api = factory(payloadBuilder, orderStoreModule);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeOrderSubmission = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (payloadBuilder, orderStoreModule) {
  const SUBMISSION_CONTEXT_STORAGE_KEY = 'forge-order-submission-context';
  const COMPLETION_RECEIPT_STORAGE_KEY = 'forge-order-completion-receipt';
  function createSubmissionContextManager(options = {}) {
    const storage = options.storage || null;
    const storageKey = options.storageKey || SUBMISSION_CONTEXT_STORAGE_KEY;
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const getRandomUuid = typeof options.randomUUID === 'function' ? options.randomUUID : createSubmissionUuid;

    function getOrCreateContext(activeOrderSessionId) {
      const sessionId = asTrimmedString(activeOrderSessionId);
      if (!sessionId) {
        throw new Error('Submission context requires an active order session ID.');
      }

      const existing = readStoredContext();
      if (existing && existing.activeOrderSessionId === sessionId && existing.forgeOrderUuid && existing.builtAt) {
        return deepCloneValue(existing);
      }

      const createdContext = {
        activeOrderSessionId: sessionId,
        forgeOrderUuid: getRandomUuid(),
        builtAt: normalizeDateValue(getNow()).toISOString(),
        submittedAt: existing && existing.activeOrderSessionId === sessionId
          ? existing.submittedAt || null
          : null
      };
      writeStoredContext(createdContext);
      return deepCloneValue(createdContext);
    }

    function markSubmitted(activeOrderSessionId, submittedAt) {
      const context = getOrCreateContext(activeOrderSessionId);
      if (!context.submittedAt) {
        context.submittedAt = normalizeDateValue(submittedAt || getNow()).toISOString();
        writeStoredContext(context);
      }
      return deepCloneValue(context);
    }

    function clearContext(activeOrderSessionId) {
      const existing = readStoredContext();
      if (!existing) {
        return;
      }
      if (!activeOrderSessionId || existing.activeOrderSessionId === asTrimmedString(activeOrderSessionId)) {
        removeStoredContext();
      }
    }

    function readStoredContext() {
      if (!storage || typeof storage.getItem !== 'function') {
        return null;
      }
      try {
        const raw = storage.getItem(storageKey);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }

    function writeStoredContext(context) {
      if (!storage || typeof storage.setItem !== 'function') {
        return;
      }
      storage.setItem(storageKey, JSON.stringify({
        activeOrderSessionId: asTrimmedString(context.activeOrderSessionId),
        forgeOrderUuid: asTrimmedString(context.forgeOrderUuid),
        builtAt: asTrimmedString(context.builtAt),
        submittedAt: context.submittedAt ? asTrimmedString(context.submittedAt) : null
      }));
    }

    function removeStoredContext() {
      if (!storage || typeof storage.removeItem !== 'function') {
        return;
      }
      storage.removeItem(storageKey);
    }

    return {
      clearContext,
      getOrCreateContext,
      markSubmitted
    };
  }

  function createOrderSubmissionService(options = {}) {
    const buildForgeOrderPayload = typeof options.buildForgeOrderPayload === 'function'
      ? options.buildForgeOrderPayload
      : payloadBuilder && payloadBuilder.buildForgeOrderPayload;
    const orderStore = options.orderStore || orderStoreModule;
    const contextManager = options.contextManager || createSubmissionContextManager({
      storage: typeof localStorage !== 'undefined' ? localStorage : null
    });
    const onRecordSaved = typeof options.onRecordSaved === 'function' ? options.onRecordSaved : null;
    const attemptInitialUpload = typeof options.attemptInitialUpload === 'function' ? options.attemptInitialUpload : null;
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const inFlightSubmissions = new Map();

    if (typeof buildForgeOrderPayload !== 'function') {
      throw new Error('Forge order payload builder is required for submission.');
    }
    if (!orderStore || typeof orderStore.saveNewOrder !== 'function' || typeof orderStore.getOrder !== 'function') {
      throw new Error('Forge order store is required for submission.');
    }

    async function submitOrder(input = {}) {
      const activeOrderSessionId = asTrimmedString(input.activeOrderSessionId);
      if (!activeOrderSessionId) {
        return {
          ok: false,
          error: new Error('A submitted order requires an active order session ID.')
        };
      }

      if (inFlightSubmissions.has(activeOrderSessionId)) {
        return inFlightSubmissions.get(activeOrderSessionId);
      }

      const submissionPromise = submitOrderOnce({
        activeOrderSessionId,
        orderState: input.orderState,
        paymentConfirmation: input.paymentConfirmation || null,
        event: input.event || null,
        deviceId: input.deviceId || null
      }).finally(() => {
        inFlightSubmissions.delete(activeOrderSessionId);
      });

      inFlightSubmissions.set(activeOrderSessionId, submissionPromise);
      return submissionPromise;
    }

    async function submitOrderOnce(input) {
      try {
        const immutableOrderState = deepCloneValue(input.orderState || {});
        const context = contextManager.getOrCreateContext(input.activeOrderSessionId);
        const existingRecord = await orderStore.getOrder(context.forgeOrderUuid);
        if (existingRecord) {
          return {
            ok: true,
            duplicatePrevented: true,
            record: deepCloneValue(existingRecord),
            payload: deepCloneValue(existingRecord.payload),
            context: {
              ...context,
              submittedAt: existingRecord.submitted_at
            },
            submissionOutcome: classifySubmissionOutcome(null, existingRecord)
          };
        }

        const submittedContext = contextManager.markSubmitted(input.activeOrderSessionId, getNow());
        const paymentConfirmation = normalizePaymentConfirmationInput(input.paymentConfirmation);
        const payload = buildForgeOrderPayload(immutableOrderState, {
          forgeOrderUuid: submittedContext.forgeOrderUuid,
          builtAt: submittedContext.builtAt,
          submittedAt: submittedContext.submittedAt,
          source: 'customer_kiosk',
          orderStatus: 'submitted',
          deviceId: input.deviceId || null,
          event: input.event || null,
          externalPaymentMethod: paymentConfirmation.externalPaymentMethod,
          paymentConfirmedAt: paymentConfirmation.paymentConfirmedAt
        });

        const nowIso = normalizeDateValue(getNow()).toISOString();
        const record = {
          record_type: 'forge_local_order',
          record_version: '1.0',
          forge_order_uuid: payload.forge_order_uuid,
          status: 'submitted',
          sync_status: 'pending',
          submitted_at: payload.submitted_at,
          local_saved_at: nowIso,
          sync_attempt_count: 0,
          last_sync_attempt_at: null,
          last_sync_error: null,
          event_id: payload.event?.event_id || null,
          device_id: payload.device_id || null,
          has_open_flags: Boolean(payload.has_open_flags),
          payload
        };

        const saveResult = await orderStore.saveNewOrder(record);
        let finalRecord = deepCloneValue(saveResult.record);
        let submissionOutcome = {
          state: 'saved_on_this_ipad_waiting_to_upload',
          retryable: true
        };

        if (attemptInitialUpload) {
          const firstUploadResult = await attemptInitialUpload(deepCloneValue(saveResult.record));
          if (firstUploadResult && firstUploadResult.record && typeof firstUploadResult.record === 'object') {
            finalRecord = deepCloneValue(firstUploadResult.record);
          } else {
            try {
              const refreshedRecord = await orderStore.getOrder(saveResult.record.forge_order_uuid);
              if (refreshedRecord) {
                finalRecord = deepCloneValue(refreshedRecord);
              }
            } catch {
              finalRecord = deepCloneValue(saveResult.record);
            }
          }
          submissionOutcome = classifySubmissionOutcome(firstUploadResult, finalRecord);
        }

        if (onRecordSaved) {
          queueBackgroundRecordSaved(onRecordSaved, finalRecord);
        }
        return {
          ok: true,
          duplicatePrevented: Boolean(saveResult.duplicatePrevented),
          record: deepCloneValue(finalRecord),
          payload: deepCloneValue(finalRecord.payload),
          context: deepCloneValue(submittedContext),
          submissionOutcome
        };
      } catch (error) {
        return {
          ok: false,
          error
        };
      }
    }

    function queueBackgroundRecordSaved(callback, record) {
      Promise.resolve()
        .then(() => callback(deepCloneValue(record)))
        .catch(() => {});
    }

    return {
      submitOrder
    };
  }

  function buildCompletionReceipt(input = {}) {
    const sourceRecord = input.record && typeof input.record === 'object' ? input.record : null;
    const recordPayload = sourceRecord && sourceRecord.payload && typeof sourceRecord.payload === 'object'
      ? sourceRecord.payload
      : null;
    const forgeOrderUuid = asTrimmedString(input.forgeOrderUuid || (sourceRecord && sourceRecord.forge_order_uuid) || (recordPayload && recordPayload.forge_order_uuid));
    const submittedAt = asTrimmedString(input.submittedAt || (sourceRecord && sourceRecord.submitted_at) || (recordPayload && recordPayload.submitted_at));
    const shortOrderReference = asTrimmedString(input.shortOrderReference || buildShortOrderReference(forgeOrderUuid));
    const customerName = asTrimmedString(
      input.customerName
      || (recordPayload && recordPayload.customer && recordPayload.customer.full_name)
      || ''
    );

    if (!forgeOrderUuid || !submittedAt || !shortOrderReference) {
      return null;
    }

    try {
      normalizeDateValue(submittedAt);
    } catch {
      return null;
    }

    return {
      forgeOrderUuid,
      shortOrderReference,
      customerName,
      submittedAt
    };
  }

  function createCompletionReceiptManager(options = {}) {
    const storage = options.storage || null;
    const storageKey = options.storageKey || COMPLETION_RECEIPT_STORAGE_KEY;

    function getReceipt() {
      if (!storage || typeof storage.getItem !== 'function') {
        return null;
      }

      try {
        const raw = storage.getItem(storageKey);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return buildCompletionReceipt(parsed);
      } catch {
        return null;
      }
    }

    function saveReceipt(input) {
      const receipt = buildCompletionReceipt(input);
      if (!receipt) {
        throw new Error('A completion receipt requires a forge order UUID, short reference, and submitted timestamp.');
      }
      if (!storage || typeof storage.setItem !== 'function') {
        return deepCloneValue(receipt);
      }
      storage.setItem(storageKey, JSON.stringify(receipt));
      return deepCloneValue(receipt);
    }

    function clearReceipt() {
      if (!storage || typeof storage.removeItem !== 'function') {
        return;
      }
      storage.removeItem(storageKey);
    }

    return {
      clearReceipt,
      getReceipt,
      saveReceipt
    };
  }

  function resolveRestoredScreen(options = {}) {
    const currentScreen = asTrimmedString(options.currentScreen) || 'welcome';
    const hasUsableActiveOrder = Boolean(options.hasUsableActiveOrder);
    const hasCompletedReceipt = Boolean(options.hasCompletedReceipt);

    if (currentScreen === 'final-review') {
      if (hasUsableActiveOrder) {
        return currentScreen;
      }
      return hasCompletedReceipt ? 'thank-you' : 'welcome';
    }

    if (currentScreen === 'payment-handoff') {
      if (hasUsableActiveOrder) {
        return 'final-review';
      }
      return hasCompletedReceipt ? 'thank-you' : 'welcome';
    }

    if (currentScreen === 'thank-you') {
      return hasCompletedReceipt ? 'thank-you' : 'welcome';
    }

    return currentScreen;
  }

  function classifySubmissionOutcome(firstUploadResult, record) {
    if (firstUploadResult && firstUploadResult.ok) {
      return {
        state: 'stored_successfully',
        retryable: false
      };
    }

    const normalizedRecord = record && typeof record === 'object' ? record : null;
    if (normalizedRecord && normalizedRecord.server_upload_needs_staff_attention === true) {
      return {
        state: 'needs_staff_attention',
        retryable: false
      };
    }

    if (normalizedRecord && normalizedRecord.server_upload_status === 'failed') {
      return {
        state: 'saved_on_this_ipad_waiting_to_upload',
        retryable: true
      };
    }

    return {
      state: 'needs_staff_attention',
      retryable: false
    };
  }

  function buildShortOrderReference(forgeOrderUuid) {
    const value = asTrimmedString(forgeOrderUuid).replace(/[^a-z0-9]/gi, '');
    return value ? value.slice(0, 8).toUpperCase() : '';
  }

  function createSubmissionUuid() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    const timestamp = Date.now().toString(16).padStart(12, '0');
    const randomSegments = [8, 4, 4, 4, 12].map((length) => createRandomHex(length));
    randomSegments[2] = `4${randomSegments[2].slice(1)}`;
    randomSegments[3] = `${((Number.parseInt(randomSegments[3][0], 16) & 0x3) | 0x8).toString(16)}${randomSegments[3].slice(1)}`;
    randomSegments[4] = `${timestamp.slice(-12)}${randomSegments[4]}`.slice(0, 12);
    return randomSegments.join('-');
  }

  function normalizePaymentConfirmationInput(value) {
    if (!value || typeof value !== 'object') {
      return {
        externalPaymentMethod: null,
        paymentConfirmedAt: null
      };
    }

    const externalPaymentMethod = asTrimmedString(value.externalPaymentMethod);
    const paymentConfirmedAt = value.paymentConfirmedAt == null
      ? null
      : normalizeDateValue(value.paymentConfirmedAt).toISOString();

    return {
      externalPaymentMethod: externalPaymentMethod || null,
      paymentConfirmedAt
    };
  }

  function createRandomHex(length) {
    let output = '';
    while (output.length < length) {
      output += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
    }
    return output.slice(0, length);
  }

  function normalizeDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getTime());
    }
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('Forge order submission requires a valid date source.');
    }
    return parsedDate;
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

  return {
    COMPLETION_RECEIPT_STORAGE_KEY,
    SUBMISSION_CONTEXT_STORAGE_KEY,
    buildCompletionReceipt,
    classifySubmissionOutcome,
    createOrderSubmissionService,
    createCompletionReceiptManager,
    createSubmissionContextManager,
    resolveRestoredScreen
  };
}));
