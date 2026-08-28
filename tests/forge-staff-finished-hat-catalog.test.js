const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const finishedHatCatalogModule = require('../public/js/forge-staff-finished-hat-catalog.js');

const appSource = fs.readFileSync(path.join(process.cwd(), 'public/js/app.js'), 'utf8');
const catalogCssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');
const finishedHatSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-finished-hat-catalog.js'), 'utf8');

test('finished hat record normalization preserves links dimensions and nullable price', () => {
  const normalized = finishedHatCatalogModule.normalizeFinishedHatRecord({
    id: ' fin-1 ',
    finished_hat_name: ' Texas Hill Country Camo Leatherette Patch Hat ',
    photo_path: ' /uploads/finished-hat-photos/finished-hat-a1b2c3.jpg ',
    image_width: '1536',
    image_height: '2048',
    design_name: ' Texas Hill Country ',
    hat_manufacturer: ' Richardson ',
    hat_model: ' 112 ',
    hat_color: ' Navy / Charcoal ',
    material_name: ' Rawhide Black Durra Bull Premium Leatherette Sheets ',
    material_type: ' Leatherette ',
    material_color: ' Rawhide / Black ',
    placement_status: ' sample ',
    retail_price: ' 38.00 ',
    status: ' active ',
    needs_linking: 0
  });

  assert.equal(normalized.finished_hat_name, 'Texas Hill Country Camo Leatherette Patch Hat');
  assert.equal(normalized.photo_path, '/uploads/finished-hat-photos/finished-hat-a1b2c3.jpg');
  assert.equal(normalized.image_width, 1536);
  assert.equal(normalized.image_height, 2048);
  assert.equal(normalized.placement_status, 'sample');
  assert.equal(normalized.retail_price, '38.00');
  assert.equal(normalized.needs_linking, false);
});

