(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffHatCatalogApi = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1/staff/catalog';
  const DEFAULT_TIMEOUT_MS = 10000;
  const SAFE_ERROR_MESSAGES = {
    invalid_request: 'Review the hat fields and try again.',
    invalid_response: 'The hat library returned an unexpected response.',
    timeout: 'The hat library did not respond in time.',
    network_error: 'The hat library could not be reached.',
    authentication_required: 'Staff authentication is required.',
    unsupported_media_type: 'The hat library rejected the request format.',
    hat_not_found: 'That hat could not be found.',
    catalog_order_conflict: 'The hat order changed elsewhere. Reload and try again.',
    storage_unavailable: 'Hat catalog storage is currently unavailable.',
    server_error: 'Hat catalog is currently unavailable.',
    unavailable: 'Hat catalog is currently unavailable.',
    method_not_allowed: 'This hat catalog action is not available right now.'
  };

  class ForgeStaffHatCatalogApiError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ForgeStaffHatCatalogApiError';
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

  function createForgeStaffHatCatalogApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const fetchImpl = resolveFetchImplementation(options.fetchImpl);
    const formDataFactory = options.formDataFactory || (() => new FormData());

    async function listHats() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/hats.php`, timeoutMs, {
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
            hats: []
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeHatListPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function getHat(hatId) {
      const normalizedId = asTrimmedString(hatId);
      if (!normalizedId) {
        throw new ForgeStaffHatCatalogApiError('invalid_request', 'A valid hat is required.');
      }

      try {
        const response = await performJsonRequest(
          fetchImpl,
          `${baseUrl}/hat.php?id=${encodeURIComponent(normalizedId)}`,
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
            hat: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeSingleHatPayload(payload);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function createHat(input) {
      return saveHat('create', null, input);
    }

    async function updateHat(hatId, input) {
      return saveHat('update', hatId, input);
    }

    async function reorderHats(orderedIds) {
      return reorderCatalogRecords('hats', orderedIds);
    }

    async function saveHat(mode, hatId, input) {
      const payload = normalizeHatInputPayload(input);
      const requestBody = JSON.stringify(payload);
      const url = mode === 'update'
        ? `${baseUrl}/hat.php?id=${encodeURIComponent(asTrimmedString(hatId))}`
        : `${baseUrl}/hats.php`;

      try {
        const response = await performJsonRequest(fetchImpl, url, timeoutMs, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
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
            hat: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payloadResponse);
        }
        return normalizeSingleHatPayload(payloadResponse);
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function uploadPhoto(hatId, fileLike) {
      const normalizedId = asTrimmedString(hatId);
      if (!normalizedId) {
        throw new ForgeStaffHatCatalogApiError('invalid_request', 'A valid hat is required.');
      }
      if (!fileLike || typeof fileLike !== 'object') {
        throw new ForgeStaffHatCatalogApiError('invalid_request', 'Choose a photo to upload.');
      }

      const formData = formDataFactory();
      formData.append('hat_id', normalizedId);
      formData.append('photo', fileLike);

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/hat-photo.php`, timeoutMs, {
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
            hat: null
          };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return normalizeSingleHatPayload(payload);
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
      listHats,
      getHat,
      createHat,
      updateHat,
      reorderHats,
      uploadPhoto
    };
  }

  function normalizeHatListPayload(payload) {
    const hats = Array.isArray(payload?.data?.hats)
      ? payload.data.hats.map(normalizeHatRecord)
      : [];

    return {
      ok: true,
      authenticated: true,
      hats
    };
  }

  function normalizeSingleHatPayload(payload) {
    return {
      ok: true,
      authenticated: true,
      hat: normalizeHatRecord(payload?.data?.hat || null)
    };
  }

  function normalizeHatRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: asTrimmedString(normalized.id),
      hat_name: asTrimmedString(normalized.hat_name),
      photo_path: asNullableTrimmedString(normalized.photo_path),
      manufacturer: asNullableTrimmedString(normalized.manufacturer),
      model: asNullableTrimmedString(normalized.model),
      color: asNullableTrimmedString(normalized.color),
      vendor: asNullableTrimmedString(normalized.vendor),
      base_cost: asNullableTrimmedString(normalized.base_cost),
      status: asTrimmedString(normalized.status),
      notes: asNullableTrimmedString(normalized.notes),
      sort_order: asPositiveInteger(normalized.sort_order),
      created_at: asTrimmedString(normalized.created_at),
      updated_at: asTrimmedString(normalized.updated_at)
    };
  }

  function normalizeHatInputPayload(input) {
    const normalized = input && typeof input === 'object' ? input : {};
    return {
      hat_name: asTrimmedString(normalized.hat_name),
      manufacturer: normalizeOptionalText(normalized.manufacturer),
      model: normalizeOptionalText(normalized.model),
      color: normalizeOptionalText(normalized.color),
      vendor: normalizeOptionalText(normalized.vendor),
      base_cost: normalizeOptionalText(normalized.base_cost),
      status: asTrimmedString(normalized.status),
      notes: normalizeOptionalText(normalized.notes)
    };
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
        throw new ForgeStaffHatCatalogApiError('timeout', SAFE_ERROR_MESSAGES.timeout, { cause: error });
      }
      throw new ForgeStaffHatCatalogApiError('network_error', SAFE_ERROR_MESSAGES.network_error, { cause: error });
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
      throw new ForgeStaffHatCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, { cause: error });
    }

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ForgeStaffHatCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, { cause: error });
    }
  }

  function buildServerError(status, payload) {
    const errorPayload = payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
      ? payload.error
      : {};
    const code = asTrimmedString(errorPayload.code) || 'server_error';
    const message = SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.unavailable;
    const fields = errorPayload.fields && typeof errorPayload.fields === 'object' ? errorPayload.fields : undefined;
    return new ForgeStaffHatCatalogApiError(code, message, { status, fields });
  }

  function normalizeClientError(error) {
    if (error instanceof ForgeStaffHatCatalogApiError) {
      return error;
    }

    return new ForgeStaffHatCatalogApiError('unavailable', SAFE_ERROR_MESSAGES.unavailable, {
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

  return {
    ForgeStaffHatCatalogApiError,
    createForgeStaffHatCatalogApiClient
  };
}));
