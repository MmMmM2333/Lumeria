import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NativeDataHost } from "../src/native/nativeDataHost.js";
import { NativeLaunchError } from "../src/native/nativeDataProtocol.js";
import { assertLayoutDocument } from "../src/domain/layoutDocument.js";

// Exercise the real release sidecar and the unchanged production TS client.
// Never use the user's application data, installed launcher, or autostart settings.
const executable = resolve("target/release/lumeria_native_data.exe");
const dependencies = spawnSync("cargo", ["tree", "-p", "lumeria-native-data", "--edges", "normal,build", "--prefix", "none", "--locked", "--offline"], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
if (dependencies.error) throw dependencies.error;
assert.equal(dependencies.status, 0, dependencies.stderr);
assert.doesNotMatch(dependencies.stdout, /^(?:tauri(?:-[\w-]+)?|webview2(?:-[\w-]+)?)\s+v/m, "the actual sidecar normal/build graph must not depend on Tauri or WebView2");
mkdirSync("artifacts", { recursive: true });
const directory = mkdtempSync(resolve("artifacts/native-data-integration-"));
const env = { ...process.env, LUMERIA_NATIVE_DATA_DIR: directory };
const fixture = assertLayoutDocument(JSON.parse(readFileSync(new URL("../src/domain/fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8")));
const layout = assertLayoutDocument({ ...fixture, settings: { ...fixture.settings, scanRoots: [] } });
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=";
let host: NativeDataHost | undefined;
try {
  const requests = [
    { version: 1, id: 1, operation: "hello" },
    { version: 2, id: 2, operation: "loadLayout" },
    { version: 1, id: 3, operation: "unknown" },
    { version: 1, id: 4, operation: "saveLayout", layout },
    { version: 1, id: 5, operation: "saveLayout", layout: {} },
    { version: 1, id: 6, operation: "loadLayout" },
    { version: 1, id: 7, operation: "launchApp", appId: "" },
    { version: 1, id: 8, operation: "launchApp", appId: "injected", path: "C:/Injected.exe" },
    { version: 1, id: 9, operation: "autostart", enabled: true, executable: "C:/Injected.exe" },
  ];
  const raw = spawnSync(executable, [], {
    env, input: requests.map(request => JSON.stringify(request)).join("\n") + "\nnot json\n",
    encoding: "utf8", windowsHide: true, timeout: 30_000,
  });
  if (raw.error) throw raw.error;
  assert.equal(raw.status, 0, raw.stderr);
  const responses = raw.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { version: number; id: number; ok: boolean; value?: unknown; error?: unknown });
  assert.equal(responses.length, 10, "stdout contains exactly one JSON response per input line, including errors");
  assert.deepEqual(responses.map(response => response.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  assert.ok(responses.every(response => response.version === 1));
  assert.deepEqual(responses.map(response => response.ok), [true, false, false, true, false, true, false, false, false, false]);
  assert.deepEqual(responses[5]!.value, layout, "invalid writes preserve the existing layout");
  assert.deepEqual(responses[6]!.error, { kind: "missingLaunchInfo", detail: "App id is required" });

  const previous = process.env.LUMERIA_NATIVE_DATA_DIR;
  try {
    process.env.LUMERIA_NATIVE_DATA_DIR = directory;
    host = new NativeDataHost(executable);
  } finally {
    if (previous === undefined) delete process.env.LUMERIA_NATIVE_DATA_DIR;
    else process.env.LUMERIA_NATIVE_DATA_DIR = previous;
  }
  await host.connect();
  assert.equal(host.autostartAvailable, false, "development executable must not qualify as an installed product");
  await assert.rejects(host.autostart(), /installed native application/);
  assert.deepEqual(await host.loadLayout(), layout);
  await host.saveLayout(layout);
  assert.deepEqual(await host.loadLayout(), layout);

  const icon = await host.cacheCustomIcon(`data:image/png;base64,${png}`);
  assert.ok(icon.iconPath.startsWith(join(directory, "icons")));
  assert.deepEqual(readFileSync(icon.iconPath), Buffer.from(png, "base64"));
  assert.deepEqual(await host.cacheCustomIcon(`data:image/png;base64,${png}`), icon);
  await assert.rejects(host.cacheCustomIcon("not an image"));
  assert.deepEqual(await host.loadIconChoices(""), [], "missing icon targets keep the existing empty-choice semantics");
  const source = join(directory, "background.png");
  writeFileSync(source, Buffer.from(png, "base64"));
  const background = await host.background({ path: source });
  assert.ok(background);
  assert.ok(background.imagePath.startsWith(join(directory, "backgrounds")));
  assert.deepEqual(readFileSync(background.imagePath), readFileSync(source));
  await assert.rejects(host.background({ path: "relative.png" }));
  await assert.rejects(host.background({ rect: [0, 0, 0, 0] }));

  const scanDirectory = join(directory, "catalog");
  mkdirSync(scanDirectory);
  writeFileSync(join(scanDirectory, "Example.url"), "[InternetShortcut]\r\nURL=https://example.invalid/\r\n");
  const scan = await host.scanApps([{ id: "isolated", type: "customDirectory", label: "Isolated", path: scanDirectory, enabled: true }], {});
  assert.equal(scan.apps.length, 1);
  assert.equal(scan.apps[0]!.name, "Example");
  assert.deepEqual(await host.checkLaunchTargets([{ id: "missing", launchTarget: { kind: "executable", path: join(directory, "missing.exe") } }]), [{ id: "missing", status: "missing" }]);
  await assert.rejects(host.launchApp("does-not-exist"), error => error instanceof NativeLaunchError && error.kind === "missingLaunchInfo");
  writeFileSync(join(directory, "layout.json"), "{damaged");
  await assert.rejects(host.loadLayout(), /Failed to parse layout/);
  assert.equal(readFileSync(join(directory, "layout.json"), "utf8"), "{damaged", "a failed read must not overwrite damaged user data");
  rmSync(join(directory, "layout.json"));
  assert.equal(await host.loadLayout(), null);
  await host.saveLayout(layout);
  await host.dispose();
  await host.dispose();
  await assert.rejects(host.loadLayout(), /disposed/);
  host = undefined;
  console.log("Real Native data protocol, TS client, storage, scan, icon/background and shutdown integration passed");
} finally {
  await host?.dispose();
  rmSync(directory, { recursive: true, force: true });
}
