import assert from "node:assert/strict";
import { once } from "node:events";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createCanvas } from "@napi-rs/canvas";
import { PRODUCT, WINDOWS_RELEASE } from "../src/platform/product.js";
import { NativeDataHost } from "../src/native/nativeDataHost.js";
import { requestNativeSession, type SessionStatus } from "../src/native/nativeSession.js";

type UiControl = { id: number; title: string; visible: boolean; enabled: boolean; checked?: number };
type UiWindow = { title: string; visible: boolean; enabled: boolean; controls: UiControl[] };
type UiResult = { windows: UiWindow[] };

if (process.platform !== "win32") throw new Error("Product integration tests require Windows");
const uiOnly = process.argv.includes("--ui-only");
if (process.argv.slice(2).some(argument => argument !== "--ui-only")) throw new Error("Usage: testWindowsProduct [--ui-only]");
mkdirSync(".codex-dev", { recursive: true });
const root = mkdtempSync(join(process.cwd(), ".codex-dev/windows-product-test-"));
const installed = join(root, "已安装 Lumeria");
const data = join(root, "isolated-data");
const setup = join(process.cwd(), "artifacts", `Lumeria-${PRODUCT.version}-x64-Setup.exe`);
const location = { data, installationRoot: installed };
const environment: NodeJS.ProcessEnv = { ...process.env, LUMERIA_NATIVE_DATA_DIR: data, ELECTROBUN_CONSOLE: "1", PYTHONIOENCODING: "utf-8" };
delete environment.LAUNCHPAD_NATIVE_DATA_HOST;
const entry = join(installed, WINDOWS_RELEASE.launcher);
const proof: string[] = [];
let snapshot = false, current: SessionStatus | null = null, launchCount = 0;
const uiChildren: ChildProcess[] = [];

