import { gsap } from "gsap";
import { folderCloseDuration, folderCloseEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { springGroupTo } from "../animation/springGroup.js";
import { panelSpring } from "../animation/springMotion.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import {
  getClosingPreviewTiming,
  resolveOpeningInterruptionFrame,
} from "./folderOverlayGeometry.js";
import {
  getMaxFolderGhostGridDelay,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import {
  cloneFrameSnapshot,
  makeOpeningInterruptionFrame,
} from "./folderOpeningInterruptionFrame.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import {
  cancelClosingHandoffCleanup,
  scheduleClosingHandoffCleanup,
} from "./folderClosingHandoff.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const CLOSING_GHOST_MAX_DELAY = 0.06;
const CLOSING_FRAME_TAIL_DURATION = 0.04;
const CLOSING_EXTRA_GHOST_ALPHA_DURATION = 0.12;
const CLOSING_EXTRA_GHOST_ALPHA_HOLD = 0.16;
const CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;
const CLOSING_PREVIEW_FALLBACK_DURATION = 0.22;

function getFolderHandoffDebugOptions() {
  const value = globalThis.__LP_DEBUG_FOLDER_HANDOFF__;
  if (!value) return null;
  if (value === true) return { log: true, timeline: false };
  if (typeof value === "object") {
    return {
      log: value.log !== false,
      timeline: value.timeline === true,
    };
  }
  return null;
}

function roundNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function roundRect(rect) {
  if (!rect) return null;
  return {
    height: roundNumber(rect.height),
    left: roundNumber(rect.left),
    top: roundNumber(rect.top),
    width: roundNumber(rect.width),
  };
}

function rectDelta(rect, target) {
  if (!rect || !target) return null;
  return {
    height: roundNumber((rect.height || 0) - (target.height || 0)),
    left: roundNumber((rect.left || 0) - (target.left || 0)),
    top: roundNumber((rect.top || 0) - (target.top || 0)),
    width: roundNumber((rect.width || 0) - (target.width || 0)),
  };
}

function setLayerClosingHandoffActive(layer, active) {
  if (typeof layer.setClosingHandoffActive === "function") {
    layer.setClosingHandoffActive(active);
    return;
  }
  layer.closingHandoffActive = Boolean(active);
}

function animateClosingGhost(ghost, motion, target, onComplete, options = {}) {
  if (!target.isThumbnailChild) {
    gsap.to(ghost, {
      alpha: 0,
      delay: motion.alphaDelay,
      duration: CLOSING_EXTRA_GHOST_ALPHA_DURATION,
      ease: "power2.in",
    });
  }
  return springGroupTo([
    { target: ghost, prop: "x", to: motion.toX, config: panelSpring, options: { delay: motion.delay } },
    { target: ghost, prop: "y", to: motion.toY, config: panelSpring, options: { delay: motion.delay } },
    { target: ghost.scale, prop: "x", to: motion.scale, config: panelSpring, options: { delay: motion.delay } },
    { target: ghost.scale, prop: "y", to: motion.scale, config: panelSpring, options: { delay: motion.delay } },
  ], {
    scheduler: options.scheduler,
    onComplete,
  });
}

