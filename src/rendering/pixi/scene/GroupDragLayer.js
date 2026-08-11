import { Container, Graphics, Text } from "pixi.js";
import { IconNode } from "../nodes/IconNode.js";
import { clientPointToStageVisualPoint } from "../geometry/stageCoordinates.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import { GroupReleaseController } from "./GroupReleaseController.js";
import {
  GROUP_RELEASE_ROLE,
  GROUP_RELEASE_START_KIND,
} from "../../../domain/groupReleasePopulation.js";
import {
  getGroupTrailSettleDurationMs,
  makeGroupFollowerTarget,
} from "./groupDragPresentation.js";
import { makeIconVisualSpec } from "./iconVisualSpec.js";
import {
  isFolderSlotReleaseMode,
  makeFolderSlotReleaseVisualSpec,
} from "./folderReleaseVisual.js";

const GROUP_GATHER_DURATION_SECONDS = 0.22;
const GROUP_HOVER_LABEL_SCALE = 0.72;
const GROUP_RELEASE_PREWARM_BATCH_SIZE = 1;
const GROUP_INTERACTIVE_PHASES = new Set(["gathering", "dragging"]);
const GROUP_RELEASE_PHASES = new Set(["accepted", "rejected", "cancelling"]);

function isGroupReleasePhase(phase) {
  return phase === "committing" || GROUP_RELEASE_PHASES.has(phase);
}

function getEntryZIndex(entry, index, group) {
  if (entry?.releaseRole === GROUP_RELEASE_ROLE.FOLDER_CREATE_TARGET) return 600;
  if (entry?.releaseRole === GROUP_RELEASE_ROLE.LEAD) return 800;
  if (entry?.item?.id === group?.leadId || entry?.originKind === "lead") return 800;
  if (entry?.originKind === "folder-create-target") return 600;
  return 400 - index;
}

function getReleaseStart(entry) {
  const start = entry?.releaseStart;
  if (!start || start.kind === GROUP_RELEASE_START_KIND.CURRENT_POSE) return null;
  return start;
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
  if (!target || node?.parent !== layer) return false;
  const current = readNodeVisualCenter(layer, node);
  if (!current) return false;
  node.position.set(
    node.position.x + target.x - current.x,
    node.position.y + target.y - current.y
  );
  return true;
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
    ? group.releasePlan?.entries?.find((candidate) => candidate?.id === entry.item?.id)
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
    scaleMultiplier: Math.max(0.01, Number(visualSpec.iconSize) || 64) /
      Math.max(0.01, releaseVisualSpec.iconSize),
    visualSpec: releaseVisualSpec,
  };
}

