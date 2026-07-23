const test = require('node:test');
const assert = require('node:assert/strict');

const orderingModule = require('../public/js/forge-staff-catalog-ordering.js');

test('shared ordering helper disables reordering for temporary sorts and active filters', () => {
  assert.deepEqual(orderingModule.getReorderAvailability('custom', { search: '', status: '' }), {
    enabled: true,
    reason: ''
  });
  assert.deepEqual(orderingModule.getReorderAvailability('az', { search: '', status: '' }), {
    enabled: false,
    reason: 'Select Custom Order to rearrange cards.'
  });
  assert.deepEqual(orderingModule.getReorderAvailability('custom', { search: 'texas', status: '' }), {
    enabled: false,
    reason: 'Clear search and filters to rearrange Custom Order.'
  });
});

test('shared ordering helper sorts null metadata last while preserving custom-order fallback', () => {
  const records = orderingModule.sortCatalogRecords([
    { id: '1', sort_order: 2000, name: 'Beta', category: null },
    { id: '2', sort_order: 1000, name: 'Alpha', category: 'Western' },
    { id: '3', sort_order: 3000, name: 'Gamma', category: null }
  ], {
    sortKey: 'category',
    compareLabel(left, right) {
      return orderingModule.compareNullableText(left.name, right.name);
    },
    comparators: {
      custom: orderingModule.compareCustomOrder,
      category(left, right) {
        return orderingModule.compareNullableText(left.category, right.category);
      }
    }
  });

  assert.deepEqual(records.map((record) => record.id), ['2', '1', '3']);
});

test('shared ordering controller saves one reordered pointer drop and announces the move', async () => {
  const listeners = new Map();
  const calls = [];
  const announcements = [];
  const cards = {
    a: createCard('a', 0, 100),
    b: createCard('b', 100, 100),
    c: createCard('c', 200, 100)
  };
  const documentRef = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    elementFromPoint(_x, y) {
      if (y >= 200) {
        return { closest() { return cards.c; } };
      }
      if (y >= 100) {
        return { closest() { return cards.b; } };
      }
      return { closest() { return cards.a; } };
    }
  };

  const controller = orderingModule.createCatalogReorderController({
    document: documentRef,
    window: { innerHeight: 900, scrollBy() {} },
    onAnnounce(message) {
      announcements.push(message);
    },
    async onCommit(orderedIds) {
      calls.push(orderedIds);
      return true;
    }
  });

  controller.sync(['a', 'b', 'c']);
  controller.beginPointer({ pointerId: 1, clientX: 20, clientY: 20 }, 'a', ['a', 'b', 'c']);
  await listeners.get('pointermove')({ pointerId: 1, clientX: 20, clientY: 260 });
  await listeners.get('pointerup')({ pointerId: 1, clientX: 20, clientY: 260 });

  assert.deepEqual(calls, [['b', 'c', 'a']]);
  assert.match(announcements.join(' | '), /Picked up/);
  assert.match(announcements.join(' | '), /Moved to position 3 of 3/);
  assert.match(announcements.join(' | '), /Order saved/);
});

test('shared ordering controller keyboard cancel restores the original sequence without saving', async () => {
  const announcements = [];
  let commitCount = 0;
  const controller = orderingModule.createCatalogReorderController({
    document: {
      addEventListener() {},
      removeEventListener() {},
      elementFromPoint() { return null; }
    },
    window: { innerHeight: 900, scrollBy() {} },
    onAnnounce(message) {
      announcements.push(message);
    },
    async onCommit() {
      commitCount += 1;
      return true;
    }
  });

  controller.sync(['a', 'b', 'c']);
  const event = createKeyboardEvent(' ');
  await controller.handleHandleKeydown(event, 'b', ['a', 'b', 'c']);
  await controller.handleHandleKeydown(createKeyboardEvent('ArrowUp'), 'b', ['a', 'b', 'c']);
  await controller.handleHandleKeydown(createKeyboardEvent('Escape'), 'b', ['a', 'b', 'c']);

  assert.equal(commitCount, 0);
  assert.match(announcements.join(' | '), /Reorder cancelled/);
});

function createCard(id, top, height) {
  return {
    dataset: {
      catalogOrderId: id
    },
    getBoundingClientRect() {
      return {
        top,
        height
      };
    }
  };
}

function createKeyboardEvent(key) {
  return {
    key,
    preventDefault() {},
    stopPropagation() {}
  };
}
