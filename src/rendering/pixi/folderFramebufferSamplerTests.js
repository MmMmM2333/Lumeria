import {
  captureFolderFramebufferSample,
  compareFolderPixelSnapshots,
} from "./folderFramebufferSampler.dev.js";

export function runFolderFramebufferSamplerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder framebuffer sampler test failed] ${message}`);
  };

  {
    let readPixelsCallCount = 0;
    const gl = {
      NO_ERROR: 0,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      getError: () => 0,
      isContextLost: () => false,
      readPixels(_x, _y, width, height, _format, _type, pixels) {
        readPixelsCallCount += 1;
        for (let row = 0; row < height; row += 1) {
          for (let column = 0; column < width; column += 1) {
            const value = column < 10 ? 20 : column >= 20 ? 220 : 0;
            const offset = ((row * width) + column) * 4;
            pixels[offset] = value;
            pixels[offset + 1] = value;
            pixels[offset + 2] = value;
            pixels[offset + 3] = 255;
          }
        }
      },
    };
    const sample = captureFolderFramebufferSample({
      app: {
        canvas: {
          getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
          height: 100,
          width: 100,
        },
        renderer: { gl, name: "webgl" },
      },
      slots: [
        { clientBounds: { height: 10, left: 10, top: 10, width: 10 }, folderId: "folder-a", itemId: "item-a", slot: 0 },
        { clientBounds: { height: 10, left: 30, top: 10, width: 10 }, folderId: "folder-b", itemId: "item-b", slot: 0 },
      ],
    });

    assert(sample.available === true, "eligible global slots should produce a framebuffer sample");
    assert(readPixelsCallCount === 1 && sample.readPixelsCallCount === 1, "one phase should read the framebuffer exactly once");
    assert(sample.region?.width === 30 && sample.region?.height === 10, "the read should cover the union of eligible slots");
    assert(sample.slots.length === 2, "one framebuffer read should retain summaries for every eligible slot");
    assert(sample.slots[0]?.hash !== sample.slots[1]?.hash, "slot summaries should reflect their distinct framebuffer pixels");
  }

  {
    let readPixelsCallCount = 0;
    const sample = captureFolderFramebufferSample({
      app: {
        canvas: {
          getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
          height: 100,
          width: 100,
        },
        renderer: {
          gl: {
            NO_ERROR: 0,
            RGBA: 0x1908,
            UNSIGNED_BYTE: 0x1401,
            getError: () => 0,
            isContextLost: () => false,
            readPixels() { readPixelsCallCount += 1; },
          },
          name: "webgl",
        },
      },
      maxReadBytes: 100,
      slots: [{ clientBounds: { height: 100, left: 0, top: 0, width: 100 }, folderId: "folder-a", itemId: "item-a", slot: 0 }],
    });
    assert(sample.available === false && sample.reason === "pixel-capture-too-large", "oversized global reads should fail explicitly");
    assert(readPixelsCallCount === 0 && sample.readPixelsCallCount === 0, "oversized global reads should stop before touching the GPU");
  }

  {
    let readPixelsCallCount = 0;
    const sample = captureFolderFramebufferSample({
      app: {
        canvas: {
          getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
          height: 100,
          width: 100,
        },
        renderer: {
          gl: {
            NO_ERROR: 0,
            RGBA: 0x1908,
            UNSIGNED_BYTE: 0x1401,
            getError: () => 0,
            isContextLost: () => false,
            readPixels() {
              readPixelsCallCount += 1;
              throw new Error("context lost while reading");
            },
          },
          name: "webgl",
        },
      },
      slots: [{ clientBounds: { height: 10, left: 10, top: 10, width: 10 }, folderId: "folder-a", itemId: "item-a", slot: 0 }],
    });
    assert(sample.available === false && sample.reason === "pixel-read-failed", "readPixels failures should remain explicit");
    assert(readPixelsCallCount === 1 && sample.readPixelsCallCount === 1, "failed GPU reads should still report the attempted call");
  }

  {
    const errors = [0, 0x0502, 0];
    const sample = captureFolderFramebufferSample({
      app: {
        canvas: {
          getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
          height: 100,
          width: 100,
        },
        renderer: {
          gl: {
            INVALID_OPERATION: 0x0502,
            NO_ERROR: 0,
            RGBA: 0x1908,
            UNSIGNED_BYTE: 0x1401,
            getError: () => errors.shift() ?? 0,
            isContextLost: () => false,
            readPixels() {},
          },
          name: "webgl",
        },
      },
      slots: [{ clientBounds: { height: 10, left: 10, top: 10, width: 10 }, folderId: "folder-a", itemId: "item-a", slot: 0 }],
    });
    assert(sample.available === false && sample.reason === "pixel-read-gl-error", "non-throwing WebGL read errors should not report valid evidence");
    assert(sample.detail?.readGlErrors?.[0] === 0x0502, "the report should retain the WebGL error emitted by readPixels");
  }

  {
    let readPixelsCallCount = 0;
    const sample = captureFolderFramebufferSample({
      app: {
        canvas: {
          getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
          height: 100,
          width: 100,
        },
        renderer: {
          gl: {
            NO_ERROR: 0,
            RGBA: 0x1908,
            UNSIGNED_BYTE: 0x1401,
            getError: () => 0,
            isContextLost: () => true,
            readPixels() { readPixelsCallCount += 1; },
          },
          name: "webgl",
        },
      },
      slots: [{ clientBounds: { height: 10, left: 10, top: 10, width: 10 }, folderId: "folder-a", itemId: "item-a", slot: 0 }],
    });
    assert(sample.available === false && sample.reason === "webgl-context-lost-before-read", "lost contexts should fail before sampling");
    assert(readPixelsCallCount === 0, "lost contexts should not attempt framebuffer reads");
  }

  {
    const makeSample = (firstLuma, secondLuma, hash) => ({
      hash,
      sample: Array.from({ length: 64 }, (_value, index) => [index % 2 === 0 ? firstLuma : secondLuma, 255]).flat(),
      sampleHeight: 8,
      sampleWidth: 8,
    });
    const makeSnapshot = (phase, pixel, sceneSignature = "stable-scene") => ({
      framebuffer: { available: true },
      folders: [{
        children: [{
          itemId: "mi-service",
          itemName: "MiService",
          pixel,
          sceneSignature,
          slot: 5,
        }],
        folderId: "folder-tools",
        folderName: "工具",
      }],
      phase,
    });
    const comparison = compareFolderPixelSnapshots(
      makeSnapshot("drag-start", makeSample(20, 20, "missing")),
      makeSnapshot("drag-end", makeSample(20, 220, "restored"))
    );

    assert(comparison.available === true && comparison.comparableSlotCount === 1, "stable slots should be comparable across drag phases");
    assert(comparison.candidates[0]?.itemName === "MiService", "the restored pixel outlier should identify the affected item without a target filter");
    assert(comparison.candidates[0]?.changedSampleRatio === 0.5, "pixel candidates should quantify the changed sample area");
    assert(comparison.candidates[0]?.detailGainAfterRelease > 0, "a recovered icon should report increased visual detail after release");

    const changedScene = compareFolderPixelSnapshots(
      makeSnapshot("drag-start", makeSample(20, 20, "missing")),
      makeSnapshot("drag-end", makeSample(20, 220, "restored"), "changed-scene")
    );
    assert(changedScene.candidates.length === 0, "intentional scene-state changes should not be reported as framebuffer anomalies");
    assert(changedScene.skippedSlots[0]?.reason === "scene-state-changed", "scene-state exclusions should remain explicit in the report");
  }
}
