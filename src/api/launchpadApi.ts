import {
  assertLiveDesktopBackgroundSupport,
  assertLiveDesktopRuntimeConfig,
  assertLiveDesktopRuntimeStatus,
  type LiveDesktopBackgroundSupport,
  type LiveDesktopRuntimeConfig,
  type LiveDesktopRuntimeStatus,
} from "./liveDesktopContract.js";
import {
  assertCatalogScanFilters,
  assertCatalogScanRoot,
  assertCatalogScanWarning,
  assertScannedCatalogApp,
  assertCatalogLaunchTarget,
  type CatalogScanFilters,
  type CatalogScanRoot,
  type CatalogScanWarning,
  type ScannedCatalogApp,
} from "../domain/applicationCatalog.js";
import {
  assertLayoutDocument,
  type LayoutDocument,
  type LayoutSettings,
} from "../domain/layoutDocument.js";
import type { LocaleIssueCode } from "../i18n/locale.js";

type UnknownRecord = Readonly<Record<string, unknown>>;
type NativeInvoke = (command: string, args?: UnknownRecord) => Promise<unknown>;
type NativeEventHandler = (event: unknown) => void;
type Unlisten = () => void;

/**
 * Reference-test-only Launchpad adapter.
 *
 * This module is the API surface of the retained browser reference host
 * (`tests/browser/reference`). It deliberately does not import
 * `@tauri-apps/api` and never looks for a Tauri injection on the global scope:
 * unless a bridge is injected through `setLaunchpadApiBridgeForTests`, every
 * command reports the existing "bridge unavailable" contract result.
 *
 * The command and event names below are therefore only the mock protocol that
 * test bridges implement. Nothing here executes a native command by itself.
 */
export type LaunchpadApiBridge = Readonly<{
  convertFileSrc?: (filePath: string) => string;
  invoke?: NativeInvoke;
  listen?: (eventName: string, handler: NativeEventHandler) => Promise<Unlisten>;
}>;

import type {
  LaunchContext,
  NativeLocaleState,
  ScanStats,
  KeywordExcludedApp,
  ScanAppsResult,
  PickedLaunchFile,
  PickedBackgroundImage,
  BackgroundLayoutContext,
  AppIconChoice,
  CachedCustomIconResult,
  LaunchTargetCheckRequest,
  LaunchTargetCheckResult,
  LaunchableApp,
  LaunchFailureReport,
  LaunchResult,
  MainWindowCloseTransition,
  MainWindowEffectsSupport,
  MainWindowEffectOptions,
  MainWindowModeOptions,
} from "../platform/launchpadContracts.js";

let bridgeOverride: LaunchpadApiBridge | null = null;

