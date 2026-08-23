export interface DragRenderSnapshotSource<DragMeta = unknown, GroupDragState = unknown> {
  dragMeta?: DragMeta | null;
  groupDragState?: GroupDragState | null;
}

export interface DragRenderSnapshot<DragMeta = unknown, GroupDragState = unknown> {
  readonly dragMeta: DragMeta | null;
  readonly groupDragState: GroupDragState | null;
}

export function createDragRenderSnapshot<DragMeta = unknown, GroupDragState = unknown>(
  source: DragRenderSnapshotSource<DragMeta, GroupDragState> = {},
): Readonly<DragRenderSnapshot<DragMeta, GroupDragState>> {
  const dragMeta = source.dragMeta || null;
  const groupDragState = source.groupDragState || null;

  return Object.freeze({
    dragMeta,
    groupDragState,
  });
}
