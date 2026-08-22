import { convertFileSrc as tauriConvertFileSrc, invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { assertLayoutDocument, type LayoutDocument, type LayoutSettings } from "../domain/layoutDocument.js";

type UnknownRecord = Readonly<Record<string, unknown>>;
type NativeInvoke = (command: string, args?: UnknownRecord) => Promise<unknown>;
type NativeEventHandler = (event: unknown) => void;
type Unlisten = () => void;

export type LaunchpadApiBridge = Readonly<{
  convertFileSrc?: (filePath: string) => string;
  invoke?: NativeInvoke;
  listen?: (eventName: string, handler: NativeEventHandler) => Promise<Unlisten>;
}>;

export type LaunchContext = Readonly<{ origin: "loginStartup" | "manual" }>;
export type NativeLocaleState = Readonly<{
  preference: string;
  resolvedLocale: "zh-CN" | "en-US";
  match: "default" | "exact" | "explicit" | "language";
  issue: Readonly<{ code: "unsupportedPreference"; value: string }> | null;
}>;
export type ScanStats = Readonly<{
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
  app: UnknownRecord;
  matchedKeyword: string;
}>;
export type ScanAppsResult = Readonly<{
  apps: readonly unknown[];
  excludedApps: readonly unknown[];
  keywordExcludedApps: readonly KeywordExcludedApp[];
  warnings: readonly unknown[];
  stats: ScanStats;
}>;
export type PickedLaunchFile = Readonly<{
  name: string;
  path: string;
  launchTarget: UnknownRecord;
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
export type AppIconChoice = Readonly<{ id: string; iconPath: string; iconDataUrl: string }>;
export type CachedCustomIconResult = Readonly<{ iconPath: string; iconDataUrl: string }>;
export type LaunchTargetCheckResult = Readonly<{ id: string; status: string }>;
export type MainWindowCloseTransition = Readonly<{ accepted: boolean; generation: number }>;
export type MainWindowEffectsSupport = Readonly<{
  platform: string;
  build: number | null;
  supportsAcrylic: boolean;
  supportsMica: boolean;
  supportsMicaAlt: boolean;
}>;
export type LiveDesktopBackgroundSupport = Readonly<{
  platform: string;
  supportsLiveDesktopBackground: boolean;
  supportsLiveDesktopBackgroundEffects: boolean;
  reason: string;
  detail?: string;
  prerequisiteProbe?: UnknownRecord;
  rendererProbe?: UnknownRecord;
}>;
export type LiveDesktopRuntimeStatus = Readonly<{
  phase: string;
  active: boolean;
  generation: number;
  reason: string;
  detail: string;
  diagnostics?: UnknownRecord;
  windowDiagnostics?: UnknownRecord;
}>;
export type MainWindowEffectOptions = Readonly<{
  material?: LayoutSettings["windowEffectMaterial"];
  appearance?: LayoutSettings["windowEffectAppearance"];
}>;
export type MainWindowModeOptions = Readonly<{ fullscreenOverscanEnabled?: boolean }>;

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

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, label);
}

export function setLaunchpadApiBridgeForTests(bridge: LaunchpadApiBridge | null | undefined): void {
  bridgeOverride = bridge || null;
}

function canUseTauriBridge(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function getTauriBridge(): LaunchpadApiBridge | null {
  if (bridgeOverride) return bridgeOverride;
  if (!canUseTauriBridge()) return null;
  return {
    convertFileSrc: tauriConvertFileSrc,
    invoke: (command, args) => tauriInvoke<unknown>(command, args),
    listen: (eventName, handler) => tauriListen<unknown>(eventName, handler),
  };
}

function getTauriInvoke(): NativeInvoke | null {
  return getTauriBridge()?.invoke || null;
}

export function convertFilePathToAssetUrl(filePath: string | null | undefined): string | null {
  const convertFileSrc = getTauriBridge()?.convertFileSrc;
  if (!convertFileSrc || !filePath) return null;
  return convertFileSrc(filePath);
}

export function isNativeBridgeAvailable() {
  return Boolean(getTauriBridge()?.invoke);
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
    if (issueRecord.code !== "unsupportedPreference") {
      throw new TypeError("locale state.issue.code must be unsupportedPreference");
    }
    requireString(issueRecord.value, "locale state.issue.value");
  }
  return record as NativeLocaleState;
}

