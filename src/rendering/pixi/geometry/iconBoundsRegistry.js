import { reloadOnPixiHotUpdate } from "../devHmr.js";

const launchIconBounds = new Map();
const topLevelBounds = new Map();
const folderPreviewChildBounds = new Map();

function makeLaunchKey(source) {
  if (!source?.id || !source.area) return null;
  const pageIndex = Number.isFinite(Number(source.pageIndex)) ? Number(source.pageIndex) : 0;
  const folderId = source.area === "folder" ? source.folderId || "" : "";
  return `${source.area}:${folderId}:${pageIndex}:${source.id}`;
}

function cloneRect(rect) {
  if (!rect) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

export function registerLaunchIconBounds(source, rect, meta = {}) {
  const key = makeLaunchKey(source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconBounds.set(key, { ...safeRect, meta });
  if (source.area === "desktop") topLevelBounds.set(source.id, { ...safeRect, meta });
}

export function unregisterLaunchIconBounds(source) {
  const key = makeLaunchKey(source);
  if (key) launchIconBounds.delete(key);
  if (source?.area === "desktop" && source.id) topLevelBounds.delete(source.id);
}

export function clearLaunchIconBounds(scope) {
  for (const [key, value] of launchIconBounds) {
    if (!scope || key.startsWith(`${scope}:`)) launchIconBounds.delete(key);
    if (value?.meta?.area === "desktop" && (!scope || scope === "desktop")) {
      topLevelBounds.delete(value.meta.id);
    }
  }
  if (!scope || scope === "desktop") topLevelBounds.clear();
}

export function getLaunchIconBounds(source) {
  const key = makeLaunchKey(source);
  return key ? cloneRect(launchIconBounds.get(key)) : null;
}

export function getTopLevelIconBounds(id) {
  return cloneRect(topLevelBounds.get(id));
}

export function getTopLevelTargetAtPoint(x, y, excludeId = null) {
  for (const [id, rect] of topLevelBounds) {
    if (id === excludeId) continue;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return { id, rect: cloneRect(rect) };
    }
  }
  return null;
}

export function registerFolderPreviewChildBounds(folderId, childId, slotIndex, rect) {
  const safeRect = cloneRect(rect);
  if (!folderId || !childId || !safeRect) return;
  folderPreviewChildBounds.set(`${folderId}:${childId}:${slotIndex}`, safeRect);
}

export function clearFolderPreviewChildBounds(folderId) {
  for (const key of folderPreviewChildBounds.keys()) {
    if (!folderId || key.startsWith(`${folderId}:`)) folderPreviewChildBounds.delete(key);
  }
}

export function getFolderPreviewChildBounds(folderId, childId, slotIndex) {
  return cloneRect(folderPreviewChildBounds.get(`${folderId}:${childId}:${slotIndex}`));
}

export function clearIconBoundsRegistry() {
  launchIconBounds.clear();
  topLevelBounds.clear();
  folderPreviewChildBounds.clear();
}

reloadOnPixiHotUpdate(import.meta.hot);
