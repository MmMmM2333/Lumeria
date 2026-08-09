import { createDragRenderSnapshot } from "./dragRenderSnapshot.js";
export function runDragRenderSnapshotTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi drag render snapshot test failed] ${message}`);
  };

  const item = { id: "app-a", type: "app" };
  const groupDragState = { key: "group-a", entries: [{ item }] };
  const dragMeta = { draggedIds: [item.id], item };
  const grouping = createDragRenderSnapshot({ dragMeta, groupDragState });
  assert(Object.isFrozen(grouping), "frame drag state should not be rewritten by individual scene layers");
  assert(grouping.dragMeta === dragMeta, "scene layers should share one captured ownership descriptor");
  assert(grouping.groupDragState === groupDragState, "group presentation state should be captured once with the drag frame");
}