function setNodeVisualState(node, entry, state, group, visualSpec, resolveFolderNode) {
  node.stageRect = state.stageRect;
  const releaseOwnsVisual = isGroupReleasePhase(group.phase);
  const releaseVisual = resolveEntryReleaseVisual(
    entry,
    state,
    group,
    visualSpec,
    resolveFolderNode
  );
  const releaseVisualSpec = releaseVisual.visualSpec;
  const visualStateKey = makeVisualStateKey(entry, state, group, releaseVisualSpec);
  if (node.groupDragVisualStateKey !== visualStateKey) {
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
      cellHeight: releaseVisualSpec.cellHeight,
      cellWidth: releaseVisualSpec.cellWidth,
      compact: releaseVisualSpec.compact,
      draggable: false,
      dragging: false,
      dropTarget: false,
      editing: false,
      folderHoverState: releaseOwnsVisual ? null : (state.dragFolderHoverState || null),
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: Boolean(entry.item.customIconPath || entry.item.customIconDataUrl),
      iconSize: releaseVisualSpec.iconSize,
      interactive: false,
      item: entry.item,
      launchTargetStatus: state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[entry.item.id] || null
        : null,
      opening: false,
      preserveNodeScale: true,
      removable: false,
      focused: false,
      singleLineLabel: releaseVisualSpec.singleLineLabel,
      source: group.totalCount === 1
        ? group.source || entry.source || { type: "group-drag" }
        : entry.source || { type: "group-drag" },
      stageHeight: state.height,
      stageWidth: state.width,
      textless: releaseVisualSpec.textless,
      folderPreviewRelease: releaseVisualSpec.folderPreviewRelease === true,
    });
    node.groupDragVisualStateKey = visualStateKey;
  }
  const previousScaleMultiplier = Math.max(
    0.01,
    Number(node.groupDragReleaseScaleMultiplier) || 1
  );
  const nextScaleMultiplier = Math.max(0.01, Number(releaseVisual.scaleMultiplier) || 1);
  if (Math.abs(previousScaleMultiplier - nextScaleMultiplier) > 0.0001) {
    const ratio = nextScaleMultiplier / previousScaleMultiplier;
    node.scale.set(
      Math.max(0.01, Number(node.scale.x) || 1) * ratio,
      Math.max(0.01, Number(node.scale.y) || 1) * ratio
    );
  }
  node.groupDragReleaseScaleMultiplier = nextScaleMultiplier;
  node.eventMode = "none";
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
    this.badgeText = new Text({
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
    this.nodes = [];
    this.entryBadges = [];
    this.activeKey = null;
    this.activeEntryIds = new Set();
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
    this.resolvePointTarget = options.resolvePointTarget || (() => null);
    this.onReleaseSettled = options.onReleaseSettled || (() => {});
    this.onReleaseAborted = options.onReleaseAborted || (() => {});
    this.onPrewarmRequest = options.onPrewarmRequest || (() => {});
    // GroupReleaseController composes this hook with its own release-frame
    // resolver. The clock tween below keeps the renderer alive after the
    // physical pointer stops, so followers can consume the rest of the trail.
    this.onRender = () => this.renderFollowerFrame();
    this.releaseController = new GroupReleaseController(this, {
      onEntryAbort: (payload) => this.onReleaseAborted(payload),
      onEntryComplete: (payload) => this.onReleaseSettled(payload),
      resolveFolderNode: (payload) => this.resolveFolderNode(payload),
      resolvePointTarget: (payload) => this.resolvePointTarget(payload),
    });
    this.addChild(this.badge);
    this.visible = false;
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
      if (!node?.visible || node.parent !== this) continue;
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

  acquireNode(index) {
    while (this.nodes.length <= index) {
      const node = new IconNode({ onAction: () => {} });
      node.eventMode = "none";
      const badge = new Container();
      badge.eventMode = "none";
      badge.zIndex = 2000;
      const background = new Graphics();
      const text = new Text({
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

  clear() {
    this.releaseController?.clear?.("group-drag-clear");
    this.clearFollowerClock("group-drag-clear");
    this.activeKey = null;
    this.activeEntryIds.clear();
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
    const isReleasePhase = GROUP_RELEASE_PHASES.has(group.phase);
    if (isReleasePhase && this.nodes.length < entries.length) {
      this.activeKey = group.key;
      this.phase = group.phase;
      this.visible = true;
      this.badge.visible = false;
      this.prewarmTargetCount = entries.length;
      this.clearFollowerClock("group-release-pool-prewarm");
      this.prewarmReleaseNodes();
      return;
    }
    const isNewGroup = this.activeKey !== group.key;
    const previousEntryIds = isNewGroup ? new Set() : this.activeEntryIds;
    this.activeKey = group.key;
    this.phase = group.phase;
    this.prewarmTargetCount = GROUP_INTERACTIVE_PHASES.has(group.phase) || group.phase === "committing"
      ? Math.max(0, Math.floor(Number(group.releaseVisualCount) || 0))
      : 0;
    this.visible = true;

    const visualSpec = resolveVisualSpec(group, state);
    // Release-lane cancellation can restore the previous motion's final
    // scale.  Synchronize the plan before pooled nodes receive their new
    // release visual state so that cancellation cannot overwrite this frame.
    this.releaseController.preparePlan?.(group.releasePlan?.key || null);
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
    const nextEntryIds = new Set();
    const releaseNodes = new Map();
    const releasePlan = group.releasePlan;
    const releaseState = {
      ...state,
      groupState: group,
      visualOffsetY,
      visualSpec,
    };
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const entryId = entry.item.id;
      const isNewEntry = !previousEntryIds.has(entryId);
      const releaseStart = isReleasePhase ? getReleaseStart(entry) : null;
      const releaseStartPoint = releaseStart?.point || entry.origin;
      nextEntryIds.add(entryId);
      const node = this.acquireNode(index);
      const releaseSourceCenter = isReleasePhase && node.parent === this
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
        this.resolveFolderNode
      );
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
        if (group.phase === "committing") {
          node.alpha = 1;
          continue;
        }
        if (isReleasePhase) {
          // The release controller owns the first accepted/rejected/cancelling frame.
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

      if (group.phase === "dragging" || group.phase === "gathering") {
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
    this.activeEntryIds = nextEntryIds;
    this.updateBadge(group, pointerCenter, state, visualSpec);
    if (releasePlan) {
      this.releaseController.update({
        ...releaseState,
        group: { ...group, releasePlan },
        nodes: releaseNodes,
      });
    } else {
      this.releaseController.clear("group-release-plan-cleared");
    }
  }

  updateBadge(group, pointerCenter, state, visualSpec) {
    this.badge.visible = group.totalCount > 1 && GROUP_INTERACTIVE_PHASES.has(group.phase);
    if (!this.badge.visible) return;
    const iconSize = visualSpec?.iconSize || state.iconSize;
    const text = ["rejected", "cancelling"].includes(group.phase)
      ? `× ${group.totalCount}`
      : String(group.totalCount);
    const color = group.dropStatus === "rejected"
      ? 0xe34d59
      : group.dropStatus === "cancelled"
        ? 0x64748b
        : group.dropStatus === "accepted"
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
