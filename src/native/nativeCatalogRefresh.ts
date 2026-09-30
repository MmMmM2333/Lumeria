import { watch } from "node:fs";
import { win32 } from "node:path";
import type { CatalogScanRoot } from "../domain/applicationCatalog.js";
import { nativeCatalogCacheKey } from "./nativeCatalogCache.js";
import { nativeCatalogEnumerationKey, type NativeCatalogRequest } from "./nativeCatalogIdentity.js";

type Change = (event?: "rename" | "change", filename?: string | null) => void;
type Options<T> = {
  request(): NativeCatalogRequest | null;
  scan(request: NativeCatalogRequest, mode: { labelsOnly: boolean; notBefore: number }): Promise<T>;
  /** false means interaction became busy during an asynchronous adoption. */
  apply(result: T, request: NativeCatalogRequest, current: () => boolean): void | boolean | Promise<void | boolean>;
  canApply?(): boolean;
  report(error: unknown): void;
  watchRoot?: (path: string, changed: Change, failed: (error: unknown) => void) => { close(): void };
  schedule?: (run: () => void, delay: number) => () => void;
  now?: () => number;
  intervalMs?: number;
};

function rootPath(root: CatalogScanRoot): string {
  const environment = new Map(Object.entries(process.env).map(([name, value]) => [name.toUpperCase(), value]));
  return win32.normalize(root.path.replace(/%([^%]+)%/g, (_, name: string) => environment.get(name.toUpperCase()) ?? `%${name}%`));
}

/** Unknown names and renames can be directory changes, including deleted paths.
 * Only discard events that cannot affect enumeration, identity or icon sources. */
export function isRelevantCatalogEvent(root: CatalogScanRoot, event?: string, filename?: string | null): boolean {
  if (!filename) return true;
  if (win32.isAbsolute(filename)) return true;
  const parts = filename.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.includes("..")) return true;
  const depth = root.maxDepth ?? (root.type === "customDirectory" ? 3 : 8);
  if (parts.length - 1 > Math.min(depth, 32)) return false;
  if ((root.type === "startMenuUser" || root.type === "startMenuSystem") && parts[0]?.toLowerCase() === "startup") return false;
  if (event !== "change") return true;
  const name = parts.at(-1)?.toLowerCase() ?? "";
  return name === "desktop.ini" || /\.(lnk|url|exe|dll|ico|png|bmp|svg|jpg|jpeg|webp)$/.test(name) || !win32.extname(name);
}

/** Notifications are hints; full successful scans reset calibration. Keep only
 * the latest valid result until an existing UI/state notification can apply it. */
