import {assertAppImportState,type AppImportState} from "./appImportState.js";
/**
 * Closed-world persisted layout contract shared by the renderer and native store.
 *
 * The application has not shipped a public layout format, so version 2 has one
 * canonical shape: the current writer output. This boundary validates only; it
 * never migrates, repairs, drops unknown fields, or supplies defaults.
 */

export const LAYOUT_DOCUMENT_VERSION = 2;

export type CatalogAppOverrides = {
  name?: string;
  emoji?: string;
  customIconPath?: string;
};

export type CatalogAppLayoutItem = {
  id: string;
  type: "catalogApp";
  overrides?: CatalogAppOverrides;
};

export type ExecutableLaunchTarget = {
  kind: "executable";
  path: string;
  appUserModelId?: string;
};

export type PathLaunchTarget = {
  kind: "shortcut" | "url";
  path: string;
  appUserModelId?: string;
};

export type AppUserModelIdLaunchTarget = {
  kind: "appUserModelId";
  appUserModelId: string;
  path?: string;
};

export type LaunchTarget =
  | ExecutableLaunchTarget
  | PathLaunchTarget
  | AppUserModelIdLaunchTarget;

type ManualAppBase = {
  id: string;
  type: "manualApp";
  name: string;
  emoji?: string;
  iconPath?: string;
  customIconPath?: string;
};

export type ManualAppLayoutItem =
  | (ManualAppBase & {
      launchTarget: ExecutableLaunchTarget;
      launchArgs?: string;
    })
  | (ManualAppBase & {
      launchTarget: PathLaunchTarget | AppUserModelIdLaunchTarget;
      launchArgs?: never;
    });

export type FolderChildLayoutItem = CatalogAppLayoutItem | ManualAppLayoutItem;

export type FolderLayoutItem = {
  id: string;
  type: "folder";
  name: string;
  childPages: FolderChildLayoutItem[][];
};

export type LayoutItem = FolderChildLayoutItem | FolderLayoutItem;

export type ScanRoot = {
  id: string;
  type: "startMenuUser" | "startMenuSystem" | "customDirectory" | "windowsAppCatalog";
  label: string;
  path: string;
  enabled: boolean;
  removable: boolean;
  lastScannedAt?: string;
  maxDepth?: number;
  maxEntries?: number;
};

export type ScanAppBlacklistEntry = {
  catalogId: string;
  name?: string;
  blockedAt?: string;
};

export type AcrylicParameters = {
  brightness: number;
  contrast: number;
  noise: number;
  saturation: number;
  seed: number;
  tintColor: [number, number, number];
  tintStrength: number;
};

export type LayoutSettings = {
  gridRows: number;
  gridCols: number;
  folderRows: number;
  folderCols: number;
  iconSize: number;
  folderIconSizeMode: "global" | "custom";
  folderIconSize: number;
  textless: boolean;
  importState: AppImportState;
  hiddenAppIds: string[];
  scanRoots: ScanRoot[];
  scanKeywordBlacklist: string[];
  scanKeywordAllowlist: string[];
  scanAppBlacklist: ScanAppBlacklistEntry[];
  showMissingLaunchTargetBadge: boolean;
  backgroundBaseColor: string;
  backgroundBaseOpacity: number;
  backgroundSource: "systemMaterial" | "customImage" | "windowsWallpaper" | "windowsLiveDesktop";
  backgroundEffect: "none" | "dimmed" | "blur" | "acrylic";
  backgroundImageOpacity: number;
  backgroundLiveDesktopOpacity: number;
  backgroundImageLayout: "fill" | "fit" | "stretch" | "tile" | "center";
  backgroundBlurStrength: number;
  backgroundAcrylicBlurStrength: number;
  backgroundDarkenStrength: number;
  backgroundDarkenColor: string;
  backgroundAcrylicAppearance: "system" | "dark" | "light";
  backgroundAcrylicDarkParams: AcrylicParameters;
  backgroundAcrylicLightParams: AcrylicParameters;
  backgroundImagePath: string | null;
  windowEffectMaterial: "none" | "acrylic" | "mica" | "micaAlt";
  windowEffectAppearance: "system" | "dark" | "light";
  windowMode: "fullscreen" | "windowed";
  fullscreenOverscanEnabled: boolean;
  showCustomTitlebar: boolean;
  mainWindowShortcut: string | null;
  localePreference: string;
  settingsThemePreference: "system" | "dark" | "light";
  launchpadIconVariant: "light" | "dark" | "pastelLight" | "pastelDark";
};

