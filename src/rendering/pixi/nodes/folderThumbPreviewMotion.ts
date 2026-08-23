import type { SceneItem } from "../../sceneFrame.js";

export interface FolderPreviewMotionSource {
  childPages?: unknown;
}

export interface FolderPreviewMotionMetrics {
  childSize?: number | null;
  gap?: number | null;
}

export interface FolderPreviewMotionPlan {
  endY: number;
  items: readonly SceneItem[];
  rowCount: number;
  rowStride: number;
  scrollRows: number;
  startY: number;
}

export const FOLDER_THUMB_PREVIEW_COLS = 3;
export const FOLDER_THUMB_PREVIEW_VISIBLE_ROWS = 3;

export function getFolderPreviewMotionItems(
  folder: FolderPreviewMotionSource | null | undefined,
  pageSize: number | null | undefined,
): SceneItem[] {
  const safePageSize = Math.max(1, Number(pageSize) || 9);
  const firstPage = Array.isArray(folder?.childPages) ? folder.childPages[0] || [] : [];
  return (firstPage.filter(Boolean) as SceneItem[]).slice(0, safePageSize);
}

export function getFolderPreviewMotionPlan(
  folder: FolderPreviewMotionSource | null | undefined,
  pageSize: number | null | undefined,
  metrics: FolderPreviewMotionMetrics | null | undefined,
): FolderPreviewMotionPlan {
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
