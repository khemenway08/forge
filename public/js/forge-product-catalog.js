(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeProductCatalog = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRODUCT_DEFINITION_VERSION = '1.1';
  const PRODUCT_ID_ALIASES = {
    reindeer: 'little_reindeer_letter',
    mr_and_mrs_first_christmas: 'mr_and_mrs_christmas'
  };
  const UI_PRODUCT_ID_ALIASES = {
    little_reindeer_letter: 'reindeer',
    mr_and_mrs_christmas: 'mr_and_mrs_first_christmas'
  };
  const PET_ICON_DEFINITIONS = deepFreeze({
    paw: {
      key: 'paw',
      label: 'Paw Print'
    },
    dog_bone: {
      key: 'dog_bone',
      label: 'Dog Bone'
    },
    fish: {
      key: 'fish',
      label: 'Fish'
    },
    custom: {
      key: 'custom',
      label: 'Custom Icon',
      requiresDescription: true,
      createsInternalFlag: 'custom_icon'
    },
    none: {
      key: 'none',
      label: 'No Icon'
    }
  });
  const LEGACY_PET_ICON_KEYS = {
    custom_icon: 'custom',
    no_icon: 'none',
    paw_print: 'paw',
    pawprint: 'paw'
  };
  const PRODUCT_PET_ICON_KEYS = deepFreeze({
    tree_ornament: ['paw', 'dog_bone', 'fish', 'custom', 'none'],
    antler_ornament: ['paw', 'dog_bone', 'fish', 'custom', 'none'],
    present_stack: ['paw', 'dog_bone', 'fish', 'custom', 'none'],
    grinch_tree: ['paw', 'dog_bone', 'fish', 'custom', 'none']
  });

  const PRODUCT_DEFINITIONS = deepFreeze({
    tree_ornament: {
      definitionId: 'tree_ornament',
      displayName: 'Tree Ornament',
      category: 'ornament',
      pricingMode: 'size_based',
      sizePricesCents: { Small: 2600, Large: 3000 }
    },
    antler_ornament: {
      definitionId: 'antler_ornament',
      displayName: 'Antler Ornament',
      category: 'ornament',
      pricingMode: 'size_based',
      sizePricesCents: { Small: 2600, Large: 3000 }
    },
    babys_first_christmas: {
      definitionId: 'babys_first_christmas',
      displayName: "Baby's First Christmas",
      category: 'ornament',
      pricingMode: 'fixed',
      regularUnitPriceCents: 2800
    },
    mr_and_mrs_christmas: {
      definitionId: 'mr_and_mrs_christmas',
      displayName: 'Mr. & Mrs. Christmas',
      category: 'ornament',
      pricingMode: 'fixed',
      regularUnitPriceCents: 2800
    },
    little_reindeer_letter: {
      definitionId: 'little_reindeer_letter',
      displayName: 'Little Reindeer Letter Ornament',
      category: 'ornament',
      pricingMode: 'fixed',
      regularUnitPriceCents: 1500,
      discountedUnitPriceCents: 1300,
      discountMinQuantity: 2,
      discountGroup: 'little_reindeer_letter'
    },
    present_stack: {
      definitionId: 'present_stack',
      displayName: 'Present Stack Ornament',
      category: 'ornament',
      pricingMode: 'fixed',
      regularUnitPriceCents: 3000
    },
    grinch_tree: {
      definitionId: 'grinch_tree',
      displayName: 'Grinch Tree Ornament',
      category: 'ornament',
      pricingMode: 'fixed',
      regularUnitPriceCents: 3000
    },
    veteran_flag: {
      definitionId: 'veteran_flag',
      displayName: 'Veteran Flag Ornament',
      category: 'ornament',
      pricingMode: 'fixed',
      regularUnitPriceCents: 2500
    },
    classic_family_sign: {
      definitionId: 'classic_family_sign',
      displayName: 'Classic Family Sign',
      category: 'sign',
      pricingMode: 'fixed',
      regularUnitPriceCents: 8499
    },
    family_cutting_board: {
      definitionId: 'family_cutting_board',
      displayName: 'Family Cutting Board',
      category: 'sign',
      pricingMode: 'fixed',
      regularUnitPriceCents: 3999
    },
    live_edge_family_sign: {
      definitionId: 'live_edge_family_sign',
      displayName: 'Live Edge Family Sign',
      category: 'sign',
      pricingMode: 'fixed',
      regularUnitPriceCents: 5499
    },
    custom_request: {
      definitionId: 'custom_request',
      displayName: 'Custom Request',
      category: 'custom',
      pricingMode: 'quote_required',
      regularUnitPriceCents: null
    }
  });

  function getCanonicalProductDefinitionId(productDefinitionId) {
    const raw = asTrimmedString(productDefinitionId);
    return PRODUCT_ID_ALIASES[raw] || raw;
  }

  function getProductDefinition(productDefinitionId) {
    return PRODUCT_DEFINITIONS[getCanonicalProductDefinitionId(productDefinitionId)] || null;
  }

  function getUiProductDefinitionId(productDefinitionId) {
    const canonicalId = getCanonicalProductDefinitionId(productDefinitionId);
    return UI_PRODUCT_ID_ALIASES[canonicalId] || canonicalId;
  }

  function getPetIconDefinition(iconKey) {
    const normalizedKey = normalizePetIconKey(iconKey);
    return PET_ICON_DEFINITIONS[normalizedKey] || null;
  }

  function getPetIconLabel(iconKey) {
    const definition = getPetIconDefinition(iconKey);
    return definition ? definition.label : '';
  }

  function getPetIconOptions(productDefinitionId) {
    const canonicalId = getCanonicalProductDefinitionId(productDefinitionId);
    const optionKeys = PRODUCT_PET_ICON_KEYS[canonicalId];
    if (!Array.isArray(optionKeys)) {
      return [];
    }

    return optionKeys
      .map((key) => getPetIconDefinition(key))
      .filter(Boolean);
  }

  function normalizePetIconKey(iconKey) {
    const normalized = asTrimmedString(iconKey).toLowerCase().replace(/\s+/g, '_');
    if (!normalized) {
      return '';
    }
    return LEGACY_PET_ICON_KEYS[normalized] || normalized;
  }

  function getRegularUnitPriceCents(productDefinitionId, options = {}) {
    const definition = getProductDefinition(productDefinitionId);
    if (!definition) {
      return null;
    }
    if (definition.pricingMode === 'quote_required') {
      return null;
    }
    if (definition.pricingMode === 'size_based') {
      const size = asTrimmedString(options.size);
      return Number.isInteger(definition.sizePricesCents[size]) ? definition.sizePricesCents[size] : null;
    }
    return definition.regularUnitPriceCents;
  }

  function getFinalUnitPriceCents(productDefinitionId, options = {}) {
    const definition = getProductDefinition(productDefinitionId);
    if (!definition) {
      return null;
    }
    if (definition.pricingMode === 'quote_required') {
      return null;
    }
    if (definition.discountGroup === 'little_reindeer_letter') {
      const totalQuantity = getQualifyingOrderQuantity(
        options.orderItems,
        definition.definitionId,
        {
          includeCurrentDraft: options.includeCurrentDraft,
          currentDraftQuantity: options.currentDraftQuantity,
          editingItemId: options.editingItemId
        }
      );
      return totalQuantity >= definition.discountMinQuantity
        ? definition.discountedUnitPriceCents
        : definition.regularUnitPriceCents;
    }
    return getRegularUnitPriceCents(productDefinitionId, options);
  }

  function getFinalUnitPriceDollars(productDefinitionId, options = {}) {
    const cents = getFinalUnitPriceCents(productDefinitionId, options);
    return Number.isInteger(cents) ? cents / 100 : null;
  }

  function getQualifyingOrderQuantity(orderItems, canonicalProductDefinitionId, options = {}) {
    const normalizedItems = Array.isArray(orderItems) ? orderItems : [];
    const matchingQuantity = normalizedItems.reduce((sum, item) => {
      if (getCanonicalProductDefinitionId(item && item.productDefinitionId) !== canonicalProductDefinitionId) {
        return sum;
      }
      return sum + normalizeQuantity(item && item.quantity);
    }, 0);
    const currentDraftQuantity = normalizeQuantity(options.currentDraftQuantity);
    const editingItemId = asTrimmedString(options.editingItemId);
    const isEditingExistingMatchingItem = editingItemId && normalizedItems.some((item) => (
      asTrimmedString(item && item.itemId) === editingItemId
      && getCanonicalProductDefinitionId(item && item.productDefinitionId) === canonicalProductDefinitionId
    ));

    if (options.includeCurrentDraft && !isEditingExistingMatchingItem) {
      return matchingQuantity + currentDraftQuantity;
    }
    return matchingQuantity;
  }

  function applyCatalogPricingToItems(items) {
    const normalizedItems = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
    return normalizedItems.map((item) => {
      const definition = getProductDefinition(item.productDefinitionId);
      if (!definition || definition.pricingMode === 'quote_required') {
        return item;
      }
      const finalUnitPriceCents = getFinalUnitPriceCents(item.productDefinitionId, {
        size: item.size || item.configurationSnapshot?.size,
        orderItems: normalizedItems
      });
      if (!Number.isInteger(finalUnitPriceCents)) {
        return item;
      }
      return {
        ...item,
        unitPrice: finalUnitPriceCents / 100
      };
    });
  }

  function normalizeQuantity(value) {
    return Number.isInteger(value) && value > 0 ? value : 1;
  }

  function asTrimmedString(value) {
    return value == null ? '' : String(value).trim();
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    Object.keys(value).forEach((key) => {
      deepFreeze(value[key]);
    });
    return value;
  }

  return {
    PRODUCT_DEFINITION_VERSION,
    PRODUCT_DEFINITIONS,
    PRODUCT_ID_ALIASES,
    PRODUCT_PET_ICON_KEYS,
    UI_PRODUCT_ID_ALIASES,
    applyCatalogPricingToItems,
    getCanonicalProductDefinitionId,
    getFinalUnitPriceCents,
    getFinalUnitPriceDollars,
    getPetIconDefinition,
    getPetIconLabel,
    getPetIconOptions,
    getProductDefinition,
    getUiProductDefinitionId,
    getQualifyingOrderQuantity,
    getRegularUnitPriceCents,
    normalizePetIconKey
  };
}));
