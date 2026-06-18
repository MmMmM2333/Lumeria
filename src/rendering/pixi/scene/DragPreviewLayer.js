import { Container } from "pixi.js";
import { gsap } from "gsap";
import { IconNode } from "../nodes/IconNode.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { panelSpring, springTo, stopTargetSprings } from "../animation/springMotion.js";
import {
  DRAG_PREVIEW_SCALE,
  getDragPreviewLayout,
  getDragReleaseMotion,
} from "./dragPreviewMotion.js";

const DRAG_PREVIEW_ROTATION = 0;
const DRAG_RELEASE_DURATION = 0.18;

function stopPreviewScaleMotion(node) {
  gsap.killTweensOf(node.scale);
  stopTargetSprings(node.scale);
}

function springPreviewScale(node, scale) {
  springTo(node.scale, "x", scale, panelSpring);
  springTo(node.scale, "y", scale, panelSpring);
}

export class DragPreviewLayer extends Container {
  constructor() {
    super();
    this.previewNode = new IconNode({ onAction: () => {} });
    this.previewNode.eventMode = "none";
    this.addChild(this.previewNode);
    this.previewKey = null;
    this.previewScaleKey = null;
    this.releaseKey = null;
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
      gsap.killTweensOf(this.previewNode);
      stopTargetSprings(this.previewNode);
      stopPreviewScaleMotion(this.previewNode);
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
      stopPreviewScaleMotion(this.previewNode);
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

    if (this.releaseKey === motion.key) return;
    this.releaseKey = motion.key;
    this.previewKey = null;
    this.previewScaleKey = null;
    gsap.killTweensOf(this.previewNode);
    stopTargetSprings(this.previewNode);
    stopPreviewScaleMotion(this.previewNode);
    this.previewNode.alpha = 1;
    this.previewNode.position.set(motion.start.x, motion.start.y);
    this.previewNode.scale.set(DRAG_PREVIEW_SCALE);
    if (!motion.hasTargetRect) return;
    gsap.to(this.previewNode, {
      duration: release.duration || DRAG_RELEASE_DURATION,
      ease: "power3.out",
      overwrite: "auto",
      x: motion.target.x,
      y: motion.target.y,
    });
    gsap.to(this.previewNode.scale, {
      duration: release.duration || DRAG_RELEASE_DURATION,
      ease: "power3.out",
      overwrite: "auto",
      x: motion.targetScale,
      y: motion.targetScale,
    });
  }

  destroy(options) {
    gsap.killTweensOf(this.previewNode);
    stopTargetSprings(this.previewNode);
    stopPreviewScaleMotion(this.previewNode);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
