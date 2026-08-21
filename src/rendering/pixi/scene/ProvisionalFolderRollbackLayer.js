import { Container } from "pixi.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motion } from "../animation/motionTween.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const ROLLBACK_DURATION = 0.28;
const ROLLBACK_SHELL_SCALE = 0.76;
const MAX_ROLLBACK_HANDOFF_VELOCITY = 3;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value, label) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Provisional folder rollback could not resolve ${label}`);
  }
  return { x, y };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

export function makeProvisionalFolderRollbackEase(handoffVelocity = 0, duration = ROLLBACK_DURATION) {
  const normalizedVelocity = Math.max(0, Math.min(
    MAX_ROLLBACK_HANDOFF_VELOCITY,
    finite(handoffVelocity)
  ));
  const startTangent = normalizedVelocity * Math.max(0, finite(duration));
  return (value) => {
    const progress = clamp01(value);
    const squared = progress * progress;
    const cubed = squared * progress;
    return clamp01(
      (-2 * cubed + 3 * squared) +
      (cubed - 2 * squared + progress) * startTangent
    );
  };
}

function axisScale(matrix, axis) {
  const first = axis === "x" ? matrix?.a : matrix?.c;
  const second = axis === "x" ? matrix?.b : matrix?.d;
  const scale = Math.hypot(Number(first), Number(second));
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Provisional folder rollback received an invalid ${axis}-axis preview scale`);
  }
  return scale;
}

export function makeProvisionalFolderRollbackVisualPlan(options = {}) {
  const {
    folderNode,
    handoffVelocity = 0,
    layer,
    previewSlotIndex = 0,
    reducedMotion = false,
    targetAppId,
    targetNode,
  } = options;
  if (!layer || typeof layer.toLocal !== "function") {
    throw new TypeError("Provisional folder rollback visual plan requires a layer");
  }
  if (!folderNode || typeof folderNode.getFolderPreviewChildReleasePose !== "function") {
    throw new TypeError("Provisional folder rollback visual plan requires a folder node");
  }
  if (!targetNode) throw new TypeError("Provisional folder rollback visual plan requires a target node");
  const sourcePose = folderNode.getFolderPreviewChildReleasePose(
    layer,
    Math.max(0, Math.trunc(Number(previewSlotIndex) || 0)),
    {
      expectedChildId: targetAppId,
      previewIconSize: Math.max(1, finite(targetNode.iconSize, 64)),
    }
  );
  if (!sourcePose || sourcePose.targetChildId !== targetAppId) {
    throw new Error(`Provisional folder rollback preview owner mismatch for ${targetAppId || "unknown target"}`);
  }
  const targetPoint = point(layer.toLocal({ x: 0, y: 0 }, targetNode), "target desktop pose");
  const folderPoint = point(layer.toLocal({ x: 0, y: 0 }, folderNode), "folder handoff pose");
  const duration = reducedMotion ? 0 : ROLLBACK_DURATION;
  const folderVisual = folderNode.visualWrap || folderNode;
  const normalizedHandoffVelocity = Math.max(0, Math.min(
    MAX_ROLLBACK_HANDOFF_VELOCITY,
    finite(handoffVelocity)
  ));
  return Object.freeze({
    duration,
    ease: makeProvisionalFolderRollbackEase(normalizedHandoffVelocity, duration),
    folderShell: Object.freeze({
      from: Object.freeze({
        alpha: finite(folderVisual.alpha, 1),
        scaleX: finite(folderVisual.scale?.x, 1),
        scaleY: finite(folderVisual.scale?.y, finite(folderVisual.scale?.x, 1)),
        x: folderPoint.x,
        y: folderPoint.y,
      }),
      to: Object.freeze({ alpha: 0, scale: ROLLBACK_SHELL_SCALE }),
    }),
    handoffVelocity: normalizedHandoffVelocity,
    targetActor: Object.freeze({
      from: Object.freeze({
        scaleX: axisScale(sourcePose.matrix, "x"),
        scaleY: axisScale(sourcePose.matrix, "y"),
        x: sourcePose.center.x,
        y: sourcePose.center.y,
      }),
      to: Object.freeze({
        scaleX: finite(targetNode.scale?.x, 1),
        scaleY: finite(targetNode.scale?.y, finite(targetNode.scale?.x, 1)),
        x: targetPoint.x,
        y: targetPoint.y,
      }),
    }),
  });
}

