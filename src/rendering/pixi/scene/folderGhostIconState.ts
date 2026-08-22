import { reloadOnPixiHotUpdate } from "../devHmr.js";
import type { SceneItem } from "../../sceneFrame.js";

export type FolderGhostIconTarget = Readonly<{
  cellHeight?: number | undefined;
  cellWidth?: number | undefined;
  iconSize?: number | undefined;
  item: SceneItem;
  pageIndex?: number | undefined;
}>;

export type FolderGhostIconFrame = Readonly<{
  folderPageIndex?: number | undefined;
  folderPageSize?: number | undefined;
  height: number;
  isTextlessMode?: boolean | undefined;
  launchTargetStatusById?: Readonly<Record<string, string>> | undefined;
  showMissingLaunchTargetBadge?: boolean | undefined;
  width: number;
}>;

export type FolderGhostIconStateOptions = Readonly<{
  sourceType?: string;
  state?: Partial<FolderGhostIconFrame>;
  target?: Partial<FolderGhostIconTarget>;
}>;

export type FolderGhostIconNodeState = Readonly<{
  cellHeight: number | undefined;
  cellWidth: number | undefined;
  compact: false;
  draggable: false;
  dragging: false;
  dropTarget: false;
  editing: false;
  focused: false;
  folderPreviewPageSize: number | undefined;
  ghosted: false;
  hasCustomIcon: false;
  iconSize: number | undefined;
  interactive: false;
  item: SceneItem | undefined;
  launchTargetStatus: string | null | undefined;
  opening: false;
  preserveNodeScale: true;
  removable: false;
  selected?: never;
  source: Readonly<{ pageIndex: number | undefined; type: string }>;
  stageHeight: number | undefined;
  stageWidth: number | undefined;
  textless: boolean | undefined;
}>;

export function makeFolderGhostIconNodeState(
  options: FolderGhostIconStateOptions = {},
): FolderGhostIconNodeState {
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
    preserveNodeScale: true,
    removable: false,
    focused: false,
    source: { type: sourceType, pageIndex: target.pageIndex ?? state.folderPageIndex },
    stageHeight: state.height,
    stageWidth: state.width,
    textless: state.isTextlessMode,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
