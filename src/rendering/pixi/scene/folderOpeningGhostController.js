import { folderOpenGhostDuration, folderOpenGhostEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, transition } from "../animation/motionTween.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getMaxFolderGhostGridDelay, makeOpeningGhostMotion } from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import { makeDesktopSourceVisualKey } from "./folderVisualOwnershipRegistry.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;

function animateOpeningGhost(ghost, motion, onComplete, options = {}) {
  const springOptions = { delay: motion.delay, onUpdate: options.onFrame };
  const fadeControl = transition(ghost)
    .preset("folderOpenGhost", { delay: motion.delay })
    .overlay()
    .interrupt("retarget")
    .to({ alpha: 1 })
    .start();
  const geometryControl = parallel([
    transition(ghost)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ ...springOptions, x: motion.toX, y: motion.toY }),
    transition(ghost.scale)
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
    duration: folderOpenGhostDuration,
    ease: folderOpenGhostEase,
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
    this.scheduler = options.scheduler || globalThis;
  }

  clearRevealTimer() {
    const layer = this.layer;
    if (!layer.openingGhostRevealTimer) return;
    this.scheduler.clearTimeout?.(layer.openingGhostRevealTimer);
    layer.openingGhostRevealTimer = null;
  }

  scheduleRevealFallback(targets) {
    const layer = this.layer;
    this.clearRevealTimer();
    const sessionToken = layer.openingGhostSessionToken || null;
    const maxDelay = getMaxFolderGhostGridDelay(targets, 0.18);
    const fallbackSeconds = Math.max(folderOpenGhostDuration, GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round((maxDelay + fallbackSeconds) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    layer.openingGhostRevealTimer = this.scheduler.setTimeout?.(() => {
      layer.openingGhostRevealTimer = null;
      if (sessionToken && layer.openingGhostSessionToken !== sessionToken) return;
      if (layer.openingGhostKeys?.size) this.clear();
    }, timeoutMs) || null;
  }

  cancelMotionControls() {
    const layer = this.layer;
    const controls = layer.openingGhostMotionControls;
    layer.openingGhostMotionControls = null;
    layer.openingGhostMotionControlsByItemId = null;
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  releaseGhost(itemId) {
    const layer = this.layer;
    if (!itemId || !layer.openingGhostKeys?.has(itemId)) return null;
    let releasedGhost = null;
    for (const ghost of layer.openingGhostLayer.children || []) {
      if (ghost?.item?.id === itemId && !ghost.destroyed) {
        releasedGhost = ghost;
        break;
      }
    }
    if (!releasedGhost) return null;
    const control = layer.openingGhostMotionControlsByItemId?.get(itemId);
    control?.release?.();
    if (control) layer.openingGhostMotionControls?.delete(control);
    layer.openingGhostMotionControlsByItemId?.delete(itemId);
    killMotionOf(releasedGhost, "alpha", { lane: "base", laneKey: "overlay" });
    if (releasedGhost.labelText) {
      killMotionOf(releasedGhost.labelText);
      killMotionOf(releasedGhost.labelText.scale);
    }
    layer.openingGhostKeys.delete(itemId);
    layer.openingGhostControllerKeys?.delete(itemId);
    layer.openingGhostBoundsRefreshers?.delete(itemId);
    const children = layer.openingGhostLayer.children;
    if (Array.isArray(children)) {
      const index = children.indexOf(releasedGhost);
      if (index >= 0) children.splice(index, 1);
    } else {
      layer.openingGhostLayer.removeChild?.(releasedGhost);
    }
    if (!layer.openingGhostKeys.size) {
      this.clearRevealTimer();
      layer.openingGhostControllerKeys = null;
      layer.openingGhostState = null;
      layer.openingGhostMotionControls = null;
      layer.openingGhostMotionControlsByItemId = null;
    }
    return releasedGhost;
  }

  clear(options = {}) {
    const layer = this.layer;
    this.clearRevealTimer();
    this.cancelMotionControls();
    if (options.cancelSession !== false) {
      layer.folderTransitions?.cancelOpen(layer.openingGhostSessionToken || null);
    }
    if (options.completeControllerKeys !== false &&
      layer.openingGhostControllerKeys?.size &&
      layer.openingGhostState?.completeFolderOpenIconGhost) {
      for (const key of layer.openingGhostControllerKeys.values()) {
        if (key) layer.openingGhostState.completeFolderOpenIconGhost(key);
      }
    }
    const sessionToken = layer.openingGhostSessionToken || null;
    layer.releaseTransitionOwnership(sessionToken, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    layer.openingGhostSessionToken = null;
    layer.openingGhostControllerKeys = null;
    layer.openingGhostState = null;
    layer.openingGhostMotionControlsByItemId = null;
    layer.openingGhostKeys?.clear();
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
    if (layer.openingGhostKeys?.size) return;
    const sessionToken = options.sessionToken || layer.openingGhostSessionToken || null;
    this.clearRevealTimer();
    this.cancelMotionControls();
    if (layer.folderTransitions) {
      layer.folderTransitions.markGhostsReady(sessionToken);
      if (!layer.folderTransitions.canReveal(sessionToken)) return;
      layer.folderTransitions.finishReveal(sessionToken);
    }
    layer.openingGhostSessionToken = null;
    layer.openingGhostControllerKeys = null;
    layer.openingGhostState = null;
    layer.openingGhostMotionControlsByItemId = null;
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
    layer.openingGhostKeys?.delete(target.item.id);
    layer.openingGhostControllerKeys?.delete(target.item.id);
    const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
    if (controllerGhostKey) state.completeFolderOpenIconGhost?.(controllerGhostKey);
    ghost.alpha = 1;
    ghost.scale.set(1);
    layer.openingGhostBoundsRefreshers?.delete(target.item.id);
    this.finishTransition({ sessionToken: layer.openingGhostSessionToken });
  }

  start(state, targets, options = {}) {
    const layer = this.layer;
    const sessionToken = options.sessionToken || layer.folderTransitions?.activeOpenToken || null;
    this.clear({
      cancelSession: false,
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });
    layer.openingGhostSessionToken = sessionToken;
    layer.openingGhostKeys = new Set();
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
    layer.openingGhostState = state;
    layer.openingGhostControllerKeys = new Map();
    layer.openingGhostMotionControls = new Set();
    layer.openingGhostMotionControlsByItemId = new Map();

    layer.hidePageTrackForTransition(owner);
    this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      if (controllerGhostKey) layer.openingGhostControllerKeys.set(target.item.id, controllerGhostKey);
      layer.openingGhostKeys.add(target.item.id);
    }

    for (const target of usableTargets) {
      const ghost = this.ghostFactory();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const motion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: folderOpenGhostDuration,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(motion.fromX, motion.fromY);
      ghost.scale.set(motion.scale);
      ghost.alpha = motion.alpha;
      const refreshGhostBounds = () => layer.registerOpeningGhostBounds?.(state, target, ghost);
      layer.openingGhostBoundsRefreshers?.set(target.item.id, refreshGhostBounds);
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
        transition(ghost.labelText)
          .preset("fade", { delay: motion.labelDelay, duration: 0.13 })
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 1 })
          .start();
        transition(ghost.labelText.scale)
          .preset("fade", { delay: motion.labelDelay, duration: 0.13 })
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
      motionControl = animateOpeningGhost(ghost, motion, () => {
        didComplete = true;
        if (motionControl) {
          layer.openingGhostMotionControls?.delete(motionControl);
          layer.openingGhostMotionControlsByItemId?.delete(target.item.id);
        }
        this.complete(state, target, ghost);
      }, { scheduler: this.scheduler, onFrame: refreshGhostBounds });
      if (!didComplete && layer.openingGhostKeys?.has(target.item.id)) {
        layer.openingGhostMotionControls.add(motionControl);
        layer.openingGhostMotionControlsByItemId.set(target.item.id, motionControl);
      }
    }
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
