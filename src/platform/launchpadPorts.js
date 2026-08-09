import {
  applyAppLocalePreference,
  cacheCustomIcon,
  checkLaunchTargets,
  confirmQuitAfterSave,
  configureLiveDesktopBackground,
  convertFilePathToAssetUrl,
  getDesktopWallpaperBackground,
  getAppLocaleState,
  getLiveDesktopBackgroundSupport,
  getLiveDesktopRuntimeStatus,
  getMainWindowEffectsSupport,
  hideMainWindow,
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
  showMainWindow,
  showLaunchErrorMessage,
  startLiveDesktopBackground,
  stopLiveDesktopBackground,
} from "../api/launchpadApi.js";
import { createLocaleRuntimePort } from "./localeRuntime.js";

function isBrowserFixture() {
  if (!import.meta.env?.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fixture") === "multi-select";
}

export const backgroundAssetPort = Object.freeze({
  getDesktopWallpaper: getDesktopWallpaperBackground,
  pickImage: pickBackgroundImage,
  toAssetUrl: convertFilePathToAssetUrl,
});

export const catalogPort = Object.freeze({
  cacheCustomIcon,
  loadIconChoices: loadAppIconChoices,
  pickLaunchFile,
  pickScanRoot: pickScanRootDirectory,
  scan: scanApps,
  toAssetUrl: convertFilePathToAssetUrl,
});

export const mainWindowPort = Object.freeze({
  getEffectsSupport: getMainWindowEffectsSupport,
  hide: hideMainWindow,
  isAvailable: isNativeBridgeAvailable,
  registerShortcut: setMainWindowShortcut,
  reveal: revealMainWindow,
  setEffectsEnabled: setMainWindowEffectsEnabled,
  setFrameEnabled: setMainWindowNativeFrameEnabled,
  setMode: setMainWindowMode,
  setShortcutCaptureActive: setMainWindowShortcutCaptureActive,
  show: showMainWindow,
});

export const developerToolsPort = Object.freeze({
  isAvailable: isNativeBridgeAvailable,
  openConsole: openDeveloperConsole,
});

export const liveDesktopPort = Object.freeze({
  configure: configureLiveDesktopBackground,
  getStatus: getLiveDesktopRuntimeStatus,
  getSupport: getLiveDesktopBackgroundSupport,
  isAvailable: isNativeBridgeAvailable,
  setVisible: setLiveDesktopBackgroundVisible,
  start: startLiveDesktopBackground,
  stop: stopLiveDesktopBackground,
});

export const layoutStorePort = Object.freeze({
  confirmQuit: confirmQuitAfterSave,
  load: loadLayout,
  save: saveLayout,
});

export const launchpadIconPort = Object.freeze({
  applyVariant: setLaunchpadIconVariant,
  isAvailable: isNativeBridgeAvailable,
});

export const localeRuntimePort = createLocaleRuntimePort({
  applyNativePreference: applyAppLocalePreference,
  getNativeState: getAppLocaleState,
  // The development multi-select fixture is intentionally browser-runnable;
  // do not route its locale bootstrap through a Tauri bridge injected by a
  // host shell or DevTools session.
  isNative: () => isNativeBridgeAvailable() && !isBrowserFixture(),
});

export const nativeLifecyclePort = Object.freeze({
  checkLaunchTargets,
  isAvailable: isNativeBridgeAvailable,
  launchApp,
  listen: listenNativeEvent,
  showLaunchError: showLaunchErrorMessage,
});