export type LayoutDocument = {
  version: typeof LAYOUT_DOCUMENT_VERSION;
  pages: LayoutItem[][];
  settings: LayoutSettings;
};

type UnknownRecord = Record<string, unknown>;
type ValidationOptions = { maxUtf8Bytes?: number | null };

const ROOT_FIELDS = ["version", "pages", "settings"];
const CATALOG_APP_FIELDS = ["id", "type", "overrides"];
const CATALOG_OVERRIDE_FIELDS = ["name", "emoji", "customIconPath"];
const MANUAL_APP_FIELDS = [
  "id",
  "type",
  "name",
  "emoji",
  "iconPath",
  "customIconPath",
  "launchTarget",
  "launchArgs",
];
const FOLDER_FIELDS = ["id", "type", "name", "childPages"];
const LAUNCH_TARGET_FIELDS = ["kind", "path", "appUserModelId"];
const SCAN_ROOT_FIELDS = [
  "id",
  "type",
  "label",
  "path",
  "enabled",
  "removable",
  "lastScannedAt",
  "maxDepth",
  "maxEntries",
];
const SCAN_APP_BLACKLIST_FIELDS = ["catalogId", "name", "blockedAt"];
const ACRYLIC_PARAMETER_FIELDS = [
  "brightness",
  "contrast",
  "noise",
  "saturation",
  "seed",
  "tintColor",
  "tintStrength",
];
const SETTINGS_FIELDS = [
  "gridRows",
  "gridCols",
  "folderRows",
  "folderCols",
  "iconSize",
  "folderIconSizeMode",
  "folderIconSize",
  "textless",
  "importState",
  "hiddenAppIds",
  "scanRoots",
  "scanKeywordBlacklist",
  "scanKeywordAllowlist",
  "scanAppBlacklist",
  "showMissingLaunchTargetBadge",
  "backgroundBaseColor",
  "backgroundBaseOpacity",
  "backgroundSource",
  "backgroundEffect",
  "backgroundImageOpacity",
  "backgroundLiveDesktopOpacity",
  "backgroundImageLayout",
  "backgroundBlurStrength",
  "backgroundAcrylicBlurStrength",
  "backgroundDarkenStrength",
  "backgroundDarkenColor",
  "backgroundAcrylicAppearance",
  "backgroundAcrylicDarkParams",
  "backgroundAcrylicLightParams",
  "backgroundImagePath",
  "windowEffectMaterial",
  "windowEffectAppearance",
  "windowMode",
  "fullscreenOverscanEnabled",
  "showCustomTitlebar",
  "mainWindowShortcut",
  "localePreference",
  "settingsThemePreference",
  "launchpadIconVariant",
];

const hasOwn = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function isObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): UnknownRecord {
  if (!isObject(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

function assertExactFields(
  object: UnknownRecord,
  allowedFields: readonly string[],
  path: string,
  requiredFields: readonly string[] = allowedFields,
): void {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new TypeError(`${path}.${key} is not supported`);
  }
  for (const key of requiredFields) {
    if (!hasOwn(object, key)) throw new TypeError(`${path}.${key} is required`);
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  { maxUtf8Bytes = null }: ValidationOptions = {},
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  if (maxUtf8Bytes !== null && new TextEncoder().encode(value).byteLength > maxUtf8Bytes) {
    throw new TypeError(`${path} must be at most ${maxUtf8Bytes} UTF-8 bytes`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
}

function requireIntegerInRange(value: unknown, minimum: number, maximum: number, path: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${path} must be an integer from ${minimum} to ${maximum}`);
  }
}

function requireNumberInRange(value: unknown, minimum: number, maximum: number, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${path} must be a number from ${minimum} to ${maximum}`);
  }
}

function requireEnum<T extends string>(value: unknown, allowedValues: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new TypeError(`${path} must be ${allowedValues.join(", ")}`);
  }
  return value as T;
}

function requireColor(value: unknown, path: string): void {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new TypeError(`${path} must be a lowercase #rrggbb color`);
  }
}

function requireNonEmptyStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((entry, index) => requireNonEmptyString(entry, `${path}[${index}]`));
}

