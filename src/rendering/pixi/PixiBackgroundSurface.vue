<template>
  <div class="pixi-background-surface" aria-hidden="true">
    <div v-if="isFallbackVisible" class="pixi-background-fallback" :style="fallbackImageStyle" />
    <div ref="hostRef" class="pixi-background-host" />
  </div>
</template>

<script setup>
import { Container, RenderTexture, Sprite, Texture } from "pixi.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { loadCachedBackgroundImageDataUrl } from "../../api/launchpadApi.js";
import { createPixiApp } from "./createPixiApp.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { createAcrylicCompositeFilter, createKawaseFilter } from "./background/acrylicFilters.js";
import { loadBackgroundTextureFromImage } from "./background/backgroundTextureLoader.js";
import { BACKGROUND_EFFECT_ACRYLIC_WEBGL, BACKGROUND_EFFECT_BLUR } from "../../composables/useLaunchpadSettingsConfig.js";
import {
  createDualKawaseLevels,
  resolveAcrylicBackgroundAlpha,
  resolveAcrylicRenderSize,
  resolveCoverLayout,
} from "./background/acrylicBackgroundPlan.js";

const props = defineProps({
  active: { type: Boolean, default: true },
  backgroundEffect: { type: String, default: BACKGROUND_EFFECT_BLUR },
  backgroundImageOpacity: { type: Number, default: 46 },
  backgroundImagePath: { type: String, default: null },
  backgroundImageUrl: { type: String, required: true },
});
const emit = defineEmits(["ready"]);

const hostRef = ref(null);
const isFallbackVisible = ref(true);
let app = null;
let sourceTexture = null;
let sourceSprite = null;
let sourceContainer = null;
let passSprite = null;
let displaySprite = null;
let downFilter = null;
let upFilter = null;
let compositeFilter = null;
let sourceRenderTexture = null;
let finalBlurTexture = null;
let finalRenderTexture = null;
let downTextures = [];
let upTextures = [];
let resizeObserver = null;
let destroyed = false;
let pendingAnimationFrame = null;
let textureLoadGeneration = 0;
let renderSizeKey = "";

const fallbackImageStyle = computed(() => ({
  backgroundImage: `url(${JSON.stringify(props.backgroundImageUrl)})`,
  opacity: resolveAcrylicBackgroundAlpha(props.backgroundImageOpacity),
}));

function destroyTexture(texture, destroySource = true) {
  if (!texture || texture.destroyed) return;
  texture.destroy(destroySource);
}

function destroyRenderTextures() {
  if (passSprite) passSprite.texture = Texture.EMPTY;
  if (displaySprite) displaySprite.texture = Texture.EMPTY;
  destroyTexture(sourceRenderTexture);
  destroyTexture(finalBlurTexture);
  destroyTexture(finalRenderTexture);
  for (const texture of downTextures) destroyTexture(texture);
  for (const texture of upTextures) destroyTexture(texture);
  sourceRenderTexture = null;
  finalBlurTexture = null;
  finalRenderTexture = null;
  downTextures = [];
  upTextures = [];
  renderSizeKey = "";
}

function createRenderTexture(width, height) {
  return RenderTexture.create({
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    resolution: 1,
  });
}

function ensureRenderTextures(width, height) {
  const renderSize = resolveAcrylicRenderSize(width, height);
  const levels = createDualKawaseLevels(renderSize.width, renderSize.height);
  const nextKey = [
    renderSize.width,
    renderSize.height,
    ...levels.map((level) => `${level.width}x${level.height}`),
  ].join("|");
  if (nextKey === renderSizeKey) return renderSize;

  destroyRenderTextures();
  renderSizeKey = nextKey;
  sourceRenderTexture = createRenderTexture(renderSize.width, renderSize.height);
  finalBlurTexture = createRenderTexture(renderSize.width, renderSize.height);
  finalRenderTexture = createRenderTexture(renderSize.width, renderSize.height);
  downTextures = levels.map((level) => createRenderTexture(level.width, level.height));
  upTextures = levels.map((level) => createRenderTexture(level.width, level.height));
  return renderSize;
}

