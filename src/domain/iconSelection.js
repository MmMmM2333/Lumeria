export function matchesIconSelection(selection, area, itemId, pageIndex, folderId = null) {
  return Boolean(
    selection &&
      selection.area === area &&
      selection.id === itemId &&
      selection.pageIndex === pageIndex &&
      (area !== "folder" || selection.folderId === folderId)
  );
}
