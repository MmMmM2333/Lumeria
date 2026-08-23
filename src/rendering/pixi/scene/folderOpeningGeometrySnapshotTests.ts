import {
  getFolderOpeningPreviewChildRect,
  makeFolderOpeningGeometryLayoutKey,
  makeFolderOpeningGeometrySnapshot,
} from "./folderOpeningGeometrySnapshot.js";

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(`[Folder opening geometry snapshot test setup failed] ${message}`);
  return value;
}

export function runFolderOpeningGeometrySnapshotTests(): void {
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`[Folder opening geometry snapshot test failed] ${message}`);
  };

  {
    const key = makeFolderOpeningGeometryLayoutKey({
      stageHeight: 600,
      stageRect: { height: 600.456, left: 10.123, top: 20.456, width: 1000.789 },
      stageWidth: 1000,
      targetKey: "folder-1:target",
    });
    assert(
      key === "folder-1:target:10.12:20.46:1000.79:600.46:1000:600",
      "layout key should normalize target and stage geometry"
    );
  }

  {
    const folderRect = { height: 72, left: 100, top: 120, width: 72 };
    const panelRect = { height: 360, left: 180, top: 200, width: 800 };
    const childRect = { height: 12, left: 116, top: 136, width: 12 };
    const snapshot = makeFolderOpeningGeometrySnapshot({
      folderId: "folder-1",
      folderRect,
      getPreviewChildRect: (item, slotIndex) => item.id === "app-b" && slotIndex === 1 ? childRect : null,
      layoutKey: "layout-a",
      panelRect,
      previewSlots: [{ id: "app-a" }, { id: "app-b" }],
      stageHeight: 600,
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
      stageWidth: 1000,
      targetKey: "target-a",
      targetX: 580,
      targetY: 380,
    });

    folderRect.left = 999;
    panelRect.width = 999;
    childRect.top = 999;

    const sourceFolderRect = requireValue(snapshot.source.folderRect, "snapshot should contain the source folder rect");
    const targetPanelRect = requireValue(snapshot.target.panelRect, "snapshot should contain the target panel rect");
    const clientStageRect = requireValue(snapshot.projection.clientStageRect, "snapshot should contain the client stage projection rect");

    assert(snapshot.source.coordinateSpace === "client-visual", "snapshot source should declare client visual coordinates");
    assert(snapshot.target.coordinateSpace === "stage-layout", "snapshot target should declare stage layout coordinates");
    assert(sourceFolderRect.left === 100, "snapshot should clone the folder source rect");
    assert(targetPanelRect.width === 800, "snapshot should clone the panel target rect");
    assert(snapshot.target.panelCenter.x === 580 && snapshot.target.panelCenter.y === 380, "snapshot should retain the panel target center");
    assert(clientStageRect.width === 1000, "snapshot should retain the client stage projection rect");
    assert(snapshot.projection.stageWidth === 1000 && snapshot.projection.stageHeight === 600, "snapshot should retain stage layout dimensions");
    const previewRect = requireValue(
      getFolderOpeningPreviewChildRect(snapshot, { id: "app-b" }, 1),
      "snapshot should contain the requested preview child rect",
    );
    assert(previewRect.top === 136, "snapshot should clone preview child rects at capture time");
    // This test intentionally mutates the returned clone across the readonly production boundary.
    Reflect.set(previewRect, "top", 777);
    const rereadPreviewRect = requireValue(
      getFolderOpeningPreviewChildRect(snapshot, { id: "app-b" }, 1),
      "snapshot should still contain the preview child rect after clone mutation",
    );
    assert(
      rereadPreviewRect.top === 136,
      "preview child lookup should return cloned rects"
    );
  }
}
