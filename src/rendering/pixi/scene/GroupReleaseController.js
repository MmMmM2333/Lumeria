import { Graphics } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getAppFolderCreateTargetPadding } from "../nodes/iconFolderHoverState.js";
import { drawFolderThumbFrame } from "../nodes/folderThumbDrawing.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { GROUP_TRANSFER_RUNTIME_MODE } from "./groupTransferRuntimeAdapter.js";
import { GROUP_TRANSFER_PHASE } from "../../../domain/groupTransferSession.js";
import {
  getFolderSlotReleaseIconSize,
  isFolderSlotReleaseMode,
} from "./folderReleaseVisual.js";
import {
  FOLDER_CENTER_ABSORB_RELEASE_MODE,
  FOLDER_PREVIEW_SLOT_RELEASE_MODE,
  CREATED_FOLDER_RELEASE_MODE,
  FolderReleaseController,
} from "./folderReleaseController.js";

const GENERIC_RELEASE_DURATION = 0.24;
const GENERIC_RETURN_DURATION = 0.2;
const TARGET_RETARGET_EPSILON = 0.75;
const TARGET_SCALE_RETARGET_EPSILON = 0.002;
const MAX_MISSING_POINT_FRAMES = 2;
const ALIGNED_POINT_RENDER_FRAMES = 2;
const POINT_ALIGNMENT_DEVICE_EPSILON = 0.5;
const FOLDER_SHELL_DURATION = 0.18;
const FOLDER_SHELL_RETARGET_EPSILON = 0.5;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value, fallback = { x: 0, y: 0 }) {
  return {
    x: finite(value?.x, finite(fallback.x)),
    y: finite(value?.y, finite(fallback.y)),
  };
}

function scale(value, fallback = { x: 1, y: 1 }) {
  return {
    x: Math.max(0.01, finite(value?.x, finite(fallback?.x, 1))),
    y: Math.max(0.01, finite(value?.y, finite(fallback?.y, 1))),
  };
}

function pointPosesEqual(left, right) {
  return Boolean(left && right) &&
    Math.abs(finite(left.point?.x) - finite(right.point?.x)) <= TARGET_RETARGET_EPSILON &&
    Math.abs(finite(left.point?.y) - finite(right.point?.y)) <= TARGET_RETARGET_EPSILON &&
    Math.abs(finite(left.scale?.x, 1) - finite(right.scale?.x, 1)) <= TARGET_SCALE_RETARGET_EPSILON &&
    Math.abs(finite(left.scale?.y, 1) - finite(right.scale?.y, 1)) <= TARGET_SCALE_RETARGET_EPSILON;
}

function makeTargetKey(target) {
  if (!target) return "missing";
  return [
    Math.round(finite(target.point?.x) * 2) / 2,
    Math.round(finite(target.point?.y) * 2) / 2,
    Math.round(finite(target.scale?.x, 1) * 1000) / 1000,
    Math.round(finite(target.scale?.y, 1) * 1000) / 1000,
  ].join(":");
}

function getPointDeviceScale(state = {}) {
  const stageRect = state.stageRect || {};
  const resolution = Math.max(0.01, finite(state.deviceResolution, 1));
  const width = Math.max(0.01, finite(state.width, finite(stageRect.width, 1)));
  const height = Math.max(0.01, finite(state.height, finite(stageRect.height, 1)));
  return {
    x: resolution * Math.max(0.01, finite(stageRect.width, width) / width),
    y: resolution * Math.max(0.01, finite(stageRect.height, height) / height),
  };
}

function isFolderMode(mode) {
  return mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_PREVIEW_SLOT ||
    mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_CENTER_ABSORB ||
    mode === GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER;
}

function toLayerFallback(entry, state) {
  const stagePoint = clientPointToStageVisualPoint(entry?.fallback, state?.stageRect);
  if (!stagePoint) return null;
  return {
    x: stagePoint.x,
    y: stagePoint.y - finite(state?.visualOffsetY, getIconVisualOffsetY(state?.visualSpec?.textless === true)),
  };
}

