import { Container, Matrix } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import type { MotionControl, MotionNumericValues } from "../animation/motionTween.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect, getStageScale } from "../geometry/stageCoordinates.js";
import type { StagePoint, StageRect } from "../geometry/stageCoordinates.js";

export const FOLDER_PREVIEW_SLOT_RELEASE_MODE = "folder-preview-slot";
export const FOLDER_CENTER_ABSORB_RELEASE_MODE = "folder-center-absorb";
export const CREATED_FOLDER_RELEASE_MODE = "created-folder";

const CLEAR_REASON = "folder-release-clear";
const DESTROY_REASON = "destroyed";
const CENTER_ABSORB_DURATION = 0.24;
const CENTER_ABSORB_FADE_DELAY = 0.1;
const CENTER_ABSORB_FADE_DURATION = 0.14;
const RELEASE_REVEAL_DURATION = 0.1;
const TARGET_VISUAL_PREPARE_PROGRESS = 0.55;
const TARGET_CENTER_DEVICE_EPSILON = 0.5;
const TARGET_SIZE_DEVICE_EPSILON = 0.5;
const TARGET_ROTATION_EPSILON = Math.PI / 360;
const ALIGNED_RENDER_FRAMES_BEFORE_COMPLETE = 2;
const MAX_INITIAL_MISSING_TARGET_FRAMES = 2;

export type FolderReleaseMode =
  | typeof FOLDER_PREVIEW_SLOT_RELEASE_MODE
  | typeof FOLDER_CENTER_ABSORB_RELEASE_MODE
  | typeof CREATED_FOLDER_RELEASE_MODE;

export interface FolderReleaseMatrixBasis {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface FolderReleaseTargetPose {
  center: StagePoint;
  matrix: FolderReleaseMatrixBasis;
  targetChildId?: string | null;
}

export interface FolderReleaseCenterPose {
  center: StagePoint;
}

export interface FolderReleasePreviewPoseOptions {
  expectedChildId?: string | undefined;
  previewIconSize?: number;
}

export type FolderReleaseItem = Readonly<{
  id: string;
  type?: string | undefined;
}> & Readonly<Record<string, unknown>>;

export type FolderReleaseActorNode = Container & {
  clearFolderSlotReleaseVisual?: (reason?: string) => void;
  commitFolderSlotReleaseVisual?: () => boolean;
  folderSlotReleaseVisual?: Container | null;
  labelText: Container;
  state?: Readonly<{ textless?: boolean }> | null;
  textless?: boolean;
  visualWrap?: Container | null;
};

export type FolderReleaseTargetNode = Container & {
  getFolderCenterReleasePose?: (
    relativeTo: Container | null,
  ) => FolderReleaseCenterPose | null;
  getFolderPreviewChildBounds?: (
    stageRect: StageRect | null | undefined,
    slotIndex: number,
  ) => StageRect | null;
  getFolderPreviewChildReleasePose?: (
    relativeTo: Container | null,
    slotIndex: number,
    options?: FolderReleasePreviewPoseOptions,
  ) => FolderReleaseTargetPose | null;
  iconSize?: number;
  item?: FolderReleaseItem | null;
};

export type FolderRelease = Readonly<{
  delayMs?: number | null;
  item?: FolderReleaseItem | null;
  key: string;
  releaseMode: FolderReleaseMode;
  revealFromAlpha?: number | null;
  size?: Readonly<{ height?: number; width?: number }> | null;
  sourceIconSize?: number;
  sourceSize?: number;
  suppressFolderPreviewChildId?: string | null;
  suppressFolderPreviewFolderId?: string | null;
  targetFolderId?: string | null;
  targetPreviewSlotIndex?: number | null;
  targetVisualIconSize?: number;
  velocity?: StagePoint | null;
}>;

export type FolderReleaseUpdateOptions = Readonly<{
  deviceResolution?: number;
  group?: Readonly<{ reducedMotion?: boolean }> | null;
  height?: number;
  previewNode?: FolderReleaseActorNode | null;
  release?: FolderRelease | null;
  stageRect?: StageRect | null;
  targetFolderNode?: FolderReleaseTargetNode | null;
  width?: number;
}>;

export type FolderReleasePreparePayload = Readonly<{
  node: FolderReleaseActorNode;
  release: FolderRelease;
}>;

export type FolderReleaseControllerOptions = Readonly<{
  mapTargetPose?: (pose: FolderReleaseTargetPose) => FolderReleaseTargetPose;
  canComplete?: () => boolean;
  installRenderHook?: boolean;
  onPrepareTargetVisual?: (payload: FolderReleasePreparePayload) => boolean;
  onReleaseAbort?: (release: FolderRelease, reason: string) => void;
  onReleaseComplete?: (release: FolderRelease) => void;
}>;

interface FolderReleasePreviewFrame {
  center: StagePoint;
  inverseLocalVisualMatrix: FolderReleaseMatrixBasis;
  localVisualAnchor: StagePoint;
  localVisualMatrix: FolderReleaseMatrixBasis;
  rootMatrix: FolderReleaseMatrixBasis;
}

export interface FolderReleaseActive {
  alignedRenderFrames: number;
  alignmentFrameRequested: boolean;
  initialMissingTargetFrames: number;
  initialTargetCenter?: StagePoint;
  inverseLocalVisualMatrix?: FolderReleaseMatrixBasis;
  labelSuppressedNode: FolderReleaseActorNode | null;
  localVisualAnchor?: StagePoint;
  localVisualMatrix?: FolderReleaseMatrixBasis;
  motionSettled: boolean;
  previewNode: FolderReleaseActorNode;
  release: FolderRelease;
  startMatrix?: FolderReleaseMatrixBasis;
  started: boolean;
  state: FolderReleaseUpdateOptions;
  targetFolderNode: FolderReleaseTargetNode | null | undefined;
  targetMatrix: FolderReleaseMatrixBasis | null;
  targetVisualPrepared: boolean;
}

type StartedFolderReleaseActive = FolderReleaseActive & {
  initialTargetCenter: StagePoint;
  inverseLocalVisualMatrix: FolderReleaseMatrixBasis;
  localVisualAnchor: StagePoint;
  localVisualMatrix: FolderReleaseMatrixBasis;
  startMatrix: FolderReleaseMatrixBasis;
  started: true;
  targetMatrix: FolderReleaseMatrixBasis;
};

function readFinite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneMatrixBasis(
  matrix: Partial<FolderReleaseMatrixBasis> = {},
): FolderReleaseMatrixBasis {
  return {
    a: readFinite(matrix.a, 1),
    b: readFinite(matrix.b, 0),
    c: readFinite(matrix.c, 0),
    d: readFinite(matrix.d, 1),
  };
}

function readMatrixBasis(
  matrix: Partial<FolderReleaseMatrixBasis> = {},
): FolderReleaseMatrixBasis | null {
  const result = {
    a: Number(matrix.a),
    b: Number(matrix.b),
    c: Number(matrix.c),
    d: Number(matrix.d),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function interpolateMatrixBasis(
  from: FolderReleaseMatrixBasis,
  to: FolderReleaseMatrixBasis,
  progress: unknown,
): FolderReleaseMatrixBasis {
  const t = Math.max(0, Math.min(1, readFinite(progress, 0)));
  return {
    a: from.a + (to.a - from.a) * t,
    b: from.b + (to.b - from.b) * t,
    c: from.c + (to.c - from.c) * t,
    d: from.d + (to.d - from.d) * t,
  };
}

function multiplyMatrixBasis(
  left: FolderReleaseMatrixBasis,
  right: FolderReleaseMatrixBasis,
): FolderReleaseMatrixBasis {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
  };
}

function invertMatrixBasis(
  matrix: FolderReleaseMatrixBasis,
): FolderReleaseMatrixBasis | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.00000001) return null;
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
  };
}

