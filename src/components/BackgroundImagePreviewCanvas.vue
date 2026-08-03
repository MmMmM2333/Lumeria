<template>
  <div
    ref="rootRef"
    :class="['settings-background-preview', !hasImage && 'settings-background-preview-empty']"
    :style="previewStyle"
    :aria-label="resolvedAriaLabel"
  >
    <span class="settings-background-preview-base" aria-hidden="true" />
    <canvas
      v-if="hasImage"
      ref="canvasRef"
      class="settings-background-preview-canvas settings-background-preview-canvas-layer"
      aria-hidden="true"
    />
    <span class="settings-background-preview-darken" aria-hidden="true" />
    <span v-if="!hasImage" class="settings-background-preview-label">{{ resolvedEmptyLabel }}</span>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  clampBackgroundBaseOpacity,
  clampBackgroundDarkenStrength,
  clampBackgroundImageOpacity,
  normalizeBackgroundBaseColor,
  normalizeBackgroundDarkenColor,
} from "../composables/useLaunchpadSettingsConfig.js";
import {
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
  normalizeBackgroundImageLayout,
  resolveBackgroundImagePlacement,
} from "../domain/backgroundImageLayout.js";
import { useLocalization } from "../i18n/localization.js";

const PREVIEW_SOURCE_CACHE_LIMIT = 4;
const PREVIEW_SOURCE_MAX_SIDE = 1440;
const FILL_OVERSCAN_SCALE = 1.02;
const previewSourceCache = new Map();

const props = defineProps({
  ariaLabel: { type: String, default: "" },
  backgroundBaseColor: { type: String, required: true },
  backgroundBaseOpacity: { type: Number, required: true },
  backgroundDarkenColor: { type: String, default: "#1c1c1c" },
  backgroundDarkenStrength: { type: Number, default: 0 },
  backgroundImageLayout: { type: String, default: DEFAULT_BACKGROUND_IMAGE_LAYOUT },
  backgroundImageOpacity: { type: Number, required: true },
  backgroundImagePixelSize: { type: Object, default: null },
  backgroundImageUrl: { type: String, default: null },
  backgroundLayoutContext: { type: Object, default: null },
  emptyLabel: { type: String, default: "" },
});

const { t } = useLocalization();
const resolvedAriaLabel = computed(() => props.ariaLabel || t("preview.image"));
const resolvedEmptyLabel = computed(() => props.emptyLabel || t("preview.selectImageFirst"));
const canvasRef = ref(null);
const rootRef = ref(null);
const hasImage = computed(() => Boolean(props.backgroundImageUrl));
let resizeObserver = null;
let renderFrame = null;
let renderGeneration = 0;

const previewStyle = computed(() => ({
  "--settings-background-preview-base-color": normalizeBackgroundBaseColor(props.backgroundBaseColor),
  "--settings-background-preview-base-opacity": `${clampBackgroundBaseOpacity(props.backgroundBaseOpacity) / 100}`,
  "--settings-background-preview-darken-color": normalizeBackgroundDarkenColor(props.backgroundDarkenColor),
  "--settings-background-preview-darken-opacity": `${hasImage.value ? clampBackgroundDarkenStrength(props.backgroundDarkenStrength) / 100 : 0}`,
}));

function toPositiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : fallback;
}

function readDevicePixelRatio() {
  const scale = Number(window.devicePixelRatio);
  return Number.isFinite(scale) && scale > 0 ? Math.min(3, Math.max(1, scale)) : 1;
}

function readElementSize() {
  const element = rootRef.value;
  return {
    height: toPositiveInteger(element?.offsetHeight || element?.clientHeight || 180),
    width: toPositiveInteger(element?.offsetWidth || element?.clientWidth || 320),
  };
}

function readRenderTargetSize(previewWidth, previewHeight) {
  if (typeof window === "undefined") {
    return { height: previewHeight, width: previewWidth };
  }
  return {
    height: Math.max(previewHeight, toPositiveInteger(window.innerHeight || previewHeight)),
    width: Math.max(previewWidth, toPositiveInteger(window.innerWidth || previewWidth)),
  };
}

