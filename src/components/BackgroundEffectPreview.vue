<template>
  <div
    ref="rootRef"
    :class="[
      'settings-background-preview',
      'settings-background-effect-preview',
      `settings-background-effect-preview-${effectClass}`,
      shouldRenderPixiHost && 'settings-background-effect-preview-pixi',
      shouldRenderPixiHost && !shouldShowPixiHost && 'settings-background-effect-preview-pixi-loading',
      !hasImage && 'settings-background-preview-empty',
    ]"
    :style="previewStyle"
    :aria-label="t('preview.effect')"
  >
    <span class="settings-background-preview-base" aria-hidden="true" />
    <BackgroundImagePreviewCanvas
      v-if="hasImage && isCanvasPreviewVisible"
      class="settings-background-effect-preview-fallback"
      :aria-label="t('preview.effectFallback')"
      :background-base-color="backgroundBaseColor"
      :background-base-opacity="0"
      :background-darken-color="backgroundDarkenColor"
      :background-darken-strength="canvasDarkenStrength"
      :background-image-layout="backgroundImageLayout"
      :background-image-opacity="backgroundImageOpacity"
      :background-image-pixel-size="backgroundImagePixelSize"
      :background-image-url="backgroundImageUrl"
      :background-layout-context="backgroundLayoutContext"
      :empty-label="resolvedEmptyLabel"
    />
    <span
      v-if="shouldRenderPixiHost"
      ref="pixiHostRef"
      :class="[
        'settings-background-preview-pixi-host',
        !shouldShowPixiHost && 'settings-background-preview-pixi-host-hidden',
      ]"
      aria-hidden="true"
    />
    <span v-if="!hasImage" class="settings-background-preview-label">{{ resolvedEmptyLabel }}</span>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BackgroundImagePreviewCanvas from "./BackgroundImagePreviewCanvas.vue";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  clampBackgroundBaseOpacity,
  normalizeBackgroundBaseColor,
} from "../composables/useLaunchpadSettingsConfig.js";
import {
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
} from "../domain/backgroundImageLayout.js";
import {
  BackgroundEffectPreviewRenderer,
  backgroundEffectUsesPixi,
  isKawaseDebugEnabled,
  useKawaseDebugOverrideEnabled,
  useKawaseDebugParams,
} from "../rendering/backgroundPort.js";
import { useLocalization } from "../i18n/localization.js";

const DEFAULT_RENDER_WIDTH = 960;
const DEFAULT_RENDER_HEIGHT = 540;
const DEFAULT_PREVIEW_WIDTH = 320;
const DEFAULT_PREVIEW_HEIGHT = 180;

const props = defineProps({
  active: { type: Boolean, default: true },
  backgroundAcrylicParams: { type: Object, default: () => ({}) },
  backgroundBaseColor: { type: String, required: true },
  backgroundBaseOpacity: { type: Number, required: true },
  backgroundBlurStrength: { type: Number, required: true },
  backgroundDarkenColor: { type: String, required: true },
  backgroundDarkenStrength: { type: Number, required: true },
  backgroundEffect: { type: String, required: true },
  backgroundImageLayout: { type: String, default: DEFAULT_BACKGROUND_IMAGE_LAYOUT },
  backgroundImageOpacity: { type: Number, required: true },
  backgroundImagePath: { type: String, default: null },
  backgroundImagePixelSize: { type: Object, default: null },
  backgroundImageUrl: { type: String, default: null },
  backgroundLayoutContext: { type: Object, default: null },
  emptyLabel: { type: String, default: "" },
});

const { t } = useLocalization();
const resolvedEmptyLabel = computed(() => props.emptyLabel || t("preview.selectImageFirst"));
const pixiHostRef = ref(null);
const rootRef = ref(null);
const renderSize = ref({ height: DEFAULT_RENDER_HEIGHT, width: DEFAULT_RENDER_WIDTH });
const previewSize = ref({ height: DEFAULT_PREVIEW_HEIGHT, width: DEFAULT_PREVIEW_WIDTH });
const isPixiReady = ref(false);
const kawaseDebugParams = useKawaseDebugParams();
const kawaseDebugOverrideEnabled = useKawaseDebugOverrideEnabled();
let previewRenderer = null;
let rendererGeneration = 0;
let previewResizeObserver = null;
let pixiTextureKey = "";
let pendingRendererConfigKey = "";
let renderedRendererConfigKey = "";

