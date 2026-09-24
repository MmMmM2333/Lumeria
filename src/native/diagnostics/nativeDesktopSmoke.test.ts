import assert from "node:assert/strict";
import { existsSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { LaunchpadPages } from "../../domain/launchpadLayout.js";
import type { NativeAppDialogs } from "../../rendering/native/NativeAppDialogs.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { SceneFocusedIcon,SceneItem } from "../../rendering/sceneFrame.js";
import { SEARCH_COMPOSITION_TEXT } from "../fixtures/searchComposition.js";
import { normalizeNativeCustomIcon } from "../nativeCustomIcon.js";
import { NativeDataHost,type NativeCatalogScanResult } from "../nativeDataHost.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { createNativeLayoutState,NativeNavigationKey } from "../nativeStartup.js";
import { makeNativeStartupFrame } from "../nativeStartup.js";

type NativeApps = ReturnType<typeof createLaunchpadApps>;
type NativeLayoutState = ReturnType<typeof createNativeLayoutState>;
type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

// Custom-icon editor, search/IME, selection, touch and drag/save round-trip
// verification. Product state is observed through live getters so the scenario
// never works on a stale frame or page array.
export type NativeDesktopSmokeContext = Readonly<{
  activePageItems: () => readonly SceneItem[];
  app: NativePixiApplication;
  appDialogs: () => NativeAppDialogs | null;
  apps: () => NativeApps;
  baselinePages: LaunchpadPages;
  catalogApps: NativeCatalogScanResult["apps"];
  capture: (name: string) => Promise<void>;
  chromeInset: () => number;
  click: (target: import("pixi.js").Container, button?: number, modifiers?: number) => void;
  commitEditedPages: (pages: LaunchpadPages) => void;
  contextMenu: (item: SceneItem | null, x: number, y: number) => void;
  currentFrame: () => Readonly<{ interaction: Readonly<{ focusedIcon: SceneFocusedIcon | null }>; viewport: Readonly<{ activePageIndex: number; activePages: readonly (readonly (SceneItem | null)[])[] }> }>;
  editItem: (item: SceneItem | null) => void;
  editing: () => ReturnType<typeof createNativeEditing> | null;
  folderFlow: import("../product/nativeInputRouter.js").NativeFolderFlow;
  isDesktopOpen: () => boolean;
  layoutState: NativeLayoutState;
  management: NativeManagement;
  nativeData: NativeDataHost;
  onDesktopPageIndexCommit: (index: number) => void;
  onKey: (event: NativeNavigationKey) => boolean;
  present: (description: string) => Promise<void>;
  saves: Readonly<{ flush(): Promise<void> }>;
  scene: NativeDesktopScene;
  searchBar: NativeSearchBar;
  searchQuery: () => string;
  selectionToolbar: Readonly<{ summaryText: string }>;
  smoke: NativeSmokeSupport;
  t: (key: string, values?: Record<string, string | number>) => string;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export async function runNativeDesktopSmoke(context: NativeDesktopSmokeContext): Promise<void> {
  const {
    activePageItems, app, appDialogs, apps, baselinePages, catalogApps, capture, chromeInset, click,
    commitEditedPages, contextMenu, currentFrame, editItem, editing, folderFlow, isDesktopOpen,
    layoutState, management, nativeData, onDesktopPageIndexCommit, onKey, present, saves, scene,
    searchBar, searchQuery, selectionToolbar, smoke, t, waitFor,
  } = context;
  const customSource=baselinePages.flat().find(item=>item.id==="native-layout-icon")?.customIconPath;
  assert.equal(typeof customSource,"string","runNativeElectrobun smoke fixture must provide its generated icon");
  const normalizedIcon=await normalizeNativeCustomIcon(customSource as string);
  const cachedIcon=await nativeData.cacheCustomIcon(normalizedIcon);
  assert.ok(existsSync(cachedIcon.iconPath),"normalized icon must be cached by the real Rust host");
  assert.equal(cachedIcon.iconDataUrl,normalizedIcon);
  assert.deepEqual(await nativeData.loadIconChoices(""),[],"empty target has no embedded icon choices");
  {
    const editor=apps().editorModel,chooser=apps().iconChooserModel;
    const loadNormally=nativeData.loadIconChoices,saveNormally=appDialogs()!.options.save,pickNormally=appDialogs()!.options.pickIcon;
    const {createCanvas}=await import("@napi-rs/canvas");
    const candidateCanvas=createCanvas(32,32),candidateContext=candidateCanvas.getContext("2d");
    const candidates=Array.from({length:121},(_,index)=>{
      candidateContext.fillStyle=`hsl(${index*3},75%,55%)`;candidateContext.fillRect(0,0,32,32);
      return {id:`fixture-${index}`,...cachedIcon,iconDataUrl:index?candidateCanvas.toDataURL("image/png"):cachedIcon.iconDataUrl};
    });
    nativeData.loadIconChoices=async()=>candidates;
    try{
      editor.actions.openCreate();appDialogs()!.sync();await present("new app editor rendered");
      const editField=(id:string,value:string)=>{
        const input=management.getChildByLabel(`native-editor:${id}`,true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
        assert.ok(input);click(input);input.selectAll();input.commitText(value);
      };
      editField("name","Native dialog fixture");editField("target","C:\\Windows\\System32\\notepad.exe");
      await present("editor executable args appear");assert.ok(management.getChildByLabel("native-editor:args",true));
      editField("args","--fixture");await present("editor live draft");assert.equal(editor.args.value,"--fixture");
      await capture("editor-reference-match");
      nativeData.loadIconChoices=async()=>{throw new Error("Embedded icon fixture could not be read.");};
      click(management.getChildByLabel("native-dialog:editor-icon",true)!);
      await waitFor("embedded icon load failure",()=>Boolean(chooser.error.value)&&management.activeId==="icon-chooser");await present("embedded icon error visible");
      assert.ok(management.getChildByLabel("native-dialog:icon-upload",true),"local image selection remains available after embedded icon failure");
      await capture("icon-candidate-load-error");onKey({type:"down",key:"Escape"});await present("failed chooser closed");
      nativeData.loadIconChoices=async()=>candidates;
      click(management.getChildByLabel("native-dialog:editor-icon",true)!);
      await waitFor("embedded icon candidates loaded",()=>management.activeId==="icon-chooser"&&chooser.choices.value.length===candidates.length);await present("candidate grid visible");
      const list=management.getChildByLabel("native-virtual-list",true) as import("../../rendering/native/ui/NativeVirtualList.js").NativeVirtualList;
      assert.ok(list.mountedCount<list.count,"candidate grid must virtualize offscreen rows");
      await capture("icon-candidate-grid");await present("candidate selection hit target");
      click(management.getChildByLabel("native-dialog:icon-choice-0",true)!);
      await waitFor("candidate returns to editor",()=>management.activeId==="editor");await present("selected editor icon");
      assert.equal(editor.iconDataUrl.value,cachedIcon.iconDataUrl);
      // A delayed upload result belongs to the chooser session that initiated it.
      let finishUpload!:(value:typeof cachedIcon|null)=>void;
      appDialogs()!.options.pickIcon=()=>new Promise(resolve=>{finishUpload=resolve;});
      click(management.getChildByLabel("native-dialog:editor-icon",true)!);
      await waitFor("upload chooser",()=>management.activeId==="icon-chooser"&&chooser.choices.value.length===candidates.length);await present("upload action visible");
      const upload=management.getChildByLabel("native-dialog:icon-upload",true)!;
      // The upload control follows the virtualized candidates and must be revealed by keyboard.
      for(let index=0;index<150&&!(upload as import("../../rendering/native/NativeFluentButton.js").NativeFluentButton).focused;index++)onKey({type:"down",key:"Tab"});
      assert.equal((upload as import("../../rendering/native/NativeFluentButton.js").NativeFluentButton).focused,true);await present("upload action revealed");click(upload);
      onKey({type:"down",key:"Escape"});await present("upload chooser cancelled");
      editor.actions.resetIcon();finishUpload(cachedIcon);await present("stale upload ignored");assert.equal(editor.iconDataUrl.value,null);
      nativeData.loadIconChoices=async()=>[];
      click(management.getChildByLabel("native-dialog:editor-icon",true)!);
      await waitFor("empty icon chooser ready",()=>management.activeId==="icon-chooser"&&!chooser.isLoading.value);await present("empty icon chooser");
      await capture("icon-chooser-empty-reference-match");onKey({type:"down",key:"Escape"});await present("empty chooser cancelled");
      assert.equal(editor.name.value,"Native dialog fixture","chooser cancellation preserves the editor draft");
      appDialogs()!.options.save=async()=>{throw new Error("smoke: editor save unavailable. ".repeat(24));};
      const countBefore=apps().managedApps.value.length;
      click(management.getChildByLabel("native-modal:editor:confirm",true)!);await present("editor save failed");
      assert.equal(management.activeId,"editor");assert.equal(editor.name.value,"Native dialog fixture");assert.equal(apps().managedApps.value.length,countBefore+1);
      await capture("editor-save-failure");
      const editorWindow={...app.window.getFrame()};
      try{
        app.window.setSize(480,420);
        await waitFor("narrow editor resized",()=>app.contentSize.width<=480&&app.contentSize.height<=420);
        await present("narrow editor with long error");
        const confirm=management.getChildByLabel("native-modal:editor:confirm",true)!;
        const cancel=management.getChildByLabel("native-modal:editor:cancel",true)!;
        for(const button of [confirm,cancel]){const bounds=button.getBounds();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=app.contentSize.width&&bounds.y+bounds.height<=app.contentSize.height,"error details must not displace footer controls outside a narrow viewport");}
        await capture("editor-narrow-long-error");
      }finally{
        app.window.setSize(editorWindow.width,editorWindow.height);
        await waitFor("editor window restored",()=>app.contentSize.width>480);
        await present("editor retry hit target");
      }
      appDialogs()!.options.save=saveNormally;click(management.getChildByLabel("native-modal:editor:confirm",true)!);
      await waitFor("editor retry saved",()=>!management.modal);
      assert.equal(apps().managedApps.value.length,countBefore+1,"retrying a newly created app must preserve its original id");
      const savedFixture=apps().managedApps.value.find(item=>item.name==="Native dialog fixture")!;
      assert.equal((await nativeData.loadLayout())!.pages.flat().filter(item=>item.id===savedFixture.id).length,1);
    }finally{
      nativeData.loadIconChoices=loadNormally;appDialogs()!.options.save=saveNormally;appDialogs()!.options.pickIcon=pickNormally;
      while(management.modal)management.close(true);commitEditedPages(baselinePages);await saves.flush();await present("editor fixture restored");
    }
  }
  {
    const pressSearchKey=(keyCode:number,modifiers=0)=>{
      app.nativeInput.emitKey("down",{keyCode,modifiers});
      app.nativeInput.emitKey("up",{keyCode,modifiers});
    };
    searchBar.setQuery("");searchBar.input.blur();
    pressSearchKey(0x09);assert.equal(searchBar.explicitEditing,true);
    pressSearchKey(0x09);
    assert.equal(searchBar.explicitEditing,false,"Tab back to an empty desktop must restore type-to-search");
    assert.equal(searchBar.input.focused,true,"Tab must preserve the text session even with an empty query");
    app.nativeInput.emitText("ed");assert.equal(searchQuery(),"ed","native text must arrive immediately after Tab back to desktop");
    pressSearchKey(0x08);assert.equal(searchQuery(),"e");
    pressSearchKey(0x1b);
    pressSearchKey(0x50);app.nativeInput.emitText("age");
    assert.equal(searchQuery(),"page","type-to-search must transfer the first key and accept subsequent native text");
    assert.equal(searchBar.explicitEditing,false);
    assert.ok(activePageItems().length>=2,"navigation fixture needs multiple search results");
    const firstResult=currentFrame().interaction.focusedIcon?.id;
    const searchCaret={...searchBar.input.selection};
    pressSearchKey(0x27);
    assert.notEqual(currentFrame().interaction.focusedIcon?.id,firstResult,"implicit Right must navigate search results");
    for(const arrow of [0x26,0x28,0x25,0x27]){
      pressSearchKey(arrow);
      assert.equal(searchBar.input.focused,true,"implicit arrows must preserve native text focus");
      assert.equal(searchBar.explicitEditing,false);
      assert.deepEqual(searchBar.input.selection,searchCaret,"implicit arrows must not move the text caret");
    }
    app.nativeInput.emitText(" w");assert.equal(searchQuery(),"page w","typing must continue after result navigation");
    pressSearchKey(0x08);assert.equal(searchQuery(),"page ","Backspace must edit after result navigation");
    pressSearchKey(0x08);assert.equal(searchQuery(),"page");
    await present("implicit search keyboard navigation");
    await capture("search-keyboard-navigation");
    pressSearchKey(0x09);
    assert.equal(searchBar.explicitEditing,true,"Tab must explicitly enter the search editor");
    const editorFocus=currentFrame().interaction.focusedIcon;
    pressSearchKey(0x25);
    assert.equal(searchBar.input.selection.start,3,"explicit Left must move the text caret");
    pressSearchKey(0x27);
    assert.equal(searchBar.input.selection.start,4,"explicit Right must move the text caret");
    pressSearchKey(0x26);pressSearchKey(0x28);
    assert.deepEqual(currentFrame().interaction.focusedIcon,editorFocus,"explicit arrows must not navigate results");
    pressSearchKey(0x09);
    assert.equal(searchBar.input.focused,true,"Tab back to results must keep the native text session");
    assert.equal(searchBar.explicitEditing,false,"Tab back must restore implicit result navigation");
    const resultBeforeTabArrow=currentFrame().interaction.focusedIcon?.id;
    pressSearchKey(0x27);
    assert.notEqual(currentFrame().interaction.focusedIcon?.id,resultBeforeTabArrow,"arrows after Tab back must navigate results");
    assert.equal(searchBar.input.selection.start,4,"result navigation after Tab must preserve the caret");
    pressSearchKey(0x08);assert.equal(searchQuery(),"pag","Backspace must work immediately after Tab back");
    app.nativeInput.emitText("ew");assert.equal(searchQuery(),"pagew","native text must continue without reactivating the input");
    searchBar.input.beginComposition();searchBar.input.updateComposition(SEARCH_COMPOSITION_TEXT,1);
    assert.equal(onKey({type:"down",key:"ArrowDown",isComposing:true}),false,"IME arrows must remain with composition");
    assert.equal(searchQuery(),`pagew${SEARCH_COMPOSITION_TEXT}`,"IME preedit must preview search without committing editor text");
    assert.equal(searchBar.input.value,"pagew");
    app.textInput.commit(SEARCH_COMPOSITION_TEXT);assert.equal(searchQuery(),`pagew${SEARCH_COMPOSITION_TEXT}`,"IME commit must survive implicit navigation");
    await present("implicit search before explicit pointer focus");
    click(searchBar.input);
    assert.equal(searchBar.explicitEditing,true,"clicking an already focused implicit editor must switch modes");
    searchBar.input.setSelectionRange(3);pressSearchKey(0x25);
    assert.equal(searchBar.input.selection.start,2,"mouse-focused editor must retain caret navigation");
    pressSearchKey(0x1b);
    assert.equal(searchQuery(),"");assert.equal(searchBar.input.focused,false);assert.equal(searchBar.explicitEditing,false);
    await present("keyboard search reset");
  }
  click(searchBar);
  assert.equal(searchBar.input.focused,true,"pointer click on search chrome must focus without exiting");
  assert.equal(searchBar.explicitEditing,true);
  searchBar.input.blur();
  await present("search blurred before child hit");
  click(searchBar.input);
  assert.equal(searchBar.input.focused,true,"pointer click on search editor must not start a desktop gesture");
  searchBar.input.beginComposition();searchBar.input.updateComposition("\u5df2\u52a0\u8f7d",3);
  assert.equal(searchQuery(),"\u5df2\u52a0\u8f7d","IME preedit must preview Chinese search");
  assert.equal(searchBar.input.value,"","IME preedit must not commit the editor value");
  searchBar.input.commitText("\u5df2\u52a0\u8f7d");
  assert.equal(activePageItems().length,1,"Chinese search should use shared matching");
  assert.equal(activePageItems()[0]?.id,"native-layout-icon");
  await new Promise<void>(resolve=>setTimeout(resolve,250));await present("native search results");await capture("search-chinese");
  searchBar.setQuery("yijiazai");
  assert.equal(activePageItems()[0]?.id,"native-layout-icon","pinyin search should match the original algorithm");
  searchBar.setQuery("no-such-app-xyz");assert.equal(activePageItems().length,0);
  await present("search clear hit target");
  const searchClear=app.stage.getChildByLabel("native-search-clear",true);assert.ok(searchClear);
  click(searchClear);
  assert.equal(searchQuery(),"","clear child pointer must clear the query");
  assert.equal(searchBar.input.focused,true,"clear child pointer must retain input focus");
  searchBar.input.blur();await present("search cleared");
  await waitFor("search clear restores desktop icon positions",()=>!scene.getMotionSnapshot().active);
  await present("desktop icon hit areas after search reset");
  const firstApp=app.stage.getChildByLabel("launchpad-item:native-layout-icon",true);assert.ok(firstApp);
  click(firstApp,2);await present("native context menu hit targets");
  assert.equal(management.modal,true);
  assert.ok(management.getChildByLabel(`native-action:${t("common.actions.open")}`,true));
  await capture("context-menu-app");management.close();
  {
    let activated="",returned=0;
    const restore=management.captureReturnFocus;management.captureReturnFocus=()=>()=>{returned++;};
    management.menu(app.contentSize.width,app.contentSize.height,[{label:"Unavailable",disabled:true,run:()=>{activated="disabled";}},{label:"First enabled",run:()=>{activated="first";}},{label:"Last enabled",run:()=>{activated="last";}}]);
    await present("menu bottom right clamped");
    for(const label of ["Unavailable","First enabled","Last enabled"]){const button=management.getChildByLabel(`native-action:${label}`,true)!;const b=button.getBounds();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=app.contentSize.width&&b.y+b.height<=app.contentSize.height);}
    onKey({type:"down",key:"Home"});onKey({type:"down",key:"Enter"});assert.equal(activated,"first");assert.equal(returned,1);
    management.menu(1,1,[{label:"Unavailable",disabled:true,run:()=>{activated="disabled";}},{label:"Last enabled",run:()=>{activated="last";}}]);
    onKey({type:"down",key:"End"});onKey({type:"down",key:"Enter"});assert.equal(activated,"last");assert.equal(returned,2);
    management.captureReturnFocus=restore;
    contextMenu(null,app.contentSize.width-1,app.contentSize.height-1);await present("menu before relocation");
    app.nativeInput.emitPointer("pointerdown",40,200,2,0);app.nativeInput.emitPointer("pointerup",40,200,2,0);
    await present("outside right click relocates menu");assert.equal(management.modal,true);
    await capture("context-menu-relocated");
    management.resize();assert.equal(management.modal,false,"viewport changes must dismiss stale menu geometry");
  }
  contextMenu(null,880,570);await present("surface context menu");await capture("context-menu-surface");
  const batchAction=management.getChildByLabel(`native-action:${t("launchpad.contextMenu.batchManage")}`,true);assert.ok(batchAction);
  click(batchAction);await present("native selection from context menu");
  assert.equal(editing()!.selection.isActive.value,true);
  click(firstApp);assert.deepEqual([...editing()!.selection.selectedIds.value],["native-layout-icon"]);
  const thirdApp=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(thirdApp);
  click(thirdApp,0,1);
  assert.deepEqual([...editing()!.selection.selectedIds.value],["native-layout-icon","native-webgpu","native-settings"],"Shift pointer range must include the intermediate app");
  await waitFor("selected pointer range settles",()=>!scene.getMotionSnapshot().active);
  await present("selected pointer range committed");
  const selectionBeforeCancel=[...editing()!.selection.selectedIds.value];
  {
    const {runNativeToolbarVisualSmoke}=await import("../../rendering/native/nativeToolbarVisualSmoke.test.js");
    const proof=await runNativeToolbarVisualSmoke(app,()=>present("toolbar visual parity"),capture);
    console.log("Native toolbar backdrop GPU proof",proof);
  }
  const sourceBounds=firstApp.getBounds(), sx=sourceBounds.x+sourceBounds.width/2,sy=sourceBounds.y+sourceBounds.height/2;
  assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(sx,sy)).kind,"icon","group drag must start on an icon");
  app.nativeInput.emitPointer("pointerdown",sx,sy,0,0);
  await new Promise<void>(resolve=>setTimeout(resolve,450));
  app.nativeInput.emitPointer("pointermove",sx+30,sy+30,0,0);
  await present("selected group drag started");
  assert.ok(editing()!.drag.isDragActive());
  app.nativeInput.emitPointer("pointermove",app.contentSize.width/2,30+chromeInset(),0,0);
  await present("selected group over cancel zone");
  assert.equal(editing()!.drag.groupDragState.value?.cancelArmed,true);
  assert.ok(selectionToolbar.summaryText.includes(t("launchpad.batch.releaseToCancel")));
  await capture("selection-cancel-zone");
  app.nativeInput.emitPointer("pointerup",app.contentSize.width/2,30+chromeInset(),0,0);
  await waitFor("selected group cancelled return",()=>!editing()!.drag.isDragActive());
  assert.deepEqual(layoutState.presentation.pages.value,baselinePages,"cancel-zone drop must preserve layout");
  assert.deepEqual([...editing()!.selection.selectedIds.value],selectionBeforeCancel,"cancel-zone drop must preserve selection");
  onKey({type:"down",key:"Alt"});await new Promise<void>(resolve=>setTimeout(resolve,550));
  assert.equal(editing()!.mode.value,false,"Alt must remain blocked in selection mode");
  onKey({type:"up",key:"Alt"});
  onKey({type:"down",key:"q"});
  onKey({type:"down",key:"Enter"});
  assert.equal(searchQuery(),"","selection mode must suppress printable search");
  assert.equal(management.modal,false,"selection Enter must not launch or edit");
  const selectedBeforeBlank=[...editing()!.selection.selectedIds.value];
  const blankPoint={x:app.contentSize.width-60,y:app.contentSize.height-110};
  assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(blankPoint.x,blankPoint.y)).kind,"surface");
  app.nativeInput.emitPointer("pointerdown",blankPoint.x,blankPoint.y,0);
  app.nativeInput.emitPointer("pointerup",blankPoint.x,blankPoint.y,0);
  await present("selection blank click keeps launchpad open");
  assert.equal(isDesktopOpen(),true);
  assert.equal(editing()!.selection.isActive.value,true);
  assert.deepEqual([...editing()!.selection.selectedIds.value],selectedBeforeBlank);
  const secondDot=app.stage.getChildByLabel("native-page-dot:1",true);assert.ok(secondDot);
  click(secondDot);await present("selection hidden on second page");
  assert.ok(selectionToolbar.summaryText.includes(t("launchpad.batch.hiddenCount",{count:3})));
  await capture("selection-hidden-count");
  onKey({type:"down",key:"Escape"});await present("selection escaped");
  assert.equal(editing()!.selection.isActive.value,false);
  const homeDot=app.stage.getChildByLabel("native-page-dot:0",true);assert.ok(homeDot);
  click(homeDot);
  await waitFor("selection test page restoration",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX)<0.05);
  await present("selection page restored");
  onKey({type:"down",key:"Alt"});
  assert.equal(editing()!.mode.value,false,"Alt must not enter edit immediately");
  await new Promise<void>(resolve=>setTimeout(resolve,550));
  assert.equal(editing()!.mode.value,true,"holding Alt must enter shared edit mode");
  onKey({type:"up",key:"Alt"});
  assert.equal(editing()!.mode.value,false,"Alt release must exit edit mode");
  const pointer=(type:string,x:number,y:number,id=17)=>app.nativeInput.emitPointer(type,x,y,0,0,undefined,{pointerId:id,pointerType:"touch",isPrimary:id===17});
  pointer("pointerdown",app.contentSize.width-30,app.contentSize.height/2);
  pointer("pointermove",app.contentSize.width/2,app.contentSize.height/2);
  pointer("pointerdown",20,100,18);pointer("pointerup",20,100,18);
  pointer("pointerup",app.contentSize.width/2,app.contentSize.height/2);
  await waitFor("touch page commit",()=>currentFrame().viewport.activePageIndex===1);
  onDesktopPageIndexCommit(0);await present("touch reset");
  await waitFor("touch reset settle",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX)<0.05);
  pointer("pointerdown",app.contentSize.width-30,app.contentSize.height/2);
  pointer("pointermove",app.contentSize.width/2,app.contentSize.height/2);
  pointer("pointercancel",app.contentSize.width/2,app.contentSize.height/2);
  await present("touch cancellation committed");
  await waitFor("touch cancelled return",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX)<0.05);
  await present("touch cancellation settled hit testing");
  assert.equal(currentFrame().viewport.activePageIndex,0);
  const dragNode=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(dragNode);
  const start=dragNode.getBounds();
  assert.ok(start.x >= 0 && start.x+start.width <= app.contentSize.width,"drag source must be on screen");
  assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(start.x+start.width/2,start.y+start.height/2)).kind,"icon","mouse drag source must remain hit-testable after touch cancellation");
  app.nativeInput.emitPointer("pointermove",start.x+start.width/2,start.y+start.height/2,0);
  app.nativeInput.emitPointer("pointerdown",start.x+start.width/2,start.y+start.height/2,0);
  await new Promise<void>(resolve=>setTimeout(resolve,450));
  app.nativeInput.emitPointer("pointermove",start.x+start.width/2+35,start.y+start.height/2+30,0);
  await present("native drag preview");
  assert.ok(editing()?.drag.isDragActive(),"native mouse movement must enter shared drag");
  editing()!.drag.cancelDrag({userInitiatedCancel:true});
  app.nativeInput.emitPointer("pointerup",start.x+start.width/2+35,start.y+start.height/2+30,0);
  await waitFor("drag cancellation release",()=>!editing()!.drag.isDragActive());
  await waitFor("cancelled drag geometry settles",()=>!scene.getMotionSnapshot().active);
  await present("drag source restored");
  const moveNode=app.stage.getChildByLabel("launchpad-item:native-settings",true);assert.ok(moveNode);
  const moveBounds=moveNode.getBounds();const mx=moveBounds.x+moveBounds.width/2,my=moveBounds.y+moveBounds.height/2;
  assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(mx,my)).kind,"icon","reorder source must be hit-testable after the return animation");
  app.nativeInput.emitPointer("pointerdown",mx,my,0);await new Promise<void>(resolve=>setTimeout(resolve,450));
  app.nativeInput.emitPointer("pointermove",mx+30,my+25,0);await present("drag start for committed reorder");
  assert.ok(editing()!.drag.isDragActive(),"the second mouse gesture must start a new drag after cancellation");
  app.nativeInput.emitPointer("pointermove",app.contentSize.width-100,my+80,0);await present("drag reorder destination");
  app.nativeInput.emitPointer("pointerup",app.contentSize.width-100,my+80,0);
  await waitFor("committed drag release",()=>!editing()!.drag.isDragActive());await saves.flush();
  assert.notDeepEqual(layoutState.presentation.pages.value,baselinePages,"a drop into an empty desktop slot must change layout");
  editing()!.commit(baselinePages);await saves.flush();await present("baseline restored after reorder");
  {
    const {runNativeDragVisualSmoke}=await import("../../rendering/native/nativeDragVisualSmoke.test.js");
    const proof=await runNativeDragVisualSmoke({app,scene,editing:editing()!,folder:folderFlow,
      pages:()=>layoutState.presentation.pages.value,clone:layoutState.operations.clonePages,
      present:reason=>present(reason),capture});
    writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"drag-visual-parity.json"),JSON.stringify(proof,null,2));
    console.log(`Native drag visual parity: ${proof.samples.length} presented white-frame samples across ${proof.hoverReentries} reentries passed`);
  }
  editing()!.rename("native-layout-icon","Save roundtrip");await saves.flush();
  await (await import("../../rendering/native/nativeDragNavigationSmoke.test.js")).runNativeDragNavigationSmoke(context);
  const persisted=await nativeData.loadLayout();assert.ok(persisted);
  assert.equal(makeNativeStartupFrame(persisted,catalogApps).viewport.activePages[0]?.[0]?.name,"Save roundtrip");
  editing()!.commit(baselinePages);await saves.flush();
  await present("restored isolated layout");
  editing()!.selection.begin({initialIds:["native-layout-icon","native-webgpu"],primaryId:"native-layout-icon"});
  await present("selected applications");
  assert.equal(editing()!.createFolder(),true,"multi-select folder creation must start the original group transfer");
  await waitFor("group folder creation release",()=>!editing()!.drag.isDragActive());
  await saves.flush();
  const created=layoutState.presentation.pages.value.flat().find(item=>item.type==="folder" && item.id!=="native-folder" && item.id!=="native-folder-other");
  assert.ok(created?.type==="folder" && created.childPages.flat().some(item=>item?.id==="native-layout-icon"));
  await capture("edited-folder-created");
  const freshHost=new NativeDataHost();
  try {await freshHost.connect();const saved=await freshHost.loadLayout();assert.ok(saved);assert.ok(saved.pages.flat().some(item=>item.id===created.id),"a restarted Rust host must read committed folder creation");}
  finally {await freshHost.dispose();}
  editing()!.commit(baselinePages);await saves.flush();await present("baseline restored after editing");
  editItem(activePageItems().find(item=>item.id==="native-settings")??null);
  await new Promise<void>(resolve=>setTimeout(resolve,200));await present("native application edit form");await capture("application-edit-dialog");
  const initialField=management.getChildByLabel("native-editor:name",true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;assert.ok(initialField);click(initialField);
  management.form(t("dialogs.appEditor.changeIcon"),[],t("common.actions.cancel"),()=>{});
  assert.equal(management.modal,true,"nested form must retain the parent editing session");
  onKey({type:"down",key:"Escape"});
  assert.equal(searchBar.host.focused,initialField,"closing nested form must restore the parent field focus");
  assert.equal(management.modal,true,"closing nested form must not close its parent");
  click(management.getChildByLabel("native-modal:editor:cancel",true)!);
  assert.equal(management.modal,false,"Space on the focused Cancel button must close the dialog");
  await present("edit dialog cancelled");
  editItem(activePageItems().find(item=>item.id==="native-settings")??null);
  await present("reopened application editor hit targets");
  click(management.getChildByLabel("native-modal:editor:confirm",true)!);
  onKey({type:"down",key:"Escape"});
  assert.equal(management.modal,true,"Escape cannot destroy an in-flight form submission");
  await waitFor("Enter submits native edit form",()=>!management.modal);
  console.log("Native search/IME/touch/drag cancellation/save roundtrip smoke passed");
}
