const test = require('node:test');
const assert = require('node:assert/strict');

const staffApiClientModule = require('../public/js/forge-staff-api-client.js');

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('checkSession sends same-origin credentials safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          authenticated: false
        }
      });
    }
  });

  const result = await client.checkSession();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/session.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
});

test('login sends POST JSON and same-origin credentials without leaking the pin to the URL', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          authenticated: true
        }
      });
    }
  });

  const result = await client.login('2468');

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/login.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), { pin: '2468' });
  assert.doesNotMatch(requests[0].url, /2468/);
});

test('logout sends POST and same-origin credentials', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          authenticated: false
        }
      });
    }
  });

  const result = await client.logout();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/logout.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('verifyPin sends POST JSON and same-origin credentials without creating a session-oriented result', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          verified: true
        }
      });
    }
  });

  const result = await client.verifyPin('2468');

  assert.deepEqual(result, {
    ok: true,
    verified: true
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/verify-pin.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), { pin: '2468' });
});

test('listOrders sends GET and same-origin credentials and returns orders safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          orders: [{ forge_order_uuid: 'order-1' }],
          total_count: 1,
          limit: 50,
          offset: 0
        }
      });
    }
  });

  const result = await client.listOrders();

  assert.equal(result.ok, true);
  assert.equal(result.authenticated, true);
  assert.deepEqual(result.orders, [{ forge_order_uuid: 'order-1' }]);
  assert.equal(result.totalCount, 1);
  assert.equal(result.limit, 50);
  assert.equal(result.offset, 0);
  assert.equal(requests[0].url, '/api/v1/staff/orders.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
});

test('listOrders can send explicit limit and offset without mutating caller options', async () => {
  const requests = [];
  const pagination = { limit: 50, offset: 100 };
  const originalPagination = { ...pagination };
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          orders: [{ forge_order_uuid: 'order-101' }],
          total_count: 120,
          limit: 50,
          offset: 100
        }
      });
    }
  });

  const result = await client.listOrders(pagination);

  assert.equal(result.ok, true);
  assert.equal(result.totalCount, 120);
  assert.equal(result.limit, 50);
  assert.equal(result.offset, 100);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/orders.php?limit=50&offset=100');
  assert.deepEqual(pagination, originalPagination);
});

test('invalid pagination values are rejected before listOrders sends a request', async () => {
  let requestCount = 0;
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error('fetch should not be called');
    }
  });

  await assert.rejects(
    () => client.listOrders({ limit: 0 }),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      assert.equal(error.message, 'A valid order-page limit is required.');
      return true;
    }
  );

  await assert.rejects(
    () => client.listOrders({ offset: -1 }),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      assert.equal(error.message, 'A valid order-page offset is required.');
      return true;
    }
  );

  await assert.rejects(
    () => client.listOrders({ limit: 25.5 }),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      assert.equal(error.message, 'A valid order-page limit is required.');
      return true;
    }
  );

  assert.equal(requestCount, 0);
});

test('listTrays sends GET and same-origin credentials and returns normalized trays safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          trays: [
            {
              tray_number: '12',
              tray_status: 'assigned',
              current_order_uuid: 'order-12',
              assigned_at: '2026-07-20T12:00:00Z',
              updated_at: '2026-07-20T12:00:00Z'
            }
          ]
        }
      });
    }
  });

  const result = await client.listTrays();

  assert.equal(result.ok, true);
  assert.deepEqual(result.trays, [
    {
      tray_number: 12,
      tray_status: 'assigned',
      current_order_uuid: 'order-12',
      assigned_at: '2026-07-20T12:00:00Z',
      updated_at: '2026-07-20T12:00:00Z'
    }
  ]);
  assert.equal(requests[0].url, '/api/v1/staff/trays.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('assignTray sends POST JSON and same-origin credentials with the approved payload', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          already_assigned: false,
          order: {
            forge_order_uuid: 'order-1',
            payload: { customer: { full_name: 'Kyle' }, items: [] }
          },
          tray: {
            tray_number: 3,
            tray_status: 'assigned',
            current_order_uuid: 'order-1',
            assigned_at: '2026-07-20T12:00:00Z',
            updated_at: '2026-07-20T12:00:00Z'
          },
          assignment_history: {
            tray_assignment_id: 'assignment-1',
            tray_number: 3,
            forge_order_uuid: 'order-1',
            assigned_at: '2026-07-20T12:00:00Z',
            released_at: null,
            release_reason: null
          }
        }
      });
    }
  });

  const result = await client.assignTray('order-1', '3');

  assert.equal(result.ok, true);
  assert.equal(result.alreadyAssigned, false);
  assert.equal(result.tray.tray_number, 3);
  assert.equal(result.assignmentHistory.tray_assignment_id, 'assignment-1');
  assert.equal(requests[0].url, '/api/v1/staff/assign-tray.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    forge_order_uuid: 'order-1',
    tray_number: 3
  });
});

