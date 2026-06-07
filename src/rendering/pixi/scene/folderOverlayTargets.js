import { reloadOnPixiHotUpdate } from "../devHmr.js";
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

export function makeStableFolderCloseTarget(options = {}) {
  const { folderId, folderRect, folderThumbRect, getPreviewChildRect, previewSlots } = options;
  if (!folderId || !folderRect) return null;
  const previewChildRects = new Map();
  (previewSlots || []).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const childRect = getPreviewChildRect?.(item, previewSlotIndex);
    if (childRect) previewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), cloneRect(childRect));
  });
  return {
    folderId,
    iconRect: cloneRect(folderRect),
    previewChildRects,
    thumbRect: cloneRect(folderThumbRect),
  };
}

export function getStableFolderCloseRects(options = {}) {
  const { folderId, folderRect, folderThumbRect, isClosing, stableFolderCloseTarget } = options;
  const useStableTarget = Boolean(isClosing && stableFolderCloseTarget?.folderId === folderId);
  const closeIconRect = useStableTarget
    ? stableFolderCloseTarget.iconRect || folderRect
    : folderRect;
  const closeThumbRect = useStableTarget
    ? stableFolderCloseTarget.thumbRect || closeIconRect
    : folderThumbRect;
  return { closeIconRect, closeThumbRect };
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
    targetRect: makeIconRect(targetCenterX, targetCenterY, iconSize),
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
    ? stableFolderCloseTarget.previewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
    : null;
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
    targetRect: isThumbnailChild
      ? stablePreviewChildRect || makeProjectedPreviewRect(closeThumbRect, previewSlotIndex, 3, 3)
      : makeFolderCenterCollapseRect(closeThumbRect),
  };
}

export function makeClosingPreviewSwapTargets(options = {}) {
  const { folderId, folderRect, previewSlots, stableFolderCloseTarget } = options;
  if (!folderId || !folderRect) return [];
  return (previewSlots || []).slice(0, 9).map((item, previewSlotIndex) => {
    if (!item?.id) return null;
    const stablePreviewChildRect = stableFolderCloseTarget?.folderId === folderId
      ? stableFolderCloseTarget.previewChildRects?.get(makePreviewChildKey(item.id, previewSlotIndex))
      : null;
    const targetRect = stablePreviewChildRect || makeProjectedPreviewRect(folderRect, previewSlotIndex, 3, 3);
    return targetRect ? { item, previewSlotIndex, targetRect } : null;
  }).filter(Boolean);
}

reloadOnPixiHotUpdate(import.meta.hot);
