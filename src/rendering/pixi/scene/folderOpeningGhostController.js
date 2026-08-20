import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import { motionPresets } from "../animation/motionPresets.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import {
  getMaxFolderGhostGridDelay,
  getSyntheticOpeningGhostRevealState,
  makeOpeningGhostMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { throwAfterVisualAdapterRollback } from "./folderVisualAdapterLifecycle.js";
import { assertFolderOpeningPhaseReporter } from "./folderVisualSession.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;

function getOpeningFrameGhostRequestId(state) {
  const ids = new Set((state.folderOpenIconGhosts || [])
    .map((ghost) => ghost?.requestId)
    .filter((id) => id != null));
  return ids.size === 1 ? Array.from(ids)[0] : null;
}

function completeOpeningFrameGhost(layer, state) {
  const folderId = state.renderedFolder?.id || layer.getCurrentFolderId() || null;
  return state.completeFolderOpenFrameGhost?.(folderId, getOpeningFrameGhostRequestId(state));
}

function animateOpeningGhost(ghost, ghostMotion, onArrive, options = {}) {
  const springOptions = { delay: ghostMotion.delay, onUpdate: options.onFrame };
  const fadeControl = ghostMotion.isThumbnailChild
    ? motion(ghost)
      .preset("folderOpenGhost", { delay: ghostMotion.delay })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1 })
      .start()
    : null;
  const geometryControl = parallel([
    motion(ghost)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ ...springOptions, x: ghostMotion.toX, y: ghostMotion.toY }),
    motion(ghost.scale)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ ...springOptions, x: 1, y: 1 }),
  ], {
    scheduler: options.scheduler,
    onArrive,
  });
  return {
    cancel() {
      fadeControl?.cancel();
      geometryControl.cancel();
    },
    get completed() {
      return geometryControl.completed;
    },
    release() {
      fadeControl?.cancel();
      geometryControl.release();
    },
  };
}

function updateSyntheticOpeningGhostReveal(ghost, ghostMotion) {
  if (!ghost || ghostMotion.isThumbnailChild) return;
  const reveal = getSyntheticOpeningGhostRevealState(
    Math.min(Number(ghost.scale?.x) || 0, Number(ghost.scale?.y) || 0),
    ghostMotion.scale,
    ghost.syntheticOpeningRevealProgress
  );
  ghost.syntheticOpeningRevealProgress = reveal.progress;
  ghost.alpha = reveal.alpha;
  if (ghost.labelText?.visible) {
    ghost.labelText.alpha = reveal.labelAlpha;
    ghost.labelText.scale.set(reveal.labelScale);
  }
}

function finishOpeningGhostReveal(ghost) {
  ghost.alpha = 1;
  if (ghost.labelText?.visible) {
    ghost.labelText.alpha = 1;
    ghost.labelText.scale.set(1);
  }
}

function retargetOpeningGhost(ghost, ghostMotion, onArrive, options = {}) {
  const geometryControl = parallel([
    motion(ghost)
      .preset("layout")
      .handoff()
      .interrupt("retarget")
      .to({ x: ghostMotion.toX, y: ghostMotion.toY, onUpdate: options.onFrame }),
    motion(ghost.scale)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ x: 1, y: 1 }),
  ], {
    scheduler: options.scheduler,
    onArrive,
  });
  return {
    cancel() {
      geometryControl.cancel();
    },
    get completed() {
      return geometryControl.completed;
    },
    release() {
      geometryControl.release();
    },
  };
}

function findOpeningGhostByItemId(children, itemId) {
  if (!itemId) return null;
  return (children || []).find((ghost) => ghost?.item?.id === itemId && !ghost.destroyed) || null;
}

function makeOpeningGhostTargetKey(target = {}) {
  const rect = target.targetStageLayoutRect || {};
  return [
    target.pageIndex ?? "",
    rect.left ?? "",
    rect.top ?? "",
    rect.width ?? "",
    rect.height ?? "",
    target.iconSize ?? "",
    target.provisionalLayoutTarget === true ? "provisional" : "final",
  ].join(":");
}

