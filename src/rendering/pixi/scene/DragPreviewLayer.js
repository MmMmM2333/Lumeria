import { Container } from "pixi.js";
import { IconNode } from "../nodes/IconNode.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import {
  DRAG_PREVIEW_SCALE,
  DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB,
  getDragPreviewLayout,
  getDragReleaseMotion,
} from "./dragPreviewMotion.js";

const DRAG_PREVIEW_ROTATION = 0;
const DRAG_PREVIEW_CLEAR_REASON = "drag-preview-clear";
const DRAG_PREVIEW_REPLACE_REASON = "drag-preview-replace";
const DRAG_RELEASE_START_REASON = "drag-release-start";
const DRAG_PREVIEW_LABEL_RESTORE_DURATION = 0.12;
const DRAG_PREVIEW_FOLDER_HOVER_LABEL_SCALE = 0.72;
const DRAG_RELEASE_CENTER_ABSORB_DURATION = 0.24;
const DRAG_RELEASE_CENTER_ABSORB_FADE_DELAY = 0.1;
const DRAG_RELEASE_CENTER_ABSORB_FADE_DURATION = 0.14;
const DRAG_RELEASE_EQUIVALENT_FINAL_DELTA = 0.75;
const DRAG_RELEASE_EQUIVALENT_FINAL_SCALE_DELTA = 0.0125;

function stopPreviewScaleMotion(node, options = {}) {
  killMotionOf(node.scale, null, { reason: options.reason });
}

function stopPreviewLabelMotion(node, options = {}) {
  killMotionOf(node?.labelText, "alpha", { reason: options.reason });
  killMotionOf(node?.labelText?.scale, null, { reason: options.reason });
}

function springPreviewScale(node, scale) {
  motion(node.scale)
    .preset("handoff")
    .drag()
    .interrupt("retarget")
    .to({ x: scale, y: scale })
    .start();
}

function describeDragPreviewTargets(node, dragState, phase) {
  if (!node || !dragState?.item) return;
  const base = {
    index: dragState.source?.index ?? null,
    itemId: dragState.item.id ?? null,
    itemType: dragState.item.type ?? null,
    kind: "DragPreview",
    label: dragState.item.name || dragState.item.id || "Drag preview",
    layer: "dragPreview",
    pageIndex: dragState.source?.pageIndex ?? null,
    phase,
    sourceType: dragState.source?.type ?? null,
  };
  motionRuntime.describeTarget(node, {
    ...base,
    overlayTarget: node,
    sourceLabel: "dragPreview.node",
    targetPart: "node",
  });
  motionRuntime.describeTarget(node.scale, {
    ...base,
    overlayTarget: node,
    sourceLabel: "dragPreview.scale",
    targetPart: "node.scale",
  });
}

function getPreviewLabelTarget(folderHoverState) {
  const phase = folderHoverState?.phase;
  const hoveringFolder = folderHoverState?.targetType === "folder" && (phase === "hover" || phase === "flash");
  return hoveringFolder
    ? { alpha: 0, key: "folder-hover-hidden", scale: DRAG_PREVIEW_FOLDER_HOVER_LABEL_SCALE }
    : { alpha: 1, key: "visible", scale: 1 };
}

function snapPreviewLabel(node, target) {
  if (!node?.labelText) return;
  stopPreviewLabelMotion(node, { reason: "drag-preview-label-snap" });
  node.labelText.alpha = target.alpha;
  node.labelText.scale.set(target.scale);
}

function tweenPreviewLabel(node, target) {
  if (!node?.labelText?.visible) return;
  if (Math.abs((Number(node.labelText.alpha) || 0) - target.alpha) > 0.001) {
    motion(node.labelText)
      .duration(DRAG_PREVIEW_LABEL_RESTORE_DURATION)
      .ease("power2.out")
      .overlay()
      .interrupt("retarget")
      .to({ alpha: target.alpha })
      .start();
  }
  if (Math.abs((Number(node.labelText.scale?.x) || 1) - target.scale) > 0.001) {
    motion(node.labelText.scale)
      .duration(DRAG_PREVIEW_LABEL_RESTORE_DURATION)
      .ease("power2.out")
      .overlay()
      .interrupt("retarget")
      .to({ x: target.scale, y: target.scale })
      .start();
  }
}

function numbersClose(a, b, epsilon) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= epsilon;
}

