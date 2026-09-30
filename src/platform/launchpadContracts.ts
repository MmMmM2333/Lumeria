import type { CatalogScanWarning, ScannedCatalogApp } from "../domain/applicationCatalog.js";
import type { LaunchTarget, LayoutSettings } from "../domain/layoutDocument.js";
import type { LocaleState } from "../i18n/locale.js";

export type {
  LiveDesktopAcrylicEffectPlan,
  LiveDesktopAcrylicParams,
  LiveDesktopBackgroundSupport,
  LiveDesktopBlurEffectPlan,
  LiveDesktopEffectPlan,
  LiveDesktopPrerequisiteProbe,
  LiveDesktopRendererProbe,
  LiveDesktopRuntimeConfig,
  LiveDesktopRuntimeDiagnostics,
  LiveDesktopRuntimeStatus,
  LiveDesktopWindowDiagnostics,
  LiveDesktopWindowInfo,
  LiveDesktopWindowRect,
} from "../api/liveDesktopContract.js";

export type LaunchContext = Readonly<{ origin: "loginStartup" | "manual" }>;
export type NativeLocaleState = LocaleState;
export type ScanStats = Readonly<{
  metadataCacheHits?: number;
  metadataReads?: number;
  dirsVisited: number;
  entriesSeen: number;
  physicalAppsFound: number;
  startMenuOverlays: number;
  equivalentAppsMerged: number;
  unresolvedApps: number;
  keywordExcludedApps: number;
  excludedApps: number;
  appsFound: number;
  limitReached: boolean;
}>;
export type KeywordExcludedApp = Readonly<{
  app: ScannedCatalogApp;
  matchedKeyword: string;
}>;
export type ScanAppsResult = Readonly<{
  apps: readonly ScannedCatalogApp[];
  excludedApps: readonly ScannedCatalogApp[];
  keywordExcludedApps: readonly KeywordExcludedApp[];
  warnings: readonly CatalogScanWarning[];
  stats: ScanStats;
}>;
export type PickedLaunchFile = Readonly<{
  name: string;
  path: string;
  launchTarget: LaunchTarget;
  launchArgs: string;
  iconPath: string | null;
  iconDataUrl: string | null;
}>;
export type PickedBackgroundImage = Readonly<{ name: string; imagePath: string }>;
export type BackgroundLayoutContext = Readonly<{
  monitorPhysicalX: number;
  monitorPhysicalY: number;
  monitorPhysicalWidth: number;
  monitorPhysicalHeight: number;
  monitorScaleFactor: number;
  windowPhysicalX: number;
  windowPhysicalY: number;
}>;
export type AppIconChoice = Readonly<{ id: string; iconPath: string }>;
export type CachedCustomIconResult = Readonly<{ iconPath: string; iconDataUrl: string }>;
export type LaunchTargetCheckRequest = Readonly<{ id: string; launchTarget: LaunchTarget; fallbackPaths?: readonly string[] }>;
export type LaunchTargetCheckStatus = "ok" | "missing" | "unknown";
export type LaunchTargetDetails = Readonly<{ canElevate: boolean; requiresAdmin: boolean; adminRequirementKnown: boolean; fileLocation: string | null; locationIsFolder: boolean; shortcutLocation: string | null }>;
export type LaunchTargetCheckResult = Readonly<{ id: string; status: LaunchTargetCheckStatus } & Partial<LaunchTargetDetails>>;
export type LaunchableApp = Readonly<{ id: string; name?: string }>;
export type LaunchFailureReport = Readonly<{
  kind: string;
  title: string;
  message: string;
  suggestion: string;
  detail: string;
}>;
export type LaunchResult = true | Readonly<{ kind: "cancelled" }> | LaunchFailureReport | undefined;
export type MainWindowCloseTransition = Readonly<{ accepted: boolean; generation: number }>;
export type MainWindowEffectsSupport = Readonly<{
  platform: string;
  build: number | null;
  supportsAcrylic: boolean;
  supportsMica: boolean;
  supportsMicaAlt: boolean;
}>;
export type MainWindowEffectOptions = Readonly<{
  material?: LayoutSettings["windowEffectMaterial"];
  appearance?: LayoutSettings["windowEffectAppearance"];
}>;
export type MainWindowModeOptions = Readonly<{ fullscreenOverscanEnabled?: boolean }>;
