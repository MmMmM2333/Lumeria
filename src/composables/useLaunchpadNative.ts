import { nextTick, ref, type Ref } from "vue";
import {
  DESKTOP_CLOSE_DURATION,
} from "../domain/launchpadConstants.js";
import { createBackgroundEffectPlan } from "../domain/backgroundEffectPlan.js";
import { resolveAppearancePreference } from "../domain/appearancePreference.js";
import { getKawaseDebugEffectPlanParams } from "../rendering/backgroundDebugPort.js";
import {
  backgroundAssetPort,
  layoutStorePort,
  nativeLifecyclePort,
  nativeStartupPort,
} from "../platform/launchpadPorts.js";
import type {
  BackgroundAssetPort,
  LayoutStorePort,
  NativeLifecyclePort,
  NativeStartupPort,
} from "../platform/launchpadPorts.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_ACRYLIC,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  backgroundSourceUsesLiveDesktop,
  clampBackgroundAcrylicBlurStrength,
  clampBackgroundBlurStrength,
  clampBackgroundDarkenStrength,
  clampBackgroundLiveDesktopOpacity,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
  normalizeBackgroundDarkenColor,
  normalizeBackgroundEffect,
  normalizeBackgroundImagePath,
} from "../application/launchpadSettingsConfig.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import {
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  readLiveDesktopDebugSettings,
} from "../diagnostics/liveDesktopDebugSettings.js";
import { runtimePerformanceMetrics } from "../diagnostics/runtimePerformanceMetrics.js";
import type {
  LaunchFailureReport,
  LaunchResult,
  LaunchTargetCheckResult,
  ScanAppsResult,
  ScanStats,
} from "../platform/launchpadContracts.js";
import type {
  LiveDesktopEffectPlan,
  LiveDesktopRuntimeConfig,
  LiveDesktopRuntimeStatus,
} from "../api/liveDesktopContract.js";
import type { CatalogScanWarning } from "../domain/applicationCatalog.js";
import type { CatalogRuntimeApp } from "../domain/launchpadData.js";
import type { ReadonlyLaunchpadApp } from "../domain/launchpadLayout.js";
import type {
  AcrylicParameters,
  LaunchTarget,
  LayoutDocument,
  LayoutSettings,
} from "../domain/layoutDocument.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import type { LocalizationText } from "../i18n/localization.js";
import type { LiveDesktopDebugSettings } from "../diagnostics/liveDesktopDebugSettings.js";
import type {
  LiveDesktopRuntimeOutcome,
  LiveDesktopRuntimeRequest,
  useLiveDesktopRuntime,
} from "./useLiveDesktopRuntime.js";
import type {
  MainWindowCloseOutcome,
  useMainWindowRuntime,
} from "./useMainWindowRuntime.js";
import type { LaunchpadLayoutFailureNoticeConfig } from "./useLaunchpadNotices.js";

type UnknownRecord = Record<string, unknown>;
type Unlisten = () => void;
type LiveDesktopRuntime = ReturnType<typeof useLiveDesktopRuntime>;
type MainWindowRuntime = ReturnType<typeof useMainWindowRuntime>;

type LaunchTargetCheckEntry = Readonly<{
  id: string;
  launchTarget: LaunchTarget;
  targetSignature: string;
}>;

type ReadonlyAcrylicParameters = Readonly<
  Omit<AcrylicParameters, "tintColor"> & {
    tintColor: readonly [number, number, number];
  }
>;

type NativeCatalogScanResult = Readonly<{
  apps: readonly CatalogRuntimeApp[];
  excludedApps: readonly CatalogRuntimeApp[];
  keywordExcludedApps: ScanAppsResult["keywordExcludedApps"];
  stats: ScanStats;
  warnings: readonly CatalogScanWarning[];
}>;

type LaunchpadNativeApps = Readonly<{
  applyLaunchTargetStatuses(
    results: readonly LaunchTargetCheckResult[],
    checks: readonly LaunchTargetCheckEntry[],
  ): unknown;
  clearLaunchTargetStatuses(): void;
  getLaunchTargetStatus(app: ReadonlyLaunchpadApp): "missing" | "ok" | "unknown" | null;
  launchTargetCheckSignature(checks?: readonly LaunchTargetCheckEntry[]): string;
  listLaunchTargets(): readonly LaunchTargetCheckEntry[];
  pruneLaunchTargetStatuses(): void;
  scanInitialCatalog(): Promise<NativeCatalogScanResult>;
  shouldCheckLaunchTargets(): boolean;
}>;

type LaunchpadDocumentCoordinator = Readonly<{
  capture(): LayoutDocument;
  createFromCatalog(apps: readonly CatalogRuntimeApp[]): unknown;
  restoreConfiguration(document: LayoutDocument): unknown;
  restorePages(document: LayoutDocument, apps: readonly CatalogRuntimeApp[]): unknown;
  signature(document: LayoutDocument): string;
}>;

type LiveDesktopSettingsConfig = Readonly<{
  backgroundAcrylicAppearance: LayoutSettings["backgroundAcrylicAppearance"];
  backgroundAcrylicBlurStrength: number;
  backgroundAcrylicDarkParams: ReadonlyAcrylicParameters;
  backgroundAcrylicLightParams: ReadonlyAcrylicParameters;
  backgroundBlurStrength: number;
  backgroundDarkenColor: string;
  backgroundDarkenStrength: number;
  backgroundLiveDesktopOpacity: number;
  backgroundSource: LayoutSettings["backgroundSource"];
  effect: LayoutSettings["backgroundEffect"];
  windowEffectAppearance: LayoutSettings["windowEffectAppearance"];
}>;

type WindowPresentation = Readonly<{
  appearance: LayoutSettings["windowEffectAppearance"];
  fullscreenOverscanEnabled: boolean;
  material: LayoutSettings["windowEffectMaterial"];
  mode: LayoutSettings["windowMode"];
}>;

type LaunchpadNativeSettings = Readonly<{
  captureLiveDesktopConfig(): LiveDesktopSettingsConfig;
  captureWindowPresentation(): WindowPresentation;
  getBackgroundSource(): LayoutSettings["backgroundSource"];
  reconcileWindowEffectsSupport(): void;
  refreshDesktopWallpaper(imagePath: string, imageUrl: string | null): boolean;
  registerCurrentShortcut(): Promise<Readonly<{ error?: unknown; ok: boolean }>>;
}>;

type LaunchpadNativeNotices = Readonly<{
  showLayoutLoadFailed(config: LaunchpadLayoutFailureNoticeConfig): void;
  showLayoutLoadRecovered(): void;
  showLayoutSaveFailed(config: LaunchpadLayoutFailureNoticeConfig): void;
  showLayoutSaveRecovered(): void;
}>;

