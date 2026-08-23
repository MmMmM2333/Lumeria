import {
  onBeforeUnmount,
  onMounted,
  watch,
  type Ref,
  type WatchSource,
} from "vue";
import { APPEARANCE_SYSTEM } from "../domain/appearancePreference.js";
import { getElementFromRef } from "./usePageGridMetrics.js";
import type { DomRefSource } from "./usePageGridMetrics.js";

type PostFlushWatchOptions = Readonly<{ flush: "post" }>;
export type LaunchpadLifecycleWatch = (
  source: WatchSource<unknown> | readonly WatchSource<unknown>[],
  callback: (...args: unknown[]) => unknown,
  options: PostFlushWatchOptions,
) => unknown;

type ReactiveValue = Ref<unknown>;

export type LaunchpadLifecycleWatcherOptions = Readonly<{
  activePages: ReactiveValue;
  backgroundAcrylicAppearance: ReactiveValue;
  backgroundAcrylicBlurStrength: ReactiveValue;
  backgroundAcrylicDarkParams: ReactiveValue;
  backgroundAcrylicLightParams: ReactiveValue;
  backgroundBaseColor: ReactiveValue;
  backgroundBaseOpacity: ReactiveValue;
  backgroundBlurStrength: ReactiveValue;
  backgroundDarkenColor: ReactiveValue;
  backgroundDarkenStrength: ReactiveValue;
  backgroundEffect: ReactiveValue;
  backgroundImageLayout?: ReactiveValue;
  backgroundImageOpacity: ReactiveValue;
  backgroundImagePath: ReactiveValue;
  backgroundLiveDesktopOpacity: ReactiveValue;
  backgroundSource: ReactiveValue;
  effectiveFolderIconSize: ReactiveValue;
  filteredManagedApps: ReactiveValue;
  folderCols: ReactiveValue;
  folderIconSize: ReactiveValue;
  folderIconSizeMode: ReactiveValue;
  folderRows: ReactiveValue;
  folderViewportRef: ReactiveValue;
  fullscreenOverscanEnabled: ReactiveValue;
  gridCols: ReactiveValue;
  gridRows: ReactiveValue;
  hiddenAppIds: ReactiveValue;
  iconSize: ReactiveValue;
  isDesktopOpen: ReactiveValue;
  isSearchMode: ReactiveValue;
  isTextlessMode: ReactiveValue;
  launchpadIconVariant: ReactiveValue;
  launchTargetStatusById?: ReactiveValue;
  observeFolderViewport: (...args: unknown[]) => unknown;
  pages: ReactiveValue;
  renderedFolder: ReactiveValue;
  scanAppBlacklist: ReactiveValue;
  scanKeywordAllowlist: ReactiveValue;
  scanKeywordBlacklist: ReactiveValue;
  scanRoots: ReactiveValue;
  scheduleFolderViewportMetrics: (...args: unknown[]) => unknown;
  scheduleLaunchTargetStatusCheck: (...args: unknown[]) => unknown;
  scheduleNativeLayoutSave: (...args: unknown[]) => unknown;
  schedulePageGridMetrics: (...args: unknown[]) => unknown;
  setNativeWindowEffectsEnabled: (enabled: boolean) => unknown;
  settingsThemePreference: ReactiveValue;
  showCustomTitlebar: ReactiveValue;
  showMissingLaunchTargetBadge: ReactiveValue;
  syncLiveDesktopBackgroundRuntime: (...args: unknown[]) => unknown;
  syncManagedAppState: (...args: unknown[]) => unknown;
  syncWindowsWallpaperRefreshTimer: (...args: unknown[]) => unknown;
  systemAppearance: ReactiveValue;
  visibleFolderRowCount: ReactiveValue;
  windowEffectAppearance: ReactiveValue;
  windowEffectMaterial: ReactiveValue;
  windowMode: ReactiveValue;
}>;

export type LaunchpadLayoutResizeObserver = Pick<ResizeObserver, "disconnect" | "observe">;
export type LaunchpadResizeObserverConstructor = new (
  callback: ResizeObserverCallback,
) => LaunchpadLayoutResizeObserver;

export type LaunchpadLayoutResizeOptions = Readonly<{
  desktopMainRef: DomRefSource<Element>;
  headerRef: DomRefSource<Element>;
  pageDotsRef: DomRefSource<Element>;
  rootRef: DomRefSource<Element>;
  searchRef: DomRefSource<Element>;
  updatePageGridMetrics: () => void;
}>;

