(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgeCatalogImageViewer = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 6;
  const SCALE_STEP = 1.25;
  const BODY_LOCK_CLASS = 'forge-catalog-image-viewer-open';
  const PINTEREST_NOPIN_IMAGE_ATTRIBUTES = ' nopin="nopin" data-pin-nopin="true"';

  function createCatalogImageViewer(options = {}) {
    const documentRef = options.document || (typeof document !== 'undefined' ? document : null);
    const windowRef = options.window || (typeof window !== 'undefined' ? window : null);
    const state = {
      items: [],
      index: 0,
      scale: 1,
      panX: 0,
      panY: 0,
      viewMode: 'fit',
      opener: null,
      open: false,
      loadFailed: false,
      activePointers: new Map(),
      lastPanPoint: null,
      pinchStartDistance: 0,
      pinchStartScale: 1
    };
    let backdrop = null;
    let dialog = null;
    let imageNode = null;
    let stageNode = null;
    let canvasNode = null;
    let panLayerNode = null;
    let imageFrameNode = null;
    let lastBodyOverflow = '';

    function openViewer(config = {}) {
      ensureDom();
      const usableItems = Array.isArray(config.items)
        ? config.items.map(normalizeViewerItem).filter((item) => item.id && item.src)
        : [];
      if (!usableItems.length) {
        return false;
      }

      const requestedId = String(config.selectedId || '').trim();
      const nextIndex = Math.max(0, usableItems.findIndex((item) => item.id === requestedId));
      state.items = usableItems;
      state.index = nextIndex;
      state.opener = config.opener || documentRef?.activeElement || null;
      state.open = true;
      resetViewState();
      lockBodyScroll();
      backdrop.hidden = false;
      render();
      if (imageNode?.naturalWidth && imageNode?.naturalHeight) {
        applyFitToScreen();
        render();
      }
      dialog?.focus({ preventScroll: true });
      return true;
    }

    function closeViewer() {
      if (!state.open) {
        return;
      }
      state.open = false;
      state.activePointers.clear();
      unlockBodyScroll();
      if (backdrop) {
        backdrop.hidden = true;
      }
      const opener = state.opener;
      state.opener = null;
      if (opener && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    }

    function ensureDom() {
      if (!documentRef || backdrop) {
        return;
      }
      backdrop = documentRef.createElement('div');
      backdrop.className = 'forge-catalog-image-viewer';
      backdrop.hidden = true;
      backdrop.innerHTML = `
        <div class="forge-catalog-image-viewer__dialog" role="dialog" aria-modal="true" aria-labelledby="forge-catalog-image-viewer-title" aria-describedby="forge-catalog-image-viewer-meta" tabindex="-1">
          <div class="forge-catalog-image-viewer__chrome">
            <div class="forge-catalog-image-viewer__heading">
              <p class="forge-catalog-image-viewer__eyebrow" data-viewer-type></p>
              <h2 id="forge-catalog-image-viewer-title" data-viewer-title></h2>
              <p id="forge-catalog-image-viewer-meta" class="forge-catalog-image-viewer__meta" data-viewer-meta></p>
            </div>
            <div class="forge-catalog-image-viewer__controls" role="toolbar" aria-label="Image viewer controls">
              <button class="secondary-button" type="button" data-viewer-action="previous">Previous</button>
              <button class="secondary-button" type="button" data-viewer-action="next">Next</button>
              <button class="secondary-button" type="button" data-viewer-action="zoom-out">Zoom Out</button>
              <button class="secondary-button" type="button" data-viewer-action="zoom-in">Zoom In</button>
              <button class="secondary-button" type="button" data-viewer-action="fit">Fit to Screen</button>
              <button class="secondary-button" type="button" data-viewer-action="actual">100%</button>
              <button class="primary-button" type="button" data-viewer-action="close">Close</button>
            </div>
          </div>
          <div class="forge-catalog-image-viewer__stage" data-viewer-stage>
            <div class="forge-catalog-image-viewer__canvas" data-viewer-canvas>
              <div class="forge-catalog-image-viewer__center-anchor" data-viewer-center-anchor>
                <div class="forge-catalog-image-viewer__pan-layer" data-viewer-pan-layer>
                  <div class="forge-catalog-image-viewer__image-frame" data-viewer-image-frame>
                    <img class="forge-catalog-image-viewer__image" data-viewer-image alt=""${PINTEREST_NOPIN_IMAGE_ATTRIBUTES}>
                  </div>
                </div>
              </div>
            </div>
            <p class="forge-catalog-image-viewer__error" data-viewer-error hidden>Image could not be loaded.</p>
          </div>
          <p class="forge-catalog-image-viewer__status" aria-live="polite" data-viewer-status></p>
        </div>
      `;
      documentRef.body.appendChild(backdrop);
      dialog = backdrop.querySelector('.forge-catalog-image-viewer__dialog');
      imageNode = backdrop.querySelector('[data-viewer-image]');
      stageNode = backdrop.querySelector('[data-viewer-stage]');
      canvasNode = backdrop.querySelector('[data-viewer-canvas]');
      panLayerNode = backdrop.querySelector('[data-viewer-pan-layer]');
      imageFrameNode = backdrop.querySelector('[data-viewer-image-frame]');

      backdrop.addEventListener('click', onBackdropClick);
      backdrop.addEventListener('keydown', onKeyDown);
      backdrop.addEventListener('wheel', onWheel, { passive: false });
      windowRef?.addEventListener?.('resize', onViewportResize);
      windowRef?.addEventListener?.('orientationchange', onViewportResize);
      imageNode?.addEventListener('load', onImageLoad);
      imageNode?.addEventListener('error', onImageError);
      stageNode?.addEventListener('pointerdown', onPointerDown);
      stageNode?.addEventListener('pointermove', onPointerMove);
      stageNode?.addEventListener('pointerup', onPointerEnd);
      stageNode?.addEventListener('pointercancel', onPointerEnd);
      stageNode?.addEventListener('touchstart', onTouchStart, { passive: false });
      stageNode?.addEventListener('touchmove', onTouchMove, { passive: false });
      stageNode?.addEventListener('touchend', onTouchEnd);
    }

    function render() {
      if (!backdrop || !state.open) {
        return;
      }
      const item = getCurrentItem();
      if (!item) {
        closeViewer();
        return;
      }
      backdrop.querySelector('[data-viewer-type]').textContent = item.typeLabel;
      backdrop.querySelector('[data-viewer-title]').textContent = item.name;
      backdrop.querySelector('[data-viewer-meta]').textContent = item.metadata;
      backdrop.querySelector('[data-viewer-status]').textContent = `${state.index + 1} of ${state.items.length}. ${Math.round(state.scale * 100)}%.`;
      const previousButton = backdrop.querySelector('[data-viewer-action="previous"]');
      const nextButton = backdrop.querySelector('[data-viewer-action="next"]');
      if (previousButton) {
        previousButton.disabled = state.index <= 0;
      }
      if (nextButton) {
        nextButton.disabled = state.index >= state.items.length - 1;
      }
      const errorNode = backdrop.querySelector('[data-viewer-error]');
      if (errorNode) {
        errorNode.hidden = !state.loadFailed;
      }
      if (imageNode && imageNode.getAttribute('src') !== item.src) {
        state.loadFailed = false;
        imageNode.hidden = false;
        imageNode.src = item.src;
        imageNode.alt = item.alt || `${item.name} image`;
      }
      applyImageTransform();
    }

    function onBackdropClick(event) {
      const action = event.target.closest('[data-viewer-action]')?.dataset.viewerAction;
      if (action) {
        event.preventDefault();
        handleAction(action);
        return;
      }
      if (
        event.target === backdrop ||
        event.target?.dataset?.viewerStage !== undefined ||
        event.target?.dataset?.viewerCanvas !== undefined
      ) {
        closeViewer();
      }
    }

    function handleAction(action) {
      if (action === 'close') {
        closeViewer();
      } else if (action === 'previous') {
        navigate(-1);
      } else if (action === 'next') {
        navigate(1);
      } else if (action === 'zoom-in') {
        zoomBy(SCALE_STEP);
      } else if (action === 'zoom-out') {
        zoomBy(1 / SCALE_STEP);
      } else if (action === 'fit') {
        applyFitToScreen();
        render();
      } else if (action === 'actual') {
        zoomToActualSize();
      }
    }

    function onKeyDown(event) {
      if (!state.open) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeViewer();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigate(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(SCALE_STEP);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomBy(1 / SCALE_STEP);
      } else if (event.key === '0') {
        event.preventDefault();
        applyFitToScreen();
        render();
      } else if (event.key === 'Tab') {
        trapFocus(event);
      }
    }

    function onWheel(event) {
      if (!state.open || !event.target.closest('.forge-catalog-image-viewer__dialog')) {
        return;
      }
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
    }

    function onViewportResize() {
      if (!state.open || !imageNode || !imageNode.naturalWidth) {
        return;
      }
      if (state.viewMode === 'fit') {
        applyFitToScreen();
        render();
        return;
      }
      constrainPan();
      render();
    }

    function onPointerDown(event) {
      if (!state.open || event.pointerType === 'touch') {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      state.lastPanPoint = { x: event.clientX, y: event.clientY };
    }

    function onPointerMove(event) {
      if (!state.open || event.pointerType === 'touch' || !state.activePointers.has(event.pointerId)) {
        return;
      }
      event.preventDefault();
      panBy(event.clientX - state.lastPanPoint.x, event.clientY - state.lastPanPoint.y);
      state.lastPanPoint = { x: event.clientX, y: event.clientY };
    }

    function onPointerEnd(event) {
      state.activePointers.delete(event.pointerId);
      state.lastPanPoint = null;
    }

    function onTouchStart(event) {
      if (!state.open) {
        return;
      }
      if (event.touches.length === 1) {
        state.lastPanPoint = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      } else if (event.touches.length === 2) {
        event.preventDefault();
        state.pinchStartDistance = getTouchDistance(event.touches);
        state.pinchStartScale = state.scale;
      }
    }

    function onTouchMove(event) {
      if (!state.open) {
        return;
      }
      if (event.touches.length === 2 && state.pinchStartDistance > 0) {
        event.preventDefault();
        setScale(state.pinchStartScale * (getTouchDistance(event.touches) / state.pinchStartDistance), 'manual');
      } else if (event.touches.length === 1 && state.lastPanPoint) {
        event.preventDefault();
        const touch = event.touches[0];
        panBy(touch.clientX - state.lastPanPoint.x, touch.clientY - state.lastPanPoint.y);
        state.lastPanPoint = { x: touch.clientX, y: touch.clientY };
      }
    }

    function onTouchEnd() {
      if (!state.open) {
        return;
      }
      state.lastPanPoint = null;
      state.pinchStartDistance = 0;
    }

    function onImageLoad() {
      state.loadFailed = false;
      setImageNaturalSize();
      applyFitToScreen();
      render();
    }

    function onImageError() {
      state.loadFailed = true;
      if (imageNode) {
        imageNode.hidden = true;
      }
      render();
    }

    function navigate(direction) {
      const nextIndex = state.index + direction;
      if (nextIndex < 0 || nextIndex >= state.items.length) {
        return;
      }
      state.index = nextIndex;
      resetViewState('fit');
      render();
    }

    function zoomBy(factor) {
      setScale(state.scale * factor, 'manual');
    }

    function setScale(nextScale, mode = 'manual') {
      state.scale = clamp(Number(nextScale) || 1, MIN_SCALE, MAX_SCALE);
      state.viewMode = mode;
      constrainPan();
      render();
    }

    function zoomToActualSize() {
      if (!imageNode || !imageNode.naturalWidth || !imageNode.naturalHeight) {
        setScale(1, 'actual');
        return;
      }
      setImageNaturalSize();
      state.panX = 0;
      state.panY = 0;
      setScale(1, 'actual');
    }

    function panBy(deltaX, deltaY) {
      state.panX += deltaX;
      state.panY += deltaY;
      constrainPan();
      applyImageTransform();
    }

    function constrainPan() {
      if (!imageNode || !stageNode) {
        state.panX = 0;
        state.panY = 0;
        return;
      }
      const stageSize = getUsableStageSize();
      const imageWidth = Number(imageNode.naturalWidth || 0) * state.scale;
      const imageHeight = Number(imageNode.naturalHeight || 0) * state.scale;
      const maxX = Math.max(0, (imageWidth - stageSize.width) / 2);
      const maxY = Math.max(0, (imageHeight - stageSize.height) / 2);
      state.panX = clamp(state.panX, -maxX, maxX);
      state.panY = clamp(state.panY, -maxY, maxY);
    }

    function applyImageTransform() {
      if (!imageNode || !panLayerNode) {
        return;
      }
      panLayerNode.style.transform = `translate3d(${state.panX}px, ${state.panY}px, 0)`;
      imageNode.style.transform = `scale(${state.scale})`;
    }

    function applyFitToScreen() {
      if (!imageNode || !imageNode.naturalWidth || !imageNode.naturalHeight) {
        resetViewState('fit');
        return;
      }
      setImageNaturalSize();
      const stageSize = getUsableStageSize();
      state.scale = calculateFitScale(
        Number(imageNode.naturalWidth),
        Number(imageNode.naturalHeight),
        stageSize.width,
        stageSize.height
      );
      state.panX = 0;
      state.panY = 0;
      state.viewMode = 'fit';
    }

    function setImageNaturalSize() {
      if (!imageNode || !imageNode.naturalWidth || !imageNode.naturalHeight) {
        return;
      }
      if (imageFrameNode) {
        imageFrameNode.style.width = `${imageNode.naturalWidth}px`;
        imageFrameNode.style.height = `${imageNode.naturalHeight}px`;
      }
    }

    function getUsableStageSize() {
      if (!stageNode || typeof stageNode.getBoundingClientRect !== 'function') {
        return { width: 1, height: 1 };
      }
      const rect = stageNode.getBoundingClientRect();
      const styles = windowRef?.getComputedStyle ? windowRef.getComputedStyle(stageNode) : null;
      const horizontalPadding = parseCssPixels(styles?.paddingLeft) + parseCssPixels(styles?.paddingRight);
      const verticalPadding = parseCssPixels(styles?.paddingTop) + parseCssPixels(styles?.paddingBottom);
      return {
        width: Math.max(1, rect.width - horizontalPadding),
        height: Math.max(1, rect.height - verticalPadding)
      };
    }

    function resetViewState(mode = 'fit') {
      state.scale = 1;
      state.panX = 0;
      state.panY = 0;
      state.viewMode = mode;
      state.lastPanPoint = null;
      state.pinchStartDistance = 0;
      state.pinchStartScale = 1;
      state.loadFailed = false;
    }

    function trapFocus(event) {
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function lockBodyScroll() {
      if (!documentRef?.body) {
        return;
      }
      lastBodyOverflow = documentRef.body.style.overflow || '';
      documentRef.body.classList.add(BODY_LOCK_CLASS);
      documentRef.body.style.overflow = 'hidden';
    }

    function unlockBodyScroll() {
      if (!documentRef?.body) {
        return;
      }
      documentRef.body.classList.remove(BODY_LOCK_CLASS);
      documentRef.body.style.overflow = lastBodyOverflow;
    }

    function getCurrentItem() {
      return state.items[state.index] || null;
    }

    return {
      open: openViewer,
      close: closeViewer,
      isOpen() {
        return state.open;
      },
      getState() {
        return {
          open: state.open,
          index: state.index,
          scale: state.scale,
          panX: state.panX,
          panY: state.panY,
          viewMode: state.viewMode,
          itemCount: state.items.length
        };
      }
    };
  }

  function normalizeViewerItem(item) {
    const normalized = item && typeof item === 'object' ? item : {};
    return {
      id: normalizeString(normalized.id),
      typeLabel: normalizeString(normalized.typeLabel) || 'Catalog Image',
      name: normalizeString(normalized.name) || 'Catalog item',
      metadata: normalizeString(normalized.metadata),
      src: normalizeString(normalized.src),
      alt: normalizeString(normalized.alt)
    };
  }

  function getTouchDistance(touches) {
    const left = touches[0];
    const right = touches[1];
    return Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);
  }

  function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function calculateFitScale(imageWidth, imageHeight, stageWidth, stageHeight) {
    const safeImageWidth = Number(imageWidth) || 0;
    const safeImageHeight = Number(imageHeight) || 0;
    const safeStageWidth = Number(stageWidth) || 0;
    const safeStageHeight = Number(stageHeight) || 0;
    if (safeImageWidth <= 0 || safeImageHeight <= 0 || safeStageWidth <= 0 || safeStageHeight <= 0) {
      return 1;
    }
    return clamp(Math.min(safeStageWidth / safeImageWidth, safeStageHeight / safeImageHeight), MIN_SCALE, MAX_SCALE);
  }

  function calculateCenteredImageBox(imageWidth, imageHeight, scale, stageWidth, stageHeight, panX = 0, panY = 0) {
    const renderedWidth = Math.max(0, (Number(imageWidth) || 0) * (Number(scale) || 0));
    const renderedHeight = Math.max(0, (Number(imageHeight) || 0) * (Number(scale) || 0));
    const safeStageWidth = Math.max(0, Number(stageWidth) || 0);
    const safeStageHeight = Math.max(0, Number(stageHeight) || 0);
    const safePanX = Number(panX) || 0;
    const safePanY = Number(panY) || 0;
    const left = ((safeStageWidth - renderedWidth) / 2) + safePanX;
    const top = ((safeStageHeight - renderedHeight) / 2) + safePanY;
    return {
      left,
      top,
      width: renderedWidth,
      height: renderedHeight,
      centerX: left + (renderedWidth / 2),
      centerY: top + (renderedHeight / 2)
    };
  }

  function parseCssPixels(value) {
    const parsed = Number.parseFloat(String(value || '0'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    BODY_LOCK_CLASS,
    calculateCenteredImageBox,
    calculateFitScale,
    createCatalogImageViewer,
    normalizeViewerItem
  };
}));
