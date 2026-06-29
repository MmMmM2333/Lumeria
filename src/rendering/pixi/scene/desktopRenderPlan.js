import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getDesktopGridMetrics, getGridSlotRect, makeRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getStageScale, makeStageVirtualElement, snapRectToDevicePixels } from "../geometry/stageCoordinates.js";
import {
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
} from "./dragVisibility.js";
import { getDesktopIconSizing } from "./desktopIconSizing.js";
import { makeTargetIconBounds } from "./iconSceneHelpers.js";

function sourceArea(source) {
  if (source.type === "folder") return "folder";
  if (source.type === "search") return "search";
  return "desktop";
}

export function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, readNumber(value, 0)));
}

export function normalizeFolderIdSet(...sources) {
  const result = new Set();
  const add = (value) => {
    if (!value) return;
    if (value instanceof Set || Array.isArray(value)) {
      for (const id of value) if (id) result.add(id);
      return;
    }
    result.add(value);
  };
  for (const source of sources) add(source);
  return result;
}

function readPrimaryFolderId(ids) {
  return ids.values().next().value || null;
}

export function normalizeDesktopHandoffState(state = {}) {
  const source = state || {};
  const folderSourceGhostedIds = normalizeFolderIdSet(
    source.folderSourceGhostedId,
    source.folderSourceGhostedIds
  );
  const folderClosingHandoffIds = normalizeFolderIdSet(
    source.folderClosingHandoffId,
    source.folderClosingHandoffIds
  );
  return {
    ...source,
    folderClosingHandoffId: readPrimaryFolderId(folderClosingHandoffIds),
    folderClosingHandoffIds,
    folderSourceGhostedId: readPrimaryFolderId(folderSourceGhostedIds),
    folderSourceGhostedIds,
  };
}

function hasFolderSourceGhostedId(state, folderId) {
  if (!folderId) return false;
  return normalizeDesktopHandoffState(state).folderSourceGhostedIds.has(folderId);
}

function hasRawFolderSourceGhosting(state = {}, folderId = null) {
  return hasFolderSourceGhostedId(state, folderId) ||
    state.isFolderOpeningPreviewFrameGhosted?.(folderId) === true;
}

export function hasFolderClosingHandoffId(state = {}, folderId) {
  if (!folderId) return false;
  return normalizeDesktopHandoffState(state).folderClosingHandoffIds.has(folderId);
}

function hasAnyFolderClosingHandoffId(state = {}) {
  return normalizeDesktopHandoffState(state).folderClosingHandoffIds.size > 0;
}

export function isFolderLayerHandoffActive(folderLayer = null, folderId = null) {
  const handoffCoordinator = folderLayer?.folderHandoff || null;
  if (!handoffCoordinator?.isCloseHandoffActive?.()) return false;
  if (!folderId) return true;
  const activeFolderId = handoffCoordinator.folderId || folderLayer.currentFolderId || null;
  return !activeFolderId || activeFolderId === folderId;
}

export function isFolderLayerHoldingDesktopSource(folderLayer = null, folderId = null) {
  if (!folderId) return false;
  const ids = folderLayer?.getDesktopSourceGhostedIds?.();
  return ids?.has?.(folderId) === true;
}

export function isFolderLayerShowingSubstitute(folderLayer = null, folderId = null) {
  if (!folderId) return false;
  // When the overlay cannot be inspected (e.g. unit mocks), assume a substitute
  // exists so the Vue closing id still protects the close-start gap (legacy behavior).
  if (typeof folderLayer?.hasVisibleFolderSubstitute !== "function") return true;
  return folderLayer.hasVisibleFolderSubstitute(folderId) === true;
}

export function getDesktopSourceGhostedIdsFromOwnership(visualOwnership) {
  const ids = new Set();
  for (const entry of visualOwnership?.snapshot?.() || []) {
    if (!entry.key?.startsWith("desktopSource:")) continue;
    const folderId = entry.owner?.folderId || entry.key.slice("desktopSource:".length);
    if (folderId) ids.add(folderId);
  }
  return ids;
}

export function resolveDesktopVisualAlpha(state = {}) {
  return clamp01(state.desktopVisualAlpha ?? 1);
}

export function resolveLaunchpadVisualAlpha(state = {}) {
  return clamp01(state.launchpadVisualAlpha ?? 1);
}

export function resolveLaunchpadVisualTransform(state = {}) {
  const transform = state.launchpadVisualTransform || {};
  return {
    scale: Math.max(0.01, readNumber(transform.scale, 1)),
    y: readNumber(transform.y, 0),
  };
}