export type LaunchpadMountedEffectsOptions = LaunchpadLayoutResizeOptions & Readonly<{
  completeRendererStartup?: (() => unknown) | undefined;
  handleAltKeyUp: (event: KeyboardEvent) => void;
  handleGlobalKeydown: (event: KeyboardEvent) => void;
  handleWindowBlur: (event: FocusEvent) => void;
  loadNativeLaunchpadData: () => boolean | Promise<boolean>;
  registerNativeEventListeners: () => unknown | Promise<unknown>;
  scheduleFolderViewportMetrics: () => unknown;
  schedulePageGridMetrics: () => unknown;
  updateFolderViewportHeight: () => void;
}>;

export type LaunchpadBeforeUnmountOptions = Readonly<{
  cancelInputGesture: () => unknown;
  cancelPreviewRaf: () => unknown;
  clearAltEditTimer: () => unknown;
  clearAppLaunchTimer: () => unknown;
  clearDesktopCloseTimer: () => unknown;
  clearDragRelease?: (() => unknown) | undefined;
  clearFolderAppLaunchTimer: () => unknown;
  clearFolderCloseHandoffFrame?: (() => unknown) | undefined;
  clearFolderCloseIconGhosts?: (() => unknown) | undefined;
  clearFolderCloseTimer: () => unknown;
  clearFolderOpenIconGhosts?: (() => unknown) | undefined;
  clearFolderPageTurn: () => unknown;
  clearHomeRevealSettleTimer: () => unknown;
  clearLaunchGhostTimer: () => unknown;
  clearLayoutProjectionRelease?: ((immediate: boolean) => unknown) | undefined;
  clearNativeEventListeners: () => unknown;
  clearNativeSaveTimer: () => unknown;
  clearPageJumpRenderRange: () => unknown;
  clearPageTurn: () => unknown;
  clearPendingTarget: () => unknown;
  clearSettingsPanelCloseTimer: () => unknown;
  clearTransientNoticeTimer?: (() => unknown) | undefined;
  clearWarningDialogTimer: () => unknown;
  disconnectFolderViewportObserver: () => unknown;
  disposeInteractions: () => unknown;
  disposeSettingsPanelModel: () => unknown;
  flushNativeLayoutSave?: (() => unknown) | undefined;
  handleAltKeyUp: (event: KeyboardEvent) => void;
  handleGlobalKeydown: (event: KeyboardEvent) => void;
  handleWindowBlur: (event: FocusEvent) => void;
  updateFolderViewportHeight: () => void;
  updatePageGridMetrics: () => void;
}>;

export type LaunchpadLifecycleOptions = LaunchpadLifecycleWatcherOptions
  & LaunchpadMountedEffectsOptions
  & LaunchpadBeforeUnmountOptions;

export type LaunchpadLifecycleState = { active: boolean };

export function registerLaunchpadLifecycleWatchers(
  options: LaunchpadLifecycleWatcherOptions,
  watchFn: LaunchpadLifecycleWatch = watch as unknown as LaunchpadLifecycleWatch,
): void {
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

export function createLaunchpadLayoutResizeObserver(
  options: LaunchpadLayoutResizeOptions,
  ResizeObserverCtor: LaunchpadResizeObserverConstructor | undefined = globalThis.ResizeObserver,
): LaunchpadLayoutResizeObserver | null {
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

export function runLaunchpadMountedEffects(
  options: LaunchpadMountedEffectsOptions,
  ResizeObserverCtor: LaunchpadResizeObserverConstructor | undefined = globalThis.ResizeObserver,
  lifecycle: LaunchpadLifecycleState | null = null,
): LaunchpadLayoutResizeObserver | null {
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
  const startStartupTask = (task: () => unknown): Promise<unknown> => {
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

export function runLaunchpadBeforeUnmountEffects(
  options: LaunchpadBeforeUnmountOptions,
  layoutResizeObserver: LaunchpadLayoutResizeObserver | null = null,
  lifecycle: LaunchpadLifecycleState | null = null,
): void {
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

export function useLaunchpadLifecycle(options: LaunchpadLifecycleOptions): void {
  let layoutResizeObserver: LaunchpadLayoutResizeObserver | null = null;
  const lifecycle: LaunchpadLifecycleState = { active: false };

  registerLaunchpadLifecycleWatchers(options);

  onMounted(() => {
    layoutResizeObserver = runLaunchpadMountedEffects(options, globalThis.ResizeObserver, lifecycle);
  });

  onBeforeUnmount(() => {
    runLaunchpadBeforeUnmountEffects(options, layoutResizeObserver, lifecycle);
    layoutResizeObserver = null;
  });
}
