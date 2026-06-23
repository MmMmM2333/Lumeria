import { ref } from "vue";
import { useLaunchpadSurfaceInteractions } from "./useLaunchpadSurfaceInteractions.js";

function createSurfaceInteractions(overrides = {}) {
  const calls = {
    closeDesktop: [],
    commitActivePageIndex: [],
    commitFolderPageIndex: [],
    commitOpenFolder: [],
    hideNativeWindowAfterCloseAnimation: 0,
  };
  const pageRefs = [];
  const folderPageRefs = [];
  const isDragActive = ref(Boolean(overrides.isDragActive));
  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    clearTimeout() {},
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setTimeout(callback) {
      eventTarget.timeoutCallback = callback;
      return 1;
    },
    timeoutCallback: null,
  };
  const interactions = useLaunchpadSurfaceInteractions({
    activePageIndex: ref(overrides.activePageIndex ?? 0),
    activePages: ref(overrides.activePages ?? [[{ id: "app-a" }]]),
    closeDesktop: (options) => calls.closeDesktop.push(options),
    commitActivePageIndex: (value) => calls.commitActivePageIndex.push(value),
    commitFolderPageIndex: (value) => calls.commitFolderPageIndex.push(value),
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    eventTarget,
    folderPageRefs,
    getDesktopTargetAtPoint: overrides.getDesktopTargetAtPoint,
    folderPageIndex: ref(overrides.folderPageIndex ?? 0),
    hideNativeWindowAfterCloseAnimation: () => {
      calls.hideNativeWindowAfterCloseAnimation += 1;
    },
    folderPages: ref(overrides.folderPages ?? [[{ id: "folder-app-a" }]]),
    folderPanelRef: ref(overrides.folderPanelRef ?? null),
    isAppLaunching: ref(Boolean(overrides.isAppLaunching)),
    isDesktopOpen: ref(overrides.isDesktopOpen ?? true),
    isFolderAppLaunchClosing: ref(Boolean(overrides.isFolderAppLaunchClosing)),
    isFolderClosing: ref(Boolean(overrides.isFolderClosing)),
    isDragActive: () => isDragActive.value,
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    openFolderId: ref(overrides.openFolderId ?? null),
    pageRefs,
    renderedFolder: ref(overrides.renderedFolder ?? null),
    rootRef: ref({
      getBoundingClientRect: () => ({ width: overrides.rootWidth ?? 800 }),
    }),
    folderViewportRef: ref(overrides.folderViewportRef ?? null),
  });

  return {
    calls,
    eventTarget,
    folderPageRefs,
    interactions,
    isDragActive,
    listeners,
    pageRefs,
  };
}

