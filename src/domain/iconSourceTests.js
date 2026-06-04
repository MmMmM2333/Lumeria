import { getIconSource, getPixiIconTextureSource, isPixiTextureSafeIconSource } from "./iconSource.js";

export function runIconSourceTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Icon source test failed] ${message}`);
  };

  assert(isPixiTextureSafeIconSource("data:image/png;base64,abc"), "Pixi should accept image data URLs");
  assert(isPixiTextureSafeIconSource("blob:http://localhost/icon"), "Pixi should accept blob URLs");
  assert(!isPixiTextureSafeIconSource("asset://C:/Icons/app.png"), "Pixi should reject Tauri asset URLs");
  assert(!isPixiTextureSafeIconSource("http://asset.localhost/app.png"), "Pixi should reject remote asset URLs");

  assert(
    getIconSource({
      customIconUrl: "asset://C:/Icons/custom.png",
      iconDataUrl: "data:image/png;base64,default",
    }) === "asset://C:/Icons/custom.png",
    "DOM icon source should still preserve the visual priority order"
  );
  assert(
    getPixiIconTextureSource({
      customIconUrl: "asset://C:/Icons/custom.png",
      iconDataUrl: "data:image/png;base64,default",
    }) === "data:image/png;base64,default",
    "Pixi should skip unsafe custom asset URLs and fall back to safe data URLs"
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
      iconUrl: "asset://C:/Icons/app.png",
    }) === null,
    "Pixi should not expose unsafe asset-only icons to WebGL"
  );
}
