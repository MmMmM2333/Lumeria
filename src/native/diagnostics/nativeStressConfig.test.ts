import assert from "node:assert/strict";
import { assertStressInventory, createStressRandom, parseNativeStressOptions } from "./nativeStressConfig.js";

for (const args of [["--stress-icons=0"], ["--stress-mode=unknown"], ["--stress-seed=NaN"],
  ["--stress-cycles=2", "--stress-cycles=3"], ["--stress-idle-every=-1"], ["--stress-exit-on-failure=false"], ["--stress-typo=1"]]) {
  assert.throws(() => parseNativeStressOptions(args));
}
const config = parseNativeStressOptions(["--stress", "--stress-mode=mixed", "--stress-icons=2000", "--stress-exit-on-failure"]);
assert.equal(config.icons, 2000); assert.equal(config.mode, "mixed"); assert.equal(config.exitOnFailure, true);
assert.equal(config.rewarmCheckpoints, false);
assert.equal(parseNativeStressOptions(["--stress-rewarm-checkpoints"]).rewarmCheckpoints, true);
assert.equal(config.gcEvery, 0);
assert.throws(() => parseNativeStressOptions(["--stress-heap-snapshots"]), /require/);
assert.equal(parseNativeStressOptions(["--stress-gc-every=5", "--stress-heap-snapshots"]).heapSnapshots, true);
const a = createStressRandom(19), b = createStressRandom(19), c = createStressRandom(20);
const sequence = Array.from({ length: 100 }, a);
assert.deepEqual(sequence, Array.from({ length: 100 }, b));
assert.notDeepEqual(sequence, Array.from({ length: 100 }, c));
assert.ok(sequence.every(value => value >= 0 && value < 1));
const expected = new Set(["a", "b"]);
assertStressInventory([[{ id: "folder", type: "folder", childPages: [[{ id: "a" }, null], [{ id: "b" }]] }]], expected);
assertStressInventory([[{ id: "a", type: "app" }, { id: "b", type: "app" }]], expected);
assert.throws(() => assertStressInventory([[{ id: "a", type: "app" }, { id: "a", type: "app" }]], expected), /Duplicate/);
assert.throws(() => assertStressInventory([[{ id: "a", type: "app" }]], expected), /lost or added/);
assert.throws(() => assertStressInventory([[{ id: "a", type: "app" }, { id: "c", type: "app" }]], expected), /lost or added/);
console.log("Stress options, seeded sequence and inventory checks passed");
