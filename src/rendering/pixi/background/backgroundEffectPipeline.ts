import {
  RenderTexture,
  Sprite,
  Texture,
  type Application,
  type Filter,
  type Renderer,
} from "pixi.js";
import {
  BLUR_KERNEL_GAUSSIAN,
  createDualKawaseLevels,
  resolveAcrylicRenderSize,
} from "./acrylicBackgroundPlan.js";
import type { createBackgroundEffectPlan } from "./acrylicBackgroundPlan.js";
import { createAcrylicCompositeFilter, createGaussianFilter, createKawaseFilter } from "./acrylicFilters.js";
import { createAcrylicNoiseTexture } from "./acrylicNoiseTexture.js";

type BackgroundEffectPlan = ReturnType<typeof createBackgroundEffectPlan>;

type SizeInput = Readonly<{
  height?: unknown;
  width?: unknown;
}>;

type BackgroundEffectTexturePlanInput = Readonly<{
  minSize?: unknown;
  passCount?: unknown;
}>;

type BackgroundEffectPipelineOptions = Readonly<{
  displaySprite?: Sprite | null;
  filterNames?: Readonly<Partial<Record<
    "down" | "gaussianHorizontal" | "gaussianVertical" | "up",
    string
  >>>;
  filterPrefix?: string;
}>;

type PipelineFilter = Filter & {
  setInputSize?: (width: unknown, height: unknown) => void;
};

export function destroyTexture(texture: Texture | null | undefined, destroySource = true): void {
  if (!texture || texture.destroyed) return;
  texture.destroy(destroySource);
}

export function resolveGaussianAxis(
  radiusPx: unknown,
  renderAxis: unknown,
  targetAxis: unknown,
): { radius: number; sigma: number } {
  const sigma = Math.max(
    0.001,
    (Number(radiusPx) || 0) * Math.max(1, Number(renderAxis)) / Math.max(1, Number(targetAxis)),
  );
  return {
    radius: Math.min(32, Math.ceil(sigma * 3)),
    sigma,
  };
}

export function createBackgroundEffectTexturePlan(
  renderSize: SizeInput | null | undefined,
  blur: BackgroundEffectTexturePlanInput | null | undefined,
) {
  const width = Math.max(1, Math.round(Number(renderSize?.width) || 1));
  const height = Math.max(1, Math.round(Number(renderSize?.height) || 1));
  const passCount = blur?.passCount;
  const minSize = blur?.minSize;
  const levels = createDualKawaseLevels(width, height, passCount, minSize);
  return {
    key: [
      width,
      height,
      passCount,
      minSize,
      ...levels.map((level) => `${level.width}x${level.height}`),
    ].join("|"),
    levels,
    renderSize: { height, width },
  };
}

function createRenderTexture(width: unknown, height: unknown): RenderTexture {
  return RenderTexture.create({
    height: Math.max(1, Math.round(Number(height))),
    resolution: 1,
    width: Math.max(1, Math.round(Number(width))),
  });
}

export class BackgroundEffectPipeline {
  app: Application<Renderer> | null;
  displaySprite: Sprite | null;
  passSprite: Sprite | null;
  downFilter: ReturnType<typeof createKawaseFilter> | null;
  upFilter: ReturnType<typeof createKawaseFilter> | null;
  gaussianHorizontalFilter: ReturnType<typeof createGaussianFilter> | null;
  gaussianVerticalFilter: ReturnType<typeof createGaussianFilter> | null;
  noiseTexture: Texture | null;
  compositeFilter: ReturnType<typeof createAcrylicCompositeFilter> | null;
  sourceRenderTexture: RenderTexture | null;
  finalBlurTexture: RenderTexture | null;
  finalRenderTexture: RenderTexture | null;
  downTextures: RenderTexture[];
  upTextures: RenderTexture[];
  renderSizeKey: string;

  constructor(app: Application<Renderer>, options: BackgroundEffectPipelineOptions = {}) {
    const filterPrefix = options.filterPrefix || "launchpad-background";
    const filterNames = options.filterNames || {};
    this.app = app;
    this.displaySprite = options.displaySprite || null;
    this.passSprite = new Sprite(Texture.EMPTY);
    this.downFilter = createKawaseFilter(filterNames.down || `${filterPrefix}-downsample-filter`, 1);
    this.upFilter = createKawaseFilter(filterNames.up || `${filterPrefix}-upsample-filter`, 1.15);
    this.gaussianHorizontalFilter = createGaussianFilter(
      filterNames.gaussianHorizontal || `${filterPrefix}-gaussian-horizontal-filter`,
      [1, 0]
    );
    this.gaussianVerticalFilter = createGaussianFilter(
      filterNames.gaussianVertical || `${filterPrefix}-gaussian-vertical-filter`,
      [0, 1]
    );
    this.noiseTexture = createAcrylicNoiseTexture();
    this.compositeFilter = createAcrylicCompositeFilter(this.noiseTexture);
    this.sourceRenderTexture = null;
    this.finalBlurTexture = null;
    this.finalRenderTexture = null;
    this.downTextures = [];
    this.upTextures = [];
    this.renderSizeKey = "";
  }

  get hasRenderTextures(): boolean {
    return Boolean(this.sourceRenderTexture && this.finalBlurTexture && this.finalRenderTexture && this.downTextures.length);
  }

  ensureRenderTexturesForTarget(
    width: unknown,
    height: unknown,
    effectPlan: BackgroundEffectPlan,
  ): { changed: boolean; renderSize: { height: number; width: number } } {
    const renderSize = resolveAcrylicRenderSize(width, height);
    return {
      changed: this.ensureRenderTextures(renderSize, effectPlan),
      renderSize,
    };
  }

