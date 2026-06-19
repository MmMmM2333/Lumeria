import {
  clearDesktopIconBounds,
  clearFolderIconBounds,
  clearIconBoundsRegistry,
  clearLaunchIconBounds,
  getLiveClientFolderPreviewChildTargetBounds,
  getLiveClientLaunchIconTargetBounds,
  getLiveClientTopLevelFolderThumbTargetBounds,
  getLiveClientTopLevelIconTargetBounds,
  getRenderedClientFolderPreviewChildBounds,
  getRenderedClientLaunchIconBounds,
  getRenderedClientTopLevelFolderThumbBounds,
  getRenderedClientTopLevelIconBounds,
  getStableClientFolderPreviewChildTargetBounds,
  getStableClientTopLevelFolderThumbTargetBounds,
  getStableClientTopLevelIconTargetBounds,
  getStableStageLayoutFolderPreviewChildTargetBounds,
  getStableStageLayoutFolderPreviewChildTargetRecord,
  getStableStageLayoutTopLevelFolderThumbTargetBounds,
  getStableStageLayoutTopLevelFolderThumbTargetRecord,
  getStableStageLayoutTopLevelIconTargetBounds,
  getStableStageLayoutTopLevelIconTargetRecord,
  makeIconBoundsKey,
  registerLiveClientFolderPreviewChildTargetBounds,
  registerLiveClientLaunchIconTargetBounds,
  registerLiveClientTopLevelFolderThumbTargetBounds,
  registerLiveClientTopLevelIconTargetBounds,
  registerRenderedClientFolderPreviewChildBounds,
  registerRenderedClientLaunchIconBounds,
  registerRenderedClientTopLevelFolderThumbBounds,
  registerStableStageLayoutFolderPreviewChildTargetBounds,
  registerStableStageLayoutTopLevelFolderThumbTargetBounds,
  registerStableStageLayoutTopLevelIconTargetBounds,
} from "./iconBoundsRegistry.js";

function rect(left) {
  return { left, top: 10, width: 20, height: 20 };
}

function identityStageMeta(meta = {}) {
  return {
    stageHeight: 100,
    stageRect: { height: 100, left: 0, top: 0, width: 100 },
    stageWidth: 100,
    ...meta,
  };
}

