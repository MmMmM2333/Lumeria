import { Graphics } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";
import type { MotionEaseInput, MotionMilestone, MotionSpringConfig } from "../animation/motionRuntime.js";
import type { MotionControl } from "../animation/motionTween.js";
import type { StageRect } from "../geometry/stageCoordinates.js";
import {
  createFolderTransitionTrajectory,
} from "./folderTransitionTrajectory.js";
import type {
  FolderTransitionPlacement,
  FolderTransitionTrajectory,
} from "./folderTransitionTrajectory.js";

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

type FolderFrameEndpointStyle = Readonly<{
  fillAlpha: number;
  fillColor: number;
  radius: number;
  strokeAlpha: number;
  strokeColor: number;
  strokeWidth: number;
}>;

export type FolderFrameTransitionState = {
  continuityOffset: Readonly<StageRect & { anchorProgress: number }> | null;
  desktopRect: StageRect;
  desktopStyle: FolderFrameEndpointStyle;
  folderId: string | null;
  ownerToken: unknown | null;
  panelRect: StageRect;
  panelStyle: FolderFrameEndpointStyle;
  phase: string | null;
  phaseFrom: number;
  phaseTo: number;
  placement: FolderTransitionPlacement | null;
  progressState: { value: number };
  trajectory: FolderTransitionTrajectory;
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
  ownerToken?: unknown;
  onArrive?: ((frame: FolderFramePresentation) => void) | undefined;
  onComplete?: (() => void) | undefined;
  onUpdate?: ((frame: FolderFramePresentation) => void) | undefined;
  panelMaterialFinalAlpha?: number | undefined;
  panelMaterialFromAlpha?: number | undefined;
  panelMaterialToAlpha?: number | undefined;
  placement?: FolderTransitionPlacement | null | undefined;
  preserveOnComplete?: boolean | undefined;
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
  frameGhostTransitionState?: FolderFrameTransitionState | null | undefined;
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

function clamp01(value: unknown): number {
  const number: number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function cloneRect(rect: StageRect): StageRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function makeEndpointStyle(
  rect: StageRect,
  options: FolderFrameGhostOptions,
  prefix: "from" | "to",
  fallback: Partial<FolderFrameEndpointStyle> = {},
): FolderFrameEndpointStyle {
  const read = (name: keyof FolderFrameEndpointStyle, defaultValue: number): number => {
    const optionName = `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` as keyof FolderFrameGhostOptions;
    const value = Number(options[optionName]);
    if (Number.isFinite(value)) return value;
    const fallbackValue = Number(fallback[name]);
    return Number.isFinite(fallbackValue) ? fallbackValue : defaultValue;
  };
  return {
    fillAlpha: read("fillAlpha", prefix === "from" ? 0.22 : 0.26),
    fillColor: read("fillColor", 0xf7f8ff),
    radius: read("radius", getFrameRadius(rect, prefix === "to" ? 48 : 14)),
    strokeAlpha: read("strokeAlpha", prefix === "from" ? 0.26 : 0.24),
    strokeColor: read("strokeColor", 0xffffff),
    strokeWidth: read("strokeWidth", 1),
  };
}

function updateTransitionTrajectory(transition: FolderFrameTransitionState): void {
  transition.trajectory = createFolderTransitionTrajectory({
    desktopRect: transition.desktopRect,
    panelRect: transition.panelRect,
    placement: transition.placement,
  });
}

function sampleTransitionRect(transition: FolderFrameTransitionState): StageRect {
  const physicalProgress = transition.progressState.value;
  const rect = transition.trajectory.sample(physicalProgress);
  const offset = transition.continuityOffset;
  if (!offset) return rect;
  const denominator = transition.phaseTo - offset.anchorProgress;
  const continuityProgress = Math.abs(denominator) < 0.0001
    ? 0
    : clamp01((transition.phaseTo - physicalProgress) / denominator);
  if (continuityProgress <= 0) {
    transition.continuityOffset = null;
    return rect;
  }
  return {
    height: rect.height + offset.height * continuityProgress,
    left: rect.left + offset.left * continuityProgress,
    top: rect.top + offset.top * continuityProgress,
    width: rect.width + offset.width * continuityProgress,
  };
}

function preserveCurrentFrameAcrossTrajectoryUpdate(
  frame: FolderFramePresentation,
  transition: FolderFrameTransitionState,
  update: () => void,
): void {
  const currentRect = cloneRect(frame);
  transition.continuityOffset = null;
  update();
  const nextRect = transition.trajectory.sample(transition.progressState.value);
  transition.continuityOffset = {
    anchorProgress: transition.progressState.value,
    height: currentRect.height - nextRect.height,
    left: currentRect.left - nextRect.left,
    top: currentRect.top - nextRect.top,
    width: currentRect.width - nextRect.width,
  };
}

function sampleTransitionFrame(
  frame: FolderFramePresentation,
  transition: FolderFrameTransitionState,
): void {
  const physicalProgress = transition.progressState.value;
  const rect = sampleTransitionRect(transition);
  const materialProgress = clamp01(physicalProgress);
  const phaseSpan = transition.phaseTo - transition.phaseFrom;
  frame.height = rect.height;
  frame.left = rect.left;
  frame.top = rect.top;
  frame.width = rect.width;
  frame.fillAlpha = lerp(transition.desktopStyle.fillAlpha, transition.panelStyle.fillAlpha, materialProgress);
  frame.fillColor = lerpColor(transition.desktopStyle.fillColor, transition.panelStyle.fillColor, materialProgress);
  frame.radius = lerp(transition.desktopStyle.radius, transition.panelStyle.radius, materialProgress);
  frame.strokeAlpha = lerp(transition.desktopStyle.strokeAlpha, transition.panelStyle.strokeAlpha, materialProgress);
  frame.strokeColor = lerpColor(transition.desktopStyle.strokeColor, transition.panelStyle.strokeColor, materialProgress);
  frame.strokeWidth = lerp(transition.desktopStyle.strokeWidth, transition.panelStyle.strokeWidth, materialProgress);
  frame.progress = Math.abs(phaseSpan) < 0.0001
    ? 1
    : clamp01((physicalProgress - transition.phaseFrom) / phaseSpan);
}

export function updateFrameGhostTargetGeometry(
  layer: FolderFrameGhostLayer,
  toRect: StageRect | null | undefined,
  options: FolderFrameGhostOptions = {},
): boolean {
  const frame = layer?.frameGhostState;
  const transition = layer?.frameGhostTransitionState;
  if (!frame || !transition || !toRect) return false;
  const phase = options.frameGhostPhase || layer.frameGhostPhase || transition.phase || null;
  const isClosing = phase === "closing";
  layer.frameGhostPhase = phase;
  layer.frameGhostFolderId = options.folderId || layer.frameGhostFolderId || null;
  preserveCurrentFrameAcrossTrajectoryUpdate(frame, transition, () => {
    if (isClosing) {
      transition.desktopRect = cloneRect(toRect);
      transition.desktopStyle = makeEndpointStyle(toRect, options, "to", transition.desktopStyle);
    } else {
      transition.panelRect = cloneRect(toRect);
      transition.panelStyle = makeEndpointStyle(toRect, options, "to", transition.panelStyle);
    }
    if (options.placement !== undefined) transition.placement = options.placement || null;
    transition.phase = phase;
    transition.phaseTo = isClosing ? 0 : 1;
    updateTransitionTrajectory(transition);
  });
  sampleTransitionFrame(frame, transition);
  layer.frameGhost.visible = true;
  if (options.frameGhostFromAlpha != null) layer.frameGhost.alpha = options.frameGhostFromAlpha;
  drawFrameGhost(layer, frame, options);
  return true;
}

function startFrameGeometryMotion(
  layer: FolderFrameGhostLayer,
  frame: FolderFramePresentation | null | undefined,
  transition: FolderFrameTransitionState | null | undefined,
  options: FolderFrameGhostOptions = {},
  fadeControls: readonly FolderFrameMotionControl[] = [],
): MotionControl | null {
  if (!frame || !transition) return null;
  const cancelFadeControls = (reason: string) => {
    for (const control of fadeControls) control.cancel?.(reason);
  };
  const updateFrame = () => {
    sampleTransitionFrame(frame, transition);
    drawFrameGhost(layer, frame, options);
    options.onUpdate?.(frame);
  };
  let frameMotionControl: FolderFrameMotionControl | null = null;
  const springConfig = options.springConfig || motionSprings.handoff;
  const frameMotionControlBase = motion(transition.progressState)
    .layout()
    .spring(springConfig)
    .interrupt("retarget")
    .to({
      milestones: options.progressMilestones,
      onArrive: () => options.onArrive?.(frame),
      onComplete: () => {
        if (layer.frameGhostMotionControl === frameMotionControl) layer.frameGhostMotionControl = null;
        transition.progressState.value = transition.phaseTo;
        updateFrame();
        if (options.preserveOnComplete) {
          layer.frameGhostState = frame;
          options.onComplete?.();
          return;
        }
        cancelFadeControls("complete");
        clearFrameGhost(layer, { panelMaterialAlpha: options.panelMaterialFinalAlpha ?? 1 });
        options.onComplete?.();
      },
      onUpdate: updateFrame,
      snap: options.snap === true,
      value: transition.phaseTo,
    })
    .start();
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
  options: Readonly<{ ownerToken?: unknown; panelMaterialAlpha?: number }> = {},
): boolean {
  if (
    options.ownerToken != null &&
    layer.frameGhostTransitionState?.ownerToken !== options.ownerToken
  ) return false;
  cancelFrameGhostMotion(layer);
  const wasOpeningFrame = layer.frameGhostPhase === "opening";
  if (layer.frameGhostTransitionState?.progressState) {
    killMotionOf(layer.frameGhostTransitionState.progressState);
  }
  layer.frameGhostState = null;
  layer.frameGhostTransitionState = null;
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
  return true;
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
  const exclusivePanelMaterialHandoff = options.exclusivePanelMaterialHandoff === true;
  const phase = options.frameGhostPhase || null;
  const folderId = options.folderId || null;
  const isClosing = phase === "closing";
  const existingTransition = layer.frameGhostTransitionState || null;
  const canReuseTransition = Boolean(
    existingTransition &&
    existingTransition.folderId === folderId &&
    layer.frameGhostState,
  );
  const phaseChanged = Boolean(canReuseTransition && existingTransition?.phase !== phase);
  const preservePhysicalProgress = Boolean(canReuseTransition && phaseChanged);
  layer.panelMaterial.visible = !exclusivePanelMaterialHandoff;
  layer.panelMaterial.alpha = exclusivePanelMaterialHandoff ? 0 : options.panelMaterialFromAlpha ?? 0;
  layer.frameGhost.visible = true;
  layer.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
  const frame = canReuseTransition
    ? layer.frameGhostState!
    : {} as FolderFramePresentation;
  let transition: FolderFrameTransitionState;
  if (!canReuseTransition) {
    if (existingTransition?.progressState) killMotionOf(existingTransition.progressState);
    const desktopRect = cloneRect(isClosing ? toRect : fromRect);
    const panelRect = cloneRect(isClosing ? fromRect : toRect);
    const desktopStyle = isClosing
      ? makeEndpointStyle(desktopRect, options, "to")
      : makeEndpointStyle(desktopRect, options, "from");
    const panelStyle = isClosing
      ? makeEndpointStyle(panelRect, options, "from")
      : makeEndpointStyle(panelRect, options, "to");
    const initialProgress = isClosing ? 1 : 0;
    transition = {
      continuityOffset: null,
      desktopRect,
      desktopStyle,
      folderId,
      ownerToken: options.ownerToken ?? null,
      panelRect,
      panelStyle,
      phase,
      phaseFrom: initialProgress,
      phaseTo: isClosing ? 0 : 1,
      placement: options.placement || null,
      progressState: { value: initialProgress },
      trajectory: createFolderTransitionTrajectory({ desktopRect, panelRect, placement: options.placement }),
    };
  } else {
    transition = existingTransition!;
    if (!preservePhysicalProgress) {
      killMotionOf(transition.progressState);
      transition.progressState.value = isClosing ? 1 : 0;
      transition.continuityOffset = null;
    }
    const updateEndpoints = () => {
      if (isClosing) {
        transition.desktopRect = cloneRect(toRect);
        transition.desktopStyle = makeEndpointStyle(toRect, options, "to", transition.desktopStyle);
        if (!preservePhysicalProgress) {
          transition.panelRect = cloneRect(fromRect);
          transition.panelStyle = makeEndpointStyle(fromRect, options, "from", transition.panelStyle);
        }
      } else {
        transition.desktopRect = cloneRect(fromRect);
        transition.desktopStyle = makeEndpointStyle(fromRect, options, "from", transition.desktopStyle);
        transition.panelRect = cloneRect(toRect);
        transition.panelStyle = makeEndpointStyle(toRect, options, "to", transition.panelStyle);
      }
      if (options.placement !== undefined) transition.placement = options.placement || null;
      updateTransitionTrajectory(transition);
    };
    if (preservePhysicalProgress) {
      preserveCurrentFrameAcrossTrajectoryUpdate(frame, transition, updateEndpoints);
    } else {
      updateEndpoints();
    }
    transition.phase = phase;
    if (options.ownerToken !== undefined) transition.ownerToken = options.ownerToken ?? null;
    if (phaseChanged || !preservePhysicalProgress) {
      transition.phaseFrom = transition.progressState.value;
    }
    transition.phaseTo = isClosing ? 0 : 1;
  }
  layer.frameGhostTransitionState = transition;
  layer.frameGhostPhase = phase;
  layer.frameGhostFolderId = folderId;
  layer.frameGhostState = frame;
  sampleTransitionFrame(frame, transition);
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
  startFrameGeometryMotion(layer, frame, transition, options, fadeControls);
}

export function retargetFrameGhost(
  layer: FolderFrameGhostLayer,
  toRect: StageRect | null | undefined,
  options: FolderFrameGhostOptions = {},
): boolean {
  if (!layer?.frameGhostState || !layer?.frameGhostTransitionState || !toRect) return false;
  releaseFrameGhostMotion(layer);
  if (!updateFrameGhostTargetGeometry(layer, toRect, options)) return false;
  const frame = layer.frameGhostState!;
  const transition = layer.frameGhostTransitionState!;
  startFrameGeometryMotion(layer, frame, transition, {
    ...options,
    preserveOnComplete: options.preserveOnComplete !== false,
  });
  return true;
}

reloadOnPixiHotUpdate(import.meta.hot);
