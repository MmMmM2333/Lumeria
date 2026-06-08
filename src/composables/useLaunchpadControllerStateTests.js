import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { useLaunchpadControllerState } from "./useLaunchpadControllerState.js";
import {
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
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
  assert(state.backgroundImageOpacity.value === DEFAULT_BACKGROUND_IMAGE_OPACITY, "background image opacity should use the default");
  assert(state.backgroundImagePath.value === null, "background image path should default to the built-in image");
  assert(state.backgroundImageUrl.value === null, "background image url should default to the built-in image");
  assert(state.draftBackgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "draft background source should default to system material");
  assert(state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "draft background effect should default to dimmed");
  assert(state.draftBackgroundImageOpacity.value === DEFAULT_BACKGROUND_IMAGE_OPACITY, "draft background image opacity should use the default");
  assert(state.draftBackgroundImagePath.value === null, "draft background image path should default to the built-in image");
  assert(state.draftBackgroundImageUrl.value === null, "draft background image url should default to the built-in image");
  assert(state.isChoosingBackgroundImage.value === false, "background image picker state should start idle");
  assert(state.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "window effect material should default to acrylic");
  assert(state.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_DARK, "window effect appearance should default to dark");
  assert(state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "draft window effect material should default to acrylic");
  assert(state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_DARK, "draft window effect appearance should default to dark");
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
  assert(state.keyboardFocusArea.value === "desktop", "keyboard focus should start on the desktop");
  assert(state.isLayoutProjectionActive.value === false, "layout projection should start disabled");
  assert(state.isTextlessMode.value === false, "textless mode should start disabled");
  assert(Array.isArray(state.hiddenAppIds.value) && state.hiddenAppIds.value.length === 0, "hidden app ids should start empty");

  assert(state.rootRef.value === null && state.shellRef.value === null, "DOM refs should start empty");
  assert(Array.isArray(state.pageRefs) && state.pageRefs.length === 0, "page refs should start empty");
  assert(Array.isArray(state.folderPageRefs) && state.folderPageRefs.length === 0, "folder page refs should start empty");
}
