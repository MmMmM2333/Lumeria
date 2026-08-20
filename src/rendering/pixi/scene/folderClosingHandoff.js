import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getStableFolderClosePresentationHitRects } from "./folderOverlayTargets.js";

function isUsableRect(rect) {
  return Boolean(rect) && rect.width > 0 && rect.height > 0;
}

function isPointInRect(x, y, rect) {
  return Boolean(rect) &&
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

export function applyClosingHandoffOnlyOverlayState(layer) {
  layer.hitArea = null;
  layer.panel.visible = false;
  layer.pageTrack.visible = false;
  if (layer.pageDotsLayer) {
    layer.pageDotsLayer.visible = false;
    layer.pageDotsLayer.eventMode = "none";
    layer.pageDotsLayer.hitArea = null;
  }
  layer.notifyTitleFrame?.(null, {
    folderId: layer.folderVisualSession?.snapshot?.().closing?.folderId || layer.currentFolderId || null,
  });
  return null;
}

export function getClosingPresentationStageHitRects(layer) {
  const closeSnapshot = layer?.folderVisualSession?.snapshot?.().closing || null;
  const targetRects = getStableFolderClosePresentationHitRects({
    handoffRect: closeSnapshot?.handoffRect,
    stableFolderCloseTarget: closeSnapshot?.handoffTarget || layer?.stableFolderCloseTarget,
  })
    .map((rect) => clientRectToStageVisualRect(rect, layer?.stageRect))
    .filter(isUsableRect);
  if (targetRects.length) return targetRects;
  const frameRect = layer.getClosingPresentationFrameRect();
  if (isUsableRect(frameRect)) return [frameRect];
  return [];
}

export function makeClosingPresentationHitArea(layer) {
  return {
    contains(x, y) {
      return getClosingPresentationStageHitRects(layer).some((rect) => isPointInRect(x, y, rect));
    },
  };
}

export function applyClosingPresentationOverlayState(layer) {
  layer.hitArea = makeClosingPresentationHitArea(layer);
  if (layer.pageDotsLayer) {
    layer.pageDotsLayer.visible = false;
    layer.pageDotsLayer.eventMode = "none";
    layer.pageDotsLayer.hitArea = null;
  }
  return layer.hitArea;
}

reloadOnPixiHotUpdate(import.meta.hot);
