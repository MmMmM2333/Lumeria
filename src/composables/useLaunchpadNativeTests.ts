import { readFileSync } from "node:fs";
import { deepStrictEqual } from "node:assert/strict";
import { ref, type DeepReadonly, type Ref } from "vue";
import { createLaunchpadDocumentCoordinator } from "../application/launchpadDocumentCoordinator.js";
import {
  convertFilePathToAssetUrl,
  setLaunchpadApiBridgeForTests,
} from "../api/launchpadApi.js";
import type {
  LaunchFailureReport,
  LaunchTargetCheckRequest,
  ScanStats,
} from "../api/launchpadApi.js";
import type { LiveDesktopBackgroundSupport, LiveDesktopRuntimeConfig, LiveDesktopRuntimeStatus } from "../api/liveDesktopContract.js";
import type { CatalogScanFilters, CatalogScanRoot, CatalogSource, ScannedCatalogApp } from "../domain/applicationCatalog.js";
import { assertLayoutDocument } from "../domain/layoutDocument.js";
import type { AcrylicParameters, LayoutDocument, LayoutItem, LayoutSettings } from "../domain/layoutDocument.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import type { LaunchpadApp, LaunchpadItem, LaunchpadPages } from "../domain/launchpadLayout.js";
import { DEFAULT_MAIN_WINDOW_SHORTCUT } from "../domain/mainWindowShortcut.js";
import {
  LAUNCHPAD_ICON_LIGHT,
  LAUNCHPAD_ICON_PASTEL_DARK,
} from "../domain/launchpadIconVariant.js";
import { setLiveDesktopExperimentEnabledForTests } from "../domain/experimentalFeatures.js";
import { createLocalization } from "../i18n/localization.js";
import { useLaunchpadLayout } from "./useLaunchpadLayout.js";
import { useLiveDesktopRuntime } from "./useLiveDesktopRuntime.js";
import { useMainWindowRuntime } from "./useMainWindowRuntime.js";
import { useLaunchpadApps } from "./useLaunchpadApps.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";
import type { LaunchpadNativeEventHandlers, LaunchpadNativeOptions } from "./useLaunchpadNative.js";
import type { LaunchpadLayoutFailureNoticeConfig } from "./useLaunchpadNotices.js";
import { useLaunchpadSettings } from "./useLaunchpadSettings.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_ACRYLIC,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_DARKEN_COLOR,
  DEFAULT_BACKGROUND_DARKEN_STRENGTH,
  DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY,
  DEFAULT_WINDOW_MODE,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_MODE_WINDOWED,
} from "./useLaunchpadSettingsConfig.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const layoutV2RoundTripFixture = assertLayoutDocument(JSON.parse(
  readFileSync(new URL("../domain/fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8"),
));

function canonicalizeLayoutSnapshot(value: LayoutDocument): LayoutDocument {
  const snapshot = structuredClone(value);
  const visit = (item: LayoutItem) => {
    if (item.type !== "folder") return;
    for (const page of item.childPages) {
      for (const child of page) visit(child);
    }
  };
  for (const page of snapshot.pages || []) {
    for (const item of page || []) visit(item);
  }
  return snapshot;
}
const localizationText = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;

function makeScanStats(overrides: Partial<ScanStats> = {}): ScanStats {
  return {
    dirsVisited: 0,
    entriesSeen: 0,
    physicalAppsFound: 0,
    startMenuOverlays: 0,
    equivalentAppsMerged: 0,
    unresolvedApps: 0,
    keywordExcludedApps: 0,
    excludedApps: 0,
    appsFound: 0,
    limitReached: false,
    ...overrides,
  };
}

const EMPTY_LIVE_DESKTOP_DIAGNOSTICS = Object.freeze({
  framesCopied: 0,
  frameTimeouts: 0,
  copyErrors: 0,
  commitErrors: 0,
  frameArrivedEvents: 0,
  frameArrivedDroppedSignals: 0,
  frameCopySamples: 0,
  frameCopyMicrosTotal: 0,
  lastFrameCopyMicros: 0,
  maxFrameCopyMicros: 0,
  frameCommitSamples: 0,
  frameCommitMicrosTotal: 0,
  lastFrameCommitMicros: 0,
  maxFrameCommitMicros: 0,
  configUpdates: 0,
  configErrors: 0,
  lastFrameWidth: 0,
  lastFrameHeight: 0,
  lastFrameFormat: 0,
  testPatternFrames: 0,
  pixelProbeSamples: 0,
  pixelProbeErrors: 0,
  blankFrameSkips: 0,
  shaderCopyFallbacks: 0,
  abandonedRendererWorkers: 0,
  reapedAbandonedRendererWorkers: 0,
  lastPixelProbeWidth: 0,
  lastPixelProbeHeight: 0,
  lastPixelProbeMinRgb: 0,
  lastPixelProbeMaxRgb: 0,
  lastPixelProbeAvgRgb: 0,
  lastPixelProbeMinAlpha: 0,
  lastPixelProbeMaxAlpha: 0,
  lastPixelProbeAvgAlpha: 0,
  lastShaderCopyError: "",
  lastAbandonedRendererReason: "",
  lastError: "",
  recentErrors: [],
});

const EMPTY_LIVE_DESKTOP_WINDOW_DIAGNOSTICS = Object.freeze({
  platform: "windows",
  available: true,
  reason: "available",
  detail: "test fixture",
  windowCount: 0,
  candidateCount: 0,
  windows: [],
  candidates: [],
});

function completeLiveDesktopSupportFixture(
  value: Partial<LiveDesktopBackgroundSupport> = {},
): LiveDesktopBackgroundSupport {
  return {
    platform: "windows",
    supportsLiveDesktopBackground: false,
    supportsLiveDesktopBackgroundEffects: false,
    reason: "nativeRendererUnavailable",
    detail: "test fixture",
    prerequisiteProbe: {
      supportsD3d11: true,
      adapterCount: 1,
      outputCount: 1,
      reason: "available",
      detail: "test fixture",
    },
    rendererProbe: {
      supportsDirectComposition: true,
      supportsWindowTarget: true,
      supportsRootVisual: true,
      supportsNativeRenderer: false,
      supportsNativeEffects: false,
      reason: "nativeRendererUnavailable",
      detail: "test fixture",
    },
    ...value,
  };
}

function completeLiveDesktopStatusFixture(
  value: Partial<LiveDesktopRuntimeStatus> = {},
): LiveDesktopRuntimeStatus {
  return {
    phase: value.phase || "stopped",
    active: value.active === true,
    generation: typeof value.generation === "number" && Number.isSafeInteger(value.generation)
      ? value.generation
      : 0,
    reason: typeof value.reason === "string" ? value.reason : value.phase || "stopped",
    detail: typeof value.detail === "string" ? value.detail : "",
    diagnostics: { ...EMPTY_LIVE_DESKTOP_DIAGNOSTICS, ...(value.diagnostics || {}) },
    windowDiagnostics: { ...EMPTY_LIVE_DESKTOP_WINDOW_DIAGNOSTICS, ...(value.windowDiagnostics || {}) },
  };
}

function completeCatalogSourceFixture(
  source: Partial<CatalogSource> | undefined,
  appId: string,
  index: number,
): CatalogSource {
  const key = source?.key || `test:${appId}:${index}`;
  return {
    key,
    type: source?.type || "customDirectory",
    state: source?.state || "primary",
    rootId: source?.rootId || "root-test",
    rootLabel: source?.rootLabel || "Test",
    relativePath: source?.relativePath || key,
    absolutePath: source?.absolutePath || `C:/Catalog/${key}`,
  };
}

function completeCatalogAppFixture(
  value: Partial<ScannedCatalogApp> | undefined,
  index: number,
): ScannedCatalogApp {
  const id = value?.id || `catalog-test-${index}`;
  return {
    ...value,
    id,
    type: "app",
    name: value?.name || "Application",
    launchTarget: value?.launchTarget || { kind: "executable", path: `C:/Catalog/${id}.exe` },
    trackingKey: value?.trackingKey || `launch:${id}`,
    identityStatus: value?.identityStatus || "exact",
    sources: (value?.sources?.length ? value.sources : [{}])
      .map((source, sourceIndex) => completeCatalogSourceFixture(source, id, sourceIndex)),
  };
}

type PartialScanResult = Readonly<{
  apps?: readonly Partial<ScannedCatalogApp>[];
  excludedApps?: readonly Partial<ScannedCatalogApp>[];
  keywordExcludedApps?: readonly Readonly<{ app: Partial<ScannedCatalogApp>; matchedKeyword?: string }>[];
  stats?: ScanStats;
  warnings?: readonly unknown[];
}>;

function completeScanResultFixture(value: PartialScanResult | null | undefined) {
  return {
    ...value,
    apps: (value?.apps || []).map(completeCatalogAppFixture),
    excludedApps: (value?.excludedApps || []).map(completeCatalogAppFixture),
    keywordExcludedApps: (value?.keywordExcludedApps || []).map((entry, index) => ({
      ...entry,
      app: completeCatalogAppFixture(entry.app, index),
      matchedKeyword: entry.matchedKeyword || "test",
    })),
    warnings: value?.warnings || [],
    stats: value?.stats || makeScanStats(),
  };
}

// Native load mocks below intentionally focus on one setting at a time. Keep
// those fixtures on the current document contract without adding a production
// migration path; the real Rust loader already supplies/validates these fields.
const TEST_LAYOUT_SETTINGS_DEFAULTS = structuredClone(layoutV2RoundTripFixture.settings);

function completeLayoutFixture(layout: unknown): unknown {
  if (!layout) return layout;
  if (!isRecord(layout)) throw new TypeError("test layout fixture must be an object");
  const settings = isRecord(layout.settings) ? layout.settings : {};
  return {
    ...layout,
    settings: {
      ...TEST_LAYOUT_SETTINGS_DEFAULTS,
      ...settings,
    },
  };
}

type NativeTestOverrides = Readonly<{
  hiddenAppIds?: readonly string[];
  isSettingsPanelOpen?: boolean;
  localizationText?: typeof localizationText;
  pages?: LaunchpadPages;
  renderedFolder?: Ref<unknown>;
  scanAppBlacklist?: readonly unknown[];
  scanKeywordAllowlist?: readonly string[];
  scanKeywordBlacklist?: readonly string[];
  scanRoots?: readonly unknown[];
  showLayoutLoadFailed?: (config: LaunchpadLayoutFailureNoticeConfig) => void;
  showLayoutLoadRecovered?: () => void;
  showLayoutSaveFailed?: (config: LaunchpadLayoutFailureNoticeConfig) => void;
  showLayoutSaveRecovered?: () => void;
  showMissingLaunchTargetBadge?: boolean;
  startFolderZoomFadeCloseResult?: boolean;
}>;

