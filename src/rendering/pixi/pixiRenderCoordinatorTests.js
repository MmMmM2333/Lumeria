import { createPixiRenderCoordinator } from "./pixiRenderCoordinator.js";
import { RENDER_INVALIDATION_LANES } from "./renderInvalidation.js";

export function runPixiRenderCoordinatorTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi render coordinator test failed] ${message}`);
  };

  const callbacks = [];
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
  });
  assert(!("commitImmediate" in coordinator), "the coordinator should expose no second immediate GPU commit path");

  assert(coordinator.requestRender("motion-frame"), "first request should schedule a frame");
  coordinator.markRenderPending("desktop-projection", { invalidateGeometry: true });
  assert(queued.size === 1, "same-frame requests should share one RAF");
  const [frameId, callback] = queued.entries().next().value;
  queued.delete(frameId);
  callback();

  assert(callbacks.length === 1, "scheduled frame should commit once");
  assert(callbacks[0].invalidation.lanes.includes(RENDER_INVALIDATION_LANES.MOTION), "commit should include motion lane");
  assert(callbacks[0].invalidation.lanes.includes(RENDER_INVALIDATION_LANES.GEOMETRY), "commit should include geometry lane");
  assert(callbacks[0].invalidation.requiresStructureUpdate, "geometry lane should request a structural capability");
  assert(!coordinator.snapshotInvalidation().lanes.length, "commit should consume invalidation ledger");

  coordinator.markRenderPending("motion-frame");
  coordinator.markRenderPending("interaction-ownership");
  coordinator.runPendingRender();
  assert(callbacks.length === 2, "manual flush should commit coalesced pending work once");
  assert(callbacks[1].invalidation.requiresInteractionUpdate, "ownership changes should use the interaction patch lane");

  coordinator.destroy();
  assert(!coordinator.requestRender("after-destroy"), "destroyed coordinator should reject requests");
}
