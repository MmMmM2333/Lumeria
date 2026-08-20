import { assertDesktopSceneRuntime, makeDesktopSceneRuntimeAdapter } from "./sceneRuntime.js";

export function runSceneRuntimeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Scene runtime test failed] ${message}`);
  };

  const runtime = makeDesktopSceneRuntimeAdapter({
    domRefs: {},
    folderOverlayState: {},
    getDesktopPageRenderMode: () => "desktop",
    getIconTextureItems: () => [],
    getVisibleDesktopPage: (page) => page,
    iconBoundsRegistry: {},
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    setPageRef: () => {},
  });
  assert(Object.isFrozen(runtime), "runtime adapter should be immutable at the seam");
  assert(Array.isArray(runtime.getIconTextureItems()), "runtime adapter should expose the canonical icon texture item source");
  assertDesktopSceneRuntime(runtime);

  let rejected = false;
  try {
    makeDesktopSceneRuntimeAdapter({ ...runtime, setPageRef: null });
  } catch {
    rejected = true;
  }
  assert(rejected, "runtime adapter should reject missing imperative capabilities");
}