function toStageVelocity(velocity, state) {
  const stageRect = state?.stageRect || {};
  const width = Math.max(0.0001, finite(state?.width, stageRect.width || 1));
  const height = Math.max(0.0001, finite(state?.height, stageRect.height || 1));
  const scaleX = Math.max(0.0001, finite(stageRect.width, width) / width);
  const scaleY = Math.max(0.0001, finite(stageRect.height, height) / height);
  return {
    x: finite(velocity?.x) / scaleX,
    y: finite(velocity?.y) / scaleY,
  };
}

function readNodeCenterInLayer(layer, node) {
  if (!layer || !node || node.destroyed) return null;
  const visualNode = node.visualWrap && !node.visualWrap.destroyed ? node.visualWrap : node;
  let center = null;
  if (visualNode.parent && !visualNode.parent.destroyed && !layer.destroyed) {
    center = layer.toLocal({ x: 0, y: 0 }, visualNode);
  }
  if (!center || !Number.isFinite(Number(center.x)) || !Number.isFinite(Number(center.y))) {
    const root = node.position || {};
    const visualOffset = visualNode === node ? { x: 0, y: 0 } : (visualNode.position || {});
    center = {
      x: finite(root.x) + finite(visualOffset.x),
      y: finite(root.y) + finite(visualOffset.y),
    };
  }
  return point(center);
}

function readFolderShellTarget(layer, folderNode, state, fallback) {
  if (!folderNode || folderNode.destroyed) return null;
  const baseSize = Math.max(
    1,
    finite(folderNode.iconSize, finite(state.visualSpec?.iconSize, finite(state.iconSize, 64)))
  );
  const clientRect = folderNode.getFolderThumbBounds?.(state.stageRect);
  const stageRect = clientRectToStageVisualRect(clientRect, state.stageRect || {});
  if (stageRect && stageRect.width > 0 && stageRect.height > 0) {
    return {
      center: {
        x: stageRect.left + stageRect.width / 2,
        y: stageRect.top + stageRect.height / 2,
      },
      scale: Math.max(0.01, stageRect.width / baseSize),
      size: baseSize,
    };
  }
  const pose = folderNode.getFolderCenterReleasePose?.(layer);
  if (pose?.center && Number.isFinite(Number(pose.center.x)) && Number.isFinite(Number(pose.center.y))) {
    return {
      center: point(pose.center),
      scale: 1,
      size: baseSize,
    };
  }
  const fallbackPoint = toLayerFallback({ fallback }, state);
  if (!fallbackPoint) return null;
  return { center: fallbackPoint, scale: 1, size: baseSize };
}

function readFolderShellSource(layer, node, entry, state, targetSize, release = null) {
  const center = readNodeCenterInLayer(layer, node) || toLayerFallback(entry, state);
  if (!center) return null;
  const sourceIconSize = Math.max(
    1,
    finite(state.visualSpec?.iconSize, finite(state.iconSize, finite(node?.iconSize, 64)))
  );
  const logicalIconSize = Math.max(1, finite(node?.iconSize, sourceIconSize));
  const nodeScale = Math.max(0.01, Math.abs(finite(node?.scale?.x, 1)));
  const sourceSize = Math.max(
    0.01,
    finite(release?.sourceSize, logicalIconSize * nodeScale)
  );
  const padding = getAppFolderCreateTargetPadding(sourceIconSize);
  return {
    center,
    scale: Math.max(0.01, (sourceSize + padding * 2) / Math.max(1, targetSize)),
  };
}

function readReleaseSourceMetrics(node, state) {
  const sourceIconSize = Math.max(
    1,
    finite(state.visualSpec?.iconSize, finite(state.iconSize, finite(node?.iconSize, 64)))
  );
  const logicalIconSize = Math.max(1, finite(node?.iconSize, sourceIconSize));
  const nodeScale = Math.max(0.01, Math.abs(finite(node?.scale?.x, 1)));
  // Capture the currently rendered size before FolderReleaseController
  // reparents and resets the pooled node.  The old release path preserved the
  // in-flight drag scale (the lead is 1.08), so the frame must not fall back
  // to the post-reparent 1px transform or to the target thumbnail size.
  return {
    sourceIconSize,
    sourceSize: logicalIconSize * nodeScale,
  };
}

