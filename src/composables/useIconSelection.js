import { shallowRef } from "vue";
import { clamp } from "../domain/launchpadLayout.js";

export function useIconSelection(options) {
  const selectedIcon = shallowRef(null);
  const openingIcon = shallowRef(null);
  const getCurrentIconScope = options.getCurrentIconScope;

  function clearSelectedIcon() {
    selectedIcon.value = null;
  }

  function clearOpeningIcon() {
    openingIcon.value = null;
  }

  function makeIconSelection(area, item, pageNumber, folderId) {
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

  function selectionMatchesScope(selection, scope) {
    return Boolean(
      selection &&
        scope &&
        selection.area === scope.area &&
        selection.pageIndex === scope.pageIndex &&
        (scope.area !== "folder" || selection.folderId === scope.folderId)
    );
  }

  function selectIconInScope(scope, item) {
    selectedIcon.value = makeIconSelection(scope.area, item, scope.pageIndex, scope.folderId);
  }

  function selectFirstIconInCurrentScope(options) {
    const scope = getCurrentIconScope();
    const first = scope.items[0] || null;
    if (!first) {
      clearSelectedIcon();
      return false;
    }
    if (!options?.force && selectionMatchesScope(selectedIcon.value, scope)) return true;
    selectIconInScope(scope, first);
    return true;
  }

  function moveSelectionByArrow(key) {
    const scope = getCurrentIconScope();
    const items = scope.items || [];
    if (!items.length) {
      clearSelectedIcon();
      return;
    }

    const current = selectionMatchesScope(selectedIcon.value, scope)
      ? items.findIndex((item) => item.id === selectedIcon.value.id)
      : -1;

    if (current < 0) {
      selectIconInScope(scope, items[0]);
      return;
    }

    const columns = Math.max(1, scope.columns || 1);
    let nextIndex = current;
    if (key === "ArrowLeft") nextIndex = current - 1;
    if (key === "ArrowRight") nextIndex = current + 1;
    if (key === "ArrowUp") nextIndex = current - columns;
    if (key === "ArrowDown") nextIndex = current + columns;
    nextIndex = clamp(nextIndex, 0, items.length - 1);
    selectIconInScope(scope, items[nextIndex]);
  }

  function findSelectedItem() {
    const scope = getCurrentIconScope();
    const selected = selectedIcon.value;
    if (!selectionMatchesScope(selected, scope)) return null;
    const item = scope.items.find((candidate) => candidate.id === selected.id);
    return item ? { item, scope } : null;
  }

  return {
    clearOpeningIcon,
    clearSelectedIcon,
    findSelectedItem,
    isIconOpening,
    makeIconSelection,
    moveSelectionByArrow,
    openingIcon,
    selectFirstIconInCurrentScope,
    selectIconInScope,
    selectedIcon,
    selectionMatchesScope,
  };
}
