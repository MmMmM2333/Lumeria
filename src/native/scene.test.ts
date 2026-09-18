import assert from "node:assert/strict";
import { createNativeRecordSnapshot } from "../rendering/native/nativeSceneSnapshot.js";
import { createNativeSceneScheduler } from "./nativeSceneScheduler.js";
import { createLaunchpadGestureEngine } from "../domain/input/launchpadGestureEngine.js";
import { runTouchpadCaptureTests } from "../debug/touchpadCapture.test.js";
import { runNativeWindowEffectsTests } from "./nativeWindowEffects.test.js";
import { readFileSync } from "node:fs";
import { Container, type Text } from "pixi.js";
import { resolveNativePointerTarget, routeNativePointerDown } from "../rendering/native/nativePointerTarget.js";
import { closingFolderTargetLabel } from "../domain/input/launchpadPointerTarget.js";
import { assertLayoutDocument } from "../domain/layoutDocument.js";
import {
  assertCompleteDesktopSceneFrame,
  makeDesktopSceneFrame,
  type CompleteDesktopSceneFrame,
  type DesktopSceneFrameInput,
} from "../rendering/sceneFrame.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";
import { assertNativeScenePixels } from "./nativePixelProof.js";
import { NativeDesktopScene } from "../rendering/native/NativeDesktopScene.js";
import { runNativeDesktopResizeTests } from "../rendering/native/nativeDesktopSceneResize.test.js";
import { runNativeLabelRasterTests } from "../rendering/native/nativeLabelRaster.test.js";
import { runNativeVisualParityTests } from "../rendering/native/nativeVisualParity.test.js";
import { runNativeSettingsLayoutTests } from "../rendering/native/nativeSettingsLayout.test.js";
import { NativePageDots } from "../rendering/native/NativePageDots.js";
import { NativeSettingsShell } from "../rendering/native/NativeSettingsShell.js";
import { NativeFluentButton } from "../rendering/native/NativeFluentButton.js";
import { NativeFluentToggle } from "../rendering/native/NativeFluentToggle.js";
import { NativeFluentSlider } from "../rendering/native/NativeFluentSlider.js";
import { NativeScrollView } from "../rendering/native/NativeScrollView.js";
import { nativeFluentIcon } from "../rendering/native/nativeFluentIcons.js";
import { createNumericControlModel } from "../domain/numericControl.js";
import { colorHsv, hsvColor } from "../domain/colorPicker.js";
import { createSettingsNavigation, SETTINGS_SUBPAGE_SPECS } from "../application/settingsNavigation.js";
import { createNativeStateHost } from "../application/stateHost.js";
import { createNativeShortcut, nativeShortcutAccelerator } from "./nativeShortcut.js";
import {
  createNativeFolderFlow,
  type NativeFolderItem,
  type NativeFolderPresentation,
} from "../rendering/native/nativeFolderFlow.js";
import { PIXI_UI_FONT_FAMILY } from "../rendering/typography.js";
import {
  getNativePageTurnFromKey,
  makeNativeStartupFrame,
  makeNativeStartupScanRequest,
  setNativeDesktopPage,
} from "./nativeStartup.js";

installNativeCanvasTestAdapter();
for(const color of [0,0xffffff,0xff0000,0x00ff00,0x0000ff,0x336699,0x808080]){
  assert.equal(hsvColor(...colorHsv(color)),color,"color picker RGB/HSV conversion must roundtrip");
}
{
  let activated=0,focused=false,committed=0,finishApply!:()=>void,rejectApply!:(error:Error)=>void;
  const shell=new NativeSettingsShell({
    navigation:createSettingsNavigation(createNativeStateHost(()=>{}),key=>key),tabs:["general"],
    theme:()=>"dark",size:()=>({width:900,height:600}),t:key=>key,invalidate:()=>{},close:()=>{},
    apply:()=>new Promise<void>((resolve,reject)=>{assert.ok(committed>0,"apply must commit pending input first");finishApply=resolve;rejectApply=reject;}),
    content:()=>{
      const node=new Container({label:"test-settings-control"});
      return {node,height:40,dispose:()=>{},controls:[{node,disabled:()=>false,
        commit:()=>{committed++;},focus:active=>{focused=active;},handleKey:()=>{activated++;return true;}}]};
    },
  });
  for(let index=0;index<4;index++)shell.handleKey({type:"down",key:"Tab"});
  assert.ok(focused,"Tab reaches the page control");
  shell.redraw();assert.ok(focused,"same-route redraw preserves control focus");
  const apply=shell.getChildByLabel("native-action:common.actions.apply",true) as NativeFluentButton;
  const cancel=shell.getChildByLabel("native-action:common.actions.cancel",true);
  apply.activate();assert.ok(shell.applying);
  apply.activate();assert.equal(apply.disabled,false,"busy save must not flash disabled button colors");
  shell.handleKey({type:"down",key:"Enter"});
  assert.equal(activated,0,"submitting settings blocks keyboard mutations");
  let canClose=false;
  const closing=shell.waitForApply().then(()=>{canClose=true;});
  await Promise.resolve();assert.equal(canClose,false,"close must await the pending settings transaction");
  finishApply();await closing;
  assert.equal(canClose,true);
  assert.equal(shell.getChildByLabel("native-action:common.actions.apply",true),apply,"apply button survives save completion");
  assert.equal(shell.getChildByLabel("native-action:common.actions.cancel",true),cancel,"cancel button survives save completion");
  (shell.getChildByLabel("native-action:common.actions.apply",true) as NativeFluentButton).activate();
  const failedClose=shell.waitForApply();
  rejectApply(new Error("settings apply failed"));
  await assert.rejects(failedClose,/settings apply failed/,"failed settings must veto the pending close");
  assert.equal(shell.applying,false,"failure must permit a retry");
  (shell.getChildByLabel("native-action:common.actions.apply",true) as NativeFluentButton).activate();
  const retriedClose=shell.waitForApply();finishApply();await retriedClose;
  shell.destroy();
}

