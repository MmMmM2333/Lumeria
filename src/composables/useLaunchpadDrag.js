import { nextTick, shallowRef } from "vue";
import {
  FOLDER_PAGE_EDGE_SIZE,
  FOLDER_HOVER_STICKY_MARGIN,
  PAGE_EDGE_SIZE,
  PAGE_TURN_DELAY,
} from "./launchpadConstants.js";
import {
  clamp,
  expandRect,
  isPointInsideRect,
} from "../domain/launchpadLayout.js";
import { getDomRefElement } from "./usePageGridMetrics.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";
import {
  indexGroupDragSources,
  resolveGroupGatherEntries,
  selectGroupGatherRepresentatives,
} from "../domain/groupGatherOrigins.js";
import { makeGroupReleasePlan } from "../domain/groupReleasePlan.js";
import { prefersReducedMotion } from "../rendering/pixi/animation/motionPreferences.js";
import { appendGroupTrailPoint } from "../rendering/pixi/scene/groupDragPresentation.js";
import { makeIconVisualSpec } from "../rendering/pixi/scene/iconVisualSpec.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;
const GROUP_DRAG_VISUAL_LIMIT = 12;
// Group target intent is sampled on a short pointer cadence.  The generic
// idle delay is intentionally not used here: waiting 140ms leaves the drag
// visually over a target while the planner still reports the old desktop
// slot, which makes app-on-app drops feel slippery.
const GROUP_DROP_INTENT_DELAY_MS = 42;
const GROUP_FOLDER_HOVER_OPEN_MS = 920;
const GROUP_FOLDER_HOVER_FLASH_MS = 540;
const FOLDER_HIT_CANDIDATE_MARGIN = 6;
const FOLDER_HIT_INTENT_MAX_SIZE = 64;
const LAYOUT_PROJECTION_RELEASE_DELAY_MS = 260;
const POINTER_MOVE_THRESHOLD = 6;
const VELOCITY_SMOOTHING = 0.6;
const VELOCITY_MAX_DELTA_MS = 80;

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

function readPointerTime(event) {
  const time = Number(event?.timeStamp);
  return Number.isFinite(time) && time > 0 ? time : nowMs();
}

function zeroVelocity() {
  return { x: 0, y: 0 };
}

export function samplePointerVelocity(previous = {}, event = {}, options = {}) {
  const smoothing = clamp(Number(options.smoothing ?? VELOCITY_SMOOTHING), 0, 1);
  const maxDeltaMs = Math.max(1, Number(options.maxDeltaMs ?? VELOCITY_MAX_DELTA_MS));
  const time = readPointerTime(event);
  const previousPointer = previous.pointer || { x: event.clientX, y: event.clientY };
  const previousTime = Number(previous.time) || time;
  const deltaMs = Math.max(1, Math.min(maxDeltaMs, time - previousTime));
  const instant = {
    x: ((Number(event.clientX) - previousPointer.x) / deltaMs) * 1000,
    y: ((Number(event.clientY) - previousPointer.y) / deltaMs) * 1000,
  };
  const velocity = previous.velocity || zeroVelocity();
  return {
    pointer: { x: Number(event.clientX), y: Number(event.clientY) },
    time,
    velocity: {
      x: velocity.x + (instant.x - velocity.x) * smoothing,
      y: velocity.y + (instant.y - velocity.y) * smoothing,
    },
  };
}

