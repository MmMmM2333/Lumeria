import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Graphics } from "pixi.js";
import type { NativePixiApplication } from "./native-app";
import { getNativePixiApplicationTesting } from "./native-app-testing";

/** Compare a presented transparent window against the same pixels with it hidden. */
export async function runTransparentClearSmoke(app: NativePixiApplication): Promise<void> {
  const marker = new Graphics().rect(5, 5, 10, 10).fill(0xffffff);
  app.stage.addChild(marker);
  app.setWindowPresentation("none", "dark");
  const frame = app.nextPresent(); app.invalidate(); await frame;
  const script = String.raw`
import ctypes as c,sys,time,json
from ctypes import wintypes as w
u=c.WinDLL('user32',use_last_error=True);g=c.WinDLL('gdi32',use_last_error=True)
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.GetAncestor.argtypes=[w.HWND,w.UINT];u.GetAncestor.restype=w.HWND
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
u.SetWindowPos.argtypes=[w.HWND,w.HWND,c.c_int,c.c_int,c.c_int,c.c_int,w.UINT]
u.ShowWindow.argtypes=[w.HWND,c.c_int]
u.CreateWindowExW.argtypes=[w.DWORD,w.LPCWSTR,w.LPCWSTR,w.DWORD,c.c_int,c.c_int,c.c_int,c.c_int,w.HWND,w.HMENU,w.HINSTANCE,c.c_void_p];u.CreateWindowExW.restype=w.HWND
u.DestroyWindow.argtypes=[w.HWND];u.UpdateWindow.argtypes=[w.HWND]
u.GetDC.argtypes=[w.HWND];u.GetDC.restype=w.HDC;u.ReleaseDC.argtypes=[w.HWND,w.HDC]
g.GetPixel.argtypes=[w.HDC,c.c_int,c.c_int];g.GetPixel.restype=w.DWORD
pid,h=int(sys.argv[1]),int(sys.argv[2]);h=u.GetAncestor(h,2)
owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Transparent probe owner changed')
r=w.RECT();u.GetWindowRect(h,c.byref(r))
# Owned STATIC SS_BLACKRECT supplies a uniform system-brush baseline behind the target.
back=u.CreateWindowExW(0x08000080,'STATIC','',0x90000004,r.left,r.top,r.right-r.left,r.bottom-r.top,None,None,None,None)
if not back:raise c.WinError(c.get_last_error())
dc=u.GetDC(None)
def pixel():
 value=g.GetPixel(dc,r.left+100,r.top+100)
 if value==0xffffffff:raise RuntimeError('Screen capture failed')
 return [value&255,(value>>8)&255,(value>>16)&255]
try:
 u.SetWindowPos(back,h,0,0,0,0,0x13);u.UpdateWindow(back);time.sleep(.25)
 shown=pixel();u.ShowWindow(h,0);time.sleep(.15);hidden=pixel()
finally:
 u.ShowWindow(h,8);u.DestroyWindow(back);u.ReleaseDC(None,dc)
print(json.dumps(dict(shown=shown,hidden=hidden)))
`;
  const child = spawn("python", ["-c", script, String(process.pid), String(getNativePixiApplicationTesting(app).handles().inputWindow)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { errors += chunk; });
  try {
    await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(errors))); });
    const sample = JSON.parse(output) as {shown:number[];hidden:number[]};
    console.log("Transparent window screen comparison", JSON.stringify(sample));
    assert.equal(sample.hidden[0], sample.hidden[1], "probe background must be uniform gray");
    assert.equal(sample.hidden[1], sample.hidden[2], "probe background must be uniform gray");
    assert.deepEqual(sample.shown, sample.hidden, "transparent clear must not add RGB to the desktop");
  } finally {
    marker.destroy(); app.invalidate();
  }
}
