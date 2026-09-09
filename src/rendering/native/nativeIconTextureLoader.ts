import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Texture } from "pixi.js";
import { decodeIconPixels, NativeRecoverableIconSource } from "./nativeRecoverableIconSource.js";
import {
  createIconTextureRepository,
  type IconTextureRepository,
} from "../pixi/assets/iconTextureRepository.js";
import {
  getNativeIconTextureSource,
  isNativeFileIconSource,
} from "./nativeIconTextureSource.js";

export async function loadNativeIconTexture(source: string): Promise<Texture> {
  if (!/^data:image\//i.test(source) && !isNativeFileIconSource(source)) {
    throw new TypeError("Native icon texture source must be an image data URL or absolute file path");
  }
  const encoded = /^data:image\//i.test(source) ? source
    : await readFile(source.startsWith("file:") ? fileURLToPath(source) : source);
  return new Texture({ source: new NativeRecoverableIconSource(encoded, await decodeIconPixels(encoded)) });
}

export function createNativeIconTextureRepository(): IconTextureRepository {
  return createIconTextureRepository({
    loadTexture: loadNativeIconTexture,
    // Bound file IO and Skia decoding together during whole-layout loading.
    maxConcurrentLoads: 4,
    resolveSource: getNativeIconTextureSource,
  });
}