export class FolderClosingGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.scheduler = options.scheduler || globalThis;
    this.ghostFactory = options.ghostFactory;
    this.previewSwap = options.previewSwap || { clear: () => {}, start: () => {} };
    layer.closingGhostRevealTimer = null;
    layer.closingFrameComplete = false;
    layer.closingPreviewSwapKeys = new Set();
    layer.completedClosingControllerGhostKeys = [];
    layer.completedClosingPreviewGhosts = [];
    layer.closingFolderHandoffGhost = null;
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    setLayerClosingHandoffActive(layer, false);
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
    const fallbackSeconds = Math.max(folderCloseDuration, CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round(
      (maxDelay + fallbackSeconds + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
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
    layer.closingGhostMotionControls = new Set();
    layer.closingFrameComplete = false;
    layer.completedClosingControllerGhostKeys = [];
    layer.completedClosingPreviewGhosts = [];
    this.clearFolderHandoffGhost();
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    setLayerClosingHandoffActive(layer, false);
  }

  start(state, targets, folderRect, panelRect, options = {}) {
    const layer = this.layer;
    const {
      handoffRect = null,
      handoffTarget = null,
      previewSwapTargets = [],
    } = options;
    const interruption = this.captureOpeningInterruption(state, targets, panelRect);
    const closeFrameFromRect = interruption?.frameRect || panelRect;
    const closeTargets = interruption?.targets || targets;
    layer.openingGhosts.clear();
    this.begin(state.renderedFolder?.id);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget);
    if (!usableTargets.length) return;
    const isInterruptedClose = Boolean(interruption);
    const frameDuration = folderCloseDuration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    layer.closingFolderHandoffRect = handoffRect || folderRect;
    layer.closingFolderHandoffTarget = handoffTarget || null;
    const previewTiming = getClosingPreviewTiming(closeFrameFromRect, closeFrameToRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame) => {
      if (closingPreviewSwapStarted || isInterruptedClose || !previewSwapTargets?.length) return;
      if ((frame?.progress ?? 0) < previewTiming.progress) return;
      closingPreviewSwapStarted = true;
      this.previewSwap.start(state, previewSwapTargets, previewTiming, (finishState) => this.finishTransition(finishState));
    };
    layer.enableClosingFrameMask();
    layer.startFrameGhost(closeFrameFromRect, closeFrameToRect, {
      duration: frameDuration,
      ease: folderCloseEase,
      fadeStart: 0.86,
      frameGhostToAlpha: 1,
      fromFillAlpha: interruption?.frameRect?.fillAlpha ?? 0.26,
      fromFillColor: interruption?.frameRect?.fillColor ?? thumb.fillColor,
      fromRadius: interruption?.frameRect?.radius ?? closeFrameFromRect?.radius ?? 48,
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
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
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

      const motionControl = animateClosingGhost(ghost, motion, target, () => {
        layer.closingGhostMotionControls?.delete(motionControl);
        this.completeGhost(state, target, ghost);
      }, { scheduler: this.scheduler });
      layer.closingGhostMotionControls.add(motionControl);
    }
  }

  captureOpeningInterruption(state, targets, panelRect) {
    const layer = this.layer;
    if (!layer.openingGhostKeys?.size) return null;
    const targetByItemId = new Map((targets || []).map((target) => [target.item?.id, target]));
    const interruptedTargets = [];

    for (const ghost of layer.openingGhostLayer.children || []) {
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

    const frameRect = cloneFrameSnapshot(layer.frameGhostState);
    const contentFrameRect = makeOpeningInterruptionFrame(interruptedTargets, state.stageRect, frameRect);

    return {
      frameRect: resolveOpeningInterruptionFrame(frameRect, panelRect, contentFrameRect),
      targets: interruptedTargets.length ? interruptedTargets : targets,
    };
  }

  flushCompletedControllerGhosts(state) {
    const layer = this.layer;
    const keys = layer.completedClosingControllerGhostKeys || [];
    layer.completedClosingControllerGhostKeys = [];
    for (const key of keys) state.completeFolderCloseIconGhost?.(key);
  }

  hasPendingHandoff() {
    return Boolean(this.layer.closingHandoffActive);
  }

  clearFolderHandoffGhost() {
    const layer = this.layer;
    const ghost = layer.closingFolderHandoffGhost;
    layer.closingFolderHandoffGhost = null;
    if (!ghost) return;
    killAllMotion(ghost);
    if (!ghost.destroyed) ghost.destroy({ children: true });
  }

  destroyCompletedPreviewGhosts(ghosts) {
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      if (!ghost.destroyed) ghost.destroy({ children: true });
    }
  }

  clearCompletedPreviewGhosts() {
    const layer = this.layer;
    const ghosts = layer.completedClosingPreviewGhosts || [];
    layer.completedClosingPreviewGhosts = [];
    this.destroyCompletedPreviewGhosts(ghosts);
  }

  cancelHandoffCleanup() {
    cancelClosingHandoffCleanup(this.layer, this.scheduler.cancelAnimationFrame);
  }

  cancelMotionControls() {
    const layer = this.layer;
    const controls = layer.closingGhostMotionControls;
    layer.closingGhostMotionControls = null;
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  deferRunHandoffCleanup() {
    scheduleClosingHandoffCleanup(this.layer, () => this.runHandoffCleanup(), this.scheduler);
  }

  clearHandoffOverlayVisuals() {
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.layer.clearFrameGhost();
  }

  deferRunHandoffVisualCleanup() {
    scheduleClosingHandoffCleanup(this.layer, () => {
      this.clearHandoffOverlayVisuals();
      this.deferRunHandoffCleanup();
    }, this.scheduler);
  }

  runHandoffCleanup() {
    const layer = this.layer;
    this.clearFolderHandoffGhost();
    layer.visible = false;
    layer.currentFolderId = null;
    setLayerClosingHandoffActive(layer, false);
  }

  finishTransition(state) {
    const layer = this.layer;
    if (layer.openingGhostKeys?.size ||
      layer.closingGhostKeys?.size ||
      layer.closingPreviewSwapKeys?.size ||
      !layer.closingFrameComplete) return;
    if (layer.closingHandoffActive) return;
    this.clearRevealTimer();
    layer.panel.visible = false;
    layer.pageTrack.visible = false;
    setLayerClosingHandoffActive(layer, true);
    this.deferRunHandoffVisualCleanup();
    this.flushCompletedControllerGhosts(state);
  }

  debugClosingGhostComplete(state, target, ghost, phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log || !options.timeline) return;
    const actualRect = ghost?.getIconBounds?.(state.stageRect) || null;
    const payload = {
      actualRect: roundRect(actualRect),
      alpha: roundNumber(ghost?.alpha),
      delta: rectDelta(actualRect, target?.targetRect),
      folderId: state.renderedFolder?.id || this.layer.closingGhostFolderId || null,
      isThumbnailChild: Boolean(target?.isThumbnailChild),
      itemId: target?.item?.id || null,
      phase,
      previewSlotIndex: target?.previewSlotIndex ?? null,
      scaleX: roundNumber(ghost?.scale?.x),
      scaleY: roundNumber(ghost?.scale?.y),
      targetRect: roundRect(target?.targetRect),
      x: roundNumber(ghost?.x),
      y: roundNumber(ghost?.y),
    };
    console.log("[folder-closing-ghost-complete-v2]", payload);
    if (target?.isThumbnailChild) {
      const slot = target.previewSlotIndex ?? "na";
      const itemId = target.item?.id || "unknown";
      console.log(`[folder-closing-ghost-compact-v2:${phase}:slot-${slot}:${itemId}]`, {
        deltaHeight: payload.delta?.height ?? null,
        deltaLeft: payload.delta?.left ?? null,
        deltaTop: payload.delta?.top ?? null,
        deltaWidth: payload.delta?.width ?? null,
        height: payload.actualRect?.height ?? null,
        left: payload.actualRect?.left ?? null,
        scaleX: payload.scaleX,
        scaleY: payload.scaleY,
        targetHeight: payload.targetRect?.height ?? null,
        targetLeft: payload.targetRect?.left ?? null,
        targetTop: payload.targetRect?.top ?? null,
        targetWidth: payload.targetRect?.width ?? null,
        top: payload.actualRect?.top ?? null,
        width: payload.actualRect?.width ?? null,
      });
    }
  }

  completeGhost(state, target, ghost) {
    const layer = this.layer;
    if (!ghost || ghost.closingComplete) return;
    ghost.closingComplete = true;
    layer.closingGhostKeys?.delete(target.item.id);
    const controllerGhostKey = target.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target.item.id, target.index);
    if (controllerGhostKey) layer.completedClosingControllerGhostKeys.push(controllerGhostKey);
    this.debugClosingGhostComplete(state, target, ghost, "before-complete");
    killAllMotion(ghost);
    if (target.isThumbnailChild && !ghost.destroyed) {
      const motion = makeCompletedClosingPreviewMotion(target, {
        isTextlessMode: state.isTextlessMode,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(motion.x, motion.y);
      ghost.scale.set(motion.scale);
      ghost.alpha = 1;
      this.debugClosingGhostComplete(state, target, ghost, "completed-preview");
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
    this.cancelMotionControls();
    layer.closingGhostKeys?.clear();
    layer.closingPreviewSwapKeys?.clear();
    layer.closingFrameComplete = false;
    layer.completedClosingControllerGhostKeys = [];
    layer.completedClosingPreviewGhosts = [];
    this.clearFolderHandoffGhost();
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    setLayerClosingHandoffActive(layer, false);
    layer.clearFrameGhost();
    layer.panel.visible = true;
    layer.pageTrack.visible = true;
    layer.revealIconNodes();
    layer.rebuildPageTrackMask();
    const ghosts = layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
    this.previewSwap.clear();
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
