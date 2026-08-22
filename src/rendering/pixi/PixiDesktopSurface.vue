<template>
  <main
    ref="mainRef"
    class="desktop-main pixi-desktop-main pixi-desktop-main-root-stage"
    tabindex="-1"
    :style="viewportFrame.pageGridMeasureStyle"
    @focus="emitDesktopFocus"
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
        @pointerdown="emitSurfacePointerdown($event)"
        @wheel="emitWheel($event)"
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
          :class="{ 'is-closing': isSingleStageFolderClosing }"
          name="pixiSingleStageFolderName"
          :value="sceneRuntime.folderOverlayState.renderedFolder.value.name"
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
import { createPixiApp } from "./createPixiApp.js";
import { getTextRenderResolution } from "./geometry/stageCoordinates.js";
import { syncPixiTextResolution } from "./pixiText.js";
import { DesktopLayer } from "./scene/DesktopLayer.js";
import { mergeFolderIdSets } from "./scene/desktopHandoffState.js";
import {
  applyDesktopLayerFrameUpdates,
  makeDesktopDiagnosticsFrame,
  makeDesktopHandoffFrame,
  makeDesktopInteractionFrame,
  makeDesktopLayerFrameUpdates,
  makeDesktopStructureFrame,
  makeDesktopVisualFrame,
} from "./scene/desktopLayerFrames.js";
import { createFolderLayerState } from "./folderLayerState.js";
import { readFolderOverlayStateRenderDependencies } from "./folderOverlayStateDependencies.js";
import { createDragRenderSnapshot } from "./dragRenderSnapshot.js";
import { iconTextureRepository } from "./assets/iconTextureRepository.js";
import { createDesktopPresentationLoop } from "./desktopPresentationLoop.js";
import { createAppLaunchVisualCommitTracker } from "./appLaunchVisualCommit.js";
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
import { assertDesktopSceneFrame } from "../sceneFrame.js";
import { assertDesktopSceneRuntime } from "../sceneRuntime.js";
import {
  assertSceneEvent,
  makeAppLaunchCloseFrameCommittedEvent,
  makeChooseAppIconEvent,
  makeContextMenuRequestEvent,
  makeDesktopFocusEvent,
  makeGroupReleaseCompleteEvent,
  makeIconPointerdownEvent,
  makeInternalActivityEvent,
  makeRemoveAppEvent,
  makeResetAppIconEvent,
  makeSurfacePointerdownEvent,
  makeWheelEvent,
} from "../sceneEvents.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta as getDebugRectDelta,
  roundNumber as roundDebugNumber,
  roundRect as roundDebugRect,
} from "./scene/folderHandoffDebug.js";
import { getSingleStageDiagnosticsOptions } from "./scene/singleStagePlan.js";
import {
  isSingleStageFolderTitleFrameCurrent,
  makeSingleStageFolderNameInputStyle,
} from "./scene/singleStageFolderDomControls.js";
import { useLocalization } from "../../i18n/localization.js";
import { runtimePerformanceMetrics } from "../../diagnostics/runtimePerformanceMetrics.js";

const RESIZE_SETTLE_FRAMES = 3;
const WINDOW_CHROME_RESIZE_SETTLE_FRAMES = 12;

const props = defineProps({
  sceneFrame: { type: Object, required: true },
  sceneRuntime: { type: Object, required: true },
});
const sceneFrame = computed(() => {
  assertDesktopSceneFrame(props.sceneFrame);
  return props.sceneFrame;
});
const sceneRuntime = computed(() => {
  assertDesktopSceneRuntime(props.sceneRuntime);
  return props.sceneRuntime;
});
const viewportFrame = computed(() => sceneFrame.value.viewport);
const visualFrame = computed(() => sceneFrame.value.visual);
const interactionFrame = computed(() => sceneFrame.value.interaction);
const folderFrame = computed(() => sceneFrame.value.folder);
const diagnosticsFrame = computed(() => sceneFrame.value.diagnostics);
const localization = useLocalization();
const { t } = localization;
const pixiRenderCopy = computed(() => ({
  newFolderName: t("launchpad.newFolder"),
  searchEmpty: t("launchpad.search.empty"),
}));

const emitSceneEvent = defineEmits(["scene-event"]);
function publishSceneEvent(event) {
  emitSceneEvent("scene-event", assertSceneEvent(event));
}
function emitChooseAppIcon(itemId) { publishSceneEvent(makeChooseAppIconEvent(itemId)); }
function emitAppLaunchCloseFrameCommitted(sessionId) {
  publishSceneEvent(makeAppLaunchCloseFrameCommittedEvent(sessionId));
}
function emitContextMenuRequest(event) { publishSceneEvent(makeContextMenuRequestEvent(event)); }
function emitDesktopFocus() { publishSceneEvent(makeDesktopFocusEvent()); }
function emitGroupReleaseComplete(payload) { publishSceneEvent(makeGroupReleaseCompleteEvent(payload)); }
function emitIconPointerdown(event, item, source) { publishSceneEvent(makeIconPointerdownEvent(event, item, source)); }
function emitInternalActivity(active, folderId) { publishSceneEvent(makeInternalActivityEvent(active, folderId)); }
function emitRemoveApp(itemId) { publishSceneEvent(makeRemoveAppEvent(itemId)); }
function emitResetAppIcon(itemId) { publishSceneEvent(makeResetAppIconEvent(itemId)); }
function emitSurfacePointerdown(event) { publishSceneEvent(makeSurfacePointerdownEvent(event)); }
function emitWheel(event) { publishSceneEvent(makeWheelEvent(event)); }

