<template>
  <main
    ref="mainRef"
    class="desktop-main pixi-desktop-main"
    tabindex="-1"
    :style="pageGridMeasureStyle"
    @focus="$emit('desktop-focus')"
    @contextmenu.stop.prevent
  >
    <div ref="hostRef" class="pixi-desktop-host" />
  </main>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { createPixiApp } from "./createPixiApp.js";
import { DesktopLayer } from "./scene/DesktopLayer.js";
import { clearIconTextureCache, preloadIconTextures } from "./assets/iconTextureCache.js";
import { clearDesktopIconBounds } from "./geometry/iconBoundsRegistry.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { getPixiHostMetrics } from "./pixiHostMetrics.js";

const FOLDER_TEXTURE_PREWARM_LIMIT = 80;

const props = defineProps({
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  desktopProjectionEpoch: { type: Number, default: 0 },
  desktopTrackMotionKey: { type: String, required: true },
  domRefs: { type: Object, required: true },
  dragFolderHoverState: { type: Object, default: null },
  dragFolderTargetId: { type: String, default: null },
  dragMeta: { type: Object, default: null },
  dragReleaseGhostId: { type: String, default: null },
  folderPageSize: { type: Number, required: true },
  getDesktopPageRenderMode: { type: Function, required: true },
  getVisibleDesktopPage: { type: Function, required: true },
  gridCols: { type: Number, required: true },
  gridRows: { type: Number, required: true },
  iconSize: { type: Number, required: true },
  isEditMode: { type: Boolean, default: false },
  folderSourceGhostedId: { type: String, default: null },
  isFolderOpeningPreviewFrameGhosted: { type: Function, default: () => false },
  isIconOpening: { type: Function, required: true },
  isIconSelected: { type: Function, required: true },
  isSearchMode: { type: Boolean, default: false },
  isTextlessMode: { type: Boolean, default: false },
  launchTargetStatusById: { type: Object, default: () => ({}) },
  pageGridMeasureStyle: { type: Object, required: true },
  setPageRef: { type: Function, required: true },
  showMissingLaunchTargetBadge: { type: Boolean, default: true },
});

const emit = defineEmits([
  "choose-app-icon",
  "context-menu-icon",
  "desktop-focus",
  "open-app",
  "pointerdown-icon",
  "remove-app",
  "reset-app-icon",
]);

const hostRef = ref(null);
const mainRef = ref(null);
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let folderTexturePrewarmTimer = null;

function handleResize() {
  app?.resize?.();
  renderPixi();
}

function renderPixi() {
  if (!app || !layer || !hostRef.value) return;
  const { height, rect, width } = getPixiHostMetrics(hostRef.value);
  layer.update({
    activePageIndex: props.activePageIndex,
    activePages: props.activePages,
    desktopTrackMotionKey: props.desktopTrackMotionKey,
    dragFolderHoverState: props.dragFolderHoverState,
    dragFolderTargetId: props.dragFolderTargetId,
    dragMeta: props.dragMeta,
    dragReleaseGhostId: props.dragReleaseGhostId,
    folderPageSize: props.folderPageSize,
    getDesktopPageRenderMode: props.getDesktopPageRenderMode,
    getVisibleDesktopPage: props.getVisibleDesktopPage,
    gridCols: props.gridCols,
    gridRows: props.gridRows,
    height: Math.max(1, height),
    iconSize: props.iconSize,
    isEditMode: props.isEditMode,
    folderSourceGhostedId: props.folderSourceGhostedId,
    isFolderOpeningPreviewFrameGhosted: props.isFolderOpeningPreviewFrameGhosted,
    isIconOpening: props.isIconOpening,
    isIconSelected: props.isIconSelected,
    isSearchMode: props.isSearchMode,
    isTextlessMode: props.isTextlessMode,
    launchTargetStatusById: props.launchTargetStatusById,
    setPageRef: props.setPageRef,
    shouldSnapTrack: props.desktopTrackMotionKey.includes("snap"),
    showMissingLaunchTargetBadge: props.showMissingLaunchTargetBadge,
    stageRect: rect,
    width: Math.max(1, width),
  });
}

function clearFolderTexturePrewarmTimer() {
  if (folderTexturePrewarmTimer == null) return;
  window.clearTimeout(folderTexturePrewarmTimer);
  folderTexturePrewarmTimer = null;
}

function getFirstFolderPageItems(folder) {
  if (Array.isArray(folder?.childPages)) return folder.childPages[0] || [];
  return folder?.children || [];
}

function collectFolderTexturePrewarmItems() {
  const page = props.activePages?.[props.activePageIndex] || [];
  const visibleItems = props.getVisibleDesktopPage?.(page) || [];
  const items = [];
  for (const item of visibleItems) {
    if (item?.type !== "folder") continue;
    const firstPageItems = getFirstFolderPageItems(item).slice(0, props.folderPageSize);
    for (const child of firstPageItems) {
      if (!child) continue;
      items.push(child);
      if (items.length >= FOLDER_TEXTURE_PREWARM_LIMIT) return items;
    }
  }
  return items;
}

function scheduleFolderTexturePrewarm() {
  if (!app) return;
  clearFolderTexturePrewarmTimer();
  folderTexturePrewarmTimer = window.setTimeout(() => {
    folderTexturePrewarmTimer = null;
    if (destroyed) return;
    preloadIconTextures(collectFolderTexturePrewarmItems());
  }, 0);
}

function handleIconAction(action, event, item, source) {
  if (action === "open") emit("open-app", item, source);
  if (action === "pointerdown") emit("pointerdown-icon", event, item, source);
  if (action === "context-menu") emit("context-menu-icon", event, item, source);
  if (action === "remove") emit("remove-app", item.id);
  if (action === "choose-icon") emit("choose-app-icon", item.id);
  if (action === "reset-icon") emit("reset-app-icon", item.id);
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
  clearFolderTexturePrewarmTimer();
  if (currentLayer) {
    currentApp?.stage?.removeChild(currentLayer);
    if (deep) currentLayer.destroy({ children: true });
  }
  if (deep) currentApp?.destroy(true);
  else currentApp?.stop?.();
  hostRef.value?.replaceChildren?.();
  clearDesktopIconBounds();
  if (deep) clearIconTextureCache();
}

onMounted(async () => {
  destroyed = false;
  if (props.domRefs?.desktopMainRef) props.domRefs.desktopMainRef.value = mainRef.value;
  const nextApp = await createPixiApp(hostRef.value, { className: "pixi-launchpad-canvas" });
  if (destroyed) {
    nextApp.destroy(true);
    hostRef.value?.replaceChildren?.();
    return;
  }
  app = nextApp;
  layer = new DesktopLayer({ onIconAction: handleIconAction });
  app.stage.addChild(layer);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  renderPixi();
  scheduleFolderTexturePrewarm();
});

watchEffect(() => {
  void props.activePageIndex;
  void props.activePages;
  void props.desktopProjectionEpoch;
  void props.desktopTrackMotionKey;
  void props.dragFolderHoverState;
  void props.dragFolderTargetId;
  void props.dragMeta;
  void props.dragReleaseGhostId;
  void props.gridCols;
  void props.gridRows;
  void props.iconSize;
  void props.isEditMode;
  void props.folderSourceGhostedId;
  void props.isSearchMode;
  void props.isTextlessMode;
  void props.launchTargetStatusById;
  void props.pageGridMeasureStyle;
  void props.folderPageSize;
  renderPixi();
  scheduleFolderTexturePrewarm();
});

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
