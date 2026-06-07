<template>
  <div class="pixi-drag-preview-overlay" aria-hidden="true">
    <div ref="hostRef" class="pixi-drag-preview-host" />
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { getFolderPreviewSlots } from "../../domain/launchpadLayout.js";
import { createPixiApp } from "./createPixiApp.js";
import { preloadIconTextures } from "./assets/iconTextureCache.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { getPixiHostMetrics, getViewportFallbackSize } from "./pixiHostMetrics.js";
import { DragPreviewLayer } from "./scene/DragPreviewLayer.js";

const props = defineProps({
  folderPageSize: { type: Number, required: true },
  folderHoverState: { type: Object, default: null },
  iconSize: { type: Number, required: true },
  isTextlessMode: { type: Boolean, default: false },
  launchTargetStatusById: { type: Object, default: () => ({}) },
  previewState: { type: Object, default: null },
  releaseState: { type: Object, default: null },
  showMissingLaunchTargetBadge: { type: Boolean, default: true },
});

const hostRef = ref(null);
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;

function collectPreviewTextureItems(previewState) {
  const item = previewState?.item;
  if (!item) return [];
  if (item.type !== "folder") return [item];
  return getFolderPreviewSlots(item, props.folderPageSize).filter(Boolean);
}

function renderPixi() {
  if (!app || !layer || !hostRef.value) return;
  preloadIconTextures(collectPreviewTextureItems(props.previewState || props.releaseState));
  const { height, rect, width } = getPixiHostMetrics(hostRef.value, getViewportFallbackSize());
  layer.update({
    folderHoverState: props.folderHoverState,
    folderPageSize: props.folderPageSize,
    height: Math.max(1, height),
    iconSize: props.iconSize,
    isTextlessMode: props.isTextlessMode,
    launchTargetStatusById: props.launchTargetStatusById,
    previewState: props.previewState,
    releaseState: props.releaseState,
    showMissingLaunchTargetBadge: props.showMissingLaunchTargetBadge,
    stageRect: rect,
    width: Math.max(1, width),
  });
}

function handleResize() {
  app?.resize?.();
  renderPixi();
}

function destroyPixi(options = {}) {
  const deep = options.deep !== false;
  destroyed = true;
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  const currentApp = app;
  const currentLayer = layer;
  app = null;
  layer = null;
  if (currentLayer) {
    currentApp?.stage?.removeChild(currentLayer);
    if (deep) currentLayer.destroy({ children: true });
  }
  if (deep) currentApp?.destroy(true);
  else currentApp?.stop?.();
  hostRef.value?.replaceChildren?.();
}

onMounted(async () => {
  destroyed = false;
  const nextApp = await createPixiApp(hostRef.value, { className: "pixi-launchpad-canvas" });
  if (destroyed) {
    nextApp.destroy(true);
    hostRef.value?.replaceChildren?.();
    return;
  }
  app = nextApp;
  layer = new DragPreviewLayer();
  app.stage.addChild(layer);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  renderPixi();
});

watchEffect(() => {
  void props.folderHoverState;
  void props.folderPageSize;
  void props.iconSize;
  void props.isTextlessMode;
  void props.launchTargetStatusById;
  void props.previewState;
  void props.releaseState;
  void props.showMissingLaunchTargetBadge;
  renderPixi();
});

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
