export function createDragRenderSnapshot(source = {}) {
  const dragMeta = source.dragMeta || null;
  const groupDragState = source.groupDragState || null;

  return Object.freeze({
    dragMeta,
    groupDragState,
  });
}
