export function createDragRenderSnapshot(source = {}) {
  const dragMeta = source.dragMeta || null;
  const dragPreviewState = source.dragPreviewState || null;
  const dragReleaseState = source.dragReleaseState || null;

  return Object.freeze({
    dragMeta,
    dragPreviewState,
    dragReleaseGhostId: dragReleaseState?.item?.id || null,
    dragReleaseState,
  });
}
