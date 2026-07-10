async function flushTextureLoad() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function installMockImage(images) {
  return class MockImage {
    constructor() {
      this.assignments = [];
      this.height = 16;
      this.naturalHeight = 16;
      this.naturalWidth = 16;
      this.width = 16;
    }

    set crossOrigin(value) {
      this._crossOrigin = value;
      this.assignments.push(`crossOrigin:${value}`);
    }

    get crossOrigin() {
      return this._crossOrigin;
    }

    set src(value) {
      this._src = value;
      this.assignments.push(`src:${value}`);
      images.push(this);
    }

    get src() {
      return this._src;
    }
  };
}

async function importIconTextureCache() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  return import("./iconTextureCache.js");
}

export async function runIconTextureCacheTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon texture cache test failed] ${message}`);
  };

  const previousImage = globalThis.Image;
  const previousHtmlImageElement = globalThis.HTMLImageElement;
  const images = [];
  const MockImage = installMockImage(images);
  globalThis.Image = MockImage;
  globalThis.HTMLImageElement = MockImage;
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  const { Texture } = await import("pixi.js");
  const originalTextureFrom = Texture.from;
  const textureFromCalls = [];
  const trackedTextureFrom = (resource, skipCache) => {
    const texture = originalTextureFrom(resource, skipCache);
    textureFromCalls.push({ resource, skipCache, texture });
    return texture;
  };
  Texture.from = trackedTextureFrom;
  const {
    clearIconTextureCache,
    getCachedIconTexture,
    getIconTextureCacheDebugSnapshot,
    subscribeIconTextureLoadSettlements,
  } = await importIconTextureCache();
  const loadedSources = [];
  const unsubscribeTextureLoadSettlements = subscribeIconTextureLoadSettlements((source) => loadedSources.push(source));
  const originalConsoleError = console.error;
  const textureErrorLogs = [];

  try {
    console.error = (...args) => textureErrorLogs.push(args);
    clearIconTextureCache();
    const assetItem = { id: "asset-app", iconUrl: "http://asset.localhost/app.png" };
    getCachedIconTexture(assetItem);
    assert(images.length === 1, "asset icons should start one image request");
    assert(images[0].crossOrigin === "anonymous", "Tauri asset images should use anonymous CORS");
    assert(images[0].assignments[0] === "crossOrigin:anonymous", "asset image CORS should be configured before assigning src");
    images[0].onerror();
    await flushTextureLoad();
    let assetFailureSnapshot = getIconTextureCacheDebugSnapshot();
    assert(assetFailureSnapshot.recentErrors.length === 1, "asset load failures should remain visible in production diagnostics");
    assert(assetFailureSnapshot.failed.length === 0, "the first asset IO failure should remain retryable");
    assert(textureErrorLogs.length === 1, "asset load failures should be logged explicitly");

    getCachedIconTexture(assetItem);
    assert(images.length === 2, "a transient asset failure should retry on the next render request");
    images[1].onerror();
    await flushTextureLoad();
    assetFailureSnapshot = getIconTextureCacheDebugSnapshot();
    assert(assetFailureSnapshot.failed.length === 1, "repeated asset failures should stop retrying for the session");

    clearIconTextureCache();
    images.length = 0;
    const item = { id: "app-1", iconDataUrl: "data:image/png;base64,first" };
    const listenerKey = {};
    const calls = [];
    getCachedIconTexture(item, () => calls.push("first"), listenerKey);
    getCachedIconTexture(item, () => calls.push("second"), listenerKey);
    assert(images.length === 1, "duplicate listeners for the same source should share one image request");
    images[0].onerror();
    await flushTextureLoad();
    assert(calls.join(",") === "second", "same listener key should keep only the latest callback");
    const failedSnapshot = getIconTextureCacheDebugSnapshot();
    assert(failedSnapshot.failed.length === 1, "failed icon sources should be visible to render diagnostics");
    assert(failedSnapshot.recentErrors[0]?.error === "Failed to load icon texture", "texture diagnostics should retain the concrete load error");
    assert(!JSON.stringify(failedSnapshot).includes("first"), "texture diagnostics should fingerprint sources instead of leaking data URLs");

    clearIconTextureCache();
    images.length = 0;
    const rejectedItem = { id: "app-rejected", iconDataUrl: "data:image/png;base64,decoder-secret" };
    Texture.from = (resource) => {
      throw new Error(`Decoder rejected ${resource.src}`);
    };
    getCachedIconTexture(rejectedItem);
    images[0].onload();
    await flushTextureLoad();
    const rejectedSnapshot = getIconTextureCacheDebugSnapshot();
    assert(rejectedSnapshot.recentErrors[0]?.error.includes("Decoder rejected"), "texture diagnostics should preserve a useful decoder error");
    assert(!JSON.stringify(rejectedSnapshot).includes("decoder-secret"), "decoder errors should redact embedded icon sources");
    Texture.from = trackedTextureFrom;

    clearIconTextureCache();
    images.length = 0;
    const sharedItem = { id: "app-2", iconDataUrl: "data:image/png;base64,second" };
    const sharedCalls = [];
    getCachedIconTexture(sharedItem, () => sharedCalls.push("a"), { key: "a" });
    getCachedIconTexture(sharedItem, () => sharedCalls.push("b"), { key: "b" });
    assert(images.length === 1, "different listeners for the same source should still share one image request");
    images[0].onerror();
    await flushTextureLoad();
    assert(sharedCalls.sort().join(",") === "a,b", "different listener keys should both be notified");

    clearIconTextureCache();
    images.length = 0;
    textureFromCalls.length = 0;
    const loadedItem = { id: "app-3", iconDataUrl: "data:image/png;base64,third" };
    const loadedCalls = [];
    assert(getCachedIconTexture(loadedItem, () => loadedCalls.push("loaded"), { key: "loaded" }) === null, "missing texture should return null while loading");
    assert(images.length === 1, "successful texture load should create one image request");
    images[0].onload();
    await flushTextureLoad();
    assert(loadedCalls.join(",") === "loaded", "successful texture load should notify listeners");
    assert(loadedSources.includes(loadedItem.iconDataUrl), "successful texture load should notify surface render subscribers");
    assert(textureFromCalls.length === 1, "successful texture load should create one Pixi texture");
    assert(textureFromCalls[0].skipCache === true, "Pixi texture creation should skip the global Pixi cache");
    const cachedTexture = getCachedIconTexture(loadedItem);
    assert(cachedTexture === textureFromCalls[0].texture, "loaded texture should be returned from the local icon cache");
    const cachedSnapshot = getIconTextureCacheDebugSnapshot();
    assert(cachedSnapshot.cached[0]?.source?.fingerprint, "loaded texture diagnostics should fingerprint cached sources");
    assert(!JSON.stringify(cachedSnapshot).includes("third"), "cached texture diagnostics should not leak image data URLs");
    clearIconTextureCache();
    assert(cachedTexture.destroyed, "clearing the local icon cache should destroy cached textures");

    images.length = 0;
    textureFromCalls.length = 0;
    const staleItem = { id: "app-4", iconDataUrl: "data:image/png;base64,fourth" };
    const staleCalls = [];
    getCachedIconTexture(staleItem, () => staleCalls.push("stale"), { key: "stale" });
    assert(images.length === 1, "pending texture load should create one image request");
    const staleImage = images[0];
    clearIconTextureCache();
    staleImage.onload();
    await flushTextureLoad();
    assert(staleCalls.length === 0, "stale pending texture loads should not notify cleared listeners");
    assert(textureFromCalls.length === 1, "stale pending texture load should still create a texture before generation check");
    assert(textureFromCalls[0].texture.destroyed, "stale pending texture load should destroy its texture instead of caching it");
    assert(getCachedIconTexture(staleItem) === null, "stale pending texture load should not repopulate the local cache");
    assert(images.length === 2, "a fresh request should be required after stale pending load is ignored");
  } finally {
    console.error = originalConsoleError;
    unsubscribeTextureLoadSettlements();
    clearIconTextureCache();
    Texture.from = originalTextureFrom;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    if (previousHtmlImageElement === undefined) delete globalThis.HTMLImageElement;
    else globalThis.HTMLImageElement = previousHtmlImageElement;
  }
}
