import {
  getDesktopGridMetrics,
  getFolderGridMetrics,
  getFolderPanelGeometry,
  getGridSlotRect,
  makeRect,
} from "./gridGeometry.js";

export function runGridGeometryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi grid geometry test failed] ${message}`);
  };

  const assertRectInside = (rect, bounds, message) => {
    const epsilon = 0.001;
    assert(rect.left >= bounds.left - epsilon, `${message}: left should stay inside bounds`);
    assert(rect.top >= bounds.top - epsilon, `${message}: top should stay inside bounds`);
    assert(rect.left + rect.width <= bounds.left + bounds.width + epsilon, `${message}: right should stay inside bounds`);
    assert(rect.top + rect.height <= bounds.top + bounds.height + epsilon, `${message}: bottom should stay inside bounds`);
  };

  const grid = makeRect(58, 64, 700, 280);
  const fixedSingleRow = getFolderGridMetrics({
    cols: 7,
    fixedCellHeight: 128,
    grid,
    rowGap: 24,
    rows: 1,
  });
  const fixedSlot = getGridSlotRect(fixedSingleRow, 0);
  assert(fixedSingleRow.cellHeight === 128, "single-row folder cells should keep the configured fixed height");
  assert(fixedSlot.top === 64 && fixedSlot.height === 128, "single-row folder slots should align to the grid top");

  const stretchedSingleRow = getFolderGridMetrics({
    cols: 7,
    grid,
    rowGap: 24,
    rows: 1,
  });
  assert(stretchedSingleRow.cellHeight === 280, "folder cells should preserve the legacy stretch fallback without fixed height");

  const constrainedRows = getFolderGridMetrics({
    cols: 2,
    fixedCellHeight: 80,
    grid: makeRect(0, 0, 100, 100),
    rowGap: 20,
    rows: 2,
  });
  assert(constrainedRows.cellHeight === 40, "fixed folder row height should not exceed available grid space");

  const desktopSizes = [
    { height: 768, width: 1366 },
    { height: 1080, width: 1920 },
    { height: 1440, width: 2560 },
    { height: 2160, width: 3840 },
  ];
  for (const size of desktopSizes) {
    const metrics = getDesktopGridMetrics({
      cols: 6,
      height: size.height,
      rows: 4,
      visibleCount: 24,
      width: size.width,
    });
    const gridBounds = makeRect(metrics.gridLeft, metrics.gridTop, metrics.gridWidth, metrics.gridHeight);
    assertRectInside(gridBounds, makeRect(0, 0, size.width, size.height), `desktop grid ${size.width}x${size.height}`);
    assert(metrics.cellWidth > 0 && metrics.cellHeight > 0, "desktop cells should keep positive dimensions");
    assertRectInside(getGridSlotRect(metrics, 0), gridBounds, `first desktop slot ${size.width}x${size.height}`);
    assertRectInside(getGridSlotRect(metrics, 23), gridBounds, `last desktop slot ${size.width}x${size.height}`);
  }

  const searchMetrics = getDesktopGridMetrics({
    cols: 6,
    height: 1080,
    isSearchMode: true,
    rows: 4,
    visibleCount: 3,
    width: 1920,
  });
  assert(searchMetrics.cols === 3, "search grid should shrink to the visible result count");
  assert(Math.abs(searchMetrics.gridLeft - (1920 - searchMetrics.gridWidth) / 2) < 0.001, "search grid should stay centered");

  const folderRowsToCheck = [1, 2, 5];
  for (const size of desktopSizes) {
    const geometry = getFolderPanelGeometry({
      height: size.height,
      panelStyle: { "--folder-shell-min-height": "520px" },
      width: size.width,
    });
    assertRectInside(geometry.panel, makeRect(0, 0, size.width, size.height), `folder panel ${size.width}x${size.height}`);
    assertRectInside(geometry.grid, geometry.panel, `folder grid ${size.width}x${size.height}`);
    assert(geometry.grid.height >= 280, "folder grid should preserve its minimum usable height");

    for (const rows of folderRowsToCheck) {
      const folderMetrics = getFolderGridMetrics({
        cols: 5,
        fixedCellHeight: 88,
        grid: geometry.grid,
        rowGap: 18,
        rows,
      });
      const folderGridBounds = makeRect(folderMetrics.gridLeft, folderMetrics.gridTop, folderMetrics.gridWidth, folderMetrics.gridHeight);
      assertRectInside(getGridSlotRect(folderMetrics, 0), folderGridBounds, `first folder slot ${rows} rows at ${size.width}x${size.height}`);
      assertRectInside(getGridSlotRect(folderMetrics, rows * 5 - 1), folderGridBounds, `last folder slot ${rows} rows at ${size.width}x${size.height}`);
    }
  }
}
