import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import { motionPresets } from "../animation/motionPresets.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getMaxFolderGhostGridDelay, makeOpeningGhostMotion } from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { ensureFolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import { ensureLayerTransitionPort } from "./layerTransitionPort.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;

function getOpeningFrameGhostRequestId(state) {
  const ids = new Set((state.folderOpenIconGhosts || [])
    .map((ghost) => ghost?.requestId)
    .filter((id) => id != null));
  return ids.size === 1 ? Array.from(ids)[0] : null;
}

function completeOpeningFrameGhost(transitionPort, state) {
  const folderId = state.renderedFolder?.id || transitionPort.getCurrentFolderId() || null;
  return state.completeFolderOpenFrameGhost?.(folderId, getOpeningFrameGhostRequestId(state));
}

function animateOpeningGhost(ghost, ghostMotion, onArrive, options = {}) {
  const springOptions = { delay: ghostMotion.delay, onUpdate: options.onFrame };
  const fadeControl = motion(ghost)
    .preset("folderOpenGhost", { delay: ghostMotion.delay })
    .overlay()
    .interrupt("retarget")
    .to({ alpha: 1 })
    .start();
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
      fadeControl.cancel();
      geometryControl.cancel();
    },
    get completed() {
      return geometryControl.completed;
    },
    release() {
      fadeControl.cancel();
      geometryControl.release();
    },
  };
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

