import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import { getFolderGridMetrics, getFolderPanelGeometry, makeRect, parseRepeatCount, readPx } from "../geometry/gridGeometry.js";
import {
  clearFrameGhost as clearFrameGhostState,
  drawClosingFrameMask as drawClosingFrameMaskState,
  drawFrameGhost as drawFrameGhostState,
  enableClosingFrameMask as enableClosingFrameMaskState,
  ensureClosingFrameMaskState,
  getFrameRadius,
  retargetFrameGhost as retargetFrameGhostState,
  startFrameGhost as startFrameGhostState,
} from "./folderFrameGhost.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import {
  applyClosingHandoffOnlyOverlayState,
  applyClosingPresentationOverlayState,
  getClosingPresentationStageHitRects,
} from "./folderClosingHandoff.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import {
  FolderHandoffCoordinator,
  makeFolderPanelTargetKey,
} from "./folderHandoffCoordinator.js";
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
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
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
import { resolveFolderIconRenderSize } from "./folderIconSizing.js";
import { makeIconRect, makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import { makeIconVisualSpec, makeIconVisualSpecFromNodeState } from "./iconVisualSpec.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  isPageTrackMotionActive,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";
import { isLayoutTargetChanged } from "./desktopRenderPlan.js";
import { ensureLayerTransitionPort } from "./layerTransitionPort.js";

const PAGE_DOT_BLEND_DURATION = 0.08;
const PAGE_DOT_BLEND_EASE = "power2.out";
const PAGE_DOTS_REVEAL_DURATION = 0.12;
const PAGE_DOTS_REVEAL_EASE = "power2.out";
const FOLDER_ICON_EXIT_REASON = "folder-icon-exit";
const FOLDER_OVERLAY_CLEAR_REASON = "folder-overlay-clear";
const FOLDER_PAGE_TRACK_REPLACE_REASON = "folder-page-track-replace";
const FOLDER_PANEL_CLOSE_REASON = "folder-panel-close";
const FOLDER_PANEL_DETACHED_CLOSE_REASON = "folder-panel-detached-close";
const FOLDER_PANEL_HANDOFF_SNAP_REASON = "folder-panel-handoff-snap";
const FOLDER_PANEL_OPEN_REASON = "folder-panel-open";
const FOLDER_RESIZE_LAYOUT_REASON = "folder-resize-layout";
const FOLDER_DRAG_HANDOFF_LAYOUT_REASON = "folder-drag-handoff-layout";
const FOLDER_PANEL_ZOOM_FADE_REASON = "folder-panel-zoom-fade";
const FOLDER_RESIZE_SYNC_MIN_RENDERS = 2;
const FOLDER_PANEL_READY_PROGRESS = 0.985;
const MAX_DETACHED_CLOSING_VISUALS = 2;
const DETACHED_CLOSING_FRAME_TAIL_DURATION = 0.04;
const DETACHED_CLOSING_FALLBACK_DURATION = 0.22;
const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

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

function readProgress01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp01(number);
}

function lerpNumber(from, to, progress) {
  return from + (to - from) * progress;
}

function getPanelOpenStartGeometry(targetX, targetY, panelRect, sourceRect = null, stageRect = null) {
  if (sourceRect) {
    const sourceLocalRect = clientRectToStageVisualRect(sourceRect, stageRect);
    return {
      scaleX: Math.max(0.08, sourceLocalRect.width / panelRect.width),
      scaleY: Math.max(0.08, sourceLocalRect.height / panelRect.height),
      x: sourceLocalRect.left + sourceLocalRect.width / 2,
      y: sourceLocalRect.top + sourceLocalRect.height / 2,
    };
  }
  return {
    scaleX: 0.12,
    scaleY: 0.16,
    x: targetX,
    y: targetY + 36,
  };
}

function roundDebugValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}

function readSignatureValue(value) {
  if (value == null) return "";
  const number = Number(value);
  if (Number.isFinite(number)) return roundDebugValue(number);
  return String(value);
}

function appendRectSignature(parts, prefix, rect) {
  parts.push(
    `${prefix}.left:${readSignatureValue(rect?.left)}`,
    `${prefix}.top:${readSignatureValue(rect?.top)}`,
    `${prefix}.width:${readSignatureValue(rect?.width)}`,
    `${prefix}.height:${readSignatureValue(rect?.height)}`
  );
}

function makeResizeLayoutSignature(state, geometry) {
  const parts = [
    `stage:${readSignatureValue(state.width)}x${readSignatureValue(state.height)}`,
    `cols:${state.folderGridStyle?.gridTemplateColumns || ""}`,
    `rows:${state.folderGridStyle?.gridTemplateRows || ""}`,
    `shell:${state.folderPanelStyle?.["--folder-shell-min-height"] || ""}`,
    `icon:${state.folderPanelStyle?.["--folder-icon-size"] || ""}`,
    `cell:${state.folderPanelStyle?.["--folder-icon-cell-height"] || ""}`,
    `rowGap:${state.folderPanelStyle?.["--folder-row-gap"] || ""}`,
  ];
  appendRectSignature(parts, "panel", geometry?.panel);
  appendRectSignature(parts, "grid", geometry?.grid);
  return parts.join("|");
}

function makeResizeLayoutMetricsSnapshot(state = {}, geometry = null) {
  const committedFolderPageIndex = state.folderPageIndex ?? 0;
  const visualFolderPageIndex = state.visualFolderPageIndex ?? committedFolderPageIndex;
  const cols = parseRepeatCount(state.folderGridStyle?.gridTemplateColumns, 5);
  const fallbackRows = Math.max(1, Math.ceil((state.folderPages?.[visualFolderPageIndex] || []).length / cols));
  const fixedCellHeight = readPx(state.folderPanelStyle?.["--folder-icon-cell-height"], 0);
  const rowGap = readPx(state.folderPanelStyle?.["--folder-row-gap"], 18);
  const rows = parseRepeatCount(state.folderGridStyle?.gridTemplateRows, fallbackRows);
  const cellWidth = Number(geometry?.grid?.width) > 0 ? Number(geometry.grid.width) / cols : null;
  const availableCellHeight = Number(geometry?.grid?.height) > 0
    ? Math.max(1, (Number(geometry.grid.height) - rowGap * Math.max(0, rows - 1)) / rows)
    : null;
  const cellHeight = fixedCellHeight > 0 && availableCellHeight
    ? Math.min(fixedCellHeight, availableCellHeight)
    : fixedCellHeight > 0
      ? fixedCellHeight
      : availableCellHeight;
  return {
    cols,
    fixedCellHeight,
    iconSize: resolveFolderIconRenderSize({
      cellHeight,
      cellWidth,
      fallbackSize: state.iconSize,
      requestedSize: readPx(state.folderPanelStyle?.["--folder-icon-size"], state.iconSize),
    }),
    rowGap,
    rows,
  };
}

function makeResizeLayoutMetricsKey(metrics = {}) {
  return [
    metrics.cols,
    metrics.rows,
    metrics.fixedCellHeight,
    metrics.iconSize,
    metrics.rowGap,
  ].map(readSignatureValue).join(":");
}

function makeResizeVisualTargetKey(geometry, layoutMetrics) {
  return `${makeFolderGeometryTargetKey(geometry)}|layout:${makeResizeLayoutMetricsKey(layoutMetrics)}`;
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
    iconBoundsRegistry,
    iconSize,
    index,
    isInteractivePage,
    isPrewarm,
    item,
    node,
    pageIndex,
    provisionalLayoutTarget = false,
    stableIconSize = iconSize,
    stableTargetCenter,
    stableVisualSpec = null,
    stageHeight,
    stageRect,
    stageWidth,
    targetCenter,
  } = options;
  const iconBounds = node.getIconBounds(stageRect);
  if (!isInteractivePage || isPrewarm) return iconBounds;
  const visualSpec = makeIconVisualSpecFromNodeState(node.state);
  const meta = {
    area: "folder",
    folderId,
    id: item.id,
    index,
    item,
    pageIndex,
    provisionalLayoutTarget: provisionalLayoutTarget === true,
    visualSpec,
  };
  const stableCenter = stableTargetCenter || targetCenter;
  const stableSpec = stableVisualSpec || visualSpec;
  const safeStableIconSize = Math.max(1, Number(stableIconSize) || Number(iconSize) || Number(stableSpec?.iconSize) || 1);
  iconBoundsRegistry.registerBounds(
    BOUNDS_KIND.LAUNCH,
    BOUNDS_VARIANT.RENDERED,
    { area: "folder", folderId, id: item.id, pageIndex },
    iconBounds,
    meta
  );
  iconBoundsRegistry.registerBounds(
    BOUNDS_KIND.LAUNCH,
    BOUNDS_VARIANT.LIVE_TARGET,
    { area: "folder", folderId, id: item.id, pageIndex },
    makeTargetIconBounds(stageRect, stageWidth, stageHeight, targetCenter.x, targetCenter.y, iconSize),
    meta
  );
  iconBoundsRegistry.registerBounds(
    BOUNDS_KIND.LAUNCH,
    BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
    { area: "folder", folderId, id: item.id, pageIndex },
    makeIconRect(stableCenter.x, stableCenter.y, safeStableIconSize),
    {
      ...meta,
      stageHeight,
      stageRect,
      stageWidth,
      visualSpec: stableSpec,
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

function getDesktopPageTrackLiveX(state = {}) {
  const liveX = Number(state.desktopPageTrackOffset?.liveX);
  if (Number.isFinite(liveX)) return liveX;
  const targetX = Number(state.desktopPageTrackOffset?.targetX);
  return Number.isFinite(targetX) ? targetX : 0;
}

function addXOffsetToFrameState(frameState, offsetX) {
  if (!frameState || !Number.isFinite(offsetX) || offsetX === 0) return frameState;
  const left = Number(frameState.left);
  return {
    ...frameState,
    left: Number.isFinite(left) ? left + offsetX : frameState.left,
  };
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
  const duration = motionPresets.folderClose.duration + DETACHED_CLOSING_FRAME_TAIL_DURATION;
  const finishGeometry = tracker.add();
  const update = () => drawDetachedFrame(graphics, frame);
  update();
  const geometryControl = motion(frame)
    .duration(duration)
    .ease(motionPresets.folderClose.ease)
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
      onCancel: finishGeometry,
      onUpdate: update,
    })
    .start();
  addDetachedVisualMotionControl(visual, geometryControl);
}

