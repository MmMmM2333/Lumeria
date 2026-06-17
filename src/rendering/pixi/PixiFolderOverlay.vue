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
    <div
      ref="motionRef"
      :class="['pixi-folder-motion', isFolderZoomFadeClosing && 'pixi-folder-motion-zoom-fade-closing']"
      :style="overlayStyle"
      @animationend="handleOverlayAnimationEnd"
    >
      <div ref="hostRef" class="pixi-folder-host" />
      <input
        v-if="state.renderedFolder.value"
        class="folder-name-input pixi-folder-name-input"
        name="pixiFolderName"
        :value="state.renderedFolder.value.name"
        :disabled="state.isFolderClosing.value || state.isFolderAppLaunchClosing.value || isFolderZoomFadeClosing || isFolderGhostTransitionActive"
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
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { createPixiApp } from "./createPixiApp.js";
import { FolderOverlayLayer } from "./scene/FolderOverlayLayer.js";
import { findFolderGhostKey } from "./scene/folderOverlayTargets.js";
import { clearIconTextureCache, preloadIconTexturesAsync } from "./assets/iconTextureCache.js";
import { clearFolderIconBounds } from "./geometry/iconBoundsRegistry.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { getPixiHostRect, getViewportFallbackSize } from "./pixiHostMetrics.js";

const props = defineProps({
  active: { type: Boolean, default: true },
  state: { type: Object, required: true },
});

const emit = defineEmits(["context-menu-icon", "open-app", "pointerdown-icon"]);

const overlayRef = ref(null);
const motionRef = ref(null);
const hostRef = ref(null);
const folderNameBeforeEdit = ref("");
const panelGeometry = ref(null);
const titleFrame = ref(null);
const closingTitleStartOpacity = ref(1);
const folderPageDotsVisible = ref(false);
const FOLDER_PAGE_DOTS_REVEAL_PROGRESS = 0.995;
const FOLDER_PREWARM_DELAY = 80;
const FOLDER_PREWARM_FOLDER_LIMIT = 4;
const FOLDER_PREWARM_TEXTURE_TIMEOUT = 80;
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let didWarmInitialFrame = false;
let folderPageDotsRevealFrame = null;
let folderPrewarmTimer = null;
let folderPrewarmRequestId = 0;
let folderPrewarmKey = null;
const prewarmedFolderKeys = new Set();

const isFolderGhostTransitionActive = computed(() => Boolean(
  props.state.isFolderOpenIconAnimationActive?.value ||
  props.state.isFolderCloseIconAnimationActive?.value
));
const isFolderZoomFadeClosing = computed(() => Boolean(props.state.isFolderZoomFadeClosing?.value));
const shouldRunPixi = computed(() => Boolean(
  props.active && (
    props.state.renderedFolder.value ||
    props.state.isFolderClosing.value ||
    props.state.isFolderAppLaunchClosing.value ||
    isFolderZoomFadeClosing.value ||
    isFolderGhostTransitionActive.value
  )
));

