import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { motionPresets } from "../animation/motionPresets.js";
import { getIconNodeOffsetFromVisualCenter } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect, stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";

const SYNTHETIC_OPEN_REVEAL_START = 0.18;
const SYNTHETIC_OPEN_REVEAL_END = 0.68;
const SYNTHETIC_OPEN_LABEL_REVEAL_START = 0.52;
const SYNTHETIC_OPEN_LABEL_REVEAL_END = 0.82;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep(start, end, value) {
  const progress = clamp01((value - start) / Math.max(0.0001, end - start));
  return progress * progress * (3 - 2 * progress);
}

export function getSyntheticOpeningGhostRevealState(currentScale, sourceScale, previousProgress = 0) {
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

export function getFolderGhostGridDelay(index, columnCount, maxDelay = 0.18) {
  const safeIndex = Math.max(0, Number(index) || 0);
  const columns = Math.max(1, Number(columnCount) || 1);
  const row = Math.floor(safeIndex / columns);
  const col = safeIndex % columns;
  return Math.min(maxDelay, row * 0.022 + col * 0.01);
}

export function getMaxFolderGhostGridDelay(targets, maxDelay) {
  return (targets || []).reduce((delay, target) =>
    Math.max(delay, getFolderGhostGridDelay(target.index, target.columnCount, maxDelay)), 0);
}

function cloneRect(rect) {
  if (!rect) return null;
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function resolveTargetStageVisualRect(target, options = {}) {
  const {
    stageHeight,
    stageRect,
    stageWidth,
  } = options;
  if (target?.targetClientRect) return clientRectToStageVisualRect(target.targetClientRect, stageRect);
  return stageLayoutRectToStageVisualRect(stageRect, stageWidth, stageHeight, target?.targetStageLayoutRect);
}

export function makeOpeningGhostMotion(target, options = {}) {
  const {
    isTextlessMode = false,
    openDuration = motionPresets.folderOpenGhost.duration,
    stageHeight,
    stageRect,
    stageWidth,
  } = options;
  const sourceRect = clientRectToStageVisualRect(target.sourceRect, stageRect);
  const targetRect = resolveTargetStageVisualRect(target, { stageHeight, stageRect, stageWidth });
  const labelOffset = getIconNodeOffsetFromVisualCenter(isTextlessMode);
  const scale = Math.max(0.16, target.sourceRect.width / Math.max(1, target.iconSize));
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

export function makeCompletedClosingPreviewMotion(target, options = {}) {
  const { isTextlessMode = false, stageHeight, stageRect, stageWidth } = options;
  const targetRect = resolveTargetStageVisualRect(target, { stageHeight, stageRect, stageWidth });
  const labelOffset = getIconNodeOffsetFromVisualCenter(isTextlessMode);
  const scale = Math.max(0.14, targetRect.width / Math.max(1, target.iconSize));
  return {
    scale,
    targetRect,
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2 + labelOffset * scale,
  };
}

export function makeClosingGhostMotion(target, options = {}) {
  const {
    alphaHold = 0.16,
    closeDuration = motionPresets.folderClose.duration,
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
  const scale = Math.max(0.14, targetRect.width / Math.max(1, target.iconSize));
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
