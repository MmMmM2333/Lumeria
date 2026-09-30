import assert from "node:assert/strict";
import { createNativeCatalogRefresh, isRelevantCatalogEvent } from "./nativeCatalogRefresh.js";
import { nativeCatalogCacheKey } from "./nativeCatalogCache.js";
import type { NativeCatalogRequest } from "./nativeCatalogIdentity.js";

const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function harness() {
  let now = 0, id = 0, opened = 0, closed = 0, busy = false;
  let request: NativeCatalogRequest | null = { roots: [{ id: "one", type: "customDirectory", label: "Root", path: "C:/fixture", enabled: true }], filters: {} };
  const timers = new Map<number, { at: number; run(): void }>();
  const watchers = new Map<string, { changed(event?: "rename" | "change", file?: string | null): void; fail(error: unknown): void }>();
  const scans: { at: number; labelsOnly: boolean; resolve(value: string): void; reject(error: Error): void }[] = [];
  const applied: string[] = [], errors: unknown[] = [];
  let apply: (value: string) => boolean | void | Promise<boolean | void> = value => { applied.push(value); };
  const refresh = createNativeCatalogRefresh({ request: () => request, now: () => now, canApply: () => !busy,
    scan: (_request, mode) => new Promise<string>((resolve, reject) => scans.push({ at: now, labelsOnly: mode.labelsOnly, resolve, reject })),
    apply: value => apply(value), report: error => errors.push(error),
    watchRoot: (path, changed, fail) => { opened++; watchers.set(path, { changed, fail }); return { close() { closed++; watchers.delete(path); } }; },
    schedule: (run, delay) => { const timer = ++id; timers.set(timer, { at: now + delay, run }); return () => { timers.delete(timer); }; },
  });
  const advance = (ms: number) => { const end = now + ms; for (;;) {
    const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break;
    now = next[1].at; timers.delete(next[0]); next[1].run();
  } now = end; };
  return { refresh, scans, applied, errors, timers, watchers, advance,
    event: (file?: string, event: "rename" | "change" = "change") => watchers.get("C:\\fixture")!.changed(event, file),
    request: () => request, change: (value: NativeCatalogRequest | null) => { request = value; refresh.sync(); },
    busy: (value: boolean) => { busy = value; }, apply: (value: typeof apply) => { apply = value; },
    get now() { return now; }, get opened() { return opened; }, get closed() { return closed; },
  };
}
const root = { id: "root", type: "customDirectory" as const, label: "Root", path: "C:/fixture", enabled: true, maxDepth: 1 };
assert.equal(isRelevantCatalogEvent(root, "change", "README.txt"), false);
assert.equal(isRelevantCatalogEvent(root, "change", "sub/app.exe"), true);
assert.equal(isRelevantCatalogEvent(root, "change", "sub/deeper/app.exe"), false);
assert.equal(isRelevantCatalogEvent(root, "rename", "folder.with.dot"), true, "renamed/deleted directories must not be mistaken for irrelevant files");
assert.equal(isRelevantCatalogEvent(root, "change", "desktop.ini"), true);
assert.equal(isRelevantCatalogEvent(root, "change", null), true);
assert.equal(isRelevantCatalogEvent({ ...root, type: "startMenuUser" }, "rename", "Startup/test.lnk"), false);
{
  const h = harness(); h.refresh.start(false);
  for (let i = 0; i < 100; i++) { h.event("trace.log"); h.advance(100); }
  assert.equal(h.scans.length, 0, "irrelevant change storms do not enumerate applications");
  for (let i = 0; i < 100; i++) { h.event("app.exe"); h.advance(100); }
  assert.equal(h.scans[0]!.at, 12_000, "continuous relevant notifications start a scan within two seconds");
  h.scans[0]!.resolve("obsolete"); await flush(); assert.equal(h.applied.length, 0);
  h.advance(0); h.scans[1]!.resolve("latest"); await flush(); assert.deepEqual(h.applied, ["latest"]); h.refresh.dispose();
}
{
  const h = harness(); h.refresh.start(false);
  h.change({ ...h.request()!, roots: [{ ...h.request()!.roots[0]!, label: "Renamed" }] });
  assert.equal(h.opened, 1); assert.equal(h.closed, 0, "labels do not rebind watchers");
  h.advance(250); assert.equal(h.scans[0]!.labelsOnly, true); h.scans[0]!.resolve("renamed"); await flush();
  h.change({ ...h.request()!, filters: { keywordBlacklist: ["uninstall"] } });
  assert.equal(h.opened, 1); h.advance(250); assert.equal(h.scans[1]!.labelsOnly, false);
  h.scans[1]!.resolve("filtered"); await flush();
  h.change({ ...h.request()!, roots: [{ ...h.request()!.roots[0]!, path: "C:/other" }] });
  assert.equal(h.opened, 2); assert.equal(h.closed, 1); h.refresh.dispose();
}
{
  const h = harness(); h.refresh.start(false); h.advance(299_000); h.event("app.exe"); h.advance(250);
  h.scans[0]!.resolve("same"); await flush(); h.advance(1_000);
  assert.equal(h.scans.length, 1, "success postpones the former fixed periodic deadline");
  h.advance(299_000); h.advance(250); assert.equal(h.scans.length, 2, "full calibration remains after five minutes from success");
  h.refresh.dispose(); h.scans[1]!.resolve("closed"); await flush(); assert.equal(h.applied.length, 1); assert.equal(h.timers.size, 0);
}
{
  const h = harness(); h.refresh.start(false); const key = nativeCatalogCacheKey(h.request()!.roots, {});
  h.event("app.exe"); h.advance(100); h.refresh.completed(key, h.now); h.advance(250);
  assert.equal(h.scans.length, 0, "manual completion covers events preceding its worker start");
  h.event("app.exe"); h.advance(100); h.refresh.completed(key, h.now - 200); h.advance(150);
  assert.equal(h.scans.length, 1, "changes during a manual scan still get a follow-up"); h.refresh.dispose();
}
{
  const h=harness();h.refresh.start(true);h.advance(250);h.event("app.exe");h.advance(100);
  const key=nativeCatalogCacheKey(h.request()!.roots,{});
  h.refresh.completed(key,h.now);h.scans[0]!.resolve("queued before newer event");await flush();
  assert.equal(h.applied.length,0);h.advance(250);assert.equal(h.scans.length,2,
    "completion cannot clear a running request's newer generation and leave its discarded result without a follow-up");
  h.scans[1]!.resolve("fresh result");await flush();assert.deepEqual(h.applied,["fresh result"]);h.refresh.dispose();
}
{
  const h = harness(); h.refresh.start(true); h.busy(true); h.advance(250); h.scans[0]!.resolve("first"); await flush();
  assert.deepEqual(h.applied, []); assert.equal(h.timers.size, 1, "busy results have no polling timer, only calibration");
  h.event("app.exe"); h.advance(250); h.scans[1]!.resolve("second"); await flush();
  h.busy(false); h.refresh.notifyReady(); await flush(); assert.deepEqual(h.applied, ["second"], "busy state holds only the latest result");
  h.apply(() => false); h.event("app.exe"); h.advance(250); h.scans[2]!.resolve("async busy"); await flush();
  h.apply(value => { h.applied.push(value); }); h.refresh.notifyReady(); await flush();
  assert.deepEqual(h.applied, ["second", "async busy"], "an asynchronous busy boundary retains its result"); h.refresh.dispose();
}
{
  const h = harness(); h.refresh.start(true); h.advance(250); h.scans[0]!.reject(new Error("offline")); await flush();
  h.event("app.exe"); h.advance(999); assert.equal(h.scans.length, 1, "new events do not bypass failure backoff");
  h.advance(1); h.scans[1]!.reject(new Error("offline")); await flush(); h.advance(1_999); assert.equal(h.scans.length, 2);
  h.advance(1); h.scans[2]!.resolve("restored"); await flush(); assert.deepEqual(h.applied, ["restored"]); assert.equal(h.errors.length, 1, "one failure episode reports once");
  h.refresh.dispose();
}
{
  const h=harness();h.refresh.start(false);const oldWatcher=h.watchers.get("C:\\fixture")!;
  h.advance(300_000);assert.equal(h.closed,1);const before=h.closed;
  oldWatcher.fail(new Error("late closed-watcher error"));oldWatcher.changed("change","app.exe");
  assert.equal(h.closed,before,"late errors from a replaced watcher cannot close its replacement");assert.equal(h.errors.length,0);
  h.refresh.dispose();
}
{
  const h=harness();h.change({...h.request()!,roots:[]});h.refresh.start(false);h.advance(600_000);
  assert.equal(h.scans.length,0);assert.equal(h.timers.size,0,"no enabled sources keep no calibration timer");h.refresh.dispose();
}
console.log("Catalog refresh: event filtering, maximum wait, stable watchers, success deadlines, manual coverage, latest-result application, backoff and disposal passed");
