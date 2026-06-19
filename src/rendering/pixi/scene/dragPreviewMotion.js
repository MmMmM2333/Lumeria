import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";

export const DRAG_PREVIEW_SCALE = 1.12;
export const DRAG_PREVIEW_FOLDER_HOVER_SCALE = 0.92;

function getPreviewIconSize(preview, fallbackIconSize) {
  return Math.max(1, Number(preview?.size?.width) || Number(fallbackIconSize) || 64);
}

function getPreviewCellSize(preview, iconSize) {
  return {
    height: Math.max(iconSize, Number(preview?.cellSize?.height) || iconSize),
    width: Math.max(iconSize, Number(preview?.cellSize?.width) || iconSize),
  };
}

function getPointerPlacement(preview, stageRect, iconSize, textless) {
  const offset = preview?.offset || { x: iconSize / 2, y: iconSize / 2 };
  const pointer = preview?.pointer || { x: 0, y: 0 };
  const localPointer = clientPointToStageVisualPoint(pointer, stageRect) || { x: 0, y: 0 };
  const visualLeft = localPointer.x - offset.x;
  const visualTop = localPointer.y - offset.y;
  return {
    x: visualLeft + iconSize / 2,
    y: visualTop + iconSize / 2 - getIconVisualOffsetY(textless),
  };
}

export function makeDragPreviewKey(preview) {
  return [
    preview?.item?.id || "",
    preview?.source?.type || "",
    preview?.source?.folderId || "",
    preview?.source?.pageIndex ?? "",
    preview?.source?.index ?? "",
  ].join(":");
}

export function getDragPreviewTargetScale(folderHoverState) {
  const phase = folderHoverState?.phase;
  if (folderHoverState?.targetType === "folder" && (phase === "hover" || phase === "flash")) {
    return DRAG_PREVIEW_FOLDER_HOVER_SCALE;
  }
  return DRAG_PREVIEW_SCALE;
}

export function getDragPreviewLayout(preview, state = {}) {
  const iconSize = getPreviewIconSize(preview, state.iconSize);
  const cellSize = getPreviewCellSize(preview, iconSize);
  const stageRect = state.stageRect || { left: 0, top: 0 };
  const textless = Boolean(state.isTextlessMode);
  const position = getPointerPlacement(preview, stageRect, iconSize, textless);
  const targetScale = getDragPreviewTargetScale(state.folderHoverState);
  const key = makeDragPreviewKey(preview);
  return {
    cellHeight: cellSize.height,
    cellWidth: cellSize.width,
    iconSize,
    key,
    position,
    scaleKey: `${key}:${targetScale}`,
    stageRect,
    targetScale,
    textless,
  };
}

export function getDragReleaseMotion(release, state = {}) {
  const iconSize = getPreviewIconSize(release, state.iconSize);
  const cellSize = getPreviewCellSize(release, iconSize);
  const stageRect = state.stageRect || { left: 0, top: 0 };
  const textless = Boolean(release?.textless ?? state.isTextlessMode);
  const start = getPointerPlacement(release, stageRect, iconSize, textless);
  const targetRect = release?.targetRect;
  const targetStageLayoutRect = release?.targetStageLayoutRect;
  const hasStageLayoutTargetRect = Boolean(targetStageLayoutRect?.width && targetStageLayoutRect?.height);
  const hasClientTargetRect = Boolean(targetRect?.width && targetRect?.height);
  const hasTargetRect = hasStageLayoutTargetRect || hasClientTargetRect;
  const visualOffsetY = getIconVisualOffsetY(textless);
  const targetLocalRect = hasStageLayoutTargetRect
    ? targetStageLayoutRect
    : clientRectToStageVisualRect(targetRect, stageRect);
  const targetScale = hasTargetRect ? Math.max(0.1, targetLocalRect.width / iconSize) : 1;
  const target = hasTargetRect
    ? {
      x: targetLocalRect.left + targetLocalRect.width / 2,
      y: targetLocalRect.top + targetLocalRect.height / 2 - visualOffsetY,
    }
    : start;
  return {
    cellHeight: cellSize.height,
    cellWidth: cellSize.width,
    hasStageLayoutTargetRect,
    hasTargetRect,
    iconSize,
    key: `${release?.key || makeDragPreviewKey(release)}:${release?.targetVersion ?? 0}:${hasTargetRect ? "target" : "pending"}`,
    stageRect,
    start,
    target,
    targetScale,
    textless,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
