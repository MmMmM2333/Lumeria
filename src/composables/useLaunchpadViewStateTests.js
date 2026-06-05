import { ref } from "vue";
import {
  desktopTrackTransition,
  folderContentCloseTransition,
  folderPanelCloseTransition,
  homeShellTransition,
  instantTrackTransition,
  panelSpring,
} from "./launchpadMotion.js";
import { useLaunchpadViewState } from "./useLaunchpadViewState.js";

function createViewState(overrides = {}) {
  const state = {
    desktopProjectionEpoch: ref(overrides.desktopProjectionEpoch ?? 2),
    folderMotionGeometry: ref(overrides.folderMotionGeometry ?? {
      borderRadius: 18,
      scaleX: 0.2,
      scaleY: 0.3,
      x: 12,
      y: 24,
    }),
    folderPageIndex: ref(overrides.folderPageIndex ?? 1),
    gridCols: ref(overrides.gridCols ?? 5),
    gridRows: ref(overrides.gridRows ?? 7),
    iconSize: ref(overrides.iconSize ?? 64),
    isAppLaunching: ref(Boolean(overrides.isAppLaunching)),
    isDesktopClosing: ref(Boolean(overrides.isDesktopClosing)),
    isDesktopOpen: ref(overrides.isDesktopOpen ?? true),
    isFolderAppLaunchClosing: ref(Boolean(overrides.isFolderAppLaunchClosing)),
    isFolderClosing: ref(Boolean(overrides.isFolderClosing)),
    isFolderLayerActive: ref(Boolean(overrides.isFolderLayerActive)),
    isHomeRevealSettling: ref(Boolean(overrides.isHomeRevealSettling)),
    isLayoutProjectionActive: ref(Boolean(overrides.isLayoutProjectionActive)),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    openFolderId: ref(overrides.openFolderId ?? null),
    pageIndex: ref(overrides.pageIndex ?? 2),
    searchPageIndex: ref(overrides.searchPageIndex ?? 3),
  };

  return {
    state,
    view: useLaunchpadViewState(state),
  };
}

