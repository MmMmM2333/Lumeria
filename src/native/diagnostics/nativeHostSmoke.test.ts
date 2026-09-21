import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Container,Graphics,Rectangle } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { resolveAppearancePreference } from "../../domain/appearancePreference.js";
import type { NativeBackground } from "../../rendering/native/NativeBackground.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { NativeSettingsButton } from "../../rendering/native/NativeSettingsButton.js";
import type { NativeSettingsShell } from "../../rendering/native/NativeSettingsShell.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeDataHost } from "../nativeDataHost.js";
import { NativeLaunchError } from "../nativeDataProtocol.js";
import type { createNativeSceneScheduler } from "../nativeSceneScheduler.js";
import type { createNativeShortcut } from "../nativeShortcut.js";
import type { NativeNavigationKey } from "../nativeStartup.js";
import type { createNativeWindowEffects } from "../nativeWindowEffects.js";
import type { NativeFolderFlow } from "../product/nativeInputRouter.js";

type NativeSettings = ReturnType<typeof createLaunchpadSettings>;
type LaunchpadLaunchFlow = Readonly<{
  closeDesktop(): void;
  isDesktopClosing: Readonly<{ value: boolean }>;
  isDesktopOpen: Readonly<{ value: boolean }>;
}>;
type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

// Host-level smoke verification: pointer-cancellation regression, native alpha
// blend proof, fullscreen overscan bounds, acrylic recovery, rapid open/close
// interruptions, physical shortcut and tray input, settings-only preview,
// fullscreen-startup window input, and the structured launch-failure check.
// Product state is read through live getters; the scenario returns the proof
// flag instead of mutating entry-assembly state.
export type NativeHostSmokeContext = Readonly<{
  activePageItems: () => readonly SceneItem[];
  app: NativePixiApplication;
  capture: (name: string) => Promise<void>;
  captureOwnedWindow: NativeSmokeSupport["captureOwnedWindow"];
  changeSearch: (query: string) => void;
  chromeInset: () => number;
  clickOwnedNativeWindow: NativeSmokeSupport["clickOwnedNativeWindow"];
  closeFolder: () => boolean;
  closeSettings: () => void;
  cycleOwnedWindowFocus: NativeSmokeSupport["cycleOwnedWindowFocus"];
  desktopBackground: NativeBackground;
  dismissLaunchpad: () => void;
  folderFlow: NativeFolderFlow;
  getSettingsShell: () => NativeSettingsShell | null;
  getSystemAppearance: () => "dark" | "light";
  launchFlow: () => LaunchpadLaunchFlow;
  mainShortcut: ReturnType<typeof createNativeShortcut>;
  nativeData: NativeDataHost;
  onKey: (event: NativeNavigationKey) => boolean;
  openSettings: () => void;
  present: (description: string) => Promise<void>;
  readTouchId: () => number | null;
  refreshBackground: () => Promise<void>;
  scene: NativeDesktopScene;
  sceneUpdates: ReturnType<typeof createNativeSceneScheduler>;
  searchBar: NativeSearchBar;
  settings: NativeSettings;
  settingsButton: NativeSettingsButton;
  showLaunchpad: () => void;
  smoke: NativeSmokeSupport;
  toggleLaunchpad: () => void;
  tray: () => Readonly<{ id: number }> | null;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
  windowEffects: ReturnType<typeof createNativeWindowEffects>;
}>;

export type NativeHostSmokeOutcome = Readonly<{
  handled: boolean;
  structuredLaunchFailureObserved: boolean;
}>;

