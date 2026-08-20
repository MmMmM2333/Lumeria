import { Container, Graphics } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getDesktopGridMetrics } from "../geometry/gridGeometry.js";
import { clientRectToStageVisualRect, stageLayoutRecordToClientRect } from "../geometry/stageCoordinates.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { motionSprings } from "../animation/motionPresets.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import { makeDesktopBoundsRegistration } from "./desktopBoundsRegistration.js";
import { resolveDesktopBoundsTargets, resolveFolderPreviewChildBoundsTargets } from "./desktopBoundsTargets.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { makeSyntheticPointerEvent } from "./iconSceneHelpers.js";
import { FolderOverlayLayer } from "./FolderOverlayLayer.js";
import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";
import {
  VisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
} from "./visualOwnershipRegistry.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { makeIconVisualSpecFromNodeState } from "./iconVisualSpec.js";
import { SingleStageDiagnosticsLayer } from "./singleStageDiagnostics.js";
import { GroupDragLayer } from "./GroupDragLayer.js";
import { DragHitDebugLayer } from "./DragHitDebugLayer.js";
import { FolderDropTargetLayer } from "./FolderDropTargetLayer.js";
import { IconNode } from "../nodes/IconNode.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundRect,
} from "./folderHandoffDebug.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  isPageTrackMotionActive,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";
import {
  buildDesktopRenderPlan,
  getDesktopSourceGhostedIdsFromOwnership,
  hasFolderClosingHandoffId,
  isDesktopLayoutTargetChanged,
  isFolderLayerHandoffActive,
  isFolderOpeningSourceGhosted,
  isStaleHiddenFolderHandoffEntry,
  normalizeDesktopHandoffState,
  normalizeFolderIdSet,
  readNumber,
  resolveDesktopVisualAlpha,
  resolveLaunchpadVisualAlpha,
  resolveLaunchpadVisualTransform,
  shouldFinishFolderHandoff,
  shouldFinishFolderHandoffEntry,
} from "./desktopRenderPlan.js";

export {
  normalizeDesktopHandoffState,
  resolveDesktopVisualAlpha,
  resolveLaunchpadVisualAlpha,
  resolveLaunchpadVisualTransform,
  shouldFinishFolderHandoff,
  shouldFinishFolderHandoffEntry,
};

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;
const DESKTOP_DRAG_HANDOFF_LAYOUT_REASON = "desktop-drag-handoff-layout";
const GROUP_TRANSFER_OWNERSHIP_HANDOFF_LAYOUT_REASON = "group-transfer-ownership-handoff-layout";
const DESKTOP_RESIZE_LAYOUT_REASON = "desktop-resize-layout";
const MOTION_TARGET_EPSILON = 0.0001;

function makeDesktopDragVisualSpec(plan = null) {
  const entries = plan?.entries || [];
  const activePageIndex = Number(plan?.activePageIndex) || 0;
  const entry = entries.find((candidate) => (
    candidate?.pageIndex === activePageIndex && candidate?.item?.type === "app"
  )) || entries.find((candidate) => candidate?.pageIndex === activePageIndex) || entries[0];
  return entry?.nodeState ? makeIconVisualSpecFromNodeState(entry.nodeState) : null;
}

function readTransformAxisLengths(node) {
  const matrix = node?.worldTransform;
  if (!matrix) return null;
  const x = Math.hypot(Number(matrix.a), Number(matrix.b));
  const y = Math.hypot(Number(matrix.c), Number(matrix.d));
  return Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0
    ? { x, y }
    : null;
}

function getVisualTransformNode(node) {
  return node?.visualWrap && !node.visualWrap.destroyed
    ? node.visualWrap
    : node;
}

function readVisualCenterInLayer(layer, node) {
  const visual = getVisualTransformNode(node);
  if (!layer || !visual || visual.destroyed) return null;
  const center = layer.toLocal({ x: 0, y: 0 }, visual);
  return Number.isFinite(Number(center?.x)) && Number.isFinite(Number(center?.y))
    ? { x: Number(center.x), y: Number(center.y) }
    : null;
}

function resolveReleaseRootPoint(releaseNode, visualTarget, targetScale) {
  if (!visualTarget || !releaseNode || releaseNode.destroyed) return visualTarget;
  const releaseVisual = getVisualTransformNode(releaseNode);
  if (!releaseVisual || releaseVisual === releaseNode || releaseVisual.destroyed) return visualTarget;
  const localVisualCenter = releaseNode.toLocal({ x: 0, y: 0 }, releaseVisual);
  if (
    !Number.isFinite(Number(localVisualCenter?.x)) ||
    !Number.isFinite(Number(localVisualCenter?.y))
  ) return visualTarget;
  const scaleX = Math.max(0.01, Math.abs(Number(targetScale?.x) || Number(releaseNode.scale?.x) || 1));
  const scaleY = Math.max(0.01, Math.abs(Number(targetScale?.y) || Number(releaseNode.scale?.y) || 1));
  return {
    x: visualTarget.x - Number(localVisualCenter.x) * scaleX,
    y: visualTarget.y - Number(localVisualCenter.y) * scaleY,
  };
}

function resolvePanelEgressPoint(visualTarget, panel, extension = 32) {
  if (!visualTarget || !panel) return visualTarget;
  const center = {
    x: Number(panel.left) + Number(panel.width) / 2,
    y: Number(panel.top) + Number(panel.height) / 2,
  };
  let dx = Number(visualTarget.x) - center.x;
  let dy = Number(visualTarget.y) - center.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return visualTarget;
  if (Math.hypot(dx, dy) < 0.001) dx = 1;
  const candidates = [];
  if (Math.abs(dx) > 0.0001) {
    const boundaryX = dx < 0 ? Number(panel.left) : Number(panel.left) + Number(panel.width);
    const distance = (boundaryX - center.x) / dx;
    if (distance > 0) candidates.push(distance);
  }
  if (Math.abs(dy) > 0.0001) {
    const boundaryY = dy < 0 ? Number(panel.top) : Number(panel.top) + Number(panel.height);
    const distance = (boundaryY - center.y) / dy;
    if (distance > 0) candidates.push(distance);
  }
  const boundaryDistance = Math.min(...candidates);
  if (!Number.isFinite(boundaryDistance)) return visualTarget;
  const vectorLength = Math.max(0.001, Math.hypot(dx, dy));
  const outsideDistance = Math.max(0, Number(extension) || 0);
  return {
    x: center.x + dx * boundaryDistance + dx / vectorLength * outsideDistance,
    y: center.y + dy * boundaryDistance + dy / vectorLength * outsideDistance,
  };
}

function resolvePointReleaseTargetScale(layer, releaseNode, options = {}) {
  if (!layer || !releaseNode || releaseNode.destroyed) return null;
  const releaseVisual = getVisualTransformNode(releaseNode);
  if (!releaseVisual || releaseVisual.destroyed) return null;
  layer.toLocal({ x: 0, y: 0 }, releaseVisual);
  const releaseAxes = readTransformAxisLengths(releaseVisual);
  const releaseIconSize = Number(releaseNode.iconSize);
  if (!releaseAxes || !Number.isFinite(releaseIconSize) || releaseIconSize <= 0) return null;

  let targetWorldSize = null;
  const targetNode = options.targetNode;
  if (targetNode && !targetNode.destroyed) {
    const targetVisual = getVisualTransformNode(targetNode);
    const targetIconSize = Number(targetNode.iconSize);
    if (targetVisual && !targetVisual.destroyed && Number.isFinite(targetIconSize) && targetIconSize > 0) {
      layer.toLocal({ x: 0, y: 0 }, targetVisual);
      const targetAxes = readTransformAxisLengths(targetVisual);
      if (targetAxes) {
        targetWorldSize = {
          x: targetIconSize * targetAxes.x,
          y: targetIconSize * targetAxes.y,
        };
      }
    }
  } else if (options.targetStageRect) {
    const layerAxes = readTransformAxisLengths(layer);
    const width = Number(options.targetStageRect.width);
    const height = Number(options.targetStageRect.height);
    if (layerAxes && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      targetWorldSize = {
        x: width * layerAxes.x,
        y: height * layerAxes.y,
      };
    }
  }
  if (!targetWorldSize) return null;

  const currentScaleX = Math.max(0.01, Math.abs(Number(releaseNode.scale?.x) || 1));
  const currentScaleY = Math.max(0.01, Math.abs(Number(releaseNode.scale?.y) || 1));
  return {
    x: Math.max(0.01, currentScaleX * targetWorldSize.x / (releaseIconSize * releaseAxes.x)),
    y: Math.max(0.01, currentScaleY * targetWorldSize.y / (releaseIconSize * releaseAxes.y)),
  };
}

function makeIdListSignature(value) {
  if (!value) return "";
  const ids = value instanceof Set || Array.isArray(value)
    ? Array.from(value)
    : [value];
  return ids
    .map((id) => String(id || ""))
    .filter(Boolean)
    .sort()
    .join(",");
}

function makePointerOnlyPlanSnapshot(state, effectiveFolderSourceGhostedIds, folderDropFrameSuppressedIds, folderHandoffEntries) {
  const group = state.groupDragState;
  const renderedFolder = state.singleStageFolderState?.renderedFolder;
  if (
    !group ||
    group.phase !== "dragging" ||
    renderedFolder ||
    folderHandoffEntries?.size ||
    folderDropFrameSuppressedIds?.size
  ) return null;

  const frame = state.desktopFrame || {};
  const stageRect = state.stageRect || {};
  const hover = state.dragFolderHoverState || {};
  const pageTrackScrub = state.pageTrackScrub || {};
  return {
    key: [
      state.activePageIndex,
      state.folderPageSize,
      state.gridCols,
      state.gridRows,
      state.height,
      state.width,
      state.deviceResolution,
      state.isBatchSelectionActive ? 1 : 0,
      state.isEditMode ? 1 : 0,
      state.isSearchMode ? 1 : 0,
      state.isTextlessMode ? 1 : 0,
      state.showMissingLaunchTargetBadge ? 1 : 0,
      state.snapDesktopLayout ? 1 : 0,
      state.shouldSnapTrack ? 1 : 0,
      state.desktopTrackMotionKey || "",
      state.desktopGridDebugOptions?.paddingTop ?? "",
      state.dragFolderTargetId || "",
      hover.key || "",
      hover.phase || "",
      hover.targetId || "",
      hover.targetType || "",
      group.phase,
      group.totalCount || 0,
      makeIdListSignature(state.dragMeta?.draggedIds),
      makeIdListSignature(state.groupTransferOwnedFolderShellIds),
      makeIdListSignature(state.groupTransferOwnedItemIds),
      makeIdListSignature(state.selectedAppIds),
      makeIdListSignature(effectiveFolderSourceGhostedIds),
      makeIdListSignature(state.folderClosingHandoffIds || state.folderClosingHandoffId),
      frame.left ?? "",
      frame.top ?? "",
      frame.width ?? "",
      frame.height ?? "",
      stageRect.left ?? "",
      stageRect.top ?? "",
      stageRect.width ?? "",
      stageRect.height ?? "",
      pageTrackScrub.progress ?? "",
      pageTrackScrub.x ?? "",
      pageTrackScrub.offset ?? "",
    ].join("|"),
    references: [
      state.activePages,
      state.dragMeta,
      group.entries,
      state.selectedAppIds,
      state.focusedIcon,
      state.iconGesturePresentation,
      state.launchTargetStatusById,
      state.getDesktopPageRenderMode,
      state.getVisibleDesktopPage,
      state.isIconOpening,
      state.setPageRef,
    ],
  };
}