function makeMatrix(basis: FolderReleaseMatrixBasis, x = 0, y = 0): Matrix {
  return new Matrix(basis.a, basis.b, basis.c, basis.d, x, y);
}

function readNodePose(
  relativeTo: Container | null | undefined,
  node: Container | null | undefined,
): Readonly<{ center: StagePoint; matrix: FolderReleaseMatrixBasis }> | null {
  if (!relativeTo || !node || node.destroyed) return null;
  const center = relativeTo.toLocal({ x: 0, y: 0 }, node);
  const xUnit = relativeTo.toLocal({ x: 1, y: 0 }, node);
  const yUnit = relativeTo.toLocal({ x: 0, y: 1 }, node);
  if (![center.x, center.y, xUnit.x, xUnit.y, yUnit.x, yUnit.y].every(Number.isFinite)) return null;
  return {
    center: { x: center.x, y: center.y },
    matrix: {
      a: xUnit.x - center.x,
      b: xUnit.y - center.y,
      c: yUnit.x - center.x,
      d: yUnit.y - center.y,
    },
  };
}

function readPreviewFrame(
  relativeTo: Container | null | undefined,
  previewNode: FolderReleaseActorNode | null | undefined,
): FolderReleasePreviewFrame | null {
  const rootPose = readNodePose(relativeTo, previewNode);
  if (!rootPose) return null;
  const visualNode = previewNode?.visualWrap && !previewNode.visualWrap.destroyed
    ? previewNode.visualWrap
    : previewNode;
  if (visualNode === previewNode) {
    return {
      center: rootPose.center,
      inverseLocalVisualMatrix: cloneMatrixBasis(),
      localVisualAnchor: { x: 0, y: 0 },
      localVisualMatrix: cloneMatrixBasis(),
      rootMatrix: rootPose.matrix,
    };
  }

  const visualPose = readNodePose(relativeTo, visualNode);
  const localVisualPose = readNodePose(previewNode, visualNode);
  if (!visualPose || !localVisualPose) return null;
  const inverseLocalVisualMatrix = invertMatrixBasis(localVisualPose.matrix);
  if (!inverseLocalVisualMatrix) return null;
  return {
    center: visualPose.center,
    inverseLocalVisualMatrix,
    localVisualAnchor: { ...localVisualPose.center },
    localVisualMatrix: cloneMatrixBasis(localVisualPose.matrix),
    rootMatrix: cloneMatrixBasis(rootPose.matrix),
  };
}

