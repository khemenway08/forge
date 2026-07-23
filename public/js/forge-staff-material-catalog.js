(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffMaterialCatalog = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATUS_LABELS = {
    review: 'In Review',
    active: 'Active',
    retired: 'Retired'
  };
  const COST_BASIS_LABELS = {
    per_patch: 'Per Patch',
    per_sheet: 'Per Sheet',
    per_pack: 'Per Pack',
    per_square_inch: 'Per Square Inch',
    other: 'Other'
  };
  const DEFAULT_FORM_VALUES = {
    material_name: '',
    material_type: '',
    color: '',
    supplier: '',
    production_method: '',
    purchase_cost: '',
    purchase_quantity: '',
    cost_basis: '',
    status: 'review',
    notes: ''
  };
  const MISSING_SWATCH_COPY = 'No swatch yet';
  const SORT_OPTIONS = [
    { value: 'custom', label: 'Custom Order' },
    { value: 'az', label: 'A–Z' },
    { value: 'recent', label: 'Recently Added' },
    { value: 'status', label: 'Status' },
    { value: 'material_type', label: 'Material Type' },
    { value: 'color', label: 'Color' },
    { value: 'production_method', label: 'Production Method' }
  ];

  function createStaffMaterialCatalogModule(options = {}) {
    const apiClient = options.apiClient || null;
    const documentRef = options.document || document;
    const windowLike = options.window || window;
    const orderingApi = resolveCatalogOrderingApi(options.orderingApi);
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
        material_type: '',
        production_method: '',
        status: ''
      },
      dialogOpen: false,
      dialogMode: 'create',
      dialogError: '',
      dialogFieldErrors: {},
      dialogValues: { ...DEFAULT_FORM_VALUES },
      dialogMaterialId: '',
      dialogSwatchPath: '',
      dialogSwatchFile: null,
      dialogSwatchFileName: '',
      sortKey: 'custom',
      notice: '',
      noticeTone: 'muted',
      announcement: ''
    };

    let container = null;
    let dialogBackdrop = null;
    let dialogNode = null;
    let formNode = null;
    let statusNode = null;
    let lastFocusTarget = null;
    const reorderController = orderingApi?.createCatalogReorderController({
      document: documentRef,
      window: windowLike,
      cardSelector: '[data-catalog-order-id]',
      onStateChange() {
        renderContent();
      },
      onAnnounce(message) {
        state.announcement = String(message || '');
        renderContent();
      },
      async onCommit(orderedIds) {
        return saveMaterialOrder(orderedIds);
      },
      getLabel(itemId) {
        const record = state.records.find((entry) => entry.id === itemId);
        return record?.material_name || 'catalog record';
      }
    }) || null;

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
        loadMaterials();
      }
    }

    async function loadMaterials() {
      if (!apiClient || typeof apiClient.listMaterials !== 'function') {
        state.error = 'Material catalog is currently unavailable.';
        state.loading = false;
        renderContent();
        return;
      }

      state.loading = true;
      state.error = '';
      state.requiresAuthentication = false;
      renderContent();

      try {
        const result = await apiClient.listMaterials();
        if (!result || result.authenticated === false || result.unauthenticated) {
          state.loading = false;
          state.loaded = false;
          state.requiresAuthentication = true;
          state.error = 'Staff authentication is required.';
          renderContent();
          return;
        }

        state.records = Array.isArray(result.materials)
          ? sortRecordsForCustomOrder(result.materials.map(normalizeMaterialRecord))
          : [];
        reorderController?.sync(state.records.map((record) => record.id));
        state.loaded = true;
        state.loading = false;
        state.error = '';
        state.requiresAuthentication = false;
        renderContent();
      } catch (error) {
        state.loading = false;
        state.loaded = false;
        state.requiresAuthentication = false;
        state.error = safeErrorMessage(error, 'Material catalog could not be loaded right now.');
        renderContent();
      }
    }

    function renderContent(options = {}) {
      if (!container) {
        return;
      }

      const focusState = options.preserveFocus ? captureCatalogFocus() : null;
      const filteredRecords = filterMaterialRecords(state.records, state.filters);
      const reorderAvailability = getReorderAvailability();
      const sortedRecords = sortMaterialRecords(filteredRecords, state.sortKey);
      const hasActiveFilters = Boolean(
        state.filters.search || state.filters.material_type || state.filters.production_method || state.filters.status
      );
      const materialTypeOptions = collectMaterialFilterOptions(state.records, 'material_type');
      const productionMethodOptions = collectMaterialFilterOptions(state.records, 'production_method');

      container.innerHTML = `
        <section class="staff-catalog-designs" role="tabpanel" aria-labelledby="staff-catalog-tab-materials">
          <div class="staff-catalog-designs-toolbar">
            <div class="staff-catalog-designs-heading">
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3>Materials</h3>
              <p>Search and manage patch and production materials without changing customer ordering.</p>
            </div>
            <div class="staff-catalog-designs-actions">
              <p class="staff-catalog-designs-count" data-catalog-material-results-count>${filteredRecords.length} result${filteredRecords.length === 1 ? '' : 's'}</p>
              <button class="primary-button" type="button" data-action="catalog-add-material">Add Material</button>
            </div>
          </div>
          <div class="staff-catalog-designs-filters">
            <label class="staff-catalog-designs-filter staff-catalog-designs-filter--search">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.filters.search)}" placeholder="Search materials" data-action="catalog-material-search">
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Material Type</span>
              <select data-action="catalog-filter-material-type">${renderDynamicSelectOptions(materialTypeOptions, state.filters.material_type, 'All Types')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Production Method</span>
              <select data-action="catalog-filter-material-production-method">${renderDynamicSelectOptions(productionMethodOptions, state.filters.production_method, 'All Methods')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Status</span>
              <select data-action="catalog-filter-material-status">${renderStatusOptions(state.filters.status, 'All Statuses')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Sort</span>
              <select data-action="catalog-sort-materials">${renderStaticOptions(SORT_OPTIONS, state.sortKey)}</select>
            </label>
            <div class="staff-catalog-designs-filter-clear">
              <button class="secondary-button" type="button" data-action="catalog-clear-material-filters">Clear Filters</button>
            </div>
          </div>
          <div class="staff-catalog-sort-row">
            <p class="staff-catalog-sort-help">${escapeHtml(reorderAvailability.reason || 'Drag handles appear while Custom Order is active.')}</p>
            ${state.notice ? `<div class="staff-inline-notice staff-inline-notice--${escapeAttribute(state.noticeTone)}" role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` : ''}
          </div>
          <p class="staff-catalog-reorder-announcer" aria-live="polite">${escapeHtml(state.announcement)}</p>
          ${renderMaterialsBody(sortedRecords, hasActiveFilters, reorderAvailability)}
        </section>
      `;
      restoreCatalogFocus(focusState);
    }

    function captureCatalogFocus() {
      const activeElement = documentRef?.activeElement;
      if (!activeElement || !container || !isElementInsideContainer(activeElement)) {
        return null;
      }

      const action = activeElement.dataset?.action || '';
      if (![
        'catalog-material-search',
        'catalog-filter-material-type',
        'catalog-filter-material-production-method',
        'catalog-filter-material-status',
        'catalog-sort-materials'
      ].includes(action)) {
        return null;
      }

      return {
        action,
        selectionStart: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : null,
        selectionEnd: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : null
      };
    }

    function restoreCatalogFocus(focusState) {
      if (!focusState || !container || typeof container.querySelector !== 'function') {
        return;
      }

      const nextElement = container.querySelector(`[data-action="${focusState.action}"]`);
      if (!nextElement || typeof nextElement.focus !== 'function') {
        return;
      }

      nextElement.focus({ preventScroll: true });
      if (
        Number.isInteger(focusState.selectionStart)
        && Number.isInteger(focusState.selectionEnd)
        && typeof nextElement.setSelectionRange === 'function'
      ) {
        nextElement.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
      }
    }

    function isElementInsideContainer(element) {
      if (typeof container.contains === 'function') {
        return container.contains(element);
      }
      if (typeof element.closest === 'function') {
        return element.closest('[role="tabpanel"]') !== null;
      }
      return true;
    }

    function renderMaterialsBody(filteredRecords, hasActiveFilters, reorderAvailability) {
      if (state.loading) {
        return '<div class="staff-catalog-designs-state"><p>Loading shared material records...</p></div>';
      }
      if (state.error) {
        return `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.error)}</p><button class="secondary-button" type="button" data-action="catalog-retry-material-load">Retry</button></div>`;
      }
      if (state.records.length === 0) {
        return '<div class="staff-catalog-designs-state"><p class="eyebrow staff-orders-eyebrow">Shared Library</p><h4>No materials yet</h4><p>Add the first swatch-backed material record to start the shared material library.</p></div>';
      }
      if (filteredRecords.length === 0) {
        return `<div class="staff-catalog-designs-state"><h4>No materials match these filters</h4><p>${hasActiveFilters ? 'Adjust the search or clear filters to see more shared materials.' : 'No shared materials are available yet.'}</p></div>`;
      }

      return `<div class="staff-design-card-grid">${filteredRecords.map((record) => renderMaterialCard(record, reorderAvailability.enabled)).join('')}</div>`;
    }

    function renderMaterialCard(record, reorderEnabled) {
      const swatch = getMaterialSwatchDisplay(record);
      return `
        <div class="staff-catalog-card-shell${reorderController?.isDraggingId(record.id) ? ' staff-catalog-card-shell--dragging' : ''}${reorderController?.isSaving() ? ' staff-catalog-card-shell--saving' : ''}" data-catalog-order-id="${escapeAttribute(record.id)}">
          ${reorderEnabled ? `
            <button
              class="staff-catalog-reorder-handle"
              type="button"
              data-action="catalog-material-reorder-handle"
              data-material-id="${escapeAttribute(record.id)}"
              aria-label="Reorder ${escapeAttribute(record.material_name)}"
            >
              <span aria-hidden="true">::</span>
            </button>
          ` : ''}
          <button
            class="staff-design-card"
            type="button"
            data-action="catalog-edit-material"
            data-material-id="${escapeAttribute(record.id)}"
            aria-label="Edit ${escapeAttribute(record.material_name)}"
          >
            <div class="staff-design-card-thumb staff-material-card-thumb">
              ${swatch.html}
            </div>
            <div class="staff-design-card-body">
              <div class="staff-design-card-action-row">
                <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(record.status || 'review')}">${escapeHtml(getMaterialStatusLabel(record.status))}</span>
              </div>
              <h4 class="staff-design-card-title">${escapeHtml(record.material_name)}</h4>
              <dl class="staff-design-card-meta">
                ${renderMaterialMetaRow('Type', record.material_type)}
                ${renderMaterialMetaRow('Color', record.color)}
                ${renderMaterialMetaRow('Production', record.production_method)}
                ${renderMaterialMetaRow('Supplier', record.supplier)}
                ${renderMaterialMetaRow('Cost Ref.', formatMaterialUnitReference(record))}
              </dl>
            </div>
          </button>
        </div>
      `;
    }

    function bindContainerEvents() {
      if (!container || container.dataset.catalogMaterialBound === 'true') {
        return;
      }
      container.dataset.catalogMaterialBound = 'true';
      container.addEventListener('click', onContainerClick);
      container.addEventListener('input', onContainerInput);
      container.addEventListener('change', onContainerChange);
      container.addEventListener('pointerdown', onContainerPointerDown);
      container.addEventListener('keydown', onContainerKeydown);
    }

    function onContainerClick(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }
      if (action === 'catalog-material-reorder-handle') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (reorderController?.shouldSuppressActivation()) {
        event.preventDefault();
        return;
      }
      if (action === 'catalog-retry-material-load') {
        loadMaterials();
        return;
      }
      if (action === 'catalog-clear-material-filters') {
        state.filters = { search: '', material_type: '', production_method: '', status: '' };
        state.notice = '';
        renderContent();
        return;
      }
      if (action === 'catalog-add-material') {
        openDialog('create', null, event.target);
        return;
      }
      if (action === 'catalog-edit-material') {
        const materialId = event.target.closest('[data-material-id]')?.dataset.materialId || '';
        const record = state.records.find((item) => item.id === materialId) || null;
        if (record) {
          openDialog('edit', record, event.target);
        }
      }
    }

    function onContainerInput(event) {
      if (event.target?.dataset?.action === 'catalog-material-search') {
        state.filters.search = String(event.target.value || '');
        renderContent({ preserveFocus: true });
      }
    }

    function onContainerChange(event) {
      const action = event.target?.dataset?.action;
      if (action === 'catalog-sort-materials') {
        state.sortKey = String(event.target.value || 'custom').trim() || 'custom';
        state.notice = '';
        renderContent();
        return;
      }
      if (action === 'catalog-filter-material-type') {
        state.filters.material_type = String(event.target.value || '').trim();
        renderContent();
        return;
      }
      if (action === 'catalog-filter-material-production-method') {
        state.filters.production_method = String(event.target.value || '').trim();
        renderContent();
        return;
      }
      if (action === 'catalog-filter-material-status') {
        state.filters.status = String(event.target.value || '').trim();
        renderContent();
      }
    }

    function onContainerPointerDown(event) {
      const handle = event.target.closest('[data-action="catalog-material-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortMaterialRecords(filterMaterialRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      const materialId = String(handle.dataset.materialId || '').trim();
      if (!materialId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      reorderController.beginPointer(event, materialId, orderedIds);
    }

    function onContainerKeydown(event) {
      const handle = event.target.closest('[data-action="catalog-material-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortMaterialRecords(filterMaterialRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      reorderController.handleHandleKeydown(event, String(handle.dataset.materialId || ''), orderedIds);
    }

    function ensureDialogUi() {
      if (dialogBackdrop && dialogNode && formNode && statusNode) {
        return;
      }

      dialogBackdrop = documentRef.createElement('div');
      dialogBackdrop.className = 'staff-design-dialog-backdrop';
      dialogBackdrop.hidden = true;
      dialogBackdrop.innerHTML = `
        <div class="staff-design-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-material-dialog-title" tabindex="-1">
          <div class="staff-design-dialog-header">
            <div>
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3 id="staff-material-dialog-title">Add Material</h3>
            </div>
            <div class="staff-catalog-dialog-header-actions staff-design-dialog-header-actions">
              <button class="primary-button" type="submit" form="staff-material-dialog-form" data-action="catalog-save-material">Save Material</button>
              <button class="secondary-button staff-design-dialog-close" type="button" data-action="catalog-close-material-dialog">Cancel</button>
            </div>
          </div>
          <form class="staff-design-dialog-form" id="staff-material-dialog-form" novalidate>
            <div class="staff-design-dialog-grid">
              <label class="staff-design-dialog-field">
                <span>Material Name</span>
                <input name="material_name" type="text" maxlength="160" required>
              </label>
              <label class="staff-design-dialog-field">
                <span>Status</span>
                <select name="status">${renderStatusOptions('', '')}</select>
              </label>
              <label class="staff-design-dialog-field">
                <span>Material Type</span>
                <input name="material_type" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Color</span>
                <input name="color" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Supplier</span>
                <input name="supplier" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Production Method</span>
                <input name="production_method" type="text" maxlength="160">
              </label>
              <label class="staff-design-dialog-field">
                <span>Purchase Cost</span>
                <input name="purchase_cost" type="text" inputmode="decimal" maxlength="16" placeholder="e.g. 12.50">
              </label>
              <label class="staff-design-dialog-field">
                <span>Purchase Quantity</span>
                <input name="purchase_quantity" type="text" inputmode="numeric" maxlength="12" placeholder="e.g. 25">
              </label>
              <label class="staff-design-dialog-field">
                <span>Cost Basis</span>
                <select name="cost_basis">${renderCostBasisOptions('')}</select>
              </label>
              <div class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Material Swatch</span>
                <div class="staff-design-thumbnail-panel">
                  <div class="staff-design-thumbnail-preview" data-catalog-material-swatch-preview></div>
                  <label class="secondary-button staff-design-thumbnail-input">
                    <input name="swatch" type="file" accept="image/png,image/jpeg,image/webp">
                    Choose Swatch
                  </label>
                  <p class="staff-design-thumbnail-copy" data-catalog-material-swatch-copy>No swatch selected</p>
                </div>
              </div>
              <label class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Notes</span>
                <textarea name="notes" rows="5" maxlength="4000"></textarea>
              </label>
            </div>
            <p class="staff-orders-status staff-design-dialog-status" data-catalog-material-dialog-status aria-live="polite"></p>
          </form>
        </div>
      `;

      documentRef.body.appendChild(dialogBackdrop);
      dialogNode = dialogBackdrop.querySelector('.staff-design-dialog');
      formNode = dialogBackdrop.querySelector('.staff-design-dialog-form');
      statusNode = dialogBackdrop.querySelector('[data-catalog-material-dialog-status]');

      dialogBackdrop.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (event.target === dialogBackdrop || action === 'catalog-close-material-dialog') {
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
      state.dialogMaterialId = record?.id || '';
      state.dialogValues = record ? {
        material_name: record.material_name || '',
        material_type: record.material_type || '',
        color: record.color || '',
        supplier: record.supplier || '',
        production_method: record.production_method || '',
        purchase_cost: record.purchase_cost || '',
        purchase_quantity: record.purchase_quantity ? String(record.purchase_quantity) : '',
        cost_basis: record.cost_basis || '',
        status: record.status || DEFAULT_FORM_VALUES.status,
        notes: record.notes || ''
      } : { ...DEFAULT_FORM_VALUES };
      state.dialogSwatchPath = record?.swatch_path || '';
      state.dialogSwatchFile = null;
      state.dialogSwatchFileName = '';
      renderDialog();
      dialogBackdrop.hidden = false;
      dialogNode.focus();
      windowLike.setTimeout(() => dialogBackdrop.querySelector('[name="material_name"]')?.focus(), 0);
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

      dialogNode.querySelector('#staff-material-dialog-title').textContent = state.dialogMode === 'edit' ? 'Edit Material' : 'Add Material';

      const values = state.dialogValues;
      setFormValue('material_name', values.material_name);
      setFormValue('material_type', values.material_type);
      setFormValue('color', values.color);
      setFormValue('supplier', values.supplier);
      setFormValue('production_method', values.production_method);
      setFormValue('purchase_cost', values.purchase_cost);
      setFormValue('purchase_quantity', values.purchase_quantity);
      setFormValue('cost_basis', values.cost_basis);
      setFormValue('status', values.status);
      setFormValue('notes', values.notes);

      formNode.setAttribute('aria-busy', state.dialogSaving ? 'true' : 'false');
      dialogBackdrop.querySelectorAll('input, select, textarea, button').forEach((node) => {
        if (node.dataset.action === 'catalog-close-material-dialog') {
          node.disabled = false;
          return;
        }
        node.disabled = state.dialogSaving;
      });

      const saveButton = dialogBackdrop.querySelector('[data-action="catalog-save-material"]');
      if (saveButton) {
        saveButton.textContent = state.dialogSaving ? 'Saving Material...' : 'Save Material';
      }

      renderSwatchPanel();
      renderDialogStatus();
      applyDialogFieldErrors();
    }

    function renderSwatchPanel() {
      const previewNode = dialogBackdrop.querySelector('[data-catalog-material-swatch-preview]');
      const copyNode = dialogBackdrop.querySelector('[data-catalog-material-swatch-copy]');
      if (!previewNode || !copyNode) {
        return;
      }

      if (state.dialogSwatchPath) {
        previewNode.innerHTML = `<img src="${escapeAttribute(state.dialogSwatchPath)}" alt="Current material swatch">`;
      } else {
        previewNode.innerHTML = `<div class="staff-design-thumbnail-preview-placeholder">${escapeHtml(MISSING_SWATCH_COPY)}</div>`;
      }

      copyNode.textContent = state.dialogSwatchFileName
        ? `Selected: ${state.dialogSwatchFileName}`
        : (state.dialogSwatchPath ? 'Current swatch will remain until replaced.' : 'No swatch selected');
    }

    function renderDialogStatus() {
      const fieldErrorMessages = Object.values(state.dialogFieldErrors || {});
      statusNode.textContent = state.dialogError || fieldErrorMessages[0] || '';
    }

    function applyDialogFieldErrors() {
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
      if (!(target instanceof HTMLInputElement) || target.name !== 'swatch') {
        return;
      }

      const file = target.files && target.files[0] ? target.files[0] : null;
      state.dialogSwatchFile = file;
      state.dialogSwatchFileName = file ? String(file.name || '').trim() : '';
      state.dialogFieldErrors = { ...state.dialogFieldErrors };
      delete state.dialogFieldErrors.swatch;
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
        state.dialogError = 'Material catalog is currently unavailable.';
        renderDialog();
        return;
      }

      const formData = new FormData(formNode);
      const payload = {
        material_name: String(formData.get('material_name') || ''),
        material_type: String(formData.get('material_type') || ''),
        color: String(formData.get('color') || ''),
        supplier: String(formData.get('supplier') || ''),
        production_method: String(formData.get('production_method') || ''),
        purchase_cost: String(formData.get('purchase_cost') || ''),
        purchase_quantity: String(formData.get('purchase_quantity') || ''),
        cost_basis: String(formData.get('cost_basis') || ''),
        status: String(formData.get('status') || ''),
        notes: String(formData.get('notes') || '')
      };

      state.dialogFieldErrors = validateMaterialDialogPayload(payload);
      state.dialogError = '';
      if (Object.keys(state.dialogFieldErrors).length > 0) {
        renderDialog();
        return;
      }

      state.dialogSaving = true;
      renderDialog();

      try {
        const saveResult = state.dialogMode === 'edit'
          ? await apiClient.updateMaterial(state.dialogMaterialId, payload)
          : await apiClient.createMaterial(payload);
        let material = normalizeMaterialRecord(saveResult.material);

        if (state.dialogSwatchFile) {
          const uploadResult = await apiClient.uploadSwatch(material.id, state.dialogSwatchFile);
          material = normalizeMaterialRecord(uploadResult.material);
        }

        upsertMaterialRecord(material);
        state.dialogSaving = false;
        closeDialog();
        renderContent();
      } catch (error) {
        state.dialogSaving = false;
        state.dialogError = safeErrorMessage(error, 'Material could not be saved right now.');
        state.dialogFieldErrors = error?.fields && typeof error.fields === 'object' ? error.fields : {};
        renderDialog();
      }
    }

    function upsertMaterialRecord(material) {
      const normalized = normalizeMaterialRecord(material);
      const nextRecords = state.records.slice();
      const index = nextRecords.findIndex((record) => record.id === normalized.id);
      if (index >= 0) {
        nextRecords[index] = normalized;
      } else {
        nextRecords.push(normalized);
      }
      state.records = sortRecordsForCustomOrder(nextRecords);
      reorderController?.sync(state.records.map((record) => record.id));
      state.loaded = true;
      state.error = '';
    }

    function getReorderAvailability() {
      return orderingApi?.getReorderAvailability(state.sortKey, state.filters) || { enabled: false, reason: '' };
    }

    async function saveMaterialOrder(orderedIds) {
      if (!apiClient || typeof apiClient.reorderMaterials !== 'function') {
        state.notice = 'Material ordering is currently unavailable.';
        state.noticeTone = 'error';
        renderContent();
        return false;
      }

      try {
        const result = await apiClient.reorderMaterials(orderedIds);
        const sortOrderMap = new Map(
          Array.isArray(result.records)
            ? result.records.map((record) => [String(record.id || '').trim(), Number(record.sort_order || 0)])
            : []
        );
        const recordMap = new Map(state.records.map((record) => [record.id, record]));
        state.records = orderedIds
          .map((id) => recordMap.get(id))
          .filter(Boolean)
          .map((record, index) => ({
            ...record,
            sort_order: sortOrderMap.get(record.id) || ((index + 1) * 1000)
          }));
        state.notice = 'Custom order saved.';
        state.noticeTone = 'success';
        renderContent();
        return true;
      } catch (error) {
        if (error?.code === 'catalog_order_conflict') {
          state.notice = 'The material order changed elsewhere. Reloaded the latest order.';
          state.noticeTone = 'error';
          await loadMaterials();
          return false;
        }
        state.notice = safeErrorMessage(error, 'Material order could not be saved right now.');
        state.noticeTone = 'error';
        renderContent();
        return false;
      }
    }

    function setFormValue(fieldName, value) {
      const field = formNode?.querySelector(`[name="${fieldName}"]`);
      if (field) {
        field.value = value || '';
      }
    }

    return {
      render,
      closeDialog,
      reload: loadMaterials
    };
  }

  function validateMaterialDialogPayload(payload) {
    const errors = {};
    if (!String(payload.material_name || '').trim()) {
      errors.material_name = 'Material name is required.';
    }
    const purchaseCost = String(payload.purchase_cost || '').trim();
    if (purchaseCost && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(purchaseCost)) {
      errors.purchase_cost = 'Purchase cost must be a nonnegative amount with up to two decimals.';
    }
    const purchaseQuantity = String(payload.purchase_quantity || '').trim();
    if (purchaseQuantity && !/^[1-9]\d*$/.test(purchaseQuantity)) {
      errors.purchase_quantity = 'Purchase quantity must be a positive whole number.';
    }
    return errors;
  }

  function filterMaterialRecords(records, filters = {}) {
    const normalizedRecords = Array.isArray(records) ? records.map(normalizeMaterialRecord) : [];
    const search = String(filters.search || '').trim().toLowerCase();
    const materialType = String(filters.material_type || '').trim().toLowerCase();
    const productionMethod = String(filters.production_method || '').trim().toLowerCase();
    const status = String(filters.status || '').trim();

    return normalizedRecords.filter((record) => {
      if (search) {
        const haystack = [
          record.material_name,
          record.material_type,
          record.color,
          record.supplier,
          record.production_method,
          record.notes
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (materialType && String(record.material_type || '').toLowerCase() !== materialType) {
        return false;
      }
      if (productionMethod && String(record.production_method || '').toLowerCase() !== productionMethod) {
        return false;
      }
      if (status && record.status !== status) {
        return false;
      }
      return true;
    });
  }

  function normalizeMaterialRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: typeof normalized.id === 'string' ? normalized.id.trim() : '',
      material_name: typeof normalized.material_name === 'string' ? normalized.material_name.trim() : '',
      swatch_path: normalizeNullableString(normalized.swatch_path),
      material_type: normalizeNullableString(normalized.material_type),
      color: normalizeNullableString(normalized.color),
      supplier: normalizeNullableString(normalized.supplier),
      production_method: normalizeNullableString(normalized.production_method),
      purchase_cost: normalizeNullableString(normalized.purchase_cost),
      purchase_quantity: normalizeNullablePositiveInteger(normalized.purchase_quantity),
      cost_basis: normalizeNullableString(normalized.cost_basis),
      status: typeof normalized.status === 'string' ? normalized.status.trim() : '',
      notes: normalizeNullableString(normalized.notes),
      image_width: normalizeNullablePositiveInteger(normalized.image_width),
      image_height: normalizeNullablePositiveInteger(normalized.image_height),
      sort_order: normalizePositiveInteger(normalized.sort_order),
      created_at: typeof normalized.created_at === 'string' ? normalized.created_at.trim() : '',
      updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at.trim() : ''
    };
  }

  function getMaterialSwatchFitMode(record) {
    const normalized = normalizeMaterialRecord(record);
    const width = normalized.image_width;
    const height = normalized.image_height;
    if (!width || !height) {
      return 'contain';
    }
    const ratio = width / height;
    return ratio >= 0.85 && ratio <= 1.15 ? 'contain' : 'cover';
  }

  function getMaterialSwatchDisplay(record) {
    const normalized = normalizeMaterialRecord(record);
    if (normalized.swatch_path) {
      const fitMode = getMaterialSwatchFitMode(normalized);
      return {
        type: 'image',
        fitMode,
        html: `<img class="staff-material-card-thumb-image staff-material-card-thumb-image--${escapeAttribute(fitMode)}" src="${escapeAttribute(normalized.swatch_path)}" alt="${escapeAttribute((normalized.material_name || 'Material') + ' swatch')}">`
      };
    }
    return {
      type: 'placeholder',
      fitMode: 'contain',
      html: `<div class="staff-design-card-thumb-placeholder">${escapeHtml(MISSING_SWATCH_COPY)}</div>`
    };
  }

  function collectMaterialFilterOptions(records, fieldName) {
    const values = new Set();
    records.forEach((record) => {
      const value = normalizeMaterialRecord(record)[fieldName];
      if (value) {
        values.add(value);
      }
    });
    return [...values].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  function renderDynamicSelectOptions(values, selectedValue, emptyLabel) {
    const options = [`<option value="">${escapeHtml(emptyLabel)}</option>`];
    values.forEach((value) => {
      options.push(`<option value="${escapeAttribute(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(value)}</option>`);
    });
    return options.join('');
  }

  function renderStatusOptions(selectedValue, emptyLabel) {
    const options = [];
    if (emptyLabel !== '') {
      options.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    }
    Object.entries(STATUS_LABELS).forEach(([value, label]) => {
      options.push(`<option value="${escapeAttribute(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
  }

  function renderCostBasisOptions(selectedValue) {
    const options = ['<option value="">No Cost Basis</option>'];
    Object.entries(COST_BASIS_LABELS).forEach(([value, label]) => {
      options.push(`<option value="${escapeAttribute(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
  }

  function renderMaterialMetaRow(label, value) {
    if (!value) {
      return '';
    }
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function formatMaterialUnitReference(record) {
    const normalized = normalizeMaterialRecord(record);
    if (!normalized.purchase_cost || !normalized.purchase_quantity) {
      return '';
    }
    const cost = Number(normalized.purchase_cost);
    if (!Number.isFinite(cost) || cost < 0 || normalized.purchase_quantity <= 0) {
      return '';
    }
    const perUnit = cost / normalized.purchase_quantity;
    return `${formatCurrency(perUnit)} each`;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }

  function compareMaterialsByName(left, right) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.compareNullableText(left?.material_name, right?.material_name);
  }

  function sortMaterialRecords(records, sortKey) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.sortCatalogRecords(records, {
      sortKey,
      compareLabel: compareMaterialsByName,
      comparators: {
        custom: orderingApi.compareCustomOrder,
        az: compareMaterialsByName,
        recent(left, right) {
          return orderingApi.compareDatesDescending(left?.created_at, right?.created_at);
        },
        status(left, right) {
          return orderingApi.compareNullableText(getMaterialStatusLabel(left?.status), getMaterialStatusLabel(right?.status));
        },
        material_type(left, right) {
          return orderingApi.compareNullableText(left?.material_type, right?.material_type);
        },
        color(left, right) {
          return orderingApi.compareNullableText(left?.color, right?.color);
        },
        production_method(left, right) {
          return orderingApi.compareNullableText(left?.production_method, right?.production_method);
        }
      }
    });
  }

  function sortRecordsForCustomOrder(records) {
    return sortMaterialRecords(records, 'custom');
  }

  function getMaterialStatusLabel(value) {
    return STATUS_LABELS[value] || 'In Review';
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

  function normalizeNullablePositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
      return Number.parseInt(value.trim(), 10);
    }
    return null;
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

  function renderStaticOptions(options, selectedValue) {
    return options.map((option) => (
      `<option value="${escapeAttribute(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
    )).join('');
  }

  function normalizePositiveInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const normalized = Number.parseInt(value.trim(), 10);
      return normalized > 0 ? normalized : 0;
    }
    return 0;
  }

  function resolveCatalogOrderingApi(providedApi) {
    if (providedApi && typeof providedApi.sortCatalogRecords === 'function') {
      return providedApi;
    }
    if (typeof ForgeStaffCatalogOrdering !== 'undefined' && ForgeStaffCatalogOrdering) {
      return ForgeStaffCatalogOrdering;
    }
    if (typeof globalThis !== 'undefined' && globalThis.ForgeStaffCatalogOrdering) {
      return globalThis.ForgeStaffCatalogOrdering;
    }
    if (typeof require === 'function') {
      try {
        return require('./forge-staff-catalog-ordering.js');
      } catch (error) {
        return {
          compareCustomOrder(left, right) {
            return normalizePositiveInteger(left?.sort_order) - normalizePositiveInteger(right?.sort_order);
          },
          compareNullableText(left, right) {
            return String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' });
          },
          compareDatesDescending(left, right) {
            return (Date.parse(String(right || '')) || 0) - (Date.parse(String(left || '')) || 0);
          },
          sortCatalogRecords(records) {
            return Array.isArray(records) ? records.slice() : [];
          },
          getReorderAvailability() {
            return { enabled: false, reason: '' };
          }
        };
      }
    }
    return {
      compareCustomOrder(left, right) {
        return normalizePositiveInteger(left?.sort_order) - normalizePositiveInteger(right?.sort_order);
      },
      compareNullableText(left, right) {
        return String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' });
      },
      compareDatesDescending(left, right) {
        return (Date.parse(String(right || '')) || 0) - (Date.parse(String(left || '')) || 0);
      },
      sortCatalogRecords(records) {
        return Array.isArray(records) ? records.slice() : [];
      },
      getReorderAvailability() {
        return { enabled: false, reason: '' };
      }
    };
  }

  return {
    STATUS_LABELS,
    COST_BASIS_LABELS,
    DEFAULT_FORM_VALUES,
    MISSING_SWATCH_COPY,
    SORT_OPTIONS,
    createStaffMaterialCatalogModule,
    filterMaterialRecords,
    normalizeMaterialRecord,
    getMaterialSwatchDisplay,
    getMaterialSwatchFitMode,
    formatMaterialUnitReference,
    getMaterialStatusLabel,
    sortMaterialRecords
  };
}));
