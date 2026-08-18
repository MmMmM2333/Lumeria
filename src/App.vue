<template>
  <div
    ref="rootRef"
    :data-launchpad-fixture="isMultiSelectFixture ? 'multi-select' : undefined"
    :class="cx('launchpad-root', 'launchpad-root-pixi-root-stage', 'launchpad-root-single-stage-folder-layer', isFolderLayerActive && 'launchpad-root-folder-layer-active', isBatchSelectionActive && 'launchpad-root-batch-selection', windowMode === 'windowed' && 'launchpad-root-windowed', isWindowTitlebarVisible && 'launchpad-root-windowed-titlebar', isTextlessMode && 'launchpad-root-textless', isStartupMaskMounted && 'launchpad-root-startup-masked', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching', shouldUseLiveDesktopCssFallbackEffects && 'launchpad-root-live-desktop-css-fallback-effects')"
    :style="launchpadRootStyle"
    @wheel="handleLaunchpadWheel"
    @pointerdown="handleLaunchpadSurfacePointerDown"
  >
    <div class="launchpad-bg">
      <PixiBackgroundSurface
        v-if="hasMountedPixiBackgroundEffect"
        v-show="isPixiBackgroundVisible"
        :active="shouldRenderPixiBackgroundEffect"
        :background-acrylic-params="backgroundAcrylicParams"
        :background-effect="backgroundEffect"
        :background-blur-strength="backgroundEffectBlurStrength"
        :background-image-opacity="backgroundImageOpacity"
        :background-image-layout="backgroundImageLayout"
        :background-image-path="backgroundImagePath"
        :background-image-pixel-size="backgroundImagePixelSize"
        :background-image-url="backgroundImageUrl"
        :background-layout-context="backgroundLayoutContext"
        :background-viewport-size="backgroundViewportSize"
        @ready="handlePixiBackgroundReady"
      />
      <div
        v-for="layer in backgroundImageLayerViews"
        :key="layer.id"
        class="launchpad-bg-image"
        :style="layer.style"
      />
    </div>
    <div
      v-if="shouldRenderLiveDesktopCompositorKeeper"
      class="launchpad-live-desktop-compositor-keeper"
      :style="{ '--launchpad-live-desktop-compositor-tick': liveDesktopCompositorTick }"
      aria-hidden="true"
    />

    <LaunchpadChromeFrame
      :active-page-index="activePageIndex"
      :active-pages="activePages"
      :chrome-animate="homeChromeAnimate"
      :chrome-initial="homeChromeInitial"
      :chrome-style="homeChromeStyle"
      :chrome-transition="homeChromeTransition"
      :dom-refs="headerDomRefs"
      :drag-disabled="!!dragMeta"
      :frame-refs="chromeFrameRefs"
      :is-search-mode="isSearchMode"
      :render-key="singleStageRenderKey"
      :search-query="searchQuery"
      :selected-page-counts="batchSelectedPageCounts"
      @context-menu-request="handleChromeContextMenuRequest"
      @search-input="handleSearchInput"
      @search-focus="keyboardFocusArea = 'search'"
      @clear-search="clearSearch"
      @open-settings="openSettingsPanel"
      @page-index="commitChromePageIndex"
    >
      <PixiDesktopSurface
        :key="singleStageRenderKey"
        :scene-frame="desktopSceneFrame"
        :scene-runtime="desktopSceneRuntime"
        @scene-event="handlePixiSceneEvent"
      />
    </LaunchpadChromeFrame>

    <LaunchpadSelectionToolbar
      v-if="isBatchSelectionActive"
      ref="selectionToolbarRef"
      :can-create-folder="batchSelectedCount >= 2"
      :can-exclude-from-scan="canExcludeBatchSelectionFromScan"
      :cancel-active="isBatchDragCancelActive"
      :cancel-armed="isBatchDragCancelArmed"
      :disabled="isBatchSelectionFrozen"
      :hidden-count="batchHiddenSelectedCount"
      :resolved-settings-theme="selectionToolbarTheme"
      :selected-count="batchSelectedCount"
      @clear-selection="clearBatchSelectionItems"
      @close="clearBatchSelection"
      @create-folder="createFolderFromBatchSelection"
      @exclude="requestBatchSelectionExclude"
      @remove="requestBatchSelectionRemove"
      @select-scope="selectCurrentBatchScope"
    />
    <SettingsPanel :model="settingsPanelModel" />
    <LaunchpadDialogs :state="dialogs" />
    <LaunchpadOverlays
      ref="launchpadOverlaysRef"
      :state="overlays"
      @context-menu-action="handleContextMenuAction"
      @context-menu-request="handleContextMenuRequest"
    />
    <WindowChromeOverlay :active="isWindowChromeOverlayActive" :show-titlebar="isWindowTitlebarVisible" />
    <BackgroundDebugPanel
      v-if="isAcrylicDebugPanelEnabled"
      :state="settingsPanelState"
      :dialog-state="dialogs"
      :desktop-layout-debug-params="desktopLayoutDebugParams"
      :reset-desktop-layout-debug-params="resetDesktopLayoutDebugParams"
      :update-desktop-layout-debug-params="updateDesktopLayoutDebugParams"
    />
    <div
      v-if="isStartupMaskMounted"
      :class="cx('launchpad-startup-mask', !isStartupMaskVisible && 'launchpad-startup-mask-hidden')"
      aria-hidden="true"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import LaunchpadDialogs from "./components/LaunchpadDialogs.vue";
