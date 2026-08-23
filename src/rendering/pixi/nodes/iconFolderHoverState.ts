import { reloadOnPixiHotUpdate } from "../devHmr.js";

const FOLDER_HOVER_PADDING_RATIO = 0.16;
const FOLDER_HOVER_PADDING_MIN = 6;
const FOLDER_HOVER_PADDING_MAX = 14;
const APP_FOLDER_CREATE_PADDING_RATIO = 0.18;
const APP_FOLDER_CREATE_PADDING_MIN = 8;
const APP_FOLDER_CREATE_PADDING_MAX = 16;

export interface IconFolderHoverState {
  key: string;
  phase: string;
  targetId: string;
  targetType: "app" | "folder";
}

interface ActiveFolderHoverOptions {
  hoverState?: IconFolderHoverState | null;
  isFolder?: boolean;
  itemId?: string | null;
}

interface ActiveAppFolderCreateHoverOptions extends ActiveFolderHoverOptions {
  itemType?: string | null;
}

interface FolderPreviewPlan {
  endY?: number;
  items?: readonly ({ id?: string | null } | null | undefined)[];
}

function clampPadding(iconSize: number, min: number, max: number, ratio: number): number {
  return Math.max(min, Math.min(max, iconSize * ratio));
}

export function getFolderHoverTargetPadding(iconSize: number): number {
  return clampPadding(iconSize, FOLDER_HOVER_PADDING_MIN, FOLDER_HOVER_PADDING_MAX, FOLDER_HOVER_PADDING_RATIO);
}

export function getAppFolderCreateTargetPadding(iconSize: number): number {
  return clampPadding(iconSize, APP_FOLDER_CREATE_PADDING_MIN, APP_FOLDER_CREATE_PADDING_MAX, APP_FOLDER_CREATE_PADDING_RATIO);
}

export function getActiveFolderHoverState(options: ActiveFolderHoverOptions = {}): IconFolderHoverState | null {
  const {
    hoverState = null,
    isFolder = false,
    itemId = null,
  } = options;
  if (!isFolder || hoverState?.targetId !== itemId || hoverState.targetType !== "folder") return null;
  return hoverState;
}

export function getActiveAppFolderCreateHoverState(
  options: ActiveAppFolderCreateHoverOptions = {}
): IconFolderHoverState | null {
  const {
    hoverState = null,
    isFolder = false,
    itemId = null,
    itemType = null,
  } = options;
  if (isFolder || itemType !== "app" || hoverState?.targetId !== itemId || hoverState.targetType !== "app") return null;
  return hoverState;
}

export function getFolderPreviewPlanKey(
  hoverState: IconFolderHoverState | null | undefined,
  plan: FolderPreviewPlan | null | undefined
): string {
  return `${hoverState?.key}:${plan?.endY}:${(plan?.items || []).map((item) => item?.id || "").join("|")}`;
}

reloadOnPixiHotUpdate(import.meta.hot);
