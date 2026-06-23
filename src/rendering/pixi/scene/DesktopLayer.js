import { Container, Graphics, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getDesktopGridMetrics, getGridSlotRect, makeRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect, getStageScale, makeStageVirtualElement, snapRectToDevicePixels, stageLayoutRecordToClientRect } from "../geometry/stageCoordinates.js";
import {
  clearFolderPreviewChildBounds,
  clearLaunchIconBounds,
  getLiveClientFolderPreviewChildTargetBounds,
  getLiveClientTopLevelFolderThumbTargetBounds,
  getRenderedClientFolderPreviewChildBounds,
  getRenderedClientTopLevelFolderThumbBounds,
  getStableStageLayoutFolderPreviewChildTargetRecord,
  getStableStageLayoutTopLevelFolderThumbTargetRecord,
  registerLiveClientFolderPreviewChildTargetBounds,
  registerLiveClientLaunchIconTargetBounds,
  registerLiveClientTopLevelFolderThumbTargetBounds,
  registerLiveClientTopLevelIconTargetBounds,
  registerRenderedClientFolderPreviewChildBounds,
  registerRenderedClientLaunchIconBounds,
  registerRenderedClientTopLevelFolderThumbBounds,
  registerStableStageLayoutLaunchIconTargetBounds,
  registerStableStageLayoutFolderPreviewChildTargetBounds,
  registerStableStageLayoutTopLevelFolderThumbTargetBounds,
  registerStableStageLayoutTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { desktopVisualSpring, pageTrackSpring, stopTargetSprings } from "../animation/springMotion.js";
import { killMotionOf, transition } from "../animation/motionTween.js";
import {
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
} from "./dragVisibility.js";
import { makeDesktopBoundsRegistration } from "./desktopBoundsRegistration.js";
import { resolveDesktopBoundsTargets, resolveFolderPreviewChildBoundsTargets } from "./desktopBoundsTargets.js";
import { getDesktopIconSizing } from "./desktopIconSizing.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { FolderOverlayLayer } from "./FolderOverlayLayer.js";
import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";
import { FolderVisualOwnershipRegistry } from "./folderVisualOwnershipRegistry.js";
import { SingleStageDiagnosticsLayer } from "./singleStageDiagnostics.js";
import { DragPreviewLayer } from "./DragPreviewLayer.js";
import { IconNode } from "../nodes/IconNode.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundRect,
} from "./folderHandoffDebug.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";

function sourceArea(source) {
  if (source.type === "folder") return "folder";
  if (source.type === "search") return "search";
  return "desktop";
}

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, readNumber(value, 0)));
}

function normalizeFolderIdSet(...sources) {
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

function hasFolderClosingHandoffId(state = {}, folderId) {
  if (!folderId) return false;
  return normalizeDesktopHandoffState(state).folderClosingHandoffIds.has(folderId);
}

function hasAnyFolderClosingHandoffId(state = {}) {
  return normalizeDesktopHandoffState(state).folderClosingHandoffIds.size > 0;
}

function isFolderLayerHandoffActive(folderLayer = null, folderId = null) {
  if (!folderLayer?.closingHandoffActive) return false;
  if (!folderId) return true;
  const activeFolderId = folderLayer.closingGhostFolderId || folderLayer.currentFolderId || null;
  return !activeFolderId || activeFolderId === folderId;
}

function isFolderLayerHoldingDesktopSource(folderLayer = null, folderId = null) {
  if (!folderId) return false;
  const ids = folderLayer?.getDesktopSourceGhostedIds?.();
  return ids?.has?.(folderId) === true;
}

function getDesktopSourceGhostedIdsFromOwnership(visualOwnership) {
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
  return !hasAnyFolderClosingHandoffId(state) && !folderLayer?.closingHandoffActive;
}

export function shouldFinishFolderHandoffEntry(state = {}, folderLayer = null, folderId = null) {
  return !hasFolderClosingHandoffId(state, folderId) &&
    !isFolderLayerHandoffActive(folderLayer, folderId) &&
    !isFolderLayerHoldingDesktopSource(folderLayer, folderId);
}

function projectStageLayoutRecordToClient(record) {
  return stageLayoutRecordToClientRect(record);
}

function roundDebugObject(object) {
  if (!object || typeof object !== "object") return null;
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    result[key] = typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
  }
  return result;
}

function roundTransformObject(object) {
  if (!object || typeof object !== "object") return null;
  const pointValue = (point, key, fallback = 0) => Math.round(readNumber(point?.[key], fallback) * 1000) / 1000;
  return {
    alpha: Math.round(readNumber(object.alpha, 1) * 1000) / 1000,
    pivotX: pointValue(object.pivot, "x"),
    pivotY: pointValue(object.pivot, "y"),
    scaleX: pointValue(object.scale, "x", 1),
    scaleY: pointValue(object.scale, "y", 1),
    visible: object.visible ?? null,
    x: pointValue(object.position || object, "x"),
    y: pointValue(object.position || object, "y"),
  };
}

function maxAbsRectDelta(rows) {
  const result = { height: 0, left: 0, top: 0, width: 0 };
  for (const row of rows || []) {
    const delta = row?.delta;
    if (!delta) continue;
    result.height = Math.max(result.height, Math.abs(delta.height || 0));
    result.left = Math.max(result.left, Math.abs(delta.left || 0));
    result.top = Math.max(result.top, Math.abs(delta.top || 0));
    result.width = Math.max(result.width, Math.abs(delta.width || 0));
  }
  return result;
}

function worstRectDelta(rows) {
  let worst = null;
  let worstValue = -1;
  for (const row of rows || []) {
    const delta = row?.delta;
    if (!delta) continue;
    const value = Math.max(
      Math.abs(delta.height || 0),
      Math.abs(delta.left || 0),
      Math.abs(delta.top || 0),
      Math.abs(delta.width || 0)
    );
    if (value <= worstValue) continue;
    worstValue = value;
    worst = {
      height: delta.height,
      left: delta.left,
      slot: row.slot,
      top: delta.top,
      width: delta.width,
    };
  }
  return worst;
}

