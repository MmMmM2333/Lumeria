import { onBeforeUnmount, onMounted, watch } from "vue";
import { getElementFromRef } from "./usePageGridMetrics.js";

export function registerLaunchpadLifecycleWatchers(options, watchFn = watch) {
  const {
    activePages,
    effectiveFolderIconSize,
    filteredManagedApps,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderRows,
    folderViewportRef,
    gridCols,
    gridRows,
    hiddenAppIds,
    iconSize,
    isSearchMode,
    isTextlessMode,
    observeFolderViewport,
    pages,
    renderedFolder,
    scheduleFolderViewportMetrics,
    scheduleNativeLayoutSave,
    schedulePageGridMetrics,
    syncManagedAppState,
    visibleFolderRowCount,
  } = options;

  watchFn([gridRows, gridCols, folderRows, folderCols, iconSize, isTextlessMode, isSearchMode], schedulePageGridMetrics, { flush: "post" });
  watchFn([renderedFolder, folderRows, folderCols, effectiveFolderIconSize, isTextlessMode, visibleFolderRowCount], scheduleFolderViewportMetrics, { flush: "post" });
  watchFn(folderViewportRef, observeFolderViewport, { flush: "post" });
  watchFn(activePages, schedulePageGridMetrics, { flush: "post" });
  watchFn([pages, gridRows, gridCols, folderRows, folderCols, iconSize, folderIconSizeMode, folderIconSize, isTextlessMode, hiddenAppIds], scheduleNativeLayoutSave, { flush: "post" });
  watchFn(filteredManagedApps, syncManagedAppState, { flush: "post" });
}

export function createLaunchpadLayoutResizeObserver(options, ResizeObserverCtor = globalThis.ResizeObserver) {
  const {
    desktopMainRef,
    headerRef,
    pageDotsRef,
    rootRef,
    searchRef,
    updatePageGridMetrics,
  } = options;

  if (typeof ResizeObserverCtor === "undefined") return null;

  const layoutResizeObserver = new ResizeObserverCtor(updatePageGridMetrics);
  [rootRef, headerRef, searchRef, desktopMainRef, pageDotsRef].forEach((nodeRef) => {
    const element = getElementFromRef(nodeRef);
    if (element) layoutResizeObserver.observe(element);
  });
  return layoutResizeObserver;
}

export function runLaunchpadMountedEffects(options, ResizeObserverCtor = globalThis.ResizeObserver) {
  const {
    handleAltKeyUp,
    handleGlobalKeydown,
    handleWindowBlur,
    loadNativeLaunchpadData,
    registerNativeEventListeners,
    scheduleFolderViewportMetrics,
    schedulePageGridMetrics,
    updateFolderViewportHeight,
    updatePageGridMetrics,
  } = options;

  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("keyup", handleAltKeyUp);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("resize", updatePageGridMetrics);
  window.addEventListener("resize", updateFolderViewportHeight);
  schedulePageGridMetrics();
  scheduleFolderViewportMetrics();
  registerNativeEventListeners().finally(loadNativeLaunchpadData);

  return createLaunchpadLayoutResizeObserver(options, ResizeObserverCtor);
}

export function runLaunchpadBeforeUnmountEffects(options, layoutResizeObserver = null) {
  const {
    cancelLongPress,
    cancelPreviewRaf,
    clearAltEditTimer,
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderPageTurn,
    clearHomeRevealSettleTimer,
    clearLaunchGhostTimer,
    clearNativeEventListeners,
    clearNativeSaveTimer,
    clearPageJumpRenderRange,
    clearPageTurn,
    clearPendingTarget,
    clearSettingsPanelCloseTimer,
    detachDragListeners,
    disconnectFolderViewportObserver,
    handleAltKeyUp,
    handleGlobalKeydown,
    handleWindowBlur,
    updateFolderViewportHeight,
    updatePageGridMetrics,
  } = options;

  detachDragListeners();
  cancelPreviewRaf();
  clearPendingTarget();
  clearPageTurn();
  clearFolderPageTurn();
  clearFolderCloseTimer();
  clearFolderAppLaunchTimer();
  clearSettingsPanelCloseTimer();
  clearHomeRevealSettleTimer();
  clearDesktopCloseTimer();
  clearAppLaunchTimer();
  clearLaunchGhostTimer();
  clearPageJumpRenderRange();
  clearNativeSaveTimer();
  clearNativeEventListeners();
  cancelLongPress();
  clearAltEditTimer();
  if (layoutResizeObserver) layoutResizeObserver.disconnect();
  disconnectFolderViewportObserver();
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("keyup", handleAltKeyUp);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("resize", updatePageGridMetrics);
  window.removeEventListener("resize", updateFolderViewportHeight);
}

export function useLaunchpadLifecycle(options) {
  let layoutResizeObserver = null;

  registerLaunchpadLifecycleWatchers(options);

  onMounted(() => {
    layoutResizeObserver = runLaunchpadMountedEffects(options);
  });

  onBeforeUnmount(() => {
    runLaunchpadBeforeUnmountEffects(options, layoutResizeObserver);
    layoutResizeObserver = null;
  });
}
