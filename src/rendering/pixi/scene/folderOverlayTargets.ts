import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { stageLayoutRectToClientRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbChildLocalRect } from "../nodes/folderThumbMetrics.js";
import { makeIconRect } from "./iconSceneHelpers.js";
import type { SceneItem } from "../../sceneFrame.js";

export type FolderOverlayRect = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

export type FolderOverlayItem = SceneItem;

export type FolderTargetCoordinateSpace = "client-visual" | "stage-layout";

export type FolderTargetProjection = Readonly<{
  stageHeight: number;
  stageRect: FolderOverlayRect;
  stageWidth: number;
}>;

type StableFolderCloseTargetBase = Readonly<{
  folderId: string;
  iconRect: FolderOverlayRect;
  previewChildRects: ReadonlyMap<string, FolderOverlayRect>;
  source: string | null;
  thumbRect: FolderOverlayRect;
  trackingKey: string | null;
}>;

export type StableFolderCloseTarget =
  | (StableFolderCloseTargetBase & Readonly<{
    coordinateSpace: "client-visual";
    projection: FolderTargetProjection | null;
  }>)
  | (StableFolderCloseTargetBase & Readonly<{
    coordinateSpace: "stage-layout";
    projection: FolderTargetProjection;
  }>);

export type ProjectedFolderCloseTarget = Readonly<{
  folderId: string;
  iconRect: FolderOverlayRect;
  previewChildRects: ReadonlyMap<string, FolderOverlayRect>;
  source: string | null;
  thumbRect: FolderOverlayRect;
}>;

export type FolderGhostTarget = Readonly<{
  sourceRect: FolderOverlayRect | null;
  targetClientRect?: FolderOverlayRect | null;
  targetStageLayoutRect?: FolderOverlayRect | null;
}>;

export type UsableFolderGhostTarget = FolderGhostTarget & (
  | Readonly<{
    sourceRect: FolderOverlayRect;
    targetClientRect: FolderOverlayRect;
    targetStageLayoutRect?: null;
  }>
  | Readonly<{
    sourceRect: FolderOverlayRect;
    targetClientRect?: null;
    targetStageLayoutRect: FolderOverlayRect;
  }>
);

