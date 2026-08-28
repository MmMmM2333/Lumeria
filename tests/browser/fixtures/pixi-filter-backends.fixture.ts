import {
  Application,
  Graphics,
  RenderTexture,
  RendererType,
  Sprite,
  type RendererPreference,
} from "pixi.js";
import { BACKGROUND_EFFECT_ACRYLIC } from "../../../src/domain/backgroundSettings.js";
import {
  BLUR_KERNEL_DUAL_KAWASE,
  BLUR_KERNEL_GAUSSIAN,
  createBackgroundEffectPlan,
} from "../../../src/rendering/pixi/background/acrylicBackgroundPlan.js";
import {
  BackgroundEffectPipeline,
} from "../../../src/rendering/pixi/background/backgroundEffectPipeline.js";

const SIZE = 64;

export interface PixelDifference {
  changedComponents: number;
  max: number;
  mean: number;
}

export interface PixiFilterBackendResult {
  compatibleRenderers: boolean;
  gpuErrors: string[];
  renderer: string;
  sourceToGaussian: PixelDifference;
  sourceToKawase: PixelDifference;
  kawaseToAcrylic: PixelDifference;
  pixels: BackendPixelBuffers;
}

export interface PixiFilterBackendsResult {
  acrylicParity: PixelDifference;
  gaussianParity: PixelDifference;
  kawaseParity: PixelDifference;
  webgl: PixiFilterBackendResult;
  webgpu: PixiFilterBackendResult;
}

interface PipelinePixelBuffers {
  acrylic: number[];
  blur: number[];
  source: number[];
}

interface BackendPixelBuffers {
  acrylic: number[];
  gaussian: number[];
  kawase: number[];
  source: number[];
}

function difference(left: readonly number[], right: readonly number[]): PixelDifference {
  if (left.length !== right.length) throw new Error(`Pixel buffer length mismatch: ${left.length} !== ${right.length}`);
  let changedComponents = 0;
  let max = 0;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = Math.abs((left[index] ?? 0) - (right[index] ?? 0));
    if (delta > 2) changedComponents += 1;
    max = Math.max(max, delta);
    total += delta;
  }
  return {
    changedComponents,
    max,
    mean: total / Math.max(1, left.length),
  };
}

function extractPremultipliedPixels(app: Application, texture: RenderTexture): number[] {
  const pixels = Array.from(app.renderer.extract.pixels(texture).pixels);
  if (app.renderer.name !== "webgpu") return pixels;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = (pixels[index + 3] ?? 0) / 255;
    pixels[index] = Math.round((pixels[index] ?? 0) * alpha);
    pixels[index + 1] = Math.round((pixels[index + 1] ?? 0) * alpha);
    pixels[index + 2] = Math.round((pixels[index + 2] ?? 0) * alpha);
  }
  return pixels;
}

function readPixels(app: Application, pipeline: BackgroundEffectPipeline): PipelinePixelBuffers {
  const source = pipeline.sourceRenderTexture;
  const blur = pipeline.finalBlurTexture;
  const acrylic = pipeline.finalRenderTexture;
  if (!source || !blur || !acrylic) throw new Error("Background pipeline textures are unavailable");
  return {
    acrylic: extractPremultipliedPixels(app, acrylic),
    blur: extractPremultipliedPixels(app, blur),
    source: extractPremultipliedPixels(app, source),
  };
}

function renderSource(app: Application, pipeline: BackgroundEffectPipeline, source: Graphics): void {
  if (!pipeline.sourceRenderTexture) throw new Error("Background pipeline source texture is unavailable");
  app.renderer.render({ container: source, target: pipeline.sourceRenderTexture, clear: true });
}

