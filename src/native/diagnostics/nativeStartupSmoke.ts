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
  await context.waitFor("cancellable startup notice", () => Boolean(context.app.stage.getChildByLabel("native-notice:close", true)));
  await context.present("startup notice cancellation");
  context.click(context.app.stage.getChildByLabel("native-notice:close", true)!);
  assert.deepEqual(await cancelled, { cancelled: true });
  assert.equal(context.app.stage.getChildByLabel("native-notice", true), null);
}

export function shouldInjectNativeStartupLoadFailure(loadAttempts: number): boolean {
  return loadAttempts <= NATIVE_STARTUP_SMOKE_ATTEMPTS;
}

export async function driveNativeStartupRetryNotices(
  context: NativeStartupSmokeContext & Readonly<{ loadAttempts: () => number }>,
): Promise<void> {
  for (let attempt = 1; attempt <= NATIVE_STARTUP_SMOKE_ATTEMPTS; attempt++) {
    await context.waitFor("startup layout retry notice", () => context.loadAttempts() === attempt && Boolean(context.app.stage.getChildByLabel("native-notice:action", true)));
    await context.present("startup layout retry hit target");
    if (attempt === 2) await context.capture("layout-load-retry");
    if (attempt === 1) context.click(context.app.stage.getChildByLabel("native-notice:action", true)!);
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