function drawDebugRect(graphics, rect, stageRect, color, alpha = 0.95, width = 3) {
  const local = clientRectToStageVisualRect(rect, stageRect);
  if (!local || local.width <= 0 || local.height <= 0) return;
  graphics
    .rect(local.left, local.top, local.width, local.height)
    .stroke({ alpha, color, width });
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

function getDesktopFrame(state) {
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

function springIconLayoutPosition(node, layoutTarget, markBoundsDirty) {
  transition(node)
    .layout()
    .spring(pageTrackSpring)
    .interrupt("retarget")
    .to({
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      x: layoutTarget.x,
      y: layoutTarget.y,
    })
    .start();
}

function transitionSpringTo(target, vars, config, options = {}) {
  transition(target)
    .layout()
    .spring(config)
    .interrupt("retarget")
    .to({
      ...vars,
      onComplete: options.onComplete,
      onUpdate: options.onUpdate,
      snap: options.snap,
    })
    .start();
}

export class DesktopLayer extends Container {
  constructor(options = {}) {
    super();
    this.visualRoot = new Container();
    this.pageTrack = new Container();
    this.desktopClosingUnderlayLayer = new Container();
    this.desktopClosingUnderlayLayer.eventMode = "none";
    this.handoffDebugLayer = new Graphics();
    this.onIconAction = options.onIconAction || (() => {});
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => {});
    this.onFolderGeometryChange = options.onFolderGeometryChange || (() => {});
    this.onFolderInternalActivityChange = options.onFolderInternalActivityChange || (() => {});
    this.onFolderOutsidePointerDown = options.onFolderOutsidePointerDown || (() => {});
    this.onFolderPanelPointerDown = options.onFolderPanelPointerDown || (() => {});
    this.onFolderTitleFrameChange = options.onFolderTitleFrameChange || (() => {});
    this.onDragReleaseComplete = options.onDragReleaseComplete || (() => {});
    this.visualOwnership = options.visualOwnership || new FolderVisualOwnershipRegistry();
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.lastFolderSourceGhostingState = null;
    this.unsubscribeVisualOwnership = this.visualOwnership.subscribe(() => this.commitFolderSourceGhosting());
    this.singleStageFolderLayer = new FolderOverlayLayer({
      detachedClosingVisualLayer: this.desktopClosingUnderlayLayer,
      onDesktopSourceGhostingChange: () => this.commitFolderSourceGhosting(),
      onClosingFolderPointerDown: (folderId, event) => this.onClosingFolderPointerDown(folderId, event),
      onClosingHandoffPrepare: (folderId) => this.startClosingFolderHandoffNow(folderId, { resetVisual: true, revealLabel: false }),
      onClosingHandoffReady: (folderId) => this.startClosingFolderHandoffNow(folderId),
      onClosingHandoffVisualRelease: (folderId) => this.releaseClosingFolderHandoffVisual(folderId),
      onIconAction: (action, originalEvent, item, source, iconNode) =>
        this.handleIconAction(action, originalEvent, item, source, iconNode),
      onInternalActivityChange: (active, folderId = null) => this.onFolderInternalActivityChange(active, folderId),
      onOutsidePointerDown: (event) => this.onFolderOutsidePointerDown(event),
      onPanelPointerDown: (event) => this.onFolderPanelPointerDown(event),
      showFolderTitle: false,
      onTitleFrameChange: (frame) => this.onFolderTitleFrameChange(frame),
      visualCommitQueue: this.visualCommitQueue,
      visualOwnership: this.visualOwnership,
    });
    this.singleStageDiagnosticsLayer = new SingleStageDiagnosticsLayer();
    this.singleStageDragPreviewLayer = new DragPreviewLayer({
      onReleaseComplete: (release) => this.onDragReleaseComplete(release),
    });
    this.folderHandoffNodes = new Map();
    this.primaryFolderHandoffId = null;
    this.hasDesktopVisualAlpha = false;
    this.hasDesktopVisualTransform = false;
    this.hasFolderOverlayAlpha = false;
    this.hasFolderOverlayTransform = false;
    this.lastFolderHandoffDebugSnapshot = null;
    this.iconNodes = new Map();
    this.pageTrackMotion = createPageTrackMotionState();
    this.boundsRegistration = null;
    this.boundsFlushQueued = false;
    this.boundsDirty = false;
    this.emptyText = new Text({
      text: "没有找到匹配的应用",
      style: { fill: 0xffffff, fontSize: 15, alpha: 0.74, fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.emptyText.anchor.set(0.5);
    this.visualRoot.addChild(this.pageTrack);
    this.visualRoot.addChild(this.emptyText);
    this.addChild(this.visualRoot);
    this.addChild(this.desktopClosingUnderlayLayer);
    this.addChild(this.singleStageFolderLayer);
    this.addChild(this.singleStageDragPreviewLayer);
    this.addChild(this.singleStageDiagnosticsLayer);
    this.addChild(this.handoffDebugLayer);
    this.describeMotionTargets();
  }

  get folderHandoffNode() {
    return this.getPrimaryFolderHandoffNode();
  }

  set folderHandoffNode(entry) {
    if (!entry) {
      this.primaryFolderHandoffId = null;
      return;
    }
    if (!entry.folderId) return;
    this.getFolderHandoffNodes().set(entry.folderId, entry);
    this.primaryFolderHandoffId = entry.folderId;
  }

  update(state) {
    state = normalizeDesktopHandoffState(state);
    const effectiveFolderSourceGhostedIds = normalizeFolderIdSet(
      state.folderSourceGhostedIds,
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership),
      this.singleStageFolderLayer.getDesktopSourceGhostedIds?.()
    );
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    this.describeMotionTargets(state);
    this.applyDesktopVisualTransform(state);
    this.applyDesktopVisualAlpha(state);
    this.applyFolderOverlayTransform(state);
    this.applyFolderOverlayAlpha(state);
    const pages = state.activePages || [];
    const activePageIndex = state.activePageIndex || 0;
    const desktopFrame = getDesktopFrame(state);
    const pageWidth = desktopFrame.width;
    const targetX = -activePageIndex * pageWidth;
    const shouldSnap = state.shouldSnapTrack;
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();

    clearLaunchIconBounds(state.isSearchMode ? "search" : "desktop");
    for (const page of pages) {
      for (const item of page || []) {
        if (item?.type === "folder") clearFolderPreviewChildBounds(item.id);
      }
    }

    const seen = new Set();
    const boundsEntries = [];
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
        state.setPageRef(makeStageVirtualElement(state.stageRect, state.width, state.height, gridRect), pageIndex);
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
        let existingFolderHandoffEntry = item?.type === "folder" ? this.getFolderHandoffEntry(item.id) : null;
        const isActiveFolderClosingHandoff = item?.type === "folder" && hasFolderClosingHandoffId(state, item.id);
        const isRawFolderSourceGhosted = item?.type === "folder" && hasRawFolderSourceGhosting(state, item.id);
        if (existingFolderHandoffEntry && !isActiveFolderClosingHandoff && isRawFolderSourceGhosted) {
          this.clearFolderHandoffNode(item.id);
          existingFolderHandoffEntry = null;
        }
        const isExistingFolderHandoff = Boolean(existingFolderHandoffEntry);
        const isFolderClosingHandoff = isActiveFolderClosingHandoff || isExistingFolderHandoff;
        const handoffLayoutTarget = isFolderClosingHandoff
          ? makeFolderPinnedLayoutTarget(state, targetX, stableScreenTarget, sizing.iconSize, visualOffsetY) || stableLayoutTarget
          : null;
        const layoutTarget = handoffLayoutTarget || stableLayoutTarget;
        const source = { type: state.isSearchMode ? "search" : "page", pageIndex, index };
        const key = `${source.type}:${pageIndex}:${item.id}`;
        const isActiveDraggedItem = isActiveDraggedLaunchItem(item, state);
        const isReleaseGhostItem = isReleaseGhostLaunchItem(item, state);
        seen.add(key);
        let node = this.iconNodes.get(key);
        if (!node) {
          node = new IconNode({
            onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
              this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
          });
          node.alpha = isFolderClosingHandoff ? 1 : 0;
          node.position.set(layoutTarget.x, isFolderClosingHandoff ? layoutTarget.y : layoutTarget.y + 8);
          this.iconNodes.set(key, node);
          this.pageTrack.addChild(node);
          if (!isFolderClosingHandoff) {
            transition(node)
              .preset("fade")
              .layout()
              .interrupt("retarget")
              .to({ alpha: 1 })
              .start();
            springIconLayoutPosition(node, layoutTarget, markBoundsDirty);
          }
        } else if (!isFolderClosingHandoff) {
          springIconLayoutPosition(node, layoutTarget, markBoundsDirty);
        }

        node.stageRect = state.stageRect;
        const isFolderSourceGhosted = item.type === "folder" && !isFolderClosingHandoff && (
          effectiveFolderSourceGhostedIds.has(item.id) ||
          state.isFolderOpeningPreviewFrameGhosted?.(item.id)
        );
        node.__folderSourceGhostedByOwnership = Boolean(isFolderSourceGhosted);
        const suppressLabelRevealAfterGhost = isReleaseGhostItem || isFolderClosingHandoff;
        node.setState({
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
            isReleaseGhostItem || (isInteractivePage && isFolderSourceGhosted)
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
          suppressLabelRevealAfterGhost,
          textless: state.isTextlessMode,
        });
        let folderHandoffEntry = existingFolderHandoffEntry;
        if (isActiveFolderClosingHandoff) {
          this.ensureFolderHandoffNode(item.id, node, layoutTarget);
          folderHandoffEntry = this.getFolderHandoffEntry(item.id);
        } else if (folderHandoffEntry) {
          this.syncFolderHandoffNode(node, layoutTarget, folderHandoffEntry);
        }
        if (isFolderClosingHandoff && folderHandoffEntry?.visualReleased) this.revealFolderHandoffLabel(folderHandoffEntry);

        if (isInteractivePage) {
          const area = sourceArea(source);
          boundsEntries.push({
            area,
            handoffLayoutTarget,
            index,
            item,
            node,
            pageIndex,
            sizing,
            targetX,
            x: stableLayoutTarget.x,
            y: stableLayoutTarget.y,
          });
        }
      });
    });

    this.emptyText.visible = Boolean(state.isSearchMode && pages[activePageIndex]?.length === 0);
    this.emptyText.position.set(desktopFrame.left + desktopFrame.width / 2, desktopFrame.top + desktopFrame.height / 2);
    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      killMotionOf(node);
      stopTargetSprings(node);
      transition(node)
        .preset("fade")
        .layout()
        .interrupt("retarget")
        .to({ alpha: 0, onComplete: () => node.destroy({ children: true }) })
        .start();
    }

    this.boundsRegistration = makeDesktopBoundsRegistration(state, boundsEntries, desktopFrame);
    updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
      debugMetadata: {
        kind: "PageTrack",
        label: "Desktop page track",
        layer: "desktop",
      },
      onFrame: markBoundsDirty,
      pageIndex: activePageIndex,
      pageSpan: pageWidth,
      scrub: state.pageTrackScrub,
      sourceLabel: "desktop.pageTrack",
      snap: shouldSnap,
      springConfig: pageTrackSpring,
    });
    this.flushInteractiveBounds({ force: true });
    this.updateSingleStageFolderLayer(state);
    this.applyFolderSourceGhosting(state);
    this.updateSingleStageDragPreviewLayer(state);
    this.singleStageDiagnosticsLayer.update(state.singleStageFolderState, {
      enabled: state.singleStageDiagnosticsEnabled,
    });
    for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
      if (shouldFinishFolderHandoffEntry(state, this.singleStageFolderLayer, entry.folderId)) {
        this.finishFolderHandoffNodeAfterFrame(entry.folderId);
      }
    }
  }

  describeMotionTargets(state = {}) {
    const base = {
      height: state.height ?? this.heightValue ?? null,
      label: "Desktop",
      layer: "desktop",
      width: state.width ?? this.widthValue ?? null,
    };
    const describe = (target, metadata, overlayTarget = target) => {
      if (target) motionRuntime.describeTarget(target, { ...metadata, overlayTarget });
    };
    describe(this.visualRoot, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.visualRoot",
      targetPart: "visualRoot",
    }, this.visualRoot);
    describe(this.visualRoot?.scale, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.visualScale",
      targetPart: "visualRoot.scale",
    }, this.visualRoot);
    describe(this.desktopClosingUnderlayLayer, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.closingUnderlay",
      targetPart: "closingUnderlay",
    }, this.desktopClosingUnderlayLayer);
    describe(this.desktopClosingUnderlayLayer?.scale, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.closingUnderlayScale",
      targetPart: "closingUnderlay.scale",
    }, this.desktopClosingUnderlayLayer);
    describe(this.singleStageFolderLayer, {
      ...base,
      kind: "FolderOverlay",
      sourceLabel: "folder.overlay",
      targetPart: "singleStageFolderLayer",
    }, this.singleStageFolderLayer);
    describe(this.singleStageFolderLayer?.scale, {
      ...base,
      kind: "FolderOverlay",
      sourceLabel: "folder.overlayScale",
      targetPart: "singleStageFolderLayer.scale",
    }, this.singleStageFolderLayer);
    describe(this.pageTrack, {
      ...base,
      kind: "PageTrack",
      label: "Desktop page track",
      sourceLabel: "desktop.pageTrack",
      targetPart: "pageTrack",
    }, this.pageTrack);
  }

  applyDesktopVisualTransform(state) {
    const transform = state.desktopVisualTransform || {};
    const scale = Math.max(0.01, readNumber(transform.scale, 1));
    const offsetY = readNumber(transform.y, 0);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + offsetY;
    this.visualRoot.pivot.set(centerX, centerY);
    this.desktopClosingUnderlayLayer.pivot.set(centerX, centerY);
    if (!this.hasDesktopVisualTransform) {
      this.visualRoot.position.set(centerX, targetY);
      this.visualRoot.scale.set(scale);
      this.desktopClosingUnderlayLayer.position.set(centerX, targetY);
      this.desktopClosingUnderlayLayer.scale.set(scale);
      this.hasDesktopVisualTransform = true;
      return;
    }
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    transitionSpringTo(this.visualRoot, { x: centerX, y: targetY }, desktopVisualSpring, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
    transitionSpringTo(this.visualRoot.scale, { x: scale, y: scale }, desktopVisualSpring, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
    transitionSpringTo(this.desktopClosingUnderlayLayer, { x: centerX, y: targetY }, desktopVisualSpring, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
    transitionSpringTo(this.desktopClosingUnderlayLayer.scale, { x: scale, y: scale }, desktopVisualSpring, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
  }

  applyDesktopVisualAlpha(state) {
    const alpha = resolveDesktopVisualAlpha(state);
    this.visualRoot.visible = true;
    this.visualRoot.interactiveChildren = alpha > 0.001;
    this.desktopClosingUnderlayLayer.visible = true;
    this.desktopClosingUnderlayLayer.interactiveChildren = false;
    if (!this.hasDesktopVisualAlpha) {
      this.visualRoot.alpha = alpha;
      this.desktopClosingUnderlayLayer.alpha = alpha;
      this.hasDesktopVisualAlpha = true;
      return;
    }
    transitionSpringTo(this.visualRoot, { alpha }, desktopVisualSpring);
    transitionSpringTo(this.desktopClosingUnderlayLayer, { alpha }, desktopVisualSpring);
  }

  applyFolderOverlayAlpha(state) {
    const alpha = resolveLaunchpadVisualAlpha(state);
    this.singleStageFolderLayer.visible = true;
    this.singleStageFolderLayer.interactiveChildren = alpha > 0.001;
    if (!this.hasFolderOverlayAlpha) {
      this.singleStageFolderLayer.alpha = alpha;
      this.hasFolderOverlayAlpha = true;
      return;
    }
    transitionSpringTo(this.singleStageFolderLayer, { alpha }, desktopVisualSpring);
  }

  hasSingleStageFolderOverlayContent(state = {}) {
    return Boolean(state.singleStageFolderLayerEnabled && state.singleStageFolderState?.renderedFolder);
  }

  applyFolderOverlayTransform(state) {
    const transform = resolveLaunchpadVisualTransform(state);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + transform.y;
    this.singleStageFolderLayer.pivot.set(centerX, centerY);
    const shouldSnap = !this.hasSingleStageFolderOverlayContent(state);
    if (!this.hasFolderOverlayTransform) {
      this.singleStageFolderLayer.position.set(centerX, targetY);
      this.singleStageFolderLayer.scale.set(transform.scale);
      this.hasFolderOverlayTransform = true;
      return;
    }
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    transitionSpringTo(this.singleStageFolderLayer, { x: centerX, y: targetY }, desktopVisualSpring, {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnap,
    });
    transitionSpringTo(this.singleStageFolderLayer.scale, { x: transform.scale, y: transform.scale }, desktopVisualSpring, {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnap,
    });
  }

  updateSingleStageFolderLayer(state) {
    if (state.singleStageFolderLayerEnabled && state.singleStageFolderState) {
      this.onFolderGeometryChange(this.singleStageFolderLayer.update(state.singleStageFolderState));
      return;
    }
    this.onFolderGeometryChange(this.singleStageFolderLayer.update({
      folderPanelRef: null,
      folderViewportRef: null,
      height: state.height,
      renderedFolder: null,
      stageRect: state.stageRect,
      width: state.width,
    }));
  }

  applyFolderSourceGhosting(state) {
    state = normalizeDesktopHandoffState(state);
    this.lastFolderSourceGhostingState = state;
    const rawIds = state.folderSourceGhostedIds;
    const ownershipIds = normalizeFolderIdSet(
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership),
      this.singleStageFolderLayer.getDesktopSourceGhostedIds?.()
    );
    for (const node of this.iconNodes.values()) {
      if (node.item?.type !== "folder" || !node.state) continue;
      const folderId = node.item.id;
      const rawGhosted = rawIds.has(folderId) || state.isFolderOpeningPreviewFrameGhosted?.(folderId);
      const ownershipGhosted = ownershipIds.has(folderId);
      const nextGhosted = rawGhosted || ownershipGhosted;
      const handoffEntry = this.getFolderHandoffEntry(folderId);
      if (handoffEntry) {
        const activeHandoff = hasFolderClosingHandoffId(state, folderId) ||
          isFolderLayerHandoffActive(this.singleStageFolderLayer, folderId);
        if (rawGhosted || (ownershipGhosted && !activeHandoff && handoffEntry.visualReleased === true)) {
          this.clearFolderHandoffNode(folderId);
        } else {
          node.__folderSourceGhostedByOwnership = Boolean(nextGhosted);
          continue;
        }
      }
      const previousGhostedByOwnership = node.__folderSourceGhostedByOwnership === true;
      if (previousGhostedByOwnership === Boolean(nextGhosted)) continue;
      const baseGhosted = Boolean(node.state.ghosted) && !previousGhostedByOwnership;
      node.__folderSourceGhostedByOwnership = Boolean(nextGhosted);
      node.setState({ ...node.state, ghosted: baseGhosted || Boolean(nextGhosted) });
    }
  }

  commitFolderSourceGhosting() {
    if (!this.lastFolderSourceGhostingState) return;
    this.applyFolderSourceGhosting(this.lastFolderSourceGhostingState);
    this.reconcileFolderHandoffEntries(this.lastFolderSourceGhostingState);
  }

  reconcileFolderHandoffEntries(state = this.lastFolderSourceGhostingState || {}) {
    for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
      if (shouldFinishFolderHandoffEntry(state, this.singleStageFolderLayer, entry.folderId)) {
        this.finishFolderHandoffNodeAfterFrame(entry.folderId);
      }
    }
  }

  updateSingleStageDragPreviewLayer(state) {
    const previewState = state.singleStageDragPreviewEnabled ? state.dragPreviewState : null;
    const releaseState = state.singleStageDragPreviewEnabled ? state.dragReleaseState : null;
    this.singleStageDragPreviewLayer.update({
      folderHoverState: state.dragFolderHoverState,
      folderPageSize: state.folderPageSize,
      height: state.height,
      iconSize: state.iconSize,
      isTextlessMode: state.isTextlessMode,
      launchTargetStatusById: state.launchTargetStatusById,
      previewState,
      releaseState,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stageRect: state.stageRect,
      width: state.width,
    });
  }

  findFolderBoundsEntry(folderId) {
    const entries = this.boundsRegistration?.entries || [];
    return entries.find((entry) => entry?.item?.id === folderId && entry.item.type === "folder" && entry.area === "desktop") ||
      entries.find((entry) => entry?.item?.id === folderId && entry.item.type === "folder") ||
      null;
  }

  getFolderHandoffNodes() {
    if (!(this.folderHandoffNodes instanceof Map)) this.folderHandoffNodes = new Map();
    return this.folderHandoffNodes;
  }

  getPrimaryFolderHandoffNode() {
    const entries = this.getFolderHandoffNodes();
    if (this.primaryFolderHandoffId && entries.has(this.primaryFolderHandoffId)) {
      return entries.get(this.primaryFolderHandoffId);
    }
    return entries.values().next().value || null;
  }

  getFolderHandoffEntry(folderId = null) {
    const entries = this.getFolderHandoffNodes();
    if (folderId) return entries.get(folderId) || null;
    return this.getPrimaryFolderHandoffNode();
  }

  setPrimaryFolderHandoffNode(entry = null) {
    this.primaryFolderHandoffId = entry?.folderId || null;
  }

  startClosingFolderHandoffNow(folderId, options = {}) {
    const entry = this.findFolderBoundsEntry(folderId);
    const existing = this.getFolderHandoffEntry(folderId);
    const node = entry?.node || existing?.node || this.findIconNodeByItemId(folderId);
    const layoutTarget = entry?.handoffLayoutTarget || (entry ? { x: entry.x, y: entry.y } : existing?.layoutTarget);
    if (!folderId || !node || node.destroyed || !layoutTarget) return false;
    this.ensureFolderHandoffNode(folderId, node, layoutTarget, options);
    return true;
  }

  ensureFolderHandoffNode(folderId, node, layoutTarget, options = {}) {
    if (!folderId || !node || node.destroyed) return;
    const entries = this.getFolderHandoffNodes();
    let entry = entries.get(folderId) || null;
    if (!entry) {
      entry = {
        cleanupFrame: null,
        folderId,
        labelRevealStarted: false,
        node,
        originalIndex: this.getPageTrackChildIndex(node),
        visualHidden: false,
        visualReleased: false,
      };
      entries.set(folderId, entry);
    } else if (entry.node !== node) {
      this.restoreFolderHandoffNode(entry);
      entry.node = node;
      entry.originalIndex = this.getPageTrackChildIndex(node);
      entry.labelRevealStarted = false;
      entry.visualHidden = false;
      entry.visualReleased = false;
    } else if (options.resetVisual === true) {
      entry.labelRevealStarted = false;
      entry.visualHidden = false;
      entry.visualReleased = false;
    }
    if (entry.cleanupFrame != null) {
      globalThis.cancelAnimationFrame?.(entry.cleanupFrame);
      entry.cleanupFrame = null;
    }
    this.setPrimaryFolderHandoffNode(entry);
    this.syncFolderHandoffNode(node, layoutTarget, entry);
    if (options.revealLabel !== false) this.revealFolderHandoffLabel(entry);
  }

  syncFolderHandoffNode(node = this.folderHandoffNode?.node, layoutTarget = null, handoffEntry = null) {
    const entry = handoffEntry || this.getFolderHandoffEntry(node?.item?.id || this.folderHandoffNode?.folderId || null);
    if (!entry || !node || node.destroyed) return;
    const target = layoutTarget || entry.layoutTarget;
    if (!target) return;
    entry.node = node;
    entry.layoutTarget = target;
    killMotionOf(node);
    killMotionOf(node.scale);
    node.position.set(target.x, target.y);
    node.scale.set(target.scaleX || 1, target.scaleY || target.scaleX || 1);
    node.alpha = 1;
    node.visible = true;
    node.eventMode = "static";
    node.cursor = "pointer";
    if (node.state) {
      node.state.draggable = true;
      node.state.ghosted = false;
      node.state.interactive = true;
    }
    node.resetFolderPreviewAfterGhost?.();
    if (!entry.visualReleased) {
      node.setFolderHandoffVisualHidden?.(true);
      entry.visualHidden = true;
    } else if (entry.visualHidden) {
      node.setFolderHandoffVisualHidden?.(false);
      entry.visualHidden = false;
    }
    if (node.labelText) {
      node.labelText.visible = true;
      if (!entry.labelRevealStarted) {
        killMotionOf(node.labelText);
        node.labelText.alpha = 0;
      }
    }
    if (node.parent === this.pageTrack && this.pageTrack.children.length > 1) {
      this.pageTrack.setChildIndex(node, this.pageTrack.children.length - 1);
    }
  }

  finishFolderHandoffNodeAfterFrame(folderId = null) {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || entry.cleanupFrame != null) return;
    if (entry.visualReleased) this.revealFolderHandoffLabel(entry);
    const finish = () => {
      if (this.getFolderHandoffEntry(entry.folderId) !== entry) return;
      entry.cleanupFrame = null;
      this.clearFolderHandoffNode(entry.folderId);
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      entry.cleanupFrame = globalThis.requestAnimationFrame(finish);
    } else {
      finish();
    }
  }

  releaseClosingFolderHandoffVisual(folderId = null) {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || (folderId && entry.folderId !== folderId)) return;
    this.debugFolderHandoffRestore(entry, "desktop-restore-before");
    this.restoreFolderHandoffVisual(entry);
    this.debugFolderHandoffRestore(entry, "desktop-restore-after");
    this.revealFolderHandoffLabel(entry);
  }

  restoreFolderHandoffVisual(entry) {
    const node = entry?.node;
    if (!node || node.destroyed) return;
    node.setFolderHandoffVisualHidden?.(false);
    entry.visualHidden = false;
    entry.visualReleased = true;
  }

  revealFolderHandoffLabel(entry = this.folderHandoffNode) {
    const node = entry?.node;
    if (!entry || entry.labelRevealStarted || !node || node.destroyed || !node.labelText?.visible) return;
    entry.labelRevealStarted = true;
    if (typeof node.revealLabelAfterGhost === "function") node.revealLabelAfterGhost();
    else node.labelText.alpha = 1;
  }

  clearFolderHandoffNode(folderId = null) {
    if (!folderId) {
      for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
        this.clearFolderHandoffNode(entry.folderId);
      }
      return;
    }
    const entry = this.getFolderHandoffEntry(folderId);
    if (entry) {
      this.lastFolderHandoffDebugSnapshot = this.makeFolderHandoffDebugSnapshot(entry, {
        active: false,
        clearing: true,
      }) || this.lastFolderHandoffDebugSnapshot;
    }
    if (!entry) return;
    if (entry.cleanupFrame != null) globalThis.cancelAnimationFrame?.(entry.cleanupFrame);
    this.getFolderHandoffNodes().delete(entry.folderId);
    if (this.primaryFolderHandoffId === entry.folderId) this.setPrimaryFolderHandoffNode(null);
    this.restoreFolderHandoffNode(entry);
  }

  restoreFolderHandoffNode(entry) {
    const node = entry?.node;
    if (!node || node.destroyed) return;
    this.restoreFolderHandoffVisual(entry);
    if (node.parent !== this.pageTrack) return;
    const childCount = this.pageTrack.children.length;
    if (!childCount) return;
    const targetIndex = Math.max(0, Math.min(entry.originalIndex ?? childCount - 1, childCount - 1));
    if (this.getPageTrackChildIndex(node) !== targetIndex) this.pageTrack.setChildIndex(node, targetIndex);
    if (entry.visualReleased) this.revealFolderHandoffLabel(entry);
  }

  getPageTrackChildIndex(node) {
    return this.pageTrack.children.indexOf(node);
  }

  debugFolderHandoffRestore(entry, phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return null;
    const snapshot = this.makeFolderHandoffDebugSnapshot(entry, { phase });
    if (!snapshot) return null;
    globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__ = {
      ...snapshot,
      desktopLogged: false,
      phase,
    };
    console.log("[folder-handoff-debug] desktop-restore", {
      ...snapshot,
      phase,
    });
    return snapshot;
  }

  makeFolderHandoffDebugSnapshot(entry, options = {}) {
    const node = entry?.node;
    if (!entry || !node || node.destroyed) return null;
    const registration = this.boundsRegistration || {};
    const stageRect = registration.stageRect || this.stageRect;
    const folderId = entry.folderId || node.item?.id || null;
    const thumbRect = node.getFolderThumbBounds?.(stageRect) || null;
    const iconRect = node.getIconBounds?.(stageRect) || null;
    const liveTargetRect = folderId ? getLiveClientTopLevelFolderThumbTargetBounds(folderId) : null;
    const stableStageLayoutTargetRecord = folderId ? getStableStageLayoutTopLevelFolderThumbTargetRecord(folderId) : null;
    const stableTargetRect = projectStageLayoutRecordToClient(stableStageLayoutTargetRecord);
    const registeredThumbRect = folderId ? getRenderedClientTopLevelFolderThumbBounds(folderId) : null;
    const targetRect = liveTargetRect || registeredThumbRect || stableTargetRect;
    const childRows = [];
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] || node.item.children?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(stageRect, slotIndex);
      const targetChildRect = targetRect ? makeFolderThumbPreviewRect(targetRect, slotIndex) : null;
      childRows.push({
        actual: roundRect(actualRect, 2),
        delta: rectDelta(actualRect, targetChildRect),
        slot: slotIndex,
        target: roundRect(targetChildRect, 2),
      });
    }
    return {
      active: options.active !== false,
      childMaxDelta: maxAbsRectDelta(childRows),
      childRows,
      childWorstDelta: worstRectDelta(childRows),
      childIndex: this.getPageTrackChildIndex(node),
      clearing: options.clearing === true,
      desktopClosingUnderlayLayer: roundTransformObject(this.desktopClosingUnderlayLayer),
      folderId,
      iconRect: roundRect(iconRect, 2),
      layoutTarget: roundDebugObject(entry.layoutTarget),
      liveTargetRect: roundRect(liveTargetRect, 2),
      node: {
        alpha: Math.round((node.alpha ?? 0) * 1000) / 1000,
        eventMode: node.eventMode,
        folderChildrenWrapScaleX: node.folderChildrenWrap?.scale ? Math.round((node.folderChildrenWrap.scale.x ?? 1) * 1000) / 1000 : null,
        folderChildrenWrapScaleY: node.folderChildrenWrap?.scale ? Math.round((node.folderChildrenWrap.scale.y ?? 1) * 1000) / 1000 : null,
        folderChildrenWrapY: node.folderChildrenWrap ? Math.round((node.folderChildrenWrap.y || 0) * 1000) / 1000 : null,
        labelAlpha: node.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
        labelVisible: node.labelText ? node.labelText.visible : null,
        parentIsPageTrack: node.parent === this.pageTrack,
        scaleX: Math.round((node.scale?.x ?? 1) * 1000) / 1000,
        scaleY: Math.round((node.scale?.y ?? 1) * 1000) / 1000,
        visible: node.visible,
        visualWrapAlpha: node.visualWrap ? Math.round((node.visualWrap.alpha ?? 1) * 1000) / 1000 : null,
        visualWrapScaleX: node.visualWrap?.scale ? Math.round((node.visualWrap.scale.x ?? 1) * 1000) / 1000 : null,
        visualWrapScaleY: node.visualWrap?.scale ? Math.round((node.visualWrap.scale.y ?? 1) * 1000) / 1000 : null,
        visualWrapVisible: node.visualWrap ? node.visualWrap.visible : null,
        x: Math.round((node.x || 0) * 1000) / 1000,
        y: Math.round((node.y || 0) * 1000) / 1000,
      },
      originalIndex: entry.originalIndex ?? null,
      pageTrack: roundTransformObject(this.pageTrack),
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      phase: options.phase || null,
      registeredThumbRect: roundRect(registeredThumbRect, 2),
      singleStageFolderLayer: roundTransformObject(this.singleStageFolderLayer),
      source: options.source || "handoff-node",
      stableStageLayoutTargetRect: roundRect(stableStageLayoutTargetRecord, 2),
      stableTargetRect: roundRect(stableTargetRect, 2),
      stageRect: roundRect(stageRect, 2),
      stageScaleX: registration.stageRect?.width && registration.width ? Math.round((registration.stageRect.width / registration.width) * 1000000) / 1000000 : null,
      stageScaleY: registration.stageRect?.height && registration.height ? Math.round((registration.stageRect.height / registration.height) * 1000000) / 1000000 : null,
      targetDelta: rectDelta(thumbRect, targetRect),
      targetRect: roundRect(targetRect, 2),
      thumbRect: roundRect(thumbRect, 2),
      visualRoot: roundTransformObject(this.visualRoot),
    };
  }

  findIconNodeByItemId(itemId) {
    if (!itemId) return null;
    for (const node of this.iconNodes.values()) {
      if (node?.item?.id === itemId && !node.destroyed) return node;
    }
    return null;
  }

  getFolderHandoffDebugSnapshot(folderId = null) {
    const activeEntry = folderId ? this.getFolderHandoffEntry(folderId) : this.getFolderHandoffEntry();
    const activeSnapshot = this.makeFolderHandoffDebugSnapshot(activeEntry);
    if (activeSnapshot) {
      this.lastFolderHandoffDebugSnapshot = activeSnapshot;
      return activeSnapshot;
    }
    const node = this.findIconNodeByItemId(folderId);
    const actualSnapshot = this.makeFolderHandoffDebugSnapshot({
      folderId,
      layoutTarget: null,
      node,
      originalIndex: node ? this.getPageTrackChildIndex(node) : null,
    }, {
      active: false,
      source: "actual-node",
    });
    if (actualSnapshot) return actualSnapshot;
    if (!this.lastFolderHandoffDebugSnapshot) return null;
    return {
      ...this.lastFolderHandoffDebugSnapshot,
      active: false,
      stale: true,
    };
  }

  markInteractiveBoundsDirty() {
    this.boundsDirty = true;
    if (this.boundsFlushQueued) return;
    this.boundsFlushQueued = true;
    const flush = () => {
      this.boundsFlushQueued = false;
      this.flushInteractiveBounds();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      motionRuntime.afterFrame(flush);
      return;
    }
    if (typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(flush);
      return;
    }
    Promise.resolve().then(flush);
  }

  flushInteractiveBounds(options = {}) {
    if (!options.force && !this.boundsDirty) return;
    this.boundsDirty = false;
    this.refreshInteractiveBounds();
    this.singleStageFolderLayer?.refreshRegisteredIconBounds?.();
  }

  refreshInteractiveBounds() {
    const registration = this.boundsRegistration;
    if (!registration) return;
    for (const entry of registration.entries) {
      const { area, handoffLayoutTarget, index, item, node, pageIndex, sizing, targetX, x, y } = entry;
      if (!item?.id || !node || node.destroyed) continue;
      const meta = { area, id: item.id, index, item, pageIndex };
      const visualOffsetY = getIconVisualOffsetY(registration.isTextlessMode);
      const handoffEntry = item.type === "folder" ? this.getFolderHandoffEntry(item.id) : null;
      const boundsTargets = resolveDesktopBoundsTargets({
        handoffLayoutTarget,
        isFolderClosingHandoff: item.type === "folder" && (
          hasFolderClosingHandoffId(registration, item.id) ||
          Boolean(handoffEntry)
        ),
        item,
        node,
        registration,
        sizing,
        targetX,
        visualOffsetY,
        visualRoot: this.visualRoot,
        x,
        y,
      });
      if (boundsTargets.syncHandoffLayoutTarget && handoffEntry) {
        this.syncFolderHandoffNode(node, boundsTargets.syncHandoffLayoutTarget, handoffEntry);
      }
      registerRenderedClientLaunchIconBounds(
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.renderedClientIconBounds,
        meta
      );
      registerLiveClientLaunchIconTargetBounds(
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.liveClientTargetBounds,
        meta
      );
      registerStableStageLayoutLaunchIconTargetBounds(
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.stableStageLayoutTargetBounds,
        {
          ...meta,
          stageHeight: registration.height,
          stageRect: registration.stageRect,
          stageWidth: registration.width,
        }
      );
      if (area === "desktop") {
        registerLiveClientTopLevelIconTargetBounds(item.id, boundsTargets.liveClientTargetBounds, {
          ...meta,
        });
        registerStableStageLayoutTopLevelIconTargetBounds(item.id, boundsTargets.stableStageLayoutTargetBounds, {
          ...meta,
          stageHeight: registration.height,
          stageRect: registration.stageRect,
          stageWidth: registration.width,
        });
      }
      if (item.type === "folder") {
        registerRenderedClientTopLevelFolderThumbBounds(item.id, boundsTargets.renderedClientThumbBounds, meta);
        if (area === "desktop") {
          registerLiveClientTopLevelFolderThumbTargetBounds(item.id, boundsTargets.liveClientTargetBounds, {
            ...meta,
          });
          registerStableStageLayoutTopLevelFolderThumbTargetBounds(item.id, boundsTargets.stableStageLayoutTargetBounds, {
            ...meta,
            stageHeight: registration.height,
            stageRect: registration.stageRect,
            stageWidth: registration.width,
          });
        }
        this.registerFolderChildren(item, node, registration.stageRect, {
          liveThumbRect: boundsTargets.liveClientTargetBounds,
          stableStageLayoutThumbRect: boundsTargets.stableStageLayoutTargetBounds,
          stageHeight: registration.height,
          stageWidth: registration.width,
        });
        if (area === "desktop") this.debugFolderHandoffDesktopActual(item, node, registration);
      }
    }
  }

  debugFolderHandoffDesktopActual(folder, node, registration) {
    const options = getFolderHandoffDebugOptions();
    const debugState = globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__;
    if (!options?.log || debugState?.desktopLogged || debugState?.folderId !== folder?.id) return;
    const rows = [];
    const actualThumbRect = node.getFolderThumbBounds(registration.stageRect);
    const stableStageLayoutTargetRecord = getStableStageLayoutTopLevelFolderThumbTargetRecord(folder.id);
    const stableTargetRect = projectStageLayoutRecordToClient(stableStageLayoutTargetRecord);
    const targetThumbRect = getLiveClientTopLevelFolderThumbTargetBounds(folder.id) ||
      getRenderedClientTopLevelFolderThumbBounds(folder.id) ||
      stableTargetRect;
    rows.push({
      actual: roundRect(actualThumbRect, 2),
      delta: rectDelta(actualThumbRect, targetThumbRect),
      kind: "thumb",
      slot: "",
      target: roundRect(targetThumbRect, 2),
    });
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] || node.item.children?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(registration.stageRect, slotIndex);
      const stableChildTargetRect = projectStageLayoutRecordToClient(
        getStableStageLayoutFolderPreviewChildTargetRecord(folder.id, child.id, slotIndex)
      );
      const targetRect = getLiveClientFolderPreviewChildTargetBounds(folder.id, child.id, slotIndex) ||
        getRenderedClientFolderPreviewChildBounds(folder.id, child.id, slotIndex) ||
        stableChildTargetRect;
      rows.push({
        actual: roundRect(actualRect, 2),
        delta: rectDelta(actualRect, targetRect),
        kind: "child",
        slot: slotIndex,
        target: roundRect(targetRect, 2),
      });
    }
    debugState.desktopLogged = true;
    debugState.desktopRows = rows;
    console.log("[folder-handoff-debug] desktop-actual", {
      folderId: folder.id,
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      stageScaleX: registration.stageRect?.width && registration.width ? registration.stageRect.width / registration.width : null,
      stageScaleY: registration.stageRect?.height && registration.height ? registration.stageRect.height / registration.height : null,
    });
    console.table(rows.map((row) => ({
      actualHeight: row.actual?.height ?? null,
      actualLeft: row.actual?.left ?? null,
      actualTop: row.actual?.top ?? null,
      actualWidth: row.actual?.width ?? null,
      deltaHeight: row.delta?.height ?? null,
      deltaLeft: row.delta?.left ?? null,
      deltaTop: row.delta?.top ?? null,
      deltaWidth: row.delta?.width ?? null,
      kind: row.kind,
      slot: row.slot,
      targetHeight: row.target?.height ?? null,
      targetLeft: row.target?.left ?? null,
      targetTop: row.target?.top ?? null,
      targetWidth: row.target?.width ?? null,
    })));
    if (options.overlay) {
      const previousClear = globalThis.__LP_CLEAR_FOLDER_HANDOFF_DEBUG__;
      globalThis.__LP_CLEAR_FOLDER_HANDOFF_DEBUG__ = () => {
        previousClear?.();
        this.handoffDebugLayer.clear();
      };
      this.handoffDebugLayer.clear();
      drawDebugRect(this.handoffDebugLayer, actualThumbRect, registration.stageRect, 0xbf5af2, 0.98, options.lineWidth);
      for (const row of rows) {
        if (row.kind !== "child") continue;
        drawDebugRect(this.handoffDebugLayer, row.actual, registration.stageRect, 0xffffff, 0.9, options.lineWidth);
      }
    }
  }

  registerFolderChildren(folder, node, stageRect, target = null) {
    for (let index = 0; index < 9; index += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[index] || node.item.children?.[index] : null;
      if (!child?.id) continue;
      const childTargets = resolveFolderPreviewChildBoundsTargets({ node, slotIndex: index, stageRect, target });
      if (childTargets.renderedClientBounds) registerRenderedClientFolderPreviewChildBounds(folder.id, child.id, index, childTargets.renderedClientBounds);
      if (childTargets.liveClientTargetBounds) registerLiveClientFolderPreviewChildTargetBounds(folder.id, child.id, index, childTargets.liveClientTargetBounds);
      if (childTargets.stableStageLayoutTargetBounds) {
        registerStableStageLayoutFolderPreviewChildTargetBounds(folder.id, child.id, index, childTargets.stableStageLayoutTargetBounds, {
          stageHeight: target.stageHeight,
          stageRect,
          stageWidth: target.stageWidth,
        });
      }
    }
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  getFolderVisualDebugSnapshot() {
    const readDisplay = (node) => ({
      alpha: Math.round((node?.alpha ?? 0) * 1000) / 1000,
      eventMode: node?.eventMode ?? null,
      labelAlpha: node?.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
      labelVisible: node?.labelText?.visible ?? null,
      scaleX: Math.round((node?.scale?.x ?? 1) * 1000) / 1000,
      scaleY: Math.round((node?.scale?.y ?? 1) * 1000) / 1000,
      visible: node?.visible ?? null,
      visualWrapVisible: node?.visualWrap?.visible ?? null,
      x: Math.round((node?.x ?? 0) * 1000) / 1000,
      y: Math.round((node?.y ?? 0) * 1000) / 1000,
    });
    const folderNodes = [];
    for (const [key, node] of this.iconNodes || []) {
      if (node?.item?.type !== "folder") continue;
      folderNodes.push({
        display: readDisplay(node),
        id: node.item.id,
        key,
        sourceGhostedByOwnership: node.__folderSourceGhostedByOwnership === true,
        state: {
          draggable: node.state?.draggable ?? null,
          ghosted: node.state?.ghosted ?? null,
          interactive: node.state?.interactive ?? null,
          opening: node.state?.opening ?? null,
        },
      });
    }
    const overlay = this.singleStageFolderLayer;
    const lastState = normalizeDesktopHandoffState(this.lastFolderSourceGhostingState || {});
    const lastStateSourceIds = lastState.folderSourceGhostedIds;
    const ownershipSourceIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const overlaySourceIds = overlay?.getDesktopSourceGhostedIds?.() || new Set();
    const folderHandoffNodes = Array.from(this.getFolderHandoffNodes().values()).map((entry) => ({
      display: readDisplay(entry.node),
      folderId: entry.folderId || null,
      labelRevealStarted: entry.labelRevealStarted === true,
      visualHidden: entry.visualHidden === true,
      visualReleased: entry.visualReleased === true,
    }));
    return {
      detachedClosingVisuals: (overlay?.detachedClosingVisuals || []).map((visual) => ({
        clearing: visual.clearing === true,
        destroyed: visual.destroyed === true,
        folderId: visual.folderId || null,
        ownerToken: visual.ownerToken || null,
      })),
      folderHandoffNode: this.folderHandoffNode ? {
        display: readDisplay(this.folderHandoffNode.node),
        folderId: this.folderHandoffNode.folderId || null,
        labelRevealStarted: this.folderHandoffNode.labelRevealStarted === true,
        visualHidden: this.folderHandoffNode.visualHidden === true,
        visualReleased: this.folderHandoffNode.visualReleased === true,
      } : null,
      folderHandoffNodes,
      folderNodes,
      folderSourceGhostedIds: {
        lastState: Array.from(lastStateSourceIds),
        ownership: Array.from(ownershipSourceIds),
        overlay: Array.from(overlaySourceIds),
      },
      overlay: overlay ? {
        closingFolderId: overlay.closingGhostFolderId || null,
        closingGhostKeys: Array.from(overlay.closingGhostKeys || []),
        closingGhostSessionToken: overlay.closingGhostSessionToken || null,
        closingHandoffActive: overlay.closingHandoffActive === true,
        currentFolderId: overlay.currentFolderId || null,
        debug: overlay.getVisualDebugSnapshot?.() || null,
        openingGhostKeys: Array.from(overlay.openingGhostKeys || []),
        openingGhostSessionToken: overlay.openingGhostSessionToken || null,
        pageTrackVisible: overlay.pageTrack?.visible ?? null,
      } : null,
      ownership: this.visualOwnership?.snapshot?.() || [],
    };
  }

  destroy(options) {
    this.unsubscribeVisualOwnership?.();
    this.unsubscribeVisualOwnership = null;
    this.boundsRegistration = null;
    this.clearFolderHandoffNode();
    stopTargetSprings(this.visualRoot, { reason: "destroyed" });
    stopTargetSprings(this.visualRoot?.scale, { reason: "destroyed" });
    stopTargetSprings(this.desktopClosingUnderlayLayer, { reason: "destroyed" });
    stopTargetSprings(this.desktopClosingUnderlayLayer?.scale, { reason: "destroyed" });
    stopTargetSprings(this.singleStageFolderLayer, { reason: "destroyed" });
    stopTargetSprings(this.singleStageFolderLayer?.scale, { reason: "destroyed" });
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    stopTargetSprings(this.pageTrack, { reason: "destroyed" });
    this.visualCommitQueue?.clear?.();
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
