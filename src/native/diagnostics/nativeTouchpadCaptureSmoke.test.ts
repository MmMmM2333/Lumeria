import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FederatedWheelEvent } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createTouchpadCapture } from "../../debug/touchpadCapture.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import { getPageSwipeSpeed } from "../../rendering/pageSwipePreview.js";

type TouchpadCapture = ReturnType<typeof createTouchpadCapture>;
type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

// Touchpad capture UI/export self-test. The dev capture panel itself stays in
// the entry assembly as dev tooling; only the verification sequence and its OS
// capture fixture live here, and it owns the deliberate quit request.
export type NativeTouchpadCaptureSelfTestContext = Readonly<{
  app: NativePixiApplication;
  capture: TouchpadCapture;
  directory: string;
  outputPath: string;
  present: (description: string) => Promise<void>;
  requestQuit: () => void;
  searchBar: NativeSearchBar;
  smoke: NativeSmokeSupport;
}>;

export async function runNativeTouchpadCaptureSelfTest(
  context: NativeTouchpadCaptureSelfTestContext,
): Promise<void> {
  const { app, capture, directory, outputPath, present, requestQuit, searchBar, smoke } = context;
  await present("capture controls ready");
  searchBar.handleKey({type:"down",key:"F6"});assert.equal(capture.recording,true);
  for(const expected of [0,6,4]){searchBar.handleKey({type:"down",key:"F9"});assert.equal(getPageSwipeSpeed(),expected);}
  const sample=new FederatedWheelEvent(app.renderer.events.rootBoundary);sample.deltaX=5;sample.deltaY=0;sample.deltaMode=0;sample.timeStamp=performance.now();
  app.stage.emit("wheelcapture",sample);
  searchBar.handleKey({type:"down",key:"F7"});
  await present("capture recording and marker");
  const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
  await smoke.captureOwnedWindow(getNativePixiApplicationTesting(app).handles().inputWindow,join(directory,"capture-ui.png"));
  searchBar.handleKey({type:"down",key:"F8"});
  const saved=JSON.parse(readFileSync(outputPath,"utf8")) as {events:{kind:string}[]};
  assert.ok(saved.events.some(event=>event.kind==="wheel"));assert.ok(saved.events.some(event=>event.kind==="mark"));assert.equal(capture.recording,false);
  console.log("Touchpad capture UI/export selftest passed");
  setTimeout(requestQuit,1500);
}