export function runIconBoundsRegistryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon bounds registry test failed] ${message}`);
  };

  assert(makeIconBoundsKey("launch", { area: "desktop", id: "desktop-app", pageIndex: 2 }) === "desktop::2:desktop-app", "launch key should include area, page, and id");
  assert(makeIconBoundsKey("launch", { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 1 }) === "folder:folder-1:1:folder-app", "folder launch key should include folder id");
  assert(makeIconBoundsKey("top-level", "desktop-folder") === "desktop-folder", "top-level key should normalize id");
  assert(makeIconBoundsKey("folder-preview-child", { folderId: "folder-1", childId: "child-1", slotIndex: 3 }) === "folder-1:child-1:3", "preview child key should include folder, child, and slot");
  assert(makeIconBoundsKey("unknown", { id: "x" }) === null, "unknown bounds key type should be rejected");

  clearIconBoundsRegistry();
  registerRenderedClientLaunchIconBounds(
    { area: "desktop", id: "desktop-app", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-app", pageIndex: 0 }
  );
  registerRenderedClientLaunchIconBounds(
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 },
    rect(40),
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }
  );
  registerRenderedClientLaunchIconBounds(
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(70),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }
  );
  registerLiveClientLaunchIconTargetBounds(
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(90),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", index: 1, pageIndex: 0 }
  );

  clearLaunchIconBounds({ area: "folder", folderId: "folder-1" });
  assert(!getRenderedClientLaunchIconBounds({ area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }), "folder scoped clear should remove the target folder bounds");
  assert(getRenderedClientLaunchIconBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder scoped clear should keep other folders");
  assert(getLiveClientLaunchIconTargetBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }, { index: 1 }), "folder scoped clear should keep other folder target bounds");
  assert(!getLiveClientLaunchIconTargetBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }, { index: 2 }), "target bounds lookup should reject stale index metadata");
  assert(getRenderedClientLaunchIconBounds({ area: "desktop", id: "desktop-app", pageIndex: 0 }), "folder scoped clear should keep desktop launch bounds");
  assert(getRenderedClientTopLevelIconBounds("desktop-app"), "folder scoped clear should keep desktop top-level bounds");

  clearLaunchIconBounds("folder");
  assert(!getRenderedClientLaunchIconBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder area clear should remove remaining folder bounds");
  assert(!getLiveClientLaunchIconTargetBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder area clear should remove remaining folder target bounds");
  assert(getRenderedClientLaunchIconBounds({ area: "desktop", id: "desktop-app", pageIndex: 0 }), "folder area clear should still keep desktop bounds");

  clearIconBoundsRegistry();
  const stageMeta = {
    area: "desktop",
    id: "desktop-folder",
    pageIndex: 0,
    stageHeight: 100,
    stageRect: { height: 200, left: 100, top: 50, width: 200 },
    stageWidth: 100,
  };
  registerStableStageLayoutTopLevelIconTargetBounds("desktop-folder", rect(10), stageMeta);
  registerStableStageLayoutTopLevelFolderThumbTargetBounds("desktop-folder", rect(12), stageMeta);
  registerStableStageLayoutFolderPreviewChildTargetBounds("desktop-folder", "desktop-app", 0, rect(14), stageMeta);
  assert(getStableStageLayoutTopLevelIconTargetBounds("desktop-folder").left === 10, "stage layout top-level icon target should preserve layout coordinates");
  assert(getStableStageLayoutTopLevelIconTargetRecord("desktop-folder").meta.stageRect.left === 100, "stage layout top-level icon target record should preserve stage metadata");
  assert(getStableClientTopLevelIconTargetBounds("desktop-folder").left === 120, "stage layout top-level icon target should project to client coordinates");
  assert(getStableStageLayoutTopLevelFolderThumbTargetBounds("desktop-folder").left === 12, "stage layout folder thumb target should preserve layout coordinates");
  assert(getStableStageLayoutTopLevelFolderThumbTargetRecord("desktop-folder").meta.stageRect.left === 100, "stage layout folder thumb target record should preserve stage metadata");
  assert(getStableClientTopLevelFolderThumbTargetBounds("desktop-folder").left === 124, "stage layout folder thumb target should project to client coordinates");
  assert(getStableStageLayoutFolderPreviewChildTargetBounds("desktop-folder", "desktop-app", 0).left === 14, "stage layout preview child target should preserve layout coordinates");
  assert(getStableStageLayoutFolderPreviewChildTargetRecord("desktop-folder", "desktop-app", 0).meta.stageRect.left === 100, "stage layout preview child target record should preserve stage metadata");
  assert(getStableClientFolderPreviewChildTargetBounds("desktop-folder", "desktop-app", 0).left === 128, "stage layout preview child target should project to client coordinates");

  clearIconBoundsRegistry();
  registerRenderedClientLaunchIconBounds(
    { area: "desktop", id: "desktop-folder", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-folder", pageIndex: 0 }
  );
  registerStableStageLayoutTopLevelIconTargetBounds("desktop-folder", rect(14), identityStageMeta({ area: "desktop", id: "desktop-folder", pageIndex: 0 }));
  registerLiveClientTopLevelIconTargetBounds("desktop-folder", rect(15), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerRenderedClientTopLevelFolderThumbBounds("desktop-folder", rect(12), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerLiveClientTopLevelFolderThumbTargetBounds("desktop-folder", rect(13), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerStableStageLayoutTopLevelFolderThumbTargetBounds("desktop-folder", rect(16), identityStageMeta({ area: "desktop", id: "desktop-folder", pageIndex: 0 }));
  registerRenderedClientLaunchIconBounds(
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 },
    rect(40),
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }
  );
  registerRenderedClientFolderPreviewChildBounds("folder-1", "folder-app-1", 0, rect(44));
  registerLiveClientFolderPreviewChildTargetBounds("folder-1", "folder-app-1", 0, rect(46));
  registerStableStageLayoutFolderPreviewChildTargetBounds("folder-1", "folder-app-1", 0, rect(48), identityStageMeta({ area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }));

  clearFolderIconBounds();
  assert(getRenderedClientTopLevelIconBounds("desktop-folder"), "folder scoped icon clear should keep desktop top-level icon bounds");
  assert(getLiveClientTopLevelIconTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop top-level live target bounds");
  assert(getStableClientTopLevelIconTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop top-level target bounds");
  assert(getRenderedClientTopLevelFolderThumbBounds("desktop-folder"), "folder scoped icon clear should keep desktop folder thumb bounds");
  assert(getLiveClientTopLevelFolderThumbTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop folder thumb live target bounds");
  assert(getStableClientTopLevelFolderThumbTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop folder thumb target bounds");
  assert(!getRenderedClientLaunchIconBounds({ area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }), "folder scoped icon clear should remove folder launch bounds");
  assert(!getRenderedClientFolderPreviewChildBounds("folder-1", "folder-app-1", 0), "folder scoped icon clear should remove folder preview child bounds");
  assert(!getLiveClientFolderPreviewChildTargetBounds("folder-1", "folder-app-1", 0), "folder scoped icon clear should remove folder preview child live target bounds");
  assert(!getStableClientFolderPreviewChildTargetBounds("folder-1", "folder-app-1", 0), "folder scoped icon clear should remove folder preview child target bounds");

  registerRenderedClientLaunchIconBounds(
    { area: "search", id: "search-app", pageIndex: 0 },
    rect(80),
    { area: "search", id: "search-app", pageIndex: 0 }
  );
  registerRenderedClientLaunchIconBounds(
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(90),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }
  );

  clearDesktopIconBounds();
  assert(!getRenderedClientLaunchIconBounds({ area: "desktop", id: "desktop-folder", pageIndex: 0 }), "desktop scoped icon clear should remove desktop launch bounds");
  assert(!getRenderedClientLaunchIconBounds({ area: "search", id: "search-app", pageIndex: 0 }), "desktop scoped icon clear should remove search launch bounds");
  assert(!getRenderedClientTopLevelIconBounds("desktop-folder"), "desktop scoped icon clear should remove desktop top-level bounds");
  assert(!getLiveClientTopLevelIconTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop top-level live target bounds");
  assert(!getStableClientTopLevelIconTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop top-level target bounds");
  assert(!getLiveClientTopLevelFolderThumbTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop folder thumb live target bounds");
  assert(!getStableClientTopLevelFolderThumbTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop folder thumb target bounds");
  assert(getRenderedClientLaunchIconBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "desktop scoped icon clear should keep folder launch bounds");

  clearIconBoundsRegistry();
}
