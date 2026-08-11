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
  captureGroupTransferSourceEntries,
  indexGroupTransferSources,
} from "../domain/groupTransferSourceCapture.js";
import { makeGroupTransferPresentation } from "../domain/groupTransferPresentation.js";
import {
  GROUP_TRANSFER_OUTCOME,
  GROUP_TRANSFER_PHASE,
  isInteractiveGroupTransferPhase,
} from "../domain/groupTransferSession.js";
import { prefersReducedMotion } from "../rendering/pixi/animation/motionPreferences.js";
import { appendGroupTrailPoint } from "../rendering/pixi/scene/groupDragPresentation.js";
import {
  makeGroupTransferRuntimeEntries,
  makeGroupTransferRuntimeReleasePlan,
} from "../rendering/pixi/scene/groupTransferRuntimeAdapter.js";
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
  const elapsedMs = Math.max(0, time - previousTime);
  const deltaMs = Math.max(1, Math.min(maxDeltaMs, elapsedMs));
  const instant = {
    x: ((Number(event.clientX) - previousPointer.x) / deltaMs) * 1000,
    y: ((Number(event.clientY) - previousPointer.y) / deltaMs) * 1000,
  };
  const velocity = elapsedMs > maxDeltaMs
    ? zeroVelocity()
    : previous.velocity || zeroVelocity();
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
    intent.folderPageIndex ?? "",
    intent.index ?? "",
    intent.allowCreate === true ? "create" : "",
    intent.reason || "",
  ].join(":");
}