function requireOptionalNonEmptyString(object: UnknownRecord, key: string, path: string): void {
  if (hasOwn(object, key)) requireNonEmptyString(object[key], `${path}.${key}`);
}

function assertLaunchTarget(value: unknown, path: string): LaunchTarget["kind"] {
  const target = requireObject(value, path);
  assertExactFields(target, LAUNCH_TARGET_FIELDS, path, ["kind"]);
  const kind = requireNonEmptyString(target.kind, `${path}.kind`);
  if (kind === "shortcut" || kind === "executable" || kind === "url") {
    requireNonEmptyString(target.path, `${path}.path`);
    requireOptionalNonEmptyString(target, "appUserModelId", path);
    return kind;
  }
  if (kind === "appUserModelId") {
    requireNonEmptyString(target.appUserModelId, `${path}.appUserModelId`);
    requireOptionalNonEmptyString(target, "path", path);
    return kind;
  }
  throw new TypeError(`${path}.kind must be shortcut, executable, url, or appUserModelId`);
}

function assertCatalogApp(item: UnknownRecord, path: string): void {
  assertExactFields(item, CATALOG_APP_FIELDS, path, ["id", "type"]);
  if (!hasOwn(item, "overrides")) return;
  const overrides = requireObject(item.overrides, `${path}.overrides`);
  assertExactFields(overrides, CATALOG_OVERRIDE_FIELDS, `${path}.overrides`, []);
  for (const key of Object.keys(overrides)) {
    requireNonEmptyString(overrides[key], `${path}.overrides.${key}`);
  }
}

function assertManualApp(item: UnknownRecord, path: string): void {
  assertExactFields(item, MANUAL_APP_FIELDS, path, ["id", "type", "name", "launchTarget"]);
  requireNonEmptyString(item.name, `${path}.name`);
  for (const key of ["emoji", "iconPath", "customIconPath", "launchArgs"]) {
    requireOptionalNonEmptyString(item, key, path);
  }
  const launchKind = assertLaunchTarget(item.launchTarget, `${path}.launchTarget`);
  if (launchKind !== "executable" && hasOwn(item, "launchArgs")) {
    throw new TypeError(`${path}.launchArgs is only supported for executable launch targets`);
  }
}

function assertLayoutItem(
  value: unknown,
  path: string,
  seenIds: Set<string>,
  { allowFolder = true }: { allowFolder?: boolean } = {},
): void {
  const item = requireObject(value, path);
  const id = requireNonEmptyString(item.id, `${path}.id`);
  if (seenIds.has(id)) throw new TypeError(`layout item id must be unique: ${id}`);
  seenIds.add(id);

  const type = requireNonEmptyString(item.type, `${path}.type`);
  if (type === "catalogApp") {
    assertCatalogApp(item, path);
    return;
  }
  if (type === "manualApp") {
    assertManualApp(item, path);
    return;
  }
  if (type !== "folder" || !allowFolder) {
    throw new TypeError(`${path}.type must be ${allowFolder ? "catalogApp, manualApp, or folder" : "catalogApp or manualApp"}`);
  }

  if (hasOwn(item, "children")) {
    throw new TypeError(`${path}.children is no longer supported; use childPages`);
  }
  assertExactFields(item, FOLDER_FIELDS, path);
  requireNonEmptyString(item.name, `${path}.name`);
  if (!Array.isArray(item.childPages)) throw new TypeError(`${path}.childPages must be an array`);
  item.childPages.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) throw new TypeError(`${path}.childPages[${pageIndex}] must be an array`);
    page.forEach((child, childIndex) => {
      assertLayoutItem(child, `${path}.childPages[${pageIndex}][${childIndex}]`, seenIds, {
        allowFolder: false,
      });
    });
  });
}

