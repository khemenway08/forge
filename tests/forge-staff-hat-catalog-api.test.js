const test = require('node:test');
const assert = require('node:assert/strict');

const hatCatalogApiModule = require('../public/js/forge-staff-hat-catalog-api.js');

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('listHats sends GET and same-origin credentials and returns hats safely', async () => {
  const requests = [];
  const client = hatCatalogApiModule.createForgeStaffHatCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          hats: [{ id: 'hat-1', hat_name: 'Richardson 112 Black White' }]
        }
      });
    }
  });

  const result = await client.listHats();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.hats[0].hat_name, 'Richardson 112 Black White');
  assert.equal(requests[0].url, '/api/v1/staff/catalog/hats.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('createHat sends POST JSON and updateHat targets the approved endpoint', async () => {
  const requests = [];
  const client = hatCatalogApiModule.createForgeStaffHatCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(url.includes('hat.php') ? 200 : 201, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          hat: {
            id: '123e4567-e89b-42d3-a456-426614174abc',
            hat_name: 'Richardson 112 Navy White'
          }
        }
      });
    }
  });

  await client.createHat({
    hat_name: 'Richardson 112 Navy White',
    manufacturer: 'Richardson',
    model: '112',
    color: 'Navy / White',
    vendor: '',
    base_cost: '12.50',
    status: 'review',
    notes: ''
  });
  await client.updateHat('123e4567-e89b-42d3-a456-426614174abc', {
    hat_name: 'Richardson 112 Navy White',
    manufacturer: 'Richardson',
    model: '112',
    color: 'Navy / White',
    vendor: '',
    base_cost: '12.50',
    status: 'active',
    notes: ''
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/hats.php');
  assert.equal(requests[1].url, '/api/v1/staff/catalog/hat.php?id=123e4567-e89b-42d3-a456-426614174abc');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    hat_name: 'Richardson 112 Navy White',
    manufacturer: 'Richardson',
    model: '112',
    color: 'Navy / White',
    vendor: '',
    base_cost: '12.50',
    status: 'review',
    notes: ''
  });
});

test('reorderHats sends the approved shared reorder payload', async () => {
  const requests = [];
  const client = hatCatalogApiModule.createForgeStaffHatCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          resource_type: 'hats',
          records: [
            { id: 'hat-2', sort_order: 1000 },
            { id: 'hat-1', sort_order: 2000 }
          ]
        }
      });
    }
  });

  const result = await client.reorderHats(['hat-2', 'hat-1']);

  assert.equal(result.ok, true);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/reorder.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    resource_type: 'hats',
    ordered_ids: ['hat-2', 'hat-1']
  });
});

test('uploadPhoto sends POST form data and malformed responses stay safe', async () => {
  const requests = [];
  const fakeFormData = {
    entries: [],
    append(key, value) {
      this.entries.push([key, value]);
    }
  };
  const client = hatCatalogApiModule.createForgeStaffHatCatalogApiClient({
    formDataFactory: () => fakeFormData,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          hat: {
            id: 'hat-1',
            hat_name: 'Richardson 112 Navy White',
            photo_path: '/uploads/hat-photos/hat-a1b2c3.png'
          }
        }
      });
    }
  });

  const result = await client.uploadPhoto('hat-1', { name: 'hat.png' });

  assert.equal(result.ok, true);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/hat-photo.php');
  assert.deepEqual(fakeFormData.entries, [
    ['hat_id', 'hat-1'],
    ['photo', { name: 'hat.png' }]
  ]);

  const brokenClient = hatCatalogApiModule.createForgeStaffHatCatalogApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async text() {
        return '<html>bad</html>';
      }
    })
  });

  await assert.rejects(
    () => brokenClient.listHats(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.message, 'The hat library returned an unexpected response.');
      return true;
    }
  );
});
