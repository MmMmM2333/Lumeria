<template>
  <div
    :class="[
      'settings-background-preview',
      'settings-background-effect-preview',
      `settings-background-effect-preview-${effectClass}`,
      usesPixiEffect && 'settings-background-effect-preview-pixi',
      !hasImage && 'settings-background-preview-empty',
    ]"
    :style="previewStyle"
    aria-label="图片效果预览"
  >
    <span class="settings-background-preview-base" aria-hidden="true" />
    <span
      v-if="usesPixiEffect"
      ref="pixiHostRef"
      class="settings-background-preview-pixi-host"
      aria-hidden="true"
    />
    <span v-else-if="hasImage" class="settings-background-preview-image" aria-hidden="true" />
    <span class="settings-background-preview-darken" aria-hidden="true" />
    <span v-if="!hasImage" class="settings-background-preview-label">{{ emptyLabel }}</span>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  clampBackgroundBaseOpacity,
  clampBackgroundDarkenStrength,
  clampBackgroundImageOpacity,
  normalizeBackgroundBaseColor,
  normalizeBackgroundDarkenColor,
} from "../composables/useLaunchpadSettingsConfig.js";
import { BackgroundEffectPreviewRenderer } from "../rendering/pixi/background/backgroundEffectPreviewRenderer.js";

const DEFAULT_RENDER_WIDTH = 960;
const DEFAULT_RENDER_HEIGHT = 540;

const props = defineProps({
  backgroundAcrylicParams: { type: Object, default: () => ({}) },
  backgroundBaseColor: { type: String, required: true },
  backgroundBaseOpacity: { type: Number, required: true },
  backgroundBlurStrength: { type: Number, required: true },
  backgroundDarkenColor: { type: String, required: true },
  backgroundDarkenStrength: { type: Number, required: true },
  backgroundEffect: { type: String, required: true },
  backgroundImageOpacity: { type: Number, required: true },
  backgroundImagePath: { type: String, default: null },
  backgroundImageUrl: { type: String, default: null },
  emptyLabel: { type: String, default: "选择图片后可用" },
});

const pixiHostRef = ref(null);
const renderSize = ref({ height: DEFAULT_RENDER_HEIGHT, width: DEFAULT_RENDER_WIDTH });
let previewRenderer = null;
let rendererGeneration = 0;

const hasImage = computed(() => Boolean(props.backgroundImageUrl));
const usesPixiEffect = computed(() => Boolean(
  hasImage.value
  && (props.backgroundEffect === BACKGROUND_EFFECT_BLUR || props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL)
));
const effectClass = computed(() => {
  if (props.backgroundEffect === BACKGROUND_EFFECT_DIMMED) return "dimmed";
  if (props.backgroundEffect === BACKGROUND_EFFECT_BLUR) return "blur";
  if (props.backgroundEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) return "acrylic";
  return "none";
});
const previewStyle = computed(() => ({
  "--settings-background-preview-base-color": normalizeBackgroundBaseColor(props.backgroundBaseColor),
  "--settings-background-preview-base-opacity": `${clampBackgroundBaseOpacity(props.backgroundBaseOpacity) / 100}`,
  "--settings-background-preview-image": hasImage.value ? `url(${JSON.stringify(props.backgroundImageUrl)})` : "none",
  "--settings-background-preview-image-opacity": `${hasImage.value ? clampBackgroundImageOpacity(props.backgroundImageOpacity) / 100 : 0}`,
  "--settings-background-preview-darken-color": normalizeBackgroundDarkenColor(props.backgroundDarkenColor),
  "--settings-background-preview-darken-opacity": `${hasImage.value && props.backgroundEffect === BACKGROUND_EFFECT_DIMMED ? clampBackgroundDarkenStrength(props.backgroundDarkenStrength) / 100 : 0}`,
}));

function readRenderSize() {
  const width = Math.round(window.innerWidth || DEFAULT_RENDER_WIDTH);
  const height = Math.round(window.innerHeight || DEFAULT_RENDER_HEIGHT);
  if (width === renderSize.value.width && height === renderSize.value.height) return;
  renderSize.value = { height, width };
}

function getRendererConfig() {
  return {
    backgroundAcrylicParams: props.backgroundAcrylicParams,
    backgroundBlurStrength: props.backgroundBlurStrength,
    backgroundEffect: props.backgroundEffect,
    backgroundImageOpacity: props.backgroundImageOpacity,
    backgroundImagePath: props.backgroundImagePath,
    backgroundImageUrl: props.backgroundImageUrl,
    renderHeight: renderSize.value.height,
    renderWidth: renderSize.value.width,
  };
}

function destroyPreviewRenderer() {
  rendererGeneration += 1;
  previewRenderer?.destroy();
  previewRenderer = null;
}

async function ensurePreviewRenderer() {
  if (!usesPixiEffect.value) {
    destroyPreviewRenderer();
    return;
  }
  await nextTick();
  const host = pixiHostRef.value;
  if (!host) return;
  if (previewRenderer) {
    previewRenderer.setConfig(getRendererConfig());
    return;
  }

  const generation = ++rendererGeneration;
  const renderer = new BackgroundEffectPreviewRenderer(host);
  previewRenderer = renderer;
  try {
    await renderer.init();
    if (generation !== rendererGeneration || previewRenderer !== renderer) {
      renderer.destroy();
      return;
    }
    renderer.setConfig(getRendererConfig());
  } catch (error) {
    if (generation === rendererGeneration && previewRenderer === renderer) {
      destroyPreviewRenderer();
    }
    console.warn("Failed to initialize background effect preview", error);
  }
}

onMounted(() => {
  readRenderSize();
  window.addEventListener("resize", readRenderSize);
  void ensurePreviewRenderer();
});

onBeforeUnmount(() => {
  destroyPreviewRenderer();
  window.removeEventListener("resize", readRenderSize);
});

watch(
  () => [
    usesPixiEffect.value,
    props.backgroundImagePath,
    props.backgroundImageUrl,
    props.backgroundEffect,
    props.backgroundImageOpacity,
    props.backgroundBlurStrength,
    props.backgroundAcrylicParams?.brightness,
    props.backgroundAcrylicParams?.contrast,
    props.backgroundAcrylicParams?.noise,
    props.backgroundAcrylicParams?.saturation,
    props.backgroundAcrylicParams?.seed,
    props.backgroundAcrylicParams?.tintStrength,
    props.backgroundAcrylicParams?.tintColor?.[0],
    props.backgroundAcrylicParams?.tintColor?.[1],
    props.backgroundAcrylicParams?.tintColor?.[2],
    renderSize.value.width,
    renderSize.value.height,
  ],
  ensurePreviewRenderer,
  { immediate: true }
);
</script>
