import { reloadOnPixiHotUpdate } from "../devHmr.js";

function positiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const ICON_VISUAL_SPEC_EPSILON = 0.5;

export function makeIconVisualSpec(options = {}) {
  if (!options || typeof options !== "object") return null;
  const iconSize = positiveNumber(options.iconSize);
  if (!iconSize) return null;
  return {
    cellHeight: Math.max(iconSize, positiveNumber(options.cellHeight, iconSize)),
    cellWidth: Math.max(iconSize, positiveNumber(options.cellWidth, iconSize)),
    compact: options.compact === true,
    iconSize,
    singleLineLabel: options.singleLineLabel === true,
    textless: options.textless === true,
  };
}

export function cloneIconVisualSpec(spec) {
  return makeIconVisualSpec(spec);
}

export function makeIconVisualSpecKey(spec) {
  if (!spec) return "";
  return [
    Number(spec.cellHeight) || 0,
    Number(spec.cellWidth) || 0,
    Number(spec.iconSize) || 0,
    spec.compact === true ? 1 : 0,
    spec.singleLineLabel === true ? 1 : 0,
    spec.textless === true ? 1 : 0,
  ].join(":");
}

export function interpolateIconVisualSpec(sourceSpec, targetSpec, progress = 0) {
  const source = makeIconVisualSpec(sourceSpec) || makeIconVisualSpec(targetSpec);
  const target = makeIconVisualSpec(targetSpec) || source;
  if (!source || !target) return source || target || null;
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  return {
    cellHeight: source.cellHeight + (target.cellHeight - source.cellHeight) * t,
    cellWidth: source.cellWidth + (target.cellWidth - source.cellWidth) * t,
    compact: t >= 0.5 ? target.compact : source.compact,
    iconSize: source.iconSize + (target.iconSize - source.iconSize) * t,
    singleLineLabel: t >= 0.5 ? target.singleLineLabel : source.singleLineLabel,
    textless: t >= 0.5 ? target.textless : source.textless,
  };
}

export function makeIconVisualSpecFromNodeState(state = {}) {
  return makeIconVisualSpec({
    cellHeight: state.cellHeight,
    cellWidth: state.cellWidth,
    compact: state.compact,
    iconSize: state.iconSize,
    singleLineLabel: state.singleLineLabel,
    textless: state.textless,
  });
}

export function hasIconVisualSpecMismatch(sourceSpec, targetSpec, epsilon = ICON_VISUAL_SPEC_EPSILON) {
  if (!sourceSpec || !targetSpec) return false;
  const numericFields = ["cellHeight", "cellWidth", "iconSize"];
  if (numericFields.some((field) => (
    sourceSpec[field] != null &&
    targetSpec[field] != null &&
    Math.abs(Number(sourceSpec[field]) - Number(targetSpec[field])) > epsilon
  ))) return true;
  return ["compact", "singleLineLabel", "textless"].some((field) => (
    sourceSpec[field] != null &&
    targetSpec[field] != null &&
    Boolean(sourceSpec[field]) !== Boolean(targetSpec[field])
  ));
}

reloadOnPixiHotUpdate(import.meta.hot);
