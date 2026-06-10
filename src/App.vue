<template>
  <div
    ref="rootRef"
    :class="cx('launchpad-root', isTextlessMode && 'launchpad-root-textless', isStartupMaskMounted && 'launchpad-root-startup-masked', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching')"
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
        :background-blur-strength="backgroundBlurStrength"
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

    <Motion
      ref="shellRef"
      class="launchpad-shell"
      :initial="homeShellInitial"
      :animate="homeShellAnimate"
      :transition="homeShellTransition"
      :style="homeShellStyle"
    >
      <LaunchpadHeader
        :dom-refs="headerDomRefs"
        :drag-disabled="!!dragMeta"
        :is-search-mode="isSearchMode"
        :search-query="searchQuery"
        @search-input="handleSearchInput"
        @search-focus="keyboardFocusArea = 'search'"
        @clear-search="clearSearch"
        @open-settings="openSettingsPanel"
      />

      <PixiDesktopSurface
        :active-page-index="activePageIndex"
        :active-pages="activePages"
        :desktop-projection-epoch="desktopProjectionEpoch"
        :desktop-track-motion-key="desktopTrackMotionKey"
        :dom-refs="desktopDomRefs"
        :drag-folder-hover-state="dragFolderHoverState"
        :drag-folder-target-id="dragFolderTargetId"
        :drag-meta="dragMeta"
        :drag-release-ghost-id="dragReleaseGhostId"
        :folder-page-size="folderPageSize"
        :get-desktop-page-render-mode="getDesktopPageRenderMode"
        :get-visible-desktop-page="getVisibleDesktopPage"
        :grid-cols="gridCols"
        :grid-rows="gridRows"
        :icon-size="iconSize"
        :is-edit-mode="isEditMode"
        :folder-source-ghosted-id="folderSourceGhostedId"
        :is-folder-opening-preview-frame-ghosted="isFolderOpeningPreviewFrameGhosted"
        :is-icon-opening="isIconOpening"
        :is-icon-selected="isIconSelected"
        :is-search-mode="isSearchMode"
        :is-textless-mode="isTextlessMode"
        :launch-target-status-by-id="launchTargetStatusById"
        :page-grid-measure-style="pageGridMeasureStyle"
        :set-page-ref="setPageRef"
        :show-missing-launch-target-badge="showMissingLaunchTargetBadge"
        @desktop-focus="keyboardFocusArea = 'desktop'"
        @pointerdown-icon="beginDrag"
        @open-app="openApp"
        @context-menu-icon="openIconContextMenu"
        @remove-app="removeAppById"
        @choose-app-icon="openExistingAppIconChooser"
        @reset-app-icon="resetAppCustomIcon"
      />

      <footer ref="pageDotsRef" class="page-dots">
        <button
          v-for="index in activePages.length"
          :key="`${isSearchMode ? 'search-dot' : 'page-dot'}-${index}`"
          type="button"
          :class="cx('page-dot', index - 1 === activePageIndex && 'page-dot-active')"
          :aria-label="`切换到第 ${index} 页`"
          @pointerdown.stop
          @click="commitActivePageIndex(index - 1)"
        />
      </footer>
    </Motion>

    <SettingsPanel :state="settingsPanelState" :background-layout-context="backgroundLayoutContext" />
    <LaunchpadDialogs :state="dialogState" />
    <PixiFolderOverlay
      :active="shouldRunFolderPixi"
      :state="folderOverlayState"
      @pointerdown-icon="beginDrag"
      @open-app="openApp"
      @context-menu-icon="openIconContextMenu"
    />
    <PixiDragPreviewOverlay
      :active="shouldRunDragPreviewPixi"
      :folder-page-size="folderPageSize"
      :icon-size="iconSize"
      :is-textless-mode="isTextlessMode"
      :launch-target-status-by-id="launchTargetStatusById"
      :preview-state="dragPreviewState"
      :release-state="dragReleaseState"
      :folder-hover-state="dragFolderHoverState"
      :show-missing-launch-target-badge="showMissingLaunchTargetBadge"
    />
    <LaunchpadOverlays
      ref="launchpadOverlaysRef"
      :state="overlayState"
      @open-context-app="openApp"
      @edit-context-app="openEditManagedApp"
    />
    <BackgroundDebugPanel v-if="isAcrylicDebugPanelEnabled" />
    <div
      v-if="isStartupMaskMounted"
      :class="cx('launchpad-startup-mask', !isStartupMaskVisible && 'launchpad-startup-mask-hidden')"
      aria-hidden="true"
    />
  </div>
</template>

