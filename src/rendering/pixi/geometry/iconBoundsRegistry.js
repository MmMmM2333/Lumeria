import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const ICON_BOUNDS_KIND = Object.freeze({
  FOLDER_THUMB: "folderThumb",
  LAUNCH: "launch",
  PREVIEW_CHILD: "previewChild",
  TOP_LEVEL: "topLevel",
});

export const ICON_BOUNDS_VARIANT = Object.freeze({
  LIVE_TARGET: "liveTarget",
  RENDERED: "rendered",
  STABLE_STAGE_LAYOUT: "stableStageLayout",
});

const ALL_KINDS = Object.freeze(Object.values(ICON_BOUNDS_KIND));
const ALL_VARIANTS = Object.freeze(Object.values(ICON_BOUNDS_VARIANT));
const EXPECTED_META_KEYS = Object.freeze(["area", "folderId", "id", "index", "pageIndex"]);

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

export function makeIconBoundsKey(kind, value) {
  if (kind === ICON_BOUNDS_KIND.LAUNCH) return makeLaunchBoundsKey(value);
  if (kind === ICON_BOUNDS_KIND.TOP_LEVEL || kind === ICON_BOUNDS_KIND.FOLDER_THUMB) {
    return makeTopLevelBoundsKey(value);
  }
  if (kind === ICON_BOUNDS_KIND.PREVIEW_CHILD) {
    return makeFolderPreviewChildBoundsKey(value?.folderId, value?.childId, value?.slotIndex);
  }
  return null;
}

function storeKey(kind, variant) {
  return `${kind}:${variant}`;
}

