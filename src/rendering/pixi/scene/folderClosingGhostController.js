import { killAllMotion } from "../animation/motionCleanup.js";
import { parallel, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
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
import { makeDesktopSourceVisualKey } from "./folderVisualOwnershipRegistry.js";
import {
  cancelClosingHandoffCleanup,
  scheduleClosingHandoffCleanup,
} from "./folderClosingHandoff.js";
import { ensureFolderCloseSession } from "./folderCloseSession.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundNumber,
  roundRect,
} from "./folderHandoffDebug.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const CLOSING_GHOST_MAX_DELAY = 0.06;
const CLOSING_FRAME_TAIL_DURATION = 0.04;
const CLOSING_EXTRA_GHOST_ALPHA_DURATION = 0.12;
const CLOSING_EXTRA_GHOST_ALPHA_HOLD = 0.16;
const CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;
const CLOSING_PREVIEW_FALLBACK_DURATION = 0.22;
const CLOSING_GHOST_VISUAL_POSITION_EPSILON = 0.5;
const CLOSING_GHOST_VISUAL_SCALE_EPSILON = 0.01;

function publishLastFolderHandoffDebug(payload) {
  const folderId = payload?.folderId || null;
  if (!folderId) return;
  const previous = globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__;
  globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__ = {
    ...(previous && typeof previous === "object" ? previous : {}),
    ...payload,
    desktopLogged: false,
  };
}

function getClosingControllerGhostKey(state, target) {
  return target?.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target?.item?.id, target?.index) || null;
}

