const test = require('node:test');
const assert = require('node:assert/strict');

const eventStateModule = require('../public/js/forge-event-state.js');

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test('active event permits ordering and caches the confirmed snapshot', async () => {
  const storage = createStorage();
  const cacheKey = eventStateModule.getScopedStorageKey(eventStateModule.ACTIVE_EVENT_STORAGE_KEY, null);
  const controller = eventStateModule.createEventStateController({
    storage,
    apiClient: {
      async getOrderingState() {
        return {
          ok: true,
          orderingOpen: true,
          event: {
            event_id: 'event-1',
            public_order_token: 'token-1',
            event_name: 'Holiday Market',
            event_type: 'live_event',
            start_date: '2026-11-10',
            end_date: '2026-11-12',
            event_location: 'Denver'
          }
        };
      }
    }
  });

  const result = await controller.resolveOrderingGate();

  assert.equal(result.orderingOpen, true);
  assert.equal(result.activeEvent.event_name, 'Holiday Market');
  assert.match(String(storage.getItem(cacheKey)), /Holiday Market/);
});

test('no active event closes ordering and clears stale cached event data', async () => {
  const storage = createStorage();
  const cacheKey = eventStateModule.getScopedStorageKey(eventStateModule.ACTIVE_EVENT_STORAGE_KEY, null);
  storage.setItem(cacheKey, JSON.stringify({
    event_id: 'stale',
    event_name: 'Stale Event'
  }));
  const controller = eventStateModule.createEventStateController({
    storage,
    apiClient: {
      async getOrderingState() {
        return {
          ok: true,
          orderingOpen: false,
          event: null
        };
      }
    }
  });

  const result = await controller.resolveOrderingGate();

  assert.equal(result.orderingOpen, false);
  assert.equal(result.activeEvent, null);
  assert.equal(storage.getItem(cacheKey), null);
});

test('cached active event supports temporary offline ordering after a confirmed open state', async () => {
  const storage = createStorage();
  const token = 'abc123token';
  const cacheKey = eventStateModule.getScopedStorageKey(eventStateModule.ACTIVE_EVENT_STORAGE_KEY, token);
  const controller = eventStateModule.createEventStateController({
    storage,
    apiClient: {
      async getOrderingState() {
        throw new Error('network offline');
      }
    }
  });

  storage.setItem(cacheKey, JSON.stringify({
    event_id: 'event-2',
    public_order_token: token,
    event_name: 'Fallback Test Session',
    event_type: 'test_session',
    event_start_date: '2026-07-27',
    event_end_date: '2026-07-27',
    event_location: 'Localhost',
    event_status: 'active'
  }));

  const result = await controller.resolveOrderingGate({ eventToken: token });

  assert.equal(result.orderingOpen, true);
  assert.equal(result.source, 'cache');
  assert.equal(result.activeEvent.event_type, 'test_session');
});

test('server-confirmed closed state overrides a stale cached event during later offline periods', async () => {
  const storage = createStorage();
  const token = 'endedtoken123';
  const lastStatusKey = eventStateModule.getScopedStorageKey(eventStateModule.LAST_SERVER_STATUS_STORAGE_KEY, token);
  const cacheKey = eventStateModule.getScopedStorageKey(eventStateModule.ACTIVE_EVENT_STORAGE_KEY, token);
  const controller = eventStateModule.createEventStateController({
    storage,
    apiClient: {
      async getOrderingState() {
        throw new Error('network offline');
      }
    }
  });

  storage.setItem(lastStatusKey, JSON.stringify({
    ordering_open: false,
    event_id: null,
    availability: 'ended'
  }));
  storage.setItem(cacheKey, JSON.stringify({
    event_id: 'stale-event',
    public_order_token: token,
    event_name: 'Stale Event',
    event_type: 'live_event'
  }));

  const result = await controller.resolveOrderingGate({ eventToken: token });

  assert.equal(result.orderingOpen, false);
  assert.equal(result.activeEvent, null);
  assert.equal(result.source, 'offline');
});

test('a cached token-scoped event is never reused for a different token', async () => {
  const storage = createStorage();
  const tokenA = 'token-a';
  const tokenB = 'token-b';
  storage.setItem(eventStateModule.getScopedStorageKey(eventStateModule.ACTIVE_EVENT_STORAGE_KEY, tokenA), JSON.stringify({
    event_id: 'event-a',
    public_order_token: tokenA,
    event_name: 'Event A',
    event_type: 'live_event'
  }));

  const controller = eventStateModule.createEventStateController({
    storage,
    apiClient: {
      async getOrderingState() {
        throw new Error('network offline');
      }
    }
  });

  const result = await controller.resolveOrderingGate({ eventToken: tokenB });
  assert.equal(result.orderingOpen, false);
  assert.equal(result.activeEvent, null);
});
