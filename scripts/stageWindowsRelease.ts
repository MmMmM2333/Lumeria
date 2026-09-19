import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PRODUCT, WINDOWS_RELEASE, assertReleaseVersion } from "../src/platform/product.js";
import { assertNativeDiagnosticsArtifact } from "./nativeDiagnosticsArtifact.js";
import { assertArchiveListing, assertReleaseOutput, releaseFiles } from "./windowsRelease.js";
import { runWindowsBuildTool, windowsBuildTools } from "./windowsBuildTools.js";
import { stageWindowsRuntimeLibraries } from "./windowsRuntimeLibraries.js";

if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Windows staging currently requires Windows x64");
assertReleaseVersion(PRODUCT.version);
const project = process.cwd();
const outputArg = process.argv.find(argument => argument.startsWith("--output="))?.slice(9);
const diagnostics = process.argv.includes("--diagnostics");
if (process.argv.slice(2).some(arg => arg !== "--diagnostics" && !arg.startsWith("--output="))) throw new Error("Usage: stageWindowsRelease [--output=directory] [--diagnostics]");
const output = assertReleaseOutput(project, outputArg ? resolve(outputArg) : join(project, "release/staging/windows-x64/Lumeria"));
const archive = join(project, "build/electrobun-artifacts/stable-win-x64-Lumeria.tar.zst");
const tar = (args: string[]): string => {
  const result = spawnSync("tar.exe", args, { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Unable to read the complete native archive: ${result.stderr}`);
  return result.stdout;
};
assertArchiveListing(tar(["-tf", archive]), tar(["-tvf", archive]));
mkdirSync(dirname(output), { recursive: true });
const temporary = assertReleaseOutput(project, mkdtempSync(join(dirname(output), ".lumeria-stage-")));
const payload = join(temporary, "product");
let previous: string | null = null;
try {
  tar(["-xf", archive, "-C", temporary]);
  const bundle = join(temporary, PRODUCT.name);
  const version = JSON.parse(readFileSync(join(bundle, "Resources/version.json"), "utf8"));
  if (version.identifier !== PRODUCT.identifier || version.version !== PRODUCT.version || version.channel !== PRODUCT.channel) throw new Error("Native archive does not match the current product version and channel");
  assertNativeDiagnosticsArtifact(readFileSync(join(bundle, "Resources/app/bun/index.js"), "utf8"), diagnostics);
  mkdirSync(payload);
  cpSync(bundle, join(payload, "runtime"), { recursive: true, dereference: false });
  const runtime = join(payload, WINDOWS_RELEASE.runtime);
  renameSync(join(payload, "runtime/bin/Lumeria.exe"), runtime);
  // These belong to Electrobun's installer lifecycle, which the product does not ship.
  rmSync(join(payload, "runtime/bin/launcher.exe"));
  rmSync(join(payload, "runtime/Resources/uninstall"), { force: true });
  const build = windowsBuildTools(project);
  copyFileSync(build.launcher(true), join(payload, WINDOWS_RELEASE.launcher));
  build.brand(join(payload, WINDOWS_RELEASE.launcher), PRODUCT.version);
  build.brand(runtime, PRODUCT.version);
  const visualCppRuntime = stageWindowsRuntimeLibraries(payload);
  runWindowsBuildTool(runtime, ["build", join(project, "src/native/nativeControl.ts"), "--target=bun", "--outfile=" + join(payload, WINDOWS_RELEASE.control)]);
  writeFileSync(join(payload, WINDOWS_RELEASE.manifest), JSON.stringify({
    schemaVersion: 1, ...PRODUCT, platform: WINDOWS_RELEASE.platform, arch: WINDOWS_RELEASE.arch,
    diagnostics, format: existsSync(join(payload, "runtime/Resources/app/bun/index.js.jsc")) ? "bytecode" : "esm",
    visualCppRuntime,
  }, null, 2) + "\n");
  for (const path of [WINDOWS_RELEASE.launcher, WINDOWS_RELEASE.runtime, WINDOWS_RELEASE.main, WINDOWS_RELEASE.control,
    WINDOWS_RELEASE.dataHost, "runtime/bin/ElectrobunCore.dll", "runtime/Resources/app/bun/native-frame.dll"]) {
    if (!existsSync(join(payload, path))) throw new Error(`Required product file is missing: ${path}`);
  }
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.txt"]) {
    copyFileSync(join(project, name), join(payload, "licenses", name));
  }
  const files = releaseFiles(payload);
  if (existsSync(output)) {
    previous = assertReleaseOutput(project, output + ".previous-" + process.pid);
    if (existsSync(previous)) throw new Error("Previous staging backup still exists; inspect it before rebuilding");
    renameSync(output, previous);
  }
  try { renameSync(payload, output); }
  catch (error) { if (previous) { renameSync(previous, output); previous = null; } throw error; }
  writeFileSync(output + ".files.json", JSON.stringify({ schemaVersion: 1, identifier: PRODUCT.identifier, version: PRODUCT.version, files }, null, 2) + "\n");
  if (previous) rmSync(assertReleaseOutput(project, previous), { recursive: true, force: true });
  console.log(`Windows product staged: ${output} (${files.length} files, diagnostics ${diagnostics ? "enabled" : "excluded"})`);
} finally {
  rmSync(assertReleaseOutput(project, temporary), { recursive: true, force: true });
}
