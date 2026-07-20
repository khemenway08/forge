(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffOrdersRuntime = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STAFF_DATA_SOURCES = {
    local: 'local',
    server: 'server'
  };

  function createStaffOrdersRuntime(options = {}) {
    const environment = resolveStaffRuntimeEnvironment(options.locationLike || {});
    const staffApiClient = options.staffApiClient || null;
    const localOrderStore = options.localOrderStore || null;

    async function checkAccess() {
      if (environment.dataSource === STAFF_DATA_SOURCES.local) {
        return {
          ok: true,
          authenticated: true,
          requiresAuthentication: false,
          nextScreen: 'staff-orders',
          dataSource: STAFF_DATA_SOURCES.local,
          readOnly: false
        };
      }

      assertStaffApiClient(staffApiClient, 'checkSession');
      const result = await staffApiClient.checkSession();
      if (!result || (!result.ok && result.unauthenticated) || result.authenticated === false) {
        return {
          ok: true,
          authenticated: false,
          requiresAuthentication: true,
          nextScreen: 'staff-access',
          dataSource: STAFF_DATA_SOURCES.server,
          readOnly: true
        };
      }

      return {
        ok: true,
        authenticated: true,
        requiresAuthentication: true,
        nextScreen: 'staff-orders',
        dataSource: STAFF_DATA_SOURCES.server,
        readOnly: true
      };
    }

    async function login(pin) {
      if (environment.dataSource === STAFF_DATA_SOURCES.local) {
        return {
          ok: true,
          authenticated: true,
          requiresAuthentication: false,
          nextScreen: 'staff-orders',
          dataSource: STAFF_DATA_SOURCES.local,
          readOnly: false
        };
      }

      assertStaffApiClient(staffApiClient, 'login');
      const result = await staffApiClient.login(pin);
      if (!result || (!result.ok && result.unauthenticated) || result.authenticated === false) {
        return {
          ok: false,
          authenticated: false,
          requiresAuthentication: true,
          nextScreen: 'staff-access',
          dataSource: STAFF_DATA_SOURCES.server,
          readOnly: true,
          errorMessage: 'Incorrect PIN.'
        };
      }

      return {
        ok: true,
        authenticated: true,
        requiresAuthentication: true,
        nextScreen: 'staff-orders',
        dataSource: STAFF_DATA_SOURCES.server,
        readOnly: true
      };
    }

    async function logout() {
      if (environment.dataSource === STAFF_DATA_SOURCES.local) {
        return {
          ok: true,
          authenticated: false,
          nextScreen: 'welcome',
          dataSource: STAFF_DATA_SOURCES.local,
          readOnly: false
        };
      }

      assertStaffApiClient(staffApiClient, 'logout');
      await staffApiClient.logout();
      return {
        ok: true,
        authenticated: false,
        nextScreen: 'staff-access',
        dataSource: STAFF_DATA_SOURCES.server,
        readOnly: true
      };
    }

    async function loadOrders() {
      if (environment.dataSource === STAFF_DATA_SOURCES.local) {
        assertLocalOrderStore(localOrderStore);
        const records = await localOrderStore.listOrders();
        return {
          ok: true,
          authenticated: true,
          dataSource: STAFF_DATA_SOURCES.local,
          readOnly: false,
          records: Array.isArray(records) ? records : []
        };
      }

      assertStaffApiClient(staffApiClient, 'listOrders');
      const result = await staffApiClient.listOrders();
      if (!result || (!result.ok && result.unauthenticated) || result.authenticated === false) {
        return {
          ok: false,
          authenticated: false,
          unauthenticated: true,
          dataSource: STAFF_DATA_SOURCES.server,
          readOnly: true,
          records: []
        };
      }

      return {
        ok: true,
        authenticated: true,
        dataSource: STAFF_DATA_SOURCES.server,
        readOnly: true,
        records: adaptServerOrdersForQueue(result.orders)
      };
    }

    return {
      environment,
      checkAccess,
      login,
      logout,
      loadOrders
    };
  }

  function resolveStaffRuntimeEnvironment(locationLike = {}) {
    const protocol = asTrimmedString(locationLike.protocol).toLowerCase();
    const hostname = asTrimmedString(locationLike.hostname).toLowerCase();
    const isLoopbackHost = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.local');
    const usesHostedServer = protocol === 'https:' && !isLoopbackHost;

    return {
      protocol,
      hostname,
      usesHostedServer,
      requiresAuthentication: usesHostedServer,
      dataSource: usesHostedServer ? STAFF_DATA_SOURCES.server : STAFF_DATA_SOURCES.local
    };
  }

  function adaptServerOrdersForQueue(records) {
    const source = Array.isArray(records) ? records : [];
    const seen = new Set();

    return source.reduce((normalized, record) => {
      const orderUuid = asTrimmedString(record && record.forge_order_uuid);
      if (!orderUuid || seen.has(orderUuid)) {
        return normalized;
      }
      seen.add(orderUuid);
      normalized.push(adaptServerOrderForQueue(record));
      return normalized;
    }, []).sort(compareAdaptedOrdersNewestFirst);
  }

  function adaptServerOrderForQueue(record) {
    const payload = deepCloneValue(record && typeof record.payload === 'object' ? record.payload : {});
    return {
      forge_order_uuid: asTrimmedString(record && record.forge_order_uuid),
      record_version: asTrimmedString(record && record.record_version) || '1',
      source: asTrimmedString(record && record.source) || 'server',
      submitted_at: asTrimmedString(record && record.submitted_at),
      updated_at: asTrimmedString(record && record.updated_at) || asTrimmedString(record && record.received_at),
      received_at: asTrimmedString(record && record.received_at),
      local_saved_at: asTrimmedString(record && record.received_at) || asTrimmedString(record && record.submitted_at),
      sync_status: 'synced',
      sync_attempt_count: 0,
      server_upload_status: 'stored',
      server_received_at: asTrimmedString(record && record.received_at) || null,
      server_payload_sha256: asTrimmedString(record && record.payload_sha256) || null,
      server_created: false,
      production_status: 'submitted',
      current_tray_number: null,
      packed_at: null,
      ready_to_pack_at: null,
      total_item_count: null,
      completed_item_count: null,
      payload,
      staff_data_source: STAFF_DATA_SOURCES.server,
      staff_read_only: true
    };
  }

  function compareAdaptedOrdersNewestFirst(left, right) {
    const leftStamp = Date.parse(asTrimmedString(left && (left.received_at || left.local_saved_at || left.submitted_at)));
    const rightStamp = Date.parse(asTrimmedString(right && (right.received_at || right.local_saved_at || right.submitted_at)));

    if (Number.isFinite(leftStamp) || Number.isFinite(rightStamp)) {
      const safeLeft = Number.isFinite(leftStamp) ? leftStamp : 0;
      const safeRight = Number.isFinite(rightStamp) ? rightStamp : 0;
      if (safeLeft !== safeRight) {
        return safeRight - safeLeft;
      }
    }

    return asTrimmedString(right && right.forge_order_uuid).localeCompare(asTrimmedString(left && left.forge_order_uuid));
  }

  function deepCloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => deepCloneValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce((clone, key) => {
        clone[key] = deepCloneValue(value[key]);
        return clone;
      }, {});
    }
    return value;
  }

  function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function assertStaffApiClient(staffApiClient, methodName) {
    if (!staffApiClient || typeof staffApiClient[methodName] !== 'function') {
      throw new Error(`A Forge staff API client with ${methodName}() is required for hosted staff access.`);
    }
  }

  function assertLocalOrderStore(localOrderStore) {
    if (!localOrderStore || typeof localOrderStore.listOrders !== 'function') {
      throw new Error('A local Forge order store is required for development staff access.');
    }
  }

  return {
    STAFF_DATA_SOURCES,
    createStaffOrdersRuntime,
    resolveStaffRuntimeEnvironment,
    adaptServerOrderForQueue,
    adaptServerOrdersForQueue
  };
}));
