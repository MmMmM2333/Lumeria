import { Application, type ApplicationOptions } from "pixi.js";
import { reloadOnPixiHotUpdate } from "./devHmr.js";
import { getEffectiveDevicePixelRatio } from "./geometry/stageCoordinates.js";

interface CreatePixiAppOptions {
  antialias?: ApplicationOptions["antialias"];
  autoStart?: boolean;
  className?: string;
  preference?: ApplicationOptions["preference"];
  resizeTo?: ApplicationOptions["resizeTo"];
}

export const PIXI_RENDERER_PREFERENCE = ["webgpu", "webgl"] as const;

export async function createPixiApp(
  host: HTMLElement,
  options: CreatePixiAppOptions = {},
): Promise<Application> {
  host?.replaceChildren?.();
  const app = new Application();
  await app.init({
    antialias: options.antialias ?? true,
    autoStart: options.autoStart === true,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: options.preference ?? [...PIXI_RENDERER_PREFERENCE],
    powerPreference: "high-performance",
    resolution: getEffectiveDevicePixelRatio(),
    resizeTo: options.resizeTo || host,
  } as Partial<ApplicationOptions>);
  app.canvas.className = options.className || "pixi-launchpad-canvas";
  host.appendChild(app.canvas);
  return app;
}

reloadOnPixiHotUpdate(import.meta.hot);
