(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffFinishedHatCatalogApi = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1/staff/catalog';
  const DEFAULT_TIMEOUT_MS = 10000;
  const SAFE_ERROR_MESSAGES = {
    invalid_request: 'Review the finished hat fields and try again.',
    invalid_response: 'The finished hat library returned an unexpected response.',
    timeout: 'The finished hat library did not respond in time.',
    network_error: 'The finished hat library could not be reached.',
    authentication_required: 'Staff authentication is required.',
    unsupported_media_type: 'The finished hat library rejected the request format.',
    finished_hat_not_found: 'That finished hat could not be found.',
    catalog_order_conflict: 'The finished hat order changed elsewhere. Reload and try again.',
    storage_unavailable: 'Finished hat catalog storage is currently unavailable.',
    server_error: 'Finished hat catalog is currently unavailable.',
    unavailable: 'Finished hat catalog is currently unavailable.',
    method_not_allowed: 'This finished hat catalog action is not available right now.'
  };

  class ForgeStaffFinishedHatCatalogApiError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ForgeStaffFinishedHatCatalogApiError';
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

  function createForgeStaffFinishedHatCatalogApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const fetchImpl = resolveFetchImplementation(options.fetchImpl);
    const formDataFactory = options.formDataFactory || (() => new FormData());

    async function listFinishedHats() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/finished-hats.php`, timeoutMs, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, finished_hats: [] };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return {
          ok: true,
          authenticated: true,
          finished_hats: Array.isArray(payload?.data?.finished_hats)
            ? payload.data.finished_hats.map(normalizeFinishedHatRecord)
            : []
        };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function getFinishedHat(finishedHatId) {
      const normalizedId = asTrimmedString(finishedHatId);
      if (!normalizedId) {
        throw new ForgeStaffFinishedHatCatalogApiError('invalid_request', 'A valid finished hat is required.');
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/finished-hat.php?id=${encodeURIComponent(normalizedId)}`, timeoutMs, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, finished_hat: null };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return { ok: true, authenticated: true, finished_hat: normalizeFinishedHatRecord(payload?.data?.finished_hat || null) };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function createFinishedHat(input) {
      return saveFinishedHat('create', null, input);
    }

    async function updateFinishedHat(finishedHatId, input) {
      return saveFinishedHat('update', finishedHatId, input);
    }

    async function reorderFinishedHats(orderedIds) {
      return reorderCatalogRecords('finished_hats', orderedIds);
    }

    async function saveFinishedHat(mode, finishedHatId, input) {
      const payload = normalizeFinishedHatInputPayload(input);
      const url = mode === 'update'
        ? `${baseUrl}/finished-hat.php?id=${encodeURIComponent(asTrimmedString(finishedHatId))}`
        : `${baseUrl}/finished-hats.php`;

      try {
        const response = await performJsonRequest(fetchImpl, url, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify(payload)
        });
        const payloadResponse = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, finished_hat: null };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payloadResponse);
        }
        return { ok: true, authenticated: true, finished_hat: normalizeFinishedHatRecord(payloadResponse?.data?.finished_hat || null) };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function uploadPhoto(finishedHatId, fileLike) {
      const normalizedId = asTrimmedString(finishedHatId);
      if (!normalizedId) {
        throw new ForgeStaffFinishedHatCatalogApiError('invalid_request', 'A valid finished hat is required.');
      }
      if (!fileLike || typeof fileLike !== 'object') {
        throw new ForgeStaffFinishedHatCatalogApiError('invalid_request', 'Choose a photo to upload.');
      }

      const formData = formDataFactory();
      formData.append('finished_hat_id', normalizedId);
      formData.append('photo', fileLike);

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/finished-hat-photo.php`, timeoutMs, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: formData
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, finished_hat: null };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return { ok: true, authenticated: true, finished_hat: normalizeFinishedHatRecord(payload?.data?.finished_hat || null) };
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
          return { ok: false, authenticated: false, unauthenticated: true, records: [] };
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
      listFinishedHats,
      getFinishedHat,
      createFinishedHat,
      updateFinishedHat,
      reorderFinishedHats,
      uploadPhoto
    };
  }

  function normalizeFinishedHatRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: asTrimmedString(normalized.id),
      finished_hat_name: asTrimmedString(normalized.finished_hat_name),
      photo_path: asNullableTrimmedString(normalized.photo_path),
      image_width: asNullablePositiveInteger(normalized.image_width),
      image_height: asNullablePositiveInteger(normalized.image_height),
      design_id: asNullableTrimmedString(normalized.design_id),
      hat_id: asNullableTrimmedString(normalized.hat_id),
      material_id: asNullableTrimmedString(normalized.material_id),
      patch_shape: asNullableTrimmedString(normalized.patch_shape),
      patch_size: asNullableTrimmedString(normalized.patch_size),
      placement_status: asTrimmedString(normalized.placement_status),
      location_label: asNullableTrimmedString(normalized.location_label),
      retail_price: asNullableTrimmedString(normalized.retail_price),
      status: asTrimmedString(normalized.status),
      notes: asNullableTrimmedString(normalized.notes),
      sort_order: asPositiveInteger(normalized.sort_order),
      created_at: asTrimmedString(normalized.created_at),
      updated_at: asTrimmedString(normalized.updated_at),
      design_name: asNullableTrimmedString(normalized.design_name),
      hat_name: asNullableTrimmedString(normalized.hat_name),
      hat_manufacturer: asNullableTrimmedString(normalized.hat_manufacturer),
      hat_model: asNullableTrimmedString(normalized.hat_model),
      hat_color: asNullableTrimmedString(normalized.hat_color),
      material_name: asNullableTrimmedString(normalized.material_name),
      material_type: asNullableTrimmedString(normalized.material_type),
      material_color: asNullableTrimmedString(normalized.material_color),
      needs_linking: Boolean(normalized.needs_linking)
    };
  }

  function normalizeFinishedHatInputPayload(input) {
    const normalized = input && typeof input === 'object' ? input : {};
    return {
      finished_hat_name: asTrimmedString(normalized.finished_hat_name),
      design_id: normalizeOptionalText(normalized.design_id),
      hat_id: normalizeOptionalText(normalized.hat_id),
      material_id: normalizeOptionalText(normalized.material_id),
      patch_shape: normalizeOptionalText(normalized.patch_shape),
      patch_size: normalizeOptionalText(normalized.patch_size),
      placement_status: asTrimmedString(normalized.placement_status),
      location_label: normalizeOptionalText(normalized.location_label),
      retail_price: normalizeOptionalText(normalized.retail_price),
      status: asTrimmedString(normalized.status),
      notes: normalizeOptionalText(normalized.notes)
    };
  }

  function normalizeBaseUrl(baseUrl) {
    const normalized = String(baseUrl || '').trim();
    return normalized.replace(/\/+$/, '') || DEFAULT_BASE_URL;
  }

  function normalizeTimeoutMs(value) {
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : DEFAULT_TIMEOUT_MS;
  }

  function resolveFetchImplementation(fetchImpl) {
    if (typeof fetchImpl === 'function') {
      return fetchImpl;
    }
    if (typeof fetch === 'function') {
      return fetch.bind(globalThis);
    }
    throw new ForgeStaffFinishedHatCatalogApiError('unavailable', SAFE_ERROR_MESSAGES.unavailable);
  }

  async function performJsonRequest(fetchImpl, url, timeoutMs, options) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetchImpl(url, controller ? { ...options, signal: controller.signal } : options);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ForgeStaffFinishedHatCatalogApiError('timeout', SAFE_ERROR_MESSAGES.timeout, { cause: error });
      }
      throw new ForgeStaffFinishedHatCatalogApiError('network_error', SAFE_ERROR_MESSAGES.network_error, { cause: error });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function parseJsonResponse(response) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ForgeStaffFinishedHatCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, {
        status: response.status,
        cause: error
      });
    }
    if (!payload || typeof payload !== 'object') {
      throw new ForgeStaffFinishedHatCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, {
        status: response.status
      });
    }
    return payload;
  }

  function buildServerError(status, payload) {
    const errorCode = asTrimmedString(payload?.error?.code) || 'server_error';
    const safeMessage = SAFE_ERROR_MESSAGES[errorCode] || SAFE_ERROR_MESSAGES.server_error;
    return new ForgeStaffFinishedHatCatalogApiError(errorCode, safeMessage, {
      status,
      fields: payload?.error?.fields && typeof payload.error.fields === 'object' ? payload.error.fields : undefined
    });
  }

  function normalizeClientError(error) {
    if (error instanceof ForgeStaffFinishedHatCatalogApiError) {
      return error;
    }
    return new ForgeStaffFinishedHatCatalogApiError('server_error', SAFE_ERROR_MESSAGES.server_error, {
      cause: error
    });
  }

  function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function asNullableTrimmedString(value) {
    const normalized = asTrimmedString(value);
    return normalized ? normalized : null;
  }

  function asNullablePositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const normalized = Number.parseInt(value.trim(), 10);
      return normalized > 0 ? normalized : null;
    }
    return null;
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

  function normalizeOptionalText(value) {
    const normalized = asTrimmedString(value);
    return normalized ? normalized : null;
  }

  return {
    SAFE_ERROR_MESSAGES,
    ForgeStaffFinishedHatCatalogApiError,
    createForgeStaffFinishedHatCatalogApiClient,
    normalizeFinishedHatRecord
  };
}));
