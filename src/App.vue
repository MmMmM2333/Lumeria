<template>
  <div
    ref="rootRef"
    :class="cx('launchpad-root', windowMode === 'windowed' && 'launchpad-root-windowed', isTextlessMode && 'launchpad-root-textless', isStartupMaskMounted && 'launchpad-root-startup-masked', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching', shouldUseLiveDesktopCssFallbackEffects && 'launchpad-root-live-desktop-css-fallback-effects', shouldUseSingleStageRootStage && 'launchpad-root-pixi-root-stage', shouldUseSingleStageFolderLayer && 'launchpad-root-single-stage-folder-layer')"
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
      @search-input="handleSearchInput"
      @search-focus="keyboardFocusArea = 'search'"
      @clear-search="clearSearch"
      @open-settings="openSettingsPanel"
      @page-index="commitActivePageIndex"
    >
      <PixiDesktopSurface
        :key="singleStageRenderKey"
        :active-page-index="activePageIndex"
        :active-pages="activePages"
        :desktop-visual-transform="desktopVisualTransform"
        :desktop-visual-alpha="desktopVisualAlpha"
        :launchpad-visual-transform="launchpadVisualTransform"
        :launchpad-visual-alpha="launchpadVisualAlpha"
        :desktop-projection-epoch="desktopProjectionEpoch"
        :desktop-track-motion-key="desktopTrackMotionKey"
        :dom-refs="desktopDomRefs"
        :drag-folder-hover-state="dragFolderHoverState"
        :drag-folder-target-id="dragFolderTargetId"
        :drag-meta="dragMeta"
        :drag-preview-state="dragPreviewState"
        :drag-release-ghost-id="dragReleaseGhostId"
        :drag-release-state="dragReleaseState"
        :folder-overlay-state="folderOverlayState"
        :folder-page-size="folderPageSize"
        :folder-closing-handoff-id="folderClosingHandoffId"
        :get-desktop-page-render-mode="getDesktopPageRenderMode"
        :get-visible-desktop-page="getVisibleDesktopPage"
        :grid-cols="gridCols"
        :grid-rows="gridRows"
        :icon-size="iconSize"
        :is-edit-mode="isEditMode"
        :folder-source-ghosted-id="folderSourceGhostedId"
        :folder-source-ghosted-ids="folderSourceGhostedIds"
        :is-folder-opening-preview-frame-ghosted="isFolderOpeningPreviewFrameGhosted"
        :is-icon-opening="isIconOpening"
        :is-icon-selected="isIconSelected"
        :is-home-reveal-settling="isHomeRevealSettling"
        :is-search-mode="isSearchMode"
        :is-textless-mode="isTextlessMode"
        :launch-target-status-by-id="launchTargetStatusById"
        :page-grid-measure-style="pageGridMeasureStyle"
        :page-track-scrub="resolveMaybeRef(controller.pageTrackScrub)"
        :desktop-grid-debug-options="desktopGridDebugOptions"
        :set-page-ref="setPageRef"
        :show-missing-launch-target-badge="showMissingLaunchTargetBadge"
        :single-stage-options="singleStageOptions"
        :single-stage-render-key="singleStageRenderKey"
        @desktop-focus="keyboardFocusArea = 'desktop'"
        @drag-release-complete="clearDragRelease"
        @internal-activity="handleFolderPixiInternalActivity"
        @pointerdown-icon="beginDrag"
        @open-app="openApp"
        @context-menu-icon="openIconContextMenu"
        @remove-app="removeAppById"
        @choose-app-icon="openExistingAppIconChooser"
        @reset-app-icon="resetAppCustomIcon"
        @surface-pointerdown="handleLaunchpadSurfacePointerDown"
        @wheel="handleLaunchpadWheel"
      />
    </LaunchpadChromeFrame>

    <SettingsPanel :state="settingsPanelState" :background-layout-context="backgroundLayoutContext" />
    <LaunchpadDialogs :state="dialogState" />
    <LaunchpadOverlays
      ref="launchpadOverlaysRef"
      :state="overlayState"
      @open-context-app="openApp"
      @edit-context-app="openEditManagedApp"
    />
    <WindowChromeOverlay :active="isWindowChromeOverlayActive" />
    <BackgroundDebugPanel
      v-if="isAcrylicDebugPanelEnabled"
      :state="settingsPanelState"
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
import SettingsPanel from "./components/SettingsPanel.vue";
import WindowChromeOverlay from "./components/WindowChromeOverlay.vue";
import PixiBackgroundSurface from "./rendering/pixi/PixiBackgroundSurface.vue";
import PixiDesktopSurface from "./rendering/pixi/PixiDesktopSurface.vue";
import {
  getSingleStageOptions,
  getSingleStageOptionsKey,
  installSingleStageGlobalFlag,
  makeSingleStageRuntimeProbe,
  makeSingleStageRuntimePlan,
  SINGLE_STAGE_CHANGED_EVENT,
} from "./rendering/pixi/scene/singleStagePlan.js";
import {
  resolveFolderClosingHandoffId,
  resolveFolderPixiActivityUpdate,
  resolveFolderSourceGhostedIds,
  shouldClearFolderClosingHandoffRetainId,
} from "./rendering/pixi/scene/folderClosingHandoffActivity.js";
import { getBackgroundLayoutContext } from "./api/launchpadApi.js";
import { loadBackgroundImagePixelSize } from "./composables/useBackgroundImagePixelSize.js";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import { backgroundSourceUsesLiveDesktop } from "./composables/useLaunchpadSettingsConfig.js";
import { resolveCssBackgroundImagePlacement } from "./domain/backgroundImageLayout.js";
import { isLiveDesktopExperimentEnabled } from "./domain/experimentalFeatures.js";
import {
  resetDesktopLayoutDebugParams,
  resolveDesktopGridDebugOptions,
  resolveDesktopLayoutDebugStyle,
  updateDesktopLayoutDebugParams,
  useDesktopLayoutDebugParams,
} from "./components/backgroundDebug/desktopLayoutDebugSettings.js";
import {
  createDialogState,
  createFolderOverlayState,
  createOverlayState,
  createSettingsPanelState,
} from "./composables/useLaunchpadViewAdapters.js";
import appPackage from "../package.json";
import "./styles/launchpad.css";

