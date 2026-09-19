import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PRODUCT } from "../src/platform/product.js";
import { assertReleaseOutput } from "./windowsRelease.js";
import { windowsBuildTools } from "./windowsBuildTools.js";

if (process.platform !== "win32") throw new Error("Launcher tests require Windows");
mkdirSync(".codex-dev", { recursive: true });
const root = mkdtempSync(join(process.cwd(), ".codex-dev/product-launcher-test-"));
const product = join(root, "中文 产品");
const bin = join(product, "runtime/bin");
const data = join(root, "isolated-data");
mkdirSync(bin, { recursive: true });
const launcher = join(product, "Lumeria.exe");
const manifest = { schemaVersion: 1, ...PRODUCT, platform: "win32", arch: "x64" };
try {
  copyFileSync(windowsBuildTools().launcher(true), launcher);
  writeFileSync(join(product, "lumeria.json"), JSON.stringify(manifest));
  const fixture = join(root, "runtime_fixture.rs");
  writeFileSync(fixture, `fn main() {
    println!("cwd={}", std::env::current_dir().unwrap().display());
    println!("root={}", std::env::var("LUMERIA_PRODUCT_ROOT").unwrap());
    println!("origin={}", std::env::var("LUMERIA_LAUNCH_ORIGIN").unwrap());
    for arg in std::env::args().skip(1) { println!("arg={arg}"); }
    std::process::exit(std::env::var("LUMERIA_FIXTURE_EXIT_CODE").unwrap_or("0".into()).parse().unwrap());
  }`);
  const compile = spawnSync("rustc", ["--edition=2021", fixture, "-o", join(bin, "LumeriaRuntime.exe")], { encoding: "utf8", windowsHide: true });
  if (compile.error || compile.status !== 0) throw new Error(`Runtime fixture build failed: ${compile.error ?? compile.stderr}`);
  const run = (args: string[], code = 0) => {
    const result = spawnSync(launcher, args, { env: { ...process.env, LUMERIA_NATIVE_DATA_DIR: data, LUMERIA_FIXTURE_EXIT_CODE: String(code) }, windowsHide: true, encoding: "utf8", timeout: 10_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, code, result.stderr);
    return result.stdout;
  };
  const output = run([]);
  assert.ok(output.includes(`cwd=${join(data, "logs")}`));
  assert.ok(output.includes(`root=${product}`));
  assert.ok(output.includes(`arg=${join(product, "runtime/Resources/main.js")}`));
  assert.ok(output.includes("origin=manual"));
  const login = run(["--lumeria-autostart"]);
  assert.ok(login.includes("origin=login"));
  assert.ok(login.includes("arg=--lumeria-autostart"));
  const control = run(["--lumeria-status"]);
  assert.ok(control.includes(`cwd=${bin}`));
  assert.ok(control.includes(`arg=${join(product, "runtime/control.js")}`));
  run([], 321);
  writeFileSync(join(product, "lumeria.json"), JSON.stringify({ ...manifest, identifier: "other" }));
  run(["--lumeria-status"], 1);
  assert.ok(existsSync(join(data, "logs")));
  console.log("Product launcher: Unicode paths, working directories, startup arguments, manifest rejection and full Windows exit codes passed");
} finally { rmSync(assertReleaseOutput(process.cwd(), root), { recursive: true, force: true }); }
