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
import type {
  AppIconChoice,
  CachedCustomIconResult,
  LaunchableApp,
  LaunchContext,
  LaunchFailureReport,
  LaunchTargetCheckRequest,
  LaunchTargetCheckResult,
  LiveDesktopBackgroundSupport,
  LiveDesktopRuntimeConfig,
  LiveDesktopRuntimeStatus,
  MainWindowCloseTransition,
  MainWindowEffectsSupport,
  PickedBackgroundImage,
  PickedLaunchFile,
  ScanAppsResult,
} from "../api/launchpadApi.js";
import type { CatalogScanFilters, CatalogScanRoot } from "../domain/applicationCatalog.js";
import type { LayoutDocument, LayoutSettings } from "../domain/layoutDocument.js";
import { createLocaleRuntimePort, type LocaleRuntimeOutcome } from "./localeRuntime.js";

type NativeEventHandler = (event: unknown) => void;

export type BackgroundAssetPort = Readonly<{
  getDesktopWallpaper(): Promise<PickedBackgroundImage | null>;
  pickImage(): Promise<PickedBackgroundImage | null>;
  toAssetUrl(filePath: string | null | undefined): string | null;
}>;

export type CatalogPort = Readonly<{
  cacheCustomIcon(dataUrl: string): Promise<CachedCustomIconResult | null>;
  loadIconChoices(targetPath: string): Promise<readonly AppIconChoice[]>;
  pickLaunchFile(): Promise<PickedLaunchFile | null>;
  pickScanRoot(): Promise<string | null>;
  scan(roots?: readonly CatalogScanRoot[], filters?: CatalogScanFilters): Promise<ScanAppsResult | null>;
  toAssetUrl(filePath: string | null | undefined): string | null;
}>;

export type MainWindowPort = Readonly<{
  beginClose(openSequence: number): Promise<MainWindowCloseTransition | null>;
  getEffectsSupport(): Promise<MainWindowEffectsSupport | null>;
  hide(generation: number): Promise<boolean>;
  isAvailable(): boolean;
  registerShortcut(shortcut: string | null): Promise<string | null>;
  reveal(openSequence: number): Promise<boolean>;
  setEffectsEnabled(
    enabled: boolean,
    openSequence?: number | null,
    options?: Readonly<{
      appearance?: LayoutSettings["windowEffectAppearance"];
      material?: LayoutSettings["windowEffectMaterial"];
    }>,
  ): Promise<boolean>;
  setFrameEnabled(enabled: boolean): Promise<boolean>;
  setMode(
    mode: LayoutSettings["windowMode"],
    options?: Readonly<{ fullscreenOverscanEnabled?: boolean }>,
  ): Promise<LayoutSettings["windowMode"] | null | false>;
  setShortcutCaptureActive(active: boolean): Promise<boolean>;
}>;

export type DeveloperToolsPort = Readonly<{
  isAvailable(): boolean;
  openConsole(): Promise<boolean>;
}>;

export type LiveDesktopPort = Readonly<{
  configure(config: LiveDesktopRuntimeConfig): Promise<LiveDesktopRuntimeStatus | null>;
  getStatus(): Promise<LiveDesktopRuntimeStatus | null>;
  getSupport(): Promise<LiveDesktopBackgroundSupport | null>;
  isAvailable(): boolean;
  setVisible(visible: boolean): Promise<LiveDesktopRuntimeStatus | null>;
  start(): Promise<LiveDesktopRuntimeStatus | null>;
  stop(): Promise<LiveDesktopRuntimeStatus | null>;
}>;

export type LayoutStorePort = Readonly<{
  confirmQuit(saved: boolean): Promise<boolean>;
  load(): Promise<LayoutDocument | null>;
  save(layout: LayoutDocument): Promise<void>;
}>;

export type LaunchpadIconPort = Readonly<{
  applyVariant(variant: LayoutSettings["launchpadIconVariant"]): Promise<LayoutSettings["launchpadIconVariant"] | null>;
  isAvailable(): boolean;
}>;

export type LocaleRuntimePort = Readonly<{
  applyPreference(preference: string): Promise<LocaleRuntimeOutcome>;
  bootstrap(): Promise<LocaleRuntimeOutcome>;
}>;

export type NativeLifecyclePort = Readonly<{
  checkLaunchTargets(targets: readonly LaunchTargetCheckRequest[]): Promise<readonly LaunchTargetCheckResult[]>;
  isAvailable(): boolean;
  launchApp(app: LaunchableApp): Promise<boolean>;
  listen(eventName: string, handler: NativeEventHandler): Promise<(() => void) | null>;
  showLaunchError(error: LaunchFailureReport): Promise<boolean>;
}>;

export type NativeStartupPort = Readonly<{
  complete(): Promise<void>;
  getLaunchContext(): Promise<LaunchContext>;
  isAvailable(): boolean;
}>;

export type AutostartPort = Readonly<{
  getStatus(): Promise<boolean>;
  isAvailable(): boolean;
  setEnabled(enabled: boolean): Promise<boolean>;
}>;

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