{
  const registered=new Set<string>();
  const shortcut=createNativeShortcut({
    register:accelerator=>{if(accelerator==="Alt+F9")return false;registered.add(accelerator);return true;},
    unregister:accelerator=>registered.delete(accelerator),
  },()=>{});
  assert.equal(nativeShortcutAccelerator("control+shift+KeyN"),"Control+Shift+N");
  assert.equal(shortcut.apply("alt+Space").ok,true);
  assert.equal(shortcut.apply("alt+F9").ok,false);
  assert.deepEqual([...registered],["Alt+Space"],"failed replacement must retain previous shortcut");
  shortcut.suspend();assert.equal(registered.size,0);
  shortcut.resume();assert.equal(registered.has("Alt+Space"),true);
  shortcut.dispose();assert.equal(registered.size,0);
}
{
  for(const name of ["settings-24-regular","navigation-24-regular","paint-brush-24-regular","apps-24-regular","info-24-regular","dismiss-16-regular","arrow-left-20-regular"] as const){
    const icon=nativeFluentIcon(name,0xffffff);
    assert.ok(icon.width>0&&icon.height>0,`Fluent path ${name} must render without a DOM`);
    const texture=icon.texture;
    assert.equal(texture.source.format,"rgba8unorm","Fluent pixels must retain RGBA channel order");
    icon.destroy();assert.ok(texture.destroyed,"Fluent icon owns and releases its raster texture");
  }
  const thin=nativeFluentIcon("add-20-regular","rgba(255,255,255,0.56)",16);
  const source=thin.texture.source;
  assert.equal(source.autoGenerateMipmaps,true,"downscaled thin strokes need coverage-preserving mip levels");
  assert.equal(source.alphaMode,"premultiplied-alpha");
  const rgba=source.resource as Uint8Array;let covered=0;
  for(let i=0;i<rgba.length;i+=4){assert.ok(rgba[i]!<=rgba[i+3]!,"filtered RGB must already contain alpha");if(rgba[i+3]!>0)covered++;}
  assert.ok(covered>0);thin.destroy();
}
{
  const number=createNumericControlModel({min:0,max:1,step:0.01});
  assert.equal(number.normalizeValue(0.333),0.33);
  assert.equal(number.parseNumber("0,25"),0.25);
  assert.equal(number.formatValue(0.5),"0.5");
  assert.equal(number.normalizeValue(9),1);
  const navigation=createSettingsNavigation(createNativeStateHost(()=>{}),key=>key);
  navigation.openSubPage(SETTINGS_SUBPAGE_SPECS.appsAppManager);
  assert.equal(navigation.activeRoute.value.tabId,"apps");
  assert.equal(navigation.activeRoute.value.depth,1);
  navigation.closeSubPage();
  assert.equal(navigation.activeRoute.value.depth,0);
  assert.equal(navigation.routeTransitionName.value,"settings-route-back");
}

for(const theme of ["light","dark"] as const){
  let calls=0;
  const button=new NativeFluentButton("Apply",96,()=>calls++,()=>{},theme,"primary");
  button.activate();button.disabled=true;button.activate();
  assert.equal(calls,1,"disabled Fluent button must not activate");
  button.disabled=false;button.focused=true;button.destroy({children:true});
  const subtle=new NativeFluentButton("",24,()=>{},()=>{},theme,"subtle");
  const painted:string[]=[];subtle.addStateGraphic((_node,color)=>{painted.push(color);});
  const enabledIcon=painted.at(-1);subtle.disabled=true;assert.notEqual(painted.at(-1),enabledIcon,"icon drawing must receive disabled foreground");
  subtle.disabled=false;assert.equal(painted.at(-1),enabledIcon);subtle.destroy({children:true});
  const toggle=new NativeFluentToggle("switch",()=>calls++,()=>{},theme);
  toggle.toggle();assert.equal(toggle.checked,true);
  toggle.disabled=true;toggle.toggle();assert.equal(toggle.checked,true);toggle.destroy();
  const slider=new NativeFluentSlider(200,0,1,0.1,0,()=>calls++,()=>{},theme);
  slider.handleKey("ArrowRight");slider.handleKey("ArrowRight");slider.handleKey("ArrowRight");
  assert.equal(slider.value,0.3,"fractional slider steps must remain exact");
  slider.handleKey("End");slider.handleKey("ArrowRight");assert.equal(slider.value,1);
  slider.disabled=true;assert.equal(slider.handleKey("Home"),false);slider.destroy({children:true});
  const scroll=new NativeScrollView(()=>{},()=>{},theme);
  scroll.resize(200,100,1000);scroll.scrollTo(950);assert.equal(scroll.offset,900);
  scroll.reveal(20,30);assert.equal(scroll.offset,20);
  scroll.resize(200,100,50);assert.equal(scroll.offset,0);scroll.destroy();
}

{
  const root = new Container();
  const chrome = new Container({ label: "native-search-bar" });
  const unlabelled = new Container();
  root.addChild(chrome); chrome.addChild(unlabelled);
  assert.deepEqual(resolveNativePointerTarget(unlabelled), { kind: "control" }, "unlabelled search children must belong to the input, not desktop gestures");
  const title = new Container({ label: "native-folder-name" });root.addChild(title);title.addChild(unlabelled);
  assert.deepEqual(resolveNativePointerTarget(unlabelled), { kind: "control" }, "folder title descendants must not enter desktop pointer or context menu handling");
  const notice=new Container({label:"native-notice"});root.addChild(notice);notice.addChild(unlabelled);
  assert.deepEqual(resolveNativePointerTarget(unlabelled),{kind:"control"},"notification descendants must not dismiss the desktop through captured blank-click gestures");
  const icon = new Container({ label: "launchpad-item:app" });
  icon.addChild(unlabelled); root.addChild(icon);
  assert.deepEqual(resolveNativePointerTarget(unlabelled), { kind: "icon", id: "app" });
  root.addChild(unlabelled);
  assert.deepEqual(resolveNativePointerTarget(unlabelled), { kind: "surface" });
  assert.deepEqual(resolveNativePointerTarget(null), { kind: "surface" });
  root.destroy({ children: true });
}

{
  // Problem 1: a press on a detached closing residual must not reopen the folder
  // on pointer down. The residual states which folder it belongs to, and the
  // pointer-down route sends it through the ordinary icon gesture path.
  const root = new Container();
  const residual = new Container({ label: closingFolderTargetLabel("folder-closing-a") });
  const residualChild = new Container();
  residual.addChild(residualChild); root.addChild(residual);
  assert.deepEqual(resolveNativePointerTarget(residualChild), { kind: "closingFolder", id: "folder-closing-a" }, "a closing residual descendant must resolve to the folder identity it still belongs to");
  assert.deepEqual(resolveNativePointerTarget(residual), { kind: "closingFolder", id: "folder-closing-a" }, "a closing residual must resolve to its folder identity directly");

  const route = (
    target: Parameters<typeof routeNativePointerDown>[0]["target"],
    overrides: Readonly<{
      hasModal?: boolean;
      hasSettingsShell?: boolean;
      isActiveDesktopItem?: (id: string) => boolean;
      isClosing?: boolean;
      scopeArea?: string;
    }> = {},
  ) => routeNativePointerDown({
    hasModal: overrides.hasModal ?? false,
    hasSettingsShell: overrides.hasSettingsShell ?? false,
    isActiveDesktopItem: overrides.isActiveDesktopItem ?? (id => id === "folder-closing-a"),
    isClosing: overrides.isClosing ?? true,
    scopeArea: overrides.scopeArea ?? "desktop",
    target,
  });

  assert.deepEqual(route(resolveNativePointerTarget(residual)), { kind: "gesture", target: { id: "folder-closing-a", kind: "icon" } }, "pressing a closing residual must enter the icon gesture path so the reopen handler cannot steal the hold");
  assert.deepEqual(route(resolveNativePointerTarget(residual), { isClosing: false }), { kind: "gesture", target: { id: "folder-closing-a", kind: "icon" } }, "a residual that outlives the closing flag still routes by its own folder identity");
  assert.deepEqual(route({ kind: "surface" }), { kind: "defer" }, "a blank press during the closing animation must keep deferring so the desktop dismiss path is untouched");
  assert.deepEqual(route({ kind: "surface" }, { isClosing: false }), { kind: "gesture", target: { kind: "surface" } }, "a blank desktop press outside a closing animation still reaches the gesture engine");
  assert.deepEqual(route({ kind: "icon", id: "app-x" }, { isActiveDesktopItem: id => id === "app-x" }), { kind: "gesture", target: { id: "app-x", kind: "icon" } }, "another desktop icon must still open while a folder closes");
  assert.deepEqual(route({ kind: "icon", id: "app-x" }), { kind: "defer" }, "a desktop icon that is not on the active page must keep deferring during a close");
  assert.deepEqual(route({ kind: "control" }), { kind: "defer" }, "Pixi controls must keep their own handler");
  assert.deepEqual(route(resolveNativePointerTarget(residual), { hasModal: false, hasSettingsShell: true }), { kind: "defer" }, "settings retain input ownership over a closing residual");
  assert.deepEqual(route(resolveNativePointerTarget(residual), { isActiveDesktopItem:()=>false }), {kind:"defer"}, "retired or off-page folders cannot acquire a gesture");
  root.destroy({ children: true });
}

