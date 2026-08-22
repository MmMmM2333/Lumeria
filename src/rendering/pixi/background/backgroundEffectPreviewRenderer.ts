import {
  Application,
  Container,
  Sprite,
  Texture,
  TilingSprite,
  type Renderer,
} from "pixi.js";
import { loadCachedBackgroundImageDataUrl } from "../../../api/launchpadApi.js";
import { resolveBackgroundImagePlacement } from "../../../domain/backgroundImageLayout.js";
import type { WindowsImagePlacementContext } from "../../../domain/backgroundImageLayout.js";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
} from "../../../domain/backgroundSettings.js";
import {
  createBackgroundEffectPlan,
  resolveAcrylicRenderSize,
} from "./acrylicBackgroundPlan.js";
import { loadBackgroundTextureFromImage } from "./backgroundTextureLoader.js";
import { BackgroundEffectPipeline, destroyTexture } from "./backgroundEffectPipeline.js";

const DEFAULT_PREVIEW_WIDTH = 320;
const DEFAULT_PREVIEW_HEIGHT = 180;
const PREVIEW_TEXTURE_SCALE = 2;

type PreviewSize = Readonly<{ height: number; width: number }>;

type BackgroundEffectPreviewConfig = Readonly<{
  backgroundAcrylicParams?: unknown;
  backgroundBlurStrength?: unknown;
  backgroundEffect?: unknown;
  backgroundImageLayout?: unknown;
  backgroundImageOpacity?: unknown;
  backgroundImagePath?: string | null;
  backgroundImagePixelSize?: Readonly<{ height: unknown; width: unknown }> | null;
  backgroundImagePrecomposed?: unknown;
  backgroundImageUrl?: string | null;
  backgroundLayoutContext?: WindowsImagePlacementContext | null;
  dualKawaseParams?: unknown;
  layoutHeight?: unknown;
  layoutWidth?: unknown;
  renderHeight?: unknown;
  renderWidth?: unknown;
}>;

type BackgroundEffectPreviewRendererOptions = Readonly<{
  onRender?: (() => void) | null;
}>;

function clampRenderSize(value: unknown, fallback: number): number {
  const size = Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.max(16, Math.round(size));
}

export function resolveBackgroundEffectPreviewSizes(
  config: BackgroundEffectPreviewConfig = {},
): { layoutSize: PreviewSize; renderSize: PreviewSize } {
  const renderWidth = clampRenderSize(config.renderWidth, DEFAULT_PREVIEW_WIDTH);
  const renderHeight = clampRenderSize(config.renderHeight, DEFAULT_PREVIEW_HEIGHT);
  return {
    layoutSize: {
      height: clampRenderSize(config.layoutHeight, renderHeight),
      width: clampRenderSize(config.layoutWidth, renderWidth),
    },
    renderSize: resolveAcrylicRenderSize(renderWidth, renderHeight),
  };
}

async function resolveTextureSource(
  config: BackgroundEffectPreviewConfig,
  backgroundImageUrl: string,
): Promise<string> {
  if (!config.backgroundImagePath) return backgroundImageUrl;
  try {
    return await loadCachedBackgroundImageDataUrl(config.backgroundImagePath) || backgroundImageUrl;
  } catch (error) {
    console.warn("Failed to load WebGL-safe background preview image", error);
    return backgroundImageUrl;
  }
}

function makeAcrylicKey(config: BackgroundEffectPreviewConfig): string {
  return JSON.stringify(createBackgroundEffectPlan(config).acrylic);
}

