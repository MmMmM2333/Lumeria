import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
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
  folderPreviewSettleEase,
  layoutDuration,
  layoutEase,
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
import {
  getMaxFolderGhostGridDelay,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
  makeOpeningGhostMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { makeClosingPreviewSwapPlan } from "./folderPreviewSwapMotion.js";
import { makeStageLocalRect, makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import {
  clearLaunchIconBounds,
  getFolderPreviewChildBounds,
  getFolderPreviewChildTargetBounds,
  getTopLevelFolderThumbBounds,
  getTopLevelFolderThumbTargetBounds,
  getTopLevelIconBounds,
  getTopLevelIconTargetBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { getClosingPreviewTiming, getFolderPageMaskRect, resolveOpeningInterruptionFrame } from "./folderOverlayGeometry.js";
import { makeFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import { cloneFrameSnapshot, makeOpeningInterruptionFrame } from "./folderOpeningInterruptionFrame.js";
import {
  getStableFolderCloseRects,
  makeClosingGhostTarget,
  makeOpeningGhostTarget,
  makeStableFolderCloseTarget,
} from "./folderOverlayTargets.js";
import { makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const CLOSING_FRAME_TAIL_DURATION = 0.04;
const CLOSING_GHOST_MAX_DELAY = 0.06;
const CLOSING_EXTRA_GHOST_ALPHA_DURATION = 0.12;
const CLOSING_EXTRA_GHOST_ALPHA_HOLD = 0.16;
const CLOSING_PREVIEW_FALLBACK_DURATION = 0.22;
function isPointInRect(x, y, rect) {
  return Boolean(rect) &&
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

function makeClosingPreviewSwapKey(folderId, pageIndex) {
  return `closing-preview-swap:${folderId || "folder"}:${pageIndex}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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
    const folderId = state.renderedFolder.id;
    const folderRect = getTopLevelIconBounds(folderId);
    const folderThumbRect = getTopLevelFolderThumbBounds(folderId) || folderRect;
    const targetFolderRect = getTopLevelIconTargetBounds(folderId);
    const targetFolderThumbRect = getTopLevelFolderThumbTargetBounds(folderId);
    const previewSlots = getFolderPreviewSlots(state.renderedFolder, state.folderPageSize);
    if (folderId && (targetFolderRect || folderRect) && (!this.stableFolderCloseTarget ||
      this.stableFolderCloseTarget.folderId !== folderId ||
      (isClosing && !wasClosing))) {
      const hasTargetFolderRect = Boolean(targetFolderRect);
      this.stableFolderCloseTarget = makeStableFolderCloseTarget({
        folderId,
        folderRect: targetFolderRect || folderRect,
        folderThumbRect: targetFolderThumbRect || targetFolderRect || folderThumbRect,
        getPreviewChildRect: (item, previewSlotIndex) =>
          getFolderPreviewChildTargetBounds(folderId, item.id, previewSlotIndex) ||
          (hasTargetFolderRect ? null : getFolderPreviewChildBounds(folderId, item.id, previewSlotIndex)),
        previewSlots,
      });
    }
    const { closeThumbRect } = getStableFolderCloseRects({
      folderId,
      folderRect,
      folderThumbRect,
      isClosing,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
    });

    this.bindFakeRefs(state, geometry);
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
      node.setState(nodeState);

      const iconBounds = node.getIconBounds(state.stageRect);
      if (isInteractivePage) {
        registerLaunchIconBounds(
          { area: "folder", folderId: state.renderedFolder.id, id: item.id, pageIndex },
          iconBounds,
          { area: "folder", folderId: state.renderedFolder.id, id: item.id, index, item, pageIndex }
        );
        registerLaunchIconTargetBounds(
          { area: "folder", folderId: state.renderedFolder.id, id: item.id, pageIndex },
          makeTargetIconBounds(state.stageRect, state.width, state.height, targetCenter.x, targetCenter.y, iconSize),
          { area: "folder", folderId: state.renderedFolder.id, id: item.id, index, item, pageIndex }
        );
      }
      if (entry.openingGhostInput) {
        openingGhostTargets.push(makeOpeningGhostTarget({
          ...entry.openingGhostInput,
          folderRect,
          getPreviewChildRect: (targetItem, slotIndex) =>
            getFolderPreviewChildBounds(folderId, targetItem.id, slotIndex),
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
    if (isNewFolder && !isClosing) this.startOpeningGhosts(state, openingGhostTargets, folderRect, geometry.panel);
    if (state.isFolderClosing && this.closingGhostFolderId !== folderId) {
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
    const maxDelay = getMaxFolderGhostGridDelay(targets, 0.18);
    const timeoutMs = Math.round((maxDelay + folderOpenGhostDuration) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    this.openingGhostRevealTimer = globalThis.setTimeout?.(() => {
      this.openingGhostRevealTimer = null;
      if (this.openingGhostKeys?.size) this.clearOpeningGhosts();
    }, timeoutMs) || null;
  }

  scheduleClosingGhostRevealFallback(targets) {
    this.clearClosingGhostRevealTimer();
    const maxDelay = getMaxFolderGhostGridDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const timeoutMs = Math.round(
      (maxDelay + folderCloseDuration + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
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
    this.clearCompletedClosingPreviewGhosts();
    clearClosingPreviewSwapLayer(this);
    this.clearFrameGhost();
    this.flushCompletedClosingControllerGhosts(state);
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
    this.startFrameGhost(makeStageLocalRect(folderRect, state.stageRect), panelRect, {
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
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const motion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: folderOpenGhostDuration,
        stageRect: state.stageRect,
      });
      ghost.position.set(motion.fromX, motion.fromY);
      ghost.scale.set(motion.scale);
      ghost.alpha = motion.alpha;
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
        gsap.to(ghost.labelText, { alpha: 1, delay: motion.labelDelay, duration: 0.13, ease: "power2.out" });
        gsap.to(ghost.labelText.scale, { x: 1, y: 1, delay: motion.labelDelay, duration: 0.13, ease: "power2.out" });
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
        x: motion.toX,
        y: motion.toY,
        delay: motion.delay,
        onComplete: () => this.completeOpeningGhost(state, target, ghost),
      });
      gsap.to(ghost.scale, {
        duration: folderOpenGhostDuration,
        ease: folderOpenGhostEase,
        x: 1,
        y: 1,
        delay: motion.delay,
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
      const motion = makeCompletedClosingPreviewMotion(target, {
        isTextlessMode: state.isTextlessMode,
        stageRect: state.stageRect,
      });
      ghost.position.set(motion.x, motion.y);
      ghost.scale.set(motion.scale);
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

  startClosingPreviewSwapGhosts(state, targets, timing = getClosingPreviewTiming()) {
    clearClosingPreviewSwapLayer(this);
    if (!targets?.length || state.folderPageIndex <= 0) return;

    const plan = makeClosingPreviewSwapPlan(targets, { stageRect: state.stageRect });
    if (!plan) return;

    const key = makeClosingPreviewSwapKey(state.renderedFolder?.id, state.folderPageIndex);
    const root = new Container();
    const mask = new Graphics();
    const iconsWrap = new Container();

    root.eventMode = "none";
    root.alpha = 0.86;
    mask.rect(plan.maskRect.left, plan.maskRect.top, plan.maskRect.width, plan.maskRect.height).fill({ color: 0xffffff, alpha: 1 });
    iconsWrap.mask = mask;
    iconsWrap.pivot.set(plan.centerX, plan.centerY);
    iconsWrap.position.set(plan.centerX, plan.centerY);
    iconsWrap.scale.set(plan.wrapStartScale);
    root.addChild(mask);
    root.addChild(iconsWrap);
    ensureClosingPreviewSwapState(this).addChild(root);
    this.closingPreviewSwapKeys.add(key);

    const iconMotions = [];
    for (const motion of plan.iconMotions) {
      const ghost = this.createClosingPreviewSwapIcon(motion.item, motion.size);
      ghost.position.set(motion.fromX, motion.fromY);
      ghost.scale.set(motion.fromScale);
      ghost.alpha = 0.78;
      iconsWrap.addChild(ghost);
      iconMotions.push({ ...motion, ghost });
    }

    const timeline = gsap.timeline({
      onComplete: () => this.completeClosingPreviewSwapGhost(state, key, root, iconsWrap),
    });
    timeline
      .to(root, { alpha: 1, duration: 0.08, ease: "power1.out" }, 0)
      .to(iconsWrap.scale, {
        x: 1,
        y: 1,
        duration: timing.swapDuration,
        ease: folderPreviewSettleEase,
      }, 0);
    for (const motion of iconMotions) {
      timeline
        .to(motion.ghost, {
          alpha: 1,
          duration: timing.iconDuration,
          ease: folderPreviewSettleEase,
          x: motion.toX,
          y: motion.toY,
        }, motion.delay)
        .to(motion.ghost.scale, {
          duration: timing.iconDuration,
          ease: folderPreviewSettleEase,
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
    const frameDuration = folderCloseDuration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = makeStageLocalRect(folderRect, state.stageRect);
    const previewTiming = getClosingPreviewTiming(closeFrameFromRect, closeFrameToRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame) => {
      if (closingPreviewSwapStarted || isInterruptedClose || !previewSwapTargets?.length) return;
      if ((frame?.progress ?? 0) < previewTiming.progress) return;
      closingPreviewSwapStarted = true;
      this.startClosingPreviewSwapGhosts(state, previewSwapTargets, previewTiming);
    };
    this.enableClosingFrameMask();
    this.startFrameGhost(closeFrameFromRect, closeFrameToRect, {
      duration: frameDuration,
      ease: folderCloseEase,
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
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      const motion = makeClosingGhostMotion(target, {
        alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
        closeDuration: folderCloseDuration,
        isTextlessMode: state.isTextlessMode,
        stageRect: state.stageRect,
      });
      ghost.position.set(motion.fromX, motion.fromY);
      ghost.scale.set(motion.sourceScale);
      ghost.alpha = motion.sourceAlpha;
      if (ghost.labelText?.visible) {
        if (target.sourceLabelAlpha != null) ghost.labelText.alpha = target.sourceLabelAlpha;
        gsap.to(ghost.labelText, { alpha: 0, delay: motion.delay, duration: 0.1, ease: "power2.in" });
        gsap.to(ghost.labelText.scale, { x: 0.94, y: 0.94, delay: motion.delay, duration: 0.1, ease: "power2.in" });
      }
      this.closingGhostLayer.addChild(ghost);
      this.closingGhostKeys.add(target.item.id);
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      gsap.to(ghost, {
        delay: motion.delay,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        x: motion.toX,
        y: motion.toY,
        onComplete: () => this.completeClosingGhost(state, target, ghost),
      });
      if (!target.isThumbnailChild) {
        gsap.to(ghost, {
          alpha: 0,
          delay: motion.alphaDelay,
          duration: CLOSING_EXTRA_GHOST_ALPHA_DURATION,
          ease: "power2.in",
        });
      }
      gsap.to(ghost.scale, {
        delay: motion.delay,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        x: motion.scale,
        y: motion.scale,
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