{
  // The shared gesture engine owns the closing-residual press: down never
  // activates, a short tap reopens, and a hold/move drags without reopening.
  const viewport = { scope: "desktop", pageIndex: 0, pageCount: 2, pageWidth: 900 };
  const target = { id: "folder-closing-a", kind: "icon" } as const;
  const press = (engine: ReturnType<typeof createLaunchpadGestureEngine>) => engine.dispatch({
    type: "pointerDown", pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, x: 200, y: 220, time: 0, target, viewport,
  });

  const tapEngine = createLaunchpadGestureEngine();
  const tapPress = press(tapEngine);
  assert.equal(tapPress.commands.length, 0, "pointer down on a closing residual must not activate the folder");
  const tapRelease = tapEngine.dispatch({ type: "pointerUp", pointerId: 7, pointerType: "mouse", x: 201, y: 221, time: 90 });
  assert.deepEqual(tapRelease.commands, [{ type: "activateTarget", target }], "a short tap on a closing residual must reopen that folder once");

  const dragEngine = createLaunchpadGestureEngine();
  assert.equal(press(dragEngine).commands.length, 0, "pointer down must not activate before the hold deadline");
  dragEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  const dragStart = dragEngine.dispatch({ type: "pointerMove", pointerId: 7, pointerType: "mouse", buttons: 1, x: 240, y: 260, time: 460 });
  assert.equal(dragStart.commands.length, 1, "a hold then move must hand off to the icon drag path");
  assert.equal(dragStart.commands[0]?.type, "startDrag", "the closing residual hold must start a normal icon drag");
  const dragFinish = dragEngine.dispatch({ type: "pointerUp", pointerId: 7, pointerType: "mouse", x: 260, y: 280, time: 520 });
  assert.equal(dragFinish.commands[0]?.type, "finishDrag", "releasing the residual drag must finish through the atomic drag path without reopening");
  assert.equal(dragFinish.commands.filter(command => command.type === "activateTarget").length, 0, "finishing a residual drag must not activate the folder");

  const cancelEngine = createLaunchpadGestureEngine();
  press(cancelEngine);
  const cancelled = cancelEngine.dispatch({ type: "pointerCancel", pointerId: 7, pointerType: "mouse", x: 200, y: 220, time: 60 });
  assert.equal(cancelled.commands.length, 0, "cancelling a closing-residual press must not open the folder");
}

const savedLayout = assertLayoutDocument(JSON.parse(readFileSync(
  new URL("../domain/fixtures/layout-v2-roundtrip.json", import.meta.url),
  "utf8",
)) as unknown);
const savedStartupFrame = makeNativeStartupFrame(savedLayout, []);
{
  const dots=new NativePageDots(()=>{});
  const frame:CompleteDesktopSceneFrame={
    ...savedStartupFrame,
    viewport:{...savedStartupFrame.viewport,activePages:[[{id:"folder",type:"folder",childPages:[[{id:"child",type:"app"}]]}],[]]},
    interaction:{...savedStartupFrame.interaction,isBatchSelectionActive:true,selectedAppIds:new Set(["child"])},
  };
  dots.update(frame,1000,700,false);
  assert.equal(dots.getChildByLabel("native-page-selection:0",true)?.visible,true,"a selected folder child must mark its desktop page");
  assert.equal(dots.getChildByLabel("native-page-selection:1",true)?.visible,false);
  dots.update({...frame,interaction:{...frame.interaction,isBatchSelectionActive:false}},1000,700,false);
  assert.equal(dots.getChildByLabel("native-page-selection:0",true)?.visible,false,"leaving selection must hide page markers");
  dots.destroy();
}
assert.equal(savedStartupFrame.viewport.gridRows, 4);
assert.equal(savedStartupFrame.viewport.gridCols, 6);
assert.equal(savedStartupFrame.viewport.iconSize, 72);
assert.equal(savedStartupFrame.interaction.isTextlessMode, true);
assert.equal(savedStartupFrame.viewport.activePages[0]?.[0]?.id, "custom-editor");
assert.equal(savedStartupFrame.interaction.focusedIcon, null, "startup must not manufacture keyboard focus");
const savedScanRequest = makeNativeStartupScanRequest(savedLayout);
assert.equal(savedScanRequest.roots.length, 1);
assert.equal(savedScanRequest.roots[0]?.id, "root-custom");
assert.deepEqual(savedScanRequest.filters.keywordBlacklist, ["uninstall", "卸载"]);
const firstRunFrame = makeNativeStartupFrame(null, [{
  id: "first-run-app",
  type: "app",
  name: "First Run",
  launchTarget: { kind: "url", path: "https://example.invalid/first-run" },
  trackingKey: "launch:url:first-run",
  identityStatus: "exact",
  sources: [{
    key: "first-run-source",
    type: "customDirectory",
    state: "primary",
    rootId: "first-run-root",
    rootLabel: "First run root",
    relativePath: "First Run.url",
    absolutePath: "C:/First Run.url",
  }],
}]);
assert.equal(firstRunFrame.viewport.gridRows, 5);
assert.equal(firstRunFrame.viewport.gridCols, 7);
assert.equal(firstRunFrame.viewport.activePages[0]?.[0]?.id, "first-run-app");
assert.equal(makeNativeStartupScanRequest(null).roots.length, 3);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "PageDown" }), 0);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "ArrowLeft" }), 0);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "ArrowLeft", ctrlKey: true }), -1);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "ArrowRight", ctrlKey: true }), 1);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "ArrowRight", repeat: true }), 0);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "PageUp", ctrlKey: true }), 0);
const secondSavedPage = setNativeDesktopPage(savedStartupFrame, 1);
assert.equal(secondSavedPage.viewport.activePageIndex, 1);
assert.equal(secondSavedPage.interaction.focusedIcon, null, "page commits must not manufacture keyboard focus");
assert.equal(setNativeDesktopPage(secondSavedPage, 2), secondSavedPage, "the last page must not turn past its edge");
assert.equal(setNativeDesktopPage(secondSavedPage, 0).viewport.activePageIndex, 0);
assert.throws(() => setNativeDesktopPage(secondSavedPage, Number.NaN), /integer/);

