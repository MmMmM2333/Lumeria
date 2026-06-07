import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import {
  folderCloseDuration,
  folderCloseEase,
  folderCloseFrameEase,
  folderOpenDuration,
  folderOpenEase,
  folderOpenGhostDuration,
  folderOpenGhostEase,
  folderPanelCloseDuration,
  layoutDuration,
  layoutEase,
} from "../animation/eases.js";
import { pageTrackSpring, panelSpring, springTo, stopTargetSprings } from "../animation/springMotion.js";
import { getFolderGridMetrics, getFolderPanelGeometry, getGridSlotRect, parseRepeatCount, readPx } from "../geometry/gridGeometry.js";
import {
  getIconLabelTopFromVisualRect,
  getIconNodeOffsetFromVisualCenter,
  getIconVisualOffsetY,
} from "../geometry/iconMetrics.js";
import { makeStageVirtualElement, mapLocalRectToStageRect } from "../geometry/stageCoordinates.js";
import {
  clearLaunchIconBounds,
  getFolderPreviewChildBounds,
  getTopLevelFolderThumbBounds,
  getTopLevelIconBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import {
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
} from "./dragVisibility.js";
import { getFolderPageMaskRect, resolveOpeningInterruptionFrame } from "./folderOverlayGeometry.js";
import { IconNode } from "../nodes/IconNode.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const CLOSING_FRAME_PADDING = 48;
const CLOSING_FRAME_TAIL_DURATION = 0.04;
const CLOSING_GHOST_MAX_DELAY = 0.06;
const CLOSING_EXTRA_GHOST_ALPHA_DURATION = 0.12;
const CLOSING_EXTRA_GHOST_ALPHA_HOLD = 0.16;
const CLOSING_PREVIEW_SWAP_PROGRESS = 0.92;
const CLOSING_PREVIEW_SWAP_DURATION = 0.18;
const CLOSING_PREVIEW_SWAP_START_SCALE = 1.02;
const CLOSING_PREVIEW_ICON_DURATION = 0.22;
const CLOSING_PREVIEW_ICON_ROW_STAGGER = 0.01;
const CLOSING_PREVIEW_ICON_COLUMN_STAGGER = 0.008;
const CLOSING_PREVIEW_ICON_START_SCALE = 1.08;

function makeSyntheticPointerEvent(original, node) {
  const native = original?.nativeEvent || original || {};
  const bounds = node.getIconBounds(node.stageRect || { left: 0, top: 0 });
  return {
    button: native.button ?? 0,
    buttons: native.buttons ?? 1,
    clientX: native.clientX ?? 0,
    clientY: native.clientY ?? 0,
    currentTarget: {
      getBoundingClientRect: () => bounds,
      querySelector: () => null,
    },
    pointerId: native.pointerId,
    preventDefault: () => native.preventDefault?.(),
    stopPropagation: () => native.stopPropagation?.(),
    target: native.target,
    type: native.type || "pointerdown",
  };
}

function makeLocalRect(rect, stageRect) {
  if (!rect) return null;
  return {
    left: rect.left - stageRect.left,
    top: rect.top - stageRect.top,
    width: rect.width,
    height: rect.height,
  };
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

function isPointInRect(x, y, rect) {
  return Boolean(rect) &&
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

function makePreviewChildKey(childId, slotIndex) {
  return `${childId}:${slotIndex}`;
}

function makeClosingPreviewSwapKey(folderId, pageIndex) {
  return `closing-preview-swap:${folderId || "folder"}:${pageIndex}`;
}

function makeIconRect(centerX, centerY, size) {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

function makeTargetIconBounds(stageRect, stageWidth, stageHeight, centerX, centerY, size) {
  return mapLocalRectToStageRect(stageRect, stageWidth, stageHeight, makeIconRect(centerX, centerY, size));
}

function makeFolderCenterCollapseRect(folderRect) {
  if (!folderRect) return null;
  const size = Math.max(4, Math.min(folderRect.width, folderRect.height) * 0.18);
  return makeIconRect(folderRect.left + folderRect.width / 2, folderRect.top + folderRect.height / 2, size);
}

function makeProjectedPreviewRect(folderRect, slotIndex, columnCount = 3, rowCount = 3) {
  if (!folderRect) return null;
  const safeIndex = Math.max(0, Number(slotIndex) || 0);
  const columns = Math.max(1, Math.floor(Number(columnCount) || 3));
  const rows = Math.max(1, Math.floor(Number(rowCount) || 3));
  const col = Math.min(columns - 1, safeIndex % columns);
  const row = Math.min(rows - 1, Math.floor(safeIndex / columns));
  const cellWidth = folderRect.width / columns;
  const cellHeight = folderRect.height / rows;
  const size = Math.max(3, Math.min(cellWidth, cellHeight) * 0.62);
  const centerX = folderRect.left + cellWidth * col + cellWidth / 2;
  const centerY = folderRect.top + cellHeight * row + cellHeight / 2;
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

function getFrameRadius(rect, fallback = 18) {
  if (!rect) return fallback;
  return Math.max(14, Math.min(48, Math.min(rect.width, rect.height) * 0.26));
}

function getGridGhostDelay(index, columnCount, maxDelay = 0.18) {
  const safeIndex = Math.max(0, Number(index) || 0);
  const columns = Math.max(1, Number(columnCount) || 1);
  const row = Math.floor(safeIndex / columns);
  const col = safeIndex % columns;
  return Math.min(maxDelay, row * 0.022 + col * 0.01);
}

function getMaxGridGhostDelay(targets, maxDelay) {
  return (targets || []).reduce((delay, target) =>
    Math.max(delay, getGridGhostDelay(target.index, target.columnCount, maxDelay)), 0);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function lerpColor(from, to, progress) {
  const t = clamp01(progress);
  const fromColor = Math.max(0, Math.min(0xffffff, Math.round(Number(from) || 0)));
  const toColor = Math.max(0, Math.min(0xffffff, Math.round(Number(to) || 0)));
  const fromR = (fromColor >> 16) & 0xff;
  const fromG = (fromColor >> 8) & 0xff;
  const fromB = fromColor & 0xff;
  const toR = (toColor >> 16) & 0xff;
  const toG = (toColor >> 8) & 0xff;
  const toB = toColor & 0xff;
  return (
    (Math.round(lerp(fromR, toR, t)) << 16) |
    (Math.round(lerp(fromG, toG, t)) << 8) |
    Math.round(lerp(fromB, toB, t))
  );
}

function expandBounds(bounds, rect) {
  if (!rect) return bounds;
  const left = Math.min(bounds?.left ?? Infinity, rect.left);
  const top = Math.min(bounds?.top ?? Infinity, rect.top);
  const right = Math.max(bounds?.right ?? -Infinity, rect.left + rect.width);
  const bottom = Math.max(bounds?.bottom ?? -Infinity, rect.top + rect.height);
  return { bottom, left, right, top };
}

function makeBoundsRect(bounds, padding = 0) {
  if (!bounds || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.right) || !Number.isFinite(bounds.bottom)) return null;
  return {
    height: bounds.bottom - bounds.top + padding * 2,
    left: bounds.left - padding,
    top: bounds.top - padding,
    width: bounds.right - bounds.left + padding * 2,
  };
}

function cloneFrameSnapshot(frame) {
  if (!frame) return null;
  return {
    fillAlpha: frame.fillAlpha,
    fillColor: frame.fillColor,
    height: frame.height,
    left: frame.left,
    radius: frame.radius,
    strokeAlpha: frame.strokeAlpha,
    strokeColor: frame.strokeColor,
    strokeWidth: frame.strokeWidth,
    top: frame.top,
    width: frame.width,
  };
}

function makeFrameSnapshotFromBounds(bounds, padding, styleFrame) {
  if (!bounds) return null;
  const rect = {
    height: bounds.bottom - bounds.top + padding * 2,
    left: bounds.left - padding,
    top: bounds.top - padding,
    width: bounds.right - bounds.left + padding * 2,
  };
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    ...rect,
    fillAlpha: styleFrame?.fillAlpha,
    fillColor: styleFrame?.fillColor,
    radius: getFrameRadius(rect, styleFrame?.radius ?? 48),
    strokeAlpha: styleFrame?.strokeAlpha,
    strokeColor: styleFrame?.strokeColor,
    strokeWidth: styleFrame?.strokeWidth,
  };
}

function makeOpeningInterruptionFrame(targets, stageRect, styleFrame) {
  let bounds = null;
  for (const target of targets || []) {
    const iconRect = makeLocalRect(target.sourceRect, stageRect);
    if (!iconRect) continue;
    bounds = expandBounds(bounds, iconRect);
    if (target.sourceLabelAlpha == null || target.sourceLabelAlpha <= 0) continue;
    const scale = target.sourceScale ?? 1;
    const labelWidth = Math.max(72, Math.min(160, target.cellWidth || 120)) * scale;
    const labelTop = getIconLabelTopFromVisualRect(iconRect, scale);
    bounds = expandBounds(bounds, {
      height: 24 * scale,
      left: iconRect.left + iconRect.width / 2 - labelWidth / 2,
      top: labelTop,
      width: labelWidth,
    });
  }
  return makeFrameSnapshotFromBounds(bounds, CLOSING_FRAME_PADDING, styleFrame);
}

function findControllerGhostKey(ghosts, itemId, slotIndex) {
  const items = Array.isArray(ghosts) ? ghosts : [];
  const matchingSlot = items.find((ghost) => ghost.item?.id === itemId && ghost.slotIndex === slotIndex);
  return matchingSlot?.key || items.find((ghost) => ghost.item?.id === itemId)?.key || null;
}

function killTweensDeep(node) {
  if (!node) return;
  gsap.killTweensOf(node);
  if (node.scale) gsap.killTweensOf(node.scale);
  for (const child of node.children || []) killTweensDeep(child);
}

function ensureClosingPreviewSwapState(layer) {
  if (!layer.closingPreviewSwapKeys) layer.closingPreviewSwapKeys = new Set();
  if (layer.closingPreviewSwapLayer && !layer.closingPreviewSwapLayer.destroyed) {
    return layer.closingPreviewSwapLayer;
  }
  layer.closingPreviewSwapLayer = new Container();
  const closingIndex = layer.children?.indexOf?.(layer.closingGhostLayer);
  if (closingIndex >= 0) layer.addChildAt(layer.closingPreviewSwapLayer, closingIndex + 1);
  else layer.addChild(layer.closingPreviewSwapLayer);
  return layer.closingPreviewSwapLayer;
}

function clearClosingPreviewSwapLayer(layer) {
  layer.closingPreviewSwapKeys?.clear();
  const swapLayer = layer.closingPreviewSwapLayer;
  if (!swapLayer || swapLayer.destroyed) return;
  const ghosts = swapLayer.removeChildren();
  for (const ghost of ghosts) {
    killTweensDeep(ghost);
    ghost.destroy?.({ children: true });
  }
}

function ensureClosingFrameMaskState(layer) {
  if (layer.closingFrameMask && !layer.closingFrameMask.destroyed) return layer.closingFrameMask;
  layer.closingFrameMask = new Graphics();
  const frameIndex = layer.children?.indexOf?.(layer.frameGhost);
  if (frameIndex >= 0) layer.addChildAt(layer.closingFrameMask, frameIndex + 1);
  else layer.addChild(layer.closingFrameMask);
  return layer.closingFrameMask;
}

function clearClosingFrameMask(layer) {
  const mask = layer.closingFrameMask;
  if (layer.closingGhostLayer?.mask === mask) layer.closingGhostLayer.mask = null;
  if (layer.closingPreviewSwapLayer?.mask === mask) layer.closingPreviewSwapLayer.mask = null;
  mask?.clear?.();
}

export class FolderOverlayLayer extends Container {
  constructor(options = {}) {
    super();
    this.panel = new Container();
    this.panelMaterial = new Graphics();
    this.frameGhost = new Graphics();
    this.frameGhost.visible = false;
    this.closingFrameMask = new Graphics();
    this.pageMask = new Graphics();
    this.pageMaskRect = null;
    this.pageTrack = new Container();
    this.openingGhostLayer = new Container();
    this.closingGhostLayer = new Container();
    this.closingPreviewSwapLayer = new Container();
    this.folderTitle = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 18, fontWeight: "620", fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.iconNodes = new Map();
    this.openingGhostRevealTimer = null;
    this.closingGhostRevealTimer = null;
    this.closingFrameComplete = false;
    this.closingPreviewSwapKeys = new Set();
    this.completedClosingControllerGhostKeys = [];
    this.completedClosingPreviewGhosts = [];
    this.onIconAction = options.onIconAction || (() => { });
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => { });
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => { });
    this.onTitleFrameChange = options.onTitleFrameChange || (() => { });
    this.titleFrameKey = null;
    this.panelTitleOpening = false;
    this.panelTitleStartScaleX = 1;
    this.panelTitleStartScaleY = 1;
    this.addChild(this.frameGhost);
    this.addChild(this.closingFrameMask);
    this.addChild(this.panel);
    this.panel.addChild(this.panelMaterial);
    this.panel.addChild(this.pageMask);
    this.panel.addChild(this.pageTrack);
    this.panel.addChild(this.folderTitle);
    this.addChild(this.openingGhostLayer);
    this.addChild(this.closingGhostLayer);
    this.addChild(this.closingPreviewSwapLayer);
    this.pageTrack.mask = this.pageMask;
    this.eventMode = "static";
    this.on("pointerdown", (event) => this.handlePointerDown(event));
  }

  update(state) {
    this.stageRect = state.stageRect;
    clearLaunchIconBounds("folder");
    this.visible = Boolean(state.renderedFolder);
    if (!this.visible) {
      this.currentFolderId = null;
      this.isClosing = false;
      this.isUserFolderClosing = false;
      this.sizeKey = null;
      stopTargetSprings(this.pageTrack);
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      this.clearOpeningGhosts();
      this.clearClosingGhosts();
      this.stableFolderCloseTarget = null;
      if (state.folderPanelRef) state.folderPanelRef.value = null;
      if (state.folderViewportRef) state.folderViewportRef.value = null;
      this.notifyTitleFrame(null);
      return null;
    }
    ensureClosingPreviewSwapState(this);
    ensureClosingFrameMaskState(this);
    this.hitArea = new Rectangle(0, 0, state.width, state.height);
    const sizeKey = `${state.width}x${state.height}`;
    if (this.sizeKey && this.sizeKey !== sizeKey) {
      this.clearOpeningGhosts();
      this.clearClosingGhosts();
    }
    this.sizeKey = sizeKey;

    const geometry = getFolderPanelGeometry({
      height: state.height,
      panelStyle: state.folderPanelStyle,
      width: state.width,
    });
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    const wasClosing = Boolean(this.isClosing);
    if (wasClosing && !isClosing && this.currentFolderId === state.renderedFolder?.id) this.currentFolderId = null;
    const isNewFolder = this.currentFolderId !== state.renderedFolder?.id;
    this.isClosing = isClosing;
    this.isUserFolderClosing = Boolean(state.isFolderClosing);
    this.panelGeometry = geometry.panel;
    this.drawPanel(geometry.panel);
    this.panel.pivot.set(geometry.panel.width / 2, geometry.panel.height / 2);
    const targetX = geometry.panel.left + geometry.panel.width / 2;
    const targetY = geometry.panel.top + geometry.panel.height / 2;
    this.animatePanel(state, targetX, targetY, geometry.panel);

    this.folderTitle.text = state.renderedFolder.name || "新文件夹";
    this.folderTitle.visible = false;
    this.folderTitle.anchor.set(0.5);
    this.folderTitle.position.set(geometry.panel.width / 2, -34);

    const cols = parseRepeatCount(state.folderGridStyle?.gridTemplateColumns, 5);
    const rows = parseRepeatCount(state.folderGridStyle?.gridTemplateRows, Math.max(1, Math.ceil((state.folderPages?.[state.folderPageIndex] || []).length / cols)));
    const rowGap = readPx(state.folderPanelStyle?.["--folder-row-gap"], 18);
    const fixedCellHeight = readPx(state.folderPanelStyle?.["--folder-icon-cell-height"], 0);
    const iconSize = Math.min(readPx(state.folderPanelStyle?.["--folder-icon-size"], state.iconSize), 56);
    const metrics = getFolderGridMetrics({ cols, fixedCellHeight, grid: geometry.grid, rowGap, rows });
    const localGridLeft = geometry.grid.left - geometry.panel.left;
    const localGridTop = geometry.grid.top - geometry.panel.top;
    const localMetrics = { ...metrics, gridLeft: localGridLeft, gridTop: localGridTop };
    this.pageMaskRect = getFolderPageMaskRect(geometry, localGridLeft, localGridTop);
    this.drawPageMask(this.pageMask, this.pageMaskRect);
    this.refreshPageTrackMask();
    const targetTrackX = -state.folderPageIndex * geometry.grid.width;
    if (isNewFolder && !isClosing) {
      stopTargetSprings(this.pageTrack);
      this.pageTrack.x = targetTrackX;
    } else {
      springTo(this.pageTrack, "x", targetTrackX, pageTrackSpring);
    }
    const folderRect = getTopLevelIconBounds(state.renderedFolder.id);
    const folderThumbRect = getTopLevelFolderThumbBounds(state.renderedFolder.id) || folderRect;
    const previewSlots = getFolderPreviewSlots(state.renderedFolder, state.folderPageSize);
    if (!isClosing && state.renderedFolder?.id && folderRect && (!this.stableFolderCloseTarget ||
      this.stableFolderCloseTarget.folderId !== state.renderedFolder.id)) {
      const previewChildRects = new Map();
      previewSlots.forEach((item, previewSlotIndex) => {
        if (!item?.id) return;
        const childRect = getFolderPreviewChildBounds(state.renderedFolder.id, item.id, previewSlotIndex);
        if (childRect) previewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), cloneRect(childRect));
      });
      this.stableFolderCloseTarget = {
        folderId: state.renderedFolder.id,
        iconRect: cloneRect(folderRect),
        previewChildRects,
        thumbRect: cloneRect(folderThumbRect),
      };
    }
    const closeIconRect = isClosing && this.stableFolderCloseTarget?.folderId === state.renderedFolder.id
      ? this.stableFolderCloseTarget.iconRect || folderRect
      : folderRect;
    const closeThumbRect = isClosing && this.stableFolderCloseTarget?.folderId === state.renderedFolder.id
      ? this.stableFolderCloseTarget.thumbRect || closeIconRect
      : folderThumbRect;

    this.bindFakeRefs(state, geometry);
    const seen = new Set();
    const openingGhostTargets = [];
    const closingGhostTargets = [];
    const previewSlotById = new Map(
      previewSlots
        .map((item, previewSlotIndex) => (item?.id ? [item.id, previewSlotIndex] : null))
        .filter(Boolean)
    );
    (state.folderPages || []).forEach((page, pageIndex) => {
      const visibleItems = state.getVisibleFolderPage(page);
      const renderMode = state.getFolderPageRenderMode?.(pageIndex) || "interactive";
      const isInteractivePage = renderMode === "interactive";
      if (renderMode === "empty") return;
      visibleItems.forEach((item, index) => {
        const slot = getGridSlotRect(localMetrics, index);
        const x = pageIndex * geometry.grid.width + slot.left + slot.width / 2;
        const y = slot.top + slot.height / 2;
        const source = { type: "folder", folderId: state.renderedFolder.id, index, pageIndex, slotIndex: index };
        const key = `${state.renderedFolder.id}:${pageIndex}:${item.id}`;
        const isActiveDraggedItem = isActiveDraggedLaunchItem(item, state);
        const isReleaseGhostItem = isReleaseGhostLaunchItem(item, state);
        seen.add(key);
        let node = this.iconNodes.get(key);
        if (!node) {
          node = new IconNode({
            onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
              this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
          });
          node.alpha = 0;
          node.position.set(x, y + 10);
          this.iconNodes.set(key, node);
          this.pageTrack.addChild(node);
          gsap.to(node, { alpha: 1, y, delay: Math.min(0.18, index * 0.012), duration: 0.24, ease: folderOpenEase });
        } else {
          gsap.to(node, { duration: layoutDuration, ease: layoutEase, overwrite: "auto", x, y });
        }

        node.stageRect = state.stageRect;
        node.setState({
          cellHeight: slot.height,
          cellWidth: slot.width,
          compact: false,
          dragging: isActiveDraggedItem,
          draggable: isInteractivePage,
          dropTarget: false,
          editing: isInteractivePage && state.isEditMode,
          folderPreviewPageSize: state.folderPageSize,
          ghosted: isReleaseGhostItem ||
            (isInteractivePage && (
            this.openingGhostKeys?.has(item.id) ||
            this.closingGhostKeys?.has(item.id))),
          hasCustomIcon: Boolean(item.customIconPath || item.customIconDataUrl),
          iconSize,
          interactive: isInteractivePage,
          item,
          jiggleSeed: pageIndex * 100 + index,
          launchTargetStatus: isInteractivePage && state.showMissingLaunchTargetBadge ? state.launchTargetStatusById?.[item.id] : null,
          opening: isInteractivePage && state.isIconOpening?.("folder", item.id, pageIndex, state.renderedFolder.id),
          removable: item.type === "app",
          selected: isInteractivePage && state.isIconSelected?.("folder", item.id, pageIndex, state.renderedFolder.id),
          source,
          stageHeight: state.height,
          stageWidth: state.width,
          textless: state.isTextlessMode,
        });

        const iconBounds = node.getIconBounds(state.stageRect);
        if (isInteractivePage) {
          registerLaunchIconBounds(
            { area: "folder", folderId: state.renderedFolder.id, id: item.id, pageIndex },
            iconBounds,
            { area: "folder", folderId: state.renderedFolder.id, id: item.id, index, item, pageIndex }
          );
          const targetCenterX = geometry.panel.left + x + targetTrackX;
          const targetCenterY = geometry.panel.top + y + getIconVisualOffsetY(state.isTextlessMode);
          registerLaunchIconTargetBounds(
            { area: "folder", folderId: state.renderedFolder.id, id: item.id, pageIndex },
            makeTargetIconBounds(state.stageRect, state.width, state.height, targetCenterX, targetCenterY, iconSize),
            { area: "folder", folderId: state.renderedFolder.id, id: item.id, index, item, pageIndex }
          );
        }
        if (isInteractivePage && !isActiveDraggedItem && !isReleaseGhostItem && isNewFolder && !isClosing && pageIndex === state.folderPageIndex) {
          const previewSlotIndex = previewSlotById.get(item.id);
          const isThumbnailChild = previewSlotIndex != null;
          const sourceRect = isThumbnailChild
            ? getFolderPreviewChildBounds(state.renderedFolder.id, item.id, previewSlotIndex) ||
            makeProjectedPreviewRect(folderRect, previewSlotIndex, 3, 3)
            : getFolderPreviewChildBounds(state.renderedFolder.id, item.id, index) ||
            makeProjectedPreviewRect(folderRect, index, cols, rows);
          const targetCenterX = geometry.panel.left + x + targetTrackX;
          const targetCenterY = geometry.panel.top + y + getIconVisualOffsetY(state.isTextlessMode);
          openingGhostTargets.push({
            columnCount: cols,
            cellHeight: slot.height,
            cellWidth: slot.width,
            iconSize,
            index,
            isThumbnailChild,
            item,
            previewSlotIndex,
            controllerGhostKey: findControllerGhostKey(state.folderOpenIconGhosts, item.id, index),
            sourceRect,
            targetRect: makeIconRect(targetCenterX, targetCenterY, iconSize),
          });
        }
        if (isInteractivePage && state.isFolderClosing && pageIndex === state.folderPageIndex) {
          const previewSlotIndex = previewSlotById.get(item.id);
          const isThumbnailChild = previewSlotIndex != null;
          const stablePreviewChildRect = isThumbnailChild && this.stableFolderCloseTarget?.folderId === state.renderedFolder.id
            ? this.stableFolderCloseTarget.previewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
            : null;
          closingGhostTargets.push({
            columnCount: cols,
            cellHeight: slot.height,
            cellWidth: slot.width,
            iconSize,
            index,
            isThumbnailChild,
            item,
            previewSlotIndex,
            controllerGhostKey: findControllerGhostKey(state.folderCloseIconGhosts, item.id, index),
            sourceRect: iconBounds,
            targetRect: isThumbnailChild
              ? stablePreviewChildRect || makeProjectedPreviewRect(closeThumbRect, previewSlotIndex, 3, 3)
              : makeFolderCenterCollapseRect(closeThumbRect),
          });
        }
      });
    });

    const closingPreviewSwapTargets = state.isFolderClosing && state.folderPageIndex > 0
      ? this.makeClosingPreviewSwapTargets(state, previewSlots, closeThumbRect)
      : [];
    if (isNewFolder && !isClosing) this.startOpeningGhosts(state, openingGhostTargets, folderRect, geometry.panel);
    if (state.isFolderClosing && this.closingGhostFolderId !== state.renderedFolder.id) {
      this.startClosingGhosts(state, closingGhostTargets, closeThumbRect, geometry.panel, {
        previewSwapTargets: closingPreviewSwapTargets,
      });
    }
    if (!state.isFolderClosing && this.closingGhostFolderId) {
      this.closingGhostFolderId = null;
      this.clearClosingGhosts();
    }

    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      gsap.killTweensOf(node);
      gsap.to(node, { alpha: 0, duration: 0.14, onComplete: () => node.destroy({ children: true }) });
    }
    this.pageTrack.visible = !state.isFolderClosing &&
      !this.openingGhostKeys?.size &&
      !this.closingGhostKeys?.size &&
      !this.closingPreviewSwapKeys?.size;
    if (!this.frameGhostState) {
      if (!isClosing) this.notifyPanelTitleFrame(geometry.panel);
      else this.notifyTitleFrame(geometry.panel);
    }
    return geometry;
  }

  makeClosingPreviewSwapTargets(state, previewSlots, folderRect) {
    if (!state.renderedFolder?.id || !folderRect) return [];
    return (previewSlots || []).slice(0, 9).map((item, previewSlotIndex) => {
      if (!item?.id) return null;
      const stablePreviewChildRect = this.stableFolderCloseTarget?.folderId === state.renderedFolder.id
        ? this.stableFolderCloseTarget.previewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
        : null;
      const targetRect = stablePreviewChildRect || makeProjectedPreviewRect(folderRect, previewSlotIndex, 3, 3);
      return targetRect ? { item, previewSlotIndex, targetRect } : null;
    }).filter(Boolean);
  }

  hasActiveIconGhosts() {
    return Boolean(this.openingGhostKeys?.size || this.closingGhostKeys?.size || this.closingPreviewSwapKeys?.size);
  }

  clearOpeningGhostRevealTimer() {
    if (!this.openingGhostRevealTimer) return;
    globalThis.clearTimeout?.(this.openingGhostRevealTimer);
    this.openingGhostRevealTimer = null;
  }

  clearClosingGhostRevealTimer() {
    if (!this.closingGhostRevealTimer) return;
    globalThis.clearTimeout?.(this.closingGhostRevealTimer);
    this.closingGhostRevealTimer = null;
  }

  scheduleOpeningGhostRevealFallback(targets) {
    this.clearOpeningGhostRevealTimer();
    const maxDelay = (targets || []).reduce((delay, target) =>
      Math.max(delay, getGridGhostDelay(target.index, target.columnCount, 0.18)), 0);
    const timeoutMs = Math.round((maxDelay + folderOpenGhostDuration) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    this.openingGhostRevealTimer = globalThis.setTimeout?.(() => {
      this.openingGhostRevealTimer = null;
      if (this.openingGhostKeys?.size) this.clearOpeningGhosts();
    }, timeoutMs) || null;
  }

  scheduleClosingGhostRevealFallback(targets) {
    this.clearClosingGhostRevealTimer();
    const maxDelay = getMaxGridGhostDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const timeoutMs = Math.round(
      (maxDelay + folderCloseDuration + CLOSING_PREVIEW_SWAP_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
    );
    this.closingGhostRevealTimer = globalThis.setTimeout?.(() => {
      this.closingGhostRevealTimer = null;
      if (this.closingGhostKeys?.size || this.closingPreviewSwapKeys?.size) this.clearClosingGhosts();
    }, timeoutMs) || null;
  }

  revealIconNodes() {
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
  }

  finishIconGhostTransition() {
    if (this.hasActiveIconGhosts()) return;
    this.clearOpeningGhostRevealTimer();
    this.clearClosingGhostRevealTimer();
    this.revealIconNodes();
    this.pageTrack.visible = true;
    this.rebuildPageTrackMask();
  }

  flushCompletedClosingControllerGhosts(state) {
    const keys = this.completedClosingControllerGhostKeys || [];
    this.completedClosingControllerGhostKeys = [];
    for (const key of keys) state.completeFolderCloseIconGhost?.(key);
  }

  clearCompletedClosingPreviewGhosts() {
    const ghosts = this.completedClosingPreviewGhosts || [];
    this.completedClosingPreviewGhosts = [];
    for (const ghost of ghosts) {
      killTweensDeep(ghost);
      if (!ghost.destroyed) ghost.destroy({ children: true });
    }
  }

  finishClosingGhostTransition(state) {
    if (this.openingGhostKeys?.size ||
      this.closingGhostKeys?.size ||
      this.closingPreviewSwapKeys?.size ||
      !this.closingFrameComplete) return;
    this.clearClosingGhostRevealTimer();
    this.pageTrack.visible = false;
    this.flushCompletedClosingControllerGhosts(state);
    const defer = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout?.(callback, 0));
    defer(() => {
      this.clearCompletedClosingPreviewGhosts();
      clearClosingPreviewSwapLayer(this);
    });
  }

  clearOpeningGhosts() {
    this.clearOpeningGhostRevealTimer();
    this.openingGhostKeys?.clear();
    this.clearFrameGhost();
    this.pageTrack.visible = true;
    this.revealIconNodes();
    this.rebuildPageTrackMask();
    const ghosts = this.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killTweensDeep(ghost);
      ghost.destroy?.({ children: true });
    }
  }

  clearClosingGhosts() {
    this.clearClosingGhostRevealTimer();
    this.closingGhostKeys?.clear();
    this.closingPreviewSwapKeys?.clear();
    this.closingFrameComplete = false;
    this.completedClosingControllerGhostKeys = [];
    this.completedClosingPreviewGhosts = [];
    this.clearFrameGhost();
    this.pageTrack.visible = true;
    this.revealIconNodes();
    this.rebuildPageTrackMask();
    const ghosts = this.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killTweensDeep(ghost);
      ghost.destroy?.({ children: true });
    }
    clearClosingPreviewSwapLayer(this);
  }

  clearFrameGhost(options = {}) {
    if (this.frameGhostState) {
      gsap.killTweensOf(this.frameGhostState);
      this.frameGhostState = null;
    }
    gsap.killTweensOf(this.frameGhost);
    gsap.killTweensOf(this.panelMaterial);
    this.frameGhost.clear();
    this.frameGhost.visible = false;
    this.frameGhost.alpha = 0;
    clearClosingFrameMask(this);
    this.panelMaterial.visible = true;
    this.panelMaterial.alpha = options.panelMaterialAlpha ?? 1;
  }

  notifyTitleFrame(rect) {
    if (!rect) {
      if (this.titleFrameKey === null) return;
      this.titleFrameKey = null;
      this.onTitleFrameChange(null);
      return;
    }
    const frame = {
      height: rect.height,
      left: rect.left,
      progress: rect.progress ?? 1,
      top: rect.top,
      width: rect.width,
    };
    const key = [
      Math.round(frame.left * 100),
      Math.round(frame.top * 100),
      Math.round(frame.width * 100),
      Math.round(frame.height * 100),
      Math.round(frame.progress * 1000),
    ].join(":");
    if (key === this.titleFrameKey) return;
    this.titleFrameKey = key;
    this.onTitleFrameChange(frame);
  }

  getPanelTitleProgress() {
    if (!this.panelTitleOpening) return 1;
    const progressX = this.panelTitleStartScaleX >= 1
      ? 1
      : (this.panel.scale.x - this.panelTitleStartScaleX) / (1 - this.panelTitleStartScaleX);
    const progressY = this.panelTitleStartScaleY >= 1
      ? 1
      : (this.panel.scale.y - this.panelTitleStartScaleY) / (1 - this.panelTitleStartScaleY);
    return clamp01(Math.max(progressX, progressY));
  }

  notifyPanelTitleFrame(panelRect) {
    if (!panelRect) {
      this.notifyTitleFrame(null);
      return;
    }
    const scaleX = Number(this.panel.scale?.x) || 1;
    const scaleY = Number(this.panel.scale?.y) || 1;
    const pivotX = Number(this.panel.pivot?.x) || panelRect.width / 2;
    const pivotY = Number(this.panel.pivot?.y) || panelRect.height / 2;
    this.notifyTitleFrame({
      height: panelRect.height * Math.abs(scaleY),
      left: this.panel.x - pivotX * scaleX,
      progress: this.getPanelTitleProgress(),
      top: this.panel.y - pivotY * scaleY,
      width: panelRect.width * Math.abs(scaleX),
    });
  }

  enableClosingFrameMask() {
    const mask = ensureClosingFrameMaskState(this);
    this.closingGhostLayer.mask = mask;
    ensureClosingPreviewSwapState(this).mask = mask;
  }

  drawClosingFrameMask(rect) {
    const mask = ensureClosingFrameMaskState(this);
    mask.clear()
      .roundRect(rect.left, rect.top, rect.width, rect.height, rect.radius)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  drawFrameGhost(rect, options = {}) {
    const drawRect = rect;
    this.frameGhost.clear()
      .roundRect(drawRect.left, drawRect.top, drawRect.width, drawRect.height, drawRect.radius)
      .fill({ color: Math.round(drawRect.fillColor ?? 0xf7f8ff), alpha: drawRect.fillAlpha })
      .stroke({ color: Math.round(drawRect.strokeColor ?? 0xffffff), alpha: drawRect.strokeAlpha, width: drawRect.strokeWidth ?? 1 });
    if (options.updateClosingMask) this.drawClosingFrameMask(drawRect);
    if (options.notifyTitleFrame !== false) this.notifyTitleFrame(drawRect);
  }

  startFrameGhost(fromRect, toRect, options = {}) {
    if (!fromRect || !toRect) return;
    if (this.frameGhostState) gsap.killTweensOf(this.frameGhostState);
    gsap.killTweensOf(this.frameGhost);
    gsap.killTweensOf(this.panelMaterial);
    const duration = options.duration ?? folderOpenGhostDuration;
    const ease = options.ease ?? folderOpenGhostEase;
    const fadeStart = Math.max(0, Math.min(0.95, options.fadeStart ?? 0.72));
    const fadeDuration = Math.max(0.01, duration * (1 - fadeStart));
    const fromFillColor = options.fromFillColor ?? 0xf7f8ff;
    const toFillColor = options.toFillColor ?? fromFillColor;
    const fromStrokeColor = options.fromStrokeColor ?? 0xffffff;
    const toStrokeColor = options.toStrokeColor ?? fromStrokeColor;
    this.panelMaterial.visible = true;
    this.panelMaterial.alpha = options.panelMaterialFromAlpha ?? 0;
    this.frameGhost.visible = true;
    this.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
    const frame = {
      fillAlpha: options.fromFillAlpha ?? 0.22,
      fillColor: fromFillColor,
      height: fromRect.height,
      left: fromRect.left,
      progress: 0,
      radius: options.fromRadius ?? getFrameRadius(fromRect),
      strokeAlpha: options.fromStrokeAlpha ?? 0.26,
      strokeColor: fromStrokeColor,
      strokeWidth: options.fromStrokeWidth ?? 1,
      top: fromRect.top,
      width: fromRect.width,
    };
    this.frameGhostState = frame;
    this.drawFrameGhost(frame, options);
    gsap.to(this.panelMaterial, {
      alpha: options.panelMaterialToAlpha ?? 1,
      delay: duration * fadeStart,
      duration: fadeDuration,
      ease,
      overwrite: "auto",
    });
    gsap.to(this.frameGhost, {
      alpha: options.frameGhostToAlpha ?? 0,
      delay: duration * fadeStart,
      duration: fadeDuration,
      ease,
      overwrite: "auto",
    });
    gsap.to(frame, {
      duration,
      ease,
      fillAlpha: options.toFillAlpha ?? 0.26,
      height: toRect.height,
      left: toRect.left,
      progress: 1,
      radius: options.toRadius ?? getFrameRadius(toRect, 48),
      strokeAlpha: options.toStrokeAlpha ?? 0.24,
      strokeWidth: options.toStrokeWidth ?? frame.strokeWidth,
      top: toRect.top,
      width: toRect.width,
      onUpdate: () => {
        frame.fillColor = lerpColor(fromFillColor, toFillColor, frame.progress);
        frame.strokeColor = lerpColor(fromStrokeColor, toStrokeColor, frame.progress);
        this.drawFrameGhost(frame, options);
        options.onUpdate?.(frame);
      },
      onComplete: () => {
        frame.fillColor = toFillColor;
        frame.strokeColor = toStrokeColor;
        if (options.preserveOnComplete) {
          this.frameGhostState = frame;
          this.drawFrameGhost(frame, options);
          options.onComplete?.();
          return;
        }
        this.clearFrameGhost({ panelMaterialAlpha: options.panelMaterialFinalAlpha ?? 1 });
        options.onComplete?.();
      },
    });
  }

  refreshPageTrackMask() {
    this.pageTrack.mask = null;
    this.pageTrack.mask = this.pageMask;
  }

  drawPageMask(mask, rect) {
    if (!mask || !rect) return;
    mask.clear()
      .rect(rect.left, rect.top, rect.width, rect.height)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  rebuildPageTrackMask() {
    if (!this.pageMaskRect || !this.panel || this.destroyed) {
      this.refreshPageTrackMask();
      return;
    }
    const previousMask = this.pageMask;
    const nextMask = new Graphics();
    this.drawPageMask(nextMask, this.pageMaskRect);
    const previousIndex = this.panel.children.indexOf(previousMask);
    this.pageTrack.mask = null;
    if (previousIndex >= 0) {
      this.panel.removeChild(previousMask);
      this.panel.addChildAt(nextMask, previousIndex);
    } else {
      const trackIndex = this.panel.children.indexOf(this.pageTrack);
      this.panel.addChildAt(nextMask, Math.max(0, trackIndex));
    }
    this.pageMask = nextMask;
    this.pageTrack.mask = this.pageMask;
    previousMask?.destroy?.();
  }

  finishOpeningGhostTransition() {
    if (this.openingGhostKeys?.size) return;
    this.clearOpeningGhostRevealTimer();
    this.revealIconNodes();
    this.pageTrack.visible = true;
    this.rebuildPageTrackMask();
    const ghosts = this.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killTweensDeep(ghost);
      ghost.destroy?.({ children: true });
    }
  }

  completeOpeningGhost(state, target, ghost) {
    this.openingGhostKeys?.delete(target.item.id);
    const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
    if (controllerGhostKey) state.completeFolderOpenIconGhost?.(controllerGhostKey);
    ghost.alpha = 1;
    ghost.scale.set(1);
    this.finishOpeningGhostTransition();
  }

  startOpeningGhosts(state, targets, folderRect, panelRect) {
    this.clearOpeningGhosts();
    this.openingGhostKeys = new Set();
    const usableTargets = (targets || []).filter((target) => target.sourceRect && target.targetRect);

    if (!usableTargets.length) return;
    this.startFrameGhost(makeLocalRect(folderRect, state.stageRect), panelRect, {
      duration: folderOpenGhostDuration,
      ease: folderOpenGhostEase,
      fromFillAlpha: 0.22,
      fromRadius: getFrameRadius(folderRect),
      fromStrokeAlpha: 0.26,
      notifyTitleFrame: false,
      toFillAlpha: 0.26,
      toRadius: 48,
      toStrokeAlpha: 0.24,
    });

    this.pageTrack.visible = false;
    this.scheduleOpeningGhostRevealFallback(usableTargets);
    for (const target of usableTargets) {
      const ghost = new IconNode();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.setState({
        cellHeight: target.cellHeight,
        cellWidth: target.cellWidth,
        compact: false,
        dragging: false,
        draggable: false,
        dropTarget: false,
        editing: false,
        folderPreviewPageSize: state.folderPageSize,
        ghosted: false,
        hasCustomIcon: false,
        iconSize: target.iconSize,
        interactive: false,
        item: target.item,
        launchTargetStatus: target.item?.type === "app" && state.showMissingLaunchTargetBadge
          ? state.launchTargetStatusById?.[target.item.id]
          : null,
        opening: false,
        removable: false,
        selected: false,
        source: { type: "folder-open-ghost", pageIndex: state.folderPageIndex },
        stageHeight: state.height,
        stageWidth: state.width,
        textless: state.isTextlessMode,
      });
      const sourceRect = makeLocalRect(target.sourceRect, state.stageRect);
      const labelOffset = getIconNodeOffsetFromVisualCenter(state.isTextlessMode);
      const scale = Math.max(0.16, target.sourceRect.width / Math.max(1, target.iconSize));
      const fromX = sourceRect.left + sourceRect.width / 2;
      const fromY = sourceRect.top + sourceRect.height / 2 + labelOffset * scale;
      const toX = target.targetRect.left + target.targetRect.width / 2;
      const toY = target.targetRect.top + target.targetRect.height / 2 + labelOffset;
      const delay = getGridGhostDelay(target.index, target.columnCount, 0.18);
      const labelDelay = delay + folderOpenGhostDuration * 0.58;
      ghost.position.set(fromX, fromY);
      ghost.scale.set(scale);
      ghost.alpha = target.isThumbnailChild ? 1 : 0;
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
        gsap.to(ghost.labelText, { alpha: 1, delay: labelDelay, duration: 0.13, ease: "power2.out" });
        gsap.to(ghost.labelText.scale, { x: 1, y: 1, delay: labelDelay, duration: 0.13, ease: "power2.out" });
      }
      this.openingGhostLayer.addChild(ghost);
      this.openingGhostKeys.add(target.item.id);
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      gsap.to(ghost, {
        alpha: 1,
        duration: folderOpenGhostDuration,
        ease: folderOpenGhostEase,
        x: toX,
        y: toY,
        delay,
        onComplete: () => this.completeOpeningGhost(state, target, ghost),
      });
      gsap.to(ghost.scale, {
        duration: folderOpenGhostDuration,
        ease: folderOpenGhostEase,
        x: 1,
        y: 1,
        delay,
      });
    }
  }

  completeClosingGhost(state, target, ghost) {
    if (!ghost || ghost.closingComplete) return;
    ghost.closingComplete = true;
    this.closingGhostKeys?.delete(target.item.id);
    const controllerGhostKey = target.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target.item.id, target.index);
    if (controllerGhostKey) this.completedClosingControllerGhostKeys.push(controllerGhostKey);
    killTweensDeep(ghost);
    if (target.isThumbnailChild && !ghost.destroyed) {
      const targetRect = makeLocalRect(target.targetRect, state.stageRect);
      const labelOffset = getIconNodeOffsetFromVisualCenter(state.isTextlessMode);
      const scale = Math.max(0.14, target.targetRect.width / Math.max(1, target.iconSize));
      ghost.position.set(
        targetRect.left + targetRect.width / 2,
        targetRect.top + targetRect.height / 2 + labelOffset * scale
      );
      ghost.scale.set(scale);
      ghost.alpha = 1;
      this.completedClosingPreviewGhosts.push(ghost);
      this.finishClosingGhostTransition(state);
      return;
    }
    this.finishClosingGhostTransition(state);
    if (!ghost.destroyed) ghost.destroy({ children: true });
  }

  completeClosingFrameGhost(state) {
    this.closingFrameComplete = true;
    this.finishClosingGhostTransition(state);
  }

  captureOpeningInterruption(state, targets, panelRect) {
    if (!this.openingGhostKeys?.size) return null;
    const targetByItemId = new Map((targets || []).map((target) => [target.item?.id, target]));
    const interruptedTargets = [];

    for (const ghost of this.openingGhostLayer.children || []) {
      const baseTarget = targetByItemId.get(ghost.item?.id);
      if (!baseTarget || ghost.destroyed) continue;
      const sourceRect = ghost.getIconBounds(state.stageRect);
      if (!sourceRect) continue;
      interruptedTargets.push({
        ...baseTarget,
        interrupted: true,
        sourceAlpha: ghost.alpha,
        sourceLabelAlpha: ghost.labelText?.alpha,
        sourceRect,
        sourceScale: Math.max(0.14, sourceRect.width / Math.max(1, baseTarget.iconSize)),
      });
    }

    const frameRect = cloneFrameSnapshot(this.frameGhostState);
    const contentFrameRect = makeOpeningInterruptionFrame(interruptedTargets, state.stageRect, frameRect);

    return {
      frameRect: resolveOpeningInterruptionFrame(frameRect, panelRect, contentFrameRect),
      targets: interruptedTargets.length ? interruptedTargets : targets,
    };
  }

  createClosingPreviewSwapIcon(item, size) {
    const ghost = new Container();
    const sprite = new Sprite();
    const emoji = new Text({ text: "", style: { align: "center", fill: 0xffffff, fontSize: size, lineHeight: size } });
    ghost.eventMode = "none";
    ghost.item = item;
    ghost.iconSize = size;
    sprite.anchor.set(0.5);
    emoji.anchor.set(0.5);
    ghost.addChild(sprite);
    ghost.addChild(emoji);

    const render = () => {
      const texture = getCachedIconTexture(item, () => {
        if (ghost.destroyed) return;
        render();
      }, ghost);
      sprite.visible = Boolean(texture);
      emoji.visible = !texture;
      if (texture) {
        sprite.texture = texture;
        sprite.width = size;
        sprite.height = size;
        return;
      }
      emoji.text = item?.emoji || "◼";
      emoji.style.fontSize = size;
      emoji.style.lineHeight = size;
    };
    render();
    return ghost;
  }

  completeClosingPreviewSwapGhost(state, key, root, iconsWrap) {
    if (!this.closingPreviewSwapKeys?.has(key)) return;
    this.closingPreviewSwapKeys.delete(key);
    gsap.killTweensOf(root);
    gsap.killTweensOf(iconsWrap);
    gsap.killTweensOf(iconsWrap.scale);
    root.alpha = 1;
    iconsWrap.position.set(iconsWrap.pivot.x, iconsWrap.pivot.y);
    iconsWrap.scale.set(1);
    this.finishClosingGhostTransition(state);
  }

  startClosingPreviewSwapGhosts(state, targets) {
    clearClosingPreviewSwapLayer(this);
    if (!targets?.length || state.folderPageIndex <= 0) return;

    const localTargets = [];
    let bounds = null;
    for (const target of targets) {
      const rect = makeLocalRect(target.targetRect, state.stageRect);
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      localTargets.push({ ...target, rect });
      bounds = expandBounds(bounds, rect);
    }
    const maskRect = makeBoundsRect(bounds, 2);
    if (!localTargets.length || !maskRect) return;

    const key = makeClosingPreviewSwapKey(state.renderedFolder?.id, state.folderPageIndex);
    const root = new Container();
    const mask = new Graphics();
    const iconsWrap = new Container();
    const centerX = maskRect.left + maskRect.width / 2;
    const centerY = maskRect.top + maskRect.height / 2;

    root.eventMode = "none";
    root.alpha = 0.86;
    mask.rect(maskRect.left, maskRect.top, maskRect.width, maskRect.height).fill({ color: 0xffffff, alpha: 1 });
    iconsWrap.mask = mask;
    iconsWrap.pivot.set(centerX, centerY);
    iconsWrap.position.set(centerX, centerY);
    iconsWrap.scale.set(CLOSING_PREVIEW_SWAP_START_SCALE);
    root.addChild(mask);
    root.addChild(iconsWrap);
    ensureClosingPreviewSwapState(this).addChild(root);
    this.closingPreviewSwapKeys.add(key);

    const iconMotions = [];
    for (const target of localTargets) {
      const size = Math.max(3, Math.min(target.rect.width, target.rect.height));
      const ghost = this.createClosingPreviewSwapIcon(target.item, size);
      const finalX = target.rect.left + target.rect.width / 2;
      const finalY = target.rect.top + target.rect.height / 2;
      const slotIndex = Math.max(0, Number(target.previewSlotIndex) || 0);
      const col = slotIndex % 3;
      const row = Math.floor(slotIndex / 3);
      const jitterX = (((slotIndex * 17) % 5) - 2) * size * 0.018;
      const jitterY = (((slotIndex * 13) % 5) - 2) * size * 0.018;
      const startOffsetX = size * (0.9 - col * 0.16 + row * 0.08) + jitterX;
      const startOffsetY = size * (0.72 - row * 0.12 + col * 0.06) + jitterY;
      const delay = row * CLOSING_PREVIEW_ICON_ROW_STAGGER + col * CLOSING_PREVIEW_ICON_COLUMN_STAGGER;
      ghost.position.set(finalX - startOffsetX, finalY - startOffsetY);
      ghost.scale.set(CLOSING_PREVIEW_ICON_START_SCALE + (4 - row - col) * 0.006);
      ghost.alpha = 0.78;
      iconsWrap.addChild(ghost);
      iconMotions.push({ delay, ghost, x: finalX, y: finalY });
    }

    const timeline = gsap.timeline({
      onComplete: () => this.completeClosingPreviewSwapGhost(state, key, root, iconsWrap),
    });
    timeline
      .to(root, { alpha: 1, duration: 0.08, ease: "power1.out" }, 0)
      .to(iconsWrap.scale, {
        x: 1,
        y: 1,
        duration: CLOSING_PREVIEW_SWAP_DURATION,
        ease: "power2.out",
      }, 0);
    for (const motion of iconMotions) {
      timeline
        .to(motion.ghost, {
          alpha: 1,
          duration: CLOSING_PREVIEW_ICON_DURATION,
          ease: "power2.out",
          x: motion.x,
          y: motion.y,
        }, motion.delay)
        .to(motion.ghost.scale, {
          duration: CLOSING_PREVIEW_ICON_DURATION,
          ease: "power2.out",
          x: 1,
          y: 1,
        }, motion.delay);
    }
  }

  startClosingGhosts(state, targets, folderRect, panelRect, options = {}) {
    const {
      previewSwapTargets = [],
    } = options;
    const interruption = this.captureOpeningInterruption(state, targets, panelRect);
    const closeFrameFromRect = interruption?.frameRect || panelRect;
    const closeTargets = interruption?.targets || targets;
    this.clearOpeningGhosts();
    this.clearClosingGhosts();
    this.closingGhostFolderId = state.renderedFolder?.id || null;
    this.closingGhostKeys = new Set();
    this.closingFrameComplete = false;
    this.completedClosingControllerGhostKeys = [];
    this.completedClosingPreviewGhosts = [];
    const usableTargets = (closeTargets || []).filter((target) => target.sourceRect && target.targetRect);
    if (!usableTargets.length) return;
    const isInterruptedClose = Boolean(interruption);
    const frameMaxDelay = isInterruptedClose ? 0 : CLOSING_GHOST_MAX_DELAY;
    const frameDuration = Math.max(
      isInterruptedClose ? folderCloseDuration : folderPanelCloseDuration,
      frameMaxDelay + folderCloseDuration + CLOSING_FRAME_TAIL_DURATION
    );
    const thumb = getFolderThumbMetrics(folderRect.width);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame) => {
      if (closingPreviewSwapStarted || isInterruptedClose || !previewSwapTargets?.length) return;
      if ((frame?.progress ?? 0) < CLOSING_PREVIEW_SWAP_PROGRESS) return;
      closingPreviewSwapStarted = true;
      this.startClosingPreviewSwapGhosts(state, previewSwapTargets);
    };
    this.enableClosingFrameMask();
    this.startFrameGhost(closeFrameFromRect, makeLocalRect(folderRect, state.stageRect), {
      duration: frameDuration,
      ease: isInterruptedClose ? folderCloseEase : folderCloseFrameEase,
      fadeStart: 0.86,
      frameGhostToAlpha: 1,
      fromFillAlpha: interruption?.frameRect?.fillAlpha ?? 0.26,
      fromFillColor: interruption?.frameRect?.fillColor ?? thumb.fillColor,
      fromRadius: interruption?.frameRect?.radius ?? 48,
      fromStrokeAlpha: interruption?.frameRect?.strokeAlpha ?? 0.24,
      fromStrokeColor: interruption?.frameRect?.strokeColor ?? thumb.strokeColor,
      fromStrokeWidth: interruption?.frameRect?.strokeWidth ?? thumb.strokeWidth,
      panelMaterialFinalAlpha: 0,
      panelMaterialFromAlpha: 0,
      panelMaterialToAlpha: 0,
      onComplete: () => {
        startClosingPreviewSwapWhenReady({ progress: 1 });
        this.completeClosingFrameGhost(state);
      },
      onUpdate: startClosingPreviewSwapWhenReady,
      preserveOnComplete: true,
      toFillAlpha: thumb.fillAlpha,
      toFillColor: thumb.fillColor,
      toRadius: thumb.radius,
      toStrokeAlpha: thumb.strokeAlpha,
      toStrokeColor: thumb.strokeColor,
      toStrokeWidth: thumb.strokeWidth,
      updateClosingMask: true,
    });

    this.pageTrack.visible = false;
    this.scheduleClosingGhostRevealFallback(usableTargets);
    for (const target of usableTargets) {
      const ghost = new IconNode();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState({
        cellHeight: target.cellHeight,
        cellWidth: target.cellWidth,
        compact: false,
        dragging: false,
        draggable: false,
        dropTarget: false,
        editing: false,
        folderPreviewPageSize: state.folderPageSize,
        ghosted: false,
        hasCustomIcon: false,
        iconSize: target.iconSize,
        interactive: false,
        item: target.item,
        launchTargetStatus: target.item?.type === "app" && state.showMissingLaunchTargetBadge
          ? state.launchTargetStatusById?.[target.item.id]
          : null,
        opening: false,
        removable: false,
        selected: false,
        source: { type: "folder-close-ghost", pageIndex: state.folderPageIndex },
        stageHeight: state.height,
        stageWidth: state.width,
        textless: state.isTextlessMode,
      });
      const sourceRect = makeLocalRect(target.sourceRect, state.stageRect);
      const targetRect = makeLocalRect(target.targetRect, state.stageRect);
      const labelOffset = getIconNodeOffsetFromVisualCenter(state.isTextlessMode);
      const sourceScale = target.sourceScale ?? 1;
      const sourceAlpha = target.sourceAlpha ?? 1;
      const scale = Math.max(0.14, target.targetRect.width / Math.max(1, target.iconSize));
      const fromX = sourceRect.left + sourceRect.width / 2;
      const fromY = sourceRect.top + sourceRect.height / 2 + labelOffset * sourceScale;
      const toX = targetRect.left + targetRect.width / 2;
      const toY = targetRect.top + targetRect.height / 2 + labelOffset * scale;
      const delay = target.interrupted ? 0 : getGridGhostDelay(target.index, target.columnCount, CLOSING_GHOST_MAX_DELAY);
      const alphaDelay = delay + folderCloseDuration * CLOSING_EXTRA_GHOST_ALPHA_HOLD;
      ghost.position.set(fromX, fromY);
      ghost.scale.set(sourceScale);
      ghost.alpha = sourceAlpha;
      if (ghost.labelText?.visible) {
        if (target.sourceLabelAlpha != null) ghost.labelText.alpha = target.sourceLabelAlpha;
        gsap.to(ghost.labelText, { alpha: 0, delay, duration: 0.1, ease: "power2.in" });
        gsap.to(ghost.labelText.scale, { x: 0.94, y: 0.94, delay, duration: 0.1, ease: "power2.in" });
      }
      this.closingGhostLayer.addChild(ghost);
      this.closingGhostKeys.add(target.item.id);
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      gsap.to(ghost, {
        delay,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        x: toX,
        y: toY,
        onComplete: () => this.completeClosingGhost(state, target, ghost),
      });
      if (!target.isThumbnailChild) {
        gsap.to(ghost, {
          alpha: 0,
          delay: alphaDelay,
          duration: CLOSING_EXTRA_GHOST_ALPHA_DURATION,
          ease: "power2.in",
        });
      }
      gsap.to(ghost.scale, {
        delay,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        x: scale,
        y: scale,
      });
    }
  }

  animatePanel(state, targetX, targetY, panelRect) {
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    const sourceRect = getTopLevelIconBounds(state.renderedFolder?.id);
    if (this.currentFolderId !== state.renderedFolder?.id) {
      this.currentFolderId = state.renderedFolder?.id;
      if (sourceRect) {
        this.panel.position.set(sourceRect.left - state.stageRect.left + sourceRect.width / 2, sourceRect.top - state.stageRect.top + sourceRect.height / 2);
        this.panel.scale.set(Math.max(0.08, sourceRect.width / panelRect.width), Math.max(0.08, sourceRect.height / panelRect.height));
      } else {
        this.panel.position.set(targetX, targetY + 36);
        this.panel.scale.set(0.12, 0.16);
      }
      this.panel.alpha = 0.94;
      this.panelTitleOpening = !isClosing;
      this.panelTitleStartScaleX = this.panel.scale.x;
      this.panelTitleStartScaleY = this.panel.scale.y;
      if (!isClosing) this.notifyPanelTitleFrame(panelRect);
    }

    if (state.isFolderClosing && sourceRect) {
      this.panelTitleOpening = false;
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      gsap.killTweensOf(this.panel);
      gsap.killTweensOf(this.panel.scale);
      this.panel.alpha = 0;
      return;
    }

    if (isClosing && sourceRect) {
      this.panelTitleOpening = false;
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      gsap.to(this.panel, {
        alpha: state.isFolderAppLaunchClosing ? 0 : 0.8,
        duration: folderPanelCloseDuration,
        ease: folderCloseEase,
        overwrite: "auto",
        x: sourceRect.left - state.stageRect.left + sourceRect.width / 2,
        y: sourceRect.top - state.stageRect.top + sourceRect.height / 2,
      });
      gsap.to(this.panel.scale, {
        duration: folderPanelCloseDuration,
        ease: folderCloseEase,
        overwrite: "auto",
        x: Math.max(0.08, sourceRect.width / panelRect.width),
        y: Math.max(0.08, sourceRect.height / panelRect.height),
      });
      return;
    }

    const notifyPanelTitleFrame = () => this.notifyPanelTitleFrame(panelRect);
    gsap.to(this.panel, {
      alpha: isClosing ? 0 : 1,
      duration: folderOpenDuration,
      ease: folderOpenEase,
      overwrite: "auto",
    });
    if (isClosing) {
      this.panelTitleOpening = false;
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      gsap.to(this.panel, { duration: folderOpenDuration, ease: folderOpenEase, overwrite: "auto", x: targetX, y: targetY });
      gsap.to(this.panel.scale, { duration: folderOpenDuration, ease: folderOpenEase, overwrite: "auto", x: 1.08, y: 1.08 });
      return;
    }

    gsap.killTweensOf(this.panel, "x,y");
    gsap.killTweensOf(this.panel.scale, "x,y");
    springTo(this.panel, "x", targetX, panelSpring, { onComplete: notifyPanelTitleFrame, onUpdate: notifyPanelTitleFrame });
    springTo(this.panel, "y", targetY, panelSpring, { onComplete: notifyPanelTitleFrame, onUpdate: notifyPanelTitleFrame });
    springTo(this.panel.scale, "x", 1, panelSpring, { onComplete: notifyPanelTitleFrame, onUpdate: notifyPanelTitleFrame });
    springTo(this.panel.scale, "y", 1, panelSpring, { onComplete: notifyPanelTitleFrame, onUpdate: notifyPanelTitleFrame });
    notifyPanelTitleFrame();
  }

  drawPanel(panel) {
    this.panelMaterial.clear()
      .roundRect(0, 0, panel.width, panel.height, 48)
      .fill({ color: 0xf7f8ff, alpha: 0.26 })
      .stroke({ color: 0xffffff, alpha: 0.24, width: 1 });
  }

  bindFakeRefs(state, geometry) {
    const panelElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.panel);
    const gridElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.grid);
    if (state.folderPanelRef) state.folderPanelRef.value = panelElement;
    if (state.folderViewportRef) state.folderViewportRef.value = gridElement;
    if (typeof state.setFolderPageRef === "function") {
      state.setFolderPageRef(gridElement, state.folderPageIndex || 0);
    }
  }

  handlePointerDown(event) {
    const native = event?.nativeEvent || event;
    native.preventDefault?.();
    native.stopPropagation?.();

    const clientX = native.clientX ?? (this.stageRect?.left || 0) + (event?.global?.x || 0);
    const clientY = native.clientY ?? (this.stageRect?.top || 0) + (event?.global?.y || 0);
    if (this.isClosing) {
      const closeTarget = this.stableFolderCloseTarget;
      if (this.isUserFolderClosing &&
        closeTarget?.folderId &&
        (isPointInRect(clientX, clientY, closeTarget.thumbRect) ||
          isPointInRect(clientX, clientY, closeTarget.iconRect))) {
        this.onClosingFolderPointerDown(closeTarget.folderId, native);
      }
      return;
    }

    const x = clientX - this.stageRect.left;
    const y = clientY - this.stageRect.top;
    const panel = this.panelGeometry;
    if (!panel) return;
    if (x < panel.left || x > panel.left + panel.width || y < panel.top || y > panel.top + panel.height) {
      this.onOutsidePointerDown(native);
    }
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  destroy(options) {
    this.clearOpeningGhosts();
    this.clearClosingGhosts();
    killTweensDeep(this.panel);
    killTweensDeep(this.pageTrack);
    if (this.frameGhostState) gsap.killTweensOf(this.frameGhostState);
    stopTargetSprings(this.pageTrack);
    stopTargetSprings(this.panel);
    stopTargetSprings(this.panel.scale);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