function startOpeningFrameGhost(transitionPort, state, options = {}) {
  const sourceRect = clientRectToStageVisualRect(options.frameSourceRect, state.stageRect);
  const targetRect = options.frameTargetRect;
  if (!sourceRect || !targetRect) return false;
  const thumb = getFolderThumbMetrics(sourceRect.width);
  const folderId = state.renderedFolder?.id || transitionPort.getCurrentFolderId() || null;
  const requestId = getOpeningFrameGhostRequestId(state);
  return transitionPort.startFrameGhost(sourceRect, targetRect, {
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
    this.handoffCoordinator = options.handoffCoordinator || ensureFolderHandoffCoordinator(layer);
    this.transitionPort = options.transitionPort || ensureLayerTransitionPort(layer);
    this.scheduler = options.scheduler || globalThis;
    this.openingTargetKeysByItemId = new Map();
    this.openingFrameTargetKey = null;
    this.settledOpeningGhostItemIds = new Set();
  }

  clearRevealTimer() {
    this.handoffCoordinator.clearOpeningRevealTimer(this.scheduler.clearTimeout?.bind(this.scheduler));
  }

  clearFrameTarget() {
    this.openingFrameTargetKey = null;
  }

  scheduleRevealFallback(targets) {
    this.clearRevealTimer();
    const sessionToken = this.handoffCoordinator.getOpeningSessionToken();
    const maxDelay = getMaxFolderGhostGridDelay(targets, 0.18);
    const fallbackSeconds = Math.max(motionPresets.folderOpenGhost.duration, GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round((maxDelay + fallbackSeconds) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    this.handoffCoordinator.setOpeningRevealTimer(this.scheduler.setTimeout?.(() => {
      this.handoffCoordinator.clearOpeningRevealTimerRef();
      if (sessionToken && !this.handoffCoordinator.isCurrentOpeningVisualSession(sessionToken)) return;
      if (this.handoffCoordinator.hasActiveOpeningVisuals() &&
        this.transitionPort.isOpeningGeometryTransitionActive?.() === true) {
        this.scheduleRevealFallback(targets);
        return;
      }
      if (this.handoffCoordinator.hasActiveOpeningVisuals()) this.clear();
    }, timeoutMs) || null);
  }

  cancelMotionControls() {
    const controls = this.handoffCoordinator.consumeOpeningMotionControls();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  hasUnsettledOpeningGhosts() {
    const activeItemIds = this.handoffCoordinator.getOpeningGhostKeys();
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
        this.transitionPort.isOpeningGeometryTransitionActive?.() !== true
      );
  }

  releaseGhost(itemId) {
    if (!itemId || !this.handoffCoordinator.hasOpeningGhost(itemId)) return null;
    let releasedGhost = null;
    for (const ghost of this.transitionPort.getOpeningGhostChildren()) {
      if (ghost?.item?.id === itemId && !ghost.destroyed) {
        releasedGhost = ghost;
        break;
      }
    }
    if (!releasedGhost) return null;
    const control = this.handoffCoordinator.getOpeningMotionControl(itemId);
    control?.release?.();
    this.handoffCoordinator.deleteOpeningMotionControl(itemId, control);
    killMotionOf(releasedGhost, "alpha", { lane: "base", laneKey: "overlay" });
    if (releasedGhost.labelText) {
      killMotionOf(releasedGhost.labelText);
      killMotionOf(releasedGhost.labelText.scale);
    }
    this.handoffCoordinator.releaseOpeningGhost(itemId);
    this.settledOpeningGhostItemIds.delete(itemId);
    this.openingTargetKeysByItemId.delete(itemId);
    this.transitionPort.deleteOpeningGhostBounds(itemId);
    this.transitionPort.removeOpeningGhost(releasedGhost);
    if (!this.handoffCoordinator.hasActiveOpeningVisuals()) {
      this.clearRevealTimer();
      this.handoffCoordinator.clearOpeningVisuals({ keepSessionToken: true });
    }
    return releasedGhost;
  }

  clear(options = {}) {
    this.clearRevealTimer();
    this.cancelMotionControls();
    const sessionToken = this.handoffCoordinator.getOpeningSessionToken();
    if (options.cancelSession !== false) {
      this.handoffCoordinator.cancelOpen(sessionToken);
    }
    if (options.completeControllerKeys !== false) {
      this.handoffCoordinator.completeOpeningControllerGhostKeys();
    }
    this.transitionPort.releaseTransitionOwnership(sessionToken, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.handoffCoordinator.clearOpeningVisuals();
    this.transitionPort.clearOpeningGhostBounds();
    this.transitionPort.clearFrameGhost();
    this.openingTargetKeysByItemId.clear();
    this.openingFrameTargetKey = null;
    this.settledOpeningGhostItemIds.clear();
    const ghosts = this.transitionPort.removeOpeningGhosts();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
    }
  }

  finishTransition(options = {}) {
    if (!this.canRevealSettledOpeningGhosts({
      ignoreGeometryGate: options.ignoreGeometryGate === true,
    })) return false;
    const sessionToken = options.sessionToken || this.handoffCoordinator.getOpeningSessionToken();
    this.clearRevealTimer();
    this.cancelMotionControls();
    if (sessionToken == null) {
      this.handoffCoordinator.completeOpeningControllerGhostKeys();
      this.handoffCoordinator.clearOpeningVisuals();
      this.transitionPort.clearOpeningGhostBounds();
      this.transitionPort.revealIconNodes();
      this.transitionPort.setPageTrackVisible(true);
      this.openingTargetKeysByItemId.clear();
      this.settledOpeningGhostItemIds.clear();
      const ghosts = this.transitionPort.removeOpeningGhosts();
      for (const ghost of ghosts) {
        killAllMotion(ghost);
        destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
      }
      return true;
    }
    this.handoffCoordinator.markGhostsReady(sessionToken);
    if (!this.handoffCoordinator.canReveal(sessionToken)) return false;
    this.handoffCoordinator.finishReveal(sessionToken);
    this.handoffCoordinator.completeOpeningControllerGhostKeys();
    this.handoffCoordinator.clearOpeningVisuals();
    this.transitionPort.clearOpeningGhostBounds();
    this.transitionPort.releaseTransitionOwnership(sessionToken, { restorePageTrack: true, reveal: true });
    this.transitionPort.refreshRegisteredIconBounds();
    this.transitionPort.rebuildPageTrackMask();
    this.openingTargetKeysByItemId.clear();
    this.settledOpeningGhostItemIds.clear();
    const ghosts = this.transitionPort.removeOpeningGhosts();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
    }
    return true;
  }

  complete(state, target, ghost) {
    const sessionToken = this.handoffCoordinator.getOpeningSessionToken();
    const itemId = target.item.id;
    this.settledOpeningGhostItemIds.add(itemId);
    ghost.alpha = 1;
    ghost.scale.set(1);
    this.finishTransition({ sessionToken });
  }

  completeIfFinalTarget(state, target, ghost, motionControl = null) {
    if (isProvisionalOpeningGhostTarget(target)) {
      ghost.alpha = 1;
      ghost.scale.set(1);
      return false;
    }
    if (motionControl) {
      this.handoffCoordinator.deleteOpeningMotionControl(target.item.id, motionControl);
    }
    this.complete(state, target, ghost);
    return true;
  }

  start(state, targets, options = {}) {
    const sessionToken = options.sessionToken || this.handoffCoordinator.activeOpenToken || null;
    this.clear({
      cancelSession: false,
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });
    this.handoffCoordinator.beginOpeningVisuals({ sessionToken, state });
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

    const owner = {
      folderId: state.renderedFolder?.id || this.transitionPort.getCurrentFolderId() || null,
      kind: "opening",
      token: sessionToken,
    };
    this.transitionPort.acquireDesktopSourceOwnership(owner);
    const startedFrameGhost = startOpeningFrameGhost(this.transitionPort, state, options);
    this.openingFrameTargetKey = startedFrameGhost
      ? makeOpeningFrameTargetKey(options.frameTargetRect)
      : null;
    if (!startedFrameGhost) {
      this.transitionPort.setPanelMaterialVisible(true, 1);
      this.transitionPort.setFrameGhostVisible(false, 0);
      completeOpeningFrameGhost(this.transitionPort, state);
    }

    if (!usableTargets.length) {
      this.finishTransition({ ignoreGeometryGate: true, sessionToken });
      return;
    }
    this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      this.handoffCoordinator.registerOpeningGhost(target.item.id, controllerGhostKey);
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
      const refreshGhostBounds = () => this.transitionPort.registerOpeningGhostBounds(state, target, ghost);
      this.transitionPort.setOpeningGhostBoundsRefresher(target.item.id, refreshGhostBounds);
      this.openingTargetKeysByItemId.set(target.item.id, makeOpeningGhostTargetKey(target));
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
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
      this.transitionPort.addOpeningGhost(ghost);
      refreshGhostBounds();
      this.transitionPort.hideIconNodesForTransition(target.item.id, owner);

      let didFinish = false;
      let motionControl = null;
      motionControl = animateOpeningGhost(ghost, ghostMotion, () => {
        didFinish = this.completeIfFinalTarget(state, target, ghost, motionControl);
      }, { scheduler: this.scheduler, onFrame: refreshGhostBounds });
      if (!didFinish && this.handoffCoordinator.hasOpeningGhost(target.item.id)) {
        this.handoffCoordinator.addOpeningMotionControl(target.item.id, motionControl);
      }
    }
  }

  retargetFrame(state, options = {}) {
    const targetRect = options.frameTargetRect;
    const targetKey = makeOpeningFrameTargetKey(targetRect);
    if (!targetKey || !this.openingFrameTargetKey || this.openingFrameTargetKey === targetKey) return false;
    const folderId = state.renderedFolder?.id || this.transitionPort.getCurrentFolderId() || null;
    const requestId = getOpeningFrameGhostRequestId(state);
    const retargeted = this.transitionPort.retargetFrameGhost(targetRect, {
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

  retarget(state, targets, options = {}) {
    let retargeted = this.retargetFrame(state, options) ? 1 : 0;
    if (!this.handoffCoordinator.hasActiveOpeningVisuals()) return retargeted;
    const usableTargets = (targets || []).filter((target) =>
      target?.item?.id &&
      hasUsableFolderGhostTarget(target) &&
      this.handoffCoordinator.hasOpeningGhost(target.item?.id)
    );
    if (!usableTargets.length) return retargeted;

    const ghosts = this.transitionPort.getOpeningGhostChildren();
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
      const refreshGhostBounds = () => this.transitionPort.registerOpeningGhostBounds(state, target, ghost);
      this.transitionPort.setOpeningGhostBoundsRefresher(itemId, refreshGhostBounds);
      refreshGhostBounds();

      const previousControl = this.handoffCoordinator.getOpeningMotionControl(itemId);
      if (previousControl) this.handoffCoordinator.deleteOpeningMotionControl(itemId, previousControl);
      this.settledOpeningGhostItemIds.delete(itemId);
      this.openingTargetKeysByItemId.set(itemId, targetKey);

      let didFinish = false;
      let motionControl = null;
      motionControl = retargetOpeningGhost(ghost, ghostMotion, () => {
        didFinish = this.completeIfFinalTarget(state, target, ghost, motionControl);
      }, { scheduler: this.scheduler, onFrame: refreshGhostBounds });
      if (didFinish) {
        this.openingTargetKeysByItemId.delete(itemId);
      } else if (this.handoffCoordinator.hasOpeningGhost(itemId)) {
        this.handoffCoordinator.addOpeningMotionControl(itemId, motionControl);
      }
      retargeted += 1;
    }
    this.finishTransition();
    return retargeted;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