export function shouldFinishFolderHandoff(state = {}, folderLayer = null) {
  return !hasAnyFolderClosingHandoffId(state) && !folderLayer?.folderHandoff?.isCloseHandoffActive?.();
}

export function shouldFinishFolderHandoffEntry(state = {}, folderLayer = null, folderId = null) {
  return !hasFolderClosingHandoffId(state, folderId) &&
    !isFolderLayerHandoffActive(folderLayer, folderId) &&
    !isFolderLayerHoldingDesktopSource(folderLayer, folderId);
}

export function isStaleHiddenFolderHandoffEntry(entry = null, folderLayer = null, folderId = null) {
  // A handoff entry that is still HIDDEN (never revealed) yet has no live cover —
  // no coordinator activity, no desktop-source ownership, and no visible substitute.
  // This is the interrupted-close orphan: its close was preempted before the reveal
  // fired, but a stale Vue closing id keeps the entry alive (and re-hidden). It must
  // be revealed WITHOUT retiring (retiring would let isActiveFolderClosingHandoff
  // recreate + re-hide it every frame, flashing the icon/label).
  if (!entry || entry.visualReleased) return false;
  if (isFolderLayerHandoffActive(folderLayer, folderId)) return false;
  if (isFolderLayerHoldingDesktopSource(folderLayer, folderId)) return false;
  if (isFolderLayerShowingSubstitute(folderLayer, folderId)) return false;
  return true;
}

function makeLayoutTargetFromScreenRect(state, stageRect, targetX, rect, visualOffsetY) {
  if (!rect) return null;
  const { scaleX, scaleY } = getStageScale(stageRect, state.width, state.height);
  const stageLeft = Number(stageRect?.left) || 0;
  const stageTop = Number(stageRect?.top) || 0;
  const visualCenterX = (rect.left - stageLeft + rect.width / 2) / scaleX;
  const visualCenterY = (rect.top - stageTop + rect.height / 2) / scaleY;
  return {
    x: visualCenterX - targetX,
    y: visualCenterY - visualOffsetY,
  };
}

function makeSnappedFolderLayoutTarget(state, targetX, x, y, iconSize, visualOffsetY) {
  const targetStageRect = state.stageRect;
  const targetBounds = snapRectToDevicePixels(makeTargetIconBounds(
    targetStageRect,
    state.width,
    state.height,
    targetX + x,
    y,
    iconSize,
    visualOffsetY
  ), state.deviceResolution);
  return makeLayoutTargetFromScreenRect(state, targetStageRect, targetX, targetBounds, visualOffsetY) || { x, y };
}

function makeFolderStableScreenTarget(state, targetX, layoutTarget, iconSize, visualOffsetY) {
  return snapRectToDevicePixels(makeTargetIconBounds(
    state.stageRect,
    state.width,
    state.height,
    targetX + layoutTarget.x,
    layoutTarget.y,
    iconSize,
    visualOffsetY
  ), state.deviceResolution);
}

function makeFolderPinnedLayoutTarget(state, targetX, stableScreenTarget, iconSize, visualOffsetY) {
  const target = makeLayoutTargetFromScreenRect(state, state.stageRect, targetX, stableScreenTarget, visualOffsetY);
  if (!target) return null;
  const { scaleX, scaleY } = getStageScale(state.stageRect, state.width, state.height);
  return {
    ...target,
    scaleX: stableScreenTarget.width / Math.max(1, iconSize * scaleX),
    scaleY: stableScreenTarget.height / Math.max(1, iconSize * scaleY),
  };
}

export const DESKTOP_LAYOUT_TARGET_EPSILON = 0.5;

function stableNumber(value) {
  const number = readNumber(value, Number.NaN);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}

function stableDataUrlSignature(value) {
  if (typeof value !== "string" || !value) return null;
  return `${value.length}:${value.slice(0, 64)}:${value.slice(-64)}`;
}

function makeItemRenderSignature(item, depth = 0) {
  if (!item || typeof item !== "object") return null;
  const childSource = Array.isArray(item.children)
    ? item.children
    : Array.isArray(item.childPages)
      ? item.childPages.flat()
      : [];
  const children = depth >= 2
    ? null
    : childSource
      .filter(Boolean)
      .map((child) => makeItemRenderSignature(child, depth + 1));
  return {
    children,
    customIconDataUrl: stableDataUrlSignature(item.customIconDataUrl),
    customIconPath: item.customIconPath || null,
    customIconUrl: item.customIconUrl || null,
    emoji: item.emoji || null,
    iconDataUrl: stableDataUrlSignature(item.iconDataUrl),
    iconPath: item.iconPath || null,
    iconUrl: item.iconUrl || null,
    id: item.id || null,
    name: item.name || null,
    title: item.title || null,
    type: item.type || null,
  };
}