function frameTargetEqual(left, right) {
  return Boolean(left && right) &&
    Math.abs(finite(left.center?.x) - finite(right.center?.x)) <= FOLDER_SHELL_RETARGET_EPSILON &&
    Math.abs(finite(left.center?.y) - finite(right.center?.y)) <= FOLDER_SHELL_RETARGET_EPSILON &&
    Math.abs(finite(left.scale) - finite(right.scale)) <= 0.005;
}

function normalizeMode(mode) {
  if (mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_PREVIEW_SLOT) return FOLDER_PREVIEW_SLOT_RELEASE_MODE;
  if (mode === GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER) return CREATED_FOLDER_RELEASE_MODE;
  if (mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_CENTER_ABSORB) return FOLDER_CENTER_ABSORB_RELEASE_MODE;
  throw new Error(`Unsupported folder release mode: ${String(mode)}`);
}

/**
 * Coordinates the semantic release plan for all visible group ghosts.
 * Folder lanes delegate pose math to FolderReleaseController; point lanes
 * retain the handoff velocity and are retargeted only when the committed
 * layout moves far enough to be perceptible.
 */
export class GroupReleaseController {
  constructor(layer, options = {}) {
    if (!layer) throw new Error("GroupReleaseController requires a release layer");
    this.layer = layer;
    this.resolveFolderNode = options.resolveFolderNode || (() => null);
    this.resolvePointTarget = options.resolvePointTarget || (() => null);
    this.onEntryComplete = options.onEntryComplete || (() => {});
    this.onEntryAbort = options.onEntryAbort || (() => {});
    this.onFolderShellComplete = options.onFolderShellComplete || (() => {});
    this.onRenderRequest = options.onRenderRequest || (() => {});
    this.folderShellFrame = new Graphics({ label: "group-transfer-folder-shell" });
    this.folderShellFrame.eventMode = "none";
    this.folderShellFrame.zIndex = 100;
    this.folderShellFrame.visible = false;
    this.folderShellFrameKey = null;
    this.folderShellFrameMotion = null;
    this.folderShellFrameTarget = null;
    this.folderShellFrameContext = null;
    this.folderShellFrameSize = null;
    this.folderShellCompletionKey = null;
    this.lanes = new Map();
    this.planKey = null;
    this.layer.addChild(this.folderShellFrame);
    this.previousOnRender = this.layer.onRender;
    this.didInstallRenderHook = options.installRenderHook !== false;
    this.renderHook = (renderer) => {
      this.previousOnRender?.call(this.layer, renderer);
      this.renderFrame();
    };
    if (this.didInstallRenderHook) this.layer.onRender = this.renderHook;
  }

  update(options = {}) {
    const group = options.group;
    const plan = group?.runtimePlan;
    if (!plan?.key || !Array.isArray(plan.entries) || !plan.entries.length ||
      ![GROUP_TRANSFER_PHASE.RELEASING, GROUP_TRANSFER_PHASE.RETURNING].includes(group?.phase)) {
      this.clear("group-release-inactive");
      return;
    }

    this.preparePlan(plan.key);

    const nodes = options.nodes instanceof Map ? options.nodes : new Map();
    const settledActorKeys = new Set(group.settledActorKeys || []);
    const seen = new Set();
    const createdContexts = [];
    for (const entry of plan.entries) {
      if (!entry?.id) continue;
      if (entry.actorKey && settledActorKeys.has(entry.actorKey)) continue;
      const node = nodes.get(entry.id);
      const laneKey = `${plan.key}:${entry.id}`;
      seen.add(laneKey);
      const existing = this.lanes.get(laneKey);
      const context = {
        entry,
        group,
        node,
        plan,
        state: options,
      };
      if (entry.mode === GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER) createdContexts.push(context);
      if (isFolderMode(entry.mode)) {
        this.updateFolderLane(laneKey, existing, context);
      } else {
        this.updatePointLane(laneKey, existing, context);
      }
    }

    for (const [laneKey, lane] of this.lanes) {
      if (seen.has(laneKey)) continue;
      this.clearLane(lane, "group-release-entry-removed");
      this.lanes.delete(laneKey);
    }

    const folderShellActor = (plan.shellActors || []).find((actor) => actor?.role === "folder-shell") || null;
    if (folderShellActor && !settledActorKeys.has(folderShellActor.key) && createdContexts.length) {
      this.updateFolderShellActor(folderShellActor, createdContexts, options, plan);
    } else if (!folderShellActor || settledActorKeys.has(folderShellActor.key) || !this.folderShellFrameKey) {
      this.clearFolderShellActor("group-transfer-folder-shell-inactive");
    }
  }

