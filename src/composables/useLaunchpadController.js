import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { appSeeds } from "../mocks/appSeeds.js";
import {
  APP_LAUNCH_DURATION,
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
  DESKTOP_CLOSE_DURATION,
  DESKTOP_CLOSE_SCALE,
  FOLDER_APP_LAUNCH_DURATION,
  FOLDER_CLOSE_DURATION,
  HOME_REVEAL_SETTLE_DURATION,
} from "./launchpadConstants.js";
import {
  appLaunchGhostTransition,
  desktopTrackTransition,
  dragPreviewSpring,
  folderContentTransition,
  homeShellTransition,
  instantTrackTransition,
  layoutSpring,
  panelSpring,
} from "./launchpadMotion.js";
import {
  chunkIntoPages,
  createLaunchpadLayoutHelpers,
  cx,
  makePageSize,
} from "../domain/launchpadLayout.js";
import { createLaunchpadDataHelpers } from "../domain/launchpadData.js";
import { useAltEditMode } from "./useAltEditMode.js";
import { useFolderLayoutStyles } from "./useFolderLayoutStyles.js";
import { useFolderMotionGeometry } from "./useFolderMotionGeometry.js";
import { useFolderViewportMetrics } from "./useFolderViewportMetrics.js";
import { useLaunchpadApps } from "./useLaunchpadApps.js";
import { useLaunchpadDrag } from "./useLaunchpadDrag.js";
import { useLaunchpadIconActivation } from "./useLaunchpadIconActivation.js";
import { useIconSelection } from "./useIconSelection.js";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";
import { useLaunchpadNotices } from "./useLaunchpadNotices.js";
import { useLaunchpadSearch } from "./useLaunchpadSearch.js";
import {
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  useLaunchpadSettingsConfig,
} from "./useLaunchpadSettingsConfig.js";
import { usePageRenderRange } from "./usePageRenderRange.js";
import { getElementFromRef, usePageGridMetrics } from "./usePageGridMetrics.js";
import { useSettingsPanelFlow } from "./useSettingsPanelFlow.js";

