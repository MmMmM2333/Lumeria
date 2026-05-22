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
import { isNativeBridgeAvailable, launchApp as launchNativeApp, listenNativeEvent, loadAppIconChoices, loadLayout, pickLaunchFile, saveLayout, scanApps } from "../api/launchpadApi.js";
import { useLaunchpadDrag } from "./useLaunchpadDrag.js";
import { useIconSelection } from "./useIconSelection.js";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";
import { getElementFromRef, usePageGridMetrics } from "./usePageGridMetrics.js";

const USE_MOCK_DATA_IN_NATIVE = false;
const PAGE_JUMP_RENDER_RELEASE_DELAY = 900;

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
  const draftIconSize = ref(DEFAULT_ICON_SIZE);
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
  const isSettingsPanelOpen = ref(false);
  const warningDialog = shallowRef(null);
  const appManagerSelectedIds = ref([]);
  const appManagerSearchQuery = ref("");
  const isScanResultDialogOpen = ref(false);
  const scanResultApps = ref([]);
  const scanResultSelectedIds = ref([]);
  const isAddingManagedApp = ref(false);
  const hiddenAppIds = ref([]);
  const newAppName = ref("");
  const newAppTarget = ref("");
  const newAppArgs = ref("");
  const newAppIconDataUrl = ref(null);
  const isBrowsingNewAppTarget = ref(false);
  const editingManagedAppId = ref(null);
  const editAppName = ref("");
  const editAppTarget = ref("");
  const editAppArgs = ref("");
  const editAppIconDataUrl = ref(null);
  const isEditAppIconReset = ref(false);
  const isBrowsingEditAppTarget = ref(false);
  const isScanningApps = ref(false);
  const iconChooser = shallowRef(null);
  const iconChoices = ref([]);
  const isLoadingIconChoices = ref(false);
  const keyboardFocusArea = ref("desktop");
  const launchGhost = shallowRef(null);
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const folderPageIndex = ref(0);
  const isFolderClosing = ref(false);
  const folderClosingSnapshot = shallowRef(null);
  const folderMotionGeometry = ref({ id: null, x: 0, y: 36, scaleX: 0.1, scaleY: 0.16, borderRadius: 26 });
  const folderSession = shallowRef(null);
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
  let dragControls = null;
  let nativeLayoutReady = false;
  let nativeSaveTimer = null;
  let unlistenSettingsEvent = null;
  let iconChooserRequestId = 0;

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
  const folderGridHeight = computed(() => {
    const iconCellHeight = iconSize.value + (isTextlessMode.value ? 12 : 48);
    return visibleFolderRowCount.value * iconCellHeight + Math.max(0, visibleFolderRowCount.value - 1) * 24;
  });
  const folderShellMinHeight = computed(() => {
    return folderGridHeight.value + 108;
  });

  const isSearchMode = computed(() => searchQuery.value.trim().length > 0);
  const searchApps = computed(() => filterAppsForSearch(collectAppsFromPages(pages.value), searchQuery.value));
  const searchPages = computed(() => chunkIntoPages(searchApps.value, pageSize.value));
  const activePages = computed(() => (isSearchMode.value ? searchPages.value : pages.value));
  const activePageIndex = computed(() => (isSearchMode.value ? searchPageIndex.value : pageIndex.value));
  const managedApps = computed(() => collectAppsFromPages(pages.value).sort(compareAppsByDefaultOrder));
  const filteredManagedApps = computed(() => {
    const query = appManagerSearchQuery.value.trim().toLowerCase();
    if (!query) return managedApps.value;
    return managedApps.value.filter((app) => {
      const name = String(app?.name || "").toLowerCase();
      const target = getLaunchTargetPath(app).toLowerCase();
      const args = String(app?.launchArgs || "").toLowerCase();
      return name.includes(query) || target.includes(query) || args.includes(query);
    });
  });
  const selectedManagedAppCount = computed(() => appManagerSelectedIds.value.length);
  const scanResultSelectedCount = computed(() => scanResultSelectedIds.value.length);
  const canAddScannedApps = computed(() => scanResultSelectedCount.value > 0);
  const canAddManagedApp = computed(() => newAppName.value.trim().length > 0 && newAppTarget.value.trim().length > 0);
  const newManagedAppGlyph = computed(() => fallbackAppGlyph(newAppName.value));
  const canSaveEditingManagedApp = computed(() => editAppName.value.trim().length > 0 && editAppTarget.value.trim().length > 0);
  const editingManagedApp = computed(() => managedApps.value.find((app) => app.id === editingManagedAppId.value) || null);
  const canScanManagedApps = computed(() => shouldUseNativeCatalog());

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
  }));
  const folderPanelAnimate = computed(() => {
    if (isFolderAppLaunchClosing.value) {
      return { opacity: 0, scaleX: 1.08, scaleY: 1.08, x: 0, y: 0, borderRadius: "46px" };
    }
    if (isFolderClosing.value) {
      return {
        opacity: 0,
        scaleX: folderMotionGeometry.value.scaleX,
        scaleY: folderMotionGeometry.value.scaleY,
        x: folderMotionGeometry.value.x,
        y: folderMotionGeometry.value.y,
        borderRadius: `${folderMotionGeometry.value.borderRadius}px`,
      };
    }
    return { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: "42px" };
  });
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
    focusDesktopSurface,
    folderPageIndex,
    folderPages,
    folderPanelRef,
    getCurrentIconScope,
    handleAltKeyDown,
    isAltKeyEvent,
    isAppLaunching,
    isDesktopClosing,
    isDesktopOpen,
    isDragActive,
    isFolderAppLaunchClosing,
    isFolderClosing,
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

  function fallbackAppGlyph(name) {
    return String(name || "A").trim().charAt(0).toUpperCase() || "A";
  }

  function makeLaunchTarget(target) {
    const value = String(target || "").trim();
    if (!value) return null;
    return {
      kind: /^https?:\/\//i.test(value) ? "url" : "executable",
      path: value,
    };
  }

  function compareAppsByDefaultOrder(left, right) {
    const leftName = String(left?.name || "").toLowerCase();
    const rightName = String(right?.name || "").toLowerCase();
    if (leftName < rightName) return -1;
    if (leftName > rightName) return 1;

    const leftId = String(left?.id || "");
    const rightId = String(right?.id || "");
    if (leftId < rightId) return -1;
    if (leftId > rightId) return 1;
    return 0;
  }

  function normalizeNativeApp(app, index) {
    const name = String(app?.name || "Application").trim() || "Application";
    return {
      ...app,
      id: String(app?.id || `native-app-${index}`),
      type: "app",
      name,
      launchTarget: app?.launchTarget || app?.launch_target || null,
      launchArgs: typeof app?.launchArgs === "string" ? app.launchArgs : "",
      iconDataUrl: app?.iconDataUrl || null,
      emoji: app?.emoji || fallbackAppGlyph(name),
    };
  }

  function mergeAppWithSavedIcon(app, savedItem) {
    const next = cloneItem(app);
    if (savedItem?.name) next.name = String(savedItem.name).slice(0, 64);
    if (savedItem?.emoji) next.emoji = savedItem.emoji;
    if (savedItem?.launchTarget) next.launchTarget = savedItem.launchTarget;
    if (typeof savedItem?.launchArgs === "string") next.launchArgs = savedItem.launchArgs;
    if (savedItem?.customIconDataUrl) next.customIconDataUrl = savedItem.customIconDataUrl;
    return next;
  }

  function normalizeSavedCustomApp(item) {
    if (!item || item.type !== "app" || !item.launchTarget) return null;
    const name = String(item.name || "Application").trim() || "Application";
    return {
      ...item,
      id: String(item.id || makeId("custom-app")),
      type: "app",
      name,
      emoji: item.emoji || fallbackAppGlyph(name),
      launchTarget: item.launchTarget,
      launchArgs: typeof item.launchArgs === "string" ? item.launchArgs : "",
    };
  }

  function applyLayoutSettings(settings) {
    if (!settings) return;
    const rows = clamp(Number(settings.gridRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(settings.gridCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRows = clamp(Number(settings.folderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderCols = clamp(Number(settings.folderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const nextIconSize = clampIconSize(settings.iconSize);

    gridRows.value = rows;
    gridCols.value = cols;
    folderRows.value = nextFolderRows;
    folderCols.value = nextFolderCols;
    iconSize.value = nextIconSize;
    draftRows.value = rows;
    draftCols.value = cols;
    draftFolderRows.value = nextFolderRows;
    draftFolderCols.value = nextFolderCols;
    draftIconSize.value = nextIconSize;
    isTextlessMode.value = Boolean(settings.textless);
    hiddenAppIds.value = Array.isArray(settings.hiddenAppIds) ? settings.hiddenAppIds.map(String) : [];
  }

  function mergeFolderWithCatalog(folder, catalog, usedAppIds) {
    const sourcePages = Array.isArray(folder?.childPages) ? folder.childPages : chunkIntoPages(folder?.children || [], folderPageSize.value);
    const childPages = sourcePages
      .map((page) =>
        (page || [])
          .map((child) => {
            const app = child?.id ? catalog.get(child.id) || normalizeSavedCustomApp(child) : null;
            if (!app || usedAppIds.has(app.id)) return null;
            usedAppIds.add(app.id);
            return mergeAppWithSavedIcon(app, child);
          })
          .filter(Boolean)
      )
      .filter((page) => page.length > 0);

    if (!childPages.length) return null;
    return withFolderPages(
      {
        id: String(folder?.id || makeId("folder")),
        type: "folder",
        name: String(folder?.name || "新文件夹").slice(0, 32) || "新文件夹",
      },
      childPages
    );
  }

  function appendAppsToPages(sourcePages, apps) {
    const next = sourcePages.length ? sourcePages.map((page) => page.slice()) : [[]];
    for (const app of apps) {
      if (next[next.length - 1].length >= pageSize.value) next.push([]);
      next[next.length - 1].push(cloneItem(app));
    }
    return compactPages(next, { folderPageSize: folderPageSize.value });
  }

  function fitPagesToGrid(sourcePages) {
    const next = clonePages(sourcePages);
    for (let i = 0; i < next.length; i += 1) {
      while (next[i].length > pageSize.value) {
        const overflow = next[i].pop();
        ensurePage(next, i + 1);
        next[i + 1].unshift(overflow);
      }
    }
    return compactPages(next, { folderPageSize: folderPageSize.value });
  }

  function mergeNativeCatalogWithSavedLayout(apps, savedLayout) {
    const catalog = new Map(apps.map((app) => [app.id, app]));
    const usedAppIds = new Set();
    const sourcePages = Array.isArray(savedLayout?.pages) ? savedLayout.pages : [];
    const mergedPages = sourcePages.map((page) =>
      (page || [])
        .map((item) => {
          if (item?.type === "folder") return mergeFolderWithCatalog(item, catalog, usedAppIds);
          const app = item?.id ? catalog.get(item.id) || normalizeSavedCustomApp(item) : null;
          if (!app || usedAppIds.has(app.id)) return null;
          usedAppIds.add(app.id);
          return mergeAppWithSavedIcon(app, item);
        })
        .filter(Boolean)
    );
    const newApps = apps.filter((app) => !usedAppIds.has(app.id));
    const hidden = new Set(hiddenAppIds.value);
    return fitPagesToGrid(appendAppsToPages(mergedPages, newApps.filter((app) => !hidden.has(app.id))));
  }

  function createLayoutSnapshot() {
    return {
      version: 1,
      pages: makeLayoutPages(pages.value),
      settings: {
        gridRows: gridRows.value,
        gridCols: gridCols.value,
        folderRows: folderRows.value,
        folderCols: folderCols.value,
        iconSize: iconSize.value,
        textless: isTextlessMode.value,
        hiddenAppIds: hiddenAppIds.value,
      },
    };
  }

  function makeLayoutPages(sourcePages) {
    return (sourcePages || []).map((page) => (page || []).filter(Boolean).map(makeLayoutItem));
  }

  function makeLayoutItem(item) {
    if (item.type === "folder") {
      const sourcePages = Array.isArray(item.childPages) ? item.childPages : getFolderChildPages(item, folderPageSize.value);
      const childPages = sourcePages.map((page) => (page || []).filter(Boolean).map(makeLayoutItem));
      return {
        id: item.id,
        type: "folder",
        name: item.name,
        childPages,
        children: childPages.flat(),
      };
    }

    const clean = {
      id: item.id,
      type: "app",
      name: item.name,
      emoji: item.emoji,
    };
    if (item.customIconDataUrl) clean.customIconDataUrl = item.customIconDataUrl;
    if (item.launchTarget) clean.launchTarget = item.launchTarget;
    if (item.launchArgs) clean.launchArgs = item.launchArgs;
    return clean;
  }

  function clearNativeSaveTimer() {
    if (nativeSaveTimer) window.clearTimeout(nativeSaveTimer);
    nativeSaveTimer = null;
  }

  function scheduleNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return;
    clearNativeSaveTimer();
    nativeSaveTimer = window.setTimeout(async () => {
      nativeSaveTimer = null;
      try {
        await saveLayout(createLayoutSnapshot());
      } catch (error) {
        console.error("Failed to save LaunchPad layout", error);
      }
    }, 320);
  }

  async function loadNativeLaunchpadData() {
    if (!shouldUseNativeCatalog()) return;

    try {
      const [nativeApps, savedLayout] = await Promise.all([scanApps(), loadLayout()]);
      const apps = (nativeApps || []).map(normalizeNativeApp);
      if (!apps.length && !savedLayout) {
        nativeLayoutReady = true;
        return;
      }

      applyLayoutSettings(savedLayout?.settings);
      pages.value = mergeNativeCatalogWithSavedLayout(apps, savedLayout);
      commitPageIndex(pageIndex.value);
      commitSearchPageIndex(searchPageIndex.value);
      commitFolderPageIndex(folderPageIndex.value);
      nativeLayoutReady = true;
      schedulePageGridMetrics();
    } catch (error) {
      nativeLayoutReady = false;
      console.error("Failed to load native LaunchPad data", error);
    }
  }

  async function launchNativeAppIfAvailable(app) {
    if (!shouldUseNativeCatalog()) return;
    try {
      await launchNativeApp(app.id);
    } catch (error) {
      console.error(`Failed to launch ${app.name}`, error);
    }
  }

  function getDesktopGridProjectionKey(pageNumber) {
    return `${isSearchMode.value ? "search" : "desktop"}-grid-${pageNumber}-${desktopProjectionKeyMode.value}`;
  }

  function shouldRenderActivePage(pageNumber) {
    const distance = Math.abs(pageNumber - activePageIndex.value);
    if (dragMeta.value) return distance === 0;

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
    if (dragMeta.value) return distance === 0;

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

  function shouldUseNativeCatalog() {
    return isNativeBridgeAvailable() && !USE_MOCK_DATA_IN_NATIVE;
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

  function updateAppCustomIcon(appId, dataUrl) {
    if (!appId || isDragActive()) return;
    const next = clonePages(pages.value);
    let changed = false;

    function updateItem(item) {
      if (!item) return;
      if (item.type === "app" && item.id === appId) {
        if (dataUrl) item.customIconDataUrl = dataUrl;
        else delete item.customIconDataUrl;
        changed = true;
        return;
      }
      if (item.type !== "folder") return;
      for (const page of item.childPages || []) {
        for (const child of page || []) updateItem(child);
      }
      item.children = (item.childPages || []).flat().filter(Boolean).map(cloneItem);
    }

    for (const page of next) {
      for (const item of page) updateItem(item);
    }
    if (!changed) return;
    commitPages(next);
    schedulePageGridMetrics();
  }

  function resetAppCustomIcon(appId) {
    updateAppCustomIcon(appId, null);
  }

  function getLaunchTargetPath(app) {
    return app?.launchTarget?.path || "";
  }

  function syncEditingManagedApp() {
    if (editingManagedAppId.value && !editingManagedApp.value) closeEditManagedApp();
  }

  function syncSelectedManagedApps() {
    const validIds = new Set(filteredManagedApps.value.map((app) => app.id));
    appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => validIds.has(id));
  }

  function syncManagedAppState() {
    syncEditingManagedApp();
    syncSelectedManagedApps();
  }

  function toggleManagedAppSelection(appId, checked) {
    if (!appId) return;
    const selected = new Set(appManagerSelectedIds.value);
    if (checked) selected.add(appId);
    else selected.delete(appId);
    appManagerSelectedIds.value = Array.from(selected);
  }

  function selectAllManagedApps() {
    appManagerSelectedIds.value = filteredManagedApps.value.map((app) => app.id);
  }

  function clearManagedAppSelection() {
    appManagerSelectedIds.value = [];
  }

  function toggleScanResultSelection(appId, checked) {
    if (!appId) return;
    const selected = new Set(scanResultSelectedIds.value);
    if (checked) selected.add(appId);
    else selected.delete(appId);
    scanResultSelectedIds.value = Array.from(selected);
  }

  function selectAllScanResultApps() {
    scanResultSelectedIds.value = scanResultApps.value.map((app) => app.id);
  }

  function clearScanResultSelection() {
    scanResultSelectedIds.value = [];
  }

  function closeScanResultDialog() {
    isScanResultDialogOpen.value = false;
    scanResultApps.value = [];
    scanResultSelectedIds.value = [];
  }

  function resetNewManagedAppDraft() {
    newAppName.value = "";
    newAppTarget.value = "";
    newAppArgs.value = "";
    newAppIconDataUrl.value = null;
  }

  function openAddManagedAppPage() {
    if (isDragActive()) return;
    resetNewManagedAppDraft();
    isAddingManagedApp.value = true;
  }

  function closeAddManagedAppPage() {
    isAddingManagedApp.value = false;
    if (iconChooser.value?.target === "new") closeIconChooser();
    resetNewManagedAppDraft();
  }

  function readImageFileAsDataUrl(event, callback) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") callback(reader.result);
      input.value = "";
    };
    reader.onerror = () => {
      input.value = "";
    };
    reader.readAsDataURL(file);
  }

  function resetNewAppIcon() {
    newAppIconDataUrl.value = null;
  }

  async function browseNewAppLaunchFile() {
    if (!shouldUseNativeCatalog() || isBrowsingNewAppTarget.value) return;
    isBrowsingNewAppTarget.value = true;
    try {
      const selectedFile = await pickLaunchFile();
      if (!selectedFile) return;
      newAppName.value = String(selectedFile.name || "").trim() || newAppName.value;
      newAppTarget.value = String(selectedFile.path || "").trim();
      newAppArgs.value = String(selectedFile.launchArgs || "").trim();
      newAppIconDataUrl.value = selectedFile.iconDataUrl || null;
    } catch (error) {
      console.error("Failed to pick launch file", error);
    } finally {
      isBrowsingNewAppTarget.value = false;
    }
  }

  function openEditManagedApp(app) {
    if (!app || isDragActive()) return;
    editingManagedAppId.value = app.id;
    editAppName.value = app.name || "";
    editAppTarget.value = getLaunchTargetPath(app);
    editAppArgs.value = typeof app.launchArgs === "string" ? app.launchArgs : "";
    editAppIconDataUrl.value = app.customIconDataUrl || null;
    isEditAppIconReset.value = false;
  }

  function closeEditManagedApp() {
    editingManagedAppId.value = null;
    if (iconChooser.value?.target === "edit") closeIconChooser();
    editAppName.value = "";
    editAppTarget.value = "";
    editAppArgs.value = "";
    editAppIconDataUrl.value = null;
    isEditAppIconReset.value = false;
  }

  function resetEditAppIcon() {
    editAppIconDataUrl.value = null;
    isEditAppIconReset.value = true;
  }

  async function browseEditAppLaunchFile() {
    if (!shouldUseNativeCatalog() || isBrowsingEditAppTarget.value) return;
    isBrowsingEditAppTarget.value = true;
    try {
      const selectedFile = await pickLaunchFile();
      if (!selectedFile) return;
      editAppName.value = String(selectedFile.name || "").trim() || editAppName.value;
      editAppTarget.value = String(selectedFile.path || "").trim();
      editAppArgs.value = String(selectedFile.launchArgs || "").trim();
      editAppIconDataUrl.value = selectedFile.iconDataUrl || null;
      isEditAppIconReset.value = false;
    } catch (error) {
      console.error("Failed to pick launch file", error);
    } finally {
      isBrowsingEditAppTarget.value = false;
    }
  }

  function normalizeIconChoices(choices) {
    return (choices || [])
      .map((choice, index) => ({
        id: String(choice?.id || `icon-choice-${index}`),
        iconDataUrl: choice?.iconDataUrl || choice?.icon_data_url || null,
      }))
      .filter((choice) => choice.iconDataUrl);
  }

  function getIconChooserSourcePath(chooser) {
    if (chooser?.target === "new") return newAppTarget.value.trim();
    if (chooser?.target === "edit") return editAppTarget.value.trim();
    if (chooser?.target === "existing") {
      const app = managedApps.value.find((item) => item.id === chooser.appId);
      return getLaunchTargetPath(app).trim();
    }
    return "";
  }

  async function loadIconChoicesForChooser(chooser) {
    const requestId = (iconChooserRequestId += 1);
    iconChoices.value = [];
    const targetPath = getIconChooserSourcePath(chooser);
    if (!targetPath || !shouldUseNativeCatalog()) {
      isLoadingIconChoices.value = false;
      return;
    }

    isLoadingIconChoices.value = true;
    try {
      const choices = await loadAppIconChoices(targetPath);
      if (requestId !== iconChooserRequestId) return;
      iconChoices.value = normalizeIconChoices(choices);
    } catch (error) {
      if (requestId === iconChooserRequestId) iconChoices.value = [];
      console.error("Failed to load app icon choices", error);
    } finally {
      if (requestId === iconChooserRequestId) isLoadingIconChoices.value = false;
    }
  }

  function openIconChooser(chooser) {
    if (!chooser || isDragActive()) return;
    iconChooser.value = chooser;
    loadIconChoicesForChooser(chooser);
  }

  function openNewAppIconChooser() {
    openIconChooser({
      target: "new",
      title: "更换图标",
      subtitle: newAppName.value.trim() || "新增应用",
    });
  }

  function openEditAppIconChooser() {
    openIconChooser({
      target: "edit",
      title: "更换图标",
      subtitle: editAppName.value.trim() || editingManagedApp.value?.name || "编辑应用",
    });
  }

  function openExistingAppIconChooser(appId) {
    if (!appId) return;
    const app = managedApps.value.find((item) => item.id === appId);
    if (!app) return;
    openIconChooser({
      target: "existing",
      appId,
      title: "更换图标",
      subtitle: app.name || "应用",
    });
  }

  function closeIconChooser() {
    iconChooserRequestId += 1;
    iconChooser.value = null;
    iconChoices.value = [];
    isLoadingIconChoices.value = false;
  }

  function applyIconChooserDataUrl(dataUrl) {
    if (!dataUrl || !iconChooser.value) return;
    if (iconChooser.value.target === "new") {
      newAppIconDataUrl.value = dataUrl;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "edit") {
      editAppIconDataUrl.value = dataUrl;
      isEditAppIconReset.value = false;
      closeIconChooser();
      return;
    }
    if (iconChooser.value.target === "existing") {
      updateAppCustomIcon(iconChooser.value.appId, dataUrl);
      closeIconChooser();
    }
  }

  function chooseIconCandidate(choice) {
    applyIconChooserDataUrl(choice?.iconDataUrl);
  }

  function handleIconChooserUpload(event) {
    readImageFileAsDataUrl(event, applyIconChooserDataUrl);
  }

  function updateManagedAppEverywhere(appId, updater) {
    if (!appId || typeof updater !== "function") return false;
    const next = clonePages(pages.value);
    let changed = false;

    function updateItem(item) {
      if (!item) return;
      if (item.type === "app" && item.id === appId) {
        updater(item);
        changed = true;
        return;
      }
      if (item.type !== "folder") return;
      for (const page of item.childPages || []) {
        for (const child of page || []) updateItem(child);
      }
      item.children = (item.childPages || []).flat().filter(Boolean).map(cloneItem);
    }

    for (const page of next) {
      for (const item of page) updateItem(item);
    }
    if (!changed) return false;
    commitPages(next);
    return true;
  }

  function saveEditingManagedApp() {
    if (isDragActive() || !editingManagedAppId.value || !canSaveEditingManagedApp.value) return;
    const name = editAppName.value.trim().slice(0, 64);
    const launchTarget = makeLaunchTarget(editAppTarget.value);
    if (!name || !launchTarget) return;
    const launchArgs = editAppArgs.value.trim();
    const customIcon = editAppIconDataUrl.value;

    const changed = updateManagedAppEverywhere(editingManagedAppId.value, (item) => {
      item.name = name;
      item.emoji = fallbackAppGlyph(name);
      item.launchTarget = launchTarget;
      if (launchArgs) item.launchArgs = launchArgs;
      else delete item.launchArgs;
      if (customIcon) item.customIconDataUrl = customIcon;
      else delete item.customIconDataUrl;
    });

    if (!changed) return;
    closeEditManagedApp();
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
    schedulePageGridMetrics();
  }

  function deleteManagedApps(appIds) {
    if (isDragActive()) return;
    const ids = Array.from(new Set((appIds || []).filter(Boolean)));
    if (!ids.length) return;

    let next = pages.value;
    for (const id of ids) next = removeEverywhere(next, id);
    hiddenAppIds.value = Array.from(new Set([...hiddenAppIds.value, ...ids]));
    commitPages(next);
    const deletedIds = new Set(ids);
    appManagerSelectedIds.value = appManagerSelectedIds.value.filter((id) => !deletedIds.has(id));
    if (deletedIds.has(editingManagedAppId.value)) closeEditManagedApp();
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
    if (renderedFolder.value && openFolderId.value && !findFolder(pages.value, openFolderId.value)) commitOpenFolder(null);
    schedulePageGridMetrics();
  }

  function deleteManagedApp(appId) {
    deleteManagedApps([appId]);
  }

  function deleteSelectedManagedApps() {
    deleteManagedApps(appManagerSelectedIds.value);
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
      title: "强制填满页面？",
      message: "这会按当前顺序重新压实所有桌面页面，并破坏当前分页布局。",
      confirmText: "强制填满",
      cancelText: "取消",
      onConfirm: forceFillAllPages,
    });
  }

  async function rescanManagedApps() {
    if (!shouldUseNativeCatalog() || isScanningApps.value) return;
    isScanningApps.value = true;
    try {
      const nativeApps = await scanApps();
      const existingIds = new Set(collectAppsFromPages(pages.value).map((app) => app.id));
      const missingApps = (nativeApps || [])
        .map(normalizeNativeApp)
        .filter((app) => !existingIds.has(app.id));
      scanResultApps.value = missingApps;
      scanResultSelectedIds.value = missingApps.map((app) => app.id);
      isScanResultDialogOpen.value = true;
      syncManagedAppState();
    } catch (error) {
      console.error("Failed to scan apps", error);
    } finally {
      isScanningApps.value = false;
    }
  }

  function addSelectedScannedApps() {
    if (isDragActive() || !canAddScannedApps.value) return;
    const selectedIds = new Set(scanResultSelectedIds.value);
    const existingIds = new Set(collectAppsFromPages(pages.value).map((app) => app.id));
    const selectedApps = scanResultApps.value.filter((app) => selectedIds.has(app.id) && !existingIds.has(app.id));
    if (!selectedApps.length) {
      closeScanResultDialog();
      return;
    }

    const restoredIds = new Set(selectedApps.map((app) => app.id));
    hiddenAppIds.value = hiddenAppIds.value.filter((id) => !restoredIds.has(id));
    commitPages(appendAppsToPages(pages.value, selectedApps));
    closeScanResultDialog();
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
    syncManagedAppState();
    schedulePageGridMetrics();
  }

  function addManagedApp() {
    if (isDragActive()) return;
    const name = newAppName.value.trim().slice(0, 64);
    if (!name) return;
    const launchTarget = makeLaunchTarget(newAppTarget.value);
    if (!launchTarget) return;
    const launchArgs = newAppArgs.value.trim();
    const app = {
      id: makeId("custom-app"),
      type: "app",
      name,
      emoji: fallbackAppGlyph(name),
      launchTarget,
    };
    if (launchArgs) app.launchArgs = launchArgs;
    if (newAppIconDataUrl.value) app.customIconDataUrl = newAppIconDataUrl.value;
    commitPages(appendAppsToPages(pages.value, [app]));
    closeAddManagedAppPage();
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
    schedulePageGridMetrics();
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
    draftRows.value = rows;
    draftCols.value = cols;
    draftFolderRows.value = nextFolderRowCount;
    draftFolderCols.value = nextFolderColumnCount;
    draftIconSize.value = iconSize.value;
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

  function openSettingsPanel() {
    if (isDragActive()) return;
    draftIconSize.value = iconSize.value;
    isSettingsPanelOpen.value = true;
  }

  function closeSettingsPanel() {
    isSettingsPanelOpen.value = false;
    closeAddManagedAppPage();
    closeScanResultDialog();
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
    launchNativeAppIfAvailable(app);
    startAppLaunchGhost(app, launchSource);
    openingIcon.value = launchSource;
    isAppLaunching.value = true;

    if (renderedFolder.value || openFolderId.value) startFolderAppLaunchClose();
    closeDesktop({ clearSearch: false });

    clearAppLaunchTimer();
    appLaunchTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterLaunch) clearSearch({ keepSelection: false });
      clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
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
    if (!isDesktopOpen.value || isDragActive() || isAppLaunching.value) return;

    const target = event.target;
    if (target?.closest?.(".icon-hit-target, .page-dot, .search-pill, .launchpad-header, button, input, textarea, select")) {
      return;
    }

    closeDesktop({ clearSearch: true });
  }

  function handleFolderOverlayPointerDown() {
    if (!isDragActive()) commitOpenFolder(null);
  }

  watch([gridRows, gridCols, folderRows, folderCols, iconSize, isTextlessMode, isSearchMode], schedulePageGridMetrics, { flush: "post" });
  watch(activePages, schedulePageGridMetrics, { flush: "post" });
  watch([pages, gridRows, gridCols, folderRows, folderCols, iconSize, isTextlessMode, hiddenAppIds], scheduleNativeLayoutSave, { flush: "post" });
  watch(filteredManagedApps, syncManagedAppState, { flush: "post" });

  onMounted(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keyup", handleAltKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", updatePageGridMetrics);
    schedulePageGridMetrics();
    loadNativeLaunchpadData();
    if (isNativeBridgeAvailable()) {
      listenNativeEvent("launchpad-open-settings", openSettingsPanel)
        .then((unlisten) => {
          unlistenSettingsEvent = unlisten;
        })
        .catch((error) => {
          console.error("Failed to listen for native settings event", error);
        });
    }

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
    clearHomeRevealSettleTimer();
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhostTimer();
    clearPageJumpRenderRange();
    clearNativeSaveTimer();
    unlistenSettingsEvent?.();
    unlistenSettingsEvent = null;
    cancelLongPress();
    clearAltEditTimer();
    if (layoutResizeObserver) layoutResizeObserver.disconnect();
    layoutResizeObserver = null;
    window.removeEventListener("keydown", handleGlobalKeydown);
    window.removeEventListener("keyup", handleAltKeyUp);
    window.removeEventListener("blur", handleWindowBlur);
    window.removeEventListener("resize", updatePageGridMetrics);
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
    changeDraftRows,
    changeDraftCols,
    changeDraftFolderRows,
    changeDraftFolderCols,
    changeDraftIconSize,
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
    folderPanelInitial,
    folderPanelAnimate,
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
