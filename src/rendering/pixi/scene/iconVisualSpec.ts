import { reloadOnPixiHotUpdate } from "../devHmr.js";

export type IconVisualSpec = Readonly<{
  cellHeight: number;
  cellWidth: number;
  compact: boolean;
  iconSize: number;
  singleLineLabel: boolean;
  textless: boolean;
}>;

type UnknownRecord = Readonly<Record<string, unknown>>;

const ICON_VISUAL_SPEC_EPSILON = 0.5;
const NUMERIC_VISUAL_SPEC_FIELDS = Object.freeze([
  "cellHeight",
  "cellWidth",
  "iconSize",
] as const);
const BOOLEAN_VISUAL_SPEC_FIELDS = Object.freeze([
  "compact",
  "singleLineLabel",
  "textless",
] as const);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown, fallback: number | null = null): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : fallback;
}

export function makeIconVisualSpec(options: unknown = {}): IconVisualSpec | null {
  if (!isRecord(options)) return null;
  const iconSize = positiveNumber(options.iconSize);
  if (iconSize === null) return null;
  return {
    cellHeight: Math.max(iconSize, positiveNumber(options.cellHeight, iconSize) ?? iconSize),
    cellWidth: Math.max(iconSize, positiveNumber(options.cellWidth, iconSize) ?? iconSize),
    compact: options.compact === true,
    iconSize,
    singleLineLabel: options.singleLineLabel === true,
    textless: options.textless === true,
  };
}

export function makeIconVisualSpecKey(spec: IconVisualSpec | null | undefined): string {
  if (!spec) return "";
  return [
    spec.cellHeight,
    spec.cellWidth,
    spec.iconSize,
    spec.compact ? 1 : 0,
    spec.singleLineLabel ? 1 : 0,
    spec.textless ? 1 : 0,
  ].join(":");
}

export function interpolateIconVisualSpec(
  sourceSpec: unknown,
  targetSpec: unknown,
  progress: unknown = 0,
): IconVisualSpec | null {
  const source = makeIconVisualSpec(sourceSpec) ?? makeIconVisualSpec(targetSpec);
  const target = makeIconVisualSpec(targetSpec) ?? source;
  if (!source || !target) return source ?? target;
  const t = Math.max(0, Math.min(1, finiteNumber(progress) ?? 0));
  return {
    cellHeight: source.cellHeight + (target.cellHeight - source.cellHeight) * t,
    cellWidth: source.cellWidth + (target.cellWidth - source.cellWidth) * t,
    compact: t >= 0.5 ? target.compact : source.compact,
    iconSize: source.iconSize + (target.iconSize - source.iconSize) * t,
    singleLineLabel: t >= 0.5 ? target.singleLineLabel : source.singleLineLabel,
    textless: t >= 0.5 ? target.textless : source.textless,
  };
}

export function makeIconVisualSpecFromNodeState(state: unknown = {}): IconVisualSpec | null {
  return makeIconVisualSpec(state);
}

export function hasIconVisualSpecMismatch(
  sourceSpec: unknown,
  targetSpec: unknown,
  epsilon: unknown = ICON_VISUAL_SPEC_EPSILON,
): boolean {
  if (!isRecord(sourceSpec) || !isRecord(targetSpec)) return false;
  const tolerance = Math.max(0, finiteNumber(epsilon) ?? ICON_VISUAL_SPEC_EPSILON);
  if (NUMERIC_VISUAL_SPEC_FIELDS.some((field) => {
    const sourceValue = finiteNumber(sourceSpec[field]);
    const targetValue = finiteNumber(targetSpec[field]);
    return sourceValue !== null && targetValue !== null && Math.abs(sourceValue - targetValue) > tolerance;
  })) return true;
  return BOOLEAN_VISUAL_SPEC_FIELDS.some((field) => (
    typeof sourceSpec[field] === "boolean" &&
    typeof targetSpec[field] === "boolean" &&
    sourceSpec[field] !== targetSpec[field]
  ));
}

reloadOnPixiHotUpdate(import.meta.hot);