function basisAxisLengths(matrix: FolderReleaseMatrixBasis): StagePoint {
  return {
    x: Math.hypot(matrix.a, matrix.b),
    y: Math.hypot(matrix.c, matrix.d),
  };
}

function basisRotation(matrix: FolderReleaseMatrixBasis): number {
  return Math.atan2(matrix.b, matrix.a);
}

function shortestAngleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function getDeviceScales(state: FolderReleaseUpdateOptions = {}): StagePoint {
  const stageScale = getStageScale(
    state.stageRect,
    state.width as number,
    state.height as number,
  );
  const resolution = Math.max(0.01, readFinite(state.deviceResolution, 1));
  return {
    x: Math.max(0.0001, readFinite(stageScale.scaleX, 1)) * resolution,
    y: Math.max(0.0001, readFinite(stageScale.scaleY, 1)) * resolution,
  };
}

function getStageVelocity(
  release: FolderRelease,
  state: FolderReleaseUpdateOptions,
): StagePoint & MotionNumericValues {
  const stageScale = getStageScale(
    state.stageRect,
    state.width as number,
    state.height as number,
  );
  return {
    x: readFinite(release?.velocity?.x, 0) / Math.max(0.0001, readFinite(stageScale.scaleX, 1)),
    y: readFinite(release?.velocity?.y, 0) / Math.max(0.0001, readFinite(stageScale.scaleY, 1)),
  };
}

function getActiveMotionVelocity(target: object, prop: string): number {
  const channel = motionRuntime.getChannel(target, prop);
  const animation = Array.from(channel?.base?.values?.() || [])[0] || null;
  return readFinite(animation?.velocity, 0);
}

function resetContainerTransform(node: Container | null | undefined): void {
  if (!node || node.destroyed) return;
  node.position.set(0, 0);
  node.scale.set(1, 1);
  node.pivot.set(0, 0);
  node.skew.set(0, 0);
  node.rotation = 0;
}

function suppressCreatedFolderReleaseLabel(
  node: FolderReleaseActorNode | null | undefined,
  reason = "created-folder-release-label-hide",
): void {
  const label = node?.labelText;
  if (!label) return;
  killMotionOf(label, null, { reason });
  killMotionOf(label.scale, null, { reason });
  label.visible = false;
  // Visibility owns the release suppression. Keep renderable enabled so a
  // pooled IconNode can be reused by a normal labeled state without a stale
  // non-renderable flag surviving this handoff.
  label.renderable = true;
  label.alpha = 0;
  label.scale.set(1, 1);
}

function restoreCreatedFolderReleaseLabel(
  node: FolderReleaseActorNode | null | undefined,
  reason = "created-folder-release-label-restore",
): void {
  const label = node?.labelText;
  if (!label) return;
  killMotionOf(label, null, { reason });
  killMotionOf(label.scale, null, { reason });
  const textless = node.state?.textless === true || node.textless === true;
  label.visible = !textless;
  label.renderable = true;
  label.alpha = textless ? 0 : 1;
  label.scale.set(1, 1);
}

function isFolderReleaseMode(mode: unknown): mode is FolderReleaseMode {
  return mode === FOLDER_PREVIEW_SLOT_RELEASE_MODE ||
    mode === FOLDER_CENTER_ABSORB_RELEASE_MODE ||
    mode === CREATED_FOLDER_RELEASE_MODE;
}

function readCreatedFolderFallbackPose(
  active: FolderReleaseActive | null | undefined,
): FolderReleaseTargetPose | null {
  const targetFolderNode = active?.targetFolderNode;
  const release = active?.release;
  const state = active?.state || {};
  const slotIndex = Number.isFinite(Number(release?.targetPreviewSlotIndex))
    ? Number(release!.targetPreviewSlotIndex)
    : null;
  if (!targetFolderNode || slotIndex == null) return null;
  const clientRect = targetFolderNode.getFolderPreviewChildBounds?.(state.stageRect, slotIndex);
  const stageRect = clientRectToStageVisualRect(
    clientRect,
    (state.stageRect || {}) as StageRect,
  );
  if (!stageRect || stageRect.width <= 0 || stageRect.height <= 0) return null;
  const previewIconSize = Math.max(1, readFinite(release!.size?.width, 64));
  const matrix = {
    a: stageRect.width / previewIconSize,
    b: 0,
    c: 0,
    d: stageRect.height / previewIconSize,
  };
  if (!Object.values(matrix).every(Number.isFinite)) return null;
  return {
    center: {
      x: stageRect.left + stageRect.width / 2,
      y: stageRect.top + stageRect.height / 2,
    },
    matrix,
    targetChildId: release!.item?.id || null,
  };
}

