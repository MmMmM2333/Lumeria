import { Graphics } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";
import type { MotionEaseInput, MotionMilestone, MotionSpringConfig } from "../animation/motionRuntime.js";
import type { MotionControl } from "../animation/motionTween.js";
import type { StageRect } from "../geometry/stageCoordinates.js";

export { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";

type FolderFrameMotionControl = Readonly<{
  cancel?(reason?: string): void;
  completed?: boolean;
  release?(): void;
}>;

export interface FolderFrameGraphics {
  alpha: number;
  destroyed?: boolean;
  visible: boolean;
  clear(): FolderFrameGraphics;
  fill(style?: Readonly<{ alpha?: number; color?: number }>): FolderFrameGraphics;
  roundRect(left: number, top: number, width: number, height: number, radius: number): FolderFrameGraphics;
  stroke(style?: Readonly<{ alpha?: number; color?: number; width?: number }>): FolderFrameGraphics;
}

export interface FolderFrameAlphaDisplay {
  alpha: number;
  visible: boolean;
}

export type FolderFramePresentation = StageRect & {
  fillAlpha: number;
  fillColor: number;
  progress: number;
  radius: number;
  strokeAlpha: number;
  strokeColor: number;
  strokeWidth: number;
};

export type FolderFrameGhostOptions = Readonly<{
  crossfadePanelMaterial?: boolean | undefined;
  duration?: number | undefined;
  ease?: MotionEaseInput | undefined;
  exclusivePanelMaterialHandoff?: boolean | undefined;
  fadeStart?: number | undefined;
  folderId?: string | null | undefined;
  frameGhostFromAlpha?: number | undefined;
  frameGhostPhase?: string | null | undefined;
  frameGhostToAlpha?: number | undefined;
  fromFillAlpha?: number | undefined;
  fromFillColor?: number | undefined;
  fromRadius?: number | undefined;
  fromStrokeAlpha?: number | undefined;
  fromStrokeColor?: number | undefined;
  fromStrokeWidth?: number | undefined;
  notifyTitleFrame?: boolean | undefined;
  onArrive?: ((frame: FolderFramePresentation) => void) | undefined;
  onComplete?: (() => void) | undefined;
  onUpdate?: ((frame: FolderFramePresentation) => void) | undefined;
  panelMaterialFinalAlpha?: number | undefined;
  panelMaterialFromAlpha?: number | undefined;
  panelMaterialToAlpha?: number | undefined;
  preserveOnComplete?: boolean | undefined;
  preserveProgressOnReuse?: boolean | undefined;
  progressMilestones?: readonly MotionMilestone[] | undefined;
  snap?: boolean | undefined;
  springConfig?: Readonly<MotionSpringConfig> | undefined;
  toFillAlpha?: number | undefined;
  toFillColor?: number | undefined;
  toRadius?: number | undefined;
  toStrokeAlpha?: number | undefined;
  toStrokeColor?: number | undefined;
  toStrokeWidth?: number | undefined;
  updateClosingMask?: boolean | undefined;
}>;

export interface FolderFrameGhostLayer {
  addChild?(child: FolderFrameGraphics): unknown;
  addChildAt?(child: FolderFrameGraphics, index: number): unknown;
  children?: readonly object[];
  closingFrameMask?: FolderFrameGraphics;
  closingGhostLayer?: { mask?: FolderFrameGraphics | null };
  closingPreviewSwapLayer?: { mask?: FolderFrameGraphics | null };
  frameGhost: FolderFrameGraphics;
  frameGhostFolderId?: string | null | undefined;
  frameGhostMotionControl?: FolderFrameMotionControl | null | undefined;
  frameGhostPhase?: string | null | undefined;
  frameGhostState?: FolderFramePresentation | null | undefined;
  notifyTitleFrame?(rect: FolderFramePresentation, metadata?: Readonly<{ folderId?: string | null | undefined }>): void;
  openingGhosts?: { clearFrameTarget?(): void };
  panelMaterial: FolderFrameAlphaDisplay;
}

export function ensureClosingFrameMaskState(layer: FolderFrameGhostLayer): FolderFrameGraphics {
  if (layer.closingFrameMask && !layer.closingFrameMask.destroyed) return layer.closingFrameMask;
  layer.closingFrameMask = new Graphics();
  const frameIndex = layer.children?.indexOf?.(layer.frameGhost);
  if ((frameIndex as number) >= 0) layer.addChildAt!(layer.closingFrameMask, frameIndex! + 1);
  else layer.addChild!(layer.closingFrameMask);
  return layer.closingFrameMask;
}

export function clearClosingFrameMask(layer: FolderFrameGhostLayer): void {
  const mask = layer.closingFrameMask;
  if (layer.closingGhostLayer?.mask === mask) layer.closingGhostLayer!.mask = null;
  if (layer.closingPreviewSwapLayer?.mask === mask) layer.closingPreviewSwapLayer!.mask = null;
  mask?.clear?.();
}

export function enableClosingFrameMask(layer: FolderFrameGhostLayer): void {
  const mask = ensureClosingFrameMaskState(layer);
  layer.closingGhostLayer!.mask = mask;
  layer.closingPreviewSwapLayer!.mask = mask;
}

export function drawClosingFrameMask(layer: FolderFrameGhostLayer, rect: FolderFramePresentation): void {
  const mask = ensureClosingFrameMaskState(layer);
  mask.clear()
    .roundRect(rect.left, rect.top, rect.width, rect.height, rect.radius)
    .fill({ color: 0xffffff, alpha: 1 });
}

export function drawFrameGhost(
  layer: FolderFrameGhostLayer,
  rect: FolderFramePresentation,
  options: FolderFrameGhostOptions = {},
): void {
  const drawRect = rect;
  layer.frameGhost.clear()
    .roundRect(drawRect.left, drawRect.top, drawRect.width, drawRect.height, drawRect.radius)
    .fill({ color: Math.round(drawRect.fillColor ?? 0xf7f8ff), alpha: drawRect.fillAlpha })
    .stroke({ color: Math.round(drawRect.strokeColor ?? 0xffffff), alpha: drawRect.strokeAlpha, width: drawRect.strokeWidth ?? 1 });
  if (options.updateClosingMask) drawClosingFrameMask(layer, drawRect);
  if (options.notifyTitleFrame !== false) {
    layer.notifyTitleFrame!(drawRect, {
      folderId: options.folderId,
    });
  }
}

function cancelFrameGhostMotion(layer: FolderFrameGhostLayer): void {
  const control = layer.frameGhostMotionControl;
  layer.frameGhostMotionControl = null;
  control?.cancel?.();
}

function releaseFrameGhostMotion(layer: FolderFrameGhostLayer): void {
  const control = layer.frameGhostMotionControl;
  layer.frameGhostMotionControl = null;
  if (typeof control?.release === "function") {
    control.release();
    return;
  }
  control?.cancel?.();
}

function frameSpring(
  frame: FolderFramePresentation,
  prop: keyof FolderFramePresentation,
  to: number,
  springConfig: Readonly<MotionSpringConfig>,
  options: Readonly<{
    milestones?: readonly MotionMilestone[] | undefined;
    onArrive?: (() => void) | undefined;
    onUpdate?: (() => void) | undefined;
    snap?: boolean | undefined;
  }> = {},
) {
  return motion(frame)
    .layout()
    .spring(springConfig)
    .interrupt("retarget")
    .to({
      [prop]: to,
      milestones: options.milestones,
      onArrive: options.onArrive,
      onUpdate: options.onUpdate,
      snap: options.snap === true,
    });
}

function clamp01(value: unknown): number {
  const number: number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function remapProgressMilestones(
  milestones: readonly MotionMilestone[] | undefined,
  fromProgress: unknown,
): readonly MotionMilestone[] | undefined {
  if (!Array.isArray(milestones) || !milestones.length) return milestones;
  const from = clamp01(fromProgress);
  if (from <= 0) return milestones;
  const span = Math.max(0.0001, 1 - from);
  return milestones.map((milestone) => ({
    ...milestone,
    progress: clamp01((clamp01(milestone?.progress) - from) / span),
  }));
}

function startFrameGeometryMotion(
  layer: FolderFrameGhostLayer,
  frame: FolderFramePresentation | null | undefined,
  toRect: StageRect | null | undefined,
  options: FolderFrameGhostOptions = {},
  fadeControls: readonly FolderFrameMotionControl[] = [],
): MotionControl | null {
  if (!frame || !toRect) return null;
  const toFillColor = options.toFillColor ?? frame.fillColor ?? 0xf7f8ff;
  const toStrokeColor = options.toStrokeColor ?? frame.strokeColor ?? 0xffffff;
  const currentFillColor = frame.fillColor ?? toFillColor;
  const currentStrokeColor = frame.strokeColor ?? toStrokeColor;
  const progressMilestones = remapProgressMilestones(options.progressMilestones, frame.progress);
  const cancelFadeControls = (reason: string) => {
    for (const control of fadeControls) control.cancel?.(reason);
  };
  const updateFrame = () => {
    frame.fillColor = lerpColor(currentFillColor, toFillColor, frame.progress);
    frame.strokeColor = lerpColor(currentStrokeColor, toStrokeColor, frame.progress);
    drawFrameGhost(layer, frame, options);
    options.onUpdate?.(frame);
  };
  let geometryArrived = false;
  let geometryArriveRemaining = 4;
  const arriveGeometryTrack = () => {
    geometryArriveRemaining -= 1;
    if (geometryArriveRemaining > 0 || geometryArrived) return;
    geometryArrived = true;
    options.onArrive?.(frame);
  };
  let frameMotionControl: FolderFrameMotionControl | null = null;
  const springConfig = options.springConfig || motionSprings.handoff;
  const frameMotionControlBase = parallel([
    frameSpring(frame, "fillAlpha", options.toFillAlpha ?? 0.26, springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "height", toRect.height, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "left", toRect.left, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "progress", 1, springConfig, { milestones: progressMilestones, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "radius", options.toRadius ?? getFrameRadius(toRect, 48), springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "strokeAlpha", options.toStrokeAlpha ?? 0.24, springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "strokeWidth", options.toStrokeWidth ?? frame.strokeWidth, springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "top", toRect.top, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "width", toRect.width, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
  ], {
    onComplete: () => {
      if (layer.frameGhostMotionControl === frameMotionControl) layer.frameGhostMotionControl = null;
      frame.fillColor = toFillColor;
      frame.strokeColor = toStrokeColor;
      if (options.preserveOnComplete) {
        layer.frameGhostState = frame;
        drawFrameGhost(layer, frame, options);
        options.onComplete?.();
        return;
      }
      cancelFadeControls("complete");
      clearFrameGhost(layer, { panelMaterialAlpha: options.panelMaterialFinalAlpha ?? 1 });
      options.onComplete?.();
    },
  });
  if (!frameMotionControlBase.completed) {
    frameMotionControl = {
      cancel() {
        cancelFadeControls("cancel");
        frameMotionControlBase.cancel();
      },
      get completed() {
        return frameMotionControlBase.completed;
      },
      release() {
        cancelFadeControls("release");
        // Retargeting must release the old callbacks without cancelling the
        // underlying spring. The motion runtime can then retarget the active
        // lane and carry its current velocity into the new target.
        frameMotionControlBase.release();
      },
    };
    layer.frameGhostMotionControl = frameMotionControl;
  }
  return frameMotionControlBase;
}

export function clearFrameGhost(
  layer: FolderFrameGhostLayer,
  options: Readonly<{ panelMaterialAlpha?: number }> = {},
): void {
  cancelFrameGhostMotion(layer);
  const wasOpeningFrame = layer.frameGhostPhase === "opening";
  layer.frameGhostState = null;
  layer.frameGhostPhase = null;
  layer.frameGhostFolderId = null;
  killMotionOf(layer.frameGhost);
  killMotionOf(layer.panelMaterial);
  layer.frameGhost.clear();
  layer.frameGhost.visible = false;
  layer.frameGhost.alpha = 0;
  clearClosingFrameMask(layer);
  layer.panelMaterial.visible = true;
  layer.panelMaterial.alpha = options.panelMaterialAlpha ?? 1;
  if (wasOpeningFrame) layer.openingGhosts?.clearFrameTarget?.();
}

export function startFrameGhost(
  layer: FolderFrameGhostLayer,
  fromRect: StageRect | null | undefined,
  toRect: StageRect | null | undefined,
  options: FolderFrameGhostOptions = {},
): void {
  if (!fromRect || !toRect) return;
  releaseFrameGhostMotion(layer);
  killMotionOf(layer.frameGhost);
  killMotionOf(layer.panelMaterial);
  const duration = options.duration ?? motionPresets.folderOpenGhost!.duration!;
  const ease = options.ease ?? motionPresets.folderOpenGhost!.ease!;
  const fadeStart = Math.max(0, Math.min(0.95, options.fadeStart ?? 0.72));
  const fadeDuration = Math.max(0.01, duration * (1 - fadeStart));
  const fromFillColor = options.fromFillColor ?? 0xf7f8ff;
  const toFillColor = options.toFillColor ?? fromFillColor;
  const fromStrokeColor = options.fromStrokeColor ?? 0xffffff;
  const toStrokeColor = options.toStrokeColor ?? fromStrokeColor;
  const exclusivePanelMaterialHandoff = options.exclusivePanelMaterialHandoff === true;
  const phase = options.frameGhostPhase || null;
  const folderId = options.folderId || null;
  const canReuseFrameState = Boolean(layer.frameGhostState) &&
    (!phase || !layer.frameGhostPhase || layer.frameGhostPhase === phase) &&
    (!folderId || layer.frameGhostFolderId === folderId);
  layer.panelMaterial.visible = !exclusivePanelMaterialHandoff;
  layer.panelMaterial.alpha = exclusivePanelMaterialHandoff ? 0 : options.panelMaterialFromAlpha ?? 0;
  layer.frameGhost.visible = true;
  layer.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
  const nextProgress = canReuseFrameState && options.preserveProgressOnReuse
    ? clamp01(layer.frameGhostState?.progress)
    : 0;
  const frame = canReuseFrameState
    ? layer.frameGhostState!
    : {} as FolderFramePresentation;
  if (!canReuseFrameState || options.preserveProgressOnReuse !== true) {
    // Reusing the object is fine, but a fresh handoff must draw its first
    // frame from the source rect. Otherwise an opening retarget can flash the
    // stale full-size panel before the new morph starts.
    frame.fillAlpha = options.fromFillAlpha ?? 0.22;
    frame.fillColor = fromFillColor;
    frame.height = fromRect.height;
    frame.left = fromRect.left;
    frame.radius = options.fromRadius ?? getFrameRadius(fromRect);
    frame.strokeAlpha = options.fromStrokeAlpha ?? 0.26;
    frame.strokeColor = fromStrokeColor;
    frame.strokeWidth = options.fromStrokeWidth ?? 1;
    frame.top = fromRect.top;
    frame.width = fromRect.width;
  }
  layer.frameGhostPhase = phase;
  layer.frameGhostFolderId = folderId;
  const currentFillColor = frame.fillColor ?? fromFillColor;
  const currentStrokeColor = frame.strokeColor ?? fromStrokeColor;
  frame.fillAlpha = frame.fillAlpha ?? options.fromFillAlpha ?? 0.22;
  frame.fillColor = currentFillColor;
  frame.progress = nextProgress;
  frame.radius = frame.radius ?? options.fromRadius ?? getFrameRadius(fromRect);
  frame.strokeAlpha = frame.strokeAlpha ?? options.fromStrokeAlpha ?? 0.26;
  frame.strokeColor = currentStrokeColor;
  frame.strokeWidth = frame.strokeWidth ?? options.fromStrokeWidth ?? 1;
  layer.frameGhostState = frame;
  drawFrameGhost(layer, frame, options);
  const fadeControls: MotionControl[] = [];
  const cancelFadeControls = (reason: string) => {
    for (const control of fadeControls) control.cancel?.(reason);
  };
  if (exclusivePanelMaterialHandoff) {
    // The frame ghost owns the shell until completion, then clearFrameGhost
    // atomically reveals panelMaterial and hides the frame ghost.
  } else if (options.crossfadePanelMaterial) {
    const alphaHandoff = { progress: 0 };
    const panelMaterialFromAlpha = layer.panelMaterial.alpha;
    const frameGhostFromAlpha = layer.frameGhost.alpha;
    const panelMaterialToAlpha = options.panelMaterialToAlpha ?? 1;
    const frameGhostToAlpha = options.frameGhostToAlpha ?? 0;
    const updateAlphaHandoff = () => {
      const mix = Math.max(0, Math.min(1, alphaHandoff.progress));
      layer.panelMaterial.alpha = panelMaterialFromAlpha + (panelMaterialToAlpha - panelMaterialFromAlpha) * mix;
      layer.frameGhost.alpha = frameGhostFromAlpha + (frameGhostToAlpha - frameGhostFromAlpha) * mix;
    };
    updateAlphaHandoff();
    fadeControls.push(motion(alphaHandoff)
      .duration(fadeDuration)
      .ease(ease)
      .delay(duration * fadeStart)
      .overlay()
      .interrupt("retarget")
      .to({ onUpdate: updateAlphaHandoff, progress: 1, snap: options.snap })
      .start());
  } else {
    fadeControls.push(motion(layer.panelMaterial)
      .duration(fadeDuration)
      .ease(ease)
      .delay(duration * fadeStart)
      .overlay()
      .interrupt("retarget")
      .to({ alpha: options.panelMaterialToAlpha ?? 1 })
      .start());
    fadeControls.push(motion(layer.frameGhost)
      .duration(fadeDuration)
      .ease(ease)
      .delay(duration * fadeStart)
      .overlay()
      .interrupt("retarget")
      .to({ alpha: options.frameGhostToAlpha ?? 0 })
      .start());
  }
  startFrameGeometryMotion(layer, frame, toRect, options, fadeControls);
}

export function retargetFrameGhost(
  layer: FolderFrameGhostLayer,
  toRect: StageRect | null | undefined,
  options: FolderFrameGhostOptions = {},
): boolean {
  const frame = layer?.frameGhostState;
  if (!frame || !toRect) return false;
  releaseFrameGhostMotion(layer);
  layer.frameGhostPhase = options.frameGhostPhase || layer.frameGhostPhase || null;
  layer.frameGhostFolderId = options.folderId || layer.frameGhostFolderId || null;
  layer.frameGhost.visible = true;
  if (options.frameGhostFromAlpha != null) layer.frameGhost.alpha = options.frameGhostFromAlpha;
  startFrameGeometryMotion(layer, frame, toRect, {
    ...options,
    preserveOnComplete: options.preserveOnComplete !== false,
  });
  return true;
}

reloadOnPixiHotUpdate(import.meta.hot);