test('completeItemQuantity sends POST JSON and same-origin credentials with optimistic concurrency fields', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          already_applied: false,
          order: {
            forge_order_uuid: 'order-2',
            production_status: 'in_production',
            payload: { items: [] }
          },
          item: {
            line_id: 'line-2',
            completed_quantity: 1,
            production_status: 'in_production'
          }
        }
      });
    }
  });

  const result = await client.completeItemQuantity('order-2', 'line-2', 0, 1);

  assert.equal(result.ok, true);
  assert.equal(result.alreadyApplied, false);
  assert.equal(result.item.line_id, 'line-2');
  assert.equal(requests[0].url, '/api/v1/staff/complete-item.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    forge_order_uuid: 'order-2',
    line_id: 'line-2',
    expected_completed_quantity: 0,
    target_completed_quantity: 1
  });
});

test('updateInternalNote sends POST JSON and same-origin credentials with the private note only', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          internal_note: 'Customer confirmed spelling.\nPaid cash at show.',
          order: {
            forge_order_uuid: 'order-3',
            internal_note: 'Customer confirmed spelling.\nPaid cash at show.',
            has_internal_note: true,
            payload: { items: [] }
          }
        }
      });
    }
  });

  const result = await client.updateInternalNote('order-3', 'Customer confirmed spelling.\nPaid cash at show.');

  assert.equal(result.ok, true);
  assert.equal(result.internalNote, 'Customer confirmed spelling.\nPaid cash at show.');
  assert.equal(result.order.internal_note, 'Customer confirmed spelling.\nPaid cash at show.');
  assert.equal(requests[0].url, '/api/v1/staff/internal-note.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    forge_order_uuid: 'order-3',
    internal_note: 'Customer confirmed spelling.\nPaid cash at show.'
  });
});

test('previewLegacyTestCleanup sends GET and returns the dry-run cleanup preview safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          preview: {
            cutoff_timezone: 'America/Chicago',
            cutoff_local: '2026-07-25T00:00:00-05:00',
            cutoff_utc: '2026-07-25T05:00:00+00:00',
            eligible_count: 2,
            confirmation_text: 'DELETE 2 ORDERS BEFORE JULY 25',
            preview_signature: 'preview-signature-1',
            eligible_orders: [
              {
                forge_order_uuid: 'order-legacy-1',
                forge_order_number: 1001,
                order_reference: 'Order 1001',
                customer_name: 'Test Customer One',
                submitted_at: '2026-07-24T18:00:00+00:00',
                event_label: 'Checkout Test Session',
                tray_number: 4
              }
            ],
            protected_orders: [
              {
                forge_order_uuid: 'order-live-1',
                forge_order_number: 1042,
                order_reference: 'Order 1042',
                customer_name: 'Live Customer',
                submitted_at: '2026-07-25T16:00:00+00:00',
                event_label: 'Austin Market',
                tray_number: null
              }
            ]
          }
        }
      });
    }
  });

  const result = await client.previewLegacyTestCleanup();

  assert.equal(result.ok, true);
  assert.equal(result.preview.eligibleCount, 2);
  assert.equal(result.preview.confirmationText, 'DELETE 2 ORDERS BEFORE JULY 25');
  assert.equal(result.preview.eligibleOrders[0].tray_number, 4);
  assert.equal(result.preview.protectedOrders[0].order_reference, 'Order 1042');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/legacy-test-cleanup.php');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'same-origin');
});

