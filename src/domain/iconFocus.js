export function matchesIconFocus(focus, area, itemId, pageIndex, folderId = null) {
  return Boolean(
    focus &&
      focus.area === area &&
      focus.id === itemId &&
      focus.pageIndex === pageIndex &&
      (area !== "folder" || focus.folderId === folderId)
  );
}
