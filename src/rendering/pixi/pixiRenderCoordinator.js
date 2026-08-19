import { createPixiRenderScheduler } from "./pixiRenderScheduler.js";
import { createRenderInvalidationLedger } from "./renderInvalidation.js";

/**
 * Owns the single scheduled Pixi render commit and the invalidation ledger
 * consumed by that commit. Callers do not need to coordinate RAF state and
 * layer-plan invalidation separately.
 */
export function createPixiRenderCoordinator({
  cancelAnimationFrame = globalThis.cancelAnimationFrame,
  canRender = () => true,
  render,
  requestAnimationFrame = globalThis.requestAnimationFrame,
} = {}) {
  if (typeof render !== "function") {
    throw new TypeError("createPixiRenderCoordinator requires a render function");
  }
  if (typeof canRender !== "function") {
    throw new TypeError("createPixiRenderCoordinator requires a canRender function");
  }

  const invalidations = createRenderInvalidationLedger();
  const scheduler = createPixiRenderScheduler({
    cancelAnimationFrame,
    canRender,
    render: (reasons) => render({
      invalidation: invalidations.consume(),
      reasons,
    }),
    requestAnimationFrame,
  });

  function markRenderPending(reason = "desktop-update", options = {}) {
    if (!canRender()) return false;
    invalidations.mark(reason, options);
    return scheduler.markRenderPending(reason);
  }

  function requestRender(reason = "desktop-update", options = {}) {
    if (!canRender()) return false;
    invalidations.mark(reason, options);
    return scheduler.requestRender(reason);
  }

  function cancel() {
    invalidations.clear();
    scheduler.cancel();
  }

  function destroy() {
    invalidations.clear();
    scheduler.destroy();
  }

  return Object.freeze({
    cancel,
    destroy,
    hasPendingRender: scheduler.hasPendingRender,
    isScheduled: scheduler.isScheduled,
    markRenderPending,
    requestRender,
    runPendingRender: scheduler.runPendingRender,
    snapshotInvalidation: invalidations.snapshot,
  });
}
