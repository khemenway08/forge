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
  assert.equal(typeof viewerModule.calculateFitScale, 'function');
  assert.equal(typeof viewerModule.calculateCenteredImageBox, 'function');
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
  assert.match(viewerSource, /data-viewer-stage/);
  assert.match(viewerSource, /data-viewer-canvas/);
  assert.match(viewerSource, /data-viewer-center-anchor/);
  assert.match(viewerSource, /data-viewer-pan-layer/);
  assert.match(viewerSource, /data-viewer-image-frame/);
  assert.match(viewerSource, /data-viewer-canvas[\s\S]*data-viewer-center-anchor[\s\S]*data-viewer-pan-layer[\s\S]*data-viewer-image-frame[\s\S]*data-viewer-image/);
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
  assert.match(viewerSource, /applyFitToScreen\(\);[\s\S]*render\(\);/);
  assert.match(viewerSource, /addEventListener\?\.\('resize'/);
  assert.match(viewerSource, /orientationchange/);
});

test('fit to screen uses measured stage dimensions and handles common image shapes', () => {
  assert.equal(viewerModule.calculateFitScale(2000, 1000, 1000, 500), 0.5);
  assert.equal(viewerModule.calculateFitScale(1000, 2000, 500, 1000), 0.5);
  assert.equal(viewerModule.calculateFitScale(1200, 1200, 600, 600), 0.5);
  assert.equal(viewerModule.calculateFitScale(100, 100, 600, 400), 4);
});

test('zero pan means the image is centered in the measured stage', () => {
  [
    [100, 100, 4, 600, 400],
    [2000, 1000, 0.5, 1000, 500],
    [1000, 2000, 0.5, 500, 1000],
    [1600, 900, 1, 800, 600],
    [900, 1600, 1, 800, 600]
  ].forEach(([imageWidth, imageHeight, scale, stageWidth, stageHeight]) => {
    const box = viewerModule.calculateCenteredImageBox(imageWidth, imageHeight, scale, stageWidth, stageHeight, 0, 0);
    assert.equal(box.centerX, stageWidth / 2);
    assert.equal(box.centerY, stageHeight / 2);
  });

  const fitBox = viewerModule.calculateCenteredImageBox(100, 100, 4, 600, 400, 0, 0);
  assert.equal(fitBox.top, 0);
  assert.equal(fitBox.left, 100);
  assert.equal(600 - fitBox.left - fitBox.width, 100);

  const actualBox = viewerModule.calculateCenteredImageBox(1600, 900, 1, 800, 600, 0, 0);
  assert.equal(actualBox.left, -400);
  assert.equal(actualBox.top, -150);
  assert.equal(actualBox.centerX, 400);
  assert.equal(actualBox.centerY, 300);
});

test('viewer uses explicit center anchor layers so oversized source images stay centered', () => {
  assert.match(viewerSource, /panLayerNode = backdrop\.querySelector\('\[data-viewer-pan-layer\]'\)/);
  assert.match(viewerSource, /imageFrameNode = backdrop\.querySelector\('\[data-viewer-image-frame\]'\)/);
  assert.match(viewerSource, /panLayerNode\.style\.transform = `translate3d\(\$\{state\.panX\}px, \$\{state\.panY\}px, 0\)`/);
  assert.match(viewerSource, /imageNode\.style\.transform = `scale\(\$\{state\.scale\}\)`/);
  assert.match(viewerSource, /imageFrameNode\.style\.width = `\$\{imageNode\.naturalWidth\}px`/);
  assert.match(viewerSource, /imageFrameNode\.style\.height = `\$\{imageNode\.naturalHeight\}px`/);
  assert.doesNotMatch(viewerSource, /viewerDebug|data-viewer-debug|createViewerDebug|isViewerDebug/);

  const oversizedFit = viewerModule.calculateCenteredImageBox(1000, 1000, 0.605, 1203, 605, 0, 0);
  assert.equal(oversizedFit.centerX, 601.5);
  assert.equal(oversizedFit.centerY, 302.5);

  const oversizedActual = viewerModule.calculateCenteredImageBox(1000, 1000, 1, 1203, 605, 0, 0);
  assert.equal(oversizedActual.centerX, 601.5);
  assert.equal(oversizedActual.centerY, 302.5);

  const panned = viewerModule.calculateCenteredImageBox(1000, 1000, 0.605, 1203, 605, 80, -40);
  assert.equal(panned.centerX, 681.5);
  assert.equal(panned.centerY, 262.5);
});

test('viewer fit recalculates from the stage and remains distinct from 100 percent', () => {
  assert.match(viewerSource, /function applyFitToScreen\(\)/);
  assert.match(viewerSource, /stageNode\.getBoundingClientRect\(\)/);
  assert.match(viewerSource, /rect\.width - horizontalPadding/);
  assert.match(viewerSource, /rect\.height - verticalPadding/);
  assert.match(viewerSource, /state\.panX = 0;[\s\S]*state\.panY = 0;[\s\S]*state\.viewMode = 'fit';/);
  assert.match(viewerSource, /function onViewportResize\(\)[\s\S]*state\.viewMode === 'fit'[\s\S]*applyFitToScreen\(\)/);
  assert.match(viewerSource, /function navigate\(direction\)[\s\S]*resetViewState\('fit'\)/);
  assert.match(viewerSource, /function zoomToActualSize\(\)[\s\S]*setScale\(1, 'actual'\)/);
  assert.doesNotMatch(viewerSource, /window\.innerWidth|windowRef\.innerWidth|innerHeight/);
  assert.match(viewerSource, /state\.panX = 0;[\s\S]*state\.panY = 0;[\s\S]*setScale\(1, 'actual'\)/);
});

test('catalog viewer CSS covers the viewport and preserves touch pan pinch safety', () => {
  const imageRule = cssSource.match(/\.forge-catalog-image-viewer__image\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const canvasRule = cssSource.match(/\.forge-catalog-image-viewer__canvas\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(cssSource, /\.forge-catalog-image-viewer\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*10000;/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__stage\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*touch-action:\s*none;/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__stage\s*\{[\s\S]*--forge-viewer-stage-padding:\s*clamp\(14px,\s*2vw,\s*28px\);[\s\S]*position:\s*relative;/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__canvas\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*var\(--forge-viewer-stage-padding\);/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__center-anchor,[\s\S]*\.forge-catalog-image-viewer__pan-layer\s*\{[\s\S]*position:\s*absolute;[\s\S]*left:\s*50%;[\s\S]*top:\s*50%;/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__pan-layer\s*\{[\s\S]*left:\s*0;[\s\S]*top:\s*0;[\s\S]*transform:\s*translate3d\(0,\s*0,\s*0\);/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__image-frame\s*\{[\s\S]*position:\s*absolute;[\s\S]*left:\s*0;[\s\S]*top:\s*0;[\s\S]*transform:\s*translate\(-50%,\s*-50%\);/);
  assert.match(cssSource, /\.forge-catalog-image-viewer__image\s*\{[\s\S]*max-width:\s*none;[\s\S]*max-height:\s*none;[\s\S]*object-fit:\s*contain;[\s\S]*transform-origin:\s*center center;/);
  assert.doesNotMatch(imageRule, /(?:top|left):\s*0/);
  assert.doesNotMatch(canvasRule, /place-items:\s*center/);
  assert.doesNotMatch(cssSource, /forge-catalog-image-viewer__debug/);
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
