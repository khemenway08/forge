(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffDesignCatalogApi = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1/staff/catalog';
  const DEFAULT_TIMEOUT_MS = 10000;
  const SAFE_ERROR_MESSAGES = {
    invalid_request: 'Review the design fields and try again.',
    invalid_response: 'The design catalog returned an unexpected response.',
    timeout: 'The design catalog did not respond in time.',
    network_error: 'The design catalog could not be reached.',
    authentication_required: 'Staff authentication is required.',
    unsupported_media_type: 'The design catalog rejected the request format.',
    design_not_found: 'That design could not be found.',
    design_delete_blocked: 'Clear Finished Hat links before deleting this Design.',
    catalog_order_conflict: 'The design order changed elsewhere. Reload and try again.',
    idempotency_conflict: 'This Create Design request conflicts with an existing Design. Close the dialog and try again.',
    storage_unavailable: 'Design catalog storage is currently unavailable.',
    server_error: 'Design catalog is currently unavailable.',
    unavailable: 'Design catalog is currently unavailable.',
    method_not_allowed: 'This design catalog action is not available right now.'
  };

  class ForgeStaffDesignCatalogApiError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ForgeStaffDesignCatalogApiError';
      this.code = code;
      if (Number.isInteger(options.status)) {
        this.status = options.status;
      }
      if (options.fields && typeof options.fields === 'object') {
        this.fields = options.fields;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }

  function createForgeStaffDesignCatalogApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const fetchImpl = resolveFetchImplementation(options.fetchImpl);
    const formDataFactory = options.formDataFactory || (() => new FormData());

    async function listDesigns() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/designs.php`, timeoutMs, {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            designs: []
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeDesignListPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function getDesign(designId) {
      const normalizedId = asTrimmedString(designId);
      if (!normalizedId) {
        throw new ForgeStaffDesignCatalogApiError('invalid_request', 'A valid design is required.');
      }

      try {
        const response = await performJsonRequest(
          fetchImpl,
          `${baseUrl}/design.php?id=${encodeURIComponent(normalizedId)}`,
          timeoutMs,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json'
            },
            credentials: 'same-origin',
            cache: 'no-store'
          }
        );
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            design: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeSingleDesignPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function createDesign(input, idempotencyKey) {
      const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
      if (!normalizedIdempotencyKey) {
        throw new ForgeStaffDesignCatalogApiError('invalid_request', 'A valid Create Design request key is required.');
      }
      return saveDesign('create', null, input, normalizedIdempotencyKey);
    }

    async function updateDesign(designId, input) {
      return saveDesign('update', designId, input, null);
    }

    async function deleteDesign(designId) {
      const normalizedId = asTrimmedString(designId);
      if (!normalizedId) {
        throw new ForgeStaffDesignCatalogApiError('invalid_request', 'A valid design is required.');
      }

      try {
        const response = await performJsonRequest(
          fetchImpl,
          `${baseUrl}/design.php?id=${encodeURIComponent(normalizedId)}`,
          timeoutMs,
          {
            method: 'DELETE',
            headers: {
              Accept: 'application/json'
            },
            credentials: 'same-origin',
            cache: 'no-store'
          }
        );
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            design: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeSingleDesignPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function reorderDesigns(orderedIds) {
      return reorderCatalogRecords('designs', orderedIds);
    }

    async function saveDesign(mode, designId, input, idempotencyKey) {
      const payload = normalizeDesignInputPayload(input);
      const requestBody = JSON.stringify(payload);
      const url = mode === 'update'
        ? `${baseUrl}/design.php?id=${encodeURIComponent(asTrimmedString(designId))}`
        : `${baseUrl}/designs.php`;

      try {
        const response = await performJsonRequest(fetchImpl, url, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(mode === 'create' ? { 'Idempotency-Key': idempotencyKey } : {})
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: requestBody
        });
        const payloadResponse = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            design: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payloadResponse);
        }
        return normalizeSingleDesignPayload(payloadResponse);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function uploadThumbnail(designId, fileLike) {
      const normalizedId = asTrimmedString(designId);
      if (!normalizedId) {
        throw new ForgeStaffDesignCatalogApiError('invalid_request', 'A valid design is required.');
      }
      if (!fileLike || typeof fileLike !== 'object') {
        throw new ForgeStaffDesignCatalogApiError('invalid_request', 'Choose a thumbnail to upload.');
      }

      const formData = formDataFactory();
      formData.append('design_id', normalizedId);
      formData.append('thumbnail', fileLike);

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/design-thumbnail.php`, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: formData
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            design: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeSingleDesignPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function reorderCatalogRecords(resourceType, orderedIds) {
      const normalizedIds = Array.isArray(orderedIds)
        ? orderedIds.map((value) => asTrimmedString(value)).filter(Boolean)
        : [];

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/reorder.php`, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            resource_type: resourceType,
            ordered_ids: normalizedIds
          })
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return {
            ok: false,
            authenticated: false,
            unauthenticated: true,
            records: []
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return {
          ok: true,
          authenticated: true,
          records: Array.isArray(payload?.data?.records) ? payload.data.records : []
        };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    return {
      listDesigns,
      getDesign,
      createDesign,
      updateDesign,
      deleteDesign,
      reorderDesigns,
      uploadThumbnail
    };
  }

  function normalizeDesignListPayload(payload) {
    const designs = Array.isArray(payload?.data?.designs)
      ? payload.data.designs.map(normalizeDesignRecord)
      : [];

    return {
      ok: true,
      authenticated: true,
      designs
    };
  }

  function normalizeSingleDesignPayload(payload) {
    return {
      ok: true,
      authenticated: true,
      design: normalizeDesignRecord(payload?.data?.design || null)
    };
  }

  function normalizeDesignRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: asTrimmedString(normalized.id),
      design_name: asTrimmedString(normalized.design_name),
      thumbnail_path: asNullableTrimmedString(normalized.thumbnail_path),
      category: asTrimmedString(normalized.category),
      store_fit: asTrimmedString(normalized.store_fit),
      status: asTrimmedString(normalized.status),
      production_method: asTrimmedString(normalized.production_method),
      production_file_location: asNullableTrimmedString(normalized.production_file_location),
      made_on_hat: asTrimmedString(normalized.made_on_hat),
      notes: asNullableTrimmedString(normalized.notes),
      sort_order: asPositiveInteger(normalized.sort_order),
      finished_hat_link_count: asNonnegativeInteger(normalized.finished_hat_link_count),
      created_at: asTrimmedString(normalized.created_at),
      updated_at: asTrimmedString(normalized.updated_at)
    };
  }

  function normalizeDesignInputPayload(input) {
    const normalized = input && typeof input === 'object' ? input : {};
    return {
      design_name: asTrimmedString(normalized.design_name),
      category: asTrimmedString(normalized.category),
      store_fit: asTrimmedString(normalized.store_fit),
      status: asTrimmedString(normalized.status),
      production_method: asTrimmedString(normalized.production_method),
      production_file_location: normalizeReferenceField(normalized.production_file_location),
      made_on_hat: asTrimmedString(normalized.made_on_hat),
      notes: normalizeOptionalText(normalized.notes)
    };
  }

  function normalizeReferenceField(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeOptionalText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  async function performJsonRequest(fetchImpl, url, timeoutMs, options) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timerId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : 0;

    try {
      return await fetchImpl(url, {
        ...options,
        signal: controller ? controller.signal : undefined
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ForgeStaffDesignCatalogApiError('timeout', SAFE_ERROR_MESSAGES.timeout, { cause: error });
      }
      throw new ForgeStaffDesignCatalogApiError('network_error', SAFE_ERROR_MESSAGES.network_error, { cause: error });
    } finally {
      if (timerId) {
        clearTimeout(timerId);
      }
    }
  }

  async function parseJsonResponse(response) {
    let text = '';
    try {
      text = await response.text();
    } catch (error) {
      throw new ForgeStaffDesignCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, { cause: error });
    }

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ForgeStaffDesignCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, { cause: error });
    }
  }

  function buildServerError(status, payload) {
    const errorPayload = payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
      ? payload.error
      : {};
    const code = asTrimmedString(errorPayload.code) || 'server_error';
    const message = SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.unavailable;
    const fields = errorPayload.fields && typeof errorPayload.fields === 'object' ? errorPayload.fields : undefined;
    return new ForgeStaffDesignCatalogApiError(code, message, { status, fields });
  }

  function normalizeClientError(error) {
    if (error instanceof ForgeStaffDesignCatalogApiError) {
      return error;
    }

    return new ForgeStaffDesignCatalogApiError('unavailable', SAFE_ERROR_MESSAGES.unavailable, {
      cause: error
    });
  }

  function normalizeBaseUrl(value) {
    const normalized = String(value || '').trim().replace(/\/+$/, '');
    return normalized || DEFAULT_BASE_URL;
  }

  function normalizeTimeoutMs(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  function resolveFetchImplementation(fetchImpl) {
    if (typeof fetchImpl === 'function') {
      return fetchImpl;
    }
    if (typeof fetch === 'function') {
      return fetch.bind(typeof window !== 'undefined' ? window : globalThis);
    }
    throw new Error('A fetch implementation is required.');
  }

  function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeIdempotencyKey(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
      ? normalized
      : '';
  }

  function asNullableTrimmedString(value) {
    const normalized = asTrimmedString(value);
    return normalized === '' ? null : normalized;
  }

  function asPositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const normalized = Number.parseInt(value.trim(), 10);
      return normalized > 0 ? normalized : 0;
    }
    return 0;
  }

  function asNonnegativeInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const normalized = Number.parseInt(value.trim(), 10);
      return normalized >= 0 ? normalized : 0;
    }
    return 0;
  }

  return {
    ForgeStaffDesignCatalogApiError,
    createForgeStaffDesignCatalogApiClient
  };
}));