  /**
   * Clear the previous release lanes before the owning layer rewrites pooled
   * node visuals for a new plan.  Motion cancellation can publish the old
   * lane's final scale, so doing this after the node handoff would overwrite
   * the new release visual state in the same update.
   */
  preparePlan(nextPlanKey = null) {
    const key = nextPlanKey || null;
    if (this.planKey === key) return;
    this.clear("group-release-replace");
    this.planKey = key;
  }

  updateFolderShellActor(shellActor, contexts, state, plan) {
    const context = [...contexts]
      .sort((left, right) => finite(left.entry?.target?.slotIndex, finite(left.entry?.target?.index, 0)) -
        finite(right.entry?.target?.slotIndex, finite(right.entry?.target?.index, 0)))[0];
    if (!context?.entry) {
      this.clearFolderShellActor("group-transfer-folder-shell-context-missing");
      return;
    }
    const entry = context.entry;
    const target = entry.target || {};
    const targetFolderNode = this.resolveFolderNode({
      entry,
      group: context.group,
      node: context.node,
      state,
      target,
    });
    const folderTarget = readFolderShellTarget(
      this.layer,
      targetFolderNode,
      state,
      entry.fallback
    ) || {
      center: toLayerFallback(entry, state) || { x: 0, y: 0 },
      scale: 1,
      size: Math.max(1, finite(state.visualSpec?.iconSize, finite(state.iconSize, 64))),
    };
    const source = readFolderShellSource(
      this.layer,
      context.node,
      entry,
      state,
      folderTarget.size,
      context.release
    );
    if (!source) {
      this.clearFolderShellActor("group-transfer-folder-shell-source-missing");
      return;
    }

    const frameKey = `${plan?.key || this.planKey || "group-transfer"}:${shellActor.key}`;
    const isNewFrame = this.folderShellFrameKey !== frameKey;
    if (isNewFrame) {
      this.clearFolderShellActor("group-transfer-folder-shell-replace");
      this.folderShellFrameKey = frameKey;
      this.folderShellCompletionKey = null;
      this.folderShellFrameTarget = null;
      this.folderShellFrameSize = folderTarget.size;
      this.folderShellFrame.zIndex = Number(shellActor.zBand) || 100;
      drawFolderThumbFrame(
        this.folderShellFrame,
        folderTarget.size,
        getFolderThumbMetrics(folderTarget.size),
        0
      );
      this.folderShellFrame.position.set(source.center.x, source.center.y);
      this.folderShellFrame.scale.set(source.scale);
      this.folderShellFrame.alpha = 1;
      this.folderShellFrame.visible = true;
    } else {
      if (Math.abs(finite(this.folderShellFrameSize, 0) - folderTarget.size) > 0.01) {
        this.folderShellFrameSize = folderTarget.size;
        drawFolderThumbFrame(
          this.folderShellFrame,
          folderTarget.size,
          getFolderThumbMetrics(folderTarget.size),
          0
        );
      }
      this.folderShellFrame.visible = true;
    }
    this.folderShellFrameContext = { context, plan, shellActor, state };

    const nextTarget = {
      center: { ...folderTarget.center },
      scale: folderTarget.scale,
    };
    if (!frameTargetEqual(this.folderShellFrameTarget, nextTarget)) {
      this.folderShellFrameTarget = nextTarget;
      this.folderShellFrameMotion?.cancel?.("group-transfer-folder-shell-retarget");
      this.folderShellFrameMotion = parallel([
        motion(this.folderShellFrame)
          .duration(context.group?.reducedMotion ? 0 : FOLDER_SHELL_DURATION)
          .ease("power3.out")
          .handoff()
          .interrupt("retarget")
          .to({ x: nextTarget.center.x, y: nextTarget.center.y }),
        motion(this.folderShellFrame.scale)
          .duration(context.group?.reducedMotion ? 0 : FOLDER_SHELL_DURATION)
          .ease("power3.out")
          .handoff()
          .interrupt("retarget")
          .to({ x: nextTarget.scale, y: nextTarget.scale }),
      ], {
        onComplete: () => {
          if (this.folderShellFrameKey !== frameKey) return;
          this.folderShellFrameMotion = null;
          this.completeFolderShellActor(frameKey);
        },
      });
    }
  }

