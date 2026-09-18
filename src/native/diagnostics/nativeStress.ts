import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { heapStats } from "bun:jsc";
import type { Container, Sprite } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { getNativePixiApplicationTesting } from "../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeFolderFlow } from "../../rendering/native/nativeFolderFlow.js";
import type { createNativeIconTextureRepository } from "../../rendering/native/nativeIconTextureLoader.js";
import type { ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import type { DesktopLayer } from "../../rendering/pixi/scene/DesktopLayer.js";
import type { IconNode } from "../../rendering/pixi/nodes/IconNode.js";
import { resolveNativePointerTarget } from "../../rendering/native/nativePointerTarget.js";
import type { createNativeEditing } from "../nativeEditing.js";
import { captureOwnedWindow } from "../nativeSettingsSmoke.js";
import { assertStressInventory, createStressRandom, parseNativeStressOptions, type NativeStressConfig } from "./nativeStressConfig.js";
import { inspectStressGeometry } from "./nativeStressGeometry.js";
import type { NativeBackground, NativeBackgroundConfig } from "../../rendering/native/NativeBackground.js";

type Context = {
  app: NativePixiApplication;
  background: NativeBackground;
  backgroundConfig(): NativeBackgroundConfig;
  scene: NativeDesktopScene;
  editing: ReturnType<typeof createNativeEditing>;
  folder: NativeFolderFlow;
  icons: ReturnType<typeof createNativeIconTextureRepository>;
  pages(): ReadonlyLaunchpadPages;
  page(index: number): boolean;
  folderPage(index: number): boolean;
  closeFolder(): boolean;
  show(): void;
  hide(): void;
  quit(): void;
};

class StressStopped extends Error {}

/** Commands use product controllers and native pointer events; no layout reset hides errors. */
export async function runNativeStress(o: Context): Promise<void> {
  const directory = process.env.LAUNCHPAD_NATIVE_STRESS_DIR!;
  if (!directory || !process.env.LUMERIA_NATIVE_DATA_DIR) throw new Error("Stress requires isolated data and an artifact directory");
  const raw = JSON.parse(readFileSync(join(directory, "config.json"), "utf8")) as NativeStressConfig;
  // Revalidate external configuration before running any commands.
  const config = parseNativeStressOptions([
    `--stress-mode=${raw.mode}`, `--stress-icons=${raw.icons}`, `--stress-cycles=${raw.cycles}`, `--stress-seed=${raw.seed}`,
    `--stress-idle-every=${raw.idleEvery}`, `--stress-idle-ms=${raw.idleMs}`, `--stress-settle-ms=${raw.settleMs}`,
    `--stress-screenshots-every=${raw.screenshotsEvery}`, ...(raw.exitOnFailure ? ["--stress-exit-on-failure"] : []),
    ...(raw.windowed ? ["--stress-windowed"] : []),
  ]);
  const { app, scene, editing } = o, testing = getNativePixiApplicationTesting(app);
  const random = createStressRandom(config.seed), started = performance.now();
  const expected = new Set(o.pages().flat().filter(item => item && item.type !== "folder").map(item => item!.id));
  assert.equal(expected.size, config.icons);
  let cycle = 0, phase = "startup", failure: Error | null = null, expectedLimit = false;
  let presented = 0, presentedGeneration = 0, lastFault = -Infinity, completed = 0;
  const frames: unknown[] = [];
  const emit = (file: string, value: object) => appendFileSync(join(directory, file), JSON.stringify({
    timeUtc: new Date().toISOString(), elapsedMs: performance.now() - started, cycle, phase, ...value,
  }) + "\n");
  const record = (action: string, value: object = {}) => emit("actions.jsonl", { action, presented, ...value });
  // Retain Pixi lifecycle warnings too; native-runtime.log only contains host events.
  const originalWarn = console.warn;
  let warningCount = 0;
  console.warn = (...args: unknown[]) => {
    warningCount++;
    if (warningCount <= 1000) record("console-warning", { message: args.map(String).join(" ").slice(0, 4000),
      stack: new Error("Pixi warning").stack, runtime: testing.diagnostics().runtime });
    originalWarn(...args);
  };
  const check = () => {
    if (failure) throw failure;
    if (existsSync(join(directory, "stop.request"))) throw new StressStopped("stop.request received");
    if (["closed", "closing"].includes(app.state)) throw new StressStopped("Application closed");
    if (app.state === "failed" && !expectedLimit) throw new Error(`Runtime failed: ${JSON.stringify(testing.diagnostics().lastError)}`);
  };
  const sleep = async (ms: number) => {
    const until = performance.now() + ms;
    do { check(); await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(50, until - performance.now())))); } while (performance.now() < until);
    check();
  };
  const wait = async (name: string, predicate: () => boolean, timeout = 20000) => {
    const until = performance.now() + timeout;
    while (!predicate()) { check(); if (performance.now() > until) throw new Error(`Timed out: ${name}`); await sleep(10); }
    check();
  };
  const present = async () => { const before = presented; app.invalidate(); await wait("new presented frame", () => presented > before); };
  const settled = async () => {
    await present();
    await wait("motion and edits settled", () => !scene.getMotionSnapshot().active && !editing.drag.isDragActive());
    await present();
  };
  const state = () => ({ runtime: testing.diagnostics().runtime, rendererUid: app.state === "running" ? app.renderer.uid : null,
    folder: { id: o.folder.snapshot().renderedFolder?.id ?? null, progress: o.folder.snapshot().openProgress,
      closing: o.folder.snapshot().isClosing, page: o.folder.snapshot().folderPageIndex },
    selection: { count: editing.selection.selectedCount.value, active: editing.selection.isActive.value },
    motion: scene.getMotionSnapshot(), icons: app.state === "running" ? o.icons.residency() : null,
    resourceSampleUnavailable: app.state === "running" ? null : `renderer unavailable in ${app.state}`,
    visible: app.window.isVisible(), presented, presentedGeneration });
  const nodes = () => {
    let count = 0, textNodes = 0, texturePixels = 0;
    const sources = new Set<number>();
    const visit = (node: Container) => {
      count++;
      for (const n of [node.position.x, node.position.y, node.scale.x, node.scale.y, node.rotation, node.alpha,
        node.worldTransform.a, node.worldTransform.b, node.worldTransform.c, node.worldTransform.d, node.worldTransform.tx, node.worldTransform.ty]) {
        if (!Number.isFinite(n)) throw new Error(`Non-finite scene transform: ${node.label}`);
      }
      if ("text" in node) textNodes++;
      const source = (node as Sprite).texture?.source;
      if (source && !sources.has(source.uid)) { sources.add(source.uid); texturePixels += source.pixelWidth * source.pixelHeight; }
      for (const child of node.children) visit(child);
    };
    visit(app.stage);
    return { count, textNodes, sceneTextureSources: sources.size, sceneTexturePixels: texturePixels,
      scope: "scene reachable sources; excludes renderer pools, driver allocations and total VRAM" };
  };
  const sample = (kind: string) => {
    const heap = heapStats();
    emit("metrics.jsonl", { kind, process: process.memoryUsage(),
      js: { heapSize: heap.heapSize, heapCapacity: heap.heapCapacity, objectCount: heap.objectCount, extraMemorySize: heap.extraMemorySize },
      nodes: nodes(), ...state() });
  };
  const screenshot = async (name: string) => {
    try {
      const details = await captureOwnedWindow(app.nativeWindowHandle, join(directory, `${name}.png`));
      record("os-screenshot", { name, details });
    } catch (error) { record("screenshot-unavailable", { name, error: String(error) }); }
  };
  const step = async (name: string, work: () => void | Promise<void>, details: object = {}) => {
    check(); phase = name; record("begin", details); await work(); check(); record("end");
  };
  const toggle = async (delay: number) => {
    record("hide", { delay, dragActive: editing.drag.isDragActive() }); o.hide(); await sleep(delay);
    record("show", { visible: app.window.isVisible(), desktopAlpha: scene.getDesktopAlpha() }); o.show();
    await wait("window reopened", () => app.window.isVisible() && app.state === "running"); await settled();
    await wait("desktop alpha", () => scene.getDesktopAlpha() > .99);
  };
  const layer = () => app.stage.getChildByLabel("launchpad-native-desktop", true) as DesktopLayer;
  const clickFolder = async (id: string) => {
    const node = app.stage.getChildByLabel(`launchpad-item:${id}`, true);
    assert.ok(node, `Missing folder node ${id}`);
    // Container bounds include labels and selection adornments; target the artwork.
    const { x, y } = (node as IconNode).visualWrap.toGlobal({ x: 0, y: 0 });
    app.nativeInput.emitPointer("pointermove", x, y, 0);
    assert.deepEqual(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(x, y)), { kind: "icon", id });
    record("pointer-click-folder", { id, x, y });
    app.nativeInput.emitPointer("pointerdown", x, y, 0); app.nativeInput.emitPointer("pointerup", x, y, 0);
    await wait("folder pointer activation", () => o.folder.snapshot().renderedFolder?.id === id);
  };
  const home = async () => {
    o.closeFolder(); editing.selection.clear(); o.show(); o.page(0); await settled();
    await wait("home fully revealed", () => scene.getDesktopAlpha() > .99);
    await wait("no folder", () => o.folder.snapshot().renderedFolder === null);
    assert.equal(layer().singleStageFolderLayer.visible, false, "Closed folder overlay revived");
    assertStressInventory(o.pages(), expected);
    const item = o.pages()[0]?.find(item => item !== null);
    assert.ok(item);
    const node = app.stage.getChildByLabel(`launchpad-item:${item.id}`, true); assert.ok(node);
    const { x, y } = (node as IconNode).visualWrap.toGlobal({ x: 0, y: 0 });
    app.nativeInput.emitPointer("pointermove", x, y, 0);
    assert.deepEqual(resolveNativePointerTarget(app.renderer.events.rootBoundary.hitTest(x, y)), { kind: "icon", id: item.id });
  };
  const recover = async (limited = false) => {
    if (!limited) await sleep(Math.max(0, 8000 - (performance.now() - lastFault)));
    const before = testing.diagnostics().runtime;
    lastFault = performance.now(); record("inject-device-lost", { before });
    testing.injectFault("device-lost"); app.invalidate();
    await wait("new device and presented frame", () => {
      const now = testing.diagnostics().runtime;
      return now.recoveryCount > before.recoveryCount && now.deviceGeneration > before.deviceGeneration
        && presentedGeneration === now.deviceGeneration && app.state === "running";
    });
    record("recovered", { after: testing.diagnostics().runtime });
  };

  writeFileSync(join(directory, "runtime.json"), JSON.stringify({ pid: process.pid, versions: process.versions, config,
    startedUtc: new Date().toISOString(), diagnostics: testing.diagnostics(), dataDirectory: process.env.LUMERIA_NATIVE_DATA_DIR }, null, 2));
  const offPresent = app.on("presented", event => {
    presented++; presentedGeneration = event.deviceGeneration;
    let geometry: unknown;
    if (!failure) try { geometry = inspectStressGeometry(app.stage).stats; } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); }
    frames.push({ at: performance.now() - started, cycle, phase, event, folder: o.folder.snapshot().renderedFolder?.id ?? null,
      overlayVisible: layer()?.singleStageFolderLayer.visible, motion: scene.getMotionSnapshot(), geometry });
    if (frames.length > 180) frames.shift();
  });
  const offFatal = app.on("fatal", event => {
    record("fatal", { type: event.type, message: event.message, stack: event.error instanceof Error ? event.error.stack : String(event.error) });
    if (!(expectedLimit && event.type === "recovery-limit")) failure = new Error(`${event.type}: ${event.message}`);
  });
  const offRecovered = app.on("recovered", event => record("recovery-event", { event }));
  const collectorLog = openSync(join(directory, "windows-memory.log"), "a");
  const script = process.env.LAUNCHPAD_NATIVE_STRESS_MEMORY_SCRIPT;
  const collector = script ? spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
    "-ProcessId", String(process.pid), "-DurationSeconds", "86400", "-IntervalSeconds", "1", "-OutputDirectory", directory],
  { windowsHide: true, stdio: ["ignore", collectorLog, collectorLog] }) : null;
  collector?.on("error", error => record("windows-memory-unavailable", { error: String(error) }));
  collector?.on("exit", code => record("windows-memory-exit", { code }));
  closeSync(collectorLog);
  const timer = setInterval(() => { if (!failure) try { sample("periodic"); } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); } }, 1000);
  let status: "passed" | "failed" | "stopped" = "passed", error: string | undefined;
  try {
    await step("warm-all-pages", async () => {
      for (let index = 0; index < o.pages().length; index++) { record("page", { index }); o.page(index); await settled(); }
      await home(); await sleep(config.settleMs); sample("baseline"); await screenshot("baseline");
    });
    if (config.mode === "background-recovery") {
      phase = "background-recovery";
      await (await import("./nativeBackgroundRecoverySmoke.js")).runNativeBackgroundRecoverySmoke({
        app, background: o.background, config: o.backgroundConfig(), directory, present, recover, screenshot,
      });
      completed = 1;
    } else if (config.mode === "recovery-limit") {
      phase = "recovery-limit";
      const firstFaultAt = performance.now();
      for (let index = 0; index < 5; index++) await recover(true);
      assert.ok(performance.now() - firstFaultAt < 29000, "Recovery too slow to test the 30s rate limit");
      expectedLimit = true; testing.injectFault("device-lost"); app.invalidate();
      await wait("recovery limit failure", () => app.state === "failed");
      assert.equal(testing.diagnostics().lastError?.type, "recovery-limit");
      record("expected-recovery-limit"); completed = 1;
    } else for (cycle = 1; cycle <= config.cycles; cycle++) {
      if (config.mode !== "recovery") {
        const count = [2, 20, 80, 200][(cycle - 1) % 4]!;
        const delay = [16, 80, 350][Math.floor(random() * 3)]!;
        await step("batch-create", async () => {
          const ids = o.pages().flat().filter(item => item && item.type !== "folder").slice(0, count).map(item => item!.id);
          editing.selection.begin({ initialIds: ids }); await present();
          assert.equal(editing.selection.selectedCount.value, count);
          assert.equal(editing.createFolder(), true);
          if (cycle % 4 === 0) await toggle(delay);
          await settled(); assertStressInventory(o.pages(), expected);
        }, { count, delay });
        const folder = o.pages().flat().find(item => item?.type === "folder");
        if (folder) {
          await step("folder-open-page-interrupt", async () => {
            o.page(0); await settled(); await clickFolder(folder.id); await sleep(delay);
            if (cycle % 2 === 0) {
              await toggle(delay);
              if (!o.folder.snapshot().renderedFolder) await clickFolder(folder.id);
            }
            await settled();
            const last = (o.folder.snapshot().renderedFolder?.childPages.length ?? 1) - 1;
            record("folder-page", { index: last }); o.folderPage(last); await sleep(delay); o.folderPage(0);
            if (config.mode === "mixed") await recover();
            o.closeFolder(); await sleep(delay); await toggle(delay); await settled();
            await wait("closed folder", () => o.folder.snapshot().renderedFolder === null);
          });
          await step("dissolve-folder", async () => {
            editing.pageCommands.dissolveFolderById(folder.id); await settled();
            assert.ok(!o.pages().flat().some(item => item?.type === "folder"), "Dissolve left a folder");
          });
        } else record("creation-cancelled-by-hide");
        await step("paging-burst-hide", async () => {
          const last = o.pages().length - 1;
          for (const index of [last, 0, Math.min(1, last), last, 0]) {
            record("page", { index }); o.page(index); await sleep([16, 80, 350][Math.floor(random() * 3)]!);
          }
          await toggle(delay);
        });
      } else await step("device-recovery", () => recover());
      await step("checkpoint", async () => {
        await home(); sample("active-end"); await sleep(config.settleMs); sample("settled");
        if (config.screenshotsEvery && cycle % config.screenshotsEvery === 0) await screenshot(`checkpoint-${cycle}`);
      });
      if (config.idleEvery && cycle % config.idleEvery === 0) await step("natural-gc-idle", async () => {
        await sleep(config.idleMs); sample("visible-idle"); o.hide();
        await wait("idle window hidden", () => !app.window.isVisible());
        await sleep(config.idleMs); sample("hidden-idle");
        o.show(); await home(); sample("after-idle-reopen");
      });
      completed++;
    }
    sample("final"); await screenshot("final");
  } catch (caught) {
    status = caught instanceof StressStopped ? "stopped" : "failed";
    error = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
    // Freeze the driver, not the app: no extra render, page change or GC before evidence.
    writeFileSync(join(directory, "failure.json"), JSON.stringify({ error, state: state(), diagnostics: testing.diagnostics(), frames, pages: o.pages() }, null, 2));
    await screenshot("failure");
  } finally {
    clearInterval(timer); offPresent(); offFatal(); offRecovered(); collector?.kill(); console.warn = originalWarn;
    writeFileSync(join(directory, "last-frames.json"), JSON.stringify(frames, null, 2));
    writeFileSync(join(directory, "result.json"), JSON.stringify({ status, error, completedCycles: completed, warningCount, config,
      elapsedMs: performance.now() - started, diagnostics: testing.diagnostics() }, null, 2));
    console.log(`Native stress ${status}: ${directory}${error ? `\n${error}` : ""}`);
  }
  if (status === "passed" || config.exitOnFailure) o.quit();
  else console.log("Stress actions stopped. Process preserved for inspection. Close the app or stop the launcher when finished.");
}