function assertScanRoots(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((root, index) => {
    const rootPath = `${path}[${index}]`;
    const object = requireObject(root, rootPath);
    assertExactFields(
      object,
      SCAN_ROOT_FIELDS,
      rootPath,
      ["id", "type", "label", "path", "enabled", "removable"]
    );
    requireNonEmptyString(object.id, `${rootPath}.id`);
    requireEnum(
      object.type,
      ["startMenuUser", "startMenuSystem", "customDirectory", "windowsAppCatalog"],
      `${rootPath}.type`
    );
    requireNonEmptyString(object.label, `${rootPath}.label`);
    requireNonEmptyString(object.path, `${rootPath}.path`);
    requireBoolean(object.enabled, `${rootPath}.enabled`);
    requireBoolean(object.removable, `${rootPath}.removable`);
    requireOptionalNonEmptyString(object, "lastScannedAt", rootPath);
    for (const key of ["maxDepth", "maxEntries"]) {
      if (hasOwn(object, key)) requireIntegerInRange(object[key], 1, Number.MAX_SAFE_INTEGER, `${rootPath}.${key}`);
    }
  });
}

function assertScanAppBlacklist(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const object = requireObject(entry, entryPath);
    assertExactFields(object, SCAN_APP_BLACKLIST_FIELDS, entryPath, ["catalogId"]);
    requireNonEmptyString(object.catalogId, `${entryPath}.catalogId`);
    requireOptionalNonEmptyString(object, "name", entryPath);
    requireOptionalNonEmptyString(object, "blockedAt", entryPath);
  });
}

function assertAcrylicParameters(value: unknown, path: string): void {
  const parameters = requireObject(value, path);
  assertExactFields(parameters, ACRYLIC_PARAMETER_FIELDS, path);
  requireNumberInRange(parameters.brightness, 0.4, 1.4, `${path}.brightness`);
  requireNumberInRange(parameters.contrast, 0.6, 1.4, `${path}.contrast`);
  requireNumberInRange(parameters.noise, 0, 0.08, `${path}.noise`);
  requireNumberInRange(parameters.saturation, 0.4, 1.8, `${path}.saturation`);
  requireIntegerInRange(parameters.seed, 0, 1000, `${path}.seed`);
  if (!Array.isArray(parameters.tintColor) || parameters.tintColor.length !== 3) {
    throw new TypeError(`${path}.tintColor must contain exactly three numbers`);
  }
  parameters.tintColor.forEach((component, index) => {
    requireNumberInRange(component, 0, 1, `${path}.tintColor[${index}]`);
  });
  requireNumberInRange(parameters.tintStrength, 0, 0.8, `${path}.tintStrength`);
}

