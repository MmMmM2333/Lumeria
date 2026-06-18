<template>
  <main
    ref="mainRef"
    :class="['desktop-main pixi-desktop-main', rootStageCanvasEnabled && 'pixi-desktop-main-root-stage']"
    tabindex="-1"
    :style="pageGridMeasureStyle"
    @focus="$emit('desktop-focus')"
    @contextmenu.stop.prevent
  >
    <Teleport v-if="rootStageCanvasEnabled" to="body">
      <div
        ref="hostRef"
        class="pixi-desktop-host pixi-desktop-host-root-stage"
        :style="rootStageHostStyle"
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
        <footer
          v-if="folderOverlayState.folderPages.value.length > 1"
          class="folder-page-dots pixi-folder-page-dots"
          :style="singleStageFolderPageDotsStyle"
          @pointerdown.stop
        >
          <button
            v-for="index in folderOverlayState.folderPages.value.length"
            :key="index"
            type="button"
            :class="['page-dot', index - 1 === folderOverlayState.folderPageIndex.value && 'page-dot-active']"
            :aria-label="`切换到文件夹第 ${index} 页`"
            @pointerdown.stop
            @click="folderOverlayState.commitFolderPageIndex(index - 1)"
          />
        </footer>
      </div>
    </Teleport>
    <div v-else ref="hostRef" class="pixi-desktop-host" />
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { createPixiApp } from "./createPixiApp.js";
import { DesktopLayer } from "./scene/DesktopLayer.js";
import { createFolderLayerState } from "./folderLayerState.js";
import { clearIconTextureCache, preloadIconTextures } from "./assets/iconTextureCache.js";
import { clearDesktopIconBounds } from "./geometry/iconBoundsRegistry.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { getPixiHostMetrics } from "./pixiHostMetrics.js";
import { makeDesktopFrameFromStageRects } from "./geometry/rootStageCoordinates.js";
import { getSingleStageFolderProbeOptions } from "./scene/singleStageFolderProbePlan.js";

const FOLDER_TEXTURE_PREWARM_LIMIT = 80;
const HANDOFF_RECT_SETTLE_EPSILON = 0.16;
const HANDOFF_RECT_SETTLE_FRAMES = 3;
const HANDOFF_RELEASE_FALLBACK_MS = 900;

const props = defineProps({
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  desktopCanvasTransform: { type: Object, default: () => ({ scale: 1, y: 0 }) },
  desktopGridDebugOptions: { type: Object, default: null },
  desktopProjectionEpoch: { type: Number, default: 0 },
  desktopTrackMotionKey: { type: String, required: true },
  domRefs: { type: Object, required: true },
  dragFolderHoverState: { type: Object, default: null },
  dragFolderTargetId: { type: String, default: null },
  dragMeta: { type: Object, default: null },
  dragReleaseGhostId: { type: String, default: null },
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
]);

const hostRef = ref(null);
const mainRef = ref(null);
const rootStageCanvasEnabled = ref(getSingleStageFolderProbeOptions().rootStage);
const rootStageHostStyle = ref(rootStageCanvasEnabled.value ? makeRootStageHostStyle() : null);
const singleStageFolderLayerEnabled = ref(getSingleStageFolderProbeOptions().folderLayer);
const singleStageFolderPanelGeometry = ref(null);
const singleStageFolderTitleFrame = ref(null);
const singleStageFolderNameBeforeEdit = ref("");
const singleStageFolderClosingTitleStartOpacity = ref(1);
const singleStageFolderPageDotsVisible = ref(false);
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let folderTexturePrewarmTimer = null;
let singleStageFolderPageDotsRevealFrame = null;
let handoffRenderFrame = null;
let retainedFolderClosingHandoffId = null;
let handoffReleaseStartedAt = 0;
let handoffSettledFrameCount = 0;
let handoffDebugPostReleaseFrames = 0;
let handoffDebugSequence = 0;
let lastHandoffDecision = null;
let lastHandoffReleaseCommitAt = 0;
let lastReleasedFolderClosingHandoffId = null;