function makeCompleteFrame(overrides: DesktopSceneFrameInput = {}): CompleteDesktopSceneFrame {
  const frame = makeDesktopSceneFrame({
    activePageIndex: 0,
    activePages: [[{ emoji: "🚀", id: "app-1", name: "示例应用", type: "app" }]],
    appLaunchCloseSessionId: null,
    desktopGridDebugOptions: null,
    desktopProjectionEpoch: 0,
    desktopTrackMotionKey: "native-static-snap",
    desktopVisualAlpha: 1,
    desktopVisualTransform: { scale: 1, y: 0 },
    dragFolderHoverState: null,
    dragFolderTargetId: null,
    dragHitDebugOptions: null,
    dragHitDebugState: null,
    dragMeta: null,
    focusedIcon: null,
    folderClosingHandoffId: null,
    folderPageSize: 24,
    folderSourceGhostedId: null,
    folderSourceGhostedIds: new Set<string>(),
    gridCols: 7,
    gridRows: 4,
    groupDragState: null,
    iconGesturePresentation: null,
    iconSize: 64,
    isBatchSelectionActive: false,
    isDesktopClosing: false,
    isEditMode: false,
    isHomeRevealSettling: false,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    launchpadVisualAlpha: 1,
    launchpadVisualTransform: { scale: 1, y: 0 },
    pageGridMeasureStyle: {},
    pageTrackScrub: null,
    provisionalFolderRollback: null,
    selectedAppIds: new Set<string>(),
    showMissingLaunchTargetBadge: false,
    singleStageDiagnosticsOptions: null,
    ...overrides,
  });
  assertCompleteDesktopSceneFrame(frame);
  return frame;
}

const stage = new Container();
{
  const tasks:(()=>void)[]=[];
  const scheduler=createNativeSceneScheduler(task=>tasks.push(task));
  const frames:boolean[]=[];
  scheduler.request();scheduler.request();
  assert.equal(tasks.length,0,"startup state must wait for the renderer");
  scheduler.connect(snap=>frames.push(snap));
  assert.equal(tasks.length,1,"startup requests must coalesce");
  scheduler.run(true);
  scheduler.request();
  tasks.shift()!();
  assert.deepEqual(frames,[true],"a stale queued frame must not consume a newer request");
  tasks.shift()!();
  assert.deepEqual(frames,[true,false]);
  scheduler.request();scheduler.dispose();
  tasks.shift()!();scheduler.request();scheduler.run(true);scheduler.flush();
  assert.deepEqual(frames,[true,false],"queued and synchronous work must disconnect before scene destruction");
  assert.equal(scheduler.pending,false);assert.equal(tasks.length,0);
  assert.throws(()=>scheduler.connect(()=>{}));
  const followups:(()=>void)[]=[];let count=0;
  const reentrant=createNativeSceneScheduler(task=>followups.push(task));
  reentrant.connect(()=>{if(++count===1)reentrant.request();});
  reentrant.request();followups.shift()!();
  assert.equal(reentrant.pending,true,"requests published during a commit must survive");
  followups.shift()!();assert.equal(count,2);assert.equal(reentrant.pending,false);
  reentrant.dispose();
  const failing=createNativeSceneScheduler(task=>followups.push(task));
  failing.connect(()=>{throw new Error("render failure");});failing.request();
  assert.throws(()=>followups.shift()!(),/render failure/,"rendering failures must remain observable");
  failing.dispose();
}
{
  const capture=createNativeRecordSnapshot<{selection:Set<string>;enabled:boolean}>();
  const selection=new Set(["first"]);
  const initial=capture({selection,enabled:true});
  assert.equal(capture({selection,enabled:true}),initial,"unchanged inputs must reuse their immutable snapshot");
  assert.throws(()=>initial.selection.add("mutation"),"published selection snapshots must remain immutable");
  const visibilityOnly=capture({selection,enabled:false});
  assert.equal(visibilityOnly.selection,initial.selection,"visibility changes must retain unchanged selection snapshot identity");
  const updated=capture({selection:new Set(["second"]),enabled:true});
  assert.notEqual(updated,initial);assert.deepEqual([...initial.selection],["first"]);
  assert.deepEqual([...updated.selection],["second"],"replacing a selection must publish its new contents");
  const captureShape=createNativeRecordSnapshot<Record<string,undefined>>();
  const oldShape=captureShape({before:undefined});
  const newShape=captureShape({after:undefined});
  assert.notEqual(oldShape,newShape);assert.deepEqual(Object.keys(newShape),["after"]);
}
const activations: string[] = [];
const scene = new NativeDesktopScene(stage, {
  onIconActivate: (item) => activations.push(item.id),
});
let animationUpdate: ((deltaMs: number) => void) | null = null;
const disconnectAnimationHost = scene.connectAnimationHost({
  commit: () => {},
  animate: (update) => {
    animationUpdate = update;
    return () => {
      if (animationUpdate === update) animationUpdate = null;
    };
  },
  invalidate: () => {},
});
function stepSceneAnimations(): void {
  const update = animationUpdate;
  assert.ok(update, "the native scene should request animation frames while motion is active");
  update(1000 / 60);
}
const frame = makeCompleteFrame();
const work = scene.commit(frame, { height: 600, resolution: 1.25, width: 900 });

assert.equal(work.structureFrames, 1);
assert.equal(work.fullPlanBuilds, 1);
assert.equal(work.reconciledNodes, 1);
{
  const count=scene.getUpdateStatistics().structure;
  const closed=Object.freeze({...frame,interaction:Object.freeze({...frame.interaction,isDesktopClosing:true}),
    visual:Object.freeze({...frame.visual,desktopVisualAlpha:0,launchpadVisualAlpha:0})});
  scene.commit(closed,{height:600,resolution:1.25,width:900},{snapDesktopLayout:false});
  scene.commit(frame,{height:600,resolution:1.25,width:900},{snapDesktopLayout:false});
  assert.equal(scene.getUpdateStatistics().structure,count,"visibility-only close/reopen must reuse desktop structure");
}
assert.ok(stage.getChildByLabel("launchpad-native-desktop"));
const itemNode = stage.getChildByLabel("launchpad-item:app-1", true);
assert.ok(itemNode, "the active desktop page should create a real Pixi icon node");
assert.equal(itemNode.eventMode, "static", "the active native desktop page should accept pointer input");
const itemEvents = itemNode as unknown as {
  emit(type: string, event: unknown): boolean;
};
itemEvents.emit("pointerdown", {
  button: 0,
  getLocalPosition: () => ({ x: 0, y: 0 }),
  nativeEvent: { button: 0 },
});
itemEvents.emit("pointerupoutside", {});
itemEvents.emit("pointercancel", {});
assert.deepEqual(activations, [], "press or cancellation must not activate an icon");
itemEvents.emit("pointertap", {});
assert.deepEqual(activations, ["app-1"], "a completed pointer tap should activate exactly once");
const initialItemBounds = itemNode.getBounds();
const nativeItemNode = itemNode as Container & { emojiText: Text; labelText: Text };
assert.ok(
  nativeItemNode.labelText.width > 0 && nativeItemNode.labelText.width < 200,
  `the native app label should stay within its 160px layout width, received ${nativeItemNode.labelText.width}px`,
);
assert.ok(
  nativeItemNode.labelText.height > 0 && nativeItemNode.labelText.height < 40,
  `the native app label should stay near its 16px line height, received ${nativeItemNode.labelText.height}px`,
);
const emojiFontFamily = nativeItemNode.emojiText.style.fontFamily;
assert.deepEqual(
  (Array.isArray(nativeItemNode.labelText.style.fontFamily)
    ? nativeItemNode.labelText.style.fontFamily
    : [nativeItemNode.labelText.style.fontFamily]
  ).map((fontFamily) => fontFamily.replaceAll('"', "")),
  [...PIXI_UI_FONT_FAMILY],
  "native labels should use the explicit Latin/CJK/Emoji fallback order",
);
assert.deepEqual(
  (Array.isArray(emojiFontFamily) ? emojiFontFamily : [emojiFontFamily])
    .map((fontFamily) => fontFamily.replaceAll('"', "")).slice(0,3),
  ["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"],
  "native emoji text should request a color emoji font before the platform default",
);
assert.equal(frame.viewport.activePages[0]?.[0]?.id, "app-1", "commit must not mutate the scene frame");

