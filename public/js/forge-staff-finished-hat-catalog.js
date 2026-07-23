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

  function createStaffFinishedHatCatalogModule(options = {}) {
    const apiClient = options.apiClient || null;
    const designApiClient = options.designApiClient || null;
    const hatApiClient = options.hatApiClient || null;
    const materialApiClient = options.materialApiClient || null;
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
      dialogDesignSearch: '',
      dialogHatSearch: '',
      dialogMaterialSearch: ''
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
          ? result.finished_hats.map(normalizeFinishedHatRecord).sort(compareFinishedHatsByName)
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

        if (
          designResult?.unauthenticated ||
          hatResult?.unauthenticated ||
          materialResult?.unauthenticated
        ) {
          state.optionError = 'Staff authentication is required.';
          state.optionsLoaded = false;
          return;
        }

        state.designOptions = Array.isArray(designResult?.designs) ? designResult.designs.map(normalizeDesignOption).sort(compareOptionsByLabel) : [];
        state.hatOptions = Array.isArray(hatResult?.hats) ? hatResult.hats.map(normalizeHatOption).sort(compareOptionsByLabel) : [];
        state.materialOptions = Array.isArray(materialResult?.materials) ? materialResult.materials.map(normalizeMaterialOption).sort(compareOptionsByLabel) : [];
        state.optionsLoaded = true;
      } catch (error) {
        state.optionError = safeErrorMessage(error, 'Catalog link options could not be loaded right now.');
      } finally {
        state.optionsLoading = false;
        renderDialog();
      }
    }

    function renderContent() {
      if (!container) {
        return;
      }

      const filteredRecords = filterFinishedHatRecords(state.records, state.filters);
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
            <label class="staff-catalog-designs-filter">
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
            <div class="staff-catalog-designs-filter-clear">
              <button class="secondary-button" type="button" data-action="catalog-clear-finished-hat-filters">Clear Filters</button>
            </div>
          </div>
          ${renderFinishedHatBody(filteredRecords, hasActiveFilters)}
        </section>
      `;
    }

    function renderFinishedHatBody(filteredRecords, hasActiveFilters) {
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

      return `<div class="staff-design-card-grid staff-finished-hat-card-grid">${filteredRecords.map((record) => renderFinishedHatCard(record)).join('')}</div>`;
    }

    function renderFinishedHatCard(record) {
      const photo = getFinishedHatPhotoDisplay(record);
      const compactSummary = getFinishedHatCompactSummary(record);
      const missingLinksSummary = getFinishedHatMissingLinksSummary(record);
      const primaryBadge = getFinishedHatPrimaryBadge(record);
      return `
        <article
          class="staff-design-card staff-finished-hat-card"
          role="button"
          tabindex="0"
          data-action="catalog-open-finished-hat-detail"
          data-finished-hat-id="${escapeAttribute(record.id)}"
          aria-label="${escapeAttribute(`Open ${record.finished_hat_name || 'finished hat'}`)}"
        >
          <div class="staff-design-card-thumb staff-finished-hat-card-thumb">
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
    }

    function onContainerClick(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
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
      const action = event.target?.dataset?.action;
      if (action === 'catalog-finished-hat-search') {
        state.filters.search = String(event.target.value || '');
        renderContent();
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
      const filterKey = filterMap[action];
      if (filterKey) {
        state.filters[filterKey] = String(event.target.value || '');
        renderContent();
      }
    }

    function ensureDialogUi() {
      if (dialogBackdrop && dialogNode) {
        return;
      }
      dialogBackdrop = documentRef.createElement('div');
      dialogBackdrop.className = 'staff-design-dialog-backdrop';
      dialogBackdrop.hidden = true;
      dialogBackdrop.innerHTML = `
        <div class="staff-design-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-finished-hat-dialog-title">
          <div class="staff-design-dialog-header">
            <div>
              <p class="eyebrow staff-orders-eyebrow">Shared Library</p>
              <h3 id="staff-finished-hat-dialog-title">Finished Hat</h3>
            </div>
            <div class="staff-finished-hat-dialog-header-actions" data-finished-hat-dialog-header-actions></div>
          </div>
          <div data-finished-hat-dialog-status></div>
          <form class="staff-design-dialog-form" data-finished-hat-dialog-form></form>
        </div>
      `;
      documentRef.body.appendChild(dialogBackdrop);
      dialogNode = dialogBackdrop.querySelector('.staff-design-dialog');
      formNode = dialogBackdrop.querySelector('[data-finished-hat-dialog-form]');
      statusNode = dialogBackdrop.querySelector('[data-finished-hat-dialog-status]');
      dialogBackdrop.addEventListener('click', (event) => {
        if (event.target === dialogBackdrop) {
          closeDialog();
        }
      });
      dialogBackdrop.addEventListener('click', (event) => {
        if (event.target?.dataset?.action === 'catalog-close-finished-hat-dialog') {
          closeDialog();
          return;
        }
        if (event.target?.dataset?.action === 'catalog-edit-finished-hat-detail') {
          switchDialogToEdit();
        }
      });
      dialogBackdrop.addEventListener('input', onDialogInput);
      dialogBackdrop.addEventListener('change', onDialogChange);
      dialogBackdrop.addEventListener('submit', onDialogSubmit);
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
      state.dialogDesignSearch = '';
      state.dialogHatSearch = '';
      state.dialogMaterialSearch = '';
      state.dialogValues = {
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
      renderDialog();
      if (mode !== 'detail') {
        await ensureLinkOptionsLoaded();
      }
      windowLike.setTimeout(() => {
        dialogBackdrop.hidden = false;
        dialogNode?.querySelector('input, select, textarea, button')?.focus();
      }, 0);
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

      const preview = getFinishedHatPreviewDisplay(state.dialogPhotoFile, state.dialogPhotoPath, state.dialogValues.finished_hat_name);
      const filteredDesignOptions = filterOptionsBySearch(state.designOptions, state.dialogDesignSearch);
      const filteredHatOptions = filterOptionsBySearch(state.hatOptions, state.dialogHatSearch);
      const filteredMaterialOptions = filterOptionsBySearch(state.materialOptions, state.dialogMaterialSearch);
      const headerActionsNode = dialogBackdrop.querySelector('[data-finished-hat-dialog-header-actions]');
      if (headerActionsNode) {
        headerActionsNode.innerHTML = state.dialogMode === 'detail'
          ? `
            <button class="primary-button" type="button" data-action="catalog-edit-finished-hat-detail">Edit</button>
            <button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Close</button>
          `
          : `<button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Close</button>`;
      }

      statusNode.innerHTML = state.dialogError
        ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.dialogError)}</p></div>`
        : '';

      if (state.dialogMode === 'detail') {
        const detailRecord = state.dialogRecord || normalizeFinishedHatRecord({});
        formNode.innerHTML = renderFinishedHatDetail(detailRecord);
        return;
      }

      formNode.innerHTML = `
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
          ${renderSearchSelectField('design_id', 'Design', state.dialogDesignSearch, filteredDesignOptions, state.dialogValues.design_id, 'Search designs', 'Leave Design blank')}
          ${renderSearchSelectField('hat_id', 'Hat', state.dialogHatSearch, filteredHatOptions, state.dialogValues.hat_id, 'Search hats', 'Leave Hat blank')}
          ${renderSearchSelectField('material_id', 'Material', state.dialogMaterialSearch, filteredMaterialOptions, state.dialogValues.material_id, 'Search materials', 'Leave Material blank')}
          ${renderDialogField('patch_shape', 'Patch Shape', `<input type="text" name="patch_shape" value="${escapeAttribute(state.dialogValues.patch_shape)}">`)}
          ${renderDialogField('patch_size', 'Patch Size', `<input type="text" name="patch_size" value="${escapeAttribute(state.dialogValues.patch_size)}">`)}
          ${renderDialogField('location_label', 'Location Label', `<input type="text" name="location_label" value="${escapeAttribute(state.dialogValues.location_label)}">`)}
          ${renderDialogField('retail_price', 'Retail Price', `<input type="text" name="retail_price" inputmode="decimal" value="${escapeAttribute(state.dialogValues.retail_price)}">`)}
          ${renderDialogField('status', 'Record Status', `<select name="status">${renderStatusOptions(state.dialogValues.status, null)}</select>`)}
          ${renderDialogField('notes', 'Notes', `<textarea name="notes">${escapeHtml(state.dialogValues.notes)}</textarea>`, true)}
        </div>
        ${state.optionError ? `<div class="staff-catalog-designs-state staff-catalog-designs-state--error"><p>${escapeHtml(state.optionError)}</p></div>` : ''}
        <div class="staff-design-dialog-actions">
          <button class="secondary-button" type="button" data-action="catalog-close-finished-hat-dialog">Cancel</button>
          <button class="primary-button" type="submit" ${state.dialogSaving ? 'disabled' : ''}>${state.dialogSaving ? 'Saving...' : (state.dialogMode === 'edit' ? 'Save Finished Hat' : 'Add Finished Hat')}</button>
        </div>
      `;
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
            </div>
            ${renderFinishedHatDetailField('Design', record.design_name || 'Needs linking')}
            ${renderFinishedHatDetailField('Hat', formatFinishedHatHatSummary(record) || 'Needs linking')}
            ${renderFinishedHatDetailField('Material', formatFinishedHatMaterialSummary(record) || 'Needs linking')}
            ${renderFinishedHatDetailField('Patch Shape', record.patch_shape)}
            ${renderFinishedHatDetailField('Patch Size', record.patch_size)}
            ${renderFinishedHatDetailField('Location Label', record.location_label)}
            ${renderFinishedHatDetailField('Retail Price', formatRetailPrice(record.retail_price))}
            ${renderFinishedHatDetailField('Notes', record.notes, true)}
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

    function renderSearchSelectField(fieldName, label, searchValue, options, selectedValue, searchPlaceholder, emptyLabel) {
      const searchAction = `catalog-finished-hat-${fieldName}-search`;
      return renderDialogField(
        fieldName,
        label,
        `
          <div class="staff-catalog-linked-field">
            <input type="search" value="${escapeAttribute(searchValue)}" placeholder="${escapeAttribute(searchPlaceholder)}" data-action="${searchAction}">
            <select name="${escapeAttribute(fieldName)}">
              <option value="">${escapeHtml(emptyLabel)}</option>
              ${options.map((option) => `<option value="${escapeAttribute(option.id)}" ${option.id === selectedValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </div>
        `
      );
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

    function onDialogInput(event) {
      const target = event.target;
      if (!target) {
        return;
      }
      if (target.name && Object.prototype.hasOwnProperty.call(state.dialogValues, target.name)) {
        state.dialogValues[target.name] = String(target.value || '');
      }
      const action = target.dataset?.action;
      if (action === 'catalog-finished-hat-design_id-search') {
        state.dialogDesignSearch = String(target.value || '');
        renderDialog();
      } else if (action === 'catalog-finished-hat-hat_id-search') {
        state.dialogHatSearch = String(target.value || '');
        renderDialog();
      } else if (action === 'catalog-finished-hat-material_id-search') {
        state.dialogMaterialSearch = String(target.value || '');
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
    }

    async function onDialogSubmit(event) {
      event.preventDefault();
      if (state.dialogMode === 'detail') {
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
        if (state.dialogMode === 'edit') {
          state.dialogMode = 'detail';
          state.dialogRecord = finishedHat;
          state.dialogFinishedHatId = finishedHat.id;
          state.dialogPhotoPath = finishedHat.photo_path || '';
          state.dialogPhotoFile = null;
          state.dialogPhotoFileName = '';
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

    function upsertRecord(record) {
      const nextRecord = normalizeFinishedHatRecord(record);
      const existingIndex = state.records.findIndex((item) => item.id === nextRecord.id);
      if (existingIndex >= 0) {
        state.records.splice(existingIndex, 1, nextRecord);
      } else {
        state.records.unshift(nextRecord);
      }
      state.records.sort(compareFinishedHatsByName);
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
      state.dialogValues = {
        finished_hat_name: state.dialogRecord.finished_hat_name || '',
        design_id: state.dialogRecord.design_id || '',
        hat_id: state.dialogRecord.hat_id || '',
        material_id: state.dialogRecord.material_id || '',
        patch_shape: state.dialogRecord.patch_shape || '',
        patch_size: state.dialogRecord.patch_size || '',
        placement_status: state.dialogRecord.placement_status || 'unassigned',
        location_label: state.dialogRecord.location_label || '',
        retail_price: state.dialogRecord.retail_price || '',
        status: state.dialogRecord.status || 'review',
        notes: state.dialogRecord.notes || ''
      };
      ensureLinkOptionsLoaded().finally(() => {
        renderDialog();
      });
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
      needs_linking: Boolean(normalized.needs_linking)
    };
  }

  function normalizeDesignOption(record) {
    const design = record && typeof record === 'object' ? record : {};
    const label = asTrimmedString(design.design_name);
    return { id: asTrimmedString(design.id), label };
  }

  function normalizeHatOption(record) {
    const hat = record && typeof record === 'object' ? record : {};
    const label = [hat.manufacturer, hat.model, hat.color, hat.hat_name].map(asTrimmedString).filter(Boolean).join(' — ');
    return { id: asTrimmedString(hat.id), label };
  }

  function normalizeMaterialOption(record) {
    const material = record && typeof record === 'object' ? record : {};
    const label = [material.material_name, material.material_type, material.color].map(asTrimmedString).filter(Boolean).join(' — ');
    return { id: asTrimmedString(material.id), label };
  }

  function compareFinishedHatsByName(left, right) {
    return left.finished_hat_name.localeCompare(right.finished_hat_name, undefined, { sensitivity: 'base' });
  }

  function compareOptionsByLabel(left, right) {
    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
  }

  function collectFinishedHatFilterOptions(records, key) {
    return [...new Set(records.map((record) => record[key]).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  function filterOptionsBySearch(options, searchTerm) {
    const search = normalizeSearch(searchTerm);
    if (!search) {
      return options;
    }
    return options.filter((option) => normalizeSearch(option.label).includes(search));
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

  function renderDynamicSelectOptions(options, selectedValue, emptyLabel) {
    return [`<option value="">${escapeHtml(emptyLabel || 'Select')}</option>`]
      .concat(options.map((option) => `<option value="${escapeAttribute(option)}" ${option === selectedValue ? 'selected' : ''}>${escapeHtml(option)}</option>`))
      .join('');
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

  return {
    STATUS_LABELS,
    PLACEMENT_STATUS_LABELS,
    createStaffFinishedHatCatalogModule,
    filterFinishedHatRecords,
    normalizeFinishedHatRecord,
    getFinishedHatPhotoDisplay,
    getFinishedHatCompactSummary,
    getFinishedHatMissingLinksSummary,
    formatFinishedHatHatSummary,
    formatFinishedHatMaterialSummary,
    getPlacementStatusLabel
  };
}));
