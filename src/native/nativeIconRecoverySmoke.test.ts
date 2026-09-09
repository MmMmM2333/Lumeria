import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { Sprite } from "pixi.js";
import type { NativePixiApplication } from "../../vendor/electrobun-pixi-native-starter/src/runtime/native-app.js";
import { getNativePixiApplicationTesting } from "../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js";
import { loadNativeIconTexture } from "../rendering/native/nativeIconTextureLoader.js";
import { NativeRecoverableIconSource, prepareNativeIconTextures } from "../rendering/native/nativeRecoverableIconSource.js";

export async function runNativeIconRecoverySmoke(app: NativePixiApplication): Promise<void> {
  const canvas = createCanvas(32, 32), context = canvas.getContext("2d");
  context.fillStyle = "#ef3b6d"; context.fillRect(0, 0, 32, 32);
  context.fillStyle = "#123abc"; context.fillRect(8, 8, 16, 16);
  const texture = await loadNativeIconTexture(canvas.toDataURL("image/png"));
  const source = texture.source as NativeRecoverableIconSource;
  const sprite = new Sprite(texture); sprite.position.set(20, 20); app.stage.addChild(sprite);
  const present = async () => { const next = app.nextPresent(); app.invalidate(); await next; };
  const pixels = async () => {
    await prepareNativeIconTextures(app.stage, app.renderer);
    const result = await app.renderer.extract.pixels({ target: texture });
    return Uint8Array.from(result.pixels);
  };
  try {
    await present();
    assert.equal(source.retainedPixelBytes, 0, "actual renderer must use the custom uploader");
    const expected = await pixels();
    assert.deepEqual(expected, Uint8Array.from(context.getImageData(0, 0, 32, 32).data), "GPU base pixels must match the decoded input");
    for (const mode of ["unload", "gpu-gc", "device"] as const) {
      if (mode === "unload") source.unload();
      else if (mode === "gpu-gc") {
        const system = app.renderer.texture as unknown as { _managedTextures: { remove(source: NativeRecoverableIconSource): void } };
        system._managedTextures.remove(source);
      } else {
        const recovered = new Promise<void>(resolve => { const off = app.on("recovered", () => { off(); resolve(); }); });
        getNativePixiApplicationTesting(app).injectFault("device-lost"); app.invalidate(); await recovered;
      }
      Bun.gc(true); await present();
      assert.equal(source.retainedPixelBytes, 0, `${mode}: rebuilt texture must release pixels again`);
      assert.deepEqual(await pixels(), expected, `${mode}: GPU pixels must match exactly`);
    }
    console.log("Native icon recovery: actual upload, unload, GPU GC and device loss preserve pixels");
  } finally { sprite.destroy(); texture.destroy(true); }
}
