import { spawn } from "node:child_process";
import type { NativePixiApplication } from "./native-app";
import { getNativePixiApplicationTesting } from "./native-app-testing";

/** Query Windows hit testing, rather than injecting an event directly into Pixi. */
export async function assertWindowInputCoverage(app:NativePixiApplication):Promise<void>{
  const {inputWindow}=getNativePixiApplicationTesting(app).handles();
  const script=String.raw`
import ctypes as c, sys, time
from ctypes import wintypes as w
pid, handle=map(int,sys.argv[1:])
u=c.WinDLL('user32',use_last_error=True)
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetAncestor.argtypes=[w.HWND,w.UINT];u.GetAncestor.restype=w.HWND
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
u.SetForegroundWindow.argtypes=[w.HWND];u.GetForegroundWindow.restype=w.HWND
u.WindowFromPoint.argtypes=[w.POINT];u.WindowFromPoint.restype=w.HWND
owner=w.DWORD();u.GetWindowThreadProcessId(handle,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Coverage window is not owned by this smoke worker')
root=u.GetAncestor(handle,2);u.SetForegroundWindow(root)
deadline=time.monotonic()+2
while u.GetForegroundWindow()!=root:
 if time.monotonic()>deadline:raise RuntimeError('Coverage window could not acquire foreground')
 time.sleep(.01)
rect=w.RECT();u.GetWindowRect(root,c.byref(rect))
failures=[]
for fx in [.1,.3,.5,.7,.9]:
 for fy in [.1,.3,.5,.7,.9]:
  x=round(rect.left+(rect.right-rect.left)*fx);y=round(rect.top+(rect.bottom-rect.top)*fy)
  if u.GetAncestor(u.WindowFromPoint(w.POINT(x,y)),2)!=root:failures.append([x,y])
if failures:raise RuntimeError('Window input leaks through at '+str(failures))
print('Windows hit coverage passed at all 25 sampled points')
`;
  const child=spawn("python",["-c",script,String(process.pid),String(inputWindow)],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output="";child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{output+=chunk;});
  await new Promise<void>((resolve,reject)=>{
    child.once("error",reject);
    child.once("exit",code=>code===0?resolve():reject(new Error(`Native input coverage failed (${code}): ${output}`)));
  });
  console.log(output.trim());
}
