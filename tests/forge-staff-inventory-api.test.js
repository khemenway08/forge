const test = require('node:test');
const assert = require('node:assert/strict');
const inventoryApi = require('../public/js/forge-staff-inventory-api.js');

function jsonResponse(status, payload) {
  return { status, ok: status >= 200 && status < 300, async text() { return JSON.stringify(payload); } };
}

test('inventory API preserves Not Counted and an unambiguous initial-count movement', async () => {
  const requests = [];
  const client = inventoryApi.createForgeStaffInventoryApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(200, { data: { inventory: {
        subject_type: 'catalog_hat', subject_id: 'hat-1', counted: true, on_hand_quantity: 0, version: 1,
        movements: [{ id: 'move-1', movement_type: 'count', reason_code: 'initial_count', quantity_before: null, quantity_after: 0, quantity_delta: null, created_at: '2026-08-21 12:00:00.000000' }]
      } } });
    }
  });
  const result = await client.adjustSubjectInventory({ subject_type: 'catalog_hat', subject_id: 'hat-1', expected_quantity: null, expected_version: 0, target_quantity: 0, reason_code: 'initial_count', note: '' });
  assert.equal(result.inventory.counted, true);
  assert.equal(result.inventory.on_hand_quantity, 0);
  assert.equal(result.inventory.movements[0].quantity_before, null);
  assert.equal(result.inventory.movements[0].quantity_delta, null);
  assert.equal(requests[0].url, '/api/v1/staff/inventory/stock.php');
  assert.deepEqual(JSON.parse(requests[0].options.body), { subject_type: 'catalog_hat', subject_id: 'hat-1', expected_quantity: null, expected_version: 0, target_quantity: 0, reason_code: 'initial_count', note: '' });
});

test('inventory API reads a subject snapshot and preserves Not Counted', async () => {
  const client = inventoryApi.createForgeStaffInventoryApiClient({
    fetchImpl: async (url, options) => {
      assert.match(url, /subject_type=catalog_hat/);
      assert.match(url, /subject_id=hat-2/);
      assert.equal(options.method, 'GET');
      return jsonResponse(200, { data: { inventory: { subject_type: 'catalog_hat', subject_id: 'hat-2', counted: false, on_hand_quantity: null, version: 0, movements: [] } } });
    }
  });
  const result = await client.getSubjectInventory('catalog_hat', 'hat-2');
  assert.equal(result.inventory.counted, false);
  assert.equal(result.inventory.on_hand_quantity, null);
  assert.equal(result.inventory.version, 0);
});

test('inventory conflict exposes the safe reload message', async () => {
  const client = inventoryApi.createForgeStaffInventoryApiClient({
    fetchImpl: async () => jsonResponse(409, { error: { code: 'inventory_conflict', message: 'This inventory record was updated elsewhere. Reload and try again.' } })
  });
  await assert.rejects(() => client.getSubjectInventory('catalog_hat', 'hat-3'), (error) => error.code === 'inventory_conflict');
});

test('location inventory preserves explicit assignment, Not Counted, partial totals, and confirmed zero', () => {
  const inventory = inventoryApi.normalizeLocationInventory({
    subject_type: 'catalog_finished_hat', subject_id: 'finished-1', completeness: 'partial',
    assigned_location_count: 2, counted_location_count: 1, not_counted_location_count: 1, derived_quantity: 0,
    balances: [
      { inventory_location_id: 'hilltop', location_name: 'Hilltop', on_hand_quantity: 0, version: 1 },
      { inventory_location_id: 'boutique', location_name: 'Boutique', on_hand_quantity: null, version: 0 }
    ]
  });
  assert.equal(inventory.completeness, 'partial');
  assert.equal(inventory.derived_quantity, 0);
  assert.equal(inventory.balances[0].on_hand_quantity, 0);
  assert.equal(inventory.balances[1].on_hand_quantity, null);
});

test('finished hat catalog inventory uses one batch request and preserves Not Counted summaries', async () => {
  const requests = [];
  const client = inventoryApi.createForgeStaffInventoryApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(200, { data: {
        locations: [{ id: 'hilltop', location_code: 'hilltop_internal', location_name: 'Hilltop', status: 'active' }],
        inventories: {
          'finished-1': { subject_type: 'catalog_finished_hat', subject_id: 'finished-1', completeness: 'complete', assigned_location_count: 1, counted_location_count: 1, not_counted_location_count: 0, derived_quantity: 3 },
          'finished-2': { subject_type: 'catalog_finished_hat', subject_id: 'finished-2', completeness: 'not_counted', assigned_location_count: 0, counted_location_count: 0, not_counted_location_count: 0, derived_quantity: null }
        }
      } });
    }
  });

  const result = await client.getFinishedHatCatalogInventory(['finished-1', 'finished-2', 'finished-1']);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /finished-hat-catalog\.php\?subject_id\[]=finished-1&subject_id\[]=finished-2/);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(result.locations[0].location_name, 'Hilltop');
  assert.equal(result.inventories['finished-1'].derived_quantity, 3);
  assert.equal(result.inventories['finished-2'].derived_quantity, null);
  assert.equal(result.inventories['finished-2'].completeness, 'not_counted');
});