  completeFolderShellActor(frameKey) {
    if (!frameKey || this.folderShellFrameKey !== frameKey || this.folderShellCompletionKey === frameKey) return;
    this.folderShellCompletionKey = frameKey;
    motionRuntime.afterFrame(() => {
      if (this.folderShellFrameKey !== frameKey || this.folderShellCompletionKey !== frameKey) return;
      const saved = this.folderShellFrameContext;
      const actorKey = saved?.shellActor?.key || null;
      if (!actorKey) return;
      this.onFolderShellComplete({
        actorKey,
        folderId: saved.shellActor?.endAnchor?.folderId || saved.context?.entry?.target?.folderId || null,
        planKey: saved.plan?.key || this.planKey,
      });
    });
  }

  clearFolderShellActor(reason = "group-transfer-folder-shell-clear") {
    this.folderShellFrameMotion?.cancel?.(reason);
    this.folderShellFrameMotion = null;
    if (this.folderShellFrame) {
      killMotionOf(this.folderShellFrame, null, { reason });
      killMotionOf(this.folderShellFrame.scale, null, { reason });
      this.folderShellFrame.visible = false;
      this.folderShellFrame.alpha = 0;
      this.folderShellFrame.position.set(0, 0);
      this.folderShellFrame.scale.set(1, 1);
      this.folderShellFrame.clear();
    }
    this.folderShellFrameKey = null;
    this.folderShellFrameTarget = null;
    this.folderShellFrameContext = null;
    this.folderShellFrameSize = null;
    this.folderShellCompletionKey = null;
  }

  hideFolderShellActors() {
    this.clearFolderShellActor("group-transfer-folder-shell-handoff");
  }

