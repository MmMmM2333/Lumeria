import type { LaunchTarget, ScanAppBlacklistEntry, ScanRoot } from "./layoutDocument.js";

export type CatalogSourceState = "primary" | "equivalent" | "shadowed";

export type CatalogSource = Readonly<{
  key: string;
  type: ScanRoot["type"];
  state: CatalogSourceState;
  rootId: string;
  rootLabel: string;
  relativePath: string;
  groupDisplayName?: string;
  absolutePath: string;
}>;

export type ScannedCatalogApp = Readonly<{
  id: string;
  type: "app";
  name: string;
  iconPath?: string;
  emoji?: string;
  launchTarget: LaunchTarget;
  launchArgs?: string;
  trackingKey: string;
  identityStatus: "exact" | "unresolved";
  sources: readonly CatalogSource[];
}>;

export type CatalogScanWarning = Readonly<{
  rootId: string;
  rootLabel: string;
  kind: string;
  message: string;
}>;

export type CatalogScanRoot = Readonly<Pick<
  ScanRoot,
  "id" | "type" | "label" | "path" | "enabled" | "maxDepth" | "maxEntries"
>>;

export type CatalogScanFilters = Readonly<{
  keywordBlacklist?: readonly string[];
  keywordAllowlist?: readonly string[];
  appBlacklist?: readonly Pick<ScanAppBlacklistEntry, "catalogId">[];
}>;

type UnknownRecord = Record<string, unknown>;

const CATALOG_SOURCE_TYPES = new Set<ScanRoot["type"]>([
  "windowsAppCatalog",
  "startMenuUser",
  "startMenuSystem",
  "customDirectory",
]);
const CATALOG_SOURCE_STATES = new Set<CatalogSourceState>(["primary", "equivalent", "shadowed"]);

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  return value;
}

function requireOptionalString(record: UnknownRecord, key: string, path: string): void {
  if (record[key] !== undefined) requireString(record[key], `${path}.${key}`);
}

function requireOptionalPositiveSafeInteger(record: UnknownRecord, key: string, path: string): void {
  const value = record[key];
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${path}.${key} must be a positive safe integer`);
  }
}

export function assertCatalogLaunchTarget(value: unknown, path = "launchTarget"): LaunchTarget {
  const target = requireRecord(value, path);
  const kind = requireString(target.kind, `${path}.kind`);
  if (kind === "shortcut" || kind === "executable" || kind === "url") {
    requireString(target.path, `${path}.path`);
    requireOptionalString(target, "appUserModelId", path);
    return target as LaunchTarget;
  }
  if (kind === "appUserModelId") {
    requireString(target.appUserModelId, `${path}.appUserModelId`);
    requireOptionalString(target, "path", path);
    return target as LaunchTarget;
  }
  throw new TypeError(`${path}.kind must be shortcut, executable, url, or appUserModelId`);
}

export function assertCatalogSource(value: unknown, path = "catalog source"): CatalogSource {
  const source = requireRecord(value, path);
  requireString(source.key, `${path}.key`);
  if (typeof source.type !== "string" || !CATALOG_SOURCE_TYPES.has(source.type as ScanRoot["type"])) {
    throw new TypeError(`${path}.type must be a supported catalog source type`);
  }
  if (typeof source.state !== "string" || !CATALOG_SOURCE_STATES.has(source.state as CatalogSourceState)) {
    throw new TypeError(`${path}.state must be primary, equivalent, or shadowed`);
  }
  requireString(source.rootId, `${path}.rootId`);
  requireString(source.rootLabel, `${path}.rootLabel`);
  requireString(source.relativePath, `${path}.relativePath`);
  requireOptionalString(source, "groupDisplayName", path);
  requireString(source.absolutePath, `${path}.absolutePath`);
  return source as CatalogSource;
}

export function assertScannedCatalogApp(value: unknown, path = "catalog app"): ScannedCatalogApp {
  const app = requireRecord(value, path);
  requireString(app.id, `${path}.id`);
  if (app.type !== "app") throw new TypeError(`${path}.type must be app`);
  requireString(app.name, `${path}.name`);
  requireOptionalString(app, "iconPath", path);
  requireOptionalString(app, "emoji", path);
  assertCatalogLaunchTarget(app.launchTarget, `${path}.launchTarget`);
  requireOptionalString(app, "launchArgs", path);
  requireString(app.trackingKey, `${path}.trackingKey`);
  if (app.identityStatus !== "exact" && app.identityStatus !== "unresolved") {
    throw new TypeError(`${path}.identityStatus must be exact or unresolved`);
  }
  if (!Array.isArray(app.sources)) throw new TypeError(`${path}.sources must be an array`);
  app.sources.forEach((source, index) => assertCatalogSource(source, `${path}.sources[${index}]`));
  return app as ScannedCatalogApp;
}

export function assertCatalogScanWarning(value: unknown, path = "scan warning"): CatalogScanWarning {
  const warning = requireRecord(value, path);
  requireString(warning.rootId, `${path}.rootId`);
  requireString(warning.rootLabel, `${path}.rootLabel`);
  requireString(warning.kind, `${path}.kind`);
  requireString(warning.message, `${path}.message`);
  return warning as CatalogScanWarning;
}

export function assertCatalogScanRoot(value: unknown, path = "scan root"): CatalogScanRoot {
  const root = requireRecord(value, path);
  requireString(root.id, `${path}.id`);
  if (typeof root.type !== "string" || !CATALOG_SOURCE_TYPES.has(root.type as ScanRoot["type"])) {
    throw new TypeError(`${path}.type must be a supported catalog source type`);
  }
  requireString(root.label, `${path}.label`);
  requireString(root.path, `${path}.path`);
  if (typeof root.enabled !== "boolean") throw new TypeError(`${path}.enabled must be a boolean`);
  requireOptionalPositiveSafeInteger(root, "maxDepth", path);
  requireOptionalPositiveSafeInteger(root, "maxEntries", path);
  return root as CatalogScanRoot;
}

export function assertCatalogScanFilters(value: unknown, path = "scan filters"): CatalogScanFilters {
  const filters = requireRecord(value, path);
  for (const key of ["keywordBlacklist", "keywordAllowlist"] as const) {
    const entries = filters[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) throw new TypeError(`${path}.${key} must be an array`);
    entries.forEach((entry, index) => requireString(entry, `${path}.${key}[${index}]`));
  }
  if (filters.appBlacklist !== undefined) {
    if (!Array.isArray(filters.appBlacklist)) throw new TypeError(`${path}.appBlacklist must be an array`);
    filters.appBlacklist.forEach((entry, index) => {
      const item = requireRecord(entry, `${path}.appBlacklist[${index}]`);
      requireString(item.catalogId, `${path}.appBlacklist[${index}].catalogId`);
    });
  }
  return filters as CatalogScanFilters;
}
