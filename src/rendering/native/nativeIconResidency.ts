import type { Container, Texture, WebGPURenderer } from "pixi.js";
import { createIconTextureRepository, type IconTextureItem, type IconTextureRepository } from "../pixi/assets/iconTextureRepository.js";
import { getNativeIconTextureSource } from "./nativeIconTextureSource.js";
import { NativeRecoverableIconSource, prepareNativeIconTextures } from "./nativeRecoverableIconSource.js";

// 800 distinct 256px icons with mipmaps occupy ~267 MiB. The measured 320 MiB
// ceiling avoids repeated decode/upload on normal large layouts; it is not a
// reservation, and offscreen LRU eviction still bounds larger source sets.
export const NATIVE_ICON_GPU_BUDGET = 320 * 1024 * 1024;
type Host = {
  readonly stage: Container;
  readonly renderer: WebGPURenderer;
  readonly state: string;
  invalidate(): void;
  beforeRender(prepare: () => void | Promise<void>): () => void;
};
type Entry = { source: NativeRecoverableIconSource; used: number };
export type NativeIconRepository = IconTextureRepository & {
  retainLayout(items: readonly (IconTextureItem | null | undefined)[], backgroundItems?:readonly IconTextureItem[]): void;
  prepareItems(items: readonly IconTextureItem[]): Promise<void>;
  prepareFrame(): void | Promise<void>;
  startBackground(): void;
  retainTemporary(item: IconTextureItem): () => void;
  retryFailedSources(): Promise<void>;
  isPreparing():boolean;
  residency(): { budgetBytes: number; gpuBytes: number; resident: number; backgroundPending: number };
};