test('finished hat filters cover linked search placement status and needs-linking', () => {
  const records = [
    finishedHatCatalogModule.normalizeFinishedHatRecord({
      id: '1',
      finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
      design_name: 'Texas Flag',
      hat_manufacturer: 'Zapped',
      hat_model: 'Blackhawk R+',
      hat_color: 'Black / Red',
      material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
      material_type: 'Acrylic',
      material_color: 'Black / Stainless',
      placement_status: 'sample',
      status: 'active',
      needs_linking: false
    }),
    finishedHatCatalogModule.normalizeFinishedHatRecord({
      id: '2',
      finished_hat_name: 'America 250 Coastal Flag Eagle Leatherette Patch Hat',
      design_name: null,
      hat_manufacturer: 'Richardson',
      hat_model: '112',
      hat_color: 'Navy / Charcoal',
      material_name: null,
      material_type: null,
      material_color: null,
      placement_status: 'unassigned',
      status: 'review',
      needs_linking: true
    })
  ];

  const results = finishedHatCatalogModule.filterFinishedHatRecords(records, {
    search: 'blackhawk',
    design_name: '',
    hat_manufacturer: 'Zapped',
    hat_model: '',
    hat_color: '',
    material_name: '',
    placement_status: 'sample',
    status: 'active',
    needs_linking: 'fully_linked'
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, '1');
});

test('finished hat compact summaries stay concise for linked and incomplete records', () => {
  const completeRecord = finishedHatCatalogModule.normalizeFinishedHatRecord({
    finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
    design_id: 'design-1',
    hat_id: 'hat-1',
    material_id: 'material-1',
    design_name: 'Texas Flag',
    hat_manufacturer: 'Zapped',
    hat_model: 'Blackhawk R+',
    hat_color: 'Black / Red',
    material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
    material_color: 'Black / Stainless'
  });
  const incompleteRecord = finishedHatCatalogModule.normalizeFinishedHatRecord({
    finished_hat_name: 'America 250 Coastal Flag Eagle Leatherette Patch Hat',
    design_id: null,
    hat_id: 'hat-1',
    material_id: null,
    hat_manufacturer: 'Richardson',
    hat_model: '112',
    hat_color: 'Navy / Charcoal'
  });

  assert.equal(
    finishedHatCatalogModule.getFinishedHatCompactSummary(completeRecord),
    'Texas Flag • Zapped — Blackhawk R+ — Black / Red • Brushed Stainless Black Laserable Acrylic Panels — Black / Stainless'
  );
  assert.equal(finishedHatCatalogModule.getFinishedHatMissingLinksSummary(completeRecord), '');
  assert.equal(finishedHatCatalogModule.getFinishedHatMissingLinksSummary(incompleteRecord), 'Needs Design + Material');
});

test('finished-hat inventory status does not classify partial zero inventory as out of stock', () => {
  const records = [{ id: 'complete-zero' }, { id: 'partial-zero' }, { id: 'in-stock' }];
  const inventories = {
    'complete-zero': { completeness: 'complete', derived_quantity: 0 },
    'partial-zero': { completeness: 'partial', derived_quantity: 0, not_counted_location_count: 1 },
    'in-stock': { completeness: 'partial', derived_quantity: 2, not_counted_location_count: 1 }
  };
  assert.equal(finishedHatCatalogModule.getFinishedHatInventoryStatus(inventories['complete-zero']), 'out_of_stock');
  assert.equal(finishedHatCatalogModule.getFinishedHatInventoryStatus(inventories['partial-zero']), 'not_counted');
  assert.equal(finishedHatCatalogModule.getFinishedHatInventoryStatus(inventories['in-stock']), 'in_stock');
  assert.deepEqual(finishedHatCatalogModule.filterFinishedHatRecords(records, { inventory_status: 'out_of_stock' }, inventories).map((record) => record.id), ['complete-zero']);
  assert.equal(finishedHatCatalogModule.formatFinishedHatCatalogInventorySummary(finishedHatCatalogModule.getFinishedHatInventorySummary(records, inventories)), 'Counted Inventory: 2 / 2 locations still Not Counted');
});

test('finished hat card photos and dialog preview preserve complete image composition', () => {
  assert.match(catalogCssSource, /\.staff-finished-hat-card-thumb-image\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center;/);
  assert.match(catalogCssSource, /\.staff-design-thumbnail-preview img\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-card:hover,\s*\.staff-finished-hat-card:focus-visible/);
  assert.match(catalogCssSource, /\.staff-finished-hat-card-title\s*\{[\s\S]*-webkit-line-clamp:\s*2;/);
});

test('visual picker layout uses a constrained left column, flexible right column, wrapping filters, and responsive grid', () => {
  assert.match(catalogCssSource, /\.staff-design-dialog\s*\{[\s\S]*width:\s*min\(95vw,\s*1380px\);[\s\S]*overflow-x:\s*hidden;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-shell\s*\{[\s\S]*grid-template-columns:\s*clamp\(320px,\s*28vw,\s*380px\)\s*minmax\(0,\s*1fr\);[\s\S]*min-width:\s*0;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-panel\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-filters\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\);/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(135px,\s*1fr\)\);[\s\S]*overflow-x:\s*hidden;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-grid--design\s*\{[\s\S]*height:\s*auto;[\s\S]*min-height:\s*0;[\s\S]*grid-auto-rows:\s*max-content;[\s\S]*align-content:\s*start;/);
  assert.match(catalogCssSource, /\.staff-link-picker-toolbar-actions\s*\{[\s\S]*flex-wrap:\s*wrap;[\s\S]*justify-content:\s*flex-end;/);
});

test('visual picker keeps generic tiles isolated from the dedicated Hat product cards', () => {
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-tile\s*\{[\s\S]*display:\s*block;[\s\S]*min-width:\s*0;[\s\S]*position:\s*relative;[\s\S]*overflow:\s*hidden;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-tile__marker\s*\{/);
  assert.doesNotMatch(catalogCssSource, /\.staff-finished-hat-picker-body\s*\{/);
  assert.doesNotMatch(catalogCssSource, /\.staff-finished-hat-picker-title\s*\{/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-grid--hat\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\);[\s\S]*gap:\s*16px;[\s\S]*align-items:\s*start;/);
  assert.match(catalogCssSource, /\.staff-design-card-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(240px,\s*1fr\)\);[\s\S]*gap:\s*16px;[\s\S]*align-items:\s*start;/);
  assert.match(catalogCssSource, /\.staff-design-card\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*auto 1fr;[\s\S]*overflow:\s*hidden;/);
  assert.match(catalogCssSource, /\.staff-design-card-thumb\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1;[\s\S]*overflow:\s*hidden;/);
});

test('visual picker designs and materials retain their specialized frames while Choose Hat reuses the Hats catalog media frame', () => {
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-media\s*\{[\s\S]*aspect-ratio:\s*4 \/ 3;[\s\S]*min-height:\s*110px;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-media--design\s*\{[\s\S]*aspect-ratio:\s*4 \/ 3;[\s\S]*min-height:\s*110px;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-media--material\s*\{[\s\S]*aspect-ratio:\s*1 \/ 1;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-image--design\s*\{[\s\S]*object-fit:\s*contain;/);
  assert.match(catalogCssSource, /\.staff-design-card-thumb img\s*\{[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*contain;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-image--material\s*\{[\s\S]*height:\s*100%;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-image--material-contain\s*\{[\s\S]*object-fit:\s*contain;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-image--material-cover\s*\{[\s\S]*object-fit:\s*contain;/);
  assert.doesNotMatch(catalogCssSource, /\.staff-finished-hat-picker-media[^}]*staff-design-card-thumb/);
});

test('material picker fit mode preserves every swatch composition', () => {
  assert.equal(finishedHatCatalogModule.getMaterialSwatchFitMode({ image_width: 1800, image_height: 1200 }), 'contain');
  assert.equal(finishedHatCatalogModule.getMaterialSwatchFitMode({ image_width: 1200, image_height: 1800 }), 'contain');
});

test('finished hat catalog images and picker thumbnails add Pinterest opt-out attributes while preserving alt text', () => {
  const photoDisplay = finishedHatCatalogModule.getFinishedHatPhotoDisplay({
    finished_hat_name: 'Sample Finished Hat',
    photo_path: '/uploads/finished-hat-photos/sample-finished-hat.jpg'
  });

  assert.match(photoDisplay.html, /\bnopin="nopin"/);
  assert.match(photoDisplay.html, /\bdata-pin-nopin="true"/);
  assert.match(photoDisplay.html, /\balt="/);
  assert.match(finishedHatSource, /const PINTEREST_NOPIN_IMAGE_ATTRIBUTES = ' nopin="nopin" data-pin-nopin="true"';/);
  assert.match(finishedHatSource, /thumbnailHtml:\s*design\.thumbnail_path[\s\S]*staff-finished-hat-picker-image--design[\s\S]*\$\{PINTEREST_NOPIN_IMAGE_ATTRIBUTES\}/);
  assert.match(finishedHatSource, /thumbnailHtml:\s*hat\.photo_path[\s\S]*finished-hat-hat-picker-image[\s\S]*\$\{PINTEREST_NOPIN_IMAGE_ATTRIBUTES\}/);
  assert.match(finishedHatSource, /thumbnailHtml:\s*material\.swatch_path[\s\S]*staff-finished-hat-picker-image--material[\s\S]*\$\{PINTEREST_NOPIN_IMAGE_ATTRIBUTES\}/);
  assert.match(finishedHatSource, /function getFinishedHatPreviewDisplay\(file, photoPath, finishedHatName\)/);
  assert.match(finishedHatSource, /html: `<img src="\$\{escapeAttribute\(objectUrl\)\}" alt="\$\{escapeAttribute\(\(finishedHatName \|\| 'Finished hat'\) \+ ' preview'\)\}"\$\{PINTEREST_NOPIN_IMAGE_ATTRIBUTES\}>`/);
  assert.match(finishedHatSource, /html: `<img src="\$\{escapeAttribute\(photoPath\)\}" alt="\$\{escapeAttribute\(\(finishedHatName \|\| 'Finished hat'\) \+ ' preview'\)\}"\$\{PINTEREST_NOPIN_IMAGE_ATTRIBUTES\}>`/);
});

test('initial unauthenticated finished-hat render does not request protected records and authenticated render loads finished hats', async () => {
  const calls = [];
  let canLoad = false;
  const module = finishedHatCatalogModule.createStaffFinishedHatCatalogModule({
    apiClient: {
      async listFinishedHats() {
        calls.push('listFinishedHats');
        return {
          ok: true,
          authenticated: true,
          finished_hats: [
            {
              id: '1',
              finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
              status: 'active',
              placement_status: 'sample'
            }
          ]
        };
      }
    },
    designApiClient: { async listDesigns() { return { ok: true, authenticated: true, designs: [] }; } },
    hatApiClient: { async listHats() { return { ok: true, authenticated: true, hats: [] }; } },
    materialApiClient: { async listMaterials() { return { ok: true, authenticated: true, materials: [] }; } },
    canLoadProtectedRecords() {
      return canLoad;
    },
    document: createCatalogTestDocument(),
    window: { setTimeout(fn) { fn(); } }
  });
  const container = createCatalogTestContainer();

  module.render(container);
  await flushMicrotasks();
  assert.equal(calls.length, 0);

  canLoad = true;
  module.render(container);
  await flushMicrotasks();
  assert.equal(calls.length, 1);
  assert.match(container.innerHTML, /Finished Hats/);
  assert.match(container.innerHTML, /Texas Flag Acrylic Patch Hat Black Performance Rope/);
  assert.match(container.innerHTML, /Add Finished Hat/);
});

test('finished hat cards open the read-only detail view by click and keyboard and switch to edit without a visible card edit button', async () => {
  const harness = createFinishedHatCatalogHarness();

  harness.module.render(harness.container);
  await flushMicrotasks();

  assert.match(harness.container.innerHTML, /data-action="catalog-open-finished-hat-detail"/);
  assert.match(harness.container.innerHTML, /aria-label="Open Texas Flag Acrylic Patch Hat Black Performance Rope"/);
  assert.doesNotMatch(harness.container.innerHTML, />Edit<\/button>/);

  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  assert.equal(harness.dialogBackdrop.hidden, false);
  assert.match(harness.formNode.innerHTML, /Texas Flag Acrylic Patch Hat Black Performance Rope/);
  assert.match(harness.headerActionsNode.innerHTML, /Edit[\s\S]*Close/);
  assert.match(harness.formNode.innerHTML, /Texas Flag/);
  assert.match(harness.formNode.innerHTML, /Zapped — Blackhawk R\+ — Black \/ Red/);

  const keyboardEvent = createActionEvent('catalog-open-finished-hat-detail', '1');
  keyboardEvent.key = ' ';
  keyboardEvent.preventDefaultCalled = false;
  keyboardEvent.preventDefault = () => {
    keyboardEvent.preventDefaultCalled = true;
  };
  harness.container.dispatch('keydown', keyboardEvent);
  assert.equal(keyboardEvent.preventDefaultCalled, true);
  assert.match(harness.formNode.innerHTML, /Texas Flag Acrylic Patch Hat Black Performance Rope/);

  harness.dialogBackdrop.dispatch('click', {
    target: {
      dataset: { action: 'catalog-edit-finished-hat-detail' }
    }
  });
  await flushMicrotasks();
  assert.match(harness.headerActionsNode.innerHTML, /Save Finished Hat[\s\S]*Cancel/);
  assert.match(harness.formNode.innerHTML, /name="finished_hat_name"/);
});

test('add finished hat still opens the existing create form', async () => {
  const harness = createFinishedHatCatalogHarness();

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-add-finished-hat'));
  await flushMicrotasks();

  assert.equal(harness.dialogBackdrop.hidden, false);
  assert.match(harness.headerActionsNode.innerHTML, /Add Finished Hat[\s\S]*Cancel/);
  assert.match(harness.formNode.innerHTML, /Choose Photo/);
});

test('catalog dialog header actions stay horizontal until the narrow breakpoint and finished hats keep full-card behavior', () => {
  assert.match(catalogCssSource, /\.staff-catalog-dialog-header-actions,\s*\.staff-design-dialog-header-actions,\s*\.staff-finished-hat-dialog-header-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*gap:\s*10px;[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(catalogCssSource, /\.staff-catalog-dialog-header-actions \.primary-button,\s*\.staff-catalog-dialog-header-actions \.secondary-button\s*\{[\s\S]*width:\s*auto;[\s\S]*white-space:\s*nowrap;/);
  assert.match(catalogCssSource, /@media \(max-width: 767px\) \{[\s\S]*\.staff-catalog-dialog-header-actions\s*\{[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(appSource, /renderStaffCatalogPlaceholderSection/);
  assert.match(appSource, /Shortlist coming later/);
});

test('finished hat catalog wires shared sort and reorder controls while preserving read-only detail open behavior', () => {
  const moduleSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-finished-hat-catalog.js'), 'utf8');
  assert.match(moduleSource, /sortKey:\s*'custom'/);
  assert.match(moduleSource, /catalog-sort-finished-hats/);
  assert.match(moduleSource, /catalog-finished-hat-reorder-handle/);
  assert.match(moduleSource, /catalog-open-finished-hat-detail/);
  assert.match(moduleSource, /reorderFinishedHats\(orderedIds\)/);
});

test('detail view opens design picker with current link selected and cached library data', async () => {
  const harness = createFinishedHatCatalogHarness();

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'design' } }
  });
  await flushMicrotasks();

  assert.match(harness.formNode.innerHTML, /Choose Design/);
  assert.match(harness.formNode.innerHTML, /class="staff-finished-hat-picker-tile staff-finished-hat-picker-tile--design staff-finished-hat-picker-tile--selected"/);
  assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-grid--design/);
  assert.match(harness.formNode.innerHTML, /role="option"/);
  assert.match(harness.formNode.innerHTML, /tabindex="0"/);
  assert.match(harness.formNode.innerHTML, /aria-selected="true"/);
  assert.match(harness.formNode.innerHTML, /title="Texas Flag/);
  assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-tile__media staff-finished-hat-picker-media staff-finished-hat-picker-media--design/);
  assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-tile__marker">Selected<\/span>/);
  assert.doesNotMatch(harness.formNode.innerHTML, /staff-design-card-thumb/);
  assert.doesNotMatch(harness.formNode.innerHTML, /staff-finished-hat-picker-body|staff-finished-hat-picker-title|staff-finished-hat-picker-meta/);
  assert.doesNotMatch(harness.formNode.innerHTML, /<button[^>]*staff-finished-hat-picker-tile/);
  assert.match(harness.formNode.innerHTML, /Selected/);
  assert.equal(harness.calls.listDesigns, 1);

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-cancel-link-picker' } }
  });
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'design' } }
  });
  await flushMicrotasks();

  assert.equal(harness.calls.listDesigns, 1);
});

test('picker search filters and clear filters update the visible library results', async () => {
  const harness = createFinishedHatCatalogHarness({
    hats: [
      { id: 'hat-1', manufacturer: 'Zapped', model: 'Blackhawk R+', color: 'Black / Red', hat_name: 'Blackhawk R+ Black Red', status: 'active' },
      { id: 'hat-2', manufacturer: 'Richardson', model: '112', color: 'Navy / Charcoal', hat_name: 'Richardson 112 Navy Charcoal', status: 'review' }
    ]
  });

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'hat' } }
  });
  await flushMicrotasks();

  assert.match(harness.formNode.innerHTML, /finished-hat-hat-picker-card/);
  harness.dialogBackdrop.dispatch('input', {
    target: { dataset: { action: 'catalog-picker-search' }, value: 'richardson' }
  });
  assert.match(harness.formNode.innerHTML, /title="Richardson • 112 • Navy \/ Charcoal • Richardson 112 Navy Charcoal"/);
  assert.doesNotMatch(harness.formNode.innerHTML, /data-picker-option-id="hat-1"/);

  harness.dialogBackdrop.dispatch('change', {
    target: { dataset: { pickerFilter: 'manufacturer' }, value: 'Richardson' }
  });
  assert.match(harness.formNode.innerHTML, /Richardson 112/);

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-picker-clear-filters' } }
  });
  assert.match(harness.formNode.innerHTML, /Blackhawk R\+/);
  assert.match(harness.formNode.innerHTML, /Richardson 112/);
});

test('picker cancel preserves the existing detail link and apply updates only the chosen foreign key', async () => {
  const harness = createFinishedHatCatalogHarness({
    designs: [
      { id: 'design-1', design_name: 'Texas Flag', category: 'Patriotic', production_method: 'Acrylic', status: 'active' },
      { id: 'design-2', design_name: 'America 250 Eagle', category: 'Patriotic', production_method: 'Leatherette Engraving', status: 'review' }
    ]
  });

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'design' } }
  });
  await flushMicrotasks();

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-picker-select-card', pickerOptionId: 'design-2' } }
  });
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-cancel-link-picker' } }
  });
  assert.equal(harness.calls.updateFinishedHat.length, 0);
  assert.match(harness.formNode.innerHTML, /Texas Flag/);

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'design' } }
  });
  await flushMicrotasks();
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-picker-select-card', pickerOptionId: 'design-2' } }
  });
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-apply-link-picker' } }
  });
  await flushMicrotasks();

  assert.equal(harness.calls.updateFinishedHat.length, 1);
  assert.equal(harness.calls.updateFinishedHat[0].payload.design_id, 'design-2');
  assert.equal(harness.calls.updateFinishedHat[0].payload.hat_id, 'hat-1');
  assert.equal(harness.calls.updateFinishedHat[0].payload.material_id, 'material-1');
  assert.equal(harness.calls.updateFinishedHat[0].payload.finished_hat_name, 'Texas Flag Acrylic Patch Hat Black Performance Rope');
  assert.match(harness.formNode.innerHTML, /America 250 Eagle/);
});

