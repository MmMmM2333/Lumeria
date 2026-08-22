import { applyCachedIconAssetUrlsToPages } from "../domain/iconSource.js";
import type { LayoutDocument } from "../domain/layoutDocument.js";

type UnknownRecord = Record<string, unknown>;
type RuntimeItem = UnknownRecord;
type RuntimePages = RuntimeItem[][];
type LayoutFragment = Readonly<{
  configuration: UnknownRecord;
  pages: RuntimePages;
}>;
type AppsFragment = UnknownRecord & Readonly<{ hiddenAppIds: readonly string[] }>;
type Reconciliation = Readonly<{
  pages: RuntimePages;
  issues: readonly unknown[];
}>;
type LayoutOwner = Readonly<{
  capture(): LayoutFragment;
  createSnapshot(state: UnknownRecord): LayoutDocument;
  reconcileDocument(
    nativeCatalog: readonly unknown[],
    savedDocument: UnknownRecord,
    hiddenAppIds: readonly string[],
  ): Reconciliation;
  restoreConfiguration(configuration: UnknownRecord): unknown;
  restorePages(pages: RuntimePages): unknown;
}>;
type FragmentOwner<T extends UnknownRecord = UnknownRecord> = Readonly<{
  capture(): T;
  restore(fragment: UnknownRecord): unknown;
}>;
type CoordinatorOptions = Readonly<{
  layout: LayoutOwner;
  settings: FragmentOwner;
  apps: FragmentOwner<AppsFragment>;
  toAssetUrl(filePath: string): string | null | undefined;
}>;

function isDocument(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireCapability(
  owner: UnknownRecord,
  method: string,
  label: string,
): void {
  if (typeof owner?.[method] !== "function") {
    throw new TypeError(`createLaunchpadDocumentCoordinator requires ${label}.${method}`);
  }
}

function requireOwner(value: unknown, label: string, methods: readonly string[]): UnknownRecord {
  if (!isDocument(value)) {
    throw new TypeError(`createLaunchpadDocumentCoordinator requires ${label}`);
  }
  for (const method of methods) requireCapability(value, method, label);
  return value;
}

function validateOptions(value: unknown): CoordinatorOptions {
  if (!isDocument(value)) {
    throw new TypeError("createLaunchpadDocumentCoordinator requires options");
  }
  const layout = requireOwner(value.layout, "layout", [
    "capture",
    "createSnapshot",
    "reconcileDocument",
    "restoreConfiguration",
    "restorePages",
  ]);
  const settings = requireOwner(value.settings, "settings", ["capture", "restore"]);
  const apps = requireOwner(value.apps, "apps", ["capture", "restore"]);
  if (typeof value.toAssetUrl !== "function") {
    throw new TypeError("createLaunchpadDocumentCoordinator requires toAssetUrl");
  }
  return {
    layout: layout as LayoutOwner,
    settings: settings as FragmentOwner,
    apps: apps as FragmentOwner<AppsFragment>,
    toAssetUrl: value.toAssetUrl as CoordinatorOptions["toAssetUrl"],
  };
}

function mapSettingsToLayoutConfiguration(settings: UnknownRecord = {}): UnknownRecord {
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

function flattenOwnerFragments(
  layoutFragment: LayoutFragment,
  settingsFragment: UnknownRecord,
  appsFragment: AppsFragment,
): UnknownRecord {
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

export function createLaunchpadDocumentCoordinator(options: unknown) {
  const validatedOptions = validateOptions(options);
  const { layout, settings, apps } = validatedOptions;

  function capture() {
    return layout.createSnapshot(flattenOwnerFragments(
      layout.capture(),
      settings.capture(),
      apps.capture(),
    ));
  }

  function restoreConfiguration(savedDocument: unknown) {
    if (!isDocument(savedDocument)) {
      throw new TypeError("restoreConfiguration requires a saved launchpad document");
    }

    const savedSettings = savedDocument.settings;
    if (isDocument(savedSettings)) {
      layout.restoreConfiguration(mapSettingsToLayoutConfiguration(savedSettings));
      settings.restore(savedSettings);
      apps.restore(savedSettings);
    }
    return { kind: "configurationRestored" };
  }

  function restorePages(savedDocument: unknown, nativeCatalog: readonly unknown[] = []) {
    if (!isDocument(savedDocument)) {
      throw new TypeError("restorePages requires a saved launchpad document");
    }
    if (!Array.isArray(nativeCatalog)) {
      throw new TypeError("restorePages requires a native catalog array");
    }

    const hiddenAppIds = apps.capture().hiddenAppIds;
    const reconciliation = layout.reconcileDocument(
      nativeCatalog,
      savedDocument,
      hiddenAppIds
    );
    const runtimePages = applyCachedIconAssetUrlsToPages(reconciliation.pages, validatedOptions.toAssetUrl);
    layout.restorePages(runtimePages);
    return {
      issues: reconciliation.issues,
      kind: "pagesRestored",
      pageCount: runtimePages.length,
    };
  }

  function createFromCatalog(nativeCatalog: readonly unknown[]) {
    if (!Array.isArray(nativeCatalog)) {
      throw new TypeError("createFromCatalog requires a native catalog array");
    }
    const hiddenAppIds = apps.capture().hiddenAppIds;
    const reconciliation = layout.reconcileDocument(
      nativeCatalog,
      { version: 2, pages: [], settings: {} },
      hiddenAppIds
    );
    const runtimePages = applyCachedIconAssetUrlsToPages(reconciliation.pages, validatedOptions.toAssetUrl);
    layout.restorePages(runtimePages);
    return {
      issues: reconciliation.issues,
      kind: "createdFromCatalog",
      pageCount: runtimePages.length,
    };
  }

  function signature(document: unknown = capture()): string {
    if (!isDocument(document)) throw new TypeError("signature requires a launchpad document");
    return JSON.stringify(document);
  }

  return Object.freeze({
    capture,
    createFromCatalog,
    restoreConfiguration,
    restorePages,
    signature,
  });
}
