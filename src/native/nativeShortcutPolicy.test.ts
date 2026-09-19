import assert from "node:assert/strict";
import { shouldHideForNativeShortcut } from "./nativeShortcutPolicy.js";
import { centerWindowOnWorkArea } from "../../vendor/electrobun-pixi-native-starter/src/platform/native-monitor-geometry.js";

for (const visible of [false,true]) for (const minimized of [false,true])
  for (const foreground of [false,true]) for (const displayChanged of [false,true]) {
    const hide=shouldHideForNativeShortcut({visible,minimized,foreground,displayChanged});
    assert.equal(hide,visible&&!minimized&&foreground&&!displayChanged);
  }
const rect=(...values:number[])=>new Int32Array(values);
assert.deepEqual(centerWindowOnWorkArea(rect(0,0,1280,820),rect(-1920,-1080,0,-48)),rect(-1600,-974,-320,-154));
assert.deepEqual(centerWindowOnWorkArea(rect(0,0,2400,1800),rect(1920,40,3200,1000)),rect(1920,40,3200,1000));
assert.deepEqual(centerWindowOnWorkArea(rect(0,0,900,620),rect(40,0,1920,1080)),rect(530,230,1430,850));
console.log("Native shortcut foreground policy and physical monitor geometry passed");