export function makeProvisionalFolderRollbackVisualFrame(plan, progress, targetLabelAlpha = 1) {
  if (!plan?.folderShell?.from || !plan?.targetActor?.from) {
    throw new TypeError("Provisional folder rollback visual frame requires a visual plan");
  }
  const value = clamp01(progress);
  return Object.freeze({
    folderShell: Object.freeze({
      alpha: lerp(plan.folderShell.from.alpha, plan.folderShell.to.alpha, value),
      scaleX: lerp(plan.folderShell.from.scaleX, plan.folderShell.to.scale, value),
      scaleY: lerp(plan.folderShell.from.scaleY, plan.folderShell.to.scale, value),
    }),
    progress: value,
    targetActor: Object.freeze({
      scaleX: lerp(plan.targetActor.from.scaleX, plan.targetActor.to.scaleX, value),
      scaleY: lerp(plan.targetActor.from.scaleY, plan.targetActor.to.scaleY, value),
      x: lerp(plan.targetActor.from.x, plan.targetActor.to.x, value),
      y: lerp(plan.targetActor.from.y, plan.targetActor.to.y, value),
    }),
    targetLabelAlpha: Math.max(0, finite(targetLabelAlpha, 1)) * value,
  });
}

function addChildAtClamped(parent, child, index) {
  if (!parent || !child) return false;
  const childCount = Array.isArray(parent.children) ? parent.children.length : 0;
  const targetIndex = Math.max(0, Math.min(Math.trunc(Number(index) || 0), childCount));
  if (typeof parent.addChildAt === "function") parent.addChildAt(child, targetIndex);
  else parent.addChild?.(child);
  return true;
}

export class ProvisionalFolderRollbackLayer extends Container {
  constructor(options = {}) {
    super();
    this.eventMode = "none";
    this.onComplete = options.onComplete || (() => {});
    this.active = null;
    this.handledToken = null;
    this.motionControl = null;
  }

  ownsNode(node) {
    return Boolean(this.active && (this.active.folderNode === node || this.active.targetNode === node));
  }

  hasHandledToken(token) {
    return Number.isFinite(Number(token)) && this.handledToken === Number(token);
  }

  snapshot() {
    const active = this.active;
    const folderVisual = active?.folderNode?.visualWrap || active?.folderNode || null;
    const targetNode = active?.targetNode || null;
    return Object.freeze({
      active: Boolean(active),
      folder: active ? Object.freeze({
        alpha: finite(folderVisual?.alpha, 1),
        labelAlpha: finite(active.folderNode?.labelText?.alpha, 0),
        labelRenderable: active.folderNode?.labelText?.renderable ?? null,
        scaleX: finite(folderVisual?.scale?.x, 1),
        scaleY: finite(folderVisual?.scale?.y, 1),
      }) : null,
      folderId: active?.folderId || null,
      handledToken: this.handledToken,
      handoffVelocity: active?.plan?.handoffVelocity ?? null,
      progress: active?.progressState?.value ?? null,
      target: active ? Object.freeze({
        labelAlpha: finite(targetNode?.labelText?.alpha, 0),
        scaleX: finite(targetNode?.scale?.x, 1),
        scaleY: finite(targetNode?.scale?.y, 1),
        x: finite(targetNode?.x),
        y: finite(targetNode?.y),
      }) : null,
      targetAppId: active?.targetAppId || null,
      token: active?.token ?? null,
    });
  }

