import assert from "node:assert/strict";
import { runWithNativeResources } from "./nativeRuntimeLifecycle.js";

const calls: string[] = [];
const failure = new Error("startup failed");
const data = () => ({ dispose: () => { calls.push("data"); } });
await assert.rejects(runWithNativeResources(data, async () => { throw failure; }, async () => {}), error => error === failure);
assert.deepEqual(calls.splice(0), ["data"], "a window creation failure still closes the sidecar");
const app = async () => ({ dispose: () => { calls.push("app"); } });
await assert.rejects(runWithNativeResources(data, app, async () => { throw failure; }), error => error === failure);
assert.deepEqual(calls.splice(0), ["app", "data"], "assembly failure releases the app before its data channel");
await runWithNativeResources(data, app, async () => { calls.push("body"); });
assert.deepEqual(calls.splice(0), ["body", "app", "data"]);
const cleanup = new Error("GPU disposal failed");
await assert.rejects(runWithNativeResources(data, async () => ({ dispose() { throw cleanup; } }), async () => { throw failure; }), error => {
  assert.ok(error instanceof AggregateError);
  assert.deepEqual(error.errors, [failure, cleanup]);
  return true;
});
assert.deepEqual(calls, ["data"], "GPU cleanup failure cannot leave the data process behind");
console.log("Native outer lifecycle startup/assembly/cleanup failure tests passed");
