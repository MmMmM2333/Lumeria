import { createFolderLayerState } from "./folderLayerState.js";

export function runFolderLayerStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder layer state test failed] ${message}`);
  };

  const callbacks = {
    completeFolderCloseIconGhost: () => {},
    completeFolderOpenFrameGhost: () => {},
    completeFolderOpenIconGhost: () => {},
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: (page) => page,
    isIconOpening: () => false,
    setFolderPageRef: () => {},
  };
  const state = createFolderLayerState({
    callbacks,
    drag: {
      meta: { active: true },
      releaseState: { item: { id: "released-app" } },
    },
    folder: {
      closeIconGhosts: [{ item: { id: "app-b" }, key: "close-b", slotIndex: 1 }],
      desktopPageTrackOffset: { liveX: -120, targetX: -400 },
      gridStyle: { gridTemplateColumns: "repeat(3, 1fr)" },
      isAppLaunchClosing: true,
      isClosing: false,
      openingOriginBounds: { folderId: "folder-1" },
      openProgress: 0.42,
      openProgressTarget: 1,
      openIconGhosts: [{ item: { id: "app-a" }, key: "open-a", slotIndex: 0 }],
      pageIndex: 2,
      pageTurnToken: 42,
      pageSize: 9,
      pages: [[{ id: "app-a" }]],
      panelRef: { value: null },
      panelStyle: { "--folder-icon-size": "52px" },
      renderedFolder: { id: "folder-1" },
      viewportRef: { value: null },
      visualPageIndex: 3,
    },
    stage: {
      rect: { height: 0, left: 4, top: 5, width: 0 },
    },
    ui: {
      iconGesturePresentation: {
        phase: "armed",
        scope: "folder:folder-1",
        target: { id: "app-a", kind: "icon" },
      },
      isEditMode: true,
      isTextlessMode: false,
      launchTargetStatusById: { "app-a": "ok" },
      selectedIcon: { area: "folder", folderId: "folder-1", id: "app-a", pageIndex: 3 },
      showMissingLaunchTargetBadge: true,
    },
  }, { prewarm: true, singleStageDiagnostics: true });

  assert(state.width === 1 && state.height === 1, "stage dimensions should have a minimum size");
  assert(state.stageRect.left === 4 && state.stageRect.top === 5, "stage rect should be preserved");
  assert(state.iconSize === 52, "folder icon size should be parsed from panel style");
  assert(state.dragReleaseState?.item?.id === "released-app", "drag release state should be forwarded for release-time layout decisions");
  assert(state.dragReleaseGhostId === "released-app", "drag release ghost id should come from release state");
  assert(state.desktopPageTrackOffset.liveX === -120 && state.desktopPageTrackOffset.targetX === -400, "desktop page track offset should be forwarded");
  assert(state.getFolderOpenIconGhostKey("app-a", 0) === "open-a", "open ghost lookup should use current open ghosts");
  assert(state.getFolderCloseIconGhostKey("app-b", 1) === "close-b", "close ghost lookup should use current close ghosts");
  assert(state.folderPageIndex === 2, "committed folder page index should be forwarded");
  assert(state.visualFolderPageIndex === 3, "visual folder page index should be forwarded separately");
  assert(state.folderPageTurnToken === 42, "folder page turn token should be forwarded for render state changes");
  assert(state.folderOpenProgress === 0.42, "folder open progress should be forwarded");
  assert(state.folderOpenProgressTarget === 1, "folder open progress target should be forwarded");
  assert(state.selectedIcon?.id === "app-a", "the explicit selection descriptor should be forwarded to the folder layer");
  assert(state.iconGesturePresentation?.phase === "armed", "folder layer state should forward the shared icon gesture presentation");
  assert(state.completeFolderOpenIconGhost === callbacks.completeFolderOpenIconGhost, "callbacks should be forwarded");
  assert(state.completeFolderOpenFrameGhost === callbacks.completeFolderOpenFrameGhost, "frame completion callback should be forwarded");
  assert(state.isFolderAppLaunchClosing, "folder app-launch closing state should be forwarded");
  assert(state.singleStageDiagnostics, "single-stage diagnostics flag should be preserved");
  assert(state.prewarm, "overrides should be applied last");
}
