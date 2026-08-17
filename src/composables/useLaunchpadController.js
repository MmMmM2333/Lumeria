import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { createLaunchpadDocumentCoordinator } from "../application/launchpadDocumentCoordinator.js";
import { cx } from "../domain/launchpadLayout.js";
import { resolveAppearancePreference } from "../domain/appearancePreference.js";
import { isNativeBridgeAvailable } from "../api/launchpadApi.js";
import {
  catalogPort,
  nativeLifecyclePort,
} from "../platform/launchpadPorts.js";
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
import { useIconFocus } from "./useIconFocus.js";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";
import { useLaunchpadLifecycle } from "./useLaunchpadLifecycle.js";
import { useLaunchpadLayout } from "./useLaunchpadLayout.js";
import { useLiveDesktopRuntime } from "./useLiveDesktopRuntime.js";
import { useMainWindowRuntime } from "./useMainWindowRuntime.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";
import { useLaunchpadNotices } from "./useLaunchpadNotices.js";
import { useLaunchpadPageCommands } from "./useLaunchpadPageCommands.js";
import { useLaunchpadPageNavigation } from "./useLaunchpadPageNavigation.js";
import { useLaunchpadSearch } from "./useLaunchpadSearch.js";
import { useLaunchpadSettings } from "./useLaunchpadSettings.js";
import { useLaunchpadInputGestures } from "./useLaunchpadInputGestures.js";
import { useLaunchpadSelectionSession } from "./useLaunchpadSelectionSession.js";
import { useLaunchpadViewState } from "./useLaunchpadViewState.js";
import { planGroupTransfer } from "../domain/groupTransferPlanner.js";
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
} from "../rendering/desktopScenePort.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;

