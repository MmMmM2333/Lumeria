import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { Sprite, type Container, type Renderer, type RenderTexture } from "pixi.js";
import { NativeBackground, type NativeBackgroundConfig } from "../rendering/native/NativeBackground.js";
import { NativeRecoverableIconSource } from "../rendering/native/nativeRecoverableIconSource.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";

installNativeCanvasTestAdapter();

const canvas = createCanvas(8, 8); canvas.getContext("2d").fillRect(0, 0, 8, 8);
const config = { ...JSON.parse(readFileSync(new URL("../domain/fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8")).settings,
  backgroundImagePath: canvas.toDataURL("image/png"), backgroundEffect: "none", backgroundImageLayout: "fill" } as NativeBackgroundConfig;
const callbacks = new Set<() => void | Promise<void>>();
let uid = 1, renders = 0;
const renderer = () => ({ uid, render({ container, target }: { container: Container; target: RenderTexture }) {
  renders++;
  container.enableRenderGroup();
  for (const child of container.children) {
    const source = (child as Sprite).texture?.source;
    if (child.visible && source instanceof NativeRecoverableIconSource) {
      if (!source._gpuData[uid]) assert.ok(source.retainedPixelBytes > 0, "off-stage image must restore CPU pixels before upload");
      source._gpuData[uid] = { gpuTexture: {}, destroy() {} } as never;
      source.resource = new Uint8Array(0);
    }
  }
  target.source._gpuData[uid] = { gpuTexture: {}, destroy() {} } as never;
  container.renderGroup!.structureDidChange = false;
} }) as unknown as Renderer;
let active = renderer();
const host = { get renderer() { return active; }, state: "running",
  beforeRender(callback: () => void | Promise<void>) { callbacks.add(callback); return () => { callbacks.delete(callback); }; } };
const background = new NativeBackground(host, () => {});
try {
  assert.equal(callbacks.size, 1);
  await background.configure(config, 32, 24); const first = renders;
  await background.configure(config, 32, 24);
  assert.equal(renders, first, "unchanged valid GPU content stays cached");
  assert.equal(background.prepare(), undefined, "stable frames do not create async preparation work");
  uid++; active = renderer();
  const preparation = background.prepare(); assert.ok(preparation);
  assert.equal(background.prepare(), preparation, "pending restore is shared");
  await preparation; assert.equal(renders, first + 1);
  const display = background.getChildByLabel("native-background-image") as Sprite;
  delete display.texture.source._gpuData[uid];
  await background.prepare(); assert.equal(renders, first + 2, "missing GPU output must be regenerated with unchanged renderer/config");
  uid++; active = renderer();
  const stale = background.prepare();
  await background.configure({ ...config, backgroundSource: "systemMaterial" }, 32, 24);
  await stale;
  assert.equal(display.visible, false, "late recovery must not revive the superseded image configuration");
  await assert.rejects(background.configure({ ...config, backgroundImagePath: "C:/nonexistent-lumeria-background-test.png" }, 32, 24));
  assert.equal(background.prepare(), undefined, "IO failure must not leave a stale recovery recipe");
  await background.configure(config, 32, 24);
  uid++; active = renderer();
  const pending = background.prepare(), beforeDestroy = renders;
  background.destroy(); await pending;
  assert.equal(renders, beforeDestroy, "destroy during decode must cancel the later draw");
  assert.equal(callbacks.size, 0, "background disposal detaches frame preparation");
} finally { if (!background.destroyed) background.destroy(); }
console.log("Background recovery caching, off-stage decoding, config races and disposal passed");
