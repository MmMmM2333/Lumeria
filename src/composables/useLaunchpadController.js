import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { createLaunchpadDocumentCoordinator } from "../application/launchpadDocumentCoordinator.js";
import { cx } from "../domain/launchpadLayout.js";
import { isNativeBridgeAvailable } from "../api/launchpadApi.js";
import { catalogPort } from "../platform/launchpadPorts.js";
import { useAltEditMode } from "./useAltEditMode.js";
import { useFolderLayoutStyles } from "./useFolderLayoutStyles.js";
import { useFolderMotionGeometry } from "./useFolderMotionGeometry.js";
import { useFolderViewportMetrics } from "./useFolderViewportMetrics.js";
import { useLaunchpadApps } from "./useLaunchpadApps.js";
import { useLaunchpadDrag } from "./useLaunchpadDrag.js";
import { useFolderOpenIconGhosts } from "./useFolderOpenIconGhosts.js";
import { useLaunchpadFolderFlow } from "./useLaunchpadFolderFlow.js";
import {
  resolveCurrentIconScope,
  useLaunchpadIconActivation,
} from "./useLaunchpadIconActivation.js";
import { useLaunchpadLaunchFlow } from "./useLaunchpadLaunchFlow.js";
import { useIconSelection } from "./useIconSelection.js";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";
import { useLaunchpadLifecycle } from "./useLaunchpadLifecycle.js";
import { useLaunchpadLayout } from "./useLaunchpadLayout.js";
import { useLiveDesktopRuntime } from "./useLiveDesktopRuntime.js";
import { useMainWindowRuntime } from "./useMainWindowRuntime.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";
import { useLaunchpadNotices } from "./useLaunchpadNotices.js";
import { useLaunchpadPageCommands } from "./useLaunchpadPageCommands.js";
import { useLaunchpadSearch } from "./useLaunchpadSearch.js";
import { useLaunchpadSettings } from "./useLaunchpadSettings.js";
import { useLaunchpadSurfaceInteractions } from "./useLaunchpadSurfaceInteractions.js";
import { useLaunchpadViewState } from "./useLaunchpadViewState.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
} from "./useLaunchpadSettingsConfig.js";
import { usePageRenderRange } from "./usePageRenderRange.js";
import { usePageGridMetrics } from "./usePageGridMetrics.js";
import { useSettingsPanelFlow } from "./useSettingsPanelFlow.js";
import { useSettingsPanelModel } from "./useSettingsPanelModel.js";
import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;

export function shouldPlayFolderOpenIconGhosts(next, state) {
  if (!next) return false;
  const openFolderId = state?.openFolderId?.value || null;
  const renderedFolderId = state?.renderedFolder?.value?.id || null;
  const isSameOpenFolder = openFolderId === next &&
    renderedFolderId === next &&
    !state?.isFolderClosing?.value &&
    !state?.isFolderAppLaunchClosing?.value;
  return !isSameOpenFolder;
}

export function shouldIgnoreFolderCloseRequest(state) {
  return Boolean(
    state?.isFolderClosing?.value ||
    state?.isFolderAppLaunchClosing?.value ||
    state?.isFolderZoomFadeClosing?.value ||
    (!state?.openFolderId?.value && !state?.renderedFolder?.value)
  );
}

const DEFERRED_CLOSING_GHOST_HANDOFF_OPEN = "__deferredClosingGhostHandoffOpen";

export function shouldDeferFolderOpenForClosingGhostHandoff(next, state, commitOptions = {}) {
  if (!next || commitOptions?.[DEFERRED_CLOSING_GHOST_HANDOFF_OPEN]) return false;
  if (!state?.isFolderClosing?.value || state?.isFolderAppLaunchClosing?.value || state?.isFolderZoomFadeClosing?.value) return false;
  const renderedFolderId = state?.renderedFolder?.value?.id || null;
  if (!renderedFolderId || renderedFolderId === next) return false;
  return (state?.folderCloseIconGhosts?.value?.length || 0) > 0;
}

function stripDeferredClosingGhostHandoffOpen(commitOptions = {}) {
  const { [DEFERRED_CLOSING_GHOST_HANDOFF_OPEN]: _deferred, ...rest } = commitOptions || {};
  return rest;
}

function getSystemAppearance() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return BACKGROUND_ACRYLIC_APPEARANCE_DARK;
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    : BACKGROUND_ACRYLIC_APPEARANCE_DARK;
}

function useSystemAppearance() {
  const systemAppearance = ref(getSystemAppearance());
  let mediaQuery = null;
  const update = () => {
    systemAppearance.value = getSystemAppearance();
  };

  onMounted(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
    } else {
      mediaQuery.addListener?.(update);
    }
  });

  onBeforeUnmount(() => {
    if (!mediaQuery) return;
    if (typeof mediaQuery.removeEventListener === "function") {
      mediaQuery.removeEventListener("change", update);
    } else {
      mediaQuery.removeListener?.(update);
    }
    mediaQuery = null;
  });

  return systemAppearance;
}

