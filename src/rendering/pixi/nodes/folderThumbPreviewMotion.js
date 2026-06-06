export const FOLDER_THUMB_PREVIEW_COLS = 3;
export const FOLDER_THUMB_PREVIEW_VISIBLE_ROWS = 3;

export function getFolderPreviewMotionItems(folder, pageSize) {
  const safePageSize = Math.max(1, Number(pageSize) || 9);
  const firstPage = Array.isArray(folder?.childPages)
    ? folder.childPages[0] || []
    : folder?.children || [];
  return firstPage.filter(Boolean).slice(0, safePageSize);
}

export function getFolderPreviewMotionPlan(folder, pageSize, metrics) {
  const items = getFolderPreviewMotionItems(folder, pageSize);
  const childSize = Math.max(1, Number(metrics?.childSize) || 1);
  const gap = Math.max(0, Number(metrics?.gap) || 0);
  const rowStride = childSize + gap;
  const rowCount = Math.ceil(items.length / FOLDER_THUMB_PREVIEW_COLS);
  const scrollRows = Math.max(0, rowCount - FOLDER_THUMB_PREVIEW_VISIBLE_ROWS);
  return {
    endY: -scrollRows * rowStride,
    items,
    rowCount,
    rowStride,
    scrollRows,
    startY: 0,
  };
}
