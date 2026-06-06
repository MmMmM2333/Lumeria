<template>
  <div
    ref="rootRef"
    :class="cx('launchpad-root', isTextlessMode && 'launchpad-root-textless', !isDesktopOpen && 'launchpad-root-closed', isHomeInteractionDisabled && 'launchpad-root-interaction-disabled', isAppLaunching && 'launchpad-root-app-launching')"
    :style="rootStyle"
    @wheel="handleLaunchpadWheel"
    @pointerdown="handleLaunchpadSurfacePointerDown"
  >
    <div class="launchpad-bg" />

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
        :desktop-track-motion-key="desktopTrackMotionKey"
        :dom-refs="desktopDomRefs"
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
  draftRows,
  draftCols,
  draftFolderRows,
  draftFolderCols,
  draftIconSize,
  draftIsTextlessMode,
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
  scanResultWarnings,
  scanResultSelectedIds,
  scanResultSelectedCount,
  canAddScannedApps,
  isAddingManagedApp,
  selectedManagedAppCount,
  newAppName,
  newAppTarget,
  newAppArgs,
  newAppIconPath,
  newAppIconDataUrl,
  isBrowsingNewAppTarget,
  newManagedAppGlyph,
  editingManagedApp,
  editAppName,
  editAppTarget,
  editAppArgs,
  editAppIconPath,
  editAppIconDataUrl,
  isEditAppIconReset,
  isBrowsingEditAppTarget,
  isScanningApps,
  canAddManagedApp,
  canSaveEditingManagedApp,
  canEditAppArgs,
  canEditNewAppArgs,
  canBrowseLaunchFile,
  canBrowseScanRoots,
  canScanManagedApps,
  addScanKeywordBlacklistItem,
  addScanRoot,
  browseScanRootDirectory,
  changeScanRootLabel,
  changeScanRootPath,
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
  iconChoicesError,
  isLoadingIconChoices,
  closeIconChooser,
  chooseIconCandidate,
  handleIconChooserUpload,
  ignoreManagedApp,
  ignoreSelectedManagedApps,
  openExistingAppIconChooser,
  saveEditingManagedApp,
  deleteManagedApp,
  confirmForceFillAllPages,
  confirmResetScanRoots,
  isWarningDialogOpen,
  warningDialog,
  closeWarningDialog,
  confirmWarningDialog,
  layoutRecoveryNotice,
  layoutSaveNotice,
  closeLayoutRecoveryNotice,
  closeLayoutSaveNotice,
  rescanManagedApps,
  removeScanAppBlacklistItem,
  removeScanKeywordBlacklistItem,
  removeScanRoot,
  addManagedApp,
  deleteSelectedManagedApps,
  newScanKeyword,
  scanAppBlacklist,
  scanKeywordBlacklist,
  scanRoots,
  showMissingLaunchTargetBadge,
  toggleMissingLaunchTargetBadge,
  toggleScanRootEnabled,
  isBrowsingScanRoot,
  dragFolderTargetId,
  dragMeta,
  dragPreviewState,
  dragReleaseState,
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
  commitActivePageIndex,
  desktopTrackMotionKey,
  activeDesktopTrackAnimate,
  activeDesktopTrackTransition,
  getDesktopGridProjectionKey,
  getDesktopPageRenderMode,
  setPageRef,
  desktopLayoutEnabled,
  getActivePageGridStyle,
  pageGridMeasureStyle,
  getVisibleDesktopPage,
  folderPageSize,
  isIconSelected,
  launchTargetStatusById,
  isIconOpening,
  isFolderOpeningPreviewFrameGhosted,
  isFolderOpeningPreviewGhosted,
  beginDrag,
  openApp,
  removeAppById,
  resetAppCustomIcon,
  layoutSpring,
  pageDotsRef,
  openFolderId,
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
