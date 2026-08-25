import { createFolderLayerState } from "./folderLayerState.js";
import type { FolderLayerCallbacks } from "./folderLayerState.js";
import type { SceneItem } from "../sceneFrame.js";

export function runFolderLayerStateTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder layer state test failed] ${message}`);
  };

  const callbacks: FolderLayerCallbacks = {
    completeFolderCloseIconGhost: () => {},
    completeFolderOpenFrameGhost: () => {},
    completeFolderOpenIconGhost: () => {},
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: (page: readonly (SceneItem | null)[]) => page.filter((item): item is SceneItem => item !== null),
    isIconOpening: () => false,
    setFolderPageRef: () => {},
  };
  const state = createFolderLayerState({
    callbacks,
    drag: {
      groupDragState: { phase: "dragging" },
      meta: { active: true },
    },
    folder: {
      closeIconGhosts: [{ item: { id: "app-b" }, key: "close-b", slotIndex: 1 }],
      desktopPageTrackOffset: { liveX: -120, targetX: -400 },
      gridStyle: { gridTemplateColumns: "repeat(3, 1fr)" },
      isAppLaunchClosing: true,
      isClosing: false,
      openingOriginBounds: {
        folderId: "folder-1",
        iconRect: { height: 64, left: 20, top: 30, width: 64 },
        previewChildRects: [],
        thumbRect: { height: 48, left: 28, top: 38, width: 48 },
      },
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
    geometry: {
      canvasStageRect: { height: 720, left: 0, top: 0, width: 1280 },
      desktopFrame: { height: 620, left: 0, top: 100, width: 1280 },
      desktopGrid: { cols: 7, isSearchMode: false, rows: 5, visibleCount: 20 },
      desktopStageRect: { height: 620, left: 0, top: 100, width: 1280 },
      deviceResolution: 1.25,
      singleStageDiagnostics: true,
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
      focusedIcon: { area: "folder", folderId: "folder-1", id: "app-a", pageIndex: 3 },
      showMissingLaunchTargetBadge: true,
    },
  });

  assert(state.width === 1 && state.height === 1, "stage dimensions should have a minimum size");
  assert(state.stageRect.left === 4 && state.stageRect.top === 5, "stage rect should be preserved");
  assert(state.iconSize === 52, "folder icon size should be parsed from panel style");
  assert(state.groupDragState?.phase === "dragging", "the shared group drag snapshot should be forwarded");
  assert(state.dragMeta?.active === true, "the shared drag ownership snapshot should be forwarded");
  assert(state.desktopPageTrackOffset !== null, "desktop page track offset should be present");
  assert(state.desktopPageTrackOffset.liveX === -120 && state.desktopPageTrackOffset.targetX === -400, "desktop page track offset should be forwarded");
  assert(state.desktopGrid.cols === 7 && state.desktopGrid.rows === 5, "desktop transition grid dimensions should be forwarded");
  assert(state.desktopGrid.visibleCount === 20 && !state.desktopGrid.isSearchMode, "desktop transition grid mode should be forwarded");
  assert(state.deviceResolution === 1.25, "folder handoff geometry should receive the renderer resolution");
  assert(state.getFolderOpenIconGhostKey("app-a", 0) === "open-a", "open ghost lookup should use current open ghosts");
  assert(state.getFolderCloseIconGhostKey("app-b", 1) === "close-b", "close ghost lookup should use current close ghosts");
  assert(state.folderPageIndex === 2, "committed folder page index should be forwarded");
  assert(state.visualFolderPageIndex === 3, "visual folder page index should be forwarded separately");
  assert(state.folderPageTurnToken === 42, "folder page turn token should be forwarded for render state changes");
  assert(state.folderOpenProgress === 0.42, "folder open progress should be forwarded");
  assert(state.folderOpenProgressTarget === 1, "folder open progress target should be forwarded");
  assert(state.focusedIcon?.id === "app-a", "the explicit focus descriptor should be forwarded to the folder layer");
  assert(state.iconGesturePresentation?.phase === "armed", "folder layer state should forward the shared icon gesture presentation");
  assert(state.completeFolderOpenIconGhost === callbacks.completeFolderOpenIconGhost, "callbacks should be forwarded");
  assert(state.completeFolderOpenFrameGhost === callbacks.completeFolderOpenFrameGhost, "frame completion callback should be forwarded");
  assert(state.isFolderAppLaunchClosing, "folder app-launch closing state should be forwarded");
  assert(state.singleStageDiagnostics, "single-stage diagnostics flag should be preserved");
  assert(Object.isFrozen(state), "folder overlay frames should be immutable after construction");

  let rejectedLegacyOverrides = false;
  try {
    createFolderLayerState({
      callbacks: {},
      drag: {},
      folder: {},
      geometry: {
        canvasStageRect: { height: 1, left: 0, top: 0, width: 1 },
        desktopFrame: { height: 1, left: 0, top: 0, width: 1 },
        desktopGrid: { cols: 1, isSearchMode: false, rows: 1, visibleCount: 0 },
        desktopStageRect: { height: 1, left: 0, top: 0, width: 1 },
        singleStageDiagnostics: false,
      },
      legacyOverrides: {},
      stage: { rect: { height: 1, left: 0, top: 0, width: 1 } },
      ui: {},
    } as Parameters<typeof createFolderLayerState>[0]);
  } catch (error) {
    rejectedLegacyOverrides = error instanceof TypeError;
  }
  assert(rejectedLegacyOverrides, "legacy arbitrary override groups should be rejected");
}
