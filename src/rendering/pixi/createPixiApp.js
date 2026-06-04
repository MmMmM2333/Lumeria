import { Application } from "pixi.js";
import { reloadOnPixiHotUpdate } from "./devHmr.js";

export async function createPixiApp(host, options = {}) {
  host?.replaceChildren?.();
  const app = new Application();
  await app.init({
    antialias: true,
    autoDensity: true,
    backgroundAlpha: 0,
    powerPreference: "high-performance",
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    resizeTo: options.resizeTo || host,
  });
  app.canvas.className = options.className || "pixi-launchpad-canvas";
  host.appendChild(app.canvas);
  app.start?.();
  return app;
}

reloadOnPixiHotUpdate(import.meta.hot);
