<template>
  <div class="pixi-background-surface" aria-hidden="true">
    <div v-if="isFallbackVisible" class="pixi-background-fallback" :style="fallbackImageStyle" />
    <div ref="hostRef" class="pixi-background-host" />
  </div>
</template>

<script setup>
import { Container, Sprite, Texture, TilingSprite } from "pixi.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { loadCachedBackgroundImageDataUrl } from "../../api/launchpadApi.js";
import { createPixiApp } from "./createPixiApp.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { isAcrylicDebugEnabled, useAcrylicDebugOverrideEnabled, useAcrylicDebugParams } from "./background/acrylicDebugParams.js";
import { isKawaseDebugEnabled, useKawaseDebugOverrideEnabled, useKawaseDebugParams } from "./background/kawaseDebugParams.js";
import { loadBackgroundTextureFromImage } from "./background/backgroundTextureLoader.js";
import { BackgroundEffectPipeline, destroyTexture } from "./background/backgroundEffectPipeline.js";
import {
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
  resolveBackgroundImagePlacement,
  resolveCssBackgroundImagePlacement,
} from "../../domain/backgroundImageLayout.js";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
} from "../../domain/backgroundSettings.js";
import {
  createBackgroundEffectPlan,
  resolveAcrylicBackgroundAlpha,
} from "./background/acrylicBackgroundPlan.js";

const props = defineProps({
  active: { type: Boolean, default: true },
  backgroundAcrylicParams: { type: Object, default: () => ({}) },
  backgroundEffect: { type: String, default: BACKGROUND_EFFECT_BLUR },
  backgroundBlurStrength: { type: Number, default: DEFAULT_BACKGROUND_BLUR_STRENGTH },
  backgroundImageOpacity: { type: Number, default: 46 },
  backgroundImageLayout: { type: String, default: DEFAULT_BACKGROUND_IMAGE_LAYOUT },
  backgroundImagePath: { type: String, default: null },
  backgroundImagePixelSize: { type: Object, default: null },
  backgroundImageUrl: { type: String, required: true },
  backgroundLayoutContext: { type: Object, default: null },
  backgroundViewportSize: { type: Object, default: () => ({ height: 1, width: 1 }) },
});
const emit = defineEmits(["ready"]);

const acrylicDebugParams = useAcrylicDebugParams();
const acrylicDebugOverrideEnabled = useAcrylicDebugOverrideEnabled();
const kawaseDebugParams = useKawaseDebugParams();
const kawaseDebugOverrideEnabled = useKawaseDebugOverrideEnabled();
const hostRef = ref(null);
const isFallbackVisible = ref(true);
let app = null;
let sourceTexture = null;
let sourceSprite = null;
let sourceTilingSprite = null;
let sourceContainer = null;
let displaySprite = null;
let effectPipeline = null;
let resizeObserver = null;
let destroyed = false;
let pendingAnimationFrame = null;
let textureLoadGeneration = 0;

const fallbackImageStyle = computed(() => ({
  backgroundImage: `url(${JSON.stringify(props.backgroundImageUrl)})`,
  ...resolveCssBackgroundImagePlacement(props.backgroundImageLayout, {
    imagePixelSize: props.backgroundImagePixelSize,
    layoutContext: props.backgroundLayoutContext,
    targetHeight: props.backgroundViewportSize?.height,
    targetWidth: props.backgroundViewportSize?.width,
  }),
  opacity: resolveAcrylicBackgroundAlpha(props.backgroundImageOpacity),
}));

function getHostSize() {
  const rect = hostRef.value?.getBoundingClientRect?.();
  return {
    height: Math.max(1, Math.round(rect?.height || window.innerHeight || 1)),
    width: Math.max(1, Math.round(rect?.width || window.innerWidth || 1)),
  };
}

function renderSourceToTexture(renderSize, hostSize) {
  if (
    !app
    || !sourceTexture
    || !sourceSprite
    || !sourceTilingSprite
    || !sourceContainer
    || !effectPipeline?.sourceRenderTexture
  ) return;
  const renderScaleX = Math.max(0.0001, renderSize.width / Math.max(1, hostSize.width));
  const renderScaleY = Math.max(0.0001, renderSize.height / Math.max(1, hostSize.height));
  const layout = resolveBackgroundImagePlacement({
    imagePixelSize: props.backgroundImagePixelSize,
    layout: props.backgroundImageLayout,
    layoutContext: props.backgroundLayoutContext,
    renderScaleX,
    renderScaleY,
    sourceHeight: sourceTexture.height,
    sourceWidth: sourceTexture.width,
    targetHeight: hostSize.height,
    targetWidth: hostSize.width,
  });
  if (layout.tile && sourceTilingSprite) {
    sourceSprite.visible = false;
    sourceSprite.texture = Texture.EMPTY;
    sourceTilingSprite.visible = true;
    sourceTilingSprite.texture = sourceTexture;
    sourceTilingSprite.position.set(layout.x, layout.y);
    sourceTilingSprite.setSize(layout.width, layout.height);
    sourceTilingSprite.tilePosition.set(layout.tileX || 0, layout.tileY || 0);
    sourceTilingSprite.tileScale.set(layout.tileScaleX, layout.tileScaleY);
  } else {
    sourceTilingSprite.visible = false;
    sourceTilingSprite.texture = Texture.EMPTY;
    sourceSprite.visible = true;
    sourceSprite.texture = sourceTexture;
    sourceSprite.position.set(layout.x, layout.y);
    sourceSprite.setSize(layout.width, layout.height);
  }
  sourceContainer.position.set(0, 0);
  app.renderer.render({ container: sourceContainer, target: effectPipeline.sourceRenderTexture, clear: true });
}

