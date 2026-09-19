import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertLayoutDocument } from "../src/domain/layoutDocument.js";
import { requestNativeSession } from "../src/native/nativeSession.js";
import { runNativeProcess } from "./runNativeProcess.js";
import { spawnSync } from "node:child_process";

const root = resolve("release/staging/windows-x64/Lumeria");
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
const proof: { origin: string; pid: number; ready: boolean; shutdown: boolean }[] = [];

// Immediately exit after preparation, including hidden login startup. A launcher
// exit code alone is insufficient: worker exceptions can still report exit 0.
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
  void running.finally(() => { exited = true; }).catch(() => {});
  try {
    let pid = 0;
    while (!controller.signal.aborted && !exited) {
      const state = await requestNativeSession({ data, installationRoot: root }, "status");
      if (state?.ready) { pid = state.pid; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(pid, "production entry must become ready");
    while (!controller.signal.aborted && !exited) {
      if (existsSync(join(data, "logs/native-runtime.log")) && journal().some(event => event.pid === pid && event.event === "startup-prepared")) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(!controller.signal.aborted && !exited, "production startup must complete");
    const modules=spawnSync("powershell.exe",["-NoProfile","-Command",`(Get-Process -Id ${pid} -ErrorAction Stop).Modules.ModuleName | ConvertTo-Json -Compress`],{windowsHide:true,encoding:"utf8"});
    assert.equal(modules.status,0,modules.stderr);
    assert.ok(!modules.stdout.toLowerCase().includes("lumeria_live_desktop.dll"),"default-off persisted Live Desktop must not load the DLL");
    assert.ok(!journal().some(event=>event.pid===pid&&event.event==="devtools-ready"),"production must not start a diagnostics server");
    await requestNativeSession({ data, installationRoot: root }, "shutdown");
    assert.equal(await running, 0);
    assert.equal(await requestNativeSession({ data, installationRoot: root }, "status"), null);
    assert.deepEqual(journal().filter(event => event.pid === pid && ["uncaught-exception", "unhandled-rejection", "fatal"].includes(event.event)), [], "runtime journal must contain no hidden shutdown failure");
    const saved = assertLayoutDocument(JSON.parse(readFileSync(join(data, "layout.json"), "utf8")));
    assert.equal(saved.pages[0]?.[0]?.id, "proof");
    proof.push({ origin, pid, ready: true, shutdown: true });
  } finally {
    clearTimeout(deadline);
    if (!exited) { controller.abort(); await running.catch(() => {}); }
  }
}
writeFileSync(join(data, "proof.json"), JSON.stringify(proof, null, 2));
console.log(`Staged manual/login startup, persistence and clean shutdown passed; evidence: ${data}`);
