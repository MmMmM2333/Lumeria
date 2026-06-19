<template>
  <main
    ref="mainRef"
    class="desktop-main pixi-desktop-main pixi-desktop-main-root-stage"
    tabindex="-1"
    :style="pageGridMeasureStyle"
    @focus="$emit('desktop-focus')"
    @contextmenu.stop.prevent
  >
    <Teleport to="body">
      <div
        ref="hostRef"
        :class="[
          'pixi-desktop-host pixi-desktop-host-root-stage',
          isSingleStageDragPreviewActive && 'pixi-desktop-host-root-stage-drag-active',
        ]"
        :style="rootStageHostStyle"
        @wheel="$emit('wheel', $event)"
      />
      <div
        v-if="shouldRenderSingleStageFolderDomControls"
        class="pixi-single-stage-folder-controls"
        :style="rootStageHostStyle"
        @contextmenu.stop.prevent
      >
        <input
          class="folder-name-input pixi-folder-name-input"
          name="pixiSingleStageFolderName"
          :value="folderOverlayState.renderedFolder.value.name"
          :disabled="isSingleStageFolderInputDisabled"
          :style="singleStageFolderNameInputStyle"
          maxlength="32"
          aria-label="文件夹名称"
          @input="handleSingleStageFolderNameInput"
          @blur="restoreSingleStageEmptyFolderName"
          @keydown.enter.prevent.stop="$event.target.blur()"
          @pointerdown.stop
        />
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { getFolderPreviewSlots } from "../../domain/launchpadLayout.js";
import { createPixiApp } from "./createPixiApp.js";
import { DesktopLayer } from "./scene/DesktopLayer.js";
import { createFolderLayerState } from "./folderLayerState.js";
import { clearIconTextureCache, preloadIconTextures } from "./assets/iconTextureCache.js";
import { clearDesktopIconBounds } from "./geometry/iconBoundsRegistry.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { getPixiHostMetrics } from "./pixiHostMetrics.js";
import {
  makeDesktopRenderGeometry as makeRootStageDesktopRenderGeometry,
  makeRootStageHostStyle as makeRootStageHostStyleFromRect,
} from "./geometry/rootStageCoordinates.js";
import { createFolderClosingHandoffRetainer } from "./scene/folderClosingHandoffRetainer.js";
import { getSingleStageOptions, makeSingleStageRuntimePlan } from "./scene/singleStagePlan.js";
import {
  getSingleStageFolderTitleOpenOpacity,
  isSingleStageFolderPageDotsReady as getSingleStageFolderPageDotsReady,
  makeSingleStageFolderNameInputStyle,
} from "./scene/singleStageFolderDomControls.js";

const FOLDER_TEXTURE_PREWARM_LIMIT = 80;

const props = defineProps({
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  desktopVisualAlpha: { type: Number, default: 1 },
  desktopVisualTransform: { type: Object, default: () => ({ scale: 1, y: 0 }) },
  desktopGridDebugOptions: { type: Object, default: null },
  desktopProjectionEpoch: { type: Number, default: 0 },
  desktopTrackMotionKey: { type: String, required: true },
  domRefs: { type: Object, required: true },
  dragFolderHoverState: { type: Object, default: null },
  dragFolderTargetId: { type: String, default: null },
  dragMeta: { type: Object, default: null },
  dragPreviewState: { type: Object, default: null },
  dragReleaseGhostId: { type: String, default: null },
  dragReleaseState: { type: Object, default: null },
  folderClosingHandoffId: { type: String, default: null },
  folderOverlayState: { type: Object, default: null },
  folderPageSize: { type: Number, required: true },
  getDesktopPageRenderMode: { type: Function, required: true },
  getVisibleDesktopPage: { type: Function, required: true },
  gridCols: { type: Number, required: true },
  gridRows: { type: Number, required: true },
  iconSize: { type: Number, required: true },
  isEditMode: { type: Boolean, default: false },
  folderSourceGhostedId: { type: String, default: null },
  isFolderOpeningPreviewFrameGhosted: { type: Function, default: () => false },
  isHomeRevealSettling: { type: Boolean, default: false },
  isIconOpening: { type: Function, required: true },
  isIconSelected: { type: Function, required: true },
  isSearchMode: { type: Boolean, default: false },
  isTextlessMode: { type: Boolean, default: false },
  launchTargetStatusById: { type: Object, default: () => ({}) },
  pageGridMeasureStyle: { type: Object, required: true },
  setPageRef: { type: Function, required: true },
  showMissingLaunchTargetBadge: { type: Boolean, default: true },
  singleStageOptions: { type: Object, default: null },
  singleStageRenderKey: { type: String, default: "" },
});

