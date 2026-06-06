import { Container } from "pixi.js";
import { IconNode } from "../nodes/IconNode.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const DRAG_PREVIEW_ROTATION = -5 * (Math.PI / 180);
const DRAG_PREVIEW_SCALE = 1.12;

function getVisualOffsetY(textless) {
  return textless ? 0 : -14;
}

export class DragPreviewLayer extends Container {
  constructor() {
    super();
    this.previewNode = new IconNode({ onAction: () => {} });
    this.previewNode.eventMode = "none";
    this.addChild(this.previewNode);
    this.visible = false;
  }

  update(state) {
    const preview = state.previewState;
    if (!preview?.item) {
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
    const visualLeft = pointer.x - stageRect.left - offset.x;
    const visualTop = pointer.y - stageRect.top - offset.y;

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
    this.previewNode.scale.set(DRAG_PREVIEW_SCALE);
    this.previewNode.eventMode = "none";
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
