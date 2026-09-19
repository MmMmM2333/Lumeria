import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import {join} from "node:path";
import {Screen} from "../../../vendor/electrobun-pixi-native-starter/src/platform/electrobun-sdk.js";
import type {NativePixiApplication} from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import {captureOwnedWindow} from "../nativeSettingsSmoke.js";

// Exercise the native notification path without changing the user's OS settings.
// The deliberately displaced suggested RECT reproduces the geometry drift caused
// by same-monitor scaling. Actual display DPI remains unchanged in this replay.
const replayScript=String.raw`
import ctypes as c,sys,json
from ctypes import wintypes as w
pid,h,mode=map(int,sys.argv[1:]);u=c.WinDLL('user32',use_last_error=True)
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)];owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('DPI replay requires an application-owned window')
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)];u.MonitorFromWindow.argtypes=[w.HWND,w.DWORD];u.MonitorFromWindow.restype=w.HANDLE
u.GetMonitorInfoW.argtypes=[w.HANDLE,c.c_void_p];info=(c.c_long*10)();info[0]=40
if not u.GetMonitorInfoW(u.MonitorFromWindow(h,2),c.byref(info)):raise c.WinError()
u.GetDpiForWindow.argtypes=[w.HWND];dpi=u.GetDpiForWindow(h)
u.SendMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM];u.SendMessageW.restype=w.LPARAM
r=w.RECT()
if not u.GetWindowRect(h,c.byref(r)):raise c.WinError()
r.left-=170;r.top+=25;r.right-=80;r.bottom-=110
suggested=[r.left,r.top,r.right-r.left,r.bottom-r.top]
if mode==0:u.SendMessageW(h,0x02e0,dpi|(dpi<<16),c.addressof(r))
else:
 u.SetWindowPos.argtypes=[w.HWND,w.HWND,c.c_int,c.c_int,c.c_int,c.c_int,w.UINT]
 if not u.SetWindowPos(h,None,r.left,r.top,r.right-r.left,r.bottom-r.top,0x14):raise c.WinError()
 u.SendMessageW(h,0x007e,32,((info[4]-info[2])<<16)|(info[3]-info[1]))
print(json.dumps(dict(monitor=list(info)[1:5],suggested=suggested,dpi=dpi)))
`;

async function replay(handle:number,message:number):Promise<{monitor:number[];suggested:number[];dpi:number}>{
  const child=spawn("python",["-c",replayScript,String(process.pid),String(handle),String(message)],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output="",errors="";
  child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(errors)));});
  return JSON.parse(output);
}

export async function runNativeFullscreenBoundsSmoke(o:{
  app:NativePixiApplication;present:(name:string)=>Promise<void>;
  waitFor:(name:string,predicate:()=>boolean)=>Promise<void>;
  overscan:number;
}):Promise<void>{
  const {app,present,waitFor}=o,mode=app.windowMode;
  const initialFrame=app.window.getFrame(),rows:unknown[]=[];
  const proofPath=join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"fullscreen-dpi-refresh.json");
  try{
    for(const display of Screen.getAllDisplays())for(const overscan of [0,1]){
      app.setWindowMode("windowed");app.window.setPosition(display.workArea.x+40,display.workArea.y+40);
      await waitFor("fullscreen replay monitor",()=>app.resolution===display.scaleFactor);
      await present("fullscreen replay windowed baseline");
      const windowed=await captureOwnedWindow(app.nativeWindowHandle);
      app.setWindowMode("fullscreen",overscan);await present("fullscreen replay baseline");
      for(const message of [0,1]){
        const input=await replay(app.nativeWindowHandle,message);
        const expected=[input.monitor[0]!-overscan,input.monitor[1]!-overscan,
          input.monitor[2]!-input.monitor[0]!+2*overscan,input.monitor[3]!-input.monitor[1]!+2*overscan];
        await waitFor("fullscreen refits after display notification",()=>{
          const frame=app.getWindowFrame();return [frame.x,frame.y,frame.width,frame.height].every((value,index)=>value===expected[index]);
        });
        await present("fullscreen refit backing");
        const after=await captureOwnedWindow(app.nativeWindowHandle);
        assert.deepEqual(after.frame,expected);assert.deepEqual(after.client,expected);assert.deepEqual(after.surfaces,[expected]);
        assert.equal(app.renderer.view.texture.source.pixelWidth,after.client[2]);
        assert.equal(app.renderer.view.texture.source.pixelHeight,after.client[3]);
        rows.push({display:display.id,overscan,message:message===0?"WM_DPICHANGED":"WM_DISPLAYCHANGE",input,after});
      }
      // Refreshes must not overwrite the placement saved before entering fullscreen.
      app.setWindowMode("windowed");await present("restore saved windowed placement");
      assert.deepEqual((await captureOwnedWindow(app.nativeWindowHandle)).frame,windowed.frame);
      const input=await replay(app.nativeWindowHandle,0);await present("windowed DPI suggestion");
      assert.deepEqual((await captureOwnedWindow(app.nativeWindowHandle)).frame,input.suggested,"normal windows retain the OS suggested rectangle");
      app.window.setPosition(initialFrame.x,initialFrame.y);app.window.setSize(initialFrame.width,initialFrame.height);await present("restore windowed baseline");
    }
    console.log(`Fullscreen DPI/display refresh: ${rows.length} notification cases and windowed restoration passed`);
  }finally{
    writeFileSync(proofPath,JSON.stringify(rows,null,2));
    app.setWindowMode("windowed");app.window.setPosition(initialFrame.x,initialFrame.y);app.window.setSize(initialFrame.width,initialFrame.height);
    if(mode==="fullscreen")app.setWindowMode(mode,o.overscan);
    await present("fullscreen replay cleanup");
  }
}
