import { Container, Graphics } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { killMotionOf, motion, motionSequence } from "../animation/motionTween.js";
import { getFolderFrameRadius } from "../nodes/folderThumbDrawing.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";

const FOLDER_DROP_FLASH_FILL_ALPHA = 0.42;
const FOLDER_DROP_FLASH_STROKE_ALPHA = 0.36;
const FOLDER_DROP_FRAME_DURATION = 0.14;
const FOLDER_DROP_FRAME_EASE = "power3.out";
const FOLDER_DROP_FLASH_STEPS = [
  { duration: 0.135, flash: 1 },
  { duration: 0.135, flash: 0 },
  { duration: 0.135, flash: 0.86 },
  { duration: 0.135, flash: 0 },
];

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function readRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return { height, left, top, width };
}

function expandRect(rect, padding = 0) {
  if (!rect) return null;
  const safePadding = Math.max(0, Number(padding) || 0);
  return {
    height: Math.max(0, Number(rect.height) || 0) + safePadding * 2,
    left: (Number(rect.left) || 0) - safePadding,
    top: (Number(rect.top) || 0) - safePadding,
    width: Math.max(0, Number(rect.width) || 0) + safePadding * 2,
  };
}

function makeDrawKey(target, part, stageRect) {
  if (!target?.active || !target.hoverRect) return null;
  return [
    part,
    target.targetId || "",
    target.geometryVersion || "",
    Number(target.iconSize) || 0,
    Number(target.padding) || 0,
    Number(stageRect?.left) || 0,
    Number(stageRect?.top) || 0,
  ].join(":");
}

function makeTargetKey(target, drawKey) {
  return target?.targetId || drawKey || null;
}

function resolveBaseRect(target, stageRect, targetNode) {
  const nodeRect = targetNode?.getFolderThumbBounds?.(stageRect);
  return readRect(clientRectToStageVisualRect(nodeRect || target?.hoverRect, stageRect || {}));
}

function resolveLocalRects(target, stageRect, targetNode) {
  const baseRect = resolveBaseRect(target, stageRect, targetNode);
  const padding = Math.max(0, Number(target?.padding) || 0);
  const baseSize = baseRect
    ? Math.max(1, Math.min(Math.max(0, Number(baseRect.width) || 0), Math.max(0, Number(baseRect.height) || 0)) || 1)
    : 1;
  const iconSize = Math.max(1, Number(target?.iconSize) || baseSize);
  const visualScale = Math.max(0.01, baseSize / iconSize);
  const visualPadding = padding * visualScale;
  return {
    baseRect,
    iconSize,
    paddedRect: expandRect(baseRect, visualPadding),
    padding,
    visualPadding,
    visualScale,
  };
}

function makeFolderThumbFrameSpec(target, stageRect, options = {}) {
  const { baseRect, iconSize, padding, visualScale } = resolveLocalRects(target, stageRect, options.targetNode);
  if (!baseRect || baseRect.width <= 0 || baseRect.height <= 0) return null;
  const thumb = getFolderThumbMetrics(iconSize);
  const safeFlash = clamp01(options.flash);
  const progress = clamp01(options.progress);
  const visualPadding = padding * visualScale * progress;
  const currentRect = expandRect(baseRect, visualPadding);
  if (!currentRect || currentRect.width <= 0 || currentRect.height <= 0) return null;
  const centerX = currentRect.left + currentRect.width / 2;
  const centerY = currentRect.top + currentRect.height / 2;
  const baseRadius = getFolderFrameRadius(thumb, 0) * visualScale;
  const hoverRadius = getFolderFrameRadius(thumb, padding) * visualScale;
  return {
    baseRect,
    baseRadius,
    centerX,
    centerY,
    fillAlpha: lerp(thumb.fillAlpha, FOLDER_DROP_FLASH_FILL_ALPHA, safeFlash),
    fillColor: thumb.fillColor,
    innerRect: {
      height: baseRect.height,
      left: -baseRect.width / 2,
      top: -baseRect.height / 2,
      width: baseRect.width,
    },
    outerRect: {
      height: currentRect.height,
      left: -currentRect.width / 2,
      top: -currentRect.height / 2,
      width: currentRect.width,
    },
    paddedRect: currentRect,
    padding,
    progress,
    radius: lerp(baseRadius, hoverRadius, progress),
    strokeAlpha: lerp(thumb.strokeAlpha, FOLDER_DROP_FLASH_STROKE_ALPHA, safeFlash),
    strokeColor: thumb.strokeColor,
    strokeWidth: (thumb.strokeWidth + safeFlash * 0.5) * visualScale,
    visualScale,
  };
}

