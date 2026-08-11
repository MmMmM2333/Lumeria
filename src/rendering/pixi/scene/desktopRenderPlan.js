import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { matchesIconFocus } from "../../../domain/iconFocus.js";
import { GROUP_RELEASE_MODE } from "../../../domain/groupReleasePlan.js";
import { resolveIconInteractionPhase } from "../../../domain/input/launchpadTargetPresentation.js";
import { getDesktopGridMetrics, getGridSlotRect, makeRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getStageScale, makeStageVirtualElement, snapRectToDevicePixels } from "../geometry/stageCoordinates.js";
import {
  getReturningGroupDragItemIds,
  isActiveDraggedLaunchItem,
} from "./dragVisibility.js";
import { getDesktopIconSizing } from "./desktopIconSizing.js";
import { makeTargetIconBounds } from "./iconSceneHelpers.js";
import { resolveFolderPresentationState } from "./folderPresentationPlan.js";

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

function countSelectedFolderChildren(folder, selectedIds) {
  if (folder?.type !== "folder" || !selectedIds.size) return 0;
  const children = getFolderPreviewChildren(folder);
  return children.reduce(
    (count, child) => count + (selectedIds.has(child?.id) ? 1 : 0),
    0
  );
}

function getFolderPreviewChildren(folder) {
  return Array.isArray(folder?.childPages)
    ? folder.childPages.flatMap((page) => page || [])
    : folder?.children || [];
}

