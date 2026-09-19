import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNativeBytecode } from "./bytecode-postbuild.mjs";
test("bytecode hook is opt-in and rejects unsupported/missing build environments", () => {
  const names = ["NATIVE_PIXI_BYTECODE", "ELECTROBUN_OS", "ELECTROBUN_ARCH", "ELECTROBUN_BUILD_DIR"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    delete process.env.NATIVE_PIXI_BYTECODE;
    buildNativeBytecode({ entrypoint: "missing", tsconfig: "missing" });
    process.env.NATIVE_PIXI_BYTECODE = "yes";
    assert.throws(() => buildNativeBytecode({}), /must be 0 or 1/);
    process.env.NATIVE_PIXI_BYTECODE = "1";
    assert.throws(() => buildNativeBytecode({ define: { FEATURE: false } }), /record of string replacements/);
    assert.throws(() => buildNativeBytecode({ define: [] }), /record of string replacements/);
    process.env.NATIVE_PIXI_BYTECODE = "1"; process.env.ELECTROBUN_OS = "linux";
    assert.throws(() => buildNativeBytecode({}), /Windows x64/);
    process.env.ELECTROBUN_OS = "win"; process.env.ELECTROBUN_ARCH = "x64";
    delete process.env.ELECTROBUN_BUILD_DIR;
    assert.throws(() => buildNativeBytecode({}), /postBuild environment/);
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
});
