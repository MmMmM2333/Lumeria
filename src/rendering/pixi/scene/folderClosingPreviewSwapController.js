import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { ensureFolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import { makeClosingPreviewSwapPlan } from "./folderPreviewSwapMotion.js";

function makeClosingPreviewSwapKey(folderId, pageIndex) {
  return `closing-preview-swap:${folderId || "folder"}:${pageIndex}`;
}

function previewSwapSpring(target, vars, options = {}) {
  return motion(target)
    .handoff()
    .spring(motionSprings.handoff)
    .interrupt("retarget")
    .to({
      ...vars,
      delay: options.delay,
    });
}

export class FolderClosingPreviewSwapController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.handoffCoordinator = options.handoffCoordinator || ensureFolderHandoffCoordinator(layer);
    this.containerFactory = options.containerFactory;
    this.graphicsFactory = options.graphicsFactory;
    this.spriteFactory = options.spriteFactory;
    this.textFactory = options.textFactory;
    this.getIconTexture = options.getIconTexture;
    this.handoffCoordinator.ensureClosePreviewSwaps();
  }

  cancelMotionControls() {
    const controls = this.handoffCoordinator.consumeClosePreviewSwapMotionControls();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  ensureLayer() {
    const layer = this.layer;
    this.handoffCoordinator.ensureClosePreviewSwaps();
    if (layer.closingPreviewSwapLayer && !layer.closingPreviewSwapLayer.destroyed) {
      return layer.closingPreviewSwapLayer;
    }
    layer.closingPreviewSwapLayer = this.containerFactory();
    const closingIndex = layer.children?.indexOf?.(layer.closingGhostLayer);
    if (closingIndex >= 0) layer.addChildAt(layer.closingPreviewSwapLayer, closingIndex + 1);
    else layer.addChild(layer.closingPreviewSwapLayer);
    return layer.closingPreviewSwapLayer;
  }

  clear() {
    const layer = this.layer;
    this.cancelMotionControls();
    this.handoffCoordinator.clearClosePreviewSwaps();
    const swapLayer = layer.closingPreviewSwapLayer;
    if (!swapLayer || swapLayer.destroyed) return;
    const ghosts = swapLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      ghost.destroy?.({ children: true });
    }
  }

  createIcon(item, size) {
    const ghost = this.containerFactory();
    const sprite = this.spriteFactory();
    const emoji = this.textFactory(size);
    ghost.eventMode = "none";
    ghost.item = item;
    ghost.iconSize = size;
    sprite.anchor.set(0.5);
    emoji.anchor.set(0.5);
    ghost.addChild(sprite);
    ghost.addChild(emoji);

    const render = () => {
      const texture = this.getIconTexture(item, () => {
        if (ghost.destroyed) return;
        render();
      }, ghost);
      sprite.visible = Boolean(texture);
      emoji.visible = !texture;
      if (texture) {
        sprite.texture = texture;
        sprite.width = size;
        sprite.height = size;
        return;
      }
      emoji.text = item?.emoji || "◼";
      emoji.style.fontSize = size;
      emoji.style.lineHeight = size;
    };
    render();
    return ghost;
  }

  complete(state, key, root, iconsWrap, onComplete, token = this.handoffCoordinator.closeToken) {
    const layer = this.layer;
    const settlementEvents = this.handoffCoordinator.completeClosePreviewSwap(token, key);
    if (!settlementEvents) return;
    this.cancelMotionControls();
    killMotionOf(root);
    killMotionOf(iconsWrap);
    killMotionOf(iconsWrap.scale);
    root.alpha = 1;
    iconsWrap.position.set(iconsWrap.pivot.x, iconsWrap.pivot.y);
    iconsWrap.scale.set(1);
    onComplete(state, settlementEvents);
  }

  start(state, targets, timing, onComplete, options = {}) {
    this.clear();
    if (!targets?.length || state.folderPageIndex <= 0) return;

    const plan = makeClosingPreviewSwapPlan(targets, {
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    if (!plan) return;

    const layer = this.layer;
    const closeToken = options.closeToken ?? this.handoffCoordinator.closeToken;
    const key = makeClosingPreviewSwapKey(state.renderedFolder?.id, state.folderPageIndex);
    const root = this.containerFactory();
    const mask = this.graphicsFactory();
    const iconsWrap = this.containerFactory();

    root.eventMode = "none";
    root.alpha = 0.86;
    mask.rect(plan.maskRect.left, plan.maskRect.top, plan.maskRect.width, plan.maskRect.height).fill({ color: 0xffffff, alpha: 1 });
    iconsWrap.mask = mask;
    iconsWrap.pivot.set(plan.centerX, plan.centerY);
    iconsWrap.position.set(plan.centerX, plan.centerY);
    iconsWrap.scale.set(plan.wrapStartScale);
    root.addChild(mask);
    root.addChild(iconsWrap);
    this.ensureLayer().addChild(root);
    this.handoffCoordinator.trackClosePreviewSwap(key);
    this.handoffCoordinator.resetClosePreviewSwapMotionControls();

    const iconMotions = [];
    const springItems = [
      previewSwapSpring(iconsWrap.scale, { x: 1, y: 1 }),
    ];
    for (const iconMotion of plan.iconMotions) {
      const ghost = this.createIcon(iconMotion.item, iconMotion.size);
      ghost.position.set(iconMotion.fromX, iconMotion.fromY);
      ghost.scale.set(iconMotion.fromScale);
      ghost.alpha = 0.78;
      iconsWrap.addChild(ghost);
      iconMotions.push({ ...iconMotion, ghost });
      springItems.push(
        previewSwapSpring(ghost, { x: iconMotion.toX, y: iconMotion.toY }, { delay: iconMotion.delay }),
        previewSwapSpring(ghost.scale, { x: 1, y: 1 }, { delay: iconMotion.delay })
      );
    }

    motion(root)
      .duration(0.08)
      .ease("power1.out")
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1 })
      .start();
    for (const iconMotion of iconMotions) {
      motion(iconMotion.ghost)
        .duration(timing.iconDuration)
        .ease(motionPresets.folderPreviewSettle.ease)
        .delay(iconMotion.delay)
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }

    let motionControl = null;
    let didComplete = false;
    motionControl = parallel(springItems, {
      onComplete: () => {
        didComplete = true;
        if (motionControl) this.handoffCoordinator.deleteClosePreviewSwapMotionControl(motionControl);
        this.complete(state, key, root, iconsWrap, onComplete, closeToken);
      },
    });
    if (!didComplete && motionControl) {
      this.handoffCoordinator.addClosePreviewSwapMotionControl(motionControl);
    }
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
