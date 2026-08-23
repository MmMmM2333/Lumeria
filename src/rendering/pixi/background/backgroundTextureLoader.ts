import { Texture } from "pixi.js";

type BackgroundTextureOptions = Readonly<{
  maxHeight?: unknown;
  maxWidth?: unknown;
}>;

type BackgroundTextureResource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

function toPositiveSize(value: unknown, fallback: number): number {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

export function resolveBackgroundTextureSize(
  sourceWidth: unknown,
  sourceHeight: unknown,
  options: BackgroundTextureOptions = {},
): { height: number; width: number } {
  const width = toPositiveSize(sourceWidth, 1);
  const height = toPositiveSize(sourceHeight, 1);
  const maxWidth = toPositiveSize(options.maxWidth, width);
  const maxHeight = toPositiveSize(options.maxHeight, height);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

export function shouldRequestCorsForTextureImage(source: unknown): boolean {
  const value = String(source || "").trim();
  return Boolean(value) && !/^data:/i.test(value) && !/^blob:/i.test(value);
}

async function createTextureResource(
  image: HTMLImageElement,
  options: BackgroundTextureOptions,
): Promise<BackgroundTextureResource> {
  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  const shouldLimitSize = Number(options?.maxWidth) > 0 || Number(options?.maxHeight) > 0;
  if (!shouldLimitSize || sourceWidth <= 0 || sourceHeight <= 0) return image;

  const size = resolveBackgroundTextureSize(sourceWidth, sourceHeight, options);
  if (size.width === sourceWidth && size.height === sourceHeight) return image;
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(image, {
        resizeHeight: size.height,
        // The preview always blurs this texture; higher-quality resampling stalls on large wallpapers.
        resizeQuality: "low",
        resizeWidth: size.width,
      });
    } catch (error) {
      console.warn("Failed to resize background preview with createImageBitmap", error);
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Background preview image resizing is unavailable");
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Failed to create background preview resize context");
  context.drawImage(image, 0, 0, size.width, size.height);
  return canvas;
}

export function loadBackgroundTextureFromImage(
  source: string,
  options: BackgroundTextureOptions = {},
): Promise<Texture> {
  return new Promise<Texture>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    if (shouldRequestCorsForTextureImage(source)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = async () => {
      try {
        const resource = await createTextureResource(image, options);
        resolve(Texture.from(resource, true));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load background texture: ${source}`));
    image.src = source;
  });
}
