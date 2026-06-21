import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { stageLayoutRectToClientRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbChildLocalRect } from "../nodes/folderThumbMetrics.js";
import { makeIconRect } from "./iconSceneHelpers.js";

export function cloneRect(rect) {
  if (!rect) return null;
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function makePreviewChildKey(childId, slotIndex) {
  return `${childId}:${slotIndex}`;
}

export function makePreviewSlotById(previewSlots) {
  return new Map(
    (previewSlots || [])
      .map((item, previewSlotIndex) => (item?.id ? [item.id, previewSlotIndex] : null))
      .filter(Boolean)
  );
}

export function findFolderGhostKey(ghosts, itemId, slotIndex) {
  const items = Array.isArray(ghosts) ? ghosts : [];
  const matchingSlot = items.find((ghost) => ghost.item?.id === itemId && ghost.slotIndex === slotIndex);
  return matchingSlot?.key || items.find((ghost) => ghost.item?.id === itemId)?.key || null;
}

export function hasUsableFolderGhostTarget(target) {
  return Boolean(target?.sourceRect && target.targetStageLayoutRect);
}

export function makeFolderCenterCollapseRect(folderRect) {
  if (!folderRect) return null;
  const size = Math.max(4, Math.min(folderRect.width, folderRect.height) * 0.18);
  return makeIconRect(folderRect.left + folderRect.width / 2, folderRect.top + folderRect.height / 2, size);
}

export function makeProjectedPreviewRect(folderRect, slotIndex, columnCount = 3, rowCount = 3) {
  if (!folderRect) return null;
  const safeIndex = Math.max(0, Number(slotIndex) || 0);
  const columns = Math.max(1, Math.floor(Number(columnCount) || 3));
  const rows = Math.max(1, Math.floor(Number(rowCount) || 3));
  const col = Math.min(columns - 1, safeIndex % columns);
  const row = Math.min(rows - 1, Math.floor(safeIndex / columns));
  const cellWidth = folderRect.width / columns;
  const cellHeight = folderRect.height / rows;
  const size = Math.max(3, Math.min(cellWidth, cellHeight) * 0.62);
  const centerX = folderRect.left + cellWidth * col + cellWidth / 2;
  const centerY = folderRect.top + cellHeight * row + cellHeight / 2;
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

export function makeFolderThumbPreviewRect(folderRect, slotIndex) {
  if (!folderRect) return null;
  const childRect = getFolderThumbChildLocalRect(folderRect.width, slotIndex);
  return {
    height: childRect.height,
    left: folderRect.left + folderRect.width / 2 + childRect.left,
    top: folderRect.top + folderRect.height / 2 + childRect.top,
    width: childRect.width,
  };
}

export function makeStableFolderCloseTarget(options = {}) {
  const {
    folderId,
    getStageLayoutPreviewChildRect,
    iconRect,
    previewSlots,
    projection,
    source = null,
    thumbRect,
  } = options;
  if (!folderId || !iconRect) return null;
  const previewChildRects = new Map();
  (previewSlots || []).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const childRect = getStageLayoutPreviewChildRect?.(item, previewSlotIndex);
    if (childRect) previewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), cloneRect(childRect));
  });
  return {
    coordinateSpace: "stage-layout",
    folderId,
    iconRect: cloneRect(iconRect),
    previewChildRects,
    projection: projection ? { ...projection } : null,
    source,
    thumbRect: cloneRect(thumbRect),
  };
}

export function projectFolderCloseTargetRectToClient(stableFolderCloseTarget, rect) {
  if (!stableFolderCloseTarget || !rect) return null;
  const { stageHeight, stageRect, stageWidth } = stableFolderCloseTarget.projection || {};
  if (!stageRect || !stageWidth || !stageHeight) return null;
  return stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, rect);
}

export function projectFolderCloseTargetToClient(stableFolderCloseTarget) {
  if (!stableFolderCloseTarget) return null;
  const iconRect = projectFolderCloseTargetRectToClient(stableFolderCloseTarget, stableFolderCloseTarget.iconRect);
  if (!iconRect) return null;
  const thumbRect = projectFolderCloseTargetRectToClient(stableFolderCloseTarget, stableFolderCloseTarget.thumbRect) || iconRect;
  const previewChildRects = new Map();
  for (const [key, rect] of stableFolderCloseTarget.previewChildRects || []) {
    const childRect = projectFolderCloseTargetRectToClient(stableFolderCloseTarget, rect);
    if (childRect) previewChildRects.set(key, childRect);
  }
  return {
    folderId: stableFolderCloseTarget.folderId,
    iconRect,
    previewChildRects,
    source: stableFolderCloseTarget.source || null,
    thumbRect,
  };
}

