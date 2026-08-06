export function makeLaunchSourceFromBounds(target, isSearchMode = false) {
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
  isDialogOpen = false,
  isHomeInteractionDisabled = false,
  isSettingsPanelOpen = false,
} = {}) {
  return Boolean(
    dragMeta ||
    isDialogOpen ||
    isHomeInteractionDisabled ||
    isSettingsPanelOpen
  );
}

function rectContainsPoint(rect, x, y) {
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
  getIconAtPoint,
  isFolderLayerActive = false,
  isInteractionBlocked = false,
  isSearchMode = false,
  mainRect = null,
} = {}) {
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || isInteractionBlocked) return null;

  const area = isFolderLayerActive
    ? "folder"
    : isSearchMode
      ? "search"
      : "desktop";
  const boundsOptions = area === "folder" ? { area, folderId } : { area };
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

  if (
    isSearchMode ||
    isFolderLayerActive ||
    !rectContainsPoint(mainRect, x, y)
  ) {
    return null;
  }
  return { kind: "surface" };
}