export class FolderReleaseController {
  declare readonly mapTargetPose: (pose: FolderReleaseTargetPose) => FolderReleaseTargetPose;
  declare readonly canComplete: () => boolean;
  declare layer: Container | null;
  declare readonly onReleaseComplete: (release: FolderRelease) => void;
  declare readonly onReleaseAbort: (release: FolderRelease, reason: string) => void;
  declare readonly onPrepareTargetVisual: (payload: FolderReleasePreparePayload) => boolean;
  declare readonly targetFollower: Container;
  declare readonly targetCompensationFrame: Container;
  declare readonly approachFrame: Container;
  declare readonly poseFrame: Container;
  declare readonly poseProgress: { value: number };
  declare readonly centerTimelineProgress: { value: number };
  declare active: FolderReleaseActive | null;
  declare motionControl: MotionControl | null;
  declare completeKey: string | null;
  declare previousOnRender: Container["onRender"];
  declare readonly didInstallRenderHook: boolean;
  declare renderHook: Container["onRender"];

  constructor(
    layer: Container,
    options?: FolderReleaseControllerOptions,
  );
  constructor(
    layer: Container | null | undefined,
    options: FolderReleaseControllerOptions = {},
  ) {
    if (!layer) throw new Error("FolderReleaseController requires a release layer");
    this.layer = layer;
    this.mapTargetPose = options.mapTargetPose ?? (pose => pose);
    this.canComplete = options.canComplete ?? (() => true);
    this.onReleaseComplete = options.onReleaseComplete || (() => {});
    this.onReleaseAbort = options.onReleaseAbort || (() => {});
    this.onPrepareTargetVisual = options.onPrepareTargetVisual || (() => false);
    this.targetFollower = new Container({ label: "folder-release-target-follower" });
    this.targetCompensationFrame = new Container({ label: "folder-release-target-compensation-frame" });
    this.approachFrame = new Container({ label: "folder-release-approach-frame" });
    this.poseFrame = new Container({ label: "folder-release-pose-frame" });
    this.targetFollower.eventMode = "none";
    this.targetCompensationFrame.eventMode = "none";
    this.approachFrame.eventMode = "none";
    this.poseFrame.eventMode = "none";
    this.targetFollower.addChild(this.targetCompensationFrame);
    this.targetCompensationFrame.addChild(this.approachFrame);
    this.approachFrame.addChild(this.poseFrame);
    this.targetFollower.visible = false;
    this.layer.addChild(this.targetFollower);
    this.poseProgress = { value: 0 };
    this.centerTimelineProgress = { value: 0 };
    this.active = null;
    this.motionControl = null;
    this.completeKey = null;
    this.previousOnRender = this.layer.onRender;
    this.didInstallRenderHook = options.installRenderHook !== false;
    this.renderHook = (renderer) => {
      this.previousOnRender?.call(this.layer!, renderer);
      this.renderFrame();
    };
    if (this.didInstallRenderHook) this.layer.onRender = this.renderHook;
  }

  renderFrame(): void {
    this.syncFrame({ isRenderFrame: true });
  }

  ownsActorNode(node: Container | null | undefined): boolean {
    return Boolean(this.active?.started && this.active.previewNode === node);
  }

  getTargetPose(
    active: FolderReleaseActive | null = this.active,
  ): FolderReleaseTargetPose | null {
    const targetFolderNode = active?.targetFolderNode;
    const release = active?.release;
    if (!targetFolderNode || targetFolderNode.destroyed || targetFolderNode.item?.id !== release?.targetFolderId) return null;
    if (release!.releaseMode === FOLDER_CENTER_ABSORB_RELEASE_MODE) {
      const pose = targetFolderNode.getFolderCenterReleasePose?.(this.layer);
      const center = {
        x: readFinite(pose?.center?.x, Number.NaN),
        y: readFinite(pose?.center?.y, Number.NaN),
      };
      if (![center.x, center.y].every(Number.isFinite)) return null;
      const previewIconSize = Math.max(1, readFinite(release!.size?.width, 64));
      const folderIconSize = Math.max(1, readFinite(targetFolderNode.iconSize, 64));
      const targetScale = Math.max(
        0.06,
        Math.min(0.1, Math.max(4, folderIconSize * 0.18) / previewIconSize)
      );
      return {
        center,
        matrix: { a: targetScale, b: 0, c: 0, d: targetScale },
      };
    }
    const slotIndex = Number.isFinite(Number(release!.targetPreviewSlotIndex))
      ? Number(release!.targetPreviewSlotIndex)
      : null;
    const pose = slotIndex == null
      ? null
      : targetFolderNode.getFolderPreviewChildReleasePose?.(
        this.layer,
        slotIndex,
        {
          expectedChildId: release!.item?.id,
          previewIconSize: Math.max(1, readFinite(release!.size?.width, 64)),
        }
      );
    const fallbackPose = release!.releaseMode === CREATED_FOLDER_RELEASE_MODE
      ? readCreatedFolderFallbackPose(active)
      : null;
    const livePoseMatchesChild = pose?.center && pose?.matrix &&
      (!pose.targetChildId || pose.targetChildId === release!.item?.id);
    const resolvedPose = (livePoseMatchesChild ? pose : fallbackPose) as FolderReleaseTargetPose | null | undefined;
    if (!resolvedPose?.center || !resolvedPose?.matrix) return null;
    const center = {
      x: readFinite(resolvedPose.center.x, Number.NaN),
      y: readFinite(resolvedPose.center.y, Number.NaN),
    };
    const matrix = readMatrixBasis(resolvedPose.matrix);
    if (!matrix) return null;
    if (![center.x, center.y, matrix.a, matrix.b, matrix.c, matrix.d].every(Number.isFinite)) return null;
    if (resolvedPose.targetChildId && resolvedPose.targetChildId !== release!.item?.id) return null;
    return this.mapTargetPose({ ...resolvedPose, center, matrix });
  }

