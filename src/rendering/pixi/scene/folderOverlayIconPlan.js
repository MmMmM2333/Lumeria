import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";

export function makeFolderIconRenderPlan(options = {}) {
  const {
    folderId = null,
    geometry = null,
    index = 0,
    item = null,
    pageIndex = 0,
    slot = null,
  } = options;
  const safePageIndex = Math.max(0, Number(pageIndex) || 0);
  const safeIndex = Math.max(0, Number(index) || 0);
  const gridWidth = Number(geometry?.grid?.width) || 0;
  const x = safePageIndex * gridWidth + (Number(slot?.left) || 0) + (Number(slot?.width) || 0) / 2;
  const y = (Number(slot?.top) || 0) + (Number(slot?.height) || 0) / 2;
  const source = { type: "folder", folderId, index: safeIndex, pageIndex: safePageIndex, slotIndex: safeIndex };
  return {
    key: `${folderId}:${safePageIndex}:${item?.id}`,
    source,
    x,
    y,
  };
}

export function makeFolderIconTargetCenter(options = {}) {
  const {
    geometry = null,
    isTextlessMode = false,
    targetTrackX = 0,
    x = 0,
    y = 0,
  } = options;
  return {
    x: (Number(geometry?.panel?.left) || 0) + x + targetTrackX,
    y: (Number(geometry?.panel?.top) || 0) + y + getIconVisualOffsetY(isTextlessMode),
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
