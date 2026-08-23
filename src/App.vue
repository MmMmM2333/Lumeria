<template>
  <div
    ref="rootRef"
    :data-launchpad-fixture="isMultiSelectFixture ? 'multi-select' : undefined"
    :class="cx('launchpad-root', 'launchpad-root-pixi-root-stage', 'launchpad-root-single-stage-folder-layer', isFolderLayerActive && 'launchpad-root-folder-layer-active', isBatchSelectionActive && 'launchpad-root-batch-selection', windowMode === 'windowed' && 'launchpad-root-windowed', isWindowTitlebarVisible && 'launchpad-root-windowed-titlebar', isTextlessMode && 'launchpad-root-textless', isStartupMaskMounted && 'launchpad-root-startup-masked', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching', shouldUseLiveDesktopCssFallbackEffects && 'launchpad-root-live-desktop-css-fallback-effects')"
    :style="launchpadRootStyle"
    @wheel="handleNativeLaunchpadWheel"
    @pointerdown="handleNativeLaunchpadSurfacePointerDown"
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
      @open-settings="requestOpenSettingsPanel"
      @page-index="commitChromePageIndex"
    >
      <PixiDesktopSurface
        :key="singleStageRenderKey"
        ref="pixiDesktopSurfaceRef"
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
    <WindowChromeOverlay
      :active="isWindowChromeOverlayActive"
      :show-titlebar="isWindowTitlebarVisible"
      @request-close="chrome.closeNativeWindow"
    />
    <BackgroundDebugPanel
      v-if="isAcrylicDebugPanelEnabled"
      :state="settingsPanelState"
      :dialog-state="backgroundDebugDialogState"
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

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CSSProperties, Ref } from "vue";
import LaunchpadDialogs from "./components/LaunchpadDialogs.vue";
import LaunchpadChromeFrame from "./components/LaunchpadChromeFrame.vue";
import LaunchpadOverlays from "./components/LaunchpadOverlays.vue";
import LaunchpadSelectionToolbar from "./components/LaunchpadSelectionToolbar.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import WindowChromeOverlay from "./components/WindowChromeOverlay.vue";
import type {
  IconContextMenuActionPayload,
  IconContextMenuPointerEvent,
  LaunchpadOverlaysExpose,
} from "./components/iconContextMenuGeometry.js";
import PixiBackgroundSurface from "./rendering/pixi/PixiBackgroundSurface.vue";
import PixiDesktopSurface from "./rendering/pixi/PixiDesktopSurface.vue";
import {
  assertSceneEvent,
  makeControlledPointerInput,
  makeControlledWheelInput,
} from "./rendering/sceneEvents.js";
import type {
  ControlledPointerInput,
  GroupReleaseCompletionPayload,
  SceneEventData,
  SceneEventDataObject,
} from "./rendering/sceneEvents.js";
import { assertCompleteDesktopSceneFrame, makeDesktopSceneFrame } from "./rendering/sceneFrame.js";
import type { CompleteDesktopSceneFrame } from "./rendering/sceneFrame.js";
import { makeDesktopSceneRuntimeAdapter } from "./rendering/sceneRuntime.js";
import {
  getSingleStageDiagnosticsOptions,
  getSingleStageRenderKey,
  ICON_BOUNDS_VARIANT,
  resolveFolderClosingHandoffId,
  resolveFolderPixiActivityUpdate,
  resolveFolderSourceGhostedIds,
  shouldClearFolderClosingHandoffRetainId,
} from "./rendering/desktopScenePort.js";
import { getBackgroundLayoutContext } from "./api/launchpadApi.js";
import { loadBackgroundImagePixelSize } from "./composables/useBackgroundImagePixelSize.js";
import type { BackgroundImagePixelSize } from "./composables/useBackgroundImagePixelSize.js";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import type {
  LaunchpadLayoutFailureNoticeConfig,
  LaunchpadNoticeIntent,
  LaunchpadWarningDialog,
} from "./composables/useLaunchpadNotices.js";
import type {
  LaunchpadGestureEventListener,
  LaunchpadGesturePointerEvent,
  LaunchpadGesturePointerTarget,
} from "./composables/useLaunchpadInputGestures.js";
import type { LaunchpadDragVisualState } from "./composables/useLaunchpadDrag.js";
import { useLocalization, useLocalizationRuntime } from "./i18n/localization.js";
import { backgroundSourceUsesLiveDesktop } from "./composables/useLaunchpadSettingsConfig.js";
import { resolveCssBackgroundImagePlacement } from "./domain/backgroundImageLayout.js";
import { isLiveDesktopExperimentEnabled } from "./domain/experimentalFeatures.js";
import { runtimePerformanceMetrics } from "./diagnostics/runtimePerformanceMetrics.js";
import {
  isLaunchpadContextMenuInteractionBlocked,
  resolveLaunchpadContextMenuTarget,
} from "./domain/input/launchpadPointerTarget.js";
import type { LaunchSource } from "./domain/input/launchpadPointerTarget.js";
import type {
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
} from "./domain/launchpadLayout.js";
import type { LaunchContext } from "./domain/launchContext.js";
import { ICON_BOUNDS_KIND } from "./rendering/desktopScenePort.js";
import {
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  LIVE_DESKTOP_DEBUG_SETTINGS_CHANGED_EVENT,
  LIVE_DESKTOP_DEBUG_STORAGE_KEYS,
  readLiveDesktopDebugSettings,
} from "./diagnostics/liveDesktopDebugSettings.js";
import type { LiveDesktopDebugSettings } from "./diagnostics/liveDesktopDebugSettings.js";
import type { CapturedFolderOriginBounds } from "./rendering/desktopScenePort.js";
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
const props = withDefaults(defineProps<{
  startupContext?: LaunchContext;
}>(), {
  startupContext: () => ({ origin: "manual" }),
});
const localizationText = useLocalization();
const localizationRuntime = useLocalizationRuntime();
const pixiDesktopSurfaceRef = ref<InstanceType<typeof PixiDesktopSurface> | null>(null);
const selectionToolbarRef = ref<InstanceType<typeof LaunchpadSelectionToolbar> | null>(null);
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
let finishFirstSettingsOpen: (() => number) | null = null;
let settingsFirstOpenMeasured = false;

