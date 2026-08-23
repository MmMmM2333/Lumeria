import {
  assertContractSnapshot,
  snapshotContractValue,
  type ContractRecord,
  type ContractValue,
} from "./contractSnapshot.js";

export type SceneDataValue = ContractValue;
export type SceneDataRecord = ContractRecord;

export type SceneItem = SceneDataRecord & Readonly<{
  id: string;
  type?: string;
}>;

export type SceneVisualTransform = Readonly<{
  scale: number;
  y: number;
}>;

export type SceneFocusedIcon = Readonly<{
  area?: string;
  folderId?: string | null;
  id: string;
  pageIndex?: number;
}>;

export type ScenePageGridMeasureStyle = Readonly<{
  height?: string;
  minHeight?: string;
}>;

export type ScenePageTrackScrub = Readonly<{
  edge: boolean;
  fromIndex: number;
  progress: number;
  scope: string;
  settle?: boolean;
  settleToken?: ContractValue;
  targetProgress?: number;
  toIndex: number;
  velocity?: number;
}>;

export type SceneGroupDragState = SceneDataRecord & Readonly<{
  key?: string;
  phase?: string;
  presentationPlan?: SceneDataRecord | null;
  projectedPages?: readonly (readonly (SceneItem | null)[])[];
  runtimePlan?: (SceneDataRecord & Readonly<{ key?: string }>) | null;
}>;

export type SceneSingleStageDiagnosticsOptions = Readonly<{
  diagnostics?: boolean;
  log?: boolean;
  probe?: boolean;
}>;

type DesktopSceneFrameValues = Readonly<{
  activePageIndex: number;
  activePages: readonly (readonly (SceneItem | null)[])[];
  appLaunchCloseSessionId: number | null;
  desktopGridDebugOptions: SceneDataRecord | null;
  desktopProjectionEpoch: number;
  desktopTrackMotionKey: string;
  desktopVisualAlpha: number;
  desktopVisualTransform: SceneVisualTransform;
  dragFolderHoverState: SceneDataRecord | null;
  dragFolderTargetId: string | null;
  dragHitDebugOptions: SceneDataRecord | null;
  dragHitDebugState: SceneDataRecord | null;
  dragMeta: SceneDataRecord | null;
  focusedIcon: SceneFocusedIcon | null;
  folderClosingHandoffId: string | null;
  folderPageSize: number;
  folderSourceGhostedId: string | null;
  folderSourceGhostedIds: ReadonlySet<string>;
  gridCols: number;
  gridRows: number;
  groupDragState: SceneGroupDragState | null;
  iconGesturePresentation: SceneDataRecord | null;
  iconSize: number;
  isBatchSelectionActive: boolean;
  isDesktopClosing: boolean;
  isEditMode: boolean;
  isHomeRevealSettling: boolean;
  isSearchMode: boolean;
  isTextlessMode: boolean;
  launchTargetStatusById: Readonly<Record<string, string>>;
  launchpadVisualAlpha: number;
  launchpadVisualTransform: SceneVisualTransform;
  pageGridMeasureStyle: ScenePageGridMeasureStyle;
  pageTrackScrub: ScenePageTrackScrub | null;
  provisionalFolderRollback: SceneDataRecord | null;
  selectedAppIds: ReadonlySet<string>;
  showMissingLaunchTargetBadge: boolean;
  singleStageDiagnosticsOptions: SceneSingleStageDiagnosticsOptions | null;
}>;