const emit = defineEmits([
  "choose-app-icon",
  "context-menu-icon",
  "desktop-focus",
  "internal-activity",
  "open-app",
  "pointerdown-icon",
  "remove-app",
  "reset-app-icon",
  "wheel",
]);

function getResolvedSingleStageOptions() {
  const options = props.singleStageOptions;
  if (options && typeof options === "object") {
    if ("rootStage" in options || "folderLayer" in options || "enabled" in options || "dragPreview" in options) {
      return getSingleStageOptions(options);
    }
    if ("value" in options && options.value) return getSingleStageOptions(options.value);
  }
  return getSingleStageOptions();
}

function getResolvedSingleStageRuntimePlan(options = getResolvedSingleStageOptions()) {
  return makeSingleStageRuntimePlan(options);
}

const initialSingleStageRuntimePlan = getResolvedSingleStageRuntimePlan();
const hostRef = ref(null);
const mainRef = ref(null);
const rootStageHostStyle = ref(makeRootStageHostStyle());
const singleStageDragPreviewEnabled = ref(initialSingleStageRuntimePlan.useDragPreview);
const singleStageFolderLayerEnabled = ref(initialSingleStageRuntimePlan.useFolderLayer);
const singleStageFolderPanelGeometry = ref(null);
const singleStageFolderTitleFrame = ref(null);
const singleStageFolderNameBeforeEdit = ref("");
const singleStageFolderClosingTitleStartOpacity = ref(1);
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let folderTexturePrewarmTimer = null;
let handoffRenderFrame = null;
const folderClosingHandoffRetainer = createFolderClosingHandoffRetainer();
let handoffDebugSequence = 0;

const isSingleStageFolderGhostTransitionActive = computed(() => Boolean(
  props.folderOverlayState?.isFolderOpenIconAnimationActive?.value ||
  props.folderOverlayState?.isFolderCloseIconAnimationActive?.value
));

const isSingleStageFolderZoomFadeClosing = computed(() => Boolean(
  props.folderOverlayState?.isFolderZoomFadeClosing?.value
));

const isSingleStageFolderClosing = computed(() => Boolean(
  props.folderOverlayState?.isFolderClosing?.value ||
  props.folderOverlayState?.isFolderAppLaunchClosing?.value ||
  isSingleStageFolderZoomFadeClosing.value
));

const shouldRenderSingleStageFolderDomControls = computed(() => Boolean(
  singleStageFolderLayerEnabled.value &&
  props.folderOverlayState?.renderedFolder?.value
));

const isSingleStageFolderInputDisabled = computed(() => Boolean(
  isSingleStageFolderClosing.value ||
  isSingleStageFolderGhostTransitionActive.value
));

const isSingleStageFolderPageDotsBlocked = computed(() => Boolean(
  isSingleStageFolderClosing.value ||
  props.folderOverlayState?.isFolderOpenFrameGhostPending?.value ||
  isSingleStageFolderGhostTransitionActive.value
));

const isSingleStageFolderPageDotsReady = computed(() => (
  getSingleStageFolderPageDotsReady(singleStageFolderTitleFrame.value)
));

const isSingleStageDragPreviewActive = computed(() => Boolean(
  singleStageDragPreviewEnabled.value &&
  (props.dragPreviewState?.item || props.dragReleaseState?.item)
));