function makeOptions(overrides: NativeTestOverrides = {}) {
  const {
    hiddenAppIds: initialHiddenAppIds = [],
    isSettingsPanelOpen: initialIsSettingsPanelOpen,
    pages: initialPages,
    scanAppBlacklist: initialScanAppBlacklist = [],
    scanKeywordAllowlist: initialScanKeywordAllowlist = [],
    scanKeywordBlacklist: initialScanKeywordBlacklist = [],
    scanRoots: initialScanRoots = [{ id: "root", type: "customDirectory", label: "Root", path: "C:/Apps", enabled: true }],
    showMissingLaunchTargetBadge: initialShowMissingLaunchTargetBadge = true,
    localizationText: initialLocalizationText = localizationText,
    ...optionOverrides
  } = overrides;
  const calls = {
    closeDesktop: 0,
    closeSettingsPanel: [] as Array<Readonly<{ mode: "desktop" }>>,
    commitFolderPageIndex: [] as number[],
    commitPageIndex: [] as number[],
    commitSearchPageIndex: [] as number[],
    schedulePageGridMetrics: 0,
    startFolderZoomFadeClose: [] as Array<Readonly<{ reason: "desktop" }>>,
  };
  const layout = useLaunchpadLayout({
    getNewFolderName: () => localizationText.t("launchpad.newFolder"),
    seedEnabled: false,
  });
  layout.documentPersistence.restorePages(initialPages ?? [[]]);
  const pages = layout.presentation.pages as unknown as Readonly<Ref<LaunchpadPages>>;
  const systemAppearance = ref<AppearancePreference>(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
  const liveDesktopRuntime = useLiveDesktopRuntime();
  const mainWindowRuntime = useMainWindowRuntime({ systemAppearance });
  const settings = useLaunchpadSettings({
    layout,
    localizationText,
    liveDesktopSupport: liveDesktopRuntime.support,
    mainWindow: mainWindowRuntime,
  });
  settings.persistence.restore({
    backgroundAcrylicAppearance: BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
    backgroundImageLayout: BACKGROUND_IMAGE_LAYOUT_FILL,
    backgroundImageOpacity: 46,
  });
  const apps = useLaunchpadApps({
    appendAppsToPages: layout.operations.appendAppsToPages,
    localizationText,
    clonePages: layout.operations.clonePages,
    collectAppsFromPages: layout.operations.collectAppsFromPages,
    commitOpenFolder: () => {},
    commitPages: layout.commitPages,
    commitPagesAfterDeletion: layout.commitPages,
    findFolder: layout.operations.findFolder,
    isDragActive: () => false,
    makeId: layout.operations.makeId,
    openFolderId: ref(null),
    openScanKeywordSettings: () => {},
    pages,
    reclampPageIndices: () => {},
    removeEverywhere: layout.operations.removeEverywhere,
    renderedFolder: ref(null),
    schedulePageGridMetrics: () => {},
    focusedIcon: ref(null),
    shouldUseNativeCatalog: () => true,
  });
  const options = {
    apps,
    closeDesktop: (_eventOptions: Readonly<{ clearSearch: boolean }>) => {
      calls.closeDesktop += 1;
    },
    closeSettingsPanel: (closeOptions: Readonly<{ mode: "desktop" }>) => calls.closeSettingsPanel.push(closeOptions),
    commitFolderPageIndex: (value: number) => calls.commitFolderPageIndex.push(value),
    commitPageIndex: (value: number) => calls.commitPageIndex.push(value),
    commitSearchPageIndex: (value: number) => calls.commitSearchPageIndex.push(value),
    showLayoutLoadFailed: () => {},
    showLayoutLoadRecovered: () => {},
    showLayoutSaveFailed: () => {},
    showLayoutSaveRecovered: () => {},
    isDesktopOpen: ref(true),
    isSettingsPanelOpen: ref(initialIsSettingsPanelOpen ?? false),
    layout,
    localizationText: initialLocalizationText,
    mainWindowRuntime,
    liveDesktopRuntime,
    focusDesktopSurface: () => {},
    openDesktop: () => {},
    openSettingsPanel: (_event?: unknown) => {},
    renderedFolder: ref(null),
    reclampLayoutPageIndices: () => {
      calls.commitPageIndex.push(layout.presentation.pageIndex.value);
      calls.commitSearchPageIndex.push(layout.presentation.searchPageIndex.value);
      calls.commitFolderPageIndex.push(layout.presentation.folderPageIndex.value);
    },
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    settings,
    systemAppearance,
    startFolderZoomFadeClose: (options: Readonly<{ reason: "desktop" }>) => {
      calls.startFolderZoomFadeClose.push(options);
      return Boolean(overrides.startFolderZoomFadeCloseResult ?? false);
    },
    ...optionOverrides,
  };
  apps.persistence.restore({
    hiddenAppIds: initialHiddenAppIds,
    scanRoots: initialScanRoots,
    scanKeywordAllowlist: initialScanKeywordAllowlist,
    scanKeywordBlacklist: initialScanKeywordBlacklist,
    scanAppBlacklist: initialScanAppBlacklist,
    showMissingLaunchTargetBadge: initialShowMissingLaunchTargetBadge,
  });
  const restoreSettings = (fragment: Partial<LayoutSettings>) => {
    settings.persistence.restore({
      ...settings.persistence.capture(),
      ...fragment,
    });
  };
  const documentCoordinator = createLaunchpadDocumentCoordinator({
    apps: apps.persistence,
    layout: layout.documentPersistence,
    settings: settings.persistence,
    toAssetUrl: convertFilePathToAssetUrl,
  });
  const nativeLifecycleOptions: LaunchpadNativeOptions = {
    apps: apps.nativeIntegration,
    document: documentCoordinator,
    localizationText: options.localizationText,
    liveDesktopRuntime,
    mainWindowRuntime,
    notices: {
      showLayoutLoadFailed: options.showLayoutLoadFailed,
      showLayoutLoadRecovered: options.showLayoutLoadRecovered,
      showLayoutSaveFailed: options.showLayoutSaveFailed,
      showLayoutSaveRecovered: options.showLayoutSaveRecovered,
    },
    settings: settings.nativeIntegration,
    systemAppearance,
  };
  const nativeEventHandlers: LaunchpadNativeEventHandlers = {
    closeDesktop: (eventOptions) => options.closeDesktop(eventOptions),
    closeSettingsPanel: (eventOptions) => options.closeSettingsPanel(eventOptions),
    focusDesktopSurface: () => options.focusDesktopSurface(),
    hasRenderedFolder: () => Boolean(options.renderedFolder.value),
    isDesktopOpen: () => options.isDesktopOpen.value,
    isSettingsPanelOpen: () => options.isSettingsPanelOpen.value,
    openDesktop: () => options.openDesktop(),
    openSettingsPanel: (event) => options.openSettingsPanel(event),
    reclampLayoutPageIndices: () => options.reclampLayoutPageIndices(),
    schedulePageGridMetrics: () => options.schedulePageGridMetrics(),
    startFolderZoomFadeClose: (eventOptions) => options.startFolderZoomFadeClose(eventOptions),
  };
  return {
    calls,
    options: Object.assign(options, {
      nativeEventHandlers,
      nativeLifecycleOptions,
      restoreSettings,
    }),
  };
}

function createNative(options: Readonly<{
  nativeEventHandlers: LaunchpadNativeEventHandlers;
  nativeLifecycleOptions: LaunchpadNativeOptions;
}>) {
  const native = useLaunchpadNative(options.nativeLifecycleOptions);
  native.registerEventHandlers(options.nativeEventHandlers);
  return native;
}

type TestInvokeArgs = Readonly<{
  appearance: LayoutSettings["windowEffectAppearance"];
  config: LiveDesktopRuntimeConfig;
  enabled: boolean;
  filters: CatalogScanFilters;
  fullscreenOverscanEnabled: boolean;
  generation: number;
  layout: LayoutDocument;
  material: LayoutSettings["windowEffectMaterial"];
  mode: LayoutSettings["windowMode"];
  openSequence: number;
  report: LaunchFailureReport;
  request: Readonly<{ id: string }>;
  roots: readonly CatalogScanRoot[];
  saved: boolean;
  shortcut: string | null;
  targets: readonly LaunchTargetCheckRequest[];
  visible: boolean;
}>;

type TestNativeEventHandler = (event: unknown) => unknown;
type TestReadableStorage = Pick<Storage, "getItem">;
type PendingLaunchTargetCheck = Readonly<{
  args: TestInvokeArgs;
  resolve(value: unknown): void;
}>;
type PendingNativeListener = Readonly<{
  eventName: string;
  resolve(unlisten: () => void): void;
}>;
type TestBridgeOverrides = Readonly<{
  listen?: (eventName: string, handler: TestNativeEventHandler) => Promise<() => void>;
  passBeginMainWindowCloseCommand?: boolean;
  passHideMainWindowCommand?: boolean;
  passLiveDesktopBackgroundSupport?: boolean;
  passMainWindowShortcutCaptureCommand?: boolean;
  passMainWindowShortcutCommand?: boolean;
  passRevealMainWindowCommand?: boolean;
  passScanAppsCommand?: boolean;
  passWindowEffectsCommand?: boolean;
  passWindowEffectsSupport?: boolean;
  passWindowFrameCommand?: boolean;
  passWindowModeCommand?: boolean;
}>;

function withMockTauri<Result>(
  invoke: (command: string, args: TestInvokeArgs) => unknown | Promise<unknown>,
  run: (
    timers: Array<() => void | Promise<void>>,
    eventListeners: Map<string, Set<TestNativeEventHandler>>,
    storage: TestReadableStorage,
  ) => Result | Promise<Result>,
  bridgeOverrides: TestBridgeOverrides = {},
): Promise<Result> {
  const originalWindow = globalThis.window;
  const timers: Array<() => void | Promise<void>> = [];
  const eventListeners = new Map<string, Set<TestNativeEventHandler>>();
  const storage: TestReadableStorage = { getItem: () => null };
  const defaultEffectsSupport = {
    platform: "windows",
    build: 22621,
    supportsAcrylic: true,
    supportsMica: true,
    supportsMicaAlt: true,
  };
  setLaunchpadApiBridgeForTests({
    convertFileSrc: (path) => `http://asset.localhost/${path}`,
    invoke: async (command, args) => {
      const testArgs = (args || {}) as TestInvokeArgs;
      if (command === "get_main_window_effects_support" && !bridgeOverrides.passWindowEffectsSupport) {
        return defaultEffectsSupport;
      }
      if (command === "set_main_window_effects_enabled" && !bridgeOverrides.passWindowEffectsCommand) {
        return null;
      }
      if (command === "set_main_window_mode" && !bridgeOverrides.passWindowModeCommand) {
        return testArgs.mode;
      }
      if (command === "set_main_window_shortcut" && !bridgeOverrides.passMainWindowShortcutCommand) {
        return testArgs.shortcut;
      }
      if (command === "set_main_window_shortcut_capture_active" && !bridgeOverrides.passMainWindowShortcutCaptureCommand) {
        return null;
      }
      if (command === "set_main_window_native_frame_enabled" && !bridgeOverrides.passWindowFrameCommand) {
        return null;
      }
      if (command === "reveal_main_window" && !bridgeOverrides.passRevealMainWindowCommand) {
        return true;
      }
      if (command === "begin_main_window_close" && !bridgeOverrides.passBeginMainWindowCloseCommand) {
        return { accepted: true, generation: testArgs.openSequence + 1 };
      }
      if (command === "hide_main_window" && !bridgeOverrides.passHideMainWindowCommand) {
        return true;
      }
      if (command === "get_live_desktop_background_support" && !bridgeOverrides.passLiveDesktopBackgroundSupport) {
        return completeLiveDesktopSupportFixture();
      }
      if (command === "scan_apps" && !bridgeOverrides.passScanAppsCommand) {
        return { apps: [], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: makeScanStats() };
      }
      const result = invoke(command, testArgs);
      if (command === "load_layout") return Promise.resolve(result).then(completeLayoutFixture);
      if (command === "scan_apps") return Promise.resolve(result).then((value) => (
        completeScanResultFixture(value as PartialScanResult)
      ));
      if (command === "get_live_desktop_background_support") {
        return Promise.resolve(result).then((value) => (
          completeLiveDesktopSupportFixture(value as Partial<LiveDesktopBackgroundSupport>)
        ));
      }
      if ([
        "get_live_desktop_runtime_status",
        "configure_live_desktop_background",
        "start_live_desktop_background",
        "stop_live_desktop_background",
        "set_live_desktop_background_visible",
      ].includes(command)) {
        return Promise.resolve(result).then((value) => (
          completeLiveDesktopStatusFixture(value as Partial<LiveDesktopRuntimeStatus>)
        ));
      }
      return result;
    },
    listen: bridgeOverrides.listen || (async () => () => {}),
  });
  globalThis.window = {
    localStorage: storage,
    clearTimeout: (timer: unknown) => {
      if (!isTestTimer(timer)) throw new TypeError("test timer handle must be a callback");
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    addEventListener: (eventName: string, handler: TestNativeEventHandler) => {
      if (!eventListeners.has(eventName)) eventListeners.set(eventName, new Set<TestNativeEventHandler>());
      eventListeners.get(eventName)?.add(handler);
    },
    removeEventListener: (eventName: string, handler: TestNativeEventHandler) => {
      eventListeners.get(eventName)?.delete(handler);
    },
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return callback;
    },
  } as unknown as Window & typeof globalThis;

  return Promise.resolve()
    .then(() => run(timers, eventListeners, storage))
    .finally(() => {
      setLaunchpadApiBridgeForTests(null);
      if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else globalThis.window = originalWindow;
    });
}

function isTestTimer(value: unknown): value is (() => void | Promise<void>) {
  return typeof value === "function";
}

function requireEntry<Value>(values: readonly Value[], index: number, label: string): Value {
  const value = values[index];
  if (value === undefined) throw new Error(`missing ${label} at index ${index}`);
  return value;
}

function requireLast<Value>(values: readonly Value[], label: string): Value {
  return requireEntry(values, values.length - 1, label);
}

function readCollectionLength(values: readonly unknown[]): number {
  return values.length;
}

function readNumber(value: number): number {
  return value;
}

function readBoolean(value: boolean): boolean {
  return value;
}

function readRuntimePhase(
  status: Readonly<{ value: Readonly<Pick<LiveDesktopRuntimeStatus, "phase">> }>,
): LiveDesktopRuntimeStatus["phase"] {
  return status.value.phase;
}

function cloneAcrylicParameters(
  parameters: DeepReadonly<AcrylicParameters>,
): AcrylicParameters {
  return {
    ...parameters,
    tintColor: [
      parameters.tintColor[0],
      parameters.tintColor[1],
      parameters.tintColor[2],
    ],
  };
}

function takeTestTimer(
  timers: Array<() => void | Promise<void>>,
): () => void | Promise<void> {
  const timer = timers.shift();
  if (!timer) throw new Error("missing scheduled native test timer");
  return timer;
}

function requireNoticeRetry(config: LaunchpadLayoutFailureNoticeConfig): () => void {
  if (typeof config.onRetry !== "function") throw new Error("missing layout notice retry callback");
  return config.onRetry;
}

function requireLaunchpadApp(
  item: DeepReadonly<LaunchpadItem> | undefined,
  label: string,
): DeepReadonly<LaunchpadApp> {
  if (!item || item.type !== "app") throw new Error(`missing ${label}`);
  return item;
}

function requireEventHandler(
  handlers: ReadonlyMap<string, TestNativeEventHandler>,
  eventName: string,
): TestNativeEventHandler {
  const handler = handlers.get(eventName);
  if (!handler) throw new Error(`missing native test event handler: ${eventName}`);
  return handler;
}

async function flushMicrotasks(count = 1) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

async function withSuppressedConsoleError<Result>(run: () => Result | Promise<Result>): Promise<Result> {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = originalConsoleError;
  }
}

