import { Application, Container, Sprite, Texture, TilingSprite } from "pixi.js";
import { loadCachedBackgroundImageDataUrl } from "../../../api/launchpadApi.js";
import { resolveBackgroundImagePlacement } from "../../../domain/backgroundImageLayout.js";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
} from "../../../composables/useLaunchpadSettingsConfig.js";
import {
  createBackgroundEffectPlan,
  resolveAcrylicRenderSize,
} from "./acrylicBackgroundPlan.js";
import { loadBackgroundTextureFromImage } from "./backgroundTextureLoader.js";
import { BackgroundEffectPipeline, destroyTexture } from "./backgroundEffectPipeline.js";

const DEFAULT_PREVIEW_WIDTH = 320;
const DEFAULT_PREVIEW_HEIGHT = 180;
const DEFAULT_RENDER_WIDTH = 960;
const DEFAULT_RENDER_HEIGHT = 540;

function clampRenderSize(value, fallback) {
  const size = Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.max(16, Math.round(size));
}

async function resolveTextureSource(config) {
  if (!config.backgroundImagePath) return config.backgroundImageUrl;
  try {
    return await loadCachedBackgroundImageDataUrl(config.backgroundImagePath) || config.backgroundImageUrl;
  } catch (error) {
    console.warn("Failed to load WebGL-safe background preview image", error);
    return config.backgroundImageUrl;
  }
}

function makeAcrylicKey(config) {
  return JSON.stringify(createBackgroundEffectPlan(config).acrylic);
}

function makePlacementKey(config) {
  return JSON.stringify({
    imagePrecomposed: Boolean(config.backgroundImagePrecomposed),
    imageHeight: config.backgroundImagePixelSize?.height || null,
    imageWidth: config.backgroundImagePixelSize?.width || null,
    layout: config.backgroundImageLayout || null,
    monitorPhysicalHeight: config.backgroundLayoutContext?.monitorPhysicalHeight || null,
    monitorPhysicalWidth: config.backgroundLayoutContext?.monitorPhysicalWidth || null,
    monitorPhysicalX: config.backgroundLayoutContext?.monitorPhysicalX || null,
    monitorPhysicalY: config.backgroundLayoutContext?.monitorPhysicalY || null,
    monitorScaleFactor: config.backgroundLayoutContext?.monitorScaleFactor || null,
    windowPhysicalX: config.backgroundLayoutContext?.windowPhysicalX || null,
    windowPhysicalY: config.backgroundLayoutContext?.windowPhysicalY || null,
  });
}

export class BackgroundEffectPreviewRenderer {
  constructor(host, options = {}) {
    this.host = host;
    this.onRender = typeof options.onRender === "function" ? options.onRender : null;
    this.app = null;
    this.sourceTexture = null;
    this.sourceSprite = null;
    this.sourceTilingSprite = null;
    this.sourceContainer = null;
    this.displaySprite = null;
    this.effectPipeline = null;
    this.config = {};
    this.lastBlurKey = "";
    this.lastAcrylicKey = "";
    this.textureKey = "";
    this.sourceDirty = true;
    this.blurDirty = true;
    this.compositeDirty = true;
    this.textureLoadGeneration = 0;
    this.pendingFrame = null;
    this.destroyed = false;
  }

  async init() {
    const app = new Application();
    await app.init({
      antialias: true,
      autoDensity: true,
      autoStart: false,
      backgroundAlpha: 0,
      height: DEFAULT_PREVIEW_HEIGHT,
      powerPreference: "high-performance",
      preference: ["webgl"],
      resolution: 1,
      width: DEFAULT_PREVIEW_WIDTH,
    });
    if (this.destroyed) {
      app.destroy(false, { children: true });
      return;
    }

    app.canvas.className = "settings-background-preview-canvas";
    this.host?.replaceChildren?.(app.canvas);
    app.stop?.();
    this.app = app;
    this.sourceContainer = new Container();
    this.sourceSprite = new Sprite(Texture.EMPTY);
    this.sourceTilingSprite = new TilingSprite({ height: 1, texture: Texture.EMPTY, width: 1 });
    this.sourceTilingSprite.visible = false;
    this.sourceContainer.addChild(this.sourceSprite);
    this.sourceContainer.addChild(this.sourceTilingSprite);
    this.displaySprite = new Sprite(Texture.EMPTY);
    this.effectPipeline = new BackgroundEffectPipeline(this.app, {
      displaySprite: this.displaySprite,
      filterNames: {
        down: "launchpad-preview-kawase-downsample-filter",
        gaussianHorizontal: "launchpad-preview-gaussian-horizontal-filter",
        gaussianVertical: "launchpad-preview-gaussian-vertical-filter",
        up: "launchpad-preview-kawase-upsample-filter",
      },
    });
    this.app.stage.addChild(this.displaySprite);
  }