function canReusePointerOnlyPlan(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || !nextSnapshot || previousSnapshot.key !== nextSnapshot.key) return false;
  if (previousSnapshot.references.length !== nextSnapshot.references.length) return false;
  return previousSnapshot.references.every((value, index) => value === nextSnapshot.references[index]);
}

function projectStageLayoutRecordToClient(record) {
  return stageLayoutRecordToClientRect(record);
}

function getDesktopSourceOwnerKind(visualOwnership, folderId) {
  const key = makeDesktopSourceVisualKey(folderId);
  return key ? visualOwnership?.getOwner?.(key)?.kind || null : null;
}

function roundDebugObject(object) {
  if (!object || typeof object !== "object") return null;
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    result[key] = typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
  }
  return result;
}

function roundTransformObject(object) {
  if (!object || typeof object !== "object") return null;
  const pointValue = (point, key, fallback = 0) => Math.round(readNumber(point?.[key], fallback) * 1000) / 1000;
  return {
    alpha: Math.round(readNumber(object.alpha, 1) * 1000) / 1000,
    pivotX: pointValue(object.pivot, "x"),
    pivotY: pointValue(object.pivot, "y"),
    scaleX: pointValue(object.scale, "x", 1),
    scaleY: pointValue(object.scale, "y", 1),
    visible: object.visible ?? null,
    x: pointValue(object.position || object, "x"),
    y: pointValue(object.position || object, "y"),
  };
}

function maxAbsRectDelta(rows) {
  const result = { height: 0, left: 0, top: 0, width: 0 };
  for (const row of rows || []) {
    const delta = row?.delta;
    if (!delta) continue;
    result.height = Math.max(result.height, Math.abs(delta.height || 0));
    result.left = Math.max(result.left, Math.abs(delta.left || 0));
    result.top = Math.max(result.top, Math.abs(delta.top || 0));
    result.width = Math.max(result.width, Math.abs(delta.width || 0));
  }
  return result;
}

function worstRectDelta(rows) {
  let worst = null;
  let worstValue = -1;
  for (const row of rows || []) {
    const delta = row?.delta;
    if (!delta) continue;
    const value = Math.max(
      Math.abs(delta.height || 0),
      Math.abs(delta.left || 0),
      Math.abs(delta.top || 0),
      Math.abs(delta.width || 0)
    );
    if (value <= worstValue) continue;
    worstValue = value;
    worst = {
      height: delta.height,
      left: delta.left,
      slot: row.slot,
      top: delta.top,
      width: delta.width,
    };
  }
  return worst;
}

function drawDebugRect(graphics, rect, stageRect, color, alpha = 0.95, width = 3) {
  const local = clientRectToStageVisualRect(rect, stageRect);
  if (!local || local.width <= 0 || local.height <= 0) return;
  graphics
    .rect(local.left, local.top, local.width, local.height)
    .stroke({ alpha, color, width });
}

function springIconLayoutPosition(node, layoutTarget, markBoundsDirty) {
  motion(node)
    .layout()
    .spring(motionSprings.layout)
    .interrupt("retarget")
    .to({
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      x: layoutTarget.x,
      y: layoutTarget.y,
    })
    .start();
}

function snapIconLayoutPosition(node, layoutTarget, markBoundsDirty, reason) {
  killMotionOf(node, "x,y", { lane: "base", reason });
  node.position.set(layoutTarget.x, layoutTarget.y);
  markBoundsDirty();
}

