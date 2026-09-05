import { spawn } from "node:child_process";

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
target, handle, x, y, dx, dy = map(int, sys.argv[1:])
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
user.SetCursorPos(x,y);time.sleep(.06)
button(2)
try:
 deadline=time.monotonic()+3
 while not moving():
  if time.monotonic()>deadline:raise RuntimeError('Owned window did not enter the OS move/size loop')
  time.sleep(.01)
 for step in range(1,13):
  if user.GetForegroundWindow()!=root: raise RuntimeError('Foreground changed during the test drag')
  if not user.SetCursorPos(x+round(dx*step/12),y+round(dy*step/12)): raise c.WinError(c.get_last_error())
  time.sleep(.025)
finally: button(4)
deadline=time.monotonic()+3
while moving():
 if time.monotonic()>deadline:raise RuntimeError('Owned window did not leave the OS move/size loop')
 time.sleep(.01)
`;

export async function dragOwnedNativeWindow(inputWindow:number,point:{x:number;y:number},delta:{x:number;y:number}):Promise<void>{
  const child=spawn("python",["-c",mouseDrag,String(process.pid),String(inputWindow),
    ...[point.x,point.y,delta.x,delta.y].map(value=>String(Math.round(value)))],{
    windowsHide:true,stdio:["ignore","pipe","pipe"],
  });
  let errors="";child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{
    child.once("error",reject);
    child.once("exit",code=>code===0?resolve():reject(new Error(`Owned window mouse drag failed (${code}): ${errors}`)));
  });
}
