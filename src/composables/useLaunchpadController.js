import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { appSeeds } from "../mocks/appSeeds.js";
import {
  ALT_EDIT_DELAY,
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
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
  ICON_SIZE_STEP,
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
  clamp,
  createLaunchpadLayoutHelpers,
  cx,
  makePageSize,
} from "../domain/launchpadLayout.js";
import { createLaunchpadDataHelpers } from "../domain/launchpadData.js";
import { useLaunchpadApps } from "./useLaunchpadApps.js";
import { useLaunchpadDrag } from "./useLaunchpadDrag.js";
import { useIconSelection } from "./useIconSelection.js";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";
import { getElementFromRef, usePageGridMetrics } from "./usePageGridMetrics.js";
import { useSettingsPanelFlow } from "./useSettingsPanelFlow.js";

const PAGE_JUMP_RENDER_RELEASE_DELAY = 900;
const FOLDER_ROW_GAP = 24;
const FOLDER_MIN_ROW_GAP = 10;
const FOLDER_SELECTION_FRAME_SAFE_AREA = 24;
const FOLDER_MIN_EFFECTIVE_ICON_SIZE = 20;
const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";

function roundPx(value) {
  return Math.round(value * 100) / 100;
}

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
  const searchQuery = ref("");
  const searchPageIndex = ref(0);
  const isDesktopOpen = ref(true);
  const isDesktopClosing = ref(false);
  const isAppLaunching = ref(false);
  const isFolderAppLaunchClosing = ref(false);
  const isEditMode = ref(false);
  const isTextlessMode = ref(false);
  const warningDialog = shallowRef(null);
  const layoutRecoveryNotice = shallowRef(null);
  const hiddenAppIds = ref([]);
  const keyboardFocusArea = ref("desktop");
  const launchGhost = shallowRef(null);
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const folderPageIndex = ref(0);
  const isFolderClosing = ref(false);
  const folderClosingSnapshot = shallowRef(null);
  const folderMotionGeometry = ref({ id: null, x: 0, y: 36, scaleX: 0.1, scaleY: 0.16, borderRadius: 26 });
  const folderSession = shallowRef(null);
  const folderViewportHeight = ref(0);
  const isHomeRevealSettling = ref(false);
  const desktopProjectionEpoch = ref(0);
  const transientPageRenderRange = ref(null);

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
  let altEditTimer = null;
  let pageJumpRenderTimer = null;
  let pageJumpRenderRequestId = 0;
  let isAltPressed = false;
  let layoutResizeObserver = null;
  let folderViewportResizeObserver = null;
  let observedFolderViewportElement = null;
  let dragControls = null;

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
  } = useIconSelection({ getCurrentIconScope });

  const renderedFolder = computed(() => {
    if (!renderedFolderId.value) return folderClosingSnapshot.value;
    return findFolder(pages.value, renderedFolderId.value)?.item || folderClosingSnapshot.value;
  });

  const folderPages = computed(() => {
    if (!renderedFolder.value) return [];
    const minPageCount = dragControls?.isDragActive() && openFolderId.value === renderedFolder.value.id ? folderPageIndex.value + 1 : 1;
    return getVisibleFolderPages(renderedFolder.value, folderPageSize.value, minPageCount);
  });
  const visibleFolderRowCount = computed(() => {
    const columnCount = Math.max(1, folderCols.value);
    const maxRowCount = folderPages.value.reduce((maxRows, page) => {
      const visibleCount = getVisibleFolderPage(page).length;
      return Math.max(maxRows, Math.ceil(visibleCount / columnCount) || 1);
    }, 1);
    return clamp(maxRowCount, 1, folderRows.value);
  });
  const effectiveFolderIconSize = computed(() =>
    folderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_CUSTOM ? folderIconSize.value : iconSize.value
  );
  const folderGridHeight = computed(() => {
    const iconCellHeight = effectiveFolderIconSize.value + (isTextlessMode.value ? 12 : 56);
    const selectionFrameSafeArea = isTextlessMode.value ? 0 : FOLDER_SELECTION_FRAME_SAFE_AREA;
    return visibleFolderRowCount.value * iconCellHeight
      + Math.max(0, visibleFolderRowCount.value - 1) * FOLDER_ROW_GAP
      + selectionFrameSafeArea;
  });
  const folderShellMinHeight = computed(() => {
    return folderGridHeight.value + 120;
  });
  const folderCompressionMetrics = computed(() => {
    const rowCount = Math.max(1, visibleFolderRowCount.value);
    const baseFolderIconSize = effectiveFolderIconSize.value;
    const idealIconCellHeight = baseFolderIconSize + (isTextlessMode.value ? 12 : 56);
    const idealSafeArea = isTextlessMode.value ? 0 : FOLDER_SELECTION_FRAME_SAFE_AREA;
    const idealHeight = Math.max(1, folderGridHeight.value);
    const availableHeight = Math.max(1, folderViewportHeight.value || idealHeight);
    const coarseScale = clamp(availableHeight / idealHeight, 0, 1);
    const rowGap = roundPx(clamp(FOLDER_ROW_GAP * coarseScale, FOLDER_MIN_ROW_GAP, FOLDER_ROW_GAP));
    const safeArea = roundPx(idealSafeArea * coarseScale);
    const gapTotal = Math.max(0, rowCount - 1) * rowGap;
    const rowHeight = Math.max(0, (availableHeight - gapTotal - safeArea) / rowCount);
    const minIconScale = Math.min(1, FOLDER_MIN_EFFECTIVE_ICON_SIZE / Math.max(1, baseFolderIconSize));
    const contentScale = clamp(rowHeight / Math.max(1, idealIconCellHeight), minIconScale, 1);
    const effectiveIconSize = roundPx(baseFolderIconSize * contentScale);

    return {
      effectiveIconSize,
      iconNameFontSize: roundPx(clamp(13 * contentScale, 10, 13)),
      iconNameLineClamp: contentScale < 0.78 ? 1 : 2,
      iconNameMarginTop: roundPx(clamp(8 * contentScale, 2, 8)),
      iconNamePaddingX: roundPx(clamp(8 * contentScale, 4, 8)),
      iconNamePaddingY: roundPx(clamp(2 * contentScale, 0, 2)),
      rowGap,
      safeArea,
      selectionFrameMinWidthExtra: roundPx(clamp(44 * contentScale, 20, 44)),
      selectionFramePaddingX: roundPx(clamp(12 * contentScale, 6, 12)),
      selectionFramePaddingY: roundPx(clamp(10 * contentScale, 4, 10)),
    };
  });

  const isSearchMode = computed(() => searchQuery.value.trim().length > 0);
  const searchApps = computed(() => filterAppsForSearch(collectAppsFromPages(pages.value), searchQuery.value));
  const searchPages = computed(() => chunkIntoPages(searchApps.value, pageSize.value));
  const activePages = computed(() => (isSearchMode.value ? searchPages.value : pages.value));
  const activePageIndex = computed(() => (isSearchMode.value ? searchPageIndex.value : pageIndex.value));

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
  const folderPanelStyle = computed(() => ({
    "--folder-grid-height": `${folderGridHeight.value}px`,
    "--folder-shell-min-height": `${folderShellMinHeight.value}px`,
    "--folder-icon-name-font-size": `${folderCompressionMetrics.value.iconNameFontSize}px`,
    "--folder-icon-name-line-clamp": folderCompressionMetrics.value.iconNameLineClamp,
    "--folder-icon-name-margin-top": `${folderCompressionMetrics.value.iconNameMarginTop}px`,
    "--folder-icon-name-padding-x": `${folderCompressionMetrics.value.iconNamePaddingX}px`,
    "--folder-icon-name-padding-y": `${folderCompressionMetrics.value.iconNamePaddingY}px`,
    "--folder-icon-size": `${folderCompressionMetrics.value.effectiveIconSize}px`,
    "--folder-row-gap": `${folderCompressionMetrics.value.rowGap}px`,
    "--folder-selection-frame-min-width": `calc(var(--folder-icon-size) + ${folderCompressionMetrics.value.selectionFrameMinWidthExtra}px)`,
    "--folder-selection-frame-padding-x": `${folderCompressionMetrics.value.selectionFramePaddingX}px`,
    "--folder-selection-frame-padding-y": `${folderCompressionMetrics.value.selectionFramePaddingY}px`,
    "--folder-selection-frame-safe-area": `${folderCompressionMetrics.value.safeArea}px`,
    transformOrigin: "center center",
    pointerEvents: isFolderAppLaunchClosing.value ? "none" : "auto",
  }));
  const pageGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${gridCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridRows.value}, minmax(0, 1fr))`,
  }));
  const folderGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${folderCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${visibleFolderRowCount.value}, minmax(0, 1fr))`,
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

  function clampIconSize(value) {
    return clamp(Number(value) || DEFAULT_ICON_SIZE, ICON_SIZE_MIN, ICON_SIZE_MAX);
  }

  function normalizeFolderIconSizeMode(value) {
    return value === FOLDER_ICON_SIZE_MODE_CUSTOM ? FOLDER_ICON_SIZE_MODE_CUSTOM : FOLDER_ICON_SIZE_MODE_GLOBAL;
  }

  function changeDraftRows(delta) {
    draftRows.value = clamp(Number(draftRows.value) + delta || DEFAULT_ROWS, 2, 8);
  }

  function changeDraftCols(delta) {
    draftCols.value = clamp(Number(draftCols.value) + delta || DEFAULT_COLS, 3, 10);
  }

  function changeDraftFolderRows(delta) {
    draftFolderRows.value = clamp(Number(draftFolderRows.value) + delta || DEFAULT_FOLDER_ROWS, 2, 6);
  }

  function changeDraftFolderCols(delta) {
    draftFolderCols.value = clamp(Number(draftFolderCols.value) + delta || DEFAULT_FOLDER_COLS, 2, 8);
  }

  function changeDraftIconSize(direction) {
    draftIconSize.value = clampIconSize(draftIconSize.value + direction * ICON_SIZE_STEP);
  }

  function changeDraftFolderIconSize(direction) {
    draftFolderIconSize.value = clampIconSize(draftFolderIconSize.value + direction * ICON_SIZE_STEP);
  }

  function setDraftFolderIconSizeMode(mode) {
    const nextMode = normalizeFolderIconSizeMode(mode);
    if (
      nextMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      && draftFolderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
      && folderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
    ) {
      draftFolderIconSize.value = clampIconSize(draftIconSize.value);
    }
    draftFolderIconSizeMode.value = nextMode;
    draftFolderIconSize.value = clampIconSize(draftFolderIconSize.value);
  }

  function openWarningDialog(config) {
    warningDialog.value = config;
  }

  function closeWarningDialog() {
    warningDialog.value = null;
  }

  function confirmWarningDialog() {
    const action = warningDialog.value?.onConfirm;
    closeWarningDialog();
    action?.();
  }

  function handleLayoutRecovered(event) {
    const payload = event?.payload || {};
    layoutRecoveryNotice.value = {
      title: "布局已恢复",
      message: "检测到布局文件损坏，已备份原文件并恢复默认布局。",
      backupPath: payload.backupPath || payload.backup_path || "",
    };
  }

  function closeLayoutRecoveryNotice() {
    layoutRecoveryNotice.value = null;
  }

  function getDesktopGridProjectionKey(pageNumber) {
    return `${isSearchMode.value ? "search" : "desktop"}-grid-${pageNumber}-${desktopProjectionKeyMode.value}`;
  }

  function shouldRenderActivePage(pageNumber) {
    const distance = Math.abs(pageNumber - activePageIndex.value);
    if (dragMeta.value) return distance <= 1;

    const transientRange = transientPageRenderRange.value;
    const activeMode = isSearchMode.value ? "search" : "desktop";
    if (transientRange?.mode === activeMode) {
      return Math.abs(pageNumber - transientRange.from) <= 1 || Math.abs(pageNumber - transientRange.to) <= 1;
    }

    return distance <= 1;
  }

  function shouldRenderStaticActivePage(pageNumber) {
    if (dragMeta.value || shouldRenderActivePage(pageNumber)) return false;

    const transientRange = transientPageRenderRange.value;
    const activeMode = isSearchMode.value ? "search" : "desktop";
    if (transientRange?.mode === activeMode && pageNumber >= transientRange.from && pageNumber <= transientRange.to) return true;

    return false;
  }

  function shouldRenderFolderPage(pageNumber) {
    const distance = Math.abs(pageNumber - folderPageIndex.value);
    if (dragMeta.value) return distance <= 1;

    const transientRange = transientPageRenderRange.value;
    if (transientRange?.mode === "folder") {
      return Math.abs(pageNumber - transientRange.from) <= 1 || Math.abs(pageNumber - transientRange.to) <= 1;
    }

    return distance <= 1;
  }

  function shouldRenderStaticFolderPage(pageNumber) {
    if (dragMeta.value || shouldRenderFolderPage(pageNumber)) return false;

    const transientRange = transientPageRenderRange.value;
    if (transientRange?.mode === "folder" && pageNumber >= transientRange.from && pageNumber <= transientRange.to) return true;

    return false;
  }

  function clearPageJumpRenderRange() {
    pageJumpRenderRequestId += 1;
    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = null;
    transientPageRenderRange.value = null;
  }

  function schedulePageJumpRenderRelease() {
    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = window.setTimeout(() => {
      pageJumpRenderTimer = null;
      transientPageRenderRange.value = null;
    }, PAGE_JUMP_RENDER_RELEASE_DELAY);
  }

  function requestAnimationFrameOnce(callback) {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback();
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function commitPageIndexNow(next) {
    pageIndex.value = clamp(next, 0, Math.max(0, pages.value.length - 1));
  }

  function commitSearchPageIndexNow(next) {
    searchPageIndex.value = clamp(next, 0, Math.max(0, searchPages.value.length - 1));
  }

  function commitFolderPageIndexNow(next, maxIndex) {
    folderPageIndex.value = clamp(next, 0, maxIndex);
  }

  function commitPageIndexWithRenderRange(mode, current, requested, maxIndex, commitNow) {
    const next = clamp(requested, 0, maxIndex);
    const distance = Math.abs(next - current);
    if (distance <= 1 || isDragActive() || current < 0 || current > maxIndex) {
      clearPageJumpRenderRange();
      commitNow(next);
      return;
    }

    if (pageJumpRenderTimer) window.clearTimeout(pageJumpRenderTimer);
    pageJumpRenderTimer = null;
    const requestId = (pageJumpRenderRequestId += 1);
    transientPageRenderRange.value = {
      mode,
      from: Math.min(current, next),
      to: Math.max(current, next),
    };

    nextTick(() => {
      if (requestId !== pageJumpRenderRequestId) return;
      if (!transientPageRenderRange.value || transientPageRenderRange.value.mode !== mode) return;
      requestAnimationFrameOnce(() => {
        if (requestId !== pageJumpRenderRequestId) return;
        const range = transientPageRenderRange.value;
        if (!range || range.mode !== mode || next < range.from || next > range.to) return;
        commitNow(next);
        schedulePageJumpRenderRelease();
      });
    });
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

  function commitPageIndex(next) {
    commitPageIndexWithRenderRange("desktop", pageIndex.value, next, Math.max(0, pages.value.length - 1), commitPageIndexNow);
  }

  function commitSearchPageIndex(next) {
    commitPageIndexWithRenderRange("search", searchPageIndex.value, next, Math.max(0, searchPages.value.length - 1), commitSearchPageIndexNow);
  }

  function commitActivePageIndex(next) {
    if (isSearchMode.value) commitSearchPageIndex(next);
    else commitPageIndex(next);
  }

  function commitFolderPageIndex(next, options) {
    const allowCreate = Boolean(options?.allowCreate);
    const maxIndex = Math.max(0, folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    commitPageIndexWithRenderRange("folder", folderPageIndex.value, next, maxIndex, (value) => commitFolderPageIndexNow(value, maxIndex));
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

  function repackPagesForGrid(nextRows, nextCols, nextFolderRows, nextFolderCols) {
    if (isDragActive()) return;
    const rows = clamp(Number(nextRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(nextCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRowCount = clamp(Number(nextFolderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderColumnCount = clamp(Number(nextFolderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const newPageSize = makePageSize(rows, cols);
    const oldPageSize = pageSize.value;
    const oldFolderPageSize = folderPageSize.value;
    const newFolderPageSize = makePageSize(nextFolderRowCount, nextFolderColumnCount);

    let next = clonePages(pages.value);

    if (newPageSize < oldPageSize) {
      for (let i = 0; i < next.length; i++) {
        while (next[i].length > newPageSize) {
          const overflow = next[i].pop();
          ensurePage(next, i + 1);
          next[i + 1].unshift(overflow);
        }
      }
    }

    next = repackFoldersForPageSize(next, oldFolderPageSize, newFolderPageSize);
    const compacted = compactPages(next, { folderPageSize: newFolderPageSize });

    gridRows.value = rows;
    gridCols.value = cols;
    folderRows.value = nextFolderRowCount;
    folderCols.value = nextFolderColumnCount;
    iconSize.value = clampIconSize(draftIconSize.value);
    folderIconSizeMode.value = normalizeFolderIconSizeMode(draftFolderIconSizeMode.value);
    folderIconSize.value = clampIconSize(draftFolderIconSize.value);
    draftRows.value = rows;
    draftCols.value = cols;
    draftFolderRows.value = nextFolderRowCount;
    draftFolderCols.value = nextFolderColumnCount;
    draftIconSize.value = iconSize.value;
    draftFolderIconSizeMode.value = folderIconSizeMode.value;
    draftFolderIconSize.value = folderIconSize.value;
    commitPages(compacted);
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
    commitFolderPageIndex(folderPageIndex.value);
  }

  function applyGridConfig() {
    repackPagesForGrid(draftRows.value, draftCols.value, draftFolderRows.value, draftFolderCols.value);
    schedulePageGridMetrics();
  }

  function applySettingsConfig() {
    applyGridConfig();
    closeSettingsPanel();
  }

  function handleSearchInput(event) {
    const nextQuery = event?.target?.value || "";
    searchQuery.value = nextQuery;
    commitSearchPageIndex(0);
    if (nextQuery.trim() && !isDragActive() && openFolderId.value) commitOpenFolder(null);
    if (nextQuery.trim()) nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    else clearSelectedIcon();
    schedulePageGridMetrics();
  }

  function clearSearch(options) {
    searchQuery.value = "";
    commitSearchPageIndex(0);
    if (options?.selectFirst) nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    else if (!options?.keepSelection) clearSelectedIcon();
    schedulePageGridMetrics();
  }

  function getCurrentIconScope() {
    if (renderedFolder.value && (openFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value)) {
      const pageNumber = clamp(folderPageIndex.value, 0, Math.max(0, folderPages.value.length - 1));
      return {
        area: "folder",
        pageIndex: pageNumber,
        folderId: renderedFolder.value.id,
        items: getVisibleFolderPage(folderPages.value[pageNumber] || []),
        columns: folderCols.value,
      };
    }

    if (isSearchMode.value) {
      const pageNumber = clamp(searchPageIndex.value, 0, Math.max(0, searchPages.value.length - 1));
      return {
        area: "search",
        pageIndex: pageNumber,
        folderId: null,
        items: getVisibleDesktopPage(searchPages.value[pageNumber] || []),
        columns: gridCols.value,
      };
    }

    const pageNumber = clamp(pageIndex.value, 0, Math.max(0, pages.value.length - 1));
    return {
      area: "desktop",
      pageIndex: pageNumber,
      folderId: null,
      items: getVisibleDesktopPage(pages.value[pageNumber] || []),
      columns: gridCols.value,
    };
  }

  function isLaunchpadInteractionBlocked() {
    return Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || isFolderAppLaunchClosing.value);
  }

  function openSelectedIcon() {
    const selected = findSelectedItem();
    if (!selected) {
      selectFirstIconInCurrentScope({ force: true });
      return;
    }

    if (selected.item.type === "folder" && selected.scope.area === "desktop") {
      commitOpenFolder(selected.item.id);
      clearSelectedIcon();
      return;
    }

    if (selected.item.type === "app") {
      const source =
        selected.scope.area === "folder"
          ? { type: "folder", folderId: selected.scope.folderId, pageIndex: selected.scope.pageIndex }
          : { type: selected.scope.area === "search" ? "search" : "page", pageIndex: selected.scope.pageIndex };
      openApp(selected.item, source);
    }
  }

  function normalizeLaunchSource(app, source) {
    if (source?.type === "folder") {
      return { area: "folder", id: app.id, pageIndex: source.pageIndex ?? 0, folderId: source.folderId || renderedFolder.value?.id || null };
    }
    if (source?.type === "search") {
      return { area: "search", id: app.id, pageIndex: source.pageIndex ?? searchPageIndex.value, folderId: null };
    }
    if (source?.type === "page") {
      return { area: "desktop", id: app.id, pageIndex: source.pageIndex ?? pageIndex.value, folderId: null };
    }

    const selected = selectedIcon.value;
    if (selected?.id === app.id) return { ...selected };

    if (renderedFolder.value) {
      const inFolder = findInFolder(pages.value, renderedFolder.value.id, app.id);
      if (inFolder) return { area: "folder", id: app.id, pageIndex: inFolder.pageIndex, folderId: renderedFolder.value.id };
    }

    if (isSearchMode.value) {
      for (let currentPage = 0; currentPage < searchPages.value.length; currentPage += 1) {
        if ((searchPages.value[currentPage] || []).some((item) => item.id === app.id)) {
          return { area: "search", id: app.id, pageIndex: currentPage, folderId: null };
        }
      }
    }

    const topLevel = findTopLevel(pages.value, app.id);
    if (topLevel) return { area: "desktop", id: app.id, pageIndex: topLevel.pageIndex, folderId: null };
    return { area: "desktop", id: app.id, pageIndex: pageIndex.value, folderId: null };
  }

  function makeLaunchIconSelector(launchSource) {
    if (!launchSource?.id) return null;
    const id = escapeAttributeValue(launchSource.id);
    const area = escapeAttributeValue(launchSource.area);
    const page = Number.isFinite(Number(launchSource.pageIndex)) ? Number(launchSource.pageIndex) : 0;
    let selector = `.icon-hit-target[data-launch-item-id="${id}"][data-launch-area="${area}"][data-launch-page-index="${page}"]`;
    if (launchSource.area === "folder" && launchSource.folderId) {
      selector += `[data-launch-folder-id="${escapeAttributeValue(launchSource.folderId)}"]`;
    }
    return `${selector} .icon-box`;
  }

  function getLaunchIconRect(launchSource) {
    if (typeof document === "undefined") return null;
    const selector = makeLaunchIconSelector(launchSource);
    const node = selector ? document.querySelector(selector) : null;
    const rect = node?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
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

  function escapeAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function getFolderPanelTargetSize() {
    if (typeof window === "undefined") return { width: 760, height: 420 };
    const width = Math.min(760, window.innerWidth * 0.94);
    const hasFolderDots = folderPages.value.length > 1;
    const estimatedContentHeight = 28 * 2 + 62 + 18 + 268 + (hasFolderDots ? 26 : 0);
    const height = Math.min(Math.max(360, estimatedContentHeight), Math.max(280, window.innerHeight - 48));
    return { width, height };
  }

  function getFallbackFolderMotionGeometry(folderId) {
    return { id: folderId || null, x: 0, y: 36, scaleX: 0.1, scaleY: 0.16, borderRadius: 26 };
  }

  function makeFolderMotionGeometryFromRect(folderId, rect) {
    if (!rect || typeof window === "undefined") return getFallbackFolderMotionGeometry(folderId);
    const target = getFolderPanelTargetSize();
    return {
      id: folderId || null,
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top + rect.height / 2 - window.innerHeight / 2,
      scaleX: clamp(rect.width / target.width, 0.06, 0.3),
      scaleY: clamp(rect.height / target.height, 0.08, 0.32),
      borderRadius: Math.min(30, rect.width * 0.38),
    };
  }

  function getTopLevelIconMotionGeometry(sourceItemId, motionId) {
    const safeId = escapeAttributeValue(sourceItemId);
    const node = safeId ? document.querySelector(`[data-top-item-id="${safeId}"] .icon-box`) : null;
    const rect = node?.getBoundingClientRect();
    return rect ? makeFolderMotionGeometryFromRect(motionId || sourceItemId, rect) : null;
  }

  function getPageSlotMotionGeometry(folderId, targetPageIndex, targetIndex) {
    if (typeof window === "undefined") return null;
    const page = pageRefs[targetPageIndex];
    const rect = page?.getBoundingClientRect?.();
    if (!rect) return null;

    const col = clamp(targetIndex % gridCols.value, 0, Math.max(0, gridCols.value - 1));
    const row = clamp(Math.floor(targetIndex / gridCols.value), 0, Math.max(0, gridRows.value - 1));
    const cellWidth = rect.width / Math.max(1, gridCols.value);
    const cellHeight = rect.height / Math.max(1, gridRows.value);
    const boxSize = Math.min(70, cellWidth, cellHeight);
    const boxRect = {
      left: rect.left + col * cellWidth + (cellWidth - boxSize) / 2,
      top: rect.top + row * cellHeight + (cellHeight - boxSize) / 2,
      width: boxSize,
      height: boxSize,
    };
    return makeFolderMotionGeometryFromRect(folderId, boxRect);
  }

  function getFolderIconMotionGeometry(folderId) {
    return getTopLevelIconMotionGeometry(folderId, folderId) || getFallbackFolderMotionGeometry(folderId);
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

  function clearAltEditTimer() {
    if (altEditTimer) window.clearTimeout(altEditTimer);
    altEditTimer = null;
  }

  function enterEditModeFromAlt() {
    altEditTimer = null;
    if (isAltPressed) isEditMode.value = true;
  }

  function isAltKeyEvent(event) {
    return event.key === "Alt" || event.key === "Option" || event.code === "AltLeft" || event.code === "AltRight";
  }

  function handleAltKeyDown(event) {
    if (!isAltKeyEvent(event) || event.repeat || isAltPressed || isDragActive()) return;
    isAltPressed = true;
    clearAltEditTimer();
    altEditTimer = window.setTimeout(enterEditModeFromAlt, ALT_EDIT_DELAY);
  }

  function handleAltKeyUp(event) {
    if (!isAltKeyEvent(event)) return;
    isAltPressed = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  function handleWindowBlur() {
    isAltPressed = false;
    clearAltEditTimer();
    isEditMode.value = false;
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

  function updateFolderViewportHeight() {
    const element = getElementFromRef(folderViewportRef);
    // Ancestor panel animations use transforms; layout height avoids reading the scaled rect.
    const layoutHeight = element ? element.offsetHeight || element.clientHeight || element.getBoundingClientRect().height : 0;
    const nextHeight = roundPx(layoutHeight);
    if (Math.abs(folderViewportHeight.value - nextHeight) > 0.1) folderViewportHeight.value = nextHeight;
  }

  function scheduleFolderViewportMetrics() {
    nextTick(updateFolderViewportHeight);
  }

  function disconnectFolderViewportObserver() {
    if (folderViewportResizeObserver) folderViewportResizeObserver.disconnect();
    folderViewportResizeObserver = null;
    observedFolderViewportElement = null;
  }

  function observeFolderViewport() {
    const element = getElementFromRef(folderViewportRef);
    if (element === observedFolderViewportElement) {
      updateFolderViewportHeight();
      return;
    }

    disconnectFolderViewportObserver();
    observedFolderViewportElement = element;

    if (element && typeof ResizeObserver !== "undefined") {
      folderViewportResizeObserver = new ResizeObserver(updateFolderViewportHeight);
      folderViewportResizeObserver.observe(element);
    }

    updateFolderViewportHeight();
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
