import { ref } from "vue";
import {
  BACKGROUND_RENDER_MODE_IMAGE,
  BACKGROUND_RENDER_MODE_MATERIAL,
} from "./useLaunchpadSettingsConfig.js";
import {
  appLaunchGhostTransition,
  homeShellTransition,
  panelSpring,
} from "./launchpadMotion.js";
import { useLaunchpadViewState } from "./useLaunchpadViewState.js";

function createViewState(overrides = {}) {
  const state = {
    backgroundRenderMode: ref(overrides.backgroundRenderMode ?? BACKGROUND_RENDER_MODE_MATERIAL),
    backgroundImageOpacity: ref(overrides.backgroundImageOpacity ?? 46),
    backgroundImageUrl: ref(overrides.backgroundImageUrl ?? null),
    iconSize: ref(overrides.iconSize ?? 64),
    isAppLaunching: ref(Boolean(overrides.isAppLaunching)),
    isDesktopClosing: ref(Boolean(overrides.isDesktopClosing)),
    isDesktopOpen: ref(overrides.isDesktopOpen ?? true),
    isFolderClosing: ref(Boolean(overrides.isFolderClosing)),
    isFolderLayerActive: ref(Boolean(overrides.isFolderLayerActive)),
    isHomeRevealSettling: ref(Boolean(overrides.isHomeRevealSettling)),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    openFolderId: ref(overrides.openFolderId ?? null),
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
  assert(desktop.view.rootStyle.value["--launchpad-background-image-opacity"] === "0", "root style should hide the background image in material mode");
  assert(desktop.view.desktopTrackMotionKey.value === "open-desktop-spring", "desktop motion key should describe open desktop spring state");
  assert(desktop.view.homeShellAnimate.value.opacity === 1, "home shell should be visible in the idle desktop state");
  assert(desktop.view.homeShellStyle.value.pointerEvents === "auto", "home shell should allow pointer events in the idle desktop state");
  assert(desktop.view.appLaunchGhostTransition === appLaunchGhostTransition, "view state should expose the app launch ghost transition");
  assert(desktop.view.homeShellTransition === homeShellTransition, "view state should expose the home shell transition");
  assert(desktop.view.panelSpring === panelSpring, "view state should expose the settings panel spring");

  const imageBackground = createViewState({ backgroundRenderMode: BACKGROUND_RENDER_MODE_IMAGE, backgroundImageOpacity: 58 });
  assert(imageBackground.view.rootStyle.value["--launchpad-background-image-opacity"] === "0.58", "root style should expose image opacity in image background mode");
  const customImageBackground = createViewState({ backgroundImageUrl: "asset://C:/Images/wallpaper.webp" });
  assert(customImageBackground.view.backgroundImageStyle.value.backgroundImage === "url(\"asset://C:/Images/wallpaper.webp\")", "background image style should expose custom asset urls");

  const search = createViewState({ isSearchMode: true });
  assert(search.view.desktopTrackMotionKey.value === "open-search-spring", "desktop motion key should describe search mode");

  const closingDesktop = createViewState({ isDesktopOpen: false, isDesktopClosing: true, isSearchMode: true });
  assert(closingDesktop.view.desktopTrackMotionKey.value === "open-search-spring", "closing desktop should avoid remounting the page track");
  assert(closingDesktop.view.homeShellAnimate.value.opacity === 0, "closing desktop should still hide home shell");

  const closed = createViewState({ isDesktopOpen: false, isSearchMode: true });
  assert(closed.view.desktopTrackMotionKey.value === "closed-search-snap", "closed search should use snap motion key");
  assert(closed.view.homeShellAnimate.value.opacity === 0, "closed desktop should hide home shell");
  assert(closed.view.homeShellStyle.value.pointerEvents === "none", "closed desktop should disable home shell pointer events");

  const openFolder = createViewState({ openFolderId: "folder-1", isFolderLayerActive: true });
  assert(openFolder.view.desktopTrackMotionKey.value === "open-desktop-snap", "open folder should snap the desktop track");
  assert(openFolder.view.homeShellAnimate.value.y === 44, "open folder should move home shell down");
  assert(openFolder.view.homeShellStyle.value.pointerEvents === "none", "open folder should disable home shell pointer events");

  const settling = createViewState({ isHomeRevealSettling: true, isFolderLayerActive: true, openFolderId: "folder-1" });
  assert(settling.view.desktopTrackMotionKey.value === "open-desktop-snap", "home reveal settling should snap the desktop track");
}