export function getStableFolderCloseRects(options = {}) {
  const { folderId, folderRect, folderThumbRect, isClosing, stableFolderCloseTarget } = options;
  const useStableTarget = Boolean(isClosing && stableFolderCloseTarget?.folderId === folderId);
  const projectedTarget = useStableTarget ? projectFolderCloseTargetToClient(stableFolderCloseTarget) : null;
  const closeIconRect = useStableTarget
    ? projectedTarget?.iconRect || folderRect
    : folderRect;
  const closeThumbRect = useStableTarget
    ? projectedTarget?.thumbRect || closeIconRect
    : folderThumbRect;
  return { closeIconRect, closeThumbRect };
}

export function getStableFolderClosePresentationHitRects(options = {}) {
  const {
    frameRect = null,
    handoffRect = null,
    stableFolderCloseTarget = null,
  } = options;
  const presentationFrameRect = cloneRect(frameRect);
  if (presentationFrameRect) return [presentationFrameRect];
  const currentHandoffRect = cloneRect(handoffRect);
  if (currentHandoffRect) return [currentHandoffRect];
  const projectedTarget = projectFolderCloseTargetToClient(stableFolderCloseTarget);
  return [
    cloneRect(projectedTarget?.thumbRect),
    cloneRect(projectedTarget?.iconRect),
  ].filter(Boolean);
}

export function makeOpeningGhostTarget(options = {}) {
  const {
    cellHeight,
    cellWidth,
    cols,
    controllerGhostKey,
    folderId,
    folderRect,
    getPreviewChildRect,
    iconSize,
    index,
    item,
    pageIndex = 0,
    previewSlotById,
    rows,
    targetCenterX,
    targetCenterY,
  } = options;
  const previewSlotIndex = previewSlotById?.get(item?.id);
  const isThumbnailChild = previewSlotIndex != null;
  const sourceRect = isThumbnailChild
    ? getPreviewChildRect?.(item, previewSlotIndex) || makeProjectedPreviewRect(folderRect, previewSlotIndex, 3, 3)
    : getPreviewChildRect?.(item, index) || makeProjectedPreviewRect(folderRect, index, cols, rows);
  const targetStageLayoutRect = makeIconRect(targetCenterX, targetCenterY, iconSize);
  return {
    cellHeight,
    cellWidth,
    columnCount: cols,
    controllerGhostKey,
    folderId,
    iconSize,
    index,
    isThumbnailChild,
    item,
    pageIndex,
    previewSlotIndex,
    sourceRect,
    targetStageLayoutRect,
  };
}

export function makeClosingGhostTarget(options = {}) {
  const {
    cellHeight,
    cellWidth,
    closeThumbRect,
    cols,
    controllerGhostKey,
    folderId,
    iconBounds,
    iconSize,
    index,
    item,
    previewSlotById,
    stableFolderCloseTarget,
  } = options;
  const previewSlotIndex = previewSlotById?.get(item?.id);
  const isThumbnailChild = previewSlotIndex != null;
  const stablePreviewChildStageLayoutRect = isThumbnailChild && stableFolderCloseTarget?.folderId === folderId
    ? stableFolderCloseTarget.previewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
    : null;
  const stableThumbStageLayoutRect = stableFolderCloseTarget?.folderId === folderId
    ? stableFolderCloseTarget.thumbRect
    : null;
  const targetStageLayoutRect = isThumbnailChild
    ? stablePreviewChildStageLayoutRect || makeFolderThumbPreviewRect(stableThumbStageLayoutRect, previewSlotIndex)
    : makeFolderCenterCollapseRect(stableThumbStageLayoutRect);
  return {
    cellHeight,
    cellWidth,
    columnCount: cols,
    controllerGhostKey,
    iconSize,
    index,
    isThumbnailChild,
    item,
    previewSlotIndex,
    sourceRect: iconBounds,
    targetStageLayoutRect,
  };
}

export function makeClosingPreviewSwapTargets(options = {}) {
  const { folderId, folderRect, previewSlots, stableFolderCloseTarget } = options;
  if (!folderId || !folderRect) return [];
  return (previewSlots || []).slice(0, 9).map((item, previewSlotIndex) => {
    if (!item?.id) return null;
    const stablePreviewChildStageLayoutRect = stableFolderCloseTarget?.folderId === folderId
      ? stableFolderCloseTarget.previewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
      : null;
    const stableThumbStageLayoutRect = stableFolderCloseTarget?.folderId === folderId
      ? stableFolderCloseTarget.thumbRect
      : null;
    const targetStageLayoutRect = stablePreviewChildStageLayoutRect ||
      makeFolderThumbPreviewRect(stableThumbStageLayoutRect, previewSlotIndex);
    return targetStageLayoutRect ? { item, previewSlotIndex, targetStageLayoutRect } : null;
  }).filter(Boolean);
}

reloadOnPixiHotUpdate(import.meta.hot);
