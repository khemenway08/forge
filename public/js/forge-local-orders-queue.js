(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeLocalOrdersQueue = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FILTER_KEYS = ['product', 'size', 'treeColor', 'bowColor', 'year', 'fulfillment', 'openFlags', 'syncStatus'];
  const ITEM_FILTER_KEYS = ['product', 'size', 'treeColor', 'bowColor', 'year'];
  const ORDER_FILTER_KEYS = ['fulfillment', 'openFlags', 'syncStatus'];

  function isLocalOrdersQueueEnabled(searchInput) {
    try {
      return getSearchParams(searchInput).get('forgeDebug') === 'orders';
    } catch {
      return false;
    }
  }

  function shouldCreateStaffOrdersUi(localOrdersQueueEnabled) {
    return Boolean(localOrdersQueueEnabled);
  }

  function createEmptyOrderFilters() {
    return {
      product: 'all',
      size: 'all',
      treeColor: 'all',
      bowColor: 'all',
      year: 'all',
      fulfillment: 'all',
      openFlags: 'all',
      syncStatus: 'all'
    };
  }

  function getShortOrderReference(record) {
    const orderUuid = asTrimmedString(record && (record.forge_order_uuid || record.payload?.forge_order_uuid)).replace(/[^a-z0-9]/gi, '');
    return orderUuid ? orderUuid.slice(0, 8).toUpperCase() : '';
  }

  function sortLocalOrdersNewestFirst(records) {
    const normalizedRecords = Array.isArray(records) ? [...records] : [];
    return normalizedRecords.sort(compareOrdersNewestFirst);
  }

  function createOrderSearchDocument(record) {
    const searchParts = [];
    const payload = getPayload(record);
    const customer = payload.customer || {};

    searchParts.push(record?.forge_order_uuid);
    searchParts.push(payload.forge_order_uuid);
    searchParts.push(getShortOrderReference(record));
    searchParts.push(customer.full_name);
    searchParts.push(customer.email);
    searchParts.push(customer.phone);

    getRecordItems(record).forEach((item) => {
      searchParts.push(item.product_display_name);
      searchParts.push(item.structured_attributes?.family_name);
    });

    return normalizeSearchValue(searchParts.join(' '));
  }

  function getAvailableOrderFilters(records, options = {}) {
    const normalizedFilters = normalizeFilters(options.activeFilters);
    const searchTerm = normalizeSearchValue(options.searchTerm || '');
    const sortedRecords = sortLocalOrdersNewestFirst(records);

    return {
      product: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'product'),
      size: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'size'),
      treeColor: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'treeColor'),
      bowColor: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'bowColor'),
      year: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'year'),
      fulfillment: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'fulfillment'),
      openFlags: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'openFlags'),
      syncStatus: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'syncStatus')
    };
  }

  function filterLocalOrders(records, filters = {}, searchTerm = '') {
    const normalizedFilters = normalizeFilters(filters);
    const normalizedSearchTerm = normalizeSearchValue(searchTerm);

    return sortLocalOrdersNewestFirst(records).filter((record) => recordMatches(record, normalizedFilters, normalizedSearchTerm));
  }

  function summarizeLocalOrders(records, filters = {}) {
    const normalizedFilters = normalizeFilters(filters);
    const filteredRecords = sortLocalOrdersNewestFirst(records);
    let totalItems = 0;
    let ordersWithOpenFlags = 0;
    let pendingFutureSync = 0;

    filteredRecords.forEach((record) => {
      const matchingItems = getMatchingOrderItems(record, normalizedFilters);
      const matchingItemCount = matchingItems.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0);
      totalItems += matchingItemCount;

      if (recordHasPendingSync(record)) {
        pendingFutureSync += 1;
      }

      if (recordHasMatchingOpenFlags(record, matchingItems, normalizedFilters)) {
        ordersWithOpenFlags += 1;
      }
    });

    return {
      totalOrders: filteredRecords.length,
      pendingFutureSync,
      ordersWithOpenFlags,
      totalItems
    };
  }

  function buildProductionBatchGroups(records, filters = {}) {
    const normalizedFilters = normalizeFilters(filters);
    const groups = new Map();
    let customIconRequiredCount = 0;

    sortLocalOrdersNewestFirst(records).forEach((record) => {
      getMatchingOrderItems(record, normalizedFilters).forEach((item) => {
        const quantity = normalizeQuantity(item.quantity);
        const attributes = item.structured_attributes || {};
        const productDefinitionId = asTrimmedString(attributes.product_definition_id || item.product_definition_id || item.productDefinitionId);
        const productDisplayName = asTrimmedString(item.product_display_name || item.productDisplayName || productDefinitionId || 'Custom Item');
        const size = asNullableTrimmedString(attributes.size);
        const treeColor = asNullableTrimmedString(attributes.tree_color);
        const bowColor = asNullableTrimmedString(attributes.bow_color);
        const key = [productDefinitionId, size || '', treeColor || '', bowColor || ''].join('::');

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            productDefinitionId,
            productDisplayName,
            size,
            treeColor,
            bowColor,
            quantity: 0,
            label: buildBatchGroupLabel({
              productDisplayName,
              size,
              treeColor,
              bowColor
            })
          });
        }

        groups.get(key).quantity += quantity;

        if (itemHasCustomIconFlag(item)) {
          customIconRequiredCount += quantity;
        }
      });
    });

    return {
      groups: [...groups.values()].sort(compareBatchGroups),
      customIconRequiredCount
    };
  }

  function getMatchingOrderItems(record, filters = {}) {
    const normalizedFilters = normalizeFilters(filters);
    const items = getRecordItems(record);
    if (!hasActiveItemFilters(normalizedFilters)) {
      return items.slice();
    }

    return items.filter((item) => itemMatchesFilters(item, normalizedFilters));
  }

  function buildOptionList(records, filters, searchTerm, dimension) {
    if (dimension === 'openFlags') {
      return buildOpenFlagsOptionList(records, filters, searchTerm);
    }
    const optionCounts = new Map();
    const baseFilters = removeFilterDimension(filters, dimension);

    sortLocalOrdersNewestFirst(records).forEach((record) => {
      if (!recordMatches(record, baseFilters, searchTerm)) {
        return;
      }

      getDimensionValues(record, dimension, baseFilters).forEach((value) => {
        const normalizedValue = asTrimmedString(value);
        if (!normalizedValue) {
          return;
        }
        optionCounts.set(normalizedValue, (optionCounts.get(normalizedValue) || 0) + 1);
      });
    });

    return [...optionCounts.entries()]
      .map(([value, count]) => ({
        value,
        label: formatFilterLabel(dimension, value),
        count
      }))
      .sort((left, right) => compareFilterOptions(dimension, left, right));
  }

  function getDimensionValues(record, dimension, filters) {
    if (dimension === 'fulfillment') {
      const method = getRecordFulfillmentMethod(record);
      return method ? [method] : [];
    }
    if (dimension === 'syncStatus') {
      const status = asTrimmedString(record && record.sync_status);
      return status ? [status] : [];
    }
    if (dimension === 'openFlags') {
      return ['with_flags', 'without_flags'];
    }

    const values = new Set();
    getMatchingOrderItems(record, filters).forEach((item) => {
      const attributes = item.structured_attributes || {};
      if (dimension === 'product') {
        const value = asTrimmedString(attributes.product_definition_id || item.product_definition_id || item.productDefinitionId);
        if (value) {
          values.add(value);
        }
      } else if (dimension === 'size') {
        const value = asTrimmedString(attributes.size);
        if (value) {
          values.add(value);
        }
      } else if (dimension === 'treeColor') {
        const value = asTrimmedString(attributes.tree_color);
        if (value) {
          values.add(value);
        }
      } else if (dimension === 'bowColor') {
        const value = asTrimmedString(attributes.bow_color);
        if (value) {
          values.add(value);
        }
      } else if (dimension === 'year') {
        const value = normalizeYearFilterValue(attributes.year);
        if (value) {
          values.add(value);
        }
      }
    });

    return [...values];
  }

  function buildOpenFlagsOptionList(records, filters, searchTerm) {
    const baseFilters = removeFilterDimension(filters, 'openFlags');
    const counts = {
      with_flags: 0,
      without_flags: 0
    };

    sortLocalOrdersNewestFirst(records).forEach((record) => {
      if (searchTerm && !createOrderSearchDocument(record).includes(searchTerm)) {
        return;
      }

      const matchingItems = getMatchingOrderItems(record, baseFilters);
      if (matchingItems.length === 0) {
        return;
      }

      if (!recordMatchesOrderFilters(record, baseFilters, matchingItems)) {
        return;
      }

      if (recordHasMatchingOpenFlags(record, matchingItems, baseFilters)) {
        counts.with_flags += 1;
      } else {
        counts.without_flags += 1;
      }
    });

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([value, count]) => ({
        value,
        label: formatFilterLabel('openFlags', value),
        count
      }))
      .sort((left, right) => compareFilterOptions('openFlags', left, right));
  }

  function recordMatches(record, filters, searchTerm) {
    if (searchTerm && !createOrderSearchDocument(record).includes(searchTerm)) {
      return false;
    }

    const matchingItems = getMatchingOrderItems(record, filters);
    if (matchingItems.length === 0) {
      return false;
    }

    return recordMatchesOrderFilters(record, filters, matchingItems);
  }

  function recordMatchesOrderFilters(record, filters, matchingItems = getMatchingOrderItems(record, filters)) {
    const fulfillmentFilter = normalizeFilterValue(filters.fulfillment);
    if (fulfillmentFilter !== 'all' && getRecordFulfillmentMethod(record) !== fulfillmentFilter) {
      return false;
    }

    const syncStatusFilter = normalizeFilterValue(filters.syncStatus);
    if (syncStatusFilter !== 'all' && normalizeFilterValue(record && record.sync_status) !== syncStatusFilter) {
      return false;
    }

    const openFlagsFilter = normalizeFilterValue(filters.openFlags);
    if (openFlagsFilter === 'with_flags' && !recordHasMatchingOpenFlags(record, matchingItems, filters)) {
      return false;
    }
    if (openFlagsFilter === 'without_flags' && recordHasMatchingOpenFlags(record, matchingItems, filters)) {
      return false;
    }

    return true;
  }

  function itemMatchesFilters(item, filters) {
    const attributes = item && item.structured_attributes && typeof item.structured_attributes === 'object'
      ? item.structured_attributes
      : {};

    if (!valueMatchesFilter(attributes.product_definition_id || item.product_definition_id || item.productDefinitionId, filters.product)) {
      return false;
    }
    if (!valueMatchesFilter(attributes.size, filters.size)) {
      return false;
    }
    if (!valueMatchesFilter(attributes.tree_color, filters.treeColor)) {
      return false;
    }
    if (!valueMatchesFilter(attributes.bow_color, filters.bowColor)) {
      return false;
    }
    if (!valueMatchesFilter(normalizeYearFilterValue(attributes.year), filters.year)) {
      return false;
    }

    return true;
  }

  function recordHasMatchingOpenFlags(record, matchingItems, filters) {
    const openFlagsFilter = normalizeFilterValue(filters.openFlags);
    if (openFlagsFilter === 'without_flags') {
      return false;
    }
    if (openFlagsFilter === 'with_flags' || hasActiveItemFilters(filters)) {
      return matchingItems.some((item) => itemHasAnyOpenFlags(item));
    }
    return recordHasAnyOpenFlags(record);
  }

  function recordHasAnyOpenFlags(record) {
    if (!record || typeof record !== 'object') {
      return false;
    }

    if (Boolean(record.has_open_flags)) {
      return true;
    }

    const payload = getPayload(record);
    if (Boolean(payload.has_open_flags)) {
      return true;
    }

    if (Array.isArray(payload.open_flags) && payload.open_flags.length > 0) {
      return true;
    }

    return getRecordItems(record).some((item) => itemHasAnyOpenFlags(item));
  }

  function itemHasAnyOpenFlags(item) {
    return Array.isArray(item && item.open_flags) && item.open_flags.length > 0;
  }

  function itemHasCustomIconFlag(item) {
    return Array.isArray(item && item.open_flags) && item.open_flags.some((flag) => normalizeFilterValue(flag && flag.code) === 'custom_icon');
  }

  function recordHasPendingSync(record) {
    return normalizeFilterValue(record && record.sync_status) === 'pending';
  }

  function getRecordItems(record) {
    const payload = getPayload(record);
    return Array.isArray(payload.items) ? payload.items.slice() : [];
  }

  function getPayload(record) {
    return record && record.payload && typeof record.payload === 'object' ? record.payload : {};
  }

  function getRecordFulfillmentMethod(record) {
    const payload = getPayload(record);
    const method = asTrimmedString(payload.fulfillment && payload.fulfillment.method).toLowerCase();
    return method === 'pickup' ? 'pickup' : (method === 'shipping' ? 'shipping' : '');
  }

  function normalizeFilters(filters) {
    const defaults = createEmptyOrderFilters();
    const source = filters && typeof filters === 'object' ? filters : {};
    const normalized = { ...defaults };
    FILTER_KEYS.forEach((key) => {
      normalized[key] = normalizeFilterValue(source[key] == null ? defaults[key] : source[key]);
    });
    return normalized;
  }

  function removeFilterDimension(filters, dimension) {
    const normalized = normalizeFilters(filters);
    if (FILTER_KEYS.includes(dimension)) {
      normalized[dimension] = 'all';
    }
    return normalized;
  }

  function hasActiveItemFilters(filters) {
    const normalized = normalizeFilters(filters);
    return ITEM_FILTER_KEYS.some((key) => normalizeFilterValue(normalized[key]) !== 'all');
  }

  function valueMatchesFilter(value, filterValue) {
    const normalizedFilter = normalizeFilterValue(filterValue);
    if (normalizedFilter === 'all') {
      return true;
    }
    return normalizeFilterValue(value) === normalizedFilter;
  }

  function normalizeFilterValue(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    return normalized || 'all';
  }

  function normalizeYearFilterValue(value) {
    if (value == null || value === '') {
      return '';
    }
    return asTrimmedString(value);
  }

  function normalizeSearchValue(value) {
    return asTrimmedString(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function buildBatchGroupLabel(parts) {
    const labelParts = [parts.productDisplayName];
    if (parts.size) {
      labelParts.push(parts.size);
    }
    if (parts.treeColor) {
      labelParts.push(parts.treeColor);
    }
    if (parts.bowColor) {
      labelParts.push(`${parts.bowColor} Bow`);
    }
    return labelParts.join(' / ');
  }

  function formatFilterLabel(dimension, value) {
    if (dimension === 'product') {
      return getProductDisplayName(value);
    }
    if (dimension === 'fulfillment') {
      return value === 'pickup' ? 'Pickup' : 'Shipping';
    }
    if (dimension === 'openFlags') {
      return value === 'with_flags' ? 'With Flags' : 'Without Flags';
    }
    if (dimension === 'syncStatus') {
      return value.split('_').map(capitalizeWord).join(' ');
    }
    return value;
  }

  function getProductDisplayName(productDefinitionId) {
    const normalized = normalizeFilterValue(productDefinitionId);
    const PRODUCT_DISPLAY_NAMES = {
      tree_ornament: 'Tree Ornament',
      antler_ornament: 'Antler Ornament',
      present_stack: 'Present Stack Ornament',
      grinch_tree: 'Grinch Tree Ornament',
      veteran_flag: 'Veteran Flag Ornament',
      babys_first_christmas: "Baby's First Christmas",
      mr_and_mrs_christmas: 'Mr. & Mrs. Christmas',
      little_reindeer_letter: 'Little Reindeer Letter Ornament',
      custom_request: 'Custom Request',
      classic_family_sign: 'Classic Family Sign',
      family_cutting_board: 'Family Cutting Board',
      live_edge_family_sign: 'Live Edge Family Sign'
    };
    return PRODUCT_DISPLAY_NAMES[normalized] || productDefinitionId;
  }

  function compareOrdersNewestFirst(left, right) {
    const leftTimestamp = Date.parse(left?.submitted_at || left?.local_saved_at || '') || 0;
    const rightTimestamp = Date.parse(right?.submitted_at || right?.local_saved_at || '') || 0;
    if (rightTimestamp !== leftTimestamp) {
      return rightTimestamp - leftTimestamp;
    }
    return asTrimmedString(right?.forge_order_uuid).localeCompare(asTrimmedString(left?.forge_order_uuid));
  }

  function compareFilterOptions(dimension, left, right) {
    if (dimension === 'size') {
      const sizeRank = { Small: 1, Large: 2 };
      const leftRank = sizeRank[left.value] || 99;
      const rightRank = sizeRank[right.value] || 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }
    if (dimension === 'year') {
      const leftYear = Number.parseInt(left.value, 10);
      const rightYear = Number.parseInt(right.value, 10);
      if (Number.isFinite(leftYear) && Number.isFinite(rightYear) && leftYear !== rightYear) {
        return leftYear - rightYear;
      }
    }
    return left.label.localeCompare(right.label);
  }

  function compareBatchGroups(left, right) {
    const byName = left.productDisplayName.localeCompare(right.productDisplayName);
    if (byName !== 0) {
      return byName;
    }
    const bySize = asTrimmedString(left.size).localeCompare(asTrimmedString(right.size));
    if (bySize !== 0) {
      return bySize;
    }
    const byTreeColor = asTrimmedString(left.treeColor).localeCompare(asTrimmedString(right.treeColor));
    if (byTreeColor !== 0) {
      return byTreeColor;
    }
    return asTrimmedString(left.bowColor).localeCompare(asTrimmedString(right.bowColor));
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

  function capitalizeWord(value) {
    const word = asTrimmedString(value);
    return word ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : '';
  }

  function normalizeQuantity(value) {
    return Number.isInteger(value) && value > 0 ? value : 1;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function asNullableTrimmedString(value) {
    const normalized = asTrimmedString(value);
    return normalized || null;
  }

  return {
    buildProductionBatchGroups,
    createEmptyOrderFilters,
    createOrderSearchDocument,
    filterLocalOrders,
    getAvailableOrderFilters,
    getMatchingOrderItems,
    getShortOrderReference,
    isLocalOrdersQueueEnabled,
    shouldCreateStaffOrdersUi,
    sortLocalOrdersNewestFirst,
    summarizeLocalOrders
  };
}));
