import { getFolderPreviewMotionPlan } from "./folderThumbPreviewMotion.js";

export function runFolderThumbPreviewMotionTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Folder thumb preview motion test failed] ${message}`);
  }

  const items = Array.from({ length: 17 }, (_, index) => ({ id: `app-${index + 1}` }));
  const plan = getFolderPreviewMotionPlan({ childPages: [items] }, 17, { childSize: 10, gap: 2 });
  assert(plan.items.length === 17, "motion plan should use the first folder page items");
  assert(plan.rowCount === 6, "seventeen items should occupy six thumbnail rows");
  assert(plan.scrollRows === 3, "seventeen items should scroll three rows to reveal the last eight items");
  assert(plan.endY === -36, "end offset should move by the row stride for each hidden row");

  const shortPlan = getFolderPreviewMotionPlan({ childPages: [items.slice(0, 8)] }, 17, { childSize: 10, gap: 2 });
  assert(shortPlan.scrollRows === 0, "fewer than nine items should not scroll");
  assert(shortPlan.endY === 0, "non-scrolling plans should end at the resting offset");

  const pagedPlan = getFolderPreviewMotionPlan({ childPages: [items.slice(0, 12), items.slice(12)] }, 9, { childSize: 10, gap: 2 });
  assert(pagedPlan.items.length === 9, "motion plan should respect the folder page size limit");
}
