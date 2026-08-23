import { reloadOnPixiHotUpdate } from "../devHmr.js";
import type { StageProjectionMeta, StageRect, StageVisualRect } from "./stageCoordinates.js";

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

export type IconBoundsKind = typeof ICON_BOUNDS_KIND[keyof typeof ICON_BOUNDS_KIND];
export type IconBoundsVariant = typeof ICON_BOUNDS_VARIANT[keyof typeof ICON_BOUNDS_VARIANT];
type StableStageLayoutVariant = typeof ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT;
type ClientBoundsVariant = Exclude<IconBoundsVariant, StableStageLayoutVariant>;
type StableIconBoundsMeta = IconBoundsMeta & Required<StageProjectionMeta>;

export interface LaunchBoundsKeyInput {
  area?: string | null | undefined;
  folderId?: string | number | null | undefined;
  id?: string | number | null | undefined;
  pageIndex?: unknown;
}

export interface PreviewChildBoundsKeyInput {
  childId?: string | number | null | undefined;
  folderId?: string | number | null | undefined;
  slotIndex?: string | number | null | undefined;
}

type IconBoundsObjectKeyInput = LaunchBoundsKeyInput & PreviewChildBoundsKeyInput;
export type IconBoundsKeyInput = string | number | IconBoundsObjectKeyInput | null | undefined;

export interface IconBoundsMeta extends StageProjectionMeta {
  area?: string | null;
  folderId?: string | null;
  id?: string | null;
  index?: number | null;
  pageIndex?: number | null;
}

export interface IconBoundsRect extends StageVisualRect {}

export interface IconBoundsRecord extends IconBoundsRect {
  meta: IconBoundsMeta;
}

export interface StableIconBoundsRecord extends IconBoundsRecord {
  meta: StableIconBoundsMeta;
}

export interface IconBoundsGetOptions {
  expected?: IconBoundsMeta;
  owner?: string;
  warnIfMissing?: boolean;
}

export interface IconBoundsPointOptions {
  area?: string;
  excludeId?: string | number | null;
  folderId?: string | null;
}

export interface IconBoundsHit {
  id: string;
  key?: string;
  meta?: IconBoundsMeta;
  rect: IconBoundsRect;
}

export interface IconBoundsClearCriteria {
  area?: string | null;
  folderId?: string | null;
  kind?: IconBoundsKind | null;
  variant?: IconBoundsVariant | null;
}

export type IconBoundsClearScope = string | IconBoundsClearCriteria | null;

type IconBoundsStore = Map<string, IconBoundsRecord>;
type IconBoundsStores = Map<string, IconBoundsStore>;

export interface IconBoundsRegistry {
  clearBounds(scope?: IconBoundsClearScope, folderId?: string | null): void;
  getAtPoint(kind: IconBoundsKind, x: number, y: number, options?: IconBoundsPointOptions): IconBoundsHit | null;
  getBounds(
    kind: IconBoundsKind,
    variant: StableStageLayoutVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): StableIconBoundsRecord | null;
  getBounds(
    kind: IconBoundsKind,
    variant: ClientBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): IconBoundsRect | null;
  getBounds(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): IconBoundsRect | IconBoundsRecord | null;
  getRecord(
    kind: IconBoundsKind,
    variant: StableStageLayoutVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): StableIconBoundsRecord | null;
  getRecord(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): IconBoundsRecord | null;
  getVersion(): number;
  makeKey: typeof makeIconBoundsKey;
  registerBounds(
    kind: IconBoundsKind,
    variant: StableStageLayoutVariant,
    keyInput: IconBoundsKeyInput,
    rect: StageRect | null | undefined,
    meta: StableIconBoundsMeta
  ): void;
  registerBounds(
    kind: IconBoundsKind,
    variant: ClientBoundsVariant,
    keyInput: IconBoundsKeyInput,
    rect: StageRect | null | undefined,
    meta?: IconBoundsMeta
  ): void;
  transaction<T>(callback: () => T): T;
}

const ALL_KINDS = Object.freeze(Object.values(ICON_BOUNDS_KIND) as IconBoundsKind[]);
const ALL_VARIANTS = Object.freeze(Object.values(ICON_BOUNDS_VARIANT) as IconBoundsVariant[]);
const EXPECTED_META_KEYS = Object.freeze(["area", "folderId", "id", "index", "pageIndex"] as const);

function isDevMode() {
  return Boolean(import.meta.env?.DEV);
}

function makeLaunchBoundsKey(source: LaunchBoundsKeyInput | null | undefined): string | null {
  if (!source?.id || !source.area) return null;
  const pageIndex = Number.isFinite(Number(source.pageIndex)) ? Number(source.pageIndex) : 0;
  const folderId = source.area === "folder" ? source.folderId || "" : "";
  return `${source.area}:${folderId}:${pageIndex}:${source.id}`;
}

