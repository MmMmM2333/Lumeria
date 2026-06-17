import { gsap } from "gsap";
import { folderOpenGhostDuration, folderOpenGhostEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { getMaxFolderGhostGridDelay, makeOpeningGhostMotion } from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS = 140;

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
    const timeoutMs = Math.round((maxDelay + folderOpenGhostDuration) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    layer.openingGhostRevealTimer = this.scheduler.setTimeout?.(() => {
      layer.openingGhostRevealTimer = null;
      if (layer.openingGhostKeys?.size) this.clear();
    }, timeoutMs) || null;
  }

  clear() {
    const layer = this.layer;
    this.clearRevealTimer();
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
    const usableTargets = (targets || []).filter((target) => target.sourceRect && target.targetRect);

    if (!usableTargets.length) return;
    layer.panelMaterial.visible = true;
    layer.panelMaterial.alpha = 1;
    layer.frameGhost.visible = false;
    layer.frameGhost.alpha = 0;

    layer.pageTrack.visible = false;
    this.scheduleRevealFallback(usableTargets);
    for (const target of usableTargets) {
      const ghost = this.ghostFactory();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const motion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: folderOpenGhostDuration,
        stageRect: state.stageRect,
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

      gsap.to(ghost, {
        alpha: 1,
        duration: folderOpenGhostDuration,
        ease: folderOpenGhostEase,
        x: motion.toX,
        y: motion.toY,
        delay: motion.delay,
        onComplete: () => this.complete(state, target, ghost),
      });
      gsap.to(ghost.scale, {
        duration: folderOpenGhostDuration,
        ease: folderOpenGhostEase,
        x: 1,
        y: 1,
        delay: motion.delay,
      });
    }
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
