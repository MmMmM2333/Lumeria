import { computed, ref, shallowRef } from "vue";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { makePageSize } from "../domain/launchpadLayout.js";
import {
  DEFAULT_SCAN_KEYWORD_BLACKLIST,
  DEFAULT_SCAN_ROOTS,
} from "../domain/launchpadData.js";
import {
  BACKGROUND_RENDER_MODE_MATERIAL,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  DEFAULT_WINDOW_EFFECTS_SUPPORT,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
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
  const backgroundRenderMode = ref(BACKGROUND_RENDER_MODE_MATERIAL);
  const backgroundImageOpacity = ref(DEFAULT_BACKGROUND_IMAGE_OPACITY);
  const draftBackgroundRenderMode = ref(BACKGROUND_RENDER_MODE_MATERIAL);
  const draftBackgroundImageOpacity = ref(DEFAULT_BACKGROUND_IMAGE_OPACITY);
  const windowEffectsSupport = ref({ ...DEFAULT_WINDOW_EFFECTS_SUPPORT });
  const windowEffectMaterial = ref(WINDOW_EFFECT_MATERIAL_ACRYLIC);
  const windowEffectAppearance = ref(WINDOW_EFFECT_APPEARANCE_DARK);
  const draftWindowEffectMaterial = ref(WINDOW_EFFECT_MATERIAL_ACRYLIC);
  const draftWindowEffectAppearance = ref(WINDOW_EFFECT_APPEARANCE_DARK);
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
    backgroundImageOpacity,
    backgroundRenderMode,
    desktopMainRef,
    draftBackgroundImageOpacity,
    draftBackgroundRenderMode,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftIconSize,
    draftIsTextlessMode,
    draftRows,
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
    isLayoutProjectionActive,
    isTextlessMode,
    launchTargetStatusById,
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
  };
}