test('applyLegacyTestCleanup sends POST JSON with the preview signature count and exact confirmation text', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          deleted_count: 2,
          released_tray_numbers: [4, 8],
          deleted_order_uuids: ['order-legacy-1', 'order-legacy-2']
        }
      });
    }
  });

  const result = await client.applyLegacyTestCleanup(
    'preview-signature-1',
    2,
    'DELETE 2 ORDERS BEFORE JULY 25'
  );

  assert.equal(result.ok, true);
  assert.equal(result.deletedCount, 2);
  assert.deepEqual(result.releasedTrayNumbers, [4, 8]);
  assert.deepEqual(result.deletedOrderUuids, ['order-legacy-1', 'order-legacy-2']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/legacy-test-cleanup.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    preview_signature: 'preview-signature-1',
    expected_count: 2,
    confirmation_text: 'DELETE 2 ORDERS BEFORE JULY 25'
  });
});

test('cancelOrder sends POST JSON and returns the cancelled order with released tray details safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          order: {
            forge_order_uuid: 'order-12',
            forge_order_number: 1042,
            production_status: 'cancelled',
            current_tray_number: null,
            cancelled_at: '2026-07-20T10:09:00Z',
            payload: { customer: { full_name: 'Kyle' }, items: [] }
          },
          tray: {
            tray_number: 6,
            tray_status: 'available',
            current_order_uuid: null
          },
          assignment_history: {
            tray_assignment_id: 'assignment-12',
            tray_number: 6,
            release_reason: 'cancelled'
          }
        }
      });
    }
  });

  const result = await client.cancelOrder('order-12');

  assert.equal(result.ok, true);
  assert.equal(result.order.production_status, 'cancelled');
  assert.equal(result.order.cancelled_at, '2026-07-20T10:09:00Z');
  assert.equal(result.tray.tray_number, 6);
  assert.equal(result.assignmentHistory.release_reason, 'cancelled');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/cancel-order.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    forge_order_uuid: 'order-12'
  });
});

test('deleteTestOrder sends POST JSON with the exact typed confirmation and returns deletion details safely', async () => {
  const requests = [];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createJsonResponse(200, {
        application: 'Forge',
        api_version: '1',
        status: 'ok',
        data: {
          deleted_order_uuid: 'order-test-1',
          deleted_order_number: 1007,
          released_tray_number: 8
        }
      });
    }
  });

  const result = await client.deleteTestOrder('order-test-1', 'DELETE TEST ORDER');

  assert.equal(result.ok, true);
  assert.equal(result.deletedOrderUuid, 'order-test-1');
  assert.equal(result.deletedOrderNumber, 1007);
  assert.equal(result.releasedTrayNumber, 8);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/v1/staff/delete-test-order.php');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    forge_order_uuid: 'order-test-1',
    confirmation_text: 'DELETE TEST ORDER'
  });
});

test('cleanup apply validates required arguments before sending requests', async () => {
  let requestCount = 0;
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error('fetch should not be called');
    }
  });

  await assert.rejects(
    () => client.applyLegacyTestCleanup('', 2, 'DELETE 2 ORDERS BEFORE JULY 25'),
    /preview signature/i
  );
  await assert.rejects(
    () => client.applyLegacyTestCleanup('preview-signature-1', -1, 'DELETE 2 ORDERS BEFORE JULY 25'),
    /preview count/i
  );
  await assert.rejects(
    () => client.applyLegacyTestCleanup('preview-signature-1', 2, ''),
    /confirmation text/i
  );

  assert.equal(requestCount, 0);
});