import LaunchpadChromeFrame from "./components/LaunchpadChromeFrame.vue";
import LaunchpadOverlays from "./components/LaunchpadOverlays.vue";
import LaunchpadSelectionToolbar from "./components/LaunchpadSelectionToolbar.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import WindowChromeOverlay from "./components/WindowChromeOverlay.vue";
import PixiBackgroundSurface from "./rendering/pixi/PixiBackgroundSurface.vue";
import PixiDesktopSurface from "./rendering/pixi/PixiDesktopSurface.vue";
import { assertSceneEvent } from "./rendering/sceneEvents.js";
import { makeDesktopSceneFrame } from "./rendering/sceneFrame.js";
import { makeDesktopSceneRuntimeAdapter } from "./rendering/sceneRuntime.js";
import {
  getSingleStageDiagnosticsOptions,
  getSingleStageRenderKey,
  resolveFolderClosingHandoffId,
  resolveFolderPixiActivityUpdate,
  resolveFolderSourceGhostedIds,
  shouldClearFolderClosingHandoffRetainId,
} from "./rendering/desktopScenePort.js";
import { getBackgroundLayoutContext } from "./api/launchpadApi.js";
import { loadBackgroundImagePixelSize } from "./composables/useBackgroundImagePixelSize.js";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import { useLocalization, useLocalizationRuntime } from "./i18n/localization.js";
import { backgroundSourceUsesLiveDesktop } from "./composables/useLaunchpadSettingsConfig.js";
import { resolveCssBackgroundImagePlacement } from "./domain/backgroundImageLayout.js";
import { isLiveDesktopExperimentEnabled } from "./domain/experimentalFeatures.js";
import {
  isLaunchpadContextMenuInteractionBlocked,
  resolveLaunchpadContextMenuTarget,
} from "./domain/input/launchpadPointerTarget.js";
import { ICON_BOUNDS_KIND } from "./rendering/desktopScenePort.js";
import {
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  LIVE_DESKTOP_DEBUG_SETTINGS_CHANGED_EVENT,
  LIVE_DESKTOP_DEBUG_STORAGE_KEYS,
  readLiveDesktopDebugSettings,
} from "./diagnostics/liveDesktopDebugSettings.js";
import {
  resetDesktopLayoutDebugParams,
  resolveDesktopDragHitDebugOptions,
  resolveDesktopGridDebugOptions,
  resolveDesktopLayoutDebugStyle,
  updateDesktopLayoutDebugParams,
  useDesktopLayoutDebugParams,
} from "./components/backgroundDebug/desktopLayoutDebugSettings.js";
import appPackage from "../package.json";
import "./styles/launchpad.css";
import "./styles/settings.css";

const appVersion = appPackage.version;
const props = defineProps({
  startupContext: { type: Object, default: () => ({ origin: "manual" }) },
});
const localizationText = useLocalization();
const localizationRuntime = useLocalizationRuntime();
const selectionToolbarRef = ref(null);
const controller = useLaunchpadController({
  activateLocale: localizationRuntime.activate,
  appVersion,
  getBatchCancelZoneRect: () => selectionToolbarRef.value?.getBoundingClientRect?.() || null,
  localizationText,
  openIconContextMenu,
  startupContext: props.startupContext,
});
const {
  appActions,
  background: backgroundDomain,
  chrome,
  desktopSurface,
  dialogs,
  folderFlow,
  folderOverlay,
  overlays,
  selection,
  search: searchDomain,
  settingsPanel,
  settingsPanelModel,
  shell,
} = controller;
const {
  batchHiddenSelectedCount,
  batchSelectedPageCounts,
  canExcludeFromScan: canExcludeBatchSelectionFromScan,
  clear: clearBatchSelection,
  clearItems: clearBatchSelectionItems,
  createFolder: createFolderFromBatchSelection,
  enter: enterBatchSelection,
  isActive: isBatchSelectionActive,
  isFrozen: isBatchSelectionFrozen,
  requestExclude: requestBatchSelectionExclude,
  requestRemove: requestBatchSelectionRemove,
  selectedCount: batchSelectedCount,
  selectedIds: batchSelectedIds,
  selectCurrentScope: selectCurrentBatchScope,
} = selection;
const selectionToolbarTheme = settingsPanelModel.shell.resolvedSettingsTheme;
const {
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
} = shell;
const {
  rootStyle,
  backgroundAcrylicParams,
  backgroundEffect,
  backgroundEffectBlurStrength,
  backgroundImageOpacity,
  backgroundImageLayout,
  backgroundImagePath,
  backgroundImageUrl,
  backgroundLayoutContext,
  backgroundSource,
  liveDesktopCssFallbackEffectsEnabled,
  liveDesktopRuntimeStatus,
  mainWindowDisplayRevision,
  shouldRenderPixiBackgroundEffect,
} = backgroundDomain;
const {
  commitChromePageIndex,
  homeChromeInitial,
  homeChromeAnimate,
  homeChromeTransition,
  homeChromeStyle,
  headerRef,
  pageDotsRef,
} = chrome;
const {
  excludeManagedAppFromScan,
  openEditManagedApp,
  openExistingAppIconChooser,
  openApp,
  removeManagedAppFromLaunchpad,
  resetAppCustomIcon,
  showMissingLaunchTargetBadge,
} = appActions;
const {
  canScanManagedApps,
  confirmForceFillAllPages,
  isScanningApps,
  isSettingsPanelOpen,
  shouldRenderSettingsPanel,
  settingsOverlayAnimate,
  settingsPanelInitial,
  settingsPanelAnimate,
  openSettingsPanel,
  rescanManagedApps,
} = settingsPanel;
const {
  clearSearch,
  handleSearchInput,
  isSearchMode,
  keyboardFocusArea,
  searchInputRef,
  searchQuery,
  searchRef,
} = searchDomain;
const {
  activePageIndex,
  activePages,
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
  handleDesktopSurfacePointerDown,
  gridCols,
  gridRows,
  iconBoundsRegistry,
  iconGesturePresentation,
  iconSize,
  isIconOpening,
  launchTargetStatusById,
  launchpadVisualAlpha,
  launchpadVisualTransform,
  getDesktopPageRenderMode,
  setPageRef,
  pageGridMeasureStyle,
  pageTrackScrub,
  schedulePageGridMetrics,
  focusedIcon,
  getVisibleDesktopPage,
  folderPageSize,
} = desktopSurface;
const isBatchDragCancelActive = computed(() => groupDragState.value?.canCancel === true);
const isBatchDragCancelArmed = computed(() => groupDragState.value?.cancelArmed === true);
const {
  folderOpenIconGhostSession,
  folderOpenPreviewFrameGhostedIds,
  isFolderLayerActive,
  isFolderOpeningPreviewFrameGhosted,
  openFolderId,
  renderedFolder,
  isFolderClosing,
  isFolderAppLaunchClosing,
  isFolderZoomFadeClosing,
  isHomeRevealSettling,
} = folderFlow;
const {
  commitOpenFolder,
  confirmDissolveFolder,
  folderPanelRef,
  requestFolderRename,
} = folderOverlay;

