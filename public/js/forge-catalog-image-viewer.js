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

  function createCatalogImageViewer(options = {}) {
    const documentRef = options.document || (typeof document !== 'undefined' ? document : null);
    const windowRef = options.window || (typeof window !== 'undefined' ? window : null);
    const state = {
      items: [],
      index: 0,
      scale: 1,
      panX: 0,
      panY: 0,
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
      render();
      backdrop.hidden = false;
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
            <img class="forge-catalog-image-viewer__image" data-viewer-image alt="">
            <p class="forge-catalog-image-viewer__error" data-viewer-error hidden>Image could not be loaded.</p>
          </div>
          <p class="forge-catalog-image-viewer__status" aria-live="polite" data-viewer-status></p>
        </div>
      `;
      documentRef.body.appendChild(backdrop);
      dialog = backdrop.querySelector('.forge-catalog-image-viewer__dialog');
      imageNode = backdrop.querySelector('[data-viewer-image]');

      backdrop.addEventListener('click', onBackdropClick);
      backdrop.addEventListener('keydown', onKeyDown);
      backdrop.addEventListener('wheel', onWheel, { passive: false });
      imageNode?.addEventListener('load', onImageLoad);
      imageNode?.addEventListener('error', onImageError);
      const stage = backdrop.querySelector('[data-viewer-stage]');
      stage?.addEventListener('pointerdown', onPointerDown);
      stage?.addEventListener('pointermove', onPointerMove);
      stage?.addEventListener('pointerup', onPointerEnd);
      stage?.addEventListener('pointercancel', onPointerEnd);
      stage?.addEventListener('touchstart', onTouchStart, { passive: false });
      stage?.addEventListener('touchmove', onTouchMove, { passive: false });
      stage?.addEventListener('touchend', onTouchEnd);
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
      if (event.target === backdrop || event.target?.dataset?.viewerStage !== undefined) {
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
        resetViewState();
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
        resetViewState();
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
        setScale(state.pinchStartScale * (getTouchDistance(event.touches) / state.pinchStartDistance));
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
      resetViewState();
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
      resetViewState();
      render();
    }

    function zoomBy(factor) {
      setScale(state.scale * factor);
    }

    function setScale(nextScale) {
      state.scale = clamp(Number(nextScale) || 1, MIN_SCALE, MAX_SCALE);
      constrainPan();
      render();
    }

    function zoomToActualSize() {
      if (!imageNode || !imageNode.naturalWidth) {
        setScale(1);
        return;
      }
      const rect = imageNode.getBoundingClientRect();
      const displayedWidth = rect.width / Math.max(state.scale, 0.001);
      if (!displayedWidth) {
        setScale(1);
        return;
      }
      setScale(clamp(imageNode.naturalWidth / displayedWidth, MIN_SCALE, MAX_SCALE));
    }

    function panBy(deltaX, deltaY) {
      if (state.scale <= 1) {
        state.panX = 0;
        state.panY = 0;
      } else {
        state.panX += deltaX;
        state.panY += deltaY;
      }
      constrainPan();
      applyImageTransform();
    }

    function constrainPan() {
      if (!imageNode || state.scale <= 1) {
        state.panX = 0;
        state.panY = 0;
        return;
      }
      const rect = imageNode.getBoundingClientRect();
      const maxX = Math.max(0, rect.width * (state.scale - 1) / 2);
      const maxY = Math.max(0, rect.height * (state.scale - 1) / 2);
      state.panX = clamp(state.panX, -maxX, maxX);
      state.panY = clamp(state.panY, -maxY, maxY);
    }

    function applyImageTransform() {
      if (!imageNode) {
        return;
      }
      imageNode.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
    }

    function resetViewState() {
      state.scale = 1;
      state.panX = 0;
      state.panY = 0;
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    BODY_LOCK_CLASS,
    createCatalogImageViewer,
    normalizeViewerItem
  };
}));