function record(name: string): void {
  proof.push(name); console.log(`PASS: ${name}`);
  writeFileSync(join(root, "proof.json"), JSON.stringify({ root, checks: proof, completed: false }, null, 2));
}
function state(action: "Snapshot" | "Assert" | "AssertRuntime" | "Restore", runtimeProcessId?: number): void {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", join(process.cwd(), "scripts/windowsInstallerTestState.ps1"),
    "-Action", action, "-TestRoot", root, ...(action === "Assert" || action === "AssertRuntime" ? ["-InstallDirectory", installed, "-Version", PRODUCT.version] : []),
    ...(runtimeProcessId ? ["-RuntimeProcessId", String(runtimeProcessId)] : [])], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Product test ${action} failed: ${result.error ?? result.stderr}`);
  console.log(result.stdout.trim());
}
function execute(file: string, args: string[], installer = false): void {
  const result = spawnSync(file, args, { env: environment, windowsHide: true, windowsVerbatimArguments: installer, timeout: 90_000, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Product command failed (${file}): ${result.stderr}\n${result.stdout}`);
}
function ui(action: string, pid: number, ...values: string[]): UiResult {
  const result = spawnSync("python.exe", [join(process.cwd(), "scripts/windowsReleaseUi.py"), action, String(pid), ...values], { encoding: "utf8", windowsHide: true, env: environment, timeout: 15_000 });
  if (result.error || result.status !== 0) throw new Error(`UI check failed: ${result.error ?? result.stderr}`);
  return JSON.parse(result.stdout) as UiResult;
}
async function waitFor<T>(description: string, read: () => T | null | Promise<T | null>, timeout = 45_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${description}; evidence: ${root}`);
}
async function ready(previousPid?: number): Promise<SessionStatus> {
  current = await waitFor("the installed application", async () => {
    const status = await requestNativeSession(location, "status");
    return status?.ready && status.pid !== previousPid ? status : null;
  });
  return current;
}
async function launch(args: string[] = []): Promise<ChildProcess> {
  const out = openSync(join(root, `launch-${++launchCount}.stdout.log`), "w");
  const err = openSync(join(root, `launch-${launchCount}.stderr.log`), "w");
  const child = spawn(entry, args, { env: environment, cwd: installed, windowsHide: true, stdio: ["ignore", out, err] });
  try { await once(child, "spawn"); } finally { closeSync(out); closeSync(err); }
  return child;
}
async function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) { assert.equal(child.exitCode, 0); return; }
  const result = await Promise.race([once(child, "exit"), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Product entry did not exit")), 30_000))]);
  assert.equal(result[0], 0);
}
function trayId(pid: number): number {
  const entries = readFileSync(join(data, "logs/native-runtime.log"), "utf8").trim().split("\n").map(line => JSON.parse(line) as { event: string; pid: number; detail?: { trayId?: number } });
  const value = entries.filter(event => event.event === "ready" && event.pid === pid).at(-1)?.detail?.trayId;
  assert.ok(Number.isSafeInteger(value), "The ready journal must identify the owned tray");
  return value!;
}
async function visible(pid: number, expected: boolean): Promise<void> {
  await waitFor("native window visibility", () => {
    const windows = ui("state", pid).windows.filter(window => window.title === PRODUCT.name);
    return windows.length === 1 && windows[0]!.visible === expected ? true : null;
  });
}

try {
  state("Snapshot"); snapshot = true;
  mkdirSync(data);
  const fixture = JSON.parse(readFileSync("src/domain/fixtures/layout-v2-roundtrip.json", "utf8")) as { pages: unknown[][]; settings: Record<string, unknown> };
  fixture.pages = [[{ id: "release-proof", type: "manualApp", name: "安装验证", emoji: "🧭", launchTarget: { kind: "url", path: "https://example.invalid/release-test" } }]];
  fixture.settings.scanRoots = [];
  fixture.settings.mainWindowShortcut = null;
  fixture.settings.windowMode = "windowed";
  fixture.settings.windowEffectMaterial = "none";
  fixture.settings.showCustomTitlebar = true;
  fixture.settings.textless = false;
  const background = createCanvas(32, 32);
  const backgroundContext = background.getContext("2d");
  backgroundContext.fillStyle = "#182330";
  backgroundContext.fillRect(0, 0, 32, 32);
  const backgroundPath = join(data, "background.png");
  writeFileSync(backgroundPath, background.toBuffer("image/png"));
  fixture.settings.backgroundSource = "customImage";
  fixture.settings.backgroundImagePath = backgroundPath;
  fixture.settings.backgroundBaseOpacity = 100;
  fixture.settings.backgroundImageOpacity = 100;
  fixture.settings.backgroundEffect = "none";
  writeFileSync(join(data, "layout.json"), JSON.stringify(fixture));
  execute(setup, ["/S", `/D=${installed}`], true);
  state("Assert");
  record("Production installer installs the complete application into a Unicode path");
  let saved: unknown = JSON.parse(readFileSync(join(data, "layout.json"), "utf8"));
  if (uiOnly) {
    await launch();
    const running = await ready();
    state("AssertRuntime", running.pid);
    await visible(running.pid, true);
    ui("capture", running.pid, join(root, "installed-application.png"));
    ui("tray", running.pid, String(trayId(running.pid)), "settings");
    await new Promise(resolve => setTimeout(resolve, 500));
    ui("capture", running.pid, join(root, "installed-settings.png"));
    execute(entry, ["--lumeria-shutdown"]); current = null;
    saved = JSON.parse(readFileSync(join(data, "layout.json"), "utf8"));
    record("Application and settings render using self-contained fixture assets");
  }
  if (!uiOnly) {
  await launch();
  const first = await ready();
  state("AssertRuntime", first.pid);
  await visible(first.pid, true);
  ui("capture", first.pid, join(root, "installed-application.png"));
  record("Installed product entry starts the GPU application and bundled data service");
  await exited(await launch());
  assert.equal((await ready()).pid, first.pid);
  record("A second product entry activates the existing instance");
  ui("close", first.pid);
  await visible(first.pid, false);
  await exited(await launch(["--lumeria-autostart"]));
  await visible(first.pid, false);
  record("Login startup does not reopen an existing hidden window");
  await exited(await launch());
  await visible(first.pid, true);
  ui("tray", first.pid, String(trayId(first.pid)), "settings");
  await new Promise(resolve => setTimeout(resolve, 500));
  ui("capture", first.pid, join(root, "installed-settings.png"));
  saved = JSON.parse(readFileSync(join(data, "layout.json"), "utf8"));
  ui("tray", first.pid, String(trayId(first.pid)), "restart");
  const restarted = await ready(first.pid);
  assert.deepEqual(JSON.parse(readFileSync(join(data, "layout.json"), "utf8")), saved);
  await visible(restarted.pid, true);
  record("The real tray restart preserves layout and reopens the stable product entry");
  execute(entry, ["--lumeria-shutdown"]);
  assert.equal(await requestNativeSession(location, "status"), null);
  current = null;
  record("Product shutdown waits for the application and its launcher to exit");

  // Only the autostart RPC is sent in the real user profile. No layout or other
  // user content is read or written; the original registry values are restored.
  const host = new NativeDataHost(join(installed, WINDOWS_RELEASE.dataHost));
  try {
    await host.connect();
    assert.equal(host.autostartAvailable, true);
    assert.equal(await host.autostart(true), true);
    assert.equal(await host.autostart(), true);
    assert.equal(await host.autostart(false), false);
  } finally { await host.dispose(); }
  record("Installed native data service registers and verifies the stable autostart entry");

  await launch(["--lumeria-autostart"]);
  const login = await ready();
  await visible(login.pid, false);
  record("First login startup stays in the tray");
  execute(setup, ["/S", `/D=${installed}`], true);
  assert.equal(await requestNativeSession(location, "status"), null);
  current = null;
  assert.deepEqual(JSON.parse(readFileSync(join(data, "layout.json"), "utf8")), saved);
  state("Assert");
  record("Reinstall safely closes a running installed application and preserves data");
  }
  assert.ok(!existsSync(join(installed, "runtime/bin/app.log")), "runtime logs must not modify the installed payload");
  assert.ok(existsSync(join(data, "logs/app.log")), "native library logs belong to the user log directory");
  record("The runtime keeps its logs outside the installed payload");

  const wizard = spawn(setup, [], { env: environment, windowsHide: false, windowsVerbatimArguments: true, stdio: "ignore" });
  uiChildren.push(wizard);
  await once(wizard, "spawn");
  await waitFor("installer welcome", () => ui("state", wizard.pid!).windows.some(window => window.visible && window.enabled) ? true : null);
  const duringInstallation = spawnSync(entry, [], { env: environment, windowsHide: true, encoding: "utf8", timeout: 10_000 });
  assert.equal(duringInstallation.status, 1);
  assert.ok(duringInstallation.stderr.includes("InstallationInProgress"));
  record("The product entry refuses to start during an installation transaction");
  ui("capture", wizard.pid!, join(root, "installer-welcome.png"));
  ui("click", wizard.pid!, "1");
  const directoryState = ui("state", wizard.pid!);
  writeFileSync(join(root, "installer-directory.json"), JSON.stringify(directoryState, null, 2));
  ui("capture", wizard.pid!, join(root, "installer-directory.png"));
  assert.ok(directoryState.windows.some(window => window.controls.some(control => control.visible && control.title.replace(/[\\/]$/, "") === installed)), "the next installer must discover the existing custom installation directory");
  ui("click", wizard.pid!, "2");
  await new Promise(resolve => setTimeout(resolve, 100));
  if (wizard.exitCode === null) {
    const cancel = ui("state", wizard.pid!);
    if (cancel.windows.some(window => window.visible && window.enabled && window.controls.some(control => control.id === 6 && control.visible))) ui("click", wizard.pid!, "6");
  }
  await waitFor("installer cancellation", () => wizard.exitCode !== null ? true : null);
  record("Installer welcome and directory pages render correctly");

  const uninstall = spawn(join(installed, "uninstall.exe"), [`_?=${installed}`], { env: environment, windowsHide: false, windowsVerbatimArguments: true, stdio: "ignore" });
  uiChildren.push(uninstall);
  await once(uninstall, "spawn");
  await waitFor("uninstall confirmation", () => ui("state", uninstall.pid!).windows.some(window => window.visible && window.enabled) ? true : null);
  ui("click", uninstall.pid!, "1");
  const choices = ui("state", uninstall.pid!).windows.flatMap(window => window.controls).filter(control => control.visible && /permanently|永久/.test(control.title));
  assert.equal(choices.length, 1);
  assert.equal(choices[0]!.checked, 0);
  ui("capture", uninstall.pid!, join(root, "uninstaller-data-choice.png"));
  ui("click", uninstall.pid!, "2");
  await waitFor("uninstall cancellation", () => uninstall.exitCode !== null ? true : null);
  record("Uninstaller data deletion is visibly unchecked by default");
  execute(join(installed, "uninstall.exe"), ["/S", `_?=${installed}`], true);
  assert.ok(!existsSync(join(installed, "Lumeria.exe")));
  assert.deepEqual(JSON.parse(readFileSync(join(data, "layout.json"), "utf8")), saved);
  rmSync(join(installed, "uninstall.exe"), { force: true });
  rmdirSync(installed);
  record("Production uninstall removes installed files while preserving isolated data");
  writeFileSync(join(root, "proof.json"), JSON.stringify({ root, checks: proof, completed: true }, null, 2));
} finally {
  for (const child of uiChildren) if (child.exitCode === null) child.kill();
  if (!current) current = await requestNativeSession(location, "status").catch(() => null);
  if (current) {
    try { execute(entry, ["--lumeria-shutdown"]); }
    catch (error) {
      console.error("The isolated test runtime rejected cleanup:", error);
      // These PIDs came from the authenticated endpoint for this test directory.
      // Preserve the original test failure while releasing its isolated processes.
      for (const pid of [current.pid, current.launcherPid]) if (pid !== null) {
        try { process.kill(pid); } catch (stopError) { if ((stopError as NodeJS.ErrnoException).code !== "ESRCH") console.error(stopError); }
      }
    }
  }
  if (snapshot) state("Restore");
  console.log(`Product evidence: ${root}`);
}