function getSourceWidth(source) {
  return toPositiveInteger(source?.naturalWidth || source?.width);
}

function getSourceHeight(source) {
  return toPositiveInteger(source?.naturalHeight || source?.height);
}

function drawImageSmoothed(context, image, width, height) {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = toPositiveInteger(width);
  canvas.height = toPositiveInteger(height);
  return canvas;
}

function createIntermediateCanvas(image) {
  const sourceWidth = getSourceWidth(image);
  const sourceHeight = getSourceHeight(image);
  const longestSide = Math.max(sourceWidth, sourceHeight);
  if (longestSide <= PREVIEW_SOURCE_MAX_SIDE) return image;

  const scale = PREVIEW_SOURCE_MAX_SIDE / longestSide;
  const targetWidth = toPositiveInteger(sourceWidth * scale);
  const targetHeight = toPositiveInteger(sourceHeight * scale);
  let source = image;
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;

  while (Math.max(currentWidth / targetWidth, currentHeight / targetHeight) > 2) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
    const nextCanvas = createCanvas(nextWidth, nextHeight);
    const nextContext = nextCanvas.getContext("2d");
    if (!nextContext) break;
    drawImageSmoothed(nextContext, source, nextWidth, nextHeight);
    source = nextCanvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const output = createCanvas(targetWidth, targetHeight);
  const outputContext = output.getContext("2d");
  if (!outputContext) return source;
  drawImageSmoothed(outputContext, source, targetWidth, targetHeight);
  return output;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const resolveImage = async () => {
      if (settled) return;
      settled = true;
      try {
        await image.decode?.();
      } catch {
        // onload is enough for dimensions; decode just improves scheduling.
      }
      resolve(image);
    };
    image.decoding = "async";
    image.onload = resolveImage;
    image.onerror = () => reject(new Error(`Failed to load background preview image: ${url}`));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void resolveImage();
  });
}

async function loadPreviewSource(url) {
  if (!url) return null;
  if (previewSourceCache.has(url)) {
    const value = previewSourceCache.get(url);
    previewSourceCache.delete(url);
    previewSourceCache.set(url, value);
    return value;
  }

  const image = await loadImage(url);
  const value = {
    drawable: createIntermediateCanvas(image),
    height: getSourceHeight(image),
    width: getSourceWidth(image),
  };
  previewSourceCache.set(url, value);
  while (previewSourceCache.size > PREVIEW_SOURCE_CACHE_LIMIT) {
    previewSourceCache.delete(previewSourceCache.keys().next().value);
  }
  return value;
}

function applyFillOverscan(layout, previewWidth, previewHeight, imageLayout) {
  if (imageLayout !== BACKGROUND_IMAGE_LAYOUT_FILL || layout.tile) return layout;
  const centerX = previewWidth / 2;
  const centerY = previewHeight / 2;
  return {
    ...layout,
    height: layout.height * FILL_OVERSCAN_SCALE,
    width: layout.width * FILL_OVERSCAN_SCALE,
    x: centerX + ((layout.x || 0) - centerX) * FILL_OVERSCAN_SCALE,
    y: centerY + ((layout.y || 0) - centerY) * FILL_OVERSCAN_SCALE,
  };
}

function normalizeTileStart(offset, size) {
  if (!Number.isFinite(offset) || !Number.isFinite(size) || size <= 0) return 0;
  const remainder = offset % size;
  return remainder > 0 ? remainder - size : remainder;
}

function drawTiledImage(context, source, layout, previewWidth, previewHeight) {
  const tileWidth = Math.max(1, layout.tileWidth || source.width);
  const tileHeight = Math.max(1, layout.tileHeight || source.height);
  const startX = normalizeTileStart(layout.tileX || 0, tileWidth);
  const startY = normalizeTileStart(layout.tileY || 0, tileHeight);
  for (let y = startY; y < previewHeight; y += tileHeight) {
    for (let x = startX; x < previewWidth; x += tileWidth) {
      context.drawImage(source.drawable, x, y, tileWidth, tileHeight);
    }
  }
}

