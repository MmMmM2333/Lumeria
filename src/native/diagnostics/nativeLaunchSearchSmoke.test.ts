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
    getSettingsShell, iconTextures, openSettings, present, scene, searchBar,
    searchQuery, settingsButton, showLaunchpad, smoke, waitFor,
  } = context;
  await iconTextures.prepareItems(collectTextureItems(currentFrame(), getLayoutPages()));
  await present("search benchmark warmed layout");
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
