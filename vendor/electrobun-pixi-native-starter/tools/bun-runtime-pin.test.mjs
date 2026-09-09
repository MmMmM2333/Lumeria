import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { verifyBunRuntimePin } from "./bun-runtime-pin.mjs";
test("Bun pin requires explicit migration, verifies both declarations, and rejects drift", () => {
  const root = mkdtempSync(join(tmpdir(), "starter-bun-pin-"));
  try {
    mkdirSync(join(root, "api/shared"), { recursive: true });
    const metadata = join(root, "native-devkit.json"), sdk = join(root, "api/shared/bun-version.ts");
    writeFileSync(metadata, JSON.stringify({ product: { version: "2.0.1" }, toolchains: { bun: { defaultVersion: "1.4.0" } } }));
    writeFileSync(sdk, 'export const BUN_VERSION = "1.4.0";\n');
    assert.throws(() => verifyBunRuntimePin(root, "1.4.2"), /mismatch/);
    verifyBunRuntimePin(root, "1.4.2", { apply: true });
    verifyBunRuntimePin(root, "1.4.2");
    const snapshot = readFileSync(metadata, "utf8");
    verifyBunRuntimePin(root, "1.4.2", { apply: true });
    assert.equal(readFileSync(metadata, "utf8"), snapshot);
    writeFileSync(sdk, 'export const BUN_VERSION = "1.4.1";\n');
    assert.throws(() => verifyBunRuntimePin(root, "1.4.2", { apply: true }), /mismatch/);
    assert.equal(readFileSync(metadata, "utf8"), snapshot);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