  update(options: FolderReleaseUpdateOptions = {}): boolean {
    const { previewNode, release, targetFolderNode } = options;
    if (!isFolderReleaseMode(release?.releaseMode) || !release?.key || !previewNode) {
      this.clear(CLEAR_REASON);
      return false;
    }

    // Release reparents the preview below this follower. Keep the preview's
    // former layer-level order on its new top-level owner.
    this.targetFollower.zIndex = previewNode.zIndex;

    const isNewRelease = this.active?.release?.key !== release.key;
    if (isNewRelease) {
      this.clear("folder-release-replace");
      this.completeKey = null;
      this.active = {
        alignedRenderFrames: 0,
        alignmentFrameRequested: false,
        initialMissingTargetFrames: 0,
        motionSettled: false,
        previewNode,
        release,
        started: false,
        state: options,
        targetFolderNode,
        targetMatrix: null,
        targetVisualPrepared: false,
        labelSuppressedNode: null,
      };
      motionRuntime.recordCoordinationEvent({
        action: "folder-release",
        event: "start",
        folderId: release.targetFolderId || null,
        itemId: release.item?.id || null,
        mode: release.releaseMode,
        releaseKey: release.key,
        slotIndex: release.targetPreviewSlotIndex ?? null,
      });
    } else {
      const targetNodeChanged = this.active!.targetFolderNode !== targetFolderNode;
      this.active!.previewNode = previewNode;
      this.active!.release = release;
      this.active!.state = options;
      if (targetNodeChanged && this.active!.started) {
        this.rebindTarget(targetFolderNode);
        return true;
      }
      this.active!.targetFolderNode = targetFolderNode;
    }

    if (
      release.releaseMode === CREATED_FOLDER_RELEASE_MODE &&
      this.active!.labelSuppressedNode !== previewNode
    ) {
      suppressCreatedFolderReleaseLabel(previewNode);
      this.active!.labelSuppressedNode = previewNode;
    }

    this.syncFrame();
    return true;
  }

  startRelease(targetPose: FolderReleaseTargetPose): void {
    const active = this.active;
    if (!active || active.started) return;
    const previewFrame = readPreviewFrame(this.layer, active.previewNode);
    if (!previewFrame) {
      this.abort("preview-pose-unavailable");
      return;
    }

    active.started = true;
    active.inverseLocalVisualMatrix = cloneMatrixBasis(previewFrame.inverseLocalVisualMatrix);
    active.localVisualAnchor = { ...previewFrame.localVisualAnchor };
    active.localVisualMatrix = cloneMatrixBasis(previewFrame.localVisualMatrix);
    active.startMatrix = cloneMatrixBasis(previewFrame.rootMatrix);
    active.targetMatrix = multiplyMatrixBasis(targetPose.matrix, active.inverseLocalVisualMatrix);
    active.initialTargetCenter = { ...targetPose.center };
    this.targetFollower.visible = true;
    this.targetFollower.position.set(targetPose.center.x, targetPose.center.y);
    this.targetCompensationFrame.position.set(0, 0);
    this.approachFrame.position.set(
      previewFrame.center.x - targetPose.center.x,
      previewFrame.center.y - targetPose.center.y
    );
    this.poseProgress.value = 0;
    this.poseFrame.setFromMatrix(makeMatrix(active.startMatrix));

    // A pooled group ghost may still carry a gather/layout motion from the
    // frame before release ownership transfers.  Cancel those tracks after
    // capturing the rendered pose; otherwise they can write the old stack
    // position back into the reparented ghost on the next frame.
    killMotionOf(active.previewNode, null, { reason: "folder-release-start" });
    killMotionOf(active.previewNode.scale, null, { reason: "folder-release-start" });
    if (active.release.releaseMode === CREATED_FOLDER_RELEASE_MODE) {
      suppressCreatedFolderReleaseLabel(active.previewNode);
      active.labelSuppressedNode = active.previewNode;
    }
    active.previewNode.removeFromParent();
    this.poseFrame.addChild(active.previewNode);
    resetContainerTransform(active.previewNode);
    active.previewNode.pivot.set(active.localVisualAnchor.x, active.localVisualAnchor.y);

    this.startReleaseMotion(getStageVelocity(active.release, active.state));
    this.syncTargetPose(targetPose);
  }