export type FolderGhost = Readonly<{
  item?: FolderOverlayItem | null;
  key?: string | null;
  slotIndex?: number | null;
}>;

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRect(value: unknown): value is FolderOverlayRect {
  if (!isRecord(value)) return false;
  return ["height", "left", "top", "width"].every((key) => (
    typeof value[key] === "number" && Number.isFinite(value[key])
  ));
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cloneRect(rect: FolderOverlayRect | null | undefined): FolderOverlayRect | null {
  if (!rect) return null;
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function makePreviewChildKey(childId: string, slotIndex: number): string {
  return `${childId}:${slotIndex}`;
}

export function makePreviewSlotById(
  previewSlots: readonly FolderOverlayItem[] | null | undefined,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  (previewSlots ?? []).forEach((item, previewSlotIndex) => {
    if (item?.id) result.set(item.id, previewSlotIndex);
  });
  return result;
}

export function findFolderGhostKey(
  ghosts: readonly FolderGhost[] | null | undefined,
  itemId: string,
  slotIndex: number,
): string | null {
  const items = Array.isArray(ghosts) ? ghosts : [];
  const matchingSlot = items.find((ghost) => ghost.item?.id === itemId && ghost.slotIndex === slotIndex);
  return matchingSlot?.key ?? items.find((ghost) => ghost.item?.id === itemId)?.key ?? null;
}

export function hasUsableFolderGhostTarget(target: unknown): target is UsableFolderGhostTarget {
  if (!isRecord(target) || !isRect(target.sourceRect)) return false;
  return isRect(target.targetStageLayoutRect) || isRect(target.targetClientRect);
}

export function makeFolderCenterCollapseRect(
  folderRect: FolderOverlayRect | null | undefined,
): FolderOverlayRect | null {
  if (!folderRect) return null;
  const size = Math.max(4, Math.min(folderRect.width, folderRect.height) * 0.18);
  return makeIconRect(
    folderRect.left + folderRect.width / 2,
    folderRect.top + folderRect.height / 2,
    size,
  );
}

export function makeProjectedPreviewRect(
  folderRect: FolderOverlayRect | null | undefined,
  slotIndex: unknown,
  columnCount: unknown = 3,
  rowCount: unknown = 3,
): FolderOverlayRect | null {
  if (!folderRect) return null;
  const safeIndex = Math.max(0, finiteNumber(slotIndex));
  const columns = Math.max(1, Math.floor(finiteNumber(columnCount, 3)));
  const rows = Math.max(1, Math.floor(finiteNumber(rowCount, 3)));
  const col = Math.min(columns - 1, safeIndex % columns);
  const row = Math.min(rows - 1, Math.floor(safeIndex / columns));
  const cellWidth = folderRect.width / columns;
  const cellHeight = folderRect.height / rows;
  const size = Math.max(3, Math.min(cellWidth, cellHeight) * 0.62);
  const centerX = folderRect.left + cellWidth * col + cellWidth / 2;
  const centerY = folderRect.top + cellHeight * row + cellHeight / 2;
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

export function makeFolderThumbPreviewRect(
  folderRect: FolderOverlayRect | null | undefined,
  slotIndex: number,
): FolderOverlayRect | null {
  if (!folderRect) return null;
  const childRect = getFolderThumbChildLocalRect(folderRect.width, slotIndex);
  return {
    height: childRect.height,
    left: folderRect.left + folderRect.width / 2 + childRect.left,
    top: folderRect.top + folderRect.height / 2 + childRect.top,
    width: childRect.width,
  };
}

export type StableFolderCloseTargetInput = Readonly<{
  coordinateSpace?: FolderTargetCoordinateSpace;
  folderId?: string | null;
  getStageLayoutPreviewChildRect?: (
    item: FolderOverlayItem,
    previewSlotIndex: number,
  ) => FolderOverlayRect | null | undefined;
  iconRect?: FolderOverlayRect | null;
  previewSlots?: readonly FolderOverlayItem[] | null;
  projection?: FolderTargetProjection | null;
  source?: string | null;
  thumbRect?: FolderOverlayRect | null;
  trackingKey?: string | null;
}>;

export function makeStableFolderCloseTarget(
  options: StableFolderCloseTargetInput = {},
): StableFolderCloseTarget | null {
  const {
    coordinateSpace = "stage-layout",
    folderId,
    getStageLayoutPreviewChildRect,
    iconRect,
    previewSlots,
    projection = null,
    source = null,
    thumbRect,
    trackingKey = null,
  } = options;
  if (!folderId || !iconRect || !thumbRect) return null;
  if (coordinateSpace !== "client-visual" && coordinateSpace !== "stage-layout") {
    throw new TypeError(`Unsupported folder close target coordinate space: ${String(coordinateSpace)}`);
  }
  if (coordinateSpace === "stage-layout" && !projection) {
    throw new TypeError("Stage-layout folder close targets require projection metadata");
  }
  const previewChildRects = new Map<string, FolderOverlayRect>();
  (previewSlots ?? []).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const childRect = getStageLayoutPreviewChildRect?.(item, previewSlotIndex);
    const clonedRect = cloneRect(childRect);
    if (clonedRect) previewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), clonedRect);
  });
  const clonedIconRect = cloneRect(iconRect);
  const clonedThumbRect = cloneRect(thumbRect);
  if (!clonedIconRect || !clonedThumbRect) {
    throw new TypeError("Folder close target rects could not be captured");
  }
  const base = {
    folderId,
    iconRect: clonedIconRect,
    previewChildRects,
    source,
    thumbRect: clonedThumbRect,
    trackingKey,
  };
  if (coordinateSpace === "client-visual") {
    return { ...base, coordinateSpace, projection };
  }
  if (!projection) {
    throw new TypeError("Stage-layout folder close targets require projection metadata");
  }
  return { ...base, coordinateSpace, projection };
}

export function projectFolderCloseTargetRectToClient(
  stableFolderCloseTarget: StableFolderCloseTarget | null | undefined,
  rect: FolderOverlayRect | null | undefined,
): FolderOverlayRect | null {
  if (!stableFolderCloseTarget || !rect) return null;
  if (stableFolderCloseTarget.coordinateSpace === "client-visual") return cloneRect(rect);
  const { stageHeight, stageRect, stageWidth } = stableFolderCloseTarget.projection;
  return cloneRect(stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, rect));
}

export function projectFolderCloseTargetToClient(
  stableFolderCloseTarget: StableFolderCloseTarget | null | undefined,
): ProjectedFolderCloseTarget | null {
  if (!stableFolderCloseTarget) return null;
  const iconRect = projectFolderCloseTargetRectToClient(stableFolderCloseTarget, stableFolderCloseTarget.iconRect);
  if (!iconRect) return null;
  const thumbRect = projectFolderCloseTargetRectToClient(
    stableFolderCloseTarget,
    stableFolderCloseTarget.thumbRect,
  ) ?? iconRect;
  const previewChildRects = new Map<string, FolderOverlayRect>();
  for (const [key, rect] of stableFolderCloseTarget.previewChildRects) {
    const childRect = projectFolderCloseTargetRectToClient(stableFolderCloseTarget, rect);
    if (childRect) previewChildRects.set(key, childRect);
  }
  return {
    folderId: stableFolderCloseTarget.folderId,
    iconRect,
    previewChildRects,
    source: stableFolderCloseTarget.source,
    thumbRect,
  };
}

