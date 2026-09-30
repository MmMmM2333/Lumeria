import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import type { NativeDataHost } from "../nativeDataHost.js";
import { captureSmokeFrame } from "../nativeSmokeSupport.js";
import { present, waitFor } from "../product/nativeScenePresentation.js";

export async function runNativeAutoScanSmoke(o: {
  app: NativePixiApplication; apps: ReturnType<typeof createLaunchpadApps>; data: NativeDataHost;
  pages(): ReadonlyLaunchpadPages; trigger(): void; openSettings(): void; closeSettings(): void;
  showLastPage(): void; pageSettled(): boolean;
  save(): Promise<void>; quit(): void; directory: string;
}) {
  const dataDirectory = process.env.LUMERIA_NATIVE_DATA_DIR;
  assert.ok(dataDirectory, "automatic scan diagnostics require isolated data");
  const root = o.apps.nativeIntegration.captureScanRequest().roots.find(root => root.type === "customDirectory");
  assert.ok(root); const within = relative(dataDirectory, root.path);
  assert.ok(!within.startsWith("..") && !isAbsolute(within), "only the isolated fixture root may be mutated");
  mkdirSync(o.directory, { recursive: true }); process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR = o.directory;
  const journal = () => readFileSync(join(dataDirectory, "logs/native-runtime.log"), "utf8").split("\n").filter(Boolean)
    .map(line => JSON.parse(line) as { event: string; detail: { changed?: boolean } }).filter(line => line.event === "catalog-refreshed");
  const scans: string[] = [], off = o.data.onCatalogScanComplete(key => scans.push(key));
  try {
    await o.save(); const beforePages = o.pages(), stamp = statSync(join(dataDirectory, "layout.json")).mtimeMs;
    let logged = journal().length;
    o.trigger(); await waitFor("unchanged catalog completes without layout reconciliation", () => journal().length > logged);
    assert.equal(journal().at(-1)!.detail.changed, false); assert.equal(o.pages(), beforePages);
    assert.equal(statSync(join(dataDirectory, "layout.json")).mtimeMs, stamp, "unchanged automatic results do not rewrite the layout");
    const completeCount = scans.length;
    o.apps.changeScanRootLabel(root.id, "Relabeled automatic source");
    await waitFor("source provenance relabeled", () => o.apps.imports.catalog.some(app => app.sources.some(source => source.rootLabel === "Relabeled automatic source")));
    assert.equal(scans.length, completeCount, "source-name edits avoid a new physical scan");
    await o.save(); await present(o.app, "relabeled source scene");
    o.openSettings(); await present(o.app, "automatic refresh waits behind settings");
    const oldPath = join(root.path, "Auto earlier.url"), latestPath = join(root.path, "Auto latest.url");
    const countBeforeBusy = scans.length; logged = journal().length;
    writeFileSync(oldPath, "[InternetShortcut]\r\nURL=https://example.invalid/auto-earlier\r\n");
    await waitFor("real directory notification starts a scan while settings are open", () => scans.length > countBeforeBusy);
    assert.equal(journal().length, logged, "a busy settings view defers catalog application");
    assert.ok(!o.apps.managedApps.value.some(app => app.name === "Auto earlier"));
    const countBeforeLatest = scans.length;
    rmSync(oldPath); writeFileSync(latestPath, "[InternetShortcut]\r\nURL=https://example.invalid/auto-latest\r\n");
    await waitFor("latest busy catalog scan completes", () => scans.length > countBeforeLatest);
    await captureSmokeFrame(o.app, "auto-scan-busy-settings");
    o.closeSettings();
    await waitFor("closing settings applies the latest automatic result", () => o.apps.managedApps.value.some(app => app.name === "Auto latest"));
    assert.ok(!o.apps.managedApps.value.some(app => app.name === "Auto earlier"), "the obsolete busy result never places an earlier app");
    await o.save(); o.showLastPage(); await present(o.app, "latest automatic application placed");
    await waitFor("new application page settled", o.pageSettled); await present(o.app, "new application page visible");
    await captureSmokeFrame(o.app, "auto-scan-latest");
    const latest = o.apps.managedApps.value.find(app => app.name === "Auto latest")!;
    const saved = await o.data.loadLayout(); assert.ok(saved);
    assert.ok(saved.pages.flat().some(item => item.id === latest.id), "automatic placement survives persistence");
    writeFileSync(join(o.directory, "result.json"), JSON.stringify({ passed: true, physicalScans: scans.length,
      unchangedLayoutRetained: true, labelEditWithoutScan: true, busyLatestOnly: true, persistedId: latest.id }, null, 2));
    o.quit();
  } finally { off(); }
}
