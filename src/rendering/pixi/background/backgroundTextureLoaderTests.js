function installMockImage(images) {
  return class MockImage {
    set src(value) {
      this._src = value;
      images.push(this);
    }

    get src() {
      return this._src;
    }
  };
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
  const assert = (condition, message) => {
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
  const images = [];
  const bitmapRequests = [];
  const MockImage = installMockImage(images);
  globalThis.Image = MockImage;
  globalThis.HTMLImageElement = MockImage;
  globalThis.createImageBitmap = async (image, options) => {
    const bitmap = { height: options.resizeHeight, image, width: options.resizeWidth };
    bitmapRequests.push({ image, options, bitmap });
    return bitmap;
  };
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
  }
  const { Texture } = await import("pixi.js");
  const originalTextureFrom = Texture.from;
  Texture.from = (resource, skipCache) => ({ resource, skipCache });

  try {
    const assetLoad = loadBackgroundTextureFromImage("asset://C:/Images/background.webp");
    assert(images[0].crossOrigin === "anonymous", "asset texture loads should set anonymous CORS before src");
    images[0].onload();
    const assetTexture = await assetLoad;
    assert(assetTexture.skipCache === true, "background texture creation should skip the global Pixi cache");
    assert(bitmapRequests.length === 0, "unbounded background texture loads should preserve the original image resource");

    images.length = 0;
    const previewLoad = loadBackgroundTextureFromImage("asset://C:/Images/background.webp", {
      maxHeight: 640,
      maxWidth: 640,
    });
    images[0].naturalHeight = 2160;
    images[0].naturalWidth = 3840;
    images[0].onload();
    const previewTexture = await previewLoad;
    assert(bitmapRequests.length === 1, "preview texture loads should resize decoded images before upload");
    assert(
      bitmapRequests[0].options.resizeWidth === 640 && bitmapRequests[0].options.resizeHeight === 360,
      "preview texture resizing should use the bounded texture dimensions"
    );
    assert(bitmapRequests[0].options.resizeQuality === "low", "preview texture resizing should avoid blocking high-quality resampling");
    assert(previewTexture.resource === bitmapRequests[0].bitmap, "preview textures should use the resized bitmap resource");

    images.length = 0;
    const dataLoad = loadBackgroundTextureFromImage("data:image/png;base64,abc");
    assert(images[0].crossOrigin === undefined, "data texture loads should not set CORS");
    images[0].onload();
    await dataLoad;

    images.length = 0;
    const blobLoad = loadBackgroundTextureFromImage("blob:http://localhost/background");
    assert(images[0].crossOrigin === undefined, "blob texture loads should not set CORS");
    images[0].onload();
    await blobLoad;
  } finally {
    Texture.from = originalTextureFrom;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    if (previousHtmlImageElement === undefined) delete globalThis.HTMLImageElement;
    else globalThis.HTMLImageElement = previousHtmlImageElement;
    if (previousCreateImageBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previousCreateImageBitmap;
  }
}
