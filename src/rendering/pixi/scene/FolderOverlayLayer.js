import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { folderCloseDuration, folderCloseEase } from "../animation/eases.js";
import { killMotionOf, transition } from "../animation/motionTween.js";
import { folderPanelOpenSpring, pageTrackSpring, panelSpring, stopTargetSprings } from "../animation/springMotion.js";
import { getFolderGridMetrics, getFolderPanelGeometry, parseRepeatCount, readPx } from "../geometry/gridGeometry.js";
import {
  clearFrameGhost as clearFrameGhostState,
  drawClosingFrameMask as drawClosingFrameMaskState,
  drawFrameGhost as drawFrameGhostState,
  enableClosingFrameMask as enableClosingFrameMaskState,
  ensureClosingFrameMaskState,
  getFrameRadius,
  startFrameGhost as startFrameGhostState,
} from "./folderFrameGhost.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import {
  applyClosingHandoffOnlyOverlayState,
  applyClosingPresentationOverlayState,
  getClosingPresentationStageHitRects,
} from "./folderClosingHandoff.js";
import { FolderCloseSession } from "./folderCloseSession.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import {
  FolderTransitionCoordinator,
  makeFolderPanelTargetKey,
} from "./folderTransitionCoordinator.js";
import {
  getFolderOpeningPreviewChildRect,
  makeFolderOpeningGeometryLayoutKey,
  makeFolderOpeningGeometrySnapshot,
} from "./folderOpeningGeometrySnapshot.js";
import {
  FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderPageTrackVisualKey,
} from "./folderVisualOwnershipRegistry.js";
import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect, makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import {
  clearLaunchIconBounds,
  registerLiveClientLaunchIconTargetBounds,
  registerRenderedClientLaunchIconBounds,
  registerStableStageLayoutLaunchIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import {
  FOLDER_PAGE_DOTS_GAP,
  FOLDER_PAGE_DOTS_HIT_HEIGHT,
  FOLDER_PAGE_DOTS_SIZE,
  getFolderPageDotsFrame,
  getFolderPageDotVisualState,
  getFolderPageMaskRect,
  makePanelVisualRect,
} from "./folderOverlayGeometry.js";
import { makeFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import {
  getStableFolderCloseRects,
  makeClosingGhostTarget,
  makeOpeningGhostTarget,
} from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";
import { makeIconRect, makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";

const PAGE_DOT_BLEND_DURATION = 0.08;
const PAGE_DOT_BLEND_EASE = "power2.out";
const FOLDER_ICON_EXIT_REASON = "folder-icon-exit";
const FOLDER_OVERLAY_CLEAR_REASON = "folder-overlay-clear";
const FOLDER_PAGE_TRACK_REPLACE_REASON = "folder-page-track-replace";
const FOLDER_PANEL_CLOSE_REASON = "folder-panel-close";
const FOLDER_PANEL_DETACHED_CLOSE_REASON = "folder-panel-detached-close";
const FOLDER_PANEL_HANDOFF_SNAP_REASON = "folder-panel-handoff-snap";
const FOLDER_PANEL_OPEN_REASON = "folder-panel-open";
const FOLDER_PANEL_READY_PROGRESS = 0.985;
const MAX_DETACHED_CLOSING_VISUALS = 2;
const DETACHED_CLOSING_FRAME_TAIL_DURATION = 0.04;
const DETACHED_CLOSING_FALLBACK_DURATION = 0.22;

function isPointInRect(x, y, rect) {
  return Boolean(rect) &&
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function roundDebugValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}

function cloneDebugRect(rect) {
  if (!rect) return null;
  return {
    height: roundDebugValue(rect.height),
    left: roundDebugValue(rect.left),
    top: roundDebugValue(rect.top),
    width: roundDebugValue(rect.width),
  };
}

function makeOpeningGeometryDebugSnapshot(session, currentSnapshot, panel) {
  const sessionSnapshot = session?.geometrySnapshot || null;
  const snapshot = sessionSnapshot || currentSnapshot || null;
  if (!session && !snapshot) return null;
  return {
    currentGeometryMatchesSession: Boolean(sessionSnapshot && currentSnapshot && sessionSnapshot === currentSnapshot),
    panelDisplay: {
      alpha: roundDebugValue(panel?.alpha),
      scaleX: roundDebugValue(panel?.scale?.x),
      scaleY: roundDebugValue(panel?.scale?.y),
      x: roundDebugValue(panel?.x),
      y: roundDebugValue(panel?.y),
    },
    session: session ? {
      folderId: session.folderId || null,
      geometryLayoutKey: session.geometryLayoutKey || null,
      ghostsReady: session.ghostsReady === true,
      hasGeometrySnapshot: Boolean(session.geometrySnapshot),
      panelReady: session.panelReady === true,
      revealed: session.revealed === true,
      targetKey: session.targetKey || "",
      token: session.token ?? null,
    } : null,
    snapshot: snapshot ? {
      coordinateSpace: snapshot.coordinateSpace || null,
      folderId: snapshot.folderId || null,
      folderRect: cloneDebugRect(snapshot.folderRect),
      layoutKey: snapshot.layoutKey || null,
      panelCenter: {
        x: roundDebugValue(snapshot.panelCenter?.x),
        y: roundDebugValue(snapshot.panelCenter?.y),
      },
      panelRect: cloneDebugRect(snapshot.panelRect),
      previewChildRects: Array.from(snapshot.previewChildRects?.entries?.() || []).map(([key, rect]) => ({
        key,
        rect: cloneDebugRect(rect),
      })),
      sessionToken: snapshot.sessionToken ?? null,
      stageHeight: roundDebugValue(snapshot.stageHeight),
      stageRect: cloneDebugRect(snapshot.stageRect),
      stageWidth: roundDebugValue(snapshot.stageWidth),
      targetKey: snapshot.targetKey || "",
    } : null,
  };
}

function registerFolderIconNodeBounds(options) {
  const {
    folderId,
    iconSize,
    index,
    isInteractivePage,
    isPrewarm,
    item,
    node,
    pageIndex,
    stageHeight,
    stageRect,
    stageWidth,
    targetCenter,
  } = options;
  const iconBounds = node.getIconBounds(stageRect);
  if (!isInteractivePage || isPrewarm) return iconBounds;
  const meta = { area: "folder", folderId, id: item.id, index, item, pageIndex };
  registerRenderedClientLaunchIconBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    iconBounds,
    meta
  );
  registerLiveClientLaunchIconTargetBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    makeTargetIconBounds(stageRect, stageWidth, stageHeight, targetCenter.x, targetCenter.y, iconSize),
    meta
  );
  registerStableStageLayoutLaunchIconTargetBounds(
    { area: "folder", folderId, id: item.id, pageIndex },
    makeIconRect(targetCenter.x, targetCenter.y, iconSize),
    {
      ...meta,
      stageHeight,
      stageRect,
      stageWidth,
    }
  );
  return iconBounds;
}

function drawDetachedFrame(graphics, rect) {
  if (!graphics || graphics.destroyed || !rect) return;
  graphics.clear()
    .roundRect(rect.left, rect.top, rect.width, rect.height, rect.radius ?? getFrameRadius(rect))
    .fill({ color: Math.round(rect.fillColor ?? 0xf7f8ff), alpha: rect.fillAlpha ?? 0.26 })
    .stroke({ color: Math.round(rect.strokeColor ?? 0xffffff), alpha: rect.strokeAlpha ?? 0.24, width: rect.strokeWidth ?? 1 });
}

function addDetachedVisualMotionControl(visual, control) {
  if (!visual || !control || control.completed) return;
  if (!visual.motionControls) visual.motionControls = new Set();
  visual.motionControls.add(control);
}

function cancelDetachedVisualMotionControls(visual) {
  const controls = visual?.motionControls;
  visual.motionControls = null;
  if (!controls?.size) return;
  for (const control of controls) control.cancel?.(FOLDER_PANEL_DETACHED_CLOSE_REASON);
}

function makeCompletionTracker(onComplete) {
  let pending = 0;
  let complete = false;
  const finishOne = () => {
    if (complete) return;
    pending -= 1;
    if (pending > 0) return;
    complete = true;
    onComplete?.();
  };
  return {
    add() {
      pending += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        finishOne();
      };
    },
    finishIfIdle() {
      if (pending > 0 || complete) return;
      complete = true;
      onComplete?.();
    },
  };
}