test('clear link and escape close behave safely in the visual picker', async () => {
  const harness = createFinishedHatCatalogHarness();

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'material' } }
  });
  await flushMicrotasks();

  assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-tile__media staff-finished-hat-picker-media staff-finished-hat-picker-media--material/);
  assert.doesNotMatch(harness.formNode.innerHTML, /staff-finished-hat-picker-body/);

  harness.dialogBackdrop.dispatch('keydown', {
    key: 'Escape',
    preventDefault() {}
  });
  assert.match(harness.formNode.innerHTML, /Brushed Stainless Black Laserable Acrylic Panels/);
  assert.equal(harness.calls.updateFinishedHat.length, 0);

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-clear-link', linkType: 'material' } }
  });
  await flushMicrotasks();

  assert.equal(harness.calls.updateFinishedHat.length, 1);
  assert.equal(harness.calls.updateFinishedHat[0].payload.material_id, '');
  assert.match(harness.formNode.innerHTML, /Material[\s\S]*Not linked[\s\S]*Choose Material/);
});

test('picker uses its appropriate result renderer for unfiltered filtered one-result zero-result and cached reopen states', async () => {
  const harness = createFinishedHatCatalogHarness({
    designs: [
      { id: 'design-1', design_name: 'Texas Flag', category: 'Patriotic', production_method: 'Acrylic', status: 'active' },
      { id: 'design-2', design_name: 'America 250 Eagle', category: 'Patriotic', production_method: 'Leatherette Engraving', status: 'review' }
    ],
    hats: [
      { id: 'hat-1', manufacturer: 'Zapped', model: 'Blackhawk R+', color: 'Black / Red', hat_name: 'Blackhawk R+ Black Red', status: 'active' },
      { id: 'hat-2', manufacturer: 'Richardson', model: '112', color: 'Navy / Charcoal', hat_name: 'Richardson 112 Navy Charcoal', status: 'review' }
    ],
    materials: [
      { id: 'material-1', material_name: 'Brushed Stainless Black Laserable Acrylic Panels', material_type: 'Acrylic', color: 'Black / Stainless', status: 'active', image_width: 1800, image_height: 1200 },
      { id: 'material-2', material_name: 'Brushed Stainless Orange Laserable Acrylic Panels', material_type: 'Acrylic', color: 'Orange / Stainless', status: 'active', image_width: 1800, image_height: 1200 }
    ]
  });

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));

  for (const type of ['design', 'hat', 'material']) {
    harness.dialogBackdrop.dispatch('click', {
      target: { dataset: { action: 'catalog-open-link-picker', linkType: type } }
    });
    await flushMicrotasks();

    assert.match(
      harness.formNode.innerHTML,
      type === 'hat' ? /finished-hat-hat-picker-option/ : /staff-finished-hat-picker-tile/
    );
    if (type === 'design') {
      assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-grid--design/);
    }
    if (type === 'hat') {
      assert.match(harness.formNode.innerHTML, /staff-design-card-thumb[\s\S]*staff-design-card-body/);
      assert.doesNotMatch(harness.formNode.innerHTML, /staff-design-card-top|staff-design-status-badge/);
    } else {
      assert.doesNotMatch(harness.formNode.innerHTML, /staff-design-card-body|staff-design-card-top|staff-design-status-badge|staff-design-card-thumb/);
    }

    if (type === 'design') {
      harness.dialogBackdrop.dispatch('input', {
        target: { dataset: { action: 'catalog-picker-search' }, value: 'America 250' }
      });
    } else if (type === 'hat') {
      harness.dialogBackdrop.dispatch('input', {
        target: { dataset: { action: 'catalog-picker-search' }, value: 'Richardson' }
      });
    } else {
      harness.dialogBackdrop.dispatch('input', {
        target: { dataset: { action: 'catalog-picker-search' }, value: 'Orange' }
      });
    }

    assert.match(
      harness.formNode.innerHTML,
      type === 'hat' ? /finished-hat-hat-picker-option/ : /staff-finished-hat-picker-tile/
    );
    assert.doesNotMatch(harness.formNode.innerHTML, /staff-finished-hat-picker-body|staff-finished-hat-picker-title|staff-finished-hat-picker-meta/);

    harness.dialogBackdrop.dispatch('input', {
      target: { dataset: { action: 'catalog-picker-search' }, value: 'zzzz-no-match' }
    });
    assert.match(harness.formNode.innerHTML, /No results match these filters/);

    harness.dialogBackdrop.dispatch('click', {
      target: { dataset: { action: 'catalog-cancel-link-picker' } }
    });
    harness.dialogBackdrop.dispatch('click', {
      target: { dataset: { action: 'catalog-open-link-picker', linkType: type } }
    });
    await flushMicrotasks();

    assert.match(
      harness.formNode.innerHTML,
      type === 'hat' ? /finished-hat-hat-picker-option/ : /staff-finished-hat-picker-tile/
    );
    if (type === 'hat') {
      assert.match(harness.formNode.innerHTML, /staff-design-card-body/);
    } else {
      assert.doesNotMatch(harness.formNode.innerHTML, /staff-design-card-body|staff-finished-hat-picker-body/);
    }

    harness.dialogBackdrop.dispatch('click', {
      target: { dataset: { action: 'catalog-cancel-link-picker' } }
    });
  }
});

