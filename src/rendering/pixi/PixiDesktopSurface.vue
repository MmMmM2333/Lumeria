<template>
  <main
    ref="mainRef"
    class="desktop-main pixi-desktop-main pixi-desktop-main-root-stage"
    tabindex="-1"
    :style="pageGridMeasureStyle"
    @focus="$emit('desktop-focus')"
  >
    <Teleport to="body">
      <div
        ref="hostRef"
        :class="[
          'pixi-desktop-host pixi-desktop-host-root-stage',
          isSingleStageDragPreviewActive && 'pixi-desktop-host-root-stage-drag-active',
        ]"
        :style="rootStageHostStyle"
        @contextmenu="requestContextMenuAtPointer"
        @pointerdown="$emit('surface-pointerdown', $event)"
        @wheel="$emit('wheel', $event)"
      />
      <div
        v-if="shouldRenderSingleStageFolderDomControls"
        class="pixi-single-stage-folder-controls"
        :style="rootStageHostStyle"
        @contextmenu.stop.prevent
      >
        <input
          ref="folderNameInputRef"
          class="folder-name-input pixi-folder-name-input"
          name="pixiSingleStageFolderName"
          :value="folderOverlayState.renderedFolder.value.name"
          :disabled="isSingleStageFolderInputDisabled"
          :style="singleStageFolderNameInputStyle"
          maxlength="32"
          :aria-label="t('launchpad.folderName')"
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
import { WINDOW_CHROME_STATE_CHANGE_EVENT } from "../../api/windowChromeApi.js";
import { getFolderPreviewSlots } from "../../domain/launchpadLayout.js";
import { createPixiApp } from "./createPixiApp.js";
import { DesktopLayer } from "./scene/DesktopLayer.js";
import { createFolderLayerState } from "./folderLayerState.js";
import { readFolderOverlayStateRenderDependencies } from "./folderOverlayStateDependencies.js";
import { createDragRenderSnapshot } from "./dragRenderSnapshot.js";
import {
  clearIconTextureCache,
  getIconTextureCacheDebugSnapshot,
  preloadIconTextures,
  preloadIconTexturesAsync,
  subscribeIconTextureLoadSettlements,
} from "./assets/iconTextureCache.js";
import { createPixiRenderScheduler } from "./pixiRenderScheduler.js";
import {
  makeFolderInternalActivityRenderReason,
  makeIconActionRenderReason,
} from "./pixiRenderTriggers.js";
import {
  installMotionRuntimeDebugAdapterFactory,
  motionRuntime,
} from "./animation/motionRuntime.js";
import { disposePixiForHotReload, reloadOnPixiHotUpdate } from "./devHmr.js";
import { getPixiHostMetrics } from "./pixiHostMetrics.js";
import {
  makeDesktopRenderGeometry as makeRootStageDesktopRenderGeometry,
  makeRootStageHostStyle as makeRootStageHostStyleFromRect,
} from "./geometry/rootStageCoordinates.js";
import { createFolderClosingHandoffRetainer } from "./scene/folderClosingHandoffRetainer.js";
import { createResizeSettleScheduler } from "./resizeSettleScheduler.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta as getDebugRectDelta,
  roundNumber as roundDebugNumber,
  roundRect as roundDebugRect,
} from "./scene/folderHandoffDebug.js";
import { getSingleStageDiagnosticsOptions } from "./scene/singleStagePlan.js";
import {
  getSingleStageFolderTitleOpenOpacity,
  makeSingleStageFolderNameInputStyle,
} from "./scene/singleStageFolderDomControls.js";
import { useLocalization } from "../../i18n/localization.js";

const FOLDER_TEXTURE_PREWARM_LIMIT = 80;
const VISIBLE_ICON_TEXTURE_PRELOAD_TIMEOUT_MS = 1500;
const RESIZE_SETTLE_FRAMES = 3;
const WINDOW_CHROME_RESIZE_SETTLE_FRAMES = 12;