function renderBackgroundEffect() {
  if (!props.active || !app || !effectPipeline || !sourceTexture || !hostRef.value) return;
  const hostSize = getHostSize();
  const effectPlan = createBackgroundEffectPlan({
    acrylicParams: {
      ...props.backgroundAcrylicParams,
      ...(isAcrylicDebugEnabled && acrylicDebugOverrideEnabled.value ? acrylicDebugParams : null),
    },
    blurStrength: props.backgroundBlurStrength,
    dualKawaseParams: isKawaseDebugEnabled && kawaseDebugOverrideEnabled.value ? kawaseDebugParams : null,
    effect: props.backgroundEffect,
    opacity: props.backgroundImageOpacity,
  });
  const { renderSize } = effectPipeline.ensureRenderTexturesForTarget(
    hostSize.width,
    hostSize.height,
    effectPlan
  );
  if (!effectPipeline.hasRenderTextures) return;

  renderSourceToTexture(renderSize, hostSize);
  effectPipeline.renderBlur(effectPlan, hostSize);

  if (props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) {
    effectPipeline.renderAcrylicComposite(effectPlan.acrylic);
    displaySprite.texture = effectPipeline.finalRenderTexture;
    displaySprite.alpha = 1;
  } else {
    displaySprite.texture = effectPipeline.finalBlurTexture;
    displaySprite.alpha = effectPlan.opacity;
  }

  displaySprite.position.set(0, 0);
  displaySprite.setSize(hostSize.width, hostSize.height);
  app.renderer.render({ container: app.stage, clear: true });
  isFallbackVisible.value = false;
  emit("ready");
}

function clearPendingRender() {
  if (pendingAnimationFrame == null) return;
  window.cancelAnimationFrame(pendingAnimationFrame);
  pendingAnimationFrame = null;
}

function scheduleRender() {
  if (!props.active || destroyed || pendingAnimationFrame != null) return;
  pendingAnimationFrame = window.requestAnimationFrame(() => {
    pendingAnimationFrame = null;
    try {
      renderBackgroundEffect();
    } catch (error) {
      isFallbackVisible.value = true;
      console.error("Failed to render Pixi background effect", error);
    }
  });
}

async function resolveTextureSource(source) {
  if (!props.backgroundImagePath) return source;
  try {
    return await loadCachedBackgroundImageDataUrl(props.backgroundImagePath) || source;
  } catch (error) {
    console.warn("Failed to load WebGL-safe background image data", error);
    return source;
  }
}

async function loadBackgroundTexture(source) {
  const generation = ++textureLoadGeneration;
  if (!source) return;
  isFallbackVisible.value = true;
  try {
    const textureSource = await resolveTextureSource(source);
    const texture = await loadBackgroundTextureFromImage(textureSource);
    if (destroyed || generation !== textureLoadGeneration) {
      destroyTexture(texture);
      return;
    }
    const previousTexture = sourceTexture;
    sourceTexture = texture;
    destroyTexture(previousTexture);
    scheduleRender();
  } catch (error) {
    if (!destroyed && generation === textureLoadGeneration) {
      isFallbackVisible.value = true;
      console.error("Failed to render acrylic background", error);
    }
  }
}

function handleResize() {
  app?.resize?.();
  scheduleRender();
}

function destroyPixi(options = {}) {
  const deep = options.deep !== false;
  destroyed = true;
  textureLoadGeneration += 1;
  clearPendingRender();
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  effectPipeline?.destroy();
  effectPipeline = null;
  if (sourceSprite) sourceSprite.texture = Texture.EMPTY;
  if (sourceTilingSprite) sourceTilingSprite.texture = Texture.EMPTY;
  destroyTexture(sourceTexture);
  sourceTexture = null;
  sourceContainer?.destroy?.({ children: true });
  app?.stage?.removeChild(displaySprite);
  displaySprite?.destroy?.();
  sourceSprite = null;
  sourceTilingSprite = null;
  sourceContainer = null;
  displaySprite = null;
  const currentApp = app;
  app = null;
  if (deep) currentApp?.destroy(true, { children: true });
  else currentApp?.stop?.();
  hostRef.value?.replaceChildren?.();
}