  startReleaseMotion(
    velocity: StagePoint & MotionNumericValues,
    options: Readonly<{ retarget?: boolean }> = {},
  ): void {
    const active = this.active;
    if (!active) return;
    const isCenterAbsorb = active.release.releaseMode === FOLDER_CENTER_ABSORB_RELEASE_MODE;
    const centerTimelineValue = Math.max(0, Math.min(1, readFinite(this.centerTimelineProgress.value, 0)));
    const centerElapsed = CENTER_ABSORB_DURATION * centerTimelineValue;
    const centerRemainingDuration = Math.max(0.001, CENTER_ABSORB_DURATION - centerElapsed);
    const releaseDelay = options.retarget === true
      ? 0
      : Math.max(0, readFinite(active.release.delayMs)) / 1000;
    const animations = isCenterAbsorb
      ? [
        motion(this.approachFrame)
          .delay(releaseDelay)
          .duration(centerRemainingDuration)
          .ease("power2.in")
          .handoff()
          .interrupt("retarget")
          .to({ x: 0, y: 0 }),
        motion(this.poseProgress)
          .delay(releaseDelay)
          .duration(centerRemainingDuration)
          .ease("power2.in")
          .handoff()
          .interrupt("retarget")
          .to({ value: 1 }),
        motion(this.centerTimelineProgress)
          .delay(releaseDelay)
          .duration(centerRemainingDuration)
          .ease("linear")
          .handoff()
          .interrupt("retarget")
          .to({ value: 1 }),
      ]
      : [
        motion(this.approachFrame)
          .delay(releaseDelay)
          .preset("handoff")
          .drag()
          .interrupt("retarget")
          .to({ velocity, x: 0, y: 0 }),
        motion(this.poseProgress)
          .delay(releaseDelay)
          .preset("handoff")
          .handoff()
          .interrupt("retarget")
          .to({ value: 1 }),
      ];
    const shouldReveal = active.release.revealFromAlpha != null &&
      Number.isFinite(Number(active.release.revealFromAlpha)) &&
      readFinite(active.previewNode.alpha, 1) < 0.999;
    if (isCenterAbsorb && shouldReveal) {
      animations.push(
        motion(active.previewNode)
          .handoff()
          .interrupt("retarget")
          .to({
            alpha: 1,
            delay: releaseDelay,
            duration: RELEASE_REVEAL_DURATION,
            ease: "power2.out",
          })
          .to({
            alpha: 0,
            delay: Math.max(0, CENTER_ABSORB_FADE_DELAY - RELEASE_REVEAL_DURATION),
            duration: CENTER_ABSORB_FADE_DURATION,
            ease: "power2.in",
          })
      );
    } else if (isCenterAbsorb && readFinite(active.previewNode.alpha, 1) > 0.001) {
      const fadeDelay = Math.max(0, CENTER_ABSORB_FADE_DELAY - centerElapsed);
      const fadeDuration = Math.max(
        0.001,
        CENTER_ABSORB_DURATION - Math.max(centerElapsed, CENTER_ABSORB_FADE_DELAY)
      );
      animations.push(
        motion(active.previewNode)
          .delay(releaseDelay + fadeDelay)
          .duration(Math.min(CENTER_ABSORB_FADE_DURATION, fadeDuration))
          .ease("power2.in")
          .handoff()
          .interrupt("retarget")
          .to({ alpha: 0 })
      );
    } else if (shouldReveal) {
      animations.push(
        motion(active.previewNode)
          .delay(releaseDelay)
          .duration(RELEASE_REVEAL_DURATION)
          .ease("power2.out")
          .handoff()
          .interrupt("retarget")
          .to({ alpha: 1 })
      );
    }
    const label = active.previewNode.labelText;
    if (label?.visible !== false) {
      if (readFinite(label.alpha, 1) > 0.001) {
        animations.push(
          motion(label)
            .duration(0.14)
            .ease("power2.out")
            .overlay()
            .interrupt("retarget")
            .to({ alpha: 0 })
        );
      }
      if (Math.abs(readFinite(label.scale?.x, 1) - 0.72) > 0.001) {
        animations.push(
          motion(label.scale)
            .duration(0.14)
            .ease("power2.out")
            .overlay()
            .interrupt("retarget")
            .to({ x: 0.72, y: 0.72 })
        );
      }
    }
    this.motionControl = parallel(animations, {
      onComplete: () => {
        if (!this.active || this.active.release.key !== active.release.key) return;
        this.active.motionSettled = true;
      },
    });
  }

