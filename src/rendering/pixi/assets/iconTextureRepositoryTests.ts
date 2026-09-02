import { createIconTextureRepository } from "./iconTextureRepository.js";
import type { Texture } from "pixi.js";

interface TestTextureSource {
  autoGenerateMipmaps: boolean;
  destroyed: boolean;
  pixelHeight: number;
  pixelWidth: number;
  uid: number;
}

interface MutableTestTexture {
  destroy: (destroySource?: boolean) => void;
  destroyed: boolean;
  source: TestTextureSource;
  uid: number;
}

type TestTexture = Texture & {
  destroyed: boolean;
  source: Texture["source"] & TestTextureSource;
  uid: number;
};

interface ControlledTextureRequest {
  reject: (reason?: unknown) => void;
  resolve: (value: Texture | PromiseLike<Texture>) => void;
  source: string;
}

function makeTexture(uid: number, width = 16, height = 16): TestTexture {
  const texture: MutableTestTexture = {
    destroyed: false,
    source: {
      autoGenerateMipmaps: true,
      destroyed: false,
      pixelHeight: height,
      pixelWidth: width,
      uid: uid + 1000,
    },
    uid,
    destroy(destroySource?: boolean) {
      this.destroyed = true;
      if (destroySource) this.source.destroyed = true;
    },
  };
  return texture as unknown as TestTexture;
}