function createStores() {
  const stores = new Map();
  for (const kind of ALL_KINDS) {
    for (const variant of ALL_VARIANTS) {
      stores.set(storeKey(kind, variant), new Map());
    }
  }
  return stores;
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

function cloneMeta(meta = {}) {
  return { ...(meta || {}) };
}

function makeBoundsRecord(rect, meta = {}) {
  const safeRect = cloneRect(rect);
  if (!safeRect) return null;
  return { ...safeRect, meta: cloneMeta(meta) };
}

function makeStageLayoutRecord(rect, meta = {}) {
  const safeRect = cloneRect(rect);
  if (!safeRect) return null;
  return { ...safeRect, meta: cloneMeta(meta) };
}

function cloneBoundsRecord(record) {
  const safeRect = cloneRect(record);
  if (!safeRect) return null;
  return {
    ...safeRect,
    meta: cloneMeta(record.meta),
  };
}

function normalizeClearScope(scope, folderId) {
  if (scope && typeof scope === "object") {
    const targetFolderId = scope.folderId ?? null;
    return {
      area: scope.area || (targetFolderId ? "folder" : null),
      folderId: targetFolderId,
      kind: scope.kind || null,
      variant: scope.variant || null,
    };
  }
  return {
    area: scope || null,
    folderId: folderId ?? null,
    kind: null,
    variant: null,
  };
}

function shouldClearLaunchRecord(key, value, criteria) {
  if (!criteria.area && criteria.folderId == null) return true;
  if (criteria.area && !key.startsWith(`${criteria.area}:`)) return false;
  if (criteria.folderId == null) return true;
  const folderId = String(criteria.folderId);
  return value?.meta?.folderId === folderId || key.startsWith(`folder:${folderId}:`);
}

function shouldClearMetaRecord(value, criteria) {
  if (!criteria.area && criteria.folderId == null) return true;
  if (criteria.area && value?.meta?.area !== criteria.area) return false;
  if (criteria.folderId == null) return true;
  return value?.meta?.folderId === String(criteria.folderId);
}

function shouldClearPreviewChildKey(key, criteria) {
  if (!criteria.folderId) return true;
  return key.startsWith(`${criteria.folderId}:`);
}

function hasExpectedMetaShape(value) {
  return EXPECTED_META_KEYS.some((key) => value?.[key] != null);
}

function normalizeGetOptions(options = {}) {
  if (!options) return {};
  if (options.expected || options.warnIfMissing || options.owner) return options;
  if (hasExpectedMetaShape(options)) return { expected: options };
  return options;
}

function matchesExpectedMeta(meta, expected) {
  if (!expected) return true;
  for (const key of EXPECTED_META_KEYS) {
    if (expected[key] == null) continue;
    if (meta?.[key] !== expected[key]) return false;
  }
  return true;
}

function rectContainsPoint(rect, x, y) {
  return Boolean(rect) &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom;
}

export function createIconBoundsRegistry() {
  const stores = createStores();
  const missingWarnings = new Set();

  function getStore(kind, variant) {
    return stores.get(storeKey(kind, variant)) || null;
  }

  function warnMissingBounds(kind, variant, key, options = {}) {
    if (!options.warnIfMissing || !isDevMode() || !key) return;
    const warningKey = `${kind}:${variant}:${key}:${options.owner || ""}`;
    if (missingWarnings.has(warningKey)) return;
    missingWarnings.add(warningKey);
    console.warn("[iconBoundsRegistry] missing icon bounds", {
      key,
      kind,
      owner: options.owner,
      variant,
    });
  }

  function registerBounds(kind, variant, keyInput, rect, meta = {}) {
    const key = makeIconBoundsKey(kind, keyInput);
    const store = getStore(kind, variant);
    if (!key || !store) return;
    const record = variant === ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT
      ? makeStageLayoutRecord(rect, meta)
      : makeBoundsRecord(rect, meta);
    if (!record) return;
    store.set(key, record);
    if (
      kind === ICON_BOUNDS_KIND.LAUNCH &&
      variant === ICON_BOUNDS_VARIANT.RENDERED &&
      keyInput?.area === "desktop"
    ) {
      const topLevelKey = makeIconBoundsKey(ICON_BOUNDS_KIND.TOP_LEVEL, keyInput.id);
      if (topLevelKey) getStore(ICON_BOUNDS_KIND.TOP_LEVEL, ICON_BOUNDS_VARIANT.RENDERED)?.set(topLevelKey, record);
    }
  }

  function getRecord(kind, variant, keyInput, options = {}) {
    const normalizedOptions = normalizeGetOptions(options);
    const key = makeIconBoundsKey(kind, keyInput);
    const store = getStore(kind, variant);
    const value = key && store ? store.get(key) : null;
    if (!value) warnMissingBounds(kind, variant, key, normalizedOptions);
    if (!value || !matchesExpectedMeta(value.meta, normalizedOptions.expected)) return null;
    return cloneBoundsRecord(value);
  }

  function getBounds(kind, variant, keyInput, options = {}) {
    const record = getRecord(kind, variant, keyInput, options);
    if (!record) return null;
    return variant === ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT
      ? record
      : cloneRect(record);
  }

  function getAtPoint(kind, x, y, options = {}) {
    const store = getStore(kind, ICON_BOUNDS_VARIANT.RENDERED);
    if (!store) return null;
    const excludeId = options?.excludeId == null ? null : String(options.excludeId);
    for (const [key, rect] of store) {
      const meta = rect?.meta || {};
      const id = kind === ICON_BOUNDS_KIND.LAUNCH
        ? String(meta.id == null ? key.split(":").pop() : meta.id)
        : String(key);
      if (excludeId && id === excludeId) continue;
      if (options.area && meta.area !== options.area) continue;
      if (options.folderId != null && meta.folderId !== options.folderId) continue;
      if (!rectContainsPoint(rect, x, y)) continue;
      if (kind === ICON_BOUNDS_KIND.TOP_LEVEL) return { id, rect: cloneRect(rect) };
      return {
        id,
        key,
        meta: cloneMeta(meta),
        rect: cloneRect(rect),
      };
    }
    return null;
  }

  function clearSpecificKind(criteria) {
    const kinds = criteria.kind ? [criteria.kind] : ALL_KINDS;
    const variants = criteria.variant ? [criteria.variant] : ALL_VARIANTS;
    for (const kind of kinds) {
      for (const variant of variants) {
        const store = getStore(kind, variant);
        if (!store) continue;
        if (kind === ICON_BOUNDS_KIND.LAUNCH) {
          for (const [key, value] of store) {
            if (shouldClearLaunchRecord(key, value, criteria)) store.delete(key);
          }
          continue;
        }
        if (kind === ICON_BOUNDS_KIND.PREVIEW_CHILD) {
          for (const key of store.keys()) {
            if (shouldClearPreviewChildKey(key, criteria)) store.delete(key);
          }
          continue;
        }
        for (const [key, value] of store) {
          if (shouldClearMetaRecord(value, criteria)) store.delete(key);
        }
      }
    }
  }

  function clearTopLevelDesktopRecords(criteria, shouldClearAll) {
    if (shouldClearAll || criteria.area === "desktop") {
      for (const variant of ALL_VARIANTS) {
        getStore(ICON_BOUNDS_KIND.TOP_LEVEL, variant)?.clear();
      }
    }
    if (shouldClearAll) {
      for (const variant of ALL_VARIANTS) {
        getStore(ICON_BOUNDS_KIND.FOLDER_THUMB, variant)?.clear();
      }
      return;
    }
    for (const variant of ALL_VARIANTS) {
      const store = getStore(ICON_BOUNDS_KIND.FOLDER_THUMB, variant);
      for (const [key, value] of store || []) {
        if (shouldClearMetaRecord(value, criteria)) store.delete(key);
      }
    }
  }

  function clearBounds(scope = null, folderId = null) {
    const criteria = normalizeClearScope(scope, folderId);
    const shouldClearAll = !criteria.area && criteria.folderId == null && !criteria.kind && !criteria.variant;
    if (shouldClearAll) {
      for (const store of stores.values()) store.clear();
      missingWarnings.clear();
      return;
    }
    if (criteria.kind || criteria.variant) {
      clearSpecificKind(criteria);
      return;
    }
    for (const variant of ALL_VARIANTS) {
      const store = getStore(ICON_BOUNDS_KIND.LAUNCH, variant);
      for (const [key, value] of store || []) {
        if (shouldClearLaunchRecord(key, value, criteria)) store.delete(key);
      }
    }
    clearTopLevelDesktopRecords(criteria, shouldClearAll);
  }

  return {
    clearBounds,
    getAtPoint,
    getBounds,
    getRecord,
    makeKey: makeIconBoundsKey,
    registerBounds,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
