(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffMaterialCatalogApi = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1/staff/catalog';
  const DEFAULT_TIMEOUT_MS = 10000;
  const SAFE_ERROR_MESSAGES = {
    invalid_request: 'Review the material fields and try again.',
    invalid_response: 'The material library returned an unexpected response.',
    timeout: 'The material library did not respond in time.',
    network_error: 'The material library could not be reached.',
    authentication_required: 'Staff authentication is required.',
    unsupported_media_type: 'The material library rejected the request format.',
    material_not_found: 'That material could not be found.',
    catalog_order_conflict: 'The material order changed elsewhere. Reload and try again.',
    storage_unavailable: 'Material catalog storage is currently unavailable.',
    server_error: 'Material catalog is currently unavailable.',
    unavailable: 'Material catalog is currently unavailable.',
    method_not_allowed: 'This material catalog action is not available right now.'
  };

  class ForgeStaffMaterialCatalogApiError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'ForgeStaffMaterialCatalogApiError';
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

  function createForgeStaffMaterialCatalogApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const fetchImpl = resolveFetchImplementation(options.fetchImpl);
    const formDataFactory = options.formDataFactory || (() => new FormData());

    async function listMaterials() {
      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/materials.php`, timeoutMs, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, materials: [] };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return {
          ok: true,
          authenticated: true,
          materials: Array.isArray(payload?.data?.materials)
            ? payload.data.materials.map(normalizeMaterialRecord)
            : []
        };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function getMaterial(materialId) {
      const normalizedId = asTrimmedString(materialId);
      if (!normalizedId) {
        throw new ForgeStaffMaterialCatalogApiError('invalid_request', 'A valid material is required.');
      }

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/material.php?id=${encodeURIComponent(normalizedId)}`, timeoutMs, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, material: null };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return { ok: true, authenticated: true, material: normalizeMaterialRecord(payload?.data?.material || null) };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function createMaterial(input) {
      return saveMaterial('create', null, input);
    }

    async function updateMaterial(materialId, input) {
      return saveMaterial('update', materialId, input);
    }

    async function reorderMaterials(orderedIds) {
      return reorderCatalogRecords('materials', orderedIds);
    }

    async function saveMaterial(mode, materialId, input) {
      const payload = normalizeMaterialInputPayload(input);
      const url = mode === 'update'
        ? `${baseUrl}/material.php?id=${encodeURIComponent(asTrimmedString(materialId))}`
        : `${baseUrl}/materials.php`;

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
          return { ok: false, authenticated: false, unauthenticated: true, material: null };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payloadResponse);
        }
        return { ok: true, authenticated: true, material: normalizeMaterialRecord(payloadResponse?.data?.material || null) };
      } catch (error) {
        throw normalizeClientError(error);
      }
    }

    async function uploadSwatch(materialId, fileLike) {
      const normalizedId = asTrimmedString(materialId);
      if (!normalizedId) {
        throw new ForgeStaffMaterialCatalogApiError('invalid_request', 'A valid material is required.');
      }
      if (!fileLike || typeof fileLike !== 'object') {
        throw new ForgeStaffMaterialCatalogApiError('invalid_request', 'Choose a swatch to upload.');
      }

      const formData = formDataFactory();
      formData.append('material_id', normalizedId);
      formData.append('swatch', fileLike);

      try {
        const response = await performJsonRequest(fetchImpl, `${baseUrl}/material-swatch.php`, timeoutMs, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: formData
        });
        const payload = await parseJsonResponse(response);
        if (response.status === 401) {
          return { ok: false, authenticated: false, unauthenticated: true, material: null };
        }
        if (!response.ok) {
          throw buildServerError(response.status, payload);
        }
        return { ok: true, authenticated: true, material: normalizeMaterialRecord(payload?.data?.material || null) };
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
      listMaterials,
      getMaterial,
      createMaterial,
      updateMaterial,
      reorderMaterials,
      uploadSwatch
    };
  }

  function normalizeMaterialRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: asTrimmedString(normalized.id),
      material_name: asTrimmedString(normalized.material_name),
      swatch_path: asNullableTrimmedString(normalized.swatch_path),
      material_type: asNullableTrimmedString(normalized.material_type),
      color: asNullableTrimmedString(normalized.color),
      supplier: asNullableTrimmedString(normalized.supplier),
      production_method: asNullableTrimmedString(normalized.production_method),
      purchase_cost: asNullableTrimmedString(normalized.purchase_cost),
      purchase_quantity: asNullablePositiveInteger(normalized.purchase_quantity),
      cost_basis: asNullableTrimmedString(normalized.cost_basis),
      status: asTrimmedString(normalized.status),
      notes: asNullableTrimmedString(normalized.notes),
      image_width: asNullablePositiveInteger(normalized.image_width),
      image_height: asNullablePositiveInteger(normalized.image_height),
      sort_order: asPositiveInteger(normalized.sort_order),
      created_at: asTrimmedString(normalized.created_at),
      updated_at: asTrimmedString(normalized.updated_at)
    };
  }

  function normalizeMaterialInputPayload(input) {
    const normalized = input && typeof input === 'object' ? input : {};
    return {
      material_name: asTrimmedString(normalized.material_name),
      material_type: normalizeOptionalText(normalized.material_type),
      color: normalizeOptionalText(normalized.color),
      supplier: normalizeOptionalText(normalized.supplier),
      production_method: normalizeOptionalText(normalized.production_method),
      purchase_cost: normalizeOptionalText(normalized.purchase_cost),
      purchase_quantity: normalizeOptionalText(normalized.purchase_quantity),
      cost_basis: normalizeOptionalText(normalized.cost_basis),
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
    throw new ForgeStaffMaterialCatalogApiError('unavailable', SAFE_ERROR_MESSAGES.unavailable);
  }

  async function performJsonRequest(fetchImpl, url, timeoutMs, options) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      options = { ...options, signal: controller.signal };
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      return await fetchImpl(url, options);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ForgeStaffMaterialCatalogApiError('timeout', SAFE_ERROR_MESSAGES.timeout, { cause: error });
      }
      throw new ForgeStaffMaterialCatalogApiError('network_error', SAFE_ERROR_MESSAGES.network_error, { cause: error });
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function parseJsonResponse(response) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ForgeStaffMaterialCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response, { cause: error });
    }

    if (!payload || typeof payload !== 'object') {
      throw new ForgeStaffMaterialCatalogApiError('invalid_response', SAFE_ERROR_MESSAGES.invalid_response);
    }
    return payload;
  }

  function buildServerError(status, payload) {
    const code = asTrimmedString(payload?.error?.code) || 'server_error';
    const message = SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.server_error;
    const fields = payload?.error?.fields && typeof payload.error.fields === 'object' ? payload.error.fields : undefined;
    return new ForgeStaffMaterialCatalogApiError(code, message, { status, fields });
  }

  function normalizeClientError(error) {
    if (error instanceof ForgeStaffMaterialCatalogApiError) {
      return error;
    }
    return new ForgeStaffMaterialCatalogApiError('unavailable', SAFE_ERROR_MESSAGES.unavailable, { cause: error });
  }

  function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function asNullableTrimmedString(value) {
    const normalized = asTrimmedString(value);
    return normalized === '' ? null : normalized;
  }

  function asNullablePositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
      return Number.parseInt(value.trim(), 10);
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
    return normalized === '' ? null : normalized;
  }

  return {
    ForgeStaffMaterialCatalogApiError,
    createForgeStaffMaterialCatalogApiClient,
    normalizeMaterialRecord,
    normalizeMaterialInputPayload
  };
}));