const SCAN_COUNT_STAT_FIELDS = [
  "dirsVisited",
  "entriesSeen",
  "physicalAppsFound",
  "startMenuOverlays",
  "equivalentAppsMerged",
  "unresolvedApps",
  "keywordExcludedApps",
  "excludedApps",
  "appsFound",
] as const;
const LOCALE_ISSUE_CODES = new Set<LocaleIssueCode>([
  "unsupportedPreference",
  "preferenceLoadFailed",
  "systemLocaleUnavailable",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

export function setLaunchpadApiBridgeForTests(bridge: LaunchpadApiBridge | null | undefined): void {
  bridgeOverride = bridge || null;
}

function getLaunchpadApiBridge(): LaunchpadApiBridge | null {
  return bridgeOverride;
}

function getBridgeInvoke(): NativeInvoke | null {
  return getLaunchpadApiBridge()?.invoke || null;
}

export function convertFilePathToAssetUrl(filePath: string | null | undefined): string | null {
  const convertFileSrc = getLaunchpadApiBridge()?.convertFileSrc;
  if (!convertFileSrc || !filePath) return null;
  return convertFileSrc(filePath);
}

export function isNativeBridgeAvailable() {
  return Boolean(getLaunchpadApiBridge()?.invoke);
}

function validateLaunchContext(value: unknown): LaunchContext {
  const record = requireRecord(value, "get_launch_context result");
  if (record.origin !== "manual" && record.origin !== "loginStartup") {
    throw new TypeError("get_launch_context result.origin must be manual or loginStartup");
  }
  return record as LaunchContext;
}

function validateNativeLocaleState(value: unknown): NativeLocaleState {
  const record = requireRecord(value, "locale state");
  requireString(record.preference, "locale state.preference");
  if (record.resolvedLocale !== "zh-CN" && record.resolvedLocale !== "en-US") {
    throw new TypeError("locale state.resolvedLocale must be a bundled locale");
  }
  if (record.match !== "default" && record.match !== "exact" && record.match !== "explicit" && record.match !== "language") {
    throw new TypeError("locale state.match must be a supported match kind");
  }
  if (record.issue !== null) {
    const issueRecord = requireRecord(record.issue, "locale state.issue");
    if (typeof issueRecord.code !== "string" || !LOCALE_ISSUE_CODES.has(issueRecord.code as LocaleIssueCode)) {
      throw new TypeError("locale state.issue.code must be a supported native locale issue");
    }
    requireString(issueRecord.value, "locale state.issue.value");
  }
  return record as NativeLocaleState;
}

export async function getLaunchContext(): Promise<LaunchContext> {
  const invoke = getBridgeInvoke();
  if (!invoke) return { origin: "manual" };
  return validateLaunchContext(await invoke("get_launch_context"));
}

export async function completeRendererStartup(): Promise<void> {
  const invoke = getBridgeInvoke();
  if (!invoke) return;
  await invoke("complete_renderer_startup");
}

export async function getAutostartStatus(): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) throw new Error("Autostart is unavailable in the current runtime");
  return requireBoolean(await invoke("get_autostart_status"), "get_autostart_status result");
}

export function isAutostartAvailable() {
  return isNativeBridgeAvailable();
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) throw new Error("Autostart is unavailable in the current runtime");
  return requireBoolean(
    await invoke("set_autostart_enabled", { enabled: Boolean(enabled) }),
    "set_autostart_enabled result",
  );
}

export async function listenNativeEvent(eventName: string, handler: NativeEventHandler): Promise<Unlisten | null> {
  const listen = getLaunchpadApiBridge()?.listen;
  if (!listen) return null;
  return listen(eventName, handler);
}

export async function scanApps(
  roots: readonly CatalogScanRoot[] = [],
  filters: CatalogScanFilters = {},
): Promise<ScanAppsResult | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  roots.forEach((root, index) => assertCatalogScanRoot(root, `scan roots[${index}]`));
  assertCatalogScanFilters(filters);
  return normalizeScanAppsResult(await invoke("scan_apps", { roots, filters }));
}

export function normalizeScanAppsResult(result: unknown): ScanAppsResult {
  if (!isRecord(result)) {
    throw new TypeError("scan_apps must return a catalog result object");
  }
  if (
    !Array.isArray(result.apps)
    || !Array.isArray(result.excludedApps)
    || !Array.isArray(result.keywordExcludedApps)
    || !Array.isArray(result.warnings)
  ) {
    throw new TypeError("scan_apps result must include apps, excludedApps, keywordExcludedApps, and warnings arrays");
  }
  if (!isRecord(result.stats)) {
    throw new TypeError("scan_apps result must include scan stats");
  }
  for (const field of SCAN_COUNT_STAT_FIELDS) {
    if (!Number.isSafeInteger(result.stats[field]) || (result.stats[field] as number) < 0) {
      throw new TypeError(`scan_apps result stats.${field} must be a non-negative safe integer`);
    }
  }
  if (typeof result.stats.limitReached !== "boolean") {
    throw new TypeError("scan_apps result stats.limitReached must be a boolean");
  }
  result.apps.forEach((app, index) => assertScannedCatalogApp(app, `scan_apps result apps[${index}]`));
  result.excludedApps.forEach((app, index) => (
    assertScannedCatalogApp(app, `scan_apps result excludedApps[${index}]`)
  ));
  const keywordExcludedApps = result.keywordExcludedApps.map((entry, index): KeywordExcludedApp => {
    if (!isRecord(entry)) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}] must be an object`);
    }
    const app = assertScannedCatalogApp(entry.app, `scan_apps result keywordExcludedApps[${index}].app`);
    const matchedKeyword = requireString(
      entry.matchedKeyword,
      `scan_apps result keywordExcludedApps[${index}].matchedKeyword`,
    ).trim();
    if (!matchedKeyword) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}].matchedKeyword must be a non-empty string`);
    }
    return { app, matchedKeyword };
  });
  result.warnings.forEach((warning, index) => (
    assertCatalogScanWarning(warning, `scan_apps result warnings[${index}]`)
  ));
  const apps = result.apps as ScannedCatalogApp[];
  const excludedApps = result.excludedApps as ScannedCatalogApp[];
  const warnings = result.warnings as CatalogScanWarning[];
  const stats = result.stats as ScanStats;
  return {
    apps,
    excludedApps,
    keywordExcludedApps,
    warnings,
    stats,
  };
}

