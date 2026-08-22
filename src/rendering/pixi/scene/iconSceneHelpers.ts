import { stageLayoutRectToClientRect } from "../geometry/stageCoordinates.js";
import { mapDisplayObjectLocalRectToStageRect } from "../geometry/displayObjectBounds.js";
import type { StageOrigin, StagePoint, StageRect, StageVisualRect } from "../geometry/stageCoordinates.js";

interface TransformMatrixLike {
  apply(point: StagePoint): StagePoint;
}

interface TransformContainerLike {
  getGlobalPosition?: () => StagePoint;
  getGlobalTransform?: () => TransformMatrixLike | null;
}

interface NativePointerLike {
  button?: number;
  buttons?: number;
  clientX?: number;
  clientY?: number;
  isPrimary?: boolean | null;
  nativeEvent?: NativePointerLike | null;
  pointerId?: number;
  pointerType?: string | null;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  target?: unknown;
  type?: string;
}

interface IconSceneItemChild {
  id?: string | null;
}

interface IconSceneItem {
  childPages?: readonly (readonly (IconSceneItemChild | null | undefined)[])[];
  id: string;
  type: string;
}

interface IconSceneNode {
  getFolderPreviewChildBounds?: (stageRect: StageOrigin, slotIndex: number) => StageRect | null;
  getFolderThumbBounds?: (stageRect: StageOrigin) => StageRect | null;
  getIconBounds: (stageRect: StageOrigin) => StageRect;
  item?: IconSceneItem | null;
  stageRect?: StageOrigin | null;
  state?: {
    cellHeight?: number;
    cellWidth?: number;
    compact?: boolean;
    iconSize?: number;
    singleLineLabel?: boolean;
  } | null;
}

interface FolderOriginBounds {
  folderId: string;
  iconRect: StageRect;
  previewChildRects: Array<{ childId: string; rect: StageRect; slotIndex: number }>;
  thumbRect: StageRect;
}

export interface SyntheticPointerEvent {
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  currentTarget: { getBoundingClientRect: () => StageRect };
  dragVisualState: {
    cellHeight: number | undefined;
    cellWidth: number | undefined;
    compact: boolean;
    iconSize: number | undefined;
    singleLineLabel: boolean;
  };
  folderOriginBounds: FolderOriginBounds | null;
  isPrimary: boolean | null;
  pointerId: number | undefined;
  pointerType: string | null;
  preventDefault: () => void;
  stopPropagation: () => void;
  target: unknown;
  type: string;
}

export function makeIconRect(centerX: number, centerY: number, size: number): StageRect {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

export function makeTargetIconBounds(
  stageRect: StageRect,
  stageWidth: number,
  stageHeight: number,
  centerX: number,
  centerY: number,
  size: number,
  visualOffsetY = 0
): StageVisualRect {
  return stageLayoutRectToClientRect(
    stageRect,
    stageWidth,
    stageHeight,
    makeIconRect(centerX, centerY + (Number(visualOffsetY) || 0), size)
  );
}

export function makeContainerTargetIconBounds(
  container: TransformContainerLike,
  stageRect: StageRect,
  stageWidth: number,
  stageHeight: number,
  centerX: number,
  centerY: number,
  size: number,
  visualOffsetY = 0
): StageVisualRect {
  const rect = makeIconRect(centerX, centerY + (Number(visualOffsetY) || 0), size);
  return mapDisplayObjectLocalRectToStageRect({
    node: container,
    rect,
    stageHeight,
    stageRect,
    stageWidth,
  }) || stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, rect);
}

export function makeSyntheticPointerEvent(
  original: NativePointerLike | null | undefined,
  node: IconSceneNode
): SyntheticPointerEvent {
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

function makeFolderOriginBounds(node: IconSceneNode, iconRect: StageRect): FolderOriginBounds | null {
  if (node?.item?.type !== "folder") return null;
  const stageRect = node.stageRect || { left: 0, top: 0 };
  const previewChildRects = [];
  for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
    const child = node.item.childPages?.[0]?.[slotIndex] || null;
    if (!child?.id) continue;
    const rect = node.getFolderPreviewChildBounds!(stageRect, slotIndex);
    if (rect) previewChildRects.push({ childId: child.id, rect, slotIndex });
  }
  return {
    folderId: node.item.id,
    iconRect,
    previewChildRects,
    thumbRect: node.getFolderThumbBounds!(stageRect) || iconRect,
  };
}
