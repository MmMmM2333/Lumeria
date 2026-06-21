import { folderCloseDuration, folderCloseEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { parallel, transition } from "../animation/motionTween.js";
import { panelSpring } from "../animation/springMotion.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect, stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getClosingPreviewTiming } from "./folderOverlayGeometry.js";
import {
  getMaxFolderGhostGridDelay,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
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
const CLOSING_GHOST_VISUAL_POSITION_EPSILON = 0.5;
const CLOSING_GHOST_VISUAL_SCALE_EPSILON = 0.01;

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

function getClosingControllerGhostKey(state, target) {
  return target?.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target?.item?.id, target?.index) || null;
}

function animateClosingGhost(ghost, motion, target, onComplete, options = {}) {
  const positionSpring = { ...panelSpring, arriveDelta: CLOSING_GHOST_VISUAL_POSITION_EPSILON };
  const scaleSpring = { ...panelSpring, arriveDelta: CLOSING_GHOST_VISUAL_SCALE_EPSILON };
  const motionOptions = { delay: motion.delay };
  if (!target.isThumbnailChild) {
    transition(ghost)
      .duration(CLOSING_EXTRA_GHOST_ALPHA_DURATION)
      .ease("power2.in")
      .delay(motion.alphaDelay)
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 0 })
      .start();
  }
  return parallel([
    transition(ghost)
      .spring(positionSpring)
      .handoff()
      .interrupt("retarget")
      .to({ ...motionOptions, x: motion.toX, y: motion.toY }),
    transition(ghost.scale)
      .spring(scaleSpring)
      .handoff()
      .interrupt("retarget")
      .to({ ...motionOptions, x: motion.scale, y: motion.scale }),
  ], {
    scheduler: options.scheduler,
    onArrive: () => options.onVisualArrive?.(),
    onComplete: () => {
      onComplete?.();
    },
  });
}

function releaseOpeningGhostsForClosing(layer, state, targets) {
  const released = new Map();
  if (!layer.openingGhostKeys?.size || typeof layer.openingGhosts?.releaseGhost !== "function") return released;
  for (const target of targets || []) {
    const itemId = target?.item?.id;
    if (!itemId || !target?.targetStageLayoutRect || !layer.openingGhostKeys.has(itemId)) continue;
    const ghost = layer.openingGhosts.releaseGhost(itemId);
    const sourceRect = ghost?.getIconBounds?.(state.stageRect);
    if (!ghost || !sourceRect) {
      ghost?.destroy?.({ children: true });
      continue;
    }
    released.set(itemId, {
      ghost,
      sourceAlpha: ghost.alpha,
      sourceLabelAlpha: ghost.labelText?.alpha,
      sourceRect,
      sourceScale: Math.max(0.14, sourceRect.width / Math.max(1, target.iconSize)),
    });
  }
  return released;
}

function cloneFramePresentation(frame) {
  if (!frame) return null;
  return {
    fillAlpha: frame.fillAlpha,
    fillColor: frame.fillColor,
    height: frame.height,
    left: frame.left,
    progress: frame.progress,
    radius: frame.radius,
    strokeAlpha: frame.strokeAlpha,
    strokeColor: frame.strokeColor,
    strokeWidth: frame.strokeWidth,
    top: frame.top,
    width: frame.width,
  };
}

function resolveClosingFrameStartRect(layer, panelRect) {
  return cloneFramePresentation(layer.frameGhostState) || panelRect;
}

