import { Texture } from "pixi.js";

export const DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE = 128;

function normalizeSeed(seed) {
  const value = Number(seed);
  return Number.isFinite(value) ? Math.floor(value) >>> 0 : 0;
}

export function resolveAcrylicNoiseTextureSize(size = DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE) {
  const value = Number(size);
  if (!Number.isFinite(value)) return DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE;
  return Math.min(512, Math.max(16, Math.round(value)));
}

function createSeededRandom(seed) {
  let state = (normalizeSeed(seed) + 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateAcrylicNoisePixels(size = DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE, seed = 0) {
  const textureSize = resolveAcrylicNoiseTextureSize(size);
  const random = createSeededRandom(seed);
  const pixels = new Uint8ClampedArray(textureSize * textureSize * 4);

  for (let index = 0; index < pixels.length; index += 4) {
    const value = Math.floor(random() * 256);
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }

  return {
    pixels,
    size: textureSize,
  };
}

function createAcrylicNoiseCanvas(size, seed) {
  const { pixels, size: textureSize } = generateAcrylicNoisePixels(size, seed);
  const canvas = document.createElement("canvas");
  canvas.width = textureSize;
  canvas.height = textureSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Failed to create Acrylic noise canvas context");
  const imageData = context.createImageData(textureSize, textureSize);
  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function createAcrylicNoiseTexture(size = DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE, seed = 0) {
  const texture = Texture.from(createAcrylicNoiseCanvas(size, seed), true);
  const style = texture.source?.style;
  if (style) {
    style.addressMode = "repeat";
    style.magFilter = "nearest";
    style.minFilter = "nearest";
    style.update();
  }
  return texture;
}
