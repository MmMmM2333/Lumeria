import { reloadOnPixiHotUpdate } from "../devHmr.js";

export function cancelClosingHandoffCleanup(layer, cancelAnimationFrame = globalThis.cancelAnimationFrame) {
  layer.closingHandoffCleanupToken = (Number(layer.closingHandoffCleanupToken) || 0) + 1;
  if (layer.closingHandoffCleanupFrame == null) return;
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(layer.closingHandoffCleanupFrame);
  layer.closingHandoffCleanupFrame = null;
}

export function scheduleClosingHandoffCleanup(layer, cleanup, scheduler = globalThis) {
  cancelClosingHandoffCleanup(layer, scheduler.cancelAnimationFrame);
  const token = (Number(layer.closingHandoffCleanupToken) || 0) + 1;
  layer.closingHandoffCleanupToken = token;

  const runCleanup = () => {
    if (token !== layer.closingHandoffCleanupToken) return;
    layer.closingHandoffCleanupFrame = null;
    cleanup();
  };

  if (typeof scheduler.requestAnimationFrame === "function") {
    layer.closingHandoffCleanupFrame = scheduler.requestAnimationFrame(runCleanup);
    return;
  }
  runCleanup();
}

export function finishClosingHandoff(layer, state, cleanup, scheduler = globalThis) {
  layer.clearClosingGhostRevealTimer();
  layer.pageTrack.visible = false;
  scheduleClosingHandoffCleanup(layer, cleanup, scheduler);
  layer.flushCompletedClosingControllerGhosts(state);
}

reloadOnPixiHotUpdate(import.meta.hot);
