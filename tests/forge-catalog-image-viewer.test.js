const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewerModule = require('../public/js/forge-catalog-image-viewer.js');

const viewerSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-catalog-image-viewer.js'), 'utf8');
const designSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-design-catalog.js'), 'utf8');
const hatSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-hat-catalog.js'), 'utf8');
const materialSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-material-catalog.js'), 'utf8');
const finishedHatSource = fs.readFileSync(path.join(process.cwd(), 'public/js/forge-staff-finished-hat-catalog.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(process.cwd(), 'public/css/app.css'), 'utf8');

test('catalog image viewer exposes a reusable safe item contract', () => {
  assert.equal(typeof viewerModule.createCatalogImageViewer, 'function');
  assert.equal(viewerModule.BODY_LOCK_CLASS, 'forge-catalog-image-viewer-open');
  assert.deepEqual(viewerModule.normalizeViewerItem({
    id: ' item-1 ',
    typeLabel: ' Design ',
    name: ' Texas Flag ',
    metadata: ' Active ',
    src: ' /uploads/design.png ',
    alt: ' Full artwork '
  }), {
    id: 'item-1',
    typeLabel: 'Design',
    name: 'Texas Flag',
    metadata: 'Active',
    src: '/uploads/design.png',
    alt: 'Full artwork'
  });
});

test('catalog image viewer owns zoom pan navigation focus and scroll-lock behavior', () => {
  assert.match(viewerSource, /role="dialog" aria-modal="true"/);
  assert.match(viewerSource, /data-viewer-action="zoom-in"/);
  assert.match(viewerSource, /data-viewer-action="zoom-out"/);
  assert.match(viewerSource, /data-viewer-action="fit"/);
  assert.match(viewerSource, /data-viewer-action="actual"/);
  assert.match(viewerSource, /data-viewer-action="previous"/);
  assert.match(viewerSource, /data-viewer-action="next"/);
  assert.match(viewerSource, /event\.key === 'Escape'/);
  assert.match(viewerSource, /event\.key === 'ArrowLeft'/);
  assert.match(viewerSource, /event\.key === 'ArrowRight'/);
  assert.match(viewerSource, /event\.key === '0'/);
  assert.match(viewerSource, /trapFocus\(event\)/);
  assert.match(viewerSource, /documentRef\.body\.classList\.add\(BODY_LOCK_CLASS\)/);
  assert.match(viewerSource, /documentRef\.body\.classList\.remove\(BODY_LOCK_CLASS\)/);
  assert.match(viewerSource, /touchstart/);
  assert.match(viewerSource, /touchmove/);
  assert.match(viewerSource, /pointerdown/);
  assert.match(viewerSource, /wheel/);
  assert.match(viewerSource, /resetViewState\(\);[\s\S]*render\(\);/);
});

test('catalog viewer CSS covers the viewport and preserves touch pan pinch safety', () => {
  assert.match(cssSource, /\.forge-catalog-image-viewer\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*10000;/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__stage\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*touch-action:\s*none;/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__image\s*\{[\s\S]*object-fit:\s*contain;[\s\S]*transform-origin:\s*center;/);
  assert.match(cssSource, /body\.forge-catalog-image-viewer-open\s*\{[\s\S]*overflow:\s*hidden;/);
});

test('all catalog modules route image clicks to the shared viewer without replacing card detail actions', () => {
  [
    [designSource, 'catalog-edit-design', "thumbnail.type === 'image'", 'Design'],
    [hatSource, 'catalog-edit-hat', "photo.type === 'image'", 'Hat'],
    [materialSource, 'catalog-edit-material', "swatch.type === 'image'", 'Material'],
    [finishedHatSource, 'catalog-open-finished-hat-detail', 'record.photo_path', 'Finished Hat']
  ].forEach(([source, detailAction, imageGuard, typeLabel]) => {
    assert.match(source, new RegExp(`data-action="${detailAction}"`));
    assert.match(source, /data-action="catalog-open-image-viewer"/);
    assert.match(source, new RegExp(imageGuard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(source, /openImageViewer\(/);
    assert.match(source, /getVisibleImageViewerItems\(\)/);
    assert.match(source, new RegExp(`typeLabel:\\s*'${typeLabel}'`));
    assert.match(source, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*openImageViewer/);
    assert.match(source, /sort[A-Za-z]+Records\(filter[A-Za-z]+Records\(state\.records, state\.filters\), state\.sortKey\)/);
    assert.match(source, /selectedId:/);
    assert.match(source, /opener/);
  });
});