export async function runNativeHostSmoke(context: NativeHostSmokeContext): Promise<NativeHostSmokeOutcome> {
  const {
    activePageItems, app, capture, captureOwnedWindow, changeSearch, chromeInset, clickOwnedNativeWindow, closeFolder,
    closeSettings, cycleOwnedWindowFocus, desktopBackground, dismissLaunchpad, folderFlow,
    getSettingsShell, getSystemAppearance, launchFlow, mainShortcut, nativeData, onKey, openSettings,
    present, readTouchId, refreshBackground, scene, sceneUpdates, searchBar, settings, settingsButton, showLaunchpad,
    smoke, toggleLaunchpad, tray, waitFor, windowEffects,
  } = context;
  let structuredLaunchFailureObserved = false;
  await (await import("./nativeFullscreenShortcutSmoke.js")).runNativeFullscreenShortcutSmoke(context);
  await (await import("./nativeFullscreenBoundsSmoke.js")).runNativeFullscreenBoundsSmoke({app,present,waitFor,
    overscan:settings.presentation.fullscreenOverscanEnabled.value?1:0});
  await (await import("../nativeIconRecoverySmoke.test.js")).runNativeIconRecoverySmoke(app);
  {
    const press = () => {
      const item = activePageItems().find(item=>item.type === "app")!;
      const bounds = scene.createDragPointerEvent(item.id,{}).currentTarget.getBoundingClientRect();
      const point = {x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
      app.nativeInput.emitPointer("pointerdown",point.x,point.y,0);
      assert.notEqual(readTouchId(),null,"regression must start with an owned pointer");
      return point;
    };
    const assertReleased = (reason:string,point:{x:number;y:number}) => {
      assert.equal(readTouchId(),null,`${reason} must clear the native gesture owner`);
      assert.equal(app.nativeInput.hasPointerCapture(),false,`${reason} must release capture`);
      app.nativeInput.emitPointer("pointerup",point.x,point.y,0);
      assert.equal(readTouchId(),null,"late pointerup must not restore cancelled ownership");
    };
    let point=press();
    onKey({type:"down",key:"ArrowRight",ctrlKey:true});assertReleased("keyboard paging",point);
    await waitFor("cancel regression page settles",()=>!scene.getMotionSnapshot().active);
    onKey({type:"down",key:"ArrowLeft",ctrlKey:true});
    await waitFor("cancel regression page restored",()=>!scene.getMotionSnapshot().active);await present("cancel regression page restored");
    // This replay must begin focused; the real window may have lost focus while earlier cases ran.
    app.nativeInput.emitFocus(true);point=press();app.nativeInput.emitFocus(false);assertReleased("focus loss",point);app.nativeInput.emitFocus(true);
    point=press();openSettings();assertReleased("settings entry",point);closeSettings();await present("cancel regression settings closed");
    point=press();dismissLaunchpad();
    await waitFor("cancel regression hidden",()=>!app.window.isVisible());assertReleased("hide",point);showLaunchpad();
    await waitFor("cancel regression shown",()=>app.state==="running"&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);await present("cancel regression shown");
    const folder=activePageItems().find(item=>item.type==="folder")!;
    const bounds=scene.createDragPointerEvent(folder.id,{}).currentTarget.getBoundingClientRect();
    app.nativeInput.emitPointer("pointerdown",bounds.left+bounds.width/2,bounds.top+bounds.height/2,0);
    app.nativeInput.emitPointer("pointerup",bounds.left+bounds.width/2,bounds.top+bounds.height/2,0);
    await waitFor("folder clickable after cancellations",()=>folderFlow.snapshot().renderedFolder?.id===folder.id);
    closeFolder();await waitFor("cancel regression folder closed",()=>folderFlow.snapshot().renderedFolder===null);await present("cancel regression complete");
    console.log("Native pointer cancellation: keyboard paging, focus loss, settings, hide and subsequent folder click passed");
  }
  {
    // Isolate the native GPU's alpha blend from DWM and wallpaper changes.
    const proof=new Container(),background=new Graphics().rect(0,0,64,64).fill(0x808080);
    const icon=new Graphics().rect(0,0,64,64).fill(0xef3b6d);icon.alpha=0.5;proof.addChild(background,icon);
    try{
      const pixels=await app.renderer.extract.pixels({target:proof,frame:new Rectangle(0,0,64,64),resolution:1});
      const index=(32*pixels.width+32)*4;
      const actual=Array.from(pixels.pixels.slice(index,index+4));
      for(const [i,expected] of [184,94,119,255].entries())assert.ok(Math.abs(actual[i]!-expected)<=2,`native alpha blend channel ${i}: ${actual[i]}`);
      writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"native-alpha-blend.json"),JSON.stringify({foreground:[239,59,109],background:[128,128,128],alpha:0.5,actual}));
    }finally{proof.destroy({children:true});}
  }
  {
    const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
    const testing=getNativePixiApplicationTesting(app),mode=app.windowMode;
    const samples:unknown[]=[];
    try{
      for(const overscan of [0,1]){
        app.setWindowMode("fullscreen",overscan);windowEffects.refresh();
        await present("fullscreen border and geometry");await present("fullscreen surface resize");
        app.window.activate();await present("fullscreen capture foreground");
        const sample=await captureOwnedWindow(testing.handles().inputWindow,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,`fullscreen-physical-overscan-${overscan}.png`));
        assert.deepEqual(sample.client,sample.frame,"fullscreen client must cover its complete outer frame");
        assert.equal(sample.surfaces.length,1);
        assert.deepEqual(sample.surfaces[0],sample.client,"GPU child must cover the full physical client, including overscan");
        const backing=app.renderer.view.texture.source;
        assert.equal(backing.pixelWidth,sample.client[2]);assert.equal(backing.pixelHeight,sample.client[3]);
        assert.equal(searchBar.y,14+chromeInset());assert.equal(settingsButton.y,searchBar.y);
        await smoke.captureSmokeFrame(app,`fullscreen-header-overscan-${overscan}`);
        samples.push({overscan,...sample,resolution:app.resolution,headerY:searchBar.y});
      }
      writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"fullscreen-geometry.json"),JSON.stringify(samples,null,2));
    }finally{app.setWindowMode(mode,settings.presentation.fullscreenOverscanEnabled.value?1:0);windowEffects.refresh();await present("restored window mode");}
  }
  if(process.env.LAUNCHPAD_ACRYLIC_RECOVERY_SMOKE==="1"){
    const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
    const handle=getNativePixiApplicationTesting(app).handles().inputWindow;
    const savedSettings=settings.persistence.capture();
    const backgroundVisible=desktopBackground.visible;
    const savedMaterial=settings.presentation.windowEffectMaterial.value,savedAppearance=settings.presentation.windowEffectAppearance.value;
    const samples:unknown[]=[];
    try{
      desktopBackground.visible=false;
      for(const appearance of ["dark","light"] as const){
        settings.persistence.restore({...savedSettings,windowEffectMaterial:"acrylic",windowEffectAppearance:appearance});
        for(let i=0;i<3;i++){
          dismissLaunchpad();await waitFor("acrylic close hides",()=>!app.window.isVisible());
          await new Promise(resolve=>setTimeout(resolve,220));
          assert.equal((await captureOwnedWindow(handle)).material,1,"old settle callbacks must not re-enable a hidden backdrop");
          showLaunchpad();await waitFor("acrylic reopen settles",()=>app.state==="running"&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
          await new Promise(resolve=>setTimeout(resolve,240));await cycleOwnedWindowFocus(handle,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,`acrylic-${appearance}-${i}.png`));
          const sample=await captureOwnedWindow(handle);
          assert.equal(sample.material,3);samples.push({appearance,i,...sample});
        }
      }
      // Controlled DWM state loss verifies focus recovery without claiming an intermittent OS reproduction.
      windowEffects.set("none","light");await present("transparent close material");
      await cycleOwnedWindowFocus(handle,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"acrylic-close-transparent.png"),true);
      windowEffects.set("acrylic","light");
      app.setWindowPresentation("none","light");
      assert.equal((await captureOwnedWindow(handle)).material,1);await cycleOwnedWindowFocus(handle);
      assert.equal((await captureOwnedWindow(handle)).material,3,"focus must restore the requested material after native state loss");
      app.window.minimize();await waitFor("acrylic minimized",()=>app.state==="suspended");showLaunchpad();
      await waitFor("acrylic minimized recovery",()=>app.state==="running"&&!app.window.isMinimized());
      await new Promise(resolve=>setTimeout(resolve,240));assert.equal((await captureOwnedWindow(handle)).material,3);
      writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"acrylic-recovery.json"),JSON.stringify(samples,null,2));
      console.log("Acrylic recovery: 6 dark/light hide-show/focus cycles, stale timer cancellation, DWM fault recovery and minimized restore passed");
    }finally{
      settings.persistence.restore(savedSettings);
      desktopBackground.visible=backgroundVisible;
      windowEffects.set(savedMaterial,resolveAppearancePreference(savedAppearance,getSystemAppearance()));
    }
  }
  {
    // Replay the same toggle callback as Alt+Space without registering over a
    // user's running instance. Sample every presented close-animation frame.
    for(const delay of [16,40,80,140,220]){
      dismissLaunchpad();await waitFor("rapid-toggle baseline hidden",()=>!app.window.isVisible());
      showLaunchpad();await new Promise(resolve=>setTimeout(resolve,delay));
      toggleLaunchpad();await waitFor("rapid-toggle closing",()=>launchFlow().isDesktopClosing.value);
      let samples=0;
      const off=app.on("presented",()=>{if(launchFlow().isDesktopClosing.value){samples++;assert.equal(desktopBackground.alpha,0,"interrupted opening must not restore the background during close");}});
      try{await waitFor("rapid-toggle close hidden",()=>!app.window.isVisible());assert.ok(samples>0);}finally{off();}
    }
    showLaunchpad();await waitFor("rapid-toggle restored",()=>scene.getDesktopAlpha()>.99&&!scene.getMotionSnapshot().active);
    console.log("Rapid open-close: background stays zero at 16/40/80/140/220ms interruptions");
    for(let cycle=0;cycle<3;cycle++){
      for(const query of ["w",""]){
        changeSearch(query);sceneUpdates.flush();
        for(const item of activePageItems()){
          const node=app.stage.getChildByLabel(`launchpad-item:${item.id}`,true);
          if(node)assert.equal(node.alpha,0,"search-to-desktop and desktop-to-search must use the same entry state for all appearing nodes");
        }
        await waitFor("search scope entry settles",()=>!scene.getMotionSnapshot().active);
      }
    }
    await present("search entry parity restored");
    console.log("Search w/backspace scope entry parity: 3 roundtrips passed");
  }
  if(process.env.LAUNCHPAD_NATIVE_SETTINGS_ONLY!=="1"){
    const {sendAltSpace}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/shortcut-smoke.js");
    assert.ok(mainShortcut.apply("alt+Space").ok,"Alt+Space must register for the isolated physical input test");
    try{
      // Earlier monitor tests can leave the window on a different display from
      // the cursor. Establish the same-display precondition before testing hide;
      // cross-display activation correctly relocates and shows instead.
      app.prepareShortcutActivation();
      await present("shortcut target display prepared");
      await waitFor("shortcut target display settles",()=>scene.getDesktopAlpha()>.99&&!scene.getMotionSnapshot().active);
      app.window.activate();
      const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
      await waitFor("shortcut hide fixture is foreground",()=>getNativePixiApplicationTesting(app).diagnostics().window.snapshot.focused);
      await sendAltSpace();
      await waitFor("shortcut close animation",()=>scene.getDesktopAlpha()<0.95&&scene.getDesktopAlpha()>0.02);
      assert.equal(app.window.isVisible(),true,"window remains visible during close animation");
      await smoke.captureSmokeFrame(app, "shortcut-close-animation");
      await waitFor("physical shortcut hides",()=>!app.window.isVisible());
      await sendAltSpace();
      await waitFor("physical shortcut reopens",()=>app.window.isVisible()&&launchFlow().isDesktopOpen.value);
      await waitFor("shortcut reopen settles",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
      app.window.minimize();
      await waitFor("shortcut test minimized",()=>app.window.isMinimized()&&app.state==="suspended");
      await sendAltSpace();
      await waitFor("Alt+Space restores minimized window",()=>!app.window.isMinimized()&&app.window.isVisible()&&app.state==="running");
      await waitFor("minimized restoration settles",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
      console.log("Physical Alt+Space restored minimized/suspended window");
      dismissLaunchpad();
      await waitFor("interruptible close started",()=>launchFlow().isDesktopClosing.value);
      await sendAltSpace();
      await waitFor("shortcut reverses closing",()=>launchFlow().isDesktopOpen.value&&scene.getDesktopAlpha()>0.99);
      await new Promise(resolve=>setTimeout(resolve,450));
      assert.equal(app.window.isVisible(),true,"old close completion cannot hide a reopened window");
      await present("shortcut animation restoration");
      app.nativeInput.emitKey("down",{keyCode:0x1b});
      await waitFor("Escape uses animated dismissal",()=>launchFlow().isDesktopClosing.value);
      await waitFor("Escape hides after animation",()=>!app.window.isVisible());
      await sendAltSpace();
      await waitFor("reopen after Escape",()=>app.window.isVisible()&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
      console.log("Physical Alt+Space: animated close, hidden reopen and close interruption passed");
    }finally{mainShortcut.apply(null);}
  }
  else console.log("Settings-focused smoke: skipped physical Alt+Space to preserve the running user instance");
  {
    const {sendTrayTestAction}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/tray-smoke.js");
    const trayHandle=tray();
    assert.ok(trayHandle);
    await sendTrayTestAction(trayHandle.id,"left");await waitFor("tray left click hides",()=>!app.window.isVisible());
    await sendTrayTestAction(trayHandle.id,"left");await waitFor("tray left click reopens",()=>app.window.isVisible()&&launchFlow().isDesktopOpen.value);
    await waitFor("tray show settles",()=>scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
    app.window.minimize();await waitFor("tray minimized fixture",()=>app.window.isMinimized()&&app.state==="suspended");
    await sendTrayTestAction(trayHandle.id,"menu",0);await waitFor("tray menu restores",()=>!app.window.isMinimized()&&app.state==="running");
    await sendTrayTestAction(trayHandle.id,"menu",1);await waitFor("tray settings opened",()=>Boolean(getSettingsShell()));
    await present("tray settings ready");
    app.nativeInput.emitKey("down",{keyCode:0x1b});await present("tray settings dismissed");
    await waitFor("tray settings close animation finished",()=>!getSettingsShell());
    console.log("Tray left toggle, right-menu restore and settings actions passed");
  }
  if(settings.presentation.windowMode.value==="fullscreen"){
    await present("restored fullscreen background settled");
    assert.equal(desktopBackground.getLocalBounds().width,app.contentSize.width,"startup background must cover the fullscreen width");
    assert.equal(desktopBackground.getLocalBounds().height,app.contentSize.height,"startup background must cover the fullscreen height");
    await smoke.captureSmokeFrame(app, "fullscreen-startup-background");
    const {assertWindowInputCoverage}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/window-input-smoke.js");
    await assertWindowInputCoverage(app);
    const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
    const testing=getNativePixiApplicationTesting(app),handle=testing.handles().inputWindow;
    const nativePoint=(x:number,y:number)=>testing.clientToScreen(Math.round(x*app.resolution),Math.round(y*app.resolution));
    const buttonBounds=settingsButton.getBounds();
    await clickOwnedNativeWindow(handle,nativePoint(buttonBounds.x+buttonBounds.width/2,buttonBounds.y+buttonBounds.height/2));
    await waitFor("real far-right settings click",()=>getSettingsShell()!==null);
    app.nativeInput.emitKey("down",{keyCode:0x1b});await present("fullscreen settings dismissed");
    const blank={x:app.contentSize.width-60,y:app.contentSize.height-110};
    assert.equal(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(blank.x,blank.y)).kind,"surface");
    await clickOwnedNativeWindow(handle,nativePoint(blank.x,blank.y));
    await waitFor("real fullscreen blank click hides launchpad",()=>!app.window.isVisible());
    showLaunchpad();await present("fullscreen blank-close restoration");
    await waitFor("fullscreen reopen animation settles",()=>!scene.getMotionSnapshot().active);
    app.setWindowMode("windowed");
    const restored=settings.persistence.capture();restored.windowMode="windowed";settings.persistence.restore(restored);
    await waitFor("startup fullscreen test restores window dimensions",()=>app.contentSize.width===900&&app.contentSize.height===600);
    settings.actions.clearDraftBackgroundImage();
    const cleared=settings.persistence.capture();cleared.backgroundSource="systemMaterial";cleared.backgroundImagePath=null;settings.persistence.restore(cleared);
    await refreshBackground();await present("windowed background after fullscreen startup");
    console.log("Fullscreen startup: full background, 25 OS hit points, real far-right settings and blank-click hide passed");
  }
  try {
    await nativeData.launchApp(`__launchpad-native-smoke-missing-${process.pid}-${Date.now()}__`);
    throw new Error("Native launch failure smoke unexpectedly succeeded");
  } catch (error) {
    if (!(error instanceof NativeLaunchError) || error.kind !== "missingLaunchInfo") throw error;
    structuredLaunchFailureObserved = true;
  }
  return Object.freeze({ handled: true, structuredLaunchFailureObserved });
}
