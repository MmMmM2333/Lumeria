import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { motionPresets } from "../animation/motionPresets.js";
import { getIconNodeOffsetFromVisualCenter } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect, stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import type { UsableFolderGhostTarget } from "./folderOverlayTargets.js";

const SYNTHETIC_OPEN_REVEAL_START: number = 0.18;
const SYNTHETIC_OPEN_REVEAL_END = 0.68;
const SYNTHETIC_OPEN_LABEL_REVEAL_START = 0.52;
const SYNTHETIC_OPEN_LABEL_REVEAL_END = 0.82;

export type FolderGhostMotionTarget = UsableFolderGhostTarget & Readonly<{
  columnCount?: number | undefined;
  iconSize: number;
  index?: number | undefined;
  isThumbnailChild?: boolean | undefined;
  sourceAlpha?: number | undefined;
  sourcePose?: Readonly<{
    scaleX: number;
    scaleY: number;
    x: number;
    y: number;
  }> | null | undefined;
  sourceScale?: number | undefined;
}>;

export type FolderOpeningGhostMotionTarget = FolderGhostMotionTarget & Readonly<{
  columnCount: number;
  index: number;
}>;

export type FolderGhostMotionOptions = Readonly<{
  alphaHold?: number | undefined;
  closeDuration?: number | undefined;
  isTextlessMode?: boolean | undefined;
  openDuration?: number | undefined;
  stageHeight?: number | undefined;
  stageRect?: StageOrigin | undefined;
  stageWidth?: number | undefined;
}>;

type FolderOpeningGhostMotionOptions = FolderGhostMotionOptions & Readonly<{
  sourceLocalRect?: StageRect | null | undefined;
}>;

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep(start: number, end: number, value: number): number {
  const progress = clamp01((value - start) / Math.max(0.0001, end - start));
  return progress * progress * (3 - 2 * progress);
}

export function getSyntheticOpeningGhostRevealState(
  currentScale: unknown,
  sourceScale: unknown,
  previousProgress: unknown = 0,
) {
  const fromScale = Math.max(0.01, Number(sourceScale) || 0.01);
  const scaleRange = Math.max(0.0001, 1 - fromScale);
  const geometryProgress = clamp01((Number(currentScale) - fromScale) / scaleRange);
  const progress = Math.max(clamp01(previousProgress), geometryProgress);
  const alpha = smoothstep(SYNTHETIC_OPEN_REVEAL_START, SYNTHETIC_OPEN_REVEAL_END, progress);
  const labelAlpha = smoothstep(
    SYNTHETIC_OPEN_LABEL_REVEAL_START,
    SYNTHETIC_OPEN_LABEL_REVEAL_END,
    progress
  );
  return {
    alpha,
    labelAlpha,
    labelScale: 0.94 + labelAlpha * 0.06,
    progress,
  };
}

export function getFolderGhostGridDelay(index: unknown, columnCount: unknown, maxDelay = 0.18): number {
  const safeIndex = Math.max(0, Number(index) || 0);
  const columns = Math.max(1, Number(columnCount) || 1);
  const row = Math.floor(safeIndex / columns);
  const col = safeIndex % columns;
  return Math.min(maxDelay, row * 0.022 + col * 0.01);
}

export function getMaxFolderGhostGridDelay(
  targets: readonly Pick<FolderGhostMotionTarget, "columnCount" | "index">[] | null | undefined,
  maxDelay: number,
): number {
  return (targets || []).reduce<number>((delay, target) =>
    Math.max(delay, getFolderGhostGridDelay(target.index, target.columnCount, maxDelay)), 0);
}

