import assert from "node:assert/strict";
import { nativeBuildDefines } from "./nativeBuildDefines.js";

assert.deepEqual(nativeBuildDefines("0"), { __LUMERIA_DIAGNOSTICS__: "false" });
assert.deepEqual(nativeBuildDefines("1"), { __LUMERIA_DIAGNOSTICS__: "true" });
for (const value of ["", "true", "false", "yes"]) {
  assert.throws(() => nativeBuildDefines(value), /must be 0 or 1/);
}
const saved = process.env.LUMERIA_NATIVE_DIAGNOSTICS_BUILD;
try {
  delete process.env.LUMERIA_NATIVE_DIAGNOSTICS_BUILD;
  assert.equal(nativeBuildDefines().__LUMERIA_DIAGNOSTICS__, "false");
} finally {
  if (saved === undefined) delete process.env.LUMERIA_NATIVE_DIAGNOSTICS_BUILD;
  else process.env.LUMERIA_NATIVE_DIAGNOSTICS_BUILD = saved;
}
console.log("Native diagnostics build flags passed");
