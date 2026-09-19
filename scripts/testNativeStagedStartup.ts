import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertLayoutDocument } from "../src/domain/layoutDocument.js";
import { requestNativeSession } from "../src/native/nativeSession.js";
import { runNativeProcess } from "./runNativeProcess.js";
import { spawnSync } from "node:child_process";
import { assertReleaseOutput } from "./windowsRelease.js";
import { readProductManifest } from "../src/native/runtimePaths.js";

const args = process.argv.slice(2);
if (args.length > 1 || args[0]?.startsWith("-")) throw new Error("Usage: testNativeStagedStartup [staged product directory]");
const root = assertReleaseOutput(process.cwd(), resolve(args[0] ?? "release/staging/windows-x64/Lumeria"));
const manifest = readProductManifest(root);
const metadata = JSON.parse(readFileSync(join(root, "lumeria.json"), "utf8")) as { format?: unknown; diagnostics?: unknown };
assert.equal(metadata.diagnostics, false, "startup tests require a production build");
assert.ok(metadata.format === "esm" || metadata.format === "bytecode", "unknown staged format");
if (metadata.format === "bytecode") {
  const app = realpathSync(join(root, "runtime/Resources/app/bun"));
  const receipt = JSON.parse(readFileSync(join(app, "bytecode-manifest.json"), "utf8")) as {
    files: { name: string; size: number; sha256: string }[];
  };
  assert.ok(Array.isArray(receipt.files) && receipt.files.some(file => file.name === "index.js.jsc"), "bytecode receipt must include index.js.jsc");
  const names = new Set<string>();
  for (const file of receipt.files) {
    assert.ok(typeof file.name === "string" && /^[\w.-]+$/.test(file.name) && file.name !== "." && file.name !== "..", "invalid bytecode filename");
    assert.ok(!names.has(file.name), "duplicate bytecode filename"); names.add(file.name);
    const path = join(app, file.name);
    assert.equal(realpathSync(path), path, "bytecode file must not be a link");
    const bytes = readFileSync(path);
    assert.equal(bytes.length, file.size, `bytecode size: ${file.name}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `bytecode hash: ${file.name}`);
  }
}
mkdirSync("artifacts", { recursive: true });
const data = mkdtempSync(resolve("artifacts/native-staged-startup-"));
const fixture = assertLayoutDocument(JSON.parse(readFileSync("src/domain/fixtures/layout-v2-roundtrip.json", "utf8")));
const layout = assertLayoutDocument({ ...fixture,
  pages: [[{ id: "proof", type: "manualApp", name: "Startup proof", emoji: "S", launchTarget: { kind: "url", path: "https://example.invalid/" } }]],
  settings: { ...fixture.settings, scanRoots: [], mainWindowShortcut: null, backgroundSource: "windowsLiveDesktop", backgroundEffect: "none", windowEffectMaterial: "none", windowMode: "windowed" },
});
writeFileSync(join(data, "layout.json"), JSON.stringify(layout));
type JournalEvent = { pid: number; event: string };
const journal = () => readFileSync(join(data, "logs/native-runtime.log"), "utf8").trim().split("\n").map(line => JSON.parse(line) as JournalEvent);
const proof: { origin: string; pid: number; ready: boolean; presented: boolean; shutdown: boolean }[] = [];

// Manual startup must present; hidden login startup only needs preparation.
// Exit status alone cannot detect worker failures recorded in the runtime journal.
for (const origin of ["manual", "login"]) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 45_000);
  const environment: NodeJS.ProcessEnv = { ...process.env, LUMERIA_NATIVE_DATA_DIR: data };
  delete environment.LAUNCHPAD_NATIVE_DATA_HOST;
  delete environment.LAUNCHPAD_NATIVE_MODE;
  delete environment.LUMERIA_EXPERIMENTAL_LIVE_DESKTOP;
  const running = runNativeProcess(join(root, "Lumeria.exe"), origin === "login" ? ["--lumeria-autostart"] : [],
    { cwd: root, env: environment, stdio: "inherit" }, controller.signal);
  let exited = false;
  void running.then(() => { exited = true; }, () => { exited = true; });
  try {
    let pid = 0;
    while (!controller.signal.aborted && !exited) {
      const state = await requestNativeSession({ data, installationRoot: root }, "status");
      if (state?.ready) { pid = state.pid; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(pid, "production entry must become ready");
    while (!controller.signal.aborted && !exited) {
      if (existsSync(join(data, "logs/native-runtime.log"))) {
        const events = journal().filter(event => event.pid === pid);
        if (events.some(event => event.event === "startup-prepared")
          && (origin === "login" || events.some(event => event.event === "first-scene-presented"))) break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(!controller.signal.aborted && !exited, "production startup must complete and manual startup must present");
    const presented = journal().some(event => event.pid === pid && event.event === "first-scene-presented");
    assert.ok(!existsSync(join(root, "runtime/bin/app.log")), "runtime must not write logs in the installation directory");
    const modules=spawnSync("powershell.exe",["-NoProfile","-Command",`(Get-Process -Id ${pid} -ErrorAction Stop).Modules.ModuleName | ConvertTo-Json -Compress`],{windowsHide:true,encoding:"utf8"});
    assert.equal(modules.status,0,modules.stderr);
    assert.ok(!modules.stdout.toLowerCase().includes("lumeria_live_desktop.dll"),"default-off persisted Live Desktop must not load the DLL");
    assert.ok(!journal().some(event=>event.pid===pid&&event.event==="devtools-ready"),"production must not start a diagnostics server");
    if (origin === "manual") {
      assert.equal(await runNativeProcess(join(root, "Lumeria.exe"), ["--lumeria-shutdown"],
        { cwd: root, env: environment, stdio: "inherit" }, controller.signal), 0, "launcher shutdown command must succeed");
    } else await requestNativeSession({ data, installationRoot: root }, "shutdown");
    assert.equal(await running, 0);
    assert.equal(await requestNativeSession({ data, installationRoot: root }, "status"), null);
    assert.deepEqual(journal().filter(event => event.pid === pid && ["uncaught-exception", "unhandled-rejection", "fatal"].includes(event.event)), [], "runtime journal must contain no hidden shutdown failure");
    const saved = assertLayoutDocument(JSON.parse(readFileSync(join(data, "layout.json"), "utf8")));
    assert.equal(saved.pages[0]?.[0]?.id, "proof");
    proof.push({ origin, pid, ready: true, presented, shutdown: true });
  } finally {
    clearTimeout(deadline);
    if (!exited) { controller.abort(); await running.catch(() => {}); }
  }
}
writeFileSync(join(data, "proof.json"), JSON.stringify({ runtime: root, version: manifest.version, format: metadata.format, checks: proof }, null, 2));
console.log(`Staged ${metadata.format} manual/login startup, persistence and clean shutdown passed; evidence: ${data}`);