export type LaunchpadNativeEventHandlers = Readonly<{
  closeDesktop(options: Readonly<{ clearSearch: boolean }>): void;
  closeSettingsPanel(options: Readonly<{ mode: "desktop" }>): void;
  focusDesktopSurface(): void;
  hasRenderedFolder(): boolean;
  isDesktopOpen(): boolean;
  isSettingsPanelOpen(): boolean;
  openDesktop(): unknown;
  openSettingsPanel(event?: unknown): unknown;
  reclampLayoutPageIndices(): void;
  schedulePageGridMetrics(): void;
  startFolderZoomFadeClose(options: Readonly<{ reason: "desktop" }>): boolean;
}>;

export type LaunchpadNativeOptions = Readonly<{
  apps: LaunchpadNativeApps;
  backgroundAssets?: BackgroundAssetPort | undefined;
  document: LaunchpadDocumentCoordinator;
  liveDesktopRuntime: LiveDesktopRuntime;
  localizationText: Pick<LocalizationText, "t">;
  mainWindowRuntime: MainWindowRuntime;
  notices: LaunchpadNativeNotices;
  platform?: NativeLifecyclePort | undefined;
  settings: LaunchpadNativeSettings;
  startup?: NativeStartupPort | undefined;
  store?: LayoutStorePort | undefined;
  systemAppearance: Readonly<Ref<AppearancePreference>>;
}>;

type NativeWindowActivation = Readonly<{
  displayChanged: boolean;
  openSequence: number;
}>;

const USE_MOCK_DATA_IN_NATIVE = false;
const WINDOWS_WALLPAPER_REFRESH_INTERVAL_MS = 5000;
// Pixi intentionally snaps monitor-resize layout for three frames. Keep the
// closed visual state through that window so the later open transition starts
// from its real initial values instead of being consumed behind DWM cloak.
const NATIVE_DISPLAY_CHANGE_SETTLE_FRAME_COUNT = 3;
const NATIVE_WINDOW_CLOSING_BLOCKED_EVENTS = [
  "pointerdown",
  "pointerup",
  "pointermove",
  "click",
  "dblclick",
  "contextmenu",
  "wheel",
  "keydown",
];
const NON_DESTRUCTIVE_CATALOG_WARNING_KINDS = new Set([
  "cycleSkipped",
  "iconExtractionFailed",
]);
const NATIVE_LAUNCH_FAILURE_COPY = Object.freeze({
  accessDenied: Object.freeze({
    reason: "errors.launch.reason.accessDenied",
    suggestion: "errors.launch.suggestion.checkPermission",
  }),
  appNotInstalled: Object.freeze({
    reason: "errors.launch.reason.packageMissing",
    suggestion: "errors.launch.suggestion.rescanOrRemove",
  }),
  brokenShortcut: Object.freeze({
    reason: "errors.launch.reason.shortcutInvalid",
    suggestion: "errors.launch.suggestion.replaceShortcut",
  }),
  layoutReadFailed: Object.freeze({
    reason: "errors.launch.reason.savedTargetInvalid",
    suggestion: "errors.launch.suggestion.rescanOrReadd",
  }),
  missingLaunchInfo: Object.freeze({
    reason: "errors.launch.reason.pathEmpty",
    suggestion: "errors.launch.suggestion.chooseTarget",
  }),
  noAssociation: Object.freeze({
    reason: "errors.launch.reason.noAssociation",
    suggestion: "errors.launch.suggestion.checkAssociation",
  }),
  targetNotFound: Object.freeze({
    reason: "errors.launch.reason.pathMissing",
    suggestion: "errors.launch.suggestion.editTarget",
  }),
  unsupportedTarget: Object.freeze({
    reason: "errors.launch.reason.unsupported",
    suggestion: "errors.launch.suggestion.supportedType",
  }),
  windowsLaunchFailed: Object.freeze({
    reason: "errors.launch.reason.windowsFailure",
    suggestion: "errors.launch.suggestion.checkExplorer",
  }),
});

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function collectSavedCatalogReferenceIds(savedDocument: LayoutDocument): Set<string> {
  const ids = new Set<string>();
  const stack = Array.isArray(savedDocument?.pages) ? savedDocument.pages.flat() : [];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (item.type === "catalogApp") {
      const id = String(item.id || "").trim();
      if (id) ids.add(id);
      continue;
    }
    if (item.type === "folder" && Array.isArray(item.childPages)) {
      stack.push(...item.childPages.flat());
    }
  }
  return ids;
}

function assertCatalogRefreshCanRestoreDocument(
  savedDocument: LayoutDocument,
  scanResult: NativeCatalogScanResult,
  localizationText: Pick<LocalizationText, "t">,
): void {
  const savedCatalogIds = collectSavedCatalogReferenceIds(savedDocument);
  if (!savedCatalogIds.size) return;
  const currentCatalogIds = new Set((scanResult?.apps || []).map((app) => String(app?.id || "")));
  const missingCount = Array.from(savedCatalogIds).filter((id) => !currentCatalogIds.has(id)).length;
  if (!missingCount) return;
  const warnings = Array.isArray(scanResult?.warnings) ? scanResult.warnings : [];
  const mayBeIncomplete = Boolean(scanResult?.stats?.limitReached)
    || warnings.some((warning) => !NON_DESTRUCTIVE_CATALOG_WARNING_KINDS.has(String(warning?.kind || "")));
  if (!mayBeIncomplete) return;
  throw new Error(localizationText.t("errors.catalog.incomplete", { count: missingCount }));
}

function isLiveDesktopDebugRuntimeConfigEnabled(): boolean {
  return Boolean(import.meta.env?.DEV && isLiveDesktopExperimentEnabled());
}

function resolveLiveDesktopDebugRuntimeSettings(): LiveDesktopDebugSettings {
  if (!isLiveDesktopDebugRuntimeConfigEnabled() || typeof window === "undefined") {
    return DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS;
  }
  const snapshot = readLiveDesktopDebugSettings();
  if (snapshot.issues.length) {
    console.error("Live Desktop runtime debug settings were only partially read", snapshot.issues);
  }
  return snapshot.values;
}

function resolveLiveDesktopAcrylicProfile(
  config: LiveDesktopSettingsConfig,
  systemAppearance: AppearancePreference,
): Exclude<AppearancePreference, "system"> {
  return resolveAppearancePreference(
    normalizeBackgroundAcrylicAppearance(config.backgroundAcrylicAppearance),
    systemAppearance,
    BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  );
}

