import { gsap } from "gsap";
import { folderOpenGhostDuration, folderOpenGhostEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { springGroupTo } from "../animation/springGroup.js";
import { panelSpring } from "../animation/springMotion.js";
import { getMaxFolderGhostGridDelay, makeOpeningGhostMotion } from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;
const GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;

function animateOpeningGhost(ghost, motion, onComplete, options = {}) {
  gsap.to(ghost, {
    alpha: 1,
    duration: folderOpenGhostDuration,
    ease: folderOpenGhostEase,
    delay: motion.delay,
  });
  return springGroupTo([
    { target: ghost, prop: "x", to: motion.toX, config: panelSpring, options: { delay: motion.delay } },
    { target: ghost, prop: "y", to: motion.toY, config: panelSpring, options: { delay: motion.delay } },
    { target: ghost.scale, prop: "x", to: 1, config: panelSpring, options: { delay: motion.delay } },
    { target: ghost.scale, prop: "y", to: 1, config: panelSpring, options: { delay: motion.delay } },
  ], {
    scheduler: options.scheduler,
    onComplete,
  });
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
    const maxDelay = getMaxFolderGhostGridDelay(targets, 0.18);
    const fallbackSeconds = Math.max(folderOpenGhostDuration, GHOST_GEOMETRY_FALLBACK_SECONDS);
    const timeoutMs = Math.round((maxDelay + fallbackSeconds) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    layer.openingGhostRevealTimer = this.scheduler.setTimeout?.(() => {
      layer.openingGhostRevealTimer = null;
      if (layer.openingGhostKeys?.size) this.clear();
    }, timeoutMs) || null;
  }

  cancelMotionControls() {
    const layer = this.layer;
    const controls = layer.openingGhostMotionControls;
    layer.openingGhostMotionControls = null;
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  clear() {
    const layer = this.layer;
    this.clearRevealTimer();
    this.cancelMotionControls();
    if (layer.openingGhostControllerKeys?.size && layer.openingGhostState?.completeFolderOpenIconGhost) {
      for (const key of layer.openingGhostControllerKeys.values()) {
        if (key) layer.openingGhostState.completeFolderOpenIconGhost(key);
      }
    }
    layer.openingGhostControllerKeys = null;
    layer.openingGhostState = null;
    layer.openingGhostKeys?.clear();
    layer.clearFrameGhost();
    layer.pageTrack.visible = true;
    layer.revealIconNodes();
    layer.rebuildPageTrackMask();
    const ghosts = layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
  }

  finishTransition() {
    const layer = this.layer;
    if (layer.openingGhostKeys?.size) return;
    this.clearRevealTimer();
    this.cancelMotionControls();
    layer.openingGhostControllerKeys = null;
    layer.openingGhostState = null;
    layer.revealIconNodes();
    layer.pageTrack.visible = true;
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
    this.finishTransition();
  }

  start(state, targets) {
    const layer = this.layer;
    this.clear();
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

    if (!usableTargets.length) return;
    layer.openingGhostState = state;
    layer.openingGhostControllerKeys = new Map();
    layer.openingGhostMotionControls = new Set();
    layer.panelMaterial.visible = true;
    layer.panelMaterial.alpha = 1;
    layer.frameGhost.visible = false;
    layer.frameGhost.alpha = 0;

    layer.pageTrack.visible = false;
    this.scheduleRevealFallback(usableTargets);
    for (const target of usableTargets) {
      const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      if (controllerGhostKey) layer.openingGhostControllerKeys.set(target.item.id, controllerGhostKey);
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
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
        gsap.to(ghost.labelText, { alpha: 1, delay: motion.labelDelay, duration: 0.13, ease: "power2.out" });
        gsap.to(ghost.labelText.scale, { x: 1, y: 1, delay: motion.labelDelay, duration: 0.13, ease: "power2.out" });
      }
      layer.openingGhostLayer.addChild(ghost);
      layer.openingGhostKeys.add(target.item.id);
      for (const node of layer.iconNodes.values()) {
        if (node.item?.id === target.item.id) node.visible = false;
      }

      const motionControl = animateOpeningGhost(ghost, motion, () => {
        layer.openingGhostMotionControls?.delete(motionControl);
        this.complete(state, target, ghost);
      }, { scheduler: this.scheduler });
      layer.openingGhostMotionControls.add(motionControl);
    }
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