function motionSpringTo(target, vars, config, options = {}) {
  const numericProps = Object.keys(vars || {}).filter((prop) => Number.isFinite(Number(vars[prop])));
  if (numericProps.length && shouldSkipMotionSpring(target, numericProps, vars, options)) return null;
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

function shouldSkipMotionSpring(target, props, vars, options = {}) {
  if (!target) return true;
  const snap = options.snap === true;
  return props.every((prop) => {
    const desired = Number(vars[prop]);
    const current = Number(target[prop]);
    const channel = motionRuntime.getChannel(target, prop);
    const active = channel?.activeBaseKey
      ? channel.base?.get(channel.activeBaseKey)
      : null;
    if (active && !active.done) {
      // A snap must cancel an in-flight spring even when its destination is
      // already correct. A regular update can leave the existing spring alone
      // only when it is heading to this same destination.
      return !snap && Math.abs(Number(active.to) - desired) <= MOTION_TARGET_EPSILON;
    }
    return Number.isFinite(current) && Math.abs(current - desired) <= MOTION_TARGET_EPSILON;
  });
}

export class DesktopLayer extends Container {
  constructor(options = {}) {
    super();
    this.visualRoot = new Container();
    this.pageTrack = new Container();
    this.desktopClosingUnderlayLayer = new Container();
    this.desktopClosingUnderlayLayer.eventMode = "none";
    this.handoffDebugLayer = new Graphics();
    this.onIconAction = options.onIconAction || (() => {});
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => {});
    this.onFolderGeometryChange = options.onFolderGeometryChange || (() => {});
    this.onFolderInternalActivityChange = options.onFolderInternalActivityChange || (() => {});
    this.onFolderRenderRequest = options.onFolderRenderRequest || (() => {});
    this.onFolderOutsidePointerDown = options.onFolderOutsidePointerDown || (() => {});
    this.onFolderPanelPointerDown = options.onFolderPanelPointerDown || (() => {});
    this.onFolderTitleFrameChange = options.onFolderTitleFrameChange || (() => {});
    this.onGroupReleaseComplete = options.onGroupReleaseComplete || (() => {});
    if (!options.iconBoundsRegistry) throw new Error("DesktopLayer requires iconBoundsRegistry");
    this.iconBoundsRegistry = options.iconBoundsRegistry;
    this.visualOwnership = options.visualOwnership || new VisualOwnershipRegistry();
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.renderCopy = {
      newFolderName: String(options.renderCopy?.newFolderName || ""),
      searchEmpty: String(options.renderCopy?.searchEmpty || ""),
    };
    this.folderDropFrameSuppressedIds = new Set();
    this.lastFolderSourceGhostingState = null;
    this.unsubscribeVisualOwnership = this.visualOwnership.subscribe(() => {
      this.onFolderRenderRequest("visual-ownership-committed");
    });
    this.singleStageFolderLayer = new FolderOverlayLayer({
      detachedClosingVisualLayer: this.desktopClosingUnderlayLayer,
      iconBoundsRegistry: this.iconBoundsRegistry,
      onDesktopSourceGhostingChange: () => this.onFolderRenderRequest("desktop-source-ownership-committed"),
      onClosingFolderPointerDown: (folderId, event) => this.onClosingFolderPointerDown(folderId, event),
      onClosingHandoffPrepare: (folderId) => this.startClosingFolderHandoffNow(folderId, { resetVisual: true, revealLabel: false }),
      onClosingHandoffReady: (folderId) => this.startClosingFolderHandoffNow(folderId, { revealLabel: false }),
      onClosingHandoffVisualRelease: (folderId) => this.releaseClosingFolderHandoffVisual(folderId),
      // Authoritative "is this folder's real desktop icon currently visible". The
      // overlay/coordinator's own released flags can desync from the desktop handoff
      // entry across the cross-layer round-trip; the open-interrupt guard must use
      // this desktop truth so it never re-detaches (and re-hides) an already-revealed
      // source icon.
      isHandoffSourceVisible: (folderId) => {
        const entry = this.getFolderHandoffEntry(folderId);
        return !entry || entry.visualReleased === true;
      },
      onIconAction: (action, originalEvent, item, source, iconNode) =>
        this.handleIconAction(action, originalEvent, item, source, iconNode),
      onInternalActivityChange: (active, folderId = null) => this.onFolderInternalActivityChange(active, folderId),
      onRenderRequest: (reason) => this.onFolderRenderRequest(reason),
      onOutsidePointerDown: (event) => this.onFolderOutsidePointerDown(event),
      onPanelPointerDown: (event) => this.onFolderPanelPointerDown(event),
      renderCopy: this.renderCopy,
      showFolderTitle: false,
      onTitleFrameChange: (frame) => this.onFolderTitleFrameChange(frame),
      visualCommitQueue: this.visualCommitQueue,
      visualOwnership: this.visualOwnership,
    });
    this.singleStageDiagnosticsLayer = new SingleStageDiagnosticsLayer();
    this.folderDropFillLayer = new FolderDropTargetLayer({
      part: "fill",
      onExitComplete: (folderId) => this.releaseFolderDropFrameSuppression(folderId),
      onExitStart: (folderId) => this.holdFolderDropFrameSuppression(folderId),
      onTargetActive: (folderId) => this.holdFolderDropFrameSuppression(folderId),
    });
    this.groupDragLayer = new GroupDragLayer({
      onPrewarmRequest: (reason) => this.onFolderRenderRequest(reason),
      onRenderRequest: (reason) => this.onFolderRenderRequest(reason),
      onReleaseAborted: (payload) => this.onGroupReleaseComplete(payload),
      onReleaseSettled: (payload) => this.onGroupReleaseComplete(payload),
      onVisualOwnershipChange: (reason) => this.onFolderRenderRequest(reason),
      resolveFolderClipGeometry: () => this.resolveGroupFolderClipGeometry(),
      resolveFolderNode: (payload) => this.resolveGroupReleaseFolderNode(payload),
      resolvePointTarget: (payload) => this.resolveGroupReleasePoint(payload),
      visualOwnership: this.visualOwnership,
    });
    this.folderDropStrokeLayer = new FolderDropTargetLayer({ part: "stroke" });
    this.dragHitDebugLayer = new DragHitDebugLayer();
    this.folderHandoffNodes = new Map();
    this.primaryFolderHandoffId = null;
    this.hasDesktopVisualAlpha = false;
    this.hasDesktopVisualTransform = false;
    this.hasFolderOverlayAlpha = false;
    this.hasFolderOverlayTransform = false;
    this.lastFolderHandoffDebugSnapshot = null;
    this.lastDesktopRenderPlan = null;
    this.lastPointerOnlyPlanSnapshot = null;
    this.desktopPlanRevision = 0;
    this.folderPresentationGeometryCache = { geometryById: null, version: null };
    this.iconNodes = new Map();
    this.retiredIconNodes = new WeakSet();
    this.pageTrackMotion = createPageTrackMotionState();
    this.boundsRegistration = null;
    this.boundsFlushQueued = false;
    this.boundsDirty = false;
    this.emptyText = createPixiText({
      text: this.renderCopy.searchEmpty,
      style: { fill: 0xffffff, fontSize: 15, alpha: 0.74, fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.emptyText.anchor.set(0.5);
    this.visualRoot.addChild(this.pageTrack);
    this.visualRoot.addChild(this.emptyText);
    this.addChild(this.folderDropFillLayer);
    this.addChild(this.visualRoot);
    this.addChild(this.desktopClosingUnderlayLayer);
    this.addChild(this.singleStageFolderLayer);
    this.addChild(this.folderDropStrokeLayer);
    // The stroke is part of the drop target chrome.  Keep it below the
    // dragged actor so the actor can visibly enter the target instead of
    // being painted underneath the folder outline.
    this.addChild(this.groupDragLayer);
    this.addChild(this.singleStageDiagnosticsLayer);
    this.addChild(this.handoffDebugLayer);
    this.addChild(this.dragHitDebugLayer);
    this.unregisterFolderHandoffDiagnosticClear = sceneDiagnosticsState.registerClearHandler(
      "folderHandoff",
      () => this.handoffDebugLayer.clear(),
    );
    this.describeMotionTargets();
  }

  setRenderCopy(copy = {}) {
    this.renderCopy = {
      newFolderName: String(copy.newFolderName || ""),
      searchEmpty: String(copy.searchEmpty || ""),
    };
    this.emptyText.text = this.renderCopy.searchEmpty;
    this.singleStageFolderLayer.setRenderCopy(this.renderCopy);
  }

  get folderHandoffNode() {
    return this.getPrimaryFolderHandoffNode();
  }

  set folderHandoffNode(entry) {
    if (!entry) {
      this.primaryFolderHandoffId = null;
      return;
    }
    if (!entry.folderId) return;
    this.getFolderHandoffNodes().set(entry.folderId, entry);
    this.primaryFolderHandoffId = entry.folderId;
  }

  makeFolderPresentationGeometrySnapshot() {
    const cache = this.folderPresentationGeometryCache || { geometryById: null, version: null };
    const version = this.iconBoundsRegistry.getVersion?.();
    if (
      version != null &&
      cache.version === version &&
      cache.geometryById
    ) return cache.geometryById;
    const geometryById = new Map();
    for (const node of this.iconNodes?.values?.() || []) {
      const folderId = node?.item?.type === "folder" ? node.item.id : null;
      if (!folderId) continue;
      const stableRecord = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId);
      geometryById.set(folderId, {
        liveRect: this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folderId),
        renderedRect: this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folderId),
        stableRect: projectStageLayoutRecordToClient(stableRecord),
      });
    }
    if (version != null) {
      this.folderPresentationGeometryCache = { geometryById, version };
    }
    return geometryById;
  }

  getRetiredIconNodes() {
    if (!(this.retiredIconNodes instanceof WeakSet)) this.retiredIconNodes = new WeakSet();
    return this.retiredIconNodes;
  }

  isIconNodeRetired(node) {
    return Boolean(node && this.getRetiredIconNodes().has(node));
  }

  discardFolderHandoffForRetiredNode(node) {
    const entries = this.getFolderHandoffNodes();
    for (const entry of Array.from(entries.values())) {
      if (entry.node !== node) continue;
      if (entry.cleanupFrame != null) entry.cleanupFrame.cancelled = true;
      entries.delete(entry.folderId);
      if (this.primaryFolderHandoffId === entry.folderId) this.setPrimaryFolderHandoffNode(null);
    }
  }

  retireIconNode(key, node, options = {}) {
    if (!node || !this.iconNodes.delete(key)) return false;
    const retiredNodes = this.getRetiredIconNodes();
    if (retiredNodes.has(node)) return true;
    retiredNodes.add(node);
    this.discardFolderHandoffForRetiredNode(node);
    killMotionOf(node);

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      destroyDisplayObjectAfterFrame(node, { children: true });
    };
    if (options.immediate === true) {
      node.alpha = 0;
      finalize();
      return true;
    }
    motion(node)
      .preset("fade")
      .layout()
      .interrupt("retarget")
      .to({ alpha: 0, onCancel: finalize, onComplete: finalize })
      .start();
    return true;
  }

  update(state) {
    return this.updateScene(state, { allowPlanReuse: true });
  }

  updateStructure(state) {
    return this.updateScene(state, { allowPlanReuse: false });
  }

  updateInteraction(state) {
    state = normalizeDesktopHandoffState(state);
    const ownership = this.groupDragLayer?.syncVisualOwnership?.(state.groupDragState) || {
      folderShellIds: new Set(),
      itemIds: new Set(),
    };
    const normalizedState = {
      ...state,
      groupTransferOwnedFolderShellIds: normalizeFolderIdSet(
        state.groupTransferOwnedFolderShellIds,
        ownership.folderShellIds
      ),
      groupTransferOwnedItemIds: normalizeFolderIdSet(
        state.groupTransferOwnedItemIds,
        ownership.itemIds
      ),
    };
    const plan = this.lastDesktopRenderPlan;
    if (!plan) {
      throw new Error("DesktopLayer.updateInteraction requires an initialized structural render plan");
    }
    this.stageRect = normalizedState.stageRect;
    this.widthValue = normalizedState.width;
    this.heightValue = normalizedState.height;
    this.updateFolderDropTargetLayers(plan, normalizedState);
    this.applyGroupTransferOwnershipSnapshot({
      folderShellIds: normalizedState.groupTransferOwnedFolderShellIds,
      itemIds: normalizedState.groupTransferOwnedItemIds,
    });
    this.applyFolderSourceGhosting(normalizedState);
    this.updateGroupDragLayer(normalizedState);
    return { fullPlanBuilds: 0, handoffReconciliations: 0, reconciledNodes: 0 };
  }

  updateScene(state, options = {}) {
    if (options.boundsTransaction !== false && typeof this.iconBoundsRegistry.transaction === "function") {
      return this.iconBoundsRegistry.transaction(() => this.updateScene(state, {
        ...options,
        boundsTransaction: false,
      }));
    }
    state = normalizeDesktopHandoffState(state);
    const groupTransferOwnership = this.groupDragLayer?.syncVisualOwnership?.(state.groupDragState) || {
      folderShellIds: new Set(),
      itemIds: new Set(),
    };
    state = {
      ...state,
      groupTransferOwnedFolderShellIds: normalizeFolderIdSet(
        state.groupTransferOwnedFolderShellIds,
        groupTransferOwnership.folderShellIds
      ),
      groupTransferOwnedItemIds: normalizeFolderIdSet(
        state.groupTransferOwnedItemIds,
        groupTransferOwnership.itemIds
      ),
    };
    const effectiveFolderSourceGhostedIds = normalizeFolderIdSet(
      state.folderSourceGhostedIds,
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership),
      this.singleStageFolderLayer.getDesktopSourceGhostedIds?.()
    );
    const folderHandoffEntries = this.getFolderHandoffNodes();
    const pointerOnlyPlanSnapshot = makePointerOnlyPlanSnapshot(
      state,
      effectiveFolderSourceGhostedIds,
      this.folderDropFrameSuppressedIds,
      folderHandoffEntries
    );
    const canReusePlan = options.allowPlanReuse === true && canReusePointerOnlyPlan(
      this.lastPointerOnlyPlanSnapshot,
      pointerOnlyPlanSnapshot
    );
    const nextPlanRevision = Math.max(0, Number(this.desktopPlanRevision) || 0) + 1;
    const plan = canReusePlan
      ? {
        ...this.lastDesktopRenderPlan,
        state,
      }
      : {
        ...buildDesktopRenderPlan(state, {
          effectiveFolderSourceGhostedIds,
          folderDropFrameSuppressedIds: this.folderDropFrameSuppressedIds,
          folderGeometryById: this.makeFolderPresentationGeometrySnapshot(),
          folderHandoffEntries,
          folderLayer: this.singleStageFolderLayer,
        }),
        revision: nextPlanRevision,
      };
    if (!canReusePlan) this.desktopPlanRevision = nextPlanRevision;
    this.lastPointerOnlyPlanSnapshot = pointerOnlyPlanSnapshot;
    state = plan.state;
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    this.describeMotionTargets(state);
    this.applyDesktopVisualTransform(state);
    this.applyDesktopVisualAlpha(state);
    this.applyFolderOverlayTransform(state);
    this.applyFolderOverlayAlpha(state);
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    const previousPlan = this.lastDesktopRenderPlan;
    const shouldApplyDesktopPlan = !canReusePlan;
    const pageTrackScopeChanged = Boolean(
      previousPlan?.pageTrack && previousPlan.pageTrack.scope !== plan.pageTrack.scope
    );
    this.lastDesktopRenderPlan = plan;

    if (shouldApplyDesktopPlan) {
      const previousEntries = new Map((previousPlan?.entries || []).map((entry) => [entry.key, entry]));
      if (pageTrackScopeChanged) {
        this.iconBoundsRegistry.clearBounds(previousPlan.clearLaunchArea);
      }
      this.iconBoundsRegistry.clearBounds(plan.clearLaunchArea);
      for (const folderId of plan.clearFolderPreviewChildIds) {
        this.iconBoundsRegistry.clearBounds({ folderId, kind: BOUNDS_KIND.PREVIEW_CHILD });
      }
      for (const pageRef of plan.pageRefs) {
        state.setPageRef(pageRef.element, pageRef.pageIndex);
      }

      const seen = new Set();
      const boundsEntries = [];
      const groupTransferOwnedItemIds = state.groupTransferOwnedItemIds || new Set();
      const groupTransferOwnedFolderShellIds = state.groupTransferOwnedFolderShellIds || new Set();
      for (const entry of plan.entries) {
        const {
          effectiveFolderHandoffEntry,
          isActiveFolderClosingHandoff,
          isFolderClosingHandoff,
          item,
          key,
          layoutTarget,
          nodeState,
          shouldRetireStaleHandoff,
        } = entry;
        const previousEntry = previousEntries.get(key);
        const shouldSpringLayout = !previousEntry ||
          previousEntry.isFolderClosingHandoff !== isFolderClosingHandoff ||
          isDesktopLayoutTargetChanged(previousEntry.layoutTarget, layoutTarget);
        if (shouldRetireStaleHandoff) this.clearFolderHandoffNode(item.id);
        seen.add(key);
        let node = this.iconNodes.get(key);
        const isNewNode = !node;
        const shouldSnapDragHandoffLayout = !isFolderClosingHandoff && (
          entry.isActiveDraggedItem || entry.isGroupTransferShellOwned
        );
        const shouldSnapResizeLayout = !isFolderClosingHandoff && state.snapDesktopLayout === true;
        if (isNewNode) {
          node = new IconNode({
            onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
              this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
          });
          this.iconNodes.set(key, node);
          this.pageTrack.addChild(node);
        } else if ((shouldSnapDragHandoffLayout || shouldSnapResizeLayout) && shouldSpringLayout) {
          snapIconLayoutPosition(
            node,
            layoutTarget,
            markBoundsDirty,
            shouldSnapDragHandoffLayout
              ? DESKTOP_DRAG_HANDOFF_LAYOUT_REASON
              : DESKTOP_RESIZE_LAYOUT_REASON
          );
        } else if (!isFolderClosingHandoff && shouldSpringLayout) {
          springIconLayoutPosition(node, layoutTarget, markBoundsDirty);
        }

        node.stageRect = state.stageRect;
        node.__folderSourceGhostedByOwnership = Boolean(entry.isFolderSourceGhosted);
        node.setState(nodeState);
        if (isNewNode) {
          node.alpha = isFolderClosingHandoff || shouldSnapDragHandoffLayout ? 1 : 0;
          node.position.set(layoutTarget.x, isFolderClosingHandoff || shouldSnapDragHandoffLayout ? layoutTarget.y : layoutTarget.y + 8);
          if (!isFolderClosingHandoff && !shouldSnapDragHandoffLayout) {
            motion(node)
              .preset("fade")
              .layout()
              .interrupt("retarget")
              .to({ alpha: 1 })
              .start();
            springIconLayoutPosition(node, layoutTarget, markBoundsDirty);
          }
        }
        let folderHandoffEntry = effectiveFolderHandoffEntry;
        if (isFolderClosingHandoff && isActiveFolderClosingHandoff) {
          this.ensureFolderHandoffNode(item.id, node, layoutTarget, { revealLabel: false });
          folderHandoffEntry = this.getFolderHandoffEntry(item.id);
        } else if (isFolderClosingHandoff && folderHandoffEntry) {
          this.syncFolderHandoffNode(node, layoutTarget, folderHandoffEntry);
        }
        if (isFolderClosingHandoff && folderHandoffEntry?.visualReleased) {
          this.revealFolderHandoffLabelWhenSettled(folderHandoffEntry, state, { animate: false });
        }

        if (entry.boundsEntry) {
          boundsEntries.push({
            ...entry.boundsEntry,
            node,
          });
        }
      }

      this.emptyText.visible = plan.emptyText.visible;
      this.emptyText.position.set(plan.emptyText.x, plan.emptyText.y);
      for (const [key, node] of this.iconNodes) {
        if (seen.has(key)) continue;
        this.retireIconNode(key, node, {
          immediate: pageTrackScopeChanged ||
            groupTransferOwnedItemIds.has(node?.item?.id) ||
            groupTransferOwnedFolderShellIds.has(node?.item?.id),
        });
      }

      this.boundsRegistration = makeDesktopBoundsRegistration(state, boundsEntries, plan.desktopFrame);
      updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
        debugMetadata: plan.pageTrack.debugMetadata,
        onFrame: markBoundsDirty,
        pageIndex: plan.pageTrack.pageIndex,
        pageSpan: plan.pageTrack.pageSpan,
        scrub: pageTrackScopeChanged ? null : plan.pageTrack.scrub,
        sourceLabel: plan.pageTrack.sourceLabel,
        snap: plan.pageTrack.snap || pageTrackScopeChanged || state.snapDesktopLayout === true,
        springConfig: motionSprings.layout,
      });
      this.flushInteractiveBounds({ force: true });
    }
    this.updateSingleStageFolderLayer(state);
    this.updateFolderDropTargetLayers(plan, state);
    this.applyGroupTransferOwnershipSnapshot({
      folderShellIds: state.groupTransferOwnedFolderShellIds,
      itemIds: state.groupTransferOwnedItemIds,
    });
    this.applyFolderSourceGhosting(state);
    this.updateGroupDragLayer(state);
    this.updateDiagnostics(state);
    const handoffReconciled = this.reconcileFolderHandoffs(state);
    return {
      fullPlanBuilds: shouldApplyDesktopPlan ? 1 : 0,
      handoffReconciliations: handoffReconciled ? 1 : 0,
      reconciledNodes: shouldApplyDesktopPlan ? plan.entries.length : 0,
    };
  }

  updateVisual(state) {
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    this.describeMotionTargets(state);
    this.applyDesktopVisualTransform(state);
    this.applyDesktopVisualAlpha(state);
    this.applyFolderOverlayTransform(state);
    this.applyFolderOverlayAlpha(state);
    return { fullPlanBuilds: 0, handoffReconciliations: 0, reconciledNodes: 0 };
  }

  updateDiagnostics(state) {
    this.singleStageDiagnosticsLayer.update(state.singleStageFolderState, {
      enabled: state.singleStageDiagnosticsEnabled,
      iconBoundsRegistry: this.iconBoundsRegistry,
    });
    this.dragHitDebugLayer?.update?.(state.dragHitDebugState, {
      enabled: state.dragHitDebugOptions?.enabled === true,
      stageRect: state.stageRect,
    });
    return { fullPlanBuilds: 0, handoffReconciliations: 0, reconciledNodes: 0 };
  }

  tickFolderHandoff(state) {
    const handoffReconciled = this.reconcileFolderHandoffs(state);
    return {
      fullPlanBuilds: 0,
      handoffReconciliations: handoffReconciled ? 1 : 0,
      reconciledNodes: 0,
    };
  }

  reconcileFolderHandoffs(state) {
    let handoffReconciled = false;
    for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
      if (this.reconcileFolderHandoffEntry(state, entry)) handoffReconciled = true;
    }
    if (handoffReconciled) this.onFolderRenderRequest("folder-handoff-reconciled");
    return handoffReconciled;
  }

  reconcileFolderHandoffEntry(state, entry) {
    const normalizedState = normalizeDesktopHandoffState(state);
    const rawSourceGhostingSettling = entry?.visualReleased === true && (
      normalizedState.folderSourceGhostedIds.has(entry.folderId) ||
      normalizedState.isFolderOpeningPreviewFrameGhosted?.(entry.folderId) === true
    );
    const noSubstitute = !rawSourceGhostingSettling &&
      shouldFinishFolderHandoffEntry(normalizedState, this.singleStageFolderLayer, entry.folderId);
    const pageTrackInFlight = noSubstitute && isPageTrackMotionActive(this.pageTrackMotion, this.pageTrack);
    if (noSubstitute && !pageTrackInFlight) {
      const hadCleanupFrame = entry.cleanupFrame != null;
      this.finishFolderHandoffNodeAfterFrame(entry.folderId);
      return !hadCleanupFrame && entry.cleanupFrame != null;
    } else if (!pageTrackInFlight && isStaleHiddenFolderHandoffEntry(state, entry, this.singleStageFolderLayer, entry.folderId)) {
      // Close finished without ever restoring this entry, yet a stale Vue closing
      // id keeps it alive and hidden. Restore the artwork without retiring; the
      // label still waits for source ownership to settle.
      const wasReleased = entry.visualReleased === true;
      this.restoreFolderHandoffVisual(entry);
      this.revealFolderHandoffLabelWhenSettled(entry, state, { animate: false });
      return !wasReleased && entry.visualReleased === true;
    }
    return false;
  }

  describeMotionTargets(state = {}) {
    const base = {
      height: state.height ?? this.heightValue ?? null,
      label: "Desktop",
      layer: "desktop",
      width: state.width ?? this.widthValue ?? null,
    };
    const describe = (target, metadata, overlayTarget = target) => {
      if (target) motionRuntime.describeTarget(target, { ...metadata, overlayTarget });
    };
    describe(this.visualRoot, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.visualRoot",
      targetPart: "visualRoot",
    }, this.visualRoot);
    describe(this.visualRoot?.scale, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.visualScale",
      targetPart: "visualRoot.scale",
    }, this.visualRoot);
    describe(this.desktopClosingUnderlayLayer, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.closingUnderlay",
      targetPart: "closingUnderlay",
    }, this.desktopClosingUnderlayLayer);
    describe(this.desktopClosingUnderlayLayer?.scale, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.closingUnderlayScale",
      targetPart: "closingUnderlay.scale",
    }, this.desktopClosingUnderlayLayer);
    describe(this.singleStageFolderLayer, {
      ...base,
      kind: "FolderOverlay",
      sourceLabel: "folder.overlay",
      targetPart: "singleStageFolderLayer",
    }, this.singleStageFolderLayer);
    describe(this.singleStageFolderLayer?.scale, {
      ...base,
      kind: "FolderOverlay",
      sourceLabel: "folder.overlayScale",
      targetPart: "singleStageFolderLayer.scale",
    }, this.singleStageFolderLayer);
    describe(this.pageTrack, {
      ...base,
      kind: "PageTrack",
      label: "Desktop page track",
      sourceLabel: "desktop.pageTrack",
      targetPart: "pageTrack",
    }, this.pageTrack);
  }

  applyDesktopVisualTransform(state) {
    const transform = state.desktopVisualTransform || {};
    const scale = Math.max(0.01, readNumber(transform.scale, 1));
    const offsetY = readNumber(transform.y, 0);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + offsetY;
    const shouldSnapResizeLayout = state.snapDesktopLayout === true;
    this.visualRoot.pivot.set(centerX, centerY);
    this.desktopClosingUnderlayLayer.pivot.set(centerX, centerY);
    if (!this.hasDesktopVisualTransform) {
      this.visualRoot.position.set(centerX, targetY);
      this.visualRoot.scale.set(scale);
      this.desktopClosingUnderlayLayer.position.set(centerX, targetY);
      this.desktopClosingUnderlayLayer.scale.set(scale);
      this.hasDesktopVisualTransform = true;
      return;
    }
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    const motionOptions = {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnapResizeLayout,
    };
    motionSpringTo(this.visualRoot, { x: centerX, y: targetY }, motionSprings.settle, motionOptions);
    motionSpringTo(this.visualRoot.scale, { x: scale, y: scale }, motionSprings.settle, motionOptions);
    motionSpringTo(this.desktopClosingUnderlayLayer, { x: centerX, y: targetY }, motionSprings.settle, motionOptions);
    motionSpringTo(this.desktopClosingUnderlayLayer.scale, { x: scale, y: scale }, motionSprings.settle, motionOptions);
  }

  applyDesktopVisualAlpha(state) {
    const alpha = resolveDesktopVisualAlpha(state);
    this.visualRoot.visible = true;
    this.visualRoot.interactiveChildren = alpha > 0.001;
    this.desktopClosingUnderlayLayer.visible = true;
    this.desktopClosingUnderlayLayer.interactiveChildren = false;
    if (!this.hasDesktopVisualAlpha) {
      this.visualRoot.alpha = alpha;
      this.desktopClosingUnderlayLayer.alpha = alpha;
      this.hasDesktopVisualAlpha = true;
      return;
    }
    motionSpringTo(this.visualRoot, { alpha }, motionSprings.settle);
    motionSpringTo(this.desktopClosingUnderlayLayer, { alpha }, motionSprings.settle);
  }

  applyFolderOverlayAlpha(state) {
    const alpha = resolveLaunchpadVisualAlpha(state);
    this.singleStageFolderLayer.visible = true;
    this.singleStageFolderLayer.interactiveChildren = alpha > 0.001;
    if (!this.hasFolderOverlayAlpha) {
      this.singleStageFolderLayer.alpha = alpha;
      this.hasFolderOverlayAlpha = true;
      return;
    }
    motionSpringTo(this.singleStageFolderLayer, { alpha }, motionSprings.settle);
  }

  hasSingleStageFolderOverlayContent(state = {}) {
    if (typeof state.isFolderOverlayActive === "boolean") return state.isFolderOverlayActive;
    return Boolean(state.singleStageFolderState?.renderedFolder);
  }

  applyFolderOverlayTransform(state) {
    const transform = resolveLaunchpadVisualTransform(state);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + transform.y;
    this.singleStageFolderLayer.pivot.set(centerX, centerY);
    const shouldSnap = state.snapDesktopLayout === true || !this.hasSingleStageFolderOverlayContent(state);
    if (!this.hasFolderOverlayTransform) {
      this.singleStageFolderLayer.position.set(centerX, targetY);
      this.singleStageFolderLayer.scale.set(transform.scale);
      this.hasFolderOverlayTransform = true;
      return;
    }
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    motionSpringTo(this.singleStageFolderLayer, { x: centerX, y: targetY }, motionSprings.settle, {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnap,
    });
    motionSpringTo(this.singleStageFolderLayer.scale, { x: transform.scale, y: transform.scale }, motionSprings.settle, {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnap,
    });
  }

  updateSingleStageFolderLayer(state) {
    const liveX = Number.isFinite(Number(this.pageTrack?.x)) ? Number(this.pageTrack.x) : 0;
    const targetX = Number.isFinite(Number(this.lastDesktopRenderPlan?.targetX))
      ? Number(this.lastDesktopRenderPlan.targetX)
      : liveX;
    const desktopPageTrackOffset = { liveX, targetX };
    if (state.singleStageFolderState) {
      this.onFolderGeometryChange(this.singleStageFolderLayer.update({
        ...state.singleStageFolderState,
        desktopPageTrackOffset,
        groupTransferOwnedItemIds: state.groupTransferOwnedItemIds,
      }));
      return;
    }
    this.onFolderGeometryChange(this.singleStageFolderLayer.update({
      desktopPageTrackOffset,
      folderPanelRef: null,
      folderViewportRef: null,
      height: state.height,
      renderedFolder: null,
      stageRect: state.stageRect,
      width: state.width,
    }));
  }

  applyFolderSourceGhosting(state, options = {}) {
    state = normalizeDesktopHandoffState(state);
    if (options.remember !== false) this.lastFolderSourceGhostingState = state;
    const rawIds = state.folderSourceGhostedIds;
    const ownershipIds = normalizeFolderIdSet(
      state.groupTransferOwnedFolderShellIds,
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership),
      this.singleStageFolderLayer.getDesktopSourceGhostedIds?.()
    );
    for (const node of this.iconNodes.values()) {
      if (node.item?.type !== "folder" || !node.state) continue;
      const folderId = node.item.id;
      const rawGhosted = rawIds.has(folderId) || state.isFolderOpeningPreviewFrameGhosted?.(folderId);
      const ownershipGhosted = ownershipIds.has(folderId);
      const nextGhosted = rawGhosted || ownershipGhosted;
      const handoffEntry = this.getFolderHandoffEntry(folderId);
      if (handoffEntry) {
        const desktopSourceOwnerKind = getDesktopSourceOwnerKind(this.visualOwnership, folderId);
        const openingSourceGhosted = desktopSourceOwnerKind === "opening" ||
          isFolderOpeningSourceGhosted(state, folderId);
        const activeClosingHandoff = hasFolderClosingHandoffId(state, folderId) ||
          isFolderLayerHandoffActive(this.singleStageFolderLayer, folderId);
        const shouldKeepPreparedHandoff = handoffEntry.visualReleased !== true &&
          (activeClosingHandoff || (ownershipGhosted && !openingSourceGhosted));
        const retainsSourceVisibility = handoffEntry.visualReleased === true &&
          !openingSourceGhosted &&
          (activeClosingHandoff || rawGhosted || handoffEntry.cleanupFrame != null) &&
          nextGhosted;
        // Only retire the handoff node once the closing handoff is no longer
        // active; clearing it mid-handoff (rawGhosted is true throughout a close)
        // re-creates a fresh entry every frame, resetting visualReleased and
        // re-hiding visualWrap, so the icon stays blank until the active close ends.
        // Opening ownership is different: it must hide the real desktop source
        // through normal ghosted state instead of retaining a released close handoff.
        if (!shouldKeepPreparedHandoff && !retainsSourceVisibility && (rawGhosted || (ownershipGhosted && handoffEntry.visualReleased === true))) {
          this.clearFolderHandoffNode(folderId);
        } else {
          node.__folderSourceGhostedByOwnership = Boolean(nextGhosted);
          continue;
        }
      }
      const previousGhostedByOwnership = node.__folderSourceGhostedByOwnership === true;
      const nextGhostedByOwnership = Boolean(nextGhosted);
      const ownershipGhostMissingFromNode = nextGhostedByOwnership && !node.state.ghosted;
      if (previousGhostedByOwnership === nextGhostedByOwnership && !ownershipGhostMissingFromNode) continue;
      const baseGhosted = Boolean(node.state.ghosted) && !previousGhostedByOwnership;
      node.__folderSourceGhostedByOwnership = nextGhostedByOwnership;
      node.setState({ ...node.state, ghosted: baseGhosted || nextGhostedByOwnership });
    }
  }

  commitFolderSourceGhosting() {
    if (!this.lastFolderSourceGhostingState) return;
    this.applyFolderSourceGhosting(this.lastFolderSourceGhostingState);
    this.reconcileFolderHandoffEntries(this.lastFolderSourceGhostingState);
  }

  reconcileFolderHandoffEntries(state = this.lastFolderSourceGhostingState || {}) {
    for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
      this.reconcileFolderHandoffEntry(state, entry);
    }
  }

  updateFolderDropTargetLayers(plan, state) {
    const target = plan?.folderDropTarget || null;
    const targetEntry = target
      ? plan.entries.find((entry) => entry.item?.id === target.targetId && entry.item?.type === "folder") || null
      : null;
    const context = {
      exitTransition: plan?.folderDropTargetExit || null,
      stageRect: state.stageRect,
      targetNode: targetEntry ? this.iconNodes.get(targetEntry.key) || null : null,
    };
    this.folderDropFillLayer?.update?.(target, context);
    this.folderDropStrokeLayer?.update?.(target, context);
  }

  holdFolderDropFrameSuppression(folderId) {
    if (!folderId) return;
    this.folderDropFrameSuppressedIds.add(folderId);
  }

  releaseFolderDropFrameSuppression(folderId) {
    if (!folderId || !this.folderDropFrameSuppressedIds.delete(folderId)) return;
    this.onFolderRenderRequest("folder-drop-target-exit-complete");
  }

  updateGroupDragLayer(state) {
    this.groupDragLayer?.update?.({
      deviceResolution: state.deviceResolution,
      desktopVisualSpec: makeDesktopDragVisualSpec(this.lastDesktopRenderPlan),
      dragFolderHoverState: state.dragFolderHoverState,
      folderPageSize: state.folderPageSize,
      folderVisualSpec: this.singleStageFolderLayer?.stableFolderSlotContext?.visualSpec || null,
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      groupState: state.groupDragState,
      height: state.height,
      iconSize: state.iconSize,
      isTextlessMode: state.isTextlessMode,
      launchTargetStatusById: state.launchTargetStatusById,
      releasePrewarmCount: state.isBatchSelectionActive
        ? Math.max(
          1,
          Number(state.folderPageSize) || 1,
          (Number(state.gridCols) || 1) * (Number(state.gridRows) || 1)
        )
        : 0,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stageRect: state.stageRect,
      width: state.width,
    });
  }

  applyImmediateGroupTransferOwnership(group) {
    const ownership = this.groupDragLayer.syncVisualOwnership(group);
    return this.applyGroupTransferOwnershipSnapshot(ownership);
  }

  applyGroupTransferOwnershipSnapshot(ownership = {}) {
    const itemIds = ownership.itemIds instanceof Set ? ownership.itemIds : new Set();
    const folderShellIds = ownership.folderShellIds instanceof Set ? ownership.folderShellIds : new Set();
    let changed = false;
    for (const node of this.iconNodes.values()) {
      if (!node?.state) continue;
      const wasDirectlyOwned = node.__groupTransferGhostedByOwnership === true;
      const isDirectlyOwned = itemIds.has(node.item?.id) || folderShellIds.has(node.item?.id);
      const previousSuppressedFolderPreviewChildIds = node.__groupTransferSuppressedFolderPreviewChildIds || [];
      const suppressedFolderPreviewChildIds = node.item?.type === "folder"
        ? (node.item.childPages || [])
          .flatMap((page) => page || [])
          .filter((child) => itemIds.has(child?.id))
          .map((child) => child.id)
        : [];
      const previewSuppressionChanged = previousSuppressedFolderPreviewChildIds.length !== suppressedFolderPreviewChildIds.length ||
        previousSuppressedFolderPreviewChildIds.some((id, index) => id !== suppressedFolderPreviewChildIds[index]);
      if (!wasDirectlyOwned && !isDirectlyOwned && !previewSuppressionChanged) continue;
      if (isDirectlyOwned && !wasDirectlyOwned) {
        killMotionOf(node, null, { reason: "group-release-source-handoff" });
        killMotionOf(node.scale, null, { reason: "group-release-source-handoff" });
      }
      if (!isDirectlyOwned && wasDirectlyOwned) {
        const committedEntry = this.lastDesktopRenderPlan?.entries?.find(
          (entry) => entry.item?.id === node.item?.id
        );
        if (committedEntry?.layoutTarget) {
          snapIconLayoutPosition(
            node,
            committedEntry.layoutTarget,
            () => this.markInteractiveBoundsDirty(),
            GROUP_TRANSFER_OWNERSHIP_HANDOFF_LAYOUT_REASON
          );
        }
      }
      const baseGhosted = Boolean(node.state.ghosted) && !wasDirectlyOwned;
      node.__groupTransferGhostedByOwnership = isDirectlyOwned;
      node.__groupTransferSuppressedFolderPreviewChildIds = [...suppressedFolderPreviewChildIds];
      node.setState({
        ...node.state,
        dragging: isDirectlyOwned ? node.state.dragging : false,
        ghosted: baseGhosted || node.__folderSourceGhostedByOwnership === true || isDirectlyOwned,
        suppressedFolderPreviewChildIds,
        suppressLabelRevealAfterGhost: true,
      });
      changed = true;
    }
    for (const node of this.singleStageFolderLayer?.iconNodes?.values?.() || []) {
      if (!node?.state) continue;
      const wasDirectlyOwned = node.__groupTransferGhostedByOwnership === true;
      const isDirectlyOwned = itemIds.has(node.item?.id);
      if (wasDirectlyOwned === isDirectlyOwned) continue;
      if (isDirectlyOwned) {
        killMotionOf(node, null, { reason: "group-release-folder-source-handoff" });
        killMotionOf(node.scale, null, { reason: "group-release-folder-source-handoff" });
      }
      const baseGhosted = Boolean(node.state.ghosted) && !wasDirectlyOwned;
      node.__groupTransferGhostedByOwnership = isDirectlyOwned;
      node.setState({
        ...node.state,
        dragging: isDirectlyOwned ? node.state.dragging : false,
        ghosted: baseGhosted || isDirectlyOwned,
      });
      changed = true;
    }
    return changed;
  }

  resolveGroupReleaseFolderNode({ target } = {}) {
    const folderId = target?.folderId || null;
    if (!folderId) return null;
    const handoffNode = this.getFolderHandoffEntry(folderId)?.node;
    if (handoffNode && !handoffNode.destroyed) return handoffNode;
    const desktopNode = this.findIconNodeByItemId(folderId);
    if (desktopNode && !desktopNode.destroyed) return desktopNode;
    for (const node of this.singleStageFolderLayer?.iconNodes?.values?.() || []) {
      if (node?.item?.id === folderId && !node.destroyed) return node;
    }
    return null;
  }

  resolveGroupFolderClipGeometry() {
    const panelNode = this.singleStageFolderLayer?.panel || null;
    const panel = this.singleStageFolderLayer?.panelGeometry || null;
    const layer = this.groupDragLayer;
    if (!panelNode || panelNode.destroyed || !panel || !layer || layer.destroyed) return null;
    const origin = layer.toLocal({ x: 0, y: 0 }, panelNode);
    const xAxis = layer.toLocal({ x: 1, y: 0 }, panelNode);
    const yAxis = layer.toLocal({ x: 0, y: 1 }, panelNode);
    const scaleX = Math.hypot(xAxis.x - origin.x, xAxis.y - origin.y);
    const scaleY = Math.hypot(yAxis.x - origin.x, yAxis.y - origin.y);
    if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) {
      return null;
    }
    return {
      height: panel.height,
      radius: 48,
      rotation: Math.atan2(xAxis.y - origin.y, xAxis.x - origin.x),
      scaleX,
      scaleY,
      width: panel.width,
      x: origin.x,
      y: origin.y,
    };
  }

  resolveGroupReleasePoint({ entry, node: releaseNode, target, state } = {}) {
    const semanticAnchor = target?.semanticAnchor || null;
    const resolveStableFolderSlotStageRect = (anchor) => {
      const record = this.singleStageFolderLayer?.resolveStableIconSlotRecord?.(anchor);
      const clientRect = stageLayoutRecordToClientRect(record);
      return clientRectToStageVisualRect(clientRect, state?.stageRect);
    };
    const makeResolvedPoint = (visualTarget, targetScale = { x: 1, y: 1 }) => {
      const resolvedVisualTarget = entry?.visibilityPolicy?.kind === "desktop-occluded-egress"
        ? resolvePanelEgressPoint(
          visualTarget,
          this.singleStageFolderLayer?.panelGeometry || null
        )
        : visualTarget;
      return {
        point: resolveReleaseRootPoint(releaseNode, resolvedVisualTarget, targetScale),
        scale: targetScale,
      };
    };
    if (semanticAnchor?.kind?.startsWith("desktop-page-edge-")) {
      const goesLeft = semanticAnchor.kind.endsWith("-left");
      const width = Math.max(1, Number(state?.width) || 1);
      const height = Math.max(1, Number(state?.height) || 1);
      const laneY = Math.max(0, Math.min(1, Number(semanticAnchor.laneY) || 0.5));
      const metrics = getDesktopGridMetrics({
        cols: state?.gridCols,
        height,
        rows: state?.gridRows,
        width,
      });
      return makeResolvedPoint({
        x: goesLeft ? -28 : width + 28,
        y: metrics.gridTop + metrics.gridHeight * laneY,
      }, { x: 0.72, y: 0.72 });
    }
    if (semanticAnchor?.kind?.startsWith("folder-page-edge-")) {
      const panel = this.singleStageFolderLayer?.panelGeometry || null;
      if (!panel) return null;
      const goesLeft = semanticAnchor.kind.endsWith("-left");
      const grid = this.singleStageFolderLayer?.targetFolderGeometry?.grid || null;
      const laneY = Math.max(0, Math.min(1, Number(semanticAnchor.laneY) || 0.5));
      const stableSlotRect = resolveStableFolderSlotStageRect(semanticAnchor);
      return makeResolvedPoint({
        x: goesLeft ? panel.left - 24 : panel.left + panel.width + 24,
        y: stableSlotRect
          ? stableSlotRect.top + stableSlotRect.height / 2
          : grid
            ? grid.top + grid.height * laneY
            : panel.top + panel.height * laneY,
      }, { x: 0.62, y: 0.62 });
    }
    if (semanticAnchor?.kind === "folder-preview-slot") {
      const previewRect = this.iconBoundsRegistry?.getBounds?.(
        BOUNDS_KIND.PREVIEW_CHILD,
        BOUNDS_VARIANT.RENDERED,
        {
          childId: semanticAnchor.itemId || entry?.id,
          folderId: semanticAnchor.folderId,
          slotIndex: semanticAnchor.slotIndex,
        }
      );
      const previewStageRect = clientRectToStageVisualRect(previewRect, state?.stageRect);
      if (!previewStageRect) return null;
      const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
        targetStageRect: previewStageRect,
      });
      return makeResolvedPoint({
        x: previewStageRect.left + previewStageRect.width / 2,
        y: previewStageRect.top + previewStageRect.height / 2,
      }, targetScale);
    }
    if (semanticAnchor?.kind === "folder-center") {
      const folderNode = this.resolveGroupReleaseFolderNode({ target: semanticAnchor });
      const pose = folderNode?.getFolderCenterReleasePose?.(this.groupDragLayer);
      if (!pose?.center) return null;
      return makeResolvedPoint(pose.center, { x: 0.35, y: 0.35 });
    }
    if (semanticAnchor?.kind === "folder-open-slot") {
      const stableSlotRect = resolveStableFolderSlotStageRect(semanticAnchor);
      if (!stableSlotRect) return null;
      const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
        targetStageRect: stableSlotRect,
      });
      return makeResolvedPoint({
        x: stableSlotRect.left + stableSlotRect.width / 2,
        y: stableSlotRect.top + stableSlotRect.height / 2,
      }, targetScale);
    }
    const targetId = target?.id || entry?.id || null;
    if (!targetId) return null;
    if (semanticAnchor?.kind === "desktop-slot") {
      const pageIndex = Number.isFinite(Number(semanticAnchor.pageIndex))
        ? Number(semanticAnchor.pageIndex)
        : Number(target?.pageIndex) || 0;
      const stableRecord = this.iconBoundsRegistry?.getBounds?.(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
        {
          area: "desktop",
          id: targetId,
          pageIndex,
        }
      );
      const stableClientRect = stageLayoutRecordToClientRect(stableRecord);
      const stableStageRect = clientRectToStageVisualRect(stableClientRect, state?.stageRect);
      const stableIndex = Number(stableRecord?.meta?.index);
      const expectedIndex = Number(semanticAnchor.index);
      if (
        stableStageRect &&
        (!Number.isFinite(expectedIndex) || !Number.isFinite(stableIndex) || stableIndex === expectedIndex)
      ) {
        const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
          targetStageRect: stableStageRect,
        });
        return makeResolvedPoint({
          x: stableStageRect.left + stableStageRect.width / 2,
          y: stableStageRect.top + stableStageRect.height / 2,
        }, targetScale);
      }
      return null;
    }
    const nodeCandidates = [
      this.findIconNodeByItemId(targetId),
      ...Array.from(this.singleStageFolderLayer?.iconNodes?.values?.() || [])
        .filter((node) => node?.item?.id === targetId),
    ];
    for (const node of nodeCandidates) {
      if (!node || node.destroyed || !this.groupDragLayer) continue;
      const visualTarget = readVisualCenterInLayer(this.groupDragLayer, node);
      if (visualTarget) {
        const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
          targetNode: node,
        });
        return makeResolvedPoint(visualTarget, targetScale);
      }
    }
    const area = target?.area === "folder" ? "folder" : "desktop";
    const rect = this.iconBoundsRegistry?.getBounds?.(
      BOUNDS_KIND.LAUNCH,
      BOUNDS_VARIANT.RENDERED,
      {
        area,
        folderId: target?.folderId,
        id: targetId,
        pageIndex: target?.pageIndex,
      }
    );
    const stageRect = clientRectToStageVisualRect(rect, state?.stageRect);
    if (!stageRect) return null;
    const visualTarget = {
      x: stageRect.left + stageRect.width / 2,
      y: stageRect.top + stageRect.height / 2,
    };
    const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
      targetStageRect: stageRect,
    });
    return makeResolvedPoint(visualTarget, targetScale);
  }

  findFolderBoundsEntry(folderId) {
    const entries = this.boundsRegistration?.entries || [];
    return entries.find((entry) => entry?.item?.id === folderId && entry.item.type === "folder" && entry.area === "desktop") ||
      entries.find((entry) => entry?.item?.id === folderId && entry.item.type === "folder") ||
      null;
  }

  getFolderHandoffNodes() {
    if (!(this.folderHandoffNodes instanceof Map)) this.folderHandoffNodes = new Map();
    return this.folderHandoffNodes;
  }

  getPrimaryFolderHandoffNode() {
    const entries = this.getFolderHandoffNodes();
    if (this.primaryFolderHandoffId && entries.has(this.primaryFolderHandoffId)) {
      return entries.get(this.primaryFolderHandoffId);
    }
    return entries.values().next().value || null;
  }

  getFolderHandoffEntry(folderId = null) {
    const entries = this.getFolderHandoffNodes();
    if (folderId) return entries.get(folderId) || null;
    return this.getPrimaryFolderHandoffNode();
  }

  setPrimaryFolderHandoffNode(entry = null) {
    this.primaryFolderHandoffId = entry?.folderId || null;
  }

  startClosingFolderHandoffNow(folderId, options = {}) {
    const entry = this.findFolderBoundsEntry(folderId);
    const existing = this.getFolderHandoffEntry(folderId);
    const node = entry?.node || existing?.node || this.findIconNodeByItemId(folderId);
    const layoutTarget = entry?.handoffLayoutTarget || (entry ? { x: entry.x, y: entry.y } : existing?.layoutTarget);
    if (!folderId || !node || node.destroyed || this.isIconNodeRetired(node) || !layoutTarget) return false;
    return this.ensureFolderHandoffNode(folderId, node, layoutTarget, { revealLabel: false, ...options });
  }

  ensureFolderHandoffNode(folderId, node, layoutTarget, options = {}) {
    if (!folderId || !node || node.destroyed || this.isIconNodeRetired(node)) return false;
    const entries = this.getFolderHandoffNodes();
    let entry = entries.get(folderId) || null;
    if (!entry) {
      entry = {
        cleanupFrame: null,
        folderId,
        labelRevealStarted: false,
        node,
        originalIndex: this.getPageTrackChildIndex(node),
        visualHidden: false,
        visualReleased: false,
      };
      entries.set(folderId, entry);
    } else if (entry.node !== node) {
      this.restoreFolderHandoffNode(entry);
      entry.node = node;
      entry.originalIndex = this.getPageTrackChildIndex(node);
      entry.labelRevealStarted = false;
      entry.visualHidden = false;
      entry.visualReleased = false;
    } else if (options.resetVisual === true) {
      entry.labelRevealStarted = false;
      entry.visualHidden = false;
      entry.visualReleased = false;
    }
    if (entry.cleanupFrame != null) {
      entry.cleanupFrame.cancelled = true;
      entry.cleanupFrame = null;
    }
    this.setPrimaryFolderHandoffNode(entry);
    this.syncFolderHandoffNode(node, layoutTarget, entry);
    if (options.revealLabel !== false && entry.visualReleased) this.revealFolderHandoffLabel(entry);
    return true;
  }

  syncFolderHandoffNode(node = this.folderHandoffNode?.node, layoutTarget = null, handoffEntry = null) {
    const entry = handoffEntry || this.getFolderHandoffEntry(node?.item?.id || this.folderHandoffNode?.folderId || null);
    if (!entry || !node || node.destroyed || this.isIconNodeRetired(node)) return false;
    const target = layoutTarget || entry.layoutTarget;
    if (!target) return false;
    entry.node = node;
    entry.layoutTarget = target;
    killMotionOf(node);
    killMotionOf(node.scale);
    node.position.set(target.x, target.y);
    node.scale.set(target.scaleX || 1, target.scaleY || target.scaleX || 1);
    node.alpha = 1;
    node.visible = true;
    node.eventMode = "static";
    node.cursor = "pointer";
    if (node.state) {
      node.state = Object.freeze({
        ...node.state,
        draggable: true,
        ghosted: false,
        interactive: true,
        preserveNodeScale: true,
      });
    }
    node.resetFolderPreviewAfterGhost?.();
    if (!entry.visualReleased) {
      if (typeof node.setFolderHandoffSourceHidden === "function") node.setFolderHandoffSourceHidden(true);
      else node.setFolderHandoffVisualHidden?.(true);
      entry.visualHidden = true;
    } else if (entry.visualHidden) {
      if (typeof node.setFolderHandoffSourceHidden === "function") node.setFolderHandoffSourceHidden(false);
      else node.setFolderHandoffVisualHidden?.(false);
      entry.visualHidden = false;
    }
    if (node.parent === this.pageTrack && this.pageTrack.children.length > 1) {
      this.pageTrack.setChildIndex(node, this.pageTrack.children.length - 1);
    }
    return true;
  }

  finishFolderHandoffNodeAfterFrame(folderId = null) {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || entry.cleanupFrame != null) return;
    if (!entry.visualReleased) this.restoreFolderHandoffVisual(entry, { fadeLabel: true });
    else this.revealFolderHandoffLabelWhenSettled(entry, undefined, { animate: false });
    const cleanupFrame = { cancelled: false };
    entry.cleanupFrame = cleanupFrame;
    const finish = () => {
      if (cleanupFrame.cancelled || entry.cleanupFrame !== cleanupFrame) return;
      if (this.getFolderHandoffEntry(entry.folderId) !== entry) return;
      entry.cleanupFrame = null;
      this.clearFolderHandoffNode(entry.folderId);
    };
    motionRuntime.afterFrame(finish);
  }

  releaseClosingFolderHandoffVisual(folderId = null) {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || (folderId && entry.folderId !== folderId)) return;
    this.debugFolderHandoffRestore(entry, "desktop-restore-before");
    this.restoreFolderHandoffVisual(entry, { fadeLabel: true });
    this.debugFolderHandoffRestore(entry, "desktop-restore-after");
  }

  restoreFolderHandoffVisual(entry, options = {}) {
    const node = entry?.node;
    if (!node || node.destroyed || this.isIconNodeRetired(node)) return;
    entry.visualHidden = false;
    entry.visualReleased = true;
    const labelFadeActive = node.folderHandoffLabelRevealInProgress === true &&
      node.folderHandoffLabelFadeFrame != null;
    const shouldReleaseLabel = !entry.labelRevealStarted ||
      (
        options.fadeLabel !== false &&
        !labelFadeActive &&
        node.labelText?.visible &&
        Number(node.labelText.alpha) <= 0.001
      );
    if (shouldReleaseLabel) {
      entry.labelRevealStarted = true;
      if (typeof node.releaseFolderHandoffSource === "function") {
        node.releaseFolderHandoffSource({ fadeLabel: options.fadeLabel !== false });
      } else {
        node.setFolderHandoffVisualHidden?.(false);
        if (options.fadeLabel === false && typeof node.restoreLabelAfterGhost === "function") node.restoreLabelAfterGhost();
        else if (typeof node.revealLabelAfterGhost === "function") node.revealLabelAfterGhost();
        else if (node.labelText) node.labelText.alpha = 1;
      }
      return;
    }
    if (typeof node.setFolderHandoffSourceHidden === "function") node.setFolderHandoffSourceHidden(false);
    else node.setFolderHandoffVisualHidden?.(false);
  }

  isFolderHandoffLabelRevealSafe(entry, state = this.lastFolderSourceGhostingState || {}) {
    if (!entry || !entry.visualReleased || entry.visualHidden) return false;
    const normalized = normalizeDesktopHandoffState(state || {});
    if (normalized.folderSourceGhostedIds.has(entry.folderId)) return false;
    if (normalized.isFolderOpeningPreviewFrameGhosted?.(entry.folderId) === true) return false;
    const ownershipIds = normalizeFolderIdSet(
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership),
      this.singleStageFolderLayer.getDesktopSourceGhostedIds?.()
    );
    if (ownershipIds.has(entry.folderId)) return false;
    return shouldFinishFolderHandoffEntry(normalized, this.singleStageFolderLayer, entry.folderId);
  }

  revealFolderHandoffLabelWhenSettled(entry = this.folderHandoffNode, state = this.lastFolderSourceGhostingState || {}, options = {}) {
    if (!this.isFolderHandoffLabelRevealSafe(entry, state)) return false;
    this.revealFolderHandoffLabel(entry, options);
    return true;
  }

  revealFolderHandoffLabel(entry = this.folderHandoffNode, options = {}) {
    const node = entry?.node;
    if (!entry || entry.labelRevealStarted || !node || node.destroyed || !node.labelText?.visible) return;
    entry.labelRevealStarted = true;
    if (typeof node.releaseFolderHandoffSource === "function") {
      node.releaseFolderHandoffSource({ fadeLabel: options.animate !== false });
    } else if (options.animate === false && typeof node.restoreLabelAfterGhost === "function") node.restoreLabelAfterGhost();
    else if (typeof node.revealLabelAfterGhost === "function") node.revealLabelAfterGhost();
    else node.labelText.alpha = 1;
  }

  clearFolderHandoffNode(folderId = null) {
    if (!folderId) {
      for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
        this.clearFolderHandoffNode(entry.folderId);
      }
      return;
    }
    const entry = this.getFolderHandoffEntry(folderId);
    if (entry) {
      this.lastFolderHandoffDebugSnapshot = this.makeFolderHandoffDebugSnapshot(entry, {
        active: false,
        clearing: true,
      }) || this.lastFolderHandoffDebugSnapshot;
    }
    if (!entry) return;
    if (entry.cleanupFrame != null) entry.cleanupFrame.cancelled = true;
    this.getFolderHandoffNodes().delete(entry.folderId);
    if (this.primaryFolderHandoffId === entry.folderId) this.setPrimaryFolderHandoffNode(null);
    this.restoreFolderHandoffNode(entry);
  }

  restoreFolderHandoffNode(entry) {
    const node = entry?.node;
    if (!node || node.destroyed || this.isIconNodeRetired(node)) return;
    this.restoreFolderHandoffVisual(entry, { fadeLabel: true });
    if (node.parent !== this.pageTrack) return;
    const childCount = this.pageTrack.children.length;
    if (!childCount) return;
    const targetIndex = Math.max(0, Math.min(entry.originalIndex ?? childCount - 1, childCount - 1));
    if (this.getPageTrackChildIndex(node) !== targetIndex) this.pageTrack.setChildIndex(node, targetIndex);
    if (entry.visualReleased) this.revealFolderHandoffLabel(entry, { animate: false });
  }

  getPageTrackChildIndex(node) {
    return this.pageTrack.children.indexOf(node);
  }

  debugFolderHandoffRestore(entry, phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return null;
    const snapshot = this.makeFolderHandoffDebugSnapshot(entry, { phase });
    if (!snapshot) return null;
    sceneDiagnosticsState.publish("folderHandoff", {
      ...snapshot,
      desktopLogged: false,
      phase,
    });
    console.log("[folder-handoff-debug] desktop-restore", {
      ...snapshot,
      phase,
    });
    return snapshot;
  }

  makeFolderHandoffDebugSnapshot(entry, options = {}) {
    const node = entry?.node;
    if (!entry || !node || node.destroyed) return null;
    const registration = this.boundsRegistration || {};
    const stageRect = registration.stageRect || this.stageRect;
    const folderId = entry.folderId || node.item?.id || null;
    const thumbRect = node.getFolderThumbBounds?.(stageRect) || null;
    const iconRect = node.getIconBounds?.(stageRect) || null;
    const liveTargetRect = folderId ? this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folderId) : null;
    const stableStageLayoutTargetRecord = folderId ? this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId) : null;
    const stableTargetRect = projectStageLayoutRecordToClient(stableStageLayoutTargetRecord);
    const registeredThumbRect = folderId ? this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folderId) : null;
    const targetRect = liveTargetRect || registeredThumbRect || stableTargetRect;
    const childRows = [];
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(stageRect, slotIndex);
      const targetChildRect = targetRect ? makeFolderThumbPreviewRect(targetRect, slotIndex) : null;
      childRows.push({
        actual: roundRect(actualRect, 2),
        delta: rectDelta(actualRect, targetChildRect),
        slot: slotIndex,
        target: roundRect(targetChildRect, 2),
      });
    }
    return {
      active: options.active !== false,
      childMaxDelta: maxAbsRectDelta(childRows),
      childRows,
      childWorstDelta: worstRectDelta(childRows),
      childIndex: this.getPageTrackChildIndex(node),
      clearing: options.clearing === true,
      desktopClosingUnderlayLayer: roundTransformObject(this.desktopClosingUnderlayLayer),
      folderId,
      iconRect: roundRect(iconRect, 2),
      layoutTarget: roundDebugObject(entry.layoutTarget),
      liveTargetRect: roundRect(liveTargetRect, 2),
      node: {
        alpha: Math.round((node.alpha ?? 0) * 1000) / 1000,
        eventMode: node.eventMode,
        folderChildrenWrapScaleX: node.folderChildrenWrap?.scale ? Math.round((node.folderChildrenWrap.scale.x ?? 1) * 1000) / 1000 : null,
        folderChildrenWrapScaleY: node.folderChildrenWrap?.scale ? Math.round((node.folderChildrenWrap.scale.y ?? 1) * 1000) / 1000 : null,
        folderChildrenWrapY: node.folderChildrenWrap ? Math.round((node.folderChildrenWrap.y || 0) * 1000) / 1000 : null,
        labelAlpha: node.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
        labelFadeFrameActive: node.folderHandoffLabelFadeFrame != null,
        labelRenderable: node.labelText ? node.labelText.renderable : null,
        labelRevealInProgress: node.folderHandoffLabelRevealInProgress === true,
        labelVisible: node.labelText ? node.labelText.visible : null,
        parentIsPageTrack: node.parent === this.pageTrack,
        scaleX: Math.round((node.scale?.x ?? 1) * 1000) / 1000,
        scaleY: Math.round((node.scale?.y ?? 1) * 1000) / 1000,
        visible: node.visible,
        visualWrapAlpha: node.visualWrap ? Math.round((node.visualWrap.alpha ?? 1) * 1000) / 1000 : null,
        visualWrapScaleX: node.visualWrap?.scale ? Math.round((node.visualWrap.scale.x ?? 1) * 1000) / 1000 : null,
        visualWrapScaleY: node.visualWrap?.scale ? Math.round((node.visualWrap.scale.y ?? 1) * 1000) / 1000 : null,
        visualWrapVisible: node.visualWrap ? node.visualWrap.visible : null,
        x: Math.round((node.x || 0) * 1000) / 1000,
        y: Math.round((node.y || 0) * 1000) / 1000,
      },
      originalIndex: entry.originalIndex ?? null,
      pageTrack: roundTransformObject(this.pageTrack),
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      phase: options.phase || null,
      registeredThumbRect: roundRect(registeredThumbRect, 2),
      singleStageFolderLayer: roundTransformObject(this.singleStageFolderLayer),
      source: options.source || "handoff-node",
      stableStageLayoutTargetRect: roundRect(stableStageLayoutTargetRecord, 2),
      stableTargetRect: roundRect(stableTargetRect, 2),
      stageRect: roundRect(stageRect, 2),
      stageScaleX: registration.stageRect?.width && registration.width ? Math.round((registration.stageRect.width / registration.width) * 1000000) / 1000000 : null,
      stageScaleY: registration.stageRect?.height && registration.height ? Math.round((registration.stageRect.height / registration.height) * 1000000) / 1000000 : null,
      targetDelta: rectDelta(thumbRect, targetRect),
      targetRect: roundRect(targetRect, 2),
      thumbRect: roundRect(thumbRect, 2),
      visualRoot: roundTransformObject(this.visualRoot),
    };
  }

  findIconNodeByItemId(itemId) {
    if (!itemId) return null;
    for (const node of this.iconNodes.values()) {
      if (node?.item?.id === itemId && !node.destroyed) return node;
    }
    return null;
  }

  getFolderHandoffDebugSnapshot(folderId = null) {
    const activeEntry = folderId ? this.getFolderHandoffEntry(folderId) : this.getFolderHandoffEntry();
    const activeSnapshot = this.makeFolderHandoffDebugSnapshot(activeEntry);
    if (activeSnapshot) {
      this.lastFolderHandoffDebugSnapshot = activeSnapshot;
      return activeSnapshot;
    }
    const node = this.findIconNodeByItemId(folderId);
    const actualSnapshot = this.makeFolderHandoffDebugSnapshot({
      folderId,
      layoutTarget: null,
      node,
      originalIndex: node ? this.getPageTrackChildIndex(node) : null,
    }, {
      active: false,
      source: "actual-node",
    });
    if (actualSnapshot) return actualSnapshot;
    if (!this.lastFolderHandoffDebugSnapshot) return null;
    return {
      ...this.lastFolderHandoffDebugSnapshot,
      active: false,
      stale: true,
    };
  }

  markInteractiveBoundsDirty() {
    this.boundsDirty = true;
    if (this.boundsFlushQueued) return;
    this.boundsFlushQueued = true;
    const flush = () => {
      this.boundsFlushQueued = false;
      this.flushInteractiveBounds();
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

  flushInteractiveBounds(options = {}) {
    if (!options.force && !this.boundsDirty) return;
    this.boundsDirty = false;
    this.refreshInteractiveBounds();
    this.singleStageFolderLayer?.refreshRegisteredIconBounds?.();
  }

  refreshInteractiveBounds() {
    const registration = this.boundsRegistration;
    if (!registration) return;
    for (const entry of registration.entries) {
      const { area, folderPresentation, handoffLayoutTarget, index, item, node, pageIndex, sizing, targetX, x, y } = entry;
      if (!item?.id || !node || node.destroyed) continue;
      const visualSpec = makeIconVisualSpecFromNodeState(node.state);
      const meta = { area, id: item.id, index, item, pageIndex, visualSpec };
      const visualOffsetY = getIconVisualOffsetY(registration.isTextlessMode);
      const handoffEntry = item.type === "folder" ? this.getFolderHandoffEntry(item.id) : null;
      const isReleasedFolderHandoffEntry = handoffEntry?.visualReleased === true;
      const isFolderClosingHandoff = folderPresentation?.handoff?.syncsNode === true ||
        (item.type === "folder" && (
          Boolean(handoffEntry && !isReleasedFolderHandoffEntry) ||
          (hasFolderClosingHandoffId(registration, item.id) && !isReleasedFolderHandoffEntry)
        ));
      const boundsTargets = resolveDesktopBoundsTargets({
        handoffLayoutTarget,
        isFolderClosingHandoff,
        item,
        node,
        registration,
        sizing,
        targetX,
        visualOffsetY,
        visualRoot: this.visualRoot,
        x,
        y,
      });
      if (boundsTargets.syncHandoffLayoutTarget && handoffEntry && folderPresentation?.handoff?.syncsNode !== false && !isReleasedFolderHandoffEntry) {
        this.syncFolderHandoffNode(node, boundsTargets.syncHandoffLayoutTarget, handoffEntry);
      }
      this.iconBoundsRegistry.registerBounds(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.RENDERED,
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.renderedClientIconBounds,
        meta
      );
      this.iconBoundsRegistry.registerBounds(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.LIVE_TARGET,
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.liveClientTargetBounds,
        meta
      );
      this.iconBoundsRegistry.registerBounds(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.stableStageLayoutTargetBounds,
        {
          ...meta,
          stageHeight: registration.height,
          stageRect: registration.stageRect,
          stageWidth: registration.width,
        }
      );
      if (area === "desktop") {
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.LIVE_TARGET, item.id, boundsTargets.liveClientTargetBounds, {
          ...meta,
        });
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, item.id, boundsTargets.stableStageLayoutTargetBounds, {
          ...meta,
          stageHeight: registration.height,
          stageRect: registration.stageRect,
          stageWidth: registration.width,
        });
      }
      if (item.type === "folder") {
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, item.id, boundsTargets.renderedClientThumbBounds, meta);
        if (area === "desktop") {
          this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, item.id, boundsTargets.liveClientTargetBounds, {
            ...meta,
          });
          this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, item.id, boundsTargets.stableStageLayoutTargetBounds, {
            ...meta,
            stageHeight: registration.height,
            stageRect: registration.stageRect,
            stageWidth: registration.width,
          });
        }
        this.registerFolderChildren(item, node, registration.stageRect, {
          liveThumbRect: boundsTargets.liveClientTargetBounds,
          stableStageLayoutThumbRect: boundsTargets.stableStageLayoutTargetBounds,
          stageHeight: registration.height,
          stageWidth: registration.width,
        });
        if (area === "desktop") this.debugFolderHandoffDesktopActual(item, node, registration);
      }
    }
  }

  debugFolderHandoffDesktopActual(folder, node, registration) {
    const options = getFolderHandoffDebugOptions();
    const debugState = sceneDiagnosticsState.read("folderHandoff");
    if (!options?.log || debugState?.desktopLogged || debugState?.folderId !== folder?.id) return;
    const rows = [];
    const actualThumbRect = node.getFolderThumbBounds(registration.stageRect);
    const stableStageLayoutTargetRecord = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folder.id);
    const stableTargetRect = projectStageLayoutRecordToClient(stableStageLayoutTargetRecord);
    const targetThumbRect = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folder.id) ||
      this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folder.id) ||
      stableTargetRect;
    rows.push({
      actual: roundRect(actualThumbRect, 2),
      delta: rectDelta(actualThumbRect, targetThumbRect),
      kind: "thumb",
      slot: "",
      target: roundRect(targetThumbRect, 2),
    });
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(registration.stageRect, slotIndex);
      const stableChildTargetRect = projectStageLayoutRecordToClient(
        this.iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, { childId: child.id, folderId: folder.id, slotIndex })
      );
      const targetRect = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.LIVE_TARGET, { childId: child.id, folderId: folder.id, slotIndex }) ||
        this.iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: child.id, folderId: folder.id, slotIndex }) ||
        stableChildTargetRect;
      rows.push({
        actual: roundRect(actualRect, 2),
        delta: rectDelta(actualRect, targetRect),
        kind: "child",
        slot: slotIndex,
        target: roundRect(targetRect, 2),
      });
    }
    sceneDiagnosticsState.publish("folderHandoff", {
      desktopLogged: true,
      desktopRows: rows,
    }, { merge: true });
    console.log("[folder-handoff-debug] desktop-actual", {
      folderId: folder.id,
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      stageScaleX: registration.stageRect?.width && registration.width ? registration.stageRect.width / registration.width : null,
      stageScaleY: registration.stageRect?.height && registration.height ? registration.stageRect.height / registration.height : null,
    });
    console.table(rows.map((row) => ({
      actualHeight: row.actual?.height ?? null,
      actualLeft: row.actual?.left ?? null,
      actualTop: row.actual?.top ?? null,
      actualWidth: row.actual?.width ?? null,
      deltaHeight: row.delta?.height ?? null,
      deltaLeft: row.delta?.left ?? null,
      deltaTop: row.delta?.top ?? null,
      deltaWidth: row.delta?.width ?? null,
      kind: row.kind,
      slot: row.slot,
      targetHeight: row.target?.height ?? null,
      targetLeft: row.target?.left ?? null,
      targetTop: row.target?.top ?? null,
      targetWidth: row.target?.width ?? null,
    })));
    if (options.overlay) {
      this.handoffDebugLayer.clear();
      drawDebugRect(this.handoffDebugLayer, actualThumbRect, registration.stageRect, 0xbf5af2, 0.98, options.lineWidth);
      for (const row of rows) {
        if (row.kind !== "child") continue;
        drawDebugRect(this.handoffDebugLayer, row.actual, registration.stageRect, 0xffffff, 0.9, options.lineWidth);
      }
    }
  }

  registerFolderChildren(folder, node, stageRect, target = null) {
    for (let index = 0; index < 9; index += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[index] : null;
      if (!child?.id) continue;
      const childTargets = resolveFolderPreviewChildBoundsTargets({ node, slotIndex: index, stageRect, target });
      const keyInput = { childId: child.id, folderId: folder.id, slotIndex: index };
      if (childTargets.renderedClientBounds) this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, keyInput, childTargets.renderedClientBounds);
      if (childTargets.liveClientTargetBounds) this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.LIVE_TARGET, keyInput, childTargets.liveClientTargetBounds);
      if (childTargets.stableStageLayoutTargetBounds) {
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, keyInput, childTargets.stableStageLayoutTargetBounds, {
          stageHeight: target.stageHeight,
          stageRect,
          stageWidth: target.stageWidth,
        });
      }
    }
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  getFolderVisualDebugSnapshot() {
    const readDisplay = (node) => ({
      alpha: Math.round((node?.alpha ?? 0) * 1000) / 1000,
      eventMode: node?.eventMode ?? null,
      labelAlpha: node?.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
      labelFadeFrameActive: node?.folderHandoffLabelFadeFrame != null,
      labelRenderable: node?.labelText?.renderable ?? null,
      labelRevealInProgress: node?.folderHandoffLabelRevealInProgress === true,
      labelVisible: node?.labelText?.visible ?? null,
      scaleX: Math.round((node?.scale?.x ?? 1) * 1000) / 1000,
      scaleY: Math.round((node?.scale?.y ?? 1) * 1000) / 1000,
      visible: node?.visible ?? null,
      visualWrapVisible: node?.visualWrap?.visible ?? null,
      x: Math.round((node?.x ?? 0) * 1000) / 1000,
      y: Math.round((node?.y ?? 0) * 1000) / 1000,
    });
    const folderNodes = [];
    for (const [key, node] of this.iconNodes || []) {
      if (node?.item?.type !== "folder") continue;
      folderNodes.push({
        display: readDisplay(node),
        id: node.item.id,
        key,
        sourceGhostedByOwnership: node.__folderSourceGhostedByOwnership === true,
        state: {
          draggable: node.state?.draggable ?? null,
          ghosted: node.state?.ghosted ?? null,
          interactive: node.state?.interactive ?? null,
          opening: node.state?.opening ?? null,
        },
      });
    }
    const overlay = this.singleStageFolderLayer;
    const lastState = normalizeDesktopHandoffState(this.lastFolderSourceGhostingState || {});
    const lastStateSourceIds = lastState.folderSourceGhostedIds;
    const ownershipSourceIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const overlaySourceIds = overlay?.getDesktopSourceGhostedIds?.() || new Set();
    const overlaySessionSnapshot = overlay?.folderVisualSession?.snapshot?.() || null;
    const overlayCloseSnapshot = overlaySessionSnapshot?.closing || null;
    const folderHandoffNodes = Array.from(this.getFolderHandoffNodes().values()).map((entry) => ({
      display: readDisplay(entry.node),
      folderId: entry.folderId || null,
      labelRevealStarted: entry.labelRevealStarted === true,
      visualHidden: entry.visualHidden === true,
      visualReleased: entry.visualReleased === true,
    }));
    return {
      detachedClosingVisuals: (overlay?.detachedClosingVisuals || []).map((visual) => ({
        clearing: visual.clearing === true,
        destroyed: visual.destroyed === true,
        folderId: visual.folderId || null,
        ownerToken: visual.ownerToken || null,
      })),
      folderHandoffNode: this.folderHandoffNode ? {
        display: readDisplay(this.folderHandoffNode.node),
        folderId: this.folderHandoffNode.folderId || null,
        labelRevealStarted: this.folderHandoffNode.labelRevealStarted === true,
        visualHidden: this.folderHandoffNode.visualHidden === true,
        visualReleased: this.folderHandoffNode.visualReleased === true,
      } : null,
      folderHandoffNodes,
      folderNodes,
      folderSourceGhostedIds: {
        lastState: Array.from(lastStateSourceIds),
        ownership: Array.from(ownershipSourceIds),
        overlay: Array.from(overlaySourceIds),
      },
      overlay: overlay ? {
        closingFolderId: overlayCloseSnapshot?.folderId || null,
        closingGhostKeys: overlayCloseSnapshot?.ghostIds || [],
        closingPreviewSwapKeys: overlayCloseSnapshot?.previewKeys || [],
        closingPreviewSwapLayerChildCount: overlay.closingPreviewSwapLayer?.children?.length ?? null,
        closingHandoffActive: overlayCloseSnapshot?.handoffActive === true,
        currentFolderId: overlay.currentFolderId || null,
        debug: overlay.getVisualDebugSnapshot?.() || null,
        openingGhostItemIds: overlaySessionSnapshot?.opening?.ghostIds || [],
        pageTrackVisible: overlay.pageTrack?.visible ?? null,
      } : null,
      ownership: this.visualOwnership?.snapshot?.() || [],
    };
  }

  destroy(options) {
    this.unregisterFolderHandoffDiagnosticClear?.();
    this.unregisterFolderHandoffDiagnosticClear = null;
    this.unsubscribeVisualOwnership?.();
    this.unsubscribeVisualOwnership = null;
    this.boundsRegistration = null;
    this.clearFolderHandoffNode();
    killMotionOf(this.visualRoot, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.visualRoot?.scale, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.desktopClosingUnderlayLayer, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.desktopClosingUnderlayLayer?.scale, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.singleStageFolderLayer, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.singleStageFolderLayer?.scale, null, { lane: "base", reason: "destroyed" });
    this.groupDragLayer?.destroy?.();
    this.groupDragLayer = null;
    this.lastPointerOnlyPlanSnapshot = null;
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    killMotionOf(this.pageTrack, null, { lane: "base", reason: "destroyed" });
    this.visualCommitQueue?.clear?.();
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
