import { Container, Graphics } from "pixi.js";
import { createPixiText } from "../pixiText.js";
import {
  GROUP_TRANSFER_OUTCOME,
  GROUP_TRANSFER_PHASE,
  isInteractiveGroupTransferPhase,
} from "../../../domain/groupTransferSession.js";
import { IconNode } from "../nodes/IconNode.js";
import { clientPointToStageVisualPoint } from "../geometry/stageCoordinates.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import { GroupReleaseController } from "./GroupReleaseController.js";
import {
  getGroupTrailSettleDurationMs,
  makeGroupFollowerTarget,
} from "./groupDragPresentation.js";
import {
  hasIconVisualSpecMismatch,
  interpolateIconVisualSpec,
  makeIconVisualSpec,
  makeIconVisualSpecKey,
} from "./iconVisualSpec.js";
import {
  isFolderSlotReleaseMode,
  makeFolderSlotReleaseVisualSpec,
} from "./folderReleaseVisual.js";
import {
  makeFolderShellVisualKey,
  makeItemVisualKey,
} from "./visualOwnershipRegistry.js";

const GROUP_GATHER_DURATION_SECONDS = 0.22;
const GROUP_HOVER_LABEL_SCALE = 0.72;
const GROUP_RELEASE_PREWARM_BATCH_SIZE = 1;
const GROUP_RUNTIME_PHASES = new Set([
  GROUP_TRANSFER_PHASE.RELEASING,
  GROUP_TRANSFER_PHASE.RETURNING,
]);

function isGroupReleasePhase(phase) {
  return GROUP_RUNTIME_PHASES.has(phase);
}

function getEntryZIndex(entry, index, group) {
  if (Number.isFinite(Number(entry?.zBand))) return Number(entry.zBand);
  if (entry?.releaseRole === "folder-create-target") return 600;
  if (entry?.releaseRole === "lead") return 900;
  if (entry?.item?.id === group?.leadId || entry?.originKind === "lead") return 900;
  if (entry?.originKind === "folder-create-target") return 600;
  return 400 - index;
}

function getReleaseStart(entry) {
  const start = entry?.releaseStart;
  if (!start || start.kind === "current-pose") return null;
  return start;
}

function getEntryActorKey(entry) {
  const actorKey = entry?.actorKey;
  if (typeof actorKey !== "string" || !actorKey) {
    throw new Error(`Group drag entry is missing actorKey: ${String(entry?.item?.id || "unknown")}`);
  }
  return actorKey;
}

function getEntryContinuityKey(entry) {
  const continuityKey = entry?.continuityKey || getEntryActorKey(entry);
  if (typeof continuityKey !== "string" || !continuityKey) {
    throw new Error(`Group drag entry is missing continuityKey: ${String(entry?.item?.id || "unknown")}`);
  }
  return continuityKey;
}

function toStagePoint(point, state) {
  return clientPointToStageVisualPoint(point, state.stageRect) || { x: 0, y: 0 };
}

function toNodeStagePoint(point, state, visualOffsetY) {
  const stagePoint = toStagePoint(point, state);
  return {
    x: stagePoint.x,
    y: stagePoint.y - visualOffsetY,
  };
}

function readNodeVisualCenter(layer, node) {
  if (!layer || !node || node.destroyed) return null;
  const visualNode = node.visualWrap && !node.visualWrap.destroyed
    ? node.visualWrap
    : node;
  const center = layer.toLocal({ x: 0, y: 0 }, visualNode);
  if (!Number.isFinite(Number(center?.x)) || !Number.isFinite(Number(center?.y))) return null;
  return { x: Number(center.x), y: Number(center.y) };
}

function restoreNodeVisualCenter(layer, node, target) {
  const parent = node?.parent;
  const visualNode = node?.visualWrap && !node.visualWrap.destroyed
    ? node.visualWrap
    : node;
  if (!target || !parent || parent.destroyed || !visualNode || visualNode.destroyed) return false;
  const current = parent.toLocal({ x: 0, y: 0 }, visualNode);
  const desired = parent.toLocal(target, layer);
  if (!current || !desired) return false;
  node.position.set(
    node.position.x + desired.x - current.x,
    node.position.y + desired.y - current.y
  );
  return true;
}

function resetPooledActorStructure(node) {
  if (!node || node.destroyed) return;
  node.pivot.set(0, 0);
  node.skew.set(0, 0);
  node.rotation = 0;
}

function resolveVisualSpec(group, state) {
  const source = group.visualSpec || {};
  const spec = makeIconVisualSpec({
    ...source,
    iconSize: source.iconSize || state.iconSize,
  }) || makeIconVisualSpec({ iconSize: state.iconSize });
  const isMulti = Number(group.totalCount) > 1;
  const textless = isMulti || state.isTextlessMode === true || spec?.textless === true;
  return {
    cellHeight: isMulti ? state.iconSize * 1.42 : spec.cellHeight,
    cellWidth: isMulti ? state.iconSize * 1.42 : spec.cellWidth,
    compact: isMulti || spec.compact === true,
    iconSize: isMulti ? state.iconSize : spec.iconSize,
    singleLineLabel: isMulti || spec.singleLineLabel === true,
    textless,
  };
}

function makeVisualSpecTransitionTarget(group, state, sourceSpec) {
  const folderSpec = makeIconVisualSpec(state.folderVisualSpec);
  const desktopSpec = makeIconVisualSpec(state.desktopVisualSpec);
  const folderTransit = group?.folderTransit;
  const folderDestination = group?.intent?.type === "folder-slot"
    ? group.intent.folderId
    : null;
  const isFolderScope = Boolean(folderTransit?.folderId || folderDestination);
  if (Number(group?.totalCount) !== 1) return sourceSpec;
  if (isFolderScope && folderSpec) return folderSpec;
  if (group?.source?.type === "folder" && desktopSpec) return desktopSpec;
  return sourceSpec;
}

function stableAssetSignature(value) {
  if (typeof value !== "string" || !value) return "";
  return `${value.length}:${value.slice(0, 32)}:${value.slice(-32)}`;
}

