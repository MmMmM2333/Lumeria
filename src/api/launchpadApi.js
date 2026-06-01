import { convertFileSrc as tauriConvertFileSrc, invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

let bridgeOverride = null;

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
  try {
    return convertFileSrc(filePath);
  } catch {
    return null;
  }
}

export function isNativeBridgeAvailable() {
  return Boolean(getTauriBridge()?.invoke);
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
  if (Array.isArray(result)) {
    return { apps: result, warnings: [], stats: null };
  }
  return {
    apps: Array.isArray(result?.apps) ? result.apps : [],
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    stats: result?.stats || null,
  };
}

export async function loadLayout() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("load_layout");
}

export async function saveLayout(layout) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("save_layout", { layout });
}

export async function pickLaunchFile() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("pick_launch_file");
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

export async function loadCachedAppIcons(icons) {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  return invoke("load_cached_app_icons", { icons });
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
    launchTarget: app?.launchTarget || null,
    launchArgs: app?.launchTarget?.kind === "executable" && typeof app?.launchArgs === "string" ? app.launchArgs : "",
  };
}

export async function launchApp(app) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("launch_app", { request: makeLaunchAppRequest(app) });
  return true;
}

export async function hideMainWindow() {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("hide_main_window");
  return true;
}

export async function setMainWindowEffectsEnabled(enabled, openSequence = null) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("set_main_window_effects_enabled", { enabled, openSequence });
  return true;
}