const isAcrylicDebugPanelEnabled = import.meta.env.DEV;
const BackgroundDebugPanel = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./components/BackgroundDebugPanel.vue"))
  : null;
const desktopLayoutDebugParams = useDesktopLayoutDebugParams();
const desktopLayoutDebugStyle = computed(() => (
  import.meta.env.DEV ? resolveDesktopLayoutDebugStyle(desktopLayoutDebugParams) : {}
));
const desktopGridDebugOptions = computed(() => (
  import.meta.env.DEV ? resolveDesktopGridDebugOptions(desktopLayoutDebugParams) : null
));
const desktopDragHitDebugOptions = computed(() => (
  import.meta.env.DEV ? resolveDesktopDragHitDebugOptions(desktopLayoutDebugParams) : null
));
const isLiveDesktopExperimentActive = computed(() => isLiveDesktopExperimentEnabled());
const LIVE_DESKTOP_COMPOSITOR_KEEPER_INTERVAL_MS = 250;
const launchpadOverlaysRef = ref(null);
const BACKGROUND_MEDIA_FADE_MS = 220;
const PIXI_BACKGROUND_HANDOFF_DELAY_MS = 220;
const STARTUP_MASK_FADE_MS = 260;
const STARTUP_MASK_MAX_WAIT_MS = 8000;
const hasMountedPixiBackgroundEffect = ref(false);
const isPixiBackgroundVisible = ref(false);
const hasRenderedPixiBackground = ref(false);
const hasCompositedStartupBackground = ref(false);
const isStartupMaskMounted = ref(true);
const isStartupMaskVisible = ref(true);
const backgroundImagePixelSize = ref(null);
const backgroundViewportSize = ref({ height: 1, width: 1 });
const initialLiveDesktopDebugSettings = import.meta.env.DEV && isLiveDesktopExperimentEnabled()
  ? readLiveDesktopDebugSettings()
  : { issues: [], values: DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS };
if (initialLiveDesktopDebugSettings.issues.length) {
  console.error("Live Desktop debug settings were only partially read", initialLiveDesktopDebugSettings.issues);
}
const isLiveDesktopCompositorKeeperEnabled = ref(initialLiveDesktopDebugSettings.values.compositorKeeper);
const liveDesktopCompositorTick = ref(0);
liveDesktopCssFallbackEffectsEnabled.value = initialLiveDesktopDebugSettings.values.cssFallbackEffects;
const backgroundImageLayers = ref([
  { id: "background-image-a", url: null, visible: false },
  { id: "background-image-b", url: null, visible: false },
]);
const folderPixiInternalActivity = ref(false);
const folderPixiInternalActivityFolderId = ref(null);
const folderClosingHandoffRetainId = ref(null);
const singleStageDiagnosticsOptions = getSingleStageDiagnosticsOptions();
const singleStageRenderKey = getSingleStageRenderKey();
const shouldRenderLiveDesktopCompositorKeeper = computed(() => Boolean(
  import.meta.env.DEV
    && isLiveDesktopExperimentActive.value
    && isLiveDesktopCompositorKeeperEnabled.value
    && backgroundSourceUsesLiveDesktop(backgroundSource.value)
    && liveDesktopRuntimeStatus.value?.active
    && isDesktopOpen.value
    && !isAppLaunching.value
));
const shouldUseLiveDesktopCssFallbackEffects = computed(() => Boolean(
  import.meta.env.DEV
    && isLiveDesktopExperimentActive.value
    && liveDesktopCssFallbackEffectsEnabled.value
));
const isWindowTitlebarVisible = computed(() => Boolean(
  windowMode.value === "windowed" && showCustomTitlebar.value
));
const isWindowChromeOverlayActive = computed(() => Boolean(
  windowMode.value === "windowed"
    && isDesktopOpen.value
    && !isDesktopClosing.value
    && !isAppLaunching.value
));
let pixiBackgroundHideTimer = null;
let startupMaskRemoveTimer = null;
let startupMaskMaxWaitTimer = null;
let startupBackgroundFrame = null;
let backgroundImageGeneration = 0;
let backgroundImageShowFrame = null;
let backgroundImageClearTimer = null;
let liveDesktopCompositorKeeperTimer = null;
let activeBackgroundImageLayerIndex = 0;

