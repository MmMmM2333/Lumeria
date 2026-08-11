import { GROUP_RELEASE_MODE } from "../../../domain/groupReleasePlan.js";

const GROUP_RETURN_PHASES = new Set(["cancelling", "rejected"]);

export function getActiveDragItemId(state) {
  return state?.dragMeta?.item?.id || null;
}

export function getActiveDragItemIds(state) {
  const ids = Array.isArray(state?.dragMeta?.draggedIds)
    ? state.dragMeta.draggedIds
    : [getActiveDragItemId(state)];
  return new Set(ids.filter(Boolean));
}

export function isActiveDraggedLaunchItem(item, state) {
  return Boolean(item?.id && getActiveDragItemIds(state).has(item.id));
}

export function getReturningGroupDragItemIds(state) {
  const group = state?.groupDragState;
  if (
    state?.isBatchSelectionActive !== true ||
    !GROUP_RETURN_PHASES.has(group?.phase)
  ) return new Set();
  return new Set(
    (group.releasePlan?.entries || [])
      .filter((entry) => entry?.mode === GROUP_RELEASE_MODE.RETURN_TO_ORIGIN)
      .map((entry) => entry.id)
      .filter(Boolean)
  );
}
