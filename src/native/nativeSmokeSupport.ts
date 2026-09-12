import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Rectangle, type Container } from "pixi.js";
import type { NativePixiApplication } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { prepareNativeIconTextures } from "../rendering/native/nativeRecoverableIconSource.js";
import type { NativePixelData, NativePixelRegion } from "./nativePixelProof.js";
export { assertNativeScenePixels } from "./nativePixelProof.js";
export { activationClickOwnedNativeWindow, captureOwnedWindow, clickOwnedNativeWindow, cycleOwnedWindowFocus, dragOwnedNativeWindow, respondToOwnedColorDialog } from "./nativeSettingsSmoke.js";

export function toPixelRegion(
  target: Readonly<{ getBounds(): Readonly<{ height: number; width: number; x: number; y: number }> }>,
  width: number,
  height: number,
): NativePixelRegion {
  const bounds = target.getBounds();
  const x = Math.max(0, Math.floor(bounds.x) - 2);
  const y = Math.max(0, Math.floor(bounds.y) - 2);
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width) + 2);
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height) + 2);
  if (right <= x || bottom <= y) {
    throw new Error(
      `Native text bounds are outside the captured scene: ${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`,
    );
  }
  return Object.freeze({ height: bottom - y, width: right - x, x, y });
}

export async function captureScenePixels(
  app: NativePixiApplication,
  width: number,
  height: number,
): Promise<NativePixelData> {
  await prepareNativeIconTextures(app.stage, app.renderer);
  return await app.renderer.extract.pixels({
    antialias: true,
    clearColor: 0x090b14,
    frame: new Rectangle(0, 0, width, height),
    resolution: 1,
    target: app.stage,
  }) as unknown as NativePixelData;
}

export async function captureSmokeFrame(app: NativePixiApplication, name: string): Promise<void> {
  const directory = process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR;
  if (!directory) throw new Error("LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR is required in smoke mode");
  await prepareNativeIconTextures(app.stage, app.renderer);
  const dataUrl = await app.renderer.extract.base64({
    target: app.stage,
    frame: new Rectangle(0, 0, app.contentSize.width, app.contentSize.height),
    resolution: 1,
    clearColor: 0x090b14,
    format: "png",
  });
  writeFileSync(join(directory, `${name}.png`), Buffer.from(dataUrl.split(",")[1]!, "base64"));
}

export function clickWithNativeInput(app: NativePixiApplication, target: Container, button=0, modifiers=0, validateTarget=false): void {
  const hitArea = target.hitArea as Readonly<{
    height?: number;
    width?: number;
    x?: number;
    y?: number;
  }> | null;
  const bounds = target.getBounds();
  const point = hitArea && Number(hitArea.width) > 0 && Number(hitArea.height) > 0
    ? target.toGlobal({
      x: Number(hitArea.x) + Number(hitArea.width) / 2,
      y: Number(hitArea.y) + Number(hitArea.height) / 2,
    })
    : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const { x, y } = point;
  app.nativeInput.emitPointer("pointermove", x, y, 0, modifiers);
  if (validateTarget) {
    const boundary = app.renderer.events.rootBoundary;
    const hit = boundary.hitTest(x, y);
    let current: Container | null = hit;
    while (current && current !== target) current = current.parent;
    if (!current) {
      throw new Error(
        `Native pointer target ${target.label || target.constructor.name} was obscured by ${hit?.label || hit?.constructor.name || "nothing"}; ancestors=${[hit,hit?.parent,hit?.parent?.parent].map(node=>node?.label||node?.constructor.name).join("/")}; point=${x},${y}`,
      );
    }
  }
  app.nativeInput.emitPointer("pointerdown", x, y, button, modifiers);
  app.nativeInput.emitPointer("pointerup", x, y, button, modifiers);
}