function makeTopLevelBoundsKey(id: unknown): string | null {
  return id ? String(id) : null;
}

function makeFolderPreviewChildBoundsKey(
  folderId: string | number | null | undefined,
  childId: string | number | null | undefined,
  slotIndex: string | number | null | undefined
): string | null {
  if (!folderId || !childId) return null;
  return `${folderId}:${childId}:${slotIndex}`;
}

export function makeIconBoundsKey(kind: string, value: IconBoundsKeyInput): string | null {
  if (kind === ICON_BOUNDS_KIND.LAUNCH) {
    return makeLaunchBoundsKey(typeof value === "object" ? value : null);
  }
  if (kind === ICON_BOUNDS_KIND.TOP_LEVEL || kind === ICON_BOUNDS_KIND.FOLDER_THUMB) {
    return makeTopLevelBoundsKey(value);
  }
  if (kind === ICON_BOUNDS_KIND.PREVIEW_CHILD) {
    const source = typeof value === "object" ? value : null;
    return makeFolderPreviewChildBoundsKey(source?.folderId, source?.childId, source?.slotIndex);
  }
  return null;
}

function storeKey(kind: IconBoundsKind, variant: IconBoundsVariant): string {
  return `${kind}:${variant}`;
}

function createStores(): IconBoundsStores {
  const stores: IconBoundsStores = new Map();
  for (const kind of ALL_KINDS) {
    for (const variant of ALL_VARIANTS) {
      stores.set(storeKey(kind, variant), new Map());
    }
  }
  return stores;
}

