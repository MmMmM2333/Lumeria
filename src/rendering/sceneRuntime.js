/**
 * Imperative capabilities used by the renderer. These values deliberately
 * do not travel inside DesktopSceneFrame: a frame is a snapshot, while this
 * object is an adapter over DOM, Vue-owned state, and mutable registries.
 */

function requireObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function requireFunction(value, path) {
  if (typeof value !== "function") throw new TypeError(`${path} must be a function`);
  return value;
}

export function makeDesktopSceneRuntimeAdapter(input = {}) {
  const runtime = {
    domRefs: requireObject(input.domRefs, "DesktopSceneRuntime.domRefs"),
    folderOverlayState: requireObject(input.folderOverlayState, "DesktopSceneRuntime.folderOverlayState"),
    getDesktopPageRenderMode: requireFunction(input.getDesktopPageRenderMode, "DesktopSceneRuntime.getDesktopPageRenderMode"),
    getVisibleDesktopPage: requireFunction(input.getVisibleDesktopPage, "DesktopSceneRuntime.getVisibleDesktopPage"),
    iconBoundsRegistry: requireObject(input.iconBoundsRegistry, "DesktopSceneRuntime.iconBoundsRegistry"),
    isFolderOpeningPreviewFrameGhosted: requireFunction(
      input.isFolderOpeningPreviewFrameGhosted,
      "DesktopSceneRuntime.isFolderOpeningPreviewFrameGhosted"
    ),
    isIconOpening: requireFunction(input.isIconOpening, "DesktopSceneRuntime.isIconOpening"),
    setPageRef: requireFunction(input.setPageRef, "DesktopSceneRuntime.setPageRef"),
    liveDesktopDiagnosticsPort: input.liveDesktopDiagnosticsPort == null
      ? null
      : requireObject(input.liveDesktopDiagnosticsPort, "DesktopSceneRuntime.liveDesktopDiagnosticsPort"),
  };
  return Object.freeze(runtime);
}

export function assertDesktopSceneRuntime(runtime) {
  makeDesktopSceneRuntimeAdapter(runtime);
}
