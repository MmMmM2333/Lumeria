import {
  getActiveDragItemId,
  getReleaseGhostItemId,
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
  isSameLaunchItemId,
} from "./dragVisibility.js";

export function runDragVisibilityTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi drag visibility test failed] ${message}`);
  };

  const item = { id: "app-a" };
  const state = {
    dragMeta: { item: { id: "app-a" } },
    dragReleaseGhostId: "app-b",
  };

  assert(isSameLaunchItemId(item, "app-a"), "matching ids should compare as the same launch item");
  assert(!isSameLaunchItemId(item, "app-b"), "different ids should not compare as the same launch item");
  assert(getActiveDragItemId(state) === "app-a", "active drag item id should come from dragMeta");
  assert(getReleaseGhostItemId(state) === "app-b", "release ghost id should come from dragReleaseGhostId");
  assert(isActiveDraggedLaunchItem(item, state), "active dragged item should be detected");
  assert(!isActiveDraggedLaunchItem({ id: "app-b" }, state), "non-active item should not be marked active dragged");
  assert(isReleaseGhostLaunchItem({ id: "app-b" }, state), "release ghost item should be detected");
  assert(!isReleaseGhostLaunchItem(item, state), "active drag item should not be mistaken for release ghost item");
}