function animateDetachedFrame(graphics, frameState, targetState, tracker, visual = null) {
  if (!graphics || !frameState) return;
  const frame = {
    ...frameState,
    progress: frameState.progress ?? 0,
  };
  const target = targetState || frameState;
  const duration = folderCloseDuration + DETACHED_CLOSING_FRAME_TAIL_DURATION;
  const finishGeometry = tracker.add();
  const update = () => drawDetachedFrame(graphics, frame);
  update();
  const geometryControl = transition(frame)
    .duration(duration)
    .ease(folderCloseEase)
    .overlay()
    .interrupt("retarget")
    .to({
      fillAlpha: target.fillAlpha ?? frame.fillAlpha,
      fillColor: target.fillColor ?? frame.fillColor,
      height: target.height ?? frame.height,
      left: target.left ?? frame.left,
      progress: 1,
      radius: target.radius ?? frame.radius,
      strokeAlpha: target.strokeAlpha ?? frame.strokeAlpha,
      strokeColor: target.strokeColor ?? frame.strokeColor,
      strokeWidth: target.strokeWidth ?? frame.strokeWidth,
      top: target.top ?? frame.top,
      width: target.width ?? frame.width,
      onComplete: finishGeometry,
      onUpdate: update,
    })
    .start();
  addDetachedVisualMotionControl(visual, geometryControl);
}

function animateDetachedClosingGhost(ghost, tracker, visual = null) {
  if (!ghost || ghost.destroyed) return;
  motionRuntime.describeTarget(ghost, {
    itemId: ghost.item?.id ?? null,
    itemType: ghost.item?.type ?? null,
    kind: "FolderGhost",
    label: ghost.item?.name || ghost.item?.id || "Detached closing ghost",
    layer: "ghost",
    overlayTarget: ghost,
    phase: "detachedClosing",
    sourceLabel: "ghost.detachedClosing.node",
    targetPart: "node",
  });
  motionRuntime.describeTarget(ghost.scale, {
    itemId: ghost.item?.id ?? null,
    itemType: ghost.item?.type ?? null,
    kind: "FolderGhost",
    label: ghost.item?.name || ghost.item?.id || "Detached closing ghost",
    layer: "ghost",
    overlayTarget: ghost,
    phase: "detachedClosing",
    sourceLabel: "ghost.detachedClosing.scale",
    targetPart: "node.scale",
  });
  const motion = ghost.__closingDetachedMotion;
  const duration = Math.max(0.01, Number(motion?.duration) || folderCloseDuration);
  const hasGeometryTarget = Number.isFinite(Number(motion?.x)) &&
    Number.isFinite(Number(motion?.y)) &&
    Number.isFinite(Number(motion?.scale));
  const finishDisplay = tracker.add();

  if (hasGeometryTarget) {
    const displayControl = transition(ghost)
      .duration(duration)
      .ease(folderCloseEase)
      .overlay()
      .interrupt("retarget")
      .to({
        alpha: Number.isFinite(Number(motion.alpha)) ? motion.alpha : ghost.alpha,
        x: motion.x,
        y: motion.y,
        onComplete: finishDisplay,
      })
      .start();
    addDetachedVisualMotionControl(visual, displayControl);
    const finishScale = tracker.add();
    const scaleControl = transition(ghost.scale)
      .duration(duration)
      .ease(folderCloseEase)
      .overlay()
      .interrupt("retarget")
      .to({
        x: motion.scale,
        y: motion.scale,
        onComplete: finishScale,
      })
      .start();
    addDetachedVisualMotionControl(visual, scaleControl);
    return;
  }

  const fallbackControl = transition(ghost)
    .duration(DETACHED_CLOSING_FALLBACK_DURATION)
    .ease(folderCloseEase)
    .overlay()
    .interrupt("retarget")
    .to({
      alpha: 0,
      onComplete: finishDisplay,
    })
    .start();
  addDetachedVisualMotionControl(visual, fallbackControl);
}

function animateDetachedGeometryHold(tracker, visual = null) {
  const state = { progress: 0 };
  const finishGeometry = tracker.add();
  const holdControl = transition(state)
    .duration(folderCloseDuration + DETACHED_CLOSING_FRAME_TAIL_DURATION)
    .ease(folderCloseEase)
    .overlay()
    .interrupt("retarget")
    .to({
      progress: 1,
      onComplete: finishGeometry,
    })
    .start();
  addDetachedVisualMotionControl(visual, holdControl);
}

function springFolderIconLayoutPosition(node, target, refreshBounds) {
  transition(node)
    .layout()
    .spring(pageTrackSpring)
    .interrupt("retarget")
    .to({
      onComplete: refreshBounds,
      onUpdate: refreshBounds,
      x: target.x,
      y: target.y,
    })
    .start();
}

function transitionSpringTo(target, vars, config, options = {}) {
  transition(target)
    .layout()
    .spring(config)
    .interrupt("retarget")
    .to({
      ...vars,
      onComplete: options.onComplete,
      onUpdate: options.onUpdate,
      snap: options.snap,
    })
    .start();
}

function springPanelGeometry(panel, target, options = {}) {
  const springOptions = options.onFrame ? { onComplete: options.onFrame, onUpdate: options.onFrame } : {};
  const springConfig = options.spring || panelSpring;
  transitionSpringTo(panel, { x: target.x, y: target.y }, springConfig, springOptions);
  transitionSpringTo(panel.scale, { x: target.scaleX, y: target.scaleY }, springConfig, springOptions);
}

