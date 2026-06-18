import {
  clearDesktopIconBounds,
  clearFolderIconBounds,
  clearIconBoundsRegistry,
  clearLaunchIconBounds,
  getFolderPreviewChildBounds,
  getFolderPreviewChildLiveTargetBounds,
  getFolderPreviewChildTargetBounds,
  getLaunchIconBounds,
  getLaunchIconTargetBounds,
  getTopLevelFolderThumbBounds,
  getTopLevelFolderThumbLiveTargetBounds,
  getTopLevelFolderThumbTargetBounds,
  getTopLevelIconBounds,
  getTopLevelIconLiveTargetBounds,
  getTopLevelIconTargetBounds,
  makeIconBoundsKey,
  registerFolderPreviewChildBounds,
  registerFolderPreviewChildLiveTargetBounds,
  registerFolderPreviewChildTargetBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
  registerTopLevelFolderThumbBounds,
  registerTopLevelFolderThumbLiveTargetBounds,
  registerTopLevelFolderThumbTargetBounds,
  registerTopLevelIconLiveTargetBounds,
  registerTopLevelIconTargetBounds,
} from "./iconBoundsRegistry.js";

function rect(left) {
  return { left, top: 10, width: 20, height: 20 };
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
  registerLaunchIconBounds(
    { area: "desktop", id: "desktop-app", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-app", pageIndex: 0 }
  );
  registerLaunchIconBounds(
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 },
    rect(40),
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }
  );
  registerLaunchIconBounds(
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(70),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }
  );
  registerLaunchIconTargetBounds(
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(90),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", index: 1, pageIndex: 0 }
  );

  clearLaunchIconBounds({ area: "folder", folderId: "folder-1" });
  assert(!getLaunchIconBounds({ area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }), "folder scoped clear should remove the target folder bounds");
  assert(getLaunchIconBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder scoped clear should keep other folders");
  assert(getLaunchIconTargetBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }, { index: 1 }), "folder scoped clear should keep other folder target bounds");
  assert(!getLaunchIconTargetBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }, { index: 2 }), "target bounds lookup should reject stale index metadata");
  assert(getLaunchIconBounds({ area: "desktop", id: "desktop-app", pageIndex: 0 }), "folder scoped clear should keep desktop launch bounds");
  assert(getTopLevelIconBounds("desktop-app"), "folder scoped clear should keep desktop top-level bounds");

  clearLaunchIconBounds("folder");
  assert(!getLaunchIconBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder area clear should remove remaining folder bounds");
  assert(!getLaunchIconTargetBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder area clear should remove remaining folder target bounds");
  assert(getLaunchIconBounds({ area: "desktop", id: "desktop-app", pageIndex: 0 }), "folder area clear should still keep desktop bounds");

  clearIconBoundsRegistry();
  registerLaunchIconBounds(
    { area: "desktop", id: "desktop-folder", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-folder", pageIndex: 0 }
  );
  registerTopLevelIconTargetBounds("desktop-folder", rect(14), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerTopLevelIconLiveTargetBounds("desktop-folder", rect(15), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerTopLevelFolderThumbBounds("desktop-folder", rect(12), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerTopLevelFolderThumbLiveTargetBounds("desktop-folder", rect(13), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerTopLevelFolderThumbTargetBounds("desktop-folder", rect(16), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registerLaunchIconBounds(
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 },
    rect(40),
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }
  );
  registerFolderPreviewChildBounds("folder-1", "folder-app-1", 0, rect(44));
  registerFolderPreviewChildLiveTargetBounds("folder-1", "folder-app-1", 0, rect(46));
  registerFolderPreviewChildTargetBounds("folder-1", "folder-app-1", 0, rect(48));

  clearFolderIconBounds();
  assert(getTopLevelIconBounds("desktop-folder"), "folder scoped icon clear should keep desktop top-level icon bounds");
  assert(getTopLevelIconLiveTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop top-level live target bounds");
  assert(getTopLevelIconTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop top-level target bounds");
  assert(getTopLevelFolderThumbBounds("desktop-folder"), "folder scoped icon clear should keep desktop folder thumb bounds");
  assert(getTopLevelFolderThumbLiveTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop folder thumb live target bounds");
  assert(getTopLevelFolderThumbTargetBounds("desktop-folder"), "folder scoped icon clear should keep desktop folder thumb target bounds");
  assert(!getLaunchIconBounds({ area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }), "folder scoped icon clear should remove folder launch bounds");
  assert(!getFolderPreviewChildBounds("folder-1", "folder-app-1", 0), "folder scoped icon clear should remove folder preview child bounds");
  assert(!getFolderPreviewChildLiveTargetBounds("folder-1", "folder-app-1", 0), "folder scoped icon clear should remove folder preview child live target bounds");
  assert(!getFolderPreviewChildTargetBounds("folder-1", "folder-app-1", 0), "folder scoped icon clear should remove folder preview child target bounds");

  registerLaunchIconBounds(
    { area: "search", id: "search-app", pageIndex: 0 },
    rect(80),
    { area: "search", id: "search-app", pageIndex: 0 }
  );
  registerLaunchIconBounds(
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(90),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }
  );

  clearDesktopIconBounds();
  assert(!getLaunchIconBounds({ area: "desktop", id: "desktop-folder", pageIndex: 0 }), "desktop scoped icon clear should remove desktop launch bounds");
  assert(!getLaunchIconBounds({ area: "search", id: "search-app", pageIndex: 0 }), "desktop scoped icon clear should remove search launch bounds");
  assert(!getTopLevelIconBounds("desktop-folder"), "desktop scoped icon clear should remove desktop top-level bounds");
  assert(!getTopLevelIconLiveTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop top-level live target bounds");
  assert(!getTopLevelIconTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop top-level target bounds");
  assert(!getTopLevelFolderThumbLiveTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop folder thumb live target bounds");
  assert(!getTopLevelFolderThumbTargetBounds("desktop-folder"), "desktop scoped icon clear should remove desktop folder thumb target bounds");
  assert(getLaunchIconBounds({ area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "desktop scoped icon clear should keep folder launch bounds");

  clearIconBoundsRegistry();
}
