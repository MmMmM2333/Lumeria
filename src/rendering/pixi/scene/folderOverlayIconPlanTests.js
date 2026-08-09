import {
  makeFolderIconNodeState,
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

  const panelSpacedPlan = makeFolderIconRenderPlan({
    folderId: "folder-1",
    geometry,
    item: { id: "app-1" },
    pageIndex: 2,
    pageSpan: 620,
    slot,
  });
  assert(panelSpacedPlan.x === 1320, "folder icon plan should allow page spacing wider than the icon grid");

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

  const nodeState = makeFolderIconNodeState({
    closingGhostKeys: new Set(["other-app"]),
    folderId: "folder-1",
    folderPageSize: 12,
    iconSize: 56,
    isActiveDraggedItem: true,
    isEditMode: true,
    isIconOpening: (area, itemId, pageIndex, folderId) =>
      area === "folder" && itemId === "app-1" && pageIndex === 2 && folderId === "folder-1",
    isInteractivePage: true,
    item: { customIconPath: "icon.png", id: "app-1", type: "app" },
    launchTargetStatusById: { "app-1": "missing" },
    openingGhostItemIds: new Set(["app-1"]),
    pageIndex: 2,
    showMissingLaunchTargetBadge: true,
    focusedIcon: { area: "folder", folderId: "folder-1", id: "app-1", pageIndex: 2 },
    slot,
    source: plan.source,
    stageHeight: 900,
    stageWidth: 1440,
  });
  assert(nodeState.cellWidth === 100 && nodeState.cellHeight === 80, "node state should preserve slot dimensions");
  assert(nodeState.dragging && nodeState.draggable && nodeState.editing, "node state should preserve interactive drag/edit flags");
  assert(nodeState.ghosted, "node state should ghost icons tracked by opening or closing ghost keys");
  assert(nodeState.hasCustomIcon && nodeState.removable, "node state should derive app icon metadata");
  assert(nodeState.jiggleSeed === 203, "node state should preserve the page/index jiggle seed");
  assert(nodeState.launchTargetStatus === "missing", "node state should expose launch target status on interactive pages");
  assert(nodeState.opening && nodeState.focused, "node state should preserve opening and focus lookups");
  assert(nodeState.stageWidth === 1440 && nodeState.stageHeight === 900, "node state should preserve stage dimensions");

  const inactiveState = makeFolderIconNodeState({
    folderId: "folder-1",
    isEditMode: true,
    isIconOpening: () => true,
    isInteractivePage: false,
    item: { id: "app-1", type: "app" },
    launchTargetStatusById: { "app-1": "missing" },
    pageIndex: 2,
    focusedIcon: { area: "folder", folderId: "folder-1", id: "app-1", pageIndex: 2 },
    slot,
    source: plan.source,
  });
  assert(!inactiveState.draggable && !inactiveState.editing, "inactive pages should not be draggable or editing");
  assert(!inactiveState.opening && !inactiveState.selected, "inactive pages should suppress opening and selected state");
  assert(inactiveState.launchTargetStatus === null, "inactive pages should suppress launch target status");
}