class FolderDropTargetFrame extends Container {
  constructor(options = {}) {
    super();
    this.part = options.part || "full";
    this.onExitComplete = options.onExitComplete || (() => {});
    this.onExitStart = options.onExitStart || (() => {});
    this.onTargetActive = options.onTargetActive || (() => {});
    this.onFrameEmpty = options.onFrameEmpty || (() => {});
    this.graphics = new Graphics();
    this.frame = { alpha: 0, flash: 0, progress: 0 };
    this.graphics.eventMode = "none";
    this.eventMode = "none";
    this.visible = false;
    this.activeTargetId = null;
    this.clearing = false;
    this.currentContext = null;
    this.currentTarget = null;
    this.exitingTargetId = null;
    this.lastDrawKey = null;
    this.lastDrawFrame = null;
    this.lastDrawRect = null;
    this.lastPhase = null;
    this.restorePending = false;
    this.targetKey = null;
    this.addChild(this.graphics);
  }

  update(target, context = {}) {
    const drawKey = makeDrawKey(target, this.part, context.stageRect);
    if (!drawKey) {
      this.clear();
      return;
    }
    const targetKey = makeTargetKey(target, drawKey);
    const targetId = target?.targetId || targetKey;
    const isEntering = this.targetKey !== targetKey || !this.visible || this.clearing;
    this.currentTarget = target;
    this.currentContext = { stageRect: context.stageRect, targetNode: context.targetNode || null };
    if (isEntering) this.prepareEnter(targetKey, target, context);
    this.activeTargetId = targetId;
    this.exitingTargetId = null;
    this.onTargetActive(targetId);
    if (this.lastDrawKey !== drawKey || isEntering || context.forceDraw) {
      this.lastDrawKey = drawKey;
      this.draw(target, context);
    } else {
      this.applyFrame();
    }
    if (isEntering) this.animateIn();
    this.updatePhase(target.phase);
  }

  prepareEnter(targetKey, target, context = {}) {
    const previousProgress = clamp01(this.frame.progress);
    const shouldPreserveProgress = this.restorePending || this.clearing;
    this.clearing = false;
    this.restorePending = false;
    this.targetKey = targetKey;
    this.lastPhase = null;
    killMotionOf(this.frame, null, { reason: "folder-drop-target-enter" });
    this.frame.alpha = 1;
    this.frame.flash = 0;
    this.frame.progress = shouldPreserveProgress ? previousProgress : 0;
    this.visible = true;
    this.applyFrame();
  }

  draw(target, context = {}) {
    const stageRect = context.stageRect || {};
    this.currentTarget = target;
    this.currentContext = { stageRect: context.stageRect, targetNode: context.targetNode || null };
    const spec = makeFolderThumbFrameSpec(target, stageRect, {
      flash: this.frame.flash,
      progress: this.frame.progress,
      targetNode: context.targetNode || null,
    });
    this.lastDrawFrame = spec;
    this.lastDrawRect = spec?.paddedRect || null;
    this.graphics.clear();
    if (!spec) return;
    this.graphics.pivot.set(0, 0);
    this.graphics.position.set(spec.centerX, spec.centerY);
    if (this.part !== "stroke") {
      const outer = spec.outerRect;
      this.graphics
        .roundRect(outer.left, outer.top, outer.width, outer.height, spec.radius)
        .fill({ alpha: spec.fillAlpha, color: spec.fillColor });
    }
    if (this.part !== "fill") {
      const outer = spec.outerRect;
      this.graphics
        .roundRect(outer.left, outer.top, outer.width, outer.height, spec.radius)
        .stroke({ alpha: spec.strokeAlpha, color: spec.strokeColor, width: spec.strokeWidth });
    }
    this.applyFrame();
  }

