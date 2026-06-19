import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { stageLayoutRectToClientRect } from "./stageCoordinates.js";

const launchIconBounds = new Map();
const launchIconTargetBounds = new Map();
const topLevelBounds = new Map();
const topLevelLiveTargetBounds = new Map();
const topLevelStageLayoutTargetBounds = new Map();
const topLevelFolderThumbBounds = new Map();
const topLevelFolderThumbLiveTargetBounds = new Map();
const topLevelFolderThumbStageLayoutTargetBounds = new Map();
const folderPreviewChildBounds = new Map();
const folderPreviewChildLiveTargetBounds = new Map();
const folderPreviewChildStageLayoutTargetBounds = new Map();
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

function makeStageLayoutRecord(rect, meta = {}) {
  const safeRect = cloneRect(rect);
  if (!safeRect) return null;
  return { ...safeRect, meta };
}

function projectStageLayoutRecordToClient(record) {
  if (!record) return null;
  const stageRect = record.meta?.stageRect;
  const stageWidth = record.meta?.stageWidth;
  const stageHeight = record.meta?.stageHeight;
  if (!stageRect || !stageWidth || !stageHeight) return cloneRect(record);
  return stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, record);
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

export function registerRenderedClientLaunchIconBounds(source, rect, meta = {}) {
  const key = makeIconBoundsKey("launch", source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconBounds.set(key, { ...safeRect, meta });
  if (source.area === "desktop") topLevelBounds.set(makeIconBoundsKey("top-level", source.id), { ...safeRect, meta });
}

export function registerLiveClientLaunchIconTargetBounds(source, rect, meta = {}) {
  const key = makeIconBoundsKey("launch", source);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  launchIconTargetBounds.set(key, { ...safeRect, meta });
}

export function registerRenderedClientTopLevelFolderThumbBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelFolderThumbBounds.set(key, { ...safeRect, meta });
}

export function registerStableStageLayoutTopLevelIconTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const record = makeStageLayoutRecord(rect, meta);
  if (!key || !record) return;
  topLevelStageLayoutTargetBounds.set(key, record);
}

export function registerLiveClientTopLevelIconTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  topLevelLiveTargetBounds.set(key, { ...safeRect, meta });
}

export function registerStableStageLayoutTopLevelFolderThumbTargetBounds(id, rect, meta = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const record = makeStageLayoutRecord(rect, meta);
  if (!key || !record) return;
  topLevelFolderThumbStageLayoutTargetBounds.set(key, record);
}

export function registerLiveClientTopLevelFolderThumbTargetBounds(id, rect, meta = {}) {
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
    topLevelFolderThumbStageLayoutTargetBounds.delete(topLevelKey);
  }
  if (source?.area === "desktop" && source.id) {
    topLevelBounds.delete(topLevelKey);
    topLevelLiveTargetBounds.delete(topLevelKey);
    topLevelStageLayoutTargetBounds.delete(topLevelKey);
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
      topLevelStageLayoutTargetBounds.delete(topLevelKey);
      topLevelFolderThumbBounds.delete(topLevelKey);
      topLevelFolderThumbLiveTargetBounds.delete(topLevelKey);
      topLevelFolderThumbStageLayoutTargetBounds.delete(topLevelKey);
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
  for (const [id, value] of topLevelFolderThumbStageLayoutTargetBounds) {
    if (shouldClearAll || value?.meta?.area === criteria.area) topLevelFolderThumbStageLayoutTargetBounds.delete(id);
  }
  if (shouldClearAll || criteria.area === "desktop") {
    topLevelBounds.clear();
    topLevelLiveTargetBounds.clear();
    topLevelStageLayoutTargetBounds.clear();
  }
}

export function getRenderedClientLaunchIconBounds(source) {
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

export function getLiveClientLaunchIconTargetBounds(source, expected = null) {
  const key = makeIconBoundsKey("launch", source);
  if (!key) return null;
  const value = launchIconTargetBounds.get(key);
  if (!value || !matchesExpectedMeta(value.meta, expected)) return null;
  return cloneRect(value);
}

export function getRenderedClientTopLevelIconBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-icon", key, options);
  return cloneRect(value);
}

export function getStableClientTopLevelIconTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const stageRecord = key ? topLevelStageLayoutTargetBounds.get(key) : null;
  const value = projectStageLayoutRecordToClient(stageRecord);
  if (!value) warnMissingBounds("top-level-icon-target", key, options);
  return cloneRect(value);
}

export function getStableStageLayoutTopLevelIconTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelStageLayoutTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-icon-stage-layout-target", key, options);
  return cloneRect(value);
}

export function getLiveClientTopLevelIconTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelLiveTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-icon-live-target", key, options);
  return cloneRect(value);
}

export function getRenderedClientTopLevelFolderThumbBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelFolderThumbBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-folder-thumb", key, options);
  return cloneRect(value);
}

export function getLiveClientTopLevelFolderThumbTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelFolderThumbLiveTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-folder-thumb-live-target", key, options);
  return cloneRect(value);
}

export function getStableClientTopLevelFolderThumbTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const stageRecord = key ? topLevelFolderThumbStageLayoutTargetBounds.get(key) : null;
  const value = projectStageLayoutRecordToClient(stageRecord);
  if (!value) warnMissingBounds("top-level-folder-thumb-target", key, options);
  return cloneRect(value);
}

export function getStableStageLayoutTopLevelFolderThumbTargetBounds(id, options = {}) {
  const key = makeIconBoundsKey("top-level", id);
  const value = key ? topLevelFolderThumbStageLayoutTargetBounds.get(key) : null;
  if (!value) warnMissingBounds("top-level-folder-thumb-stage-layout-target", key, options);
  return cloneRect(value);
}

export function getRenderedClientTopLevelTargetAtPoint(x, y, excludeId = null) {
  for (const [id, rect] of topLevelBounds) {
    if (id === excludeId) continue;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return { id, rect: cloneRect(rect) };
    }
  }
  return null;
}

export function registerRenderedClientFolderPreviewChildBounds(folderId, childId, slotIndex, rect) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  const safeRect = cloneRect(rect);
  if (!key || !safeRect) return;
  folderPreviewChildBounds.set(key, safeRect);
}

export function registerStableStageLayoutFolderPreviewChildTargetBounds(folderId, childId, slotIndex, rect, meta = {}) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  const record = makeStageLayoutRecord(rect, meta);
  if (!key || !record) return;
  folderPreviewChildStageLayoutTargetBounds.set(key, record);
}

export function registerLiveClientFolderPreviewChildTargetBounds(folderId, childId, slotIndex, rect) {
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
  for (const key of folderPreviewChildStageLayoutTargetBounds.keys()) {
    if (!folderId || key.startsWith(`${folderId}:`)) folderPreviewChildStageLayoutTargetBounds.delete(key);
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

export function getRenderedClientFolderPreviewChildBounds(folderId, childId, slotIndex) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  return key ? cloneRect(folderPreviewChildBounds.get(key)) : null;
}

export function getLiveClientFolderPreviewChildTargetBounds(folderId, childId, slotIndex) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  return key ? cloneRect(folderPreviewChildLiveTargetBounds.get(key)) : null;
}

export function getStableClientFolderPreviewChildTargetBounds(folderId, childId, slotIndex) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  const stageRecord = key ? folderPreviewChildStageLayoutTargetBounds.get(key) : null;
  return cloneRect(projectStageLayoutRecordToClient(stageRecord));
}

export function getStableStageLayoutFolderPreviewChildTargetBounds(folderId, childId, slotIndex) {
  const key = makeIconBoundsKey("folder-preview-child", { childId, folderId, slotIndex });
  return key ? cloneRect(folderPreviewChildStageLayoutTargetBounds.get(key)) : null;
}

export function clearIconBoundsRegistry() {
  launchIconBounds.clear();
  launchIconTargetBounds.clear();
  topLevelBounds.clear();
  topLevelLiveTargetBounds.clear();
  topLevelStageLayoutTargetBounds.clear();
  topLevelFolderThumbBounds.clear();
  topLevelFolderThumbLiveTargetBounds.clear();
  topLevelFolderThumbStageLayoutTargetBounds.clear();
  folderPreviewChildBounds.clear();
  folderPreviewChildLiveTargetBounds.clear();
  folderPreviewChildStageLayoutTargetBounds.clear();
  missingBoundsWarnings.clear();
}

reloadOnPixiHotUpdate(import.meta.hot);
