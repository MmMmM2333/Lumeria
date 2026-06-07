<template>
  <div
    ref="rootRef"
    :class="cx('launchpad-root', isTextlessMode && 'launchpad-root-textless', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching')"
    :style="rootStyle"
    @wheel="handleLaunchpadWheel"
    @pointerdown="handleLaunchpadSurfacePointerDown"
  >
    <div class="launchpad-bg">
      <div class="launchpad-bg-image" :style="backgroundImageStyle" />
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

    <SettingsPanel :state="settingsPanelState" />
    <LaunchpadDialogs :state="dialogState" />
    <PixiFolderOverlay
      :state="folderOverlayState"
      @pointerdown-icon="beginDrag"
      @open-app="openApp"
      @context-menu-icon="openIconContextMenu"
    />
    <PixiDragPreviewOverlay
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
  </div>
</template>

<script setup>
import { Motion } from "motion-v";
import { computed, ref } from "vue";
import LaunchpadDialogs from "./components/LaunchpadDialogs.vue";
import LaunchpadHeader from "./components/LaunchpadHeader.vue";
import LaunchpadOverlays from "./components/LaunchpadOverlays.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import PixiDesktopSurface from "./rendering/pixi/PixiDesktopSurface.vue";
import PixiDragPreviewOverlay from "./rendering/pixi/PixiDragPreviewOverlay.vue";
import PixiFolderOverlay from "./rendering/pixi/PixiFolderOverlay.vue";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
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
  backgroundImageStyle,
  cx,
  gridRows,
  gridCols,
  iconSize,
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
const launchpadOverlaysRef = ref(null);

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
