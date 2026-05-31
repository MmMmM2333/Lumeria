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

      <DesktopPager
        :active-desktop-track-animate="activeDesktopTrackAnimate"
        :active-desktop-track-transition="activeDesktopTrackTransition"
        :active-pages="activePages"
        :desktop-layout-enabled="desktopLayoutEnabled"
        :desktop-track-motion-key="desktopTrackMotionKey"
        :dom-refs="desktopDomRefs"
        :drag-folder-target-id="dragFolderTargetId"
        :drag-meta="dragMeta"
        :folder-page-size="folderPageSize"
        :get-active-page-grid-style="getActivePageGridStyle"
        :get-desktop-grid-projection-key="getDesktopGridProjectionKey"
        :get-visible-desktop-page="getVisibleDesktopPage"
        :is-edit-mode="isEditMode"
        :is-icon-opening="isIconOpening"
        :is-icon-selected="isIconSelected"
        :is-search-mode="isSearchMode"
        :is-textless-mode="isTextlessMode"
        :launch-target-status-by-id="launchTargetStatusById"
        :layout-spring="layoutSpring"
        :page-grid-measure-style="pageGridMeasureStyle"
        :set-page-ref="setPageRef"
        :should-render-active-page="shouldRenderActivePage"
        :should-render-static-active-page="shouldRenderStaticActivePage"
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
    <FolderOverlay
      :state="folderOverlayState"
      @pointerdown-icon="beginDrag"
      @open-app="openApp"
      @context-menu-icon="openIconContextMenu"
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
import { ref } from "vue";
import DesktopPager from "./components/DesktopPager.vue";
import FolderOverlay from "./components/FolderOverlay.vue";
import LaunchpadDialogs from "./components/LaunchpadDialogs.vue";
import LaunchpadHeader from "./components/LaunchpadHeader.vue";
import LaunchpadOverlays from "./components/LaunchpadOverlays.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import { useLaunchpadController } from "./composables/useLaunchpadController.js";
import appPackage from "../package.json";
import "./styles/launchpad.css";

const {
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
  launchTargetStatusById,
  isIconOpening,
  beginDrag,
  openApp,
  removeAppById,
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
} = useLaunchpadController();

const appVersion = appPackage.version;
const launchpadOverlaysRef = ref(null);

const headerDomRefs = { headerRef, searchRef, searchInputRef };
const desktopDomRefs = { desktopMainRef };

const settingsPanelState = {
  appManagerSearchQuery,
  appManagerSelectedIds,
  appVersion,
  applySettingsConfig,
  canBrowseScanRoots,
  canScanManagedApps,
  addScanKeywordBlacklistItem,
  addScanRoot,
  browseScanRootDirectory,
  changeScanRootLabel,
  changeScanRootPath,
  changeDraftCols,
  changeDraftFolderCols,
  changeDraftFolderIconSize,
  changeDraftFolderRows,
  changeDraftIconSize,
  changeDraftRows,
  clearManagedAppSelection,
  closeSettingsPanel,
  confirmForceFillAllPages,
  confirmResetScanRoots,
  deleteManagedApp,
  deleteSelectedManagedApps,
  draftCols,
  draftFolderCols,
  draftFolderIconSize,
  draftFolderIconSizeMode,
  draftFolderRows,
  draftIconSize,
  draftRows,
  dragMeta,
  filteredManagedApps,
  getLaunchTargetPath,
  ignoreManagedApp,
  ignoreSelectedManagedApps,
  isScanningApps,
  isBrowsingScanRoot,
  isSettingsPanelOpen,
  isTextlessMode,
  managedApps,
  newScanKeyword,
  openAddManagedAppPage,
  openEditManagedApp,
  panelSpring,
  removeScanAppBlacklistItem,
  removeScanKeywordBlacklistItem,
  removeScanRoot,
  rescanManagedApps,
  scanAppBlacklist,
  scanKeywordBlacklist,
  scanRoots,
  selectedManagedAppCount,
  selectAllManagedApps,
  setDraftFolderIconSizeMode,
  settingsOverlayAnimate,
  settingsPanelAnimate,
  settingsPanelInitial,
  shouldRenderSettingsPanel,
  showMissingLaunchTargetBadge,
  toggleManagedAppSelection,
  toggleMissingLaunchTargetBadge,
  toggleScanRootEnabled,
};

const dialogState = {
  addManagedApp,
  addSelectedScannedApps,
  browseEditAppLaunchFile,
  browseNewAppLaunchFile,
  canAddManagedApp,
  canAddScannedApps,
  canSaveEditingManagedApp,
  canEditAppArgs,
  canEditNewAppArgs,
  canBrowseLaunchFile,
  chooseIconCandidate,
  clearLayoutRecoveryNotice: closeLayoutRecoveryNotice,
  clearLayoutSaveNotice: closeLayoutSaveNotice,
  clearScanResultSelection,
  closeAddManagedAppPage,
  closeEditManagedApp,
  closeIconChooser,
  closeLayoutRecoveryNotice,
  closeLayoutSaveNotice,
  closeScanResultDialog,
  closeWarningDialog,
  confirmWarningDialog,
  editAppArgs,
  editAppIconPath,
  editAppIconDataUrl,
  editAppName,
  editAppTarget,
  editingManagedApp,
  getLaunchTargetPath,
  handleIconChooserUpload,
  iconChooser,
  iconChoices,
  isAddingManagedApp,
  isBrowsingEditAppTarget,
  isBrowsingNewAppTarget,
  isEditAppIconReset,
  isLoadingIconChoices,
  isScanResultDialogOpen,
  isWarningDialogOpen,
  layoutRecoveryNotice,
  layoutSaveNotice,
  newAppArgs,
  newAppIconPath,
  newAppIconDataUrl,
  newAppName,
  newAppTarget,
  newManagedAppGlyph,
  openEditAppIconChooser,
  openNewAppIconChooser,
  resetEditAppIcon,
  resetNewAppIcon,
  saveEditingManagedApp,
  scanResultApps,
  scanResultWarnings,
  scanResultSelectedCount,
  scanResultSelectedIds,
  selectAllScanResultApps,
  toggleScanResultSelection,
  warningDialog,
};

const folderOverlayState = {
  beginDrag,
  commitFolderPageIndex,
  desktopTrackTransition,
  dragMeta,
  folderContentAnimate,
  folderContentInitial,
  folderContentTransition,
  folderGridStyle,
  folderPageIndex,
  folderPageSize,
  folderPages,
  folderPanelAnimate,
  folderPanelInitial,
  folderPanelRef,
  folderPanelStyle,
  folderPanelTransition,
  folderTrackAnimate,
  folderViewportRef,
  getVisibleFolderPage,
  handleFolderOverlayPointerDown,
  isEditMode,
  isFolderAppLaunchClosing,
  isFolderClosing,
  isIconOpening,
  isIconSelected,
  isTextlessMode,
  launchTargetStatusById,
  layoutSpring,
  openExistingAppIconChooser,
  renameFolder,
  removeAppById,
  renderedFolder,
  resetAppCustomIcon,
  setFolderPageRef,
  shouldRenderFolderPage,
  shouldRenderStaticFolderPage,
  showMissingLaunchTargetBadge,
};

const overlayState = {
  appLaunchGhostTransition,
  cx,
  dragMeta,
  dragPreviewRef,
  dragPreviewSpring,
  folderPreviewSlots,
  isTextlessMode,
  launchGhost,
  launchGhostStyle,
};

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