const props = defineProps({
  activePageIndex: { type: Number, required: true },
  activePages: { type: Array, required: true },
  desktopVisualAlpha: { type: Number, default: 1 },
  desktopVisualTransform: { type: Object, default: () => ({ scale: 1, y: 0 }) },
  launchpadVisualAlpha: { type: Number, default: 1 },
  launchpadVisualTransform: { type: Object, default: () => ({ scale: 1, y: 0 }) },
  desktopGridDebugOptions: { type: Object, default: null },
  desktopProjectionEpoch: { type: Number, default: 0 },
  desktopTrackMotionKey: { type: String, required: true },
  domRefs: { type: Object, required: true },
  dragFolderHoverState: { type: Object, default: null },
  dragFolderTargetId: { type: String, default: null },
  dragHitDebugOptions: { type: Object, default: null },
  dragHitDebugState: { type: Object, default: null },
  dragMeta: { type: Object, default: null },
  groupDragState: { type: Object, default: null },
  folderClosingHandoffId: { type: String, default: null },
  folderOverlayState: { type: Object, default: null },
  folderPageSize: { type: Number, required: true },
  getDesktopPageRenderMode: { type: Function, required: true },
  getVisibleDesktopPage: { type: Function, required: true },
  gridCols: { type: Number, required: true },
  gridRows: { type: Number, required: true },
  iconSize: { type: Number, required: true },
  iconGesturePresentation: { type: Object, default: null },
  iconBoundsRegistry: { type: Object, required: true },
  isBatchSelectionActive: { type: Boolean, default: false },
  isEditMode: { type: Boolean, default: false },
  isDesktopClosing: { type: Boolean, default: false },
  folderSourceGhostedId: { type: String, default: null },
  folderSourceGhostedIds: { type: [Array, Set], default: () => [] },
  isFolderOpeningPreviewFrameGhosted: { type: Function, default: () => false },
  isHomeRevealSettling: { type: Boolean, default: false },
  isIconOpening: { type: Function, required: true },
  focusedIcon: { type: Object, default: null },
  selectedAppIds: { type: [Array, Set], default: () => [] },
  isSearchMode: { type: Boolean, default: false },
  isTextlessMode: { type: Boolean, default: false },
  launchTargetStatusById: { type: Object, default: () => ({}) },
  liveDesktopDiagnosticsPort: { type: Object, default: null },
  pageGridMeasureStyle: { type: Object, required: true },
  pageTrackScrub: { type: Object, default: null },
  setPageRef: { type: Function, required: true },
  showMissingLaunchTargetBadge: { type: Boolean, default: true },
  singleStageDiagnosticsOptions: { type: [Boolean, Object], default: null },
});
const localization = useLocalization();
const { t } = localization;
const pixiRenderCopy = computed(() => ({
  newFolderName: t("launchpad.newFolder"),
  searchEmpty: t("launchpad.search.empty"),
}));

const emit = defineEmits([
  "choose-app-icon",
  "context-menu-request",
  "desktop-focus",
  "group-release-complete",
  "internal-activity",
  "pointerdown-icon",
  "remove-app",
  "reset-app-icon",
  "surface-pointerdown",
  "wheel",
]);

function getResolvedSingleStageDiagnosticsOptions() {
  const options = props.singleStageDiagnosticsOptions;
  if (options && typeof options === "object") {
    if ("value" in options) return getSingleStageDiagnosticsOptions(options.value);
  }
  return getSingleStageDiagnosticsOptions(options);
}

function resolveMaybeRef(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

const hostRef = ref(null);
const mainRef = ref(null);
const folderNameInputRef = ref(null);
const rootStageHostStyle = ref(makeRootStageHostStyle());
const singleStageFolderPanelGeometry = ref(null);
const singleStageFolderTitleFrame = ref(null);
const singleStageFolderNameBeforeEdit = ref("");
const singleStageFolderClosingTitleStartOpacity = ref(1);
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let folderTexturePrewarmTimer = null;
let folderTexturePrewarmGeneration = 0;
let renderScheduler = null;
let renderProbe = null;
let diagnosticHub = null;
let diagnosticGlobalInstallation = null;
let desktopDomGeometryCache = null;
let pixiResizeSignature = "";
let motionDebugOverlay = null;
let unsubscribeIconTextureLoadSettlements = null;
let unsubscribeMotionRuntimeRenderSignal = null;
let desktopMotionRuntimeSuspended = false;
let desktopFrameHandle = null;
let desktopFrameLastTime = 0;
let desktopMotionFrameNeedsRender = false;
let desktopLayerUpdatePending = false;
let desktopResizeLayoutSnapPending = false;
let resizeSettleScheduler = null;
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
  props.folderOverlayState?.renderedFolder?.value
));

const isSingleStageFolderInputDisabled = computed(() => Boolean(
  isSingleStageFolderClosing.value ||
  isSingleStageFolderGhostTransitionActive.value
));

const isSingleStageFolderPageDotsBlocked = computed(() => Boolean(
  isSingleStageFolderClosing.value ||
  props.folderOverlayState?.isFolderOpenFrameGhostPending?.value
));

