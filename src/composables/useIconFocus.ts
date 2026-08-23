import { shallowRef } from "vue";
import { clamp } from "../domain/launchpadLayout.js";
import type { IconFocus } from "../domain/iconFocus.js";

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

export type IconFocusOptions<TItem extends LaunchpadIconItem> = Readonly<{
  getCurrentIconScope: () => LaunchpadIconScope<TItem>;
}>;

export function useIconFocus<TItem extends LaunchpadIconItem>(options: IconFocusOptions<TItem>) {
  const focusedIcon = shallowRef<LaunchpadIconFocus | null>(null);
  const openingIcon = shallowRef<LaunchpadIconFocus | null>(null);
  const getCurrentIconScope = options.getCurrentIconScope;

  function clearFocusedIcon(): void {
    focusedIcon.value = null;
  }

  function clearOpeningIcon(): void {
    openingIcon.value = null;
  }

  function makeIconFocus(
    area: LaunchpadIconArea,
    item: LaunchpadIconItem | null | undefined,
    pageNumber: number,
    folderId: string | null = null,
  ): LaunchpadIconFocus | null {
    if (!item) return null;
    return {
      area,
      id: item.id,
      pageIndex: Math.max(0, Number(pageNumber) || 0),
      folderId: folderId || null,
    };
  }

  function isIconOpening(
    area: LaunchpadIconArea,
    itemId: string,
    pageNumber: number,
    folderId: string | null = null,
  ): boolean {
    const opening = openingIcon.value;
    return Boolean(
      opening &&
        opening.area === area &&
        opening.id === itemId &&
        opening.pageIndex === pageNumber &&
        (area !== "folder" || opening.folderId === folderId)
    );
  }

  function focusMatchesScope(
    focus: IconFocus | null | undefined,
    scope: LaunchpadIconScope<TItem> | null | undefined,
  ): boolean {
    return Boolean(
      focus &&
        scope &&
        focus.area === scope.area &&
        focus.pageIndex === scope.pageIndex &&
        (scope.area !== "folder" || focus.folderId === scope.folderId)
    );
  }

  function focusIconInScope(scope: LaunchpadIconScope<TItem>, item: TItem): void {
    focusedIcon.value = makeIconFocus(scope.area, item, scope.pageIndex, scope.folderId);
  }

  function focusFirstIconInCurrentScope(options?: Readonly<{ force?: boolean }>): boolean {
    const scope = getCurrentIconScope();
    const first = scope.items[0] || null;
    if (!first) {
      clearFocusedIcon();
      return false;
    }
    if (!options?.force && focusMatchesScope(focusedIcon.value, scope)) return true;
    focusIconInScope(scope, first);
    return true;
  }

  function moveFocusByArrow(key: LaunchpadArrowKey): void {
    const scope = getCurrentIconScope();
    const items = scope.items || [];
    if (!items.length) {
      clearFocusedIcon();
      return;
    }

    const focus = focusedIcon.value;
    const current = focus && focusMatchesScope(focus, scope)
      ? items.findIndex((item) => item.id === focus.id)
      : -1;

    if (current < 0) {
      const first = items[0];
      if (first) focusIconInScope(scope, first);
      return;
    }

    const columns = Math.max(1, scope.columns || 1);
    let nextIndex = current;
    if (key === "ArrowLeft") nextIndex = current - 1;
    if (key === "ArrowRight") nextIndex = current + 1;
    if (key === "ArrowUp") nextIndex = current - columns;
    if (key === "ArrowDown") nextIndex = current + columns;
    nextIndex = clamp(nextIndex, 0, items.length - 1);
    const nextItem = items[nextIndex];
    if (nextItem) focusIconInScope(scope, nextItem);
  }

  function findFocusedItem(): Readonly<{ item: TItem; scope: LaunchpadIconScope<TItem> }> | null {
    const scope = getCurrentIconScope();
    const focus = focusedIcon.value;
    if (!focus || !focusMatchesScope(focus, scope)) return null;
    const item = scope.items.find((candidate) => candidate.id === focus.id);
    return item ? { item, scope } : null;
  }

  return {
    clearOpeningIcon,
    clearFocusedIcon,
    findFocusedItem,
    isIconOpening,
    makeIconFocus,
    moveFocusByArrow,
    openingIcon,
    focusFirstIconInCurrentScope,
    focusIconInScope,
    focusedIcon,
    focusMatchesScope,
  };
}
