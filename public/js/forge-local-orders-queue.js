(function (root, factory) {
  const syncStatusModule = typeof module === 'object' && module.exports
    ? require('./forge-sync-status.js')
    : root.ForgeSyncStatus;
  const api = factory(syncStatusModule);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeLocalOrdersQueue = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (syncStatusModule) {
  const FILTER_KEYS = [
    'orderScope',
    'product',
    'ornamentType',
    'size',
    'treeColor',
    'bowColor',
    'year',
    'productionStatus',
    'fulfillment',
    'event',
    'openFlags',
    'tray',
    'syncStatus'
  ];
  const ITEM_FILTER_KEYS = ['product', 'ornamentType', 'size', 'treeColor', 'bowColor', 'year', 'productionStatus'];
  const ORDER_FILTER_KEYS = ['orderScope', 'fulfillment', 'event', 'tray', 'syncStatus', 'openFlags'];
  const TERMINAL_ORDER_STATUSES = new Set(['completed', 'packed', 'shipped', 'picked_up', 'cancelled']);
  const ACTIVE_PRODUCTION_ORDER_STATUSES = new Set(['submitted', 'tray_assigned', 'in_production', 'ready_to_pack']);
  const ISSUE_PRIORITY = ['waiting_for_tray', 'custom_icon_required', 'blocked_items', 'other_open_flags'];
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
  const ORNAMENT_TYPE_LABELS = {
    tree_ornament: 'Tree Ornament',
    antler_ornament: 'Antler Ornament',
    present_stack: 'Present Stack Ornament',
    grinch_tree: 'Grinch Tree Ornament',
    veteran_flag: 'Veteran Flag Ornament',
    babys_first_christmas: "Baby's First Christmas",
    mr_and_mrs_christmas: 'Mr. & Mrs. Christmas',
    little_reindeer_letter: 'Little Reindeer Letter Ornament'
  };
  const ISSUE_LABELS = {
    waiting_for_tray: 'Waiting for Tray',
    custom_icon_required: 'Custom Icon Required',
    blocked_items: 'Blocked Items',
    other_open_flags: 'Other Open Flags'
  };
  const ISSUE_DESCRIPTIONS = {
    waiting_for_tray: 'These pieces still need a tray assignment before they can safely enter production.',
    custom_icon_required: 'These pieces have custom-icon requests that need special attention before normal batching.',
    blocked_items: 'These pieces are blocked and cannot safely enter normal production yet.',
    other_open_flags: 'These pieces have unresolved production flags that must be reviewed before batching.'
  };
  const APPLICABLE_DIMENSIONS = {
    tree_ornament: new Set(['size', 'treeColor', 'bowColor', 'year']),
    antler_ornament: new Set(['size', 'year']),
    present_stack: new Set(['bowColor', 'year']),
    grinch_tree: new Set(['year']),
    veteran_flag: new Set([]),
    little_reindeer_letter: new Set([]),
    babys_first_christmas: new Set(['bowColor', 'year']),
    mr_and_mrs_christmas: new Set(['year']),
    classic_family_sign: new Set(['year']),
    family_cutting_board: new Set(['year']),
    live_edge_family_sign: new Set(['year']),
    custom_request: new Set([])
  };

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
      orderScope: 'all',
      product: 'all',
      ornamentType: 'all',
      size: 'all',
      treeColor: 'all',
      bowColor: 'all',
      year: 'all',
      productionStatus: 'all',
      fulfillment: 'all',
      event: 'all',
      openFlags: 'all',
      tray: 'all',
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
    const payload = getPayload(record);
    const customer = payload.customer || {};
    const parts = [
      record?.forge_order_uuid,
      payload.forge_order_uuid,
      getShortOrderReference(record),
      customer.full_name,
      customer.email,
      customer.phone,
      payload.event_id,
      payload.event?.event_id,
      record?.event_id,
      normalizeTraySearchValue(record?.current_tray_number)
    ];

    getNormalizedProductionItems(record).forEach((item) => {
      parts.push(item.productDisplayName);
      parts.push(item.productDefinitionId);
      parts.push(item.ornamentTypeLabel);
      parts.push(item.ornamentType);
      parts.push(item.sizeLabel);
      parts.push(item.treeColorLabel);
      parts.push(item.bowColorLabel);
      parts.push(item.yearLabel);
      parts.push(item.productionStatusLabel);
      parts.push(item.conciseIdentifier);
    });

    return normalizeSearchValue(parts.join(' '));
  }

  function getAvailableOrderFilters(records, options = {}) {
    const normalizedFilters = normalizeFilters(options.activeFilters);
    const searchTerm = normalizeSearchValue(options.searchTerm || '');
    const sortedRecords = sortLocalOrdersNewestFirst(records);

    return {
      orderScope: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'orderScope'),
      product: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'product'),
      ornamentType: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'ornamentType'),
      size: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'size'),
      treeColor: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'treeColor'),
      bowColor: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'bowColor'),
      year: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'year'),
      productionStatus: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'productionStatus'),
      fulfillment: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'fulfillment'),
      event: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'event'),
      openFlags: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'openFlags'),
      tray: buildOptionList(sortedRecords, normalizedFilters, searchTerm, 'tray'),
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
    const filteredRecords = sortLocalOrdersNewestFirst(records).filter((record) => recordMatches(record, normalizedFilters, ''));
    let totalItems = 0;
    let ordersWithOpenFlags = 0;
    let pendingFutureSync = 0;

    filteredRecords.forEach((record) => {
      const matchingItems = getMatchingProductionItems(record, normalizedFilters);
      totalItems += matchingItems.reduce((sum, match) => sum + match.attributes.requiredQuantity, 0);

      if (recordHasPendingSync(record)) {
        pendingFutureSync += 1;
      }

      if (recordHasMatchingOpenFlags(record, matchingItems.map((match) => match.attributes), normalizedFilters)) {
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
    const readyGroups = new Map();
    const issueGroups = new Map();

    sortLocalOrdersNewestFirst(records).forEach((record) => {
      if (!recordMatches(record, normalizedFilters, '')) {
        return;
      }

      getMatchingProductionItems(record, normalizedFilters).forEach((match) => {
        const classification = classifyProductionItem(record, match.attributes);
        if (classification.kind === 'excluded') {
          return;
        }

        const groupStore = classification.kind === 'ready' ? readyGroups : issueGroups;
        const group = ensureBatchGroup(groupStore, classification, match.attributes);
        group.requiredQuantity += match.attributes.requiredQuantity;
        group.completedQuantity += match.attributes.completedQuantity;
        group.remainingQuantity += match.attributes.remainingQuantity;
        group.matchingLineCount += 1;
        group.orderIds.add(match.attributes.orderUuid);
      });
    });

    return {
      readyGroups: finalizeBatchGroups([...readyGroups.values()], compareReadyBatchGroups),
      issueGroups: finalizeBatchGroups([...issueGroups.values()], compareIssueBatchGroups)
    };
  }

  function buildProductionBatchRows(group, records, filters = {}) {
    const normalizedFilters = normalizeFilters(filters);
    const targetGroup = group && typeof group === 'object' ? group : null;
    if (!targetGroup) {
      return [];
    }

    const rows = [];
    sortLocalOrdersNewestFirst(records).forEach((record) => {
      if (!recordMatches(record, normalizedFilters, '')) {
        return;
      }

      getMatchingProductionItems(record, normalizedFilters).forEach((match) => {
        const classification = classifyProductionItem(record, match.attributes);
        if (!classificationMatchesGroup(classification, targetGroup)) {
          return;
        }

        rows.push({
          groupKey: targetGroup.key,
          stableItemKey: `${match.attributes.orderUuid}::${match.attributes.lineId}`,
          orderUuid: match.attributes.orderUuid,
          lineId: match.attributes.lineId,
          lineOrder: match.attributes.lineOrder,
          trayNumber: match.attributes.currentTrayNumber,
          trayLabel: match.attributes.trayLabel,
          orderReference: match.attributes.orderReference,
          customerName: match.attributes.customerName,
          productDisplayName: match.attributes.productDisplayName,
          conciseIdentifier: match.attributes.conciseIdentifier,
          requiredQuantity: match.attributes.requiredQuantity,
          completedQuantity: match.attributes.completedQuantity,
          remainingQuantity: match.attributes.remainingQuantity,
          productionStatus: match.attributes.productionStatus,
          productionStatusLabel: match.attributes.productionStatusLabel,
          fulfillment: match.attributes.fulfillment,
          fulfillmentLabel: match.attributes.fulfillmentLabel,
          openFlagMessage: getPrimaryOpenFlagMessage(record, match.attributes),
          currentTrayNumber: match.attributes.currentTrayNumber
        });
      });
    });

    return sortProductionBatchRows(rows);
  }

  function classifyProductionItem(record, normalizedItem) {
    const item = normalizedItem && typeof normalizedItem === 'object'
      ? normalizedItem
      : normalizeProductionItemAttributes(record, normalizedItem, 0);
    const orderStatus = normalizeLifecycleStatus(record?.production_status);

    if (
      !item
      || item.productionStatus === 'cancelled'
      || item.remainingQuantity <= 0
      || TERMINAL_ORDER_STATUSES.has(orderStatus)
      || !ACTIVE_PRODUCTION_ORDER_STATUSES.has(orderStatus)
    ) {
      return { kind: 'excluded', key: '', issueType: '' };
    }

    const orderFlags = getOrderOpenFlags(record);
    const itemFlags = item.openFlags;
    const allFlags = [...orderFlags, ...itemFlags];

    if (!item.currentTrayNumber) {
      return { kind: 'issue', issueType: 'waiting_for_tray', key: 'issue::waiting_for_tray', label: ISSUE_LABELS.waiting_for_tray };
    }
    if (hasCustomIconFlagSet(allFlags)) {
      return { kind: 'issue', issueType: 'custom_icon_required', key: 'issue::custom_icon_required', label: ISSUE_LABELS.custom_icon_required };
    }
    if (item.productionStatus === 'blocked') {
      return { kind: 'issue', issueType: 'blocked_items', key: 'issue::blocked_items', label: ISSUE_LABELS.blocked_items };
    }
    if (recordHasAnyOpenFlags(record) || item.hasOpenFlags) {
      return { kind: 'issue', issueType: 'other_open_flags', key: 'issue::other_open_flags', label: ISSUE_LABELS.other_open_flags };
    }
    if (!['pending', 'in_production'].includes(item.productionStatus)) {
      return { kind: 'excluded', key: '', issueType: '' };
    }

    const keyParts = [
      item.productDefinitionId,
      item.ornamentType || '',
      item.size || '',
      item.treeColor || '',
      item.bowColor || '',
      item.year || ''
    ];

    return {
      kind: 'ready',
      key: `ready::${keyParts.join('::')}`,
      issueType: '',
      label: buildBatchGroupLabel(item)
    };
  }

  function derivePhysicalPieceCounts(item) {
    const quantity = normalizeQuantity(item && item.quantity);
    const explicitStatus = normalizeItemProductionStatus(item);
    const completedQuantity = normalizeCompletedQuantity(item && item.completed_quantity, quantity, explicitStatus);

    return {
      requiredQuantity: quantity,
      completedQuantity,
      remainingQuantity: Math.max(quantity - completedQuantity, 0)
    };
  }

  function sortProductionBatchRows(rows) {
    const normalizedRows = Array.isArray(rows) ? [...rows] : [];
    return normalizedRows.sort(compareBatchRows);
  }

  function normalizeProductionItemAttributes(record, item, index = 0) {
    const payload = getPayload(record);
    const structured = item && item.structured_attributes && typeof item.structured_attributes === 'object'
      ? item.structured_attributes
      : {};
    const configurationSnapshot = item && item.configuration_snapshot && typeof item.configuration_snapshot === 'object'
      ? item.configuration_snapshot
      : {};
    const { requiredQuantity, completedQuantity, remainingQuantity } = derivePhysicalPieceCounts(item);
    const productDefinitionId = normalizeStableValue(firstNonEmpty([
      structured.product_definition_id,
      item?.product_definition_id,
      item?.productDefinitionId
    ]));
    const productDisplayName = firstNonEmpty([
      item?.product_display_name,
      item?.productDisplayName,
      getProductDisplayName(productDefinitionId),
      'Custom Item'
    ]);
    const category = normalizeStableValue(firstNonEmpty([
      structured.category,
      item?.category,
      inferCategoryFromProduct(productDefinitionId)
    ]));
    const ornamentType = normalizeStableValue(firstNonEmpty([
      structured.ornament_type,
      inferLegacyOrnamentType(productDefinitionId, category)
    ]));
    const size = isApplicableDimension(productDefinitionId, 'size')
      ? normalizeStableValue(firstNonEmpty([structured.size, configurationSnapshot.size, item?.size]))
      : '';
    const treeColor = isApplicableDimension(productDefinitionId, 'treeColor')
      ? normalizeStableValue(firstNonEmpty([
      structured.tree_color,
      configurationSnapshot.treeColor,
      configurationSnapshot.tree_color,
      item?.treeColor
    ]))
      : '';
    const bowColor = isApplicableDimension(productDefinitionId, 'bowColor')
      ? normalizeStableValue(firstNonEmpty([
      structured.bow_color,
      configurationSnapshot.bowColor,
      configurationSnapshot.bow_color,
      configurationSnapshot.bow_and_stocking_color
    ]))
      : '';
    const year = isApplicableDimension(productDefinitionId, 'year')
      ? normalizeYearFilterValue(firstNonEmpty([
      structured.year,
      configurationSnapshot.year,
      configurationSnapshot.wedding_year,
      configurationSnapshot.weddingYear,
      configurationSnapshot.established_year,
      configurationSnapshot.establishedYear,
      item?.year
    ]))
      : '';
    const productionStatus = normalizeItemProductionStatus(item);
    const fulfillment = getRecordFulfillmentMethod(record);
    const eventId = normalizeStableValue(firstNonEmpty([
      record?.event_id,
      payload.event_id,
      payload.event?.event_id,
      structured.event_id
    ]));
    const currentTrayNumber = normalizeTrayNumber(record?.current_tray_number);
    const syncStatus = getRecordSyncStatusValue(record);
    const lineId = firstNonEmpty([item?.line_id, item?.order_item_id, `${record?.forge_order_uuid || 'order'}-line-${index + 1}`]);

    return {
      orderUuid: asTrimmedString(record?.forge_order_uuid || payload.forge_order_uuid),
      orderReference: getShortOrderReference(record),
      customerName: firstNonEmpty([payload.customer?.full_name, 'Unknown customer']),
      productDefinitionId,
      productDisplayName,
      category,
      ornamentType,
      ornamentTypeLabel: getOrnamentTypeLabel(ornamentType, productDisplayName, category),
      size,
      sizeLabel: getDisplayLabel(size),
      treeColor,
      treeColorLabel: getDisplayLabel(treeColor),
      bowColor,
      bowColorLabel: getDisplayLabel(bowColor),
      year,
      yearLabel: year,
      productionStatus,
      productionStatusLabel: getProductionStatusLabel(productionStatus),
      fulfillment,
      fulfillmentLabel: getFulfillmentLabel(fulfillment),
      eventId,
      eventLabel: firstNonEmpty([record?.event_id, payload.event?.event_id, payload.event_id]),
      trayValue: currentTrayNumber ? String(currentTrayNumber) : 'unassigned',
      trayLabel: currentTrayNumber ? `Tray ${currentTrayNumber}` : 'No Tray Assigned',
      currentTrayNumber,
      syncStatus,
      syncStatusLabel: getSyncStatusLabel(syncStatus),
      lineId,
      lineOrder: index,
      requiredQuantity,
      completedQuantity,
      remainingQuantity,
      hasOpenFlags: itemHasAnyOpenFlags(item),
      openFlags: getItemOpenFlags(item),
      orderOpenFlags: getOrderOpenFlags(record),
      conciseIdentifier: buildConciseProductionIdentifier(structured, configurationSnapshot, item, year)
    };
  }

  function itemMatchesProductionFilters(item, record, filters) {
    const normalizedFilters = normalizeFilters(filters);
    const attributes = normalizeProductionItemAttributes(record, item, 0);

    return ITEM_FILTER_KEYS.every((dimension) => valueMatchesFilter(attributes[getDimensionProperty(dimension)], normalizedFilters[dimension]));
  }

  function isOrderEligibleForReadyToPack(record) {
    const normalizedRecord = record && typeof record === 'object' ? record : null;
    if (!normalizedRecord) {
      return false;
    }

    if (normalizeLifecycleStatus(normalizedRecord.production_status) !== 'ready_to_pack') {
      return false;
    }

    if (!hasActiveTrayAssignment(normalizedRecord)) {
      return false;
    }

    if (recordHasAnyOpenFlags(normalizedRecord)) {
      return false;
    }

    const counts = deriveReadyToPackCounts(normalizedRecord);
    if (counts.totalItemCount <= 0) {
      return false;
    }
    if (counts.completedItemCount !== counts.totalItemCount) {
      return false;
    }
    if (!counts.allRequiredItemsComplete) {
      return false;
    }

    const storedTotal = normalizeOptionalCount(normalizedRecord.total_item_count);
    const storedCompleted = normalizeOptionalCount(normalizedRecord.completed_item_count);
    if (storedTotal != null && storedTotal !== counts.totalItemCount) {
      return false;
    }
    if (storedCompleted != null && storedCompleted !== counts.completedItemCount) {
      return false;
    }

    return true;
  }

  function filterReadyToPackOrders(records) {
    return sortReadyToPackOrders((Array.isArray(records) ? records : []).filter((record) => isOrderEligibleForReadyToPack(record)));
  }

  function sortReadyToPackOrders(records) {
    const normalizedRecords = Array.isArray(records) ? [...records] : [];
    return normalizedRecords.sort(compareReadyToPackOrders);
  }

  function buildReadyToPackItemSummaries(record) {
    return getRecordItems(record)
      .filter((item) => normalizeItemProductionStatus(item) !== 'cancelled')
      .map((item) => `${normalizeQuantity(item.quantity)} × ${asTrimmedString(item.product_display_name || item.product_definition_id || 'Custom Item')}`);
  }

  function getMatchingOrderItems(record, filters = {}) {
    if (!recordMatches(record, filters, '')) {
      return [];
    }
    return getMatchingProductionItems(record, filters).map((match) => match.item);
  }

  function getMatchingProductionItems(record, filters = {}, options = {}) {
    const normalizedFilters = normalizeFilters(filters);
    if (!recordMatchesNonSearch(record, normalizedFilters, options.excludeDimension)) {
      return [];
    }

    const items = getRecordItems(record);
    return items.reduce((matches, item, index) => {
      const attributes = normalizeProductionItemAttributes(record, item, index);
      if (itemMatchesFiltersByAttributes(attributes, normalizedFilters, options.excludeDimension)) {
        matches.push({ item, attributes, index });
      }
      return matches;
    }, []);
  }

  function buildOptionList(records, filters, searchTerm, dimension) {
    if (dimension === 'orderScope') {
      return buildOrderScopeOptionList(records, filters, searchTerm);
    }
    if (dimension === 'openFlags') {
      return buildOpenFlagsOptionList(records, filters, searchTerm);
    }

    const selectedValue = normalizeFilterValue(filters[dimension]);
    const optionMap = new Map();
    const baseFilters = removeFilterDimension(filters, dimension);

    sortLocalOrdersNewestFirst(records).forEach((record) => {
      if (searchTerm && !createOrderSearchDocument(record).includes(searchTerm)) {
        return;
      }

      if (ITEM_FILTER_KEYS.includes(dimension)) {
        getMatchingProductionItems(record, baseFilters).forEach((match) => {
          const value = getDimensionValue(match.attributes, dimension);
          const label = getDimensionLabel(match.attributes, dimension);
          addOption(optionMap, value, label, dimension === 'productionStatus' ? match.attributes.orderUuid : '');
        });
        return;
      }

      if (!recordMatches(record, baseFilters, searchTerm)) {
        return;
      }

      const values = getOrderDimensionValues(record, dimension);
      values.forEach(({ value, label }) => addOption(optionMap, value, label));
    });

    if (selectedValue !== 'all' && !optionMap.has(selectedValue)) {
      optionMap.set(selectedValue, { value: selectedValue, label: formatFilterLabel(dimension, selectedValue), count: 0 });
    }

    return [...optionMap.values()]
      .map(({ countedOrderKeys, ...option }) => option)
      .sort((left, right) => compareFilterOptions(dimension, left, right));
  }

  function addOption(optionMap, value, label, uniqueOrderKey = '') {
    const normalizedValue = normalizeFilterValue(value);
    if (!normalizedValue || normalizedValue === 'all') {
      return;
    }

    if (!optionMap.has(normalizedValue)) {
      optionMap.set(normalizedValue, {
        value: normalizedValue,
        label: label || formatGenericLabel(normalizedValue),
        count: 0,
        countedOrderKeys: new Set()
      });
    }

    const option = optionMap.get(normalizedValue);
    if (uniqueOrderKey) {
      const normalizedOrderKey = asTrimmedString(uniqueOrderKey);
      if (!normalizedOrderKey || option.countedOrderKeys.has(normalizedOrderKey)) {
        return;
      }
      option.countedOrderKeys.add(normalizedOrderKey);
    }

    option.count += 1;
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

      const matchingItems = getMatchingProductionItems(record, baseFilters).map((match) => match.attributes);
      if (matchingItems.length === 0 || !recordMatchesNonItemFilters(record, baseFilters, matchingItems)) {
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

  function buildOrderScopeOptionList(records, filters, searchTerm) {
    const baseFilters = removeFilterDimension(filters, 'orderScope');
    const counts = {
      active: 0,
      cancelled: 0,
      test_orders: 0
    };

    sortLocalOrdersNewestFirst(records).forEach((record) => {
      if (searchTerm && !createOrderSearchDocument(record).includes(searchTerm)) {
        return;
      }

      const matchingItems = getMatchingProductionItems(record, baseFilters).map((match) => match.attributes);
      if (matchingItems.length === 0 || !recordMatchesNonItemFilters(record, baseFilters, matchingItems)) {
        return;
      }

      if (isActiveScopeRecord(record)) {
        counts.active += 1;
      }
      if (normalizeLifecycleStatus(record?.production_status) === 'cancelled') {
        counts.cancelled += 1;
      }
      if (getRecordEventType(record) === 'test_session') {
        counts.test_orders += 1;
      }
    });

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([value, count]) => ({
        value,
        label: formatFilterLabel('orderScope', value),
        count
      }))
      .sort((left, right) => compareFilterOptions('orderScope', left, right));
  }

  function recordMatches(record, filters, searchTerm) {
    if (searchTerm && !createOrderSearchDocument(record).includes(searchTerm)) {
      return false;
    }

    const matchingItems = getMatchingProductionItems(record, filters).map((match) => match.attributes);
    if (matchingItems.length === 0) {
      return false;
    }

    return recordMatchesNonItemFilters(record, filters, matchingItems);
  }

  function recordMatchesNonSearch(record, filters, excludeDimension) {
    const matchingItems = getRecordItems(record).reduce((matches, item, index) => {
      const attributes = normalizeProductionItemAttributes(record, item, index);
      if (itemMatchesFiltersByAttributes(attributes, filters, excludeDimension)) {
        matches.push(attributes);
      }
      return matches;
    }, []);

    if (matchingItems.length === 0) {
      return false;
    }

    return recordMatchesNonItemFilters(record, filters, matchingItems, excludeDimension);
  }

  function recordMatchesNonItemFilters(record, filters, matchingItems, excludeDimension = '') {
    const normalizedFilters = normalizeFilters(filters);
    const excluded = excludeDimension || '';

    if (excluded !== 'orderScope') {
      const orderScopeFilter = normalizeFilterValue(normalizedFilters.orderScope);
      if (orderScopeFilter === 'active' && !isActiveScopeRecord(record)) {
        return false;
      }
      if (orderScopeFilter === 'cancelled' && normalizeLifecycleStatus(record?.production_status) !== 'cancelled') {
        return false;
      }
      if (orderScopeFilter === 'test_orders' && getRecordEventType(record) !== 'test_session') {
        return false;
      }
    }

    if (excluded !== 'fulfillment') {
      const fulfillmentFilter = normalizeFilterValue(normalizedFilters.fulfillment);
      if (fulfillmentFilter !== 'all' && getRecordFulfillmentMethod(record) !== fulfillmentFilter) {
        return false;
      }
    }

    if (excluded !== 'event') {
      const eventFilter = normalizeFilterValue(normalizedFilters.event);
      if (eventFilter !== 'all' && getRecordEventValue(record) !== eventFilter) {
        return false;
      }
    }

    if (excluded !== 'tray') {
      const trayFilter = normalizeFilterValue(normalizedFilters.tray);
      if (trayFilter !== 'all' && getRecordTrayValue(record) !== trayFilter) {
        return false;
      }
    }

    if (excluded !== 'syncStatus') {
      const syncStatusFilter = normalizeFilterValue(normalizedFilters.syncStatus);
      if (syncStatusFilter !== 'all' && getRecordSyncStatusValue(record) !== syncStatusFilter) {
        return false;
      }
    }

    if (excluded !== 'openFlags') {
      const openFlagsFilter = normalizeFilterValue(normalizedFilters.openFlags);
      if (openFlagsFilter === 'with_flags' && !recordHasMatchingOpenFlags(record, matchingItems, normalizedFilters)) {
        return false;
      }
      if (openFlagsFilter === 'without_flags' && recordHasMatchingOpenFlags(record, matchingItems, normalizedFilters)) {
        return false;
      }
    }

    return true;
  }

  function itemMatchesFiltersByAttributes(attributes, filters, excludeDimension = '') {
    const normalizedFilters = normalizeFilters(filters);

    return ITEM_FILTER_KEYS.every((dimension) => {
      if (dimension === excludeDimension) {
        return true;
      }

      return valueMatchesFilter(attributes[getDimensionProperty(dimension)], normalizedFilters[dimension]);
    });
  }

  function recordHasMatchingOpenFlags(record, matchingItems, filters) {
    if (recordHasOrderLevelFlags(record)) {
      return true;
    }
    return (Array.isArray(matchingItems) ? matchingItems : []).some((item) => Boolean(item && item.hasOpenFlags));
  }

  function recordHasAnyOpenFlags(record) {
    return recordHasOrderLevelFlags(record) || getRecordItems(record).some((item) => itemHasAnyOpenFlags(item));
  }

  function recordHasOrderLevelFlags(record) {
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
    return getOrderOpenFlags(record).length > 0;
  }

  function itemHasAnyOpenFlags(item) {
    if (!item || typeof item !== 'object') {
      return false;
    }
    if (getItemOpenFlags(item).length > 0) {
      return true;
    }
    const structuredAttributes = item.structured_attributes && typeof item.structured_attributes === 'object'
      ? item.structured_attributes
      : {};
    return Boolean(structuredAttributes.has_open_flags);
  }

  function getOrderOpenFlags(record) {
    const payload = getPayload(record);
    return Array.isArray(payload.open_flags) ? payload.open_flags.slice() : [];
  }

  function getItemOpenFlags(item) {
    return Array.isArray(item && item.open_flags) ? item.open_flags.slice() : [];
  }

  function hasCustomIconFlagSet(flags) {
    return (Array.isArray(flags) ? flags : []).some((flag) => {
      const code = normalizeFilterValue(flag && flag.code);
      const message = normalizeSearchValue(flag && flag.message);
      return code === 'custom_icon' || message.includes('custom icon');
    });
  }

  function itemHasCustomIconFlag(item) {
    return hasCustomIconFlagSet(getItemOpenFlags(item));
  }

  function recordHasPendingSync(record) {
    const syncStatus = getRecordSyncStatusValue(record);
    return syncStatus === 'pending' || syncStatus === 'syncing';
  }

  function getNormalizedProductionItems(record) {
    return getRecordItems(record).map((item, index) => normalizeProductionItemAttributes(record, item, index));
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

  function getRecordEventValue(record) {
    const payload = getPayload(record);
    return normalizeFilterValue(firstNonEmpty([record?.event_id, payload.event?.event_id, payload.event_id]));
  }

  function getRecordEventType(record) {
    const payload = getPayload(record);
    return normalizeStableValue(payload.event?.event_type);
  }

  function getRecordTrayValue(record) {
    const trayNumber = normalizeTrayNumber(record && record.current_tray_number);
    return trayNumber ? String(trayNumber) : 'unassigned';
  }

  function getOrderDimensionValues(record, dimension) {
    if (dimension === 'orderScope') {
      const values = [];
      if (isActiveScopeRecord(record)) {
        values.push({ value: 'active', label: 'Active' });
      }
      if (normalizeLifecycleStatus(record?.production_status) === 'cancelled') {
        values.push({ value: 'cancelled', label: 'Cancelled' });
      }
      if (getRecordEventType(record) === 'test_session') {
        values.push({ value: 'test_orders', label: 'Test Orders' });
      }
      return values;
    }
    if (dimension === 'fulfillment') {
      const fulfillment = getRecordFulfillmentMethod(record);
      return fulfillment ? [{ value: fulfillment, label: getFulfillmentLabel(fulfillment) }] : [];
    }
    if (dimension === 'event') {
      const payload = getPayload(record);
      const rawValue = firstNonEmpty([record?.event_id, payload.event?.event_id, payload.event_id]);
      const value = normalizeFilterValue(rawValue);
      return value === 'all' ? [] : [{ value, label: rawValue }];
    }
    if (dimension === 'tray') {
      const trayNumber = normalizeTrayNumber(record && record.current_tray_number);
      return trayNumber
        ? [{ value: String(trayNumber), label: `Tray ${trayNumber}` }]
        : [{ value: 'unassigned', label: 'No Tray Assigned' }];
    }
    if (dimension === 'syncStatus') {
      const syncStatus = getRecordSyncStatusValue(record);
      return syncStatus === 'all' ? [] : [{ value: syncStatus, label: getSyncStatusLabel(syncStatus) }];
    }
    return [];
  }

  function normalizeFilters(filters) {
    const defaults = createEmptyOrderFilters();
    const source = filters && typeof filters === 'object' ? filters : {};
    const normalized = { ...defaults };

    FILTER_KEYS.forEach((key) => {
      const rawValue = source[key] == null ? defaults[key] : source[key];
      normalized[key] = key === 'year' ? normalizeYearFilterValue(rawValue) || 'all' : normalizeFilterValue(rawValue);
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

  function normalizeStableValue(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    return normalized || '';
  }

  function normalizeYearFilterValue(value) {
    const normalized = asTrimmedString(value);
    return normalized || '';
  }

  function normalizeSearchValue(value) {
    return asTrimmedString(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function buildBatchGroupLabel(item) {
    const labelParts = [item.productDisplayName];
    if (item.ornamentType && item.ornamentType !== item.productDefinitionId && item.ornamentTypeLabel && item.ornamentTypeLabel !== item.productDisplayName) {
      labelParts.push(item.ornamentTypeLabel);
    }
    if (item.sizeLabel) {
      labelParts.push(item.sizeLabel);
    }
    if (item.treeColorLabel) {
      labelParts.push(item.treeColorLabel);
    }
    if (item.bowColorLabel) {
      labelParts.push(`${item.bowColorLabel} Bow`);
    }
    if (item.yearLabel) {
      labelParts.push(item.yearLabel);
    }
    return labelParts.join(' / ');
  }

  function ensureBatchGroup(groupStore, classification, item) {
    if (!groupStore.has(classification.key)) {
      groupStore.set(classification.key, {
        kind: classification.kind,
        issueType: classification.issueType || '',
        key: classification.key,
        label: classification.label,
        description: classification.kind === 'issue' ? ISSUE_DESCRIPTIONS[classification.issueType] : '',
        requiredQuantity: 0,
        completedQuantity: 0,
        remainingQuantity: 0,
        matchingLineCount: 0,
        orderIds: new Set(),
        productDefinitionId: item.productDefinitionId,
        ornamentType: item.ornamentType,
        size: item.size,
        treeColor: item.treeColor,
        bowColor: item.bowColor,
        year: item.year
      });
    }

    return groupStore.get(classification.key);
  }

  function finalizeBatchGroups(groups, sorter) {
    return groups
      .map((group) => ({
        ...group,
        orderCount: group.orderIds.size
      }))
      .sort(sorter);
  }

  function classificationMatchesGroup(classification, group) {
    return Boolean(classification && group && classification.key === group.key && classification.kind === group.kind);
  }

  function getPrimaryOpenFlagMessage(record, item) {
    const flags = [
      ...getOrderOpenFlags(record),
      ...(Array.isArray(item.openFlags) ? item.openFlags : [])
    ];
    const flagged = flags.find((flag) => asTrimmedString(flag && flag.message));
    return flagged ? asTrimmedString(flagged.message) : '';
  }

  function buildConciseProductionIdentifier(structured, configurationSnapshot, item, year) {
    const familyName = firstNonEmpty([
      structured.family_name,
      configurationSnapshot.familyName,
      configurationSnapshot.family_name,
      configurationSnapshot.lastName,
      configurationSnapshot.last_name,
      item?.familyName
    ]);
    const babyName = firstNonEmpty([configurationSnapshot.babyName, configurationSnapshot.baby_name]);
    const edgeText = firstNonEmpty([configurationSnapshot.edgeText, configurationSnapshot.edge_text]);
    const letter = firstNonEmpty([configurationSnapshot.letter, structured.letter]);
    const name = firstNonEmpty([configurationSnapshot.name, structured.name]);
    const veteranName = firstNonEmpty([configurationSnapshot.veteranName, configurationSnapshot.veteran_name]);
    const rank = firstNonEmpty([configurationSnapshot.rank, configurationSnapshot.veteranRank]);

    if (letter && name) {
      return `${letter} • ${name}`;
    }
    if (familyName && year) {
      return `${familyName} • ${year}`;
    }

    return firstNonEmpty([
      familyName,
      babyName,
      edgeText,
      veteranName && rank ? `${veteranName} • ${rank}` : '',
      veteranName,
      name,
      letter,
      year
    ]);
  }

  function inferCategoryFromProduct(productDefinitionId) {
    if (['classic_family_sign', 'family_cutting_board', 'live_edge_family_sign'].includes(productDefinitionId)) {
      return 'sign';
    }
    if (productDefinitionId === 'custom_request') {
      return 'custom';
    }
    return productDefinitionId ? 'ornament' : '';
  }

  function inferLegacyOrnamentType(productDefinitionId, category) {
    if (category === 'ornament') {
      return productDefinitionId;
    }
    return category;
  }

  function isApplicableDimension(productDefinitionId, dimension) {
    const allowed = APPLICABLE_DIMENSIONS[normalizeFilterValue(productDefinitionId)];
    return allowed ? allowed.has(dimension) : true;
  }

  function getProductionStatusLabel(status) {
    const normalized = normalizeFilterValue(status);
    if (normalized === 'in_production') {
      return 'In Production';
    }
    if (normalized === 'complete') {
      return 'Complete';
    }
    if (normalized === 'blocked') {
      return 'Blocked';
    }
    if (normalized === 'cancelled') {
      return 'Cancelled';
    }
    return 'Pending';
  }

  function getFulfillmentLabel(value) {
    return normalizeFilterValue(value) === 'pickup' ? 'Pickup' : 'Shipping';
  }

  function getSyncStatusLabel(value) {
    const normalized = normalizeFilterValue(value);
    if (normalized === 'synced') {
      return 'Synced';
    }
    if (normalized === 'syncing') {
      return 'Syncing';
    }
    if (normalized === 'error') {
      return 'Upload Problem';
    }
    return 'Pending Upload';
  }

  function getRecordSyncStatusValue(record) {
    if (syncStatusModule && typeof syncStatusModule.deriveRecordSyncState === 'function') {
      const derivedState = syncStatusModule.deriveRecordSyncState(record);
      if (derivedState.key === 'synced') {
        return 'synced';
      }
      if (derivedState.key === 'problem') {
        return 'error';
      }
      if (derivedState.key === 'syncing') {
        return 'syncing';
      }
      return 'pending';
    }

    return normalizeFilterValue(record && record.sync_status);
  }

  function getOrnamentTypeLabel(value, productDisplayName, category) {
    if (category !== 'ornament') {
      return formatGenericLabel(value || category);
    }
    return ORNAMENT_TYPE_LABELS[normalizeFilterValue(value)] || productDisplayName || formatGenericLabel(value);
  }

  function getProductDisplayName(productDefinitionId) {
    const normalized = normalizeFilterValue(productDefinitionId);
    return PRODUCT_DISPLAY_NAMES[normalized] || productDefinitionId;
  }

  function getDimensionProperty(dimension) {
    const mapping = {
      product: 'productDefinitionId',
      ornamentType: 'ornamentType',
      size: 'size',
      treeColor: 'treeColor',
      bowColor: 'bowColor',
      year: 'year',
      productionStatus: 'productionStatus'
    };
    return mapping[dimension] || dimension;
  }

  function getDimensionValue(attributes, dimension) {
    if (!attributes) {
      return '';
    }
    if (dimension === 'productionStatus') {
      return attributes.productionStatus;
    }
    return attributes[getDimensionProperty(dimension)];
  }

  function getDimensionLabel(attributes, dimension) {
    if (!attributes) {
      return '';
    }
    if (dimension === 'product') {
      return attributes.productDisplayName;
    }
    if (dimension === 'ornamentType') {
      return attributes.ornamentTypeLabel;
    }
    if (dimension === 'size') {
      return attributes.sizeLabel;
    }
    if (dimension === 'treeColor') {
      return attributes.treeColorLabel;
    }
    if (dimension === 'bowColor') {
      return attributes.bowColorLabel;
    }
    if (dimension === 'year') {
      return attributes.yearLabel;
    }
    if (dimension === 'productionStatus') {
      return attributes.productionStatusLabel;
    }
    return '';
  }

  function formatFilterLabel(dimension, value) {
    if (dimension === 'orderScope') {
      if (value === 'active') {
        return 'Active';
      }
      if (value === 'cancelled') {
        return 'Cancelled';
      }
      if (value === 'test_orders') {
        return 'Test Orders';
      }
    }
    if (dimension === 'product') {
      return getProductDisplayName(value);
    }
    if (dimension === 'ornamentType') {
      return getOrnamentTypeLabel(value, '', value === 'ornament' ? 'ornament' : value);
    }
    if (dimension === 'fulfillment') {
      return getFulfillmentLabel(value);
    }
    if (dimension === 'openFlags') {
      return value === 'with_flags' ? 'With Flags' : 'Without Flags';
    }
    if (dimension === 'syncStatus') {
      return getSyncStatusLabel(value);
    }
    if (dimension === 'productionStatus') {
      return getProductionStatusLabel(value);
    }
    if (dimension === 'tray') {
      return normalizeFilterValue(value) === 'unassigned' ? 'No Tray Assigned' : `Tray ${asTrimmedString(value)}`;
    }
    if (dimension === 'event') {
      return asTrimmedString(value);
    }
    if (dimension === 'year') {
      return asTrimmedString(value);
    }
    return formatGenericLabel(value);
  }

  function formatGenericLabel(value) {
    return asTrimmedString(value)
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(capitalizeWord)
      .join(' ');
  }

  function getDisplayLabel(value) {
    const normalized = asTrimmedString(value);
    return normalized ? formatGenericLabel(normalized) : '';
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
      const sizeRank = { small: 1, large: 2 };
      const leftRank = sizeRank[normalizeFilterValue(left.value)] || 99;
      const rightRank = sizeRank[normalizeFilterValue(right.value)] || 99;
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
    if (dimension === 'tray') {
      const leftTray = normalizeTrayNumber(left.value);
      const rightTray = normalizeTrayNumber(right.value);
      if (leftTray && rightTray && leftTray !== rightTray) {
        return leftTray - rightTray;
      }
      if (!leftTray && rightTray) {
        return 1;
      }
      if (leftTray && !rightTray) {
        return -1;
      }
    }
    return left.label.localeCompare(right.label);
  }

  function compareReadyBatchGroups(left, right) {
    const byLabel = left.label.localeCompare(right.label);
    if (byLabel !== 0) {
      return byLabel;
    }
    return left.remainingQuantity - right.remainingQuantity;
  }

  function compareIssueBatchGroups(left, right) {
    const leftPriority = ISSUE_PRIORITY.indexOf(left.issueType);
    const rightPriority = ISSUE_PRIORITY.indexOf(right.issueType);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.label.localeCompare(right.label);
  }

  function compareBatchRows(left, right) {
    const leftTray = normalizeTrayNumber(left?.trayNumber);
    const rightTray = normalizeTrayNumber(right?.trayNumber);
    if (leftTray && rightTray && leftTray !== rightTray) {
      return leftTray - rightTray;
    }
    if (leftTray && !rightTray) {
      return -1;
    }
    if (!leftTray && rightTray) {
      return 1;
    }

    const byOrderReference = asTrimmedString(left?.orderReference).localeCompare(asTrimmedString(right?.orderReference));
    if (byOrderReference !== 0) {
      return byOrderReference;
    }

    return (left?.lineOrder || 0) - (right?.lineOrder || 0);
  }

  function normalizeTraySearchValue(value) {
    const trayNumber = normalizeTrayNumber(value);
    return trayNumber ? `tray ${trayNumber}` : 'no tray assigned';
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

  function normalizeOptionalCount(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function deriveReadyToPackCounts(record) {
    return getRecordItems(record).reduce((summary, item) => {
      const itemStatus = normalizeItemProductionStatus(item);
      if (itemStatus === 'cancelled') {
        return summary;
      }

      const quantity = normalizeQuantity(item.quantity);
      const completedQuantity = normalizeCompletedQuantity(item.completed_quantity, quantity, itemStatus);

      summary.totalItemCount += quantity;
      summary.completedItemCount += completedQuantity;
      if (itemStatus === 'blocked' || completedQuantity !== quantity || itemHasAnyOpenFlags(item)) {
        summary.allRequiredItemsComplete = false;
      }
      return summary;
    }, {
      totalItemCount: 0,
      completedItemCount: 0,
      allRequiredItemsComplete: true
    });
  }

  function normalizeCompletedQuantity(value, quantity, explicitStatus = '') {
    if (Number.isInteger(value)) {
      return Math.max(0, Math.min(value, quantity));
    }
    return normalizeItemProductionStatus(explicitStatus) === 'complete' ? quantity : 0;
  }

  function hasActiveTrayAssignment(record) {
    return normalizeTrayNumber(record && record.current_tray_number) > 0;
  }

  function normalizeTrayNumber(value) {
    const parsed = Number.parseInt(asTrimmedString(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  function normalizeLifecycleStatus(value) {
    return asTrimmedString(value).toLowerCase();
  }

  function isActiveScopeRecord(record) {
    return ['submitted', 'tray_assigned', 'in_production', 'ready_to_pack'].includes(normalizeLifecycleStatus(record?.production_status));
  }

  function normalizeItemProductionStatus(item) {
    const rawStatus = asTrimmedString(item && (item.production_status || item.structured_attributes?.production_status)).toLowerCase();
    if (rawStatus === 'not_started') {
      return 'pending';
    }
    return rawStatus || 'pending';
  }

  function getReadyTimestamp(record) {
    const readyAt = Date.parse(record?.ready_to_pack_at || '');
    if (Number.isFinite(readyAt) && readyAt > 0) {
      return readyAt;
    }
    return Date.parse(record?.submitted_at || '') || 0;
  }

  function compareReadyToPackOrders(left, right) {
    const leftTimestamp = getReadyTimestamp(left);
    const rightTimestamp = getReadyTimestamp(right);
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }
    return getShortOrderReference(left).localeCompare(getShortOrderReference(right));
  }

  function firstNonEmpty(values) {
    const source = Array.isArray(values) ? values : [];
    for (const value of source) {
      const normalized = asTrimmedString(value);
      if (normalized) {
        return normalized;
      }
    }
    return '';
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  return {
    buildProductionBatchGroups,
    buildProductionBatchRows,
    buildReadyToPackItemSummaries,
    classifyProductionItem,
    createEmptyOrderFilters,
    createOrderSearchDocument,
    derivePhysicalPieceCounts,
    filterLocalOrders,
    filterReadyToPackOrders,
    getAvailableOrderFilters,
    getMatchingOrderItems,
    getShortOrderReference,
    isLocalOrdersQueueEnabled,
    isOrderEligibleForReadyToPack,
    itemMatchesProductionFilters,
    normalizeProductionItemAttributes,
    shouldCreateStaffOrdersUi,
    sortLocalOrdersNewestFirst,
    sortProductionBatchRows,
    sortReadyToPackOrders,
    summarizeLocalOrders
  };
}));
