import { gsap } from "gsap";
import { folderCloseDuration, folderCloseEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { makeStageLocalRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getClosingPreviewTiming } from "./folderOverlayGeometry.js";
import {
  getMaxFolderGhostGridDelay,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import {
  cancelClosingHandoffCleanup,
  scheduleClosingHandoffCleanup,
} from "./folderClosingHandoff.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const CLOSING_GHOST_MAX_DELAY = 0.06;
const CLOSING_FRAME_TAIL_DURATION = 0.04;
const CLOSING_EXTRA_GHOST_ALPHA_DURATION = 0.12;
const CLOSING_EXTRA_GHOST_ALPHA_HOLD = 0.16;
const CLOSING_PREVIEW_FALLBACK_DURATION = 0.22;

export class FolderClosingGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.scheduler = options.scheduler || globalThis;
    this.clearPreviewSwapLayer = options.clearPreviewSwapLayer || (() => {});
    this.ghostFactory = options.ghostFactory;
    layer.closingGhostRevealTimer = null;
    layer.closingFrameComplete = false;
    layer.closingPreviewSwapKeys = new Set();
    layer.completedClosingControllerGhostKeys = [];
    layer.completedClosingPreviewGhosts = [];
  }

  clearRevealTimer() {
    const layer = this.layer;
    if (!layer.closingGhostRevealTimer) return;
    this.scheduler.clearTimeout?.(layer.closingGhostRevealTimer);
    layer.closingGhostRevealTimer = null;
  }

  scheduleRevealFallback(targets) {
    const layer = this.layer;
    this.clearRevealTimer();
    const maxDelay = getMaxFolderGhostGridDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const timeoutMs = Math.round(
      (maxDelay + folderCloseDuration + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
    );
    layer.closingGhostRevealTimer = this.scheduler.setTimeout?.(() => {
      layer.closingGhostRevealTimer = null;
      if (layer.closingGhostKeys?.size || layer.closingPreviewSwapKeys?.size) this.clear();
    }, timeoutMs) || null;
  }

  hasActive() {
    const layer = this.layer;
    return Boolean(layer.closingGhostKeys?.size || layer.closingPreviewSwapKeys?.size);
  }

  begin(folderId) {
    const layer = this.layer;
    this.clear();
    layer.closingGhostFolderId = folderId || null;
    layer.closingGhostKeys = new Set();
    layer.closingFrameComplete = false;
    layer.completedClosingControllerGhostKeys = [];
    layer.completedClosingPreviewGhosts = [];
  }

  start(state, targets, folderRect, panelRect, options = {}) {
    const layer = this.layer;
    const {
      previewSwapTargets = [],
    } = options;
    const interruption = layer.captureOpeningInterruption(state, targets, panelRect);
    const closeFrameFromRect = interruption?.frameRect || panelRect;
    const closeTargets = interruption?.targets || targets;
    layer.clearOpeningGhosts();
    this.begin(state.renderedFolder?.id);
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
      layer.startClosingPreviewSwapGhosts(state, previewSwapTargets, previewTiming);
    };
    layer.enableClosingFrameMask();
    layer.startFrameGhost(closeFrameFromRect, closeFrameToRect, {
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
        this.completeFrameGhost(state);
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

    layer.pageTrack.visible = false;
    this.scheduleRevealFallback(usableTargets);
    for (const target of usableTargets) {
      const ghost = this.ghostFactory();
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
      layer.closingGhostLayer.addChild(ghost);
      layer.closingGhostKeys.add(target.item.id);
      for (const node of layer.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      gsap.to(ghost, {
        delay: motion.delay,
        duration: folderCloseDuration,
        ease: folderCloseEase,
        x: motion.toX,
        y: motion.toY,
        onComplete: () => this.completeGhost(state, target, ghost),
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

  flushCompletedControllerGhosts(state) {
    const layer = this.layer;
    const keys = layer.completedClosingControllerGhostKeys || [];
    layer.completedClosingControllerGhostKeys = [];
    for (const key of keys) state.completeFolderCloseIconGhost?.(key);
  }

  clearCompletedPreviewGhosts() {
    const layer = this.layer;
    const ghosts = layer.completedClosingPreviewGhosts || [];
    layer.completedClosingPreviewGhosts = [];
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      if (!ghost.destroyed) ghost.destroy({ children: true });
    }
  }

  cancelHandoffCleanup() {
    cancelClosingHandoffCleanup(this.layer, this.scheduler.cancelAnimationFrame);
  }

  runHandoffCleanup() {
    this.clearCompletedPreviewGhosts();
    this.clearPreviewSwapLayer(this.layer);
    this.layer.clearFrameGhost();
  }

  finishTransition(state) {
    const layer = this.layer;
    if (layer.openingGhostKeys?.size ||
      layer.closingGhostKeys?.size ||
      layer.closingPreviewSwapKeys?.size ||
      !layer.closingFrameComplete) return;
    this.clearRevealTimer();
    layer.pageTrack.visible = false;
    scheduleClosingHandoffCleanup(layer, () => this.runHandoffCleanup(), this.scheduler);
    this.flushCompletedControllerGhosts(state);
  }

  completeGhost(state, target, ghost) {
    const layer = this.layer;
    if (!ghost || ghost.closingComplete) return;
    ghost.closingComplete = true;
    layer.closingGhostKeys?.delete(target.item.id);
    const controllerGhostKey = target.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target.item.id, target.index);
    if (controllerGhostKey) layer.completedClosingControllerGhostKeys.push(controllerGhostKey);
    killAllMotion(ghost);
    if (target.isThumbnailChild && !ghost.destroyed) {
      const motion = makeCompletedClosingPreviewMotion(target, {
        isTextlessMode: state.isTextlessMode,
        stageRect: state.stageRect,
      });
      ghost.position.set(motion.x, motion.y);
      ghost.scale.set(motion.scale);
      ghost.alpha = 1;
      layer.completedClosingPreviewGhosts.push(ghost);
      this.finishTransition(state);
      return;
    }
    this.finishTransition(state);
    if (!ghost.destroyed) ghost.destroy({ children: true });
  }

  completeFrameGhost(state) {
    this.layer.closingFrameComplete = true;
    this.finishTransition(state);
  }

  clear() {
    const layer = this.layer;
    this.cancelHandoffCleanup();
    this.clearRevealTimer();
    layer.closingGhostKeys?.clear();
    layer.closingPreviewSwapKeys?.clear();
    layer.closingFrameComplete = false;
    layer.completedClosingControllerGhostKeys = [];
    layer.completedClosingPreviewGhosts = [];
    layer.clearFrameGhost();
    layer.pageTrack.visible = true;
    layer.revealIconNodes();
    layer.rebuildPageTrackMask();
    const ghosts = layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
    this.clearPreviewSwapLayer(layer);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
