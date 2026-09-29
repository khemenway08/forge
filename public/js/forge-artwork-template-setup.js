(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ForgeArtworkTemplateSetup = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const state = { registrations: [], loading: false, saving: false, message: '', tone: '', draft: null, pollTimer: null };
  let rootNode = null;
  let apiClient = null;
  let catalog = null;

  function mount(node, options = {}) {
    rootNode = node;
    apiClient = options.apiClient || apiClient;
    catalog = options.productCatalog || catalog;
    if (!rootNode || !apiClient) return;
    rootNode.onclick = handleClick;
    rootNode.onchange = handleChange;
    rootNode.oninput = handleInput;
    render();
    if (!state.loading && state.registrations.length === 0) load();
  }

  async function load(options = {}) {
    const silent = options.silent === true;
    let changed = false;
    if (!silent) { state.loading = true; render(); }
    try {
      const result = await apiClient.listArtworkTemplates();
      if (result.unauthenticated) { state.message = 'Staff authentication is required.'; state.tone = 'error'; return; }
      const registrations = result.registrations || [];
      changed = JSON.stringify(registrations) !== JSON.stringify(state.registrations);
      state.registrations = registrations;
    } catch (error) { state.message = error?.message || 'Artwork templates could not be loaded.'; state.tone = 'error'; }
    finally {
      if (!silent) state.loading = false;
      if (!silent || changed) render();
    }
  }

  function products() {
    const definitions = catalog?.PRODUCT_DEFINITIONS || {};
    return Object.values(definitions).filter((item) => item?.category === 'ornament').map((item) => ({ id: item.definitionId, label: item.displayName }));
  }

  function startDraft(productId = '') {
    const product = products().find((item) => item.id === productId) || products()[0];
    const existing = state.registrations.find((item) => item.product_definition_id === product?.id);
    state.draft = existing ? registrationToDraft(existing) : {
      product_definition_id: product?.id || '', artwork_label: product?.label || '', family_id: `${product?.id || 'ornament'}-artwork`, launcher_family_id: `${product?.id || 'ornament'}-artwork`, selector_type: 'none', single_filename: '', size_lines: 'Small = \nLarge = ', count_values: '3-10', count_pattern: ''
    };
    state.message = ''; render();
  }

  function registrationToDraft(registration) {
    const selector = registration.selector_type;
    const allowed = registration.allowed_variants || {};
    const resolution = registration.resolution_config || {};
    return {
      registration_id: registration.registration_id,
      product_definition_id: registration.product_definition_id,
      artwork_label: registration.artwork_label,
      family_id: registration.family_id,
      launcher_family_id: registration.launcher_family_id,
      selector_type: selector,
      single_filename: resolution.filename || '',
      size_lines: Object.entries(allowed).map(([key, label]) => `${label} = ${(resolution.filenames || {})[key] || ''}`).join('\n'),
      count_values: Object.keys(allowed).join(', '),
      count_pattern: resolution.pattern || ''
    };
  }

  function buildRegistration() {
    const draft = state.draft;
    const base = { product_definition_id: draft.product_definition_id, artwork_label: draft.artwork_label, family_id: draft.family_id, launcher_family_id: draft.launcher_family_id, selector_type: draft.selector_type };
    if (draft.selector_type === 'none') return { ...base, allowed_variants: { single: draft.artwork_label }, resolution_config: { filename: draft.single_filename } };
    if (draft.selector_type === 'size') {
      const allowed = {}; const filenames = {};
      String(draft.size_lines || '').split(/\r?\n/).forEach((line) => {
        const parts = line.split('='); if (parts.length < 2) return;
        const label = parts.shift().trim(); const filename = parts.join('=').trim(); const key = label.toLowerCase();
        if (key) { allowed[key] = label; filenames[key] = filename; }
      });
      return { ...base, allowed_variants: allowed, resolution_config: { filenames } };
    }
    const counts = parseCounts(draft.count_values); const allowed = {};
    counts.forEach((count) => { allowed[String(count)] = `${draft.artwork_label} ${count}-position`; });
    return { ...base, allowed_variants: allowed, resolution_config: { pattern: draft.count_pattern } };
  }

  function parseCounts(value) {
    const result = new Set();
    String(value || '').split(',').forEach((part) => {
      const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) { for (let count = Number(range[1]); count <= Number(range[2]) && count <= 250; count++) result.add(count); }
      else if (/^\d+$/.test(part.trim())) result.add(Number(part.trim()));
    });
    return [...result].sort((a, b) => a - b);
  }

  async function save() {
    if (!state.draft || state.saving) return;
    state.saving = true; state.message = '';
    try {
      const result = await apiClient.saveArtworkTemplate(buildRegistration());
      state.message = 'Draft artwork registration saved.'; state.tone = 'success';
      await load(); startDraft(result.registration.product_definition_id);
    } catch (error) { state.message = error?.message || 'Artwork registration could not be saved.'; state.tone = 'error'; render(); }
    finally { state.saving = false; render(); }
  }

  async function setActive(registrationId, active) {
    try { await apiClient.setArtworkTemplateActive(registrationId, active); state.message = active ? 'Artwork registration activated.' : 'Artwork registration deactivated.'; state.tone = 'success'; await load(); }
    catch (error) { state.message = error?.message || 'Artwork registration status could not be saved.'; state.tone = 'error'; render(); }
  }

  async function launch(registrationId) {
    try {
      const result = await apiClient.createArtworkSetupToken(registrationId);
      state.message = 'Opening Forge Artwork Launcher…'; state.tone = 'success'; render();
      window.location.href = result.setupUrl;
      let remaining = 30; clearInterval(state.pollTimer);
      let pollInFlight = false;
      state.pollTimer = setInterval(async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        remaining--;
        await load({ silent: true });
        const registration = state.registrations.find((item) => item.registration_id === registrationId);
        if (Object.keys(registration?.validations || {}).length > 0) {
          clearInterval(state.pollTimer);
          state.message = 'Artwork validation results received.';
          state.tone = 'success';
          render();
        } else if (remaining <= 0) {
          clearInterval(state.pollTimer);
          state.message = 'Artwork validation did not complete. Choose Validate Again on Mac to retry.';
          state.tone = 'error';
          render();
        }
        pollInFlight = false;
      }, 2000);
    } catch (error) { state.message = error?.message || 'The Mac setup action could not be started.'; state.tone = 'error'; render(); }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-artwork-action]'); if (!button) return;
    const action = button.dataset.artworkAction;
    if (action === 'new') startDraft();
    if (action === 'edit') startDraft(button.dataset.productId || '');
    if (action === 'cancel') { state.draft = null; render(); }
    if (action === 'save') save();
    if (action === 'validate') launch(button.dataset.registrationId || '');
    if (action === 'activate') setActive(button.dataset.registrationId || '', true);
    if (action === 'deactivate') setActive(button.dataset.registrationId || '', false);
    if (action === 'refresh') load();
  }
  function handleChange(event) { updateDraftField(event.target); if (event.target.dataset.artworkField === 'product_definition_id') startDraft(event.target.value); else render(); }
  function handleInput(event) { updateDraftField(event.target); }
  function updateDraftField(target) { const field = target?.dataset?.artworkField; if (state.draft && field) state.draft[field] = target.value; }

  function render() {
    if (!rootNode) return;
    const cards = state.registrations.map((registration) => {
      const validations = registration.validations || {};
      const variants = Object.entries(registration.allowed_variants || {}).map(([key, label]) => {
        const validation = validations[key]; const ready = validation?.validation_status === 'valid' && validation.configuration_revision === registration.configuration_revision && validation.configuration_digest === registration.configuration_digest;
        return `<li><strong>${escape(label)}</strong><span>${ready ? 'Ready' : (validation?.validation_error_code === 'master_missing' ? 'Master Missing' : 'Validation Required')}</span></li>`;
      }).join('');
      return `<article class="staff-order-card artwork-template-card"><div class="staff-order-card-header"><div><h3>${escape(registration.artwork_label)}</h3><p>${escape(registration.product_definition_id)} · Revision ${registration.configuration_revision}</p></div><span class="staff-status-badge">${registration.registration_status === 'active' ? 'Active' : 'Draft'}</span></div><ul class="artwork-template-variants">${variants}</ul><div class="staff-order-card-actions"><button class="secondary-button" type="button" data-artwork-action="edit" data-product-id="${escape(registration.product_definition_id)}">Edit</button><button class="primary-button" type="button" data-artwork-action="validate" data-registration-id="${escape(registration.registration_id)}">${Object.keys(validations).length ? 'Validate Again on Mac' : 'Set Up on Mac'}</button><button class="secondary-button" type="button" data-artwork-action="${registration.registration_status === 'active' ? 'deactivate' : 'activate'}" data-registration-id="${escape(registration.registration_id)}">${registration.registration_status === 'active' ? 'Deactivate' : 'Activate'}</button></div></article>`;
    }).join('');
    rootNode.innerHTML = `<section class="staff-admin-tool-card artwork-template-setup"><div class="staff-admin-tool-header"><div><p class="eyebrow">Production Artwork</p><h2>Artwork Template Setup</h2><p>Register canonical ornament templates and validate their approved masters on this Mac.</p></div><div><button class="secondary-button" type="button" data-artwork-action="refresh">Refresh</button> <button class="primary-button" type="button" data-artwork-action="new">Add Registration</button></div></div>${state.message ? `<p class="form-status ${state.tone === 'error' ? 'is-error' : 'is-success'}">${escape(state.message)}</p>` : ''}${state.draft ? editorMarkup() : ''}<div class="artwork-template-grid">${state.loading ? '<p>Loading artwork templates…</p>' : (cards || '<p>No artwork templates are registered. Ornament orders remain Template Not Configured.</p>')}</div></section>`;
  }

  function editorMarkup() {
    const draft = state.draft; const productOptions = products().map((product) => `<option value="${escape(product.id)}"${product.id === draft.product_definition_id ? ' selected' : ''}>${escape(product.label)} (${escape(product.id)})</option>`).join('');
    let resolution = `<label>Expected master filename<input data-artwork-field="single_filename" value="${escape(draft.single_filename)}" placeholder="MASTER.ai"></label>`;
    if (draft.selector_type === 'size') resolution = `<label>Sizes and exact filenames<textarea data-artwork-field="size_lines" rows="4" placeholder="Small = SMALL_MASTER.ai&#10;Large = LARGE_MASTER.ai">${escape(draft.size_lines)}</textarea></label>`;
    if (draft.selector_type === 'personalization_count') resolution = `<label>Allowed counts<input data-artwork-field="count_values" value="${escape(draft.count_values)}" placeholder="3-10 or 3, 4, 5"></label><label>Exact filename pattern<input data-artwork-field="count_pattern" value="${escape(draft.count_pattern)}" placeholder="FAMILY {count} NAME_MASTER.ai"></label>`;
    return `<div class="artwork-template-editor"><label>Forge ornament product<select data-artwork-field="product_definition_id">${productOptions}</select></label><label>Template type<select data-artwork-field="selector_type"><option value="none"${draft.selector_type === 'none' ? ' selected' : ''}>Single Master</option><option value="size"${draft.selector_type === 'size' ? ' selected' : ''}>By Size</option><option value="personalization_count"${draft.selector_type === 'personalization_count' ? ' selected' : ''}>By Personalization Position Count</option></select></label><label>Artwork label<input data-artwork-field="artwork_label" value="${escape(draft.artwork_label)}"></label><label>Family ID<input data-artwork-field="family_id" value="${escape(draft.family_id)}"></label><label>Launcher family ID<input data-artwork-field="launcher_family_id" value="${escape(draft.launcher_family_id)}"></label>${resolution}<div class="staff-order-card-actions"><button class="primary-button" type="button" data-artwork-action="save">${state.saving ? 'Saving…' : 'Save Draft'}</button><button class="secondary-button" type="button" data-artwork-action="cancel">Cancel</button></div></div>`;
  }
  function escape(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character])); }
  return { mount, parseCounts, buildRegistrationForTest: () => buildRegistration() };
}));