function animateClosingGhost(ghost, ghostMotion, target, onComplete, options = {}) {
  const positionSpring = { ...motionSprings.handoff, arriveDelta: CLOSING_GHOST_VISUAL_POSITION_EPSILON };
  const scaleSpring = { ...motionSprings.handoff, arriveDelta: CLOSING_GHOST_VISUAL_SCALE_EPSILON };
  const motionOptions = { delay: ghostMotion.delay };
  if (!target.isThumbnailChild) {
    motion(ghost)
      .duration(CLOSING_EXTRA_GHOST_ALPHA_DURATION)
      .ease("power2.in")
      .delay(ghostMotion.alphaDelay)
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 0 })
      .start();
  }
  return parallel([
    motion(ghost)
      .spring(positionSpring)
      .handoff()
      .interrupt("retarget")
      .to({ ...motionOptions, x: ghostMotion.toX, y: ghostMotion.toY }),
    motion(ghost.scale)
      .spring(scaleSpring)
      .handoff()
      .interrupt("retarget")
      .to({ ...motionOptions, x: ghostMotion.scale, y: ghostMotion.scale }),
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

function resolveClosingFrameStartRect(layer, panelRect, folderId) {
  if (layer.frameGhostFolderId !== folderId) return panelRect;
  return cloneFramePresentation(layer.frameGhostState) || panelRect;
}

function acquireClosingDesktopSourceOwnership(layer, owner) {
  const key = makeDesktopSourceVisualKey(owner?.folderId);
  if (!key || typeof layer.acquireVisualOwnership !== "function") return;
  layer.acquireVisualOwnership(key, owner);
}

function clearOpeningGhostsForClosing(layer) {
  layer.openingGhosts.clear({
    cancelSession: true,
    completeControllerKeys: false,
    restorePageTrack: false,
    reveal: false,
  });
}

export class FolderClosingGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.closeSession = options.closeSession || ensureFolderCloseSession(layer);
    this.scheduler = options.scheduler || globalThis;
    this.ghostFactory = options.ghostFactory;
    this.previewSwap = options.previewSwap || { clear: () => {}, start: () => {} };
    this.closeSession.setHandoffActive(false);
  }

  clearRevealTimer() {
    this.closeSession.clearRevealTimer(this.scheduler.clearTimeout?.bind(this.scheduler));
  }

  scheduleRevealFallback(targets) {
    const layer = this.layer;
    this.clearRevealTimer();
    const maxDelay = getMaxFolderGhostGridDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const fallbackSeconds = Math.max(motionPresets.folderClose.duration, CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round(
      (maxDelay + fallbackSeconds + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
    );
    this.closeSession.setRevealTimer(this.scheduler.setTimeout?.(() => {
      this.closeSession.clearRevealTimerRef();
      if (layer.closingGhostKeys?.size || layer.closingPreviewSwapKeys?.size) this.clear();
    }, timeoutMs) || null);
  }

  hasActive() {
    return this.closeSession.hasActiveVisuals();
  }

  begin(folderId, options = {}) {
    this.clear(options);
    this.closeSession.begin(folderId);
    this.clearFolderHandoffGhost();
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
    const closeFrameFromRect = resolveClosingFrameStartRect(layer, panelRect, folderId);
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
    this.begin(folderId, { restorePageTrack: false, reveal: false });
    const sessionToken = layer.createClosingGhostSessionToken(folderId);
    this.closeSession.setSessionToken(sessionToken);
    const owner = {
      folderId,
      kind: "closing",
      token: sessionToken,
    };
    acquireClosingDesktopSourceOwnership(layer, owner);
    clearOpeningGhostsForClosing(layer);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget);
    const isRetargetedOpeningClose = releasedOpeningGhosts.size > 0;
    const frameDuration = motionPresets.folderClose.duration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    this.closeSession.setHandoffGeometry({
      detachedTarget: {
        ...closeFrameToRect,
        fillAlpha: thumb.fillAlpha,
        fillColor: thumb.fillColor,
        radius: thumb.radius,
        strokeAlpha: thumb.strokeAlpha,
        strokeColor: thumb.strokeColor,
        strokeWidth: thumb.strokeWidth,
      },
      rect: handoffRect || folderRect,
      target: handoffTarget || null,
    });
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
      if (!this.closeSession.markFrameVisualComplete()) return;
      this.finishTransition(state);
    };
    layer.startFrameGhost(closeFrameFromRect, closeFrameToRect, {
      duration: frameDuration,
      ease: motionPresets.folderClose.ease,
      fadeStart: 0.86,
      folderId,
      frameGhostPhase: "closing",
      frameGhostToAlpha: 1,
      fromFillAlpha: thumb.fillAlpha,
      fromFillColor: thumb.fillColor,
      fromRadius: closeFrameFromRect?.radius ?? 48,
      fromStrokeAlpha: thumb.strokeAlpha,
      fromStrokeColor: thumb.strokeColor,
      fromStrokeWidth: thumb.strokeWidth,
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

    layer.hidePageTrackForTransition(owner);
    if (usableTargets.length) this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const controllerGhostKey = getClosingControllerGhostKey(state, target);
      this.closeSession.addGhostTarget(target, controllerGhostKey);
    }

    for (const target of usableTargets) {
      const released = releasedOpeningGhosts.get(target.item?.id);
      const ghost = released?.ghost || this.ghostFactory();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      const ghostMotion = makeClosingGhostMotion(target, {
        alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
        closeDuration: motionPresets.folderClose.duration,
        isTextlessMode: state.isTextlessMode,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(ghostMotion.fromX, ghostMotion.fromY);
      ghost.scale.set(ghostMotion.sourceScale);
      ghost.alpha = ghostMotion.sourceAlpha;
      ghost.__closingDetachedMotion = {
        alpha: target.isThumbnailChild ? 1 : 0,
        duration: motionPresets.folderClose.duration,
        scale: ghostMotion.scale,
        x: ghostMotion.toX,
        y: ghostMotion.toY,
      };
      if (ghost.labelText?.visible) {
        if (target.sourceLabelAlpha != null) ghost.labelText.alpha = target.sourceLabelAlpha;
        motion(ghost.labelText)
          .duration(0.1)
          .ease("power2.in")
          .delay(ghostMotion.delay)
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 0 })
          .start();
        motion(ghost.labelText.scale)
          .duration(0.1)
          .ease("power2.in")
          .delay(ghostMotion.delay)
          .overlay()
          .interrupt("retarget")
          .to({ x: 0.94, y: 0.94 })
          .start();
      }
      layer.closingGhostLayer.addChild(ghost);
      layer.hideIconNodesForTransition(target.item.id, owner);

      let didComplete = false;
      let motionControl = null;
      motionControl = animateClosingGhost(ghost, ghostMotion, target, () => {
        didComplete = true;
        if (motionControl) this.closeSession.deleteMotionControl(motionControl);
        this.completeGhost(state, target, ghost);
      }, {
        scheduler: this.scheduler,
        onVisualArrive: () => this.markClosingGhostVisuallyArrived(state, target, ghost),
      });
      if (!didComplete && this.closeSession.hasGhost(target.item.id)) {
        this.closeSession.addMotionControl(motionControl);
      }
    }
  }

  flushCompletedControllerGhosts(state) {
    const keys = this.closeSession.consumeControllerGhostKeys();
    for (const key of keys) state.completeFolderCloseIconGhost?.(key);
  }

  hasPendingHandoff() {
    return this.closeSession.isHandoffActive();
  }

  clearFolderHandoffGhost() {
    const ghost = this.closeSession.takeFolderHandoffGhost();
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
    const controls = this.closeSession.consumeMotionControls();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  deferRunHandoffCleanup() {
    scheduleClosingHandoffCleanup(this.layer, () => this.runHandoffCleanup(), this.scheduler);
  }

  clearHandoffOverlayVisuals() {
    this.commitHandoffVisualRelease();
  }

  commitHandoffVisualRelease() {
    const layer = this.layer;
    if (!this.closeSession.markHandoffVisualReleased()) return;
    this.debugHandoffVisualRelease("overlay-release-before-clear");
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.clearClosingGhostVisuals();
    this.closeSession.markFrameComplete();
    layer.clearFrameGhost();
    this.debugHandoffVisualRelease("overlay-release-after-clear");
    layer.onClosingHandoffVisualRelease?.(layer.closingGhostFolderId || layer.currentFolderId || null);
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
  }

  clearClosingGhostVisuals() {
    const layer = this.layer;
    this.cancelMotionControls();
    this.closeSession.clearGhostKeys();
    const ghosts = layer.closingGhostLayer?.removeChildren?.() || [];
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      if (!ghost.destroyed) ghost.destroy?.({ children: true });
    }
  }

  deferRunHandoffVisualCleanup() {
    if (!this.closeSession.markHandoffVisualCleanupScheduled()) return;
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
    this.closeSession.clearFolderId();
    this.closeSession.clearHandoffVisualReleased();
    this.closeSession.setHandoffActive(false);
  }

  releaseClosingTransitionOwnership(options = {}) {
    const layer = this.layer;
    const sessionToken = this.closeSession.sessionToken;
    if (sessionToken == null) return false;
    layer.releaseTransitionOwnership(sessionToken, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.closeSession.clearSessionToken();
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
      this.closeSession.setHandoffActive(true);
      this.commitHandoffVisualRelease();
      this.deferRunHandoffCleanup();
      this.flushCompletedControllerGhosts(state);
      return;
    }
    if (!this.isOverlaySettled()) return;
    this.deferRunHandoffVisualCleanup();
  }

  makeClosingGhostDebugPayload(state, target, ghost, phase) {
    const actualRect = ghost?.getIconBounds?.(state.stageRect) || null;
    const targetRect = stageLayoutRectToStageVisualRect(state.stageRect, state.width, state.height, target?.targetStageLayoutRect);
    return {
      actualRect: roundRect(actualRect),
      alpha: roundNumber(ghost?.alpha),
      delta: rectDelta(actualRect, targetRect),
      folderId: state.renderedFolder?.id || this.layer.closingGhostFolderId || this.layer.currentFolderId || null,
      isThumbnailChild: Boolean(target?.isThumbnailChild),
      itemId: target?.item?.id || null,
      phase,
      previewSlotIndex: target?.previewSlotIndex ?? null,
      scaleX: roundNumber(ghost?.scale?.x),
      scaleY: roundNumber(ghost?.scale?.y),
      targetRect: roundRect(targetRect),
      x: roundNumber(ghost?.x ?? ghost?.position?.x),
      y: roundNumber(ghost?.y ?? ghost?.position?.y),
    };
  }

  debugClosingGhostVisualArrive(state, target, ghost) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return;
    const payload = this.makeClosingGhostDebugPayload(state, target, ghost, "visual-arrive");
    publishLastFolderHandoffDebug({
      folderId: payload.folderId,
      ghost: payload,
      phase: "visual-arrive",
    });
    console.log("[folder-closing-ghost-visual-arrive]", payload);
    if (!target?.isThumbnailChild) return;
    const slot = target.previewSlotIndex ?? "na";
    const itemId = target.item?.id || "unknown";
    console.log(`[folder-closing-ghost-compact-v3:visual-arrive:slot-${slot}:${itemId}]`, {
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

  debugHandoffVisualRelease(phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return;
    const layer = this.layer;
    const folderId = layer.closingGhostFolderId || layer.currentFolderId || null;
    const payload = {
      closingFrameComplete: Boolean(layer.closingFrameComplete),
      closingFrameVisualComplete: Boolean(layer.closingFrameVisualComplete),
      closingGhostCount: layer.closingGhostLayer?.children?.length ?? null,
      closingGhostKeys: Array.from(layer.closingGhostKeys || []),
      closingPreviewSwapKeys: Array.from(layer.closingPreviewSwapKeys || []),
      closingVisualGhostKeys: Array.from(layer.closingVisualGhostKeys || []),
      folderId,
      frameGhostState: roundRect(layer.frameGhostState),
      panelVisible: layer.panel?.visible ?? null,
      pageTrackVisible: layer.pageTrack?.visible ?? null,
      phase,
    };
    publishLastFolderHandoffDebug({
      folderId,
      overlay: payload,
      phase,
    });
    console.log("[folder-handoff-debug] overlay-release", payload);
  }

  debugClosingGhostComplete(state, target, ghost, phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log || !options.timeline) return;
    const payload = this.makeClosingGhostDebugPayload(state, target, ghost, phase);
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
    this.closeSession.deleteGhost(target.item.id);
    if (target.isThumbnailChild) this.closeSession.deleteVisualGhost(target.item.id);
    const controllerGhostKey = getClosingControllerGhostKey(state, target);
    this.closeSession.markControllerGhostComplete(controllerGhostKey);
    this.debugClosingGhostComplete(state, target, ghost, "before-complete");
    killAllMotion(ghost);
    if (target.isThumbnailChild && !ghost.destroyed) {
      const completedPreviewMotion = makeCompletedClosingPreviewMotion(target, {
        isTextlessMode: state.isTextlessMode,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(completedPreviewMotion.x, completedPreviewMotion.y);
      ghost.scale.set(completedPreviewMotion.scale);
      ghost.alpha = 1;
      this.debugClosingGhostComplete(state, target, ghost, "completed-preview");
      layer.completedClosingPreviewGhosts.push(ghost);
      this.finishTransition(state);
      return;
    }
    this.finishTransition(state);
  }

  completeFrameGhost(state) {
    this.closeSession.markFrameComplete();
    this.finishTransition(state);
  }

  markClosingGhostVisuallyArrived(state, target, ghost = null) {
    if (!target?.isThumbnailChild) return;
    this.debugClosingGhostVisualArrive(state, target, ghost);
    this.closeSession.deleteVisualGhost(target.item?.id);
    this.finishTransition(state);
  }

  clear(options = {}) {
    const layer = this.layer;
    this.cancelHandoffCleanup();
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.releaseClosingTransitionOwnership({
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.clearFolderHandoffGhost();
    this.closeSession.clearAfterVisualReset();
    layer.clearFrameGhost();
    layer.panel.visible = true;
    const ghosts = layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
    this.previewSwap.clear();
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