export async function loadLayout(): Promise<LayoutDocument | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const layout = await invoke("load_layout");
  if (layout === null) return null;
  return assertLayoutDocument(layout);
}

export async function saveLayout(layout: LayoutDocument): Promise<void> {
  assertLayoutDocument(layout);
  const invoke = getBridgeInvoke();
  if (!invoke) return;
  await invoke("save_layout", { layout });
}

export async function getAppLocaleState(): Promise<NativeLocaleState | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return validateNativeLocaleState(await invoke("get_app_locale_state"));
}

export async function applyAppLocalePreference(preference: string): Promise<NativeLocaleState | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return validateNativeLocaleState(await invoke("apply_app_locale_preference", { preference }));
}

function validatePickedLaunchFile(value: unknown): PickedLaunchFile {
  const record = requireRecord(value, "picked launch file");
  requireString(record.name, "picked launch file.name");
  requireString(record.path, "picked launch file.path");
  assertCatalogLaunchTarget(record.launchTarget, "picked launch file.launchTarget");
  requireString(record.launchArgs, "picked launch file.launchArgs");
  requireNullableString(record.iconPath, "picked launch file.iconPath");
  requireNullableString(record.iconDataUrl, "picked launch file.iconDataUrl");
  return record as PickedLaunchFile;
}

function validatePickedBackgroundImage(value: unknown): PickedBackgroundImage {
  const record = requireRecord(value, "picked background image");
  requireString(record.name, "picked background image.name");
  requireString(record.imagePath, "picked background image.imagePath");
  return record as PickedBackgroundImage;
}

export async function pickLaunchFile(): Promise<PickedLaunchFile | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("pick_launch_file");
  return result === null ? null : validatePickedLaunchFile(result);
}

export async function pickBackgroundImage(): Promise<PickedBackgroundImage | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("pick_background_image");
  return result === null ? null : validatePickedBackgroundImage(result);
}

export async function getDesktopWallpaperBackground(): Promise<PickedBackgroundImage | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("get_desktop_wallpaper_background");
  return result === null ? null : validatePickedBackgroundImage(result);
}

function validateBackgroundLayoutContext(value: unknown): BackgroundLayoutContext {
  const record = requireRecord(value, "background layout context");
  requireFiniteNumber(record.monitorPhysicalX, "background layout context.monitorPhysicalX");
  requireFiniteNumber(record.monitorPhysicalY, "background layout context.monitorPhysicalY");
  requireFiniteNumber(record.monitorPhysicalWidth, "background layout context.monitorPhysicalWidth");
  requireFiniteNumber(record.monitorPhysicalHeight, "background layout context.monitorPhysicalHeight");
  requireFiniteNumber(record.monitorScaleFactor, "background layout context.monitorScaleFactor");
  requireFiniteNumber(record.windowPhysicalX, "background layout context.windowPhysicalX");
  requireFiniteNumber(record.windowPhysicalY, "background layout context.windowPhysicalY");
  return record as BackgroundLayoutContext;
}

export async function getBackgroundLayoutContext(): Promise<BackgroundLayoutContext | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("get_background_layout_context");
  return result === null ? null : validateBackgroundLayoutContext(result);
}

export async function loadCachedBackgroundImageDataUrl(imagePath: string | null | undefined): Promise<string | null> {
  const invoke = getBridgeInvoke();
  if (!invoke || !imagePath) return null;
  const result = await invoke("load_cached_background_image_data_url", { imagePath });
  return result === null ? null : requireString(result, "cached background image data URL");
}

