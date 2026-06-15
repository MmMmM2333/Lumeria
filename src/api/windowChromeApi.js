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

export async function hideWindow() {
  return hideMainWindow();
}
