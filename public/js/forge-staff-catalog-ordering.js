(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffCatalogOrdering = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_SORT_KEY = 'custom';

  function createCatalogReorderController(options = {}) {
    const documentRef = options.document || document;
    const windowLike = options.window || window;
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {};
    const onAnnounce = typeof options.onAnnounce === 'function' ? options.onAnnounce : () => {};
    const onCommit = typeof options.onCommit === 'function' ? options.onCommit : async () => {};
    const getLabel = typeof options.getLabel === 'function' ? options.getLabel : (itemId) => String(itemId || '');
    const cardSelector = options.cardSelector || '[data-catalog-order-id]';

    const state = {
      mode: '',
      activeId: '',
      originalIds: [],
      previewIds: [],
      pointerId: null,
      changed: false,
      saving: false,
      suppressActivationUntil: 0
    };

    let teardownDocumentHandlers = null;

    function sync(ids) {
      if (isActive() || state.saving) {
        return;
      }
      state.originalIds = normalizeIdList(ids);
      state.previewIds = normalizeIdList(ids);
    }

    function getOrderedIds(ids) {
      const fallbackIds = normalizeIdList(ids);
      if (!isActive()) {
        return fallbackIds;
      }
      return state.previewIds.length > 0 ? state.previewIds.slice() : fallbackIds;
    }

    function isActive() {
      return state.mode === 'pointer' || state.mode === 'keyboard';
    }

    function isSaving() {
      return state.saving;
    }

    function isDraggingId(itemId) {
      return isActive() && state.activeId === String(itemId || '').trim();
    }

    function shouldSuppressActivation() {
      return Date.now() < state.suppressActivationUntil;
    }

    function beginPointer(event, itemId, orderedIds) {
      const normalizedId = String(itemId || '').trim();
      if (!normalizedId || state.saving) {
        return false;
      }

      startSession('pointer', normalizedId, orderedIds);
      state.pointerId = Number.isInteger(event?.pointerId) ? event.pointerId : null;
      state.suppressActivationUntil = Date.now() + 500;
      onStateChange();

      const handlePointerMove = (moveEvent) => {
        if (state.pointerId !== null && moveEvent.pointerId !== state.pointerId) {
          return;
        }

        autoScroll(moveEvent.clientY);
        const targetCard = documentRef.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest(cardSelector);
        if (!targetCard) {
          return;
        }

        const targetId = String(targetCard.dataset.catalogOrderId || '').trim();
        if (!targetId) {
          return;
        }

        const rect = targetCard.getBoundingClientRect();
        const placeAfter = moveEvent.clientY > rect.top + (rect.height / 2);
        moveToTarget(targetId, placeAfter);
      };

      const handlePointerUp = async (upEvent) => {
        if (state.pointerId !== null && upEvent.pointerId !== state.pointerId) {
          return;
        }
        await commit();
      };

      const handlePointerCancel = () => {
        cancel();
      };

      documentRef.addEventListener('pointermove', handlePointerMove);
      documentRef.addEventListener('pointerup', handlePointerUp);
      documentRef.addEventListener('pointercancel', handlePointerCancel);
      teardownDocumentHandlers = () => {
        documentRef.removeEventListener('pointermove', handlePointerMove);
        documentRef.removeEventListener('pointerup', handlePointerUp);
        documentRef.removeEventListener('pointercancel', handlePointerCancel);
        teardownDocumentHandlers = null;
      };

      onAnnounce(`Picked up ${getLabel(normalizedId)}`);
      return true;
    }

    function toggleKeyboard(event, itemId, orderedIds) {
      const normalizedId = String(itemId || '').trim();
      if (!normalizedId || state.saving) {
        return false;
      }

      event?.preventDefault?.();
      event?.stopPropagation?.();

      if (state.mode === 'keyboard' && state.activeId === normalizedId) {
        commit();
        return true;
      }

      startSession('keyboard', normalizedId, orderedIds);
      state.suppressActivationUntil = Date.now() + 500;
      onStateChange();
      onAnnounce(`Picked up ${getLabel(normalizedId)}`);
      return true;
    }

    async function handleHandleKeydown(event, itemId, orderedIds) {
      const key = String(event?.key || '');
      if (key === ' ' || key === 'Enter') {
        toggleKeyboard(event, itemId, orderedIds);
        return true;
      }

      if (!isActive() || state.mode !== 'keyboard' || state.activeId !== String(itemId || '').trim()) {
        return false;
      }

      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return true;
      }

      if (key === 'ArrowUp' || key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        moveActiveBy(-1);
        return true;
      }

      if (key === 'ArrowDown' || key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        moveActiveBy(1);
        return true;
      }

      return false;
    }

    function cancel() {
      if (!isActive()) {
        return;
      }

      teardown();
      state.previewIds = state.originalIds.slice();
      state.mode = '';
      state.activeId = '';
      state.pointerId = null;
      state.changed = false;
      state.suppressActivationUntil = Date.now() + 250;
      onStateChange();
      onAnnounce('Reorder cancelled');
    }

    async function commit() {
      if (!isActive()) {
        return false;
      }

      teardown();
      state.pointerId = null;

      if (!state.changed) {
        state.mode = '';
        state.activeId = '';
        state.suppressActivationUntil = Date.now() + 250;
        onStateChange();
        onAnnounce('Order unchanged');
        return true;
      }

      state.saving = true;
      onStateChange();
      try {
        const commitResult = await onCommit(state.previewIds.slice());
        if (commitResult === false) {
          state.previewIds = state.originalIds.slice();
          onAnnounce('Reorder cancelled');
        } else {
          state.originalIds = state.previewIds.slice();
          onAnnounce('Order saved');
        }
      } finally {
        state.saving = false;
        state.mode = '';
        state.activeId = '';
        state.changed = false;
        state.suppressActivationUntil = Date.now() + 250;
        onStateChange();
      }

      return true;
    }

    function startSession(mode, itemId, orderedIds) {
      teardown();
      state.mode = mode;
      state.activeId = itemId;
      state.originalIds = normalizeIdList(orderedIds);
      state.previewIds = normalizeIdList(orderedIds);
      state.changed = false;
    }

    function moveToTarget(targetId, placeAfter) {
      if (!isActive()) {
        return;
      }

      const activeIndex = state.previewIds.indexOf(state.activeId);
      const targetIndex = state.previewIds.indexOf(targetId);
      if (activeIndex === -1 || targetIndex === -1) {
        return;
      }

      let nextIndex = targetIndex + (placeAfter ? 1 : 0);
      if (activeIndex < nextIndex) {
        nextIndex -= 1;
      }
      reorderPreview(nextIndex);
    }

    function moveActiveBy(delta) {
      const activeIndex = state.previewIds.indexOf(state.activeId);
      if (activeIndex === -1) {
        return;
      }
      reorderPreview(activeIndex + delta);
    }

    function reorderPreview(nextIndex) {
      const activeIndex = state.previewIds.indexOf(state.activeId);
      if (activeIndex === -1) {
        return;
      }

      const boundedIndex = Math.max(0, Math.min(state.previewIds.length - 1, nextIndex));
      if (boundedIndex === activeIndex) {
        return;
      }

      const nextIds = state.previewIds.slice();
      const [activeId] = nextIds.splice(activeIndex, 1);
      nextIds.splice(boundedIndex, 0, activeId);
      state.previewIds = nextIds;
      state.changed = !listsEqual(state.previewIds, state.originalIds);
      onStateChange();
      onAnnounce(`Moved to position ${boundedIndex + 1} of ${state.previewIds.length}`);
    }

    function teardown() {
      if (typeof teardownDocumentHandlers === 'function') {
        teardownDocumentHandlers();
      }
    }

    function autoScroll(clientY) {
      if (typeof clientY !== 'number' || typeof windowLike.scrollBy !== 'function') {
        return;
      }

      const viewportHeight = Number(windowLike.innerHeight || 0);
      if (viewportHeight <= 0) {
        return;
      }

      const edgeSize = 72;
      if (clientY < edgeSize) {
        windowLike.scrollBy(0, -18);
        return;
      }
      if (clientY > viewportHeight - edgeSize) {
        windowLike.scrollBy(0, 18);
      }
    }

    return {
      sync,
      getOrderedIds,
      isActive,
      isSaving,
      isDraggingId,
      shouldSuppressActivation,
      beginPointer,
      handleHandleKeydown,
      cancel
    };
  }

  function sortCatalogRecords(records, options = {}) {
    const normalizedRecords = Array.isArray(records) ? records.slice() : [];
    const sortKey = String(options.sortKey || DEFAULT_SORT_KEY).trim() || DEFAULT_SORT_KEY;
    const comparators = options.comparators && typeof options.comparators === 'object'
      ? options.comparators
      : {};
    const compareLabel = typeof options.compareLabel === 'function'
      ? options.compareLabel
      : defaultCompareLabel;

    const comparator = comparators[sortKey] || comparators.custom || compareLabel;
    return normalizedRecords
      .map((record, index) => ({ record, index }))
      .sort((left, right) => {
        const primary = comparator(left.record, right.record);
        if (primary !== 0) {
          return primary;
        }

        const fallbackCustom = compareCustomOrder(left.record, right.record);
        if (fallbackCustom !== 0) {
          return fallbackCustom;
        }

        const fallbackLabel = compareLabel(left.record, right.record);
        if (fallbackLabel !== 0) {
          return fallbackLabel;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.record);
  }

  function compareCustomOrder(left, right) {
    const leftSortOrder = asPositiveInteger(left?.sort_order);
    const rightSortOrder = asPositiveInteger(right?.sort_order);
    if (leftSortOrder !== rightSortOrder) {
      if (leftSortOrder === 0) {
        return 1;
      }
      if (rightSortOrder === 0) {
        return -1;
      }
      return leftSortOrder - rightSortOrder;
    }
    return 0;
  }

  function compareNullableText(leftValue, rightValue) {
    const leftNormalized = normalizeNullableText(leftValue);
    const rightNormalized = normalizeNullableText(rightValue);
    if (leftNormalized === '' && rightNormalized !== '') {
      return 1;
    }
    if (leftNormalized !== '' && rightNormalized === '') {
      return -1;
    }
    return leftNormalized.localeCompare(rightNormalized, undefined, { sensitivity: 'base' });
  }

  function compareDatesDescending(leftValue, rightValue) {
    const leftTime = Date.parse(String(leftValue || '')) || 0;
    const rightTime = Date.parse(String(rightValue || '')) || 0;
    return rightTime - leftTime;
  }

  function getReorderAvailability(sortKey, filters = {}) {
    if (String(sortKey || DEFAULT_SORT_KEY) !== DEFAULT_SORT_KEY) {
      return {
        enabled: false,
        reason: 'Select Custom Order to rearrange cards.'
      };
    }

    const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
      if (key === 'sort') {
        return false;
      }
      return String(value || '').trim() !== '';
    });

    if (hasActiveFilters) {
      return {
        enabled: false,
        reason: 'Clear search and filters to rearrange Custom Order.'
      };
    }

    return {
      enabled: true,
      reason: ''
    };
  }

  function normalizeIdList(ids) {
    return Array.isArray(ids)
      ? ids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
  }

  function listsEqual(left, right) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
  }

  function defaultCompareLabel(left, right) {
    return compareNullableText(left?.label || left?.name || left?.title || left?.design_name || left?.hat_name || left?.material_name || left?.finished_hat_name, right?.label || right?.name || right?.title || right?.design_name || right?.hat_name || right?.material_name || right?.finished_hat_name);
  }

  function normalizeNullableText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function asPositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const normalized = Number.parseInt(value.trim(), 10);
      return normalized > 0 ? normalized : 0;
    }
    return 0;
  }

  return {
    DEFAULT_SORT_KEY,
    createCatalogReorderController,
    sortCatalogRecords,
    compareCustomOrder,
    compareNullableText,
    compareDatesDescending,
    getReorderAvailability
  };
}));
