import { clamp } from "../domain/launchpadLayout.js";

const FOLDER_ROW_GAP = 24;
const FOLDER_MIN_ROW_GAP = 10;
const FOLDER_GRID_SAFE_AREA = 24;
const FOLDER_MIN_EFFECTIVE_ICON_SIZE = 20;
const FOLDER_SHELL_MAX_HEIGHT_MIN = 420;
const FOLDER_SHELL_VIEWPORT_OFFSET = 168;
const FOLDER_SHELL_VERTICAL_PADDING = 118;
const FOLDER_VIEWPORT_MIN_HEIGHT = 280;

export type FolderLayoutMetricsOptions = Readonly<{
  baseFolderIconSize?: number;
  folderViewportHeight?: number;
  rowCount?: number;
  viewportHeight?: number;
}>;

function roundPx(value: number): number {
  return Math.round(value * 100) / 100;
}

function getInitialFolderViewportHeight(shellMinHeight: number, explicitViewportHeight?: number): number {
  const viewportHeight = Number(explicitViewportHeight) || Number(globalThis.window?.innerHeight);
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;

  const shellMaxHeight = Math.max(FOLDER_SHELL_MAX_HEIGHT_MIN, viewportHeight - FOLDER_SHELL_VIEWPORT_OFFSET);
  const shellHeight = Math.min(shellMinHeight, shellMaxHeight);
  return Math.max(FOLDER_VIEWPORT_MIN_HEIGHT, shellHeight - FOLDER_SHELL_VERTICAL_PADDING);
}

export function getFolderLayoutMetricsForRows(options: FolderLayoutMetricsOptions = {}) {
  const rowCount = Math.max(1, Number(options.rowCount) || 1);
  const baseFolderIconSize = Math.max(1, Number(options.baseFolderIconSize) || 64);
  const idealIconCellHeight = baseFolderIconSize + 56;
  const idealSafeArea = FOLDER_GRID_SAFE_AREA;
  const folderGridHeight = rowCount * idealIconCellHeight
    + Math.max(0, rowCount - 1) * FOLDER_ROW_GAP
    + idealSafeArea;
  const folderShellMinHeight = folderGridHeight + 120;
  const initialViewportHeight = getInitialFolderViewportHeight(folderShellMinHeight, options.viewportHeight);
  const measuredViewportHeight = Number(options.folderViewportHeight) || 0;
  const availableHeight = Math.max(1, measuredViewportHeight || initialViewportHeight || folderGridHeight, initialViewportHeight);
  const coarseScale = clamp(availableHeight / Math.max(1, folderGridHeight), 0, 1);
  const rowGap = roundPx(clamp(FOLDER_ROW_GAP * coarseScale, FOLDER_MIN_ROW_GAP, FOLDER_ROW_GAP));
  const safeArea = roundPx(idealSafeArea * coarseScale);
  const gapTotal = Math.max(0, rowCount - 1) * rowGap;
  const rowHeight = Math.max(0, (availableHeight - gapTotal - safeArea) / rowCount);
  const minIconScale = Math.min(1, FOLDER_MIN_EFFECTIVE_ICON_SIZE / Math.max(1, baseFolderIconSize));
  const contentScale = clamp(rowHeight / Math.max(1, idealIconCellHeight), minIconScale, 1);

  return {
    effectiveIconSize: roundPx(baseFolderIconSize * contentScale),
    folderGridHeight,
    folderShellMinHeight,
    iconCellHeight: roundPx(idealIconCellHeight * contentScale),
    rowGap,
    safeArea,
  };
}
