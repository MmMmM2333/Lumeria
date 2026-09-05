import { getCurrentWindow } from "@tauri-apps/api/window";
import { isNativeBridgeAvailable } from "./launchpadApi.js";

import { WINDOW_RESIZE_DIRECTIONS, type WindowResizeDirection } from "../platform/windowChromeContracts.js";
export { WINDOW_RESIZE_DIRECTIONS, type WindowResizeDirection } from "../platform/windowChromeContracts.js";
type WindowChromeBridge = Readonly<{
  startDragging?: () => void | Promise<void>;
  startResizeDragging?: (direction: WindowResizeDirection) => void | Promise<void>;
  minimize?: () => void | Promise<void>;
  toggleMaximize?: () => void | Promise<void>;
  isMaximized?: () => boolean | Promise<boolean>;
}>;
type WindowChromeEventDetail = Readonly<Record<string, unknown>>;
type WindowChromeEvent = Event & Readonly<{ detail: WindowChromeEventDetail }>;
type WindowChromeEventTarget = Readonly<{
  dispatchEvent(event: WindowChromeEvent): unknown;
}>;

export const WINDOW_CHROME_STATE_CHANGE_EVENT = "lumeria-window-chrome-state-change";

const WINDOW_RESIZE_DIRECTION_SET = new Set(WINDOW_RESIZE_DIRECTIONS);

let windowChromeBridgeOverride: WindowChromeBridge | null = null;

export function setWindowChromeBridgeForTests(bridge: WindowChromeBridge | null | undefined): void {
  windowChromeBridgeOverride = bridge || null;
}

function getWindowChromeBridge(): WindowChromeBridge | null {
  if (windowChromeBridgeOverride) return windowChromeBridgeOverride;
  if (!isNativeBridgeAvailable()) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function normalizeWindowResizeDirection(direction: unknown): WindowResizeDirection | null {
  return typeof direction === "string" && WINDOW_RESIZE_DIRECTION_SET.has(direction as WindowResizeDirection)
    ? direction as WindowResizeDirection
    : null;
}

export async function startWindowDrag() {
  const bridge = getWindowChromeBridge();
  if (typeof bridge?.startDragging !== "function") return false;
  await bridge.startDragging();
  return true;
}

export async function startWindowResize(direction: unknown): Promise<boolean> {
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

export function emitWindowChromeStateChange(
  detail: WindowChromeEventDetail = {},
  target: WindowChromeEventTarget | null | undefined = globalThis.window,
): boolean {
  if (!target || typeof target.dispatchEvent !== "function") return false;
  const event: WindowChromeEvent = typeof globalThis.CustomEvent === "function"
    ? new globalThis.CustomEvent(WINDOW_CHROME_STATE_CHANGE_EVENT, { detail })
    : { type: WINDOW_CHROME_STATE_CHANGE_EVENT, detail } as WindowChromeEvent;
  target.dispatchEvent(event);
  return true;
}

export async function isWindowMaximized() {
  const bridge = getWindowChromeBridge();
  if (typeof bridge?.isMaximized !== "function") return false;
  return Boolean(await bridge.isMaximized());
}