const singleStageFolderNameInputStyle = computed(() => {
  const frame = singleStageFolderTitleFrame.value || singleStageFolderPanelGeometry.value?.panel;
  return makeSingleStageFolderNameInputStyle({
    closingStartOpacity: singleStageFolderClosingTitleStartOpacity.value,
    controlsVisible: shouldRenderSingleStageFolderDomControls.value,
    frame,
    isClosing: isSingleStageFolderClosing.value,
    isInputDisabled: isSingleStageFolderInputDisabled.value,
  });
});

function shouldShowSingleStageFolderPageDots() {
  const state = props.folderOverlayState;
  return Boolean(
    shouldRenderSingleStageFolderDomControls.value &&
    state?.renderedFolder?.value &&
    state.folderPages?.value?.length > 1 &&
    !isSingleStageFolderPageDotsBlocked.value &&
    isSingleStageFolderPageDotsReady.value
  );
}

function handleSingleStageFolderNameInput(event) {
  const state = props.folderOverlayState;
  const folder = state?.renderedFolder?.value;
  if (!folder) return;
  const nextName = String(event?.target?.value || "").slice(0, 32);
  if (!nextName) return;
  state.renameFolder(folder.id, nextName);
}

function restoreSingleStageEmptyFolderName(event) {
  const state = props.folderOverlayState;
  const folder = state?.renderedFolder?.value;
  if (!folder) return;
  const input = event?.target;
  if (input?.value) {
    singleStageFolderNameBeforeEdit.value = input.value;
    return;
  }
  const fallback = singleStageFolderNameBeforeEdit.value || folder.name || "新文件夹";
  if (input) input.value = fallback;
  state.renameFolder(folder.id, fallback);
}

function syncPixiResizeTarget() {
  if (!app || !hostRef.value) return;
  if ("resizeTo" in app && app.resizeTo !== hostRef.value) app.resizeTo = hostRef.value;
  app.resize?.();
}

function handleResize() {
  syncPixiResizeTarget();
  renderPixi();
}

function nowMs() {
  return globalThis.performance?.now?.() || Date.now();
}

function getFolderHandoffDebugOptions() {
  const value = globalThis.__LP_DEBUG_FOLDER_HANDOFF__;
  if (!value) return null;
  if (value === true) return { lineWidth: 3, log: true, overlay: true, timeline: false };
  if (typeof value === "object") {
    return {
      lineWidth: Math.max(1, Number(value.lineWidth) || 3),
      log: value.log !== false,
      overlay: value.overlay !== false,
      timeline: value.timeline === true,
    };
  }
  return null;
}

function hasFolderHandoffTimelineDebug() {
  const options = getFolderHandoffDebugOptions();
  return Boolean(options?.log && options.timeline);
}

function roundDebugNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function roundDebugRect(rect) {
  if (!rect) return null;
  return {
    height: roundDebugNumber(rect.height),
    left: roundDebugNumber(rect.left),
    top: roundDebugNumber(rect.top),
    width: roundDebugNumber(rect.width),
  };
}

function readCssPx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDebugRectDelta(rect, layoutRect) {
  if (!rect || !layoutRect) return null;
  return {
    height: roundDebugNumber((rect.height || 0) - (layoutRect.height || 0)),
    left: roundDebugNumber((rect.left || 0) - (layoutRect.left || 0)),
    top: roundDebugNumber((rect.top || 0) - (layoutRect.top || 0)),
    width: roundDebugNumber((rect.width || 0) - (layoutRect.width || 0)),
  };
}

function flattenFolderHandoffSnapshot(snapshot) {
  if (!snapshot) return {};
  return {
    desktopActive: snapshot.active,
    desktopChildIndex: snapshot.childIndex,
    desktopClearing: snapshot.clearing,
    desktopIconRect: snapshot.iconRect,
    desktopLayoutTarget: snapshot.layoutTarget,
    desktopLiveTargetRect: snapshot.liveTargetRect,
    desktopNode: snapshot.node,
    desktopPageTrackX: snapshot.pageTrackX,
    desktopRegisteredThumbRect: snapshot.registeredThumbRect,
    desktopSource: snapshot.source,
    desktopStableTargetRect: snapshot.stableTargetRect,
    desktopStale: snapshot.stale,
    desktopTargetDelta: snapshot.targetDelta,
    desktopTargetRect: snapshot.targetRect,
    desktopThumbRect: snapshot.thumbRect,
  };
}

