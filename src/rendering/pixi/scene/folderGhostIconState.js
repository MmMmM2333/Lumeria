import { reloadOnPixiHotUpdate } from "../devHmr.js";

export function makeFolderGhostIconNodeState(options = {}) {
  const {
    sourceType = "folder-open-ghost",
    state = {},
    target = {},
  } = options;
  const item = target.item;
  return {
    cellHeight: target.cellHeight,
    cellWidth: target.cellWidth,
    compact: false,
    dragging: false,
    draggable: false,
    dropTarget: false,
    editing: false,
    folderPreviewPageSize: state.folderPageSize,
    ghosted: false,
    hasCustomIcon: false,
    iconSize: target.iconSize,
    interactive: false,
    item,
    launchTargetStatus: item?.type === "app" && state.showMissingLaunchTargetBadge
      ? state.launchTargetStatusById?.[item.id]
      : null,
    opening: false,
    removable: false,
    selected: false,
    source: { type: sourceType, pageIndex: target.pageIndex ?? state.folderPageIndex },
    stageHeight: state.height,
    stageWidth: state.width,
    textless: state.isTextlessMode,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
