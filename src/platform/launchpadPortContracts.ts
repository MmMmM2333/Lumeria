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
import type { LocaleRuntimeOutcome } from "./localeRuntime.js";

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
  setFrameEnabled(enabled: boolean, openSequence?: number | null): Promise<boolean>;
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

