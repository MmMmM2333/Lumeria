import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { FederatedWheelEvent,Text,type Container } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeBackground } from "../../rendering/native/NativeBackground.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeLaunchGhost } from "../../rendering/native/NativeLaunchGhost.js";
import type { NativeFolderItem } from "../../rendering/native/nativeFolderFlow.js";
import type { SceneFocusedIcon,SceneItem } from "../../rendering/sceneFrame.js";
import type { createNativeLayoutState,NativeNavigationKey,NativePageTurn } from "../nativeStartup.js";
import type { NativeFolderFlow } from "../product/nativeInputRouter.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { DesktopLayer } from "../../rendering/pixi/scene/DesktopLayer.js";
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";

type NativeLayoutState = ReturnType<typeof createNativeLayoutState>;
type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

// Folder interruption, keyboard/pointer navigation, wheel paging and child
// launch scenarios. Product state is read live through readers; the observed
// motion evidence is recorded back into the entry assembly's proof variables.
export type NativeFolderSmokeContext = Readonly<{
  activateItem: (item: SceneItem) => Promise<void>;
  addPresent: (count: number) => void;
  app: NativePixiApplication;
  click: (target: Container) => void;
  closeFolder: () => boolean;
  desktopBackground: NativeBackground;
  folderFlow: NativeFolderFlow;
  editing:ReturnType<typeof createNativeEditing>;
  folderLayout: Readonly<{ cols: number }>;
  getActivePageItems: () => readonly SceneItem[];
  getCurrentFocus: () => SceneFocusedIcon | null;
  launchFlow: Readonly<{ isDesktopClosing: Readonly<{ value: boolean }> }>;
  launchGhostView: NativeLaunchGhost;
  layoutState: NativeLayoutState;
  onKey: (event: NativeNavigationKey) => boolean;
  present: (description: string) => Promise<void>;
  record: Readonly<{
    folderChildLaunchObserved: () => void;
    folderCloseMotionObserved: () => void;
    folderOpenMotionObserved: () => void;
    folderPageMotionObserved: () => void;
  }>;
  runFolderRename: (folder: SceneItem) => Promise<void>;
  scene: NativeDesktopScene;
  setFolderPageIndex: (pageIndex: number) => boolean;
  settingsButton: Readonly<{ alpha: number; eventMode?: string }>;
  showLaunchpad: () => void;
  smoke: NativeSmokeSupport;
  turnFolderPage: (direction: Exclude<NativePageTurn, 0>) => boolean;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export async function runNativeFolderSmoke(context: NativeFolderSmokeContext): Promise<void> {
  const {
    activateItem, addPresent, app, click, closeFolder, desktopBackground, folderFlow, folderLayout,
    getActivePageItems, getCurrentFocus, launchFlow, launchGhostView, layoutState, onKey, present,
    record, runFolderRename, scene, setFolderPageIndex, settingsButton, smoke, turnFolderPage, waitFor,
  } = context;
  // Injects at the same Pixi event boundary the native wheel input consumes.
  let wheelTime = performance.now();
  const wheel = (deltaY: number, elapsedMs = 16): void => {
    const event = new FederatedWheelEvent(app.renderer.events.rootBoundary);
    event.deltaY = deltaY;
    event.deltaMode = 0;
    event.timeStamp = wheelTime += elapsedMs;
    app.stage.emit("wheel", event);
  };
  const smokeFolder = getActivePageItems().find((item) => (
    item.type === "folder" && Array.isArray(item.childPages) && item.childPages.length > 1
  )) as NativeFolderItem | undefined;
  if (!smokeFolder) throw new Error("Native smoke fixture must contain a multi-page folder on page one");
  const otherFolder = getActivePageItems().find((item) => item.id === "native-folder-other");
  assert.ok(otherFolder, "interruption smoke requires a second desktop folder");
  // Exercise the actual closing hit area before it becomes a desktop icon.
  const closingPoint=()=>{
    for(let y=70;y<app.contentSize.height-50;y+=10)for(let x=20;x<app.contentSize.width-20;x+=10){
      if(scene.closingFolderAtPoint(x,y)===smokeFolder.id)return {x,y};
    }
    throw new Error("Closing folder must expose its presented hit area");
  };
  await activateItem(smokeFolder);await waitFor("closing gesture open baseline",()=>folderFlow.snapshot().openProgress>.999);
  closeFolder();await present("closing gesture pressed frame");
  let point=closingPoint();app.nativeInput.emitPointer("pointerdown",point.x,point.y,0);
  assert.equal(folderFlow.snapshot().isClosing,true,"pointer down must not reopen closing folder");
  app.nativeInput.emitPointer("pointerup",point.x,point.y,0);
  await waitFor("closing short tap reopens",()=>!folderFlow.snapshot().isClosing&&folderFlow.snapshot().openProgress>.999);
  closeFolder();await present("closing folder hold baseline");point=closingPoint();
  app.nativeInput.emitPointer("pointerdown",point.x,point.y,0);
  await new Promise(resolve=>setTimeout(resolve,500));
  assert.ok(folderFlow.snapshot().renderedFolder===null||folderFlow.snapshot().isClosing,"held closing target must not reopen while waiting");
  app.nativeInput.emitPointer("pointermove",point.x+45,point.y+20,0);
  await waitFor("closing folder hold starts drag",()=>context.editing.drag.isDragActive());
  assert.ok(folderFlow.snapshot().renderedFolder===null||folderFlow.snapshot().isClosing,"dragging closing folder cannot activate it");
  app.nativeInput.emitPointer("pointercancel",point.x+45,point.y+20,0);
  await waitFor("closing folder hold cancellation",()=>!context.editing.drag.isDragActive());
  await waitFor("closing folder fully retired",()=>folderFlow.snapshot().renderedFolder===null);
  console.log("Closing folder: down does not open, short release opens, hold/move drags and cancellation preserves closure");
  await activateItem(smokeFolder);
  assert.equal(closeFolder(), true, "a close before the first opening present must be accepted");
  await waitFor("unpresented opening cancellation", () => folderFlow.snapshot().renderedFolder === null);
  await activateItem(smokeFolder);
  await waitFor("partial folder opening", () => {
    const progress = folderFlow.snapshot().openProgress;
    return progress > 0.01 && progress < 0.95;
  });
  await present("partial opening before cancel");
  assert.equal(closeFolder(), true, "close must interrupt a presented opening");
  await present("interrupted folder close");
  await smoke.captureSmokeFrame(app, "folder-opening-cancel");
  await activateItem(smokeFolder);
  await waitFor("same-folder reopen", () => !folderFlow.snapshot().isClosing && folderFlow.snapshot().openProgress >= 0.999);
  await present("same-folder reopened");
  await smoke.captureSmokeFrame(app, "folder-reopened");
  assert.equal(closeFolder(),true);
  await present("closing before desktop pointer activation");
  assert.equal(folderFlow.snapshot().isClosing,true,"desktop pointer regression must run during closing");
  const otherFolderNode=app.stage.getChildByLabel(`launchpad-item:${otherFolder.id}`,true);
  assert.ok(otherFolderNode);
  click(otherFolderNode);
  await waitFor("cross-folder opening", () => folderFlow.snapshot().renderedFolder?.id === otherFolder.id);
  await present("cross-folder handoff");
  await smoke.captureSmokeFrame(app, "folder-cross-handoff");
  await activateItem(smokeFolder);
  await activateItem(otherFolder);
  await activateItem(smokeFolder);
  await waitFor("latest cross-folder request wins", () => (
    folderFlow.snapshot().renderedFolder?.id === smokeFolder.id
    && !folderFlow.snapshot().isClosing && folderFlow.snapshot().openProgress >= 0.999
  ));
  assert.equal(closeFolder(), true);
  await waitFor("settings button reveals while folder is still closing",()=>settingsButton.alpha>0.1&&folderFlow.snapshot().isClosing);
  assert.ok(folderFlow.snapshot().renderedFolder,"settings button must appear before folder cleanup");
  assert.equal(settingsButton.eventMode,"none","visual reveal must not enable clicks through the closing folder");
  await smoke.captureSmokeFrame(app, "settings-button-folder-closing");
  await waitFor("interruption stress cleanup", () => folderFlow.snapshot().renderedFolder === null);
  await present("clean desktop after interruptions");
  for (const folder of [smokeFolder, otherFolder]) {
    const node = app.stage.getChildByLabel(`launchpad-item:${folder.id}`, true);
    assert.ok(node?.visible && node.renderable, "every folder source must return after interrupted handoffs");
  }
  console.log("Native folder interruption smoke: cancel, reopen, cross-folder latest-request and cleanup passed");
  onKey({ type: "down", key: "Enter" });
  const folderIndex = getActivePageItems().findIndex((item) => item.id === smokeFolder.id);
  for (let index = 0; index < folderIndex; index += 1) onKey({ type: "down", key: "ArrowRight" });
  assert.equal(getCurrentFocus()?.id, smokeFolder.id);
  onKey({ type: "down", key: "Enter" });
  assert.equal(folderFlow.snapshot().renderedFolder?.id, smokeFolder.id, "Enter with focus should activate the folder");
  assert.equal(getCurrentFocus(), null, "opening a folder must clear the previous scope's focus");
  await waitFor("keyboard-opened folder", () => folderFlow.snapshot().openProgress >= 0.999);
  await waitFor("open folder drains native frame work",()=>!scene.getMotionSnapshot().active);
  await present("unchanged open folder");
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(scene.getMotionSnapshot().active,false,"unchanged folder commits must not keep after-frame callbacks alive");
  console.log("Native stationary folder: animation and after-frame work drained");
  onKey({ type: "down", key: "ArrowDown" });
  assert.equal(getCurrentFocus()?.id, smokeFolder.childPages[0]?.[0]?.id, "first folder arrow should establish focus");
  onKey({ type: "down", key: "ArrowDown" });
  assert.equal(getCurrentFocus()?.id, smokeFolder.childPages[0]?.[folderLayout.cols]?.id, "folder arrows should use folder columns");
  onKey({ type: "down", key: "Escape" });
  await waitFor("keyboard-closed folder handoff", () => folderFlow.snapshot().renderedFolder === null);
  assert.equal(getCurrentFocus(), null, "closing a folder must clear keyboard focus");
  const folderNode = app.stage.getChildByLabel(`launchpad-item:${smokeFolder.id}`, true);
  if (!folderNode) throw new Error(`Native smoke folder node ${smokeFolder.id} was not rendered`);
  click(folderNode);
  assert.equal(getCurrentFocus(), null, "pointer-opened folders must not create keyboard focus");
  await waitFor(
    "an intermediate native folder opening frame",
    () => {
      const progress = folderFlow.snapshot().openProgress;
      return progress > 0.001 && progress < 0.999;
    },
  );
  record.folderOpenMotionObserved();
  await waitFor(
    "the native folder opening motion to settle",
    () => folderFlow.snapshot().openProgress >= 0.999,
  );
  await present("the opened native folder");
  await waitFor("desktop fade behind folder", () => {
    const dots = app.stage.getChildByLabel("native-desktop-page-dots", true);
    return Boolean(dots && dots.alpha < 0.01 && scene.getDesktopAlpha()<0.01);
  });
  await runFolderRename(smokeFolder);
  await smoke.captureSmokeFrame(app, "folder-page-1");
  addPresent(1);

  wheel(100);
  assert.equal(folderFlow.snapshot().folderPageIndex, 1, "folder wheel commits should use the shared engine");
  assert.equal(getCurrentFocus(), null, "folder wheel paging must not manufacture focus");
  await waitFor(
    "an intermediate native folder page frame",
    () => {
      const motion = scene.getMotionSnapshot();
      return motion.folderPageTrackX !== null
        && motion.folderPageTrackTargetX !== null
        && Math.abs(motion.folderPageTrackX - motion.folderPageTrackTargetX) > 0.5;
    },
  );
  record.folderPageMotionObserved();
  await waitFor(
    "the native folder page motion to settle",
    () => {
      const motion = scene.getMotionSnapshot();
      return motion.folderPageTrackX !== null
        && motion.folderPageTrackTargetX !== null
        && Math.abs(motion.folderPageTrackX - motion.folderPageTrackTargetX) < 0.05;
    },
  );
  if (folderFlow.snapshot().folderPageIndex !== 1) {
    throw new Error("Native folder page navigation did not expose a real track animation");
  }
  await present("the settled second native folder page");
  await smoke.captureSmokeFrame(app, "folder-page-2");
  const secondFolderPageX = scene.getMotionSnapshot().folderPageTrackTargetX;
  assert.ok(secondFolderPageX !== null && secondFolderPageX < -1);
  for (let sample = 0; sample < 20; sample += 1) {
    const pageIndex = sample % 2;
    assert.equal(setFolderPageIndex(pageIndex), true, "each title sample must change the logical page");
    await present("folder title stress page commit");
    const expectedX = pageIndex === 0 ? 0 : secondFolderPageX;
    await waitFor("folder title paging stress", () => {
      const motion = scene.getMotionSnapshot();
      return motion.folderPageTrackX !== null && motion.folderPageTrackTargetX !== null
        && Math.abs(motion.folderPageTrackTargetX - expectedX) < 0.05
        && Math.abs(motion.folderPageTrackX - expectedX) < 0.05;
    });
    await present("folder title stress sample");
    const pending: Container[] = [app.stage];
    let title: Text | null = null;
    while (pending.length) {
      const node = pending.pop()!;
      if (node instanceof Text && node.text === smokeFolder.name && Number(node.style.fontSize) === 26 && node.visible) title = node;
      pending.push(...node.children);
    }
    assert.ok(title, "folder title must remain in the scene while paging");
    const pixels = await smoke.captureScenePixels(app, app.contentSize.width, app.contentSize.height);
    const region = smoke.toPixelRegion(title, pixels.width, pixels.height);
    let brightPixels = 0;
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const offset = (y * pixels.width + x) * 4;
        if (pixels.pixels[offset]! > 200 && pixels.pixels[offset + 1]! > 200 && pixels.pixels[offset + 2]! > 200) brightPixels += 1;
      }
    }
    assert.ok(brightPixels > 20, `folder title disappeared after page ${pageIndex}, sample ${sample}: ${brightPixels} bright pixels`);
  }
  console.log("Folder title GPU stress: 20 alternating page samples passed");
  addPresent(1);
  if (turnFolderPage(1)) throw new Error("Native folder paging advanced past its last page");

  const child = smokeFolder.childPages[1]?.find((item): item is SceneItem => item !== null);
  if (!child) throw new Error("Native smoke folder second page must contain a launchable child");
  const childNode = app.stage.getChildByLabel(`launchpad-item:${child.id}`, true);
  if (!childNode) throw new Error(`Native smoke folder child ${child.id} was not rendered`);
  if (childNode.eventMode !== "static") {
    throw new Error(`Native smoke folder child ${child.id} was not interactive`);
  }
  const childLaunchMarker = process.env.LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER;
  if (!childLaunchMarker) {
    throw new Error("LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER is required in smoke mode");
  }
  click(childNode);
  await waitFor("launch close state committed",()=>launchFlow.isDesktopClosing.value);
  assert.equal(desktopBackground.alpha,0,"application launch removes the Pixi background immediately");
  assert.deepEqual(app.renderer.background.colorRgba,[0,0,0,0],"launch animation must clear to premultiplied transparent black");
  await waitFor("an intermediate app launch ghost",()=>launchGhostView.visible&&launchGhostView.alpha>0.15&&launchGhostView.alpha<0.6);
  assert.ok(launchGhostView.scale.x>1.2,"launch icon must expand as it fades");
  assert.ok(launchGhostView.getChildByLabel("native-launch-shadow"),"bitmap launch must render its drop shadow");
  assert.equal(launchGhostView.getChildByLabel("native-launch-image")!.width,layoutState.presentation.iconSize.value,"launch bitmap uses configured size");
  await smoke.captureSmokeFrame(app, "folder-app-launch-animation");
  record.folderCloseMotionObserved();
  await waitFor("the native folder child process", () => existsSync(childLaunchMarker));
  record.folderChildLaunchObserved();
  await waitFor("launch animation hides window",()=>!app.window.isVisible());
  context.showLaunchpad();await present("reopened after application launch");
  await waitFor("launch reopen settles",()=>!scene.getMotionSnapshot().active);
  await waitFor(
    "the native folder closing handoff",
    () => folderFlow.snapshot().renderedFolder === null,
  );
  await present("the closed native folder");
  await smoke.captureSmokeFrame(app, "folder-closed");
  addPresent(1);
  // The desktop visual-only path used to revive the last folder's retained
  // material and hit area. Exercise both full and one-row folder geometry.
  const layer=app.stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
  for(const folder of [smokeFolder,otherFolder]){
    await activateItem(folder);
    await waitFor("overlay regression folder open",()=>folderFlow.snapshot().openProgress>.999&&!scene.getMotionSnapshot().active);
    assert.equal(layer.singleStageFolderLayer.visible,true);
    closeFolder();
    await waitFor("overlay regression folder closed",()=>folderFlow.snapshot().renderedFolder===null&&!scene.getMotionSnapshot().active);
    await present("overlay regression closed commit");
    assert.equal(layer.singleStageFolderLayer.visible,false);
    for(const delay of [16,80,350]){
      onKey({type:"down",key:"Escape"});
      await waitFor("overlay regression desktop closing",()=>launchFlow.isDesktopClosing.value||!app.window.isVisible());
      await new Promise(resolve=>setTimeout(resolve,delay));
      context.showLaunchpad();
      await present("overlay regression reopen committed");
      await waitFor("overlay regression desktop reopened",()=>app.window.isVisible()&&scene.getDesktopAlpha()>.99&&!scene.getMotionSnapshot().active);
      await present("overlay regression reopened frame");
      assert.equal(folderFlow.snapshot().renderedFolder,null);
      assert.equal(layer.singleStageFolderLayer.visible,false,"reopening desktop must not revive the previous folder panel");
      const node=app.stage.getChildByLabel(`launchpad-item:${folder.id}`,true)!;
      const bounds=node.getBounds();
      app.nativeInput.emitPointer("pointermove",bounds.x+bounds.width/2,bounds.y+bounds.height/2,0);
      assert.deepEqual(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(bounds.x+bounds.width/2,bounds.y+bounds.height/2)),
        {kind:"icon",id:folder.id},"retained folder overlay must not intercept desktop icon input");
    }
    await smoke.captureSmokeFrame(app,`folder-overlay-hidden-${folder.id}`);
    click(app.stage.getChildByLabel(`launchpad-item:${folder.id}`,true)!);
    await waitFor("overlay regression real icon click",()=>folderFlow.snapshot().renderedFolder?.id===folder.id&&folderFlow.snapshot().openProgress>.999);
    closeFolder();
    await waitFor("overlay regression final folder cleanup",()=>folderFlow.snapshot().renderedFolder===null&&!scene.getMotionSnapshot().active);
  }
  console.log("Folder overlay stays hidden across desktop reopen; both folder sizes remain clickable");
}
