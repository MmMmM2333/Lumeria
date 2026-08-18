import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
  makeIconBoundsKey,
} from "./iconBoundsRegistry.js";
import { stageLayoutRecordToClientRect } from "./stageCoordinates.js";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

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

function projectStageRecord(record) {
  return stageLayoutRecordToClientRect(record);
}

function previewKey(folderId, childId, slotIndex) {
  return { childId, folderId, slotIndex };
}

export function runIconBoundsRegistryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon bounds registry test failed] ${message}`);
  };
  const registry = createIconBoundsRegistry();
  const initialVersion = registry.getVersion();

  assert(makeIconBoundsKey(K.LAUNCH, { area: "desktop", id: "desktop-app", pageIndex: 2 }) === "desktop::2:desktop-app", "launch key should include area, page, and id");
  assert(makeIconBoundsKey(K.LAUNCH, { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 1 }) === "folder:folder-1:1:folder-app", "folder launch key should include folder id");
  assert(makeIconBoundsKey(K.TOP_LEVEL, "desktop-folder") === "desktop-folder", "top-level key should normalize id");
  assert(makeIconBoundsKey(K.PREVIEW_CHILD, previewKey("folder-1", "child-1", 3)) === "folder-1:child-1:3", "preview child key should include folder, child, and slot");
  assert(makeIconBoundsKey("unknown", { id: "x" }) === null, "unknown bounds key type should be rejected");

  registry.clearBounds();
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "desktop", id: "desktop-app", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-app", pageIndex: 0 }
  );
  assert(registry.getVersion() > initialVersion, "registering bounds should advance the registry version");
  const firstVersion = registry.getVersion();
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "desktop", id: "desktop-app", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-app", index: 99, pageIndex: 0 }
  );
  assert(registry.getVersion() === firstVersion, "re-registering identical geometry should keep the registry version stable");
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "desktop", id: "desktop-app", pageIndex: 0 },
    rect(11),
    { area: "desktop", id: "desktop-app", pageIndex: 0 }
  );
  assert(registry.getVersion() > firstVersion, "changing registered geometry should advance the registry version");
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 },
    rect(40),
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }
  );
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(70),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }
  );
  registry.registerBounds(
    K.LAUNCH,
    V.LIVE_TARGET,
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(90),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", index: 1, pageIndex: 0 }
  );

  const renderedRecord = registry.getRecord(K.LAUNCH, V.RENDERED, { area: "desktop", id: "desktop-app", pageIndex: 0 });
  assert(renderedRecord.meta.id === "desktop-app", "record lookup should preserve rendered bounds metadata");
  assert(!registry.getBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: "desktop-app", pageIndex: 0 }).meta, "rendered bounds lookup should keep returning a plain rect");

  registry.clearBounds({ area: "folder", folderId: "folder-1" });
  assert(!registry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }), "folder scoped clear should remove the target folder bounds");
  assert(registry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder scoped clear should keep other folders");
  assert(registry.getBounds(K.LAUNCH, V.LIVE_TARGET, { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }, { expected: { index: 1 } }), "folder scoped clear should keep other folder target bounds");
  assert(!registry.getBounds(K.LAUNCH, V.LIVE_TARGET, { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }, { expected: { index: 2 } }), "target bounds lookup should reject stale index metadata");
  assert(registry.getBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: "desktop-app", pageIndex: 0 }), "folder scoped clear should keep desktop launch bounds");
  assert(registry.getBounds(K.TOP_LEVEL, V.RENDERED, "desktop-app"), "folder scoped clear should keep desktop top-level bounds");
  assert(registry.getAtPoint(K.LAUNCH, 15, 15).id === "desktop-app", "launch icon at-point lookup should find desktop icons");
  assert(registry.getAtPoint(K.LAUNCH, 75, 15).id === "folder-app-2", "launch icon at-point lookup should find folder icons");
  assert(registry.getAtPoint(K.LAUNCH, 75, 15, { area: "desktop" }) === null, "launch icon at-point lookup should filter by area");
  assert(registry.getAtPoint(K.LAUNCH, 75, 15, { excludeId: "folder-app-2" }) === null, "launch icon at-point lookup should respect excluded ids");

  registry.clearBounds("folder");
  registry.clearBounds({ kind: K.PREVIEW_CHILD });
  assert(!registry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder area clear should remove remaining folder bounds");
  assert(!registry.getBounds(K.LAUNCH, V.LIVE_TARGET, { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "folder area clear should remove remaining folder target bounds");
  assert(registry.getBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: "desktop-app", pageIndex: 0 }), "folder area clear should still keep desktop bounds");

  registry.clearBounds();
  const stageMeta = {
    area: "desktop",
    id: "desktop-folder",
    pageIndex: 0,
    stageHeight: 100,
    stageRect: { height: 200, left: 100, top: 50, width: 200 },
    stageWidth: 100,
  };
  registry.registerBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder", rect(10), stageMeta);
  registry.registerBounds(
    K.LAUNCH,
    V.STABLE_STAGE_LAYOUT,
    { area: "desktop", id: "desktop-folder", pageIndex: 0 },
    rect(11),
    stageMeta
  );
  registry.registerBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder", rect(12), stageMeta);
  registry.registerBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, previewKey("desktop-folder", "desktop-app", 0), rect(14), stageMeta);
  assert(registry.getBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder").left === 10, "stage layout top-level icon target should preserve layout coordinates");
  assert(
    registry.getBounds(
      K.LAUNCH,
      V.STABLE_STAGE_LAYOUT,
      { area: "desktop", id: "desktop-folder", pageIndex: 0 },
      { expected: { area: "desktop", id: "desktop-folder", pageIndex: 0 } }
    ).left === 11,
    "stage layout launch icon target record should preserve layout coordinates"
  );
  assert(
    registry.getBounds(
      K.LAUNCH,
      V.STABLE_STAGE_LAYOUT,
      { area: "desktop", id: "desktop-folder", pageIndex: 0 },
      { expected: { area: "desktop", id: "desktop-folder", pageIndex: 1 } }
    ) === null,
    "stage layout launch icon target lookup should reject stale metadata"
  );
  assert(registry.getBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder").meta.stageRect.left === 100, "stage layout top-level icon target record should preserve stage metadata");
  assert(projectStageRecord(registry.getBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder")).left === 120, "stage layout top-level icon target should project to client coordinates");
  assert(registry.getBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder").left === 12, "stage layout folder thumb target should preserve layout coordinates");
  assert(registry.getBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder").meta.stageRect.left === 100, "stage layout folder thumb target record should preserve stage metadata");
  assert(projectStageRecord(registry.getBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder")).left === 124, "stage layout folder thumb target should project to client coordinates");
  assert(registry.getBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, previewKey("desktop-folder", "desktop-app", 0)).left === 14, "stage layout preview child target should preserve layout coordinates");
  assert(registry.getBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, previewKey("desktop-folder", "desktop-app", 0)).meta.stageRect.left === 100, "stage layout preview child target record should preserve stage metadata");
  assert(projectStageRecord(registry.getBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, previewKey("desktop-folder", "desktop-app", 0))).left === 128, "stage layout preview child target should project to client coordinates");

  registry.clearBounds();
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "desktop", id: "desktop-folder", pageIndex: 0 },
    rect(10),
    { area: "desktop", id: "desktop-folder", pageIndex: 0 }
  );
  registry.registerBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder", rect(14), identityStageMeta({ area: "desktop", id: "desktop-folder", pageIndex: 0 }));
  registry.registerBounds(K.TOP_LEVEL, V.LIVE_TARGET, "desktop-folder", rect(15), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registry.registerBounds(K.FOLDER_THUMB, V.RENDERED, "desktop-folder", rect(12), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registry.registerBounds(K.FOLDER_THUMB, V.LIVE_TARGET, "desktop-folder", rect(13), { area: "desktop", id: "desktop-folder", pageIndex: 0 });
  registry.registerBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder", rect(16), identityStageMeta({ area: "desktop", id: "desktop-folder", pageIndex: 0 }));
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 },
    rect(40),
    { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }
  );
  registry.registerBounds(K.PREVIEW_CHILD, V.RENDERED, previewKey("folder-1", "folder-app-1", 0), rect(44));
  registry.registerBounds(K.PREVIEW_CHILD, V.LIVE_TARGET, previewKey("folder-1", "folder-app-1", 0), rect(46));
  registry.registerBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, previewKey("folder-1", "folder-app-1", 0), rect(48), identityStageMeta({ area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }));

  registry.clearBounds("folder");
  assert(registry.getBounds(K.TOP_LEVEL, V.RENDERED, "desktop-folder"), "folder scoped icon clear should keep desktop top-level icon bounds");
  assert(registry.getBounds(K.TOP_LEVEL, V.LIVE_TARGET, "desktop-folder"), "folder scoped icon clear should keep desktop top-level live target bounds");
  assert(registry.getBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder"), "folder scoped icon clear should keep desktop top-level target bounds");
  assert(registry.getBounds(K.FOLDER_THUMB, V.RENDERED, "desktop-folder"), "folder scoped icon clear should keep desktop folder thumb bounds");
  assert(registry.getBounds(K.FOLDER_THUMB, V.LIVE_TARGET, "desktop-folder"), "folder scoped icon clear should keep desktop folder thumb live target bounds");
  assert(registry.getBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder"), "folder scoped icon clear should keep desktop folder thumb target bounds");
  assert(!registry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-1", id: "folder-app-1", pageIndex: 0 }), "folder scoped icon clear should remove folder launch bounds");
  registry.clearBounds({ kind: K.PREVIEW_CHILD });
  assert(!registry.getBounds(K.PREVIEW_CHILD, V.RENDERED, previewKey("folder-1", "folder-app-1", 0)), "folder scoped icon clear should remove folder preview child bounds");
  assert(!registry.getBounds(K.PREVIEW_CHILD, V.LIVE_TARGET, previewKey("folder-1", "folder-app-1", 0)), "folder scoped icon clear should remove folder preview child live target bounds");
  assert(!registry.getBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, previewKey("folder-1", "folder-app-1", 0)), "folder scoped icon clear should remove folder preview child target bounds");

  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "search", id: "search-app", pageIndex: 0 },
    rect(80),
    { area: "search", id: "search-app", pageIndex: 0 }
  );
  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 },
    rect(90),
    { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }
  );

  registry.clearBounds("desktop");
  registry.clearBounds("search");
  assert(!registry.getBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: "desktop-folder", pageIndex: 0 }), "desktop scoped icon clear should remove desktop launch bounds");
  assert(!registry.getBounds(K.LAUNCH, V.RENDERED, { area: "search", id: "search-app", pageIndex: 0 }), "desktop scoped icon clear should remove search launch bounds");
  assert(!registry.getBounds(K.TOP_LEVEL, V.RENDERED, "desktop-folder"), "desktop scoped icon clear should remove desktop top-level bounds");
  assert(!registry.getBounds(K.TOP_LEVEL, V.LIVE_TARGET, "desktop-folder"), "desktop scoped icon clear should remove desktop top-level live target bounds");
  assert(!registry.getBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, "desktop-folder"), "desktop scoped icon clear should remove desktop top-level target bounds");
  assert(!registry.getBounds(K.FOLDER_THUMB, V.LIVE_TARGET, "desktop-folder"), "desktop scoped icon clear should remove desktop folder thumb live target bounds");
  assert(!registry.getBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, "desktop-folder"), "desktop scoped icon clear should remove desktop folder thumb target bounds");
  assert(registry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-2", id: "folder-app-2", pageIndex: 0 }), "desktop scoped icon clear should keep folder launch bounds");

  registry.clearBounds();
}