function animateDetachedClosingGhost(ghost, tracker, visual = null, detachedMotion = null) {
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
  const duration = Math.max(0.01, Number(detachedMotion?.duration) || motionPresets.folderClose.duration);
  const hasGeometryTarget = Number.isFinite(Number(detachedMotion?.x)) &&
    Number.isFinite(Number(detachedMotion?.y)) &&
    Number.isFinite(Number(detachedMotion?.scale));
  const finishDisplay = tracker.add();

  if (hasGeometryTarget) {
    const displayControl = motion(ghost)
      .duration(duration)
      .ease(motionPresets.folderClose.ease)
      .overlay()
      .interrupt("retarget")
      .to({
        alpha: Number.isFinite(Number(detachedMotion.alpha)) ? detachedMotion.alpha : ghost.alpha,
        x: detachedMotion.x,
        y: detachedMotion.y,
        onComplete: finishDisplay,
        onCancel: finishDisplay,
      })
      .start();
    addDetachedVisualMotionControl(visual, displayControl);
    const finishScale = tracker.add();
    const scaleControl = motion(ghost.scale)
      .duration(duration)
      .ease(motionPresets.folderClose.ease)
      .overlay()
      .interrupt("retarget")
      .to({
        x: detachedMotion.scale,
        y: detachedMotion.scale,
        onComplete: finishScale,
        onCancel: finishScale,
      })
      .start();
    addDetachedVisualMotionControl(visual, scaleControl);
    return;
  }

  const fallbackControl = motion(ghost)
    .duration(DETACHED_CLOSING_FALLBACK_DURATION)
    .ease(motionPresets.folderClose.ease)
    .overlay()
    .interrupt("retarget")
    .to({
      alpha: 0,
      onComplete: finishDisplay,
      onCancel: finishDisplay,
    })
    .start();
  addDetachedVisualMotionControl(visual, fallbackControl);
}

function animateDetachedGeometryHold(tracker, visual = null) {
  const state = { progress: 0 };
  const finishGeometry = tracker.add();
  const holdControl = motion(state)
    .duration(motionPresets.folderClose.duration + DETACHED_CLOSING_FRAME_TAIL_DURATION)
    .ease(motionPresets.folderClose.ease)
    .overlay()
    .interrupt("retarget")
    .to({
      progress: 1,
      onComplete: finishGeometry,
      onCancel: finishGeometry,
    })
    .start();
  addDetachedVisualMotionControl(visual, holdControl);
}

function springFolderIconLayoutPosition(node, target, refreshBounds) {
  motion(node)
    .layout()
    .spring(motionSprings.layout)
    .interrupt("retarget")
    .to({
      onComplete: refreshBounds,
      onUpdate: refreshBounds,
      x: target.x,
      y: target.y,
    })
    .start();
}

function isFolderIconLayoutCoveredByVisual(node, hasVisualOwner = false) {
  return Boolean(
    hasVisualOwner ||
    node?.visible === false ||
    node?.state?.dragging ||
    node?.state?.ghosted
  );
}

function motionSpringTo(target, vars, config, options = {}) {
  motion(target)
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
  const springConfig = options.spring || motionSprings.handoff;
  motionSpringTo(panel, { x: target.x, y: target.y }, springConfig, springOptions);
  motionSpringTo(panel.scale, { x: target.scaleX, y: target.scaleY }, springConfig, springOptions);
}

function cloneFolderGeometry(geometry) {
  if (!geometry?.panel || !geometry?.grid) return null;
  return {
    panel: makeRect(geometry.panel.left, geometry.panel.top, geometry.panel.width, geometry.panel.height),
    grid: makeRect(geometry.grid.left, geometry.grid.top, geometry.grid.width, geometry.grid.height),
    sidePadding: Number(geometry.sidePadding) || 0,
  };
}

function makeResizeGeometryState(geometry, layoutMetrics = null) {
  if (!geometry?.panel || !geometry?.grid) return null;
  const state = {
    gridHeight: geometry.grid.height,
    gridLeft: geometry.grid.left,
    gridTop: geometry.grid.top,
    gridWidth: geometry.grid.width,
    panelHeight: geometry.panel.height,
    panelLeft: geometry.panel.left,
    panelTop: geometry.panel.top,
    panelWidth: geometry.panel.width,
    sidePadding: Number(geometry.sidePadding) || 0,
  };
  if (layoutMetrics) {
    state.fixedCellHeight = Number(layoutMetrics.fixedCellHeight) || 0;
    state.iconSize = Number(layoutMetrics.iconSize) || 0;
    state.rowGap = Number(layoutMetrics.rowGap) || 0;
    state.rows = Number(layoutMetrics.rows) || 1;
  }
  return state;
}

function makeResizeGeometryTarget(geometry, layoutMetrics = null) {
  return makeResizeGeometryState(geometry, layoutMetrics) || {};
}

function makeGeometryFromResizeState(state) {
  if (!state) return null;
  return {
    panel: makeRect(state.panelLeft, state.panelTop, Math.max(1, state.panelWidth), Math.max(1, state.panelHeight)),
    grid: makeRect(state.gridLeft, state.gridTop, Math.max(1, state.gridWidth), Math.max(1, state.gridHeight)),
    sidePadding: Number(state.sidePadding) || 0,
  };
}

function makeFolderGeometryTargetKey(geometry) {
  if (!geometry?.panel || !geometry?.grid) return "";
  return [
    geometry.panel.left,
    geometry.panel.top,
    geometry.panel.width,
    geometry.panel.height,
    geometry.grid.left,
    geometry.grid.top,
    geometry.grid.width,
    geometry.grid.height,
  ].map(readSignatureValue).join(":");
}

function makeLayoutMetricsFromResizeState(state, fallback = {}) {
  if (!state) return fallback;
  return {
    ...fallback,
    fixedCellHeight: Number.isFinite(Number(state.fixedCellHeight)) ? Number(state.fixedCellHeight) : fallback.fixedCellHeight,
    iconSize: Number.isFinite(Number(state.iconSize)) && Number(state.iconSize) > 0 ? Number(state.iconSize) : fallback.iconSize,
    rowGap: Number.isFinite(Number(state.rowGap)) ? Number(state.rowGap) : fallback.rowGap,
    rows: Number.isFinite(Number(state.rows)) && Number(state.rows) > 0 ? Number(state.rows) : fallback.rows,
  };
}