function createControlledLoader() {
  const requests: ControlledTextureRequest[] = [];
  return {
    loadTexture(source: string): Promise<Texture> {
      return new Promise<Texture>((resolve, reject) => requests.push({ reject, resolve, source }));
    },
    requests,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

export async function runIconTextureRepositoryTests() {
  function assert(condition: unknown, message: string): void {
    if (!condition) throw new Error(`[Pixi icon texture repository test failed] ${message}`);
  }

  const originalConsoleError = console.error;
  const textureErrors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    textureErrors.push(args);
  };

  try {
    const retirements: (() => void)[] = [];
    const controlled = createControlledLoader();
    const repository = createIconTextureRepository({
      loadTexture: controlled.loadTexture,
      scheduleAfterFrame: (callback) => retirements.push(callback),
    });
    const firstItem = { id: "app-1", iconDataUrl: "data:image/png;base64,first" };
    const firstTexture = makeTexture(1, 32, 16);
    const firstSync = repository.synchronize([firstItem]);
    assert(controlled.requests.length === 1, "synchronizing an active source should start one load");
    controlled.requests[0]!.resolve(firstTexture);
    await firstSync;
    assert(repository.resolve(firstItem) === firstTexture, "a synchronized active texture should remain immediately resolvable");
    const activeSnapshot = repository.snapshot();
    assert(activeSnapshot.activeCount === 1 && activeSnapshot.cached.length === 1, "the repository should report one active cached source");
    assert(activeSnapshot.estimatedBytes === Math.round(32 * 16 * 4 * 4 / 3), "texture diagnostics should estimate RGBA mipmap memory");
    assert(!JSON.stringify(activeSnapshot).includes("base64,first"), "texture diagnostics should fingerprint data URLs");

    const replacementItem = { id: "app-1", iconDataUrl: "data:image/png;base64,replacement" };
    const replacementTexture = makeTexture(2);
    const replacementSync = repository.synchronize([replacementItem]);
    assert(controlled.requests.length === 2, "changing an icon source should start the replacement load");
    assert(repository.resolve(replacementItem) === firstTexture, "an unresolved replacement should keep rendering the previous texture atomically");
    assert(repository.snapshot().replacementFallbackCount === 1, "a pending replacement should retain one fallback source");
    controlled.requests[1]!.resolve(replacementTexture);
    await replacementSync;
    assert(repository.resolve(replacementItem) === replacementTexture, "a ready replacement should switch to the new texture");
    assert(repository.snapshot().replacementFallbackCount === 0, "a ready replacement should release fallback ownership");
    assert(!firstTexture.destroyed, "the old texture should survive until the post-frame retirement boundary");
    while (retirements.length) retirements.shift()!();
    assert(firstTexture.destroyed, "the old replacement texture should be destroyed after the frame boundary");

    const failedReplacement = { id: "app-1", iconDataUrl: "data:image/png;base64,failed" };
    const failedSync = repository.synchronize([failedReplacement]);
    assert(repository.resolve(failedReplacement) === replacementTexture, "a second replacement should reuse the last ready texture while loading");
    controlled.requests[2]!.reject(new Error("replacement failed"));
    await failedSync;
    assert(repository.resolve(failedReplacement) === replacementTexture, "a failed replacement should retain the last ready texture");
    assert(repository.snapshot().failed.length === 1, "a genuine replacement load failure should remain explicit in diagnostics");

    const removalSync = repository.synchronize([]);
    await removalSync;
    assert(!replacementTexture.destroyed, "removing an active item should defer texture destruction until after the frame");
    while (retirements.length) retirements.shift()!();
    assert(replacementTexture.destroyed, "removed icon textures should be reclaimed after the frame boundary");
    assert(repository.snapshot().activeCount === 0 && repository.snapshot().cached.length === 0, "removed sources should leave no resident texture behind");

    const staleControlled = createControlledLoader();
    const staleRepository = createIconTextureRepository({
      loadTexture: staleControlled.loadTexture,
      scheduleAfterFrame: (callback) => callback(),
    });
    const staleItem = { id: "stale", iconDataUrl: "data:image/png;base64,stale" };
    const staleTexture = makeTexture(3);
    const staleSync = staleRepository.synchronize([staleItem]);
    let staleObserverCalls = 0;
    staleRepository.resolve(staleItem, () => { staleObserverCalls += 1; }, "stale-listener");
    await staleRepository.synchronize([]);
    staleControlled.requests[0]!.resolve(staleTexture);
    await staleSync;
    assert(staleTexture.destroyed, "a source removed while loading must not repopulate the repository");
    assert(staleRepository.snapshot().cached.length === 0, "stale listeners must not keep removed textures resident");
    assert(staleObserverCalls === 1, "stale load observers should settle once without retaining the resource");

    const observerControlled = createControlledLoader();
    const observerRepository = createIconTextureRepository({ loadTexture: observerControlled.loadTexture });
    const observerItem = { id: "observer", iconDataUrl: "data:image/png;base64,observer" };
    const observerSync = observerRepository.synchronize([observerItem]);
    const observerCalls: string[] = [];
    observerRepository.resolve(observerItem, () => { throw new Error("observer boom"); }, "throwing");
    observerRepository.resolve(observerItem, () => observerCalls.push("later"), "later");
    observerControlled.requests[0]!.resolve(makeTexture(4));
    await observerSync;
    assert(observerCalls.join(",") === "later", "one throwing observer must not prevent later texture observers");
    assert(observerRepository.snapshot().observerErrors.length === 1, "observer failures should use their own diagnostic channel");

    const disposedControlled = createControlledLoader();
    const disposedRepository = createIconTextureRepository({ loadTexture: disposedControlled.loadTexture });
    const disposedItem = { id: "disposed", iconDataUrl: "data:image/png;base64,disposed" };
    const disposedSync = disposedRepository.synchronize([disposedItem]);
    const disposedTexture = makeTexture(5);
    disposedRepository.dispose();
    disposedControlled.requests[0]!.resolve(disposedTexture);
    await disposedSync;
    assert(disposedTexture.destroyed, "a load completing after repository disposal must destroy its stale texture");
    assert(disposedRepository.snapshot().cached.length === 0, "repository disposal must clear all resident resources");

    const nativeControlled = createControlledLoader();
    const nativeRepository = createIconTextureRepository({
      loadTexture: nativeControlled.loadTexture,
      resolveSource: (item) => item?.customIconPath || item?.iconPath || null,
    });
    const nativeItem = { id: "native", iconPath: "C:\\Icons\\native.png" };
    const nativeTexture = makeTexture(6);
    const nativeSync = nativeRepository.synchronize([nativeItem]);
    assert(
      nativeControlled.requests[0]?.source === "C:\\Icons\\native.png",
      "a repository-specific source resolver should select native file paths",
    );
    nativeControlled.requests[0]!.resolve(nativeTexture);
    await nativeSync;
    assert(nativeRepository.resolve(nativeItem) === nativeTexture, "a native-resolved texture should use the normal cache");
    nativeRepository.dispose();
    assert(nativeTexture.destroyed, "disposing a native repository should destroy its cached textures");
  } finally {
    console.error = originalConsoleError;
  }
}
