import assert from "node:assert/strict";
import { CanvasTextPipe, Text, Texture } from "pixi.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";

installNativeCanvasTestAdapter();
const text = new Text({ text: "恢复后的搜索" });
let acquired = 0;
const makePipe = (uid: number) => new CanvasTextPipe({
  uid, resolution: 1, _roundPixels: 0,
  runners: { resolutionChange: { add() {} } },
  gc: { addResourceHash() {}, now: 0 },
  canvasText: {
    getManagedTexture() { acquired++; return Texture.WHITE; },
    getReferenceCount() { return 1; }, decreaseReferenceCount() {},
  },
  renderPipes: { batch: { addToBatch(item: { texture?: Texture }) {
    assert.ok(item.texture?.source, "a retained Text must acquire a texture on the new renderer before batching");
  } } },
} as never);

for (let generation = 1; generation <= 6; generation++) {
  const pipe = makePipe(generation);
  pipe.addRenderable(text, {} as never);
  assert.equal(acquired, generation);
  text.didViewUpdate = false;
  // Off-stage objects are retired by the old text pipe, outside stage.unload().
  pipe.destroy();
}
text.destroy();
console.log("Retained text acquires a texture across six renderer replacements");
