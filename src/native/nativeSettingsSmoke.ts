import { spawn } from "node:child_process";

/** Acrylic-only probe: supplies a red/blue backdrop, cycles focus and checks native composition. */
export async function cycleOwnedWindowFocus(handle:number,path?:string,transparent=false):Promise<void>{
  const script=String.raw`
import ctypes as c,sys,time
from ctypes import wintypes as w
pid,h=map(int,sys.argv[1:3]);u=c.WinDLL('user32',use_last_error=True)
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.GetAncestor.argtypes=[w.HWND,w.UINT];u.GetAncestor.restype=w.HWND
u.GetForegroundWindow.restype=w.HWND;u.SetForegroundWindow.argtypes=[w.HWND]
u.CreateWindowExW.argtypes=[w.DWORD,w.LPCWSTR,w.LPCWSTR,w.DWORD,c.c_int,c.c_int,c.c_int,c.c_int,w.HWND,w.HMENU,w.HINSTANCE,c.c_void_p];u.CreateWindowExW.restype=w.HWND
u.ShowWindow.argtypes=[w.HWND,c.c_int];u.DestroyWindow.argtypes=[w.HWND]
owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Focus probe target owner changed')
root=u.GetAncestor(h,2)
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)];r=w.RECT();u.GetWindowRect(root,c.byref(r))
probe=u.CreateWindowExW(0,'STATIC','Acrylic focus regression',0x90000000,r.left,r.top,r.right-r.left,r.bottom-r.top,None,None,None,None)
if not probe:raise c.WinError(c.get_last_error())
try:
 u.ShowWindow(probe,5);u.SetForegroundWindow(probe);time.sleep(.3)
 if u.GetForegroundWindow()!=probe:raise RuntimeError('Test window did not acquire foreground')
 g=c.WinDLL('gdi32');u.GetDC.argtypes=[w.HWND];u.GetDC.restype=w.HDC;u.ReleaseDC.argtypes=[w.HWND,w.HDC]
 u.FillRect.argtypes=[w.HDC,c.POINTER(w.RECT),w.HBRUSH];g.CreateSolidBrush.argtypes=[w.DWORD];g.CreateSolidBrush.restype=w.HBRUSH;g.DeleteObject.argtypes=[w.HGDIOBJ]
 dc=u.GetDC(probe)
 if not dc:raise RuntimeError('Test background DC unavailable')
 try:
  for box,color in [(w.RECT(0,0,(r.right-r.left)//2,r.bottom-r.top),0x302ce7),(w.RECT((r.right-r.left)//2,0,r.right-r.left,r.bottom-r.top),0xe97623)]:
   brush=g.CreateSolidBrush(color)
   if not brush:raise RuntimeError('Test background brush unavailable')
   try:
    if not u.FillRect(dc,c.byref(box),brush):raise RuntimeError('Test background draw failed')
   finally:g.DeleteObject(brush)
 finally:u.ReleaseDC(probe,dc)
 u.SetForegroundWindow(root);time.sleep(.35)
 if u.GetForegroundWindow()!=root:raise RuntimeError('Native window did not reacquire foreground')
 if len(sys.argv)>3:
  from PIL import ImageGrab,ImageStat
  image=ImageGrab.grab(bbox=(r.left,r.top,r.right,r.bottom),all_screens=True,include_layered_windows=True).convert('RGB');image.save(sys.argv[3])
  width,height=image.size
  left=ImageStat.Stat(image.crop((width//8,height//2,width//3,height*3//4))).mean
  right=ImageStat.Stat(image.crop((width*2//3,height//2,width*7//8,height*3//4))).mean
  if left[0]-left[2]<20 or right[2]-right[0]<20:raise RuntimeError(f'Acrylic reverted to opaque fallback: {left}, {right}')
  if len(sys.argv)>4:
   for actual,expected in [(left,[231,44,48]),(right,[35,118,233])]:
    if max(abs(a-b) for a,b in zip(actual,expected))>3:raise RuntimeError(f'Transparent window changed background pixels: {actual}, expected {expected}')
finally:u.DestroyWindow(probe)
`;
  const child=spawn("python",["-c",script,String(process.pid),String(handle),...(path?[path]:[]),...(transparent?["transparent"]:[])],{windowsHide:true,stdio:["ignore","ignore","pipe"]});
  let errors="";child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(errors)));});
}

