import {
  makeFolderIconRenderPlan,
  makeFolderIconTargetCenter,
} from "./folderOverlayIconPlan.js";

export function runFolderOverlayIconPlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay icon plan test failed] ${message}`);
  };

  const geometry = {
    grid: { width: 500 },
    panel: { left: 100, top: 60 },
  };
  const slot = { height: 80, left: 30, top: 40, width: 100 };
  const plan = makeFolderIconRenderPlan({
    folderId: "folder-1",
    geometry,
    index: 3,
    item: { id: "app-1" },
    pageIndex: 2,
    slot,
  });

  assert(plan.key === "folder-1:2:app-1", "folder icon plan should include folder, page, and item id in its key");
  assert(plan.x === 1080 && plan.y === 80, "folder icon plan should position items inside the paged grid");
  assert(plan.source.type === "folder" && plan.source.folderId === "folder-1", "folder icon plan should build folder source metadata");
  assert(plan.source.index === 3 && plan.source.slotIndex === 3 && plan.source.pageIndex === 2, "folder icon plan should preserve index metadata");

  const normalTarget = makeFolderIconTargetCenter({
    geometry,
    isTextlessMode: false,
    targetTrackX: -500,
    x: plan.x,
    y: plan.y,
  });
  assert(normalTarget.x === 680 && normalTarget.y === 126, "target center should include panel, track, and normal visual offset");

  const textlessTarget = makeFolderIconTargetCenter({
    geometry,
    isTextlessMode: true,
    targetTrackX: -500,
    x: plan.x,
    y: plan.y,
  });
  assert(textlessTarget.x === 680 && textlessTarget.y === 140, "textless target center should remove the visual offset");
}
