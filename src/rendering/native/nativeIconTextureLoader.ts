import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Texture } from "pixi.js";
import { createResidentIconRepository, type NativeIconRepository } from "./nativeIconResidency.js";
import { decodeIconPixels, NativeRecoverableIconSource } from "./nativeRecoverableIconSource.js";
import {
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

export function createNativeIconTextureRepository(host: Parameters<typeof createResidentIconRepository>[0]): NativeIconRepository {
  return createResidentIconRepository(host, loadNativeIconTexture);
}
