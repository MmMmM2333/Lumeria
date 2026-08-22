import { assertDesktopSceneRuntime, makeDesktopSceneRuntimeAdapter } from "./sceneRuntime.js";
import { createIconBoundsRegistry } from "./pixi/geometry/iconBoundsRegistry.js";

export function runSceneRuntimeTests(): void {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Scene runtime test failed] ${message}`);
  };

  const runtime = makeDesktopSceneRuntimeAdapter({
    completeProvisionalFolderRollback: () => true,
    domRefs: {},
    folderOverlayState: {
      renderedFolder: { value: null },
      renameFolder: () => {},
    },
    getDesktopPageRenderMode: () => "empty",
    getIconTextureItems: () => [],
    getVisibleDesktopPage: (page: readonly unknown[]) => page,
    iconBoundsRegistry: createIconBoundsRegistry(),
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

  let rejectedFolderOverlayWithoutOwnerCapabilities = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      folderOverlayState: {},
    });
  } catch (error) {
    rejectedFolderOverlayWithoutOwnerCapabilities = error instanceof TypeError;
  }
  assert(
    rejectedFolderOverlayWithoutOwnerCapabilities,
    "runtime adapter should require the controller-owned rendered-folder ref and rename capability",
  );

  let rejectedInvalidRootRef = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      domRefs: { rootRef: 42 },
    });
  } catch (error) {
    rejectedInvalidRootRef = error instanceof TypeError;
  }
  assert(rejectedInvalidRootRef, "runtime adapter should reject non-element, non-ref DOM references");

  let rejectedInvalidDesktopMainRef = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      domRefs: { desktopMainRef: null },
    });
  } catch (error) {
    rejectedInvalidDesktopMainRef = error instanceof TypeError;
  }
  assert(rejectedInvalidDesktopMainRef, "runtime adapter should require desktopMainRef to remain a ref");

  let rejectedInvalidFolderPagesRef = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      folderOverlayState: { ...runtime.folderOverlayState, folderPages: true },
    });
  } catch (error) {
    rejectedInvalidFolderPagesRef = error instanceof TypeError;
  }
  assert(rejectedInvalidFolderPagesRef, "runtime adapter should reject non-ref optional folder state");

  for (const [key, value] of [
    ["folderOpenProgress", "not-a-number"],
    ["isFolderClosing", "not-a-boolean"],
  ] as const) {
    let rejectedInvalidRefValue = false;
    try {
      makeDesktopSceneRuntimeAdapter({
        ...runtime,
        folderOverlayState: {
          ...runtime.folderOverlayState,
          [key]: { value },
        },
      });
    } catch (error) {
      rejectedInvalidRefValue = error instanceof TypeError;
    }
    assert(rejectedInvalidRefValue, `runtime adapter should reject an invalid ${key} ref value`);
  }

  const runtimeWithInvalidDesktopRenderMode = makeDesktopSceneRuntimeAdapter({
    ...runtime,
    getDesktopPageRenderMode: () => "bogus",
  });
  let rejectedInvalidDesktopRenderMode = false;
  try {
    runtimeWithInvalidDesktopRenderMode.getDesktopPageRenderMode(0);
  } catch (error) {
    rejectedInvalidDesktopRenderMode = error instanceof TypeError;
  }
  assert(
    rejectedInvalidDesktopRenderMode,
    "runtime adapter should reject invalid values returned by typed capabilities",
  );

  for (const [key, value] of [
    ["folderPanelRef", true],
    ["folderViewportRef", 42],
  ] as const) {
    let rejectedInvalidFolderDomRef = false;
    try {
      makeDesktopSceneRuntimeAdapter({
        ...runtime,
        folderOverlayState: { ...runtime.folderOverlayState, [key]: value },
      });
    } catch (error) {
      rejectedInvalidFolderDomRef = error instanceof TypeError;
    }
    assert(rejectedInvalidFolderDomRef, `runtime adapter should reject non-ref ${key}`);
  }

  let rejectedInvalidFolderPageCommit = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      folderOverlayState: { ...runtime.folderOverlayState, commitFolderPageIndex: true },
    });
  } catch (error) {
    rejectedInvalidFolderPageCommit = error instanceof TypeError;
  }
  assert(rejectedInvalidFolderPageCommit, "runtime adapter should reject non-function optional folder capabilities");

  const folderPages = { value: [] };
  const folderPanelRef = { value: null };
  const folderViewportRef = { value: null };
  const commitFolderPageIndex = () => true;
  const runtimeWithOptionalCapabilities = makeDesktopSceneRuntimeAdapter({
    ...runtime,
    domRefs: {
      desktopMainRef: { value: null },
      rootRef: null,
      shellRef: { value: null },
    },
    folderOverlayState: {
      ...runtime.folderOverlayState,
      commitFolderPageIndex,
      folderPages,
      folderPanelRef,
      folderViewportRef,
    },
  });
  assert(
    runtimeWithOptionalCapabilities.folderOverlayState.folderPages === folderPages &&
      runtimeWithOptionalCapabilities.folderOverlayState.commitFolderPageIndex === commitFolderPageIndex &&
      runtimeWithOptionalCapabilities.folderOverlayState.folderPanelRef === folderPanelRef &&
      runtimeWithOptionalCapabilities.folderOverlayState.folderViewportRef === folderViewportRef,
    "runtime adapter should preserve valid optional folder refs and capabilities",
  );

  let rejectedIncompleteIconBoundsRegistry = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      iconBoundsRegistry: { clearBounds: () => {} },
    });
  } catch (error) {
    rejectedIncompleteIconBoundsRegistry = error instanceof TypeError;
  }
  assert(
    rejectedIncompleteIconBoundsRegistry,
    "runtime adapter should reject partial mutable bounds services",
  );

  let rejectedIncompleteLiveDesktopPort = false;
  try {
    makeDesktopSceneRuntimeAdapter({
      ...runtime,
      liveDesktopDiagnosticsPort: { getRuntimeStatus: () => null },
    });
  } catch (error) {
    rejectedIncompleteLiveDesktopPort = error instanceof TypeError;
  }
  assert(
    rejectedIncompleteLiveDesktopPort,
    "runtime adapter should reject partial live-desktop diagnostic capabilities",
  );
}
