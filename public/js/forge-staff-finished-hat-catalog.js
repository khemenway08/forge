(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffFinishedHatCatalog = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATUS_LABELS = {
    review: 'In Review',
    active: 'Active',
    retired: 'Retired'
  };
  const PLACEMENT_STATUS_LABELS = {
    unassigned: 'Unassigned',
    sample: 'Sample',
    currently_at_boutique: 'Currently at Boutique',
    sold: 'Sold',
    past_build: 'Past Build'
  };
  const DEFAULT_FORM_VALUES = {
    finished_hat_name: '',
    design_id: '',
    hat_id: '',
    material_id: '',
    patch_shape: '',
    patch_size: '',
    placement_status: 'unassigned',
    location_label: '',
    retail_price: '',
    status: 'review',
    notes: ''
  };
  const MISSING_PHOTO_COPY = 'No photo yet';
  const LINK_TYPES = ['design', 'hat', 'material'];
  const SORT_OPTIONS = [
    { value: 'custom', label: 'Custom Order' },
    { value: 'az', label: 'A–Z' },
    { value: 'recent', label: 'Recently Added' },
    { value: 'status', label: 'Status' },
    { value: 'placement_status', label: 'Placement Status' },
    { value: 'hat_color', label: 'Hat Color' },
    { value: 'hat_manufacturer', label: 'Hat Manufacturer' },
    { value: 'hat_model', label: 'Hat Model' },
    { value: 'design_name', label: 'Design' },
    { value: 'material_name', label: 'Material' }
  ];

  function createStaffFinishedHatCatalogModule(options = {}) {
    const apiClient = options.apiClient || null;
    const designApiClient = options.designApiClient || null;
    const hatApiClient = options.hatApiClient || null;
    const materialApiClient = options.materialApiClient || null;
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
        design_name: '',
        hat_manufacturer: '',
        hat_model: '',
        hat_color: '',
        material_name: '',
        placement_status: '',
        status: '',
        needs_linking: ''
      },
      optionsLoaded: false,
      optionsLoading: false,
      optionError: '',
      designOptions: [],
      hatOptions: [],
      materialOptions: [],
      dialogOpen: false,
      dialogMode: 'create',
      dialogError: '',
      dialogFieldErrors: {},
      dialogValues: { ...DEFAULT_FORM_VALUES },
      dialogFinishedHatId: '',
      dialogRecord: null,
      dialogPhotoPath: '',
      dialogPhotoFile: null,
      dialogPhotoFileName: '',
      pickerOpen: false,
      pickerType: '',
      pickerSearch: '',
      pickerFilters: {},
      pickerSelectedId: '',
      pickerCurrentId: '',
      pickerSaving: false,
      pickerError: '',
      pickerTriggerLabel: '',
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
    let lastPickerFocusTarget = null;
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
        return saveFinishedHatOrder(orderedIds);
      },
      getLabel(itemId) {
        const record = state.records.find((entry) => entry.id === itemId);
        return record?.finished_hat_name || 'catalog record';
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
        loadFinishedHats();
      }
    }

    async function loadFinishedHats() {
      if (!apiClient || typeof apiClient.listFinishedHats !== 'function') {
        state.error = 'Finished hat catalog is currently unavailable.';
        state.loading = false;
        renderContent();
        return;
      }

      state.loading = true;
      state.error = '';
      state.requiresAuthentication = false;
      renderContent();

      try {
        const result = await apiClient.listFinishedHats();
        if (!result || result.authenticated === false || result.unauthenticated) {
          state.loading = false;
          state.loaded = false;
          state.requiresAuthentication = true;
          state.error = 'Staff authentication is required.';
          renderContent();
          return;
        }

        state.records = Array.isArray(result.finished_hats)
          ? sortRecordsForCustomOrder(result.finished_hats.map(normalizeFinishedHatRecord))
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
        state.error = safeErrorMessage(error, 'Finished hat catalog could not be loaded right now.');
        renderContent();
      }
    }

    async function ensureLinkOptionsLoaded() {
      if (state.optionsLoaded || state.optionsLoading) {
        return;
      }

      if (
        !designApiClient || typeof designApiClient.listDesigns !== 'function' ||
        !hatApiClient || typeof hatApiClient.listHats !== 'function' ||
        !materialApiClient || typeof materialApiClient.listMaterials !== 'function'
      ) {
        state.optionError = 'Catalog link options are currently unavailable.';
        renderDialog();
        return;
      }

      state.optionsLoading = true;
      state.optionError = '';
      renderDialog();

      try {
        const [designResult, hatResult, materialResult] = await Promise.all([
          designApiClient.listDesigns(),
          hatApiClient.listHats(),
          materialApiClient.listMaterials()
        ]);

        if (designResult?.unauthenticated || hatResult?.unauthenticated || materialResult?.unauthenticated) {
          state.optionError = 'Staff authentication is required.';
          state.optionsLoaded = false;
          return;
        }

        state.designOptions = Array.isArray(designResult?.designs)
          ? designResult.designs.map(normalizeDesignOption).sort(compareOptionsByLabel)
          : [];
        state.hatOptions = Array.isArray(hatResult?.hats)
          ? hatResult.hats.map(normalizeHatOption).sort(compareOptionsByLabel)
          : [];
        state.materialOptions = Array.isArray(materialResult?.materials)
          ? materialResult.materials.map(normalizeMaterialOption).sort(compareOptionsByLabel)
          : [];
        state.optionsLoaded = true;
      } catch (error) {
        state.optionError = safeErrorMessage(error, 'Catalog link options could not be loaded right now.');
      } finally {
        state.optionsLoading = false;
        renderDialog();
      }
    }

    function renderContent(options = {}) {
      if (!container) {
        return;
      }

      const focusState = options.preserveFocus ? captureCatalogFocus() : null;
      const filteredRecords = filterFinishedHatRecords(state.records, state.filters);
      const reorderAvailability = getReorderAvailability();
      const sortedRecords = sortFinishedHatRecords(filteredRecords, state.sortKey);
      const hasActiveFilters = Object.values(state.filters).some(Boolean);
      const designOptions = collectFinishedHatFilterOptions(state.records, 'design_name');
      const manufacturerOptions = collectFinishedHatFilterOptions(state.records, 'hat_manufacturer');
      const modelOptions = collectFinishedHatFilterOptions(state.records, 'hat_model');
      const colorOptions = collectFinishedHatFilterOptions(state.records, 'hat_color');
      const materialOptions = collectFinishedHatFilterOptions(state.records, 'material_name');

      container.innerHTML = `
        <section class="staff-catalog-designs" role="tabpanel" aria-labelledby="staff-catalog-tab-finished-hats">
          <div class="staff-catalog-designs-toolbar">
            <div class="staff-catalog-designs-heading">
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3>Finished Hats</h3>
              <p>Track real completed design, hat, and material combinations without affecting customer ordering or boutique inventory counts.</p>
            </div>
            <div class="staff-catalog-designs-actions">
              <p class="staff-catalog-designs-count" data-catalog-finished-hat-results-count>${filteredRecords.length} result${filteredRecords.length === 1 ? '' : 's'}</p>
              <button class="primary-button" type="button" data-action="catalog-add-finished-hat">Add Finished Hat</button>
            </div>
          </div>
          <div class="staff-catalog-designs-filters">
            <label class="staff-catalog-designs-filter staff-catalog-designs-filter--search">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.filters.search)}" placeholder="Search finished hats" data-action="catalog-finished-hat-search">
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Design</span>
              <select data-action="catalog-filter-finished-hat-design">${renderDynamicSelectOptions(designOptions, state.filters.design_name, 'All Designs')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Hat Manufacturer</span>
              <select data-action="catalog-filter-finished-hat-manufacturer">${renderDynamicSelectOptions(manufacturerOptions, state.filters.hat_manufacturer, 'All Manufacturers')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Hat Model</span>
              <select data-action="catalog-filter-finished-hat-model">${renderDynamicSelectOptions(modelOptions, state.filters.hat_model, 'All Models')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Hat Color</span>
              <select data-action="catalog-filter-finished-hat-color">${renderDynamicSelectOptions(colorOptions, state.filters.hat_color, 'All Hat Colors')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Material</span>
              <select data-action="catalog-filter-finished-hat-material">${renderDynamicSelectOptions(materialOptions, state.filters.material_name, 'All Materials')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Placement Status</span>
              <select data-action="catalog-filter-finished-hat-placement-status">${renderPlacementStatusOptions(state.filters.placement_status, 'All Placements')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Record Status</span>
              <select data-action="catalog-filter-finished-hat-status">${renderStatusOptions(state.filters.status, 'All Statuses')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Needs Linking</span>
              <select data-action="catalog-filter-finished-hat-needs-linking">
                <option value="" ${state.filters.needs_linking === '' ? 'selected' : ''}>All Records</option>
                <option value="needs_linking" ${state.filters.needs_linking === 'needs_linking' ? 'selected' : ''}>Needs Linking</option>
                <option value="fully_linked" ${state.filters.needs_linking === 'fully_linked' ? 'selected' : ''}>Fully Linked</option>
              </select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Sort</span>
              <select data-action="catalog-sort-finished-hats">${renderStaticOptions(SORT_OPTIONS, state.sortKey)}</select>
            </label>
            <div class="staff-catalog-designs-filter-clear">
              <button class="secondary-button" type="button" data-action="catalog-clear-finished-hat-filters">Clear Filters</button>
            </div>
          </div>
          <div class="staff-catalog-sort-row">
            <p class="staff-catalog-sort-help">${escapeHtml(reorderAvailability.reason || 'Drag handles appear while Custom Order is active.')}</p>
            ${state.notice ? `<div class="staff-inline-notice staff-inline-notice--${escapeAttribute(state.noticeTone)}" role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` : ''}
          </div>
          <p class="staff-catalog-reorder-announcer" aria-live="polite">${escapeHtml(state.announcement)}</p>
          ${renderFinishedHatBody(sortedRecords, hasActiveFilters, reorderAvailability)}
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
        'catalog-finished-hat-search',
        'catalog-filter-finished-hat-design',
        'catalog-filter-finished-hat-manufacturer',
        'catalog-filter-finished-hat-model',
        'catalog-filter-finished-hat-color',
        'catalog-filter-finished-hat-material',
        'catalog-filter-finished-hat-placement-status',
        'catalog-filter-finished-hat-status',
        'catalog-filter-finished-hat-needs-linking',
        'catalog-sort-finished-hats'
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

    function renderFinishedHatBody(filteredRecords, hasActiveFilters, reorderAvailability) {
      if (state.loading) {
        return '<div class="staff-catalog-designs-state"><p>Loading shared finished hat records...</p></div>';
      }
      if (state.error) {
        return `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.error)}</p><button class="secondary-button" type="button" data-action="catalog-retry-finished-hat-load">Retry</button></div>`;
      }
      if (state.records.length === 0) {
        return '<div class="staff-catalog-designs-state"><p class="eyebrow staff-orders-eyebrow">Shared Library</p><h4>No finished hats yet</h4><p>Add the first completed hat record to start the shared finished hat library.</p></div>';
      }
      if (filteredRecords.length === 0) {
        return `<div class="staff-catalog-designs-state"><h4>No finished hats match these filters</h4><p>${hasActiveFilters ? 'Adjust the search or clear filters to see more shared finished hats.' : 'No shared finished hats are available yet.'}</p></div>`;
      }

      return `<div class="staff-design-card-grid staff-finished-hat-card-grid">${filteredRecords.map((record) => renderFinishedHatCard(record, reorderAvailability.enabled)).join('')}</div>`;
    }

    function renderFinishedHatCard(record, reorderEnabled) {
      const photo = getFinishedHatPhotoDisplay(record);
      const compactSummary = getFinishedHatCompactSummary(record);
      const missingLinksSummary = getFinishedHatMissingLinksSummary(record);
      const primaryBadge = getFinishedHatPrimaryBadge(record);
      return `
        <div class="staff-catalog-card-shell${reorderController?.isDraggingId(record.id) ? ' staff-catalog-card-shell--dragging' : ''}${reorderController?.isSaving() ? ' staff-catalog-card-shell--saving' : ''}" data-catalog-order-id="${escapeAttribute(record.id)}">
          ${reorderEnabled ? `
            <button
              class="staff-catalog-reorder-handle"
              type="button"
              data-action="catalog-finished-hat-reorder-handle"
              data-finished-hat-id="${escapeAttribute(record.id)}"
              aria-label="Reorder ${escapeAttribute(record.finished_hat_name)}"
            >
              <span aria-hidden="true">::</span>
            </button>
          ` : ''}
          <article
            class="staff-design-card staff-finished-hat-card"
            role="button"
            tabindex="0"
            data-action="catalog-open-finished-hat-detail"
            data-finished-hat-id="${escapeAttribute(record.id)}"
            aria-label="${escapeAttribute(`Open ${record.finished_hat_name || 'finished hat'}`)}"
          >
            <div
              class="staff-design-card-thumb staff-finished-hat-card-thumb ${record.photo_path ? 'staff-catalog-image-trigger' : ''}"
              ${record.photo_path ? `data-action="catalog-open-image-viewer" data-finished-hat-id="${escapeAttribute(record.id)}" title="Open ${escapeAttribute(record.finished_hat_name)} image viewer"` : ''}
            >
              ${photo.html}
            </div>
            <div class="staff-design-card-body">
              <div class="staff-finished-hat-card-header">
                <div class="staff-design-card-top">
                  <h4 class="staff-finished-hat-card-title">${escapeHtml(record.finished_hat_name)}</h4>
                  <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(primaryBadge.tone)}">${escapeHtml(primaryBadge.label)}</span>
                </div>
              </div>
              <div class="staff-finished-hat-card-summary">
                ${compactSummary ? `<p class="staff-finished-hat-card-summary-line">${escapeHtml(compactSummary)}</p>` : ''}
                ${missingLinksSummary ? `<p class="staff-finished-hat-card-missing-links">${escapeHtml(missingLinksSummary)}</p>` : ''}
              </div>
            </div>
          </article>
        </div>
      `;
    }

    function bindContainerEvents() {
      if (!container || container.dataset.catalogFinishedHatBound === 'true') {
        return;
      }
      container.dataset.catalogFinishedHatBound = 'true';
      container.addEventListener('click', onContainerClick);
      container.addEventListener('keydown', onContainerKeyDown);
      container.addEventListener('input', onContainerInput);
      container.addEventListener('change', onContainerChange);
      container.addEventListener('pointerdown', onContainerPointerDown);
    }

    function onContainerClick(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }
      if (action === 'catalog-finished-hat-reorder-handle') {
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
        openImageViewer(event.target.closest('[data-finished-hat-id]')?.dataset.finishedHatId || '', event.target.closest('[data-action]'));
        return;
      }
      if (action === 'catalog-retry-finished-hat-load') {
        loadFinishedHats();
        return;
      }
      if (action === 'catalog-clear-finished-hat-filters') {
        state.filters = {
          search: '',
          design_name: '',
          hat_manufacturer: '',
          hat_model: '',
          hat_color: '',
          material_name: '',
          placement_status: '',
          status: '',
          needs_linking: ''
        };
        state.notice = '';
        renderContent();
        return;
      }
      if (action === 'catalog-add-finished-hat') {
        openDialog('create', null, event.target);
        return;
      }
      if (action === 'catalog-open-finished-hat-detail') {
        const finishedHatId = event.target.closest('[data-finished-hat-id]')?.dataset.finishedHatId || '';
        const record = state.records.find((item) => item.id === finishedHatId) || null;
        if (record) {
          openDialog('detail', record, event.target);
        }
      }
    }

    function onContainerKeyDown(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'catalog-finished-hat-reorder-handle') {
        const orderedIds = sortFinishedHatRecords(filterFinishedHatRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
        reorderController?.handleHandleKeydown(event, String(event.target.closest('[data-finished-hat-id]')?.dataset.finishedHatId || ''), orderedIds);
        return;
      }
      if (action !== 'catalog-open-finished-hat-detail') {
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      onContainerClick(event);
    }

    function onContainerInput(event) {
      if (event.target?.dataset?.action === 'catalog-finished-hat-search') {
        state.filters.search = String(event.target.value || '');
        renderContent({ preserveFocus: true });
      }
    }

    function onContainerChange(event) {
      const action = event.target?.dataset?.action;
      if (!action) {
        return;
      }
      const filterMap = {
        'catalog-filter-finished-hat-design': 'design_name',
        'catalog-filter-finished-hat-manufacturer': 'hat_manufacturer',
        'catalog-filter-finished-hat-model': 'hat_model',
        'catalog-filter-finished-hat-color': 'hat_color',
        'catalog-filter-finished-hat-material': 'material_name',
        'catalog-filter-finished-hat-placement-status': 'placement_status',
        'catalog-filter-finished-hat-status': 'status',
        'catalog-filter-finished-hat-needs-linking': 'needs_linking'
      };
      if (action === 'catalog-sort-finished-hats') {
        state.sortKey = String(event.target.value || 'custom').trim() || 'custom';
        state.notice = '';
        renderContent();
        return;
      }
      const filterKey = filterMap[action];
      if (filterKey) {
        state.filters[filterKey] = String(event.target.value || '');
        renderContent();
      }
    }

    function onContainerPointerDown(event) {
      const handle = event.target.closest('[data-action="catalog-finished-hat-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortFinishedHatRecords(filterFinishedHatRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      const finishedHatId = String(handle.dataset.finishedHatId || '').trim();
      if (!finishedHatId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      reorderController.beginPointer(event, finishedHatId, orderedIds);
    }

    function ensureDialogUi() {
      if (dialogBackdrop && dialogNode) {
        return;
      }

      dialogBackdrop = documentRef.createElement('div');
      dialogBackdrop.className = 'staff-design-dialog-backdrop';
      dialogBackdrop.hidden = true;
      dialogBackdrop.innerHTML = `
        <div class="staff-design-dialog staff-finished-hat-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-finished-hat-dialog-title" tabindex="-1">
          <div class="staff-design-dialog-header">
            <div>
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3 id="staff-finished-hat-dialog-title">Finished Hat</h3>
            </div>
            <div class="staff-catalog-dialog-header-actions staff-finished-hat-dialog-header-actions" data-finished-hat-dialog-header-actions></div>
          </div>
          <div data-finished-hat-dialog-status></div>
          <form class="staff-design-dialog-form" id="staff-finished-hat-dialog-form" data-finished-hat-dialog-form></form>
        </div>
      `;
      documentRef.body.appendChild(dialogBackdrop);
      dialogNode = dialogBackdrop.querySelector('.staff-design-dialog');
      formNode = dialogBackdrop.querySelector('[data-finished-hat-dialog-form]');
      statusNode = dialogBackdrop.querySelector('[data-finished-hat-dialog-status]');

      dialogBackdrop.addEventListener('click', onDialogClick);
      dialogBackdrop.addEventListener('input', onDialogInput);
      dialogBackdrop.addEventListener('change', onDialogChange);
      dialogBackdrop.addEventListener('submit', onDialogSubmit);
      dialogBackdrop.addEventListener('keydown', onDialogKeyDown);
    }

    async function openDialog(mode, record, trigger) {
      lastFocusTarget = trigger || documentRef.activeElement;
      state.dialogOpen = true;
      state.dialogMode = mode;
      state.dialogError = '';
      state.dialogFieldErrors = {};
      state.dialogFinishedHatId = record?.id || '';
      state.dialogRecord = record ? normalizeFinishedHatRecord(record) : null;
      state.dialogPhotoPath = record?.photo_path || '';
      state.dialogPhotoFile = null;
      state.dialogPhotoFileName = '';
      state.dialogValues = createDialogValues(record);
      resetPickerState();
      renderDialog();
      if (mode !== 'detail') {
        await ensureLinkOptionsLoaded();
      }
      focusDialogSoon();
    }

    function closeDialog() {
      if (!state.dialogOpen) {
        return;
      }
      state.dialogOpen = false;
      state.dialogSaving = false;
      state.dialogError = '';
      state.dialogFieldErrors = {};
      state.dialogRecord = null;
      state.dialogPhotoFile = null;
      state.dialogPhotoFileName = '';
      resetPickerState();
      dialogBackdrop.hidden = true;
      if (lastFocusTarget && typeof lastFocusTarget.focus === 'function') {
        lastFocusTarget.focus();
      }
    }

    function renderDialog() {
      if (!dialogBackdrop || !formNode || !statusNode) {
        return;
      }
      dialogBackdrop.hidden = !state.dialogOpen;
      if (!state.dialogOpen) {
        return;
      }

      const headerActionsNode = dialogBackdrop.querySelector('[data-finished-hat-dialog-header-actions]');
      if (headerActionsNode) {
        headerActionsNode.innerHTML = state.pickerOpen
          ? `<button class="secondary-button" type="button" data-action="catalog-cancel-link-picker">Back</button>`
          : (state.dialogMode === 'detail'
            ? `
              <button class="primary-button" type="button" data-action="catalog-edit-finished-hat-detail">Edit</button>
              <button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Close</button>
            `
            : `
              <button class="primary-button" type="submit" form="staff-finished-hat-dialog-form" ${state.dialogSaving ? 'disabled' : ''}>${escapeHtml(state.dialogSaving ? 'Saving...' : (state.dialogMode === 'edit' ? 'Save Finished Hat' : 'Add Finished Hat'))}</button>
              <button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Cancel</button>
            `);
      }

      statusNode.innerHTML = state.dialogError
        ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.dialogError)}</p></div>`
        : '';

      if (state.pickerOpen) {
        formNode.innerHTML = renderVisualPicker();
        focusPickerSoon();
        return;
      }

      if (state.dialogMode === 'detail') {
        formNode.innerHTML = renderFinishedHatDetail(state.dialogRecord || normalizeFinishedHatRecord({}));
        focusDialogSoon();
        return;
      }

      formNode.innerHTML = renderFinishedHatEditor();
      focusDialogSoon();
    }

    function renderFinishedHatDetail(record) {
      return `
        <div class="staff-finished-hat-detail">
          <div class="staff-design-dialog-grid">
            <div class="staff-design-thumbnail-panel staff-design-dialog-field staff-design-dialog-field--wide">
              <span>Primary Photo</span>
              <div class="staff-design-thumbnail-preview">
                ${getFinishedHatPreviewDisplay(null, record.photo_path, record.finished_hat_name).html}
              </div>
            </div>
            <div class="staff-finished-hat-detail-panel staff-design-dialog-field staff-design-dialog-field--wide">
              <span>Finished Hat Name</span>
              <strong class="staff-finished-hat-detail-title">${escapeHtml(record.finished_hat_name || 'Finished Hat')}</strong>
              <div class="staff-finished-hat-detail-badges">
                <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(record.status || 'review')}">${escapeHtml(getFinishedHatStatusLabel(record.status))}</span>
                <span class="staff-design-status-badge staff-design-status-badge--neutral">${escapeHtml(getPlacementStatusLabel(record.placement_status))}</span>
                ${record.needs_linking ? `<span class="staff-design-status-badge staff-design-status-badge--review">${escapeHtml(getFinishedHatMissingLinksSummary(record) || 'Needs Linking')}</span>` : ''}
              </div>
              ${renderFinishedHatCompactCard(record)}
            </div>
            ${renderLinkWorkspaceSection('design', record)}
            ${renderLinkWorkspaceSection('hat', record)}
            ${renderLinkWorkspaceSection('material', record)}
            ${renderFinishedHatDetailField('Patch Shape', record.patch_shape)}
            ${renderFinishedHatDetailField('Patch Size', record.patch_size)}
            ${renderFinishedHatDetailField('Location Label', record.location_label)}
            ${renderFinishedHatDetailField('Retail Price', formatRetailPrice(record.retail_price))}
            ${renderFinishedHatDetailField('Notes', record.notes, true)}
          </div>
        </div>
      `;
    }

    function renderFinishedHatEditor() {
      const preview = getFinishedHatPreviewDisplay(state.dialogPhotoFile, state.dialogPhotoPath, state.dialogValues.finished_hat_name);
      return `
        <div class="staff-finished-hat-detail">
          <div class="staff-design-dialog-grid">
            <div class="staff-design-thumbnail-panel staff-design-dialog-field staff-design-dialog-field--wide">
              <span>Primary Photo</span>
              <div class="staff-design-thumbnail-preview">
                ${preview.html}
              </div>
              <label class="secondary-button staff-design-thumbnail-input" type="button">
                <span>${state.dialogPhotoPath || state.dialogPhotoFileName ? 'Replace Photo' : 'Choose Photo'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" data-action="catalog-finished-hat-photo-input">
              </label>
              <p class="staff-design-thumbnail-copy">${escapeHtml(state.dialogPhotoFileName || state.dialogPhotoPath || 'PNG, JPEG, and WebP supported. The full image preview stays uncropped here.')}</p>
            </div>
            ${renderDialogField('finished_hat_name', 'Finished Hat Name', `<input type="text" name="finished_hat_name" value="${escapeAttribute(state.dialogValues.finished_hat_name)}" required>`)}
            ${renderDialogField('placement_status', 'Placement Status', `<select name="placement_status">${renderPlacementStatusOptions(state.dialogValues.placement_status, null)}</select>`)}
            ${renderEditorLinkControl('design')}
            ${renderEditorLinkControl('hat')}
            ${renderEditorLinkControl('material')}
            ${renderDialogField('patch_shape', 'Patch Shape', `<input type="text" name="patch_shape" value="${escapeAttribute(state.dialogValues.patch_shape)}">`)}
            ${renderDialogField('patch_size', 'Patch Size', `<input type="text" name="patch_size" value="${escapeAttribute(state.dialogValues.patch_size)}">`)}
            ${renderDialogField('location_label', 'Location Label', `<input type="text" name="location_label" value="${escapeAttribute(state.dialogValues.location_label)}">`)}
            ${renderDialogField('retail_price', 'Retail Price', `<input type="text" name="retail_price" inputmode="decimal" value="${escapeAttribute(state.dialogValues.retail_price)}">`)}
            ${renderDialogField('status', 'Record Status', `<select name="status">${renderStatusOptions(state.dialogValues.status, null)}</select>`)}
            ${renderDialogField('notes', 'Notes', `<textarea name="notes">${escapeHtml(state.dialogValues.notes)}</textarea>`, true)}
          </div>
          ${state.optionError ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.optionError)}</p></div>` : ''}
        </div>
      `;
    }

    function renderFinishedHatCompactCard(record) {
      const compactSummary = getFinishedHatCompactSummary(record);
      const missingSummary = getFinishedHatMissingLinksSummary(record);
      if (!compactSummary && !missingSummary) {
        return '';
      }
      return `
        <div class="staff-finished-hat-link-summary-card" data-finished-hat-summary-card>
          ${compactSummary ? `<p>${escapeHtml(compactSummary)}</p>` : ''}
          ${missingSummary ? `<p class="staff-finished-hat-link-summary-card-missing">${escapeHtml(missingSummary)}</p>` : ''}
        </div>
      `;
    }

    function renderLinkWorkspaceSection(type, record) {
      const config = getLinkTypeConfig(type);
      const linkedOption = getSelectedOptionForType(type, record?.[config.fieldName] || '') || buildFallbackLinkedOption(type, record);
      const hasLink = Boolean(linkedOption);
      return `
        <section class="staff-finished-hat-link-panel staff-design-dialog-field ${hasLink ? 'staff-finished-hat-link-panel--linked' : 'staff-finished-hat-link-panel--empty'} ${type === 'material' ? 'staff-finished-hat-link-panel--material' : ''}">
          <div class="staff-finished-hat-link-panel-header">
            <span>${escapeHtml(config.label)}</span>
            <div class="staff-finished-hat-link-panel-actions">
              <button class="secondary-button" type="button" data-action="catalog-open-link-picker" data-link-type="${escapeAttribute(type)}">${escapeHtml(hasLink ? config.changeLabel : config.chooseLabel)}</button>
              ${hasLink ? `<button class="ghost-button" type="button" data-action="catalog-clear-link" data-link-type="${escapeAttribute(type)}">Clear Link</button>` : ''}
            </div>
          </div>
          ${renderLinkedItemSummary(type, linkedOption, record)}
        </section>
      `;
    }

    function renderEditorLinkControl(type) {
      const config = getLinkTypeConfig(type);
      const linkedOption = getSelectedOptionForType(type, state.dialogValues[config.fieldName] || '');
      const fallbackRecord = state.dialogRecord || normalizeFinishedHatRecord(state.dialogValues);
      const hasLink = Boolean(linkedOption) || Boolean(state.dialogValues[config.fieldName]);
      return `
        <div class="staff-design-dialog-field staff-design-dialog-field--wide">
          <span>${escapeHtml(config.label)}</span>
          <div class="staff-finished-hat-link-editor">
            ${renderLinkedItemSummary(type, linkedOption, fallbackRecord)}
            <div class="staff-finished-hat-link-panel-actions">
              <button class="secondary-button" type="button" data-action="catalog-open-link-picker" data-link-type="${escapeAttribute(type)}">${escapeHtml(hasLink ? config.changeLabel : config.chooseLabel)}</button>
              ${hasLink ? `<button class="ghost-button" type="button" data-action="catalog-clear-link" data-link-type="${escapeAttribute(type)}">Clear Link</button>` : ''}
            </div>
          </div>
          ${state.dialogFieldErrors[config.fieldName] ? `<small class="staff-design-dialog-error">${escapeHtml(state.dialogFieldErrors[config.fieldName])}</small>` : ''}
        </div>
      `;
    }

    function renderLinkedItemSummary(type, option, record) {
      if (!option) {
        return `
          <div class="staff-finished-hat-linked-summary staff-finished-hat-linked-summary--empty">
            <div class="staff-finished-hat-linked-thumb staff-finished-hat-linked-thumb--placeholder"><span>Needs Linking</span></div>
            <div class="staff-finished-hat-linked-copy">
              <strong>Needs linking</strong>
              <p>No ${escapeHtml(getLinkTypeConfig(type).label.toLowerCase())} has been assigned yet.</p>
            </div>
          </div>
        `;
      }
      const summary = getLinkedSummaryParts(type, option, record);
      return `
        <div class="staff-finished-hat-linked-summary">
          <div class="staff-finished-hat-linked-thumb ${type === 'material' ? 'staff-finished-hat-linked-thumb--material' : ''}">
            ${option.thumbnailHtml}
          </div>
          <div class="staff-finished-hat-linked-copy">
            <strong>${escapeHtml(option.primaryLabel)}</strong>
            ${summary.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
          </div>
        </div>
      `;
    }

    function renderFinishedHatDetailField(label, value, wide = false) {
      if (!value) {
        return '';
      }
      return `
        <div class="staff-design-dialog-field ${wide ? 'staff-design-dialog-field--wide' : ''} staff-finished-hat-detail-field">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    }

    function renderDialogField(fieldName, label, inputHtml, wide = false) {
      const error = state.dialogFieldErrors[fieldName] || '';
      return `
        <label class="staff-design-dialog-field ${wide ? 'staff-design-dialog-field--wide' : ''} ${error ? 'staff-design-dialog-field--error' : ''}">
          <span>${escapeHtml(label)}</span>
          ${inputHtml}
          ${error ? `<small class="staff-design-dialog-error">${escapeHtml(error)}</small>` : ''}
        </label>
      `;
    }

    function renderVisualPicker() {
      const config = getLinkTypeConfig(state.pickerType);
      const options = getPickerOptionsForType(state.pickerType);
      const filteredOptions = filterPickerOptions(options, state.pickerType, state.pickerSearch, state.pickerFilters);
      const selectedChanged = state.pickerCurrentId !== state.pickerSelectedId;
      const finishedHatPreview = getFinishedHatPreviewDisplay(state.dialogPhotoFile, state.dialogPhotoPath, state.dialogValues.finished_hat_name);
      const hasExistingLink = Boolean(state.pickerCurrentId);

      return `
        <div class="staff-link-picker staff-finished-hat-picker" data-link-picker-root>
          <div class="staff-link-picker-shell staff-finished-hat-picker-shell">
            <aside class="staff-link-picker-compare staff-finished-hat-picker-compare">
              <span>Finished Hat</span>
              <div class="staff-design-thumbnail-preview staff-link-picker-compare-preview">
                ${finishedHatPreview.html}
              </div>
              <strong>${escapeHtml(state.dialogValues.finished_hat_name || 'Finished Hat')}</strong>
              <p>${escapeHtml(getFinishedHatMissingLinksSummary(normalizeFinishedHatRecord(state.dialogValues)) || 'Compare this hat with the library below.')}</p>
            </aside>
            <section class="staff-link-picker-panel staff-finished-hat-picker-panel">
              <div class="staff-link-picker-toolbar staff-finished-hat-picker-toolbar">
                <div>
                  <p class="eyebrow staff-orders-eyebrow">Visual Linking</p>
                  <h4>${escapeHtml(config.title)}</h4>
                  <p>${escapeHtml(config.description)}</p>
                </div>
                <div class="staff-link-picker-toolbar-actions staff-finished-hat-picker-toolbar-actions">
                  <button class="secondary-button" type="button" data-action="catalog-cancel-link-picker">Cancel</button>
                  ${hasExistingLink ? `<button class="ghost-button" type="button" data-action="catalog-picker-clear-existing-link">${escapeHtml(state.dialogMode === 'detail' ? 'Clear Existing Link' : 'Clear Selection')}</button>` : ''}
                  <button class="primary-button" type="button" data-action="catalog-apply-link-picker" ${state.pickerSaving || !selectedChanged ? 'disabled' : ''}>${escapeHtml(state.pickerSaving ? 'Applying...' : 'Apply Selection')}</button>
                </div>
              </div>
              <div class="staff-link-picker-filters staff-finished-hat-picker-filters">
                <label class="staff-catalog-designs-filter">
                  <span>Search</span>
                  <input type="search" value="${escapeAttribute(state.pickerSearch)}" placeholder="${escapeAttribute(config.searchPlaceholder)}" data-action="catalog-picker-search">
                </label>
                ${renderPickerFilterControls(state.pickerType, state.pickerFilters, options)}
                <div class="staff-catalog-designs-filter-clear">
                  <button class="secondary-button" type="button" data-action="catalog-picker-clear-filters">Clear Filters</button>
                </div>
              </div>
              ${state.optionError ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.optionError)}</p></div>` : ''}
              ${state.pickerError ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.pickerError)}</p></div>` : ''}
              ${renderPickerBody(state.pickerType, filteredOptions)}
            </section>
          </div>
        </div>
      `;
    }

    function renderPickerBody(type, options) {
      if (state.optionsLoading) {
        return '<div class="staff-catalog-designs-state"><p>Loading visual link options...</p></div>';
      }
      if (state.optionError && getPickerOptionsForType(type).length === 0) {
        return '<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>Catalog link options could not be loaded right now.</p></div>';
      }
      if (getPickerOptionsForType(type).length === 0) {
        return `<div class="staff-catalog-designs-state"><h4>No ${escapeHtml(getLinkTypeConfig(type).label.toLowerCase())} records yet</h4><p>${escapeHtml(getPickerEmptyCopy(type, false))}</p></div>`;
      }
      if (options.length === 0) {
        return `<div class="staff-catalog-designs-state"><h4>No results match these filters</h4><p>${escapeHtml(getPickerEmptyCopy(type, true))}</p></div>`;
      }
      return `<div class="staff-link-picker-grid staff-finished-hat-picker-grid ${type === 'design' ? 'staff-finished-hat-picker-grid--design' : ''}">${options.map((option) => renderPickerTile(type, option)).join('')}</div>`;
    }

    function renderPickerTile(type, option) {
      const selected = option.id === state.pickerSelectedId;
      return `
        <div
          class="staff-finished-hat-picker-tile staff-finished-hat-picker-tile--${escapeAttribute(type)} ${selected ? 'staff-finished-hat-picker-tile--selected' : ''}"
          role="option"
          tabindex="0"
          data-action="catalog-picker-select-card"
          data-link-type="${escapeAttribute(type)}"
          data-picker-option-id="${escapeAttribute(option.id)}"
          aria-selected="${selected ? 'true' : 'false'}"
          aria-label="${escapeAttribute(option.ariaLabel)}"
          title="${escapeAttribute(option.titleText || option.ariaLabel)}"
        >
          <div class="staff-finished-hat-picker-tile__media staff-finished-hat-picker-media staff-finished-hat-picker-media--${escapeAttribute(type)}">
            ${option.thumbnailHtml}
          </div>
          <span class="staff-finished-hat-picker-tile__marker">${escapeHtml(selected ? 'Selected' : 'Select')}</span>
        </div>
      `;
    }

    function getEventActionTarget(event) {
      const target = event && event.target ? event.target : null;
      if (!target) {
        return null;
      }
      if (typeof target.closest === 'function') {
        return target.closest('[data-action]');
      }
      return target.dataset?.action ? target : null;
    }

    function onDialogClick(event) {
      if (event.target === dialogBackdrop) {
        if (state.pickerOpen) {
          closePicker();
        } else {
          closeDialog();
        }
        return;
      }

      const actionTarget = getEventActionTarget(event);
      const action = actionTarget?.dataset?.action;
      if (!action) {
        return;
      }
      if (action === 'catalog-close-finished-hat-dialog') {
        closeDialog();
        return;
      }
      if (action === 'catalog-edit-finished-hat-detail') {
        switchDialogToEdit();
        return;
      }
      if (action === 'catalog-open-link-picker') {
        const type = String(actionTarget?.dataset?.linkType || '');
        openLinkPicker(type, actionTarget);
        return;
      }
      if (action === 'catalog-clear-link') {
        const type = String(actionTarget?.dataset?.linkType || '');
        clearLink(type);
        return;
      }
      if (action === 'catalog-picker-select-card') {
        state.pickerSelectedId = String(actionTarget?.dataset?.pickerOptionId || '');
        state.pickerError = '';
        renderDialog();
        return;
      }
      if (action === 'catalog-cancel-link-picker') {
        closePicker();
        return;
      }
      if (action === 'catalog-picker-clear-filters') {
        state.pickerSearch = '';
        state.pickerFilters = createDefaultPickerFilters(state.pickerType);
        renderDialog();
        return;
      }
      if (action === 'catalog-picker-clear-existing-link') {
        state.pickerSelectedId = '';
        state.pickerError = '';
        renderDialog();
        return;
      }
      if (action === 'catalog-apply-link-picker') {
        applyPickerSelection();
      }
    }

    function onDialogInput(event) {
      const target = event.target;
      if (!target) {
        return;
      }
      if (target.name && Object.prototype.hasOwnProperty.call(state.dialogValues, target.name)) {
        state.dialogValues[target.name] = String(target.value || '');
      }
      if (target.dataset?.action === 'catalog-picker-search') {
        state.pickerSearch = String(target.value || '');
        renderDialog();
      }
    }

    function onDialogChange(event) {
      const target = event.target;
      if (!target) {
        return;
      }
      if (target.dataset?.action === 'catalog-finished-hat-photo-input') {
        const file = target.files && target.files[0] ? target.files[0] : null;
        state.dialogPhotoFile = file;
        state.dialogPhotoFileName = file?.name || '';
        renderDialog();
        return;
      }
      if (target.name && Object.prototype.hasOwnProperty.call(state.dialogValues, target.name)) {
        state.dialogValues[target.name] = String(target.value || '');
      }
      const pickerFilterKey = target.dataset?.pickerFilter;
      if (pickerFilterKey) {
        state.pickerFilters[pickerFilterKey] = String(target.value || '');
        renderDialog();
      }
    }

    function onDialogKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (state.pickerOpen) {
          closePicker();
        } else {
          closeDialog();
        }
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const actionTarget = getEventActionTarget(event);
      if (actionTarget?.dataset?.action === 'catalog-picker-select-card') {
        event.preventDefault();
        state.pickerSelectedId = String(actionTarget.dataset?.pickerOptionId || '');
        state.pickerError = '';
        renderDialog();
      }
    }

    async function onDialogSubmit(event) {
      event.preventDefault();
      if (state.dialogMode === 'detail' || state.pickerOpen) {
        return;
      }
      if (state.dialogSaving) {
        return;
      }
      state.dialogSaving = true;
      state.dialogError = '';
      state.dialogFieldErrors = {};
      renderDialog();

      try {
        const payload = { ...state.dialogValues };
        let result;
        if (state.dialogMode === 'edit') {
          result = await apiClient.updateFinishedHat(state.dialogFinishedHatId, payload);
        } else {
          result = await apiClient.createFinishedHat(payload);
        }
        let finishedHat = normalizeFinishedHatRecord(result?.finished_hat || null);
        if (state.dialogPhotoFile) {
          const photoResult = await apiClient.uploadPhoto(finishedHat.id, state.dialogPhotoFile);
          finishedHat = normalizeFinishedHatRecord(photoResult?.finished_hat || finishedHat);
        }
        upsertRecord(finishedHat);
        state.dialogSaving = false;
        state.dialogRecord = finishedHat;
        state.dialogFinishedHatId = finishedHat.id;
        state.dialogPhotoPath = finishedHat.photo_path || state.dialogPhotoPath;
        state.dialogValues = createDialogValues(finishedHat);
        state.dialogPhotoFile = null;
        state.dialogPhotoFileName = '';
        if (state.dialogMode === 'edit') {
          state.dialogMode = 'detail';
          renderDialog();
        } else {
          closeDialog();
        }
        renderContent();
      } catch (error) {
        state.dialogSaving = false;
        state.dialogFieldErrors = error?.fields && typeof error.fields === 'object' ? error.fields : {};
        state.dialogError = safeErrorMessage(error, 'Finished hat changes could not be saved right now.');
        renderDialog();
      }
    }

    async function openLinkPicker(type, trigger) {
      const config = getLinkTypeConfig(type);
      if (!config) {
        return;
      }
      lastPickerFocusTarget = trigger || null;
      state.pickerOpen = true;
      state.pickerType = type;
      state.pickerSearch = '';
      state.pickerFilters = createDefaultPickerFilters(type);
      state.pickerError = '';
      state.pickerSaving = false;
      state.pickerTriggerLabel = config.label;
      const currentId = getCurrentLinkValue(type);
      state.pickerCurrentId = currentId;
      state.pickerSelectedId = currentId;
      renderDialog();
      await ensureLinkOptionsLoaded();
      renderDialog();
    }

    function closePicker() {
      resetPickerState();
      renderDialog();
      if (lastPickerFocusTarget && typeof lastPickerFocusTarget.focus === 'function') {
        lastPickerFocusTarget.focus();
      }
    }

    async function applyPickerSelection() {
      if (!state.pickerOpen || state.pickerSaving || state.pickerCurrentId === state.pickerSelectedId) {
        return;
      }
      const config = getLinkTypeConfig(state.pickerType);
      if (!config) {
        return;
      }

      if (state.dialogMode === 'detail') {
        state.pickerSaving = true;
        state.pickerError = '';
        renderDialog();
        try {
          const nextValues = {
            ...createDialogValues(state.dialogRecord),
            [config.fieldName]: state.pickerSelectedId
          };
          const result = await apiClient.updateFinishedHat(state.dialogFinishedHatId, nextValues);
          const finishedHat = normalizeFinishedHatRecord(result?.finished_hat || null);
          upsertRecord(finishedHat);
          state.dialogRecord = finishedHat;
          state.dialogValues = createDialogValues(finishedHat);
          state.dialogPhotoPath = finishedHat.photo_path || state.dialogPhotoPath;
          resetPickerState();
          renderContent();
          renderDialog();
        } catch (error) {
          state.pickerSaving = false;
          state.pickerError = safeErrorMessage(error, 'The link could not be saved right now.');
          renderDialog();
        }
        return;
      }

      state.dialogValues[config.fieldName] = state.pickerSelectedId;
      state.dialogFieldErrors[config.fieldName] = '';
      resetPickerState();
      renderDialog();
    }

    function clearLink(type) {
      const config = getLinkTypeConfig(type);
      if (!config) {
        return;
      }
      if (state.dialogMode === 'detail') {
        state.pickerOpen = true;
        state.pickerType = type;
        state.pickerCurrentId = getCurrentLinkValue(type);
        state.pickerSelectedId = '';
        applyPickerSelection();
        return;
      }
      state.dialogValues[config.fieldName] = '';
      state.dialogFieldErrors[config.fieldName] = '';
      renderDialog();
    }

    function upsertRecord(record) {
      const nextRecord = normalizeFinishedHatRecord(record);
      const existingIndex = state.records.findIndex((item) => item.id === nextRecord.id);
      if (existingIndex >= 0) {
        state.records.splice(existingIndex, 1, nextRecord);
      } else {
        state.records.push(nextRecord);
      }
      state.records = sortRecordsForCustomOrder(state.records);
      reorderController?.sync(state.records.map((item) => item.id));
    }

    function getReorderAvailability() {
      return orderingApi?.getReorderAvailability(state.sortKey, state.filters) || { enabled: false, reason: '' };
    }

    async function saveFinishedHatOrder(orderedIds) {
      if (!apiClient || typeof apiClient.reorderFinishedHats !== 'function') {
        state.notice = 'Finished hat ordering is currently unavailable.';
        state.noticeTone = 'error';
        renderContent();
        return false;
      }

      try {
        const result = await apiClient.reorderFinishedHats(orderedIds);
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
          state.notice = 'The finished hat order changed elsewhere. Reloaded the latest order.';
          state.noticeTone = 'error';
          await loadFinishedHats();
          return false;
        }
        state.notice = safeErrorMessage(error, 'Finished hat order could not be saved right now.');
        state.noticeTone = 'error';
        renderContent();
        return false;
      }
    }

    function openImageViewer(finishedHatId, opener) {
      const record = state.records.find((item) => item.id === finishedHatId) || null;
      if (!record || !record.photo_path || !imageViewer || typeof imageViewer.open !== 'function') {
        return;
      }
      imageViewer.open({
        items: getVisibleImageViewerItems(),
        selectedId: finishedHatId,
        opener
      });
    }

    function getVisibleImageViewerItems() {
      return sortFinishedHatRecords(filterFinishedHatRecords(state.records, state.filters), state.sortKey)
        .filter((record) => record.photo_path)
        .map((record) => ({
          id: record.id,
          typeLabel: 'Finished Hat',
          name: record.finished_hat_name,
          metadata: [
            getFinishedHatCompactSummary(record),
            getPlacementStatusLabel(record.placement_status),
            getFinishedHatStatusLabel(record.status)
          ].filter(Boolean).join(' | '),
          src: record.photo_path,
          alt: `${record.finished_hat_name || 'Finished hat'} photo`
        }));
    }

    function switchDialogToEdit() {
      if (!state.dialogRecord) {
        return;
      }
      state.dialogMode = 'edit';
      state.dialogError = '';
      state.dialogFieldErrors = {};
      state.dialogPhotoFile = null;
      state.dialogPhotoFileName = '';
      state.dialogValues = createDialogValues(state.dialogRecord);
      ensureLinkOptionsLoaded().finally(() => {
        renderDialog();
      });
    }

    function resetPickerState() {
      state.pickerOpen = false;
      state.pickerType = '';
      state.pickerSearch = '';
      state.pickerFilters = {};
      state.pickerSelectedId = '';
      state.pickerCurrentId = '';
      state.pickerSaving = false;
      state.pickerError = '';
      state.pickerTriggerLabel = '';
    }

    function focusDialogSoon() {
      windowLike.setTimeout(() => {
        dialogBackdrop.hidden = false;
        dialogNode?.querySelector('input, select, textarea, button, [tabindex]')?.focus();
      }, 0);
    }

    function focusPickerSoon() {
      windowLike.setTimeout(() => {
        dialogBackdrop.hidden = false;
        dialogNode?.querySelector('[data-action="catalog-picker-search"], [role="option"], button')?.focus();
      }, 0);
    }

    function getCurrentLinkValue(type) {
      const config = getLinkTypeConfig(type);
      if (!config) {
        return '';
      }
      if (state.dialogMode === 'detail') {
        return state.dialogRecord?.[config.fieldName] || '';
      }
      return state.dialogValues[config.fieldName] || '';
    }

    function getPickerOptionsForType(type) {
      if (type === 'design') {
        return state.designOptions;
      }
      if (type === 'hat') {
        return state.hatOptions;
      }
      if (type === 'material') {
        return state.materialOptions;
      }
      return [];
    }

    function getSelectedOptionForType(type, id) {
      return getPickerOptionsForType(type).find((option) => option.id === id) || null;
    }

    return {
      render,
      closeDialog,
      loadFinishedHats
    };
  }

  function filterFinishedHatRecords(records, filters) {
    const search = normalizeSearch(filters.search);
    return records.filter((record) => {
      if (search) {
        const searchDoc = normalizeSearch([
          record.finished_hat_name,
          record.design_name,
          record.hat_name,
          record.hat_manufacturer,
          record.hat_model,
          record.hat_color,
          record.material_name,
          record.material_type,
          record.material_color,
          getPlacementStatusLabel(record.placement_status),
          record.location_label,
          record.notes
        ].filter(Boolean).join(' '));
        if (!searchDoc.includes(search)) {
          return false;
        }
      }
      if (filters.design_name && record.design_name !== filters.design_name) {
        return false;
      }
      if (filters.hat_manufacturer && record.hat_manufacturer !== filters.hat_manufacturer) {
        return false;
      }
      if (filters.hat_model && record.hat_model !== filters.hat_model) {
        return false;
      }
      if (filters.hat_color && record.hat_color !== filters.hat_color) {
        return false;
      }
      if (filters.material_name && record.material_name !== filters.material_name) {
        return false;
      }
      if (filters.placement_status && record.placement_status !== filters.placement_status) {
        return false;
      }
      if (filters.status && record.status !== filters.status) {
        return false;
      }
      if (filters.needs_linking === 'needs_linking' && !record.needs_linking) {
        return false;
      }
      if (filters.needs_linking === 'fully_linked' && record.needs_linking) {
        return false;
      }
      return true;
    });
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
      placement_status: asTrimmedString(normalized.placement_status) || 'unassigned',
      location_label: asNullableTrimmedString(normalized.location_label),
      retail_price: asNullableTrimmedString(normalized.retail_price),
      status: asTrimmedString(normalized.status) || 'review',
      notes: asNullableTrimmedString(normalized.notes),
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
      needs_linking: Boolean(normalized.needs_linking),
      sort_order: asPositiveInteger(normalized.sort_order)
    };
  }

  function normalizeDesignOption(record) {
    const design = record && typeof record === 'object' ? record : {};
    const primaryLabel = asTrimmedString(design.design_name);
    const category = asNullableTrimmedString(design.category);
    const productionMethod = asNullableTrimmedString(design.production_method);
    const status = asTrimmedString(design.status) || 'review';
    return {
      id: asTrimmedString(design.id),
      primaryLabel,
      status,
      statusLabel: getFinishedHatStatusLabel(status),
      thumbnailHtml: design.thumbnail_path
        ? `<img class="staff-finished-hat-picker-image staff-finished-hat-picker-image--design" src="${escapeAttribute(design.thumbnail_path)}" alt="${escapeAttribute((primaryLabel || 'Design') + ' thumbnail')}">`
        : `<span class="staff-finished-hat-picker-placeholder">No Thumbnail</span>`,
      ariaLabel: `Select design ${primaryLabel || 'record'}`,
      titleText: [primaryLabel, category, productionMethod].filter(Boolean).join(' • ') || `Select design ${primaryLabel || 'record'}`,
      searchDocument: normalizeSearch([primaryLabel, category, productionMethod, design.notes].filter(Boolean).join(' ')),
      filters: {
        category: category || '',
        production_method: productionMethod || '',
        status
      },
      category,
      production_method: productionMethod
    };
  }

  function normalizeHatOption(record) {
    const hat = record && typeof record === 'object' ? record : {};
    const manufacturer = asNullableTrimmedString(hat.manufacturer);
    const model = asNullableTrimmedString(hat.model);
    const color = asNullableTrimmedString(hat.color);
    const hatName = asTrimmedString(hat.hat_name);
    const primaryLabel = [manufacturer, model, color].filter(Boolean).join(' — ') || hatName;
    const status = asTrimmedString(hat.status) || 'review';
    return {
      id: asTrimmedString(hat.id),
      primaryLabel,
      status,
      statusLabel: getFinishedHatStatusLabel(status),
      thumbnailHtml: hat.photo_path
        ? `<img class="staff-finished-hat-picker-image staff-finished-hat-picker-image--hat" src="${escapeAttribute(hat.photo_path)}" alt="${escapeAttribute((hatName || 'Hat') + ' photo')}">`
        : `<span class="staff-finished-hat-picker-placeholder">No Photo</span>`,
      ariaLabel: `Select hat ${[manufacturer, model, color].filter(Boolean).join(' ') || hatName || 'record'}`,
      titleText: [manufacturer, model, color, hatName].filter(Boolean).join(' • ') || `Select hat ${hatName || 'record'}`,
      searchDocument: normalizeSearch([hatName, manufacturer, model, color, hat.notes].filter(Boolean).join(' ')),
      filters: {
        manufacturer: manufacturer || '',
        model: model || '',
        color: color || '',
        status
      },
      manufacturer,
      model,
      color,
      hat_name: hatName
    };
  }

  function normalizeMaterialOption(record) {
    const material = record && typeof record === 'object' ? record : {};
    const materialName = asTrimmedString(material.material_name);
    const materialType = asNullableTrimmedString(material.material_type);
    const color = asNullableTrimmedString(material.color);
    const productionMethod = asNullableTrimmedString(material.production_method);
    const supplier = asNullableTrimmedString(material.supplier);
    const status = asTrimmedString(material.status) || 'review';
    const fitMode = getMaterialSwatchFitMode(material);
    return {
      id: asTrimmedString(material.id),
      primaryLabel: materialName,
      status,
      statusLabel: getFinishedHatStatusLabel(status),
      thumbnailHtml: material.swatch_path
        ? `<img class="staff-finished-hat-picker-image staff-finished-hat-picker-image--material staff-finished-hat-picker-image--material-${escapeAttribute(fitMode)}" src="${escapeAttribute(material.swatch_path)}" alt="${escapeAttribute((materialName || 'Material') + ' swatch')}">`
        : `<span class="staff-finished-hat-picker-placeholder">No Swatch</span>`,
      ariaLabel: `Select material ${materialName || 'record'}`,
      titleText: [materialName, materialType, color, productionMethod].filter(Boolean).join(' • ') || `Select material ${materialName || 'record'}`,
      searchDocument: normalizeSearch([materialName, materialType, color, productionMethod, supplier, material.notes].filter(Boolean).join(' ')),
      filters: {
        material_type: materialType || '',
        production_method: productionMethod || '',
        color: color || '',
        status
      },
      material_type: materialType,
      color,
      production_method: productionMethod
    };
  }

  function compareFinishedHatsByName(left, right) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.compareNullableText(left?.finished_hat_name, right?.finished_hat_name);
  }

  function sortFinishedHatRecords(records, sortKey) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.sortCatalogRecords(records, {
      sortKey,
      compareLabel: compareFinishedHatsByName,
      comparators: {
        custom: orderingApi.compareCustomOrder,
        az: compareFinishedHatsByName,
        recent(left, right) {
          return orderingApi.compareDatesDescending(left?.created_at, right?.created_at);
        },
        status(left, right) {
          return orderingApi.compareNullableText(getFinishedHatStatusLabel(left?.status), getFinishedHatStatusLabel(right?.status));
        },
        placement_status(left, right) {
          return orderingApi.compareNullableText(getPlacementStatusLabel(left?.placement_status), getPlacementStatusLabel(right?.placement_status));
        },
        hat_color(left, right) {
          return orderingApi.compareNullableText(left?.hat_color, right?.hat_color);
        },
        hat_manufacturer(left, right) {
          return orderingApi.compareNullableText(left?.hat_manufacturer, right?.hat_manufacturer);
        },
        hat_model(left, right) {
          return orderingApi.compareNullableText(left?.hat_model, right?.hat_model);
        },
        design_name(left, right) {
          return orderingApi.compareNullableText(left?.design_name, right?.design_name);
        },
        material_name(left, right) {
          return orderingApi.compareNullableText(left?.material_name, right?.material_name);
        }
      }
    });
  }

  function sortRecordsForCustomOrder(records) {
    return sortFinishedHatRecords(records, 'custom');
  }

  function compareOptionsByLabel(left, right) {
    return left.primaryLabel.localeCompare(right.primaryLabel, undefined, { sensitivity: 'base' });
  }

  function collectFinishedHatFilterOptions(records, key) {
    return [...new Set(records.map((record) => record[key]).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  function renderDynamicSelectOptions(options, selectedValue, emptyLabel) {
    return [`<option value="">${escapeHtml(emptyLabel || 'Select')}</option>`]
      .concat(options.map((option) => `<option value="${escapeAttribute(option)}" ${option === selectedValue ? 'selected' : ''}>${escapeHtml(option)}</option>`))
      .join('');
  }

  function renderLabeledSelectOptions(options, selectedValue, emptyLabel) {
    return [`<option value="">${escapeHtml(emptyLabel || 'Select')}</option>`]
      .concat(options.map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`))
      .join('');
  }

  function createLabeledOption(value, label) {
    return {
      value: String(value || ''),
      label: String(label || value || '')
    };
  }

  function renderStatusOptions(selectedValue, emptyLabel) {
    const options = emptyLabel ? [`<option value="">${escapeHtml(emptyLabel)}</option>`] : [];
    Object.entries(STATUS_LABELS).forEach(([value, label]) => {
      options.push(`<option value="${escapeAttribute(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
  }

  function renderPlacementStatusOptions(selectedValue, emptyLabel) {
    const options = emptyLabel ? [`<option value="">${escapeHtml(emptyLabel)}</option>`] : [];
    Object.entries(PLACEMENT_STATUS_LABELS).forEach(([value, label]) => {
      options.push(`<option value="${escapeAttribute(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
  }

  function renderFinishedHatMetaRow(label, value) {
    if (!value) {
      return '';
    }
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function getFinishedHatPhotoDisplay(record) {
    const normalized = normalizeFinishedHatRecord(record);
    if (normalized.photo_path) {
      return {
        html: `<img class="staff-finished-hat-card-thumb-image" src="${escapeAttribute(normalized.photo_path)}" alt="${escapeAttribute((normalized.finished_hat_name || 'Finished hat') + ' photo')}">`
      };
    }
    return { html: `<span class="staff-design-card-thumb-placeholder">${escapeHtml(MISSING_PHOTO_COPY)}</span>` };
  }

  function getFinishedHatCompactSummary(record) {
    const parts = [
      record.design_name,
      formatFinishedHatHatSummary(record),
      formatFinishedHatMaterialSummary(record)
    ].filter(Boolean);

    return parts.join(' • ');
  }

  function getFinishedHatMissingLinksSummary(record) {
    const missing = [];
    if (!record.design_id) {
      missing.push('Design');
    }
    if (!record.hat_id) {
      missing.push('Hat');
    }
    if (!record.material_id) {
      missing.push('Material');
    }
    if (missing.length === 0) {
      return '';
    }
    if (missing.length === 3) {
      return 'Needs 3 Links';
    }
    return `Needs ${missing.join(' + ')}`;
  }

  function getFinishedHatPrimaryBadge(record) {
    if (record.placement_status && record.placement_status !== 'unassigned') {
      return {
        label: getPlacementStatusLabel(record.placement_status),
        tone: 'neutral'
      };
    }
    return {
      label: getFinishedHatStatusLabel(record.status),
      tone: record.status || 'review'
    };
  }

  function getFinishedHatPreviewDisplay(file, photoPath, finishedHatName) {
    if (file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(file);
      return {
        html: `<img src="${escapeAttribute(objectUrl)}" alt="${escapeAttribute((finishedHatName || 'Finished hat') + ' preview')}">`
      };
    }
    if (photoPath) {
      return {
        html: `<img src="${escapeAttribute(photoPath)}" alt="${escapeAttribute((finishedHatName || 'Finished hat') + ' preview')}">`
      };
    }
    return {
      html: `<span class="staff-design-thumbnail-preview-placeholder">${escapeHtml(MISSING_PHOTO_COPY)}</span>`
    };
  }

  function buildFallbackLinkedOption(type, record) {
    if (!record) {
      return null;
    }
    if (type === 'design' && record.design_name) {
      return {
        primaryLabel: record.design_name,
        thumbnailHtml: '<span class="staff-finished-hat-picker-placeholder">Design</span>'
      };
    }
    if (type === 'hat' && formatFinishedHatHatSummary(record)) {
      return {
        primaryLabel: formatFinishedHatHatSummary(record),
        thumbnailHtml: '<span class="staff-finished-hat-picker-placeholder">Hat</span>'
      };
    }
    if (type === 'material' && formatFinishedHatMaterialSummary(record)) {
      return {
        primaryLabel: formatFinishedHatMaterialSummary(record),
        thumbnailHtml: '<span class="staff-finished-hat-picker-placeholder">Material</span>'
      };
    }
    return null;
  }

  function getLinkedSummaryParts(type, option, record) {
    if (type === 'design') {
      return [
        option.category || record?.category || null,
        option.production_method || record?.production_method || null,
        option.statusLabel || null
      ].filter(Boolean);
    }
    if (type === 'hat') {
      return [
        option.hat_name || record?.hat_name || null,
        option.primaryLabel || null,
        option.statusLabel || null
      ].filter((value, index, list) => value && list.indexOf(value) === index);
    }
    return [
      option.material_type || record?.material_type || null,
      option.color || record?.material_color || null,
      option.production_method || record?.production_method || null,
      option.statusLabel || null
    ].filter(Boolean);
  }

  function getLinkTypeConfig(type) {
    const map = {
      design: {
        label: 'Design',
        title: 'Choose Design',
        description: 'Compare the finished-hat photo against design thumbnails before applying a link.',
        chooseLabel: 'Choose Design',
        changeLabel: 'Change Design',
        searchPlaceholder: 'Search designs',
        fieldName: 'design_id'
      },
      hat: {
        label: 'Hat',
        title: 'Choose Hat',
        description: 'Compare the finished-hat photo against blank hat photos before applying a link.',
        chooseLabel: 'Choose Hat',
        changeLabel: 'Change Hat',
        searchPlaceholder: 'Search hats',
        fieldName: 'hat_id'
      },
      material: {
        label: 'Material',
        title: 'Choose Material',
        description: 'Compare the finished-hat photo against swatches before applying a link.',
        chooseLabel: 'Choose Material',
        changeLabel: 'Change Material',
        searchPlaceholder: 'Search materials',
        fieldName: 'material_id'
      }
    };
    return map[type] || null;
  }

  function createDefaultPickerFilters(type) {
    if (type === 'design') {
      return { category: '', production_method: '', status: '' };
    }
    if (type === 'hat') {
      return { manufacturer: '', model: '', color: '', status: '' };
    }
    return { material_type: '', production_method: '', color: '', status: '' };
  }

  function renderPickerFilterControls(type, filters, options) {
    const filterDefs = getPickerFilterDefinitions(type, options);
    return filterDefs.map((filter) => `
      <label class="staff-catalog-designs-filter">
        <span>${escapeHtml(filter.label)}</span>
        <select data-picker-filter="${escapeAttribute(filter.key)}">
          ${renderLabeledSelectOptions(filter.options, filters[filter.key] || '', filter.emptyLabel)}
        </select>
      </label>
    `).join('');
  }

  function getPickerFilterDefinitions(type, options) {
    if (type === 'design') {
      return [
        { key: 'category', label: 'Category', emptyLabel: 'All Categories', options: collectOptionFilterValues(options, 'category').map((value) => createLabeledOption(value)) },
        { key: 'production_method', label: 'Production Method', emptyLabel: 'All Methods', options: collectOptionFilterValues(options, 'production_method').map((value) => createLabeledOption(value)) },
        { key: 'status', label: 'Status', emptyLabel: 'All Statuses', options: collectOptionFilterValues(options, 'status').map((status) => createLabeledOption(status, STATUS_LABELS[status] || status)) }
      ];
    }
    if (type === 'hat') {
      return [
        { key: 'manufacturer', label: 'Manufacturer', emptyLabel: 'All Manufacturers', options: collectOptionFilterValues(options, 'manufacturer').map((value) => createLabeledOption(value)) },
        { key: 'model', label: 'Model', emptyLabel: 'All Models', options: collectOptionFilterValues(options, 'model').map((value) => createLabeledOption(value)) },
        { key: 'color', label: 'Color', emptyLabel: 'All Colors', options: collectOptionFilterValues(options, 'color').map((value) => createLabeledOption(value)) },
        { key: 'status', label: 'Status', emptyLabel: 'All Statuses', options: collectOptionFilterValues(options, 'status').map((status) => createLabeledOption(status, STATUS_LABELS[status] || status)) }
      ];
    }
    return [
      { key: 'material_type', label: 'Material Type', emptyLabel: 'All Types', options: collectOptionFilterValues(options, 'material_type').map((value) => createLabeledOption(value)) },
      { key: 'production_method', label: 'Production Method', emptyLabel: 'All Methods', options: collectOptionFilterValues(options, 'production_method').map((value) => createLabeledOption(value)) },
      { key: 'color', label: 'Color', emptyLabel: 'All Colors', options: collectOptionFilterValues(options, 'color').map((value) => createLabeledOption(value)) },
      { key: 'status', label: 'Status', emptyLabel: 'All Statuses', options: collectOptionFilterValues(options, 'status').map((status) => createLabeledOption(status, STATUS_LABELS[status] || status)) }
    ];
  }

  function filterPickerOptions(options, type, search, filters) {
    const normalizedSearch = normalizeSearch(search);
    return options.filter((option) => {
      if (normalizedSearch && !option.searchDocument.includes(normalizedSearch)) {
        return false;
      }
      const rawFilters = getRawPickerFilters(type, filters);
      return Object.entries(rawFilters).every(([key, value]) => {
        if (!value) {
          return true;
        }
        return (option.filters[key] || '') === value;
      });
    });
  }

  function getRawPickerFilters(type, filters) {
    if (type === 'design' || type === 'hat' || type === 'material') {
      return filters || {};
    }
    return {};
  }

  function collectOptionFilterValues(options, key) {
    return [...new Set(options.map((option) => option[key]).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  function getPickerEmptyCopy(type, filtered) {
    if (type === 'hat' && filtered) {
      return 'No matching hat is currently in the Hat Library.';
    }
    if (filtered) {
      return 'Adjust the search or clear filters to see more results.';
    }
    return `Add the first ${getLinkTypeConfig(type).label.toLowerCase()} record to start linking finished hats visually.`;
  }

  function createDialogValues(record) {
    return {
      finished_hat_name: record?.finished_hat_name || '',
      design_id: record?.design_id || '',
      hat_id: record?.hat_id || '',
      material_id: record?.material_id || '',
      patch_shape: record?.patch_shape || '',
      patch_size: record?.patch_size || '',
      placement_status: record?.placement_status || 'unassigned',
      location_label: record?.location_label || '',
      retail_price: record?.retail_price || '',
      status: record?.status || 'review',
      notes: record?.notes || ''
    };
  }

  function formatFinishedHatHatSummary(record) {
    return [record.hat_manufacturer, record.hat_model, record.hat_color].filter(Boolean).join(' — ');
  }

  function formatFinishedHatMaterialSummary(record) {
    return [record.material_name, record.material_type, record.material_color].filter(Boolean).join(' — ');
  }

  function getFinishedHatStatusLabel(status) {
    return STATUS_LABELS[status] || 'In Review';
  }

  function getPlacementStatusLabel(status) {
    return PLACEMENT_STATUS_LABELS[status] || 'Unassigned';
  }

  function getMaterialSwatchFitMode(record) {
    const width = asNullablePositiveInteger(record?.image_width);
    const height = asNullablePositiveInteger(record?.image_height);
    if (!width || !height) {
      return 'contain';
    }
    const ratio = width / height;
    return ratio < 0.85 ? 'cover' : 'contain';
  }

  function formatRetailPrice(value) {
    const normalized = asNullableTrimmedString(value);
    return normalized ? `$${normalized}` : '';
  }

  function safeErrorMessage(error, fallbackMessage) {
    return error && typeof error.message === 'string' && error.message.trim()
      ? error.message.trim()
      : fallbackMessage;
  }

  function normalizeSearch(value) {
    return String(value || '').trim().toLowerCase();
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
    return escapeHtml(value);
  }

  function renderStaticOptions(options, selectedValue) {
    return options.map((option) => (
      `<option value="${escapeAttribute(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
    )).join('');
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
            return asPositiveInteger(left?.sort_order) - asPositiveInteger(right?.sort_order);
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
        return asPositiveInteger(left?.sort_order) - asPositiveInteger(right?.sort_order);
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
    PLACEMENT_STATUS_LABELS,
    SORT_OPTIONS,
    createStaffFinishedHatCatalogModule,
    filterFinishedHatRecords,
    normalizeFinishedHatRecord,
    getFinishedHatPhotoDisplay,
    getFinishedHatCompactSummary,
    getFinishedHatMissingLinksSummary,
    formatFinishedHatHatSummary,
    formatFinishedHatMaterialSummary,
    getPlacementStatusLabel,
    getMaterialSwatchFitMode,
    sortFinishedHatRecords
  };
}));
