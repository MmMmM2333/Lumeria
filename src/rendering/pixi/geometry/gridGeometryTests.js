import { getFolderGridMetrics, getGridSlotRect, makeRect } from "./gridGeometry.js";

export function runGridGeometryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi grid geometry test failed] ${message}`);
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
}