function makePlacementKey(config: BackgroundEffectPreviewConfig): string {
  return JSON.stringify({
    imagePrecomposed: Boolean(config.backgroundImagePrecomposed),
    imageHeight: config.backgroundImagePixelSize?.height || null,
    imageWidth: config.backgroundImagePixelSize?.width || null,
    layout: config.backgroundImageLayout || null,
    layoutHeight: config.layoutHeight || null,
    layoutWidth: config.layoutWidth || null,
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
  host: HTMLElement | null;
  onRender: (() => void) | null;
  app: Application<Renderer> | null;
  sourceTexture: Texture | null;
  sourceSprite: Sprite | null;
  sourceTilingSprite: TilingSprite | null;
  sourceContainer: Container | null;
  displaySprite: Sprite | null;
  effectPipeline: BackgroundEffectPipeline | null;
  config: BackgroundEffectPreviewConfig;
  lastBlurKey: string;
  lastAcrylicKey: string;
  textureKey: string;
  sourceDirty: boolean;
  blurDirty: boolean;
  compositeDirty: boolean;
  textureLoadGeneration: number;
  pendingFrame: number | null;
  destroyed: boolean;

  constructor(host: HTMLElement, options: BackgroundEffectPreviewRendererOptions = {}) {
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

  async init(): Promise<void> {
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

  setConfig(config: BackgroundEffectPreviewConfig): void {
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

  async loadTexture(): Promise<void> {
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
      const textureSource = await resolveTextureSource(this.config, source);
      const renderSize = this.getRenderSize();
      const textureMaxSize = Math.max(renderSize.width, renderSize.height) * PREVIEW_TEXTURE_SCALE;
      const texture = await loadBackgroundTextureFromImage(textureSource, {
        maxHeight: textureMaxSize,
        maxWidth: textureMaxSize,
      });
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

  clearStage(): void {
    if (!this.app || !this.displaySprite) return;
    this.displaySprite.texture = Texture.EMPTY;
    this.app.renderer.render({ container: this.app.stage, clear: true });
  }

  getRenderSize(): PreviewSize {
    return resolveBackgroundEffectPreviewSizes(this.config).renderSize;
  }

  getLayoutSize(): PreviewSize {
    return resolveBackgroundEffectPreviewSizes(this.config).layoutSize;
  }

  getRenderSizeKey(): string {
    const renderSize = this.getRenderSize();
    return `${renderSize.width}x${renderSize.height}`;
  }

  getBlurKey(): string {
    const renderSize = this.getRenderSize();
    const layoutSize = this.getLayoutSize();
    const blur = createBackgroundEffectPlan(this.config).blur;
    return JSON.stringify({
      downOffsets: blur.downOffsets,
      finalUpOffset: blur.finalUpOffset,
      gaussianRadiusPx: blur.gaussianRadiusPx,
      height: renderSize.height,
      imageLayout: this.config.backgroundImageLayout || "",
      kernel: blur.kernel,
      layoutHeight: layoutSize.height,
      layoutWidth: layoutSize.width,
      offsetScale: blur.offsetScale,
      passCount: blur.passCount,
      upOffsets: blur.upOffsets,
      width: renderSize.width,
    });
  }

  updateCanvasCoverStyle(renderSize: PreviewSize): void {
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

  renderSourceToTexture(renderSize: PreviewSize): void {
    if (
      !this.app
      || !this.sourceTexture
      || !this.sourceSprite
      || !this.sourceTilingSprite
      || !this.sourceContainer
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

    const { height: layoutHeight, width: layoutWidth } = this.getLayoutSize();
    const renderScaleX = Math.max(0.0001, renderSize.width / layoutWidth);
    const renderScaleY = Math.max(0.0001, renderSize.height / layoutHeight);
    const layout = resolveBackgroundImagePlacement({
      imagePixelSize: this.config.backgroundImagePixelSize,
      layout: this.config.backgroundImageLayout,
      layoutContext: this.config.backgroundLayoutContext,
      renderScaleX,
      renderScaleY,
      sourceHeight: this.sourceTexture.height,
      sourceWidth: this.sourceTexture.width,
      targetHeight: layoutHeight,
      targetWidth: layoutWidth,
    });
    if (layout.tile) {
      this.sourceSprite.visible = false;
      this.sourceSprite.texture = Texture.EMPTY;
      this.sourceTilingSprite.visible = true;
      this.sourceTilingSprite.texture = this.sourceTexture;
      this.sourceTilingSprite.position.set(layout.x, layout.y);
      this.sourceTilingSprite.setSize(layout.width, layout.height);
      this.sourceTilingSprite.tilePosition.set(layout.tileX || 0, layout.tileY || 0);
      const sourceScaleX = Math.max(0.0001, Number(this.config.backgroundImagePixelSize?.width) || this.sourceTexture.width)
        / Math.max(0.0001, this.sourceTexture.width);
      const sourceScaleY = Math.max(0.0001, Number(this.config.backgroundImagePixelSize?.height) || this.sourceTexture.height)
        / Math.max(0.0001, this.sourceTexture.height);
      this.sourceTilingSprite.tileScale.set(
        layout.tileScaleX! * sourceScaleX,
        layout.tileScaleY! * sourceScaleY
      );
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

  scheduleRender(): void {
    if (this.destroyed || this.pendingFrame != null) return;
    this.pendingFrame = window.requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.render();
    });
  }

  render(): void {
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
      this.effectPipeline.renderBlur(effectPlan, this.getLayoutSize());
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
      this.displaySprite.texture = this.effectPipeline.finalRenderTexture!;
      this.displaySprite.alpha = 1;
    } else {
      this.displaySprite.texture = this.effectPipeline.finalBlurTexture!;
      this.displaySprite.alpha = effectPlan.opacity;
    }

    this.displaySprite.position.set(0, 0);
    this.displaySprite.setSize(renderSize.width, renderSize.height);
    this.app.renderer.render({ container: this.app.stage, clear: true });
    this.onRender?.();
  }

  destroy(): void {
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
    if (this.app && this.displaySprite) this.app.stage.removeChild(this.displaySprite);
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