function drawPlacedImage(context, source, layout) {
  context.drawImage(
    source.drawable,
    layout.x || 0,
    layout.y || 0,
    Math.max(1, layout.width),
    Math.max(1, layout.height)
  );
}

function resolvePreviewLayout(source, previewWidth, previewHeight) {
  const imageLayout = normalizeBackgroundImageLayout(props.backgroundImageLayout);
  const usesRenderTargetPlacement = (
    imageLayout === BACKGROUND_IMAGE_LAYOUT_CENTER
    || imageLayout === BACKGROUND_IMAGE_LAYOUT_TILE
  );
  const targetSize = usesRenderTargetPlacement
    ? readRenderTargetSize(previewWidth, previewHeight)
    : { height: previewHeight, width: previewWidth };
  const targetWidth = targetSize.width;
  const targetHeight = targetSize.height;
  const layout = resolveBackgroundImagePlacement({
    imagePixelSize: props.backgroundImagePixelSize || { height: source.height, width: source.width },
    layout: imageLayout,
    layoutContext: usesRenderTargetPlacement ? props.backgroundLayoutContext : null,
    renderScaleX: usesRenderTargetPlacement ? previewWidth / Math.max(1, targetWidth) : 1,
    renderScaleY: usesRenderTargetPlacement ? previewHeight / Math.max(1, targetHeight) : 1,
    sourceHeight: source.height,
    sourceWidth: source.width,
    targetHeight,
    targetWidth,
  });
  return applyFillOverscan(layout, previewWidth, previewHeight, imageLayout);
}

function clearCanvas() {
  const canvas = canvasRef.value;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
}

async function renderCanvas(generation) {
  const canvas = canvasRef.value;
  if (!canvas || !props.backgroundImageUrl) {
    clearCanvas();
    return;
  }

  const { height, width } = readElementSize();
  const dpr = readDevicePixelRatio();
  const outputWidth = toPositiveInteger(width * dpr);
  const outputHeight = toPositiveInteger(height * dpr);
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;

  const source = await loadPreviewSource(props.backgroundImageUrl);
  if (generation !== renderGeneration || !source) return;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.globalAlpha = clampBackgroundImageOpacity(props.backgroundImageOpacity) / 100;

  const layout = resolvePreviewLayout(source, width, height);
  if (layout.tile) drawTiledImage(context, source, layout, width, height);
  else drawPlacedImage(context, source, layout);
  context.globalAlpha = 1;
}

function scheduleRender() {
  renderGeneration += 1;
  if (renderFrame != null) return;
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null;
    void renderCanvas(renderGeneration);
  });
}

function observeSize() {
  resizeObserver?.disconnect?.();
  const element = rootRef.value;
  if (!element || typeof ResizeObserver === "undefined") {
    scheduleRender();
    return;
  }
  resizeObserver = new ResizeObserver(scheduleRender);
  resizeObserver.observe(element);
  scheduleRender();
}

onMounted(async () => {
  await nextTick();
  observeSize();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", scheduleRender);
  }
});

onBeforeUnmount(() => {
  if (renderFrame != null && typeof window !== "undefined") {
    window.cancelAnimationFrame(renderFrame);
  }
  renderFrame = null;
  renderGeneration += 1;
  resizeObserver?.disconnect?.();
  resizeObserver = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleRender);
  }
});

watch(
  () => [
    props.backgroundBaseColor,
    props.backgroundBaseOpacity,
    props.backgroundDarkenColor,
    props.backgroundDarkenStrength,
    props.backgroundImageLayout,
    props.backgroundImageOpacity,
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
  ],
  scheduleRender,
  { flush: "post" }
);
</script>
