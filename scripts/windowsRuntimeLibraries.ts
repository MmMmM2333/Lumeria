import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Imports verified in Dawn and the native data/frame binaries. Deploy the CRT
// family together so dependent/dynamically loaded CRT components stay matched.
const REQUIRED_VC_RUNTIME_FILES = ["msvcp140.dll", "msvcp140_atomic_wait.dll", "vcruntime140.dll", "vcruntime140_1.dll"] as const;

function visualCppRedistributable(): string {
  if (process.env.LUMERIA_VC_REDIST) return resolve(process.env.LUMERIA_VC_REDIST);
  const programFiles = process.env["ProgramFiles(x86)"];
  const vswhere = programFiles && join(programFiles, "Microsoft Visual Studio/Installer/vswhere.exe");
  if (!vswhere || !existsSync(vswhere)) throw new Error("Visual C++ x64 runtime files are required; install the MSVC build tools or set LUMERIA_VC_REDIST to Microsoft.VC14x.CRT");
  const result = spawnSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath", "-utf8"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error("Unable to locate the MSVC redistributable directory");
  const installation = result.stdout.trim();
  const version = readFileSync(join(installation, "VC/Auxiliary/Build/Microsoft.VCRedistVersion.default.txt"), "utf8").trim();
  if (!/^14\.\d+\.\d+$/.test(version)) throw new Error("Unsupported Visual C++ runtime version");
  const x64 = join(installation, "VC/Redist/MSVC", version, "x64");
  const directories = readdirSync(x64, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^Microsoft\.VC\d+\.CRT$/.test(entry.name));
  if (directories.length !== 1) throw new Error("Expected one x64 Microsoft Visual C++ runtime directory");
  return join(x64, directories[0]!.name);
}

export function stageWindowsRuntimeLibraries(product: string): Readonly<{ version: string; files: readonly string[] }> {
  const source = visualCppRedistributable();
  const files = readdirSync(source, { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".dll")).map(entry => entry.name).sort();
  if (REQUIRED_VC_RUNTIME_FILES.some(name => !files.includes(name))) throw new Error("The Visual C++ runtime directory is incomplete");
  for (const name of files) {
    const bytes = readFileSync(join(source, name));
    const pe = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1;
    if (pe < 0 || pe + 24 > bytes.length || bytes.toString("ascii", 0, 2) !== "MZ"
      || bytes.readUInt32LE(pe) !== 0x00004550 || bytes.readUInt16LE(pe + 4) !== 0x8664) {
      throw new Error(`Visual C++ runtime file is not a valid Windows x64 image: ${name}`);
    }
    copyFileSync(join(source, name), join(product, "runtime/bin", name));
    copyFileSync(join(source, name), join(product, "runtime/Resources/app/bun", name));
  }
  const directoryVersion = basename(dirname(dirname(source)));
  const version = /^14\.\d+\.\d+$/.test(directoryVersion) ? directoryVersion : "custom";
  mkdirSync(join(product, "licenses"), { recursive: true });
  writeFileSync(join(product, "licenses/Microsoft-Visual-C++-Runtime.txt"), [
    "Microsoft Visual C++ Runtime (x64)",
    "Copyright Microsoft Corporation. All rights reserved.",
    `Redistributable version: ${version}`,
    `Runtime components: ${files.join(", ")}`,
    "These unmodified runtime components are supplied with Microsoft Visual Studio's redistributable files.",
    "Redistribution documentation: https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files",
    "",
  ].join("\n"));
  console.log(`App-local Visual C++ runtime staged: ${version}`);
  return { version, files };
}