export async function runLaunchpadNativeTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad native test failed] ${message}`);
  };
  setLiveDesktopExperimentEnabledForTests(true);

  const assetConversionError = new Error("asset conversion failed");
  setLaunchpadApiBridgeForTests({
    convertFileSrc: () => {
      throw assetConversionError;
    },
  });
  try {
    let conversionFailure: unknown = null;
    try {
      convertFilePathToAssetUrl("C:/Icons/app.png");
    } catch (error) {
      conversionFailure = error;
    }
    assert(conversionFailure === assetConversionError, "asset URL conversion failures should remain explicit");
  } finally {
    setLaunchpadApiBridgeForTests(null);
  }

  const roundTripSaves: LayoutDocument[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") return structuredClone(layoutV2RoundTripFixture);
    if (command === "scan_apps") return { apps: [], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: makeScanStats() };
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      roundTripSaves.push(args.layout);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions();
    const native = createNative(options);
    let duplicateHandlerError: unknown = null;
    try {
      native.registerEventHandlers(options.nativeEventHandlers);
    } catch (error) {
      duplicateHandlerError = error;
    }
    assert(duplicateHandlerError instanceof Error, "native lifecycle event handlers should reject duplicate registration explicitly");

    await native.loadNativeLaunchpadData();
    native.scheduleNativeLayoutSave();
    await Promise.all(timers.splice(0).map((timer) => timer()));

    assert(roundTripSaves.length === 1, "a loaded layout should be persisted once when explicitly scheduled");
    const roundTripSave = requireEntry(roundTripSaves, 0, "round-trip save");
    const expectedRoundTrip = canonicalizeLayoutSnapshot(layoutV2RoundTripFixture);
    const expectedScanRoot = requireEntry(expectedRoundTrip.settings.scanRoots, 0, "expected scan root");
    const savedScanRoot = requireEntry(roundTripSave.settings.scanRoots, 0, "saved scan root");
    const savedLastScannedAt = savedScanRoot.lastScannedAt;
    if (typeof savedLastScannedAt !== "string") throw new Error("saved scan root is missing its scan timestamp");
    expectedScanRoot.lastScannedAt = savedLastScannedAt;
    assert(
      expectedScanRoot.lastScannedAt !== requireEntry(layoutV2RoundTripFixture.settings.scanRoots, 0, "fixture scan root").lastScannedAt,
      "loading a saved layout should refresh its scan timestamp"
    );
    deepStrictEqual(
      JSON.parse(JSON.stringify(roundTripSave)),
      expectedRoundTrip,
      "a complete version-2 layout should survive native load and save without losing persisted fields"
    );
  });

  {
    const savedCatalogLayout = structuredClone(layoutV2RoundTripFixture);
    savedCatalogLayout.pages = [[{ id: "catalog-refresh", type: "catalogApp" }]];
    savedCatalogLayout.settings.scanRoots = [
      {
        id: "saved-root",
        type: "customDirectory",
        label: "Saved Root",
        path: "C:/Saved Apps",
        enabled: true,
        removable: true,
      },
    ];
    savedCatalogLayout.settings.scanKeywordAllowlist = ["catalog-refresh"];
    savedCatalogLayout.settings.scanKeywordBlacklist = ["saved-keyword"];
    savedCatalogLayout.settings.scanAppBlacklist = [];
    let savedCatalogScanCount = 0;

    await withMockTauri(async (command, args) => {
      if (command === "load_layout") return structuredClone(savedCatalogLayout);
      if (command === "scan_apps") {
        savedCatalogScanCount += 1;
        assert(
          args.roots.length === 1 && args.roots[0]?.id === "saved-root",
          "saved catalog refresh should scan with roots restored from the saved document"
        );
        assert(
          (args.filters.keywordAllowlist ?? []).join(",") === "catalog-refresh",
          "saved catalog refresh should scan with keyword exceptions restored from the saved document"
        );
        assert(
          (args.filters.keywordBlacklist ?? []).join(",") === "saved-keyword",
          "saved catalog refresh should scan with filters restored from the saved document"
        );
        return {
          apps: [{
            id: "catalog-refresh",
            name: "Restored Catalog App",
            launchTarget: { kind: "shortcut", path: "C:/Saved Apps/Restored.lnk" },
            trackingKey: "launch:catalog-refresh",
            identityStatus: "exact",
            sources: [{ key: "saved", type: "customDirectory", state: "primary" }],
          }],
          excludedApps: [],
          keywordExcludedApps: [],
          warnings: [],
          stats: makeScanStats({ appsFound: 1 }),
        };
      }
      if (command === "check_launch_targets") return [];
      throw new Error(`Unexpected invoke: ${command}`);
    }, async () => {
      const { options } = makeOptions();
      const native = createNative(options);

      await native.loadNativeLaunchpadData();

      assert(readNumber(savedCatalogScanCount) === 1, "saved version-2 catalog references should trigger one catalog refresh");
      assert(
        options.layout.presentation.pages.value[0]?.[0]?.id === "catalog-refresh",
        "saved version-2 catalog references should survive a native reload"
      );
    }, { passScanAppsCommand: true });
  }

  {
    const incompleteCatalogLayout = structuredClone(layoutV2RoundTripFixture);
    incompleteCatalogLayout.pages = [[{ id: "catalog-unavailable", type: "catalogApp" }]];
    const loadFailures: LaunchpadLayoutFailureNoticeConfig[] = [];
    let incompleteScanAttempts = 0;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = () => {};
    console.warn = () => {};
    try {
      await withMockTauri(async (command) => {
        if (command === "load_layout") return structuredClone(incompleteCatalogLayout);
        if (command === "scan_apps") {
          incompleteScanAttempts += 1;
          return {
            apps: [],
            excludedApps: [],
            keywordExcludedApps: [],
            warnings: incompleteScanAttempts === 1
              ? [{
                rootId: "saved-root",
                rootLabel: "Saved Root",
                kind: "linkSkipped",
                message: "The saved root became a reparse point.",
              }]
              : incompleteScanAttempts === 2
                ? [{
                  rootId: "saved-root",
                  rootLabel: "Saved Root",
                  kind: "skippedEntry",
                  message: "One directory entry could not be inspected.",
                }]
                : [{
                rootId: "saved-root",
                rootLabel: "Saved Root",
                kind: "iconExtractionFailed",
                message: "An unrelated icon could not be cached.",
              }],
            stats: makeScanStats(),
          };
        }
        throw new Error(`Unexpected invoke: ${command}`);
      }, async () => {
        const { options } = makeOptions({
          pages: [[{
            id: "existing-runtime",
            type: "app",
            origin: "manual",
            name: "Existing Runtime App",
            launchTarget: { kind: "shortcut", path: "C:/Existing.lnk" },
          }]],
          showLayoutLoadFailed: (config) => loadFailures.push(config),
        });
        const native = createNative(options);

        await native.loadNativeLaunchpadData();

        assert(native.isNativeLayoutReady.value === false, "an incomplete catalog refresh should not mark the saved layout ready");
        assert(readCollectionLength(loadFailures) === 1, "an incomplete catalog refresh should surface a retryable load failure");
        const firstLoadFailure = requireEntry(loadFailures, 0, "first catalog load failure");
        assert(
          String(firstLoadFailure.error instanceof Error ? firstLoadFailure.error.message : firstLoadFailure.error ?? "").includes("已保存的 Catalog 引用"),
          "an incomplete catalog refresh should explain that saved catalog references were protected"
        );
        assert(
          options.layout.presentation.pages.value[0]?.[0]?.id === "existing-runtime",
          "an incomplete catalog refresh should not replace runtime pages with a partial result"
        );

        await requireNoticeRetry(firstLoadFailure)();
        assert(native.isNativeLayoutReady.value === false, "a skipped directory entry should keep the saved layout protected");
        assert(readCollectionLength(loadFailures) === 2, "each incomplete catalog retry should remain retryable");
        assert(
          options.layout.presentation.pages.value[0]?.[0]?.id === "existing-runtime",
          "an incomplete catalog retry should continue preserving the previous runtime pages"
        );

        await requireNoticeRetry(requireEntry(loadFailures, 1, "second catalog load failure"))();
        assert(Boolean(native.isNativeLayoutReady.value), "a non-destructive scan warning should allow a saved layout retry to finish");
        const completedRetryPage = requireEntry(options.layout.presentation.pages.value, 0, "completed catalog retry page");
        assert(
          options.layout.presentation.pages.value.length === 1 && completedRetryPage.length === 0,
          "a complete retry should remove a catalog reference that is genuinely absent"
        );
      }, { passScanAppsCommand: true });
    } finally {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    }
  }

  const initialSaveLayouts: LayoutDocument[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") return null;
    if (command === "scan_apps") {
      assert(args.roots.length === 1 && args.roots[0]?.id === "root", "initial native scan should use enabled scan roots");
      return { apps: [
        {
          id: "win-app-good",
          name: "Good",
          iconPath: "C:/Icons/good.png",
          iconDataUrl: "data:image/png;base64,legacy",
          launchTarget: { kind: "shortcut", path: "C:/Apps/Good.lnk" },
          trackingKey: "launch:good",
          identityStatus: "exact",
          sources: [{ key: "good", type: "startMenuUser", state: "primary" }],
        },
        {
          id: "win-app-blocked",
          name: "Blocked",
          launchTarget: { kind: "shortcut", path: "C:/Apps/Blocked.lnk" },
          trackingKey: "launch:blocked",
          identityStatus: "exact",
          sources: [{ key: "blocked", type: "startMenuUser", state: "primary" }],
        },
      ], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: makeScanStats({ appsFound: 2 }) };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      initialSaveLayouts.push(args.layout);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { calls, options } = makeOptions({
      pages: [[{ id: "mock", type: "app", name: "Mock" }]],
      scanAppBlacklist: [{ catalogId: "win-app-blocked", name: "Blocked" }],
    });
    const native = createNative(options);
    assert(native.isNativeLayoutReady.value === false, "native layout should not be ready before the initial native load");

    await native.loadNativeLaunchpadData();
    await Promise.all(timers.splice(0).map((timer) => timer()));

    assert(Boolean(native.isNativeLayoutReady.value), "native layout should be ready after the initial native load");
    const scannedPage = requireEntry(options.layout.presentation.pages.value, 0, "scanned app page");
    const scannedApp = requireLaunchpadApp(scannedPage[0], "scanned app");
    assert(scannedPage.map((app) => app.id).join(",") === "win-app-good", "missing native layout should replace mock pages with scanned apps");
    assert(scannedApp.iconUrl === "http://asset.localhost/C:/Icons/good.png", "initial native scan should expose the cached asset URL");
    assert(!("iconDataUrl" in scannedApp), "initial native scan should discard legacy catalog base64 data");
    assert(Boolean(requireEntry(options.apps.presentation.scanRoots.value, 0, "scanned root").lastScannedAt), "initial native scan should mark roots as scanned");
    assert(initialSaveLayouts.length === 1, "initial native scan should be persisted after load completes");
    const initialSave = requireEntry(initialSaveLayouts, 0, "initial native save");
    assert(initialSave.pages[0]?.[0]?.id === "win-app-good", "initial native save should include scanned apps");
    assert(initialSave.settings.backgroundSource === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native saves should include background source");
    assert(initialSave.settings.backgroundEffect === BACKGROUND_EFFECT_DIMMED, "native saves should include background effect");
    assert(initialSave.settings.backgroundBaseColor === DEFAULT_BACKGROUND_BASE_COLOR, "native saves should include background base color");
    assert(initialSave.settings.backgroundBaseOpacity === DEFAULT_BACKGROUND_BASE_OPACITY, "native saves should include background base opacity");
    assert(initialSave.settings.backgroundImageOpacity === 46, "native saves should include background image opacity");
    assert(initialSave.settings.backgroundLiveDesktopOpacity === DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY, "native saves should include live desktop opacity");
    assert(initialSave.settings.backgroundImageLayout === BACKGROUND_IMAGE_LAYOUT_FILL, "native saves should include background image layout");
    assert(initialSave.settings.windowMode === DEFAULT_WINDOW_MODE, "native saves should include window mode");
    assert(initialSave.settings.backgroundBlurStrength === DEFAULT_BACKGROUND_BLUR_STRENGTH, "native saves should include background blur strength");
    assert(initialSave.settings.backgroundAcrylicBlurStrength === DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH, "native saves should include acrylic blur strength");
    assert(initialSave.settings.backgroundDarkenColor === DEFAULT_BACKGROUND_DARKEN_COLOR, "native saves should include background darken color");
    assert(initialSave.settings.backgroundDarkenStrength === DEFAULT_BACKGROUND_DARKEN_STRENGTH, "native saves should include background darken strength");
    assert(initialSave.settings.backgroundAcrylicAppearance === BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM, "native saves should include acrylic appearance");
    assert(initialSave.settings.backgroundAcrylicDarkParams.brightness === 0.8, "native saves should include acrylic dark params");
    assert(initialSave.settings.backgroundAcrylicLightParams.brightness === 1, "native saves should include acrylic light params");
    assert(initialSave.settings.backgroundImagePath === null, "native saves should include an empty background image path");
    assert(initialSave.settings.mainWindowShortcut === DEFAULT_MAIN_WINDOW_SHORTCUT, "native saves should include the main window shortcut");
    assert(initialSave.settings.launchpadIconVariant === LAUNCHPAD_ICON_LIGHT, "native saves should include the default launchpad icon variant");
    assert(calls.commitPageIndex.join(",") === "0", "initial native load should reclamp desktop page");
    assert(calls.schedulePageGridMetrics === 1, "initial native load should refresh grid metrics");
  }, { passScanAppsCommand: true });

  let loadAttempts = 0;
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      loadAttempts += 1;
      if (loadAttempts === 1) throw new Error("layout locked");
      return {
        version: 2,
        pages: [[{ id: "loaded-app", type: "manualApp", name: "Loaded", launchTarget: { kind: "shortcut", path: "Loaded.lnk" } }]],
        settings: { textless: true },
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const originalConsoleError = console.error;
      const loadFailures: LaunchpadLayoutFailureNoticeConfig[] = [];
    let loadRecoveredCount = 0;
    console.error = () => {};
    try {
      const { options } = makeOptions({
        showLayoutLoadFailed: (config) => loadFailures.push(config),
        showLayoutLoadRecovered: () => {
          loadRecoveredCount += 1;
        },
      });
    const native = createNative(options);

      await native.loadNativeLaunchpadData();
      assert(native.isNativeLayoutReady.value === false, "failed native layout loads should keep native layout readiness false");
      assert(readCollectionLength(loadFailures) === 1, "failed native loads should surface a persistent notice");
      const loadFailure = requireEntry(loadFailures, 0, "native layout load failure");
      assert(typeof loadFailure.onRetry === "function", "failed native loads should expose retry action");

      native.scheduleNativeLayoutSave();
      assert(readCollectionLength(timers) === 0, "native saves should not be scheduled while the layout is not ready");

      await requireNoticeRetry(loadFailure)();
      assert(Boolean(native.isNativeLayoutReady.value), "successful layout retry should mark the native layout ready");
      assert(Number(loadAttempts) === 2, "layout load retry should attempt to load again");
      assert(Number(loadRecoveredCount) === 1, "successful layout retry should surface a recovered notice");
      assert(options.layout.presentation.pages.value[0]?.[0]?.id === "loaded-app", "successful layout retry should apply the loaded layout");
      assert(options.settings.presentation.isTextlessMode.value === true, "successful layout retry should apply textless mode");
      assert(options.settings.draft.isTextlessMode.value === true, "successful layout retry should sync the textless draft");
    } finally {
      console.error = originalConsoleError;
    }
  });

  const effectsCommands: TestInvokeArgs[] = [];
  const windowModeCommands: TestInvokeArgs[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 22621,
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: true,
      };
    }
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "effects-app", type: "manualApp", name: "Effects", launchTarget: { kind: "shortcut", path: "Effects.lnk" } }]],
        settings: {
          windowEffectMaterial: WINDOW_EFFECT_MATERIAL_MICA_ALT,
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
          windowMode: WINDOW_MODE_WINDOWED,
          fullscreenOverscanEnabled: false,
          showCustomTitlebar: false,
          mainWindowShortcut: "control+alt+KeyL",
          launchpadIconVariant: LAUNCHPAD_ICON_PASTEL_DARK,
          backgroundBaseColor: "#aabbcc",
          backgroundBaseOpacity: 73,
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_DIMMED,
          backgroundImageOpacity: 64,
          backgroundLiveDesktopOpacity: 73,
          backgroundImageLayout: BACKGROUND_IMAGE_LAYOUT_CENTER,
          backgroundBlurStrength: 82,
          backgroundAcrylicBlurStrength: 83,
          backgroundDarkenColor: "#445566",
          backgroundDarkenStrength: 63,
          backgroundAcrylicAppearance: BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
          backgroundAcrylicDarkParams: {
            ...layoutV2RoundTripFixture.settings.backgroundAcrylicDarkParams,
            brightness: 0.7,
          },
          backgroundAcrylicLightParams: {
            ...layoutV2RoundTripFixture.settings.backgroundAcrylicLightParams,
            brightness: 1.2,
          },
          backgroundImagePath: "C:/Images/wallpaper.webp",
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") {
      effectsCommands.push(args);
      return null;
    }
    if (command === "set_main_window_mode") {
      windowModeCommands.push(args);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.mainWindowRuntime.support.value.supportsMica === true && options.mainWindowRuntime.support.value.supportsMicaAlt === true, "native load should apply window effect support");
    assert(options.settings.presentation.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT, "native load should apply saved window effect material");
    assert(options.settings.presentation.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "native load should apply saved window effect appearance");
    assert(options.settings.presentation.windowMode.value === WINDOW_MODE_WINDOWED, "native load should apply saved window mode");
    assert(options.settings.draft.windowMode.value === WINDOW_MODE_WINDOWED, "native load should sync window mode draft");
    assert(options.settings.presentation.fullscreenOverscanEnabled.value === false, "native load should apply disabled fullscreen overscan");
    assert(options.settings.draft.fullscreenOverscanEnabled.value === false, "native load should sync the fullscreen overscan draft");
    assert(options.settings.presentation.showCustomTitlebar.value === false, "native load should apply saved custom titlebar visibility");
    assert(options.settings.draft.showCustomTitlebar.value === false, "native load should sync custom titlebar visibility draft");
    assert(options.settings.presentation.mainWindowShortcut.value === "control+alt+KeyL", "native load should apply saved main window shortcut");
    assert(options.settings.draft.mainWindowShortcut.value === "control+alt+KeyL", "native load should sync main window shortcut draft");
    assert(options.settings.presentation.launchpadIconVariant.value === LAUNCHPAD_ICON_PASTEL_DARK, "native load should apply the saved launchpad icon variant");
    assert(options.settings.draft.launchpadIconVariant.value === LAUNCHPAD_ICON_PASTEL_DARK, "native load should sync the launchpad icon draft");
    assert(options.settings.presentation.backgroundBaseColor.value === "#aabbcc", "native load should apply saved background base color");
    assert(options.settings.presentation.backgroundBaseOpacity.value === 73, "native load should apply saved background base opacity");
    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should apply saved background source");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should apply saved background effect");
    assert(options.settings.presentation.backgroundImageOpacity.value === 64, "native load should apply saved background opacity");
    assert(options.settings.presentation.backgroundLiveDesktopOpacity.value === 73, "native load should apply saved live desktop opacity");
    assert(options.settings.presentation.backgroundImageLayout.value === BACKGROUND_IMAGE_LAYOUT_CENTER, "native load should apply saved background image layout");
    assert(options.settings.presentation.backgroundBlurStrength.value === 82, "native load should apply saved background blur strength");
    assert(options.settings.presentation.backgroundAcrylicBlurStrength.value === 83, "native load should apply saved acrylic blur strength");
    assert(options.settings.presentation.backgroundDarkenColor.value === "#445566", "native load should apply saved background darken color");
    assert(options.settings.presentation.backgroundDarkenStrength.value === 63, "native load should apply saved background darken strength");
    assert(options.settings.presentation.backgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT, "native load should apply saved acrylic appearance");
    assert(options.settings.presentation.backgroundAcrylicDarkParams.value.brightness === 0.7, "native load should apply saved acrylic dark params");
    assert(options.settings.presentation.backgroundAcrylicLightParams.value.brightness === 1.2, "native load should apply saved acrylic light params");
    assert(options.settings.presentation.backgroundImagePath.value === "C:/Images/wallpaper.webp", "native load should apply saved background image path");
    assert(options.settings.presentation.backgroundImageUrl.value === "http://asset.localhost/C:/Images/wallpaper.webp", "native load should derive a background image asset url");
    assert(options.settings.draft.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should sync background source draft");
    assert(options.settings.draft.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should sync background effect draft");
    assert(options.settings.draft.backgroundBaseColor.value === "#aabbcc", "native load should sync background base color draft");
    assert(options.settings.draft.backgroundBaseOpacity.value === 73, "native load should sync background base opacity draft");
    assert(options.settings.draft.backgroundImageOpacity.value === 64, "native load should sync background opacity draft");
    assert(options.settings.draft.backgroundLiveDesktopOpacity.value === 73, "native load should sync live desktop opacity draft");
    assert(options.settings.draft.backgroundImageLayout.value === BACKGROUND_IMAGE_LAYOUT_CENTER, "native load should sync background image layout draft");
    assert(options.settings.draft.backgroundBlurStrength.value === 82, "native load should sync background blur strength draft");
    assert(options.settings.draft.backgroundAcrylicBlurStrength.value === 83, "native load should sync acrylic blur strength draft");
    assert(options.settings.draft.backgroundDarkenColor.value === "#445566", "native load should sync background darken color draft");
    assert(options.settings.draft.backgroundDarkenStrength.value === 63, "native load should sync background darken strength draft");
    assert(options.settings.draft.backgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT, "native load should sync acrylic appearance draft");
    assert(options.settings.draft.backgroundAcrylicDarkParams.value.brightness === 0.7, "native load should sync acrylic dark params draft");
    assert(options.settings.draft.backgroundAcrylicLightParams.value.brightness === 1.2, "native load should sync acrylic light params draft");
    assert(options.settings.draft.backgroundImagePath.value === "C:/Images/wallpaper.webp", "native load should sync background image path draft");
    assert(options.settings.draft.backgroundImageUrl.value === "http://asset.localhost/C:/Images/wallpaper.webp", "native load should sync background image url draft");
    assert(effectsCommands.length === 1, "native load should refresh window effects once");
    const effectCommand = requireEntry(effectsCommands, 0, "window effect command");
    assert(effectCommand.enabled === true, "window effect refresh should enable effects");
    assert(effectCommand.material === WINDOW_EFFECT_MATERIAL_MICA_ALT, "window effect refresh should pass the selected material");
    assert(effectCommand.appearance === WINDOW_EFFECT_APPEARANCE_LIGHT, "window effect refresh should pass the selected appearance");
    assert(windowModeCommands.length === 1, "native load should refresh window mode once");
    const windowModeCommand = requireEntry(windowModeCommands, 0, "window mode command");
    assert(windowModeCommand.mode === WINDOW_MODE_WINDOWED, "window mode refresh should pass the selected mode");
    assert(windowModeCommand.fullscreenOverscanEnabled === false, "window mode refresh should pass the fullscreen overscan preference");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
    passWindowModeCommand: true,
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "acrylic-app", type: "manualApp", name: "Acrylic", launchTarget: { kind: "shortcut", path: "Acrylic.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_ACRYLIC,
          backgroundImagePath: "C:/Images/acrylic.webp",
        },
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should apply custom image source for acrylic");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC, "native load should preserve acrylic background effect");
    assert(options.settings.draft.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC, "native load should sync acrylic draft effect");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "blur-app", type: "manualApp", name: "Blur", launchTarget: { kind: "shortcut", path: "Blur.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_BLUR,
          backgroundImagePath: "C:/Images/blur.webp",
        },
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should apply custom image source for blur");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_BLUR, "native load should preserve blur background effect");
    assert(options.settings.draft.backgroundEffect.value === BACKGROUND_EFFECT_BLUR, "native load should sync blur draft effect");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_ACRYLIC,
          backgroundImagePath: null,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "configure_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 0,
        reason: "stopped",
        detail: "configured",
      };
    }
    if (command === "start_live_desktop_background") {
      return {
        phase: "running",
        active: true,
        generation: 1,
        reason: "running",
        detail: "running",
      };
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native load should fall back when acrylic has no image path");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should reset acrylic without an image path");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_BLUR,
          backgroundImagePath: null,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native load should fall back when blur has no image path");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should reset blur without an image path");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "live-app", type: "manualApp", name: "Live", launchTarget: { kind: "shortcut", path: "Live.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
          backgroundEffect: BACKGROUND_EFFECT_DIMMED,
          backgroundImagePath: "C:/Images/ignored.webp",
        },
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native load should fall back when live desktop backgrounds are unsupported");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should reset unsupported live desktop backgrounds to dimmed");
    assert(options.settings.presentation.backgroundImagePath.value === null, "native load should not keep image paths for unsupported live desktop backgrounds");
  });

  setLiveDesktopExperimentEnabledForTests(false);
  const disabledLiveDesktopCommands: string[] = [];
  await withMockTauri(async (command) => {
    disabledLiveDesktopCommands.push(command);
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "disabled-live-app", type: "manualApp", name: "Disabled Live", launchTarget: { kind: "shortcut", path: "Disabled Live.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
          backgroundEffect: BACKGROUND_EFFECT_BLUR,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);
    await native.syncLiveDesktopBackgroundRuntime();
    await native.refreshLiveDesktopRuntimeStatus();
    await native.configureNativeLiveDesktopBackground();
    await native.startNativeLiveDesktopBackground();
    await native.stopNativeLiveDesktopBackground();
    await native.restartLiveDesktopBackgroundRuntime();

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "disabled live desktop experiment should fall back from saved live desktop layouts");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "disabled live desktop experiment should reset saved live desktop effects");
    assert(options.liveDesktopRuntime.support.value.reason === "experimentDisabled", "disabled live desktop experiment should expose disabled support state");
    assert(options.liveDesktopRuntime.status.value.reason === "experimentDisabled", "disabled live desktop experiment should expose disabled runtime state");
  }, {
    passLiveDesktopBackgroundSupport: true,
  });
  assert(
    disabledLiveDesktopCommands.filter((command) => command.includes("live_desktop")).length === 0,
    "disabled live desktop experiment should not call native live desktop commands"
  );
  setLiveDesktopExperimentEnabledForTests(true);

  await withMockTauri(async (command) => {
    if (command === "get_live_desktop_background_support") {
      return {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: true,
        reason: "available",
      };
    }
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "live-acrylic-app", type: "manualApp", name: "Live Acrylic", launchTarget: { kind: "shortcut", path: "Live Acrylic.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
          backgroundEffect: BACKGROUND_EFFECT_ACRYLIC,
          backgroundImagePath: "C:/Images/ignored.webp",
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "configure_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 0,
        reason: "stopped",
        detail: "configured",
      };
    }
    if (command === "start_live_desktop_background") {
      return {
        phase: "running",
        active: true,
        generation: 1,
        reason: "running",
        detail: "running",
      };
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP, "native load should keep supported live desktop backgrounds");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC, "native load should preserve live desktop acrylic when effects are supported");
    assert(options.settings.presentation.backgroundImagePath.value === null, "native load should not keep image paths for live desktop backgrounds");
    assert(options.settings.draft.backgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP, "native load should sync live desktop background draft");
    assert(options.settings.draft.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC, "native load should sync live desktop acrylic draft");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "running", "native load should start the live desktop runtime for saved live desktop backgrounds");
  }, {
    passLiveDesktopBackgroundSupport: true,
  });

  await withMockTauri(async (command) => {
    if (command === "get_live_desktop_background_support") {
      return {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: false,
        reason: "effectsUnavailable",
      };
    }
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "live-blur-app", type: "manualApp", name: "Live Blur", launchTarget: { kind: "shortcut", path: "Live Blur.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
          backgroundEffect: BACKGROUND_EFFECT_BLUR,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "configure_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 0,
        reason: "stopped",
        detail: "configured",
      };
    }
    if (command === "start_live_desktop_background") {
      return {
        phase: "running",
        active: true,
        generation: 1,
        reason: "running",
        detail: "running",
      };
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP, "native load should keep live desktop backgrounds when base support is available");
    assert(options.settings.presentation.backgroundEffect.value === BACKGROUND_EFFECT_BLUR, "native load should preserve live desktop blur when native effects are unavailable");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "running", "native load should start live desktop runtime without native effect support");
  }, {
    passLiveDesktopBackgroundSupport: true,
  });

  const liveDesktopRuntimeCommands: string[] = [];
  const liveDesktopRuntimeConfigs: LiveDesktopRuntimeConfig[] = [];
  await withMockTauri(async (command, args) => {
    liveDesktopRuntimeCommands.push(command);
    if (command === "get_live_desktop_runtime_status") {
      return {
        phase: "stopped",
        active: false,
        generation: 0,
        reason: "stopped",
        detail: "stopped",
      };
    }
    if (command === "configure_live_desktop_background") {
      liveDesktopRuntimeConfigs.push(args.config);
      return {
        phase: "stopped",
        active: false,
        generation: 0,
        reason: "stopped",
        detail: "stopped",
      };
    }
    if (command === "start_live_desktop_background") {
      return {
        phase: "failed",
        active: false,
        generation: 1,
        reason: "nativeRendererNotImplemented",
        detail: "renderer unavailable",
      };
    }
    if (command === "stop_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 2,
        reason: "stopped",
        detail: "stopped",
      };
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (_timers, _eventListeners, storage) => {
    const { options } = makeOptions();
    options.restoreSettings({
      backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
      backgroundImagePath: "C:/Images/live-config.png",
      backgroundEffect: BACKGROUND_EFFECT_ACRYLIC,
      backgroundLiveDesktopOpacity: 37,
      backgroundBlurStrength: 72,
      backgroundAcrylicBlurStrength: 84,
      backgroundDarkenColor: "#334455",
      backgroundDarkenStrength: 41,
      backgroundAcrylicAppearance: BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
      backgroundAcrylicLightParams: {
        ...cloneAcrylicParameters(options.settings.presentation.backgroundAcrylicLightParams.value),
        brightness: 1.2,
        tintColor: [0.1, 0.2, 0.3],
      },
    });
    const native = createNative(options);

    assert(liveDesktopRuntimeCommands.length === 0, "live desktop runtime commands should not run until explicitly requested");

    await native.refreshLiveDesktopRuntimeStatus();
    assert(liveDesktopRuntimeCommands.join(",") === "get_live_desktop_runtime_status", "runtime status should be fetched only on explicit refresh");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "stopped", "runtime status refresh should apply stopped status");

    storage.getItem = () => null;
    await native.startNativeLiveDesktopBackground();
    assert(liveDesktopRuntimeCommands.join(",") === "get_live_desktop_runtime_status,configure_live_desktop_background,start_live_desktop_background", "runtime start should configure native effects before the native start command");
    assert(liveDesktopRuntimeConfigs.length === 1, "runtime start should send one live desktop config");
    const initialRuntimeConfig = requireEntry(liveDesktopRuntimeConfigs, 0, "initial live desktop runtime config");
    assert(!("frameSource" in initialRuntimeConfig), "runtime config should not include a regular frame source field");
    assert(initialRuntimeConfig.debugFrameSourceOverride === null, "runtime config should keep debug frame source override empty by default");
    assert(!("diagnosticMode" in initialRuntimeConfig), "runtime config should not include the old diagnostic mode field");
    assert(initialRuntimeConfig.disableMouseRelay === true, "runtime config should disable mouse relay by default");
    assert(initialRuntimeConfig.skipBlankFrames === false, "runtime config should keep blank frame skipping disabled by default");
    assert(initialRuntimeConfig.forceDwmFlush === false, "runtime config should keep DWM flush disabled by default");
    assert(initialRuntimeConfig.opacity === 37, "runtime config should include live desktop opacity");
    assert(initialRuntimeConfig.effect === BACKGROUND_EFFECT_ACRYLIC, "runtime config should include the selected effect");
    assert(initialRuntimeConfig.blurStrength === 84, "runtime config should include acrylic blur strength");
    assert(initialRuntimeConfig.darkenColor === "#334455", "runtime config should include darken color");
    assert(initialRuntimeConfig.darkenStrength === 41, "runtime config should include darken strength");
    assert(initialRuntimeConfig.acrylicAppearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT, "runtime config should include acrylic appearance");
    assert(initialRuntimeConfig.acrylicParams.brightness === 1.2, "runtime config should include acrylic params");
    assert(initialRuntimeConfig.acrylicParams.tintColor[1] === 0.2, "runtime config should include acrylic tint color");
    const initialEffectPlan = initialRuntimeConfig.effectPlan;
    assert(initialEffectPlan !== null, "runtime config should include the shared effect plan");
    assert(initialEffectPlan.effect === BACKGROUND_EFFECT_ACRYLIC, "runtime config should preserve the effect in the shared plan");
    assert(initialEffectPlan.acrylic.brightness === 1.2, "runtime effect plan should include normalized acrylic params");
    assert(initialEffectPlan.acrylic.alpha === 0.37, "runtime effect plan should carry acrylic composite alpha");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "failed", "runtime start should apply returned failure state");
    assert(options.liveDesktopRuntime.status.value.reason === "nativeRendererNotImplemented", "runtime start should preserve native failure reason");

    await native.stopNativeLiveDesktopBackground();
    assert(liveDesktopRuntimeCommands.join(",") === "get_live_desktop_runtime_status,configure_live_desktop_background,start_live_desktop_background,stop_live_desktop_background", "runtime stop should call the native stop command");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "stopped", "runtime stop should apply stopped status");
    assert(options.liveDesktopRuntime.status.value.generation === 2, "runtime stop should normalize generation values");

    storage.getItem = (key) => {
      if (key === "lumeriaLiveDesktopDebugFrameSourceOverride") return "testPattern";
      if (key === "lumeriaLiveDesktopDisableMouseRelay") return "true";
      if (key === "lumeriaLiveDesktopSkipBlankFrames") return "true";
      if (key === "lumeriaLiveDesktopForceDwmFlush") return "true";
      return null;
    };
    liveDesktopRuntimeCommands.length = 0;
    await native.configureNativeLiveDesktopBackground();
    assert(liveDesktopRuntimeCommands.join(",") === "configure_live_desktop_background", "runtime configure should send only the native config command");
    const nonDevRuntimeConfig = requireLast(liveDesktopRuntimeConfigs, "non-DEV live desktop runtime config");
    assert(!("frameSource" in nonDevRuntimeConfig), "runtime config should not include the regular frame source field");
    assert(nonDevRuntimeConfig.debugFrameSourceOverride === null, "runtime config should ignore debug test pattern storage outside DEV");
    assert(nonDevRuntimeConfig.disableMouseRelay === true, "runtime config should keep mouse relay disabled outside DEV");
    assert(nonDevRuntimeConfig.skipBlankFrames === false, "runtime config should ignore blank frame skip storage outside DEV");
    assert(nonDevRuntimeConfig.forceDwmFlush === false, "runtime config should ignore DWM flush storage outside DEV");

    options.systemAppearance.value = BACKGROUND_ACRYLIC_APPEARANCE_DARK;
    options.restoreSettings({
      backgroundAcrylicAppearance: BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
      backgroundAcrylicDarkParams: {
        ...cloneAcrylicParameters(options.settings.presentation.backgroundAcrylicDarkParams.value),
        brightness: 0.66,
      },
      windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
    });
    await native.configureNativeLiveDesktopBackground();
    const darkAcrylicRuntimeConfig = requireLast(liveDesktopRuntimeConfigs, "dark acrylic live desktop runtime config");
    assert(
      darkAcrylicRuntimeConfig.acrylicParams.brightness === 0.66,
      "system acrylic should use the current system appearance instead of the window material preference",
    );

    storage.getItem = (key) => {
      if (key === "lumeriaLiveDesktopDisableMouseRelay") return "false";
      return null;
    };
    await native.configureNativeLiveDesktopBackground();
    assert(requireLast(liveDesktopRuntimeConfigs, "restored live desktop runtime config").disableMouseRelay === true, "runtime config should ignore mouse relay storage outside DEV");
  });

  const runtimeRefreshError = new Error("native status channel closed");
  await withMockTauri(async (command) => {
    if (command === "get_live_desktop_runtime_status") throw runtimeRefreshError;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions();
    const native = createNative(options);
    let refreshFailure: unknown = null;
    try {
      await withSuppressedConsoleError(() => native.refreshLiveDesktopRuntimeStatus());
    } catch (error) {
      refreshFailure = error;
    }
    assert(refreshFailure === runtimeRefreshError, "runtime status refresh failures should reject the caller");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "failed", "runtime status refresh failures should remain visible in runtime state");
    assert(options.liveDesktopRuntime.status.value.reason === "statusRefreshFailed", "runtime status refresh failures should use a stable reason");
    assert(options.liveDesktopRuntime.status.value.detail === runtimeRefreshError.message, "runtime status refresh failures should preserve technical detail");
  });

  const liveDesktopSyncCommands: string[] = [];
  const liveDesktopSyncConfigs: LiveDesktopRuntimeConfig[] = [];
  const liveDesktopSyncVisibility: boolean[] = [];
  let liveDesktopSyncOptions: ReturnType<typeof makeOptions>["options"] | undefined;
  const requireLiveDesktopSyncOptions = () => {
    if (!liveDesktopSyncOptions) throw new Error("live desktop sync options were not initialized");
    return liveDesktopSyncOptions;
  };
  await withMockTauri(async (command, args) => {
    liveDesktopSyncCommands.push(command);
    if (command === "get_live_desktop_background_support") {
      return {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: false,
        reason: "available",
      };
    }
    if (command === "configure_live_desktop_background") {
      liveDesktopSyncConfigs.push(args.config);
      const runtime = requireLiveDesktopSyncOptions().liveDesktopRuntime;
      return {
        phase: runtime.status.value.phase,
        active: runtime.status.value.active,
        generation: runtime.status.value.generation,
        reason: "configured",
        detail: "configured",
      };
    }
    if (command === "start_live_desktop_background") {
      return {
        phase: "running",
        active: true,
        generation: 1,
        reason: "running",
        detail: "running",
      };
    }
    if (command === "set_live_desktop_background_visible") {
      liveDesktopSyncVisibility.push(args.visible);
      const runtime = requireLiveDesktopSyncOptions().liveDesktopRuntime;
      return {
        phase: runtime.status.value.phase,
        active: runtime.status.value.active,
        generation: runtime.status.value.generation,
        reason: "visibilityUpdated",
        detail: "visibility updated",
      };
    }
    if (command === "stop_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 2,
        reason: "stopped",
        detail: "stopped",
      };
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options: optionsForLiveDesktopSync } = makeOptions();
    liveDesktopSyncOptions = optionsForLiveDesktopSync;
    const native = createNative(optionsForLiveDesktopSync);
    await native.refreshLiveDesktopBackgroundSupport();
    optionsForLiveDesktopSync.restoreSettings({
      backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
      backgroundEffect: BACKGROUND_EFFECT_BLUR,
    });
    liveDesktopSyncCommands.length = 0;

    await native.syncLiveDesktopBackgroundRuntime();
    assert(liveDesktopSyncCommands.join(",") === "configure_live_desktop_background,start_live_desktop_background", "runtime sync should configure and start live desktop from a stopped state");
    assert(requireEntry(liveDesktopSyncConfigs, 0, "live desktop sync config").effect === BACKGROUND_EFFECT_BLUR, "runtime sync should send the selected live desktop effect");
    assert(readRuntimePhase(optionsForLiveDesktopSync.liveDesktopRuntime.status) === "running", "runtime sync should apply the started status");

    liveDesktopSyncCommands.length = 0;
    optionsForLiveDesktopSync.restoreSettings({ backgroundEffect: BACKGROUND_EFFECT_ACRYLIC });
    await native.syncLiveDesktopBackgroundRuntime();
    assert(liveDesktopSyncCommands.join(",") === "configure_live_desktop_background", "runtime sync should reconfigure an already running live desktop runtime");
    assert(requireLast(liveDesktopSyncConfigs, "updated live desktop sync config").effect === BACKGROUND_EFFECT_ACRYLIC, "runtime sync should send updated effects to a running runtime");

    liveDesktopSyncCommands.length = 0;
    const restartRequest = native.restartLiveDesktopBackgroundRuntime();
    const overlappingSync = native.syncLiveDesktopBackgroundRuntime();
    await Promise.all([restartRequest, overlappingSync]);
    assert(liveDesktopSyncCommands.join(",") === "stop_live_desktop_background,configure_live_desktop_background,start_live_desktop_background", "runtime restart intent should survive an overlapping ordinary sync");
    assert(readRuntimePhase(optionsForLiveDesktopSync.liveDesktopRuntime.status) === "running", "runtime restart should apply the restarted status");

    await native.stopNativeLiveDesktopBackground();
    liveDesktopSyncCommands.length = 0;
    await native.restartLiveDesktopBackgroundRuntime();
    assert(liveDesktopSyncCommands.join(",") === "configure_live_desktop_background,start_live_desktop_background", "runtime restart should cold-start a stopped live desktop runtime without stopping first");
    assert(readRuntimePhase(optionsForLiveDesktopSync.liveDesktopRuntime.status) === "running", "runtime restart should apply running status after cold-starting");

    liveDesktopSyncCommands.length = 0;
    optionsForLiveDesktopSync.isDesktopOpen.value = false;
    await native.syncLiveDesktopBackgroundRuntime();
    assert(liveDesktopSyncCommands.join(",") === "set_live_desktop_background_visible", "runtime sync should hide live desktop while keeping it warm");
    assert(requireLast(liveDesktopSyncVisibility, "hidden live desktop visibility") === false, "hidden live desktop runtime should set the native visual invisible");
    assert(readCollectionLength(timers) === 1, "hidden live desktop runtime should schedule an idle stop");
    assert(readRuntimePhase(optionsForLiveDesktopSync.liveDesktopRuntime.status) === "running", "hidden live desktop runtime should remain running during the keep-alive window");

    liveDesktopSyncCommands.length = 0;
    optionsForLiveDesktopSync.isDesktopOpen.value = true;
    await native.syncLiveDesktopBackgroundRuntime();
    assert(readCollectionLength(timers) === 0, "reopening the launchpad should cancel the pending live desktop idle stop");
    assert(liveDesktopSyncCommands.join(",") === "set_live_desktop_background_visible,configure_live_desktop_background", "reopened live desktop runtime should be shown and reused without a cold start");
    assert(requireLast(liveDesktopSyncVisibility, "reopened live desktop visibility") === true, "reopened live desktop runtime should set the native visual visible");

    liveDesktopSyncCommands.length = 0;
    optionsForLiveDesktopSync.isDesktopOpen.value = false;
    await native.syncLiveDesktopBackgroundRuntime();
    assert(readCollectionLength(timers) === 1, "hiding the launchpad again should schedule another idle stop");
    await takeTestTimer(timers)();
    await flushMicrotasks(2);
    assert(liveDesktopSyncCommands.join(",") === "set_live_desktop_background_visible,stop_live_desktop_background", "live desktop runtime should stop after the idle keep-alive window expires");
    assert(readRuntimePhase(optionsForLiveDesktopSync.liveDesktopRuntime.status) === "stopped", "expired live desktop idle stop should apply stopped status");

    optionsForLiveDesktopSync.isDesktopOpen.value = true;
    await native.startNativeLiveDesktopBackground();
    liveDesktopSyncCommands.length = 0;
    optionsForLiveDesktopSync.isDesktopOpen.value = false;
    await native.syncLiveDesktopBackgroundRuntime();
    assert(readCollectionLength(timers) === 1, "hidden live desktop runtime should schedule an idle stop before source changes");
    optionsForLiveDesktopSync.restoreSettings({ backgroundSource: BACKGROUND_SOURCE_SYSTEM_MATERIAL });
    await native.syncLiveDesktopBackgroundRuntime();
    assert(readCollectionLength(timers) === 0, "leaving the live desktop background source should cancel a pending idle stop");
    assert(liveDesktopSyncCommands.join(",") === "set_live_desktop_background_visible,stop_live_desktop_background", "leaving the live desktop background source should stop immediately");
  }, {
    passLiveDesktopBackgroundSupport: true,
  });

  const closeAnimationCommands: string[] = [];
  await withMockTauri(async (command, args) => {
    closeAnimationCommands.push(command);
    if (command === "get_live_desktop_background_support") {
      return {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: false,
        reason: "available",
      };
    }
    if (command === "configure_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 0,
        reason: "configured",
        detail: "configured",
      };
    }
    if (command === "start_live_desktop_background") {
      return {
        phase: "running",
        active: true,
        generation: 1,
        reason: "running",
        detail: "running",
      };
    }
    if (command === "set_live_desktop_background_visible") {
      assert(args.visible === false, "close animation should hide the native live desktop visual immediately");
      return {
        phase: "running",
        active: true,
        generation: 1,
        reason: "visibilityUpdated",
        detail: "visibility updated",
      };
    }
    if (command === "begin_main_window_close") {
      assert(args.openSequence === 7, "close animation should invalidate the active open generation");
      return { accepted: true, generation: 8 };
    }
    if (command === "stop_live_desktop_background") {
      return {
        phase: "stopped",
        active: false,
        generation: 2,
        reason: "stopped",
        detail: "stopped",
      };
    }
    if (command === "hide_main_window") {
      assert(args.generation === 8, "close animation should hide only the accepted close generation");
      return true;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { calls, options } = makeOptions();
    options.closeDesktop = () => {
      calls.closeDesktop += 1;
      options.isDesktopOpen.value = false;
    };
    const native = createNative(options);
    await native.refreshLiveDesktopBackgroundSupport();
    options.restoreSettings({ backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP });
    await native.startNativeLiveDesktopBackground();
    closeAnimationCommands.length = 0;
    options.mainWindowRuntime.acceptOpen(7);

    native.closeDesktopFromNativeWindow();
    assert(calls.closeDesktop === 1, "custom window chrome close should enter the desktop close owner");
    assert(readCollectionLength(timers) === 1, "close animation should schedule one native hide timer");
    await flushMicrotasks(12);
    assert(closeAnimationCommands.join(",") === "begin_main_window_close,set_live_desktop_background_visible", `close animation should let the accepted native close transaction own the surface and hide the live desktop visual before the delayed hide; received ${closeAnimationCommands.join(",")}`);
    assert(readCollectionLength(timers) === 2, "close animation should also schedule the live desktop idle stop");
    await takeTestTimer(timers)();

    assert(closeAnimationCommands.join(",") === "begin_main_window_close,set_live_desktop_background_visible,hide_main_window", "close animation should hide the accepted generation before the live desktop idle stop expires");
    assert(readCollectionLength(timers) === 1, "close animation should leave one pending live desktop idle stop timer");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "running", "close animation should keep live desktop running during the keep-alive window");
    await takeTestTimer(timers)();
    await flushMicrotasks(2);

    assert(closeAnimationCommands.join(",") === "begin_main_window_close,set_live_desktop_background_visible,hide_main_window,stop_live_desktop_background", "live desktop should stop after the close keep-alive window expires");
    assert(readRuntimePhase(options.liveDesktopRuntime.status) === "stopped", "idle stop should apply stopped live desktop status after hiding");
  }, {
    passBeginMainWindowCloseCommand: true,
    passHideMainWindowCommand: true,
    passLiveDesktopBackgroundSupport: true,
  });

  const cancelledHideCommands: string[] = [];
  const cancelledHideEventHandlers = new Map<string, TestNativeEventHandler>();
  await withMockTauri(async (command) => {
    if (command === "begin_main_window_close") {
      return { accepted: true, generation: 8 };
    }
    if (command === "hide_main_window") {
      cancelledHideCommands.push(command);
      return true;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers, eventListeners) => {
    const { options } = makeOptions();
    const native = createNative(options);

    await native.registerNativeEventListeners();
    options.mainWindowRuntime.acceptOpen(7);
    native.hideNativeWindowAfterCloseAnimation();
    assert(readCollectionLength(timers) === 1, "close animation should schedule a native hide timer");
    const staleHideTimer = requireEntry(timers, 0, "stale native hide timer");
    assert((eventListeners.get("wheel")?.size || 0) === 1, "close animation should block wheel events while the native window is closing");

    const wheelEvent = {
      defaultPrevented: false,
      propagationStopped: false,
      immediatePropagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediatePropagationStopped = true; },
    };
    for (const handler of eventListeners.get("wheel") ?? []) handler(wheelEvent);
    assert(readBoolean(wheelEvent.defaultPrevented), "closing interaction blocker should prevent wheel defaults");
    assert(readBoolean(wheelEvent.propagationStopped), "closing interaction blocker should stop wheel propagation");

    await requireEventHandler(cancelledHideEventHandlers, "lumeria-open-desktop")({
      payload: { displayChanged: false, openSequence: 9 },
    });
    await flushMicrotasks(8);
    assert(readCollectionLength(timers) === 0, "native open events should cancel pending native hide timers");
    assert((eventListeners.get("wheel")?.size || 0) === 0, "native open events should unblock wheel events");

    await staleHideTimer();
    await flushMicrotasks(3);
    assert(cancelledHideCommands.length === 0, "cancelled native hide timers should not hide the reopened window");
  }, {
    passBeginMainWindowCloseCommand: true,
    passHideMainWindowCommand: true,
    listen: async (eventName, handler) => {
      cancelledHideEventHandlers.set(eventName, handler);
      return () => cancelledHideEventHandlers.delete(eventName);
    },
  });

  const listenerRegistrationError = new Error("desktop activation listener denied");
  await withMockTauri(async (command) => {
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions();
    const native = createNative(options);
    let registrationFailure: unknown = null;
    await withSuppressedConsoleError(async () => {
      try {
        await native.registerNativeEventListeners();
      } catch (error) {
        registrationFailure = error;
      }
    });

    assert(registrationFailure === listenerRegistrationError, "required native listener failures should reject renderer startup");
  }, {
    listen: async (eventName) => {
      if (eventName === "lumeria-open-desktop") throw listenerRegistrationError;
      return () => {};
    },
  });

  const startupCompletionCommands: string[] = [];
  await withMockTauri(async (command) => {
    if (command === "complete_renderer_startup") {
      startupCompletionCommands.push(command);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions();
    const native = createNative(options);

    await native.completeRendererStartup();

    assert(startupCompletionCommands.join(",") === "complete_renderer_startup", "renderer startup should complete through the dedicated native command");
  });

  const openSurfaceCommands: string[] = [];
  const openRevealSequences: number[] = [];
  const openEventHandlers = new Map<string, TestNativeEventHandler>();
  await withMockTauri(async (command, args) => {
    if (command === "set_main_window_native_frame_enabled") {
      openSurfaceCommands.push(`frame:${args.enabled}`);
      return null;
    }
    if (command === "set_main_window_effects_enabled") {
      openSurfaceCommands.push(`effects:${args.enabled}`);
      return null;
    }
    if (command === "reveal_main_window") {
      openRevealSequences.push(args.openSequence);
      return true;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions();
    const native = createNative(options);

    await native.registerNativeEventListeners();
    const invalidPayloadErrors: unknown[][] = [];
    const originalConsoleError = console.error;
    console.error = (...args) => invalidPayloadErrors.push(args);
    try {
      await requireEventHandler(openEventHandlers, "lumeria-open-desktop")({ payload: 2 });
      await flushMicrotasks(3);
    } finally {
      console.error = originalConsoleError;
    }
    assert(invalidPayloadErrors.length === 1, "numeric native activation payloads should be rejected explicitly");
    assert(openSurfaceCommands.length === 0, "rejected legacy activation payloads should not open the native surface");

    await requireEventHandler(openEventHandlers, "lumeria-open-desktop")({
      payload: { displayChanged: true, openSequence: 2 },
    });
    await flushMicrotasks(8);

    assert(openSurfaceCommands.join(",") === "frame:true,effects:true", "native open events should restore the native frame before window effects");
    assert(openRevealSequences.join(",") === "2", "native open events should reveal the cloaked native window after paint");
    assert(native.mainWindowDisplayRevision.value === 1, "display-changing open events should advance the background display revision");
  }, {
    listen: async (eventName, handler) => {
      openEventHandlers.set(eventName, handler);
      return () => openEventHandlers.delete(eventName);
    },
    passWindowEffectsCommand: true,
    passWindowFrameCommand: true,
    passRevealMainWindowCommand: true,
  });

  const crossDisplayOpenTimeline: string[] = [];
  const crossDisplayFrameCallbacks: FrameRequestCallback[] = [];
  const crossDisplayOpenEventHandlers = new Map<string, TestNativeEventHandler>();
  await withMockTauri(async (command) => {
    if (command === "reveal_main_window") {
      crossDisplayOpenTimeline.push("reveal");
      return true;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    globalThis.window.requestAnimationFrame = (callback) => {
      crossDisplayFrameCallbacks.push(callback);
      return crossDisplayFrameCallbacks.length;
    };
    const { options } = makeOptions();
    options.isDesktopOpen.value = false;
    options.openDesktop = () => {
      options.isDesktopOpen.value = true;
      crossDisplayOpenTimeline.push("open");
    };
    const native = createNative(options);

    await native.registerNativeEventListeners();
    const activation = requireEventHandler(crossDisplayOpenEventHandlers, "lumeria-open-desktop")({
      payload: { displayChanged: true, openSequence: 4 },
    });
    await flushMicrotasks(12);

    assert(crossDisplayOpenTimeline.length === 0, "cross-display open should keep the desktop closed while the target layout paints");
    for (let frame = 0; frame < 10 && !crossDisplayOpenTimeline.includes("reveal"); frame += 1) {
      const callback = crossDisplayFrameCallbacks.shift();
      assert(callback, "cross-display open should request a frame while preparing the target display");
      callback(frame * 16.67);
      await flushMicrotasks(4);
    }
    assert(crossDisplayOpenTimeline.join(",") === "reveal", "cross-display open should reveal the native window before starting the desktop animation");

    await flushMicrotasks(12);
    const openingFrame = crossDisplayFrameCallbacks.shift();
    assert(openingFrame, "cross-display open should wait one visible frame before starting the desktop animation");
    openingFrame(200);
    await Promise.resolve(activation);
    await flushMicrotasks(4);

    assert(crossDisplayOpenTimeline.join(",") === "reveal,open", "cross-display open should start the desktop animation only after the native reveal");
    assert(readBoolean(options.isDesktopOpen.value), "cross-display open should finish by opening the desktop state");
  }, {
    listen: async (eventName, handler) => {
      crossDisplayOpenEventHandlers.set(eventName, handler);
      return () => crossDisplayOpenEventHandlers.delete(eventName);
    },
    passRevealMainWindowCommand: true,
  });

  const settingsToggleEventHandlers = new Map<string, TestNativeEventHandler>();
  await withMockTauri(async (command) => {
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { calls, options } = makeOptions({
      isSettingsPanelOpen: true,
    });
    const native = createNative(options);

    await native.registerNativeEventListeners();
    await requireEventHandler(settingsToggleEventHandlers, "lumeria-toggle-desktop")({
      payload: { displayChanged: false, openSequence: 5 },
    });
    await flushMicrotasks(3);

    assert(calls.closeSettingsPanel.length === 1, "native toggle shortcut should close an open settings panel");
    assert(requireEntry(calls.closeSettingsPanel, 0, "settings panel close").mode === "desktop", "native toggle shortcut should use the desktop settings close motion");
    assert(calls.closeDesktop === 1, "native toggle shortcut should still close the desktop when settings is open");
    assert(readCollectionLength(timers) === 1, "native toggle shortcut should schedule a native hide after closing settings and desktop");
  }, {
    listen: async (eventName, handler) => {
      settingsToggleEventHandlers.set(eventName, handler);
      return () => settingsToggleEventHandlers.delete(eventName);
    },
  });

  const folderToggleEventHandlers = new Map<string, TestNativeEventHandler>();
  await withMockTauri(async (command) => {
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { calls, options } = makeOptions({
      renderedFolder: ref({ id: "folder-1", type: "folder", name: "Folder" }),
      startFolderZoomFadeCloseResult: true,
    });
    const native = createNative(options);

    await native.registerNativeEventListeners();
    await requireEventHandler(folderToggleEventHandlers, "lumeria-toggle-desktop")({
      payload: { displayChanged: false, openSequence: 4 },
    });
    await flushMicrotasks(3);

    assert(calls.startFolderZoomFadeClose.length === 1, "native toggle shortcut should close an open folder with zoom-fade first");
    assert(requireEntry(calls.startFolderZoomFadeClose, 0, "folder zoom-fade close").reason === "desktop", "native toggle shortcut should mark zoom-fade as desktop close");
    assert(calls.closeDesktop === 1, "native toggle shortcut should close the desktop while the folder zoom-fades");
    assert(readCollectionLength(timers) === 1, "native toggle shortcut should schedule a native hide after the desktop close animation");
  }, {
    listen: async (eventName, handler) => {
      folderToggleEventHandlers.set(eventName, handler);
      return () => folderToggleEventHandlers.delete(eventName);
    },
  });

  setLiveDesktopExperimentEnabledForTests(null);

  const wallpaperSaves: LayoutDocument[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "wallpaper-app", type: "manualApp", name: "Wallpaper", launchTarget: { kind: "shortcut", path: "Wallpaper.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
          backgroundEffect: BACKGROUND_EFFECT_DIMMED,
          backgroundImageOpacity: 72,
          backgroundImagePath: "C:/Cached/old-wallpaper.jpg",
        },
      };
    }
    if (command === "get_desktop_wallpaper_background") {
      return { name: "Windows wallpaper", imagePath: "C:/Cached/current-wallpaper.jpg" };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      wallpaperSaves.push(args.layout);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);
    await Promise.all(timers.splice(0).map((timer) => timer()));

    assert(options.settings.presentation.backgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER, "native load should keep windows wallpaper as the background source");
    assert(options.settings.presentation.backgroundImagePath.value === "C:/Cached/current-wallpaper.jpg", "native load should refresh the cached desktop wallpaper path");
    assert(options.settings.presentation.backgroundImageUrl.value === "http://asset.localhost/C:/Cached/current-wallpaper.jpg", "native load should derive the refreshed wallpaper asset url");
    assert(wallpaperSaves.length === 1, "refreshed desktop wallpaper backgrounds should be persisted after native load");
    assert(requireEntry(wallpaperSaves, 0, "wallpaper save").settings.backgroundImagePath === "C:/Cached/current-wallpaper.jpg", "persisted layouts should include the refreshed wallpaper path");
  });

  await withMockTauri(async (command) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 19045,
        supportsAcrylic: true,
        supportsMica: false,
        supportsMicaAlt: false,
      };
    }
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[]],
        settings: {
          windowEffectMaterial: "mica",
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") return null;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "unsupported saved mica material should fall back to acrylic");
    assert(options.settings.presentation.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "material fallback should preserve saved appearance");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  await withMockTauri(async (command) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 22000,
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: false,
      };
    }
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[]],
        settings: {
          windowEffectMaterial: WINDOW_EFFECT_MATERIAL_MICA_ALT,
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") return null;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA, "unsupported saved mica alt material should fall back to mica when available");
    assert(options.settings.presentation.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "mica alt fallback should preserve saved appearance");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  await withMockTauri(async (command) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 10240,
        supportsAcrylic: false,
        supportsMica: false,
        supportsMicaAlt: false,
      };
    }
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[]],
        settings: {
          windowEffectMaterial: WINDOW_EFFECT_MATERIAL_NONE,
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
        },
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") return null;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.settings.presentation.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_NONE, "saved none material should remain selected without native material support");
    assert(options.settings.draft.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_NONE, "native load should sync none material draft");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  const startupIconCommands: string[] = [];
  await withMockTauri((command) => {
    startupIconCommands.push(command);
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{
          id: "custom-icon-app",
          type: "manualApp",
          name: "Custom Icon App",
          iconPath: "C:/Icons/catalog.png",
          customIconPath: "C:/Icons/custom.png",
          launchTarget: { kind: "shortcut", path: "Custom Icon App.lnk" },
        }]],
        settings: {},
      };
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(!startupIconCommands.includes("load_cached_app_icons"), "native startup should not hydrate cached icons through base64 IPC");
    const startupApp = requireLaunchpadApp(options.layout.presentation.pages.value[0]?.[0], "startup icon app");
    assert(startupApp.iconUrl === "http://asset.localhost/C:/Icons/catalog.png", "native startup should expose the catalog asset URL");
    assert(startupApp.customIconUrl === "http://asset.localhost/C:/Icons/custom.png", "native startup should expose the custom asset URL");
    assert(!("iconDataUrl" in startupApp), "native startup should not attach catalog base64 data");
    assert(!("customIconDataUrl" in startupApp), "native startup should not attach custom base64 data");
  });

  const launchCommands: string[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "custom-app", type: "manualApp", name: "Custom App", launchTarget: { kind: "executable", path: "C:/Tools/Custom.exe" } }]],
        settings: {},
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      launchCommands.push(command);
      assert(args.layout.pages[0]?.[0]?.id === "custom-app", "debounced native saves should persist the current layout");
      return null;
    }
    if (command === "launch_app") {
      launchCommands.push(command);
      assert(args.request.id === "custom-app", "native launch should pass the current app id");
      assert(!("name" in args.request), "native launch should send only the catalog id owned by Rust");
      assert(!("launchTarget" in args.request), "native launch should not pass launch target from the renderer");
      assert(!("launchArgs" in args.request), "native launch should not pass launch arguments from the renderer");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    timers.length = 0;
    native.scheduleNativeLayoutSave();
    await native.launchNativeAppIfAvailable({
      id: "custom-app",
      type: "app",
      name: "Custom App",
      launchTarget: { kind: "executable", path: "C:/Tools/Custom.exe" },
      launchArgs: "--profile dev",
    });
    assert(launchCommands.join(",") === "launch_app", "non-critical pending saves should not block native launch");
    assert(readCollectionLength(timers) === 1, "non-critical pending saves should remain debounced after launch");
    await takeTestTimer(timers)();
    assert(launchCommands.join(",") === "launch_app,save_layout", "debounced save should still run after non-critical launch");
  });

  const pendingCriticalSaves: Array<(value: unknown) => void> = [];
  const criticalCommands: string[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "custom-app", type: "manualApp", name: "Custom App", launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" } }]],
        settings: {},
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      criticalCommands.push(command);
      assert(args.layout.pages[0]?.[0]?.id === "custom-app", "critical native saves should persist the current app");
      return new Promise<unknown>((resolve) => {
        pendingCriticalSaves.push(resolve);
      });
    }
    if (command === "launch_app") {
      criticalCommands.push(command);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    timers.length = 0;
    const savePromise = native.markLaunchCriticalLayoutDirty("custom-app");
    assert(pendingCriticalSaves.length === 1, "critical layout changes should save immediately");
    let prepared = false;
    const criticalApp: LaunchpadApp = { id: "custom-app", type: "app", name: "Custom App" };
    const preparePromise = Promise.resolve(native.prepareNativeLaunch(criticalApp)).then((result) => {
      prepared = result;
    });
    await flushMicrotasks(2);
    assert(!Boolean(prepared), "critical launch preparation should wait for the save");
    requireEntry(pendingCriticalSaves, 0, "critical save resolver")(null);
    await savePromise;
    await preparePromise;
    assert(Number(prepared) === 1, "critical launch preparation should succeed after the save");
    await native.launchNativeAppIfAvailable({
      id: "custom-app",
      type: "app",
      name: "Custom App",
      launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" },
    });
    assert(criticalCommands.join(",") === "save_layout,launch_app", "critical saves should complete before native launch");
  });

  const pendingFlushSaves: Array<(value: unknown) => void> = [];
  let flushSaveCount = 0;
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "flush-app", type: "manualApp", name: "Flush App", launchTarget: { kind: "shortcut", path: "C:/Tools/Flush.lnk" } }]],
        settings: {},
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      flushSaveCount += 1;
      return new Promise<unknown>((resolve) => {
        pendingFlushSaves.push(resolve);
      });
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    timers.length = 0;
    native.scheduleNativeLayoutSave();
    assert(readCollectionLength(timers) === 1, "debounced native saves should be scheduled before flush");
    const firstFlush = native.flushNativeLayoutSave();
    const secondFlush = native.flushNativeLayoutSave();
    assert(readCollectionLength(timers) === 0, "flushing native saves should cancel pending debounce timers");
    assert(readNumber(flushSaveCount) === 1, "concurrent flushes should share the in-flight native save");
    requireEntry(pendingFlushSaves, 0, "flush save resolver")(null);
    assert(await firstFlush, "first flush should resolve after the save succeeds");
    assert(await secondFlush, "second flush should resolve after the shared save succeeds");
  });

  const quitCommands: string[] = [];
  const quitEventHandlers = new Map<string, TestNativeEventHandler>();
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "quit-app", type: "manualApp", name: "Quit App", launchTarget: { kind: "shortcut", path: "C:/Tools/Quit.lnk" } }]],
        settings: {},
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout" || command === "confirm_quit_after_save") {
      if (command === "confirm_quit_after_save") {
        assert(args.saved === true, "quit confirmation should report successful layout save");
      }
      quitCommands.push(command);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
    });
    const native = createNative(options);

    await native.loadNativeLaunchpadData();
    await native.registerNativeEventListeners();
    timers.length = 0;
    native.scheduleNativeLayoutSave();
    await requireEventHandler(quitEventHandlers, "lumeria-quit-requested")({});

    assert(quitCommands.join(",") === "save_layout,confirm_quit_after_save", "native quit requests should flush pending layout saves before confirming quit");
  }, {
    listen: async (eventName, handler) => {
      quitEventHandlers.set(eventName, handler);
      return () => quitEventHandlers.delete(eventName);
    },
  });

  const launchFailureCommands: string[] = [];
  await withMockTauri(async (command, args) => {
    if (command === "launch_app") {
      launchFailureCommands.push(command);
      throw {
        kind: "targetNotFound",
        detail: "missing",
      };
    }
    if (command === "show_launch_error_message") {
      launchFailureCommands.push(command);
      assert(args.report.kind === "targetNotFound", "native launch error dialog should receive the structured failure kind");
      assert(args.report.suggestion.includes("编辑"), "native launch error dialog should receive the structured suggestion");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const { options } = makeOptions();
    const native = createNative(options);

      const failure = await native.launchNativeAppIfAvailable({
        id: "missing-app",
        type: "app",
        name: "Missing App",
      });
      assert(failure !== true && failure !== undefined, "failed native launches should return a failure report");
      assert(failure.kind === "targetNotFound", "failed native launches should return structured launch errors");
      assert(failure.title === "无法打开应用", "native launch errors should be localized by the WebView");
      assert(failure.message.includes("Missing App") && failure.message.includes("找不到启动文件"), "native launch errors should combine the app name with the localized reason");
      await native.showNativeLaunchError(failure);
      assert(launchFailureCommands.join(",") === "launch_app,show_launch_error_message", "launch errors should be shown by an explicit native dialog command");
    } finally {
      console.error = originalConsoleError;
    }
  });

  await withMockTauri(async command => {
    if (command === "launch_app") throw { kind: "cancelled", detail: "user declined elevation" };
    throw new Error(`Cancellation must not invoke ${command}`);
  }, async () => {
    const { options } = makeOptions();
    const native = createNative(options);
    const result = await native.launchNativeAppIfAvailable({id:"cancelled-app",type:"app",name:"Cancelled App"});
    assert(result !== true && result?.kind === "cancelled", "cancelled elevation must retain a distinct result");
  });

  const englishLocalizationText = createLocalization({
    issue: null,
    match: "exact",
    preference: "en-US",
    resolvedLocale: "en-US",
  }).text;
  await withMockTauri(async (command, args) => {
    if (command === "launch_app") {
      throw { kind: "accessDenied", detail: "access denied" };
    }
    if (command === "show_launch_error_message") {
      assert(args.report.title === "Could not open app", "native launch dialog titles should follow the active locale");
      assert(args.report.message.includes("permission"), "native launch reasons should follow the active locale");
      assert(args.report.suggestion.includes("administrator"), "native launch suggestions should follow the active locale");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const { options } = makeOptions({ localizationText: englishLocalizationText });
      const native = createNative(options);
      const failure = await native.launchNativeAppIfAvailable({
        id: "blocked-app",
        type: "app",
        name: "Blocked App",
      });
      assert(failure !== true && failure !== undefined && "message" in failure, "blocked native launches should return a failure report");
      await native.showNativeLaunchError(failure);
    } finally {
      console.error = originalConsoleError;
    }
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 2,
        pages: [[{ id: "custom-app", type: "manualApp", name: "Custom App", launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" } }]],
        settings: {},
      };
    }
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") throw new Error("disk full");
    if (command === "launch_app") throw new Error("launch_app should not run after a failed critical save");
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const originalConsoleError = console.error;
    const saveFailures: LaunchpadLayoutFailureNoticeConfig[] = [];
    console.error = () => {};
    try {
      const { options } = makeOptions({
        showLayoutSaveFailed: (config) => saveFailures.push(config),
      });
    const native = createNative(options);

      await native.loadNativeLaunchpadData();
      timers.length = 0;
      await native.markLaunchCriticalLayoutDirty("custom-app");
      const prepared = await native.prepareNativeLaunch({ id: "custom-app", type: "app", name: "Custom App" });
      assert(prepared === false, "failed critical saves should block native launch preparation");
      assert(saveFailures.length >= 1, "failed critical saves should surface a save notice");
    } finally {
      console.error = originalConsoleError;
    }
  });

  const pendingChecks: PendingLaunchTargetCheck[] = [];
  await withMockTauri((command, args) => {
    if (command !== "check_launch_targets") throw new Error(`Unexpected invoke: ${command}`);
    return new Promise<unknown>((resolve) => {
      pendingChecks.push({ args, resolve });
    });
  }, async (timers) => {
    const { options } = makeOptions({
      pages: [[{ id: "app-a", type: "app", name: "A", launchTarget: { kind: "shortcut", path: "A.lnk" } }]],
    });
    const native = createNative(options);

    native.scheduleLaunchTargetStatusCheck();
    native.scheduleLaunchTargetStatusCheck();
    assert(readCollectionLength(timers) === 1, "duplicate target signatures should share one scheduled status check");
    const firstCheck = takeTestTimer(timers)();
    options.layout.documentPersistence.restorePages([[{ id: "app-b", type: "app", name: "B", launchTarget: { kind: "shortcut", path: "B.lnk" } }]]);
    native.scheduleLaunchTargetStatusCheck();
    const secondCheck = takeTestTimer(timers)();

    const firstPendingCheck = requireEntry(pendingChecks, 0, "first pending target check");
    const secondPendingCheck = requireEntry(pendingChecks, 1, "second pending target check");
    assert(firstPendingCheck.args.targets[0]?.id === "app-a", "first status check should capture the original app");
    assert(secondPendingCheck.args.targets[0]?.id === "app-b", "second status check should capture the updated app");
    secondPendingCheck.resolve([{ id: "app-b", status: "ok" }]);
    await secondCheck;
    assert(options.apps.presentation.launchTargetStatusById.value["app-b"] === "ok", "latest status check should update badge state");
    firstPendingCheck.resolve([{ id: "app-a", status: "missing" }]);
    await firstCheck;
    assert(!("app-a" in options.apps.presentation.launchTargetStatusById.value), "stale status checks should not overwrite newer state");
  });

  await withMockTauri((command) => {
    if (command === "check_launch_targets") return [{ id: "app", status: "missing" }];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      pages: [[{ id: "app", type: "app", name: "App", launchTarget: { kind: "shortcut", path: "A.lnk" } }]],
    });
    const native = createNative(options);

    native.scheduleLaunchTargetStatusCheck();
    await takeTestTimer(timers)();
    assert(options.apps.presentation.launchTargetStatusById.value.app === "missing", "missing status should apply to the checked target");
    assert(native.getLaunchTargetStatus(requireLaunchpadApp(options.layout.presentation.pages.value[0]?.[0], "checked launch app")) === "missing", "native status lookup should match the checked target");

    options.layout.documentPersistence.restorePages([[{ id: "app", type: "app", name: "App", launchTarget: { kind: "shortcut", path: "B.lnk" } }]]);
    native.scheduleLaunchTargetStatusCheck();
    assert(!("app" in options.apps.presentation.launchTargetStatusById.value), "changing launch target should clear stale missing status before recheck");
    assert(native.getLaunchTargetStatus(requireLaunchpadApp(options.layout.presentation.pages.value[0]?.[0], "updated launch app")) === null, "native status lookup should ignore stale target records");
  });

  const pendingNativeListeners: PendingNativeListener[] = [];
  const staleUnlistenEvents: string[] = [];
  await withMockTauri(async () => {
    throw new Error("layout should not load during listener cleanup test");
  }, async () => {
    const { options } = makeOptions();
    const native = createNative(options);

    const registerPromise = native.registerNativeEventListeners();
    assert(pendingNativeListeners.length === 5, "native event listener registration should request all listeners");
    native.clearNativeEventListeners();
    for (const pending of pendingNativeListeners) {
      pending.resolve(() => staleUnlistenEvents.push(pending.eventName));
    }
    await registerPromise;

    assert(staleUnlistenEvents.length === 5, "late native listener registrations should be immediately unlistened after cleanup");
  }, {
    listen: (eventName) => new Promise<() => void>((resolve) => {
      pendingNativeListeners.push({ eventName, resolve });
    }),
  });

  let saveAttempts = 0;
  await withMockTauri(async (command) => {
    if (command === "load_layout") return null;
    if (command === "scan_apps") return { apps: [], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: makeScanStats() };
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      saveAttempts += 1;
      if (saveAttempts === 1) throw new Error("disk full");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const originalConsoleError = console.error;
    const saveFailures: LaunchpadLayoutFailureNoticeConfig[] = [];
    let saveRecoveredCount = 0;
    console.error = () => {};
    try {
      const { options } = makeOptions({
        showLayoutSaveFailed: (config) => saveFailures.push(config),
        showLayoutSaveRecovered: () => {
          saveRecoveredCount += 1;
        },
      });
    const native = createNative(options);

      await native.loadNativeLaunchpadData();
      timers.length = 0;
      native.scheduleNativeLayoutSave();
      await takeTestTimer(timers)();

      assert(saveFailures.length === 1, "failed native saves should surface a save notice");
      const saveFailure = requireEntry(saveFailures, 0, "native save failure");
      assert(saveFailure.retryCount === 1, "failed native saves should include retry count");
      assert(typeof saveFailure.onRetry === "function", "failed native saves should expose retry action");

      await requireNoticeRetry(saveFailure)();
      assert(readNumber(saveAttempts) === 2, "retry action should attempt to save again");
      assert(readNumber(saveRecoveredCount) === 1, "successful retry should surface recovered save notice");
    } finally {
      console.error = originalConsoleError;
    }
  });
}
