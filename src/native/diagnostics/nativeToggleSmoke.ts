import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Color, Rectangle } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import type { NativeDataHost } from "../nativeDataHost.js";
import type { NativeSettingsShell } from "../../rendering/native/NativeSettingsShell.js";
import { NativeFluentToggle } from "../../rendering/native/NativeFluentToggle.js";
import { nativeUiTheme } from "../../rendering/native/ui/nativeUiTheme.js";
import { clickWithNativeInput } from "../nativeSmokeSupport.js";

/** Uses the real general page and GPU, with isolated OS state; never writes Run. */
export async function runNativeToggleSmoke(o:{app:NativePixiApplication;nativeData:NativeDataHost;settings:ReturnType<typeof createLaunchpadSettings>;open():void;close():void;shell():NativeSettingsShell;directory:string}):Promise<void>{
  assert.ok(process.env.LUMERIA_NATIVE_DATA_DIR,"toggle smoke requires isolated data");
  mkdirSync(o.directory,{recursive:true});
  const original=o.nativeData.autostart,available=o.nativeData.autostartAvailable;
  const wait=async(test:()=>boolean)=>{const end=performance.now()+5000;while(!test()){assert.ok(performance.now()<end,"toggle state timed out");await new Promise(resolve=>setTimeout(resolve,16));}};
  const present=()=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error("toggle frame timed out"));},5000);const off=o.app.on("presented",()=>{clearTimeout(timer);off();resolve();});o.app.invalidate();});
  const toggle=()=>{const node=o.app.stage.getChildByLabel("native-setting:autostart",true);assert.ok(node instanceof NativeFluentToggle);return node;};
  const proofs:unknown[]=[];
  try{
    o.nativeData.autostartAvailable=true;
    o.nativeData.autostart=async enabled=>{assert.equal(enabled,undefined,"smoke must not apply settings");await new Promise(resolve=>setTimeout(resolve,80));return true;};
    for(const theme of ["dark","light"] as const){
      o.open();o.settings.actions.setDraftSettingsThemePreference(theme);o.shell().redraw();
      assert.equal(toggle().disabled,true,"initial status read disables the switch");
      await wait(()=>!o.settings.presentation.isRefreshingLaunchAtLogin.value);await present();
      const check=async(name:string,checked:boolean)=>{
        const control=toggle();assert.equal(control.checked,checked,`${theme} ${name}: logical state`);
        await wait(()=>control.transitionProgress===(checked?1:0));await present();
        const pixels=await o.app.renderer.extract.pixels({target:control,frame:new Rectangle(0,0,40,32),resolution:1,clearColor:theme==="dark"?0x282828:0xffffff});
        const center=control.checked?30:10,offset=(16*pixels.width+center)*4;
        const rgb=Array.from(pixels.pixels.slice(offset,offset+3));
        const colors=nativeUiTheme(theme),color=new Color(control.checked?colors.switchThumb:colors.switchOffThumb);
        const expected=[color.red,color.green,color.blue].map(value=>Math.round(value*255));
        const png=await o.app.renderer.extract.base64({target:control,frame:new Rectangle(0,0,40,32),resolution:3,format:"png",clearColor:theme==="dark"?0x282828:0xffffff});
        writeFileSync(join(o.directory,`${theme}-${name}.png`),Buffer.from(png.split(",")[1]!,"base64"));
        proofs.push({theme,name,rgb,expected});
        assert.ok(rgb.every((value,index)=>Math.abs(value-expected[index]!)<=3),`${theme} ${name}: thumb ${rgb}, expected ${expected}`);
      };
      await check("initial-on",true);
      clickWithNativeInput(o.app,toggle());await check("off",false);
      const p=toggle().toGlobal({x:-30,y:0});o.app.nativeInput.emitPointer("pointermove",p.x,p.y,0);await check("pointer-out",false);
      clickWithNativeInput(o.app,toggle());await check("on",true);
      // Exercise the same action as keyboard activation without the native
      // double-click recognizer coalescing rapid pointer taps.
      toggle().toggle();await new Promise(resolve=>setTimeout(resolve,40));
      toggle().toggle();await new Promise(resolve=>setTimeout(resolve,40));
      toggle().toggle();o.shell().redraw();await check("reversed-and-rebuilt-off",false);
      o.close();await present();
    }
    writeFileSync(join(o.directory,"proof.json"),JSON.stringify(proofs,null,2));
    console.log("Native autostart toggle GPU pixels passed: async load, on/off, pointer-out, rapid reversal and rebuild in both themes");
  }finally{o.close();o.nativeData.autostart=original;o.nativeData.autostartAvailable=available;}
}