const FOLDER_PAGE_DOTS_REVEAL_PROGRESS = 0.995;

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
  rootStageCanvasEnabled.value &&
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
  clamp01(singleStageFolderTitleFrame.value?.progress ?? 0) >= FOLDER_PAGE_DOTS_REVEAL_PROGRESS
));

const singleStageFolderNameInputStyle = computed(() => {
  const frame = singleStageFolderTitleFrame.value || singleStageFolderPanelGeometry.value?.panel;
  if (!shouldRenderSingleStageFolderDomControls.value || !frame) return { opacity: 0, pointerEvents: "none" };
  const width = 360;
  const opacity = getSingleStageFolderTitleOpacity(frame, isSingleStageFolderClosing.value);
  const isInteractive = opacity >= 0.99 && !isSingleStageFolderInputDisabled.value;
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

const singleStageFolderPageDotsStyle = computed(() => {
  const panel = singleStageFolderPanelGeometry.value?.panel;
  const grid = singleStageFolderPanelGeometry.value?.grid;
  const isHidden = isSingleStageFolderPageDotsBlocked.value || !singleStageFolderPageDotsVisible.value;
  if (!shouldRenderSingleStageFolderDomControls.value || !panel) return { opacity: 0, pointerEvents: "none" };
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

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getSingleStageFolderTitleOpenOpacity(frame) {
  const progress = clamp01(frame?.progress ?? 1);
  return clamp01((progress - 0.18) / 0.28);
}

function getSingleStageFolderTitleOpacity(frame, isClosing) {
  if (!isClosing) return getSingleStageFolderTitleOpenOpacity(frame);
  const progress = clamp01(frame?.progress ?? 0);
  return singleStageFolderClosingTitleStartOpacity.value * clamp01(1 - progress / 0.28);
}

function cancelSingleStageFolderPageDotsReveal() {
  if (singleStageFolderPageDotsRevealFrame == null) return;
  globalThis.cancelAnimationFrame?.(singleStageFolderPageDotsRevealFrame);
  singleStageFolderPageDotsRevealFrame = null;
}

function scheduleSingleStageFolderPageDotsReveal() {
  cancelSingleStageFolderPageDotsReveal();
  singleStageFolderPageDotsRevealFrame = globalThis.requestAnimationFrame?.(() => {
    singleStageFolderPageDotsRevealFrame = null;
    const state = props.folderOverlayState;
    if (!state?.renderedFolder?.value ||
      state.folderPages?.value?.length <= 1 ||
      isSingleStageFolderPageDotsBlocked.value ||
      !isSingleStageFolderPageDotsReady.value) return;
    singleStageFolderPageDotsVisible.value = true;
  }) ?? null;
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

function handleResize() {
  app?.resize?.();
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
    desktopStageVisualOffsetY: snapshot.stageVisualOffsetY,
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

function getRectMaxDelta(rect, layoutRect) {
  if (!rect || !layoutRect) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs((rect.left || 0) - (layoutRect.left || 0)),
    Math.abs((rect.top || 0) - (layoutRect.top || 0)),
    Math.abs((rect.width || 0) - (layoutRect.width || 0)),
    Math.abs((rect.height || 0) - (layoutRect.height || 0))
  );
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

function getSingleStageCandidateRect(metrics) {
  return getElementRect(props.domRefs?.rootRef) ||
    getElementRect(props.domRefs?.shellRef) ||
    metrics.layoutRect ||
    metrics.rect;
}

function getDesktopContentRect(metrics, stageRect = metrics.rect) {
  const mainRect = getElementRect(mainRef);
  if (!mainRect || typeof globalThis.getComputedStyle !== "function") return metrics.layoutRect;
  const styles = globalThis.getComputedStyle(getDomRefElement(mainRef));
  const paddingTop = readCssPx(styles.paddingTop);
  const paddingBottom = readCssPx(styles.paddingBottom);
  return {
    height: Math.max(1, mainRect.height - paddingTop - paddingBottom),
    left: stageRect.left,
    top: mainRect.top + paddingTop,
    width: stageRect.width,
  };
}

function makeRootStageHostStyle() {
  const rootRect = getElementRect(props.domRefs?.rootRef) || {
    height: globalThis.innerHeight || 1,
    left: 0,
    top: 0,
    width: globalThis.innerWidth || 1,
  };
  return {
    "--pixi-root-stage-height": `${Math.max(1, rootRect.height)}px`,
    "--pixi-root-stage-left": `${rootRect.left}px`,
    "--pixi-root-stage-top": `${rootRect.top}px`,
    "--pixi-root-stage-width": `${Math.max(1, rootRect.width)}px`,
  };
}

function syncRootStageCanvasFlag(options) {
  const nextEnabled = Boolean(options?.rootStage);
  rootStageHostStyle.value = nextEnabled ? makeRootStageHostStyle() : null;
  if (rootStageCanvasEnabled.value === nextEnabled) return false;
  rootStageCanvasEnabled.value = nextEnabled;
  nextTick(() => {
    if (destroyed) return;
    if (app?.canvas && hostRef.value && app.canvas.parentElement !== hostRef.value) {
      hostRef.value.replaceChildren(app.canvas);
    }
    app?.resize?.();
    renderPixi();
  });
  return true;
}

function resolveFolderClosingHandoffId(metrics) {
  const now = nowMs();
  const rectMaxDelta = getRectMaxDelta(metrics.rect, metrics.layoutRect);
  if (props.folderClosingHandoffId) {
    retainedFolderClosingHandoffId = props.folderClosingHandoffId;
    handoffReleaseStartedAt = 0;
    handoffSettledFrameCount = 0;
    handoffDebugPostReleaseFrames = 0;
    lastHandoffDecision = {
      folderId: props.folderClosingHandoffId,
      phase: "prop-active",
      rectMaxDelta,
      releaseAge: 0,
      reason: null,
      settledFrames: handoffSettledFrameCount,
    };
    return props.folderClosingHandoffId;
  }
  if (!retainedFolderClosingHandoffId) {
    lastHandoffDecision = handoffDebugPostReleaseFrames > 0
      ? {
          folderId: lastReleasedFolderClosingHandoffId,
          phase: "post-release",
          rectMaxDelta,
          releaseAge: lastHandoffReleaseCommitAt ? now - lastHandoffReleaseCommitAt : 0,
          reason: null,
          settledFrames: handoffSettledFrameCount,
        }
      : { folderId: null, phase: "idle", rectMaxDelta, releaseAge: 0, reason: null, settledFrames: 0 };
    return null;
  }

  if (!handoffReleaseStartedAt) handoffReleaseStartedAt = now;
  const isSettled = getRectMaxDelta(metrics.rect, metrics.layoutRect) <= HANDOFF_RECT_SETTLE_EPSILON;
  handoffSettledFrameCount = isSettled ? handoffSettledFrameCount + 1 : 0;
  const didSettle = handoffSettledFrameCount >= HANDOFF_RECT_SETTLE_FRAMES;
  const releaseAge = now - handoffReleaseStartedAt;
  const didTimeout = releaseAge >= HANDOFF_RELEASE_FALLBACK_MS;
  if (!didSettle && !didTimeout) {
    lastHandoffDecision = {
      folderId: retainedFolderClosingHandoffId,
      phase: "release-wait",
      rectMaxDelta,
      releaseAge,
      reason: null,
      settledFrames: handoffSettledFrameCount,
    };
    return retainedFolderClosingHandoffId;
  }

  const releasedFolderId = retainedFolderClosingHandoffId;
  const settledFramesAtDecision = handoffSettledFrameCount;
  retainedFolderClosingHandoffId = null;
  handoffReleaseStartedAt = 0;
  handoffSettledFrameCount = 0;
  lastReleasedFolderClosingHandoffId = releasedFolderId;
  lastHandoffReleaseCommitAt = now;
  if (hasFolderHandoffTimelineDebug()) handoffDebugPostReleaseFrames = 8;
  lastHandoffDecision = {
    folderId: releasedFolderId,
    phase: "release-commit",
    rectMaxDelta,
    releaseAge,
    reason: didSettle ? "settled" : "timeout",
    settledFrames: settledFramesAtDecision,
  };
  return null;
}

function createSingleStageFolderState(metrics, options = {}) {
  const source = props.folderOverlayState;
  if (!source) return null;
  const isFolderLayer = options.folderLayer === true;
  const stageRect = getSingleStageCandidateRect(metrics);
  const desktopStageRect = options.rootStage ? getDesktopContentRect(metrics, stageRect) : metrics.layoutRect;
  const desktopFrame = makeDesktopFrameFromStageRects(stageRect, desktopStageRect);
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
      pageSize: source.folderPageSize?.value || props.folderPageSize,
      pages: source.folderPages?.value,
      panelRef: isFolderLayer ? source.folderPanelRef : null,
      panelStyle: source.folderPanelStyle?.value,
      renderedFolder: source.renderedFolder?.value,
      viewportRef: isFolderLayer ? source.folderViewportRef : null,
    },
    stage: { rect: stageRect },
    ui: {
      isEditMode: source.isEditMode?.value,
      isTextlessMode: source.isTextlessMode?.value,
      launchTargetStatusById: source.launchTargetStatusById?.value,
      showMissingLaunchTargetBadge: source.showMissingLaunchTargetBadge?.value,
    },
  }, {
    canvasStageRect: metrics.rect,
    desktopFrame,
    desktopStageRect,
    singleStageProbe: true,
  });
}

function makeDesktopRenderGeometry(metrics, options) {
  rootStageHostStyle.value = options.rootStage ? makeRootStageHostStyle() : null;
  if (!options.rootStage) {
    return {
      desktopFrame: { height: Math.max(1, metrics.height), left: 0, top: 0, width: Math.max(1, metrics.width) },
      height: Math.max(1, metrics.height),
      stableStageRect: metrics.layoutRect,
      stageRect: metrics.rect,
      width: Math.max(1, metrics.width),
    };
  }
  const stageRect = getSingleStageCandidateRect(metrics);
  const desktopStageRect = getDesktopContentRect(metrics, stageRect);
  return {
    desktopFrame: makeDesktopFrameFromStageRects(stageRect, desktopStageRect),
    height: Math.max(1, stageRect.height),
    stableStageRect: stageRect,
    stageRect,
    width: Math.max(1, stageRect.width),
  };
}

function logFolderHandoffTimeline(metrics, folderClosingHandoffId) {
  const options = getFolderHandoffDebugOptions();
  if (!options?.log || !options.timeline) return;
  const decision = lastHandoffDecision;
  if (!decision || (decision.phase === "idle" && handoffDebugPostReleaseFrames <= 0)) return;
  const snapshot = layer?.getFolderHandoffDebugSnapshot?.(decision.folderId) || null;
  const seq = ++handoffDebugSequence;
  console.log("[folder-handoff-timeline]", {
    desktop: snapshot,
    ...flattenFolderHandoffSnapshot(snapshot),
    folderId: decision.folderId,
    handoffSettledFrameCount,
    isHomeRevealSettling: props.isHomeRevealSettling,
    layoutRect: roundDebugRect(metrics.layoutRect),
    now: roundDebugNumber(nowMs()),
    phase: decision.phase,
    postReleaseFramesRemaining: handoffDebugPostReleaseFrames,
    propsFolderClosingHandoffId: props.folderClosingHandoffId,
    reason: decision.reason,
    rect: roundDebugRect(metrics.rect),
    rectDelta: getDebugRectDelta(metrics.rect, metrics.layoutRect),
    rectMaxDelta: roundDebugNumber(decision.rectMaxDelta),
    releaseAge: roundDebugNumber(decision.releaseAge),
    resolvedFolderClosingHandoffId: folderClosingHandoffId,
    retainedFolderClosingHandoffId,
    seq,
    settledFramesAtDecision: decision.settledFrames,
  });
  console.log("[folder-handoff-compact-v2]", makeFolderHandoffCompactLog(snapshot, decision, metrics, folderClosingHandoffId, seq));
  if (!folderClosingHandoffId && handoffDebugPostReleaseFrames > 0) handoffDebugPostReleaseFrames -= 1;
}

function renderPixi() {
  if (!app || !layer || !hostRef.value) return;
  const metrics = getPixiHostMetrics(hostRef.value);
  const folderClosingHandoffId = resolveFolderClosingHandoffId(metrics);
  const singleStageFolderProbeOptions = getSingleStageFolderProbeOptions();
  singleStageFolderLayerEnabled.value = singleStageFolderProbeOptions.folderLayer;
  if (syncRootStageCanvasFlag(singleStageFolderProbeOptions)) return;
  const renderGeometry = makeDesktopRenderGeometry(metrics, singleStageFolderProbeOptions);
  layer.update({
    activePageIndex: props.activePageIndex,
    activePages: props.activePages,
    desktopCanvasTransform: props.desktopCanvasTransform,
    desktopFrame: renderGeometry.desktopFrame,
    desktopGridDebugOptions: props.desktopGridDebugOptions,
    desktopTrackMotionKey: props.desktopTrackMotionKey,
    dragFolderHoverState: props.dragFolderHoverState,
    dragFolderTargetId: props.dragFolderTargetId,
    dragMeta: props.dragMeta,
    dragReleaseGhostId: props.dragReleaseGhostId,
    deviceResolution: app.renderer?.resolution || 1,
    folderClosingHandoffId,
    singleStageFolderProbeEnabled: singleStageFolderProbeOptions,
    singleStageFolderLayerEnabled: singleStageFolderProbeOptions.folderLayer,
    singleStageFolderState: singleStageFolderProbeOptions.enabled ? createSingleStageFolderState(metrics, singleStageFolderProbeOptions) : null,
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
    stableStageRect: renderGeometry.stableStageRect,
    stageRect: renderGeometry.stageRect,
    width: renderGeometry.width,
  });
  logFolderHandoffTimeline(metrics, folderClosingHandoffId);
}

function shouldRunHandoffRenderLoop() {
  const shouldLogPostRelease = handoffDebugPostReleaseFrames > 0 && hasFolderHandoffTimelineDebug();
  return Boolean((props.folderClosingHandoffId || retainedFolderClosingHandoffId || shouldLogPostRelease) && app && layer && hostRef.value && !destroyed);
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
  retainedFolderClosingHandoffId = null;
  handoffReleaseStartedAt = 0;
  handoffSettledFrameCount = 0;
  handoffDebugPostReleaseFrames = 0;
  singleStageFolderPanelGeometry.value = null;
  singleStageFolderTitleFrame.value = null;
  singleStageFolderPageDotsVisible.value = false;
  lastHandoffDecision = null;
  lastHandoffReleaseCommitAt = 0;
  lastReleasedFolderClosingHandoffId = null;
  cancelSingleStageFolderPageDotsReveal();
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
  () => ({
    blocked: isSingleStageFolderPageDotsBlocked.value,
    folderId: props.folderOverlayState?.renderedFolder?.value?.id || null,
    pageCount: props.folderOverlayState?.folderPages?.value?.length || 0,
    ready: isSingleStageFolderPageDotsReady.value,
  }),
  (state, previous) => {
    const canShow = Boolean(
      shouldRenderSingleStageFolderDomControls.value &&
      state.folderId &&
      state.pageCount > 1 &&
      !state.blocked &&
      state.ready
    );
    cancelSingleStageFolderPageDotsReveal();
    if (!canShow || state.folderId !== previous?.folderId) singleStageFolderPageDotsVisible.value = false;
    if (canShow) scheduleSingleStageFolderPageDotsReveal();
  },
  { immediate: true }
);

watchEffect(() => {
  void props.activePageIndex;
  void props.activePages;
  void props.desktopCanvasTransform;
  void props.desktopGridDebugOptions;
  void props.desktopProjectionEpoch;
  void props.desktopTrackMotionKey;
  void props.dragFolderHoverState;
  void props.dragFolderTargetId;
  void props.dragMeta;
  void props.dragReleaseGhostId;
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
