import { Container } from "pixi.js";
import { IconNode } from "../nodes/IconNode.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import {
  DRAG_PREVIEW_SCALE,
  getDragPreviewLayout,
  getDragReleaseMotion,
} from "./dragPreviewMotion.js";

const DRAG_PREVIEW_ROTATION = 0;
const DRAG_PREVIEW_CLEAR_REASON = "drag-preview-clear";
const DRAG_PREVIEW_REPLACE_REASON = "drag-preview-replace";
const DRAG_RELEASE_START_REASON = "drag-release-start";

function stopPreviewScaleMotion(node, options = {}) {
  killMotionOf(node.scale, null, { reason: options.reason });
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

export class DragPreviewLayer extends Container {
  constructor(options = {}) {
    super();
    this.onReleaseComplete = options.onReleaseComplete || (() => {});
    this.previewNode = new IconNode({ onAction: () => {} });
    this.previewNode.eventMode = "none";
    this.addChild(this.previewNode);
    this.previewKey = null;
    this.previewScaleKey = null;
    this.releaseKey = null;
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
      this.previewScaleKey = null;
      this.releaseKey = null;
      this.releaseCompleteKey = null;
      killMotionOf(this.previewNode, null, { reason: DRAG_PREVIEW_CLEAR_REASON });
      stopPreviewScaleMotion(this.previewNode, { reason: DRAG_PREVIEW_CLEAR_REASON });
      this.visible = false;
      this.previewNode.visible = false;
      return;
    }

    const layout = getDragPreviewLayout(preview, state);
    const isNewPreview = this.previewKey !== layout.key || !this.previewNode.visible;

    this.previewKey = layout.key;
    this.releaseKey = null;
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
    if (this.previewNode.labelText) {
      this.previewNode.labelText.alpha = 1;
      this.previewNode.labelText.scale.set(1);
    }
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

  updateRelease(state) {
    const release = state.releaseState;
    const releaseMotion = getDragReleaseMotion(release, state);
    const isNewRelease = this.releaseKey !== releaseMotion.key;

    if (isNewRelease) {
      killMotionOf(this.previewNode, null, { reason: DRAG_RELEASE_START_REASON });
      stopPreviewScaleMotion(this.previewNode, { reason: DRAG_RELEASE_START_REASON });
    }

    this.visible = true;
    this.previewNode.visible = true;
    this.previewNode.eventMode = "none";
    this.previewNode.stageRect = releaseMotion.stageRect;
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
    describeDragPreviewTargets(this.previewNode, release, "release");
    this.previewNode.rotation = 0;

    if (!isNewRelease) return;
    this.releaseKey = releaseMotion.key;
    this.releaseCompleteKey = null;
    this.previewKey = null;
    this.previewScaleKey = null;
    this.previewNode.position.set(releaseMotion.start.x, releaseMotion.start.y);
    const currentScale = Math.max(0.01, Number(this.previewNode.scale?.x) || DRAG_PREVIEW_SCALE);
    this.previewNode.scale.set(currentScale);
    this.previewNode.alpha = 1;
    if (this.previewNode.labelText) {
      this.previewNode.labelText.alpha = 1;
      this.previewNode.labelText.scale.set(1);
    }
    if (!releaseMotion.hasTargetRect) return;
    const completeRelease = () => {
      if (this.releaseCompleteKey === releaseMotion.key || this.releaseKey !== releaseMotion.key) return;
      this.releaseCompleteKey = releaseMotion.key;
      this.onReleaseComplete(release);
    };
    const duration = Math.max(0.01, Number(release.duration) || 0.18);
    const releaseAnimations = [
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
          .duration(duration)
          .ease("power2.out")
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
    parallel(releaseAnimations, { onComplete: completeRelease });
  }

  destroy(options) {
    killMotionOf(this.previewNode, null, { reason: "destroyed" });
    stopPreviewScaleMotion(this.previewNode, { reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
