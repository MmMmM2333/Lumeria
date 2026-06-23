import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { ensureFolderTransitionMachine } from "./folderTransitionMachine.js";
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

export function cancelClosingHandoffCleanup(layer, cancelAnimationFrame = globalThis.cancelAnimationFrame) {
  ensureFolderTransitionMachine(layer).cancelHandoffCleanup(cancelAnimationFrame);
}

export function applyClosingHandoffOnlyOverlayState(layer) {
  layer.hitArea = null;
  layer.panel.visible = false;
  layer.pageTrack.visible = false;
  return null;
}

export function getClosingPresentationStageHitRects(layer) {
  const closeSnapshot = layer?.folderTransitions?.snapshot?.() || null;
  const targetRects = getStableFolderClosePresentationHitRects({
    handoffRect: closeSnapshot?.handoffRect,
    stableFolderCloseTarget: closeSnapshot?.handoffTarget || layer?.stableFolderCloseTarget,
  })
    .map((rect) => clientRectToStageVisualRect(rect, layer?.stageRect))
    .filter(isUsableRect);
  if (targetRects.length) return targetRects;
  const frameRect = layer?.frameGhostState;
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
  ensureFolderTransitionMachine(layer).scheduleHandoffCleanup(cleanup, scheduler);
}

export function finishClosingHandoff(layer, state, cleanup, scheduler = globalThis) {
  layer.clearClosingGhostRevealTimer();
  layer.pageTrack.visible = false;
  scheduleClosingHandoffCleanup(layer, cleanup, scheduler);
  layer.flushCompletedClosingControllerGhosts(state);
}

reloadOnPixiHotUpdate(import.meta.hot);
