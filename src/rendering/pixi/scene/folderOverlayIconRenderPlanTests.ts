import type { SceneItem } from "../../sceneFrame.js";
import {
  makeFolderOverlayRenderPlan,
  type FolderOverlayGroupDragState,
  type FolderOverlayRenderEntry,
  type FolderOverlayRenderPlan,
} from "./folderOverlayRenderPlan.js";
import * as iconVisualSpec from "./iconVisualSpec.js";

type IconBehaviorPlanOverrides = Readonly<{
  groupDragState?: FolderOverlayGroupDragState;
  interactive?: boolean;
  item?: SceneItem;
  ownedItemIds?: ReadonlySet<string>;
  pageSpan?: number;
  textless?: boolean;
}>;

function makeIconBehaviorPlan(overrides: IconBehaviorPlanOverrides = {}): FolderOverlayRenderPlan {
  const item: SceneItem = overrides.item ?? {
    customIconPath: "icon.png",
    id: "app-1",
    type: "app",
  };
  const geometry = {
    grid: { width: 500 },
    panel: { left: 100, top: 60 },
  };
  const metrics = {
    cellHeight: 80,
    cellWidth: 100,
    cols: 1,
    gapX: 0,
    gapY: 0,
    gridLeft: 30,
    gridTop: 40,
  };
  const pageSpan = overrides.pageSpan ?? 500;
  const textless = overrides.textless === true;
  const interactive = overrides.interactive !== false;
  return makeFolderOverlayRenderPlan({
    frame: {
      closingGhostKeys: new Set(["other-app"]),
      focusedIcon: { area: "folder", folderId: "folder-1", id: item.id, pageIndex: 2 },
      folderId: "folder-1",
      folderPageIndex: 2,
      folderPages: [[], [], [item]],
      folderPageSize: 12,
      getFolderPageRenderMode: (pageIndex) => pageIndex === 2
        ? interactive ? "interactive" : "static-real"
        : "empty",
      getVisibleFolderPage: (page) => page.filter((entry): entry is SceneItem => entry !== null),
      groupDragState: overrides.groupDragState ?? {
        phase: "dragging",
        totalCount: 1,
        visualSpec: null,
      },
      groupTransferOwnedItemIds: overrides.ownedItemIds ?? new Set([item.id]),
      iconGesturePresentation: null,
      iconSize: 56,
      isBatchSelectionActive: false,
      isEditMode: true,
      isIconOpening: () => true,
      isTextlessMode: textless,
      launchTargetStatusById: { [item.id]: "missing" },
      selectedAppIds: new Set(),
      showMissingLaunchTargetBadge: true,
      stageHeight: 900,
      stageWidth: 1440,
      visualFolderPageIndex: 2,
    },
    isNewFolder: false,
    liveLayout: {
      cols: 1,
      geometry,
      metrics,
      pageSpan,
      rows: 1,
      trackX: -500,
    },
    stableLayout: {
      closeTarget: null,
      geometry,
      metrics,
      pageSpan,
      trackX: -500,
    },
    transitions: {
      closeThumbRect: null,
      folderCloseIconGhosts: [],
      folderOpenIconGhosts: [],
      isClosing: false,
      isFolderClosing: false,
      openingGhostItemIds: new Set([item.id]),
      previewSlots: [item],
    },
  });
}

function firstEntry(plan: FolderOverlayRenderPlan): FolderOverlayRenderEntry {
  const entry = plan.entries[0];
  if (!entry) throw new Error("[Pixi folder overlay icon render-plan test failed] expected a planned icon entry");
  return entry;
}