function requestOpenSettingsPanel(): void {
  if (!settingsFirstOpenMeasured && !finishFirstSettingsOpen && !isSettingsPanelOpen.value) {
    finishFirstSettingsOpen = runtimePerformanceMetrics.begin("settings.first-open");
  }
  openSettingsPanel();
}

watch(
  () => shouldRenderSettingsPanel.value,
  async (shouldRender) => {
    if (!shouldRender || !finishFirstSettingsOpen || settingsFirstOpenMeasured) return;
    await nextTick();
    window.requestAnimationFrame(() => {
      if (!finishFirstSettingsOpen || settingsFirstOpenMeasured) return;
      finishFirstSettingsOpen();
      finishFirstSettingsOpen = null;
      settingsFirstOpenMeasured = true;
      runtimePerformanceMetrics.markOnce("settings.first-open-ready");
    });
  },
  { flush: "post" }
);
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
  appLaunchCloseSessionId,
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
  completeProvisionalFolderRollback,
  commitAppLaunchCloseFrame,
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
  getIconTextureItems,
  getDesktopPageRenderMode,
  setPageRef,
  pageGridMeasureStyle,
  pageTrackScrub,
  provisionalFolderRollback,
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
const launchpadOverlaysRef = ref<LaunchpadOverlaysExpose | null>(null);
const BACKGROUND_MEDIA_FADE_MS = 220;
if (import.meta.env.DEV) {
  let disposeLaunchpadE2eProbe: (() => void) | null = null;
  let launchpadE2eProbeDisposed = false;

  function getLaunchpadE2eIconBounds(iconId: string) {
    const pages = activePages.value || [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      if (!(pages[pageIndex] || []).some((item) => item?.id === iconId)) continue;
      return iconBoundsRegistry.getBounds(
        ICON_BOUNDS_KIND.LAUNCH,
        ICON_BOUNDS_VARIANT.RENDERED,
        { area: "desktop", id: iconId, pageIndex }
      );
    }
    throw new Error(`Launchpad E2E fixture does not contain desktop icon ${iconId}`);
  }

  async function mountLaunchpadE2eProbe() {
    if (launchpadE2eProbeDisposed || !isMultiSelectFixture) return;
    const { installLaunchpadE2eProbe } = await import("./testing/launchpadE2eProbe.js");
    if (launchpadE2eProbeDisposed || !isMultiSelectFixture) return;
    disposeLaunchpadE2eProbe = installLaunchpadE2eProbe({
      getIconBounds: getLaunchpadE2eIconBounds,
      getSnapshotState: () => ({
        authoritativePages: chrome.activePages.value,
        drag: groupDragState.value,
        folder: {
          closing: isFolderClosing.value,
          layerActive: isFolderLayerActive.value,
          openFolderId: openFolderId.value,
          renderedFolderId: renderedFolder.value?.id || null,
        },
        hover: dragFolderHoverState.value,
        renderedPages: activePages.value,
        rollback: provisionalFolderRollback.value,
        visual: pixiDesktopSurfaceRef.value?.getLaunchpadE2eVisualSnapshot?.() || null,
      }),
    });
  }

  onMounted(() => {
    if (isMultiSelectFixture) void mountLaunchpadE2eProbe();
  });

  onBeforeUnmount(() => {
    launchpadE2eProbeDisposed = true;
    disposeLaunchpadE2eProbe?.();
    disposeLaunchpadE2eProbe = null;
  });
}
const PIXI_BACKGROUND_HANDOFF_DELAY_MS = 220;
const STARTUP_MASK_FADE_MS = 260;
const STARTUP_MASK_MAX_WAIT_MS = 8000;
const hasMountedPixiBackgroundEffect = ref(false);
const isPixiBackgroundVisible = ref(false);
const hasRenderedPixiBackground = ref(false);
const hasCompositedStartupBackground = ref(false);
const isStartupMaskMounted = ref(true);
const isStartupMaskVisible = ref(true);
const backgroundImagePixelSize = ref<BackgroundImagePixelSize | null>(null);
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
type BackgroundImageLayer = Readonly<{
  id: string;
  url: string | null;
  visible: boolean;
}>;