function getResolvedSingleStageDiagnosticsOptions() {
  const options = diagnosticsFrame.value.singleStageDiagnosticsOptions;
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
let app = null;
let layer = null;
let resizeObserver = null;
let destroyed = false;
let presentationLoop = null;
let appLaunchVisualCommitTracker = null;
let renderProbe = null;
let diagnosticHub = null;
let diagnosticGlobalInstallation = null;
let desktopDomGeometryCache = null;
let pixiResizeSignature = "";
let pixiTextResolution = null;
let motionDebugOverlay = null;
let iconTextureSyncGeneration = 0;
const folderClosingHandoffRetainer = createFolderClosingHandoffRetainer();
let handoffDebugSequence = 0;

const isSingleStageFolderGhostTransitionActive = computed(() => Boolean(
  sceneRuntime.value.folderOverlayState?.isFolderOpenIconAnimationActive?.value ||
  sceneRuntime.value.folderOverlayState?.isFolderCloseIconAnimationActive?.value
));

const isSingleStageFolderZoomFadeClosing = computed(() => Boolean(
  sceneRuntime.value.folderOverlayState?.isFolderZoomFadeClosing?.value
));

const isSingleStageFolderClosing = computed(() => Boolean(
  sceneRuntime.value.folderOverlayState?.isFolderClosing?.value ||
  sceneRuntime.value.folderOverlayState?.isFolderAppLaunchClosing?.value ||
  isSingleStageFolderZoomFadeClosing.value
));

const shouldRenderSingleStageFolderDomControls = computed(() => Boolean(
  sceneRuntime.value.folderOverlayState?.renderedFolder?.value
));

const isSingleStageFolderInputDisabled = computed(() => Boolean(
  isSingleStageFolderClosing.value ||
  isSingleStageFolderGhostTransitionActive.value
));

const isSingleStageFolderPageDotsBlocked = computed(() => Boolean(
  isSingleStageFolderClosing.value ||
  sceneRuntime.value.folderOverlayState?.isFolderOpenFrameGhostPending?.value
));

const isSingleStageDragPreviewActive = computed(() => Boolean(
  interactionFrame.value.groupDragState?.key
));

const singleStageFolderNameInputStyle = computed(() => {
  const folderId = sceneRuntime.value.folderOverlayState?.renderedFolder?.value?.id ?? null;
  const frame = isSingleStageFolderTitleFrameCurrent(singleStageFolderTitleFrame.value, folderId)
    ? singleStageFolderTitleFrame.value
    : null;
  return makeSingleStageFolderNameInputStyle({
    controlsVisible: shouldRenderSingleStageFolderDomControls.value,
    frame,
    isClosing: isSingleStageFolderClosing.value,
    isInputDisabled: isSingleStageFolderInputDisabled.value,
  });
});

function shouldShowSingleStageFolderPageDots() {
  const state = sceneRuntime.value.folderOverlayState;
  return Boolean(
    shouldRenderSingleStageFolderDomControls.value &&
    state?.renderedFolder?.value &&
    state.folderPages?.value?.length > 1 &&
    !isSingleStageFolderPageDotsBlocked.value
  );
}

function handleSingleStageFolderNameInput(event) {
  const state = sceneRuntime.value.folderOverlayState;
  const folder = state?.renderedFolder?.value;
  if (!folder) return;
  const nextName = String(event?.target?.value || "").slice(0, 32);
  if (!nextName) return;
  state.renameFolder(folder.id, nextName);
}

function restoreSingleStageEmptyFolderName(event) {
  const state = sceneRuntime.value.folderOverlayState;
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
  () => sceneRuntime.value.folderOverlayState?.renderedFolder?.value?.id ?? null,
  () => {
    singleStageFolderTitleFrame.value = null;
  },
  { flush: "sync" }
);

watch(
  [
    () => sceneRuntime.value.folderOverlayState?.folderRenameRequest?.value?.token ?? null,
    () => sceneRuntime.value.folderOverlayState?.openFolderId?.value ?? null,
    () => sceneRuntime.value.folderOverlayState?.renderedFolder?.value?.id ?? null,
    () => isSingleStageFolderInputDisabled.value,
  ],
  async ([token, openFolderId, renderedFolderId, inputDisabled]) => {
    const request = sceneRuntime.value.folderOverlayState?.folderRenameRequest?.value;
    if (!token || !request) return;
    if (request.folderId !== openFolderId) {
      sceneRuntime.value.folderOverlayState?.completeFolderRenameRequest?.(token);
      return;
    }
    if (inputDisabled || request.folderId !== renderedFolderId) return;
    // Reuse the existing title editor after the opening handoff releases it.
    await nextTick();
    if (sceneRuntime.value.folderOverlayState?.folderRenameRequest?.value?.token !== token) return;
    const input = folderNameInputRef.value;
    if (!input || input.disabled) return;
    input.focus({ preventScroll: true });
    input.select();
    sceneRuntime.value.folderOverlayState?.completeFolderRenameRequest?.(token);
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

function syncPixiTextResolutionIfNeeded() {
  if (!app?.stage) return 0;
  const resolution = getTextRenderResolution();
  if (pixiTextResolution === resolution) return 0;
  pixiTextResolution = resolution;
  return syncPixiTextResolution(app.stage, resolution);
}

function requestResizeSettle(reason = "resize", frameCount = RESIZE_SETTLE_FRAMES) {
  if (destroyed || !presentationLoop) return false;
  presentationLoop.requestResizeSettle({ frames: frameCount, reason });
  return true;
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
  const resolvedRootRect = rootRect || getElementRect(sceneRuntime.value.domRefs?.rootRef) || {
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
  const result = folderClosingHandoffRetainer.resolve(metrics, folderFrame.value.folderClosingHandoffId, {
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
  const source = sceneRuntime.value.folderOverlayState;
  if (!source) return null;
  const sourceFolder = source.renderedFolder?.value;
  const isFolderClosing = Boolean(
    source.isFolderClosing?.value ||
    source.isFolderZoomFadeClosingFromFolderClose?.value
  );
  const projectedFolder = sourceFolder?.id && !isFolderClosing
    ? dragSnapshot.groupDragState?.projectedPages
      ?.flatMap((page) => page || [])
      .find((item) => item?.type === "folder" && item.id === sourceFolder.id) || null
    : null;
  const renderedFolder = projectedFolder || sourceFolder;
  const folderPages = projectedFolder
    ? (
      Array.isArray(projectedFolder.childPages)
        ? projectedFolder.childPages
        : []
    )
    : source.folderPages?.value;
  return createFolderLayerState({
    callbacks: {
      acceptFolderOpenIconGhostSession: source.acceptFolderOpenIconGhostSession,
      completeFolderCloseIconGhost: source.completeFolderCloseIconGhost,
      completeFolderOpenFrameGhost: source.completeFolderOpenFrameGhost,
      completeFolderOpenIconGhost: source.completeFolderOpenIconGhost,
      getFolderPageRenderMode: source.getFolderPageRenderMode,
      getVisibleFolderPage: source.getVisibleFolderPage,
      isIconOpening: source.isIconOpening,
      setFolderPageRef: source.setFolderPageRef,
    },
    drag: {
      groupDragState: dragSnapshot.groupDragState,
      meta: dragSnapshot.dragMeta,
    },
    folder: {
      closeIconGhosts: source.folderCloseIconGhosts?.value,
      desktopClosing: interactionFrame.value.isDesktopClosing,
      gridStyle: source.folderGridStyle?.value,
      isAppLaunchClosing: source.isFolderAppLaunchClosing?.value,
      isClosing: isFolderClosing,
      isZoomFadeClosing: source.isFolderZoomFadeClosing?.value,
      zoomFadeCloseReason: source.folderZoomFadeCloseReason?.value,
      openingOriginBounds: source.folderOpeningOriginBounds?.value,
      openingCancelRequest: source.folderOpeningCancelRequest?.value,
      openProgress: source.folderOpenProgress?.value,
      openProgressTarget: source.folderOpenProgressTarget?.value,
      openIconGhosts: source.folderOpenIconGhosts?.value,
      openIconGhostSession: source.folderOpenIconGhostSession?.value,
      pageIndex: source.folderPageIndex?.value,
      pageIndexCommit: source.commitFolderPageIndex,
      pageTurnToken: source.folderPageTurnRequest?.value?.token ?? null,
      pageTrackScrub: resolveMaybeRef(source.folderPageTrackScrub) || null,
      pageDotsVisible: shouldShowSingleStageFolderPageDots(),
      pageSize: source.folderPageSize?.value || viewportFrame.value.folderPageSize,
      pages: folderPages,
      panelRef: source.folderPanelRef,
      panelStyle: source.folderPanelStyle?.value,
      renderedFolder,
      viewportRef: source.folderViewportRef,
      visualPageIndex: source.visualFolderPageIndex?.value ?? source.folderPageIndex?.value,
    },
    geometry: {
      canvasStageRect: metrics.rect,
      desktopFrame: renderGeometry.desktopFrame,
      desktopStageRect: renderGeometry.desktopStageRect,
      singleStageDiagnostics: diagnosticsOptions.diagnostics === true,
    },
    stage: { rect: renderGeometry.stageRect },
    ui: {
      iconGesturePresentation: interactionFrame.value.iconGesturePresentation,
      isEditMode: source.isEditMode?.value,
      isBatchSelectionActive: interactionFrame.value.isBatchSelectionActive,
      isTextlessMode: source.isTextlessMode?.value,
      launchTargetStatusById: source.launchTargetStatusById?.value,
      focusedIcon: interactionFrame.value.focusedIcon,
      selectedAppIds: interactionFrame.value.selectedAppIds,
      showMissingLaunchTargetBadge: source.showMissingLaunchTargetBadge?.value,
    },
  });
}

function makeDesktopRenderGeometryFromDom(metrics) {
  const rootRect = getElementRect(sceneRuntime.value.domRefs?.rootRef) || {
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
    shellRect: getElementRect(sceneRuntime.value.domRefs?.shellRef),
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
    isHomeRevealSettling: interactionFrame.value.isHomeRevealSettling,
    layoutRect: roundDebugRect(metrics.layoutRect),
    now: roundDebugNumber(nowMs()),
    phase: decision.phase,
    postReleaseFramesRemaining: folderClosingHandoffRetainer.postReleaseFrames,
    propsFolderClosingHandoffId: folderFrame.value.folderClosingHandoffId,
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

function makeDesktopLayerFrameBuilders(metrics, renderGeometry, options = {}) {
  let dragSnapshot = null;
  let folderClosingHandoffId = null;
  let folderHandoffResolved = false;
  let handoffSnapshot = null;
  let singleStageDiagnosticsOptions = null;
  let singleStageDiagnosticsResolved = false;
  let singleStageFolderState = null;
  let singleStageFolderStateResolved = false;

  function getDragSnapshot() {
    if (!dragSnapshot) {
      // Nested controller refs can update before Vue flushes the matching props.
      // Capture drag ownership once so real icons and the preview cannot disagree
      // about the same release during this Pixi frame.
      dragSnapshot = createDragRenderSnapshot(interactionFrame.value);
    }
    return dragSnapshot;
  }

  function getFolderClosingHandoffId() {
    if (!folderHandoffResolved) {
      folderClosingHandoffId = resolveFolderClosingHandoffId(metrics);
      folderHandoffResolved = true;
    }
    return folderClosingHandoffId;
  }

  function getSingleStageDiagnosticsOptions() {
    if (!singleStageDiagnosticsResolved) {
      singleStageDiagnosticsOptions = getResolvedSingleStageDiagnosticsOptions();
      singleStageDiagnosticsResolved = true;
    }
    return singleStageDiagnosticsOptions;
  }

  function getSingleStageFolderState() {
    if (!singleStageFolderStateResolved) {
      singleStageFolderState = createSingleStageFolderState(
        metrics,
        getDragSnapshot(),
        getSingleStageDiagnosticsOptions(),
        renderGeometry
      );
      singleStageFolderStateResolved = true;
    }
    return singleStageFolderState;
  }

  function getHandoffSnapshot() {
    if (handoffSnapshot) return handoffSnapshot;
    const closingFolderId = getFolderClosingHandoffId();
    const sourceFolderId = folderFrame.value.folderSourceGhostedId;
    handoffSnapshot = Object.freeze({
      folderClosingHandoffIds: mergeFolderIdSets(
        closingFolderId ? [closingFolderId] : null
      ),
      folderSourceGhostedIds: mergeFolderIdSets(
        folderFrame.value.folderSourceGhostedIds,
        sourceFolderId ? [sourceFolderId] : null
      ),
      isFolderOpeningPreviewFrameGhosted: sceneRuntime.value.isFolderOpeningPreviewFrameGhosted,
    });
    return handoffSnapshot;
  }

  return {
    builders: {
      diagnostics: () => makeDesktopDiagnosticsFrame({
        dragHitDebugOptions: diagnosticsFrame.value.dragHitDebugOptions,
        dragHitDebugState: diagnosticsFrame.value.dragHitDebugState,
        singleStageDiagnosticsEnabled: getSingleStageDiagnosticsOptions(),
        singleStageFolderState: getSingleStageFolderState(),
        stageRect: renderGeometry.stageRect,
      }),
      handoff: () => makeDesktopHandoffFrame(getHandoffSnapshot()),
      interaction: () => makeDesktopInteractionFrame({
        deviceResolution: app.renderer?.resolution || 1,
        dragFolderHoverState: interactionFrame.value.dragFolderHoverState,
        ...getHandoffSnapshot(),
        folderPageSize: viewportFrame.value.folderPageSize,
        gridCols: viewportFrame.value.gridCols,
        gridRows: viewportFrame.value.gridRows,
        groupDragState: getDragSnapshot().groupDragState,
        height: renderGeometry.height,
        iconSize: viewportFrame.value.iconSize,
        isBatchSelectionActive: interactionFrame.value.isBatchSelectionActive,
        isTextlessMode: interactionFrame.value.isTextlessMode,
        launchTargetStatusById: diagnosticsFrame.value.launchTargetStatusById,
        provisionalFolderRollback: interactionFrame.value.provisionalFolderRollback,
        showMissingLaunchTargetBadge: diagnosticsFrame.value.showMissingLaunchTargetBadge,
        singleStageFolderState: getSingleStageFolderState(),
        stageRect: renderGeometry.stageRect,
        width: renderGeometry.width,
      }),
      structure: () => {
        const currentDragSnapshot = getDragSnapshot();
        return makeDesktopStructureFrame({
          activePageIndex: viewportFrame.value.activePageIndex,
          activePages: viewportFrame.value.activePages,
          desktopFrame: renderGeometry.desktopFrame,
          desktopGridDebugOptions: diagnosticsFrame.value.desktopGridDebugOptions,
          desktopTrackMotionKey: viewportFrame.value.desktopTrackMotionKey,
          desktopVisualAlpha: visualFrame.value.desktopVisualAlpha,
          desktopVisualTransform: visualFrame.value.desktopVisualTransform,
          deviceResolution: app.renderer?.resolution || 1,
          dragFolderHoverState: interactionFrame.value.dragFolderHoverState,
          dragFolderTargetId: interactionFrame.value.dragFolderTargetId,
          dragHitDebugOptions: diagnosticsFrame.value.dragHitDebugOptions,
          dragHitDebugState: diagnosticsFrame.value.dragHitDebugState,
          dragMeta: currentDragSnapshot.dragMeta,
          focusedIcon: interactionFrame.value.focusedIcon,
          ...getHandoffSnapshot(),
          folderPageSize: viewportFrame.value.folderPageSize,
          getDesktopPageRenderMode: sceneRuntime.value.getDesktopPageRenderMode,
          getVisibleDesktopPage: sceneRuntime.value.getVisibleDesktopPage,
          gridCols: viewportFrame.value.gridCols,
          gridRows: viewportFrame.value.gridRows,
          groupDragState: currentDragSnapshot.groupDragState,
          height: renderGeometry.height,
          iconGesturePresentation: interactionFrame.value.iconGesturePresentation,
          iconSize: viewportFrame.value.iconSize,
          isBatchSelectionActive: interactionFrame.value.isBatchSelectionActive,
          isEditMode: interactionFrame.value.isEditMode,
          isHomeRevealSettling: interactionFrame.value.isHomeRevealSettling,
          isIconOpening: sceneRuntime.value.isIconOpening,
          isSearchMode: interactionFrame.value.isSearchMode,
          isTextlessMode: interactionFrame.value.isTextlessMode,
          launchTargetStatusById: diagnosticsFrame.value.launchTargetStatusById,
          launchpadVisualAlpha: visualFrame.value.launchpadVisualAlpha,
          launchpadVisualTransform: visualFrame.value.launchpadVisualTransform,
          pageTrackScrub: viewportFrame.value.pageTrackScrub,
          provisionalFolderRollback: interactionFrame.value.provisionalFolderRollback,
          selectedAppIds: interactionFrame.value.selectedAppIds,
          setPageRef: sceneRuntime.value.setPageRef,
          shouldSnapTrack: viewportFrame.value.desktopTrackMotionKey.includes("snap"),
          showMissingLaunchTargetBadge: diagnosticsFrame.value.showMissingLaunchTargetBadge,
          singleStageDiagnosticsEnabled: getSingleStageDiagnosticsOptions(),
          singleStageFolderState: getSingleStageFolderState(),
          snapDesktopLayout: options.snapDesktopLayout === true,
          stageRect: renderGeometry.stageRect,
          width: renderGeometry.width,
        });
      },
      visual: () => makeDesktopVisualFrame({
        desktopVisualAlpha: visualFrame.value.desktopVisualAlpha,
        desktopVisualTransform: visualFrame.value.desktopVisualTransform,
        height: renderGeometry.height,
        isFolderOverlayActive: Boolean(sceneRuntime.value.folderOverlayState?.renderedFolder?.value),
        launchpadVisualAlpha: visualFrame.value.launchpadVisualAlpha,
        launchpadVisualTransform: visualFrame.value.launchpadVisualTransform,
        snapDesktopLayout: options.snapDesktopLayout === true,
        stageRect: renderGeometry.stageRect,
        width: renderGeometry.width,
      }),
    },
    get resolvedFolderClosingHandoffId() {
      return folderHandoffResolved ? folderClosingHandoffId : null;
    },
    get wasFolderHandoffResolved() {
      return folderHandoffResolved;
    },
  };
}

function captureAppLaunchVisualSnapshot() {
  return {
    desktopAlpha: Number(layer?.visualRoot?.alpha),
    desktopScale: Number(layer?.visualRoot?.scale?.x),
    folderAlpha: Number(layer?.singleStageFolderLayer?.alpha),
    folderScale: Number(layer?.singleStageFolderLayer?.scale?.x),
  };
}

function captureAppLaunchVisualScope() {
  return sceneRuntime.value.folderOverlayState?.renderedFolder?.value ? "folder" : "desktop";
}

function getAppLaunchVisualCommitTracker() {
  if (appLaunchVisualCommitTracker) return appLaunchVisualCommitTracker;
  appLaunchVisualCommitTracker = createAppLaunchVisualCommitTracker({
    cancelAnimationFrame: (frame) => window.cancelAnimationFrame(frame),
    getCurrentSessionId: () => visualFrame.value.appLaunchCloseSessionId ?? null,
    onCommit: emitAppLaunchCloseFrameCommitted,
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  });
  return appLaunchVisualCommitTracker;
}

function captureAppLaunchCloseTarget() {
  return {
    desktopAlpha: Number(visualFrame.value.desktopVisualAlpha),
    desktopScale: Number(visualFrame.value.desktopVisualTransform?.scale),
    folderAlpha: Number(visualFrame.value.launchpadVisualAlpha),
    folderScale: Number(visualFrame.value.launchpadVisualTransform?.scale),
  };
}

function renderPixi(options = {}) {
  if (!app || !layer || !hostRef.value) {
    return { didRender: false, hasLayerCapability: false, work: null };
  }
  syncPixiTextResolutionIfNeeded();
  const invalidation = options.invalidation || { requiresStructureUpdate: true };
  const hasLayerCapability = invalidation.requiresStructureUpdate ||
    invalidation.requiresInteractionUpdate ||
    invalidation.requiresVisualUpdate ||
    invalidation.requiresDiagnosticsUpdate ||
    invalidation.requiresHandoffUpdate;
  let work = null;
  if (hasLayerCapability) {
    const domGeometry = getDesktopDomGeometry();
    if (!domGeometry) return { didRender: false, hasLayerCapability, work };
    const { metrics, renderGeometry } = domGeometry;
    const frameContext = makeDesktopLayerFrameBuilders(metrics, renderGeometry, options);
    const updates = makeDesktopLayerFrameUpdates(invalidation, frameContext.builders);
    layer.setRenderCopy(pixiRenderCopy.value);
    work = applyDesktopLayerFrameUpdates(layer, updates);
    if (frameContext.wasFolderHandoffResolved) {
      logFolderHandoffTimeline(metrics, frameContext.resolvedFolderClosingHandoffId);
    }
  }
  updateMotionDebugOverlay();
  return { didRender: true, hasLayerCapability, work };
}

function applyImmediateFolderSourceGhosting() {
  if (!app || !layer || !hostRef.value) return false;
  layer.applyImmediateGroupTransferOwnership?.(interactionFrame.value.groupDragState);
  const sourceFolderId = folderFrame.value.folderSourceGhostedId;
  layer.applyFolderSourceGhosting?.({
    folderClosingHandoffIds: new Set(),
    folderSourceGhostedIds: mergeFolderIdSets(
      folderFrame.value.folderSourceGhostedIds,
      sourceFolderId ? [sourceFolderId] : null
    ),
    isFolderOpeningPreviewFrameGhosted: sceneRuntime.value.isFolderOpeningPreviewFrameGhosted,
    singleStageFolderState: null,
  }, { remember: false });
  requestRender("interaction-ownership");
  return true;
}

function commitDesktopPresentationFrame({
  frameIntervalMs,
  invalidation,
  mode,
  reasons,
  snapDesktopLayout,
}) {
  const frameStartedAt = nowMs();
  const appLaunchCloseSessionId = visualFrame.value.appLaunchCloseSessionId ?? null;
  const appLaunchCommitTracker = getAppLaunchVisualCommitTracker();
  appLaunchCommitTracker.beforeRender({
    scope: captureAppLaunchVisualScope(),
    sessionId: appLaunchCloseSessionId,
    snapshot: captureAppLaunchVisualSnapshot(),
    target: captureAppLaunchCloseTarget(),
  });
  const previousPlan = layer?.lastDesktopRenderPlan || null;
  const layerStartedAt = nowMs();
  const result = renderPixi({ invalidation, snapDesktopLayout });
  const layerMs = nowMs() - layerStartedAt;
  let probeToken = null;
  if (import.meta.env.DEV && result.didRender) {
    probeToken = renderProbe?.beforeRender?.({
      dragMeta: interactionFrame.value.dragMeta,
      invalidation,
      reasons,
      renderer: app?.renderer,
      hasLayerCapability: result.hasLayerCapability,
    });
    if (result.work?.fullPlanBuilds) {
      renderProbe?.recordDesktopPlan?.(previousPlan, layer?.lastDesktopRenderPlan || null);
    }
  }
  const gpuStartedAt = nowMs();
  try {
    app?.render?.();
    runtimePerformanceMetrics.markOnce("scene.first-ready");
    if (result.didRender) {
      appLaunchCommitTracker.afterRender({
        sessionId: appLaunchCloseSessionId,
        snapshot: captureAppLaunchVisualSnapshot(),
      });
    }
  } finally {
    const gpuMs = nowMs() - gpuStartedAt;
    const totalMs = nowMs() - frameStartedAt;
    runtimePerformanceMetrics.record("render.frame.gpu", gpuMs);
    runtimePerformanceMetrics.record("render.frame.layer", layerMs);
    runtimePerformanceMetrics.record("render.frame.total", totalMs);
    if (mode === "animation-frame" && frameIntervalMs > 0) {
      runtimePerformanceMetrics.record("render.frame.interval", frameIntervalMs);
    }
    if (import.meta.env.DEV && result.didRender) {
      renderProbe?.afterRender?.(probeToken);
      renderProbe?.recordFrameWork?.({
        counts: {
          ...result.work,
          beforeCompositeCommits: mode === "before-composite" ? 1 : 0,
          gpuRenders: 1,
        },
        invalidation,
        reasons,
        timings: {
          frameIntervalMs,
          gpuMs,
          layerMs,
          totalMs,
        },
      });
    }
  }
}

function requestRender(reason = "desktop-update", options = {}) {
  if (options.invalidateGeometry) invalidateDesktopDomGeometry();
  if (import.meta.env.DEV) {
    renderProbe?.record?.("render-request", {
      invalidateGeometry: options.invalidateGeometry === true,
      reason,
    });
  }
  if (!presentationLoop) return false;
  presentationLoop.invalidate({
    invalidateGeometry: options.invalidateGeometry === true,
    reason,
  });
  return true;
}

function shouldRunHandoffRenderLoop() {
  return Boolean(folderClosingHandoffRetainer.shouldRun({
    propFolderClosingHandoffId: folderFrame.value.folderClosingHandoffId,
    timelineDebug: hasFolderHandoffTimelineDebug(),
  }) && app && layer && hostRef.value && !destroyed);
}

function handleIconAction(action, event, item, source) {
  if (action === "pointerdown") {
    if (import.meta.env.DEV) renderProbe?.notePointerDown?.({ event, item, source });
    emitIconPointerdown(event, item, source);
  }
  if (action === "remove") emitRemoveApp(item.id);
  if (action === "choose-icon") emitChooseAppIcon(item.id);
  if (action === "reset-icon") emitResetAppIcon(item.id);
  requestRender(`icon-${action || "action"}`);
}

function requestContextMenuAtPointer(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  emitContextMenuRequest(event);
}

function handleFolderInternalActivity(active, folderId = null) {
  emitInternalActivity(Boolean(active), folderId);
  requestRender(active ? "folder-internal-active" : "folder-internal-idle");
}

function handleSingleStageFolderGeometryChange(geometry) {
  singleStageFolderPanelGeometry.value = geometry || null;
}

function handleSingleStageFolderTitleFrameChange(frame) {
  const folderId = sceneRuntime.value.folderOverlayState?.renderedFolder?.value?.id ?? null;
  singleStageFolderTitleFrame.value = isSingleStageFolderTitleFrameCurrent(frame, folderId)
    ? frame
    : null;
}

async function synchronizeActiveIconTextures(options = {}) {
  const generation = ++iconTextureSyncGeneration;
  try {
    const snapshot = await runtimePerformanceMetrics.measureAsync(
      "texture.synchronize",
      () => iconTextureRepository.synchronize(sceneRuntime.value.getIconTextureItems())
    );
    runtimePerformanceMetrics.markOnce("texture.first-ready");
    if (
      options.renderOnComplete !== false &&
      generation === iconTextureSyncGeneration &&
      !destroyed
    ) requestRender("asset-icon-textures-synchronized");
    return snapshot;
  } catch (error) {
    console.error("Failed to synchronize active icon textures", error);
    throw error;
  }
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
  iconTextureSyncGeneration += 1;
  window.removeEventListener("resize", handleResize);
  window.removeEventListener(WINDOW_CHROME_STATE_CHANGE_EVENT, handleWindowChromeStateChange);
  resizeObserver?.disconnect();
  resizeObserver = null;
  presentationLoop?.dispose();
  presentationLoop = null;
  const currentApp = app;
  const currentLayer = layer;
  const currentOverlay = motionDebugOverlay;
  app = null;
  layer = null;
  motionDebugOverlay = null;
  appLaunchVisualCommitTracker?.destroy();
  appLaunchVisualCommitTracker = null;
  invalidateDesktopDomGeometry();
  pixiResizeSignature = "";
  pixiTextResolution = null;
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
  sceneRuntime.value.iconBoundsRegistry.clearBounds("desktop");
  sceneRuntime.value.iconBoundsRegistry.clearBounds("search");
  if (deep) iconTextureRepository.dispose();
}

onMounted(async () => {
  destroyed = false;
  if (sceneRuntime.value.domRefs?.desktopMainRef) sceneRuntime.value.domRefs.desktopMainRef.value = mainRef.value;
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
  layer = new DesktopLayer({
    renderCopy: pixiRenderCopy.value,
    onClosingFolderPointerDown: (folderId) => {
      sceneRuntime.value.folderOverlayState?.commitOpenFolder?.(folderId);
      requestRender("folder-closing-pointerdown");
    },
    onFolderGeometryChange: handleSingleStageFolderGeometryChange,
    onFolderInternalActivityChange: handleFolderInternalActivity,
    onFolderRenderRequest: (reason) => requestRender(reason || "folder-overlay-render-request"),
    onFolderOutsidePointerDown: () => {
      sceneRuntime.value.folderOverlayState?.handleFolderOverlayPointerDown?.();
      requestRender("folder-outside-pointerdown");
    },
    onFolderPanelPointerDown: (event) => {
      sceneRuntime.value.folderOverlayState?.handleFolderPanelPointerDown?.(event);
      requestRender("folder-panel-pointerdown");
    },
    onFolderTitleFrameChange: handleSingleStageFolderTitleFrameChange,
    iconBoundsRegistry: sceneRuntime.value.iconBoundsRegistry,
    onIconAction: handleIconAction,
    onGroupReleaseComplete: (payload) => {
      emitGroupReleaseComplete(payload);
    },
    onProvisionalFolderRollbackComplete: (payload) => {
      const completed = sceneRuntime.value.completeProvisionalFolderRollback(payload?.token);
      if (completed !== true) {
        throw new Error(`Rejected provisional folder rollback completion ${payload?.token}`);
      }
    },
  });
  app.stage.addChild(layer);
  const requestAnimationFrame = window.requestAnimationFrame?.bind(window);
  const cancelAnimationFrame = window.cancelAnimationFrame?.bind(window);
  presentationLoop = createDesktopPresentationLoop({
    canPresent: () => Boolean(!destroyed && app && layer && hostRef.value),
    commit: commitDesktopPresentationFrame,
    frameClock: {
      cancel: cancelAnimationFrame,
      now: nowMs,
      request: requestAnimationFrame,
    },
    motionRuntime,
    onResizeSettleFrame: () => {
      invalidateDesktopDomGeometry();
      refreshDesktopDomGeometry();
    },
    shouldRunHandoffFrame: shouldRunHandoffRenderLoop,
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
        getTextureCacheDebugSnapshot: iconTextureRepository.snapshot,
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
        getPerformanceSnapshot: () => ({
          ...runtimePerformanceMetrics.snapshot(),
          textures: iconTextureRepository.snapshot(),
        }),
        probe: renderProbe,
      }),
      createSceneDiagnosticAdapter(),
    ];
    if (sceneRuntime.value.liveDesktopDiagnosticsPort) {
      const liveDesktopController = createLiveDesktopDiagnosticsController({
        applyRuntime: (request) => sceneRuntime.value.liveDesktopDiagnosticsPort.applyRuntime(request),
        getRuntimeStatus: () => sceneRuntime.value.liveDesktopDiagnosticsPort.getRuntimeStatus(),
        refreshRuntime: () => sceneRuntime.value.liveDesktopDiagnosticsPort.refreshRuntime(),
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
  await synchronizeActiveIconTextures({ renderOnComplete: false });
  if (destroyed || !app || !layer) return;
  refreshDesktopDomGeometry();
  requestRender("mount");
});

watch(
  () => isSingleStageFolderClosing.value,
  (isClosing, wasClosing) => {
    if (!isClosing || wasClosing) return;
    // A close commit changes the canvas ownership before Vue's next RAF.
    // Flush that structural handoff in the post-flush microtask so the
    // browser never composites the previous fully-open folder frame.
    const committed = presentationLoop?.flushBeforeComposite({ reason: "folder-close-commit" }) ?? false;
    if (!committed && !destroyed && app && layer && hostRef.value) {
      throw new Error("Folder close could not commit before browser composition");
    }
  }
);

watch(
  () => viewportFrame.value.desktopProjectionEpoch,
  () => requestRender("desktop-projection", { invalidateGeometry: true }),
  { flush: "post" }
);

watch(
  () => viewportFrame.value.pageGridMeasureStyle,
  () => requestRender("page-grid-measure", { invalidateGeometry: true }),
  { flush: "post" }
);

watch(
  () => [folderFrame.value.folderSourceGhostedId, folderFrame.value.folderSourceGhostedIds],
  () => {
    // Source ghosting is the handoff boundary; do not wait for the next desktop frame.
    applyImmediateFolderSourceGhosting();
  },
  { flush: "sync" }
);

watch(
  () => [
    interactionFrame.value.groupDragState?.phase,
    interactionFrame.value.groupDragState?.presentationPlan,
    interactionFrame.value.groupDragState?.runtimePlan?.key,
  ],
  () => {
    // Transfer ownership is acquired synchronously before the next desktop
    // plan can reveal committed live nodes.
    applyImmediateFolderSourceGhosting();
  },
  { flush: "sync" }
);

watchEffect(() => {
  void viewportFrame.value.activePageIndex;
  void viewportFrame.value.activePages;
  void viewportFrame.value.desktopTrackMotionKey;
  void viewportFrame.value.gridCols;
  void viewportFrame.value.gridRows;
  void viewportFrame.value.iconSize;
  void viewportFrame.value.folderPageSize;
  void viewportFrame.value.pageTrackScrub;
  void folderFrame.value.folderClosingHandoffId;
  void interactionFrame.value.isDesktopClosing;
  void interactionFrame.value.isHomeRevealSettling;
  void interactionFrame.value.dragFolderHoverState;
  void interactionFrame.value.dragFolderTargetId;
  void interactionFrame.value.dragMeta;
  void interactionFrame.value.iconGesturePresentation;
  void interactionFrame.value.isEditMode;
  void interactionFrame.value.isBatchSelectionActive;
  void interactionFrame.value.isSearchMode;
  void interactionFrame.value.isTextlessMode;
  void interactionFrame.value.focusedIcon;
  void interactionFrame.value.selectedAppIds;
  void diagnosticsFrame.value.desktopGridDebugOptions;
  void diagnosticsFrame.value.launchTargetStatusById;
  void diagnosticsFrame.value.showMissingLaunchTargetBadge;
  void pixiRenderCopy.value;
  requestRender("structure-watch");
});

watchEffect(() => {
  void synchronizeActiveIconTextures();
});

watchEffect(() => {
  void visualFrame.value.appLaunchCloseSessionId;
  void visualFrame.value.desktopVisualTransform;
  void visualFrame.value.desktopVisualAlpha;
  void visualFrame.value.launchpadVisualAlpha;
  void visualFrame.value.launchpadVisualTransform;
  requestRender("visual-watch");
});

watchEffect(() => {
  void interactionFrame.value.groupDragState;
  void interactionFrame.value.provisionalFolderRollback;
  requestRender("interaction-watch");
});

watchEffect(() => {
  readFolderOverlayStateRenderDependencies(sceneRuntime.value.folderOverlayState);
  void sceneRuntime.value.isFolderOpeningPreviewFrameGhosted;
  requestRender("folder-watch");
});

watchEffect(() => {
  void diagnosticsFrame.value.dragHitDebugOptions;
  void diagnosticsFrame.value.dragHitDebugState;
  void diagnosticsFrame.value.singleStageDiagnosticsOptions;
  requestRender("diagnostic-watch");
});

watchEffect(() => {
  void viewportFrame.value.pageGridMeasureStyle;
  requestRender("geometry-watch", { invalidateGeometry: true });
});

onBeforeUnmount(destroyPixi);

defineExpose(import.meta.env.DEV ? {
  getLaunchpadE2eVisualSnapshot() {
    const folderCreateTargets = [];
    for (const node of layer?.iconNodes?.values?.() || []) {
      if (!node?.item?.id || node.item.type !== "app") continue;
      const backdrop = node.folderCreateBackdrop;
      const flash = node.folderCreateFlashOverlay;
      if (!node.appFolderCreateActive && !backdrop?.visible && !flash?.visible) continue;
      folderCreateTargets.push(Object.freeze({
        active: node.appFolderCreateActive === true,
        backdropAlpha: Number(backdrop?.alpha) || 0,
        backdropVisible: backdrop?.visible === true,
        flashAlpha: Number(flash?.alpha) || 0,
        flashVisible: flash?.visible === true,
        id: node.item.id,
        phase: node.appFolderCreatePhase || null,
      }));
    }
    return Object.freeze({
      folderCreateTargets: Object.freeze(folderCreateTargets),
      folderVisual: layer?.getFolderVisualDebugSnapshot?.() || null,
    });
  },
} : {});

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePixiForHotReload(destroyPixi));
  reloadOnPixiHotUpdate(import.meta.hot);
}
</script>