function releaseMotionsVisuallyEquivalent(previous, next) {
  if (!previous || !next) return false;
  if (previous.releaseMode !== next.releaseMode) return false;
  if (previous.textless !== next.textless) return false;
  if (previous.singleLineLabel !== next.singleLineLabel) return false;
  if (!numbersClose(previous.target?.x, next.target?.x, DRAG_RELEASE_EQUIVALENT_FINAL_DELTA)) return false;
  if (!numbersClose(previous.target?.y, next.target?.y, DRAG_RELEASE_EQUIVALENT_FINAL_DELTA)) return false;
  if (!numbersClose(previous.targetScale, next.targetScale, DRAG_RELEASE_EQUIVALENT_FINAL_SCALE_DELTA)) return false;
  if (!numbersClose(previous.iconSize, next.iconSize, DRAG_RELEASE_EQUIVALENT_FINAL_DELTA)) return false;
  if (!numbersClose(previous.cellWidth, next.cellWidth, DRAG_RELEASE_EQUIVALENT_FINAL_DELTA)) return false;
  if (!numbersClose(previous.cellHeight, next.cellHeight, DRAG_RELEASE_EQUIVALENT_FINAL_DELTA)) return false;
  if (!numbersClose(previous.targetAlpha, next.targetAlpha, 0.001)) return false;
  if (!numbersClose(previous.targetLabelAlpha, next.targetLabelAlpha, 0.001)) return false;
  return numbersClose(previous.targetLabelScale, next.targetLabelScale, DRAG_RELEASE_EQUIVALENT_FINAL_SCALE_DELTA);
}

function canReuseFinalizedReleaseMotion(previousContext, nextMotion, nextMotionKey, controlKey) {
  const previousMotion = previousContext?.releaseMotion;
  if (!previousMotion?.provisionalLayoutTarget || nextMotion?.provisionalLayoutTarget) return false;
  if (!previousContext?.motionKey || controlKey !== previousContext.motionKey) return false;
  if (!nextMotionKey) return false;
  return releaseMotionsVisuallyEquivalent(previousMotion, nextMotion);
}

export class DragPreviewLayer extends Container {
  constructor(options = {}) {
    super();
    this.onReleaseComplete = options.onReleaseComplete || (() => {});
    this.previewNode = new IconNode({ onAction: () => {} });
    this.previewNode.eventMode = "none";
    this.addChild(this.previewNode);
    this.previewLabelStateKey = null;
    this.previewKey = null;
    this.previewScaleKey = null;
    this.releaseKey = null;
    this.releaseMotionKey = null;
    this.releaseMotionControl = null;
    this.releaseMotionControlKey = null;
    this.releaseCompletionContext = null;
    this.releaseCompleteKey = null;
    this.visible = false;
  }

  update(state) {
    if (state.releaseState?.item) {
      this.updateRelease(state);
      return;
    }

    const preview = state.previewState;
    if (!preview?.item) {
      this.previewKey = null;
      this.previewLabelStateKey = null;
      this.previewScaleKey = null;
      this.releaseKey = null;
      this.releaseMotionKey = null;
      this.releaseMotionControl = null;
      this.releaseMotionControlKey = null;
      this.releaseCompletionContext = null;
      this.releaseCompleteKey = null;
      killMotionOf(this.previewNode, null, { reason: DRAG_PREVIEW_CLEAR_REASON });
      stopPreviewScaleMotion(this.previewNode, { reason: DRAG_PREVIEW_CLEAR_REASON });
      snapPreviewLabel(this.previewNode, { alpha: 1, scale: 1 });
      this.visible = false;
      this.previewNode.visible = false;
      return;
    }

    const layout = getDragPreviewLayout(preview, state);
    const isNewPreview = this.previewKey !== layout.key || !this.previewNode.visible;

    this.previewKey = layout.key;
    this.releaseKey = null;
    this.releaseMotionKey = null;
    this.releaseMotionControl = null;
    this.releaseMotionControlKey = null;
    this.releaseCompletionContext = null;
    this.releaseCompleteKey = null;
    this.visible = true;
    this.previewNode.stageRect = layout.stageRect;
    this.previewNode.setState({
      cellHeight: layout.cellHeight,
      cellWidth: layout.cellWidth,
      compact: layout.compact,
      draggable: false,
      dropTarget: false,
      editing: false,
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: false,
      iconSize: layout.iconSize,
      interactive: false,
      item: preview.item,
      launchTargetStatus: preview.item.type === "app" && state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[preview.item.id] || null
        : null,
      opening: false,
      preserveNodeScale: true,
      removable: false,
      selected: false,
      singleLineLabel: layout.singleLineLabel,
      source: preview.source,
      stageHeight: state.height,
      stageWidth: state.width,
      textless: layout.textless,
    });
    this.updatePreviewLabelState(state, { immediate: isNewPreview });
    describeDragPreviewTargets(this.previewNode, preview, "preview");
    this.previewNode.position.set(layout.position.x, layout.position.y);
    this.previewNode.rotation = DRAG_PREVIEW_ROTATION;
    if (isNewPreview) {
      stopPreviewScaleMotion(this.previewNode, { reason: DRAG_PREVIEW_REPLACE_REASON });
      this.previewNode.scale.set(1);
      springPreviewScale(this.previewNode, layout.targetScale);
    } else if (this.previewScaleKey !== layout.scaleKey) {
      springPreviewScale(this.previewNode, layout.targetScale);
    }
    this.previewScaleKey = layout.scaleKey;
    this.previewNode.eventMode = "none";
  }

