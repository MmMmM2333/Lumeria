import {
  clearIconBoundsRegistry,
  clearLaunchIconBounds,
  getLaunchIconBounds,
  getLaunchIconTargetBounds,
  getTopLevelIconBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
} from "./iconBoundsRegistry.js";

function rect(left) {
  return { left, top: 10, width: 20, height: 20 };
}

export function runIconBoundsRegistryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon bounds registry test failed] ${message}`);
  };

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
}
