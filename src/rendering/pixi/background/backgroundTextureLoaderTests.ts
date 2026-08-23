import type { Texture as PixiTexture } from "pixi.js";

type MockImageRecord = {
  _src?: string;
  crossOrigin?: string;
  naturalHeight?: number;
  naturalWidth?: number;
  onload?: () => void;
};

type MockBitmap = Readonly<{
  height: number;
  image: ImageBitmapSource;
  width: number;
}>;

type BitmapRequest = Readonly<{
  bitmap: MockBitmap;
  image: ImageBitmapSource;
  options: ImageBitmapOptions;
}>;

type MockTexture = Readonly<{
  resource: unknown;
  skipCache: boolean | undefined;
}>;

function installMockImage(images: MockImageRecord[]): typeof Image {
  return class MockImage {
    _src!: string;
    crossOrigin?: string;
    naturalHeight?: number;
    naturalWidth?: number;
    onload?: () => void;

    set src(value: string) {
      this._src = value;
      images.push(this);
    }

    get src(): string {
      return this._src;
    }
  } as unknown as typeof Image;
}

async function importBackgroundTextureLoader() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  return import("./backgroundTextureLoader.js");
}

export async function runBackgroundTextureLoaderTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi background texture loader test failed] ${message}`);
  };

  const {
    loadBackgroundTextureFromImage,
    resolveBackgroundTextureSize,
    shouldRequestCorsForTextureImage,
  } = await importBackgroundTextureLoader();

  const previewTextureSize = resolveBackgroundTextureSize(3840, 2160, {
    maxHeight: 640,
    maxWidth: 640,
  });
  assert(
    previewTextureSize.width === 640 && previewTextureSize.height === 360,
    "preview texture limits should preserve the source aspect ratio"
  );

  assert(shouldRequestCorsForTextureImage("asset://C:/Images/background.webp"), "asset urls should request CORS when used directly");
  assert(shouldRequestCorsForTextureImage("http://localhost:5173/background.png"), "http urls should request CORS");
  assert(!shouldRequestCorsForTextureImage("data:image/png;base64,abc"), "data urls should not request CORS");
  assert(!shouldRequestCorsForTextureImage("blob:http://localhost/background"), "blob urls should not request CORS");

  const previousImage = globalThis.Image;
  const previousHtmlImageElement = globalThis.HTMLImageElement;
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  const images: MockImageRecord[] = [];
  const bitmapRequests: BitmapRequest[] = [];
  const MockImage = installMockImage(images);
  globalThis.Image = MockImage;
  globalThis.HTMLImageElement = MockImage as unknown as typeof HTMLImageElement;
  globalThis.createImageBitmap = (async (image: ImageBitmapSource, options?: ImageBitmapOptions) => {
    if (options?.resizeHeight === undefined || options.resizeWidth === undefined) {
      throw new Error("Mock createImageBitmap requires resize dimensions");
    }
    const bitmap: MockBitmap = {
      height: options.resizeHeight,
      image,
      width: options.resizeWidth,
    };
    bitmapRequests.push({ image, options, bitmap });
    return bitmap as unknown as ImageBitmap;
  }) as typeof createImageBitmap;
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  const { Texture } = await import("pixi.js");
  const originalTextureFrom = Texture.from;
  Texture.from = (resource, skipCache) => ({ resource, skipCache }) as unknown as PixiTexture;

  try {
    const assetLoad = loadBackgroundTextureFromImage("asset://C:/Images/background.webp");
    const assetImage = images[0];
    assert(assetImage?.crossOrigin === "anonymous", "asset texture loads should set anonymous CORS before src");
    assert(typeof assetImage.onload === "function", "asset texture mock should expose the load callback");
    assetImage.onload();
    const assetTexture = await assetLoad as unknown as MockTexture;
    assert(assetTexture.skipCache === true, "background texture creation should skip the global Pixi cache");
    assert(bitmapRequests.length === 0, "unbounded background texture loads should preserve the original image resource");

    images.length = 0;
    const previewLoad = loadBackgroundTextureFromImage("asset://C:/Images/background.webp", {
      maxHeight: 640,
      maxWidth: 640,
    });
    const previewImage = images[0];
    assert(previewImage, "preview texture mock should capture the image");
    previewImage.naturalHeight = 2160;
    previewImage.naturalWidth = 3840;
    assert(typeof previewImage.onload === "function", "preview texture mock should expose the load callback");
    previewImage.onload();
    const previewTexture = await previewLoad as unknown as MockTexture;
    assert(Number(bitmapRequests.length) === 1, "preview texture loads should resize decoded images before upload");
    const bitmapRequest = bitmapRequests[0];
    assert(bitmapRequest, "preview texture resizing should capture one bitmap request");
    assert(
      bitmapRequest.options.resizeWidth === 640 && bitmapRequest.options.resizeHeight === 360,
      "preview texture resizing should use the bounded texture dimensions"
    );
    assert(bitmapRequest.options.resizeQuality === "low", "preview texture resizing should avoid blocking high-quality resampling");
    assert(previewTexture.resource === bitmapRequest.bitmap, "preview textures should use the resized bitmap resource");

    images.length = 0;
    const dataLoad = loadBackgroundTextureFromImage("data:image/png;base64,abc");
    const dataImage = images[0];
    assert(dataImage, "data texture mock should capture the image");
    assert(dataImage.crossOrigin === undefined, "data texture loads should not set CORS");
    assert(typeof dataImage.onload === "function", "data texture mock should expose the load callback");
    dataImage.onload();
    await dataLoad;

    images.length = 0;
    const blobLoad = loadBackgroundTextureFromImage("blob:http://localhost/background");
    const blobImage = images[0];
    assert(blobImage, "blob texture mock should capture the image");
    assert(blobImage.crossOrigin === undefined, "blob texture loads should not set CORS");
    assert(typeof blobImage.onload === "function", "blob texture mock should expose the load callback");
    blobImage.onload();
    await blobLoad;
  } finally {
    Texture.from = originalTextureFrom;
    if (previousImage === undefined) Reflect.deleteProperty(globalThis, "Image");
    else globalThis.Image = previousImage;
    if (previousHtmlImageElement === undefined) Reflect.deleteProperty(globalThis, "HTMLImageElement");
    else globalThis.HTMLImageElement = previousHtmlImageElement;
    if (previousCreateImageBitmap === undefined) Reflect.deleteProperty(globalThis, "createImageBitmap");
    else globalThis.createImageBitmap = previousCreateImageBitmap;
  }
}