function makePointerEvent(overrides = {}) {
  return {
    button: overrides.button ?? 0,
    buttons: overrides.buttons,
    clientX: overrides.clientX ?? 100,
    clientY: overrides.clientY ?? 100,
    pointerId: overrides.pointerId ?? 1,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    timeStamp: overrides.timeStamp,
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
  assert(desktop.calls.closeDesktop.length === 1, "single-page desktop surface pointer down should close the desktop");
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

  const folderClosing = createSurfaceInteractions({ isFolderClosing: true });
  folderClosing.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(folderClosing.calls.closeDesktop.length === 0, "folder-closing desktop pointer down should be ignored");
  assert(folderClosing.calls.commitOpenFolder.length === 0, "folder-closing empty desktop pointer down should not open a folder");

  const folderClosingDesktopFolder = createSurfaceInteractions({
    getDesktopTargetAtPoint: () => ({
      id: "folder-2",
      meta: { area: "desktop", item: { id: "folder-2", type: "folder" } },
    }),
    isFolderClosing: true,
  });
  const folderClosingFolderEvent = makePointerEvent();
  folderClosingDesktopFolder.interactions.handleDesktopSurfacePointerDown(folderClosingFolderEvent);
  assert(folderClosingDesktopFolder.calls.commitOpenFolder.join(",") === "folder-2", "folder-closing desktop folder pointer down should open the target folder early");
  assert(folderClosingFolderEvent.defaultPrevented && folderClosingFolderEvent.propagationStopped, "early folder open should consume the desktop pointer event");

  const folderClosingDesktopApp = createSurfaceInteractions({
    getDesktopTargetAtPoint: () => ({
      id: "app-a",
      meta: { area: "desktop", item: { id: "app-a", type: "app" } },
    }),
    isFolderClosing: true,
  });
  folderClosingDesktopApp.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(folderClosingDesktopApp.calls.commitOpenFolder.length === 0, "folder-closing desktop app pointer down should stay ignored by the surface handler");

  const folderAppLaunchClosing = createSurfaceInteractions({ isFolderAppLaunchClosing: true });
  folderAppLaunchClosing.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(folderAppLaunchClosing.calls.closeDesktop.length === 0, "folder app-launch closing desktop pointer down should be ignored");

  const dragging = createSurfaceInteractions({ isDragActive: true });
  dragging.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(dragging.calls.closeDesktop.length === 0, "drag-active desktop pointer down should be ignored");

  const openFolder = createSurfaceInteractions({ openFolderId: "folder-1" });
  openFolder.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(openFolder.calls.commitOpenFolder.length === 1 && openFolder.calls.commitOpenFolder[0] === null, "desktop pointer down with an open folder should close the folder");
  assert(openFolder.calls.closeDesktop.length === 0, "desktop pointer down with an open folder should not close the desktop");
  assert(openFolder.calls.hideNativeWindowAfterCloseAnimation === 0, "open-folder desktop pointer down should not hide the native window");

  const folderIconHit = createSurfaceInteractions({
    getDesktopTargetAtPoint: () => ({ id: "app-a", meta: { area: "folder" } }),
    openFolderId: "folder-1",
  });
  folderIconHit.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(folderIconHit.calls.commitOpenFolder.length === 0, "pointer down on a folder icon should stay in the folder interaction layer");

  const desktopIconBehindFolder = createSurfaceInteractions({
    getDesktopTargetAtPoint: () => ({ id: "app-a", meta: { area: "desktop" } }),
    openFolderId: "folder-1",
  });
  desktopIconBehindFolder.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(desktopIconBehindFolder.calls.commitOpenFolder.length === 1, "pointer down outside folder content should still close the open folder");

  const renderedFolder = createSurfaceInteractions({ renderedFolder: { id: "folder-1" } });
  renderedFolder.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(renderedFolder.calls.commitOpenFolder.length === 1, "desktop pointer down with a rendered folder should close the folder");
  assert(renderedFolder.calls.closeDesktop.length === 0, "rendered folder pointer down should not close the desktop");

  let capturedSelector = "";
  const ignoredTarget = createSurfaceInteractions();
  ignoredTarget.interactions.handleDesktopSurfacePointerDown(makePointerEvent({
    captureSelector: (selector) => {
      capturedSelector = selector;
    },
    closestMatch: true,
  }));
  assert(ignoredTarget.calls.closeDesktop.length === 0, "desktop pointer down inside ignored UI should be ignored");
  assert(capturedSelector.includes(".page-dot") && capturedSelector.includes("button"), "ignored selector should include interactive UI targets");

  const searchMode = createSurfaceInteractions({
    activePages: [[{}], [{}]],
    isSearchMode: true,
  });
  searchMode.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(searchMode.calls.closeDesktop.length === 1, "search-mode desktop pointer down should keep the original close behavior");

  const iconHit = createSurfaceInteractions({
    activePages: [[{}], [{}]],
    getDesktopTargetAtPoint: () => ({ id: "app-a" }),
  });
  iconHit.interactions.handleDesktopSurfacePointerDown(makePointerEvent());
  assert(iconHit.calls.closeDesktop.length === 0, "desktop pointer down over a rendered icon should be left to the icon interaction layer");
  assert(iconHit.listeners.size === 0, "desktop pointer down over a rendered icon should not start page pan listeners");

  const panNext = createSurfaceInteractions({
    activePages: [[{}], [{}], [{}]],
  });
  panNext.pageRefs[0] = { getBoundingClientRect: () => ({ width: 500 }) };
  panNext.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ clientX: 300, clientY: 100, timeStamp: 1 }));
  assert(panNext.calls.closeDesktop.length === 0, "multi-page desktop pointer down should wait for pan/click resolution");
  assert(panNext.listeners.has("pointermove") && panNext.listeners.has("pointerup"), "surface pan should attach pointer listeners");
  const moveNext = makePointerEvent({ buttons: 1, clientX: 100, clientY: 104, timeStamp: 32 });
  panNext.listeners.get("pointermove")(moveNext);
  assert(moveNext.defaultPrevented, "horizontal surface pan should prevent default once captured");
  assert(panNext.interactions.pageTrackScrub.value.progress === 0.4, "surface pan should expose scrub progress");
  assert(panNext.interactions.pageTrackScrub.value.fromIndex === 0 && panNext.interactions.pageTrackScrub.value.toIndex === 1, "leftward surface pan should target the next page");
  const upNext = makePointerEvent({ clientX: 90, clientY: 104, timeStamp: 48 });
  panNext.listeners.get("pointerup")(upNext);
  assert(panNext.calls.commitActivePageIndex.join(",") === "1", "completed leftward pan should commit the next page");
  assert(panNext.interactions.pageTrackScrub.value.settle === true, "surface pan release should hand off to settle");
  assert(panNext.interactions.pageTrackScrub.value.targetProgress === 1, "large surface pan should settle to the destination page");
  panNext.eventTarget.timeoutCallback();
  assert(panNext.interactions.pageTrackScrub.value === null, "surface pan should clear scrub state after the settle window");

  const panBack = createSurfaceInteractions({
    activePageIndex: 1,
    activePages: [[{}], [{}]],
  });
  panBack.pageRefs[1] = { getBoundingClientRect: () => ({ width: 400 }) };
  panBack.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ clientX: 200, clientY: 100, timeStamp: 1 }));
  panBack.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 310, clientY: 104, timeStamp: 200 }));
  assert(panBack.interactions.pageTrackScrub.value.fromIndex === 1 && panBack.interactions.pageTrackScrub.value.toIndex === 0, "rightward surface pan should target the previous page");
  panBack.listeners.get("pointerup")(makePointerEvent({ clientX: 220, clientY: 104, timeStamp: 420 }));
  assert(panBack.calls.commitActivePageIndex.join(",") === "1", "short rightward pan should return to the source page");
  assert(panBack.interactions.pageTrackScrub.value.targetProgress === 0, "short surface pan should settle back to the source page");

  const verticalMove = createSurfaceInteractions({
    activePages: [[{}], [{}]],
  });
  verticalMove.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ clientX: 200, clientY: 100, timeStamp: 1 }));
  verticalMove.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 206, clientY: 145, timeStamp: 32 }));
  verticalMove.listeners.get("pointerup")(makePointerEvent({ clientX: 206, clientY: 145, timeStamp: 48 }));
  assert(verticalMove.calls.closeDesktop.length === 0, "vertical move past threshold should suppress close without starting page scrub");
  assert(verticalMove.interactions.pageTrackScrub.value === null, "vertical move should not produce page-track scrub state");

  const edgePan = createSurfaceInteractions({
    activePages: [[{}], [{}]],
  });
  edgePan.pageRefs[0] = { getBoundingClientRect: () => ({ width: 500 }) };
  edgePan.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ clientX: 200, clientY: 100, timeStamp: 1 }));
  edgePan.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 300, clientY: 104, timeStamp: 32 }));
  assert(edgePan.interactions.pageTrackScrub.value.fromIndex === 0 && edgePan.interactions.pageTrackScrub.value.toIndex === -1, "rightward pan on the first desktop page should use a fake edge target");
  assert(edgePan.interactions.pageTrackScrub.value.progress > 0 && edgePan.interactions.pageTrackScrub.value.progress < 0.1, "edge desktop pan should expose resisted rubber-band progress");
  edgePan.listeners.get("pointerup")(makePointerEvent({ clientX: 330, clientY: 104, timeStamp: 48 }));
  assert(edgePan.calls.commitActivePageIndex.join(",") === "0", "edge desktop pan should settle back to the source page");
  assert(edgePan.interactions.pageTrackScrub.value.targetProgress === 0, "edge desktop pan release should target the source progress");

  const grabPan = createSurfaceInteractions({
    activePages: [[{}], [{}], [{}]],
  });
  grabPan.pageRefs[0] = { getBoundingClientRect: () => ({ width: 500 }) };
  grabPan.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ clientX: 300, clientY: 100, timeStamp: 1 }));
  grabPan.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 100, clientY: 104, timeStamp: 32 }));
  grabPan.listeners.get("pointerup")(makePointerEvent({ clientX: 90, clientY: 104, timeStamp: 48 }));
  assert(grabPan.interactions.pageTrackScrub.value.settle === true, "desktop pan should keep settling scrub state during the clear window");
  grabPan.interactions.handleDesktopSurfacePointerDown(makePointerEvent({ clientX: 220, clientY: 104, timeStamp: 80 }));
  grabPan.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 330, clientY: 104, timeStamp: 112 }));
  assert(grabPan.interactions.pageTrackScrub.value.grab === true, "desktop pan should mark a second gesture during settle as a grab");
  assert(grabPan.interactions.pageTrackScrub.value.fromIndex === 0 && grabPan.interactions.pageTrackScrub.value.toIndex === 1, "desktop settle grab should preserve the settling route");
  assert(grabPan.interactions.pageTrackScrub.value.progressDelta < 0, "opposite-direction desktop grab should reduce route progress");
  grabPan.listeners.get("pointerup")(makePointerEvent({ clientX: 360, clientY: 104, timeStamp: 128 }));
  assert(grabPan.calls.commitActivePageIndex.join(",") === "1,0", "opposite-direction desktop grab release should commit back to the source page");
  assert(grabPan.interactions.pageTrackScrub.value.targetProgress === 0, "opposite-direction desktop grab release should settle to source progress");

  const folderPanNext = createSurfaceInteractions({
    folderPages: [[{}], [{}], [{}]],
    renderedFolder: { id: "folder-1" },
  });
  folderPanNext.folderPageRefs[0] = { getBoundingClientRect: () => ({ width: 300 }) };
  folderPanNext.interactions.handleFolderPanelPointerDown(makePointerEvent({ clientX: 260, clientY: 160, timeStamp: 1 }));
  assert(folderPanNext.listeners.has("pointermove") && folderPanNext.listeners.has("pointerup"), "folder panel pointer down should wait for pan resolution");
  const folderMoveNext = makePointerEvent({ buttons: 1, clientX: 110, clientY: 164, timeStamp: 32 });
  folderPanNext.listeners.get("pointermove")(folderMoveNext);
  assert(folderMoveNext.defaultPrevented, "horizontal folder pan should prevent default once captured");
  assert(folderPanNext.interactions.folderPageTrackScrub.value.progress === 0.5, "folder pan should expose scrub progress");
  assert(folderPanNext.interactions.folderPageTrackScrub.value.fromIndex === 0 && folderPanNext.interactions.folderPageTrackScrub.value.toIndex === 1, "leftward folder pan should target the next page");
  const folderUpNext = makePointerEvent({ clientX: 100, clientY: 164, timeStamp: 48 });
  folderPanNext.listeners.get("pointerup")(folderUpNext);
  assert(folderPanNext.calls.commitFolderPageIndex.join(",") === "1", "completed leftward folder pan should commit the next folder page");
  assert(folderPanNext.interactions.folderPageTrackScrub.value.settle === true, "folder pan release should hand off to settle");
  assert(folderPanNext.interactions.folderPageTrackScrub.value.targetProgress === 1, "large folder pan should settle to the destination page");
  folderPanNext.eventTarget.timeoutCallback();
  assert(folderPanNext.interactions.folderPageTrackScrub.value === null, "folder pan should clear scrub state after the settle window");

  const folderPanBack = createSurfaceInteractions({
    folderPageIndex: 1,
    folderPages: [[{}], [{}]],
    renderedFolder: { id: "folder-1" },
  });
  folderPanBack.folderPageRefs[1] = { getBoundingClientRect: () => ({ width: 400 }) };
  folderPanBack.interactions.handleFolderPanelPointerDown(makePointerEvent({ clientX: 220, clientY: 160, timeStamp: 1 }));
  folderPanBack.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 330, clientY: 164, timeStamp: 200 }));
  assert(folderPanBack.interactions.folderPageTrackScrub.value.fromIndex === 1 && folderPanBack.interactions.folderPageTrackScrub.value.toIndex === 0, "rightward folder pan should target the previous page");
  folderPanBack.listeners.get("pointerup")(makePointerEvent({ clientX: 240, clientY: 164, timeStamp: 420 }));
  assert(folderPanBack.calls.commitFolderPageIndex.join(",") === "1", "short rightward folder pan should return to the source page");
  assert(folderPanBack.interactions.folderPageTrackScrub.value.targetProgress === 0, "short folder pan should settle back to the source page");

  const folderVerticalMove = createSurfaceInteractions({
    folderPages: [[{}], [{}]],
    renderedFolder: { id: "folder-1" },
  });
  folderVerticalMove.interactions.handleFolderPanelPointerDown(makePointerEvent({ clientX: 220, clientY: 160, timeStamp: 1 }));
  folderVerticalMove.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 226, clientY: 205, timeStamp: 32 }));
  folderVerticalMove.listeners.get("pointerup")(makePointerEvent({ clientX: 226, clientY: 205, timeStamp: 48 }));
  assert(folderVerticalMove.calls.commitFolderPageIndex.length === 0, "vertical folder move should not commit a folder page");
  assert(folderVerticalMove.interactions.folderPageTrackScrub.value === null, "vertical folder move should not produce folder page-track scrub state");

  const folderEdgePan = createSurfaceInteractions({
    folderPageIndex: 1,
    folderPages: [[{}], [{}]],
    renderedFolder: { id: "folder-1" },
  });
  folderEdgePan.folderPageRefs[1] = { getBoundingClientRect: () => ({ width: 400 }) };
  folderEdgePan.interactions.handleFolderPanelPointerDown(makePointerEvent({ clientX: 220, clientY: 160, timeStamp: 1 }));
  folderEdgePan.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 20, clientY: 164, timeStamp: 32 }));
  assert(folderEdgePan.interactions.folderPageTrackScrub.value.fromIndex === 1 && folderEdgePan.interactions.folderPageTrackScrub.value.toIndex === 2, "leftward pan on the last folder page should use a fake edge target");
  assert(folderEdgePan.interactions.folderPageTrackScrub.value.progress > 0 && folderEdgePan.interactions.folderPageTrackScrub.value.progress < 0.25, "edge folder pan should expose resisted rubber-band progress");
  folderEdgePan.listeners.get("pointerup")(makePointerEvent({ clientX: 0, clientY: 164, timeStamp: 48 }));
  assert(folderEdgePan.calls.commitFolderPageIndex.join(",") === "1", "edge folder pan should settle back to the source page");
  assert(folderEdgePan.interactions.folderPageTrackScrub.value.targetProgress === 0, "edge folder pan release should target the source progress");

  const folderGrabPan = createSurfaceInteractions({
    folderPages: [[{}], [{}], [{}]],
    renderedFolder: { id: "folder-1" },
  });
  folderGrabPan.folderPageRefs[0] = { getBoundingClientRect: () => ({ width: 300 }) };
  folderGrabPan.interactions.handleFolderPanelPointerDown(makePointerEvent({ clientX: 260, clientY: 160, timeStamp: 1 }));
  folderGrabPan.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 110, clientY: 164, timeStamp: 32 }));
  folderGrabPan.listeners.get("pointerup")(makePointerEvent({ clientX: 100, clientY: 164, timeStamp: 48 }));
  folderGrabPan.interactions.handleFolderPanelPointerDown(makePointerEvent({ clientX: 180, clientY: 164, timeStamp: 80 }));
  folderGrabPan.listeners.get("pointermove")(makePointerEvent({ buttons: 1, clientX: 260, clientY: 164, timeStamp: 112 }));
  assert(folderGrabPan.interactions.folderPageTrackScrub.value.grab === true, "folder pan should mark a second gesture during settle as a grab");
  assert(folderGrabPan.interactions.folderPageTrackScrub.value.progressDelta < 0, "opposite-direction folder grab should reduce route progress");
  folderGrabPan.listeners.get("pointerup")(makePointerEvent({ clientX: 290, clientY: 164, timeStamp: 128 }));
  assert(folderGrabPan.calls.commitFolderPageIndex.join(",") === "1,0", "opposite-direction folder grab release should commit back to the source page");

  const folderIconPan = createSurfaceInteractions({
    folderPages: [[{}], [{}]],
    getDesktopTargetAtPoint: () => ({ id: "app-a", meta: { area: "folder", folderId: "folder-1" } }),
    renderedFolder: { id: "folder-1" },
  });
  folderIconPan.interactions.handleFolderPanelPointerDown(makePointerEvent());
  assert(folderIconPan.listeners.size === 0, "folder panel pointer down over a rendered folder icon should not start page pan listeners");

  const folderOverlay = createSurfaceInteractions();
  folderOverlay.interactions.handleFolderOverlayPointerDown();
  assert(folderOverlay.calls.commitOpenFolder.length === 1 && folderOverlay.calls.commitOpenFolder[0] === null, "folder overlay pointer down should close the folder");

  const dragFolderOverlay = createSurfaceInteractions({ isDragActive: true });
  dragFolderOverlay.interactions.handleFolderOverlayPointerDown();
  assert(dragFolderOverlay.calls.commitOpenFolder.length === 0, "drag-active folder overlay pointer down should be ignored");
}
