import { createPixiRenderCoordinator } from "./pixiRenderCoordinator.js";
import { RENDER_INVALIDATION_LANES } from "./renderInvalidation.js";

export function runPixiRenderCoordinatorTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi render coordinator test failed] ${message}`);
  };

  const callbacks = [];
  const immediateCallbacks = [];
  let nextFrame = 0;
  const queued = new Map();
  const coordinator = createPixiRenderCoordinator({
    canRender: () => true,
    requestAnimationFrame: (callback) => {
      const id = ++nextFrame;
      queued.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => queued.delete(id),
    render: (payload) => callbacks.push(payload),
    renderImmediate: (payload) => immediateCallbacks.push(payload),
  });

  assert(coordinator.requestRender("motion-frame"), "first request should schedule a frame");
  coordinator.markRenderPending("desktop-projection", { invalidateGeometry: true });
  assert(queued.size === 1, "same-frame requests should share one RAF");
  const [frameId, callback] = queued.entries().next().value;
  queued.delete(frameId);
  callback();

  assert(callbacks.length === 1, "scheduled frame should commit once");
  assert(callbacks[0].invalidation.lanes.includes(RENDER_INVALIDATION_LANES.MOTION), "commit should include motion lane");
  assert(callbacks[0].invalidation.lanes.includes(RENDER_INVALIDATION_LANES.GEOMETRY), "commit should include geometry lane");
  assert(callbacks[0].invalidation.requiresLayerUpdate, "geometry lane should request layer update");
  assert(!coordinator.snapshotInvalidation().lanes.length, "commit should consume invalidation ledger");

  coordinator.markRenderPending("motion-frame");
  assert(coordinator.commitImmediate("ownership-handoff"), "immediate commits should be accepted while renderable");
  assert(immediateCallbacks[0].reason === "ownership-handoff", "immediate commit should preserve its reason");
  coordinator.runPendingRender();
  assert(callbacks.length === 2, "manual flush should commit pending work");
  assert(!callbacks[1].invalidation.requiresLayerUpdate, "motion-only commit should skip layer update");

  coordinator.destroy();
  assert(!coordinator.requestRender("after-destroy"), "destroyed coordinator should reject requests");
}
