(function (root, factory) {
  const productCatalog = typeof module === 'object' && module.exports
    ? require('./forge-product-catalog.js')
    : root.ForgeProductCatalog;
  const api = factory(productCatalog);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeOrderPayloadBuilder = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (productCatalog) {
  const PAYLOAD_SCHEMA_VERSION = '1.0';
  const TRANSIENT_SNAPSHOT_KEYS = new Set([
    'previewurl',
    'objecturl',
    'bloburl',
    'temporaryurl',
    'uploadpreview'
  ]);

  if (!productCatalog) {
    throw new Error('Forge product catalog is required before the payload builder can run.');
  }

  function buildForgeOrderPayload(orderState, context) {
    validateBuilderInputs(orderState, context);

    const builtAtIso = normalizeIsoDate(context.builtAt, 'builtAt');
    const submittedAtIso = context.submittedAt == null ? null : normalizeIsoDate(context.submittedAt, 'submittedAt');
    const source = context.source || 'customer_kiosk';
    const orderStatus = context.orderStatus || 'draft';
    const canonicalItemsInput = getOrderItemsFromState(orderState);
    const canonicalItems = canonicalItemsInput.map((item, index) => normalizeLineItem(item, index, orderState, context));
    const itemFlags = canonicalItems.flatMap((item) => item.open_flags);
    const topLevelFlags = dedupeOrderFlags(itemFlags);
    const pricing = buildOrderPricing(canonicalItems, orderState);

    return {
      payload_type: 'forge_order',
      schema_version: PAYLOAD_SCHEMA_VERSION,
      forge_order_uuid: context.forgeOrderUuid,
      forge_order_number: context.forgeOrderNumber || null,
      order_status: orderStatus,
      source,
      built_at: builtAtIso,
      submitted_at: submittedAtIso,
      device_id: context.deviceId || null,
      event: normalizeEvent(context.event),
      currency: 'USD',
      customer: buildCustomerPayload(orderState.customerDraft || {}),
      fulfillment: buildFulfillmentPayload(orderState.customerDraft || {}),
      items: canonicalItems,
      pricing,
      open_flags: topLevelFlags,
      has_open_flags: topLevelFlags.length > 0
    };
  }

  function validateBuilderInputs(orderState, context) {
    if (!orderState || typeof orderState !== 'object') {
      throw new Error('buildForgeOrderPayload requires a usable orderState object.');
    }
    if (!context || typeof context !== 'object') {
      throw new Error('buildForgeOrderPayload requires a builder context object.');
    }
    if (!isNonEmptyString(context.forgeOrderUuid)) {
      throw new Error('buildForgeOrderPayload requires forgeOrderUuid.');
    }
    normalizeIsoDate(context.builtAt, 'builtAt');
    getOrderItemsFromState(orderState);
  }

  function getOrderItemsFromState(orderState) {
    const items = Array.isArray(orderState.items)
      ? orderState.items
      : Array.isArray(orderState.orderItems)
        ? orderState.orderItems
        : Array.isArray(orderState.cartItems)
          ? orderState.cartItems
          : null;

    if (!items) {
      throw new Error('Order state must include items, orderItems, or cartItems as an array.');
    }

    return items;
  }

  function normalizeLineItem(item, index, orderState, context) {
    if (!item || typeof item !== 'object') {
      throw new Error(`Order item at position ${index + 1} is structurally unusable.`);
    }

    const rawProductDefinitionId = asTrimmedString(item.productDefinitionId);
    const definition = productCatalog.getProductDefinition(rawProductDefinitionId);

    if (!definition) {
      throw new Error(`Unknown product-definition ID: ${rawProductDefinitionId || '(missing)'}.`);
    }

    const quantity = normalizeQuantity(item.quantity);
    const definitionId = definition.definitionId;
    const configurationSnapshot = normalizeConfigurationSnapshot(item);
    const personalizationOrder = normalizePersonalizationOrder(item);
    const pricing = normalizeLinePricing({
      item,
      definitionId,
      quantity,
      orderItems: getOrderItemsFromState(orderState)
    });
    const lineNumber = index + 1;
    const lineId = getLineId(item, lineNumber, context.forgeOrderUuid);
    const fulfillmentMethod = normalizeFulfillmentMethod(orderState.customerDraft || {});
    const structuredAttributes = buildStructuredAttributes({
      definition,
      definitionId,
      item,
      configurationSnapshot,
      personalizationOrder,
      fulfillmentMethod,
      event: context.event || null
    });
    const openFlags = buildLineOpenFlags({
      definitionId,
      lineId,
      personalizationOrder,
      pricing
    });

    structuredAttributes.has_open_flags = openFlags.length > 0;

    return {
      line_id: lineId,
      line_number: lineNumber,
      quantity,
      product_definition_id: definitionId,
      product_display_name: asTrimmedString(item.displayName) || definition.displayName,
      product_category: asTrimmedString(item.category) || definition.category,
      product_definition_version: productCatalog.PRODUCT_DEFINITION_VERSION,
      pricing,
      configuration_snapshot: configurationSnapshot,
      personalization_order: personalizationOrder,
      structured_attributes: structuredAttributes,
      open_flags: openFlags,
      customer_note: asNullableTrimmedString(item.customerNote),
      production_note: null
    };
  }

  /**
   * Creates a JSON-safe historical configuration snapshot while removing
   * temporary UI-only fields, browser objects, and transient blob preview URLs.
   *
   * @param {Object} item
   * @returns {Object}
   */
  function normalizeConfigurationSnapshot(item) {
    const source = item.configurationSnapshot && typeof item.configurationSnapshot === 'object'
      ? item.configurationSnapshot
      : buildDerivedConfigurationSnapshot(item);
    const sanitized = sanitizeConfigurationSnapshotValue(source);
    return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : {};
  }

  function buildDerivedConfigurationSnapshot(item) {
    const derived = {};
    const scalarFields = ['size', 'treeColor', 'bowColor', 'familyName', 'year', 'personalizationMode', 'edgeText'];
    scalarFields.forEach((key) => {
      if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
        derived[key] = item[key];
      }
    });
    if (Array.isArray(item.orderedEntries) && item.orderedEntries.length > 0) {
      derived.entries = item.orderedEntries;
    }
    return derived;
  }

  function sanitizeConfigurationSnapshotValue(value, key) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (isTransientSnapshotKey(key)) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value.trim().toLowerCase().startsWith('blob:') ? undefined : value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      return undefined;
    }
    if (Array.isArray(value)) {
      const output = [];
      value.forEach((entry) => {
        const sanitizedEntry = sanitizeConfigurationSnapshotValue(entry);
        if (sanitizedEntry !== undefined) {
          output.push(sanitizedEntry);
        }
      });
      return output;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
    }
    if (isDomLikeObject(value) || isEventTargetLikeObject(value) || isBlobLikeObject(value) || isFileLikeObject(value)) {
      return undefined;
    }
    if (!isPlainObject(value)) {
      return undefined;
    }

    const output = {};
    Object.keys(value).forEach((childKey) => {
      const sanitizedEntry = sanitizeConfigurationSnapshotValue(value[childKey], childKey);
      if (sanitizedEntry !== undefined) {
        output[childKey] = sanitizedEntry;
      }
    });
    return output;
  }

  function isTransientSnapshotKey(key) {
    if (!isNonEmptyString(key)) {
      return false;
    }
    return TRANSIENT_SNAPSHOT_KEYS.has(String(key).toLowerCase().replace(/[^a-z0-9]/g, ''));
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isDomLikeObject(value) {
    return Boolean(
      value
      && typeof value === 'object'
      && typeof value.nodeType === 'number'
      && typeof value.nodeName === 'string'
    );
  }

  function isEventTargetLikeObject(value) {
    return Boolean(
      value
      && typeof value === 'object'
      && typeof value.addEventListener === 'function'
      && typeof value.removeEventListener === 'function'
      && typeof value.dispatchEvent === 'function'
    );
  }

  function isBlobLikeObject(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return true;
    }
    return typeof value.arrayBuffer === 'function'
      && typeof value.stream === 'function'
      && typeof value.slice === 'function'
      && typeof value.size === 'number'
      && typeof value.type === 'string';
  }

  function isFileLikeObject(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (typeof File !== 'undefined' && value instanceof File) {
      return true;
    }
    return typeof value.name === 'string'
      && typeof value.lastModified === 'number'
      && typeof value.size === 'number'
      && typeof value.type === 'string'
      && typeof value.slice === 'function';
  }

  function normalizePersonalizationOrder(item) {
    const sourceEntries = Array.isArray(item.orderedEntries) ? item.orderedEntries : [];

    return sourceEntries.map((entry, index) => {
      const normalized = {
        position: index + 1,
        type: entry.kind === 'pet' ? 'pet' : 'person',
        name: asTrimmedString(entry.name)
      };

      if (normalized.type === 'pet') {
        normalized.pet_type = asNullableTrimmedString(entry.petType || entry.typeLabel);
        normalized.icon = normalizePetIcon(entry.icon);
        normalized.custom_icon_description = asNullableTrimmedString(entry.customIconDescription || entry.iconOther);
      }

      return normalized;
    });
  }

  function normalizePetIcon(value) {
    const icon = asNullableTrimmedString(value);
    return icon ? icon.toLowerCase().replace(/\s+/g, '_') : null;
  }

  function normalizeLinePricing({ item, definitionId, quantity, orderItems }) {
    const size = asTrimmedString(item.size || item.configurationSnapshot?.size);
    const regularUnitPriceCents = productCatalog.getRegularUnitPriceCents(definitionId, { size });
    const finalUnitPriceCents = productCatalog.getFinalUnitPriceCents(definitionId, {
      size,
      quantity,
      orderItems
    });
    const definition = productCatalog.getProductDefinition(definitionId);
    const pricingMode = definition.pricingMode;
    const requiresQuote = pricingMode === 'quote_required';

    if (requiresQuote) {
      return {
        mode: 'quote_required',
        regular_unit_price_cents: regularUnitPriceCents,
        final_unit_price_cents: null,
        line_subtotal_cents: null,
        discount_total_cents: 0,
        line_total_cents: null,
        requires_quote: true
      };
    }

    assertIntegerMoney(regularUnitPriceCents, `${definitionId} regular unit price`);
    assertIntegerMoney(finalUnitPriceCents, `${definitionId} final unit price`);

    const lineSubtotalCents = regularUnitPriceCents * quantity;
    const lineTotalCents = finalUnitPriceCents * quantity;
    const discountTotalCents = lineSubtotalCents - lineTotalCents;

    return {
      mode: pricingMode,
      regular_unit_price_cents: regularUnitPriceCents,
      final_unit_price_cents: finalUnitPriceCents,
      line_subtotal_cents: lineSubtotalCents,
      discount_total_cents: discountTotalCents,
      line_total_cents: lineTotalCents,
      requires_quote: false
    };
  }

  function buildStructuredAttributes({ definition, definitionId, item, configurationSnapshot, personalizationOrder, fulfillmentMethod, event }) {
    const familyName = firstNonEmpty([
      configurationSnapshot.family_name,
      configurationSnapshot.familyName,
      configurationSnapshot.last_name,
      configurationSnapshot.lastName,
      item.familyName
    ]);
    const yearValue = firstNonEmpty([
      configurationSnapshot.year,
      configurationSnapshot.wedding_year,
      configurationSnapshot.weddingYear,
      configurationSnapshot.established_year,
      configurationSnapshot.establishedYear,
      item.year
    ]);
    const bowColor = firstNonEmpty([
      configurationSnapshot.bow_color,
      configurationSnapshot.bowColor,
      configurationSnapshot.bow_and_stocking_color
    ]);
    const icon = firstNonEmpty([
      configurationSnapshot.icon,
      configurationSnapshot.live_edge_icon
    ]);
    const peopleCount = personalizationOrder.filter((entry) => entry.type === 'person').length;
    const petCount = personalizationOrder.filter((entry) => entry.type === 'pet').length;

    return {
      product_definition_id: definitionId,
      category: definition.category,
      ornament_type: definition.category === 'ornament' ? definitionId : null,
      size: asNullableTrimmedString(firstNonEmpty([configurationSnapshot.size, item.size])),
      tree_color: asNullableTrimmedString(firstNonEmpty([configurationSnapshot.tree_color, configurationSnapshot.treeColor, item.treeColor])),
      bow_color: asNullableTrimmedString(bowColor),
      family_name: asNullableTrimmedString(familyName),
      year: normalizeStructuredYear(yearValue),
      icon: asNullableTrimmedString(icon),
      pet_count: petCount,
      people_count: peopleCount,
      production_status: 'not_started',
      fulfillment_method: fulfillmentMethod,
      event_id: event && isNonEmptyString(event.event_id) ? event.event_id : null,
      has_open_flags: false
    };
  }

  function buildLineOpenFlags({ definitionId, lineId, personalizationOrder, pricing }) {
    const flags = [];

    personalizationOrder.forEach((entry) => {
      if (entry.type === 'pet' && entry.icon === 'custom_icon') {
        flags.push({
          code: 'custom_icon',
          scope: 'item',
          line_id: lineId,
          message: entry.custom_icon_description
            ? `Custom icon requested: ${entry.custom_icon_description}`
            : 'Custom icon requested.'
        });
      }
    });

    if (definitionId === 'custom_request') {
      flags.push({
        code: 'custom_artwork',
        scope: 'item',
        line_id: lineId,
        message: 'Custom artwork review required.'
      });
    }

    if (pricing.requires_quote) {
      flags.push({
        code: 'quote_required',
        scope: 'item',
        line_id: lineId,
        message: 'Quote required before order submission.'
      });
    }

    return dedupeFlags(flags);
  }

  function dedupeOrderFlags(itemFlags) {
    const seen = new Set();
    const flags = [];

    itemFlags.forEach((flag) => {
      const key = `${flag.code}::${flag.message}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      flags.push({
        code: flag.code,
        scope: 'order',
        line_id: null,
        message: flag.message
      });
    });

    return flags;
  }

  function dedupeFlags(flags) {
    const seen = new Set();
    return flags.filter((flag) => {
      const key = `${flag.code}::${flag.scope}::${flag.line_id || ''}::${flag.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function buildCustomerPayload(customerDraft) {
    const fullName = asTrimmedString(customerDraft.fullName);
    const { firstName, lastName } = splitFullName(fullName);

    return {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      email: asTrimmedString(customerDraft.email),
      phone: asTrimmedString(customerDraft.phone),
      preferred_contact: asNullableTrimmedString(customerDraft.preferredContact)
    };
  }

  function buildFulfillmentPayload(customerDraft) {
    const method = normalizeFulfillmentMethod(customerDraft);
    const shippingAddress = method === 'shipping'
      ? {
          address_1: asTrimmedString(customerDraft.addressLine1),
          address_2: asTrimmedString(customerDraft.addressLine2),
          city: asTrimmedString(customerDraft.city),
          state: asTrimmedString(customerDraft.state),
          postal_code: asTrimmedString(customerDraft.postalCode),
          country: asTrimmedString(customerDraft.country)
        }
      : null;

    return {
      method,
      needed_by: asNullableTrimmedString(customerDraft.neededBy),
      shipping_address: shippingAddress
    };
  }

  function buildOrderPricing(items, orderState) {
    const pricedItemSubtotalCents = items.reduce((sum, item) => sum + (item.pricing.line_subtotal_cents || 0), 0);
    const discountTotalCents = items.reduce((sum, item) => sum + item.pricing.discount_total_cents, 0);
    const pricedLineTotalCents = items.reduce((sum, item) => sum + (item.pricing.line_total_cents || 0), 0);
    const containsQuoteRequiredItem = items.some((item) => item.pricing.requires_quote);
    const shippingTotalCents = normalizeOptionalMoney(
      firstDefined([
        orderState.shippingTotalCents,
        orderState.pricing && orderState.pricing.shippingTotalCents
      ]),
      0
    );
    const taxTotalCents = normalizeOptionalMoney(
      firstDefined([
        orderState.taxTotalCents,
        orderState.pricing && orderState.pricing.taxTotalCents
      ]),
      null
    );
    const hasExplicitShipping = firstDefined([
      orderState.shippingTotalCents,
      orderState.pricing && orderState.pricing.shippingTotalCents
    ]) != null;
    const totalIsEstimated = containsQuoteRequiredItem || !hasExplicitShipping || taxTotalCents == null;
    const estimatedTotalCents = pricedLineTotalCents + shippingTotalCents + (taxTotalCents || 0);

    return {
      priced_item_subtotal_cents: pricedItemSubtotalCents,
      discount_total_cents: discountTotalCents,
      shipping_total_cents: shippingTotalCents,
      tax_total_cents: taxTotalCents,
      estimated_total_cents: estimatedTotalCents,
      contains_quote_required_item: containsQuoteRequiredItem,
      total_is_estimated: totalIsEstimated
    };
  }

  function splitFullName(fullName) {
    const trimmed = asTrimmedString(fullName);
    if (!trimmed) {
      return { firstName: '', lastName: '' };
    }
    const parts = trimmed.split(/\s+/);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ')
    };
  }

  function normalizeFulfillmentMethod(customerDraft) {
    const method = asTrimmedString(customerDraft.fulfillmentMethod).toLowerCase();
    return method === 'local pickup' || method === 'pickup' ? 'pickup' : 'shipping';
  }

  function normalizeEvent(event) {
    if (!event || typeof event !== 'object') {
      return null;
    }
    const eventId = asNullableTrimmedString(event.event_id || event.eventId);
    const eventName = asNullableTrimmedString(event.event_name || event.eventName);
    if (!eventId && !eventName) {
      return null;
    }
    return {
      event_id: eventId,
      event_name: eventName
    };
  }

  function normalizeIsoDate(value, fieldName) {
    if (value == null || value === '') {
      throw new Error(`buildForgeOrderPayload requires ${fieldName}.`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`buildForgeOrderPayload received an invalid ${fieldName} value.`);
    }
    return parsed.toISOString();
  }

  function normalizeOptionalMoney(value, fallback) {
    if (value == null || value === '') {
      return fallback;
    }
    if (Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'number') {
      return toCents(value);
    }
    throw new Error('Unsupported monetary value cannot be normalized safely.');
  }

  function normalizeQuantity(value) {
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
    return 1;
  }

  function getLineId(item, lineNumber, forgeOrderUuid) {
    const existing = asTrimmedString(item.itemId || item.lineId);
    return existing || `${forgeOrderUuid}-line-${lineNumber}`;
  }

  function normalizeStructuredYear(value) {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const stringValue = asTrimmedString(value);
    if (/^\d+$/.test(stringValue)) {
      return Number.parseInt(stringValue, 10);
    }
    return stringValue || null;
  }

  function assertIntegerMoney(value, label) {
    if (!Number.isInteger(value)) {
      throw new Error(`Unsupported monetary value cannot be normalized safely for ${label}.`);
    }
  }

  function toCents(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Unsupported monetary value cannot be normalized safely.');
    }
    const cents = Math.round(value * 100);
    if (!Number.isInteger(cents)) {
      throw new Error('Unsupported monetary value cannot be normalized safely.');
    }
    return cents;
  }

  function firstNonEmpty(values) {
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return null;
  }

  function firstDefined(values) {
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] !== undefined) {
        return values[index];
      }
    }
    return undefined;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function asNullableTrimmedString(value) {
    const normalized = asTrimmedString(value);
    return normalized ? normalized : null;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  return {
    buildForgeOrderPayload
  };
}));