export async function pickScanRootDirectory(): Promise<string | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("pick_scan_root_directory");
  return result === null ? null : requireString(result, "picked scan root directory");
}

function validateAppIconChoice(value: unknown, index: number): AppIconChoice {
  const record = requireRecord(value, `app icon choices[${index}]`);
  requireString(record.id, `app icon choices[${index}].id`);
  requireString(record.iconPath, `app icon choices[${index}].iconPath`);
  return record as AppIconChoice;
}

export async function loadAppIconChoices(targetPath: string): Promise<readonly AppIconChoice[]> {
  const invoke = getBridgeInvoke();
  if (!invoke) return [];
  const result = await invoke("load_app_icon_choices", { targetPath });
  if (!Array.isArray(result)) throw new TypeError("load_app_icon_choices result must be an array");
  result.forEach(validateAppIconChoice);
  return result as readonly AppIconChoice[];
}

export async function cacheCustomIcon(dataUrl: string): Promise<CachedCustomIconResult | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("cache_custom_icon", { dataUrl });
  if (result === null) return null;
  const record = requireRecord(result, "cache_custom_icon result");
  requireString(record.iconPath, "cache_custom_icon result.iconPath");
  requireString(record.iconDataUrl, "cache_custom_icon result.iconDataUrl");
  return record as CachedCustomIconResult;
}

export async function checkLaunchTargets(
  targets: readonly LaunchTargetCheckRequest[],
): Promise<readonly LaunchTargetCheckResult[]> {
  const invoke = getBridgeInvoke();
  if (!invoke) return [];
  targets.forEach((target, index) => {
    requireString(target.id, `check_launch_targets targets[${index}].id`);
    assertCatalogLaunchTarget(target.launchTarget, `check_launch_targets targets[${index}].launchTarget`);
  });
  const result = await invoke("check_launch_targets", { targets });
  if (!Array.isArray(result)) throw new TypeError("check_launch_targets result must be an array");
  result.forEach((entry, index) => {
    const record = requireRecord(entry, `check_launch_targets result[${index}]`);
    requireString(record.id, `check_launch_targets result[${index}].id`);
    if (record.status !== "ok" && record.status !== "missing" && record.status !== "unknown") {
      throw new TypeError(`check_launch_targets result[${index}].status must be ok, missing, or unknown`);
    }
  });
  return result as readonly LaunchTargetCheckResult[];
}

function makeLaunchAppRequest(app: LaunchableApp): Readonly<{ id: string }> {
  return { id: requireString(app.id, "launch app id") };
}

export async function launchApp(app: LaunchableApp): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("launch_app", { request: makeLaunchAppRequest(app) });
  return true;
}

export async function showLaunchErrorMessage(report: LaunchFailureReport): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  for (const key of ["kind", "title", "message", "suggestion", "detail"] as const) {
    requireString(report[key], `launch failure report.${key}`);
  }
  await invoke("show_launch_error_message", { report });
  return true;
}

function requireMainWindowGeneration(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function validateMainWindowCloseTransition(value: unknown): MainWindowCloseTransition {
  const record = requireRecord(value, "begin_main_window_close result");
  requireBoolean(record.accepted, "begin_main_window_close result.accepted");
  requireNonNegativeSafeInteger(record.generation, "begin_main_window_close result.generation");
  return record as MainWindowCloseTransition;
}

export async function beginMainWindowClose(openSequence: number): Promise<MainWindowCloseTransition | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return validateMainWindowCloseTransition(await invoke("begin_main_window_close", {
    openSequence: requireMainWindowGeneration(openSequence, "openSequence"),
  }));
}

export async function hideMainWindow(generation: number): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  return requireBoolean(await invoke("hide_main_window", {
    generation: requireMainWindowGeneration(generation, "generation"),
  }), "hide_main_window result");
}

export async function revealMainWindow(openSequence: number): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  return requireBoolean(await invoke("reveal_main_window", {
    openSequence: requireMainWindowGeneration(openSequence, "openSequence"),
  }), "reveal_main_window result");
}

