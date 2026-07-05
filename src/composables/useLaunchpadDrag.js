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
import {
  getFolderGridMetrics,
  getFolderPanelGeometry,
  readPx,
} from "../rendering/pixi/geometry/gridGeometry.js";
import { getFolderLayoutMetricsForRows } from "./useFolderLayoutStyles.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;
const LAYOUT_PROJECTION_RELEASE_DELAY = 260;
const DRAG_RELEASE_DURATION_MS = 180;
const DRAG_RELEASE_GHOST_PADDING_MS = 60;
const DRAG_RELEASE_FALLBACK_CLEAR_MS = 1200;
const DRAG_RELEASE_TARGET_RESOLVE_FRAMES = 3;
const DRAG_RELEASE_STABLE_TARGET_RESOLVE_FRAMES = 10;
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
  const folderCreateReleaseState = shallowRef(null);

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
  let folderCreateReleaseTimer = null;
  let folderCreateReleaseResolveRaf = 0;
  let folderCreateReleaseKey = 0;
  let dragFolderHoverKey = 0;
  let settledDragStartRaf = 0;
  let pendingFolderDragPageTurn = null;

  function isDragActive() {
    return Boolean(dragRuntime || dragReleaseState.value || folderCreateReleaseState.value);
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

  function clearPendingFolderDragPageTurn(reason = "drag-folder-page-turn-clear") {
    if (!pendingFolderDragPageTurn) return false;
    pendingFolderDragPageTurn = null;
    options.clearFolderPageTurnRequest?.(reason);
    return true;
  }

  function commitPendingFolderDragPageTurn() {
    const pending = pendingFolderDragPageTurn;
    if (!pending) return null;
    pendingFolderDragPageTurn = null;
    const result = {
      allowCreate: pending.allowCreate,
      committed: false,
      direction: pending.direction,
      folderId: pending.folderId,
      fromIndex: pending.fromIndex,
      targetIndex: pending.targetIndex,
      token: pending.token,
    };
    if (typeof options.commitFolderPageTurnRequest === "function" && pending.token != null) {
      const committed = options.commitFolderPageTurnRequest(pending.token, {
        allowCreate: pending.allowCreate,
        folderId: pending.folderId,
        phase: "open",
      });
      if (committed) return { ...result, committed: true };
      options.clearFolderPageTurnRequest?.("drag-folder-page-turn-fallback");
    }
    if (pending.targetIndex == null) return result;
    options.commitFolderPageIndex(pending.targetIndex, { allowCreate: pending.allowCreate });
    return { ...result, committed: true };
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
    if (dragRuntime && !options.isLaunchpadInteractionBlocked()) scheduleDragIntentEvaluation();
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

  function makeDragReleaseStartPose(activeDrag) {
    if (!activeDrag?.pointer) return null;
    return {
      pointer: { ...activeDrag.pointer },
    };
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

  function clearFolderCreateReleaseResolve() {
    if (folderCreateReleaseResolveRaf) window.cancelAnimationFrame(folderCreateReleaseResolveRaf);
    folderCreateReleaseResolveRaf = 0;
  }

  function clearFolderCreateRelease() {
    if (folderCreateReleaseTimer) window.clearTimeout(folderCreateReleaseTimer);
    clearFolderCreateReleaseResolve();
    folderCreateReleaseTimer = null;
    folderCreateReleaseState.value = null;
  }

  function clearDragRelease() {
    if (dragReleaseTimer) window.clearTimeout(dragReleaseTimer);
    clearDragReleaseResolve();
    dragReleaseTimer = null;
    dragReleaseState.value = null;
    clearFolderCreateRelease();
  }

  function scheduleDragReleaseClear() {
    if (dragReleaseTimer) window.clearTimeout(dragReleaseTimer);
    dragReleaseTimer = window.setTimeout(() => {
      dragReleaseTimer = null;
      dragReleaseState.value = null;
    }, DRAG_RELEASE_FALLBACK_CLEAR_MS + DRAG_RELEASE_GHOST_PADDING_MS);
  }

  function scheduleFolderCreateReleaseClear() {
    if (folderCreateReleaseTimer) window.clearTimeout(folderCreateReleaseTimer);
    folderCreateReleaseTimer = window.setTimeout(() => {
      folderCreateReleaseTimer = null;
      folderCreateReleaseState.value = null;
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

  function getMaybeRefValue(value) {
    return value && typeof value === "object" && "value" in value ? value.value : value;
  }

  function rectsAlmostEqual(a, b, epsilon = 0.5) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return Math.abs((Number(a.left) || 0) - (Number(b.left) || 0)) <= epsilon &&
      Math.abs((Number(a.top) || 0) - (Number(b.top) || 0)) <= epsilon &&
      Math.abs((Number(a.width) || 0) - (Number(b.width) || 0)) <= epsilon &&
      Math.abs((Number(a.height) || 0) - (Number(b.height) || 0)) <= epsilon;
  }

  function visualSpecsAlmostEqual(a, b, epsilon = 0.5) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.compact === b.compact &&
      a.singleLineLabel === b.singleLineLabel &&
      a.textless === b.textless &&
      Math.abs((Number(a.cellHeight) || 0) - (Number(b.cellHeight) || 0)) <= epsilon &&
      Math.abs((Number(a.cellWidth) || 0) - (Number(b.cellWidth) || 0)) <= epsilon &&
      Math.abs((Number(a.iconSize) || 0) - (Number(b.iconSize) || 0)) <= epsilon;
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

  function isReleaseTargetProvisional(target) {
    return target?.provisionalLayoutTarget === true ||
      target?.clientRect?.meta?.provisionalLayoutTarget === true ||
      target?.stageLayoutRect?.meta?.provisionalLayoutTarget === true;
  }

  function makeReleaseTarget(clientRect, stageLayoutRect = null, visualSpec = null, targetOptions = {}) {
    const safeClientRect = cloneClientRect(clientRect);
    const safeStageLayoutRect = cloneClientRect(stageLayoutRect);
    if (!safeClientRect && !safeStageLayoutRect) return null;
    return {
      clientRect: safeClientRect,
      provisionalLayoutTarget: targetOptions.provisionalLayoutTarget === true ||
        clientRect?.meta?.provisionalLayoutTarget === true ||
        stageLayoutRect?.meta?.provisionalLayoutTarget === true,
      stageLayoutRect: safeStageLayoutRect,
      visualSpec: cloneIconVisualSpec(visualSpec),
    };
  }

  function normalizeReleaseTarget(target) {
    if (target?.clientRect || target?.stageLayoutRect || target?.visualSpec) {
      return makeReleaseTarget(target.clientRect, target.stageLayoutRect, target.visualSpec, {
        provisionalLayoutTarget: target.provisionalLayoutTarget === true,
      }) || { clientRect: null, provisionalLayoutTarget: false, stageLayoutRect: null, visualSpec: null };
    }
    return makeReleaseTarget(target) || { clientRect: null, provisionalLayoutTarget: false, stageLayoutRect: null, visualSpec: null };
  }

  function releaseTargetsAlmostEqual(a, b) {
    return rectsAlmostEqual(a?.clientRect, b?.clientRect) &&
      rectsAlmostEqual(a?.stageLayoutRect, b?.stageLayoutRect) &&
      visualSpecsAlmostEqual(a?.visualSpec, b?.visualSpec) &&
      isReleaseTargetProvisional(a) === isReleaseTargetProvisional(b);
  }

  function getStableLayoutReleaseTarget(source, expected = null) {
    const record = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, source, { expected });
    const clientRect = stageLayoutRecordToClientRect(record);
    return clientRect ? makeReleaseTarget(clientRect, record, getRecordVisualSpec(record)) : null;
  }

  function clearFolderLaunchBounds(folderId) {
    if (!folderId) return;
    options.iconBoundsRegistry.clearBounds?.({
      area: "folder",
      folderId,
      kind: BOUNDS_KIND.LAUNCH,
    });
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

  function getFolderCreateReleaseTargets(folderId, targetAppId, draggedAppId, fallbackThumbTarget = null) {
    const fallbackTarget = normalizeReleaseTarget(fallbackThumbTarget);
    const registeredThumbTarget = getTopLevelFolderThumbReleaseTarget(folderId, null);
    const thumbTarget = registeredThumbTarget?.clientRect || registeredThumbTarget?.stageLayoutRect
      ? registeredThumbTarget
      : fallbackTarget;
    const targetAppSlotTarget = getFolderPreviewChildReleaseTarget(folderId, targetAppId, 0, thumbTarget.clientRect) ||
      makeReleaseTarget(
        makeFolderThumbPreviewRect(thumbTarget.clientRect, 0),
        makeFolderThumbPreviewRect(thumbTarget.stageLayoutRect, 0)
      );
    const draggedAppSlotTarget = getFolderPreviewChildReleaseTarget(folderId, draggedAppId, 1, thumbTarget.clientRect) ||
      makeReleaseTarget(
        makeFolderThumbPreviewRect(thumbTarget.clientRect, 1),
        makeFolderThumbPreviewRect(thumbTarget.stageLayoutRect, 1)
      );
    return {
      draggedAppSlotRect: draggedAppSlotTarget?.clientRect || null,
      draggedAppSlotStageLayoutRect: draggedAppSlotTarget?.stageLayoutRect || null,
      targetAppSlotRect: targetAppSlotTarget?.clientRect || null,
      targetAppSlotStageLayoutRect: targetAppSlotTarget?.stageLayoutRect || null,
      targetThumbRect: thumbTarget?.clientRect || null,
      targetThumbStageLayoutRect: thumbTarget?.stageLayoutRect || null,
    };
  }

  function getDesktopTargetIconSize(cellWidth, cellHeight, fallbackSize) {
    const configuredSize = Math.max(1, Number(options.iconSize?.value) || Number(fallbackSize) || 64);
    return Math.max(1, Math.min(configuredSize, cellWidth, cellHeight));
  }

  function getFolderPanelStyle() {
    return getMaybeRefValue(options.folderPanelStyle) || {};
  }

  function getFolderViewportHeight() {
    return Number(getMaybeRefValue(options.folderViewportHeight)) || 0;
  }

  function getElementScale(element, rect) {
    const layoutWidth = Number(element?.offsetWidth || element?.clientWidth);
    const layoutHeight = Number(element?.offsetHeight || element?.clientHeight);
    return {
      x: rect?.width && layoutWidth > 0 ? rect.width / layoutWidth : 1,
      y: rect?.height && layoutHeight > 0 ? rect.height / layoutHeight : 1,
    };
  }

  function getProjectedFolderLayoutMetrics(rowCount, fallbackSize) {
    const currentStyle = getFolderPanelStyle();
    const baseFolderIconSize = Number(options.effectiveFolderIconSize?.value) ||
      readPx(currentStyle["--folder-icon-size"], 0) ||
      Number(fallbackSize) ||
      56;
    return getFolderLayoutMetricsForRows({
      baseFolderIconSize,
      folderViewportHeight: getFolderViewportHeight(),
      rowCount,
    });
  }

  function getProjectedFolderPanelStyle(rowCount, fallbackSize) {
    const metrics = getProjectedFolderLayoutMetrics(rowCount, fallbackSize);
    return {
      ...getFolderPanelStyle(),
      "--folder-icon-cell-height": `${metrics.iconCellHeight}px`,
      "--folder-icon-size": `${metrics.effectiveIconSize}px`,
      "--folder-row-gap": `${metrics.rowGap}px`,
      "--folder-shell-min-height": `${metrics.folderShellMinHeight}px`,
    };
  }

  function getFolderProjectionStageSize() {
    const width = Number(globalThis.window?.innerWidth);
    const height = Number(globalThis.window?.innerHeight);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return { height, width };
    }
    return null;
  }

  function getFolderProjectionScale(element, rect, currentGeometry) {
    const hasLayoutSize = Number(element?.offsetWidth || element?.clientWidth) > 0 &&
      Number(element?.offsetHeight || element?.clientHeight) > 0;
    if (hasLayoutSize) return getElementScale(element, rect);
    return {
      x: rect.width / Math.max(1, currentGeometry?.grid?.width || rect.width),
      y: rect.height / Math.max(1, currentGeometry?.grid?.height || rect.height),
    };
  }

  function getProjectedFolderGridRect(element, rows, fallbackSize) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return null;
    const stageSize = getFolderProjectionStageSize();
    if (!stageSize) return rect;

    const currentGeometry = getFolderPanelGeometry({
      height: stageSize.height,
      panelStyle: getFolderPanelStyle(),
      width: stageSize.width,
    });
    const scale = getFolderProjectionScale(element, rect, currentGeometry);
    const projectedGeometry = getFolderPanelGeometry({
      height: stageSize.height,
      panelStyle: getProjectedFolderPanelStyle(rows, fallbackSize),
      width: stageSize.width,
    });
    const offsetX = rect.left - currentGeometry.grid.left * scale.x;
    const offsetY = rect.top - currentGeometry.grid.top * scale.y;
    return {
      bottom: offsetY + (projectedGeometry.grid.top + projectedGeometry.grid.height) * scale.y,
      height: projectedGeometry.grid.height * scale.y,
      left: offsetX + projectedGeometry.grid.left * scale.x,
      right: offsetX + (projectedGeometry.grid.left + projectedGeometry.grid.width) * scale.x,
      top: offsetY + projectedGeometry.grid.top * scale.y,
      width: projectedGeometry.grid.width * scale.x,
    };
  }

  function getFolderReleaseGridMetrics(pageIndex, rows, fallbackSize) {
    const element = options.folderPageRefs[pageIndex] || getFolderGridElement(pageIndex);
    const sourceRect = element?.getBoundingClientRect?.();
    const rect = getProjectedFolderGridRect(element, rows, fallbackSize) || sourceRect;
    if (!rect) return null;
    const stageSize = getFolderProjectionStageSize();
    const currentGeometry = stageSize
      ? getFolderPanelGeometry({
        height: stageSize.height,
        panelStyle: getFolderPanelStyle(),
        width: stageSize.width,
      })
      : null;
    const scale = getFolderProjectionScale(element, sourceRect || rect, currentGeometry);
    const style = getProjectedFolderPanelStyle(rows, fallbackSize);
    const cols = Math.max(1, Number(options.folderCols.value) || 1);
    return {
      metrics: getFolderGridMetrics({
        cols,
        fixedCellHeight: readPx(style["--folder-icon-cell-height"], 0) * scale.y,
        grid: rect,
        rowGap: readPx(style["--folder-row-gap"], 18) * scale.y,
        rows,
      }),
      scale,
      style,
    };
  }

  function getFolderTargetIconSize(cellWidth, cellHeight, fallbackSize, targetOptions = {}) {
    const configuredSize = Math.max(
      1,
      Number(targetOptions.iconSize) ||
        Number(options.effectiveFolderIconSize?.value) ||
        Number(fallbackSize) ||
        56
    );
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

  function getFolderSlotReleaseTarget(pageIndex, index, fallbackSize, targetOptions = {}) {
    const cols = Math.max(1, Number(options.folderCols.value) || 1);
    const rows = Math.max(1, Number(targetOptions.rows) || Number(options.visibleFolderRowCount.value) || 1);
    const releaseMetrics = getFolderReleaseGridMetrics(pageIndex, rows, fallbackSize);
    if (!releaseMetrics) return null;
    const { metrics, scale, style } = releaseMetrics;
    const safeIndex = clamp(index, 0, Math.max(0, cols * rows - 1));
    const col = safeIndex % cols;
    const row = Math.floor(safeIndex / cols);
    const cellWidth = metrics.cellWidth;
    const cellHeight = metrics.cellHeight;
    const iconSize = Math.min(readPx(style["--folder-icon-size"], 0) * Math.min(scale.x, scale.y), 56 * Math.min(scale.x, scale.y));
    const size = getFolderTargetIconSize(cellWidth, cellHeight, fallbackSize, {
      iconSize: iconSize > 0 ? iconSize : null,
    });
    return makeReleaseTarget(
      makeCenteredRect(
        metrics.gridLeft + col * (metrics.cellWidth + metrics.gapX) + metrics.cellWidth / 2,
        metrics.gridTop + row * (metrics.cellHeight + metrics.gapY) + metrics.cellHeight / 2 + getReleaseVisualOffsetY() * scale.y,
        size
      ),
      null,
      makeIconVisualSpec({
        cellHeight,
        cellWidth,
        compact: false,
        iconSize: size,
        singleLineLabel: false,
        textless: getReleaseTextless(),
      }),
      {
        provisionalLayoutTarget: targetOptions.provisionalLayoutTarget === true,
      }
    );
  }

  function getCommittedTopLevelReleaseTarget(itemId, fallbackSize) {
    const target = options.findTopLevel(options.pages.value, itemId);
    return target ? getPageSlotReleaseTarget(target.pageIndex, target.index, fallbackSize) : null;
  }

  function getCommittedFolderReleaseTarget(folderId, itemId, fallbackSize, targetOptions = {}) {
    const target = options.findInFolder(options.pages.value, folderId, itemId);
    return target ? getFolderSlotReleaseTarget(target.pageIndex, target.index, fallbackSize, targetOptions) : null;
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

  function getCommittedFolderTargetBounds(folderId, itemId, targetOptions = {}) {
    const target = options.findInFolder(options.pages.value, folderId, itemId);
    if (!target) return null;
    const source = { area: "folder", folderId, id: itemId, pageIndex: target.pageIndex };
    const expected = { area: "folder", folderId, id: itemId, index: target.index, pageIndex: target.pageIndex };
    const liveRecord = getBoundsRecord(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, source, { expected });
    const stableTarget = getStableLayoutReleaseTarget(source, expected);
    if (stableTarget || targetOptions.stableOnly) return stableTarget;
    return stableTarget ||
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
      startPose: makeDragReleaseStartPose(activeDrag),
      suppressFolderPreviewChildId: releaseOptions.suppressFolderPreviewChildId || null,
      suppressFolderPreviewFolderId: releaseOptions.suppressFolderPreviewFolderId || null,
      targetFolderId: releaseOptions.targetFolderId || null,
      targetPreviewSlotIndex: releaseOptions.targetPreviewSlotIndex ?? null,
      targetRect: null,
      targetStageLayoutRect: null,
      targetVisualSpec: null,
      targetVersion: 0,
      provisionalLayoutTarget: false,
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
    const safeProvisionalLayoutTarget = targetCandidate?.width && targetCandidate?.height
      ? releaseTarget.provisionalLayoutTarget === true
      : fallbackCandidate?.width && fallbackCandidate?.height
        ? fallbackTarget.provisionalLayoutTarget === true
        : false;
    if (!safeTargetRect?.width || !safeTargetRect?.height) {
      clearDragRelease();
      return false;
    }
    const safeStageLayoutRect = targetCandidate?.width && targetCandidate?.height ? stageLayoutCandidate : null;
    if (
      rectsAlmostEqual(current.targetRect, safeTargetRect) &&
      rectsAlmostEqual(current.targetStageLayoutRect, safeStageLayoutRect) &&
      visualSpecsAlmostEqual(current.targetVisualSpec, safeTargetVisualSpec) &&
      current.provisionalLayoutTarget === safeProvisionalLayoutTarget
    ) {
      scheduleDragReleaseClear();
      return true;
    }
    dragReleaseState.value = {
      ...current,
      provisionalLayoutTarget: safeProvisionalLayoutTarget,
      targetRect: safeTargetRect,
      targetStageLayoutRect: safeStageLayoutRect,
      targetVisualSpec: safeTargetVisualSpec,
      targetVersion: (Number(current.targetVersion) || 0) + 1,
    };
    scheduleDragReleaseClear();
    return true;
  }

  function scheduleDragReleaseTargetResolve(releaseKey, resolveTargetRect, fallbackRect, resolveOptions = {}) {
    clearDragReleaseResolve();
    let attempts = 0;
    let stableAttempts = 0;
    let previousTarget = null;
    const maxAttempts = Math.max(
      DRAG_RELEASE_TARGET_RESOLVE_FRAMES,
      Number(resolveOptions.maxAttempts) || DRAG_RELEASE_TARGET_RESOLVE_FRAMES
    );
    const minAttempts = Math.max(1, Number(resolveOptions.minAttempts) || 1);
    const settleFrames = Math.max(0, Number(resolveOptions.settleFrames) || 0);
    const continueWhileProvisional = resolveOptions.continueWhileProvisional === true;
    const maxProvisionalAttempts = Math.max(
      maxAttempts,
      Number(resolveOptions.maxProvisionalAttempts) || 90
    );
    const tryResolve = () => {
      dragReleaseResolveRaf = 0;
      if (!dragReleaseState.value || dragReleaseState.value.key !== releaseKey) return;
      attempts += 1;
      const targetRect = typeof resolveTargetRect === "function" ? resolveTargetRect() : null;
      if (targetRect) {
        const normalizedTarget = normalizeReleaseTarget(targetRect);
        const targetIsProvisional = isReleaseTargetProvisional(normalizedTarget);
        stableAttempts = releaseTargetsAlmostEqual(previousTarget, normalizedTarget)
          ? stableAttempts + 1
          : 1;
        previousTarget = normalizedTarget;
        setDragReleaseTarget(releaseKey, targetRect, fallbackRect);
        if (continueWhileProvisional && targetIsProvisional && attempts < maxProvisionalAttempts) {
          dragReleaseResolveRaf = window.requestAnimationFrame(tryResolve);
          return;
        }
        if (
          settleFrames > 0 &&
          attempts < maxAttempts &&
          (attempts < minAttempts || stableAttempts < settleFrames)
        ) {
          dragReleaseResolveRaf = window.requestAnimationFrame(tryResolve);
        }
        return;
      }
      stableAttempts = 0;
      previousTarget = null;
      if (attempts < maxAttempts) {
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

  function setFolderCreateReleaseTargets(releaseKey, targets = {}) {
    const current = folderCreateReleaseState.value;
    if (!current || current.key !== releaseKey) return false;
    const hasTarget = Boolean(
      targets.targetThumbRect?.width ||
      targets.targetThumbStageLayoutRect?.width ||
      targets.targetAppSlotRect?.width ||
      targets.targetAppSlotStageLayoutRect?.width ||
      targets.draggedAppSlotRect?.width ||
      targets.draggedAppSlotStageLayoutRect?.width
    );
    if (!hasTarget) {
      clearFolderCreateRelease();
      return false;
    }
    folderCreateReleaseState.value = {
      ...current,
      draggedAppSlotRect: cloneClientRect(targets.draggedAppSlotRect),
      draggedAppSlotStageLayoutRect: cloneClientRect(targets.draggedAppSlotStageLayoutRect),
      targetAppSlotRect: cloneClientRect(targets.targetAppSlotRect),
      targetAppSlotStageLayoutRect: cloneClientRect(targets.targetAppSlotStageLayoutRect),
      targetThumbRect: cloneClientRect(targets.targetThumbRect),
      targetThumbStageLayoutRect: cloneClientRect(targets.targetThumbStageLayoutRect),
      targetVersion: (Number(current.targetVersion) || 0) + 1,
    };
    scheduleFolderCreateReleaseClear();
    return true;
  }

  function scheduleFolderCreateReleaseTargetResolve(releaseKey, resolveTargets) {
    clearFolderCreateReleaseResolve();
    let attempts = 0;
    const tryResolve = () => {
      folderCreateReleaseResolveRaf = 0;
      const current = folderCreateReleaseState.value;
      if (!current || current.key !== releaseKey) return;
      const targets = typeof resolveTargets === "function" ? resolveTargets() : null;
      if (targets) {
        setFolderCreateReleaseTargets(releaseKey, targets);
        return;
      }
      attempts += 1;
      if (attempts < DRAG_RELEASE_TARGET_RESOLVE_FRAMES) {
        folderCreateReleaseResolveRaf = window.requestAnimationFrame(tryResolve);
        return;
      }
      setFolderCreateReleaseTargets(releaseKey, {
        draggedAppSlotRect: current.draggedAppSlotRect,
        draggedAppSlotStageLayoutRect: current.draggedAppSlotStageLayoutRect,
        targetAppSlotRect: current.targetAppSlotRect,
        targetAppSlotStageLayoutRect: current.targetAppSlotStageLayoutRect,
        targetThumbRect: current.targetThumbRect,
        targetThumbStageLayoutRect: current.targetThumbStageLayoutRect,
      });
    };
    nextTick(() => {
      if (!folderCreateReleaseState.value || folderCreateReleaseState.value.key !== releaseKey) return;
      folderCreateReleaseResolveRaf = window.requestAnimationFrame(tryResolve);
    });
  }

  function startPendingFolderCreateRelease(createResult, releaseOptions = {}) {
    const activeDrag = dragRuntime;
    if (!activeDrag || !createResult?.folderId || !createResult.targetApp || !createResult.draggedApp) {
      clearFolderCreateRelease();
      return null;
    }
    if (folderCreateReleaseTimer) window.clearTimeout(folderCreateReleaseTimer);
    clearFolderCreateReleaseResolve();
    folderCreateReleaseTimer = null;
    folderCreateReleaseKey += 1;
    const key = `folder-create-release-${folderCreateReleaseKey}-${createResult.folderId}`;
    const sourceTarget = normalizeReleaseTarget(releaseOptions.sourceTarget);
    const initialTargets = getFolderCreateReleaseTargets(
      createResult.folderId,
      createResult.targetApp.id,
      createResult.draggedApp.id,
      sourceTarget
    );
    folderCreateReleaseState.value = {
      draggedApp: options.cloneItem(createResult.draggedApp),
      draggedAppSlotRect: null,
      draggedAppSlotStageLayoutRect: null,
      duration: DRAG_RELEASE_DURATION_MS / 1000,
      folderId: createResult.folderId,
      folderItem: options.cloneItem(createResult.folderItem),
      key,
      sourceDraggedRect: cloneClientRect(getPointerReleaseRect(activeDrag)),
      sourceDraggedStageLayoutRect: null,
      sourceDraggedVisualSpec: makeIconVisualSpec({
        cellHeight: activeDrag.cellSize?.height,
        cellWidth: activeDrag.cellSize?.width,
        compact: activeDrag.compact === true,
        iconSize: activeDrag.size?.width,
        singleLineLabel: activeDrag.singleLineLabel === true,
        textless: getReleaseTextless(),
      }),
      sourceTargetRect: sourceTarget.clientRect,
      sourceTargetStageLayoutRect: sourceTarget.stageLayoutRect,
      sourceTargetVisualSpec: sourceTarget.visualSpec,
      targetApp: options.cloneItem(createResult.targetApp),
      targetAppSlotRect: null,
      targetAppSlotStageLayoutRect: null,
      targetThumbRect: null,
      targetThumbStageLayoutRect: null,
      targetVersion: 0,
      velocity: { ...(activeDrag.velocity || makeZeroVelocity()) },
    };
    setFolderCreateReleaseTargets(key, initialTargets);
    scheduleFolderCreateReleaseTargetResolve(key, () => getFolderCreateReleaseTargets(
      createResult.folderId,
      createResult.targetApp.id,
      createResult.draggedApp.id,
      sourceTarget
    ));
    return key;
  }

  function completeFolderCreateRelease(release) {
    const current = folderCreateReleaseState.value;
    if (!current || current.key !== release?.key) return;
    clearFolderCreateRelease();
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
    clearPendingFolderDragPageTurn("drag-end");
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

  function getActiveFolderPageIndex() {
    const visualIndex = Number(options.visualFolderPageIndex?.value);
    const requestedIndex = Number.isFinite(visualIndex)
      ? visualIndex
      : Number(pendingFolderDragPageTurn?.targetIndex);
    const fallback = Number(options.folderPageIndex.value) || 0;
    const maxIndex = Math.max(
      0,
      options.folderPages.value.length - 1,
      Number.isFinite(requestedIndex) ? requestedIndex : fallback
    );
    return clamp(Number.isFinite(requestedIndex) ? requestedIndex : fallback, 0, maxIndex);
  }

  function getFolderGridElement(pageIndex) {
    const targetPageIndex = Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : getActiveFolderPageIndex();
    return options.folderPageRefs[targetPageIndex] ||
      options.folderPageRefs[options.folderPageIndex.value] ||
      options.folderPageRefs.find(Boolean) ||
      null;
  }

  function getCurrentFolderGridElement() {
    return getFolderGridElement(getActiveFolderPageIndex());
  }

  function isInsideCurrentFolderGrid(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const rect = grid?.getBoundingClientRect();
    return rect ? isPointInsideRect(rect, clientX, clientY) : false;
  }

  function calcFolderInsertTarget(clientX, clientY, targetOptions = {}) {
    const requestedPageIndex = Number(targetOptions.pageIndex);
    const activePageIndex = Number.isFinite(requestedPageIndex)
      ? Math.max(0, requestedPageIndex)
      : getActiveFolderPageIndex();
    const grid = getFolderGridElement(activePageIndex);
    const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
    if (!grid || !folder) {
      const fallbackPages = options.getFolderChildPages(folder, options.folderPageSize.value);
      const fallbackPageIndex = clamp(activePageIndex, 0, Math.max(0, fallbackPages.length - 1, activePageIndex));
      return { pageIndex: fallbackPageIndex, index: fallbackPages[fallbackPageIndex]?.length || 0 };
    }

    const columnCount = Math.max(1, options.folderCols.value);
    const rowCount = Math.max(1, Number(targetOptions.rows) || options.visibleFolderRowCount.value);
    const releaseMetrics = getFolderReleaseGridMetrics(activePageIndex, rowCount, targetOptions.fallbackSize);
    const metrics = releaseMetrics?.metrics;
    const rect = metrics
      ? {
        height: metrics.gridHeight,
        left: metrics.gridLeft,
        top: metrics.gridTop,
        width: metrics.gridWidth,
      }
      : grid.getBoundingClientRect();
    const cellWidth = metrics?.cellWidth || rect.width / columnCount;
    const cellHeight = metrics?.cellHeight || rect.height / rowCount;
    const rowStep = cellHeight + (metrics?.gapY || 0);
    const colStep = cellWidth + (metrics?.gapX || 0);
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / colStep), 0, columnCount - 1);
    const row = clamp(Math.floor(y / rowStep), 0, rowCount - 1);
    return { pageIndex: activePageIndex, index: row * columnCount + col, rows: rowCount };
  }

  function getFolderMaxRowCount(columnCount = options.folderCols.value) {
    const cols = Math.max(1, Number(columnCount) || 1);
    const pageSize = Math.max(cols, Number(options.folderPageSize.value) || cols);
    return Math.max(1, Math.ceil(pageSize / cols));
  }

  function getFolderRowsForItemCount(itemCount, columnCount = options.folderCols.value) {
    const cols = Math.max(1, Number(columnCount) || 1);
    const rows = Math.ceil(Math.max(0, Number(itemCount) || 0) / cols) || 1;
    return clamp(rows, 1, getFolderMaxRowCount(cols));
  }

  function getFolderPagesWithoutItem(folderId, itemId) {
    const folder = folderId ? options.findFolder(options.pages.value, folderId)?.item : null;
    const childPages = options.getFolderChildPages(folder, options.folderPageSize.value);
    const pages = (childPages?.length ? childPages : [[]]).map((page) =>
      (page || []).filter((item) => item?.id !== itemId)
    );
    return pages.length ? pages : [[]];
  }

  function getFolderPageAppendIndex(folderId, pageIndex, itemId) {
    const childPages = getFolderPagesWithoutItem(folderId, itemId);
    const safePageIndex = Math.max(0, Number(pageIndex) || 0);
    return childPages?.[safePageIndex]?.length || 0;
  }

  // Release can happen before Pixi has rendered the row created by the drop.
  // Project the post-insert row count so the fallback target does not clamp to the old grid.
  function getProjectedFolderRowCount(folderId, targetPageIndex, itemId) {
    const columnCount = Math.max(1, Number(options.folderCols.value) || 1);
    const pageSize = Math.max(1, Number(options.folderPageSize.value) || columnCount);
    const safeTargetPageIndex = Math.max(0, Number(targetPageIndex) || 0);
    const counts = getFolderPagesWithoutItem(folderId, itemId).map((page) => (page || []).length);
    while (counts.length <= safeTargetPageIndex) counts.push(0);
    counts[safeTargetPageIndex] += 1;

    for (let pageIndex = safeTargetPageIndex; pageIndex < counts.length; pageIndex += 1) {
      while (counts[pageIndex] > pageSize) {
        counts[pageIndex] -= 1;
        if (counts.length <= pageIndex + 1) counts.push(0);
        counts[pageIndex + 1] += 1;
      }
    }

    return counts.reduce(
      (maxRows, count) => Math.max(maxRows, getFolderRowsForItemCount(count, columnCount)),
      1
    );
  }

  function isFolderTurnReleaseEdge(turn, clientX, clientY) {
    if (!turn?.committed || !Number.isFinite(Number(turn.targetIndex))) return false;
    const direction = Number(turn.direction) || Math.sign(Number(turn.targetIndex) - Number(turn.fromIndex));
    if (!direction) return false;
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    if (!rect || !isPointInsideRect(rect, clientX, clientY)) return false;
    return direction < 0
      ? clientX <= rect.left + FOLDER_PAGE_EDGE_SIZE
      : clientX >= rect.right - FOLDER_PAGE_EDGE_SIZE;
  }

  function calcFolderReleaseInsertTarget(folderId, activeDrag, clientX, clientY, turn = null) {
    if (isFolderTurnReleaseEdge(turn, clientX, clientY)) {
      const targetPageIndex = Math.max(0, Number(turn.targetIndex) || 0);
      const rows = getProjectedFolderRowCount(folderId, targetPageIndex, activeDrag?.item?.id);
      return {
        index: getFolderPageAppendIndex(folderId, targetPageIndex, activeDrag?.item?.id),
        pageIndex: targetPageIndex,
        rows,
      };
    }
    const activePageIndex = getActiveFolderPageIndex();
    const rows = getProjectedFolderRowCount(folderId, activePageIndex, activeDrag?.item?.id);
    return calcFolderInsertTarget(clientX, clientY, {
      fallbackSize: activeDrag?.size?.width,
      pageIndex: activePageIndex,
      rows,
    });
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

  function createTopLevelFolderFromAppTarget(targetAppId, createOptions = {}) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return { accepted: false };

    const withoutDragged = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    const target = options.findTopLevel(withoutDragged, targetAppId);
    if (!target || target.item.type !== "app") return { accepted: false };

    const folderId = options.makeId("folder");
    const targetApp = options.cloneItem(target.item);
    const draggedApp = options.cloneItem(activeDrag.item);
    const childPage = [targetApp];
    if (createOptions.includeDraggedApp) childPage.push(draggedApp);
    const folderItem = options.withFolderPages(
      { id: folderId, type: "folder", name: "新文件夹" },
      [childPage]
    );
    const originGeometry =
      options.getTopLevelIconMotionGeometry(targetAppId, folderId) ||
      options.getPageSlotMotionGeometry(folderId, target.pageIndex, target.index);
    const next = options.clonePages(withoutDragged);
    next[target.pageIndex][target.index] = folderItem;

    dragPlacement = placementKey(createOptions.openAfterCreate ? "folder-open" : "folder-drop", folderId);
    lastPlacementCommit = null;
    options.commitPages(options.compactPages(next));
    if (createOptions.openAfterCreate) {
      options.commitOpenFolder(folderId, { originGeometry });
      options.commitFolderSession({ mode: "created", folderId, targetApp, hasEntered: false, openedAt: Date.now() });
      blockDragSorting();
    }
    return {
      accepted: true,
      draggedApp,
      folderId,
      folderItem,
      originGeometry,
      targetApp,
      targetInfo: createOptions.targetInfo || null,
    };
  }

  function createFolderForDrop(targetAppId) {
    createTopLevelFolderFromAppTarget(targetAppId, {
      includeDraggedApp: false,
      openAfterCreate: true,
    });
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

    const created = createTopLevelFolderFromAppTarget(target.item.id, {
      includeDraggedApp: true,
      openAfterCreate: false,
      targetInfo,
    });
    if (!created.accepted) return { accepted: false };
    return {
      accepted: true,
      createRelease: true,
      draggedApp: created.draggedApp,
      folderId: created.folderId,
      folderItem: created.folderItem,
      previewSlotIndex: null,
      releaseMode: DRAG_RELEASE_MODE_SLOT,
      targetApp: created.targetApp,
      targetInfo: created.targetInfo || targetInfo,
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
    const target = safeOptions.target || calcFolderInsertTarget(clientX, clientY);
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
    clearFolderLaunchBounds(folderId);
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
    if (direction < 0 && getActiveFolderPageIndex() <= 0) return 0;
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
        const currentPage = getActiveFolderPageIndex();
        const targetPage = currentPage + (direction < 0 ? -1 : 1);
        let didTurn = false;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          if (currentPage <= 0) return;
          didTurn = requestOrCommitFolderDragPageTurn(targetPage, { allowCreate: false, fromIndex: currentPage });
        } else {
          const isCreatingNewPage = currentPage >= options.folderPages.value.length - 1;
          if (isCreatingNewPage) {
            const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
            const draggedItemId = dragRuntime?.item?.id;
            if (!options.canCreateFolderPageAfterDrag(folder, currentPage, draggedItemId, options.folderPageSize.value)) return;
          }
          didTurn = requestOrCommitFolderDragPageTurn(targetPage, { allowCreate: isCreatingNewPage, fromIndex: currentPage });
        }
        if (didTurn) nextTick(scheduleFolderPageEdgeTurnFromCurrentPointer);
      }, PAGE_TURN_DELAY),
    };
  }

  function requestOrCommitFolderDragPageTurn(targetPage, turnOptions = {}) {
    const folderId = options.openFolderId.value || options.renderedFolder.value?.id || null;
    const fromIndex = Number.isFinite(Number(turnOptions.fromIndex))
      ? Number(turnOptions.fromIndex)
      : Number(options.folderPageIndex.value) || 0;
    if (typeof options.requestFolderPageTurn === "function") {
      const token = options.requestFolderPageTurn(targetPage, {
        allowCreate: Boolean(turnOptions.allowCreate),
        folderId,
        phase: "open",
        source: "drag-edge",
      });
      if (token != null) {
        const request = options.folderPageTurnRequest?.value;
        const resolvedTargetPage = request?.token === token ? request.targetIndex : targetPage;
        pendingFolderDragPageTurn = {
          allowCreate: Boolean(turnOptions.allowCreate),
          direction: Math.sign(resolvedTargetPage - fromIndex),
          folderId,
          fromIndex,
          targetIndex: resolvedTargetPage,
          token,
        };
        return true;
      }
    }
    pendingFolderDragPageTurn = null;
    options.commitFolderPageIndex(targetPage, { allowCreate: Boolean(turnOptions.allowCreate) });
    return true;
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
    clearDragIntentTimer();
    const folderPageTurnCommit = options.folderSession.value || options.openFolderId.value
      ? commitPendingFolderDragPageTurn()
      : null;
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
      if (topLevelDropResult.createRelease) {
        startPendingFolderCreateRelease(topLevelDropResult, {
          sourceTarget: fallbackReleaseTarget,
        });
        options.commitFolderSession(null);
        endDrag();
        return;
      }
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
      const folderTarget = calcFolderReleaseInsertTarget(folderId, activeDrag, event.clientX, event.clientY, folderPageTurnCommit);
      const visibleRows = Math.max(1, Number(options.visibleFolderRowCount.value) || 1);
      const releaseTargetOptions = {
        ...folderTarget,
        provisionalLayoutTarget: Number(folderTarget.rows) > visibleRows,
      };
      const fallbackReleaseTarget = getFolderSlotReleaseTarget(
        folderTarget.pageIndex,
        folderTarget.index,
        activeDrag.size?.width,
        releaseTargetOptions
      );
      placeDraggedItemInFolder(folderId, event.clientX, event.clientY, { force: true, target: folderTarget });
      const releaseKey = startPendingDragRelease();
      const releaseTarget = getCommittedFolderReleaseTarget(
        folderId,
        activeDrag.item.id,
        activeDrag.size?.width,
        releaseTargetOptions
      ) || fallbackReleaseTarget;
      if (releaseKey) setDragReleaseTarget(releaseKey, releaseTarget || fallbackReleaseTarget);
      scheduleDragReleaseTargetResolve(
        releaseKey,
        () => getCommittedFolderTargetBounds(folderId, activeDrag.item.id, { stableOnly: true }),
        releaseTarget,
        {
          continueWhileProvisional: true,
          maxAttempts: DRAG_RELEASE_STABLE_TARGET_RESOLVE_FRAMES,
          minAttempts: 6,
          settleFrames: 3,
        }
      );
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
    clearFolderCreateRelease,
    clearLayoutProjectionRelease,
    clearPageTurn,
    clearPendingTarget,
    completeFolderCreateRelease,
    detachDragListeners,
    dragFolderHoverState,
    dragFolderTargetId,
    dragMeta,
    dragPreviewState,
    dragReleaseState,
    folderCreateReleaseState,
    isDragActive,
  };
}