function makeVisualStateKey(entry, state, group, visualSpec) {
  const item = entry.item || {};
  const status = state.showMissingLaunchTargetBadge
    ? state.launchTargetStatusById?.[item.id] || ""
    : "";
  const stageRect = state.stageRect || {};
  return [
    group.key,
    group.phase || "",
    item.id || "",
    item.type || "",
    item.name || "",
    item.customIconPath || "",
    stableAssetSignature(item.customIconDataUrl),
    visualSpec.cellHeight,
    visualSpec.cellWidth,
    visualSpec.compact ? 1 : 0,
    visualSpec.iconSize,
    visualSpec.singleLineLabel ? 1 : 0,
    visualSpec.textless ? 1 : 0,
    visualSpec.folderPreviewRelease ? 1 : 0,
    state.folderPageSize,
    state.height,
    state.width,
    stageRect.left,
    stageRect.top,
    stageRect.width,
    stageRect.height,
    state.showMissingLaunchTargetBadge ? 1 : 0,
    state.dragFolderHoverState?.key || "",
    state.dragFolderHoverState?.phase || "",
    state.dragFolderHoverState?.targetId || "",
    status,
  ].join("|");
}

function resolveEntryReleaseVisual(entry, state, group, visualSpec, resolveFolderNode) {
  const releaseOwnsVisual = isGroupReleasePhase(group.phase);
  const releaseEntry = releaseOwnsVisual
    ? group.runtimePlan?.entries?.find((candidate) => candidate?.id === entry.item?.id)
    : null;
  if (!releaseEntry || !isFolderSlotReleaseMode(releaseEntry.mode)) {
    return { folderSlot: false, scaleMultiplier: 1, visualSpec };
  }

  const target = releaseEntry.target || {};
  const targetFolderNode = resolveFolderNode?.({
    entry: releaseEntry,
    group,
    node: null,
    state,
    target,
  });
  const folderIconSize = Math.max(
    1,
    Number(targetFolderNode?.iconSize) || Number(state.iconSize) || Number(visualSpec.iconSize) || 64
  );
  const releaseVisualSpec = {
    ...makeFolderSlotReleaseVisualSpec(visualSpec, folderIconSize),
    folderPreviewRelease: true,
  };
  return {
    folderSlot: true,
    scaleMultiplier: 1,
    targetVisualSpec: releaseVisualSpec,
    visualSpec,
  };
}

function applyNodeVisualState(node, entry, state, group, visualSpec, options = {}) {
  const releaseOwnsVisual = isGroupReleasePhase(group.phase);
  const visualStateKey = makeVisualStateKey(entry, state, group, visualSpec);
  if (node.groupDragVisualStateKey !== visualStateKey) {
    if (visualSpec.folderPreviewRelease !== true) {
      node.clearFolderSlotReleaseVisual?.();
    }
    if (releaseOwnsVisual) {
      // The lead can spend the preceding frames in the app-on-app hover state.
      // Group release nodes are pooled, so letting IconNode carry that state
      // across the ownership handoff fades the artwork from the hover dim
      // alpha back to 1 while it is already travelling to its landing slot.
      // Clear the interaction-only artwork synchronously before the release
      // controller takes over position/scale/outer alpha.
      node.clearAppFolderCreateHoverAnimation?.({ immediate: true });
    }
    node.setState({
      batchSelected: false,
      cellHeight: visualSpec.cellHeight,
      cellWidth: visualSpec.cellWidth,
      compact: visualSpec.compact,
      draggable: false,
      dragging: false,
      dropTarget: false,
      editing: false,
      folderHoverState: releaseOwnsVisual ? null : (state.dragFolderHoverState || null),
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: Boolean(entry.item.customIconPath || entry.item.customIconDataUrl),
      iconSize: visualSpec.iconSize,
      interactive: false,
      item: entry.item,
      launchTargetStatus: state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[entry.item.id] || null
        : null,
      opening: false,
      preserveNodeScale: true,
      removable: false,
      focused: false,
      singleLineLabel: visualSpec.singleLineLabel,
      source: group.totalCount === 1
        ? group.source || entry.source || { type: "group-drag" }
        : entry.source || { type: "group-drag" },
      stageHeight: state.height,
      stageWidth: state.width,
      textless: visualSpec.textless,
      visualSpecTransition: options.visualSpecTransition || null,
      folderPreviewRelease: visualSpec.folderPreviewRelease === true,
    });
    node.groupDragVisualStateKey = visualStateKey;
  }
  const previousScaleMultiplier = Math.max(
    0.01,
    Number(node.groupDragReleaseScaleMultiplier) || 1
  );
  const nextScaleMultiplier = Math.max(0.01, Number(options.scaleMultiplier) || 1);
  if (Math.abs(previousScaleMultiplier - nextScaleMultiplier) > 0.0001) {
    const ratio = nextScaleMultiplier / previousScaleMultiplier;
    node.scale.set(
      Math.max(0.01, Number(node.scale.x) || 1) * ratio,
      Math.max(0.01, Number(node.scale.y) || 1) * ratio
    );
  }
  node.groupDragReleaseScaleMultiplier = nextScaleMultiplier;
  node.eventMode = "none";
}

function setNodeVisualState(node, entry, state, group, visualSpec, resolveFolderNode, visualSpecTransition = null) {
  node.stageRect = state.stageRect;
  const releaseVisual = resolveEntryReleaseVisual(
    entry,
    state,
    group,
    visualSpec,
    resolveFolderNode
  );
  applyNodeVisualState(node, entry, state, group, releaseVisual.visualSpec, {
    scaleMultiplier: releaseVisual.scaleMultiplier,
    visualSpecTransition,
  });
  return releaseVisual;
}

function moveNode(node, target, options = {}) {
  motion(node)
    .duration(options.duration ?? GROUP_GATHER_DURATION_SECONDS)
    .delay(Math.max(0, Number(options.delayMs) || 0) / 1000)
    .ease(options.ease || "power3.out")
    .overlay()
    .interrupt("retarget")
    .to({
      alpha: options.alpha ?? 1,
      snap: options.snap === true,
      x: target.x,
      y: target.y,
    })
    .start();
  motion(node.scale)
    .duration(options.duration ?? GROUP_GATHER_DURATION_SECONDS)
    .delay(Math.max(0, Number(options.delayMs) || 0) / 1000)
    .ease(options.ease || "power3.out")
    .overlay()
    .interrupt("retarget")
    .to({
      snap: options.snap === true,
      x: options.scale ?? 1,
      y: options.scale ?? 1,
    })
    .start();
}