const resizedWork = scene.commit(frame, { height: 760, resolution: 2.5, width: 1180 });
const resizedItemNode = stage.getChildByLabel("launchpad-item:app-1", true);
assert.equal(resizedWork.structureFrames, 1);
assert.equal(resizedItemNode, itemNode, "resize should update the existing icon node instead of rebuilding it");
const resizedItemBounds = itemNode.getBounds();
assert.ok(
  resizedItemBounds.x !== initialItemBounds.x || resizedItemBounds.y !== initialItemBounds.y,
  "a larger native viewport should reflow the desktop grid",
);
assert.ok(
  resizedItemBounds.x >= 0
    && resizedItemBounds.y >= 0
    && resizedItemBounds.x + resizedItemBounds.width <= 1180
    && resizedItemBounds.y + resizedItemBounds.height <= 760,
  "the resized icon should remain inside the native viewport",
);
assert.equal(nativeItemNode.emojiText.resolution, 2.5, "resize should update existing emoji texture resolution");
assert.equal(nativeItemNode.labelText.resolution, 2.5, "resize should update existing label texture resolution");

const pagedFrame = makeCompleteFrame({
  activePages: [
    [{ emoji: "1️⃣", id: "page-1", name: "第一页", type: "app" }],
    [{ emoji: "2️⃣", id: "page-2", name: "第二页", type: "app" }],
    [{ emoji: "3️⃣", id: "page-3", name: "第三页", type: "app" }],
  ],
});
scene.commit(pagedFrame, { height: 760, resolution: 2.5, width: 1180 }, { snapDesktopLayout: true });
const desktopLayer = stage.getChildByLabel("launchpad-native-desktop") as Container & {
  pageTrack: Container;
};
const firstPageNode = stage.getChildByLabel("launchpad-item:page-1", true);
const prefetchedSecondPageNode = stage.getChildByLabel("launchpad-item:page-2", true);
assert.ok(firstPageNode, "the active desktop page should remain rendered");
assert.ok(prefetchedSecondPageNode, "the adjacent desktop page should be rendered before a turn");
assert.equal(firstPageNode.eventMode, "static", "the active desktop page should be interactive");
assert.equal(prefetchedSecondPageNode.eventMode, "none", "the adjacent desktop page should stay static");
assert.equal(stage.getChildByLabel("launchpad-item:page-3", true), null, "distant pages should remain empty");
const pageTwoFrame = setNativeDesktopPage(pagedFrame, 1);
scene.commit(
  pageTwoFrame,
  { height: 760, resolution: 2.5, width: 1180 },
  { snapDesktopLayout: false },
);
assert.equal(
  stage.getChildByLabel("launchpad-item:page-1", true),
  firstPageNode,
  "the source desktop page should remain mounted while the track moves",
);
assert.equal(
  stage.getChildByLabel("launchpad-item:page-2", true),
  prefetchedSecondPageNode,
  "the target desktop page should reuse its prefetched node",
);
assert.equal(firstPageNode.eventMode, "none", "the source desktop page should become static after the turn");
assert.equal(prefetchedSecondPageNode.eventMode, "static", "the target desktop page should become interactive");
assert.equal(desktopLayer.pageTrack.x, 0, "a desktop page turn must not snap directly to its target");
const planCountBeforeMotion=scene.getUpdateStatistics().structure;
stepSceneAnimations();
assert.ok(
  desktopLayer.pageTrack.x < 0 && desktopLayer.pageTrack.x > -1180,
  "the first desktop page-turn frame should lie between its source and target",
);
for (let frameIndex = 0; frameIndex < 600 && Math.abs(desktopLayer.pageTrack.x + 1180) > 0.01; frameIndex += 1) {
  stepSceneAnimations();
}
assert.ok(Math.abs(desktopLayer.pageTrack.x + 1180) <= 0.01, "the desktop page track should settle at page two");
assert.equal(scene.getUpdateStatistics().structure,planCountBeforeMotion,"moving within the same realized page set must not rebuild desktop structure");
assert.equal(scene.commit(pageTwoFrame,{height:760,resolution:2.5,width:1180},{snapDesktopLayout:false}).fullPlanBuilds,0,"an unchanged state notification must not rebuild a plan");
const pageThreeFrame = setNativeDesktopPage(pageTwoFrame, 2);
scene.commit(
  pageThreeFrame,
  { height: 760, resolution: 2.5, width: 1180 },
  { snapDesktopLayout: false },
);
for (let frameIndex = 0; frameIndex < 600 && Math.abs(desktopLayer.pageTrack.x + 2360) > 0.01; frameIndex += 1) {
  stepSceneAnimations();
}
assert.ok(Math.abs(desktopLayer.pageTrack.x + 2360) <= 0.01, "the desktop page track should settle at page three");
assert.equal(stage.getChildByLabel("launchpad-item:page-1",true),null,"the old source page must retire after leaving the realized range");
scene.commit(pagedFrame,{height:760,resolution:2.5,width:1180},{snapDesktopLayout:true});
assert.equal(stage.getChildByLabel("launchpad-item:page-1",true),firstPageNode,"a nearby return must reuse the detached page node");
scene.commit(pageThreeFrame,{height:760,resolution:2.5,width:1180},{snapDesktopLayout:true});
const thirdPageNode = stage.getChildByLabel("launchpad-item:page-3", true);
assert.ok(thirdPageNode, "three-page layouts should reach their final page");
const thirdPageBounds = thirdPageNode.getBounds();
assert.ok(
  thirdPageBounds.x >= 0
    && thirdPageBounds.y >= 0
    && thirdPageBounds.x + thirdPageBounds.width <= 1180
    && thirdPageBounds.y + thirdPageBounds.height <= 760,
  "the turned page icon should remain inside the native viewport",
);
scene.commit(
  pageThreeFrame,
  { height: 760, resolution: 2.5, width: 1180 },
  {
    pageTrackScrub: {
      edge: false,
      fromIndex: 2,
      progress: 0.25,
      scope: "desktop",
      toIndex: 1,
    },
    snapDesktopLayout: false,
  },
);
assert.ok(
  desktopLayer.pageTrack.x > -2360 && desktopLayer.pageTrack.x < -1180,
  "the native desktop scene should apply the gesture engine's live page scrub",
);

