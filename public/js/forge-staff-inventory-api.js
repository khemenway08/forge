(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ForgeStaffInventoryApi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_BASE_URL = '/api/v1/staff/inventory';
  const DEFAULT_TIMEOUT_MS = 10000;
  const SAFE_MESSAGES = {
    invalid_request: 'Review the inventory adjustment and try again.',
    inventory_not_found: 'That inventory record could not be found.',
    inventory_conflict: 'This inventory record was updated elsewhere. Reload and try again.',
    storage_unavailable: 'Inventory storage is currently unavailable.',
    authentication_required: 'Staff authentication is required.',
    network_error: 'Inventory could not be reached.',
    timeout: 'Inventory did not respond in time.',
    invalid_response: 'Inventory returned an unexpected response.',
    server_error: 'Inventory is currently unavailable.'
  };

  class ForgeStaffInventoryApiError extends Error {
    constructor(code, message, options = {}) { super(message); this.name = 'ForgeStaffInventoryApiError'; this.code = code; this.status = options.status; }
  }

  function createForgeStaffInventoryApiClient(options = {}) {
    const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new ForgeStaffInventoryApiError('unavailable', 'Inventory is currently unavailable.');

    async function getSubjectInventory(subjectType, subjectId) {
      return request('GET', { subject_type: subjectType, subject_id: subjectId });
    }
    async function adjustSubjectInventory(input) { return request('POST', input); }
    async function listLocations(includeInactive = false) { return locationRequest('GET', `locations.php${includeInactive ? '?include_inactive=1' : ''}`); }
    async function saveLocation(input) { return locationRequest('POST', input.id ? 'location.php' : 'locations.php', input); }
    async function getLocationInventory(subjectType, subjectId) { return locationStockRequest('GET', { subject_type: subjectType, subject_id: subjectId }); }
    async function assignLocation(input) { return locationStockRequest('POST', { subject_type: input.subject_type, subject_id: input.subject_id, assign_location_id: input.location_id }); }
    async function initialCountLocation(input) { return locationStockRequest('POST', { subject_type: input.subject_type, subject_id: input.subject_id, initial_count_location_id: input.location_id, target_quantity: input.target_quantity }); }
    async function adjustLocationInventory(input) { return locationStockRequest('POST', input); }
    async function transferInventory(input) { return transferRequest(input); }
    async function request(method, input) {
      const subjectType = text(input?.subject_type);
      const subjectId = text(input?.subject_id);
      if (!subjectType || !subjectId) throw new ForgeStaffInventoryApiError('invalid_request', 'A valid inventory record is required.');
      const url = method === 'GET'
        ? `${baseUrl}/stock.php?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}`
        : `${baseUrl}/stock.php`;
      const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
      if (method === 'POST') { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(input); }
      try {
        const response = await withTimeout(fetchImpl(url, options), timeoutMs);
        const payload = await parse(response);
        if (response.status === 401) return { ok: false, authenticated: false, unauthenticated: true, inventory: null };
        if (!response.ok) throw serverError(response.status, payload);
        return { ok: true, authenticated: true, inventory: normalizeInventory(payload?.data?.inventory) };
      } catch (error) { throw normalizeError(error); }
    }
    async function locationRequest(method, path, input = null) {
      const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
      if (input) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(input); }
      try { const response = await withTimeout(fetchImpl(`${baseUrl}/${path}`, options), timeoutMs); const payload = await parse(response); if (response.status === 401) return { ok: false, authenticated: false, unauthenticated: true, locations: [] }; if (!response.ok) throw serverError(response.status, payload); return { ok: true, authenticated: true, locations: Array.isArray(payload?.data?.locations) ? payload.data.locations : [], location: payload?.data?.location || null }; } catch (error) { throw normalizeError(error); }
    }
    async function locationStockRequest(method, input) {
      const query = `subject_type=${encodeURIComponent(text(input?.subject_type))}&subject_id=${encodeURIComponent(text(input?.subject_id))}`;
      const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
      if (method === 'POST') { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(input); }
      try { const response = await withTimeout(fetchImpl(`${baseUrl}/location-stock.php${method === 'GET' ? `?${query}` : ''}`, options), timeoutMs); const payload = await parse(response); if (response.status === 401) return { ok:false, authenticated:false, unauthenticated:true, inventory:null }; if(!response.ok) throw serverError(response.status,payload); return { ok:true, authenticated:true, inventory:normalizeLocationInventory(payload?.data?.inventory) }; } catch(error) { throw normalizeError(error); }
    }
    async function transferRequest(input) { const options={method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(input)}; try { const response=await withTimeout(fetchImpl(`${baseUrl}/transfers.php`,options),timeoutMs);const payload=await parse(response);if(response.status===401)return {ok:false,authenticated:false,unauthenticated:true,inventory:null};if(!response.ok)throw serverError(response.status,payload);return {ok:true,authenticated:true,inventory:normalizeLocationInventory(payload?.data?.inventory)};}catch(error){throw normalizeError(error);} }
    return { getSubjectInventory, adjustSubjectInventory, listLocations, saveLocation, getLocationInventory, assignLocation, initialCountLocation, adjustLocationInventory, transferInventory };
  }

  function normalizeInventory(value) {
    const input = value && typeof value === 'object' ? value : {};
    const quantity = integerOrNull(input.on_hand_quantity);
    return { subject_type: text(input.subject_type), subject_id: text(input.subject_id), counted: Boolean(input.counted) && quantity !== null, on_hand_quantity: quantity, version: nonNegativeInteger(input.version), updated_at: nullableText(input.updated_at), movements: Array.isArray(input.movements) ? input.movements.map(normalizeMovement) : [] };
  }
  function normalizeMovement(value) { const input = value && typeof value === 'object' ? value : {}; return { id: text(input.id), movement_type: text(input.movement_type), reason_code: text(input.reason_code), quantity_before: integerOrNull(input.quantity_before), quantity_after: nonNegativeInteger(input.quantity_after), quantity_delta: integerOrNull(input.quantity_delta), note: nullableText(input.note), transfer_id: nullableText(input.transfer_id), inventory_location_id: nullableText(input.inventory_location_id), location_name: nullableText(input.location_name), created_at: text(input.created_at) }; }
  function normalizeLocationInventory(value) { const input=value&&typeof value==='object'?value:{}; const balances=Array.isArray(input.balances)?input.balances.map((b)=>({ ...b, on_hand_quantity:integerOrNull(b?.on_hand_quantity), version:nonNegativeInteger(b?.version) })):[]; const completeness=['not_counted','partial','complete'].includes(text(input.completeness))?text(input.completeness):'not_counted'; return { subject_type:text(input.subject_type),subject_id:text(input.subject_id),tracking_mode:text(input.tracking_mode),assigned_location_count:nonNegativeInteger(input.assigned_location_count),counted_location_count:nonNegativeInteger(input.counted_location_count),not_counted_location_count:nonNegativeInteger(input.not_counted_location_count),derived_quantity:integerOrNull(input.derived_quantity),completeness,balances,movements:Array.isArray(input.movements)?input.movements.map(normalizeMovement):[] }; }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function nullableText(value) { const result = text(value); return result || null; }
  function nonNegativeInteger(value) { const number = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN); return Number.isSafeInteger(number) && number >= 0 ? number : 0; }
  function integerOrNull(value) { if (value === null || value === undefined || value === '') return null; const number = typeof value === 'number' ? value : (typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN); return Number.isSafeInteger(number) ? number : null; }
  async function parse(response) { const raw = await response.text(); try { return JSON.parse(raw); } catch (_) { throw new ForgeStaffInventoryApiError('invalid_response', SAFE_MESSAGES.invalid_response, { status: response.status }); } }
  function serverError(status, payload) { const code = text(payload?.error?.code) || 'server_error'; return new ForgeStaffInventoryApiError(code, text(payload?.error?.message) || SAFE_MESSAGES[code] || SAFE_MESSAGES.server_error, { status }); }
  function normalizeError(error) { if (error instanceof ForgeStaffInventoryApiError) return error; if (error?.name === 'AbortError') return new ForgeStaffInventoryApiError('timeout', SAFE_MESSAGES.timeout); return new ForgeStaffInventoryApiError('network_error', SAFE_MESSAGES.network_error, { cause: error }); }
  function withTimeout(promise, milliseconds) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { const error = new Error('timeout'); error.name = 'AbortError'; reject(error); }, milliseconds); Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); }); }); }
  return { ForgeStaffInventoryApiError, createForgeStaffInventoryApiClient, normalizeInventory, normalizeLocationInventory, normalizeMovement };
}));