function cloneRect(rect: StageRect | null | undefined): IconBoundsRect | null {
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

function cloneMeta(meta: IconBoundsMeta | null | undefined = {}): IconBoundsMeta {
  return { ...(meta || {}) };
}

function makeBoundsRecord(
  rect: StageRect | null | undefined,
  meta: IconBoundsMeta = {}
): IconBoundsRecord | null {
  const safeRect = cloneRect(rect);
  if (!safeRect) return null;
  return { ...safeRect, meta: cloneMeta(meta) };
}

function makeStageLayoutRecord(
  rect: StageRect | null | undefined,
  meta: IconBoundsMeta = {}
): StableIconBoundsRecord | null {
  const safeRect = cloneRect(rect);
  if (!safeRect) return null;
  assertStableProjectionMeta(meta);
  return {
    ...safeRect,
    meta: {
      ...cloneMeta(meta),
      stageHeight: meta.stageHeight,
      stageRect: meta.stageRect,
      stageWidth: meta.stageWidth,
    },
  };
}

function isFiniteStageRect(rect: StageRect | null | undefined): rect is StageRect {
  return Boolean(
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function assertStableProjectionMeta(meta: IconBoundsMeta): asserts meta is StableIconBoundsMeta {
  if (
    !isFiniteStageRect(meta.stageRect) ||
    !Number.isFinite(meta.stageWidth) ||
    !Number.isFinite(meta.stageHeight) ||
    Number(meta.stageWidth) <= 0 ||
    Number(meta.stageHeight) <= 0
  ) {
    throw new TypeError(
      "stable stage-layout bounds require a positive stage size and a finite, positive stage rectangle"
    );
  }
}

function sameRect(left: StageRect | null | undefined, right: StageRect | null | undefined): boolean {
  if (!left || !right) return false;
  return left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height;
}

function sameStageProjectionMeta(
  left: IconBoundsMeta | null | undefined,
  right: IconBoundsMeta | null | undefined
): boolean {
  const leftStageRect = left?.stageRect;
  const rightStageRect = right?.stageRect;
  return left?.stageWidth === right?.stageWidth &&
    left?.stageHeight === right?.stageHeight &&
    leftStageRect?.left === rightStageRect?.left &&
    leftStageRect?.top === rightStageRect?.top &&
    leftStageRect?.width === rightStageRect?.width &&
    leftStageRect?.height === rightStageRect?.height;
}

function hasGeometryChanged(
  previous: IconBoundsRecord | null | undefined,
  next: IconBoundsRecord,
  variant: IconBoundsVariant
): boolean {
  if (!previous) return true;
  if (!sameRect(previous, next)) return true;
  if (variant === ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT) {
    return !sameStageProjectionMeta(previous.meta, next.meta);
  }
  return false;
}

function cloneBoundsRecord(record: IconBoundsRecord | null | undefined): IconBoundsRecord | null {
  if (!record) return null;
  const safeRect = cloneRect(record);
  if (!safeRect) return null;
  return {
    ...safeRect,
    meta: cloneMeta(record.meta),
  };
}

function cloneStableBoundsRecord(
  record: IconBoundsRecord | null | undefined
): StableIconBoundsRecord | null {
  if (!record) return null;
  const safeRect = cloneRect(record);
  if (!safeRect) return null;
  assertStableProjectionMeta(record.meta);
  return {
    ...safeRect,
    meta: {
      ...cloneMeta(record.meta),
      stageHeight: record.meta.stageHeight,
      stageRect: record.meta.stageRect,
      stageWidth: record.meta.stageWidth,
    },
  };
}

function normalizeClearScope(
  scope: IconBoundsClearScope,
  folderId: string | null
): Required<IconBoundsClearCriteria> {
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

function shouldClearLaunchRecord(key: string, value: IconBoundsRecord, criteria: IconBoundsClearCriteria): boolean {
  if (!criteria.area && criteria.folderId == null) return true;
  if (criteria.area && !key.startsWith(`${criteria.area}:`)) return false;
  if (criteria.folderId == null) return true;
  const folderId = String(criteria.folderId);
  return value?.meta?.folderId === folderId || key.startsWith(`folder:${folderId}:`);
}

function shouldClearMetaRecord(value: IconBoundsRecord, criteria: IconBoundsClearCriteria): boolean {
  if (!criteria.area && criteria.folderId == null) return true;
  if (criteria.area && value?.meta?.area !== criteria.area) return false;
  if (criteria.folderId == null) return true;
  return value?.meta?.folderId === String(criteria.folderId);
}

function shouldClearPreviewChildKey(key: string, criteria: IconBoundsClearCriteria): boolean {
  if (!criteria.folderId) return true;
  return key.startsWith(`${criteria.folderId}:`);
}

function hasExpectedMetaShape(value: IconBoundsMeta | IconBoundsGetOptions): value is IconBoundsMeta {
  const meta = value as IconBoundsMeta;
  return EXPECTED_META_KEYS.some((key) => meta[key] != null);
}

function normalizeGetOptions(
  options: IconBoundsGetOptions | IconBoundsMeta | null = {}
): IconBoundsGetOptions {
  if (!options) return {};
  const getOptions = options as IconBoundsGetOptions;
  if (getOptions.expected || getOptions.warnIfMissing || getOptions.owner) return getOptions;
  if (hasExpectedMetaShape(options)) return { expected: options };
  return options;
}

function matchesExpectedMeta(
  meta: IconBoundsMeta | null | undefined,
  expected: IconBoundsMeta | null | undefined
): boolean {
  if (!expected) return true;
  for (const key of EXPECTED_META_KEYS) {
    if (expected[key] == null) continue;
    if (meta?.[key] !== expected[key]) return false;
  }
  return true;
}

function rectContainsPoint(rect: IconBoundsRect | null | undefined, x: number, y: number): boolean {
  if (!rect) return false;
  return x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom;
}

export function createIconBoundsRegistry(): IconBoundsRegistry {
  const stores = createStores();
  const missingWarnings = new Set<string>();
  let version = 0;
  let transactionDepth = 0;
  let transactionSnapshot: IconBoundsStores | null = null;

  function cloneStores(): IconBoundsStores {
    return new Map(Array.from(stores, ([key, store]) => [key, new Map(store)]));
  }

  function storesHaveGeometryChanged(previousStores: IconBoundsStores | null): boolean {
    if (!previousStores) return false;
    for (const kind of ALL_KINDS) {
      for (const variant of ALL_VARIANTS) {
        const key = storeKey(kind, variant);
        const previous = previousStores.get(key) || new Map();
        const current = stores.get(key) || new Map();
        if (previous.size !== current.size) return true;
        for (const [recordKey, record] of current) {
          const previousRecord = previous.get(recordKey);
          if (hasGeometryChanged(previousRecord, record, variant)) return true;
        }
      }
    }
    return false;
  }

  function markGeometryChanged(): void {
    if (transactionDepth === 0) version += 1;
  }

  function transaction<T>(callback: () => T): T {
    if (typeof callback !== "function") {
      throw new TypeError("icon bounds transactions require a callback");
    }
    if (transactionDepth === 0) transactionSnapshot = cloneStores();
    transactionDepth += 1;
    try {
      return callback();
    } finally {
      transactionDepth -= 1;
      if (transactionDepth === 0) {
        if (storesHaveGeometryChanged(transactionSnapshot)) version += 1;
        transactionSnapshot = null;
      }
    }
  }

  function getStore(kind: IconBoundsKind, variant: IconBoundsVariant): IconBoundsStore | null {
    return stores.get(storeKey(kind, variant)) || null;
  }

  function warnMissingBounds(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    key: string | null,
    options: IconBoundsGetOptions = {}
  ): void {
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

  function registerBounds(
    kind: IconBoundsKind,
    variant: StableStageLayoutVariant,
    keyInput: IconBoundsKeyInput,
    rect: StageRect | null | undefined,
    meta: StableIconBoundsMeta
  ): void;
  function registerBounds(
    kind: IconBoundsKind,
    variant: ClientBoundsVariant,
    keyInput: IconBoundsKeyInput,
    rect: StageRect | null | undefined,
    meta?: IconBoundsMeta
  ): void;
  function registerBounds(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    rect: StageRect | null | undefined,
    meta: IconBoundsMeta = {}
  ): void {
    const key = makeIconBoundsKey(kind, keyInput);
    const store = getStore(kind, variant);
    if (!key || !store) return;
    const record = variant === ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT
      ? makeStageLayoutRecord(rect, meta)
      : makeBoundsRecord(rect, meta);
    if (!record) return;
    const previous = store.get(key);
    store.set(key, record);
    let changed = hasGeometryChanged(previous, record, variant);
    if (
      kind === ICON_BOUNDS_KIND.LAUNCH &&
      variant === ICON_BOUNDS_VARIANT.RENDERED &&
      typeof keyInput === "object" &&
      keyInput?.area === "desktop"
    ) {
      const topLevelKey = makeIconBoundsKey(ICON_BOUNDS_KIND.TOP_LEVEL, keyInput.id);
      if (topLevelKey) {
        const topLevelStore = getStore(ICON_BOUNDS_KIND.TOP_LEVEL, ICON_BOUNDS_VARIANT.RENDERED);
        const previousTopLevel = topLevelStore?.get(topLevelKey);
        topLevelStore?.set(topLevelKey, record);
        changed = changed || hasGeometryChanged(previousTopLevel, record, ICON_BOUNDS_VARIANT.RENDERED);
      }
    }
    if (changed) markGeometryChanged();
  }

  function getRecord(
    kind: IconBoundsKind,
    variant: StableStageLayoutVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): StableIconBoundsRecord | null;
  function getRecord(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): IconBoundsRecord | null;
  function getRecord(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options: IconBoundsGetOptions | IconBoundsMeta | null = {}
  ): IconBoundsRecord | null {
    const normalizedOptions = normalizeGetOptions(options);
    const key = makeIconBoundsKey(kind, keyInput);
    const store = getStore(kind, variant);
    const value = key && store ? store.get(key) : null;
    if (!value) warnMissingBounds(kind, variant, key, normalizedOptions);
    if (!value || !matchesExpectedMeta(value.meta, normalizedOptions.expected)) return null;
    return variant === ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT
      ? cloneStableBoundsRecord(value)
      : cloneBoundsRecord(value);
  }

  function getBounds(
    kind: IconBoundsKind,
    variant: StableStageLayoutVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): StableIconBoundsRecord | null;
  function getBounds(
    kind: IconBoundsKind,
    variant: ClientBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): IconBoundsRect | null;
  function getBounds(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options?: IconBoundsGetOptions | IconBoundsMeta | null
  ): IconBoundsRect | IconBoundsRecord | null;
  function getBounds(
    kind: IconBoundsKind,
    variant: IconBoundsVariant,
    keyInput: IconBoundsKeyInput,
    options: IconBoundsGetOptions | IconBoundsMeta | null = {}
  ): IconBoundsRect | IconBoundsRecord | null {
    const record = getRecord(kind, variant, keyInput, options);
    if (!record) return null;
    return variant === ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT
      ? record
      : cloneRect(record);
  }

  function getAtPoint(
    kind: IconBoundsKind,
    x: number,
    y: number,
    options: IconBoundsPointOptions = {}
  ): IconBoundsHit | null {
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
      const clonedRect = cloneRect(rect);
      if (!clonedRect) continue;
      if (kind === ICON_BOUNDS_KIND.TOP_LEVEL) return { id, rect: clonedRect };
      return {
        id,
        key,
        meta: cloneMeta(meta),
        rect: clonedRect,
      };
    }
    return null;
  }

  function clearSpecificKind(criteria: Required<IconBoundsClearCriteria>): void {
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

  function clearTopLevelDesktopRecords(
    criteria: Required<IconBoundsClearCriteria>,
    shouldClearAll: boolean
  ): void {
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
      if (!store) continue;
      for (const [key, value] of store || []) {
        if (shouldClearMetaRecord(value, criteria)) store.delete(key);
      }
    }
  }

  function clearBounds(scope: IconBoundsClearScope = null, folderId: string | null = null): void {
    return transaction(() => {
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
        if (!store) continue;
        for (const [key, value] of store || []) {
          if (shouldClearLaunchRecord(key, value, criteria)) store.delete(key);
        }
      }
      clearTopLevelDesktopRecords(criteria, shouldClearAll);
    });
  }

  return {
    clearBounds,
    getAtPoint,
    getBounds,
    getRecord,
    getVersion: () => version,
    makeKey: makeIconBoundsKey,
    registerBounds,
    transaction,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
