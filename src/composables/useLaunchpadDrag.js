import { nextTick, shallowRef } from "vue";
import {
  DESKTOP_SORT_MIN_DISTANCE,
  DRAG_INTENT_IDLE_DELAY,
  FOLDER_DRAG_SORT_GATE_DURATION,
  FOLDER_HOVER_STICKY_MARGIN,
  FOLDER_PAGE_EDGE_SIZE,
  FOLDER_SORT_MIN_DISTANCE,
  LONG_PRESS_DELAY,
  LONG_PRESS_MOVE_THRESHOLD,
  PAGE_EDGE_SIZE,
  PAGE_TURN_DELAY,
} from "./launchpadConstants.js";
import {
  clamp,
  expandRect,
  isPointInsideRect,
  shouldCommitPlacementFromLast,
} from "../domain/launchpadLayout.js";
import { getDomRefElement } from "./usePageGridMetrics.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";
import { stageLayoutRecordToClientRect } from "../rendering/pixi/geometry/stageCoordinates.js";
import { getDesktopIconSizing } from "../rendering/pixi/scene/desktopIconSizing.js";
import {
  makeFolderCenterCollapseRect,
  makeFolderThumbPreviewRect,
} from "../rendering/pixi/scene/folderOverlayTargets.js";
import {
  cloneIconVisualSpec,
  makeIconVisualSpec,
} from "../rendering/pixi/scene/iconVisualSpec.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;
const LAYOUT_PROJECTION_RELEASE_DELAY = 260;
const DRAG_RELEASE_DURATION_MS = 180;
const DRAG_RELEASE_GHOST_PADDING_MS = 60;
const DRAG_RELEASE_FALLBACK_CLEAR_MS = 1200;
const DRAG_RELEASE_TARGET_RESOLVE_FRAMES = 3;
const DRAG_RELEASE_MODE_SLOT = "slot";
const DRAG_RELEASE_MODE_FOLDER_PREVIEW_SLOT = "folder-preview-slot";
const DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB = "folder-center-absorb";
const FOLDER_HOVER_SETTLE_MS = 660;
const FOLDER_HOVER_FLASH_TOTAL_MS = 540;
const FOLDER_HOVER_OPEN_BUFFER_MS = 20;
const FOLDER_HOVER_RESTORE_BEFORE_OPEN_MS = 90;
const FOLDER_HOVER_OPEN_DELAY_MS = FOLDER_HOVER_SETTLE_MS + FOLDER_HOVER_FLASH_TOTAL_MS + FOLDER_HOVER_OPEN_BUFFER_MS;
const FOLDER_HOVER_OPENING_DELAY_MS = Math.max(0, FOLDER_HOVER_OPEN_DELAY_MS - FOLDER_HOVER_RESTORE_BEFORE_OPEN_MS);
const FOLDER_HOVER_ESCAPE_MARGIN = 64;
const FIRST_FOLDER_OPEN_PREPARE_DELAY_MS = 48;
const SETTLED_DRAG_START_FRAMES = 3;
const DRAG_VELOCITY_SMOOTHING = 0.6;
const DRAG_VELOCITY_MAX_DELTA_MS = 80;

export function isPrimaryPointerStartEvent(event) {
  if (!event) return false;
  if (typeof event.button === "number" && event.button !== 0) return false;
  if (typeof event.buttons === "number" && (event.buttons & 1) !== 1) return false;
  return true;
}

export function isPrimaryPointerMoveEvent(event) {
  if (!event) return false;
  return typeof event.buttons !== "number" || (event.buttons & 1) === 1;
}

export function isSamePointerEvent(pointerId, event) {
  return pointerId == null || event?.pointerId == null || pointerId === event.pointerId;
}

export function isPrimaryPointerReleaseEvent(event) {
  return event?.type === "pointercancel" || typeof event?.button !== "number" || event.button === 0;
}

export function shouldFinishDragForPointerEvent(activeDrag, event) {
  return isSamePointerEvent(activeDrag?.pointerId, event) && isPrimaryPointerReleaseEvent(event);
}

function nowMs() {
  return globalThis.performance?.now?.() || Date.now();
}

function makeZeroVelocity() {
  return { x: 0, y: 0 };
}

function readPointerTime(event) {
  const time = Number(event?.timeStamp);
  return Number.isFinite(time) && time > 0 ? time : nowMs();
}

export function samplePointerVelocity(previous = {}, event = {}, options = {}) {
  const smoothing = Math.max(0, Math.min(1, Number(options.smoothing ?? DRAG_VELOCITY_SMOOTHING)));
  const maxDeltaMs = Math.max(1, Number(options.maxDeltaMs ?? DRAG_VELOCITY_MAX_DELTA_MS));
  const time = readPointerTime(event);
  const previousPointer = previous.pointer || { x: event.clientX, y: event.clientY };
  const previousTime = Number(previous.time) || time;
  const dtMs = Math.max(1, Math.min(maxDeltaMs, time - previousTime));
  const instant = {
    x: ((Number(event.clientX) - previousPointer.x) / dtMs) * 1000,
    y: ((Number(event.clientY) - previousPointer.y) / dtMs) * 1000,
  };
  const previousVelocity = previous.velocity || makeZeroVelocity();
  return {
    pointer: {
      x: Number(event.clientX),
      y: Number(event.clientY),
    },
    time,
    velocity: {
      x: previousVelocity.x + (instant.x - previousVelocity.x) * smoothing,
      y: previousVelocity.y + (instant.y - previousVelocity.y) * smoothing,
    },
  };
}

