import { reloadOnPixiHotUpdate } from "../devHmr.js";

function positiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

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

reloadOnPixiHotUpdate(import.meta.hot);
