import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createNativeLiveDesktop } from "../nativeLiveDesktop.js";
import { captureOwnedWindow } from "../nativeSettingsSmoke.js";
import type { NativeProductDiagnostics } from "./nativeProductDiagnostics.js";
import { Graphics } from "pixi.js";
import { spawnSync } from "node:child_process";
import { getNativePixiApplicationTesting } from "../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js";

export async function runNativeLiveDesktopSmoke(options:{
  app:NativePixiApplication;live:ReturnType<typeof createNativeLiveDesktop>;
  show():void;hide():void;sync():void;quit():void;
  present(name:string):Promise<void>;waitFor(name:string,predicate:()=>boolean):Promise<void>;
  diagnostics:NativeProductDiagnostics|null;
}){
  const {app,live}=options,dir=process.env.LAUNCHPAD_LIVE_DESKTOP_PROOF;
  if(!dir||!process.env.LUMERIA_NATIVE_DATA_DIR)throw new Error("Live Desktop smoke requires isolated evidence/data paths");
  mkdirSync(dir,{recursive:true});assert.equal(live.enabled,true);assert.equal(live.loaded,true);
  const initial=live.poll();
  console.log("Live Desktop initial status",JSON.stringify({supported:live.support.value.supportsLiveDesktopBackground,phase:initial?.phase,frames:initial?.diagnostics.framesCopied}));
  await options.waitFor("Live Desktop captured frames",()=>Number(live.poll()?.diagnostics.framesCopied)>2);
  const running=live.poll();assert.equal(running?.active,true);
  const beforeVisible=running!.diagnostics.framesCopied;
  live.setVisible(true);
  await options.waitFor("Live Desktop visible capture progress",()=>Number(live.poll()?.diagnostics.framesCopied)>beforeVisible+8);
  await new Promise(resolve=>setTimeout(resolve,500));
  app.window.activate();await options.present("Live Desktop visible");
  const marker=new Graphics({eventMode:"none"}).rect(0,0,40,40).fill(0xff00ff);
  marker.position.set(app.contentSize.width/2,app.contentSize.height/2);app.stage.addChild(marker);
  await options.present("Live Desktop foreground marker");
  await captureOwnedWindow(app.nativeWindowHandle,join(dir,"live-desktop.png"));
  const pixels=spawnSync("python",["-c",String.raw`
from PIL import Image
import sys
im=Image.open(sys.argv[1]).convert('RGB')
n=sum(1 for r,g,b in im.getdata() if r>240 and b>240 and g<20)
assert n>500, f'Live Desktop obscured the Pixi foreground marker: {n}'
print(n)
`,join(dir,"live-desktop.png")],{windowsHide:true,encoding:"utf8"});
  marker.destroy();assert.equal(pixels.status,0,pixels.stderr);
  if(options.diagnostics){
    await options.diagnostics.command({action:"motion-config",enabled:true,recordHistory:true});
    await options.diagnostics.command({action:"background-preview",effect:"blur",blurStrength:60});
    await new Promise(resolve=>setTimeout(resolve,300));
    await captureOwnedWindow(app.nativeWindowHandle,join(dir,"live-desktop-blur.png"));
    await options.diagnostics.command({action:"background-restore"});
  }
  options.hide();await options.waitFor("Live Desktop hidden",()=>!app.window.isVisible());
  options.show();await options.waitFor("Live Desktop restored",()=>app.window.isVisible());
  await options.present("Live Desktop restore");
  app.window.minimize();await options.waitFor("Live Desktop minimized",()=>app.window.isMinimized());
  options.show();await options.waitFor("Live Desktop unminimized",()=>!app.window.isMinimized()&&app.state==="running");
  live.stop();assert.equal(live.poll()?.active,false);
  options.sync();await options.waitFor("Live Desktop restart captured frames",()=>Number(live.poll()?.diagnostics.framesCopied)>2);
  const restarted=live.poll();assert.equal(restarted?.active,true);
  const motion=await options.diagnostics?.command({action:"motion-report",includeTargets:true});
  const trace=await options.diagnostics?.command({action:"motion-trace"});
  const testing=getNativePixiApplicationTesting(app),generation=testing.handles().deviceGeneration;
  testing.injectFault("device-lost");app.invalidate();
  await options.waitFor("Live Desktop with recovered Pixi device",()=>app.state==="running"&&testing.handles().deviceGeneration>generation);
  await options.present("Live Desktop after device recovery");
  await captureOwnedWindow(app.nativeWindowHandle,join(dir,"live-desktop-recovered.png"));
  assert.equal(live.poll()?.active,true);
  live.stop();const stopped=live.poll();assert.equal(stopped?.active,false);assert.equal(stopped?.diagnostics.abandonedRendererWorkers,0);
  writeFileSync(join(dir,"proof.json"),JSON.stringify({running,restarted,stopped,motion,trace,hideRestore:true,minimizeRestore:true,deviceRecovery:true},null,2));
  console.log("Native Live Desktop capture, hide/restore, stop/restart and release passed");
  await options.quit();
}