function getHostSize() {
  const rect = hostRef.value?.getBoundingClientRect?.();
  return {
    height: Math.max(1, Math.round(rect?.height || window.innerHeight || 1)),
    width: Math.max(1, Math.round(rect?.width || window.innerWidth || 1)),
  };
}

function renderPass(inputTexture, outputTexture, filter) {
  if (!app || !passSprite || !inputTexture || !outputTexture) return;
  passSprite.texture = inputTexture;
  passSprite.position.set(0, 0);
  passSprite.setSize(outputTexture.width, outputTexture.height);
  passSprite.filters = filter ? [filter] : null;
  filter?.setInputSize?.(inputTexture.width, inputTexture.height);
  app.renderer.render({ container: passSprite, target: outputTexture, clear: true });
  passSprite.filters = null;
}

function renderSourceToTexture(renderSize) {
  if (!app || !sourceTexture || !sourceSprite || !sourceContainer || !sourceRenderTexture) return;
  const layout = resolveCoverLayout(
    sourceTexture.width,
    sourceTexture.height,
    renderSize.width,
    renderSize.height
  );
  sourceSprite.texture = sourceTexture;
  sourceSprite.position.set(layout.x, layout.y);
  sourceSprite.setSize(layout.width, layout.height);
  sourceContainer.position.set(0, 0);
  app.renderer.render({ container: sourceContainer, target: sourceRenderTexture, clear: true });
}

function renderBackgroundEffect() {
  if (!props.active || !app || !sourceTexture || !hostRef.value) return;
  const hostSize = getHostSize();
  const renderSize = ensureRenderTextures(hostSize.width, hostSize.height);
  if (!downTextures.length || !finalBlurTexture || !finalRenderTexture) return;

  renderSourceToTexture(renderSize);

  let currentTexture = sourceRenderTexture;
  for (let index = 0; index < downTextures.length; index += 1) {
    downFilter.setOffset(1 + index * 0.35);
    renderPass(currentTexture, downTextures[index], downFilter);
    currentTexture = downTextures[index];
  }

  for (let index = downTextures.length - 2; index >= 0; index -= 1) {
    upFilter.setOffset(1.1 + index * 0.25);
    renderPass(currentTexture, upTextures[index], upFilter);
    currentTexture = upTextures[index];
  }

  upFilter.setOffset(1.25);
  renderPass(currentTexture, finalBlurTexture, upFilter);

  if (props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) {
    compositeFilter.setAlpha(resolveAcrylicBackgroundAlpha(props.backgroundImageOpacity));
    renderPass(finalBlurTexture, finalRenderTexture, compositeFilter);
    displaySprite.texture = finalRenderTexture;
    displaySprite.alpha = 1;
  } else {
    displaySprite.texture = finalBlurTexture;
    displaySprite.alpha = resolveAcrylicBackgroundAlpha(props.backgroundImageOpacity);
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
  destroyRenderTextures();
  if (sourceSprite) sourceSprite.texture = Texture.EMPTY;
  destroyTexture(sourceTexture);
  sourceTexture = null;
  sourceContainer?.destroy?.({ children: true });
  passSprite?.destroy?.();
  app?.stage?.removeChild(displaySprite);
  displaySprite?.destroy?.();
  sourceSprite = null;
  sourceContainer = null;
  passSprite = null;
  displaySprite = null;
  downFilter?.destroy?.(true);
  upFilter?.destroy?.(true);
  compositeFilter?.destroy?.(true);
  downFilter = null;
  upFilter = null;
  compositeFilter = null;
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
  sourceContainer.addChild(sourceSprite);
  passSprite = new Sprite(Texture.EMPTY);
  displaySprite = new Sprite(Texture.EMPTY);
  downFilter = createKawaseFilter("launchpad-acrylic-downsample-filter", 1);
  upFilter = createKawaseFilter("launchpad-acrylic-upsample-filter", 1.15);
  compositeFilter = createAcrylicCompositeFilter();
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
