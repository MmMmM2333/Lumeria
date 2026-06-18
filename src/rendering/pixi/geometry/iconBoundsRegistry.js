import { reloadOnPixiHotUpdate } from "../devHmr.js";

const launchIconBounds = new Map();
const launchIconTargetBounds = new Map();
const topLevelBounds = new Map();
const topLevelLiveTargetBounds = new Map();
const topLevelTargetBounds = new Map();
const topLevelFolderThumbBounds = new Map();
const topLevelFolderThumbLiveTargetBounds = new Map();
const topLevelFolderThumbTargetBounds = new Map();
const folderPreviewChildBounds = new Map();
const folderPreviewChildLiveTargetBounds = new Map();
const folderPreviewChildTargetBounds = new Map();
const missingBoundsWarnings = new Set();

function isDevMode() {
  return Boolean(import.meta.env?.DEV);
}

function makeLaunchBoundsKey(source) {
  if (!source?.id || !source.area) return null;
  const pageIndex = Number.isFinite(Number(source.pageIndex)) ? Number(source.pageIndex) : 0;
  const folderId = source.area === "folder" ? source.folderId || "" : "";
  return `${source.area}:${folderId}:${pageIndex}:${source.id}`;
}

function makeTopLevelBoundsKey(id) {
  return id ? String(id) : null;
}

function makeFolderPreviewChildBoundsKey(folderId, childId, slotIndex) {
  if (!folderId || !childId) return null;
  return `${folderId}:${childId}:${slotIndex}`;
}

export function makeIconBoundsKey(type, value) {
  if (type === "launch") return makeLaunchBoundsKey(value);
  if (type === "top-level") return makeTopLevelBoundsKey(value);
  if (type === "folder-preview-child") {
    return makeFolderPreviewChildBoundsKey(value?.folderId, value?.childId, value?.slotIndex);
  }
  return null;
}

function warnMissingBounds(type, key, options = {}) {
  if (!options.warnIfMissing || !isDevMode() || !key) return;
  const warningKey = `${type}:${key}:${options.owner || ""}`;
  if (missingBoundsWarnings.has(warningKey)) return;
  missingBoundsWarnings.add(warningKey);
  console.warn("[iconBoundsRegistry] missing icon bounds", {
    key,
    owner: options.owner,
    type,
  });
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
  const key = makeIconBoundsKey("launch", source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconBounds.set(key, { ...safeRect, meta });
  if (source.area === "desktop") topLevelBounds.set(makeIconBoundsKey("top-level", source.id), { ...safeRect, meta });
}

export function registerLaunchIconTargetBounds(source, rect, meta = {}) {
  const key = makeIconBoundsKey("launch", source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconTargetBounds.set(key, { ...safeRect, meta });
}

export function registerTopLevelFolderThumbBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelFolderThumbBounds.set(key, { ...safeRect, meta });
}

export function registerTopLevelIconTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelTargetBounds.set(key, { ...safeRect, meta });
}

export function registerTopLevelIconLiveTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelLiveTargetBounds.set(key, { ...safeRect, meta });
}

export function registerTopLevelFolderThumbTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelFolderThumbTargetBounds.set(key, { ...safeRect, meta });
}

export function registerTopLevelFolderThumbLiveTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelFolderThumbLiveTargetBounds.set(key, { ...safeRect, meta });
}

export function unregisterLaunchIconBounds(source) {
  const key = makeIconBoundsKey("launch", source);
  if (key) launchIconBounds.delete(key);
  if (key) launchIconTargetBounds.delete(key);
  const topLevelKey = makeIconBoundsKey("top-level", source?.id);
  if ((source?.area === "desktop" || source?.area === "search") && source.id) {
    topLevelFolderThumbBounds.delete(topLevelKey);
    topLevelFolderThumbLiveTargetBounds.delete(topLevelKey);
    topLevelFolderThumbTargetBounds.delete(topLevelKey);
  }
  if (source?.area === "desktop" && source.id) {
    topLevelBounds.delete(topLevelKey);
    topLevelLiveTargetBounds.delete(topLevelKey);
    topLevelTargetBounds.delete(topLevelKey);
  }
}

