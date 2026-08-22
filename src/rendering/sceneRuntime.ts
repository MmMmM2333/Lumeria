import type { IconTextureItem } from "./pixi/assets/iconTextureRepository.js";
import type { IconBoundsRegistry } from "./pixi/geometry/iconBoundsRegistry.js";
import type { CapturedFolderOriginBounds } from "./pixi/scene/folderOverlayTargetResolver.js";
import type { SceneDataRecord, SceneItem, ScenePageTrackScrub } from "./sceneFrame.js";

type UnknownRecord = Record<string, unknown>;

export interface SceneRuntimeRef<Value> {
  value: Value;
}

export type DesktopSceneFolderItem = SceneItem & Readonly<{
  childPages?: readonly (readonly (DesktopSceneFolderItem | null)[])[];
  name?: string;
}>;

export type DesktopSceneDomRef = Element | SceneRuntimeRef<unknown> | null;

export type DesktopSceneDomRefs = Readonly<{
  desktopMainRef?: SceneRuntimeRef<unknown>;
  rootRef?: DesktopSceneDomRef;
  shellRef?: DesktopSceneDomRef;
}>;

export type DesktopFolderPageRenderMode = "empty" | "interactive" | "static-real";

export type DesktopFolderOverlayRuntime = Readonly<{
  acceptFolderOpenIconGhostSession?: (folderId: string | null, requestId: unknown) => boolean;
  commitFolderPageIndex?: (pageIndex: number) => unknown;
  commitOpenFolder?: (folderId: string | null, options?: unknown) => unknown;
  completeFolderCloseIconGhost?: (key: string) => boolean | void;
  completeFolderOpenFrameGhost?: (folderId: string | null, requestId: unknown) => unknown;
  completeFolderOpenIconGhost?: (key: string) => unknown;
  completeFolderRenameRequest?: (token: number) => unknown;
  folderCloseIconGhosts?: SceneRuntimeRef<readonly SceneDataRecord[]>;
  folderGridStyle?: SceneRuntimeRef<SceneDataRecord | null>;
  folderOpeningCancelRequest?: SceneRuntimeRef<SceneDataRecord | null>;
  folderOpeningOriginBounds?: SceneRuntimeRef<CapturedFolderOriginBounds | null>;
  folderOpenIconGhosts?: SceneRuntimeRef<readonly SceneDataRecord[]>;
  folderOpenIconGhostSession?: SceneRuntimeRef<SceneDataRecord | null>;
  folderOpenProgress?: SceneRuntimeRef<number>;
  folderOpenProgressTarget?: SceneRuntimeRef<number>;
  folderPageIndex?: SceneRuntimeRef<number>;
  folderPages?: SceneRuntimeRef<readonly (readonly (DesktopSceneFolderItem | null)[])[]>;
  folderPageSize?: SceneRuntimeRef<number>;
  folderPageTrackScrub?: SceneRuntimeRef<ScenePageTrackScrub | null>;
  folderPageTurnRequest?: SceneRuntimeRef<(SceneDataRecord & Readonly<{ token?: unknown }>) | null>;
  folderPanelRef?: SceneRuntimeRef<unknown>;
  folderPanelStyle?: SceneRuntimeRef<Readonly<Record<string, string>> | null>;
  folderRenameRequest?: SceneRuntimeRef<Readonly<{ folderId: string; token: number }> | null>;
  folderViewportRef?: SceneRuntimeRef<unknown>;
  folderZoomFadeCloseReason?: SceneRuntimeRef<string | null>;
  getFolderPageRenderMode?: (pageIndex: number) => DesktopFolderPageRenderMode;
  getVisibleFolderPage?: (
    page: readonly (DesktopSceneFolderItem | null)[],
  ) => readonly DesktopSceneFolderItem[];
  handleFolderOverlayPointerDown?: () => unknown;
  handleFolderPanelPointerDown?: (event: unknown) => unknown;
  isEditMode?: SceneRuntimeRef<boolean>;
  isFolderAppLaunchClosing?: SceneRuntimeRef<boolean>;
  isFolderCloseIconAnimationActive?: SceneRuntimeRef<boolean>;
  isFolderClosing?: SceneRuntimeRef<boolean>;
  isFolderOpenFrameGhostPending?: SceneRuntimeRef<boolean>;
  isFolderOpenIconAnimationActive?: SceneRuntimeRef<boolean>;
  isFolderZoomFadeClosing?: SceneRuntimeRef<boolean>;
  isFolderZoomFadeClosingFromFolderClose?: SceneRuntimeRef<boolean>;
  isIconOpening?: (
    area: "folder",
    itemId: string,
    pageIndex: number,
    folderId: string,
  ) => boolean;
  isTextlessMode?: SceneRuntimeRef<boolean>;
  launchTargetStatusById?: SceneRuntimeRef<Readonly<Record<string, string>>>;
  openFolderId?: SceneRuntimeRef<string | null>;
  renderedFolder: SceneRuntimeRef<DesktopSceneFolderItem | null>;
  renameFolder: (folderId: string, name: string) => unknown;
  setFolderPageRef?: (element: unknown, pageIndex: number) => unknown;
  showMissingLaunchTargetBadge?: SceneRuntimeRef<boolean>;
  visualFolderPageIndex?: SceneRuntimeRef<number>;
}>;

