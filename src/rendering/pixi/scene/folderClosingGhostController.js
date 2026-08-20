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
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { throwAfterVisualAdapterRollback } from "./folderVisualAdapterLifecycle.js";
import { assertFolderClosingPhaseReporter } from "./folderVisualSession.js";
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

function canReuseOpeningGhostForClose(ghost, target, state) {
  const openingPageIndex = normalizePageIndex(ghost?.openingPageIndex);
  if (openingPageIndex == null) return true;
  const closingPageIndex = normalizePageIndex(target?.pageIndex ?? state?.folderPageIndex);
  return closingPageIndex == null || openingPageIndex === closingPageIndex;
}

function releaseOpeningGhostsForClosing(reporter, state, targets) {
  const released = new Map();
  for (const target of targets || []) {
    const itemId = target?.item?.id;
    if (!itemId || !hasUsableFolderGhostTarget(target)) continue;
    const activeOpeningGhost = reporter.takeOpeningGhost(
      itemId,
      (ghost) => canReuseOpeningGhostForClose(ghost, target, state)
    );
    const ghost = activeOpeningGhost || null;
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

function preserveReleasedGhostPhysicalPose(ghost, sourceRect, stageRect) {
  if (!ghost || !sourceRect || typeof ghost.getIconBounds !== "function") return null;
  const previousScaleX = Math.max(0.0001, Number(ghost.scale?.x) || 1);
  const previousScaleY = Math.max(0.0001, Number(ghost.scale?.y) || 1);
  const currentRect = ghost.getIconBounds(stageRect);
  if (!currentRect || !Number.isFinite(currentRect.width) || !Number.isFinite(currentRect.height)) return null;
  const intrinsicWidth = currentRect.width / previousScaleX;
  const intrinsicHeight = currentRect.height / previousScaleY;
  if (!(intrinsicWidth > 0) || !(intrinsicHeight > 0)) return null;
  const nextScaleX = sourceRect.width / intrinsicWidth;
  const nextScaleY = sourceRect.height / intrinsicHeight;
  if (!(nextScaleX > 0) || !(nextScaleY > 0)) return null;
  ghost.scale.set(nextScaleX, nextScaleY);
  const adjustedRect = ghost.getIconBounds(stageRect);
  if (adjustedRect && ghost.position?.set) {
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const adjustedCenterX = adjustedRect.left + adjustedRect.width / 2;
    const adjustedCenterY = adjustedRect.top + adjustedRect.height / 2;
    ghost.position.set(
      (Number(ghost.position.x) || 0) + sourceCenterX - adjustedCenterX,
      (Number(ghost.position.y) || 0) + sourceCenterY - adjustedCenterY
    );
  }
  return {
    scaleX: nextScaleX,
    scaleY: nextScaleY,
    x: Number(ghost.position?.x) || 0,
    y: Number(ghost.position?.y) || 0,
  };
}

export class FolderClosingGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.scheduler = options.scheduler || globalThis;
    this.ghostFactory = options.ghostFactory;
    this.previewSwap = options.previewSwap || { clear: () => {}, start: () => {} };
    this.activeReporter = null;
    this.activeGhostsByItemId = new Map();
    this.activeFrameState = null;
    this.cleanupFrame = null;
    this.cleanupGeneration = 0;
    this.completedPreviewGhosts = [];
    this.motionControls = new Set();
    this.nextTargetGeneration = 1;
    this.owner = null;
    this.ownershipReleased = false;
    this.revealTimer = null;
    this.targetGeneration = 0;
  }

  prepare(plan = {}) {
    const state = plan.state;
    if (!state || typeof state !== "object") throw new TypeError("closing adapter plan requires state");
    const targets = Array.isArray(plan.targets) ? plan.targets : [];
    return {
      ghosts: targets
        .filter(hasUsableFolderGhostTarget)
        .map((target) => ({
          controllerKey: getClosingControllerGhostKey(state, target),
          itemId: target.item.id,
          visualCritical: Boolean(target.isThumbnailChild),
        })),
    };
  }

  start(plan = {}, reporter) {
    assertFolderClosingPhaseReporter(reporter);
    const state = plan.state;
    if (!state || typeof state !== "object") throw new TypeError("closing adapter plan requires state");
    this.clearVisuals({ restorePageTrack: false, reveal: false });
    this.activeReporter = reporter;
    this.owner = reporter.owner();
    this.ownershipReleased = false;
    try {
      this.startVisuals(
        state,
        Array.isArray(plan.targets) ? plan.targets : [],
        plan.folderRect,
        plan.panelRect,
        plan.options && typeof plan.options === "object" ? plan.options : {}
      );
    } catch (error) {
      throwAfterVisualAdapterRollback(error, () => {
        this.clearVisuals({ restorePageTrack: true, reveal: true });
      }, "closing visual startup and rollback both failed");
    }
    const isActive = () => this.activeReporter === reporter;
    return Object.freeze({
      cancel: (options = {}) => {
        if (isActive()) this.clearVisuals(options);
      },
      onHandoffReady: ({ controllerKeys = [] } = {}) => {
        if (isActive()) this.startClosingHandoff(state, controllerKeys);
      },
      onOverlaySettled: () => {
        if (isActive()) this.deferRunHandoffCleanup();
      },
      retarget: (nextPlan = {}) => {
        if (!isActive()) return;
        const nextState = nextPlan.state;
        if (!nextState || typeof nextState !== "object") throw new TypeError("closing retarget plan requires state");
        this.retargetVisuals(
          nextState,
          Array.isArray(nextPlan.targets) ? nextPlan.targets : [],
          nextPlan.folderRect,
          nextPlan.panelRect,
          nextPlan.options && typeof nextPlan.options === "object" ? nextPlan.options : {}
        );
      },
      snapshot: () => this.snapshot(reporter),
    });
  }

  snapshot(reporter = this.activeReporter) {
    const active = reporter != null && reporter === this.activeReporter;
    return Object.freeze({
      active,
      activeVisuals: active && Boolean(
        this.activeGhostsByItemId.size ||
        this.activeFrameState ||
        this.previewSwap.snapshot?.().activeKey
      ),
      motionControlCount: active ? this.motionControls.size : 0,
      preview: active ? this.previewSwap.snapshot?.() || null : null,
      revealTimerActive: active && this.revealTimer != null,
    });
  }

  clearRevealTimer() {
    this.targetGeneration = this.nextTargetGeneration++;
    if (this.revealTimer != null) this.scheduler.clearTimeout?.(this.revealTimer);
    this.revealTimer = null;
  }

  scheduleRevealFallback(targets) {
    this.clearRevealTimer();
    const reporter = this.activeReporter;
    if (!reporter) return;
    const targetGeneration = this.nextTargetGeneration++;
    this.targetGeneration = targetGeneration;
    const maxDelay = getMaxFolderGhostGridDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const fallbackSeconds = Math.max(motionPresets.folderClose.duration, CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round(
      (maxDelay + fallbackSeconds + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
    );
    this.revealTimer = this.scheduler.setTimeout?.(() => {
      if (this.activeReporter !== reporter || this.targetGeneration !== targetGeneration) return;
      this.revealTimer = null;
      if (this.hasActive()) {
        reporter.fail(new Error("folder closing visual watchdog expired before settlement"));
      }
    }, timeoutMs) || null;
  }

  hasActive() {
    const snapshot = this.activeReporter ? this.activeReporter.snapshot() : null;
    return Boolean(snapshot && (
      snapshot.ghostIds.length ||
      snapshot.previewKeys.length ||
      !snapshot.frameComplete
    ));
  }

  startVisuals(state, targets, folderRect, panelRect, options = {}) {
    const {
      handoffRect = null,
      openingCancelRequest = null,
      handoffTarget = null,
      previewSwapTargets = [],
    } = options;
    const reporter = this.activeReporter;
    const owner = this.owner;
    if (!reporter || !owner) throw new Error("closing visual scope is not active");
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const releasedOpeningGhosts = releaseOpeningGhostsForClosing(reporter, state, targets);
    const closeFrameFromRect = this.layer.getClosingFrameStartRect(panelRect, folderId);
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
    const openingRetirement = reporter.retireOpening();
    if (openingRetirement?.status === "stale") {
      throw new Error("closing visual scope lost ownership while retiring the opening scope");
    }
    this.layer.acquireDesktopSourceOwnership(owner);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget);
    const isRetargetedOpeningClose = releasedOpeningGhosts.size > 0;
    const frameDuration = motionPresets.folderClose.duration + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    reporter.setGeometry({
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
        () => {},
        { reporter }
      );
    };
    this.layer.enableClosingFrameMask();
    const completeFrameVisual = () => reporter.frameVisualReady();
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
        this.completeFrameGhost(completionState);
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
      folderId,
      openingCancelRequest: openingCancelRequest?.folderId === folderId ? openingCancelRequest : null,
      makeOptions: makeFrameOptions,
      previewSwapStarted: false,
      previewSwapTargets,
      targetKey: makeClosingFrameTargetKey(closeFrameToRect, thumb),
    };
    this.layer.startFrameGhost(closeFrameFromRect, closeFrameToRect, frameOptions);

    this.layer.hidePageTrackForTransition(owner);
    if (usableTargets.length) this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const released = releasedOpeningGhosts.get(target.item?.id);
      const ghost = released?.ghost || this.ghostFactory();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      const sourcePose = released
        ? preserveReleasedGhostPhysicalPose(ghost, released.sourceRect, state.stageRect)
        : null;
      const motionTarget = sourcePose ? { ...target, sourcePose } : target;
      const ghostMotion = makeClosingGhostMotion(motionTarget, {
        alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
        closeDuration: motionPresets.folderClose.duration,
        isTextlessMode: state.isTextlessMode,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(ghostMotion.fromX, ghostMotion.fromY);
      ghost.scale.set(ghostMotion.sourceScaleX, ghostMotion.sourceScaleY);
      ghost.alpha = ghostMotion.sourceAlpha;
      reporter.setDetachedGhostMotion(ghost, {
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
      this.layer.closingGhostLayer.addChild(ghost);
      this.layer.hideIconNodesForTransition(target.item.id, owner);

      this.startGhostMotion(state, motionTarget, ghost, { animateAlpha: true });
    }
    this.layer.onClosingHandoffPrepare(folderId);
  }

  startGhostMotion(state, target, ghost, options = {}) {
    const itemId = target?.item?.id;
    const reporter = this.activeReporter;
    if (!itemId || !ghost || !reporter) return null;
    const ghostMotion = makeClosingGhostMotion(target, {
      alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
      closeDuration: motionPresets.folderClose.duration,
      isTextlessMode: state.isTextlessMode,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    reporter.setDetachedGhostMotion(ghost, {
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
      if (motionControl) this.motionControls.delete(motionControl);
      const active = this.activeGhostsByItemId.get(itemId);
      if (active?.ghost === ghost && (!motionControl || active.motionControl === motionControl)) {
        this.activeGhostsByItemId.delete(itemId);
      }
      this.completeGhost(state, target, ghost, reporter);
    }, {
      animateAlpha: options.animateAlpha !== false,
      scheduler: this.scheduler,
      onVisualArrive: () => this.markClosingGhostVisuallyArrived(state, target, ghost, reporter),
    });
    const closeSnapshot = reporter.snapshot();
    if (!didComplete && closeSnapshot?.ghostIds.includes(itemId)) {
      this.motionControls.add(motionControl);
      this.activeGhostsByItemId.set(itemId, {
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

  retargetVisuals(state, targets, folderRect, panelRect, options = {}) {
    const reporter = this.activeReporter;
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const snapshot = reporter?.snapshot?.();
    if (!folderId || !snapshot || snapshot.folderId !== folderId) return 0;
    if (snapshot.visualReleased || snapshot.overlaySettled) return 0;

    reporter.setGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(folderRect, state.stageRect),
      rect: options.handoffRect || folderRect,
      target: options.handoffTarget || null,
    });

    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = folderRect ? getFolderThumbMetrics(folderRect.width) : null;
    const frameTargetKey = makeClosingFrameTargetKey(closeFrameToRect, thumb);
    let retargeted = 0;
    let targetChanged = false;
    if (this.activeFrameState?.folderId === folderId &&
      closeFrameToRect) {
      if (Object.prototype.hasOwnProperty.call(options, "previewSwapTargets")) {
        this.activeFrameState.previewSwapTargets = options.previewSwapTargets || [];
      }
      this.previewSwap.retarget?.(state, this.activeFrameState.previewSwapTargets);
      if (frameTargetKey && this.activeFrameState.targetKey !== frameTargetKey) {
        const frameOptions = this.activeFrameState.makeOptions?.(state, thumb) || {};
        const retargetedFrame = this.layer.retargetFrameGhost?.(closeFrameToRect, frameOptions);
        if (retargetedFrame) {
          this.activeFrameState.targetKey = frameTargetKey;
          targetChanged = true;
        }
      }
    }

    const usableTargets = (targets || []).filter((target) =>
      target?.item?.id &&
      hasUsableFolderGhostTarget(target) &&
      snapshot.ghostIds.includes(target.item.id)
    );
    for (const target of usableTargets) {
      const itemId = target.item.id;
      const active = this.activeGhostsByItemId.get(itemId);
      const ghost = active?.ghost;
      if (!ghost || ghost.destroyed) continue;
      const targetKey = makeClosingGhostTargetKey(target);
      if (active.targetKey === targetKey) continue;
      if (active.motionControl) {
        this.motionControls.delete(active.motionControl);
        active.motionControl.release?.();
      }
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState?.(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      this.startGhostMotion(state, target, ghost, { animateAlpha: false });
      retargeted += 1;
      targetChanged = true;
    }
    if (targetChanged) this.scheduleRevealFallback(usableTargets);
    return retargeted;
  }

  flushCompletedControllerGhosts(state, keys = []) {
    for (const key of new Set(keys || [])) state.completeFolderCloseIconGhost?.(key);
  }

  hasPendingHandoff() {
    return this.activeReporter?.snapshot?.()?.handoffActive === true;
  }

  destroyCompletedPreviewGhosts(ghosts) {
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
  }

  clearCompletedPreviewGhosts() {
    const ghosts = this.completedPreviewGhosts;
    this.completedPreviewGhosts = [];
    this.destroyCompletedPreviewGhosts(ghosts);
  }

  cancelHandoffCleanup() {
    this.cleanupGeneration += 1;
    if (this.cleanupFrame != null) this.scheduler.cancelAnimationFrame?.(this.cleanupFrame);
    this.cleanupFrame = null;
  }

  cancelMotionControls() {
    const controls = this.motionControls;
    this.motionControls = new Set();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  deferRunHandoffCleanup() {
    this.cancelHandoffCleanup();
    const generation = ++this.cleanupGeneration;
    const cleanup = () => {
      if (generation !== this.cleanupGeneration) return;
      this.cleanupFrame = null;
      this.runHandoffCleanup();
    };
    if (typeof this.scheduler.requestAnimationFrame === "function") {
      this.cleanupFrame = this.scheduler.requestAnimationFrame(cleanup);
    } else {
      cleanup();
    }
  }

  commitHandoffVisualRelease() {
    const reporter = this.activeReporter;
    if (!reporter) return false;
    const report = reporter.releaseOverlay();
    if (report.status !== "accepted") return false;
    this.debugHandoffVisualRelease("overlay-release-before-clear");
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.clearClosingGhostVisuals();
    this.activeFrameState = null;
    this.layer.clearFrameGhost();
    this.debugHandoffVisualRelease("overlay-release-after-clear");
    this.layer.onClosingHandoffVisualRelease(reporter.snapshot()?.folderId || this.layer.getCurrentFolderId() || null);
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    return true;
  }

  clearClosingGhostVisuals() {
    this.cancelMotionControls();
    this.activeGhostsByItemId.clear();
    const ghosts = this.layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.activeReporter?.deleteDetachedGhostMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
  }

  runHandoffCleanup() {
    const reporter = this.activeReporter;
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    this.layer.visible = false;
    this.layer.clearCurrentFolder();
    reporter?.cleanupFinished();
    if (this.activeReporter === reporter) {
      this.activeReporter = null;
      this.owner = null;
      this.ownershipReleased = false;
    }
  }

  releaseClosingTransitionOwnership(options = {}) {
    if (!this.owner || this.ownershipReleased) return false;
    this.ownershipReleased = true;
    this.layer.releaseTransitionOwnership(this.owner.token, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    return true;
  }

  startClosingHandoff(state, controllerKeys = []) {
    const reporter = this.activeReporter;
    if (!reporter) return;
    const report = reporter.handoffStarted();
    if (report.status !== "accepted") return;
    this.clearRevealTimer();
    this.layer.panel.visible = false;
    this.layer.pageTrack.visible = false;
    this.commitHandoffVisualRelease();
    this.flushCompletedControllerGhosts(state, controllerKeys);
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
      folderId: state.renderedFolder?.id || (this.activeReporter ? this.activeReporter.snapshot()?.folderId : null) || this.layer.getCurrentFolderId() || null,
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
    const closeSnapshot = this.activeReporter ? this.activeReporter.snapshot() : null;
    if (!closeSnapshot) return;
    const debugSnapshot = this.layer.getTransitionDebugSnapshot();
    const folderId = closeSnapshot.folderId || this.layer.getCurrentFolderId() || null;
    const payload = {
      closingFrameComplete: closeSnapshot.frameComplete,
      closingFrameVisualComplete: closeSnapshot.frameVisualComplete,
      closingGhostCount: debugSnapshot.closingGhostCount,
      closingGhostKeys: closeSnapshot.ghostIds,
      closingPreviewSwapKeys: closeSnapshot.previewKeys,
      closingVisualGhostKeys: closeSnapshot.visualGhostIds,
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

  completeGhost(state, target, ghost, reporter = this.activeReporter) {
    if (!ghost || ghost.closingComplete) return;
    if (!reporter) return;
    const itemId = target?.item?.id;
    const controllerGhostKey = getClosingControllerGhostKey(state, target);
    const report = reporter.ghostComplete(target.item.id, controllerGhostKey);
    if (report.status !== "accepted") return;
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
      this.completedPreviewGhosts.push(ghost);
      return;
    }
  }

  completeFrameGhost(_state, reporter = this.activeReporter) {
    reporter?.frameComplete();
  }

  markClosingGhostVisuallyArrived(state, target, ghost = null, reporter = this.activeReporter) {
    if (!target?.isThumbnailChild) return;
    if (!reporter) return;
    const report = reporter.ghostVisualReady(target.item?.id);
    if (report.status !== "accepted") return;
    this.debugClosingGhostVisualArrive(state, target, ghost);
  }

  clearVisuals(options = {}) {
    this.cancelHandoffCleanup();
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.activeFrameState = null;
    this.activeGhostsByItemId.clear();
    this.releaseClosingTransitionOwnership({
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.clearCompletedPreviewGhosts();
    this.layer.clearFrameGhost();
    this.layer.panel.visible = true;
    const ghosts = this.layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.activeReporter?.deleteDetachedGhostMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
    this.previewSwap.clear();
    this.activeReporter = null;
    this.owner = null;
    this.ownershipReleased = false;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
