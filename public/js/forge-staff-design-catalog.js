(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeStaffDesignCatalog = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CATEGORY_LABELS = {
    boutique_womens: "Boutique Women's",
    texas_local_pride: 'Texas / Local Pride',
    hunting_outdoors: 'Hunting / Outdoors',
    patriotic_military: 'Patriotic / Military',
    western_rodeo: 'Western / Rodeo',
    america_250: 'America 250',
    business_corporate: 'Business / Corporate',
    sports: 'Sports',
    seasonal: 'Seasonal',
    other: 'Other'
  };
  const STORE_FIT_LABELS = {
    boutique: 'Boutique',
    feed_western: 'Feed / Western',
    gift_shop: 'Gift Shop',
    military: 'Military',
    outdoor: 'Outdoor',
    business_corporate: 'Business / Corporate',
    multiple: 'Multiple',
    undecided: 'Undecided'
  };
  const STATUS_LABELS = {
    review: 'In Review',
    idea: 'Idea',
    approved: 'Approved',
    active: 'Active',
    seasonal: 'Seasonal',
    retired: 'Retired'
  };
  const PRODUCTION_METHOD_LABELS = {
    leatherette_engraving: 'Leatherette Engraving',
    uv_print: 'UV Print',
    acrylic: 'Acrylic',
    other: 'Other',
    tbd: 'TBD'
  };
  const MADE_ON_HAT_LABELS = {
    yes: 'Yes',
    no: 'No',
    unknown: 'Unknown'
  };
  const DEFAULT_FORM_VALUES = {
    design_name: '',
    category: 'other',
    store_fit: 'undecided',
    status: 'review',
    production_method: 'tbd',
    production_file_location: '',
    made_on_hat: 'unknown',
    notes: ''
  };
  const MISSING_THUMBNAIL_COPY = 'No thumbnail yet';
  const PINTEREST_NOPIN_IMAGE_ATTRIBUTES = ' nopin="nopin" data-pin-nopin="true"';
  const SORT_OPTIONS = [
    { value: 'custom', label: 'Custom Order' },
    { value: 'az', label: 'A–Z' },
    { value: 'recent', label: 'Recently Added' },
    { value: 'status', label: 'Status' },
    { value: 'category', label: 'Category' },
    { value: 'production_method', label: 'Production Method' }
  ];

  function createDesignCreateIdempotencyKey(windowLike) {
    const cryptoLike = windowLike?.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
      return cryptoLike.randomUUID();
    }

    if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
      const values = cryptoLike.getRandomValues(new Uint8Array(16));
      values[6] = (values[6] & 0x0f) | 0x40;
      values[8] = (values[8] & 0x3f) | 0x80;
      const hex = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    throw new Error('Secure request identifiers are unavailable.');
  }

  function createStaffDesignCatalogModule(options = {}) {
    const apiClient = options.apiClient || null;
    const documentRef = options.document || document;
    const windowLike = options.window || window;
    const createIdempotencyKey = typeof options.createIdempotencyKey === 'function'
      ? options.createIdempotencyKey
      : () => createDesignCreateIdempotencyKey(windowLike);
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
      saving: false,
      dialogSaving: false,
      records: [],
      filters: {
        search: '',
        category: '',
        productionMethod: '',
        status: ''
      },
      dialogOpen: false,
      dialogMode: 'create',
      dialogError: '',
      dialogFieldErrors: {},
      dialogValues: { ...DEFAULT_FORM_VALUES },
      dialogDesignId: '',
      dialogCreateIdempotencyKey: '',
      dialogThumbnailPath: '',
      dialogThumbnailFile: null,
      dialogThumbnailFileName: '',
      dialogFinishedHatLinkCount: 0,
      dialogDeleteConfirmOpen: false,
      dialogDeleting: false,
      dialogDeleteError: '',
      sortKey: 'custom',
      notice: '',
      noticeTone: 'muted',
      announcement: '',
      pendingFocusDesignId: ''
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
        return saveDesignOrder(orderedIds);
      },
      getLabel(itemId) {
        const record = state.records.find((entry) => entry.id === itemId);
        return record?.design_name || 'catalog record';
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
        loadDesigns();
      }
    }

    async function loadDesigns() {
      if (!apiClient || typeof apiClient.listDesigns !== 'function') {
        state.error = 'Design catalog is currently unavailable.';
        state.loading = false;
        renderContent();
        return;
      }

      state.loading = true;
      state.error = '';
      state.requiresAuthentication = false;
      renderContent();

      try {
        const result = await apiClient.listDesigns();
        if (!result || result.authenticated === false || result.unauthenticated) {
          state.loading = false;
          state.loaded = false;
          state.requiresAuthentication = true;
          state.error = 'Staff authentication is required.';
          renderContent();
          return;
        }

        state.records = Array.isArray(result.designs)
          ? sortRecordsForCustomOrder(result.designs.map(normalizeDesignRecord))
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
        state.error = safeErrorMessage(error, 'Design catalog could not be loaded right now.');
        renderContent();
      }
    }

    function renderContent(options = {}) {
      if (!container) {
        return;
      }

      const focusState = options.preserveFocus ? captureCatalogFocus() : null;
      const filteredRecords = filterDesignRecords(state.records, state.filters);
      const reorderAvailability = getReorderAvailability();
      const sortedRecords = sortDesignRecords(filteredRecords, state.sortKey);
      const hasActiveFilters = Boolean(
        state.filters.search || state.filters.category || state.filters.productionMethod || state.filters.status
      );
      const sectionBody = renderDesignsBody(sortedRecords, hasActiveFilters, reorderAvailability);

      container.innerHTML = `
        <section class="staff-catalog-designs" role="tabpanel" aria-labelledby="staff-catalog-tab-designs">
          <div class="staff-catalog-designs-toolbar">
            <div class="staff-catalog-designs-heading">
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3>Designs</h3>
              <p>Search and manage the shared Hilltop design library without affecting customer ordering.</p>
            </div>
            <div class="staff-catalog-designs-actions">
              <p class="staff-catalog-designs-count" data-catalog-results-count>${filteredRecords.length} result${filteredRecords.length === 1 ? '' : 's'}</p>
              <button class="primary-button" type="button" data-action="catalog-add-design">Add Design</button>
            </div>
          </div>
          <div class="staff-catalog-designs-filters">
            <label class="staff-catalog-designs-filter staff-catalog-designs-filter--search">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.filters.search)}" placeholder="Search design name" data-action="catalog-search">
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Category</span>
              <select data-action="catalog-filter-category">${renderSelectOptions(CATEGORY_LABELS, state.filters.category, 'All Categories')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Production Method</span>
              <select data-action="catalog-filter-production-method">${renderSelectOptions(PRODUCTION_METHOD_LABELS, state.filters.productionMethod, 'All Methods')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Status</span>
              <select data-action="catalog-filter-status">${renderSelectOptions(STATUS_LABELS, state.filters.status, 'All Statuses')}</select>
            </label>
            <label class="staff-catalog-designs-filter">
              <span>Sort</span>
              <select data-action="catalog-sort-designs">${renderStaticOptions(SORT_OPTIONS, state.sortKey)}</select>
            </label>
            <div class="staff-catalog-designs-filter-clear">
              <button class="secondary-button" type="button" data-action="catalog-clear-filters">Clear Filters</button>
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
      focusPendingDesignCard();
    }

    function captureCatalogFocus() {
      const activeElement = documentRef?.activeElement;
      if (!activeElement || !container || !isElementInsideContainer(activeElement)) {
        return null;
      }

      const action = activeElement.dataset?.action || '';
      if (![
        'catalog-search',
        'catalog-filter-category',
        'catalog-filter-production-method',
        'catalog-filter-status',
        'catalog-sort-designs'
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

    function renderDesignsBody(filteredRecords, hasActiveFilters, reorderAvailability) {
      if (state.loading) {
        return '<div class="staff-catalog-designs-state"><p>Loading shared design records...</p></div>';
      }

      if (state.error) {
        return `
          <div class="staff-catalog-designs-state staff-catalog-designs-state--error">
            <p>${escapeHtml(state.error)}</p>
            <button class="secondary-button" type="button" data-action="catalog-retry-load">Retry</button>
          </div>
        `;
      }

      if (state.records.length === 0) {
        return `
          <div class="staff-catalog-designs-state">
            <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
            <h4>No designs yet</h4>
            <p>Add the first shared design record to start building the catalog.</p>
          </div>
        `;
      }

      if (filteredRecords.length === 0) {
        return `
          <div class="staff-catalog-designs-state">
            <h4>No designs match these filters</h4>
            <p>${hasActiveFilters ? 'Adjust the search or clear filters to see more shared designs.' : 'No shared designs are available yet.'}</p>
          </div>
        `;
      }

      return `
        <div class="staff-design-card-grid">
          ${filteredRecords.map((record) => renderDesignCard(record, reorderAvailability.enabled)).join('')}
        </div>
      `;
    }

    function renderDesignCard(record, reorderEnabled) {
      const thumbnail = getDesignThumbnailDisplay(record);
      return `
        <div class="staff-catalog-card-shell${reorderController?.isDraggingId(record.id) ? ' staff-catalog-card-shell--dragging' : ''}" data-catalog-order-id="${escapeAttribute(record.id)}">
          ${reorderEnabled ? `
            <button
              class="staff-catalog-reorder-handle"
              type="button"
              data-action="catalog-design-reorder-handle"
              data-design-id="${escapeAttribute(record.id)}"
              aria-label="Reorder ${escapeAttribute(record.design_name)}"
            >
              <span aria-hidden="true">::</span>
            </button>
          ` : ''}
          <button
            class="staff-design-card"
            type="button"
            data-action="catalog-edit-design"
            data-design-id="${escapeAttribute(record.id)}"
            aria-label="Edit ${escapeAttribute(record.design_name)}"
          >
            <div
              class="staff-design-card-thumb ${thumbnail.type === 'image' ? 'staff-catalog-image-trigger' : ''}"
              ${thumbnail.type === 'image' ? `data-action="catalog-open-image-viewer" data-design-id="${escapeAttribute(record.id)}" title="Open ${escapeAttribute(record.design_name)} image viewer"` : ''}
            >
              ${thumbnail.html}
            </div>
            <div class="staff-design-card-body">
              <div class="staff-design-card-action-row">
                <span class="staff-design-status-badge staff-design-status-badge--${escapeAttribute(record.status || 'review')}">${escapeHtml(getStatusLabel(record.status))}</span>
              </div>
              <h4 class="staff-design-card-title">${escapeHtml(record.design_name)}</h4>
              <dl class="staff-design-card-meta">
                <div>
                  <dt>Category</dt>
                  <dd>${escapeHtml(getCategoryLabel(record.category))}</dd>
                </div>
                <div>
                  <dt>Production</dt>
                  <dd>${escapeHtml(getProductionMethodLabel(record.production_method))}</dd>
                </div>
              </dl>
            </div>
          </button>
        </div>
      `;
    }

    function bindContainerEvents() {
      if (!container || container.dataset.catalogBound === 'true') {
        return;
      }

      container.dataset.catalogBound = 'true';
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

      if (action === 'catalog-design-reorder-handle') {
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
        openImageViewer(event.target.closest('[data-design-id]')?.dataset.designId || '', event.target.closest('[data-action]'));
        return;
      }

      if (action === 'catalog-retry-load') {
        loadDesigns();
        return;
      }

      if (action === 'catalog-clear-filters') {
        state.filters = {
          search: '',
          category: '',
          productionMethod: '',
          status: ''
        };
        state.notice = '';
        renderContent();
        return;
      }

      if (action === 'catalog-add-design') {
        openDialog('create', null, event.target);
        return;
      }

      if (action === 'catalog-edit-design') {
        const designId = event.target.closest('[data-design-id]')?.dataset.designId || '';
        const record = state.records.find((item) => item.id === designId) || null;
        if (!record) {
          return;
        }
        openDialog('edit', record, event.target);
      }
    }

    function onContainerInput(event) {
      const action = event.target?.dataset?.action;
      if (action === 'catalog-search') {
        state.filters.search = String(event.target.value || '');
        renderContent({ preserveFocus: true });
      }
    }

    function onContainerChange(event) {
      const action = event.target?.dataset?.action;
      if (action === 'catalog-sort-designs') {
        state.sortKey = String(event.target.value || 'custom').trim() || 'custom';
        state.notice = '';
        renderContent();
        return;
      }
      if (action === 'catalog-filter-category') {
        state.filters.category = String(event.target.value || '').trim();
        renderContent();
        return;
      }

      if (action === 'catalog-filter-production-method') {
        state.filters.productionMethod = String(event.target.value || '').trim();
        renderContent();
        return;
      }

      if (action === 'catalog-filter-status') {
        state.filters.status = String(event.target.value || '').trim();
        renderContent();
      }
    }

    function onContainerPointerDown(event) {
      const handle = event.target.closest('[data-action="catalog-design-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortDesignRecords(filterDesignRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      const designId = String(handle.dataset.designId || '').trim();
      if (!designId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      reorderController.beginPointer(event, designId, orderedIds);
    }

    function onContainerKeydown(event) {
      const handle = event.target.closest('[data-action="catalog-design-reorder-handle"]');
      if (!handle || !reorderController || !getReorderAvailability().enabled) {
        return;
      }

      const orderedIds = sortDesignRecords(filterDesignRecords(state.records, state.filters), state.sortKey).map((record) => record.id);
      reorderController.handleHandleKeydown(event, String(handle.dataset.designId || ''), orderedIds);
    }

    function ensureDialogUi() {
      if (dialogBackdrop && dialogNode && formNode && statusNode) {
        return;
      }

      dialogBackdrop = documentRef.createElement('div');
      dialogBackdrop.className = 'staff-design-dialog-backdrop';
      dialogBackdrop.hidden = true;
      dialogBackdrop.innerHTML = `
        <div class="staff-design-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-design-dialog-title" tabindex="-1">
          <div class="staff-design-dialog-header">
            <div>
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3 id="staff-design-dialog-title">Add Design</h3>
            </div>
            <div class="staff-catalog-dialog-header-actions staff-design-dialog-header-actions">
              <button class="primary-button" type="submit" form="staff-design-dialog-form" data-action="catalog-save-design">Save Design</button>
              <button class="secondary-button staff-design-dialog-close" type="button" data-action="catalog-close-dialog">Cancel</button>
            </div>
          </div>
          <form class="staff-design-dialog-form" id="staff-design-dialog-form" novalidate>
            <div class="staff-design-dialog-grid">
              <label class="staff-design-dialog-field">
                <span>Design Name</span>
                <input id="catalog-design-name" name="design_name" type="text" maxlength="160" required>
              </label>
              <label class="staff-design-dialog-field">
                <span>Category</span>
                <select id="catalog-category" name="category">${renderSelectOptions(CATEGORY_LABELS, '', '')}</select>
              </label>
              <label class="staff-design-dialog-field">
                <span>Store Fit</span>
                <select id="catalog-store-fit" name="store_fit">${renderSelectOptions(STORE_FIT_LABELS, '', '')}</select>
              </label>
              <label class="staff-design-dialog-field">
                <span>Status</span>
                <select id="catalog-status" name="status">${renderSelectOptions(STATUS_LABELS, '', '')}</select>
              </label>
              <label class="staff-design-dialog-field">
                <span>Production Method</span>
                <select id="catalog-production-method" name="production_method">${renderSelectOptions(PRODUCTION_METHOD_LABELS, '', '')}</select>
              </label>
              <label class="staff-design-dialog-field">
                <span>Made on Hat</span>
                <select id="catalog-made-on-hat" name="made_on_hat">${renderSelectOptions(MADE_ON_HAT_LABELS, '', '')}</select>
              </label>
              <label class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Production File Location</span>
                <input id="catalog-production-file-location" name="production_file_location" type="text" maxlength="512">
              </label>
              <div class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Thumbnail Image</span>
                <div class="staff-design-thumbnail-panel">
                  <div class="staff-design-thumbnail-preview" data-catalog-thumbnail-preview></div>
                  <label class="secondary-button staff-design-thumbnail-input">
                    <input id="catalog-thumbnail" name="thumbnail" type="file" accept="image/png,image/jpeg,image/webp">
                    Choose Thumbnail
                  </label>
                  <p class="staff-design-thumbnail-copy" data-catalog-thumbnail-copy>No thumbnail selected</p>
                </div>
              </div>
              <label class="staff-design-dialog-field staff-design-dialog-field--wide">
                <span>Notes</span>
                <textarea id="catalog-notes" name="notes" rows="5" maxlength="4000"></textarea>
              </label>
            </div>
            <p class="staff-orders-status staff-design-dialog-status" data-catalog-dialog-status aria-live="polite"></p>
            <div class="staff-design-dialog-danger-zone" data-catalog-design-danger-zone></div>
          </form>
        </div>
      `;

      documentRef.body.appendChild(dialogBackdrop);
      dialogNode = dialogBackdrop.querySelector('.staff-design-dialog');
      formNode = dialogBackdrop.querySelector('.staff-design-dialog-form');
      statusNode = dialogBackdrop.querySelector('[data-catalog-dialog-status]');

      dialogBackdrop.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (event.target === dialogBackdrop || action === 'catalog-close-dialog') {
          closeDialog();
          return;
        }
        if (action === 'catalog-request-delete-design') {
          if (state.dialogSaving || state.dialogDeleting) {
            return;
          }
          state.dialogDeleteConfirmOpen = true;
          state.dialogDeleteError = '';
          renderDialog();
          return;
        }
        if (action === 'catalog-cancel-delete-design') {
          state.dialogDeleteConfirmOpen = false;
          state.dialogDeleteError = '';
          renderDialog();
          return;
        }
        if (action === 'catalog-confirm-delete-design') {
          deleteCurrentDesign();
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
      state.dialogDesignId = record?.id || '';
      state.dialogCreateIdempotencyKey = mode === 'create' ? createIdempotencyKey() : '';
      state.dialogValues = record ? {
        design_name: record.design_name || '',
        category: record.category || DEFAULT_FORM_VALUES.category,
        store_fit: record.store_fit || DEFAULT_FORM_VALUES.store_fit,
        status: record.status || DEFAULT_FORM_VALUES.status,
        production_method: record.production_method || DEFAULT_FORM_VALUES.production_method,
        production_file_location: record.production_file_location || '',
        made_on_hat: record.made_on_hat || DEFAULT_FORM_VALUES.made_on_hat,
        notes: record.notes || ''
      } : { ...DEFAULT_FORM_VALUES };
      state.dialogThumbnailPath = record?.thumbnail_path || '';
      state.dialogThumbnailFile = null;
      state.dialogThumbnailFileName = '';
      state.dialogFinishedHatLinkCount = normalizeNonnegativeInteger(record?.finished_hat_link_count);
      state.dialogDeleteConfirmOpen = false;
      state.dialogDeleting = false;
      state.dialogDeleteError = '';
      renderDialog();
      dialogBackdrop.hidden = false;
      dialogNode.focus();
      windowLike.setTimeout(() => {
        dialogBackdrop.querySelector('[name="design_name"]')?.focus();
      }, 0);
    }

    function closeDialog() {
      if (!dialogBackdrop) {
        return;
      }
      state.dialogOpen = false;
      state.dialogSaving = false;
      state.dialogDeleting = false;
      state.dialogDeleteConfirmOpen = false;
      state.dialogCreateIdempotencyKey = '';
      dialogBackdrop.hidden = true;
      if (lastFocusTarget instanceof HTMLElement) {
        lastFocusTarget.focus();
      }
    }

    function renderDialog() {
      if (!dialogBackdrop || !dialogNode || !formNode || !statusNode) {
        return;
      }

      dialogNode.querySelector('#staff-design-dialog-title').textContent = state.dialogMode === 'edit'
        ? 'Edit Design'
        : 'Add Design';

      const values = state.dialogValues;
      setFormValue('design_name', values.design_name);
      setFormValue('category', values.category);
      setFormValue('store_fit', values.store_fit);
      setFormValue('status', values.status);
      setFormValue('production_method', values.production_method);
      setFormValue('production_file_location', values.production_file_location);
      setFormValue('made_on_hat', values.made_on_hat);
      setFormValue('notes', values.notes);

      formNode.setAttribute('aria-busy', state.dialogSaving ? 'true' : 'false');
      dialogBackdrop.querySelectorAll('input, select, textarea, button').forEach((node) => {
        if (node.dataset.action === 'catalog-close-dialog') {
          node.disabled = state.dialogDeleting;
          return;
        }
        node.disabled = state.dialogSaving || state.dialogDeleting;
      });

      const saveButton = dialogBackdrop.querySelector('[data-action="catalog-save-design"]');
      if (saveButton) {
        saveButton.textContent = state.dialogSaving ? 'Saving...' : 'Save Design';
      }

      renderThumbnailPanel();
      renderDialogStatus();
      renderDeletePanel();
      applyDialogFieldErrors();
    }

    function renderDeletePanel() {
      const dangerZone = dialogBackdrop.querySelector('[data-catalog-design-danger-zone]');
      if (!dangerZone) {
        return;
      }

      if (state.dialogMode !== 'edit') {
        dangerZone.innerHTML = '';
        return;
      }

      const designName = state.dialogValues.design_name || 'this Design';
      if (state.dialogFinishedHatLinkCount > 0) {
        dangerZone.innerHTML = `
          <div class="staff-design-dialog-linked-delete-message" role="status">
            <strong>Delete unavailable</strong>
            <p>This Design is linked to ${state.dialogFinishedHatLinkCount} Finished Hat${state.dialogFinishedHatLinkCount === 1 ? '' : 's'}. Clear those Finished Hat links before deleting it.</p>
          </div>
        `;
        return;
      }

      if (state.dialogDeleteConfirmOpen) {
        dangerZone.innerHTML = `
          <div class="staff-design-dialog-delete-confirmation" role="alertdialog" aria-label="Confirm Design deletion">
            <div>
              <strong>Delete ${escapeHtml(designName)}?</strong>
              <p>This cannot be undone. The Design record will be removed from the shared library.</p>
              ${state.dialogDeleteError ? `<p class="staff-design-dialog-delete-error">${escapeHtml(state.dialogDeleteError)}</p>` : ''}
            </div>
            <div class="staff-design-dialog-delete-actions">
              <button class="secondary-button staff-design-delete-action" type="button" data-action="catalog-confirm-delete-design"${state.dialogDeleting ? ' disabled' : ''}>${state.dialogDeleting ? 'Deleting...' : 'Delete Design'}</button>
              <button class="ghost-button" type="button" data-action="catalog-cancel-delete-design"${state.dialogDeleting ? ' disabled' : ''}>Keep Design</button>
            </div>
          </div>
        `;
        return;
      }

      dangerZone.innerHTML = `
        <button class="ghost-button staff-design-delete-trigger" type="button" data-action="catalog-request-delete-design"${state.dialogSaving || state.dialogDeleting ? ' disabled' : ''}>Delete Design</button>
        ${state.dialogDeleteError ? `<p class="staff-design-dialog-delete-error">${escapeHtml(state.dialogDeleteError)}</p>` : ''}
      `;
    }

    function renderThumbnailPanel() {
      const previewNode = dialogBackdrop.querySelector('[data-catalog-thumbnail-preview]');
      const copyNode = dialogBackdrop.querySelector('[data-catalog-thumbnail-copy]');
      if (!previewNode || !copyNode) {
        return;
      }

      if (state.dialogThumbnailPath) {
        previewNode.innerHTML = `<img src="${escapeAttribute(state.dialogThumbnailPath)}" alt="Current design thumbnail"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`;
      } else {
        previewNode.innerHTML = `<div class="staff-design-thumbnail-preview-placeholder">${escapeHtml(MISSING_THUMBNAIL_COPY)}</div>`;
      }

      copyNode.textContent = state.dialogThumbnailFileName
        ? `Selected: ${state.dialogThumbnailFileName}`
        : (state.dialogThumbnailPath ? 'Current thumbnail will remain until replaced.' : 'No thumbnail selected');
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
      if (target.name !== 'thumbnail') {
        return;
      }

      const file = target.files && target.files[0] ? target.files[0] : null;
      state.dialogThumbnailFile = file;
      state.dialogThumbnailFileName = file ? String(file.name || '').trim() : '';
      state.dialogFieldErrors = {
        ...state.dialogFieldErrors
      };
      delete state.dialogFieldErrors.thumbnail;
      renderDialog();
    }

    function onDialogKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (state.dialogDeleteConfirmOpen) {
          state.dialogDeleteConfirmOpen = false;
          state.dialogDeleteError = '';
          renderDialog();
          return;
        }
        closeDialog();
      }
    }

    async function onDialogSubmit(event) {
      event.preventDefault();
      if (state.dialogSaving) {
        return;
      }
      if (!apiClient) {
        state.dialogError = 'Design catalog is currently unavailable.';
        renderDialog();
        return;
      }

      const formData = new FormData(formNode);
      const payload = {
        design_name: String(formData.get('design_name') || ''),
        category: String(formData.get('category') || ''),
        store_fit: String(formData.get('store_fit') || ''),
        status: String(formData.get('status') || ''),
        production_method: String(formData.get('production_method') || ''),
        production_file_location: String(formData.get('production_file_location') || ''),
        made_on_hat: String(formData.get('made_on_hat') || ''),
        notes: String(formData.get('notes') || '')
      };

      state.dialogFieldErrors = validateDesignDialogPayload(payload);
      state.dialogValues = payload;
      state.dialogError = '';
      if (Object.keys(state.dialogFieldErrors).length > 0) {
        renderDialog();
        return;
      }

      state.dialogSaving = true;
      renderDialog();

      try {
        const saveResult = state.dialogMode === 'edit'
          ? await apiClient.updateDesign(state.dialogDesignId, payload)
          : await apiClient.createDesign(payload, state.dialogCreateIdempotencyKey);
        let design = normalizeDesignRecord(saveResult.design);

        if (state.dialogThumbnailFile) {
          const uploadResult = await apiClient.uploadThumbnail(design.id, state.dialogThumbnailFile);
          design = normalizeDesignRecord(uploadResult.design);
        }

        const wasCreate = state.dialogMode === 'create';
        upsertDesignRecord(design);
        state.dialogSaving = false;
        if (wasCreate) {
          state.notice = 'Design added successfully.';
          state.noticeTone = 'success';
          state.pendingFocusDesignId = design.id;
        }
        closeDialog();
        renderContent();
      } catch (error) {
        state.dialogSaving = false;
        state.dialogError = safeErrorMessage(error, 'Design could not be saved right now.');
        state.dialogFieldErrors = error?.fields && typeof error.fields === 'object' ? error.fields : {};
        renderDialog();
      }
    }

    async function deleteCurrentDesign() {
      if (state.dialogDeleting || state.dialogSaving) {
        return;
      }
      if (!apiClient || typeof apiClient.deleteDesign !== 'function') {
        state.dialogDeleteError = 'Design catalog is currently unavailable.';
        renderDialog();
        return;
      }
      if (state.dialogFinishedHatLinkCount > 0) {
        state.dialogDeleteError = 'Clear Finished Hat links before deleting this Design.';
        renderDialog();
        return;
      }

      state.dialogDeleting = true;
      state.dialogDeleteError = '';
      renderDialog();

      try {
        await apiClient.deleteDesign(state.dialogDesignId);
        const deletedId = state.dialogDesignId;
        state.records = state.records.filter((record) => record.id !== deletedId);
        reorderController?.sync(state.records.map((record) => record.id));
        state.dialogDeleting = false;
        state.notice = 'Design deleted successfully.';
        state.noticeTone = 'success';
        closeDialog();
        renderContent();
      } catch (error) {
        state.dialogDeleting = false;
        state.dialogDeleteError = safeErrorMessage(error, 'Design could not be deleted right now.');
        if (error?.code === 'design_delete_blocked') {
          state.dialogFinishedHatLinkCount = Math.max(1, state.dialogFinishedHatLinkCount);
        }
        renderDialog();
      }
    }

    function upsertDesignRecord(design) {
      const normalized = normalizeDesignRecord(design);
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

    function focusPendingDesignCard() {
      if (!state.pendingFocusDesignId || !container || typeof container.querySelector !== 'function') {
        return;
      }

      const pendingId = state.pendingFocusDesignId;
      state.pendingFocusDesignId = '';
      const card = container.querySelector(`[data-design-id="${escapeAttribute(pendingId)}"][data-action="catalog-edit-design"]`);
      if (!card) {
        return;
      }
      if (typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      if (typeof card.focus === 'function') {
        card.focus({ preventScroll: true });
      }
    }

    function getReorderAvailability() {
      return orderingApi?.getReorderAvailability(state.sortKey, state.filters) || { enabled: false, reason: '' };
    }

    async function saveDesignOrder(orderedIds) {
      if (!apiClient || typeof apiClient.reorderDesigns !== 'function') {
        state.notice = 'Design ordering is currently unavailable.';
        state.noticeTone = 'error';
        renderContent();
        return false;
      }

      try {
        const result = await apiClient.reorderDesigns(orderedIds);
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
          state.notice = 'The design order changed elsewhere. Reloaded the latest order.';
          state.noticeTone = 'error';
          await loadDesigns();
          return false;
        }
        state.notice = safeErrorMessage(error, 'Design order could not be saved right now.');
        state.noticeTone = 'error';
        renderContent();
        return false;
      }
    }

    function openImageViewer(designId, opener) {
      const record = state.records.find((item) => item.id === designId) || null;
      if (!record || !record.thumbnail_path || !imageViewer || typeof imageViewer.open !== 'function') {
        return;
      }
      imageViewer.open({
        items: getVisibleImageViewerItems(),
        selectedId: designId,
        opener
      });
    }

    function getVisibleImageViewerItems() {
      return sortDesignRecords(filterDesignRecords(state.records, state.filters), state.sortKey)
        .filter((record) => record.thumbnail_path)
        .map((record) => ({
          id: record.id,
          typeLabel: 'Design',
          name: record.design_name,
          metadata: [
            getCategoryLabel(record.category),
            getProductionMethodLabel(record.production_method),
            getStatusLabel(record.status)
          ].filter(Boolean).join(' | '),
          src: record.thumbnail_path,
          alt: `${record.design_name || 'Design'} artwork`
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
      reload: loadDesigns
    };
  }

  function validateDesignDialogPayload(payload) {
    const errors = {};
    if (!String(payload.design_name || '').trim()) {
      errors.design_name = 'Design name is required.';
    }
    return errors;
  }

  function filterDesignRecords(records, filters = {}) {
    const normalizedRecords = Array.isArray(records) ? records.map(normalizeDesignRecord) : [];
    const search = String(filters.search || '').trim().toLowerCase();
    const category = String(filters.category || '').trim();
    const productionMethod = String(filters.productionMethod || '').trim();
    const status = String(filters.status || '').trim();

    return normalizedRecords.filter((record) => {
      if (search && !record.design_name.toLowerCase().includes(search)) {
        return false;
      }
      if (category && record.category !== category) {
        return false;
      }
      if (productionMethod && record.production_method !== productionMethod) {
        return false;
      }
      if (status && record.status !== status) {
        return false;
      }
      return true;
    });
  }

  function normalizeDesignRecord(record) {
    const normalized = record && typeof record === 'object' ? record : {};
    return {
      id: typeof normalized.id === 'string' ? normalized.id.trim() : '',
      design_name: typeof normalized.design_name === 'string' ? normalized.design_name.trim() : '',
      thumbnail_path: normalizeNullableString(normalized.thumbnail_path),
      category: typeof normalized.category === 'string' ? normalized.category.trim() : '',
      store_fit: typeof normalized.store_fit === 'string' ? normalized.store_fit.trim() : '',
      status: typeof normalized.status === 'string' ? normalized.status.trim() : '',
      production_method: typeof normalized.production_method === 'string' ? normalized.production_method.trim() : '',
      production_file_location: normalizeNullableString(normalized.production_file_location),
      made_on_hat: typeof normalized.made_on_hat === 'string' ? normalized.made_on_hat.trim() : '',
      notes: normalizeNullableString(normalized.notes),
      sort_order: normalizePositiveInteger(normalized.sort_order),
      finished_hat_link_count: normalizeNonnegativeInteger(normalized.finished_hat_link_count),
      created_at: typeof normalized.created_at === 'string' ? normalized.created_at.trim() : '',
      updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at.trim() : ''
    };
  }

  function getDesignThumbnailDisplay(record) {
    const normalized = normalizeDesignRecord(record);
    if (normalized.thumbnail_path) {
      return {
        type: 'image',
        src: normalized.thumbnail_path,
        alt: `${normalized.design_name || 'Design'} thumbnail`,
        html: `<img src="${escapeAttribute(normalized.thumbnail_path)}" alt="${escapeAttribute((normalized.design_name || 'Design') + ' thumbnail')}"${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>`
      };
    }

    return {
      type: 'placeholder',
      src: '',
      alt: MISSING_THUMBNAIL_COPY,
      html: `<div class="staff-design-card-thumb-placeholder">${escapeHtml(MISSING_THUMBNAIL_COPY)}</div>`
    };
  }

  function compareDesignsByName(left, right) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.compareNullableText(left?.design_name, right?.design_name);
  }

  function sortDesignRecords(records, sortKey) {
    const orderingApi = resolveCatalogOrderingApi();
    return orderingApi.sortCatalogRecords(records, {
      sortKey,
      compareLabel: compareDesignsByName,
      comparators: {
        custom: orderingApi.compareCustomOrder,
        az: compareDesignsByName,
        recent(left, right) {
          return orderingApi.compareDatesDescending(left?.created_at, right?.created_at);
        },
        status(left, right) {
          return orderingApi.compareNullableText(getStatusLabel(left?.status), getStatusLabel(right?.status));
        },
        category(left, right) {
          return orderingApi.compareNullableText(getCategoryLabel(left?.category), getCategoryLabel(right?.category));
        },
        production_method(left, right) {
          return orderingApi.compareNullableText(getProductionMethodLabel(left?.production_method), getProductionMethodLabel(right?.production_method));
        }
      }
    });
  }

  function sortRecordsForCustomOrder(records) {
    return sortDesignRecords(records, 'custom');
  }

  function renderSelectOptions(labelMap, selectedValue, emptyLabel) {
    const options = [];
    if (emptyLabel !== '') {
      options.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    }

    Object.entries(labelMap).forEach(([value, label]) => {
      options.push(
        `<option value="${escapeAttribute(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>`
      );
    });

    return options.join('');
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

  function getCategoryLabel(value) {
    return CATEGORY_LABELS[value] || 'Other';
  }

  function getStoreFitLabel(value) {
    return STORE_FIT_LABELS[value] || 'Undecided';
  }

  function getStatusLabel(value) {
    return STATUS_LABELS[value] || 'In Review';
  }

  function getProductionMethodLabel(value) {
    return PRODUCTION_METHOD_LABELS[value] || 'TBD';
  }

  function getMadeOnHatLabel(value) {
    return MADE_ON_HAT_LABELS[value] || 'Unknown';
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

  function normalizeNonnegativeInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const normalized = Number.parseInt(value.trim(), 10);
      return normalized >= 0 ? normalized : 0;
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
    CATEGORY_LABELS,
    STORE_FIT_LABELS,
    STATUS_LABELS,
    PRODUCTION_METHOD_LABELS,
    MADE_ON_HAT_LABELS,
    DEFAULT_FORM_VALUES,
    MISSING_THUMBNAIL_COPY,
    SORT_OPTIONS,
    createDesignCreateIdempotencyKey,
    createStaffDesignCatalogModule,
    filterDesignRecords,
    normalizeDesignRecord,
    normalizeNonnegativeInteger,
    getDesignThumbnailDisplay,
    sortDesignRecords,
    getCategoryLabel,
    getStoreFitLabel,
    getStatusLabel,
    getProductionMethodLabel,
    getMadeOnHatLabel
  };
}));
