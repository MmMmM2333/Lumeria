import { getCurrentWindow } from "@tauri-apps/api/window";
import { hideMainWindow, isNativeBridgeAvailable } from "./launchpadApi.js";

export const WINDOW_RESIZE_DIRECTIONS = Object.freeze([
  "North",
  "South",
  "West",
  "East",
  "NorthWest",
  "NorthEast",
  "SouthWest",
  "SouthEast",
]);

export const WINDOW_CHROME_STATE_CHANGE_EVENT = "launchpad-window-chrome-state-change";

const WINDOW_RESIZE_DIRECTION_SET = new Set(WINDOW_RESIZE_DIRECTIONS);

let windowChromeBridgeOverride = null;

export function setWindowChromeBridgeForTests(bridge) {
  windowChromeBridgeOverride = bridge || null;
}

function getWindowChromeBridge() {
  if (windowChromeBridgeOverride) return windowChromeBridgeOverride;
  if (!isNativeBridgeAvailable()) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function normalizeWindowResizeDirection(direction) {
  return WINDOW_RESIZE_DIRECTION_SET.has(direction) ? direction : null;
}

export async function startWindowDrag() {
  const bridge = getWindowChromeBridge();
  if (typeof bridge?.startDragging !== "function") return false;
  await bridge.startDragging();
  return true;
}

export async function startWindowResize(direction) {
  const nextDirection = normalizeWindowResizeDirection(direction);
  const bridge = getWindowChromeBridge();
  if (!nextDirection || typeof bridge?.startResizeDragging !== "function") return false;
  await bridge.startResizeDragging(nextDirection);
  return true;
}

export async function minimizeWindow() {
  const bridge = getWindowChromeBridge();
  if (typeof bridge?.minimize !== "function") return false;
  await bridge.minimize();
  return true;
}

export async function toggleWindowMaximize() {
  const bridge = getWindowChromeBridge();
  if (typeof bridge?.toggleMaximize !== "function") return false;
  await bridge.toggleMaximize();
  return true;
}

export function emitWindowChromeStateChange(detail = {}, target = globalThis.window) {
  if (!target || typeof target.dispatchEvent !== "function") return false;
  const event = typeof globalThis.CustomEvent === "function"
    ? new globalThis.CustomEvent(WINDOW_CHROME_STATE_CHANGE_EVENT, { detail })
    : { type: WINDOW_CHROME_STATE_CHANGE_EVENT, detail };
  target.dispatchEvent(event);
  return true;
}

export async function isWindowMaximized() {
  const bridge = getWindowChromeBridge();
  if (typeof bridge?.isMaximized !== "function") return false;
  return Boolean(await bridge.isMaximized());
}

export async function hideWindow() {
  return hideMainWindow();
}
