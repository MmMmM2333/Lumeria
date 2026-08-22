import {
  emitWindowChromeStateChange,
  hideWindow,
  isWindowMaximized,
  minimizeWindow,
  normalizeWindowResizeDirection,
  setWindowChromeBridgeForTests,
  startWindowDrag,
  startWindowResize,
  toggleWindowMaximize,
  WINDOW_CHROME_STATE_CHANGE_EVENT,
} from "./windowChromeApi.js";
import type { WindowResizeDirection } from "./windowChromeApi.js";

export async function runWindowChromeApiTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Window chrome API test failed] ${message}`);
  };

  assert(normalizeWindowResizeDirection("NorthWest") === "NorthWest", "known resize directions should pass through");
  assert(normalizeWindowResizeDirection("Center") === null, "unknown resize directions should be rejected");

  type WindowChromeCall =
    | readonly ["drag" | "isMaximized" | "minimize" | "toggleMaximize"]
    | readonly ["resize", WindowResizeDirection];
  const calls: WindowChromeCall[] = [];
  const callAt = (index: number): WindowChromeCall => {
    const call = calls[index];
    if (!call) throw new Error(`[Window chrome API test failed] missing call ${index}`);
    return call;
  };
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
  assert(callAt(0)[0] === "drag", "drag should call startDragging");
  assert(callAt(1)[0] === "resize" && callAt(1)[1] === "SouthEast", "resize should pass the requested direction");
  assert(callAt(2)[0] === "minimize", "minimize should call minimize");
  assert(callAt(3)[0] === "toggleMaximize", "maximize should call toggleMaximize");
  assert(callAt(4)[0] === "isMaximized", "maximize state should call isMaximized");

  setWindowChromeBridgeForTests(null);

  const dispatched: Array<Event & Readonly<{ detail: Readonly<Record<string, unknown>> }>> = [];
  assert(emitWindowChromeStateChange({ reason: "unit-test" }, {
    dispatchEvent(event) {
      dispatched.push(event);
      return true;
    },
  }), "window chrome state change should dispatch through the provided target");
  const dispatchedEvent = dispatched[0];
  assert(dispatchedEvent !== undefined, "window chrome state change should produce an event");
  assert(dispatchedEvent.type === WINDOW_CHROME_STATE_CHANGE_EVENT, "window chrome state change should use the shared event name");
  assert(dispatchedEvent.detail.reason === "unit-test", "window chrome state change should preserve event details");
  assert(!emitWindowChromeStateChange({ reason: "missing-target" }, null), "missing event target should be ignored");

  assert(!(await isWindowMaximized()), "maximize state should be false without a native bridge");
  assert(!(await hideWindow()), "hide should be a no-op without a native bridge");
}
