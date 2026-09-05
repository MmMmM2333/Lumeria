import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BufferImageSource, Texture } from "pixi.js";
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
  const image = await loadImage(/^data:image\//i.test(source) ? source
    : await readFile(source.startsWith("file:") ? fileURLToPath(source) : source));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  return new Texture({
    source: new BufferImageSource({
      alphaMode: "no-premultiply-alpha",
      autoGenerateMipmaps: true,
      format: "rgba8unorm",
      height: image.height,
      resource: new Uint8Array(pixels),
      width: image.width,
    }),
  });
}

export function createNativeIconTextureRepository(): IconTextureRepository {
  return createIconTextureRepository({
    loadTexture: loadNativeIconTexture,
    resolveSource: getNativeIconTextureSource,
  });
}
