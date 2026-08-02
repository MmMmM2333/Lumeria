import { createMotionDebugWorkspaceContext } from "./motionDebugWorkspaceContext.js";

export function runMotionDebugWorkspaceContextTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[motion debug workspace context test failed] ${message}`);
  };
  const regions = {
    inspector: { statusRows: { value: [] } },
    targets: { filterQuery: { value: "" } },
    timeline: { currentTimeMs: { value: 20 } },
  };
  const context = createMotionDebugWorkspaceContext(regions);
  assert(Object.keys(context).sort().join(",") === "inspector,targets,timeline", "context should expose only the three documented regions");
  assert(context.targets.filterQuery === regions.targets.filterQuery, "region ports should preserve Vue ref identity");
  assert(Object.isFrozen(context) && Object.isFrozen(context.timeline), "the public region maps should be immutable");

  let missingRegionFailure = null;
  try {
    createMotionDebugWorkspaceContext({ inspector: {}, targets: {} });
  } catch (error) {
    missingRegionFailure = error;
  }
  assert(missingRegionFailure instanceof TypeError, "missing regions should fail while constructing the seam");

  let unknownRegionFailure = null;
  try {
    createMotionDebugWorkspaceContext({ ...regions, typo: {} });
  } catch (error) {
    unknownRegionFailure = error;
  }
  assert(unknownRegionFailure instanceof TypeError, "unknown regions should fail instead of becoming hidden dependencies");
}
