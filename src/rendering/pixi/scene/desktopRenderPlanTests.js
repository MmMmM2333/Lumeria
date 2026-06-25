import { buildDesktopRenderPlan } from "./desktopRenderPlan.js";

function makeBaseState(overrides = {}) {
  return {
    activePageIndex: 0,
    activePages: [[]],
    desktopFrame: { height: 300, left: 0, top: 0, width: 400 },
    deviceResolution: 1,
    folderPageSize: 9,
    folderSourceGhostedIds: new Set(),
    getDesktopPageRenderMode: () => "interactive",
    getVisibleDesktopPage: (page) => page,
    gridCols: 2,
    gridRows: 1,
    height: 300,
    iconSize: 64,
    isEditMode: false,
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    isIconSelected: () => false,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    setPageRef: () => {},
    showMissingLaunchTargetBadge: false,
    stageRect: { height: 300, left: 0, top: 0, width: 400 },
    width: 400,
    ...overrides,
  };
}

function makeHandoffCoordinator(active, folderId = null) {
  return {
    get folderId() {
      return folderId;
    },
    isCloseHandoffActive() {
      return active;
    },
  };
}

export function runDesktopRenderPlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Desktop render plan test failed] ${message}`);
  };

  {
    const app = { id: "app-a", type: "app" };
    const folder = { id: "folder-a", type: "folder" };
    const handoffEntry = { folderId: folder.id, visualReleased: false };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[app, folder]],
      dragMeta: { item: app },
      folderClosingHandoffIds: new Set([folder.id]),
      isIconOpening: (area, itemId) => area === "desktop" && itemId === app.id,
      isIconSelected: (area, itemId) => area === "desktop" && itemId === app.id,
      showMissingLaunchTargetBadge: true,
      launchTargetStatusById: { [app.id]: { missing: true } },
    }), {
      folderHandoffEntries: new Map([[folder.id, handoffEntry]]),
      folderLayer: { folderHandoff: makeHandoffCoordinator(true, folder.id) },
    });

    assert(plan.entries.length === 2, "plan should include visible desktop entries");
    assert(plan.pageRefs.length === 1, "plan should expose page ref updates");
    assert(plan.clearLaunchArea === "desktop", "plan should expose the launch bounds area to clear");
    assert(plan.clearFolderPreviewChildIds.join(",") === folder.id, "plan should expose folder preview child clears");
    assert(plan.pageTrack.pageIndex === 0 && plan.pageTrack.pageSpan === 400, "plan should expose page track target inputs");

    const appEntry = plan.entries[0];
    assert(appEntry.key === "page:0:app-a", "app entry should expose the stable desktop node key");
    assert(appEntry.nodeState.dragging === true, "app entry should preserve drag state");
    assert(appEntry.nodeState.opening === true && appEntry.nodeState.selected === true, "app entry should preserve icon lookup state");
    assert(appEntry.nodeState.launchTargetStatus?.missing === true, "app entry should preserve launch target status");
    assert(appEntry.boundsEntry?.area === "desktop", "interactive app entry should expose bounds registration input");
    assert(Number.isFinite(appEntry.layoutTarget.x) && Number.isFinite(appEntry.layoutTarget.y), "app entry should expose a numeric layout target");

    const folderEntry = plan.entries[1];
    assert(folderEntry.effectiveFolderHandoffEntry === handoffEntry, "folder entry should keep the existing handoff entry");
    assert(folderEntry.isFolderClosingHandoff === true, "folder entry should identify active closing handoff state");
    assert(folderEntry.nodeState.preserveNodeScale === true, "handoff folder entry should preserve node scale");
    assert(folderEntry.nodeState.draggable === false && folderEntry.nodeState.interactive === false, "handoff folder should disable normal interaction");
    assert(folderEntry.boundsEntry?.handoffLayoutTarget, "handoff folder should expose a pinned bounds layout target");
  }

  {
    const folder = { id: "folder-stale", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      folderSourceGhostedIds: new Set([folder.id]),
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
      folderHandoffEntries: new Map([[folder.id, { folderId: folder.id, visualReleased: false }]]),
      folderLayer: { folderHandoff: makeHandoffCoordinator(false, null) },
    });

    const [entry] = plan.entries;
    assert(entry.shouldRetireStaleHandoff === true, "plan should mark stale unreleased handoffs for retirement");
    assert(entry.effectiveFolderHandoffEntry === null, "retired handoff should not remain an effective folder handoff");
    assert(entry.isFolderClosingHandoff === false, "retired handoff should fall back to the ordinary icon path");
    assert(entry.nodeState.ghosted === true, "raw source ghosting should remain in the node state after retirement");
  }

  {
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[]],
      isSearchMode: true,
    }));

    assert(plan.entries.length === 0, "empty search page should have no entries");
    assert(plan.emptyText.visible === true, "empty search page should show empty text");
    assert(plan.emptyText.x === 200 && plan.emptyText.y === 150, "empty text should be centered in the desktop frame");
    assert(plan.clearLaunchArea === "search", "search mode should clear search launch bounds");
  }
}
