import assert from "node:assert/strict";
import type { Container } from "pixi.js";
import { inspectStressGeometry } from "./nativeStressGeometry.js";

// Packed color can be a NaN float bit pattern; only x/y/u/v are floats.
const attributes = new Float32Array([0, 0, 0, 0, NaN, 0, 10, 0, 1, 0, NaN, 0, 0, 10, 0, 1, NaN, 0]);
const batcher = { uid: 1, name: "default", attributeBuffer: { float32View: attributes }, attributeSize: 18,
  indexBuffer: new Uint16Array([0, 1, 2]), indexSize: 3 };
const batch = { renderPipeId: "batch", batcher, start: 0, size: 3 };
const stage = { renderGroup: { instructionSet: { instructionSize: 1, instructions: [batch] }, renderGroupChildren: [] } } as unknown as Container;
assert.equal(inspectStressGeometry(stage).stats.vertices, 3);
attributes[0] = Infinity;
assert.throws(() => inspectStressGeometry(stage), /Non-finite/);
attributes[0] = 0; batcher.indexBuffer[2] = 3;
assert.throws(() => inspectStressGeometry(stage), /Index outside/);
batcher.indexBuffer[2] = 2; batch.size = 4;
assert.throws(() => inspectStressGeometry(stage), /draw range/);
batch.size = 3; batcher.attributeSize = 24;
assert.throws(() => inspectStressGeometry(stage), /size exceeds/);
console.log("Stress submitted batch checks detect malformed floats, indices and draw ranges");
