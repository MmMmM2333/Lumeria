import { RenderTexture, Sprite, Texture } from "pixi.js";
import {
  BLUR_KERNEL_GAUSSIAN,
  createDualKawaseLevels,
  resolveAcrylicRenderSize,
} from "./acrylicBackgroundPlan.js";
import { createAcrylicCompositeFilter, createGaussianFilter, createKawaseFilter } from "./acrylicFilters.js";
import { createAcrylicNoiseTexture } from "./acrylicNoiseTexture.js";

export function destroyTexture(texture, destroySource = true) {
  if (!texture || texture.destroyed) return;
  texture.destroy(destroySource);
}

export function resolveGaussianAxis(radiusPx, renderAxis, targetAxis) {
  const sigma = Math.max(0.001, (Number(radiusPx) || 0) * Math.max(1, renderAxis) / Math.max(1, targetAxis));
  return {
    radius: Math.min(32, Math.ceil(sigma * 3)),
    sigma,
  };
}

export function createBackgroundEffectTexturePlan(renderSize, blur) {
  const width = Math.max(1, Math.round(renderSize?.width || 1));
  const height = Math.max(1, Math.round(renderSize?.height || 1));
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

function createRenderTexture(width, height) {
  return RenderTexture.create({
    height: Math.max(1, Math.round(height)),
    resolution: 1,
    width: Math.max(1, Math.round(width)),
  });
}

export class BackgroundEffectPipeline {
  constructor(app, options = {}) {
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

  get hasRenderTextures() {
    return Boolean(this.sourceRenderTexture && this.finalBlurTexture && this.finalRenderTexture && this.downTextures.length);
  }

  ensureRenderTexturesForTarget(width, height, effectPlan) {
    const renderSize = resolveAcrylicRenderSize(width, height);
    return {
      changed: this.ensureRenderTextures(renderSize, effectPlan),
      renderSize,
    };
  }

  ensureRenderTextures(renderSize, effectPlan) {
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

  destroyRenderTextures() {
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

  renderPass(inputTexture, outputTexture, filter) {
    if (!this.app || !this.passSprite || !inputTexture || !outputTexture) return;
    this.passSprite.texture = inputTexture;
    this.passSprite.position.set(0, 0);
    this.passSprite.setSize(outputTexture.width, outputTexture.height);
    this.passSprite.filters = filter ? [filter] : null;
    filter?.setInputSize?.(inputTexture.width, inputTexture.height);
    this.app.renderer.render({ container: this.passSprite, target: outputTexture, clear: true });
    this.passSprite.filters = null;
  }

  renderBlur(effectPlan, referenceSize) {
    if (effectPlan?.blur?.kernel === BLUR_KERNEL_GAUSSIAN) {
      this.renderGaussianBlur(effectPlan, referenceSize);
    } else {
      this.renderDualKawaseBlur(effectPlan);
    }
  }

  renderGaussianBlur(effectPlan, referenceSize) {
    const targetWidth = Math.max(1, referenceSize?.width || this.sourceRenderTexture?.width || 1);
    const targetHeight = Math.max(1, referenceSize?.height || this.sourceRenderTexture?.height || 1);
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
    this.gaussianHorizontalFilter.setParams(horizontal);
    this.renderPass(this.sourceRenderTexture, this.finalRenderTexture, this.gaussianHorizontalFilter);
    this.gaussianVerticalFilter.setParams(vertical);
    this.renderPass(this.finalRenderTexture, this.finalBlurTexture, this.gaussianVerticalFilter);
  }

  renderDualKawaseBlur(effectPlan) {
    const blurOffsetScale = effectPlan.blur.offsetScale;
    let currentTexture = this.sourceRenderTexture;
    for (let index = 0; index < this.downTextures.length; index += 1) {
      this.downFilter.setOffset(effectPlan.blur.downOffsets[index] ?? (1 + index * 0.35) * blurOffsetScale);
      this.renderPass(currentTexture, this.downTextures[index], this.downFilter);
      currentTexture = this.downTextures[index];
    }

    for (let index = this.downTextures.length - 2; index >= 0; index -= 1) {
      this.upFilter.setOffset(effectPlan.blur.upOffsets[index] ?? (1.1 + index * 0.25) * blurOffsetScale);
      this.renderPass(currentTexture, this.upTextures[index], this.upFilter);
      currentTexture = this.upTextures[index];
    }

    this.upFilter.setOffset(effectPlan.blur.finalUpOffset);
    this.renderPass(currentTexture, this.finalBlurTexture, this.upFilter);
  }

  renderAcrylicComposite(params) {
    this.compositeFilter.setParams(params);
    this.renderPass(this.finalBlurTexture, this.finalRenderTexture, this.compositeFilter);
  }

  destroy() {
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