export function runLaunchpadViewStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad view state test failed] ${message}`);
  };

  const desktop = createViewState();
  assert(desktop.view.rootStyle.value["--configured-app-icon-size"] === "64px", "root style should expose configured icon size");
  assert(desktop.view.activeDesktopTrackAnimate.value.x === "-200%", "desktop track should use desktop page index outside search");
  assert(desktop.view.folderTrackAnimate.value.x === "-100%", "folder track should use folder page index");
  assert(!desktop.view.desktopLayoutEnabled.value, "desktop layout should be disabled outside drag projection windows");
  assert(!desktop.view.folderLayoutEnabled.value, "folder layout should be disabled outside drag projection windows");
  assert(desktop.view.activeDesktopTrackTransition.value === desktopTrackTransition, "desktop track should use spring transition when not snapping");
  assert(desktop.view.desktopTrackMotionKey.value === "open-desktop-spring", "desktop motion key should describe open desktop spring state");
  assert(desktop.view.getDesktopGridProjectionKey(4) === "desktop-grid-4-frozen", "projection key should stay frozen outside drag projection windows");
  assert(desktop.view.homeShellAnimate.value.opacity === 1, "home shell should be visible in the idle desktop state");
  assert(desktop.view.homeShellStyle.value.pointerEvents === "auto", "home shell should allow pointer events in the idle desktop state");
  assert(desktop.view.folderPanelInitial.value.x === 12, "folder panel initial state should use motion geometry");
  assert(desktop.view.folderPanelAnimate.value.opacity === 1, "folder panel should be visible in the idle state");
  assert(desktop.view.folderPanelAnimate.value.borderRadius === "48px", "folder panel resting radius should match the visible folder shell");
  assert(desktop.view.folderPanelTransition.value === panelSpring, "folder panel should use panel spring in the idle state");
  assert(desktop.view.folderContentAnimate.value.opacity === 1, "folder content should be visible in the idle state");
  assert(desktop.view.pageGridStyle.value.gridTemplateColumns === "repeat(5, minmax(0, 1fr))", "page grid columns should follow grid columns");
  assert(desktop.view.pageGridStyle.value.gridTemplateRows === "repeat(7, minmax(0, 1fr))", "page grid rows should follow grid rows");

  const projecting = createViewState({ isLayoutProjectionActive: true });
  assert(projecting.view.desktopLayoutEnabled.value, "desktop layout should be enabled during drag projection windows");
  assert(projecting.view.folderLayoutEnabled.value, "folder layout should be enabled during drag projection windows");
  assert(projecting.view.getDesktopGridProjectionKey(4) === "desktop-grid-4-enabled-2", "projection key should include enabled epoch during drag projection windows");

  const search = createViewState({ isSearchMode: true });
  assert(search.view.activeDesktopTrackAnimate.value.x === "-300%", "search track should use search page index in search mode");
  assert(search.view.desktopLayoutEnabled.value, "desktop layout should be enabled in search mode so results can move");
  assert(!search.view.folderLayoutEnabled.value, "folder layout should stay disabled for search-only projection");
  assert(search.view.desktopTrackMotionKey.value === "open-search-spring", "desktop motion key should describe search mode");
  assert(search.view.getDesktopGridProjectionKey(1) === "search-grid-1-enabled-2", "projection key should include search mode while enabled");

  const closingDesktop = createViewState({ isDesktopOpen: false, isDesktopClosing: true, isSearchMode: true });
  assert(!closingDesktop.view.desktopLayoutEnabled.value, "closing desktop should freeze layout projection");
  assert(closingDesktop.view.activeDesktopTrackTransition.value === desktopTrackTransition, "closing desktop should keep page track springing");
  assert(closingDesktop.view.desktopTrackMotionKey.value === "open-search-spring", "closing desktop should avoid remounting the page track");
  assert(closingDesktop.view.homeShellAnimate.value.opacity === 0, "closing desktop should still hide home shell");

  const closed = createViewState({ isDesktopOpen: false, isSearchMode: true });
  assert(!closed.view.desktopLayoutEnabled.value, "desktop layout should be disabled when closed");
  assert(closed.view.activeDesktopTrackTransition.value === instantTrackTransition, "closed desktop should snap track transitions");
  assert(closed.view.desktopTrackMotionKey.value === "closed-search-snap", "closed search should use snap motion key");
  assert(closed.view.homeShellAnimate.value.opacity === 0, "closed desktop should hide home shell");
  assert(closed.view.homeShellStyle.value.pointerEvents === "none", "closed desktop should disable home shell pointer events");
  assert(closed.view.folderPanelAnimate.value.filter === "blur(8px)", "closed desktop should blur folder panel");
  assert(closed.view.folderPanelAnimate.value.borderRadius === "48px", "closed desktop folder panel target radius should not introduce a post-open radius snap");

  const openFolder = createViewState({ openFolderId: "folder-1", isFolderLayerActive: true });
  assert(!openFolder.view.desktopLayoutEnabled.value, "open folder should freeze desktop layout");
  assert(openFolder.view.homeShellAnimate.value.y === 44, "open folder should move home shell down");
  assert(openFolder.view.homeShellStyle.value.pointerEvents === "none", "open folder should disable home shell pointer events");
  assert(openFolder.view.getDesktopGridProjectionKey(0) === "desktop-grid-0-frozen", "frozen desktop should use frozen projection key");

  const closingFolder = createViewState({ isFolderClosing: true, isFolderLayerActive: true });
  assert(closingFolder.view.folderPanelAnimate.value.opacity === 1, "closing folder should keep folder panel visible during geometry collapse");
  assert(closingFolder.view.folderPanelAnimate.value.x === 12, "closing folder should animate back to geometry x");
  assert(closingFolder.view.folderPanelTransition.value === folderPanelCloseTransition, "closing folder should use the dedicated close transition for the panel");
  assert(closingFolder.view.folderContentAnimate.value.y === 4, "closing folder should only nudge folder content down");
  assert(closingFolder.view.folderContentAnimate.value.scale === 0.985, "closing folder should keep content scale close to resting");
  assert(closingFolder.view.folderContentTransition.value === folderContentCloseTransition, "closing folder should use the dedicated close transition for content");

  const launchClosing = createViewState({ isFolderAppLaunchClosing: true, isFolderLayerActive: true });
  assert(launchClosing.view.folderPanelAnimate.value.scaleX === 1.08, "app launch folder close should expand folder panel");
  assert(launchClosing.view.folderContentAnimate.value.scale === 1.08, "app launch folder close should expand folder content");

  const settling = createViewState({ isHomeRevealSettling: true, isFolderLayerActive: true, openFolderId: "folder-1" });
  assert(settling.view.folderPanelTransition.value === homeShellTransition, "home reveal settling should use home shell transition for folder panel");
}