export type StableFolderCloseRectsInput = Readonly<{
  folderId?: string | null;
  folderRect?: FolderOverlayRect | null;
  folderThumbRect?: FolderOverlayRect | null;
  isClosing?: boolean;
  stableFolderCloseTarget?: StableFolderCloseTarget | null;
}>;

export function getStableFolderCloseRects(options: StableFolderCloseRectsInput = {}): Readonly<{
  closeIconRect: FolderOverlayRect | null;
  closeThumbRect: FolderOverlayRect | null;
}> {
  const { folderId, folderRect = null, folderThumbRect = null, isClosing, stableFolderCloseTarget } = options;
  const useStableTarget = Boolean(isClosing && stableFolderCloseTarget?.folderId === folderId);
  const projectedTarget = useStableTarget ? projectFolderCloseTargetToClient(stableFolderCloseTarget) : null;
  const closeIconRect = useStableTarget ? projectedTarget?.iconRect ?? folderRect : folderRect;
  const closeThumbRect = useStableTarget ? projectedTarget?.thumbRect ?? closeIconRect : folderThumbRect;
  return { closeIconRect, closeThumbRect };
}

export function getStableFolderClosePresentationHitRects(options: Readonly<{
  frameRect?: FolderOverlayRect | null;
  handoffRect?: FolderOverlayRect | null;
  stableFolderCloseTarget?: StableFolderCloseTarget | null;
}> = {}): readonly FolderOverlayRect[] {
  const presentationFrameRect = cloneRect(options.frameRect);
  if (presentationFrameRect) return [presentationFrameRect];
  const currentHandoffRect = cloneRect(options.handoffRect);
  if (currentHandoffRect) return [currentHandoffRect];
  const projectedTarget = projectFolderCloseTargetToClient(options.stableFolderCloseTarget);
  return [
    cloneRect(projectedTarget?.thumbRect),
    cloneRect(projectedTarget?.iconRect),
  ].filter((rect): rect is FolderOverlayRect => rect !== null);
}

export type OpeningGhostTargetInput = Readonly<{
  cellHeight: number;
  cellWidth: number;
  cols: number;
  controllerGhostKey?: string | null;
  folderId: string;
  folderRect: FolderOverlayRect | null;
  getPreviewChildRect?: (
    item: FolderOverlayItem,
    previewSlotIndex: number,
  ) => FolderOverlayRect | null | undefined;
  iconSize: number;
  index: number;
  item: FolderOverlayItem;
  pageIndex?: number;
  previewSlotById: ReadonlyMap<string, number>;
  rows: number;
  targetCenterX: number;
  targetCenterY: number;
}>;

export type OpeningGhostTarget = Readonly<{
  cellHeight: number;
  cellWidth: number;
  columnCount: number;
  controllerGhostKey: string | null;
  folderId: string;
  iconSize: number;
  index: number;
  isThumbnailChild: boolean;
  item: FolderOverlayItem;
  pageIndex: number;
  previewSlotIndex: number | null;
  sourceRect: FolderOverlayRect | null;
  targetStageLayoutRect: FolderOverlayRect;
}>;

export function makeOpeningGhostTarget(options: OpeningGhostTargetInput): OpeningGhostTarget {
  const previewSlotIndex = options.previewSlotById.get(options.item.id) ?? null;
  const isThumbnailChild = previewSlotIndex !== null;
  const sourceRect = isThumbnailChild
    ? options.getPreviewChildRect?.(options.item, previewSlotIndex) ??
      makeProjectedPreviewRect(options.folderRect, previewSlotIndex, 3, 3)
    : options.getPreviewChildRect?.(options.item, options.index) ??
      makeProjectedPreviewRect(options.folderRect, options.index, options.cols, options.rows);
  return {
    cellHeight: options.cellHeight,
    cellWidth: options.cellWidth,
    columnCount: options.cols,
    controllerGhostKey: options.controllerGhostKey ?? null,
    folderId: options.folderId,
    iconSize: options.iconSize,
    index: options.index,
    isThumbnailChild,
    item: options.item,
    pageIndex: options.pageIndex ?? 0,
    previewSlotIndex,
    sourceRect,
    targetStageLayoutRect: makeIconRect(options.targetCenterX, options.targetCenterY, options.iconSize),
  };
}

