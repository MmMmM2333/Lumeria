import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { activateToolchain, buildNativeFrame, digest, lockPath, packToolchain, readLock, run, starterRoot, verifyDevkit } from "./native-toolchain.mjs";

export function parseSourceOptions(args) {
  const result = { source: null };
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== "--source" || result.source !== null || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("Usage: npm run native:prepare:source [-- --source build/electrobun-source]");
    }
    result.source = args[index + 1];
  }
  return result;
}

/** Upstream may clear build outputs; accept only a dedicated non-linked checkout. */
export function sourceDirectory(project, input) {
  const source = resolve(project, input), rel = relative(project, source).replaceAll("\\", "/");
  if (isAbsolute(rel) || !(rel.startsWith("build/") || rel.startsWith(".codex-dev/")) || rel.split("/").includes("..")) {
    throw new Error("Source checkout must be below this project's build/ or .codex-dev/");
  }
  let current = source;
  while (relative(project, current) !== "") {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Source checkout must not traverse links");
    const parent = dirname(current);
    if (parent === current) throw new Error("Source checkout escaped the project");
    current = parent;
  }
  return source;
}

export async function prepareSource(args = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Source preparation currently requires Windows x64");
  const options = parseSourceOptions(args), project = resolve(starterRoot, "../..");
  const source = sourceDirectory(project, options.source ?? "build/electrobun-source");
  const official = readLock(), officialHash = digest(lockPath);
  if (!existsSync(join(project, "node_modules/electrobun/package.json"))) throw new Error("Run npm ci before source preparation");
  run("git", ["--version"]); run("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
  // npm installs bun as a .cmd shim on some Windows machines; PowerShell resolves it.
  run("pwsh", ["-NoProfile", "-Command", "$ErrorActionPreference='Stop'; $v=& bun --version; if($LASTEXITCODE -ne 0 -or $v -notmatch '^1\\.4\\.[0-9]+$'){throw 'Install Bun 1.4.x'}; Get-Command rustc, cargo | Out-Null"]);
  if (!existsSync(source)) {
    mkdirSync(dirname(source), { recursive: true });
    run("git", ["clone", "--depth", "1", "--branch", `v${official.electrobun}`, "https://github.com/blackboardsh/electrobun.git", source], { stdio: "inherit" });
  }
  if (!existsSync(join(source, ".git")) || realpathSync(run("git", ["rev-parse", "--show-toplevel"], { cwd: source }).trim()) !== realpathSync(source)) {
    throw new Error("Source directory must be its own upstream Git checkout; existing files were left untouched");
  }
  if (run("git", ["rev-parse", "HEAD"], { cwd: source }).trim() !== official.provenance.upstreamCommit) throw new Error("Existing source HEAD differs from the pinned upstream commit; use a new --source directory");
  console.log(`Rebuilding Electrobun ${official.electrobun} with the repository patch in ${source}`);
  run("pwsh", ["-NoProfile", "-File", join(project, "scripts/rebuildElectrobunDevkit.ps1"), "-SourceDirectory", source], { stdio: "inherit" });
  if (digest(lockPath) !== officialHash) throw new Error("Repository toolchain lock changed during the source build; no SDK was selected");
  const buildEnvironment = JSON.parse(readFileSync(join(source, "lumeria-build-environment.json"), "utf8").replace(/^\uFEFF/, ""));
  if (buildEnvironment.upstreamCommit !== official.provenance.upstreamCommit
    || buildEnvironment.sourcePatchSha256 !== digest(join(starterRoot, official.provenance.patches[0].path))) throw new Error("Source build receipt does not match the repository");
  const stamp = `${new Date().toISOString().replace(/[:.]/g, "-").toLowerCase()}-${process.pid}`;
  const output = join(project, "artifacts", `toolchain-local-${stamp}`);
  const candidate = await packToolchain(output, source, `lumeria-local-${stamp}`);
  await verifyDevkit(join(source, "package/dist"), candidate.lock);
  run(process.execPath, [join(starterRoot, "tools/patch-electrobun.mjs"), "--consumer-root", project, "--check"], {
    stdio: "inherit", env: { ...process.env, HUTCH_ELECTROBUN_DEVKIT_ROOT: join(source, "package/dist") },
  });
  buildNativeFrame();
  if (digest(lockPath) !== officialHash) throw new Error("Repository toolchain lock changed before activation");
  await activateToolchain(candidate.archive, candidate.lock, { officialLockSha256: officialHash, buildEnvironment });
  await verifyDevkit();
  console.log(`Local source SDK ready. Evidence: ${output}\nRun npm run native:dev or npm run native:build. The repository lock is unchanged.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareSource().catch(error => { console.error(error.message); process.exitCode = 1; });
}