async function renderBackend(preference: RendererPreference): Promise<PixiFilterBackendResult> {
  const app = new Application();
  try {
    await app.init({
      autoStart: false,
      backgroundAlpha: 0,
      height: SIZE,
      preference: [preference],
      resolution: 1,
      width: SIZE,
    });
  } catch (error) {
    throw new Error(`Failed to initialize required ${preference} renderer`, { cause: error });
  }
  if (app.renderer.name !== preference) {
    app.destroy(true, { children: true });
    throw new Error(`Required ${preference} renderer, received ${app.renderer.name}`);
  }

  const displaySprite = new Sprite();
  const pipeline = new BackgroundEffectPipeline(app, { displaySprite, filterPrefix: `test-${preference}` });
  const source = new Graphics()
    .rect(0, 0, SIZE / 2, SIZE).fill({ color: 0xf43f5e })
    .rect(SIZE / 2, 0, SIZE / 2, SIZE).fill({ color: 0x2563eb })
    .circle(SIZE / 2, SIZE / 2, 10).fill({ color: 0x22c55e });
  const filters = [
    pipeline.downFilter,
    pipeline.upFilter,
    pipeline.gaussianHorizontalFilter,
    pipeline.gaussianVerticalFilter,
    pipeline.compositeFilter,
  ];
  const compatibleRenderers = filters.every((filter) => filter?.compatibleRenderers === RendererType.BOTH);
  const gpuErrors: string[] = [];
  const device = app.renderer.name === "webgpu" && "gpu" in app.renderer
    ? app.renderer.gpu.device
    : null;
  const onUncapturedError = (event: GPUUncapturedErrorEvent) => gpuErrors.push(event.error.message);
  device?.addEventListener("uncapturederror", onUncapturedError);
  device?.pushErrorScope("validation");

  const gaussianPlan = createBackgroundEffectPlan({
    backgroundEffect: BACKGROUND_EFFECT_ACRYLIC,
    backgroundImageOpacity: 82,
    backgroundBlurStrength: 40,
    dualKawaseParams: { gaussianRadiusPx: 4, kernel: BLUR_KERNEL_GAUSSIAN },
  });
  pipeline.ensureRenderTextures({ height: SIZE, width: SIZE }, gaussianPlan);
  renderSource(app, pipeline, source);
  pipeline.renderBlur(gaussianPlan, { height: SIZE, width: SIZE });
  const gaussianPixels = readPixels(app, pipeline);

  const kawasePlan = createBackgroundEffectPlan({
    acrylicParams: {
      brightness: 1.2,
      contrast: 1.1,
      noise: 0.04,
      saturation: 0.8,
      seed: 0.25,
      tintColor: [0.2, 0.5, 0.9],
      tintStrength: 0.35,
    },
    backgroundEffect: BACKGROUND_EFFECT_ACRYLIC,
    backgroundImageOpacity: 82,
    backgroundBlurStrength: 75,
    dualKawaseParams: { kernel: BLUR_KERNEL_DUAL_KAWASE, offsetScale: 1, passCount: 2 },
  });
  pipeline.ensureRenderTextures({ height: SIZE, width: SIZE }, kawasePlan);
  renderSource(app, pipeline, source);
  pipeline.renderBlur(kawasePlan, { height: SIZE, width: SIZE });
  pipeline.renderAcrylicComposite(kawasePlan.acrylic);
  const pixels = readPixels(app, pipeline);

  await device?.queue.onSubmittedWorkDone();
  const scopedError = await device?.popErrorScope();
  if (scopedError) gpuErrors.push(scopedError.message);
  device?.removeEventListener("uncapturederror", onUncapturedError);
  const result = {
    compatibleRenderers,
    gpuErrors,
    renderer: app.renderer.name,
    sourceToGaussian: difference(gaussianPixels.source, gaussianPixels.blur),
    sourceToKawase: difference(pixels.source, pixels.blur),
    kawaseToAcrylic: difference(pixels.blur, pixels.acrylic),
    pixels: {
      acrylic: pixels.acrylic,
      gaussian: gaussianPixels.blur,
      kawase: pixels.blur,
      source: gaussianPixels.source,
    },
  };

  pipeline.destroy();
  source.destroy();
  displaySprite.destroy();
  app.destroy(true, { children: true });
  return result;
}

window.runPixiFilterBackendsRegression = async () => {
  const webgl = await renderBackend("webgl");
  const webgpu = await renderBackend("webgpu");
  return {
    acrylicParity: difference(webgl.pixels.acrylic, webgpu.pixels.acrylic),
    gaussianParity: difference(webgl.pixels.gaussian, webgpu.pixels.gaussian),
    kawaseParity: difference(webgl.pixels.kawase, webgpu.pixels.kawase),
    webgl,
    webgpu,
  };
};
window.pixiFilterBackendsFixtureReady = true;

declare global {
  interface Window {
    pixiFilterBackendsFixtureReady: boolean;
    runPixiFilterBackendsRegression(): Promise<PixiFilterBackendsResult>;
  }
}