function makeFolderHandoffCompactLog(snapshot, decision, metrics, folderClosingHandoffId, seq) {
  const node = snapshot?.node || {};
  const thumbRect = snapshot?.thumbRect || {};
  const targetRect = snapshot?.targetRect || {};
  const targetDelta = snapshot?.targetDelta || {};
  const childMaxDelta = snapshot?.childMaxDelta || {};
  const childWorstDelta = snapshot?.childWorstDelta || {};
  return {
    active: snapshot?.active ?? null,
    childMaxDeltaHeight: childMaxDelta.height ?? null,
    childMaxDeltaLeft: childMaxDelta.left ?? null,
    childMaxDeltaTop: childMaxDelta.top ?? null,
    childMaxDeltaWidth: childMaxDelta.width ?? null,
    childWorstDeltaHeight: childWorstDelta.height ?? null,
    childWorstDeltaLeft: childWorstDelta.left ?? null,
    childWorstDeltaSlot: childWorstDelta.slot ?? null,
    childWorstDeltaTop: childWorstDelta.top ?? null,
    childWorstDeltaWidth: childWorstDelta.width ?? null,
    folderId: decision.folderId,
    nodeScaleX: node.scaleX ?? null,
    nodeScaleY: node.scaleY ?? null,
    nodeX: node.x ?? null,
    nodeY: node.y ?? null,
    phase: decision.phase,
    rectDeltaTop: roundDebugNumber((metrics.rect?.top || 0) - (metrics.layoutRect?.top || 0)),
    resolvedId: folderClosingHandoffId,
    seq,
    source: snapshot?.source || null,
    targetDeltaHeight: targetDelta.height ?? null,
    targetDeltaLeft: targetDelta.left ?? null,
    targetDeltaTop: targetDelta.top ?? null,
    targetDeltaWidth: targetDelta.width ?? null,
    targetHeight: targetRect.height ?? null,
    targetLeft: targetRect.left ?? null,
    targetTop: targetRect.top ?? null,
    targetWidth: targetRect.width ?? null,
    thumbHeight: thumbRect.height ?? null,
    thumbLeft: thumbRect.left ?? null,
    thumbTop: thumbRect.top ?? null,
    thumbWidth: thumbRect.width ?? null,
  };
}

function getDomRefElement(nodeRef) {
  const node = nodeRef && typeof nodeRef === "object" && "value" in nodeRef ? nodeRef.value : nodeRef;
  return node?.$el || node || null;
}

