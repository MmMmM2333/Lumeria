import { killAllMotion } from "../animation/motionCleanup.js";
import { parallel, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
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
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
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
  sceneDiagnosticsState.publish("folderHandoff", {
    ...payload,
    desktopLogged: false,
  }, { merge: true });
}

function getClosingControllerGhostKey(state, target) {
  return target?.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target?.item?.id, target?.index) || null;
}

function animateClosingGhost(ghost, ghostMotion, target, onComplete, options = {}) {
  const positionSpring = { ...motionSprings.handoff, arriveDelta: CLOSING_GHOST_VISUAL_POSITION_EPSILON };
  const scaleSpring = { ...motionSprings.handoff, arriveDelta: CLOSING_GHOST_VISUAL_SCALE_EPSILON };
  const motionOptions = { delay: ghostMotion.delay };
  if (options.animateAlpha !== false && !target.isThumbnailChild) {
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

function makeClosingGhostTargetKey(target) {
  const rect = target?.targetClientRect || target?.targetStageLayoutRect || {};
  return [
    target?.item?.id || "",
    target?.isThumbnailChild ? "thumb" : "icon",
    target?.previewSlotIndex ?? "",
    target?.iconSize ?? "",
    rect.left ?? "",
    rect.top ?? "",
    rect.width ?? "",
    rect.height ?? "",
  ].join("|");
}

function makeDetachedCloseFrameTarget(folderRect, stageRect) {
  const closeFrameToRect = clientRectToStageVisualRect(folderRect, stageRect);
  if (!closeFrameToRect) return null;
  const thumb = getFolderThumbMetrics(folderRect.width);
  return {
    ...closeFrameToRect,
    fillAlpha: thumb.fillAlpha,
    fillColor: thumb.fillColor,
    radius: thumb.radius,
    strokeAlpha: thumb.strokeAlpha,
    strokeColor: thumb.strokeColor,
    strokeWidth: thumb.strokeWidth,
  };
}

function makeClosingFrameTargetKey(rect, thumb) {
  if (!rect) return "";
  return [
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    thumb?.fillAlpha,
    thumb?.fillColor,
    thumb?.radius,
    thumb?.strokeAlpha,
    thumb?.strokeColor,
    thumb?.strokeWidth,
  ].join("|");
}

function normalizePageIndex(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function findOpeningGhost(transitionPort, itemId) {
  if (!itemId) return null;
  return (transitionPort.getOpeningGhostChildren?.() || []).find((ghost) =>
    ghost?.item?.id === itemId && !ghost.destroyed
  ) || null;
}

function canReuseOpeningGhostForClose(ghost, target, state) {
  const openingPageIndex = normalizePageIndex(ghost?.openingPageIndex);
  if (openingPageIndex == null) return true;
  const closingPageIndex = normalizePageIndex(target?.pageIndex ?? state?.folderPageIndex);
  return closingPageIndex == null || openingPageIndex === closingPageIndex;
}

function releaseOpeningGhostsForClosing(transitionPort, handoffCoordinator, state, targets) {
  const released = new Map();
  if (!handoffCoordinator?.hasActiveOpeningVisuals?.()) return released;
  for (const target of targets || []) {
    const itemId = target?.item?.id;
    if (!itemId || !hasUsableFolderGhostTarget(target) || !handoffCoordinator.hasOpeningGhost(itemId)) continue;
    const activeOpeningGhost = findOpeningGhost(transitionPort, itemId);
    if (!canReuseOpeningGhostForClose(activeOpeningGhost, target, state)) continue;
    const ghost = transitionPort.releaseOpeningGhost(itemId);
    const sourceRect = ghost?.getIconBounds?.(state.stageRect);
    if (!ghost || !sourceRect) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
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

function clearOpeningGhostsForClosing(transitionPort) {
  transitionPort.clearOpeningGhosts({
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
    this.activeGhostsByItemId = new Map();
    this.activeFrameState = null;
    this.handoffCoordinator.setCloseHandoffActive(false);
  }

  clearRevealTimer() {
    this.handoffCoordinator.clearRevealTimer(this.scheduler.clearTimeout?.bind(this.scheduler));
  }

  scheduleRevealFallback(targets) {
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
    const {
      handoffRect = null,
      handoffTarget = null,
      previewSwapTargets = [],
    } = options;
    const folderId = state.renderedFolder?.id || this.transitionPort.getCurrentFolderId() || null;
    const releasedOpeningGhosts = releaseOpeningGhostsForClosing(this.transitionPort, this.handoffCoordinator, state, targets);
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
    clearOpeningGhostsForClosing(this.transitionPort);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget);
    const isRetargetedOpeningClose = releasedOpeningGhosts.size > 0;
    const frameDuration = motionPresets.folderClose.duration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    this.handoffCoordinator.setCloseHandoffGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(folderRect, state.stageRect),
      rect: handoffRect || folderRect,
      target: handoffTarget || null,
    });
    const previewTiming = getClosingPreviewTiming(closeFrameFromRect, closeFrameToRect);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame) => {
      const currentPreviewSwapTargets = this.activeFrameState?.previewSwapTargets || previewSwapTargets;
      if (closingPreviewSwapStarted || isRetargetedOpeningClose || !currentPreviewSwapTargets?.length) return;
      if ((frame?.progress ?? 0) < previewTiming.progress) return;
      closingPreviewSwapStarted = true;
      if (this.activeFrameState) this.activeFrameState.previewSwapStarted = true;
      this.previewSwap.start(
        state,
        currentPreviewSwapTargets,
        previewTiming,
        (finishState, events) => this.handleSettlementEvents(finishState, events),
        { closeToken }
      );
    };
    this.transitionPort.enableClosingFrameMask();
    const completeFrameVisual = (completionState = state) => {
      this.handleSettlementEvents(completionState, this.handoffCoordinator.completeCloseFrameVisual(closeToken));
    };
    const makeFrameOptions = (completionState = state, frameThumb = thumb) => ({
      duration: frameDuration,
      ease: motionPresets.folderClose.ease,
      fadeStart: 0.86,
      folderId,
      frameGhostPhase: "closing",
      frameGhostToAlpha: 1,
      fromFillAlpha: frameThumb.fillAlpha,
      fromFillColor: frameThumb.fillColor,
      fromRadius: closeFrameFromRect?.radius ?? 48,
      fromStrokeAlpha: frameThumb.strokeAlpha,
      fromStrokeColor: frameThumb.strokeColor,
      fromStrokeWidth: frameThumb.strokeWidth,
      panelMaterialFinalAlpha: 0,
      panelMaterialFromAlpha: 0,
      panelMaterialToAlpha: 0,
      progressMilestones: [{
        callback: () => startClosingPreviewSwapWhenReady({ progress: previewTiming.progress }),
        progress: previewTiming.progress,
      }],
      onComplete: () => {
        startClosingPreviewSwapWhenReady({ progress: 1 });
        this.completeFrameGhost(completionState, closeToken);
      },
      onArrive: () => completeFrameVisual(completionState),
      preserveOnComplete: true,
      toFillAlpha: frameThumb.fillAlpha,
      toFillColor: frameThumb.fillColor,
      toRadius: frameThumb.radius,
      toStrokeAlpha: frameThumb.strokeAlpha,
      toStrokeColor: frameThumb.strokeColor,
      toStrokeWidth: frameThumb.strokeWidth,
      updateClosingMask: true,
    });
    const frameOptions = makeFrameOptions(state, thumb);
    this.activeFrameState = {
      closeToken,
      folderId,
      makeOptions: makeFrameOptions,
      previewSwapStarted: false,
      previewSwapTargets,
      targetKey: makeClosingFrameTargetKey(closeFrameToRect, thumb),
    };
    this.transitionPort.startFrameGhost(closeFrameFromRect, closeFrameToRect, frameOptions);

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

      this.startGhostMotion(state, target, ghost, closeToken, { animateAlpha: true });
    }
    this.transitionPort.notifyClosingHandoffPrepare(folderId);
  }

  startGhostMotion(state, target, ghost, closeToken, options = {}) {
    const itemId = target?.item?.id;
    if (!itemId || !ghost) return null;
    const ghostMotion = makeClosingGhostMotion(target, {
      alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
      closeDuration: motionPresets.folderClose.duration,
      isTextlessMode: state.isTextlessMode,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    this.handoffCoordinator.setDetachedClosingGhostMotion(ghost, {
      alpha: target.isThumbnailChild ? 1 : 0,
      duration: motionPresets.folderClose.duration,
      scale: ghostMotion.scale,
      x: ghostMotion.toX,
      y: ghostMotion.toY,
    });
    let didComplete = false;
    let motionControl = null;
    motionControl = animateClosingGhost(ghost, ghostMotion, target, () => {
      didComplete = true;
      if (motionControl) this.handoffCoordinator.deleteCloseMotionControl(motionControl);
      const active = this.activeGhostsByItemId.get(itemId);
      if (active?.ghost === ghost && (!motionControl || active.motionControl === motionControl)) {
        this.activeGhostsByItemId.delete(itemId);
      }
      this.completeGhost(state, target, ghost, closeToken);
    }, {
      animateAlpha: options.animateAlpha !== false,
      scheduler: this.scheduler,
      onVisualArrive: () => this.markClosingGhostVisuallyArrived(state, target, ghost, closeToken),
    });
    if (!didComplete && this.handoffCoordinator.hasCloseGhost(itemId)) {
      this.handoffCoordinator.addCloseMotionControl(motionControl);
      this.activeGhostsByItemId.set(itemId, {
        closeToken,
        ghost,
        motionControl,
        target,
        targetKey: makeClosingGhostTargetKey(target),
      });
    } else {
      this.activeGhostsByItemId.delete(itemId);
    }
    return motionControl;
  }

  retarget(state, targets, folderRect, panelRect, options = {}) {
    const folderId = state.renderedFolder?.id || this.transitionPort.getCurrentFolderId() || null;
    if (!folderId || this.handoffCoordinator.folderId !== folderId) return 0;
    const closeToken = this.handoffCoordinator.closeToken;
    if (closeToken == null || !this.handoffCoordinator.isCurrentCloseToken(closeToken)) return 0;
    const snapshot = this.handoffCoordinator.snapshot();
    if (snapshot.handoffVisualReleased || !this.handoffCoordinator.hasActiveCloseVisuals()) return 0;

    this.handoffCoordinator.setCloseHandoffGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(folderRect, state.stageRect),
      rect: options.handoffRect || folderRect,
      target: options.handoffTarget || null,
    });

    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = folderRect ? getFolderThumbMetrics(folderRect.width) : null;
    const frameTargetKey = makeClosingFrameTargetKey(closeFrameToRect, thumb);
    if (this.activeFrameState?.closeToken === closeToken &&
      this.activeFrameState.folderId === folderId &&
      closeFrameToRect) {
      if (Object.prototype.hasOwnProperty.call(options, "previewSwapTargets")) {
        this.activeFrameState.previewSwapTargets = options.previewSwapTargets || [];
      }
      this.previewSwap.retarget?.(state, this.activeFrameState.previewSwapTargets);
      if (frameTargetKey && this.activeFrameState.targetKey !== frameTargetKey) {
        const frameOptions = this.activeFrameState.makeOptions?.(state, thumb) || {};
        const retargetedFrame = this.transitionPort.retargetFrameGhost?.(closeFrameToRect, frameOptions);
        if (retargetedFrame) this.activeFrameState.targetKey = frameTargetKey;
      }
    }

    let retargeted = 0;
    const usableTargets = (targets || []).filter((target) =>
      target?.item?.id &&
      hasUsableFolderGhostTarget(target) &&
      this.handoffCoordinator.hasCloseGhost(target.item.id)
    );
    for (const target of usableTargets) {
      const itemId = target.item.id;
      const active = this.activeGhostsByItemId.get(itemId);
      const ghost = active?.ghost;
      if (!ghost || ghost.destroyed) continue;
      const targetKey = makeClosingGhostTargetKey(target);
      if (active.targetKey === targetKey) continue;
      if (active.motionControl) {
        this.handoffCoordinator.deleteCloseMotionControl(active.motionControl);
        active.motionControl.release?.();
      }
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState?.(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      this.startGhostMotion(state, target, ghost, closeToken, { animateAlpha: false });
      retargeted += 1;
    }
    return retargeted;
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
    destroyDisplayObjectAfterFrame(ghost, { children: true });
  }

  destroyCompletedPreviewGhosts(ghosts) {
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
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
    const settlementEvents = this.handoffCoordinator.releaseCloseOverlayVisuals(token);
    if (!settlementEvents) return [];
    this.debugHandoffVisualRelease("overlay-release-before-clear");
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.clearClosingGhostVisuals();
    this.activeFrameState = null;
    this.transitionPort.clearFrameGhost();
    this.debugHandoffVisualRelease("overlay-release-after-clear");
    this.transitionPort.notifyClosingHandoffVisualRelease(this.handoffCoordinator.folderId || this.transitionPort.getCurrentFolderId() || null);
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    return settlementEvents;
  }

  clearClosingGhostVisuals() {
    this.cancelMotionControls();
    this.handoffCoordinator.clearCloseGhostKeys();
    this.activeGhostsByItemId.clear();
    const ghosts = this.transitionPort.removeClosingGhosts();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.handoffCoordinator.deleteDetachedClosingGhostMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
  }

  runHandoffCleanup() {
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    this.clearFolderHandoffGhost();
    this.transitionPort.setLayerVisible(false);
    this.transitionPort.clearCurrentFolder();
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
    const targetRect = target?.targetClientRect
      ? clientRectToStageVisualRect(target.targetClientRect, state.stageRect)
      : stageLayoutRectToStageVisualRect(state.stageRect, state.width, state.height, target?.targetStageLayoutRect);
    return {
      actualRect: roundRect(actualRect),
      alpha: roundNumber(ghost?.alpha),
      delta: rectDelta(actualRect, targetRect),
      folderId: state.renderedFolder?.id || this.handoffCoordinator.folderId || this.transitionPort.getCurrentFolderId() || null,
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
    const folderId = closeSnapshot.folderId || this.transitionPort.getCurrentFolderId() || null;
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
    if (!ghost || ghost.closingComplete) return;
    const itemId = target?.item?.id;
    const controllerGhostKey = getClosingControllerGhostKey(state, target);
    const settlementEvents = this.handoffCoordinator.completeCloseGhost(token, target.item.id, controllerGhostKey);
    if (!settlementEvents) return;
    if (itemId) {
      const active = this.activeGhostsByItemId.get(itemId);
      if (active?.ghost === ghost) this.activeGhostsByItemId.delete(itemId);
    }
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
    this.activeFrameState = null;
    this.activeGhostsByItemId.clear();
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
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
    this.previewSwap.clear();
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
