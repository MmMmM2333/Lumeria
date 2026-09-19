import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { assertReleaseOutput } from "./windowsRelease.js";
import { readProductManifest } from "../src/native/runtimePaths.js";
import { requestNativeSession, type SessionStatus } from "../src/native/nativeSession.js";

if (!process.argv[2] || process.argv.length !== 3) throw new Error("Usage: smokeWindowsRuntime <staged product directory>");
const runtime = assertReleaseOutput(process.cwd(), resolve(process.argv[2]));
const manifest = readProductManifest(runtime);
const metadata = JSON.parse(readFileSync(join(runtime, "lumeria.json"), "utf8")) as { format: string };
if (metadata.format === "bytecode") {
  const app = join(runtime, "runtime/Resources/app/bun");
  const receipt = JSON.parse(readFileSync(join(app, "bytecode-manifest.json"), "utf8")) as { files: { name: string; size: number; sha256: string }[] };
  assert.ok(receipt.files.some(file => file.name === "index.js.jsc"));
  for (const file of receipt.files) {
    const bytes = readFileSync(join(app, file.name));
    assert.equal(bytes.length, file.size);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
}
mkdirSync(".codex-dev", { recursive: true });
const root = mkdtempSync(join(process.cwd(), ".codex-dev/runtime-smoke-"));
const data = join(root, "data"); mkdirSync(data);
const fixture = JSON.parse(readFileSync("src/domain/fixtures/layout-v2-roundtrip.json", "utf8")) as { pages: unknown[][]; settings: Record<string, unknown> };
fixture.pages = [[]];
Object.assign(fixture.settings, { scanRoots: [], mainWindowShortcut: null, backgroundSource: "systemMaterial", backgroundImagePath: null, windowEffectMaterial: "none", windowMode: "windowed" });
writeFileSync(join(data, "layout.json"), JSON.stringify(fixture));
const env = { ...process.env, LUMERIA_NATIVE_DATA_DIR: data, ELECTROBUN_CONSOLE: "1" };
const out = openSync(join(root, "stdout.log"), "w"), err = openSync(join(root, "stderr.log"), "w");
const child = spawn(join(runtime, "Lumeria.exe"), [], { env, windowsHide: true, stdio: ["ignore", out, err] });
const location = { data, installationRoot: runtime };
let status: SessionStatus | null = null;
try {
  await once(child, "spawn"); closeSync(out); closeSync(err);
  const deadline = Date.now() + 45_000;
  const log = join(data, "logs/native-runtime.log");
  while (Date.now() < deadline) {
    status = await requestNativeSession(location, "status");
    if (status?.ready && existsSync(log) && readFileSync(log, "utf8").includes('"event":"first-scene-presented"')) break;
    if (child.exitCode !== null) throw new Error(`Runtime exited early (${child.exitCode}): ${readFileSync(join(root, "stderr.log"), "utf8")}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(status?.ready && readFileSync(log, "utf8").includes('"event":"first-scene-presented"'), "the packaged runtime must present its first scene");
  assert.ok(!existsSync(join(runtime, "runtime/bin/app.log")));
  const stopped = spawnSync(join(runtime, "Lumeria.exe"), ["--lumeria-shutdown"], { env, windowsHide: true, encoding: "utf8", timeout: 45_000 });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(await requestNativeSession(location, "status"), null);
  writeFileSync(join(root, "proof.json"), JSON.stringify({ version: manifest.version, format: metadata.format, presented: true, shutdown: true, runtime, completed: true }, null, 2));
  console.log(`Packaged ${metadata.format} runtime smoke passed: ${root}`);
} finally {
  if (child.exitCode === null) {
    const stopped = spawnSync(join(runtime, "Lumeria.exe"), ["--lumeria-shutdown"], { env, windowsHide: true, timeout: 45_000 });
    if (stopped.status !== 0) { if (status?.pid) { try { process.kill(status.pid); } catch {} } child.kill(); }
  }
}