function updateReleaseLabel(node, state, options = {}) {
  const label = node?.labelText;
  if (!label?.visible) return;
  const hover = state.dragFolderHoverState;
  const hidden = hover?.targetType === "folder" && (hover.phase === "hover" || hover.phase === "flash");
  const targetAlpha = hidden ? 0 : 1;
  const targetScale = hidden ? GROUP_HOVER_LABEL_SCALE : 1;
  if (options.immediate || state.groupState?.reducedMotion || hidden) {
    killMotionOf(label, null, { reason: "group-drag-label-snap" });
    killMotionOf(label.scale, null, { reason: "group-drag-label-snap" });
    label.alpha = targetAlpha;
    label.scale.set(targetScale);
    return;
  }
  if (Math.abs((Number(label.alpha) || 0) - targetAlpha) > 0.001) {
    motion(label)
      .duration(0.12)
      .ease("power2.out")
      .overlay()
      .interrupt("retarget")
      .to({ alpha: targetAlpha })
      .start();
  }
  if (Math.abs((Number(label.scale?.x) || 1) - targetScale) > 0.001) {
    motion(label.scale)
      .duration(0.12)
      .ease("power2.out")
      .overlay()
      .interrupt("retarget")
      .to({ x: targetScale, y: targetScale })
      .start();
  }
}

export class GroupDragLayer extends Container {
  constructor(options = {}) {
    super();
    this.eventMode = "none";
    this.sortableChildren = true;
    this.badge = new Container();
    this.badge.eventMode = "none";
    this.badge.zIndex = 1000;
    this.badgeBackground = new Graphics();
    this.badgeText = createPixiText({
      text: "",
      style: {
        fill: 0xffffff,
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: 13,
        fontWeight: "700",
      },
    });
    this.badgeText.anchor.set(0.5);
    this.badge.addChild(this.badgeBackground);
    this.badge.addChild(this.badgeText);
    this.folderClipActorLayer = new Container({ label: "group-drag-folder-clip-actors" });
    this.folderClipActorLayer.eventMode = "none";
    this.folderClipActorLayer.sortableChildren = true;
    this.folderClipActorLayer.zIndex = 250;
    this.folderClipMask = new Graphics({ label: "group-drag-folder-clip-mask" });
    this.folderClipMask.eventMode = "none";
    this.folderClipMaskSignature = "";
    this.folderClipActorLayer.mask = this.folderClipMask;
    this.nodes = [];
    this.entryBadges = [];
    this.activeKey = null;
    this.activeNodesByContinuityKey = new Map();
    this.phase = null;
    this.badgeSignature = null;
    this.stageTrailSource = null;
    this.stageTrailOffset = null;
    this.stageTrailRectKey = "";
    this.stageTrailCache = [];
    this.followerClock = { time: 0 };
    this.followerClockKey = null;
    this.followerClockTarget = 0;
    this.followerFrame = null;
    this.prewarmTargetCount = 0;
    this.resolveFolderNode = options.resolveFolderNode || (() => null);
    this.resolveFolderClipGeometry = options.resolveFolderClipGeometry || (() => null);
    this.resolvePointTarget = options.resolvePointTarget || (() => null);
    this.onReleaseSettled = options.onReleaseSettled || (() => {});
    this.onReleaseAborted = options.onReleaseAborted || (() => {});
    this.onPrewarmRequest = options.onPrewarmRequest || (() => {});
    this.onRenderRequest = options.onRenderRequest || this.onPrewarmRequest;
    this.onVisualOwnershipChange = options.onVisualOwnershipChange || (() => {});
    this.visualOwnership = options.visualOwnership || null;
    this.visualOwnershipToken = null;
    this.ownedVisualKeys = new Set();
    this.ownershipKeysByActor = new Map();
    this.settledOwnershipActorKeys = new Set();
    this.pendingFolderActorHandoffs = new Map();
    this.ownershipRuntimePlanKey = null;
    this.visualSpecTransitionClock = { progress: 1 };
    this.visualSpecTransition = {
      from: null,
      groupKey: null,
      key: "",
      progress: 1,
      to: null,
    };
    // GroupReleaseController composes this hook with its own release-frame
    // resolver. The clock tween below keeps the renderer alive after the
    // physical pointer stops, so followers can consume the rest of the trail.
    this.onRender = () => this.renderFollowerFrame();
    this.releaseController = new GroupReleaseController(this, {
      onEntryAbort: (payload) => this.finishReleaseActor(payload, true),
      onEntryComplete: (payload) => this.finishReleaseActor(payload, false),
      onFolderShellComplete: (payload) => this.finishFolderShellActor(payload),
      onRenderRequest: (reason) => this.onRenderRequest(reason),
      prepareFolderSlotVisual: ({ context, node }) => {
        const targetVisualSpec = node?.groupDragFolderSlotTargetVisualSpec;
        if (!context?.entry || !targetVisualSpec) return false;
        return node.prepareFolderSlotReleaseVisual?.(targetVisualSpec.iconSize) === true;
      },
      resolveFolderNode: (payload) => this.resolveFolderNode(payload),
      resolvePointTarget: (payload) => this.resolvePointTarget(payload),
    });
    this.addChild(this.folderClipMask);
    this.addChild(this.folderClipActorLayer);
    this.addChild(this.badge);
    this.visible = false;
  }

  releaseAllVisualOwnership(reason = "group-transfer-ownership-clear") {
    const token = this.visualOwnershipToken;
    if (token != null && this.visualOwnership) {
      this.visualOwnership.releaseByToken(token);
    }
    const changed = this.ownedVisualKeys.size > 0 || token != null;
    this.visualOwnershipToken = null;
    this.ownedVisualKeys.clear();
    this.ownershipKeysByActor.clear();
    this.settledOwnershipActorKeys.clear();
    this.pendingFolderActorHandoffs.clear();
    this.ownershipRuntimePlanKey = null;
    if (changed) this.onVisualOwnershipChange(reason);
  }

