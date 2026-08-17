import { stageLayoutRectToClientRect } from "../geometry/stageCoordinates.js";
import { mapDisplayObjectLocalRectToStageRect } from "../geometry/displayObjectBounds.js";

export function makeIconRect(centerX, centerY, size) {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

export function makeTargetIconBounds(stageRect, stageWidth, stageHeight, centerX, centerY, size, visualOffsetY = 0) {
  return stageLayoutRectToClientRect(
    stageRect,
    stageWidth,
    stageHeight,
    makeIconRect(centerX, centerY + (Number(visualOffsetY) || 0), size)
  );
}

export function makeContainerTargetIconBounds(container, stageRect, stageWidth, stageHeight, centerX, centerY, size, visualOffsetY = 0) {
  const rect = makeIconRect(centerX, centerY + (Number(visualOffsetY) || 0), size);
  return mapDisplayObjectLocalRectToStageRect({
    node: container,
    rect,
    stageHeight,
    stageRect,
    stageWidth,
  }) || stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, rect);
}

export function makeSyntheticPointerEvent(original, node) {
  const native = original?.nativeEvent || original || {};
  const bounds = node.getIconBounds(node.stageRect || { left: 0, top: 0 });
  const folderOriginBounds = makeFolderOriginBounds(node, bounds);
  const nodeState = node?.state || {};
  return {
    button: native.button ?? 0,
    buttons: native.buttons ?? 1,
    clientX: native.clientX ?? 0,
    clientY: native.clientY ?? 0,
    currentTarget: {
      getBoundingClientRect: () => bounds,
    },
    dragVisualState: {
      cellHeight: nodeState.cellHeight,
      cellWidth: nodeState.cellWidth,
      compact: nodeState.compact === true,
      iconSize: nodeState.iconSize,
      singleLineLabel: nodeState.singleLineLabel === true,
    },
    folderOriginBounds,
    isPrimary: native.isPrimary ?? null,
    pointerId: native.pointerId,
    pointerType: native.pointerType || null,
    preventDefault: () => native.preventDefault?.(),
    stopPropagation: () => native.stopPropagation?.(),
    target: native.target,
    type: native.type || "pointerdown",
  };
}

function makeFolderOriginBounds(node, iconRect) {
  if (node?.item?.type !== "folder") return null;
  const stageRect = node.stageRect || { left: 0, top: 0 };
  const previewChildRects = [];
  for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
    const child = node.item.childPages?.[0]?.[slotIndex] || null;
    if (!child?.id) continue;
    const rect = node.getFolderPreviewChildBounds(stageRect, slotIndex);
    if (rect) previewChildRects.push({ childId: child.id, rect, slotIndex });
  }
  return {
    folderId: node.item.id,
    iconRect,
    previewChildRects,
    thumbRect: node.getFolderThumbBounds(stageRect) || iconRect,
  };
}