// Long page-dot jumps must never reveal freshly realized transparent pages.
for(const fps of [60,120,144,165,180]){
  const jump=makeCompleteFrame({activePages:Array.from({length:20},(_,index)=>[
    {id:`jump-${fps}-${index}`,name:`Page ${index}`,emoji:"A",type:"app" as const},
  ])});
  scene.commit(jump,{width:1180,height:760,resolution:1},{snapDesktopLayout:true});
  for(let index=0;index<120&&animationUpdate;index++)stepSceneAnimations();
  const beforeTurn=scene.getUpdateStatistics().structure;
  scene.commit(setNativeDesktopPage(jump,19),{width:1180,height:760,resolution:1},{snapDesktopLayout:false});
  assert.equal(scene.getUpdateStatistics().structure,beforeTurn,"retained page changes must not rebuild desktop structure");
  for(let index=0;index<fps;index++){
    const current=animationUpdate as ((delta:number)=>void)|null;
    current?.(1000/fps);
    const page:number=-desktopLayer.pageTrack.x/1180;
    for(const visible of new Set([Math.floor(page),Math.ceil(page)])){
      if(visible<0||visible>=20)continue;
      const icon=stage.getChildByLabel(`launchpad-item:jump-${fps}-${visible}`,true);
      assert.ok(icon,`${fps} Hz page ${visible} must be realized`);
      assert.equal(icon.alpha,1,`${fps} Hz page ${visible} must not fade in during a jump`);
      assert.equal(icon.renderable,true,`${fps} Hz visible page must not be culled`);
    }
  }
}

{
  const children=Array.from({length:20},(_,index)=>({id:`preview-child-${index}`,name:`Child ${index}`,emoji:"A",type:"app" as const}));
  const folder:NativeFolderItem={id:"retained-folder",name:"Folder",type:"folder",childPages:[children]};
  const mixed=makeCompleteFrame({activePages:[[folder],...[1,2,3].map(index=>[{id:`retained-app-${index}`,name:"App",emoji:"A",type:"app" as const}])]});
  const vp={width:1180,height:760,resolution:1};
  scene.commit(mixed,vp,{snapDesktopLayout:true});
  const shell=stage.getChildByLabel("launchpad-item:retained-folder",true) as Container & {folderChildNodes:Container[];state:Record<string,unknown>|null;setState(state:Record<string,unknown>):void};
  assert.equal(shell.folderChildNodes.filter(child=>child.visible).length,9,"idle folder shell must only realize nine preview children");
  assert.equal(stage.getChildByLabel("launchpad-item:preview-child-19",true),null,"desktop preparation must not create expanded child nodes");
  const offscreen=stage.getChildByLabel("launchpad-item:retained-app-3",true)! as Container & {setState(state:Record<string,unknown>):void};
  let states=0;const original=offscreen.setState;offscreen.setState=function(state){states++;return original.call(this,state);};
  const presentation:NativeFolderPresentation={openingCancelRequest:null,folderPageIndex:0,isClosing:false,openProgress:1,openProgressTarget:1,renderedFolder:folder};
  const result=scene.commit(mixed,vp,{folderPresentation:presentation,snapDesktopLayout:false});
  assert.equal(states,0,"opening a retained folder must not reconcile unrelated offscreen desktop nodes");
  assert.equal(result.reconciledNodes,1,"opening updates only the folder source desktop page");
  assert.ok(stage.getChildByLabel("launchpad-item:preview-child-19",true),"opening still realizes the folder contents on demand");
  offscreen.setState=original;
  scene.commit(mixed,vp,{snapDesktopLayout:true});
  const snapshot=shell.state!;
  shell.setState({...snapshot,folderHoverState:{key:"preview-test",targetId:folder.id,targetType:"folder",phase:"hover"}});
  assert.equal(shell.folderChildNodes.filter(child=>child.visible).length,20,"hover preview must expand beyond nine items");
  shell.setState({...snapshot,folderHoverState:null});
  for(let index=0;index<90&&animationUpdate;index++)stepSceneAnimations();
  assert.equal(shell.folderChildNodes.filter(child=>child.visible).length,9,"after scrolling resets only the nine resting thumbnails remain visible");
}

{
  const word={id:"search-animation-word",type:"app" as const,name:"Word",emoji:"W"};
  const other={id:"search-animation-other",type:"app" as const,name:"Other",emoji:"O"};
  const desktop=makeCompleteFrame({activePages:[[word,other]]});
  const search=makeCompleteFrame({activePages:[[word]],isSearchMode:true});
  for(const [index,frame]of [desktop,search,desktop,search,desktop].entries()){
    scene.commit(frame,{width:1180,height:760,resolution:1},{snapDesktopLayout:false});
    if(index>0){
      const wordNode=stage.getChildByLabel(`launchpad-item:${word.id}`,true)!;
      assert.equal(wordNode.alpha,0,"search scope entry must animate consistently even when the result existed in the previous scope");
      if(frame===desktop)assert.equal(stage.getChildByLabel(`launchpad-item:${other.id}`,true)!.alpha,wordNode.alpha,"restored desktop matches and nonmatches must use the same entry animation");
    }
    for(let tick=0;tick<120&&animationUpdate;tick++)stepSceneAnimations();
  }
}

const folderItem: NativeFolderItem = {
  childPages: [
    [{ emoji: "1️⃣", id: "folder-child-1", name: "子项一", type: "app" }],
    [{ emoji: "2️⃣", id: "folder-child-2", name: "子项二", type: "app" }],
    [{ emoji: "3️⃣", id: "folder-child-3", name: "子项三", type: "app" }],
  ],
  id: "folder-1",
  name: "原生文件夹",
  type: "folder",
};
const folderFrame = makeCompleteFrame({ activePages: [[folderItem]] });
const folderPresentation = (folderPageIndex: number): NativeFolderPresentation => Object.freeze({
  openingCancelRequest: null,
  folderPageIndex,
  isClosing: false,
  openProgress: 1,
  openProgressTarget: 1,
  renderedFolder: folderItem,
});
scene.commit(
  folderFrame,
  { height: 760, resolution: 2.5, width: 1180 },
  { folderPresentation: folderPresentation(0), snapDesktopLayout: true },
);
const firstFolderChild = stage.getChildByLabel("launchpad-item:folder-child-1", true);
const folderIcon = stage.getChildByLabel(`launchpad-item:${folderItem.id}`, true) as Container & {
  folderChildNodes: Container[];
  emojiText: Text;
};
const folderPreviewEmoji = folderIcon.folderChildNodes[0]?.children[1] as Text;
assert.ok(folderPreviewEmoji, "the folder thumbnail should contain a child emoji");
assert.deepEqual(
  folderPreviewEmoji.style.fontFamily,
  folderIcon.emojiText.style.fontFamily,
  "folder thumbnail emoji must use the same native font fallback as full-size icons",
);
const thirdFolderChild = stage.getChildByLabel("launchpad-item:folder-child-3", true);
assert.ok(firstFolderChild && thirdFolderChild, "all real folder pages should stay mounted for distant page turns");
assert.equal(firstFolderChild.eventMode, "static", "the active folder page should accept pointer input");
assert.equal(thirdFolderChild.eventMode, "none", "inactive folder pages should remain non-interactive");
scene.commit(
  folderFrame,
  { height: 760, resolution: 2.5, width: 1180 },
  {
    folderPageTrackScrub: {
      edge: false,
      fromIndex: 0,
      progress: 0.25,
      scope: `folder:${folderItem.id}`,
      toIndex: 1,
    },
    folderPresentation: folderPresentation(0),
    snapDesktopLayout: false,
  },
);
const scrubbedFolderMotion = scene.getMotionSnapshot();
assert.ok(
  scrubbedFolderMotion.folderPageTrackX !== null && scrubbedFolderMotion.folderPageTrackX < 0,
  "the native folder scene should apply the gesture engine's live page scrub",
);
scene.commit(
  folderFrame,
  { height: 760, resolution: 2.5, width: 1180 },
  { folderPresentation: folderPresentation(2), snapDesktopLayout: false },
);
const committedFolderMotion = scene.getMotionSnapshot();
assert.ok(
  committedFolderMotion.folderPageTrackX !== null
    && committedFolderMotion.folderPageTrackTargetX !== null
    && Math.abs(committedFolderMotion.folderPageTrackX - committedFolderMotion.folderPageTrackTargetX) > 0.5,
  "a distant folder page turn must expose an intermediate track position",
);
for (let frameIndex = 0; frameIndex < 600; frameIndex += 1) {
  const motion = scene.getMotionSnapshot();
  if (
    motion.folderPageTrackX !== null
    && motion.folderPageTrackTargetX !== null
    && Math.abs(motion.folderPageTrackX - motion.folderPageTrackTargetX) <= 0.01
  ) break;
  stepSceneAnimations();
}
const settledFolderMotion = scene.getMotionSnapshot();
assert.ok(
  settledFolderMotion.folderPageTrackX !== null
    && settledFolderMotion.folderPageTrackTargetX !== null
    && Math.abs(settledFolderMotion.folderPageTrackX - settledFolderMotion.folderPageTrackTargetX) <= 0.01,
  "the folder page track should settle on the distant target",
);
const thirdFolderEvents = thirdFolderChild as unknown as { emit(type: string, event: unknown): boolean };
thirdFolderEvents.emit("pointertap", {});
assert.equal(activations.at(-1), "folder-child-3", "the current folder child should activate exactly once");