test('design grid keeps natural row sizing for many results and one filtered result while hats and materials stay on the shared grid class', async () => {
  const manyDesigns = Array.from({ length: 59 }, (_, index) => ({
    id: `design-${index + 1}`,
    design_name: `Design ${index + 1}`,
    category: 'Patriotic',
    production_method: 'Acrylic',
    status: 'active'
  }));
  const harness = createFinishedHatCatalogHarness({ designs: manyDesigns });

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'design' } }
  });
  await flushMicrotasks();

  assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-grid--design/);
  assert.match(harness.formNode.innerHTML, /data-picker-option-id="design-59"/);

  harness.dialogBackdrop.dispatch('input', {
    target: { dataset: { action: 'catalog-picker-search' }, value: 'Design 59' }
  });

  assert.match(harness.formNode.innerHTML, /staff-finished-hat-picker-grid--design/);
  assert.match(harness.formNode.innerHTML, /data-picker-option-id="design-59"/);
  assert.doesNotMatch(harness.formNode.innerHTML, /data-picker-option-id="design-1"/);

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-cancel-link-picker' } }
  });
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'hat' } }
  });
  await flushMicrotasks();
  assert.doesNotMatch(harness.formNode.innerHTML, /staff-finished-hat-picker-grid--design/);

  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-cancel-link-picker' } }
  });
  harness.dialogBackdrop.dispatch('click', {
    target: { dataset: { action: 'catalog-open-link-picker', linkType: 'material' } }
  });
  await flushMicrotasks();
  assert.doesNotMatch(harness.formNode.innerHTML, /staff-finished-hat-picker-grid--design/);
});

