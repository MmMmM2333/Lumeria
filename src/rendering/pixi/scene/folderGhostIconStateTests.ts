import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";

export function runFolderGhostIconStateTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder ghost icon state test failed] ${message}`);
  };

  const emptyState = makeFolderGhostIconNodeState({ state: {}, target: {} });
  assert(emptyState.item === undefined, "partial ghost input should preserve an absent item");
  assert(emptyState.stageWidth === undefined && emptyState.stageHeight === undefined, "partial ghost input should preserve absent stage dimensions");

  const app = { id: "app-1", type: "app" };
  const state = {
    folderPageIndex: 2,
    folderPageSize: 15,
    height: 900,
    isTextlessMode: true,
    launchTargetStatusById: { "app-1": "missing" },
    showMissingLaunchTargetBadge: true,
    width: 1440,
  };
  const target = {
    cellHeight: 88,
    cellWidth: 112,
    iconSize: 56,
    item: app,
  };

  const openingState = makeFolderGhostIconNodeState({
    sourceType: "folder-open-ghost",
    state,
    target,
  });
  assert(openingState.cellHeight === 88 && openingState.cellWidth === 112, "ghost state should preserve cell size");
  assert(openingState.folderPreviewPageSize === 15, "ghost state should preserve folder preview page size");
  assert(openingState.iconSize === 56, "ghost state should preserve icon size");
  assert(openingState.item === app, "ghost state should preserve the target item");
  assert(openingState.launchTargetStatus === "missing", "app ghost state should expose launch target status");
  assert(openingState.source.type === "folder-open-ghost" && openingState.source.pageIndex === 2, "ghost state should expose source metadata");
  assert(openingState.stageWidth === 1440 && openingState.stageHeight === 900, "ghost state should preserve stage dimensions");
  assert(openingState.textless, "ghost state should preserve textless mode");
  assert(!openingState.interactive && !openingState.draggable && !openingState.editing, "ghost state should stay non-interactive");
  assert(!openingState.dragging && !openingState.ghosted && !openingState.opening && !openingState.selected, "ghost state should suppress transient icon flags");

  const closingState = makeFolderGhostIconNodeState({
    sourceType: "folder-close-ghost",
    state: { ...state, showMissingLaunchTargetBadge: false },
    target,
  });
  assert(closingState.source.type === "folder-close-ghost", "closing ghost state should preserve source type");
  assert(closingState.launchTargetStatus === null, "disabled missing badge should suppress launch target status");

  const folderState = makeFolderGhostIconNodeState({
    state,
    target: { ...target, item: { id: "folder-1", type: "folder" } },
  });
  assert(folderState.launchTargetStatus === null, "folder ghost state should not expose app launch target status");
}
