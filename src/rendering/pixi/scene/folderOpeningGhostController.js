import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import { motionPresets } from "../animation/motionPresets.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getMaxFolderGhostGridDelay, makeOpeningGhostMotion } from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { ensureFolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import { makeDesktopSourceVisualKey } from "./folderVisualOwnershipRegistry.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;

function animateOpeningGhost(ghost, ghostMotion, onComplete, options = {}) {
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
    onComplete,
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

function startOpeningFrameGhost(layer, state, options = {}) {
  if (typeof layer.startFrameGhost !== "function") return false;
  const sourceRect = clientRectToStageVisualRect(options.frameSourceRect, state.stageRect);
  const targetRect = options.frameTargetRect;
  if (!sourceRect || !targetRect) return false;
  const thumb = getFolderThumbMetrics(sourceRect.width);
  layer.startFrameGhost(sourceRect, targetRect, {
    duration: motionPresets.folderOpenGhost.duration,
    ease: motionPresets.folderOpenGhost.ease,
    exclusivePanelMaterialHandoff: true,
    folderId: state.renderedFolder?.id || layer.currentFolderId || null,
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
  });
  return true;
}

function acquireOpeningDesktopSourceOwnership(layer, owner) {
  const key = makeDesktopSourceVisualKey(owner?.folderId);
  if (!key || typeof layer.acquireVisualOwnership !== "function") return;
  layer.acquireVisualOwnership(key, owner);
}

export class FolderOpeningGhostController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.ghostFactory = options.ghostFactory;
    this.handoffCoordinator = options.handoffCoordinator || ensureFolderHandoffCoordinator(layer);
    this.scheduler = options.scheduler || globalThis;
  }

  clearRevealTimer() {
    this.handoffCoordinator.clearOpeningRevealTimer(this.scheduler.clearTimeout?.bind(this.scheduler));
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
      if (this.handoffCoordinator.hasActiveOpeningVisuals()) this.clear();
    }, timeoutMs) || null);
  }

  cancelMotionControls() {
    const controls = this.handoffCoordinator.consumeOpeningMotionControls();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  releaseGhost(itemId) {
    const layer = this.layer;
    if (!itemId || !this.handoffCoordinator.hasOpeningGhost(itemId)) return null;
    let releasedGhost = null;
    for (const ghost of layer.openingGhostLayer.children || []) {
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
    layer.openingGhostBoundsRefreshers?.delete(itemId);
    const children = layer.openingGhostLayer.children;
    if (Array.isArray(children)) {
      const index = children.indexOf(releasedGhost);
      if (index >= 0) children.splice(index, 1);
    } else {
      layer.openingGhostLayer.removeChild?.(releasedGhost);
    }
    if (!this.handoffCoordinator.hasActiveOpeningVisuals()) {
      this.clearRevealTimer();
      this.handoffCoordinator.clearOpeningVisuals({ keepSessionToken: true });
    }
    return releasedGhost;
  }

  clear(options = {}) {
    const layer = this.layer;
    this.clearRevealTimer();
    this.cancelMotionControls();
    const sessionToken = this.handoffCoordinator.getOpeningSessionToken();
    if (options.cancelSession !== false) {
      this.handoffCoordinator.cancelOpen(sessionToken);
    }
    if (options.completeControllerKeys !== false) {
      this.handoffCoordinator.completeOpeningControllerGhostKeys();
    }
    layer.releaseTransitionOwnership(sessionToken, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.handoffCoordinator.clearOpeningVisuals();
    layer.openingGhostBoundsRefreshers?.clear();
    layer.clearFrameGhost();
    const ghosts = layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
  }

  finishTransition(options = {}) {
    const layer = this.layer;
    if (this.handoffCoordinator.hasActiveOpeningVisuals()) return;
    const sessionToken = options.sessionToken || this.handoffCoordinator.getOpeningSessionToken();
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.handoffCoordinator.markGhostsReady(sessionToken);
    if (!this.handoffCoordinator.canReveal(sessionToken)) return;
    this.handoffCoordinator.finishReveal(sessionToken);
    this.handoffCoordinator.clearOpeningVisuals();
    layer.openingGhostBoundsRefreshers?.clear();
    layer.releaseTransitionOwnership(sessionToken, { restorePageTrack: true, reveal: true });
    layer.refreshRegisteredIconBounds?.();
    layer.rebuildPageTrackMask();
    const ghosts = layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
  }

  complete(state, target, ghost) {
    const layer = this.layer;
    const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
    this.handoffCoordinator.completeOpeningGhost(target.item.id, controllerGhostKey);
    ghost.alpha = 1;
    ghost.scale.set(1);
    layer.openingGhostBoundsRefreshers?.delete(target.item.id);
    this.finishTransition({ sessionToken: this.handoffCoordinator.getOpeningSessionToken() });
  }

  start(state, targets, options = {}) {
    const layer = this.layer;
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
      folderId: state.renderedFolder?.id || layer.currentFolderId || null,
      kind: "opening",
      token: sessionToken,
    };
    acquireOpeningDesktopSourceOwnership(layer, owner);
    const startedFrameGhost = startOpeningFrameGhost(layer, state, options);
    if (!startedFrameGhost) {
      layer.panelMaterial.visible = true;
      layer.panelMaterial.alpha = 1;
      layer.frameGhost.visible = false;
      layer.frameGhost.alpha = 0;
    }

    if (!usableTargets.length) {
      if (startedFrameGhost) {
        layer.hidePageTrackForTransition(owner);
      }
      this.finishTransition({ sessionToken });
      return;
    }
    layer.hidePageTrackForTransition(owner);
    this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      this.handoffCoordinator.registerOpeningGhost(target.item.id, controllerGhostKey);
    }

    for (const target of usableTargets) {
      const ghost = this.ghostFactory();
      ghost.eventMode = "none";
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
      const refreshGhostBounds = () => layer.registerOpeningGhostBounds?.(state, target, ghost);
      layer.openingGhostBoundsRefreshers?.set(target.item.id, refreshGhostBounds);
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
      layer.openingGhostLayer.addChild(ghost);
      refreshGhostBounds();
      layer.hideIconNodesForTransition(target.item.id, owner);

      let didComplete = false;
      let motionControl = null;
      motionControl = animateOpeningGhost(ghost, ghostMotion, () => {
        didComplete = true;
        if (motionControl) {
          this.handoffCoordinator.deleteOpeningMotionControl(target.item.id, motionControl);
        }
        this.complete(state, target, ghost);
      }, { scheduler: this.scheduler, onFrame: refreshGhostBounds });
      if (!didComplete && this.handoffCoordinator.hasOpeningGhost(target.item.id)) {
        this.handoffCoordinator.addOpeningMotionControl(target.item.id, motionControl);
      }
    }
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
