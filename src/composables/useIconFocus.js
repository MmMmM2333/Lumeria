import { shallowRef } from "vue";
import { clamp } from "../domain/launchpadLayout.js";

export function useIconFocus(options) {
  const focusedIcon = shallowRef(null);
  const openingIcon = shallowRef(null);
  const getCurrentIconScope = options.getCurrentIconScope;

  function clearFocusedIcon() {
    focusedIcon.value = null;
  }

  function clearOpeningIcon() {
    openingIcon.value = null;
  }

  function makeIconFocus(area, item, pageNumber, folderId) {
    if (!item) return null;
    return {
      area,
      id: item.id,
      pageIndex: Math.max(0, Number(pageNumber) || 0),
      folderId: folderId || null,
    };
  }

  function isIconOpening(area, itemId, pageNumber, folderId) {
    const opening = openingIcon.value;
    return Boolean(
      opening &&
        opening.area === area &&
        opening.id === itemId &&
        opening.pageIndex === pageNumber &&
        (area !== "folder" || opening.folderId === folderId)
    );
  }

  function focusMatchesScope(focus, scope) {
    return Boolean(
      focus &&
        scope &&
        focus.area === scope.area &&
        focus.pageIndex === scope.pageIndex &&
        (scope.area !== "folder" || focus.folderId === scope.folderId)
    );
  }

  function focusIconInScope(scope, item) {
    focusedIcon.value = makeIconFocus(scope.area, item, scope.pageIndex, scope.folderId);
  }

  function focusFirstIconInCurrentScope(options) {
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

  function moveFocusByArrow(key) {
    const scope = getCurrentIconScope();
    const items = scope.items || [];
    if (!items.length) {
      clearFocusedIcon();
      return;
    }

    const current = focusMatchesScope(focusedIcon.value, scope)
      ? items.findIndex((item) => item.id === focusedIcon.value.id)
      : -1;

    if (current < 0) {
      focusIconInScope(scope, items[0]);
      return;
    }

    const columns = Math.max(1, scope.columns || 1);
    let nextIndex = current;
    if (key === "ArrowLeft") nextIndex = current - 1;
    if (key === "ArrowRight") nextIndex = current + 1;
    if (key === "ArrowUp") nextIndex = current - columns;
    if (key === "ArrowDown") nextIndex = current + columns;
    nextIndex = clamp(nextIndex, 0, items.length - 1);
    focusIconInScope(scope, items[nextIndex]);
  }

  function findFocusedItem() {
    const scope = getCurrentIconScope();
    const focus = focusedIcon.value;
    if (!focusMatchesScope(focus, scope)) return null;
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
