import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { folderCloseDuration, folderOpenGhostDuration } from "../animation/eases.js";
import { getIconNodeOffsetFromVisualCenter } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect, stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";

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
  return stageLayoutRectToStageVisualRect(stageRect, stageWidth, stageHeight, target?.targetStageLayoutRect);
}

export function makeOpeningGhostMotion(target, options = {}) {
  const {
    isTextlessMode = false,
    openDuration = folderOpenGhostDuration,
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
    closeDuration = folderCloseDuration,
    isTextlessMode = false,
    stageHeight,
    stageRect,
    stageWidth,
  } = options;
  const sourceRect = clientRectToStageVisualRect(target.sourceRect, stageRect);
  const targetRect = resolveTargetStageVisualRect(target, { stageHeight, stageRect, stageWidth });
  const labelOffset = getIconNodeOffsetFromVisualCenter(isTextlessMode);
  const sourceScale = target.sourceScale ?? 1;
  const sourceAlpha = target.sourceAlpha ?? 1;
  const scale = Math.max(0.14, targetRect.width / Math.max(1, target.iconSize));
  const fromX = sourceRect.left + sourceRect.width / 2;
  const fromY = sourceRect.top + sourceRect.height / 2 + labelOffset * sourceScale;
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
    targetRect,
    toX,
    toY,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
