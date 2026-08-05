import { makeFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";

export function runFolderOverlayRenderPlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay render plan test failed] ${message}`);
  };

  const folder = { id: "folder-1" };
  const appA = { id: "app-a", type: "app" };
  const appB = { id: "app-b", type: "app" };
  const appC = { id: "app-c", type: "app" };
  const geometry = {
    grid: { width: 500 },
    panel: { left: 100, top: 60 },
  };
  const localMetrics = {
    cellHeight: 80,
    cellWidth: 100,
    cols: 2,
    gapX: 0,
    gapY: 12,
    gridLeft: 20,
    gridTop: 30,
  };

  const plan = makeFolderOverlayRenderPlan({
    closeThumbRect: { height: 72, left: 10, top: 20, width: 72 },
    cols: 2,
    dragMeta: { item: appB },
    folderCloseIconGhosts: [{ item: appA, key: "close-a", slotIndex: 0 }],
    folderId: folder.id,
    folderOpenIconGhosts: [{ item: appA, key: "open-a", slotIndex: 0 }],
    folderPageIndex: 0,
    folderPages: [[appA, appB], [appC]],
    folderPageSize: 4,
    geometry,
    getFolderPageRenderMode: (pageIndex) => pageIndex === 1 ? "empty" : "interactive",
    getVisibleFolderPage: (page) => page,
    iconSize: 56,
    iconGesturePresentation: {
      phase: "pressing",
      scope: "folder:folder-1",
      target: { id: appA.id, kind: "icon" },
    },
    isEditMode: true,
    isFolderClosing: false,
    isIconOpening: (area, itemId) => area === "folder" && itemId === "app-a",
    selectedIcon: { area: "folder", folderId: folder.id, id: "app-a", pageIndex: 0 },
    isNewFolder: true,
    localMetrics,
    previewSlots: [appA],
    rows: 2,
    stageHeight: 900,
    stageWidth: 1440,
    targetTrackX: 0,
  });

  assert(plan.entries.length === 2, "render plan should skip empty pages");
  const [entryA, entryB] = plan.entries;
  assert(entryA.key === "folder-1:0:app-a", "entry should expose the folder icon key");
  assert(entryA.x === 70 && entryA.y === 70, "entry should expose folder-local icon coordinates");
  assert(entryA.nodeState.draggable && entryA.nodeState.editing, "interactive entries should keep draggable edit state");
  assert(entryA.nodeState.interactionPhase === "pressing", "the matching folder icon should receive the pressing phase");
  assert(entryA.nodeState.opening && entryA.nodeState.selected, "entry node state should preserve selected/opening lookups");
  assert(entryA.openingGhostInput?.controllerGhostKey === "open-a", "eligible opening entries should expose ghost input");
  assert(!entryA.closingGhostInput, "non-closing plans should not expose closing ghost input");
  assert(entryB.isActiveDraggedItem, "entries should expose active dragged state");
  assert(entryB.nodeState.interactionPhase == null, "non-target folder icons should remain visually idle");
  assert(!entryB.openingGhostInput, "dragged entries should not create opening ghost input");

  const visualOpeningPlan = makeFolderOverlayRenderPlan({
    cols: 2,
    folderId: folder.id,
    folderOpenIconGhosts: [{ item: appC, key: "open-c", slotIndex: 0 }],
    folderPageIndex: 0,
    folderPages: [[appA], [appC]],
    folderPageSpan: 500,
    geometry,
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: (page) => page,
    iconSize: 56,
    isNewFolder: true,
    localMetrics,
    previewSlots: [appA, appC],
    rows: 1,
    targetTrackX: -500,
    visualFolderPageIndex: 1,
  });
  const committedEntry = visualOpeningPlan.entries.find((entry) => entry.pageIndex === 0);
  const visualEntry = visualOpeningPlan.entries.find((entry) => entry.pageIndex === 1);
  assert(!committedEntry.openingGhostInput, "opening ghost input should not stay on the committed folder page when visual page differs");
  assert(visualEntry.openingGhostInput?.controllerGhostKey === "open-c", "opening ghost input should target the visual folder page");
  assert(visualEntry.targetCenter.x === 170, "visual page target center should include the visual page track offset");

  const activeOpeningPlan = makeFolderOverlayRenderPlan({
    cols: 2,
    folderId: folder.id,
    folderOpenIconGhosts: [{ item: appA, key: "open-a", slotIndex: 0 }],
    folderPageIndex: 0,
    folderPages: [[appA], [appC]],
    folderPageSpan: 500,
    geometry,
    getFolderPageRenderMode: (pageIndex) => pageIndex === 0 ? "static-real" : "interactive",
    getVisibleFolderPage: (page) => page,
    iconSize: 56,
    isNewFolder: false,
    localMetrics,
    openingGhostItemIds: new Set(["app-a"]),
    previewSlots: [appA, appC],
    rows: 1,
    targetTrackX: -500,
    visualFolderPageIndex: 1,
  });
  const activeOpeningEntry = activeOpeningPlan.entries.find((entry) => entry.item.id === "app-a");
  const inactiveVisualEntry = activeOpeningPlan.entries.find((entry) => entry.item.id === "app-c");
  assert(activeOpeningEntry.openingGhostInput?.controllerGhostKey === "open-a", "active opening ghost should keep receiving a retarget input after visual page changes");
  assert(!activeOpeningEntry.isInteractivePage, "active opening ghost retarget coverage should include static-real origin pages");
  assert(activeOpeningEntry.targetCenter.x === -330, "active opening ghost retarget should use the original page live target shifted outside the mask");
  assert(!inactiveVisualEntry.openingGhostInput, "visual page items without active opening ghosts should not create new retarget inputs");

  const closingPlan = makeFolderOverlayRenderPlan({
    closeThumbRect: { height: 72, left: 10, top: 20, width: 72 },
    cols: 2,
    folderCloseIconGhosts: [{ item: appA, key: "close-a", slotIndex: 0 }],
    folderId: folder.id,
    folderPageIndex: 1,
    folderPages: [[appA], [appC]],
    geometry,
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: (page) => page,
    iconSize: 56,
    isFolderClosing: true,
    localMetrics,
    previewSlots: [appA],
    stableFolderCloseTarget: {
      coordinateSpace: "stage-layout",
      folderId: folder.id,
      iconRect: { height: 72, left: 10, top: 20, width: 72 },
      previewChildRects: new Map([["app-a:0", { height: 12, left: 30, top: 40, width: 12 }]]),
      projection: { stageHeight: 100, stageRect: { height: 100, left: 0, top: 0, width: 100 }, stageWidth: 100 },
      thumbRect: { height: 72, left: 10, top: 20, width: 72 },
    },
    visualFolderPageIndex: 0,
  });

  assert(closingPlan.entries.length === 2, "closing plan should keep interactive pages in range");
  assert(!closingPlan.entries[0].closingGhostInput, "closing ghost input should only target the active folder page");
  assert(closingPlan.entries[1].closingGhostInput?.item.id === "app-c", "active closing page entry should expose closing input");
  assert(closingPlan.closingPreviewSwapTargets.length === 1, "closing second page should expose preview swap targets");
  assert(closingPlan.closingPreviewSwapTargets[0].targetStageLayoutRect.left === 30, "preview swap should reuse stable stage layout target rects");
}
