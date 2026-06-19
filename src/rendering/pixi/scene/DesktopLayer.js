import { Container, Graphics, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getDesktopGridMetrics, getGridSlotRect, makeRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getStageScale, makeStageLocalRect, makeStageVirtualElement, snapRectToDevicePixels } from "../geometry/stageCoordinates.js";
import {
  clearFolderPreviewChildBounds,
  clearLaunchIconBounds,
  getFolderPreviewChildBounds,
  getFolderPreviewChildLiveTargetBounds,
  getFolderPreviewChildTargetBounds,
  getTopLevelFolderThumbBounds,
  getTopLevelFolderThumbLiveTargetBounds,
  getTopLevelFolderThumbTargetBounds,
  registerFolderPreviewChildLiveTargetBounds,
  registerFolderPreviewChildBounds,
  registerFolderPreviewChildTargetBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
  registerTopLevelFolderThumbLiveTargetBounds,
  registerTopLevelFolderThumbBounds,
  registerTopLevelFolderThumbTargetBounds,
  registerTopLevelIconLiveTargetBounds,
  registerTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { quickDuration, quickEase } from "../animation/eases.js";
import { desktopVisualSpring, pageTrackSpring, springTo, stopTargetSprings } from "../animation/springMotion.js";
import {
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
} from "./dragVisibility.js";
import { makeDesktopBoundsRegistration } from "./desktopBoundsRegistration.js";
import { resolveDesktopBoundsTargets, resolveFolderPreviewChildBoundsTargets } from "./desktopBoundsTargets.js";
import { getDesktopIconSizing } from "./desktopIconSizing.js";
import { makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { FolderOverlayLayer } from "./FolderOverlayLayer.js";
import { SingleStageDiagnosticsLayer } from "./singleStageDiagnostics.js";
import { DragPreviewLayer } from "./DragPreviewLayer.js";
import { IconNode } from "../nodes/IconNode.js";

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

export function resolveDesktopVisualAlpha(state = {}) {
  return clamp01(state.desktopVisualAlpha ?? 1);
}

function getFolderHandoffDebugOptions() {
  const value = globalThis.__LP_DEBUG_FOLDER_HANDOFF__;
  if (!value) return null;
  if (value === true) return { lineWidth: 3, log: true, overlay: true };
  if (typeof value === "object") {
    return {
      lineWidth: Math.max(1, Number(value.lineWidth) || 3),
      log: value.log !== false,
      overlay: value.overlay !== false,
      timeline: value.timeline === true,
    };
  }
  return null;
}

function roundRect(rect) {
  if (!rect) return null;
  const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
  return {
    height: round(rect.height),
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
  };
}

function roundDebugObject(object) {
  if (!object || typeof object !== "object") return null;
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    result[key] = typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
  }
  return result;
}

function rectDelta(rect, target) {
  if (!rect || !target) return null;
  const round = (value) => Math.round((Number(value) || 0) * 1000) / 1000;
  return {
    height: round(rect.height - target.height),
    left: round(rect.left - target.left),
    top: round(rect.top - target.top),
    width: round(rect.width - target.width),
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
  const local = makeStageLocalRect(rect, stageRect);
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
  const targetStageRect = state.stableStageRect || state.stageRect;
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
  const stableStageRect = state.stableStageRect || state.stageRect;
  return snapRectToDevicePixels(makeTargetIconBounds(
    stableStageRect,
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

function springIconLayoutPosition(node, layoutTarget, refreshBounds) {
  springTo(node, "x", layoutTarget.x, pageTrackSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
  springTo(node, "y", layoutTarget.y, pageTrackSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
}

export class DesktopLayer extends Container {
  constructor(options = {}) {
    super();
    this.visualRoot = new Container();
    this.pageTrack = new Container();
    this.handoffDebugLayer = new Graphics();
    this.onIconAction = options.onIconAction || (() => {});
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => {});
    this.onFolderGeometryChange = options.onFolderGeometryChange || (() => {});
    this.onFolderInternalActivityChange = options.onFolderInternalActivityChange || (() => {});
    this.onFolderOutsidePointerDown = options.onFolderOutsidePointerDown || (() => {});
    this.onFolderTitleFrameChange = options.onFolderTitleFrameChange || (() => {});
    this.singleStageFolderLayer = new FolderOverlayLayer({
      onClosingFolderPointerDown: (folderId, event) => this.onClosingFolderPointerDown(folderId, event),
      onIconAction: (action, originalEvent, item, source, iconNode) =>
        this.handleIconAction(action, originalEvent, item, source, iconNode),
      onInternalActivityChange: (active, folderId = null) => this.onFolderInternalActivityChange(active, folderId),
      onOutsidePointerDown: (event) => this.onFolderOutsidePointerDown(event),
      showFolderTitle: false,
      onTitleFrameChange: (frame) => this.onFolderTitleFrameChange(frame),
    });
    this.singleStageDiagnosticsLayer = new SingleStageDiagnosticsLayer();
    this.singleStageDragPreviewLayer = new DragPreviewLayer();
    this.folderHandoffNode = null;
    this.hasDesktopVisualAlpha = false;
    this.hasDesktopVisualTransform = false;
    this.lastFolderHandoffDebugSnapshot = null;
    this.iconNodes = new Map();
    this.boundsRegistration = null;
    this.emptyText = new Text({
      text: "没有找到匹配的应用",
      style: { fill: 0xffffff, fontSize: 15, alpha: 0.74, fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.emptyText.anchor.set(0.5);
    this.visualRoot.addChild(this.pageTrack);
    this.visualRoot.addChild(this.emptyText);
    this.addChild(this.visualRoot);
    this.addChild(this.singleStageFolderLayer);
    this.addChild(this.singleStageDragPreviewLayer);
    this.addChild(this.singleStageDiagnosticsLayer);
    this.addChild(this.handoffDebugLayer);
  }

  update(state) {
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    this.applyDesktopVisualTransform(state);
    this.applyDesktopVisualAlpha(state);
    const pages = state.activePages || [];
    const activePageIndex = state.activePageIndex || 0;
    const desktopFrame = getDesktopFrame(state);
    const pageWidth = desktopFrame.width;
    const targetX = -activePageIndex * pageWidth;
    const shouldSnap = state.shouldSnapTrack;
    const refreshBounds = () => this.refreshInteractiveBounds();

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
        const isFolderClosingHandoff = item?.type === "folder" && state.folderClosingHandoffId === item.id;
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
            gsap.to(node, { alpha: 1, duration: quickDuration, ease: quickEase });
            springIconLayoutPosition(node, layoutTarget, refreshBounds);
          }
        } else if (!isFolderClosingHandoff) {
          springIconLayoutPosition(node, layoutTarget, refreshBounds);
        }

        node.stageRect = state.stageRect;
        const isFolderSourceGhosted = item.type === "folder" && !isFolderClosingHandoff && (
          state.folderSourceGhostedId === item.id ||
          state.isFolderOpeningPreviewFrameGhosted?.(item.id)
        );
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
          suppressLabelRevealAfterGhost: isReleaseGhostItem || isFolderSourceGhosted || isFolderClosingHandoff,
          textless: state.isTextlessMode,
        });
        if (isFolderClosingHandoff) this.ensureFolderHandoffNode(item.id, node, layoutTarget);

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
      gsap.killTweensOf(node);
      stopTargetSprings(node);
      gsap.to(node, {
        alpha: 0,
        duration: quickDuration,
        ease: quickEase,
        onComplete: () => node.destroy({ children: true }),
      });
    }

    this.boundsRegistration = makeDesktopBoundsRegistration(state, boundsEntries, desktopFrame);
    springTo(this.pageTrack, "x", targetX, pageTrackSpring, {
      snap: shouldSnap,
      onComplete: refreshBounds,
      onUpdate: refreshBounds,
    });
    refreshBounds();
    this.updateSingleStageFolderLayer(state);
    this.updateSingleStageDragPreviewLayer(state);
    this.singleStageDiagnosticsLayer.update(state.singleStageFolderState, {
      enabled: state.singleStageDiagnosticsEnabled,
    });
    if (!state.folderClosingHandoffId && this.folderHandoffNode) {
      this.finishFolderHandoffNodeAfterFrame();
    }
  }

  applyDesktopVisualTransform(state) {
    const transform = state.desktopVisualTransform || {};
    const scale = Math.max(0.01, readNumber(transform.scale, 1));
    const offsetY = readNumber(transform.y, 0);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + offsetY;
    this.visualRoot.pivot.set(centerX, centerY);
    if (!this.hasDesktopVisualTransform) {
      this.visualRoot.position.set(centerX, targetY);
      this.visualRoot.scale.set(scale);
      this.hasDesktopVisualTransform = true;
      return;
    }
    const refreshBounds = () => this.refreshInteractiveBounds();
    springTo(this.visualRoot, "x", centerX, desktopVisualSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
    springTo(this.visualRoot, "y", targetY, desktopVisualSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
    springTo(this.visualRoot.scale, "x", scale, desktopVisualSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
    springTo(this.visualRoot.scale, "y", scale, desktopVisualSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
  }

  applyDesktopVisualAlpha(state) {
    const alpha = resolveDesktopVisualAlpha(state);
    this.visualRoot.visible = true;
    this.visualRoot.interactiveChildren = alpha > 0.001;
    if (!this.hasDesktopVisualAlpha) {
      this.visualRoot.alpha = alpha;
      this.hasDesktopVisualAlpha = true;
      return;
    }
    springTo(this.visualRoot, "alpha", alpha, desktopVisualSpring);
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

  ensureFolderHandoffNode(folderId, node, layoutTarget) {
    if (!folderId || !node || node.destroyed) return;
    if (this.folderHandoffNode?.folderId && this.folderHandoffNode.folderId !== folderId) {
      this.clearFolderHandoffNode();
    }
    if (!this.folderHandoffNode) {
      this.folderHandoffNode = {
        cleanupFrame: null,
        folderId,
        node,
        originalIndex: this.getPageTrackChildIndex(node),
      };
    } else if (this.folderHandoffNode.node !== node) {
      this.restoreFolderHandoffNode(this.folderHandoffNode);
      this.folderHandoffNode.node = node;
      this.folderHandoffNode.originalIndex = this.getPageTrackChildIndex(node);
    }
    if (this.folderHandoffNode.cleanupFrame != null) {
      globalThis.cancelAnimationFrame?.(this.folderHandoffNode.cleanupFrame);
      this.folderHandoffNode.cleanupFrame = null;
    }
    this.syncFolderHandoffNode(node, layoutTarget);
  }

  syncFolderHandoffNode(node = this.folderHandoffNode?.node, layoutTarget = null) {
    const entry = this.folderHandoffNode;
    if (!entry || !node || node.destroyed) return;
    const target = layoutTarget || entry.layoutTarget;
    if (!target) return;
    entry.node = node;
    entry.layoutTarget = target;
    gsap.killTweensOf(node);
    gsap.killTweensOf(node.scale);
    gsap.killTweensOf(node.labelText);
    node.position.set(target.x, target.y);
    node.scale.set(target.scaleX || 1, target.scaleY || target.scaleX || 1);
    node.alpha = 1;
    node.visible = true;
    node.eventMode = "none";
    node.cursor = "default";
    node.resetFolderPreviewAfterGhost?.();
    if (node.labelText) {
      node.labelText.alpha = 1;
      node.labelText.visible = false;
    }
    if (node.parent === this.pageTrack && this.pageTrack.children.length > 1) {
      this.pageTrack.setChildIndex(node, this.pageTrack.children.length - 1);
    }
  }

  finishFolderHandoffNodeAfterFrame() {
    const entry = this.folderHandoffNode;
    if (!entry || entry.cleanupFrame != null) return;
    const finish = () => {
      if (this.folderHandoffNode !== entry) return;
      entry.cleanupFrame = null;
      this.clearFolderHandoffNode();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      entry.cleanupFrame = globalThis.requestAnimationFrame(finish);
    } else {
      finish();
    }
  }

  clearFolderHandoffNode() {
    const entry = this.folderHandoffNode;
    if (entry) {
      this.lastFolderHandoffDebugSnapshot = this.makeFolderHandoffDebugSnapshot(entry, {
        active: false,
        clearing: true,
      }) || this.lastFolderHandoffDebugSnapshot;
    }
    this.folderHandoffNode = null;
    if (!entry) return;
    if (entry.cleanupFrame != null) globalThis.cancelAnimationFrame?.(entry.cleanupFrame);
    this.restoreFolderHandoffNode(entry);
  }

  restoreFolderHandoffNode(entry) {
    const node = entry?.node;
    if (!node || node.destroyed || node.parent !== this.pageTrack) return;
    const childCount = this.pageTrack.children.length;
    if (!childCount) return;
    const targetIndex = Math.max(0, Math.min(entry.originalIndex ?? childCount - 1, childCount - 1));
    if (this.getPageTrackChildIndex(node) !== targetIndex) this.pageTrack.setChildIndex(node, targetIndex);
  }

  getPageTrackChildIndex(node) {
    return this.pageTrack.children.indexOf(node);
  }

  makeFolderHandoffDebugSnapshot(entry, options = {}) {
    const node = entry?.node;
    if (!entry || !node || node.destroyed) return null;
    const registration = this.boundsRegistration || {};
    const stageRect = registration.stageRect || this.stageRect;
    const stableStageRect = registration.stableStageRect || stageRect;
    const folderId = entry.folderId || node.item?.id || null;
    const thumbRect = node.getFolderThumbBounds?.(stageRect) || null;
    const iconRect = node.getIconBounds?.(stageRect) || null;
    const liveTargetRect = folderId ? getTopLevelFolderThumbLiveTargetBounds(folderId) : null;
    const stableTargetRect = folderId ? getTopLevelFolderThumbTargetBounds(folderId) : null;
    const registeredThumbRect = folderId ? getTopLevelFolderThumbBounds(folderId) : null;
    const targetRect = liveTargetRect || registeredThumbRect || stableTargetRect;
    const childRows = [];
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] || node.item.children?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(stageRect, slotIndex);
      const targetChildRect = targetRect ? makeFolderThumbPreviewRect(targetRect, slotIndex) : null;
      childRows.push({
        actual: roundRect(actualRect),
        delta: rectDelta(actualRect, targetChildRect),
        slot: slotIndex,
        target: roundRect(targetChildRect),
      });
    }
    return {
      active: options.active !== false,
      childMaxDelta: maxAbsRectDelta(childRows),
      childRows,
      childWorstDelta: worstRectDelta(childRows),
      childIndex: this.getPageTrackChildIndex(node),
      clearing: options.clearing === true,
      folderId,
      iconRect: roundRect(iconRect),
      layoutTarget: roundDebugObject(entry.layoutTarget),
      liveTargetRect: roundRect(liveTargetRect),
      node: {
        alpha: Math.round((node.alpha ?? 0) * 1000) / 1000,
        eventMode: node.eventMode,
        labelAlpha: node.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
        labelVisible: node.labelText ? node.labelText.visible : null,
        parentIsPageTrack: node.parent === this.pageTrack,
        scaleX: Math.round((node.scale?.x ?? 1) * 1000) / 1000,
        scaleY: Math.round((node.scale?.y ?? 1) * 1000) / 1000,
        visible: node.visible,
        x: Math.round((node.x || 0) * 1000) / 1000,
        y: Math.round((node.y || 0) * 1000) / 1000,
      },
      originalIndex: entry.originalIndex ?? null,
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      registeredThumbRect: roundRect(registeredThumbRect),
      source: options.source || "handoff-node",
      stableStageRect: roundRect(stableStageRect),
      stableTargetRect: roundRect(stableTargetRect),
      stageRect: roundRect(stageRect),
      stageScaleX: registration.stageRect?.width && registration.width ? Math.round((registration.stageRect.width / registration.width) * 1000000) / 1000000 : null,
      stageScaleY: registration.stageRect?.height && registration.height ? Math.round((registration.stageRect.height / registration.height) * 1000000) / 1000000 : null,
      stageVisualOffsetX: Math.round((registration.stageVisualOffsetX || 0) * 1000) / 1000,
      stageVisualOffsetY: Math.round((registration.stageVisualOffsetY || 0) * 1000) / 1000,
      targetDelta: rectDelta(thumbRect, targetRect),
      targetRect: roundRect(targetRect),
      thumbRect: roundRect(thumbRect),
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
    const activeSnapshot = this.makeFolderHandoffDebugSnapshot(this.folderHandoffNode);
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

  refreshInteractiveBounds() {
    const registration = this.boundsRegistration;
    if (!registration) return;
    for (const entry of registration.entries) {
      const { area, handoffLayoutTarget, index, item, node, pageIndex, sizing, targetX, x, y } = entry;
      if (!item?.id || !node || node.destroyed) continue;
      const meta = { area, id: item.id, index, item, pageIndex };
      const visualOffsetY = getIconVisualOffsetY(registration.isTextlessMode);
      const boundsTargets = resolveDesktopBoundsTargets({
        handoffLayoutTarget,
        isFolderClosingHandoff: registration.folderClosingHandoffId === item.id && this.folderHandoffNode?.folderId === item.id,
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
      if (boundsTargets.syncHandoffLayoutTarget) this.syncFolderHandoffNode(node, boundsTargets.syncHandoffLayoutTarget);
      registerLaunchIconBounds(
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.iconBounds,
        meta
      );
      registerLaunchIconTargetBounds(
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.liveTargetBounds,
        meta
      );
      if (area === "desktop") {
        registerTopLevelIconLiveTargetBounds(item.id, boundsTargets.liveTargetBounds, {
          ...meta,
          stageVisualOffsetX: registration.stageVisualOffsetX,
          stageVisualOffsetY: registration.stageVisualOffsetY,
        });
        registerTopLevelIconTargetBounds(item.id, boundsTargets.stableTargetBounds, meta);
      }
      if (item.type === "folder") {
        registerTopLevelFolderThumbBounds(item.id, boundsTargets.folderThumbBounds, meta);
        if (area === "desktop") {
          registerTopLevelFolderThumbLiveTargetBounds(item.id, boundsTargets.liveTargetBounds, {
            ...meta,
            stageVisualOffsetX: registration.stageVisualOffsetX,
            stageVisualOffsetY: registration.stageVisualOffsetY,
          });
          registerTopLevelFolderThumbTargetBounds(item.id, boundsTargets.stableTargetBounds, meta);
        }
        this.registerFolderChildren(item, node, registration.stageRect, {
          liveThumbRect: boundsTargets.liveTargetBounds,
          stableThumbRect: boundsTargets.stableTargetBounds,
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
    const targetThumbRect = getTopLevelFolderThumbLiveTargetBounds(folder.id) ||
      getTopLevelFolderThumbBounds(folder.id) ||
      getTopLevelFolderThumbTargetBounds(folder.id);
    rows.push({
      actual: roundRect(actualThumbRect),
      delta: rectDelta(actualThumbRect, targetThumbRect),
      kind: "thumb",
      slot: "",
      target: roundRect(targetThumbRect),
    });
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] || node.item.children?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(registration.stageRect, slotIndex);
      const targetRect = getFolderPreviewChildLiveTargetBounds(folder.id, child.id, slotIndex) ||
        getFolderPreviewChildBounds(folder.id, child.id, slotIndex) ||
        getFolderPreviewChildTargetBounds(folder.id, child.id, slotIndex);
      rows.push({
        actual: roundRect(actualRect),
        delta: rectDelta(actualRect, targetRect),
        kind: "child",
        slot: slotIndex,
        target: roundRect(targetRect),
      });
    }
    debugState.desktopLogged = true;
    debugState.desktopRows = rows;
    console.log("[folder-handoff-debug] desktop-actual", {
      folderId: folder.id,
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      stageScaleX: registration.stageRect?.width && registration.width ? registration.stageRect.width / registration.width : null,
      stageScaleY: registration.stageRect?.height && registration.height ? registration.stageRect.height / registration.height : null,
      stageVisualOffsetX: Math.round((registration.stageVisualOffsetX || 0) * 1000) / 1000,
      stageVisualOffsetY: Math.round((registration.stageVisualOffsetY || 0) * 1000) / 1000,
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
      if (childTargets.bounds) registerFolderPreviewChildBounds(folder.id, child.id, index, childTargets.bounds);
      if (childTargets.liveTargetBounds) registerFolderPreviewChildLiveTargetBounds(folder.id, child.id, index, childTargets.liveTargetBounds);
      if (childTargets.stableTargetBounds) registerFolderPreviewChildTargetBounds(folder.id, child.id, index, childTargets.stableTargetBounds);
    }
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  destroy(options) {
    this.boundsRegistration = null;
    this.clearFolderHandoffNode();
    stopTargetSprings(this.visualRoot);
    stopTargetSprings(this.visualRoot?.scale);
    stopTargetSprings(this.pageTrack);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