export class FolderClosingGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.scheduler = options.scheduler || globalThis;
    this.ghostFactory = options.ghostFactory;
    this.previewSwap = options.previewSwap || { clear: () => {}, start: () => {} };
    layer.closingGhostRevealTimer = null;
    layer.closingFrameComplete = false;
    layer.closingHandoffVisualCleanupScheduled = false;
    layer.closingPreviewSwapKeys = new Set();
    layer.closingVisualGhostKeys = new Set();
    layer.closingGhostSessionToken = null;
    layer.completedClosingControllerGhostKeys = [];
    layer.pendingClosingControllerGhostKeys = new Set();
    layer.completedClosingPreviewGhosts = [];
    layer.closingFolderHandoffGhost = null;
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    layer.closingFrameDetachedTarget = null;
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

  begin(folderId, options = {}) {
    const layer = this.layer;
    this.clear(options);
    layer.closingGhostFolderId = folderId || null;
    layer.closingGhostKeys = new Set();
    layer.closingGhostMotionControls = new Set();
    layer.closingFrameComplete = false;
    layer.closingFrameVisualComplete = false;
    layer.closingHandoffVisualCleanupScheduled = false;
    layer.closingVisualGhostKeys = new Set();
    layer.completedClosingControllerGhostKeys = [];
    layer.pendingClosingControllerGhostKeys = new Set();
    layer.completedClosingPreviewGhosts = [];
    this.clearFolderHandoffGhost();
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    layer.closingFrameDetachedTarget = null;
    setLayerClosingHandoffActive(layer, false);
  }

  start(state, targets, folderRect, panelRect, options = {}) {
    const layer = this.layer;
    const {
      handoffRect = null,
      handoffTarget = null,
      previewSwapTargets = [],
    } = options;
    const folderId = state.renderedFolder?.id || layer.currentFolderId || null;
    const releasedOpeningGhosts = releaseOpeningGhostsForClosing(layer, state, targets);
    const closeFrameFromRect = resolveClosingFrameStartRect(layer, panelRect);
    const closeTargets = (targets || []).map((target) => {
      const released = releasedOpeningGhosts.get(target?.item?.id);
      return released
        ? {
          ...target,
          sourceAlpha: released.sourceAlpha,
          sourceLabelAlpha: released.sourceLabelAlpha,
          sourceRect: released.sourceRect,
          sourceScale: released.sourceScale,
        }
        : target;
    });
    layer.openingGhosts.clear({
      cancelSession: true,
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });
    this.begin(folderId, { restorePageTrack: false, reveal: false });
    const sessionToken = typeof layer.createClosingGhostSessionToken === "function"
      ? layer.createClosingGhostSessionToken(folderId)
      : `closing:${folderId || ""}`;
    layer.closingGhostSessionToken = sessionToken;
    const owner = {
      folderId,
      kind: "closing",
      token: sessionToken,
    };
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget);
    if (!usableTargets.length) return;
    const isRetargetedOpeningClose = releasedOpeningGhosts.size > 0;
    const frameDuration = folderCloseDuration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    layer.closingFolderHandoffRect = handoffRect || folderRect;
    layer.closingFolderHandoffTarget = handoffTarget || null;
    const thumb = getFolderThumbMetrics(folderRect.width);
    layer.closingFrameDetachedTarget = {
      ...closeFrameToRect,
      fillAlpha: thumb.fillAlpha,
      fillColor: thumb.fillColor,
      radius: thumb.radius,
      strokeAlpha: thumb.strokeAlpha,
      strokeColor: thumb.strokeColor,
      strokeWidth: thumb.strokeWidth,
    };
    const previewTiming = getClosingPreviewTiming(closeFrameFromRect, closeFrameToRect);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame) => {
      if (closingPreviewSwapStarted || isRetargetedOpeningClose || !previewSwapTargets?.length) return;
      if ((frame?.progress ?? 0) < previewTiming.progress) return;
      closingPreviewSwapStarted = true;
      this.previewSwap.start(state, previewSwapTargets, previewTiming, (finishState) => this.finishTransition(finishState));
    };
    layer.enableClosingFrameMask();
    const markFrameVisualComplete = () => {
      if (layer.closingFrameVisualComplete) return;
      layer.closingFrameVisualComplete = true;
      this.finishTransition(state);
    };
    layer.startFrameGhost(closeFrameFromRect, closeFrameToRect, {
      duration: frameDuration,
      ease: folderCloseEase,
      fadeStart: 0.86,
      frameGhostToAlpha: 1,
      fromFillAlpha: closeFrameFromRect?.fillAlpha ?? 0.26,
      fromFillColor: closeFrameFromRect?.fillColor ?? thumb.fillColor,
      fromRadius: closeFrameFromRect?.radius ?? 48,
      fromStrokeAlpha: closeFrameFromRect?.strokeAlpha ?? 0.24,
      fromStrokeColor: closeFrameFromRect?.strokeColor ?? thumb.strokeColor,
      fromStrokeWidth: closeFrameFromRect?.strokeWidth ?? thumb.strokeWidth,
      panelMaterialFinalAlpha: 0,
      panelMaterialFromAlpha: 0,
      panelMaterialToAlpha: 0,
      progressMilestones: [{
        callback: () => startClosingPreviewSwapWhenReady({ progress: previewTiming.progress }),
        progress: previewTiming.progress,
      }],
      onComplete: () => {
        startClosingPreviewSwapWhenReady({ progress: 1 });
        this.completeFrameGhost(state);
      },
      onArrive: markFrameVisualComplete,
      preserveOnComplete: true,
      toFillAlpha: thumb.fillAlpha,
      toFillColor: thumb.fillColor,
      toRadius: thumb.radius,
      toStrokeAlpha: thumb.strokeAlpha,
      toStrokeColor: thumb.strokeColor,
      toStrokeWidth: thumb.strokeWidth,
      updateClosingMask: true,
    });

    if (typeof layer.hidePageTrackForTransition === "function") {
      layer.hidePageTrackForTransition(owner);
    } else {
      layer.pageTrack.visible = false;
    }
    this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      layer.closingGhostKeys.add(target.item.id);
      if (target.isThumbnailChild) layer.closingVisualGhostKeys.add(target.item.id);
      const controllerGhostKey = getClosingControllerGhostKey(state, target);
      if (controllerGhostKey) layer.pendingClosingControllerGhostKeys.add(controllerGhostKey);
    }

    for (const target of usableTargets) {
      const released = releasedOpeningGhosts.get(target.item?.id);
      const ghost = released?.ghost || this.ghostFactory();
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
      ghost.__closingDetachedMotion = {
        alpha: target.isThumbnailChild ? 1 : 0,
        duration: folderCloseDuration,
        scale: motion.scale,
        x: motion.toX,
        y: motion.toY,
      };
      if (ghost.labelText?.visible) {
        if (target.sourceLabelAlpha != null) ghost.labelText.alpha = target.sourceLabelAlpha;
        transition(ghost.labelText)
          .duration(0.1)
          .ease("power2.in")
          .delay(motion.delay)
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 0 })
          .start();
        transition(ghost.labelText.scale)
          .duration(0.1)
          .ease("power2.in")
          .delay(motion.delay)
          .overlay()
          .interrupt("retarget")
          .to({ x: 0.94, y: 0.94 })
          .start();
      }
      layer.closingGhostLayer.addChild(ghost);
      if (typeof layer.hideIconNodesForTransition === "function") {
        layer.hideIconNodesForTransition(target.item.id, owner);
      } else {
        for (const node of layer.iconNodes.values()) {
          if (node.item?.id === target.item.id) node.visible = false;
        }
      }

      let didComplete = false;
      let motionControl = null;
      motionControl = animateClosingGhost(ghost, motion, target, () => {
        didComplete = true;
        if (motionControl) layer.closingGhostMotionControls?.delete(motionControl);
        this.completeGhost(state, target, ghost);
      }, {
        scheduler: this.scheduler,
        onVisualArrive: () => this.markClosingGhostVisuallyArrived(state, target),
      });
      if (!didComplete && layer.closingGhostKeys?.has(target.item.id)) {
        layer.closingGhostMotionControls.add(motionControl);
      }
    }
  }

  flushCompletedControllerGhosts(state) {
    const layer = this.layer;
    const pendingKeys = Array.from(layer.pendingClosingControllerGhostKeys || []);
    const keys = pendingKeys.length
      ? Array.from(new Set([...pendingKeys, ...(layer.completedClosingControllerGhostKeys || [])]))
      : layer.completedClosingControllerGhostKeys || [];
    layer.pendingClosingControllerGhostKeys = new Set();
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
    this.layer.onClosingHandoffVisualRelease?.(this.layer.closingGhostFolderId || this.layer.currentFolderId || null);
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.clearClosingGhostVisuals();
    this.layer.clearFrameGhost();
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
  }

  clearClosingGhostVisuals() {
    const layer = this.layer;
    this.cancelMotionControls();
    layer.closingGhostKeys?.clear();
    layer.closingVisualGhostKeys?.clear();
    const ghosts = layer.closingGhostLayer?.removeChildren?.() || [];
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      if (!ghost.destroyed) ghost.destroy?.({ children: true });
    }
  }

  deferRunHandoffVisualCleanup() {
    if (this.layer.closingHandoffVisualCleanupScheduled) return;
    this.layer.closingHandoffVisualCleanupScheduled = true;
    scheduleClosingHandoffCleanup(this.layer, () => {
      this.clearHandoffOverlayVisuals();
      this.deferRunHandoffCleanup();
    }, this.scheduler);
  }

  runHandoffCleanup() {
    const layer = this.layer;
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    this.clearFolderHandoffGhost();
    layer.visible = false;
    layer.currentFolderId = null;
    layer.closingGhostFolderId = null;
    setLayerClosingHandoffActive(layer, false);
  }

  releaseClosingTransitionOwnership(options = {}) {
    const layer = this.layer;
    const sessionToken = layer.closingGhostSessionToken || null;
    if (sessionToken == null) return false;
    layer.releaseTransitionOwnership?.(sessionToken, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    layer.closingGhostSessionToken = null;
    return true;
  }

  isHandoffVisuallyReady() {
    const layer = this.layer;
    return !(
      layer.openingGhostKeys?.size ||
      layer.closingVisualGhostKeys?.size ||
      layer.closingPreviewSwapKeys?.size ||
      !(layer.closingFrameVisualComplete || layer.closingFrameComplete)
    );
  }

  isOverlaySettled() {
    const layer = this.layer;
    return !(
      layer.openingGhostKeys?.size ||
      layer.closingGhostKeys?.size ||
      layer.closingPreviewSwapKeys?.size ||
      !layer.closingFrameComplete
    );
  }

  finishTransition(state) {
    const layer = this.layer;
    if (!layer.closingHandoffActive) {
      if (!this.isHandoffVisuallyReady()) return;
      this.clearRevealTimer();
      layer.panel.visible = false;
      layer.pageTrack.visible = false;
      setLayerClosingHandoffActive(layer, true);
      if (this.isOverlaySettled()) this.deferRunHandoffVisualCleanup();
      this.flushCompletedControllerGhosts(state);
      return;
    }
    if (!this.isOverlaySettled()) return;
    this.deferRunHandoffVisualCleanup();
  }

  debugClosingGhostComplete(state, target, ghost, phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log || !options.timeline) return;
    const actualRect = ghost?.getIconBounds?.(state.stageRect) || null;
    const targetRect = stageLayoutRectToStageVisualRect(state.stageRect, state.width, state.height, target?.targetStageLayoutRect);
    const payload = {
      actualRect: roundRect(actualRect),
      alpha: roundNumber(ghost?.alpha),
      delta: rectDelta(actualRect, targetRect),
      folderId: state.renderedFolder?.id || this.layer.closingGhostFolderId || null,
      isThumbnailChild: Boolean(target?.isThumbnailChild),
      itemId: target?.item?.id || null,
      phase,
      previewSlotIndex: target?.previewSlotIndex ?? null,
      scaleX: roundNumber(ghost?.scale?.x),
      scaleY: roundNumber(ghost?.scale?.y),
      targetRect: roundRect(targetRect),
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
    if (target.isThumbnailChild) layer.closingVisualGhostKeys?.delete(target.item.id);
    const controllerGhostKey = getClosingControllerGhostKey(state, target);
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
    this.layer.closingFrameVisualComplete = true;
    this.finishTransition(state);
  }

  markClosingGhostVisuallyArrived(state, target) {
    if (!target?.isThumbnailChild) return;
    this.layer.closingVisualGhostKeys?.delete(target.item?.id);
    this.finishTransition(state);
  }

  clear(options = {}) {
    const layer = this.layer;
    this.cancelHandoffCleanup();
    this.clearRevealTimer();
    this.cancelMotionControls();
    layer.closingGhostKeys?.clear();
    layer.closingVisualGhostKeys?.clear();
    layer.closingPreviewSwapKeys?.clear();
    layer.closingFrameComplete = false;
    layer.closingFrameVisualComplete = false;
    layer.closingHandoffVisualCleanupScheduled = false;
    layer.completedClosingControllerGhostKeys = [];
    layer.pendingClosingControllerGhostKeys = new Set();
    layer.completedClosingPreviewGhosts = [];
    this.releaseClosingTransitionOwnership({
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.clearFolderHandoffGhost();
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    layer.closingFrameDetachedTarget = null;
    setLayerClosingHandoffActive(layer, false);
    layer.clearFrameGhost();
    layer.panel.visible = true;
    if (!layer.releaseTransitionOwnership && options.restorePageTrack !== false) layer.pageTrack.visible = true;
    if (!layer.releaseTransitionOwnership && options.reveal !== false) {
      layer.revealIconNodes();
      layer.rebuildPageTrackMask();
    }
    const ghosts = layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
    this.previewSwap.clear();
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