export function isMultiSelectFixtureEnabled(
  search = typeof window === "undefined" ? "" : window.location.search,
  isDev = Boolean(import.meta.env?.DEV)
) {
  if (!isDev) return false;
  return new URLSearchParams(String(search || "")).get("fixture") === "multi-select";
}

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
  const localizationText = options.localizationText;
  const activateLocale = options.activateLocale;
  if (!localizationText || typeof localizationText.t !== "function" || typeof activateLocale !== "function") {
    throw new TypeError("useLaunchpadController requires localizationText");
  }
  const iconBoundsRegistry = createIconBoundsRegistry();
  const systemAppearance = useSystemAppearance();
  const liveDesktopRuntime = useLiveDesktopRuntime();
  const liveDesktopBackgroundSupport = liveDesktopRuntime.support;
  const liveDesktopRuntimeStatus = liveDesktopRuntime.status;
  const mainWindowRuntime = useMainWindowRuntime({ systemAppearance });
  const windowEffectsSupport = mainWindowRuntime.support;
  const isMultiSelectFixture = isMultiSelectFixtureEnabled();
  const nativeIntegrationEnabled = isNativeBridgeAvailable() && !isMultiSelectFixture;
  const nativePlatform = isMultiSelectFixture
    ? Object.freeze({
      ...nativeLifecyclePort,
      isAvailable: () => false,
    })
    : undefined;
  const layout = useLaunchpadLayout({
    getNewFolderName: () => localizationText.t("launchpad.newFolder"),
    seedEnabled: !nativeIntegrationEnabled,
  });
  let dragControls = null;
  let openScanKeywordSettings = null;
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
    activateLocale,
    isDragActive: () => requireDragControls().isDragActive(),
    layout,
    liveDesktopSupport: liveDesktopBackgroundSupport,
    localizationText,
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
    canCustomizeLaunchpadIcon,
    launchpadIconError,
    launchpadIconVariant,
    localePreference,
    localePreferenceError,
    mainWindowShortcut,
    mainWindowShortcutError,
    settingsThemePreference,
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
    localePreference: draftLocalePreference,
    launchpadIconVariant: draftLaunchpadIconVariant,
    mainWindowShortcut: draftMainWindowShortcut,
    settingsThemePreference: draftSettingsThemePreference,
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
    chunkIntoPages,
    cloneItem,
    clonePages,
    collectAppsFromPages,
    compactPages,
    createLayoutSnapshot,
    dissolveFolder,
    findFolder,
    findInFolder,
    findTopLevel,
    flattenTopLevelPages,
    folderPreviewSlots,
    getFolderChildPages,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    getVisibleFolderPages,
    makeId,
    removeEverywhere,
    repackFoldersForPageSize,
    withFolderPages,
  } = layout.operations;
  const batchSelection = useLaunchpadSelectionSession();
  const batchLayoutRevision = ref(0);
  const batchSelectedPageCounts = computed(() => (
    pages.value.map((page) => (page || []).reduce((count, item) => {
      if (item?.type === "app") return count + (batchSelection.isSelected(item.id) ? 1 : 0);
      if (item?.type !== "folder") return count;
      return count + getFolderChildPages(item, folderPageSize.value)
        .flat()
        .reduce((childCount, child) => childCount + (batchSelection.isSelected(child?.id) ? 1 : 0), 0);
    }, 0))
  ));
  const batchCurrentScope = computed(() => {
    const scope = getCurrentIconScope();
    const folderId = scope.folderId || null;
    return {
      items: (scope.items || []).filter((item) => item?.type === "app"),
      key: `${scope.area}:${folderId || ""}:${scope.pageIndex}`,
    };
  });
  const batchCurrentScopeSelectedCount = computed(() => (
    batchCurrentScope.value.items.reduce(
      (count, item) => count + (batchSelection.isSelected(item.id) ? 1 : 0),
      0
    )
  ));
  const batchHiddenSelectedCount = computed(() => Math.max(
    0,
    batchSelection.selectedCount.value - batchCurrentScopeSelectedCount.value
  ));
  watch(
    pages,
    (nextPages) => {
      batchLayoutRevision.value += 1;
      batchSelection.reconcile(nextPages);
    },
    { flush: "sync" }
  );
  const backgroundAcrylicEffectiveAppearance = computed(() => {
    return resolveAppearancePreference(
      normalizeBackgroundAcrylicAppearance(backgroundAcrylicAppearance.value),
      systemAppearance.value,
      BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
    );
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
    clearFocusedIcon,
    findFocusedItem,
    isIconOpening,
    moveFocusByArrow,
    openingIcon,
    focusFirstIconInCurrentScope,
    focusedIcon,
    focusMatchesScope,
  } = useIconFocus({ getCurrentIconScope: () => getCurrentIconScope() });

  const {
    acceptFolderOpenIconGhostSession,
    captureFolderCloseIconGhosts,
    captureFolderPreviewIconGhosts,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    completeFolderCloseIconGhost: completeFolderCloseIconGhostNow,
    completeFolderOpenFrameGhost,
    completeFolderOpenIconGhost,
    folderCloseIconGhosts,
    folderOpenIconGhosts,
    folderOpenIconGhostSession,
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
    cancelFolderOpening: cancelFolderOpeningFlow,
    commitOpenFolder: commitOpenFolderNow,
    desktopProjectionEpoch,
    finishFolderCloseAfterHandoffFrame,
    finishFolderZoomFadeClose,
    finishHomeRevealSettleWindow,
    consumeFirstFolderOpenPrepare,
    folderOpenProgress,
    folderOpenProgressTarget,
    folderOpenWarmupRequest,
    folderOpeningCancelRequest,
    folderOpeningOriginBounds,
    folderPages,
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
  const projectedPagesForLayout = shallowRef(null);
  const folderPagesForLayout = computed(() => {
    if (
      isFolderClosing.value ||
      isFolderAppLaunchClosing.value ||
      isFolderZoomFadeClosing.value
    ) return folderPages.value;
    const folderId = renderedFolder.value?.id || openFolderId.value;
    const projectedPages = projectedPagesForLayout.value;
    if (!folderId || !Array.isArray(projectedPages)) return folderPages.value;
    const projectedFolder = projectedPages
      .flatMap((page) => page || [])
      .find((item) => item?.type === "folder" && item.id === folderId);
    if (!projectedFolder) return folderPages.value;
    return Array.isArray(projectedFolder.childPages) ? projectedFolder.childPages : [[]];
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
      const excludedCloseGhostIds = new Set(commitOptions?.excludeCloseGhostIds || []);
      const capturedCloseGhosts = captureFolderCloseIconGhosts(closingFolder, closingFolderPage)
        .filter((ghost) => !excludedCloseGhostIds.has(ghost.item?.id));
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
    folderPagesForLayout,
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
    clearFocusedIcon,
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
    focusFirstIconInCurrentScope,
  });
  const {
    getLaunchIconRect,
    normalizeLaunchSource,
    openFocusedIcon,
  } = useLaunchpadIconActivation({
    clearFocusedIcon,
    commitOpenFolder,
    findInFolder,
    findFocusedItem,
    findTopLevel,
    folderCols,
    folderPageIndex,
    getCurrentIconScope,
    getFolderPages: () => folderPages.value,
    getRenderedFolder: () => renderedFolder.value,
    getSearchPages: () => searchPages.value,
    getFocusedIcon: () => focusedIcon.value,
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
    focusFirstIconInCurrentScope,
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
    cancelInputGesture: () => cancelInputGesture(),
    clearFocusedIcon,
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
    localizationText,
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
    shouldValidateLaunchTarget: () => nativeIntegrationEnabled,
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
    closeTransientNotice,
    closeWarningDialog,
    confirmWarningDialog,
    isWarningDialogOpen,
    transientNotice,
    openLaunchErrorDialog,
    openWarningDialog,
    showLayoutLoadFailed,
    showLayoutLoadRecovered,
    showLayoutSaveFailed,
    showLayoutSaveRecovered,
    showTransientNotice,
    warningDialog,
  } = useLaunchpadNotices({ localizationText });
  const {
    commitChromePageIndex,
    commitPages,
    commitPagesAfterDeletion,
    confirmDissolveFolder,
    confirmForceFillAllPages,
    renameFolder,
  } = useLaunchpadPageCommands({
    assertNoDuplicateItemIds,
    cancelInputGesture: () => cancelInputGesture(),
    clearFocusedIcon,
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
    localizationText,
    openFolderId,
    openWarningDialog,
    pageIndex,
    pages,
    pageSize,
    rebasePageIndices,
    renderedFolder,
    schedulePageGridMetrics,
    searchPageIndex,
    focusedIcon,
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
    localizationText,
    cancelInputGesture: () => cancelInputGesture(),
    clearFocusedIcon,
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
    openScanKeywordSettings: () => {
      if (typeof openScanKeywordSettings !== "function") {
        throw new Error("Scan keyword settings navigation was used before controller wiring completed");
      }
      openScanKeywordSettings();
    },
    openWarningDialog,
    pages,
    reclampPageIndices,
    removeEverywhere,
    renderedFolder,
    schedulePageGridMetrics,
    focusedIcon,
    showTransientNotice,
    shouldUseNativeCatalog: () => nativeIntegrationEnabled,
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
    excludeManagedAppsFromScan,
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
    removeManagedAppsFromLaunchpad,
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
    excludedScanApps,
    hiddenAppIds,
    launchTargetStatusById,
    scanAppBlacklist,
    scanKeywordAllowlist,
    scanKeywordBlacklist,
    scanRoots,
    showMissingLaunchTargetBadge,
  } = apps.presentation;
  const batchSelectedApps = computed(() => {
    const selectedIds = batchSelection.selectedIds.value;
    return managedApps.value.filter((app) => selectedIds.has(app.id));
  });
  const canExcludeBatchSelectionFromScan = computed(() => (
    batchSelection.selectedCount.value > 0
    && batchSelectedApps.value.length === batchSelection.selectedCount.value
    && batchSelectedApps.value.every(canExcludeManagedAppFromScan)
  ));

  function beginBatchSelection(item = null) {
    if (isEditMode.value) return false;
    if (!item) {
      cancelInputGesture();
      cancelAltEditMode();
      batchSelection.begin({ initialIds: [], primaryId: null });
      return true;
    }
    if (item?.type !== "app" || !item.id) return false;
    const liveApp = collectAppsFromPages(pages.value).find((candidate) => candidate.id === item.id);
    if (!liveApp) return false;
    cancelInputGesture();
    cancelAltEditMode();
    batchSelection.begin({ initialIds: [item.id], primaryId: item.id });
    return true;
  }

  function toggleBatchSelection(item, event = {}) {
    if (!batchSelection.isActive.value || item?.type !== "app") return false;
    return batchSelection.toggle(item.id, {
      range: Boolean(event.shiftKey),
      scope: batchCurrentScope.value,
    });
  }

  function replaceBatchSelectionForDrag(item) {
    if (item?.type !== "app") return false;
    if (!batchSelection.isActive.value) {
      batchSelection.begin({ initialIds: [item.id], primaryId: item.id });
      return true;
    }
    return batchSelection.replace(item.id, batchCurrentScope.value);
  }

  function getBatchDragPayload(item) {
    if (!batchSelection.isActive.value || item?.type !== "app") return null;
    if (!batchSelection.isSelected(item.id)) replaceBatchSelectionForDrag(item);
    const snapshot = batchSelection.snapshot();
    return {
      draggedIds: snapshot.selectedIds,
      layoutRevision: batchLayoutRevision.value,
      leadId: item.id,
      selectionRevision: snapshot.revision,
    };
  }

  function clearBatchSelection() {
    if (batchSelection.isFrozen.value) return false;
    batchSelection.clear();
    return true;
  }

  function clearBatchSelectionItems() {
    return batchSelection.deselectAll();
  }

  function selectAllCurrentBatchScope() {
    return batchSelection.selectScope(batchCurrentScope.value);
  }

  function toggleFocusedBatchSelection(event = {}) {
    const focused = findFocusedItem();
    if (focused?.item?.type !== "app") return false;
    return toggleBatchSelection(focused.item, event);
  }

  function commitBatchSelectionRemoval(operation, remove) {
    if (!batchSelection.beginCommit()) return false;
    try {
      const completed = remove(operation.selectedIds);
      if (completed) batchSelection.reconcile(pages.value, { exitWhenEmpty: true });
      return completed;
    } finally {
      batchSelection.finishCommit({ keepActive: batchSelection.selectedCount.value > 0 });
    }
  }

  function requestBatchSelectionRemove() {
    if (
      !batchSelection.isActive.value ||
      batchSelection.isFrozen.value ||
      batchSelection.selectedCount.value === 0
    ) return false;
    const operation = batchSelection.snapshot();
    openWarningDialog({
      title: localizationText.t("launchpad.batch.removeTitle"),
      message: localizationText.t("launchpad.batch.removeMessage", { count: operation.selectedIds.length }),
      confirmText: localizationText.t("launchpad.batch.removeConfirm"),
      cancelText: localizationText.t("common.actions.cancel"),
      confirmAppearance: "outline",
      confirmTone: "danger",
      intent: "warning",
      onConfirm: () => commitBatchSelectionRemoval(operation, removeManagedAppsFromLaunchpad),
    });
    return true;
  }

  function requestBatchSelectionExclude() {
    if (
      !batchSelection.isActive.value ||
      batchSelection.isFrozen.value ||
      !canExcludeBatchSelectionFromScan.value
    ) return false;
    const operation = batchSelection.snapshot();
    openWarningDialog({
      title: localizationText.t("launchpad.batch.excludeTitle"),
      message: localizationText.t("launchpad.batch.excludeMessage", { count: operation.selectedIds.length }),
      confirmText: localizationText.t("launchpad.batch.excludeConfirm"),
      cancelText: localizationText.t("common.actions.cancel"),
      confirmAppearance: "outline",
      confirmTone: "danger",
      intent: "warning",
      onConfirm: () => commitBatchSelectionRemoval(
        operation,
        (selectedIds) => excludeManagedAppsFromScan(selectedIds.map((id) => ({ id })))
      ),
    });
    return true;
  }

  function createFolderFromBatchSelection() {
    if (
      !batchSelection.isActive.value ||
      batchSelection.isFrozen.value ||
      batchSelection.selectedCount.value < 2
    ) return false;
    const operation = batchSelection.snapshot();
    if (!batchSelection.freeze("create-folder")) return false;
    let presentationOwnsFreeze = false;
    try {
      const plan = planGroupTransfer({
        basePages: pages.value,
        baseRevision: batchLayoutRevision.value,
        currentRevision: batchLayoutRevision.value,
        folderName: localizationText.t("launchpad.newFolder"),
        folderPageSize: folderPageSize.value,
        intent: {
          anchorId: operation.primaryId || operation.selectedIds[0],
          type: "toolbar-folder-create",
        },
        leadId: operation.primaryId || operation.selectedIds[0],
        makeFolderId: () => makeId("folder"),
        pageSize: pageSize.value,
        selectedIds: operation.selectedIds,
      });
      if (plan.status !== "accepted" || !plan.effects.createdFolderId) {
        const translatedReason = new Set([
          "desktop-capacity",
          "missing-dragged-id",
          "revision-stale",
        ]).has(plan.reason)
          ? plan.reason
          : "invalid-target";
        showTransientNotice({
          title: localizationText.t("launchpad.batch.createRejectedTitle"),
          message: localizationText.t(`launchpad.batch.reasons.${translatedReason}`),
          intent: "warning",
          durationMs: 2600,
        });
        return false;
      }
      const presented = requireDragControls().startCommittedGroupTransfer({
        basePages: pages.value,
        baseRevision: batchLayoutRevision.value,
        commit: () => {
          if (openFolderId.value) {
            commitOpenFolder(null, {
              excludeCloseGhostIds: operation.selectedIds,
            });
          }
          commitPages(plan.nextPages);
          batchSelection.reconcile(plan.nextPages);
          return true;
        },
        draggedIds: operation.selectedIds,
        leadId: operation.primaryId || operation.selectedIds[0],
        plan,
        selectionRevision: operation.revision,
      });
      if (presented) {
        presentationOwnsFreeze = true;
        return true;
      }
      showTransientNotice({
        title: localizationText.t("launchpad.batch.createRejectedTitle"),
        message: localizationText.t("launchpad.batch.createInvalidSelection"),
        intent: "warning",
        durationMs: 2600,
      });
      return false;
    } finally {
      if (!presentationOwnsFreeze) batchSelection.unfreeze("create-folder");
    }
  }

  const batchGroupDropReasonKeys = new Set([
    "desktop-capacity",
    "desktop-page-missing",
    "duplicate-layout-id",
    "folder-missing",
    "folder-page-capacity",
    "folder-page-missing",
    "invalid-target",
    "missing-dragged-id",
    "nested-folder-not-supported",
    "revision-stale",
    "selection-revision-stale",
    "target-app-missing",
    "target-in-selection",
  ]);

  function normalizeBatchGroupDropReason(reason) {
    return batchGroupDropReasonKeys.has(reason) ? reason : "invalid-target";
  }

  function beginBatchGroupDrag(payload) {
    if (payload?.standalone) return true;
    if (!batchSelection.isActive.value || batchSelection.isFrozen.value) return false;
    const snapshot = batchSelection.snapshot();
    const expected = new Set(payload?.draggedIds || []);
    if (
      snapshot.revision !== payload?.selectionRevision ||
      snapshot.selectedIds.length !== expected.size ||
      snapshot.selectedIds.some((id) => !expected.has(id))
    ) return false;
    return batchSelection.freeze("group-drag");
  }

  function endBatchGroupDrag(group) {
    if (group?.standalone) return;
    batchSelection.unfreeze(group?.origin === "toolbar" ? "create-folder" : "group-drag");
    if (group?.didCommit === true && group.semanticPlan?.effects?.createdFolderId) {
      batchSelection.deselectAll();
    }
  }

  function planBatchGroupTransfer(request) {
    if (
      (!request.standalone && request.selectionRevision !== batchSelection.revision.value) ||
      request.baseRevision !== request.currentRevision
    ) {
      return {
        nextPages: null,
        placements: [],
        reason: request.baseRevision !== request.currentRevision
          ? "revision-stale"
          : "selection-revision-stale",
        status: "rejected",
      };
    }
    return planGroupTransfer({
      basePages: request.basePages,
      baseRevision: request.baseRevision,
      currentRevision: request.currentRevision,
      folderName: localizationText.t("launchpad.newFolder"),
      folderPageSize: folderPageSize.value,
      intent: request.intent,
      leadId: request.leadId,
      makeFolderId: () => request.createdFolderId,
      pageSize: pageSize.value,
      selectedIds: request.draggedIds,
    });
  }

  function commitBatchGroupDrop(plan, operation) {
    if (
      plan?.status !== "accepted" ||
      operation.baseRevision !== batchLayoutRevision.value ||
      (!operation.standalone && operation.selectionRevision !== batchSelection.revision.value)
    ) return false;
    const activeFolderId = openFolderId.value;
    const keepsActiveFolderOpen = Boolean(
      activeFolderId &&
      operation.intent?.type === "folder-slot" &&
      operation.intent.folderId === activeFolderId
    );
    if (activeFolderId && !keepsActiveFolderOpen) {
      // Capture the authoritative source folder before the atomic layout commit
      // can remove it; the closing overlay then owns its visual handoff.
      commitOpenFolder(null, {
        excludeCloseGhostIds: operation.draggedIds,
      });
    }
    commitPages(plan.nextPages);
    if (!operation.standalone) batchSelection.reconcile(plan.nextPages);
    return true;
  }

  function showBatchGroupDropRejected(reason) {
    const reasonKey = normalizeBatchGroupDropReason(reason);
    showTransientNotice({
      title: localizationText.t("launchpad.batch.moveRejectedTitle"),
      message: localizationText.t(`launchpad.batch.reasons.${reasonKey}`),
      intent: "warning",
      durationMs: 2600,
    });
  }

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
    setDraftLocalePreference,
    setDraftLaunchpadIconVariant,
    setDraftMainWindowShortcut,
    setDraftSettingsThemePreference,
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
    localizationText,
    mainWindowRuntime,
    liveDesktopRuntime,
    notices: {
      showLayoutLoadFailed,
      showLayoutLoadRecovered,
      showLayoutSaveFailed,
      showLayoutSaveRecovered,
    },
    platform: nativePlatform,
    settings: settings.nativeIntegration,
    systemAppearance,
  });
  registerEventHandlers({
    closeDesktop,
    closeSettingsPanel,
    focusDesktopSurface,
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
    cloneItem,
    clonePages,
    commitGroupDrop: commitBatchGroupDrop,
    clearFolderPageTurnRequest,
    commitFolderPageTurnRequest,
    commitFolderPageIndex,
    commitOpenFolder,
    commitPageIndex,
    desktopMainRef,
    findTopLevel,
    finishHomeRevealSettleWindow,
    folderCols,
    folderPageIndex,
    folderPageRefs,
    folderPages,
    folderPanelRef,
    folderViewportRef,
    folderPageSize,
    getBatchCancelZoneRect: options.getBatchCancelZoneRect,
    getGroupLayoutRevision: () => batchLayoutRevision.value,
    getNewFolderName: () => localizationText.t("launchpad.newFolder"),
    gridCols,
    gridRows,
    iconBoundsRegistry,
    iconSize,
    isHomeRevealSettling,
    isLayoutProjectionActive,
    isLaunchpadInteractionBlocked,
    makeId,
    onGroupDragEnd: endBatchGroupDrag,
    onGroupDragStart: beginBatchGroupDrag,
    onGroupDropRejected: showBatchGroupDropRejected,
    openFolderId,
    pageIndex,
    pageRefs,
    pages,
    planGroupTransfer: planBatchGroupTransfer,
    projectedPagesRef: projectedPagesForLayout,
    requestFolderPageTurn,
    visualFolderPageIndex,
    visibleFolderRowCount,
  });
  const {
    cancelPreviewRaf,
    clearFolderPageTurn,
    clearLayoutProjectionRelease,
    clearPageTurn,
    clearPendingTarget,
    completeGroupRelease,
    disposeDrag,
    dragFolderHoverState,
    dragFolderTargetId,
    dragHitDebugState,
    dragMeta,
    groupDragState,
    isDragActive,
    projectedPages,
  } = dragControls;
  const renderedActivePages = computed(() => (
    isSearchMode.value ? activePages.value : projectedPages.value || activePages.value
  ));
  const renderedActivePageIndex = computed(() => (
    isSearchMode.value
      ? activePageIndex.value
      : groupDragState.value?.desktopPageIndex ?? activePageIndex.value
  ));
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
    isBatchSelectionActive: () => batchSelection.isActive.value,
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

  const pageNavigation = useLaunchpadPageNavigation({
    commitPageIndex,
    commitSearchPageIndex,
    finishHomeRevealSettleWindow,
    folderPageIndex,
    folderPages,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isFolderZoomFadeClosing,
    isHomeRevealSettling,
    isSearchMode,
    openFolderId,
    pageIndex,
    pages,
    renderedFolder,
    requestFolderPageTurn,
    searchPageIndex,
    searchPages,
    focusFirstIconInCurrentScope,
    visualFolderPageIndex,
  });
  const {
    handleGlobalKeydown,
  } = useLaunchpadKeyboard({
    cancelActiveDrag: () => {
      if (groupDragState.value?.canCancel !== true) return false;
      const output = cancelInputGesture({
        cancelSource: "keyboard",
        userInitiatedCancel: true,
      });
      return output?.handled === true;
    },
    cancelFolderOpening: () => cancelFolderOpeningFlow({ commit: commitOpenFolder }),
    closeTopmostModal: closeTopmostModalFromKeyboard,
    clearBatchSelection,
    cancelAltEditMode,
    clearSearch,
    clearFocusedIcon,
    closeDesktop,
    commitFolderPageIndex,
    commitOpenFolder,
    commitPageIndex,
    commitSearchPageIndex,
    createFolderFromBatchSelection,
    finishHomeRevealSettleWindow,
    focusDesktopSurface,
    folderPageIndex,
    folderPageTurnRequest,
    folderPages,
    folderPanelRef,
    getCurrentIconScope,
    handleAltKeyDown,
    hasFolderInteractionLayer: pageNavigation.hasFolderInteractionLayer,
    hideNativeWindowAfterCloseAnimation,
    isAltKeyEvent,
    isBatchSelectionActive: () => batchSelection.isActive.value,
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
    moveFocusByArrow,
    openDesktop,
    openFolderId,
    openFocusedIcon,
    pageIndex,
    pages,
    renderedFolder,
    requestFolderPageTurn,
    requestBatchSelectionRemove,
    schedulePageGridMetrics,
    searchInputRef,
    searchPageIndex,
    searchPages,
    searchQuery,
    focusFirstIconInCurrentScope,
    focusedIcon,
    selectAllBatchScope: selectAllCurrentBatchScope,
    focusMatchesScope,
    startFolderZoomFadeClose,
    toggleFocusedBatchSelection,
    turnCurrentPage: pageNavigation.turnCurrentPage,
    visualFolderPageIndex,
  });
  const {
    cancelInputGesture,
    disposeInputGestures,
    folderPageTrackScrub,
    handleDesktopSurfacePointerDown,
    handleFolderPanelPointerDown,
    handleFolderOverlayPointerDown,
    handleIconPointerDown,
    handleLaunchpadWheel,
    iconGesturePresentation,
    pageTrackScrub,
    setFolderPageRef,
    setPageRef,
  } = useLaunchpadInputGestures({
    commitActivePageIndex,
    dragControls,
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
    handleSurfaceTap: (target) => {
      if (target?.action === "closeFolder") {
        commitOpenFolder(null);
        return;
      }
      if (target?.action === "closeDesktop") {
        closeDesktop({ clearSearch: true });
        hideNativeWindowAfterCloseAnimation();
      }
    },
    isInteractionBlocked: () => !isDesktopOpen.value || isDragActive() || isAppLaunching.value,
    getBatchDragPayload,
    isBatchSelectionActive: () => batchSelection.isActive.value,
    isSearchMode,
    openApp,
    openFolder: (folder, event) => {
      const commit = () => {
        if (!isLaunchpadInteractionBlocked()) {
          commitOpenFolder(folder.id, { originBounds: event?.folderOriginBounds });
        }
      };
      if (consumeFirstFolderOpenPrepare?.()) globalThis.setTimeout(commit, 48);
      else commit();
    },
    openIconContextMenu: options.openIconContextMenu,
    prepareFolderOpen: requestFolderOpenWarmup,
    isFolderAppLaunchClosing,
    isFolderClosing,
    openFolderId,
    pageRefs,
    renderedFolder,
    rootRef,
    toggleBatchSelection,
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
    cancelInputGesture,
    cancelPreviewRaf,
    clearAltEditTimer,
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderCloseHandoffFrame,
    clearFolderPageTurn,
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
    disposeInteractions: () => {
      disposeDrag();
      disposeInputGestures();
    },
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
    launchpadIconVariant,
    launchTargetStatusById,
    loadNativeLaunchpadData,
    observeFolderViewport,
    pageDotsRef,
    pages,
    registerNativeEventListeners,
    renderedFolder,
    rootRef,
    scanAppBlacklist,
    scanKeywordAllowlist,
    scanKeywordBlacklist,
    scanRoots,
    scheduleFolderViewportMetrics,
    scheduleLaunchTargetStatusCheck,
    scheduleNativeLayoutSave,
    schedulePageGridMetrics,
    searchRef,
    setNativeWindowEffectsEnabled,
    settingsThemePreference,
    showNativeWindowAfterStartup,
    showCustomTitlebar,
    showMissingLaunchTargetBadge,
    syncLiveDesktopBackgroundRuntime,
    syncWindowsWallpaperRefreshTimer,
    syncManagedAppState,
    systemAppearance,
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
    isMultiSelectFixture,
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
    activePageIndex: renderedActivePageIndex,
    activePages: renderedActivePages,
    handleIconPointerDown,
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
    groupDragState,
    completeGroupRelease,
    folderOpenPreviewFrameGhostedIds,
    folderPageSize,
    getDesktopPageRenderMode,
    getVisibleDesktopPage,
    gridCols,
    gridRows,
    handleDesktopSurfacePointerDown,
    iconBoundsRegistry,
    iconGesturePresentation,
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
    focusedIcon,
    setPageRef,
    showMissingLaunchTargetBadge,
  };

  const folderFlow = {
    finishFolderZoomFadeClose,
    folderOpenPreviewFrameGhostedIds,
    folderOpenIconGhostSession,
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
    canCustomizeLaunchpadIcon,
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
    draftLaunchpadIconVariant,
    draftLocalePreference,
    draftMainWindowShortcut,
    draftSettingsThemePreference,
    draftRows,
    draftShowCustomTitlebar,
    draftWindowEffectAppearance,
    draftWindowEffectMaterial,
    draftWindowMode,
    dragMeta,
    editorModel,
    excludedScanApps,
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
    localePreference,
    localePreferenceError,
    launchpadIconError,
    launchpadIconVariant,
    fullscreenOverscanEnabled,
    liveDesktopBackgroundSupport,
    liveDesktopRuntimeStatus,
    mainWindowShortcutError,
    settingsThemePreference,
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
    setDraftLocalePreference,
    setDraftLaunchpadIconVariant,
    setDraftMainWindowShortcut,
    setDraftSettingsThemePreference,
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
    localizationText,
    systemAppearance,
  });
  openScanKeywordSettings = settingsPanelModel.pages.apps.actions.openKeywordFilters;
  settingsPanelModelDisposer = settingsPanelModel.dispose;

  const dialogs = {
    clearTransientNotice: closeTransientNotice,
    closeTransientNotice,
    closeWarningDialog,
    confirmWarningDialog,
    editorModel,
    iconChooserModel,
    isWarningDialogOpen,
    openWarningDialog,
    resolvedSettingsTheme: settingsPanelModel.shell.resolvedSettingsTheme,
    transientNotice,
    scanResultModel,
    showLayoutLoadFailed,
    showLayoutLoadRecovered,
    showLayoutSaveFailed,
    showLayoutSaveRecovered,
    warningDialog,
  };

  const folderOverlay = {
    acceptFolderOpenIconGhostSession,
    activePageIndex,
    activePages,
    handleIconPointerDown,
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
    folderOpeningCancelRequest,
    folderOpenProgress,
    folderOpenProgressTarget,
    folderOpenIconGhosts,
    folderOpenIconGhostSession,
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
    resolvedSettingsTheme: settingsPanelModel.shell.resolvedSettingsTheme,
  };
  const selection = {
    batchHiddenSelectedCount,
    batchSelectedPageCounts,
    canExcludeFromScan: canExcludeBatchSelectionFromScan,
    clear: clearBatchSelection,
    clearItems: clearBatchSelectionItems,
    createFolder: createFolderFromBatchSelection,
    enter: beginBatchSelection,
    isActive: batchSelection.isActive,
    isFrozen: batchSelection.isFrozen,
    primaryId: batchSelection.primaryId,
    requestExclude: requestBatchSelectionExclude,
    requestRemove: requestBatchSelectionRemove,
    selectedCount: batchSelection.selectedCount,
    selectedIds: batchSelection.selectedIds,
    selectCurrentScope: selectAllCurrentBatchScope,
  };

  return {
    appActions,
    background,
    chrome,
    desktopSurface,
    dialogs,
    folderFlow,
    folderOverlay,
    selection,
    search,
    settingsPanel,
    settingsPanelModel,
    shell,
    overlays,
  };
}
