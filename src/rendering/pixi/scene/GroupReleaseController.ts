import { Graphics } from "pixi.js";
import type { Container, PointData } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import type { MotionControl, MotionNumericValues } from "../animation/motionTween.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StagePoint, StageRect } from "../geometry/stageCoordinates.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getAppFolderCreateTargetPadding } from "../nodes/iconFolderHoverState.js";
import { drawFolderThumbFrame } from "../nodes/folderThumbDrawing.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { GROUP_TRANSFER_RUNTIME_MODE } from "./groupTransferRuntimeAdapter.js";
import type { GroupTransferRuntimeMode } from "./groupTransferRuntimeAdapter.js";
import { GROUP_TRANSFER_PHASE } from "../../../domain/groupTransferSession.js";
import type { GroupTransferPhase } from "../../../domain/groupTransferSession.js";
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
import type {
  FolderRelease,
  FolderReleaseActorNode,
  FolderReleaseItem,
  FolderReleaseMode,
  FolderReleasePreparePayload,
  FolderReleaseTargetNode,
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

export type GroupReleasePointPose = Readonly<{
  point: StagePoint;
  scale: StagePoint;
}>;

type GroupReleasePointResolution = Readonly<{
  point: StagePoint | null;
  scale: StagePoint | null;
}>;

export type GroupReleaseAlphaPolicy = Readonly<{
  kind?: string | undefined;
  to?: number | undefined;
}>;

export type GroupReleaseTarget = Readonly<{
  area?: string;
  expectedChildId?: string | null;
  folderId?: string | null;
  id?: string | null;
  index?: number | null;
  kind?: string;
  slotIndex?: number | null;
}>;

export type GroupReleaseEntry = Readonly<{
  actorKey?: string | undefined;
  alphaPolicy?: GroupReleaseAlphaPolicy | undefined;
  delayMs?: number | undefined;
  fallback?: PointData | null | undefined;
  id: string;
  item?: FolderReleaseItem | undefined;
  memberIds?: readonly string[] | undefined;
  mode: GroupTransferRuntimeMode;
  originAlpha?: number | undefined;
  origin?: PointData | null | undefined;
  originScale?: number | undefined;
  startAlpha?: number | null | undefined;
  target?: GroupReleaseTarget | undefined;
  velocity?: PointData | null | undefined;
}>;

export type GroupReleaseShellActor = Readonly<{
  endAnchor?: Readonly<{
    folderId?: string | null | undefined;
    kind?: string | undefined;
  }> | undefined;
  key?: string | undefined;
  role?: string | undefined;
  zBand?: number | undefined;
}>;

export type GroupReleasePlan = Readonly<{
  entries?: readonly GroupReleaseEntry[] | undefined;
  key?: string | null | undefined;
  shellActors?: readonly GroupReleaseShellActor[] | undefined;
  status?: string | undefined;
}>;

export type GroupReleaseGroup = Readonly<{
  key?: string | undefined;
  phase?: GroupTransferPhase | undefined;
  reducedMotion?: boolean | undefined;
  runtimePlan?: GroupReleasePlan | null | undefined;
  settledActorKeys?: readonly string[] | undefined;
}>;

export type GroupReleaseVisualSpec = Readonly<{
  iconSize?: number | undefined;
  textless?: boolean | undefined;
}>;

export type GroupReleaseActorNode = FolderReleaseActorNode & {
  iconSize?: number;
  visualWrap?: Container;
};

export type GroupReleaseFolderNode = FolderReleaseTargetNode & {
  getFolderThumbBounds?: (
    stageRect: StageRect | null | undefined,
  ) => StageRect | null;
};

export type GroupReleaseUpdateOptions = Readonly<{
  deviceResolution?: number;
  group?: GroupReleaseGroup | null;
  height?: number;
  iconSize?: number;
  nodes?: Map<string, GroupReleaseActorNode>;
  stageRect?: StageRect;
  visualOffsetY?: number;
  visualSpec?: GroupReleaseVisualSpec;
  width?: number;
}>;

export type GroupReleaseResolverPayload = Readonly<{
  entry: GroupReleaseEntry;
  group: GroupReleaseGroup;
  node?: GroupReleaseActorNode;
  state: GroupReleaseUpdateOptions;
  target: GroupReleaseTarget;
}>;

export type GroupReleaseContext = {
  entry: GroupReleaseEntry;
  group: GroupReleaseGroup;
  node: GroupReleaseActorNode | undefined;
  plan: GroupReleasePlan;
  release?: FolderRelease | undefined;
  state: GroupReleaseUpdateOptions;
};

export type GroupReleaseSettlementPayload = Readonly<{
  actorKey: string | null;
  entryId: string | null;
  id: string | null;
  memberIds: readonly string[];
  node: GroupReleaseActorNode | null;
  outcome: "aborted" | "settled";
  planKey: string | null;
  reason: string | null;
  release: FolderRelease | null;
  runtimePlan: GroupReleasePlan | null;
}>;

export type GroupReleaseFolderShellPayload = Readonly<{
  actorKey: string;
  folderId: string | null;
  planKey: string | null;
}>;

export type GroupReleasePrepareFolderVisualPayload = FolderReleasePreparePayload & Readonly<{
  context: GroupReleaseContext | undefined;
}>;

export type GroupReleaseControllerOptions = Readonly<{
  installRenderHook?: boolean | undefined;
  onEntryAbort?: ((payload: GroupReleaseSettlementPayload) => void) | undefined;
  onEntryComplete?: ((payload: GroupReleaseSettlementPayload) => void) | undefined;
  onFolderShellComplete?: ((payload: GroupReleaseFolderShellPayload) => void) | undefined;
  onRenderRequest?: ((reason: string) => void) | undefined;
  prepareFolderSlotVisual?: ((payload: GroupReleasePrepareFolderVisualPayload) => boolean) | undefined;
  resolveFolderNode?: ((payload: GroupReleaseResolverPayload) => GroupReleaseFolderNode | null) | undefined;
  resolvePointTarget?: ((payload: GroupReleaseResolverPayload) => GroupReleasePointResolution | null) | undefined;
}>;

type GroupReleaseSourceMetrics = Readonly<{
  sourceIconSize: number;
  sourceSize: number;
}>;

export type GroupReleaseFolderLane = {
  completionScheduled: boolean;
  control?: undefined;
  context?: GroupReleaseContext | undefined;
  controller: FolderReleaseController | null;
  key: string;
  kind: "folder";
  node?: GroupReleaseActorNode | undefined;
  settled: boolean;
  sourceMetrics?: GroupReleaseSourceMetrics | undefined;
};

export type GroupReleasePointLane = {
  alignedRenderFrames: number;
  alignmentFrameRequested: boolean;
  completionScheduled: boolean;
  context?: GroupReleaseContext | undefined;
  control: MotionControl | null;
  controller?: undefined;
  generation: number;
  key: string;
  kind: "point";
  missingRenderFrames: number;
  motionSettled: boolean;
  node?: GroupReleaseActorNode | undefined;
  settled: boolean;
  target: GroupReleasePointPose | null;
  targetKey: string | null;
};

export type GroupReleaseLane = GroupReleaseFolderLane | GroupReleasePointLane;

type FolderShellTarget = Readonly<{
  center: StagePoint;
  scale: number;
  size: number;
}>;

type FolderShellMotionTarget = Readonly<{
  center: StagePoint;
  scale: number;
}>;

type FolderShellFrameContext = Readonly<{
  context: GroupReleaseContext;
  plan: GroupReleasePlan;
  shellActor: GroupReleaseShellActor;
  state: GroupReleaseUpdateOptions;
}>;

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(
  value: Partial<PointData> | null | undefined,
  fallback: PointData = { x: 0, y: 0 },
): StagePoint {
  return {
    x: finite(value?.x, finite(fallback.x)),
    y: finite(value?.y, finite(fallback.y)),
  };
}

function scale(
  value: Partial<PointData> | null | undefined,
  fallback: PointData = { x: 1, y: 1 },
): StagePoint {
  return {
    x: Math.max(0.01, finite(value?.x, finite(fallback?.x, 1))),
    y: Math.max(0.01, finite(value?.y, finite(fallback?.y, 1))),
  };
}

function pointPosesEqual(
  left: GroupReleasePointPose | null | undefined,
  right: GroupReleasePointPose | null | undefined,
): boolean {
  return Boolean(left && right) &&
    Math.abs(finite(left!.point?.x) - finite(right!.point?.x)) <= TARGET_RETARGET_EPSILON &&
    Math.abs(finite(left!.point?.y) - finite(right!.point?.y)) <= TARGET_RETARGET_EPSILON &&
    Math.abs(finite(left!.scale?.x, 1) - finite(right!.scale?.x, 1)) <= TARGET_SCALE_RETARGET_EPSILON &&
    Math.abs(finite(left!.scale?.y, 1) - finite(right!.scale?.y, 1)) <= TARGET_SCALE_RETARGET_EPSILON;
}

function makeTargetKey(target: GroupReleasePointPose | null | undefined): string {
  if (!target) return "missing";
  return [
    Math.round(finite(target.point?.x) * 2) / 2,
    Math.round(finite(target.point?.y) * 2) / 2,
    Math.round(finite(target.scale?.x, 1) * 1000) / 1000,
    Math.round(finite(target.scale?.y, 1) * 1000) / 1000,
  ].join(":");
}

function getPointDeviceScale(state: GroupReleaseUpdateOptions = {}): StagePoint {
  const stageRect: Partial<StageRect> = state.stageRect || {};
  const resolution = Math.max(0.01, finite(state.deviceResolution, 1));
  const width = Math.max(0.01, finite(state.width, finite(stageRect.width, 1)));
  const height = Math.max(0.01, finite(state.height, finite(stageRect.height, 1)));
  return {
    x: resolution * Math.max(0.01, finite(stageRect.width, width) / width),
    y: resolution * Math.max(0.01, finite(stageRect.height, height) / height),
  };
}

function isFolderMode(mode: unknown): boolean {
  return mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_PREVIEW_SLOT ||
    mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_CENTER_ABSORB ||
    mode === GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER;
}

function toLayerFallback(
  entry: Readonly<{ fallback?: PointData | null | undefined }>,
  state: GroupReleaseUpdateOptions,
): StagePoint | null {
  const stagePoint = clientPointToStageVisualPoint(entry?.fallback, state?.stageRect);
  if (!stagePoint) return null;
  return {
    x: stagePoint.x,
    y: stagePoint.y - finite(state?.visualOffsetY, getIconVisualOffsetY(state?.visualSpec?.textless === true)),
  };
}

function toStageVelocity(
  velocity: Partial<PointData> | null | undefined,
  state: GroupReleaseUpdateOptions,
): StagePoint {
  const stageRect: Partial<StageRect> = state?.stageRect || {};
  const width = Math.max(0.0001, finite(state?.width, stageRect.width || 1));
  const height = Math.max(0.0001, finite(state?.height, stageRect.height || 1));
  const scaleX = Math.max(0.0001, finite(stageRect.width, width) / width);
  const scaleY = Math.max(0.0001, finite(stageRect.height, height) / height);
  return {
    x: finite(velocity?.x) / scaleX,
    y: finite(velocity?.y) / scaleY,
  };
}

function readNodeCenterInLayer(
  layer: Container | null | undefined,
  node: GroupReleaseActorNode | null | undefined,
): StagePoint | null {
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

function readFolderShellTarget(
  layer: Container,
  folderNode: GroupReleaseFolderNode | null | undefined,
  state: GroupReleaseUpdateOptions,
  fallback: PointData | null | undefined,
): FolderShellTarget | null {
  if (!folderNode || folderNode.destroyed) return null;
  const baseSize = Math.max(
    1,
    finite(folderNode.iconSize, finite(state.visualSpec?.iconSize, finite(state.iconSize, 64)))
  );
  const clientRect = folderNode.getFolderThumbBounds?.(state.stageRect);
  const stageRect = clientRectToStageVisualRect(clientRect, state.stageRect || ({} as StageOrigin));
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

function readFolderShellSource(
  layer: Container,
  node: GroupReleaseActorNode | null | undefined,
  entry: GroupReleaseEntry,
  state: GroupReleaseUpdateOptions,
  targetSize: number,
  release: FolderRelease | null = null,
): Readonly<{ center: StagePoint; scale: number }> | null {
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

function readReleaseSourceMetrics(
  node: GroupReleaseActorNode,
  state: GroupReleaseUpdateOptions,
): GroupReleaseSourceMetrics {
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

function frameTargetEqual(
  left: FolderShellMotionTarget | null | undefined,
  right: FolderShellMotionTarget | null | undefined,
): boolean {
  return Boolean(left && right) &&
    Math.abs(finite(left!.center?.x) - finite(right!.center?.x)) <= FOLDER_SHELL_RETARGET_EPSILON &&
    Math.abs(finite(left!.center?.y) - finite(right!.center?.y)) <= FOLDER_SHELL_RETARGET_EPSILON &&
    Math.abs(finite(left!.scale) - finite(right!.scale)) <= 0.005;
}

function normalizeMode(mode: GroupTransferRuntimeMode): FolderReleaseMode {
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
  declare layer: Container | null;
  declare readonly resolveFolderNode: (payload: GroupReleaseResolverPayload) => GroupReleaseFolderNode | null;
  declare readonly resolvePointTarget: (payload: GroupReleaseResolverPayload) => GroupReleasePointResolution | null;
  declare readonly onEntryComplete: (payload: GroupReleaseSettlementPayload) => void;
  declare readonly onEntryAbort: (payload: GroupReleaseSettlementPayload) => void;
  declare readonly onFolderShellComplete: (payload: GroupReleaseFolderShellPayload) => void;
  declare readonly onRenderRequest: (reason: string) => void;
  declare readonly prepareFolderSlotVisual: (payload: GroupReleasePrepareFolderVisualPayload) => boolean;
  declare folderShellFrame: Graphics | null;
  declare folderShellFrameKey: string | null;
  declare folderShellFrameMotion: MotionControl | null;
  declare folderShellFrameTarget: FolderShellMotionTarget | null;
  declare folderShellFrameContext: FolderShellFrameContext | null;
  declare folderShellFrameSize: number | null;
  declare folderShellCompletionKey: string | null;
  declare readonly lanes: Map<string, GroupReleaseLane>;
  declare planKey: string | null;
  declare previousOnRender: Container["onRender"];
  declare readonly didInstallRenderHook: boolean;
  declare renderHook: Container["onRender"];

  constructor(
    layer: Container,
    options?: GroupReleaseControllerOptions,
  );
  constructor(
    layer: Container | null | undefined,
    options: GroupReleaseControllerOptions = {},
  ) {
    if (!layer) throw new Error("GroupReleaseController requires a release layer");
    this.layer = layer;
    this.resolveFolderNode = options.resolveFolderNode || (() => null);
    this.resolvePointTarget = options.resolvePointTarget || (() => null);
    this.onEntryComplete = options.onEntryComplete || (() => {});
    this.onEntryAbort = options.onEntryAbort || (() => {});
    this.onFolderShellComplete = options.onFolderShellComplete || (() => {});
    this.onRenderRequest = options.onRenderRequest || (() => {});
    this.prepareFolderSlotVisual = options.prepareFolderSlotVisual || (() => false);
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
      this.previousOnRender?.call(this.layer!, renderer);
      this.renderFrame();
    };
    if (this.didInstallRenderHook) this.layer.onRender = this.renderHook;
  }

  update(options: GroupReleaseUpdateOptions = {}): void {
    const group = options.group;
    const plan = group?.runtimePlan;
    if (!group || !plan?.key || !Array.isArray(plan.entries) || !plan.entries.length ||
      !([GROUP_TRANSFER_PHASE.RELEASING, GROUP_TRANSFER_PHASE.RETURNING] as readonly unknown[]).includes(group.phase)) {
      this.clear("group-release-inactive");
      return;
    }

    this.preparePlan(plan.key);

    const nodes = options.nodes instanceof Map ? options.nodes : new Map<string, GroupReleaseActorNode>();
    const settledActorKeys = new Set<string | undefined>(group!.settledActorKeys || []);
    const seen = new Set<string>();
    const createdContexts: GroupReleaseContext[] = [];
    for (const entry of plan.entries) {
      if (!entry?.id) continue;
      if (entry.actorKey && settledActorKeys.has(entry.actorKey)) continue;
      const node = nodes.get(entry.id);
      const laneKey = `${plan.key}:${entry.id}`;
      seen.add(laneKey);
      const existing = this.lanes.get(laneKey);
      const context: GroupReleaseContext = {
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
  preparePlan(nextPlanKey: string | null = null): void {
    const key = nextPlanKey || null;
    if (this.planKey === key) return;
    this.clear("group-release-replace");
    this.planKey = key;
  }

  ownsActorNode(node: GroupReleaseActorNode | null | undefined): boolean {
    if (!node || node.destroyed) return false;
    for (const lane of this.lanes.values()) {
      if (lane.kind === "folder" && lane.controller?.ownsActorNode(node)) return true;
    }
    return false;
  }

  updateFolderShellActor(
    shellActor: GroupReleaseShellActor,
    contexts: readonly GroupReleaseContext[],
    state: GroupReleaseUpdateOptions,
    plan: GroupReleasePlan,
  ): void {
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
      ...(context.node ? { node: context.node } : {}),
      state,
      target,
    });
    const folderTarget = readFolderShellTarget(
      this.layer!,
      targetFolderNode,
      state,
      entry.fallback
    ) || {
      center: toLayerFallback(entry, state) || { x: 0, y: 0 },
      scale: 1,
      size: Math.max(1, finite(state.visualSpec?.iconSize, finite(state.iconSize, 64))),
    };
    const source = readFolderShellSource(
      this.layer!,
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
      this.folderShellFrame!.zIndex = Number(shellActor.zBand) || 100;
      drawFolderThumbFrame(
        this.folderShellFrame!,
        folderTarget.size,
        getFolderThumbMetrics(folderTarget.size),
        0
      );
      this.folderShellFrame!.position.set(source.center.x, source.center.y);
      this.folderShellFrame!.scale.set(source.scale);
      this.folderShellFrame!.alpha = 1;
      this.folderShellFrame!.visible = true;
    } else {
      if (Math.abs(finite(this.folderShellFrameSize, 0) - folderTarget.size) > 0.01) {
        this.folderShellFrameSize = folderTarget.size;
        drawFolderThumbFrame(
          this.folderShellFrame!,
          folderTarget.size,
          getFolderThumbMetrics(folderTarget.size),
          0
        );
      }
      this.folderShellFrame!.visible = true;
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
        motion(this.folderShellFrame!)
          .duration(context.group?.reducedMotion ? 0 : FOLDER_SHELL_DURATION)
          .ease("power3.out")
          .handoff()
          .interrupt("retarget")
          .to({ x: nextTarget.center.x, y: nextTarget.center.y }),
        motion(this.folderShellFrame!.scale)
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

  completeFolderShellActor(frameKey: string): void {
    if (!frameKey || this.folderShellFrameKey !== frameKey || this.folderShellCompletionKey === frameKey) return;
    this.folderShellCompletionKey = frameKey;
    motionRuntime.afterFrame(() => {
      if (this.folderShellFrameKey !== frameKey || this.folderShellCompletionKey !== frameKey) return;
      const saved = this.folderShellFrameContext;
      const actorKey = saved?.shellActor?.key || null;
      if (!actorKey) return;
      this.onFolderShellComplete({
        actorKey,
        folderId: saved!.shellActor?.endAnchor?.folderId || saved!.context?.entry?.target?.folderId || null,
        planKey: saved!.plan?.key || this.planKey,
      });
    });
  }

  clearFolderShellActor(reason = "group-transfer-folder-shell-clear"): void {
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

  hideFolderShellActors(): void {
    this.clearFolderShellActor("group-transfer-folder-shell-handoff");
  }

  updateFolderLane(
    laneKey: string,
    existing: GroupReleaseLane | null | undefined,
    context: GroupReleaseContext,
  ): void {
    if (existing?.kind === "point") {
      this.clearLane(existing, "group-release-mode-change");
      existing = null;
    }
    const entry = context.entry;
    const target = entry.target || {};
    const expectedChildId = target.expectedChildId || entry.id;
    let lane = existing as GroupReleaseFolderLane | null | undefined;
    if (!lane) {
      lane = {
        controller: null,
        kind: "folder",
        key: laneKey,
        completionScheduled: false,
        settled: false,
      };
      lane.controller = new FolderReleaseController(this.layer!, {
        installRenderHook: false,
        onReleaseAbort: (release, reason) => this.settleLane(lane!, "aborted", release, reason),
        onReleaseComplete: (release) => this.settleLane(lane!, "settled", release),
        onPrepareTargetVisual: (payload) => this.prepareFolderSlotVisual({
          ...payload,
          context: lane!.context,
        }),
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
    if (!lane.sourceMetrics || !lane.controller!.active?.started) {
      lane.sourceMetrics = readReleaseSourceMetrics(context.node, context.state);
    }
    const targetVisualIconSize = isFolderSlotReleaseMode(entry.mode)
      ? getFolderSlotReleaseIconSize(
        targetFolderNode?.iconSize || context.state.iconSize || context.state.visualSpec?.iconSize
      )
      : Math.max(1, finite(context.state.visualSpec?.iconSize, context.state.iconSize || 64));
    const releaseIconSize = Math.max(
      1,
      finite(context.node?.iconSize, finite(context.state.visualSpec?.iconSize, context.state.iconSize || 64))
    );
    const release: FolderRelease = {
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
      targetVisualIconSize,
      targetFolderId: target.folderId || null,
      targetPreviewSlotIndex: Number.isFinite(Number(target.slotIndex)) ? Number(target.slotIndex) : null,
      velocity: point(entry.velocity),
    };
    context.release = release;
    const releaseState = context.state;
    lane.controller!.update({
      ...(releaseState.deviceResolution === undefined
        ? {}
        : { deviceResolution: releaseState.deviceResolution }),
      group: context.group.reducedMotion === undefined
        ? {}
        : { reducedMotion: context.group.reducedMotion },
      ...(releaseState.height === undefined ? {} : { height: releaseState.height }),
      previewNode: context.node,
      release,
      ...(releaseState.stageRect === undefined ? {} : { stageRect: releaseState.stageRect }),
      targetFolderNode,
      ...(releaseState.width === undefined ? {} : { width: releaseState.width }),
    });
  }

  updatePointLane(
    laneKey: string,
    existing: GroupReleaseLane | null | undefined,
    context: GroupReleaseContext,
  ): void {
    if (existing?.kind === "folder") {
      this.clearLane(existing, "group-release-mode-change");
      existing = null;
    }
    let lane = existing as GroupReleasePointLane | null | undefined;
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

  readPointTarget(context: GroupReleaseContext): GroupReleasePointPose | null {
    const resolved = this.resolvePointTarget({
      entry: context.entry,
      group: context.group,
      ...(context.node ? { node: context.node } : {}),
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

  startPointMotion(lane: GroupReleasePointLane, target: GroupReleasePointPose): void {
    const context = lane.context!;
    const entry = context.entry;
    const group = context.group;
    const node = context.node!;
    const isReturn = entry.mode === GROUP_TRANSFER_RUNTIME_MODE.RETURN;
    const targetAlpha = entry.alphaPolicy?.kind === "fade-out"
      ? Math.max(0, finite(entry.alphaPolicy.to, 0))
      : isReturn
        ? Math.max(0, finite(entry.originAlpha, 1))
        : 1;
    const velocity: StagePoint & MotionNumericValues = isReturn || group.reducedMotion === true
      ? { x: 0, y: 0 }
      : toStageVelocity(entry.velocity, context.state) as StagePoint & MotionNumericValues;
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

  isPointLaneAligned(
    lane: GroupReleasePointLane,
    target: GroupReleasePointPose,
  ): boolean {
    const node = lane?.node;
    if (!node || node.destroyed || !target || !lane.motionSettled || !lane.control?.completed) return false;
    const deviceScale = getPointDeviceScale(lane.context?.state);
    return Math.abs(finite(node.position?.x) - finite(target.point?.x)) * deviceScale.x <= POINT_ALIGNMENT_DEVICE_EPSILON &&
      Math.abs(finite(node.position?.y) - finite(target.point?.y)) * deviceScale.y <= POINT_ALIGNMENT_DEVICE_EPSILON &&
      Math.abs(finite(node.scale?.x, 1) - finite(target.scale?.x, 1)) * deviceScale.x <= POINT_ALIGNMENT_DEVICE_EPSILON &&
      Math.abs(finite(node.scale?.y, 1) - finite(target.scale?.y, 1)) * deviceScale.y <= POINT_ALIGNMENT_DEVICE_EPSILON;
  }

  syncPointAlignment(
    lane: GroupReleasePointLane,
    target: GroupReleasePointPose,
  ): boolean {
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

  settleLane(
    lane: GroupReleaseLane | null | undefined,
    outcome: "aborted" | "settled",
    release: FolderRelease | null = null,
    reason: string | null = null,
  ): void {
    if (!lane || lane.completionScheduled || this.planKey == null) return;
    lane.completionScheduled = true;
    if (outcome !== "aborted" && lane.kind === "point") this.snapPointLane(lane);
    lane.settled = true;
    const context: Partial<GroupReleaseContext> = lane.context || {};
    const payload: GroupReleaseSettlementPayload = {
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

  snapPointLane(lane: GroupReleasePointLane): void {
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
    node.alpha = entry?.alphaPolicy?.kind === "fade-out"
      ? Math.max(0, finite(entry.alphaPolicy.to, 0))
      : isReturn
        ? Math.max(0, finite(entry?.originAlpha, 1))
        : 1;
    if (node.labelText && !isReturn) {
      node.labelText.alpha = 1;
      node.labelText.scale.set(1);
    }
  }

  renderFrame(): void {
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

  clearLane(lane: GroupReleaseLane | null | undefined, reason: string): void {
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

  clear(reason = "group-release-clear"): void {
    for (const lane of this.lanes.values()) this.clearLane(lane, reason);
    this.lanes.clear();
    this.clearFolderShellActor(reason);
    this.planKey = null;
  }

  destroy(): void {
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