const FRAME_FIELDS = Object.freeze({
  viewport: Object.freeze([
    "activePageIndex",
    "activePages",
    "desktopProjectionEpoch",
    "desktopTrackMotionKey",
    "folderPageSize",
    "gridCols",
    "gridRows",
    "iconSize",
    "pageGridMeasureStyle",
    "pageTrackScrub",
  ] as const),
  visual: Object.freeze([
    "appLaunchCloseSessionId",
    "desktopVisualAlpha",
    "desktopVisualTransform",
    "launchpadVisualAlpha",
    "launchpadVisualTransform",
  ] as const),
  interaction: Object.freeze([
    "dragFolderHoverState",
    "dragFolderTargetId",
    "dragMeta",
    "focusedIcon",
    "groupDragState",
    "iconGesturePresentation",
    "isBatchSelectionActive",
    "isDesktopClosing",
    "isEditMode",
    "isHomeRevealSettling",
    "isSearchMode",
    "isTextlessMode",
    "provisionalFolderRollback",
    "selectedAppIds",
  ] as const),
  folder: Object.freeze([
    "folderClosingHandoffId",
    "folderSourceGhostedId",
    "folderSourceGhostedIds",
  ] as const),
  diagnostics: Object.freeze([
    "desktopGridDebugOptions",
    "dragHitDebugOptions",
    "dragHitDebugState",
    "launchTargetStatusById",
    "showMissingLaunchTargetBadge",
    "singleStageDiagnosticsOptions",
  ] as const),
});

type FrameFields = typeof FRAME_FIELDS;
type FrameGroupName = keyof FrameFields;
type FrameFieldName = FrameFields[FrameGroupName][number];
type FrameGroup<Fields extends readonly FrameFieldName[]> = Readonly<{
  [Field in Fields[number]]: DesktopSceneFrameValues[Field] | undefined;
}>;

export type DesktopSceneFrameViewport = FrameGroup<FrameFields["viewport"]>;
export type DesktopSceneFrameVisual = FrameGroup<FrameFields["visual"]>;
export type DesktopSceneFrameInteraction = FrameGroup<FrameFields["interaction"]>;
export type DesktopSceneFrameFolder = FrameGroup<FrameFields["folder"]>;
export type DesktopSceneFrameDiagnostics = FrameGroup<FrameFields["diagnostics"]>;

export type DesktopSceneFrame = Readonly<{
  viewport: DesktopSceneFrameViewport;
  visual: DesktopSceneFrameVisual;
  interaction: DesktopSceneFrameInteraction;
  folder: DesktopSceneFrameFolder;
  diagnostics: DesktopSceneFrameDiagnostics;
}>;

type CompleteFrameGroup<Fields extends readonly FrameFieldName[]> = Readonly<{
  [Field in Fields[number]]: DesktopSceneFrameValues[Field];
}>;

export type CompleteDesktopSceneFrame = Readonly<{
  viewport: CompleteFrameGroup<FrameFields["viewport"]>;
  visual: CompleteFrameGroup<FrameFields["visual"]>;
  interaction: CompleteFrameGroup<FrameFields["interaction"]>;
  folder: CompleteFrameGroup<FrameFields["folder"]>;
  diagnostics: CompleteFrameGroup<FrameFields["diagnostics"]>;
}>;

/**
 * Untrusted composition-root values accepted by the scene snapshot decoder.
 *
 * Domain records deliberately do not need to expose ContractRecord's index
 * signature. Each published value is detached first and then validated against
 * its field contract before makeDesktopSceneFrame returns it.
 */
export type DesktopSceneFrameInput = Partial<{
  [Field in keyof DesktopSceneFrameValues]: unknown;
}>;

const FRAME_GROUPS = Object.freeze(Object.keys(FRAME_FIELDS) as FrameGroupName[]);

type FieldValidator = (value: unknown, path: string) => void;

function optional(value: unknown, path: string, validate: FieldValidator): void {
  if (value !== undefined) validate(value, path);
}

function requireBoolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
}

function requireNumber(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
}

function requireNullablePositiveInteger(value: unknown, path: string): void {
  if (value === null) return;
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new TypeError(`${path} must be a positive integer or null`);
  }
}

function requireString(value: unknown, path: string): void {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
}

