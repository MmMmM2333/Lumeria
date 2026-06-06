<template>
  <div
    ref="overlayRef"
    class="pixi-folder-overlay"
    :class="[
      !state.renderedFolder.value && 'pixi-folder-overlay-empty',
      (state.isFolderClosing.value || state.isFolderAppLaunchClosing.value) && 'pixi-folder-overlay-closing',
    ]"
    @pointerdown.stop.prevent
    @contextmenu.stop.prevent
  >
    <div ref="hostRef" class="pixi-folder-host" />
    <input
      v-if="state.renderedFolder.value"
      class="folder-name-input pixi-folder-name-input"
      name="pixiFolderName"
      :value="state.renderedFolder.value.name"
      :disabled="state.isFolderClosing.value || state.isFolderAppLaunchClosing.value || isFolderGhostTransitionActive"
      :style="folderNameInputStyle"
      maxlength="32"
      aria-label="文件夹名称"
      @input="handleFolderNameInput"
      @blur="restoreEmptyFolderName"
      @keydown.enter.prevent.stop="$event.target.blur()"
      @pointerdown.stop
    />
    <footer
      v-if="state.renderedFolder.value && state.folderPages.value.length > 1"
      class="folder-page-dots pixi-folder-page-dots"
      :style="folderPageDotsStyle"
      @pointerdown.stop
    >
      <button
        v-for="index in state.folderPages.value.length"
        :key="index"
        type="button"
        :class="['page-dot', index - 1 === state.folderPageIndex.value && 'page-dot-active']"
        :aria-label="`切换到文件夹第 ${index} 页`"
        @pointerdown.stop
        @click="state.commitFolderPageIndex(index - 1)"
      />
    </footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { createPixiApp } from "./createPixiApp.js";
import { FolderOverlayLayer } from "./scene/FolderOverlayLayer.js";
import { clearIconTextureCache } from "./assets/iconTextureCache.js";
import { clearIconBoundsRegistry } from "./geometry/iconBoundsRegistry.js";
import { reloadOnPixiHotUpdate } from "./devHmr.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["context-menu-icon", "open-app", "pointerdown-icon"]);

const overlayRef = ref(null);
const hostRef = ref(null);
const folderNameBeforeEdit = ref("");
const panelGeometry = ref(null);
const titleFrame = ref(null);
const closingTitleStartOpacity = ref(1);
const folderPageDotsVisible = ref(false);
const FOLDER_PAGE_DOTS_REVEAL_PROGRESS = 0.995;
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let didWarmInitialFrame = false;
let folderPageDotsRevealFrame = null;

const isFolderGhostTransitionActive = computed(() => Boolean(
  props.state.isFolderOpenIconAnimationActive?.value ||
  props.state.isFolderCloseIconAnimationActive?.value
));

const isFolderPageDotsBlocked = computed(() => Boolean(
  props.state.isFolderClosing.value ||
  props.state.isFolderAppLaunchClosing.value ||
  props.state.isFolderOpenFrameGhostPending?.value ||
  isFolderGhostTransitionActive.value
));

const isFolderPageDotsReady = computed(() => (
  clamp01(titleFrame.value?.progress ?? 0) >= FOLDER_PAGE_DOTS_REVEAL_PROGRESS
));

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getFolderTitleOpenOpacity(frame) {
  const progress = clamp01(frame?.progress ?? 1);
  return clamp01((progress - 0.18) / 0.28);
}

function getFolderTitleOpacity(frame, isClosing) {
  if (!isClosing) return getFolderTitleOpenOpacity(frame);
  const progress = clamp01(frame?.progress ?? 0);
  return closingTitleStartOpacity.value * clamp01(1 - progress / 0.28);
}

function handleResize() {
  app?.resize?.();
  renderPixi();
}

