const test = require('node:test');
const assert = require('node:assert/strict');

const materialCatalogApiModule = require('../public/js/forge-staff-material-catalog-api.js');

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('listMaterials sends GET and same-origin credentials and returns materials safely', async () => {
  const requests = [];
  const client = materialCatalogApiModule.createForgeStaffMaterialCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          materials: [{ id: 'mat-1', material_name: 'Brushed Stainless Black Acrylic' }]
        }
      });
    }
  });

  const result = await client.listMaterials();

  assert.equal(result.ok, true);
  assert.equal(result.materials[0].material_name, 'Brushed Stainless Black Acrylic');
  assert.equal(requests[0].url, '/api/v1/staff/catalog/materials.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('createMaterial sends POST JSON and updateMaterial targets the approved endpoint', async () => {
  const requests = [];
  const client = materialCatalogApiModule.createForgeStaffMaterialCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(url.includes('material.php') ? 200 : 201, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          material: {
            id: '123e4567-e89b-42d3-a456-426614174abc',
            material_name: 'Brushed Stainless Black Acrylic'
          }
        }
      });
    }
  });

  await client.createMaterial({
    material_name: 'Brushed Stainless Black Acrylic',
    material_type: 'Acrylic',
    color: 'Brushed Stainless / Black',
    supplier: '',
    production_method: 'Laserable',
    purchase_cost: '12.50',
    purchase_quantity: '5',
    cost_basis: 'per_sheet',
    status: 'review',
    notes: ''
  });
  await client.updateMaterial('123e4567-e89b-42d3-a456-426614174abc', {
    material_name: 'Brushed Stainless Black Acrylic',
    material_type: 'Acrylic',
    color: 'Brushed Stainless / Black',
    supplier: '',
    production_method: 'Laserable',
    purchase_cost: '12.50',
    purchase_quantity: '5',
    cost_basis: 'per_sheet',
    status: 'active',
    notes: ''
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/materials.php');
  assert.equal(requests[1].url, '/api/v1/staff/catalog/material.php?id=123e4567-e89b-42d3-a456-426614174abc');
});

test('uploadSwatch sends POST form data and malformed responses stay safe', async () => {
  const requests = [];
  const fakeFormData = {
    entries: [],
    append(key, value) {
      this.entries.push([key, value]);
    }
  };
  const client = materialCatalogApiModule.createForgeStaffMaterialCatalogApiClient({
    formDataFactory: () => fakeFormData,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          material: {
            id: 'mat-1',
            material_name: 'Brushed Stainless Black Acrylic',
            swatch_path: '/uploads/material-swatches/material-a1b2c3.png',
            image_width: 1000,
            image_height: 1000
          }
        }
      });
    }
  });

  const result = await client.uploadSwatch('mat-1', { name: 'swatch.png' });

  assert.equal(result.ok, true);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/material-swatch.php');
  assert.deepEqual(fakeFormData.entries, [
    ['material_id', 'mat-1'],
    ['swatch', { name: 'swatch.png' }]
  ]);

  const brokenClient = materialCatalogApiModule.createForgeStaffMaterialCatalogApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async json() {
        throw new Error('bad');
      }
    })
  });

  await assert.rejects(
    () => brokenClient.listMaterials(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.message, 'The material library returned an unexpected response.');
      return true;
    }
  );
});
