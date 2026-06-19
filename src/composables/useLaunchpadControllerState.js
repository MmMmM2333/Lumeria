import { computed, ref, shallowRef } from "vue";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { makePageSize } from "../domain/launchpadLayout.js";
import { DEFAULT_MAIN_WINDOW_SHORTCUT } from "../domain/mainWindowShortcut.js";
import {
  DEFAULT_SCAN_KEYWORD_BLACKLIST,
  DEFAULT_SCAN_ROOTS,
} from "../domain/launchpadData.js";
import {
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE,
  DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_DARKEN_COLOR,
  DEFAULT_BACKGROUND_DARKEN_STRENGTH,
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY,
  DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT,
  DEFAULT_WINDOW_MODE,
  DEFAULT_WINDOW_EFFECTS_SUPPORT,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  createDefaultBackgroundAcrylicParams,
} from "./useLaunchpadSettingsConfig.js";

export function useLaunchpadControllerState() {
  const gridRows = ref(DEFAULT_ROWS);
  const gridCols = ref(DEFAULT_COLS);
  const folderRows = ref(DEFAULT_FOLDER_ROWS);
  const folderCols = ref(DEFAULT_FOLDER_COLS);
  const draftRows = ref(DEFAULT_ROWS);
  const draftCols = ref(DEFAULT_COLS);
  const draftFolderRows = ref(DEFAULT_FOLDER_ROWS);
  const draftFolderCols = ref(DEFAULT_FOLDER_COLS);
  const iconSize = ref(DEFAULT_ICON_SIZE);
  const folderIconSizeMode = ref(FOLDER_ICON_SIZE_MODE_GLOBAL);
  const folderIconSize = ref(DEFAULT_ICON_SIZE);
  const draftIconSize = ref(DEFAULT_ICON_SIZE);
  const draftFolderIconSizeMode = ref(FOLDER_ICON_SIZE_MODE_GLOBAL);
  const draftFolderIconSize = ref(DEFAULT_ICON_SIZE);
  const backgroundSource = ref(BACKGROUND_SOURCE_SYSTEM_MATERIAL);
  const backgroundEffect = ref(BACKGROUND_EFFECT_DIMMED);
  const backgroundBaseColor = ref(DEFAULT_BACKGROUND_BASE_COLOR);
  const backgroundBaseOpacity = ref(DEFAULT_BACKGROUND_BASE_OPACITY);
  const backgroundImageOpacity = ref(DEFAULT_BACKGROUND_IMAGE_OPACITY);
  const backgroundLiveDesktopOpacity = ref(DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY);
  const backgroundImageLayout = ref(DEFAULT_BACKGROUND_IMAGE_LAYOUT);
  const backgroundBlurStrength = ref(DEFAULT_BACKGROUND_BLUR_STRENGTH);
  const backgroundAcrylicBlurStrength = ref(DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH);
  const backgroundDarkenStrength = ref(DEFAULT_BACKGROUND_DARKEN_STRENGTH);
  const backgroundDarkenColor = ref(DEFAULT_BACKGROUND_DARKEN_COLOR);
  const backgroundAcrylicAppearance = ref(DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE);
  const backgroundAcrylicDarkParams = ref(createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK));
  const backgroundAcrylicLightParams = ref(createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT));
  const backgroundImagePath = ref(null);
  const backgroundImageUrl = ref(null);
  const draftBackgroundSource = ref(BACKGROUND_SOURCE_SYSTEM_MATERIAL);
  const draftBackgroundEffect = ref(BACKGROUND_EFFECT_DIMMED);
  const draftBackgroundBaseColor = ref(DEFAULT_BACKGROUND_BASE_COLOR);
  const draftBackgroundBaseOpacity = ref(DEFAULT_BACKGROUND_BASE_OPACITY);
  const draftBackgroundImageOpacity = ref(DEFAULT_BACKGROUND_IMAGE_OPACITY);
  const draftBackgroundLiveDesktopOpacity = ref(DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY);
  const draftBackgroundImageLayout = ref(DEFAULT_BACKGROUND_IMAGE_LAYOUT);
  const draftBackgroundBlurStrength = ref(DEFAULT_BACKGROUND_BLUR_STRENGTH);
  const draftBackgroundAcrylicBlurStrength = ref(DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH);
  const draftBackgroundDarkenStrength = ref(DEFAULT_BACKGROUND_DARKEN_STRENGTH);
  const draftBackgroundDarkenColor = ref(DEFAULT_BACKGROUND_DARKEN_COLOR);
  const draftBackgroundAcrylicAppearance = ref(DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE);
  const draftBackgroundAcrylicDarkParams = ref(createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK));
  const draftBackgroundAcrylicLightParams = ref(createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT));
  const draftBackgroundImagePath = ref(null);
  const draftBackgroundImageUrl = ref(null);
  const isChoosingBackgroundImage = ref(false);
  const liveDesktopBackgroundSupport = ref({ ...DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT });
  const liveDesktopCssFallbackEffectsEnabled = ref(false);
  const liveDesktopRuntimeStatus = ref({
    phase: "stopped",
    active: false,
    generation: 0,
    reason: "nativeBridgeUnavailable",
    detail: "",
  });
  const windowEffectsSupport = ref({ ...DEFAULT_WINDOW_EFFECTS_SUPPORT });
  const windowEffectMaterial = ref(WINDOW_EFFECT_MATERIAL_ACRYLIC);
  const windowEffectAppearance = ref(WINDOW_EFFECT_APPEARANCE_DARK);
  const draftWindowEffectMaterial = ref(WINDOW_EFFECT_MATERIAL_ACRYLIC);
  const draftWindowEffectAppearance = ref(WINDOW_EFFECT_APPEARANCE_DARK);
  const windowMode = ref(DEFAULT_WINDOW_MODE);
  const draftWindowMode = ref(DEFAULT_WINDOW_MODE);
  const mainWindowShortcut = ref(DEFAULT_MAIN_WINDOW_SHORTCUT);
  const draftMainWindowShortcut = ref(DEFAULT_MAIN_WINDOW_SHORTCUT);
  const mainWindowShortcutError = ref("");
  const isApplyingSettingsConfig = ref(false);
  const pageSize = computed(() => makePageSize(gridRows.value, gridCols.value));
  const folderPageSize = computed(() => makePageSize(folderRows.value, folderCols.value));

  const pages = shallowRef([]);
  const pageIndex = ref(0);
  const searchPageIndex = ref(0);
  const isTextlessMode = ref(false);
  const draftIsTextlessMode = ref(false);
  const hiddenAppIds = ref([]);
  const scanRoots = ref(DEFAULT_SCAN_ROOTS.map((root) => ({ ...root })));
  const scanKeywordBlacklist = ref([...DEFAULT_SCAN_KEYWORD_BLACKLIST]);
  const scanAppBlacklist = ref([]);
  const showMissingLaunchTargetBadge = ref(true);
  const launchTargetStatusById = ref({});
  const isLayoutProjectionActive = ref(false);
  const keyboardFocusArea = ref("desktop");
  const folderPageIndex = ref(0);

  const rootRef = ref(null);
  const shellRef = ref(null);
  const headerRef = ref(null);
  const searchRef = ref(null);
  const searchInputRef = ref(null);
  const desktopMainRef = ref(null);
  const pageDotsRef = ref(null);
  const folderPanelRef = ref(null);
  const folderViewportRef = ref(null);
  const pageRefs = [];
  const folderPageRefs = [];

  return {
    backgroundBaseColor,
    backgroundBaseOpacity,
    backgroundAcrylicAppearance,
    backgroundAcrylicBlurStrength,
    backgroundAcrylicDarkParams,
    backgroundAcrylicLightParams,
    backgroundBlurStrength,
    backgroundDarkenColor,
    backgroundDarkenStrength,
    backgroundImageOpacity,
    backgroundLiveDesktopOpacity,
    backgroundImageLayout,
    backgroundImagePath,
    backgroundImageUrl,
    backgroundEffect,
    backgroundSource,
    desktopMainRef,
    draftBackgroundBaseColor,
    draftBackgroundBaseOpacity,
    draftBackgroundAcrylicAppearance,
    draftBackgroundAcrylicBlurStrength,
    draftBackgroundAcrylicDarkParams,
    draftBackgroundAcrylicLightParams,
    draftBackgroundBlurStrength,
    draftBackgroundDarkenColor,
    draftBackgroundDarkenStrength,
    draftBackgroundEffect,
    draftBackgroundImageOpacity,
    draftBackgroundLiveDesktopOpacity,
    draftBackgroundImageLayout,
    draftBackgroundImagePath,
    draftBackgroundImageUrl,
    draftBackgroundSource,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftIconSize,
    draftIsTextlessMode,
    draftRows,
    draftWindowMode,
    draftWindowEffectAppearance,
    draftWindowEffectMaterial,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderPageIndex,
    folderPageRefs,
    folderPageSize,
    folderPanelRef,
    folderRows,
    folderViewportRef,
    gridCols,
    gridRows,
    headerRef,
    hiddenAppIds,
    iconSize,
    isChoosingBackgroundImage,
    isApplyingSettingsConfig,
    isLayoutProjectionActive,
    isTextlessMode,
    launchTargetStatusById,
    liveDesktopBackgroundSupport,
    liveDesktopCssFallbackEffectsEnabled,
    liveDesktopRuntimeStatus,
    mainWindowShortcut,
    mainWindowShortcutError,
    draftMainWindowShortcut,
    keyboardFocusArea,
    pageDotsRef,
    pageIndex,
    pageRefs,
    pageSize,
    pages,
    rootRef,
    scanAppBlacklist,
    scanKeywordBlacklist,
    scanRoots,
    searchInputRef,
    searchPageIndex,
    showMissingLaunchTargetBadge,
    searchRef,
    shellRef,
    windowEffectAppearance,
    windowEffectMaterial,
    windowEffectsSupport,
    windowMode,
  };
}
