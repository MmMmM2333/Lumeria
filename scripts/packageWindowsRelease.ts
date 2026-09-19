import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT, assertReleaseVersion } from "../src/platform/product.js";
import { readProductManifest } from "../src/native/runtimePaths.js";
import { assertReleaseFiles, assertReleaseOutput, nsisString, type ReleaseFile } from "./windowsRelease.js";
import { findNsis, runWindowsBuildTool, windowsBuildTools } from "./windowsBuildTools.js";

type InstallerTestOptions = Readonly<{ output: string; failCommit?: boolean; dataDirectory?: string }>;

/** Test variants compile the same installer and may only write under .codex-dev. */
export function packageWindowsRelease(staging: string, test?: InstallerTestOptions): string {
  const project = realpathSync(process.cwd());
  staging = assertReleaseOutput(project, staging);
  const manifest = readProductManifest(staging);
  assertReleaseVersion(manifest.version);
  if (!test && manifest.version !== PRODUCT.version) throw new Error("Staging does not match package.json");
  const metadata: unknown = JSON.parse(readFileSync(join(staging, "lumeria.json"), "utf8"));
  if (!metadata || typeof metadata !== "object" || !("diagnostics" in metadata) || metadata.diagnostics !== false) throw new Error("An installer must use a production build with diagnostics excluded");
  if (!test && "fixture" in metadata) throw new Error("An installer test fixture cannot be published as a product release");
  const index = JSON.parse(readFileSync(staging + ".files.json", "utf8")) as { identifier: string; version: string; files: ReleaseFile[] };
  if (index.identifier !== PRODUCT.identifier || index.version !== manifest.version || !Array.isArray(index.files)) throw new Error("Invalid release file index");
  assertReleaseFiles(staging, index.files);
  const output = test ? assertReleaseOutput(project, test.output) : join(project, "artifacts", `Lumeria-${manifest.version}-x64-Setup.exe`);
  if (test && !output.startsWith(join(project, ".codex-dev") + "\\")) throw new Error("Installer test output must stay in .codex-dev");
  if (test?.dataDirectory) assertReleaseOutput(project, test.dataDirectory);
  mkdirSync(join(project, ".codex-dev"), { recursive: true });
  const temporary = mkdtempSync(join(project, ".codex-dev/nsis-build-"));
  try {
    const temporaryOutput = join(temporary, basename(output));
    const directories = [...new Set(index.files.flatMap(file => {
      const parts = file.path.split("/");
      return parts.slice(0, -1).map((_, position) => parts.slice(0, position + 1).join("/"));
    }))].sort();
    const lines = [
      `!define OUTPUT_FILE "${nsisString(temporaryOutput)}"`,
      `!define PRODUCT_VERSION "${manifest.version}"`,
      `!define PRODUCT_ICON "${nsisString(windowsBuildTools(project).icon)}"`,
      `!define PRODUCT_SIZE_KIB ${Math.ceil(index.files.reduce((size, file) => size + file.size, 0) / 1024)}`,
      ...(test?.failCommit ? ["!define LUMERIA_TEST_FAIL_COMMIT"] : []),
      ...(test ? [`!define LUMERIA_TEST_LOG_ROOT "${nsisString(dirname(output))}"`] : []),
      ...(test?.dataDirectory ? [`!define LUMERIA_TEST_DATA_ROOT "${nsisString(test.dataDirectory)}"`] : []),
      "!macro LumeriaExtract ROOT FAILURE",
    ];
    let previousDirectory: string | null = null;
    for (const file of index.files) {
      const directory = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
      if (directory !== previousDirectory) {
        lines.push('  SetOutPath "${ROOT}' + (directory ? "\\" + nsisString(directory.replaceAll("/", "\\")) : "") + '"', "  IfErrors ${FAILURE}");
        previousDirectory = directory;
      }
      lines.push(`  File "/oname=${nsisString(basename(file.path))}" "${nsisString(join(staging, file.path))}"`, "  IfErrors ${FAILURE}");
    }
    lines.push("!macroend", "!macro LumeriaRemove ROOT FAILURE", "  ClearErrors");
    // Validate directories before deleting any payload file. A junction must never
    // redirect a generated uninstall path into another directory.
    for (const directory of ["", ...directories]) {
      const suffix = directory ? "\\" + nsisString(directory.replaceAll("/", "\\")) : "";
      lines.push("  System::Call 'kernel32::GetFileAttributesW(w \"${ROOT}" + suffix + "\") i.r0'",
        "  ${If} $0 != -1", "    IntOp $1 $0 & 0x400", "    ${If} $1 != 0", "      Goto ${FAILURE}", "    ${EndIf}", "  ${EndIf}");
    }
    for (const file of index.files) {
      const path = '${ROOT}\\' + nsisString(file.path.replaceAll("/", "\\"));
      lines.push(`  IfFileExists "${path}" 0 +4`, "  ClearErrors", `  Delete "${path}"`, "  IfErrors ${FAILURE}");
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length || b.localeCompare(a))) {
      lines.push('  RMDir "${ROOT}\\' + nsisString(directory.replaceAll("/", "\\")) + '"');
    }
    lines.push("!macroend", "");
    const config = join(temporary, "payload.nsh");
    writeFileSync(config, "\uFEFF" + lines.join("\n"), "utf8");
    runWindowsBuildTool(findNsis(), ["-V2", "-INPUTCHARSET", "UTF8", "-DGENERATED_CONFIG=" + config, join(project, "release/windows/lumeria.nsi")]);
    if (!existsSync(temporaryOutput)) throw new Error("NSIS did not produce an installer");
    mkdirSync(dirname(output), { recursive: true });
    if (!test && realpathSync(dirname(output)) !== join(project, "artifacts")) throw new Error("Artifact output must not be redirected through a link");
    copyFileSync(temporaryOutput, output);
    const bytes = readFileSync(output), sha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(output + ".sha256", `${sha256}  ${basename(output)}\n`);
    writeFileSync(output + ".json", JSON.stringify({ schemaVersion: 1, identifier: PRODUCT.identifier, version: manifest.version,
      platform: "win32", arch: "x64", file: basename(output), size: bytes.length, sha256, signed: false }, null, 2) + "\n");
    console.log(`Windows installer created: ${output}`);
    return output;
  } finally { rmSync(assertReleaseOutput(project, temporary), { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error("Usage: packageWindowsRelease (run native:stage first)");
  packageWindowsRelease(resolve("release/staging/windows-x64/Lumeria"));
}