function stableValue(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "number") return stableNumber(value);
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Set) {
    return Array.from(value).map((entry) => stableValue(entry, seen)).sort();
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, entry]) => [stableValue(key, seen), stableValue(entry, seen)])
      .sort(([left], [right]) => String(left).localeCompare(String(right)));
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const nextValue = stableValue(value[key], seen);
      if (nextValue !== undefined) result[key] = nextValue;
    }
    seen.delete(value);
    return result;
  }
  return undefined;
}

function makeNodeStateSignature(nodeState, item) {
  const { item: _item, ...rest } = nodeState || {};
  return {
    ...stableValue(rest),
    item: makeItemRenderSignature(item),
  };
}

function makeBoundsEntrySignature(boundsEntry) {
  if (!boundsEntry) return null;
  const { item: _item, ...rest } = boundsEntry;
  return {
    ...stableValue(rest),
    item: makeItemRenderSignature(boundsEntry.item),
  };
}

function makeFolderHandoffEntrySignature(entry) {
  if (!entry) return null;
  return {
    folderId: entry.folderId || null,
    labelRevealStarted: entry.labelRevealStarted === true,
    layoutTarget: makeTargetSignature(entry.layoutTarget),
    visualHidden: entry.visualHidden === true,
    visualReleased: entry.visualReleased === true,
  };
}

function makeTargetSignature(target) {
  if (!target) return null;
  return {
    scaleX: stableNumber(target.scaleX),
    scaleY: stableNumber(target.scaleY),
    x: stableNumber(target.x),
    y: stableNumber(target.y),
  };
}

export function isLayoutTargetChanged(previousTarget, nextTarget, epsilon = DESKTOP_LAYOUT_TARGET_EPSILON) {
  if (!previousTarget || !nextTarget) return true;
  for (const key of ["x", "y", "scaleX", "scaleY"]) {
    if (previousTarget[key] == null && nextTarget[key] == null) continue;
    const previousValue = readNumber(previousTarget[key], key === "scaleX" || key === "scaleY" ? 1 : 0);
    const nextValue = readNumber(nextTarget[key], key === "scaleX" || key === "scaleY" ? 1 : 0);
    if (Math.abs(previousValue - nextValue) > epsilon) return true;
  }
  return false;
}

export const isDesktopLayoutTargetChanged = isLayoutTargetChanged;

export function makeDesktopRenderPlanSignature(plan) {
  const state = plan.state || {};
  return JSON.stringify(stableValue({
    clearFolderPreviewChildIds: plan.clearFolderPreviewChildIds,
    clearLaunchArea: plan.clearLaunchArea,
    desktopFrame: plan.desktopFrame,
    emptyText: plan.emptyText,
    entries: plan.entries.map((entry) => ({
      boundsEntry: makeBoundsEntrySignature(entry.boundsEntry),
      effectiveFolderHandoffEntry: makeFolderHandoffEntrySignature(entry.effectiveFolderHandoffEntry),
      handoffLayoutTarget: makeTargetSignature(entry.handoffLayoutTarget),
      isActiveDraggedItem: entry.isActiveDraggedItem,
      isActiveFolderClosingHandoff: entry.isActiveFolderClosingHandoff,
      isFolderClosingHandoff: entry.isFolderClosingHandoff,
      isFolderSourceGhosted: entry.isFolderSourceGhosted,
      isInteractivePage: entry.isInteractivePage,
      isReleaseGhostItem: entry.isReleaseGhostItem,
      item: makeItemRenderSignature(entry.item),
      key: entry.key,
      layoutTarget: makeTargetSignature(entry.layoutTarget),
      nodeState: makeNodeStateSignature(entry.nodeState, entry.item),
      pageIndex: entry.pageIndex,
      shouldRetireStaleHandoff: entry.shouldRetireStaleHandoff,
      source: entry.source,
      stableLayoutTarget: makeTargetSignature(entry.stableLayoutTarget),
      stableScreenTarget: entry.stableScreenTarget,
    })),
    height: state.height,
    pageRefs: plan.pageRefs.map((entry) => ({ pageIndex: entry.pageIndex })),
    pageTrack: plan.pageTrack,
    pageWidth: plan.pageWidth,
    stageRect: state.stageRect,
    targetX: plan.targetX,
    width: state.width,
  }));
}