  updateFolderLane(laneKey, existing, context) {
    if (existing?.kind === "point") {
      this.clearLane(existing, "group-release-mode-change");
      existing = null;
    }
    const entry = context.entry;
    const target = entry.target || {};
    const expectedChildId = target.expectedChildId || entry.id;
    let lane = existing;
    if (!lane) {
      lane = {
        controller: null,
        kind: "folder",
        key: laneKey,
        completionScheduled: false,
        settled: false,
      };
      lane.controller = new FolderReleaseController(this.layer, {
        installRenderHook: false,
        onReleaseAbort: (release, reason) => this.settleLane(lane, "aborted", release, reason),
        onReleaseComplete: (release) => this.settleLane(lane, "settled", release),
      });
      this.lanes.set(laneKey, lane);
    }
    lane.context = context;
    lane.node = context.node;
    if (!context.node || context.node.destroyed) return;
    const internalMode = normalizeMode(entry.mode);
    const targetFolderNode = this.resolveFolderNode({
      entry,
      group: context.group,
      node: context.node,
      state: context.state,
      target,
    });
    if (!lane.sourceMetrics || !lane.controller.active?.started) {
      lane.sourceMetrics = readReleaseSourceMetrics(context.node, context.state);
    }
    const releaseIconSize = isFolderSlotReleaseMode(entry.mode)
      ? getFolderSlotReleaseIconSize(
        targetFolderNode?.iconSize || context.state.iconSize || context.state.visualSpec?.iconSize
      )
      : Math.max(1, finite(context.state.visualSpec?.iconSize, context.state.iconSize || 64));
    const release = {
      item: {
        ...(entry.item || {}),
        id: expectedChildId,
      },
      key: laneKey,
      releaseMode: internalMode,
      delayMs: Math.max(0, finite(entry.delayMs)),
      revealFromAlpha: entry.startAlpha != null && Number.isFinite(Number(entry.startAlpha))
        ? Math.max(0, Number(entry.startAlpha))
        : null,
      size: {
        height: releaseIconSize,
        width: releaseIconSize,
      },
      sourceIconSize: lane.sourceMetrics.sourceIconSize,
      sourceSize: lane.sourceMetrics.sourceSize,
      targetFolderId: target.folderId || null,
      targetPreviewSlotIndex: Number.isFinite(Number(target.slotIndex)) ? Number(target.slotIndex) : null,
      velocity: point(entry.velocity),
    };
    context.release = release;
    lane.controller.update({
      ...context.state,
      previewNode: context.node,
      release,
      targetFolderNode,
    });
  }

  updatePointLane(laneKey, existing, context) {
    if (existing?.kind === "folder") {
      this.clearLane(existing, "group-release-mode-change");
      existing = null;
    }
    let lane = existing;
    if (!lane) {
      lane = {
        alignedRenderFrames: 0,
        alignmentFrameRequested: false,
        control: null,
        completionScheduled: false,
        generation: 0,
        kind: "point",
        key: laneKey,
        missingRenderFrames: 0,
        motionSettled: false,
        settled: false,
        target: null,
        targetKey: null,
      };
      this.lanes.set(laneKey, lane);
    }
    lane.context = context;
    lane.node = context.node;
    if (!context.node || context.node.destroyed) return;
    const target = this.readPointTarget(context);
    if (!target) return;
    lane.missingRenderFrames = 0;
    if (lane.settled) return;
    if (lane.control?.completed) {
      lane.motionSettled = true;
      if (!this.isPointLaneAligned(lane, target)) this.startPointMotion(lane, target);
      return;
    }
    if (lane.control && pointPosesEqual(lane.target, target)) return;
    this.startPointMotion(lane, target);
  }

  readPointTarget(context) {
    const resolved = this.resolvePointTarget({
      entry: context.entry,
      group: context.group,
      node: context.node,
      state: context.state,
      target: context.entry.target || {},
    });
    const entry = context.entry;
    const isReturn = entry.mode === GROUP_TRANSFER_RUNTIME_MODE.RETURN;
    const fallbackScaleValue = isReturn ? Math.max(0.35, finite(entry.originScale, 1)) : 1;
    const fallbackScale = { x: fallbackScaleValue, y: fallbackScaleValue };
    const resolvedPoint = resolved?.point;
    if (resolvedPoint && Number.isFinite(Number(resolvedPoint.x)) && Number.isFinite(Number(resolvedPoint.y))) {
      return {
        point: point(resolvedPoint),
        scale: scale(resolved.scale, fallbackScale),
      };
    }
    return null;
  }

