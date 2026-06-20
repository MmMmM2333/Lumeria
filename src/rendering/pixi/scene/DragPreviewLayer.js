import { Container } from "pixi.js";
import { IconNode } from "../nodes/IconNode.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killMotionOf, transition } from "../animation/motionTween.js";
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
  transition(node.scale)
    .preset("handoff")
    .drag()
    .interrupt("retarget")
    .to({ x: scale, y: scale })
    .start();
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
      compact: false,
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
      source: preview.source,
      stageHeight: state.height,
      stageWidth: state.width,
      textless: layout.textless,
    });
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
    const motion = getDragReleaseMotion(release, state);
    const isNewRelease = this.releaseKey !== motion.key;

    if (isNewRelease) {
      killMotionOf(this.previewNode, null, { reason: DRAG_RELEASE_START_REASON });
      stopPreviewScaleMotion(this.previewNode, { reason: DRAG_RELEASE_START_REASON });
    }

    this.visible = true;
    this.previewNode.visible = true;
    this.previewNode.eventMode = "none";
    this.previewNode.stageRect = motion.stageRect;
    this.previewNode.setState({
      cellHeight: motion.cellHeight,
      cellWidth: motion.cellWidth,
      compact: false,
      draggable: false,
      dropTarget: false,
      editing: false,
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: false,
      iconSize: motion.iconSize,
      interactive: false,
      item: release.item,
      launchTargetStatus: release.item.type === "app" && state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[release.item.id] || null
        : null,
      opening: false,
      preserveNodeScale: true,
      removable: false,
      selected: false,
      source: release.source,
      stageHeight: state.height,
      stageWidth: state.width,
      textless: motion.textless,
    });
    this.previewNode.rotation = 0;

    if (!isNewRelease) return;
    this.releaseKey = motion.key;
    this.releaseCompleteKey = null;
    this.previewKey = null;
    this.previewScaleKey = null;
    this.previewNode.alpha = 1;
    this.previewNode.position.set(motion.start.x, motion.start.y);
    this.previewNode.scale.set(DRAG_PREVIEW_SCALE);
    if (!motion.hasTargetRect) return;
    const completeRelease = () => {
      if (this.releaseCompleteKey === motion.key || this.releaseKey !== motion.key) return;
      this.releaseCompleteKey = motion.key;
      this.onReleaseComplete(release);
    };
    transition(this.previewNode)
      .preset("handoff")
      .drag()
      .interrupt("retarget")
      .to({
        onComplete: completeRelease,
        velocity: motion.velocity,
        x: motion.target.x,
        y: motion.target.y,
      })
      .start();
    springPreviewScale(this.previewNode, motion.targetScale);
  }

  destroy(options) {
    killMotionOf(this.previewNode, null, { reason: "destroyed" });
    stopPreviewScaleMotion(this.previewNode, { reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
