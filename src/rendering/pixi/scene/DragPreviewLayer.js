import { Container } from "pixi.js";
import { gsap } from "gsap";
import { IconNode } from "../nodes/IconNode.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const DRAG_PREVIEW_ROTATION = 0;
const DRAG_PREVIEW_SCALE = 1.12;
const DRAG_PREVIEW_LIFT_DURATION = 0.16;
const DRAG_RELEASE_DURATION = 0.18;

function getVisualOffsetY(textless) {
  return textless ? 0 : -14;
}

export class DragPreviewLayer extends Container {
  constructor() {
    super();
    this.previewNode = new IconNode({ onAction: () => {} });
    this.previewNode.eventMode = "none";
    this.addChild(this.previewNode);
    this.previewKey = null;
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
      this.releaseKey = null;
      gsap.killTweensOf(this.previewNode);
      gsap.killTweensOf(this.previewNode.scale);
      this.visible = false;
      this.previewNode.visible = false;
      return;
    }

    const iconSize = Math.max(1, Number(preview.size?.width) || Number(state.iconSize) || 64);
    const cellWidth = Math.max(iconSize, Number(preview.cellSize?.width) || iconSize);
    const cellHeight = Math.max(iconSize, Number(preview.cellSize?.height) || iconSize);
    const offset = preview.offset || { x: iconSize / 2, y: iconSize / 2 };
    const pointer = preview.pointer || { x: 0, y: 0 };
    const stageRect = state.stageRect || { left: 0, top: 0 };
    const nextKey = makePreviewKey(preview);
    const isNewPreview = this.previewKey !== nextKey || !this.previewNode.visible;
    const visualLeft = pointer.x - stageRect.left - offset.x;
    const visualTop = pointer.y - stageRect.top - offset.y;

    this.previewKey = nextKey;
    this.releaseKey = null;
    this.visible = true;
    this.previewNode.stageRect = stageRect;
    this.previewNode.setState({
      cellHeight,
      cellWidth,
      compact: false,
      draggable: false,
      dropTarget: false,
      editing: false,
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: false,
      iconSize,
      interactive: false,
      item: preview.item,
      launchTargetStatus: preview.item.type === "app" && state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[preview.item.id] || null
        : null,
      opening: false,
      removable: false,
      selected: false,
      source: preview.source,
      stageHeight: state.height,
      stageWidth: state.width,
      textless: state.isTextlessMode,
    });
    this.previewNode.position.set(
      visualLeft + iconSize / 2,
      visualTop + iconSize / 2 - getVisualOffsetY(state.isTextlessMode)
    );
    this.previewNode.rotation = DRAG_PREVIEW_ROTATION;
    if (isNewPreview) {
      gsap.killTweensOf(this.previewNode.scale);
      this.previewNode.scale.set(1);
      gsap.to(this.previewNode.scale, {
        duration: DRAG_PREVIEW_LIFT_DURATION,
        ease: "power3.out",
        overwrite: "auto",
        x: DRAG_PREVIEW_SCALE,
        y: DRAG_PREVIEW_SCALE,
      });
    }
    this.previewNode.eventMode = "none";
  }

  updateRelease(state) {
    const release = state.releaseState;
    const iconSize = Math.max(1, Number(release.size?.width) || Number(state.iconSize) || 64);
    const cellWidth = Math.max(iconSize, Number(release.cellSize?.width) || iconSize);
    const cellHeight = Math.max(iconSize, Number(release.cellSize?.height) || iconSize);
    const offset = release.offset || { x: iconSize / 2, y: iconSize / 2 };
    const pointer = release.pointer || { x: 0, y: 0 };
    const stageRect = state.stageRect || { left: 0, top: 0 };
    const targetRect = release.targetRect;
    const hasTargetRect = Boolean(targetRect?.width && targetRect?.height);
    const nextKey = `${release.key || makePreviewKey(release)}:${release.targetVersion ?? 0}:${hasTargetRect ? "target" : "pending"}`;
    const textless = Boolean(release.textless ?? state.isTextlessMode);
    const visualOffsetY = getVisualOffsetY(textless);
    const visualLeft = pointer.x - stageRect.left - offset.x;
    const visualTop = pointer.y - stageRect.top - offset.y;
    const targetScale = hasTargetRect ? Math.max(0.1, targetRect.width / iconSize) : 1;
    const targetX = hasTargetRect
      ? targetRect.left - stageRect.left + targetRect.width / 2
      : visualLeft + iconSize / 2;
    const targetY = hasTargetRect
      ? targetRect.top - stageRect.top + targetRect.height / 2 - visualOffsetY
      : visualTop + iconSize / 2 - visualOffsetY;

    this.visible = true;
    this.previewNode.visible = true;
    this.previewNode.eventMode = "none";
    this.previewNode.stageRect = stageRect;
    this.previewNode.setState({
      cellHeight,
      cellWidth,
      compact: false,
      draggable: false,
      dropTarget: false,
      editing: false,
      folderPreviewPageSize: state.folderPageSize,
      ghosted: false,
      hasCustomIcon: false,
      iconSize,
      interactive: false,
      item: release.item,
      launchTargetStatus: release.item.type === "app" && state.showMissingLaunchTargetBadge
        ? state.launchTargetStatusById?.[release.item.id] || null
        : null,
      opening: false,
      removable: false,
      selected: false,
      source: release.source,
      stageHeight: state.height,
      stageWidth: state.width,
      textless,
    });
    this.previewNode.rotation = 0;

    if (this.releaseKey === nextKey) return;
    this.releaseKey = nextKey;
    this.previewKey = null;
    gsap.killTweensOf(this.previewNode);
    gsap.killTweensOf(this.previewNode.scale);
    this.previewNode.alpha = 1;
    this.previewNode.position.set(
      visualLeft + iconSize / 2,
      visualTop + iconSize / 2 - visualOffsetY
    );
    this.previewNode.scale.set(DRAG_PREVIEW_SCALE);
    if (!hasTargetRect) return;
    gsap.to(this.previewNode, {
      duration: release.duration || DRAG_RELEASE_DURATION,
      ease: "power3.out",
      overwrite: "auto",
      x: targetX,
      y: targetY,
    });
    gsap.to(this.previewNode.scale, {
      duration: release.duration || DRAG_RELEASE_DURATION,
      ease: "power3.out",
      overwrite: "auto",
      x: targetScale,
      y: targetScale,
    });
  }

  destroy(options) {
    gsap.killTweensOf(this.previewNode);
    gsap.killTweensOf(this.previewNode.scale);
    super.destroy(options);
  }
}

function makePreviewKey(preview) {
  return [
    preview?.item?.id || "",
    preview?.source?.type || "",
    preview?.source?.folderId || "",
    preview?.source?.pageIndex ?? "",
    preview?.source?.index ?? "",
  ].join(":");
}

reloadOnPixiHotUpdate(import.meta.hot);
