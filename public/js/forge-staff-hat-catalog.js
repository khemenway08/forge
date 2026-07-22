(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffHatCatalog = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATUS_LABELS = {
    review: 'In Review',
    active: 'Active',
    retired: 'Retired'
  };
  const DEFAULT_FORM_VALUES = {
    hat_name: '',
    manufacturer: '',
    model: '',
    color: '',
    vendor: '',
    base_cost: '',
    status: 'review',
    notes: ''
  };
  const MISSING_PHOTO_COPY = 'No photo yet';

  function createStaffHatCatalogModule(options = {}) {
    const apiClient = options.apiClient || null;
    const documentRef = options.document || document;
    const windowLike = options.window || window;
    const canLoadProtectedRecords = typeof options.canLoadProtectedRecords === 'function'
      ? options.canLoadProtectedRecords
      : () => true;
    const state = {
      loading: false,
      loaded: false,
      error: '',
      requiresAuthentication: false,
      dialogSaving: false,
      records: [],
      filters: {
        search: '',
        manufacturer: '',
        model: '',
        status: ''
      },
      dialogOpen: false,
      dialogMode: 'create',
      dialogError: '',
      dialogFieldErrors: {},
      dialogValues: { ...DEFAULT_FORM_VALUES },
      dialogHatId: '',
      dialogPhotoPath: '',
      dialogPhotoFile: null,
      dialogPhotoFileName: ''
    };

    let container = null;
    let dialogBackdrop = null;
    let dialogNode = null;
    let formNode = null;
    let statusNode = null;
    let lastFocusTarget = null;

    function render(nextContainer) {
      if (nextContainer) {
        container = nextContainer;
      }

      if (!container) {
        return;
      }

      ensureDialogUi();
      bindContainerEvents();
      renderContent();

      if (!canLoadProtectedRecords()) {
        return;
      }

      if (!state.loaded && !state.loading && (!state.error || state.requiresAuthentication)) {
        loadHats();
      }
    }

    async function loadHats() {
      if (!apiClient || typeof apiClient.listHats !== 'function') {
        state.error = 'Hat catalog is currently unavailable.';
        state.loading = false;
        renderContent();
        return;
      }

      state.loading = true;
      state.error = '';
      state.requiresAuthentication = false;
      renderContent();

      try {
        const result = await apiClient.listHats();
        if (!result || result.authenticated === false || result.unauthenticated) {
          state.loading = false;
          state.loaded = false;
          state.requiresAuthentication = true;
          state.error = 'Staff authentication is required.';
          renderContent();
          return;
        }

        state.records = Array.isArray(result.hats)
          ? result.hats.map(normalizeHatRecord).sort(compareHatsByName)
          : [];
        state.loaded = true;
        state.loading = false;
        state.error = '';
        state.requiresAuthentication = false;
        renderContent();
      } catch (error) {
        state.loading = false;
        state.loaded = false;
        state.requiresAuthentication = false;
        state.error = safeErrorMessage(error, 'Hat catalog could not be loaded right now.');
        renderContent();
      }
    }

    function renderContent() {
      if (!container) {
        return;
      }

      const filteredRecords = filterHatRecords(state.records, state.filters);
      const hasActiveFilters = Boolean(
        state.filters.search || state.filters.manufacturer || state.filters.model || state.filters.status
      );
      const manufacturerOptions = collectHatFilterOptions(state.records, 'manufacturer');
      const modelOptions = collectHatFilterOptions(state.records, 'model');
      const sectionBody = renderHatsBody(filteredRecords, hasActiveFilters);

      container.innerHTML = `
        <section class="staff-catalog-designs" role="tabpanel" aria-labelledby="staff-catalog-tab-hats">
          <div class="staff-catalog-designs-toolbar">
            <div class="staff-catalog-designs-heading">
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3>Hats</h3>
              <p>Search and manage blank hat records for future design combinations without affecting customer ordering.</p>
            </div>
            <div class="staff-catalog-designs-actions">
              <p class="staff-catalog-designs-count" data-catalog-hat-results-count>${filteredRecords.length} result${filteredRecords.length === 1 ? '' : 's'}</p>
              <button class="primary-button" type="button" data-action="catalog-add-hat">Add Hat</button>
            </div>
          </div>
          <div class="staff-catalog-designs-filters">
            <label class="staff-catalog-designs-filter">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.filters.search)}" placeholder="Search hats" data-action="catalog-hat-search">
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Manufacturer</span>
              <select data-action="catalog-filter-hat-manufacturer">${renderDynamicSelectOptions(manufacturerOptions, state.filters.manufacturer, 'All Manufacturers')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Model</span>
              <select data-action="catalog-filter-hat-model">${renderDynamicSelectOptions(modelOptions, state.filters.model, 'All Models')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Status</span>
              <select data-action="catalog-filter-hat-status">${renderStatusOptions(state.filters.status, 'All Statuses')}</select>
            </label>
            <div class="staff-catalog-designs-filter-clear">
              <button class="secondary-button" type="button" data-action="catalog-clear-hat-filters">Clear Filters</button>
            </div>
          </div>
          ${sectionBody}
        </section>
      `;
    }

    function renderHatsBody(filteredRecords, hasActiveFilters) {
      if (state.loading) {
        return '<div class="staff-catalog-designs-state"><p>Loading shared hat records...</p></div>';
      }

      if (state.error) {
        return `
          <div class="staff-catalog-designs-state staff-catalog-designs-state--error">
            <p>${escapeHtml(state.error)}</p>
            <button class="secondary-button" type="button" data-action="catalog-retry-hat-load">Retry</button>
          </div>
        `;
      }

      if (state.records.length === 0) {
        return `
          <div class="staff-catalog-designs-state">
            <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
            <h4>No hats yet</h4>
            <p>Add the first blank hat record to start building the shared hat library.</p>
          </div>
        `;
      }

      if (filteredRecords.length === 0) {
        return `
          <div class="staff-catalog-designs-state">
            <h4>No hats match these filters</h4>
            <p>${hasActiveFilters ? 'Adjust the search or clear filters to see more shared hats.' : 'No shared hats are available yet.'}</p>
          </div>
        `;
      }

      return `
        <div class="staff-design-card-grid">
          ${filteredRecords.map((record) => renderHatCard(record)).join('')}
        </div>
      `;
    }

    function renderHatCard(record) {
      const photo = getHatPhotoDisplay(record);
      return `
        <button
          class="staff-design-card"
          type="button"
          data-action="catalog-edit-hat"
          data-hat-id="${escapeAttribute(record.id)}"
          aria-label="Edit ${escapeAttribute(record.hat_name)}"
        >
          <div class="staff-design-card-thumb">
            ${photo.html}
          </div>
          <div class="staff-design-card-body">
            <div class="staff-design-card-top">
              <h4>${escapeHtml(record.hat_name)}</h4>
              <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(record.status || 'review')}">${escapeHtml(getHatStatusLabel(record.status))}</span>
            </div>
            <dl class="staff-design-card-meta">
              ${renderHatMetaRow('Manufacturer', record.manufacturer)}
              ${renderHatMetaRow('Model', record.model)}
              ${renderHatMetaRow('Color', record.color)}
              ${renderHatMetaRow('Vendor', record.vendor)}
              ${renderHatMetaRow('Base Cost', formatHatBaseCost(record.base_cost))}
            </dl>
          </div>
        </button>
      `;
    }

    function bindContainerEvents() {
      if (!container || container.dataset.catalogHatBound === 'true') {
        return;
      }

      container.dataset.catalogHatBound = 'true';
      container.addEventListener('click', onContainerClick);
      container.addEventListener('input', onContainerInput);
      container.addEventListener('change', onContainerChange);
    }

    function onContainerClick(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }

      if (action === 'catalog-retry-hat-load') {
        loadHats();
        return;
      }

      if (action === 'catalog-clear-hat-filters') {
        state.filters = {
          search: '',
          manufacturer: '',
          model: '',
          status: ''
        };
        renderContent();
        return;
      }

      if (action === 'catalog-add-hat') {
        openDialog('create', null, event.target);
        return;
      }

      if (action === 'catalog-edit-hat') {
        const hatId = event.target.closest('[data-hat-id]')?.dataset.hatId || '';
        const record = state.records.find((item) => item.id === hatId) || null;
        if (!record) {
          return;
        }
        openDialog('edit', record, event.target);
      }
    }

    function onContainerInput(event) {
      const action = event.target?.dataset?.action;
      if (action === 'catalog-hat-search') {
        state.filters.search = String(event.target.value || '');
        renderContent();
      }
    }

    function onContainerChange(event) {
      const action = event.target?.dataset?.action;
      if (action === 'catalog-filter-hat-manufacturer') {
        state.filters.manufacturer = String(event.target.value || '').trim();
        renderContent();
        return;
      }
      if (action === 'catalog-filter-hat-model') {
        state.filters.model = String(event.target.value || '').trim();
        renderContent();
        return;
      }
      if (action === 'catalog-filter-hat-status') {
        state.filters.status = String(event.target.value || '').trim();
        renderContent();
      }
    }

    function ensureDialogUi() {
      if (dialogBackdrop && dialogNode && formNode && statusNode) {
        return;
      }

      dialogBackdrop = documentRef.createElement('div');
      dialogBackdrop.className = 'staff-design-dialog-backdrop';
      dialogBackdrop.hidden = true;
      dialogBackdrop.innerHTML = `
        <div class="staff-design-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-hat-dialog-title" tabindex="-1">
          <div class="staff-design-dialog-header">
            <div>
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3 id="staff-hat-dialog-title">Add Hat</h3>
            </div>
            <button class="secondary-button staff-design-dialog-close" type="button" data-action="catalog-close-hat-dialog">Close</button>
          </div>
          <form class="staff-design-dialog-form" novalidate>
            <div class="staff-design-dialog-grid">
              <label class="staff-design-dialog-field">
                <span>Hat Name</span>
                <input id="catalog-hat-name" name="hat_name" type="text" maxlength="160" required>
              </label>
              <label class="staff-design-dialog-field">
                <span>Status</span>
                <select id="catalog-hat-status" name="status">${renderStatusOptions('', '')}</select>
              </label>
              <label class="staff-design-dialog-field">
                <span>Manufacturer</span>
                <input id="catalog-hat-manufacturer" name="manufacturer" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Model</span>
                <input id="catalog-hat-model" name="model" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Color</span>
                <input id="catalog-hat-color" name="color" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Vendor</span>
                <input id="catalog-hat-vendor" name="vendor" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Base Cost</span>
                <input id="catalog-hat-base-cost" name="base_cost" type="text" inputmode="decimal" maxlength="16" placeholder="e.g. 12.50">
              </label>
              <div class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Hat Photo</span>
                <div class="staff-design-thumbnail-panel">
                  <div class="staff-design-thumbnail-preview" data-catalog-hat-photo-preview></div>
                  <label class="secondary-button staff-design-thumbnail-input">
                    <input id="catalog-hat-photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp">
                    Choose Photo
                  </label>
                  <p class="staff-design-thumbnail-copy" data-catalog-hat-photo-copy>No photo selected</p>
                </div>
              </div>
              <label class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Notes</span>
                <textarea id="catalog-hat-notes" name="notes" rows="5" maxlength="4000"></textarea>
              </label>
            </div>
            <p class="staff-orders-status staff-design-dialog-status" data-catalog-hat-dialog-status aria-live="polite"></p>
            <div class="staff-design-dialog-actions">
              <button class="primary-button" type="submit" data-action="catalog-save-hat">Save Hat</button>
              <button class="secondary-button" type="button" data-action="catalog-close-hat-dialog">Cancel</button>
            </div>
          </form>
        </div>
      `;

      documentRef.body.appendChild(dialogBackdrop);
      dialogNode = dialogBackdrop.querySelector('.staff-design-dialog');
      formNode = dialogBackdrop.querySelector('.staff-design-dialog-form');
      statusNode = dialogBackdrop.querySelector('[data-catalog-hat-dialog-status]');

      dialogBackdrop.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (event.target === dialogBackdrop || action === 'catalog-close-hat-dialog') {
          closeDialog();
        }
      });
      dialogBackdrop.addEventListener('change', onDialogChange);
      dialogBackdrop.addEventListener('keydown', onDialogKeydown);
      formNode.addEventListener('submit', onDialogSubmit);
    }

    function openDialog(mode, record, trigger) {
      ensureDialogUi();
      lastFocusTarget = trigger instanceof HTMLElement ? trigger : documentRef.activeElement;
      state.dialogOpen = true;
      state.dialogMode = mode;
      state.dialogError = '';
      state.dialogFieldErrors = {};
      state.dialogHatId = record?.id || '';
      state.dialogValues = record ? {
        hat_name: record.hat_name || '',
        manufacturer: record.manufacturer || '',
        model: record.model || '',
        color: record.color || '',
        vendor: record.vendor || '',
        base_cost: record.base_cost || '',
        status: record.status || DEFAULT_FORM_VALUES.status,
        notes: record.notes || ''
      } : { ...DEFAULT_FORM_VALUES };
      state.dialogPhotoPath = record?.photo_path || '';
      state.dialogPhotoFile = null;
      state.dialogPhotoFileName = '';
      renderDialog();
      dialogBackdrop.hidden = false;
      dialogNode.focus();
      windowLike.setTimeout(() => {
        dialogBackdrop.querySelector('[name="hat_name"]')?.focus();
      }, 0);
    }

    function closeDialog() {
      if (!dialogBackdrop) {
        return;
      }
      state.dialogOpen = false;
      state.dialogSaving = false;
      dialogBackdrop.hidden = true;
      if (lastFocusTarget instanceof HTMLElement) {
        lastFocusTarget.focus();
      }
    }

    function renderDialog() {
      if (!dialogBackdrop || !dialogNode || !formNode || !statusNode) {
        return;
      }

      dialogNode.querySelector('#staff-hat-dialog-title').textContent = state.dialogMode === 'edit'
        ? 'Edit Hat'
        : 'Add Hat';

      const values = state.dialogValues;
      setFormValue('hat_name', values.hat_name);
      setFormValue('manufacturer', values.manufacturer);
      setFormValue('model', values.model);
      setFormValue('color', values.color);
      setFormValue('vendor', values.vendor);
      setFormValue('base_cost', values.base_cost);
      setFormValue('status', values.status);
      setFormValue('notes', values.notes);

      formNode.setAttribute('aria-busy', state.dialogSaving ? 'true' : 'false');
      formNode.querySelectorAll('input, select, textarea, button').forEach((node) => {
        if (node.dataset.action === 'catalog-close-hat-dialog') {
          node.disabled = false;
          return;
        }
        node.disabled = state.dialogSaving;
      });

      const saveButton = formNode.querySelector('[data-action="catalog-save-hat"]');
      if (saveButton) {
        saveButton.textContent = state.dialogSaving ? 'Saving Hat...' : 'Save Hat';
      }

      renderPhotoPanel();
      renderDialogStatus();
      applyDialogFieldErrors();
    }

    function renderPhotoPanel() {
      const previewNode = dialogBackdrop.querySelector('[data-catalog-hat-photo-preview]');
      const copyNode = dialogBackdrop.querySelector('[data-catalog-hat-photo-copy]');
      if (!previewNode || !copyNode) {
        return;
      }

      if (state.dialogPhotoPath) {
        previewNode.innerHTML = `<img src="${escapeAttribute(state.dialogPhotoPath)}" alt="Current hat photo">`;
      } else {
        previewNode.innerHTML = `<div class="staff-design-thumbnail-preview-placeholder">${escapeHtml(MISSING_PHOTO_COPY)}</div>`;
      }

      copyNode.textContent = state.dialogPhotoFileName
        ? `Selected: ${state.dialogPhotoFileName}`
        : (state.dialogPhotoPath ? 'Current photo will remain until replaced.' : 'No photo selected');
    }

    function renderDialogStatus() {
      if (!statusNode) {
        return;
      }

      const fieldErrorMessages = Object.values(state.dialogFieldErrors || {});
      statusNode.textContent = state.dialogError || fieldErrorMessages[0] || '';
    }

    function applyDialogFieldErrors() {
      if (!formNode) {
        return;
      }

      formNode.querySelectorAll('.staff-design-dialog-field').forEach((field) => {
        field.classList.remove('staff-design-dialog-field--error');
      });

      Object.keys(state.dialogFieldErrors || {}).forEach((fieldName) => {
        const input = formNode.querySelector(`[name="${fieldName}"]`);
        const field = input?.closest('.staff-design-dialog-field');
        if (field) {
          field.classList.add('staff-design-dialog-field--error');
        }
      });
    }

    function onDialogChange(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.name !== 'photo') {
        return;
      }

      const file = target.files && target.files[0] ? target.files[0] : null;
      state.dialogPhotoFile = file;
      state.dialogPhotoFileName = file ? String(file.name || '').trim() : '';
      state.dialogFieldErrors = {
        ...state.dialogFieldErrors
      };
      delete state.dialogFieldErrors.photo;
      renderDialog();
    }

    function onDialogKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    }

    async function onDialogSubmit(event) {
      event.preventDefault();
      if (state.dialogSaving) {
        return;
      }
      if (!apiClient) {
        state.dialogError = 'Hat catalog is currently unavailable.';
        renderDialog();
        return;
      }

      const formData = new FormData(formNode);
      const payload = {
        hat_name: String(formData.get('hat_name') || ''),
        manufacturer: String(formData.get('manufacturer') || ''),
        model: String(formData.get('model') || ''),
        color: String(formData.get('color') || ''),
        vendor: String(formData.get('vendor') || ''),
        base_cost: String(formData.get('base_cost') || ''),
        status: String(formData.get('status') || ''),
        notes: String(formData.get('notes') || '')
      };

      state.dialogFieldErrors = validateHatDialogPayload(payload);
      state.dialogError = '';
      if (Object.keys(state.dialogFieldErrors).length > 0) {
        renderDialog();
        return;
      }

      state.dialogSaving = true;
      renderDialog();

      try {
        const saveResult = state.dialogMode === 'edit'
          ? await apiClient.updateHat(state.dialogHatId, payload)
          : await apiClient.createHat(payload);
        let hat = normalizeHatRecord(saveResult.hat);

        if (state.dialogPhotoFile) {
          const uploadResult = await apiClient.uploadPhoto(hat.id, state.dialogPhotoFile);
          hat = normalizeHatRecord(uploadResult.hat);
        }

        upsertHatRecord(hat);
        state.dialogSaving = false;
        closeDialog();
        renderContent();
      } catch (error) {
        state.dialogSaving = false;
        state.dialogError = safeErrorMessage(error, 'Hat could not be saved right now.');
        state.dialogFieldErrors = error?.fields && typeof error.fields === 'object' ? error.fields : {};
        renderDialog();
      }
    }

    function upsertHatRecord(hat) {
      const normalized = normalizeHatRecord(hat);
      const nextRecords = state.records.slice();
      const index = nextRecords.findIndex((record) => record.id === normalized.id);
      if (index >= 0) {
        nextRecords[index] = normalized;
      } else {
        nextRecords.push(normalized);
      }
      state.records = nextRecords.sort(compareHatsByName);
      state.loaded = true;
      state.error = '';
    }

    function setFormValue(fieldName, value) {
      const field = formNode?.querySelector(`[name="${fieldName}"]`);
      if (!field) {
        return;
      }
      field.value = value || '';
    }

    return {
      render,
      closeDialog,
      reload: loadHats
    };
  }

  function validateHatDialogPayload(payload) {
    const errors = {};
    if (!String(payload.hat_name || '').trim()) {
      errors.hat_name = 'Hat name is required.';
    }
    const baseCost = String(payload.base_cost || '').trim();
    if (baseCost && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(baseCost)) {
      errors.base_cost = 'Base cost must be a nonnegative amount with up to two decimals.';
    }
    return errors;
  }

  function filterHatRecords(records, filters = {}) {
    const normalizedRecords = Array.isArray(records) ? records.map(normalizeHatRecord) : [];
    const search = String(filters.search || '').trim().toLowerCase();
    const manufacturer = String(filters.manufacturer || '').trim().toLowerCase();
    const model = String(filters.model || '').trim().toLowerCase();
    const status = String(filters.status || '').trim();

    return normalizedRecords.filter((record) => {
      if (search) {
        const haystack = [
          record.hat_name,
          record.manufacturer,
          record.model,
          record.color,
          record.vendor,
          record.notes
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (manufacturer && String(record.manufacturer || '').toLowerCase() !== manufacturer) {
        return false;
      }
      if (model && String(record.model || '').toLowerCase() !== model) {
        return false;
      }
      if (status && record.status !== status) {
        return false;
      }
      return true;
    });
  }

  function normalizeHatRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: typeof normalized.id === 'string' ? normalized.id.trim() : '',
      hat_name: typeof normalized.hat_name === 'string' ? normalized.hat_name.trim() : '',
      photo_path: normalizeNullableString(normalized.photo_path),
      manufacturer: normalizeNullableString(normalized.manufacturer),
      model: normalizeNullableString(normalized.model),
      color: normalizeNullableString(normalized.color),
      vendor: normalizeNullableString(normalized.vendor),
      base_cost: normalizeNullableString(normalized.base_cost),
      status: typeof normalized.status === 'string' ? normalized.status.trim() : '',
      notes: normalizeNullableString(normalized.notes),
      created_at: typeof normalized.created_at === 'string' ? normalized.created_at.trim() : '',
      updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at.trim() : ''
    };
  }

  function getHatPhotoDisplay(record) {
    const normalized = normalizeHatRecord(record);
    if (normalized.photo_path) {
      return {
        type: 'image',
        src: normalized.photo_path,
        alt: `${normalized.hat_name || 'Hat'} photo`,
        html: `<img src="${escapeAttribute(normalized.photo_path)}" alt="${escapeAttribute((normalized.hat_name || 'Hat') + ' photo')}">`
      };
    }

    return {
      type: 'placeholder',
      src: '',
      alt: MISSING_PHOTO_COPY,
      html: `<div class="staff-design-card-thumb-placeholder">${escapeHtml(MISSING_PHOTO_COPY)}</div>`
    };
  }

  function collectHatFilterOptions(records, fieldName) {
    const values = new Set();
    records.forEach((record) => {
      const value = normalizeHatRecord(record)[fieldName];
      if (value) {
        values.add(value);
      }
    });
    return [...values].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  function renderDynamicSelectOptions(values, selectedValue, emptyLabel) {
    const options = [];
    options.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    values.forEach((value) => {
      options.push(
        `<option value="${escapeAttribute(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(value)}</option>`
      );
    });
    return options.join('');
  }

  function renderStatusOptions(selectedValue, emptyLabel) {
    const options = [];
    if (emptyLabel !== '') {
      options.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    }
    Object.entries(STATUS_LABELS).forEach(([value, label]) => {
      options.push(
        `<option value="${escapeAttribute(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>`
      );
    });
    return options.join('');
  }

  function renderHatMetaRow(label, value) {
    if (!value) {
      return '';
    }
    return `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `;
  }

  function formatHatBaseCost(value) {
    const normalized = normalizeNullableString(value);
    if (!normalized) {
      return '';
    }
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) {
      return normalized;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(numericValue);
  }

  function compareHatsByName(left, right) {
    return String(left.hat_name || '').localeCompare(String(right.hat_name || ''), undefined, {
      sensitivity: 'base'
    });
  }

  function safeErrorMessage(error, fallbackMessage) {
    if (error && typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
    return fallbackMessage;
  }

  function normalizeNullableString(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }

  function getHatStatusLabel(value) {
    return STATUS_LABELS[value] || 'In Review';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  return {
    STATUS_LABELS,
    DEFAULT_FORM_VALUES,
    MISSING_PHOTO_COPY,
    createStaffHatCatalogModule,
    filterHatRecords,
    normalizeHatRecord,
    getHatPhotoDisplay,
    getHatStatusLabel,
    formatHatBaseCost
  };
}));