  updatePreviewLabelState(state, options = {}) {
    const target = getPreviewLabelTarget(state.folderHoverState);
    const label = this.previewNode?.labelText;
    const nextKey = `${target.key}:${label?.visible === false ? "label-hidden" : "label-visible"}`;
    const isAtTarget = label
      ? Math.abs((Number(label.alpha) || 0) - target.alpha) <= 0.001 &&
        Math.abs((Number(label.scale?.x) || 1) - target.scale) <= 0.001
      : true;
    const shouldSnap = options.immediate || target.alpha === 0;
    if (this.previewLabelStateKey === nextKey && isAtTarget) return;
    if (this.previewLabelStateKey === nextKey && !shouldSnap) return;
    this.previewLabelStateKey = nextKey;
    if (shouldSnap) snapPreviewLabel(this.previewNode, target);
    else tweenPreviewLabel(this.previewNode, target);
  }

  completeActiveReleaseIfReady() {
    const context = this.releaseCompletionContext;
    if (!context) return;
    const { motionKey, release, releaseKey, releaseMotion } = context;
    if (!releaseKey || this.releaseCompleteKey === releaseKey) return;
    if (this.releaseMotionKey !== motionKey || this.releaseMotionControlKey !== motionKey) return;
    if (!releaseMotion?.hasTargetRect || releaseMotion.provisionalLayoutTarget) return;
    if (this.releaseMotionControl && !this.releaseMotionControl.completed) return;
    this.releaseCompleteKey = releaseKey;
    this.onReleaseComplete(release);
  }