function parseCssOpacity(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function backgroundImageUrlStyle(url) {
  return `url(${JSON.stringify(url)})`;
}

function applyLiveDesktopFrontendDebugSettings(values = DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS) {
  isLiveDesktopCompositorKeeperEnabled.value = Boolean(values.compositorKeeper);
  liveDesktopCssFallbackEffectsEnabled.value = Boolean(values.cssFallbackEffects);
}

function handleLiveDesktopDebugSettingsChanged(event) {
  if (!isLiveDesktopExperimentEnabled()) return;
  const values = event?.detail?.values;
  if (values) {
    applyLiveDesktopFrontendDebugSettings(values);
    return;
  }
  const snapshot = readLiveDesktopDebugSettings();
  if (snapshot.issues.length) {
    console.error("Failed to refresh Live Desktop frontend debug settings", snapshot.issues);
  }
  applyLiveDesktopFrontendDebugSettings(snapshot.values);
}

function handleLiveDesktopDebugSettingsStorage(event) {
  if (!isLiveDesktopExperimentEnabled()) return;
  if (![LIVE_DESKTOP_DEBUG_STORAGE_KEYS.compositorKeeper, LIVE_DESKTOP_DEBUG_STORAGE_KEYS.cssFallbackEffects].includes(event?.key)) return;
  handleLiveDesktopDebugSettingsChanged();
}

function clearLiveDesktopCompositorKeeperTimer() {
  if (liveDesktopCompositorKeeperTimer == null) return;
  window.clearInterval(liveDesktopCompositorKeeperTimer);
  liveDesktopCompositorKeeperTimer = null;
}

function startLiveDesktopCompositorKeeperTimer() {
  if (liveDesktopCompositorKeeperTimer != null) return;
  liveDesktopCompositorKeeperTimer = window.setInterval(() => {
    liveDesktopCompositorTick.value = liveDesktopCompositorTick.value === 0 ? 1 : 0;
  }, LIVE_DESKTOP_COMPOSITOR_KEEPER_INTERVAL_MS);
}

const targetBackgroundImageOpacity = computed(() => (
  parseCssOpacity(rootStyle.value["--launchpad-background-image-opacity"])
));

const targetBackgroundOverlayOpacity = computed(() => (
  parseCssOpacity(rootStyle.value["--launchpad-background-overlay-opacity"])
));

const hasVisibleBackgroundImageLayer = computed(() => (
  backgroundImageLayers.value.some((layer) => layer.url && layer.visible)
));

const shouldGateBackgroundOverlay = computed(() => Boolean(
  backgroundImageUrl.value || hasVisibleBackgroundImageLayer.value
));

const launchpadRootStyle = computed(() => {
  const nextStyle = { ...rootStyle.value, ...desktopLayoutDebugStyle.value };
  if (shouldGateBackgroundOverlay.value) {
    nextStyle["--launchpad-background-overlay-opacity"] = `${targetBackgroundOverlayOpacity.value * (hasVisibleBackgroundImageLayer.value ? 1 : 0)}`;
  }
  return nextStyle;
});

if (import.meta.env.DEV) {
  watch(
    () => [
      desktopLayoutDebugParams.enabled,
      desktopLayoutDebugParams.gridPaddingTopPx,
      desktopLayoutDebugParams.hostHeightOffsetPx,
      desktopLayoutDebugParams.hostMaxHeightPx,
      desktopLayoutDebugParams.mainPaddingYPx,
    ],
    () => schedulePageGridMetrics(),
    { flush: "post" }
  );
}

const backgroundImageLayerViews = computed(() => (
  backgroundImageLayers.value.map((layer) => ({
    id: layer.id,
    style: {
      ...resolveCssBackgroundImagePlacement(backgroundImageLayout.value, {
        imagePixelSize: backgroundImagePixelSize.value,
        layoutContext: backgroundLayoutContext.value,
        targetHeight: backgroundViewportSize.value.height,
        targetWidth: backgroundViewportSize.value.width,
      }),
      backgroundImage: layer.url ? backgroundImageUrlStyle(layer.url) : "none",
      opacity: `${targetBackgroundImageOpacity.value * (layer.visible ? 1 : 0)}`,
    },
  }))
));

const isStartupBackgroundTargetReady = computed(() => {
  if (!isNativeLayoutReady.value) return false;
  if (shouldRenderPixiBackgroundEffect.value) return hasRenderedPixiBackground.value;
  if (backgroundImageUrl.value && targetBackgroundImageOpacity.value > 0) {
    return hasVisibleBackgroundImageLayer.value;
  }
  return true;
});

const isStartupBackgroundReady = computed(() => (
  isStartupBackgroundTargetReady.value && hasCompositedStartupBackground.value
));

function clearPixiBackgroundHideTimer() {
  if (pixiBackgroundHideTimer == null) return;
  window.clearTimeout(pixiBackgroundHideTimer);
  pixiBackgroundHideTimer = null;
}

function hidePixiBackgroundAfterHandoff() {
  clearPixiBackgroundHideTimer();
  pixiBackgroundHideTimer = window.setTimeout(() => {
    pixiBackgroundHideTimer = null;
    if (!shouldRenderPixiBackgroundEffect.value) {
      isPixiBackgroundVisible.value = false;
    }
  }, PIXI_BACKGROUND_HANDOFF_DELAY_MS);
}

function clearStartupMaskTimers() {
  if (startupMaskRemoveTimer != null) {
    window.clearTimeout(startupMaskRemoveTimer);
    startupMaskRemoveTimer = null;
  }
  if (startupMaskMaxWaitTimer != null) {
    window.clearTimeout(startupMaskMaxWaitTimer);
    startupMaskMaxWaitTimer = null;
  }
  if (startupBackgroundFrame != null) {
    window.cancelAnimationFrame(startupBackgroundFrame);
    startupBackgroundFrame = null;
  }
}

function releaseStartupMask() {
  if (!isStartupMaskMounted.value || !isStartupMaskVisible.value) return;
  isStartupMaskVisible.value = false;
  if (startupMaskMaxWaitTimer != null) {
    window.clearTimeout(startupMaskMaxWaitTimer);
    startupMaskMaxWaitTimer = null;
  }
  startupMaskRemoveTimer = window.setTimeout(() => {
    startupMaskRemoveTimer = null;
    isStartupMaskMounted.value = false;
  }, STARTUP_MASK_FADE_MS);
}

function releaseStartupMaskAfterTimeout() {
  if (!isStartupBackgroundReady.value) {
    console.warn("Lumeria startup mask timed out before the background was fully ready");
  }
  releaseStartupMask();
}

function resetStartupBackgroundComposite() {
  if (!isStartupMaskMounted.value) return;
  hasCompositedStartupBackground.value = false;
  if (startupBackgroundFrame != null) {
    window.cancelAnimationFrame(startupBackgroundFrame);
    startupBackgroundFrame = null;
  }
}

function markStartupBackgroundComposited() {
  if (!isStartupMaskMounted.value || startupBackgroundFrame != null) return;
  startupBackgroundFrame = window.requestAnimationFrame(() => {
    startupBackgroundFrame = window.requestAnimationFrame(() => {
      startupBackgroundFrame = null;
      if (isStartupBackgroundTargetReady.value) {
        hasCompositedStartupBackground.value = true;
      }
    });
  });
}

function restartStartupBackgroundComposite() {
  resetStartupBackgroundComposite();
  if (isStartupBackgroundTargetReady.value) markStartupBackgroundComposited();
}

function handlePixiBackgroundReady() {
  hasRenderedPixiBackground.value = true;
}

function readBackgroundViewportSize() {
  const rect = rootRef.value?.getBoundingClientRect?.();
  const width = Math.max(1, Math.round(rect?.width || window.innerWidth || 1));
  const height = Math.max(1, Math.round(rect?.height || window.innerHeight || 1));
  if (width === backgroundViewportSize.value.width && height === backgroundViewportSize.value.height) return;
  backgroundViewportSize.value = { height, width };
}

async function refreshBackgroundLayoutContext() {
  try {
    backgroundLayoutContext.value = await getBackgroundLayoutContext();
  } catch (error) {
    backgroundLayoutContext.value = null;
    console.warn("Failed to load background layout context", error);
  }
}

function refreshBackgroundLayoutMetrics() {
  readBackgroundViewportSize();
  void refreshBackgroundLayoutContext();
}

function clearBackgroundImageShowFrame() {
  if (backgroundImageShowFrame == null) return;
  window.cancelAnimationFrame(backgroundImageShowFrame);
  backgroundImageShowFrame = null;
}

function clearBackgroundImageClearTimer() {
  if (backgroundImageClearTimer == null) return;
  window.clearTimeout(backgroundImageClearTimer);
  backgroundImageClearTimer = null;
}

function scheduleHiddenBackgroundImageCleanup() {
  clearBackgroundImageClearTimer();
  backgroundImageClearTimer = window.setTimeout(() => {
    backgroundImageClearTimer = null;
    backgroundImageLayers.value = backgroundImageLayers.value.map((layer) => (
      layer.visible ? layer : { ...layer, url: null }
    ));
  }, BACKGROUND_MEDIA_FADE_MS);
}

function hideBackgroundImageLayers() {
  clearBackgroundImageShowFrame();
  backgroundImageLayers.value = backgroundImageLayers.value.map((layer) => ({
    ...layer,
    visible: false,
  }));
  scheduleHiddenBackgroundImageCleanup();
}

function revealBackgroundImageLayer(url, generation) {
  if (generation !== backgroundImageGeneration) return;
  clearBackgroundImageShowFrame();
  clearBackgroundImageClearTimer();

  const existingIndex = backgroundImageLayers.value.findIndex((layer) => layer.url === url);
  const nextIndex = existingIndex >= 0 ? existingIndex : 1 - activeBackgroundImageLayerIndex;
  backgroundImageLayers.value = backgroundImageLayers.value.map((layer, index) => (
    index === nextIndex ? { ...layer, url, visible: false } : layer
  ));

  backgroundImageShowFrame = window.requestAnimationFrame(() => {
    backgroundImageShowFrame = window.requestAnimationFrame(() => {
      backgroundImageShowFrame = null;
      if (generation !== backgroundImageGeneration) return;
      activeBackgroundImageLayerIndex = nextIndex;
      backgroundImageLayers.value = backgroundImageLayers.value.map((layer, index) => ({
        ...layer,
        visible: index === nextIndex && layer.url === url,
      }));
      scheduleHiddenBackgroundImageCleanup();
    });
  });
}

function preloadBackgroundImage(url) {
  return loadBackgroundImagePixelSize(url);
}

async function loadVisibleBackgroundImage(url, generation) {
  try {
    const pixelSize = await preloadBackgroundImage(url);
    if (generation === backgroundImageGeneration) backgroundImagePixelSize.value = pixelSize;
    revealBackgroundImageLayer(url, generation);
  } catch (error) {
    if (generation === backgroundImageGeneration) {
      backgroundImagePixelSize.value = null;
      console.warn("Failed to prepare background image for fade-in", error);
    }
  }
}

function clearBackgroundImageTimers() {
  backgroundImageGeneration += 1;
  clearBackgroundImageShowFrame();
  clearBackgroundImageClearTimer();
}

watch(
  shouldRenderPixiBackgroundEffect,
  (shouldRender) => {
    if (shouldRender) {
      clearPixiBackgroundHideTimer();
      hasMountedPixiBackgroundEffect.value = true;
      isPixiBackgroundVisible.value = true;
      return;
    }
    if (hasMountedPixiBackgroundEffect.value) hidePixiBackgroundAfterHandoff();
  },
  { immediate: true }
);

watch(
  () => [
    shouldRenderPixiBackgroundEffect.value,
    backgroundImagePath.value,
    backgroundImageUrl.value,
    backgroundImageLayout.value,
    backgroundLayoutContext.value,
    backgroundImagePixelSize.value,
    backgroundViewportSize.value.width,
    backgroundViewportSize.value.height,
    backgroundEffect.value,
    backgroundEffectBlurStrength.value,
    backgroundAcrylicParams.value,
  ],
  () => {
    hasRenderedPixiBackground.value = false;
    restartStartupBackgroundComposite();
  }
);

watch(
  backgroundImageUrl,
  (nextUrl) => {
    const generation = ++backgroundImageGeneration;
    clearBackgroundImageShowFrame();
    if (!nextUrl) {
      backgroundImagePixelSize.value = null;
      hideBackgroundImageLayers();
      return;
    }
    refreshBackgroundLayoutMetrics();
    void loadVisibleBackgroundImage(nextUrl, generation);
  },
  { immediate: true }
);

watch(
  isDesktopOpen,
  (isOpen) => {
    if (isOpen) refreshBackgroundLayoutMetrics();
  },
  { immediate: true }
);

watch(mainWindowDisplayRevision, refreshBackgroundLayoutMetrics);

watch(
  shouldRenderLiveDesktopCompositorKeeper,
  (shouldRender) => {
    if (shouldRender) {
      startLiveDesktopCompositorKeeperTimer();
    } else {
      clearLiveDesktopCompositorKeeperTimer();
      liveDesktopCompositorTick.value = 0;
    }
  },
  { immediate: true }
);

watch(
  isStartupBackgroundTargetReady,
  (ready) => {
    if (ready) markStartupBackgroundComposited();
    else resetStartupBackgroundComposite();
  },
  { immediate: true }
);

watch(
  isStartupBackgroundReady,
  (ready) => {
    if (ready) releaseStartupMask();
  },
  { immediate: true }
);

startupMaskMaxWaitTimer = window.setTimeout(releaseStartupMaskAfterTimeout, STARTUP_MASK_MAX_WAIT_MS);

onBeforeUnmount(clearPixiBackgroundHideTimer);
onBeforeUnmount(clearStartupMaskTimers);
onBeforeUnmount(clearBackgroundImageTimers);
onBeforeUnmount(clearLiveDesktopCompositorKeeperTimer);

onMounted(() => {
  refreshBackgroundLayoutMetrics();
  window.addEventListener("resize", refreshBackgroundLayoutMetrics);
  window.addEventListener("focus", refreshBackgroundLayoutMetrics);
  window.addEventListener(LIVE_DESKTOP_DEBUG_SETTINGS_CHANGED_EVENT, handleLiveDesktopDebugSettingsChanged);
  window.addEventListener("storage", handleLiveDesktopDebugSettingsStorage);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", refreshBackgroundLayoutMetrics);
  window.removeEventListener("focus", refreshBackgroundLayoutMetrics);
  window.removeEventListener(LIVE_DESKTOP_DEBUG_SETTINGS_CHANGED_EVENT, handleLiveDesktopDebugSettingsChanged);
  window.removeEventListener("storage", handleLiveDesktopDebugSettingsStorage);
});

const headerDomRefs = { headerRef, searchRef, searchInputRef };
const desktopDomRefs = { desktopMainRef, rootRef, shellRef };
const chromeFrameRefs = { pageDotsRef, shellRef };

const settingsPanelState = { ...settingsPanel, appVersion };
const liveDesktopDiagnosticsPort = import.meta.env.DEV
  ? Object.freeze({
    async applyRuntime({ restart }) {
      if (typeof restart !== "boolean") {
        throw new TypeError("Live Desktop runtime restart must be a boolean");
      }
      const method = restart
        ? settingsPanelState.restartLiveDesktopBackgroundRuntime
        : settingsPanelState.syncLiveDesktopBackgroundRuntime;
      if (typeof method !== "function") throw new Error("Live Desktop runtime apply method is unavailable");
      return method();
    },
    getRuntimeStatus() {
      return settingsPanelState.liveDesktopRuntimeStatus?.value || null;
    },
    async refreshRuntime() {
      if (typeof settingsPanelState.refreshLiveDesktopRuntimeStatus !== "function") {
        throw new Error("Live Desktop runtime refresh method is unavailable");
      }
      return settingsPanelState.refreshLiveDesktopRuntimeStatus();
    },
  })
  : null;

function resolveMaybeRef(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

const folderClosingHandoffId = computed(() => resolveFolderClosingHandoffId({
  activityFolderId: folderPixiInternalActivityFolderId.value,
  hasPixiActivity: folderPixiInternalActivity.value,
  isHomeRevealSettling: isHomeRevealSettling.value,
  retainedFolderId: folderClosingHandoffRetainId.value,
}));

const folderSourceGhostedId = computed(() => {
  const folderId = renderedFolder.value?.id || openFolderId.value || folderPixiInternalActivityFolderId.value;
  if (!folderId) return null;
  if (folderPixiInternalActivity.value && folderPixiInternalActivityFolderId.value === folderId) return folderId;
  const isStagedOpeningSession = folderOpenIconGhostSession.value?.folderId === folderId &&
    folderOpenIconGhostSession.value?.status === "staged";
  if (
    (openFolderId.value || isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value || isFolderClosing.value) &&
    (!isStagedOpeningSession || isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value || isFolderClosing.value)
  ) return folderId;
  return isFolderOpeningPreviewFrameGhosted(folderId) ? folderId : null;
});

const folderSourceGhostedIds = computed(() => {
  return resolveFolderSourceGhostedIds({
    folderOpenIconGhostSession: folderOpenIconGhostSession.value,
    folderOpenPreviewFrameGhostedIds: folderOpenPreviewFrameGhostedIds.value,
    folderPixiInternalActivity: folderPixiInternalActivity.value,
    folderPixiInternalActivityFolderId: folderPixiInternalActivityFolderId.value,
    isFolderAppLaunchClosing: isFolderAppLaunchClosing.value,
    isFolderClosing: isFolderClosing.value,
    isFolderOpeningPreviewFrameGhosted,
    isFolderZoomFadeClosing: isFolderZoomFadeClosing.value,
    openFolderId: openFolderId.value,
    renderedFolderId: renderedFolder.value?.id || null,
  });
});

const desktopSceneFrame = computed(() => makeDesktopSceneFrame({
  activePageIndex: resolveMaybeRef(activePageIndex),
  activePages: resolveMaybeRef(activePages),
  desktopGridDebugOptions: resolveMaybeRef(desktopGridDebugOptions),
  desktopProjectionEpoch: resolveMaybeRef(desktopProjectionEpoch),
  desktopTrackMotionKey: resolveMaybeRef(desktopTrackMotionKey),
  desktopVisualAlpha: resolveMaybeRef(desktopVisualAlpha),
  desktopVisualTransform: resolveMaybeRef(desktopVisualTransform),
  dragFolderHoverState: resolveMaybeRef(dragFolderHoverState),
  dragFolderTargetId: resolveMaybeRef(dragFolderTargetId),
  dragHitDebugOptions: resolveMaybeRef(desktopDragHitDebugOptions),
  dragHitDebugState: resolveMaybeRef(dragHitDebugState),
  dragMeta: resolveMaybeRef(dragMeta),
  focusedIcon: resolveMaybeRef(focusedIcon),
  folderClosingHandoffId: resolveMaybeRef(folderClosingHandoffId),
  folderPageSize: resolveMaybeRef(folderPageSize),
  folderSourceGhostedId: resolveMaybeRef(folderSourceGhostedId),
  folderSourceGhostedIds: resolveMaybeRef(folderSourceGhostedIds),
  gridCols: resolveMaybeRef(gridCols),
  gridRows: resolveMaybeRef(gridRows),
  groupDragState: resolveMaybeRef(groupDragState),
  iconGesturePresentation: resolveMaybeRef(iconGesturePresentation),
  iconSize: resolveMaybeRef(iconSize),
  isBatchSelectionActive: resolveMaybeRef(isBatchSelectionActive),
  isDesktopClosing: resolveMaybeRef(isDesktopClosing),
  isEditMode: resolveMaybeRef(isEditMode),
  isHomeRevealSettling: resolveMaybeRef(isHomeRevealSettling),
  isSearchMode: resolveMaybeRef(isSearchMode),
  isTextlessMode: resolveMaybeRef(isTextlessMode),
  launchTargetStatusById: resolveMaybeRef(launchTargetStatusById),
  launchpadVisualAlpha: resolveMaybeRef(launchpadVisualAlpha),
  launchpadVisualTransform: resolveMaybeRef(launchpadVisualTransform),
  pageGridMeasureStyle: resolveMaybeRef(pageGridMeasureStyle),
  pageTrackScrub: resolveMaybeRef(pageTrackScrub),
  selectedAppIds: resolveMaybeRef(batchSelectedIds),
  showMissingLaunchTargetBadge: resolveMaybeRef(showMissingLaunchTargetBadge),
  singleStageDiagnosticsOptions: resolveMaybeRef(singleStageDiagnosticsOptions),
}));

const desktopSceneRuntime = makeDesktopSceneRuntimeAdapter({
  domRefs: desktopDomRefs,
  folderOverlayState: folderOverlay,
  getDesktopPageRenderMode,
  getVisibleDesktopPage,
  iconBoundsRegistry,
  isFolderOpeningPreviewFrameGhosted,
  isIconOpening,
  liveDesktopDiagnosticsPort,
  setPageRef,
});

function handlePixiSceneEvent(event = {}) {
  assertSceneEvent(event);
  switch (event.type) {
    case "desktop-focus":
      keyboardFocusArea.value = "desktop";
      return;
    case "group-release-complete":
      completeGroupRelease(event.payload);
      return;
    case "internal-activity":
      handleFolderPixiInternalActivity(event.active, event.folderId);
      return;
    case "icon-pointerdown":
      handleIconPointerDown(event.event, event.item, event.source);
      return;
    case "context-menu-request":
      handleContextMenuRequest(event.event);
      return;
    case "remove-app":
      removeManagedAppFromLaunchpad(event.itemId);
      return;
    case "choose-app-icon":
      openExistingAppIconChooser(event.itemId);
      return;
    case "reset-app-icon":
      resetAppCustomIcon(event.itemId);
      return;
    case "surface-pointerdown":
      handleLaunchpadSurfacePointerDown(event.event);
      return;
    case "wheel":
      handleLaunchpadWheel(event.event);
      return;
    default:
      throw new TypeError(`Unhandled SceneEvent type: ${String(event.type)}`);
  }
}

function handleFolderPixiInternalActivity(active, folderId = null) {
  const next = resolveFolderPixiActivityUpdate({
    active,
    currentActivityFolderId: folderPixiInternalActivityFolderId.value,
    folderId,
    retainedFolderId: folderClosingHandoffRetainId.value,
  });
  folderPixiInternalActivity.value = next.hasPixiActivity;
  folderPixiInternalActivityFolderId.value = next.activityFolderId;
  folderClosingHandoffRetainId.value = next.retainedFolderId;
}

watch(
  [folderPixiInternalActivity, isHomeRevealSettling],
  ([hasPixiActivity, isSettling]) => {
    if (shouldClearFolderClosingHandoffRetainId({
      hasPixiActivity,
      isHomeRevealSettling: isSettling,
    })) {
      folderClosingHandoffRetainId.value = null;
    }
  }
);

function isLaunchpadDialogOpen() {
  return Boolean(
    resolveMaybeRef(dialogs.isWarningDialogOpen) ||
    resolveMaybeRef(dialogs.editorModel?.isOpen) ||
    resolveMaybeRef(dialogs.iconChooserModel?.chooser) ||
    resolveMaybeRef(dialogs.scanResultModel?.isOpen)
  );
}

function isContextMenuInteractionBlocked() {
  return isLaunchpadContextMenuInteractionBlocked({
    dragMeta: resolveMaybeRef(dragMeta),
    isBatchSelectionActive: isBatchSelectionActive.value,
    isDialogOpen: isLaunchpadDialogOpen(),
    isEditMode: isEditMode.value,
    isHomeInteractionDisabled: isHomeInteractionDisabled.value,
    isSettingsPanelOpen: shouldRenderSettingsPanel.value,
  });
}

function openIconContextMenu(event, item, source) {
  if (isContextMenuInteractionBlocked()) return false;
  return launchpadOverlaysRef.value?.openIconContextMenu(event, item, source) || false;
}

function openSurfaceContextMenu(event) {
  if (
    isContextMenuInteractionBlocked() ||
    isSearchMode.value ||
    isFolderLayerActive.value
  ) {
    return false;
  }
  return launchpadOverlaysRef.value?.openSurfaceContextMenu(event, {
    canScan: canScanManagedApps,
    isScanning: isScanningApps,
  }) || false;
}

function openFolderSurfaceContextMenu(event, folderId) {
  if (isContextMenuInteractionBlocked() || !folderId) return false;
  return launchpadOverlaysRef.value?.openFolderSurfaceContextMenu(event, folderId) || false;
}

function handleChromeContextMenuRequest(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return openSurfaceContextMenu(event);
}

function handleContextMenuRequest(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const folderId = renderedFolder.value?.id || openFolderId.value || null;
  const target = resolveLaunchpadContextMenuTarget({
    clientX: event?.clientX,
    clientY: event?.clientY,
    folderId,
    folderPanelRect: openFolderId.value
      ? folderPanelRef.value?.getBoundingClientRect?.() || null
      : null,
    getIconAtPoint: (x, y, options) => iconBoundsRegistry.getAtPoint(
      ICON_BOUNDS_KIND.LAUNCH,
      x,
      y,
      options
    ),
    isFolderLayerActive: isFolderLayerActive.value,
    isInteractionBlocked: isContextMenuInteractionBlocked(),
    isSearchMode: isSearchMode.value,
    mainRect: desktopMainRef.value?.getBoundingClientRect?.() || null,
  });
  if (target?.kind === "icon") {
    return openIconContextMenu(event, target.item, target.source);
  }
  if (target?.kind === "folder-surface") {
    return openFolderSurfaceContextMenu(event, target.folderId);
  }
  if (target?.kind === "surface") return openSurfaceContextMenu(event);
  launchpadOverlaysRef.value?.closeContextMenu();
  return false;
}

function handleContextMenuAction({ action, item, source, kind } = {}) {
  if (kind === "folder-surface") {
    if (action === "batch-manage") enterBatchSelection();
    return;
  }
  if (kind === "surface") {
    if (action === "batch-manage") enterBatchSelection();
    if (action === "compact-pages") confirmForceFillAllPages();
    if (action === "scan-apps") void rescanManagedApps();
    if (action === "open-settings") openSettingsPanel();
    return;
  }
  if (kind !== "icon") return;
  if (item?.type === "app") {
    if (action === "open") openApp(item, source);
    if (action === "edit") openEditManagedApp(item);
    if (action === "remove-from-launchpad") removeManagedAppFromLaunchpad(item.id);
    if (action === "exclude-from-scan") excludeManagedAppFromScan(item);
    return;
  }
  if (item?.type !== "folder") return;
  if (action === "open") commitOpenFolder(item.id);
  if (action === "rename") requestFolderRename(item.id);
  if (action === "dissolve") confirmDissolveFolder(item.id);
}

function handleLaunchpadSurfacePointerDown(event) {
  if (launchpadOverlaysRef.value?.closeContextMenu()) {
    return;
  }
  handleDesktopSurfacePointerDown(event);
}
</script>
