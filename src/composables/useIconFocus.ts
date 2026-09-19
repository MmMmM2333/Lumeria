import { shallowRef } from "vue";
import {
  findFocusedIcon,
  firstIconFocus,
  focusMatchesScope,
  makeIconFocus,
  matchesIconFocus,
  moveIconFocus,
  type LaunchpadArrowKey,
  type LaunchpadIconArea,
  type LaunchpadIconFocus,
  type LaunchpadIconItem,
  type LaunchpadIconScope,
} from "../domain/iconFocus.js";

export type {
  LaunchpadArrowKey, LaunchpadIconArea, LaunchpadIconFocus, LaunchpadIconItem, LaunchpadIconScope,
} from "../domain/iconFocus.js";

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

  function isIconOpening(
    area: LaunchpadIconArea,
    itemId: string,
    pageNumber: number,
    folderId: string | null = null,
  ): boolean {
    return matchesIconFocus(openingIcon.value, area, itemId, pageNumber, folderId);
  }

  function focusIconInScope(scope: LaunchpadIconScope<TItem>, item: TItem): void {
    focusedIcon.value = makeIconFocus(scope.area, item, scope.pageIndex, scope.folderId);
  }

  function focusFirstIconInCurrentScope(options?: Readonly<{ force?: boolean }>): boolean {
    const scope = getCurrentIconScope();
    if (!scope.items.length || options?.force || !focusMatchesScope(focusedIcon.value, scope)) {
      focusedIcon.value = firstIconFocus(scope);
    }
    return focusedIcon.value !== null;
  }

  function moveFocusByArrow(key: LaunchpadArrowKey): void {
    focusedIcon.value = moveIconFocus(focusedIcon.value, getCurrentIconScope(), key);
  }

  function findFocusedItem(): Readonly<{ item: TItem; scope: LaunchpadIconScope<TItem> }> | null {
    const scope = getCurrentIconScope();
    const item = findFocusedIcon(focusedIcon.value, scope);
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