  setConfig(config) {
    const previousEffect = this.config.backgroundEffect;
    const previousRenderKey = this.getRenderSizeKey();
    const previousBlurKey = this.getBlurKey();
    const previousAcrylicKey = makeAcrylicKey(this.config);
    const previousPlacementKey = makePlacementKey(this.config);
    this.config = { ...config };
    const nextTextureKey = `${this.config.backgroundImagePath || ""}|${this.config.backgroundImageUrl || ""}`;
    if (nextTextureKey !== this.textureKey) {
      this.textureKey = nextTextureKey;
      this.sourceDirty = true;
      this.blurDirty = true;
      this.compositeDirty = true;
      void this.loadTexture();
      return;
    }
    const nextRenderKey = this.getRenderSizeKey();
    const nextBlurKey = this.getBlurKey();
    const nextPlacementKey = makePlacementKey(this.config);
    if (nextPlacementKey !== previousPlacementKey || nextRenderKey !== previousRenderKey) {
      this.sourceDirty = true;
      this.blurDirty = true;
      this.compositeDirty = true;
    } else if (nextBlurKey !== previousBlurKey) {
      this.blurDirty = true;
      this.compositeDirty = true;
    } else if (this.config.backgroundEffect !== previousEffect) {
      this.compositeDirty = true;
    } else if (
      this.config.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      && makeAcrylicKey(this.config) !== previousAcrylicKey
    ) {
      this.compositeDirty = true;
    }
    this.scheduleRender();
  }

  async loadTexture() {
    const generation = ++this.textureLoadGeneration;
    const source = this.config.backgroundImageUrl;
    if (!source) {
      const previousTexture = this.sourceTexture;
      this.sourceTexture = null;
      destroyTexture(previousTexture);
      this.clearStage();
      return;
    }

    try {
      const textureSource = await resolveTextureSource(this.config);
      const texture = await loadBackgroundTextureFromImage(textureSource);
      if (this.destroyed || generation !== this.textureLoadGeneration) {
        destroyTexture(texture);
        return;
      }
      const previousTexture = this.sourceTexture;
      this.sourceTexture = texture;
      destroyTexture(previousTexture);
      this.sourceDirty = true;
      this.blurDirty = true;
      this.compositeDirty = true;
      this.scheduleRender();
    } catch (error) {
      if (!this.destroyed && generation === this.textureLoadGeneration) {
        console.warn("Failed to render background effect preview", error);
        this.clearStage();
      }
    }
  }

  clearStage() {
    if (!this.app || !this.displaySprite) return;
    this.displaySprite.texture = Texture.EMPTY;
    this.app.renderer.render({ container: this.app.stage, clear: true });
  }

  getRenderSize() {
    const { height: renderHeight, width: renderWidth } = this.getConfiguredRenderSize();
    return resolveAcrylicRenderSize(renderWidth, renderHeight);
  }

  getConfiguredRenderSize() {
    return {
      height: clampRenderSize(this.config.renderHeight, DEFAULT_RENDER_HEIGHT),
      width: clampRenderSize(this.config.renderWidth, DEFAULT_RENDER_WIDTH),
    };
  }

  getRenderSizeKey() {
    const renderSize = this.getRenderSize();
    return `${renderSize.width}x${renderSize.height}`;
  }

  getBlurKey() {
    const renderSize = this.getRenderSize();
    const blur = createBackgroundEffectPlan(this.config).blur;
    return JSON.stringify({
      downOffsets: blur.downOffsets,
      finalUpOffset: blur.finalUpOffset,
      gaussianRadiusPx: blur.gaussianRadiusPx,
      height: renderSize.height,
      imageLayout: this.config.backgroundImageLayout || "",
      kernel: blur.kernel,
      offsetScale: blur.offsetScale,
      passCount: blur.passCount,
      upOffsets: blur.upOffsets,
      width: renderSize.width,
    });
  }

  updateCanvasCoverStyle(renderSize) {
    const canvas = this.app?.canvas;
    const rect = this.host?.getBoundingClientRect?.();
    if (!canvas || !rect?.width || !rect?.height) return;

    const hostRatio = rect.width / rect.height;
    const renderRatio = renderSize.width / renderSize.height;
    if (renderRatio > hostRatio) {
      canvas.style.width = `${(renderRatio / hostRatio) * 100}%`;
      canvas.style.height = "100%";
    } else {
      canvas.style.width = "100%";
      canvas.style.height = `${(hostRatio / renderRatio) * 100}%`;
    }
  }

