import {spawn} from "node:child_process";

// Read the actual Shell windows in physical coordinates; monitor-sized geometry
// alone cannot prove that the taskbar is behind the fullscreen HWND.
const script=String.raw`
import ctypes as c,sys,time,json
from ctypes import wintypes as w
pid,h,expected=map(int,sys.argv[1:]);u=c.WinDLL('user32',use_last_error=True)
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)];owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Taskbar check requires the owned HWND')
u.GetForegroundWindow.restype=w.HWND
u.GetWindowLongPtrW.argtypes=[w.HWND,c.c_int];u.GetWindowLongPtrW.restype=c.c_ssize_t
u.GetWindow.argtypes=[w.HWND,w.UINT];u.GetWindow.restype=w.HWND
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
u.GetClassNameW.argtypes=[w.HWND,w.LPWSTR,c.c_int]
u.IsWindowVisible.argtypes=[w.HWND]
u.MonitorFromWindow.argtypes=[w.HWND,w.DWORD];u.MonitorFromWindow.restype=w.HANDLE
u.WindowFromPoint.argtypes=[w.POINT];u.WindowFromPoint.restype=w.HWND
u.GetAncestor.argtypes=[w.HWND,w.UINT];u.GetAncestor.restype=w.HWND
callback=c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM);u.EnumWindows.argtypes=[callback,w.LPARAM]
def sample():
 bars=[];display=u.MonitorFromWindow(h,2);above=set();v=u.GetWindow(h,3)
 while v and v not in above:above.add(v);v=u.GetWindow(v,3)
 @callback
 def visit(window,_):
  name=c.create_unicode_buffer(64);u.GetClassNameW(window,name,64)
  if name.value not in ('Shell_TrayWnd','Shell_SecondaryTrayWnd') or u.MonitorFromWindow(window,2)!=display:return True
  r=w.RECT();u.GetWindowRect(window,c.byref(r));hit=u.WindowFromPoint(w.POINT((r.left+r.right)//2,(r.top+r.bottom)//2))
  bars.append(dict(above=window in above,visible=bool(u.IsWindowVisible(window)),hitRoot=u.GetAncestor(hit,2)))
  return True
 u.EnumWindows(visit,0)
 return dict(foreground=u.GetForegroundWindow()==h,topmost=bool(u.GetWindowLongPtrW(h,-20)&8),bars=bars)
deadline=time.monotonic()+2
while True:
 row=sample()
 passed=(row['foreground'] and row['topmost'] and all(not b['above'] for b in row['bars'] if b['visible'])) if expected else not row['topmost']
 if passed:break
 if time.monotonic()>deadline:raise RuntimeError('Fullscreen taskbar layer did not settle: '+json.dumps(row))
 time.sleep(.02)
print(json.dumps(row))
`;

export async function assertNativeFullscreenTaskbar(handle:number,active:boolean):Promise<void>{
  const child=spawn("python",["-c",script,String(process.pid),String(handle),active?"1":"0"],{windowsHide:true,stdio:["ignore","pipe","pipe"],timeout:5000});
  let errors="";child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(errors)));});
}
