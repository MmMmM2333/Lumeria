import { convertFileSrc as tauriConvertFileSrc, invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { assertLayoutDocument } from "../domain/layoutDocument.js";

let bridgeOverride = null;

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
];

export function setLaunchpadApiBridgeForTests(bridge) {
  bridgeOverride = bridge || null;
}

function canUseTauriBridge() {
  if (typeof window === "undefined") return false;
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function getTauriBridge() {
  if (bridgeOverride) return bridgeOverride;
  if (!canUseTauriBridge()) return null;
  return {
    convertFileSrc: tauriConvertFileSrc,
    invoke: tauriInvoke,
    listen: tauriListen,
  };
}

function getTauriInvoke() {
  return getTauriBridge()?.invoke || null;
}

export function convertFilePathToAssetUrl(filePath) {
  const convertFileSrc = getTauriBridge()?.convertFileSrc;
  if (!convertFileSrc || !filePath) return null;
  return convertFileSrc(filePath);
}

export function isNativeBridgeAvailable() {
  return Boolean(getTauriBridge()?.invoke);
}

export async function getLaunchContext() {
  const invoke = getTauriInvoke();
  if (!invoke) return { origin: "manual" };
  return invoke("get_launch_context");
}

export async function completeRendererStartup() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("complete_renderer_startup");
}

export async function getAutostartStatus() {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("Autostart is unavailable in the current runtime");
  return Boolean(await invoke("get_autostart_status"));
}

export function isAutostartAvailable() {
  return isNativeBridgeAvailable();
}

export async function setAutostartEnabled(enabled) {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("Autostart is unavailable in the current runtime");
  return Boolean(await invoke("set_autostart_enabled", { enabled: Boolean(enabled) }));
}

export async function listenNativeEvent(eventName, handler) {
  const listen = getTauriBridge()?.listen;
  if (!listen) return null;
  return listen(eventName, handler);
}

export async function scanApps(roots = [], filters = {}) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return normalizeScanAppsResult(await invoke("scan_apps", { roots, filters }));
}

export function normalizeScanAppsResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
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
  if (!result.stats || typeof result.stats !== "object" || Array.isArray(result.stats)) {
    throw new TypeError("scan_apps result must include scan stats");
  }
  for (const field of SCAN_COUNT_STAT_FIELDS) {
    if (!Number.isSafeInteger(result.stats[field]) || result.stats[field] < 0) {
      throw new TypeError(`scan_apps result stats.${field} must be a non-negative safe integer`);
    }
  }
  if (typeof result.stats.limitReached !== "boolean") {
    throw new TypeError("scan_apps result stats.limitReached must be a boolean");
  }
  const keywordExcludedApps = result.keywordExcludedApps.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}] must be an object`);
    }
    if (!entry.app || typeof entry.app !== "object" || Array.isArray(entry.app)) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}].app must be an object`);
    }
    const matchedKeyword = String(entry.matchedKeyword || "").trim();
    if (!matchedKeyword) {
      throw new TypeError(`scan_apps result keywordExcludedApps[${index}].matchedKeyword must be a non-empty string`);
    }
    return { app: entry.app, matchedKeyword };
  });
  return {
    apps: result.apps,
    excludedApps: result.excludedApps,
    keywordExcludedApps,
    warnings: result.warnings,
    stats: result.stats,
  };
}

export async function loadLayout() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const layout = await invoke("load_layout");
  if (layout === null) return null;
  return assertLayoutDocument(layout);
}

export async function saveLayout(layout) {
  assertLayoutDocument(layout);
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("save_layout", { layout });
}

export async function getAppLocaleState() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("get_app_locale_state");
}

export async function applyAppLocalePreference(preference) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("apply_app_locale_preference", { preference });
}

export async function pickLaunchFile() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("pick_launch_file");
}

export async function pickBackgroundImage() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("pick_background_image");
}

export async function getDesktopWallpaperBackground() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("get_desktop_wallpaper_background");
}

export async function getBackgroundLayoutContext() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("get_background_layout_context");
}

export async function loadCachedBackgroundImageDataUrl(imagePath) {
  const invoke = getTauriInvoke();
  if (!invoke || !imagePath) return null;
  return invoke("load_cached_background_image_data_url", { imagePath });
}

export async function pickScanRootDirectory() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("pick_scan_root_directory");
}

export async function loadAppIconChoices(targetPath) {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  return invoke("load_app_icon_choices", { targetPath });
}

export async function cacheCustomIcon(dataUrl) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("cache_custom_icon", { dataUrl });
}

export async function checkLaunchTargets(targets) {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  return invoke("check_launch_targets", { targets });
}

function makeLaunchAppRequest(app) {
  return {
    id: String(app?.id || ""),
    name: String(app?.name || "Application"),
  };
}

export async function launchApp(app) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("launch_app", { request: makeLaunchAppRequest(app) });
  return true;
}

export async function showLaunchErrorMessage(error) {
  const invoke = getTauriInvoke();
  if (!invoke || !error) return false;
  await invoke("show_launch_error_message", { report: error });
  return true;
}

function requireMainWindowGeneration(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

export async function beginMainWindowClose(openSequence) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("begin_main_window_close", {
    openSequence: requireMainWindowGeneration(openSequence, "openSequence"),
  });
}

export async function hideMainWindow(generation) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return invoke("hide_main_window", {
    generation: requireMainWindowGeneration(generation, "generation"),
  });
}

export async function revealMainWindow(openSequence) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return invoke("reveal_main_window", {
    openSequence: requireMainWindowGeneration(openSequence, "openSequence"),
  });
}

export async function getMainWindowEffectsSupport() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("get_main_window_effects_support");
}

export async function getLiveDesktopBackgroundSupport() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("get_live_desktop_background_support");
}

export async function getLiveDesktopRuntimeStatus() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("get_live_desktop_runtime_status");
}

export async function configureLiveDesktopBackground(config) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("configure_live_desktop_background", { config });
}

export async function startLiveDesktopBackground() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("start_live_desktop_background");
}

export async function stopLiveDesktopBackground() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("stop_live_desktop_background");
}

export async function setLiveDesktopBackgroundVisible(visible) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("set_live_desktop_background_visible", { visible: Boolean(visible) });
}

export async function setMainWindowEffectsEnabled(enabled, openSequence = null, options = {}) {
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

export async function setMainWindowMode(mode, options = {}) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return invoke("set_main_window_mode", {
    mode,
    fullscreenOverscanEnabled: options?.fullscreenOverscanEnabled !== false,
  });
}

export async function setMainWindowShortcut(shortcut) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("set_main_window_shortcut", { shortcut });
}

export async function setMainWindowShortcutCaptureActive(active) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_shortcut_capture_active", { active: Boolean(active) });
  return true;
}

export async function setLaunchpadIconVariant(variant) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("set_launchpad_icon_variant", { variant });
}

export async function setMainWindowNativeFrameEnabled(enabled) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_native_frame_enabled", { enabled: Boolean(enabled) });
  return true;
}

export async function openDeveloperConsole() {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("open_developer_console");
  return true;
}

export async function quitApp() {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("quit_app");
  return true;
}

export async function confirmQuitAfterSave(saved) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("confirm_quit_after_save", { saved: Boolean(saved) });
  return true;
}
