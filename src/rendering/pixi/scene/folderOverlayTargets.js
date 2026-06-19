import { reloadOnPixiHotUpdate } from "../devHmr.js";
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
    getProjectedClientPreviewChildRect,
    previewSlots,
    projectedClientIconRect,
    projectedClientThumbRect,
  } = options;
  if (!folderId || !projectedClientIconRect) return null;
  const projectedClientPreviewChildRects = new Map();
  (previewSlots || []).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const childRect = getProjectedClientPreviewChildRect?.(item, previewSlotIndex);
    if (childRect) projectedClientPreviewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), cloneRect(childRect));
  });
  return {
    folderId,
    projectedClientIconRect: cloneRect(projectedClientIconRect),
    projectedClientPreviewChildRects,
    projectedClientThumbRect: cloneRect(projectedClientThumbRect),
  };
}

export function getStableFolderCloseRects(options = {}) {
  const { folderId, folderRect, folderThumbRect, isClosing, stableFolderCloseTarget } = options;
  const useStableTarget = Boolean(isClosing && stableFolderCloseTarget?.folderId === folderId);
  const closeIconRect = useStableTarget
    ? stableFolderCloseTarget.projectedClientIconRect || folderRect
    : folderRect;
  const closeThumbRect = useStableTarget
    ? stableFolderCloseTarget.projectedClientThumbRect || closeIconRect
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
  return [
    cloneRect(stableFolderCloseTarget?.projectedClientThumbRect),
    cloneRect(stableFolderCloseTarget?.projectedClientIconRect),
  ].filter(Boolean);
}

export function makeOpeningGhostTarget(options = {}) {
  const {
    cellHeight,
    cellWidth,
    cols,
    controllerGhostKey,
    folderRect,
    getPreviewChildRect,
    iconSize,
    index,
    item,
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
    iconSize,
    index,
    isThumbnailChild,
    item,
    previewSlotIndex,
    sourceRect,
    targetRect: targetStageLayoutRect,
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
  const stablePreviewChildRect = isThumbnailChild && stableFolderCloseTarget?.folderId === folderId
    ? stableFolderCloseTarget.projectedClientPreviewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
    : null;
  const stablePreviewChildStageLayoutRect = isThumbnailChild && stableFolderCloseTarget?.folderId === folderId
    ? stableFolderCloseTarget.stageLayoutPreviewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
    : null;
  const stableThumbStageLayoutRect = stableFolderCloseTarget?.folderId === folderId
    ? stableFolderCloseTarget.stageLayoutThumbRect
    : null;
  const targetRect = isThumbnailChild
    ? stablePreviewChildRect || makeFolderThumbPreviewRect(closeThumbRect, previewSlotIndex)
    : makeFolderCenterCollapseRect(closeThumbRect);
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
    targetRect,
    targetStageLayoutRect,
  };
}

export function makeClosingPreviewSwapTargets(options = {}) {
  const { folderId, folderRect, previewSlots, stableFolderCloseTarget } = options;
  if (!folderId || !folderRect) return [];
  return (previewSlots || []).slice(0, 9).map((item, previewSlotIndex) => {
    if (!item?.id) return null;
    const stablePreviewChildRect = stableFolderCloseTarget?.folderId === folderId
      ? stableFolderCloseTarget.projectedClientPreviewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
      : null;
    const stablePreviewChildStageLayoutRect = stableFolderCloseTarget?.folderId === folderId
      ? stableFolderCloseTarget.stageLayoutPreviewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
      : null;
    const stableThumbStageLayoutRect = stableFolderCloseTarget?.folderId === folderId
      ? stableFolderCloseTarget.stageLayoutThumbRect
      : null;
    const targetRect = stablePreviewChildRect || makeFolderThumbPreviewRect(folderRect, previewSlotIndex);
    const targetStageLayoutRect = stablePreviewChildStageLayoutRect ||
      makeFolderThumbPreviewRect(stableThumbStageLayoutRect, previewSlotIndex);
    return targetRect ? { item, previewSlotIndex, targetRect, targetStageLayoutRect } : null;
  }).filter(Boolean);
}

reloadOnPixiHotUpdate(import.meta.hot);