let flowSnapshot: NativeFolderPresentation | null = null;
const folderFlow = createNativeFolderFlow((snapshot) => {
  flowSnapshot = snapshot;
});
assert.equal(folderFlow.open(folderItem), true);
assert.equal(folderFlow.close(), true, "folder close must interrupt an opening spring");
assert.equal(folderFlow.open(folderItem), true, "the same folder must reopen during closing");
folderFlow.commitPresented(folderItem.id);
for (let frameIndex = 0; frameIndex < 600 && folderFlow.snapshot().openProgress < 0.999; frameIndex += 1) {
  stepSceneAnimations();
}
assert.ok(folderFlow.snapshot().openProgress >= 0.999, "the native folder opening spring should settle");
assert.equal(folderFlow.setPageIndex(Number.NaN), false, "folder paging must reject non-finite indexes");
assert.equal(folderFlow.setPageIndex(0.5), false, "folder paging must reject fractional indexes");
assert.equal(folderFlow.close(), true);
folderFlow.notifyInternalActivity(true, folderItem.id);
for (let frameIndex = 0; frameIndex < 600 && folderFlow.snapshot().openProgress > 0.001; frameIndex += 1) {
  stepSceneAnimations();
}
assert.equal(folderFlow.snapshot().renderedFolder?.id, folderItem.id, "close progress alone must not clear the folder");
folderFlow.notifyInternalActivity(false, null);
for (let frameIndex = 0; frameIndex < 5 && folderFlow.snapshot().renderedFolder; frameIndex += 1) {
  stepSceneAnimations();
}
assert.equal(folderFlow.snapshot().renderedFolder, null, "folder close should finish after progress and handoff settle");
assert.ok(flowSnapshot, "folder flow should publish presentation changes");
folderFlow.destroy();

const earlyHandoffFlow = createNativeFolderFlow(() => {});
earlyHandoffFlow.open(folderItem);
for (let frameIndex = 0; frameIndex < 600 && earlyHandoffFlow.snapshot().openProgress < 0.999; frameIndex += 1) {
  stepSceneAnimations();
}
assert.equal(earlyHandoffFlow.close(), true);
earlyHandoffFlow.notifyInternalActivity(true, folderItem.id);
earlyHandoffFlow.notifyInternalActivity(false, null);
assert.equal(
  earlyHandoffFlow.snapshot().renderedFolder?.id,
  folderItem.id,
  "handoff completion alone must not clear the folder before close progress arrives",
);
for (let frameIndex = 0; frameIndex < 600 && earlyHandoffFlow.snapshot().renderedFolder; frameIndex += 1) {
  stepSceneAnimations();
}
assert.equal(earlyHandoffFlow.snapshot().renderedFolder, null, "close should also finish when handoff settles first");
earlyHandoffFlow.destroy();

const retargetFlow = createNativeFolderFlow(() => {});
const otherFolder = { ...folderItem, id: "folder-other" };
retargetFlow.open(folderItem);
retargetFlow.open(otherFolder);
assert.equal(retargetFlow.snapshot().renderedFolder?.id, folderItem.id, "cross-folder open must wait for the source close presentation");
retargetFlow.commitPresented("stale-folder");
assert.equal(retargetFlow.snapshot().renderedFolder?.id, folderItem.id, "stale presentation cannot release a pending open");
retargetFlow.commitPresented(folderItem.id);
assert.equal(retargetFlow.snapshot().renderedFolder?.id, otherFolder.id, "presented close should release the next folder");
assert.equal(retargetFlow.snapshot().openProgress, 0, "a different folder must start its own opening timeline");
retargetFlow.open(folderItem);
retargetFlow.open(otherFolder);
retargetFlow.commitPresented(otherFolder.id);
assert.equal(retargetFlow.snapshot().renderedFolder?.id, otherFolder.id, "the latest requested folder wins");
retargetFlow.destroy();

