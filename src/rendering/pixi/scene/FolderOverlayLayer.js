import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import {
  folderCloseEase,
  folderOpenDuration,
  folderOpenEase,
  folderPanelCloseDuration,
} from "../animation/eases.js";
import { pageTrackSpring, panelSpring, springTo, stopTargetSprings } from "../animation/springMotion.js";
import { getFolderGridMetrics, getFolderPanelGeometry, parseRepeatCount, readPx } from "../geometry/gridGeometry.js";
import {
  clearFrameGhost as clearFrameGhostState,
  drawClosingFrameMask as drawClosingFrameMaskState,
  drawFrameGhost as drawFrameGhostState,
  enableClosingFrameMask as enableClosingFrameMaskState,
  ensureClosingFrameMaskState,
  getFrameRadius,
  startFrameGhost as startFrameGhostState,
} from "./folderFrameGhost.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { makeStageLocalPoint, makeStageLocalRect, makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import {
  clearLaunchIconBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { getFolderPageMaskRect, makePanelVisualRect } from "./folderOverlayGeometry.js";
import { makeFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import {
  getStableFolderCloseRects,
  makeClosingGhostTarget,
  makeOpeningGhostTarget,
} from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";
import { makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";

function isPointInRect(x, y, rect) {
  return Boolean(rect) &&
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function registerFolderIconNodeBounds(options) {
  const {
    folderId,
    iconSize,
    index,
    isInteractivePage,
    isPrewarm,
    item,
    node,
    pageIndex,
    stageHeight,
    stageRect,
    stageWidth,
    targetCenter,
  } = options;
  const iconBounds = node.getIconBounds(stageRect);
  if (!isInteractivePage || isPrewarm) return iconBounds;
  const meta = { area: "folder", folderId, id: item.id, index, item, pageIndex };
  registerLaunchIconBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    iconBounds,
    meta
  );
  registerLaunchIconTargetBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    makeTargetIconBounds(stageRect, stageWidth, stageHeight, targetCenter.x, targetCenter.y, iconSize),
    meta
  );
  return iconBounds;
}

function springFolderIconLayoutPosition(node, target, refreshBounds) {
  springTo(node, "x", target.x, pageTrackSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
  springTo(node, "y", target.y, pageTrackSpring, { onComplete: refreshBounds, onUpdate: refreshBounds });
}

function springPanelGeometry(panel, target, options = {}) {
  const springOptions = options.onFrame ? { onComplete: options.onFrame, onUpdate: options.onFrame } : {};
  springTo(panel, "x", target.x, panelSpring, springOptions);
  springTo(panel, "y", target.y, panelSpring, springOptions);
  springTo(panel.scale, "x", target.scaleX, panelSpring, springOptions);
  springTo(panel.scale, "y", target.scaleY, panelSpring, springOptions);
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
    this.onIconAction = options.onIconAction || (() => { });
    this.onInternalActivityChange = options.onInternalActivityChange || (() => { });
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => { });
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => { });
    this.onTitleFrameChange = options.onTitleFrameChange || (() => { });
    this.showFolderTitle = options.showFolderTitle === true;
    this.openingGhosts = new FolderOpeningGhostController(this, {
      ghostFactory: () => new IconNode(),
    });
    this.closingPreviewSwap = new FolderClosingPreviewSwapController(this, {
      containerFactory: () => new Container(),
      getIconTexture: (item, render, ghost) => getCachedIconTexture(item, render, ghost),
      graphicsFactory: () => new Graphics(),
      spriteFactory: () => new Sprite(),
      textFactory: (size) => new Text({ text: "", style: { align: "center", fill: 0xffffff, fontSize: size, lineHeight: size } }),
    });
    this.closingGhosts = new FolderClosingGhostController(this, {
      ghostFactory: () => new IconNode(),
      previewSwap: this.closingPreviewSwap,
    });
    this.openingGhostRevealTimer = null;
    this.closingHandoffCleanupFrame = null;
    this.closingHandoffCleanupToken = 0;
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
    const isPrewarm = Boolean(state.prewarm);
    if (!isPrewarm) clearLaunchIconBounds("folder");
    const keepClosingHandoff = this.closingGhosts.hasPendingHandoff();
    this.visible = Boolean(state.renderedFolder) || keepClosingHandoff;
    if (!state.renderedFolder) {
      if (keepClosingHandoff) {
        this.panel.visible = false;
        this.pageTrack.visible = false;
        return null;
      }
      this.currentFolderId = null;
      this.isClosing = false;
      this.isUserFolderClosing = false;
      this.sizeKey = null;
      stopTargetSprings(this.pageTrack);
      stopTargetSprings(this.panel);
      stopTargetSprings(this.panel.scale);
      this.openingGhosts.clear();
      this.closingGhosts.clear();
      this.stableFolderCloseTarget = null;
      if (state.folderPanelRef) state.folderPanelRef.value = null;
      if (state.folderViewportRef) state.folderViewportRef.value = null;
      this.notifyTitleFrame(null);
      return null;
    }
    this.panel.visible = true;
    this.closingPreviewSwap.ensureLayer();
    ensureClosingFrameMaskState(this);
    this.hitArea = new Rectangle(0, 0, state.width, state.height);
    const sizeKey = `${state.width}x${state.height}`;
    if (this.sizeKey && this.sizeKey !== sizeKey) {
      this.openingGhosts.clear();
      this.closingGhosts.clear();
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
    const isNewFolder = !isPrewarm && this.currentFolderId !== state.renderedFolder?.id;
    this.isClosing = isClosing;
    this.isUserFolderClosing = Boolean(state.isFolderClosing);
    this.panelGeometry = geometry.panel;
    const folderId = state.renderedFolder.id;
    const overlayTargets = resolveFolderOverlayTargets({
      folder: state.renderedFolder,
      folderOpeningOriginBounds: state.folderOpeningOriginBounds,
      folderPageSize: state.folderPageSize,
      isClosing,
      previousStableFolderCloseTarget: this.stableFolderCloseTarget,
      wasClosing,
    });
    this.stableFolderCloseTarget = overlayTargets.stableFolderCloseTarget;
    const { folderRect, folderThumbRect, getOpeningPreviewChildRect, previewSlots } = overlayTargets;
    this.drawPanel(geometry.panel);
    this.panel.pivot.set(geometry.panel.width / 2, geometry.panel.height / 2);
    const targetX = geometry.panel.left + geometry.panel.width / 2;
    const targetY = geometry.panel.top + geometry.panel.height / 2;
    if (isPrewarm) {
      this.currentFolderId = state.renderedFolder?.id;
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      this.panel.alpha = 1;
      this.panelTitleOpening = false;
    } else {
      this.animatePanel(state, targetX, targetY, geometry.panel, folderRect);
    }

    this.folderTitle.text = state.renderedFolder.name || "新文件夹";
    this.folderTitle.visible = this.showFolderTitle;
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
    const { closeIconRect, closeThumbRect } = getStableFolderCloseRects({
      folderId,
      folderRect,
      folderThumbRect,
      isClosing,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
    });

    if (!isPrewarm) this.bindFakeRefs(state, geometry);
    const seen = new Set();
    const openingGhostTargets = [];
    const closingGhostTargets = [];
    const renderPlan = makeFolderOverlayRenderPlan({
      closeThumbRect,
      closingGhostKeys: this.closingGhostKeys,
      cols,
      dragMeta: state.dragMeta,
      dragReleaseGhostId: state.dragReleaseGhostId,
      folderCloseIconGhosts: state.folderCloseIconGhosts,
      folderId,
      folderOpenIconGhosts: state.folderOpenIconGhosts,
      folderPageIndex: state.folderPageIndex,
      folderPages: state.folderPages,
      folderPageSize: state.folderPageSize,
      geometry,
      getFolderPageRenderMode: state.getFolderPageRenderMode,
      getVisibleFolderPage: state.getVisibleFolderPage,
      iconSize,
      isClosing,
      isEditMode: state.isEditMode,
      isFolderClosing: state.isFolderClosing,
      isIconOpening: state.isIconOpening,
      isIconSelected: state.isIconSelected,
      isNewFolder,
      isTextlessMode: state.isTextlessMode,
      launchTargetStatusById: state.launchTargetStatusById,
      localMetrics,
      openingGhostKeys: this.openingGhostKeys,
      previewSlots,
      rows,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
      stageHeight: state.height,
      stageWidth: state.width,
      targetTrackX,
    });

    for (const entry of renderPlan.entries) {
      const { index, isInteractivePage, item, key, nodeState, pageIndex, targetCenter, x, y } = entry;
      seen.add(key);
      let node = this.iconNodes.get(key);
      const isNewNode = !node;
      if (!node) {
        node = new IconNode({
          onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
            this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
        });
        node.alpha = 0;
        node.position.set(x, y + 10);
        this.iconNodes.set(key, node);
        this.pageTrack.addChild(node);
      }

      node.stageRect = state.stageRect;
      node.setState(nodeState);

      const refreshNodeBounds = () => registerFolderIconNodeBounds({
        folderId: state.renderedFolder.id,
        iconSize,
        index,
        isInteractivePage,
        isPrewarm,
        item,
        node,
        pageIndex,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
        targetCenter,
      });
      const iconBounds = refreshNodeBounds();
      if (isNewNode) {
        gsap.to(node, { alpha: 1, delay: Math.min(0.18, index * 0.012), duration: 0.24, ease: folderOpenEase });
      }
      springFolderIconLayoutPosition(node, { x, y }, refreshNodeBounds);
      if (entry.openingGhostInput) {
        openingGhostTargets.push(makeOpeningGhostTarget({
          ...entry.openingGhostInput,
          folderRect,
          getPreviewChildRect: getOpeningPreviewChildRect,
        }));
      }
      if (entry.closingGhostInput) {
        closingGhostTargets.push(makeClosingGhostTarget({
          ...entry.closingGhostInput,
          closeThumbRect,
          iconBounds,
          stableFolderCloseTarget: this.stableFolderCloseTarget,
        }));
      }
    }

    const closingPreviewSwapTargets = renderPlan.closingPreviewSwapTargets;
    if (isNewFolder && !isClosing) this.openingGhosts.start(state, openingGhostTargets, folderRect, geometry.panel);
    if (!isNewFolder && !isClosing && state.folderOpenIconGhosts?.length && !this.openingGhostKeys?.size) {
      for (const ghost of state.folderOpenIconGhosts) {
        if (ghost?.key) state.completeFolderOpenIconGhost?.(ghost.key);
      }
    }
    if (state.isFolderClosing && this.closingGhostFolderId !== folderId) {
      const closeFrameRect = this.getPanelVisualRect(geometry.panel) || geometry.panel;
      this.closingGhosts.start(state, closingGhostTargets, closeThumbRect, closeFrameRect, {
        handoffRect: closeIconRect,
        handoffTarget: this.stableFolderCloseTarget,
        previewSwapTargets: closingPreviewSwapTargets,
      });
    }
    if (!state.isFolderClosing && this.closingGhostFolderId) {
      this.closingGhostFolderId = null;
      this.closingGhosts.clear();
    }

    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      gsap.killTweensOf(node);
      stopTargetSprings(node);
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

  hasActiveIconGhosts() {
    return Boolean(this.openingGhostKeys?.size || this.closingGhosts.hasActive());
  }

  setClosingHandoffActive(active) {
    const next = Boolean(active);
    if (this.closingHandoffActive === next) return;
    this.closingHandoffActive = next;
    this.onInternalActivityChange(next, next ? this.closingGhostFolderId || this.currentFolderId || null : null);
  }

  revealIconNodes() {
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
  }

  clearFrameGhost(options = {}) {
    clearFrameGhostState(this, options);
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

  getPanelVisualRect(panelRect) {
    return makePanelVisualRect(this.panel, panelRect, {
      progress: this.getPanelTitleProgress(),
      radius: 48,
    });
  }

  notifyPanelTitleFrame(panelRect) {
    if (!panelRect) {
      this.notifyTitleFrame(null);
      return;
    }
    this.notifyTitleFrame(this.getPanelVisualRect(panelRect));
  }

  enableClosingFrameMask() {
    enableClosingFrameMaskState(this);
  }

  drawClosingFrameMask(rect) {
    drawClosingFrameMaskState(this, rect);
  }

  drawFrameGhost(rect, options = {}) {
    drawFrameGhostState(this, rect, options);
  }

  startFrameGhost(fromRect, toRect, options = {}) {
    startFrameGhostState(this, fromRect, toRect, options);
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

  animatePanel(state, targetX, targetY, panelRect, sourceRect = null) {
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    if (this.currentFolderId !== state.renderedFolder?.id) {
      this.currentFolderId = state.renderedFolder?.id;
      if (sourceRect) {
        const sourceLocalRect = makeStageLocalRect(sourceRect, state.stageRect);
        this.panel.position.set(sourceLocalRect.left + sourceLocalRect.width / 2, sourceLocalRect.top + sourceLocalRect.height / 2);
        this.panel.scale.set(Math.max(0.08, sourceLocalRect.width / panelRect.width), Math.max(0.08, sourceLocalRect.height / panelRect.height));
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
      gsap.killTweensOf(this.panel, "x,y");
      gsap.killTweensOf(this.panel.scale, "x,y");
      const sourceLocalRect = makeStageLocalRect(sourceRect, state.stageRect);
      gsap.to(this.panel, {
        alpha: state.isFolderAppLaunchClosing ? 0 : 0.8,
        duration: folderPanelCloseDuration,
        ease: folderCloseEase,
        overwrite: "auto",
      });
      springPanelGeometry(this.panel, {
        scaleX: Math.max(0.08, sourceLocalRect.width / panelRect.width),
        scaleY: Math.max(0.08, sourceLocalRect.height / panelRect.height),
        x: sourceLocalRect.left + sourceLocalRect.width / 2,
        y: sourceLocalRect.top + sourceLocalRect.height / 2,
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
      gsap.killTweensOf(this.panel, "x,y");
      gsap.killTweensOf(this.panel.scale, "x,y");
      springPanelGeometry(this.panel, {
        scaleX: 1.08,
        scaleY: 1.08,
        x: targetX,
        y: targetY,
      });
      return;
    }

    gsap.killTweensOf(this.panel, "x,y");
    gsap.killTweensOf(this.panel.scale, "x,y");
    springPanelGeometry(this.panel, {
      scaleX: 1,
      scaleY: 1,
      x: targetX,
      y: targetY,
    }, { onFrame: notifyPanelTitleFrame });
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

    const localPoint = makeStageLocalPoint({ x: clientX, y: clientY }, this.stageRect) || { x: 0, y: 0 };
    const { x, y } = localPoint;
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
    this.openingGhosts.clear();
    this.closingGhosts.clear();
    killAllMotion(this.panel);
    killAllMotion(this.pageTrack);
    if (this.frameGhostState) gsap.killTweensOf(this.frameGhostState);
    stopTargetSprings(this.pageTrack);
    stopTargetSprings(this.panel);
    stopTargetSprings(this.panel.scale);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
