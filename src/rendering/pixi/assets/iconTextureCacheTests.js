async function flushTextureLoad() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function installMockImage(images) {
  return class MockImage {
    set src(value) {
      this._src = value;
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
  const images = [];
  globalThis.Image = installMockImage(images);
  const { clearIconTextureCache, getCachedIconTexture } = await importIconTextureCache();

  try {
    clearIconTextureCache();
    const item = { id: "app-1", iconDataUrl: "data:image/png;base64,first" };
    const listenerKey = {};
    const calls = [];
    getCachedIconTexture(item, () => calls.push("first"), listenerKey);
    getCachedIconTexture(item, () => calls.push("second"), listenerKey);
    assert(images.length === 1, "duplicate listeners for the same source should share one image request");
    images[0].onerror();
    await flushTextureLoad();
    assert(calls.join(",") === "second", "same listener key should keep only the latest callback");

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
  } finally {
    clearIconTextureCache();
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
}