function makeLiveDesktopEffectPlan(
  config: LiveDesktopSettingsConfig,
  acrylicParams: AcrylicParameters,
  blurStrength: number,
): LiveDesktopEffectPlan {
  const plan = createBackgroundEffectPlan({
    acrylicParams,
    blurStrength,
    dualKawaseParams: getKawaseDebugEffectPlanParams(),
    effect: config.effect,
    opacity: config.backgroundLiveDesktopOpacity,
  });
  return {
    effect: plan.effect,
    blur: {
      kernel: plan.blur.kernel === "gaussian" ? "gaussian" : "dualKawase",
      gaussianRadiusPx: plan.blur.gaussianRadiusPx,
      renderMaxWidth: plan.blur.renderMaxWidth,
      renderMaxHeight: plan.blur.renderMaxHeight,
      passCount: plan.blur.passCount,
      minSize: plan.blur.minSize,
      offsetScale: plan.blur.offsetScale,
      downOffsets: plan.blur.downOffsets,
      upOffsets: plan.blur.upOffsets,
      finalUpOffset: plan.blur.finalUpOffset,
    },
    acrylic: {
      ...plan.acrylic,
      tintColor: [
        plan.acrylic.tintColor[0],
        plan.acrylic.tintColor[1],
        plan.acrylic.tintColor[2],
      ],
    },
  };
}

function makeLiveDesktopRuntimeConfig(
  config: LiveDesktopSettingsConfig,
  systemAppearance: AppearancePreference,
): LiveDesktopRuntimeConfig {
  const debugSettings = resolveLiveDesktopDebugRuntimeSettings();
  const acrylicAppearance = normalizeBackgroundAcrylicAppearance(config.backgroundAcrylicAppearance);
  const acrylicProfile = resolveLiveDesktopAcrylicProfile(config, systemAppearance);
  const acrylicParams = normalizeBackgroundAcrylicParams(
    acrylicProfile === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? config.backgroundAcrylicLightParams
      : config.backgroundAcrylicDarkParams,
    acrylicProfile
  );
  const effect = normalizeBackgroundEffect(config.effect);
  const blurStrength = effect === BACKGROUND_EFFECT_ACRYLIC
    ? clampBackgroundAcrylicBlurStrength(config.backgroundAcrylicBlurStrength)
    : clampBackgroundBlurStrength(config.backgroundBlurStrength);
  return {
    effect,
    debugFrameSourceOverride: debugSettings.debugFrameSourceOverride,
    blurStrength,
    darkenStrength: clampBackgroundDarkenStrength(config.backgroundDarkenStrength),
    darkenColor: normalizeBackgroundDarkenColor(config.backgroundDarkenColor),
    acrylicAppearance,
    acrylicParams,
    effectPlan: makeLiveDesktopEffectPlan(config, acrylicParams, blurStrength),
    disableMouseRelay: debugSettings.disableMouseRelay,
    skipBlankFrames: debugSettings.skipBlankFrames,
    forceDwmFlush: debugSettings.forceDwmFlush,
    opacity: clampBackgroundLiveDesktopOpacity(config.backgroundLiveDesktopOpacity),
  };
}

