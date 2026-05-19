function getTauriInvoke() {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.core?.invoke || null;
}

export function isNativeBridgeAvailable() {
  return Boolean(getTauriInvoke());
}

export async function scanApps() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("scan_apps");
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

export async function launchApp(appId) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("launch_app", { appId });
  return true;
}