function validateMainWindowEffectsSupport(value: unknown): MainWindowEffectsSupport {
  const record = requireRecord(value, "main window effects support");
  requireString(record.platform, "main window effects support.platform");
  if (record.build !== null) requireNonNegativeSafeInteger(record.build, "main window effects support.build");
  requireBoolean(record.supportsAcrylic, "main window effects support.supportsAcrylic");
  requireBoolean(record.supportsMica, "main window effects support.supportsMica");
  requireBoolean(record.supportsMicaAlt, "main window effects support.supportsMicaAlt");
  return record as MainWindowEffectsSupport;
}

export async function getMainWindowEffectsSupport(): Promise<MainWindowEffectsSupport | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return validateMainWindowEffectsSupport(await invoke("get_main_window_effects_support"));
}

export async function getLiveDesktopBackgroundSupport(): Promise<LiveDesktopBackgroundSupport | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return assertLiveDesktopBackgroundSupport(await invoke("get_live_desktop_background_support"));
}

export async function getLiveDesktopRuntimeStatus(): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return assertLiveDesktopRuntimeStatus(await invoke("get_live_desktop_runtime_status"));
}

export async function configureLiveDesktopBackground(config: LiveDesktopRuntimeConfig): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  assertLiveDesktopRuntimeConfig(config);
  return assertLiveDesktopRuntimeStatus(await invoke("configure_live_desktop_background", { config }));
}

export async function startLiveDesktopBackground(): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return assertLiveDesktopRuntimeStatus(await invoke("start_live_desktop_background"));
}

export async function stopLiveDesktopBackground(): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return assertLiveDesktopRuntimeStatus(await invoke("stop_live_desktop_background"));
}

export async function setLiveDesktopBackgroundVisible(visible: boolean): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  return assertLiveDesktopRuntimeStatus(await invoke(
    "set_live_desktop_background_visible",
    { visible: Boolean(visible) },
  ));
}

export async function setMainWindowEffectsEnabled(
  enabled: boolean,
  openSequence: number | null = null,
  options: MainWindowEffectOptions = {},
): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_effects_enabled", {
    enabled,
    openSequence,
    material: options?.material,
    appearance: options?.appearance,
  });
  return true;
}

export async function setMainWindowMode(
  mode: LayoutSettings["windowMode"],
  options: MainWindowModeOptions = {},
): Promise<LayoutSettings["windowMode"] | null | false> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  const result = await invoke("set_main_window_mode", {
    mode,
    fullscreenOverscanEnabled: options?.fullscreenOverscanEnabled !== false,
  });
  if (result === null) return null;
  if (result !== "fullscreen" && result !== "windowed") {
    throw new TypeError("set_main_window_mode result must be fullscreen or windowed");
  }
  return result;
}

export async function setMainWindowShortcut(shortcut: string | null): Promise<string | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("set_main_window_shortcut", { shortcut });
  return result === null ? null : requireString(result, "set_main_window_shortcut result");
}

export async function setMainWindowShortcutCaptureActive(active: boolean): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_shortcut_capture_active", { active: Boolean(active) });
  return true;
}

export async function setLaunchpadIconVariant(
  variant: LayoutSettings["launchpadIconVariant"],
): Promise<LayoutSettings["launchpadIconVariant"] | null> {
  const invoke = getBridgeInvoke();
  if (!invoke) return null;
  const result = await invoke("set_launchpad_icon_variant", { variant });
  if (result !== "light" && result !== "dark" && result !== "pastelLight" && result !== "pastelDark") {
    throw new TypeError("set_launchpad_icon_variant result must be a supported variant");
  }
  return result;
}

export async function setMainWindowNativeFrameEnabled(
  enabled: boolean,
  openSequence: number | null = null,
): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_native_frame_enabled", {
    enabled: Boolean(enabled),
    openSequence: enabled ? null : requireMainWindowGeneration(openSequence, "openSequence"),
  });
  return true;
}

export async function openDeveloperConsole(): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("open_developer_console");
  return true;
}

export async function quitApp(): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("quit_app");
  return true;
}

export async function confirmQuitAfterSave(saved: boolean): Promise<boolean> {
  const invoke = getBridgeInvoke();
  if (!invoke) return false;
  await invoke("confirm_quit_after_save", { saved: Boolean(saved) });
  return true;
}