  rebindTarget(
    targetFolderNode: FolderReleaseTargetNode | null | undefined,
  ): boolean {
    const active = this.active as StartedFolderReleaseActive | null;
    if (!active?.started) return false;
    const currentFrame = readPreviewFrame(this.layer, active.previewNode);
    const relativeVelocity = {
      x: getActiveMotionVelocity(this.approachFrame, "x"),
      y: getActiveMotionVelocity(this.approachFrame, "y"),
    };
    active.targetFolderNode = targetFolderNode;
    const targetPose = this.getTargetPose(active);
    if (!currentFrame || !targetPose) {
      this.abort("rebuilt-target-unavailable");
      return false;
    }

    if (this.motionControl && !this.motionControl.completed) {
      this.motionControl.cancel("folder-release-target-rebuilt");
    }
    this.motionControl = null;
    killMotionOf(this.approachFrame, null, { reason: "folder-release-target-rebuilt" });
    killMotionOf(this.poseProgress, null, { reason: "folder-release-target-rebuilt" });
    killMotionOf(this.centerTimelineProgress, null, { reason: "folder-release-target-rebuilt" });
    active.motionSettled = false;
    active.alignedRenderFrames = 0;
    active.alignmentFrameRequested = false;
    active.inverseLocalVisualMatrix = cloneMatrixBasis(currentFrame.inverseLocalVisualMatrix);
    active.localVisualAnchor = { ...currentFrame.localVisualAnchor };
    active.localVisualMatrix = cloneMatrixBasis(currentFrame.localVisualMatrix);
    active.startMatrix = cloneMatrixBasis(currentFrame.rootMatrix);
    active.targetMatrix = multiplyMatrixBasis(targetPose.matrix, active.inverseLocalVisualMatrix);
    active.initialTargetCenter = { ...targetPose.center };
    this.targetFollower.position.set(targetPose.center.x, targetPose.center.y);
    this.targetCompensationFrame.position.set(0, 0);
    this.approachFrame.position.set(
      currentFrame.center.x - targetPose.center.x,
      currentFrame.center.y - targetPose.center.y
    );
    this.poseProgress.value = 0;
    this.poseFrame.setFromMatrix(makeMatrix(active.startMatrix));
    active.previewNode.pivot.set(active.localVisualAnchor.x, active.localVisualAnchor.y);
    this.startReleaseMotion(relativeVelocity, { retarget: true });
    this.syncTargetPose(targetPose);
    motionRuntime.recordCoordinationEvent({
      action: "folder-release",
      event: "target-rebound",
      folderId: active.release.targetFolderId || null,
      itemId: active.release.item?.id || null,
      mode: active.release.releaseMode,
      releaseKey: active.release.key,
      slotIndex: active.release.targetPreviewSlotIndex ?? null,
    });
    return true;
  }

  syncTargetPose(targetPose: FolderReleaseTargetPose): void {
    const active = this.active as StartedFolderReleaseActive | null;
    if (!active?.started) return;
    active.targetMatrix = multiplyMatrixBasis(targetPose.matrix, active.inverseLocalVisualMatrix);
    this.targetFollower.position.set(targetPose.center.x, targetPose.center.y);
    const followProgress = Math.max(0, Math.min(1, readFinite(this.poseProgress.value, 0)));
    const initialTargetCenter = active.initialTargetCenter || targetPose.center;
    this.targetCompensationFrame.position.set(
      -(targetPose.center.x - initialTargetCenter.x) * (1 - followProgress),
      -(targetPose.center.y - initialTargetCenter.y) * (1 - followProgress)
    );
    const matrix = interpolateMatrixBasis(
      active.startMatrix,
      active.targetMatrix,
      this.poseProgress.value
    );
    this.poseFrame.setFromMatrix(makeMatrix(matrix));
  }

  isAligned(targetPose: FolderReleaseTargetPose): boolean {
    const active = this.active as StartedFolderReleaseActive | null;
    if (!active?.started || !active.motionSettled || !this.motionControl?.completed) return false;
    if (
      active.release.releaseMode === FOLDER_CENTER_ABSORB_RELEASE_MODE &&
      readFinite(active.previewNode.alpha, 1) > 0.001
    ) return false;
    const deviceScale = getDeviceScales(active.state);
    const centerErrorX = Math.abs(readFinite(this.approachFrame.x, Number.POSITIVE_INFINITY)) * deviceScale.x;
    const centerErrorY = Math.abs(readFinite(this.approachFrame.y, Number.POSITIVE_INFINITY)) * deviceScale.y;
    if (Math.max(centerErrorX, centerErrorY) > TARGET_CENTER_DEVICE_EPSILON) return false;

    const currentRootMatrix = interpolateMatrixBasis(active.startMatrix, active.targetMatrix, this.poseProgress.value);
    const currentVisualMatrix = multiplyMatrixBasis(currentRootMatrix, active.localVisualMatrix);
    const currentAxes = basisAxisLengths(currentVisualMatrix);
    const targetAxes = basisAxisLengths(targetPose.matrix);
    const iconSize = Math.max(1, readFinite(active.release.size?.width, 64));
    const sizeErrorX = Math.abs(currentAxes.x - targetAxes.x) * iconSize * deviceScale.x;
    const sizeErrorY = Math.abs(currentAxes.y - targetAxes.y) * iconSize * deviceScale.y;
    if (Math.max(sizeErrorX, sizeErrorY) > TARGET_SIZE_DEVICE_EPSILON) return false;
    return Math.abs(shortestAngleDelta(basisRotation(currentVisualMatrix), basisRotation(targetPose.matrix))) <= TARGET_ROTATION_EPSILON;
  }

