import { shallowRef } from "vue";
import {
  isPrimaryPointerMoveEvent,
  isSamePointerEvent,
  samplePointerVelocity,
} from "./useLaunchpadDrag.js";

const DESKTOP_SURFACE_IGNORED_SELECTOR = [
  ".page-dot",
  ".search-pill",
  ".settings-overlay",
  ".scan-result-overlay",
  ".app-edit-overlay",
  ".icon-chooser-overlay",
  ".warning-dialog-overlay",
  ".icon-context-menu-layer",
  "button",
  "input",
  "textarea",
  "select",
].join(", ");

const SURFACE_PAGE_PAN_THRESHOLD = 12;
const SURFACE_PAGE_PAN_DOMINANCE = 1.15;
const SURFACE_PAGE_PAN_COMMIT_PROGRESS = 0.35;
const SURFACE_PAGE_PAN_COMMIT_VELOCITY = 0.45;
const SURFACE_PAGE_PAN_EDGE_RESISTANCE = 0.42;
const SURFACE_PAGE_PAN_EDGE_MAX_PROGRESS = 0.36;
const SURFACE_PAGE_TRACK_SETTLE_CLEAR_MS = 720;

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, readNumber(value, 0)));
}

function readPointerTime(event) {
  const time = Number(event?.timeStamp);
  if (Number.isFinite(time) && time > 0) return time;
  return globalThis.performance?.now?.() || Date.now();
}