export function createNativeCatalogRefresh<T>(options: Options<T>) {
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? ((run, delay) => { const timer = setTimeout(run, delay); timer.unref?.(); return () => clearTimeout(timer); });
  const watchRoot = options.watchRoot ?? ((path, changed, failed) => {
    const watcher = watch(path, { recursive: true, persistent: false }, (event, filename) => changed(event, filename));
    watcher.on("error", failed); return watcher;
  });
  const interval = options.intervalMs ?? 300_000;
  let disposed = false, started = false, running = false, applying = false, dirty = false, generation = 0, key = "";
  let request: NativeCatalogRequest | null = null, labelsOnly = false, firstDirtyAt: number | null = null;
  let retryAt = 0, failures = 0;
  let lastDirtyAt = 0;
  let readyRequested = false;
  let cancelPending = () => {}, cancelPeriodic = () => {};
  const watchers = new Map<string, { close(): void }>();
  let rootsByPath = new Map<string, { path: string; roots: CatalogScanRoot[] }>();
  let pending: { result: T; request: NativeCatalogRequest; current(): boolean } | null = null;

  function bindWatchers(force = false) {
    rootsByPath = new Map();
    for (const root of request?.roots ?? []) if (root.enabled && root.type !== "windowsAppCatalog") {
      const path = rootPath(root), id = path.toLowerCase(), entry = rootsByPath.get(id);
      if (entry) entry.roots.push(root); else rootsByPath.set(id, { path, roots: [root] });
    }
    for (const [id, watcher] of watchers) if (force || !rootsByPath.has(id)) { watcher.close(); watchers.delete(id); }
    for (const [id, { path }] of rootsByPath) if (!watchers.has(id)) {
      try {
        let binding: { close(): void };
        const current = () => !disposed && watchers.get(id) === binding;
        const watcher = watchRoot(path, (event, filename) => {
          if (current() && rootsByPath.get(id)?.roots.some(root => isRelevantCatalogEvent(root, event, filename))) trigger();
        }, error => {
          if (!current()) return;
          binding.close(); watchers.delete(id); options.report(error); trigger();
        });
        binding = { close: () => watcher.close() }; watchers.set(id, binding);
      } catch (error) { options.report(error); }
    }
  }
  function scheduleDirty() {
    cancelPending(); cancelPending = () => {};
    if (disposed || !started || running || !dirty) return;
    const due = Math.max(retryAt, Math.min(now() + 250, (firstDirtyAt ?? now()) + 2_000));
    cancelPending = schedule(() => { cancelPending = () => {}; void run(); }, Math.max(0, due - now()));
  }
  function queue(onlyLabels: boolean) {
    generation++; pending = null;
    labelsOnly = !dirty ? onlyLabels : labelsOnly && onlyLabels;
    dirty = true; lastDirtyAt = now(); firstDirtyAt ??= lastDirtyAt; scheduleDirty();
  }
  function trigger() { if (!disposed && started) queue(false); }
  function sync() {
    if (disposed) return;
    const nextRequest = options.request(), next = nextRequest ? nativeCatalogCacheKey(nextRequest.roots, nextRequest.filters) : "";
    if (next === key) return;
    const onlyLabels = Boolean(request && nextRequest && nativeCatalogEnumerationKey(request) === nativeCatalogEnumerationKey(nextRequest) && !running);
    request = nextRequest ? structuredClone(nextRequest) : null; key = next;
    generation++; pending = null; retryAt = 0; failures = 0;
    bindWatchers();
    if (started && request) queue(onlyLabels);
    if (!request) { dirty = false; firstDirtyAt = null; cancelPending(); cancelPeriodic(); }
  }
  function completed(scanKey: string, startedAt?: number) {
    if (disposed || !started || scanKey !== key || !request) return;
    // A manual scan covers notifications preceding its actual worker start.
    // Notifications arriving during that scan still require a later scan.
    if (!running && dirty && startedAt !== undefined && lastDirtyAt <= startedAt) {
      dirty = false; firstDirtyAt = null; labelsOnly = false; cancelPending();
    }
    failures = 0; retryAt = 0; cancelPeriodic();
    if (!request.roots.some(root => root.enabled)) return;
    cancelPeriodic = schedule(periodic, interval);
  }
  function notifyReady() {
    if (disposed) return;
    if (applying) { readyRequested = true; return; }
    if (!pending) return;
    if (!pending.current()) { pending = null; return; }
    if (options.canApply?.() === false) return;
    const selected = pending; pending = null; applying = true;
    void Promise.resolve().then(async () => {
      if (!selected.current()) return;
      const accepted = options.canApply?.() === false ? false : await options.apply(selected.result, selected.request, selected.current);
      if (accepted === false && selected.current() && !pending) pending = selected;
    }).catch(options.report).finally(() => {
      applying = false; const requested = readyRequested; readyRequested = false;
      if (pending && (pending !== selected || requested)) notifyReady();
    });
  }
  async function run() {
    if (disposed || running || !dirty) return;
    sync(); const scannedRequest = request;
    dirty = false; firstDirtyAt = null;
    if (!scannedRequest) return;
    const mode = { labelsOnly, notBefore: lastDirtyAt }; labelsOnly = false; running = true;
    const epoch = generation, scanKey = key;
    const current = () => !disposed && epoch === generation && scanKey === key;
    try {
      const result = await options.scan(scannedRequest, mode);
      if (!mode.labelsOnly) completed(scanKey);
      if (current()) { pending = { result, request: scannedRequest, current }; notifyReady(); }
    } catch (error) {
      if (current()) {
        if (!failures) options.report(error);
        failures++; retryAt = now() + Math.min(60_000, 1_000 * 2 ** Math.min(failures - 1, 6));
        dirty = true; firstDirtyAt = now();
      }
    } finally { running = false; scheduleDirty(); }
  }
  function periodic() {
    if (disposed || !request) return;
    bindWatchers(true);
    // An active complete scan will reset the deadline on success or back off.
    if (!running) trigger();
  }
  return {
    start(refresh: boolean) {
      if (started || disposed) return;
      sync(); started = true;
      if (request) { completed(key); if (refresh) trigger(); }
    },
    sync, trigger, completed, notifyReady,
    dispose() { disposed = true; generation++; pending = null; cancelPending(); cancelPeriodic(); for (const watcher of watchers.values()) watcher.close(); watchers.clear(); },
  };
}