  syncVisualOwnership(group = null) {
    const isActive = Boolean(
      group?.key &&
      group.phase !== GROUP_TRANSFER_PHASE.SETTLED
    );
    if (!isActive || !this.visualOwnership) {
      this.releaseAllVisualOwnership("group-transfer-inactive");
      return { folderShellIds: new Set(), itemIds: new Set() };
    }

    const token = `group-transfer:${group.key}`;
    if (this.visualOwnershipToken !== token) {
      this.releaseAllVisualOwnership("group-transfer-session-replaced");
      this.visualOwnershipToken = token;
    }
    const runtimePlanKey = group.runtimePlan?.key || null;
    if (runtimePlanKey !== this.ownershipRuntimePlanKey) {
      this.ownershipRuntimePlanKey = runtimePlanKey;
      this.settledOwnershipActorKeys.clear();
      this.pendingFolderActorHandoffs.clear();
    }

    const desired = new Set();
    const keysByActor = new Map();
    const actorByKey = new Map();
    const actors = group.presentationPlan?.actors || [];
    for (const actor of actors) {
      if (!actor?.key || this.settledOwnershipActorKeys.has(actor.key)) continue;
      const keys = actor.role === "folder-shell"
        ? [makeFolderShellVisualKey(actor.endAnchor?.folderId)]
        : (actor.memberIds || []).map(makeItemVisualKey);
      const normalizedKeys = keys.filter(Boolean);
      keysByActor.set(actor.key, normalizedKeys);
      for (const key of normalizedKeys) {
        desired.add(key);
        actorByKey.set(key, actor.key);
      }
    }
    const ownsCommittedShells = group.outcome === GROUP_TRANSFER_OUTCOME.ACCEPTED && [
      GROUP_TRANSFER_PHASE.COMMITTING,
      GROUP_TRANSFER_PHASE.RELEASING,
    ].includes(group.phase);
    const prospectiveFolderIds = ownsCommittedShells
      ? [
        group.semanticPlan?.effects?.createdFolderId,
        ...(group.semanticPlan?.effects?.emptiedFolderIds || []),
      ].filter(Boolean)
      : [];
    for (const folderId of prospectiveFolderIds) {
      const actorKey = `folderShell:${folderId}`;
      const key = makeFolderShellVisualKey(folderId);
      if (!this.settledOwnershipActorKeys.has(actorKey) && key) {
        desired.add(key);
        if (!keysByActor.has(actorKey)) keysByActor.set(actorKey, [key]);
        actorByKey.set(key, actorKey);
      }
    }

    for (const key of desired) {
      this.visualOwnership.acquire(key, {
        actorKey: actorByKey.get(key) || null,
        folderId: key.startsWith("folderShell:") ? key.slice("folderShell:".length) : null,
        kind: "group-transfer",
        token,
      });
    }
    for (const key of this.ownedVisualKeys) {
      if (!desired.has(key)) this.visualOwnership.release(key, token);
    }
    this.ownedVisualKeys = desired;
    this.ownershipKeysByActor = keysByActor;

    const itemIds = new Set();
    const folderShellIds = new Set();
    for (const key of desired) {
      if (key.startsWith("item:")) itemIds.add(key.slice("item:".length));
      if (key.startsWith("folderShell:")) folderShellIds.add(key.slice("folderShell:".length));
    }
    return { folderShellIds, itemIds };
  }

  finishReleaseActor(payload, aborted) {
    const actorKey = payload?.actorKey || null;
    if (aborted) {
      if (payload?.node && !payload.node.destroyed) payload.node.visible = false;
      for (const node of this.nodes) {
        if (node && !node.destroyed) node.visible = false;
      }
      for (const badge of this.entryBadges) badge.container.visible = false;
      this.releaseController.hideFolderShellActors?.();
      this.releaseAllVisualOwnership("group-transfer-actor-aborted");
      this.onReleaseAborted({ ...payload, actorKey });
      return;
    }
    const shellActorKey = this.getCreatedFolderShellActorKey(payload);
    if (actorKey && shellActorKey && !this.settledOwnershipActorKeys.has(shellActorKey)) {
      this.pendingFolderActorHandoffs.set(actorKey, { payload: { ...payload, actorKey }, shellActorKey });
      return;
    }
    this.handoffReleaseActor({ ...payload, actorKey });
  }

  getCreatedFolderShellActorKey(payload) {
    const runtimePlan = payload?.runtimePlan || null;
    const actorKey = payload?.actorKey || null;
    const entry = runtimePlan?.entries?.find((candidate) => candidate?.actorKey === actorKey) || null;
    if (entry?.mode !== "created-folder") return null;
    const folderId = entry.target?.folderId || payload?.release?.targetFolderId || null;
    const shellActor = runtimePlan?.shellActors?.find((candidate) => (
      candidate?.role === "folder-shell" &&
      (!folderId || candidate.endAnchor?.folderId === folderId)
    ));
    return shellActor?.key || null;
  }

  releaseActorOwnership(actorKey) {
    if (!actorKey) return;
    this.settledOwnershipActorKeys.add(actorKey);
    const keys = this.ownershipKeysByActor.get(actorKey) || [];
    for (const key of keys) {
      this.visualOwnership?.release?.(key, this.visualOwnershipToken);
      this.ownedVisualKeys.delete(key);
    }
    this.ownershipKeysByActor.delete(actorKey);
  }

  handoffReleaseActor(payload, options = {}) {
    const actorKey = payload?.actorKey || null;
    if (payload?.node && !payload.node.destroyed) payload.node.visible = false;
    this.releaseActorOwnership(actorKey);
    this.pendingFolderActorHandoffs.delete(actorKey);
    if (options.notifyOwnership !== false) {
      this.onVisualOwnershipChange("group-transfer-actor-handoff");
    }
    this.onReleaseSettled({ ...payload, actorKey });
  }

