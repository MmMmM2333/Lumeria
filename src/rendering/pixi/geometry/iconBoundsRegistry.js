import { reloadOnPixiHotUpdate } from "../devHmr.js";

const launchIconBounds = new Map();
const launchIconTargetBounds = new Map();
const topLevelBounds = new Map();
const topLevelFolderThumbBounds = new Map();
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

function normalizeClearScope(scope, folderId) {
  if (scope && typeof scope === "object") {
    const targetFolderId = scope.folderId ?? null;
    return {
      area: scope.area || (targetFolderId ? "folder" : null),
      folderId: targetFolderId,
    };
  }
  return {
    area: scope || null,
    folderId: folderId ?? null,
  };
}

function shouldClearLaunchBounds(key, value, criteria) {
  if (!criteria.area && criteria.folderId == null) return true;
  if (criteria.area && !key.startsWith(`${criteria.area}:`)) return false;
  if (criteria.folderId == null) return true;
  const folderId = String(criteria.folderId);
  return value?.meta?.folderId === folderId || key.startsWith(`folder:${folderId}:`);
}

export function registerLaunchIconBounds(source, rect, meta = {}) {
  const key = makeLaunchKey(source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconBounds.set(key, { ...safeRect, meta });
  if (source.area === "desktop") topLevelBounds.set(source.id, { ...safeRect, meta });
}

export function registerLaunchIconTargetBounds(source, rect, meta = {}) {
  const key = makeLaunchKey(source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconTargetBounds.set(key, { ...safeRect, meta });
}

export function registerTopLevelFolderThumbBounds(id, rect, meta = {}) {
  const safeRect = cloneRect(rect);
  if (!id || !safeRect) return;
  topLevelFolderThumbBounds.set(id, { ...safeRect, meta });
}

export function unregisterLaunchIconBounds(source) {
  const key = makeLaunchKey(source);
  if (key) launchIconBounds.delete(key);
  if (key) launchIconTargetBounds.delete(key);
  if ((source?.area === "desktop" || source?.area === "search") && source.id) topLevelFolderThumbBounds.delete(source.id);
  if (source?.area === "desktop" && source.id) {
    topLevelBounds.delete(source.id);
  }
}

export function clearLaunchIconBounds(scope, folderId = null) {
  const criteria = normalizeClearScope(scope, folderId);
  const shouldClearAll = !criteria.area && criteria.folderId == null;
  for (const [key, value] of launchIconBounds) {
    if (shouldClearLaunchBounds(key, value, criteria)) launchIconBounds.delete(key);
    if (value?.meta?.area === "desktop" && (shouldClearAll || criteria.area === "desktop")) {
      topLevelBounds.delete(value.meta.id);
      topLevelFolderThumbBounds.delete(value.meta.id);
    }
  }
  for (const [key, value] of launchIconTargetBounds) {
    if (shouldClearLaunchBounds(key, value, criteria)) launchIconTargetBounds.delete(key);
  }
  for (const [id, value] of topLevelFolderThumbBounds) {
    if (shouldClearAll || value?.meta?.area === criteria.area) topLevelFolderThumbBounds.delete(id);
  }
  if (shouldClearAll || criteria.area === "desktop") {
    topLevelBounds.clear();
  }
}

export function getLaunchIconBounds(source) {
  const key = makeLaunchKey(source);
  return key ? cloneRect(launchIconBounds.get(key)) : null;
}

function matchesExpectedMeta(meta, expected) {
  if (!expected) return true;
  for (const key of ["area", "folderId", "id", "index", "pageIndex"]) {
    if (expected[key] == null) continue;
    if (meta?.[key] !== expected[key]) return false;
  }
  return true;
}

export function getLaunchIconTargetBounds(source, expected = null) {
  const key = makeLaunchKey(source);
  if (!key) return null;
  const value = launchIconTargetBounds.get(key);
  if (!value || !matchesExpectedMeta(value.meta, expected)) return null;
  return cloneRect(value);
}

export function getTopLevelIconBounds(id) {
  return cloneRect(topLevelBounds.get(id));
}

export function getTopLevelFolderThumbBounds(id) {
  return cloneRect(topLevelFolderThumbBounds.get(id));
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

export function clearDesktopIconBounds() {
  clearLaunchIconBounds("desktop");
  clearLaunchIconBounds("search");
}

export function clearFolderIconBounds(folderId = null) {
  clearLaunchIconBounds(folderId ? { area: "folder", folderId } : "folder");
  clearFolderPreviewChildBounds(folderId);
}

export function getFolderPreviewChildBounds(folderId, childId, slotIndex) {
  return cloneRect(folderPreviewChildBounds.get(`${folderId}:${childId}:${slotIndex}`));
}

export function clearIconBoundsRegistry() {
  launchIconBounds.clear();
  launchIconTargetBounds.clear();
  topLevelBounds.clear();
  topLevelFolderThumbBounds.clear();
  folderPreviewChildBounds.clear();
}

reloadOnPixiHotUpdate(import.meta.hot);
