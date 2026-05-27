import { ref } from "vue";
import { useLaunchpadSurfaceInteractions } from "./useLaunchpadSurfaceInteractions.js";

function createSurfaceInteractions(overrides = {}) {
  const calls = {
    closeDesktop: [],
    commitOpenFolder: [],
    hideNativeWindowAfterCloseAnimation: 0,
  };
  const pageRefs = [];
  const folderPageRefs = [];
  const isDragActive = ref(Boolean(overrides.isDragActive));
  const interactions = useLaunchpadSurfaceInteractions({
    closeDesktop: (options) => calls.closeDesktop.push(options),
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    folderPageRefs,
    hideNativeWindowAfterCloseAnimation: () => {
      calls.hideNativeWindowAfterCloseAnimation += 1;
    },
    isAppLaunching: ref(Boolean(overrides.isAppLaunching)),
    isDesktopOpen: ref(overrides.isDesktopOpen ?? true),
    isDragActive: () => isDragActive.value,
    pageRefs,
  });

  return {
    calls,
    folderPageRefs,
    interactions,
    isDragActive,
    pageRefs,
  };
}

function makePointerEvent(overrides = {}) {
  return {
    button: overrides.button ?? 0,
    target: {
      closest(selector) {
        if (overrides.captureSelector) overrides.captureSelector(selector);
        return overrides.closestMatch ? {} : null;
      },
    },
  };
}

export function runLaunchpadSurfaceInteractionsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad surface interactions test failed] ${message}`);
  };

  const refs = createSurfaceInteractions();
  const pageNode = { id: "page-node" };
  const folderNode = { id: "folder-node" };
  refs.interactions.setPageRef({ $el: pageNode }, 2);
  refs.interactions.setFolderPageRef(folderNode, 1);
  refs.interactions.setPageRef(null, 0);
  refs.interactions.setFolderPageRef(null, 0);
  assert(refs.pageRefs[2] === pageNode, "setPageRef should store component root elements");
  assert(refs.folderPageRefs[1] === folderNode, "setFolderPageRef should store raw DOM nodes");
  assert(refs.pageRefs[0] === undefined, "setPageRef should ignore missing nodes");
  assert(refs.folderPageRefs[0] === undefined, "setFolderPageRef should ignore missing nodes");

  const desktop = createSurfaceInteractions();
  desktop.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(desktop.calls.closeDesktop.length === 1, "desktop surface pointer down should close the desktop");
  assert(desktop.calls.closeDesktop[0].clearSearch === true, "desktop surface close should request search cleanup");
  assert(desktop.calls.hideNativeWindowAfterCloseAnimation === 1, "desktop surface pointer down should hide native window after close animation");

  const rightClick = createSurfaceInteractions();
  rightClick.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ button: 2 }));
  assert(rightClick.calls.closeDesktop.length === 0, "non-primary desktop pointer down should be ignored");

  const closedDesktop = createSurfaceInteractions({ isDesktopOpen: false });
  closedDesktop.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(closedDesktop.calls.closeDesktop.length === 0, "closed desktop pointer down should be ignored");

  const launching = createSurfaceInteractions({ isAppLaunching: true });
  launching.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(launching.calls.closeDesktop.length === 0, "app-launching desktop pointer down should be ignored");

  const dragging = createSurfaceInteractions({ isDragActive: true });
  dragging.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(dragging.calls.closeDesktop.length === 0, "drag-active desktop pointer down should be ignored");

  let capturedSelector = "";
  const ignoredTarget = createSurfaceInteractions();
  ignoredTarget.interactions.handleDesktopSurfacePointerDown(makePointerEvent({
    captureSelector: (selector) => {
      capturedSelector = selector;
    },
    closestMatch: true,
  }));
  assert(ignoredTarget.calls.closeDesktop.length === 0, "desktop pointer down inside ignored UI should be ignored");
  assert(capturedSelector.includes(".icon-hit-target") && capturedSelector.includes("button"), "ignored selector should include interactive UI targets");

  const folderOverlay = createSurfaceInteractions();
  folderOverlay.interactions.handleFolderOverlayPointerDown();
  assert(folderOverlay.calls.commitOpenFolder.length === 1 && folderOverlay.calls.commitOpenFolder[0] === null, "folder overlay pointer down should close the folder");

  const dragFolderOverlay = createSurfaceInteractions({ isDragActive: true });
  dragFolderOverlay.interactions.handleFolderOverlayPointerDown();
  assert(dragFolderOverlay.calls.commitOpenFolder.length === 0, "drag-active folder overlay pointer down should be ignored");
}