  animateIn() {
    killMotionOf(this.frame, "progress", { reason: "folder-drop-target-retarget" });
    motion(this.frame)
      .duration(FOLDER_DROP_FRAME_DURATION)
      .ease(FOLDER_DROP_FRAME_EASE)
      .overlay()
      .interrupt("retarget")
      .to({
        onComplete: () => this.redrawCurrent(),
        onUpdate: () => this.redrawCurrent(),
        progress: 1,
      })
      .start();
    this.applyFrame();
  }

  updatePhase(phase) {
    const nextPhase = phase || "";
    if (this.lastPhase === nextPhase) return;
    this.lastPhase = nextPhase;
    if (nextPhase === "flash") this.playFlash();
  }

  playFlash() {
    killMotionOf(this.frame, "flash", { reason: "folder-drop-target-flash" });
    this.frame.flash = 0;
    motionSequence(this.frame, FOLDER_DROP_FLASH_STEPS.map((step, index) => ({
      ...step,
      ease: "sine.inOut",
      interrupt: "retarget",
      onComplete: index === FOLDER_DROP_FLASH_STEPS.length - 1
        ? () => {
          this.frame.flash = 0;
          this.redrawCurrent();
        }
        : undefined,
      onUpdate: () => this.redrawCurrent(),
    })));
    this.redrawCurrent();
  }

  redrawCurrent() {
    if (!this.currentTarget) return;
    this.draw(this.currentTarget, this.currentContext || {});
  }

  applyFrame() {
    const alpha = clamp01(this.frame.alpha);
    this.graphics.alpha = alpha;
    this.graphics.scale.set(1);
  }

  clear(options = {}) {
    if (options.immediate === true) {
      this.clearImmediate();
      return;
    }
    if (this.restorePending) {
      this.finishClear();
      return;
    }
    if (this.clearing) return;
    if (this.lastDrawKey == null && this.visible === false) return;
    const exitingTargetId = this.activeTargetId || this.currentTarget?.targetId || this.targetKey || null;
    this.lastDrawKey = null;
    this.lastPhase = null;
    this.targetKey = null;
    this.activeTargetId = null;
    this.exitingTargetId = exitingTargetId;
    killMotionOf(this.frame, "flash", { reason: "folder-drop-target-clear" });
    this.frame.flash = 0;
    this.redrawCurrent();
    if (exitingTargetId) this.onExitStart(exitingTargetId);
    if (!this.visible) {
      this.finishClear();
      return;
    }
    this.clearing = true;
    killMotionOf(this.frame, "progress", { reason: "folder-drop-target-clear" });
    motion(this.frame)
      .duration(FOLDER_DROP_FRAME_DURATION)
      .ease(FOLDER_DROP_FRAME_EASE)
      .overlay()
      .interrupt("retarget")
      .to({
        onComplete: () => this.finishShrink(),
        onUpdate: () => this.redrawCurrent(),
        progress: 0,
      })
      .start();
    this.applyFrame();
  }

  clearImmediate() {
    const exitingTargetId = this.activeTargetId || this.exitingTargetId || this.currentTarget?.targetId || this.targetKey || null;
    this.lastDrawKey = null;
    this.lastPhase = null;
    this.targetKey = null;
    this.activeTargetId = null;
    killMotionOf(this.frame, null, { reason: "folder-drop-target-opening-handoff" });
    if (exitingTargetId) this.onExitComplete(exitingTargetId);
    this.finishClear();
  }

  finishShrink() {
    if (this.targetKey) return;
    const completedTargetId = this.exitingTargetId;
    this.clearing = false;
    this.restorePending = true;
    this.frame.alpha = 1;
    this.applyFrame();
    if (completedTargetId) this.onExitComplete(completedTargetId);
  }

