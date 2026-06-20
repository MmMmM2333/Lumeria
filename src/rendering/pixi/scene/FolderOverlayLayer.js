import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, transition } from "../animation/motionTween.js";
import { pageTrackSpring, panelSpring, stopTargetSprings } from "../animation/springMotion.js";
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
import {
  applyClosingHandoffOnlyOverlayState,
  applyClosingPresentationOverlayState,
  getClosingPresentationStageHitRects,
} from "./folderClosingHandoff.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect, makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import {
  clearLaunchIconBounds,
  registerLiveClientLaunchIconTargetBounds,
  registerRenderedClientLaunchIconBounds,
  registerStableStageLayoutLaunchIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import {
  FOLDER_PAGE_DOTS_GAP,
  FOLDER_PAGE_DOTS_HIT_HEIGHT,
  FOLDER_PAGE_DOTS_SIZE,
  getFolderPageDotsFrame,
  getFolderPageDotVisualState,
  getFolderPageMaskRect,
  makePanelVisualRect,
} from "./folderOverlayGeometry.js";
import { makeFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import {
  getStableFolderCloseRects,
  makeClosingGhostTarget,
  makeOpeningGhostTarget,
} from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";
import { makeIconRect, makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";

const PAGE_DOT_BLEND_DURATION = 0.08;
const PAGE_DOT_BLEND_EASE = "power2.out";
const FOLDER_ICON_EXIT_REASON = "folder-icon-exit";
const FOLDER_OVERLAY_CLEAR_REASON = "folder-overlay-clear";
const FOLDER_PAGE_TRACK_REPLACE_REASON = "folder-page-track-replace";
const FOLDER_PANEL_CLOSE_REASON = "folder-panel-close";
const FOLDER_PANEL_HANDOFF_SNAP_REASON = "folder-panel-handoff-snap";
const FOLDER_PANEL_OPEN_REASON = "folder-panel-open";

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
  registerRenderedClientLaunchIconBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    iconBounds,
    meta
  );
  registerLiveClientLaunchIconTargetBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    makeTargetIconBounds(stageRect, stageWidth, stageHeight, targetCenter.x, targetCenter.y, iconSize),
    meta
  );
  registerStableStageLayoutLaunchIconTargetBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    makeIconRect(targetCenter.x, targetCenter.y, iconSize),
    {
      ...meta,
      stageHeight,
      stageRect,
      stageWidth,
    }
  );
  return iconBounds;
}

