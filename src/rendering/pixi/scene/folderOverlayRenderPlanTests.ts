import { makeFolderOverlayRenderPlan as makeProductionFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import type {
  FolderOverlayGeometry,
  FolderOverlayGridMetrics,
  FolderOverlayGroupDragState,
  FolderOverlayPlanFrame,
  FolderOverlayRenderPlan,
  FolderOverlayRenderPlanInput,
  FolderOverlayStableLayout,
  FolderPageRenderMode,
} from "./folderOverlayRenderPlan.js";
import type {
  FolderGhost,
  FolderOverlayRect,
  FolderTargetProjection,
  StableFolderCloseTarget,
} from "./folderOverlayTargets.js";
import type {
  SceneDataRecord,
  SceneFocusedIcon,
  SceneItem,
} from "../../sceneFrame.js";

type LegacyStageLayoutCloseTargetFixture = Readonly<{
  coordinateSpace: "stage-layout";
  folderId: string;
  iconRect: FolderOverlayRect;
  previewChildRects: ReadonlyMap<string, FolderOverlayRect>;
  projection: FolderTargetProjection;
  thumbRect: FolderOverlayRect;
}>;

type StableFolderCloseTargetFixture = StableFolderCloseTarget | LegacyStageLayoutCloseTargetFixture;

type FolderOverlayRenderPlanTestInput = Omit<FolderOverlayRenderPlanInput, "stableLayout"> & Readonly<{
  stableLayout: Omit<FolderOverlayStableLayout, "closeTarget"> & Readonly<{
    closeTarget: StableFolderCloseTargetFixture | null;
  }>;
}>;

type FolderOverlayRenderPlanTestOptions = Readonly<{
  closeThumbRect?: FolderOverlayRect | null;
  closingGhostKeys?: ReadonlySet<string>;
  cols?: number;
  dragMeta?: Readonly<{
    draggedIds?: readonly string[];
    item?: SceneItem;
  }> | null;
  focusedIcon?: SceneFocusedIcon | null;
  folderCloseIconGhosts?: readonly FolderGhost[];
  folderId?: string;
  folderOpenIconGhosts?: readonly FolderGhost[];
  folderPageIndex?: number;
  folderPageSize?: number;
  folderPageSpan?: number;
  folderPages?: readonly (readonly (SceneItem | null)[])[];
  geometry?: FolderOverlayGeometry;
  getFolderPageRenderMode?: (pageIndex: number) => FolderPageRenderMode;
  getVisibleFolderPage?: (page: readonly (SceneItem | null)[]) => readonly SceneItem[];
  groupDragState?: Partial<FolderOverlayGroupDragState> | null;
  groupTransferOwnedItemIds?: ReadonlySet<string> | readonly string[];
  iconGesturePresentation?: SceneDataRecord | null;
  iconSize?: number;
  isBatchSelectionActive?: boolean;
  isClosing?: boolean;
  isEditMode?: boolean;
  isFolderClosing?: boolean;
  isIconOpening?: FolderOverlayPlanFrame["isIconOpening"];
  isNewFolder?: boolean;
  isTextlessMode?: boolean;
  launchTargetStatusById?: Readonly<Record<string, string>>;
  localMetrics?: FolderOverlayGridMetrics;
  openingGhostItemIds?: ReadonlySet<string>;
  previewSlots?: readonly SceneItem[];
  rows?: number;
  selectedAppIds?: ReadonlySet<string> | readonly string[];
  showMissingLaunchTargetBadge?: boolean;
  stableFolderCloseTarget?: StableFolderCloseTargetFixture | null;
  stableFolderPageSpan?: number;
  stableGeometry?: FolderOverlayGeometry;
  stableLocalMetrics?: FolderOverlayGridMetrics;
  stableTargetTrackX?: number;
  stageHeight?: number;
  stageWidth?: number;
  targetTrackX?: number;
  visualFolderPageIndex?: number;
}>;

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(`[Pixi folder overlay render plan test setup failed] ${message}`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFolderOverlayRenderPlan(value: unknown): value is FolderOverlayRenderPlan {
  return isRecord(value) && Array.isArray(value.entries) && Array.isArray(value.closingPreviewSwapTargets);
}

function requireRenderPlan(value: unknown): FolderOverlayRenderPlan {
  if (!isFolderOverlayRenderPlan(value)) {
    throw new Error("[Pixi folder overlay render plan test setup failed] production planner should return a render plan");
  }
  return value;
}

function getVisibleTestFolderPage(page: readonly (SceneItem | null)[]): readonly SceneItem[] {
  return page.filter((item): item is SceneItem => item !== null);
}

function makeFolderOverlayRenderPlan(
  options: FolderOverlayRenderPlanTestOptions = {},
): FolderOverlayRenderPlan {
  const geometry = options.geometry || {
    grid: { width: 1 },
    panel: { left: 0, top: 0 },
  };
  const metrics = options.localMetrics || {
    cellHeight: 1,
    cellWidth: 1,
    cols: 1,
    gapX: 0,
    gapY: 0,
    gridLeft: 0,
    gridTop: 0,
  };
  const folderPageIndex = options.folderPageIndex ?? 0;
  const input: FolderOverlayRenderPlanTestInput = {
    frame: {
      closingGhostKeys: options.closingGhostKeys || new Set(),
      focusedIcon: options.focusedIcon || null,
      folderId: options.folderId || "test-folder",
      folderPageIndex,
      folderPages: options.folderPages || [],
      folderPageSize: options.folderPageSize ?? 0,
      getFolderPageRenderMode: options.getFolderPageRenderMode || (() => "interactive"),
      getVisibleFolderPage: options.getVisibleFolderPage || getVisibleTestFolderPage,
      groupDragState: options.groupDragState
        ? {
          phase: null,
          totalCount: 0,
          visualSpec: null,
          ...options.groupDragState,
        }
        : null,
      groupTransferOwnedItemIds: new Set(options.groupTransferOwnedItemIds || []),
      iconGesturePresentation: options.iconGesturePresentation || null,
      iconSize: options.iconSize ?? 64,
      isBatchSelectionActive: options.isBatchSelectionActive === true,
      isEditMode: options.isEditMode === true,
      isIconOpening: options.isIconOpening || null,
      isTextlessMode: options.isTextlessMode === true,
      launchTargetStatusById: options.launchTargetStatusById || {},
      selectedAppIds: options.selectedAppIds || new Set(),
      showMissingLaunchTargetBadge: options.showMissingLaunchTargetBadge !== false,
      stageHeight: options.stageHeight ?? 1,
      stageWidth: options.stageWidth ?? 1,
      visualFolderPageIndex: options.visualFolderPageIndex ?? folderPageIndex,
    },
    isNewFolder: options.isNewFolder === true,
    liveLayout: {
      cols: options.cols ?? 1,
      geometry,
      metrics,
      pageSpan: options.folderPageSpan ?? geometry.grid.width,
      rows: options.rows ?? 1,
      trackX: options.targetTrackX ?? 0,
    },
    stableLayout: {
      closeTarget: options.stableFolderCloseTarget || null,
      geometry: options.stableGeometry || geometry,
      metrics: options.stableLocalMetrics || metrics,
      pageSpan: options.stableFolderPageSpan ?? options.folderPageSpan ?? geometry.grid.width,
      trackX: options.stableTargetTrackX ?? options.targetTrackX ?? 0,
    },
    transitions: {
      closeThumbRect: options.closeThumbRect || null,
      folderCloseIconGhosts: options.folderCloseIconGhosts || [],
      folderOpenIconGhosts: options.folderOpenIconGhosts || [],
      isClosing: options.isClosing === true,
      isFolderClosing: options.isFolderClosing === true,
      openingGhostItemIds: options.openingGhostItemIds || new Set(),
      previewSlots: options.previewSlots || [],
    },
  };
  // One legacy fixture intentionally omits source/trackingKey while exercising planner behavior.
  const plan: unknown = Reflect.apply(makeProductionFolderOverlayRenderPlan, undefined, [input]);
  return requireRenderPlan(plan);
}

export function runFolderOverlayRenderPlanTests(): void {
  const assert = (condition: unknown, message: string): void => {
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
    getVisibleFolderPage: getVisibleTestFolderPage,
    groupDragState: { phase: "dragging" },
    groupTransferOwnedItemIds: new Set([appB.id]),
    iconSize: 56,
    iconGesturePresentation: {
      phase: "pressing",
      scope: "folder:folder-1",
      target: { id: appA.id, kind: "icon" },
    },
    isEditMode: true,
    isFolderClosing: false,
    isIconOpening: (area, itemId) => area === "folder" && itemId === "app-a",
    focusedIcon: { area: "folder", folderId: folder.id, id: "app-a", pageIndex: 0 },
    isNewFolder: true,
    localMetrics,
    previewSlots: [appA],
    rows: 2,
    stageHeight: 900,
    stageWidth: 1440,
    targetTrackX: 0,
  });

  assert(plan.entries.length === 2, "render plan should skip empty pages");
  assert(!Object.prototype.hasOwnProperty.call(plan, "previewSlotById"), "preview-slot lookup should stay internal to planning");
  const entryA = requireValue(plan.entries[0], "render plan should contain the first visible entry");
  const entryB = requireValue(plan.entries[1], "render plan should contain the second visible entry");
  assert(!Object.prototype.hasOwnProperty.call(entryA, "iconPlan"), "entries should not expose an internal icon sub-plan");
  assert(!Object.prototype.hasOwnProperty.call(entryA, "renderMode"), "entries should not repeat page render mode");
  assert(!Object.prototype.hasOwnProperty.call(entryA, "slot"), "entries should not expose an unused grid slot");
  assert(!Object.prototype.hasOwnProperty.call(entryA, "source"), "entries should not repeat node source metadata");
  assert(entryA.key === "folder-1:app-a", "entry should expose a page-independent folder icon key");
  assert(entryA.x === 70 && entryA.y === 70, "entry should expose folder-local icon coordinates");
  assert(entryA.nodeState.draggable && entryA.nodeState.editing, "interactive entries should keep draggable edit state");
  assert(entryA.nodeState.interactionPhase === "pressing", "the matching folder icon should receive the pressing phase");
  assert(entryA.nodeState.opening && entryA.nodeState.focused, "entry node state should preserve focus/opening lookups");
  assert(entryA.openingGhostInput?.controllerGhostKey === "open-a", "eligible opening entries should expose ghost input");
  assert(!entryA.closingGhostInput, "non-closing plans should not expose closing ghost input");
  assert(entryB.isActiveDraggedItem, "entries should expose active dragged state");
  assert(entryB.nodeState.interactionPhase == null, "non-target folder icons should remain visually idle");
  assert(!entryB.openingGhostInput, "dragged entries should not create opening ghost input");

  const returningPlan = makeFolderOverlayRenderPlan({
    cols: 2,
    dragMeta: { draggedIds: [appA.id, appB.id], item: appA },
    folderId: folder.id,
    folderPageIndex: 0,
    folderPages: [[appA, appB]],
    folderPageSize: 4,
    geometry,
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: getVisibleTestFolderPage,
    groupDragState: {
      phase: "returning",
      totalCount: 2,
    },
    groupTransferOwnedItemIds: new Set([appA.id, appB.id]),
    iconSize: 56,
    isBatchSelectionActive: true,
    localMetrics,
  });
  assert(
    returningPlan.entries.every((entry) => entry.nodeState.revealLabelAfterVisualHandoff === true),
    "visible folder children should use the same deferred label reveal when a batch drag returns"
  );

  const singleReturningPlan = makeFolderOverlayRenderPlan({
    cols: 2,
    dragMeta: { draggedIds: [appA.id], item: appA },
    folderId: folder.id,
    folderPageIndex: 0,
    folderPages: [[appA]],
    folderPageSize: 4,
    geometry,
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: getVisibleTestFolderPage,
    groupDragState: {
      phase: "returning",
      totalCount: 1,
      visualSpec: { textless: false },
    },
    groupTransferOwnedItemIds: new Set([appA.id]),
    iconSize: 56,
    localMetrics,
  });
  const singleReturningEntry = requireValue(singleReturningPlan.entries[0], "single returning plan should contain its entry");
  assert(
    singleReturningEntry.nodeState.revealLabelAfterVisualHandoff === false,
    "a labeled single folder-child ghost should hand its visible label back without restarting a fade"
  );

  const mismatchedSingleReturningPlan = makeFolderOverlayRenderPlan({
    cols: 2,
    dragMeta: { draggedIds: [appA.id], item: appA },
    folderId: folder.id,
    folderPageIndex: 0,
    folderPages: [[appA]],
    folderPageSize: 4,
    geometry,
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: getVisibleTestFolderPage,
    groupDragState: {
      phase: "returning",
      totalCount: 1,
      visualSpec: {
        cellHeight: 132,
        cellWidth: 116,
        compact: false,
        iconSize: 88,
        singleLineLabel: false,
        textless: false,
      },
    },
    groupTransferOwnedItemIds: new Set([appA.id]),
    iconSize: 56,
    localMetrics,
  });
  const mismatchedSingleReturningEntry = requireValue(
    mismatchedSingleReturningPlan.entries[0],
    "mismatched single returning plan should contain its entry",
  );
  assert(
    mismatchedSingleReturningEntry.nodeState.revealLabelAfterVisualHandoff === false,
    "a labeled single-item actor should keep label continuity after its visual spec reaches the folder target",
  );

  const visualOpeningPlan = makeFolderOverlayRenderPlan({
    cols: 2,
    folderId: folder.id,
    folderOpenIconGhosts: [{ item: appC, key: "open-c", slotIndex: 0 }],
    folderPageIndex: 0,
    folderPages: [[appA], [appC]],
    folderPageSpan: 500,
    geometry,
    getFolderPageRenderMode: () => "interactive",
    getVisibleFolderPage: getVisibleTestFolderPage,
    iconSize: 56,
    isNewFolder: true,
    localMetrics,
    previewSlots: [appA, appC],
    rows: 1,
    targetTrackX: -500,
    visualFolderPageIndex: 1,
  });
  const committedEntry = requireValue(
    visualOpeningPlan.entries.find((entry) => entry.pageIndex === 0),
    "visual opening plan should contain the committed page entry",
  );
  const visualEntry = requireValue(
    visualOpeningPlan.entries.find((entry) => entry.pageIndex === 1),
    "visual opening plan should contain the visual page entry",
  );
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
    getVisibleFolderPage: getVisibleTestFolderPage,
    iconSize: 56,
    isNewFolder: false,
    localMetrics,
    openingGhostItemIds: new Set(["app-a"]),
    previewSlots: [appA, appC],
    rows: 1,
    targetTrackX: -500,
    visualFolderPageIndex: 1,
  });
  const activeOpeningEntry = requireValue(
    activeOpeningPlan.entries.find((entry) => entry.item.id === "app-a"),
    "active opening plan should contain the active opening entry",
  );
  const inactiveVisualEntry = requireValue(
    activeOpeningPlan.entries.find((entry) => entry.item.id === "app-c"),
    "active opening plan should contain the inactive visual entry",
  );
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
    getVisibleFolderPage: getVisibleTestFolderPage,
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
  const closingFirstEntry = requireValue(closingPlan.entries[0], "closing plan should contain the first page entry");
  const closingSecondEntry = requireValue(closingPlan.entries[1], "closing plan should contain the active page entry");
  assert(!closingFirstEntry.closingGhostInput, "closing ghost input should only target the active folder page");
  assert(closingSecondEntry.closingGhostInput?.item.id === "app-c", "active closing page entry should expose closing input");
  assert(closingPlan.closingPreviewSwapTargets.length === 1, "closing second page should expose preview swap targets");
  const closingSwapTarget = requireValue(closingPlan.closingPreviewSwapTargets[0], "closing plan should contain its preview swap target");
  const closingSwapRect = requireValue(closingSwapTarget.targetStageLayoutRect, "closing preview swap target should expose a stage-layout rect");
  assert(closingSwapRect.left === 30, "preview swap should reuse stable stage layout target rects");
  const draggingClose = makeFolderOverlayRenderPlan({
    folderId:folder.id,folderPages:[[appA,appC]],folderPageIndex:0,visualFolderPageIndex:0,
    geometry,localMetrics,cols:2,iconSize:56,isFolderClosing:true,
    groupTransferOwnedItemIds:new Set([appA.id]),groupDragState:{phase:"dragging"},
    getFolderPageRenderMode:()=>"interactive",getVisibleFolderPage:getVisibleTestFolderPage,previewSlots:[appA,appC],
  });
  assert(!draggingClose.entries.find(entry=>entry.item.id===appA.id)?.closingGhostInput,
    "closing the source folder must not duplicate an icon owned by the drag layer");
  assert(draggingClose.entries.find(entry=>entry.item.id===appC.id)?.closingGhostInput,
    "unselected folder children must retain their closing animation");
  const promotedClose = makeFolderOverlayRenderPlan({
    folderId:folder.id,folderPages:[[appA],[appC]],folderPageIndex:0,visualFolderPageIndex:0,
    geometry,localMetrics,cols:2,iconSize:56,isFolderClosing:true,
    groupTransferOwnedItemIds:new Set([appA.id]),groupDragState:{phase:"releasing"},
    getFolderPageRenderMode:()=>"interactive",getVisibleFolderPage:getVisibleTestFolderPage,
    previewSlots:[appC],closeThumbRect:{height:72,left:10,top:20,width:72},
  });
  assert(promotedClose.closingPreviewSwapTargets.some(target=>target.item.id===appC.id),
    "closing page zero must fill preview slots promoted from an offscreen folder page");
}
