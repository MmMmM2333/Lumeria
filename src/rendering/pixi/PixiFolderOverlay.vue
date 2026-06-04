<template>
  <div
    ref="overlayRef"
    class="pixi-folder-overlay"
    :class="[
      !state.renderedFolder.value && 'pixi-folder-overlay-empty',
      (state.isFolderClosing.value || state.isFolderAppLaunchClosing.value) && 'pixi-folder-overlay-closing',
    ]"
    @pointerdown.stop.prevent
    @pointerup.stop.prevent
  >
    <div ref="hostRef" class="pixi-folder-host" />
    <input
      v-if="state.renderedFolder.value"
      class="folder-name-input pixi-folder-name-input"
      name="pixiFolderName"
      :value="state.renderedFolder.value.name"
      :disabled="state.isFolderClosing.value || state.isFolderAppLaunchClosing.value"
      :style="folderNameInputStyle"
      maxlength="32"
      aria-label="文件夹名称"
      @input="handleFolderNameInput"
      @blur="restoreEmptyFolderName"
      @keydown.enter.prevent.stop="$event.target.blur()"
      @pointerdown.stop
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { createPixiApp } from "./createPixiApp.js";
import { FolderOverlayLayer } from "./scene/FolderOverlayLayer.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["context-menu-icon", "open-app", "pointerdown-icon"]);

const overlayRef = ref(null);
const hostRef = ref(null);
const folderNameBeforeEdit = ref("");
const panelGeometry = ref(null);
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;

function handleResize() {
  app?.resize?.();
  renderPixi();
}

const folderNameInputStyle = computed(() => {
  const panel = panelGeometry.value?.panel;
  if (!panel) return { opacity: 0, pointerEvents: "none" };
  return {
    left: `${panel.left + panel.width / 2 - 180}px`,
    opacity: props.state.isFolderClosing.value || props.state.isFolderAppLaunchClosing.value ? 0 : 1,
    top: `${panel.top - 44}px`,
    width: "360px",
  };
});

function getHostRect() {
  return hostRef.value?.getBoundingClientRect?.() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function renderPixi() {
  if (!app || !layer || !hostRef.value) return;
  const rect = getHostRect();
  panelGeometry.value = layer.update({
    dragMeta: props.state.dragMeta.value,
    folderGridStyle: props.state.folderGridStyle.value,
    folderPageIndex: props.state.folderPageIndex.value,
    folderPageSize: props.state.folderPageSize.value,
    folderPages: props.state.folderPages.value,
    folderPanelRef: props.state.folderPanelRef,
    folderPanelStyle: props.state.folderPanelStyle.value,
    folderViewportRef: props.state.folderViewportRef,
    getVisibleFolderPage: props.state.getVisibleFolderPage,
    height: Math.max(1, rect.height),
    iconSize: Number.parseFloat(props.state.folderPanelStyle.value?.["--folder-icon-size"]) || 64,
    isEditMode: props.state.isEditMode.value,
    isFolderAppLaunchClosing: props.state.isFolderAppLaunchClosing.value,
    isFolderClosing: props.state.isFolderClosing.value,
    isFolderClosingIconGhosted: props.state.isFolderClosingIconGhosted,
    isFolderOpeningIconGhosted: props.state.isFolderOpeningIconGhosted,
    isIconOpening: props.state.isIconOpening,
    isIconSelected: props.state.isIconSelected,
    isTextlessMode: props.state.isTextlessMode.value,
    launchTargetStatusById: props.state.launchTargetStatusById.value,
    renderedFolder: props.state.renderedFolder.value,
    setFolderPageRef: props.state.setFolderPageRef,
    showMissingLaunchTargetBadge: props.state.showMissingLaunchTargetBadge.value,
    stageRect: rect,
    width: Math.max(1, rect.width),
  });
}

function handleIconAction(action, event, item, source) {
  if (action === "pointerdown") emit("pointerdown-icon", event, item, source);
  if (action === "context-menu") emit("context-menu-icon", event, item, source);
  if (action === "remove") props.state.removeAppById(item.id);
  if (action === "choose-icon") props.state.openExistingAppIconChooser(item.id);
  if (action === "reset-icon") props.state.resetAppCustomIcon(item.id);
}

function handleFolderNameInput(event) {
  const folder = props.state.renderedFolder.value;
  if (!folder) return;
  const nextName = String(event?.target?.value || "").slice(0, 32);
  if (!nextName) return;
  props.state.renameFolder(folder.id, nextName);
}

function restoreEmptyFolderName(event) {
  const folder = props.state.renderedFolder.value;
  if (!folder) return;
  const input = event?.target;
  if (input?.value) {
    folderNameBeforeEdit.value = input.value;
    return;
  }
  const fallback = folderNameBeforeEdit.value || folder.name || "新文件夹";
  if (input) input.value = fallback;
  props.state.renameFolder(folder.id, fallback);
}

onMounted(async () => {
  destroyed = false;
  app = await createPixiApp(hostRef.value, { className: "pixi-launchpad-canvas" });
  if (destroyed) {
    app.destroy(true);
    return;
  }
  layer = new FolderOverlayLayer({
    onIconAction: handleIconAction,
    onOutsidePointerDown: () => props.state.handleFolderOverlayPointerDown(),
  });
  app.stage.addChild(layer);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  renderPixi();
});

watchEffect(() => {
  void props.state.dragMeta.value;
  void props.state.folderGridStyle.value;
  void props.state.folderPageIndex.value;
  void props.state.folderPages.value;
  void props.state.folderPanelStyle.value;
  void props.state.isEditMode.value;
  void props.state.isFolderAppLaunchClosing.value;
  void props.state.isFolderClosing.value;
  void props.state.isTextlessMode.value;
  void props.state.launchTargetStatusById.value;
  void props.state.renderedFolder.value;
  void props.state.showMissingLaunchTargetBadge.value;
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
