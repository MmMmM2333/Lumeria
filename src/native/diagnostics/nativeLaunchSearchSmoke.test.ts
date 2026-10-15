import assert from "node:assert/strict";
import { existsSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { createNativeIconTextureRepository } from "../../rendering/native/nativeIconTextureLoader.js";
import type { NativeLaunchGhost } from "../../rendering/native/NativeLaunchGhost.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { NativeSettingsShell } from "../../rendering/native/NativeSettingsShell.js";
import type { SceneFocusedIcon,SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeDataHost } from "../nativeDataHost.js";
import { NativeLaunchError } from "../nativeDataProtocol.js";
import type { createNativeEditing } from "../nativeEditing.js";
import { collectTextureItems } from "../product/nativeTextureItems.js";

type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

type IconTextureRepository = ReturnType<typeof createNativeIconTextureRepository>;

type FrameLike = Readonly<{
  interaction: Readonly<{ focusedIcon: SceneFocusedIcon | null; isSearchMode: boolean }>;
  viewport: Readonly<{ activePageIndex: number; activePages: readonly (readonly (SceneItem | null)[])[] }>;
}>;

// Search-launch/index-invalidation and launch-bitmap verification. Both run
// only in smoke builds and terminate the process run, so each returns an
// explicit outcome instead of a bare early `return`.
export type NativeLaunchSearchSmokeContext = Readonly<{
  activateItem: (item: SceneItem) => Promise<void>;
  activePageItems: () => readonly SceneItem[];
  app: NativePixiApplication;
  capture: (name: string) => Promise<void>;
  closeSettings: () => void;
  currentFrame: () => FrameLike;
  editing: () => ReturnType<typeof createNativeEditing> | null;
  getLayoutPages: () => ReadonlyLaunchpadPages;
  getSettingsShell: () => NativeSettingsShell | null;
  iconTextures: IconTextureRepository;
  launchGhostView: NativeLaunchGhost;
  layoutIconSize: () => number;
  management: NativeManagement;
  nativeData: NativeDataHost;
  openSettings: () => void;
  present: (description: string) => Promise<void>;
  scene: NativeDesktopScene;
  searchBar: NativeSearchBar;
  searchQuery: () => string;
  settingsButton: Readonly<{ alpha: number; eventMode?: string }>;
  showLaunchpad: () => void;
  smoke: NativeSmokeSupport;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export type NativeLaunchSearchSmokeOutcome = Readonly<{ kind: "search" | "launch-visual" }>;

export async function runNativeSearchSmoke(
  context: NativeLaunchSearchSmokeContext,
): Promise<NativeLaunchSearchSmokeOutcome> {
  const {
    activateItem, activePageItems, app, closeSettings, currentFrame, editing, getLayoutPages,
    getSettingsShell, iconTextures, management, openSettings, present, scene, searchBar,
    searchQuery, settingsButton, showLaunchpad, smoke, waitFor,
  } = context;
  await iconTextures.prepareItems(collectTextureItems(currentFrame(), getLayoutPages()));
  await present("search benchmark warmed layout");
  await (await import("./nativeRecoverySearchSmoke.js")).runNativeRecoverySearchSmoke(context);
  await waitFor("search text session prepared before first key",()=>searchBar.input.focused && app.textInput.active);
  assert.equal(searchBar.explicitEditing,false,"ready text session must preserve result navigation mode");
  for(const query of ["","Word"])for(const explicitEditing of [false,true]){
    for(const dismissal of ["escape","outside","wheel","action","replace","resize"] as const){
      searchBar.setQuery(query);
      if(explicitEditing)searchBar.focusEditor();else searchBar.focusForTyping();
      searchBar.input.setSelectionRange(query.length);
      const selection={...searchBar.input.selection};
      const actions=[{label:"Keep search",run:()=>{}}];
      management.menu(180,140,actions);
      await present("search focus suspended by menu");
      assert.equal(searchBar.input.focused,false,"menus must suspend native search input");
      assert.equal(app.textInput.active,false);
      if(dismissal==="outside"){
        const layer=management.getChildByLabel("native-context-menu");assert.ok(layer);
        smoke.clickWithNativeInput(app,layer,0,0,true);
      }else if(dismissal==="wheel"){
        const x=app.contentSize.width/2,y=app.contentSize.height/2;
        app.nativeInput.emitPointer("pointermove",x,y,0);
        app.nativeInput.emitWheel(x,y,0,1,0);
      }else if(dismissal==="action"){
        const action=management.getChildByLabel("native-action:Keep search",true);assert.ok(action);
        smoke.clickWithNativeInput(app,action,0,0,true);
      }else if(dismissal==="resize")management.resize();
      else{
        if(dismissal==="replace")management.menu(220,180,actions);
        app.nativeInput.emitKey("down",{keyCode:27});app.nativeInput.emitKey("up",{keyCode:27});
      }
      await present("search focus restored after "+dismissal);
      assert.equal(management.modal,false,`query=${query}, editor=${explicitEditing}, dismissal=${dismissal}`);
      assert.equal(searchBar.input.focused,true,"closing a menu must restore native text input");
      assert.equal(app.textInput.active,true);
      assert.equal(searchBar.explicitEditing,explicitEditing,dismissal+" must preserve the search focus mode");
      assert.equal(searchQuery(),query,"menu dismissal must preserve the query");
      assert.deepEqual(searchBar.input.selection,selection,"menu dismissal must preserve the caret selection");
      assert.equal(searchBar.input.caretBlinkEnabled,Boolean(query)||explicitEditing);
      assert.equal(searchBar.input.alpha,query||explicitEditing?1:0);
      if(!query&&dismissal==="escape")await context.capture("search-menu-restored-"+(explicitEditing?"editor":"implicit"));
      if(query){
        app.nativeInput.emitKey("down",{keyCode:37});app.nativeInput.emitKey("up",{keyCode:37});
        assert.equal(searchBar.input.selection.start,query.length-(explicitEditing?1:0),"restored mode must route arrows to the caret or results");
      }
    }
  }
  searchBar.setQuery("");searchBar.focusForTyping();await present("implicit search restored after menu checks");
  console.log("Native menu search focus: empty/query, implicit/editor, six dismissal paths and arrow routing passed");
  app.textInput.updateComposition("Word");
  assert.equal(searchBar.input.value,"","preedit must not commit its text");
  assert.equal(searchQuery(),"Word","first IME composition must preview results without an ASCII focus trigger");
  await present("first IME preedit results");
  await context.capture("search-ime-first-preedit");
  for(const key of ["Enter","ArrowDown"," ","1","Escape"]){
    assert.equal(searchBar.handleKey({type:"down",key,isComposing:true}),false,"candidate navigation must stay with the IME");
  }
  app.textInput.commit("Word");
  app.nativeInput.emitKey("down",{keyCode:13,modifiers:16});
  app.nativeInput.emitKey("up",{keyCode:13});
  await present("IME confirmation must not launch");
  assert.equal(app.window.isVisible(),true);
  assert.equal(searchQuery(),"Word");assert.equal(searchBar.input.value,"Word");
  searchBar.input.selectAll();searchBar.input.beginComposition();searchBar.input.updateComposition("no-match",8);
  assert.equal(searchQuery(),"no-match");assert.equal(searchBar.input.value,"Word");
  searchBar.input.cancelComposition();assert.equal(searchQuery(),"Word","cancelling preedit must restore the committed query");
  searchBar.setQuery("");await present("implicit search ready again");
  const other=searchBar.host.create({width:180,height:30,value:"other"});app.stage.addChild(other);other.focus();
  await present("other editor owns native input");assert.equal(searchBar.host.focused,other,"passive search preparation must not steal another editor");
  other.destroy();await present("search resumes after editor disposal");
  assert.equal(searchBar.input.focused,true);
  editing()!.selection.begin({initialIds:["search-0"]});await present("selection mode suspends search");
  assert.equal(searchBar.input.focused,false);
  editing()!.selection.clear();await present("selection exits to prepared search");assert.equal(searchBar.input.focused,true);
  app.nativeInput.emitKey("down",{keyCode:87});app.nativeInput.emitText("w");app.nativeInput.emitKey("up",{keyCode:87});
  assert.equal(searchQuery(),"w","prepared native text must accept the first ASCII character exactly once");
  searchBar.setQuery("");
  const originalName=String(getLayoutPages().flat().find(item=>item.id==="search-0")!.name);
  editing()!.rename("search-0","微信");await present("Chinese application indexed");
  app.textInput.updateComposition("weixin");
  assert.equal(searchBar.input.value,"");assert.equal(searchQuery(),"weixin");
  assert.equal(activePageItems()[0]?.id,"search-0","uncommitted pinyin must match the Chinese application");
  await present("Chinese IME pinyin preview");await context.capture("search-ime-pinyin-preview");
  app.textInput.commit("微信");assert.equal(searchQuery(),"微信");
  assert.equal(activePageItems()[0]?.id,"search-0");
  await present("Chinese IME committed query");await context.capture("search-ime-chinese-commit");
  searchBar.input.selectAll();app.textInput.updateComposition("other");
  openSettings();await waitFor("settings take focus from composition",()=>Boolean(getSettingsShell()));
  await present("search composition cancelled by settings");
  assert.equal(searchBar.input.composing,false);assert.equal(searchBar.input.focused,false);
  assert.equal(searchQuery(),"微信","scope switch must discard preedit and retain committed query");
  closeSettings();await present("search resumes after settings");
  assert.equal(searchBar.input.focused,true);assert.equal(searchBar.explicitEditing,false);
  searchBar.setQuery("");editing()!.rename("search-0",originalName);await present("IME fixture restored");
  const {measureNativeSearch}=await import("../nativeSearchSmoke.js");
  const measured=await measureNativeSearch(app,searchBar,iconTextures,()=>present("search input presented"));
  assert.equal(measured.newSources,0,"warm search toggles must not decode replacement textures");
  searchBar.setQuery("w");await present("search result ready");
  // Search now realizes neighbouring pages instead of retaining every result.
  // Exercise navigation and same-result query reset through the real key route.
  const lastPage=currentFrame().viewport.activePages.length-1;
  assert.ok(lastPage>0,"search fixture must cover multiple pages");
  searchBar.focusForTyping();
  for(let page=1;page<=lastPage;page++){
    searchBar.handleKey({type:"down",key:"ArrowRight",ctrlKey:true});
    await present("search page navigation");
    assert.equal(currentFrame().viewport.activePageIndex,page);
  }
  await waitFor("last search page settled",()=>!scene.getMotionSnapshot().active);
  await context.capture("search-last-page");
  searchBar.setQuery("wo");await present("same results reset to first page");
  assert.equal(currentFrame().viewport.activePageIndex,0);
  assert.equal(activePageItems()[0]?.id,"search-0");
  await waitFor("search result reset settled",()=>!scene.getMotionSnapshot().active);
  await context.capture("search-first-page");
  searchBar.setQuery("w");await present("search launch query restored");
  const result=activePageItems().find(item=>item.id==="search-0");assert.ok(result);
  await activateItem(result);
  await waitFor("searched launch hides",()=>!app.window.isVisible());
  await waitFor("searched app starts",()=>existsSync(process.env.LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER!));
  assert.equal(searchQuery(),"");assert.equal(searchBar.input.value,"");
  showLaunchpad();await waitFor("search-free reopen",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
  assert.equal(searchBar.input.value,"");assert.equal(currentFrame().interaction.isSearchMode,false);
  searchBar.setQuery("w");await present("search before settings");
  openSettings();await waitFor("settings shown over search",()=>Boolean(getSettingsShell())&&getSettingsShell()!.transitionProgress>0.99);
  assert.equal(searchBar.alpha,1);assert.equal(settingsButton.alpha,1);
  assert.equal(searchBar.eventMode,"none");assert.equal(settingsButton.eventMode,"none");
  assert.equal(searchBar.input.focused,false);
  await smoke.captureSmokeFrame(app,"search-settings-header");
  closeSettings();await present("settings closed over search");
  assert.equal(searchBar.input.value,"w");assert.equal(searchBar.eventMode,"static");
  // Layout edits invalidate both index and cached nodes, including unchanged query text.
  editing()!.rename("search-0","Renamed application");await present("renamed search result");
  searchBar.setQuery("Word 0");assert.equal(activePageItems().some(item=>item.id==="search-0"),false);
  searchBar.setQuery("Renamed application");assert.equal(activePageItems()[0]?.id,"search-0");
  searchBar.setQuery("");
  await present("empty implicit search before dismissal");
  searchBar.focusForTyping();
  assert.equal(searchBar.input.caretBlinkEnabled,false,"empty prepared input must not run an invisible caret timer");
  app.nativeInput.emitKey("down",{keyCode:27});app.nativeInput.emitKey("up",{keyCode:27});
  await waitFor("Escape dismisses empty implicit search",()=>!app.window.isVisible());
  showLaunchpad();await waitFor("reopened search session ready",()=>searchBar.input.focused&&app.textInput.active);
  assert.equal(searchBar.explicitEditing,false);
  console.log("Native search launch clearing, settings header and index invalidation passed");
  writeFileSync(process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER!,JSON.stringify({search:"verified"}));
  return Object.freeze({ kind: "search" });
}

export async function runNativeLaunchVisualSmoke(
  context: NativeLaunchSearchSmokeContext,
): Promise<NativeLaunchSearchSmokeOutcome> {
  const {
    activateItem, app, currentFrame, launchGhostView, layoutIconSize, management, nativeData,
    scene, showLaunchpad, smoke, waitFor,
  } = context;
  const item=currentFrame().viewport.activePages.flat().find(item=>item?.id==="native-layout-icon");assert.ok(item);
  const originalLaunch=nativeData.launchApp.bind(nativeData),samples:unknown[]=[];
  const off=app.on("presented",()=>{
    if(launchGhostView.visible&&samples.length<240)samples.push({at:performance.now(),alpha:launchGhostView.alpha,scale:launchGhostView.scale.x,visible:app.window.isVisible()});
  });
  try{
    for(const outcome of ["success","cancelled","failure"] as const){
      if(outcome!=="success")nativeData.launchApp=async()=>{throw new NativeLaunchError(outcome==="cancelled"?"cancelled":"accessDenied","launch verification");};
      showLaunchpad();await waitFor("launch verification reopened",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
      await activateItem(item!);
      await waitFor("launch bitmap midpoint",()=>launchGhostView.visible&&launchGhostView.alpha>0.15&&launchGhostView.alpha<0.6);
      assert.equal(launchGhostView.getChildByLabel("native-launch-image")!.width,layoutIconSize());
      assert.ok(launchGhostView.getChildByLabel("native-launch-shadow"));
      await smoke.captureSmokeFrame(app,`launch-bitmap-${outcome}`);
      if(outcome==="failure"){
        await waitFor("real failure restores an error",()=>management.modal&&app.window.isVisible());
      }else{
        await waitFor("completed launch hides",()=>!app.window.isVisible());
        await new Promise(resolve=>setTimeout(resolve,100));
        assert.equal(app.window.isVisible(),false);assert.equal(management.modal,false);
        if(outcome==="success")await waitFor("launched fixture wrote marker",()=>existsSync(process.env.LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER!));
      }
    }
    writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"launch-presented-samples.json"),JSON.stringify(samples,null,2));
    writeFileSync(process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER!,JSON.stringify({launchVisual:"verified"}));
  }finally{off();nativeData.launchApp=originalLaunch;}
  return Object.freeze({ kind: "launch-visual" });
}
