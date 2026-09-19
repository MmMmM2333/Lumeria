export type IconFocus = {
  area: string;
  id: string;
  pageIndex: number;
  folderId?: string | null;
};

export type LaunchpadIconArea = "desktop" | "folder" | "search";
export type LaunchpadIconItem = Readonly<{ id: string }>;
export type LaunchpadIconFocus = IconFocus & Readonly<{
  area: LaunchpadIconArea;
  folderId: string | null;
}>;
export type LaunchpadIconScope<TItem extends LaunchpadIconItem = LaunchpadIconItem> = Readonly<{
  area: LaunchpadIconArea;
  columns: number;
  folderId: string | null;
  items: readonly TItem[];
  pageIndex: number;
}>;
export type LaunchpadArrowKey = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp";

export function makeIconFocus(
  area: LaunchpadIconArea,
  item: LaunchpadIconItem | null | undefined,
  pageNumber: number,
  folderId: string | null = null,
): LaunchpadIconFocus | null {
  return item ? { area, id: item.id, pageIndex: Math.max(0, Number(pageNumber) || 0), folderId: folderId || null } : null;
}

export function focusMatchesScope(
  focus: Partial<IconFocus> | null | undefined,
  scope: LaunchpadIconScope | null | undefined,
): boolean {
  return Boolean(focus && scope && focus.area === scope.area && focus.pageIndex === scope.pageIndex
    && (scope.area !== "folder" || focus.folderId === scope.folderId));
}

export function firstIconFocus(scope: LaunchpadIconScope): LaunchpadIconFocus | null {
  return makeIconFocus(scope.area, scope.items[0], scope.pageIndex, scope.folderId);
}

export function moveIconFocus(
  focus: Partial<IconFocus> | null | undefined,
  scope: LaunchpadIconScope,
  key: LaunchpadArrowKey,
): LaunchpadIconFocus | null {
  const current = focus && focusMatchesScope(focus, scope)
    ? scope.items.findIndex((item) => item.id === focus.id) : -1;
  if (current < 0) return firstIconFocus(scope);
  const columns = Math.max(1, scope.columns || 1);
  const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -columns : columns;
  const index = Math.max(0, Math.min(scope.items.length - 1, current + delta));
  return makeIconFocus(scope.area, scope.items[index], scope.pageIndex, scope.folderId);
}

export function findFocusedIcon<TItem extends LaunchpadIconItem>(
  focus: Partial<IconFocus> | null | undefined,
  scope: LaunchpadIconScope<TItem>,
): TItem | null {
  return focus && focusMatchesScope(focus, scope)
    ? scope.items.find((item) => item.id === focus.id) ?? null : null;
}

export function matchesIconFocus(
  focus: IconFocus | null | undefined,
  area: string,
  itemId: string,
  pageIndex: number,
  folderId: string | null = null,
): boolean {
  return Boolean(
    focus &&
      focus.area === area &&
      focus.id === itemId &&
      focus.pageIndex === pageIndex &&
      (area !== "folder" || focus.folderId === folderId)
  );
}
