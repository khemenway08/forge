(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeEventState = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ACTIVE_EVENT_STORAGE_KEY = 'forge-active-event-cache';
  const LAST_SERVER_STATUS_STORAGE_KEY = 'forge-last-ordering-status';
  const DEFAULT_SCOPE_KEY = '__active_event__';

  function createEventStateController(options = {}) {
    const apiClient = options.apiClient || null;
    const storage = options.storage || null;

    function getCachedActiveEvent(scopeOptions = {}) {
      return normalizeEventSnapshot(readStorageJson(storage, getScopedStorageKey(ACTIVE_EVENT_STORAGE_KEY, scopeOptions.eventToken)));
    }

    function clearCachedActiveEvent(scopeOptions = {}) {
      removeStorageKey(storage, getScopedStorageKey(ACTIVE_EVENT_STORAGE_KEY, scopeOptions.eventToken));
    }

    function getLastServerStatus(scopeOptions = {}) {
      const parsed = readStorageJson(storage, getScopedStorageKey(LAST_SERVER_STATUS_STORAGE_KEY, scopeOptions.eventToken));
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      return {
        ordering_open: parsed.ordering_open === true,
        event_id: asTrimmedString(parsed.event_id) || null,
        availability: asTrimmedString(parsed.availability) || null,
        requested_public_order_token: asTrimmedString(parsed.requested_public_order_token) || null
      };
    }

    function setLastServerStatus(orderingOpen, event, scopeOptions = {}, availability = '') {
      writeStorageJson(storage, getScopedStorageKey(LAST_SERVER_STATUS_STORAGE_KEY, scopeOptions.eventToken), {
        ordering_open: orderingOpen === true,
        event_id: event && event.event_id ? event.event_id : null,
        availability: asTrimmedString(availability) || null,
        requested_public_order_token: getNormalizedScopeToken(scopeOptions.eventToken)
      });
    }

    async function refreshOrderingState(scopeOptions = {}) {
      if (!apiClient || typeof apiClient.getOrderingState !== 'function') {
        throw new Error('Forge event state requires getOrderingState().');
      }

      const result = await apiClient.getOrderingState({
        eventToken: scopeOptions.eventToken || null
      });
      const activeEvent = normalizeEventSnapshot(result && result.event);

      if (result && result.orderingOpen === true && activeEvent) {
        writeStorageJson(storage, getScopedStorageKey(ACTIVE_EVENT_STORAGE_KEY, scopeOptions.eventToken), activeEvent);
        setLastServerStatus(true, activeEvent, scopeOptions, result.availability);
        return {
          ok: true,
          orderingOpen: true,
          activeEvent,
          source: 'server',
          unavailable: false,
          availability: result.availability || 'active',
          requestedPublicOrderToken: result.requestedPublicOrderToken || getNormalizedScopeToken(scopeOptions.eventToken),
          resolutionScope: result.resolutionScope || (getNormalizedScopeToken(scopeOptions.eventToken) ? 'event_token' : 'active_event')
        };
      }

      clearCachedActiveEvent(scopeOptions);
      setLastServerStatus(false, null, scopeOptions, result && result.availability ? result.availability : '');
      return {
        ok: true,
        orderingOpen: false,
        activeEvent: null,
        source: 'server',
        unavailable: false,
        availability: result && result.availability ? result.availability : 'no_active_event',
        requestedPublicOrderToken: result && result.requestedPublicOrderToken ? result.requestedPublicOrderToken : getNormalizedScopeToken(scopeOptions.eventToken),
        resolutionScope: result && result.resolutionScope ? result.resolutionScope : (getNormalizedScopeToken(scopeOptions.eventToken) ? 'event_token' : 'active_event')
      };
    }

    async function resolveOrderingGate(scopeOptions = {}) {
      try {
        return await refreshOrderingState(scopeOptions);
      } catch (error) {
        const cachedActiveEvent = getCachedActiveEvent(scopeOptions);
        const lastServerStatus = getLastServerStatus(scopeOptions);
        const normalizedScopeToken = getNormalizedScopeToken(scopeOptions.eventToken);
        const cachedToken = cachedActiveEvent && asTrimmedString(cachedActiveEvent.public_order_token);
        if (
          cachedActiveEvent
          && (!normalizedScopeToken || cachedToken === normalizedScopeToken)
          && (!lastServerStatus || lastServerStatus.ordering_open === true)
        ) {
          return {
            ok: true,
            orderingOpen: true,
            activeEvent: cachedActiveEvent,
            source: 'cache',
            unavailable: true,
            availability: 'active',
            requestedPublicOrderToken: normalizedScopeToken,
            resolutionScope: normalizedScopeToken ? 'event_token' : 'active_event'
          };
        }

        return {
          ok: false,
          orderingOpen: false,
          activeEvent: null,
          source: 'offline',
          unavailable: true,
          availability: lastServerStatus && lastServerStatus.availability ? lastServerStatus.availability : (normalizedScopeToken ? 'invalid_token' : 'no_active_event'),
          requestedPublicOrderToken: normalizedScopeToken,
          resolutionScope: normalizedScopeToken ? 'event_token' : 'active_event',
          error
        };
      }
    }

    return {
      clearCachedActiveEvent,
      getCachedActiveEvent,
      getLastServerStatus,
      refreshOrderingState,
      resolveOrderingGate
    };
  }

  function normalizeEventSnapshot(event) {
    if (!event || typeof event !== 'object') {
      return null;
    }

    const eventId = asTrimmedString(event.event_id || event.eventId);
    const eventName = asTrimmedString(event.event_name || event.eventName);
    if (!eventId || !eventName) {
      return null;
    }

    return {
      event_id: eventId,
      event_name: eventName,
      public_order_token: asTrimmedString(event.public_order_token || event.publicOrderToken) || null,
      event_type: asTrimmedString(event.event_type || event.eventType) || 'live_event',
      event_start_date: asTrimmedString(event.event_start_date || event.start_date || event.startDate),
      event_end_date: asTrimmedString(event.event_end_date || event.end_date || event.endDate),
      event_location: asTrimmedString(event.event_location || event.location) || null,
      event_status: asTrimmedString(event.event_status || event.status) || 'active'
    };
  }

  function readStorageJson(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') {
      return null;
    }
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorageJson(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') {
      return;
    }
    storage.setItem(key, JSON.stringify(value));
  }

  function removeStorageKey(storage, key) {
    if (!storage || typeof storage.removeItem !== 'function') {
      return;
    }
    storage.removeItem(key);
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function getScopedStorageKey(baseKey, eventToken) {
    return `${baseKey}:${getScopeKey(eventToken)}`;
  }

  function getScopeKey(eventToken) {
    return getNormalizedScopeToken(eventToken) || DEFAULT_SCOPE_KEY;
  }

  function getNormalizedScopeToken(eventToken) {
    const normalized = asTrimmedString(eventToken);
    return normalized || null;
  }

  return {
    ACTIVE_EVENT_STORAGE_KEY,
    DEFAULT_SCOPE_KEY,
    LAST_SERVER_STATUS_STORAGE_KEY,
    createEventStateController,
    getScopedStorageKey,
    normalizeEventSnapshot
  };
}));
