import { PIXI_RENDERER_PREFERENCE } from "./createPixiApp.js";

export function runCreatePixiAppTests(): void {
  if (PIXI_RENDERER_PREFERENCE.join(",") !== "webgpu,webgl") {
    throw new Error("[Create Pixi app test failed] production renderers should prefer WebGPU and retain WebGL fallback");
  }
}