export function runFolderOverlayIconRenderPlanTests(): void {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Pixi folder overlay icon plan test failed] ${message}`);
  }

  const normalizedSpec = iconVisualSpec.makeIconVisualSpec({
    cellHeight: 40,
    cellWidth: "80",
    compact: true,
    iconSize: "56",
    singleLineLabel: true,
    textless: false,
  });
  assert(normalizedSpec !== null, "valid visual inputs should produce a visual spec");
  assert(normalizedSpec.iconSize === 56, "visual specs should accept finite numeric input at the dynamic boundary");
  assert(normalizedSpec.cellHeight === 56 && normalizedSpec.cellWidth === 80, "visual spec cells should never be smaller than the icon");
  assert(iconVisualSpec.makeIconVisualSpec({ iconSize: 0 }) === null, "invalid icon sizes should reject the visual spec");
  assert(iconVisualSpec.makeIconVisualSpec(Symbol("invalid")) === null, "non-record visual inputs should be rejected without coercion");
  assert(iconVisualSpec.makeIconVisualSpecKey(normalizedSpec) === "56:80:56:1:1:0", "visual spec keys should be stable and complete");
  const interpolatedSpec = iconVisualSpec.interpolateIconVisualSpec(
    { cellHeight: 64, cellWidth: 64, compact: false, iconSize: 48, singleLineLabel: false, textless: false },
    { cellHeight: 96, cellWidth: 80, compact: true, iconSize: 64, singleLineLabel: true, textless: true },
    0.5,
  );
  assert(interpolatedSpec !== null, "compatible visual specs should interpolate");
  assert(interpolatedSpec.iconSize === 56 && interpolatedSpec.compact, "visual spec interpolation should blend dimensions and switch flags at midpoint");
  assert(iconVisualSpec.hasIconVisualSpecMismatch(normalizedSpec, { ...normalizedSpec, iconSize: 57 }), "visual spec mismatch should detect numeric changes outside epsilon");
  assert(!iconVisualSpec.hasIconVisualSpecMismatch(normalizedSpec, { ...normalizedSpec, iconSize: 56.4 }), "visual spec mismatch should tolerate sub-epsilon numeric changes");
  assert(iconVisualSpec.hasIconVisualSpecMismatch(normalizedSpec, { ...normalizedSpec, textless: true }), "visual spec mismatch should detect boolean presentation changes");
  assert(!("cloneIconVisualSpec" in iconVisualSpec), "the duplicate visual-spec clone path should not remain public");

  const plan = makeIconBehaviorPlan();
  const entry = firstEntry(plan);
  assert(entry.nodeState.source !== null, "planned folder icons should retain a source descriptor");
  assert(entry.key === "folder-1:app-1", "folder icon identity should stay independent of page position");
  assert(entry.x === 1080 && entry.y === 80, "folder icons should be positioned inside the paged grid");
  assert(entry.targetCenter.x === 680 && entry.targetCenter.y === 126, "target center should include panel, track, and normal visual offset");
  assert(entry.nodeState.source.type === "folder" && entry.nodeState.source.folderId === "folder-1", "node source should retain folder identity");
  assert(entry.nodeState.source.index === 0 && entry.nodeState.source.pageIndex === 2, "node source should retain page and slot metadata");
  assert(entry.nodeState.cellWidth === 100 && entry.nodeState.cellHeight === 80, "node state should preserve slot dimensions");
  assert(entry.nodeState.dragging && entry.nodeState.draggable && entry.nodeState.editing, "node state should preserve interactive drag/edit flags");
  assert(entry.nodeState.ghosted, "owned or opening icons should be ghosted");
  assert(entry.nodeState.hasCustomIcon && entry.nodeState.removable, "node state should derive app icon metadata");
  assert(entry.nodeState.jiggleSeed === 200, "node state should derive a stable page/index jiggle seed");
  assert(entry.nodeState.launchTargetStatus === "missing", "interactive entries should expose launch target status");
  assert(entry.nodeState.opening && entry.nodeState.focused, "node state should preserve opening and focus lookups");
  assert(entry.nodeState.stageWidth === 1440 && entry.nodeState.stageHeight === 900, "node state should preserve stage dimensions");

  const panelSpacedEntry = firstEntry(makeIconBehaviorPlan({ pageSpan: 620 }));
  assert(panelSpacedEntry.x === 1320, "folder layout should allow page spacing wider than the icon grid");

  const textlessEntry = firstEntry(makeIconBehaviorPlan({ textless: true }));
  assert(textlessEntry.targetCenter.x === 680 && textlessEntry.targetCenter.y === 140, "textless target centers should remove the label visual offset");

  const inactiveEntry = firstEntry(makeIconBehaviorPlan({
    interactive: false,
    ownedItemIds: new Set(),
  }));
  assert(!inactiveEntry.nodeState.draggable && !inactiveEntry.nodeState.editing, "inactive pages should not be draggable or editing");
  assert(!inactiveEntry.nodeState.opening && !inactiveEntry.nodeState.focused, "inactive pages should suppress opening and focus state");
  assert(inactiveEntry.nodeState.launchTargetStatus === null, "inactive pages should suppress launch target status");
}
