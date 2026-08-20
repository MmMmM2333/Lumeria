import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { makeClosingPreviewSwapPlan } from "./folderPreviewSwapMotion.js";

function makeClosingPreviewSwapKey(folderId, pageIndex) {
  return `closing-preview-swap:${folderId || "folder"}:${pageIndex}`;
}

function makeClosingPreviewSwapIconKey(iconMotion) {
  return `${iconMotion?.item?.id || ""}:${iconMotion?.previewSlotIndex ?? ""}`;
}

function makeClosingPreviewSwapTargetsKey(targets = []) {
  return (targets || []).map((target) => {
    const rect = target?.targetClientRect || target?.targetStageLayoutRect || {};
    return [
      target?.item?.id || "",
      target?.previewSlotIndex ?? "",
      rect.left ?? "",
      rect.top ?? "",
      rect.width ?? "",
      rect.height ?? "",
      target?.targetClientRect ? "client" : "stage",
    ].join(":");
  }).join("|");
}

function drawPreviewSwapMask(mask, rect) {
  if (!mask || !rect) return;
  mask.clear?.();
  mask.rect(rect.left, rect.top, rect.width, rect.height).fill({ color: 0xffffff, alpha: 1 });
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
    this.containerFactory = options.containerFactory;
    this.graphicsFactory = options.graphicsFactory;
    this.spriteFactory = options.spriteFactory;
    this.textFactory = options.textFactory;
    this.getIconTexture = options.getIconTexture;
    this.scheduler = options.scheduler || globalThis;
    this.activeSwap = null;
    this.motionControls = new Set();
  }

  cancelMotionControls() {
    const controls = this.motionControls;
    this.motionControls = new Set();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  ensureLayer() {
    return this.layer.ensureClosingPreviewSwapLayer(this.containerFactory);
  }

  clear() {
    this.cancelMotionControls();
    this.activeSwap = null;
    const ghosts = this.layer.removeClosingPreviewSwapChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
    }
  }

  snapshot() {
    return Object.freeze({
      activeKey: this.activeSwap?.key || null,
      motionControlCount: this.motionControls.size,
    });
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

  complete(state, key, root, iconsWrap, onComplete, reporter) {
    const layer = this.layer;
    if (!reporter) return;
    const report = reporter.previewComplete(key);
    if (report.status !== "accepted") return;
    if (this.activeSwap?.key === key) this.activeSwap = null;
    this.cancelMotionControls();
    killMotionOf(root);
    killMotionOf(iconsWrap);
    killMotionOf(iconsWrap.scale);
    root.alpha = 1;
    iconsWrap.position.set(iconsWrap.pivot.x, iconsWrap.pivot.y);
    iconsWrap.scale.set(1);
    onComplete?.(state);
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
    const reporter = options.reporter;
    if (!reporter || typeof reporter.previewStarted !== "function" || typeof reporter.previewComplete !== "function") {
      const missing = typeof reporter?.previewStarted !== "function" ? "previewStarted" : "previewComplete";
      throw new TypeError(`closing preview swap reporter is missing ${missing}()`);
    }
    const key = makeClosingPreviewSwapKey(state.renderedFolder?.id, state.folderPageIndex);
    const targetKey = makeClosingPreviewSwapTargetsKey(targets);
    const registration = reporter.previewStarted(key);
    if (!registration || registration.status !== "accepted") return;
    const root = this.containerFactory();
    const mask = this.graphicsFactory();
    const iconsWrap = this.containerFactory();
    const iconsByKey = new Map();

    root.eventMode = "none";
    root.alpha = 0.86;
    drawPreviewSwapMask(mask, plan.maskRect);
    iconsWrap.mask = mask;
    iconsWrap.pivot.set(plan.centerX, plan.centerY);
    iconsWrap.position.set(plan.centerX, plan.centerY);
    iconsWrap.scale.set(plan.wrapStartScale);
    root.addChild(mask);
    root.addChild(iconsWrap);
    this.ensureLayer().addChild(root);

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
      iconsByKey.set(makeClosingPreviewSwapIconKey(iconMotion), { ghost });
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
    this.activeSwap = {
      iconsByKey,
      iconsWrap,
      key,
      mask,
      onComplete,
      reporter,
      root,
      state,
      targetKey,
    };
    motionControl = parallel(springItems, {
      onComplete: () => {
        didComplete = true;
        if (motionControl) this.motionControls.delete(motionControl);
        this.complete(state, key, root, iconsWrap, onComplete, reporter);
      },
    });
    if (!didComplete && motionControl) {
      if (this.activeSwap?.key === key) this.activeSwap.motionControl = motionControl;
      this.motionControls.add(motionControl);
    }
  }

  retarget(state, targets) {
    const active = this.activeSwap;
    if (!active || !targets?.length || state.folderPageIndex <= 0) return false;
    const targetKey = makeClosingPreviewSwapTargetsKey(targets);
    if (active.targetKey === targetKey) return false;

    const plan = makeClosingPreviewSwapPlan(targets, {
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    if (!plan) return false;

    if (active.motionControl) {
      this.motionControls.delete(active.motionControl);
      active.motionControl.release?.();
      active.motionControl = null;
    }

    active.targetKey = targetKey;
    active.state = state;
    drawPreviewSwapMask(active.mask, plan.maskRect);
    active.iconsWrap.pivot.set(plan.centerX, plan.centerY);
    active.iconsWrap.position.set(plan.centerX, plan.centerY);

    const nextKeys = new Set();
    const springItems = [
      previewSwapSpring(active.iconsWrap.scale, { x: 1, y: 1 }),
    ];
    for (const iconMotion of plan.iconMotions) {
      const iconKey = makeClosingPreviewSwapIconKey(iconMotion);
      nextKeys.add(iconKey);
      let record = active.iconsByKey.get(iconKey);
      if (!record) {
        const ghost = this.createIcon(iconMotion.item, iconMotion.size);
        ghost.position.set(iconMotion.fromX, iconMotion.fromY);
        ghost.scale.set(iconMotion.fromScale);
        ghost.alpha = 0.78;
        active.iconsWrap.addChild(ghost);
        record = { ghost };
        active.iconsByKey.set(iconKey, record);
      }
      record.ghost.item = iconMotion.item;
      record.ghost.iconSize = iconMotion.size;
      springItems.push(
        previewSwapSpring(record.ghost, { x: iconMotion.toX, y: iconMotion.toY }, { delay: iconMotion.delay }),
        previewSwapSpring(record.ghost.scale, { x: 1, y: 1 }, { delay: iconMotion.delay })
      );
    }

    for (const [iconKey, record] of active.iconsByKey) {
      if (nextKeys.has(iconKey)) continue;
      active.iconsByKey.delete(iconKey);
      killAllMotion(record.ghost);
      destroyDisplayObjectAfterFrame(record.ghost, { children: true }, this.scheduler);
    }

    let motionControl = null;
    let didComplete = false;
    motionControl = parallel(springItems, {
      onComplete: () => {
        didComplete = true;
        if (motionControl) this.motionControls.delete(motionControl);
        if (this.activeSwap === active) active.motionControl = null;
        this.complete(state, active.key, active.root, active.iconsWrap, active.onComplete, active.reporter);
      },
    });
    if (!didComplete && motionControl && this.activeSwap === active) {
      active.motionControl = motionControl;
      this.motionControls.add(motionControl);
    }
    return true;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
