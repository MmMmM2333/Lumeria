import { computed, ref, shallowRef } from "vue";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { makePageSize } from "../domain/launchpadLayout.js";
import { FOLDER_ICON_SIZE_MODE_GLOBAL } from "./useLaunchpadSettingsConfig.js";

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
  const pageSize = computed(() => makePageSize(gridRows.value, gridCols.value));
  const folderPageSize = computed(() => makePageSize(folderRows.value, folderCols.value));

  const pages = shallowRef([]);
  const pageIndex = ref(0);
  const searchPageIndex = ref(0);
  const isTextlessMode = ref(false);
  const hiddenAppIds = ref([]);
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
  const dragPreviewRef = ref(null);
  const pageRefs = [];
  const folderPageRefs = [];

  return {
    desktopMainRef,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftIconSize,
    draftRows,
    dragPreviewRef,
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
    isTextlessMode,
    keyboardFocusArea,
    pageDotsRef,
    pageIndex,
    pageRefs,
    pageSize,
    pages,
    rootRef,
    searchInputRef,
    searchPageIndex,
    searchRef,
    shellRef,
  };
}
