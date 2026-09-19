import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Container, Sprite, Texture, GpuTextureSystem } from "pixi.js";
import { loadNativeIconTexture } from "../rendering/native/nativeIconTextureLoader.js";
import { decodeIconPixels, NativeRecoverableIconSource, nativeIconUploader, prepareNativeIconTextures } from "../rendering/native/nativeRecoverableIconSource.js";

const canvas = createCanvas(8, 8), context = canvas.getContext("2d");
context.fillStyle = "#ef3b6d"; context.fillRect(0, 0, 8, 8);
const encoded = canvas.toBuffer("image/png");
assert.equal(GpuTextureSystem.uploadExtensions["native-recoverable-icon"], nativeIconUploader);
class InspectableIconSource extends NativeRecoverableIconSource {
  get constructorResource() { return this.options.resource; }
}
const source = new InspectableIconSource(encoded, await decodeIconPixels(encoded));
assert.equal(source.constructorResource, undefined, "constructor options must not retain a second pixel reference");
const expected = Uint8Array.from(source.resource);
let uploaded: Uint8Array | undefined;
const gpu = { device: { queue: { writeTexture(_target: unknown, pixels: unknown): undefined { uploaded = Uint8Array.from(pixels as Uint8Array); return undefined; } } } };
const texture = {} as GPUTexture;
nativeIconUploader.upload(source, texture, gpu);
assert.deepEqual(uploaded, expected); assert.equal(source.retainedPixelBytes, 0);
assert.equal(source.retainedEncodedBytes, encoded.byteLength);
assert.throws(() => nativeIconUploader.upload(source, texture, gpu), /prepared/);
const stage = new Container(); stage.addChild(new Sprite(new Texture({ source })));
await prepareNativeIconTextures(stage, { uid: 7 });
assert.deepEqual(source.resource, expected);
assert.equal(prepareNativeIconTextures(stage, { uid: 7 }), undefined);
assert.throws(() => nativeIconUploader.upload(source, texture, { device: { queue: { writeTexture() { throw Error("upload failed"); } } } }), /upload failed/);
assert.deepEqual(source.resource, expected, "failed uploads retain pixels");
nativeIconUploader.upload(source, texture, gpu); source.unload();
if (globalThis.gc) globalThis.gc();
await prepareNativeIconTextures(stage, { uid: 8 });
assert.deepEqual(source.resource, expected);
nativeIconUploader.upload(source, texture, gpu);
const restoring = source.restorePixels(); assert.equal(source.restorePixels(), restoring);
source.destroy(); await restoring;
assert.equal(source.retainedPixelBytes, 0); assert.equal(source.retainedEncodedBytes, 0);
stage.destroy({ children: true });
const broken = new NativeRecoverableIconSource(Buffer.from("invalid image"), await decodeIconPixels(encoded));
nativeIconUploader.upload(broken, texture, gpu);
await assert.rejects(broken.restorePixels()); assert.equal(broken.retainedPixelBytes, 0); broken.destroy();
const directory = mkdtempSync(join(tmpdir(), "icon-recovery-"));
try {
  const path = join(directory, "icon.png"); writeFileSync(path, encoded);
  const image = await loadNativeIconTexture(path), recovered = image.source as NativeRecoverableIconSource;
  writeFileSync(path, "overwritten"); nativeIconUploader.upload(recovered, texture, gpu);
  await recovered.restorePixels(); assert.deepEqual(recovered.resource, expected);
  unlinkSync(path); nativeIconUploader.upload(recovered, texture, gpu);
  await recovered.restorePixels(); assert.deepEqual(recovered.resource, expected); image.destroy(true);
  const inline = await loadNativeIconTexture(canvas.toDataURL("image/png"));
  nativeIconUploader.upload(inline.source as NativeRecoverableIconSource, texture, gpu);
  await (inline.source as NativeRecoverableIconSource).restorePixels(); assert.deepEqual(inline.source.resource, expected); inline.destroy(true);
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log("Recoverable icon upload, failure, unload, file snapshot and disposal tests passed");