export function useLaunchpadNative(options: LaunchpadNativeOptions) {
  const localizationText = options.localizationText;
  if (!localizationText || typeof localizationText.t !== "function") {
    throw new TypeError("useLaunchpadNative requires localizationText");
  }
  const systemAppearance = options.systemAppearance;
  if (!systemAppearance || !("value" in systemAppearance)) {
    throw new TypeError("useLaunchpadNative requires systemAppearance");
  }
  const document = options.document;
  if (
    typeof document?.capture !== "function"
    || typeof document?.createFromCatalog !== "function"
    || typeof document?.restoreConfiguration !== "function"
    || typeof document?.restorePages !== "function"
    || typeof document?.signature !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires a document coordinator");
  }
  const liveDesktopRuntime = options.liveDesktopRuntime;
  if (
    !liveDesktopRuntime?.support
    || !liveDesktopRuntime?.status
    || typeof liveDesktopRuntime.sync !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires liveDesktopRuntime");
  }
  const mainWindowRuntime = options.mainWindowRuntime;
  if (
    !mainWindowRuntime?.support
    || typeof mainWindowRuntime.acceptOpen !== "function"
    || typeof mainWindowRuntime.beginClose !== "function"
    || typeof mainWindowRuntime.hide !== "function"
    || typeof mainWindowRuntime.refreshSupport !== "function"
    || typeof mainWindowRuntime.reveal !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires mainWindowRuntime");
  }
  const settings = options.settings;
  if (
    typeof settings?.captureLiveDesktopConfig !== "function"
    || typeof settings?.captureWindowPresentation !== "function"
    || typeof settings?.getBackgroundSource !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires settings native integration");
  }
  const apps = options.apps;
  if (
    typeof apps?.listLaunchTargets !== "function"
    || typeof apps?.scanInitialCatalog !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires apps native integration");
  }
  const store = options.store || layoutStorePort;
  const platform = options.platform || nativeLifecyclePort;
  const startup = options.startup || nativeStartupPort;
  const backgroundAssets = options.backgroundAssets || backgroundAssetPort;
  const notices = options.notices;
  if (
    typeof store?.load !== "function"
    || typeof store?.save !== "function"
    || typeof store?.confirmQuit !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires a layout store port");
  }
  if (
    typeof platform?.isAvailable !== "function"
    || typeof platform?.listen !== "function"
    || typeof platform?.checkLaunchTargets !== "function"
    || typeof platform?.launchApp !== "function"
    || typeof platform?.showLaunchError !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires a native lifecycle port");
  }
  if (typeof startup?.isAvailable !== "function" || typeof startup?.complete !== "function") {
    throw new TypeError("useLaunchpadNative requires a native startup port");
  }
  if (typeof backgroundAssets?.getDesktopWallpaper !== "function" || typeof backgroundAssets?.toAssetUrl !== "function") {
    throw new TypeError("useLaunchpadNative requires a background asset port");
  }
  if (
    typeof notices?.showLayoutLoadFailed !== "function"
    || typeof notices?.showLayoutLoadRecovered !== "function"
    || typeof notices?.showLayoutSaveFailed !== "function"
    || typeof notices?.showLayoutSaveRecovered !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires layout notices");
  }
  let eventHandlers: LaunchpadNativeEventHandlers | null = null;
  let nativeLayoutReady = false;
  const isNativeLayoutReady = ref(!shouldUseNativeCatalog());
  const mainWindowDisplayRevision = ref(0);
  let nativeSaveTimer: number | null = null;
  let nativeWindowHideTimer: number | null = null;
  let pendingNativeWindowCloseTransition: Promise<MainWindowCloseOutcome> | null = null;
  let nativeWallpaperRefreshTimer: number | null = null;
  let nativeWindowOpenSequence: number | null = null;
  let nativeWindowHideSequence = 0;
  let isNativeWindowClosingInteractionBlocked = false;
  let nativeEventListenerGeneration = 0;
  let nativeSavePromise: Promise<boolean> | null = null;
  let launchCriticalDirtyRevision = 0;
  let launchTargetStatusCheckRequestId = 0;
  let launchTargetStatusCheckSignature: string | null = null;
  let lastSavedLayoutSignature = "";
  let nativeLoadFailureCount = 0;
  let hadNativeLoadFailure = false;
  let nativeSaveFailureCount = 0;
  let hadNativeSaveFailure = false;
  const launchCriticalDirtyAppIds = new Set<string>();
  let unlistenCloseDesktopEvent: Unlisten | null = null;
  let unlistenOpenDesktopEvent: Unlisten | null = null;
  let unlistenSettingsEvent: Unlisten | null = null;
  let unlistenToggleDesktopEvent: Unlisten | null = null;
  let unlistenQuitRequestedEvent: Unlisten | null = null;
  let quitRequestInProgress = false;

  function shouldUseNativeCatalog() {
    return platform.isAvailable() && !USE_MOCK_DATA_IN_NATIVE;
  }

  function registerEventHandlers(handlers: LaunchpadNativeEventHandlers): void {
    if (eventHandlers) throw new Error("useLaunchpadNative event handlers are already registered");
    const requiredHandlers: readonly (keyof LaunchpadNativeEventHandlers)[] = [
      "closeDesktop",
      "closeSettingsPanel",
      "focusDesktopSurface",
      "hasRenderedFolder",
      "isDesktopOpen",
      "isSettingsPanelOpen",
      "openDesktop",
      "openSettingsPanel",
      "reclampLayoutPageIndices",
      "schedulePageGridMetrics",
      "startFolderZoomFadeClose",
    ];
    for (const name of requiredHandlers) {
      if (typeof handlers?.[name] !== "function") {
        throw new TypeError(`useLaunchpadNative requires event handler ${name}`);
      }
    }
    eventHandlers = Object.freeze({ ...handlers });
  }

  function requireEventHandlers(): LaunchpadNativeEventHandlers {
    if (!eventHandlers) throw new Error("useLaunchpadNative event handlers are not registered");
    return eventHandlers;
  }

  function clearNativeSaveTimer() {
    if (nativeSaveTimer) window.clearTimeout(nativeSaveTimer);
    nativeSaveTimer = null;
  }

  function clearNativeWindowHideTimer() {
    nativeWindowHideSequence += 1;
    pendingNativeWindowCloseTransition = null;
    setNativeWindowClosingInteractionBlocked(false);
    if (nativeWindowHideTimer) window.clearTimeout(nativeWindowHideTimer);
    nativeWindowHideTimer = null;
  }

  function beginNativeWindowClose(): Promise<MainWindowCloseOutcome> {
    if (pendingNativeWindowCloseTransition) return pendingNativeWindowCloseTransition;
    setNativeWindowClosingInteractionBlocked(true);
    pendingNativeWindowCloseTransition = Promise.resolve(mainWindowRuntime.beginClose(
      mainWindowRuntime.transition.value?.generation ?? nativeWindowOpenSequence
    ));
    return pendingNativeWindowCloseTransition;
  }

  function suppressNativeWindowClosingInteraction(event: Event): void {
    if (!isNativeWindowClosingInteractionBlocked) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  function setNativeWindowClosingInteractionBlocked(blocked: boolean): void {
    const nextBlocked = Boolean(blocked);
    if (isNativeWindowClosingInteractionBlocked === nextBlocked) return;
    isNativeWindowClosingInteractionBlocked = nextBlocked;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    for (const eventName of NATIVE_WINDOW_CLOSING_BLOCKED_EVENTS) {
      const listenerOptions = eventName === "wheel" ? { capture: true, passive: false } : true;
      if (nextBlocked) {
        window.addEventListener(eventName, suppressNativeWindowClosingInteraction, listenerOptions);
      } else {
        window.removeEventListener(eventName, suppressNativeWindowClosingInteraction, listenerOptions);
      }
    }
  }

  function clearNativeWallpaperRefreshTimer() {
    if (nativeWallpaperRefreshTimer) window.clearTimeout(nativeWallpaperRefreshTimer);
    nativeWallpaperRefreshTimer = null;
  }

  function createCurrentLayoutSnapshot(): LayoutDocument {
    return document.capture();
  }

  function layoutSignature(layout: LayoutDocument): string {
    return document.signature(layout);
  }

  async function saveCurrentNativeLayout(): Promise<boolean> {
    const layout = createCurrentLayoutSnapshot();
    const signature = layoutSignature(layout);
    const saveDirtyRevision = launchCriticalDirtyRevision;
    if (signature === lastSavedLayoutSignature) {
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      return true;
    }

    try {
      await store.save(layout);
      lastSavedLayoutSignature = signature;
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      if (hadNativeSaveFailure) notices.showLayoutSaveRecovered();
      hadNativeSaveFailure = false;
      nativeSaveFailureCount = 0;
      return true;
    } catch (error) {
      hadNativeSaveFailure = true;
      nativeSaveFailureCount += 1;
      notices.showLayoutSaveFailed({
        error,
        retryCount: nativeSaveFailureCount,
        onRetry: retryNativeLayoutSave,
      });
      console.error("Failed to save Lumeria layout", error);
      return false;
    }
  }

  function runNativeLayoutSave(): Promise<boolean> {
    if (!nativeSavePromise) {
      nativeSavePromise = saveCurrentNativeLayout()
        .finally(() => {
          nativeSavePromise = null;
        });
    }
    return nativeSavePromise;
  }

  function saveLaunchCriticalLayout(): boolean | Promise<boolean> {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return true;
    clearNativeSaveTimer();
    return runNativeLayoutSave().then((saved) => {
      if (!saved || !launchCriticalDirtyAppIds.size) return saved;
      return saveLaunchCriticalLayout();
    });
  }

  function markLaunchCriticalLayoutDirty(appId: unknown): boolean | Promise<boolean> {
    const id = String(appId || "").trim();
    if (id) launchCriticalDirtyAppIds.add(id);
    launchCriticalDirtyRevision += 1;
    return saveLaunchCriticalLayout();
  }

  function prepareNativeLaunch(
    app: Pick<ReadonlyLaunchpadApp, "id" | "type" | "name">,
  ): boolean | Promise<boolean> {
    if (!shouldUseNativeCatalog()) return true;
    const appId = String(app?.id || "").trim();
    if (!appId || !launchCriticalDirtyAppIds.has(appId)) return true;
    return saveLaunchCriticalLayout();
  }

  function retryNativeLayoutSave(): Promise<boolean> {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return Promise.resolve(false);
    clearNativeSaveTimer();
    return runNativeLayoutSave();
  }

  function retryNativeLayoutLoad(): Promise<boolean> {
    if (!shouldUseNativeCatalog()) return Promise.resolve(false);
    return loadNativeLaunchpadData();
  }

  async function finishNativeLayoutLoad(): Promise<void> {
    nativeLayoutReady = true;
    isNativeLayoutReady.value = true;
    if (hadNativeLoadFailure) notices.showLayoutLoadRecovered();
    hadNativeLoadFailure = false;
    nativeLoadFailureCount = 0;
    requireEventHandlers().schedulePageGridMetrics();
    scheduleLaunchTargetStatusCheck();
    setNativeWindowMode();
    setNativeWindowEffectsEnabled(true);
    syncWindowsWallpaperRefreshTimer();
    await syncLiveDesktopBackgroundRuntime();
  }

  function scheduleNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return;
    clearNativeSaveTimer();
    nativeSaveTimer = window.setTimeout(async () => {
      nativeSaveTimer = null;
      await runNativeLayoutSave();
    }, 320);
  }

  async function flushNativeLayoutSave(): Promise<boolean> {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return true;
    clearNativeSaveTimer();
    let saved = await runNativeLayoutSave();
    if (!saved) return false;
    if (layoutSignature(createCurrentLayoutSnapshot()) === lastSavedLayoutSignature) return true;
    saved = await runNativeLayoutSave();
    return Boolean(saved);
  }

  async function refreshWindowsWallpaperBackground(): Promise<boolean> {
    if (settings.getBackgroundSource() !== BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return false;
    try {
      const selected = await backgroundAssets.getDesktopWallpaper();
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return false;
      const imageUrl = backgroundAssets.toAssetUrl(imagePath);
      return settings.refreshDesktopWallpaper(imagePath, imageUrl);
    } catch (error) {
      console.error("Failed to refresh Windows desktop wallpaper background", error);
      return false;
    }
  }

  function shouldPollWindowsWallpaperBackground(): boolean {
    return Boolean(
      platform.isAvailable()
      && requireEventHandlers().isDesktopOpen()
      && settings.getBackgroundSource() === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
    );
  }

  function syncWindowsWallpaperRefreshTimer() {
    clearNativeWallpaperRefreshTimer();
    if (!shouldPollWindowsWallpaperBackground()) return;
    nativeWallpaperRefreshTimer = window.setTimeout(async () => {
      nativeWallpaperRefreshTimer = null;
      const changed = await refreshWindowsWallpaperBackground();
      if (changed) scheduleNativeLayoutSave();
      syncWindowsWallpaperRefreshTimer();
    }, WINDOWS_WALLPAPER_REFRESH_INTERVAL_MS);
  }

  function makeLiveDesktopRuntimeRequest(): LiveDesktopRuntimeRequest {
    const config = settings.captureLiveDesktopConfig();
    return {
      enabled: backgroundSourceUsesLiveDesktop(config.backgroundSource),
      visible: requireEventHandlers().isDesktopOpen(),
      config: makeLiveDesktopRuntimeConfig(config, systemAppearance.value),
    };
  }

  function reportLiveDesktopRuntimeOutcome(
    action: string,
    outcome: LiveDesktopRuntimeOutcome,
  ): LiveDesktopRuntimeStatus {
    if (!outcome.ok) console.error(`Failed to ${action} live desktop background`, outcome.error);
    return outcome.status;
  }

  async function syncLiveDesktopBackgroundRuntime(): Promise<LiveDesktopRuntimeStatus> {
    const outcome = await liveDesktopRuntime.sync(makeLiveDesktopRuntimeRequest());
    return reportLiveDesktopRuntimeOutcome("sync", outcome);
  }

  async function restartLiveDesktopBackgroundRuntime(): Promise<LiveDesktopRuntimeStatus> {
    const outcome = await liveDesktopRuntime.restart(makeLiveDesktopRuntimeRequest());
    return reportLiveDesktopRuntimeOutcome("restart", outcome);
  }

  async function loadNativeLaunchpadData(): Promise<boolean> {
    if (!shouldUseNativeCatalog()) return true;
    isNativeLayoutReady.value = false;
    const finishStartupMeasurement = runtimePerformanceMetrics.begin("native.startup.total");

    try {
      await runtimePerformanceMetrics.measureAsync(
        "native.startup.window-effects-support",
        refreshNativeWindowEffectsSupport
      );
      await runtimePerformanceMetrics.measureAsync(
        "native.startup.live-desktop-support",
        refreshLiveDesktopBackgroundSupport
      );
      const savedLayout = await runtimePerformanceMetrics.measureAsync(
        "native.startup.layout-load",
        () => store.load()
      );
      if (!savedLayout) {
        const scanResult = await runtimePerformanceMetrics.measureAsync(
          "native.startup.catalog-scan",
          () => apps.scanInitialCatalog()
        );
        runtimePerformanceMetrics.measure(
          "native.startup.document-create",
          () => document.createFromCatalog(scanResult.apps)
        );
        requireEventHandlers().reclampLayoutPageIndices();
        await runtimePerformanceMetrics.measureAsync(
          "native.startup.finish-layout",
          finishNativeLayoutLoad
        );
        scheduleNativeLayoutSave();
        runtimePerformanceMetrics.markOnce("native.startup.first-ready");
        return true;
      }

      runtimePerformanceMetrics.measure(
        "native.startup.configuration-restore",
        () => document.restoreConfiguration(savedLayout)
      );
      const scanResult = await runtimePerformanceMetrics.measureAsync(
        "native.startup.catalog-scan",
        () => apps.scanInitialCatalog()
      );
      assertCatalogRefreshCanRestoreDocument(savedLayout, scanResult, localizationText);
      runtimePerformanceMetrics.measure(
        "native.startup.document-restore",
        () => document.restorePages(savedLayout, scanResult.apps)
      );
      const shortcutOutcome = await runtimePerformanceMetrics.measureAsync(
        "native.startup.shortcut-register",
        () => settings.registerCurrentShortcut()
      );
      if (!shortcutOutcome.ok) console.error("Failed to update Lumeria shortcut", shortcutOutcome.error);
      const refreshedWallpaperBackground = await runtimePerformanceMetrics.measureAsync(
        "native.startup.wallpaper-refresh",
        refreshWindowsWallpaperBackground
      );
      requireEventHandlers().reclampLayoutPageIndices();
      await runtimePerformanceMetrics.measureAsync(
        "native.startup.finish-layout",
        finishNativeLayoutLoad
      );
      if (refreshedWallpaperBackground) scheduleNativeLayoutSave();
      runtimePerformanceMetrics.markOnce("native.startup.first-ready");
      return true;
    } catch (error) {
      nativeLayoutReady = false;
      isNativeLayoutReady.value = false;
      hadNativeLoadFailure = true;
      nativeLoadFailureCount += 1;
      notices.showLayoutLoadFailed({
        error,
        retryCount: nativeLoadFailureCount,
        onRetry: retryNativeLayoutLoad,
      });
      console.error("Failed to load native Lumeria data", error);
      return false;
    } finally {
      finishStartupMeasurement();
    }
  }

  async function refreshNativeWindowEffectsSupport() {
    const outcome = await mainWindowRuntime.refreshSupport();
    applyNativeWindowEffectsSupport();
    if (!outcome.ok) console.error("Failed to load Lumeria window effects support", outcome.error);
  }

  async function refreshLiveDesktopBackgroundSupport() {
    const outcome = await liveDesktopRuntime.refreshSupport();
    if (!outcome.ok) console.error("Failed to load live desktop background support", outcome.error);
    return outcome.support;
  }

  async function refreshLiveDesktopRuntimeStatus() {
    const outcome = await liveDesktopRuntime.refreshStatus();
    if (!outcome.ok) {
      console.error("Failed to refresh live desktop background", outcome.error);
      throw outcome.error;
    }
    return outcome.status;
  }

  async function configureNativeLiveDesktopBackground() {
    const outcome = await liveDesktopRuntime.configure(
      makeLiveDesktopRuntimeConfig(settings.captureLiveDesktopConfig(), systemAppearance.value)
    );
    return reportLiveDesktopRuntimeOutcome("configure", outcome);
  }

  async function startNativeLiveDesktopBackground() {
    const outcome = await liveDesktopRuntime.start(
      makeLiveDesktopRuntimeConfig(settings.captureLiveDesktopConfig(), systemAppearance.value)
    );
    return reportLiveDesktopRuntimeOutcome("start", outcome);
  }

  async function stopNativeLiveDesktopBackground() {
    const outcome = await liveDesktopRuntime.stop();
    return reportLiveDesktopRuntimeOutcome("stop", outcome);
  }

  function applyNativeWindowEffectsSupport() {
    settings.reconcileWindowEffectsSupport();
  }

  function scheduleLaunchTargetStatusCheck() {
    if (!apps.shouldCheckLaunchTargets() || !platform.isAvailable()) {
      launchTargetStatusCheckRequestId += 1;
      launchTargetStatusCheckSignature = null;
      apps.clearLaunchTargetStatuses();
      return;
    }
    const checks = apps.listLaunchTargets();
    const signature = apps.launchTargetCheckSignature(checks);
    if (signature === launchTargetStatusCheckSignature) return;
    apps.pruneLaunchTargetStatuses();
    launchTargetStatusCheckSignature = signature;
    const requestId = (launchTargetStatusCheckRequestId += 1);
    window.setTimeout(() => checkCurrentLaunchTargets(requestId, signature, checks), 0);
  }

  async function checkCurrentLaunchTargets(
    requestId: number,
    scheduledSignature: string,
    checks: readonly LaunchTargetCheckEntry[],
  ): Promise<void> {
    if (requestId !== launchTargetStatusCheckRequestId) return;
    if (!apps.shouldCheckLaunchTargets() || !platform.isAvailable()) return;
    if (scheduledSignature !== apps.launchTargetCheckSignature()) {
      if (requestId === launchTargetStatusCheckRequestId) launchTargetStatusCheckSignature = null;
      scheduleLaunchTargetStatusCheck();
      return;
    }
    if (!checks.length) {
      if (requestId !== launchTargetStatusCheckRequestId) return;
      apps.clearLaunchTargetStatuses();
      return;
    }
    try {
      const results = await platform.checkLaunchTargets(
        checks.map((app) => ({ id: app.id, launchTarget: app.launchTarget }))
      );
      if (requestId !== launchTargetStatusCheckRequestId || !apps.shouldCheckLaunchTargets()) return;
      apps.applyLaunchTargetStatuses(results, checks);
      apps.pruneLaunchTargetStatuses();
    } catch (error) {
      if (requestId === launchTargetStatusCheckRequestId) launchTargetStatusCheckSignature = null;
      console.error("Failed to check Lumeria app paths", error);
    }
  }

  function getLaunchTargetStatus(app: ReadonlyLaunchpadApp) {
    return apps.getLaunchTargetStatus(app);
  }

  async function launchNativeAppIfAvailable(
    app: ReadonlyLaunchpadApp,
  ): Promise<LaunchResult> {
    if (!shouldUseNativeCatalog()) return;
    try {
      await platform.launchApp(app);
      return true;
    } catch (error) {
      if (isRecord(error) && error.kind === "cancelled") return { kind: "cancelled" };
      console.error(`Failed to launch ${app.name}`, error);
      return normalizeLaunchErrorReport(error, app);
    }
  }

  function normalizeLaunchErrorReport(error: unknown, app: ReadonlyLaunchpadApp): LaunchFailureReport {
    const errorRecord = isRecord(error) ? error : null;
    const requestedKind = String(errorRecord?.kind || "");
    const kind = Object.hasOwn(NATIVE_LAUNCH_FAILURE_COPY, requestedKind)
      ? requestedKind as keyof typeof NATIVE_LAUNCH_FAILURE_COPY
      : "windowsLaunchFailed";
    const copy = NATIVE_LAUNCH_FAILURE_COPY[kind];
    const fallbackName = localizationText.t("errors.launch.appFallback");
    const appName = String(errorRecord?.appName || app.name || fallbackName).trim() || fallbackName;
    const reason = localizationText.t(copy.reason);
    return {
      kind,
      title: localizationText.t("errors.launch.genericTitle"),
      message: localizationText.t("errors.launch.failureMessage", { appName, reason }),
      suggestion: localizationText.t(copy.suggestion),
      detail: String(errorRecord?.detail || errorRecord?.message || error || ""),
    };
  }

  async function showNativeLaunchError(error: LaunchFailureReport | null | undefined): Promise<boolean> {
    if (!shouldUseNativeCatalog() || !error) return false;
    try {
      await platform.showLaunchError(error);
      return true;
    } catch (showError) {
      console.error("Failed to show Lumeria launch error", showError);
      return false;
    }
  }

  function setNativeWindowEffectsEnabled(enabled: boolean) {
    if (!platform.isAvailable()) return;
    const openSequence = enabled ? null : nativeWindowOpenSequence;
    const { material, appearance } = settings.captureWindowPresentation();
    return mainWindowRuntime.setEffectsEnabled({ enabled, openSequence, material, appearance })
      .then((outcome) => {
        if (!outcome.ok) console.error("Failed to update Lumeria window effects", outcome.error);
        return outcome;
      });
  }

  function setNativeWindowMode(
    mode: LayoutSettings["windowMode"] = settings.captureWindowPresentation().mode,
  ) {
    if (!platform.isAvailable()) return;
    const { fullscreenOverscanEnabled } = settings.captureWindowPresentation();
    return mainWindowRuntime.setMode({
      mode,
      fullscreenOverscanEnabled,
    }).then((outcome) => {
      if (!outcome.ok) console.error("Failed to update Lumeria window mode", outcome.error);
      return outcome;
    });
  }

  function setNativeMainWindowShortcutCaptureActive(active: unknown) {
    if (!platform.isAvailable()) return;
    return mainWindowRuntime.setShortcutCaptureActive(active).then((outcome) => {
      if (!outcome.ok) console.error("Failed to update Lumeria shortcut capture state", outcome.error);
      return outcome;
    });
  }

  function setNativeWindowFrameEnabled(enabled: boolean) {
    if (!platform.isAvailable()) return;
    const openSequence = enabled ? null : nativeWindowOpenSequence;
    return mainWindowRuntime.setFrameEnabled(enabled, openSequence).then((outcome) => {
      if (!outcome.ok) console.error("Failed to update Lumeria native window frame", outcome.error);
      return outcome;
    });
  }

  function waitForNativeWindowRevealFrame(): Promise<void> {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
    return Promise.resolve();
  }

  async function revealNativeWindowAfterPaint(
    openSequence: number | null = nativeWindowOpenSequence,
    paintFrameCount = 2,
  ): Promise<boolean> {
    const revealSequence = Number(openSequence);
    if (!platform.isAvailable() || !Number.isFinite(revealSequence) || revealSequence <= 0) {
      return Promise.resolve(false);
    }
    const framesToWait = Math.max(0, Math.ceil(Number(paintFrameCount) || 0));
    try {
      await nextTick();
      for (let frame = 0; frame < framesToWait; frame += 1) {
        await waitForNativeWindowRevealFrame();
      }
      if (nativeWindowOpenSequence !== revealSequence) return false;
      const outcome = await mainWindowRuntime.reveal(revealSequence);
      if (!outcome.ok) throw outcome.error;
      return !outcome.stale && outcome.value === true;
    } catch (error) {
      console.error("Failed to reveal Lumeria window", error);
      return false;
    }
  }

  function completeRendererStartup(): Promise<void | null> {
    if (!startup.isAvailable()) return Promise.resolve(null);
    return startup.complete();
  }

  function registerNativeEventListeners(): Promise<unknown> {
    if (!platform.isAvailable()) return Promise.resolve();
    const handlers = requireEventHandlers();
    clearNativeEventListeners();
    const generation = nativeEventListenerGeneration;
    const keepUnlisten = (setter: (unlisten: Unlisten | null) => void) => (unlisten: Unlisten | null) => {
      if (generation !== nativeEventListenerGeneration) {
        unlisten?.();
        return;
      }
      setter(unlisten);
    };
    const listenRequired = (
      eventName: string,
      handler: (event: unknown) => unknown,
      setter: (unlisten: Unlisten | null) => void,
      failureMessage: string,
    ) => (
      platform.listen(eventName, handler)
        .then(keepUnlisten(setter))
        .catch((error) => {
          console.error(failureMessage, error);
          throw error;
        })
    );
    return Promise.all([
      listenRequired(
        "lumeria-open-desktop",
        openDesktopFromNativeShortcut,
        (unlisten) => { unlistenOpenDesktopEvent = unlisten; },
        "Failed to listen for native desktop open event",
      ),
      listenRequired(
        "lumeria-toggle-desktop",
        toggleDesktopFromNativeShortcut,
        (unlisten) => { unlistenToggleDesktopEvent = unlisten; },
        "Failed to listen for native desktop toggle event",
      ),
      listenRequired(
        "lumeria-close-desktop",
        closeDesktopFromNativeWindow,
        (unlisten) => { unlistenCloseDesktopEvent = unlisten; },
        "Failed to listen for native desktop close event",
      ),
      listenRequired(
        "lumeria-open-settings",
        handlers.openSettingsPanel,
        (unlisten) => { unlistenSettingsEvent = unlisten; },
        "Failed to listen for native settings event",
      ),
      listenRequired(
        "lumeria-quit-requested",
        quitFromNativeRequest,
        (unlisten) => { unlistenQuitRequestedEvent = unlisten; },
        "Failed to listen for native quit event",
      ),
    ]).catch((error) => {
      clearNativeEventListeners();
      throw error;
    });
  }

  function clearNativeEventListeners() {
    nativeEventListenerGeneration += 1;
    clearNativeWindowHideTimer();
    clearNativeWallpaperRefreshTimer();
    liveDesktopRuntime.dispose();
    unlistenOpenDesktopEvent?.();
    unlistenOpenDesktopEvent = null;
    unlistenToggleDesktopEvent?.();
    unlistenToggleDesktopEvent = null;
    unlistenCloseDesktopEvent?.();
    unlistenCloseDesktopEvent = null;
    unlistenSettingsEvent?.();
    unlistenSettingsEvent = null;
    unlistenQuitRequestedEvent?.();
    unlistenQuitRequestedEvent = null;
  }

  function readNativeWindowActivation(event: unknown): NativeWindowActivation | null {
    const eventRecord = isRecord(event) ? event : null;
    const payload = eventRecord?.payload;
    if (
      payload === null
      || !isRecord(payload)
      || typeof payload.displayChanged !== "boolean"
    ) {
      console.error("Invalid native main window activation payload", payload);
      return null;
    }
    const nextSequence = payload.openSequence;
    if (!Number.isSafeInteger(nextSequence) || (nextSequence as number) <= 0) {
      console.error("Invalid native main window activation sequence", payload.openSequence);
      return null;
    }
    if ((nextSequence as number) > 0) {
      nativeWindowOpenSequence = nextSequence as number;
    }
    return {
      displayChanged: payload.displayChanged,
      openSequence: nextSequence as number,
    };
  }

  async function openDesktopAfterNativeDisplayChange(activation: NativeWindowActivation): Promise<void> {
    const handlers = requireEventHandlers();
    const didReveal = await revealNativeWindowAfterPaint(
      activation.openSequence,
      NATIVE_DISPLAY_CHANGE_SETTLE_FRAME_COUNT
    );
    if (!didReveal || nativeWindowOpenSequence !== activation.openSequence) return;
    await waitForNativeWindowRevealFrame();
    if (nativeWindowOpenSequence !== activation.openSequence || handlers.isDesktopOpen()) return;
    handlers.openDesktop();
  }

  function openDesktopFromNativeShortcut(event: unknown): unknown {
    const handlers = requireEventHandlers();
    const activation = readNativeWindowActivation(event);
    if (!activation) return;
    if (!mainWindowRuntime.acceptOpen(activation.openSequence)) return;
    if (activation.displayChanged) {
      mainWindowDisplayRevision.value += 1;
    }
    setNativeWindowFrameEnabled(true);
    setNativeWindowEffectsEnabled(true);
    refreshWindowsWallpaperBackground().then((changed) => {
      if (changed) scheduleNativeLayoutSave();
    }).finally(syncWindowsWallpaperRefreshTimer);
    clearNativeWindowHideTimer();
    if (handlers.isDesktopOpen()) {
      handlers.focusDesktopSurface();
      if (activation.displayChanged) restartLiveDesktopBackgroundRuntime();
      else syncLiveDesktopBackgroundRuntime();
      return revealNativeWindowAfterPaint(
        activation.openSequence,
        activation.displayChanged ? NATIVE_DISPLAY_CHANGE_SETTLE_FRAME_COUNT : 2
      );
    }
    if (activation.displayChanged) restartLiveDesktopBackgroundRuntime();
    else syncLiveDesktopBackgroundRuntime();
    if (activation.displayChanged) {
      return openDesktopAfterNativeDisplayChange(activation);
    }
    handlers.openDesktop();
    return revealNativeWindowAfterPaint(activation.openSequence);
  }

  function hideNativeWindowAfterCloseAnimation() {
    clearNativeWallpaperRefreshTimer();
    if (nativeWindowHideTimer) window.clearTimeout(nativeWindowHideTimer);
    nativeWindowHideTimer = null;
    const hideSequence = ++nativeWindowHideSequence;
    const closeTransition = beginNativeWindowClose();
    syncLiveDesktopBackgroundRuntime();
    nativeWindowHideTimer = window.setTimeout(async () => {
      if (hideSequence !== nativeWindowHideSequence) return;
      nativeWindowHideTimer = null;
      await hideNativeWindow(hideSequence, closeTransition);
    }, DESKTOP_CLOSE_DURATION);
  }

  function closeSettingsPanelForDesktopClose() {
    const handlers = requireEventHandlers();
    if (!handlers.isSettingsPanelOpen()) return;
    handlers.closeSettingsPanel({ mode: "desktop" });
  }

  async function hideNativeWindow(
    expectedHideSequence: number | null = null,
    pendingCloseTransition: Promise<MainWindowCloseOutcome> | null = null,
  ): Promise<void> {
    if (!platform.isAvailable()) {
      setNativeWindowClosingInteractionBlocked(false);
      return;
    }
    const hideSequence = expectedHideSequence === null
      ? ++nativeWindowHideSequence
      : expectedHideSequence;
    if (hideSequence !== nativeWindowHideSequence) {
      setNativeWindowClosingInteractionBlocked(false);
      return;
    }
    if (nativeWindowHideTimer) window.clearTimeout(nativeWindowHideTimer);
    nativeWindowHideTimer = null;
    const closeTransition = pendingCloseTransition || beginNativeWindowClose();
    try {
      if (hideSequence !== nativeWindowHideSequence) {
        setNativeWindowClosingInteractionBlocked(false);
        return;
      }
      const closeOutcome = await closeTransition;
      if (!closeOutcome.ok) throw closeOutcome.error;
      if (!closeOutcome.accepted || closeOutcome.stale) {
        setNativeWindowClosingInteractionBlocked(false);
        return;
      }
      if (typeof closeOutcome.generation !== "number") {
        throw new TypeError("Accepted main-window close outcome requires a generation");
      }
      if (hideSequence !== nativeWindowHideSequence) {
        setNativeWindowClosingInteractionBlocked(false);
        return;
      }
      const outcome = await mainWindowRuntime.hide(closeOutcome.generation);
      if (!outcome.ok) throw outcome.error;
      setNativeWindowClosingInteractionBlocked(false);
    } catch (error) {
      console.error("Failed to hide Lumeria window", error);
      setNativeWindowClosingInteractionBlocked(false);
    } finally {
      if (pendingNativeWindowCloseTransition === closeTransition) {
        pendingNativeWindowCloseTransition = null;
      }
    }
  }

  function toggleDesktopFromNativeShortcut(event: unknown): unknown {
    if (!readNativeWindowActivation(event)) return;
    const handlers = requireEventHandlers();
    if (handlers.isDesktopOpen()) {
      closeSettingsPanelForDesktopClose();
      if (handlers.hasRenderedFolder() && handlers.startFolderZoomFadeClose({ reason: "desktop" })) {
        handlers.closeDesktop({ clearSearch: false });
        hideNativeWindowAfterCloseAnimation();
        return;
      }
      handlers.closeDesktop({ clearSearch: false });
      hideNativeWindowAfterCloseAnimation();
    } else {
      openDesktopFromNativeShortcut(event);
    }
  }

  function closeDesktopFromNativeWindow() {
    clearNativeWallpaperRefreshTimer();
    const handlers = requireEventHandlers();
    if (handlers.isDesktopOpen()) {
      closeSettingsPanelForDesktopClose();
      handlers.closeDesktop({ clearSearch: false });
    }
    hideNativeWindowAfterCloseAnimation();
  }

  async function quitFromNativeRequest() {
    if (quitRequestInProgress) return;
    quitRequestInProgress = true;
    let saved = false;
    try {
      saved = await flushNativeLayoutSave();
    } catch (error) {
      console.error("Failed to save Lumeria layout before quit", error);
    } finally {
      try {
        await store.confirmQuit(saved);
      } catch (error) {
        console.error("Failed to confirm Lumeria quit", error);
        quitRequestInProgress = false;
      }
    }
  }

  return {
    beginNativeWindowClose,
    clearNativeEventListeners,
    closeDesktopFromNativeWindow,
    completeRendererStartup,
    clearNativeSaveTimer,
    configureNativeLiveDesktopBackground,
    flushNativeLayoutSave,
    hideNativeWindow,
    hideNativeWindowAfterCloseAnimation,
    getLaunchTargetStatus,
    isNativeLayoutReady,
    mainWindowDisplayRevision,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    markLaunchCriticalLayoutDirty,
    prepareNativeLaunch,
    refreshLiveDesktopBackgroundSupport,
    refreshLiveDesktopRuntimeStatus,
    registerEventHandlers,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    scheduleLaunchTargetStatusCheck,
    setNativeMainWindowShortcutCaptureActive,
    setNativeWindowMode,
    setNativeWindowEffectsEnabled,
    setNativeWindowFrameEnabled,
    showNativeLaunchError,
    startNativeLiveDesktopBackground,
    stopNativeLiveDesktopBackground,
    restartLiveDesktopBackgroundRuntime,
    syncLiveDesktopBackgroundRuntime,
    syncWindowsWallpaperRefreshTimer,
    shouldUseNativeCatalog,
  };
}