export type LiveDesktopDiagnosticsRuntimePort = Readonly<{
  applyRuntime: (request: Readonly<{ restart: boolean; settings?: unknown }>) => unknown;
  getRuntimeStatus: () => unknown;
  refreshRuntime: () => unknown;
}>;

export type DesktopSceneRuntime = Readonly<{
  completeProvisionalFolderRollback: (token: number) => unknown;
  domRefs: DesktopSceneDomRefs;
  folderOverlayState: DesktopFolderOverlayRuntime;
  getDesktopPageRenderMode: (pageIndex: number) => DesktopFolderPageRenderMode;
  getIconTextureItems: () => readonly IconTextureItem[];
  getVisibleDesktopPage: (page: readonly (SceneItem | null)[]) => readonly SceneItem[];
  iconBoundsRegistry: IconBoundsRegistry;
  isFolderOpeningPreviewFrameGhosted: (folderId: string) => boolean;
  isIconOpening: (
    area: "desktop" | "folder" | "search",
    itemId: string,
    pageIndex: number,
    folderId?: string,
  ) => boolean;
  liveDesktopDiagnosticsPort: LiveDesktopDiagnosticsRuntimePort | null;
  setPageRef: (element: unknown, pageIndex: number) => unknown;
}>;

function requireObject(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

function requireFunction<FunctionType>(value: unknown, path: string): FunctionType {
  if (typeof value !== "function") throw new TypeError(`${path} must be a function`);
  return value as FunctionType;
}

type RuntimeValueValidator<Value> = (value: unknown, path: string) => Value;

function acceptUnknown(value: unknown): unknown {
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  return value;
}

function requireNullable<Value>(validate: RuntimeValueValidator<Value>): RuntimeValueValidator<Value | null> {
  return (value, path) => value === null ? null : validate(value, path);
}

function requireArray<Value>(
  value: unknown,
  path: string,
  validateEntry: RuntimeValueValidator<Value>,
): readonly Value[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((entry, index) => validateEntry(entry, `${path}[${index}]`));
  return value;
}

function requireSceneItem(value: unknown, path: string): SceneItem {
  const item = requireObject(value, path);
  requireString(item.id, `${path}.id`);
  if (item.type !== undefined) requireString(item.type, `${path}.type`);
  return item as SceneItem;
}

function requireNullableSceneItem(value: unknown, path: string): SceneItem | null {
  return value === null ? null : requireSceneItem(value, path);
}

function requireFolderItem(value: unknown, path: string): DesktopSceneFolderItem {
  const item = requireSceneItem(value, path) as DesktopSceneFolderItem;
  const record = item as UnknownRecord;
  if (record.name !== undefined) requireString(record.name, `${path}.name`);
  if (record.childPages !== undefined) {
    requireArray(record.childPages, `${path}.childPages`, (page, pagePath) =>
      requireArray(page, pagePath, (entry, entryPath) =>
        entry === null ? null : requireFolderItem(entry, entryPath)));
  }
  return item;
}

function requireNullableFolderItem(value: unknown, path: string): DesktopSceneFolderItem | null {
  return value === null ? null : requireFolderItem(value, path);
}

function requireStringRecord(value: unknown, path: string): Readonly<Record<string, string>> {
  const record = requireObject(value, path);
  for (const [key, entry] of Object.entries(record)) requireString(entry, `${path}.${key}`);
  return record as Readonly<Record<string, string>>;
}

function requirePageTrackScrub(value: unknown, path: string): ScenePageTrackScrub {
  const scrub = requireObject(value, path);
  requireBoolean(scrub.edge, `${path}.edge`);
  requireFiniteNumber(scrub.fromIndex, `${path}.fromIndex`);
  requireFiniteNumber(scrub.progress, `${path}.progress`);
  requireString(scrub.scope, `${path}.scope`);
  requireFiniteNumber(scrub.toIndex, `${path}.toIndex`);
  if (scrub.settle !== undefined) requireBoolean(scrub.settle, `${path}.settle`);
  if (scrub.targetProgress !== undefined) requireFiniteNumber(scrub.targetProgress, `${path}.targetProgress`);
  if (scrub.velocity !== undefined) requireFiniteNumber(scrub.velocity, `${path}.velocity`);
  return scrub as ScenePageTrackScrub;
}

function requireFolderPageRenderMode(value: unknown, path: string): DesktopFolderPageRenderMode {
  if (value !== "empty" && value !== "interactive" && value !== "static-real") {
    throw new TypeError(`${path} must be empty, interactive, or static-real`);
  }
  return value;
}

function requireIconTextureItems(value: unknown, path: string): readonly IconTextureItem[] {
  return requireArray(value, path, (entry, entryPath) => {
    const item = requireObject(entry, entryPath);
    for (const key of ["customIconDataUrl", "customIconUrl", "iconDataUrl", "iconUrl", "id"] as const) {
      if (item[key] !== undefined && item[key] !== null) requireString(item[key], `${entryPath}.${key}`);
    }
    return item as IconTextureItem;
  });
}

function requireRef<Value>(
  value: unknown,
  path: string,
  validateValue: RuntimeValueValidator<Value>,
): SceneRuntimeRef<Value> {
  const ref = requireObject(value, path);
  if (!("value" in ref)) throw new TypeError(`${path} must expose value`);
  validateValue(ref.value, `${path}.value`);
  return ref as unknown as SceneRuntimeRef<Value>;
}

function requireOptionalProperties(
  source: UnknownRecord,
  keys: readonly string[],
  path: string,
  validate: (value: unknown, propertyPath: string) => unknown,
): void {
  for (const key of keys) {
    if (!(key in source)) continue;
    validate(source[key], `${path}.${key}`);
  }
}

function requireDomRef(value: unknown, path: string): DesktopSceneDomRef {
  if (value === null) return null;
  if (typeof Element !== "undefined" && value instanceof Element) return value;
  return requireRef(value, path, acceptUnknown);
}

function requireDesktopSceneDomRefs(value: unknown): DesktopSceneDomRefs {
  const path = "DesktopSceneRuntime.domRefs";
  const refs = requireObject(value, path);
  requireOptionalProperties(refs, ["desktopMainRef"], path, (entry, propertyPath) =>
    requireRef(entry, propertyPath, acceptUnknown));
  requireOptionalProperties(refs, ["rootRef", "shellRef"], path, requireDomRef);
  return refs as DesktopSceneDomRefs;
}

const OPTIONAL_FOLDER_OVERLAY_FUNCTION_KEYS = [
  "commitFolderPageIndex",
  "commitOpenFolder",
  "completeFolderOpenFrameGhost",
  "completeFolderOpenIconGhost",
  "completeFolderRenameRequest",
  "handleFolderOverlayPointerDown",
  "handleFolderPanelPointerDown",
  "setFolderPageRef",
] as const satisfies readonly (keyof DesktopFolderOverlayRuntime)[];

const OPTIONAL_FOLDER_OVERLAY_RECORD_ARRAY_REF_KEYS = [
  "folderCloseIconGhosts",
  "folderOpenIconGhosts",
] as const satisfies readonly (keyof DesktopFolderOverlayRuntime)[];

const OPTIONAL_FOLDER_OVERLAY_NULLABLE_RECORD_REF_KEYS = [
  "folderGridStyle",
  "folderOpeningCancelRequest",
  "folderOpenIconGhostSession",
] as const satisfies readonly (keyof DesktopFolderOverlayRuntime)[];

const OPTIONAL_FOLDER_OVERLAY_NUMBER_REF_KEYS = [
  "folderOpenProgress",
  "folderOpenProgressTarget",
  "folderPageIndex",
  "folderPageSize",
  "visualFolderPageIndex",
] as const satisfies readonly (keyof DesktopFolderOverlayRuntime)[];

const OPTIONAL_FOLDER_OVERLAY_UNKNOWN_REF_KEYS = [
  "folderPanelRef",
  "folderViewportRef",
] as const satisfies readonly (keyof DesktopFolderOverlayRuntime)[];

const OPTIONAL_FOLDER_OVERLAY_BOOLEAN_REF_KEYS = [
  "isEditMode",
  "isFolderAppLaunchClosing",
  "isFolderCloseIconAnimationActive",
  "isFolderClosing",
  "isFolderOpenFrameGhostPending",
  "isFolderOpenIconAnimationActive",
  "isFolderZoomFadeClosing",
  "isFolderZoomFadeClosingFromFolderClose",
  "isTextlessMode",
  "showMissingLaunchTargetBadge",
] as const satisfies readonly (keyof DesktopFolderOverlayRuntime)[];

function requireOptionalRefs<Value>(
  state: UnknownRecord,
  keys: readonly string[],
  path: string,
  validateValue: RuntimeValueValidator<Value>,
): void {
  requireOptionalProperties(state, keys, path, (entry, propertyPath) =>
    requireRef(entry, propertyPath, validateValue));
}

function replaceOptionalFunction<Arguments extends unknown[], Result>(
  state: UnknownRecord,
  key: string,
  path: string,
  validateResult: RuntimeValueValidator<Result>,
): void {
  if (!(key in state)) return;
  const fn = requireFunction<(...args: Arguments) => unknown>(state[key], `${path}.${key}`);
  state[key] = (...args: Arguments) => validateResult(fn(...args), `${path}.${key} return value`);
}

function requireFolderOverlayRuntime(value: unknown): DesktopFolderOverlayRuntime {
  const path = "DesktopSceneRuntime.folderOverlayState";
  const source = requireObject(value, path);
  const state: UnknownRecord = { ...source };
  requireRef(state.renderedFolder, `${path}.renderedFolder`, requireNullableFolderItem);
  requireFunction(state.renameFolder, `${path}.renameFolder`);
  requireOptionalProperties(state, OPTIONAL_FOLDER_OVERLAY_FUNCTION_KEYS, path, requireFunction);
  replaceOptionalFunction(state, "acceptFolderOpenIconGhostSession", path, requireBoolean);
  replaceOptionalFunction(state, "completeFolderCloseIconGhost", path, (result, resultPath) => {
    if (result === undefined) return undefined;
    return requireBoolean(result, resultPath);
  });
  replaceOptionalFunction(state, "getFolderPageRenderMode", path, requireFolderPageRenderMode);
  replaceOptionalFunction(state, "getVisibleFolderPage", path, (result, resultPath) =>
    requireArray(result, resultPath, requireFolderItem));
  replaceOptionalFunction(state, "isIconOpening", path, requireBoolean);
  requireOptionalRefs(state, OPTIONAL_FOLDER_OVERLAY_RECORD_ARRAY_REF_KEYS, path, (entry, entryPath) =>
    requireArray(entry, entryPath, requireObject));
  requireOptionalRefs(state, OPTIONAL_FOLDER_OVERLAY_NULLABLE_RECORD_REF_KEYS, path, requireNullable(requireObject));
  requireOptionalRefs(state, OPTIONAL_FOLDER_OVERLAY_NUMBER_REF_KEYS, path, requireFiniteNumber);
  requireOptionalRefs(state, OPTIONAL_FOLDER_OVERLAY_UNKNOWN_REF_KEYS, path, acceptUnknown);
  requireOptionalRefs(state, OPTIONAL_FOLDER_OVERLAY_BOOLEAN_REF_KEYS, path, requireBoolean);
  requireOptionalRefs(state, ["folderOpeningOriginBounds"], path, requireNullable(requireObject));
  requireOptionalRefs(state, ["folderPages"], path, (entry, entryPath) =>
    requireArray(entry, entryPath, (page, pagePath) =>
      requireArray(page, pagePath, (item, itemPath) => item === null ? null : requireFolderItem(item, itemPath))));
  requireOptionalRefs(state, ["folderPageTrackScrub"], path, requireNullable(requirePageTrackScrub));
  requireOptionalRefs(state, ["folderPageTurnRequest"], path, requireNullable(requireObject));
  requireOptionalRefs(state, ["folderPanelStyle"], path, requireNullable(requireStringRecord));
  requireOptionalRefs(state, ["folderRenameRequest"], path, requireNullable((entry, entryPath) => {
    const request = requireObject(entry, entryPath);
    requireString(request.folderId, `${entryPath}.folderId`);
    requireFiniteNumber(request.token, `${entryPath}.token`);
    return request;
  }));
  requireOptionalRefs(state, ["folderZoomFadeCloseReason", "openFolderId"], path, requireNullable(requireString));
  requireOptionalRefs(state, ["launchTargetStatusById"], path, requireStringRecord);
  return Object.freeze(state) as DesktopFolderOverlayRuntime;
}

function requireIconBoundsRegistry(value: unknown): IconBoundsRegistry {
  const registry = requireObject(value, "DesktopSceneRuntime.iconBoundsRegistry");
  for (const method of [
    "clearBounds",
    "getAtPoint",
    "getBounds",
    "getRecord",
    "getVersion",
    "makeKey",
    "registerBounds",
    "transaction",
  ] as const) {
    requireFunction(registry[method], `DesktopSceneRuntime.iconBoundsRegistry.${method}`);
  }
  return registry as unknown as IconBoundsRegistry;
}

function requireLiveDesktopDiagnosticsPort(value: unknown): LiveDesktopDiagnosticsRuntimePort | null {
  if (value == null) return null;
  const port = requireObject(value, "DesktopSceneRuntime.liveDesktopDiagnosticsPort");
  for (const method of ["applyRuntime", "getRuntimeStatus", "refreshRuntime"] as const) {
    requireFunction(port[method], `DesktopSceneRuntime.liveDesktopDiagnosticsPort.${method}`);
  }
  return port as LiveDesktopDiagnosticsRuntimePort;
}

export function makeDesktopSceneRuntimeAdapter(input: unknown): DesktopSceneRuntime {
  const source = requireObject(input, "DesktopSceneRuntime");
  const getDesktopPageRenderMode = requireFunction<(pageIndex: number) => unknown>(
    source.getDesktopPageRenderMode,
    "DesktopSceneRuntime.getDesktopPageRenderMode",
  );
  const getIconTextureItems = requireFunction<() => unknown>(
    source.getIconTextureItems,
    "DesktopSceneRuntime.getIconTextureItems",
  );
  const getVisibleDesktopPage = requireFunction<(page: readonly (SceneItem | null)[]) => unknown>(
    source.getVisibleDesktopPage,
    "DesktopSceneRuntime.getVisibleDesktopPage",
  );
  const isFolderOpeningPreviewFrameGhosted = requireFunction<(folderId: string) => unknown>(
    source.isFolderOpeningPreviewFrameGhosted,
    "DesktopSceneRuntime.isFolderOpeningPreviewFrameGhosted",
  );
  const isIconOpening = requireFunction<DesktopSceneRuntime["isIconOpening"]>(
    source.isIconOpening,
    "DesktopSceneRuntime.isIconOpening",
  );
  const runtime: DesktopSceneRuntime = {
    completeProvisionalFolderRollback: requireFunction(
      source.completeProvisionalFolderRollback,
      "DesktopSceneRuntime.completeProvisionalFolderRollback",
    ),
    domRefs: requireDesktopSceneDomRefs(source.domRefs),
    folderOverlayState: requireFolderOverlayRuntime(source.folderOverlayState),
    getDesktopPageRenderMode: (pageIndex) => requireFolderPageRenderMode(
      getDesktopPageRenderMode(pageIndex),
      "DesktopSceneRuntime.getDesktopPageRenderMode return value",
    ),
    getIconTextureItems: () => requireIconTextureItems(
      getIconTextureItems(),
      "DesktopSceneRuntime.getIconTextureItems return value",
    ),
    getVisibleDesktopPage: (page) => requireArray(
      getVisibleDesktopPage(page),
      "DesktopSceneRuntime.getVisibleDesktopPage return value",
      requireSceneItem,
    ),
    iconBoundsRegistry: requireIconBoundsRegistry(source.iconBoundsRegistry),
    isFolderOpeningPreviewFrameGhosted: (folderId) => requireBoolean(
      isFolderOpeningPreviewFrameGhosted(folderId),
      "DesktopSceneRuntime.isFolderOpeningPreviewFrameGhosted return value",
    ),
    isIconOpening: (...args) => requireBoolean(
      isIconOpening(...args),
      "DesktopSceneRuntime.isIconOpening return value",
    ),
    setPageRef: requireFunction(source.setPageRef, "DesktopSceneRuntime.setPageRef"),
    liveDesktopDiagnosticsPort: requireLiveDesktopDiagnosticsPort(source.liveDesktopDiagnosticsPort),
  };
  return Object.freeze(runtime);
}

export function assertDesktopSceneRuntime(runtime: unknown): void {
  makeDesktopSceneRuntimeAdapter(runtime);
}