export function useLaunchpadController(options = {}) {
  const iconBoundsRegistry = createIconBoundsRegistry();
  const liveDesktopRuntime = useLiveDesktopRuntime();
  const liveDesktopBackgroundSupport = liveDesktopRuntime.support;
  const liveDesktopRuntimeStatus = liveDesktopRuntime.status;
  const mainWindowRuntime = useMainWindowRuntime();
  const windowEffectsSupport = mainWindowRuntime.support;
  const layout = useLaunchpadLayout({ seedEnabled: !isNativeBridgeAvailable() });
  let dragControls = null;
  let settingsPanelModelDisposer = null;

  function requireDragControls() {
    if (!dragControls) {
      throw new Error("Launchpad drag controls were used before controller wiring completed");
    }
    return dragControls;
  }

  function disposeSettingsPanelModel() {
    if (typeof settingsPanelModelDisposer !== "function") {
      throw new Error("Settings panel model disposer was not initialized before launchpad cleanup");
    }
    settingsPanelModelDisposer();
  }
  const settings = useLaunchpadSettings({
    isDragActive: () => requireDragControls().isDragActive(),
    layout,
    liveDesktopSupport: liveDesktopBackgroundSupport,
    mainWindow: mainWindowRuntime,
  });
  function getCurrentIconScope() {
    return resolveCurrentIconScope({
      folderCols,
      folderPageIndex,
      getFolderPages: () => folderPages.value,
      getRenderedFolder: () => renderedFolder.value,
      getSearchPages: () => searchPages.value,
      getVisibleDesktopPage,
      getVisibleFolderPage,
      gridCols,
      isFolderAppLaunchClosing,
      isFolderClosing,
      isSearchMode: () => isSearchMode.value,
      openFolderId,
      pageIndex,
      pages,
      searchPageIndex,
    });
  }

  const {
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
    fullscreenOverscanEnabled,
    isChoosingBackgroundImage,
    isApplyingSettingsConfig,
    isTextlessMode,
    mainWindowShortcut,
    mainWindowShortcutError,
    showCustomTitlebar,
    windowMode,
    windowEffectAppearance,
    windowEffectMaterial,
  } = settings.presentation;
  const {
    backgroundAcrylicAppearance: draftBackgroundAcrylicAppearance,
    backgroundAcrylicBlurStrength: draftBackgroundAcrylicBlurStrength,
    backgroundAcrylicDarkParams: draftBackgroundAcrylicDarkParams,
    backgroundAcrylicLightParams: draftBackgroundAcrylicLightParams,
    backgroundBaseColor: draftBackgroundBaseColor,
    backgroundBaseOpacity: draftBackgroundBaseOpacity,
    backgroundBlurStrength: draftBackgroundBlurStrength,
    backgroundDarkenColor: draftBackgroundDarkenColor,
    backgroundDarkenStrength: draftBackgroundDarkenStrength,
    backgroundEffect: draftBackgroundEffect,
    backgroundImageLayout: draftBackgroundImageLayout,
    backgroundImageOpacity: draftBackgroundImageOpacity,
    backgroundImagePath: draftBackgroundImagePath,
    backgroundImageUrl: draftBackgroundImageUrl,
    backgroundLiveDesktopOpacity: draftBackgroundLiveDesktopOpacity,
    backgroundSource: draftBackgroundSource,
    cols: draftCols,
    folderCols: draftFolderCols,
    folderIconSize: draftFolderIconSize,
    folderIconSizeMode: draftFolderIconSizeMode,
    folderRows: draftFolderRows,
    fullscreenOverscanEnabled: draftFullscreenOverscanEnabled,
    iconSize: draftIconSize,
    isTextlessMode: draftIsTextlessMode,
    mainWindowShortcut: draftMainWindowShortcut,
    rows: draftRows,
    showCustomTitlebar: draftShowCustomTitlebar,
    windowEffectAppearance: draftWindowEffectAppearance,
    windowEffectMaterial: draftWindowEffectMaterial,
    windowMode: draftWindowMode,
  } = settings.draft;
  const liveDesktopCssFallbackEffectsEnabled = ref(false);
  const isLayoutProjectionActive = ref(false);
  const keyboardFocusArea = ref("desktop");
  const rootRef = ref(null);
  const shellRef = ref(null);
  const headerRef = ref(null);
  const searchRef = ref(null);
  const searchInputRef = ref(null);
  const desktopMainRef = ref(null);
  const pageDotsRef = ref(null);
  const folderPanelRef = ref(null);
  const folderViewportRef = ref(null);
  const backgroundLayoutContext = ref(null);
  const pageRefs = [];
  const folderPageRefs = [];
  const {
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderPageIndex,
    folderPageSize,
    folderPageTurnRequest,
    folderRows,
    gridCols,
    gridRows,
    iconSize,
    pageIndex,
    pageSize,
    pages,
    searchPageIndex,
    visualFolderPageIndex,
  } = layout.presentation;
  const {
    clearFolderPageTurnRequest,
    commitFolderPageIndex: commitFolderPageIndexState,
    commitFolderPageTurnRequest: commitFolderPageTurnRequestState,
    commitPageIndex: commitPageIndexState,
    commitPages: commitPagesState,
    commitSearchPageIndex: commitSearchPageIndexState,
    requestFolderPageTurn: requestFolderPageTurnState,
    setFolderPageTurnContextResolver,
  } = layout;
  const {
    appendAppsToPages,
    assertNoDuplicateItemIds,
    canCreateDesktopPageAfterDrag,
    canCreateFolderPageAfterDrag,
    chunkIntoPages,
    cloneItem,
    clonePages,
    collectAppsFromPages,
    compactPages,
    createLayoutSnapshot,
    dissolveFolder,
    ensurePage,
    findFolder,
    findInFolder,
    findTopLevel,
    flattenTopLevelPages,
    folderPreviewSlots,
    getFolderChildPages,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    getVisibleFolderPages,
    insertTopLevelItem,
    insertAppIntoFolder,
    makeId,
    previewAppIntoFolderWithoutOverflow,
    previewTopLevelItemWithoutOverflow,
    removeEverywhere,
    repackFoldersForPageSize,
    replaceFolderWithItem,
    withFolderPages,
    wouldTopLevelInsertOverflow,
    wouldFolderInsertOverflow,
  } = layout.operations;
  const systemAppearance = useSystemAppearance();
  const backgroundAcrylicEffectiveAppearance = computed(() => {
    const appearance = normalizeBackgroundAcrylicAppearance(backgroundAcrylicAppearance.value);
    return appearance === BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM ? systemAppearance.value : appearance;
  });
  const backgroundAcrylicParams = computed(() => {
    const profile = backgroundAcrylicEffectiveAppearance.value;
    return normalizeBackgroundAcrylicParams(
      profile === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT ? backgroundAcrylicLightParams.value : backgroundAcrylicDarkParams.value,
      profile
    );
  });
  const backgroundEffectBlurStrength = computed(() => (
    backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      ? backgroundAcrylicBlurStrength.value
      : backgroundBlurStrength.value
  ));
  const folderRenameRequest = ref(null);
  let folderRenameRequestToken = 0;

  const {
    disconnectFolderViewportObserver,
    folderViewportHeight,
    observeFolderViewport,
    resetFolderViewportMetrics,
    scheduleFolderViewportMetrics,
    updateFolderViewportHeight,
  } = useFolderViewportMetrics({
    folderViewportRef,
    getRenderedFolder: () => renderedFolder.value,
  });

  const {
    clearOpeningIcon,
    clearSelectedIcon,
    findSelectedItem,
    isIconOpening,
    moveSelectionByArrow,
    openingIcon,
    selectFirstIconInCurrentScope,
    selectedIcon,
    selectionMatchesScope,
  } = useIconSelection({ getCurrentIconScope: () => getCurrentIconScope() });

  const {
    captureFolderCloseIconGhosts,
    captureFolderPreviewIconGhosts,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    completeFolderCloseIconGhost: completeFolderCloseIconGhostNow,
    completeFolderOpenFrameGhost,
    completeFolderOpenIconGhost,
    folderCloseIconGhosts,
    folderOpenIconGhosts,
    folderOpenPreviewFrameGhostedIds,
    isFolderCloseIconAnimationActive,
    isFolderOpenFrameGhostPending,
    isFolderOpenIconAnimationActive,
    isFolderClosingIconGhosted,
    isFolderOpeningIconGhosted,
    isFolderOpeningPreviewFrameGhosted,
    playFolderCloseIconGhosts,
    playFolderOpenIconGhosts,
  } = useFolderOpenIconGhosts({
    cloneItem,
    folderPreviewSlots,
  });

  const {
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderCloseHandoffFrame,
    clearHomeRevealSettleTimer,
    commitFolderSession,
    commitOpenFolder: commitOpenFolderNow,
    desktopProjectionEpoch,
    finishFolderCloseAfterHandoffFrame,
    finishFolderZoomFadeClose,
    finishHomeRevealSettleWindow,
    consumeFirstFolderOpenPrepare,
    folderOpenProgress,
    folderOpenProgressTarget,
    folderOpenWarmupRequest,
    folderOpeningOriginBounds,
    folderPages,
    folderSession,
    folderZoomFadeCloseReason,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isFolderLayerActive,
    isFolderZoomFadeClosing,
    isFolderZoomFadeClosingFromFolderClose,
    isHomeRevealSettling,
    openFolderId,
    renderedFolder,
    requestFolderOpenWarmup,
    startFolderAppLaunchClose,
    startFolderZoomFadeClose,
    startHomeRevealSettleWindow,
  } = useLaunchpadFolderFlow({
    clearFolderPageTurn: () => clearFolderPageTurn(),
    clearFolderPageTurnRequest,
    commitFolderPageIndex: commitFolderPageIndexState,
    commitFolderPageTurnRequest: commitFolderPageTurnRequestState,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    cloneItem,
    findFolder,
    folderPageIndex,
    folderPageTurnRequest,
    folderPageRefs,
    folderPageSize,
    getFolderIconMotionGeometry: (folderId) => getFolderIconMotionGeometry(folderId),
    getFolderMotionGeometry: () => folderMotionGeometry.value,
    getVisibleFolderPages,
    isDragActive: () => requireDragControls().isDragActive(),
    pageRefs,
    pages,
    resetFolderViewportMetrics,
    setFolderMotionGeometry: (next) => {
      folderMotionGeometry.value = next;
    },
  });
  setFolderPageTurnContextResolver(() => {
    const isClosingPhase = Boolean(
      isFolderClosing.value ||
      isFolderAppLaunchClosing.value ||
      isFolderZoomFadeClosing.value
    );
    const hasFolderLayer = Boolean(openFolderId.value || renderedFolder.value);
    return {
      folderId: renderedFolder.value?.id || openFolderId.value || null,
      maxIndex: Math.max(0, folderPages.value.length - 1),
      phase: isClosingPhase ? "closing" : hasFolderLayer ? "open" : "idle",
    };
  });
  let deferredFolderOpenAfterCloseHandoffToken = 0;

  function scheduleFolderOpenAfterClosingGhostHandoff(next, commitOptions = {}) {
    const token = ++deferredFolderOpenAfterCloseHandoffToken;
    const scheduler = typeof window !== "undefined" ? window : globalThis;
    const scheduleFrame = (callback) => {
      if (typeof scheduler.requestAnimationFrame === "function") {
        return scheduler.requestAnimationFrame(callback);
      }
      if (typeof scheduler.setTimeout === "function") return scheduler.setTimeout(callback, 0);
      callback();
      return null;
    };
    scheduleFrame(() => {
      scheduleFrame(() => {
        if (token !== deferredFolderOpenAfterCloseHandoffToken) return;
        commitOpenFolder(next, {
          ...commitOptions,
          [DEFERRED_CLOSING_GHOST_HANDOFF_OPEN]: true,
        });
      });
    });
  }

  function commitOpenFolder(next, commitOptions) {
    const flowCommitOptions = stripDeferredClosingGhostHandoffOpen(commitOptions);
    if (!commitOptions?.[DEFERRED_CLOSING_GHOST_HANDOFF_OPEN]) deferredFolderOpenAfterCloseHandoffToken += 1;
    if (!next) {
      if (shouldIgnoreFolderCloseRequest({
        isFolderAppLaunchClosing,
        isFolderClosing,
        isFolderZoomFadeClosing,
        openFolderId,
        renderedFolder,
      })) return;
      const closingFolder = renderedFolder.value;
      const closingFolderPage = closingFolder ? getVisibleFolderPage(folderPages.value[folderPageIndex.value] || []) : [];
      const capturedCloseGhosts = captureFolderCloseIconGhosts(closingFolder, closingFolderPage);
      commitOpenFolderNow(next, {
        ...flowCommitOptions,
        waitForCloseGhosts: capturedCloseGhosts.length > 0,
      });
      playFolderCloseIconGhosts(closingFolder?.id, capturedCloseGhosts);
      clearFolderOpenIconGhosts();
      return;
    }

    if (shouldDeferFolderOpenForClosingGhostHandoff(next, {
      folderCloseIconGhosts,
      isFolderAppLaunchClosing,
      isFolderClosing,
      isFolderZoomFadeClosing,
      renderedFolder,
    }, commitOptions)) {
      scheduleFolderOpenAfterClosingGhostHandoff(next, commitOptions);
      return;
    }

    clearFolderCloseIconGhosts();
    if (!shouldPlayFolderOpenIconGhosts(next, {
      isFolderAppLaunchClosing,
      isFolderClosing,
      openFolderId,
      renderedFolder,
    })) {
      commitOpenFolderNow(next, flowCommitOptions);
      return;
    }

    const folder = findFolder(pages.value, next)?.item || null;
    const openingFolderPage = folder ? getVisibleFolderPage(getFolderChildPages(folder, folderPageSize.value)[0] || []) : [];
    const capturedGhosts = captureFolderPreviewIconGhosts(folder, openingFolderPage);
    commitOpenFolderNow(next, flowCommitOptions);
    playFolderOpenIconGhosts(next, capturedGhosts);
  }

  function completeFolderCloseIconGhost(key) {
    const isComplete = completeFolderCloseIconGhostNow(key);
    if (isComplete) finishFolderCloseAfterHandoffFrame();
    return isComplete;
  }

  const {
    folderMotionGeometry,
    getFolderIconMotionGeometry,
    getPageSlotMotionGeometry,
    getTopLevelIconMotionGeometry,
  } = useFolderMotionGeometry({
    folderPages,
    gridCols,
    gridRows,
    iconBoundsRegistry,
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
  });

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
    commitSearchPageIndex: (next) => commitSearchPageIndex(next),
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
    getCurrentIconScope,
    getFolderPages: () => folderPages.value,
    getRenderedFolder: () => renderedFolder.value,
    getSearchPages: () => searchPages.value,
    getSelectedIcon: () => selectedIcon.value,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    gridCols,
    iconBoundsRegistry,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isSearchMode: () => isSearchMode.value,
    openApp: (app, source) => openApp(app, source),
    openFolderId,
    pageIndex,
    pages,
    searchPageIndex,
    selectFirstIconInCurrentScope,
  });
  const {
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearLaunchGhostTimer,
    closeDesktop,
    focusDesktopSurface,
    isAppLaunching,
    isDesktopClosing,
    isDesktopOpen,
    isLaunchpadInteractionBlocked,
    launchGhost,
    launchGhostStyle,
    openApp,
    openDesktop,
  } = useLaunchpadLaunchFlow({
    cancelLongPress: () => cancelLongPress(),
    clearSelectedIcon,
    clearOpeningIcon,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    clearSearch,
    cloneItem,
    desktopMainRef,
    getLaunchIconRect,
    hasFolderLayer: () => Boolean(renderedFolder.value || openFolderId.value),
    hideNativeWindow: () => hideNativeWindow(),
    finishFolderZoomFadeClose,
    finishHomeRevealSettleWindow,
    folderZoomFadeCloseReason,
    isDragActive: () => isDragActive(),
    isFolderAppLaunchClosing,
    isFolderZoomFadeClosing,
    isSearchMode: () => isSearchMode.value,
    keyboardFocusArea,
    getLaunchTargetStatus: (app) => getLaunchTargetStatus(app),
    launchNativeAppIfAvailable: (app) => launchNativeAppIfAvailable(app),
    normalizeLaunchSource,
    openLaunchErrorDialog: (config) => openLaunchErrorDialog(config),
    openingIcon,
    prepareNativeLaunch: (app) => prepareNativeLaunch(app),
    schedulePageGridMetrics: () => schedulePageGridMetrics(),
    searchInputRef,
    setNativeWindowEffectsEnabled: (enabled) => setNativeWindowEffectsEnabled(enabled),
    setNativeWindowFrameEnabled: (enabled) => setNativeWindowFrameEnabled(enabled),
    showNativeLaunchError: (error) => showNativeLaunchError(error),
    shouldValidateLaunchTarget: () => isNativeBridgeAvailable(),
    startFolderAppLaunchClose,
    startFolderZoomFadeClose,
    startHomeRevealSettleWindow,
  });

  const {
    appLaunchGhostTransition,
    backgroundImageStyle,
    desktopVisualTransform,
    desktopTrackMotionKey,
    desktopVisualAlpha,
    launchpadVisualTransform,
    launchpadVisualAlpha,
    homeChromeAnimate,
    homeChromeInitial,
    homeChromeStyle,
    homeChromeTransition,
    isHomeInteractionDisabled,
    panelSpring,
    rootStyle,
    shouldRenderPixiBackgroundEffect,
  } = useLaunchpadViewState({
    backgroundBaseColor,
    backgroundBaseOpacity,
    backgroundAcrylicParams,
    backgroundAcrylicBlurStrength,
    backgroundEffect,
    backgroundBlurStrength: backgroundEffectBlurStrength,
    backgroundDarkenColor,
    backgroundDarkenStrength,
    backgroundImageOpacity,
    backgroundLiveDesktopOpacity,
    backgroundImageLayout,
    backgroundImageUrl,
    backgroundSource,
    iconSize,
    isAppLaunching,
    isDesktopClosing,
    isDesktopOpen,
    isFolderClosing,
    isFolderLayerActive,
    isFolderZoomFadeClosing,
    isHomeRevealSettling,
    isSearchMode,
    liveDesktopBackgroundSupport,
    liveDesktopCssFallbackEffectsEnabled,
    openFolderId,
  });
  const {
    pageGridMeasureStyle,
    schedulePageGridMetrics,
    updatePageGridMetrics,
  } = usePageGridMetrics({
    desktopMainRef,
    headerRef,
    pageDotsRef,
    rootRef,
    searchRef,
  });
  const {
    clearPageJumpRenderRange,
    commitActivePageIndex,
    commitFolderPageTurnRequest,
    commitFolderPageIndex,
    commitPageIndex,
    commitSearchPageIndex,
    getDesktopPageRenderMode,
    getFolderPageRenderMode,
    rebasePageIndices,
    reclampPageIndices,
    requestFolderPageTurn,
  } = usePageRenderRange({
    activePageIndex,
    commitFolderPageIndexState,
    commitPageIndexState,
    commitSearchPageIndexState,
    folderPageIndex,
    folderPageTurnRequest,
    folderPages,
    getDragMeta: () => dragMeta.value,
    isDragActive: () => isDragActive(),
    isSearchMode,
    pageIndex,
    pages,
    commitFolderPageTurnRequest: commitFolderPageTurnRequestState,
    requestFolderPageTurn: requestFolderPageTurnState,
    searchPageIndex,
    searchPages,
    visualFolderPageIndex,
  });
  const {
    clearTransientNoticeTimer,
    clearWarningDialogTimer,
    closeLayoutRecoveryNotice,
    closeTransientNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    isWarningDialogOpen,
    layoutRecoveryNotice,
    transientNotice,
    openLaunchErrorDialog,
    openWarningDialog,
    showLayoutLoadFailed,
    showLayoutLoadRecovered,
    showLayoutSaveFailed,
    showLayoutSaveRecovered,
    showTransientNotice,
    warningDialog,
  } = useLaunchpadNotices();
  const {
    commitChromePageIndex,
    commitPages,
    commitPagesAfterDeletion,
    confirmDissolveFolder,
    confirmForceFillAllPages,
    renameFolder,
  } = useLaunchpadPageCommands({
    assertNoDuplicateItemIds,
    cancelLongPress: () => cancelLongPress(),
    clearSelectedIcon,
    chunkIntoPages,
    clonePages,
    compactPages,
    commitActivePageIndex,
    commitFolderPageIndex,
    commitOpenFolder,
    commitPageIndex,
    commitPagesState,
    commitSearchPageIndex,
    dissolveFolder,
    findFolder,
    finishHomeRevealSettleWindow,
    flattenTopLevelPages,
    folderPageIndex,
    folderPageSize,
    isFolderClosing,
    isHomeRevealSettling,
    isDragActive: () => isDragActive(),
    openFolderId,
    openWarningDialog,
    pageIndex,
    pages,
    pageSize,
    rebasePageIndices,
    renderedFolder,
    schedulePageGridMetrics,
    searchPageIndex,
    selectedIcon,
  });

  function requestFolderRename(folderId) {
    if (!folderId || isDragActive()) return;
    const folder = findFolder(pages.value, folderId);
    if (!folder) return;
    folderRenameRequestToken += 1;
    folderRenameRequest.value = { folderId, token: folderRenameRequestToken };
    commitOpenFolder(folderId);
  }

  function completeFolderRenameRequest(token) {
    if (folderRenameRequest.value?.token !== token) return;
    folderRenameRequest.value = null;
  }
  const apps = useLaunchpadApps({
    appendAppsToPages,
    cancelLongPress: () => requireDragControls().cancelLongPress(),
    clearSelectedIcon,
    cloneItem,
    clonePages,
    collectAppsFromPages,
    commitOpenFolder,
    commitPages,
    commitPagesAfterDeletion,
    findFolder,
    isDragActive: () => requireDragControls().isDragActive(),
    makeId,
    markLaunchCriticalLayoutDirty: (appId) => markLaunchCriticalLayoutDirty(appId),
    openFolderId,
    openWarningDialog,
    pages,
    reclampPageIndices,
    removeEverywhere,
    renderedFolder,
    schedulePageGridMetrics,
    selectedIcon,
    showTransientNotice,
    shouldUseNativeCatalog: () => isNativeBridgeAvailable(),
  });
  const {
    addScanKeywordBlacklistItem,
    addScanRoot,
    appManagerSearchQuery,
    appManagerSelectedIds,
    browseScanRootDirectory,
    canBrowseScanRoots,
    canExcludeManagedAppFromScan,
    canExcludeSelectedManagedAppsFromScan,
    canScanManagedApps,
    cancelScanAppExclusion,
    cancelScanAppExclusions,
    changeScanRootLabel,
    changeScanRootPath,
    clearManagedAppSelection,
    confirmResetScanRoots,
    editorModel,
    excludeManagedAppFromScan,
    excludeSelectedManagedAppsFromScan,
    filteredManagedApps,
    getLaunchTargetPath,
    iconChooserModel,
    isBrowsingScanRoot,
    isScanningApps,
    managedApps,
    newScanKeyword,
    openCreateManagedApp,
    openEditManagedApp,
    openExistingAppIconChooser,
    removeManagedAppFromLaunchpad,
    removeSelectedManagedAppsFromLaunchpad,
    removeScanKeywordBlacklistItem,
    removeScanRoot,
    rescanManagedApps,
    resetAppCustomIcon,
    scanResultModel,
    selectAllManagedApps,
    selectedManagedAppCount,
    syncManagedAppState,
    toggleManagedAppSelection,
    toggleMissingLaunchTargetBadge,
    toggleScanRootEnabled,
    updateAppCustomIcon,
  } = apps;
  const {
    hiddenAppIds,
    launchTargetStatusById,
    scanAppBlacklist,
    scanKeywordBlacklist,
    scanRoots,
    showMissingLaunchTargetBadge,
  } = apps.presentation;
  const documentCoordinator = createLaunchpadDocumentCoordinator({
    apps: apps.persistence,
    layout: layout.documentPersistence,
    settings: settings.persistence,
    toAssetUrl: catalogPort.toAssetUrl,
  });
  const {
    clearSettingsPanelCloseTimer,
    closeSettingsPanel,
    isSettingsPanelOpen,
    openSettingsPanel,
    settingsOverlayAnimate,
    settingsPanelAnimate,
    settingsPanelCloseDurationSeconds,
    settingsPanelInitial,
    shouldRenderSettingsPanel,
  } = useSettingsPanelFlow({
    beginSettingsEdit: settings.beginEdit,
    cancelSettingsEdit: settings.cancelEdit,
    closeManagedAppEditor: editorModel.actions.cancel,
    closeScanResults: scanResultModel.actions.close,
    isDragActive: () => isDragActive(),
  });
  const {
    canUseDraftBackgroundEffect,
    canUseLiveDesktopBackground,
    canUseLiveDesktopBackgroundEffect,
    canUseWindowEffectMaterial,
    changeDraftBackgroundBaseOpacity,
    changeDraftBackgroundImageOpacity,
    changeDraftBackgroundLiveDesktopOpacity,
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    chooseDraftBackgroundImage,
    clearDraftBackgroundImage,
    clampIconSize,
    setDraftBackgroundBlurStrength,
    setDraftBackgroundAcrylicBlurStrength,
    setDraftBackgroundDarkenColor,
    setDraftBackgroundDarkenStrength,
    setDraftBackgroundImageLayout,
    setDraftBackgroundImageOpacity,
    setDraftBackgroundLiveDesktopOpacity,
    setDraftBackgroundAcrylicAppearance,
    setDraftBackgroundAcrylicParam,
    setDraftBackgroundBaseColor,
    setDraftBackgroundBaseOpacity,
    setDraftBackgroundEffect,
    setDraftBackgroundSource,
    resetDraftBackgroundAcrylicParams,
    setDraftFolderIconSizeMode,
    setDraftFullscreenOverscanEnabled,
    setDraftMainWindowShortcut,
    setMainWindowShortcutError,
    setDraftShowCustomTitlebar,
    setDraftWindowMode,
    setDraftWindowEffectAppearance,
    setDraftWindowEffectMaterial,
    useDraftDesktopWallpaper,
  } = settings.actions;
  const {
    clearNativeEventListeners,
    clearNativeSaveTimer,
    flushNativeLayoutSave,
    getLaunchTargetStatus,
    hideNativeWindow,
    hideNativeWindowAfterCloseAnimation,
    isNativeLayoutReady,
    mainWindowDisplayRevision,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    markLaunchCriticalLayoutDirty,
    prepareNativeLaunch,
    refreshLiveDesktopRuntimeStatus,
    registerEventHandlers,
    registerNativeEventListeners,
    restartLiveDesktopBackgroundRuntime,
    scheduleNativeLayoutSave,
    scheduleLaunchTargetStatusCheck,
    setNativeMainWindowShortcutCaptureActive,
    setNativeWindowMode,
    setNativeWindowEffectsEnabled,
    setNativeWindowFrameEnabled,
    showNativeWindowAfterStartup,
    showNativeLaunchError,
    startNativeLiveDesktopBackground,
    stopNativeLiveDesktopBackground,
    syncLiveDesktopBackgroundRuntime,
    syncWindowsWallpaperRefreshTimer,
    shouldUseNativeCatalog,
  } = useLaunchpadNative({
    apps: apps.nativeIntegration,
    document: documentCoordinator,
    mainWindowRuntime,
    liveDesktopRuntime,
    notices: {
      showLayoutLoadFailed,
      showLayoutLoadRecovered,
      showLayoutSaveFailed,
      showLayoutSaveRecovered,
    },
    settings: settings.nativeIntegration,
  });
  registerEventHandlers({
    closeDesktop,
    closeSettingsPanel,
    focusDesktopSurface,
    handleLayoutRecovered,
    hasRenderedFolder: () => Boolean(renderedFolder.value),
    isDesktopOpen: () => isDesktopOpen.value,
    isSettingsPanelOpen: () => isSettingsPanelOpen.value,
    openDesktop,
    openSettingsPanel,
    reclampLayoutPageIndices: () => {
      reclampPageIndices();
      commitFolderPageIndex(folderPageIndex.value);
    },
    schedulePageGridMetrics,
    startFolderZoomFadeClose,
  });
  async function applySettingsConfig() {
    const outcome = await settings.applyEdit({
      reclampPageIndices: () => {
        reclampPageIndices();
        commitFolderPageIndex(folderPageIndex.value);
      },
      schedulePageGridMetrics,
      syncLiveDesktop: () => syncLiveDesktopBackgroundRuntime(),
    });
    if (outcome.ok) closeSettingsPanel();
    return outcome;
  }
  dragControls = useLaunchpadDrag({
    canCreateDesktopPageAfterDrag,
    canCreateFolderPageAfterDrag,
    cloneItem,
    clonePages,
    clearFolderPageTurnRequest,
    commitFolderPageTurnRequest,
    commitFolderPageIndex,
    commitFolderSession,
    commitOpenFolder,
    consumeFirstFolderOpenPrepare,
    commitPageIndex,
    commitPages,
    compactPages,
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
    folderPanelStyle,
    folderSession,
    folderViewportHeight,
    getFolderChildPages,
    getPageSlotMotionGeometry,
    getTopLevelIconMotionGeometry,
    gridCols,
    gridRows,
    iconBoundsRegistry,
    iconSize,
    effectiveFolderIconSize,
    insertAppIntoFolder,
    insertTopLevelItem,
    isFolderLayerActive,
    isHomeRevealSettling,
    isLayoutProjectionActive,
    isLaunchpadInteractionBlocked,
    isTextlessMode,
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
    requestFolderPageTurn,
    requestFolderOpenWarmup,
    replaceFolderWithItem,
    visualFolderPageIndex,
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
    clearDragRelease,
    clearLayoutProjectionRelease,
    clearPageTurn,
    clearPendingTarget,
    detachDragListeners,
    dragFolderHoverState,
    dragFolderTargetId,
    dragHitDebugState,
    dragMeta,
    dragPreviewState,
    dragReleaseState,
    folderCreateReleaseState,
    clearFolderCreateRelease,
    completeFolderCreateRelease,
    isDragActive,
  } = dragControls;
  const {
    cancelAltEditMode,
    clearAltEditTimer,
    handleAltKeyDown,
    handleAltKeyUp,
    handleWindowBlur,
    isAltKeyEvent,
    isEditMode,
  } = useAltEditMode({
    isDragActive,
  });
  function closeTopmostModalFromKeyboard() {
    if (warningDialog.value) {
      closeWarningDialog();
      return true;
    }
    if (iconChooserModel.chooser.value) {
      iconChooserModel.actions.close();
      return true;
    }
    if (editorModel.isOpen.value) {
      editorModel.actions.cancel();
      return true;
    }
    if (scanResultModel.isOpen.value) {
      scanResultModel.actions.close();
      return true;
    }
    if (isSettingsPanelOpen.value) {
      closeSettingsPanel();
      return true;
    }
    return false;
  }

  function isModalOpenForKeyboard() {
    return Boolean(
      warningDialog.value ||
      iconChooserModel.chooser.value ||
      editorModel.isOpen.value ||
      scanResultModel.isOpen.value ||
      isSettingsPanelOpen.value
    );
  }

  const {
    handleGlobalKeydown,
    handleLaunchpadWheel,
  } = useLaunchpadKeyboard({
    closeTopmostModal: closeTopmostModalFromKeyboard,
    cancelAltEditMode,
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
    folderPageTurnRequest,
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
    isFolderZoomFadeClosing,
    isHomeRevealSettling,
    isModalOpen: isModalOpenForKeyboard,
    isSearchMode,
    keyboardFocusArea,
    moveSelectionByArrow,
    openDesktop,
    openFolderId,
    openSelectedIcon,
    pageIndex,
    pages,
    renderedFolder,
    requestFolderPageTurn,
    schedulePageGridMetrics,
    searchInputRef,
    searchPageIndex,
    searchPages,
    searchQuery,
    selectFirstIconInCurrentScope,
    selectedIcon,
    selectionMatchesScope,
    startFolderZoomFadeClose,
    visualFolderPageIndex,
  });
  const {
    folderPageTrackScrub,
    handleDesktopSurfacePointerDown,
    handleFolderPanelPointerDown,
    handleFolderOverlayPointerDown,
    pageTrackScrub,
    setFolderPageRef,
    setPageRef,
  } = useLaunchpadSurfaceInteractions({
    closeDesktop,
    commitActivePageIndex,
    commitOpenFolder,
    activePageIndex,
    activePages,
    getDesktopTargetAtPoint: (x, y, options = {}) => iconBoundsRegistry.getAtPoint(BOUNDS_KIND.LAUNCH, x, y, options),
    commitFolderPageIndex,
    folderPageIndex,
    folderPages,
    folderPageRefs,
    folderPanelRef,
    folderViewportRef,
    hideNativeWindowAfterCloseAnimation,
    isAppLaunching,
    isDesktopOpen,
    isSearchMode,
    isDragActive,
    isFolderAppLaunchClosing,
    isFolderClosing,
    openFolderId,
    pageRefs,
    renderedFolder,
    rootRef,
  });

  useLaunchpadLifecycle({
    backgroundBaseColor,
    backgroundBaseOpacity,
    activePages,
    backgroundAcrylicAppearance,
    backgroundAcrylicBlurStrength,
    backgroundAcrylicDarkParams,
    backgroundAcrylicLightParams,
    backgroundEffect,
    backgroundBlurStrength,
    backgroundDarkenColor,
    backgroundDarkenStrength,
    backgroundImageOpacity,
    backgroundLiveDesktopOpacity,
    backgroundImageLayout,
    backgroundImagePath,
    backgroundSource,
    cancelLongPress,
    cancelPreviewRaf,
    clearAltEditTimer,
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderCloseHandoffFrame,
    clearFolderPageTurn,
    clearDragRelease,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    clearHomeRevealSettleTimer,
    clearLaunchGhostTimer,
    clearTransientNoticeTimer,
    clearLayoutProjectionRelease,
    clearNativeEventListeners,
    clearNativeSaveTimer,
    flushNativeLayoutSave,
    clearPageJumpRenderRange,
    clearPageTurn,
    clearPendingTarget,
    clearSettingsPanelCloseTimer,
    clearWarningDialogTimer,
    desktopMainRef,
    detachDragListeners,
    disconnectFolderViewportObserver,
    disposeSettingsPanelModel,
    effectiveFolderIconSize,
    filteredManagedApps,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderRows,
    folderViewportRef,
    gridCols,
    gridRows,
    handleAltKeyUp,
    handleGlobalKeydown,
    handleWindowBlur,
    headerRef,
    hiddenAppIds,
    iconSize,
    isSearchMode,
    isDesktopOpen,
    isTextlessMode,
    launchTargetStatusById,
    loadNativeLaunchpadData,
    observeFolderViewport,
    pageDotsRef,
    pages,
    registerNativeEventListeners,
    renderedFolder,
    rootRef,
    scanAppBlacklist,
    scanKeywordBlacklist,
    scanRoots,
    scheduleFolderViewportMetrics,
    scheduleLaunchTargetStatusCheck,
    scheduleNativeLayoutSave,
    schedulePageGridMetrics,
    searchRef,
    showNativeWindowAfterStartup,
    showCustomTitlebar,
    showMissingLaunchTargetBadge,
    syncLiveDesktopBackgroundRuntime,
    syncWindowsWallpaperRefreshTimer,
    syncManagedAppState,
    updateFolderViewportHeight,
    updatePageGridMetrics,
    visibleFolderRowCount,
    fullscreenOverscanEnabled,
    windowMode,
    windowEffectAppearance,
    windowEffectMaterial,
  });

  const shell = {
    rootRef,
    cx,
    isTextlessMode,
    isDesktopOpen,
    isDesktopClosing,
    isHomeInteractionDisabled,
    isAppLaunching,
    isNativeLayoutReady,
    isEditMode,
    handleLaunchpadWheel,
    shellRef,
    showCustomTitlebar,
    windowMode,
  };

  const background = {
    backgroundLayoutContext,
    rootStyle,
    backgroundImageStyle,
    backgroundAcrylicParams,
    backgroundEffect,
    backgroundEffectBlurStrength,
    backgroundImageOpacity,
    backgroundImageLayout,
    backgroundImagePath,
    backgroundImageUrl,
    backgroundSource,
    liveDesktopCssFallbackEffectsEnabled,
    liveDesktopRuntimeStatus,
    mainWindowDisplayRevision,
    shouldRenderPixiBackgroundEffect,
  };

  const chrome = {
    activePageIndex,
    activePages,
    commitChromePageIndex,
    dragMeta,
    headerRef,
    homeChromeAnimate,
    homeChromeInitial,
    homeChromeStyle,
    homeChromeTransition,
    isSearchMode,
    openSettingsPanel,
    pageDotsRef,
    searchQuery,
  };

  const search = {
    clearSearch,
    handleSearchInput,
    isSearchMode,
    keyboardFocusArea,
    searchInputRef,
    searchQuery,
    searchRef,
  };

  const appActions = {
    canExcludeManagedAppFromScan,
    excludeManagedAppFromScan,
    getLaunchTargetPath,
    openApp,
    openEditManagedApp,
    openExistingAppIconChooser,
    removeManagedAppFromLaunchpad,
    resetAppCustomIcon,
    showMissingLaunchTargetBadge,
  };

  const desktopSurface = {
    activePageIndex,
    activePages,
    beginDrag,
    clearDragRelease,
    commitActivePageIndex,
    desktopMainRef,
    desktopProjectionEpoch,
    desktopTrackMotionKey,
    desktopVisualAlpha,
    desktopVisualTransform,
    dragFolderHoverState,
    dragFolderTargetId,
    dragHitDebugState,
    dragMeta,
    dragPreviewState,
    dragReleaseState,
    folderCreateReleaseState,
    clearFolderCreateRelease,
    completeFolderCreateRelease,
    folderOpenPreviewFrameGhostedIds,
    folderPageSize,
    getDesktopPageRenderMode,
    getVisibleDesktopPage,
    gridCols,
    gridRows,
    handleDesktopSurfacePointerDown,
    iconBoundsRegistry,
    iconSize,
    isEditMode,
    isHomeRevealSettling,
    isIconOpening,
    isSearchMode,
    isTextlessMode,
    launchTargetStatusById,
    launchpadVisualAlpha,
    launchpadVisualTransform,
    openApp,
    openExistingAppIconChooser,
    pageGridMeasureStyle,
    pageTrackScrub,
    resetAppCustomIcon,
    schedulePageGridMetrics,
    selectedIcon,
    setPageRef,
    showMissingLaunchTargetBadge,
  };

  const folderFlow = {
    finishFolderZoomFadeClose,
    folderOpenPreviewFrameGhostedIds,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isFolderLayerActive,
    isFolderOpeningPreviewFrameGhosted,
    isFolderZoomFadeClosing,
    isFolderZoomFadeClosingFromFolderClose,
    isHomeRevealSettling,
    openFolderId,
    renderedFolder,
    startFolderZoomFadeClose,
  };

  const settingsPanel = {
    addScanKeywordBlacklistItem,
    addScanRoot,
    appManagerSearchQuery,
    appManagerSelectedIds,
    applySettingsConfig,
    browseScanRootDirectory,
    canBrowseScanRoots,
    canScanManagedApps,
    canExcludeManagedAppFromScan,
    canExcludeSelectedManagedAppsFromScan,
    canUseDraftBackgroundEffect,
    canUseLiveDesktopBackground,
    canUseLiveDesktopBackgroundEffect,
    canUseWindowEffectMaterial,
    changeDraftBackgroundBaseOpacity,
    changeDraftBackgroundImageOpacity,
    changeDraftBackgroundLiveDesktopOpacity,
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    changeScanRootLabel,
    changeScanRootPath,
    chooseDraftBackgroundImage,
    clearDraftBackgroundImage,
    clearManagedAppSelection,
    closeSettingsPanel,
    confirmForceFillAllPages,
    confirmResetScanRoots,
    cancelScanAppExclusion,
    cancelScanAppExclusions,
    draftBackgroundAcrylicAppearance,
    draftBackgroundAcrylicBlurStrength,
    draftBackgroundAcrylicDarkParams,
    draftBackgroundAcrylicLightParams,
    draftBackgroundBaseColor,
    draftBackgroundBaseOpacity,
    draftBackgroundBlurStrength,
    draftBackgroundDarkenColor,
    draftBackgroundDarkenStrength,
    draftBackgroundEffect,
    draftBackgroundImageLayout,
    draftBackgroundImageOpacity,
    draftBackgroundImagePath,
    draftBackgroundImageUrl,
    draftBackgroundLiveDesktopOpacity,
    draftBackgroundSource,
    draftCols,
    draftFolderCols,
    draftFolderIconSize,
    draftFolderIconSizeMode,
    draftFolderRows,
    draftFullscreenOverscanEnabled,
    draftIconSize,
    draftIsTextlessMode,
    draftMainWindowShortcut,
    draftRows,
    draftShowCustomTitlebar,
    draftWindowEffectAppearance,
    draftWindowEffectMaterial,
    draftWindowMode,
    dragMeta,
    editorModel,
    filteredManagedApps,
    getLaunchTargetPath,
    excludeManagedAppFromScan,
    excludeSelectedManagedAppsFromScan,
    isApplyingSettingsConfig,
    isBrowsingScanRoot,
    isChoosingBackgroundImage,
    isScanningApps,
    isSettingsPanelOpen,
    isTextlessMode,
    fullscreenOverscanEnabled,
    liveDesktopBackgroundSupport,
    liveDesktopRuntimeStatus,
    mainWindowShortcutError,
    managedApps,
    newScanKeyword,
    openSettingsPanel,
    panelSpring,
    refreshLiveDesktopRuntimeStatus,
    removeManagedAppFromLaunchpad,
    removeSelectedManagedAppsFromLaunchpad,
    removeScanKeywordBlacklistItem,
    removeScanRoot,
    rescanManagedApps,
    resetDraftBackgroundAcrylicParams,
    restartLiveDesktopBackgroundRuntime,
    scanAppBlacklist,
    scanKeywordBlacklist,
    scanRoots,
    selectedManagedAppCount,
    selectAllManagedApps,
    setDraftBackgroundAcrylicAppearance,
    setDraftBackgroundAcrylicBlurStrength,
    setDraftBackgroundAcrylicParam,
    setDraftBackgroundBaseColor,
    setDraftBackgroundBaseOpacity,
    setDraftBackgroundBlurStrength,
    setDraftBackgroundDarkenColor,
    setDraftBackgroundDarkenStrength,
    setDraftBackgroundEffect,
    setDraftBackgroundImageLayout,
    setDraftBackgroundImageOpacity,
    setDraftBackgroundLiveDesktopOpacity,
    setDraftBackgroundSource,
    setDraftFolderIconSizeMode,
    setDraftFullscreenOverscanEnabled,
    setDraftMainWindowShortcut,
    setMainWindowShortcutError,
    setDraftShowCustomTitlebar,
    setDraftWindowEffectAppearance,
    setDraftWindowEffectMaterial,
    setDraftWindowMode,
    setMainWindowShortcutCaptureActive: setNativeMainWindowShortcutCaptureActive,
    settingsOverlayAnimate,
    settingsPanelAnimate,
    settingsPanelCloseDurationSeconds,
    settingsPanelInitial,
    shouldRenderSettingsPanel,
    showMissingLaunchTargetBadge,
    syncLiveDesktopBackgroundRuntime,
    toggleManagedAppSelection,
    toggleMissingLaunchTargetBadge,
    toggleScanRootEnabled,
    useDraftDesktopWallpaper,
    windowEffectsSupport,
  };
  const settingsPanelModel = useSettingsPanelModel({
    appVersion: options.appVersion,
    backgroundLayoutContext,
    capabilities: settingsPanel,
    systemAppearance,
  });
  settingsPanelModelDisposer = settingsPanelModel.dispose;

  const dialogs = {
    clearLayoutRecoveryNotice: closeLayoutRecoveryNotice,
    clearTransientNotice: closeTransientNotice,
    closeLayoutRecoveryNotice,
    closeTransientNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    editorModel,
    iconChooserModel,
    isWarningDialogOpen,
    layoutRecoveryNotice,
    transientNotice,
    scanResultModel,
    showLayoutLoadFailed,
    showLayoutLoadRecovered,
    showLayoutSaveFailed,
    showLayoutSaveRecovered,
    warningDialog,
  };

  const folderOverlay = {
    activePageIndex,
    activePages,
    beginDrag,
    commitFolderPageIndex,
    commitOpenFolder,
    completeFolderRenameRequest,
    confirmDissolveFolder,
    completeFolderCloseIconGhost,
    completeFolderOpenFrameGhost,
    completeFolderOpenIconGhost,
    finishFolderZoomFadeClose,
    folderCloseIconGhosts,
    folderGridStyle,
    folderOpeningOriginBounds,
    folderOpenProgress,
    folderOpenProgressTarget,
    folderOpenIconGhosts,
    folderOpenPreviewFrameGhostedIds,
    folderOpenWarmupRequest,
    openFolderId,
    folderPageIndex,
    folderPageTurnRequest,
    folderPages,
    folderPageSize,
    folderPageTrackScrub,
    folderRenameRequest,
    folderPanelRef,
    folderPanelStyle,
    folderViewportRef,
    folderZoomFadeCloseReason,
    clearFolderPageTurnRequest,
    commitFolderPageTurnRequest,
    requestFolderPageTurn,
    getFolderPageRenderMode,
    getVisibleFolderPage,
    handleFolderOverlayPointerDown,
    handleFolderPanelPointerDown,
    isEditMode,
    isFolderAppLaunchClosing,
    isFolderCloseIconAnimationActive,
    isFolderClosing,
    isFolderClosingIconGhosted,
    isFolderOpenFrameGhostPending,
    isFolderOpenIconAnimationActive,
    isFolderOpeningIconGhosted,
    isFolderZoomFadeClosing,
    isFolderZoomFadeClosingFromFolderClose,
    isIconOpening,
    isTextlessMode,
    launchTargetStatusById,
    openExistingAppIconChooser,
    renderedFolder,
    requestFolderRename,
    renameFolder,
    resetAppCustomIcon,
    setFolderPageRef,
    showMissingLaunchTargetBadge,
    visualFolderPageIndex,
  };

  const overlays = {
    appLaunchGhostTransition,
    canExcludeManagedAppFromScan,
    launchGhost,
    launchGhostStyle,
  };

  return {
    appActions,
    background,
    chrome,
    desktopSurface,
    dialogs,
    folderFlow,
    folderOverlay,
    search,
    settingsPanel,
    settingsPanelModel,
    shell,
    overlays,
  };
}
