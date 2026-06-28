import { getAppFolderCreateTargetPadding } from "../nodes/iconFolderHoverState.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect, getStageScale } from "../geometry/stageCoordinates.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

function cloneRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  if (width <= 0 || height <= 0) return null;
  return { height, left, top, width };
}

function rectCenter(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function expandRect(rect, padding) {
  const safe = cloneRect(rect);
  if (!safe) return null;
  const amount = Math.max(0, Number(padding) || 0);
  return {
    height: safe.height + amount * 2,
    left: safe.left - amount,
    top: safe.top - amount,
    width: safe.width + amount * 2,
  };
}

function stageRectFromReleaseRect(stageRect, stageLayoutRect, clientRect) {
  return cloneRect(stageLayoutRect) || clientRectToStageVisualRect(clientRect, stageRect);
}

function getSlotRect(release, stageRect, stageLayoutKey, clientKey, slotIndex, thumbRect) {
  return stageRectFromReleaseRect(stageRect, release?.[stageLayoutKey], release?.[clientKey]) ||
    makeFolderThumbPreviewRect(thumbRect, slotIndex);
}

function getGhostLayout(item, sourceRect, targetRect, index) {
  const safeTarget = cloneRect(targetRect);
  const safeSource = cloneRect(sourceRect) || safeTarget;
  const iconSize = Math.max(1, Number(safeTarget?.width) || Number(safeSource?.width) || 1);
  const sourceCenter = rectCenter(safeSource || { left: 0, top: 0, width: iconSize, height: iconSize });
  const targetCenter = rectCenter(safeTarget || safeSource || { left: 0, top: 0, width: iconSize, height: iconSize });
  return {
    iconSize,
    item,
    source: {
      scale: Math.max(0.01, (safeSource?.width || iconSize) / iconSize),
      x: sourceCenter.x,
      y: sourceCenter.y,
    },
    sourceRect: safeSource,
    target: {
      scale: 1,
      x: targetCenter.x,
      y: targetCenter.y,
    },
    targetRect: safeTarget,
    sourceKey: { index, type: "folder-create-ghost" },
  };
}

export function getFolderCreateReleaseMotion(release, state = {}) {
  const stageRect = state.stageRect || { left: 0, top: 0, width: state.width || 1, height: state.height || 1 };
  const targetSourceRect = stageRectFromReleaseRect(stageRect, release?.sourceTargetStageLayoutRect, release?.sourceTargetRect);
  const draggedSourceRect = stageRectFromReleaseRect(stageRect, release?.sourceDraggedStageLayoutRect, release?.sourceDraggedRect);
  const targetThumbRect = stageRectFromReleaseRect(stageRect, release?.targetThumbStageLayoutRect, release?.targetThumbRect) ||
    targetSourceRect;
  const sourceIconSize = Math.max(1, Number(release?.sourceTargetVisualSpec?.iconSize) || Number(targetSourceRect?.width) || Number(state.iconSize) || 64);
  const sourceFrameRect = expandRect(targetSourceRect || targetThumbRect, getAppFolderCreateTargetPadding(sourceIconSize)) ||
    targetThumbRect;
  const targetAppSlotRect = getSlotRect(release, stageRect, "targetAppSlotStageLayoutRect", "targetAppSlotRect", 0, targetThumbRect);
  const draggedAppSlotRect = getSlotRect(release, stageRect, "draggedAppSlotStageLayoutRect", "draggedAppSlotRect", 1, targetThumbRect);
  const thumbSize = Math.max(1, Number(targetThumbRect?.width) || Number(sourceFrameRect?.width) || Number(state.iconSize) || 64);
  const sourceFrameCenter = rectCenter(sourceFrameRect || targetThumbRect || { left: 0, top: 0, width: thumbSize, height: thumbSize });
  const targetFrameCenter = rectCenter(targetThumbRect || sourceFrameRect || { left: 0, top: 0, width: thumbSize, height: thumbSize });
  const stageScale = getStageScale(stageRect, state.width, state.height);
  const clientVelocity = release?.velocity || {};

  return {
    draggedApp: getGhostLayout(release?.draggedApp, draggedSourceRect, draggedAppSlotRect, 1),
    duration: Math.max(0.01, Number(release?.duration) || 0.18),
    frame: {
      source: {
        scale: Math.max(0.01, (sourceFrameRect?.width || thumbSize) / thumbSize),
        x: sourceFrameCenter.x,
        y: sourceFrameCenter.y,
      },
      target: {
        scale: 1,
        x: targetFrameCenter.x,
        y: targetFrameCenter.y,
      },
      targetSize: thumbSize,
    },
    hasTarget: Boolean(targetThumbRect && targetAppSlotRect && draggedAppSlotRect),
    key: `${release?.key || ""}:${release?.targetVersion ?? 0}`,
    releaseKey: release?.key || null,
    stageRect,
    targetApp: getGhostLayout(release?.targetApp, targetSourceRect, targetAppSlotRect, 0),
    textless: true,
    velocity: {
      x: (Number(clientVelocity.x) || 0) / Math.max(0.0001, stageScale.scaleX || 1),
      y: (Number(clientVelocity.y) || 0) / Math.max(0.0001, stageScale.scaleY || 1),
    },
    visualOffsetY: getIconVisualOffsetY(true),
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