function isProvisionalOpeningGhostTarget(target = {}) {
  return target.provisionalLayoutTarget === true;
}

function roundFrameValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Math.round(number * 100) / 100;
}

function makeOpeningFrameTargetKey(rect = null) {
  if (!rect) return "";
  return [
    roundFrameValue(rect.left),
    roundFrameValue(rect.top),
    roundFrameValue(rect.width),
    roundFrameValue(rect.height),
  ].join(":");
}

function startOpeningFrameGhost(layer, state, options = {}) {
  const sourceRect = clientRectToStageVisualRect(options.frameSourceRect, state.stageRect);
  const targetRect = options.frameTargetRect;
  if (!sourceRect || !targetRect) return false;
  const thumb = getFolderThumbMetrics(sourceRect.width);
  const folderId = state.renderedFolder?.id || layer.getCurrentFolderId() || null;
  const requestId = getOpeningFrameGhostRequestId(state);
  return layer.startFrameGhost(sourceRect, targetRect, {
    duration: motionPresets.folderOpenGhost.duration,
    ease: motionPresets.folderOpenGhost.ease,
    exclusivePanelMaterialHandoff: true,
    folderId,
    frameGhostPhase: "opening",
    fromFillAlpha: thumb.fillAlpha,
    fromFillColor: thumb.fillColor,
    fromRadius: thumb.radius,
    fromStrokeAlpha: thumb.strokeAlpha,
    fromStrokeColor: thumb.strokeColor,
    fromStrokeWidth: thumb.strokeWidth,
    notifyTitleFrame: false,
    toFillAlpha: 0.26,
    toFillColor: 0xf7f8ff,
    toRadius: 48,
    toStrokeAlpha: 0.24,
    toStrokeColor: 0xffffff,
    toStrokeWidth: 1,
    onArrive: () => state.completeFolderOpenFrameGhost?.(folderId, requestId),
  });
}