test('401 responses are handled safely as unauthenticated results', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async (url) => {
      if (url.endsWith('/session.php')) {
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
      return createJsonResponse(401, {
        application: 'Forge',
        api_version: '1',
        status: 'error',
        error: {
          code: 'invalid_credentials',
          message: 'Invalid staff credentials.'
        }
      });
    }
  });

  const sessionResult = await client.checkSession();
  const loginResult = await client.login('1234');
  const verifyPinResult = await client.verifyPin('1234');
  const ordersResult = await client.listOrders();
  const traysResult = await client.listTrays();
  const assignResult = await client.assignTray('order-1', 1);
  const completionResult = await client.completeItemQuantity('order-1', 'line-1', 0, 1);
  const noteResult = await client.updateInternalNote('order-1', 'Private note');
  const cleanupPreviewResult = await client.previewLegacyTestCleanup();
  const cleanupApplyResult = await client.applyLegacyTestCleanup('preview-signature-1', 1, 'DELETE 1 ORDERS BEFORE JULY 25');

  assert.deepEqual(sessionResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(loginResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(verifyPinResult, { ok: false, verified: false, invalidCredentials: true });
  assert.deepEqual(ordersResult, { ok: false, authenticated: false, unauthenticated: true, orders: [] });
  assert.deepEqual(traysResult, { ok: false, authenticated: false, unauthenticated: true, trays: [] });
  assert.deepEqual(assignResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(completionResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(noteResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(cleanupPreviewResult, { ok: false, authenticated: false, unauthenticated: true });
  assert.deepEqual(cleanupApplyResult, { ok: false, authenticated: false, unauthenticated: true });
});

test('malformed or non-JSON responses produce a safe generic client error', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError('Unexpected token < in JSON with raw HTML body');
      }
    })
  });

  await assert.rejects(
    () => client.listOrders(),
    (error) => {
      assert.equal(error.code, 'invalid_response');
      assert.equal(error.message, 'The Forge staff server returned an unexpected response.');
      assert.doesNotMatch(error.message, /Unexpected token|raw HTML body/i);
      return true;
    }
  );
});

test('PIN values are not included in safe client errors', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => createJsonResponse(500, {
      application: 'Forge',
      api_version: '1',
      status: 'error',
      error: {
        code: 'server_error',
        message: 'Server problem while checking PIN 2468'
      }
    })
  });

  await assert.rejects(
    () => client.verifyPin('2468'),
    (error) => {
      assert.equal(error.code, 'server_error');
      assert.doesNotMatch(error.message, /2468/);
      return true;
    }
  );
});

test('tray assignment conflicts and missing tray configuration return safe normalized errors', async () => {
  const responses = [
    createJsonResponse(409, {
      application: 'Forge',
      api_version: '1',
      status: 'error',
      error: {
        code: 'tray_unavailable',
        message: 'That tray is no longer available. Choose another tray.'
      }
    }),
    createJsonResponse(503, {
      application: 'Forge',
      api_version: '1',
      status: 'error',
      error: {
        code: 'no_trays_configured',
        message: 'No production trays are configured.'
      }
    })
  ];
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => responses.shift()
  });

  await assert.rejects(
    () => client.assignTray('order-1', 1),
    (error) => {
      assert.equal(error.code, 'tray_unavailable');
      assert.equal(error.message, 'That tray is no longer available. Choose another tray.');
      return true;
    }
  );

  await assert.rejects(
    () => client.listTrays(),
    (error) => {
      assert.equal(error.code, 'no_trays_configured');
      assert.equal(error.message, 'No production trays are configured.');
      return true;
    }
  );
});

test('invalid tray numbers are rejected before sending an assignment request', async () => {
  const client = staffApiClientModule.createForgeStaffApiClient({
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    }
  });

  await assert.rejects(
    () => client.assignTray('order-1', '0'),
    (error) => {
      assert.equal(error.code, 'invalid_request');
      assert.equal(error.message, 'A valid production tray is required.');
      return true;
    }
  );
});
