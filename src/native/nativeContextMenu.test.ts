import assert from "node:assert/strict";
import { Container } from "pixi.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";
import { NativeManagement } from "../rendering/native/NativeManagement.js";
import { NativeFluentButton } from "../rendering/native/NativeFluentButton.js";
import type { TextInputHost } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { createLaunchpadApps } from "../application/launchpadApps.js";
import { createNativeStateHost } from "../application/stateHost.js";
import { createLaunchpadLayoutHelpers, type LaunchpadPages } from "../domain/launchpadLayout.js";
import { catalogPort } from "../platform/launchpadPorts.js";
import { createLocalization } from "../i18n/localization.js";

installNativeCanvasTestAdapter();
const stage = new Container();
const management = new NativeManagement({focused:null,blur(){}} as unknown as TextInputHost, () => ({width:800,height:600}), () => {});
stage.addChild(management);
let activated = "";
const actions = [
  {label:"Open",disabled:true,run:()=>{activated="old";}},
  {label:"Edit",run:()=>{activated="edit";}},
];
const session = management.menu(790,590,actions)!;
const edit = management.getChildByLabel("native-action:Edit",true) as NativeFluentButton;
const open = management.getChildByLabel("native-action:Open",true) as NativeFluentButton;
const before = edit.getGlobalPosition();
management.handleKey({type:"down",key:"ArrowDown"});
const focus = management.getChildByLabel("native-management:keyboard-focus",true)!;
assert.equal(focus.parent, edit);
session.update([{label:"Open",disabled:false,run:()=>{activated="new";}},actions[1]!]);
assert.equal(management.getChildByLabel("native-action:Edit",true), edit, "result update preserves controls");
assert.equal(focus.parent, edit, "result update preserves keyboard focus");
assert.deepEqual(edit.getGlobalPosition(), before, "result update does not relocate the menu");
assert.equal(open.disabled,false);
open.activate(); assert.equal(activated,"new", "actions must use refreshed details");
assert.equal(session.update(actions),false, "closed menu cannot be resurrected");
management.menu(10,10,actions);
assert.equal(session.update(actions),false, "late result cannot replace a newer menu");
management.close();
stage.destroy({children:true});

const helpers = createLaunchpadLayoutHelpers({getPageSize:()=>21,getFolderPageSize:()=>9});
const pages: {value:LaunchpadPages} = {value:[Array.from({length:3000},(_,i)=>({id:`a${i}`,type:"app",name:`App ${3000-i}`,launchTarget:{kind:"executable",path:`C:/apps/${i}.exe`}}))]};
let collections=0;
const apps=createLaunchpadApps({...helpers,collectAppsFromPages:value=>{collections++;return helpers.collectAppsFromPages(value);},
  appendAppsToPages:(source,added)=>[...helpers.clonePages(source),added.map(app=>({...app}))],
  pages,catalogPort,localizationText:createLocalization({issue:null,match:"exact",preference:"zh-CN",resolvedLocale:"zh-CN"}).text,
  commitPages:next=>{pages.value=next;},commitPagesAfterDeletion:next=>{pages.value=next;},commitOpenFolder:()=>{},isDragActive:()=>false,
  openFolderId:{value:null},renderedFolder:{value:null},openScanKeywordSettings:()=>{},reclampPageIndices:()=>{},schedulePageGridMetrics:()=>{},shouldUseNativeCatalog:()=>true,
},createNativeStateHost(()=>{}));
const integration=apps.nativeIntegration;
const initial=integration.getLaunchTargetCheck("a2999")!;
const sorted=apps.managedApps.value;
collections=0;
for(let i=0;i<10;i++){
  integration.getLaunchTargetCheck("a2999");integration.getManagedApp("a2999");integration.getTargetDetails("a2999");
  integration.applyLaunchTargetStatuses([{id:"a2999",status:"ok"}],[initial]);
  assert.equal(apps.managedApps.value,sorted);
}
assert.equal(collections,0,"warm single-target menu queries never recollect or sort the full layout");
const original=pages.value;
const modified=helpers.clonePages(original);
const changed=modified[0]![2999]!;
assert.equal(changed.type,"app");
if(changed.type==="app")changed.sources=[{key:"fallback",type:"customDirectory",state:"equivalent",rootId:"root",rootLabel:"root",relativePath:"fallback.exe",absolutePath:"C:/fallback.exe"}];
pages.value=modified;
assert.notEqual(integration.getLaunchTargetCheck("a2999")!.targetSignature,initial.targetSignature);
integration.applyLaunchTargetStatuses([{id:"a2999",status:"missing"}],[initial]);
assert.equal(integration.getTargetDetails("a2999"),undefined,"old checks cannot attach after fallback edits");
pages.value=[[]];assert.equal(integration.getManagedApp("a2999"),undefined);
pages.value=original;assert.equal(integration.getLaunchTargetCheck("a2999")!.targetSignature,initial.targetSignature,"undo restores indexed targets");
console.log("Native menu sessions preserve controls, position and focus; target indexes cover edits, removal and undo");
