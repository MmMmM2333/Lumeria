import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect, getStageScale } from "../geometry/stageCoordinates.js";
import { cloneIconVisualSpec } from "./iconVisualSpec.js";

export const DRAG_PREVIEW_SCALE = 1.12;
export const DRAG_PREVIEW_FOLDER_HOVER_SCALE = 0.92;
export const DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB = "folder-center-absorb";
export const DRAG_RELEASE_MODE_FOLDER_PREVIEW_SLOT = "folder-preview-slot";
export const DRAG_RELEASE_MODE_SLOT = "slot";

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

function getPointerIconCenter(preview, stageRect, iconSize) {
  const offset = preview?.offset || { x: iconSize / 2, y: iconSize / 2 };
  const pointer = preview?.pointer || { x: 0, y: 0 };
  const localPointer = clientPointToStageVisualPoint(pointer, stageRect) || { x: 0, y: 0 };
  return {
    x: localPointer.x - offset.x + iconSize / 2,
    y: localPointer.y - offset.y + iconSize / 2,
  };
}

function getReleaseStartSource(release) {
  const pointer = release?.startPose?.pointer;
  if (!pointer) return release;
  return {
    ...release,
    pointer,
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
    compact: preview?.compact === true,
    iconSize,
    key,
    position,
    scaleKey: `${key}:${targetScale}`,
    singleLineLabel: preview?.singleLineLabel === true,
    stageRect,
    targetScale,
    textless,
  };
}

export function getDragReleaseMotion(release, state = {}) {
  const releaseMode = release?.releaseMode || DRAG_RELEASE_MODE_SLOT;
  const provisionalLayoutTarget = release?.provisionalLayoutTarget === true;
  const sourceIconSize = getPreviewIconSize(release, state.iconSize);
  const targetVisualSpec = releaseMode === DRAG_RELEASE_MODE_SLOT
    ? cloneIconVisualSpec(release?.targetVisualSpec || release?.visualSpec)
    : null;
  const iconSize = targetVisualSpec?.iconSize || sourceIconSize;
  const cellSize = targetVisualSpec
    ? {
      height: targetVisualSpec.cellHeight,
      width: targetVisualSpec.cellWidth,
    }
    : getPreviewCellSize(release, iconSize);
  const stageRect = state.stageRect || { left: 0, top: 0 };
  const textless = targetVisualSpec
    ? targetVisualSpec.textless === true
    : Boolean(release?.textless ?? state.isTextlessMode);
  const sourceTextless = Boolean(release?.textless ?? state.isTextlessMode);
  const startSource = getReleaseStartSource(release);
  const hasExplicitStartPose = Boolean(release?.startPose?.pointer);
  const startIconCenter = targetVisualSpec ? getPointerIconCenter(startSource, stageRect, sourceIconSize) : null;
  const startScaleMultiplier = targetVisualSpec ? Math.max(0.01, sourceIconSize / iconSize) : 1;
  const visualOffsetY = getIconVisualOffsetY(textless);
  const start = startIconCenter
    ? {
      x: startIconCenter.x,
      y: startIconCenter.y - visualOffsetY * startScaleMultiplier,
    }
    : getPointerPlacement(startSource, stageRect, iconSize, sourceTextless);
  const targetRect = release?.targetRect;
  const targetStageLayoutRect = release?.targetStageLayoutRect;
  const hasStageLayoutTargetRect = Boolean(targetStageLayoutRect?.width && targetStageLayoutRect?.height);
  const hasClientTargetRect = Boolean(targetRect?.width && targetRect?.height);
  const hasTargetRect = hasStageLayoutTargetRect || hasClientTargetRect;
  const targetLocalRect = hasStageLayoutTargetRect
    ? targetStageLayoutRect
    : clientRectToStageVisualRect(targetRect, stageRect);
  const rawTargetScale = hasTargetRect ? Math.max(0.1, targetLocalRect.width / iconSize) : 1;
  const targetScale = releaseMode === DRAG_RELEASE_MODE_SLOT
    ? 1
    : releaseMode === DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB
      ? Math.max(0.06, Math.min(0.1, rawTargetScale))
      : rawTargetScale;
  const target = hasTargetRect
    ? {
      x: targetLocalRect.left + targetLocalRect.width / 2,
      y: targetLocalRect.top + targetLocalRect.height / 2 - visualOffsetY * targetScale,
    }
    : start;
  const targetAlpha = releaseMode === DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB ? 0 : 1;
  const targetLabelAlpha = releaseMode === DRAG_RELEASE_MODE_SLOT ? 1 : 0;
  const targetLabelScale = releaseMode === DRAG_RELEASE_MODE_SLOT ? 1 : 0.72;
  const stageScale = getStageScale(stageRect, state.width, state.height);
  const clientVelocity = release?.velocity || {};
  const velocity = {
    x: (Number(clientVelocity.x) || 0) / Math.max(0.0001, stageScale.scaleX || 1),
    y: (Number(clientVelocity.y) || 0) / Math.max(0.0001, stageScale.scaleY || 1),
  };
  return {
    cellHeight: cellSize.height,
    cellWidth: cellSize.width,
    completeOnScale: true,
    compact: targetVisualSpec ? targetVisualSpec.compact === true : release?.compact === true,
    hasStageLayoutTargetRect,
    hasTargetRect,
    iconSize,
    key: `${release?.key || makeDragPreviewKey(release)}:${release?.targetVersion ?? 0}:${hasTargetRect ? "target" : "pending"}${provisionalLayoutTarget ? ":provisional" : ""}`,
    provisionalLayoutTarget,
    releaseMode,
    singleLineLabel: targetVisualSpec ? targetVisualSpec.singleLineLabel === true : release?.singleLineLabel === true,
    stageRect,
    start,
    startIconCenter,
    startPose: hasExplicitStartPose ? { ...start } : null,
    startScaleMultiplier,
    target,
    targetAlpha,
    targetLabelAlpha,
    targetLabelScale,
    targetScale,
    visualOffsetY,
    textless,
    velocity,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
