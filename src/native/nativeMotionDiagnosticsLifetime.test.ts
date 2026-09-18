import assert from "node:assert/strict";
import { createMotionRuntimeDebugAdapter } from "../rendering/motionPort.js";

assert.ok(globalThis.gc, "Run with node --expose-gc --import tsx");
const adapter = createMotionRuntimeDebugAdapter(); adapter.configureDebug({ enabled: true });
const persistent = { x: 1 };
adapter.observe({ type: "targetMetadata", targetId: 1, target: persistent, metadata: { label: "live" } });
assert.equal(adapter.resolveTarget(1, { bounds: false }), persistent);
function describeTemporary() {
  const target = { x: 2 }, bounds = { x: 3 };
  adapter.observe({ type: "targetMetadata", targetId: 2, target, metadata: { label: "temporary", boundsTarget: bounds } });
  assert.equal(adapter.resolveTarget(2), bounds);
  return [new WeakRef(target), new WeakRef(bounds)];
}
const temporary = describeTemporary();
for (let i = 0; i < 8; i++) { await new Promise(resolve => setTimeout(resolve, 0)); globalThis.gc!(); }
assert.equal(temporary[0]!.deref(), undefined, "debug lookup must not retain an otherwise unreachable animation target");
assert.equal(temporary[1]!.deref(), undefined, "debug overlay must not retain its bounds target");
assert.equal(adapter.resolveTarget(2), null);
const targets = adapter.makeSnapshot({ includeTargets: true }).targets!;
assert.ok(!targets.some(value => value.targetId === 2), "collected target metadata is pruned");
assert.equal(adapter.resolveTarget(1), persistent, "live targets remain inspectable");
adapter.reset(); assert.equal(adapter.resolveTarget(1), null);
console.log("Motion diagnostics do not keep completed targets or bounds alive");