export function getDesktopFrame(state) {
  const frame = state.desktopFrame || {};
  const width = Math.max(1, readNumber(frame.width, state.width));
  const height = Math.max(1, readNumber(frame.height, state.height));
  return {
    height,
    left: readNumber(frame.left, 0),
    top: readNumber(frame.top, 0),
    width,
  };
}

export function buildDesktopRenderPlan(inputState = {}, options = {}) {
  const state = normalizeDesktopHandoffState(inputState);
  const pages = state.activePages || [];
  const activePageIndex = state.activePageIndex || 0;
  const desktopFrame = getDesktopFrame(state);
  const pageWidth = desktopFrame.width;
  const targetX = -activePageIndex * pageWidth;
  const effectiveFolderSourceGhostedIds = options.effectiveFolderSourceGhostedIds || state.folderSourceGhostedIds;
  const folderHandoffEntries = options.folderHandoffEntries || new Map();
  const folderLayer = options.folderLayer || null;
  const entries = [];
  const pageRefs = [];
  const clearFolderPreviewChildIds = [];

  for (const page of pages) {
    for (const item of page || []) {
      if (item?.type === "folder") clearFolderPreviewChildIds.push(item.id);
    }
  }

  pages.forEach((page, pageIndex) => {
    const visibleItems = state.getVisibleDesktopPage(page);
    const renderMode = state.getDesktopPageRenderMode?.(pageIndex) || "interactive";
    const isInteractivePage = renderMode === "interactive";
    const metrics = getDesktopGridMetrics({
      cols: state.gridCols,
      height: desktopFrame.height,
      isSearchMode: state.isSearchMode,
      paddingTop: state.desktopGridDebugOptions?.paddingTop,
      rows: state.gridRows,
      visibleCount: visibleItems.length,
      width: desktopFrame.width,
    });
    if (typeof state.setPageRef === "function") {
      const gridRect = makeRect(
        desktopFrame.left + metrics.gridLeft,
        desktopFrame.top + metrics.gridTop,
        metrics.gridWidth,
        metrics.gridHeight
      );
      pageRefs.push({
        element: makeStageVirtualElement(state.stageRect, state.width, state.height, gridRect),
        pageIndex,
      });
    }
    if (renderMode === "empty") return;

    visibleItems.forEach((item, index) => {
      const slot = getGridSlotRect(metrics, index);
      const sizing = getDesktopIconSizing(state, slot);
      const x = pageIndex * pageWidth + desktopFrame.left + slot.left + slot.width / 2;
      const y = desktopFrame.top + slot.top + slot.height / 2;
      const visualOffsetY = getIconVisualOffsetY(state.isTextlessMode);
      const stableLayoutTarget = item?.type === "folder"
        ? makeSnappedFolderLayoutTarget(state, targetX, x, y, sizing.iconSize, visualOffsetY)
        : { x, y };
      const stableScreenTarget = item?.type === "folder"
        ? makeFolderStableScreenTarget(state, targetX, stableLayoutTarget, sizing.iconSize, visualOffsetY)
        : null;
      const existingFolderHandoffEntry = item?.type === "folder" ? folderHandoffEntries.get(item.id) || null : null;
      const isActiveFolderClosingHandoff = item?.type === "folder" && hasFolderClosingHandoffId(state, item.id);
      const isRawFolderSourceGhosted = item?.type === "folder" && hasRawFolderSourceGhosting(state, item.id);
      const shouldRetireStaleHandoff = Boolean(
        existingFolderHandoffEntry &&
        shouldFinishFolderHandoffEntry(state, folderLayer, item.id) &&
        isRawFolderSourceGhosted &&
        !existingFolderHandoffEntry.visualReleased
      );
      const effectiveFolderHandoffEntry = shouldRetireStaleHandoff ? null : existingFolderHandoffEntry;
      const isExistingFolderHandoff = Boolean(effectiveFolderHandoffEntry);
      const isFolderClosingHandoff = isActiveFolderClosingHandoff || isExistingFolderHandoff;
      const handoffLayoutTarget = isFolderClosingHandoff
        ? makeFolderPinnedLayoutTarget(state, targetX, stableScreenTarget, sizing.iconSize, visualOffsetY) || stableLayoutTarget
        : null;
      const layoutTarget = handoffLayoutTarget || stableLayoutTarget;
      const source = { type: state.isSearchMode ? "search" : "page", pageIndex, index };
      const key = `${source.type}:${pageIndex}:${item.id}`;
      const isActiveDraggedItem = isActiveDraggedLaunchItem(item, state);
      const isReleaseGhostItem = isReleaseGhostLaunchItem(item, state);
      const isFolderCreateReleaseItem = item.type === "folder" && state.folderCreateReleaseState?.folderId === item.id;
      const isFolderSourceGhosted = item.type === "folder" && !isFolderClosingHandoff && (
        effectiveFolderSourceGhostedIds.has(item.id) ||
        state.isFolderOpeningPreviewFrameGhosted?.(item.id)
      );
      const suppressedFolderPreviewChildId = item.type === "folder" &&
        state.dragReleaseState?.suppressFolderPreviewFolderId === item.id
        ? state.dragReleaseState.suppressFolderPreviewChildId || null
        : null;
      const suppressLabelRevealAfterGhost = isReleaseGhostItem || isFolderClosingHandoff;

      entries.push({
        boundsEntry: isInteractivePage ? {
          area: sourceArea(source),
          handoffLayoutTarget,
          index,
          item,
          pageIndex,
          sizing,
          targetX,
          x: stableLayoutTarget.x,
          y: stableLayoutTarget.y,
        } : null,
        effectiveFolderHandoffEntry,
        handoffLayoutTarget,
        index,
        isActiveDraggedItem,
        isActiveFolderClosingHandoff,
        isFolderClosingHandoff,
        isFolderSourceGhosted,
        isInteractivePage,
        isReleaseGhostItem,
        isFolderCreateReleaseItem,
        item,
        key,
        layoutTarget,
        nodeState: {
          cellHeight: slot.height,
          cellWidth: slot.width,
          compact: sizing.compact,
          dragging: !isFolderClosingHandoff && !state.isSearchMode && isActiveDraggedItem,
          draggable: isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff,
          dropTarget: isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff && state.dragFolderTargetId === item.id,
          editing: isInteractivePage && !isFolderClosingHandoff && state.isEditMode,
          folderHoverState: isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff && state.dragFolderHoverState?.targetId === item.id
            ? state.dragFolderHoverState
            : null,
          folderPreviewPageSize: state.folderPageSize,
          ghosted: !isFolderClosingHandoff && (
            isReleaseGhostItem || isFolderCreateReleaseItem || isFolderSourceGhosted
          ),
          hasCustomIcon: Boolean(item.customIconPath || item.customIconDataUrl),
          iconSize: sizing.iconSize,
          interactive: isInteractivePage && !isFolderClosingHandoff,
          item,
          jiggleSeed: pageIndex * 100 + index,
          launchTargetStatus: isInteractivePage && !isFolderClosingHandoff && state.showMissingLaunchTargetBadge ? state.launchTargetStatusById?.[item.id] : null,
          opening: !isFolderClosingHandoff && isInteractivePage && state.isIconOpening?.(state.isSearchMode ? "search" : "desktop", item.id, pageIndex),
          preserveNodeScale: isFolderClosingHandoff,
          removable: item.type === "app",
          selected: !isFolderClosingHandoff && isInteractivePage && state.isIconSelected?.(state.isSearchMode ? "search" : "desktop", item.id, pageIndex),
          source,
          singleLineLabel: sizing.singleLineLabel,
          stageHeight: state.height,
          stageWidth: state.width,
          suppressedFolderPreviewChildId,
          suppressLabelRevealAfterGhost,
          textless: state.isTextlessMode,
        },
        pageIndex,
        shouldRetireStaleHandoff,
        sizing,
        slot,
        source,
        stableLayoutTarget,
        stableScreenTarget,
        x,
        y,
      });
    });
  });

  const plan = {
    activePageIndex,
    clearFolderPreviewChildIds,
    clearLaunchArea: state.isSearchMode ? "search" : "desktop",
    desktopFrame,
    emptyText: {
      visible: Boolean(state.isSearchMode && pages[activePageIndex]?.length === 0),
      x: desktopFrame.left + desktopFrame.width / 2,
      y: desktopFrame.top + desktopFrame.height / 2,
    },
    entries,
    pageRefs,
    pageTrack: {
      debugMetadata: {
        kind: "PageTrack",
        label: "Desktop page track",
        layer: "desktop",
      },
      pageIndex: activePageIndex,
      pageSpan: pageWidth,
      scrub: state.pageTrackScrub,
      snap: state.shouldSnapTrack,
      sourceLabel: "desktop.pageTrack",
    },
    pageWidth,
    pages,
    state,
    targetX,
  };
  return {
    ...plan,
    signature: makeDesktopRenderPlanSignature(plan),
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
