import type { ReadonlyLaunchpadItem } from "../launchpadLayout.js";

export type LaunchpadItem = ReadonlyLaunchpadItem;

export type LaunchpadBoundsMeta = Readonly<{
  area?: string | null;
  folderId?: string | null;
  id?: string | null;
  index?: number | null;
  item?: LaunchpadItem;
  pageIndex?: number | null;
}>;

export type LaunchpadBoundsTarget = Readonly<{
  id?: string;
  meta?: LaunchpadBoundsMeta;
}>;

export type LaunchSource =
  | Readonly<{ folderId: string | null; index: number; pageIndex: number; type: "folder" }>
  | Readonly<{ index: number; pageIndex: number; type: "page" | "search" }>;

type RectLike = Readonly<{
  bottom?: number;
  height: number;
  left: number;
  right?: number;
  top: number;
  width: number;
}>;

type ContextMenuBlockState = Readonly<{
  dragMeta?: unknown;
  isBatchSelectionActive?: boolean;
  isDialogOpen?: boolean;
  isEditMode?: boolean;
  isHomeInteractionDisabled?: boolean;
  isSettingsPanelOpen?: boolean;
}>;

type ContextMenuTargetOptions = Readonly<{
  clientX?: unknown;
  clientY?: unknown;
  folderId?: string | null;
  folderPanelRect?: RectLike | null;
  getIconAtPoint?: (
    x: number,
    y: number,
    options: Readonly<{ area: "desktop" | "search" } | { area: "folder"; folderId: string | null }>,
  ) => LaunchpadBoundsTarget | null;
  isFolderLayerActive?: boolean;
  isInteractionBlocked?: boolean;
  isSearchMode?: boolean;
  mainRect?: RectLike | null;
}>;

export type LaunchpadContextMenuTarget =
  | Readonly<{ item: LaunchpadItem; kind: "icon"; source: LaunchSource }>
  | Readonly<{ folderId: string; kind: "folder-surface" }>
  | Readonly<{ kind: "surface" }>;

export function makeLaunchSourceFromBounds(
  target: LaunchpadBoundsTarget | null | undefined,
  isSearchMode = false,
): LaunchSource {
  const meta = target?.meta || {};
  if (meta.area === "folder") {
    return {
      type: "folder",
      folderId: meta.folderId || null,
      pageIndex: meta.pageIndex ?? 0,
      index: meta.index ?? 0,
    };
  }
  return {
    type: meta.area === "search" || isSearchMode ? "search" : "page",
    pageIndex: meta.pageIndex ?? 0,
    index: meta.index ?? 0,
  };
}

export function isLaunchpadContextMenuInteractionBlocked({
  dragMeta = null,
  isBatchSelectionActive = false,
  isDialogOpen = false,
  isEditMode = false,
  isHomeInteractionDisabled = false,
  isSettingsPanelOpen = false,
}: ContextMenuBlockState = {}): boolean {
  return Boolean(
    dragMeta ||
    isBatchSelectionActive ||
    isDialogOpen ||
    isEditMode ||
    isHomeInteractionDisabled ||
    isSettingsPanelOpen
  );
}

function rectContainsPoint(rect: RectLike | null, x: number, y: number): boolean {
  if (!rect) return false;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);
  const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width;
  const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height;
  return (
    Number.isFinite(left) &&
    Number.isFinite(top) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    x >= left &&
    x <= right &&
    y >= top &&
    y <= bottom
  );
}

export function resolveLaunchpadContextMenuTarget({
  clientX,
  clientY,
  folderId = null,
  folderPanelRect = null,
  getIconAtPoint,
  isFolderLayerActive = false,
  isInteractionBlocked = false,
  isSearchMode = false,
  mainRect = null,
}: ContextMenuTargetOptions = {}): LaunchpadContextMenuTarget | null {
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || isInteractionBlocked) return null;

  const area = isFolderLayerActive
    ? "folder"
    : isSearchMode
      ? "search"
      : "desktop";
  const boundsOptions: Readonly<
    { area: "desktop" | "search" } | { area: "folder"; folderId: string | null }
  > = area === "folder" ? { area, folderId } : { area };
  const target = getIconAtPoint?.(x, y, boundsOptions) || null;
  if (target) {
    const item = target.meta?.item;
    if (!item || (item.type !== "app" && item.type !== "folder")) return null;
    return {
      item,
      kind: "icon",
      source: makeLaunchSourceFromBounds(target, isSearchMode),
    };
  }

  if (isSearchMode) return null;
  if (isFolderLayerActive) {
    return folderId && rectContainsPoint(folderPanelRect, x, y)
      ? { folderId, kind: "folder-surface" }
      : null;
  }
  if (!rectContainsPoint(mainRect, x, y)) return null;
  return { kind: "surface" };
}
