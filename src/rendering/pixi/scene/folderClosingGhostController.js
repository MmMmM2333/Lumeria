import { killAllMotion } from "../animation/motionCleanup.js";
import { parallel, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import {
  readLaunchpadDebugValue,
  setLaunchpadDebugValue,
} from "../debugNamespace.js";
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
import { ensureFolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundNumber,
  roundRect,
} from "./folderHandoffDebug.js";
import { ensureLayerTransitionPort } from "./layerTransitionPort.js";

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
  const previous = readLaunchpadDebugValue("lastFolderHandoff");
  setLaunchpadDebugValue("lastFolderHandoff", {
    ...(previous && typeof previous === "object" ? previous : {}),
    ...payload,
    desktopLogged: false,
  });
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
  const handoffCoordinator = layer.folderHandoff || null;
  if (!handoffCoordinator?.hasActiveOpeningVisuals?.() || typeof layer.openingGhosts?.releaseGhost !== "function") return released;
  for (const target of targets || []) {
    const itemId = target?.item?.id;
    if (!itemId || !target?.targetStageLayoutRect || !handoffCoordinator.hasOpeningGhost(itemId)) continue;
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
    this.handoffCoordinator = options.handoffCoordinator || ensureFolderHandoffCoordinator(layer);
    this.transitionPort = options.transitionPort || ensureLayerTransitionPort(layer);
    this.scheduler = options.scheduler || globalThis;
    this.ghostFactory = options.ghostFactory;
    this.previewSwap = options.previewSwap || { clear: () => {}, start: () => {} };
    this.handoffCoordinator.setCloseHandoffActive(false);
  }

  clearRevealTimer() {
    this.handoffCoordinator.clearRevealTimer(this.scheduler.clearTimeout?.bind(this.scheduler));
  }

  scheduleRevealFallback(targets) {
    const layer = this.layer;
    this.clearRevealTimer();
    const maxDelay = getMaxFolderGhostGridDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const fallbackSeconds = Math.max(motionPresets.folderClose.duration, CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round(
      (maxDelay + fallbackSeconds + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
    );
    this.handoffCoordinator.setRevealTimer(this.scheduler.setTimeout?.(() => {
      this.handoffCoordinator.clearRevealTimerRef();
      if (this.handoffCoordinator.hasActiveCloseVisuals()) this.clear();
    }, timeoutMs) || null);
  }

  hasActive() {
    return this.handoffCoordinator.hasActiveCloseVisuals();
  }

  begin(folderId, options = {}) {
    this.clear(options);
    this.handoffCoordinator.beginCloseTransition(folderId, { closeToken: options.closeToken || null });
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
    const closeFrameFromRect = this.transitionPort.getClosingFrameStartRect(panelRect, folderId);
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
    const closeToken = this.transitionPort.createClosingGhostToken(folderId);
    this.begin(folderId, { closeToken, restorePageTrack: false, reveal: false });
    const owner = {
      folderId,
      kind: "closing",
      token: closeToken,
    };
    this.transitionPort.acquireDesktopSourceOwnership(owner);
    clearOpeningGhostsForClosing(layer);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget);
    const isRetargetedOpeningClose = releasedOpeningGhosts.size > 0;
    const frameDuration = motionPresets.folderClose.duration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    this.handoffCoordinator.setCloseHandoffGeometry({
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
      this.previewSwap.start(
        state,
        previewSwapTargets,
        previewTiming,
        (finishState, events) => this.handleSettlementEvents(finishState, events),
        { closeToken }
      );
    };
    this.transitionPort.enableClosingFrameMask();
    const completeFrameVisual = () => {
      this.handleSettlementEvents(state, this.handoffCoordinator.completeCloseFrameVisual(closeToken));
    };
    this.transitionPort.startFrameGhost(closeFrameFromRect, closeFrameToRect, {
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
        this.completeFrameGhost(state, closeToken);
      },
      onArrive: completeFrameVisual,
      preserveOnComplete: true,
      toFillAlpha: thumb.fillAlpha,
      toFillColor: thumb.fillColor,
      toRadius: thumb.radius,
      toStrokeAlpha: thumb.strokeAlpha,
      toStrokeColor: thumb.strokeColor,
      toStrokeWidth: thumb.strokeWidth,
      updateClosingMask: true,
    });

    this.transitionPort.hidePageTrackForTransition(owner);
    if (usableTargets.length) this.scheduleRevealFallback(usableTargets);

    this.handoffCoordinator.trackCloseGhosts(
      usableTargets,
      (target) => getClosingControllerGhostKey(state, target)
    );

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
      this.handoffCoordinator.setDetachedClosingGhostMotion(ghost, {
        alpha: target.isThumbnailChild ? 1 : 0,
        duration: motionPresets.folderClose.duration,
        scale: ghostMotion.scale,
        x: ghostMotion.toX,
        y: ghostMotion.toY,
      });
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
      this.transitionPort.addClosingGhost(ghost);
      this.transitionPort.hideIconNodesForTransition(target.item.id, owner);

      let didComplete = false;
      let motionControl = null;
      motionControl = animateClosingGhost(ghost, ghostMotion, target, () => {
        didComplete = true;
        if (motionControl) this.handoffCoordinator.deleteCloseMotionControl(motionControl);
        this.completeGhost(state, target, ghost, closeToken);
      }, {
        scheduler: this.scheduler,
        onVisualArrive: () => this.markClosingGhostVisuallyArrived(state, target, ghost, closeToken),
      });
      if (!didComplete && this.handoffCoordinator.hasCloseGhost(target.item.id)) {
        this.handoffCoordinator.addCloseMotionControl(motionControl);
      }
    }
    this.transitionPort.notifyClosingHandoffPrepare(folderId);
  }

  flushCompletedControllerGhosts(state) {
    const keys = this.handoffCoordinator.consumeControllerGhostKeys();
    for (const key of keys) state.completeFolderCloseIconGhost?.(key);
  }

  hasPendingHandoff() {
    return this.handoffCoordinator.isCloseHandoffActive();
  }

  clearFolderHandoffGhost() {
    const ghost = this.handoffCoordinator.takeFolderHandoffGhost();
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
    const ghosts = this.handoffCoordinator.consumeCompletedPreviewGhosts();
    this.destroyCompletedPreviewGhosts(ghosts);
  }

  cancelHandoffCleanup() {
    cancelClosingHandoffCleanup(this.layer, this.scheduler.cancelAnimationFrame);
  }

  cancelMotionControls() {
    const controls = this.handoffCoordinator.consumeCloseMotionControls();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  deferRunHandoffCleanup() {
    scheduleClosingHandoffCleanup(this.layer, () => this.runHandoffCleanup(), this.scheduler);
  }

  commitHandoffVisualRelease(token = this.handoffCoordinator.closeToken) {
    const layer = this.layer;
    const settlementEvents = this.handoffCoordinator.releaseCloseOverlayVisuals(token);
    if (!settlementEvents) return [];
    this.debugHandoffVisualRelease("overlay-release-before-clear");
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.clearClosingGhostVisuals();
    this.transitionPort.clearFrameGhost();
    this.debugHandoffVisualRelease("overlay-release-after-clear");
    this.transitionPort.notifyClosingHandoffVisualRelease(this.handoffCoordinator.folderId || layer.currentFolderId || null);
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    return settlementEvents;
  }

  clearClosingGhostVisuals() {
    this.cancelMotionControls();
    this.handoffCoordinator.clearCloseGhostKeys();
    const ghosts = this.transitionPort.removeClosingGhosts();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.handoffCoordinator.deleteDetachedClosingGhostMotion(ghost);
      if (!ghost.destroyed) ghost.destroy?.({ children: true });
    }
  }

  runHandoffCleanup() {
    const layer = this.layer;
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    this.clearFolderHandoffGhost();
    layer.visible = false;
    layer.currentFolderId = null;
    this.handoffCoordinator.finishCloseHandoffCleanup();
  }

  releaseClosingTransitionOwnership(options = {}) {
    const closeToken = this.handoffCoordinator.takeCloseToken();
    if (closeToken == null) return false;
    this.transitionPort.releaseTransitionOwnership(closeToken, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    return true;
  }

  handleSettlementEvents(state, events = []) {
    for (const event of events || []) {
      if (event?.type === "handoffReady") {
        this.startClosingHandoff(state, event.token);
      } else if (event?.type === "overlaySettled") {
        this.deferRunHandoffCleanup();
      }
    }
  }

  startClosingHandoff(state, token = this.handoffCoordinator.closeToken) {
    if (!this.handoffCoordinator.startCloseHandoff()) return;
    this.clearRevealTimer();
    this.transitionPort.setPanelVisible(false);
    this.transitionPort.setPageTrackVisible(false);
    const settlementEvents = this.commitHandoffVisualRelease(token);
    this.flushCompletedControllerGhosts(state);
    this.handleSettlementEvents(state, settlementEvents);
  }

  makeClosingGhostDebugPayload(state, target, ghost, phase) {
    const actualRect = ghost?.getIconBounds?.(state.stageRect) || null;
    const targetRect = stageLayoutRectToStageVisualRect(state.stageRect, state.width, state.height, target?.targetStageLayoutRect);
    return {
      actualRect: roundRect(actualRect),
      alpha: roundNumber(ghost?.alpha),
      delta: rectDelta(actualRect, targetRect),
      folderId: state.renderedFolder?.id || this.handoffCoordinator.folderId || this.layer.currentFolderId || null,
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
  }

  debugHandoffVisualRelease(phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return;
    const closeSnapshot = this.handoffCoordinator.snapshot();
    const debugSnapshot = this.transitionPort.getDebugSnapshot();
    const folderId = closeSnapshot.folderId || this.layer.currentFolderId || null;
    const payload = {
      closingFrameComplete: closeSnapshot.frameComplete,
      closingFrameVisualComplete: closeSnapshot.frameVisualComplete,
      closingGhostCount: debugSnapshot.closingGhostCount,
      closingGhostKeys: Array.from(closeSnapshot.ghostKeys),
      closingPreviewSwapKeys: Array.from(closeSnapshot.previewSwapKeys),
      closingVisualGhostKeys: Array.from(closeSnapshot.visualGhostKeys),
      folderId,
      framePresentation: roundRect(debugSnapshot.framePresentation),
      panelVisible: debugSnapshot.panelVisible,
      pageTrackVisible: debugSnapshot.pageTrackVisible,
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
    console.log("[folder-closing-ghost-complete]", payload);
  }

  completeGhost(state, target, ghost, token = this.handoffCoordinator.closeToken) {
    const layer = this.layer;
    if (!ghost || ghost.closingComplete) return;
    const controllerGhostKey = getClosingControllerGhostKey(state, target);
    const settlementEvents = this.handoffCoordinator.completeCloseGhost(token, target.item.id, controllerGhostKey);
    if (!settlementEvents) return;
    ghost.closingComplete = true;
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
      this.handoffCoordinator.addCompletedPreviewGhost(ghost);
      this.handleSettlementEvents(state, settlementEvents);
      return;
    }
    this.handleSettlementEvents(state, settlementEvents);
  }

  completeFrameGhost(state, token = this.handoffCoordinator.closeToken) {
    this.handleSettlementEvents(state, this.handoffCoordinator.completeCloseFrame(token));
  }

  markClosingGhostVisuallyArrived(state, target, ghost = null, token = this.handoffCoordinator.closeToken) {
    if (!target?.isThumbnailChild) return;
    const settlementEvents = this.handoffCoordinator.completeCloseGhostVisual(token, target.item?.id);
    if (!settlementEvents) return;
    this.debugClosingGhostVisualArrive(state, target, ghost);
    this.handleSettlementEvents(state, settlementEvents);
  }

  clear(options = {}) {
    this.cancelHandoffCleanup();
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.releaseClosingTransitionOwnership({
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.clearFolderHandoffGhost();
    this.handoffCoordinator.clearCloseVisualState();
    this.transitionPort.clearFrameGhost();
    this.transitionPort.setPanelVisible(true);
    const ghosts = this.transitionPort.removeClosingGhosts();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.handoffCoordinator.deleteDetachedClosingGhostMotion(ghost);
      ghost.destroy?.({ children: true });
    }
    this.previewSwap.clear();
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