const hasImage = computed(() => Boolean(props.backgroundImageUrl));
const usesPixiEffect = computed(() => Boolean(
  hasImage.value
  && backgroundEffectUsesPixi(props.backgroundEffect)
));
const shouldRenderPixiHost = computed(() => usesPixiEffect.value);
const shouldShowPixiHost = computed(() => Boolean(usesPixiEffect.value && isPixiReady.value));
const isCanvasPreviewVisible = computed(() => !shouldShowPixiHost.value);
const canvasDarkenStrength = computed(() => (
  props.backgroundEffect === BACKGROUND_EFFECT_DIMMED ? props.backgroundDarkenStrength : 0
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
}));

function readRenderSize() {
  if (typeof window === "undefined") return;
  const width = Math.round(window.innerWidth || DEFAULT_RENDER_WIDTH);
  const height = Math.round(window.innerHeight || DEFAULT_RENDER_HEIGHT);
  if (width !== renderSize.value.width || height !== renderSize.value.height) {
    renderSize.value = { height, width };
  }
  const element = rootRef.value;
  const elementWidth = Number(element?.offsetWidth || element?.clientWidth || 0);
  const elementHeight = Number(element?.offsetHeight || element?.clientHeight || 0);
  const previewWidth = Math.max(1, Math.round(elementWidth || DEFAULT_PREVIEW_WIDTH));
  const previewHeight = Math.max(1, Math.round(elementHeight || DEFAULT_PREVIEW_HEIGHT));
  if (previewWidth !== previewSize.value.width || previewHeight !== previewSize.value.height) {
    previewSize.value = { height: previewHeight, width: previewWidth };
  }
}

function makePixiTextureKey() {
  return `${props.backgroundImagePath || ""}|${props.backgroundImageUrl || ""}`;
}

function getRendererConfig() {
  return {
    backgroundAcrylicParams: props.backgroundAcrylicParams,
    backgroundBlurStrength: props.backgroundBlurStrength,
    backgroundEffect: props.backgroundEffect,
    backgroundImageLayout: props.backgroundImageLayout,
    backgroundImageOpacity: props.backgroundImageOpacity,
    backgroundImagePath: props.backgroundImagePath,
    backgroundImagePixelSize: props.backgroundImagePixelSize,
    backgroundImagePrecomposed: false,
    backgroundImageUrl: props.backgroundImageUrl,
    backgroundLayoutContext: props.backgroundLayoutContext,
    dualKawaseParams: isKawaseDebugEnabled && kawaseDebugOverrideEnabled.value ? kawaseDebugParams : null,
    layoutHeight: renderSize.value.height,
    layoutWidth: renderSize.value.width,
    renderHeight: previewSize.value.height,
    renderWidth: previewSize.value.width,
  };
}

function makeRendererConfigKey(config) {
  return JSON.stringify({
    acrylicBrightness: config.backgroundAcrylicParams?.brightness,
    acrylicContrast: config.backgroundAcrylicParams?.contrast,
    acrylicNoise: config.backgroundAcrylicParams?.noise,
    acrylicSaturation: config.backgroundAcrylicParams?.saturation,
    acrylicSeed: config.backgroundAcrylicParams?.seed,
    acrylicTintStrength: config.backgroundAcrylicParams?.tintStrength,
    acrylicTintColor: config.backgroundAcrylicParams?.tintColor,
    blurStrength: config.backgroundBlurStrength,
    gaussianCutoff: config.dualKawaseParams?.gaussianCutoff,
    acrylicGaussianCutoff: config.dualKawaseParams?.acrylicGaussianCutoff,
    gaussianMaxRadiusPx: config.dualKawaseParams?.gaussianMaxRadiusPx,
    gaussianRadiusPx: config.dualKawaseParams?.gaussianRadiusPx,
    gaussianRadiusScale: config.dualKawaseParams?.gaussianRadiusScale,
    kernel: config.dualKawaseParams?.kernel,
    kawaseOffsetScale: config.dualKawaseParams?.offsetScale,
    kawasePassCount: config.dualKawaseParams?.passCount,
    testStrength: config.dualKawaseParams?.testStrength,
    effect: config.backgroundEffect,
    imageHeight: config.backgroundImagePixelSize?.height,
    imageLayout: config.backgroundImageLayout,
    imageOpacity: config.backgroundImageOpacity,
    imagePath: config.backgroundImagePath,
    imageUrl: config.backgroundImageUrl,
    imageWidth: config.backgroundImagePixelSize?.width,
    monitorPhysicalHeight: config.backgroundLayoutContext?.monitorPhysicalHeight,
    monitorPhysicalWidth: config.backgroundLayoutContext?.monitorPhysicalWidth,
    monitorPhysicalX: config.backgroundLayoutContext?.monitorPhysicalX,
    monitorPhysicalY: config.backgroundLayoutContext?.monitorPhysicalY,
    monitorScaleFactor: config.backgroundLayoutContext?.monitorScaleFactor,
    layoutHeight: config.layoutHeight,
    layoutWidth: config.layoutWidth,
    renderHeight: config.renderHeight,
    renderWidth: config.renderWidth,
    windowPhysicalX: config.backgroundLayoutContext?.windowPhysicalX,
    windowPhysicalY: config.backgroundLayoutContext?.windowPhysicalY,
  });
}

