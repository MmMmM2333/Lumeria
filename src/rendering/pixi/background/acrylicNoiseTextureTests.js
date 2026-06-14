async function importAcrylicNoiseTexture() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  return import("./acrylicNoiseTexture.js");
}

export async function runAcrylicNoiseTextureTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Acrylic noise texture test failed] ${message}`);
  };
  const {
    DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE,
    generateAcrylicNoisePixels,
    resolveAcrylicNoiseTextureSize,
  } = await importAcrylicNoiseTexture();

  assert(resolveAcrylicNoiseTextureSize() === DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE, "missing size should use the default");
  assert(resolveAcrylicNoiseTextureSize(4) === 16, "tiny noise textures should clamp to the minimum");
  assert(resolveAcrylicNoiseTextureSize(1000) === 512, "huge noise textures should clamp to the maximum");

  const first = generateAcrylicNoisePixels(16, 0);
  const second = generateAcrylicNoisePixels(16, 0);
  const different = generateAcrylicNoisePixels(16, 1);

  assert(first.size === 16, "generated texture size should match the resolved size");
  assert(first.pixels.length === 16 * 16 * 4, "generated pixels should include RGBA channels");
  assert(first.pixels.slice(0, 64).join(",") === second.pixels.slice(0, 64).join(","), "same seed should generate stable noise");
  assert(first.pixels.slice(0, 64).join(",") !== different.pixels.slice(0, 64).join(","), "different seeds should generate different noise");

  for (let index = 0; index < first.pixels.length; index += 4) {
    assert(first.pixels[index] === first.pixels[index + 1] && first.pixels[index] === first.pixels[index + 2], "noise should be grayscale");
    assert(first.pixels[index + 3] === 255, "noise pixels should be opaque");
  }
}
