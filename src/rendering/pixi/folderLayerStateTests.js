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
    isIconSelected: () => false,
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
      gridStyle: { gridTemplateColumns: "repeat(3, 1fr)" },
      isAppLaunchClosing: true,
      isClosing: false,
      openingOriginBounds: { folderId: "folder-1" },
      openIconGhosts: [{ item: { id: "app-a" }, key: "open-a", slotIndex: 0 }],
      pageIndex: 2,
      pageSize: 9,
      pages: [[{ id: "app-a" }]],
      panelRef: { value: null },
      panelStyle: { "--folder-icon-size": "52px" },
      renderedFolder: { id: "folder-1" },
      viewportRef: { value: null },
    },
    stage: {
      rect: { height: 0, left: 4, top: 5, width: 0 },
    },
    ui: {
      isEditMode: true,
      isTextlessMode: false,
      launchTargetStatusById: { "app-a": "ok" },
      showMissingLaunchTargetBadge: true,
    },
  }, { prewarm: true, singleStageDiagnostics: true });

  assert(state.width === 1 && state.height === 1, "stage dimensions should have a minimum size");
  assert(state.stageRect.left === 4 && state.stageRect.top === 5, "stage rect should be preserved");
  assert(state.iconSize === 52, "folder icon size should be parsed from panel style");
  assert(state.dragReleaseGhostId === "released-app", "drag release ghost id should come from release state");
  assert(state.getFolderOpenIconGhostKey("app-a", 0) === "open-a", "open ghost lookup should use current open ghosts");
  assert(state.getFolderCloseIconGhostKey("app-b", 1) === "close-b", "close ghost lookup should use current close ghosts");
  assert(state.completeFolderOpenIconGhost === callbacks.completeFolderOpenIconGhost, "callbacks should be forwarded");
  assert(state.completeFolderOpenFrameGhost === callbacks.completeFolderOpenFrameGhost, "frame completion callback should be forwarded");
  assert(state.isFolderAppLaunchClosing, "folder app-launch closing state should be forwarded");
  assert(state.singleStageDiagnostics, "single-stage diagnostics flag should be preserved");
  assert(state.prewarm, "overrides should be applied last");
}
