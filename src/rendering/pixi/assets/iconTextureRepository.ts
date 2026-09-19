import { Texture } from "pixi.js";
import {
  getPixiIconTextureSource,
  isTauriAssetIconSource,
} from "./iconTextureSourceAdapter.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import {
  hashDebugSample,
  makeDebugSourceSnapshot,
} from "../renderDebugFingerprint.js";

export type IconTextureItem = Readonly<{
  customIconDataUrl?: string | null;
  customIconPath?: string | null;
  customIconUrl?: string | null;
  iconDataUrl?: string | null;
  iconPath?: string | null;
  iconUrl?: string | null;
  id?: string | null;
}>;

export type IconTextureRepositorySnapshot = Readonly<{
  activeCount: number;
  cached: readonly Readonly<{
    source: unknown;
    sourceDestroyed: boolean;
    sourcePixelHeight: number | null;
    sourcePixelWidth: number | null;
    retainedPixelBytes: number | null;
    retainedEncodedBytes: number;
    sourceUid: number | null;
    textureDestroyed: boolean;
    textureUid: number | null;
  }>[];
  estimatedBytes: number;
  failed: readonly unknown[];
  generation: number;
  observerErrors: readonly unknown[];
  pending: readonly unknown[];
  recentErrors: readonly unknown[];
  replacementFallbackCount: number;
}>;

export type IconTextureRepository = Readonly<{
  dispose: () => void;
  resolve: (item: IconTextureItem | null | undefined, onLoad?: (() => void) | null, listenerKey?: unknown) => Texture | null;
  snapshot: () => IconTextureRepositorySnapshot;
  synchronize: (items: readonly (IconTextureItem | null | undefined)[]) => Promise<IconTextureRepositorySnapshot>;
}>;

type RepositoryOptions = Readonly<{
  loadTexture?: (source: string) => Promise<Texture>;
  maxConcurrentLoads?: number;
  resolveSource?: (item: IconTextureItem | null | undefined) => string | null;
  scheduleAfterFrame?: (callback: () => void) => void;
  isTextureInUse?: (texture: Texture) => boolean;
}>;

type TextureErrorEntry = Readonly<{
  error: string;
  source: unknown;
  time: number;
}>;

const TEXTURE_ERROR_LIMIT = 16;
const MIPMAP_BYTE_FACTOR = 4 / 3;

function makeTextureErrorDebugMessage(source: string, error: unknown): string {
  const sourceLabel = `[icon-source:${hashDebugSample(source)}]`;
  const rawError = error instanceof Error ? error.message : String(error || "Unknown icon texture load error");
  let message = source ? rawError.split(source).join(sourceLabel) : rawError;
  message = message.replace(/data:image\/[^\s"'<>)]*/gi, "[redacted-data-url]");
  if (message.length <= 512) return message;
  return `Icon texture error message fingerprint=${hashDebugSample(message)} length=${message.length}`;
}

function makeTextureErrorEntry(source: string, error: unknown): TextureErrorEntry {
  return Object.freeze({
    error: makeTextureErrorDebugMessage(source, error),
    source: makeDebugSourceSnapshot(source),
    time: Date.now(),
  });
}

function appendBounded<T>(entries: T[], entry: T): void {
  entries.push(entry);
  if (entries.length > TEXTURE_ERROR_LIMIT) entries.splice(0, entries.length - TEXTURE_ERROR_LIMIT);
}

function loadTextureFromImage(source: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    if (isTauriAssetIconSource(source)) image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        resolve(Texture.from({
          autoGenerateMipmaps: true,
          resource: image,
        }, true));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Failed to load icon texture"));
    image.src = source;
  });
}

function scheduleAfterRenderFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }
  globalThis.queueMicrotask(callback);
}

function destroyTexture(texture: Texture | null | undefined): void {
  if (!texture || texture.destroyed) return;
  texture.destroy(true);
}

function makeItemKey(item: IconTextureItem, source: string): string {
  const id = String(item.id || "").trim();
  return id || `@source:${source}`;
}