test('app integration activates finished hats through the protected catalog shell', () => {
  assert.match(appSource, /ForgeStaffFinishedHatCatalogApi/);
  assert.match(appSource, /createOptionalStaffFinishedHatCatalogApiClient/);
  assert.match(appSource, /createOptionalStaffFinishedHatCatalogModule/);
  assert.match(appSource, /activeSection === 'finished-hats'/);
});

test('finished hats expose compact staff location management and exclude inactive locations from new assignments', () => {
  assert.match(finishedHatSource, /catalog-manage-inventory-locations/);
  assert.match(finishedHatSource, /renderInventoryLocationManager/);
  assert.match(finishedHatSource, /catalog-save-inventory-location/);
  assert.match(finishedHatSource, /catalog-edit-inventory-location/);
  assert.match(finishedHatSource, /location\.status === 'active'/);
  assert.match(finishedHatSource, /listLocations\?\.\(true\)/);
  assert.match(finishedHatSource, /Legacy Placement Label/);
});

test('finished hat inventory uses the staff dark panel treatment and distinguishes legacy placement metadata', () => {
  assert.match(finishedHatSource, /Placement: \$\{getPlacementStatusLabel/);
  assert.match(catalogCssSource, /\.staff-finished-hat-inventory-panel\s*\{[\s\S]*background:\s*rgba\(255,255,255,\.035\);[\s\S]*color:\s*var\(--staff-text\)/);
  assert.match(catalogCssSource, /\.staff-finished-hat-inventory-row input[\s\S]*background:\s*rgba\(10,13,16,\.78\)/);
  assert.match(catalogCssSource, /\.staff-finished-hat-inventory-panel button\s*\{[\s\S]*max-width:\s*100%/);
});

test('finished hat detail places compact inventory beside the photo with collapsed operational utilities', () => {
  assert.match(finishedHatSource, /staff-finished-hat-detail-top/);
  assert.match(finishedHatSource, /staff-finished-hat-top-inventory/);
  assert.match(finishedHatSource, /Total On Hand/);
  assert.match(finishedHatSource, /Transfer Stock/);
  assert.match(finishedHatSource, /\+ Add Location/);
  assert.match(finishedHatSource, /Inventory History ›/);
  assert.doesNotMatch(finishedHatSource, /Operational inventory is separate from legacy placement metadata/);
  assert.match(catalogCssSource, /\.staff-finished-hat-detail-top\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, \.95fr\) minmax\(330px, 1\.05fr\)/);
  assert.match(catalogCssSource, /@media \(max-width: 760px\) \{[\s\S]*\.staff-finished-hat-detail-top\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('finished hat editor and detail share compact Build Details rows', () => {
  assert.match(finishedHatSource, /function renderBuildDetailsSection\(record, editor = false\)/);
  assert.match(finishedHatSource, />Build Details</);
  assert.match(finishedHatSource, /renderBuildDetailsRow\('design', record, editor\)[\s\S]*renderBuildDetailsRow\('hat', record, editor\)[\s\S]*renderBuildDetailsRow\('material', record, editor\)/);
  assert.match(finishedHatSource, /Not linked/);
  assert.match(finishedHatSource, /data-action="catalog-open-link-picker"[\s\S]*data-action="catalog-clear-link"/);
  assert.doesNotMatch(finishedHatSource, /record\.needs_linking \? `<span class="staff-design-status-badge/);
  assert.match(catalogCssSource, /\.staff-finished-hat-build-details-row\s*\{[\s\S]*grid-template-columns:\s*90px minmax\(0, 1fr\) auto;/);
  assert.match(catalogCssSource, /\.staff-finished-hat-build-details-actions \.secondary-button,[\s\S]*min-height:\s*32px/);
  assert.match(catalogCssSource, /@media \(max-width: 767px\) \{[\s\S]*\.staff-finished-hat-build-details-row\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
});

test('finished hat cleanup keeps Build Details text-only, location forms on demand, and gallery setup concise', () => {
  assert.match(finishedHatSource, /Needs setup/);
  assert.doesNotMatch(finishedHatSource, /compactSummary \? `<p class="staff-finished-hat-card-summary-line/);
  assert.match(finishedHatSource, /locationFormOpen: false/);
  assert.match(finishedHatSource, /catalog-add-inventory-location/);
  assert.match(finishedHatSource, /\+ Add Location/);
  assert.match(finishedHatSource, /renderFinishedHatHatPickerCard\(option, selected\)/);
  assert.match(catalogCssSource, /\.staff-finished-hat-picker-grid--hat\s*\{[\s\S]*minmax\(240px, 1fr\)/);
  assert.match(finishedHatSource, /staff-catalog-card-shell finished-hat-hat-picker-option/);
  assert.match(finishedHatSource, /staff-design-card-thumb finished-hat-hat-picker-media/);
  assert.doesNotMatch(finishedHatSource, /staff-finished-hat-build-details-thumb/);
});

test('Choose Hat reuses the working Hats catalog media frame and gallery inventory labels stay consistent', () => {
  assert.match(catalogCssSource, /\.staff-design-card-thumb img\s*\{[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*contain;/);
  assert.match(finishedHatSource, /return `Inventory: \$\{inventory\.derived_quantity\}`;/);
  assert.doesNotMatch(finishedHatSource, /return `Total On Hand: \$\{inventory\.derived_quantity\}`;/);
});

test('Choose Hat cards render populated Hat photo, manufacturer/model, color, and selection data', () => {
  const option = finishedHatCatalogModule.normalizeHatOption({
    id: 'hat-42', hat_name: 'Richardson 112 Loden Black', manufacturer: 'Richardson', model: '112', color: 'Loden / Black', photo_path: '/uploads/hat-photos/hat-42.webp', status: 'active'
  });
  const markup = finishedHatCatalogModule.renderFinishedHatHatPickerCard(option, true);
  assert.match(markup, /<div[\s\S]*staff-catalog-card-shell finished-hat-hat-picker-option finished-hat-hat-picker-option--selected[\s\S]*role="option"[\s\S]*tabindex="0"/);
  assert.match(markup, /<div class="staff-design-card finished-hat-hat-picker-card">[\s\S]*<div class="staff-design-card-thumb finished-hat-hat-picker-media">/);
  assert.match(markup, /class="finished-hat-hat-picker-image" src="\/uploads\/hat-photos\/hat-42\.webp"/);
  assert.match(markup, /Richardson \/ 112/);
  assert.match(markup, /Loden \/ Black/);
  assert.match(markup, /data-picker-option-id="hat-42"/);
  assert.match(markup, /aria-selected="true"/);
});

test('Choose Hat renders one sibling option, catalog card, image, and metadata block for every Hat result', () => {
  const options = Array.from({ length: 8 }, (_, index) => finishedHatCatalogModule.normalizeHatOption({
    id: `hat-${index + 1}`,
    hat_name: `Hat ${index + 1}`,
    manufacturer: 'Richardson',
    model: `Model ${index + 1}`,
    color: `Color ${index + 1}`,
    photo_path: `/uploads/hat-photos/hat-${index + 1}.webp`
  }));
  const gridMarkup = `<div class="staff-finished-hat-picker-grid staff-finished-hat-picker-grid--hat">${options.map((option) => finishedHatCatalogModule.renderFinishedHatHatPickerCard(option, false)).join('')}</div>`;

  assert.equal((gridMarkup.match(/staff-catalog-card-shell finished-hat-hat-picker-option/g) || []).length, 8);
  assert.equal((gridMarkup.match(/staff-design-card finished-hat-hat-picker-card/g) || []).length, 8);
  assert.equal((gridMarkup.match(/class="finished-hat-hat-picker-image"/g) || []).length, 8);
  assert.equal((gridMarkup.match(/class="staff-design-card-body finished-hat-hat-picker-meta"/g) || []).length, 8);
  assert.equal((gridMarkup.match(/data-picker-option-id="hat-/g) || []).length, 8);
  assert.match(gridMarkup, /<\/div>\s*<div\s+class="staff-catalog-card-shell finished-hat-hat-picker-option/);
  assert.match(gridMarkup, /Richardson \/ Model 1[\s\S]*Color 1/);
  assert.match(gridMarkup, /Richardson \/ Model 8[\s\S]*Color 8/);
});

test('Choose Hat catalog-card options preserve click and Enter/Space selection before Apply Selection', async () => {
  const harness = createFinishedHatCatalogHarness({
    hats: [
      { id: 'hat-1', manufacturer: 'Richardson', model: '112', color: 'Loden / Black', hat_name: 'Richardson 112 Loden Black', photo_path: '/uploads/hat-photos/hat-1.webp', status: 'active' },
      { id: 'hat-2', manufacturer: 'Richardson', model: '168', color: 'Navy / White', hat_name: 'Richardson 168 Navy White', photo_path: '/uploads/hat-photos/hat-2.webp', status: 'active' }
    ]
  });

  harness.module.render(harness.container);
  await flushMicrotasks();
  harness.container.dispatch('click', createActionEvent('catalog-open-finished-hat-detail', '1'));
  harness.dialogBackdrop.dispatch('click', { target: { dataset: { action: 'catalog-open-link-picker', linkType: 'hat' } } });
  await flushMicrotasks();

  harness.dialogBackdrop.dispatch('keydown', {
    key: 'Enter',
    preventDefault() {},
    target: { dataset: { action: 'catalog-picker-select-card', pickerOptionId: 'hat-1' } }
  });
  assert.match(harness.formNode.innerHTML, /data-picker-option-id="hat-1"[\s\S]*aria-selected="true"/);

  harness.dialogBackdrop.dispatch('keydown', {
    key: ' ',
    preventDefault() {},
    target: { dataset: { action: 'catalog-picker-select-card', pickerOptionId: 'hat-2' } }
  });
  assert.match(harness.formNode.innerHTML, /data-picker-option-id="hat-2"[\s\S]*aria-selected="true"/);
  assert.match(harness.formNode.innerHTML, /data-action="catalog-apply-link-picker"/);
});

test('Add and Edit Finished Hat primary photos support validated drag and drop through the existing selected-file state', () => {
  const validPhoto = { name: 'finished-hat.webp', type: 'image/webp', size: 1024 };
  assert.equal(finishedHatCatalogModule.validateFinishedHatPhotoFiles([validPhoto]).file, validPhoto);
  assert.match(finishedHatCatalogModule.validateFinishedHatPhotoFiles([{ name: 'wrong.gif', type: 'image/gif', size: 1024 }]).error, /Only PNG, JPEG, and WebP/);
  assert.match(finishedHatCatalogModule.validateFinishedHatPhotoFiles([validPhoto, validPhoto]).error, /only one finished hat photo/i);
  assert.match(finishedHatCatalogModule.validateFinishedHatPhotoFiles([{ name: 'large.png', type: 'image/png', size: finishedHatCatalogModule.FINISHED_HAT_PHOTO_MAX_BYTES + 1 }]).error, /5 MB/);
  assert.match(finishedHatSource, /data-catalog-finished-hat-photo-dropzone/);
  assert.match(finishedHatSource, /addEventListener\('drop', onFinishedHatPhotoDrop, true\)/);
  assert.match(finishedHatSource, /selectFinishedHatPhotoFiles\(target\.files\)/);
  assert.match(finishedHatSource, /interceptFinishedHatPhotoDrop\(event, \(files\) => selectFinishedHatPhotoFiles\(files\)\)/);
  assert.match(finishedHatSource, /staff-finished-hat-photo-dropzone--dragging/);
  assert.match(finishedHatSource, /Drop finished hat photo here, or choose a file/);
});

test('Finished Hat file drops prevent browser navigation and pass the dropped files into the photo selection path', () => {
  const droppedFiles = [{ name: 'finished-hat.png', type: 'image/png', size: 1024 }];
  let prevented = false;
  let stopped = false;
  let receivedFiles = null;
  finishedHatCatalogModule.interceptFinishedHatPhotoDrop({
    dataTransfer: { files: droppedFiles },
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  }, (files) => { receivedFiles = files; });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(receivedFiles, droppedFiles);
  assert.match(finishedHatSource, /onFinishedHatPhotoDragOver[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\)/);
  assert.match(finishedHatSource, /onFinishedHatPhotoDrop[\s\S]*interceptFinishedHatPhotoDrop\(event, \(files\) => selectFinishedHatPhotoFiles\(files\)\)/);
});

test('finished hat inventory keeps location assignment and management separate from More stock actions', () => {
  assert.match(finishedHatSource, /\+ Add Location/);
  assert.match(finishedHatSource, /catalog-finished-inventory-assign/);
  assert.match(finishedHatSource, /catalog-manage-inventory-locations/);
  assert.match(finishedHatSource, /Back to Finished Hat/);
  assert.match(finishedHatSource, /location\.status === 'active'/);
  assert.match(finishedHatSource, /data-reason="returned"[\s\S]*Verified qty[\s\S]*catalog-finished-inventory-correct/);
  assert.doesNotMatch(finishedHatSource, /More<\/button>[\s\S]*catalog-manage-inventory-locations/);
});

function createCatalogTestContainer() {
  const listeners = new Map();
  return {
    innerHTML: '',
    dataset: {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    dispatch(type, event) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler.call(this, event));
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function createCatalogTestDocument() {
  const dialogBackdrop = createFakeDialogElement();
  const dialogNode = createFakeDialogElement();
  const formNode = createFakeDialogNode('form');
  const statusNode = createFakeDialogNode('status');
  const headerActionsNode = createFakeDialogNode('header-actions');

  dialogBackdrop.querySelector = (selector) => {
    if (selector === '.staff-design-dialog') {
      return dialogNode;
    }
    if (selector === '[data-finished-hat-dialog-form]') {
      return formNode;
    }
    if (selector === '[data-finished-hat-dialog-status]') {
      return statusNode;
    }
    if (selector === '[data-finished-hat-dialog-header-actions]') {
      return headerActionsNode;
    }
    return createFakeDialogNode(selector);
  };

  return {
    activeElement: null,
    body: {
      appendChild(node) {
        this.lastAppended = node;
      }
    },
    createElement() {
      return dialogBackdrop;
    },
    __dialogBackdrop: dialogBackdrop,
    __formNode: formNode,
    __statusNode: statusNode,
    __headerActionsNode: headerActionsNode
  };
}

function createFakeDialogElement() {
  const listeners = new Map();
  return {
    className: '',
    hidden: false,
    innerHTML: '',
    dataset: {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    dispatch(type, event) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler.call(this, event));
    },
    appendChild() {},
    focus() {},
    querySelector(selector) {
      return createFakeDialogNode(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createFakeDialogNode(selector) {
  return {
    selector,
    hidden: false,
    disabled: false,
    dataset: {},
    textContent: '',
    value: '',
    innerHTML: '',
    addEventListener() {},
    appendChild() {},
    focus() {},
    setAttribute() {},
    querySelector() { return createFakeDialogNode('nested'); },
    querySelectorAll() { return []; }
  };
}

function createFinishedHatCatalogHarness(options = {}) {
  const document = createCatalogTestDocument();
  const container = createCatalogTestContainer();
  const calls = {
    listDesigns: 0,
    listHats: 0,
    listMaterials: 0,
    updateFinishedHat: []
  };
  const designRecords = options.designs || [{ id: 'design-1', design_name: 'Texas Flag', category: 'Patriotic', production_method: 'Acrylic', status: 'active' }];
  const hatRecords = options.hats || [{ id: 'hat-1', manufacturer: 'Zapped', model: 'Blackhawk R+', color: 'Black / Red', hat_name: 'Blackhawk R+ Black Red', status: 'active' }];
  const materialRecords = options.materials || [{ id: 'material-1', material_name: 'Brushed Stainless Black Laserable Acrylic Panels', material_type: 'Acrylic', color: 'Black / Stainless', status: 'active', image_width: 1200, image_height: 1200 }];
  const module = finishedHatCatalogModule.createStaffFinishedHatCatalogModule({
    apiClient: {
      async listFinishedHats() {
        return {
          ok: true,
          authenticated: true,
          finished_hats: [
            {
              id: '1',
              finished_hat_name: 'Texas Flag Acrylic Patch Hat Black Performance Rope',
              design_id: 'design-1',
              hat_id: 'hat-1',
              material_id: 'material-1',
              design_name: 'Texas Flag',
              hat_manufacturer: 'Zapped',
              hat_model: 'Blackhawk R+',
              hat_color: 'Black / Red',
              material_name: 'Brushed Stainless Black Laserable Acrylic Panels',
              material_color: 'Black / Stainless',
              placement_status: 'sample',
              status: 'active'
            }
          ]
        };
      },
      async updateFinishedHat(_id, payload) {
        calls.updateFinishedHat.push({ payload });
        const selectedDesign = designRecords.find((item) => item.id === payload.design_id) || null;
        const selectedHat = hatRecords.find((item) => item.id === payload.hat_id) || null;
        const selectedMaterial = materialRecords.find((item) => item.id === payload.material_id) || null;
        return {
          ok: true,
          authenticated: true,
          finished_hat: {
            id: '1',
            ...payload,
            design_name: selectedDesign?.design_name || null,
            hat_manufacturer: selectedHat?.manufacturer || null,
            hat_model: selectedHat?.model || null,
            hat_color: selectedHat?.color || null,
            material_name: selectedMaterial?.material_name || null,
            material_type: selectedMaterial?.material_type || null,
            material_color: selectedMaterial?.color || null,
            needs_linking: !payload.design_id || !payload.hat_id || !payload.material_id
          }
        };
      },
      async createFinishedHat(payload) {
        return {
          ok: true,
          authenticated: true,
          finished_hat: {
            id: 'new-finished-hat',
            ...payload
          }
        };
      },
      async uploadPhoto(id) {
        return {
          ok: true,
          authenticated: true,
          finished_hat: { id }
        };
      }
    },
    designApiClient: {
      async listDesigns() {
        calls.listDesigns += 1;
        return { ok: true, authenticated: true, designs: designRecords };
      }
    },
    hatApiClient: {
      async listHats() {
        calls.listHats += 1;
        return { ok: true, authenticated: true, hats: hatRecords };
      }
    },
    materialApiClient: {
      async listMaterials() {
        calls.listMaterials += 1;
        return { ok: true, authenticated: true, materials: materialRecords };
      }
    },
    canLoadProtectedRecords() {
      return true;
    },
    document,
    window: { setTimeout(fn) { fn(); } }
  });

  return {
    calls,
    module,
    container,
    dialogBackdrop: document.__dialogBackdrop,
    formNode: document.__formNode,
    statusNode: document.__statusNode,
    headerActionsNode: document.__headerActionsNode
  };
}

function createActionEvent(action, finishedHatId = '') {
  return {
    key: '',
    target: {
      closest(selector) {
        if (selector === '[data-action]') {
          return { dataset: { action } };
        }
        if (selector === '[data-finished-hat-id]' && finishedHatId) {
          return { dataset: { finishedHatId } };
        }
        return null;
      }
    },
    preventDefault() {},
    stopPropagation() {}
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