export function useLaunchpadSurfaceInteractions(options) {
  const pageTrackScrub = shallowRef(null);
  const folderPageTrackScrub = shallowRef(null);
  let surfacePagePan = null;
  let folderPagePan = null;
  let surfacePagePanSettleTimer = 0;
  let folderPagePanSettleTimer = 0;
  let surfacePagePanGestureToken = 0;
  let folderPagePanGestureToken = 0;
  let surfacePagePanSettleToken = 0;
  let folderPagePanSettleToken = 0;

  function setPageRef(node, targetPageIndex) {
    if (!node) return;
    options.pageRefs[targetPageIndex] = node.$el || node;
  }

  function setFolderPageRef(node, targetPageIndex) {
    if (!node) return;
    options.folderPageRefs[targetPageIndex] = node.$el || node;
  }

  function getEventTarget() {
    return options.eventTarget || globalThis.window;
  }

  function clearPageTrackScrubLater() {
    const eventTarget = getEventTarget();
    if (surfacePagePanSettleTimer) eventTarget?.clearTimeout?.(surfacePagePanSettleTimer);
    surfacePagePanSettleTimer = eventTarget?.setTimeout?.(() => {
      surfacePagePanSettleTimer = 0;
      pageTrackScrub.value = null;
    }, SURFACE_PAGE_TRACK_SETTLE_CLEAR_MS) || 0;
  }

  function cancelPageTrackScrubClearTimer() {
    const eventTarget = getEventTarget();
    if (surfacePagePanSettleTimer) eventTarget?.clearTimeout?.(surfacePagePanSettleTimer);
    surfacePagePanSettleTimer = 0;
  }

  function clearPageTrackScrubNow() {
    cancelPageTrackScrubClearTimer();
    pageTrackScrub.value = null;
  }

  function clearFolderPageTrackScrubLater() {
    const eventTarget = getEventTarget();
    if (folderPagePanSettleTimer) eventTarget?.clearTimeout?.(folderPagePanSettleTimer);
    folderPagePanSettleTimer = eventTarget?.setTimeout?.(() => {
      folderPagePanSettleTimer = 0;
      folderPageTrackScrub.value = null;
    }, SURFACE_PAGE_TRACK_SETTLE_CLEAR_MS) || 0;
  }

  function cancelFolderPageTrackScrubClearTimer() {
    const eventTarget = getEventTarget();
    if (folderPagePanSettleTimer) eventTarget?.clearTimeout?.(folderPagePanSettleTimer);
    folderPagePanSettleTimer = 0;
  }

  function clearFolderPageTrackScrubNow() {
    cancelFolderPageTrackScrubClearTimer();
    folderPageTrackScrub.value = null;
  }

  function getPagePanWidth(pageIndex) {
    const pageRef = options.pageRefs?.[pageIndex];
    const rect = pageRef?.getBoundingClientRect?.();
    return Math.max(1, readNumber(rect?.width, readNumber(options.rootRef?.value?.getBoundingClientRect?.().width, globalThis.innerWidth || 1)));
  }

  function getFolderPagePanWidth(pageIndex) {
    const pageRef = options.folderPageRefs?.[pageIndex] || options.folderViewportRef?.value || options.folderPanelRef?.value;
    const rect = pageRef?.getBoundingClientRect?.();
    return Math.max(1, readNumber(rect?.width, readNumber(options.rootRef?.value?.getBoundingClientRect?.().width, globalThis.innerWidth || 1)));
  }

  function canStartSurfacePagePan(event) {
    if (options.openFolderId?.value || options.renderedFolder?.value) return false;
    if (options.isSearchMode?.value) return false;
    const pages = options.activePages?.value || [];
    if (pages.length <= 1) return false;
    return true;
  }

  function getSurfaceIconTarget(event, targetOptions = undefined) {
    if (typeof options.getDesktopTargetAtPoint !== "function") return null;
    return options.getDesktopTargetAtPoint(event.clientX, event.clientY, targetOptions) || null;
  }

  function isDesktopFolderTarget(target) {
    return Boolean(
      target?.id &&
        target?.meta?.area === "desktop" &&
        target?.meta?.item?.type === "folder"
    );
  }

  function handleFolderClosingDesktopPointerDown(event) {
    if (event.target?.closest?.(DESKTOP_SURFACE_IGNORED_SELECTOR)) return false;
    const iconTarget = getSurfaceIconTarget(event, { area: "desktop" });
    if (!isDesktopFolderTarget(iconTarget)) return false;
    clearFolderPageTrackScrubNow();
    clearPageTrackScrubNow();
    event.preventDefault?.();
    event.stopPropagation?.();
    options.commitOpenFolder?.(iconTarget.id);
    return true;
  }

  function isSettlingPageScrub(scrub) {
    return scrub?.settle === true || scrub?.settling === true || scrub?.phase === "settle";
  }

  function getRouteDirection(fromIndex, toIndex) {
    return toIndex >= fromIndex ? 1 : -1;
  }

  function rubberBandProgress(rawProgress) {
    return Math.min(SURFACE_PAGE_PAN_EDGE_MAX_PROGRESS, Math.max(0, rawProgress) * SURFACE_PAGE_PAN_EDGE_RESISTANCE);
  }

  function makeGrabRoute(scrub, pageCount) {
    if (!isSettlingPageScrub(scrub)) return null;
    const fromIndex = readNumber(scrub.fromIndex, Number.NaN);
    const toIndex = readNumber(scrub.toIndex, Number.NaN);
    if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex === toIndex) return null;
    return {
      edge: toIndex < 0 || toIndex >= pageCount,
      fromIndex,
      initialTargetProgress: clamp01(scrub.targetProgress ?? scrub.settleProgress ?? 0),
      routeDirection: getRouteDirection(fromIndex, toIndex),
      toIndex,
    };
  }

  function getFolderIconTarget(event) {
    if (typeof options.getDesktopTargetAtPoint !== "function") return null;
    const folderId = options.renderedFolder?.value?.id || options.openFolderId?.value || null;
    const target = options.getDesktopTargetAtPoint(event.clientX, event.clientY, {
      area: "folder",
      folderId,
    });
    return target?.meta?.area === "folder" ? target : null;
  }

  function beginSurfacePagePan(event) {
    const pageCount = Math.max(0, (options.activePages?.value || []).length);
    const grabRoute = makeGrabRoute(pageTrackScrub.value, pageCount);
    const fromIndex = grabRoute?.fromIndex ?? Math.max(0, readNumber(options.activePageIndex?.value, 0));
    cancelPageTrackScrubClearTimer();
    surfacePagePan = {
      active: false,
      edge: grabRoute?.edge === true,
      fromIndex,
      grab: Boolean(grabRoute),
      grabToken: grabRoute ? `surface-page-pan-grab:${++surfacePagePanGestureToken}` : null,
      initialTargetProgress: grabRoute?.initialTargetProgress ?? null,
      pageCount,
      pageWidth: getPagePanWidth(fromIndex),
      pointerId: event.pointerId,
      routeDirection: grabRoute?.routeDirection ?? 0,
      sample: {
        pointer: { x: readNumber(event.clientX), y: readNumber(event.clientY) },
        time: readPointerTime(event),
        velocity: { x: 0, y: 0 },
      },
      startX: readNumber(event.clientX),
      startY: readNumber(event.clientY),
      suppressClick: false,
      toIndex: grabRoute?.toIndex ?? fromIndex,
    };

    const eventTarget = getEventTarget();
    eventTarget?.addEventListener?.("pointermove", updateSurfacePagePan, { passive: false });
    eventTarget?.addEventListener?.("pointerup", finishSurfacePagePan);
    eventTarget?.addEventListener?.("pointercancel", cancelSurfacePagePan);
  }

  function beginFolderPagePan(event) {
    const pageCount = Math.max(0, (options.folderPages?.value || []).length);
    const grabRoute = makeGrabRoute(folderPageTrackScrub.value, pageCount);
    const fromIndex = grabRoute?.fromIndex ?? Math.max(0, readNumber(options.folderPageIndex?.value, 0));
    cancelFolderPageTrackScrubClearTimer();
    folderPagePan = {
      active: false,
      edge: grabRoute?.edge === true,
      fromIndex,
      grab: Boolean(grabRoute),
      grabToken: grabRoute ? `folder-page-pan-grab:${++folderPagePanGestureToken}` : null,
      initialTargetProgress: grabRoute?.initialTargetProgress ?? null,
      pageCount,
      pageWidth: getFolderPagePanWidth(fromIndex),
      pointerId: event.pointerId,
      routeDirection: grabRoute?.routeDirection ?? 0,
      sample: {
        pointer: { x: readNumber(event.clientX), y: readNumber(event.clientY) },
        time: readPointerTime(event),
        velocity: { x: 0, y: 0 },
      },
      startX: readNumber(event.clientX),
      startY: readNumber(event.clientY),
      suppressClick: false,
      toIndex: grabRoute?.toIndex ?? fromIndex,
    };

    const eventTarget = getEventTarget();
    eventTarget?.addEventListener?.("pointermove", updateFolderPagePan, { passive: false });
    eventTarget?.addEventListener?.("pointerup", finishFolderPagePan);
    eventTarget?.addEventListener?.("pointercancel", cancelFolderPagePan);
  }

  function detachSurfacePagePanListeners() {
    const eventTarget = getEventTarget();
    eventTarget?.removeEventListener?.("pointermove", updateSurfacePagePan);
    eventTarget?.removeEventListener?.("pointerup", finishSurfacePagePan);
    eventTarget?.removeEventListener?.("pointercancel", cancelSurfacePagePan);
  }

  function detachFolderPagePanListeners() {
    const eventTarget = getEventTarget();
    eventTarget?.removeEventListener?.("pointermove", updateFolderPagePan);
    eventTarget?.removeEventListener?.("pointerup", finishFolderPagePan);
    eventTarget?.removeEventListener?.("pointercancel", cancelFolderPagePan);
  }

  function resolvePanTarget(pan, dx) {
    if (pan.grab) {
      return {
        direction: pan.routeDirection,
        edge: pan.edge === true,
        grab: true,
        toIndex: pan.toIndex,
      };
    }
    const direction = dx < 0 ? 1 : -1;
    const toIndex = pan.fromIndex + direction;
    return {
      direction,
      edge: toIndex < 0 || toIndex >= pan.pageCount,
      toIndex,
    };
  }

  function getPanProgress(pan, target, dx) {
    if (target.grab) return null;
    const rawProgress = Math.abs(dx) / pan.pageWidth;
    return target.edge ? rubberBandProgress(rawProgress) : clamp01(rawProgress);
  }

  function getPanProgressDelta(pan, dx) {
    return (-readNumber(dx, 0) * pan.routeDirection) / pan.pageWidth;
  }

  function resolveTargetProgress(pan, progress, progressVelocity) {
    if (pan.edge) return 0;
    if (pan.grab) {
      if (progress >= SURFACE_PAGE_PAN_COMMIT_PROGRESS || progressVelocity >= SURFACE_PAGE_PAN_COMMIT_VELOCITY) return 1;
      if (progress <= -SURFACE_PAGE_PAN_COMMIT_PROGRESS || progressVelocity <= -SURFACE_PAGE_PAN_COMMIT_VELOCITY) return 0;
      return pan.initialTargetProgress ?? 0;
    }
    return progress >= SURFACE_PAGE_PAN_COMMIT_PROGRESS ||
      progressVelocity >= SURFACE_PAGE_PAN_COMMIT_VELOCITY
      ? 1
      : 0;
  }

  function makeScrubState(pan, target, progress, extra = {}) {
    return {
      fromIndex: pan.fromIndex,
      grab: pan.grab || undefined,
      grabToken: pan.grabToken || undefined,
      progress: pan.grab ? 0 : progress,
      progressDelta: pan.grab ? progress : undefined,
      toIndex: target.toIndex,
      ...extra,
    };
  }

  function applySurfacePagePanProgress(event, pan, target, progress) {
    pan.active = true;
    pan.edge = target.edge === true;
    pan.direction = target.direction;
    pan.routeDirection = target.direction;
    pan.toIndex = target.toIndex;
    pageTrackScrub.value = makeScrubState(pan, target, progress);
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function applyFolderPagePanProgress(event, pan, target, progress) {
    pan.active = true;
    pan.edge = target.edge === true;
    pan.direction = target.direction;
    pan.routeDirection = target.direction;
    pan.toIndex = target.toIndex;
    folderPageTrackScrub.value = makeScrubState(pan, target, progress);
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function updateSurfacePagePan(event) {
    const pan = surfacePagePan;
    if (!pan || !isSamePointerEvent(pan.pointerId, event) || !isPrimaryPointerMoveEvent(event)) return;
    const dx = readNumber(event.clientX) - pan.startX;
    const dy = readNumber(event.clientY) - pan.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    pan.sample = samplePointerVelocity(pan.sample, event);

    if (!pan.active) {
      if (absX < SURFACE_PAGE_PAN_THRESHOLD && absY < SURFACE_PAGE_PAN_THRESHOLD) return;
      pan.suppressClick = true;
      if (absX < SURFACE_PAGE_PAN_THRESHOLD || absX < absY * SURFACE_PAGE_PAN_DOMINANCE) return;
    }

    const target = resolvePanTarget(pan, dx);
    applySurfacePagePanProgress(event, pan, target, target.grab ? getPanProgressDelta(pan, dx) : getPanProgress(pan, target, dx));
  }

  function updateFolderPagePan(event) {
    const pan = folderPagePan;
    if (!pan || !isSamePointerEvent(pan.pointerId, event) || !isPrimaryPointerMoveEvent(event)) return;
    const dx = readNumber(event.clientX) - pan.startX;
    const dy = readNumber(event.clientY) - pan.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    pan.sample = samplePointerVelocity(pan.sample, event);

    if (!pan.active) {
      if (absX < SURFACE_PAGE_PAN_THRESHOLD && absY < SURFACE_PAGE_PAN_THRESHOLD) return;
      pan.suppressClick = true;
      if (absX < SURFACE_PAGE_PAN_THRESHOLD || absX < absY * SURFACE_PAGE_PAN_DOMINANCE) return;
    }

    const target = resolvePanTarget(pan, dx);
    applyFolderPagePanProgress(event, pan, target, target.grab ? getPanProgressDelta(pan, dx) : getPanProgress(pan, target, dx));
  }

  function finishSurfacePagePan(event) {
    const pan = surfacePagePan;
    if (!pan || !isSamePointerEvent(pan.pointerId, event)) return;
    detachSurfacePagePanListeners();
    surfacePagePan = null;
    if (pan.active) {
      pan.sample = samplePointerVelocity(pan.sample, event);
      const dx = readNumber(event.clientX) - pan.startX;
      const target = {
        direction: pan.routeDirection,
        edge: pan.edge === true,
        grab: pan.grab === true,
        toIndex: pan.toIndex,
      };
      const progress = pan.grab ? getPanProgressDelta(pan, dx) : getPanProgress(pan, target, dx);
      const progressVelocity = -pan.routeDirection * readNumber(pan.sample.velocity?.x, 0) / pan.pageWidth;
      const targetProgress = resolveTargetProgress(pan, progress, progressVelocity);
      const commitIndex = targetProgress === 1 && !pan.edge ? pan.toIndex : pan.fromIndex;
      pageTrackScrub.value = makeScrubState(pan, target, progress, {
        settle: true,
        settleToken: `surface-page-pan:${++surfacePagePanSettleToken}`,
        targetProgress,
        velocity: progressVelocity,
      });
      options.commitActivePageIndex?.(commitIndex);
      clearPageTrackScrubLater();
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    clearPageTrackScrubNow();
    if (pan.suppressClick) return;
    closeDesktopFromSurface();
  }

  function cancelSurfacePagePan(event) {
    const pan = surfacePagePan;
    if (!pan || !isSamePointerEvent(pan.pointerId, event)) return;
    detachSurfacePagePanListeners();
    surfacePagePan = null;
    if (pan.active) {
      const dx = readNumber(event.clientX) - pan.startX;
      const target = {
        direction: pan.routeDirection,
        edge: pan.edge === true,
        grab: pan.grab === true,
        toIndex: pan.toIndex,
      };
      const progress = pan.grab ? getPanProgressDelta(pan, dx) : getPanProgress(pan, target, dx);
      pageTrackScrub.value = makeScrubState(pan, target, progress, {
        settle: true,
        settleToken: `surface-page-pan:${++surfacePagePanSettleToken}`,
        targetProgress: 0,
        velocity: 0,
      });
      clearPageTrackScrubLater();
    } else {
      clearPageTrackScrubNow();
    }
  }

  function finishFolderPagePan(event) {
    const pan = folderPagePan;
    if (!pan || !isSamePointerEvent(pan.pointerId, event)) return;
    detachFolderPagePanListeners();
    folderPagePan = null;
    if (pan.active) {
      pan.sample = samplePointerVelocity(pan.sample, event);
      const dx = readNumber(event.clientX) - pan.startX;
      const target = {
        direction: pan.routeDirection,
        edge: pan.edge === true,
        grab: pan.grab === true,
        toIndex: pan.toIndex,
      };
      const progress = pan.grab ? getPanProgressDelta(pan, dx) : getPanProgress(pan, target, dx);
      const progressVelocity = -pan.routeDirection * readNumber(pan.sample.velocity?.x, 0) / pan.pageWidth;
      const targetProgress = resolveTargetProgress(pan, progress, progressVelocity);
      const commitIndex = targetProgress === 1 && !pan.edge ? pan.toIndex : pan.fromIndex;
      folderPageTrackScrub.value = makeScrubState(pan, target, progress, {
        settle: true,
        settleToken: `folder-page-pan:${++folderPagePanSettleToken}`,
        targetProgress,
        velocity: progressVelocity,
      });
      options.commitFolderPageIndex?.(commitIndex);
      clearFolderPageTrackScrubLater();
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    clearFolderPageTrackScrubNow();
  }

  function cancelFolderPagePan(event) {
    const pan = folderPagePan;
    if (!pan || !isSamePointerEvent(pan.pointerId, event)) return;
    detachFolderPagePanListeners();
    folderPagePan = null;
    if (pan.active) {
      const dx = readNumber(event.clientX) - pan.startX;
      const target = {
        direction: pan.routeDirection,
        edge: pan.edge === true,
        grab: pan.grab === true,
        toIndex: pan.toIndex,
      };
      const progress = pan.grab ? getPanProgressDelta(pan, dx) : getPanProgress(pan, target, dx);
      folderPageTrackScrub.value = makeScrubState(pan, target, progress, {
        settle: true,
        settleToken: `folder-page-pan:${++folderPagePanSettleToken}`,
        targetProgress: 0,
        velocity: 0,
      });
      clearFolderPageTrackScrubLater();
    } else {
      clearFolderPageTrackScrubNow();
    }
  }

  function closeDesktopFromSurface() {
    options.closeDesktop({ clearSearch: true });
    options.hideNativeWindowAfterCloseAnimation();
  }

  function handleDesktopSurfacePointerDown(event) {
    if (event?.button !== 0) return;
    if (!options.isDesktopOpen.value || options.isDragActive() || options.isAppLaunching.value) return;
    if (options.isFolderAppLaunchClosing?.value) return;
    if (options.isFolderClosing?.value) {
      handleFolderClosingDesktopPointerDown(event);
      return;
    }

    if (event.target?.closest?.(DESKTOP_SURFACE_IGNORED_SELECTOR)) return;
    const iconTarget = getSurfaceIconTarget(event);
    if (options.openFolderId?.value || options.renderedFolder?.value) {
      if (iconTarget?.meta?.area === "folder") return;
      options.commitOpenFolder(null);
      return;
    }
    if (iconTarget) return;

    if (canStartSurfacePagePan(event)) {
      beginSurfacePagePan(event);
      return;
    }

    closeDesktopFromSurface();
  }

  function handleFolderOverlayPointerDown() {
    clearFolderPageTrackScrubNow();
    if (!options.isDragActive()) options.commitOpenFolder(null);
  }

  function handleFolderPanelPointerDown(event) {
    if (event?.button !== 0) return;
    if (!options.isDesktopOpen.value || options.isDragActive() || options.isAppLaunching.value) return;
    if (options.isFolderClosing?.value || options.isFolderAppLaunchClosing?.value) return;
    if (!options.renderedFolder?.value && !options.openFolderId?.value) return;
    if ((options.folderPages?.value || []).length <= 1) return;
    if (event.target?.closest?.(DESKTOP_SURFACE_IGNORED_SELECTOR)) return;
    if (getFolderIconTarget(event)) return;
    beginFolderPagePan(event);
  }

  return {
    folderPageTrackScrub,
    handleDesktopSurfacePointerDown,
    handleFolderPanelPointerDown,
    handleFolderOverlayPointerDown,
    pageTrackScrub,
    setFolderPageRef,
    setPageRef,
  };
}
