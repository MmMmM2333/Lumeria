import {
  hideWindow,
  isWindowMaximized,
  minimizeWindow,
  normalizeWindowResizeDirection,
  setWindowChromeBridgeForTests,
  startWindowDrag,
  startWindowResize,
  toggleWindowMaximize,
} from "./windowChromeApi.js";

export async function runWindowChromeApiTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Window chrome API test failed] ${message}`);
  };

  assert(normalizeWindowResizeDirection("NorthWest") === "NorthWest", "known resize directions should pass through");
  assert(normalizeWindowResizeDirection("Center") === null, "unknown resize directions should be rejected");

  const calls = [];
  setWindowChromeBridgeForTests({
    minimize() {
      calls.push(["minimize"]);
    },
    startDragging() {
      calls.push(["drag"]);
    },
    startResizeDragging(direction) {
      calls.push(["resize", direction]);
    },
    toggleMaximize() {
      calls.push(["toggleMaximize"]);
    },
    isMaximized() {
      calls.push(["isMaximized"]);
      return true;
    },
  });

  assert(await startWindowDrag(), "dragging should use the bridge when available");
  assert(await startWindowResize("SouthEast"), "resizing should use the bridge when available");
  assert(await minimizeWindow(), "minimize should use the bridge when available");
  assert(await toggleWindowMaximize(), "toggle maximize should use the bridge when available");
  assert(await isWindowMaximized(), "maximize state should use the bridge when available");
  assert(!(await startWindowResize("Center")), "invalid resize directions should not call the bridge");
  assert(calls.length === 5, "only valid window chrome calls should reach the bridge");
  assert(calls[0][0] === "drag", "drag should call startDragging");
  assert(calls[1][0] === "resize" && calls[1][1] === "SouthEast", "resize should pass the requested direction");
  assert(calls[2][0] === "minimize", "minimize should call minimize");
  assert(calls[3][0] === "toggleMaximize", "maximize should call toggleMaximize");
  assert(calls[4][0] === "isMaximized", "maximize state should call isMaximized");

  setWindowChromeBridgeForTests(null);

  assert(!(await isWindowMaximized()), "maximize state should be false without a native bridge");
  assert(!(await hideWindow()), "hide should be a no-op without a native bridge");
}
