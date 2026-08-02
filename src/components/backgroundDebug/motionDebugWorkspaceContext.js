import { inject } from "vue";

export const MOTION_DEBUG_WORKSPACE_CONTEXT_KEY = Symbol("motion-debug-workspace");
export const MOTION_DEBUG_WORKSPACE_REGIONS = Object.freeze(["targets", "timeline", "inspector"]);

export function createMotionDebugWorkspaceContext(regions = {}) {
  const source = regions && typeof regions === "object" ? regions : {};
  const unknownRegions = Object.keys(source).filter((name) => !MOTION_DEBUG_WORKSPACE_REGIONS.includes(name));
  if (unknownRegions.length) {
    throw new TypeError(`Unknown motion debug workspace regions: ${unknownRegions.join(", ")}`);
  }
  const context = {};
  for (const name of MOTION_DEBUG_WORKSPACE_REGIONS) {
    const region = source[name];
    if (!region || typeof region !== "object" || Array.isArray(region)) {
      throw new TypeError(`Motion debug workspace region ${name} must be an object`);
    }
    context[name] = Object.freeze({ ...region });
  }
  return Object.freeze(context);
}

function useMotionDebugWorkspaceContext() {
  const context = inject(MOTION_DEBUG_WORKSPACE_CONTEXT_KEY, null);
  if (!context) throw new Error("Motion debug workspace context is not available.");
  return context;
}

export function useMotionDebugWorkspaceRegion(name) {
  if (!MOTION_DEBUG_WORKSPACE_REGIONS.includes(name)) {
    throw new TypeError(`Unknown motion debug workspace region: ${name}`);
  }
  const context = useMotionDebugWorkspaceContext();
  const region = context[name];
  if (!region) throw new Error(`Motion debug workspace region ${name} is not available.`);
  return region;
}