function springFolderIconLayoutPosition(node, target, refreshBounds) {
  transition(node)
    .layout()
    .spring(pageTrackSpring)
    .interrupt("retarget")
    .to({
      onComplete: refreshBounds,
      onUpdate: refreshBounds,
      x: target.x,
      y: target.y,
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

function springPanelGeometry(panel, target, options = {}) {
  const springOptions = options.onFrame ? { onComplete: options.onFrame, onUpdate: options.onFrame } : {};
  transitionSpringTo(panel, { x: target.x, y: target.y }, panelSpring, springOptions);
  transitionSpringTo(panel.scale, { x: target.scaleX, y: target.scaleY }, panelSpring, springOptions);
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
    this.pageTrackMotion = createPageTrackMotionState();
    this.pageDotsLayer = new Container();
    this.openingGhostLayer = new Container();
    this.closingGhostLayer = new Container();
    this.closingPreviewSwapLayer = new Container();
    this.folderTitle = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 18, fontWeight: "620", fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.iconNodes = new Map();
    this.iconBoundsRefreshers = new Map();
    this.openingGhostBoundsRefreshers = new Map();
    this.registeredBoundsDirty = false;
    this.registeredBoundsFlushQueued = false;
    this.onIconAction = options.onIconAction || (() => { });
    this.onClosingHandoffReady = options.onClosingHandoffReady || (() => { });
    this.onClosingHandoffVisualRelease = options.onClosingHandoffVisualRelease || (() => { });
    this.onInternalActivityChange = options.onInternalActivityChange || (() => { });
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => { });
    this.onPanelPointerDown = options.onPanelPointerDown || (() => { });
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
    this.addChild(this.pageDotsLayer);
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
      this.clearRegisteredIconBounds();
      if (keepClosingHandoff) {
        return applyClosingHandoffOnlyOverlayState(this);
      }
      this.currentFolderId = null;
      this.isClosing = false;
      this.isUserFolderClosing = false;
      this.sizeKey = null;
      cancelPageTrackMotion(this.pageTrackMotion, "cleanup");
      stopTargetSprings(this.pageTrack, { reason: FOLDER_OVERLAY_CLEAR_REASON });
      this.clearPageDots();
      stopTargetSprings(this.panel, { reason: FOLDER_OVERLAY_CLEAR_REASON });
      stopTargetSprings(this.panel.scale, { reason: FOLDER_OVERLAY_CLEAR_REASON });
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
    const { folderClientRect, folderThumbClientRect, getOpeningPreviewChildClientRect, previewSlots } = overlayTargets;
    this.drawPanel(geometry.panel);
    this.updatePageDots(state, geometry);
    if (isClosing) applyClosingPresentationOverlayState(this);
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
      this.animatePanel(state, targetX, targetY, geometry.panel, folderClientRect);
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
      cancelPageTrackMotion(this.pageTrackMotion, "replace");
      stopTargetSprings(this.pageTrack, { reason: FOLDER_PAGE_TRACK_REPLACE_REASON });
      this.pageTrack.x = targetTrackX;
    } else {
      const markBoundsDirty = () => this.markRegisteredBoundsDirty();
      updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
        onFrame: markBoundsDirty,
        pageIndex: state.folderPageIndex,
        pageSpan: geometry.grid.width,
        scrub: state.folderPageTrackScrub,
        springConfig: pageTrackSpring,
      });
    }
    const { closeIconRect, closeThumbRect } = getStableFolderCloseRects({
      folderId,
      folderRect: folderClientRect,
      folderThumbRect: folderThumbClientRect,
      isClosing,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
    });

    if (!isPrewarm) this.bindFakeRefs(state, geometry);
    const seen = new Set();
    const boundsRefreshers = new Map();
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
      if (isInteractivePage && !isPrewarm) boundsRefreshers.set(key, refreshNodeBounds);
      if (isNewNode) {
        transition(node)
          .preset("folderOpen", { delay: Math.min(0.18, index * 0.012), duration: 0.24 })
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 1 })
          .start();
      }
      springFolderIconLayoutPosition(node, { x, y }, refreshNodeBounds);
      if (entry.openingGhostInput) {
        openingGhostTargets.push(makeOpeningGhostTarget({
          ...entry.openingGhostInput,
          folderId,
          folderRect: folderClientRect,
          getPreviewChildRect: getOpeningPreviewChildClientRect,
          pageIndex,
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
    this.iconBoundsRefreshers = boundsRefreshers;
    if (isNewFolder && !isClosing) this.openingGhosts.start(state, openingGhostTargets, folderClientRect, geometry.panel);
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
      killMotionOf(node, null, { reason: FOLDER_ICON_EXIT_REASON });
      stopTargetSprings(node, { reason: FOLDER_ICON_EXIT_REASON });
      transition(node)
        .preset("fade", { duration: 0.14 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0, onComplete: () => node.destroy({ children: true }) })
        .start();
    }
    this.pageTrack.visible = !state.isFolderClosing &&
      !this.openingGhostKeys?.size &&
      !this.closingGhostKeys?.size &&
      !this.closingPreviewSwapKeys?.size;
    if (!this.frameGhostState) {
      if (!isClosing) this.notifyPanelTitleFrame(geometry.panel);
      else this.notifyTitleFrame(geometry.panel);
    }
    this.refreshRegisteredIconBounds();
    return geometry;
  }

  clearRegisteredIconBounds() {
    this.iconBoundsRefreshers?.clear();
    this.openingGhostBoundsRefreshers?.clear();
  }

  refreshRegisteredIconBounds() {
    let count = 0;
    for (const refreshBounds of this.iconBoundsRefreshers?.values() || []) {
      refreshBounds?.();
      count += 1;
    }
    for (const refreshBounds of this.openingGhostBoundsRefreshers?.values() || []) {
      refreshBounds?.();
      count += 1;
    }
    return count;
  }

  markRegisteredBoundsDirty() {
    this.registeredBoundsDirty = true;
    if (this.registeredBoundsFlushQueued) return;
    this.registeredBoundsFlushQueued = true;
    const flush = () => {
      this.registeredBoundsFlushQueued = false;
      this.flushRegisteredIconBounds();
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

  flushRegisteredIconBounds(options = {}) {
    if (!options.force && !this.registeredBoundsDirty) return 0;
    this.registeredBoundsDirty = false;
    return this.refreshRegisteredIconBounds();
  }

  registerOpeningGhostBounds(state, target, ghost) {
    const rect = target?.targetStageLayoutRect;
    const item = target?.item;
    if (!rect || !item?.id || !target?.folderId) return null;
    return registerFolderIconNodeBounds({
      folderId: target.folderId,
      iconSize: target.iconSize,
      index: target.index,
      isInteractivePage: true,
      isPrewarm: false,
      item,
      node: ghost,
      pageIndex: target.pageIndex ?? state.folderPageIndex ?? 0,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetCenter: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
  }

  clearPageDots() {
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = false;
    this.pageDotsLayer.eventMode = "none";
    this.pageDotsLayer.hitArea = null;
  }

  hasActiveIconGhosts() {
    return Boolean(this.openingGhostKeys?.size || this.closingGhosts.hasActive());
  }

  setClosingHandoffActive(active) {
    const next = Boolean(active);
    if (this.closingHandoffActive === next) return;
    this.closingHandoffActive = next;
    const folderId = next ? this.closingGhostFolderId || this.currentFolderId || null : null;
    if (next) this.onClosingHandoffReady(folderId);
    this.onInternalActivityChange(next, folderId);
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

  drawPageDot(dot) {
    dot.clear()
      .circle(0, 0, FOLDER_PAGE_DOTS_SIZE / 2)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  setPageDotHover(dot, active, hovered, options = {}) {
    const visual = getFolderPageDotVisualState({ active, hovered });
    this.drawPageDot(dot);
    if (options.immediate) {
      killMotionOf(dot, "alpha");
      killMotionOf(dot.scale);
      dot.alpha = visual.alpha;
      dot.scale.set(visual.scale);
      return;
    }
    transition(dot)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ alpha: visual.alpha })
      .start();
    transition(dot.scale)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ x: visual.scale, y: visual.scale })
      .start();
  }

  updatePageDots(state, geometry) {
    const pageCount = Array.isArray(state.folderPages) ? state.folderPages.length : 0;
    if (!state.folderPageDotsVisible || pageCount <= 1) {
      this.clearPageDots();
      return;
    }
    const frame = getFolderPageDotsFrame(geometry);
    if (!frame) {
      this.clearPageDots();
      return;
    }
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = true;
    this.pageDotsLayer.eventMode = "static";
    this.pageDotsLayer.cursor = "default";
    this.pageDotsLayer.hitArea = new Rectangle(frame.left, frame.top, frame.width, frame.height);
    const totalWidth = pageCount * FOLDER_PAGE_DOTS_SIZE + (pageCount - 1) * FOLDER_PAGE_DOTS_GAP;
    const startX = frame.left + frame.width / 2 - totalWidth / 2 + FOLDER_PAGE_DOTS_SIZE / 2;
    const centerY = frame.top + FOLDER_PAGE_DOTS_HIT_HEIGHT / 2;
    for (let index = 0; index < pageCount; index += 1) {
      const dot = new Graphics();
      const isActive = index === state.folderPageIndex;
      this.setPageDotHover(dot, isActive, false, { immediate: true });
      dot.position.set(startX + index * (FOLDER_PAGE_DOTS_SIZE + FOLDER_PAGE_DOTS_GAP), centerY);
      dot.eventMode = "static";
      dot.cursor = "pointer";
      dot.hitArea = new Rectangle(-8, -8, FOLDER_PAGE_DOTS_SIZE + 16, FOLDER_PAGE_DOTS_SIZE + 16);
      dot.on("pointerover", () => this.setPageDotHover(dot, isActive, true));
      dot.on("pointerout", () => this.setPageDotHover(dot, isActive, false));
      dot.on("pointerdown", (event) => {
        event.stopPropagation?.();
        state.folderPageIndexCommit?.(index);
      });
      this.pageDotsLayer.addChild(dot);
    }
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
    const markBoundsDirty = () => this.markRegisteredBoundsDirty();
    if (this.currentFolderId !== state.renderedFolder?.id) {
      this.currentFolderId = state.renderedFolder?.id;
      if (sourceRect) {
        const sourceLocalRect = clientRectToStageVisualRect(sourceRect, state.stageRect);
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
      stopTargetSprings(this.panel, { reason: FOLDER_PANEL_HANDOFF_SNAP_REASON });
      stopTargetSprings(this.panel.scale, { reason: FOLDER_PANEL_HANDOFF_SNAP_REASON });
      killMotionOf(this.panel, null, { reason: FOLDER_PANEL_HANDOFF_SNAP_REASON });
      killMotionOf(this.panel.scale, null, { reason: FOLDER_PANEL_HANDOFF_SNAP_REASON });
      this.panel.alpha = 0;
      return;
    }

    if (isClosing && sourceRect) {
      this.panelTitleOpening = false;
      stopTargetSprings(this.panel, { reason: FOLDER_PANEL_CLOSE_REASON });
      stopTargetSprings(this.panel.scale, { reason: FOLDER_PANEL_CLOSE_REASON });
      killMotionOf(this.panel, "x,y", { reason: FOLDER_PANEL_CLOSE_REASON });
      killMotionOf(this.panel.scale, "x,y", { reason: FOLDER_PANEL_CLOSE_REASON });
      const sourceLocalRect = clientRectToStageVisualRect(sourceRect, state.stageRect);
      transition(this.panel)
        .preset("folderPanelClose")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: state.isFolderAppLaunchClosing ? 0 : 0.8 })
        .start();
      springPanelGeometry(this.panel, {
        scaleX: Math.max(0.08, sourceLocalRect.width / panelRect.width),
        scaleY: Math.max(0.08, sourceLocalRect.height / panelRect.height),
        x: sourceLocalRect.left + sourceLocalRect.width / 2,
        y: sourceLocalRect.top + sourceLocalRect.height / 2,
      }, { onFrame: markBoundsDirty });
      return;
    }

    const updateOpeningPanelFrame = () => {
      this.notifyPanelTitleFrame(panelRect);
      markBoundsDirty();
    };
    transition(this.panel)
      .preset(isClosing ? "folderClose" : "folderOpen")
      .overlay()
      .interrupt("retarget")
      .to({ alpha: isClosing ? 0 : 1 })
      .start();
    if (isClosing) {
      this.panelTitleOpening = false;
      stopTargetSprings(this.panel, { reason: FOLDER_PANEL_CLOSE_REASON });
      stopTargetSprings(this.panel.scale, { reason: FOLDER_PANEL_CLOSE_REASON });
      killMotionOf(this.panel, "x,y", { reason: FOLDER_PANEL_CLOSE_REASON });
      killMotionOf(this.panel.scale, "x,y", { reason: FOLDER_PANEL_CLOSE_REASON });
      springPanelGeometry(this.panel, {
        scaleX: 1.08,
        scaleY: 1.08,
        x: targetX,
        y: targetY,
      }, { onFrame: markBoundsDirty });
      return;
    }

    killMotionOf(this.panel, "x,y", { reason: FOLDER_PANEL_OPEN_REASON });
    killMotionOf(this.panel.scale, "x,y", { reason: FOLDER_PANEL_OPEN_REASON });
    springPanelGeometry(this.panel, {
      scaleX: 1,
      scaleY: 1,
      x: targetX,
      y: targetY,
    }, { onFrame: updateOpeningPanelFrame });
    updateOpeningPanelFrame();
  }

  drawPanel(panel) {
    this.panelMaterial.clear()
      .roundRect(0, 0, panel.width, panel.height, 48)
      .fill({ color: 0xf7f8ff, alpha: 0.26 })
      .stroke({ color: 0xffffff, alpha: 0.24, width: 1 });
  }

  bindFakeRefs(state, geometry) {
    const meta = { folderId: state.renderedFolder?.id || null };
    const panelElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.panel, meta);
    const gridElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.grid, meta);
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
    const localPoint = clientPointToStageVisualPoint({ x: clientX, y: clientY }, this.stageRect) || { x: 0, y: 0 };
    const { x, y } = localPoint;
    if (this.isClosing) {
      const closeTarget = this.stableFolderCloseTarget;
      const hitRects = getClosingPresentationStageHitRects(this);
      if (this.isUserFolderClosing &&
        closeTarget?.folderId &&
        hitRects.some((rect) => isPointInRect(x, y, rect))) {
        this.onClosingFolderPointerDown(closeTarget.folderId, native);
      }
      return;
    }

    const panel = this.panelGeometry;
    if (!panel) return;
    if (x < panel.left || x > panel.left + panel.width || y < panel.top || y > panel.top + panel.height) {
      this.onOutsidePointerDown(native);
      return;
    }
    this.onPanelPointerDown(native);
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  destroy(options) {
    this.openingGhosts.clear();
    this.closingGhosts.clear();
    killAllMotion(this.panel, { reason: "destroyed" });
    killAllMotion(this.pageTrack, { reason: "destroyed" });
    this.clearPageDots();
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    stopTargetSprings(this.pageTrack, { reason: "destroyed" });
    stopTargetSprings(this.panel, { reason: "destroyed" });
    stopTargetSprings(this.panel.scale, { reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