function getCreatedFolderReleaseOwnedIds(state, folderId) {
  const group = state?.groupDragState;
  if (
    !folderId ||
    group?.releaseCreatedFolderId !== folderId ||
    !["committing", "accepted"].includes(group.phase)
  ) return new Set();

  const ids = new Set();
  // During the committing frame the semantic release plan has not been
  // published yet, but the group entries already contain both the dragged
  // app(s) and the app that was used as the folder-create target.
  for (const entry of group.entries || []) {
    const id = entry?.item?.id;
    if (id) ids.add(id);
  }
  // Once accepted, use the plan as the authoritative landing ownership. The
  // target-kind check keeps unrelated point/folder releases from suppressing
  // a thumbnail child merely because an id happens to be present in entries.
  for (const entry of group.releasePlan?.entries || []) {
    if (
      entry?.mode !== GROUP_RELEASE_MODE.CREATED_FOLDER &&
      entry?.target?.kind !== "created-folder"
    ) continue;
    if (entry.id) ids.add(entry.id);
  }
  return ids;
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

export function isFolderOpeningSourceGhosted(state = {}, folderId = null) {
  if (!folderId) return false;
  if (state.isFolderOpeningPreviewFrameGhosted?.(folderId) === true) return true;
  const folderState = state.singleStageFolderState;
  if (folderState?.renderedFolder?.id !== folderId) return false;
  return !folderState.isFolderClosing &&
    !folderState.isFolderAppLaunchClosing &&
    !folderState.isFolderZoomFadeClosing &&
    !folderState.isDesktopClosing;
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
    !isFolderLayerHoldingDesktopSource(folderLayer, folderId) &&
    !isFolderLayerShowingSubstitute(folderLayer, folderId);
}

export function isStaleHiddenFolderHandoffEntry(state = {}, entry = null, folderLayer = null, folderId = null) {
  // A handoff entry that is still HIDDEN (never revealed) yet has no live cover —
  // no coordinator activity, no desktop-source ownership, and no visible substitute.
  // This is the interrupted-close orphan: its close was preempted before the reveal
  // fired, but a stale Vue closing id keeps the entry alive (and re-hidden). It must
  // be revealed WITHOUT retiring (retiring would let isActiveFolderClosingHandoff
  // recreate + re-hide it every frame, flashing the icon/label).
  if (!entry || entry.visualReleased) return false;
  if (hasRawFolderSourceGhosting(state, folderId)) return false;
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
  const { folderPresentation, item: _item, ...rest } = boundsEntry;
  return {
    ...stableValue(rest),
    folderPresentation: makeFolderPresentationSignature(folderPresentation),
    item: makeItemRenderSignature(boundsEntry.item),
  };
}

function makeFolderHandoffEntrySignature(entry) {
  if (!entry) return null;
  return {
    cleanupQueued: Boolean(entry.cleanupFrame && entry.cleanupFrame.cancelled !== true),
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

function makeRectSignature(rect) {
  if (!rect) return null;
  return {
    height: stableNumber(rect.height),
    left: stableNumber(rect.left),
    top: stableNumber(rect.top),
    width: stableNumber(rect.width),
  };
}

function makeFolderDropTargetSignature(dropTarget) {
  if (!dropTarget) return null;
  return {
    active: dropTarget.active === true,
    geometryVersion: dropTarget.geometryVersion || null,
    hoverRect: makeRectSignature(dropTarget.hoverRect),
    iconSize: stableNumber(dropTarget.iconSize),
    padding: stableNumber(dropTarget.padding),
    phase: dropTarget.phase || null,
    releaseRect: makeRectSignature(dropTarget.releaseRect),
    targetId: dropTarget.targetId || null,
  };
}

function makeFolderPresentationSignature(presentation) {
  if (!presentation) return null;
  return {
    acceptsDropHover: presentation.acceptsDropHover === true,
    dropTarget: makeFolderDropTargetSignature(presentation.dropTarget),
    geometry: presentation.geometry ? {
      geometryVersion: presentation.geometry.geometryVersion || null,
      hitRect: makeRectSignature(presentation.geometry.hitRect),
      hoverRect: makeRectSignature(presentation.geometry.hoverRect),
      releaseRect: makeRectSignature(presentation.geometry.releaseRect),
    } : null,
    handoff: presentation.handoff ? {
      blocksHover: presentation.handoff.blocksHover === true,
      pinsLayout: presentation.handoff.pinsLayout === true,
      retainsSourceVisibility: presentation.handoff.retainsSourceVisibility === true,
      syncsNode: presentation.handoff.syncsNode === true,
    } : null,
    isReleasedHandoff: presentation.isReleasedHandoff === true,
    isSourceGhosted: presentation.isSourceGhosted === true,
    phase: presentation.phase || null,
    sourceVisible: presentation.sourceVisible === true,
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
      folderPresentation: makeFolderPresentationSignature(entry.folderPresentation),
      handoffLayoutTarget: makeTargetSignature(entry.handoffLayoutTarget),
      isActiveDraggedItem: entry.isActiveDraggedItem,
      isActiveFolderClosingHandoff: entry.isActiveFolderClosingHandoff,
      isFolderClosingHandoff: entry.isFolderClosingHandoff,
      isFolderSourceGhosted: entry.isFolderSourceGhosted,
      isInteractivePage: entry.isInteractivePage,
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
    folderDropTarget: makeFolderDropTargetSignature(plan.folderDropTarget),
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

function makeReleaseLayoutTargets(state, desktopFrame, pageWidth, targetX) {
  const group = state.groupDragState;
  const releasePages = group?.releaseLayoutPages;
  if (
    !Array.isArray(releasePages) ||
    !group.releaseLayoutAnchorId ||
    !group.releaseCreatedFolderId ||
    (group.phase !== "committing" && group.phase !== "accepted")
  ) return new Map();

  const targets = new Map();
  releasePages.forEach((page, pageIndex) => {
    const visibleItems = state.getVisibleDesktopPage(page);
    const metrics = getDesktopGridMetrics({
      cols: state.gridCols,
      height: desktopFrame.height,
      isSearchMode: state.isSearchMode,
      paddingTop: state.desktopGridDebugOptions?.paddingTop,
      rows: state.gridRows,
      visibleCount: visibleItems.length,
      width: desktopFrame.width,
    });
    visibleItems.forEach((item, index) => {
      if (!item?.id) return;
      const slot = getGridSlotRect(metrics, index);
      const sizing = getDesktopIconSizing(state, slot);
      const x = pageIndex * pageWidth + desktopFrame.left + slot.left + slot.width / 2;
      const y = desktopFrame.top + slot.top + slot.height / 2;
      const visualOffsetY = getIconVisualOffsetY(state.isTextlessMode);
      targets.set(item.id, item.type === "folder"
        ? makeSnappedFolderLayoutTarget(state, targetX, x, y, sizing.iconSize, visualOffsetY)
        : { x, y });
    });
  });

  const anchorTarget = targets.get(group.releaseLayoutAnchorId);
  if (!anchorTarget) return new Map();
  targets.set(group.releaseCreatedFolderId, { ...anchorTarget });
  return targets;
}

export function buildDesktopRenderPlan(inputState = {}, options = {}) {
  const state = normalizeDesktopHandoffState(inputState);
  const selectedAppIds = normalizeFolderIdSet(state.selectedAppIds);
  const draggedItemIds = normalizeFolderIdSet(state.dragMeta?.draggedIds);
  const returningGroupDragItemIds = getReturningGroupDragItemIds(state);
  const pages = state.activePages || [];
  const activePageIndex = state.activePageIndex || 0;
  const desktopFrame = getDesktopFrame(state);
  const pageWidth = desktopFrame.width;
  const targetX = -activePageIndex * pageWidth;
  const releaseLayoutTargets = makeReleaseLayoutTargets(state, desktopFrame, pageWidth, targetX);
  const effectiveFolderSourceGhostedIds = options.effectiveFolderSourceGhostedIds || state.folderSourceGhostedIds;
  const folderDropFrameSuppressedIds = options.folderDropFrameSuppressedIds || new Set();
  const folderHandoffEntries = options.folderHandoffEntries || new Map();
  const folderGeometryById = options.folderGeometryById || new Map();
  const folderLayer = options.folderLayer || null;
  const entries = [];
  const pageRefs = [];
  const clearFolderPreviewChildIds = [];
  let folderDropTarget = null;

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
      const committedLayoutTarget = item?.type === "folder"
        ? makeSnappedFolderLayoutTarget(state, targetX, x, y, sizing.iconSize, visualOffsetY)
        : { x, y };
      const stableLayoutTarget = releaseLayoutTargets.get(item?.id) || committedLayoutTarget;
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
      const previousGeometry = item?.type === "folder" ? folderGeometryById.get(item.id) || null : null;
      const folderPresentation = item?.type === "folder"
        ? resolveFolderPresentationState({
          dragFolderHoverState: state.dragFolderHoverState,
          dragFolderTargetId: state.dragFolderTargetId,
          existingHandoffEntry: existingFolderHandoffEntry,
          folderId: item.id,
          geometry: {
            liveRect: previousGeometry?.liveRect,
            renderedRect: previousGeometry?.renderedRect,
            stableRect: stableScreenTarget || previousGeometry?.stableRect,
          },
          iconSize: sizing.iconSize,
          isActiveClosingHandoff: isActiveFolderClosingHandoff,
          isEffectiveSourceGhosted: effectiveFolderSourceGhostedIds.has(item.id) ||
            state.isFolderOpeningPreviewFrameGhosted?.(item.id) === true,
          isOpeningSourceGhosted: isFolderOpeningSourceGhosted(state, item.id),
          isInteractivePage,
          isRawSourceGhosted: isRawFolderSourceGhosted,
          isSearchMode: state.isSearchMode,
          shouldRetireStaleHandoff,
        })
        : null;
      if (folderPresentation?.dropTarget?.active) folderDropTarget = folderPresentation.dropTarget;
      const effectiveFolderHandoffEntry = item?.type === "folder" && !shouldRetireStaleHandoff
        ? existingFolderHandoffEntry
        : null;
      const isFolderClosingHandoff = folderPresentation?.handoff.blocksHover === true;
      const pinnedLayoutTarget = folderPresentation?.handoff.pinsLayout
        ? makeFolderPinnedLayoutTarget(state, targetX, stableScreenTarget, sizing.iconSize, visualOffsetY) || stableLayoutTarget
        : null;
      const handoffLayoutTarget = folderPresentation?.handoff.syncsNode ? pinnedLayoutTarget : null;
      const layoutTarget = pinnedLayoutTarget || stableLayoutTarget;
      const source = { type: state.isSearchMode ? "search" : "page", pageIndex, index };
      const key = `${source.type}:${pageIndex}:${item.id}`;
      const isActiveDraggedItem = isActiveDraggedLaunchItem(item, state);
      const isCreatedFolderRelease = item.type === "folder" &&
        state.groupDragState?.releaseCreatedFolderId === item.id &&
        (state.groupDragState.phase === "committing" || state.groupDragState.phase === "accepted");
      const isFolderSourceGhosted = item.type === "folder" && folderPresentation?.isSourceGhosted === true;
      const createdFolderReleaseOwnedIds = item.type === "folder"
        ? getCreatedFolderReleaseOwnedIds(state, item.id)
        : new Set();
      const suppressedFolderPreviewChildIds = item.type === "folder"
        ? getFolderPreviewChildren(item)
          .filter((child) => draggedItemIds.has(child?.id) || createdFolderReleaseOwnedIds.has(child?.id))
          .map((child) => child.id)
        : [];
      const suppressLabelRevealAfterGhost = isFolderClosingHandoff || isFolderSourceGhosted;

      entries.push({
        boundsEntry: isInteractivePage ? {
          area: sourceArea(source),
          folderPresentation,
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
        folderPresentation,
        handoffLayoutTarget,
        index,
        isActiveDraggedItem,
        isActiveFolderClosingHandoff,
        isCreatedFolderRelease,
        isFolderClosingHandoff,
        isFolderSourceGhosted,
        isInteractivePage,
        item,
        key,
        layoutTarget,
        nodeState: {
          batchSelected: Boolean(
            state.isBatchSelectionActive &&
            item.type === "app" &&
            selectedAppIds.has(item.id)
          ),
          cellHeight: slot.height,
          cellWidth: slot.width,
          compact: sizing.compact,
          dragging: !isFolderClosingHandoff && !state.isSearchMode && isActiveDraggedItem,
          draggable: isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff,
          dropTarget: item.type === "folder"
            ? false
            : isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff && state.dragFolderTargetId === item.id,
          editing: isInteractivePage && !isFolderClosingHandoff && state.isEditMode,
          folderHoverState: (item.type === "folder"
            ? false
            : isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff) && state.dragFolderHoverState?.targetId === item.id
            ? state.dragFolderHoverState
            : null,
          folderPreviewPageSize: state.folderPageSize,
          ghosted: !isFolderClosingHandoff && (
            isFolderSourceGhosted ||
            isCreatedFolderRelease
          ),
          hasCustomIcon: Boolean(item.customIconPath || item.customIconDataUrl),
          iconSize: sizing.iconSize,
          interactionPhase: resolveIconInteractionPhase(state.iconGesturePresentation, {
            interactive: isInteractivePage && !isFolderClosingHandoff,
            itemId: item.id,
            scope: state.isSearchMode ? "search" : "desktop",
          }),
          interactive: isInteractivePage && !isFolderClosingHandoff,
          item,
          jiggleSeed: pageIndex * 100 + index,
          launchTargetStatus: isInteractivePage && !isFolderClosingHandoff && state.showMissingLaunchTargetBadge ? state.launchTargetStatusById?.[item.id] : null,
          opening: !isFolderClosingHandoff && isInteractivePage && state.isIconOpening?.(state.isSearchMode ? "search" : "desktop", item.id, pageIndex),
          preserveNodeScale: folderPresentation?.handoff.pinsLayout === true || isFolderClosingHandoff,
          removable: item.type === "app",
          revealLabelAfterGroupReturn: returningGroupDragItemIds.has(item.id),
          focused: !isFolderClosingHandoff && isInteractivePage && matchesIconFocus(
            state.focusedIcon,
            state.isSearchMode ? "search" : "desktop",
            item.id,
            pageIndex
          ),
          selectedChildCount: state.isBatchSelectionActive
            ? countSelectedFolderChildren(item, selectedAppIds)
            : 0,
          source,
          singleLineLabel: sizing.singleLineLabel,
          stageHeight: state.height,
          stageWidth: state.width,
          suppressFolderThumbFrame: item.type === "folder" && (
            folderPresentation?.dropTarget?.active === true ||
            folderDropFrameSuppressedIds.has(item.id)
          ),
          suppressedFolderPreviewChildIds,
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
    folderDropTarget,
    pageRefs,
    pageTrack: {
      debugMetadata: {
        kind: "PageTrack",
        label: "Desktop page track",
        layer: "desktop",
      },
      pageIndex: activePageIndex,
      pageSpan: pageWidth,
      scope: state.isSearchMode ? "search" : "desktop",
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
