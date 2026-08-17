/**
 * The persisted layout boundary shared by the domain and native store.
 *
 * Runtime application objects are intentionally not accepted here. A
 * LayoutDocument contains only stable references, manual launch records, and
 * folder pages so loading and saving cannot silently reintroduce renderer or
 * catalog fields.
 */

export const LAYOUT_DOCUMENT_VERSION = 2;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isObject(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

function requireNonEmptyString(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
}

function requirePositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${path} must be a positive integer`);
  }
}

function requireStringArray(value, path) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${path} must be an array of strings`);
  }
}

function requireOptionalString(object, key, path) {
  if (hasOwn(object, key) && typeof object[key] !== "string") {
    throw new TypeError(`${path}.${key} must be a string`);
  }
}

function requireOptionalBoolean(object, key, path) {
  if (hasOwn(object, key)) requireBoolean(object[key], `${path}.${key}`);
}

function rejectLegacyChildren(object, path) {
  if (hasOwn(object, "children")) {
    throw new TypeError(`${path}.children is no longer supported; use childPages`);
  }
}

function assertLaunchTarget(value, path) {
  const target = requireObject(value, path);
  const kind = requireNonEmptyString(target.kind, `${path}.kind`);
  if (kind === "shortcut" || kind === "executable" || kind === "url") {
    requireNonEmptyString(target.path, `${path}.path`);
    requireOptionalString(target, "appUserModelId", path);
    return kind;
  }
  if (kind === "appUserModelId") {
    requireNonEmptyString(target.appUserModelId, `${path}.appUserModelId`);
    requireOptionalString(target, "path", path);
    return kind;
  }
  throw new TypeError(`${path}.kind must be shortcut, executable, url, or appUserModelId`);
}

function assertCatalogApp(item, path) {
  for (const field of [
    "name",
    "emoji",
    "iconPath",
    "customIconPath",
    "launchTarget",
    "launchArgs",
    "source",
    "sourceKey",
    "sources",
    "trackingKey",
    "identityStatus",
    "iconDataUrl",
    "customIconDataUrl",
  ]) {
    if (hasOwn(item, field)) {
      throw new TypeError(`${path}.${field} must not be persisted on catalog references`);
    }
  }
  if (!hasOwn(item, "overrides")) return;
  const overrides = requireObject(item.overrides, `${path}.overrides`);
  for (const key of Object.keys(overrides)) {
    if (!["name", "emoji", "customIconPath"].includes(key)) {
      throw new TypeError(`${path}.overrides.${key} is not a supported presentation override`);
    }
    requireOptionalString(overrides, key, `${path}.overrides`);
  }
}

function assertManualApp(item, path) {
  for (const field of ["emoji", "iconPath", "customIconPath", "launchArgs"]) {
    requireOptionalString(item, field, path);
  }
  for (const field of ["iconDataUrl", "customIconDataUrl"]) {
    if (hasOwn(item, field)) throw new TypeError(`${path}.${field} must not be persisted`);
  }
  const launchKind = assertLaunchTarget(item.launchTarget, `${path}.launchTarget`);
  if (launchKind !== "executable" && hasOwn(item, "launchArgs")) {
    throw new TypeError(`${path}.launchArgs is only supported for executable launch targets`);
  }
}

function assertLayoutItem(value, path, seenIds, { allowFolder = true } = {}) {
  const item = requireObject(value, path);
  rejectLegacyChildren(item, path);
  const id = requireNonEmptyString(item.id, `${path}.id`);
  if (seenIds.has(id)) throw new TypeError(`layout item id must be unique: ${id}`);
  seenIds.add(id);

  const type = requireNonEmptyString(item.type, `${path}.type`);
  if (type === "catalogApp") {
    assertCatalogApp(item, path);
    return;
  }
  if (type === "manualApp") {
    requireNonEmptyString(item.name, `${path}.name`);
    assertManualApp(item, path);
    return;
  }
  if (type !== "folder" || !allowFolder) {
    throw new TypeError(`${path}.type must be catalogApp, manualApp, or folder`);
  }

  requireNonEmptyString(item.name, `${path}.name`);
  if (!Array.isArray(item.childPages)) throw new TypeError(`${path}.childPages must be an array`);
  item.childPages.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) throw new TypeError(`${path}.childPages[${pageIndex}] must be an array`);
    page.forEach((child, childIndex) => {
      const childPath = `${path}.childPages[${pageIndex}][${childIndex}]`;
      if (!isObject(child) || !["catalogApp", "manualApp"].includes(child.type)) {
        throw new TypeError(`${childPath}.type must be catalogApp or manualApp`);
      }
      assertLayoutItem(child, childPath, seenIds, { allowFolder: false });
    });
  });
}

