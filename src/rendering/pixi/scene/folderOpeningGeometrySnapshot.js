import { STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import { cloneRect, makePreviewChildKey } from "./folderOverlayTargets.js";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundKeyValue(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function cloneStageRect(rect) {
  if (!rect) return null;
  return {
    height: safeNumber(rect.height),
    left: safeNumber(rect.left),
    top: safeNumber(rect.top),
    width: safeNumber(rect.width),
  };
}

export function makeFolderOpeningGeometryLayoutKey(options = {}) {
  const {
    stageHeight,
    stageRect,
    stageWidth,
    targetKey = "",
  } = options;
  return [
    targetKey || "",
    roundKeyValue(stageRect?.left),
    roundKeyValue(stageRect?.top),
    roundKeyValue(stageRect?.width),
    roundKeyValue(stageRect?.height),
    roundKeyValue(stageWidth),
    roundKeyValue(stageHeight),
  ].join(":");
}

export function getFolderOpeningPreviewChildRect(snapshot, item, slotIndex) {
  if (!snapshot || !item?.id) return null;
  const rect = snapshot.previewChildRects?.get(makePreviewChildKey(item.id, slotIndex));
  return cloneRect(rect);
}

export function makeFolderOpeningGeometrySnapshot(options = {}) {
  const {
    folderId,
    folderRect,
    getPreviewChildRect,
    layoutKey = null,
    panelRect,
    previewSlots = [],
    sessionToken = null,
    stageHeight,
    stageRect,
    stageWidth,
    targetKey,
    targetX,
    targetY,
  } = options;
  const previewChildRects = new Map();
  (previewSlots || []).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const rect = getPreviewChildRect?.(item, previewSlotIndex);
    if (rect) previewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), cloneRect(rect));
  });
  return {
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    folderId: folderId || null,
    folderRect: cloneRect(folderRect),
    layoutKey,
    panelCenter: {
      x: safeNumber(targetX),
      y: safeNumber(targetY),
    },
    panelRect: cloneRect(panelRect),
    previewChildRects,
    sessionToken,
    stageHeight: safeNumber(stageHeight),
    stageRect: cloneStageRect(stageRect),
    stageWidth: safeNumber(stageWidth),
    targetKey: targetKey || "",
  };
}
