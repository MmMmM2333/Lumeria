import assert from "node:assert/strict";
import { FederatedWheelEvent,Graphics } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import {
DEFAULT_PAGE_SWIPE_SPEED,
setPageSwipeSpeed,
} from "../../rendering/pageSwipePreview.js";
import type { SceneFocusedIcon,SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeNavigationKey } from "../nativeStartup.js";
import type { NativeIconNode } from "../product/nativeIconNode.js";

type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

// Page-dot, keyboard paging, touchpad phase routing and discrete/continuous
// wheel verification. Reads the live frame through getters so paging commits
// made by the product input router are always observed.
export type NativePagingSmokeContext = Readonly<{
  activePageItems: () => readonly SceneItem[];
  app: NativePixiApplication;
  capture: (name: string) => Promise<void>;
  click: (target: import("pixi.js").Container) => void;
  closeSettings: () => void;
  commitDesktopPage: (pageIndex: number) => boolean;
  currentFrame: () => Readonly<{ interaction: Readonly<{ focusedIcon: SceneFocusedIcon | null }>; viewport: Readonly<{ activePageIndex: number; activePages: readonly (readonly (SceneItem | null)[])[] }> }>;
  getSettingsShell: () => unknown | null;
  iconNodes: () => readonly NativeIconNode[];
  interruptWheel: (event: Readonly<{ timeStamp?: unknown }>) => void;
  isDesktopPageMotionObserved: () => boolean;
  onKey: (event: NativeNavigationKey) => boolean;
  openSettings: () => void;
  present: (description: string) => Promise<void>;
  scene: NativeDesktopScene;
  setFocusedIcon: (focusedIcon: SceneFocusedIcon | null) => void;
  smoke: NativeSmokeSupport;
  turnPage: (direction: 1 | -1) => boolean;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export type NativePagingSmokeOutcome = Readonly<{
  pageNavigation: "skipped-single-page" | "verified";
  presentCount: number;
}>;

export async function runNativePagingSmoke(context: NativePagingSmokeContext): Promise<NativePagingSmokeOutcome> {
  const {
    activePageItems, app, capture, click, closeSettings, commitDesktopPage, currentFrame,
    getSettingsShell, iconNodes, interruptWheel, isDesktopPageMotionObserved, onKey, openSettings,
    present, scene, setFocusedIcon, smoke, turnPage, waitFor,
  } = context;
  let presentCount = 0;
  await smoke.captureSmokeFrame(app, "desktop-page-1");
  const lastDot = app.stage.getChildByLabel(`native-page-dot:${currentFrame().viewport.activePages.length - 1}`, true);
  assert.ok(lastDot, "desktop pages must expose clickable dots");
  click(lastDot);
  assert.equal(currentFrame().viewport.activePageIndex, currentFrame().viewport.activePages.length - 1, "page dot click must commit its exact page");
  const firstDot = app.stage.getChildByLabel("native-page-dot:0", true);
  assert.ok(firstDot);
  click(firstDot);
  const settleDesktop = async (): Promise<void> => {
    await waitFor("desktop input motion to settle", () => {
      const motion = scene.getMotionSnapshot();
      return Math.abs(motion.desktopPageTrackX - motion.desktopPageTrackTargetX) < 0.05;
    });
    await present("settled desktop input");
  };
  const currentFocus = (): SceneFocusedIcon | null => currentFrame().interaction.focusedIcon;
  assert.equal(currentFocus(), null, "startup must have no keyboard focus");
  onKey({ type: "down", key: " " });
  onKey({ type: "down", key: "PageDown" });
  assert.equal(currentFocus(), null, "Space must not activate or focus an icon");
  assert.equal(currentFrame().viewport.activePageIndex, 0, "PageDown is not the original page shortcut");
  onKey({ type: "down", key: "Enter" });
  assert.equal(currentFocus()?.id, activePageItems()[0]?.id, "first Enter should only establish focus");
  onKey({ type: "down", key: "ArrowRight" });
  assert.equal(currentFocus()?.id, activePageItems()[1]?.id, "plain arrows should navigate icons");
  assert.equal(currentFrame().viewport.activePageIndex, 0, "plain arrows must not turn pages");
  onKey({ type: "down", key: "ArrowRight", ctrlKey: true });
  onKey({ type: "down", key: "ArrowRight", ctrlKey: true, repeat: true });
  assert.equal(currentFrame().viewport.activePageIndex, 2, "two keyboard page commits must work before any animation frame");
  assert.equal(currentFocus()?.id, activePageItems()[0]?.id, "keyboard paging should focus the new page's first icon");
  assert.ok(app.stage.getChildByLabel("launchpad-item:native-layout-icon", true), "interrupted turns must retain the still-presented source page");
  await settleDesktop();
  onKey({ type: "down", key: "ArrowLeft", ctrlKey: true });
  onKey({ type: "down", key: "ArrowLeft", ctrlKey: true });
  await settleDesktop();
  setFocusedIcon(null);

  // Inject at the same Pixi event boundary consumed by native wheel input.
  // This verifies application integration; physical touchpad fidelity needs hardware acceptance.
  let wheelTime = performance.now();
  {
    assert.equal(app.supportsTouchpadGestures,true,"Direct Manipulation must initialize on the actual GPU HWND");
    let sequence=1000,time=performance.now();
    const emit=(phase:"begin"|"update"|"inertia"|"end"|"cancel",dx=0,dy=0)=>{
      time+=16;app.nativeInput.emitWheel(400,250,dx,dy,0,0,time,{source:"touchpad",phase,sequence});
    };
    emit("begin");emit("update",120);emit("update",160);await present("touchpad direct scrub");
    assert.equal(currentFrame().viewport.activePageIndex,0,"touchpad update does not commit a discrete notch");
    emit("inertia");assert.equal(currentFrame().viewport.activePageIndex,1);
    for(let i=0;i<40;i++)emit("inertia",100);
    assert.equal(currentFrame().viewport.activePageIndex,1,"inertia tail cannot repeat a page");emit("end");await settleDesktop();
    sequence++;emit("begin");emit("update",100);openSettings();await present("touchpad modal route change");emit("inertia",100);
    assert.equal(currentFrame().viewport.activePageIndex,1,"old desktop gesture cannot continue after opening settings");emit("end");closeSettings();await waitFor("touchpad settings close",()=>!getSettingsShell());await settleDesktop();
    commitDesktopPage(0);await settleDesktop();
    const {NativeScrollView:ScrollView}=await import("../../rendering/native/NativeScrollView.js");
    for(const speed of [6,4] as const){
      setPageSwipeSpeed(speed);
      try{
        sequence++;emit("begin");emit("update",600);emit("update",600);emit("inertia");
        assert.equal(currentFrame().viewport.activePageIndex,1);
        const span=scene.getPageWidth("desktop",0,app.contentSize.width);
        await waitFor("limited swipe visible intermediate frame",()=>{const x=scene.getMotionSnapshot().desktopPageTrackX;return x < -span*.02&&x > -span*.9;});
        await present("speed-limited page visible");await smoke.captureSmokeFrame(app, `swipe-speed-${speed}-middle`);
        emit("end");await settleDesktop();
        const settled=scene.getMotionSnapshot();
        assert.ok(settled.desktopPageTrackTargetX<0&&Math.abs(settled.desktopPageTrackX-settled.desktopPageTrackTargetX)<1,"limited swipe reaches the rendered page target, including the page gap");
      }finally{setPageSwipeSpeed(DEFAULT_PAGE_SWIPE_SPEED);interruptWheel({timeStamp:time+1});commitDesktopPage(0);await settleDesktop();}
    }
    const scrollProbe=new ScrollView(()=>app.invalidate());scrollProbe.position.set(430,170);scrollProbe.resize(240,160,800);
    scrollProbe.content.addChild(new Graphics({eventMode:"none"}).rect(0,0,240,800).fill(0x334455));app.stage.addChild(scrollProbe);
    try{
      await present("touchpad list scroll probe");sequence++;
      const listWheel=(phase:"begin"|"update"|"inertia"|"end",dy=0)=>{time+=16;app.nativeInput.emitWheel(480,220,0,dy,0,0,time,{source:"touchpad",phase,sequence});};
      listWheel("begin");listWheel("update",28);listWheel("inertia",40);listWheel("end");
      assert.equal(scrollProbe.offset,68,"list consumes active and OS inertia pixels once, without an extra inertia driver");
      assert.equal(currentFrame().viewport.activePageIndex,0,"list wheel must not reach desktop paging");
    }finally{scrollProbe.destroy();await present("touchpad list probe cleanup");}
    console.log("Touchpad Pixi integration: explicit phases, one-page inertia drain and modal route cancellation passed");
  }
  const wheel = (deltaY: number, elapsedMs = 16): void => {
    const event = new FederatedWheelEvent(app.renderer.events.rootBoundary);
    event.deltaY = deltaY;
    event.deltaMode = 0;
    event.timeStamp = wheelTime += elapsedMs;
    app.stage.emit("wheel", event);
  };
  wheel(100);
  assert.equal(currentFrame().viewport.activePageIndex, 1, "one discrete wheel step should commit immediately");
  wheel(100);
  assert.equal(currentFrame().viewport.activePageIndex, 1, "a discrete burst should not turn twice immediately");
  wheel(100, 320);
  assert.equal(currentFrame().viewport.activePageIndex, 2, "accepted repeat input must not wait for the previous spring");
  assert.equal(currentFocus(), null, "wheel paging must not manufacture focus");
  wheel(-100);
  assert.equal(currentFrame().viewport.activePageIndex, 1, "opposite wheel input should retarget immediately");
  await settleDesktop();
  interruptWheel({timeStamp:wheelTime+1});
  commitDesktopPage(0);
  await settleDesktop();
  wheel(5);
  await present("continuous wheel scrub");
  assert.ok(scene.getMotionSnapshot().desktopPageTrackX < -0.5, "small wheel deltas should scrub the live track");
  interruptWheel({ timeStamp: wheelTime + 1 });
  await settleDesktop();
  assert.equal(currentFrame().viewport.activePageIndex, 0, "cancelled short gestures must not commit");
  assert.ok(Math.abs(scene.getMotionSnapshot().desktopPageTrackX) < 0.1, "cancelled scrubs should return to their source page");
  wheel(60);
  wheel(60);
  wheel(60);
  await waitFor("continuous wheel progress commit", () => currentFrame().viewport.activePageIndex === 1);
  await settleDesktop();
  interruptWheel({timeStamp:wheelTime+1});
  commitDesktopPage(0);
  await settleDesktop();
  wheel(20);
  wheel(20);
  await waitFor("continuous wheel velocity commit", () => currentFrame().viewport.activePageIndex === 1);
  await settleDesktop();
  interruptWheel({timeStamp:wheelTime+1});
  commitDesktopPage(0);
  await settleDesktop();
  wheel(-20);
  await present("first-page edge resistance");
  assert.ok(scene.getMotionSnapshot().desktopPageTrackX > 0, "edge gestures should expose a resisted stretch");
  assert.ok(scene.getMotionSnapshot().desktopPageTrackX < app.contentSize.width * 0.12, "edge stretch must remain bounded");
  await new Promise<void>((resolve) => setTimeout(resolve, 160));
  await settleDesktop();
  assert.equal(currentFrame().viewport.activePageIndex, 0, "edge gestures must not leave the page range");
  interruptWheel({timeStamp:wheelTime+1});
  let pageNavigation: NativePagingSmokeOutcome["pageNavigation"] = "skipped-single-page";
  if (currentFrame().viewport.activePages.length > 1) {
    while (currentFrame().viewport.activePageIndex < currentFrame().viewport.activePages.length - 1) {
      if (!turnPage(1)) throw new Error("Native smoke could not turn to the next desktop page");
      await waitFor("desktop page motion to settle", () => {
        const motion = scene.getMotionSnapshot();
        return Math.abs(motion.desktopPageTrackX - motion.desktopPageTrackTargetX) < 0.05;
      });
      await waitFor(
        "the next native desktop page to become visible",
        () => iconNodes().every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
      );
      await present("the settled next desktop page");
      await smoke.captureSmokeFrame(app, `desktop-page-${currentFrame().viewport.activePageIndex + 1}`);
      presentCount += 1;
    }
    if (turnPage(1)) throw new Error("Native desktop paging advanced past its last page");
    while (currentFrame().viewport.activePageIndex > 0) {
      if (!turnPage(-1)) throw new Error("Native smoke could not turn to the previous desktop page");
      await waitFor("desktop page motion to settle", () => {
        const motion = scene.getMotionSnapshot();
        return Math.abs(motion.desktopPageTrackX - motion.desktopPageTrackTargetX) < 0.05;
      });
      await waitFor(
        "the previous native desktop page to become visible",
        () => iconNodes().every((node) => node.alpha >= 0.999 && node.renderable && node.visible),
      );
      await present("the settled previous desktop page");
      presentCount += 1;
    }
    if (!isDesktopPageMotionObserved()) {
      throw new Error("Native desktop page changed without an observable intermediate track position");
    }
    pageNavigation = "verified";
  }
  return Object.freeze({ pageNavigation, presentCount });
}
