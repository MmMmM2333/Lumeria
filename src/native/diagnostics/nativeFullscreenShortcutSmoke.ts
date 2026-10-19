import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import type {NativeHostSmokeContext} from "./nativeHostSmoke.test.js";
import {sendAltSpace} from "../../../vendor/electrobun-pixi-native-starter/src/runtime/shortcut-smoke.js";
import {assertNativeFullscreenTaskbar} from "./nativeFullscreenTaskbarSmoke.js";
import {sendTrayTestAction} from "../../../vendor/electrobun-pixi-native-starter/src/runtime/tray-smoke.js";

// OS shortcuts must reach the foreground HWND, not just the Pixi key router.
const script=String.raw`
import ctypes as c,sys,time
from ctypes import wintypes as w
pid,h,vk=map(int,sys.argv[1:]);u=c.WinDLL('user32',use_last_error=True)
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)];owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
u.GetForegroundWindow.restype=w.HWND
if owner.value!=pid or u.GetForegroundWindow()!=h:raise RuntimeError('Shortcut requires the owned foreground window')
class Keyboard(c.Structure):_fields_=[('vk',w.WORD),('scan',w.WORD),('flags',w.DWORD),('time',w.DWORD),('extra',c.c_size_t)]
class Payload(c.Union):_fields_=[('keyboard',Keyboard),('padding',c.c_byte*32)]
class Input(c.Structure):_fields_=[('type',w.DWORD),('payload',Payload)]
u.SendInput.argtypes=[w.UINT,c.POINTER(Input),c.c_int];u.SendInput.restype=w.UINT
def key(code,flags):
 data=Input(1,Payload(keyboard=Keyboard(code,0,flags,0,0)))
 if u.SendInput(1,c.byref(data),c.sizeof(data))!=1:raise c.WinError(c.get_last_error())
key(0x5b,0)
try:
 key(vk,0)
 try:time.sleep(.06)
 finally:key(vk,2)
finally:key(0x5b,2)
time.sleep(.4)
`;

export async function runNativeFullscreenShortcutSmoke(context:NativeHostSmokeContext):Promise<void>{
  if(process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY==="1")return;
  const {app,present,waitFor,showLaunchpad,dismissLaunchpad,captureOwnedWindow}=context;
  const mode=app.windowMode,overscan=context.settings.presentation.fullscreenOverscanEnabled.value?1:0;
  const shortcut=context.mainShortcut.current;
  assert.ok(context.mainShortcut.apply("alt+Space").ok,"fullscreen shortcut proof must register Alt+Space");
  try{
    for(const pixels of [0,1]){
      app.setWindowMode("fullscreen",pixels);showLaunchpad();await present("fullscreen shortcuts ready");
      for(const [name,key] of [["Up",0x26],["Down",0x28],["Left",0x25],["Right",0x27]] as const){
        app.window.activate();await present(`Win+${name} foreground`);
        await assertNativeFullscreenTaskbar(app.nativeWindowHandle,true);
        const baseline=await captureOwnedWindow(app.nativeWindowHandle);
        console.log(`Fullscreen shortcut replay: overscan=${pixels} Win+${name}`);
        const child=spawn("python",["-c",script,String(process.pid),String(app.nativeWindowHandle),String(key)],{windowsHide:true,stdio:["ignore","pipe","pipe"],timeout:5000});
        let errors="";child.stderr.on("data",chunk=>{errors+=chunk;});
        await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(errors)));});
        if(app.window.isMinimized())await sendAltSpace();
        await waitFor(`Win+${name} runtime recovers`,()=>app.state==="running"&&!app.window.isMinimized());
        await present(`Win+${name} renders`);
        const after=await captureOwnedWindow(app.nativeWindowHandle);
        assert.deepEqual(after.frame,baseline.frame,`Win+${name} retains fullscreen frame`);
        assert.deepEqual(after.client,baseline.client,`Win+${name} retains fullscreen client`);
        dismissLaunchpad();await waitFor(`Win+${name} hide`,()=>!app.window.isVisible());
        await assertNativeFullscreenTaskbar(app.nativeWindowHandle,false);
        await sendAltSpace();await waitFor(`Win+${name} shortcut reopens`,()=>app.window.isVisible()&&app.state==="running");
        await present(`Win+${name} reopened frame`);
        dismissLaunchpad();await waitFor(`Win+${name} hide before tray`,()=>!app.window.isVisible());
        const tray=context.tray();assert.ok(tray);
        await sendTrayTestAction(tray.id,"left");
        await waitFor(`Win+${name} tray reopens`,()=>app.window.isVisible()&&app.state==="running");
        await waitFor(`Win+${name} tray animation settles`,()=>!context.scene.getMotionSnapshot().active);
        await present(`Win+${name} tray frame`);
        await assertNativeFullscreenTaskbar(app.nativeWindowHandle,true);
      }
    }
    console.log("Fullscreen OS shortcuts: all 8 replay and reopen cases passed");
  }finally{
    context.mainShortcut.apply(shortcut);app.setWindowMode(mode,overscan);
    if(app.state==="running")await present("fullscreen shortcut cleanup");
  }
}
