import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { removeTemporary } from "./native-toolchain.mjs";

const starter = join(dirname(fileURLToPath(import.meta.url)), "..");
test("native tray recovery handles shell and timer failures", { skip: process.platform !== "win32", timeout: 60_000 }, () => {
  const patch = readFileSync(join(starter, "patches/electrobun-2.0.1-dcomp-atomic-resize.patch"), "utf8");
  const path = "package/src/native/win/native_tray.h";
  const section = patch.split("diff --git a/" + path + " b/" + path + "\n")[1]?.split("\ndiff --git ")[0];
  assert.ok(section?.includes("new file mode"), "The recovery header must be included in the reconstructible patch");
  const header = section.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).map(line => line.slice(1)).join("\n");
  const root = mkdtempSync(join(tmpdir(), "lumeria-tray-test-"));
  try {
    writeFileSync(join(root, "native_tray.h"), header);
    writeFileSync(join(root, "test.cpp"), readFileSync(join(starter, "tests/native-tray-recovery.cpp")));
    const vswhere = join(process.env["ProgramFiles(x86)"], "Microsoft Visual Studio/Installer/vswhere.exe");
    const installation = execFileSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { encoding: "utf8", windowsHide: true }).trim();
    assert.ok(installation, "MSVC C++ Build Tools are required");
    const batch = join(root, "compile.cmd");
    writeFileSync(batch, '@echo off\r\ncall "' + join(installation, "Common7/Tools/VsDevCmd.bat") + '" -arch=amd64 -host_arch=amd64 >nul\r\nif errorlevel 1 exit /b 1\r\ncl /nologo /EHsc /std:c++20 /MT /W4 /Fe:test.exe /Fo:test.obj test.cpp\r\n');
    const compiled = spawnSync("cmd.exe", ["/d", "/c", batch], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 45_000 });
    assert.equal(compiled.status, 0, String(compiled.error ?? "") + compiled.stdout + compiled.stderr);
    const executed = spawnSync(join(root, "test.exe"), [], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000 });
    assert.equal(executed.status, 0, String(executed.error ?? "") + executed.stdout + executed.stderr);
    console.log(executed.stdout.trim());
  } finally { removeTemporary(root, tmpdir()); }
});
