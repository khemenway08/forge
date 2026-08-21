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
  const PINTEREST_NOPIN_IMAGE_ATTRIBUTES = ' nopin="nopin" data-pin-nopin="true"';
  const SORT_OPTIONS = [
    { value: 'custom', label: 'Custom Order' },
    { value: 'az', label: 'A–Z' },
    { value: 'recent', label: 'Recently Added' },
    { value: 'status', label: 'Status' },
    { value: 'manufacturer', label: 'Manufacturer' },
    { value: 'model', label: 'Model' },
    { value: 'color', label: 'Hat Color' }
  ];

  function createStaffHatCatalogModule(options = {}) {
    const apiClient = options.apiClient || null;
    const inventoryApiClient = options.inventoryApiClient || null;
    const documentRef = options.document || document;
    const windowLike = options.window || window;
    const orderingApi = resolveCatalogOrderingApi(options.orderingApi);
    const imageViewer = resolveCatalogImageViewer(options.imageViewer, documentRef, windowLike);
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
      dialogPhotoFileName: '',
      inventoryLoading: false,
      inventorySaving: false,
      inventory: null,
      inventoryError: '',
      inventoryAdjustOpen: false,
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
        return saveHatOrder(orderedIds);
      },
      getLabel(itemId) {
        const record = state.records.find((entry) => entry.id === itemId);
        return record?.hat_name || 'catalog record';
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
          ? sortRecordsForCustomOrder(result.hats.map(normalizeHatRecord))
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
        state.error = safeErrorMessage(error, 'Hat catalog could not be loaded right now.');
        renderContent();
      }
    }

    function renderContent(options = {}) {
      if (!container) {
        return;
      }

      const focusState = options.preserveFocus ? captureCatalogFocus() : null;
      const filteredRecords = filterHatRecords(state.records, state.filters);
      const reorderAvailability = getReorderAvailability();
      const sortedRecords = sortHatRecords(filteredRecords, state.sortKey);
      const hasActiveFilters = Boolean(
        state.filters.search || state.filters.manufacturer || state.filters.model || state.filters.status
      );
      const manufacturerOptions = collectHatFilterOptions(state.records, 'manufacturer');
      const modelOptions = collectHatFilterOptions(state.records, 'model');
      const sectionBody = renderHatsBody(sortedRecords, hasActiveFilters, reorderAvailability);

      container.innerHTML = `
        <section class="staff-catalog-designs" role="tabpanel" aria-labelledby="staff-catalog-tab-hats">
          <div class="staff-catalog-designs-toolbar">
            <div class="staff-catalog-designs-heading">
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3>Hats</h3>
              <p>Search and manage blank hat records and on-hand inventory without affecting customer ordering.</p>
            </div>
            <div class="staff-catalog-designs-actions">
              <p class="staff-catalog-designs-count" data-catalog-hat-results-count>${filteredRecords.length} result${filteredRecords.length === 1 ? '' : 's'}</p>
              <button class="primary-button" type="button" data-action="catalog-add-hat">Add Hat</button>
            </div>
          </div>
          <div class="staff-catalog-designs-filters">
            <label class="staff-catalog-designs-filter staff-catalog-designs-filter--search">
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
            <label class="staff-catalog-designs-filter">
              <span>Sort</span>
              <select data-action="catalog-sort-hats">${renderStaticOptions(SORT_OPTIONS, state.sortKey)}</select>
            </label>
            <div class="staff-catalog-designs-filter-clear">
              <button class="secondary-button" type="button" data-action="catalog-clear-hat-filters">Clear Filters</button>
            </div>
          </div>
          <div class="staff-catalog-sort-row">
            <p class="staff-catalog-sort-help">${escapeHtml(reorderAvailability.reason || 'Drag handles appear while Custom Order is active.')}</p>
            ${state.notice ? `<div class="staff-inline-notice staff-inline-notice--${escapeAttribute(state.noticeTone)}" role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` : ''}
          </div>
          <p class="staff-catalog-reorder-announcer" aria-live="polite">${escapeHtml(state.announcement)}</p>
          ${sectionBody}
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
        'catalog-hat-search',
        'catalog-filter-hat-manufacturer',
        'catalog-filter-hat-model',
        'catalog-filter-hat-status',
        'catalog-sort-hats'
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

    function renderHatsBody(filteredRecords, hasActiveFilters, reorderAvailability) {
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
          ${filteredRecords.map((record) => renderHatCard(record, reorderAvailability.enabled)).join('')}
        </div>
      `;
    }

    function renderHatCard(record, reorderEnabled) {
      const photo = getHatPhotoDisplay(record);
      return `
        <div class="staff-catalog-card-shell${reorderController?.isDraggingId(record.id) ? ' staff-catalog-card-shell--dragging' : ''}${reorderController?.isSaving() ? ' staff-catalog-card-shell--saving' : ''}" data-catalog-order-id="${escapeAttribute(record.id)}">
          ${reorderEnabled ? `
            <button
              class="staff-catalog-reorder-handle"
              type="button"
              data-action="catalog-hat-reorder-handle"
              data-hat-id="${escapeAttribute(record.id)}"
              aria-label="Reorder ${escapeAttribute(record.hat_name)}"
            >
              <span aria-hidden="true">::</span>
            </button>
          ` : ''}
          <button
            class="staff-design-card"
            type="button"
            data-action="catalog-edit-hat"
            data-hat-id="${escapeAttribute(record.id)}"
            aria-label="Edit ${escapeAttribute(record.hat_name)}"
          >
            <div
              class="staff-design-card-thumb ${photo.type === 'image' ? 'staff-catalog-image-trigger' : ''}"
              ${photo.type === 'image' ? `data-action="catalog-open-image-viewer" data-hat-id="${escapeAttribute(record.id)}" title="Open ${escapeAttribute(record.hat_name)} image viewer"` : ''}
            >
              ${photo.html}
            </div>
            <div class="staff-design-card-body">
              <div class="staff-design-card-action-row">
                <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(record.status || 'review')}">${escapeHtml(getHatStatusLabel(record.status))}</span>
              </div>
              <h4 class="staff-design-card-title">${escapeHtml(record.hat_name)}</h4>
              <dl class="staff-design-card-meta">
                ${renderHatMetaRow('Manufacturer', record.manufacturer)}
                ${renderHatMetaRow('Model', record.model)}
                ${renderHatMetaRow('Color', record.color)}
                ${renderHatMetaRow('Vendor', record.vendor)}
                ${renderHatMetaRow('On Hand', formatHatOnHand(record.inventory))}
                ${renderHatMetaRow('Cost Each', formatHatBaseCost(record.base_cost))}
              </dl>
            </div>
          </button>
        </div>
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
      container.addEventListener('pointerdown', onContainerPointerDown);
      container.addEventListener('keydown', onContainerKeydown);
    }

    function onContainerClick(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }

      if (action === 'catalog-hat-reorder-handle') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (reorderController?.shouldSuppressActivation()) {
        event.preventDefault();
        return;
      }

      if (action === 'catalog-open-image-viewer') {
        event.preventDefault();
        event.stopPropagation();
        openImageViewer(event.target.closest('[data-hat-id]')?.dataset.hatId || '', event.target.closest('[data-action]'));
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
        state.notice = '';
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
        renderContent({ preserveFocus: true });
      }
    }

    function onContainerChange(event) {
      const action = event.target?.dataset?.action;
      if (action === 'catalog-sort-hats') {
        state.sortKey = String(event.target.value || 'custom').trim() || 'custom';
        state.notice = '';
        renderContent();
        return;
      }
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

    function onContainerPointerDown(event) {
      const handle = event.target.closest('[data-action="catalog-hat-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortHatRecords(filterHatRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      const hatId = String(handle.dataset.hatId || '').trim();
      if (!hatId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      reorderController.beginPointer(event, hatId, orderedIds);
    }

    function onContainerKeydown(event) {
      const handle = event.target.closest('[data-action="catalog-hat-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortHatRecords(filterHatRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      reorderController.handleHandleKeydown(event, String(handle.dataset.hatId || ''), orderedIds);
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
            <div class="staff-catalog-dialog-header-actions staff-design-dialog-header-actions">
              <button class="primary-button" type="submit" form="staff-hat-dialog-form" data-action="catalog-save-hat">Save Hat</button>
              <button class="secondary-button staff-design-dialog-close" type="button" data-action="catalog-close-hat-dialog">Cancel</button>
            </div>
          </div>
          <form class="staff-design-dialog-form" id="staff-hat-dialog-form" novalidate>
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
                <span>Cost Each</span>
                <input id="catalog-hat-base-cost" name="base_cost" type="text" inputmode="decimal" maxlength="16" placeholder="e.g. 12.50">
              </label>
              <div class="staff-hat-editor-photo-inventory staff-design-dialog-field--wide">
                <div class="staff-design-dialog-field">
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
                <section class="staff-inventory-panel" data-catalog-hat-inventory-panel hidden>
                <div class="staff-inventory-panel-heading">
                  <div><span>Blank Hat Inventory</span><h4 data-catalog-hat-inventory-title>Not Counted</h4></div>
                  <p data-catalog-hat-inventory-copy>Enter the quantity physically on hand.</p>
                </div>
                <div class="staff-inventory-initial-count" data-catalog-hat-inventory-initial-count hidden>
                  <label><span>Physical Count</span><input type="number" min="0" step="1" inputmode="numeric" data-catalog-hat-inventory-initial-target></label>
                  <button class="primary-button" type="button" data-action="catalog-hat-inventory-save-initial">Save Initial Count</button>
                </div>
                <div class="staff-inventory-counted-controls" data-catalog-hat-inventory-counted-controls hidden>
                  <button class="secondary-button" type="button" data-action="catalog-hat-inventory-decrement">−1 Used / Removed</button>
                  <button class="secondary-button" type="button" data-action="catalog-hat-inventory-increment">+1 Received</button>
                  <button class="text-button" type="button" data-action="catalog-hat-inventory-open-adjust">Adjust Quantity</button>
                </div>
                <div class="staff-inventory-adjust" data-catalog-hat-inventory-adjust hidden>
                  <label><span>Verified Quantity</span><input type="number" min="0" step="1" inputmode="numeric" data-catalog-hat-inventory-adjust-target></label>
                  <label><span>Note <em>(optional)</em></span><input type="text" maxlength="4000" placeholder="Why was this corrected?" data-catalog-hat-inventory-adjust-note></label>
                  <div class="staff-inventory-adjust-actions"><button class="primary-button" type="button" data-action="catalog-hat-inventory-save-adjust">Save Adjustment</button><button class="text-button" type="button" data-action="catalog-hat-inventory-close-adjust">Cancel</button></div>
                </div>
                <p class="staff-orders-status" data-catalog-hat-inventory-status aria-live="polite"></p>
                <div class="staff-inventory-history-section"><h5>Inventory History</h5><ol class="staff-inventory-history" data-catalog-hat-inventory-history></ol></div>
                </section>
              </div>
              <label class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Notes</span>
                <textarea id="catalog-hat-notes" name="notes" rows="5" maxlength="4000"></textarea>
              </label>
            </div>
            <p class="staff-orders-status staff-design-dialog-status" data-catalog-hat-dialog-status aria-live="polite"></p>
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
          return;
        }
        if (action === 'catalog-hat-inventory-increment') { submitInventoryAdjustment(1, 'received'); }
        if (action === 'catalog-hat-inventory-decrement') { submitInventoryAdjustment(-1, 'used_removed'); }
        if (action === 'catalog-hat-inventory-save-initial') { submitInitialInventoryCount(); }
        if (action === 'catalog-hat-inventory-open-adjust') { state.inventoryAdjustOpen = true; renderInventoryPanel(); }
        if (action === 'catalog-hat-inventory-close-adjust') { state.inventoryAdjustOpen = false; renderInventoryPanel(); }
        if (action === 'catalog-hat-inventory-save-adjust') { submitInventoryAdjustmentForm(); }
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
      state.inventory = record?.inventory || null;
      state.inventoryError = '';
      state.inventoryLoading = false;
      state.inventorySaving = false;
      state.inventoryAdjustOpen = false;
      renderDialog();
      dialogBackdrop.hidden = false;
      dialogNode.focus();
      windowLike.setTimeout(() => {
        dialogBackdrop.querySelector('[name="hat_name"]')?.focus();
      }, 0);
      if (record?.id) {
        loadInventory(record.id);
      }
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
      dialogBackdrop.querySelectorAll('input, select, textarea, button').forEach((node) => {
        if (node.dataset.action === 'catalog-close-hat-dialog') {
          node.disabled = false;
          return;
        }
        node.disabled = state.dialogSaving;
      });

      const saveButton = dialogBackdrop.querySelector('[data-action="catalog-save-hat"]');
      if (saveButton) {
        saveButton.textContent = state.dialogSaving ? 'Saving Hat...' : 'Save Hat';
      }

      renderPhotoPanel();
      renderInventoryPanel();
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
        previewNode.innerHTML = `<img src="${escapeAttribute(state.dialogPhotoPath)}" alt="Current hat photo"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`;
      } else {
        previewNode.innerHTML = `<div class="staff-design-thumbnail-preview-placeholder">${escapeHtml(MISSING_PHOTO_COPY)}</div>`;
      }

      copyNode.textContent = state.dialogPhotoFileName
        ? `Selected: ${state.dialogPhotoFileName}`
        : (state.dialogPhotoPath ? 'Current photo will remain until replaced.' : 'No photo selected');
    }

    async function loadInventory(hatId) {
      if (!inventoryApiClient || typeof inventoryApiClient.getSubjectInventory !== 'function') {
        state.inventoryError = 'Inventory is currently unavailable.';
        renderInventoryPanel();
        return;
      }
      state.inventoryLoading = true;
      renderInventoryPanel();
      try {
        const result = await inventoryApiClient.getSubjectInventory('catalog_hat', hatId);
        if (!result || result.authenticated === false || result.unauthenticated) {
          state.inventoryError = 'Staff authentication is required.';
        } else {
          state.inventory = normalizeInventorySummary(result.inventory);
          updateOpenHatInventory(state.inventory);
          state.inventoryError = '';
        }
      } catch (error) {
        state.inventoryError = safeErrorMessage(error, 'Inventory could not be loaded right now.');
      }
      state.inventoryLoading = false;
      renderInventoryPanel();
    }

    function renderInventoryPanel() {
      const panel = dialogBackdrop?.querySelector('[data-catalog-hat-inventory-panel]');
      if (!panel) return;
      const title = panel.querySelector('[data-catalog-hat-inventory-title]');
      const copy = panel.querySelector('[data-catalog-hat-inventory-copy]');
      const initialCount = panel.querySelector('[data-catalog-hat-inventory-initial-count]');
      const countedControls = panel.querySelector('[data-catalog-hat-inventory-counted-controls]');
      const adjustment = panel.querySelector('[data-catalog-hat-inventory-adjust]');
      const initialTarget = panel.querySelector('[data-catalog-hat-inventory-initial-target]');
      const adjustmentTarget = panel.querySelector('[data-catalog-hat-inventory-adjust-target]');
      const status = panel.querySelector('[data-catalog-hat-inventory-status]');
      const history = panel.querySelector('[data-catalog-hat-inventory-history]');
      const canAdjust = state.dialogMode === 'edit' && Boolean(state.dialogHatId);
      panel.hidden = !canAdjust;
      if (!canAdjust) return;
      const inventory = normalizeInventorySummary(state.inventory);
      if (title) title.textContent = inventory.counted ? `On Hand: ${formatHatOnHand(inventory)}` : 'Not Counted';
      if (copy) copy.textContent = inventory.counted
        ? 'Use the quick controls for common movements, or adjust a verified quantity.'
        : 'Enter the quantity physically on hand.';
      const unavailable = state.inventoryLoading || state.inventorySaving || Boolean(state.inventoryError);
      if (initialCount) initialCount.hidden = inventory.counted || unavailable;
      if (countedControls) countedControls.hidden = !inventory.counted || unavailable;
      if (adjustment) adjustment.hidden = !inventory.counted || !state.inventoryAdjustOpen || unavailable;
      if (initialTarget && documentRef.activeElement !== initialTarget) initialTarget.value = '';
      if (adjustmentTarget && documentRef.activeElement !== adjustmentTarget) adjustmentTarget.value = inventory.counted ? String(inventory.on_hand_quantity) : '';
      panel.querySelectorAll('button, input, select').forEach((node) => { node.disabled = state.inventoryLoading || state.inventorySaving || Boolean(state.inventoryError); });
      if (status) status.textContent = state.inventoryLoading ? 'Loading inventory history...' : (state.inventorySaving ? 'Saving inventory...' : state.inventoryError);
      if (history) history.innerHTML = inventory.movements.length
        ? inventory.movements.map(renderInventoryMovement).join('')
        : '<li class="staff-inventory-history-empty">No physical count recorded yet.</li>';
    }

    function renderInventoryMovement(movement) {
      const initial = movement.quantity_before === null;
      const quantity = initial
        ? `Initial count confirmed: ${movement.quantity_after}`
        : `${movement.quantity_before} → ${movement.quantity_after} (${movement.quantity_delta >= 0 ? '+' : ''}${movement.quantity_delta})`;
      return `<li><strong>${escapeHtml(getInventoryReasonLabel(movement.reason_code))}</strong><span>${escapeHtml(quantity)}</span>${movement.note ? `<small>${escapeHtml(movement.note)}</small>` : ''}<small>${escapeHtml(formatInventoryMovementTimestamp(movement.created_at))}</small></li>`;
    }

    async function submitInventoryAdjustment(delta, quickReason) {
      const inventory = normalizeInventorySummary(state.inventory);
      if (!inventory.counted) { return; }
      await saveInventoryAdjustment(Math.max(0, inventory.on_hand_quantity + delta), quickReason, '');
    }

    async function submitInitialInventoryCount() {
      const panel = dialogBackdrop?.querySelector('[data-catalog-hat-inventory-panel]');
      const target = panel?.querySelector('[data-catalog-hat-inventory-initial-target]');
      const value = String(target?.value || '').trim();
      if (!/^\d+$/.test(value)) { state.inventoryError = 'Enter a whole-number physical quantity of zero or more.'; renderInventoryPanel(); return; }
      await saveInventoryAdjustment(Number(value), 'initial_count', '');
    }

    async function submitInventoryAdjustmentForm() {
      const panel = dialogBackdrop?.querySelector('[data-catalog-hat-inventory-panel]');
      const target = panel?.querySelector('[data-catalog-hat-inventory-adjust-target]');
      const note = panel?.querySelector('[data-catalog-hat-inventory-adjust-note]');
      const value = String(target?.value || '').trim();
      if (!/^\d+$/.test(value)) { state.inventoryError = 'Enter a whole-number verified quantity of zero or more.'; renderInventoryPanel(); return; }
      await saveInventoryAdjustment(Number(value), 'correction', String(note?.value || ''));
    }

    async function saveInventoryAdjustment(targetQuantity, reasonCode, note) {
      if (!inventoryApiClient || typeof inventoryApiClient.adjustSubjectInventory !== 'function' || state.inventorySaving) return;
      const inventory = normalizeInventorySummary(state.inventory);
      state.inventorySaving = true;
      state.inventoryError = '';
      renderInventoryPanel();
      try {
        const result = await inventoryApiClient.adjustSubjectInventory({ subject_type: 'catalog_hat', subject_id: state.dialogHatId, expected_quantity: inventory.counted ? inventory.on_hand_quantity : null, expected_version: inventory.version, target_quantity: targetQuantity, reason_code: reasonCode, note });
        if (!result || result.authenticated === false || result.unauthenticated) throw new Error('Staff authentication is required.');
        state.inventory = normalizeInventorySummary(result.inventory);
        state.inventoryAdjustOpen = false;
        updateOpenHatInventory(state.inventory);
      } catch (error) {
        state.inventoryError = safeErrorMessage(error, 'Inventory could not be saved right now.');
        if (error?.code === 'inventory_conflict') loadInventory(state.dialogHatId);
      }
      state.inventorySaving = false;
      renderInventoryPanel();
    }

    function updateOpenHatInventory(inventory) {
      const index = state.records.findIndex((record) => record.id === state.dialogHatId);
      if (index < 0) return;
      state.records[index] = { ...state.records[index], inventory: normalizeInventorySummary(inventory) };
      renderContent();
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
      state.records = sortRecordsForCustomOrder(nextRecords);
      reorderController?.sync(state.records.map((record) => record.id));
      state.loaded = true;
      state.error = '';
    }

    function getReorderAvailability() {
      return orderingApi?.getReorderAvailability(state.sortKey, state.filters) || { enabled: false, reason: '' };
    }

    async function saveHatOrder(orderedIds) {
      if (!apiClient || typeof apiClient.reorderHats !== 'function') {
        state.notice = 'Hat ordering is currently unavailable.';
        state.noticeTone = 'error';
        renderContent();
        return false;
      }

      try {
        const result = await apiClient.reorderHats(orderedIds);
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
          state.notice = 'The hat order changed elsewhere. Reloaded the latest order.';
          state.noticeTone = 'error';
          await loadHats();
          return false;
        }
        state.notice = safeErrorMessage(error, 'Hat order could not be saved right now.');
        state.noticeTone = 'error';
        renderContent();
        return false;
      }
    }

    function openImageViewer(hatId, opener) {
      const record = state.records.find((item) => item.id === hatId) || null;
      if (!record || !record.photo_path || !imageViewer || typeof imageViewer.open !== 'function') {
        return;
      }
      imageViewer.open({
        items: getVisibleImageViewerItems(),
        selectedId: hatId,
        opener
      });
    }

    function getVisibleImageViewerItems() {
      return sortHatRecords(filterHatRecords(state.records, state.filters), state.sortKey)
        .filter((record) => record.photo_path)
        .map((record) => ({
          id: record.id,
          typeLabel: 'Hat',
          name: record.hat_name,
          metadata: [
            record.manufacturer,
            record.model,
            record.color,
            getHatStatusLabel(record.status)
          ].filter(Boolean).join(' | '),
          src: record.photo_path,
          alt: `${record.hat_name || 'Hat'} photo`
        }));
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
      inventory: normalizeInventorySummary(normalized.inventory),
      status: typeof normalized.status === 'string' ? normalized.status.trim() : '',
      notes: normalizeNullableString(normalized.notes),
      sort_order: normalizePositiveInteger(normalized.sort_order),
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
        html: `<img src="${escapeAttribute(normalized.photo_path)}" alt="${escapeAttribute((normalized.hat_name || 'Hat') + ' photo')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
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

  function normalizeInventorySummary(value) {
    const inventory = value && typeof value === 'object' ? value : {};
    const quantity = normalizeNullableNonNegativeInteger(inventory.on_hand_quantity);
    return {
      counted: Boolean(inventory.counted) && quantity !== null,
      on_hand_quantity: quantity,
      version: normalizeNonNegativeInteger(inventory.version),
      updated_at: normalizeNullableString(inventory.updated_at),
      movements: Array.isArray(inventory.movements) ? inventory.movements.map((movement) => ({
        ...movement,
        quantity_before: normalizeNullableNonNegativeInteger(movement?.quantity_before),
        quantity_after: normalizeNonNegativeInteger(movement?.quantity_after),
        quantity_delta: normalizeNullableInteger(movement?.quantity_delta)
      })) : []
    };
  }

  function formatHatOnHand(inventory) {
    const normalized = normalizeInventorySummary(inventory);
    return normalized.counted ? String(normalized.on_hand_quantity) : 'Not Counted';
  }

  function getInventoryReasonLabel(reason) {
    return ({ initial_count: 'Initial Count', received: 'Received', used_removed: 'Used / Removed', correction: 'Correction' })[reason] || 'Adjustment';
  }

  function formatInventoryMovementTimestamp(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Recorded time unavailable';
    const sqlTimestamp = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
    const isoTimestamp = sqlTimestamp
      ? `${sqlTimestamp[1]}T${sqlTimestamp[2]}.${String(sqlTimestamp[3] || '').padEnd(3, '0').slice(0, 3)}Z`
      : raw;
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return 'Recorded time unavailable';
    const dateText = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    const timeText = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
    return `${dateText} · ${timeText}`;
  }

  function normalizeNonNegativeInteger(value) {
    const number = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeNullableNonNegativeInteger(value) { return value === null || value === undefined || value === '' ? null : normalizeNonNegativeInteger(value); }
  function normalizeNullableInteger(value) { if (value === null || value === undefined || value === '') return null; const number = typeof value === 'number' ? value : (typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN); return Number.isSafeInteger(number) ? number : null; }

  function compareHatsByName(left, right) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.compareNullableText(left?.hat_name, right?.hat_name);
  }

  function sortHatRecords(records, sortKey) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.sortCatalogRecords(records, {
      sortKey,
      compareLabel: compareHatsByName,
      comparators: {
        custom: orderingApi.compareCustomOrder,
        az: compareHatsByName,
        recent(left, right) {
          return orderingApi.compareDatesDescending(left?.created_at, right?.created_at);
        },
        status(left, right) {
          return orderingApi.compareNullableText(getHatStatusLabel(left?.status), getHatStatusLabel(right?.status));
        },
        manufacturer(left, right) {
          return orderingApi.compareNullableText(left?.manufacturer, right?.manufacturer);
        },
        model(left, right) {
          return orderingApi.compareNullableText(left?.model, right?.model);
        },
        color(left, right) {
          return orderingApi.compareNullableText(left?.color, right?.color);
        }
      }
    });
  }

  function sortRecordsForCustomOrder(records) {
    return sortHatRecords(records, 'custom');
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

  function resolveCatalogImageViewer(explicitViewer, documentRef, windowLike) {
    if (explicitViewer && typeof explicitViewer.open === 'function') {
      return explicitViewer;
    }
    const viewerApi = windowLike?.ForgeCatalogImageViewer || globalThis?.ForgeCatalogImageViewer;
    if (viewerApi && typeof viewerApi.createCatalogImageViewer === 'function') {
      return viewerApi.createCatalogImageViewer({ document: documentRef, window: windowLike });
    }
    return null;
  }

  return {
    STATUS_LABELS,
    DEFAULT_FORM_VALUES,
    MISSING_PHOTO_COPY,
    SORT_OPTIONS,
    createStaffHatCatalogModule,
    filterHatRecords,
    normalizeHatRecord,
    getHatPhotoDisplay,
    getHatStatusLabel,
    formatHatBaseCost,
    formatHatOnHand,
    formatInventoryMovementTimestamp,
    normalizeInventorySummary,
    sortHatRecords
  };
}));