const folderNameInputStyle = computed(() => {
  const frame = titleFrame.value || panelGeometry.value?.panel;
  const isClosing = props.state.isFolderClosing.value || props.state.isFolderAppLaunchClosing.value;
  if (!frame) return { opacity: 0, pointerEvents: "none" };
  const width = 360;
  const opacity = getFolderTitleOpacity(frame, isClosing);
  const isInteractive = opacity >= 0.99 && !isClosing && !isFolderGhostTransitionActive.value;
  return {
    left: `${frame.left + frame.width / 2 - width / 2}px`,
    filter: opacity < 0.98 ? "blur(2px)" : "blur(0px)",
    opacity,
    pointerEvents: isInteractive ? "auto" : "none",
    top: `${frame.top - 44}px`,
    transform: "translate3d(0, 0, 0)",
    width: `${width}px`,
  };
});

const folderPageDotsStyle = computed(() => {
  const panel = panelGeometry.value?.panel;
  const grid = panelGeometry.value?.grid;
  const isHidden = isFolderPageDotsBlocked.value || !folderPageDotsVisible.value;
  if (!panel) return { opacity: 0, pointerEvents: "none" };
  const height = 20;
  const bottomPaddingTop = grid ? grid.top + grid.height : panel.top + panel.height - 54;
  const bottomPaddingHeight = Math.max(0, panel.top + panel.height - bottomPaddingTop);
  return {
    bottom: "auto",
    height: `${height}px`,
    left: `${panel.left}px`,
    opacity: isHidden ? 0 : 1,
    pointerEvents: isHidden ? "none" : "auto",
    right: "auto",
    top: `${bottomPaddingTop + bottomPaddingHeight / 2 - height / 2}px`,
    width: `${panel.width}px`,
  };
});