export type ClosingGhostTargetInput = Readonly<{
  cellHeight: number;
  cellWidth: number;
  closeThumbRect: FolderOverlayRect | null;
  cols: number;
  controllerGhostKey?: string | null;
  folderId: string;
  iconBounds: FolderOverlayRect | null;
  iconSize: number;
  index: number;
  item: FolderOverlayItem;
  pageIndex?: number;
  previewSlotById: ReadonlyMap<string, number>;
  stableFolderCloseTarget?: StableFolderCloseTarget | null;
}>;

export type ClosingGhostTarget = Readonly<{
  cellHeight: number;
  cellWidth: number;
  columnCount: number;
  controllerGhostKey: string | null;
  iconSize: number;
  index: number;
  isThumbnailChild: boolean;
  item: FolderOverlayItem;
  pageIndex: number;
  previewSlotIndex: number | null;
  sourceRect: FolderOverlayRect | null;
  targetClientRect: FolderOverlayRect | null;
  targetStageLayoutRect: FolderOverlayRect | null;
}>;

export function makeClosingGhostTarget(options: ClosingGhostTargetInput): ClosingGhostTarget {
  const previewSlotIndex = options.previewSlotById.get(options.item.id) ?? null;
  const isThumbnailChild = previewSlotIndex !== null;
  const stableTarget = options.stableFolderCloseTarget;
  const hasStableFolderTarget = stableTarget?.folderId === options.folderId;
  const stablePreviewChildRect = isThumbnailChild && hasStableFolderTarget
    ? stableTarget.previewChildRects.get(makePreviewChildKey(options.item.id, previewSlotIndex)) ?? null
    : null;
  const stableThumbRect = hasStableFolderTarget ? stableTarget.thumbRect : null;
  const fallbackThumbRect = stableThumbRect ?? options.closeThumbRect;
  const rawTargetRect = isThumbnailChild
    ? stablePreviewChildRect ?? makeFolderThumbPreviewRect(fallbackThumbRect, previewSlotIndex)
    : makeFolderCenterCollapseRect(fallbackThumbRect);
  const isClientTarget = hasStableFolderTarget
    ? stableTarget.coordinateSpace === "client-visual"
    : options.closeThumbRect !== null;
  return {
    cellHeight: options.cellHeight,
    cellWidth: options.cellWidth,
    columnCount: options.cols,
    controllerGhostKey: options.controllerGhostKey ?? null,
    iconSize: options.iconSize,
    index: options.index,
    isThumbnailChild,
    item: options.item,
    pageIndex: options.pageIndex ?? 0,
    previewSlotIndex,
    sourceRect: options.iconBounds,
    targetClientRect: isClientTarget ? rawTargetRect : null,
    targetStageLayoutRect: isClientTarget ? null : rawTargetRect,
  };
}

export type ClosingPreviewSwapTarget = Readonly<{
  item: FolderOverlayItem;
  previewSlotIndex: number;
}> & (
  | Readonly<{
    targetClientRect: FolderOverlayRect;
    targetStageLayoutRect?: never;
  }>
  | Readonly<{
    targetClientRect?: never;
    targetStageLayoutRect: FolderOverlayRect;
  }>
);

export function makeClosingPreviewSwapTargets(options: Readonly<{
  folderId?: string | null;
  folderRect?: FolderOverlayRect | null;
  previewSlots?: readonly FolderOverlayItem[] | null;
  stableFolderCloseTarget?: StableFolderCloseTarget | null;
}> = {}): readonly ClosingPreviewSwapTarget[] {
  const { folderId, folderRect, previewSlots, stableFolderCloseTarget } = options;
  if (!folderId || !folderRect) return [];
  const targets: ClosingPreviewSwapTarget[] = [];
  (previewSlots ?? []).slice(0, 9).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const hasStableFolderTarget = stableFolderCloseTarget?.folderId === folderId;
    const stablePreviewChildRect = hasStableFolderTarget
      ? stableFolderCloseTarget.previewChildRects.get(makePreviewChildKey(item.id, previewSlotIndex)) ?? null
      : null;
    const stableThumbRect = hasStableFolderTarget ? stableFolderCloseTarget.thumbRect : null;
    const fallbackThumbRect = stableThumbRect ?? folderRect;
    const rawTargetRect = stablePreviewChildRect ?? makeFolderThumbPreviewRect(fallbackThumbRect, previewSlotIndex);
    if (!rawTargetRect) return;
    const isClientTarget = hasStableFolderTarget
      ? stableFolderCloseTarget.coordinateSpace === "client-visual"
      : true;
    targets.push(isClientTarget
      ? { item, previewSlotIndex, targetClientRect: rawTargetRect }
      : { item, previewSlotIndex, targetStageLayoutRect: rawTargetRect });
  });
  return targets;
}

reloadOnPixiHotUpdate(import.meta.hot);
