import fixtures from "./fixtures/importPreviewLabels.json";
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {captureSmokeFrame,clickWithNativeInput} from "../nativeSmokeSupport.js";
import type {NativePixiApplication} from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type {createLaunchpadApps} from "../../application/launchpadApps.js";
import type {createLaunchpadSettings} from "../../application/launchpadSettings.js";
import type {NativeManagement} from "../../rendering/native/NativeManagement.js";
import type {NativeAppDialogs} from "../../rendering/native/NativeAppDialogs.js";
import type {createNativeOnboarding} from "../../rendering/native/NativeOnboarding.js";
import {NativeFluentToggle} from "../../rendering/native/NativeFluentToggle.js";
import {NativeScrollView} from "../../rendering/native/NativeScrollView.js";
import {FederatedWheelEvent,EventBoundary} from "pixi.js";

export async function runNativeImportPreview(o:{app:NativePixiApplication;apps:ReturnType<typeof createLaunchpadApps>;settings:ReturnType<typeof createLaunchpadSettings>;management:NativeManagement;appDialogs:NativeAppDialogs;onboarding:ReturnType<typeof createNativeOnboarding>;showSources():void;present:(s:string)=>Promise<void>;save():Promise<void>;quit():void|Promise<void>}):Promise<void>{
  mkdirSync(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,{recursive:true});
  const capture=async(name:string)=>{await o.present(name);await new Promise(r=>setTimeout(r,180));await o.present(name);await captureSmokeFrame(o.app,name);};
  const wait=async(test:()=>boolean)=>{const deadline=Date.now()+15000;while(!test()){if(Date.now()>deadline)throw new Error("Import preview timed out");await new Promise(r=>setTimeout(r,30));}};
  const confirm=()=>{const b=o.app.stage.getChildByLabel("native-modal:onboarding:confirm",true);assert.ok(b);clickWithNativeInput(o.app,b);};
  const panel=()=>o.app.stage.getChildByLabel("native-form-panel",true)!;
  const height=panel().getBounds().height;
  assert.ok(!o.app.stage.getChildByLabel("native-modal:onboarding:close",true));
  o.management.handleKey({type:"down",key:"Escape"});assert.ok(o.management.modal);
  await capture("import-native-welcome-dark");confirm();
  await wait(()=>Boolean(o.app.stage.getChildByLabel("native-onboarding:step:1",true)));await new Promise(r=>setTimeout(r,200));
  assert.equal(panel().getBounds().height,height);await capture("import-native-preferences-light");
  const theme=o.app.stage.getChildByLabel("native-onboarding:theme:dark",true);assert.ok(theme);clickWithNativeInput(o.app,theme);await capture("import-native-preferences-dark");confirm();
  await wait(()=>Boolean(o.app.stage.getChildByLabel("native-onboarding:step:2",true)));await new Promise(r=>setTimeout(r,200));
  assert.equal(panel().getBounds().height,height);await capture("import-native-sources-dark");
  const flat=o.app.stage.getChildByLabel("native-onboarding:arrangement:flat",true);assert.ok(flat);clickWithNativeInput(o.app,flat);await capture("import-native-tree-flat");
  const group=o.app.stage.getChildByLabel("native-onboarding:arrangement:group",true);assert.ok(group);clickWithNativeInput(o.app,group);await capture("import-native-tree-group");
  const scroll=o.app.stage.getChildByLabel("native-scroll-view",true) as NativeScrollView;assert.ok(scroll.maxOffset>0);
  const wheel=new FederatedWheelEvent(new EventBoundary(o.app.stage));wheel.deltaY=600;wheel.deltaX=0;wheel.deltaMode=0;scroll.emit("wheel",wheel);
  assert.ok(scroll.offset>0);await capture("import-native-tree-scrolled");
  const back=o.app.stage.getChildByLabel("native-modal:onboarding:cancel",true)!;clickWithNativeInput(o.app,back);
  await wait(()=>Boolean(o.app.stage.getChildByLabel("native-onboarding:step:1",true)));await new Promise(r=>setTimeout(r,200));assert.equal(panel().getBounds().height,height);confirm();
  await wait(()=>Boolean(o.app.stage.getChildByLabel("native-onboarding:step:2",true)));await new Promise(r=>setTimeout(r,200));
  confirm();
  await wait(()=>Boolean(o.app.stage.getChildByLabel("native-modal:busy-spinner",true)));
  const loadingButton=o.app.stage.getChildByLabel("native-modal:onboarding:confirm",true)!;assert.equal(loadingButton.eventMode,"none");
  const spinner=o.app.stage.getChildByLabel("native-modal:busy-spinner",true)!;const rotation=spinner.rotation;
  await new Promise(r=>setTimeout(r,120));assert.notEqual(spinner.rotation,rotation);await capture("import-native-loading");
  await wait(()=>o.apps.presentation.importState.value.completed&&!o.management.modal);await o.save();
  await capture("import-native-desktop-grouped");
  await o.apps.rescanManagedApps();await o.present("manual selection");
  await capture("import-native-manual-selection");o.management.close(true);o.apps.scanResultModel.actions.close();
  assert.equal(o.apps.imports.count,0);
  const root=o.apps.presentation.scanRoots.value[0]!;
  const vm=o.apps.managedApps.value.find(app=>app.name===fixtures.toolA);assert.ok(vm);
  writeFileSync(join(root.path,fixtures.tools,"Config.url"),"[InternetShortcut]\r\nURL=https://example.invalid/import/tools-config\r\n");
  await o.apps.rescanManagedApps({automatic:true});await capture("import-native-new-pill");
  assert.equal(o.apps.imports.count,1);o.appDialogs.recent();await capture("import-native-recent-placement");
  assert.ok(o.apps.imports.rows.some(row=>row.suggested!=="desktop"&&row.suggested!=="new"));
  o.management.close(true);await o.save();
  writeFileSync(join(root.path,fixtures.tools,"Diagnostics.url"),"[InternetShortcut]\r\nURL=https://example.invalid/import/tools-diagnostics\r\n");
  writeFileSync(join(root.path,"Direct One.url"),"[InternetShortcut]\r\nURL=https://example.invalid/import/direct-one\r\n");
  writeFileSync(join(root.path,"Direct Two.url"),"[InternetShortcut]\r\nURL=https://example.invalid/import/direct-two\r\n");
  await o.apps.rescanManagedApps();await o.present("manual discoveries");
  const selectedId=o.apps.scanResultModel.apps.value[0]!.id;
  const checkbox=o.app.stage.getChildByLabel(`native-scan:select-${selectedId}`,true);assert.ok(checkbox);
  await new Promise(r=>setTimeout(r,200));
  const row=checkbox.parent;assert.ok(row);const children=[...row.children];
  for(let i=0;i<12;i++){
    o.apps.scanResultModel.actions.toggleSelection(selectedId,i%2===0);await o.present("selection-only update");
    assert.equal(o.app.stage.getChildByLabel(`native-scan:select-${selectedId}`,true),checkbox,"selection retains checkbox and row");
    assert.deepEqual(row.children,children,"selection retains loaded image nodes");
  }
  o.apps.scanResultModel.actions.selectAll();await o.present("selection restored");
  const next=o.app.stage.getChildByLabel("native-modal:scan-results:confirm",true);assert.ok(next);clickWithNativeInput(o.app,next);
  await wait(()=>o.apps.imports.mode==="manual"&&o.apps.imports.rows.length>0);await capture("import-native-manual-placement");
  const summary=o.app.stage.getChildByLabel("native-import:summary",true);assert.ok(summary);const summaryY=summary.getGlobalPosition().y;
  const placementScroll=o.app.stage.getChildByLabel("native-scroll-view",true) as NativeScrollView;
  placementScroll.scrollTo(placementScroll.maxOffset);await o.present("summary fixed while scrolling");assert.equal(summary.getGlobalPosition().y,summaryY);placementScroll.scrollTo(0);
  const choice=o.apps.imports.rows.find(r=>r.suggested!=="desktop")!;
  const option=o.app.stage.getChildByLabel(`native-import:option:${choice.key}:0`,true);assert.ok(option);
  for(let i=0;i<8;i++){o.apps.imports.choose(choice.key,i%2?choice.suggested:"desktop");await o.present("placement selection stable");assert.equal(o.app.stage.getChildByLabel(`native-import:option:${choice.key}:0`,true),option);}
  const apply=o.app.stage.getChildByLabel("native-modal:scan-results:confirm",true);assert.ok(apply);clickWithNativeInput(o.app,apply);
  await wait(()=>!o.management.modal);await o.save();assert.equal(o.apps.imports.count,0);
  o.showSources();await new Promise(r=>setTimeout(r,400));await capture("import-native-source-options");
  const help=o.app.stage.getChildByLabel(`native-apps:group-info-${root.id}`,true);assert.ok(help);clickWithNativeInput(o.app,help);
  await new Promise(r=>setTimeout(r,200));await capture("import-native-source-help");
  for(const mode of ["flat","new","after","group"]){const control=o.app.stage.getChildByLabel(`native-import-help:${mode}`,true);assert.ok(control);clickWithNativeInput(o.app,control);await capture(`import-native-help-mode-${mode}`);}
  assert.ok(o.app.stage.getChildByLabel("native-import-help:tree-lines",true));
  for(const stage of ["new","after","before","changes","move","dissolve","settings","flatRule","singleRule","folders"]){const tab=o.app.stage.getChildByLabel(`native-import-help:${stage}`,true);assert.ok(tab);clickWithNativeInput(o.app,tab);await capture(`import-native-help-${stage}`);}
  o.management.close(true);
  const excludedApp=o.apps.managedApps.value.find(a=>a.origin==="catalog");assert.ok(excludedApp);o.apps.excludeManagedAppFromScan(excludedApp);await o.present("excluded fixture");
  const excludedNav=o.app.stage.getChildByLabel("native-apps:excluded",true);assert.ok(excludedNav);let ancestor=excludedNav.parent;while(ancestor&&!(ancestor instanceof NativeScrollView))ancestor=ancestor.parent;if(ancestor instanceof NativeScrollView){ancestor.reveal(ancestor.content.toLocal(excludedNav.toGlobal({x:0,y:0})).y,72);await o.present("excluded navigation visible");}clickWithNativeInput(o.app,excludedNav);await new Promise(r=>setTimeout(r,350));
  const excluded=o.app.stage.getChildByLabel(`native-apps:excluded-${excludedApp.id}`,true);assert.ok(excluded);
  for(let i=0;i<8;i++){(excluded as NativeFluentToggle).toggle();await o.present("excluded selection stable");assert.equal(o.app.stage.getChildByLabel(`native-apps:excluded-${excludedApp.id}`,true),excluded);}
  console.log("Native import targeted preview: onboarding, source rules, initial grouping, saved layout and manual selection passed");
  writeFileSync(process.env.LAUNCHPAD_NATIVE_IMPORT_PROOF!,JSON.stringify({status:"passed",cases:["onboarding","initial-grouping","save","manual-selection","automatic-pill","recent-placement","manual-placement"]}));
  await o.quit();
}
