import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { loadNativeIconTexture } from "../rendering/native/nativeIconTextureLoader.js";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "launchpad-native-icon-"));
try {
  const fixturePath = join(fixtureDirectory, "icon.png");
  const canvas = createCanvas(8, 8);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ef3b6d";
  context.fillRect(0, 0, 8, 8);
  writeFileSync(fixturePath, canvas.toBuffer("image/png"));

  const texture = await loadNativeIconTexture(fixturePath);
  try {
    assert.equal(texture.source.pixelWidth, 8);
    assert.equal(texture.source.pixelHeight, 8);
    assert.equal(texture.source.format, "rgba8unorm");
    const pixels = texture.source.resource;
    assert.ok(pixels instanceof Uint8Array);
    assert.deepEqual(Array.from(pixels.subarray(0, 4)), [239, 59, 109, 255]);
  } finally {
    texture.destroy(true);
  }

  await assert.rejects(
    loadNativeIconTexture("https://example.com/icon.png"),
    /image data URL or absolute file path/,
  );
} finally {
  rmSync(fixtureDirectory, { force: true, recursive: true });
}

console.log("Native icon texture loader tests passed");
