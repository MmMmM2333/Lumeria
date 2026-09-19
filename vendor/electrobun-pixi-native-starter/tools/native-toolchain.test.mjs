import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { activateToolchain, digest, readInstalledLock, readLock, safeName, validateArchiveListing, verifyDevkit, verifyNativeFrame, installArchive, downloadArchive, removeTemporary, starterRoot, run } from "./native-toolchain.mjs";
import { parseSourceOptions, sourceDirectory } from "./prepare-source.mjs";

const temporary = () => mkdtempSync(join(tmpdir(), "lumeria-toolchain-test-"));
test("source command rejects ambiguous options and unsafe checkout locations", () => {
  assert.deepEqual(parseSourceOptions([]), { source: null });
  assert.deepEqual(parseSourceOptions(["--source", "build/local"]), { source: "build/local" });
  for (const args of [["--source"], ["--other", "x"], ["--source", "a", "--source", "b"]]) assert.throws(() => parseSourceOptions(args));
  const root = temporary();
  try {
    assert.equal(sourceDirectory(root, "build/upstream"), join(root, "build/upstream"));
    if(process.platform === "win32")assert.equal(sourceDirectory(root, join(root.toUpperCase(), "build/upstream")).toLowerCase(), join(root, "build/upstream").toLowerCase());
    for (const path of ["..", ".", "src/upstream", "build/../../outside"]) assert.throws(() => sourceDirectory(root, path));
    mkdirSync(join(root, "target")); symlinkSync(join(root, "target"), join(root, "build"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => sourceDirectory(root, "build/upstream"), /links/);
    unlinkSync(join(root, "build"));
  } finally { removeTemporary(root, tmpdir()); }
});
function fixture(root) {
  const content = {
    "native-devkit.json": JSON.stringify({ product: { version: "2.0.1" }, target: { os: "win", arch: "x64" }, toolchains: { bun: { defaultVersion: "1.4.2" } } }),
    "api/shared/bun-version.ts": 'export const BUN_VERSION = "1.4.2";',
    "api/sdks/main/webgpuAdapter.ts": "fixture adapter",
    "libNativeWrapper.dll": "fixture wrapper",
    "ElectrobunCore.dll": "fixture core",
  };
  const files = Object.entries(content).map(([path, text]) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
    return { path, size: Buffer.byteLength(text), sha256: digest(join(root, path)) };
  });
  return { schemaVersion: 1, id: "test-toolchain", target: "win32-x64", electrobun: "2.0.1", bun: "1.4.2", archive: null, files };
}
test("lock inventory rejects Windows traversal, aliases and duplicate files", () => {
  for (const path of ["../x", "/x", "a//b", "a/./b", "C:/x", "a\\b", "a:stream", "NUL", "foo/COM1.txt", "a./x", "a\nx", "a /x"]) assert.throws(() => safeName(path));
  const root = temporary();
  try {
    const lock = fixture(join(root, "devkit")), file = join(root, "lock.json");
    writeFileSync(file, JSON.stringify(lock)); assert.equal(readLock(file).files.length, 5);
    lock.files.push({ ...lock.files[0], path: lock.files[0].path.toUpperCase() });
    writeFileSync(file, JSON.stringify(lock)); assert.throws(() => readLock(file), /duplicate/);
    lock.files.pop(); lock.files.push({ ...lock.files[0], path: "app.log" });
    writeFileSync(file, JSON.stringify(lock)); assert.throws(() => readLock(file), /logs/);
  } finally { removeTemporary(root, tmpdir()); }
});
test("devkit verification rejects SDK/binary drift and unexpected files", async () => {
  const root = temporary();
  try {
    const lock = fixture(root); await verifyDevkit(root, lock);
    writeFileSync(join(root, "injected.ts"), "extra");
    await assert.rejects(verifyDevkit(root, lock), /Unexpected toolchain/);
    writeFileSync(join(root, "libNativeWrapper.dll"), "wrong");
    await assert.rejects(verifyDevkit(root, lock), /drift/);
  } finally { removeTemporary(root, tmpdir()); }
});
test("archive inventory rejects links, duplicate entries and unlisted paths", () => {
  const lock = { files: [{ path: "a" }, { path: "b" }] };
  validateArchiveListing("a\nb\n", "- a\n- b\n", lock);
  assert.throws(() => validateArchiveListing("a\nb\n", "- a\nl b\n", lock));
  assert.throws(() => validateArchiveListing("a\na\n", "- a\n- a\n", lock));
  assert.throws(() => validateArchiveListing("a\n../b\n", "- a\n- b\n", lock));
});
test("verification never follows an SDK directory junction", () => {
  const root = temporary(), target = join(root, "target"), link = join(root, "linked");
  try {
    const lock = fixture(target);
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    return assert.rejects(verifyDevkit(link, lock), /links/).finally(() => {
      unlinkSync(link); removeTemporary(root, tmpdir());
    });
  } catch (error) {
    if (existsSync(link)) unlinkSync(link);
    removeTemporary(root, tmpdir()); throw error;
  }
});
test("native frame receipts bind output to current source inputs", () => {
  const root = temporary();
  try {
    const sources = [{ path: "frame.rs", sha256: "a".repeat(64) }];
    writeFileSync(join(root, "native-frame.dll"), "fixture");
    const recipe = ["--crate-type", "cdylib", "--target", "x86_64-pc-windows-msvc", "src/platform/native-frame.rs", "-C", "opt-level=3", "-C", "link-arg=/Brepro"];
    writeFileSync(join(root, "build.json"), JSON.stringify({ schemaVersion: 1, target: "x86_64-pc-windows-msvc", recipe, sources, binarySha256: digest(join(root, "native-frame.dll")) }));
    verifyNativeFrame(root, sources);
    assert.throws(() => verifyNativeFrame(root, [{ path: "frame.rs", sha256: "b".repeat(64) }]), /changed/);
    writeFileSync(join(root, "native-frame.dll"), "modified");
    assert.throws(() => verifyNativeFrame(root, sources), /changed/);
  } finally { removeTemporary(root, tmpdir()); }
});
test("downloads require HTTPS and enforce locked content without trusting the server", async () => {
  const root = temporary(), original = globalThis.fetch;
  try {
    const lock = { archive: { size: 3, sha256: "0".repeat(64) } };
    await assert.rejects(downloadArchive("http://example.invalid/file", join(root, "http"), lock), /HTTPS/);
    await assert.rejects(downloadArchive("https://user:secret@example.invalid/file", join(root, "credentials"), lock), /credentials/);
    globalThis.fetch = async () => ({ ok: true, status: 200, url: "https://example.invalid/file", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); controller.close(); } }) });
    await assert.rejects(downloadArchive("https://example.invalid/file", join(root, "large"), lock), /exceeds/);
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(downloadArchive("https://example.invalid/file", join(root, "missing"), lock), /404/);
    assert.equal(existsSync(join(root, "missing")), false);
    writeFileSync(join(root, "expected"), new Uint8Array([1, 2, 3]));
    globalThis.fetch = async () => ({ ok: true, status: 200, url: "https://example.invalid/file", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) });
    await assert.rejects(downloadArchive("https://example.invalid/file", join(root, "bad-hash"), lock), /match lock/);
    await downloadArchive("https://example.invalid/file", join(root, "verified"), { archive: { size: 3, sha256: digest(join(root, "expected")) } });
    assert.deepEqual(readFileSync(join(root, "verified")), readFileSync(join(root, "expected")));
  } finally { globalThis.fetch = original; removeTemporary(root, tmpdir()); }
});
test("installation verifies a private archive copy before publishing; preserves corrupt existing installs", { skip: process.platform !== "win32" }, async () => {
  const root = temporary(), cache = join(starterRoot, ".hutch"); mkdirSync(cache, { recursive: true });
  const owner = mkdtempSync(join(cache, "test-install-"));
  // installArchive accepts only direct children of the cache, with a unique test-owned name.
  const destination = owner + "-devkit";
  try {
    const source = join(root, "source"), lock = fixture(source), archive = join(root, "test.tar.gz");
    const list = join(root, "files.txt"); writeFileSync(list, lock.files.map(file => file.path).join("\n") + "\n");
    run("tar.exe", ["-czf", archive, "-C", source, "--no-recursion", "-T", list]);
    lock.archive = { file: "test-toolchain.tar.gz", size: readFileSync(archive).length, sha256: digest(archive), url: null };
    const wrong = { ...lock, archive: { ...lock.archive, sha256: "0".repeat(64) } };
    await assert.rejects(installArchive(archive, destination, wrong), /checksum/);
    assert.equal(existsSync(destination), false);
    await installArchive(archive, destination, lock); await verifyDevkit(destination, lock);
    await installArchive(archive, destination, lock);
    writeFileSync(join(destination, "libNativeWrapper.dll"), "user modification");
    await assert.rejects(installArchive(archive, destination, lock), /drift/);
    assert.equal(readFileSync(join(destination, "libNativeWrapper.dll"), "utf8"), "user modification");
  } finally {
    if (existsSync(destination)) removeTemporary(destination, cache);
    removeTemporary(owner, cache); removeTemporary(root, tmpdir());
  }
});