// Common-dialog interaction is scoped to the smoke worker's PID and window class.
// This helper never searches for or dismisses another application's dialog.
const colorResponse=String.raw`
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

export function respondToOwnedColorDialog(command:1|2):Promise<void>{
  const child=spawn("python",["-c",colorResponse,String(process.pid),String(command)],{
    windowsHide:true,stdio:["ignore","pipe","pipe"],
  });
  let errors="";
  child.stderr.on("data",chunk=>{errors+=chunk;});
  const result=new Promise<void>((resolve,reject)=>{
    child.once("error",reject);
    child.once("exit",code=>code===0?resolve():reject(new Error(`Owned color dialog helper failed (${code}): ${errors}`)));
  });
  // The Windows modal loop can block the worker before its await is reached.
  void result.catch(()=>{});
  return result;
}

// Integration test only: real Windows mouse input, gated to this worker's HWND.
// https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput
const mouseDrag=String.raw`
import ctypes as c, sys, time
from ctypes import wintypes as w
target, handle, x, y, dx, dy = map(int, sys.argv[1:7])
operation = sys.argv[7] if len(sys.argv)>7 else 'drag'
click = operation != 'drag'
user=c.WinDLL('user32',use_last_error=True)
user.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p]
user.SetThreadDpiAwarenessContext(c.c_void_p(-4))
user.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
user.GetAncestor.argtypes=[w.HWND,w.UINT];user.GetAncestor.restype=w.HWND
user.GetForegroundWindow.restype=w.HWND
user.SetForegroundWindow.argtypes=[w.HWND]
user.WindowFromPoint.argtypes=[w.POINT];user.WindowFromPoint.restype=w.HWND
user.SetCursorPos.argtypes=[c.c_int,c.c_int]
user.GetCursorPos.argtypes=[c.POINTER(w.POINT)]
user.GetAsyncKeyState.argtypes=[c.c_int];user.GetAsyncKeyState.restype=c.c_short
owner=w.DWORD();user.GetWindowThreadProcessId(handle,c.byref(owner))
if owner.value!=target: raise RuntimeError('Input HWND does not belong to the smoke worker')
root=user.GetAncestor(handle,2)
thread=user.GetWindowThreadProcessId(root,None)
class GuiInfo(c.Structure):
 _fields_=[('size',w.DWORD),('flags',w.DWORD),('active',w.HWND),('focus',w.HWND),('capture',w.HWND),
  ('menu',w.HWND),('moveSize',w.HWND),('caret',w.HWND),('rect',w.RECT)]
user.GetGUIThreadInfo.argtypes=[w.DWORD,c.POINTER(GuiInfo)]
def moving():
 info=GuiInfo();info.size=c.sizeof(info)
 if not user.GetGUIThreadInfo(thread,c.byref(info)):raise c.WinError(c.get_last_error())
 return bool(info.flags&2) and info.moveSize==root
if user.GetAsyncKeyState(1)<0: raise RuntimeError('Mouse is already held; not starting the test drag')
user.SetForegroundWindow(root);time.sleep(.12)
if user.GetForegroundWindow()!=root: raise RuntimeError('Smoke window could not acquire foreground')
if user.GetAncestor(user.WindowFromPoint(w.POINT(x,y)),2)!=root: raise RuntimeError('Drag start is outside the owned window')
class Mouse(c.Structure):
 _fields_=[('dx',w.LONG),('dy',w.LONG),('data',w.DWORD),('flags',w.DWORD),('time',w.DWORD),('extra',c.c_size_t)]
class Payload(c.Union): _fields_=[('mouse',Mouse)]
class Input(c.Structure): _fields_=[('type',w.DWORD),('payload',Payload)]
user.SendInput.argtypes=[w.UINT,c.POINTER(Input),c.c_int];user.SendInput.restype=w.UINT
assert c.sizeof(Input)==40
def button(flags):
 item=Input(0,Payload(mouse=Mouse(0,0,0,flags,0,0)))
 if user.SendInput(1,c.byref(item),c.sizeof(item))!=1: raise c.WinError(c.get_last_error())
probe=None
if operation in ('activation-click','programmatic-click'):
 user.CreateWindowExW.argtypes=[w.DWORD,w.LPCWSTR,w.LPCWSTR,w.DWORD,c.c_int,c.c_int,c.c_int,c.c_int,w.HWND,w.HMENU,w.HINSTANCE,c.c_void_p];user.CreateWindowExW.restype=w.HWND
 user.DestroyWindow.argtypes=[w.HWND]
 probe=user.CreateWindowExW(0,'STATIC','LaunchPad activation probe',0x90000000,x-100,y-70,80,40,None,None,None,None)
 if not probe:raise c.WinError(c.get_last_error())
 user.SetForegroundWindow(probe);time.sleep(.15)
 if user.GetForegroundWindow()!=probe:
  user.DestroyWindow(probe);raise RuntimeError('Activation probe did not acquire foreground')
 if operation=='programmatic-click':
  user.SetForegroundWindow(root);time.sleep(.15)
  if user.GetForegroundWindow()!=root:
   user.DestroyWindow(probe);raise RuntimeError('Programmatic focus did not return to owned window')
user.SetCursorPos(x,y);time.sleep(.06)
try:
 if user.GetAncestor(user.WindowFromPoint(w.POINT(x,y)),2)!=root:raise RuntimeError('Input point no longer belongs to the owned window')
 button(2)
 try:
  if click:
   time.sleep(.05)
  else:
   deadline=time.monotonic()+3
   while not moving():
    if time.monotonic()>deadline:raise RuntimeError('Owned window did not enter the OS move/size loop')
    time.sleep(.01)
   for step in range(1,13):
    if user.GetForegroundWindow()!=root: raise RuntimeError('Foreground changed during the test drag')
    if not user.SetCursorPos(x+round(dx*step/12),y+round(dy*step/12)): raise c.WinError(c.get_last_error())
    time.sleep(.025)
 finally: button(4)
 time.sleep(.1)
