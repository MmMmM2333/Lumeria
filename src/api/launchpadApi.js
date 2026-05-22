function getTauriInvoke() {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.core?.invoke || null;
}

function getTauriEvent() {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.event || null;
}

export function isNativeBridgeAvailable() {
  return Boolean(getTauriInvoke());
}

export async function listenNativeEvent(eventName, handler) {
  const event = getTauriEvent();
  if (!event?.listen) return null;
  return event.listen(eventName, handler);
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

export async function pickLaunchFile() {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke("pick_launch_file");
}

export async function loadAppIconChoices(targetPath) {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  return invoke("load_app_icon_choices", { targetPath });
}

export async function launchApp(appId) {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke("launch_app", { appId });
  return true;
}
