import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { Container, Sprite, Texture } from "pixi.js";
import { createResidentIconRepository } from "../rendering/native/nativeIconResidency.js";
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

  const root = new Container(); app.stage.addChild(root);
  let decoded = false;
  const repository = createResidentIconRepository({
    stage: root, get renderer() { return app.renderer; }, get state() { return app.state; },
    invalidate: () => app.invalidate(), beforeRender: callback => app.beforeRender(callback),
  }, async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
    const image = await loadNativeIconTexture(canvas.toDataURL("image/png")); decoded = true; return image;
  }, 6000);
  const first = { id: "cold-first", iconPath: "C:/smoke/first.png" }, second = { id: "cold-second", iconPath: "C:/smoke/second.png" };
  const artwork = new Sprite(Texture.EMPTY); root.addChild(artwork);
  let off = () => {};
  try {
    await repository.synchronize([first, second]);
    assert.equal(repository.snapshot().cached.length, 0);
    repository.resolve(first, () => { artwork.texture = repository.resolve(first)!; });
    off = app.on("presented", () => {
      assert.ok(decoded, "cold icon must decode before the next presented frame");
      assert.notEqual(artwork.texture, Texture.EMPTY, "a cold load must not present its placeholder");
    });
    await present(); off();
    const original = artwork.texture;
    assert.equal((original.source as NativeRecoverableIconSource).retainedPixelBytes, 0);
    repository.resolve(second, () => { artwork.texture = repository.resolve(second)!; });
    await present();
    assert.ok(repository.residency().gpuBytes <= 6000);
    const oldData = original.source._gpuData[app.renderer.uid];
    assert.ok(!oldData || !("gpuTexture" in oldData) || !oldData.gpuTexture, "budget must evict the old off-scene texture");
    artwork.texture = original;
    await present();
    assert.deepEqual(Uint8Array.from((await app.renderer.extract.pixels({ target: original })).pixels),
      Uint8Array.from(context.getImageData(0, 0, 32, 32).data), "evicted icon must restore exactly before revisiting");
    assert.equal((original.source as NativeRecoverableIconSource).retainedPixelBytes, 0);
    console.log("Native icon residency: cold first frame, budget eviction and revisiting preserve pixels");
  } finally { off(); root.destroy({ children: true }); repository.dispose(); }
}