export async function getLaunchContext(): Promise<LaunchContext> {
  const invoke = getTauriInvoke();
  if (!invoke) return { origin: "manual" };
  return validateLaunchContext(await invoke("get_launch_context"));
}

export async function completeRendererStartup(): Promise<unknown | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("complete_renderer_startup");
}

export async function getAutostartStatus(): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("Autostart is unavailable in the current runtime");
  return requireBoolean(await invoke("get_autostart_status"), "get_autostart_status result");
}

export function isAutostartAvailable() {
  return isNativeBridgeAvailable();
}

export async function setAutostartEnabled(enabled: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("Autostart is unavailable in the current runtime");
  return requireBoolean(
    await invoke("set_autostart_enabled", { enabled: Boolean(enabled) }),
    "set_autostart_enabled result",
  );
}

export async function listenNativeEvent(eventName: string, handler: NativeEventHandler): Promise<Unlisten | null> {
  const listen = getTauriBridge()?.listen;
  if (!listen) return null;
  return listen(eventName, handler);
}

export async function scanApps(
  roots: readonly unknown[] = [],
  filters: UnknownRecord = {},
): Promise<ScanAppsResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
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
  const keywordExcludedApps = result.keywordExcludedApps.map((entry, index): KeywordExcludedApp => {
    if (!isRecord(entry)) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}] must be an object`);
    }
    if (!isRecord(entry.app)) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}].app must be an object`);
    }
    const matchedKeyword = String(entry.matchedKeyword || "").trim();
    if (!matchedKeyword) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}].matchedKeyword must be a non-empty string`);
    }
    return { app: entry.app, matchedKeyword };
  });
  const stats = result.stats as ScanStats;
  return {
    apps: result.apps,
    excludedApps: result.excludedApps,
    keywordExcludedApps,
    warnings: result.warnings,
    stats,
  };
}

export async function loadLayout(): Promise<LayoutDocument | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const layout = await invoke("load_layout");
  if (layout === null) return null;
  return assertLayoutDocument(layout);
}

export async function saveLayout(layout: LayoutDocument): Promise<unknown | null> {
  assertLayoutDocument(layout);
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("save_layout", { layout });
}

export async function getAppLocaleState(): Promise<NativeLocaleState | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateNativeLocaleState(await invoke("get_app_locale_state"));
}

export async function applyAppLocalePreference(preference: string): Promise<NativeLocaleState | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateNativeLocaleState(await invoke("apply_app_locale_preference", { preference }));
}

function validatePickedLaunchFile(value: unknown): PickedLaunchFile {
  const record = requireRecord(value, "picked launch file");
  requireString(record.name, "picked launch file.name");
  requireString(record.path, "picked launch file.path");
  requireRecord(record.launchTarget, "picked launch file.launchTarget");
  requireString(record.launchArgs, "picked launch file.launchArgs");
  optionalString(record.iconPath, "picked launch file.iconPath");
  optionalString(record.iconDataUrl, "picked launch file.iconDataUrl");
  return record as PickedLaunchFile;
}

function validatePickedBackgroundImage(value: unknown): PickedBackgroundImage {
  const record = requireRecord(value, "picked background image");
  requireString(record.name, "picked background image.name");
  requireString(record.imagePath, "picked background image.imagePath");
  return record as PickedBackgroundImage;
}

export async function pickLaunchFile(): Promise<PickedLaunchFile | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("pick_launch_file");
  return result === null ? null : validatePickedLaunchFile(result);
}

export async function pickBackgroundImage(): Promise<PickedBackgroundImage | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("pick_background_image");
  return result === null ? null : validatePickedBackgroundImage(result);
}

export async function getDesktopWallpaperBackground(): Promise<PickedBackgroundImage | null> {
  const invoke = getTauriInvoke();
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
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("get_background_layout_context");
  return result === null ? null : validateBackgroundLayoutContext(result);
}

export async function loadCachedBackgroundImageDataUrl(imagePath: string | null | undefined): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke || !imagePath) return null;
  const result = await invoke("load_cached_background_image_data_url", { imagePath });
  return result === null ? null : requireString(result, "cached background image data URL");
}

export async function pickScanRootDirectory(): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("pick_scan_root_directory");
  return result === null ? null : requireString(result, "picked scan root directory");
}

function validateAppIconChoice(value: unknown, index: number): AppIconChoice {
  const record = requireRecord(value, `app icon choices[${index}]`);
  requireString(record.id, `app icon choices[${index}].id`);
  requireString(record.iconPath, `app icon choices[${index}].iconPath`);
  requireString(record.iconDataUrl, `app icon choices[${index}].iconDataUrl`);
  return record as AppIconChoice;
}

export async function loadAppIconChoices(targetPath: string): Promise<readonly AppIconChoice[]> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  const result = await invoke("load_app_icon_choices", { targetPath });
  if (!Array.isArray(result)) throw new TypeError("load_app_icon_choices result must be an array");
  result.forEach(validateAppIconChoice);
  return result as readonly AppIconChoice[];
}

export async function cacheCustomIcon(dataUrl: string): Promise<CachedCustomIconResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("cache_custom_icon", { dataUrl });
  if (result === null) return null;
  const record = requireRecord(result, "cache_custom_icon result");
  requireString(record.iconPath, "cache_custom_icon result.iconPath");
  requireString(record.iconDataUrl, "cache_custom_icon result.iconDataUrl");
  return record as CachedCustomIconResult;
}

export async function checkLaunchTargets(targets: readonly unknown[]): Promise<readonly LaunchTargetCheckResult[]> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  const result = await invoke("check_launch_targets", { targets });
  if (!Array.isArray(result)) throw new TypeError("check_launch_targets result must be an array");
  result.forEach((entry, index) => {
    const record = requireRecord(entry, `check_launch_targets result[${index}]`);
    requireString(record.id, `check_launch_targets result[${index}].id`);
    requireString(record.status, `check_launch_targets result[${index}].status`);
  });
  return result as readonly LaunchTargetCheckResult[];
}

function makeLaunchAppRequest(app: UnknownRecord) {
  return {
    id: String(app?.id || ""),
    name: String(app?.name || "Application"),
  };
}

export async function launchApp(app: UnknownRecord): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("launch_app", { request: makeLaunchAppRequest(app) });
  return true;
}

export async function showLaunchErrorMessage(error: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke || !error) return false;
  await invoke("show_launch_error_message", { report: error });
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

export async function beginMainWindowClose(openSequence: unknown): Promise<MainWindowCloseTransition | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateMainWindowCloseTransition(await invoke("begin_main_window_close", {
    openSequence: requireMainWindowGeneration(openSequence, "openSequence"),
  }));
}

export async function hideMainWindow(generation?: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return requireBoolean(await invoke("hide_main_window", {
    generation: requireMainWindowGeneration(generation, "generation"),
  }), "hide_main_window result");
}

export async function revealMainWindow(openSequence: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
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
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateMainWindowEffectsSupport(await invoke("get_main_window_effects_support"));
}

function validateLiveDesktopBackgroundSupport(value: unknown): LiveDesktopBackgroundSupport {
  const record = requireRecord(value, "live desktop background support");
  requireString(record.platform, "live desktop background support.platform");
  requireBoolean(record.supportsLiveDesktopBackground, "live desktop background support.supportsLiveDesktopBackground");
  requireBoolean(record.supportsLiveDesktopBackgroundEffects, "live desktop background support.supportsLiveDesktopBackgroundEffects");
  requireString(record.reason, "live desktop background support.reason");
  if (record.detail !== undefined) requireString(record.detail, "live desktop background support.detail");
  if (record.prerequisiteProbe !== undefined) {
    requireRecord(record.prerequisiteProbe, "live desktop background support.prerequisiteProbe");
  }
  if (record.rendererProbe !== undefined) {
    requireRecord(record.rendererProbe, "live desktop background support.rendererProbe");
  }
  return record as LiveDesktopBackgroundSupport;
}

function validateLiveDesktopRuntimeStatus(value: unknown): LiveDesktopRuntimeStatus {
  const record = requireRecord(value, "live desktop runtime status");
  requireString(record.phase, "live desktop runtime status.phase");
  requireBoolean(record.active, "live desktop runtime status.active");
  requireNonNegativeSafeInteger(record.generation, "live desktop runtime status.generation");
  requireString(record.reason, "live desktop runtime status.reason");
  requireString(record.detail, "live desktop runtime status.detail");
  if (record.diagnostics !== undefined) requireRecord(record.diagnostics, "live desktop runtime status.diagnostics");
  if (record.windowDiagnostics !== undefined) {
    requireRecord(record.windowDiagnostics, "live desktop runtime status.windowDiagnostics");
  }
  return record as LiveDesktopRuntimeStatus;
}

export async function getLiveDesktopBackgroundSupport(): Promise<LiveDesktopBackgroundSupport | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateLiveDesktopBackgroundSupport(await invoke("get_live_desktop_background_support"));
}

export async function getLiveDesktopRuntimeStatus(): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateLiveDesktopRuntimeStatus(await invoke("get_live_desktop_runtime_status"));
}

export async function configureLiveDesktopBackground(config: UnknownRecord): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateLiveDesktopRuntimeStatus(await invoke("configure_live_desktop_background", { config }));
}

export async function startLiveDesktopBackground(): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateLiveDesktopRuntimeStatus(await invoke("start_live_desktop_background"));
}

export async function stopLiveDesktopBackground(): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateLiveDesktopRuntimeStatus(await invoke("stop_live_desktop_background"));
}

export async function setLiveDesktopBackgroundVisible(visible: unknown): Promise<LiveDesktopRuntimeStatus | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return validateLiveDesktopRuntimeStatus(await invoke(
    "set_live_desktop_background_visible",
    { visible: Boolean(visible) },
  ));
}

export async function setMainWindowEffectsEnabled(
  enabled: boolean,
  openSequence: number | null = null,
  options: MainWindowEffectOptions = {},
): Promise<boolean> {
  const invoke = getTauriInvoke();
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
  const invoke = getTauriInvoke();
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
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("set_main_window_shortcut", { shortcut });
  return result === null ? null : requireString(result, "set_main_window_shortcut result");
}

export async function setMainWindowShortcutCaptureActive(active: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_shortcut_capture_active", { active: Boolean(active) });
  return true;
}

export async function setLaunchpadIconVariant(
  variant: LayoutSettings["launchpadIconVariant"],
): Promise<LayoutSettings["launchpadIconVariant"] | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const result = await invoke("set_launchpad_icon_variant", { variant });
  if (result !== "light" && result !== "dark" && result !== "pastelLight" && result !== "pastelDark") {
    throw new TypeError("set_launchpad_icon_variant result must be a supported variant");
  }
  return result;
}

export async function setMainWindowNativeFrameEnabled(enabled: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_native_frame_enabled", { enabled: Boolean(enabled) });
  return true;
}

export async function openDeveloperConsole(): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("open_developer_console");
  return true;
}

export async function quitApp(): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("quit_app");
  return true;
}

export async function confirmQuitAfterSave(saved: unknown): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("confirm_quit_after_save", { saved: Boolean(saved) });
  return true;
}
