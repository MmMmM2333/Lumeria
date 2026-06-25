import { Container, Graphics, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect, stageLayoutRecordToClientRect } from "../geometry/stageCoordinates.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { motionSprings } from "../animation/motionPresets.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import {
  readLaunchpadDebugValue,
  setLaunchpadDebugValue,
} from "../debugNamespace.js";
import { makeDesktopBoundsRegistration } from "./desktopBoundsRegistration.js";
import { resolveDesktopBoundsTargets, resolveFolderPreviewChildBoundsTargets } from "./desktopBoundsTargets.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { makeSyntheticPointerEvent } from "./iconSceneHelpers.js";
import { FolderOverlayLayer } from "./FolderOverlayLayer.js";
import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";
import { FolderVisualOwnershipRegistry } from "./folderVisualOwnershipRegistry.js";
import { SingleStageDiagnosticsLayer } from "./singleStageDiagnostics.js";
import { DragPreviewLayer } from "./DragPreviewLayer.js";
import { IconNode } from "../nodes/IconNode.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundRect,
} from "./folderHandoffDebug.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";
import {
  buildDesktopRenderPlan,
  getDesktopSourceGhostedIdsFromOwnership,
  hasFolderClosingHandoffId,
  isDesktopLayoutTargetChanged,
  isFolderLayerHandoffActive,
  isFolderLayerHoldingDesktopSource,
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

function projectStageLayoutRecordToClient(record) {
  return stageLayoutRecordToClientRect(record);
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
    this.onFolderOutsidePointerDown = options.onFolderOutsidePointerDown || (() => {});
    this.onFolderPanelPointerDown = options.onFolderPanelPointerDown || (() => {});
    this.onFolderTitleFrameChange = options.onFolderTitleFrameChange || (() => {});
    this.onDragReleaseComplete = options.onDragReleaseComplete || (() => {});
    if (!options.iconBoundsRegistry) throw new Error("DesktopLayer requires iconBoundsRegistry");
    this.iconBoundsRegistry = options.iconBoundsRegistry;
    this.visualOwnership = options.visualOwnership || new FolderVisualOwnershipRegistry();
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.lastFolderSourceGhostingState = null;
    this.unsubscribeVisualOwnership = this.visualOwnership.subscribe(() => this.commitFolderSourceGhosting());
    this.singleStageFolderLayer = new FolderOverlayLayer({
      detachedClosingVisualLayer: this.desktopClosingUnderlayLayer,
      iconBoundsRegistry: this.iconBoundsRegistry,
      onDesktopSourceGhostingChange: () => this.commitFolderSourceGhosting(),
      onClosingFolderPointerDown: (folderId, event) => this.onClosingFolderPointerDown(folderId, event),
      onClosingHandoffPrepare: (folderId) => this.startClosingFolderHandoffNow(folderId, { resetVisual: true, revealLabel: false }),
      onClosingHandoffReady: (folderId) => this.startClosingFolderHandoffNow(folderId),
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
      onOutsidePointerDown: (event) => this.onFolderOutsidePointerDown(event),
      onPanelPointerDown: (event) => this.onFolderPanelPointerDown(event),
      showFolderTitle: false,
      onTitleFrameChange: (frame) => this.onFolderTitleFrameChange(frame),
      visualCommitQueue: this.visualCommitQueue,
      visualOwnership: this.visualOwnership,
    });
    this.singleStageDiagnosticsLayer = new SingleStageDiagnosticsLayer();
    this.singleStageDragPreviewLayer = new DragPreviewLayer({
      onReleaseComplete: (release) => this.onDragReleaseComplete(release),
    });
    this.folderHandoffNodes = new Map();
    this.primaryFolderHandoffId = null;
    this.hasDesktopVisualAlpha = false;
    this.hasDesktopVisualTransform = false;
    this.hasFolderOverlayAlpha = false;
    this.hasFolderOverlayTransform = false;
    this.lastFolderHandoffDebugSnapshot = null;
    this.lastDesktopRenderPlan = null;
    this.iconNodes = new Map();
    this.pageTrackMotion = createPageTrackMotionState();
    this.boundsRegistration = null;
    this.boundsFlushQueued = false;
    this.boundsDirty = false;
    this.emptyText = new Text({
      text: "没有找到匹配的应用",
      style: { fill: 0xffffff, fontSize: 15, alpha: 0.74, fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.emptyText.anchor.set(0.5);
    this.visualRoot.addChild(this.pageTrack);
    this.visualRoot.addChild(this.emptyText);
    this.addChild(this.visualRoot);
    this.addChild(this.desktopClosingUnderlayLayer);
    this.addChild(this.singleStageFolderLayer);
    this.addChild(this.singleStageDragPreviewLayer);
    this.addChild(this.singleStageDiagnosticsLayer);
    this.addChild(this.handoffDebugLayer);
    this.describeMotionTargets();
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

  update(state) {
    state = normalizeDesktopHandoffState(state);
    const effectiveFolderSourceGhostedIds = normalizeFolderIdSet(
      state.folderSourceGhostedIds,
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership),
      this.singleStageFolderLayer.getDesktopSourceGhostedIds?.()
    );
    const plan = buildDesktopRenderPlan(state, {
      effectiveFolderSourceGhostedIds,
      folderHandoffEntries: this.getFolderHandoffNodes(),
      folderLayer: this.singleStageFolderLayer,
    });
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
    const shouldApplyDesktopPlan = previousPlan?.signature !== plan.signature;
    this.lastDesktopRenderPlan = plan;

    if (shouldApplyDesktopPlan) {
      const previousEntries = new Map((previousPlan?.entries || []).map((entry) => [entry.key, entry]));
      this.iconBoundsRegistry.clearBounds(plan.clearLaunchArea);
      for (const folderId of plan.clearFolderPreviewChildIds) {
        this.iconBoundsRegistry.clearBounds({ folderId, kind: BOUNDS_KIND.PREVIEW_CHILD });
      }
      for (const pageRef of plan.pageRefs) {
        state.setPageRef(pageRef.element, pageRef.pageIndex);
      }

      const seen = new Set();
      const boundsEntries = [];
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
        if (!node) {
          node = new IconNode({
            onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
              this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
          });
          node.alpha = isFolderClosingHandoff ? 1 : 0;
          node.position.set(layoutTarget.x, isFolderClosingHandoff ? layoutTarget.y : layoutTarget.y + 8);
          this.iconNodes.set(key, node);
          this.pageTrack.addChild(node);
          if (!isFolderClosingHandoff) {
            motion(node)
              .preset("fade")
              .layout()
              .interrupt("retarget")
              .to({ alpha: 1 })
              .start();
            springIconLayoutPosition(node, layoutTarget, markBoundsDirty);
          }
        } else if (!isFolderClosingHandoff && shouldSpringLayout) {
          springIconLayoutPosition(node, layoutTarget, markBoundsDirty);
        }

        node.stageRect = state.stageRect;
        node.__folderSourceGhostedByOwnership = Boolean(entry.isFolderSourceGhosted);
        node.setState(nodeState);
        let folderHandoffEntry = effectiveFolderHandoffEntry;
        if (isActiveFolderClosingHandoff) {
          this.ensureFolderHandoffNode(item.id, node, layoutTarget);
          folderHandoffEntry = this.getFolderHandoffEntry(item.id);
        } else if (folderHandoffEntry) {
          this.syncFolderHandoffNode(node, layoutTarget, folderHandoffEntry);
        }
        if (isFolderClosingHandoff && folderHandoffEntry?.visualReleased) this.revealFolderHandoffLabel(folderHandoffEntry);

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
        this.iconNodes.delete(key);
        killMotionOf(node);
        motion(node)
          .preset("fade")
          .layout()
          .interrupt("retarget")
          .to({ alpha: 0, onComplete: () => node.destroy({ children: true }) })
          .start();
      }

      this.boundsRegistration = makeDesktopBoundsRegistration(state, boundsEntries, plan.desktopFrame);
      updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
        debugMetadata: plan.pageTrack.debugMetadata,
        onFrame: markBoundsDirty,
        pageIndex: plan.pageTrack.pageIndex,
        pageSpan: plan.pageTrack.pageSpan,
        scrub: plan.pageTrack.scrub,
        sourceLabel: plan.pageTrack.sourceLabel,
        snap: plan.pageTrack.snap,
        springConfig: motionSprings.layout,
      });
      this.flushInteractiveBounds({ force: true });
    }
    this.updateSingleStageFolderLayer(state);
    this.applyFolderSourceGhosting(state);
    this.updateSingleStageDragPreviewLayer(state);
    this.singleStageDiagnosticsLayer.update(state.singleStageFolderState, {
      enabled: state.singleStageDiagnosticsEnabled,
      iconBoundsRegistry: this.iconBoundsRegistry,
    });
    for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
      this.reconcileFolderHandoffEntry(state, entry);
    }
  }

  reconcileFolderHandoffEntry(state, entry) {
    const noSubstitute = shouldFinishFolderHandoffEntry(state, this.singleStageFolderLayer, entry.folderId);
    if (noSubstitute) {
      this.finishFolderHandoffNodeAfterFrame(entry.folderId);
    } else if (isStaleHiddenFolderHandoffEntry(entry, this.singleStageFolderLayer, entry.folderId)) {
      // Close finished without ever revealing this entry (its reveal was preempted
      // by another folder), yet a stale Vue closing id keeps it alive and hidden.
      // Reveal WITHOUT retiring — retiring would let isActiveFolderClosingHandoff
      // recreate + re-hide it every frame (icon/label flash).
      this.restoreFolderHandoffVisual(entry);
      this.revealFolderHandoffLabel(entry);
    }
    return noSubstitute;
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
    motionSpringTo(this.visualRoot, { x: centerX, y: targetY }, motionSprings.settle, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
    motionSpringTo(this.visualRoot.scale, { x: scale, y: scale }, motionSprings.settle, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
    motionSpringTo(this.desktopClosingUnderlayLayer, { x: centerX, y: targetY }, motionSprings.settle, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
    motionSpringTo(this.desktopClosingUnderlayLayer.scale, { x: scale, y: scale }, motionSprings.settle, { onComplete: markBoundsDirty, onUpdate: markBoundsDirty });
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
    return Boolean(state.singleStageFolderState?.renderedFolder);
  }

  applyFolderOverlayTransform(state) {
    const transform = resolveLaunchpadVisualTransform(state);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + transform.y;
    this.singleStageFolderLayer.pivot.set(centerX, centerY);
    const shouldSnap = !this.hasSingleStageFolderOverlayContent(state);
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
    if (state.singleStageFolderState) {
      this.onFolderGeometryChange(this.singleStageFolderLayer.update(state.singleStageFolderState));
      return;
    }
    this.onFolderGeometryChange(this.singleStageFolderLayer.update({
      folderPanelRef: null,
      folderViewportRef: null,
      height: state.height,
      renderedFolder: null,
      stageRect: state.stageRect,
      width: state.width,
    }));
  }

  applyFolderSourceGhosting(state) {
    state = normalizeDesktopHandoffState(state);
    this.lastFolderSourceGhostingState = state;
    const rawIds = state.folderSourceGhostedIds;
    const ownershipIds = normalizeFolderIdSet(
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
        const activeHandoff = hasFolderClosingHandoffId(state, folderId) ||
          isFolderLayerHandoffActive(this.singleStageFolderLayer, folderId) ||
          isFolderLayerHoldingDesktopSource(this.singleStageFolderLayer, folderId);
        // Only retire the handoff node once the closing handoff is no longer
        // active; clearing it mid-handoff (rawGhosted is true throughout a close)
        // re-creates a fresh entry every frame, resetting visualReleased and
        // re-hiding visualWrap, so the icon stays blank until activeHandoff ends.
        if (!activeHandoff && (rawGhosted || (ownershipGhosted && handoffEntry.visualReleased === true))) {
          this.clearFolderHandoffNode(folderId);
        } else {
          node.__folderSourceGhostedByOwnership = Boolean(nextGhosted);
          continue;
        }
      }
      const previousGhostedByOwnership = node.__folderSourceGhostedByOwnership === true;
      if (previousGhostedByOwnership === Boolean(nextGhosted)) continue;
      const baseGhosted = Boolean(node.state.ghosted) && !previousGhostedByOwnership;
      node.__folderSourceGhostedByOwnership = Boolean(nextGhosted);
      node.setState({ ...node.state, ghosted: baseGhosted || Boolean(nextGhosted) });
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

  updateSingleStageDragPreviewLayer(state) {
    this.singleStageDragPreviewLayer.update({
      folderHoverState: state.dragFolderHoverState,
      folderPageSize: state.folderPageSize,
      height: state.height,
      iconSize: state.iconSize,
      isTextlessMode: state.isTextlessMode,
      launchTargetStatusById: state.launchTargetStatusById,
      previewState: state.dragPreviewState,
      releaseState: state.dragReleaseState,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stageRect: state.stageRect,
      width: state.width,
    });
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
    if (!folderId || !node || node.destroyed || !layoutTarget) return false;
    this.ensureFolderHandoffNode(folderId, node, layoutTarget, options);
    return true;
  }

  ensureFolderHandoffNode(folderId, node, layoutTarget, options = {}) {
    if (!folderId || !node || node.destroyed) return;
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
    if (options.revealLabel !== false) this.revealFolderHandoffLabel(entry);
  }

  syncFolderHandoffNode(node = this.folderHandoffNode?.node, layoutTarget = null, handoffEntry = null) {
    const entry = handoffEntry || this.getFolderHandoffEntry(node?.item?.id || this.folderHandoffNode?.folderId || null);
    if (!entry || !node || node.destroyed) return;
    const target = layoutTarget || entry.layoutTarget;
    if (!target) return;
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
      node.state.draggable = true;
      node.state.ghosted = false;
      node.state.interactive = true;
    }
    node.resetFolderPreviewAfterGhost?.();
    if (!entry.visualReleased) {
      node.setFolderHandoffVisualHidden?.(true);
      entry.visualHidden = true;
    } else if (entry.visualHidden) {
      node.setFolderHandoffVisualHidden?.(false);
      entry.visualHidden = false;
    }
    if (node.labelText) {
      node.labelText.visible = true;
      if (!entry.labelRevealStarted) {
        killMotionOf(node.labelText);
        node.labelText.alpha = 0;
      }
    }
    if (node.parent === this.pageTrack && this.pageTrack.children.length > 1) {
      this.pageTrack.setChildIndex(node, this.pageTrack.children.length - 1);
    }
  }

  finishFolderHandoffNodeAfterFrame(folderId = null) {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || entry.cleanupFrame != null) return;
    if (entry.visualReleased) this.revealFolderHandoffLabel(entry);
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
    this.restoreFolderHandoffVisual(entry);
    this.debugFolderHandoffRestore(entry, "desktop-restore-after");
    this.revealFolderHandoffLabel(entry);
  }

  restoreFolderHandoffVisual(entry) {
    const node = entry?.node;
    if (!node || node.destroyed) return;
    node.setFolderHandoffVisualHidden?.(false);
    entry.visualHidden = false;
    entry.visualReleased = true;
  }

  revealFolderHandoffLabel(entry = this.folderHandoffNode) {
    const node = entry?.node;
    if (!entry || entry.labelRevealStarted || !node || node.destroyed || !node.labelText?.visible) return;
    entry.labelRevealStarted = true;
    if (typeof node.revealLabelAfterGhost === "function") node.revealLabelAfterGhost();
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
    if (!node || node.destroyed) return;
    this.restoreFolderHandoffVisual(entry);
    if (node.parent !== this.pageTrack) return;
    const childCount = this.pageTrack.children.length;
    if (!childCount) return;
    const targetIndex = Math.max(0, Math.min(entry.originalIndex ?? childCount - 1, childCount - 1));
    if (this.getPageTrackChildIndex(node) !== targetIndex) this.pageTrack.setChildIndex(node, targetIndex);
    if (entry.visualReleased) this.revealFolderHandoffLabel(entry);
  }

  getPageTrackChildIndex(node) {
    return this.pageTrack.children.indexOf(node);
  }

  debugFolderHandoffRestore(entry, phase) {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return null;
    const snapshot = this.makeFolderHandoffDebugSnapshot(entry, { phase });
    if (!snapshot) return null;
    setLaunchpadDebugValue("lastFolderHandoff", {
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
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] || node.item.children?.[slotIndex] : null;
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
      const { area, handoffLayoutTarget, index, item, node, pageIndex, sizing, targetX, x, y } = entry;
      if (!item?.id || !node || node.destroyed) continue;
      const meta = { area, id: item.id, index, item, pageIndex };
      const visualOffsetY = getIconVisualOffsetY(registration.isTextlessMode);
      const handoffEntry = item.type === "folder" ? this.getFolderHandoffEntry(item.id) : null;
      const boundsTargets = resolveDesktopBoundsTargets({
        handoffLayoutTarget,
        isFolderClosingHandoff: item.type === "folder" && (
          hasFolderClosingHandoffId(registration, item.id) ||
          Boolean(handoffEntry)
        ),
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
      if (boundsTargets.syncHandoffLayoutTarget && handoffEntry) {
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
    const debugState = readLaunchpadDebugValue("lastFolderHandoff");
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
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] || node.item.children?.[slotIndex] : null;
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
    debugState.desktopLogged = true;
    debugState.desktopRows = rows;
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
      const previousClear = readLaunchpadDebugValue("clearFolderHandoff");
      setLaunchpadDebugValue("clearFolderHandoff", () => {
        previousClear?.();
        this.handoffDebugLayer.clear();
      });
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
      const child = node.item ? node.item.childPages?.[0]?.[index] || node.item.children?.[index] : null;
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
    const overlayCloseSnapshot = overlay?.folderHandoff?.snapshot?.() || null;
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
        closingGhostKeys: Array.from(overlayCloseSnapshot?.ghostKeys || []),
        closingGhostSessionToken: overlayCloseSnapshot?.token || null,
        closingHandoffActive: overlayCloseSnapshot?.handoffActive === true,
        currentFolderId: overlay.currentFolderId || null,
        debug: overlay.getVisualDebugSnapshot?.() || null,
        openingGhostItemIds: Array.from(overlayCloseSnapshot?.opening?.ghostKeys || []),
        openingSessionToken: overlayCloseSnapshot?.opening?.sessionToken || null,
        pageTrackVisible: overlay.pageTrack?.visible ?? null,
      } : null,
      ownership: this.visualOwnership?.snapshot?.() || [],
    };
  }

  destroy(options) {
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
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    killMotionOf(this.pageTrack, null, { lane: "base", reason: "destroyed" });
    this.visualCommitQueue?.clear?.();
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
