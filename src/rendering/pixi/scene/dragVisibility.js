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