/** Scene requests always enter the repository before the next background batch. */
export function createResidentIconRepository(host: Host, load: (source: string) => Promise<Texture>, budget = NATIVE_ICON_GPU_BUDGET): NativeIconRepository {
  if (!Number.isFinite(budget) || budget <= 0) throw new RangeError("Native icon GPU budget must be positive");
  const entries = new Map<string, Entry>();
  const foreground = new Set<string>();
  let layoutKeys: readonly (readonly [string | null | undefined, string | null])[] = [];
  let backgroundKeys:readonly (string|null)[]=[];
  let epoch = 0, disposed = false, enabled = false;
  let queue: IconTextureItem[] = [], timer: ReturnType<typeof setTimeout> | null = null, warming = false;
  let clock = 0, backgroundError: unknown;
  const resident = (source: NativeRecoverableIconSource) => {
    const data = source._gpuData[host.renderer.uid];
    return Boolean(data && "gpuTexture" in data && data.gpuTexture);
  };
  const bytes = (source: NativeRecoverableIconSource) => Math.ceil(source.pixelWidth * source.pixelHeight * 4 * 4 / 3);
  const live = () => {
    for (const [key, entry] of entries) if (entry.source.destroyed) entries.delete(key);
    return [...entries.values()];
  };
  const gpuBytes = () => live().reduce((total, entry) => total + (resident(entry.source) ? bytes(entry.source) : 0), 0);
  const stageSources = () => {
    const sources = new Set<NativeRecoverableIconSource>();
    const visit = (node: Container) => {
      if(!node.visible||!node.renderable)return;
      const source = (node as Container & { texture?: Texture }).texture?.source;
      if (source instanceof NativeRecoverableIconSource && !source.destroyed) sources.add(source);
      for (const child of node.children) visit(child);
    };
    visit(host.stage); return sources;
  };
  const trim = () => {
    const protectedSources = stageSources();
    let size = gpuBytes();
    for (const entry of live().sort((a, b) => a.used - b.used)) {
      if (size <= budget) break;
      if (!resident(entry.source) || protectedSources.has(entry.source)) continue;
      size -= bytes(entry.source); entry.source.unload();
    }
  };
  const base = createIconTextureRepository({
    maxConcurrentLoads: 4, resolveSource: getNativeIconTextureSource,
    isTextureInUse: texture => stageSources().has(texture.source as NativeRecoverableIconSource),
    loadTexture: async key => {
      const texture = await load(key);
      if (disposed) { texture.destroy(true); return texture; }
      const source = texture.source;
      if (!(source instanceof NativeRecoverableIconSource)) { texture.destroy(true); throw new Error("Native icon requires a recoverable source"); }
      entries.set(key, { source, used: ++clock });
      try {
        // Use the current renderer after asynchronous decoding; it may have recovered.
        if (host.state === "running") host.renderer.texture.getGpuSource(source);
        return texture;
      } catch (error) { texture.destroy(true); entries.delete(key); throw error; }
    },
  });
  function schedule() {
    if (!enabled || disposed || timer || warming || !queue.length) return;
    timer = setTimeout(() => { timer = null; void warm().catch(error => { backgroundError = error; host.invalidate(); }); }, host.state === "running" ? 16 : 250);
  }
  async function warm() {
    if (disposed || !enabled || warming) return;
    if (host.state !== "running" || base.pendingWork()) { schedule(); return; }
    if (gpuBytes() >= budget) { queue = []; return; }
    warming = true;
    const generation = epoch, started = performance.now(); let preparedBytes = 0;
    try {
      while (queue.length && !disposed && generation === epoch && host.state === "running"
        && gpuBytes() < budget && preparedBytes < 4 * 1024 * 1024 && performance.now() - started < 4) {
        const item = queue.shift()!, key = getNativeIconTextureSource(item);
        if (!key) continue;
        const existing = entries.get(key);
        if (existing && !existing.source.destroyed) continue;
        await base.prepare([item]);
        const entry = entries.get(key);
        if (entry) preparedBytes += bytes(entry.source);
        // Reaching the budget ends speculative decoding; trimming must not turn
        // this into a loop that decodes the entire layout while evicting it again.
        if (gpuBytes() >= budget) { queue = []; break; }
        // A foreground request may have arrived while this one decode was in flight.
        if (base.pendingWork()) break;
      }
    } finally { warming = false; if (!disposed) { trim(); schedule(); } }
  }
  function prepareFrame(): void | Promise<void> {
    if (disposed) return;
    if (backgroundError) throw backgroundError;
    const pending = base.pendingWork(foreground);
    if (pending) return pending.then(() => { host.invalidate(); });
    foreground.clear();
    const restoring = prepareNativeIconTextures(host.stage, host.renderer);
    const ready = () => {
      if (disposed) return;
      const sources = stageSources();
      for (const source of sources) {
        host.renderer.texture.getGpuSource(source);
      }
      for (const entry of entries.values()) if (sources.has(entry.source)) entry.used = ++clock;
      trim(); base.retireUnused(); schedule();
    };
    if (restoring) return restoring.then(ready);
    ready();
  }
  const offPrepare = host.beforeRender(prepareFrame);
  function retainLayout(items: readonly (IconTextureItem | null | undefined)[], backgroundItems:readonly IconTextureItem[]=items.filter((item):item is IconTextureItem=>Boolean(item))): void {
    if (disposed) return;
    if (items.length === layoutKeys.length && items.every((item, index) =>
      item?.id === layoutKeys[index]![0] && getNativeIconTextureSource(item) === layoutKeys[index]![1])
      &&backgroundItems.length===backgroundKeys.length&&backgroundItems.every((item,index)=>getNativeIconTextureSource(item)===backgroundKeys[index])) return;
    const keys = items.map(item => [item?.id, getNativeIconTextureSource(item)] as const);
    // This API has no asynchronous boundary or file IO; resolve in the same
    // scene commit observes the new ownership immediately.
    base.retain(items);
    layoutKeys = keys; backgroundKeys=backgroundItems.map(getNativeIconTextureSource);epoch++;
    const seen=new Set<string>();queue=backgroundItems.filter(item=>{const key=getNativeIconTextureSource(item);if(!key||seen.has(key))return false;seen.add(key);return true;});schedule();
  }
  return {
    resolve(item, onLoad, listenerKey) {
      const key = getNativeIconTextureSource(item), entry = key ? entries.get(key) : undefined;
      // Scene commit calls resolve before the host's beforeRender phase.
      if (key) foreground.add(key);
      if (entry) entry.used = ++clock;
      return base.resolve(item, onLoad, listenerKey);
    },
    async synchronize(items) {
      retainLayout(items);
      return base.snapshot();
    },
    retainLayout,
    retainTemporary:base.retainTemporary,
    retryFailedSources:base.retryFailedSources,
    prepareItems: base.prepare,
    snapshot: base.snapshot,
    prepareFrame,
    startBackground() { enabled = true; schedule(); },
    isPreparing(){return warming||queue.length>0||Boolean(base.pendingWork());},
    residency() { const current = live(); return { budgetBytes: budget, gpuBytes: gpuBytes(), resident: current.filter(entry => resident(entry.source)).length, backgroundPending: queue.length }; },
    dispose() { disposed = true; epoch++; if (timer) clearTimeout(timer); timer = null; queue = []; layoutKeys = []; foreground.clear(); offPrepare(); base.dispose(); entries.clear(); },
  };
}
