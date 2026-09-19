import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { NativePixiApplication } from "./native-app";

// Only dismiss a common dialog belonging to this test process, never another application.
const dismissDialog = String.raw`
import ctypes as c, sys, time
from ctypes import wintypes as w
target, command = map(int, sys.argv[1:])
user = c.WinDLL('user32', use_last_error=True)
callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
user.EnumWindows.argtypes = [callback_type, w.LPARAM]
user.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
user.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
user.IsWindowVisible.argtypes = [w.HWND]
user.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
found = False
@callback_type
def visit(window, _):
 global found
 owner = w.DWORD()
 user.GetWindowThreadProcessId(window, c.byref(owner))
 if owner.value != target or not user.IsWindowVisible(window): return True
 name = c.create_unicode_buffer(64)
 user.GetClassNameW(window, name, 64)
 if name.value != '#32770': return True
 found = bool(user.PostMessageW(window, 0x111, command, 0))
 return False
deadline = time.monotonic() + 15
while time.monotonic() < deadline and not found:
 user.EnumWindows(visit, 0)
 if not found: time.sleep(0.05)
sys.exit(0 if found else 1)
`;

export async function runColorDialogSmoke(app: NativePixiApplication) {
  assert.equal(app.supportsColorDialog, true);
  for (const command of [1, 2]) {
    const child = spawn("python", ["-c", dismissDialog, String(process.pid), String(command)], {
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let errorText = "";
    child.stderr.on("data", chunk => { errorText += chunk; });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Color dialog helper failed (${code}): ${errorText}`)));
    });
    // Attach rejection handling before the synchronous Windows modal loop begins.
    const result = await Promise.all([app.chooseColor(0x123456), exited]);
    if (command === 1) assert.deepEqual(result[0], { ok: true, value: 0x123456 });
    else assert.ok(!result[0].ok && result[0].error.code === "CANCELLED");
  }
  console.log("Native system color dialog passed: RGB roundtrip and cancellation");
}