export function useLaunchpadDrag(options) {
  const dragMeta = shallowRef(null);
  const dragFolderHoverState = shallowRef(null);
  const dragFolderTargetId = shallowRef(null);
  const dragPreviewState = shallowRef(null);
  const dragReleaseState = shallowRef(null);

  let dragRuntime = null;
  let dragPlacement = null;
  let folderHover = null;
  let lastPlacementCommit = null;
  let pendingPreviewPoint = null;
  let previewRafId = 0;
  let pendingTimer = null;
  let pageTurnTimer = null;
  let folderPageTurnTimer = null;
  let dragIntentTimer = null;
  let dragSortGateTimer = null;
  let dragSortBlocked = false;
  let pendingDesktopReturn = null;
  let layoutProjectionReleaseTimer = null;
  let dragListenersAttached = false;
  let dragContextMenuListenerAttached = false;
  let longPressState = null;
  let dragReleaseTimer = null;
  let dragReleaseResolveRaf = 0;
  let dragReleaseKey = 0;
  let dragFolderHoverKey = 0;
  let settledDragStartRaf = 0;

  function isDragActive() {
    return Boolean(dragRuntime || dragReleaseState.value);
  }

  function placementKey(kind) {
    const parts = Array.prototype.slice.call(arguments, 1);
    return `${kind}:${parts.join(":")}`;
  }

  function getLaunchBoundsArea(source) {
    if (source?.type === "folder") return "folder";
    if (source?.type === "search") return "search";
    return "desktop";
  }

  function shouldRefreshLongPressBoundsOnStart() {
    return Boolean(options.isHomeRevealSettling.value && !options.isFolderLayerActive.value);
  }

  function cloneRect(rect) {
    if (!rect) return null;
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  }

  function cloneFolderOriginBounds(origin) {
    if (!origin?.folderId || !origin.iconRect) return null;
    return {
      folderId: origin.folderId,
      iconRect: cloneRect(origin.iconRect),
      previewChildRects: (origin.previewChildRects || [])
        .map((entry) => ({
          childId: entry?.childId,
          rect: cloneRect(entry?.rect),
          slotIndex: entry?.slotIndex,
        }))
        .filter((entry) => entry.childId && entry.rect),
      thumbRect: cloneRect(origin.thumbRect) || cloneRect(origin.iconRect),
    };
  }

  function resolveLongPressSourceRect(lp) {
    if (!lp?.refreshBoundsOnStart) return lp?.rect || null;
    return options.iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.RENDERED, {
      area: getLaunchBoundsArea(lp.source),
      folderId: lp.source?.folderId,
      id: lp.item?.id,
      pageIndex: lp.source?.pageIndex,
    }) || lp.rect || null;
  }

  function getLongPressDragGeometry(lp) {
    const rect = resolveLongPressSourceRect(lp);
    if (!rect) return { offset: lp.offset, size: lp.size };
    const visualSize = lp.dragVisualState?.iconSize;
    const width = visualSize || rect.width;
    const height = visualSize || rect.height;
    const left = rect.left + rect.width / 2 - width / 2;
    const top = rect.top + rect.height / 2 - height / 2;
    return {
      offset: {
        x: lp.startPoint.x - left,
        y: lp.startPoint.y - top,
      },
      size: {
        height,
        width,
      },
    };
  }

  function normalizeDragVisualState(value) {
    if (!value || typeof value !== "object") return null;
    const cellHeight = Math.max(1, Number(value.cellHeight) || 0) || null;
    const cellWidth = Math.max(1, Number(value.cellWidth) || 0) || null;
    return {
      cellHeight,
      cellWidth,
      compact: value.compact === true,
      iconSize: Math.max(1, Number(value.iconSize) || 0) || null,
      singleLineLabel: value.singleLineLabel === true,
    };
  }

  function getDragVisualCellSize(dragVisualState) {
    if (!dragVisualState?.cellWidth || !dragVisualState?.cellHeight) return null;
    return {
      height: dragVisualState.cellHeight,
      width: dragVisualState.cellWidth,
    };
  }

  function clearPendingTarget() {
    clearPendingFolderTimers();
    pendingTimer = null;
    folderHover = null;
    dragFolderHoverState.value = null;
    dragFolderTargetId.value = null;
  }

  function clearPendingTimerButKeepSticky() {
    clearPendingFolderTimers();
    pendingTimer = null;
  }

  function clearPendingFolderTimers() {
    if (!pendingTimer) return;
    if (pendingTimer.flashTimer) window.clearTimeout(pendingTimer.flashTimer);
    if (pendingTimer.openingTimer) window.clearTimeout(pendingTimer.openingTimer);
    if (pendingTimer.timer) window.clearTimeout(pendingTimer.timer);
  }

  function clearPageTurn() {
    if (pageTurnTimer) window.clearTimeout(pageTurnTimer.timer);
    pageTurnTimer = null;
  }

  function clearFolderPageTurn() {
    if (folderPageTurnTimer) window.clearTimeout(folderPageTurnTimer.timer);
    folderPageTurnTimer = null;
  }

  function clearDragIntentTimer() {
    if (dragIntentTimer) window.clearTimeout(dragIntentTimer);
    dragIntentTimer = null;
  }

  function clearDragSortGateTimer() {
    if (dragSortGateTimer) window.clearTimeout(dragSortGateTimer);
    dragSortGateTimer = null;
  }

  function isDragSortingBlocked() {
    return dragSortBlocked;
  }

  function scheduleDragSortGateEvaluation() {
    if (dragSortGateTimer) return;
    blockDragSorting();
  }

  function releaseDragSortGate() {
    dragSortGateTimer = null;
    dragSortBlocked = false;
    evaluateDragIntent();
  }

  function blockDragSorting(duration = FOLDER_DRAG_SORT_GATE_DURATION) {
    dragSortBlocked = true;
    clearDragSortGateTimer();
    dragSortGateTimer = window.setTimeout(releaseDragSortGate, duration);
  }

  function setLayoutProjectionActive(active) {
    if (options.isLayoutProjectionActive && typeof options.isLayoutProjectionActive === "object" && "value" in options.isLayoutProjectionActive) {
      options.isLayoutProjectionActive.value = Boolean(active);
    }
  }

  function clearLayoutProjectionRelease(reset = false) {
    if (layoutProjectionReleaseTimer) window.clearTimeout(layoutProjectionReleaseTimer);
    layoutProjectionReleaseTimer = null;
    if (reset) setLayoutProjectionActive(false);
  }

  function activateLayoutProjection() {
    clearLayoutProjectionRelease();
    setLayoutProjectionActive(true);
  }

  function scheduleLayoutProjectionRelease() {
    clearLayoutProjectionRelease();
    layoutProjectionReleaseTimer = window.setTimeout(() => {
      layoutProjectionReleaseTimer = null;
      setLayoutProjectionActive(false);
    }, LAYOUT_PROJECTION_RELEASE_DELAY);
  }

  function attachDragListeners() {
    if (dragListenersAttached) return;
    dragListenersAttached = true;
    window.addEventListener("pointermove", updateDragPointer, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    attachDragContextMenuListener();
  }

  function detachDragListeners() {
    if (dragListenersAttached) {
      dragListenersAttached = false;
      window.removeEventListener("pointermove", updateDragPointer);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    }
    if (!longPressState) detachDragContextMenuListener();
  }

  function attachDragContextMenuListener() {
    if (dragContextMenuListenerAttached) return;
    dragContextMenuListenerAttached = true;
    window.addEventListener("contextmenu", suppressDragContextMenu, true);
  }

  function detachDragContextMenuListener() {
    if (!dragContextMenuListenerAttached) return;
    dragContextMenuListenerAttached = false;
    window.removeEventListener("contextmenu", suppressDragContextMenu, true);
  }

  function detachLongPressListeners() {
    window.removeEventListener("pointermove", handleLongPressMove);
    window.removeEventListener("pointerup", handleLongPressUp);
    window.removeEventListener("pointercancel", handleLongPressUp);
  }

  function clearSettledDragStartRaf() {
    if (settledDragStartRaf) window.cancelAnimationFrame(settledDragStartRaf);
    settledDragStartRaf = 0;
  }

  function suppressDragContextMenu(event) {
    if (!dragRuntime && !longPressState) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function getSourceCellSize(source) {
    const isFolderSource = source?.type === "folder";
    const pageRef = isFolderSource ? options.folderPageRefs[source.pageIndex] : options.pageRefs[source?.pageIndex];
    const rect = pageRef?.getBoundingClientRect?.();
    if (!rect) return null;
    const cols = Math.max(1, Number((isFolderSource ? options.folderCols : options.gridCols).value) || 1);
    const rowSource = isFolderSource ? options.visibleFolderRowCount : options.gridRows;
    const rows = Math.max(1, Number(rowSource.value) || 1);
    return {
      height: rect.height / rows,
      width: rect.width / cols,
    };
  }

  function updatePreviewState() {
    previewRafId = 0;
    if (!pendingPreviewPoint || !dragRuntime) return;
    dragPreviewState.value = {
      cellSize: { ...dragRuntime.cellSize },
      compact: dragRuntime.compact === true,
      item: dragRuntime.item,
      offset: { ...dragRuntime.offset },
      pointer: { ...pendingPreviewPoint },
      singleLineLabel: dragRuntime.singleLineLabel === true,
      size: { ...dragRuntime.size },
      source: dragRuntime.source,
    };
  }

  function schedulePreviewPosition(clientX, clientY) {
    pendingPreviewPoint = { x: clientX, y: clientY };
    if (previewRafId) return;
    previewRafId = window.requestAnimationFrame(updatePreviewState);
  }

  function sampleDragVelocity(activeDrag, event) {
    const sampled = samplePointerVelocity({
      pointer: activeDrag.pointer,
      time: activeDrag.lastPointerTime,
      velocity: activeDrag.velocity,
    }, event);
    activeDrag.velocity = sampled.velocity;
    activeDrag.lastPointerTime = sampled.time;
  }

  function cancelPreviewRaf() {
    if (previewRafId) window.cancelAnimationFrame(previewRafId);
    previewRafId = 0;
    pendingPreviewPoint = null;
  }

  function clearDragReleaseResolve() {
    if (dragReleaseResolveRaf) window.cancelAnimationFrame(dragReleaseResolveRaf);
    dragReleaseResolveRaf = 0;
  }

  function clearDragRelease() {
    if (dragReleaseTimer) window.clearTimeout(dragReleaseTimer);
    clearDragReleaseResolve();
    dragReleaseTimer = null;
    dragReleaseState.value = null;
  }

  function scheduleDragReleaseClear() {
    if (dragReleaseTimer) window.clearTimeout(dragReleaseTimer);
    dragReleaseTimer = window.setTimeout(() => {
      dragReleaseTimer = null;
      dragReleaseState.value = null;
    }, DRAG_RELEASE_FALLBACK_CLEAR_MS + DRAG_RELEASE_GHOST_PADDING_MS);
  }

  function getReleaseTextless() {
    return Boolean(options.isTextlessMode?.value);
  }

  function getReleaseVisualOffsetY() {
    return getReleaseTextless() ? 0 : -14;
  }

  function makeCenteredRect(centerX, centerY, width, height = width) {
    return {
      height,
      left: centerX - width / 2,
      top: centerY - height / 2,
      width,
    };
  }

  function getRefRect(refs, index) {
    return refs?.[index]?.getBoundingClientRect?.() || null;
  }

  function cloneClientRect(rect) {
    if (!rect) return null;
    const left = Number(rect.left) || 0;
    const top = Number(rect.top) || 0;
    const width = Number(rect.width) || 0;
    const height = Number(rect.height) || 0;
    return {
      bottom: Number(rect.bottom) || top + height,
      height,
      left,
      right: Number(rect.right) || left + width,
      top,
      width,
    };
  }

  function getBoundsRecord(kind, variant, keyInput, optionsArg = {}) {
    return options.iconBoundsRegistry.getRecord?.(kind, variant, keyInput, optionsArg) || null;
  }

  function getRecordVisualSpec(record) {
    return cloneIconVisualSpec(record?.meta?.visualSpec);
  }

  function getFirstRecordVisualSpec() {
    for (const record of arguments) {
      const visualSpec = getRecordVisualSpec(record);
      if (visualSpec) return visualSpec;
    }
    return null;
  }

  function makeReleaseTarget(clientRect, stageLayoutRect = null, visualSpec = null) {
    const safeClientRect = cloneClientRect(clientRect);
    const safeStageLayoutRect = cloneClientRect(stageLayoutRect);
    if (!safeClientRect && !safeStageLayoutRect) return null;
    return {
      clientRect: safeClientRect,
      stageLayoutRect: safeStageLayoutRect,
      visualSpec: cloneIconVisualSpec(visualSpec),
    };
  }

  function normalizeReleaseTarget(target) {
    if (target?.clientRect || target?.stageLayoutRect || target?.visualSpec) {
      return makeReleaseTarget(target.clientRect, target.stageLayoutRect, target.visualSpec) ||
        { clientRect: null, stageLayoutRect: null, visualSpec: null };
    }
    return makeReleaseTarget(target) || { clientRect: null, stageLayoutRect: null, visualSpec: null };
  }

  function getStableLayoutReleaseTarget(source, expected = null) {
    const record = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, source, { expected });
    const clientRect = stageLayoutRecordToClientRect(record);
    return clientRect ? makeReleaseTarget(clientRect, record, getRecordVisualSpec(record)) : null;
  }

  function getStageLayoutClientReleaseTarget(kind, keyInput, fallbackClientRect = null) {
    const stageLayoutRecord = getBoundsRecord(kind, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, keyInput);
    const stageLayoutClientRect = stageLayoutRecordToClientRect(stageLayoutRecord);
    const liveRecord = getBoundsRecord(kind, BOUNDS_VARIANT.LIVE_TARGET, keyInput);
    const renderedRecord = getBoundsRecord(kind, BOUNDS_VARIANT.RENDERED, keyInput);
    return makeReleaseTarget(
      liveRecord || renderedRecord || stageLayoutClientRect || fallbackClientRect,
      stageLayoutRecord,
      getFirstRecordVisualSpec(liveRecord, renderedRecord, stageLayoutRecord)
    );
  }

  function getTopLevelFolderThumbReleaseTarget(folderId, fallbackClientRect = null) {
    return getStageLayoutClientReleaseTarget(BOUNDS_KIND.FOLDER_THUMB, folderId, fallbackClientRect);
  }

  function getFolderPreviewChildReleaseTarget(folderId, childId, slotIndex, fallbackClientRect = null) {
    const childKey = { childId, folderId, slotIndex };
    const directTarget = getStageLayoutClientReleaseTarget(BOUNDS_KIND.PREVIEW_CHILD, childKey);
    if (directTarget?.clientRect || directTarget?.stageLayoutRect) return directTarget;

    const thumbTarget = getTopLevelFolderThumbReleaseTarget(folderId, fallbackClientRect);
    if (!thumbTarget?.clientRect && !thumbTarget?.stageLayoutRect) return null;
    return makeReleaseTarget(
      makeFolderThumbPreviewRect(thumbTarget.clientRect, slotIndex) || thumbTarget.clientRect,
      makeFolderThumbPreviewRect(thumbTarget.stageLayoutRect, slotIndex)
    );
  }

  function getFolderCenterAbsorbReleaseTarget(folderId, fallbackClientRect = null) {
    const thumbTarget = getTopLevelFolderThumbReleaseTarget(folderId, fallbackClientRect);
    if (!thumbTarget?.clientRect && !thumbTarget?.stageLayoutRect) return null;
    return makeReleaseTarget(
      makeFolderCenterCollapseRect(thumbTarget.clientRect) || thumbTarget.clientRect,
      makeFolderCenterCollapseRect(thumbTarget.stageLayoutRect)
    );
  }

  function getDesktopTargetIconSize(cellWidth, cellHeight, fallbackSize) {
    const configuredSize = Math.max(1, Number(options.iconSize?.value) || Number(fallbackSize) || 64);
    return Math.max(1, Math.min(configuredSize, cellWidth, cellHeight));
  }

  function getFolderTargetIconSize(cellWidth, cellHeight, fallbackSize) {
    const configuredSize = Math.max(1, Number(options.effectiveFolderIconSize?.value) || Number(fallbackSize) || 56);
    return Math.max(1, Math.min(configuredSize, 56, cellWidth, cellHeight));
  }

  function getPageSlotReleaseTarget(pageIndex, index, fallbackSize) {
    const rect = getRefRect(options.pageRefs, pageIndex);
    if (!rect) return null;
    const cols = Math.max(1, Number(options.gridCols.value) || 1);
    const rows = Math.max(1, Number(options.gridRows.value) || 1);
    const cellWidth = rect.width / cols;
    const cellHeight = rect.height / rows;
    const safeIndex = clamp(index, 0, Math.max(0, cols * rows - 1));
    const col = safeIndex % cols;
    const row = Math.floor(safeIndex / cols);
    const sizing = getDesktopIconSizing({
      iconSize: Number(options.iconSize?.value) || Number(fallbackSize) || 64,
      isTextlessMode: getReleaseTextless(),
      width: rect.width,
    }, { height: cellHeight, width: cellWidth });
    const size = getDesktopTargetIconSize(cellWidth, cellHeight, fallbackSize);
    return makeReleaseTarget(
      makeCenteredRect(rect.left + col * cellWidth + cellWidth / 2, rect.top + row * cellHeight + cellHeight / 2 + getReleaseVisualOffsetY(), size),
      null,
      makeIconVisualSpec({
        cellHeight,
        cellWidth,
        compact: sizing.compact,
        iconSize: size,
        singleLineLabel: sizing.singleLineLabel,
        textless: getReleaseTextless(),
      })
    );
  }

  function getFolderSlotReleaseTarget(pageIndex, index, fallbackSize) {
    const rect = getRefRect(options.folderPageRefs, pageIndex);
    if (!rect) return null;
    const cols = Math.max(1, Number(options.folderCols.value) || 1);
    const rows = Math.max(1, Number(options.visibleFolderRowCount.value) || 1);
    const cellWidth = rect.width / cols;
    const cellHeight = rect.height / rows;
    const safeIndex = clamp(index, 0, Math.max(0, cols * rows - 1));
    const col = safeIndex % cols;
    const row = Math.floor(safeIndex / cols);
    const size = getFolderTargetIconSize(cellWidth, cellHeight, fallbackSize);
    return makeReleaseTarget(
      makeCenteredRect(rect.left + col * cellWidth + cellWidth / 2, rect.top + row * cellHeight + cellHeight / 2 + getReleaseVisualOffsetY(), size),
      null,
      makeIconVisualSpec({
        cellHeight,
        cellWidth,
        compact: false,
        iconSize: size,
        singleLineLabel: false,
        textless: getReleaseTextless(),
      })
    );
  }

  function getCommittedTopLevelReleaseTarget(itemId, fallbackSize) {
    const target = options.findTopLevel(options.pages.value, itemId);
    return target ? getPageSlotReleaseTarget(target.pageIndex, target.index, fallbackSize) : null;
  }

  function getCommittedFolderReleaseTarget(folderId, itemId, fallbackSize) {
    const target = options.findInFolder(options.pages.value, folderId, itemId);
    return target ? getFolderSlotReleaseTarget(target.pageIndex, target.index, fallbackSize) : null;
  }

  function getCommittedTopLevelTargetBounds(itemId) {
    const target = options.findTopLevel(options.pages.value, itemId);
    if (!target) return null;
    const source = { area: "desktop", folderId: null, id: itemId, pageIndex: target.pageIndex };
    const expected = { area: "desktop", id: itemId, index: target.index, pageIndex: target.pageIndex };
    const liveRecord = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, source, { expected });
    return getStableLayoutReleaseTarget(source, expected) ||
      makeReleaseTarget(liveRecord, null, getRecordVisualSpec(liveRecord));
  }

  function getCommittedFolderTargetBounds(folderId, itemId) {
    const target = options.findInFolder(options.pages.value, folderId, itemId);
    if (!target) return null;
    const source = { area: "folder", folderId, id: itemId, pageIndex: target.pageIndex };
    const expected = { area: "folder", folderId, id: itemId, index: target.index, pageIndex: target.pageIndex };
    const liveRecord = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, source, { expected });
    return getStableLayoutReleaseTarget(source, expected) ||
      makeReleaseTarget(liveRecord, null, getRecordVisualSpec(liveRecord));
  }

  function getPointerReleaseRect(activeDrag) {
    if (!activeDrag) return null;
    const width = Math.max(1, Number(activeDrag.size?.width) || 64);
    const height = Math.max(1, Number(activeDrag.size?.height) || width);
    const offset = activeDrag.offset || { x: width / 2, y: height / 2 };
    const pointer = activeDrag.pointer || { x: 0, y: 0 };
    return {
      height,
      left: pointer.x - offset.x,
      top: pointer.y - offset.y,
      width,
    };
  }

  function startPendingDragRelease(releaseOptions = {}) {
    const activeDrag = dragRuntime;
    if (!activeDrag) {
      clearDragRelease();
      return null;
    }
    if (dragReleaseTimer) window.clearTimeout(dragReleaseTimer);
    clearDragReleaseResolve();
    dragReleaseTimer = null;
    dragReleaseKey += 1;
    const key = `release-${dragReleaseKey}-${activeDrag.item.id}`;
    dragReleaseState.value = {
      cellSize: { ...activeDrag.cellSize },
      compact: activeDrag.compact === true,
      duration: DRAG_RELEASE_DURATION_MS / 1000,
      item: options.cloneItem(activeDrag.item),
      key,
      offset: { ...activeDrag.offset },
      pointer: { ...activeDrag.pointer },
      releaseMode: releaseOptions.releaseMode || DRAG_RELEASE_MODE_SLOT,
      singleLineLabel: activeDrag.singleLineLabel === true,
      size: { ...activeDrag.size },
      source: activeDrag.source,
      suppressFolderPreviewChildId: releaseOptions.suppressFolderPreviewChildId || null,
      suppressFolderPreviewFolderId: releaseOptions.suppressFolderPreviewFolderId || null,
      targetFolderId: releaseOptions.targetFolderId || null,
      targetPreviewSlotIndex: releaseOptions.targetPreviewSlotIndex ?? null,
      targetRect: null,
      targetStageLayoutRect: null,
      targetVisualSpec: null,
      targetVersion: 0,
      textless: getReleaseTextless(),
      velocity: { ...(activeDrag.velocity || makeZeroVelocity()) },
    };
    return key;
  }

  function setDragReleaseTarget(releaseKey, targetRect, fallbackRect = null) {
    const current = dragReleaseState.value;
    if (!current || current.key !== releaseKey) return false;
    const releaseTarget = normalizeReleaseTarget(targetRect);
    const fallbackTarget = normalizeReleaseTarget(fallbackRect);
    const targetCandidate = releaseTarget.clientRect;
    const stageLayoutCandidate = releaseTarget.stageLayoutRect;
    const fallbackCandidate = fallbackTarget.clientRect;
    const pointerCandidate = getPointerReleaseRect(current);
    const safeTargetRect = targetCandidate?.width && targetCandidate?.height
      ? targetCandidate
      : fallbackCandidate?.width && fallbackCandidate?.height
        ? fallbackCandidate
        : pointerCandidate;
    const safeTargetVisualSpec = targetCandidate?.width && targetCandidate?.height
      ? releaseTarget.visualSpec || fallbackTarget.visualSpec
      : fallbackCandidate?.width && fallbackCandidate?.height
        ? fallbackTarget.visualSpec
        : null;
    if (!safeTargetRect?.width || !safeTargetRect?.height) {
      clearDragRelease();
      return false;
    }
    dragReleaseState.value = {
      ...current,
      targetRect: safeTargetRect,
      targetStageLayoutRect: targetCandidate?.width && targetCandidate?.height ? stageLayoutCandidate : null,
      targetVisualSpec: safeTargetVisualSpec,
      targetVersion: (Number(current.targetVersion) || 0) + 1,
    };
    scheduleDragReleaseClear();
    return true;
  }

  function scheduleDragReleaseTargetResolve(releaseKey, resolveTargetRect, fallbackRect) {
    clearDragReleaseResolve();
    let attempts = 0;
    const tryResolve = () => {
      dragReleaseResolveRaf = 0;
      if (!dragReleaseState.value || dragReleaseState.value.key !== releaseKey) return;
      const targetRect = typeof resolveTargetRect === "function" ? resolveTargetRect() : null;
      if (targetRect) {
        setDragReleaseTarget(releaseKey, targetRect, fallbackRect);
        return;
      }
      attempts += 1;
      if (attempts < DRAG_RELEASE_TARGET_RESOLVE_FRAMES) {
        dragReleaseResolveRaf = window.requestAnimationFrame(tryResolve);
        return;
      }
      setDragReleaseTarget(releaseKey, null, fallbackRect);
    };
    nextTick(() => {
      if (!dragReleaseState.value || dragReleaseState.value.key !== releaseKey) return;
      dragReleaseResolveRaf = window.requestAnimationFrame(tryResolve);
    });
  }

  function startDragRelease(targetRect) {
    const releaseKey = startPendingDragRelease();
    if (!releaseKey) return;
    setDragReleaseTarget(releaseKey, targetRect);
  }

  function endDrag() {
    const shouldClampFolderPage = Boolean(options.renderedFolder.value || options.openFolderId.value);
    detachDragListeners();
    clearDragIntentTimer();
    clearDragSortGateTimer();
    clearPageTurn();
    clearFolderPageTurn();
    cancelPreviewRaf();
    dragRuntime = null;
    dragMeta.value = null;
    dragPreviewState.value = null;
    dragSortBlocked = false;
    pendingDesktopReturn = null;
    dragFolderHoverState.value = null;
    dragFolderTargetId.value = null;
    dragPlacement = null;
    folderHover = null;
    lastPlacementCommit = null;
    if (shouldClampFolderPage) options.commitFolderPageIndex(options.folderPageIndex.value);
    options.commitPageIndex(options.pageIndex.value);
    scheduleLayoutProjectionRelease();
  }

  function calcPageInsertIndex(clientX, clientY, targetPageIndex) {
    const safePageIndex = typeof targetPageIndex === "number" ? targetPageIndex : options.pageIndex.value;
    const page = options.pageRefs[safePageIndex];
    if (!page) return options.pages.value[safePageIndex]?.length || 0;

    const rect = page.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / options.gridCols.value)), 0, options.gridCols.value - 1);
    const row = clamp(Math.floor(y / (rect.height / options.gridRows.value)), 0, options.gridRows.value - 1);
    return clamp(row * options.gridCols.value + col, 0, options.pageSize.value - 1);
  }

  function getCurrentFolderGridElement() {
    return options.folderPageRefs[options.folderPageIndex.value] || null;
  }

  function isInsideCurrentFolderGrid(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const rect = grid?.getBoundingClientRect();
    return rect ? isPointInsideRect(rect, clientX, clientY) : false;
  }

  function calcFolderInsertTarget(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
    if (!grid || !folder) {
      const fallbackPages = options.getFolderChildPages(folder, options.folderPageSize.value);
      const fallbackPageIndex = clamp(options.folderPageIndex.value, 0, Math.max(0, fallbackPages.length - 1));
      return { pageIndex: fallbackPageIndex, index: fallbackPages[fallbackPageIndex]?.length || 0 };
    }

    const rect = grid.getBoundingClientRect();
    const columnCount = Math.max(1, options.folderCols.value);
    const rowCount = Math.max(1, options.visibleFolderRowCount.value);
    const cellWidth = rect.width / columnCount;
    const cellHeight = rect.height / rowCount;
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / cellWidth), 0, columnCount - 1);
    const row = clamp(Math.floor(y / cellHeight), 0, rowCount - 1);
    return { pageIndex: options.folderPageIndex.value, index: row * columnCount + col };
  }

  function getDragVisualCenter(activeDrag) {
    if (!activeDrag) return null;
    const width = activeDrag.size?.width || 70;
    const height = activeDrag.size?.height || 70;
    return {
      x: activeDrag.pointer.x - activeDrag.offset.x + width / 2,
      y: activeDrag.pointer.y - activeDrag.offset.y + height / 2,
    };
  }

  function getDragVisualRect(activeDrag) {
    if (!activeDrag) return null;
    const width = activeDrag.size?.width || 70;
    const height = activeDrag.size?.height || 70;
    return {
      bottom: activeDrag.pointer.y - activeDrag.offset.y + height,
      height,
      left: activeDrag.pointer.x - activeDrag.offset.x,
      right: activeDrag.pointer.x - activeDrag.offset.x + width,
      top: activeDrag.pointer.y - activeDrag.offset.y,
      width,
    };
  }

  function rectsIntersect(a, b) {
    if (!a || !b) return false;
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function getStableTopLevelTargetBounds(found) {
    if (!found?.item?.id) return null;
    const source = { area: "desktop", folderId: null, id: found.item.id, pageIndex: found.pageIndex };
    const exactExpected = { area: "desktop", id: found.item.id, index: found.index, pageIndex: found.pageIndex };
    const pageExpected = { area: "desktop", id: found.item.id, pageIndex: found.pageIndex };
    const exactLiveRecord = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, source, { expected: exactExpected });
    const pageLiveRecord = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, source, { expected: pageExpected });
    return getStableLayoutReleaseTarget(source, exactExpected) ||
      getStableLayoutReleaseTarget(source, pageExpected) ||
      makeReleaseTarget(exactLiveRecord, null, getRecordVisualSpec(exactLiveRecord)) ||
      makeReleaseTarget(pageLiveRecord, null, getRecordVisualSpec(pageLiveRecord));
  }

  function normalizeTopLevelTarget(found, fallbackRect = null, node = null) {
    if (!found?.item) return null;
    const target = getStableTopLevelTargetBounds(found);
    const rect = target?.clientRect || fallbackRect;
    return rect ? { item: found.item, node, rect, stageLayoutRect: target?.stageLayoutRect || null, visualSpec: target?.visualSpec || null } : null;
  }

  function getTopLevelTargetById(targetId) {
    if (!targetId || targetId === dragRuntime?.item.id) return null;
    const found = options.findTopLevel(options.pages.value, targetId);
    return normalizeTopLevelTarget(found, options.iconBoundsRegistry.getBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.RENDERED, targetId));
  }

  function getTopLevelTargetAtPoint(clientX, clientY) {
    const pixiTarget = options.iconBoundsRegistry.getAtPoint(BOUNDS_KIND.TOP_LEVEL, clientX, clientY, { excludeId: dragRuntime?.item.id });
    if (pixiTarget?.id) {
      const found = options.findTopLevel(options.pages.value, pixiTarget.id);
      const target = normalizeTopLevelTarget(found, pixiTarget.rect);
      if (target) return target;
    }
    return null;
  }

  function getTopLevelTargetForDrag(activeDrag, center) {
    if (!activeDrag || !center) return null;
    const pointTarget = getTopLevelTargetAtPoint(center.x, center.y);
    if (pointTarget) return pointTarget;

    const dragRect = getDragVisualRect(activeDrag);
    if (!dragRect) return null;
    const pageIndex = options.pageIndex.value;
    const page = options.pages.value[pageIndex] || [];
    for (let index = 0; index < page.length; index += 1) {
      const item = page[index];
      if (!item?.id || item.id === activeDrag.item.id) continue;
      const target = normalizeTopLevelTarget({ item, pageIndex, index });
      if (target && rectsIntersect(expandRect(target.rect, 6), dragRect)) return target;
    }
    return null;
  }

  function isInsideFolderHitZone(targetInfo, clientX, clientY, activeDrag = null) {
    const rect = targetInfo?.rect;
    if (!rect) return false;
    if (isPointInsideRect(rect, clientX, clientY)) return true;
    const dragRect = getDragVisualRect(activeDrag);
    return rectsIntersect(expandRect(rect, 6), dragRect);
  }

  function isInsideStickyFolderZone(clientX, clientY) {
    if (!folderHover?.stickyRect) return false;
    return isPointInsideRect(folderHover.stickyRect, clientX, clientY);
  }

  function refreshFolderHoverTarget(targetId) {
    const targetInfo = getTopLevelTargetById(targetId);
    if (!targetInfo) return null;
    const margin = pendingTimer?.targetId === targetId ? FOLDER_HOVER_ESCAPE_MARGIN : FOLDER_HOVER_STICKY_MARGIN;
    folderHover = { targetId, stickyRect: expandRect(targetInfo.rect, margin) };
    return targetInfo;
  }

  function getLockedTopLevelDropTarget(activeDrag) {
    const targetId = folderHover?.targetId || pendingTimer?.targetId;
    if (!targetId) return null;
    const targetInfo = refreshFolderHoverTarget(targetId);
    if (!targetInfo) return null;
    const center = getDragVisualCenter(activeDrag) || activeDrag?.pointer;
    if (!center) return null;
    if (isInsideStickyFolderZone(center.x, center.y) || isInsideFolderHitZone(targetInfo, center.x, center.y, activeDrag)) return targetInfo;
    return null;
  }

  function isPendingFolderTargetStillActive(activeDrag, targetId) {
    if (!activeDrag || activeDrag.item.type !== "app" || folderHover?.targetId !== targetId) return false;
    const targetInfo = refreshFolderHoverTarget(targetId);
    if (!targetInfo) return false;
    const center = getDragVisualCenter(activeDrag) || activeDrag.pointer;
    return isInsideStickyFolderZone(center.x, center.y) || isInsideFolderHitZone(targetInfo, center.x, center.y, activeDrag);
  }

  function lockFolderHoverTarget(targetInfo) {
    const rect = targetInfo?.rect;
    if (!rect) return;
    const targetId = targetInfo.item.id;
    const margin = pendingTimer?.targetId === targetId ? FOLDER_HOVER_ESCAPE_MARGIN : FOLDER_HOVER_STICKY_MARGIN;
    folderHover = { targetId, stickyRect: expandRect(rect, margin) };
    dragFolderTargetId.value = targetId;
    if (dragFolderHoverState.value?.targetId === targetId) return;
    dragFolderHoverKey += 1;
    dragFolderHoverState.value = {
      key: `folder-hover-${dragFolderHoverKey}`,
      phase: "hover",
      startedAt: Date.now(),
      targetId,
      targetType: targetInfo.item.type,
    };
  }

  function setPendingFolderPhase(targetId, phase) {
    const current = dragFolderHoverState.value;
    if (!current || current.targetId !== targetId) return;
    dragFolderHoverState.value = { ...current, phase };
  }

  function isPendingFolderTargetReady(targetId) {
    const activeDrag = dragRuntime;
    if (!isPendingFolderTargetStillActive(activeDrag, targetId)) {
      clearPendingTarget();
      return false;
    }
    return true;
  }

  function startPendingFolderTarget(target) {
    if (pendingTimer?.targetId === target.id) return;
    clearPendingTimerButKeepSticky();

    pendingTimer = {
      targetId: target.id,
      flashTimer: window.setTimeout(() => {
        if (isPendingFolderTargetReady(target.id)) setPendingFolderPhase(target.id, "flash");
      }, FOLDER_HOVER_SETTLE_MS),
      openingTimer: window.setTimeout(() => {
        if (isPendingFolderTargetReady(target.id)) setPendingFolderPhase(target.id, "opening");
      }, FOLDER_HOVER_OPENING_DELAY_MS),
      timer: window.setTimeout(() => {
        const activeDrag = dragRuntime;
        if (!isPendingFolderTargetStillActive(activeDrag, target.id)) return clearPendingTarget();
        const latestTarget = options.findTopLevel(options.pages.value, target.id)?.item;
        if (!latestTarget || latestTarget.id === activeDrag.item.id) return clearPendingTarget();
        setPendingFolderPhase(target.id, "opening");
        clearPendingTarget();
        if (latestTarget.type === "folder") openExistingFolderForDrop(latestTarget.id);
        else createFolderForDrop(latestTarget.id);
      }, FOLDER_HOVER_OPEN_DELAY_MS),
    };
  }

  function createFolderForDrop(targetAppId) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;

    const withoutDragged = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    const target = options.findTopLevel(withoutDragged, targetAppId);
    if (!target || target.item.type !== "app") return;

    const folderId = options.makeId("folder");
    const originGeometry =
      options.getTopLevelIconMotionGeometry(targetAppId, folderId) ||
      options.getPageSlotMotionGeometry(folderId, target.pageIndex, target.index);
    const next = options.clonePages(withoutDragged);
    next[target.pageIndex][target.index] = options.withFolderPages(
      { id: folderId, type: "folder", name: "新文件夹" },
      [[options.cloneItem(target.item)]]
    );

    dragPlacement = placementKey("folder-open", folderId);
    lastPlacementCommit = null;
    options.commitPages(options.compactPages(next));
    options.commitOpenFolder(folderId, { originGeometry });
    options.commitFolderSession({ mode: "created", folderId, targetApp: options.cloneItem(target.item), hasEntered: false, openedAt: Date.now() });
    blockDragSorting();
  }

  function openExistingFolderForDrop(folderId) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;
    dragPlacement = placementKey("folder-open", folderId);
    lastPlacementCommit = null;
    options.commitPages(options.removeEverywhere(options.pages.value, activeDrag.item.id));
    options.commitOpenFolder(folderId);
    options.commitFolderSession({ mode: "existing", folderId, hasEntered: false, openedAt: Date.now() });
    blockDragSorting();
  }

  function dropDraggedAppOnTopLevelTarget(targetInfo) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app" || !targetInfo?.item) return { accepted: false };

    const target = options.findTopLevel(options.pages.value, targetInfo.item.id);
    if (!target || target.item.id === activeDrag.item.id) return { accepted: false };

    if (target.item.type === "folder") {
      const childPages = options.getFolderChildPages(target.item, options.folderPageSize.value);
      const previewLimit = Math.min(9, Math.max(0, Number(options.folderPageSize.value) || 0));
      const firstPageCount = childPages[0]?.filter(Boolean).length || 0;
      const canBecomePreviewChild = childPages.length === 1 && firstPageCount < previewLimit;
      const targetPageIndex = Math.max(0, childPages.length - 1);
      const insertIndex = childPages[targetPageIndex]?.length || 0;
      options.commitPages(
        options.insertAppIntoFolder(
          options.pages.value,
          target.item.id,
          activeDrag.item,
          targetPageIndex,
          insertIndex,
          options.folderPageSize.value
        )
      );
      dragPlacement = placementKey("folder-drop", target.item.id, targetPageIndex, insertIndex);
      return {
        accepted: true,
        folderId: target.item.id,
        previewSlotIndex: canBecomePreviewChild ? firstPageCount : null,
        releaseMode: canBecomePreviewChild
          ? DRAG_RELEASE_MODE_FOLDER_PREVIEW_SLOT
          : DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB,
        suppressFolderPreviewChildId: canBecomePreviewChild ? activeDrag.item.id : null,
        suppressFolderPreviewFolderId: canBecomePreviewChild ? target.item.id : null,
        targetInfo,
      };
    }

    const withoutDragged = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    const latestTarget = options.findTopLevel(withoutDragged, target.item.id);
    if (!latestTarget || latestTarget.item.type !== "app") return { accepted: false };

    const folderId = options.makeId("folder");
    const originGeometry =
      options.getTopLevelIconMotionGeometry(latestTarget.item.id, folderId) ||
      options.getPageSlotMotionGeometry(folderId, latestTarget.pageIndex, latestTarget.index);
    const next = options.clonePages(withoutDragged);
    next[latestTarget.pageIndex][latestTarget.index] = options.withFolderPages(
      { id: folderId, type: "folder", name: "新文件夹" },
      [[options.cloneItem(latestTarget.item), options.cloneItem(activeDrag.item)]]
    );

    dragPlacement = placementKey("folder-drop", folderId);
    options.commitPages(options.compactPages(next));
    options.commitOpenFolder(folderId, { originGeometry });
    return {
      accepted: true,
      folderId,
      previewSlotIndex: null,
      releaseMode: DRAG_RELEASE_MODE_SLOT,
      targetInfo,
    };
  }

  function commitDraggedItemToDesktop(session, commitOptions) {
    const activeDrag = dragRuntime;
    if (!activeDrag || !session) return;

    const safeOptions = commitOptions || {};
    let next = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    if (session.mode === "created" && session.targetApp) next = options.replaceFolderWithItem(next, session.folderId, session.targetApp);
    const insertIndex = calcPageInsertIndex(activeDrag.pointer.x, activeDrag.pointer.y);
    const shouldCommitOverflow = Boolean(safeOptions.force) || !options.wouldTopLevelInsertOverflow(next, activeDrag.item, options.pageIndex.value, options.pageSize.value);
    next = shouldCommitOverflow
      ? options.insertTopLevelItem(next, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value)
      : options.previewTopLevelItemWithoutOverflow(next, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value);
    dragPlacement = placementKey("page", options.pageIndex.value, insertIndex);

    options.commitPages(next);
    options.commitFolderPageIndex(options.folderPageIndex.value);
  }

  function commitPendingDesktopReturn(commitOptions) {
    if (!pendingDesktopReturn) return;
    const pending = pendingDesktopReturn;
    pendingDesktopReturn = null;
    commitDraggedItemToDesktop(pending.session, { force: Boolean(commitOptions?.force || pending.force) });
  }

  function cancelFolderSessionAndReturnToDesktop(cancelOptions) {
    const activeDrag = dragRuntime;
    const session = options.folderSession.value;
    if (!activeDrag || !session) return;

    const safeOptions = cancelOptions || {};
    options.commitOpenFolder(null);
    options.commitFolderSession(null);
    clearPendingTarget();

    if (safeOptions.deferSort) {
      pendingDesktopReturn = {
        force: Boolean(safeOptions.force),
        session: {
          ...session,
          targetApp: session.targetApp ? options.cloneItem(session.targetApp) : null,
        },
      };
      blockDragSorting();
      return;
    }

    commitDraggedItemToDesktop(session, safeOptions);
  }

  function shouldCommitPlacement(key, clientX, clientY, minDistance, force) {
    return shouldCommitPlacementFromLast(lastPlacementCommit, key, clientX, clientY, minDistance, Boolean(force));
  }

  function rememberPlacementCommit(key, clientX, clientY) {
    lastPlacementCommit = { key, x: clientX, y: clientY };
  }

  function moveTopLevelItemWithinCurrentPage(itemId, insertIndex) {
    const currentPageIndex = options.pageIndex.value;
    const page = options.pages.value[currentPageIndex];
    if (!page) return false;

    const currentIndex = page.findIndex((item) => item?.id === itemId);
    if (currentIndex < 0) return false;

    const safeIndex = clamp(insertIndex, 0, Math.min(options.pageSize.value, Math.max(0, page.length - 1)));
    if (currentIndex === safeIndex) return true;

    const nextPage = page.slice();
    const [item] = nextPage.splice(currentIndex, 1);
    nextPage.splice(safeIndex, 0, item);

    const next = options.pages.value.slice();
    next[currentPageIndex] = nextPage;
    options.commitPages(next);
    return true;
  }

  function placeDraggedItemOnDesktop(clientX, clientY, placeOptions) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    const safeOptions = placeOptions || {};
    const insertIndex = calcPageInsertIndex(clientX, clientY);
    const key = placementKey("page", options.pageIndex.value, insertIndex);
    const isAlreadyOnCurrentPage = Boolean((options.pages.value[options.pageIndex.value] || []).some((item) => item?.id === activeDrag.item.id));
    if (isAlreadyOnCurrentPage) {
      if (dragPlacement === key) return;
      if (!shouldCommitPlacement(key, clientX, clientY, DESKTOP_SORT_MIN_DISTANCE, safeOptions.force)) return;
      if (moveTopLevelItemWithinCurrentPage(activeDrag.item.id, insertIndex)) {
        dragPlacement = key;
        rememberPlacementCommit(key, clientX, clientY);
        return;
      }
    }

    const isAlreadyVisible = Boolean(options.findTopLevel(options.pages.value, activeDrag.item.id));
    const needsMove = dragPlacement !== key || !isAlreadyVisible;
    if (!needsMove) return;
    const wouldOverflow = options.wouldTopLevelInsertOverflow(options.pages.value, activeDrag.item, options.pageIndex.value, options.pageSize.value);
    if (!shouldCommitPlacement(key, clientX, clientY, DESKTOP_SORT_MIN_DISTANCE, safeOptions.force || !isAlreadyVisible)) return;

    const next = safeOptions.force || !wouldOverflow
      ? options.insertTopLevelItem(options.pages.value, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value)
      : options.previewTopLevelItemWithoutOverflow(options.pages.value, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value);
    dragPlacement = key;
    rememberPlacementCommit(key, clientX, clientY);
    options.commitPages(next);
  }

  function placeDraggedItemInFolder(folderId, clientX, clientY, placeOptions) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;
    const safeOptions = placeOptions || {};
    const target = calcFolderInsertTarget(clientX, clientY);
    const key = placementKey("folder", folderId, target.pageIndex, target.index);
    const existing = options.findInFolder(options.pages.value, folderId, activeDrag.item.id);
    const needsMove = dragPlacement !== key || !existing || existing.pageIndex !== target.pageIndex || existing.index !== target.index;
    if (!needsMove) return;
    const wouldOverflow = options.wouldFolderInsertOverflow(options.pages.value, folderId, activeDrag.item, target.pageIndex, options.folderPageSize.value);
    if (!shouldCommitPlacement(key, clientX, clientY, FOLDER_SORT_MIN_DISTANCE, safeOptions.force || !existing)) return;

    const next = safeOptions.force || !wouldOverflow
      ? options.insertAppIntoFolder(options.pages.value, folderId, activeDrag.item, target.pageIndex, target.index, options.folderPageSize.value)
      : options.previewAppIntoFolderWithoutOverflow(options.pages.value, folderId, activeDrag.item, target.pageIndex, target.index, options.folderPageSize.value);
    dragPlacement = key;
    rememberPlacementCommit(key, clientX, clientY);
    options.commitPages(next);
  }

  function handleFolderSessionMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    const session = options.folderSession.value;
    const folderId = options.openFolderId.value;
    if (!activeDrag || !session || !folderId) return false;

    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    const inside = rect ? isPointInsideRect(rect, clientX, clientY) : false;

    clearPendingTarget();

    if (inside) {
      if (!session.hasEntered) options.commitFolderSession({ ...session, hasEntered: true });
      if (!isDragSortingBlocked() && isInsideCurrentFolderGrid(clientX, clientY)) placeDraggedItemInFolder(folderId, clientX, clientY);
      return true;
    }

    if (!session.hasEntered) return true;

    cancelFolderSessionAndReturnToDesktop({ deferSort: true });
    return true;
  }

  function handlePageEdgeTurn(clientX) {
    const direction = getPageEdgeDirection(clientX);
    if (!direction) {
      clearPageTurn();
      return;
    }
    if (pageTurnTimer?.direction === direction) return;
    clearPageTurn();

    pageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        pageTurnTimer = null;
        const currentPage = options.pageIndex.value;
        let didTurn = false;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          if (currentPage <= 0) return;
          options.commitPageIndex(currentPage - 1);
          didTurn = true;
        } else {
          if (currentPage >= options.pages.value.length - 1) {
            const draggedItemId = dragRuntime?.item?.id;
            if (!options.canCreateDesktopPageAfterDrag(options.pages.value, currentPage, draggedItemId)) return;
            options.commitPages([...options.pages.value, []]);
          }
          options.commitPageIndex(currentPage + 1);
          didTurn = true;
        }
        if (didTurn) nextTick(schedulePageEdgeTurnFromCurrentPointer);
      }, PAGE_TURN_DELAY),
    };
  }

  function getPageEdgeDirection(clientX) {
    const width = window.innerWidth;
    return clientX > width - PAGE_EDGE_SIZE ? 1 : clientX < PAGE_EDGE_SIZE ? -1 : 0;
  }

  function schedulePageEdgeTurnFromCurrentPointer() {
    if (!dragRuntime || options.folderSession.value || options.openFolderId.value) return;
    const pointer = dragRuntime.pointer;
    if (!pointer || !getPageEdgeDirection(pointer.x)) return;
    handlePageEdgeTurn(pointer.x);
  }

  function getFolderPageEdgeDirection(clientX, clientY) {
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    if (!rect || !isPointInsideRect(rect, clientX, clientY)) return 0;

    const direction = clientX < rect.left + FOLDER_PAGE_EDGE_SIZE ? -1 : clientX > rect.right - FOLDER_PAGE_EDGE_SIZE ? 1 : 0;
    if (direction < 0 && options.folderPageIndex.value <= 0) return 0;
    return direction;
  }

  function scheduleFolderPageEdgeTurnFromCurrentPointer() {
    if (!dragRuntime || (!options.folderSession.value && !options.openFolderId.value)) return;
    const pointer = dragRuntime.pointer;
    if (!pointer || !getFolderPageEdgeDirection(pointer.x, pointer.y)) return;
    handleFolderPageEdgeTurn(pointer.x, pointer.y);
  }

  function handleFolderPageEdgeTurn(clientX, clientY) {
    const direction = getFolderPageEdgeDirection(clientX, clientY);
    if (!direction) {
      clearFolderPageTurn();
      return;
    }

    if (folderPageTurnTimer?.direction === direction) return;
    clearFolderPageTurn();

    folderPageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        folderPageTurnTimer = null;
        const currentPage = options.folderPageIndex.value;
        let didTurn = false;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          if (currentPage <= 0) return;
          options.commitFolderPageIndex(currentPage - 1);
          didTurn = true;
        } else {
          const isCreatingNewPage = currentPage >= options.folderPages.value.length - 1;
          if (isCreatingNewPage) {
            const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
            const draggedItemId = dragRuntime?.item?.id;
            if (!options.canCreateFolderPageAfterDrag(folder, currentPage, draggedItemId, options.folderPageSize.value)) return;
          }
          options.commitFolderPageIndex(currentPage + 1, { allowCreate: true });
          didTurn = true;
        }
        if (didTurn) nextTick(scheduleFolderPageEdgeTurnFromCurrentPointer);
      }, PAGE_TURN_DELAY),
    };
  }

  function handleDefaultDesktopMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;

    if (activeDrag.item.type === "app") {
      const center = getDragVisualCenter(activeDrag) || { x: clientX, y: clientY };
      const lockedTarget = getLockedTopLevelDropTarget(activeDrag);
      if (lockedTarget) {
        lockFolderHoverTarget(lockedTarget);
        return;
      }
      const targetInfo = getTopLevelTargetForDrag(activeDrag, center);
      if (targetInfo && isInsideFolderHitZone(targetInfo, center.x, center.y, activeDrag)) {
        lockFolderHoverTarget(targetInfo);
        startPendingFolderTarget(targetInfo.item);
        return;
      }
      clearPendingTarget();
    } else {
      clearPendingTarget();
    }

    placeDraggedItemOnDesktop(clientX, clientY);
  }

  function evaluateDragIntent() {
    dragIntentTimer = null;
    const activeDrag = dragRuntime;
    if (!activeDrag || options.isLaunchpadInteractionBlocked()) return;

    if (isDragSortingBlocked()) {
      scheduleDragSortGateEvaluation();
      return;
    }

    commitPendingDesktopReturn();

    if (options.folderSession.value) {
      handleFolderSessionMove(activeDrag.pointer.x, activeDrag.pointer.y);
      return;
    }

    handleDefaultDesktopMove(activeDrag.pointer.x, activeDrag.pointer.y);
  }

  function scheduleDragIntentEvaluation() {
    clearDragIntentTimer();
    dragIntentTimer = window.setTimeout(evaluateDragIntent, DRAG_INTENT_IDLE_DELAY);
  }

  function cancelLongPress() {
    if (!longPressState) return;
    window.clearTimeout(longPressState.timer);
    longPressState = null;
    clearSettledDragStartRaf();
    detachLongPressListeners();
    if (!dragRuntime) detachDragContextMenuListener();
  }

  function handleLongPressMove(event) {
    if (!longPressState) return;
    if (!isSamePointerEvent(longPressState.pointerId, event)) return;
    if (!isPrimaryPointerMoveEvent(event)) return;
    const dist = Math.hypot(event.clientX - longPressState.startPoint.x, event.clientY - longPressState.startPoint.y);
    if (dist > LONG_PRESS_MOVE_THRESHOLD) cancelLongPress();
  }

  function handleLongPressUp(event) {
    if (!longPressState) return;
    if (!isSamePointerEvent(longPressState.pointerId, event)) return;
    if (event.type === "pointercancel") {
      cancelLongPress();
      return;
    }
    if (!isPrimaryPointerReleaseEvent(event)) return;
    const lp = longPressState;
    cancelLongPress();
    if (lp.awaitingDragStart) return;
    if (options.isLaunchpadInteractionBlocked()) return;
    if (lp.item.type === "app") options.openApp(lp.item, lp.source);
    else if (lp.item.type === "folder" && lp.source.type === "page") {
      commitFolderOpenFromLongPress(lp);
    }
  }

  function commitFolderOpenFromLongPress(lp) {
    const commit = () => {
      if (options.isLaunchpadInteractionBlocked()) return;
      options.commitOpenFolder(lp.item.id, { originBounds: lp.folderOriginBounds });
    };
    if (!options.consumeFirstFolderOpenPrepare?.()) {
      commit();
      return;
    }
    window.setTimeout(commit, FIRST_FOLDER_OPEN_PREPARE_DELAY_MS);
  }

  function startLongPressDrag(lp) {
    if (longPressState !== lp) return;
    if (options.isLaunchpadInteractionBlocked()) {
      cancelLongPress();
      return;
    }
    detachLongPressListeners();
    longPressState = null;

    clearPendingTarget();
    clearDragIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();

    const geometry = getLongPressDragGeometry(lp);
    const nextDrag = {
      cellSize: lp.cellSize,
      compact: lp.dragVisualState?.compact === true,
      item: lp.item,
      source: lp.source,
      pointerId: lp.pointerId,
      pointer: { x: lp.startPoint.x, y: lp.startPoint.y },
      singleLineLabel: lp.dragVisualState?.singleLineLabel === true,
      lastPointerTime: nowMs(),
      offset: geometry.offset,
      size: geometry.size,
      start: { x: lp.startPoint.x, y: lp.startPoint.y },
      hasMoved: false,
      velocity: makeZeroVelocity(),
    };

    dragRuntime = nextDrag;
    activateLayoutProjection();
    dragMeta.value = { item: nextDrag.item, source: nextDrag.source };
    dragPlacement = lp.source.type === "page"
      ? placementKey("page", lp.source.pageIndex, lp.source.index)
      : lp.source.type === "folder"
        ? placementKey("folder", lp.source.folderId, lp.source.pageIndex, lp.source.index)
        : null;
    lastPlacementCommit = { key: dragPlacement, x: lp.startPoint.x, y: lp.startPoint.y };
    attachDragListeners();
    nextTick(() => schedulePreviewPosition(lp.startPoint.x, lp.startPoint.y));

    if (lp.source.type === "folder") {
      options.commitFolderSession({ mode: "source-folder", folderId: lp.source.folderId, hasEntered: true, openedAt: Date.now() });
    }
  }

  function requestSettledDragStartFrame(lp, remainingFrames) {
    settledDragStartRaf = window.requestAnimationFrame(() => {
      settledDragStartRaf = 0;
      if (longPressState !== lp) return;
      if (remainingFrames > 1) {
        requestSettledDragStartFrame(lp, remainingFrames - 1);
        return;
      }
      startLongPressDrag(lp);
    });
  }

  function scheduleSettledDragStart(lp) {
    lp.awaitingDragStart = true;
    lp.refreshBoundsOnStart = true;
    window.removeEventListener("pointermove", handleLongPressMove);
    nextTick(() => {
      if (longPressState !== lp) return;
      requestSettledDragStartFrame(lp, SETTLED_DRAG_START_FRAMES);
    });
  }

  function executeDragStart() {
    const lp = longPressState;
    if (!lp) return;
    if (options.isLaunchpadInteractionBlocked()) {
      cancelLongPress();
      return;
    }
    if (options.isHomeRevealSettling.value && !options.isFolderLayerActive.value) {
      options.finishHomeRevealSettleWindow();
      scheduleSettledDragStart(lp);
      return;
    }
    if (lp.refreshBoundsOnStart) {
      scheduleSettledDragStart(lp);
      return;
    }
    startLongPressDrag(lp);
  }

  function beginDrag(event, item, source) {
    if (!isPrimaryPointerStartEvent(event)) return;

    event.preventDefault();
    event.stopPropagation();

    if (options.isLaunchpadInteractionBlocked() || dragRuntime || longPressState) return;

    cancelLongPress();
    clearDragRelease();

    const folderOriginBounds = cloneFolderOriginBounds(event.folderOriginBounds);
    const dragVisualState = normalizeDragVisualState(event.dragVisualState);
    const rect = event.currentTarget.getBoundingClientRect?.() || null;
    const cellSize = getDragVisualCellSize(dragVisualState) ||
      getSourceCellSize(source) ||
      { height: rect.height, width: rect.width };
    if (item?.type === "folder" && source?.type === "page") {
      options.requestFolderOpenWarmup?.(item, folderOriginBounds);
    }

    longPressState = {
      cellSize,
      item: options.cloneItem(item),
      dragVisualState,
      folderOriginBounds,
      rect: cloneRect(rect),
      refreshBoundsOnStart: shouldRefreshLongPressBoundsOnStart(),
      source,
      pointerId: event.pointerId,
      startPoint: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      size: { width: rect.width, height: rect.height },
      timer: window.setTimeout(executeDragStart, LONG_PRESS_DELAY),
    };

    window.addEventListener("pointermove", handleLongPressMove);
    window.addEventListener("pointerup", handleLongPressUp);
    window.addEventListener("pointercancel", handleLongPressUp);
    attachDragContextMenuListener();
  }

  function updateDragPointer(event) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    if (!isSamePointerEvent(activeDrag.pointerId, event)) return;
    if (!isPrimaryPointerMoveEvent(event)) return;

    event.preventDefault();
    sampleDragVelocity(activeDrag, event);
    const distance = Math.hypot(event.clientX - activeDrag.start.x, event.clientY - activeDrag.start.y);
    activeDrag.pointer = { x: event.clientX, y: event.clientY };
    activeDrag.hasMoved = activeDrag.hasMoved || distance > 6;
    schedulePreviewPosition(event.clientX, event.clientY);

    if (options.folderSession.value || options.openFolderId.value) {
      clearPageTurn();
      handleFolderPageEdgeTurn(event.clientX, event.clientY);
    } else {
      clearFolderPageTurn();
      handlePageEdgeTurn(event.clientX);
    }

    scheduleDragIntentEvaluation();
  }

  function finishDrag(event) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    if (!shouldFinishDragForPointerEvent(activeDrag, event)) return;
    if (event.type === "pointercancel") {
      if (options.folderSession.value) cancelFolderSessionAndReturnToDesktop({ force: true });
      else commitPendingDesktopReturn({ force: true });
      clearDragRelease();
      endDrag();
      return;
    }
    if (options.isLaunchpadInteractionBlocked()) {
      clearDragRelease();
      endDrag();
      return;
    }

    sampleDragVelocity(activeDrag, event);
    activeDrag.pointer = { x: event.clientX, y: event.clientY };
    schedulePreviewPosition(event.clientX, event.clientY);
    clearDragIntentTimer();
    commitPendingDesktopReturn({ force: true });

    const center = getDragVisualCenter(activeDrag);
    const lockedTopLevelDropTarget = getLockedTopLevelDropTarget(activeDrag);
    const topLevelDropTarget = lockedTopLevelDropTarget || (center ? getTopLevelTargetForDrag(activeDrag, center) : null);
    const shouldDropOnTopLevelTarget =
      Boolean(lockedTopLevelDropTarget) ||
      Boolean(topLevelDropTarget && isInsideFolderHitZone(topLevelDropTarget, center.x, center.y, activeDrag));

    clearPageTurn();
    clearFolderPageTurn();
    clearPendingTarget();

    const session = options.folderSession.value;
    const folderId = options.openFolderId.value;
    const topLevelDropResult = !session && shouldDropOnTopLevelTarget
      ? dropDraggedAppOnTopLevelTarget(topLevelDropTarget)
      : null;
    if (topLevelDropResult?.accepted) {
      const fallbackReleaseTarget = makeReleaseTarget(topLevelDropTarget.rect, topLevelDropTarget.stageLayoutRect, topLevelDropTarget.visualSpec);
      const releaseKey = startPendingDragRelease({
        releaseMode: topLevelDropResult.releaseMode,
        suppressFolderPreviewChildId: topLevelDropResult.suppressFolderPreviewChildId,
        suppressFolderPreviewFolderId: topLevelDropResult.suppressFolderPreviewFolderId,
        targetFolderId: topLevelDropResult.folderId,
        targetPreviewSlotIndex: topLevelDropResult.previewSlotIndex,
      });
      if (releaseKey) {
        if (topLevelDropResult.releaseMode === DRAG_RELEASE_MODE_FOLDER_PREVIEW_SLOT) {
          scheduleDragReleaseTargetResolve(
            releaseKey,
            () => getFolderPreviewChildReleaseTarget(
              topLevelDropResult.folderId,
              activeDrag.item.id,
              topLevelDropResult.previewSlotIndex,
              fallbackReleaseTarget?.clientRect
            ),
            fallbackReleaseTarget?.clientRect
          );
        } else if (topLevelDropResult.releaseMode === DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB) {
          scheduleDragReleaseTargetResolve(
            releaseKey,
            () => getFolderCenterAbsorbReleaseTarget(topLevelDropResult.folderId, fallbackReleaseTarget?.clientRect),
            fallbackReleaseTarget?.clientRect
          );
        } else {
          setDragReleaseTarget(releaseKey, fallbackReleaseTarget);
        }
      }
      options.commitFolderSession(null);
      endDrag();
      return;
    }

    if (session && folderId && activeDrag.item.type === "app") {
      const panel = getDomRefElement(options.folderPanelRef.value);
      const rect = panel?.getBoundingClientRect();
      const inside = rect ? isPointInsideRect(rect, event.clientX, event.clientY) : true;
      if (!inside) {
        const insertIndex = calcPageInsertIndex(event.clientX, event.clientY);
        const fallbackReleaseTarget = getPageSlotReleaseTarget(options.pageIndex.value, insertIndex, activeDrag.size?.width);
        cancelFolderSessionAndReturnToDesktop({ force: true });
        const releaseKey = startPendingDragRelease();
        const releaseTarget = getCommittedTopLevelReleaseTarget(activeDrag.item.id, activeDrag.size?.width) || fallbackReleaseTarget;
        scheduleDragReleaseTargetResolve(releaseKey, () => getCommittedTopLevelTargetBounds(activeDrag.item.id), releaseTarget);
        endDrag();
        return;
      }
      const folderTarget = calcFolderInsertTarget(event.clientX, event.clientY);
      const fallbackReleaseTarget = getFolderSlotReleaseTarget(folderTarget.pageIndex, folderTarget.index, activeDrag.size?.width);
      placeDraggedItemInFolder(folderId, event.clientX, event.clientY, { force: true });
      const releaseKey = startPendingDragRelease();
      const releaseTarget = getCommittedFolderReleaseTarget(folderId, activeDrag.item.id, activeDrag.size?.width) || fallbackReleaseTarget;
      scheduleDragReleaseTargetResolve(releaseKey, () => getCommittedFolderTargetBounds(folderId, activeDrag.item.id), releaseTarget);
      options.commitOpenFolder(folderId);
      options.commitFolderSession(null);
    } else {
      const insertIndex = calcPageInsertIndex(event.clientX, event.clientY);
      const fallbackReleaseTarget = getPageSlotReleaseTarget(options.pageIndex.value, insertIndex, activeDrag.size?.width);
      placeDraggedItemOnDesktop(event.clientX, event.clientY, { force: true });
      const releaseKey = startPendingDragRelease();
      const releaseTarget = getCommittedTopLevelReleaseTarget(activeDrag.item.id, activeDrag.size?.width) || fallbackReleaseTarget;
      scheduleDragReleaseTargetResolve(releaseKey, () => getCommittedTopLevelTargetBounds(activeDrag.item.id), releaseTarget);
      options.commitFolderSession(null);
    }

    endDrag();
  }

  return {
    beginDrag,
    cancelLongPress,
    cancelPreviewRaf,
    clearFolderPageTurn,
    clearDragRelease,
    clearLayoutProjectionRelease,
    clearPageTurn,
    clearPendingTarget,
    detachDragListeners,
    dragFolderHoverState,
    dragFolderTargetId,
    dragMeta,
    dragPreviewState,
    dragReleaseState,
    isDragActive,
  };
}
