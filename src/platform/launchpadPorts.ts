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
import type { LayoutDocument, LayoutSettings } from "../domain/layoutDocument.js";
import { createLocaleRuntimePort } from "./localeRuntime.js";

type UnknownRecord = Readonly<Record<string, unknown>>;
type NativeEventHandler = (event: unknown) => void;

export type BackgroundAssetPort = Readonly<{
  getDesktopWallpaper(): Promise<unknown | null>;
  pickImage(): Promise<unknown | null>;
  toAssetUrl(filePath: string | null | undefined): string | null;
}>;

export type CatalogPort = Readonly<{
  cacheCustomIcon(dataUrl: string): Promise<unknown | null>;
  loadIconChoices(targetPath: string): Promise<readonly unknown[]>;
  pickLaunchFile(): Promise<unknown | null>;
  pickScanRoot(): Promise<unknown | null>;
  scan(roots?: readonly unknown[], filters?: UnknownRecord): Promise<unknown | null>;
  toAssetUrl(filePath: string | null | undefined): string | null;
}>;

export type MainWindowPort = Readonly<{
  beginClose(openSequence: number): Promise<unknown | null>;
  getEffectsSupport(): Promise<unknown | null>;
  hide(generation: number): Promise<unknown>;
  isAvailable(): boolean;
  registerShortcut(shortcut: string | null): Promise<unknown | null>;
  reveal(openSequence: number): Promise<unknown>;
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
  ): Promise<unknown>;
  setShortcutCaptureActive(active: boolean): Promise<boolean>;
}>;

export type DeveloperToolsPort = Readonly<{
  isAvailable(): boolean;
  openConsole(): Promise<boolean>;
}>;

export type LiveDesktopPort = Readonly<{
  configure(config: UnknownRecord): Promise<unknown | null>;
  getStatus(): Promise<unknown | null>;
  getSupport(): Promise<unknown | null>;
  isAvailable(): boolean;
  setVisible(visible: boolean): Promise<unknown | null>;
  start(): Promise<unknown | null>;
  stop(): Promise<unknown | null>;
}>;

export type LayoutStorePort = Readonly<{
  confirmQuit(saved: boolean): Promise<boolean>;
  load(): Promise<LayoutDocument | null>;
  save(layout: LayoutDocument): Promise<unknown | null>;
}>;

export type LaunchpadIconPort = Readonly<{
  applyVariant(variant: LayoutSettings["launchpadIconVariant"]): Promise<unknown | null>;
  isAvailable(): boolean;
}>;

export type LocaleRuntimePort = Readonly<{
  applyPreference(preference: string): Promise<unknown>;
  bootstrap(): Promise<unknown>;
}>;

export type NativeLifecyclePort = Readonly<{
  checkLaunchTargets(targets: readonly unknown[]): Promise<readonly unknown[]>;
  isAvailable(): boolean;
  launchApp(app: UnknownRecord): Promise<boolean>;
  listen(eventName: string, handler: NativeEventHandler): Promise<(() => void) | null>;
  showLaunchError(error: unknown): Promise<boolean>;
}>;

export type NativeStartupPort = Readonly<{
  complete(): Promise<unknown | null>;
  getLaunchContext(): Promise<UnknownRecord>;
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