onMounted(async () => {
  destroyed = false;
  let nextApp = null;
  try {
    nextApp = await createPixiApp(hostRef.value, {
      autoStart: false,
      className: "pixi-background-canvas",
      preference: ["webgl"],
    });
  } catch (error) {
    if (!destroyed) {
      isFallbackVisible.value = true;
      console.error("Failed to initialize acrylic background renderer", error);
    }
    return;
  }
  if (destroyed) {
    nextApp.destroy(true, { children: true });
    hostRef.value?.replaceChildren?.();
    return;
  }
  app = nextApp;
  sourceContainer = new Container();
  sourceSprite = new Sprite(Texture.EMPTY);
  sourceTilingSprite = new TilingSprite({ height: 1, texture: Texture.EMPTY, width: 1 });
  sourceTilingSprite.visible = false;
  sourceContainer.addChild(sourceSprite);
  sourceContainer.addChild(sourceTilingSprite);
  displaySprite = new Sprite(Texture.EMPTY);
  effectPipeline = new BackgroundEffectPipeline(app, {
    displaySprite,
    filterPrefix: "launchpad-acrylic",
  });
  app.stage.addChild(displaySprite);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  if (props.active) {
    await loadBackgroundTexture(props.backgroundImageUrl);
    scheduleRender();
  }
});

watch(
  () => [props.backgroundImagePath, props.backgroundImageUrl],
  ([, nextUrl]) => {
    if (props.active) void loadBackgroundTexture(nextUrl);
  }
);

watch(
  () => props.backgroundEffect,
  () => {
    scheduleRender();
  }
);

watch(
  () => props.backgroundImageOpacity,
  () => {
    scheduleRender();
  }
);

watch(
  () => props.backgroundImageLayout,
  () => {
    scheduleRender();
  }
);

watch(
  () => [
    props.backgroundImagePixelSize?.width,
    props.backgroundImagePixelSize?.height,
    props.backgroundLayoutContext?.monitorPhysicalX,
    props.backgroundLayoutContext?.monitorPhysicalY,
    props.backgroundLayoutContext?.monitorPhysicalWidth,
    props.backgroundLayoutContext?.monitorPhysicalHeight,
    props.backgroundLayoutContext?.monitorScaleFactor,
    props.backgroundLayoutContext?.windowPhysicalX,
    props.backgroundLayoutContext?.windowPhysicalY,
    props.backgroundViewportSize?.width,
    props.backgroundViewportSize?.height,
  ],
  () => {
    scheduleRender();
  }
);

watch(
  () => props.backgroundBlurStrength,
  () => {
    if (props.backgroundEffect === BACKGROUND_EFFECT_BLUR || props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) scheduleRender();
  }
);

watch(
  () => [
    props.backgroundAcrylicParams?.brightness,
    props.backgroundAcrylicParams?.contrast,
    props.backgroundAcrylicParams?.noise,
    props.backgroundAcrylicParams?.saturation,
    props.backgroundAcrylicParams?.seed,
    props.backgroundAcrylicParams?.tintStrength,
    props.backgroundAcrylicParams?.tintColor?.[0],
    props.backgroundAcrylicParams?.tintColor?.[1],
    props.backgroundAcrylicParams?.tintColor?.[2],
  ],
  () => {
    if (props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) scheduleRender();
  }
);

if (isAcrylicDebugEnabled) {
  watch(
    () => [
      acrylicDebugParams.brightness,
      acrylicDebugParams.contrast,
      acrylicDebugParams.noise,
      acrylicDebugParams.saturation,
      acrylicDebugParams.seed,
      acrylicDebugParams.tintStrength,
      acrylicDebugParams.tintColor[0],
      acrylicDebugParams.tintColor[1],
      acrylicDebugParams.tintColor[2],
      acrylicDebugOverrideEnabled.value,
    ],
    () => {
      if (props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) scheduleRender();
    }
  );
}

if (isKawaseDebugEnabled) {
  watch(
    () => [
      kawaseDebugParams.offsetScale,
      kawaseDebugParams.passCount,
      kawaseDebugParams.gaussianCutoff,
      kawaseDebugParams.acrylicGaussianCutoff,
      kawaseDebugParams.gaussianMaxRadiusPx,
      kawaseDebugParams.gaussianRadiusPx,
      kawaseDebugParams.gaussianRadiusScale,
      kawaseDebugParams.kernel,
      kawaseDebugParams.testStrength,
      kawaseDebugOverrideEnabled.value,
    ],
    () => {
      if (props.backgroundEffect === BACKGROUND_EFFECT_BLUR || props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) scheduleRender();
    }
  );
}

watch(
  () => props.active,
  (active) => {
    if (!active) {
      clearPendingRender();
      isFallbackVisible.value = true;
      return;
    }
    void loadBackgroundTexture(props.backgroundImageUrl);
    scheduleRender();
  }
);

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
