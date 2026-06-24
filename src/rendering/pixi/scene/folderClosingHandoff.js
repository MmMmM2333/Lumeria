import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { ensureFolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import { getStableFolderClosePresentationHitRects } from "./folderOverlayTargets.js";
import { ensureLayerTransitionPort } from "./layerTransitionPort.js";

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

export function cancelClosingHandoffCleanup(layer, cancelAnimationFrame = globalThis.cancelAnimationFrame) {
  ensureFolderHandoffCoordinator(layer).cancelHandoffCleanup(cancelAnimationFrame);
}

export function applyClosingHandoffOnlyOverlayState(layer) {
  const transitionPort = ensureLayerTransitionPort(layer);
  transitionPort.setHitArea(null);
  transitionPort.setPanelVisible(false);
  transitionPort.setPageTrackVisible(false);
  return null;
}

export function getClosingPresentationStageHitRects(layer) {
  const closeSnapshot = layer?.folderHandoff?.snapshot?.() || null;
  const targetRects = getStableFolderClosePresentationHitRects({
    handoffRect: closeSnapshot?.handoffRect,
    stableFolderCloseTarget: closeSnapshot?.handoffTarget || layer?.stableFolderCloseTarget,
  })
    .map((rect) => clientRectToStageVisualRect(rect, layer?.stageRect))
    .filter(isUsableRect);
  if (targetRects.length) return targetRects;
  const frameRect = ensureLayerTransitionPort(layer).getClosingPresentationFrameRect();
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

export function scheduleClosingHandoffCleanup(layer, cleanup, scheduler = globalThis) {
  ensureFolderHandoffCoordinator(layer).scheduleHandoffCleanup(cleanup, scheduler);
}

export function finishClosingHandoff(layer, state, cleanup, scheduler = globalThis) {
  layer.clearClosingGhostRevealTimer();
  ensureLayerTransitionPort(layer).setPageTrackVisible(false);
  scheduleClosingHandoffCleanup(layer, cleanup, scheduler);
  layer.flushCompletedClosingControllerGhosts(state);
}

reloadOnPixiHotUpdate(import.meta.hot);