const controller = useLaunchpadController();
installSingleStageGlobalFlag();
const {
  rootRef,
  rootStyle,
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
  shouldRenderPixiBackgroundEffect,
  cx,
  gridRows,
  gridCols,
  iconSize,
  isTextlessMode,
  isDesktopOpen,
  isDesktopClosing,
  isHomeInteractionDisabled,
  isAppLaunching,
  isNativeLayoutReady,
  isEditMode,
  isSettingsPanelOpen,
  shouldRenderSettingsPanel,
  settingsOverlayAnimate,
  settingsPanelInitial,
  settingsPanelAnimate,
  handleLaunchpadWheel,
  shellRef,
  desktopVisualTransform,
  desktopVisualAlpha,
  launchpadVisualTransform,
  launchpadVisualAlpha,
  homeChromeInitial,
  homeChromeAnimate,
  homeChromeTransition,
  homeChromeStyle,
  headerRef,
  openEditManagedApp,
  openExistingAppIconChooser,
  showMissingLaunchTargetBadge,
  dragFolderHoverState,
  dragFolderTargetId,
  dragMeta,
  dragPreviewState,
  dragReleaseState,
  clearDragRelease,
  openSettingsPanel,
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
  commitActivePageIndex,
  desktopProjectionEpoch,
  desktopTrackMotionKey,
  getDesktopPageRenderMode,
  setPageRef,
  pageGridMeasureStyle,
  schedulePageGridMetrics,
  getVisibleDesktopPage,
  folderPageSize,
  isIconSelected,
  launchTargetStatusById,
  isIconOpening,
  folderOpenPreviewFrameGhostedIds,
  isFolderOpeningPreviewFrameGhosted,
  beginDrag,
  openApp,
  removeAppById,
  resetAppCustomIcon,
  pageDotsRef,
  openFolderId,
  renderedFolder,
  isFolderClosing,
  isFolderAppLaunchClosing,
  isFolderZoomFadeClosing,
  isHomeRevealSettling,
  windowMode,
} = controller;

const appVersion = appPackage.version;
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
const isLiveDesktopExperimentActive = computed(() => isLiveDesktopExperimentEnabled());
const LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY = "launchpadLiveDesktopCompositorKeeper";
const LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT = "launchpad-live-desktop-compositor-keeper-change";
const LIVE_DESKTOP_COMPOSITOR_KEEPER_INTERVAL_MS = 250;
const LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY = "launchpadLiveDesktopCssFallbackEffects";
const LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_CHANGED_EVENT = "launchpad-live-desktop-css-fallback-effects-change";
const SINGLE_STAGE_REFRESH_MS = 250;
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
const backgroundLayoutContext = ref(null);
const backgroundImagePixelSize = ref(null);
const backgroundViewportSize = ref({ height: 1, width: 1 });
const isLiveDesktopCompositorKeeperEnabled = ref(isLiveDesktopExperimentEnabled()
  ? readLiveDesktopCompositorKeeperSetting()
  : false);