  finishFolderShellActor(payload = {}) {
    const actorKey = payload.actorKey || null;
    if (!actorKey || (payload.planKey && payload.planKey !== this.ownershipRuntimePlanKey)) return false;
    if (this.settledOwnershipActorKeys.has(actorKey)) return true;

    const queued = [...this.pendingFolderActorHandoffs.values()]
      .filter((entry) => entry.shellActorKey === actorKey);
    this.releaseController.hideFolderShellActors?.();
    for (const entry of queued) {
      const node = entry.payload?.node;
      if (node && !node.destroyed) node.visible = false;
    }
    this.releaseActorOwnership(actorKey);
    for (const entry of queued) {
      this.handoffReleaseActor(entry.payload, { notifyOwnership: false });
    }
    this.onVisualOwnershipChange("group-transfer-folder-shell-handoff");
    return true;
  }

  clearFollowerClock(reason = "group-follower-clock-clear") {
    if (this.followerClockKey != null || this.followerFrame) {
      killMotionOf(this.followerClock, "time", { reason });
    }
    this.followerClock.time = 0;
    this.followerClockKey = null;
    this.followerClockTarget = 0;
    this.followerFrame = null;
  }

  syncFollowerClock(group, stageTrail, nodePointerCenter, visualSpec) {
    if (
      group.phase !== "dragging" ||
      group.reducedMotion === true ||
      group.entries.length <= 1 ||
      stageTrail.length < 2
    ) {
      this.clearFollowerClock("group-follower-clock-inactive");
      return null;
    }

    const latestTime = Number(stageTrail[stageTrail.length - 1]?.time) || 0;
    const settleDurationMs = getGroupTrailSettleDurationMs(group.entries.length);
    const targetTime = latestTime + settleDurationMs;
    const isNewClock = this.followerClockKey !== group.key;
    const previousTime = isNewClock
      ? latestTime
      : Math.max(latestTime, Number(this.followerClock.time) || latestTime);
    const currentTime = Math.min(previousTime, targetTime);
    this.followerClock.time = currentTime;
    this.followerClockKey = group.key;
    this.followerFrame = {
      entryCount: group.entries.length,
      groupKey: group.key,
      maxDistance: Math.max(64, visualSpec.iconSize * 1.18),
      nodePointerCenter,
      stageTrail,
    };

    if (targetTime > currentTime + 0.001 && this.followerClockTarget !== targetTime) {
      this.followerClockTarget = targetTime;
      motion(this.followerClock)
        .duration((targetTime - currentTime) / 1000)
        .ease("linear")
        .overlay()
        .interrupt("retarget")
        .to({ time: targetTime })
        .start();
    } else if (targetTime <= currentTime + 0.001) {
      this.followerClockTarget = targetTime;
    }
    return currentTime;
  }

  renderFollowerFrame() {
    this.syncFolderClipMask();
    this.prewarmReleaseNodes();
    const frame = this.followerFrame;
    if (
      !frame ||
      !this.visible ||
      this.activeKey !== frame.groupKey ||
      this.phase !== "dragging"
    ) return;
    for (let index = 1; index < frame.entryCount; index += 1) {
      const node = this.nodes[index];
      if (!node?.visible || !this.isActorNodeParent(node.parent)) continue;
      const target = makeGroupFollowerTarget(
        frame.nodePointerCenter,
        frame.stageTrail,
        index,
        frame.entryCount,
        {
          maxDistance: frame.maxDistance,
          timeMs: this.followerClock.time,
        }
      );
      node.position.set(target.x, target.y);
    }
  }

  isActorNodeParent(parent) {
    return parent === this || parent === this.folderClipActorLayer;
  }

  syncFolderClipMask() {
    const geometry = this.resolveFolderClipGeometry?.() || null;
    const width = Number(geometry?.width);
    const height = Number(geometry?.height);
    if (!geometry || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return false;
    }
    const radius = Math.max(0, Number(geometry.radius) || 0);
    const signature = `${width}:${height}:${radius}`;
    if (signature !== this.folderClipMaskSignature) {
      this.folderClipMaskSignature = signature;
      this.folderClipMask
        .clear()
        .roundRect(0, 0, width, height, radius)
        .fill({ color: 0xffffff, alpha: 1 });
    }
    this.folderClipMask.position.set(Number(geometry.x) || 0, Number(geometry.y) || 0);
    this.folderClipMask.scale.set(
      Math.max(0.0001, Math.abs(Number(geometry.scaleX) || 1)),
      Math.max(0.0001, Math.abs(Number(geometry.scaleY) || 1))
    );
    this.folderClipMask.rotation = Number(geometry.rotation) || 0;
    return true;
  }

  routeEntryNode(node, entry) {
    if (!node || node.destroyed) return;
    if (this.releaseController?.ownsActorNode(node)) return;
    const targetParent = entry?.visibilityPolicy?.kind === "folder-panel-clip"
      ? this.folderClipActorLayer
      : this;
    if (node.parent === targetParent) return;
    if (targetParent === this.folderClipActorLayer) {
      this.syncFolderClipMask();
    }
    targetParent.reparentChild(node);
  }

