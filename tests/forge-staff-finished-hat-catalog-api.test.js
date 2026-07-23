const test = require('node:test');
const assert = require('node:assert/strict');

const finishedHatCatalogApiModule = require('../public/js/forge-staff-finished-hat-catalog-api.js');

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('listFinishedHats sends GET and same-origin credentials and returns normalized records safely', async () => {
  const requests = [];
  const client = finishedHatCatalogApiModule.createForgeStaffFinishedHatCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          finished_hats: [{
            id: 'finished-1',
            finished_hat_name: ' Texas Flag Acrylic Patch Hat Black Performance Rope ',
            placement_status: ' sample ',
            status: ' active ',
            needs_linking: 1
          }]
        }
      });
    }
  });

  const result = await client.listFinishedHats();

  assert.equal(result.ok, true);
  assert.equal(result.finished_hats[0].finished_hat_name, 'Texas Flag Acrylic Patch Hat Black Performance Rope');
  assert.equal(result.finished_hats[0].placement_status, 'sample');
  assert.equal(result.finished_hats[0].status, 'active');
  assert.equal(result.finished_hats[0].needs_linking, true);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/finished-hats.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.cache, 'no-store');
});

test('createFinishedHat and updateFinishedHat send POST JSON to the approved endpoints', async () => {
  const requests = [];
  const client = finishedHatCatalogApiModule.createForgeStaffFinishedHatCatalogApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(url.includes('finished-hat.php') ? 200 : 201, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          finished_hat: {
            id: 'finished-1',
            finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
            placement_status: 'unassigned',
            status: 'review'
          }
        }
      });
    }
  });

  await client.createFinishedHat({
    finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
    design_id: '',
    hat_id: '',
    material_id: '',
    patch_shape: '',
    patch_size: '',
    placement_status: 'unassigned',
    location_label: '',
    retail_price: '',
    status: 'review',
    notes: ''
  });
  await client.updateFinishedHat('finished-1', {
    finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
    design_id: 'design-1',
    hat_id: 'hat-1',
    material_id: 'material-1',
    patch_shape: 'Rectangle',
    patch_size: '2.5 x 1.5',
    placement_status: 'sample',
    location_label: 'Boutique front table',
    retail_price: '36.00',
    status: 'active',
    notes: 'Reviewed'
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/finished-hats.php');
  assert.equal(requests[1].url, '/api/v1/staff/catalog/finished-hat.php?id=finished-1');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[1].options.credentials, 'same-origin');
  assert.equal(JSON.parse(requests[1].options.body).placement_status, 'sample');
});

test('uploadPhoto sends POST form data and unauthenticated responses stay safe', async () => {
  const requests = [];
  const fakeFormData = {
    entries: [],
    append(key, value) {
      this.entries.push([key, value]);
    }
  };
  const client = finishedHatCatalogApiModule.createForgeStaffFinishedHatCatalogApiClient({
    formDataFactory: () => fakeFormData,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(401, {
        application: 'Forge',
        api_version: '1',
        status: 'error',
        error: {
          code: 'authentication_required',
          message: 'Staff authentication is required.'
        }
      });
    }
  });

  const result = await client.uploadPhoto('finished-1', { name: 'photo.jpg' });

  assert.equal(result.ok, false);
  assert.equal(result.unauthenticated, true);
  assert.equal(requests[0].url, '/api/v1/staff/catalog/finished-hat-photo.php');
  assert.deepEqual(fakeFormData.entries, [
    ['finished_hat_id', 'finished-1'],
    ['photo', { name: 'photo.jpg' }]
  ]);
});

test('malformed responses raise a safe finished-hat catalog error', async () => {
  const client = finishedHatCatalogApiModule.createForgeStaffFinishedHatCatalogApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async json() {
        throw new Error('bad');
      }
    })
  });

  await assert.rejects(
    () => client.listFinishedHats(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.message, 'The finished hat library returned an unexpected response.');
      return true;
    }
  );
});