const liveDesktopCompositorTick = ref(0);
liveDesktopCssFallbackEffectsEnabled.value = isLiveDesktopExperimentEnabled()
  ? readLiveDesktopCssFallbackEffectsSetting()
  : false;
const backgroundImageLayers = ref([
  { id: "background-image-a", url: null, visible: false },
  { id: "background-image-b", url: null, visible: false },
]);
const folderPixiInternalActivity = ref(false);
const folderPixiInternalActivityFolderId = ref(null);
const folderClosingHandoffRetainId = ref(null);
const singleStageOptions = ref(getSingleStageOptions());
const shouldRunPixiOverlays = computed(() => Boolean(
  isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value
));
const singleStageRuntimePlan = computed(() => makeSingleStageRuntimePlan(singleStageOptions.value, {
  dragMeta: dragMeta.value,
  dragPreviewItem: dragPreviewState.value?.item,
  dragReleaseItem: dragReleaseState.value?.item,
  folderPixiInternalActivity: folderPixiInternalActivity.value,
  isFolderAppLaunchClosing: isFolderAppLaunchClosing.value,
  isFolderClosing: isFolderClosing.value,
  openFolderId: openFolderId.value,
  renderedFolder: renderedFolder.value,
  shouldRunPixiOverlays: shouldRunPixiOverlays.value,
}));
const shouldUseSingleStageRootStage = computed(() => singleStageRuntimePlan.value.useRootStage);
const shouldUseSingleStageFolderLayer = computed(() => singleStageRuntimePlan.value.useFolderLayer);
const singleStageRenderKey = computed(() => singleStageRuntimePlan.value.renderKey);
function publishSingleStageRuntimeProbe() {
  if (typeof document === "undefined") return;
  const runtimePlan = singleStageRuntimePlan.value;
  const probe = makeSingleStageRuntimeProbe(runtimePlan, {
    canvasCount: document.querySelectorAll("canvas").length,
    rootStageHost: Boolean(document.querySelector(".pixi-desktop-host-root-stage")),
    rootStageMain: Boolean(document.querySelector(".pixi-desktop-main-root-stage")),
    stableStageIsUnified: runtimePlan.useRootStage === true,
  });
  globalThis.__LP_SINGLE_STAGE_RUNTIME__ = probe;
  if (probe.expectedSingleStage && !probe.isSingleStageStable && singleStageRuntimeProbeFrame == null && typeof window !== "undefined") {
    singleStageRuntimeProbeFrame = window.requestAnimationFrame(() => {
      singleStageRuntimeProbeFrame = null;
      publishSingleStageRuntimeProbe();
    });
  }
}
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
let singleStageRuntimeProbeFrame = null;
let backgroundImageGeneration = 0;
let backgroundImageShowFrame = null;
let backgroundImageClearTimer = null;
let liveDesktopCompositorKeeperTimer = null;
let singleStageRefreshTimer = null;
let activeBackgroundImageLayerIndex = 0;
let lastSingleStageOptionsKey = getSingleStageOptionsKey(singleStageOptions.value);