test("local SDK selection verifies before replacing, retains backups and restores official selection", { skip: process.platform !== "win32" }, async (t) => {
  const root = temporary(), cache = join(starterRoot, ".hutch"); mkdirSync(cache, { recursive: true });
  const destination = mkdtempSync(join(cache, "test-selection-")), receipt = destination + ".json";
  const transactions = [];
  try {
    const old = fixture(destination), source = join(root, "source"), candidate = fixture(source);
    candidate.id = "local-test-sdk";
    candidate.provenance = old.provenance = { upstreamCommit: "a".repeat(40), patches: [] };
    writeFileSync(join(source, "libNativeWrapper.dll"), "locally compiled wrapper");
    candidate.files = candidate.files.map(file => file.path === "libNativeWrapper.dll" ? { ...file, size: Buffer.byteLength("locally compiled wrapper"), sha256: digest(join(source, file.path)) } : file);
    const officialPath = join(root, "official.json");writeFileSync(officialPath, JSON.stringify(old));
    const localBuild = { officialLockSha256: digest(officialPath) };
    const list = join(root, "files.txt"), archive = join(root, "local-test-sdk.tar.gz");
    writeFileSync(list, candidate.files.map(file => file.path).join("\n") + "\n");
    run("tar.exe", ["-czf", archive, "-C", source, "--no-recursion", "-T", list]);
    candidate.archive = { file: "local-test-sdk.tar.gz", size: readFileSync(archive).length, sha256: digest(archive), url: null };
    const paths = { destination, receipt };
    await assert.rejects(activateToolchain(archive, { ...candidate, archive: { ...candidate.archive, sha256: "0".repeat(64) } }, localBuild, paths), /checksum/);
    await verifyDevkit(destination, old);assert.equal(existsSync(receipt), false);
    transactions.push(await activateToolchain(archive, candidate, localBuild, paths));
    assert.equal(readInstalledLock(receipt, officialPath).id, candidate.id);
    await verifyDevkit(destination, readInstalledLock(receipt, officialPath));
    await verifyDevkit(join(transactions[0], "previous-sdk"), old);
    const rename = fs.renameSync;
    let failed = false;
    const replacementFailure = t.mock.method(fs, "renameSync", (from, to) => {
      if(!failed && to === destination && String(from).endsWith("-candidate")) { failed = true; throw new Error("simulated locked SDK destination"); }
      return rename(from, to);
    });
    syncBuiltinESMExports();
    try { await assert.rejects(activateToolchain(archive, candidate, null, paths), /locked SDK/); }
    finally { replacementFailure.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(failed, true);
    await verifyDevkit(destination, readInstalledLock(receipt, officialPath));
    assert.equal(readInstalledLock(receipt, officialPath).id, candidate.id, "failed replacement restores the previous local selection receipt");
    writeFileSync(officialPath, JSON.stringify({ ...old, id: "changed-official" }));
    assert.throws(() => readInstalledLock(receipt, officialPath), /different repository/);
    writeFileSync(officialPath, JSON.stringify(old));
    const record = JSON.parse(readFileSync(receipt, "utf8"));
    writeFileSync(receipt, JSON.stringify({ ...record, provenance: { ...record.provenance, upstreamCommit: "b".repeat(40) } }));
    assert.throws(() => readInstalledLock(receipt, officialPath), /provenance/);
    writeFileSync(receipt, JSON.stringify(record));
    // The source receipt never blesses later binary drift.
    writeFileSync(join(destination, "libNativeWrapper.dll"), "tampered");
    await assert.rejects(verifyDevkit(destination, readInstalledLock(receipt, officialPath)), /drift/);
    transactions.push(await activateToolchain(archive, candidate, null, paths));
    assert.equal(existsSync(receipt), false);await verifyDevkit(destination, candidate);
    assert.ok(existsSync(join(transactions[1], "previous-lock.json")));
    assert.equal(digest(officialPath), localBuild.officialLockSha256);
  } finally {
    if (existsSync(receipt)) unlinkSync(receipt);
    if (existsSync(destination)) removeTemporary(destination, cache);
    for (const transaction of transactions) removeTemporary(transaction, cache);
    removeTemporary(root, tmpdir());
  }
});