function requireNullableString(value: unknown, path: string): void {
  if (value !== null) requireString(value, path);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function requireNullableRecord(value: unknown, path: string): void {
  if (value !== null && !isPlainRecord(value)) throw new TypeError(`${path} must be a record or null`);
}

function requireStringSet(value: unknown, path: string): void {
  if (!(value instanceof Set)) throw new TypeError(`${path} must be a Set`);
  for (const entry of value) requireString(entry, `${path} entry`);
}

function requireActivePages(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array of pages`);
  value.forEach((page, pageIndex) => {
    if (!Array.isArray(page)) throw new TypeError(`${path}[${pageIndex}] must be an array`);
    page.forEach((item, itemIndex) => {
      if (item === null) return;
      if (!isPlainRecord(item) || typeof item.id !== "string" || !item.id) {
        throw new TypeError(`${path}[${pageIndex}][${itemIndex}] must be a scene item or null`);
      }
    });
  });
}

function requireVisualTransform(value: unknown, path: string): void {
  if (!isPlainRecord(value) || Object.keys(value).length !== 2 || !("scale" in value) || !("y" in value)) {
    throw new TypeError(`${path} must contain exactly scale and y`);
  }
  requireNumber(value.scale, `${path}.scale`);
  requireNumber(value.y, `${path}.y`);
}

function requireFocusedIcon(value: unknown, path: string): void {
  if (value === null) return;
  if (!isPlainRecord(value) || typeof value.id !== "string" || !value.id) {
    throw new TypeError(`${path} must be a focused icon or null`);
  }
  if (value.area !== undefined) requireString(value.area, `${path}.area`);
  if (value.folderId !== undefined) requireNullableString(value.folderId, `${path}.folderId`);
  if (value.pageIndex !== undefined) requireNumber(value.pageIndex, `${path}.pageIndex`);
}

function requirePageGridMeasureStyle(value: unknown, path: string): void {
  if (!isPlainRecord(value)) throw new TypeError(`${path} must be a record`);
  const allowed = new Set(["height", "minHeight"]);
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key)) throw new TypeError(`${path}.${key} is not supported`);
    requireString(entry, `${path}.${key}`);
  }
}

function requirePageTrackScrub(value: unknown, path: string): void {
  if (value === null) return;
  if (!isPlainRecord(value)) throw new TypeError(`${path} must be a scrub record or null`);
  for (const key of ["fromIndex", "progress", "toIndex"] as const) requireNumber(value[key], `${path}.${key}`);
  requireBoolean(value.edge, `${path}.edge`);
  requireString(value.scope, `${path}.scope`);
  if (value.settle !== undefined) requireBoolean(value.settle, `${path}.settle`);
  for (const key of ["targetProgress", "velocity"] as const) {
    if (value[key] !== undefined) requireNumber(value[key], `${path}.${key}`);
  }
}

function requireLaunchTargetStatuses(value: unknown, path: string): void {
  if (!isPlainRecord(value)) throw new TypeError(`${path} must be a record`);
  for (const [id, status] of Object.entries(value)) requireString(status, `${path}.${id}`);
}

const nullableRecord: FieldValidator = (value, path) => requireNullableRecord(value, path);
const FIELD_VALIDATORS = {
  activePageIndex: requireNumber,
  activePages: requireActivePages,
  appLaunchCloseSessionId: requireNullablePositiveInteger,
  desktopGridDebugOptions: nullableRecord,
  desktopProjectionEpoch: requireNumber,
  desktopTrackMotionKey: requireString,
  desktopVisualAlpha: requireNumber,
  desktopVisualTransform: requireVisualTransform,
  dragFolderHoverState: nullableRecord,
  dragFolderTargetId: requireNullableString,
  dragHitDebugOptions: nullableRecord,
  dragHitDebugState: nullableRecord,
  dragMeta: nullableRecord,
  focusedIcon: requireFocusedIcon,
  folderClosingHandoffId: requireNullableString,
  folderPageSize: requireNumber,
  folderSourceGhostedId: requireNullableString,
  folderSourceGhostedIds: requireStringSet,
  gridCols: requireNumber,
  gridRows: requireNumber,
  groupDragState: nullableRecord,
  iconGesturePresentation: nullableRecord,
  iconSize: requireNumber,
  isBatchSelectionActive: requireBoolean,
  isDesktopClosing: requireBoolean,
  isEditMode: requireBoolean,
  isHomeRevealSettling: requireBoolean,
  isSearchMode: requireBoolean,
  isTextlessMode: requireBoolean,
  launchTargetStatusById: requireLaunchTargetStatuses,
  launchpadVisualAlpha: requireNumber,
  launchpadVisualTransform: requireVisualTransform,
  pageGridMeasureStyle: requirePageGridMeasureStyle,
  pageTrackScrub: requirePageTrackScrub,
  provisionalFolderRollback: nullableRecord,
  selectedAppIds: requireStringSet,
  showMissingLaunchTargetBadge: requireBoolean,
  singleStageDiagnosticsOptions: nullableRecord,
} satisfies Record<FrameFieldName, FieldValidator>;

function makeFrameGroup<Fields extends readonly FrameFieldName[]>(
  input: DesktopSceneFrameInput,
  fields: Fields,
): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(
    fields.map((field) => [
      field,
      snapshotContractValue(input[field], `DesktopSceneFrame.${field}`),
    ])
  ));
}

export function makeDesktopSceneFrame(input: DesktopSceneFrameInput = {}): DesktopSceneFrame {
  const frame = Object.freeze({
    viewport: makeFrameGroup(input, FRAME_FIELDS.viewport),
    visual: makeFrameGroup(input, FRAME_FIELDS.visual),
    interaction: makeFrameGroup(input, FRAME_FIELDS.interaction),
    folder: makeFrameGroup(input, FRAME_FIELDS.folder),
    diagnostics: makeFrameGroup(input, FRAME_FIELDS.diagnostics),
  });
  assertDesktopSceneFrame(frame);
  return frame;
}

/** Validate exact groups, exact field ownership, value types, and deep immutability. */
export function assertDesktopSceneFrame(frame: unknown): asserts frame is DesktopSceneFrame {
  if (!isPlainRecord(frame)) throw new TypeError("DesktopSceneFrame must be an object");
  const rootKeys = Object.keys(frame);
  if (
    rootKeys.length !== FRAME_GROUPS.length
    || rootKeys.some((key) => !FRAME_GROUPS.includes(key as FrameGroupName))
  ) {
    throw new TypeError("DesktopSceneFrame contains unsupported groups");
  }
  if (!Object.isFrozen(frame)) throw new TypeError("DesktopSceneFrame must be immutable");

  for (const group of FRAME_GROUPS) {
    const value = frame[group];
    if (!isPlainRecord(value)) throw new TypeError(`DesktopSceneFrame.${group} must be an object`);
    const expectedFields: readonly FrameFieldName[] = FRAME_FIELDS[group];
    const keys = Object.keys(value);
    if (keys.length !== expectedFields.length || keys.some((key) => !expectedFields.includes(key as FrameFieldName))) {
      throw new TypeError(`DesktopSceneFrame.${group} contains unsupported fields`);
    }
    if (!Object.isFrozen(value)) throw new TypeError(`DesktopSceneFrame.${group} must be immutable`);
    for (const field of expectedFields) {
      const fieldValue = value[field];
      assertContractSnapshot(fieldValue, `DesktopSceneFrame.${group}.${field}`);
      optional(fieldValue, `DesktopSceneFrame.${group}.${field}`, FIELD_VALIDATORS[field]);
    }
  }
}

/** Surface-only guard: composition roots publish every field, including explicit nulls. */
export function assertCompleteDesktopSceneFrame(
  frame: unknown,
): asserts frame is CompleteDesktopSceneFrame {
  assertDesktopSceneFrame(frame);
  for (const group of FRAME_GROUPS) {
    for (const field of FRAME_FIELDS[group]) {
      if (Reflect.get(frame[group], field) === undefined) {
        throw new TypeError(`DesktopSceneFrame.${group}.${field} must be published by the surface composition root`);
      }
    }
  }
}