  finishClear() {
    if (this.targetKey) return;
    this.clearing = false;
    this.currentContext = null;
    this.currentTarget = null;
    this.exitingTargetId = null;
    this.lastDrawFrame = null;
    this.lastDrawRect = null;
    this.restorePending = false;
    this.frame.alpha = 0;
    this.frame.flash = 0;
    this.frame.progress = 0;
    this.graphics.clear();
    this.graphics.alpha = 0;
    this.graphics.scale.set(1);
    this.visible = false;
    this.onFrameEmpty(this);
  }

  destroy(options) {
    killMotionOf(this.frame, null, { reason: "destroyed" });
    killMotionOf(this, null, { reason: "destroyed" });
    super.destroy(options);
  }
}

export class FolderDropTargetLayer extends Container {
  constructor(options = {}) {
    super();
    this.part = options.part || "full";
    this.onExitComplete = options.onExitComplete || (() => {});
    this.onExitStart = options.onExitStart || (() => {});
    this.onTargetActive = options.onTargetActive || (() => {});
    this.eventMode = "none";
    this.frames = new Map();
    this.activeTargetId = null;
    this.visible = false;
    this.onRender = () => this.syncRenderedFrames();
  }

  get activeFrame() {
    return this.activeTargetId ? this.frames.get(this.activeTargetId) || null : null;
  }

  get graphics() {
    return this.activeFrame?.graphics || null;
  }

  get frame() {
    return this.activeFrame?.frame || null;
  }

  get clearing() {
    return this.activeFrame?.clearing === true;
  }

  get restorePending() {
    return this.activeFrame?.restorePending === true;
  }

  get lastDrawKey() {
    return this.activeFrame?.lastDrawKey ?? null;
  }

  get lastDrawFrame() {
    return this.activeFrame?.lastDrawFrame ?? null;
  }

  get lastDrawRect() {
    return this.activeFrame?.lastDrawRect ?? null;
  }

  getFrame(folderId) {
    return this.frames.get(folderId) || null;
  }

  getOrCreateFrame(folderId) {
    let frame = this.frames.get(folderId) || null;
    if (frame) return frame;
    frame = new FolderDropTargetFrame({
      part: this.part,
      onExitComplete: this.onExitComplete,
      onExitStart: this.onExitStart,
      onFrameEmpty: (emptyFrame) => this.removeEmptyFrame(folderId, emptyFrame),
      onTargetActive: this.onTargetActive,
    });
    this.frames.set(folderId, frame);
    this.addChild(frame);
    this.visible = true;
    return frame;
  }

  removeEmptyFrame(folderId, frame) {
    if (this.frames.get(folderId) !== frame) return;
    this.frames.delete(folderId);
    frame.destroy({ children: true });
    if (this.activeTargetId === folderId) this.activeTargetId = null;
    this.visible = this.frames.size > 0;
  }

  update(target, context = {}) {
    const drawKey = makeDrawKey(target, this.part, context.stageRect);
    const nextTargetId = drawKey ? target?.targetId || makeTargetKey(target, drawKey) : null;
    const immediateExitTargetId = context.exitTransition?.mode === "immediate"
      ? context.exitTransition.targetId || null
      : null;
    for (const [folderId, frame] of this.frames) {
      if (folderId === nextTargetId) continue;
      frame.clear({ immediate: folderId === immediateExitTargetId });
    }
    if (!nextTargetId) {
      this.activeTargetId = null;
      this.visible = this.frames.size > 0;
      return;
    }
    const frame = this.getOrCreateFrame(nextTargetId);
    this.activeTargetId = nextTargetId;
    frame.update(target, context);
    this.visible = true;
  }

  syncRenderedFrames() {
    for (const frame of this.frames.values()) {
      if (!frame.visible || !frame.currentTarget) continue;
      frame.redrawCurrent();
    }
  }

  destroy(options) {
    for (const frame of this.frames.values()) {
      frame.destroy({ children: true });
    }
    this.frames.clear();
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