function getElementRect(nodeRef) {
  const element = getDomRefElement(nodeRef);
  const rect = element?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function makeRootStageHostStyle() {
  const rootRect = getElementRect(props.domRefs?.rootRef) || {
    height: globalThis.innerHeight || 1,
    left: 0,
    top: 0,
    width: globalThis.innerWidth || 1,
  };
  return makeRootStageHostStyleFromRect(rootRect);
}

function readMainPadding() {
  if (typeof globalThis.getComputedStyle !== "function") return { bottom: 0, top: 0 };
  const styles = globalThis.getComputedStyle(getDomRefElement(mainRef));
  return {
    bottom: readCssPx(styles?.paddingBottom),
    top: readCssPx(styles?.paddingTop),
  };
}

function resolveFolderClosingHandoffId(metrics) {
  const result = folderClosingHandoffRetainer.resolve(metrics, props.folderClosingHandoffId, {
    now: nowMs(),
    timelineDebug: hasFolderHandoffTimelineDebug(),
  });
  return result.folderClosingHandoffId;
}

function createSingleStageFolderState(metrics, options = {}, renderGeometry = makeDesktopRenderGeometry(metrics, options)) {
  const source = props.folderOverlayState;
  if (!source) return null;
  const isFolderLayer = options.folderLayer === true;
  return createFolderLayerState({
    callbacks: {
      completeFolderCloseIconGhost: isFolderLayer ? source.completeFolderCloseIconGhost : () => {},
      completeFolderOpenIconGhost: isFolderLayer ? source.completeFolderOpenIconGhost : () => {},
      getFolderPageRenderMode: source.getFolderPageRenderMode,
      getVisibleFolderPage: source.getVisibleFolderPage,
      isIconOpening: source.isIconOpening,
      isIconSelected: source.isIconSelected,
      setFolderPageRef: isFolderLayer ? source.setFolderPageRef : () => {},
    },
    drag: {
      meta: source.dragMeta?.value,
      releaseState: source.dragReleaseState?.value,
    },
    folder: {
      closeIconGhosts: source.folderCloseIconGhosts?.value,
      gridStyle: source.folderGridStyle?.value,
      isAppLaunchClosing: source.isFolderAppLaunchClosing?.value,
      isClosing: Boolean(source.isFolderClosing?.value || source.isFolderZoomFadeClosingFromFolderClose?.value),
      openingOriginBounds: source.folderOpeningOriginBounds?.value,
      openIconGhosts: source.folderOpenIconGhosts?.value,
      pageIndex: source.folderPageIndex?.value,
      pageIndexCommit: source.commitFolderPageIndex,
      pageDotsVisible: shouldShowSingleStageFolderPageDots(),
      pageSize: source.folderPageSize?.value || props.folderPageSize,
      pages: source.folderPages?.value,
      panelRef: isFolderLayer ? source.folderPanelRef : null,
      panelStyle: source.folderPanelStyle?.value,
      renderedFolder: source.renderedFolder?.value,
      viewportRef: isFolderLayer ? source.folderViewportRef : null,
    },
    stage: { rect: renderGeometry.stageRect },
    ui: {
      isEditMode: source.isEditMode?.value,
      isTextlessMode: source.isTextlessMode?.value,
      launchTargetStatusById: source.launchTargetStatusById?.value,
      showMissingLaunchTargetBadge: source.showMissingLaunchTargetBadge?.value,
    },
  }, {
    canvasStageRect: metrics.rect,
    desktopFrame: renderGeometry.desktopFrame,
    desktopStageRect: renderGeometry.desktopStageRect,
    singleStageDiagnostics: true,
  });
}

function makeDesktopRenderGeometry(metrics, options) {
  rootStageHostStyle.value = makeRootStageHostStyle();
  const mainPadding = readMainPadding();
  return makeRootStageDesktopRenderGeometry(metrics, {
    mainPaddingBottom: mainPadding.bottom,
    mainPaddingTop: mainPadding.top,
    mainRect: getElementRect(mainRef),
    rootRect: getElementRect(props.domRefs?.rootRef),
    shellRect: getElementRect(props.domRefs?.shellRef),
  });
}

function logFolderHandoffTimeline(metrics, folderClosingHandoffId) {
  const options = getFolderHandoffDebugOptions();
  if (!options?.log || !options.timeline) return;
  const decision = folderClosingHandoffRetainer.decision;
  if (!decision || (decision.phase === "idle" && folderClosingHandoffRetainer.postReleaseFrames <= 0)) return;
  const snapshot = layer?.getFolderHandoffDebugSnapshot?.(decision.folderId) || null;
  const seq = ++handoffDebugSequence;
  console.log("[folder-handoff-timeline]", {
    desktop: snapshot,
    ...flattenFolderHandoffSnapshot(snapshot),
    folderId: decision.folderId,
    handoffSettledFrameCount: folderClosingHandoffRetainer.settledFrameCount,
    isHomeRevealSettling: props.isHomeRevealSettling,
    layoutRect: roundDebugRect(metrics.layoutRect),
    now: roundDebugNumber(nowMs()),
    phase: decision.phase,
    postReleaseFramesRemaining: folderClosingHandoffRetainer.postReleaseFrames,
    propsFolderClosingHandoffId: props.folderClosingHandoffId,
    reason: decision.reason,
    rect: roundDebugRect(metrics.rect),
    rectDelta: getDebugRectDelta(metrics.rect, metrics.layoutRect),
    rectMaxDelta: roundDebugNumber(decision.rectMaxDelta),
    releaseAge: roundDebugNumber(decision.releaseAge),
    resolvedFolderClosingHandoffId: folderClosingHandoffId,
    retainedFolderClosingHandoffId: folderClosingHandoffRetainer.retainedFolderId,
    seq,
    settledFramesAtDecision: decision.settledFrames,
  });
  console.log("[folder-handoff-compact-v2]", makeFolderHandoffCompactLog(snapshot, decision, metrics, folderClosingHandoffId, seq));
  folderClosingHandoffRetainer.consumePostReleaseFrame(folderClosingHandoffId);
}

function renderPixi() {
  if (!app || !layer || !hostRef.value) return;
  syncPixiResizeTarget();
  const metrics = getPixiHostMetrics(hostRef.value);
  const folderClosingHandoffId = resolveFolderClosingHandoffId(metrics);
  const singleStageOptions = getResolvedSingleStageOptions();
  const singleStageRuntimePlan = getResolvedSingleStageRuntimePlan(singleStageOptions);
  singleStageDragPreviewEnabled.value = singleStageRuntimePlan.useDragPreview;
  singleStageFolderLayerEnabled.value = singleStageRuntimePlan.useFolderLayer;
  const renderGeometry = makeDesktopRenderGeometry(metrics);
  layer.update({
    activePageIndex: props.activePageIndex,
    activePages: props.activePages,
    desktopVisualTransform: props.desktopVisualTransform,
    desktopVisualAlpha: props.desktopVisualAlpha,
    desktopFrame: renderGeometry.desktopFrame,
    desktopGridDebugOptions: props.desktopGridDebugOptions,
    desktopTrackMotionKey: props.desktopTrackMotionKey,
    dragFolderHoverState: props.dragFolderHoverState,
    dragFolderTargetId: props.dragFolderTargetId,
    dragMeta: props.dragMeta,
    dragPreviewState: props.dragPreviewState,
    dragReleaseGhostId: props.dragReleaseGhostId,
    dragReleaseState: props.dragReleaseState,
    deviceResolution: app.renderer?.resolution || 1,
    folderClosingHandoffId,
    singleStageDragPreviewEnabled: singleStageRuntimePlan.useDragPreview,
    singleStageDiagnosticsEnabled: singleStageOptions,
    singleStageFolderLayerEnabled: singleStageRuntimePlan.useFolderLayer,
    singleStageFolderState: singleStageOptions.enabled ? createSingleStageFolderState(metrics, singleStageOptions, renderGeometry) : null,
    folderPageSize: props.folderPageSize,
    getDesktopPageRenderMode: props.getDesktopPageRenderMode,
    getVisibleDesktopPage: props.getVisibleDesktopPage,
    gridCols: props.gridCols,
    gridRows: props.gridRows,
    height: renderGeometry.height,
    iconSize: props.iconSize,
    isEditMode: props.isEditMode,
    folderSourceGhostedId: props.folderSourceGhostedId,
    isFolderOpeningPreviewFrameGhosted: props.isFolderOpeningPreviewFrameGhosted,
    isHomeRevealSettling: props.isHomeRevealSettling,
    isIconOpening: props.isIconOpening,
    isIconSelected: props.isIconSelected,
    isSearchMode: props.isSearchMode,
    isTextlessMode: props.isTextlessMode,
    launchTargetStatusById: props.launchTargetStatusById,
    setPageRef: props.setPageRef,
    shouldSnapTrack: props.desktopTrackMotionKey.includes("snap"),
    showMissingLaunchTargetBadge: props.showMissingLaunchTargetBadge,
    stageRect: renderGeometry.stageRect,
    width: renderGeometry.width,
  });
  if (singleStageRuntimePlan.useDragPreview) {
    preloadIconTextures(collectDragPreviewTextureItems(props.dragPreviewState || props.dragReleaseState));
  }
  logFolderHandoffTimeline(metrics, folderClosingHandoffId);
}

function shouldRunHandoffRenderLoop() {
  return Boolean(folderClosingHandoffRetainer.shouldRun({
    propFolderClosingHandoffId: props.folderClosingHandoffId,
    timelineDebug: hasFolderHandoffTimelineDebug(),
  }) && app && layer && hostRef.value && !destroyed);
}

function cancelHandoffRenderLoop() {
  if (handoffRenderFrame == null) return;
  window.cancelAnimationFrame(handoffRenderFrame);
  handoffRenderFrame = null;
}

function scheduleHandoffRenderLoop() {
  if (handoffRenderFrame != null || !shouldRunHandoffRenderLoop()) return;
  handoffRenderFrame = window.requestAnimationFrame(() => {
    handoffRenderFrame = null;
    if (!shouldRunHandoffRenderLoop()) return;
    renderPixi();
    app?.render?.();
    scheduleHandoffRenderLoop();
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

function collectDragPreviewTextureItems(previewState) {
  const item = previewState?.item;
  if (!item) return [];
  if (item.type !== "folder") return [item];
  return getFolderPreviewSlots(item, props.folderPageSize).filter(Boolean);
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

function handleFolderInternalActivity(active, folderId = null) {
  emit("internal-activity", Boolean(active), folderId);
}

function handleSingleStageFolderGeometryChange(geometry) {
  singleStageFolderPanelGeometry.value = geometry || null;
}

function handleSingleStageFolderTitleFrameChange(frame) {
  singleStageFolderTitleFrame.value = frame || null;
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
  cancelHandoffRenderLoop();
  folderClosingHandoffRetainer.reset();
  singleStageFolderPanelGeometry.value = null;
  singleStageFolderTitleFrame.value = null;
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
  layer = new DesktopLayer({
    onClosingFolderPointerDown: (folderId) => props.folderOverlayState?.commitOpenFolder?.(folderId),
    onFolderGeometryChange: handleSingleStageFolderGeometryChange,
    onFolderInternalActivityChange: handleFolderInternalActivity,
    onFolderOutsidePointerDown: () => props.folderOverlayState?.handleFolderOverlayPointerDown?.(),
    onFolderTitleFrameChange: handleSingleStageFolderTitleFrameChange,
    onIconAction: handleIconAction,
  });
  app.stage.addChild(layer);
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  await nextTick();
  renderPixi();
  scheduleHandoffRenderLoop();
  scheduleFolderTexturePrewarm();
});

watch(
  () => isSingleStageFolderClosing.value,
  (isClosing, wasClosing) => {
    if (isClosing && !wasClosing) {
      singleStageFolderClosingTitleStartOpacity.value = getSingleStageFolderTitleOpenOpacity(
        singleStageFolderTitleFrame.value || singleStageFolderPanelGeometry.value?.panel
      );
      return;
    }
    if (!isClosing) singleStageFolderClosingTitleStartOpacity.value = 1;
  }
);

watch(
  () => props.singleStageRenderKey,
  () => renderPixi(),
  { flush: "post" }
);

watchEffect(() => {
  void props.activePageIndex;
  void props.activePages;
  void props.desktopVisualTransform;
  void props.desktopVisualAlpha;
  void props.desktopGridDebugOptions;
  void props.desktopProjectionEpoch;
  void props.desktopTrackMotionKey;
  void props.dragFolderHoverState;
  void props.dragFolderTargetId;
  void props.dragMeta;
  void props.dragPreviewState;
  void props.dragReleaseGhostId;
  void props.dragReleaseState;
  void props.folderClosingHandoffId;
  void props.folderOverlayState;
  void props.gridCols;
  void props.gridRows;
  void props.iconSize;
  void props.isEditMode;
  void props.folderSourceGhostedId;
  void props.isHomeRevealSettling;
  void props.isSearchMode;
  void props.isTextlessMode;
  void props.launchTargetStatusById;
  void props.pageGridMeasureStyle;
  void props.folderPageSize;
  void props.singleStageOptions;
  void props.singleStageRenderKey;
  renderPixi();
  if (shouldRunHandoffRenderLoop()) scheduleHandoffRenderLoop();
  else cancelHandoffRenderLoop();
  scheduleFolderTexturePrewarm();
});

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