finally:
 if probe:user.DestroyWindow(probe)
deadline=time.monotonic()+3
while moving():
 if time.monotonic()>deadline:raise RuntimeError('Owned window did not leave the OS move/size loop')
 time.sleep(.01)
`;

async function sendOwnedMouse(inputWindow:number,point:{x:number;y:number},delta:{x:number;y:number},operation:"drag"|"click"|"activation-click"|"programmatic-click"):Promise<void>{
  const child=spawn("python",["-c",mouseDrag,String(process.pid),String(inputWindow),
    ...[point.x,point.y,delta.x,delta.y].map(value=>String(Math.round(value))),operation],{
    windowsHide:true,stdio:["ignore","pipe","pipe"],
  });
  let errors="";child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{
    child.once("error",reject);
    child.once("exit",code=>code===0?resolve():reject(new Error(`Owned window mouse drag failed (${code}): ${errors}`)));
  });
}

export const dragOwnedNativeWindow=(inputWindow:number,point:{x:number;y:number},delta:{x:number;y:number})=>sendOwnedMouse(inputWindow,point,delta,"drag");
export const clickOwnedNativeWindow=(inputWindow:number,point:{x:number;y:number})=>sendOwnedMouse(inputWindow,point,{x:0,y:0},"click");
export const activationClickOwnedNativeWindow=(inputWindow:number,point:{x:number;y:number},programmatic=false)=>sendOwnedMouse(inputWindow,point,{x:0,y:0},programmatic?"programmatic-click":"activation-click");

export async function captureOwnedWindow(inputWindow:number,path?:string):Promise<{
  material:number;style:string;borderColor:number|null;borderColorReadStatus:number;dpi:number;frame:number[];client:number[];surfaces:number[][];
}>{
  const script=String.raw`
import ctypes as c,sys,json,time
from ctypes import wintypes as w
pid,h=int(sys.argv[1]),int(sys.argv[2]);u=c.WinDLL('user32');d=c.WinDLL('dwmapi')
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)];u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
u.GetWindowLongPtrW.argtypes=[w.HWND,c.c_int];u.GetWindowLongPtrW.restype=c.c_ssize_t
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetClientRect.argtypes=[w.HWND,c.POINTER(w.RECT)];u.ClientToScreen.argtypes=[w.HWND,c.POINTER(w.POINT)]
u.GetDpiForWindow.argtypes=[w.HWND];u.GetClassNameW.argtypes=[w.HWND,w.LPWSTR,c.c_int]
d.DwmGetWindowAttribute.argtypes=[w.HWND,w.DWORD,c.c_void_p,w.DWORD]
owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Screenshot window owner changed')
material=c.c_int();d.DwmGetWindowAttribute(h,38,c.byref(material),4)
if len(sys.argv)>3:
 from PIL import ImageGrab
 r=w.RECT();u.GetWindowRect(h,c.byref(r));ImageGrab.grab(bbox=(r.left,r.top,r.right,r.bottom),all_screens=True,include_layered_windows=True).save(sys.argv[3])
u.GetForegroundWindow.restype=w.HWND
dark=c.c_int();nc=c.c_int();border=c.c_int();d.DwmGetWindowAttribute(h,20,c.byref(dark),4);d.DwmGetWindowAttribute(h,1,c.byref(nc),4);border_status=d.DwmGetWindowAttribute(h,34,c.byref(border),4)
def rect(window,client=False):
 r=w.RECT();(u.GetClientRect if client else u.GetWindowRect)(window,c.byref(r))
 if client:
  p=w.POINT(0,0);u.ClientToScreen(window,c.byref(p));return [p.x,p.y,r.right-r.left,r.bottom-r.top]
 return [r.left,r.top,r.right-r.left,r.bottom-r.top]
surfaces=[];callback=c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
@callback
def visit(window,_):
 name=c.create_unicode_buffer(128);u.GetClassNameW(window,name,128)
 if name.value=='ElectrobunWGPUView':surfaces.append(rect(window,True))
 return True
u.EnumChildWindows.argtypes=[w.HWND,callback,w.LPARAM];u.EnumChildWindows(h,visit,0)
print(json.dumps(dict(material=material.value,style=hex(u.GetWindowLongPtrW(h,-16)&0xffffffff),exStyle=hex(u.GetWindowLongPtrW(h,-20)&0xffffffff),foreground=u.GetForegroundWindow()==h,dark=dark.value,ncRendering=nc.value,borderColor=border.value if border_status>=0 else None,borderColorReadStatus=border_status,dpi=u.GetDpiForWindow(h),frame=rect(h),client=rect(h,True),surfaces=surfaces)))
`;
  const child=spawn("python",["-c",script,String(process.pid),String(inputWindow),...(path?[path]:[])],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output="",errors="";child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(errors)));});
  return JSON.parse(output);
}