  bindEntryNodes(entries, options = {}) {
    if (this.nodes.length < entries.length) this.acquireNode(entries.length - 1);

    const previousNodesByContinuityKey = options.retainExisting === false
      ? new Map()
      : this.activeNodesByContinuityKey;
    const actorKeys = entries.map(getEntryActorKey);
    const continuityKeys = entries.map(getEntryContinuityKey);
    if (new Set(actorKeys).size !== actorKeys.length) {
      throw new Error("Group drag entries must have unique actorKey values");
    }
    if (new Set(continuityKeys).size !== continuityKeys.length) {
      throw new Error("Group drag entries must have unique continuityKey values");
    }

    const badgeByNode = new Map(
      this.nodes.map((node, index) => [node, this.entryBadges[index]])
    );
    const retainedNodesByContinuityKey = new Map();
    const reservedNodes = new Set();
    for (const continuityKey of continuityKeys) {
      const node = previousNodesByContinuityKey.get(continuityKey);
      if (!node || !badgeByNode.has(node) || reservedNodes.has(node)) continue;
      retainedNodesByContinuityKey.set(continuityKey, node);
      reservedNodes.add(node);
    }

    const freeNodes = this.nodes.filter((node) => !reservedNodes.has(node));
    const activeNodes = [];
    const nextNodesByContinuityKey = new Map();
    for (const continuityKey of continuityKeys) {
      const retainedNode = retainedNodesByContinuityKey.get(continuityKey);
      const node = retainedNode || freeNodes.shift();
      if (!node) throw new Error(`Group drag node pool exhausted for actor: ${continuityKey}`);
      if (!retainedNode) resetPooledActorStructure(node);
      activeNodes.push(node);
      nextNodesByContinuityKey.set(continuityKey, node);
    }

    const activeNodeSet = new Set(activeNodes);
    const inactiveNodes = this.nodes.filter((node) => !activeNodeSet.has(node));
    this.nodes = [...activeNodes, ...inactiveNodes];
    this.entryBadges = this.nodes.map((node) => badgeByNode.get(node));
    this.activeNodesByContinuityKey = nextNodesByContinuityKey;
    return {
      actorKeys,
      continuityKeys,
      retainedContinuityKeys: new Set(retainedNodesByContinuityKey.keys()),
    };
  }

  acquireNode(index) {
    while (this.nodes.length <= index) {
      const node = new IconNode({ onAction: () => {} });
      node.eventMode = "none";
      const badge = new Container();
      badge.eventMode = "none";
      badge.zIndex = 2000;
      const background = new Graphics();
      const text = createPixiText({
        text: "",
        style: {
          fill: 0xffffff,
          fontFamily: "Inter, Segoe UI, sans-serif",
          fontSize: 11,
          fontWeight: "700",
        },
      });
      text.anchor.set(0.5);
      badge.addChild(background);
      badge.addChild(text);
      node.addChild(badge);
      this.nodes.push(node);
      this.entryBadges.push({ background, container: badge, signature: null, text });
      this.addChild(node);
    }
    return this.nodes[index];
  }

  prewarmReleaseNodes() {
    const targetCount = Math.max(0, Math.floor(Number(this.prewarmTargetCount) || 0));
    if (this.nodes.length >= targetCount) return false;
    const start = this.nodes.length;
    const end = Math.min(targetCount, start + GROUP_RELEASE_PREWARM_BATCH_SIZE);
    this.acquireNode(end - 1);
    for (let index = start; index < end; index += 1) {
      this.nodes[index].visible = false;
      this.entryBadges[index].container.visible = false;
    }
    this.onPrewarmRequest("group-release-pool-prewarm");
    return true;
  }

  syncVisualSpecTransition(group, state, sourceSpec) {
    const targetSpec = makeVisualSpecTransitionTarget(group, state, sourceSpec) || sourceSpec;
    const groupKey = group?.key || null;
    const targetKey = `${groupKey || ""}:${makeIconVisualSpecKey(targetSpec)}`;
    const previous = this.visualSpecTransition;
    const groupChanged = previous.groupKey !== groupKey;
    const targetChanged = previous.key !== targetKey;
    let currentSpec = previous.from && previous.to
      ? interpolateIconVisualSpec(previous.from, previous.to, this.visualSpecTransitionClock.progress)
      : sourceSpec;

    if (groupChanged) {
      currentSpec = sourceSpec;
      this.visualSpecTransitionClock.progress = 1;
    }

    if (groupChanged || targetChanged) {
      const needsMotion = hasIconVisualSpecMismatch(currentSpec, targetSpec);
      this.visualSpecTransition = {
        from: currentSpec,
        groupKey,
        key: targetKey,
        progress: needsMotion ? 0 : 1,
        to: targetSpec,
      };
      killMotionOf(this.visualSpecTransitionClock, "progress", {
        reason: "group-drag-visual-spec-retarget",
      });
      this.visualSpecTransitionClock.progress = needsMotion ? 0 : 1;
      if (needsMotion) {
        motion(this.visualSpecTransitionClock)
          .duration(0.18)
          .ease("power2.out")
          .overlay()
          .interrupt("retarget")
          .to({
            onComplete: () => {
              this.visualSpecTransition.progress = 1;
              this.onRenderRequest("group-drag-visual-spec-complete");
            },
            onUpdate: () => this.onRenderRequest("group-drag-visual-spec"),
            progress: 1,
          })
          .start();
      }
    }

    const progress = Math.max(0, Math.min(1, Number(this.visualSpecTransitionClock.progress) || 0));
    this.visualSpecTransition.progress = progress;
    return {
      active: hasIconVisualSpecMismatch(this.visualSpecTransition.from, this.visualSpecTransition.to) && progress < 1,
      progress,
      source: this.visualSpecTransition.from,
      spec: interpolateIconVisualSpec(
        this.visualSpecTransition.from || sourceSpec,
        this.visualSpecTransition.to || targetSpec,
        progress
      ) || sourceSpec,
      target: this.visualSpecTransition.to || targetSpec,
    };
  }

  clear() {
    this.releaseController?.clear?.("group-drag-clear");
    this.releaseAllVisualOwnership("group-drag-clear");
    this.clearFollowerClock("group-drag-clear");
    killMotionOf(this.visualSpecTransitionClock, "progress", { reason: "group-drag-clear" });
    this.visualSpecTransitionClock.progress = 1;
    this.visualSpecTransition = {
      from: null,
      groupKey: null,
      key: "",
      progress: 1,
      to: null,
    };
    this.activeKey = null;
    this.activeNodesByContinuityKey.clear();
    this.phase = null;
    this.prewarmTargetCount = 0;
    this.visible = false;
    this.stageTrailSource = null;
    this.stageTrailOffset = null;
    this.stageTrailRectKey = "";
    this.stageTrailCache = [];
    this.badge.visible = false;
    for (const node of this.nodes) {
      killMotionOf(node, null, { reason: "group-drag-clear" });
      killMotionOf(node.scale, null, { reason: "group-drag-clear" });
      node.visible = false;
      node.groupDragVisualStateKey = null;
      node.groupDragReleaseScaleMultiplier = 1;
      node.groupDragFolderSlotTargetVisualSpec = null;
      // The label handoff owns two child Text targets.  Clear them with the
      // pooled actor so a canceled drag cannot leave the previous label
      // crossfade running into the next drag session.
      node.finishLabelTransitionBlend?.();
      node.clearFolderSlotReleaseVisual?.("group-drag-clear");
      if (node.parent === this.folderClipActorLayer) this.reparentChild(node);
      resetPooledActorStructure(node);
    }
    for (const badge of this.entryBadges) badge.container.visible = false;
  }

