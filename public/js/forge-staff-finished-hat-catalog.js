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
  const FINISHED_HAT_PHOTO_MAX_BYTES = 5242880;
  const FINISHED_HAT_PHOTO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const PINTEREST_NOPIN_IMAGE_ATTRIBUTES = ' nopin="nopin" data-pin-nopin="true"';
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
      inventories: {},
      inventoryLocations: [],
      locationEditingId: '',
      locationFormOpen: false,
      locationValues: { location_name: '', location_type: 'boutique', status: 'active', notes: '' },
      locationManagerReturnRecord: null,
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
      dialogPhotoDragActive: false,
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
        if (inventoryApiClient?.getLocationInventory) {
          const [locations, inventories] = await Promise.all([
            inventoryApiClient.listLocations?.(true) || { locations: [] },
            Promise.all(state.records.map(async (record) => [record.id, await inventoryApiClient.getLocationInventory('catalog_finished_hat', record.id)]))
          ]);
          state.inventoryLocations = Array.isArray(locations?.locations) ? locations.locations : [];
          state.inventories = Object.fromEntries(inventories.map(([id, response]) => [id, response?.inventory || null]));
        }
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
              <button class="secondary-button" type="button" data-action="catalog-manage-inventory-locations">Manage Locations</button>
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
      const missingLinksSummary = getFinishedHatMissingLinksSummary(record);
      const primaryBadge = getFinishedHatPrimaryBadge(record);
      const inventory = state.inventories[record.id];
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
                ${missingLinksSummary ? '<p class="staff-finished-hat-card-missing-links">Needs setup</p>' : ''}
                <p class="staff-finished-hat-card-summary-line staff-finished-hat-inventory-summary">${escapeHtml(formatFinishedHatInventorySummary(inventory))}</p>
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
      if (action === 'catalog-manage-inventory-locations') {
        openDialog('locations', null, event.target);
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
      dialogBackdrop.addEventListener('dragenter', onFinishedHatPhotoDragEnter, true);
      dialogBackdrop.addEventListener('dragover', onFinishedHatPhotoDragOver, true);
      dialogBackdrop.addEventListener('dragleave', onFinishedHatPhotoDragLeave, true);
      dialogBackdrop.addEventListener('drop', onFinishedHatPhotoDrop, true);
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
      state.dialogPhotoDragActive = false;
      state.dialogValues = createDialogValues(record);
      state.locationEditingId = '';
      state.locationFormOpen = false;
      state.locationValues = { location_name: '', location_type: 'boutique', status: 'active', notes: '' };
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
      state.dialogPhotoDragActive = false;
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
          : (state.dialogMode === 'locations'
            ? `${state.locationManagerReturnRecord ? '<button class="secondary-button" type="button" data-action="catalog-return-finished-hat-inventory">Back to Finished Hat</button>' : ''}<button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Close</button>`
            : (state.dialogMode === 'detail'
            ? `
              <button class="primary-button" type="button" data-action="catalog-edit-finished-hat-detail">Edit</button>
              <button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Close</button>
            `
            : `
              <button class="primary-button" type="submit" form="staff-finished-hat-dialog-form" ${state.dialogSaving ? 'disabled' : ''}>${escapeHtml(state.dialogSaving ? 'Saving...' : (state.dialogMode === 'edit' ? 'Save Finished Hat' : 'Add Finished Hat'))}</button>
              <button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Cancel</button>
            `));
      }

      statusNode.innerHTML = state.dialogError
        ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.dialogError)}</p></div>`
        : '';

      if (state.pickerOpen) {
        formNode.innerHTML = renderVisualPicker();
        focusPickerSoon();
        return;
      }

      if (state.dialogMode === 'locations') {
        formNode.innerHTML = renderInventoryLocationManager();
        focusDialogSoon();
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
            <div class="staff-finished-hat-detail-top staff-design-dialog-field--wide">
              <div class="staff-design-thumbnail-panel staff-design-dialog-field">
                <span>Primary Photo</span>
                <div class="staff-design-thumbnail-preview">
                  ${getFinishedHatPreviewDisplay(null, record.photo_path, record.finished_hat_name).html}
                </div>
              </div>
              <div class="staff-finished-hat-top-inventory">
                <div class="staff-finished-hat-detail-panel staff-design-dialog-field">
                  <span>Finished Hat Name</span>
                  <strong class="staff-finished-hat-detail-title">${escapeHtml(record.finished_hat_name || 'Finished Hat')}</strong>
                  <div class="staff-finished-hat-detail-badges">
                    <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(record.status || 'review')}">${escapeHtml(getFinishedHatStatusLabel(record.status))}</span>
                    <span class="staff-finished-hat-placement-meta">${escapeHtml(`Placement: ${getPlacementStatusLabel(record.placement_status)}`)}</span>
                  </div>
                </div>
                ${renderFinishedHatInventoryPanel(record, state.inventories[record.id], state.inventoryLocations)}
              </div>
            </div>
            ${renderBuildDetailsSection(record)}
            ${renderFinishedHatDetailField('Patch Shape', record.patch_shape)}
            ${renderFinishedHatDetailField('Patch Size', record.patch_size)}
            ${renderFinishedHatDetailField('Legacy Placement Label', record.location_label)}
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
            <div class="staff-design-thumbnail-panel staff-design-dialog-field staff-design-dialog-field--wide staff-finished-hat-photo-dropzone ${state.dialogPhotoDragActive ? 'staff-finished-hat-photo-dropzone--dragging' : ''}" data-catalog-finished-hat-photo-dropzone>
              <span>Primary Photo</span>
              <div class="staff-design-thumbnail-preview">
                ${preview.html}
              </div>
              <label class="secondary-button staff-design-thumbnail-input" type="button">
                <span>${state.dialogPhotoPath || state.dialogPhotoFileName ? 'Replace Photo' : 'Choose Photo'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" data-action="catalog-finished-hat-photo-input">
              </label>
              <p class="staff-design-thumbnail-copy">${escapeHtml(state.dialogPhotoFileName || state.dialogPhotoPath || 'Drop finished hat photo here, or choose a file')}</p>
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

    function renderInventoryLocationManager() {
      const editing = state.inventoryLocations.find((location) => location.id === state.locationEditingId) || null;
      const showForm = Boolean(editing || state.locationFormOpen);
      const values = state.locationValues;
      return `<section class="staff-finished-hat-location-manager"><div class="staff-finished-hat-inventory-panel-header"><span>Inventory Locations</span><strong>Locations are shared across Finished Hats.</strong></div>
        <div class="staff-finished-hat-location-list">${state.inventoryLocations.map((location) => `<div class="staff-finished-hat-inventory-row"><div><strong>${escapeHtml(location.location_name)}</strong><span>${escapeHtml(`${location.location_type} · ${location.status}`)}</span></div><button type="button" class="secondary-button" data-action="catalog-edit-inventory-location" data-location-id="${escapeAttribute(location.id)}">Edit</button></div>`).join('') || '<p>No inventory locations are available yet.</p>'}</div>
        ${showForm ? `<div class="staff-finished-hat-location-editor"><strong>${editing ? 'Edit Location' : 'Add Location'}</strong><label>Location Name <input type="text" data-location-field="location_name" value="${escapeAttribute(values.location_name || '')}"></label><label>Location Type <select data-location-field="location_type"><option value="internal" ${values.location_type === 'internal' ? 'selected' : ''}>Internal</option><option value="boutique" ${values.location_type === 'boutique' ? 'selected' : ''}>Boutique</option><option value="consignment" ${values.location_type === 'consignment' ? 'selected' : ''}>Consignment</option></select></label><label>Status <select data-location-field="status"><option value="active" ${values.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${values.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></label><label>Note <textarea data-location-field="notes">${escapeHtml(values.notes || '')}</textarea></label><div><button type="button" class="primary-button" data-action="catalog-save-inventory-location">Save</button><button type="button" class="secondary-button" data-action="catalog-cancel-inventory-location-edit">Cancel</button></div></div>` : '<button type="button" class="secondary-button staff-finished-hat-location-add" data-action="catalog-add-inventory-location">+ Add Location</button>'}
      </section>`;
    }

    function formatFinishedHatInventorySummary(inventory) {
      if (!inventory || inventory.completeness === 'not_counted') return 'Inventory: Not Counted';
      return `Inventory: ${inventory.derived_quantity}`;
    }

    function renderFinishedHatInventoryPanel(record, inventory, locations) {
      const assigned = inventory?.balances || [];
      const unassigned = (locations || []).filter((location) => location.status === 'active' && !assigned.some((balance) => balance.inventory_location_id === location.id));
      const totalLabel = inventory?.completeness === 'complete' ? 'Total On Hand' : (inventory?.completeness === 'partial' ? 'Counted On Hand' : 'Inventory');
      const totalValue = inventory?.completeness === 'not_counted' || !inventory ? 'Not Counted' : String(inventory.derived_quantity);
      return `<section class="staff-finished-hat-inventory-panel"><div class="staff-finished-hat-inventory-panel-header"><span>Finished Hat Inventory</span></div><div class="staff-finished-hat-inventory-total"><span>${escapeHtml(totalLabel)}</span><strong>${escapeHtml(totalValue)}</strong>${inventory?.completeness === 'partial' ? `<small>${escapeHtml(`${inventory.not_counted_location_count} location${inventory.not_counted_location_count === 1 ? '' : 's'} still Not Counted`)}</small>` : ''}</div>
        <div class="staff-finished-hat-inventory-locations">${assigned.map((balance) => `<div class="staff-finished-hat-inventory-row"><div class="staff-finished-hat-inventory-location-quantity"><span>${escapeHtml(balance.location_name)}</span><strong>${balance.on_hand_quantity === null ? 'Not Counted' : balance.on_hand_quantity}</strong></div>
          ${balance.on_hand_quantity === null ? `<div class="staff-finished-hat-inventory-initial-count"><input data-finished-inventory-count="${escapeAttribute(balance.inventory_location_id)}" type="number" min="0" step="1" placeholder="Physical Count"><button type="button" class="primary-button" data-action="catalog-finished-inventory-count" data-location-id="${escapeAttribute(balance.inventory_location_id)}">Save Count</button></div>` : `<div class="staff-finished-hat-inventory-actions"><button type="button" class="secondary-button" data-action="catalog-finished-inventory-adjust" data-location-id="${escapeAttribute(balance.inventory_location_id)}" data-reason="sold">− Sold</button><button type="button" class="secondary-button" data-action="catalog-finished-inventory-adjust" data-location-id="${escapeAttribute(balance.inventory_location_id)}" data-reason="received_built">+ Built</button><details class="staff-finished-hat-inventory-more"><summary>More</summary><div><button type="button" class="ghost-button" data-action="catalog-finished-inventory-adjust" data-location-id="${escapeAttribute(balance.inventory_location_id)}" data-reason="returned">+ Returned</button><input data-finished-inventory-correction="${escapeAttribute(balance.inventory_location_id)}" type="number" min="0" step="1" placeholder="Verified qty"><button type="button" class="ghost-button" data-action="catalog-finished-inventory-correct" data-location-id="${escapeAttribute(balance.inventory_location_id)}">Save Correction</button></div></details></div>`}</div>`).join('') || '<p class="staff-finished-hat-inventory-empty">No locations assigned.</p>'}</div>
        <div class="staff-finished-hat-inventory-utilities">${unassigned.length ? `<details><summary>+ Add Location</summary><div class="staff-finished-hat-inventory-utility-body"><select data-finished-inventory-assign>${unassigned.map((location) => `<option value="${escapeAttribute(location.id)}">${escapeHtml(location.location_name)}</option>`).join('')}</select><button type="button" class="secondary-button" data-action="catalog-finished-inventory-assign">Assign Location</button></div></details>` : ''}<button type="button" class="ghost-button" data-action="catalog-manage-inventory-locations">Manage Locations</button>
        ${(assigned.filter((balance) => balance.on_hand_quantity !== null).length >= 2) ? `<details><summary>Transfer Stock</summary><div class="staff-finished-hat-inventory-transfer"><select data-finished-inventory-transfer-source>${assigned.filter((b) => b.on_hand_quantity !== null).map((b) => `<option value="${escapeAttribute(b.inventory_location_id)}">${escapeHtml(b.location_name)}</option>`).join('')}</select><select data-finished-inventory-transfer-destination>${assigned.filter((b) => b.on_hand_quantity !== null).map((b) => `<option value="${escapeAttribute(b.inventory_location_id)}">${escapeHtml(b.location_name)}</option>`).join('')}</select><input type="number" min="1" step="1" data-finished-inventory-transfer-quantity placeholder="Qty"><button type="button" class="secondary-button" data-action="catalog-finished-inventory-transfer">Transfer</button></div></details>` : ''}</div>
        ${assigned.length ? `<details class="staff-finished-hat-inventory-history"><summary>Inventory History ›</summary>${(inventory.movements || []).map((movement) => `<p>${escapeHtml(movement.location_name || '')} · ${escapeHtml(movement.reason_code)} · ${escapeHtml(String(movement.quantity_before ?? 'Unknown'))} → ${escapeHtml(String(movement.quantity_after))}</p>`).join('') || '<p>No movements yet.</p>'}</details>` : ''}
      </section>`;
    }

    function renderBuildDetailsSection(record) {
      return `
        <section class="staff-finished-hat-build-details staff-design-dialog-field staff-design-dialog-field--wide" aria-labelledby="staff-finished-hat-build-details-title">
          <div class="staff-finished-hat-build-details-header">
            <span id="staff-finished-hat-build-details-title">Build Details</span>
          </div>
          <div class="staff-finished-hat-build-details-rows">
            ${renderBuildDetailsRow('design', record)}
            ${renderBuildDetailsRow('hat', record)}
            ${renderBuildDetailsRow('material', record)}
          </div>
        </section>
      `;
    }

    function renderBuildDetailsRow(type, record) {
      const config = getLinkTypeConfig(type);
      const linkedOption = getSelectedOptionForType(type, record?.[config.fieldName] || '') || buildFallbackLinkedOption(type, record);
      const hasLink = Boolean(linkedOption);
      return `
        <div class="staff-finished-hat-build-details-row ${hasLink ? 'staff-finished-hat-build-details-row--linked' : 'staff-finished-hat-build-details-row--empty'}">
          <span class="staff-finished-hat-build-details-label">${escapeHtml(config.label)}</span>
          <div class="staff-finished-hat-build-details-value">
            ${renderBuildDetailsValue(type, linkedOption, record)}
          </div>
          <div class="staff-finished-hat-build-details-actions">
            <button class="secondary-button" type="button" data-action="catalog-open-link-picker" data-link-type="${escapeAttribute(type)}">${escapeHtml(hasLink ? config.changeLabel : config.chooseLabel)}</button>
            ${hasLink ? `<button class="ghost-button" type="button" data-action="catalog-clear-link" data-link-type="${escapeAttribute(type)}">Clear Link</button>` : ''}
          </div>
        </div>
      `;
    }

    function renderBuildDetailsValue(type, option, record) {
      if (!option) {
        return '<strong class="staff-finished-hat-build-details-not-linked">Not linked</strong>';
      }
      return `<strong class="staff-finished-hat-build-details-linked">${escapeHtml(option.primaryLabel)}</strong>`;
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
      return `<div class="staff-link-picker-grid staff-finished-hat-picker-grid staff-finished-hat-picker-grid--${escapeAttribute(type)}">${options.map((option) => renderPickerTile(type, option)).join('')}</div>`;
    }

    function renderPickerTile(type, option) {
      const selected = option.id === state.pickerSelectedId;
      if (type === 'hat') {
        return renderFinishedHatHatPickerCard(option, selected);
      }
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
      if (action === 'catalog-manage-inventory-locations') {
        state.locationManagerReturnRecord = state.dialogMode === 'detail' ? state.dialogRecord : null;
        state.dialogMode = 'locations';
        state.dialogError = '';
        renderDialog();
        return;
      }
      if (action === 'catalog-return-finished-hat-inventory') {
        state.dialogMode = 'detail';
        state.dialogRecord = state.locationManagerReturnRecord;
        state.locationManagerReturnRecord = null;
        renderDialog();
        return;
      }
      if (action === 'catalog-edit-inventory-location') {
        const location = state.inventoryLocations.find((item) => item.id === actionTarget?.dataset?.locationId);
        if (location) { state.locationEditingId = location.id; state.locationFormOpen = true; state.locationValues = { location_name: location.location_name || '', location_type: location.location_type || 'boutique', status: location.status || 'active', notes: location.notes || '' }; renderDialog(); }
        return;
      }
      if (action === 'catalog-add-inventory-location') {
        state.locationEditingId = ''; state.locationFormOpen = true; state.locationValues = { location_name: '', location_type: 'boutique', status: 'active', notes: '' }; renderDialog(); return;
      }
      if (action === 'catalog-cancel-inventory-location-edit') {
        state.locationEditingId = ''; state.locationFormOpen = false; state.locationValues = { location_name: '', location_type: 'boutique', status: 'active', notes: '' }; renderDialog(); return;
      }
      if (action === 'catalog-save-inventory-location') { saveInventoryLocation(); return; }
      if (action === 'catalog-finished-inventory-assign') {
        saveFinishedHatInventoryAssignment();
        return;
      }
      if (action === 'catalog-finished-inventory-count') {
        saveFinishedHatInventoryCount(actionTarget);
        return;
      }
      if (action === 'catalog-finished-inventory-adjust') {
        saveFinishedHatInventoryAdjustment(actionTarget);
        return;
      }
      if (action === 'catalog-finished-inventory-correct') {
        saveFinishedHatInventoryCorrection(actionTarget);
        return;
      }
      if (action === 'catalog-finished-inventory-transfer') {
        saveFinishedHatInventoryTransfer();
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
      if (target.dataset?.locationField) state.locationValues[target.dataset.locationField] = String(target.value || '');
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
        selectFinishedHatPhotoFiles(target.files);
        return;
      }
      if (target.name && Object.prototype.hasOwnProperty.call(state.dialogValues, target.name)) {
        state.dialogValues[target.name] = String(target.value || '');
      }
      if (target.dataset?.locationField) state.locationValues[target.dataset.locationField] = String(target.value || '');
      const pickerFilterKey = target.dataset?.pickerFilter;
      if (pickerFilterKey) {
        state.pickerFilters[pickerFilterKey] = String(target.value || '');
        renderDialog();
      }
    }

    function getFinishedHatPhotoDropzone(target) {
      return target?.closest ? target.closest('[data-catalog-finished-hat-photo-dropzone]') : null;
    }

    function getFinishedHatPhotoDropzoneFromEvent(event) {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
      return path.map((node) => getFinishedHatPhotoDropzone(node)).find(Boolean) || getFinishedHatPhotoDropzone(event?.target);
    }

    function setFinishedHatPhotoDragState(active) {
      state.dialogPhotoDragActive = Boolean(active);
      const dropzone = dialogBackdrop?.querySelector('[data-catalog-finished-hat-photo-dropzone]');
      dropzone?.classList?.toggle('staff-finished-hat-photo-dropzone--dragging', state.dialogPhotoDragActive);
    }

    function onFinishedHatPhotoDragEnter(event) {
      if (!getFinishedHatPhotoDropzoneFromEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setFinishedHatPhotoDragState(true);
    }

    function onFinishedHatPhotoDragOver(event) {
      if (!getFinishedHatPhotoDropzoneFromEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }

    function onFinishedHatPhotoDragLeave(event) {
      if (!getFinishedHatPhotoDropzoneFromEvent(event)) return;
      event.stopPropagation();
      setFinishedHatPhotoDragState(false);
    }

    function onFinishedHatPhotoDrop(event) {
      if (!getFinishedHatPhotoDropzoneFromEvent(event)) return;
      setFinishedHatPhotoDragState(false);
      interceptFinishedHatPhotoDrop(event, (files) => selectFinishedHatPhotoFiles(files));
    }

    function selectFinishedHatPhotoFiles(files) {
      const selection = validateFinishedHatPhotoFiles(files);
      if (selection.error) {
        state.dialogFieldErrors = { ...state.dialogFieldErrors, photo: selection.error };
        state.dialogError = selection.error;
        renderDialog();
        return;
      }
      state.dialogPhotoFile = selection.file;
      state.dialogPhotoFileName = String(selection.file.name || '').trim();
      state.dialogFieldErrors = { ...state.dialogFieldErrors };
      delete state.dialogFieldErrors.photo;
      state.dialogError = '';
      renderDialog();
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

    async function refreshFinishedHatInventory(finishedHatId) {
      if (!inventoryApiClient?.getLocationInventory || !finishedHatId) return;
      const result = await inventoryApiClient.getLocationInventory('catalog_finished_hat', finishedHatId);
      state.inventories[finishedHatId] = result?.inventory || null;
      renderContent();
      renderDialog();
    }

    async function saveInventoryLocation() {
      if (!inventoryApiClient?.saveLocation) { state.dialogError = 'Inventory location management is currently unavailable.'; renderDialog(); return; }
      try {
        const input = { ...state.locationValues };
        if (state.locationEditingId) { input.id = state.locationEditingId; input.location_code = state.inventoryLocations.find((location) => location.id === state.locationEditingId)?.location_code || ''; }
        else input.location_code = slugifyInventoryLocationCode(input.location_name);
        const response = await inventoryApiClient.saveLocation(input);
        const location = response?.location;
        if (location) { const index = state.inventoryLocations.findIndex((item) => item.id === location.id); if (index >= 0) state.inventoryLocations.splice(index, 1, location); else state.inventoryLocations.push(location); }
        state.inventoryLocations.sort((a, b) => String(a.location_name).localeCompare(String(b.location_name)));
        state.locationEditingId = ''; state.locationFormOpen = false; state.locationValues = { location_name: '', location_type: 'boutique', status: 'active', notes: '' }; state.dialogError = ''; renderDialog();
      } catch (error) { state.dialogError = safeErrorMessage(error, 'Inventory location could not be saved.'); renderDialog(); }
    }

    function slugifyInventoryLocationCode(name) { const base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 52) || 'location'; return `${base}_${Math.random().toString(36).slice(2, 8)}`; }

    async function saveFinishedHatInventoryAssignment() {
      const select = formNode?.querySelector('[data-finished-inventory-assign]');
      try { await inventoryApiClient.assignLocation({ subject_type: 'catalog_finished_hat', subject_id: state.dialogFinishedHatId, location_id: select?.value || '' }); await refreshFinishedHatInventory(state.dialogFinishedHatId); } catch (error) { state.dialogError = safeErrorMessage(error, 'Inventory location could not be assigned.'); renderDialog(); }
    }

    async function saveFinishedHatInventoryCount(actionTarget) {
      const locationId = actionTarget?.dataset?.locationId || '';
      const inventory = state.inventories[state.dialogFinishedHatId]; const balance = inventory?.balances?.find((item) => item.inventory_location_id === locationId);
      const input = formNode?.querySelector(`[data-finished-inventory-count="${locationId}"]`);
      try { await inventoryApiClient.adjustLocationInventory({ subject_type:'catalog_finished_hat', subject_id:state.dialogFinishedHatId, location_id:locationId, expected_quantity:null, expected_version:balance?.version ?? 0, target_quantity:input?.value ?? '', reason_code:'initial_count', note:'' }); await refreshFinishedHatInventory(state.dialogFinishedHatId); } catch (error) { state.dialogError=safeErrorMessage(error,'Physical count could not be saved.'); renderDialog(); }
    }

    async function saveFinishedHatInventoryAdjustment(actionTarget) {
      const locationId=actionTarget?.dataset?.locationId||''; const reason=actionTarget?.dataset?.reason||'correction'; const inventory=state.inventories[state.dialogFinishedHatId]; const balance=inventory?.balances?.find((item)=>item.inventory_location_id===locationId); if(!balance) return;
      const direction = reason === 'sold' ? -1 : 1; const target=balance.on_hand_quantity + direction;
      if (target < 0) { state.dialogError = 'Inventory cannot go below zero.'; renderDialog(); return; }
      try { await inventoryApiClient.adjustLocationInventory({subject_type:'catalog_finished_hat',subject_id:state.dialogFinishedHatId,location_id:locationId,expected_quantity:balance.on_hand_quantity,expected_version:balance.version,target_quantity:target,reason_code:reason,note:''}); await refreshFinishedHatInventory(state.dialogFinishedHatId); } catch(error) { state.dialogError=safeErrorMessage(error,'Inventory could not be updated.'); renderDialog(); }
    }

    async function saveFinishedHatInventoryCorrection(actionTarget) {
      const locationId=actionTarget?.dataset?.locationId||''; const inventory=state.inventories[state.dialogFinishedHatId]; const balance=inventory?.balances?.find((item)=>item.inventory_location_id===locationId); const input=formNode?.querySelector(`[data-finished-inventory-correction="${locationId}"]`);
      if (!balance) return;
      try { await inventoryApiClient.adjustLocationInventory({subject_type:'catalog_finished_hat',subject_id:state.dialogFinishedHatId,location_id:locationId,expected_quantity:balance.on_hand_quantity,expected_version:balance.version,target_quantity:input?.value ?? '',reason_code:'correction',note:''}); await refreshFinishedHatInventory(state.dialogFinishedHatId); } catch(error) { state.dialogError=safeErrorMessage(error,'Verified quantity could not be saved.'); renderDialog(); }
    }

    async function saveFinishedHatInventoryTransfer() {
      const sourceId=formNode?.querySelector('[data-finished-inventory-transfer-source]')?.value || ''; const destinationId=formNode?.querySelector('[data-finished-inventory-transfer-destination]')?.value || ''; const quantity=formNode?.querySelector('[data-finished-inventory-transfer-quantity]')?.value || ''; const inventory=state.inventories[state.dialogFinishedHatId]; const source=inventory?.balances?.find((b)=>b.inventory_location_id===sourceId);const destination=inventory?.balances?.find((b)=>b.inventory_location_id===destinationId);
      try { await inventoryApiClient.transferInventory({subject_type:'catalog_finished_hat',subject_id:state.dialogFinishedHatId,source_location_id:sourceId,destination_location_id:destinationId,expected_source_quantity:source?.on_hand_quantity,expected_source_version:source?.version,expected_destination_quantity:destination?.on_hand_quantity,expected_destination_version:destination?.version,quantity,note:''}); await refreshFinishedHatInventory(state.dialogFinishedHatId); } catch(error) { state.dialogError=safeErrorMessage(error,'Inventory could not be transferred.');renderDialog(); }
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
        ? `<img class="staff-finished-hat-picker-image staff-finished-hat-picker-image--design" src="${escapeAttribute(design.thumbnail_path)}" alt="${escapeAttribute((primaryLabel || 'Design') + ' thumbnail')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
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
        ? `<img class="finished-hat-hat-picker-image" src="${escapeAttribute(hat.photo_path)}" alt="${escapeAttribute((hatName || 'Hat') + ' photo')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
        : `<span class="finished-hat-hat-picker-image-placeholder">No Photo</span>`,
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

  function renderFinishedHatHatPickerCard(option, selected) {
    const manufacturerModel = [option?.manufacturer, option?.model].filter(Boolean).join(' / ') || option?.hat_name || 'Hat details unavailable';
    const color = option?.color || 'Color not specified';
    return `
      <div
        class="staff-catalog-card-shell finished-hat-hat-picker-option ${selected ? 'finished-hat-hat-picker-option--selected' : ''}"
        role="option"
        tabindex="0"
        data-action="catalog-picker-select-card"
        data-link-type="hat"
        data-picker-option-id="${escapeAttribute(option?.id)}"
        aria-selected="${selected ? 'true' : 'false'}"
        aria-label="${escapeAttribute(option?.ariaLabel)}"
        title="${escapeAttribute(option?.titleText || option?.ariaLabel)}"
      >
        <div class="staff-design-card finished-hat-hat-picker-card">
          <div class="staff-design-card-thumb finished-hat-hat-picker-media">${option?.thumbnailHtml || '<span class="staff-design-card-thumb-placeholder">No Photo</span>'}</div>
          <div class="staff-design-card-body finished-hat-hat-picker-meta">
            <strong>${escapeHtml(manufacturerModel)}</strong>
            <span>${escapeHtml(color)}</span>
          </div>
        </div>
      </div>
    `;
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
        ? `<img class="staff-finished-hat-picker-image staff-finished-hat-picker-image--material staff-finished-hat-picker-image--material-${escapeAttribute(fitMode)}" src="${escapeAttribute(material.swatch_path)}" alt="${escapeAttribute((materialName || 'Material') + ' swatch')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
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
        html: `<img class="staff-finished-hat-card-thumb-image" src="${escapeAttribute(normalized.photo_path)}" alt="${escapeAttribute((normalized.finished_hat_name || 'Finished hat') + ' photo')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
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
        html: `<img src="${escapeAttribute(objectUrl)}" alt="${escapeAttribute((finishedHatName || 'Finished hat') + ' preview')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
      };
    }
    if (photoPath) {
      return {
        html: `<img src="${escapeAttribute(photoPath)}" alt="${escapeAttribute((finishedHatName || 'Finished hat') + ' preview')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
      };
    }
    return {
      html: `<span class="staff-design-thumbnail-preview-placeholder">${escapeHtml(MISSING_PHOTO_COPY)}</span>`
    };
  }

  function validateFinishedHatPhotoFiles(files) {
    const photoFiles = files ? Array.from(files) : [];
    if (photoFiles.length !== 1) {
      return { file: null, error: photoFiles.length > 1 ? 'Choose only one finished hat photo.' : 'Choose a PNG, JPEG, or WebP finished hat photo to upload.' };
    }
    const file = photoFiles[0];
    if (!FINISHED_HAT_PHOTO_MIME_TYPES.includes(String(file?.type || '').toLowerCase())) {
      return { file: null, error: 'Only PNG, JPEG, and WebP finished hat photos are allowed.' };
    }
    if (!Number.isFinite(Number(file?.size)) || Number(file.size) <= 0 || Number(file.size) > FINISHED_HAT_PHOTO_MAX_BYTES) {
      return { file: null, error: 'Finished hat photo files must be 5 MB or smaller.' };
    }
    return { file, error: '' };
  }

  function interceptFinishedHatPhotoDrop(event, onFiles) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (typeof onFiles === 'function') onFiles(event?.dataTransfer?.files);
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
    FINISHED_HAT_PHOTO_MAX_BYTES,
    FINISHED_HAT_PHOTO_MIME_TYPES,
    SORT_OPTIONS,
    createStaffFinishedHatCatalogModule,
    filterFinishedHatRecords,
    normalizeFinishedHatRecord,
    getFinishedHatPhotoDisplay,
    validateFinishedHatPhotoFiles,
    interceptFinishedHatPhotoDrop,
    normalizeHatOption,
    renderFinishedHatHatPickerCard,
    getFinishedHatCompactSummary,
    getFinishedHatMissingLinksSummary,
    formatFinishedHatHatSummary,
    formatFinishedHatMaterialSummary,
    getPlacementStatusLabel,
    getMaterialSwatchFitMode,
    sortFinishedHatRecords
  };
}));
