import { ref } from "vue";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { DEFAULT_MAIN_WINDOW_SHORTCUT } from "../domain/mainWindowShortcut.js";
import { useLaunchpadControllerState } from "./useLaunchpadControllerState.js";
import {
  DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE,
  DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_DARKEN_COLOR,
  DEFAULT_BACKGROUND_DARKEN_STRENGTH,
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  DEFAULT_FULLSCREEN_OVERSCAN_ENABLED,
  DEFAULT_SHOW_CUSTOM_TITLEBAR,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  DEFAULT_WINDOW_MODE,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
} from "./useLaunchpadSettingsConfig.js";

export function runLaunchpadControllerStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad controller state test failed] ${message}`);
  };

  const state = useLaunchpadControllerState();

  assert(state.gridRows.value === DEFAULT_ROWS, "desktop rows should use the default");
  assert(state.gridCols.value === DEFAULT_COLS, "desktop cols should use the default");
  assert(state.folderRows.value === DEFAULT_FOLDER_ROWS, "folder rows should use the default");
  assert(state.folderCols.value === DEFAULT_FOLDER_COLS, "folder cols should use the default");
  assert(state.iconSize.value === DEFAULT_ICON_SIZE, "desktop icon size should use the default");
  assert(state.folderIconSize.value === DEFAULT_ICON_SIZE, "folder icon size should use the default");
  assert(state.folderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_GLOBAL, "folder icon mode should default to global");
  assert(state.draftFolderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_GLOBAL, "draft folder icon mode should default to global");
  assert(state.draftIsTextlessMode.value === false, "draft textless mode should start disabled");
  assert(state.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "background source should default to system material");
  assert(state.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "background effect should default to dimmed");
  assert(state.backgroundBaseColor.value === DEFAULT_BACKGROUND_BASE_COLOR, "background base color should use the default");
  assert(state.backgroundBaseOpacity.value === DEFAULT_BACKGROUND_BASE_OPACITY, "background base opacity should use the default");
  assert(state.backgroundImageOpacity.value === DEFAULT_BACKGROUND_IMAGE_OPACITY, "background image opacity should use the default");
  assert(state.backgroundImageLayout.value === DEFAULT_BACKGROUND_IMAGE_LAYOUT, "background image layout should use the default");
  assert(state.backgroundBlurStrength.value === DEFAULT_BACKGROUND_BLUR_STRENGTH, "background blur strength should use the default");
  assert(state.backgroundAcrylicBlurStrength.value === DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH, "background acrylic blur strength should use the default");
  assert(state.backgroundDarkenColor.value === DEFAULT_BACKGROUND_DARKEN_COLOR, "background darken color should use the default");
  assert(state.backgroundDarkenStrength.value === DEFAULT_BACKGROUND_DARKEN_STRENGTH, "background darken strength should use the default");
  assert(state.backgroundAcrylicAppearance.value === DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE, "background acrylic appearance should use the default");
  assert(state.backgroundAcrylicDarkParams.value.brightness === 0.8, "background acrylic dark params should use the default");
  assert(state.backgroundAcrylicLightParams.value.brightness === 1, "background acrylic light params should use the default");
  assert(state.backgroundImagePath.value === null, "background image path should default to the built-in image");
  assert(state.backgroundImageUrl.value === null, "background image url should default to the built-in image");
  assert(state.draftBackgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "draft background source should default to system material");
  assert(state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "draft background effect should default to dimmed");
  assert(state.draftBackgroundBaseColor.value === DEFAULT_BACKGROUND_BASE_COLOR, "draft background base color should use the default");
  assert(state.draftBackgroundBaseOpacity.value === DEFAULT_BACKGROUND_BASE_OPACITY, "draft background base opacity should use the default");
  assert(state.draftBackgroundImageOpacity.value === DEFAULT_BACKGROUND_IMAGE_OPACITY, "draft background image opacity should use the default");
  assert(state.draftBackgroundImageLayout.value === DEFAULT_BACKGROUND_IMAGE_LAYOUT, "draft background image layout should use the default");
  assert(state.draftBackgroundBlurStrength.value === DEFAULT_BACKGROUND_BLUR_STRENGTH, "draft background blur strength should use the default");
  assert(state.draftBackgroundAcrylicBlurStrength.value === DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH, "draft background acrylic blur strength should use the default");
  assert(state.draftBackgroundDarkenColor.value === DEFAULT_BACKGROUND_DARKEN_COLOR, "draft background darken color should use the default");
  assert(state.draftBackgroundDarkenStrength.value === DEFAULT_BACKGROUND_DARKEN_STRENGTH, "draft background darken strength should use the default");
  assert(state.draftBackgroundAcrylicAppearance.value === DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE, "draft background acrylic appearance should use the default");
  assert(state.draftBackgroundAcrylicDarkParams.value.tintColor[0] === state.backgroundAcrylicDarkParams.value.tintColor[0], "draft background acrylic dark params should use the default");
  assert(state.draftBackgroundAcrylicLightParams.value.tintColor[0] !== state.backgroundAcrylicDarkParams.value.tintColor[0], "draft background acrylic light params should use the light default");
  assert(state.draftBackgroundImagePath.value === null, "draft background image path should default to the built-in image");
  assert(state.draftBackgroundImageUrl.value === null, "draft background image url should default to the built-in image");
  assert(state.isChoosingBackgroundImage.value === false, "background image picker state should start idle");
  assert(state.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "window effect material should default to acrylic");
  assert(state.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_DARK, "window effect appearance should default to dark");
  assert(state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "draft window effect material should default to acrylic");
  assert(state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_DARK, "draft window effect appearance should default to dark");
  assert(state.windowMode.value === DEFAULT_WINDOW_MODE, "window mode should default to fullscreen");
  assert(state.draftWindowMode.value === DEFAULT_WINDOW_MODE, "draft window mode should default to fullscreen");
  assert(state.fullscreenOverscanEnabled.value === DEFAULT_FULLSCREEN_OVERSCAN_ENABLED, "fullscreen overscan should be enabled by default");
  assert(state.draftFullscreenOverscanEnabled.value === DEFAULT_FULLSCREEN_OVERSCAN_ENABLED, "draft fullscreen overscan should be enabled by default");
  assert(state.showCustomTitlebar.value === DEFAULT_SHOW_CUSTOM_TITLEBAR, "custom titlebar should be visible by default");
  assert(state.draftShowCustomTitlebar.value === DEFAULT_SHOW_CUSTOM_TITLEBAR, "draft custom titlebar should be visible by default");
  assert(state.mainWindowShortcut.value === DEFAULT_MAIN_WINDOW_SHORTCUT, "main window shortcut should use the default");
  assert(state.draftMainWindowShortcut.value === DEFAULT_MAIN_WINDOW_SHORTCUT, "draft main window shortcut should use the default");
  assert(state.mainWindowShortcutError.value === "", "main window shortcut errors should start empty");
  assert(state.isApplyingSettingsConfig.value === false, "settings apply state should start idle");
  assert(state.windowEffectsSupport.value.supportsAcrylic === false, "window effect support should start unavailable before native detection");
  assert(state.pageSize.value === DEFAULT_ROWS * DEFAULT_COLS, "page size should derive from desktop grid dimensions");
  assert(state.folderPageSize.value === DEFAULT_FOLDER_ROWS * DEFAULT_FOLDER_COLS, "folder page size should derive from folder grid dimensions");

  state.gridRows.value = 2;
  state.gridCols.value = 3;
  state.folderRows.value = 4;
  state.folderCols.value = 5;
  assert(state.pageSize.value === 6, "page size should update with desktop grid dimensions");
  assert(state.folderPageSize.value === 20, "folder page size should update with folder grid dimensions");

  assert(Array.isArray(state.pages.value) && state.pages.value.length === 0, "pages should start as an empty shallow container");
  assert(state.pageIndex.value === 0, "desktop page index should start at zero");
  assert(state.searchPageIndex.value === 0, "search page index should start at zero");
  assert(state.folderPageIndex.value === 0, "folder page index should start at zero");
  assert(state.folderPageTurnRequest.value === null, "folder page turn request should start empty");
  assert(state.visualFolderPageIndex.value === 0, "visual folder page index should start from the committed page");
  assert(state.keyboardFocusArea.value === "desktop", "keyboard focus should start on the desktop");
  assert(state.isLayoutProjectionActive.value === false, "layout projection should start disabled");
  assert(state.isTextlessMode.value === false, "textless mode should start disabled");
  assert(Array.isArray(state.hiddenAppIds.value) && state.hiddenAppIds.value.length === 0, "hidden app ids should start empty");

  assert(state.rootRef.value === null && state.shellRef.value === null, "DOM refs should start empty");
  assert(Array.isArray(state.pageRefs) && state.pageRefs.length === 0, "page refs should start empty");
  assert(Array.isArray(state.folderPageRefs) && state.folderPageRefs.length === 0, "folder page refs should start empty");

  const phase = ref("open");
  const folderId = ref("folder-a");
  const maxIndex = ref(3);
  state.setFolderPageTurnContextResolver(() => ({
    folderId: folderId.value,
    maxIndex: maxIndex.value,
    phase: phase.value,
  }));

  const firstToken = state.requestFolderPageTurn(2, { source: "test" });
  assert(state.folderPageTurnRequest.value.token === firstToken, "folder page turn request should expose its token");
  assert(state.folderPageTurnRequest.value.folderId === "folder-a", "folder page turn request should bind the active folder id");
  assert(state.folderPageTurnRequest.value.fromIndex === 0, "folder page turn request should capture the committed source page");
  assert(state.folderPageTurnRequest.value.targetIndex === 2, "folder page turn request should capture the requested target page");
  assert(state.folderPageTurnRequest.value.phaseAtRequest === "open", "folder page turn request should capture the request phase");
  assert(state.visualFolderPageIndex.value === 2, "visual folder page index should use a valid open-phase request");

  phase.value = "closing";
  assert(state.visualFolderPageIndex.value === 0, "closing phase should ignore pending folder page requests visually");
  assert(!state.commitFolderPageTurnRequest(firstToken), "closing phase should reject a pending folder page request commit");
  assert(state.folderPageIndex.value === 0, "rejected folder page turn request should not change the committed page");

  phase.value = "open";
  folderId.value = "folder-b";
  assert(state.visualFolderPageIndex.value === 0, "a request for another folder should not affect the visual page");
  assert(!state.commitFolderPageTurnRequest(firstToken), "a request for another folder should not commit");

  folderId.value = "folder-a";
  const secondToken = state.requestFolderPageTurn(99);
  assert(state.folderPageTurnRequest.value.targetIndex === 3, "folder page turn request targets should clamp to folder bounds");
  assert(!state.commitFolderPageTurnRequest(firstToken), "superseded folder page turn request tokens should be stale");
  assert(state.commitFolderPageTurnRequest(secondToken), "current folder page turn request token should commit");
  assert(state.folderPageIndex.value === 3, "committing a folder page turn request should update the committed page");
  assert(state.folderPageTurnRequest.value === null, "committing a folder page turn request should clear the request");

  state.requestFolderPageTurn(1);
  assert(state.clearFolderPageTurnRequest("test"), "clearFolderPageTurnRequest should report clearing an active request");
  assert(state.folderPageTurnRequest.value === null, "clearFolderPageTurnRequest should clear pending requests");
}
