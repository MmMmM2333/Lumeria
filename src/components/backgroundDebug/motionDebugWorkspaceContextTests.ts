import { createMotionDebugWorkspaceContext } from "./motionDebugWorkspaceContext.js";

export function runMotionDebugWorkspaceContextTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[motion debug workspace context test failed] ${message}`);
  }
  const regions = {
    inspector: { motionInspectorStatusRows: { value: [] } },
    targets: { motionFilterQuery: { value: "" } },
    timeline: { motionReplayCurrentTimeMs: { value: 20 } },
  };
  const context = Reflect.apply(createMotionDebugWorkspaceContext, undefined, [regions]);
  assert(Object.keys(context).sort().join(",") === "inspector,targets,timeline", "context should expose only the three documented regions");
  assert(context.targets.motionFilterQuery === regions.targets.motionFilterQuery, "region ports should preserve Vue ref identity");
  assert(Object.isFrozen(context) && Object.isFrozen(context.timeline), "the public region maps should be immutable");

  let missingRegionFailure: unknown = null;
  try {
    Reflect.apply(createMotionDebugWorkspaceContext, undefined, [{ inspector: {}, targets: {} }]);
  } catch (error) {
    missingRegionFailure = error;
  }
  assert(missingRegionFailure instanceof TypeError, "missing regions should fail while constructing the seam");

  let unknownRegionFailure: unknown = null;
  try {
    Reflect.apply(createMotionDebugWorkspaceContext, undefined, [{ ...regions, typo: {} }]);
  } catch (error) {
    unknownRegionFailure = error;
  }
  assert(unknownRegionFailure instanceof TypeError, "unknown regions should fail instead of becoming hidden dependencies");
}
