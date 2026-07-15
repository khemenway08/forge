(function (root, factory) {
  const payloadBuilder = typeof module === 'object' && module.exports
    ? require('./forge-order-payload-builder.js')
    : root.ForgeOrderPayloadBuilder;
  const api = factory(payloadBuilder);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeOrderPayloadPreview = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (payloadBuilder) {
  function isPayloadPreviewEnabled(searchInput) {
    try {
      const params = getSearchParams(searchInput);
      return params.get('forgeDebug') === 'payload';
    } catch {
      return false;
    }
  }

  function shouldCreatePayloadPreviewUi(payloadPreviewEnabled) {
    return Boolean(payloadPreviewEnabled);
  }

  function createPayloadPreviewContextStore(options = {}) {
    const getNow = typeof options.now === 'function' ? options.now : () => new Date();
    const getRandomUuid = typeof options.randomUUID === 'function' ? options.randomUUID : createPreviewUuid;
    const state = {
      forgeOrderUuid: '',
      builtAt: ''
    };

    return {
      getContext(overrides = {}) {
        if (!state.forgeOrderUuid || !state.builtAt) {
          const builtAtDate = normalizeDateValue(getNow());
          const preferredForgeOrderUuid = asTrimmedString(overrides.preferredForgeOrderUuid || options.preferredForgeOrderUuid);
          state.forgeOrderUuid = preferredForgeOrderUuid || getRandomUuid();
          state.builtAt = builtAtDate.toISOString();
        }

        return {
          forgeOrderUuid: state.forgeOrderUuid,
          forgeOrderNumber: null,
          builtAt: state.builtAt,
          source: 'customer_kiosk',
          orderStatus: 'draft',
          deviceId: null,
          event: null,
          submittedAt: null,
          ...getSafeContextOverrides(overrides)
        };
      }
    };
  }

  function buildCurrentOrderPayloadPreview(options = {}) {
    const buildForgeOrderPayload = typeof options.buildForgeOrderPayload === 'function'
      ? options.buildForgeOrderPayload
      : payloadBuilder && payloadBuilder.buildForgeOrderPayload;
    if (typeof buildForgeOrderPayload !== 'function') {
      throw new Error('Forge order payload builder is required for payload preview.');
    }
    if (!options.previewContextStore || typeof options.previewContextStore.getContext !== 'function') {
      throw new Error('Payload preview context store is required for payload preview.');
    }

    const orderState = snapshotCurrentOrderState({
      items: options.items || options.orderItems || options.cartItems,
      customerDraft: options.customerDraft,
      appState: options.appState
    });
    const context = options.previewContextStore.getContext({
      source: 'customer_kiosk',
      orderStatus: 'draft',
      deviceId: null,
      event: null,
      submittedAt: null,
      preferredForgeOrderUuid: options.preferredForgeOrderUuid,
      ...options.contextOverrides
    });
    const payload = buildForgeOrderPayload(orderState, context);

    return {
      orderState,
      context,
      payload,
      json: formatPayloadPreviewJson(payload)
    };
  }

  function snapshotCurrentOrderState(input = {}) {
    return deepCloneValue({
      items: Array.isArray(input.items) ? input.items : [],
      customerDraft: input.customerDraft && typeof input.customerDraft === 'object' ? input.customerDraft : {},
      appState: input.appState && typeof input.appState === 'object' ? input.appState : {}
    });
  }

  function formatPayloadPreviewJson(payload) {
    return JSON.stringify(payload, null, 2);
  }

  async function copyPayloadPreviewText(text, options = {}) {
    const clipboard = options.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      return {
        copied: false,
        message: 'Copy unavailable. Select the JSON and copy it manually.'
      };
    }

    try {
      await clipboard.writeText(String(text));
      return {
        copied: true,
        message: 'Copied.'
      };
    } catch (error) {
      return {
        copied: false,
        message: 'Copy failed. Select the JSON and copy it manually.',
        error
      };
    }
  }

  function getSearchParams(searchInput) {
    if (searchInput instanceof URLSearchParams) {
      return searchInput;
    }
    if (typeof searchInput === 'string') {
      return new URLSearchParams(searchInput.replace(/^\?/, ''));
    }
    if (searchInput && typeof searchInput === 'object' && typeof searchInput.search === 'string') {
      return new URLSearchParams(searchInput.search.replace(/^\?/, ''));
    }
    if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
      return new URLSearchParams(window.location.search.replace(/^\?/, ''));
    }
    return new URLSearchParams('');
  }

  function getSafeContextOverrides(overrides) {
    const safeOverrides = { ...overrides };
    delete safeOverrides.preferredForgeOrderUuid;
    return safeOverrides;
  }

  function createPreviewUuid() {
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
      throw new Error('Payload preview context requires a valid builtAt source date.');
    }
    return parsedDate;
  }

  function deepCloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => deepCloneValue(entry));
    }
    if (value && typeof value === 'object') {
      const clone = {};
      Object.keys(value).forEach((key) => {
        clone[key] = deepCloneValue(value[key]);
      });
      return clone;
    }
    return value;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  return {
    buildCurrentOrderPayloadPreview,
    copyPayloadPreviewText,
    createPayloadPreviewContextStore,
    formatPayloadPreviewJson,
    isPayloadPreviewEnabled,
    shouldCreatePayloadPreviewUi,
    snapshotCurrentOrderState
  };
}));