const background = [9, 11, 20, 255] as const;
const contaminatedPixels = new Uint8ClampedArray(8 * 8 * 4);
for (let offset = 0; offset < contaminatedPixels.length; offset += 4) {
  contaminatedPixels.set(background, offset);
}
contaminatedPixels.set([255, 255, 255, 255], (7 * 8 + 4) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 8, pixels: contaminatedPixels, width: 8 },
    { background, contentBottom: 6, emojiRegions: [], iconRegions: [], labelRegions: [] },
  ),
  /lower empty area contains 1 foreground pixel/,
  "native pixel proof should reject content leaking into the lower empty area",
);
const tofuPixels = new Uint8ClampedArray(8 * 8 * 4);
for (let offset = 0; offset < tofuPixels.length; offset += 4) tofuPixels.set(background, offset);
tofuPixels.set([255, 255, 255, 255], (2 * 8 + 2) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 8, pixels: tofuPixels, width: 8 },
    {
      background,
      contentBottom: 6,
      emojiRegions: [{ height: 3, width: 3, x: 1, y: 1 }],
      iconRegions: [],
      labelRegions: [],
    },
  ),
  /color emoji pixels/,
  "native pixel proof should reject monochrome missing-glyph boxes",
);
const missingLabelPixels = new Uint8ClampedArray(8 * 8 * 4);
for (let offset = 0; offset < missingLabelPixels.length; offset += 4) missingLabelPixels.set(background, offset);
missingLabelPixels.set([240, 80, 20, 255], (2 * 8 + 2) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 8, pixels: missingLabelPixels, width: 8 },
    {
      background,
      contentBottom: 6,
      emojiRegions: [{ height: 3, width: 3, x: 1, y: 1 }],
      iconRegions: [],
      labelRegions: [{ height: 1, width: 3, x: 1, y: 4 }],
    },
  ),
  /Label region 0 contains no foreground pixels/,
  "native pixel proof should require every app label to reach the GPU texture",
);
const iconPixels = new Uint8ClampedArray(4 * 4 * 4);
for (let offset = 0; offset < iconPixels.length; offset += 4) iconPixels.set(background, offset);
iconPixels.set([239, 59, 109, 255], (1 * 4 + 1) * 4);
const iconProof = assertNativeScenePixels(
  { height: 4, pixels: iconPixels, width: 4 },
  {
    background,
    contentBottom: 4,
    emojiRegions: [],
    iconRegions: [{ height: 2, width: 2, x: 1, y: 1 }],
    labelRegions: [],
  },
);
assert.equal(iconProof.iconForegroundPixels[0], 1, "native pixel proof should count uploaded icon pixels");
const grayscaleIconPixels = new Uint8ClampedArray(iconPixels);
grayscaleIconPixels.set([180, 180, 180, 255], (1 * 4 + 1) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 4, pixels: grayscaleIconPixels, width: 4 },
    {
      background,
      contentBottom: 4,
      emojiRegions: [],
      iconRegions: [{ height: 2, width: 2, x: 1, y: 1 }],
      labelRegions: [],
    },
  ),
  /no colored icon pixels/,
  "native pixel proof should reject an icon region without colored pixels",
);

assert.doesNotThrow(() => scene.commit(makeCompleteFrame({ isEditMode: true }), { height: 600, resolution: 1, width: 900 }), "native scene should accept shared edit presentation");
assert.throws(
  () => scene.commit(frame, { height: 600, resolution: 0, width: 900 }),
  /NativeSceneViewport\.resolution/,
  "native viewport validation must reject a zero device resolution",
);

disconnectAnimationHost();
scene.destroy();
scene.destroy();
assert.equal(stage.children.length, 0);
assert.throws(
  () => scene.commit(frame, { height: 600, resolution: 1, width: 900 }),
  /has been destroyed/,
);

stage.destroy();

// The original Web loop commits geometry after each motion step. Native must keep
// the closing target tracking the desktop's simultaneous scale/offset restoration.
{
  // The native host exposes RAF, routing bounds refreshes through afterFrame.
  // Motion itself is driven by the deterministic host below.
  const previousRaf=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=()=>0;
  const root = new Container();
  const subject = new NativeDesktopScene(root);
  const folder: NativeFolderItem = { id: "handoff-regression", type: "folder", name: "Folder", childPages: [[{id:"child",type:"app",name:"Child",emoji:"A"}]] };
  const snapshot = makeCompleteFrame({ activePages: [[folder]] });
  let presentation: NativeFolderPresentation | null = null;
  let tick: ((delta: number) => void) | null = null;
  const commit = () => subject.commit(snapshot, {width:900,height:600,resolution:1}, {folderPresentation:presentation,snapDesktopLayout:false});
  const off = subject.connectAnimationHost({
    animate: fn => {tick=fn; return()=>{tick=null;};}, invalidate:()=>{}, commit,
  });
  const advance = async () => {
    for(let index=0;index<100;index+=1){const current=tick as ((delta:number)=>void)|null;current?.(1000/60);await Promise.resolve();subject.commitPresentedFrame();}
  };
  commit();await advance();
  presentation={renderedFolder:folder,folderPageIndex:0,isClosing:false,openProgress:1,openProgressTarget:1,openingCancelRequest:null};
  commit();await advance();
  assert.equal(subject.getMotionSnapshot().active,false,"a stationary open folder must drain animations and after-frame callbacks");
  assert.equal(tick,null,"a stationary open folder must release the native animation host");
  commit();await advance();
  assert.equal(tick,null,"committing unchanged folder geometry must not restart a perpetual frame loop");
  presentation={renderedFolder:folder,folderPageIndex:0,isClosing:true,openProgress:0,openProgressTarget:0,openingCancelRequest:null};
  commit();await advance();
  const layer=root.getChildByLabel("launchpad-native-desktop") as Container & {
    singleStageFolderLayer:{stableFolderCloseTarget:{thumbRect:{left:number;top:number;width:number}}|null};
  };
  const icon=root.getChildByLabel("launchpad-item:handoff-regression",true) as Container & {
    getFolderThumbBounds(stage:{left:number;top:number}):{left:number;top:number;width:number};
  };
  const target=layer.singleStageFolderLayer.stableFolderCloseTarget?.thumbRect;
  assert.ok(target);
  const actual=icon.getFolderThumbBounds({left:0,top:0});
  assert.ok(Math.abs(target.left-actual.left)<0.51 && Math.abs(target.top-actual.top)<0.51,
    `closing target must follow restored desktop: target=${target.left},${target.top}, actual=${actual.left},${actual.top}`);
  assert.ok(Math.abs(target.width-actual.width)<0.1,"closing ghost and restored icon must have the same size");
  off();subject.destroy();root.destroy();
  globalThis.requestAnimationFrame=previousRaf;
}
runNativeDesktopResizeTests(makeCompleteFrame());
runNativeLabelRasterTests();
await runNativeVisualParityTests(makeCompleteFrame());
runNativeSettingsLayoutTests();
console.log("Native desktop scene tests passed");
runNativeWindowEffectsTests();
runTouchpadCaptureTests();
{
  const engine=createLaunchpadGestureEngine(),viewport={scope:"desktop",pageIndex:0,pageCount:3,pageWidth:900};
  const dispatch=(time:number,deltaX:number,wheelPhase:"begin"|"update"|"inertia"|"end"|"cancel")=>engine.dispatch({type:"wheel",time,deltaX,deltaY:0,deltaMode:0,wheelSource:"touchpad",wheelPhase,momentum:wheelPhase==="inertia",viewport});
  dispatch(0,0,"begin");
  for(const time of [10,320,550]){
    const out=dispatch(time,100,"update");assert.equal(out.commands.length,0,"known touchpad cannot enter discrete repeat even with a coarse first delta");assert.equal(out.deadline,null,"explicit touchpad phase owns gesture end");
  }
  const released=dispatch(560,0,"inertia");assert.equal(released.commands.filter(c=>c.type==="commitPage").length,1);
  for(const time of [570,800,1100])assert.equal(dispatch(time,100,"inertia").commands.length,0);
  dispatch(1200,0,"end");assert.equal(dispatch(1300,100,"inertia").commands.length,0,"orphan inertia cannot start another page");
  dispatch(1400,0,"begin");dispatch(1410,30,"update");assert.equal(dispatch(1420,0,"cancel").commands.length,0);
  dispatch(1500,0,"begin");dispatch(1510,800,"update");dispatch(1520,800,"update");
  const reversed=dispatch(1530,-50,"update");assert.ok(reversed.presentation&&reversed.presentation.progress<1,"reversal does not repay invisible travel past the target page");
}