<script setup>
import { Motion } from "motion-v";
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import LaunchpadDialogs from "./components/LaunchpadDialogs.vue";
import LaunchpadHeader from "./components/LaunchpadHeader.vue";
import LaunchpadOverlays from "./components/LaunchpadOverlays.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import PixiBackgroundSurface from "./rendering/pixi/PixiBackgroundSurface.vue";
import PixiDesktopSurface from "./rendering/pixi/PixiDesktopSurface.vue";
import PixiDragPreviewOverlay from "./rendering/pixi/PixiDragPreviewOverlay.vue";
import PixiFolderOverlay from "./rendering/pixi/PixiFolderOverlay.vue";
import { getBackgroundLayoutContext } from "./api/launchpadApi.js";
import { loadBackgroundImagePixelSize } from "./composables/useBackgroundImagePixelSize.js";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import { resolveCssBackgroundImagePlacement } from "./domain/backgroundImageLayout.js";
import {
  createDialogState,
  createFolderOverlayState,
  createOverlayState,
  createSettingsPanelState,
} from "./composables/useLaunchpadViewAdapters.js";
import appPackage from "../package.json";
import "./styles/launchpad.css";

const controller = useLaunchpadController();
const {
  rootRef,
  rootStyle,
  backgroundAcrylicParams,
  backgroundEffect,
  backgroundBlurStrength,
  backgroundImageOpacity,
  backgroundImageLayout,
  backgroundImagePath,
  backgroundImageUrl,
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
  homeShellInitial,
  homeShellAnimate,
  homeShellTransition,
  homeShellStyle,
  headerRef,
  openEditManagedApp,
  openExistingAppIconChooser,
  showMissingLaunchTargetBadge,
  dragFolderHoverState,
  dragFolderTargetId,
  dragMeta,
  dragPreviewState,
  dragReleaseState,
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
  getVisibleDesktopPage,
  folderPageSize,
  isIconSelected,
  launchTargetStatusById,
  isIconOpening,
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
} = controller;

const appVersion = appPackage.version;
const isAcrylicDebugPanelEnabled = import.meta.env.DEV;
const BackgroundDebugPanel = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./components/BackgroundDebugPanel.vue"))
  : null;
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
const backgroundImageLayers = ref([
  { id: "background-image-a", url: null, visible: false },
  { id: "background-image-b", url: null, visible: false },
]);
const shouldRunPixiOverlays = computed(() => Boolean(
  isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value
));
const shouldRunFolderPixi = computed(() => Boolean(
  shouldRunPixiOverlays.value && (
    openFolderId.value ||
    renderedFolder.value ||
    isFolderClosing.value ||
    isFolderAppLaunchClosing.value
  )
));
const shouldRunDragPreviewPixi = computed(() => Boolean(
  shouldRunPixiOverlays.value && (
    dragMeta.value ||
    dragPreviewState.value?.item ||
    dragReleaseState.value?.item
  )
));
let pixiBackgroundHideTimer = null;
let startupMaskRemoveTimer = null;
let startupMaskMaxWaitTimer = null;
let startupBackgroundFrame = null;
let backgroundImageGeneration = 0;
let backgroundImageShowFrame = null;
let backgroundImageClearTimer = null;
let activeBackgroundImageLayerIndex = 0;

function parseCssOpacity(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function backgroundImageUrlStyle(url) {
  return `url(${JSON.stringify(url)})`;
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
  const nextStyle = { ...rootStyle.value };
  if (shouldGateBackgroundOverlay.value) {
    nextStyle["--launchpad-background-overlay-opacity"] = `${targetBackgroundOverlayOpacity.value * (hasVisibleBackgroundImageLayer.value ? 1 : 0)}`;
  }
  return nextStyle;
});

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
    backgroundBlurStrength.value,
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

onMounted(() => {
  refreshBackgroundLayoutMetrics();
  window.addEventListener("resize", refreshBackgroundLayoutMetrics);
  window.addEventListener("focus", refreshBackgroundLayoutMetrics);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", refreshBackgroundLayoutMetrics);
  window.removeEventListener("focus", refreshBackgroundLayoutMetrics);
});

const headerDomRefs = { headerRef, searchRef, searchInputRef };
const desktopDomRefs = { desktopMainRef };

const settingsPanelState = createSettingsPanelState(controller, appVersion);
const dialogState = createDialogState(controller);
const folderOverlayState = createFolderOverlayState(controller);
const overlayState = createOverlayState(controller);

const dragReleaseGhostId = computed(() => dragReleaseState.value?.item?.id || null);

const folderSourceGhostedId = computed(() => {
  const folderId = renderedFolder.value?.id || openFolderId.value;
  if (!folderId) return null;
  if (openFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value) return folderId;
  return isFolderOpeningPreviewFrameGhosted(folderId) ? folderId : null;
});

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