export class FolderOverlayLayer extends Container {
  constructor(options = {}) {
    super();
    this.panel = new Container();
    this.panelMaterial = new Graphics();
    this.panelContentLayer = new Container();
    this.panelClipMask = new Graphics();
    this.frameGhost = new Graphics();
    this.frameGhost.visible = false;
    this.closingFrameMask = new Graphics();
    this.pageMask = new Graphics();
    this.pageMaskRect = null;
    this.pageTrack = new Container();
    this.pageTrackMotion = createPageTrackMotionState();
    this.pageDotsLayer = new Container();
    this.pageDotsLayer.alpha = 0;
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
    this.folderIconLayoutTargets = new Map();
    this.iconBoundsRefreshers = new Map();
    this.openingGhostBoundsRefreshers = new Map();
    this.registeredBoundsDirty = false;
    this.registeredBoundsFlushQueued = false;
    this.onIconAction = options.onIconAction || (() => { });
    this.onClosingHandoffPrepare = options.onClosingHandoffPrepare || (() => { });
    this.onClosingHandoffReady = options.onClosingHandoffReady || (() => { });
    this.onClosingHandoffVisualRelease = options.onClosingHandoffVisualRelease || (() => { });
    this.isHandoffSourceVisible = options.isHandoffSourceVisible || (() => false);
    this.onInternalActivityChange = options.onInternalActivityChange || (() => { });
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => { });
    this.onPanelPointerDown = options.onPanelPointerDown || (() => { });
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => { });
    this.onTitleFrameChange = options.onTitleFrameChange || (() => { });
    this.onDesktopSourceGhostingChange = options.onDesktopSourceGhostingChange || (() => { });
    this.onRenderRequest = options.onRenderRequest || (() => { });
    this.showFolderTitle = options.showFolderTitle === true;
    if (!options.iconBoundsRegistry) throw new Error("FolderOverlayLayer requires iconBoundsRegistry");
    this.iconBoundsRegistry = options.iconBoundsRegistry;
    this.transitionPort = ensureLayerTransitionPort(this);
    this.folderHandoff = new FolderHandoffCoordinator(this);
    this.openingGhosts = new FolderOpeningGhostController(this, {
      ghostFactory: () => new IconNode(),
      handoffCoordinator: this.folderHandoff,
      transitionPort: this.transitionPort,
    });
    this.closingPreviewSwap = new FolderClosingPreviewSwapController(this, {
      containerFactory: () => new Container(),
      getIconTexture: (item, render, ghost) => getCachedIconTexture(item, render, ghost),
      graphicsFactory: () => new Graphics(),
      spriteFactory: () => new Sprite(),
      textFactory: (size) => new Text({ text: "", style: { align: "center", fill: 0xffffff, fontSize: size, lineHeight: size } }),
      handoffCoordinator: this.folderHandoff,
      transitionPort: this.transitionPort,
    });
    this.closingGhosts = new FolderClosingGhostController(this, {
      ghostFactory: () => new IconNode(),
      previewSwap: this.closingPreviewSwap,
      handoffCoordinator: this.folderHandoff,
      transitionPort: this.transitionPort,
    });
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.visualOwnership = options.visualOwnership || new FolderVisualOwnershipRegistry();
    this.ownedVisualTokens = new Set();
    this.openingPanelReadyFrame = null;
    this.panelAlphaTarget = null;
    this.panelOpenTargetKey = null;
    this.panelOpenProgressDriven = false;
    this.panelZoomFadeClosing = false;
    this.resizeLayoutSync = null;
    this.resizeLayoutSignature = null;
    this.resizeVisualGeometryState = null;
    this.resizeVisualGeometryMode = null;
    this.resizeVisualGeometryFinalMode = null;
    this.resizeVisualGeometryFinalTargetKey = null;
    this.resizeVisualGeometryTargetKey = null;
    this.resizeVisualLayoutStartMetrics = null;
    this.resizeVisualLayoutTargetMetrics = null;
    this.targetFolderGeometry = null;
    this.detachedClosingVisuals = [];
    this.closingDesktopPageTrackMirrorBaseline = null;
    this.closingDesktopPageTrackMirrorX = 0;
    this.nextDetachedClosingVisualToken = 1;
    this.nextClosingGhostToken = 1;
    this.titleFrameKey = null;
    this.pageDotsLayerRevealKey = null;
    this.panelTitleOpening = false;
    this.panelTitleStartScaleX = 1;
    this.panelTitleStartScaleY = 1;
    this.addChild(this.frameGhost);
    this.addChild(this.closingFrameMask);
    if (this.ownsDetachedClosingVisualLayer) this.addChild(this.detachedClosingVisualLayer);
    this.addChild(this.panel);
    this.panel.addChild(this.panelMaterial);
    this.panel.addChild(this.panelClipMask);
    this.panel.addChild(this.panelContentLayer);
    this.panelContentLayer.addChild(this.pageMask);
    this.panelContentLayer.addChild(this.pageTrack);
    this.panel.addChild(this.folderTitle);
    this.addChild(this.pageDotsLayer);
    this.addChild(this.openingGhostLayer);
    this.addChild(this.closingGhostLayer);
    this.addChild(this.closingPreviewSwapLayer);
    this.refreshPanelClipMask();
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
    this.finishResizeLayoutSyncFrame(synced);
    return resolved.targetGeometry || resolved.geometry;
  }

  isDesktopCloseZoomFadeState(state = {}) {
    return Boolean(
      state.isDesktopClosing &&
      state.isFolderZoomFadeClosing &&
      state.folderZoomFadeCloseReason === "desktop"
    );
  }

  getDesktopCloseDetachedFolderId(state = {}) {
    return state.renderedFolder?.id ||
      this.folderHandoff?.folderId ||
      this.currentFolderId ||
      null;
  }

  hasDesktopCloseDetachedVisual(folderId = null) {
    return (this.detachedClosingVisuals || []).some((visual) =>
      (!folderId || visual?.folderId === folderId) &&
      visual.releaseAfterDesktopClose === true &&
      !visual.destroyed &&
      !visual.handoffCommitted
    );
  }

  hasActiveDesktopCloseDetachedHandoff(state = {}) {
    if (state.isDesktopClosing !== true) return false;
    if (this.isDesktopCloseDetachedZoomFadeState(state)) return true;
    return this.hasDesktopCloseDetachedVisual(this.getDesktopCloseDetachedFolderId(state));
  }

  syncDesktopCloseDetachedHandoff(state = {}) {
    if (state.isDesktopClosing !== true) {
      this.requestDesktopCloseDetachedVisualRelease();
      return;
    }
    if (!this.isDesktopCloseDetachedZoomFadeState(state)) return;
    const folderId = this.getDesktopCloseDetachedFolderId(state);
    if (!folderId || this.hasDesktopCloseDetachedVisual(folderId)) return;
    this.detachClosingPresentationForDesktopClose(folderId);
  }

  isDesktopCloseDetachedZoomFadeState(state = {}) {
    return Boolean(this.isDesktopCloseZoomFadeState(state) && state.isFolderClosing);
  }

  requestDesktopCloseDetachedVisualRelease() {
    for (const visual of Array.from(this.detachedClosingVisuals || [])) {
      if (!visual?.releaseAfterDesktopClose || visual.destroyed || visual.handoffCommitted) continue;
      visual.desktopCloseReleaseRequested = true;
      if (visual.geometryComplete) this.clearDetachedClosingVisualNow(visual);
    }
  }

  applyDesktopCloseDetachedOverlayState() {
    applyClosingHandoffOnlyOverlayState(this);
    this.clearPageDots();
    return null;
  }

  prepareFolderOverlayState(state) {
    this.stageRect = state.stageRect;
    const isPrewarm = Boolean(state.prewarm);
    if (!isPrewarm) this.syncDesktopCloseDetachedHandoff(state);
    if (!isPrewarm) this.iconBoundsRegistry.clearBounds("folder");
    const keepClosingHandoff = this.closingGhosts.hasPendingHandoff();
    const keepDesktopCloseDetachedHandoff = !isPrewarm && this.hasActiveDesktopCloseDetachedHandoff(state);
    this.visible = Boolean(state.renderedFolder) || keepClosingHandoff || keepDesktopCloseDetachedHandoff;
    if (!state.renderedFolder) {
      this.clearRegisteredIconBounds();
      if (keepDesktopCloseDetachedHandoff) {
        return { done: true, result: this.applyDesktopCloseDetachedOverlayState() };
      }
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
      this.resizeLayoutSync = null;
      this.resizeLayoutSignature = null;
      this.resizeLayoutMetricsSnapshot = null;
      this.clearResizeVisualGeometry(FOLDER_OVERLAY_CLEAR_REASON);
      this.targetFolderGeometry = null;
      this.stableFolderCloseTarget = null;
      this.resetClosingDesktopPageTrackMirror();
      if (state.folderPanelRef) state.folderPanelRef.value = null;
      if (state.folderViewportRef) state.folderViewportRef.value = null;
      this.notifyTitleFrame(null);
      return { done: true, result: null };
    }
    if (keepDesktopCloseDetachedHandoff) {
      return { done: true, result: this.applyDesktopCloseDetachedOverlayState() };
    }
    this.panel.visible = true;
    this.closingPreviewSwap.ensureLayer();
    ensureClosingFrameMaskState(this);
    this.hitArea = new Rectangle(0, 0, state.width, state.height);
    const geometry = getFolderPanelGeometry({
      height: state.height,
      panelStyle: state.folderPanelStyle,
      width: state.width,
    });
    const targetLayoutMetrics = makeResizeLayoutMetricsSnapshot(state, geometry);
    const previousLayoutMetrics = this.resizeLayoutMetricsSnapshot
      ? { ...this.resizeLayoutMetricsSnapshot }
      : null;
    const sizeKey = `${state.width}x${state.height}`;
    const layoutSignature = makeResizeLayoutSignature(state, geometry);
    const sizeChanged = Boolean(this.sizeKey && this.sizeKey !== sizeKey);
    this.sizeKey = sizeKey;
    this.syncResizeLayoutState(state, sizeKey, layoutSignature, sizeChanged);
    this.resizeLayoutMetricsSnapshot = { ...targetLayoutMetrics };

    const renderState = state;
    const isClosing = Boolean(renderState.isFolderClosing || renderState.isFolderAppLaunchClosing);
    const wasClosing = Boolean(this.isClosing);
    const renderedFolderId = state.renderedFolder?.id || null;
    const hasPendingRenderedOpen = this.folderHandoff.activeOpenSession?.folderId === renderedFolderId &&
      this.folderHandoff.isRevealPending();
    if (wasClosing && !isClosing && this.currentFolderId === renderedFolderId && !hasPendingRenderedOpen) {
      this.currentFolderId = null;
    }
    const isNewFolder = !isPrewarm && this.currentFolderId !== state.renderedFolder?.id;
    this.isClosing = isClosing;
    this.isUserFolderClosing = Boolean(renderState.isFolderClosing);
    const previousGeometry = cloneFolderGeometry(this.targetFolderGeometry);
    this.panelGeometry = geometry.panel;
    this.targetFolderGeometry = cloneFolderGeometry(geometry);
    const folderId = state.renderedFolder.id;
    this.describeMotionTargets(renderState, geometry);
    if (this.folderHandoff.folderId && (this.folderHandoff.folderId !== folderId || !isClosing)) {
      this.detachClosingPresentationForOpen(folderId);
    }
    return {
      done: false,
      folderId,
      geometry,
      isClosing,
      isNewFolder,
      isPrewarm,
      previousGeometry,
      previousLayoutMetrics,
      resizeLayoutSignature: layoutSignature,
      state: renderState,
      targetLayoutMetrics,
      wasClosing,
    };
  }

  resolveFolderOverlayGeometry(context) {
    const { folderId, geometry: targetGeometry, isClosing, isNewFolder, isPrewarm, state, wasClosing } = context;
    const resizeLayoutSyncActive = this.isResizeLayoutSyncActive();
    const geometry = this.resolveResizeVisualGeometry(context) || targetGeometry;
    const targetGeometryKey = makeResizeVisualTargetKey(targetGeometry, context.targetLayoutMetrics);
    const resizeVisualGeometryActive = Boolean(
      this.resizeVisualGeometryState &&
      this.resizeVisualGeometryTargetKey === targetGeometryKey
    );
    const resizeVisualGeometryFinalFrame = Boolean(
      this.resizeVisualGeometryFinalTargetKey &&
      this.resizeVisualGeometryFinalTargetKey === targetGeometryKey
    );
    const resizeGeometryMode = resizeVisualGeometryActive
      ? this.resizeVisualGeometryMode
      : resizeVisualGeometryFinalFrame
        ? this.resizeVisualGeometryFinalMode
        : this.resizeLayoutSync?.mode || null;
    if (resizeVisualGeometryFinalFrame) {
      this.resizeVisualGeometryFinalTargetKey = null;
      this.resizeVisualGeometryFinalMode = null;
    }
    const overlayTargets = resolveFolderOverlayTargets({
      desktopPageTrackOffset: state.desktopPageTrackOffset,
      folder: state.renderedFolder,
      folderOpeningOriginBounds: state.folderOpeningOriginBounds,
      folderPageSize: state.folderPageSize,
      iconBoundsRegistry: this.iconBoundsRegistry,
      isClosing,
      previousStableFolderCloseTarget: this.stableFolderCloseTarget,
      wasClosing,
    });
    this.stableFolderCloseTarget = overlayTargets.stableFolderCloseTarget;
    const { folderClientRect, folderThumbClientRect, getOpeningPreviewChildClientRect, previewSlots } = overlayTargets;
    this.drawPanel(geometry.panel);
    this.syncResizeFrameGhostShell(geometry, {
      isClosing,
      resizeGeometryMode,
      resizeLayoutSyncActive,
      resizeVisualGeometryActive,
      resizeVisualGeometryFinalFrame,
    });
    if (resizeLayoutSyncActive) {
      this.rebuildPanelClipMask(geometry.panel);
    } else {
      this.drawPanelClipMask(geometry.panel);
      this.refreshPanelClipMask();
    }
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
        resizeLayoutSyncActive,
        resizeVisualGeometryActive,
        resizeVisualGeometryFinalFrame,
      })?.openingGeometrySnapshot || null;
    }

    this.folderTitle.text = state.renderedFolder.name || "新文件夹";
    this.folderTitle.visible = this.showFolderTitle;
    this.folderTitle.anchor.set(0.5);
    this.folderTitle.position.set(geometry.panel.width / 2, -34);

    const committedFolderPageIndex = state.folderPageIndex ?? 0;
    const visualFolderPageIndex = state.visualFolderPageIndex ?? committedFolderPageIndex;
    const hasFolderPageTurnState = Boolean(
      state.folderPageTrackScrub ||
      state.folderPageTurnToken != null ||
      visualFolderPageIndex !== committedFolderPageIndex
    );
    const targetLayoutMetrics = context.targetLayoutMetrics || makeResizeLayoutMetricsSnapshot(state, targetGeometry);
    const rawVisualLayoutMetrics = resizeVisualGeometryActive
      ? makeLayoutMetricsFromResizeState(this.resizeVisualGeometryState, targetLayoutMetrics)
      : targetLayoutMetrics;
    const cols = targetLayoutMetrics.cols;
    const rows = rawVisualLayoutMetrics.rows;
    const rowGap = rawVisualLayoutMetrics.rowGap;
    const fixedCellHeight = rawVisualLayoutMetrics.fixedCellHeight;
    const metrics = getFolderGridMetrics({ cols, fixedCellHeight, grid: geometry.grid, rowGap, rows });
    const iconSize = resolveFolderIconRenderSize({
      cellHeight: metrics.cellHeight,
      cellWidth: metrics.cellWidth,
      fallbackSize: state.iconSize,
      requestedSize: rawVisualLayoutMetrics.iconSize,
    });
    const visualLayoutMetrics = iconSize === rawVisualLayoutMetrics.iconSize
      ? rawVisualLayoutMetrics
      : { ...rawVisualLayoutMetrics, iconSize };
    const localGridLeft = geometry.grid.left - geometry.panel.left;
    const localGridTop = geometry.grid.top - geometry.panel.top;
    const localMetrics = { ...metrics, gridLeft: localGridLeft, gridTop: localGridTop };
    const stableMetrics = getFolderGridMetrics({
      cols,
      fixedCellHeight: targetLayoutMetrics.fixedCellHeight,
      grid: targetGeometry.grid,
      rowGap: targetLayoutMetrics.rowGap,
      rows: targetLayoutMetrics.rows,
    });
    const stableIconSize = resolveFolderIconRenderSize({
      cellHeight: stableMetrics.cellHeight,
      cellWidth: stableMetrics.cellWidth,
      fallbackSize: state.iconSize,
      requestedSize: targetLayoutMetrics.iconSize,
    });
    const stableVisualSpec = makeIconVisualSpec({
      cellHeight: stableMetrics.cellHeight,
      cellWidth: stableMetrics.cellWidth,
      compact: false,
      iconSize: stableIconSize,
      singleLineLabel: false,
      textless: state.isTextlessMode,
    });
    const stableLocalMetrics = {
      ...stableMetrics,
      gridLeft: targetGeometry.grid.left - targetGeometry.panel.left,
      gridTop: targetGeometry.grid.top - targetGeometry.panel.top,
    };
    this.pageMaskRect = getFolderPageMaskRect(geometry, localGridLeft, localGridTop);
    if (resizeLayoutSyncActive) {
      this.rebuildPageTrackMask();
    } else {
      this.drawPageMask(this.pageMask, this.pageMaskRect);
      this.refreshPageTrackMask();
    }
    const folderPageSpan = geometry.panel.width;
    const stableFolderPageSpan = targetGeometry.panel.width;
    const targetTrackX = -visualFolderPageIndex * folderPageSpan;
    const stableTargetTrackX = -visualFolderPageIndex * stableFolderPageSpan;
    const shouldSnapResizePageTrack = (resizeLayoutSyncActive || resizeVisualGeometryActive || resizeVisualGeometryFinalFrame) &&
      resizeGeometryMode !== "page-turn" &&
      !hasFolderPageTurnState;
    if ((isNewFolder && !isClosing) || shouldSnapResizePageTrack) {
      const reason = shouldSnapResizePageTrack ? FOLDER_RESIZE_LAYOUT_REASON : "replace";
      const killReason = shouldSnapResizePageTrack ? FOLDER_RESIZE_LAYOUT_REASON : FOLDER_PAGE_TRACK_REPLACE_REASON;
      cancelPageTrackMotion(this.pageTrackMotion, reason);
      killMotionOf(this.pageTrack, shouldSnapResizePageTrack ? "x" : null, { lane: "base", reason: killReason });
      this.pageTrack.x = targetTrackX;
      this.pageTrackMotion.key = null;
      this.pageTrackMotion.mode = "spring";
      this.pageTrackMotion.settleToken = null;
      this.pageTrackMotion.targetX = targetTrackX;
      this.markRegisteredBoundsDirty();
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
        pageIndex: visualFolderPageIndex,
        pageSpan: folderPageSpan,
        scrub: state.folderPageTrackScrub,
        sourceLabel: "folder.pageTrack",
        springConfig: motionSprings.layout,
      });
    }
    const { closeIconRect, closeThumbRect } = getStableFolderCloseRects({
      folderId,
      folderRect: folderClientRect,
      folderThumbRect: folderThumbClientRect,
      isClosing,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
    });

    if (!isPrewarm) this.bindFakeRefs(state, targetGeometry);
    const renderPlan = makeFolderOverlayRenderPlan({
      closeThumbRect,
      closingGhostKeys: this.folderHandoff.getGhostKeys(),
      cols,
      dragMeta: state.dragMeta,
      dragReleaseGhostId: state.dragReleaseGhostId,
      folderCloseIconGhosts: state.folderCloseIconGhosts,
      folderId,
      folderOpenIconGhosts: state.folderOpenIconGhosts,
      folderPageIndex: committedFolderPageIndex,
      folderPages: state.folderPages,
      folderPageSize: state.folderPageSize,
      folderPageSpan,
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
      openingGhostItemIds: this.folderHandoff.getOpeningGhostKeys(),
      previewSlots,
      rows,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stableFolderPageSpan,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
      stableGeometry: targetGeometry,
      stableLocalMetrics,
      stableTargetTrackX,
      stageHeight: state.height,
      stageWidth: state.width,
      targetTrackX,
      visualFolderPageIndex,
    });
    return {
      ...context,
      closeIconRect,
      closeThumbRect,
      folderClientRect,
      folderThumbClientRect,
      geometry,
      getOpeningPreviewChildClientRect,
      iconSize,
      previewSlots,
      renderPlan,
      resizeGeometryMode,
      resizeVisualGeometryActive,
      resizeVisualGeometryFinalFrame,
      stableIconSize,
      stableVisualSpec,
      targetGeometry,
      targetLayoutMetrics,
      visualLayoutMetrics,
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
      resizeGeometryMode,
      resizeVisualGeometryActive,
      resizeVisualGeometryFinalFrame,
      stableIconSize,
      stableVisualSpec,
      state,
    } = context;
    const resizeLayoutSyncActive = this.isResizeLayoutSyncActive();
    const shouldSnapIconLayoutForResize = Boolean(
      (resizeLayoutSyncActive || resizeVisualGeometryActive || resizeVisualGeometryFinalFrame) &&
      resizeGeometryMode !== "page-turn"
    );
    const hasProvisionalOpeningLayoutTarget = resizeGeometryMode === "opening" && resizeVisualGeometryActive;
    const hasProvisionalDragLayoutTarget = resizeVisualGeometryActive;
    const seen = new Set();
    const boundsRefreshers = new Map();
    const nextLayoutTargets = new Map();
    const openingGhostTargets = [];
    const closingGhostTargets = [];
    for (const entry of renderPlan.entries) {
      const { index, isInteractivePage, item, key, nodeState, pageIndex, stableTargetCenter, targetCenter, x, y } = entry;
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
      const visualKey = this.getIconNodeVisualKey(node, folderId);
      const hasVisualOwner = Boolean(visualKey && this.visualOwnership.hasOwner(visualKey));
      if (hasVisualOwner) node.visible = false;

      const stableBoundsTargetCenter = stableTargetCenter;
      const isDragHandoffItem = entry.isActiveDraggedItem || entry.isReleaseGhostItem;
      const provisionalBoundsTarget = isDragHandoffItem
        ? hasProvisionalDragLayoutTarget
        : hasProvisionalOpeningLayoutTarget && (stableBoundsTargetCenter === targetCenter || !stableTargetCenter);
      const refreshNodeBounds = () => registerFolderIconNodeBounds({
        folderId: state.renderedFolder.id,
        iconBoundsRegistry: this.iconBoundsRegistry,
        iconSize,
        index,
        isInteractivePage,
        isPrewarm,
        item,
        node,
        pageIndex,
        provisionalLayoutTarget: provisionalBoundsTarget,
        stableIconSize,
        stableTargetCenter: stableBoundsTargetCenter,
        stableVisualSpec,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
        targetCenter,
      });
      const iconBounds = refreshNodeBounds();
      if (isInteractivePage && !isPrewarm) boundsRefreshers.set(key, refreshNodeBounds);
      if (isNewNode) {
        motion(node)
          .preset("folderOpen", { delay: Math.min(0.18, index * 0.012), duration: 0.24 })
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 1 })
          .start();
      }
      const layoutTarget = { x, y };
      nextLayoutTargets.set(key, layoutTarget);
      const shouldSnapIconLayout = shouldSnapIconLayoutForResize &&
        (resizeGeometryMode !== "opening" || isFolderIconLayoutCoveredByVisual(node, hasVisualOwner));
      const shouldSnapDragHandoffLayout = entry.isActiveDraggedItem || entry.isReleaseGhostItem;
      if (shouldSnapIconLayout || shouldSnapDragHandoffLayout) {
        killMotionOf(node, "x,y", {
          lane: "base",
          reason: shouldSnapDragHandoffLayout ? FOLDER_DRAG_HANDOFF_LAYOUT_REASON : FOLDER_RESIZE_LAYOUT_REASON,
        });
        node.position.set(layoutTarget.x, layoutTarget.y);
        refreshNodeBounds();
      } else if (isNewNode || isLayoutTargetChanged(this.folderIconLayoutTargets?.get(key), layoutTarget)) {
        springFolderIconLayoutPosition(node, layoutTarget, refreshNodeBounds);
      }
      if (entry.openingGhostInput) {
        const openingGeometrySnapshot = this.currentOpeningGeometrySnapshot?.folderId === folderId
          ? this.currentOpeningGeometrySnapshot
          : null;
        const openingGhostTarget = makeOpeningGhostTarget({
          ...entry.openingGhostInput,
          folderId,
          folderRect: openingGeometrySnapshot?.folderRect || folderClientRect,
          getPreviewChildRect: openingGeometrySnapshot
            ? (item, previewSlotIndex) => getFolderOpeningPreviewChildRect(openingGeometrySnapshot, item, previewSlotIndex)
            : getOpeningPreviewChildClientRect,
          pageIndex,
        });
        const stableOpeningGhostTarget = hasProvisionalOpeningLayoutTarget && stableTargetCenter
          ? {
            ...openingGhostTarget,
            targetStageLayoutRect: makeIconRect(stableTargetCenter.x, stableTargetCenter.y, openingGhostTarget.iconSize),
          }
          : openingGhostTarget;
        openingGhostTargets.push({
          ...stableOpeningGhostTarget,
          provisionalLayoutTarget: hasProvisionalOpeningLayoutTarget,
        });
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
    this.folderIconLayoutTargets = nextLayoutTargets;
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
      resizeGeometryMode,
      seen,
      state,
      targetGeometry,
    } = context;
    this.syncClosingDesktopPageTrackMirror(state, folderId, isClosing);
    const openingFrameTargetRect = resizeGeometryMode === "opening" && targetGeometry?.panel
      ? targetGeometry.panel
      : geometry.panel;
    if (isNewFolder && !isClosing) {
      this.openingGhosts.start(state, openingGhostTargets, {
        frameSourceRect: folderThumbClientRect || folderClientRect,
        frameTargetRect: openingFrameTargetRect,
        sessionToken: this.folderHandoff.activeOpenToken,
      });
    } else if (!isClosing && (
      this.folderHandoff.hasActiveOpeningVisuals() ||
      (this.frameGhostState && this.frameGhostPhase === "opening")
    )) {
      this.openingGhosts.retarget(state, openingGhostTargets, {
        frameTargetRect: openingFrameTargetRect,
      });
    }
    if (!isNewFolder && !isClosing && state.folderOpenIconGhosts?.length && !this.folderHandoff.hasActiveOpeningVisuals()) {
      for (const ghost of state.folderOpenIconGhosts) {
        if (ghost?.key) state.completeFolderOpenIconGhost?.(ghost.key);
      }
    }
    if (state.isFolderClosing) {
      const closeFrameRect = this.getPanelVisualRect(geometry.panel) || geometry.panel;
      const closeOptions = {
        handoffRect: folderClientRect || closeIconRect,
        handoffTarget: this.stableFolderCloseTarget,
        previewSwapTargets: closingPreviewSwapTargets,
      };
      if (this.folderHandoff.folderId === folderId) {
        this.closingGhosts.retarget(state, closingGhostTargets, closeThumbRect, closeFrameRect, closeOptions);
      } else {
        this.closingGhosts.start(state, closingGhostTargets, closeThumbRect, closeFrameRect, closeOptions);
      }
    }
    if (!state.isFolderClosing && this.folderHandoff.folderId) {
      this.clearClosingFolderId();
      this.closingGhosts.clear();
    }

    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      killMotionOf(node, null, { reason: FOLDER_ICON_EXIT_REASON });
      killMotionOf(node, null, { lane: "base", reason: FOLDER_ICON_EXIT_REASON });
      motion(node)
        .preset("fade", { duration: 0.14 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0, onComplete: () => destroyDisplayObjectAfterFrame(node, { children: true }) })
        .start();
    }
    this.pageTrack.visible = !isClosing &&
      !this.folderHandoff.hasActiveCloseVisuals();
    if (!this.frameGhostState) {
      if (!isClosing) this.notifyPanelTitleFrame(geometry.panel);
      else this.notifyTitleFrame(geometry.panel);
    }
    this.refreshRegisteredIconBounds();
  }

  setClosingDesktopPageTrackMirrorX(offsetX) {
    const x = Number.isFinite(Number(offsetX)) ? Number(offsetX) : 0;
    this.closingDesktopPageTrackMirrorX = x;
    return x;
  }

  syncClosingDesktopPageTrackMirror(state = {}, folderId = null, isClosing = false) {
    if (!isClosing || !folderId) {
      this.resetClosingDesktopPageTrackMirror();
      return 0;
    }
    const liveX = getDesktopPageTrackLiveX(state);
    if (!this.closingDesktopPageTrackMirrorBaseline ||
      this.closingDesktopPageTrackMirrorBaseline.folderId !== folderId) {
      this.closingDesktopPageTrackMirrorBaseline = { folderId, liveX };
    }
    return this.setClosingDesktopPageTrackMirrorX(liveX - this.closingDesktopPageTrackMirrorBaseline.liveX);
  }

  resetClosingDesktopPageTrackMirror() {
    this.closingDesktopPageTrackMirrorBaseline = null;
    return this.setClosingDesktopPageTrackMirrorX(0);
  }

  getResizeLayoutMode(state = {}, options = {}) {
    if (state.isFolderClosing || state.isFolderAppLaunchClosing || state.isFolderZoomFadeClosing) return "closing";
    const committedFolderPageIndex = state.folderPageIndex ?? 0;
    const visualFolderPageIndex = state.visualFolderPageIndex ?? committedFolderPageIndex;
    const releaseSource = state.dragReleaseState?.source || null;
    const isCrossPageFolderRelease = Boolean(
      state.dragReleaseGhostId &&
      releaseSource?.type === "folder" &&
      (releaseSource.folderId == null || releaseSource.folderId === state.renderedFolder?.id) &&
      Number(releaseSource.pageIndex) !== Number(committedFolderPageIndex)
    );
    if (state.folderPageTrackScrub ||
      state.folderPageTurnToken != null ||
      visualFolderPageIndex !== committedFolderPageIndex ||
      isCrossPageFolderRelease ||
      (state.dragReleaseGhostId && isPageTrackMotionActive(this.pageTrackMotion, this.pageTrack))) {
      return "page-turn";
    }
    const openProgress = readProgress01(state.folderOpenProgress);
    if (openProgress !== null && openProgress < 1) return "opening";
    if (
      this.frameGhostState &&
      this.frameGhostPhase === "opening" &&
      options.layoutChanged &&
      !options.sizeChanged &&
      (state.dragMeta || state.dragReleaseGhostId)
    ) return "opening";
    if (this.folderHandoff?.hasActiveOpeningVisuals?.()) return "opening";
    return "layout";
  }

  isResizeLayoutSyncActive() {
    return Boolean(this.resizeLayoutSync && this.resizeLayoutSync.remainingRenders > 0);
  }

  isOpeningGeometryTransitionActive() {
    return Boolean(
      this.resizeLayoutSync?.mode === "opening" ||
      (this.resizeVisualGeometryState && this.resizeVisualGeometryMode === "opening") ||
      this.resizeVisualGeometryFinalMode === "opening"
    );
  }

  cancelResizeLayoutMotions() {
    cancelPageTrackMotion(this.pageTrackMotion, FOLDER_RESIZE_LAYOUT_REASON);
    killMotionOf(this.pageTrack, "x", { lane: "base", reason: FOLDER_RESIZE_LAYOUT_REASON });
    for (const node of this.iconNodes.values()) {
      if (node?.destroyed) continue;
      killMotionOf(node, "x,y", { lane: "base", reason: FOLDER_RESIZE_LAYOUT_REASON });
    }
    this.markRegisteredBoundsDirty();
  }

  beginResizeLayoutSync(state, sizeKey, layoutSignature, options = {}) {
    this.resizeLayoutSync = {
      layoutSignature,
      mode: this.getResizeLayoutMode(state, options),
      remainingRenders: FOLDER_RESIZE_SYNC_MIN_RENDERS,
      sizeKey,
    };
    this.resizeLayoutSignature = layoutSignature;
    this.cancelResizeLayoutMotions();
  }

  syncResizeLayoutState(state, sizeKey, layoutSignature, sizeChanged) {
    const layoutChanged = Boolean(this.resizeLayoutSignature && this.resizeLayoutSignature !== layoutSignature);
    if (sizeChanged || layoutChanged) {
      this.beginResizeLayoutSync(state, sizeKey, layoutSignature, { layoutChanged, sizeChanged });
      return;
    }
    if (this.resizeLayoutSync) this.resizeLayoutSync.layoutSignature = layoutSignature;
    this.resizeLayoutSignature = layoutSignature;
  }

  clearResizeVisualGeometry(reason = FOLDER_RESIZE_LAYOUT_REASON) {
    if (this.resizeVisualGeometryState) {
      killMotionOf(this.resizeVisualGeometryState, null, { lane: "base", reason });
    }
    this.resizeVisualGeometryState = null;
    this.resizeVisualGeometryMode = null;
    this.resizeVisualGeometryFinalMode = null;
    this.resizeVisualGeometryFinalTargetKey = null;
    this.resizeVisualGeometryTargetKey = null;
    this.resizeVisualLayoutStartMetrics = null;
    this.resizeVisualLayoutTargetMetrics = null;
  }

  startResizeVisualGeometryMotion(fromGeometry, toGeometry, targetKey, mode = null, options = {}) {
    const startState = this.resizeVisualGeometryState ||
      makeResizeGeometryState(fromGeometry, options.fromLayoutMetrics);
    if (!startState) return null;
    const animationMode = mode || this.resizeVisualGeometryMode || this.resizeLayoutSync?.mode || null;
    this.resizeVisualGeometryState = startState;
    this.resizeVisualGeometryMode = animationMode;
    this.resizeVisualGeometryFinalTargetKey = null;
    this.resizeVisualGeometryFinalMode = null;
    this.resizeVisualGeometryTargetKey = targetKey;
    this.resizeVisualLayoutStartMetrics = makeLayoutMetricsFromResizeState(
      startState,
      options.fromLayoutMetrics || options.toLayoutMetrics || {}
    );
    this.resizeVisualLayoutTargetMetrics = options.toLayoutMetrics ? { ...options.toLayoutMetrics } : null;
    const requestFrame = () => {
      this.markRegisteredBoundsDirty();
      this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
    };
    motion(startState)
      .layout()
      .spring(motionSprings.layout)
      .interrupt("retarget")
      .to({
        ...makeResizeGeometryTarget(toGeometry, options.toLayoutMetrics),
        onComplete: () => {
          if (this.resizeVisualGeometryTargetKey !== targetKey) return;
          this.resizeVisualGeometryState = null;
          this.resizeVisualGeometryFinalTargetKey = targetKey;
          this.resizeVisualGeometryFinalMode = animationMode;
          this.resizeVisualGeometryTargetKey = null;
          this.resizeVisualGeometryMode = null;
          this.resizeVisualLayoutStartMetrics = null;
          this.resizeVisualLayoutTargetMetrics = null;
          requestFrame();
        },
        onUpdate: requestFrame,
      })
      .start();
    return startState;
  }

  resolveResizeVisualGeometry(context = {}) {
    const targetGeometry = context.geometry;
    const targetLayoutMetrics = context.targetLayoutMetrics || makeResizeLayoutMetricsSnapshot(context.state, targetGeometry);
    const targetKey = makeResizeVisualTargetKey(targetGeometry, targetLayoutMetrics);
    if (context.isClosing || context.isNewFolder || context.isPrewarm) {
      this.clearResizeVisualGeometry("resize-visual-geometry-reset");
      return targetGeometry;
    }
    const hasActiveVisualGeometry = Boolean(
      this.resizeVisualGeometryState &&
      this.resizeVisualGeometryTargetKey === targetKey
    );
    const canAnimatePageTurnResize = Boolean(
      this.resizeLayoutSync?.mode === "page-turn" &&
      (context.state?.dragMeta || context.state?.dragReleaseGhostId) &&
      !context.state?.folderPageTrackScrub
    );
    const canAnimateOpeningResize = this.resizeLayoutSync?.mode === "opening";
    const canAnimateResizeGeometry = Boolean(
      (this.resizeLayoutSync?.mode === "layout" || canAnimateOpeningResize || canAnimatePageTurnResize) &&
      context.previousGeometry &&
      targetKey
    );

    if (canAnimateResizeGeometry && this.resizeVisualGeometryTargetKey !== targetKey) {
      this.startResizeVisualGeometryMotion(
        this.resizeVisualGeometryState ? makeGeometryFromResizeState(this.resizeVisualGeometryState) : context.previousGeometry,
        targetGeometry,
        targetKey,
        this.resizeLayoutSync?.mode || null,
        {
          fromLayoutMetrics: context.previousLayoutMetrics || targetLayoutMetrics,
          toLayoutMetrics: targetLayoutMetrics,
        }
      );
    } else if (!canAnimateResizeGeometry &&
      !hasActiveVisualGeometry &&
      this.resizeVisualGeometryFinalTargetKey !== targetKey) {
      this.clearResizeVisualGeometry("resize-visual-geometry-clear");
    }

    return this.resizeVisualGeometryState && this.resizeVisualGeometryTargetKey === targetKey
      ? makeGeometryFromResizeState(this.resizeVisualGeometryState)
      : targetGeometry;
  }

  syncResizeFrameGhostShell(geometry, options = {}) {
    const frame = this.frameGhostState;
    const panel = geometry?.panel;
    if (!frame || !panel || options.isClosing) return;
    if (this.frameGhostPhase && this.frameGhostPhase !== "opening") return;
    if (options.resizeGeometryMode === "opening") return;
    const shouldSync = Boolean(
      options.resizeLayoutSyncActive ||
      options.resizeVisualGeometryActive ||
      options.resizeVisualGeometryFinalFrame
    );
    if (!shouldSync) return;
    frame.height = panel.height;
    frame.left = panel.left;
    frame.radius = getFrameRadius(panel, frame.radius ?? 48);
    frame.top = panel.top;
    frame.width = panel.width;
    this.drawFrameGhost(frame, { notifyTitleFrame: false });
  }

  finishResizeLayoutSyncFrame(context = {}) {
    if (!this.resizeLayoutSync) return;
    const layoutSignature = context.resizeLayoutSignature ||
      (context.state && context.geometry ? makeResizeLayoutSignature(context.state, context.geometry) : null);
    if (layoutSignature && this.resizeLayoutSync.layoutSignature !== layoutSignature) {
      this.resizeLayoutSync.layoutSignature = layoutSignature;
      this.resizeLayoutSync.remainingRenders = FOLDER_RESIZE_SYNC_MIN_RENDERS;
      this.resizeLayoutSignature = layoutSignature;
      this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
      return;
    }
    this.resizeLayoutSync.remainingRenders -= 1;
    if (this.resizeLayoutSync.remainingRenders <= 0) {
      this.resizeLayoutSync = null;
      this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
      return;
    }
    this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
  }

  resetPanelMotion(reason, options = {}) {
    const {
      panelProps = null,
      scaleProps = null,
      stopSprings = true,
    } = options;
    if (stopSprings) {
      killMotionOf(this.panel, null, { lane: "base", reason });
      killMotionOf(this.panel.scale, null, { lane: "base", reason });
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
    this.folderHandoff.cancelOpen();
    this.cancelOpeningPanelReadyCheck();
    this.panelOpenTargetKey = null;
    this.panelAlphaTarget = null;
    this.panelOpenProgressDriven = false;
    this.panelZoomFadeClosing = false;
    this.resizeLayoutSync = null;
    this.resizeLayoutSignature = null;
    this.resizeLayoutMetricsSnapshot = null;
    this.clearResizeVisualGeometry(FOLDER_OVERLAY_CLEAR_REASON);
    this.targetFolderGeometry = null;
    this.currentOpeningGeometrySnapshot = null;
    this.openingGhosts.clear({ cancelSession: true });
    this.closingGhosts.clear();
    this.resetClosingDesktopPageTrackMirror();
    if (clearDetachedClosingVisuals) this.clearDetachedClosingVisuals(null, { immediate: true });
    if (releaseOwnership) this.releaseAllOwnedVisualOwnership({ preserveDetachedClosing });
    if (clearVisualCommitQueue) this.getVisualCommitQueue().clear();
    if (cancelPageTrackReason) {
      cancelPageTrackMotion(this.pageTrackMotion, cancelPageTrackReason);
    }
    if (clearPageTrackSpringsReason) killMotionOf(this.pageTrack, null, { lane: "base", reason: clearPageTrackSpringsReason });
    if (clearPageDots) this.clearPageDots();
    if (clearPanelSpringsReason) {
      killMotionOf(this.panel, null, { lane: "base", reason: clearPanelSpringsReason });
      killMotionOf(this.panel.scale, null, { lane: "base", reason: clearPanelSpringsReason });
    }
  }

  clearRegisteredIconBounds() {
    this.folderIconLayoutTargets?.clear?.();
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
      iconBoundsRegistry: this.iconBoundsRegistry,
      iconSize: target.iconSize,
      index: target.index,
      isInteractivePage: true,
      isPrewarm: false,
      item,
      node: ghost,
      pageIndex: target.pageIndex ?? state.folderPageIndex ?? 0,
      provisionalLayoutTarget: target.provisionalLayoutTarget === true,
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
    this.pageDotsLayer.alpha = 0;
    this.pageDotsLayerRevealKey = null;
    killMotionOf(this.pageDotsLayer, "alpha");
  }

  hasActiveIconGhosts() {
    return Boolean(this.folderHandoff.hasActiveOpeningVisuals() || this.closingGhosts.hasActive());
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
    return this.getVisualCommitQueue().enqueue({
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
    this.commitDetachedClosingHandoff(visual, { reveal: options.reveal !== false });
    this.destroyDetachedClosingVisual(visual);
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

  detachClosingPresentationForOpen(nextFolderId, options = {}) {
    if (nextFolderId) this.clearDetachedClosingVisuals(nextFolderId, { immediate: true, reveal: false });
    const transitionPort = ensureLayerTransitionPort(this);
    const waitForDesktopClose = options.waitForDesktopClose === true;
    const closingFolderId = this.folderHandoff.folderId || options.folderId || null;
    if (waitForDesktopClose && this.hasDesktopCloseDetachedVisual(closingFolderId)) return false;
    // Do not re-detach / re-prepare a close whose real desktop icon is already
    // visible (its handoff effectively finished): re-engaging would re-acquire
    // desktop-source ownership and re-hide the icon for the whole detached
    // animation — the precise-timing cross-folder blink. Trust the desktop truth.
    const closingSourceAlreadyVisible = Boolean(closingFolderId) &&
      this.isHandoffSourceVisible?.(closingFolderId) === true;
    const shouldKeepDetachedVisual = Boolean(
      closingFolderId && (waitForDesktopClose || closingFolderId !== nextFolderId) && !closingSourceAlreadyVisible
    );
    const closingMirrorOffsetX = shouldKeepDetachedVisual ? this.closingDesktopPageTrackMirrorX : 0;
    const frameState = shouldKeepDetachedVisual
      ? addXOffsetToFrameState(this.frameGhostState, closingMirrorOffsetX)
      : null;
    const frameTarget = shouldKeepDetachedVisual ? this.folderHandoff.getDetachedFrameTarget() : null;
    const closingGhosts = shouldKeepDetachedVisual
      ? transitionPort.removeClosingGhosts()
      : [];
    const detachedGhostMotions = new Map(closingGhosts.map((ghost) => [
      ghost,
      this.folderHandoff.getDetachedClosingGhostMotion(ghost),
    ]));
    const previewSwapGhosts = shouldKeepDetachedVisual
      ? transitionPort.removeClosingPreviewSwapChildren()
      : [];
    if (closingMirrorOffsetX && previewSwapGhosts.length) {
      for (const ghost of previewSwapGhosts) {
        if (!ghost || ghost.destroyed) continue;
        ghost.x = (Number(ghost.x) || 0) + closingMirrorOffsetX;
      }
    }
    let detachedVisual = null;

    if (shouldKeepDetachedVisual && (frameState || closingGhosts.length || previewSwapGhosts.length || waitForDesktopClose)) {
      this.onClosingHandoffPrepare?.(closingFolderId);
      const container = new Container();
      container.eventMode = (frameState || closingGhosts.length || previewSwapGhosts.length) ? "static" : "none";
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
      const visual = {
        container,
        desktopCloseReleaseRequested: false,
        folderId: closingFolderId,
        geometryComplete: false,
        releaseAfterDesktopClose: waitForDesktopClose,
      };
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
          detachedVisual.geometryComplete = true;
          if (detachedVisual.releaseAfterDesktopClose && !detachedVisual.desktopCloseReleaseRequested) return;
          this.clearDetachedClosingVisualNow(detachedVisual);
        });
      };
      const geometryTracker = makeCompletionTracker(finishAfterGeometry);
      const frame = frameState ? container.children[0] : null;
      if (frameState) animateDetachedFrame(frame, frameState, frameTarget, geometryTracker, detachedVisual);
      for (const ghost of closingGhosts) {
        animateDetachedClosingGhost(
          ghost,
          geometryTracker,
          detachedVisual,
          detachedGhostMotions.get(ghost)
        );
      }
      if (!frameState && !closingGhosts.length && previewSwapGhosts.length) {
        animateDetachedGeometryHold(geometryTracker, detachedVisual);
      }
      geometryTracker.finishIfIdle();
      return true;
    }

    this.clearClosingFolderId();
    this.closingGhosts.clear({ restorePageTrack: false, reveal: false });
    return false;
  }

  detachClosingPresentationForDesktopClose(folderId) {
    return this.detachClosingPresentationForOpen(null, {
      folderId,
      waitForDesktopClose: true,
    });
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

  // Whether an ACTUALLY VISIBLE overlay/detached substitute currently covers this
  // folder's desktop source position. Distinct from getDesktopSourceGhostedIds()
  // (which is ownership-based): a leaked desktop-source ownership keeps the real
  // icon ghosted with NO visible cover — exactly the orphan we must detect.
  hasVisibleFolderSubstitute(folderId) {
    if (!folderId) return false;
    for (const visual of this.detachedClosingVisuals || []) {
      if (visual?.folderId === folderId && !visual.destroyed && !visual.handoffCommitted) return true;
    }
    const coversActiveFolder = this.currentFolderId === folderId ||
      this.folderHandoff?.folderId === folderId;
    if (!coversActiveFolder) return false;
    return Boolean(
      this.frameGhost?.visible ||
      (this.closingGhostLayer?.children?.length || 0) > 0 ||
      (this.closingPreviewSwapLayer?.children?.length || 0) > 0 ||
      (this.openingGhostLayer?.children?.length || 0) > 0
    );
  }

  setClosingHandoffActive(active) {
    this.folderHandoff.setCloseHandoffActive(active);
  }

  clearClosingFolderId() {
    this.folderHandoff.clearCloseFolderId();
    this.resetClosingDesktopPageTrackMirror();
  }

  revealIconNodes() {
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
  }

  createClosingGhostToken(folderId = null) {
    const token = `closing:${folderId || ""}:${this.nextClosingGhostToken}`;
    this.nextClosingGhostToken += 1;
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

  releaseIconNodesForTransition(itemId, token, options = {}) {
    if (!itemId || token == null) return 0;
    const reveal = options.reveal !== false;
    let released = 0;
    for (const entry of this.visualOwnership.snapshot()) {
      if (entry.owner?.token !== token || !entry.key?.startsWith("folderIcon:")) continue;
      let matchedNode = null;
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = this.getIconNodeVisualKey(node, entry.owner.folderId);
        if (key === entry.key) {
          matchedNode = node;
          break;
        }
      }
      if (!matchedNode) continue;
      if (!this.releaseVisualOwnership(entry.key, token)) continue;
      released += 1;
      if (reveal && !this.visualOwnership.hasOwner(entry.key)) {
        matchedNode.visible = true;
        matchedNode.alpha = 1;
      }
    }
    return released;
  }

  clearFrameGhost(options = {}) {
    const wasOpeningFrame = this.frameGhostPhase === "opening";
    clearFrameGhostState(this, options);
    if (wasOpeningFrame) this.openingGhosts?.clearFrameTarget?.();
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
    this.openingPanelReadyFrame.cancelled = true;
    this.openingPanelReadyFrame = null;
  }

  markOpeningPanelReady(sessionToken) {
    const markedReady = this.folderHandoff.markPanelReady(sessionToken);
    const isPanelReady = this.folderHandoff.activeOpenSession?.panelReady === true;
    if (!markedReady && !isPanelReady) return false;
    this.cancelOpeningPanelReadyCheck();
    if (this.folderHandoff.getOpeningSessionToken() === sessionToken) {
      this.openingGhosts.finishTransition({ sessionToken });
    }
    return true;
  }

  scheduleOpeningPanelReadyCheck(sessionToken, panelRect) {
    this.cancelOpeningPanelReadyCheck();
    const queueCheck = () => {
      const frame = { cancelled: false };
      this.openingPanelReadyFrame = frame;
      motionRuntime.afterFrame(() => check(frame));
    };
    const check = (frame) => {
      if (frame.cancelled || this.openingPanelReadyFrame !== frame) return;
      this.openingPanelReadyFrame = null;
      if (!this.folderHandoff.isCurrentOpen(sessionToken)) return;
      this.notifyPanelTitleFrame(panelRect);
      this.markRegisteredBoundsDirty();
      if (this.getPanelTitleProgress() >= FOLDER_PANEL_READY_PROGRESS) {
        this.markOpeningPanelReady(sessionToken);
        return;
      }
      queueCheck();
    };
    queueCheck();
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

  retargetFrameGhost(toRect, options = {}) {
    return retargetFrameGhostState(this, toRect, options);
  }

  refreshPageTrackMask() {
    this.pageTrack.mask = null;
    this.pageTrack.mask = this.pageMask;
  }

  refreshPanelClipMask() {
    if (this.panelContentLayer && this.panelContentLayer.mask !== this.panelClipMask) {
      this.panelContentLayer.mask = this.panelClipMask;
    }
    if (this.openingGhostLayer && this.openingGhostLayer.mask !== this.panelClipMask) {
      this.openingGhostLayer.mask = this.panelClipMask;
    }
  }

  rebuildPanelClipMask(panelRect) {
    if (!panelRect || !this.panel || this.destroyed) {
      this.refreshPanelClipMask();
      return;
    }
    const previousMask = this.panelClipMask;
    const nextMask = new Graphics();
    this.drawPanelClipMask(panelRect, nextMask);
    const previousIndex = this.panel.children.indexOf(previousMask);
    if (this.panelContentLayer?.mask === previousMask) this.panelContentLayer.mask = null;
    if (this.openingGhostLayer?.mask === previousMask) this.openingGhostLayer.mask = null;
    if (previousIndex >= 0) {
      this.panel.removeChild(previousMask);
      this.panel.addChildAt(nextMask, previousIndex);
    } else {
      const contentIndex = this.panel.children.indexOf(this.panelContentLayer);
      this.panel.addChildAt(nextMask, Math.max(0, contentIndex));
    }
    this.panelClipMask = nextMask;
    this.refreshPanelClipMask();
    previousMask?.destroy?.();
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
    motion(dot)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ alpha: visual.alpha })
      .start();
    motion(dot.scale)
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
    const folderId = state.renderedFolder?.id || this.currentFolderId || null;
    const revealKey = folderId || "";
    const shouldReveal = !this.pageDotsLayer.visible || this.pageDotsLayerRevealKey !== revealKey;
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = true;
    this.pageDotsLayer.eventMode = "static";
    this.pageDotsLayer.cursor = "default";
    this.pageDotsLayer.hitArea = new Rectangle(frame.left, frame.top, frame.width, frame.height);
    this.pageDotsLayerRevealKey = revealKey;
    const totalWidth = pageCount * FOLDER_PAGE_DOTS_SIZE + (pageCount - 1) * FOLDER_PAGE_DOTS_GAP;
    const startX = frame.left + frame.width / 2 - totalWidth / 2 + FOLDER_PAGE_DOTS_SIZE / 2;
    const centerY = frame.top + FOLDER_PAGE_DOTS_HIT_HEIGHT / 2;
    const activePageIndex = state.visualFolderPageIndex ?? state.folderPageIndex;
    for (let index = 0; index < pageCount; index += 1) {
      const dot = new Graphics();
      const isActive = index === activePageIndex;
      this.describePageDotTargets(dot, index, state, isActive);
      this.setPageDotHover(dot, isActive, false, { immediate: true });
      dot.position.set(startX + index * (FOLDER_PAGE_DOTS_SIZE + FOLDER_PAGE_DOTS_GAP), centerY);
      dot.eventMode = "static";
      dot.cursor = "pointer";
      dot.hitArea = new Rectangle(-8, -8, FOLDER_PAGE_DOTS_SIZE + 16, FOLDER_PAGE_DOTS_SIZE + 16);
      dot.on("pointerover", () => this.setPageDotHover(dot, isActive, true));
      dot.on("pointerout", () => this.setPageDotHover(dot, isActive, false));
      dot.on("pointerdown", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        const native = event?.nativeEvent;
        native?.preventDefault?.();
        native?.stopPropagation?.();
        state.folderPageIndexCommit?.(index);
      });
      this.pageDotsLayer.addChild(dot);
    }
    if (shouldReveal) {
      killMotionOf(this.pageDotsLayer, "alpha");
      this.pageDotsLayer.alpha = 0;
      motion(this.pageDotsLayer)
        .preset("fade", { duration: PAGE_DOTS_REVEAL_DURATION, ease: PAGE_DOTS_REVEAL_EASE })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
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
      pageSpan: geometry.panel?.width ?? null,
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
    const maskParent = this.panelContentLayer || this.panel;
    const previousIndex = maskParent.children.indexOf(previousMask);
    this.pageTrack.mask = null;
    if (previousIndex >= 0) {
      maskParent.removeChild(previousMask);
      maskParent.addChildAt(nextMask, previousIndex);
    } else {
      const trackIndex = maskParent.children.indexOf(this.pageTrack);
      maskParent.addChildAt(nextMask, Math.max(0, trackIndex));
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
    const existing = this.folderHandoff.getOpenGeometrySnapshot(sessionToken);
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
    this.folderHandoff.setOpenGeometrySnapshot(sessionToken, snapshot);
    return snapshot;
  }

  animatePanel(state, targetX, targetY, panelRect, sourceRect = null, options = {}) {
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    const isOpenFolderZoomFadeClosing = Boolean(state.isFolderZoomFadeClosing && !state.isFolderClosing);
    const folderId = state.renderedFolder?.id || null;
    const markBoundsDirty = () => this.markRegisteredBoundsDirty();
    const isNewPanelSource = this.currentFolderId !== folderId;
    if (isClosing) {
      this.folderHandoff.cancelOpen();
      this.cancelOpeningPanelReadyCheck();
      this.panelOpenTargetKey = null;
      this.panelAlphaTarget = null;
      this.panelOpenProgressDriven = false;
    }
    if (isNewPanelSource) {
      this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, { panelProps: "x,y,alpha", scaleProps: "x,y" });
      this.currentFolderId = folderId;
      this.panelOpenTargetKey = null;
      this.panelAlphaTarget = null;
      this.panelOpenProgressDriven = false;
      this.panelZoomFadeClosing = false;
      if (sourceRect) {
        const startGeometry = getPanelOpenStartGeometry(targetX, targetY, panelRect, sourceRect, state.stageRect);
        this.panel.position.set(startGeometry.x, startGeometry.y);
        this.panel.scale.set(startGeometry.scaleX, startGeometry.scaleY);
      } else {
        const startGeometry = getPanelOpenStartGeometry(targetX, targetY, panelRect, null, state.stageRect);
        this.panel.position.set(startGeometry.x, startGeometry.y);
        this.panel.scale.set(startGeometry.scaleX, startGeometry.scaleY);
      }
      this.panel.alpha = 0.94;
      this.panelTitleOpening = !isClosing;
      this.panelTitleStartScaleX = this.panel.scale.x;
      this.panelTitleStartScaleY = this.panel.scale.y;
      if (!isClosing) this.notifyPanelTitleFrame(panelRect);
    }

    if (isOpenFolderZoomFadeClosing) {
      this.folderHandoff.cancelOpen();
      this.cancelOpeningPanelReadyCheck();
      this.panelTitleOpening = false;
      this.panelOpenTargetKey = null;
      this.panelOpenProgressDriven = false;
      this.panelAlphaTarget = 1;
      if (!this.panelZoomFadeClosing) {
        this.resetPanelMotion(FOLDER_PANEL_ZOOM_FADE_REASON, { panelProps: "x,y,alpha", scaleProps: "x,y" });
        this.panelZoomFadeClosing = true;
      }
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      this.panel.alpha = 1;
      this.notifyPanelTitleFrame(panelRect);
      markBoundsDirty();
      return;
    }
    this.panelZoomFadeClosing = false;

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
      motion(this.panel)
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
      motion(this.panel)
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
    const shouldOwnOpenSession = isNewPanelSource || Boolean(this.folderHandoff.activeOpenSession);
    const { session } = shouldOwnOpenSession
      ? this.folderHandoff.beginOpen(folderId, targetKey, { forceNew: isNewPanelSource })
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
    const openProgress = readProgress01(state.folderOpenProgress);
    if (openProgress !== null) {
      const shouldRetargetPresentation = !this.panelOpenProgressDriven || this.panelOpenTargetKey !== targetKey;
      if (shouldRetargetPresentation) {
        if (sessionToken) this.folderHandoff.markPanelPending(sessionToken, targetKey);
        this.panelOpenTargetKey = targetKey;
        this.panelOpenProgressDriven = true;
        this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, {
          panelProps: "x,y,alpha",
          scaleProps: "x,y",
        });
        if (sessionToken) this.scheduleOpeningPanelReadyCheck(sessionToken, openingGeometrySnapshot?.panelRect || panelRect);
      }
      this.panelAlphaTarget = 1;
      const startGeometry = getPanelOpenStartGeometry(targetX, targetY, panelRect, sourceRect, state.stageRect);
      this.panel.position.set(
        lerpNumber(startGeometry.x, targetX, openProgress),
        lerpNumber(startGeometry.y, targetY, openProgress)
      );
      this.panel.scale.set(
        lerpNumber(startGeometry.scaleX, 1, openProgress),
        lerpNumber(startGeometry.scaleY, 1, openProgress)
      );
      this.panel.alpha = lerpNumber(0.94, 1, openProgress);
      updateOpeningPanelFrame();
      return {
        openingGeometrySnapshot,
        sessionToken,
      };
    }
    if (this.panelOpenProgressDriven) this.panelOpenTargetKey = null;
    this.panelOpenProgressDriven = false;
    if (this.panelAlphaTarget !== 1) {
      this.panelAlphaTarget = 1;
      motion(this.panel)
        .preset("folderOpen")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }

    if (options.resizeLayoutSyncActive || options.resizeVisualGeometryActive || options.resizeVisualGeometryFinalFrame) {
      if (this.panelOpenTargetKey !== targetKey && sessionToken) {
        this.folderHandoff.markPanelPending(sessionToken, targetKey);
      }
      this.panelOpenTargetKey = targetKey;
      this.resetPanelMotion(FOLDER_RESIZE_LAYOUT_REASON, {
        panelProps: "x,y",
        scaleProps: "x,y",
        stopSprings: false,
      });
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      updateOpeningPanelFrame();
      return {
        openingGeometrySnapshot,
        sessionToken,
      };
    }

    if (this.panelOpenTargetKey !== targetKey) {
      if (sessionToken) this.folderHandoff.markPanelPending(sessionToken, targetKey);
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
      }, { onFrame: updateOpeningPanelFrame, spring: motionSprings.folderPanelOpen });
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

  drawPanelClipMask(panel, mask = this.panelClipMask) {
    mask.clear()
      .roundRect(0, 0, panel.width, panel.height, 48)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  bindFakeRefs(state, geometry) {
    const meta = { folderId: state.renderedFolder?.id || null };
    const panelElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.panel, meta);
    const gridElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.grid, meta);
    if (state.folderPanelRef) state.folderPanelRef.value = panelElement;
    if (state.folderViewportRef) state.folderViewportRef.value = gridElement;
    if (typeof state.setFolderPageRef === "function") {
      const committedPageIndex = Number.isFinite(Number(state.folderPageIndex)) ? Number(state.folderPageIndex) : 0;
      const visualPageIndex = Number.isFinite(Number(state.visualFolderPageIndex))
        ? Number(state.visualFolderPageIndex)
        : committedPageIndex;
      state.setFolderPageRef(gridElement, visualPageIndex);
      if (committedPageIndex !== visualPageIndex) state.setFolderPageRef(gridElement, committedPageIndex);
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
    const folderIconNodes = Array.from(this.iconNodes || []).map(([key, node]) => ({
      alpha: roundDebugValue(node?.alpha),
      id: node?.item?.id || null,
      key,
      pageIndex: node?.state?.source?.pageIndex ?? node?.source?.pageIndex ?? null,
      target: this.folderIconLayoutTargets?.get(key) || null,
      visible: node?.visible ?? null,
      x: roundDebugValue(node?.x),
      y: roundDebugValue(node?.y),
    }));
    return {
      closingMirror: {
        baselineFolderId: this.closingDesktopPageTrackMirrorBaseline?.folderId || null,
        baselineLiveX: this.closingDesktopPageTrackMirrorBaseline
          ? Math.round(this.closingDesktopPageTrackMirrorBaseline.liveX * 1000) / 1000
          : null,
        frameGhostX: Math.round((this.frameGhost?.x ?? 0) * 1000) / 1000,
        maskX: Math.round((this.closingFrameMask?.x ?? 0) * 1000) / 1000,
        offsetX: Math.round((this.closingDesktopPageTrackMirrorX ?? 0) * 1000) / 1000,
        previewSwapLayerX: Math.round((this.closingPreviewSwapLayer?.x ?? 0) * 1000) / 1000,
      },
      folderLayout: {
        iconNodes: folderIconNodes,
        pageMaskRect: cloneDebugRect(this.pageMaskRect),
        pageTrackMotion: {
          mode: this.pageTrackMotion?.mode || null,
          targetX: roundDebugValue(this.pageTrackMotion?.targetX),
        },
        pageTrackX: roundDebugValue(this.pageTrack?.x),
        resizeLayoutSync: this.resizeLayoutSync ? { ...this.resizeLayoutSync } : null,
      },
      openingGeometry: makeOpeningGeometryDebugSnapshot(
        this.folderHandoff?.activeOpenSession || null,
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
    killMotionOf(this.pageTrack, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.panel, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.panel.scale, null, { lane: "base", reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
