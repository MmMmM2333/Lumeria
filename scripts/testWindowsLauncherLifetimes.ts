import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertLayoutDocument } from "../src/domain/layoutDocument.js";
import { NativeDataPipe } from "../src/native/nativeDataPipe.js";

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitUntil(check: () => boolean, message: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    assert.ok(Date.now() < deadline, message);
    await delay(20);
  }
}

async function stopFixture(pid: number): Promise<void> {
  if (!pid || !isAlive(pid)) return;
  try { process.kill(pid); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  await waitUntil(() => !isAlive(pid), `Fixture ${pid} did not exit`, 2_000);
}

/** Use the real data pipe and ShellExecuteExW without launching installed user apps. */
export async function testWindowsLauncherLifetimes(options: { root: string; launcher: string; data: string }): Promise<void> {
  const { root, launcher, data } = options;
  const source = join(root, "external_fixture.rs");
  const external = join(root, "外部 应用.exe");
  writeFileSync(source, `#![windows_subsystem = "windows"]
fn main() {
    let marker = std::env::args().nth(1).unwrap();
    if marker != "--descendant" {
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--descendant")
            .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
            .spawn().unwrap();
        std::fs::write(marker, format!("{} {}", std::process::id(), child.id())).unwrap();
    }
    std::thread::sleep(std::time::Duration::from_secs(60));
}`);
  const compile = spawnSync("rustc", ["--edition=2021", source, "-o", external], { encoding: "utf8", windowsHide: true });
  if (compile.error) throw compile.error;
  assert.equal(compile.status, 0, compile.stderr);
  const fixture = JSON.parse(readFileSync(new URL("../src/domain/fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8"));

  for (const kind of ["executable", "shortcut"] as const) {
    for (const mode of ["normal", "runtime-failure", "launcher-killed"] as const) {
      const label = `${kind}/${mode}`;
      const marker = join(root, `${kind}-${mode}.pids`);
      const release = join(root, `${kind}-${mode}.release`);
      const shortcut = join(root, "外部 应用.lnk");
      if (kind === "shortcut") {
        const script = `$ErrorActionPreference = 'Stop'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LUMERIA_FIXTURE_SHORTCUT)
$link.TargetPath = $env:LUMERIA_FIXTURE_EXECUTABLE
$link.Arguments = '"' + $env:LUMERIA_FIXTURE_MARKER + '"'
$link.WorkingDirectory = $env:LUMERIA_FIXTURE_DIRECTORY
$link.WindowStyle = 7
$link.Save()`;
        const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
          encoding: "utf8", windowsHide: true, timeout: 10_000,
          env: { ...process.env, LUMERIA_FIXTURE_SHORTCUT: shortcut, LUMERIA_FIXTURE_EXECUTABLE: external,
            LUMERIA_FIXTURE_MARKER: marker, LUMERIA_FIXTURE_DIRECTORY: root },
        });
        if (result.error) throw result.error;
        assert.equal(result.status, 0, result.stderr);
      }
      const layout = assertLayoutDocument({ ...fixture, settings: { ...fixture.settings, scanRoots: [] }, pages: [[{
        id: "external-lifetime", type: "manualApp", name: "External lifetime fixture", emoji: "E",
        launchTarget: { kind, path: kind === "shortcut" ? shortcut : external },
        ...(kind === "executable" ? { launchArgs: `"${marker}"` } : {}),
      }]] });
      const child = spawn(launcher, [], {
        env: { ...process.env, LUMERIA_NATIVE_DATA_DIR: data, LUMERIA_FIXTURE_RELEASE: release,
          LUMERIA_FIXTURE_EXIT_CODE: mode === "runtime-failure" ? "321" : "0" },
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      const exited = once(child, "exit");
      void exited.catch(() => {});
      let output = "", errors = "", channel: NativeDataPipe | undefined;
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { errors += chunk; });
      let dataPid = 0, runtimePid = 0, externalPids: number[] = [];
      try {
        await waitUntil(() => /^runtimePid=\d+/m.test(output) || child.exitCode !== null || child.signalCode !== null,
          `${label}: runtime fixture did not start (${errors})`);
        dataPid = Number(/^dataPid=(\d+)/m.exec(output)?.[1]);
        runtimePid = Number(/^runtimePid=(\d+)/m.exec(output)?.[1]);
        const pipe = /^dataPipe=(.+)/m.exec(output)?.[1]?.trim();
        assert.ok(dataPid && runtimePid && pipe, `${label}: fixture must report its service, runtime and pipe (${errors})`);
        channel = new NativeDataPipe(pipe);
        await channel.request("hello");
        await channel.request("saveLayout", { layout });
        await channel.request("launchApp", { appId: "external-lifetime" });
        await waitUntil(() => existsSync(marker), `${label}: external application did not start`);
        externalPids = readFileSync(marker, "utf8").trim().split(" ").map(Number);
        assert.equal(externalPids.length, 2);
        assert.ok(externalPids.every(pid => Number.isSafeInteger(pid) && pid > 0 && isAlive(pid)),
          `${label}: external application and descendant must be running before shutdown`);

        if (mode === "launcher-killed") {
          child.kill();
        } else {
          await channel.dispose();
          writeFileSync(release, "exit");
        }
        await waitUntil(() => child.exitCode !== null || child.signalCode !== null, `${label}: launcher did not exit`);
        const [code] = await exited;
        if (mode !== "launcher-killed") assert.equal(code, mode === "runtime-failure" ? 321 : 0, errors);
        await waitUntil(() => !isAlive(dataPid), `${label}: owned data service must be reaped`, 2_000);
        await delay(100);
        for (const pid of externalPids) assert.ok(isAlive(pid), `${label}: external process ${pid} must survive launcher shutdown`);
        console.log(`External application lifetime passed: ${label}, including its descendant`);
      } finally {
        await channel?.dispose();
        if (child.exitCode === null && child.signalCode === null) child.kill();
        if (!externalPids.length && existsSync(marker)) externalPids = readFileSync(marker, "utf8").trim().split(" ").map(Number);
        await Promise.all([dataPid, runtimePid, ...externalPids].map(stopFixture));
        await exited;
      }
    }
  }
}