  renderSourceToTexture(renderSize) {
    if (
      !this.app
      || !this.sourceTexture
      || !this.sourceSprite
      || !this.sourceTilingSprite
      || !this.effectPipeline?.sourceRenderTexture
    ) return;
    if (this.config.backgroundImagePrecomposed) {
      this.sourceTilingSprite.visible = false;
      this.sourceTilingSprite.texture = Texture.EMPTY;
      this.sourceSprite.visible = true;
      this.sourceSprite.texture = this.sourceTexture;
      this.sourceSprite.position.set(0, 0);
      this.sourceSprite.setSize(renderSize.width, renderSize.height);
      this.app.renderer.render({ container: this.sourceContainer, target: this.effectPipeline.sourceRenderTexture, clear: true });
      return;
    }

    const { height: configuredHeight, width: configuredWidth } = this.getConfiguredRenderSize();
    const renderScaleX = Math.max(0.0001, renderSize.width / configuredWidth);
    const renderScaleY = Math.max(0.0001, renderSize.height / configuredHeight);
    const layout = resolveBackgroundImagePlacement({
      imagePixelSize: this.config.backgroundImagePixelSize,
      layout: this.config.backgroundImageLayout,
      layoutContext: this.config.backgroundLayoutContext,
      renderScaleX,
      renderScaleY,
      sourceHeight: this.sourceTexture.height,
      sourceWidth: this.sourceTexture.width,
      targetHeight: configuredHeight,
      targetWidth: configuredWidth,
    });
    if (layout.tile) {
      this.sourceSprite.visible = false;
      this.sourceSprite.texture = Texture.EMPTY;
      this.sourceTilingSprite.visible = true;
      this.sourceTilingSprite.texture = this.sourceTexture;
      this.sourceTilingSprite.position.set(layout.x, layout.y);
      this.sourceTilingSprite.setSize(layout.width, layout.height);
      this.sourceTilingSprite.tilePosition.set(layout.tileX || 0, layout.tileY || 0);
      this.sourceTilingSprite.tileScale.set(layout.tileScaleX, layout.tileScaleY);
    } else {
      this.sourceTilingSprite.visible = false;
      this.sourceTilingSprite.texture = Texture.EMPTY;
      this.sourceSprite.visible = true;
      this.sourceSprite.texture = this.sourceTexture;
      this.sourceSprite.position.set(layout.x, layout.y);
      this.sourceSprite.setSize(layout.width, layout.height);
    }
    this.app.renderer.render({ container: this.sourceContainer, target: this.effectPipeline.sourceRenderTexture, clear: true });
  }

  scheduleRender() {
    if (this.destroyed || this.pendingFrame != null) return;
    this.pendingFrame = window.requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.render();
    });
  }

  render() {
    if (!this.app || !this.effectPipeline || !this.sourceTexture || !this.displaySprite) return;
    const renderSize = this.getRenderSize();
    this.app.renderer.resize(renderSize.width, renderSize.height);
    this.updateCanvasCoverStyle(renderSize);
    const effectPlan = createBackgroundEffectPlan(this.config);
    if (this.effectPipeline.ensureRenderTextures(renderSize, effectPlan)) {
      this.sourceDirty = true;
      this.blurDirty = true;
      this.compositeDirty = true;
      this.lastBlurKey = "";
      this.lastAcrylicKey = "";
    }
    if (!this.effectPipeline.hasRenderTextures) return;

    if (this.sourceDirty) {
      this.renderSourceToTexture(renderSize);
      this.sourceDirty = false;
      this.blurDirty = true;
      this.compositeDirty = true;
    }

    const blurKey = this.getBlurKey();
    if (this.blurDirty || blurKey !== this.lastBlurKey) {
      this.effectPipeline.renderBlur(effectPlan, this.getConfiguredRenderSize());
      this.lastBlurKey = blurKey;
      this.blurDirty = false;
      this.compositeDirty = true;
    }

    if (this.config.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) {
      const acrylicKey = makeAcrylicKey(this.config);
      if (this.compositeDirty || acrylicKey !== this.lastAcrylicKey) {
        this.effectPipeline.renderAcrylicComposite(effectPlan.acrylic);
        this.lastAcrylicKey = acrylicKey;
        this.compositeDirty = false;
      }
      this.displaySprite.texture = this.effectPipeline.finalRenderTexture;
      this.displaySprite.alpha = 1;
    } else {
      this.displaySprite.texture = this.effectPipeline.finalBlurTexture;
      this.displaySprite.alpha = effectPlan.opacity;
    }

    this.displaySprite.position.set(0, 0);
    this.displaySprite.setSize(renderSize.width, renderSize.height);
    this.app.renderer.render({ container: this.app.stage, clear: true });
    this.onRender?.();
  }

  destroy() {
    this.destroyed = true;
    this.textureLoadGeneration += 1;
    if (this.pendingFrame != null) {
      window.cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
    this.effectPipeline?.destroy();
    this.effectPipeline = null;
    if (this.sourceSprite) this.sourceSprite.texture = Texture.EMPTY;
    if (this.sourceTilingSprite) this.sourceTilingSprite.texture = Texture.EMPTY;
    destroyTexture(this.sourceTexture);
    this.sourceTexture = null;
    this.sourceContainer?.destroy?.({ children: true });
    this.app?.stage?.removeChild(this.displaySprite);
    this.displaySprite?.destroy?.();
    this.host?.replaceChildren?.();
    this.app?.destroy?.(false, { children: true });
    this.app = null;
    this.sourceContainer = null;
    this.sourceSprite = null;
    this.sourceTilingSprite = null;
    this.displaySprite = null;
    this.host = null;
    this.onRender = null;
  }
}
