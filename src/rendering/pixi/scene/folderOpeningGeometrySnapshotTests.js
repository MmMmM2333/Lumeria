import {
  getFolderOpeningPreviewChildRect,
  makeFolderOpeningGeometryLayoutKey,
  makeFolderOpeningGeometrySnapshot,
} from "./folderOpeningGeometrySnapshot.js";

export function runFolderOpeningGeometrySnapshotTests() {
  const assert = (condition, message) => {
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
      sessionToken: "open-a",
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

    assert(snapshot.coordinateSpace === "client-visual", "snapshot should declare client visual coordinates");
    assert(snapshot.folderRect.left === 100, "snapshot should clone the folder source rect");
    assert(snapshot.panelRect.width === 800, "snapshot should clone the panel target rect");
    assert(snapshot.panelCenter.x === 580 && snapshot.panelCenter.y === 380, "snapshot should retain the panel target center");
    const previewRect = getFolderOpeningPreviewChildRect(snapshot, { id: "app-b" }, 1);
    assert(previewRect.top === 136, "snapshot should clone preview child rects at capture time");
    previewRect.top = 777;
    assert(
      getFolderOpeningPreviewChildRect(snapshot, { id: "app-b" }, 1).top === 136,
      "preview child lookup should return cloned rects"
    );
  }
}
