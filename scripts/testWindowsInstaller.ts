import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PRODUCT } from "../src/platform/product.js";
import { packageWindowsRelease } from "./packageWindowsRelease.js";
import { releaseFiles } from "./windowsRelease.js";

if (process.platform !== "win32") throw new Error("Installer integration tests require Windows");
mkdirSync(".codex-dev", { recursive: true });
const root = mkdtempSync(join(process.cwd(), ".codex-dev/windows-installer-test-"));
const installed = join(root, "中文 安装", "Lumeria");
const data = join(root, "Roaming", PRODUCT.identifier);
const outside = join(root, "unrelated.txt");
const proof: string[] = [];
const state = (action: "Snapshot" | "Assert" | "Restore", version?: string) => {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", join(process.cwd(), "scripts/windowsInstallerTestState.ps1"),
    "-Action", action, "-TestRoot", root, ...(version ? ["-InstallDirectory", installed, "-Version", version] : [])], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Installer test state ${action} failed: ${result.error ?? result.stderr}`);
  console.log(result.stdout.trim());
};
const execute = (file: string, args: string[], expected = 0) => {
  const result = spawnSync(file, args, { env: { ...process.env, LUMERIA_NATIVE_DATA_DIR: data }, windowsHide: true, windowsVerbatimArguments: true, timeout: 60_000, encoding: "utf8" });
  if (result.error) throw result.error;
  const log = join(root, `nsis-${file.endsWith("uninstall.exe") ? "uninstall" : "setup"}-${result.pid}.log`);
  const details = existsSync(log) ? readFileSync(log).toString("utf16le") : result.stderr;
  if (expected === 0) assert.equal(result.status, 0, `Installer failed: ${file}\n${details}`);
  else assert.notEqual(result.status, 0, "The installer must report a failure");
};
const record = (name: string) => { proof.push(name); console.log(`PASS: ${name}`); };
let snapshot = false;
try {
  state("Snapshot"); snapshot = true;
  const source = join(root, "fixture.rs"), launcher = join(root, "fixture.exe");
  writeFileSync(source, '#![windows_subsystem="windows"]\nfn main() { std::process::exit(0); }\n');
  const compile = spawnSync("rustc", ["--edition=2021", source, "-C", "opt-level=1", "-o", launcher], { encoding: "utf8", windowsHide: true });
  if (compile.error || compile.status !== 0) throw new Error(`Fixture build failed: ${compile.error ?? compile.stderr}`);
  const fixture = (version: string, files: Record<string, string>, failCommit = false) => {
    const staging = join(root, "stage-" + version);
    mkdirSync(join(staging, "runtime"), { recursive: true });
    copyFileSync(launcher, join(staging, "Lumeria.exe"));
    writeFileSync(join(staging, "lumeria.json"), JSON.stringify({ schemaVersion: 1, ...PRODUCT, version, platform: "win32", arch: "x64", diagnostics: false, fixture: true }));
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(staging, "runtime", name), contents);
    writeFileSync(staging + ".files.json", JSON.stringify({ identifier: PRODUCT.identifier, version, files: releaseFiles(staging) }));
    return packageWindowsRelease(staging, { output: join(root, `Setup-${version}.exe`), dataDirectory: data, failCommit });
  };
  const first = fixture("0.1.0", { "common.dll": "version one", "removed.dll": "old file" });
  const second = fixture("0.1.1", { "common.dll": "version two", "added.dll": "new file" });
  const broken = fixture("0.1.2", { "common.dll": "must roll back" }, true);
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "layout.json"), "saved user layout");
  writeFileSync(outside, "unrelated data");
  const installArgs = ["/S", `/D=${installed}`];
  execute(first, installArgs);
  assert.equal(readFileSync(join(installed, "runtime/common.dll"), "utf8"), "version one");
  state("Assert", "0.1.0"); record("Fresh per-user install, Chinese/space path, registry and stable shortcuts");
  execute(first, installArgs);
  assert.equal(readFileSync(join(data, "layout.json"), "utf8"), "saved user layout");
  record("Same-version reinstall preserves application data");
  writeFileSync(join(installed, "user-note.txt"), "keep this unowned file");
  execute(second, installArgs);
  assert.equal(readFileSync(join(installed, "runtime/common.dll"), "utf8"), "version two");
  assert.ok(!existsSync(join(installed, "runtime/removed.dll")));
  assert.ok(existsSync(join(installed, "runtime/added.dll")));
  const parent = join(root, "中文 安装");
  assert.ok(readdirSync(parent).some(name => name.startsWith("Lumeria.lumeria-old-") && existsSync(join(parent, name, "user-note.txt"))), "unowned files must be preserved in the previous directory");
  state("Assert", "0.1.1"); record("Upgrade removes old owned DLLs and preserves unowned files");
  execute(broken, installArgs, 1);
  assert.equal(readFileSync(join(installed, "runtime/common.dll"), "utf8"), "version two");
  state("Assert", "0.1.1"); record("Failure after directory replacement restores the previous version and registration");
  execute(first, installArgs, 1);
  state("Assert", "0.1.1"); record("Downgrade is rejected");
  const uninstall = (purge: boolean) => {
    execute(join(installed, "uninstall.exe"), ["/S", ...(purge ? ["/PURGEDATA"] : []), `_?=${installed}`]);
    assert.ok(!existsSync(join(installed, "Lumeria.exe")));
    assert.ok(!existsSync(join(installed, "install.ini")));
    // _?= keeps NSIS in the original process so its exit code can be asserted.
    // The test then removes that executable after it has exited.
    rmSync(join(installed, "uninstall.exe"), { force: true });
    rmdirSync(installed);
  };
  uninstall(false);
  assert.equal(readFileSync(join(data, "layout.json"), "utf8"), "saved user layout");
  record("Silent uninstall preserves data by default");
  execute(second, installArgs);
  uninstall(true);
  assert.ok(!existsSync(data));
  assert.equal(readFileSync(outside, "utf8"), "unrelated data");
  record("Explicit purge removes only the isolated product data");
  writeFileSync(join(root, "proof.json"), JSON.stringify({ checks: proof, root, completed: true }, null, 2));
} finally {
  if (snapshot) state("Restore");
  console.log(`Installer evidence: ${root}`);
}