const isFolderPageDotsBlocked = computed(() => Boolean(
  props.state.isFolderClosing.value ||
  props.state.isFolderAppLaunchClosing.value ||
  isFolderZoomFadeClosing.value ||
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
  if (!shouldRunPixi.value) return;
  app?.resize?.();
  renderPixi();
}

const folderNameInputStyle = computed(() => {
  const frame = titleFrame.value || panelGeometry.value?.panel;
  const isClosing = props.state.isFolderClosing.value || props.state.isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value;
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

const overlayStyle = computed(() => {
  const panel = panelGeometry.value?.panel;
  if (!panel) return null;
  return {
    "--pixi-folder-zoom-origin": `${panel.left + panel.width / 2}px ${panel.top + panel.height / 2}px`,
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
  return getPixiHostRect(hostRef.value, getViewportFallbackSize());
}

function createLayerState(rect, overrides = {}) {
  return {
    dragMeta: props.state.dragMeta.value,
    folderGridStyle: props.state.folderGridStyle.value,
    folderPageIndex: props.state.folderPageIndex.value,
    folderPageSize: props.state.folderPageSize.value,
    folderPages: props.state.folderPages.value,
    folderOpeningOriginBounds: props.state.folderOpeningOriginBounds?.value,
    folderPanelRef: props.state.folderPanelRef,
    folderPanelStyle: props.state.folderPanelStyle.value,
    folderViewportRef: props.state.folderViewportRef,
    completeFolderCloseIconGhost: props.state.completeFolderCloseIconGhost,
    completeFolderOpenIconGhost: props.state.completeFolderOpenIconGhost,
    folderCloseIconGhosts: props.state.folderCloseIconGhosts?.value,
    folderOpenIconGhosts: props.state.folderOpenIconGhosts?.value,
    dragReleaseGhostId: props.state.dragReleaseState?.value?.item?.id || null,
    getFolderCloseIconGhostKey: (itemId, slotIndex) => findFolderGhostKey(props.state.folderCloseIconGhosts?.value, itemId, slotIndex),
    getFolderOpenIconGhostKey: (itemId, slotIndex) => findFolderGhostKey(props.state.folderOpenIconGhosts?.value, itemId, slotIndex),
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
    ...overrides,
  };
}

function renderPixi(options = {}) {
  if (!options.force && !shouldRunPixi.value) return;
  if (!app || !layer || !hostRef.value) return;
  const rect = getHostRect();
  panelGeometry.value = layer.update(createLayerState(rect));
}

function renderInitialWarmFrame() {
  if (didWarmInitialFrame || !shouldRunPixi.value || !app) return;
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

function handleOverlayAnimationEnd(event) {
  if (event.target !== motionRef.value || event.animationName !== "pixi-folder-zoom-fade-close") return;
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => props.state.finishFolderZoomFadeClose?.());
    return;
  }
  props.state.finishFolderZoomFadeClose?.();
}

function destroyPixi(options = {}) {
  const deep = options.deep !== false;
  destroyed = true;
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  cancelFolderPageDotsReveal();
  cancelFolderPrewarm();
  const currentApp = app;
  const currentLayer = layer;
  app = null;
  layer = null;
  didWarmInitialFrame = false;
  panelGeometry.value = null;
  titleFrame.value = null;
  if (currentLayer) {
    currentApp?.stage?.removeChild(currentLayer);
    if (deep) currentLayer.destroy({ children: true });
  }
  if (deep) currentApp?.destroy(true);
  else currentApp?.stop?.();
  hostRef.value?.replaceChildren?.();
  clearFolderIconBounds();
  if (deep) clearIconTextureCache();
}

function cancelFolderPrewarm() {
  folderPrewarmRequestId += 1;
  folderPrewarmKey = null;
  if (folderPrewarmTimer == null) return;
  window.clearTimeout(folderPrewarmTimer);
  folderPrewarmTimer = null;
}

function syncPixiActivity() {
  if (!app) return;
  if (!shouldRunPixi.value) {
    renderPixi({ force: true });
    app.render?.();
    app.stop?.();
    return;
  }
  app.start?.();
  app.resize?.();
  renderPixi();
  renderInitialWarmFrame();
}

function getFirstFolderPageItems(folder) {
  if (Array.isArray(folder?.childPages)) return folder.childPages[0] || [];
  return Array.isArray(folder?.children) ? folder.children : [];
}

function getFolderPrewarmKey(folder) {
  const firstPageItems = getFirstFolderPageItems(folder).slice(0, props.state.folderPageSize.value);
  return `${folder?.id || "folder"}:${firstPageItems.map((item) => item?.id || "").join(",")}`;
}

function getPrewarmFolderCandidate() {
  if (shouldRunPixi.value || !props.state.activePages?.value || prewarmedFolderKeys.size >= FOLDER_PREWARM_FOLDER_LIMIT) return null;
  const page = props.state.activePages.value[props.state.activePageIndex?.value || 0] || [];
  const visibleItems = props.state.getVisibleDesktopPage?.(page) || [];
  return visibleItems.find((item) => {
    if (item?.type !== "folder") return false;
    const firstPageItems = getFirstFolderPageItems(item).slice(0, props.state.folderPageSize.value);
    const key = getFolderPrewarmKey(item);
    return firstPageItems.length && !prewarmedFolderKeys.has(key);
  }) || null;
}

function finishFolderPrewarmRequest(requestId) {
  if (requestId === folderPrewarmRequestId) folderPrewarmKey = null;
}

async function runFolderPrewarm(folder, requestId) {
  if (!folder || !app || !layer || !hostRef.value || destroyed || shouldRunPixi.value) {
    finishFolderPrewarmRequest(requestId);
    return;
  }
  const firstPageItems = getFirstFolderPageItems(folder).slice(0, props.state.folderPageSize.value);
  await preloadIconTexturesAsync(firstPageItems, { timeoutMs: FOLDER_PREWARM_TEXTURE_TIMEOUT });
  if (requestId !== folderPrewarmRequestId || destroyed || shouldRunPixi.value || !app || !layer || !hostRef.value) {
    finishFolderPrewarmRequest(requestId);
    return;
  }
  const rect = getHostRect();
  layer.update(createLayerState(rect, {
    folderPageIndex: 0,
    folderPages: [firstPageItems],
    folderPanelRef: null,
    folderViewportRef: null,
    folderOpenIconGhosts: [],
    folderCloseIconGhosts: [],
    isFolderAppLaunchClosing: false,
    isFolderClosing: false,
    prewarm: true,
    renderedFolder: folder,
    setFolderPageRef: null,
  }));
  app.render?.();
  if (requestId !== folderPrewarmRequestId || destroyed || shouldRunPixi.value || !app || !layer || !hostRef.value) {
    finishFolderPrewarmRequest(requestId);
    return;
  }
  layer.update(createLayerState(rect, {
    folderPageIndex: 0,
    folderPages: [],
    folderPanelRef: null,
    folderViewportRef: null,
    renderedFolder: null,
    setFolderPageRef: null,
  }));
  app.render?.();
  app.stop?.();
  prewarmedFolderKeys.add(`${folder.id || "folder"}:${firstPageItems.map((item) => item?.id || "").join(",")}`);
  finishFolderPrewarmRequest(requestId);
  scheduleFolderPrewarm();
}

function scheduleFolderPrewarm(folderOverride = null, options = {}) {
  if (!app || destroyed || shouldRunPixi.value) return;
  const folder = folderOverride || getPrewarmFolderCandidate();
  if (!folder) return;
  const firstPageItems = getFirstFolderPageItems(folder).slice(0, props.state.folderPageSize.value);
  const nextKey = getFolderPrewarmKey(folder);
  if (prewarmedFolderKeys.has(nextKey)) return;
  if (folderPrewarmKey === nextKey) return;
  cancelFolderPrewarm();
  folderPrewarmKey = nextKey;
  const requestId = folderPrewarmRequestId;
  folderPrewarmTimer = window.setTimeout(() => {
    folderPrewarmTimer = null;
    void runFolderPrewarm(folder, requestId);
  }, options.delayMs ?? FOLDER_PREWARM_DELAY);
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
  const nextApp = await createPixiApp(hostRef.value, { autoStart: false, className: "pixi-launchpad-canvas" });
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
  syncPixiActivity();
  scheduleFolderPrewarm();
});

watch(
  shouldRunPixi,
  syncPixiActivity
);

watch(
  () => props.state.activePageIndex?.value,
  () => {
    cancelFolderPrewarm();
    prewarmedFolderKeys.clear();
    scheduleFolderPrewarm();
  }
);

watch(
  () => props.state.folderOpenWarmupRequest?.value,
  (request) => {
    if (!request?.folder) return;
    scheduleFolderPrewarm(request.folder, { delayMs: 0 });
  }
);

watchEffect(() => {
  void props.state.activePageIndex?.value;
  void props.state.activePages?.value;
  void props.state.dragMeta.value;
  void props.state.dragReleaseState?.value;
  void props.state.folderGridStyle.value;
  void props.state.folderOpenWarmupRequest?.value;
  void props.state.folderOpeningOriginBounds?.value;
  void props.state.folderCloseIconGhosts?.value;
  void props.state.folderOpenIconGhosts?.value;
  void props.state.folderPageIndex.value;
  void props.state.folderPages.value;
  void props.state.folderPanelStyle.value;
  void props.state.isEditMode.value;
  void props.state.isFolderAppLaunchClosing.value;
  void props.state.isFolderCloseIconAnimationActive?.value;
  void props.state.isFolderClosing.value;
  void props.state.isFolderZoomFadeClosing?.value;
  void props.state.isFolderOpenIconAnimationActive?.value;
  void props.state.isTextlessMode.value;
  void props.state.launchTargetStatusById.value;
  void props.state.renderedFolder.value;
  void props.state.showMissingLaunchTargetBadge.value;
  renderPixi();
  scheduleFolderPrewarm();
});

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