function assertScanRoots(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((root, index) => {
    const rootPath = `${path}[${index}]`;
    const object = requireObject(root, rootPath);
    requireNonEmptyString(object.id, `${rootPath}.id`);
    const type = requireNonEmptyString(object.type, `${rootPath}.type`);
    if (!["startMenuUser", "startMenuSystem", "customDirectory", "windowsAppCatalog"].includes(type)) {
      throw new TypeError(`${rootPath}.type is not a supported scan root type`);
    }
    requireNonEmptyString(object.label, `${rootPath}.label`);
    requireNonEmptyString(object.path, `${rootPath}.path`);
    requireBoolean(object.enabled, `${rootPath}.enabled`);
    requireBoolean(object.removable, `${rootPath}.removable`);
    requireOptionalString(object, "lastScannedAt", rootPath);
    if (hasOwn(object, "maxDepth")) requirePositiveInteger(object.maxDepth, `${rootPath}.maxDepth`);
    if (hasOwn(object, "maxEntries")) requirePositiveInteger(object.maxEntries, `${rootPath}.maxEntries`);
  });
}

function assertScanAppBlacklist(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const object = requireObject(entry, entryPath);
    requireNonEmptyString(object.catalogId, `${entryPath}.catalogId`);
    requireOptionalString(object, "name", entryPath);
    requireOptionalString(object, "blockedAt", entryPath);
  });
}

function assertLayoutSettings(value) {
  const settings = requireObject(value, "LayoutDocument.settings");
  for (const key of ["gridRows", "gridCols", "folderRows", "folderCols", "iconSize"]) {
    requirePositiveInteger(settings[key], `LayoutDocument.settings.${key}`);
  }
  requireBoolean(settings.textless, "LayoutDocument.settings.textless");
  requireStringArray(settings.hiddenAppIds, "LayoutDocument.settings.hiddenAppIds");
  assertScanRoots(settings.scanRoots, "LayoutDocument.settings.scanRoots");
  requireStringArray(settings.scanKeywordAllowlist, "LayoutDocument.settings.scanKeywordAllowlist");
  requireStringArray(settings.scanKeywordBlacklist, "LayoutDocument.settings.scanKeywordBlacklist");
  assertScanAppBlacklist(settings.scanAppBlacklist, "LayoutDocument.settings.scanAppBlacklist");
  requireBoolean(settings.showMissingLaunchTargetBadge, "LayoutDocument.settings.showMissingLaunchTargetBadge");

  if (hasOwn(settings, "folderIconSize")) {
    requirePositiveInteger(settings.folderIconSize, "LayoutDocument.settings.folderIconSize");
  }
  if (hasOwn(settings, "folderIconSizeMode") && !["global", "custom"].includes(settings.folderIconSizeMode)) {
    throw new TypeError("LayoutDocument.settings.folderIconSizeMode must be global or custom");
  }
  requireOptionalBoolean(settings, "showCustomTitlebar", "LayoutDocument.settings");
  requireOptionalBoolean(settings, "fullscreenOverscanEnabled", "LayoutDocument.settings");
  if (!hasOwn(settings, "mainWindowShortcut")) {
    throw new TypeError("LayoutDocument.settings.mainWindowShortcut is required");
  }
  if (settings.mainWindowShortcut !== null) {
    requireNonEmptyString(settings.mainWindowShortcut, "LayoutDocument.settings.mainWindowShortcut");
  }
  requireOptionalString(settings, "localePreference", "LayoutDocument.settings");
}

/**
 * Assert the canonical persisted layout shape and return the same reference.
 * No migration, repair, or fallback is performed at this boundary.
 *
 * @param {unknown} document
 * @returns {object}
 */
export function assertLayoutDocument(document) {
  const layout = requireObject(document, "LayoutDocument");
  if (layout.version !== LAYOUT_DOCUMENT_VERSION) {
    throw new TypeError(`LayoutDocument.version must be ${LAYOUT_DOCUMENT_VERSION}`);
  }
  if (!Array.isArray(layout.pages)) throw new TypeError("LayoutDocument.pages must be an array");
  const seenIds = new Set();
  layout.pages.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) throw new TypeError(`LayoutDocument.pages[${pageIndex}] must be an array`);
    page.forEach((item, itemIndex) => {
      assertLayoutItem(item, `LayoutDocument.pages[${pageIndex}][${itemIndex}]`, seenIds);
    });
  });
  assertLayoutSettings(layout.settings);
  return layout;
}
