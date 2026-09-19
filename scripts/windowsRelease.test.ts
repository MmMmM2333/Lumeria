import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertArchiveListing, assertReleaseFiles, assertReleaseOutput, nsisString, releaseFiles } from "./windowsRelease.js";

assertArchiveListing("Lumeria/\nLumeria/bin/runtime.exe\n", "drwxr-xr-x\n-rw-r--r--\n");
for (const path of ["Lumeria/../outside", "Lumeria/C:/outside", "Lumeria/..\\outside", "/Lumeria/absolute", "Other/file"]) {
  assert.throws(() => assertArchiveListing(path, "-rw-r--r--"), /Unsafe/);
}
assert.throws(() => assertArchiveListing("Lumeria/link", "lrwxrwxrwx"), /regular files/);
assert.throws(() => assertReleaseOutput(process.cwd(), "src"), /staging/);
assert.throws(() => assertReleaseOutput(process.cwd(), ".."), /staging/);
assert.equal(nsisString('price$ with "quotes"'), 'price$$ with $\\"quotes$\\"');
assert.throws(() => nsisString("bad\nvalue"));
mkdirSync(".codex-dev", { recursive: true });
const root = mkdtempSync(join(process.cwd(), ".codex-dev/release-files-test-"));
try {
  writeFileSync(join(root, "test.exe"), "first");
  const files = releaseFiles(root);
  assertReleaseFiles(root, files);
  writeFileSync(join(root, "test.exe"), "changed");
  assert.throws(() => assertReleaseFiles(root, files), /changed/);
} finally { rmSync(assertReleaseOutput(process.cwd(), root), { recursive: true }); }
console.log("Windows release boundaries and integrity passed");
