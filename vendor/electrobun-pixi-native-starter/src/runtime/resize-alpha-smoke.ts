import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { Graphics } from "pixi.js";
import type { NativePixiApplication } from "./native-app";
import { getNativePixiApplicationTesting } from "./native-app-testing";

/** Sample real DWM composition while translucent content changes surface generations. */
export async function runResizeAlphaSmoke(app: NativePixiApplication): Promise<void> {
  const output = process.env.PIXI_RESIZE_ALPHA_OUTPUT ?? "artifacts/resize-alpha";
  mkdirSync(output, { recursive: true });
  app.stage.addChild(new Graphics().rect(0, 0, 4000, 4000).fill({ color: 0xffffff, alpha: 0.5 }));
  app.stage.addChild(new Graphics().rect(0, 0, 4000, 48).fill(0x254f91));
  app.stage.eventMode = "static";
  const resize = () => app.startWindowResize("East");
  app.stage.on("pointerdown", resize);
  app.setWindowPresentation("acrylic", "dark");
  const frame = app.nextPresent(); app.invalidate(); await frame;
  const script = String.raw`
import ctypes as c,sys,time,json,threading
from ctypes import wintypes as w
u=c.WinDLL('user32',use_last_error=True);g=c.WinDLL('gdi32',use_last_error=True)
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetAncestor.argtypes=[w.HWND,w.UINT];u.GetAncestor.restype=w.HWND
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
u.SetWindowPos.argtypes=[w.HWND,w.HWND,c.c_int,c.c_int,c.c_int,c.c_int,w.UINT]
u.SetForegroundWindow.argtypes=[w.HWND];u.GetForegroundWindow.restype=w.HWND
u.SetCursorPos.argtypes=[c.c_int,c.c_int];u.GetCursorPos.argtypes=[c.POINTER(w.POINT)]
u.GetAsyncKeyState.argtypes=[c.c_int];u.GetAsyncKeyState.restype=c.c_short
class Mouse(c.Structure):
 _fields_=[('dx',w.LONG),('dy',w.LONG),('data',w.DWORD),('flags',w.DWORD),('time',w.DWORD),('extra',c.c_size_t)]
class Payload(c.Union): _fields_=[('mouse',Mouse)]
class Input(c.Structure): _fields_=[('type',w.DWORD),('payload',Payload)]
u.SendInput.argtypes=[w.UINT,c.POINTER(Input),c.c_int];u.SendInput.restype=w.UINT
def button(flags):
 item=Input(0,Payload(mouse=Mouse(0,0,0,flags,0,0)))
 if u.SendInput(1,c.byref(item),c.sizeof(item))!=1:raise c.WinError(c.get_last_error())
class GuiInfo(c.Structure):
 _fields_=[('size',w.DWORD),('flags',w.DWORD),('active',w.HWND),('focus',w.HWND),('capture',w.HWND),('menu',w.HWND),('moveSize',w.HWND),('caret',w.HWND),('rect',w.RECT)]
u.GetGUIThreadInfo.argtypes=[w.DWORD,c.POINTER(GuiInfo)]
u.GetDC.argtypes=[w.HWND];u.GetDC.restype=w.HDC
u.ReleaseDC.argtypes=[w.HWND,w.HDC]
g.GetPixel.argtypes=[w.HDC,c.c_int,c.c_int];g.GetPixel.restype=w.DWORD
pid,h=int(sys.argv[1]),int(sys.argv[2]);h=u.GetAncestor(h,2)
owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Resize probe owner changed')
thread=u.GetWindowThreadProcessId(h,None)
def moving():
 info=GuiInfo();info.size=c.sizeof(info)
 if not u.GetGUIThreadInfo(thread,c.byref(info)):raise c.WinError(c.get_last_error())
 return bool(info.flags&2) and info.moveSize==h
r=w.RECT();u.GetWindowRect(h,c.byref(r));original=(r.left,r.top,r.right-r.left,r.bottom-r.top)
u.SetForegroundWindow(h);time.sleep(.4)
if u.GetForegroundWindow()!=h:raise RuntimeError('Resize probe not foreground')
if u.GetAsyncKeyState(1)<0:raise RuntimeError('Mouse already held')
cursor=w.POINT();u.GetCursorPos(c.byref(cursor))
dc=u.GetDC(None);samples=[];phase='before';done=False;errors=[];observedResize=False
def sample():
 color=g.GetPixel(dc,original[0]+100,original[1]+100)
 if color==0xffffffff:raise RuntimeError('Cannot capture screen pixel')
 samples.append(dict(phase=phase,rgb=[color&255,(color>>8)&255,(color>>16)&255],time=time.perf_counter()))
def resize():
 global phase,done,observedResize
 time.sleep(.2);phase='resizing'
 try:
  for step in range(100):
   dw=(step%20 if (step//20)%2==0 else 20-step%20)*8
   if not u.SetWindowPos(h,None,original[0],original[1],original[2]+dw,original[3]+dw//2,0x14):raise c.WinError(c.get_last_error())
   time.sleep(.012)
  u.SetWindowPos(h,None,*original,0x14);time.sleep(.3)
  phase='mouse-resizing'
  x,y=original[0]+original[2]-4,original[1]+original[3]//2
  u.SetCursorPos(x,y);time.sleep(.05);button(2)
  deadline=time.monotonic()+3
  while not moving():
   if time.monotonic()>deadline:raise RuntimeError('Did not enter native resize loop')
   time.sleep(.01)
  for step in range(80):
   if u.GetForegroundWindow()!=h:raise RuntimeError('Resize probe lost foreground')
   dw=(step%20 if (step//20)%2==0 else 20-step%20)*8
   u.SetCursorPos(x+dw,y);time.sleep(.012)
  u.GetWindowRect(h,c.byref(r));observedResize=r.right-r.left!=original[2]
 except Exception as error:errors.append(str(error))
 finally:
  button(4)
  u.SetWindowPos(h,None,*original,0x14);phase='settling';time.sleep(.5);done=True
worker=threading.Thread(target=resize);worker.start()
try:
 while not done:sample();time.sleep(.002)
finally:
 worker.join();u.ReleaseDC(None,dc);u.SetCursorPos(cursor.x,cursor.y)
if errors:raise RuntimeError('; '.join(errors))
if not observedResize:raise RuntimeError('Mouse resize did not change frame')
print(json.dumps(samples))
`;
  const child = spawn("python", ["-c", script, String(process.pid), String(getNativePixiApplicationTesting(app).handles().inputWindow)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let outputText = "", errors = "";
  child.stdout.on("data", chunk => { outputText += chunk; }); child.stderr.on("data", chunk => { errors += chunk; });
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(errors))); });
  app.stage.off("pointerdown", resize);
  const samples = JSON.parse(outputText) as {phase:string;rgb:number[]}[];
  writeFileSync(`${output}/samples.json`, JSON.stringify(samples, null, 2));
  const baseline = samples.filter(sample => sample.phase === "before");
  assert.ok(baseline.length > 2);
  const reference = baseline[baseline.length - 1]!.rgb;
  const differences = samples.map(sample => Math.max(...sample.rgb.map((value, index) => Math.abs(value - reference[index]!))));
  const maximum = Math.max(...differences);
  console.log(JSON.stringify({ samples: samples.length, reference, maximum, unstable: differences.filter(value => value > 4).length }));
  assert.ok(maximum <= 4, `Translucent resize changed screen brightness by ${maximum}`);
}
