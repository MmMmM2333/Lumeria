import { onBeforeUnmount, onMounted, watch } from "vue";
import { APPEARANCE_SYSTEM } from "../domain/appearancePreference.js";
import { getElementFromRef } from "./usePageGridMetrics.js";

export function registerLaunchpadLifecycleWatchers(options, watchFn = watch) {
  const {
    activePages,
    backgroundAcrylicAppearance,
    backgroundAcrylicBlurStrength,
    backgroundAcrylicDarkParams,
    backgroundAcrylicLightParams,
    backgroundBaseColor,
    backgroundBaseOpacity,
    backgroundBlurStrength,
    backgroundDarkenColor,
    backgroundDarkenStrength,
    backgroundEffect,
    backgroundImageOpacity,
    backgroundLiveDesktopOpacity,
    backgroundImagePath,
    backgroundSource,
    syncLiveDesktopBackgroundRuntime,
    effectiveFolderIconSize,
    filteredManagedApps,
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderRows,
    folderViewportRef,
    fullscreenOverscanEnabled,
    gridCols,
    gridRows,
    hiddenAppIds,
    iconSize,
    isDesktopOpen,
    isSearchMode,
    isTextlessMode,
    launchpadIconVariant,
    observeFolderViewport,
    pages,
    renderedFolder,
    scanAppBlacklist,
    scanKeywordAllowlist,
    scanKeywordBlacklist,
    scanRoots,
    scheduleFolderViewportMetrics,
    scheduleLaunchTargetStatusCheck,
    scheduleNativeLayoutSave,
    schedulePageGridMetrics,
    setNativeWindowEffectsEnabled,
    settingsThemePreference,
    showMissingLaunchTargetBadge,
    showCustomTitlebar,
    syncWindowsWallpaperRefreshTimer,
    syncManagedAppState,
    systemAppearance,
    visibleFolderRowCount,
    windowMode,
    windowEffectAppearance,
    windowEffectMaterial,
  } = options;

  watchFn([gridRows, gridCols, folderRows, folderCols, iconSize, isTextlessMode, isSearchMode], schedulePageGridMetrics, { flush: "post" });
  watchFn([renderedFolder, folderRows, folderCols, effectiveFolderIconSize, isTextlessMode, visibleFolderRowCount], scheduleFolderViewportMetrics, { flush: "post" });
  watchFn(folderViewportRef, observeFolderViewport, { flush: "post" });
  watchFn(activePages, schedulePageGridMetrics, { flush: "post" });
  watchFn([pages, gridRows, gridCols, folderRows, folderCols, iconSize, folderIconSizeMode, folderIconSize, isTextlessMode, hiddenAppIds, scanRoots, scanKeywordAllowlist, scanKeywordBlacklist, scanAppBlacklist, showMissingLaunchTargetBadge, backgroundBaseColor, backgroundBaseOpacity, backgroundSource, backgroundEffect, backgroundImageOpacity, backgroundLiveDesktopOpacity, backgroundBlurStrength, backgroundAcrylicBlurStrength, backgroundDarkenColor, backgroundDarkenStrength, backgroundAcrylicAppearance, backgroundAcrylicDarkParams, backgroundAcrylicLightParams, backgroundImagePath, windowMode, fullscreenOverscanEnabled, showCustomTitlebar, windowEffectMaterial, windowEffectAppearance, settingsThemePreference, launchpadIconVariant], scheduleNativeLayoutSave, { flush: "post" });
  watchFn([pages, showMissingLaunchTargetBadge], scheduleLaunchTargetStatusCheck, { flush: "post" });
  watchFn(filteredManagedApps, syncManagedAppState, { flush: "post" });
  watchFn([backgroundSource, isDesktopOpen], syncWindowsWallpaperRefreshTimer, { flush: "post" });
  watchFn([backgroundSource, isDesktopOpen, backgroundEffect, backgroundLiveDesktopOpacity, backgroundBlurStrength, backgroundAcrylicBlurStrength, backgroundDarkenColor, backgroundDarkenStrength, backgroundAcrylicAppearance, backgroundAcrylicDarkParams, backgroundAcrylicLightParams], syncLiveDesktopBackgroundRuntime, { flush: "post" });
  watchFn(systemAppearance, () => {
    if (windowEffectAppearance.value === APPEARANCE_SYSTEM) {
      setNativeWindowEffectsEnabled(true);
    }
    if (backgroundAcrylicAppearance.value === APPEARANCE_SYSTEM) {
      syncLiveDesktopBackgroundRuntime();
    }
  }, { flush: "post" });
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

export function runLaunchpadMountedEffects(options, ResizeObserverCtor = globalThis.ResizeObserver, lifecycle = null) {
  const {
    completeRendererStartup,
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
  if (lifecycle) lifecycle.active = true;
  const startStartupTask = (task) => {
    try {
      return Promise.resolve(task());
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const listenerReady = startStartupTask(registerNativeEventListeners);
  const sceneReady = startStartupTask(loadNativeLaunchpadData).then((ready) => {
    if (ready !== true) throw new Error("Native scene restore did not reach the ready state");
  });
  Promise.all([listenerReady, sceneReady]).then(() => {
    if (lifecycle && !lifecycle.active) return null;
    return completeRendererStartup?.();
  }).catch((error) => {
    console.error("Failed to complete native renderer startup", error);
  });

  return createLaunchpadLayoutResizeObserver(options, ResizeObserverCtor);
}

export function runLaunchpadBeforeUnmountEffects(options, layoutResizeObserver = null, lifecycle = null) {
  const {
    cancelInputGesture,
    cancelPreviewRaf,
    clearAltEditTimer,
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearDragRelease,
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderCloseHandoffFrame,
    clearFolderPageTurn,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    clearHomeRevealSettleTimer,
    clearLaunchGhostTimer,
    clearLayoutProjectionRelease,
    clearTransientNoticeTimer,
    clearNativeEventListeners,
    clearNativeSaveTimer,
    flushNativeLayoutSave,
    clearPageJumpRenderRange,
    clearPageTurn,
    clearPendingTarget,
    clearSettingsPanelCloseTimer,
    clearWarningDialogTimer,
    disposeInteractions,
    disconnectFolderViewportObserver,
    disposeSettingsPanelModel,
    handleAltKeyUp,
    handleGlobalKeydown,
    handleWindowBlur,
    updateFolderViewportHeight,
    updatePageGridMetrics,
  } = options;

  if (lifecycle) lifecycle.active = false;
  disposeInteractions();
  cancelPreviewRaf();
  clearPendingTarget();
  clearDragRelease?.();
  clearPageTurn();
  clearFolderPageTurn();
  clearFolderOpenIconGhosts?.();
  clearFolderCloseIconGhosts?.();
  clearFolderCloseTimer();
  clearFolderCloseHandoffFrame?.();
  clearFolderAppLaunchTimer();
  clearLayoutProjectionRelease?.(true);
  clearSettingsPanelCloseTimer();
  disposeSettingsPanelModel();
  clearWarningDialogTimer();
  clearHomeRevealSettleTimer();
  clearDesktopCloseTimer();
  clearAppLaunchTimer();
  clearLaunchGhostTimer();
  clearTransientNoticeTimer?.();
  clearPageJumpRenderRange();
  if (flushNativeLayoutSave) flushNativeLayoutSave();
  else clearNativeSaveTimer();
  clearNativeEventListeners();
  cancelInputGesture();
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
  const lifecycle = { active: false };

  registerLaunchpadLifecycleWatchers(options);

  onMounted(() => {
    layoutResizeObserver = runLaunchpadMountedEffects(options, globalThis.ResizeObserver, lifecycle);
  });

  onBeforeUnmount(() => {
    runLaunchpadBeforeUnmountEffects(options, layoutResizeObserver, lifecycle);
    layoutResizeObserver = null;
  });
}