export class FolderOverlayLayer extends Container {
  constructor(options = {}) {
    super();
    this.panel = new Container();
    this.panelMaterial = new Graphics();
    this.frameGhost = new Graphics();
    this.frameGhost.visible = false;
    this.closingFrameMask = new Graphics();
    this.pageMask = new Graphics();
    this.pageMaskRect = null;
    this.pageTrack = new Container();
    this.pageTrackMotion = createPageTrackMotionState();
    this.pageDotsLayer = new Container();
    this.openingGhostLayer = new Container();
    this.closingGhostLayer = new Container();
    this.closingPreviewSwapLayer = new Container();
    this.detachedClosingVisualLayer = options.detachedClosingVisualLayer || new Container();
    this.ownsDetachedClosingVisualLayer = !options.detachedClosingVisualLayer;
    this.folderTitle = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 18, fontWeight: "620", fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.iconNodes = new Map();
    this.iconBoundsRefreshers = new Map();
    this.openingGhostBoundsRefreshers = new Map();
    this.registeredBoundsDirty = false;
    this.registeredBoundsFlushQueued = false;
    this.onIconAction = options.onIconAction || (() => { });
    this.onClosingHandoffPrepare = options.onClosingHandoffPrepare || (() => { });
    this.onClosingHandoffReady = options.onClosingHandoffReady || (() => { });
    this.onClosingHandoffVisualRelease = options.onClosingHandoffVisualRelease || (() => { });
    this.onInternalActivityChange = options.onInternalActivityChange || (() => { });
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => { });
    this.onPanelPointerDown = options.onPanelPointerDown || (() => { });
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => { });
    this.onTitleFrameChange = options.onTitleFrameChange || (() => { });
    this.onDesktopSourceGhostingChange = options.onDesktopSourceGhostingChange || (() => { });
    this.showFolderTitle = options.showFolderTitle === true;
    this.openingGhosts = new FolderOpeningGhostController(this, {
      ghostFactory: () => new IconNode(),
    });
    this.closeSession = new FolderCloseSession(this);
    this.closingPreviewSwap = new FolderClosingPreviewSwapController(this, {
      containerFactory: () => new Container(),
      getIconTexture: (item, render, ghost) => getCachedIconTexture(item, render, ghost),
      graphicsFactory: () => new Graphics(),
      spriteFactory: () => new Sprite(),
      textFactory: (size) => new Text({ text: "", style: { align: "center", fill: 0xffffff, fontSize: size, lineHeight: size } }),
    });
    this.closingGhosts = new FolderClosingGhostController(this, {
      ghostFactory: () => new IconNode(),
      previewSwap: this.closingPreviewSwap,
    });
    this.openingGhostRevealTimer = null;
    this.closingHandoffCleanupFrame = null;
    this.closingHandoffCleanupToken = 0;
    this.folderTransitions = new FolderTransitionCoordinator();
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.visualOwnership = options.visualOwnership || new FolderVisualOwnershipRegistry();
    this.ownedVisualTokens = new Set();
    this.openingPanelReadyFrame = null;
    this.panelAlphaTarget = null;
    this.panelOpenTargetKey = null;
    this.detachedClosingVisuals = [];
    this.nextDetachedClosingVisualToken = 1;
    this.nextClosingGhostSessionToken = 1;
    this.titleFrameKey = null;
    this.panelTitleOpening = false;
    this.panelTitleStartScaleX = 1;
    this.panelTitleStartScaleY = 1;
    this.addChild(this.frameGhost);
    this.addChild(this.closingFrameMask);
    if (this.ownsDetachedClosingVisualLayer) this.addChild(this.detachedClosingVisualLayer);
    this.addChild(this.panel);
    this.panel.addChild(this.panelMaterial);
    this.panel.addChild(this.pageMask);
    this.panel.addChild(this.pageTrack);
    this.panel.addChild(this.folderTitle);
    this.addChild(this.pageDotsLayer);
    this.addChild(this.openingGhostLayer);
    this.addChild(this.closingGhostLayer);
    this.addChild(this.closingPreviewSwapLayer);
    this.pageTrack.mask = this.pageMask;
    this.eventMode = "static";
    this.on("pointerdown", (event) => this.handlePointerDown(event));
    this.describeMotionTargets();
  }

  update(state) {
    const prepared = this.prepareFolderOverlayState(state);
    if (prepared.done) return prepared.result;
    const resolved = this.resolveFolderOverlayGeometry(prepared);
    const synced = this.syncFolderOverlayNodes(resolved);
    this.startFolderOverlayTransitions(synced);
    return resolved.geometry;
  }

  prepareFolderOverlayState(state) {
    this.stageRect = state.stageRect;
    const isPrewarm = Boolean(state.prewarm);
    if (!isPrewarm) clearLaunchIconBounds("folder");
    const keepClosingHandoff = this.closingGhosts.hasPendingHandoff();
    this.visible = Boolean(state.renderedFolder) || keepClosingHandoff;
    if (!state.renderedFolder) {
      this.clearRegisteredIconBounds();
      if (keepClosingHandoff) {
        return { done: true, result: applyClosingHandoffOnlyOverlayState(this) };
      }
      this.teardownTransientState({
        cancelPageTrackReason: "cleanup",
        clearPageDots: true,
        clearPageTrackSpringsReason: FOLDER_OVERLAY_CLEAR_REASON,
        clearPanelSpringsReason: FOLDER_OVERLAY_CLEAR_REASON,
        preserveDetachedClosing: true,
      });
      this.currentFolderId = null;
      this.isClosing = false;
      this.isUserFolderClosing = false;
      this.sizeKey = null;
      this.stableFolderCloseTarget = null;
      if (state.folderPanelRef) state.folderPanelRef.value = null;
      if (state.folderViewportRef) state.folderViewportRef.value = null;
      this.notifyTitleFrame(null);
      return { done: true, result: null };
    }
    this.panel.visible = true;
    this.closingPreviewSwap.ensureLayer();
    ensureClosingFrameMaskState(this);
    this.hitArea = new Rectangle(0, 0, state.width, state.height);
    const sizeKey = `${state.width}x${state.height}`;
    if (this.sizeKey && this.sizeKey !== sizeKey) {
      this.teardownTransientState({ clearDetachedClosingVisuals: true });
    }
    this.sizeKey = sizeKey;

    const geometry = getFolderPanelGeometry({
      height: state.height,
      panelStyle: state.folderPanelStyle,
      width: state.width,
    });
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    const wasClosing = Boolean(this.isClosing);
    const renderedFolderId = state.renderedFolder?.id || null;
    const hasPendingRenderedOpen = this.folderTransitions.activeOpenSession?.folderId === renderedFolderId &&
      this.folderTransitions.isRevealPending();
    if (wasClosing && !isClosing && this.currentFolderId === renderedFolderId && !hasPendingRenderedOpen) {
      this.currentFolderId = null;
    }
    const isNewFolder = !isPrewarm && this.currentFolderId !== state.renderedFolder?.id;
    this.isClosing = isClosing;
    this.isUserFolderClosing = Boolean(state.isFolderClosing);
    this.panelGeometry = geometry.panel;
    const folderId = state.renderedFolder.id;
    this.describeMotionTargets(state, geometry);
    if (this.closingGhostFolderId && (this.closingGhostFolderId !== folderId || !isClosing)) {
      this.detachClosingPresentationForOpen(folderId);
    }
    return {
      done: false,
      folderId,
      geometry,
      isClosing,
      isNewFolder,
      isPrewarm,
      state,
      wasClosing,
    };
  }

  resolveFolderOverlayGeometry(context) {
    const { folderId, geometry, isClosing, isNewFolder, isPrewarm, state, wasClosing } = context;
    const overlayTargets = resolveFolderOverlayTargets({
      folder: state.renderedFolder,
      folderOpeningOriginBounds: state.folderOpeningOriginBounds,
      folderPageSize: state.folderPageSize,
      isClosing,
      previousStableFolderCloseTarget: this.stableFolderCloseTarget,
      wasClosing,
    });
    this.stableFolderCloseTarget = overlayTargets.stableFolderCloseTarget;
    const { folderClientRect, folderThumbClientRect, getOpeningPreviewChildClientRect, previewSlots } = overlayTargets;
    this.drawPanel(geometry.panel);
    this.updatePageDots(state, geometry);
    if (isClosing) applyClosingPresentationOverlayState(this);
    this.panel.pivot.set(geometry.panel.width / 2, geometry.panel.height / 2);
    const targetX = geometry.panel.left + geometry.panel.width / 2;
    const targetY = geometry.panel.top + geometry.panel.height / 2;
    if (isPrewarm) {
      this.currentOpeningGeometrySnapshot = null;
      this.currentFolderId = state.renderedFolder?.id;
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      this.panel.alpha = 1;
      this.panelTitleOpening = false;
    } else {
      this.currentOpeningGeometrySnapshot = this.animatePanel(state, targetX, targetY, geometry.panel, folderClientRect, {
        getPreviewChildRect: getOpeningPreviewChildClientRect,
        previewSlots,
      })?.openingGeometrySnapshot || null;
    }

    this.folderTitle.text = state.renderedFolder.name || "新文件夹";
    this.folderTitle.visible = this.showFolderTitle;
    this.folderTitle.anchor.set(0.5);
    this.folderTitle.position.set(geometry.panel.width / 2, -34);

    const cols = parseRepeatCount(state.folderGridStyle?.gridTemplateColumns, 5);
    const rows = parseRepeatCount(state.folderGridStyle?.gridTemplateRows, Math.max(1, Math.ceil((state.folderPages?.[state.folderPageIndex] || []).length / cols)));
    const rowGap = readPx(state.folderPanelStyle?.["--folder-row-gap"], 18);
    const fixedCellHeight = readPx(state.folderPanelStyle?.["--folder-icon-cell-height"], 0);
    const iconSize = Math.min(readPx(state.folderPanelStyle?.["--folder-icon-size"], state.iconSize), 56);
    const metrics = getFolderGridMetrics({ cols, fixedCellHeight, grid: geometry.grid, rowGap, rows });
    const localGridLeft = geometry.grid.left - geometry.panel.left;
    const localGridTop = geometry.grid.top - geometry.panel.top;
    const localMetrics = { ...metrics, gridLeft: localGridLeft, gridTop: localGridTop };
    this.pageMaskRect = getFolderPageMaskRect(geometry, localGridLeft, localGridTop);
    this.drawPageMask(this.pageMask, this.pageMaskRect);
    this.refreshPageTrackMask();
    const targetTrackX = -state.folderPageIndex * geometry.grid.width;
    if (isNewFolder && !isClosing) {
      cancelPageTrackMotion(this.pageTrackMotion, "replace");
      stopTargetSprings(this.pageTrack, { reason: FOLDER_PAGE_TRACK_REPLACE_REASON });
      this.pageTrack.x = targetTrackX;
    } else {
      const markBoundsDirty = () => this.markRegisteredBoundsDirty();
      updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
        debugMetadata: {
          folderId,
          kind: "PageTrack",
          label: `${state.renderedFolder.name || folderId || "Folder"} page track`,
          layer: "folder",
        },
        onFrame: markBoundsDirty,
        pageIndex: state.folderPageIndex,
        pageSpan: geometry.grid.width,
        scrub: state.folderPageTrackScrub,
        sourceLabel: "folder.pageTrack",
        springConfig: pageTrackSpring,
      });
    }
    const { closeIconRect, closeThumbRect } = getStableFolderCloseRects({
      folderId,
      folderRect: folderClientRect,
      folderThumbRect: folderThumbClientRect,
      isClosing,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
    });

    if (!isPrewarm) this.bindFakeRefs(state, geometry);
    const renderPlan = makeFolderOverlayRenderPlan({
      closeThumbRect,
      closingGhostKeys: this.closingGhostKeys,
      cols,
      dragMeta: state.dragMeta,
      dragReleaseGhostId: state.dragReleaseGhostId,
      folderCloseIconGhosts: state.folderCloseIconGhosts,
      folderId,
      folderOpenIconGhosts: state.folderOpenIconGhosts,
      folderPageIndex: state.folderPageIndex,
      folderPages: state.folderPages,
      folderPageSize: state.folderPageSize,
      geometry,
      getFolderPageRenderMode: state.getFolderPageRenderMode,
      getVisibleFolderPage: state.getVisibleFolderPage,
      iconSize,
      isClosing,
      isEditMode: state.isEditMode,
      isFolderClosing: state.isFolderClosing,
      isIconOpening: state.isIconOpening,
      isIconSelected: state.isIconSelected,
      isNewFolder,
      isTextlessMode: state.isTextlessMode,
      launchTargetStatusById: state.launchTargetStatusById,
      localMetrics,
      openingGhostKeys: this.openingGhostKeys,
      previewSlots,
      rows,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
      stageHeight: state.height,
      stageWidth: state.width,
      targetTrackX,
    });
    return {
      ...context,
      closeIconRect,
      closeThumbRect,
      folderClientRect,
      folderThumbClientRect,
      getOpeningPreviewChildClientRect,
      iconSize,
      previewSlots,
      renderPlan,
    };
  }

  syncFolderOverlayNodes(context) {
    const {
      closeThumbRect,
      folderClientRect,
      folderId,
      getOpeningPreviewChildClientRect,
      iconSize,
      isPrewarm,
      renderPlan,
      state,
    } = context;
    const seen = new Set();
    const boundsRefreshers = new Map();
    const openingGhostTargets = [];
    const closingGhostTargets = [];
    for (const entry of renderPlan.entries) {
      const { index, isInteractivePage, item, key, nodeState, pageIndex, targetCenter, x, y } = entry;
      seen.add(key);
      let node = this.iconNodes.get(key);
      const isNewNode = !node;
      if (!node) {
        node = new IconNode({
          onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
            this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
        });
        node.alpha = 0;
        node.position.set(x, y + 10);
        this.iconNodes.set(key, node);
        this.pageTrack.addChild(node);
      }

      node.stageRect = state.stageRect;
      node.setState(nodeState);

      const refreshNodeBounds = () => registerFolderIconNodeBounds({
        folderId: state.renderedFolder.id,
        iconSize,
        index,
        isInteractivePage,
        isPrewarm,
        item,
        node,
        pageIndex,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
        targetCenter,
      });
      const iconBounds = refreshNodeBounds();
      if (isInteractivePage && !isPrewarm) boundsRefreshers.set(key, refreshNodeBounds);
      if (isNewNode) {
        transition(node)
          .preset("folderOpen", { delay: Math.min(0.18, index * 0.012), duration: 0.24 })
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 1 })
          .start();
      }
      springFolderIconLayoutPosition(node, { x, y }, refreshNodeBounds);
      if (entry.openingGhostInput) {
        const openingGeometrySnapshot = this.currentOpeningGeometrySnapshot?.folderId === folderId
          ? this.currentOpeningGeometrySnapshot
          : null;
        openingGhostTargets.push(makeOpeningGhostTarget({
          ...entry.openingGhostInput,
          folderId,
          folderRect: openingGeometrySnapshot?.folderRect || folderClientRect,
          getPreviewChildRect: openingGeometrySnapshot
            ? (item, previewSlotIndex) => getFolderOpeningPreviewChildRect(openingGeometrySnapshot, item, previewSlotIndex)
            : getOpeningPreviewChildClientRect,
          pageIndex,
        }));
      }
      if (entry.closingGhostInput) {
        closingGhostTargets.push(makeClosingGhostTarget({
          ...entry.closingGhostInput,
          closeThumbRect,
          iconBounds,
          stableFolderCloseTarget: this.stableFolderCloseTarget,
        }));
      }
    }

    const closingPreviewSwapTargets = renderPlan.closingPreviewSwapTargets;
    this.iconBoundsRefreshers = boundsRefreshers;
    return {
      ...context,
      closingGhostTargets,
      closingPreviewSwapTargets,
      openingGhostTargets,
      seen,
    };
  }

  startFolderOverlayTransitions(context) {
    const {
      closeIconRect,
      closeThumbRect,
      closingGhostTargets,
      closingPreviewSwapTargets,
      folderClientRect,
      folderId,
      folderThumbClientRect,
      geometry,
      isClosing,
      isNewFolder,
      openingGhostTargets,
      seen,
      state,
    } = context;
    if (isNewFolder && !isClosing) {
      this.openingGhosts.start(state, openingGhostTargets, {
        frameSourceRect: folderThumbClientRect || folderClientRect,
        frameTargetRect: geometry.panel,
        sessionToken: this.folderTransitions.activeOpenToken,
      });
    }
    if (!isNewFolder && !isClosing && state.folderOpenIconGhosts?.length && !this.openingGhostKeys?.size) {
      for (const ghost of state.folderOpenIconGhosts) {
        if (ghost?.key) state.completeFolderOpenIconGhost?.(ghost.key);
      }
    }
    if (state.isFolderClosing && this.closingGhostFolderId !== folderId) {
      const closeFrameRect = this.getPanelVisualRect(geometry.panel) || geometry.panel;
      this.closingGhosts.start(state, closingGhostTargets, closeThumbRect, closeFrameRect, {
        handoffRect: closeIconRect,
        handoffTarget: this.stableFolderCloseTarget,
        previewSwapTargets: closingPreviewSwapTargets,
      });
    }
    if (!state.isFolderClosing && this.closingGhostFolderId) {
      this.clearClosingFolderId();
      this.closingGhosts.clear();
    }

    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      killMotionOf(node, null, { reason: FOLDER_ICON_EXIT_REASON });
      stopTargetSprings(node, { reason: FOLDER_ICON_EXIT_REASON });
      transition(node)
        .preset("fade", { duration: 0.14 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0, onComplete: () => node.destroy({ children: true }) })
        .start();
    }
    this.pageTrack.visible = !state.isFolderClosing &&
      !this.folderTransitions.isRevealPending() &&
      !this.openingGhostKeys?.size &&
      !this.closingGhostKeys?.size &&
      !this.closingPreviewSwapKeys?.size;
    if (!this.frameGhostState) {
      if (!isClosing) this.notifyPanelTitleFrame(geometry.panel);
      else this.notifyTitleFrame(geometry.panel);
    }
    this.refreshRegisteredIconBounds();
  }

  resetPanelMotion(reason, options = {}) {
    const {
      panelProps = null,
      scaleProps = null,
      stopSprings = true,
    } = options;
    if (stopSprings) {
      stopTargetSprings(this.panel, { reason });
      stopTargetSprings(this.panel.scale, { reason });
    }
    killMotionOf(this.panel, panelProps, { reason });
    killMotionOf(this.panel.scale, scaleProps, { reason });
  }

  teardownTransientState(options = {}) {
    const {
      cancelPageTrackReason = null,
      clearDetachedClosingVisuals = false,
      clearPageDots = false,
      clearPageTrackSpringsReason = null,
      clearPanelSpringsReason = null,
      clearVisualCommitQueue = false,
      preserveDetachedClosing = false,
      releaseOwnership = true,
    } = options;
    this.folderTransitions.cancelOpen();
    this.cancelOpeningPanelReadyCheck();
    this.panelOpenTargetKey = null;
    this.panelAlphaTarget = null;
    this.currentOpeningGeometrySnapshot = null;
    this.openingGhosts.clear({ cancelSession: true });
    this.closingGhosts.clear();
    if (clearDetachedClosingVisuals) this.clearDetachedClosingVisuals(null, { immediate: true });
    if (releaseOwnership) this.releaseAllOwnedVisualOwnership({ preserveDetachedClosing });
    if (clearVisualCommitQueue) this.getVisualCommitQueue().clear();
    if (cancelPageTrackReason) {
      cancelPageTrackMotion(this.pageTrackMotion, cancelPageTrackReason);
    }
    if (clearPageTrackSpringsReason) stopTargetSprings(this.pageTrack, { reason: clearPageTrackSpringsReason });
    if (clearPageDots) this.clearPageDots();
    if (clearPanelSpringsReason) {
      stopTargetSprings(this.panel, { reason: clearPanelSpringsReason });
      stopTargetSprings(this.panel.scale, { reason: clearPanelSpringsReason });
    }
  }

  clearRegisteredIconBounds() {
    this.iconBoundsRefreshers?.clear();
    this.openingGhostBoundsRefreshers?.clear();
  }

  refreshRegisteredIconBounds() {
    let count = 0;
    for (const refreshBounds of this.iconBoundsRefreshers?.values() || []) {
      refreshBounds?.();
      count += 1;
    }
    for (const refreshBounds of this.openingGhostBoundsRefreshers?.values() || []) {
      refreshBounds?.();
      count += 1;
    }
    return count;
  }

  markRegisteredBoundsDirty() {
    this.registeredBoundsDirty = true;
    if (this.registeredBoundsFlushQueued) return;
    this.registeredBoundsFlushQueued = true;
    const flush = () => {
      this.registeredBoundsFlushQueued = false;
      this.flushRegisteredIconBounds();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      motionRuntime.afterFrame(flush);
      return;
    }
    if (typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(flush);
      return;
    }
    Promise.resolve().then(flush);
  }

  flushRegisteredIconBounds(options = {}) {
    if (!options.force && !this.registeredBoundsDirty) return 0;
    this.registeredBoundsDirty = false;
    return this.refreshRegisteredIconBounds();
  }

  registerOpeningGhostBounds(state, target, ghost) {
    const rect = target?.targetStageLayoutRect;
    const item = target?.item;
    if (!rect || !item?.id || !target?.folderId) return null;
    return registerFolderIconNodeBounds({
      folderId: target.folderId,
      iconSize: target.iconSize,
      index: target.index,
      isInteractivePage: true,
      isPrewarm: false,
      item,
      node: ghost,
      pageIndex: target.pageIndex ?? state.folderPageIndex ?? 0,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetCenter: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
  }

  clearPageDots() {
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = false;
    this.pageDotsLayer.eventMode = "none";
    this.pageDotsLayer.hitArea = null;
  }

  hasActiveIconGhosts() {
    return Boolean(this.openingGhostKeys?.size || this.closingGhosts.hasActive());
  }

  forgetOwnedVisualToken(token) {
    if (token == null) return;
    const stillOwned = this.visualOwnership.snapshot().some((entry) => entry.owner?.token === token);
    if (!stillOwned) this.getOwnedVisualTokens().delete(token);
  }

  getOwnedVisualTokens() {
    if (!this.ownedVisualTokens) this.ownedVisualTokens = new Set();
    return this.ownedVisualTokens;
  }

  getVisualCommitQueue() {
    if (!this.visualCommitQueue) this.visualCommitQueue = new FolderVisualCommitQueue();
    return this.visualCommitQueue;
  }

  acquireVisualOwnership(key, owner) {
    const acquired = this.visualOwnership.acquire(key, owner);
    if (acquired && owner?.token != null) this.getOwnedVisualTokens().add(owner.token);
    return acquired;
  }

  releaseVisualOwnership(key, token) {
    const released = this.visualOwnership.release(key, token);
    if (released) this.forgetOwnedVisualToken(token);
    return released;
  }

  releaseAllOwnedVisualOwnership(options = {}) {
    const ownedVisualTokens = this.getOwnedVisualTokens();
    const preserveTokens = options.preserveDetachedClosing === true
      ? new Set((this.detachedClosingVisuals || []).map((visual) => visual?.ownerToken).filter((token) => token != null))
      : null;
    const tokens = Array.from(ownedVisualTokens).filter((token) => !preserveTokens?.has(token));
    if (preserveTokens) {
      for (const token of tokens) ownedVisualTokens.delete(token);
    } else {
      ownedVisualTokens.clear();
    }
    let released = 0;
    for (const token of tokens) released += this.visualOwnership.releaseByToken(token);
    return released;
  }

  destroyDetachedClosingVisual(visual) {
    if (!visual || visual.destroyed) return;
    visual.destroyed = true;
    cancelDetachedVisualMotionControls(visual);
    killAllMotion(visual.container, { reason: FOLDER_PANEL_DETACHED_CLOSE_REASON });
    if (visual.container?.parent) visual.container.parent.removeChild(visual.container);
    visual.container?.destroy?.({ children: true });
  }

  notifyDesktopSourceGhostingChange() {
    this.onDesktopSourceGhostingChange?.();
  }

  releaseDetachedClosingSourceOwnership(visual) {
    if (!visual?.desktopSourceKey || visual.ownerToken == null) return false;
    const released = this.releaseVisualOwnership(visual.desktopSourceKey, visual.ownerToken);
    if (released) visual.ownerToken = null;
    return released;
  }

  releaseDetachedClosingHandoffVisual(visual, options = {}) {
    if (!visual || visual.handoffReleased) return false;
    visual.handoffReleased = true;
    if (options.reveal !== false) this.onClosingHandoffVisualRelease?.(visual.folderId || null);
    return true;
  }

  commitDetachedClosingHandoff(visual, options = {}) {
    if (!visual || visual.handoffCommitted) return false;
    visual.handoffCommitted = true;
    this.releaseDetachedClosingHandoffVisual(visual, options);
    this.releaseDetachedClosingSourceOwnership(visual);
    this.notifyDesktopSourceGhostingChange();
    return true;
  }

  clearDetachedClosingVisual(visual, options = {}) {
    if (!visual || visual.clearing) return false;
    visual.clearing = true;
    return this.getVisualCommitQueue().enqueueDetachedVisualRelease({
      isStale: () => !this.detachedClosingVisuals.includes(visual),
      mutateOwnership: () => {
        const index = this.detachedClosingVisuals.indexOf(visual);
        if (index < 0) return false;
        this.detachedClosingVisuals.splice(index, 1);
        const released = this.releaseDetachedClosingSourceOwnership(visual);
        return { released, visual };
      },
      applyVisibility: () => {
        this.commitDetachedClosingHandoff(visual, { reveal: options.reveal !== false });
      },
      destroyVisual: () => {
        this.destroyDetachedClosingVisual(visual);
      },
    }, { immediate: options.immediate === true });
  }

  clearDetachedClosingVisualNow(visual, options = {}) {
    if (!visual) return;
    const index = this.detachedClosingVisuals.indexOf(visual);
    if (index >= 0) this.detachedClosingVisuals.splice(index, 1);
    this.destroyDetachedClosingVisual(visual);
    this.commitDetachedClosingHandoff(visual, { reveal: options.reveal !== false });
  }

  clearDetachedClosingVisuals(folderId = null, options = {}) {
    const visuals = Array.from(this.detachedClosingVisuals);
    for (const visual of visuals) {
      if (folderId && visual.folderId !== folderId) continue;
      if (options.immediate) this.clearDetachedClosingVisualNow(visual, options);
      else this.clearDetachedClosingVisual(visual, options);
    }
  }

  pruneDetachedClosingVisuals() {
    while (this.detachedClosingVisuals.length > MAX_DETACHED_CLOSING_VISUALS) {
      this.clearDetachedClosingVisual(this.detachedClosingVisuals[0], { immediate: true });
    }
  }

  detachClosingPresentationForOpen(nextFolderId) {
    if (nextFolderId) this.clearDetachedClosingVisuals(nextFolderId, { immediate: true, reveal: false });
    const closingFolderId = this.closingGhostFolderId || null;
    const shouldKeepDetachedVisual = Boolean(closingFolderId && closingFolderId !== nextFolderId);
    const frameState = shouldKeepDetachedVisual ? this.frameGhostState : null;
    const frameTarget = shouldKeepDetachedVisual ? this.closingFrameDetachedTarget : null;
    const closingGhosts = shouldKeepDetachedVisual
      ? this.closingGhostLayer?.removeChildren?.() || []
      : [];
    const previewSwapGhosts = shouldKeepDetachedVisual
      ? this.closingPreviewSwapLayer?.removeChildren?.() || []
      : [];
    let detachedVisual = null;

    if (shouldKeepDetachedVisual && (frameState || closingGhosts.length || previewSwapGhosts.length)) {
      this.onClosingHandoffPrepare?.(closingFolderId);
      const container = new Container();
      container.eventMode = "static";
      container.interactiveChildren = false;
      container.hitArea = {
        contains: (x, y) => {
          if (container.destroyed || !container.children.length) return false;
          const bounds = container.getLocalBounds();
          return x >= bounds.x && x <= bounds.x + bounds.width
            && y >= bounds.y && y <= bounds.y + bounds.height;
        },
      };
      container.cursor = "pointer";
      container.on("pointerdown", (event) => {
        const nativeEvent = event?.nativeEvent || event;
        if (nativeEvent?.button != null && nativeEvent.button !== 0) return;
        event?.stopPropagation?.();
        nativeEvent?.preventDefault?.();
        nativeEvent?.stopPropagation?.();
        this.onClosingFolderPointerDown?.(closingFolderId, nativeEvent);
      });
      container.alpha = 1;
      const visual = { container, folderId: closingFolderId };
      detachedVisual = visual;
      const ownerToken = `detached-close:${closingFolderId}:${this.nextDetachedClosingVisualToken}`;
      this.nextDetachedClosingVisualToken += 1;
      visual.ownerToken = ownerToken;
      visual.desktopSourceKey = makeDesktopSourceVisualKey(closingFolderId);
      if (frameState) {
        const frame = new Graphics();
        drawDetachedFrame(frame, frameState);
        container.addChild(frame);
      }
      for (const ghost of closingGhosts) {
        container.addChild(ghost);
      }
      for (const ghost of previewSwapGhosts) {
        container.addChild(ghost);
      }
      this.detachedClosingVisualLayer.addChild(container);
      this.acquireVisualOwnership(visual.desktopSourceKey, {
        folderId: closingFolderId,
        kind: "detachedClosing",
        token: ownerToken,
      });
      this.detachedClosingVisuals.push(visual);
      this.pruneDetachedClosingVisuals();
      this.clearClosingFolderId();
      this.closingGhosts.clear({ restorePageTrack: false, reveal: false });
      const finishAfterGeometry = () => {
        if (detachedVisual.destroyed || detachedVisual.finishQueued) return;
        detachedVisual.finishQueued = true;
        motionRuntime.afterFrame(() => {
          if (detachedVisual.destroyed) return;
          this.clearDetachedClosingVisualNow(detachedVisual);
        });
      };
      const geometryTracker = makeCompletionTracker(finishAfterGeometry);
      const frame = frameState ? container.children[0] : null;
      if (frameState) animateDetachedFrame(frame, frameState, frameTarget, geometryTracker, detachedVisual);
      for (const ghost of closingGhosts) animateDetachedClosingGhost(ghost, geometryTracker, detachedVisual);
      if (!frameState && !closingGhosts.length && previewSwapGhosts.length) {
        animateDetachedGeometryHold(geometryTracker, detachedVisual);
      }
      geometryTracker.finishIfIdle();
      return;
    }

    this.clearClosingFolderId();
    this.closingGhosts.clear({ restorePageTrack: false, reveal: false });
  }

  getDesktopSourceGhostedIds() {
    const ids = new Set();
    for (const visual of this.detachedClosingVisuals || []) {
      if (visual?.folderId && !visual.handoffCommitted) ids.add(visual.folderId);
    }
    for (const entry of this.visualOwnership.snapshot()) {
      if (!entry.key?.startsWith("desktopSource:")) continue;
      const folderId = entry.owner?.folderId || entry.key.slice("desktopSource:".length);
      if (folderId) ids.add(folderId);
    }
    return ids;
  }

  setClosingHandoffActive(active) {
    const next = Boolean(active);
    if (this.closingHandoffActive === next) return;
    this.closingHandoffActive = next;
    const folderId = next ? this.closingGhostFolderId || this.currentFolderId || null : null;
    if (next) this.onClosingHandoffReady(folderId);
    this.onInternalActivityChange(next, folderId);
  }

  clearClosingFolderId() {
    if (this.closeSession) this.closeSession.clearFolderId();
    else this.closingGhostFolderId = null;
  }

  revealIconNodes() {
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
  }

  createClosingGhostSessionToken(folderId = null) {
    const token = `closing:${folderId || ""}:${this.nextClosingGhostSessionToken}`;
    this.nextClosingGhostSessionToken += 1;
    return token;
  }

  getIconNodeVisualKey(node, fallbackFolderId = null) {
    const source = node?.source || node?.state?.source || {};
    return makeFolderIconVisualKey(
      source.folderId || fallbackFolderId || this.currentFolderId,
      node?.item?.id,
      source.pageIndex ?? 0
    );
  }

  hideIconNodesForTransition(itemId, owner) {
    if (!itemId) return;
    for (const node of this.iconNodes.values()) {
      if (node.item?.id !== itemId) continue;
      const key = this.getIconNodeVisualKey(node, owner?.folderId);
      if (key) this.acquireVisualOwnership(key, owner);
      node.visible = false;
    }
  }

  hidePageTrackForTransition(owner) {
    const key = makeFolderPageTrackVisualKey(owner?.folderId || this.currentFolderId);
    if (key) this.acquireVisualOwnership(key, owner);
    this.pageTrack.visible = false;
  }

  hasPageTrackOwner() {
    return this.visualOwnership.snapshot().some((entry) => entry.key?.startsWith("folderPageTrack:"));
  }

  releaseTransitionOwnership(token, options = {}) {
    if (token == null) return;
    const reveal = options.reveal !== false;
    const restorePageTrack = options.restorePageTrack !== false;
    const entries = this.visualOwnership.snapshot();
    for (const entry of entries) {
      if (entry.owner?.token !== token) continue;
      this.releaseVisualOwnership(entry.key, token);
      if (reveal && entry.key?.startsWith("folderIcon:")) {
        for (const node of this.iconNodes.values()) {
          const key = this.getIconNodeVisualKey(node, entry.owner.folderId);
          if (key === entry.key && !this.visualOwnership.hasOwner(key)) {
            node.visible = true;
            node.alpha = 1;
          }
        }
      }
    }
    if (restorePageTrack && !this.hasPageTrackOwner()) {
      this.pageTrack.visible = true;
    }
  }

  clearFrameGhost(options = {}) {
    clearFrameGhostState(this, options);
  }

  notifyTitleFrame(rect) {
    if (!rect) {
      if (this.titleFrameKey === null) return;
      this.titleFrameKey = null;
      this.onTitleFrameChange(null);
      return;
    }
    const frame = {
      height: rect.height,
      left: rect.left,
      progress: rect.progress ?? 1,
      top: rect.top,
      width: rect.width,
    };
    const key = [
      Math.round(frame.left * 100),
      Math.round(frame.top * 100),
      Math.round(frame.width * 100),
      Math.round(frame.height * 100),
      Math.round(frame.progress * 1000),
    ].join(":");
    if (key === this.titleFrameKey) return;
    this.titleFrameKey = key;
    this.onTitleFrameChange(frame);
  }

  getPanelTitleProgress() {
    if (!this.panelTitleOpening) return 1;
    const progressX = this.panelTitleStartScaleX >= 1
      ? 1
      : (this.panel.scale.x - this.panelTitleStartScaleX) / (1 - this.panelTitleStartScaleX);
    const progressY = this.panelTitleStartScaleY >= 1
      ? 1
      : (this.panel.scale.y - this.panelTitleStartScaleY) / (1 - this.panelTitleStartScaleY);
    return clamp01(Math.max(progressX, progressY));
  }

  getPanelVisualRect(panelRect) {
    return makePanelVisualRect(this.panel, panelRect, {
      progress: this.getPanelTitleProgress(),
      radius: 48,
    });
  }

  notifyPanelTitleFrame(panelRect) {
    if (!panelRect) {
      this.notifyTitleFrame(null);
      return;
    }
    this.notifyTitleFrame(this.getPanelVisualRect(panelRect));
  }

  cancelOpeningPanelReadyCheck() {
    if (this.openingPanelReadyFrame == null) return;
    globalThis.cancelAnimationFrame?.(this.openingPanelReadyFrame);
    this.openingPanelReadyFrame = null;
  }

  markOpeningPanelReady(sessionToken) {
    const markedReady = this.folderTransitions.markPanelReady(sessionToken);
    const isPanelReady = this.folderTransitions.activeOpenSession?.panelReady === true;
    if (!markedReady && !isPanelReady) return false;
    this.cancelOpeningPanelReadyCheck();
    if (this.openingGhostSessionToken === sessionToken) {
      this.openingGhosts.finishTransition({ sessionToken });
    }
    return true;
  }

  scheduleOpeningPanelReadyCheck(sessionToken, panelRect) {
    this.cancelOpeningPanelReadyCheck();
    const check = () => {
      this.openingPanelReadyFrame = null;
      if (!this.folderTransitions.isCurrentOpen(sessionToken)) return;
      this.notifyPanelTitleFrame(panelRect);
      this.markRegisteredBoundsDirty();
      if (this.getPanelTitleProgress() >= FOLDER_PANEL_READY_PROGRESS) {
        this.markOpeningPanelReady(sessionToken);
        return;
      }
      if (typeof globalThis.requestAnimationFrame === "function") {
        this.openingPanelReadyFrame = globalThis.requestAnimationFrame(check);
      }
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      this.openingPanelReadyFrame = globalThis.requestAnimationFrame(check);
      return;
    }
    check();
  }

  enableClosingFrameMask() {
    enableClosingFrameMaskState(this);
  }

  drawClosingFrameMask(rect) {
    drawClosingFrameMaskState(this, rect);
  }

  drawFrameGhost(rect, options = {}) {
    drawFrameGhostState(this, rect, options);
  }

  startFrameGhost(fromRect, toRect, options = {}) {
    startFrameGhostState(this, fromRect, toRect, options);
  }

  refreshPageTrackMask() {
    this.pageTrack.mask = null;
    this.pageTrack.mask = this.pageMask;
  }

  drawPageMask(mask, rect) {
    if (!mask || !rect) return;
    mask.clear()
      .rect(rect.left, rect.top, rect.width, rect.height)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  drawPageDot(dot) {
    dot.clear()
      .circle(0, 0, FOLDER_PAGE_DOTS_SIZE / 2)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  setPageDotHover(dot, active, hovered, options = {}) {
    const visual = getFolderPageDotVisualState({ active, hovered });
    this.describePageDotTargets(dot);
    this.drawPageDot(dot);
    if (options.immediate) {
      killMotionOf(dot, "alpha");
      killMotionOf(dot.scale);
      dot.alpha = visual.alpha;
      dot.scale.set(visual.scale);
      return;
    }
    transition(dot)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ alpha: visual.alpha })
      .start();
    transition(dot.scale)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ x: visual.scale, y: visual.scale })
      .start();
  }

  updatePageDots(state, geometry) {
    const pageCount = Array.isArray(state.folderPages) ? state.folderPages.length : 0;
    if (!state.folderPageDotsVisible || pageCount <= 1) {
      this.clearPageDots();
      return;
    }
    const frame = getFolderPageDotsFrame(geometry);
    if (!frame) {
      this.clearPageDots();
      return;
    }
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = true;
    this.pageDotsLayer.eventMode = "static";
    this.pageDotsLayer.cursor = "default";
    this.pageDotsLayer.hitArea = new Rectangle(frame.left, frame.top, frame.width, frame.height);
    const totalWidth = pageCount * FOLDER_PAGE_DOTS_SIZE + (pageCount - 1) * FOLDER_PAGE_DOTS_GAP;
    const startX = frame.left + frame.width / 2 - totalWidth / 2 + FOLDER_PAGE_DOTS_SIZE / 2;
    const centerY = frame.top + FOLDER_PAGE_DOTS_HIT_HEIGHT / 2;
    for (let index = 0; index < pageCount; index += 1) {
      const dot = new Graphics();
      const isActive = index === state.folderPageIndex;
      this.describePageDotTargets(dot, index, state, isActive);
      this.setPageDotHover(dot, isActive, false, { immediate: true });
      dot.position.set(startX + index * (FOLDER_PAGE_DOTS_SIZE + FOLDER_PAGE_DOTS_GAP), centerY);
      dot.eventMode = "static";
      dot.cursor = "pointer";
      dot.hitArea = new Rectangle(-8, -8, FOLDER_PAGE_DOTS_SIZE + 16, FOLDER_PAGE_DOTS_SIZE + 16);
      dot.on("pointerover", () => this.setPageDotHover(dot, isActive, true));
      dot.on("pointerout", () => this.setPageDotHover(dot, isActive, false));
      dot.on("pointerdown", (event) => {
        event.stopPropagation?.();
        state.folderPageIndexCommit?.(index);
      });
      this.pageDotsLayer.addChild(dot);
    }
  }

  describeMotionTargets(state = {}, geometry = {}) {
    const folder = state.renderedFolder || {};
    const folderId = folder.id ?? this.currentFolderId ?? null;
    const label = folder.name || folderId || "Folder overlay";
    const base = {
      folderId,
      kind: "FolderOverlay",
      label,
      layer: "folder",
    };
    motionRuntime.describeTarget(this.panel, {
      ...base,
      kind: "FolderPanel",
      overlayTarget: this.panel,
      sourceLabel: "folder.panel",
      targetPart: "panel",
    });
    motionRuntime.describeTarget(this.panel?.scale, {
      ...base,
      kind: "FolderPanel",
      overlayTarget: this.panel,
      sourceLabel: "folder.panelScale",
      targetPart: "panel.scale",
    });
    motionRuntime.describeTarget(this.pageTrack, {
      ...base,
      kind: "PageTrack",
      overlayTarget: this.pageTrack,
      pageIndex: state.folderPageIndex ?? null,
      pageSpan: geometry.grid?.width ?? null,
      sourceLabel: "folder.pageTrack",
      targetPart: "pageTrack",
    });
    motionRuntime.describeTarget(this.pageDotsLayer, {
      ...base,
      kind: "PageDotsLayer",
      overlayTarget: this.pageDotsLayer,
      sourceLabel: "folder.pageDotsLayer",
      targetPart: "pageDotsLayer",
    });
  }

  describePageDotTargets(dot, index = dot?.__motionDebugMetadata?.index, state = null, active = dot?.__motionDebugMetadata?.active) {
    if (!dot) return;
    const existing = dot.__motionDebugMetadata;
    let metadata = !state && existing ? existing : null;
    if (!metadata) {
      const folder = state?.renderedFolder || {};
      metadata = {
        active: active ?? null,
        folderId: folder.id ?? this.currentFolderId ?? null,
        index: index ?? null,
        kind: "PageDot",
        label: `Folder page dot ${index ?? ""}`.trim(),
        layer: "folder",
        pageIndex: state?.folderPageIndex ?? null,
      };
    }
    dot.__motionDebugMetadata = metadata;
    motionRuntime.describeTarget(dot, {
      ...metadata,
      overlayTarget: dot,
      sourceLabel: "folder.pageDot",
      targetPart: "pageDot",
    });
    motionRuntime.describeTarget(dot.scale, {
      ...metadata,
      overlayTarget: dot,
      sourceLabel: "folder.pageDot.scale",
      targetPart: "pageDot.scale",
    });
  }

  rebuildPageTrackMask() {
    if (!this.pageMaskRect || !this.panel || this.destroyed) {
      this.refreshPageTrackMask();
      return;
    }
    const previousMask = this.pageMask;
    const nextMask = new Graphics();
    this.drawPageMask(nextMask, this.pageMaskRect);
    const previousIndex = this.panel.children.indexOf(previousMask);
    this.pageTrack.mask = null;
    if (previousIndex >= 0) {
      this.panel.removeChild(previousMask);
      this.panel.addChildAt(nextMask, previousIndex);
    } else {
      const trackIndex = this.panel.children.indexOf(this.pageTrack);
      this.panel.addChildAt(nextMask, Math.max(0, trackIndex));
    }
    this.pageMask = nextMask;
    this.pageTrack.mask = this.pageMask;
    previousMask?.destroy?.();
  }

  getOpeningGeometrySnapshot(sessionToken, state, targetKey, targetX, targetY, panelRect, sourceRect, options = {}) {
    if (!sessionToken) return null;
    const folderId = state.renderedFolder?.id || null;
    const layoutKey = makeFolderOpeningGeometryLayoutKey({
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetKey,
    });
    const existing = this.folderTransitions.getOpenGeometrySnapshot(sessionToken);
    if (existing?.layoutKey === layoutKey && existing.folderId === folderId) return existing;
    const snapshot = makeFolderOpeningGeometrySnapshot({
      folderId,
      folderRect: sourceRect,
      getPreviewChildRect: options.getPreviewChildRect,
      layoutKey,
      panelRect,
      previewSlots: options.previewSlots,
      sessionToken,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetKey,
      targetX,
      targetY,
    });
    this.folderTransitions.setOpenGeometrySnapshot(sessionToken, snapshot);
    return snapshot;
  }

  animatePanel(state, targetX, targetY, panelRect, sourceRect = null, options = {}) {
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    const folderId = state.renderedFolder?.id || null;
    const markBoundsDirty = () => this.markRegisteredBoundsDirty();
    const isNewPanelSource = this.currentFolderId !== folderId;
    if (isClosing) {
      this.folderTransitions.cancelOpen();
      this.cancelOpeningPanelReadyCheck();
      this.panelOpenTargetKey = null;
      this.panelAlphaTarget = null;
    }
    if (isNewPanelSource) {
      this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, { panelProps: "x,y,alpha", scaleProps: "x,y" });
      this.currentFolderId = folderId;
      this.panelOpenTargetKey = null;
      this.panelAlphaTarget = null;
      if (sourceRect) {
        const sourceLocalRect = clientRectToStageVisualRect(sourceRect, state.stageRect);
        this.panel.position.set(sourceLocalRect.left + sourceLocalRect.width / 2, sourceLocalRect.top + sourceLocalRect.height / 2);
        this.panel.scale.set(Math.max(0.08, sourceLocalRect.width / panelRect.width), Math.max(0.08, sourceLocalRect.height / panelRect.height));
      } else {
        this.panel.position.set(targetX, targetY + 36);
        this.panel.scale.set(0.12, 0.16);
      }
      this.panel.alpha = 0.94;
      this.panelTitleOpening = !isClosing;
      this.panelTitleStartScaleX = this.panel.scale.x;
      this.panelTitleStartScaleY = this.panel.scale.y;
      if (!isClosing) this.notifyPanelTitleFrame(panelRect);
    }

    if (state.isFolderClosing && sourceRect) {
      this.panelTitleOpening = false;
      this.resetPanelMotion(FOLDER_PANEL_HANDOFF_SNAP_REASON);
      this.panel.alpha = 0;
      return;
    }

    if (isClosing && sourceRect) {
      this.panelTitleOpening = false;
      this.resetPanelMotion(FOLDER_PANEL_CLOSE_REASON, { panelProps: "x,y", scaleProps: "x,y" });
      const sourceLocalRect = clientRectToStageVisualRect(sourceRect, state.stageRect);
      transition(this.panel)
        .preset("folderPanelClose")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: state.isFolderAppLaunchClosing ? 0 : 0.8 })
        .start();
      springPanelGeometry(this.panel, {
        scaleX: Math.max(0.08, sourceLocalRect.width / panelRect.width),
        scaleY: Math.max(0.08, sourceLocalRect.height / panelRect.height),
        x: sourceLocalRect.left + sourceLocalRect.width / 2,
        y: sourceLocalRect.top + sourceLocalRect.height / 2,
      }, { onFrame: markBoundsDirty });
      return;
    }

    if (isClosing) {
      this.panelTitleOpening = false;
      this.resetPanelMotion(FOLDER_PANEL_CLOSE_REASON, { panelProps: "x,y", scaleProps: "x,y" });
      transition(this.panel)
        .preset("folderClose")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0 })
        .start();
      springPanelGeometry(this.panel, {
        scaleX: 1.08,
        scaleY: 1.08,
        x: targetX,
        y: targetY,
      }, { onFrame: markBoundsDirty });
      return;
    }

    const targetKey = makeFolderPanelTargetKey(folderId, targetX, targetY, panelRect);
    const shouldOwnOpenSession = isNewPanelSource || Boolean(this.folderTransitions.activeOpenSession);
    const { session } = shouldOwnOpenSession
      ? this.folderTransitions.beginOpen(folderId, targetKey, { forceNew: isNewPanelSource })
      : { session: null };
    const sessionToken = session?.token || null;
    const openingGeometrySnapshot = this.getOpeningGeometrySnapshot(
      sessionToken,
      state,
      targetKey,
      targetX,
      targetY,
      panelRect,
      sourceRect,
      options
    );
    const updateOpeningPanelFrame = () => {
      this.notifyPanelTitleFrame(openingGeometrySnapshot?.panelRect || panelRect);
      markBoundsDirty();
      if (!sessionToken) return;
      if (this.getPanelTitleProgress() < FOLDER_PANEL_READY_PROGRESS) return;
      this.markOpeningPanelReady(sessionToken);
    };
    if (this.panelAlphaTarget !== 1) {
      this.panelAlphaTarget = 1;
      transition(this.panel)
        .preset("folderOpen")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }

    if (this.panelOpenTargetKey !== targetKey) {
      if (sessionToken) this.folderTransitions.markPanelPending(sessionToken, targetKey);
      this.panelOpenTargetKey = targetKey;
      this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, {
        panelProps: "x,y",
        scaleProps: "x,y",
        stopSprings: false,
      });
      springPanelGeometry(this.panel, {
        scaleX: 1,
        scaleY: 1,
        x: targetX,
        y: targetY,
      }, { onFrame: updateOpeningPanelFrame, spring: folderPanelOpenSpring });
      if (sessionToken) this.scheduleOpeningPanelReadyCheck(sessionToken, openingGeometrySnapshot?.panelRect || panelRect);
    }
    updateOpeningPanelFrame();
    return {
      openingGeometrySnapshot,
      sessionToken,
    };
  }

  drawPanel(panel) {
    this.panelMaterial.clear()
      .roundRect(0, 0, panel.width, panel.height, 48)
      .fill({ color: 0xf7f8ff, alpha: 0.26 })
      .stroke({ color: 0xffffff, alpha: 0.24, width: 1 });
  }

  bindFakeRefs(state, geometry) {
    const meta = { folderId: state.renderedFolder?.id || null };
    const panelElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.panel, meta);
    const gridElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.grid, meta);
    if (state.folderPanelRef) state.folderPanelRef.value = panelElement;
    if (state.folderViewportRef) state.folderViewportRef.value = gridElement;
    if (typeof state.setFolderPageRef === "function") {
      state.setFolderPageRef(gridElement, state.folderPageIndex || 0);
    }
  }

  handlePointerDown(event) {
    const native = event?.nativeEvent || event;

    const clientX = native.clientX ?? (this.stageRect?.left || 0) + (event?.global?.x || 0);
    const clientY = native.clientY ?? (this.stageRect?.top || 0) + (event?.global?.y || 0);
    const localPoint = clientPointToStageVisualPoint({ x: clientX, y: clientY }, this.stageRect) || { x: 0, y: 0 };
    const { x, y } = localPoint;
    if (this.isClosing) {
      const closeTarget = this.stableFolderCloseTarget;
      const hitRects = getClosingPresentationStageHitRects(this);
      if (this.isUserFolderClosing &&
        closeTarget?.folderId &&
        hitRects.some((rect) => isPointInRect(x, y, rect))) {
        native.preventDefault?.();
        native.stopPropagation?.();
        this.onClosingFolderPointerDown(closeTarget.folderId, native);
      }
      return;
    }

    native.preventDefault?.();
    native.stopPropagation?.();

    const panel = this.panelGeometry;
    if (!panel) return;
    if (x < panel.left || x > panel.left + panel.width || y < panel.top || y > panel.top + panel.height) {
      this.onOutsidePointerDown(native);
      return;
    }
    this.onPanelPointerDown(native);
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  getVisualDebugSnapshot() {
    return {
      openingGeometry: makeOpeningGeometryDebugSnapshot(
        this.folderTransitions?.activeOpenSession || null,
        this.currentOpeningGeometrySnapshot || null,
        this.panel
      ),
    };
  }

  destroy(options) {
    this.teardownTransientState({
      clearDetachedClosingVisuals: true,
      clearVisualCommitQueue: true,
    });
    killAllMotion(this.panel, { reason: "destroyed" });
    killAllMotion(this.pageTrack, { reason: "destroyed" });
    this.clearPageDots();
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    stopTargetSprings(this.pageTrack, { reason: "destroyed" });
    stopTargetSprings(this.panel, { reason: "destroyed" });
    stopTargetSprings(this.panel.scale, { reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