export class FolderOpeningGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.ghostFactory = options.ghostFactory;
    this.scheduler = options.scheduler || globalThis;
    this.activeReporter = null;
    this.activeState = null;
    this.controllerKeys = new Map();
    this.ghostItemIds = new Set();
    this.motionControls = new Set();
    this.motionControlsByItemId = new Map();
    this.nextTargetGeneration = 1;
    this.owner = null;
    this.revealTimer = null;
    this.targetGeneration = 0;
    this.openingTargetKeysByItemId = new Map();
    this.openingFrameTargetKey = null;
    this.settledOpeningGhostItemIds = new Set();
  }

  prepare(plan = {}) {
    const targets = Array.isArray(plan.targets) ? plan.targets : [];
    return {
      ghostIds: targets
        .filter(hasUsableFolderGhostTarget)
        .map((target) => target?.item?.id)
        .filter(Boolean),
    };
  }

  start(plan = {}, reporter) {
    assertFolderOpeningPhaseReporter(reporter);
    const state = plan.state;
    if (!state || typeof state !== "object") throw new TypeError("opening adapter plan requires state");
    const targets = Array.isArray(plan.targets) ? plan.targets : [];
    const options = plan.options && typeof plan.options === "object" ? plan.options : {};
    this.clearVisuals({
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });
    this.activeReporter = reporter;
    this.owner = reporter.owner();
    try {
      this.startVisuals(state, targets, options);
    } catch (error) {
      throwAfterVisualAdapterRollback(error, () => {
        this.clearVisuals({ restorePageTrack: true, reveal: true });
      }, "opening visual startup and rollback both failed");
    }
    const isActive = () => this.activeReporter === reporter;
    return Object.freeze({
      cancel: (cancelOptions = {}) => {
        if (!isActive()) return;
        this.clearVisuals(cancelOptions);
      },
      retarget: (nextPlan = {}) => {
        if (!isActive()) return;
        const nextState = nextPlan.state;
        if (!nextState || typeof nextState !== "object") throw new TypeError("opening retarget plan requires state");
        this.retargetVisuals(
          nextState,
          Array.isArray(nextPlan.targets) ? nextPlan.targets : [],
          nextPlan.options && typeof nextPlan.options === "object" ? nextPlan.options : {}
        );
      },
      reveal: () => {
        if (isActive()) this.reveal(reporter);
      },
      snapshot: () => this.snapshot(reporter),
      takeGhost: (itemId, accept) => isActive() ? this.takeGhost(itemId, accept) : null,
    });
  }

  snapshot(reporter = this.activeReporter) {
    const active = reporter != null && this.activeReporter === reporter;
    return Object.freeze({
      active,
      ghostIds: Object.freeze(active ? Array.from(this.ghostItemIds) : []),
      motionControlCount: active ? this.motionControls.size : 0,
      revealTimerActive: active && this.revealTimer != null,
    });
  }

  clearRevealTimer() {
    this.targetGeneration = this.nextTargetGeneration++;
    if (this.revealTimer != null) this.scheduler.clearTimeout?.(this.revealTimer);
    this.revealTimer = null;
  }

  clearFrameTarget() {
    this.openingFrameTargetKey = null;
  }

  scheduleRevealFallback(targets) {
    this.clearRevealTimer();
    const reporter = this.activeReporter;
    if (!reporter) return;
    const targetGeneration = this.nextTargetGeneration++;
    this.targetGeneration = targetGeneration;
    const maxDelay = getMaxFolderGhostGridDelay(targets, 0.18);
    const fallbackSeconds = Math.max(motionPresets.folderOpenGhost.duration, GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round((maxDelay + fallbackSeconds) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    this.revealTimer = this.scheduler.setTimeout?.(() => {
      if (this.activeReporter !== reporter || this.targetGeneration !== targetGeneration) return;
      this.revealTimer = null;
      if (this.ghostItemIds.size > 0 &&
        this.layer.isOpeningGeometryTransitionActive?.() === true) {
        this.scheduleRevealFallback(targets);
        return;
      }
      if (this.ghostItemIds.size > 0) {
        this.settledOpeningGhostItemIds = new Set(this.ghostItemIds);
        this.reportGhostsReady();
      }
    }, timeoutMs) || null;
  }

  cancelMotionControls() {
    const controls = this.motionControls;
    this.motionControls = new Set();
    this.motionControlsByItemId = new Map();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  hasUnsettledOpeningGhosts() {
    const activeItemIds = this.ghostItemIds;
    if (!activeItemIds?.size) return false;
    for (const itemId of activeItemIds) {
      if (!this.settledOpeningGhostItemIds.has(itemId)) return true;
    }
    return false;
  }

  canRevealSettledOpeningGhosts(options = {}) {
    return !this.hasUnsettledOpeningGhosts() &&
      (
        options.ignoreGeometryGate === true ||
      this.layer.isOpeningGeometryTransitionActive?.() !== true
      );
  }

  takeGhost(itemId, accept = null) {
    if (!itemId || !this.ghostItemIds.has(itemId)) return null;
    let releasedGhost = null;
    for (const ghost of this.layer.openingGhostLayer.children || []) {
      if (ghost?.item?.id === itemId && !ghost.destroyed) {
        releasedGhost = ghost;
        break;
      }
    }
    if (!releasedGhost) return null;
    if (typeof accept === "function" && !accept(releasedGhost)) return null;
    const control = this.motionControlsByItemId.get(itemId);
    control?.release?.();
    if (control) this.motionControls.delete(control);
    this.motionControlsByItemId.delete(itemId);
    killMotionOf(releasedGhost, "alpha", { lane: "base", laneKey: "overlay" });
    if (releasedGhost.labelText) {
      killMotionOf(releasedGhost.labelText);
      killMotionOf(releasedGhost.labelText.scale);
    }
    this.ghostItemIds.delete(itemId);
    this.controllerKeys.delete(itemId);
    this.settledOpeningGhostItemIds.delete(itemId);
    this.openingTargetKeysByItemId.delete(itemId);
    this.layer.openingGhostBoundsRefreshers.delete(itemId);
    this.layer.removeOpeningGhost(releasedGhost);
    if (!this.ghostItemIds.size) this.clearRevealTimer();
    return releasedGhost;
  }

  completeControllerKeys() {
    const state = this.activeState;
    const keys = Array.from(this.controllerKeys.values());
    this.controllerKeys.clear();
    for (const key of keys) {
      if (key) state?.completeFolderOpenIconGhost?.(key);
    }
    return keys;
  }

  clearVisuals(options = {}) {
    this.clearRevealTimer();
    this.cancelMotionControls();
    const owner = this.owner;
    if (options.completeControllerKeys !== false) this.completeControllerKeys();
    this.layer.releaseTransitionOwnership(owner?.token, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.activeReporter = null;
    this.activeState = null;
    this.controllerKeys.clear();
    this.ghostItemIds.clear();
    this.owner = null;
    this.layer.openingGhostBoundsRefreshers.clear();
    this.layer.clearFrameGhost();
    this.openingTargetKeysByItemId.clear();
    this.openingFrameTargetKey = null;
    this.settledOpeningGhostItemIds.clear();
    const ghosts = this.layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
    }
  }

  reportGhostsReady(options = {}) {
    if (!this.canRevealSettledOpeningGhosts({
      ignoreGeometryGate: options.ignoreGeometryGate === true,
    })) return false;
    const reporter = this.activeReporter;
    if (!reporter) return false;
    this.clearRevealTimer();
    this.cancelMotionControls();
    return reporter.ghostsReady().status !== "stale";
  }

  reveal(reporter = this.activeReporter) {
    if (!reporter || reporter !== this.activeReporter) return false;
    const owner = this.owner;
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.completeControllerKeys();
    this.ghostItemIds.clear();
    this.layer.openingGhostBoundsRefreshers.clear();
    this.layer.releaseTransitionOwnership(owner?.token, { restorePageTrack: true, reveal: true });
    this.layer.refreshRegisteredIconBounds();
    this.layer.rebuildPageTrackMask();
    this.openingTargetKeysByItemId.clear();
    this.settledOpeningGhostItemIds.clear();
    const ghosts = this.layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
    }
    this.activeReporter = null;
    this.activeState = null;
    this.owner = null;
    return true;
  }

  complete(state, target, ghost) {
    const itemId = target.item.id;
    this.settledOpeningGhostItemIds.add(itemId);
    finishOpeningGhostReveal(ghost);
    ghost.scale.set(1);
    this.reportGhostsReady();
  }

  completeIfFinalTarget(state, target, ghost, motionControl = null) {
    if (isProvisionalOpeningGhostTarget(target)) {
      finishOpeningGhostReveal(ghost);
      ghost.scale.set(1);
      return false;
    }
    if (motionControl) {
      this.motionControls.delete(motionControl);
      this.motionControlsByItemId.delete(target.item.id);
    }
    this.complete(state, target, ghost);
    return true;
  }

  startVisuals(state, targets, options = {}) {
    const reporter = this.activeReporter;
    const owner = this.owner;
    if (!reporter || !owner) throw new Error("opening visual scope is not active");
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const requestId = getOpeningFrameGhostRequestId(state);
    const hasStagedGhosts = (state.folderOpenIconGhosts || []).length > 0;
    if (hasStagedGhosts && typeof state.acceptFolderOpenIconGhostSession === "function") {
      const accepted = state.acceptFolderOpenIconGhostSession(folderId, requestId);
      if (!accepted) {
        reporter.fail(new Error(`opening ghost session was rejected for folder ${folderId || "unknown"}`));
        return false;
      }
    }
    this.activeState = state;
    const usableTargets = (targets || []).filter(hasUsableFolderGhostTarget);
    const usableControllerGhostKeys = new Set();
    for (const target of usableTargets) {
      const key = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      if (key) usableControllerGhostKeys.add(key);
    }
    for (const ghost of state.folderOpenIconGhosts || []) {
      if (ghost?.key && !usableControllerGhostKeys.has(ghost.key)) {
        state.completeFolderOpenIconGhost?.(ghost.key);
      }
    }

    this.layer.acquireDesktopSourceOwnership(owner);
    const startedFrameGhost = startOpeningFrameGhost(this.layer, state, options);
    this.openingFrameTargetKey = startedFrameGhost
      ? makeOpeningFrameTargetKey(options.frameTargetRect)
      : null;
    if (!startedFrameGhost) {
      this.layer.panelMaterial.visible = true;
      this.layer.panelMaterial.alpha = 1;
      this.layer.frameGhost.visible = false;
      this.layer.frameGhost.alpha = 0;
      completeOpeningFrameGhost(this.layer, state);
    }

    if (!usableTargets.length) {
      this.reportGhostsReady({ ignoreGeometryGate: true });
      return;
    }
    this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      this.ghostItemIds.add(target.item.id);
      if (controllerGhostKey) this.controllerKeys.set(target.item.id, controllerGhostKey);
    }

    for (const target of usableTargets) {
      const ghost = this.ghostFactory();
      ghost.eventMode = "none";
      ghost.openingPageIndex = target.pageIndex;
      ghost.stageRect = state.stageRect;
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const ghostMotion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: motionPresets.folderOpenGhost.duration,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(ghostMotion.fromX, ghostMotion.fromY);
      ghost.scale.set(ghostMotion.scale);
      ghost.alpha = ghostMotion.alpha;
      const refreshGhostBounds = () => this.layer.registerOpeningGhostBounds(state, target, ghost);
      this.layer.openingGhostBoundsRefreshers.set(target.item.id, refreshGhostBounds);
      this.openingTargetKeysByItemId.set(target.item.id, makeOpeningGhostTargetKey(target));
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
        if (ghostMotion.isThumbnailChild) {
          motion(ghost.labelText)
            .preset("fade", { delay: ghostMotion.labelDelay, duration: 0.13 })
            .overlay()
            .interrupt("retarget")
            .to({ alpha: 1 })
            .start();
          motion(ghost.labelText.scale)
            .preset("fade", { delay: ghostMotion.labelDelay, duration: 0.13 })
            .overlay()
            .interrupt("retarget")
            .to({ x: 1, y: 1 })
            .start();
        }
      }
      this.layer.openingGhostLayer.addChild(ghost);
      refreshGhostBounds();
      this.layer.hideIconNodesForTransition(target.item.id, owner);

      let didFinish = false;
      let motionControl = null;
      const updateGhostFrame = () => {
        updateSyntheticOpeningGhostReveal(ghost, ghostMotion);
        refreshGhostBounds();
      };
      motionControl = animateOpeningGhost(ghost, ghostMotion, () => {
        didFinish = this.completeIfFinalTarget(state, target, ghost, motionControl);
      }, { scheduler: this.scheduler, onFrame: updateGhostFrame });
      if (!didFinish && this.ghostItemIds.has(target.item.id)) {
        this.motionControls.add(motionControl);
        this.motionControlsByItemId.set(target.item.id, motionControl);
      }
    }
  }

  retargetFrame(state, options = {}) {
    const targetRect = options.frameTargetRect;
    const targetKey = makeOpeningFrameTargetKey(targetRect);
    if (!targetKey || !this.openingFrameTargetKey || this.openingFrameTargetKey === targetKey) return false;
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const requestId = getOpeningFrameGhostRequestId(state);
    const retargeted = this.layer.retargetFrameGhost(targetRect, {
      duration: motionPresets.folderOpenGhost.duration,
      ease: motionPresets.folderOpenGhost.ease,
      folderId,
      frameGhostPhase: "opening",
      notifyTitleFrame: false,
      preserveOnComplete: false,
      toFillAlpha: 0.26,
      toFillColor: 0xf7f8ff,
      toRadius: 48,
      toStrokeAlpha: 0.24,
      toStrokeColor: 0xffffff,
      toStrokeWidth: 1,
      onArrive: () => state.completeFolderOpenFrameGhost?.(folderId, requestId),
    });
    if (retargeted) this.openingFrameTargetKey = targetKey;
    return retargeted;
  }

  retargetVisuals(state, targets, options = {}) {
    let retargeted = this.retargetFrame(state, options) ? 1 : 0;
    if (!this.ghostItemIds.size) return retargeted;
    const usableTargets = (targets || []).filter((target) =>
      target?.item?.id &&
      hasUsableFolderGhostTarget(target) &&
      this.ghostItemIds.has(target.item?.id)
    );
    if (!usableTargets.length) {
      if (retargeted > 0) this.scheduleRevealFallback([]);
      return retargeted;
    }

    const ghosts = this.layer.openingGhostLayer.children || [];
    for (const target of usableTargets) {
      const itemId = target.item?.id;
      const ghost = findOpeningGhostByItemId(ghosts, itemId);
      if (!ghost) continue;
      const targetKey = makeOpeningGhostTargetKey(target);
      if (this.openingTargetKeysByItemId.get(itemId) === targetKey) continue;

      ghost.openingPageIndex = target.pageIndex;
      const previousIconSize = Math.max(0.01, Number(ghost.state?.iconSize) || Number(target.iconSize) || 1);
      const ghostMotion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: motionPresets.folderOpenGhost.duration,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.stageRect = state.stageRect;
      ghost.setState?.(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const nextIconSize = Math.max(0.01, Number(target.iconSize) || previousIconSize);
      if (Math.abs(previousIconSize - nextIconSize) > 0.0001) {
        const scaleMultiplier = previousIconSize / nextIconSize;
        ghost.scale.set(
          Math.max(0.01, ghost.scale.x * scaleMultiplier),
          Math.max(0.01, ghost.scale.y * scaleMultiplier)
        );
      }
      const refreshGhostBounds = () => this.layer.registerOpeningGhostBounds(state, target, ghost);
      this.layer.openingGhostBoundsRefreshers.set(itemId, refreshGhostBounds);
      refreshGhostBounds();

      const previousControl = this.motionControlsByItemId.get(itemId);
      if (previousControl) this.motionControls.delete(previousControl);
      this.motionControlsByItemId.delete(itemId);
      this.settledOpeningGhostItemIds.delete(itemId);
      this.openingTargetKeysByItemId.set(itemId, targetKey);

      let didFinish = false;
      let motionControl = null;
      const updateGhostFrame = () => {
        updateSyntheticOpeningGhostReveal(ghost, ghostMotion);
        refreshGhostBounds();
      };
      motionControl = retargetOpeningGhost(ghost, ghostMotion, () => {
        didFinish = this.completeIfFinalTarget(state, target, ghost, motionControl);
      }, { scheduler: this.scheduler, onFrame: updateGhostFrame });
      if (didFinish) {
        this.openingTargetKeysByItemId.delete(itemId);
      } else if (this.ghostItemIds.has(itemId)) {
        this.motionControls.add(motionControl);
        this.motionControlsByItemId.set(itemId, motionControl);
      }
      retargeted += 1;
    }
    if (retargeted > 0) this.scheduleRevealFallback(usableTargets);
    this.reportGhostsReady();
    return retargeted;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