const backgroundImageLayers = ref<BackgroundImageLayer[]>([
  { id: "background-image-a", url: null, visible: false },
  { id: "background-image-b", url: null, visible: false },
]);
const folderPixiInternalActivity = ref(false);
const folderPixiInternalActivityFolderId = ref<string | null>(null);
const folderClosingHandoffRetainId = ref<string | null>(null);
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
let pixiBackgroundHideTimer: number | null = null;
let startupMaskRemoveTimer: number | null = null;
let startupMaskMaxWaitTimer: number | null = null;
let startupBackgroundFrame: number | null = null;
let backgroundImageGeneration = 0;
let backgroundImageShowFrame: number | null = null;
let backgroundImageClearTimer: number | null = null;
let liveDesktopCompositorKeeperTimer: number | null = null;
let activeBackgroundImageLayerIndex = 0;

function parseCssOpacity(value: unknown): number {
  const number = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function backgroundImageUrlStyle(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

function applyLiveDesktopFrontendDebugSettings(
  values: LiveDesktopDebugSettings = DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
): void {
  isLiveDesktopCompositorKeeperEnabled.value = Boolean(values.compositorKeeper);
  liveDesktopCssFallbackEffectsEnabled.value = Boolean(values.cssFallbackEffects);
}

function handleLiveDesktopDebugSettingsChanged(_event?: Event): void {
  if (!isLiveDesktopExperimentEnabled()) return;
  const snapshot = readLiveDesktopDebugSettings();
  if (snapshot.issues.length) {
    console.error("Failed to refresh Live Desktop frontend debug settings", snapshot.issues);
  }
  applyLiveDesktopFrontendDebugSettings(snapshot.values);
}

function handleLiveDesktopDebugSettingsStorage(event: StorageEvent): void {
  if (!isLiveDesktopExperimentEnabled()) return;
  if (
    event.key !== LIVE_DESKTOP_DEBUG_STORAGE_KEYS.compositorKeeper
    && event.key !== LIVE_DESKTOP_DEBUG_STORAGE_KEYS.cssFallbackEffects
  ) return;
  handleLiveDesktopDebugSettingsChanged();
}

function clearLiveDesktopCompositorKeeperTimer(): void {
  if (liveDesktopCompositorKeeperTimer == null) return;
  window.clearInterval(liveDesktopCompositorKeeperTimer);
  liveDesktopCompositorKeeperTimer = null;
}

function startLiveDesktopCompositorKeeperTimer(): void {
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

const launchpadRootStyle = computed<CSSProperties>(() => {
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

function clearPixiBackgroundHideTimer(): void {
  if (pixiBackgroundHideTimer == null) return;
  window.clearTimeout(pixiBackgroundHideTimer);
  pixiBackgroundHideTimer = null;
}

function hidePixiBackgroundAfterHandoff(): void {
  clearPixiBackgroundHideTimer();
  pixiBackgroundHideTimer = window.setTimeout(() => {
    pixiBackgroundHideTimer = null;
    if (!shouldRenderPixiBackgroundEffect.value) {
      isPixiBackgroundVisible.value = false;
    }
  }, PIXI_BACKGROUND_HANDOFF_DELAY_MS);
}

function clearStartupMaskTimers(): void {
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

function releaseStartupMask(): void {
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

function releaseStartupMaskAfterTimeout(): void {
  if (!isStartupBackgroundReady.value) {
    console.warn("Lumeria startup mask timed out before the background was fully ready");
  }
  releaseStartupMask();
}

function resetStartupBackgroundComposite(): void {
  if (!isStartupMaskMounted.value) return;
  hasCompositedStartupBackground.value = false;
  if (startupBackgroundFrame != null) {
    window.cancelAnimationFrame(startupBackgroundFrame);
    startupBackgroundFrame = null;
  }
}

function markStartupBackgroundComposited(): void {
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

function restartStartupBackgroundComposite(): void {
  resetStartupBackgroundComposite();
  if (isStartupBackgroundTargetReady.value) markStartupBackgroundComposited();
}

function handlePixiBackgroundReady(): void {
  hasRenderedPixiBackground.value = true;
}

function readBackgroundViewportSize(): void {
  const rect = rootRef.value?.getBoundingClientRect?.();
  const width = Math.max(1, Math.round(rect?.width || window.innerWidth || 1));
  const height = Math.max(1, Math.round(rect?.height || window.innerHeight || 1));
  if (width === backgroundViewportSize.value.width && height === backgroundViewportSize.value.height) return;
  backgroundViewportSize.value = { height, width };
}

async function refreshBackgroundLayoutContext(): Promise<void> {
  try {
    backgroundLayoutContext.value = await getBackgroundLayoutContext();
  } catch (error) {
    backgroundLayoutContext.value = null;
    console.warn("Failed to load background layout context", error);
  }
}

function refreshBackgroundLayoutMetrics(): void {
  readBackgroundViewportSize();
  void refreshBackgroundLayoutContext();
}

function clearBackgroundImageShowFrame(): void {
  if (backgroundImageShowFrame == null) return;
  window.cancelAnimationFrame(backgroundImageShowFrame);
  backgroundImageShowFrame = null;
}

function clearBackgroundImageClearTimer(): void {
  if (backgroundImageClearTimer == null) return;
  window.clearTimeout(backgroundImageClearTimer);
  backgroundImageClearTimer = null;
}

function scheduleHiddenBackgroundImageCleanup(): void {
  clearBackgroundImageClearTimer();
  backgroundImageClearTimer = window.setTimeout(() => {
    backgroundImageClearTimer = null;
    backgroundImageLayers.value = backgroundImageLayers.value.map((layer) => (
      layer.visible ? layer : { ...layer, url: null }
    ));
  }, BACKGROUND_MEDIA_FADE_MS);
}

function hideBackgroundImageLayers(): void {
  clearBackgroundImageShowFrame();
  backgroundImageLayers.value = backgroundImageLayers.value.map((layer) => ({
    ...layer,
    visible: false,
  }));
  scheduleHiddenBackgroundImageCleanup();
}

function revealBackgroundImageLayer(url: string, generation: number): void {
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

function preloadBackgroundImage(url: string): Promise<BackgroundImagePixelSize | null> {
  return loadBackgroundImagePixelSize(url);
}

async function loadVisibleBackgroundImage(url: string, generation: number): Promise<void> {
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

function clearBackgroundImageTimers(): void {
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

interface BackgroundDebugStatusDialogInput extends Readonly<Record<string, unknown>> {
  cancelText?: string;
  confirmText: string;
  intent: string;
  label?: string;
  message: string;
  suggestion?: string;
  title: string;
}

function requireBackgroundDebugNoticeIntent(value: string): LaunchpadNoticeIntent {
  if (value === "error" || value === "info" || value === "success" || value === "warning") {
    return value;
  }
  throw new TypeError(`Background debug notice intent is unsupported: ${value}`);
}

function makeBackgroundDebugWarningDialog(
  input: BackgroundDebugStatusDialogInput,
): LaunchpadWarningDialog {
  return Object.freeze({
    confirmText: input.confirmText,
    intent: requireBackgroundDebugNoticeIntent(input.intent),
    message: input.message,
    title: input.title,
    ...(input.cancelText === undefined ? {} : { cancelText: input.cancelText }),
    ...(input.suggestion === undefined ? {} : { suggestion: input.suggestion }),
  });
}

function makeBackgroundDebugLayoutFailureNotice(
  input: Readonly<Record<string, unknown>>,
): LaunchpadLayoutFailureNoticeConfig {
  const onRetry = input.onRetry;
  if (onRetry !== undefined && typeof onRetry !== "function") {
    throw new TypeError("Background debug layout failure onRetry must be a function when present");
  }
  const retryCount = input.retryCount;
  if (retryCount !== undefined && (typeof retryCount !== "number" || !Number.isFinite(retryCount))) {
    throw new TypeError("Background debug layout failure retryCount must be a finite number when present");
  }
  return Object.freeze({
    ...(Object.prototype.hasOwnProperty.call(input, "error") ? { error: input.error } : {}),
    ...(typeof onRetry === "function" ? { onRetry: () => { onRetry(); } } : {}),
    ...(typeof retryCount === "number" ? { retryCount } : {}),
  });
}

const backgroundDebugTransientNotice = computed<Readonly<{ title?: string }> | null>(() => {
  const notice = dialogs.transientNotice.value;
  return notice ? Object.freeze({ title: notice.title }) : null;
});

const backgroundDebugDialogState = Object.freeze({
  closeTransientNotice: dialogs.closeTransientNotice,
  closeWarningDialog: dialogs.closeWarningDialog,
  openWarningDialog: (input: BackgroundDebugStatusDialogInput): void => {
    dialogs.openWarningDialog(makeBackgroundDebugWarningDialog(input));
  },
  showLayoutLoadFailed: (input: Readonly<Record<string, unknown>>): void => {
    dialogs.showLayoutLoadFailed(makeBackgroundDebugLayoutFailureNotice(input));
  },
  showLayoutLoadRecovered: dialogs.showLayoutLoadRecovered,
  showLayoutSaveFailed: (input: Readonly<Record<string, unknown>>): void => {
    dialogs.showLayoutSaveFailed(makeBackgroundDebugLayoutFailureNotice(input));
  },
  showLayoutSaveRecovered: dialogs.showLayoutSaveRecovered,
  transientNotice: backgroundDebugTransientNotice,
});

const liveDesktopDiagnosticsPort = import.meta.env.DEV
  ? Object.freeze({
    async applyRuntime({ restart }: Readonly<{ restart: boolean }>) {
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

function resolveMaybeRef<Value>(value: Value | Readonly<Ref<Value>>): Value {
  return value && typeof value === "object" && "value" in value
    ? value.value
    : value as Value;
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

const desktopSceneFrame = computed<CompleteDesktopSceneFrame>(() => {
  const frame = makeDesktopSceneFrame({
    activePageIndex: resolveMaybeRef(activePageIndex),
    activePages: resolveMaybeRef(activePages),
    appLaunchCloseSessionId: resolveMaybeRef(appLaunchCloseSessionId),
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
    provisionalFolderRollback: resolveMaybeRef(provisionalFolderRollback),
    selectedAppIds: resolveMaybeRef(batchSelectedIds),
    showMissingLaunchTargetBadge: resolveMaybeRef(showMissingLaunchTargetBadge),
    singleStageDiagnosticsOptions: resolveMaybeRef(singleStageDiagnosticsOptions),
  });
  assertCompleteDesktopSceneFrame(frame);
  return frame;
});

const desktopSceneRuntime = makeDesktopSceneRuntimeAdapter({
  completeProvisionalFolderRollback,
  domRefs: desktopDomRefs,
  folderOverlayState: folderOverlay,
  getDesktopPageRenderMode,
  getIconTextureItems,
  getVisibleDesktopPage,
  iconBoundsRegistry,
  isFolderOpeningPreviewFrameGhosted,
  isIconOpening,
  liveDesktopDiagnosticsPort,
  setPageRef,
});

function isSceneArray(value: SceneEventData): value is readonly SceneEventData[] {
  return Array.isArray(value);
}

function requireSceneRecord(value: SceneEventData, label: string): SceneEventDataObject {
  if (!value || typeof value !== "object" || isSceneArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireSceneArray(value: SceneEventData, label: string): readonly SceneEventData[] {
  if (!isSceneArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requireNonEmptySceneString(value: SceneEventData, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSceneString(value: SceneEventData, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function requireSceneInteger(value: SceneEventData, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function requireOptionalSceneString(
  record: SceneEventDataObject,
  name: string,
  label: string,
): void {
  const value = record[name];
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(`${label}.${name} must be a string when present`);
  }
}

function requireOptionalNullableSceneString(
  record: SceneEventDataObject,
  name: string,
  label: string,
): void {
  const value = record[name];
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new TypeError(`${label}.${name} must be a string or null when present`);
  }
}

function requireOptionalSceneEnum(
  record: SceneEventDataObject,
  name: string,
  values: ReadonlySet<string>,
  label: string,
): void {
  const value = record[name];
  if (value !== undefined && (typeof value !== "string" || !values.has(value))) {
    throw new TypeError(`${label}.${name} has an unsupported value`);
  }
}

function requireOptionalSceneRecord(
  record: SceneEventDataObject,
  name: string,
  label: string,
): SceneEventDataObject | null {
  const value = record[name];
  return value === undefined ? null : requireSceneRecord(value, `${label}.${name}`);
}

function requireLaunchpadApp(value: SceneEventData, label: string): ReadonlyLaunchpadApp {
  const app = requireSceneRecord(value, label);
  requireNonEmptySceneString(app.id, `${label}.id`);
  requireSceneString(app.name, `${label}.name`);
  if (app.type !== "app") throw new TypeError(`${label}.type must be app`);
  requireOptionalSceneString(app, "emoji", label);
  requireOptionalSceneEnum(app, "origin", new Set(["catalog", "manual"]), label);
  for (const name of [
    "iconDataUrl",
    "iconPath",
    "iconUrl",
    "customIconDataUrl",
    "customIconPath",
    "customIconUrl",
  ] as const) {
    requireOptionalNullableSceneString(app, name, label);
  }
  requireOptionalSceneString(app, "launchArgs", label);
  requireOptionalSceneString(app, "trackingKey", label);
  requireOptionalSceneEnum(app, "identityStatus", new Set(["exact", "unresolved"]), label);

  const launchTarget = requireOptionalSceneRecord(app, "launchTarget", label);
  if (launchTarget) {
    for (const name of ["appUserModelId", "kind", "path"] as const) {
      requireOptionalSceneString(launchTarget, name, `${label}.launchTarget`);
    }
  }

  const sources = app.sources;
  if (sources !== undefined) {
    requireSceneArray(sources, `${label}.sources`).forEach((source, index) => {
      const entry = requireSceneRecord(source, `${label}.sources[${index}]`);
      requireOptionalSceneString(entry, "key", `${label}.sources[${index}]`);
    });
  }

  const overrides = requireOptionalSceneRecord(app, "presentationOverrides", label);
  if (overrides) {
    for (const name of ["customIconPath", "emoji", "name"] as const) {
      requireOptionalSceneString(overrides, name, `${label}.presentationOverrides`);
    }
  }

  const catalogPresentation = requireOptionalSceneRecord(app, "catalogPresentation", label);
  if (catalogPresentation) {
    requireSceneString(catalogPresentation.name, `${label}.catalogPresentation.name`);
    requireSceneString(catalogPresentation.emoji, `${label}.catalogPresentation.emoji`);
  }
  return app as ReadonlyLaunchpadApp;
}

function requireLaunchpadItem(value: SceneEventDataObject): ReadonlyLaunchpadItem {
  requireNonEmptySceneString(value.id, "icon-pointerdown.item.id");
  requireSceneString(value.name, "icon-pointerdown.item.name");
  if (value.type === "app") return requireLaunchpadApp(value, "icon-pointerdown.item");
  if (value.type !== "folder") throw new TypeError("icon-pointerdown.item must be an app or folder");
  requireOptionalSceneString(value, "emoji", "icon-pointerdown.item");
  requireSceneArray(value.childPages, "icon-pointerdown.item.childPages").forEach((page, pageIndex) => {
    requireSceneArray(page, `icon-pointerdown.item.childPages[${pageIndex}]`).forEach((child, childIndex) => {
      if (child != null) requireLaunchpadApp(
        child,
        `icon-pointerdown.item.childPages[${pageIndex}][${childIndex}]`,
      );
    });
  });
  return value as ReadonlyLaunchpadFolder;
}

function requireLaunchSource(value: SceneEventDataObject): LaunchSource {
  const source = requireSceneRecord(value, "icon-pointerdown.source");
  const pageIndex = requireSceneInteger(source.pageIndex, "icon-pointerdown.source.pageIndex");
  const index = requireSceneInteger(source.index, "icon-pointerdown.source.index");
  if (source.type === "folder") {
    const folderId = source.folderId;
    if (folderId !== null && typeof folderId !== "string") {
      throw new TypeError("icon-pointerdown.source.folderId must be a string or null");
    }
    return { folderId, index, pageIndex, type: "folder" };
  }
  if (source.type !== "page" && source.type !== "search") {
    throw new TypeError("icon-pointerdown.source.type must be folder, page, or search");
  }
  return { index, pageIndex, type: source.type };
}

function requireDragVisualState(value: SceneEventData | null): LaunchpadDragVisualState | null {
  if (value === null) return null;
  const state = requireSceneRecord(value, "pointer.dragVisualState");
  const numericNames = ["cellHeight", "cellWidth", "iconSize"] as const;
  const booleanNames = ["compact", "singleLineLabel"] as const;
  for (const name of numericNames) {
    const entry = state[name];
    if (entry !== undefined && (typeof entry !== "number" || !Number.isFinite(entry))) {
      throw new TypeError(`pointer.dragVisualState.${name} must be a finite number`);
    }
  }
  for (const name of booleanNames) {
    const entry = state[name];
    if (entry !== undefined && typeof entry !== "boolean") {
      throw new TypeError(`pointer.dragVisualState.${name} must be a boolean`);
    }
  }
  return state as LaunchpadDragVisualState;
}

function requireFiniteSceneNumber(value: SceneEventData, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function requireFolderRect(
  value: SceneEventData,
  label: string,
): CapturedFolderOriginBounds["iconRect"] {
  const rect = requireSceneRecord(value, label);
  return Object.freeze({
    height: requireFiniteSceneNumber(rect.height, `${label}.height`),
    left: requireFiniteSceneNumber(rect.left, `${label}.left`),
    top: requireFiniteSceneNumber(rect.top, `${label}.top`),
    width: requireFiniteSceneNumber(rect.width, `${label}.width`),
  });
}

function requireFolderOriginBounds(value: SceneEventData | null): CapturedFolderOriginBounds | null {
  if (value === null) return null;
  const bounds = requireSceneRecord(value, "pointer.folderOriginBounds");
  const previewChildRects = requireSceneArray(
    bounds.previewChildRects,
    "pointer.folderOriginBounds.previewChildRects",
  ).map((entry, index) => {
    const child = requireSceneRecord(entry, `pointer.folderOriginBounds.previewChildRects[${index}]`);
    return Object.freeze({
      childId: requireNonEmptySceneString(
        child.childId,
        `pointer.folderOriginBounds.previewChildRects[${index}].childId`,
      ),
      rect: requireFolderRect(child.rect, `pointer.folderOriginBounds.previewChildRects[${index}].rect`),
      slotIndex: requireSceneInteger(
        child.slotIndex,
        `pointer.folderOriginBounds.previewChildRects[${index}].slotIndex`,
      ),
    });
  });
  return Object.freeze({
    folderId: requireNonEmptySceneString(bounds.folderId, "pointer.folderOriginBounds.folderId"),
    iconRect: requireFolderRect(bounds.iconRect, "pointer.folderOriginBounds.iconRect"),
    previewChildRects: Object.freeze(previewChildRects),
    thumbRect: requireFolderRect(bounds.thumbRect, "pointer.folderOriginBounds.thumbRect"),
  });
}

function makeControlledGestureTarget(
  target: ControlledPointerInput["target"],
): LaunchpadGesturePointerTarget {
  return Object.freeze({
    closest: target.closest,
    addEventListener: (type: string, listener: LaunchpadGestureEventListener) => {
      target.addEventListener(type, listener as EventListener);
    },
    removeEventListener: (type: string, listener: LaunchpadGestureEventListener) => {
      target.removeEventListener(type, listener as EventListener);
    },
    setPointerCapture: target.setPointerCapture,
    hasPointerCapture: target.hasPointerCapture,
    releasePointerCapture: target.releasePointerCapture,
  });
}

function makeControlledGesturePointerInput(
  pointer: Parameters<typeof makeControlledPointerInput>[0],
  control: Parameters<typeof makeControlledPointerInput>[1],
): LaunchpadGesturePointerEvent {
  const input = makeControlledPointerInput(pointer, control);
  return Object.freeze({
    ...input,
    dragVisualState: requireDragVisualState(input.dragVisualState),
    folderOriginBounds: requireFolderOriginBounds(input.folderOriginBounds),
    target: makeControlledGestureTarget(input.target),
  });
}

function makeControlledGestureWheelInput(
  wheel: Parameters<typeof makeControlledWheelInput>[0],
  control: Parameters<typeof makeControlledWheelInput>[1],
): LaunchpadGesturePointerEvent {
  return makeControlledWheelInput(wheel, control);
}

function completeSceneGroupRelease(payload: GroupReleaseCompletionPayload): void {
  const { reason, ...completion } = payload;
  completeGroupRelease(reason === null ? completion : { ...completion, reason });
}

function rejectUnhandledSceneEvent(event: never): never {
  throw new TypeError(`Unhandled SceneEvent: ${String(event)}`);
}

function handlePixiSceneEvent(value: unknown): void {
  const event = assertSceneEvent(value);
  switch (event.type) {
    case "app-launch-close-frame-committed":
      commitAppLaunchCloseFrame(event.sessionId);
      return;
    case "desktop-focus":
      keyboardFocusArea.value = "desktop";
      return;
    case "group-release-complete":
      completeSceneGroupRelease(event.payload);
      return;
    case "internal-activity":
      handleFolderPixiInternalActivity(event.active, event.folderId);
      return;
    case "icon-pointerdown":
      handleIconPointerDown(
        makeControlledGesturePointerInput(event.pointer, event.control),
        requireLaunchpadItem(event.item),
        requireLaunchSource(event.source),
      );
      return;
    case "context-menu-request":
      handleContextMenuRequest(event.pointer);
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
      handleLaunchpadSurfacePointerDown(makeControlledGesturePointerInput(event.pointer, event.control));
      return;
    case "wheel":
      handleLaunchpadWheel(makeControlledGestureWheelInput(event.wheel, event.control));
      return;
    default:
      return rejectUnhandledSceneEvent(event);
  }
}

function handleFolderPixiInternalActivity(active: boolean, folderId: string | null = null): void {
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

function isLaunchpadDialogOpen(): boolean {
  return Boolean(
    resolveMaybeRef(dialogs.isWarningDialogOpen) ||
    resolveMaybeRef(dialogs.editorModel?.isOpen) ||
    resolveMaybeRef(dialogs.iconChooserModel?.chooser) ||
    resolveMaybeRef(dialogs.scanResultModel?.isOpen)
  );
}

function isContextMenuInteractionBlocked(): boolean {
  return isLaunchpadContextMenuInteractionBlocked({
    dragMeta: resolveMaybeRef(dragMeta),
    isBatchSelectionActive: isBatchSelectionActive.value,
    isDialogOpen: isLaunchpadDialogOpen(),
    isEditMode: isEditMode.value,
    isHomeInteractionDisabled: isHomeInteractionDisabled.value,
    isSettingsPanelOpen: shouldRenderSettingsPanel.value,
  });
}

function openIconContextMenu(
  event: IconContextMenuPointerEvent,
  item: ReadonlyLaunchpadItem,
  source: LaunchSource,
): boolean {
  if (isContextMenuInteractionBlocked()) return false;
  return launchpadOverlaysRef.value?.openIconContextMenu(event, item, source) || false;
}

function openSurfaceContextMenu(event: IconContextMenuPointerEvent): boolean {
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

function openFolderSurfaceContextMenu(
  event: IconContextMenuPointerEvent,
  folderId: string,
): boolean {
  if (isContextMenuInteractionBlocked() || !folderId) return false;
  return launchpadOverlaysRef.value?.openFolderSurfaceContextMenu(event, folderId) || false;
}

function handleChromeContextMenuRequest(event: IconContextMenuPointerEvent): boolean {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return openSurfaceContextMenu(event);
}

function handleContextMenuRequest(event: IconContextMenuPointerEvent): boolean {
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
    getIconAtPoint: (x: number, y: number, options) => iconBoundsRegistry.getAtPoint(
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

function handleContextMenuAction({
  action,
  item,
  source,
  kind,
}: IconContextMenuActionPayload): void {
  if (kind === "folder-surface") {
    if (action === "batch-manage") enterBatchSelection();
    return;
  }
  if (kind === "surface") {
    if (action === "batch-manage") enterBatchSelection();
    if (action === "compact-pages") confirmForceFillAllPages();
    if (action === "scan-apps") void rescanManagedApps();
    if (action === "open-settings") requestOpenSettingsPanel();
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

function requireNativeGestureElement(target: EventTarget | null, label: string): Element {
  if (target instanceof Element) return target;
  throw new TypeError(`${label} must be an element`);
}

function makeNativeGestureTarget(target: EventTarget | null): LaunchpadGesturePointerTarget {
  const element = requireNativeGestureElement(target, "Launchpad gesture event target");
  return Object.freeze({
    closest: (selector: string) => element.closest(selector),
    addEventListener: (type: string, listener: LaunchpadGestureEventListener) => {
      element.addEventListener(type, listener as EventListener);
    },
    removeEventListener: (type: string, listener: LaunchpadGestureEventListener) => {
      element.removeEventListener(type, listener as EventListener);
    },
    setPointerCapture: (pointerId: number) => element.setPointerCapture(pointerId),
    hasPointerCapture: (pointerId: number) => element.hasPointerCapture(pointerId),
    releasePointerCapture: (pointerId: number) => element.releasePointerCapture(pointerId),
  });
}

function makeNativeGestureEvent(event: PointerEvent | WheelEvent): LaunchpadGesturePointerEvent {
  const nativeCurrentTarget = requireNativeGestureElement(
    event.currentTarget,
    "Launchpad gesture event currentTarget",
  );
  const currentTarget = Object.freeze({
    getBoundingClientRect: () => nativeCurrentTarget.getBoundingClientRect(),
  });
  const target = makeNativeGestureTarget(event.target);
  const base = {
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    currentTarget,
    metaKey: event.metaKey,
    preventDefault: () => event.preventDefault(),
    shiftKey: event.shiftKey,
    stopImmediatePropagation: () => event.stopImmediatePropagation(),
    stopPropagation: () => event.stopPropagation(),
    target,
    timeStamp: event.timeStamp,
    type: event.type,
  } satisfies LaunchpadGesturePointerEvent;
  if (event instanceof PointerEvent) {
    return Object.freeze({
      ...base,
      button: event.button,
      buttons: event.buttons,
      isPrimary: event.isPrimary,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
    });
  }
  const momentum = Reflect.get(event, "momentum");
  return Object.freeze({
    ...base,
    deltaMode: event.deltaMode,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    momentum: typeof momentum === "boolean" ? momentum : null,
  });
}

function handleNativeLaunchpadWheel(event: WheelEvent): void {
  handleLaunchpadWheel(makeNativeGestureEvent(event));
}

function handleNativeLaunchpadSurfacePointerDown(event: PointerEvent): void {
  handleLaunchpadSurfacePointerDown(makeNativeGestureEvent(event));
}

function handleLaunchpadSurfacePointerDown(event: LaunchpadGesturePointerEvent): void {
  if (launchpadOverlaysRef.value?.closeContextMenu()) {
    return;
  }
  handleDesktopSurfacePointerDown(event);
}
</script>