const isSingleStageDragPreviewActive = computed(() => Boolean(
  props.groupDragState?.key
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
    !isSingleStageFolderPageDotsBlocked.value
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
  const fallback = singleStageFolderNameBeforeEdit.value || folder.name || t("launchpad.newFolder");
  if (input) input.value = fallback;
  state.renameFolder(folder.id, fallback);
}

watch(
  [
    () => props.folderOverlayState?.folderRenameRequest?.value?.token ?? null,
    () => props.folderOverlayState?.openFolderId?.value ?? null,
    () => props.folderOverlayState?.renderedFolder?.value?.id ?? null,
    () => isSingleStageFolderInputDisabled.value,
  ],
  async ([token, openFolderId, renderedFolderId, inputDisabled]) => {
    const request = props.folderOverlayState?.folderRenameRequest?.value;
    if (!token || !request) return;
    if (request.folderId !== openFolderId) {
      props.folderOverlayState?.completeFolderRenameRequest?.(token);
      return;
    }
    if (inputDisabled || request.folderId !== renderedFolderId) return;
    // Reuse the existing title editor after the opening handoff releases it.
    await nextTick();
    if (props.folderOverlayState?.folderRenameRequest?.value?.token !== token) return;
    const input = folderNameInputRef.value;
    if (!input || input.disabled) return;
    input.focus({ preventScroll: true });
    input.select();
    props.folderOverlayState?.completeFolderRenameRequest?.(token);
  }
);

function syncPixiResizeTarget(metrics = null) {
  if (!app || !hostRef.value) return;
  let shouldResize = false;
  if ("resizeTo" in app && app.resizeTo !== hostRef.value) {
    app.resizeTo = hostRef.value;
    shouldResize = true;
  }
  const width = Math.max(1, Number(metrics?.width) || hostRef.value.offsetWidth || hostRef.value.clientWidth || 1);
  const height = Math.max(1, Number(metrics?.height) || hostRef.value.offsetHeight || hostRef.value.clientHeight || 1);
  const signature = `${width}:${height}`;
  if (pixiResizeSignature !== signature) {
    pixiResizeSignature = signature;
    shouldResize = true;
  }
  if (shouldResize) app.resize?.();
}

function getResizeSettleScheduler() {
  if (resizeSettleScheduler) return resizeSettleScheduler;
  resizeSettleScheduler = createResizeSettleScheduler({
    defaultFrameCount: RESIZE_SETTLE_FRAMES,
    onFrame: (reason) => {
      invalidateDesktopDomGeometry();
      refreshDesktopDomGeometry();
      desktopLayerUpdatePending = true;
      desktopResizeLayoutSnapPending = true;
      getRenderScheduler().markRenderPending(reason);
    },
  });
  return resizeSettleScheduler;
}

function requestResizeSettle(reason = "resize", frameCount = RESIZE_SETTLE_FRAMES) {
  if (destroyed) return false;
  const didStart = getResizeSettleScheduler().request(reason, frameCount);
  scheduleDesktopFrame();
  return didStart;
}

function handleResize() {
  requestResizeSettle("resize", RESIZE_SETTLE_FRAMES);
}

function handleWindowChromeStateChange() {
  requestResizeSettle("window-state-resize", WINDOW_CHROME_RESIZE_SETTLE_FRAMES);
}

function nowMs() {
  return globalThis.performance?.now?.() || Date.now();
}

function hasFolderHandoffTimelineDebug() {
  const options = getFolderHandoffDebugOptions();
  return Boolean(options?.log && options.timeline);
}

function readCssPx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function makeRootStageHostStyle(rootRect = null) {
  const resolvedRootRect = rootRect || getElementRect(props.domRefs?.rootRef) || {
    height: globalThis.innerHeight || 1,
    left: 0,
    top: 0,
    width: globalThis.innerWidth || 1,
  };
  return makeRootStageHostStyleFromRect(resolvedRootRect);
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

function createSingleStageFolderState(
  metrics,
  dragSnapshot,
  diagnosticsOptions = {},
  renderGeometry = makeDesktopRenderGeometry(metrics)
) {
  const source = props.folderOverlayState;
  if (!source) return null;
  const sourceFolder = source.renderedFolder?.value;
  const projectedFolder = sourceFolder?.id
    ? dragSnapshot.groupDragState?.projectedPages
      ?.flatMap((page) => page || [])
      .find((item) => item?.type === "folder" && item.id === sourceFolder.id) || null
    : null;
  const renderedFolder = projectedFolder || sourceFolder;
  const folderPages = projectedFolder
    ? (
      Array.isArray(projectedFolder.childPages)
        ? projectedFolder.childPages
        : [projectedFolder.children || []]
    )
    : source.folderPages?.value;
  return createFolderLayerState({
    callbacks: {
      completeFolderCloseIconGhost: source.completeFolderCloseIconGhost,
      completeFolderOpenFrameGhost: source.completeFolderOpenFrameGhost,
      completeFolderOpenIconGhost: source.completeFolderOpenIconGhost,
      getFolderPageRenderMode: source.getFolderPageRenderMode,
      getVisibleFolderPage: source.getVisibleFolderPage,
      isIconOpening: source.isIconOpening,
      setFolderPageRef: source.setFolderPageRef,
    },
    drag: {
      meta: dragSnapshot.dragMeta,
    },
    folder: {
      closeIconGhosts: source.folderCloseIconGhosts?.value,
      desktopClosing: props.isDesktopClosing,
      gridStyle: source.folderGridStyle?.value,
      isAppLaunchClosing: source.isFolderAppLaunchClosing?.value,
      isClosing: Boolean(source.isFolderClosing?.value || source.isFolderZoomFadeClosingFromFolderClose?.value),
      isZoomFadeClosing: source.isFolderZoomFadeClosing?.value,
      zoomFadeCloseReason: source.folderZoomFadeCloseReason?.value,
      openingOriginBounds: source.folderOpeningOriginBounds?.value,
      openProgress: source.folderOpenProgress?.value,
      openProgressTarget: source.folderOpenProgressTarget?.value,
      openIconGhosts: source.folderOpenIconGhosts?.value,
      pageIndex: source.folderPageIndex?.value,
      pageIndexCommit: source.commitFolderPageIndex,
      pageTurnToken: source.folderPageTurnRequest?.value?.token ?? null,
      pageTrackScrub: resolveMaybeRef(source.folderPageTrackScrub) || null,
      pageDotsVisible: shouldShowSingleStageFolderPageDots(),
      pageSize: source.folderPageSize?.value || props.folderPageSize,
      pages: folderPages,
      panelRef: source.folderPanelRef,
      panelStyle: source.folderPanelStyle?.value,
      renderedFolder,
      viewportRef: source.folderViewportRef,
      visualPageIndex: source.visualFolderPageIndex?.value ?? source.folderPageIndex?.value,
    },
    stage: { rect: renderGeometry.stageRect },
    ui: {
      iconGesturePresentation: props.iconGesturePresentation,
      isEditMode: source.isEditMode?.value,
      isBatchSelectionActive: props.isBatchSelectionActive,
      isTextlessMode: source.isTextlessMode?.value,
      launchTargetStatusById: source.launchTargetStatusById?.value,
      focusedIcon: props.focusedIcon,
      selectedAppIds: props.selectedAppIds,
      showMissingLaunchTargetBadge: source.showMissingLaunchTargetBadge?.value,
    },
  }, {
    canvasStageRect: metrics.rect,
    desktopFrame: renderGeometry.desktopFrame,
    desktopStageRect: renderGeometry.desktopStageRect,
    singleStageDiagnostics: diagnosticsOptions.diagnostics === true,
  });
}

function makeDesktopRenderGeometryFromDom(metrics) {
  const rootRect = getElementRect(props.domRefs?.rootRef) || {
    height: globalThis.innerHeight || 1,
    left: 0,
    top: 0,
    width: globalThis.innerWidth || 1,
  };
  const mainPadding = readMainPadding();
  const renderGeometry = makeRootStageDesktopRenderGeometry(metrics, {
    mainPaddingBottom: mainPadding.bottom,
    mainPaddingTop: mainPadding.top,
    mainRect: getElementRect(mainRef),
    rootRect,
    shellRect: getElementRect(props.domRefs?.shellRef),
  });
  return {
    metrics,
    renderGeometry,
    rootStageHostStyle: makeRootStageHostStyle(rootRect),
  };
}

function invalidateDesktopDomGeometry() {
  desktopDomGeometryCache = null;
}

function refreshDesktopDomGeometry() {
  if (!hostRef.value) return null;
  const metrics = getPixiHostMetrics(hostRef.value);
  desktopDomGeometryCache = makeDesktopRenderGeometryFromDom(metrics);
  rootStageHostStyle.value = desktopDomGeometryCache.rootStageHostStyle;
  syncPixiResizeTarget(metrics);
  return desktopDomGeometryCache;
}

function getDesktopDomGeometry() {
  return desktopDomGeometryCache || refreshDesktopDomGeometry();
}

function makeDesktopRenderGeometry(metrics) {
  if (desktopDomGeometryCache?.metrics === metrics) return desktopDomGeometryCache.renderGeometry;
  const cached = getDesktopDomGeometry();
  return cached?.renderGeometry || makeDesktopRenderGeometryFromDom(metrics).renderGeometry;
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
  folderClosingHandoffRetainer.consumePostReleaseFrame(folderClosingHandoffId);
}

function updateMotionDebugOverlay() {
  if (!import.meta.env.DEV || !motionDebugOverlay) return;
  const config = motionRuntime.configureDebug();
  if (!config.overlayEnabled) {
    motionDebugOverlay.update({ enabled: false });
    return;
  }
  motionDebugOverlay.update({
    enabled: true,
    maxItems: 18,
    runtime: motionRuntime,
    stageHeight: pixiResizeSignature ? app?.renderer?.height : undefined,
    stageWidth: pixiResizeSignature ? app?.renderer?.width : undefined,
  });
}

function renderPixi(options = {}) {
  if (!app || !layer || !hostRef.value) return false;
  const shouldUpdateLayer = options.updateLayer !== false;
  const domGeometry = getDesktopDomGeometry();
  if (!domGeometry) return false;
  const { metrics, renderGeometry } = domGeometry;
  const folderClosingHandoffId = resolveFolderClosingHandoffId(metrics);
  if (shouldUpdateLayer) {
    layer.setRenderCopy(pixiRenderCopy.value);
    const singleStageDiagnosticsOptions = getResolvedSingleStageDiagnosticsOptions();
    // Nested controller refs can update before Vue flushes the matching props.
    // Capture drag ownership once so real icons and the preview cannot disagree
    // about the same release during this Pixi frame.
    const dragSnapshot = createDragRenderSnapshot(props);
    layer.update({
      activePageIndex: props.activePageIndex,
      activePages: props.activePages,
      desktopVisualTransform: props.desktopVisualTransform,
      desktopVisualAlpha: props.desktopVisualAlpha,
      launchpadVisualAlpha: props.launchpadVisualAlpha,
      launchpadVisualTransform: props.launchpadVisualTransform,
      desktopFrame: renderGeometry.desktopFrame,
      desktopGridDebugOptions: props.desktopGridDebugOptions,
      desktopTrackMotionKey: props.desktopTrackMotionKey,
      dragFolderHoverState: props.dragFolderHoverState,
      dragFolderTargetId: props.dragFolderTargetId,
      dragHitDebugOptions: props.dragHitDebugOptions,
      dragHitDebugState: props.dragHitDebugState,
      ...dragSnapshot,
      deviceResolution: app.renderer?.resolution || 1,
      folderClosingHandoffId,
      singleStageDiagnosticsEnabled: singleStageDiagnosticsOptions,
      singleStageFolderState: createSingleStageFolderState(
        metrics,
        dragSnapshot,
        singleStageDiagnosticsOptions,
        renderGeometry
      ),
      folderPageSize: props.folderPageSize,
      getDesktopPageRenderMode: props.getDesktopPageRenderMode,
      getVisibleDesktopPage: props.getVisibleDesktopPage,
      gridCols: props.gridCols,
      gridRows: props.gridRows,
      height: renderGeometry.height,
      iconSize: props.iconSize,
      iconGesturePresentation: props.iconGesturePresentation,
      isEditMode: props.isEditMode,
      isBatchSelectionActive: props.isBatchSelectionActive,
      folderSourceGhostedId: props.folderSourceGhostedId,
      folderSourceGhostedIds: props.folderSourceGhostedIds,
      isFolderOpeningPreviewFrameGhosted: props.isFolderOpeningPreviewFrameGhosted,
      isHomeRevealSettling: props.isHomeRevealSettling,
      isIconOpening: props.isIconOpening,
      isSearchMode: props.isSearchMode,
      isTextlessMode: props.isTextlessMode,
      launchTargetStatusById: props.launchTargetStatusById,
      pageTrackScrub: props.pageTrackScrub,
      focusedIcon: props.focusedIcon,
      selectedAppIds: props.selectedAppIds,
      setPageRef: props.setPageRef,
      shouldSnapTrack: props.desktopTrackMotionKey.includes("snap"),
      snapDesktopLayout: options.snapDesktopLayout === true,
      showMissingLaunchTargetBadge: props.showMissingLaunchTargetBadge,
      stageRect: renderGeometry.stageRect,
      width: renderGeometry.width,
    });
    preloadIconTextures([
      ...(dragSnapshot.groupDragState?.entries || []).map((entry) => entry.item).filter(Boolean),
    ]);
    logFolderHandoffTimeline(metrics, folderClosingHandoffId);
  }
  updateMotionDebugOverlay();
  return true;
}

function applyImmediateFolderSourceGhosting() {
  if (!app || !layer || !hostRef.value) return false;
  layer.applyFolderSourceGhosting?.({
    folderSourceGhostedId: props.folderSourceGhostedId,
    folderSourceGhostedIds: props.folderSourceGhostedIds,
    isFolderOpeningPreviewFrameGhosted: props.isFolderOpeningPreviewFrameGhosted,
  }, { remember: false });
  layer.applyImmediateGroupReleaseSourceGhosting?.(props.groupDragState);
  app.render?.();
  return true;
}

function cancelScheduledRenderPixi() {
  renderScheduler?.cancel();
  resizeSettleScheduler?.reset?.();
  if (desktopFrameHandle != null) {
    window.cancelAnimationFrame?.(desktopFrameHandle);
    desktopFrameHandle = null;
  }
  desktopFrameLastTime = 0;
  desktopLayerUpdatePending = false;
  desktopResizeLayoutSnapPending = false;
}

function getRenderScheduler() {
  if (renderScheduler) return renderScheduler;
  const requestFrame = typeof window.requestAnimationFrame === "function"
    ? (callback) => window.requestAnimationFrame(callback)
    : null;
  const cancelFrame = typeof window.cancelAnimationFrame === "function"
    ? (frame) => window.cancelAnimationFrame(frame)
    : null;
  renderScheduler = createPixiRenderScheduler({
    cancelAnimationFrame: cancelFrame,
    canRender: () => Boolean(!destroyed && app && layer && hostRef.value),
    render: (reasons) => {
      const updateLayer = desktopLayerUpdatePending;
      desktopLayerUpdatePending = false;
      const snapDesktopLayout = desktopResizeLayoutSnapPending;
      const previousPlan = layer?.lastDesktopRenderPlan || null;
      const didRender = renderPixi({ snapDesktopLayout, updateLayer });
      if (didRender && updateLayer) desktopResizeLayoutSnapPending = false;
      if (!didRender && updateLayer) desktopLayerUpdatePending = true;
      let probeToken = null;
      if (import.meta.env.DEV && didRender) {
        probeToken = renderProbe?.beforeRender?.({
          dragMeta: props.dragMeta,
          reasons,
          renderer: app?.renderer,
          updateLayer,
        });
        if (updateLayer) {
          renderProbe?.recordDesktopPlan?.(previousPlan, layer?.lastDesktopRenderPlan || null);
        }
      }
      if (import.meta.env.DEV && didRender) {
        try {
          app?.render?.();
        } finally {
          renderProbe?.afterRender?.(probeToken);
        }
      } else {
        app?.render?.();
      }
    },
    requestAnimationFrame: requestFrame,
  });
  return renderScheduler;
}

function shouldRunDesktopFrameLoop() {
  return Boolean(
    !destroyed &&
    app &&
    layer &&
    hostRef.value &&
    (
      getRenderScheduler().hasPendingRender() ||
      resizeSettleScheduler?.hasPending?.() ||
      motionRuntime.hasActiveWork?.() ||
      shouldRunHandoffRenderLoop()
    )
  );
}

function runDesktopFrame(time) {
  desktopFrameHandle = null;
  if (!app || !layer || !hostRef.value || destroyed) {
    desktopFrameLastTime = 0;
    return;
  }

  const frameTime = Number.isFinite(Number(time)) ? Number(time) : nowMs();
  const deltaSeconds = desktopFrameLastTime
    ? Math.max(0, (frameTime - desktopFrameLastTime) / 1000)
    : 0;
  desktopFrameLastTime = frameTime;

  motionRuntime.step(deltaSeconds);
  const scheduler = getRenderScheduler();
  resizeSettleScheduler?.consumeFrame?.();
  if (desktopMotionFrameNeedsRender) {
    scheduler.markRenderPending("motion-frame");
    desktopMotionFrameNeedsRender = false;
  }
  scheduler.runPendingRender();
  if (shouldRunHandoffRenderLoop()) {
    desktopLayerUpdatePending = true;
    scheduler.markRenderPending("folder-handoff-loop");
  }

  if (typeof window.requestAnimationFrame === "function" && shouldRunDesktopFrameLoop()) {
    scheduleDesktopFrame();
  } else {
    desktopFrameLastTime = 0;
  }
}

function scheduleDesktopFrame() {
  if (desktopFrameHandle != null || destroyed || !app || !layer || !hostRef.value) return false;
  if (typeof window.requestAnimationFrame === "function") {
    desktopFrameHandle = window.requestAnimationFrame(runDesktopFrame);
    return true;
  }
  runDesktopFrame(nowMs());
  return true;
}

function requestRender(reason = "desktop-update", options = {}) {
  if (options.invalidateGeometry) invalidateDesktopDomGeometry();
  if (import.meta.env.DEV) {
    renderProbe?.record?.("render-request", {
      invalidateGeometry: options.invalidateGeometry === true,
      reason,
    });
  }
  desktopLayerUpdatePending = true;
  const didMark = getRenderScheduler().markRenderPending(reason);
  scheduleDesktopFrame();
  return didMark;
}

function shouldRunHandoffRenderLoop() {
  return Boolean(folderClosingHandoffRetainer.shouldRun({
    propFolderClosingHandoffId: props.folderClosingHandoffId,
    timelineDebug: hasFolderHandoffTimelineDebug(),
  }) && app && layer && hostRef.value && !destroyed);
}

function clearFolderTexturePrewarmTimer() {
  folderTexturePrewarmGeneration += 1;
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

function collectVisibleIconTextureItems() {
  const page = props.activePages?.[props.activePageIndex] || [];
  const visibleItems = props.getVisibleDesktopPage?.(page) || [];
  const items = [];
  for (const item of visibleItems) {
    if (!item) continue;
    if (item.type !== "folder") {
      items.push(item);
      continue;
    }
    items.push(...getFolderPreviewSlots(item, props.folderPageSize).filter(Boolean));
  }
  return items;
}

function scheduleFolderTexturePrewarm() {
  if (!app) return;
  clearFolderTexturePrewarmTimer();
  const generation = folderTexturePrewarmGeneration;
  void preloadIconTexturesAsync(collectVisibleIconTextureItems(), {
    timeoutMs: VISIBLE_ICON_TEXTURE_PRELOAD_TIMEOUT_MS,
  }).then(() => {
    if (destroyed || generation !== folderTexturePrewarmGeneration) return;
    folderTexturePrewarmTimer = window.setTimeout(() => {
      folderTexturePrewarmTimer = null;
      if (destroyed || generation !== folderTexturePrewarmGeneration) return;
      preloadIconTextures(collectFolderTexturePrewarmItems());
    }, 0);
  });
}

function handleIconAction(action, event, item, source) {
  if (action === "pointerdown") {
    if (import.meta.env.DEV) renderProbe?.notePointerDown?.({ event, item, source });
    emit("pointerdown-icon", event, item, source);
  }
  if (action === "remove") emit("remove-app", item.id);
  if (action === "choose-icon") emit("choose-app-icon", item.id);
  if (action === "reset-icon") emit("reset-app-icon", item.id);
  requestRender(makeIconActionRenderReason(action));
}

function requestContextMenuAtPointer(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  emit("context-menu-request", event);
}

function handleFolderInternalActivity(active, folderId = null) {
  emit("internal-activity", Boolean(active), folderId);
  requestRender(makeFolderInternalActivityRenderReason(active));
}

function handleSingleStageFolderGeometryChange(geometry) {
  singleStageFolderPanelGeometry.value = geometry || null;
}

function handleSingleStageFolderTitleFrameChange(frame) {
  singleStageFolderTitleFrame.value = frame || null;
}

function disposeDiagnosticHub(hub) {
  if (!hub || typeof hub.dispose !== "function") return;
  void Promise.resolve(hub.dispose()).then((result) => {
    if (result?.ok === false) {
      console.error("Diagnostic entry disposal was incomplete", result.error);
    }
  }).catch((error) => {
    console.error("Failed to dispose the diagnostic entry", error);
  });
}

function destroyPixi(options = {}) {
  const deep = options.deep !== false;
  destroyed = true;
  window.removeEventListener("resize", handleResize);
  window.removeEventListener(WINDOW_CHROME_STATE_CHANGE_EVENT, handleWindowChromeStateChange);
  resizeObserver?.disconnect();
  resizeObserver = null;
  const currentApp = app;
  const currentLayer = layer;
  const currentOverlay = motionDebugOverlay;
  app = null;
  layer = null;
  motionDebugOverlay = null;
  unsubscribeIconTextureLoadSettlements?.();
  unsubscribeIconTextureLoadSettlements = null;
  unsubscribeMotionRuntimeRenderSignal?.();
  unsubscribeMotionRuntimeRenderSignal = null;
  if (desktopMotionRuntimeSuspended) {
    motionRuntime.resumeAutoTicker?.();
    desktopMotionRuntimeSuspended = false;
  }
  desktopMotionFrameNeedsRender = false;
  desktopResizeLayoutSnapPending = false;
  resizeSettleScheduler?.reset?.();
  cancelScheduledRenderPixi();
  renderScheduler?.destroy();
  renderScheduler = null;
  invalidateDesktopDomGeometry();
  pixiResizeSignature = "";
  folderClosingHandoffRetainer.reset();
  if (import.meta.env.DEV) {
    diagnosticGlobalInstallation?.uninstall?.();
    diagnosticGlobalInstallation = null;
    disposeDiagnosticHub(diagnosticHub);
    diagnosticHub = null;
    renderProbe = null;
  }
  singleStageFolderPanelGeometry.value = null;
  singleStageFolderTitleFrame.value = null;
  clearFolderTexturePrewarmTimer();
  if (currentLayer) {
    currentApp?.stage?.removeChild(currentLayer);
    if (deep) currentLayer.destroy({ children: true });
  }
  if (currentOverlay) {
    currentApp?.stage?.removeChild(currentOverlay);
    if (deep) currentOverlay.destroy({ children: true });
  }
  if (deep) currentApp?.destroy(true);
  else currentApp?.stop?.();
  hostRef.value?.replaceChildren?.();
  props.iconBoundsRegistry.clearBounds("desktop");
  props.iconBoundsRegistry.clearBounds("search");
  if (deep) clearIconTextureCache();
}

onMounted(async () => {
  destroyed = false;
  if (props.domRefs?.desktopMainRef) props.domRefs.desktopMainRef.value = mainRef.value;
  const nextApp = await createPixiApp(hostRef.value, {
    autoStart: false,
    className: "pixi-launchpad-canvas",
  });
  if (destroyed) {
    nextApp.destroy(true);
    hostRef.value?.replaceChildren?.();
    return;
  }
  app = nextApp;
  motionRuntime.suspendAutoTicker?.();
  desktopMotionRuntimeSuspended = true;
  layer = new DesktopLayer({
    renderCopy: pixiRenderCopy.value,
    onClosingFolderPointerDown: (folderId) => {
      props.folderOverlayState?.commitOpenFolder?.(folderId);
      requestRender("folder-closing-pointerdown");
    },
    onFolderGeometryChange: handleSingleStageFolderGeometryChange,
    onFolderInternalActivityChange: handleFolderInternalActivity,
    onFolderRenderRequest: (reason) => requestRender(reason || "folder-overlay-render-request"),
    onFolderOutsidePointerDown: () => {
      props.folderOverlayState?.handleFolderOverlayPointerDown?.();
      requestRender("folder-outside-pointerdown");
    },
    onFolderPanelPointerDown: (event) => {
      props.folderOverlayState?.handleFolderPanelPointerDown?.(event);
      requestRender("folder-panel-pointerdown");
    },
    onFolderTitleFrameChange: handleSingleStageFolderTitleFrameChange,
    iconBoundsRegistry: props.iconBoundsRegistry,
    onIconAction: handleIconAction,
    onGroupReleaseComplete: (payload) => {
      emit("group-release-complete", payload);
    },
  });
  app.stage.addChild(layer);
  unsubscribeIconTextureLoadSettlements = subscribeIconTextureLoadSettlements(() => {
    if (!destroyed && app && layer) requestRender("icon-texture-ready");
  });
  unsubscribeMotionRuntimeRenderSignal = motionRuntime.onRenderSignal((
    activeAnimationCount,
    writesLastFrame,
    afterFrameFlushes,
    reason
  ) => {
    desktopMotionFrameNeedsRender = Boolean(
      Number(activeAnimationCount) > 0 ||
      Number(afterFrameFlushes) > 0 ||
      Number(writesLastFrame) > 0
    );
    if (reason && reason !== "frame") {
      getRenderScheduler().markRenderPending(`motion-${reason}`);
    }
    if (motionRuntime.hasActiveWork?.() || getRenderScheduler().hasPendingRender()) scheduleDesktopFrame();
  });
  if (import.meta.env.DEV) {
    const [
      { MotionDebugOverlayLayer },
      { createMotionRuntimeDebugAdapter },
      { capturePixiRenderSnapshot, createPixiRenderProbe },
      { createDiagnosticArtifactStore },
      { createDiagnosticHub },
      { installDiagnosticHubGlobal },
      { createMotionDiagnosticAdapter },
      { createRenderDiagnosticAdapter },
      { createSceneDiagnosticAdapter },
      { createBrowserLiveDesktopDebugSettingsStore },
      { createLiveDesktopDiagnosticsController },
      { createLiveDesktopDiagnosticAdapter },
    ] = await Promise.all([
      import("./animation/motionDebugOverlayLayer.js"),
      import("./animation/motionRuntimeDebugAdapter.dev.js"),
      import("./renderDebugProbe.dev.js"),
      import("../../diagnostics/diagnosticArtifactStore.js"),
      import("../../diagnostics/diagnosticHub.js"),
      import("../../diagnostics/diagnosticGlobal.js"),
      import("../../diagnostics/motionDiagnosticAdapter.js"),
      import("../../diagnostics/renderDiagnosticAdapter.js"),
      import("../../diagnostics/sceneDiagnosticAdapter.js"),
      import("../../diagnostics/liveDesktopDebugSettings.js"),
      import("../../diagnostics/liveDesktopDiagnosticsController.js"),
      import("../../diagnostics/liveDesktopDiagnosticAdapter.js"),
    ]);
    if (destroyed || !app || !layer) return;
    installMotionRuntimeDebugAdapterFactory(createMotionRuntimeDebugAdapter);
    motionDebugOverlay = new MotionDebugOverlayLayer();
    app.stage.addChild(motionDebugOverlay);
    renderProbe = createPixiRenderProbe({
      capture: (captureOptions) => capturePixiRenderSnapshot({
        ...captureOptions,
        app,
        getTextureCacheDebugSnapshot: getIconTextureCacheDebugSnapshot,
        layer,
      }),
    });
    renderProbe.attachCanvas(app.canvas);
    const diagnosticAdapters = [
      createMotionDiagnosticAdapter({
        getOverlaySnapshot: () => motionDebugOverlay?.debugSnapshot?.() || null,
        runtime: motionRuntime,
      }),
      createRenderDiagnosticAdapter({
        getFolderVisualSnapshot: () => layer?.getFolderVisualDebugSnapshot?.() || null,
        probe: renderProbe,
      }),
      createSceneDiagnosticAdapter(),
    ];
    if (props.liveDesktopDiagnosticsPort) {
      const liveDesktopController = createLiveDesktopDiagnosticsController({
        applyRuntime: (request) => props.liveDesktopDiagnosticsPort.applyRuntime(request),
        getRuntimeStatus: () => props.liveDesktopDiagnosticsPort.getRuntimeStatus(),
        refreshRuntime: () => props.liveDesktopDiagnosticsPort.refreshRuntime(),
        settingsStore: createBrowserLiveDesktopDebugSettingsStore(),
      });
      diagnosticAdapters.push(createLiveDesktopDiagnosticAdapter({
        controller: liveDesktopController,
      }));
    }
    diagnosticHub = createDiagnosticHub({
      adapters: diagnosticAdapters,
      artifactStore: createDiagnosticArtifactStore(),
    });
    diagnosticGlobalInstallation = installDiagnosticHubGlobal({ hub: diagnosticHub });
  }
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(hostRef.value);
  window.addEventListener("resize", handleResize);
  window.addEventListener(WINDOW_CHROME_STATE_CHANGE_EVENT, handleWindowChromeStateChange);
  await nextTick();
  if (destroyed || !app || !layer) return;
  refreshDesktopDomGeometry();
  requestRender("mount");
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
  () => props.desktopProjectionEpoch,
  () => requestRender("desktop-projection", { invalidateGeometry: true }),
  { flush: "post" }
);

watch(
  () => props.pageGridMeasureStyle,
  () => requestRender("page-grid-measure", { invalidateGeometry: true }),
  { flush: "post" }
);

watch(
  () => [props.folderSourceGhostedId, props.folderSourceGhostedIds],
  () => {
    // Source ghosting is the handoff boundary; do not wait for the next desktop frame.
    applyImmediateFolderSourceGhosting();
  },
  { flush: "sync" }
);

watch(
  () => [
    props.groupDragState?.phase,
    props.groupDragState?.releaseCreatedFolderId,
    props.groupDragState?.releasePlan?.key,
  ],
  () => {
    // Created-folder source ids are derived from the semantic group plan,
    // rather than the folder-only ghosting props above.
    applyImmediateFolderSourceGhosting();
  },
  { flush: "sync" }
);

watchEffect(() => {
  void props.activePageIndex;
  void props.activePages;
  void props.desktopVisualTransform;
  void props.desktopVisualAlpha;
  void props.launchpadVisualAlpha;
  void props.launchpadVisualTransform;
  void props.desktopGridDebugOptions;
  void props.desktopProjectionEpoch;
  void props.desktopTrackMotionKey;
  void props.dragFolderHoverState;
  void props.dragFolderTargetId;
  void props.dragHitDebugOptions;
  void props.dragHitDebugState;
  void props.dragMeta;
  void props.groupDragState;
  void props.folderClosingHandoffId;
  readFolderOverlayStateRenderDependencies(props.folderOverlayState);
  void props.gridCols;
  void props.gridRows;
  void props.iconSize;
  void props.iconGesturePresentation;
  void props.isEditMode;
  void props.isBatchSelectionActive;
  void props.isDesktopClosing;
  void props.folderSourceGhostedId;
  void props.folderSourceGhostedIds;
  void props.isHomeRevealSettling;
  void props.isSearchMode;
  void props.isTextlessMode;
  void props.launchTargetStatusById;
  void props.pageGridMeasureStyle;
  void props.pageTrackScrub;
  void props.folderPageSize;
  // Keyboard selection is a Pixi frame input; reading the descriptor here
  // makes each replacement invalidate the scene instead of hiding in a closure.
  void props.focusedIcon;
  void props.selectedAppIds;
  void props.singleStageDiagnosticsOptions;
  void pixiRenderCopy.value;
  requestRender("watch-effect");
  scheduleFolderTexturePrewarm();
});

onBeforeUnmount(destroyPixi);

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