export function clearLaunchIconBounds(scope, folderId = null) {
  const criteria = normalizeClearScope(scope, folderId);
  const shouldClearAll = !criteria.area && criteria.folderId == null;
  for (const [key, value] of launchIconBounds) {
    if (shouldClearLaunchBounds(key, value, criteria)) launchIconBounds.delete(key);
    if (value?.meta?.area === "desktop" && (shouldClearAll || criteria.area === "desktop")) {
      const topLevelKey = makeIconBoundsKey("top-level", value.meta.id);
      topLevelBounds.delete(topLevelKey);
      topLevelLiveTargetBounds.delete(topLevelKey);
      topLevelTargetBounds.delete(topLevelKey);
      topLevelFolderThumbBounds.delete(topLevelKey);
      topLevelFolderThumbLiveTargetBounds.delete(topLevelKey);
      topLevelFolderThumbTargetBounds.delete(topLevelKey);
    }
  }
  for (const [key, value] of launchIconTargetBounds) {
    if (shouldClearLaunchBounds(key, value, criteria)) launchIconTargetBounds.delete(key);
  }
  for (const [id, value] of topLevelFolderThumbBounds) {
    if (shouldClearAll || value?.meta?.area === criteria.area) topLevelFolderThumbBounds.delete(id);
  }
  for (const [id, value] of topLevelFolderThumbLiveTargetBounds) {
    if (shouldClearAll || value?.meta?.area === criteria.area) topLevelFolderThumbLiveTargetBounds.delete(id);
  }
  for (const [id, value] of topLevelFolderThumbTargetBounds) {
    if (shouldClearAll || value?.meta?.area === criteria.area) topLevelFolderThumbTargetBounds.delete(id);
  }
  if (shouldClearAll || criteria.area === "desktop") {
    topLevelBounds.clear();
    topLevelLiveTargetBounds.clear();
    topLevelTargetBounds.clear();
  }
}

export function getLaunchIconBounds(source) {
  const key = makeIconBoundsKey("launch", source);
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
  const key = makeIconBoundsKey("launch", source);
  if (!key) return null;
  const value = launchIconTargetBounds.get(key);
  if (!value || !matchesExpectedMeta(value.meta, expected)) return null;
  return cloneRect(value);
}

export function getTopLevelIconBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-icon", key, options);
  return cloneRect(value);
}

export function getTopLevelIconTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-icon-target", key, options);
  return cloneRect(value);
}

export function getTopLevelIconLiveTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelLiveTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-icon-live-target", key, options);
  return cloneRect(value);
}

export function getTopLevelFolderThumbBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelFolderThumbBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-folder-thumb", key, options);
  return cloneRect(value);
}

export function getTopLevelFolderThumbLiveTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelFolderThumbLiveTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-folder-thumb-live-target", key, options);
  return cloneRect(value);
}

export function getTopLevelFolderThumbTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelFolderThumbTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-folder-thumb-target", key, options);
  return cloneRect(value);
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
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  folderPreviewChildBounds.set(key, safeRect);
}

export function registerFolderPreviewChildTargetBounds(folderId, childId, slotIndex, rect) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  folderPreviewChildTargetBounds.set(key, safeRect);
}

export function registerFolderPreviewChildLiveTargetBounds(folderId, childId, slotIndex, rect) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  folderPreviewChildLiveTargetBounds.set(key, safeRect);
}

export function clearFolderPreviewChildBounds(folderId) {
  for (const key of folderPreviewChildBounds.keys()) {
    if (!folderId || key.startsWith(`${folderId}:`)) folderPreviewChildBounds.delete(key);
  }
  for (const key of folderPreviewChildLiveTargetBounds.keys()) {
    if (!folderId || key.startsWith(`${folderId}:`)) folderPreviewChildLiveTargetBounds.delete(key);
  }
  for (const key of folderPreviewChildTargetBounds.keys()) {
    if (!folderId || key.startsWith(`${folderId}:`)) folderPreviewChildTargetBounds.delete(key);
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
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  return key ? cloneRect(folderPreviewChildBounds.get(key)) : null;
}

export function getFolderPreviewChildLiveTargetBounds(folderId, childId, slotIndex) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  return key ? cloneRect(folderPreviewChildLiveTargetBounds.get(key)) : null;
}

export function getFolderPreviewChildTargetBounds(folderId, childId, slotIndex) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  return key ? cloneRect(folderPreviewChildTargetBounds.get(key)) : null;
}

export function clearIconBoundsRegistry() {
  launchIconBounds.clear();
  launchIconTargetBounds.clear();
  topLevelBounds.clear();
  topLevelLiveTargetBounds.clear();
  topLevelTargetBounds.clear();
  topLevelFolderThumbBounds.clear();
  topLevelFolderThumbLiveTargetBounds.clear();
  topLevelFolderThumbTargetBounds.clear();
  folderPreviewChildBounds.clear();
  folderPreviewChildLiveTargetBounds.clear();
  folderPreviewChildTargetBounds.clear();
  missingBoundsWarnings.clear();
}

reloadOnPixiHotUpdate(import.meta.hot);
