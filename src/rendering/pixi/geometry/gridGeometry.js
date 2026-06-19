import { reloadOnPixiHotUpdate } from "../devHmr.js";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function readPx(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseRepeatCount(value, fallback = 1) {
  const match = String(value || "").match(/repeat\((\d+)/);
  if (match) return Math.max(1, Number(match[1]) || fallback);
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return parts.length || fallback;
}

export function makeRect(left, top, width, height) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

export function getDesktopGridMetrics(options) {
  const width = Math.max(1, options.width || 1);
  const height = Math.max(1, options.height || 1);
  const configuredCols = Math.max(1, Number(options.cols) || 1);
  const rows = Math.max(1, Number(options.rows) || 1);
  const isCompact = width <= 760;
  const basePaddingX = isCompact ? 58 : 96;
  const paddingX = Math.min(basePaddingX, Math.max(20, width * 0.12));
  const paddingBottom = isCompact ? 16 : 24;
  const defaultPaddingTop = isCompact ? 28 : 34;
  const configuredPaddingTop = Number(options.paddingTop);
  const paddingTop = Number.isFinite(configuredPaddingTop)
    ? clamp(configuredPaddingTop, 0, Math.max(0, height - paddingBottom - 1))
    : defaultPaddingTop;
  const gapX = isCompact ? 8 : 12;
  const gapY = isCompact ? 12 : 16;
  const visibleCount = Math.max(0, Number(options.visibleCount) || 0);
  const useSearchWidth = options.isSearchMode && visibleCount > 0 && visibleCount < configuredCols;
  const cols = useSearchWidth ? visibleCount : configuredCols;
  const searchSlotWidth = clamp(width * 0.12, 132, 220);
  const availableWidth = Math.max(1, width - paddingX * 2 - gapX * Math.max(0, cols - 1));
  const cellWidth = useSearchWidth ? Math.min(searchSlotWidth, availableWidth / cols) : availableWidth / cols;
  const gridWidth = cellWidth * cols + gapX * Math.max(0, cols - 1);
  const gridLeft = useSearchWidth ? (width - gridWidth) / 2 : paddingX;
  const gridTop = paddingTop;
  const gridHeight = Math.max(1, height - paddingTop - paddingBottom);
  const cellHeight = Math.max(1, (gridHeight - gapY * Math.max(0, rows - 1)) / rows);

  return {
    cellHeight,
    cellWidth,
    cols,
    gapX,
    gapY,
    gridHeight,
    gridLeft,
    gridTop,
    gridWidth,
    paddingBottom,
    paddingTop,
    rows,
  };
}

export function getGridSlotRect(metrics, index) {
  const safeIndex = Math.max(0, Number(index) || 0);
  const col = safeIndex % metrics.cols;
  const row = Math.floor(safeIndex / metrics.cols);
  return makeRect(
    metrics.gridLeft + col * (metrics.cellWidth + metrics.gapX),
    metrics.gridTop + row * (metrics.cellHeight + metrics.gapY),
    metrics.cellWidth,
    metrics.cellHeight
  );
}

export function getFolderPanelGeometry(options) {
  const width = Math.max(1, options.width || 1);
  const height = Math.max(1, options.height || 1);
  const style = options.panelStyle || {};
  const shellMinHeight = readPx(style["--folder-shell-min-height"], 520);
  const panelWidth = Math.min(1480, width - clamp(width * 0.18, 144, 336));
  const panelHeight = Math.min(shellMinHeight, Math.max(420, height - 168));
  const left = (width - panelWidth) / 2;
  const top = (height - panelHeight) / 2 + 24;
  const sidePadding = 58;
  const verticalPadding = 118;
  const gridTop = top + 64;
  const gridHeight = Math.max(280, panelHeight - verticalPadding);
  return {
    panel: makeRect(left, top, panelWidth, panelHeight),
    grid: makeRect(left + sidePadding, gridTop, panelWidth - sidePadding * 2, gridHeight),
    sidePadding,
  };
}

export function getFolderGridMetrics(options) {
  const grid = options.grid;
  const cols = Math.max(1, Number(options.cols) || 1);
  const rows = Math.max(1, Number(options.rows) || 1);
  const rowGap = Math.max(0, Number(options.rowGap) || 18);
  const availableCellHeight = Math.max(1, (grid.height - rowGap * Math.max(0, rows - 1)) / rows);
  const fixedCellHeight = Number(options.fixedCellHeight);
  const cellWidth = grid.width / cols;
  const cellHeight = Number.isFinite(fixedCellHeight) && fixedCellHeight > 0
    ? Math.min(fixedCellHeight, availableCellHeight)
    : availableCellHeight;
  return {
    cellHeight,
    cellWidth,
    cols,
    gapX: 0,
    gapY: rowGap,
    gridHeight: grid.height,
    gridLeft: grid.left,
    gridTop: grid.top,
    gridWidth: grid.width,
    rows,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
