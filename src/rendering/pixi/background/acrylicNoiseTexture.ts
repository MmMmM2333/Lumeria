import { Texture, BufferImageSource, type TextureSource } from "pixi.js";

type AcrylicNoisePixels = Readonly<{
  pixels: Uint8ClampedArray;
  size: number;
}>;

export const DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE = 128;

function normalizeSeed(seed: unknown): number {
  const value = Number(seed);
  return Number.isFinite(value) ? Math.floor(value) >>> 0 : 0;
}

export function resolveAcrylicNoiseTextureSize(
  size: unknown = DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE,
): number {
  const value = Number(size);
  if (!Number.isFinite(value)) return DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE;
  return Math.min(512, Math.max(16, Math.round(value)));
}

function createSeededRandom(seed: unknown): () => number {
  let state = (normalizeSeed(seed) + 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateAcrylicNoisePixels(
  size: unknown = DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE,
  seed: unknown = 0,
): AcrylicNoisePixels {
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

export function createAcrylicNoiseTexture(
  size: unknown = DEFAULT_ACRYLIC_NOISE_TEXTURE_SIZE,
  seed: unknown = 0,
): Texture {
  const data=generateAcrylicNoisePixels(size,seed);
  const texture=new Texture({source:new BufferImageSource({resource:new Uint8Array(data.pixels),width:data.size,height:data.size,format:"rgba8unorm",alphaMode:"no-premultiply-alpha"})});
  const source: TextureSource | undefined = texture.source;
  const style = source?.style;
  if (style) {
    style.addressMode = "repeat";
    style.magFilter = "nearest";
    style.minFilter = "nearest";
    style.update();
  }
  return texture;
}