function cloneRect(rect: StageRect | null | undefined): StageRect | null {
  if (!rect) return null;
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function resolveTargetStageVisualRect(
  target: FolderGhostMotionTarget,
  options: Pick<FolderGhostMotionOptions, "stageHeight" | "stageRect" | "stageWidth"> = {},
): StageRect {
  const {
    stageHeight,
    stageRect,
    stageWidth,
  } = options;
  if (target?.targetClientRect) return clientRectToStageVisualRect(target.targetClientRect, stageRect);
  const projectionStageRect = stageRect
    ? {
      height: stageRect.height ?? stageHeight ?? 1,
      left: stageRect.left,
      top: stageRect.top,
      width: stageRect.width ?? stageWidth ?? 1,
    }
    : undefined;
  return stageLayoutRectToStageVisualRect(
    projectionStageRect,
    stageWidth ?? 1,
    stageHeight ?? 1,
    target?.targetStageLayoutRect,
  );
}

function getClosingGhostTargetScale(
  target: FolderGhostMotionTarget,
  targetRect: StageRect,
): number {
  const exactTargetScale = targetRect.width / Math.max(1, target.iconSize);
  return target.isThumbnailChild
    ? exactTargetScale
    : Math.max(0.14, exactTargetScale);
}

export function makeOpeningGhostMotion(
  target: FolderOpeningGhostMotionTarget,
  options: FolderOpeningGhostMotionOptions = {},
) {
  const {
    isTextlessMode = false,
    openDuration = motionPresets.folderOpenGhost!.duration!,
    stageHeight,
    stageRect,
    stageWidth,
  } = options;
  const sourceRect = cloneRect(options.sourceLocalRect) ?? clientRectToStageVisualRect(target.sourceRect, stageRect);
  const targetRect = resolveTargetStageVisualRect(target, { stageHeight, stageRect, stageWidth });
  const labelOffset = getIconNodeOffsetFromVisualCenter(isTextlessMode);
  const exactSourceScale = sourceRect.width / Math.max(1, target.iconSize);
  const scale = target.isThumbnailChild
    ? exactSourceScale
    : Math.max(0.16, exactSourceScale);
  const fromX = sourceRect.left + sourceRect.width / 2;
  const fromY = sourceRect.top + sourceRect.height / 2 + labelOffset * scale;
  const toX = targetRect.left + targetRect.width / 2;
  const toY = targetRect.top + targetRect.height / 2 + labelOffset;
  const delay = getFolderGhostGridDelay(target.index, target.columnCount, 0.18);
  return {
    alpha: target.isThumbnailChild ? 1 : 0,
    delay,
    fromX,
    fromY,
    labelDelay: delay + openDuration * 0.58,
    scale,
    sourceRect,
    isThumbnailChild: target.isThumbnailChild === true,
    targetRect,
    toX,
    toY,
  };
}

export function makeCompletedClosingPreviewMotion(
  target: FolderGhostMotionTarget,
  options: FolderGhostMotionOptions = {},
) {
  const { isTextlessMode = false, stageHeight, stageRect, stageWidth } = options;
  const targetRect = resolveTargetStageVisualRect(target, { stageHeight, stageRect, stageWidth });
  const labelOffset = getIconNodeOffsetFromVisualCenter(isTextlessMode);
  const scale = getClosingGhostTargetScale(target, targetRect);
  return {
    scale,
    targetRect,
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2 + labelOffset * scale,
  };
}

export function makeClosingGhostMotion(
  target: FolderGhostMotionTarget,
  options: FolderGhostMotionOptions = {},
) {
  const {
    alphaHold = 0.16,
    closeDuration = motionPresets.folderClose!.duration!,
    isTextlessMode = false,
    stageHeight,
    stageRect,
    stageWidth,
  } = options;
  const sourceRect = clientRectToStageVisualRect(target.sourceRect, stageRect);
  const targetRect = resolveTargetStageVisualRect(target, { stageHeight, stageRect, stageWidth });
  const labelOffset = getIconNodeOffsetFromVisualCenter(isTextlessMode);
  const sourcePose = target.sourcePose || null;
  const sourceScale = sourcePose?.scaleX ?? target.sourceScale ?? 1;
  const sourceScaleX = sourcePose?.scaleX ?? sourceScale;
  const sourceScaleY = sourcePose?.scaleY ?? sourceScale;
  const sourceAlpha = target.sourceAlpha ?? 1;
  const scale = getClosingGhostTargetScale(target, targetRect);
  const fromX = sourcePose?.x ?? (sourceRect.left + sourceRect.width / 2);
  const fromY = sourcePose?.y ?? (sourceRect.top + sourceRect.height / 2 + labelOffset * sourceScale);
  const toX = targetRect.left + targetRect.width / 2;
  const toY = targetRect.top + targetRect.height / 2 + labelOffset * scale;
  const delay = 0;
  return {
    alphaDelay: delay + closeDuration * alphaHold,
    delay,
    fromX,
    fromY,
    scale,
    sourceAlpha,
    sourceRect,
    sourceScale,
    sourceScaleX,
    sourceScaleY,
    targetRect,
    toX,
    toY,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
