export function isSameLaunchItemId(item, id) {
  return Boolean(item?.id && id && item.id === id);
}

export function getActiveDragItemId(state) {
  return state?.dragMeta?.item?.id || null;
}

export function getReleaseGhostItemId(state) {
  return state?.dragReleaseGhostId || null;
}

export function isActiveDraggedLaunchItem(item, state) {
  return isSameLaunchItemId(item, getActiveDragItemId(state));
}

export function isReleaseGhostLaunchItem(item, state) {
  return isSameLaunchItemId(item, getReleaseGhostItemId(state));
}