function destroyPreviewRenderer() {
  rendererGeneration += 1;
  previewRenderer?.destroy();
  previewRenderer = null;
  isPixiReady.value = false;
  pixiTextureKey = "";
  pendingRendererConfigKey = "";
  renderedRendererConfigKey = "";
}

async function ensurePreviewRenderer() {
  if (!usesPixiEffect.value) {
    destroyPreviewRenderer();
    return;
  }
  if (!props.active) return;

  const nextTextureKey = makePixiTextureKey();
  if (!previewRenderer || nextTextureKey !== pixiTextureKey) {
    isPixiReady.value = false;
  }
  pixiTextureKey = nextTextureKey;

  await nextTick();
  const host = pixiHostRef.value;
  if (!host) return;
  const config = getRendererConfig();
  const configKey = makeRendererConfigKey(config);
  if (usesPixiEffect.value && renderedRendererConfigKey !== configKey) {
    isPixiReady.value = false;
  }
  if (previewRenderer) {
    pendingRendererConfigKey = configKey;
    previewRenderer.setConfig(config);
    return;
  }

  const generation = ++rendererGeneration;
  const renderer = new BackgroundEffectPreviewRenderer(host, {
    onRender: () => {
      if (generation === rendererGeneration && previewRenderer === renderer) {
        renderedRendererConfigKey = pendingRendererConfigKey;
        isPixiReady.value = true;
      }
    },
  });
  previewRenderer = renderer;
  try {
    await renderer.init();
    if (generation !== rendererGeneration || previewRenderer !== renderer) {
      renderer.destroy();
      return;
    }
    pendingRendererConfigKey = configKey;
    renderer.setConfig(config);
  } catch (error) {
    if (generation === rendererGeneration && previewRenderer === renderer) {
      destroyPreviewRenderer();
    }
    console.warn("Failed to initialize background effect preview", error);
  }
}

onMounted(() => {
  observePreviewSize();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", readRenderSize);
  }
  void ensurePreviewRenderer();
});

onBeforeUnmount(() => {
  destroyPreviewRenderer();
  disconnectPreviewResizeObserver();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", readRenderSize);
  }
});

function disconnectPreviewResizeObserver() {
  previewResizeObserver?.disconnect?.();
  previewResizeObserver = null;
}

function observePreviewSize() {
  disconnectPreviewResizeObserver();
  const element = rootRef.value;
  if (!element || typeof ResizeObserver === "undefined") {
    readRenderSize();
    return;
  }
  previewResizeObserver = new ResizeObserver(readRenderSize);
  previewResizeObserver.observe(element);
  readRenderSize();
}

watch(
  () => [
    props.active,
    usesPixiEffect.value,
    props.backgroundImagePath,
    props.backgroundImagePixelSize?.width,
    props.backgroundImagePixelSize?.height,
    props.backgroundImageUrl,
    props.backgroundLayoutContext?.monitorPhysicalX,
    props.backgroundLayoutContext?.monitorPhysicalY,
    props.backgroundLayoutContext?.monitorPhysicalWidth,
    props.backgroundLayoutContext?.monitorPhysicalHeight,
    props.backgroundLayoutContext?.monitorScaleFactor,
    props.backgroundLayoutContext?.windowPhysicalX,
    props.backgroundLayoutContext?.windowPhysicalY,
    props.backgroundEffect,
    props.backgroundImageLayout,
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
    kawaseDebugParams.gaussianCutoff,
    kawaseDebugParams.acrylicGaussianCutoff,
    kawaseDebugParams.gaussianMaxRadiusPx,
    kawaseDebugParams.gaussianRadiusPx,
    kawaseDebugParams.gaussianRadiusScale,
    kawaseDebugParams.kernel,
    kawaseDebugParams.offsetScale,
    kawaseDebugParams.passCount,
    kawaseDebugParams.testStrength,
    kawaseDebugOverrideEnabled.value,
    renderSize.value.width,
    renderSize.value.height,
    previewSize.value.width,
    previewSize.value.height,
  ],
  ensurePreviewRenderer,
  { immediate: true }
);
</script>
