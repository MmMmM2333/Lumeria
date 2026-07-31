import { Container, Matrix } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getStageScale } from "../geometry/stageCoordinates.js";

export const FOLDER_PREVIEW_SLOT_RELEASE_MODE = "folder-preview-slot";

const CLEAR_REASON = "folder-preview-slot-release-clear";
const DESTROY_REASON = "destroyed";
const TARGET_CENTER_DEVICE_EPSILON = 0.5;
const TARGET_SIZE_DEVICE_EPSILON = 0.5;
const TARGET_ROTATION_EPSILON = Math.PI / 360;
const ALIGNED_RENDER_FRAMES_BEFORE_COMPLETE = 2;
const MAX_INITIAL_MISSING_TARGET_FRAMES = 2;

function readFinite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneMatrixBasis(matrix = {}) {
  return {
    a: readFinite(matrix.a, 1),
    b: readFinite(matrix.b, 0),
    c: readFinite(matrix.c, 0),
    d: readFinite(matrix.d, 1),
  };
}

function readMatrixBasis(matrix = {}) {
  const result = {
    a: Number(matrix.a),
    b: Number(matrix.b),
    c: Number(matrix.c),
    d: Number(matrix.d),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function interpolateMatrixBasis(from, to, progress) {
  const t = Math.max(0, Math.min(1, readFinite(progress, 0)));
  return {
    a: from.a + (to.a - from.a) * t,
    b: from.b + (to.b - from.b) * t,
    c: from.c + (to.c - from.c) * t,
    d: from.d + (to.d - from.d) * t,
  };
}

function multiplyMatrixBasis(left, right) {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
  };
}

function invertMatrixBasis(matrix) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.00000001) return null;
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
  };
}

function makeMatrix(basis, x = 0, y = 0) {
  return new Matrix(basis.a, basis.b, basis.c, basis.d, x, y);
}