function getHostRect() {
  return hostRef.value?.getBoundingClientRect?.() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function getFolderGhostKey(ghosts, itemId, slotIndex) {
  const items = Array.isArray(ghosts) ? ghosts : [];
  const matchingSlot = items.find((ghost) => ghost.item?.id === itemId && ghost.slotIndex === slotIndex);
  return matchingSlot?.key || items.find((ghost) => ghost.item?.id === itemId)?.key || null;
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
    completeFolderCloseIconGhost: props.state.completeFolderCloseIconGhost,
    completeFolderOpenIconGhost: props.state.completeFolderOpenIconGhost,
    folderCloseIconGhosts: props.state.folderCloseIconGhosts?.value,
    folderOpenIconGhosts: props.state.folderOpenIconGhosts?.value,
    dragReleaseGhostId: props.state.dragReleaseState?.value?.item?.id || null,
    getFolderCloseIconGhostKey: (itemId, slotIndex) => getFolderGhostKey(props.state.folderCloseIconGhosts?.value, itemId, slotIndex),
    getFolderOpenIconGhostKey: (itemId, slotIndex) => getFolderGhostKey(props.state.folderOpenIconGhosts?.value, itemId, slotIndex),
    getVisibleFolderPage: props.state.getVisibleFolderPage,
    getFolderPageRenderMode: props.state.getFolderPageRenderMode,
    height: Math.max(1, rect.height),
    iconSize: Number.parseFloat(props.state.folderPanelStyle.value?.["--folder-icon-size"]) || 64,
    isEditMode: props.state.isEditMode.value,
    isFolderAppLaunchClosing: props.state.isFolderAppLaunchClosing.value,
    isFolderClosing: props.state.isFolderClosing.value,
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

function renderInitialWarmFrame() {
  if (didWarmInitialFrame || !app) return;
  didWarmInitialFrame = true;
  if (typeof app.render === "function") {
    app.render();
    return;
  }
  app.renderer?.render?.(app.stage);
}

function handleIconAction(action, event, item, source) {
  if (action === "open") emit("open-app", item, source);
  if (action === "pointerdown") emit("pointerdown-icon", event, item, source);
  if (action === "context-menu") emit("context-menu-icon", event, item, source);
  if (action === "remove") props.state.removeAppById(item.id);
  if (action === "choose-icon") props.state.openExistingAppIconChooser(item.id);
  if (action === "reset-icon") props.state.resetAppCustomIcon(item.id);
}

function destroyPixi() {
  destroyed = true;
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  cancelFolderPageDotsReveal();
  const currentApp = app;
  const currentLayer = layer;
  app = null;
  layer = null;
  didWarmInitialFrame = false;
  panelGeometry.value = null;
  titleFrame.value = null;
  if (currentLayer) {
    currentApp?.stage?.removeChild(currentLayer);
    currentLayer.destroy({ children: true });
  }
  currentApp?.destroy(true);
  hostRef.value?.replaceChildren?.();
  clearIconBoundsRegistry();
  clearIconTextureCache();
}

function cancelFolderPageDotsReveal() {
  if (folderPageDotsRevealFrame == null) return;
  window.cancelAnimationFrame(folderPageDotsRevealFrame);
  folderPageDotsRevealFrame = null;
}

function scheduleFolderPageDotsReveal() {
  cancelFolderPageDotsReveal();
  folderPageDotsRevealFrame = window.requestAnimationFrame(() => {
    folderPageDotsRevealFrame = null;
    if (!props.state.renderedFolder.value ||
      props.state.folderPages.value.length <= 1 ||
      isFolderPageDotsBlocked.value ||
      !isFolderPageDotsReady.value) return;
    folderPageDotsVisible.value = true;
  });
}

watch(
  () => Boolean(props.state.isFolderClosing.value || props.state.isFolderAppLaunchClosing.value),
  (isClosing, wasClosing) => {
    if (isClosing && !wasClosing) {
      closingTitleStartOpacity.value = getFolderTitleOpenOpacity(titleFrame.value || panelGeometry.value?.panel);
      return;
    }
    if (!isClosing) closingTitleStartOpacity.value = 1;
  }
);

watch(
  () => ({
    blocked: isFolderPageDotsBlocked.value,
    folderId: props.state.renderedFolder.value?.id || null,
    pageCount: props.state.folderPages.value.length,
    ready: isFolderPageDotsReady.value,
  }),
  (state, previous) => {
    const canShow = Boolean(state.folderId && state.pageCount > 1 && !state.blocked && state.ready);
    cancelFolderPageDotsReveal();
    if (!canShow || state.folderId !== previous?.folderId) folderPageDotsVisible.value = false;
    if (canShow) scheduleFolderPageDotsReveal();
  },
  { immediate: true }
);

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
  const nextApp = await createPixiApp(hostRef.value, { className: "pixi-launchpad-canvas" });
  if (destroyed) {
    nextApp.destroy(true);
    hostRef.value?.replaceChildren?.();
    return;
  }
  app = nextApp;
  layer = new FolderOverlayLayer({
    onIconAction: handleIconAction,
    onClosingFolderPointerDown: (folderId) => props.state.commitOpenFolder(folderId),
    onOutsidePointerDown: () => props.state.handleFolderOverlayPointerDown(),
    onTitleFrameChange: (frame) => {
      titleFrame.value = frame;
    },
  });
  app.stage.addChild(layer);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  renderPixi();
  renderInitialWarmFrame();
});

watchEffect(() => {
  void props.state.dragMeta.value;
  void props.state.dragReleaseState?.value;
  void props.state.folderGridStyle.value;
  void props.state.folderCloseIconGhosts?.value;
  void props.state.folderOpenIconGhosts?.value;
  void props.state.folderPageIndex.value;
  void props.state.folderPages.value;
  void props.state.folderPanelStyle.value;
  void props.state.isEditMode.value;
  void props.state.isFolderAppLaunchClosing.value;
  void props.state.isFolderCloseIconAnimationActive?.value;
  void props.state.isFolderClosing.value;
  void props.state.isFolderOpenIconAnimationActive?.value;
  void props.state.isTextlessMode.value;
  void props.state.launchTargetStatusById.value;
  void props.state.renderedFolder.value;
  void props.state.showMissingLaunchTargetBadge.value;
  renderPixi();
});

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(destroyPixi);
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