function assertLayoutSettings(value: unknown): void {
  const path = "LayoutDocument.settings";
  const settings = requireObject(value, path);
  assertExactFields(settings, SETTINGS_FIELDS, path);

  requireIntegerInRange(settings.gridRows, 2, 8, `${path}.gridRows`);
  requireIntegerInRange(settings.gridCols, 3, 10, `${path}.gridCols`);
  requireIntegerInRange(settings.folderRows, 2, 6, `${path}.folderRows`);
  requireIntegerInRange(settings.folderCols, 2, 8, `${path}.folderCols`);
  requireIntegerInRange(settings.iconSize, 32, 128, `${path}.iconSize`);
  requireEnum(settings.folderIconSizeMode, ["global", "custom"], `${path}.folderIconSizeMode`);
  requireIntegerInRange(settings.folderIconSize, 32, 128, `${path}.folderIconSize`);
  requireBoolean(settings.textless, `${path}.textless`);
  assertAppImportState(settings.importState);
  requireNonEmptyStringArray(settings.hiddenAppIds, `${path}.hiddenAppIds`);
  assertScanRoots(settings.scanRoots, `${path}.scanRoots`);
  requireNonEmptyStringArray(settings.scanKeywordAllowlist, `${path}.scanKeywordAllowlist`);
  requireNonEmptyStringArray(settings.scanKeywordBlacklist, `${path}.scanKeywordBlacklist`);
  assertScanAppBlacklist(settings.scanAppBlacklist, `${path}.scanAppBlacklist`);
  requireBoolean(settings.showMissingLaunchTargetBadge, `${path}.showMissingLaunchTargetBadge`);

  requireColor(settings.backgroundBaseColor, `${path}.backgroundBaseColor`);
  requireIntegerInRange(settings.backgroundBaseOpacity, 0, 100, `${path}.backgroundBaseOpacity`);
  requireEnum(
    settings.backgroundSource,
    ["systemMaterial", "customImage", "windowsWallpaper", "windowsLiveDesktop"],
    `${path}.backgroundSource`
  );
  requireEnum(settings.backgroundEffect, ["none", "dimmed", "blur", "acrylic"], `${path}.backgroundEffect`);
  requireIntegerInRange(settings.backgroundImageOpacity, 0, 100, `${path}.backgroundImageOpacity`);
  requireIntegerInRange(settings.backgroundLiveDesktopOpacity, 0, 100, `${path}.backgroundLiveDesktopOpacity`);
  requireEnum(settings.backgroundImageLayout, ["fill", "fit", "stretch", "tile", "center"], `${path}.backgroundImageLayout`);
  requireIntegerInRange(settings.backgroundBlurStrength, 1, 100, `${path}.backgroundBlurStrength`);
  requireIntegerInRange(settings.backgroundAcrylicBlurStrength, 1, 100, `${path}.backgroundAcrylicBlurStrength`);
  requireIntegerInRange(settings.backgroundDarkenStrength, 0, 100, `${path}.backgroundDarkenStrength`);
  requireColor(settings.backgroundDarkenColor, `${path}.backgroundDarkenColor`);
  requireEnum(settings.backgroundAcrylicAppearance, ["system", "dark", "light"], `${path}.backgroundAcrylicAppearance`);
  assertAcrylicParameters(settings.backgroundAcrylicDarkParams, `${path}.backgroundAcrylicDarkParams`);
  assertAcrylicParameters(settings.backgroundAcrylicLightParams, `${path}.backgroundAcrylicLightParams`);
  if (settings.backgroundImagePath !== null) {
    requireNonEmptyString(settings.backgroundImagePath, `${path}.backgroundImagePath`);
  }

  requireEnum(settings.windowEffectMaterial, ["none", "acrylic", "mica", "micaAlt"], `${path}.windowEffectMaterial`);
  requireEnum(settings.windowEffectAppearance, ["system", "dark", "light"], `${path}.windowEffectAppearance`);
  requireEnum(settings.windowMode, ["fullscreen", "windowed"], `${path}.windowMode`);
  requireBoolean(settings.fullscreenOverscanEnabled, `${path}.fullscreenOverscanEnabled`);
  requireBoolean(settings.showCustomTitlebar, `${path}.showCustomTitlebar`);
  if (settings.mainWindowShortcut !== null) {
    requireNonEmptyString(settings.mainWindowShortcut, `${path}.mainWindowShortcut`);
  }
  requireNonEmptyString(settings.localePreference, `${path}.localePreference`, { maxUtf8Bytes: 64 });
  requireEnum(settings.settingsThemePreference, ["system", "dark", "light"], `${path}.settingsThemePreference`);
  requireEnum(settings.launchpadIconVariant, ["light", "dark", "pastelLight", "pastelDark"], `${path}.launchpadIconVariant`);
}

/**
 * Assert the canonical persisted layout shape and return the same reference.
 * No migration, repair, or fallback is performed at this boundary.
 *
 */
export function assertLayoutDocument(document: unknown): LayoutDocument {
  const layout = requireObject(document, "LayoutDocument");
  assertExactFields(layout, ROOT_FIELDS, "LayoutDocument");
  if (layout.version !== LAYOUT_DOCUMENT_VERSION) {
    throw new TypeError(`LayoutDocument.version must be ${LAYOUT_DOCUMENT_VERSION}`);
  }
  if (!Array.isArray(layout.pages)) throw new TypeError("LayoutDocument.pages must be an array");
  const seenIds = new Set<string>();
  layout.pages.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) throw new TypeError(`LayoutDocument.pages[${pageIndex}] must be an array`);
    page.forEach((item, itemIndex) => {
      assertLayoutItem(item, `LayoutDocument.pages[${pageIndex}][${itemIndex}]`, seenIds);
    });
  });
  assertLayoutSettings(layout.settings);
  return layout as LayoutDocument;
}
