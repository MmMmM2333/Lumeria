import { Application } from "pixi.js";
import { reloadOnPixiHotUpdate } from "./devHmr.js";
import { getEffectiveDevicePixelRatio } from "./geometry/stageCoordinates.js";

export async function createPixiApp(host, options = {}) {
  host?.replaceChildren?.();
  const app = new Application();
  await app.init({
    antialias: options.antialias ?? true,
    autoStart: options.autoStart === true,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: options.preference,
    powerPreference: "high-performance",
    resolution: getEffectiveDevicePixelRatio(),
    resizeTo: options.resizeTo || host,
  });
  app.canvas.className = options.className || "pixi-launchpad-canvas";
  host.appendChild(app.canvas);
  return app;
}

reloadOnPixiHotUpdate(import.meta.hot);
