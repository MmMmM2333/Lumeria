<template>
  <main
    ref="mainRef"
    class="desktop-main pixi-desktop-main"
    tabindex="-1"
    :style="pageGridMeasureStyle"
    @focus="$emit('desktop-focus')"
  >
    <div ref="hostRef" class="pixi-desktop-host" />
  </main>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { createPixiApp } from "./createPixiApp.js";
import { DesktopLayer } from "./scene/DesktopLayer.js";

const props = defineProps({
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  desktopTrackMotionKey: { type: String, required: true },
  domRefs: { type: Object, required: true },
  dragFolderTargetId: { type: String, default: null },
  dragMeta: { type: Object, default: null },
  folderPageSize: { type: Number, required: true },
  getDesktopPageRenderMode: { type: Function, required: true },
  getVisibleDesktopPage: { type: Function, required: true },
  gridCols: { type: Number, required: true },
  gridRows: { type: Number, required: true },
  iconSize: { type: Number, required: true },
  isEditMode: { type: Boolean, default: false },
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

function handleResize() {
  app?.resize?.();
  renderPixi();
}

function getHostMetrics() {
  const host = hostRef.value;
  const rect = host?.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
  return {
    rect,
    height: host?.offsetHeight || host?.clientHeight || rect.height || 1,
    width: host?.offsetWidth || host?.clientWidth || rect.width || 1,
  };
}

function renderPixi() {
  if (!app || !layer || !hostRef.value) return;
  const { height, rect, width } = getHostMetrics();
  layer.update({
    activePageIndex: props.activePageIndex,
    activePages: props.activePages,
    desktopTrackMotionKey: props.desktopTrackMotionKey,
    dragFolderTargetId: props.dragFolderTargetId,
    dragMeta: props.dragMeta,
    folderPageSize: props.folderPageSize,
    getDesktopPageRenderMode: props.getDesktopPageRenderMode,
    getVisibleDesktopPage: props.getVisibleDesktopPage,
    gridCols: props.gridCols,
    gridRows: props.gridRows,
    height: Math.max(1, height),
    iconSize: props.iconSize,
    isEditMode: props.isEditMode,
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

function handleIconAction(action, event, item, source) {
  if (action === "pointerdown") emit("pointerdown-icon", event, item, source);
  if (action === "context-menu") emit("context-menu-icon", event, item, source);
  if (action === "remove") emit("remove-app", item.id);
  if (action === "choose-icon") emit("choose-app-icon", item.id);
  if (action === "reset-icon") emit("reset-app-icon", item.id);
}

onMounted(async () => {
  destroyed = false;
  if (props.domRefs?.desktopMainRef) props.domRefs.desktopMainRef.value = mainRef.value;
  app = await createPixiApp(hostRef.value, { className: "pixi-launchpad-canvas" });
  if (destroyed) {
    app.destroy(true);
    return;
  }
  layer = new DesktopLayer({ onIconAction: handleIconAction });
  app.stage.addChild(layer);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  renderPixi();
});

watchEffect(() => {
  void props.activePageIndex;
  void props.activePages;
  void props.desktopTrackMotionKey;
  void props.dragFolderTargetId;
  void props.dragMeta;
  void props.gridCols;
  void props.gridRows;
  void props.iconSize;
  void props.isEditMode;
  void props.isSearchMode;
  void props.isTextlessMode;
  void props.launchTargetStatusById;
  void props.pageGridMeasureStyle;
  renderPixi();
});

onBeforeUnmount(() => {
  destroyed = true;
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  app?.destroy(true);
  app = null;
  layer = null;
});
</script>