  startPointMotion(lane, target) {
    const context = lane.context;
    const entry = context.entry;
    const group = context.group;
    const node = context.node;
    const isReturn = entry.mode === GROUP_TRANSFER_RUNTIME_MODE.RETURN;
    const targetAlpha = entry.alphaPolicy?.kind === "fade-out"
      ? Math.max(0, finite(entry.alphaPolicy.to, 0))
      : isReturn
        ? Math.max(0, finite(entry.originAlpha, 1))
        : 1;
    const velocity = isReturn || group.reducedMotion === true
      ? { x: 0, y: 0 }
      : toStageVelocity(entry.velocity, context.state);
    const generation = lane.generation + 1;
    lane.generation = generation;
    lane.settled = false;
    lane.completionScheduled = false;
    lane.alignedRenderFrames = 0;
    lane.alignmentFrameRequested = false;
    lane.motionSettled = false;
    lane.target = { ...target };
    lane.targetKey = makeTargetKey(target);
    const delay = lane.control ? 0 : Math.max(0, finite(entry.delayMs)) / 1000;
    const positionMotion = motion(node)
      .delay(delay)
      .interrupt("retarget");
    if (isReturn) {
      positionMotion
        .duration(GENERIC_RETURN_DURATION)
        .ease("power2.out")
        .handoff();
    } else {
      positionMotion.preset("handoff").drag();
    }
    const scaleMotion = motion(node.scale)
      .delay(delay)
      .interrupt("retarget");
    if (isReturn) {
      scaleMotion
        .duration(GENERIC_RETURN_DURATION)
        .ease("power2.out")
        .handoff();
    } else {
      scaleMotion.preset("handoff").drag();
    }
    const animations = [
      positionMotion.to({
        velocity,
        x: target.point.x,
        y: target.point.y,
      }),
      scaleMotion.to({ x: target.scale.x, y: target.scale.y }),
      motion(node)
        .delay(delay)
        .duration(isReturn ? GENERIC_RETURN_DURATION : GENERIC_RELEASE_DURATION)
        .ease("power2.out")
        .handoff()
        .interrupt("retarget")
        .to({ alpha: targetAlpha }),
    ];
    if (node.labelText?.visible && !isReturn) {
      animations.push(
        motion(node.labelText)
          .duration(Math.min(GENERIC_RELEASE_DURATION, 0.14))
          .ease("power2.out")
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 1 })
      );
    }
    lane.control = parallel(animations, {
      onComplete: () => {
        if (lane.generation !== generation || lane.settled) return;
        lane.motionSettled = true;
        this.onRenderRequest("group-point-release-alignment");
      },
    });
  }

  isPointLaneAligned(lane, target) {
    const node = lane?.node;
    if (!node || node.destroyed || !target || !lane.motionSettled || !lane.control?.completed) return false;
    const deviceScale = getPointDeviceScale(lane.context?.state);
    return Math.abs(finite(node.position?.x) - finite(target.point?.x)) * deviceScale.x <= POINT_ALIGNMENT_DEVICE_EPSILON &&
      Math.abs(finite(node.position?.y) - finite(target.point?.y)) * deviceScale.y <= POINT_ALIGNMENT_DEVICE_EPSILON &&
      Math.abs(finite(node.scale?.x, 1) - finite(target.scale?.x, 1)) * deviceScale.x <= POINT_ALIGNMENT_DEVICE_EPSILON &&
      Math.abs(finite(node.scale?.y, 1) - finite(target.scale?.y, 1)) * deviceScale.y <= POINT_ALIGNMENT_DEVICE_EPSILON;
  }

  syncPointAlignment(lane, target) {
    if (!this.isPointLaneAligned(lane, target)) {
      lane.alignedRenderFrames = 0;
      lane.alignmentFrameRequested = false;
      return false;
    }
    lane.alignedRenderFrames += 1;
    if (lane.alignedRenderFrames >= ALIGNED_POINT_RENDER_FRAMES) {
      this.settleLane(lane, "settled");
      return true;
    }
    if (!lane.alignmentFrameRequested) {
      lane.alignmentFrameRequested = true;
      motionRuntime.afterFrame(() => {
        if (!lane || lane.settled) return;
        lane.alignmentFrameRequested = false;
        this.onRenderRequest("group-point-release-alignment-confirm");
      });
    }
    return false;
  }

  settleLane(lane, outcome, release = null, reason = null) {
    if (!lane || lane.completionScheduled || this.planKey == null) return;
    lane.completionScheduled = true;
    if (outcome !== "aborted" && lane.kind === "point") this.snapPointLane(lane);
    lane.settled = true;
    const context = lane.context || {};
    const payload = {
      actorKey: context.entry?.actorKey || null,
      entryId: context.entry?.id || release?.item?.id || null,
      id: context.entry?.id || release?.item?.id || null,
      memberIds: [...(context.entry?.memberIds || [])],
      node: context.node || null,
      outcome: outcome === "aborted" ? "aborted" : "settled",
      planKey: context.plan?.key || this.planKey,
      reason: reason || null,
      release: release || null,
      runtimePlan: context.plan || null,
    };
    motionRuntime.afterFrame(() => {
      if (!lane || !lane.settled) return;
      if (payload.outcome === "aborted") this.onEntryAbort(payload);
      else this.onEntryComplete(payload);
    });
  }

  snapPointLane(lane) {
    const node = lane?.node;
    const target = lane?.target;
    if (!node || node.destroyed || !target) return;
    node.position.set(finite(target.point?.x), finite(target.point?.y));
    const entry = lane.context?.entry;
    const isReturn = entry?.mode === GROUP_TRANSFER_RUNTIME_MODE.RETURN;
    node.scale.set(
      Math.max(0.01, finite(target.scale?.x, 1)),
      Math.max(0.01, finite(target.scale?.y, 1))
    );
    node.alpha = isReturn ? Math.max(0, finite(entry?.originAlpha, 1)) : 1;
    if (node.labelText && !isReturn) {
      node.labelText.alpha = 1;
      node.labelText.scale.set(1);
    }
  }

  renderFrame() {
    if (this.folderShellFrameContext) {
      const saved = this.folderShellFrameContext;
      this.updateFolderShellActor(saved.shellActor, [saved.context], saved.state, saved.plan);
    }
    for (const lane of this.lanes.values()) {
      if (lane.kind === "folder") {
        lane.controller?.renderFrame?.();
        continue;
      }
      if (lane.settled) continue;
      const context = lane.context;
      if (!context?.node || context.node.destroyed) {
        lane.missingRenderFrames += 1;
      } else {
        const target = this.readPointTarget(context);
        if (target) {
          lane.missingRenderFrames = 0;
          if (lane.control?.completed) {
            lane.motionSettled = true;
            if (this.isPointLaneAligned(lane, target)) this.syncPointAlignment(lane, target);
            else this.startPointMotion(lane, target);
          } else if (!lane.control || !pointPosesEqual(lane.target, target)) {
            this.startPointMotion(lane, target);
          }
        } else {
          lane.missingRenderFrames += 1;
        }
      }
      if (lane.missingRenderFrames >= MAX_MISSING_POINT_FRAMES) {
        this.settleLane(lane, "aborted", null, "target-unavailable");
      }
    }
  }

  clearLane(lane, reason) {
    if (!lane) return;
    if (lane.controller) lane.controller.destroy?.();
    if (lane.control && !lane.control.completed) lane.control.cancel?.(reason);
    if (lane.node && !lane.node.destroyed && lane.kind === "point") {
      killMotionOf(lane.node, null, { reason });
      killMotionOf(lane.node.scale, null, { reason });
      killMotionOf(lane.node.labelText, null, { reason });
      killMotionOf(lane.node.labelText?.scale, null, { reason });
    }
    lane.settled = true;
  }

  clear(reason = "group-release-clear") {
    for (const lane of this.lanes.values()) this.clearLane(lane, reason);
    this.lanes.clear();
    this.clearFolderShellActor(reason);
    this.planKey = null;
  }

  destroy() {
    this.clear("group-release-destroyed");
    if (this.didInstallRenderHook && this.layer?.onRender === this.renderHook) {
      this.layer.onRender = this.previousOnRender || null;
    }
    this.previousOnRender = null;
    this.renderHook = null;
    if (this.folderShellFrame && !this.folderShellFrame.destroyed) {
      this.folderShellFrame.removeFromParent();
      this.folderShellFrame.destroy({ children: true });
    }
    this.folderShellFrame = null;
    this.layer = null;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
