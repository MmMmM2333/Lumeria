import { applyCachedIconAssetUrlsToPages } from "../domain/iconSource.js";

function requireCapability(owner, method, label) {
  if (typeof owner?.[method] !== "function") {
    throw new TypeError(`createLaunchpadDocumentCoordinator requires ${label}.${method}`);
  }
}

function isDocument(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mapSettingsToLayoutConfiguration(settings = {}) {
  return {
    rows: settings.gridRows,
    cols: settings.gridCols,
    folderRows: settings.folderRows,
    folderCols: settings.folderCols,
    iconSize: settings.iconSize,
    folderIconSizeMode: settings.folderIconSizeMode,
    folderIconSize: settings.folderIconSize ?? settings.iconSize,
  };
}

function flattenOwnerFragments(layoutFragment, settingsFragment, appsFragment) {
  const configuration = layoutFragment.configuration;
  return {
    pages: layoutFragment.pages,
    gridRows: configuration.rows,
    gridCols: configuration.cols,
    folderRows: configuration.folderRows,
    folderCols: configuration.folderCols,
    iconSize: configuration.iconSize,
    folderIconSizeMode: configuration.folderIconSizeMode,
    folderIconSize: configuration.folderIconSize,
    ...settingsFragment,
    ...appsFragment,
  };
}

export function createLaunchpadDocumentCoordinator(options) {
  const layout = options?.layout;
  const settings = options?.settings;
  const apps = options?.apps;
  requireCapability(layout, "capture", "layout");
  requireCapability(layout, "createSnapshot", "layout");
  requireCapability(layout, "mergeCatalog", "layout");
  requireCapability(layout, "restoreConfiguration", "layout");
  requireCapability(layout, "restorePages", "layout");
  requireCapability(settings, "capture", "settings");
  requireCapability(settings, "restore", "settings");
  requireCapability(apps, "capture", "apps");
  requireCapability(apps, "restore", "apps");
  if (typeof options?.toAssetUrl !== "function") {
    throw new TypeError("createLaunchpadDocumentCoordinator requires toAssetUrl");
  }

  function capture() {
    return layout.createSnapshot(flattenOwnerFragments(
      layout.capture(),
      settings.capture(),
      apps.capture()
    ));
  }

  function restore(savedDocument, nativeCatalog = []) {
    if (!isDocument(savedDocument)) {
      throw new TypeError("restore requires a saved launchpad document");
    }
    if (!Array.isArray(nativeCatalog)) {
      throw new TypeError("restore requires a native catalog array");
    }

    const savedSettings = savedDocument.settings;
    if (isDocument(savedSettings)) {
      layout.restoreConfiguration(mapSettingsToLayoutConfiguration(savedSettings));
      settings.restore(savedSettings);
      apps.restore(savedSettings);
    }
    const hiddenAppIds = apps.capture().hiddenAppIds;
    const mergedPages = layout.mergeCatalog(
      nativeCatalog,
      Array.isArray(savedDocument.pages) ? savedDocument.pages : [],
      hiddenAppIds
    );
    const runtimePages = applyCachedIconAssetUrlsToPages(mergedPages, options.toAssetUrl);
    layout.restorePages(runtimePages);
    return {
      kind: "restored",
      pageCount: runtimePages.length,
    };
  }

  function createFromCatalog(nativeCatalog) {
    if (!Array.isArray(nativeCatalog)) {
      throw new TypeError("createFromCatalog requires a native catalog array");
    }
    const hiddenAppIds = apps.capture().hiddenAppIds;
    const mergedPages = layout.mergeCatalog(nativeCatalog, [], hiddenAppIds);
    const runtimePages = applyCachedIconAssetUrlsToPages(mergedPages, options.toAssetUrl);
    layout.restorePages(runtimePages);
    return {
      kind: "createdFromCatalog",
      pageCount: runtimePages.length,
    };
  }

  function signature(document = capture()) {
    if (!isDocument(document)) throw new TypeError("signature requires a launchpad document");
    return JSON.stringify(document);
  }

  return Object.freeze({
    capture,
    createFromCatalog,
    restore,
    signature,
  });
}
