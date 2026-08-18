import {
  classifyRenderInvalidation,
  createRenderInvalidationLedger,
  RENDER_INVALIDATION_LANES,
} from "./renderInvalidation.js";

export function runRenderInvalidationTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Render invalidation test failed] ${message}`);
  };

  assert(
    classifyRenderInvalidation("motion-frame") === RENDER_INVALIDATION_LANES.MOTION,
    "motion frames should use the motion lane"
  );
  assert(
    classifyRenderInvalidation("desktop-projection", { invalidateGeometry: true }) === RENDER_INVALIDATION_LANES.GEOMETRY,
    "geometry invalidation should take precedence over reason text"
  );
  assert(
    classifyRenderInvalidation("icon-texture-ready") === RENDER_INVALIDATION_LANES.ASSET,
    "texture readiness should use the asset lane"
  );
  assert(
    classifyRenderInvalidation("interaction-watch") === RENDER_INVALIDATION_LANES.INTERACTION,
    "interaction watchers should use the interaction lane"
  );
  assert(
    classifyRenderInvalidation("diagnostic-watch") === RENDER_INVALIDATION_LANES.DIAGNOSTICS,
    "diagnostic watchers should use the diagnostics lane"
  );

  const ledger = createRenderInvalidationLedger();
  ledger.mark("motion-frame");
  ledger.mark("motion-frame");
  ledger.mark("desktop-projection", { invalidateGeometry: true });
  ledger.mark("desktop-projection", { invalidateGeometry: true });
  assert(ledger.hasPending(), "marked invalidations should be pending");

  const snapshot = ledger.consume();
  assert(snapshot.lanes.includes(RENDER_INVALIDATION_LANES.MOTION), "snapshot should include motion lane");
  assert(snapshot.lanes.includes(RENDER_INVALIDATION_LANES.GEOMETRY), "snapshot should include geometry lane");
  assert(snapshot.reasons.motion.length === 1, "duplicate motion reasons should be deduplicated");
  assert(snapshot.reasons.geometry.length === 1, "duplicate geometry reasons should be deduplicated");
  assert(snapshot.requiresLayerUpdate, "geometry invalidation should require a layer update");
  assert(!ledger.hasPending(), "consume should clear pending invalidations");

  ledger.mark("motion-frame");
  const motionOnly = ledger.consume();
  assert(!motionOnly.requiresLayerUpdate, "motion-only frames should not rebuild the layer plan");
}