function readNodePose(relativeTo, node) {
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

function readPreviewFrame(relativeTo, previewNode) {
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

function basisAxisLengths(matrix) {
  return {
    x: Math.hypot(matrix.a, matrix.b),
    y: Math.hypot(matrix.c, matrix.d),
  };
}

function basisRotation(matrix) {
  return Math.atan2(matrix.b, matrix.a);
}

function shortestAngleDelta(a, b) {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function getDeviceScales(state = {}) {
  const stageScale = getStageScale(state.stageRect, state.width, state.height);
  const resolution = Math.max(0.01, readFinite(state.deviceResolution, 1));
  return {
    x: Math.max(0.0001, readFinite(stageScale.scaleX, 1)) * resolution,
    y: Math.max(0.0001, readFinite(stageScale.scaleY, 1)) * resolution,
  };
}

function getStageVelocity(release, state) {
  const stageScale = getStageScale(state.stageRect, state.width, state.height);
  return {
    x: readFinite(release?.velocity?.x, 0) / Math.max(0.0001, readFinite(stageScale.scaleX, 1)),
    y: readFinite(release?.velocity?.y, 0) / Math.max(0.0001, readFinite(stageScale.scaleY, 1)),
  };
}

function getActiveMotionVelocity(target, prop) {
  const channel = motionRuntime.getChannel(target, prop);
  const animation = Array.from(channel?.base?.values?.() || [])[0] || null;
  return readFinite(animation?.velocity, 0);
}

function resetContainerTransform(node) {
  if (!node || node.destroyed) return;
  node.position.set(0, 0);
  node.scale.set(1, 1);
  node.pivot.set(0, 0);
  node.skew.set(0, 0);
  node.rotation = 0;
}

export class FolderPreviewSlotReleaseController {
  constructor(layer, options = {}) {
    if (!layer) throw new Error("FolderPreviewSlotReleaseController requires a release layer");
    this.layer = layer;
    this.onReleaseComplete = options.onReleaseComplete || (() => {});
    this.onReleaseAbort = options.onReleaseAbort || (() => {});
    this.targetFollower = new Container({ label: "folder-preview-slot-target-follower" });
    this.approachFrame = new Container({ label: "folder-preview-slot-approach-frame" });
    this.poseFrame = new Container({ label: "folder-preview-slot-pose-frame" });
    this.targetFollower.eventMode = "none";
    this.approachFrame.eventMode = "none";
    this.poseFrame.eventMode = "none";
    this.targetFollower.addChild(this.approachFrame);
    this.approachFrame.addChild(this.poseFrame);
    this.targetFollower.visible = false;
    this.layer.addChild(this.targetFollower);
    this.poseProgress = { value: 0 };
    this.active = null;
    this.motionControl = null;
    this.completeKey = null;
    this.previousOnRender = this.layer.onRender;
    this.renderHook = (renderer) => {
      this.previousOnRender?.call(this.layer, renderer);
      this.syncFrame({ isRenderFrame: true });
    };
    this.layer.onRender = this.renderHook;
  }

  getTargetPose(active = this.active) {
    const targetFolderNode = active?.targetFolderNode;
    const release = active?.release;
    if (!targetFolderNode || targetFolderNode.destroyed || targetFolderNode.item?.id !== release?.targetFolderId) return null;
    const pose = targetFolderNode.getFolderPreviewChildReleasePose?.(
      this.layer,
      release.targetPreviewSlotIndex,
      {
        expectedChildId: release.item?.id,
        previewIconSize: Math.max(1, readFinite(release.size?.width, 64)),
      }
    );
    if (!pose?.center || !pose?.matrix) return null;
    const center = {
      x: readFinite(pose.center.x, Number.NaN),
      y: readFinite(pose.center.y, Number.NaN),
    };
    const matrix = readMatrixBasis(pose.matrix);
    if (!matrix) return null;
    if (![center.x, center.y, matrix.a, matrix.b, matrix.c, matrix.d].every(Number.isFinite)) return null;
    if (pose.targetChildId && pose.targetChildId !== release.item?.id) return null;
    return { ...pose, center, matrix };
  }

  update(options = {}) {
    const { previewNode, release, targetFolderNode } = options;
    if (release?.releaseMode !== FOLDER_PREVIEW_SLOT_RELEASE_MODE || !release?.key || !previewNode) {
      this.clear(CLEAR_REASON);
      return false;
    }

    const isNewRelease = this.active?.release?.key !== release.key;
    if (isNewRelease) {
      this.clear("folder-preview-slot-release-replace");
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
      };
      motionRuntime.recordCoordinationEvent({
        action: "folder-preview-slot-release",
        event: "start",
        folderId: release.targetFolderId || null,
        itemId: release.item?.id || null,
        releaseKey: release.key,
        slotIndex: release.targetPreviewSlotIndex ?? null,
      });
    } else {
      const targetNodeChanged = this.active.targetFolderNode !== targetFolderNode;
      this.active.previewNode = previewNode;
      this.active.release = release;
      this.active.state = options;
      if (targetNodeChanged && this.active.started) {
        this.rebindTarget(targetFolderNode);
        return true;
      }
      this.active.targetFolderNode = targetFolderNode;
    }

    this.syncFrame();
    return true;
  }

  startRelease(targetPose) {
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
    this.targetFollower.visible = true;
    this.targetFollower.position.set(targetPose.center.x, targetPose.center.y);
    this.approachFrame.position.set(
      previewFrame.center.x - targetPose.center.x,
      previewFrame.center.y - targetPose.center.y
    );
    this.poseProgress.value = 0;
    this.poseFrame.setFromMatrix(makeMatrix(active.startMatrix));

    active.previewNode.removeFromParent();
    this.poseFrame.addChild(active.previewNode);
    resetContainerTransform(active.previewNode);
    active.previewNode.pivot.set(active.localVisualAnchor.x, active.localVisualAnchor.y);

    this.startReleaseMotion(getStageVelocity(active.release, active.state));
    this.syncTargetPose(targetPose);
  }

  startReleaseMotion(velocity) {
    const active = this.active;
    if (!active) return;
    const animations = [
      motion(this.approachFrame)
        .preset("handoff")
        .drag()
        .interrupt("retarget")
        .to({ velocity, x: 0, y: 0 }),
      motion(this.poseProgress)
        .preset("handoff")
        .handoff()
        .interrupt("retarget")
        .to({ value: 1 }),
    ];
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

  rebindTarget(targetFolderNode) {
    const active = this.active;
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
      this.motionControl.cancel("folder-preview-slot-target-rebuilt");
    }
    this.motionControl = null;
    killMotionOf(this.approachFrame, null, { reason: "folder-preview-slot-target-rebuilt" });
    killMotionOf(this.poseProgress, null, { reason: "folder-preview-slot-target-rebuilt" });
    active.motionSettled = false;
    active.alignedRenderFrames = 0;
    active.alignmentFrameRequested = false;
    active.inverseLocalVisualMatrix = cloneMatrixBasis(currentFrame.inverseLocalVisualMatrix);
    active.localVisualAnchor = { ...currentFrame.localVisualAnchor };
    active.localVisualMatrix = cloneMatrixBasis(currentFrame.localVisualMatrix);
    active.startMatrix = cloneMatrixBasis(currentFrame.rootMatrix);
    active.targetMatrix = multiplyMatrixBasis(targetPose.matrix, active.inverseLocalVisualMatrix);
    this.targetFollower.position.set(targetPose.center.x, targetPose.center.y);
    this.approachFrame.position.set(
      currentFrame.center.x - targetPose.center.x,
      currentFrame.center.y - targetPose.center.y
    );
    this.poseProgress.value = 0;
    this.poseFrame.setFromMatrix(makeMatrix(active.startMatrix));
    active.previewNode.pivot.set(active.localVisualAnchor.x, active.localVisualAnchor.y);
    this.startReleaseMotion(relativeVelocity);
    this.syncTargetPose(targetPose);
    motionRuntime.recordCoordinationEvent({
      action: "folder-preview-slot-release",
      event: "target-rebound",
      folderId: active.release.targetFolderId || null,
      itemId: active.release.item?.id || null,
      releaseKey: active.release.key,
      slotIndex: active.release.targetPreviewSlotIndex ?? null,
    });
    return true;
  }

  syncTargetPose(targetPose) {
    const active = this.active;
    if (!active?.started) return;
    active.targetMatrix = multiplyMatrixBasis(targetPose.matrix, active.inverseLocalVisualMatrix);
    this.targetFollower.position.set(targetPose.center.x, targetPose.center.y);
    const matrix = interpolateMatrixBasis(
      active.startMatrix,
      active.targetMatrix,
      this.poseProgress.value
    );
    this.poseFrame.setFromMatrix(makeMatrix(matrix));
  }

  isAligned(targetPose) {
    const active = this.active;
    if (!active?.started || !active.motionSettled || !this.motionControl?.completed) return false;
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

  syncFrame(options = {}) {
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
    this.syncTargetPose(targetPose);

    if (!this.isAligned(targetPose)) {
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

  complete() {
    const active = this.active;
    if (!active || this.completeKey === active.release.key) return;
    this.completeKey = active.release.key;
    motionRuntime.recordCoordinationEvent({
      action: "folder-preview-slot-release",
      event: "complete",
      folderId: active.release.targetFolderId || null,
      itemId: active.release.item?.id || null,
      releaseKey: active.release.key,
      slotIndex: active.release.targetPreviewSlotIndex ?? null,
    });
    this.onReleaseComplete(active.release);
  }

  abort(reason) {
    const active = this.active;
    if (!active || this.completeKey === active.release.key) return;
    this.completeKey = active.release.key;
    motionRuntime.recordCoordinationEvent({
      action: "folder-preview-slot-release",
      event: "abort",
      folderId: active.release.targetFolderId || null,
      itemId: active.release.item?.id || null,
      reason,
      releaseKey: active.release.key,
      slotIndex: active.release.targetPreviewSlotIndex ?? null,
    });
    this.onReleaseAbort(active.release, reason);
  }

  restorePreviewParent() {
    const previewNode = this.active?.previewNode;
    if (!previewNode || previewNode.destroyed || previewNode.parent !== this.poseFrame) return;
    const pose = readNodePose(this.layer, previewNode);
    previewNode.removeFromParent();
    this.layer.addChild(previewNode);
    resetContainerTransform(previewNode);
    if (pose) previewNode.setFromMatrix(makeMatrix(pose.matrix, pose.center.x, pose.center.y));
  }

  clear(reason = CLEAR_REASON) {
    if (this.motionControl && !this.motionControl.completed) this.motionControl.cancel(reason);
    this.motionControl = null;
    killMotionOf(this.approachFrame, null, { reason });
    killMotionOf(this.poseProgress, null, { reason });
    const previewNode = this.active?.previewNode;
    if (previewNode?.labelText) {
      killMotionOf(previewNode.labelText, null, { reason });
      killMotionOf(previewNode.labelText.scale, null, { reason });
    }
    this.restorePreviewParent();
    this.active = null;
    this.targetFollower.visible = false;
    resetContainerTransform(this.targetFollower);
    resetContainerTransform(this.approachFrame);
    resetContainerTransform(this.poseFrame);
    this.poseProgress.value = 0;
  }

  destroy() {
    this.clear(DESTROY_REASON);
    if (this.layer?.onRender === this.renderHook) this.layer.onRender = this.previousOnRender || null;
    this.previousOnRender = null;
    this.renderHook = null;
    if (!this.targetFollower.destroyed) this.targetFollower.destroy({ children: true });
    this.layer = null;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
