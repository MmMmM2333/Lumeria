import {
  cloneRect,
  makePreviewChildKey,
  type FolderOverlayItem,
  type FolderOverlayRect,
} from "./folderOverlayTargets.js";

export type FolderOpeningGeometrySnapshot = Readonly<{
  folderId: string | null;
  layoutKey: string | null;
  projection: Readonly<{
    clientStageRect: FolderOverlayRect | null;
    stageHeight: number;
    stageWidth: number;
  }>;
  source: Readonly<{
    coordinateSpace: "client-visual";
    folderRect: FolderOverlayRect | null;
    previewChildRects: ReadonlyMap<string, FolderOverlayRect>;
  }>;
  target: Readonly<{
    coordinateSpace: "stage-layout";
    panelCenter: Readonly<{ x: number; y: number }>;
    panelRect: FolderOverlayRect | null;
  }>;
  targetKey: string;
}>;

export type FolderOpeningGeometryLayoutKeyInput = Readonly<{
  stageHeight?: unknown;
  stageRect?: FolderOverlayRect | null;
  stageWidth?: unknown;
  targetKey?: string | null;
}>;

export type FolderOpeningGeometrySnapshotInput = Readonly<{
  folderId?: string | null;
  folderRect?: FolderOverlayRect | null;
  getPreviewChildRect?: (
    item: FolderOverlayItem,
    previewSlotIndex: number,
  ) => FolderOverlayRect | null | undefined;
  layoutKey?: string | null;
  panelRect?: FolderOverlayRect | null;
  previewSlots?: readonly (FolderOverlayItem | null)[] | null;
  stageHeight?: unknown;
  stageRect?: FolderOverlayRect | null;
  stageWidth?: unknown;
  targetKey?: string | null;
  targetX?: unknown;
  targetY?: unknown;
}>;

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundKeyValue(value: unknown): number {
  return Math.round(finiteNumber(value) * 100) / 100;
}

export function makeFolderOpeningGeometryLayoutKey(
  options: FolderOpeningGeometryLayoutKeyInput = {},
): string {
  const { stageHeight, stageRect, stageWidth, targetKey = "" } = options;
  return [
    targetKey ?? "",
    roundKeyValue(stageRect?.left),
    roundKeyValue(stageRect?.top),
    roundKeyValue(stageRect?.width),
    roundKeyValue(stageRect?.height),
    roundKeyValue(stageWidth),
    roundKeyValue(stageHeight),
  ].join(":");
}

export function getFolderOpeningPreviewChildRect(
  snapshot: FolderOpeningGeometrySnapshot | null | undefined,
  item: Readonly<{ id: string }> | null | undefined,
  slotIndex: number,
): FolderOverlayRect | null {
  if (!snapshot || !item?.id) return null;
  return cloneRect(snapshot.source.previewChildRects.get(makePreviewChildKey(item.id, slotIndex)));
}

export function makeFolderOpeningGeometrySnapshot(
  options: FolderOpeningGeometrySnapshotInput = {},
): FolderOpeningGeometrySnapshot {
  const previewChildRects = new Map<string, FolderOverlayRect>();
  (options.previewSlots ?? []).forEach((item, previewSlotIndex) => {
    if (!item?.id) return;
    const rect = options.getPreviewChildRect?.(item, previewSlotIndex);
    const clonedRect = cloneRect(rect);
    if (clonedRect) previewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), clonedRect);
  });
  return {
    folderId: options.folderId ?? null,
    layoutKey: options.layoutKey ?? null,
    projection: {
      clientStageRect: cloneRect(options.stageRect),
      stageHeight: finiteNumber(options.stageHeight),
      stageWidth: finiteNumber(options.stageWidth),
    },
    source: {
      coordinateSpace: "client-visual",
      folderRect: cloneRect(options.folderRect),
      previewChildRects,
    },
    target: {
      coordinateSpace: "stage-layout",
      panelCenter: {
        x: finiteNumber(options.targetX),
        y: finiteNumber(options.targetY),
      },
      panelRect: cloneRect(options.panelRect),
    },
    targetKey: options.targetKey ?? "",
  };
}