  ensureRenderTextures(renderSize: SizeInput, effectPlan: BackgroundEffectPlan): boolean {
    const texturePlan = createBackgroundEffectTexturePlan(renderSize, effectPlan?.blur);
    if (texturePlan.key === this.renderSizeKey) return false;

    this.destroyRenderTextures();
    this.renderSizeKey = texturePlan.key;
    this.sourceRenderTexture = createRenderTexture(texturePlan.renderSize.width, texturePlan.renderSize.height);
    this.finalBlurTexture = createRenderTexture(texturePlan.renderSize.width, texturePlan.renderSize.height);
    this.finalRenderTexture = createRenderTexture(texturePlan.renderSize.width, texturePlan.renderSize.height);
    this.downTextures = texturePlan.levels.map((level) => createRenderTexture(level.width, level.height));
    this.upTextures = texturePlan.levels.map((level) => createRenderTexture(level.width, level.height));
    return true;
  }

  destroyRenderTextures(): void {
    if (this.passSprite) this.passSprite.texture = Texture.EMPTY;
    if (this.displaySprite) this.displaySprite.texture = Texture.EMPTY;
    destroyTexture(this.sourceRenderTexture);
    destroyTexture(this.finalBlurTexture);
    destroyTexture(this.finalRenderTexture);
    for (const texture of this.downTextures) destroyTexture(texture);
    for (const texture of this.upTextures) destroyTexture(texture);
    this.sourceRenderTexture = null;
    this.finalBlurTexture = null;
    this.finalRenderTexture = null;
    this.downTextures = [];
    this.upTextures = [];
    this.renderSizeKey = "";
  }

  renderPass(
    inputTexture: Texture | null,
    outputTexture: RenderTexture | null,
    filter: PipelineFilter | null,
  ): void {
    if (!this.app || !this.passSprite || !inputTexture || !outputTexture) return;
    this.passSprite.texture = inputTexture;
    this.passSprite.position.set(0, 0);
    this.passSprite.setSize(outputTexture.width, outputTexture.height);
    this.passSprite.filters = filter ? [filter] : null;
    filter?.setInputSize?.(inputTexture.width, inputTexture.height);
    this.app.renderer.render({ container: this.passSprite, target: outputTexture, clear: true });
    this.passSprite.filters = null;
  }

  renderBlur(effectPlan: BackgroundEffectPlan, referenceSize: SizeInput | null | undefined): void {
    if (effectPlan?.blur?.kernel === BLUR_KERNEL_GAUSSIAN) {
      this.renderGaussianBlur(effectPlan, referenceSize);
    } else {
      this.renderDualKawaseBlur(effectPlan);
    }
  }

  renderGaussianBlur(
    effectPlan: BackgroundEffectPlan,
    referenceSize: SizeInput | null | undefined,
  ): void {
    const targetWidth = Math.max(
      1,
      Number(referenceSize?.width) || this.sourceRenderTexture?.width || 1,
    );
    const targetHeight = Math.max(
      1,
      Number(referenceSize?.height) || this.sourceRenderTexture?.height || 1,
    );
    const horizontal = resolveGaussianAxis(
      effectPlan.blur.gaussianRadiusPx,
      this.sourceRenderTexture?.width || 1,
      targetWidth
    );
    const vertical = resolveGaussianAxis(
      effectPlan.blur.gaussianRadiusPx,
      this.sourceRenderTexture?.height || 1,
      targetHeight
    );
    this.gaussianHorizontalFilter!.setParams(horizontal);
    this.renderPass(this.sourceRenderTexture, this.finalRenderTexture, this.gaussianHorizontalFilter);
    this.gaussianVerticalFilter!.setParams(vertical);
    this.renderPass(this.finalRenderTexture, this.finalBlurTexture, this.gaussianVerticalFilter);
  }

  renderDualKawaseBlur(effectPlan: BackgroundEffectPlan): void {
    const blurOffsetScale = effectPlan.blur.offsetScale;
    let currentTexture = this.sourceRenderTexture;
    for (let index = 0; index < this.downTextures.length; index += 1) {
      this.downFilter!.setOffset(effectPlan.blur.downOffsets[index] ?? (1 + index * 0.35) * blurOffsetScale);
      const downTexture = this.downTextures[index]!;
      this.renderPass(currentTexture, downTexture, this.downFilter);
      currentTexture = downTexture;
    }

    for (let index = this.downTextures.length - 2; index >= 0; index -= 1) {
      this.upFilter!.setOffset(effectPlan.blur.upOffsets[index] ?? (1.1 + index * 0.25) * blurOffsetScale);
      const upTexture = this.upTextures[index]!;
      this.renderPass(currentTexture, upTexture, this.upFilter);
      currentTexture = upTexture;
    }

    this.upFilter!.setOffset(effectPlan.blur.finalUpOffset);
    this.renderPass(currentTexture, this.finalBlurTexture, this.upFilter);
  }

  renderAcrylicComposite(params: BackgroundEffectPlan["acrylic"]): void {
    this.compositeFilter!.setParams(params);
    this.renderPass(this.finalBlurTexture, this.finalRenderTexture, this.compositeFilter);
  }

  destroy(): void {
    this.destroyRenderTextures();
    this.passSprite?.destroy?.();
    this.downFilter?.destroy?.();
    this.upFilter?.destroy?.();
    this.gaussianHorizontalFilter?.destroy?.();
    this.gaussianVerticalFilter?.destroy?.();
    this.compositeFilter?.destroy?.();
    destroyTexture(this.noiseTexture);
    this.app = null;
    this.displaySprite = null;
    this.passSprite = null;
    this.downFilter = null;
    this.upFilter = null;
    this.gaussianHorizontalFilter = null;
    this.gaussianVerticalFilter = null;
    this.compositeFilter = null;
    this.noiseTexture = null;
  }
}
