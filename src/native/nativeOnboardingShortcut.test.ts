import assert from "node:assert/strict";
import {Texture} from "pixi.js";
import {createNativeOnboarding} from "../rendering/native/NativeOnboarding.js";
import type {NativeModalSpec} from "../rendering/native/NativeModalPanel.js";
import {getNativeLocale,setNativeLocale} from "./nativeLocalization.js";
import {installNativeCanvasTestAdapter} from "./nativeCanvasTestAdapter.js";

installNativeCanvasTestAdapter();
export async function runNativeOnboardingShortcutTests():Promise<void>{
  const previousLocale=getNativeLocale();
  try{
    for(const locale of ["zh-CN","en-US"]){
      setNativeLocale(locale);
      let dialog:NativeModalSpec|null=null,releaseCheck=()=>{},registrations=0,completed=0,notifications=0,applies=0,saveFails=true;
      const warning={value:""},error={value:""},shortcut={value:"alt+Space" as string|null};
      const settings={
        beginEdit(){},cancelEdit(){},
        presentation:{mainWindowShortcut:{value:"alt+Space"},mainWindowShortcutWarning:warning,mainWindowShortcutError:error},
        draft:{mainWindowShortcut:shortcut,settingsThemePreference:{value:"light"},windowMode:{value:"fullscreen"},launchAtLogin:{value:false}},
        actions:{setDraftSettingsThemePreference(){},setMainWindowShortcutError(value:string){error.value=value;},setDraftMainWindowShortcut(value:string|null){shortcut.value=value;error.value="";}},
        nativeIntegration:{registerCurrentShortcut:()=>{registrations++;return new Promise(resolve=>{releaseCheck=()=>{warning.value="occupied";error.value="occupied";resolve({ok:false,error:new Error("occupied")});};});}},
        applyEdit:async(options:unknown)=>{applies++;assert.deepEqual(options,{shortcutFailure:"warn"});return {ok:true};},
      };
      const options={
        settings:settings as unknown as Parameters<typeof createNativeOnboarding>[0]["settings"],
        apps:{presentation:{scanRoots:{value:[]}},imports:{rows:[],catalog:[],open(){},completeEmpty(){},finish(){}}} as unknown as Parameters<typeof createNativeOnboarding>[0]["apps"],
        management:{dialog(spec:NativeModalSpec){dialog=spec;},refresh(){}} as unknown as Parameters<typeof createNativeOnboarding>[0]["management"],
        icon:()=>Texture.EMPTY,theme:()=>"light" as const,invalidate(){},scan:async()=>{},
        save:async()=>{if(saveFails)throw new Error("save failure");},complete:()=>{completed++;},warnShortcut:()=>{notifications++;},
      };
      const onboarding=createNativeOnboarding(options),spec=()=>{assert.ok(dialog);return dialog as NativeModalSpec;};
      onboarding.open();assert.equal(registrations,1,"opening setup must immediately check the configured default");
      const entering=spec().confirm!();await Promise.resolve();
      assert.equal(spec().footerStatus,"1 / 3","shortcut preferences must not appear before the initial check resolves");
      releaseCheck();await entering;
      assert.equal(spec().footerStatus,"2 / 3");assert.equal(warning.value,"occupied");assert.equal(error.value,"");
      let body=spec().build(760);
      assert.equal(body.node.getChildByLabel("native-onboarding:shortcut-warning",true)?.visible,true,"occupied default must show a field warning on first entry");
      assert.equal(body.node.getChildByLabel("native-onboarding:shortcut-tooltip",true)?.visible,false,"initial warning help is available on demand");
      body.controls.find(control=>control.node.label==="native-onboarding:shortcut-warning")!.focus(true);
      assert.equal(body.node.getChildByLabel("native-onboarding:shortcut-tooltip",true)?.visible,true);
      body.dispose?.();body.node.destroy({children:true});
      settings.actions.setDraftMainWindowShortcut("alt+F9");body=spec().build(760);
      assert.equal(body.node.getChildByLabel("native-onboarding:shortcut-warning",true)?.visible,false,"a different draft must not display the old default's warning");
      body.dispose?.();body.node.destroy({children:true});settings.actions.setDraftMainWindowShortcut("alt+Space");
      await spec().confirm!();assert.equal(spec().footerStatus,"3 / 3");
      await assert.rejects(async()=>{await spec().confirm!();},/save failure/);
      assert.equal(completed,0);assert.equal(notifications,0);
      saveFails=false;assert.equal(await spec().confirm!(),true);assert.equal(completed,1);assert.equal(applies,1);
      assert.equal(notifications,0,"completing setup must not repeat the shortcut warning as a notice");
    }
  }finally{setNativeLocale(previousLocale);}
}

await runNativeOnboardingShortcutTests();
console.log("Onboarding checks shortcuts before preferences, shows field warnings and completes without repeat notices");