  syncFrame(options: Readonly<{ isRenderFrame?: boolean }> = {}): void {
    const active = this.active;
    if (!active || this.completeKey === active.release.key) return;
    const isRenderFrame = options.isRenderFrame === true;
    const targetPose = this.getTargetPose(active);
    if (!targetPose) {
      if (!isRenderFrame) return;
      active.initialMissingTargetFrames += 1;
      if (active.started || active.initialMissingTargetFrames >= MAX_INITIAL_MISSING_TARGET_FRAMES) {
        this.abort(active.started ? "target-lost" : "target-unavailable");
      }
      return;
    }
    active.initialMissingTargetFrames = 0;
    if (!active.started) this.startRelease(targetPose);
    if (!this.active || !active.started) return;
    if (active.previewNode.parent !== this.poseFrame) {
      this.abort("actor-parent-ownership-lost");
      return;
    }
    this.syncTargetPose(targetPose);
    if (
      !active.targetVisualPrepared &&
      [FOLDER_PREVIEW_SLOT_RELEASE_MODE, CREATED_FOLDER_RELEASE_MODE].includes(active.release.releaseMode) &&
      readFinite(this.poseProgress.value, 0) >= TARGET_VISUAL_PREPARE_PROGRESS
    ) {
      active.targetVisualPrepared = this.onPrepareTargetVisual({
        node: active.previewNode,
        release: active.release,
      }) === true;
      if (active.targetVisualPrepared) {
        const crossfadeDuration = active.state?.group?.reducedMotion === true ? 0 : 0.08;
        parallel([
          motion(active.previewNode.folderSlotReleaseVisual)
            .duration(crossfadeDuration)
            .ease("power2.out")
            .overlay()
            .interrupt("retarget")
            .to({ alpha: 1 }),
        ]);
      }
    }

    if (!this.canComplete() || !this.isAligned(targetPose)) {
      active.alignedRenderFrames = 0;
      active.alignmentFrameRequested = false;
      return;
    }
    if (!isRenderFrame) return;
    active.alignedRenderFrames += 1;
    if (active.alignedRenderFrames < ALIGNED_RENDER_FRAMES_BEFORE_COMPLETE) {
      if (!active.alignmentFrameRequested) {
        active.alignmentFrameRequested = true;
        motionRuntime.afterFrame(() => {
          if (this.active === active) active.alignmentFrameRequested = false;
        });
      }
      return;
    }
    this.complete();
  }

  complete(): void {
    const active = this.active;
    if (!active || this.completeKey === active.release.key) return;
    this.completeKey = active.release.key;
    active.previewNode.commitFolderSlotReleaseVisual?.();
    motionRuntime.recordCoordinationEvent({
      action: "folder-release",
      event: "complete",
      folderId: active.release.targetFolderId || null,
      itemId: active.release.item?.id || null,
      mode: active.release.releaseMode,
      releaseKey: active.release.key,
      slotIndex: active.release.targetPreviewSlotIndex ?? null,
    });
    this.onReleaseComplete(active.release);
  }

  abort(reason: string): void {
    const active = this.active;
    if (!active || this.completeKey === active.release.key) return;
    this.completeKey = active.release.key;
    motionRuntime.recordCoordinationEvent({
      action: "folder-release",
      event: "abort",
      folderId: active.release.targetFolderId || null,
      itemId: active.release.item?.id || null,
      mode: active.release.releaseMode,
      reason,
      releaseKey: active.release.key,
      slotIndex: active.release.targetPreviewSlotIndex ?? null,
    });
    this.onReleaseAbort(active.release, reason);
  }

  restorePreviewParent(): void {
    const previewNode = this.active?.previewNode;
    if (!previewNode || previewNode.destroyed || previewNode.parent !== this.poseFrame) return;
    const pose = readNodePose(this.layer, previewNode);
    previewNode.removeFromParent();
    this.layer!.addChild(previewNode);
    resetContainerTransform(previewNode);
    if (pose) previewNode.setFromMatrix(makeMatrix(pose.matrix, pose.center.x, pose.center.y));
  }

  clear(reason = CLEAR_REASON): void {
    const active = this.active;
    if (this.motionControl && !this.motionControl.completed) this.motionControl.cancel(reason);
    this.motionControl = null;
    killMotionOf(this.approachFrame, null, { reason });
    killMotionOf(this.poseProgress, null, { reason });
    killMotionOf(this.centerTimelineProgress, null, { reason });
    const previewNode = active?.previewNode;
    if (previewNode) killMotionOf(previewNode, "alpha", { reason });
    if (previewNode?.labelText) {
      killMotionOf(previewNode.labelText, null, { reason });
      killMotionOf(previewNode.labelText.scale, null, { reason });
    }
    if (previewNode?.visualWrap) {
      killMotionOf(previewNode.visualWrap, "alpha", { reason });
      previewNode.visualWrap.alpha = 1;
    }
    previewNode?.clearFolderSlotReleaseVisual?.(reason);
    this.restorePreviewParent();
    if (active?.release?.releaseMode === CREATED_FOLDER_RELEASE_MODE) {
      restoreCreatedFolderReleaseLabel(active.labelSuppressedNode || previewNode, reason);
    }
    this.active = null;
    this.targetFollower.visible = false;
    resetContainerTransform(this.targetFollower);
    resetContainerTransform(this.targetCompensationFrame);
    resetContainerTransform(this.approachFrame);
    resetContainerTransform(this.poseFrame);
    this.poseProgress.value = 0;
    this.centerTimelineProgress.value = 0;
  }

  destroy(): void {
    this.clear(DESTROY_REASON);
    if (this.didInstallRenderHook && this.layer?.onRender === this.renderHook) {
      this.layer.onRender = this.previousOnRender || null;
    }
    this.previousOnRender = null;
    this.renderHook = null;
    if (!this.targetFollower.destroyed) this.targetFollower.destroy({ children: true });
    this.layer = null;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