function updateLayoutProjection(group, intent, plan) {
  // Folder/app intent is semantic only; keep the last slot projection until
  // release so the hidden source never exposes a hole in the base layout.
  if (!["desktop-slot", "folder-slot"].includes(intent?.type)) return;
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

function makeGroupSourceMembers(pages, draggedIds) {
  const selected = new Set((draggedIds || []).filter(Boolean));
  const sourceIndex = indexGroupTransferSources(pages);
  return sourceIndex.order.flatMap((id, sourceOrder) => {
    if (!selected.has(id)) return [];
    const location = sourceIndex.apps.get(id);
    if (!location) return [];
    const source = location.kind === "desktop"
      ? {
        index: location.index,
        kind: "desktop",
        pageIndex: location.pageIndex,
      }
      : {
        flatIndex: location.flatIndex,
        folderId: location.folderId,
        folderPageIndex: location.folderPageIndex,
        index: location.childIndex,
        kind: "folder",
        ownerIndex: location.ownerIndex,
        ownerPageIndex: location.ownerPageIndex,
      };
    return [{
      destination: null,
      id,
      item: { ...location.item },
      role: "selected",
      selected: true,
      source,
      sourceOrder,
    }];
  });
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
  if (typeof options.planGroupTransfer !== "function") {
    throw new TypeError("useLaunchpadDrag requires planGroupTransfer");
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
      isInteractiveGroupTransferPhase(drag.group.phase)
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

  function isInsideDesktopDropRegion(clientX, clientY, pageRect) {
    if (!pageRect || isPointInsideRect(pageRect, clientX, clientY)) return true;
    if (!activeDrag?.group?.returnedFromFolder) return false;
    const desktopMain = getDomRefElement(options.desktopMainRef?.value);
    const desktopMainRect = desktopMain?.getBoundingClientRect?.() || null;
    return Boolean(desktopMainRect && isPointInsideRect(desktopMainRect, clientX, clientY));
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

  function buildGatherPopulationFromSnapshot(snapshot) {
    const viewportRect = getPageRect(snapshot.activePageIndex) || {
      height: Number(globalThis.innerHeight) || 1,
      left: 0,
      top: 0,
      width: Number(globalThis.innerWidth) || 1,
    };
    const entries = captureGroupTransferSourceEntries({
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
    return {
      allEntries: entries,
      sourceMembers: makeGroupSourceMembers(snapshot.pages, snapshot.draggedIds),
    };
  }

  function buildGatherPopulation(descriptor, drag) {
    return buildGatherPopulationFromSnapshot({
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

  function getReleaseVisualLimit() {
    const desktopPageSize = Math.max(
      1,
      (Number(options.gridCols?.value) || 1) * (Number(options.gridRows?.value) || 1)
    );
    return Math.max(desktopPageSize, Number(options.folderPageSize?.value) || 1);
  }

  function getReleaseVisualCount(group) {
    const presentationCount = group.presentationPlan?.actors?.filter(
      (actor) => actor.role !== "folder-shell"
    ).length || 0;
    const semanticCount = group.sourceMembers?.length || 0;
    return Math.max(
      group.dragEntries?.length || 0,
      presentationCount,
      Math.min(getReleaseVisualLimit() + 16, semanticCount)
    );
  }

  function makePresentationCurrentView(group) {
    return {
      desktopPageIndex: group.desktopPageIndex ?? options.pageIndex.value,
      folderPageIndex: Number(options.visualFolderPageIndex?.value ?? options.folderPageIndex.value) || 0,
      leadId: group.leadId,
      openFolderId: options.openFolderId.value || null,
    };
  }

  function updateGroupPresentation(drag, phase, presentationOptions = {}) {
    const group = drag?.group;
    if (!group) return null;
    const transferPlan = presentationOptions.transferPlan || group.semanticPlan || null;
    const previousActors = group.presentationPlan?.actors || [];
    const presentationPlan = makeGroupTransferPresentation({
      currentActors: previousActors,
      currentView: makePresentationCurrentView(group),
      limits: {
        desktopPageSize: Math.max(
          1,
          (Number(options.gridCols?.value) || 1) * (Number(options.gridRows?.value) || 1)
        ),
        folderPageSize: Number(options.folderPageSize?.value) || 1,
        maxBundles: 4,
        maxContinuityActors: GROUP_DRAG_VISUAL_LIMIT,
        maxGatherActors: GROUP_DRAG_VISUAL_LIMIT,
      },
      phase,
      sourceMembers: group.sourceMembers,
      transferPlan,
    });
    const runtime = makeGroupTransferRuntimeEntries({
      phase,
      presentationPlan,
      sourceEntries: group.allEntries,
    });
    group.presentationPlan = presentationPlan;
    group.shellActors = runtime.shellActors;
    if (phase === "gather") {
      group.dragEntries = runtime.entries;
      return presentationPlan;
    }
    group.runtimeEntries = runtime.entries;
    group.runtimePlan = makeGroupTransferRuntimeReleasePlan({
      key: presentationOptions.key || `group-transfer-${phase}-${group.key}`,
      phase,
      presentationPlan,
      transferPlan,
      velocity: drag.velocity,
    });
    return presentationPlan;
  }

  function getPublishedGroupEntries(group) {
    if (
      [GROUP_TRANSFER_PHASE.RELEASING, GROUP_TRANSFER_PHASE.RETURNING].includes(group.phase) &&
      group.runtimeEntries?.length
    ) return group.runtimeEntries;
    return group.dragEntries || [];
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
    const state = {
      canCancel: canUserCancelDrag(activeDrag),
      cancelArmed: group.cancelArmed === true,
      cancelSource: group.cancelSource || null,
      center: getPointerCenter(activeDrag),
      draggedIds: [...group.draggedIds],
      desktopPageIndex: group.desktopPageIndex,
      entries: getPublishedGroupEntries(group),
      intent: group.intent,
      intentPlan: group.lastPlan || null,
      key: group.key,
      leadId: group.leadId,
      outcome: group.outcome || null,
      phase: group.phase,
      presentationPlan: group.presentationPlan || null,
      pointer: { ...activeDrag.pointer },
      projectedPages: group.projectedPages,
      reducedMotion: prefersReducedMotion(),
      reason: group.reason || null,
      releaseVisualCount: getReleaseVisualCount(group),
      runtimePlan: group.runtimePlan,
      runtimeStatus: group.runtimeStatus || null,
      settledActorKeys: group.settledActorKeys || [],
      semanticPlan: group.semanticPlan || null,
      shellActors: group.shellActors || [],
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

  function getSuppressedTopLevelTargetId(point) {
    const group = activeDrag?.group;
    const suppressed = group?.suppressedTarget;
    if (!suppressed?.targetId || !suppressed.stickyRect || !point) return null;
    if (!isPointInsideRect(suppressed.stickyRect, point.x, point.y)) {
      group.suppressedTarget = null;
      return null;
    }
    return suppressed.targetId;
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
    const suppressedTargetId = getSuppressedTopLevelTargetId(point);
    const hit = options.iconBoundsRegistry.getAtPoint(
      BOUNDS_KIND.TOP_LEVEL,
      point.x,
      point.y,
      { excludeId: activeDrag.group.leadId }
    );
    if (hit?.id && hit.id !== suppressedTargetId && !selectedIds.has(hit.id)) {
      const found = options.findTopLevel(options.pages.value, hit.id);
      if (found) return { ...found, rect: hit.rect };
    }

    const dragRect = getDragVisualRect();
    const pageIndex = getVisualDesktopPageIndex();
    for (let index = 0; index < (options.pages.value[pageIndex] || []).length; index += 1) {
      const item = options.pages.value[pageIndex][index];
      if (!item?.id || item.id === suppressedTargetId || selectedIds.has(item.id)) continue;
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

  function leaveFolderTransit() {
    const group = activeDrag?.group;
    const transit = group?.folderTransit;
    if (!transit?.folderId || options.openFolderId.value !== transit.folderId) return false;
    const locked = group.lockedTarget?.targetId === transit.folderId
      ? group.lockedTarget
      : null;
    const target = locked ? null : getTopLevelTargetById(transit.folderId);
    const stickyRect = locked?.stickyRect || getTargetStickyRect(target);
    clearPendingTarget();
    clearFolderPageTurn();
    group.returnedFromFolder = true;
    group.folderTransit = null;
    group.suppressedTarget = stickyRect
      ? { stickyRect: cloneRect(stickyRect), targetId: transit.folderId }
      : null;
    options.commitOpenFolder(null);
    return true;
  }

  function syncFolderTransit(clientX, clientY, syncOptions = {}) {
    const group = activeDrag?.group;
    const transit = group?.folderTransit;
    if (!transit?.folderId || options.openFolderId.value !== transit.folderId) return "none";
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect?.();
    const inside = Boolean(rect && isPointInsideRect(rect, clientX, clientY));
    if (inside) {
      transit.hasEnteredPanel = true;
      group.suppressedTarget = null;
      return "inside";
    }
    if (!transit.hasEnteredPanel && syncOptions.finalize !== true) return "awaiting-entry";
    leaveFolderTransit();
    return "desktop";
  }

  function resolveDropIntent(clientX, clientY, resolveOptions = {}) {
    const point = getPointerCenter() || { x: clientX, y: clientY };
    const transitPhase = syncFolderTransit(clientX, clientY, resolveOptions);
    if (transitPhase === "awaiting-entry") {
      const pageIndex = getVisualDesktopPageIndex();
      const pageRect = getPageRect(pageIndex);
      if (pageRect && !isPointInsideRect(pageRect, clientX, clientY)) {
        return {
          fallbackPoint: point,
          intent: { reason: "invalid-target", type: "invalid" },
          locked: false,
          target: null,
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
        target: null,
      };
    }
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
            folderId: openFolderId,
            folderPageIndex: target.pageIndex,
            index: target.index,
            type: "folder-slot",
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
          ? { folderId: lockedTarget.item.id, type: "folder-thumbnail" }
          : { targetAppId: lockedTarget.item.id, type: "application" },
        locked: true,
        target: lockedTarget,
      };
    }

    const target = getTopLevelTargetAtPoint(point);
    if (target && isTargetIntentAccepted(target, point)) {
      return {
        fallbackPoint: centerRect(target.rect, point),
        intent: target.item.type === "folder"
          ? { folderId: target.item.id, type: "folder-thumbnail" }
          : { targetAppId: target.item.id, type: "application" },
        locked: false,
        target,
      };
    }

    const pageIndex = getVisualDesktopPageIndex();
    const pageRect = getPageRect(pageIndex);
    if (!isInsideDesktopDropRegion(clientX, clientY, pageRect)) {
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
    return options.planGroupTransfer({
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
    const isTopLevelIntent = ["application", "folder-thumbnail"].includes(resolved?.intent?.type);
    if (!target || !isTopLevelIntent || plan.status !== "accepted") {
      clearPendingTarget();
      return;
    }
    clearPageTurn();
    clearFolderPageTurn();
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
    if (
      activeDrag.group.pendingOpenFolderId === target.item.id ||
      activeDrag.group.folderTransit?.folderId === target.item.id
    ) return;
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
      activeDrag.group.folderTransit = {
        folderId: target.item.id,
        hasEnteredPanel: false,
        origin: "auto",
      };
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
    const resolved = resolveDropIntent(activeDrag.pointer.x, activeDrag.pointer.y, {
      finalize: optionsArg.finalizeFolderTransit === true,
    });
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
    updateLayoutProjection(activeDrag.group, resolved.intent, plan);
    activeDrag.group.phase = activeDrag.hasMoved
      ? GROUP_TRANSFER_PHASE.DRAGGING
      : GROUP_TRANSFER_PHASE.GATHERING;
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
        folderId: options.openFolderId.value,
        folderPageIndex: targetIndex,
        index: 0,
        type: "folder-slot",
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
    let didCommit = false;
    if (pageTurnTimer) {
      const targetIndex = pageTurnTimer.targetIndex;
      clearPageTurn();
      activeDrag.group.desktopPageIndex = targetIndex;
      if (targetIndex < options.pages.value.length) options.commitPageIndex(targetIndex);
      didCommit = true;
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
      didCommit = true;
    }
    return didCommit;
  }

  function isAcceptedTopLevelOutcome(outcome) {
    return outcome?.plan?.status === "accepted" &&
      ["application", "folder-thumbnail"].includes(outcome?.resolved?.intent?.type);
  }

  function makeFolderCreateTargetEntry(plan, resolved) {
    if (!plan?.effects?.createdFolderId || resolved?.intent?.type !== "application") return null;
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

  function normalizeUncommittedNavigation(drag) {
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
  }

  function beginReturnToOrigin({
    cancelSource = null,
    outcome,
    reason = null,
    keyPrefix,
  }) {
    const drag = activeDrag;
    if (!drag?.group) return false;
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    normalizeUncommittedNavigation(drag);
    drag.group.cancelArmed = false;
    drag.group.cancelSource = cancelSource;
    drag.group.phase = GROUP_TRANSFER_PHASE.RETURNING;
    drag.group.outcome = outcome;
    drag.group.reason = reason;
    drag.group.projectedPages = null;
    projectedPages.value = null;
    const releaseKey = `${keyPrefix}-${groupKey}-${drag.group.leadId}`;
    updateGroupPresentation(drag, "return", { key: releaseKey });
    drag.group.settledActorKeys = [];
    drag.group.runtimeStatus = "pending";
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
      outcome: GROUP_TRANSFER_OUTCOME.REJECTED,
      reason: normalizedReason,
      keyPrefix: "group-release-reject",
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
      outcome: GROUP_TRANSFER_OUTCOME.CANCELLED,
      reason: null,
      keyPrefix: "group-release-cancel",
    });
  }

  function returnNoop(reason = "same-placement") {
    return beginReturnToOrigin({
      outcome: GROUP_TRANSFER_OUTCOME.NOOP,
      reason,
      keyPrefix: "group-release-noop",
    });
  }

  function acceptDrop(plan, resolved) {
    const drag = activeDrag;
    const folderCreateTargetEntry = makeFolderCreateTargetEntry(plan, resolved);
    if (
      folderCreateTargetEntry?.item?.id &&
      !drag.group.allEntries.some((entry) => entry?.item?.id === folderCreateTargetEntry.item.id)
    ) {
      drag.group.allEntries.push(folderCreateTargetEntry);
    }
    drag.group.phase = GROUP_TRANSFER_PHASE.COMMITTING;
    drag.group.outcome = GROUP_TRANSFER_OUTCOME.ACCEPTED;
    drag.group.reason = null;
    drag.group.semanticPlan = plan;
    drag.group.projectedPages = null;
    projectedPages.value = null;
    updateGroupPresentation(drag, "release", {
      key: `group-release-${groupKey}-${drag.group.leadId}`,
      transferPlan: plan,
    });
    drag.group.settledActorKeys = [];
    drag.group.runtimeStatus = "pending";
    clearPendingTarget();
    publishGroupState();

    let committed;
    try {
      committed = options.commitGroupDrop(plan, {
        baseRevision: drag.group.baseRevision,
        draggedIds: drag.group.draggedIds,
        intent: drag.group.intent,
        selectionRevision: drag.group.selectionRevision,
        standalone: drag.group.standalone,
      });
    } catch (error) {
      endDrag();
      throw error;
    }
    if (committed === false) {
      drag.group.semanticPlan = null;
      rejectDrop("revision-stale");
      return;
    }
    drag.group.didCommit = true;
    if (
      resolved.intent.type === "folder-slot" &&
      resolved.intent.folderId === options.openFolderId.value
    ) {
      const leadPlacement = plan.members?.find(
        (member) => member.id === drag.group.leadId && member.destination?.kind === "folder"
      );
      options.commitFolderPageIndex(
        leadPlacement?.destination?.folderPageIndex ?? resolved.intent.folderPageIndex,
        { allowCreate: false }
      );
      drag.group.virtualFolderPageIndex = null;
    } else {
      options.commitPageIndex(
        plan.effects?.finalDesktopPageIndex ?? drag.group.desktopPageIndex
      );
    }
    drag.group.phase = GROUP_TRANSFER_PHASE.RELEASING;
    // The release plan now owns the committed landing geometry.  Clear the
    // pre-release target before publishing the accepted frame so hover frames
    // and folder-create backdrops begin their exit in the same render as the
    // accepted drop, instead of waiting for the release ghosts to settle.
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

  function startCommittedGroupTransfer(request = {}) {
    const plan = request.plan;
    if (
      activeDrag ||
      pendingDragStart ||
      plan?.status !== "accepted" ||
      !plan.effects?.createdFolderId
    ) return false;
    if (typeof request.commit !== "function") {
      throw new TypeError("startCommittedGroupTransfer requires commit");
    }
    const draggedIds = Array.from(new Set((request.draggedIds || []).filter(Boolean)));
    const leadId = request.leadId || draggedIds[0] || null;
    const basePages = options.clonePages(request.basePages || options.pages.value);
    const sourceIndex = indexGroupTransferSources(basePages);
    const leadLocation = sourceIndex.apps.get(leadId) || null;
    const targetLocation = options.findTopLevel(plan.nextPages, plan.effects.createdFolderId);
    if (!draggedIds.length || !leadLocation || !targetLocation) {
      throw new Error("Folder creation presentation requires valid lead and target locations");
    }
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
        createdFolderId: plan.effects.createdFolderId,
        desktopPageIndex: targetLocation.pageIndex,
        didCommit: false,
        draggedIds,
        allEntries: [],
        dragEntries: [],
        intent: {
          anchorId: leadId,
          type: "toolbar-folder-create",
        },
        intentKey: null,
        key: `group-create-${groupKey}-${leadId}`,
        lastPlan: plan,
        leadId,
        onComplete: request.onComplete,
        origin: "toolbar",
        outcome: GROUP_TRANSFER_OUTCOME.ACCEPTED,
        phase: GROUP_TRANSFER_PHASE.COMMITTING,
        projectedPages: null,
        reason: null,
        runtimePlan: null,
        runtimeEntries: null,
        settledActorKeys: [],
        runtimeStatus: null,
        semanticPlan: plan,
        selectionRevision: request.selectionRevision,
        shellActors: [],
        sourceMembers: [],
        standalone: false,
        trail: [],
        virtualFolderPageIndex: null,
        visualCompleted: false,
      },
    };
    const gatherPopulation = buildGatherPopulationFromSnapshot({
      activeFolderPageIndex,
      activePageIndex,
      draggedIds,
      leadId,
      leadRect,
      openFolderId,
      pages: basePages,
      pointer,
    });
    activeDrag.group.allEntries = gatherPopulation.allEntries;
    activeDrag.group.sourceMembers = gatherPopulation.sourceMembers;
    updateGroupPresentation(activeDrag, "gather");
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
      drag.group.phase = GROUP_TRANSFER_PHASE.RELEASING;
      updateGroupPresentation(drag, "release", {
        key: `group-release-${groupKey}-${drag.group.leadId}`,
        transferPlan: plan,
      });
      drag.group.settledActorKeys = [];
      drag.group.runtimeStatus = "pending";
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
    normalizeUncommittedNavigation(activeDrag);
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
    const plan = group?.runtimePlan;
    if (!drag || !group || !plan) return false;
    if (result.planKey && result.planKey !== plan.key) return false;
    const entryId = result.entryId || result.id || null;
    if (!entryId) return false;
    const entry = plan.entries.find((candidate) => candidate.id === entryId) || null;
    const actorKey = result.actorKey || entry?.actorKey || null;
    if (!entry || !actorKey) return false;
    const expectedActorKeys = new Set(plan.entries.map((candidate) => candidate.actorKey));
    const settled = new Set(group.settledActorKeys || []);
    if (settled.has(actorKey)) return true;
    settled.add(actorKey);
    group.settledActorKeys = [...settled];
    if (result.outcome === "aborted") {
      group.outcome = GROUP_TRANSFER_OUTCOME.VISUAL_ABORTED;
      group.reason = result.reason || "target-unavailable";
      group.runtimeStatus = "visual-aborted";
      group.phase = GROUP_TRANSFER_PHASE.SETTLED;
      publishGroupState();
      endDrag();
      return true;
    }
    const allSettled = [...expectedActorKeys].every((key) => settled.has(key));
    if (!allSettled) {
      group.runtimeStatus = "running";
      publishGroupState();
      return true;
    }
    group.runtimeStatus = "settled";
    group.phase = GROUP_TRANSFER_PHASE.SETTLED;
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
        basePages: options.clonePages(options.pages.value),
        baseRevision: payload.layoutRevision,
        cancelArmed: false,
        cancelSource: null,
        createdFolderId: options.makeId("folder"),
        desktopPageIndex: options.pageIndex.value,
        didCommit: false,
        draggedIds: [...payload.draggedIds],
        folderTransit: descriptor.source?.type === "folder" &&
          options.openFolderId.value === descriptor.source.folderId
          ? {
            folderId: descriptor.source.folderId,
            hasEnteredPanel: true,
            origin: "source",
          }
          : null,
        allEntries: [],
        dragEntries: [],
        intent: null,
        intentKey: null,
        key: `group-drag-${groupKey}-${payload.leadId}`,
        lastPlan: null,
        lastResolved: null,
        lockedTarget: null,
        leadId: payload.leadId,
        origin: "pointer",
        outcome: null,
        pendingOpenFolderId: null,
        phase: GROUP_TRANSFER_PHASE.GATHERING,
        planRevision: payload.layoutRevision,
        projectedPages: null,
        presentationPlan: null,
        reason: null,
        runtimePlan: null,
        runtimeEntries: null,
        settledActorKeys: [],
        runtimeStatus: null,
        returnedFromFolder: false,
        semanticPlan: null,
        selectionRevision: payload.selectionRevision,
        shellActors: [],
        sourceMembers: [],
        standalone: payload.standalone === true,
        suppressedTarget: null,
        trail: appendGroupTrailPoint([], descriptor.startPoint, { timeMs: startedAt }),
        virtualFolderPageIndex: null,
      },
    };
    const gatherPopulation = buildGatherPopulation(descriptor, activeDrag);
    activeDrag.group.allEntries = gatherPopulation.allEntries;
    activeDrag.group.sourceMembers = gatherPopulation.sourceMembers;
    updateGroupPresentation(activeDrag, "gather");
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
      !isInteractiveGroupTransferPhase(activeDrag.group.phase) ||
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
    if (activeDrag.hasMoved) activeDrag.group.phase = GROUP_TRANSFER_PHASE.DRAGGING;
    activeDrag.group.trail = appendGroupTrailPoint(
      activeDrag.group.trail,
      activeDrag.pointer,
      { timeMs: sample.time }
    );
    const folderTransitPhase = syncFolderTransit(activeDrag.pointer.x, activeDrag.pointer.y);
    const cancelArmed = syncBatchCancelZone();
    scheduleVisualPublish();
    if (cancelArmed) return;
    if (folderTransitPhase === "awaiting-entry") {
      clearPageTurn();
      clearFolderPageTurn();
      scheduleIntentEvaluation();
      return;
    }
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
    if (!isInteractiveGroupTransferPhase(activeDrag.group.phase)) {
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
    let outcome = evaluateIntent({
      finalizeFolderTransit: true,
      force: true,
    });
    if (isAcceptedTopLevelOutcome(outcome)) {
      clearPageTurn();
      clearFolderPageTurn();
    } else if (commitPendingEdgeTurns()) {
      outcome = evaluateIntent({
        finalizeFolderTransit: true,
        force: true,
      });
    }
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderHoverTimers();
    if (!outcome || outcome.plan.status === "rejected") {
      rejectDrop(outcome?.plan?.reason || "invalid-target");
      return;
    }
    if (outcome.plan.status === "noop") {
      returnNoop(outcome.plan.reason || "same-placement");
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
    startCommittedGroupTransfer,
    projectedPages,
    startDrag,
    updateDragPointer,
  };
}
