const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../public/js/forge-product-catalog.js');

const activeProducts = [
  {
    label: 'Tree Ornament',
    uiId: 'tree_ornament',
    canonicalId: 'tree_ornament',
    pricingMode: 'size_based',
    sizePrices: { Small: 26, Large: 30 }
  },
  {
    label: 'Antler Ornament',
    uiId: 'antler_ornament',
    canonicalId: 'antler_ornament',
    pricingMode: 'size_based',
    sizePrices: { Small: 26, Large: 30 }
  },
  {
    label: 'Baby’s First Christmas',
    uiId: 'babys_first_christmas',
    canonicalId: 'babys_first_christmas',
    pricingMode: 'fixed',
    fixedPrice: 28
  },
  {
    label: 'Mr. & Mrs. Christmas',
    uiId: 'mr_and_mrs_first_christmas',
    canonicalId: 'mr_and_mrs_christmas',
    pricingMode: 'fixed',
    fixedPrice: 28
  },
  {
    label: 'Little Reindeer Letter Ornament',
    uiId: 'reindeer',
    canonicalId: 'little_reindeer_letter',
    pricingMode: 'fixed',
    fixedPrice: 15
  },
  {
    label: 'Present Stack Ornament',
    uiId: 'present_stack',
    canonicalId: 'present_stack',
    pricingMode: 'fixed',
    fixedPrice: 30
  },
  {
    label: 'Grinch Tree Ornament',
    uiId: 'grinch_tree',
    canonicalId: 'grinch_tree',
    pricingMode: 'fixed',
    fixedPrice: 30
  },
  {
    label: 'Veteran Flag Ornament',
    uiId: 'veteran_flag',
    canonicalId: 'veteran_flag',
    pricingMode: 'fixed',
    fixedPrice: 25
  },
  {
    label: 'Classic Family Sign',
    uiId: 'classic_family_sign',
    canonicalId: 'classic_family_sign',
    pricingMode: 'fixed',
    fixedPrice: 84.99
  },
  {
    label: 'Family Cutting Board',
    uiId: 'family_cutting_board',
    canonicalId: 'family_cutting_board',
    pricingMode: 'fixed',
    fixedPrice: 39.99
  },
  {
    label: 'Live Edge Family Sign',
    uiId: 'live_edge_family_sign',
    canonicalId: 'live_edge_family_sign',
    pricingMode: 'fixed',
    fixedPrice: 54.99
  },
  {
    label: 'Custom Request',
    uiId: 'custom_request',
    canonicalId: 'custom_request',
    pricingMode: 'quote_required',
    fixedPrice: null
  }
];

test('every active product resolves from current UI ids and canonical ids', () => {
  activeProducts.forEach((product) => {
    const fromUiId = catalog.getProductDefinition(product.uiId);
    const fromCanonicalId = catalog.getProductDefinition(product.canonicalId);

    assert.ok(fromUiId, `${product.label} should resolve from UI id`);
    assert.ok(fromCanonicalId, `${product.label} should resolve from canonical id`);
    assert.equal(fromUiId.definitionId, product.canonicalId);
    assert.equal(fromCanonicalId.definitionId, product.canonicalId);
    assert.equal(fromUiId.pricingMode, product.pricingMode);
    assert.equal(catalog.getUiProductDefinitionId(product.uiId), product.uiId);
    assert.equal(catalog.getUiProductDefinitionId(product.canonicalId), product.uiId);
  });
});

test('app-style pricing helper calls return valid values for every active product', () => {
  activeProducts.forEach((product) => {
    if (product.pricingMode === 'size_based') {
      assert.equal(
        catalog.getFinalUnitPriceDollars(product.uiId, { size: 'Small', orderItems: [] }),
        product.sizePrices.Small,
        `${product.label} should return a valid Small price`
      );
      assert.equal(
        catalog.getFinalUnitPriceDollars(product.canonicalId, { size: 'Large', orderItems: [] }),
        product.sizePrices.Large,
        `${product.label} should return a valid Large price`
      );
      return;
    }

    if (product.pricingMode === 'quote_required') {
      assert.equal(catalog.getFinalUnitPriceCents(product.uiId, { orderItems: [] }), null);
      assert.equal(catalog.getFinalUnitPriceDollars(product.uiId, { orderItems: [] }), null);
      return;
    }

    const uiPrice = catalog.getFinalUnitPriceDollars(product.uiId, { size: '', orderItems: [] });
    const canonicalPrice = catalog.getFinalUnitPriceDollars(product.canonicalId, { size: '', orderItems: [] });

    assert.equal(uiPrice, product.fixedPrice, `${product.label} should return the expected UI-id price`);
    assert.equal(canonicalPrice, product.fixedPrice, `${product.label} should return the expected canonical-id price`);
    assert.equal(Number.isFinite(uiPrice), true, `${product.label} should return a finite price`);
    assert.equal(Number.isNaN(uiPrice), false, `${product.label} should not return NaN`);
  });
});

test('reindeer aliases and quantity discounts work with the exact app helper call shape', () => {
  assert.equal(catalog.getFinalUnitPriceDollars('reindeer', {
    size: '',
    orderItems: [],
    includeCurrentDraft: true,
    currentDraftQuantity: 1
  }), 15);

  assert.equal(catalog.getFinalUnitPriceDollars('reindeer', {
    size: '',
    orderItems: [],
    includeCurrentDraft: true,
    currentDraftQuantity: 2
  }), 13);

  assert.equal(catalog.getFinalUnitPriceDollars('little_reindeer_letter', {
    size: '',
    orderItems: [
      { productDefinitionId: 'reindeer', quantity: 1 },
      { productDefinitionId: 'little_reindeer_letter', quantity: 1 }
    ]
  }), 13);
});