  update(state) {
    const group = state.groupState;
    if (!group?.key || !group.entries?.length) {
      this.clear();
      this.prewarmTargetCount = Math.max(
        0,
        Math.floor(Number(state.releasePrewarmCount) || 0)
      );
      this.prewarmReleaseNodes();
      return;
    }
    const entries = group.entries;
    const isReleasePhase = GROUP_RUNTIME_PHASES.has(group.phase);
    const isNewGroup = this.activeKey !== group.key;
    if (isReleasePhase && this.nodes.length < entries.length) {
      if (isNewGroup) this.activeNodesByContinuityKey.clear();
      this.activeKey = group.key;
      this.phase = group.phase;
      this.visible = true;
      this.badge.visible = false;
      this.prewarmTargetCount = entries.length;
      this.clearFollowerClock("group-release-pool-prewarm");
      this.prewarmReleaseNodes();
      return;
    }
    this.activeKey = group.key;
    this.phase = group.phase;
    this.prewarmTargetCount = isInteractiveGroupTransferPhase(group.phase) || group.phase === GROUP_TRANSFER_PHASE.COMMITTING
      ? Math.max(0, Math.floor(Number(group.releaseVisualCount) || 0))
      : 0;
    this.visible = true;

    const sourceVisualSpec = resolveVisualSpec(group, state);
    const visualSpecTransition = this.syncVisualSpecTransition(group, state, sourceVisualSpec);
    const visualSpec = visualSpecTransition.spec;
    this.syncFolderClipMask();
    // Release-lane cancellation can restore the previous motion's final
    // scale.  Synchronize the plan before pooled nodes receive their new
    // release visual state so that cancellation cannot overwrite this frame.
    this.releaseController.preparePlan?.(group.runtimePlan?.key || null);
    const { actorKeys, continuityKeys, retainedContinuityKeys } = this.bindEntryNodes(entries, {
      retainExisting: !isNewGroup,
    });
    const visualOffsetY = getIconVisualOffsetY(visualSpec.textless);
    const pointerCenter = toStagePoint(group.center || group.pointer, state);
    const nodePointerCenter = {
      x: pointerCenter.x,
      y: pointerCenter.y - visualOffsetY,
    };
    const stageRect = state.stageRect || {};
    const stageTrailRectKey = [
      stageRect.left,
      stageRect.top,
      stageRect.width,
      stageRect.height,
    ].join(":");
    let stageTrail = this.stageTrailCache;
    if (
      this.stageTrailSource !== group.trail ||
      this.stageTrailOffset !== visualOffsetY ||
      this.stageTrailRectKey !== stageTrailRectKey
    ) {
      this.stageTrailSource = group.trail;
      this.stageTrailOffset = visualOffsetY;
      this.stageTrailRectKey = stageTrailRectKey;
      stageTrail = (group.trail || []).map((point) => ({
        ...toNodeStagePoint(point, state, visualOffsetY),
        time: Number(point.time) || 0,
      }));
      this.stageTrailCache = stageTrail;
    }
    const followerTime = this.syncFollowerClock(
      group,
      stageTrail,
      nodePointerCenter,
      visualSpec
    );
    const releaseNodes = new Map();
    const runtimePlan = group.runtimePlan;
    const settledActorKeys = new Set([
      ...(group.settledActorKeys || []),
      ...this.settledOwnershipActorKeys,
    ]);
    const releaseState = {
      ...state,
      groupState: group,
      visualOffsetY,
      visualSpec,
    };
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const actorKey = actorKeys[index];
      const entryId = entry.item.id;
      const isNewEntry = !retainedContinuityKeys.has(continuityKeys[index]);
      const releaseStart = isReleasePhase ? getReleaseStart(entry) : null;
      const releaseStartPoint = releaseStart?.point || entry.origin;
      const node = this.nodes[index];
      this.routeEntryNode(node, entry);
      if (isReleasePhase && settledActorKeys.has(actorKey)) {
        node.visible = false;
        this.entryBadges[index].container.visible = false;
        continue;
      }
      const releaseSourceCenter = isReleasePhase && this.isActorNodeParent(node.parent)
        ? (isNewEntry
          ? toStagePoint(releaseStartPoint, state)
          : readNodeVisualCenter(this, node))
        : null;
      const releaseVisual = setNodeVisualState(
        node,
        entry,
        state,
        group,
        visualSpec,
        this.resolveFolderNode,
        visualSpecTransition
      );
      node.groupDragFolderSlotTargetVisualSpec = releaseVisual.targetVisualSpec || null;
      this.updateEntryBadge(index, entry, state);
      node.visible = true;
      node.zIndex = getEntryZIndex(entry, index, group);
      releaseNodes.set(entryId, node);
      if (isReleasePhase) {
        // Gathering/follower motion uses the overlay base lane. Once a release
        // plan owns the node, that lane must not survive underneath drag or
        // handoff and regain write ownership after the release lane settles.
        killMotionOf(node, "x,y,alpha", {
          lane: "base",
          laneKey: "overlay",
          reason: "group-release-ownership",
        });
        killMotionOf(node.scale, "x,y", {
          lane: "base",
          laneKey: "overlay",
          reason: "group-release-ownership",
        });
      }
      const stackTarget = makeGroupFollowerTarget(
        nodePointerCenter,
        stageTrail,
        index,
        entries.length,
        {
          maxDistance: Math.max(64, visualSpec.iconSize * 1.18),
          reducedMotion: group.reducedMotion === true,
          timeMs: followerTime,
        }
      );

      if (isNewEntry) {
        const origin = toNodeStagePoint(releaseStartPoint, state, visualOffsetY);
        node.position.set(origin.x, origin.y);
        node.scale.set(
          Math.max(0.08, Number(releaseStart?.scale ?? entry.originScale) || 1) *
            releaseVisual.scaleMultiplier
        );
        if (releaseVisual.folderSlot) {
          restoreNodeVisualCenter(this, node, releaseSourceCenter);
        }
        node.alpha = entry.originKind === "folder-hidden" ? 0 : 0.82;
        if (group.phase === GROUP_TRANSFER_PHASE.COMMITTING) {
          node.alpha = 1;
          continue;
        }
        if (isReleasePhase) {
          // The release controller owns the first releasing/returning frame.
          // Do not let a gather tween run for one frame and steal its start pose.
          node.alpha = Number.isFinite(Number(releaseStart?.alpha))
            ? Math.max(0, Number(releaseStart.alpha))
            : 1;
          if (!releaseStart && group.reducedMotion) {
            node.position.set(stackTarget.x, stackTarget.y);
            node.scale.set(
              (index === 0 ? 1.08 : Math.max(0.76, 1 - index * 0.018)) *
                releaseVisual.scaleMultiplier
            );
            node.alpha = 1;
            updateReleaseLabel(node, state, { immediate: true });
          }
          continue;
        } else if (index === 0) {
          // The lead must remain under the pointer immediately; a delayed
          // gather tween is the source of the old first-frame drag lag.
          killMotionOf(node, null, { reason: "group-drag-lead-handoff" });
          killMotionOf(node.scale, null, { reason: "group-drag-lead-handoff" });
          node.position.set(stackTarget.x, stackTarget.y);
          node.scale.set(1.08 * releaseVisual.scaleMultiplier);
          node.alpha = 1;
          updateReleaseLabel(node, state, { immediate: true });
          continue;
        }
        if (group.reducedMotion) {
          node.position.set(stackTarget.x, stackTarget.y);
          node.scale.set(
            (index === 0 ? 1.08 : Math.max(0.76, 1 - index * 0.018)) *
              releaseVisual.scaleMultiplier
          );
          node.alpha = 1;
          updateReleaseLabel(node, state, { immediate: true });
          continue;
        }
        moveNode(node, stackTarget, {
          alpha: 1,
          delayMs: entry.delayMs,
          scale: (index === 0 ? 1.08 : Math.max(0.76, 1 - index * 0.018)) *
            releaseVisual.scaleMultiplier,
        });
        updateReleaseLabel(node, state);
        continue;
      }

      if (releaseVisual.folderSlot) {
        restoreNodeVisualCenter(this, node, releaseSourceCenter);
      }

      if (isInteractiveGroupTransferPhase(group.phase)) {
        killMotionOf(node, null, { reason: "group-drag-history-sample" });
        killMotionOf(node.scale, null, { reason: "group-drag-history-sample" });
        node.position.set(stackTarget.x, stackTarget.y);
        node.scale.set(index === 0 ? 1.08 : Math.max(0.76, 1 - index * 0.018));
        node.alpha = 1;
        updateReleaseLabel(node, state);
        continue;
      }
    }
    for (let index = entries.length; index < this.nodes.length; index += 1) {
      this.nodes[index].visible = false;
    }
    this.prewarmReleaseNodes();
    this.updateBadge(group, pointerCenter, state, visualSpec);
    if (runtimePlan) {
      this.releaseController.update({
        ...releaseState,
        group: {
          ...group,
          runtimePlan,
          settledActorKeys: [...settledActorKeys],
        },
        nodes: releaseNodes,
      });
    } else {
      this.releaseController.clear("group-release-plan-cleared");
    }
  }

  updateBadge(group, pointerCenter, state, visualSpec) {
    this.badge.visible = group.totalCount > 1 && isInteractiveGroupTransferPhase(group.phase);
    if (!this.badge.visible) return;
    const iconSize = visualSpec?.iconSize || state.iconSize;
    const text = group.cancelArmed
      ? `× ${group.totalCount}`
      : String(group.totalCount);
    const color = group.cancelArmed
      ? 0x64748b
      : group.intentPlan?.status === "rejected"
      ? 0xe34d59
        : group.intentPlan?.status === "accepted"
          ? 0x2fa66a
          : 0x2478d4;
    const width = Math.max(28, 15 + text.length * 9);
    const signature = `${text}:${color}:${width}`;
    if (signature !== this.badgeSignature) {
      this.badgeSignature = signature;
      this.badgeBackground
        .clear()
        .roundRect(-width / 2, -13, width, 26, 13)
        .fill({ alpha: 0.96, color })
        .stroke({ alpha: 0.85, color: 0xffffff, width: 1 });
      this.badgeText.text = text;
    }
    this.badge.position.set(
      pointerCenter.x + Math.max(22, iconSize * 0.46),
      pointerCenter.y - Math.max(22, iconSize * 0.46)
    );
  }

  updateEntryBadge(index, entry, state) {
    const badge = this.entryBadges[index];
    if (!badge) return;
    const count = Math.max(1, Number(entry.bundleCount) || entry.memberIds?.length || 1);
    badge.container.visible = count > 1;
    if (!badge.container.visible) return;
    const text = `+${count - 1}`;
    const size = Math.max(17, Math.min(22, state.iconSize * 0.28));
    const signature = `${text}:${size}`;
    if (signature !== badge.signature) {
      badge.signature = signature;
      badge.background
        .clear()
        .circle(0, 0, size / 2)
        .fill({ alpha: 0.96, color: 0x2478d4 })
        .stroke({ alpha: 0.9, color: 0xffffff, width: 1 });
      badge.text.text = text;
      badge.text.style.fontSize = Math.max(9, Math.round(size * 0.48));
    }
    badge.container.position.set(
      state.iconSize * 0.35,
      -state.iconSize * 0.35
    );
  }

  destroy(options) {
    this.releaseController?.destroy?.();
    this.releaseController = null;
    this.clear();
    this.onRender = null;
    this.followerClock = null;
    this.onPrewarmRequest = null;
    super.destroy(options);
  }
}
