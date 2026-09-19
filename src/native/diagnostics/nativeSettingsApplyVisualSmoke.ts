import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {join} from "node:path";
import type {NativePixiApplication} from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type {NativeSettingsShell} from "../../rendering/native/NativeSettingsShell.js";
import {NativeFluentButton} from "../../rendering/native/NativeFluentButton.js";
import {captureScenePixels,captureSmokeFrame,clickWithNativeInput} from "../nativeSmokeSupport.js";
import {t} from "../nativeLocalization.js";

export async function runNativeSettingsApplyVisualSmoke(o:{app:NativePixiApplication;shell:NativeSettingsShell;present:(name:string)=>Promise<void>;waitFor:(name:string,predicate:()=>boolean)=>Promise<void>}):Promise<void>{
  const {app,shell,present,waitFor}=o;
  const compact=shell.options.navigation.isNavigationCompact.value,originalApply=shell.options.apply;
  const evidence:unknown[]=[];
  const caption=()=> (shell.getChildByLabel("native-settings-tab:general",true) as NativeFluentButton).caption;
  let finish:()=>void=()=>{};
  try{
    if(compact)shell.toggleNavigation();
    await waitFor("expanded navigation",()=>Math.abs(shell.navigationWidth-220)<.01);await new Promise(r=>setTimeout(r,240));await present("apply nav baseline");
    const before=await captureScenePixels(app,app.contentSize.width,app.contentSize.height),bounds=caption().getBounds(),fill=caption().style.fill;
    await captureSmokeFrame(app,"apply-nav-before");
    let calls=0;shell.options.apply=()=>{calls++;return new Promise<void>(resolve=>{finish=resolve;});};
    const apply=shell.getChildByLabel(`native-action:${t("common.actions.apply")}`,true) as NativeFluentButton;assert.ok(apply);
    clickWithNativeInput(app,apply);assert.ok(shell.applying);await present("apply pending nav");
    const pending=await captureScenePixels(app,app.contentSize.width,app.contentSize.height);
    await captureSmokeFrame(app,"apply-nav-pending");
    const nav=shell.getChildByLabel("native-settings-tab:general",true) as NativeFluentButton;
    const pendingFill=caption().style.fill;
    (shell.getChildByLabel("native-settings-tab:about",true) as NativeFluentButton).activate();apply.activate();
    assert.equal(calls,1,"pending apply cannot repeat or navigate");assert.equal(shell.options.navigation.activeRoute.value.tabId,"general");
    let changed=0;
    for(let y=Math.ceil(bounds.y);y<Math.floor(bounds.y+bounds.height);y++)for(let x=Math.ceil(bounds.x);x<Math.floor(bounds.x+bounds.width);x++){
      const p=(y*before.width+x)*4;
      if([0,1,2,3].some(channel=>Math.abs(before.pixels[p+channel]!-pending.pixels[p+channel]!)>1))changed++;
    }
    evidence.push({fill,pendingFill,disabled:nav.disabled,changedCaptionPixels:changed,bounds});
    finish();await shell.waitForApply();await present("apply nav completed");await captureSmokeFrame(app,"apply-nav-complete");
    writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"settings-apply-nav.json"),JSON.stringify(evidence,null,2));
    assert.equal(pendingFill,fill,"saving must not dim navigation text");assert.equal(changed,0,"saving must preserve navigation caption pixels");
    console.log("Settings apply navigation pixels",JSON.stringify(evidence));
  }finally{
    finish();await shell.waitForApply();shell.options.apply=originalApply;
    if(shell.options.navigation.isNavigationCompact.value!==compact)shell.toggleNavigation();
  }
}
