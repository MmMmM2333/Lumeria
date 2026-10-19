import { createHash } from "node:crypto";
import { closeSync, copyFileSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { verifyBunRuntimePin } from "./bun-runtime-pin.mjs";

export const starterRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const lockPath = join(starterRoot, "native-toolchain.lock.json");
export const devkitPath = join(starterRoot, ".hutch/devkit-dcomp-2.0.1");
export const localLockPath = join(starterRoot, ".hutch/native-toolchain.local.json");
export const frameDirectory = join(starterRoot, ".hutch/native-frame");
const help = "Run npm run native:prepare:source or native:prepare -- --archive <toolchain.tar.gz>; see docs/native-toolchain.md.";
const frameRecipe = ["build", "--manifest-path", "native/frame/Cargo.toml", "--release", "--locked", "--target", "x86_64-pc-windows-msvc"];
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${result.stderr ?? ""}`);
  return result.stdout ?? "";
}
export function digest(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
export async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export function safeName(path) {
  if (typeof path !== "string" || !path || /[\\:\x00-\x20]/.test(path)
    || path.split("/").some(part => !part || part === "." || part === ".." || part.endsWith(".")
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error(`Unsafe toolchain path: ${path}`);
  return path;
}
function regularPath(root, name) {
  let current = root;
  if (lstatSync(root).isSymbolicLink()) throw new Error("Toolchain roots must not be links");
  for (const part of safeName(name).split("/")) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Toolchain links are forbidden: ${name}`);
  }
  if (!lstatSync(current).isFile()) throw new Error(`Expected toolchain file: ${name}`);
  return current;
}
export function readLock(path = lockPath) {
  const lock = JSON.parse(readFileSync(path, "utf8"));
  if (lock.schemaVersion !== 1 || lock.target !== "win32-x64" || lock.electrobun !== "2.0.1" || lock.bun !== "1.4.2"
    || !/^[a-z0-9][a-z0-9.-]+$/.test(lock.id) || !Array.isArray(lock.files) || !lock.files.length) throw new Error("Invalid native toolchain lock");
  const names = new Set();
  for (const file of lock.files) {
    safeName(file.path);
    if (file.path.toLowerCase().endsWith(".log")) throw new Error("Runtime logs must not enter the toolchain lock/archive");
    if (names.has(file.path.toLowerCase()) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("Invalid/duplicate toolchain inventory entry");
    names.add(file.path.toLowerCase());
  }
  for (const required of ["native-devkit.json", "libNativeWrapper.dll", "ElectrobunCore.dll", "api/sdks/main/webgpuAdapter.ts", "api/shared/bun-version.ts"]) {
    if (!names.has(required.toLowerCase())) throw new Error(`Missing required inventory entry: ${required}`);
  }
  if (lock.archive !== null && (!Number.isSafeInteger(lock.archive.size) || lock.archive.size <= 0
    || !/^[a-f0-9]{64}$/.test(lock.archive.sha256) || lock.archive.file !== `${lock.id}.tar.gz`)) throw new Error("Invalid toolchain archive lock");
  return lock;
}
export function readInstalledLock(recordPath = localLockPath, officialPath = lockPath) {
  if (!existsSync(recordPath)) return readLock(officialPath);
  if (lstatSync(recordPath).isSymbolicLink()) throw new Error("Local toolchain receipt must not be a link");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  if (record.localBuild?.officialLockSha256 !== digest(officialPath)) {
    throw new Error("Local SDK was built for a different repository toolchain lock; rerun native:prepare:source or prepare an official archive");
  }
  const lock = readLock(recordPath), official = readLock(officialPath);
  if (lock.provenance?.upstreamCommit !== official.provenance?.upstreamCommit
    || JSON.stringify(lock.provenance?.patches) !== JSON.stringify(official.provenance?.patches)) {
    throw new Error("Local toolchain provenance does not match the repository");
  }
  return lock;
}
export async function verifyDevkit(directory = devkitPath, lock = readInstalledLock()) {
  await verifyInventory(directory, lock);
  verifyBunRuntimePin(directory, lock.bun);
  const manifest = JSON.parse(readFileSync(join(directory, "native-devkit.json"), "utf8"));
  if (manifest.product?.version !== lock.electrobun || manifest.target?.os !== "win" || manifest.target?.arch !== "x64") throw new Error("Toolchain platform/version mismatch");
}
export async function verifyInventory(directory, lock) {
  if (!existsSync(directory)) throw new Error(`Native toolchain is missing. ${help}`);
  const expected = new Set(lock.files.map(file => file.path));
  for (const file of lock.files) {
    const path = regularPath(directory, file.path);
    if (statSync(path).size !== file.size || await hashFile(path) !== file.sha256) throw new Error(`Native toolchain drift: ${file.path}. Keep the old directory for inspection and install into a clean checkout. ${help}`);
  }
  const visit = (folder, prefix = "") => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected link: ${name}`);
      if (entry.isDirectory()) visit(join(folder, entry.name), name + "/");
      else if (!expected.has(name) && name !== "app.log") throw new Error(`Unexpected toolchain file: ${name}`);
    }
  };
  visit(directory);
}
// Only remove directories created by this invocation, beneath the checked parent.
export function removeTemporary(path, parent) {
  if (dirname(resolve(path)) !== realpathSync(parent) || lstatSync(path).isSymbolicLink()) throw new Error("Temporary cleanup escaped its parent");
  rmSync(path, { recursive: true, force: true, maxRetries: 60, retryDelay: 100 });
}
// Retry transient Windows rename failures while keeping activation and rollback bounded.
export async function renameWithRetry(source, destination) {
  const deadline = performance.now() + 2000;
  let backoff = 20;
  for (;;) {
    try { renameSync(source, destination); return; }
    catch (error) {
      const remaining = deadline - performance.now();
      if (process.platform !== "win32" || !["EPERM", "EBUSY"].includes(error.code) || remaining <= 0) throw error;
      await delay(Math.min(backoff, remaining));
      if (performance.now() >= deadline) throw error;
      backoff = Math.min(backoff * 2, 200);
    }
  }
}
function localCache() {
  const path = join(starterRoot, ".hutch");
  mkdirSync(path, { recursive: true });
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error("Starter cache must not traverse links");
  return path;
}
export function validateArchiveListing(names, details, lock) {
  const paths = names.trimEnd().split(/\r?\n/);
  const expected = new Set(lock.files.map(file => file.path));
  if (paths.length !== expected.size || new Set(paths).size !== paths.length) throw new Error("Archive inventory count/duplicates do not match lock");
  for (const path of paths) if (!expected.has(safeName(path))) throw new Error(`Unexpected archive path: ${path}`);
  const rows = details.trimEnd().split(/\r?\n/);
  if (rows.length !== paths.length || rows.some(line => !line.startsWith("-"))) throw new Error("Archive must contain only regular files, no links or directories");
}
export async function installArchive(archive, destination = devkitPath, lock = readLock()) {
  if (existsSync(destination)) { await verifyDevkit(destination, lock); return; }
  if (!lock.archive) throw new Error("Toolchain archive has not been locked by its maintainer");
  const cache = localCache();
  if (dirname(destination) !== cache) throw new Error("Toolchain installation must stay in the Starter cache");
  const temporary = mkdtempSync(join(cache, "install-"));
  try {
    // Copy first: extraction and verification must consume the same private bytes.
    const snapshot = join(temporary, "archive.tar.gz");
    await pipeline(createReadStream(archive), createWriteStream(snapshot, { flags: "wx" }));
    if (statSync(snapshot).size !== lock.archive.size || await hashFile(snapshot) !== lock.archive.sha256) throw new Error("Toolchain archive checksum/size mismatch");
    const options = { maxBuffer: 8 * 1024 * 1024 };
    validateArchiveListing(run("tar.exe", ["-tf", snapshot], options), run("tar.exe", ["-tvf", snapshot], options), lock);
    const payload = join(temporary, "payload"); mkdirSync(payload);
    run("tar.exe", ["-xf", snapshot, "-C", payload]);
    await verifyDevkit(payload, lock);
    await renameWithRetry(payload, destination);
  } finally { removeTemporary(temporary, cache); }
}

/** Publish only a verified candidate. Keep the previous SDK/receipt together;
 * no user installation is deleted, and failed activation rolls back both. */
export async function activateToolchain(archive, lock, localBuild = null, paths = {}) {
  const cache = paths.cache ?? localCache();
  const destination = paths.destination ?? devkitPath, receipt = paths.receipt ?? localLockPath;
  if (realpathSync(cache) !== resolve(cache) || lstatSync(cache).isSymbolicLink()
    || dirname(resolve(destination)) !== resolve(cache) || dirname(resolve(receipt)) !== resolve(cache)) {
    throw new Error("Toolchain activation must stay in its cache directory");
  }
  for (const path of [destination, receipt]) if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Toolchain activation refuses links");
  if (existsSync(receipt) && !lstatSync(receipt).isFile()) throw new Error("Local toolchain receipt must be a regular file");
  const guard = join(cache, "toolchain-activation.lock");
  let descriptor;
  try { descriptor = openSync(guard, "wx"); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`Another SDK activation is running (or was interrupted); inspect ${guard}`); throw error; }
  let transaction;
  try { transaction = mkdtempSync(join(cache, "activate-")); }
  catch (error) { closeSync(descriptor); unlinkSync(guard); throw error; }
  const candidate = transaction + "-candidate";
  const saved = join(transaction, "previous-sdk"), savedReceipt = join(transaction, "previous-lock.json");
  let installed = false, rollbackFailed = false;
  try {
    await installArchive(archive, candidate, lock);
    if (localBuild) writeFileSync(join(transaction, "next-lock.json"), JSON.stringify({ ...lock, localBuild }, null, 2) + "\n");
    if (existsSync(destination)) await renameWithRetry(destination, saved);
    if (existsSync(receipt)) await renameWithRetry(receipt, savedReceipt);
    await renameWithRetry(candidate, destination); installed = true;
    if (localBuild) await renameWithRetry(join(transaction, "next-lock.json"), receipt);
  } catch (error) {
    try {
      if (installed) await renameWithRetry(destination, candidate);
      if (existsSync(saved)) await renameWithRetry(saved, destination);
      if (existsSync(savedReceipt)) await renameWithRetry(savedReceipt, receipt);
    } catch (rollback) {
      rollbackFailed = true;
      throw new AggregateError([error, rollback], `Toolchain activation rollback failed; inspect ${transaction}`);
    }
    throw error;
  } finally {
    try { if (!rollbackFailed && existsSync(candidate)) removeTemporary(candidate, cache); }
    finally { closeSync(descriptor); unlinkSync(guard); }
  }
  console.log(`Toolchain selected: ${lock.id}. Previous installation retained in ${transaction}`);
  return transaction;
}
export async function downloadArchive(url, destination, lock = readLock()) {
  const location = new URL(url);
  if (location.protocol !== "https:" || location.username || location.password) throw new Error("Toolchain download requires an HTTPS URL without credentials");
  if (!lock.archive) throw new Error("Toolchain archive is not locked");
  const response = await fetch(location, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body || new URL(response.url).protocol !== "https:") throw new Error(`Toolchain download failed: HTTP ${response.status}`);
  let size = 0;
  async function* bounded(source) {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > lock.archive.size) throw new Error("Toolchain download exceeds locked size");
      yield chunk;
    }
  }
  await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(destination, { flags: "wx" }));
  if (size !== lock.archive.size || await hashFile(destination) !== lock.archive.sha256) throw new Error("Downloaded toolchain does not match lock");
}
const frameSources = ["native/frame/Cargo.toml", "native/frame/Cargo.lock", "native/frame/build.rs", "src/platform/native-frame.rs", "src/platform/native-frame-window-tests.rs"];
function frameInputs() { return frameSources.map(path => ({ path, sha256: digest(join(starterRoot, path)) })); }
export function verifyNativeFrame(directory = frameDirectory, sources = frameInputs()) {
  const path = join(directory, "build.json");
  if (!existsSync(path)) throw new Error("Native frame has no local build receipt; run npm run native:host:build");
  const record = JSON.parse(readFileSync(regularPath(directory, "build.json"), "utf8"));
  if (record.schemaVersion !== 1 || record.target !== "x86_64-pc-windows-msvc" || JSON.stringify(record.sources) !== JSON.stringify(sources)
    || JSON.stringify(record.recipe) !== JSON.stringify(frameRecipe)
    || record.binarySha256 !== digest(regularPath(directory, "native-frame.dll"))) throw new Error("Native frame source/binary changed; run npm run native:host:build");
  return record;
}
export function buildNativeFrame() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Native frame currently requires Windows x64 with Rust MSVC");
  const cache = localCache();
  const compiler = run("rustc", ["-vV"]).trim();
  if (!compiler.includes("host: x86_64-pc-windows-msvc")) throw new Error("Install Rust x86_64-pc-windows-msvc and MSVC build tools");
  const sources = frameInputs();
  try { const previous = verifyNativeFrame(); if (previous.compiler === compiler) return; } catch { /* Rebuild stale or absent local output. */ }
  const temporary = mkdtempSync(join(cache, "frame-"));
  try {
    const output = join(temporary, "native-frame.dll");
    const target = join(cache, "frame-target");
    run("cargo", [...frameRecipe, "--target-dir", target], { cwd: starterRoot, stdio: "inherit" });
    copyFileSync(join(target, "x86_64-pc-windows-msvc/release/native_frame.dll"), output);
    if (JSON.stringify(sources) !== JSON.stringify(frameInputs())) throw new Error("Native sources changed while compiling; retry");
    const record = { schemaVersion: 1, target: "x86_64-pc-windows-msvc", compiler, recipe: frameRecipe, sources, binarySha256: digest(output) };
    mkdirSync(frameDirectory, { recursive: true });
    if (lstatSync(frameDirectory).isSymbolicLink()) throw new Error("Native frame directory must not be a link");
    // A loaded DLL is never force-replaced. Failed replacement leaves the old receipt.
    renameSync(output, join(frameDirectory, "native-frame.dll"));
    const receipt = join(temporary, "build.json");
    writeFileSync(receipt, JSON.stringify(record, null, 2) + "\n");
    renameSync(receipt, join(frameDirectory, "build.json"));
  } finally { removeTemporary(temporary, cache); }
}
export async function packToolchain(output, sourceRoot = null, id = null) {
  let lock = sourceRoot ? readLock() : readInstalledLock(), input = devkitPath, sourceDiff = null;
  if (sourceRoot) {
    const source = realpathSync(sourceRoot);
    if (!id || id === lock.id || !/^[a-z0-9][a-z0-9.-]+$/.test(id)) throw new Error("A source build needs a distinct --id");
    if (run("git", ["rev-parse", "HEAD"], { cwd: source }).trim() !== lock.provenance.upstreamCommit) throw new Error("Source checkout does not match the pinned upstream commit");
    run(process.execPath, [join(starterRoot, "tools/electrobun-dcomp-patch.mjs"), source]);
    run("git", ["apply", "--reverse", "--check", join(starterRoot, "patches/electrobun-2.0.1-dcomp-atomic-resize.patch")], { cwd: source });
    input = join(source, "package/dist");
    sourceDiff = run("git", ["diff", "--binary", "HEAD"], { cwd: source, maxBuffer: 16 * 1024 * 1024 });
    const files = [];
    const visit = async (directory, prefix = "") => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
        const path = prefix + entry.name;
        if (path.toLowerCase().endsWith(".log")) continue;
        safeName(path);
        if (entry.isSymbolicLink()) throw new Error("Source devkit contains a link");
        if (entry.isDirectory()) await visit(join(directory, entry.name), path + "/");
        else {
          const file = regularPath(input, path);
          files.push({ path, size: statSync(file).size, sha256: await hashFile(file) });
        }
      }
    };
    await visit(input);
    lock = { ...lock, id, archive: null, files, provenance: { ...lock.provenance,
      origin: "Local full upstream SDK build; see source.diff and build-environment.json in this artifact directory.",
      patches: lock.provenance.patches.map(patch => ({ ...patch, sha256: digest(join(starterRoot, safeName(patch.path))) })),
      sourceDiffSha256: createHash("sha256").update(sourceDiff).digest("hex") } };
  }
  await verifyDevkit(input, lock);
  const project = resolve(starterRoot, "../..");
  const target = resolve(output);
  const rel = relative(project, target).replaceAll("\\", "/");
  if (!rel.startsWith("artifacts/") || rel.includes("..") || isAbsolute(rel) || existsSync(target)) throw new Error("Package output must be a new artifacts subdirectory");
  let ancestor = dirname(target);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (realpathSync(ancestor) !== ancestor) throw new Error("Package output must not traverse links");
  mkdirSync(target, { recursive: true });
  if (realpathSync(target) !== target) throw new Error("Package output must not traverse links");
  const file = `${lock.id}.tar.gz`, archive = join(target, file), list = join(target, "files.txt");
  writeFileSync(list, lock.files.map(entry => entry.path).join("\n") + "\n");
  run("tar.exe", ["-czf", archive, "-C", input, "--no-recursion", "-T", list]);
  const generated = { ...lock, archive: { file, size: statSync(archive).size, sha256: await hashFile(archive), url: null } };
  writeFileSync(join(target, "native-toolchain.lock.json"), JSON.stringify(generated, null, 2) + "\n");
  if (sourceDiff !== null) {
    writeFileSync(join(target, "source.diff"), sourceDiff);
    const receipt = join(sourceRoot, "lumeria-build-environment.json");
    if (existsSync(receipt)) writeFileSync(join(target, "build-environment.json"), readFileSync(receipt));
  }
  console.log(`Prepared ${archive}; review/promote the generated lock explicitly. No tracked file changed.`);
  return { archive, lock: generated };
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const argument = name => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${name}`);
    return args[index + 1];
  };
  const allowed = command === "prepare" ? ["--archive", "--url"] : command === "pack" ? ["--output", "--source", "--id"] : [];
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || seen.has(args[i]) || args[i + 1].startsWith("--")) throw new Error("Unknown/duplicate toolchain argument or missing value");
    seen.add(args[i]);
  }
  if (command === "frame") { buildNativeFrame(); console.log("Native frame built/verified from current sources"); return; }
  if (command === "pack") {
    if (argument("--id") && !argument("--source")) throw new Error("--id requires --source");
    await packToolchain(argument("--output") ?? "artifacts/native-toolchain", argument("--source"), argument("--id")); return;
  }
  if (command === "check") { const lock = readInstalledLock(); await verifyDevkit(devkitPath, lock); verifyNativeFrame(); console.log(`Verified ${lock.id} (${lock.localBuild ? "local source build" : "repository lock"}) and native-frame receipt`); return; }
  if (command !== "prepare") throw new Error("Usage: native-toolchain.mjs prepare [--archive FILE | --url HTTPS_URL] | frame | check | pack [--output artifacts/DIR]");
  const archive = argument("--archive"), url = argument("--url");
  if (archive && url) throw new Error("Choose --archive or --url, not both");
  if (existsSync(localLockPath) && !archive && !url) readInstalledLock();
  if (existsSync(localLockPath) && !existsSync(devkitPath) && !archive && !url) throw new Error("Selected local SDK is missing; rerun native:prepare:source or supply an official archive");
  if (existsSync(localLockPath) && (archive || url)) {
    const lock = readLock();
    if (archive) await activateToolchain(resolve(archive), lock);
    else {
      const cache = localCache(), temporary = mkdtempSync(join(cache, "download-"));
      try {
        const downloaded = join(temporary, "toolchain.tar.gz");
        await downloadArchive(url, downloaded, lock); await activateToolchain(downloaded, lock);
      } finally { removeTemporary(temporary, cache); }
    }
  } else if (!existsSync(devkitPath)) {
    const lock = readLock();
    if (archive) await installArchive(resolve(archive), devkitPath, lock);
    else {
      const source = url ?? lock.archive?.url;
      if (!source) throw new Error(`Toolchain attachment is not published yet. ${help}`);
      const cache = localCache(), temporary = mkdtempSync(join(cache, "download-"));
      try {
        const downloaded = join(temporary, "toolchain.tar.gz");
        await downloadArchive(source, downloaded, lock); await installArchive(downloaded, devkitPath, lock);
      } finally { removeTemporary(temporary, cache); }
    }
  }
  await verifyDevkit(); buildNativeFrame();
  const patch = join(starterRoot, "tools/patch-electrobun.mjs"), project = resolve(starterRoot, "../..");
  run(process.execPath, [patch, "--consumer-root", project, "--dependencies-only"], { stdio: "inherit" });
  run(process.execPath, [patch, "--consumer-root", project, "--check"], { stdio: "inherit" });
  console.log("Native preparation complete; npm run native:build is ready");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
