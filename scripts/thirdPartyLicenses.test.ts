import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundledNpmPaths, checkLicenseAudit, licenseSection, nativeFileCovered, runtimeCargoPackages } from "./thirdPartyLicenses.js";
import { assertReleaseOutput } from "./windowsRelease.js";

const prefix = Buffer.from("标题\n"), original = Buffer.from("Copyright\r\nPermission granted.\n");
const combined = Buffer.concat([prefix, original, Buffer.from("\nnext section")]);
const section = { id: "fixture", offset: prefix.length, length: original.length, sha256: createHash("sha256").update(original).digest("hex") };
assert.deepEqual(licenseSection(combined, section), original, "byte offsets preserve UTF-8 and original line endings");
for (const invalid of [{ offset: -1 }, { offset: 0.5 }, { length: 0 }, { length: combined.length + 1 }, { sha256: "0".repeat(64) }]) {
  assert.throws(() => licenseSection(combined, { ...section, ...invalid }));
}

const modules = bundledNpmPaths(`// node_modules/pixi.js/lib/index.mjs
// node_modules/@pixi/colord/index.mjs
// node_modules/example/node_modules/nested/index.js
// node_modules/@parent/library/node_modules/@child/library/index.js
const dependencies = { gsap: "3.15.0", typescript: "5.9.3" };
// src/local.ts
`);
assert.deepEqual([...modules], ["node_modules/pixi.js", "node_modules/@pixi/colord", "node_modules/example/node_modules/nested", "node_modules/@parent/library/node_modules/@child/library"]);
assert.equal(modules.has("node_modules/gsap"), false, "embedded package metadata must not be mistaken for bundled code");
const dep = (pkg: string, kind: string | null) => ({ pkg, dep_kinds: [{ kind }] });
const runtime = runtimeCargoPackages("app", [
  { id: "app", deps: [dep("core", null), dep("builder", "build"), dep("test-only", "dev"), dep("derive", null)] },
  { id: "core", deps: [dep("shared", null)] },
  { id: "builder", deps: [dep("build-only", null), dep("shared", null)] },
  { id: "derive", deps: [dep("macro-only", null)] },
  { id: "shared", deps: [dep("core", null)] },
], new Set(["derive"]));
assert.deepEqual([...runtime].sort(), ["app", "core", "shared"], "normal shared dependencies survive; build/dev/macro-only branches do not");
const component = { id: "test", version: "1", source: "test", texts: [], pending: [], files: ["runtime/bin/a.dll", "runtime/skia-*"] };
assert.ok(nativeFileCovered("runtime/bin/a.dll", [component]));
assert.ok(nativeFileCovered("runtime/skia-hash.node", [component]));
assert.equal(nativeFileCovered("runtime/bin/unknown.dll", [component]), false);

mkdirSync(".codex-dev", { recursive: true });
const root = mkdtempSync(join(process.cwd(), ".codex-dev/license-review-test-"));
try {
  const text = "original license", sha256 = createHash("sha256").update(text).digest("hex");
  writeFileSync(join(root, "LICENSE"), text);
  const report = { schemaVersion: 1, status: "review-required", issues: [{ component: "native", detail: "Check upstream materials" }], textFiles: [{ path: "LICENSE", sha256 }] };
  const save = () => writeFileSync(join(root, "inventory.json"), JSON.stringify(report));
  save();
  assert.equal(checkLicenseAudit(root).length, 1, "unresolved review items are advisory, not a packaging failure");
  writeFileSync(join(root, "LICENSE"), "tampered");
  assert.throws(() => checkLicenseAudit(root), /changed/);
  report.textFiles[0]!.path = "../outside"; save();
  assert.throws(() => checkLicenseAudit(root), /Invalid license/);
} finally { rmSync(assertReleaseOutput(process.cwd(), root), { recursive: true }); }
console.log("Runtime notice selection and advisory audit tests passed");
