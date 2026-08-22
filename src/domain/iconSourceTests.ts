import {
  applyCachedIconAssetUrlsToApp,
  getIconSource,
} from "./iconSource.js";
import {
  getPixiIconTextureSource,
  isPixiTextureSafeIconSource,
} from "../rendering/pixi/assets/iconTextureSourceAdapter.js";

export function runIconSourceTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Icon source test failed] ${message}`);
  };

  assert(isPixiTextureSafeIconSource("data:image/png;base64,abc"), "Pixi should accept image data URLs");
  assert(isPixiTextureSafeIconSource("blob:http://localhost/icon"), "Pixi should accept blob URLs");
  assert(!isPixiTextureSafeIconSource("asset://C:/Icons/app.png"), "Pixi should reject Tauri asset URLs");
  assert(isPixiTextureSafeIconSource("http://asset.localhost/app.png"), "Pixi should accept the Tauri HTTP asset origin");
  assert(isPixiTextureSafeIconSource("https://asset.localhost/app.png"), "Pixi should accept the Tauri HTTPS asset origin");
  assert(!isPixiTextureSafeIconSource("https://asset.localhost.evil.example/app.png"), "Pixi should reject lookalike asset origins");
  assert(!isPixiTextureSafeIconSource("https://example.com/app.png"), "Pixi should reject arbitrary remote icon origins");

  const cachedApp = applyCachedIconAssetUrlsToApp({
    iconPath: "C:/Icons/default.png",
    iconDataUrl: "data:image/png;base64,default",
    customIconPath: "C:/Icons/custom.png",
    customIconDataUrl: "data:image/png;base64,custom",
  }, (path) => `http://asset.localhost/${path}`);
  assert(cachedApp.iconUrl === "http://asset.localhost/C:/Icons/default.png", "cached catalog icons should derive an asset URL");
  assert(cachedApp.customIconUrl === "http://asset.localhost/C:/Icons/custom.png", "cached custom icons should derive an asset URL");
  assert(!("iconDataUrl" in cachedApp), "cached catalog base64 should be removed once an asset URL exists");
  assert(!("customIconDataUrl" in cachedApp), "cached custom base64 should be removed once an asset URL exists");

  assert(
    getIconSource({
      customIconUrl: "asset://C:/Icons/custom.png",
      iconDataUrl: "data:image/png;base64,default",
    }) === "asset://C:/Icons/custom.png",
    "DOM icon source should still preserve the visual priority order"
  );
  assert(
    getPixiIconTextureSource({
      customIconUrl: "http://asset.localhost/custom.png",
      iconDataUrl: "data:image/png;base64,default",
    }) === "http://asset.localhost/custom.png",
    "Pixi should preserve custom icon priority for safe Tauri asset URLs"
  );
  assert(
    getPixiIconTextureSource({
      customIconDataUrl: "data:image/png;base64,custom",
      iconDataUrl: "data:image/png;base64,default",
    }) === "data:image/png;base64,custom",
    "Pixi should prefer safe custom icon data"
  );
  assert(
    getPixiIconTextureSource({
      iconUrl: "http://asset.localhost/app.png",
    }) === "http://asset.localhost/app.png",
    "Pixi should expose safe asset-only icons to WebGL"
  );
}
