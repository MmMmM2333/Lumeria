import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Container } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { NativeDataHost } from "../nativeDataHost.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeFluentButton } from "../../rendering/native/NativeFluentButton.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import { snapshotContractValue } from "../../rendering/contractSnapshot.js";
import { captureSmokeFrame, clickWithNativeInput } from "../nativeSmokeSupport.js";
import { t } from "../nativeLocalization.js";

export async function runNativeContextMenuSmoke(o: {
  app: NativePixiApplication; apps: ReturnType<typeof createLaunchpadApps>; editing: ReturnType<typeof createNativeEditing>;
  data: NativeDataHost; management: NativeManagement; present(name:string):Promise<void>;
  menu(item:SceneItem|null,x:number,y:number):void; quit():void;
}): Promise<void> {
  const directory=process.env.LAUNCHPAD_CONTEXT_MENU_PROOF!;
  mkdirSync(directory,{recursive:true});process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR=directory;
  const base=o.apps.managedApps.value.find(app=>app.launchTarget?.kind==="executable");assert.ok(base);
  const original=o.data.checkLaunchTargets;
  let delayed=true;
  const pending:(()=>void)[]=[];
  o.data.checkLaunchTargets=async targets=>{
    if(delayed)await new Promise<void>(resolve=>pending.push(resolve));
    return targets.map(target=>({id:target.id,status:"ok" as const,canElevate:target.launchTarget.kind==="executable",requiresAdmin:false,adminRequirementKnown:true,
      fileLocation:target.launchTarget.kind==="executable"?base.launchTarget!.path!:null,locationIsFolder:false,shortcutLocation:null}));
  };
  const measurements:{icons:number;kind:string;menuFirstPresentMs:number}[]=[];
  const node=(id:string)=>{const result=o.app.stage.getChildByLabel(`launchpad-item:${id}`,true);assert.ok(result);return result as Container;};
  const button=(label:string)=>o.management.getChildByLabel(`native-action:${t(label)}`,true) as NativeFluentButton;
  try {
    for(const count of [100,1000,3000]) {
      const items=Array.from({length:count},(_,i)=>({...base,id:`menu-${count}-${i}`,name:`App ${i}`,origin:"manual" as const,
        ...(i===1?{launchTarget:{kind:"appUserModelId",appUserModelId:"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"}}:{})}));
      o.editing.commit(Array.from({length:Math.ceil(count/21)},(_,i)=>items.slice(i*21,i*21+21)));
      await o.present(`prepare ${count} icons`);
      for(const i of [0,1]){
        const start=performance.now();clickWithNativeInput(o.app,node(items[i]!.id),2,0,true);
        assert.ok(o.management.modal,"menu exists before any target check resolves");
        await o.present(`menu ${count} ${i}`);
        measurements.push({icons:count,kind:i===0?"exe":"uwp",menuFirstPresentMs:performance.now()-start});
        assert.equal(button("common.actions.edit").disabled,false);
        assert.equal(button("launchpad.target.openLocation").disabled,true);
        if(count===3000&&i===1)await captureSmokeFrame(o.app,"uwp-pending");
        o.management.close();
      }
      // Replace A with B before either result is available, then close B.
      o.menu(snapshotContractValue(items[0]!) as SceneItem,200,160);
      o.menu(snapshotContractValue(items[1]!) as SceneItem,220,180);
      const layer=o.management.getChildByLabel("native-context-menu");assert.ok(layer);
      await new Promise(resolve=>setTimeout(resolve,1000));
      assert.equal(o.management.getChildByLabel("native-context-menu"),layer,"pending checks leave the menu visible");
      o.management.close();
      pending.splice(0).forEach(resolve=>resolve());
      await o.present("late results after close");
      assert.equal(o.management.modal,false,"late results must not reopen menus");
    }
    const target=o.apps.nativeIntegration.getManagedApp("menu-3000-0")!;
    o.menu(snapshotContractValue(target) as SceneItem,200,160);
    const edit=button("common.actions.edit"),position=edit.getGlobalPosition();
    delayed=false;pending.splice(0).forEach(resolve=>resolve());
    await o.present("updated menu");
    assert.equal(button("common.actions.edit"),edit);assert.deepEqual(edit.getGlobalPosition(),position);
    assert.equal(button("launchpad.target.openLocation").disabled,false);
    await captureSmokeFrame(o.app,"exe-updated");
    o.management.close();
    writeFileSync(join(directory,"proof.json"),JSON.stringify({status:"passed",injectedCheckDelayMs:1000,measurements},null,2));
  } finally {delayed=false;pending.splice(0).forEach(resolve=>resolve());o.data.checkLaunchTargets=original;}
  await o.quit();
}
