import {
  classifyRenderInvalidation,
  collectRenderInvalidationReasons,
  createRenderInvalidationLedger,
  RENDER_INVALIDATION_LANES,
} from "./renderInvalidation.js";

export function runRenderInvalidationTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
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
  assert(
    classifyRenderInvalidation("visual-watch") === RENDER_INVALIDATION_LANES.VISUAL,
    "visual-only changes should use the visual lane"
  );
  assert(
    classifyRenderInvalidation("folder-handoff-loop") === RENDER_INVALIDATION_LANES.HANDOFF,
    "handoff continuation frames should use the handoff lane"
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
  assert(snapshot.reasons.motion?.length === 1, "duplicate motion reasons should be deduplicated");
  assert(snapshot.reasons.geometry?.length === 1, "duplicate geometry reasons should be deduplicated");
  assert(snapshot.requiresStructureUpdate, "geometry invalidation should rebuild the structural plan");
  assert(snapshot.revision === 4, "every invalidation mark should advance the monotonic frame revision");
  assert(snapshot.revisions.geometry === 4, "lane revisions should expose the latest mark for that lane");
  assert(!ledger.hasPending(), "consume should clear pending invalidations");

  ledger.mark("motion-frame");
  const motionOnly = ledger.consume();
  assert(!motionOnly.requiresStructureUpdate, "motion-only frames should not rebuild the structural plan");

  ledger.mark("icon-texture-ready");
  const assetOnly = ledger.consume();
  assert(!assetOnly.requiresStructureUpdate, "texture settlement should only require a GPU commit");

  ledger.mark("diagnostic-watch");
  const diagnosticsOnly = ledger.consume();
  assert(diagnosticsOnly.requiresDiagnosticsUpdate, "diagnostic changes should update only diagnostic layers");
  assert(!diagnosticsOnly.requiresStructureUpdate, "diagnostic changes should not rebuild the desktop plan");

  ledger.mark("visual-watch");
  ledger.mark("folder-handoff-loop");
  const targeted = ledger.consume();
  assert(targeted.requiresVisualUpdate, "visual changes should request a visual patch");
  assert(targeted.requiresHandoffUpdate, "handoff frames should request a handoff tick");
  assert(!targeted.requiresStructureUpdate, "targeted lanes should not rebuild the desktop plan");
  assert(
    collectRenderInvalidationReasons(targeted).join(",") === "visual-watch,folder-handoff-loop",
    "reason collection should preserve deterministic lane and insertion order"
  );
}
