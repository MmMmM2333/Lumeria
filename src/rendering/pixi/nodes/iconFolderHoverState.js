import { reloadOnPixiHotUpdate } from "../devHmr.js";

const FOLDER_HOVER_PADDING_RATIO = 0.16;
const FOLDER_HOVER_PADDING_MIN = 6;
const FOLDER_HOVER_PADDING_MAX = 14;
const APP_FOLDER_CREATE_PADDING_RATIO = 0.18;
const APP_FOLDER_CREATE_PADDING_MIN = 8;
const APP_FOLDER_CREATE_PADDING_MAX = 16;

function clampPadding(iconSize, min, max, ratio) {
  return Math.max(min, Math.min(max, iconSize * ratio));
}

export function getFolderHoverTargetPadding(iconSize) {
  return clampPadding(iconSize, FOLDER_HOVER_PADDING_MIN, FOLDER_HOVER_PADDING_MAX, FOLDER_HOVER_PADDING_RATIO);
}

export function getAppFolderCreateTargetPadding(iconSize) {
  return clampPadding(iconSize, APP_FOLDER_CREATE_PADDING_MIN, APP_FOLDER_CREATE_PADDING_MAX, APP_FOLDER_CREATE_PADDING_RATIO);
}

export function getActiveFolderHoverState(options = {}) {
  const {
    hoverState = null,
    isFolder = false,
    itemId = null,
  } = options;
  if (!isFolder || hoverState?.targetId !== itemId || hoverState.targetType !== "folder") return null;
  return hoverState;
}

export function getActiveAppFolderCreateHoverState(options = {}) {
  const {
    hoverState = null,
    isFolder = false,
    itemId = null,
    itemType = null,
  } = options;
  if (isFolder || itemType !== "app" || hoverState?.targetId !== itemId || hoverState.targetType !== "app") return null;
  return hoverState;
}

export function getFolderPreviewPlanKey(hoverState, plan) {
  return `${hoverState?.key}:${plan?.endY}:${(plan?.items || []).map((item) => item?.id || "").join("|")}`;
}

reloadOnPixiHotUpdate(import.meta.hot);