  start(request = {}) {
    const token = Number(request.token);
    if (!Number.isFinite(token)) throw new TypeError("Provisional folder rollback requires a token");
    if (this.active?.token === token) return true;
    if (this.active) {
      throw new Error(`Provisional folder rollback ${this.active.token} is still animating`);
    }
    const folderNode = request.folderNode;
    const targetNode = request.targetNode;
    if (!folderNode?.parent || !targetNode?.parent) {
      throw new Error("Provisional folder rollback requires attached folder and target nodes");
    }
    const plan = makeProvisionalFolderRollbackVisualPlan({
      folderNode,
      handoffVelocity: request.handoffVelocity,
      layer: this,
      previewSlotIndex: request.previewSlotIndex,
      reducedMotion: request.reducedMotion,
      targetAppId: request.targetAppId,
      targetNode,
    });
    const targetParent = targetNode.parent;
    const targetParentIndex = targetParent.children?.indexOf?.(targetNode) ?? 0;
    const targetLocalPose = {
      alpha: finite(targetNode.alpha, 1),
      scaleX: finite(targetNode.scale?.x, 1),
      scaleY: finite(targetNode.scale?.y, finite(targetNode.scale?.x, 1)),
      x: finite(targetNode.x ?? targetNode.position?.x),
      y: finite(targetNode.y ?? targetNode.position?.y),
    };
    const targetLabelAlpha = finite(targetNode.labelText?.alpha, 1);
    const suppressedIds = new Set(folderNode.state?.suppressedFolderPreviewChildIds || []);
    suppressedIds.add(request.targetAppId);
    folderNode.setState?.({
      ...folderNode.state,
      draggable: false,
      interactive: false,
      suppressedFolderPreviewChildIds: [...suppressedIds],
    });
    folderNode.eventMode = "none";
    if (folderNode.labelText) {
      killAllMotion(folderNode.labelText, { reason: "provisional-folder-rollback-label" });
      folderNode.labelText.alpha = 0;
      folderNode.labelText.renderable = false;
    }
    folderNode.parent.removeChild(folderNode);
    targetNode.parent.removeChild(targetNode);
    this.addChild(folderNode);
    this.addChild(targetNode);
    folderNode.position.set(plan.folderShell.from.x, plan.folderShell.from.y);
    folderNode.alpha = 1;
    folderNode.visible = true;
    targetNode.position.set(plan.targetActor.from.x, plan.targetActor.from.y);
    targetNode.scale.set(plan.targetActor.from.scaleX, plan.targetActor.from.scaleY);
    targetNode.alpha = 1;
    targetNode.visible = true;
    targetNode.renderable = true;
    targetNode.eventMode = "none";
    if (targetNode.labelText) {
      killAllMotion(targetNode.labelText, { reason: "provisional-folder-rollback-label" });
      targetNode.labelText.alpha = 0;
      targetNode.labelText.renderable = true;
    }
    this.active = {
      folderId: request.folderId || null,
      folderNode,
      plan,
      progressState: { value: 0 },
      targetAppId: request.targetAppId,
      targetLabelAlpha,
      targetLocalPose,
      targetNode,
      targetParent,
      targetParentIndex,
      token,
    };
    const shellVisual = folderNode.visualWrap || folderNode;
    const shellScale = shellVisual.scale || folderNode.scale;
    const progressState = this.active.progressState;
    const applyProgress = (progress) => {
      const frame = makeProvisionalFolderRollbackVisualFrame(plan, progress, targetLabelAlpha);
      progressState.value = frame.progress;
      targetNode.position.set(frame.targetActor.x, frame.targetActor.y);
      targetNode.scale.set(frame.targetActor.scaleX, frame.targetActor.scaleY);
      shellVisual.alpha = frame.folderShell.alpha;
      shellScale.set(frame.folderShell.scaleX, frame.folderShell.scaleY);
      if (targetNode.labelText) targetNode.labelText.alpha = frame.targetLabelAlpha;
    };
    applyProgress(0);
    this.motionControl = motion(progressState)
      .duration(plan.duration)
      .ease(plan.ease)
      .handoff()
      .interrupt("retarget")
      .to({
        value: 1,
        onUpdate: applyProgress,
        onComplete: () => {
          applyProgress(1);
          this.finish(token);
        },
      })
      .start();
    this.handledToken = token;
    return true;
  }

  finish(token) {
    const active = this.active;
    if (!active || active.token !== token) return false;
    this.motionControl = null;
    this.active = null;
    const { folderNode, progressState, targetNode, targetLocalPose, targetParent, targetParentIndex } = active;
    killAllMotion(progressState, { reason: "provisional-folder-rollback-finish" });
    killAllMotion(targetNode, { reason: "provisional-folder-rollback-finish" });
    killAllMotion(targetNode.scale, { reason: "provisional-folder-rollback-finish" });
    if (targetNode.parent === this) this.removeChild(targetNode);
    addChildAtClamped(targetParent, targetNode, targetParentIndex);
    targetNode.position.set(targetLocalPose.x, targetLocalPose.y);
    targetNode.scale.set(targetLocalPose.scaleX, targetLocalPose.scaleY);
    targetNode.alpha = targetLocalPose.alpha;
    targetNode.renderable = true;
    targetNode.visible = targetNode.state?.dragging !== true && targetNode.state?.ghosted !== true;
    targetNode.eventMode = targetNode.state?.interactive === false ? "none" : "static";
    if (targetNode.labelText) {
      targetNode.labelText.alpha = active.targetLabelAlpha;
      targetNode.labelText.renderable = true;
    }
    if (folderNode.parent === this) this.removeChild(folderNode);
    killAllMotion(folderNode, { reason: "provisional-folder-rollback-finish" });
    destroyDisplayObjectAfterFrame(folderNode, { children: true });
    this.onComplete({
      folderId: active.folderId,
      targetAppId: active.targetAppId,
      token: active.token,
    });
    return true;
  }

  clear(reason = "provisional-folder-rollback-clear") {
    const active = this.active;
    this.motionControl?.cancel?.(reason);
    this.motionControl = null;
    if (!active) return;
    this.active = null;
    const { folderNode, progressState, targetNode, targetLocalPose, targetParent, targetParentIndex } = active;
    killAllMotion(progressState, { reason });
    killAllMotion(targetNode, { reason });
    killAllMotion(targetNode.scale, { reason });
    if (targetNode.parent === this) this.removeChild(targetNode);
    addChildAtClamped(targetParent, targetNode, targetParentIndex);
    targetNode.position.set(targetLocalPose.x, targetLocalPose.y);
    targetNode.scale.set(targetLocalPose.scaleX, targetLocalPose.scaleY);
    targetNode.alpha = targetLocalPose.alpha;
    targetNode.renderable = true;
    if (folderNode.parent === this) this.removeChild(folderNode);
    killAllMotion(folderNode, { reason });
    folderNode.destroy?.({ children: true });
  }

  destroy(options) {
    this.clear("provisional-folder-rollback-destroy");
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
