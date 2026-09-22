import assert from "node:assert/strict";
import type { Container } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { loadNativeLayoutWithRetry } from "../nativeLayoutLoad.js";

// Startup verification scenarios drive the same `loadNativeLayoutWithRetry`
// path as production: the first two reads fail in smoke mode, the retry notice
// must be actionable, and a cancelled read must exit without a window.

export const NATIVE_STARTUP_SMOKE_ATTEMPTS = 2;

export type NativeStartupSmokeContext = Readonly<{
  app: NativePixiApplication;
  capture: (name: string) => Promise<void>;
  click: (target: Container) => void;
  present: (description: string) => Promise<void>;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export async function verifyNativeStartupCancellation(context: NativeStartupSmokeContext): Promise<void> {
  const cancelled = loadNativeLayoutWithRetry(context.app, async () => {
    throw new Error("smoke: cancelled layout read");
  });
  await context.waitFor("cancellable startup notice", () => Boolean(context.app.stage.getChildByLabel("native-recovery:close", true)));
  await context.present("startup notice cancellation");
  context.click(context.app.stage.getChildByLabel("native-recovery:close", true)!);
  assert.deepEqual(await cancelled, { cancelled: true });
  assert.equal(context.app.stage.getChildByLabel("native-layout-recovery", true), null);
}

export function shouldInjectNativeStartupLoadFailure(loadAttempts: number): boolean {
  return loadAttempts <= NATIVE_STARTUP_SMOKE_ATTEMPTS;
}

export async function driveNativeStartupRetryNotices(
  context: NativeStartupSmokeContext & Readonly<{ loadAttempts: () => number }>,
): Promise<void> {
  for (let attempt = 1; attempt <= NATIVE_STARTUP_SMOKE_ATTEMPTS; attempt++) {
    await context.waitFor("startup layout retry notice", () => context.loadAttempts() === attempt && Boolean(context.app.stage.getChildByLabel("native-recovery:retry", true)));
    await context.present("startup layout retry hit target");
    if (attempt === 2) await context.capture("layout-load-retry");
    if (attempt === 1) context.click(context.app.stage.getChildByLabel("native-recovery:retry", true)!);
    else {
      context.app.nativeInput.emitKey("down", { keyCode: 13 });
      context.app.nativeInput.emitKey("up", { keyCode: 13 });
    }
  }
}

// The first presented smoke scene must already have prepared at least one icon
// texture. Called at that lifecycle moment by the entry assembly.
export function assertNativeScenePrepared(cachedIconCount: number): void {
  assert.ok(cachedIconCount >= 1, "first native scene must prepare its icon before presentation");
}

export async function verifyNativeRecoveryPanel(context:NativeStartupSmokeContext):Promise<void>{
  let attempts=0,resets=0,reveals=0;
  const loading=loadNativeLayoutWithRetry(context.app,async()=>{attempts++;if(resets===0)throw new Error("Invalid layout C:\\Example\\Launchpad\\layout.json: settings.missingTargetStyle is required"+(attempts===2?"\n"+"Long diagnostic detail. ".repeat(150):""));return null;},
    {reveal:async()=>{reveals++;},reset:async()=>{resets++;}});
  const node=(id:string)=>context.app.stage.getChildByLabel(`native-recovery:${id}`,true)!;
  await context.waitFor("recovery panel",()=>Boolean(node("retry")));
  assert.ok(context.app.stage.getChildByLabel("native-layout-recovery-background",true));
  await context.present("recovery panel");await context.capture("layout-recovery");
  assert.ok(node("details"),"error details are shown by default");await context.capture("layout-recovery-details");
  context.app.nativeInput.emitKey("down",{keyCode:9});context.app.nativeInput.emitKey("up",{keyCode:9});
  assert.equal((node("details") as Container & {focused:boolean}).focused,true,"Tab enters selectable error details");
  context.click(node("retry"));await context.waitFor("recovery retry",()=>attempts===2&&Boolean(node("retry")));
  await context.present("long recovery detail");await context.capture("layout-recovery-long");
  context.click(node("location"));await context.present("recovery location");assert.equal(reveals,1);
  context.click(node("reset"));await context.present("recovery reset confirmation");await context.capture("layout-recovery-confirm");assert.equal(resets,0);
  context.app.nativeInput.emitKey("down",{keyCode:13});context.app.nativeInput.emitKey("up",{keyCode:13});await context.present("safe default cancels reset");assert.equal(resets,0);
  context.click(node("reset"));await context.present("confirm again");context.click(node("reset-confirm"));
  assert.deepEqual(await loading,{cancelled:false,layout:null,recovered:true});assert.equal(resets,1);
  assert.equal(context.app.stage.getChildByLabel("native-layout-recovery",true),null);
}