function cloneRect(rect) {
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

function centerRect(rect, fallback = { x: 0, y: 0 }) {
  if (!rect) return { ...fallback };
  return {
    x: Number(rect.left) + Number(rect.width) / 2,
    y: Number(rect.top) + Number(rect.height) / 2,
  };
}

function rectsIntersect(left, right) {
  if (!left || !right) return false;
  return left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top;
}

function makeCenteredRect(rect, width, height) {
  if (!rect || width <= 0 || height <= 0) return null;
  const left = Number(rect.left) + (Number(rect.width) - width) / 2;
  const top = Number(rect.top) + (Number(rect.height) - height) / 2;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

function intentKey(intent) {
  if (!intent) return "invalid";
  return [
    intent.type,
    intent.folderId || "",
    intent.targetAppId || "",
    intent.pageIndex ?? "",
    intent.index ?? "",
    intent.allowCreate === true ? "create" : "",
    intent.reason || "",
  ].join(":");
}

function updateLayoutProjection(group, intent, plan) {
  // Folder/app intent is semantic only; keep the last slot projection until
  // release so the hidden source never exposes a hole in the base layout.
  if (!["desktop-slot", "open-folder-slot"].includes(intent?.type)) return;
  if (plan.status === "accepted") {
    group.projectedPages = plan.projectedPages || plan.nextPages;
  } else if (plan.status === "noop") {
    group.projectedPages = null;
  }
}

function getFolderChildrenPages(folder) {
  if (Array.isArray(folder?.childPages)) return folder.childPages;
  return [Array.isArray(folder?.children) ? folder.children : []];
}

function findFolderInPages(pages, folderId) {
  for (const page of pages || []) {
    const folder = (page || []).find((item) => item?.id === folderId && item.type === "folder");
    if (folder) return folder;
  }
  return null;
}

export function useLaunchpadDrag(options) {
  if (typeof options.getNewFolderName !== "function") {
    throw new TypeError("useLaunchpadDrag requires getNewFolderName");
  }
  if (typeof options.planGroupDrop !== "function") {
    throw new TypeError("useLaunchpadDrag requires planGroupDrop");
  }
  if (typeof options.commitGroupDrop !== "function") {
    throw new TypeError("useLaunchpadDrag requires commitGroupDrop");
  }

  const dragMeta = shallowRef(null);
  const dragFolderHoverState = shallowRef(null);
  const dragFolderTargetId = shallowRef(null);
  const dragHitDebugState = shallowRef(null);
  const groupDragState = shallowRef(null);
  const projectedPages = shallowRef(null);

  let activeDrag = null;
  let pendingDragStart = null;
  let previewFrame = 0;
  let intentTimer = null;
  let pageTurnTimer = null;
  let folderPageTurnTimer = null;
  let folderHoverTimer = null;
  let folderHoverFlashTimer = null;
  let projectionReleaseTimer = null;
  let contextMenuAttached = false;
  let groupKey = 0;
  let hoverKey = 0;
  let debugKey = 0;

  function isDragActive() {
    return Boolean(activeDrag);
  }

  function canUserCancelDrag(drag = activeDrag) {
    return Boolean(
      drag?.group &&
      drag.group.standalone !== true &&
      drag.group.presentationOnly !== true &&
      ["gathering", "dragging"].includes(drag.group.phase)
    );
  }

  function setLayoutProjectionActive(value) {
    if (options.isLayoutProjectionActive && typeof options.isLayoutProjectionActive === "object") {
      options.isLayoutProjectionActive.value = Boolean(value);
    }
  }

  function clearLayoutProjectionRelease(reset = false) {
    if (projectionReleaseTimer) window.clearTimeout(projectionReleaseTimer);
    projectionReleaseTimer = null;
    if (reset) setLayoutProjectionActive(false);
  }

  function scheduleLayoutProjectionRelease() {
    clearLayoutProjectionRelease();
    projectionReleaseTimer = window.setTimeout(() => {
      projectionReleaseTimer = null;
      setLayoutProjectionActive(false);
    }, prefersReducedMotion() ? 0 : LAYOUT_PROJECTION_RELEASE_DELAY_MS);
  }

  function suppressContextMenu(event) {
    if (!activeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function attachContextMenu() {
    if (contextMenuAttached) return;
    contextMenuAttached = true;
    window.addEventListener("contextmenu", suppressContextMenu, true);
  }

  function detachContextMenu() {
    if (!contextMenuAttached) return;
    contextMenuAttached = false;
    window.removeEventListener("contextmenu", suppressContextMenu, true);
  }

  function clearIntentTimer() {
    if (intentTimer) window.clearTimeout(intentTimer);
    intentTimer = null;
  }

  function clearPageTurn() {
    if (pageTurnTimer) window.clearTimeout(pageTurnTimer.timer);
    pageTurnTimer = null;
  }

  function clearFolderPageTurn() {
    if (folderPageTurnTimer) window.clearTimeout(folderPageTurnTimer.timer);
    folderPageTurnTimer = null;
    options.clearFolderPageTurnRequest?.("group-drag-clear");
  }

  function clearFolderHoverTimers() {
    if (folderHoverTimer) window.clearTimeout(folderHoverTimer);
    if (folderHoverFlashTimer) window.clearTimeout(folderHoverFlashTimer);
    folderHoverTimer = null;
    folderHoverFlashTimer = null;
  }

  function clearLockedTarget() {
    if (activeDrag?.group) activeDrag.group.lockedTarget = null;
  }

  function clearPendingTarget() {
    clearFolderHoverTimers();
    clearLockedTarget();
    if (activeDrag?.group) activeDrag.group.pendingOpenFolderId = null;
    dragFolderTargetId.value = null;
    dragFolderHoverState.value = null;
  }

  function cancelPreviewRaf() {
    if (previewFrame) window.cancelAnimationFrame(previewFrame);
    previewFrame = 0;
  }

  function getRenderedLaunchRect(source) {
    return options.iconBoundsRegistry.getBounds(
      BOUNDS_KIND.LAUNCH,
      BOUNDS_VARIANT.RENDERED,
      source
    );
  }

  function getRenderedFolderRect(folderId) {
    return options.iconBoundsRegistry.getBounds(
      BOUNDS_KIND.TOP_LEVEL,
      BOUNDS_VARIANT.RENDERED,
      folderId
    ) || options.iconBoundsRegistry.getBounds(
      BOUNDS_KIND.FOLDER_THUMB,
      BOUNDS_VARIANT.RENDERED,
      folderId
    );
  }

  function getVisualDesktopPageIndex(drag = activeDrag) {
    return Math.max(
      0,
      Number(drag?.group?.desktopPageIndex ?? options.pageIndex.value) || 0
    );
  }

  function getPageRect(index = getVisualDesktopPageIndex()) {
    return options.pageRefs?.[index]?.getBoundingClientRect?.() || null;
  }

  function getFolderPageRect(index = options.folderPageIndex.value) {
    return options.folderPageRefs?.[index]?.getBoundingClientRect?.() ||
      options.folderPageRefs?.find(Boolean)?.getBoundingClientRect?.() ||
      null;
  }

  function getPointerCenter(drag = activeDrag) {
    if (!drag) return null;
    return {
      x: drag.pointer.x - drag.offset.x + drag.size.width / 2,
      y: drag.pointer.y - drag.offset.y + drag.size.height / 2,
    };
  }

  function getDragVisualRect(drag = activeDrag) {
    if (!drag?.pointer || !drag.offset || !drag.size) return null;
    const left = drag.pointer.x - drag.offset.x;
    const top = drag.pointer.y - drag.offset.y;
    const width = Number(drag.size.width) || 0;
    const height = Number(drag.size.height) || 0;
    return {
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
    };
  }

  function getBatchCancelZoneRect() {
    if (!canUserCancelDrag() || typeof options.getBatchCancelZoneRect !== "function") {
      return null;
    }
    const rect = cloneRect(options.getBatchCancelZoneRect());
    return rect?.width > 0 && rect?.height > 0 ? rect : null;
  }

  function isPointerInsideBatchCancelZone(drag = activeDrag) {
    const rect = getBatchCancelZoneRect();
    return Boolean(
      drag?.pointer &&
      rect &&
      isPointInsideRect(rect, drag.pointer.x, drag.pointer.y)
    );
  }

  function getSourceCellSize(source, fallbackRect) {
    const isFolder = source?.type === "folder";
    const rect = isFolder ? getFolderPageRect(source.pageIndex) : getPageRect(source?.pageIndex);
    if (!rect) return { height: fallbackRect.height, width: fallbackRect.width };
    const cols = Math.max(1, Number((isFolder ? options.folderCols : options.gridCols).value) || 1);
    const rowRef = isFolder ? options.visibleFolderRowCount : options.gridRows;
    const rows = Math.max(1, Number(rowRef.value) || 1);
    return {
      height: rect.height / rows,
      width: rect.width / cols,
    };
  }

  function buildGatherEntriesFromSnapshot(snapshot) {
    const viewportRect = getPageRect(snapshot.activePageIndex) || {
      height: Number(globalThis.innerHeight) || 1,
      left: 0,
      top: 0,
      width: Number(globalThis.innerWidth) || 1,
    };
    const entries = resolveGroupGatherEntries({
      activeFolderPageIndex: snapshot.activeFolderPageIndex,
      activePageIndex: snapshot.activePageIndex,
      draggedIds: snapshot.draggedIds,
      getDesktopRect: (location) => getRenderedLaunchRect({
        area: "desktop",
        id: location.item.id,
        pageIndex: location.pageIndex,
      }),
      getFolderLaunchRect: (location) => getRenderedLaunchRect({
        area: "folder",
        folderId: location.folderId,
        id: location.item.id,
        pageIndex: location.folderPageIndex,
      }),
      getFolderPreviewRect: (location) => options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.PREVIEW_CHILD,
        BOUNDS_VARIANT.RENDERED,
        {
          childId: location.item.id,
          folderId: location.folderId,
          slotIndex: location.flatIndex,
        }
      ),
      getFolderRect: (folderId) => getRenderedFolderRect(folderId),
      folderPanelRect: getDomRefElement(options.folderPanelRef.value)?.getBoundingClientRect?.() || null,
      leadId: snapshot.leadId,
      leadRect: snapshot.leadRect,
      openFolderId: snapshot.openFolderId,
      pages: snapshot.pages,
      pointer: snapshot.pointer,
      viewportRect,
    });
    return selectGroupGatherRepresentatives(entries, GROUP_DRAG_VISUAL_LIMIT);
  }

  function buildGatherEntries(descriptor, drag) {
    return buildGatherEntriesFromSnapshot({
      activeFolderPageIndex: options.folderPageIndex.value,
      activePageIndex: options.pageIndex.value,
      draggedIds: drag.group.draggedIds,
      leadId: drag.group.leadId,
      leadRect: descriptor.rect,
      openFolderId: options.openFolderId.value,
      pages: drag.group.basePages,
      pointer: descriptor.startPoint,
    });
  }

  function makeActiveDragVisualSpec(drag = activeDrag) {
    if (!drag) return null;
    return makeIconVisualSpec({
      cellHeight: drag.cellSize?.height,
      cellWidth: drag.cellSize?.width,
      compact: drag.compact === true,
      iconSize: drag.size?.width,
      singleLineLabel: drag.singleLineLabel === true,
      textless: (drag.group?.draggedIds?.length || 0) > 1 ||
        options.isTextlessMode?.value === true,
    });
  }

  function publishGroupState(overrides = {}) {
    if (!activeDrag?.group) {
      groupDragState.value = null;
      projectedPages.value = null;
      return null;
    }
    const group = activeDrag.group;
    const holdsReleaseLayout = Boolean(
      group.presentationOnly === true &&
      group.releaseCreatedFolderId &&
      group.releaseLayoutAnchorId &&
      (group.phase === "committing" || group.phase === "accepted")
    );
    const state = {
      canCancel: canUserCancelDrag(activeDrag),
      cancelArmed: group.cancelArmed === true,
      cancelSource: group.cancelSource || null,
      center: getPointerCenter(activeDrag),
      draggedIds: [...group.draggedIds],
      dropReason: group.dropReason,
      dropStatus: group.dropStatus,
      desktopPageIndex: group.desktopPageIndex,
      entries: group.entries,
      intent: group.intent,
      key: group.key,
      phase: group.phase,
      pointer: { ...activeDrag.pointer },
      projectedPages: group.projectedPages,
      reducedMotion: prefersReducedMotion(),
      releaseCreatedFolderId: group.releaseCreatedFolderId,
      releaseLayoutAnchorId: holdsReleaseLayout ? group.releaseLayoutAnchorId : null,
      releaseLayoutPages: holdsReleaseLayout ? group.basePages : null,
      releasePlan: group.releasePlan,
      releaseStatus: group.releaseStatus || null,
      releaseSettledIds: group.releaseSettledIds || [],
      source: activeDrag.source,
      totalCount: group.draggedIds.length,
      trail: group.trail,
      visualSpec: makeActiveDragVisualSpec(activeDrag),
      ...overrides,
    };
    groupDragState.value = state;
    projectedPages.value = group.projectedPages || null;
    return state;
  }

  function scheduleVisualPublish() {
    if (previewFrame) return;
    previewFrame = window.requestAnimationFrame(() => {
      previewFrame = 0;
      publishGroupState();
    });
  }

  function enterBatchCancelZone() {
    const group = activeDrag?.group;
    if (!group || group.cancelArmed) return false;
    group.cancelArmed = true;
    group.cancelSource = null;
    group.intent = { type: "cancel" };
    group.intentKey = "cancel";
    group.dropReason = null;
    group.dropStatus = "cancel";
    group.projectedPages = null;
    projectedPages.value = null;
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    clearPendingTarget();
    dragHitDebugState.value = null;
    publishGroupState();
    return true;
  }

  function leaveBatchCancelZone() {
    const group = activeDrag?.group;
    if (!group?.cancelArmed) return false;
    group.cancelArmed = false;
    group.intent = null;
    group.intentKey = null;
    group.dropReason = null;
    group.dropStatus = null;
    evaluateIntent({ force: true });
    return true;
  }

  function syncBatchCancelZone() {
    if (!canUserCancelDrag()) return false;
    const armed = isPointerInsideBatchCancelZone();
    if (armed) enterBatchCancelZone();
    else leaveBatchCancelZone();
    return armed;
  }

  function calcDesktopInsertIndex(clientX, clientY, targetPageIndex = getVisualDesktopPageIndex()) {
    const rect = getPageRect(targetPageIndex);
    if (!rect) return options.pages.value[targetPageIndex]?.length || 0;
    const cols = Math.max(1, Number(options.gridCols.value) || 1);
    const rows = Math.max(1, Number(options.gridRows.value) || 1);
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / cols)), 0, cols - 1);
    const row = clamp(Math.floor(y / (rect.height / rows)), 0, rows - 1);
    return row * cols + col;
  }

  function calcFolderInsertIndex(clientX, clientY) {
    const pageIndex = Math.max(0, Number(options.visualFolderPageIndex?.value ?? options.folderPageIndex.value) || 0);
    const rect = getFolderPageRect(pageIndex);
    if (!rect) {
      const folder = findFolderInPages(options.pages.value, options.openFolderId.value);
      return {
        index: getFolderChildrenPages(folder)[pageIndex]?.length || 0,
        pageIndex,
      };
    }
    const cols = Math.max(1, Number(options.folderCols.value) || 1);
    const rows = Math.max(1, Number(options.visibleFolderRowCount.value) || 1);
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / cols)), 0, cols - 1);
    const row = clamp(Math.floor(y / (rect.height / rows)), 0, rows - 1);
    return { index: row * cols + col, pageIndex };
  }

  function getTopLevelTargetById(targetId) {
    if (!activeDrag || activeDrag.item.type === "folder" || !targetId) return null;
    if (activeDrag.group.draggedIds.includes(targetId)) return null;
    const found = options.findTopLevel(options.pages.value, targetId);
    if (!found?.item) return null;
    const rect = getRenderedFolderRect(targetId) ||
      getRenderedLaunchRect({
        area: "desktop",
        id: targetId,
        pageIndex: found.pageIndex,
      }) ||
      options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.TOP_LEVEL,
        BOUNDS_VARIANT.RENDERED,
        targetId
      );
    return rect ? { ...found, rect } : null;
  }

  function getTargetIntentRect(rect) {
    const safeRect = cloneRect(rect);
    if (!safeRect || safeRect.width <= 0 || safeRect.height <= 0) return null;
    return makeCenteredRect(
      safeRect,
      Math.min(safeRect.width, FOLDER_HIT_INTENT_MAX_SIZE),
      Math.min(safeRect.height, FOLDER_HIT_INTENT_MAX_SIZE)
    );
  }

  function getTargetStickyRect(target) {
    const intentRect = getTargetIntentRect(target?.rect);
    return intentRect ? expandRect(intentRect, FOLDER_HOVER_STICKY_MARGIN) : null;
  }

  function lockTopLevelTarget(target) {
    const stickyRect = getTargetStickyRect(target);
    if (!activeDrag?.group || !target?.item?.id || !stickyRect) return;
    activeDrag.group.lockedTarget = {
      rect: cloneRect(target.rect),
      stickyRect: cloneRect(stickyRect),
      targetId: target.item.id,
      targetType: target.item.type,
    };
  }

  function getLockedTopLevelTarget(point) {
    const locked = activeDrag?.group?.lockedTarget;
    if (!locked?.targetId) return null;
    const target = getTopLevelTargetById(locked.targetId);
    if (!target) {
      clearLockedTarget();
      return null;
    }
    const stickyRect = getTargetStickyRect(target) || locked.stickyRect;
    locked.stickyRect = cloneRect(stickyRect);
    locked.rect = cloneRect(target.rect);
    if (!stickyRect || !isPointInsideRect(stickyRect, point.x, point.y)) {
      clearLockedTarget();
      return null;
    }
    return { ...target, locked: true };
  }

  function getTopLevelTargetAtPoint(point) {
    if (!activeDrag || activeDrag.item.type === "folder" || !point) return null;
    const selectedIds = new Set(activeDrag.group.draggedIds);
    const hit = options.iconBoundsRegistry.getAtPoint(
      BOUNDS_KIND.TOP_LEVEL,
      point.x,
      point.y,
      { excludeId: activeDrag.group.leadId }
    );
    if (hit?.id && !selectedIds.has(hit.id)) {
      const found = options.findTopLevel(options.pages.value, hit.id);
      if (found) return { ...found, rect: hit.rect };
    }

    const dragRect = getDragVisualRect();
    const pageIndex = getVisualDesktopPageIndex();
    for (let index = 0; index < (options.pages.value[pageIndex] || []).length; index += 1) {
      const item = options.pages.value[pageIndex][index];
      if (!item?.id || selectedIds.has(item.id)) continue;
      const target = getTopLevelTargetById(item.id);
      if (!target) continue;
      const candidateRect = expandRect(target.rect, FOLDER_HIT_CANDIDATE_MARGIN);
      if (
        isPointInsideRect(target.rect, point.x, point.y) ||
        rectsIntersect(candidateRect, dragRect)
      ) {
        return target;
      }
    }
    return null;
  }

  function isTargetIntentAccepted(target, point) {
    const intentRect = getTargetIntentRect(target?.rect);
    return Boolean(intentRect && point && isPointInsideRect(intentRect, point.x, point.y));
  }

  function maybeCloseAutoOpenedFolder(clientX, clientY) {
    const group = activeDrag?.group;
    if (!group?.autoOpenedFolderId || options.openFolderId.value !== group.autoOpenedFolderId) return;
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect?.();
    if (!rect || isPointInsideRect(rect, clientX, clientY)) return;
    group.autoOpenedFolderId = null;
    options.commitOpenFolder(null);
  }

  function resolveDropIntent(clientX, clientY) {
    const point = getPointerCenter() || { x: clientX, y: clientY };
    maybeCloseAutoOpenedFolder(clientX, clientY);
    const openFolderId = options.openFolderId.value;
    if (openFolderId && activeDrag.item.type !== "folder") {
      const panel = getDomRefElement(options.folderPanelRef.value);
      const panelRect = panel?.getBoundingClientRect?.() || null;
      if (!panelRect || isPointInsideRect(panelRect, clientX, clientY)) {
        clearLockedTarget();
        const target = calcFolderInsertIndex(clientX, clientY);
        return {
          fallbackPoint: point,
          intent: {
            allowCreate: target.pageIndex >= options.folderPages.value.length,
            folderId: openFolderId,
            index: target.index,
            pageIndex: target.pageIndex,
            type: "open-folder-slot",
          },
          locked: false,
          target: null,
        };
      }
    }

    const lockedTarget = getLockedTopLevelTarget(point);
    if (lockedTarget) {
      return {
        fallbackPoint: centerRect(lockedTarget.rect, point),
        intent: lockedTarget.item.type === "folder"
          ? { folderId: lockedTarget.item.id, type: "closed-folder" }
          : { targetAppId: lockedTarget.item.id, type: "app-folder-create" },
        locked: true,
        target: lockedTarget,
      };
    }

    const target = getTopLevelTargetAtPoint(point);
    if (target && isTargetIntentAccepted(target, point)) {
      return {
        fallbackPoint: centerRect(target.rect, point),
        intent: target.item.type === "folder"
          ? { folderId: target.item.id, type: "closed-folder" }
          : { targetAppId: target.item.id, type: "app-folder-create" },
        locked: false,
        target,
      };
    }

    const pageIndex = getVisualDesktopPageIndex();
    const pageRect = getPageRect(pageIndex);
    if (pageRect && !isPointInsideRect(pageRect, clientX, clientY)) {
      return {
        fallbackPoint: point,
        intent: { reason: "invalid-target", type: "invalid" },
        locked: false,
        target,
      };
    }
    return {
      fallbackPoint: point,
      intent: {
        index: calcDesktopInsertIndex(clientX, clientY, pageIndex),
        pageIndex,
        type: "desktop-slot",
      },
      locked: false,
      target,
    };
  }

  function makePlan(intent) {
    const group = activeDrag.group;
    return options.planGroupDrop({
      basePages: group.basePages,
      baseRevision: group.baseRevision,
      createdFolderId: group.createdFolderId,
      currentRevision: options.getGroupLayoutRevision(),
      draggedIds: group.draggedIds,
      intent,
      leadId: group.leadId,
      selectionRevision: group.selectionRevision,
      standalone: group.standalone,
    });
  }

  function publishTarget(target, plan, resolved = null) {
    const isTopLevelIntent = ["app-folder-create", "closed-folder"].includes(resolved?.intent?.type);
    if (!target || !isTopLevelIntent || plan.status !== "accepted") {
      clearPendingTarget();
      return;
    }
    const previousTargetId = activeDrag.group.lockedTarget?.targetId;
    if (previousTargetId && previousTargetId !== target.item.id) {
      activeDrag.group.pendingOpenFolderId = null;
      clearFolderHoverTimers();
    }
    lockTopLevelTarget(target);
    dragFolderTargetId.value = target.item.id;
    const phase = dragFolderHoverState.value?.targetId === target.item.id
      ? dragFolderHoverState.value.phase
      : "hover";
    if (dragFolderHoverState.value?.targetId !== target.item.id) {
      hoverKey += 1;
      dragFolderHoverState.value = {
        key: `group-target-${hoverKey}`,
        phase,
        startedAt: Date.now(),
        targetId: target.item.id,
        targetType: target.item.type,
      };
    }
    if (target.item.type !== "folder" || options.openFolderId.value === target.item.id) {
      activeDrag.group.pendingOpenFolderId = null;
      clearFolderHoverTimers();
      return;
    }
    if (activeDrag.group.pendingOpenFolderId === target.item.id || activeDrag.group.autoOpenedFolderId === target.item.id) return;
    clearFolderHoverTimers();
    activeDrag.group.pendingOpenFolderId = target.item.id;
    folderHoverFlashTimer = window.setTimeout(() => {
      folderHoverFlashTimer = null;
      if (!activeDrag || activeDrag.group.pendingOpenFolderId !== target.item.id) return;
      dragFolderHoverState.value = {
        ...dragFolderHoverState.value,
        phase: "flash",
      };
      publishGroupState();
    }, GROUP_FOLDER_HOVER_FLASH_MS);
    folderHoverTimer = window.setTimeout(() => {
      folderHoverTimer = null;
      if (!activeDrag || activeDrag.group.pendingOpenFolderId !== target.item.id) return;
      activeDrag.group.pendingOpenFolderId = null;
      activeDrag.group.autoOpenedFolderId = target.item.id;
      dragFolderHoverState.value = {
        ...dragFolderHoverState.value,
        phase: "opening",
      };
      options.commitOpenFolder(target.item.id);
    }, GROUP_FOLDER_HOVER_OPEN_MS);
  }

  function publishDebug(resolved, plan) {
    debugKey += 1;
    dragHitDebugState.value = {
      active: true,
      key: `group-drag-debug-${debugKey}`,
      phase: activeDrag.group.phase,
      pointer: { ...activeDrag.pointer },
      reason: plan.reason || plan.status,
      source: activeDrag.source,
      target: resolved.target
        ? {
          id: resolved.target.item.id,
          rect: cloneRect(resolved.target.rect),
          type: resolved.target.item.type,
        }
        : null,
      winner: plan.status === "accepted" ? resolved.intent.type : "rejected",
    };
  }

  function evaluateIntent(optionsArg = {}) {
    intentTimer = null;
    if (!activeDrag || options.isLaunchpadInteractionBlocked()) return null;
    const resolved = resolveDropIntent(activeDrag.pointer.x, activeDrag.pointer.y);
    const nextIntentKey = intentKey(resolved.intent);
    let plan = activeDrag.group.lastPlan;
    if (
      optionsArg.force === true ||
      activeDrag.group.intentKey !== nextIntentKey ||
      activeDrag.group.planRevision !== options.getGroupLayoutRevision()
    ) {
      plan = makePlan(resolved.intent);
      activeDrag.group.intentKey = nextIntentKey;
      activeDrag.group.lastPlan = plan;
      activeDrag.group.planRevision = options.getGroupLayoutRevision();
    }
    activeDrag.group.intent = resolved.intent;
    activeDrag.group.lastResolved = resolved;
    activeDrag.group.dropReason = plan.reason || null;
    activeDrag.group.dropStatus = plan.status;
    updateLayoutProjection(activeDrag.group, resolved.intent, plan);
    activeDrag.group.phase = activeDrag.hasMoved ? "dragging" : "gathering";
    publishTarget(resolved.target, plan, resolved);
    publishDebug(resolved, plan);
    publishGroupState();
    return { plan, resolved };
  }

  function scheduleIntentEvaluation() {
    clearIntentTimer();
    intentTimer = window.setTimeout(evaluateIntent, GROUP_DROP_INTENT_DELAY_MS);
  }

  function scheduleDesktopPageTurn(clientX) {
    const rect = getPageRect();
    if (!rect) return clearPageTurn();
    const direction = clientX <= rect.left + PAGE_EDGE_SIZE
      ? -1
      : clientX >= rect.right - PAGE_EDGE_SIZE
        ? 1
        : 0;
    const currentIndex = getVisualDesktopPageIndex();
    const targetIndex = currentIndex + direction;
    const createsPage = targetIndex === options.pages.value.length;
    const canCreatePage = createsPage &&
      currentIndex === options.pages.value.length - 1 &&
      makePlan({
        index: 0,
        pageIndex: targetIndex,
        type: "desktop-slot",
      }).status === "accepted";
    if (
      !direction ||
      targetIndex < 0 ||
      targetIndex > options.pages.value.length ||
      (createsPage && !canCreatePage)
    ) {
      clearPageTurn();
      return;
    }
    if (pageTurnTimer?.targetIndex === targetIndex) return;
    clearPageTurn();
    pageTurnTimer = {
      targetIndex,
      timer: window.setTimeout(() => {
        const pending = pageTurnTimer;
        pageTurnTimer = null;
        if (!activeDrag || !pending) return;
        activeDrag.group.desktopPageIndex = pending.targetIndex;
        if (pending.targetIndex < options.pages.value.length) {
          options.commitPageIndex(pending.targetIndex);
        }
        activeDrag.group.intentKey = null;
        evaluateIntent({ force: true });
      }, PAGE_TURN_DELAY),
    };
  }

  function scheduleFolderPageTurn(clientX) {
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect?.();
    if (!rect || !isPointInsideRect(rect, clientX, activeDrag.pointer.y)) {
      clearFolderPageTurn();
      return;
    }
    const direction = clientX <= rect.left + FOLDER_PAGE_EDGE_SIZE
      ? -1
      : clientX >= rect.right - FOLDER_PAGE_EDGE_SIZE
        ? 1
        : 0;
    if (folderPageTurnTimer) {
      const pendingDirection = Math.sign(
        folderPageTurnTimer.targetIndex - folderPageTurnTimer.fromIndex
      );
      if (direction === pendingDirection) return;
      clearFolderPageTurn();
    }
    const currentIndex = Number(options.visualFolderPageIndex?.value ?? options.folderPageIndex.value) || 0;
    const maxIndex = Math.max(0, options.folderPages.value.length - 1);
    const targetIndex = currentIndex + direction;
    const allowCreate = targetIndex === maxIndex + 1 &&
      makePlan({
        allowCreate: true,
        folderId: options.openFolderId.value,
        index: 0,
        pageIndex: targetIndex,
        type: "open-folder-slot",
      }).status === "accepted";
    if (!direction || targetIndex < 0 || targetIndex > maxIndex + 1 || (targetIndex > maxIndex && !allowCreate)) {
      clearFolderPageTurn();
      return;
    }
    if (folderPageTurnTimer?.targetIndex === targetIndex) return;
    clearFolderPageTurn();
    const token = options.requestFolderPageTurn?.(targetIndex, {
      allowCreate,
      folderId: options.openFolderId.value,
      phase: "open",
      source: "group-drag",
    });
    folderPageTurnTimer = {
      allowCreate,
      fromIndex: currentIndex,
      targetIndex,
      token,
      timer: window.setTimeout(() => {
        const pending = folderPageTurnTimer;
        folderPageTurnTimer = null;
        if (!activeDrag || !pending) return;
        const committed = pending.token != null
          ? options.commitFolderPageTurnRequest?.(pending.token, {
            allowCreate: pending.allowCreate,
            folderId: options.openFolderId.value,
            phase: "open",
          })
          : false;
        if (!committed) {
          options.commitFolderPageIndex(pending.targetIndex, {
            allowCreate: pending.allowCreate,
          });
        }
        if (pending.allowCreate) activeDrag.group.virtualFolderPageIndex = pending.targetIndex;
        activeDrag.group.intentKey = null;
        evaluateIntent({ force: true });
      }, PAGE_TURN_DELAY),
    };
  }

  function commitPendingEdgeTurns() {
    if (pageTurnTimer) {
      const targetIndex = pageTurnTimer.targetIndex;
      clearPageTurn();
      activeDrag.group.desktopPageIndex = targetIndex;
      if (targetIndex < options.pages.value.length) options.commitPageIndex(targetIndex);
    }
    if (folderPageTurnTimer) {
      const pending = folderPageTurnTimer;
      if (pending.timer) window.clearTimeout(pending.timer);
      folderPageTurnTimer = null;
      const committed = pending.token != null
        ? options.commitFolderPageTurnRequest?.(pending.token, {
          allowCreate: pending.allowCreate,
          folderId: options.openFolderId.value,
          phase: "open",
        })
        : false;
      if (!committed) {
        options.commitFolderPageIndex(pending.targetIndex, {
          allowCreate: pending.allowCreate,
        });
      }
      if (pending.allowCreate) activeDrag.group.virtualFolderPageIndex = pending.targetIndex;
    }
  }

  function getPlacementReleasePoint(placement, fallbackPoint) {
    const target = placement?.target;
    if (!target) return fallbackPoint;
    if (target.kind === "desktop") {
      return centerRect(getRenderedLaunchRect({
        area: "desktop",
        id: placement.id,
        pageIndex: target.pageIndex,
      }), fallbackPoint);
    }
    if (target.kind === "folder") {
      return centerRect(getRenderedLaunchRect({
        area: "folder",
        folderId: target.folderId,
        id: placement.id,
        pageIndex: target.pageIndex,
      }), fallbackPoint);
    }
    if (target.kind === "closed-folder" || target.kind === "created-folder") {
      const previewRect = target.index < Math.min(9, Number(options.folderPageSize?.value) || 9)
        ? options.iconBoundsRegistry.getBounds(
          BOUNDS_KIND.PREVIEW_CHILD,
          BOUNDS_VARIANT.RENDERED,
          {
            childId: placement.id,
            folderId: target.folderId,
            slotIndex: target.index,
          }
        )
        : null;
      return centerRect(previewRect || getRenderedFolderRect(target.folderId), fallbackPoint);
    }
    return fallbackPoint;
  }

  function makeReleasePlan(plan, resolved, drag, key) {
    const placements = new Map((plan.placements || []).map((placement) => [placement.id, placement]));
    const fallback = resolved.fallbackPoint || getPointerCenter();
    const fallbackById = {};
    for (const entry of drag.group.entries) {
      fallbackById[entry.item.id] = getPlacementReleasePoint(
        placements.get(entry.item.id),
        fallback
      );
    }
    return makeGroupReleasePlan({
      basePages: drag.group.basePages,
      entries: drag.group.entries,
      fallbackById,
      fallbackPoint: fallback,
      folderPageSize: Number(options.folderPageSize?.value) || 9,
      key,
      offset: drag.offset,
      placements: plan.placements,
      pointer: drag.pointer,
      velocity: drag.velocity,
    });
  }

  function makeFolderCreateTargetEntry(plan, resolved) {
    if (!plan?.createdFolderId || resolved?.intent?.type !== "app-folder-create") return null;
    const target = resolved.target;
    if (!target?.item?.id || target.item.type !== "app" || !target.rect) return null;
    return {
      bundleCount: 1,
      delayMs: 0,
      item: options.cloneItem(target.item),
      memberIds: [target.item.id],
      order: 0,
      origin: centerRect(target.rect, resolved.fallbackPoint),
      originKind: "folder-create-target",
      originScale: 1,
      source: {
        index: target.index,
        kind: "desktop",
        pageIndex: target.pageIndex,
      },
    };
  }

  function restoreUncommittedNavigation(drag) {
    const group = drag?.group;
    if (!group || group.didCommit) return;
    if (group.desktopPageIndex >= options.pages.value.length) {
      group.desktopPageIndex = options.pageIndex.value;
    }
    if (group.virtualFolderPageIndex != null) {
      const maxIndex = Math.max(0, options.folderPages.value.length - 1);
      options.commitFolderPageIndex(
        Math.min(Number(options.folderPageIndex.value) || 0, maxIndex),
        { allowCreate: false }
      );
      group.virtualFolderPageIndex = null;
    }
    if (
      group.autoOpenedFolderId &&
      options.openFolderId.value === group.autoOpenedFolderId
    ) {
      options.commitOpenFolder(group.baseOpenFolderId || null);
      group.autoOpenedFolderId = null;
    }
  }

  function beginReturnToOrigin({
    cancelSource = null,
    dropReason = null,
    dropStatus,
    keyPrefix,
    phase,
  }) {
    const drag = activeDrag;
    if (!drag?.group) return false;
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    restoreUncommittedNavigation(drag);
    drag.group.cancelArmed = false;
    drag.group.cancelSource = cancelSource;
    drag.group.phase = phase;
    drag.group.dropStatus = dropStatus;
    drag.group.dropReason = dropReason;
    drag.group.projectedPages = null;
    projectedPages.value = null;
    const releaseKey = `${keyPrefix}-${groupKey}-${drag.group.leadId}`;
    const fallbackById = Object.fromEntries(
      drag.group.entries
        .filter((entry) => entry?.item?.id)
        .map((entry) => [entry.item.id, entry.origin])
    );
    drag.group.releasePlan = makeGroupReleasePlan({
      basePages: drag.group.basePages,
      entries: drag.group.entries,
      fallbackById,
      folderPageSize: Number(options.folderPageSize?.value) || 9,
      key: releaseKey,
      offset: drag.offset,
      pointer: drag.pointer,
      returnToOrigin: true,
      velocity: drag.velocity,
    });
    drag.group.releaseSettledIds = [];
    drag.group.releaseStatus = "pending";
    clearPendingTarget();
    publishGroupState();
    if (prefersReducedMotion()) {
      drag.group.visualCompleted = true;
      endDrag();
    }
    return true;
  }

  function rejectDrop(reason, optionsArg = {}) {
    const drag = activeDrag;
    const normalizedReason = reason || "invalid-target";
    if (!beginReturnToOrigin({
      dropReason: normalizedReason,
      dropStatus: "rejected",
      keyPrefix: "group-release-reject",
      phase: "rejected",
    })) return false;
    if (optionsArg.notify !== false && reason !== "same-placement") {
      options.onGroupDropRejected?.(normalizedReason, {
        standalone: drag.group.standalone,
      });
    }
    return true;
  }

  function cancelDrop(source = "unknown") {
    if (!canUserCancelDrag()) return false;
    return beginReturnToOrigin({
      cancelSource: String(source || "unknown"),
      dropReason: null,
      dropStatus: "cancelled",
      keyPrefix: "group-release-cancel",
      phase: "cancelling",
    });
  }

  function acceptDrop(plan, resolved) {
    const drag = activeDrag;
    const folderCreateTargetEntry = makeFolderCreateTargetEntry(plan, resolved);
    const committed = options.commitGroupDrop(plan, {
      baseRevision: drag.group.baseRevision,
      draggedIds: drag.group.draggedIds,
      intent: drag.group.intent,
      selectionRevision: drag.group.selectionRevision,
      standalone: drag.group.standalone,
    });
    if (committed === false) {
      rejectDrop("revision-stale");
      return;
    }
    drag.group.didCommit = true;
    if (
      resolved.intent.type === "open-folder-slot" &&
      resolved.intent.folderId === options.openFolderId.value
    ) {
      const leadPlacement = plan.placements?.find(
        (placement) => placement.id === drag.group.leadId && placement.target?.kind === "folder"
      );
      options.commitFolderPageIndex(
        leadPlacement?.target?.pageIndex ?? resolved.intent.pageIndex,
        { allowCreate: false }
      );
      drag.group.virtualFolderPageIndex = null;
    } else {
      options.commitPageIndex(drag.group.desktopPageIndex);
    }
    if (
      folderCreateTargetEntry &&
      !drag.group.entries.some((entry) => entry.item.id === folderCreateTargetEntry.item.id)
    ) {
      drag.group.entries = [
        ...drag.group.entries.slice(0, Math.max(1, GROUP_DRAG_VISUAL_LIMIT - 1)),
        folderCreateTargetEntry,
      ];
    }
    drag.group.phase = "accepted";
    drag.group.dropStatus = "accepted";
    drag.group.dropReason = null;
    drag.group.releaseCreatedFolderId = plan.createdFolderId || null;
    drag.group.projectedPages = null;
    projectedPages.value = null;
    drag.group.releasePlan = makeReleasePlan(
      plan,
      resolved,
      drag,
      `group-release-${groupKey}-${drag.group.leadId}`
    );
    drag.group.releaseSettledIds = [];
    drag.group.releaseStatus = "pending";
    // The release plan now owns the committed landing geometry.  Clear the
    // pre-release target before publishing the accepted frame so hover frames
    // and folder-create backdrops begin their exit in the same render as the
    // accepted drop, instead of waiting for the release ghosts to settle.
    clearPendingTarget();
    publishGroupState();
  }

  function getGatherSourceRect(location, activePageIndex, activeFolderPageIndex, openFolderId) {
    if (!location) return null;
    if (location.kind === "desktop") {
      return location.pageIndex === activePageIndex
        ? getRenderedLaunchRect({
          area: "desktop",
          id: location.item.id,
          pageIndex: location.pageIndex,
        })
        : null;
    }
    if (
      location.folderId === openFolderId &&
      location.folderPageIndex === activeFolderPageIndex
    ) {
      return getRenderedLaunchRect({
        area: "folder",
        folderId: location.folderId,
        id: location.item.id,
        pageIndex: location.folderPageIndex,
      });
    }
    if (location.ownerPageIndex !== activePageIndex) return null;
    if (location.flatIndex < 9) {
      const previewRect = options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.PREVIEW_CHILD,
        BOUNDS_VARIANT.RENDERED,
        {
          childId: location.item.id,
          folderId: location.folderId,
          slotIndex: location.flatIndex,
        }
      );
      if (previewRect) return previewRect;
    }
    return getRenderedFolderRect(location.folderId);
  }

  function presentCommittedFolderCreation(request = {}) {
    const plan = request.plan;
    if (
      activeDrag ||
      pendingDragStart ||
      plan?.status !== "accepted" ||
      !plan.createdFolderId
    ) return false;
    if (typeof request.commit !== "function") {
      throw new TypeError("presentCommittedFolderCreation requires commit");
    }
    const draggedIds = Array.from(new Set((request.draggedIds || []).filter(Boolean)));
    const leadId = request.leadId || draggedIds[0] || null;
    const basePages = options.clonePages(request.basePages || options.pages.value);
    const sourceIndex = indexGroupDragSources(basePages);
    const leadLocation = sourceIndex.apps.get(leadId) || null;
    const targetLocation = options.findTopLevel(plan.nextPages, plan.createdFolderId);
    if (!draggedIds.length || !leadLocation || !targetLocation) {
      throw new Error("Folder creation presentation requires valid lead and target locations");
    }
    const releaseLayoutAnchorId = leadLocation.kind === "desktop"
      ? leadLocation.item.id
      : plan.emptiedFolderIds?.includes(leadLocation.folderId)
        ? leadLocation.folderId
        : null;

    const activePageIndex = options.pageIndex.value;
    const activeFolderPageIndex = options.folderPageIndex.value;
    const openFolderId = options.openFolderId.value;
    const viewportRect = getPageRect(activePageIndex);
    const viewportCenter = viewportRect
      ? centerRect(viewportRect)
      : {
        x: (Number(globalThis.innerWidth) || 1) / 2,
        y: (Number(globalThis.innerHeight) || 1) / 2,
      };
    const leadRect = getGatherSourceRect(
      leadLocation,
      activePageIndex,
      activeFolderPageIndex,
      openFolderId
    );
    const pointer = centerRect(leadRect, viewportCenter);
    const iconExtent = Math.max(1, Number(options.iconSize.value) || Number(leadRect?.width) || 1);
    const startedAt = nowMs();
    groupKey += 1;
    activeDrag = {
      cellSize: null,
      compact: false,
      hasMoved: false,
      item: options.cloneItem(leadLocation.item),
      lastPointerTime: startedAt,
      offset: { x: iconExtent / 2, y: iconExtent / 2 },
      pointer,
      pointerId: null,
      singleLineLabel: false,
      size: { height: iconExtent, width: iconExtent },
      source: leadLocation,
      start: pointer,
      velocity: zeroVelocity(),
      group: {
        basePages,
        baseRevision: request.baseRevision,
        cancelArmed: false,
        cancelSource: null,
        createdFolderId: plan.createdFolderId,
        desktopPageIndex: targetLocation.pageIndex,
        didCommit: false,
        draggedIds,
        dropReason: null,
        dropStatus: "accepted",
        entries: [],
        intent: { type: "app-folder-create" },
        intentKey: null,
        key: `group-create-${groupKey}-${leadId}`,
        leadId,
        onComplete: request.onComplete,
        phase: "committing",
        presentationOnly: true,
        projectedPages: null,
        releaseCreatedFolderId: plan.createdFolderId,
        releaseLayoutAnchorId,
        releasePlan: null,
        releaseSettledIds: [],
        releaseStatus: null,
        selectionRevision: request.selectionRevision,
        standalone: false,
        trail: [],
        virtualFolderPageIndex: null,
        visualCompleted: false,
      },
    };
    activeDrag.group.entries = buildGatherEntriesFromSnapshot({
      activeFolderPageIndex,
      activePageIndex,
      draggedIds,
      leadId,
      leadRect,
      openFolderId,
      pages: basePages,
      pointer,
    });
    dragMeta.value = {
      draggedIds: [...draggedIds],
      item: activeDrag.item,
      source: activeDrag.source,
    };
    attachContextMenu();
    publishGroupState();

    let committed;
    try {
      committed = request.commit(plan);
    } catch (error) {
      endDrag();
      throw error;
    }
    if (committed === false) {
      endDrag();
      return false;
    }
    const drag = activeDrag;
    drag.group.didCommit = true;
    options.commitPageIndex(targetLocation.pageIndex);
    publishGroupState();
    nextTick(() => {
      if (activeDrag !== drag) return;
      drag.group.phase = "accepted";
      const fallbackPoint = centerRect(getRenderedFolderRect(plan.createdFolderId), viewportCenter);
      drag.group.releasePlan = makeReleasePlan(
        plan,
        { fallbackPoint, intent: drag.group.intent },
        drag,
        `group-release-${groupKey}-${drag.group.leadId}`
      );
      drag.group.releaseSettledIds = [];
      drag.group.releaseStatus = "pending";
      publishGroupState();
    });
    return true;
  }

  function endDrag() {
    const ended = activeDrag?.group || null;
    detachContextMenu();
    cancelPreviewRaf();
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderHoverTimers();
    restoreUncommittedNavigation(activeDrag);
    activeDrag = null;
    pendingDragStart = null;
    dragMeta.value = null;
    dragFolderHoverState.value = null;
    dragFolderTargetId.value = null;
    dragHitDebugState.value = null;
    groupDragState.value = null;
    projectedPages.value = null;
    scheduleLayoutProjectionRelease();
    if (ended) options.onGroupDragEnd?.(ended);
    if (ended?.visualCompleted) ended.onComplete?.();
  }

  function completeGroupRelease(result = {}) {
    const drag = activeDrag;
    const group = drag?.group;
    const plan = group?.releasePlan;
    if (!drag || !group || !plan) return false;
    if (result.planKey && result.planKey !== plan.key) return false;
    const entryId = result.entryId || result.id || null;
    if (!entryId) return false;
    const expectedIds = new Set(plan.entries.map((entry) => entry.id));
    if (!expectedIds.has(entryId)) return false;
    const settled = new Set(group.releaseSettledIds || []);
    if (settled.has(entryId)) return true;
    settled.add(entryId);
    group.releaseSettledIds = [...settled];
    const outcome = result.outcome === "aborted" ? "aborted" : "settled";
    if (outcome === "aborted") group.releaseStatus = "aborted";
    const allSettled = [...expectedIds].every((id) => settled.has(id));
    if (!allSettled && outcome !== "aborted") {
      group.releaseStatus = "running";
      publishGroupState();
      return true;
    }
    group.releaseStatus = outcome === "aborted" ? "aborted" : "settled";
    group.visualCompleted = true;
    publishGroupState();
    endDrag();
    return true;
  }

  function activatePreparedDrag(descriptor, deferred = false) {
    if (deferred && pendingDragStart !== descriptor) return;
    if (pendingDragStart === descriptor) pendingDragStart = null;
    if (activeDrag || options.isLaunchpadInteractionBlocked()) return;
    const payload = descriptor.payload;
    if (options.onGroupDragStart?.(payload) === false) return;
    groupKey += 1;
    const startedAt = nowMs();
    activeDrag = {
      cellSize: descriptor.cellSize,
      compact: descriptor.dragVisualState?.compact === true,
      hasMoved: descriptor.startedFromMovement === true,
      item: descriptor.item,
      lastPointerTime: startedAt,
      offset: descriptor.offset,
      pointer: descriptor.startPoint,
      pointerId: descriptor.pointerId,
      singleLineLabel: descriptor.dragVisualState?.singleLineLabel === true,
      size: descriptor.size,
      source: descriptor.source,
      start: descriptor.anchorPoint || descriptor.startPoint,
      velocity: zeroVelocity(),
      group: {
        autoOpenedFolderId: null,
        baseOpenFolderId: options.openFolderId.value,
        basePages: options.clonePages(options.pages.value),
        baseRevision: payload.layoutRevision,
        cancelArmed: false,
        cancelSource: null,
        createdFolderId: options.makeId("folder"),
        desktopPageIndex: options.pageIndex.value,
        didCommit: false,
        draggedIds: [...payload.draggedIds],
        dropReason: null,
        dropStatus: null,
        entries: [],
        intent: null,
        intentKey: null,
        key: `group-drag-${groupKey}-${payload.leadId}`,
        lastPlan: null,
        lastResolved: null,
        lockedTarget: null,
        leadId: payload.leadId,
        pendingOpenFolderId: null,
        phase: "gathering",
        planRevision: payload.layoutRevision,
        projectedPages: null,
        releasePlan: null,
        releaseSettledIds: [],
        releaseStatus: null,
        releaseCreatedFolderId: null,
        selectionRevision: payload.selectionRevision,
        standalone: payload.standalone === true,
        trail: appendGroupTrailPoint([], descriptor.startPoint, { timeMs: startedAt }),
        virtualFolderPageIndex: null,
      },
    };
    activeDrag.group.entries = buildGatherEntries(descriptor, activeDrag);
    dragMeta.value = {
      draggedIds: [...activeDrag.group.draggedIds],
      item: activeDrag.item,
      source: activeDrag.source,
    };
    setLayoutProjectionActive(true);
    attachContextMenu();
    publishGroupState();
    evaluateIntent({ force: true });
  }

  function startDrag(event, item, source, batchPayload = null) {
    const acceptsPointer = event?.type === "pointermove"
      ? isPrimaryPointerMoveEvent(event)
      : isPrimaryPointerStartEvent(event);
    if (
      !acceptsPointer ||
      !item?.id ||
      activeDrag ||
      pendingDragStart ||
      options.isLaunchpadInteractionBlocked()
    ) return false;
    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (!rect) throw new TypeError("startDrag requires currentTarget.getBoundingClientRect()");
    event.preventDefault();
    event.stopPropagation();
    clearLayoutProjectionRelease(true);
    const dragVisualState = event.dragVisualState || null;
    const iconSize = Math.max(1, Number(dragVisualState?.iconSize) || Number(rect.width) || 1);
    const visualRect = {
      height: iconSize,
      left: rect.left + rect.width / 2 - iconSize / 2,
      top: rect.top + rect.height / 2 - iconSize / 2,
      width: iconSize,
    };
    const startPoint = { x: Number(event.clientX), y: Number(event.clientY) };
    const anchorPoint = {
      x: Number.isFinite(Number(event.dragAnchor?.x))
        ? Number(event.dragAnchor.x)
        : startPoint.x,
      y: Number.isFinite(Number(event.dragAnchor?.y))
        ? Number(event.dragAnchor.y)
        : startPoint.y,
    };
    const payload = batchPayload?.draggedIds?.length
      ? { ...batchPayload, draggedIds: [...batchPayload.draggedIds], standalone: false }
      : {
        draggedIds: [item.id],
        layoutRevision: options.getGroupLayoutRevision(),
        leadId: item.id,
        selectionRevision: null,
        standalone: true,
      };
    const descriptor = {
      cellSize: dragVisualState?.cellWidth && dragVisualState?.cellHeight
        ? { height: dragVisualState.cellHeight, width: dragVisualState.cellWidth }
        : getSourceCellSize(source, rect),
      dragVisualState,
      item: options.cloneItem(item),
      offset: {
        x: anchorPoint.x - visualRect.left,
        y: anchorPoint.y - visualRect.top,
      },
      payload,
      pointerId: event.pointerId,
      rect: cloneRect(visualRect),
      size: { height: visualRect.height, width: visualRect.width },
      source,
      startedFromMovement: event.dragStartedFromThreshold === true,
      anchorPoint,
      startPoint,
    };
    if (options.isHomeRevealSettling.value) {
      options.finishHomeRevealSettleWindow();
      pendingDragStart = descriptor;
      nextTick(() => activatePreparedDrag(descriptor, true));
    } else {
      activatePreparedDrag(descriptor);
    }
    return true;
  }

  function updateDragPointer(event) {
    if (
      !activeDrag ||
      activeDrag.group.presentationOnly ||
      !isSamePointerEvent(activeDrag.pointerId, event) ||
      !isPrimaryPointerMoveEvent(event)
    ) return;
    event.preventDefault();
    const sample = samplePointerVelocity({
      pointer: activeDrag.pointer,
      time: activeDrag.lastPointerTime,
      velocity: activeDrag.velocity,
    }, event);
    activeDrag.velocity = sample.velocity;
    activeDrag.lastPointerTime = sample.time;
    activeDrag.pointer = { x: Number(event.clientX), y: Number(event.clientY) };
    activeDrag.hasMoved = activeDrag.hasMoved ||
      Math.hypot(activeDrag.pointer.x - activeDrag.start.x, activeDrag.pointer.y - activeDrag.start.y) > POINTER_MOVE_THRESHOLD;
    if (activeDrag.hasMoved) activeDrag.group.phase = "dragging";
    activeDrag.group.trail = appendGroupTrailPoint(
      activeDrag.group.trail,
      activeDrag.pointer,
      { timeMs: sample.time }
    );
    maybeCloseAutoOpenedFolder(activeDrag.pointer.x, activeDrag.pointer.y);
    const cancelArmed = syncBatchCancelZone();
    scheduleVisualPublish();
    if (cancelArmed) return;
    if (options.openFolderId.value) {
      clearPageTurn();
      scheduleFolderPageTurn(activeDrag.pointer.x);
    } else {
      clearFolderPageTurn();
      scheduleDesktopPageTurn(activeDrag.pointer.x);
    }
    scheduleIntentEvaluation();
  }

  function finishDrag(event) {
    if (pendingDragStart && isSamePointerEvent(pendingDragStart.pointerId, event)) {
      pendingDragStart = null;
      return;
    }
    if (!activeDrag || !shouldFinishDragForPointerEvent(activeDrag, event)) return;
    if (activeDrag.group.presentationOnly) {
      if (event.type === "pointercancel") endDrag();
      return;
    }
    if (event.type === "pointercancel" || options.isLaunchpadInteractionBlocked()) {
      endDrag();
      return;
    }
    const sample = samplePointerVelocity({
      pointer: activeDrag.pointer,
      time: activeDrag.lastPointerTime,
      velocity: activeDrag.velocity,
    }, event);
    activeDrag.velocity = sample.velocity;
    activeDrag.lastPointerTime = sample.time;
    activeDrag.pointer = { x: Number(event.clientX), y: Number(event.clientY) };
    if (syncBatchCancelZone()) {
      cancelDrop("drop-zone");
      return;
    }
    clearIntentTimer();
    commitPendingEdgeTurns();
    const outcome = evaluateIntent({ force: true });
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderHoverTimers();
    if (!outcome || outcome.plan.status === "rejected") {
      rejectDrop(outcome?.plan?.reason || "invalid-target");
      return;
    }
    if (outcome.plan.status === "noop") {
      rejectDrop(outcome.plan.reason || "same-placement", { notify: false });
      return;
    }
    acceptDrop(outcome.plan, outcome.resolved);
  }

  function cancelDrag(event = {}) {
    if (event.userInitiatedCancel === true) {
      return cancelDrop(event.cancelSource || "explicit");
    }
    finishDrag({ ...event, type: "pointercancel" });
    return true;
  }

  function disposeDrag() {
    pendingDragStart = null;
    if (activeDrag) endDrag();
    else detachContextMenu();
    clearLayoutProjectionRelease(true);
  }

  return {
    cancelDrag,
    cancelPreviewRaf,
    clearFolderPageTurn,
    clearLayoutProjectionRelease,
    clearPageTurn,
    clearPendingTarget,
    completeGroupRelease,
    disposeDrag,
    dragFolderHoverState,
    dragFolderTargetId,
    dragHitDebugState,
    dragMeta,
    finishDrag,
    groupDragState,
    isDragActive,
    presentCommittedFolderCreation,
    projectedPages,
    startDrag,
    updateDragPointer,
  };
}