export function useLaunchpadController() {
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
  const layoutHelpers = createLaunchpadLayoutHelpers({
    getPageSize: () => pageSize.value,
    getFolderPageSize: () => folderPageSize.value,
  });
  const {
    getFolderChildPages,
    withFolderPages,
    folderPreviewSlots,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    getVisibleFolderPages,
    flattenTopLevelPages,
    makeId,
    makeApp,
    cloneItem,
    clonePages,
    compactPages,
    ensurePage,
    findTopLevel,
    findFolder,
    findInFolder,
    collectAppsFromPages,
    filterAppsForSearch,
    canCreateDesktopPageAfterDrag,
    canCreateFolderPageAfterDrag,
    assertNoDuplicateItemIds,
    removeEverywhere,
    insertTopLevelItem,
    previewTopLevelItemWithoutOverflow,
    insertAppIntoFolder,
    previewAppIntoFolderWithoutOverflow,
    wouldTopLevelInsertOverflow,
    wouldFolderInsertOverflow,
    replaceFolderWithItem,
    repackFoldersForPageSize,
  } = layoutHelpers;
  const {
    appendAppsToPages,
    createLayoutSnapshot,
    mergeNativeCatalogWithSavedLayout,
  } = createLaunchpadDataHelpers({
    cloneItem,
    clonePages,
    compactPages,
    ensurePage,
    getFolderChildPages,
    getFolderPageSize: () => folderPageSize.value,
    getPageSize: () => pageSize.value,
    makeId,
    withFolderPages,
  });
  const initialPages = chunkIntoPages(appSeeds.map(makeApp), pageSize.value);

  const pages = shallowRef(initialPages);
  const pageIndex = ref(0);
  const searchPageIndex = ref(0);
  const isDesktopOpen = ref(true);
  const isDesktopClosing = ref(false);
  const isAppLaunching = ref(false);
  const isFolderAppLaunchClosing = ref(false);
  const isTextlessMode = ref(false);
  const hiddenAppIds = ref([]);
  const keyboardFocusArea = ref("desktop");
  const launchGhost = shallowRef(null);
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const folderPageIndex = ref(0);
  const isFolderClosing = ref(false);
  const folderClosingSnapshot = shallowRef(null);
  const folderSession = shallowRef(null);
  const isHomeRevealSettling = ref(false);
  const desktopProjectionEpoch = ref(0);

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
  let folderCloseTimer = null;
  let homeRevealSettleTimer = null;
  let desktopCloseTimer = null;
  let appLaunchTimer = null;
  let launchGhostTimer = null;
  let folderAppLaunchTimer = null;
  let layoutResizeObserver = null;
  let dragControls = null;

  const {
    disconnectFolderViewportObserver,
    folderViewportHeight,
    observeFolderViewport,
    scheduleFolderViewportMetrics,
    updateFolderViewportHeight,
  } = useFolderViewportMetrics({
    folderViewportRef,
  });

  let getCurrentIconScopeHandler = () => ({
    area: "desktop",
    pageIndex: 0,
    folderId: null,
    items: [],
    columns: gridCols.value,
  });
  const {
    clearOpeningIcon,
    clearSelectedIcon,
    findSelectedItem,
    isIconOpening,
    isIconSelected,
    moveSelectionByArrow,
    openingIcon,
    selectFirstIconInCurrentScope,
    selectedIcon,
    selectionMatchesScope,
  } = useIconSelection({ getCurrentIconScope: () => getCurrentIconScopeHandler() });

  const renderedFolder = computed(() => {
    if (!renderedFolderId.value) return folderClosingSnapshot.value;
    return findFolder(pages.value, renderedFolderId.value)?.item || folderClosingSnapshot.value;
  });

  const folderPages = computed(() => {
    if (!renderedFolder.value) return [];
    const minPageCount = dragControls?.isDragActive() && openFolderId.value === renderedFolder.value.id ? folderPageIndex.value + 1 : 1;
    return getVisibleFolderPages(renderedFolder.value, folderPageSize.value, minPageCount);
  });
  const {
    folderMotionGeometry,
    getFolderIconMotionGeometry,
    getPageSlotMotionGeometry,
    getTopLevelIconMotionGeometry,
  } = useFolderMotionGeometry({
    folderPages,
    gridCols,
    gridRows,
    pageRefs,
  });
  const {
    effectiveFolderIconSize,
    folderGridStyle,
    folderPanelStyle,
    visibleFolderRowCount,
  } = useFolderLayoutStyles({
    customFolderIconSizeMode: FOLDER_ICON_SIZE_MODE_CUSTOM,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderPages,
    folderRows,
    folderViewportHeight,
    getVisibleFolderPage,
    iconSize,
    isFolderAppLaunchClosing,
  });

  let commitSearchPageIndexHandler = () => {};
  const {
    activePageIndex,
    activePages,
    clearSearch,
    handleSearchInput,
    isSearchMode,
    searchPages,
    searchQuery,
  } = useLaunchpadSearch({
    clearSelectedIcon,
    collectAppsFromPages,
    commitOpenFolder,
    commitSearchPageIndex: (next) => commitSearchPageIndexHandler(next),
    filterAppsForSearch,
    isDragActive: () => isDragActive(),
    openFolderId,
    pageIndex,
    pages,
    pageSize,
    schedulePageGridMetrics: () => schedulePageGridMetrics(),
    searchPageIndex,
    selectFirstIconInCurrentScope,
  });
  const {
    getCurrentIconScope,
    getLaunchIconRect,
    normalizeLaunchSource,
    openSelectedIcon,
  } = useLaunchpadIconActivation({
    clearSelectedIcon,
    commitOpenFolder,
    findInFolder,
    findSelectedItem,
    findTopLevel,
    folderCols,
    folderPageIndex,
    getFolderPages: () => folderPages.value,
    getRenderedFolder: () => renderedFolder.value,
    getSearchPages: () => searchPages.value,
    getSelectedIcon: () => selectedIcon.value,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    gridCols,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isSearchMode: () => isSearchMode.value,
    openApp,
    openFolderId,
    pageIndex,
    pages,
    searchPageIndex,
    selectFirstIconInCurrentScope,
  });
  getCurrentIconScopeHandler = getCurrentIconScope;

  const desktopTrackAnimate = computed(() => ({ x: `-${pageIndex.value * 100}%` }));
  const searchTrackAnimate = computed(() => ({ x: `-${searchPageIndex.value * 100}%` }));
  const activeDesktopTrackAnimate = computed(() => (isSearchMode.value ? searchTrackAnimate.value : desktopTrackAnimate.value));
  const isFolderLayerActive = computed(() => Boolean(openFolderId.value || renderedFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value));
  const shouldFreezeDesktopProjection = computed(() => Boolean(isFolderLayerActive.value || isHomeRevealSettling.value || !isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const shouldSnapDesktopTrack = computed(() => Boolean(isFolderLayerActive.value || isHomeRevealSettling.value || !isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const desktopLayoutEnabled = computed(() => !shouldFreezeDesktopProjection.value);
  const desktopProjectionKeyMode = computed(() => (desktopLayoutEnabled.value ? `enabled-${desktopProjectionEpoch.value}` : "frozen"));
  const activeDesktopTrackTransition = computed(() => (shouldSnapDesktopTrack.value ? instantTrackTransition : desktopTrackTransition));
  const desktopTrackMotionKey = computed(() => `${isDesktopOpen.value ? "open" : "closed"}-${isSearchMode.value ? "search" : "desktop"}-${shouldSnapDesktopTrack.value ? "snap" : "spring"}`);
  const folderTrackAnimate = computed(() => ({ x: `-${folderPageIndex.value * 100}%` }));
  const isDesktopAnimatingClosed = computed(() => Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const shouldHideHomeShell = computed(() => Boolean((openFolderId.value && !isFolderClosing.value) || isDesktopAnimatingClosed.value));
  const isHomeInteractionDisabled = computed(() => Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const rootStyle = computed(() => ({
    "--configured-app-icon-size": `${iconSize.value}px`,
  }));
  const homeShellInitial = { opacity: 0, scale: DESKTOP_CLOSE_SCALE, y: 0, filter: "blur(8px)" };
  const homeShellAnimate = computed(() => {
    if (isDesktopAnimatingClosed.value) return { opacity: 0, scale: DESKTOP_CLOSE_SCALE, y: 0, filter: "blur(8px)" };
    if (openFolderId.value && !isFolderClosing.value) return { opacity: 0, scale: 0.92, y: 44, filter: "blur(6px)" };
    return { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" };
  });
  const homeShellStyle = computed(() => ({
    pointerEvents: shouldHideHomeShell.value || isHomeInteractionDisabled.value ? "none" : "auto",
  }));
  const folderPanelInitial = computed(() => ({
    opacity: 0.92,
    scaleX: folderMotionGeometry.value.scaleX,
    scaleY: folderMotionGeometry.value.scaleY,
    x: folderMotionGeometry.value.x,
    y: folderMotionGeometry.value.y,
    borderRadius: `${folderMotionGeometry.value.borderRadius}px`,
    filter: "blur(0px)",
  }));
  const folderPanelAnimate = computed(() => {
    if (isFolderAppLaunchClosing.value) {
      return { opacity: 0, scaleX: 1.08, scaleY: 1.08, x: 0, y: 0, borderRadius: "46px", filter: "blur(0px)" };
    }
    if (isFolderClosing.value) {
      return {
        opacity: 0,
        scaleX: folderMotionGeometry.value.scaleX,
        scaleY: folderMotionGeometry.value.scaleY,
        x: folderMotionGeometry.value.x,
        y: folderMotionGeometry.value.y,
        borderRadius: `${folderMotionGeometry.value.borderRadius}px`,
        filter: "blur(0px)",
      };
    }
    if (isDesktopAnimatingClosed.value) {
      return { opacity: 0, scaleX: DESKTOP_CLOSE_SCALE, scaleY: DESKTOP_CLOSE_SCALE, x: 0, y: 0, borderRadius: "42px", filter: "blur(8px)" };
    }
    return { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: "42px", filter: "blur(0px)" };
  });
  const folderPanelTransition = computed(() => (
    isDesktopAnimatingClosed.value || (isHomeRevealSettling.value && openFolderId.value && !isFolderClosing.value)
      ? homeShellTransition
      : panelSpring
  ));
  const folderContentInitial = { opacity: 0, scale: 0.94, y: 18 };
  const folderContentAnimate = computed(() => {
    if (isFolderAppLaunchClosing.value) return { opacity: 0, scale: 1.08, y: 0 };
    return isFolderClosing.value
      ? { opacity: 0, scale: 0.96, y: 12 }
      : { opacity: 1, scale: 1, y: 0 };
  });
  const pageGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${gridCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridRows.value}, minmax(0, 1fr))`,
  }));
  const {
    getActivePageGridStyle,
    pageGridMeasureStyle,
    schedulePageGridMetrics,
    updatePageGridMetrics,
  } = usePageGridMetrics({
    desktopMainRef,
    getVisibleDesktopPage,
    gridCols,
    headerRef,
    isSearchMode,
    pageDotsRef,
    pageGridStyle,
    rootRef,
    searchRef,
  });
  let isDragActiveHandler = () => false;
  let getDragMetaHandler = () => null;
  const {
    clearPageJumpRenderRange,
    commitActivePageIndex,
    commitFolderPageIndex,
    commitPageIndex,
    commitSearchPageIndex,
    shouldRenderActivePage,
    shouldRenderFolderPage,
    shouldRenderStaticActivePage,
    shouldRenderStaticFolderPage,
  } = usePageRenderRange({
    activePageIndex,
    folderPageIndex,
    folderPages,
    getDragMeta: () => getDragMetaHandler(),
    isDragActive: () => isDragActiveHandler(),
    isSearchMode,
    pageIndex,
    pages,
    searchPageIndex,
    searchPages,
  });
  commitSearchPageIndexHandler = commitSearchPageIndex;
  let closeAddManagedAppPageHandler = () => {};
  let closeScanResultDialogHandler = () => {};
  const {
    clearSettingsPanelCloseTimer,
    closeSettingsPanel,
    isSettingsPanelOpen,
    openSettingsPanel,
    settingsOverlayAnimate,
    settingsPanelAnimate,
    settingsPanelInitial,
    shouldRenderSettingsPanel,
  } = useSettingsPanelFlow({
    closeAddManagedAppPage: () => closeAddManagedAppPageHandler(),
    closeScanResultDialog: () => closeScanResultDialogHandler(),
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftIconSize,
    folderIconSize,
    folderIconSizeMode,
    iconSize,
    isDragActive: () => isDragActive(),
  });
  const {
    applyGridConfig,
    applySettingsConfig,
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    clampIconSize,
    setDraftFolderIconSizeMode,
  } = useLaunchpadSettingsConfig({
    clonePages,
    closeSettingsPanel,
    commitFolderPageIndex,
    commitPageIndex,
    commitPages,
    commitSearchPageIndex,
    compactPages,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftIconSize,
    draftRows,
    ensurePage,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderPageIndex,
    folderPageSize,
    folderRows,
    gridCols,
    gridRows,
    iconSize,
    isDragActive: () => isDragActive(),
    pageIndex,
    pageSize,
    pages,
    repackFoldersForPageSize,
    schedulePageGridMetrics,
    searchPageIndex,
  });
  const {
    closeLayoutRecoveryNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    layoutRecoveryNotice,
    openWarningDialog,
    warningDialog,
  } = useLaunchpadNotices();
  const {
    clearNativeEventListeners,
    clearNativeSaveTimer,
    hideNativeWindow,
    hideNativeWindowAfterCloseAnimation,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    setNativeWindowEffectsEnabled,
    shouldUseNativeCatalog,
  } = useLaunchpadNative({
    clampIconSize,
    closeDesktop,
    commitFolderPageIndex,
    commitPageIndex,
    commitSearchPageIndex,
    createLayoutSnapshot,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftIconSize,
    draftRows,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderPageIndex,
    folderRows,
    gridCols,
    gridRows,
    focusDesktopSurface,
    handleLayoutRecovered,
    hiddenAppIds,
    iconSize,
    isDesktopOpen,
    isTextlessMode,
    mergeNativeCatalogWithSavedLayout,
    openDesktop,
    openSettingsPanel,
    pageIndex,
    pages,
    schedulePageGridMetrics,
    searchPageIndex,
  });
  dragControls = useLaunchpadDrag({
    canCreateDesktopPageAfterDrag,
    canCreateFolderPageAfterDrag,
    cloneItem,
    clonePages,
    commitFolderPageIndex,
    commitFolderSession,
    commitOpenFolder,
    commitPageIndex,
    commitPages,
    compactPages,
    dragPreviewRef,
    findFolder,
    findInFolder,
    findTopLevel,
    finishHomeRevealSettleWindow,
    folderCols,
    folderPageIndex,
    folderPageRefs,
    folderPages,
    folderPageSize,
    folderPanelRef,
    folderSession,
    getFolderChildPages,
    getPageSlotMotionGeometry,
    getTopLevelIconMotionGeometry,
    gridCols,
    gridRows,
    insertAppIntoFolder,
    insertTopLevelItem,
    isFolderLayerActive,
    isHomeRevealSettling,
    isLaunchpadInteractionBlocked,
    makeId,
    openApp,
    openFolderId,
    pageIndex,
    pageRefs,
    pages,
    pageSize,
    previewAppIntoFolderWithoutOverflow,
    previewTopLevelItemWithoutOverflow,
    removeEverywhere,
    renderedFolder,
    replaceFolderWithItem,
    visibleFolderRowCount,
    withFolderPages,
    wouldFolderInsertOverflow,
    wouldTopLevelInsertOverflow,
  });
  const {
    beginDrag,
    cancelLongPress,
    cancelPreviewRaf,
    clearFolderPageTurn,
    clearPageTurn,
    clearPendingTarget,
    detachDragListeners,
    dragFolderTargetId,
    dragMeta,
    isDragActive,
  } = dragControls;
  isDragActiveHandler = isDragActive;
  getDragMetaHandler = () => dragMeta.value;
  const {
    clearAltEditTimer,
    handleAltKeyDown,
    handleAltKeyUp,
    handleWindowBlur,
    isAltKeyEvent,
    isEditMode,
  } = useAltEditMode({
    isDragActive,
  });
  const {
    addManagedApp,
    addSelectedScannedApps,
    appManagerSearchQuery,
    appManagerSelectedIds,
    browseEditAppLaunchFile,
    browseNewAppLaunchFile,
    canAddManagedApp,
    canAddScannedApps,
    canSaveEditingManagedApp,
    canScanManagedApps,
    chooseIconCandidate,
    clearManagedAppSelection,
    clearScanResultSelection,
    closeAddManagedAppPage,
    closeEditManagedApp,
    closeIconChooser,
    closeScanResultDialog,
    deleteManagedApp,
    deleteSelectedManagedApps,
    editAppArgs,
    editAppIconDataUrl,
    editingManagedApp,
    editAppName,
    editAppTarget,
    filteredManagedApps,
    getLaunchTargetPath,
    handleIconChooserUpload,
    iconChooser,
    iconChoices,
    isAddingManagedApp,
    isBrowsingEditAppTarget,
    isBrowsingNewAppTarget,
    isEditAppIconReset,
    isLoadingIconChoices,
    isScanningApps,
    isScanResultDialogOpen,
    managedApps,
    newAppArgs,
    newAppIconDataUrl,
    newAppName,
    newAppTarget,
    newManagedAppGlyph,
    openAddManagedAppPage,
    openEditAppIconChooser,
    openEditManagedApp,
    openExistingAppIconChooser,
    openNewAppIconChooser,
    rescanManagedApps,
    resetAppCustomIcon,
    resetEditAppIcon,
    resetNewAppIcon,
    saveEditingManagedApp,
    scanResultApps,
    scanResultSelectedCount,
    scanResultSelectedIds,
    selectAllManagedApps,
    selectAllScanResultApps,
    selectedManagedAppCount,
    syncManagedAppState,
    toggleManagedAppSelection,
    toggleScanResultSelection,
    updateAppCustomIcon,
  } = useLaunchpadApps({
    appendAppsToPages,
    cloneItem,
    clonePages,
    collectAppsFromPages,
    commitOpenFolder,
    commitPageIndex,
    commitPages,
    commitSearchPageIndex,
    findFolder,
    hiddenAppIds,
    isDragActive,
    makeId,
    openFolderId,
    pages,
    removeEverywhere,
    renderedFolder,
    schedulePageGridMetrics,
    shouldUseNativeCatalog,
  });
  closeAddManagedAppPageHandler = closeAddManagedAppPage;
  closeScanResultDialogHandler = closeScanResultDialog;
  const {
    handleGlobalKeydown,
    handleLaunchpadWheel,
  } = useLaunchpadKeyboard({
    clearSearch,
    clearSelectedIcon,
    closeDesktop,
    commitFolderPageIndex,
    commitOpenFolder,
    commitPageIndex,
    commitSearchPageIndex,
    finishHomeRevealSettleWindow,
    focusDesktopSurface,
    folderPageIndex,
    folderPages,
    folderPanelRef,
    getCurrentIconScope,
    handleAltKeyDown,
    hideNativeWindowAfterCloseAnimation,
    isAltKeyEvent,
    isAppLaunching,
    isDesktopClosing,
    isDesktopOpen,
    isDragActive,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isHomeRevealSettling,
    isSearchMode,
    keyboardFocusArea,
    moveSelectionByArrow,
    openDesktop,
    openFolderId,
    openSelectedIcon,
    pageIndex,
    pages,
    renderedFolder,
    schedulePageGridMetrics,
    searchInputRef,
    searchPageIndex,
    searchPages,
    searchQuery,
    selectFirstIconInCurrentScope,
    selectedIcon,
    selectionMatchesScope,
  });
  const launchGhostStyle = computed(() => {
    const ghost = launchGhost.value;
    if (!ghost?.rect) return {};
    return {
      left: `${ghost.rect.left}px`,
      top: `${ghost.rect.top}px`,
      width: `${ghost.rect.width}px`,
      height: `${ghost.rect.height}px`,
    };
  });

  function getDesktopGridProjectionKey(pageNumber) {
    return `${isSearchMode.value ? "search" : "desktop"}-grid-${pageNumber}-${desktopProjectionKeyMode.value}`;
  }

  function setPageRef(node, targetPageIndex) {
    if (!node) return;
    pageRefs[targetPageIndex] = node.$el || node;
  }

  function setFolderPageRef(node, targetPageIndex) {
    if (!node) return;
    folderPageRefs[targetPageIndex] = node.$el || node;
  }

  function placementKey(kind) {
    const parts = Array.prototype.slice.call(arguments, 1);
    return `${kind}:${parts.join(":")}`;
  }

  function commitPages(next) {
    const isProduction = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production";
    if (!isProduction && !isDragActive()) assertNoDuplicateItemIds(next);
    pages.value = next;
    if (renderedFolder.value) commitFolderPageIndex(folderPageIndex.value);
  }

  function renameFolder(folderId, name) {
    const nextName = String(name || "").slice(0, 32) || "新文件夹";
    const next = clonePages(pages.value);
    const folder = findFolder(next, folderId);
    if (!folder) return;
    folder.item.name = nextName;
    commitPages(next);
  }

  function forceFillAllPages() {
    if (isDragActive()) return;
    const items = flattenTopLevelPages(pages.value);
    const filled = chunkIntoPages(items, pageSize.value);
    commitPages(compactPages(filled, { folderPageSize: folderPageSize.value }));
    commitPageIndex(0);
    commitSearchPageIndex(0);
    schedulePageGridMetrics();
  }

  function confirmForceFillAllPages() {
    if (typeof window === "undefined") {
      forceFillAllPages();
      return;
    }

    openWarningDialog({
      title: "重新整理桌面页面？",
      message: "这会按当前顺序压实所有桌面页面，可能改变当前分页布局。",
      confirmText: "重新整理",
      cancelText: "取消",
      onConfirm: forceFillAllPages,
    });
  }

  function isLaunchpadInteractionBlocked() {
    return Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || isFolderAppLaunchClosing.value);
  }

  function startAppLaunchGhost(app, launchSource) {
    const rect = getLaunchIconRect(launchSource);
    if (!rect) {
      clearLaunchGhost();
      return;
    }
    clearLaunchGhostTimer();
    launchGhost.value = { app: cloneItem(app), rect };
    launchGhostTimer = window.setTimeout(clearLaunchGhost, APP_LAUNCH_DURATION + 100);
  }

  function clearDesktopCloseTimer() {
    if (desktopCloseTimer) window.clearTimeout(desktopCloseTimer);
    desktopCloseTimer = null;
  }

  function clearAppLaunchTimer() {
    if (appLaunchTimer) window.clearTimeout(appLaunchTimer);
    appLaunchTimer = null;
  }

  function clearLaunchGhostTimer() {
    if (launchGhostTimer) window.clearTimeout(launchGhostTimer);
    launchGhostTimer = null;
  }

  function clearLaunchGhost() {
    clearLaunchGhostTimer();
    launchGhost.value = null;
  }

  function clearFolderAppLaunchTimer() {
    if (folderAppLaunchTimer) window.clearTimeout(folderAppLaunchTimer);
    folderAppLaunchTimer = null;
  }

  function focusDesktopSurface() {
    keyboardFocusArea.value = "desktop";
    const element = getElementFromRef(desktopMainRef);
    element?.focus?.({ preventScroll: true });
  }

  function closeDesktop(options) {
    if (isDragActive()) return;
    cancelLongPress();
    setNativeWindowEffectsEnabled(false);
    const shouldClearSearchAfterClose = Boolean(options?.clearSearch && isSearchMode.value);
    clearSelectedIcon();
    keyboardFocusArea.value = "desktop";
    searchInputRef.value?.blur?.();
    isDesktopClosing.value = true;
    isDesktopOpen.value = false;
    clearDesktopCloseTimer();
    desktopCloseTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterClose) clearSearch({ keepSelection: false });
      isDesktopClosing.value = false;
      clearDesktopCloseTimer();
    }, DESKTOP_CLOSE_DURATION);
  }

  function openDesktop() {
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhost();
    clearOpeningIcon();
    startHomeRevealSettleWindow();
    isDesktopClosing.value = false;
    isAppLaunching.value = false;
    isDesktopOpen.value = true;
    keyboardFocusArea.value = "desktop";
    nextTick(() => {
      schedulePageGridMetrics();
      focusDesktopSurface();
    });
  }

  function startFolderAppLaunchClose() {
    if (!renderedFolder.value || isFolderAppLaunchClosing.value) return;
    const closingId = renderedFolderId.value || openFolderId.value || renderedFolder.value.id;
    const current = closingId ? findFolder(pages.value, closingId)?.item : null;
    folderClosingSnapshot.value = current ? cloneItem(current) : cloneItem(renderedFolder.value);
    openFolderId.value = null;
    isFolderClosing.value = false;
    isFolderAppLaunchClosing.value = true;
    clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    folderAppLaunchTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderAppLaunchClosing.value = false;
      folderPageIndex.value = 0;
      folderPageRefs.length = 0;
      clearFolderAppLaunchTimer();
    }, FOLDER_APP_LAUNCH_DURATION);
  }

  function openApp(app, source) {
    if (!app || app.type !== "app" || isDragActive() || isLaunchpadInteractionBlocked()) return;

    const launchSource = normalizeLaunchSource(app, source);
    const shouldClearSearchAfterLaunch = isSearchMode.value;
    startAppLaunchGhost(app, launchSource);
    openingIcon.value = launchSource;
    isAppLaunching.value = true;

    if (renderedFolder.value || openFolderId.value) startFolderAppLaunchClose();
    closeDesktop({ clearSearch: false });
    window.setTimeout(() => {
      launchNativeAppIfAvailable(app);
    }, 0);

    clearAppLaunchTimer();
    appLaunchTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterLaunch) clearSearch({ keepSelection: false });
      clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
      hideNativeWindow();
    }, APP_LAUNCH_DURATION);
  }

  function removeAppById(appId) {
    if (!appId || isDragActive()) return;
    cancelLongPress();
    const openedFolderId = openFolderId.value;
    const next = removeEverywhere(pages.value, appId);
    commitPages(next);
    if (openedFolderId && !findFolder(next, openedFolderId)) commitOpenFolder(null);
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
  }

  function clearFolderCloseTimer() {
    if (folderCloseTimer) window.clearTimeout(folderCloseTimer);
    folderCloseTimer = null;
  }

  function clearHomeRevealSettleTimer() {
    if (homeRevealSettleTimer) window.clearTimeout(homeRevealSettleTimer);
    homeRevealSettleTimer = null;
  }

  function finishHomeRevealSettleWindow() {
    clearHomeRevealSettleTimer();
    if (!isHomeRevealSettling.value) return;
    desktopProjectionEpoch.value += 1;
    isHomeRevealSettling.value = false;
    pageRefs.length = 0;
  }

  function startHomeRevealSettleWindow() {
    clearHomeRevealSettleTimer();
    isHomeRevealSettling.value = true;
    homeRevealSettleTimer = window.setTimeout(finishHomeRevealSettleWindow, HOME_REVEAL_SETTLE_DURATION);
  }

  function commitOpenFolder(next, options) {
    if (next) {
      const isSameFolder = openFolderId.value === next && renderedFolderId.value === next;
      const originGeometry = options?.originGeometry;
      clearFolderCloseTimer();
      clearFolderAppLaunchTimer();
      finishHomeRevealSettleWindow();
      isFolderClosing.value = false;
      isFolderAppLaunchClosing.value = false;
      folderClosingSnapshot.value = null;
      folderMotionGeometry.value = originGeometry ? { ...originGeometry, id: next } : getFolderIconMotionGeometry(next);
      openFolderId.value = next;
      renderedFolderId.value = next;
      if (!isSameFolder) folderPageIndex.value = 0;
      return;
    }

    const closingId = renderedFolderId.value || openFolderId.value;
    const current = closingId ? findFolder(pages.value, closingId)?.item : null;
    const fallback = renderedFolder.value;
    folderClosingSnapshot.value = current ? cloneItem(current) : fallback ? cloneItem(fallback) : null;
    if (!folderMotionGeometry.value?.id || folderMotionGeometry.value.id !== closingId) {
      folderMotionGeometry.value = getFolderIconMotionGeometry(closingId);
    }
    openFolderId.value = null;
    isFolderClosing.value = true;
    startHomeRevealSettleWindow();
    clearFolderPageTurn();
    clearFolderCloseTimer();
    folderCloseTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderClosing.value = false;
      folderPageIndex.value = 0;
      folderPageRefs.length = 0;
      clearFolderCloseTimer();
    }, FOLDER_CLOSE_DURATION);
  }

  function commitFolderSession(next) {
    folderSession.value = next;
  }

  function handleDesktopSurfacePointerDown(event) {
    if (event?.button !== 0) return;
    if (!isDesktopOpen.value || isDragActive() || isAppLaunching.value) return;

    const target = event.target;
    if (target?.closest?.([
      ".icon-hit-target",
      ".page-dot",
      ".search-pill",
      ".settings-overlay",
      ".scan-result-overlay",
      ".app-edit-overlay",
      ".icon-chooser-overlay",
      ".warning-dialog-overlay",
      ".folder-overlay",
      ".icon-context-menu-layer",
      "button",
      "input",
      "textarea",
      "select",
    ].join(", "))) {
      return;
    }

    closeDesktop({ clearSearch: true });
    hideNativeWindowAfterCloseAnimation();
  }

  function handleFolderOverlayPointerDown() {
    if (!isDragActive()) commitOpenFolder(null);
  }

  watch([gridRows, gridCols, folderRows, folderCols, iconSize, isTextlessMode, isSearchMode], schedulePageGridMetrics, { flush: "post" });
  watch([renderedFolder, folderRows, folderCols, effectiveFolderIconSize, isTextlessMode, visibleFolderRowCount], scheduleFolderViewportMetrics, { flush: "post" });
  watch(folderViewportRef, observeFolderViewport, { flush: "post" });
  watch(activePages, schedulePageGridMetrics, { flush: "post" });
  watch([pages, gridRows, gridCols, folderRows, folderCols, iconSize, folderIconSizeMode, folderIconSize, isTextlessMode, hiddenAppIds], scheduleNativeLayoutSave, { flush: "post" });
  watch(filteredManagedApps, syncManagedAppState, { flush: "post" });

  onMounted(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keyup", handleAltKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", updatePageGridMetrics);
    window.addEventListener("resize", updateFolderViewportHeight);
    schedulePageGridMetrics();
    scheduleFolderViewportMetrics();
    registerNativeEventListeners().finally(loadNativeLaunchpadData);

    if (typeof ResizeObserver !== "undefined") {
      layoutResizeObserver = new ResizeObserver(updatePageGridMetrics);
      [rootRef, headerRef, searchRef, desktopMainRef, pageDotsRef].forEach((nodeRef) => {
        const element = getElementFromRef(nodeRef);
        if (element) layoutResizeObserver.observe(element);
      });
    }

  });

  onBeforeUnmount(() => {
    detachDragListeners();
    cancelPreviewRaf();
    clearPendingTarget();
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    clearSettingsPanelCloseTimer();
    clearHomeRevealSettleTimer();
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhostTimer();
    clearPageJumpRenderRange();
    clearNativeSaveTimer();
    clearNativeEventListeners();
    cancelLongPress();
    clearAltEditTimer();
    if (layoutResizeObserver) layoutResizeObserver.disconnect();
    layoutResizeObserver = null;
    disconnectFolderViewportObserver();
    window.removeEventListener("keydown", handleGlobalKeydown);
    window.removeEventListener("keyup", handleAltKeyUp);
    window.removeEventListener("blur", handleWindowBlur);
    window.removeEventListener("resize", updatePageGridMetrics);
    window.removeEventListener("resize", updateFolderViewportHeight);
  });

  return {
    rootRef,
    rootStyle,
    cx,
    isTextlessMode,
    isDesktopOpen,
    isHomeInteractionDisabled,
    isAppLaunching,
    isEditMode,
    isSettingsPanelOpen,
    shouldRenderSettingsPanel,
    settingsOverlayAnimate,
    settingsPanelInitial,
    settingsPanelAnimate,
    handleLaunchpadWheel,
    shellRef,
    homeShellInitial,
    homeShellAnimate,
    homeShellTransition,
    homeShellStyle,
    headerRef,
    draftRows,
    draftCols,
    draftFolderRows,
    draftFolderCols,
    draftIconSize,
    draftFolderIconSizeMode,
    draftFolderIconSize,
    changeDraftRows,
    changeDraftCols,
    changeDraftFolderRows,
    changeDraftFolderCols,
    changeDraftIconSize,
    changeDraftFolderIconSize,
    setDraftFolderIconSizeMode,
    managedApps,
    filteredManagedApps,
    appManagerSelectedIds,
    appManagerSearchQuery,
    isScanResultDialogOpen,
    scanResultApps,
    scanResultSelectedIds,
    scanResultSelectedCount,
    canAddScannedApps,
    isAddingManagedApp,
    selectedManagedAppCount,
    newAppName,
    newAppTarget,
    newAppArgs,
    newAppIconDataUrl,
    isBrowsingNewAppTarget,
    newManagedAppGlyph,
    editingManagedApp,
    editAppName,
    editAppTarget,
    editAppArgs,
    editAppIconDataUrl,
    isEditAppIconReset,
    isBrowsingEditAppTarget,
    isScanningApps,
    canAddManagedApp,
    canSaveEditingManagedApp,
    canScanManagedApps,
    getLaunchTargetPath,
    toggleManagedAppSelection,
    selectAllManagedApps,
    clearManagedAppSelection,
    toggleScanResultSelection,
    selectAllScanResultApps,
    clearScanResultSelection,
    closeScanResultDialog,
    addSelectedScannedApps,
    openAddManagedAppPage,
    closeAddManagedAppPage,
    openNewAppIconChooser,
    resetNewAppIcon,
    browseNewAppLaunchFile,
    openEditManagedApp,
    closeEditManagedApp,
    openEditAppIconChooser,
    resetEditAppIcon,
    browseEditAppLaunchFile,
    iconChooser,
    iconChoices,
    isLoadingIconChoices,
    closeIconChooser,
    chooseIconCandidate,
    handleIconChooserUpload,
    openExistingAppIconChooser,
    saveEditingManagedApp,
    deleteManagedApp,
    confirmForceFillAllPages,
    warningDialog,
    closeWarningDialog,
    confirmWarningDialog,
    layoutRecoveryNotice,
    closeLayoutRecoveryNotice,
    rescanManagedApps,
    addManagedApp,
    deleteSelectedManagedApps,
    dragFolderTargetId,
    dragMeta,
    applyGridConfig,
    applySettingsConfig,
    openSettingsPanel,
    closeSettingsPanel,
    searchRef,
    isSearchMode,
    searchInputRef,
    searchQuery,
    handleSearchInput,
    keyboardFocusArea,
    clearSearch,
    desktopMainRef,
    handleDesktopSurfacePointerDown,
    activePageIndex,
    activePages,
    shouldRenderActivePage,
    shouldRenderStaticActivePage,
    shouldRenderFolderPage,
    shouldRenderStaticFolderPage,
    commitActivePageIndex,
    desktopTrackMotionKey,
    activeDesktopTrackAnimate,
    activeDesktopTrackTransition,
    getDesktopGridProjectionKey,
    setPageRef,
    desktopLayoutEnabled,
    getActivePageGridStyle,
    pageGridMeasureStyle,
    getVisibleDesktopPage,
    folderPageSize,
    isIconSelected,
    isIconOpening,
    beginDrag,
    openApp,
    removeAppById,
    updateAppCustomIcon,
    resetAppCustomIcon,
    layoutSpring,
    pageDotsRef,
    renderedFolder,
    isFolderClosing,
    isFolderAppLaunchClosing,
    handleFolderOverlayPointerDown,
    folderPanelRef,
    folderViewportRef,
    folderPanelInitial,
    folderPanelAnimate,
    folderPanelTransition,
    panelSpring,
    folderPanelStyle,
    folderContentInitial,
    folderContentAnimate,
    folderContentTransition,
    renameFolder,
    folderPageIndex,
    folderPages,
    folderTrackAnimate,
    desktopTrackTransition,
    setFolderPageRef,
    folderGridStyle,
    getVisibleFolderPage,
    commitFolderPageIndex,
    launchGhost,
    appLaunchGhostTransition,
    launchGhostStyle,
    dragPreviewRef,
    dragPreviewSpring,
    folderPreviewSlots,
  };
}
