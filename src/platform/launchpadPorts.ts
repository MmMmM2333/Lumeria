import {
  applyAppLocalePreference,
  beginMainWindowClose,
  cacheCustomIcon,
  checkLaunchTargets,
  completeRendererStartup,
  confirmQuitAfterSave,
  configureLiveDesktopBackground,
  convertFilePathToAssetUrl,
  getDesktopWallpaperBackground,
  getAppLocaleState,
  getAutostartStatus,
  getLaunchContext,
  getLiveDesktopBackgroundSupport,
  getLiveDesktopRuntimeStatus,
  getMainWindowEffectsSupport,
  hideMainWindow,
  isAutostartAvailable,
  isNativeBridgeAvailable,
  launchApp,
  listenNativeEvent,
  loadLayout,
  loadAppIconChoices,
  openDeveloperConsole,
  pickBackgroundImage,
  pickLaunchFile,
  pickScanRootDirectory,
  revealMainWindow,
  saveLayout,
  scanApps,
  setLiveDesktopBackgroundVisible,
  setLaunchpadIconVariant,
  setMainWindowEffectsEnabled,
  setMainWindowMode,
  setMainWindowNativeFrameEnabled,
  setMainWindowShortcut,
  setMainWindowShortcutCaptureActive,
  setAutostartEnabled,
  showLaunchErrorMessage,
  startLiveDesktopBackground,
  stopLiveDesktopBackground,
} from "../api/launchpadApi.js";
import { createLocaleRuntimePort } from "./localeRuntime.js";
import type { BackgroundAssetPort, CatalogPort, MainWindowPort, DeveloperToolsPort, LiveDesktopPort, LayoutStorePort, LaunchpadIconPort, LocaleRuntimePort, NativeLifecyclePort, NativeStartupPort, AutostartPort } from "./launchpadPortContracts.js";
export type { BackgroundAssetPort, CatalogPort, MainWindowPort, DeveloperToolsPort, LiveDesktopPort, LayoutStorePort, LaunchpadIconPort, LocaleRuntimePort, NativeLifecyclePort, NativeStartupPort, AutostartPort } from "./launchpadPortContracts.js";

function isBrowserFixture() {
  if (!import.meta.env?.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fixture") === "multi-select";
}

export const backgroundAssetPort: BackgroundAssetPort = Object.freeze({
  getDesktopWallpaper: getDesktopWallpaperBackground,
  pickImage: pickBackgroundImage,
  toAssetUrl: convertFilePathToAssetUrl,
});

export const catalogPort: CatalogPort = Object.freeze({
  cacheCustomIcon,
  loadIconChoices: loadAppIconChoices,
  pickLaunchFile,
  pickScanRoot: pickScanRootDirectory,
  scan: scanApps,
  toAssetUrl: convertFilePathToAssetUrl,
});

export const mainWindowPort: MainWindowPort = Object.freeze({
  beginClose: beginMainWindowClose,
  getEffectsSupport: getMainWindowEffectsSupport,
  hide: hideMainWindow,
  isAvailable: isNativeBridgeAvailable,
  registerShortcut: setMainWindowShortcut,
  reveal: revealMainWindow,
  setEffectsEnabled: setMainWindowEffectsEnabled,
  setFrameEnabled: setMainWindowNativeFrameEnabled,
  setMode: setMainWindowMode,
  setShortcutCaptureActive: setMainWindowShortcutCaptureActive,
});

export const developerToolsPort: DeveloperToolsPort = Object.freeze({
  isAvailable: isNativeBridgeAvailable,
  openConsole: openDeveloperConsole,
});

export const liveDesktopPort: LiveDesktopPort = Object.freeze({
  configure: configureLiveDesktopBackground,
  getStatus: getLiveDesktopRuntimeStatus,
  getSupport: getLiveDesktopBackgroundSupport,
  isAvailable: isNativeBridgeAvailable,
  setVisible: setLiveDesktopBackgroundVisible,
  start: startLiveDesktopBackground,
  stop: stopLiveDesktopBackground,
});

export const layoutStorePort: LayoutStorePort = Object.freeze({
  confirmQuit: confirmQuitAfterSave,
  load: loadLayout,
  save: saveLayout,
});

export const launchpadIconPort: LaunchpadIconPort = Object.freeze({
  applyVariant: setLaunchpadIconVariant,
  isAvailable: isNativeBridgeAvailable,
});

export const localeRuntimePort: LocaleRuntimePort = createLocaleRuntimePort({
  applyNativePreference: applyAppLocalePreference,
  getNativeState: getAppLocaleState,
  // The development multi-select fixture is intentionally browser-runnable;
  // do not route its locale bootstrap through a Tauri bridge injected by a
  // host shell or DevTools session.
  isNative: () => isNativeBridgeAvailable() && !isBrowserFixture(),
});

export const nativeLifecyclePort: NativeLifecyclePort = Object.freeze({
  checkLaunchTargets,
  isAvailable: isNativeBridgeAvailable,
  launchApp,
  listen: listenNativeEvent,
  showLaunchError: showLaunchErrorMessage,
});

export const nativeStartupPort: NativeStartupPort = Object.freeze({
  complete: completeRendererStartup,
  getLaunchContext,
  isAvailable: isNativeBridgeAvailable,
});

export const autostartPort: AutostartPort = Object.freeze({
  getStatus: getAutostartStatus,
  isAvailable: isAutostartAvailable,
  setEnabled: setAutostartEnabled,
});