export function createIconTextureRepository(options: RepositoryOptions = {}): IconTextureRepository & {
  retain(items: readonly (IconTextureItem | null | undefined)[]): void;
  retireUnused(): void;
  prepare(items: readonly IconTextureItem[]): Promise<void>;
  pendingWork(sources?: ReadonlySet<string>): Promise<void> | undefined;
} {
  const loadTexture = options.loadTexture || loadTextureFromImage;
  const maxConcurrentLoads = options.maxConcurrentLoads ?? Infinity;
  if (maxConcurrentLoads !== Infinity && (!Number.isInteger(maxConcurrentLoads) || maxConcurrentLoads < 1)) {
    throw new RangeError("Texture load concurrency must be a positive integer");
  }
  let activeLoads = 0;
  let drainingLoads = false;
  const queuedLoads: { start: () => void; cancel: () => void }[] = [];
  const resolveSource = options.resolveSource || getPixiIconTextureSource;
  const scheduleAfterFrame = options.scheduleAfterFrame || scheduleAfterRenderFrame;
  const cachedTextures = new Map<string, Texture>();
  const failedTextureSources = new Set<string>();
  const textureLoadFailureCounts = new Map<string, number>();
  const pendingTextureLoads = new Map<string, Promise<void>>();
  const textureLoadListeners = new Map<string, Map<unknown, () => void>>();
  const currentSourceByItemKey = new Map<string, string>();
  const fallbackSourceByItemKey = new Map<string, string>();
  const activeSourceCounts = new Map<string, number>();
  const scheduledRetirements = new Set<string>();
  const recentTextureErrors: TextureErrorEntry[] = [];
  const recentTextureObserverErrors: TextureErrorEntry[] = [];
  let generation = 0;

  function recordTextureError(source: string, error: unknown): TextureErrorEntry {
    const entry = makeTextureErrorEntry(source, error);
    appendBounded(recentTextureErrors, entry);
    return entry;
  }

  function recordTextureObserverError(source: string, error: unknown): TextureErrorEntry {
    const entry = makeTextureErrorEntry(source, error);
    appendBounded(recentTextureObserverErrors, entry);
    return entry;
  }

  function notifyTextureLoadSettled(source: string): void {
    const listeners = textureLoadListeners.get(source);
    textureLoadListeners.delete(source);
    if (!listeners) return;
    for (const listener of listeners.values()) {
      try {
        listener();
      } catch (error) {
        const diagnostic = recordTextureObserverError(source, error);
        console.error("Icon texture settlement observer failed", diagnostic);
      }
    }
  }

  function addTextureLoadListener(source: string, listener?: (() => void) | null, listenerKey: unknown = listener): void {
    if (typeof listener !== "function") return;
    let listeners = textureLoadListeners.get(source);
    if (!listeners) {
      listeners = new Map();
      textureLoadListeners.set(source, listeners);
    }
    listeners.set(listenerKey, listener);
  }

  function isFallbackSource(source: string): boolean {
    for (const fallbackSource of fallbackSourceByItemKey.values()) {
      if (fallbackSource === source) return true;
    }
    return false;
  }

  function isSourceRetained(source: string): boolean {
    const texture = cachedTextures.get(source);
    return (activeSourceCounts.get(source) || 0) > 0 || isFallbackSource(source)
      || Boolean(texture && options.isTextureInUse?.(texture));
  }

  function retireSourceAfterFrame(source: string): void {
    if (!source || scheduledRetirements.has(source)) return;
    scheduledRetirements.add(source);
    scheduleAfterFrame(() => {
      scheduledRetirements.delete(source);
      if (isSourceRetained(source)) return;
      const texture = cachedTextures.get(source);
      if (texture) {
        cachedTextures.delete(source);
        destroyTexture(texture);
      }
      failedTextureSources.delete(source);
      textureLoadFailureCounts.delete(source);
      textureLoadListeners.delete(source);
    });
  }

  function retireUnreferencedSources(): void {
    for (const source of cachedTextures.keys()) {
      if (!isSourceRetained(source)) retireSourceAfterFrame(source);
    }
    for (const source of failedTextureSources) {
      if (isSourceRetained(source)) continue;
      failedTextureSources.delete(source);
      textureLoadFailureCounts.delete(source);
    }
  }

  function promoteReadyReplacements(source: string): void {
    const retiredFallbacks = new Set<string>();
    for (const [itemKey, fallbackSource] of fallbackSourceByItemKey) {
      if (currentSourceByItemKey.get(itemKey) !== source || !cachedTextures.has(source)) continue;
      fallbackSourceByItemKey.delete(itemKey);
      retiredFallbacks.add(fallbackSource);
    }
    for (const fallbackSource of retiredFallbacks) {
      if (!isSourceRetained(fallbackSource)) retireSourceAfterFrame(fallbackSource);
    }
  }

  function drainLoads(): void {
    if (drainingLoads) return;
    drainingLoads = true;
    try {
      while (activeLoads < maxConcurrentLoads && queuedLoads.length) queuedLoads.shift()!.start();
    } finally {
      drainingLoads = false;
    }
  }

  function requestTextureLoad(source: string): Promise<void> {
    if (cachedTextures.has(source) || failedTextureSources.has(source)) return Promise.resolve();
    const existing = pendingTextureLoads.get(source);
    if (existing) return existing;
    const loadGeneration = generation;
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => { settle = resolve; });
    const finish = () => {
      if (pendingTextureLoads.get(source) === pending) pendingTextureLoads.delete(source);
      settle();
    };
    pendingTextureLoads.set(source, pending);
    queuedLoads.push({
      cancel: finish,
      start: () => {
        // Layout replacement and disposal can obsolete work before it reaches IO.
        if (loadGeneration !== generation || (!isSourceRetained(source) && !textureLoadListeners.has(source))) {
          finish();
          return;
        }
        activeLoads += 1;
        void (async () => {
          try {
            const texture = await loadTexture(source);
            if (loadGeneration !== generation || (!isSourceRetained(source) && !textureLoadListeners.has(source))) {
              destroyTexture(texture);
              return;
            }
            cachedTextures.set(source, texture);
            failedTextureSources.delete(source);
            textureLoadFailureCounts.delete(source);
            promoteReadyReplacements(source);
            notifyTextureLoadSettled(source);
          } catch (error: unknown) {
            if (loadGeneration !== generation) return;
            const diagnostic = recordTextureError(source, error);
            console.error("Failed to load icon texture", diagnostic);
            const failureCount = (textureLoadFailureCounts.get(source) || 0) + 1;
            textureLoadFailureCounts.set(source, failureCount);
            if (!isTauriAssetIconSource(source) || failureCount >= 2) failedTextureSources.add(source);
            notifyTextureLoadSettled(source);
          } finally {
            activeLoads -= 1;
            finish();
            drainLoads();
          }
        })();
      },
    });
    drainLoads();
    return pending;
  }

  function resolve(
    item: IconTextureItem | null | undefined,
    onLoad?: (() => void) | null,
    listenerKey: unknown = onLoad,
  ): Texture | null {
    const source = resolveSource(item);
    if (!source) return null;
    const cached = cachedTextures.get(source);
    if (cached) return cached;
    if (!failedTextureSources.has(source)) {
      addTextureLoadListener(source, onLoad, listenerKey);
      void requestTextureLoad(source);
    }
    const itemKey = makeItemKey(item || {}, source);
    const fallbackSource = fallbackSourceByItemKey.get(itemKey);
    return fallbackSource ? cachedTextures.get(fallbackSource) || null : null;
  }

  function retain(
    items: readonly (IconTextureItem | null | undefined)[],
  ): void {
    const nextSourceByItemKey = new Map<string, string>();
    const nextActiveSourceCounts = new Map<string, number>();
    for (const item of items || []) {
      if (!item) continue;
      const source = resolveSource(item);
      if (!source) continue;
      const itemKey = makeItemKey(item, source);
      nextSourceByItemKey.set(itemKey, source);
      nextActiveSourceCounts.set(source, (nextActiveSourceCounts.get(source) || 0) + 1);
    }

    for (const [itemKey, previousSource] of currentSourceByItemKey) {
      const nextSource = nextSourceByItemKey.get(itemKey);
      if (!nextSource) {
        fallbackSourceByItemKey.delete(itemKey);
        continue;
      }
      if (nextSource === previousSource) continue;
      const existingFallback = fallbackSourceByItemKey.get(itemKey);
      if (cachedTextures.has(previousSource)) fallbackSourceByItemKey.set(itemKey, previousSource);
      else if (!existingFallback || !cachedTextures.has(existingFallback)) fallbackSourceByItemKey.delete(itemKey);
    }

    currentSourceByItemKey.clear();
    for (const [itemKey, source] of nextSourceByItemKey) currentSourceByItemKey.set(itemKey, source);
    activeSourceCounts.clear();
    for (const [source, count] of nextActiveSourceCounts) activeSourceCounts.set(source, count);

    for (const source of nextActiveSourceCounts.keys()) promoteReadyReplacements(source);
    retireUnreferencedSources();
  }

  async function synchronize(items: readonly (IconTextureItem | null | undefined)[]): Promise<IconTextureRepositorySnapshot> {
    retain(items);
    await Promise.allSettled(Array.from(activeSourceCounts.keys(), requestTextureLoad));
    retireUnreferencedSources();
    return snapshot();
  }

  function estimateTextureBytes(texture: Texture): number {
    const width = Number(texture.source?.pixelWidth) || 0;
    const height = Number(texture.source?.pixelHeight) || 0;
    if (!width || !height) return 0;
    return Math.round(width * height * 4 * MIPMAP_BYTE_FACTOR);
  }

  function snapshot(): IconTextureRepositorySnapshot {
    const cached = Array.from(cachedTextures.entries()).map(([source, texture]) => Object.freeze({
      source: makeDebugSourceSnapshot(source),
      sourceDestroyed: texture.source?.destroyed === true,
      sourcePixelHeight: texture.source?.pixelHeight ?? null,
      sourcePixelWidth: texture.source?.pixelWidth ?? null,
      retainedPixelBytes: ArrayBuffer.isView(texture.source?.resource) ? texture.source.resource.byteLength : null,
      retainedEncodedBytes: (texture.source as { retainedEncodedBytes?: number } | undefined)?.retainedEncodedBytes ?? 0,
      sourceUid: texture.source?.uid ?? null,
      textureDestroyed: texture.destroyed === true,
      textureUid: texture.uid ?? null,
    }));
    return Object.freeze({
      activeCount: activeSourceCounts.size,
      cached: Object.freeze(cached),
      estimatedBytes: Array.from(cachedTextures.values()).reduce((total, texture) => total + estimateTextureBytes(texture), 0),
      failed: Object.freeze(Array.from(failedTextureSources, makeDebugSourceSnapshot)),
      generation,
      observerErrors: Object.freeze(recentTextureObserverErrors.map((entry) => Object.freeze({ ...entry }))),
      pending: Object.freeze(Array.from(pendingTextureLoads.keys(), makeDebugSourceSnapshot)),
      recentErrors: Object.freeze(recentTextureErrors.map((entry) => Object.freeze({ ...entry }))),
      replacementFallbackCount: fallbackSourceByItemKey.size,
    });
  }

  function dispose(): void {
    generation += 1;
    for (const load of queuedLoads.splice(0)) load.cancel();
    for (const texture of cachedTextures.values()) destroyTexture(texture);
    cachedTextures.clear();
    failedTextureSources.clear();
    textureLoadFailureCounts.clear();
    pendingTextureLoads.clear();
    textureLoadListeners.clear();
    currentSourceByItemKey.clear();
    fallbackSourceByItemKey.clear();
    activeSourceCounts.clear();
    scheduledRetirements.clear();
    recentTextureErrors.length = 0;
    recentTextureObserverErrors.length = 0;
  }

  function prepare(items: readonly IconTextureItem[]): Promise<void> {
    return Promise.all(items.map(item => {
      const source = resolveSource(item);
      return source && isSourceRetained(source) ? requestTextureLoad(source) : Promise.resolve();
    })).then(() => {});
  }
  function pendingWork(sources?: ReadonlySet<string>): Promise<void> | undefined {
    const work = [...pendingTextureLoads].filter(([source]) => !sources || sources.has(source)).map(([, promise]) => promise);
    return work.length ? Promise.all(work).then(() => {}) : undefined;
  }
  return Object.freeze({ dispose, resolve, snapshot, synchronize, retain, prepare, pendingWork, retireUnused: retireUnreferencedSources });
}

export const iconTextureRepository = createIconTextureRepository();

reloadOnPixiHotUpdate(import.meta.hot);
