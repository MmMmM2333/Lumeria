import assert from "node:assert/strict";
import { Container, Sprite, Texture, type WebGPURenderer } from "pixi.js";
import { createResidentIconRepository } from "../rendering/native/nativeIconResidency.js";
import { NativeRecoverableIconSource } from "../rendering/native/nativeRecoverableIconSource.js";

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const item = (id: string) => ({ id, iconPath: `C:/icons/${id}.png` });
function harness(budget = 1024) {
  const stage = new Container(), callbacks = new Set<() => void | Promise<void>>();
  const requests: { key: string; resolve(texture: Texture): void; reject(error: Error): void }[] = [];
  const uploads: number[] = [];
  let uid = 7;
  const renderer = { get uid() { return uid; }, texture: { getGpuSource(source: NativeRecoverableIconSource) {
    if (!source._gpuData[uid]) {
      assert.ok(source.retainedPixelBytes > 0, "no empty upload");
      uploads.push(source.uid);
      source._gpuData[uid] = { gpuTexture: {}, destroy() {} } as never;
      source.resource = new Uint8Array(0);
    }
    return source._gpuData[uid];
  } } } as unknown as WebGPURenderer;
  const host = { stage, renderer, state: "running", invalidate() {}, beforeRender(callback: () => void | Promise<void>) { callbacks.add(callback); return () => { callbacks.delete(callback); }; } };
  const repository = createResidentIconRepository(host, key => new Promise((resolve, reject) => requests.push({ key, resolve, reject })), budget);
  const complete = (index: number) => {
    const source = new NativeRecoverableIconSource(Buffer.from("snapshot"), { width: 4, height: 4, pixels: new Uint8Array(64).fill(255) });
    const texture = new Texture({ source }); requests[index]!.resolve(texture); return texture;
  };
  return { stage, repository, requests, complete, uploads, callbacks, host, recover() { uid++; } };
}

{
  const h = harness();
  h.repository.retainLayout([item("temporary")]);
  h.repository.retainLayout([item("replaced")]);
  h.repository.retainLayout([]);
  assert.equal(h.repository.snapshot().activeCount, 0, "rapid ownership changes are synchronous and ordered");
  assert.equal(h.requests.length, 0, "ownership changes do not start obsolete loads");
  await h.repository.synchronize([item("a"), item("b")]);
  assert.equal(h.requests.length, 0, "layout ownership must not decode everything");
  let ready = 0;
  assert.equal(h.repository.resolve(item("a"), () => ready++), null);
  const waiting = h.repository.prepareFrame(); assert.ok(waiting instanceof Promise);
  const texture = h.complete(0); await waiting;
  assert.equal(ready, 1); assert.equal((texture.source as NativeRecoverableIconSource).retainedPixelBytes, 0);
  assert.equal(h.requests.length, 1, "unseen b remains cold");
  assert.equal(h.repository.resolve(item("a")), texture);
  h.repository.dispose(); assert.equal(h.callbacks.size, 0); assert.equal(texture.destroyed, true);
}
{
  const h = harness(80); // One 4x4 mipmapped texture slightly exceeds this soft budget.
  await h.repository.synchronize([item("a"), item("b")]);
  h.repository.resolve(item("a")); const a = h.complete(0); await sleep();
  const sprite = new Sprite(a); h.stage.addChild(sprite); h.repository.prepareFrame();
  assert.equal(h.repository.residency().resident, 1, "visible texture can exceed soft budget");
  h.repository.startBackground(); await sleep(35);
  assert.equal(h.requests.length, 1, "background must stop at resident budget");
  h.repository.resolve(item("b")); const b = h.complete(1); await sleep();
  sprite.texture = b; h.repository.prepareFrame();
  assert.equal(Boolean(a.source._gpuData[7]), false, "cold texture should unload when foreground exceeds budget");
  assert.equal(Boolean(b.source._gpuData[7]), true);
  h.repository.dispose(); h.stage.destroy({ children: true });
}
{
  const h = harness();
  await h.repository.synchronize([item("a"), item("b"), item("c")]); h.repository.startBackground(); await sleep(25);
  assert.equal(h.requests.length, 1, "background starts only one bounded decode before yielding");
  assert.equal(h.repository.prepareFrame(), undefined, "background decode alone must not defer a ready frame");
  h.repository.resolve(item("c"));
  assert.ok(h.repository.prepareFrame() instanceof Promise, "resolve registers demand before the frame gate");
  assert.equal(h.requests[1]!.key, item("c").iconPath, "foreground request must not wait behind unloaded background items");
  h.complete(0); h.complete(1); await sleep(5);
  h.repository.dispose(); const count = h.requests.length; await sleep(30); assert.equal(h.requests.length, count);
}
{
  const h = harness(); await h.repository.synchronize([item("a")]); h.repository.resolve(item("a"));
  await h.repository.synchronize([]); const texture = h.complete(0); await sleep();
  assert.equal(texture.destroyed, true, "removed layout item cannot be resurrected by decode completion");
  assert.equal(h.repository.snapshot().cached.length, 0); h.repository.dispose();
}
{
  const h = harness(); await h.repository.synchronize([item("a")]); h.repository.resolve(item("a"));
  h.repository.dispose(); const texture = h.complete(0); await sleep();
  assert.equal(texture.destroyed, true); assert.equal(h.uploads.length, 0, "closed repository must not upload late pixels");
}
{
  const h = harness(120);
  await h.repository.synchronize([item("a"), item("b"), item("c"), item("d")]); h.repository.startBackground();
  await sleep(25); h.complete(0); await sleep(25);
  assert.equal(h.requests.length, 2); h.complete(1); await sleep(45);
  assert.equal(h.requests.length, 2, "budget exhaustion stops speculation instead of churning through cold items");
  assert.ok(h.repository.residency().gpuBytes <= 120); h.repository.dispose();
}
{
  const h = harness(); const a = item("a");
  await h.repository.synchronize([a]); h.repository.resolve(a); const previous = h.complete(0); await sleep();
  const replacement = { ...a, iconPath: item("b").iconPath };
  await h.repository.synchronize([replacement]);
  assert.equal(h.repository.resolve(replacement), previous, "old image remains until replacement is ready");
  const pending = h.repository.prepareFrame(); const next = h.complete(1); await pending;
  assert.equal(h.repository.resolve(replacement), next); await sleep();
  assert.equal(previous.destroyed, true); h.repository.dispose();
}
console.log("Native icon residency ownership, readiness, priority, budget and cancellation tests passed");
{
  const h=harness();await h.repository.synchronize([item("held")]);h.repository.resolve(item("held"));const texture=h.complete(0);await sleep();
  const sprite=new Sprite(texture);h.stage.addChild(sprite);
  await h.repository.synchronize([]);await sleep();
  assert.equal(texture.destroyed,false,"scene reference must outlive removal from layout ownership");
  sprite.destroy();h.repository.prepareFrame();await sleep();
  assert.equal(texture.destroyed,true,"release removed texture after last scene reference disappears");h.repository.dispose();
}
