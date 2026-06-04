import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import {
  folderCloseDuration,
  folderCloseEase,
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
import { makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import { getFolderPreviewChildBounds, getTopLevelIconBounds, registerLaunchIconBounds } from "../geometry/iconBoundsRegistry.js";
import { IconNode } from "../nodes/IconNode.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;

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

function makeIconRect(centerX, centerY, size) {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
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

export class FolderOverlayLayer extends Container {
  constructor(options = {}) {
    super();
    this.panel = new Container();
    this.panelMaterial = new Graphics();
    this.frameGhost = new Graphics();
    this.frameGhost.visible = false;
    this.pageMask = new Graphics();
    this.pageMaskRect = null;
    this.pageTrack = new Container();
    this.openingGhostLayer = new Container();
    this.closingGhostLayer = new Container();
    this.folderTitle = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 18, fontWeight: "620", fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.iconNodes = new Map();
    this.openingGhostRevealTimer = null;
    this.closingGhostRevealTimer = null;
    this.onIconAction = options.onIconAction || (() => {});
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => {});
    this.addChild(this.frameGhost);
    this.addChild(this.panel);
    this.panel.addChild(this.panelMaterial);
    this.panel.addChild(this.pageMask);
    this.panel.addChild(this.pageTrack);
    this.panel.addChild(this.folderTitle);
    this.addChild(this.openingGhostLayer);
    this.addChild(this.closingGhostLayer);
    this.pageTrack.mask = this.pageMask;
    this.eventMode = "static";
    this.on("pointerdown", (event) => this.handlePointerDown(event));
  }

  update(state) {
    this.stageRect = state.stageRect;
    this.visible = Boolean(state.renderedFolder);
    if (!this.visible) {
      this.currentFolderId = null;
      this.sizeKey = null;
      stopTargetSprings(this.pageTrack);
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      this.clearOpeningGhosts();
      this.clearClosingGhosts();
      return null;
    }
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
    const isNewFolder = this.currentFolderId !== state.renderedFolder?.id;
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
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
    this.pageMaskRect = {
      left: localGridLeft,
      top: localGridTop,
      width: geometry.grid.width,
      height: Math.max(geometry.grid.height, geometry.panel.height - localGridTop - 20),
    };
    this.drawPageMask(this.pageMask, this.pageMaskRect);
    this.refreshPageTrackMask();
    const targetTrackX = -state.folderPageIndex * geometry.grid.width;
    springTo(this.pageTrack, "x", targetTrackX, pageTrackSpring);
    const folderRect = getTopLevelIconBounds(state.renderedFolder.id);

    this.bindFakeRefs(state, geometry);
    const seen = new Set();
    const openingGhostTargets = [];
    const closingGhostTargets = [];
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
          dragging: isInteractivePage && state.dragMeta?.item?.id === item.id,
          draggable: isInteractivePage,
          dropTarget: false,
          editing: isInteractivePage && state.isEditMode,
          folderPreviewPageSize: state.folderPageSize,
          ghosted: isInteractivePage && (this.openingGhostKeys?.has(item.id) ||
            this.closingGhostKeys?.has(item.id)),
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
            { area: "folder", folderId: state.renderedFolder.id, id: item.id, item, pageIndex }
          );
        }
        if (isInteractivePage && isNewFolder && !isClosing && pageIndex === state.folderPageIndex) {
          const sourceRect = getFolderPreviewChildBounds(state.renderedFolder.id, item.id, index) ||
            makeProjectedPreviewRect(folderRect, index, cols, rows);
          const targetCenterX = geometry.panel.left + x + targetTrackX;
          const targetCenterY = geometry.panel.top + y - (state.isTextlessMode ? 0 : 14);
          openingGhostTargets.push({
            columnCount: cols,
            cellHeight: slot.height,
            cellWidth: slot.width,
            iconSize,
            index,
            item,
            controllerGhostKey: findControllerGhostKey(state.folderOpenIconGhosts, item.id, index),
            sourceRect,
            targetRect: makeIconRect(targetCenterX, targetCenterY, iconSize),
          });
        }
        if (isInteractivePage && state.isFolderClosing && pageIndex === state.folderPageIndex) {
          closingGhostTargets.push({
            columnCount: cols,
            cellHeight: slot.height,
            cellWidth: slot.width,
            iconSize,
            index,
            item,
            controllerGhostKey: findControllerGhostKey(state.folderCloseIconGhosts, item.id, index),
            sourceRect: iconBounds,
            targetRect: getFolderPreviewChildBounds(state.renderedFolder.id, item.id, index) ||
              makeProjectedPreviewRect(folderRect, index, cols, rows),
          });
        }
      });
    });

    if (isNewFolder && !isClosing) this.startOpeningGhosts(state, openingGhostTargets, folderRect, geometry.panel);
    if (state.isFolderClosing && this.closingGhostFolderId !== state.renderedFolder.id) {
      this.startClosingGhosts(state, closingGhostTargets, folderRect, geometry.panel);
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
    this.pageTrack.visible = !this.hasActiveIconGhosts();
    return geometry;
  }

  hasActiveIconGhosts() {
    return Boolean(this.openingGhostKeys?.size || this.closingGhostKeys?.size);
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
    const maxDelay = (targets || []).reduce((delay, target) =>
      Math.max(delay, getGridGhostDelay(target.index, target.columnCount, 0.16)), 0);
    const timeoutMs = Math.round((maxDelay + folderCloseDuration) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    this.closingGhostRevealTimer = globalThis.setTimeout?.(() => {
      this.closingGhostRevealTimer = null;
      if (this.closingGhostKeys?.size) this.clearClosingGhosts();
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
    this.clearFrameGhost();
    this.pageTrack.visible = true;
    this.revealIconNodes();
    this.rebuildPageTrackMask();
    const ghosts = this.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killTweensDeep(ghost);
      ghost.destroy?.({ children: true });
    }
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
    this.panelMaterial.visible = true;
    this.panelMaterial.alpha = options.panelMaterialAlpha ?? 1;
  }

  drawFrameGhost(rect) {
    this.frameGhost.clear()
      .roundRect(rect.left, rect.top, rect.width, rect.height, rect.radius)
      .fill({ color: 0xf7f8ff, alpha: rect.fillAlpha })
      .stroke({ color: 0xffffff, alpha: rect.strokeAlpha, width: 1 });
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
    this.panelMaterial.visible = true;
    this.panelMaterial.alpha = options.panelMaterialFromAlpha ?? 0;
    this.frameGhost.visible = true;
    this.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
    const frame = {
      fillAlpha: options.fromFillAlpha ?? 0.22,
      height: fromRect.height,
      left: fromRect.left,
      radius: options.fromRadius ?? getFrameRadius(fromRect),
      strokeAlpha: options.fromStrokeAlpha ?? 0.26,
      top: fromRect.top,
      width: fromRect.width,
    };
    this.frameGhostState = frame;
    this.drawFrameGhost(frame);
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
      radius: options.toRadius ?? getFrameRadius(toRect, 48),
      strokeAlpha: options.toStrokeAlpha ?? 0.24,
      top: toRect.top,
      width: toRect.width,
      onUpdate: () => this.drawFrameGhost(frame),
      onComplete: () => this.clearFrameGhost({ panelMaterialAlpha: options.panelMaterialFinalAlpha ?? 1 }),
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
        launchTargetStatus: null,
        opening: false,
        removable: false,
        selected: false,
        source: { type: "folder-open-ghost", pageIndex: state.folderPageIndex },
        textless: state.isTextlessMode,
      });
      const sourceRect = makeLocalRect(target.sourceRect, state.stageRect);
      const labelOffset = state.isTextlessMode ? 0 : 14;
      const scale = Math.max(0.16, target.sourceRect.width / Math.max(1, target.iconSize));
      const fromX = sourceRect.left + sourceRect.width / 2;
      const fromY = sourceRect.top + sourceRect.height / 2 + labelOffset * scale;
      const toX = target.targetRect.left + target.targetRect.width / 2;
      const toY = target.targetRect.top + target.targetRect.height / 2 + labelOffset;
      const delay = getGridGhostDelay(target.index, target.columnCount, 0.18);
      const labelDelay = delay + folderOpenGhostDuration * 0.58;
      ghost.position.set(fromX, fromY);
      ghost.scale.set(scale);
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
        onComplete: () => {
          this.openingGhostKeys.delete(target.item.id);
          const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
          if (controllerGhostKey) state.completeFolderOpenIconGhost?.(controllerGhostKey);
          this.finishIconGhostTransition();
          killTweensDeep(ghost);
          ghost.destroy({ children: true });
        },
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

  startClosingGhosts(state, targets, folderRect, panelRect) {
    this.clearOpeningGhosts();
    this.clearClosingGhosts();
    this.closingGhostFolderId = state.renderedFolder?.id || null;
    this.closingGhostKeys = new Set();
    const usableTargets = (targets || []).filter((target) => target.sourceRect && target.targetRect);
    if (!usableTargets.length) return;
    this.startFrameGhost(panelRect, makeLocalRect(folderRect, state.stageRect), {
      duration: folderPanelCloseDuration,
      ease: folderCloseEase,
      fromFillAlpha: 0.26,
      fromRadius: 48,
      fromStrokeAlpha: 0.24,
      panelMaterialFinalAlpha: 0,
      panelMaterialFromAlpha: 1,
      panelMaterialToAlpha: 0,
      toFillAlpha: 0.22,
      toRadius: getFrameRadius(folderRect),
      toStrokeAlpha: 0.26,
    });

    this.pageTrack.visible = false;
    this.scheduleClosingGhostRevealFallback(usableTargets);
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
        launchTargetStatus: null,
        opening: false,
        removable: false,
        selected: false,
        source: { type: "folder-close-ghost", pageIndex: state.folderPageIndex },
        textless: state.isTextlessMode,
      });
      const sourceRect = makeLocalRect(target.sourceRect, state.stageRect);
      const targetRect = makeLocalRect(target.targetRect, state.stageRect);
      const labelOffset = state.isTextlessMode ? 0 : 14;
      const scale = Math.max(0.14, target.targetRect.width / Math.max(1, target.iconSize));
      const fromX = sourceRect.left + sourceRect.width / 2;
      const fromY = sourceRect.top + sourceRect.height / 2 + labelOffset;
      const toX = targetRect.left + targetRect.width / 2;
      const toY = targetRect.top + targetRect.height / 2 + labelOffset * scale;
      const delay = getGridGhostDelay(target.index, target.columnCount, 0.16);
      ghost.position.set(fromX, fromY);
      ghost.scale.set(1);
      if (ghost.labelText?.visible) {
        gsap.to(ghost.labelText, { alpha: 0, delay, duration: 0.1, ease: "power2.in" });
        gsap.to(ghost.labelText.scale, { x: 0.94, y: 0.94, delay, duration: 0.1, ease: "power2.in" });
      }
      this.closingGhostLayer.addChild(ghost);
      this.closingGhostKeys.add(target.item.id);
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      gsap.to(ghost, {
        alpha: 0,
        delay,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        x: toX,
        y: toY,
        onComplete: () => {
          this.closingGhostKeys.delete(target.item.id);
          const controllerGhostKey = target.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target.item.id, target.index);
          if (controllerGhostKey) state.completeFolderCloseIconGhost?.(controllerGhostKey);
          this.finishIconGhostTransition();
          killTweensDeep(ghost);
          ghost.destroy({ children: true });
        },
      });
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
    }

    if (isClosing && sourceRect) {
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

    gsap.to(this.panel, {
      alpha: isClosing ? 0 : 1,
      duration: folderOpenDuration,
      ease: folderOpenEase,
      overwrite: "auto",
    });
    if (isClosing) {
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      gsap.to(this.panel, { duration: folderOpenDuration, ease: folderOpenEase, overwrite: "auto", x: targetX, y: targetY });
      gsap.to(this.panel.scale, { duration: folderOpenDuration, ease: folderOpenEase, overwrite: "auto", x: 1.08, y: 1.08 });
      return;
    }

    gsap.killTweensOf(this.panel, "x,y");
    gsap.killTweensOf(this.panel.scale, "x,y");
    springTo(this.panel, "x", targetX, panelSpring);
    springTo(this.panel, "y", targetY, panelSpring);
    springTo(this.panel.scale, "x", 1, panelSpring);
    springTo(this.panel.scale, "y", 1, panelSpring);
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
    const x = native.clientX - this.stageRect.left;
    const y = native.clientY - this.stageRect.top;
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
