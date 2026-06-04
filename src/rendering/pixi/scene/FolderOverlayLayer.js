import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { folderCloseDuration, folderCloseEase, folderOpenDuration, folderOpenEase, layoutDuration, layoutEase } from "../animation/eases.js";
import { pageTrackSpring, springTo, stopTargetSprings } from "../animation/springMotion.js";
import { getFolderGridMetrics, getFolderPanelGeometry, getGridSlotRect, parseRepeatCount, readPx } from "../geometry/gridGeometry.js";
import { makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import { getFolderPreviewChildBounds, getTopLevelIconBounds, registerLaunchIconBounds } from "../geometry/iconBoundsRegistry.js";
import { IconNode } from "../nodes/IconNode.js";

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

function makePreviewSlotRect(folderRect, slotIndex) {
  if (!folderRect) return null;
  const safeIndex = Math.max(0, Number(slotIndex) || 0);
  const size = Math.max(8, folderRect.width * 0.25);
  const gap = Math.max(2, folderRect.width * 0.045);
  const start = -((size * 3 + gap * 2) / 2) + size / 2;
  const col = safeIndex % 3;
  const row = Math.floor(safeIndex / 3) % 3;
  const centerX = folderRect.left + folderRect.width / 2 + start + col * (size + gap);
  const centerY = folderRect.top + folderRect.height / 2 + start + row * (size + gap);
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

export class FolderOverlayLayer extends Container {
  constructor(options = {}) {
    super();
    this.panel = new Container();
    this.panelMaterial = new Graphics();
    this.pageMask = new Graphics();
    this.pageTrack = new Container();
    this.openingGhostLayer = new Container();
    this.closingGhostLayer = new Container();
    this.folderTitle = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 18, fontWeight: "620", fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.iconNodes = new Map();
    this.onIconAction = options.onIconAction || (() => {});
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => {});
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
    const iconSize = Math.min(readPx(state.folderPanelStyle?.["--folder-icon-size"], state.iconSize), 56);
    const metrics = getFolderGridMetrics({ cols, grid: geometry.grid, rowGap, rows });
    const localGridLeft = geometry.grid.left - geometry.panel.left;
    const localGridTop = geometry.grid.top - geometry.panel.top;
    const localMetrics = { ...metrics, gridLeft: localGridLeft, gridTop: localGridTop };
    this.pageMask.clear()
      .rect(localGridLeft, localGridTop, geometry.grid.width, Math.max(geometry.grid.height, geometry.panel.height - localGridTop - 20))
      .fill({ color: 0xffffff, alpha: 1 });
    const targetTrackX = -state.folderPageIndex * geometry.grid.width;
    springTo(this.pageTrack, "x", targetTrackX, pageTrackSpring);

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
            this.closingGhostKeys?.has(item.id) ||
            state.isFolderOpeningIconGhosted?.(state.renderedFolder.id, item.id) ||
            state.isFolderClosingIconGhosted?.(state.renderedFolder.id, item.id)),
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
        if (isInteractivePage && isNewFolder && !isClosing && pageIndex === state.folderPageIndex && index < 9) {
          openingGhostTargets.push({
            cellHeight: slot.height,
            cellWidth: slot.width,
            iconSize,
            index,
            item,
            targetX: geometry.panel.left + x + this.pageTrack.x,
            targetY: geometry.panel.top + y - (state.isTextlessMode ? 0 : 14),
          });
        }
        if (isInteractivePage && state.isFolderClosing && pageIndex === state.folderPageIndex) {
          const folderRect = getTopLevelIconBounds(state.renderedFolder.id);
          closingGhostTargets.push({
            cellHeight: slot.height,
            cellWidth: slot.width,
            iconSize,
            index,
            item,
            sourceRect: iconBounds,
            targetRect: getFolderPreviewChildBounds(state.renderedFolder.id, item.id, index) || makePreviewSlotRect(folderRect, index),
          });
        }
      });
    });

    if (isNewFolder && !isClosing) this.startOpeningGhosts(state, openingGhostTargets);
    if (state.isFolderClosing && this.closingGhostFolderId !== state.renderedFolder.id) {
      this.startClosingGhosts(state, closingGhostTargets);
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
    return geometry;
  }

  clearOpeningGhosts() {
    this.openingGhostKeys?.clear();
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
    const ghosts = this.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      gsap.killTweensOf(ghost);
      gsap.killTweensOf(ghost.scale);
      ghost.destroy?.({ children: true });
    }
  }

  clearClosingGhosts() {
    this.closingGhostKeys?.clear();
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
    const ghosts = this.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      gsap.killTweensOf(ghost);
      gsap.killTweensOf(ghost.scale);
      ghost.destroy?.({ children: true });
    }
  }

  startOpeningGhosts(state, targets) {
    this.clearOpeningGhosts();
    this.openingGhostKeys = new Set();
    const usableTargets = (targets || [])
      .map((target) => ({
        ...target,
        sourceRect: getFolderPreviewChildBounds(state.renderedFolder.id, target.item.id, target.index),
      }))
      .filter((target) => target.sourceRect);

    if (!usableTargets.length) return;

    for (const target of usableTargets) {
      const ghost = new IconNode();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.setState({
        cellHeight: target.cellHeight,
        cellWidth: target.cellWidth,
        compact: true,
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
        textless: true,
      });
      const fromX = target.sourceRect.left - state.stageRect.left + target.sourceRect.width / 2;
      const fromY = target.sourceRect.top - state.stageRect.top + target.sourceRect.height / 2;
      const toX = target.targetX;
      const toY = target.targetY;
      const scale = Math.max(0.16, target.sourceRect.width / Math.max(1, target.iconSize));
      ghost.position.set(fromX, fromY);
      ghost.scale.set(scale);
      this.openingGhostLayer.addChild(ghost);
      this.openingGhostKeys.add(target.item.id);
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      gsap.to(ghost, {
        alpha: 1,
        duration: folderOpenDuration,
        ease: folderOpenEase,
        x: toX,
        y: toY,
        delay: Math.min(0.16, target.index * 0.018),
        onComplete: () => {
          this.openingGhostKeys.delete(target.item.id);
          for (const node of this.iconNodes.values()) {
            if (node.item?.id === target.item.id) {
              node.visible = true;
              node.alpha = 1;
            }
          }
          ghost.destroy({ children: true });
        },
      });
      gsap.to(ghost.scale, {
        duration: folderOpenDuration,
        ease: folderOpenEase,
        x: 1,
        y: 1,
        delay: Math.min(0.16, target.index * 0.018),
      });
    }
  }

  startClosingGhosts(state, targets) {
    this.clearOpeningGhosts();
    this.clearClosingGhosts();
    this.closingGhostFolderId = state.renderedFolder?.id || null;
    this.closingGhostKeys = new Set();
    const usableTargets = (targets || []).filter((target) => target.sourceRect && target.targetRect);
    if (!usableTargets.length) return;

    for (const target of usableTargets) {
      const ghost = new IconNode();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.setState({
        cellHeight: target.cellHeight,
        cellWidth: target.cellWidth,
        compact: true,
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
        textless: true,
      });
      const fromX = target.sourceRect.left - state.stageRect.left + target.sourceRect.width / 2;
      const fromY = target.sourceRect.top - state.stageRect.top + target.sourceRect.height / 2;
      const toX = target.targetRect.left - state.stageRect.left + target.targetRect.width / 2;
      const toY = target.targetRect.top - state.stageRect.top + target.targetRect.height / 2;
      const scale = Math.max(0.14, target.targetRect.width / Math.max(1, target.iconSize));
      const delay = Math.min(0.16, target.index * 0.014);
      ghost.position.set(fromX, fromY);
      ghost.scale.set(1);
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
      gsap.to(this.panel, {
        alpha: state.isFolderAppLaunchClosing ? 0 : 0.8,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        overwrite: "auto",
        x: sourceRect.left - state.stageRect.left + sourceRect.width / 2,
        y: sourceRect.top - state.stageRect.top + sourceRect.height / 2,
      });
      gsap.to(this.panel.scale, {
        duration: folderCloseDuration,
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
      x: targetX,
      y: targetY,
    });
    gsap.to(this.panel.scale, {
      duration: folderOpenDuration,
      ease: folderOpenEase,
      overwrite: "auto",
      x: isClosing ? 1.08 : 1,
      y: isClosing ? 1.08 : 1,
    });
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
    stopTargetSprings(this.pageTrack);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