function parseCssOpacity(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function backgroundImageUrlStyle(url) {
  return `url(${JSON.stringify(url)})`;
}

function readLiveDesktopCompositorKeeperSetting() {
  if (!isLiveDesktopExperimentEnabled()) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readLiveDesktopCssFallbackEffectsSetting() {
  if (!isLiveDesktopExperimentEnabled()) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function handleLiveDesktopCompositorKeeperChanged(event) {
  if (!isLiveDesktopExperimentEnabled()) return;
  const enabled = event?.detail?.enabled;
  isLiveDesktopCompositorKeeperEnabled.value = typeof enabled === "boolean"
    ? enabled
    : readLiveDesktopCompositorKeeperSetting();
}

function handleLiveDesktopCssFallbackEffectsChanged(event) {
  if (!isLiveDesktopExperimentEnabled()) return;
  const enabled = event?.detail?.enabled;
  liveDesktopCssFallbackEffectsEnabled.value = typeof enabled === "boolean"
    ? enabled
    : readLiveDesktopCssFallbackEffectsSetting();
}

function handleLiveDesktopCompositorKeeperStorage(event) {
  if (!isLiveDesktopExperimentEnabled()) return;
  if (event?.key !== LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY) return;
  isLiveDesktopCompositorKeeperEnabled.value = event.newValue === "true";
}

function handleLiveDesktopCssFallbackEffectsStorage(event) {
  if (!isLiveDesktopExperimentEnabled()) return;
  if (event?.key !== LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY) return;
  liveDesktopCssFallbackEffectsEnabled.value = event.newValue === "true";
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

function clearSingleStageRuntimeProbeFrame() {
  if (singleStageRuntimeProbeFrame == null) return;
  window.cancelAnimationFrame(singleStageRuntimeProbeFrame);
  singleStageRuntimeProbeFrame = null;
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
    console.warn("LaunchPad startup mask timed out before the background was fully ready");
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

function refreshSingleStageOptions() {
  const nextOptions = getSingleStageOptions();
  const nextKey = getSingleStageOptionsKey(nextOptions);
  if (nextKey === lastSingleStageOptionsKey) return;
  lastSingleStageOptionsKey = nextKey;
  singleStageOptions.value = nextOptions;
}

function startSingleStageRefreshTimer() {
  if (!import.meta.env.DEV || singleStageRefreshTimer != null) return;
  singleStageRefreshTimer = window.setInterval(
    refreshSingleStageOptions,
    SINGLE_STAGE_REFRESH_MS
  );
}

function clearSingleStageRefreshTimer() {
  if (singleStageRefreshTimer == null) return;
  window.clearInterval(singleStageRefreshTimer);
  singleStageRefreshTimer = null;
}

watch(
  [
    singleStageRuntimePlan,
    shouldUseSingleStageRootStage,
    shouldUseSingleStageFolderLayer,
  ],
  publishSingleStageRuntimeProbe,
  { flush: "post", immediate: true }
);

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
    resetStartupBackgroundComposite();
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
onBeforeUnmount(clearSingleStageRefreshTimer);
onBeforeUnmount(clearSingleStageRuntimeProbeFrame);

onMounted(() => {
  refreshBackgroundLayoutMetrics();
  refreshSingleStageOptions();
  publishSingleStageRuntimeProbe();
  startSingleStageRefreshTimer();
  window.addEventListener("resize", refreshBackgroundLayoutMetrics);
  window.addEventListener("focus", refreshBackgroundLayoutMetrics);
  window.addEventListener(LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT, handleLiveDesktopCompositorKeeperChanged);
  window.addEventListener(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_CHANGED_EVENT, handleLiveDesktopCssFallbackEffectsChanged);
  window.addEventListener(SINGLE_STAGE_CHANGED_EVENT, refreshSingleStageOptions);
  window.addEventListener("storage", handleLiveDesktopCompositorKeeperStorage);
  window.addEventListener("storage", handleLiveDesktopCssFallbackEffectsStorage);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", refreshBackgroundLayoutMetrics);
  window.removeEventListener("focus", refreshBackgroundLayoutMetrics);
  window.removeEventListener(LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT, handleLiveDesktopCompositorKeeperChanged);
  window.removeEventListener(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_CHANGED_EVENT, handleLiveDesktopCssFallbackEffectsChanged);
  window.removeEventListener(SINGLE_STAGE_CHANGED_EVENT, refreshSingleStageOptions);
  window.removeEventListener("storage", handleLiveDesktopCompositorKeeperStorage);
  window.removeEventListener("storage", handleLiveDesktopCssFallbackEffectsStorage);
});

const headerDomRefs = { headerRef, searchRef, searchInputRef };
const desktopDomRefs = { desktopMainRef, rootRef, shellRef };
const chromeFrameRefs = { pageDotsRef, shellRef };

const settingsPanelState = createSettingsPanelState(controller, appVersion);
const dialogState = createDialogState(controller);
const folderOverlayState = createFolderOverlayState(controller);
const overlayState = createOverlayState(controller);

function resolveMaybeRef(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

const dragReleaseGhostId = computed(() => dragReleaseState.value?.item?.id || null);
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
  if (openFolderId.value || isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value || isFolderClosing.value) return folderId;
  return isFolderOpeningPreviewFrameGhosted(folderId) ? folderId : null;
});

const folderSourceGhostedIds = computed(() => {
  return resolveFolderSourceGhostedIds({
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

function openIconContextMenu(event, app, source) {
  launchpadOverlaysRef.value?.openIconContextMenu(event, app, source);
}

function handleLaunchpadSurfacePointerDown(event) {
  if (launchpadOverlaysRef.value?.closeIconContextMenu()) {
    return;
  }
  handleDesktopSurfacePointerDown(event);
}
</script>
