import { gsap } from "gsap";
import { folderPreviewSettleEase } from "../animation/eases.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { makeClosingPreviewSwapPlan } from "./folderPreviewSwapMotion.js";

function makeClosingPreviewSwapKey(folderId, pageIndex) {
  return `closing-preview-swap:${folderId || "folder"}:${pageIndex}`;
}

export class FolderClosingPreviewSwapController {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.containerFactory = options.containerFactory;
    this.graphicsFactory = options.graphicsFactory;
    this.spriteFactory = options.spriteFactory;
    this.textFactory = options.textFactory;
    this.getIconTexture = options.getIconTexture;
    layer.closingPreviewSwapKeys = layer.closingPreviewSwapKeys || new Set();
  }

  ensureLayer() {
    const layer = this.layer;
    if (!layer.closingPreviewSwapKeys) layer.closingPreviewSwapKeys = new Set();
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
    layer.closingPreviewSwapKeys?.clear();
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

  complete(state, key, root, iconsWrap, finishTransition) {
    const layer = this.layer;
    if (!layer.closingPreviewSwapKeys?.has(key)) return;
    layer.closingPreviewSwapKeys.delete(key);
    gsap.killTweensOf(root);
    gsap.killTweensOf(iconsWrap);
    gsap.killTweensOf(iconsWrap.scale);
    root.alpha = 1;
    iconsWrap.position.set(iconsWrap.pivot.x, iconsWrap.pivot.y);
    iconsWrap.scale.set(1);
    finishTransition(state);
  }

  start(state, targets, timing, finishTransition) {
    this.clear();
    if (!targets?.length || state.folderPageIndex <= 0) return;

    const plan = makeClosingPreviewSwapPlan(targets, { stageRect: state.stageRect });
    if (!plan) return;

    const layer = this.layer;
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
    layer.closingPreviewSwapKeys.add(key);

    const iconMotions = [];
    for (const motion of plan.iconMotions) {
      const ghost = this.createIcon(motion.item, motion.size);
      ghost.position.set(motion.fromX, motion.fromY);
      ghost.scale.set(motion.fromScale);
      ghost.alpha = 0.78;
      iconsWrap.addChild(ghost);
      iconMotions.push({ ...motion, ghost });
    }

    const timeline = gsap.timeline({
      onComplete: () => this.complete(state, key, root, iconsWrap, finishTransition),
    });
    timeline
      .to(root, { alpha: 1, duration: 0.08, ease: "power1.out" }, 0)
      .to(iconsWrap.scale, {
        x: 1,
        y: 1,
        duration: timing.swapDuration,
        ease: folderPreviewSettleEase,
      }, 0);
    for (const motion of iconMotions) {
      timeline
        .to(motion.ghost, {
          alpha: 1,
          duration: timing.iconDuration,
          ease: folderPreviewSettleEase,
          x: motion.toX,
          y: motion.toY,
        }, motion.delay)
        .to(motion.ghost.scale, {
          duration: timing.iconDuration,
          ease: folderPreviewSettleEase,
          x: 1,
          y: 1,
        }, motion.delay);
    }
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
