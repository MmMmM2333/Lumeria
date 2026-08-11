import {
  getActiveDragItemId,
  getActiveDragItemIds,
  getReturningGroupDragItemIds,
  isActiveDraggedLaunchItem,
} from "./dragVisibility.js";

export function runDragVisibilityTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi drag visibility test failed] ${message}`);
  };

  const item = { id: "app-a" };
  const state = {
    dragMeta: { item: { id: "app-a" } },
  };

  assert(getActiveDragItemId(state) === "app-a", "active drag item id should come from dragMeta");
  assert(getActiveDragItemIds(state).has("app-a"), "a single drag should normalize into an active id set");
  assert(isActiveDraggedLaunchItem(item, state), "active dragged item should be detected");
  assert(!isActiveDraggedLaunchItem({ id: "app-b" }, state), "non-active item should not be marked active dragged");

  const groupState = {
    dragMeta: {
      draggedIds: ["app-a", "app-c"],
      item: { id: "app-a" },
    },
  };
  assert(isActiveDraggedLaunchItem({ id: "app-c" }, groupState), "every app owned by a group drag should hide its real node");
  assert(!isActiveDraggedLaunchItem({ id: "app-d" }, groupState), "unselected apps should remain visible during a group drag");

  const returnState = {
    ...groupState,
    groupDragState: {
      phase: "cancelling",
      releasePlan: {
        entries: [
          { id: "app-a", mode: "return-to-origin" },
          { id: "app-c", mode: "point-handoff" },
        ],
      },
    },
    isBatchSelectionActive: true,
  };
  assert(getReturningGroupDragItemIds(returnState).has("app-a"), "batch origin returns should expose deferred label reveal ids");
  assert(!getReturningGroupDragItemIds(returnState).has("app-c"), "non-return release lanes should not defer label reveal");
  assert(
    getReturningGroupDragItemIds({ ...returnState, isBatchSelectionActive: false }).size === 0,
    "ordinary single-drag releases should keep their existing label behavior"
  );
}