  updateRelease(state) {
    const release = state.releaseState;
    const releaseMotion = getDragReleaseMotion(release, state);
    const releaseKey = release?.key || releaseMotion.releaseKey || releaseMotion.key;
    const releaseMotionKey = releaseMotion.motionKey || releaseMotion.key;
    const isNewRelease = this.releaseKey !== releaseKey;
    const isNewMotion = this.releaseMotionKey !== releaseMotionKey;
    const previousCompletionContext = this.releaseCompletionContext;
    const shouldReuseFinalizedMotion = Boolean(
      !isNewRelease &&
      isNewMotion &&
      canReuseFinalizedReleaseMotion(
        previousCompletionContext,
        releaseMotion,
        releaseMotionKey,
        this.releaseMotionControlKey
      )
    );
    const hasExplicitStartPose = Boolean(releaseMotion.startPose);
    const renderedPreviewScale = isNewRelease && this.previewNode.visible
      ? {
        scaleX: Math.max(0.01, Number(this.previewNode.scale?.x) || DRAG_PREVIEW_SCALE),
        scaleY: Math.max(0.01, Number(this.previewNode.scale?.y) || DRAG_PREVIEW_SCALE),
      }
      : null;
    const canPreservePreviewPose = Boolean(
      !hasExplicitStartPose &&
      isNewRelease &&
      this.previewKey &&
      this.previewNode.visible &&
      this.previewNode.state?.item?.id === release?.item?.id
    );
    const preservedPreviewPose = canPreservePreviewPose
      ? {
        ...renderedPreviewScale,
        x: Number(this.previewNode.x) || 0,
        y: Number(this.previewNode.y) || 0,
      }
      : null;

    if (isNewRelease) {
      killMotionOf(this.previewNode, null, { reason: DRAG_RELEASE_START_REASON });
      stopPreviewScaleMotion(this.previewNode, { reason: DRAG_RELEASE_START_REASON });
      this.releaseMotionControl = null;
      this.releaseMotionControlKey = null;
      this.releaseCompletionContext = null;
    }

    // Folder row-count resizes often finish with a sub-pixel stable target after
    // the provisional ghost has already arrived. Reusing that motion avoids a
    // tiny final label/icon rerender that reads as a twitch.
    if (shouldReuseFinalizedMotion) {
      this.visible = true;
      this.previewNode.visible = true;
      this.previewNode.eventMode = "none";
      this.releaseKey = releaseKey;
      this.releaseMotionKey = releaseMotionKey;
      this.releaseMotionControlKey = releaseMotionKey;
      this.releaseCompletionContext = {
        motionKey: releaseMotionKey,
        release,
        releaseKey,
        releaseMotion,
      };
      this.completeActiveReleaseIfReady();
      return;
    }

    const previousIconSize = Math.max(0.01, Number(this.previewNode.state?.iconSize) || releaseMotion.iconSize || 1);
    this.visible = true;
    this.previewNode.visible = true;
    this.previewNode.eventMode = "none";
    this.previewNode.stageRect = releaseMotion.stageRect;
    const animatedAlpha = isNewRelease ? null : this.previewNode.alpha;
    this.previewNode.setState({
      cellHeight: releaseMotion.cellHeight,
      cellWidth: releaseMotion.cellWidth,
      compact: releaseMotion.compact,
      draggable: false,
      dropTarget: false,
      editing: false,
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: false,
      iconSize: releaseMotion.iconSize,
      interactive: false,
      item: release.item,
      launchTargetStatus: release.item.type === "app" && state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[release.item.id] || null
        : null,
      opening: false,
      preserveNodeScale: true,
      removable: false,
      selected: false,
      singleLineLabel: releaseMotion.singleLineLabel,
      source: release.source,
      stageHeight: state.height,
      stageWidth: state.width,
      textless: releaseMotion.textless,
    });
    // During a release, the motion layer owns alpha. IconNode.setState() applies
    // its normal scene alpha and must not revive a ghost that already faded out.
    if (animatedAlpha !== null) this.previewNode.alpha = animatedAlpha;
    describeDragPreviewTargets(this.previewNode, release, "release");
    this.previewNode.rotation = 0;

    this.releaseKey = releaseKey;
    this.releaseMotionKey = releaseMotionKey;
    this.releaseCompletionContext = {
      motionKey: releaseMotionKey,
      release,
      releaseKey,
      releaseMotion,
    };
    if (isNewRelease) {
      this.releaseCompleteKey = null;
      this.previewKey = null;
      this.previewScaleKey = null;
      this.previewLabelStateKey = null;
      const startScaleMultiplier = Number(releaseMotion.startScaleMultiplier) || 1;
      const currentScale = preservedPreviewPose?.scaleX ??
        renderedPreviewScale?.scaleX ??
        Math.max(0.01, Number(this.previewNode.scale?.x) || DRAG_PREVIEW_SCALE);
      const currentScaleY = preservedPreviewPose?.scaleY ??
        renderedPreviewScale?.scaleY ??
        Math.max(0.01, Number(this.previewNode.scale?.y) || currentScale);
      const startScale = Math.max(0.01, currentScale * startScaleMultiplier);
      const startScaleY = Math.max(0.01, currentScaleY * startScaleMultiplier);
      if (!canPreservePreviewPose) {
        const startPosition = releaseMotion.startIconCenter
          ? {
            x: releaseMotion.startIconCenter.x,
            y: releaseMotion.startIconCenter.y - releaseMotion.visualOffsetY * startScale,
          }
          : releaseMotion.start;
        this.previewNode.position.set(startPosition.x, startPosition.y);
      } else {
        this.previewNode.position.set(preservedPreviewPose.x, preservedPreviewPose.y);
      }
      this.previewNode.scale.set(startScale, startScaleY);
      this.previewNode.alpha = 1;
      if (this.previewNode.labelText) {
        const startLabelTarget = releaseMotion.targetLabelAlpha <= 0.001
          ? { alpha: 0, scale: releaseMotion.targetLabelScale }
          : { alpha: 1, scale: 1 };
        snapPreviewLabel(this.previewNode, startLabelTarget);
      }
    } else if (isNewMotion && Math.abs(previousIconSize - releaseMotion.iconSize) > 0.0001) {
      const scaleMultiplier = previousIconSize / Math.max(0.01, releaseMotion.iconSize);
      this.previewNode.scale.set(
        Math.max(0.01, this.previewNode.scale.x * scaleMultiplier),
        Math.max(0.01, this.previewNode.scale.y * scaleMultiplier)
      );
    }
    if (!isNewMotion) {
      this.completeActiveReleaseIfReady();
      return;
    }
    if (!releaseMotion.hasTargetRect) {
      this.releaseMotionControl = null;
      this.releaseMotionControlKey = releaseMotionKey;
      return;
    }
    const duration = Math.max(0.01, Number(release.duration) || 0.18);
    const isCenterAbsorb = releaseMotion.releaseMode === DRAG_RELEASE_MODE_FOLDER_CENTER_ABSORB;
    // Center absorption ends at a hidden point, so a finite tween gives it a
    // deterministic handoff instead of waiting for an invisible spring tail.
    const releaseAnimations = isCenterAbsorb
      ? [
        motion(this.previewNode)
          .duration(DRAG_RELEASE_CENTER_ABSORB_DURATION)
          .ease("power2.in")
          .handoff()
          .interrupt("retarget")
          .to({ x: releaseMotion.target.x, y: releaseMotion.target.y }),
        motion(this.previewNode.scale)
          .duration(DRAG_RELEASE_CENTER_ABSORB_DURATION)
          .ease("power2.in")
          .handoff()
          .interrupt("retarget")
          .to({ x: releaseMotion.targetScale, y: releaseMotion.targetScale }),
      ]
      : [
        motion(this.previewNode)
          .preset("handoff")
          .drag()
          .interrupt("retarget")
          .to({
            velocity: releaseMotion.velocity,
            x: releaseMotion.target.x,
            y: releaseMotion.target.y,
          }),
        motion(this.previewNode.scale)
          .preset("handoff")
          .drag()
          .interrupt("retarget")
          .to({ x: releaseMotion.targetScale, y: releaseMotion.targetScale }),
      ];
    if (releaseMotion.targetAlpha !== this.previewNode.alpha) {
      releaseAnimations.push(
        motion(this.previewNode)
          .delay(isCenterAbsorb ? DRAG_RELEASE_CENTER_ABSORB_FADE_DELAY : 0)
          .duration(isCenterAbsorb ? DRAG_RELEASE_CENTER_ABSORB_FADE_DURATION : duration)
          .ease(isCenterAbsorb ? "power2.in" : "power2.out")
          .handoff()
          .interrupt("retarget")
          .to({ alpha: releaseMotion.targetAlpha })
      );
    }
    if (this.previewNode.labelText?.visible) {
      if (releaseMotion.targetLabelAlpha !== this.previewNode.labelText.alpha) {
        releaseAnimations.push(
          motion(this.previewNode.labelText)
            .duration(Math.min(duration, 0.14))
            .ease("power2.out")
            .overlay()
            .interrupt("retarget")
            .to({ alpha: releaseMotion.targetLabelAlpha })
        );
      }
      if (releaseMotion.targetLabelScale !== this.previewNode.labelText.scale.x) {
        releaseAnimations.push(
          motion(this.previewNode.labelText.scale)
            .duration(Math.min(duration, 0.14))
            .ease("power2.out")
            .overlay()
            .interrupt("retarget")
            .to({ x: releaseMotion.targetLabelScale, y: releaseMotion.targetLabelScale })
        );
      }
    }
    this.releaseMotionControlKey = releaseMotionKey;
    this.releaseMotionControl = parallel(releaseAnimations, {
      onComplete: () => this.completeActiveReleaseIfReady(),
    });
    this.completeActiveReleaseIfReady();
  }

  destroy(options) {
    killMotionOf(this.previewNode, null, { reason: "destroyed" });
    stopPreviewScaleMotion(this.previewNode, { reason: "destroyed" });
    this.releaseMotionControl = null;
    this.releaseMotionControlKey = null;
    this.releaseCompletionContext = null;
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
